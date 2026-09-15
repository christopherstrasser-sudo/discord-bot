const fs = require('fs');
const path = require('path');

const CACHE_MS = 60_000;
const HANDLE_CACHE_MS = 24 * 60 * 60 * 1000;
const MAX_BODY = 2_000_000;
const DEFAULT_POOL_SIZE = 1;

const resultCache = new Map();
const slots = [];
let rr = 0;
let handleCacheLoaded = false;
let handleCache = {};

function optionalEnv(name) {
  return String(process.env[name] || '').trim();
}

function clampPoolSize(value) {
  const n = Number(value || DEFAULT_POOL_SIZE);
  return Number.isFinite(n) ? Math.max(1, Math.min(Math.floor(n), 3)) : DEFAULT_POOL_SIZE;
}

function dataRoot() {
  return path.join(process.cwd(), 'data', 'tiktok-collector');
}

function handleCachePath() {
  return path.join(dataRoot(), 'handles.json');
}

function ensureRoot() {
  fs.mkdirSync(dataRoot(), { recursive: true });
}

function loadHandleCache() {
  if (handleCacheLoaded) return;
  handleCacheLoaded = true;
  try {
    const raw = JSON.parse(fs.readFileSync(handleCachePath(), 'utf8'));
    handleCache = raw && typeof raw === 'object' ? raw : {};
  } catch {
    handleCache = {};
  }
}

function saveHandleCache() {
  ensureRoot();
  const target = handleCachePath();
  const tmp = `${target}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(handleCache, null, 2));
  fs.renameSync(tmp, target);
}

function cachedHandle(source) {
  loadHandleCache();
  const entry = handleCache[source];
  if (!entry || !entry.secUid || Date.now() - Number(entry.updatedAt || 0) > HANDLE_CACHE_MS) return null;
  return entry;
}

function rememberHandle(source, profile) {
  if (!profile?.secUid) return;
  loadHandleCache();
  handleCache[source] = {
    secUid: String(profile.secUid),
    creator: String(profile.creator || source),
    avatar: String(profile.avatar || ''),
    updatedAt: Date.now()
  };
  try { saveHandleCache(); } catch {}
}

function profileFromScope(scope, source) {
  const detail = scope?.['webapp.user-detail'] || {};
  const info = detail.userInfo || {};
  const user = info.user || {};
  const stats = info.stats || info.statsV2 || {};
  const rawCount = stats.videoCount;
  const videoCountKnown = rawCount !== undefined && rawCount !== null && String(rawCount).trim() !== '';
  return {
    creator: String(user.nickname || user.uniqueId || source),
    avatar: String(user.avatarLarger || user.avatarMedium || user.avatarThumb || ''),
    secUid: String(user.secUid || ''),
    videoCountKnown,
    videoCount: videoCountKnown ? Number(rawCount || 0) : 0
  };
}

function postItemsFromAny(data) {
  if (!data || typeof data !== 'object') return [];
  const direct = [
    data.itemList,
    data.item_list,
    data.items,
    data.aweme_list,
    data.data?.itemList,
    data.data?.item_list,
    data.data?.items,
    data.data?.aweme_list
  ];
  for (const list of direct) if (Array.isArray(list) && list.length) return list;
  return [];
}

function collectorStatus() {
  return {
    poolSize: clampPoolSize(optionalEnv('TIKTOK_COLLECTOR_POOL_SIZE')),
    slots: slots.map((slot, index) => ({
      index,
      ready: Boolean(slot?.browser && slot?.page),
      failures: Number(slot?.failures || 0),
      lastSuccessAt: slot?.lastSuccessAt || null,
      lastError: slot?.lastError || ''
    }))
  };
}

async function launchSlot(index, deps) {
  ensureRoot();
  const executablePath = deps.findBrowserExecutable();
  if (!executablePath) throw new Error('Kein lokaler Edge/Chrome für den TikTok Collector gefunden.');
  const mod = await import('puppeteer-core');
  const puppeteer = mod.default || mod;
  const userDataDir = path.join(dataRoot(), `session-${index + 1}`);
  fs.mkdirSync(userDataDir, { recursive: true });
  const args = [
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-dev-shm-usage',
    `--lang=${deps.language()}-${deps.region()}`,
    '--window-size=1280,900'
  ];
  if (typeof process.getuid === 'function' && process.getuid() === 0) args.push('--no-sandbox');

  const browser = await puppeteer.launch({
    executablePath,
    headless: true,
    userDataDir,
    args
  });

  const existing = (await browser.pages())[0];
  const page = existing || await browser.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  await page.setExtraHTTPHeaders({
    'Accept-Language': `${deps.language()}-${deps.region()},${deps.language()};q=0.9,en;q=0.7`
  });
  await page.emulateTimezone(optionalEnv('CREATOR_DEFAULT_TIMEZONE') || 'Europe/Berlin').catch(() => {});

  const slot = {
    browser,
    page,
    warmed: false,
    failures: 0,
    lastSuccessAt: null,
    lastError: '',
    chain: Promise.resolve()
  };
  slots[index] = slot;
  browser.on('disconnected', () => {
    if (slots[index] === slot) slots[index] = null;
  });
  return slot;
}

async function getSlot(index, deps) {
  const existing = slots[index];
  if (existing?.browser?.connected && existing.page && !existing.page.isClosed()) return existing;
  return launchSlot(index, deps);
}

async function warmSlot(slot) {
  if (slot.warmed && /tiktok\.com/i.test(slot.page.url())) return;
  await slot.page.goto('https://www.tiktok.com/', {
    waitUntil: 'domcontentloaded',
    timeout: 25_000
  });
  await new Promise(resolve => setTimeout(resolve, 2500));
  slot.warmed = true;
}

async function profileState(page, source) {
  return page.evaluate(handle => {
    let scope = {};
    try {
      const el = document.getElementById('__UNIVERSAL_DATA_FOR_REHYDRATION__');
      if (el?.textContent) scope = JSON.parse(el.textContent).__DEFAULT_SCOPE__ || {};
    } catch {}
    const detail = scope['webapp.user-detail'] || {};
    const info = detail.userInfo || {};
    const user = info.user || {};
    const stats = info.stats || info.statsV2 || {};
    const rawCount = stats.videoCount;
    const anchors = [...document.querySelectorAll('a[href*="/video/"], a[href*="/photo/"]')];
    const domItems = [];
    const seen = new Set();
    for (const anchor of anchors) {
      const href = anchor.href || anchor.getAttribute('href') || '';
      const match = href.match(/\/\@([^/]+)\/(video|photo)\/(\d+)/i);
      if (!match || match[1].toLowerCase() !== handle.toLowerCase() || seen.has(match[3])) continue;
      seen.add(match[3]);
      const card = anchor.closest('[data-e2e="user-post-item"]') || anchor.closest('[data-e2e*="post-item"]') || anchor.parentElement || anchor;
      const image = card.querySelector?.('img');
      domItems.push({
        id: match[3],
        desc: image?.alt || anchor.getAttribute('aria-label') || '',
        video: { cover: image?.currentSrc || image?.src || '' },
        imagePost: match[2].toLowerCase() === 'photo' ? { images: [{}] } : undefined,
        author: { uniqueId: handle }
      });
    }
    return {
      scope,
      profile: {
        creator: String(user.nickname || user.uniqueId || handle),
        avatar: String(user.avatarLarger || user.avatarMedium || user.avatarThumb || ''),
        secUid: String(user.secUid || ''),
        videoCountKnown: rawCount !== undefined && rawCount !== null && String(rawCount).trim() !== '',
        videoCount: rawCount === undefined || rawCount === null ? 0 : Number(rawCount || 0)
      },
      domItems,
      pageUrl: location.href,
      title: document.title,
      bodyText: String(document.body?.innerText || '').slice(0, 5000)
    };
  }, source);
}

async function sameOriginPostFetch(page, source, secUid, deps) {
  return page.evaluate(async ({ handle, secUidValue, lang, reg, maxBody }) => {
    let app = {};
    try {
      const el = document.getElementById('__UNIVERSAL_DATA_FOR_REHYDRATION__');
      const scope = el?.textContent ? (JSON.parse(el.textContent).__DEFAULT_SCOPE__ || {}) : {};
      app = scope['webapp.app-context'] || {};
    } catch {}

    const params = new URLSearchParams();
    if (app.wid) params.set('device_id', String(app.wid));
    if (app.odinId) params.set('odinId', String(app.odinId));
    if (app.webIdCreatedTime) params.set('WebIdLastTime', String(app.webIdCreatedTime));
    params.set('aid', '1988');
    params.set('app_name', 'tiktok_web');
    params.set('app_language', lang);
    params.set('browser_language', navigator.language || `${lang}-${reg}`);
    params.set('browser_name', 'Mozilla');
    params.set('browser_online', String(navigator.onLine));
    params.set('browser_platform', navigator.platform || 'Win32');
    params.set('browser_version', navigator.userAgent || '');
    params.set('channel', 'tiktok_web');
    params.set('cookie_enabled', String(navigator.cookieEnabled));
    params.set('count', '30');
    params.set('cursor', '0');
    params.set('coverFormat', '2');
    params.set('device_platform', 'web_pc');
    params.set('focus_state', 'true');
    params.set('from_page', 'user');
    params.set('history_len', String(Math.max(1, history.length)));
    params.set('is_fullscreen', 'false');
    params.set('is_page_visible', document.visibilityState === 'visible' ? 'true' : 'false');
    params.set('priority_region', reg);
    params.set('region', reg);
    params.set('screen_height', String(screen.height || 900));
    params.set('screen_width', String(screen.width || 1280));
    params.set('secUid', secUidValue);
    params.set('tz_name', Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Berlin');
    params.set('user_is_login', 'false');
    params.set('webcast_language', lang);

    const cookie = document.cookie || '';
    const fp = cookie.match(/(?:^|;\s*)s_v_web_id=([^;]+)/)?.[1];
    const msToken = cookie.match(/(?:^|;\s*)msToken=([^;]+)/)?.[1];
    if (fp) {
      params.set('verifyFp', fp);
      params.set('fp', fp);
    }
    if (msToken) params.set('msToken', msToken);

    const url = `https://www.tiktok.com/api/post/item_list/?${params.toString()}`;
    try {
      const res = await fetch(url, {
        method: 'GET',
        credentials: 'include',
        headers: { Accept: 'application/json, text/plain, */*' }
      });
      const text = await res.text();
      return { ok: res.ok, status: res.status, body: text.slice(0, maxBody), url, handle };
    } catch (error) {
      return { ok: false, status: -1, body: String(error?.message || error), url, handle };
    }
  }, { handle: source, secUidValue: secUid, lang: deps.language(), reg: deps.region(), maxBody: MAX_BODY });
}

function gateMessage(state) {
  const text = String(state?.bodyText || '');
  const url = String(state?.pageUrl || '');
  if (/captcha|verify|challenge/i.test(url) || /captcha|security verification|sicherheitsüberprüfung|verify to continue|verifiziere/i.test(text)) {
    return 'TikTok zeigt dem Collector eine Verifizierungs-/Captcha-Seite.';
  }
  if (/\/login(?:\/|$)/i.test(url) || /log in to tiktok|bei tiktok anmelden|anmelden bei tiktok/i.test(text)) {
    return 'TikTok zeigt dem Collector eine Login-Wand.';
  }
  return '';
}

async function collectWithSlot(slot, source, deps) {
  const captured = [];
  const responseHandler = async response => {
    const url = response.url();
    if (!url.includes('tiktok.com') || !/\/api\/(?:post|user)\/.*item_list/i.test(url)) return;
    try {
      const text = await response.text();
      if (!text.trim()) return;
      const data = JSON.parse(text);
      captured.push(...postItemsFromAny(data));
    } catch {}
  };

  slot.page.on('response', responseHandler);
  try {
    await warmSlot(slot);
    const target = `https://www.tiktok.com/@${source}?is_from_webapp=1&sender_device=pc`;
    const nav = await slot.page.goto(target, {
      waitUntil: 'domcontentloaded',
      timeout: Math.max(25_000, Number(deps.timeoutMs()) * 2)
    });
    if (nav && [403, 429].includes(nav.status())) throw new Error(`TikTok Collector Profil HTTP ${nav.status()}.`);

    await new Promise(resolve => setTimeout(resolve, 2500));
    for (let i = 0; i < 3; i += 1) {
      if (captured.length) break;
      await slot.page.evaluate(() => window.scrollBy(0, Math.max(window.innerHeight || 900, 900))).catch(() => {});
      await new Promise(resolve => setTimeout(resolve, 800));
    }

    const state = await profileState(slot.page, source);
    const gate = gateMessage(state);
    if (gate) throw new Error(gate);

    const profile = state.profile || profileFromScope(state.scope || {}, source);
    rememberHandle(source, profile);

    let latest = deps.pickLatestUploadFromItems(captured, source);
    if (latest) return { latestUpload: latest, profile, source: 'collector-xhr' };

    latest = deps.pickLatestUploadFromItems(state.domItems || [], source);
    if (latest) return { latestUpload: latest, profile, source: 'collector-dom' };

    try {
      const html = await slot.page.content();
      const parsed = deps.parseProfileDocument(html, source);
      const mergedProfile = { ...profile, ...parsed };
      rememberHandle(source, mergedProfile);
      if (parsed.latestUpload) return { latestUpload: parsed.latestUpload, profile: mergedProfile, source: 'collector-ssr' };
      if (parsed.videoCountKnown && parsed.videoCount === 0) return { latestUpload: null, profile: mergedProfile, source: 'collector-empty' };
    } catch {}

    const remembered = cachedHandle(source);
    const secUid = String(profile?.secUid || remembered?.secUid || '');
    if (!secUid) throw new Error('TikTok Collector konnte keine secUid für den Creator auflösen.');

    let lastApi = null;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      lastApi = await sameOriginPostFetch(slot.page, source, secUid, deps);
      if (lastApi.ok && String(lastApi.body || '').trim()) {
        let data;
        try { data = JSON.parse(lastApi.body); }
        catch { throw new Error(`TikTok Collector Post-API lieferte ungültiges JSON (${lastApi.body.length} Bytes).`); }
        const items = deps.postItemsFromPayload(data);
        latest = deps.pickLatestUploadFromItems(items, source);
        if (latest) return { latestUpload: latest, profile: { ...profile, secUid }, source: 'collector-api' };
      }
      await slot.page.goto('https://www.tiktok.com/', { waitUntil: 'domcontentloaded', timeout: 20_000 }).catch(() => {});
      await new Promise(resolve => setTimeout(resolve, 1600));
      await slot.page.goto(target, { waitUntil: 'domcontentloaded', timeout: 20_000 }).catch(() => {});
      await new Promise(resolve => setTimeout(resolve, 1600));
    }

    if (profile?.videoCountKnown && Number(profile.videoCount) === 0) {
      return { latestUpload: null, profile, source: 'collector-empty' };
    }

    const status = lastApi?.status ?? 'n/a';
    const bytes = String(lastApi?.body || '').length;
    const cookies = await slot.page.cookies('https://www.tiktok.com/').catch(() => []);
    const cookieNames = cookies.map(item => item.name).filter(name => ['ttwid', 's_v_web_id', 'msToken'].includes(name));
    throw new Error(`TikTok Collector bekam keinen Feed (API HTTP ${status}, ${bytes} Bytes, Guest-Cookies ${cookieNames.join(',') || 'keine'}).`);
  } finally {
    slot.page.off('response', responseHandler);
  }
}

async function runOnSlot(index, source, deps) {
  const slot = await getSlot(index, deps);
  const work = async () => {
    try {
      const result = await collectWithSlot(slot, source, deps);
      slot.failures = 0;
      slot.lastSuccessAt = new Date().toISOString();
      slot.lastError = '';
      return result;
    } catch (error) {
      slot.failures += 1;
      slot.lastError = String(error?.message || error).slice(0, 500);
      if (slot.failures >= 5) {
        await slot.browser.close().catch(() => {});
        slots[index] = null;
      }
      throw error;
    }
  };
  const chained = slot.chain.then(work, work);
  slot.chain = chained.catch(() => {});
  return chained;
}

async function fetchTikTokCollectorUpload(source, deps) {
  const cached = resultCache.get(source);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const count = clampPoolSize(optionalEnv('TIKTOK_COLLECTOR_POOL_SIZE'));
  const start = rr++ % count;
  const errors = [];
  for (let step = 0; step < count; step += 1) {
    const index = (start + step) % count;
    try {
      const result = await runOnSlot(index, source, deps);
      resultCache.set(source, { value: result, expiresAt: Date.now() + CACHE_MS });
      return result;
    } catch (error) {
      errors.push(`Session ${index + 1}: ${error?.message || error}`);
    }
  }
  throw new Error(errors.join(' · ') || 'TikTok Collector konnte keinen Feed laden.');
}

module.exports = {
  fetchTikTokCollectorUpload,
  collectorStatus,
  clampPoolSize,
  dataRoot,
  profileFromScope,
  postItemsFromAny
};
