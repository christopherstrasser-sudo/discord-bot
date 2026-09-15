const fs = require('fs');
const path = require('path');

const health = {
  configured: true,
  ok: false,
  lastCheckedAt: null,
  lastSuccessAt: null,
  lastError: '',
  mode: 'built-in',
  capabilities: { live: null, upload: null }
};

let pirateTokPromise = null;
let browserPromise = null;
const profileCache = new Map();
let anonymousSessionCache = { ua: '', cookies: {}, expiresAt: 0 };
const PROFILE_CACHE_MS = 60_000;
const SESSION_CACHE_MS = 10 * 60_000;

function nowIso() {
  return new Date().toISOString();
}

function optionalEnv(name) {
  return String(process.env[name] || '').trim();
}

function setHealth(patch = {}) {
  Object.assign(health, patch, { lastCheckedAt: nowIso() });
}

function getTikTokProviderHealth() {
  return JSON.parse(JSON.stringify({ ...health, configured: true, mode: 'built-in' }));
}

function normalizeTikTokSource(value) {
  let source = String(value || '').trim();
  if (!source) throw new Error('TikTok @Handle fehlt.');
  if (/^(?:https?:\/\/)?(?:www\.)?tiktok\.com\//i.test(source)) {
    const url = new URL(/^https?:\/\//i.test(source) ? source : `https://${source}`);
    const match = decodeURIComponent(url.pathname || '').match(/^\/@([^/?#]+)(?:\/|$)/u);
    if (!match) throw new Error('TikTok: Bitte @Handle oder eine tiktok.com/@handle URL eintragen.');
    source = match[1];
  }
  source = source.replace(/^@/, '').trim().toLowerCase();
  if (!/^[a-z0-9._]{2,30}$/i.test(source)) throw new Error('TikTok: Ungültiger @Handle.');
  return source;
}

async function loadPirateTok() {
  if (!pirateTokPromise) pirateTokPromise = import('piratetok-live-js');
  return pirateTokPromise;
}

function timeoutMs() {
  const raw = Number(optionalEnv('TIKTOK_TIMEOUT_MS') || 12_000);
  return Number.isFinite(raw) ? Math.max(5_000, Math.min(Math.floor(raw), 30_000)) : 12_000;
}

function language() {
  return (optionalEnv('TIKTOK_LANGUAGE') || 'de').slice(0, 2).toLowerCase();
}

function region() {
  return (optionalEnv('TIKTOK_REGION') || 'DE').slice(0, 2).toUpperCase();
}

function extractRehydrationJson(html) {
  const text = String(html || '');
  const match = text.match(/<script[^>]+id=["']__UNIVERSAL_DATA_FOR_REHYDRATION__["'][^>]*>([\s\S]*?)<\/script>/i);
  if (!match?.[1]) throw new Error('TikTok Profil enthält keine auswertbaren Profildaten.');
  try { return JSON.parse(match[1]); }
  catch { throw new Error('TikTok Profildaten konnten nicht gelesen werden.'); }
}

function numberOf(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
}

function imageOf(item) {
  const video = item?.video || item || {};
  const image = item?.imagePost?.images?.[0]?.imageURL?.urlList?.[0];
  return String(image || video.dynamicCover || video.cover || video.originCover || video.coverUrl || '').trim();
}

function looksLikePost(item) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return false;
  const id = String(item.id || '').trim();
  if (!/^\d{8,25}$/.test(id)) return false;
  return Boolean(item.createTime || item.video || item.imagePost || item.stats || item.statsV2 || item.desc);
}

function findPostList(scope) {
  const direct = [
    scope?.['webapp.user-post']?.itemList,
    scope?.['webapp.user-post']?.items,
    scope?.['webapp.user-post-list']?.itemList,
    scope?.['webapp.video-list']?.itemList,
    scope?.['webapp.user-detail']?.userPost?.itemList,
    scope?.['webapp.user-detail']?.userPost?.items
  ];
  for (const list of direct) if (Array.isArray(list)) return list;

  const seen = new Set();
  let best = null;
  let bestScore = 0;
  function walk(value, depth = 0) {
    if (!value || typeof value !== 'object' || depth > 9 || seen.has(value)) return;
    seen.add(value);
    if (Array.isArray(value)) {
      const posts = value.filter(looksLikePost);
      const score = posts.length * 10 + (posts.some(item => item.author || item.video) ? 5 : 0);
      if (posts.length && score > bestScore) {
        best = posts;
        bestScore = score;
      }
      for (const item of value) walk(item, depth + 1);
      return;
    }
    for (const child of Object.values(value)) walk(child, depth + 1);
  }
  walk(scope);
  return best;
}

function tikTokTimeFromId(id) {
  try {
    const seconds = Number(BigInt(String(id)) >> 32n);
    const min = Date.UTC(2015, 0, 1) / 1000;
    const max = Date.now() / 1000 + 366 * 86400;
    return seconds >= min && seconds <= max ? seconds : 0;
  } catch {
    return 0;
  }
}

function pickLatestUploadFromItems(items, source) {
  const filtered = (Array.isArray(items) ? items : []).filter(item => {
    if (!looksLikePost(item)) return false;
    const author = String(item.author?.uniqueId || item.authorUniqueId || '').trim().toLowerCase();
    return !author || author === String(source).toLowerCase();
  });
  const usable = filtered
    .map(item => ({ ...item, __time: numberOf(item.createTime) || tikTokTimeFromId(item.id) }))
    .sort((a, b) => b.__time - a.__time || (BigInt(String(b.id)) > BigInt(String(a.id)) ? 1 : -1));
  const item = usable[0];
  if (!item) return null;
  const id = String(item.id).trim();
  const type = item.imagePost?.images?.length ? 'photo' : 'video';
  return {
    id,
    title: String(item.desc || item.description || item.title || 'Neues TikTok').trim(),
    url: `https://www.tiktok.com/@${source}/${type}/${id}`,
    thumbnail: imageOf(item),
    publishedAt: item.__time ? new Date(item.__time * 1000).toISOString() : '',
    viewers: numberOf(item.stats?.playCount ?? item.statsV2?.playCount ?? item.playCount)
  };
}

function parseProfileDocument(html, source) {
  const blob = extractRehydrationJson(html);
  const scope = blob?.__DEFAULT_SCOPE__ || {};
  const detail = scope['webapp.user-detail'] || {};
  const statusCode = numberOf(detail.statusCode);
  if ([10221, 10223].includes(statusCode)) throw new Error('TikTok Creator wurde nicht gefunden.');
  if (statusCode === 10222) throw new Error('TikTok Profil ist privat.');

  const info = detail.userInfo || {};
  const user = info.user || {};
  const stats = info.stats || {};
  const statsV2 = info.statsV2 || {};
  const itemList = findPostList(scope);
  const videoCountRaw = stats.videoCount ?? statsV2.videoCount;
  const videoCountKnown = videoCountRaw !== undefined && videoCountRaw !== null && String(videoCountRaw).trim() !== '';
  const videoCount = videoCountKnown ? numberOf(videoCountRaw) : 0;
  const latestUpload = Array.isArray(itemList) ? pickLatestUploadFromItems(itemList, source) : null;
  const knownEmpty = videoCountKnown && videoCount === 0;

  return {
    creator: String(user.nickname || user.uniqueId || source),
    avatar: String(user.avatarLarger || user.avatarMedium || user.avatarThumb || ''),
    secUid: String(user.secUid || ''),
    exists: statusCode === 0,
    uploadSupported: Boolean(latestUpload) || knownEmpty,
    latestUpload,
    videoCount,
    videoCountKnown,
    uploadSource: latestUpload ? 'ssr' : (knownEmpty ? 'empty' : '')
  };
}

function responseCookies(headers) {
  const values = typeof headers?.getSetCookie === 'function'
    ? headers.getSetCookie()
    : [headers?.get?.('set-cookie') || ''];
  const result = {};
  for (const line of values || []) {
    for (const match of String(line).matchAll(/(?:^|,\s*)([A-Za-z0-9_]+)=([^;,]*)/g)) {
      const name = match[1];
      if (['ttwid', 'msToken', 'tt_csrf_token', 'passport_csrf_token', 'tt_chain_token'].includes(name)) {
        result[name] = match[2];
      }
    }
  }
  return result;
}

function cookieHeader(cookies) {
  return Object.entries(cookies || {}).filter(([, value]) => value).map(([key, value]) => `${key}=${value}`).join('; ');
}

function postItemsFromPayload(data) {
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
  for (const list of direct) {
    if (Array.isArray(list) && list.some(looksLikePost)) return list;
  }
  return findPostList(data) || [];
}

async function anonymousSession(mod) {
  if (anonymousSessionCache.expiresAt > Date.now() && anonymousSessionCache.ua) return anonymousSessionCache;
  const ua = typeof mod.randomUa === 'function'
    ? mod.randomUa()
    : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs());
  let cookies = {};
  try {
    const response = await fetch('https://www.tiktok.com/', {
      headers: { 'User-Agent': ua, Accept: 'text/html,*/*;q=0.8' },
      redirect: 'manual',
      signal: controller.signal
    });
    cookies = responseCookies(response.headers);
  } catch {
    // Public profile fetch may still work without bootstrap cookies.
  } finally {
    clearTimeout(timer);
  }
  anonymousSessionCache = { ua, cookies, expiresAt: Date.now() + SESSION_CACHE_MS };
  return anonymousSessionCache;
}

function mergeSessionCookies(session, headers) {
  session.cookies = { ...(session.cookies || {}), ...responseCookies(headers) };
  anonymousSessionCache.cookies = session.cookies;
}

async function fetchPostApi(source, profile, session) {
  if (!profile.secUid) throw new Error('TikTok Profil liefert keine secUid für den Upload-Abruf.');
  const url = new URL('https://www.tiktok.com/api/post/item_list/');
  const params = {
    aid: '1988',
    app_name: 'tiktok_web',
    app_language: language(),
    browser_language: `${language()}-${region()}`,
    browser_name: 'Mozilla',
    browser_online: 'true',
    browser_platform: 'Win32',
    channel: 'tiktok_web',
    cookie_enabled: 'true',
    count: '12',
    cursor: '0',
    device_platform: 'web_pc',
    focus_state: 'true',
    from_page: 'user',
    is_fullscreen: 'false',
    is_page_visible: 'true',
    priority_region: region(),
    region: region(),
    screen_height: '1080',
    screen_width: '1920',
    secUid: profile.secUid,
    user_is_login: 'false'
  };
  if (session.cookies?.msToken) params.msToken = session.cookies.msToken;
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs());
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': session.ua,
        Accept: 'application/json, text/plain, */*',
        'Accept-Language': `${language()}-${region()},${language()};q=0.9,en;q=0.7`,
        Referer: `https://www.tiktok.com/@${source}`,
        Cookie: cookieHeader(session.cookies)
      },
      signal: controller.signal
    });
    mergeSessionCookies(session, response.headers);
    if (!response.ok) throw new Error(`TikTok Post-API HTTP ${response.status}.`);
    const text = await response.text();
    let data;
    try { data = JSON.parse(text); }
    catch { throw new Error(`TikTok Post-API lieferte keine gültigen JSON-Daten (HTTP ${response.status}, ${text.length} Bytes).`); }
    const status = numberOf(data.statusCode ?? data.status_code);
    if (status !== 0) throw new Error(`TikTok Post-API Status ${status}.`);
    const items = postItemsFromPayload(data);
    const latest = pickLatestUploadFromItems(items, source);
    if (!latest && profile.videoCountKnown && profile.videoCount === 0) {
      return { latestUpload: null, supported: true, source: 'api-empty' };
    }
    if (!latest) throw new Error('TikTok Post-API lieferte keine verwertbaren Beiträge.');
    return { latestUpload: latest, supported: true, source: 'api' };
  } finally {
    clearTimeout(timer);
  }
}

function browserCandidates() {
  const candidates = [optionalEnv('TIKTOK_BROWSER_PATH')];
  if (process.platform === 'win32') {
    for (const root of [process.env.PROGRAMFILES, process.env['PROGRAMFILES(X86)'], process.env.LOCALAPPDATA]) {
      if (!root) continue;
      candidates.push(
        path.join(root, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
        path.join(root, 'Google', 'Chrome', 'Application', 'chrome.exe')
      );
    }
  } else if (process.platform === 'darwin') {
    candidates.push('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge');
  } else {
    candidates.push('/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/microsoft-edge');
  }
  return [...new Set(candidates.filter(Boolean))];
}

function findBrowserExecutable() {
  return browserCandidates().find(candidate => fs.existsSync(candidate)) || '';
}

async function getBrowser() {
  if (browserPromise) return browserPromise;
  const executablePath = findBrowserExecutable();
  if (!executablePath) throw new Error('Kein lokaler Edge/Chrome für den TikTok Browser-Fallback gefunden.');
  browserPromise = import('puppeteer-core').then(module => {
    const puppeteer = module.default || module;
    const args = [
      '--disable-background-networking',
      '--disable-default-apps',
      '--disable-dev-shm-usage',
      '--disable-extensions',
      '--no-first-run',
      '--no-default-browser-check',
      `--lang=${language()}-${region()}`,
      '--window-size=1280,900'
    ];
    if (typeof process.getuid === 'function' && process.getuid() === 0) args.push('--no-sandbox');
    return puppeteer.launch({ executablePath, headless: true, args });
  }).then(browser => {
    browser.on('disconnected', () => { browserPromise = null; });
    return browser;
  }).catch(error => {
    browserPromise = null;
    throw error;
  });
  return browserPromise;
}

function browserCookieList(session) {
  return Object.entries(session?.cookies || {})
    .filter(([, value]) => Boolean(value))
    .map(([name, value]) => ({
      name,
      value: String(value),
      url: 'https://www.tiktok.com/',
      secure: true
    }));
}

async function collectBrowserDomItems(page, source) {
  return page.evaluate(handle => {
    const result = [];
    const seen = new Set();
    const anchors = document.querySelectorAll('a[href*="/video/"], a[href*="/photo/"]');
    for (const anchor of anchors) {
      const href = anchor.href || anchor.getAttribute('href') || '';
      const match = href.match(/\/\@([^/]+)\/(video|photo)\/(\d+)/i);
      if (!match || match[1].toLowerCase() !== handle.toLowerCase() || seen.has(match[3])) continue;
      seen.add(match[3]);
      const card = anchor.closest('[data-e2e="user-post-item"]') || anchor.closest('[data-e2e*="post-item"]') || anchor.parentElement || anchor;
      const image = card.querySelector?.('img');
      result.push({
        id: match[3],
        desc: image?.alt || anchor.getAttribute('aria-label') || '',
        video: { cover: image?.currentSrc || image?.src || '' },
        imagePost: match[2].toLowerCase() === 'photo' ? { images: [{}] } : undefined,
        author: { uniqueId: handle }
      });
    }
    return result;
  }, source);
}

async function browserGateDiagnostic(page) {
  return page.evaluate(() => {
    const text = String(document.body?.innerText || '').slice(0, 6000);
    const url = String(location.href || '');
    const pathname = String(location.pathname || '');
    const title = String(document.title || '');
    const linkCount = document.querySelectorAll('a[href*="/video/"], a[href*="/photo/"]').length;
    let gate = '';
    if (/captcha|verify|challenge/i.test(url) || /verify to continue|security verification|captcha|sicherheitsüberprüfung|verifiziere/i.test(text)) {
      gate = 'TikTok zeigt eine Verifizierungs-/Captcha-Seite.';
    } else if (/\/login(?:\/|$)/i.test(pathname) || /log in to tiktok|bei tiktok anmelden|anmelden bei tiktok/i.test(text)) {
      gate = 'TikTok zeigt eine Login-Wand.';
    } else if (/something went wrong|couldn.?t load|try again later|zu viele versuche|too many attempts/i.test(text)) {
      gate = 'TikTok meldet einen temporären Seitenfehler.';
    }
    return { url, pathname, title, linkCount, gate };
  });
}

async function fetchPostBrowser(source, profile, session) {
  const browser = await getBrowser();
  const page = await browser.newPage();
  const captured = [];
  let resolveFeed;
  const feedSeen = new Promise(resolve => { resolveFeed = resolve; });

  page.on('response', async response => {
    const url = response.url();
    if (!url.includes('tiktok.com') || !/\/api\/(?:post|user)\/.*item_list/i.test(url)) return;
    try {
      const data = await response.json();
      const items = postItemsFromPayload(data);
      if (items.length) {
        captured.push(...items);
        resolveFeed?.(true);
      }
    } catch {}
  });

  try {
    await page.setViewport({ width: 1280, height: 900 });
    const rawUa = await browser.userAgent().catch(() => '');
    const browserUa = String(rawUa || session?.ua || '')
      .replace(/HeadlessChrome\//g, 'Chrome/')
      .replace(/HeadlessEdg\//g, 'Edg/');
    if (browserUa) await page.setUserAgent(browserUa);
    await page.setExtraHTTPHeaders({
      'Accept-Language': `${language()}-${region()},${language()};q=0.9,en;q=0.7`
    });
    await page.emulateTimezone(optionalEnv('CREATOR_DEFAULT_TIMEZONE') || 'Europe/Berlin').catch(() => {});

    const cookies = browserCookieList(session);
    if (cookies.length) await page.setCookie(...cookies).catch(() => {});

    const target = `https://www.tiktok.com/@${source}?is_from_webapp=1&sender_device=pc`;
    const response = await page.goto(target, {
      waitUntil: 'domcontentloaded',
      timeout: Math.max(20_000, timeoutMs() * 2)
    });
    if (response && [403, 429].includes(response.status())) {
      throw new Error(`TikTok Browser-Profilzugriff blockiert (HTTP ${response.status()}).`);
    }

    await page.evaluate(() => {
      const rx = /^(accept all|allow all|alle akzeptieren|zustimmen|akzeptieren)$/i;
      for (const button of document.querySelectorAll('button')) {
        const text = String(button.innerText || button.textContent || '').trim();
        if (rx.test(text)) {
          button.click();
          break;
        }
      }
    }).catch(() => {});

    await Promise.race([
      feedSeen,
      page.waitForSelector('a[href*="/video/"], a[href*="/photo/"]', { timeout: 7_000 }).catch(() => null),
      new Promise(resolve => setTimeout(resolve, 5_000))
    ]);

    for (let round = 0; round < 4; round += 1) {
      const apiLatest = pickLatestUploadFromItems(captured, source);
      if (apiLatest) return { latestUpload: apiLatest, supported: true, source: 'browser-api' };

      const domItems = await collectBrowserDomItems(page, source).catch(() => []);
      const domLatest = pickLatestUploadFromItems(domItems, source);
      if (domLatest) return { latestUpload: domLatest, supported: true, source: 'browser-dom' };

      await page.evaluate(() => window.scrollBy(0, Math.max(window.innerHeight || 900, 900))).catch(() => {});
      await new Promise(resolve => setTimeout(resolve, 900));
    }

    const renderedHtml = await page.content().catch(() => '');
    if (renderedHtml) {
      try {
        const renderedProfile = parseProfileDocument(renderedHtml, source);
        if (renderedProfile.latestUpload) {
          return { latestUpload: renderedProfile.latestUpload, supported: true, source: 'browser-ssr' };
        }
      } catch {}
    }

    if (profile.videoCountKnown && profile.videoCount === 0) {
      return { latestUpload: null, supported: true, source: 'browser-empty' };
    }

    const diagnostic = await browserGateDiagnostic(page).catch(() => ({ pathname: '', title: '', linkCount: 0, gate: '' }));
    if (diagnostic.gate) throw new Error(diagnostic.gate);

    const place = diagnostic.pathname || '/';
    throw new Error(
      `TikTok Browser-Fallback fand keinen Feed (XHR-Posts ${captured.length}, Video-Links ${diagnostic.linkCount || 0}, Seite ${place}).`
    );
  } finally {
    await page.close().catch(() => {});
  }
}

async function fetchProfile(source, mod) {
  const cached = profileCache.get(source);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const session = await anonymousSession(mod);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs());
  let profile;
  try {
    const headers = {
      'User-Agent': session.ua,
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': `${language()}-${region()},${language()};q=0.9,en;q=0.7`,
      Referer: 'https://www.tiktok.com/'
    };
    const cookies = cookieHeader(session.cookies);
    if (cookies) headers.Cookie = cookies;
    const response = await fetch(`https://www.tiktok.com/@${encodeURIComponent(source)}`, {
      headers,
      redirect: 'follow',
      signal: controller.signal
    });
    mergeSessionCookies(session, response.headers);
    if (response.status === 403 || response.status === 429) {
      anonymousSessionCache.expiresAt = 0;
      throw new Error(`TikTok Profilzugriff blockiert (HTTP ${response.status}).`);
    }
    if (!response.ok) throw new Error(`TikTok Profil antwortet mit HTTP ${response.status}.`);
    profile = parseProfileDocument(await response.text(), source);
  } finally {
    clearTimeout(timer);
  }

  if (!profile.uploadSupported) {
    let apiError = '';
    try {
      const api = await fetchPostApi(source, profile, session);
      profile = { ...profile, uploadSupported: api.supported, latestUpload: api.latestUpload, uploadSource: api.source, uploadError: '' };
    } catch (error) {
      apiError = String(error?.message || error);
      try {
        const browser = await fetchPostBrowser(source, profile, session);
        profile = { ...profile, uploadSupported: browser.supported, latestUpload: browser.latestUpload, uploadSource: browser.source, uploadError: '' };
      } catch (browserError) {
        const browserMessage = String(browserError?.message || browserError);
        profile.uploadError = [`Browser: ${browserMessage}`, apiError ? `API: ${apiError}` : ''].filter(Boolean).join(' · ');
      }
    }
  }

  const cacheMs = profile.uploadSupported ? PROFILE_CACHE_MS : 15_000;
  profileCache.set(source, { value: profile, expiresAt: Date.now() + cacheMs });
  return profile;
}

async function fetchLive(source, mod) {
  try {
    const result = await mod.checkOnline(source, timeoutMs(), language(), region());
    const roomId = String(result?.roomId || '').trim();
    if (!roomId) return { supported: true, live: false, roomId: '', title: '', viewers: 0 };
    let info = null;
    try { info = await mod.fetchRoomInfo(roomId, timeoutMs(), '', language(), region()); }
    catch (error) {
      if (!['AgeRestrictedError'].includes(error?.name)) throw error;
    }
    return {
      supported: true,
      live: true,
      roomId,
      title: String(info?.title || ''),
      viewers: numberOf(info?.viewers)
    };
  } catch (error) {
    if (error?.name === 'HostNotOnlineError') return { supported: true, live: false, roomId: '', title: '', viewers: 0 };
    if (error?.name === 'UserNotFoundError') throw new Error('TikTok Creator wurde nicht gefunden.');
    return { supported: false, live: false, roomId: '', title: '', viewers: 0, error: String(error?.message || error) };
  }
}

async function fetchTikTokSnapshot(username) {
  const source = normalizeTikTokSource(username);
  const errors = [];
  try {
    const mod = await loadPirateTok();
    const [profileResult, liveResult] = await Promise.allSettled([
      fetchProfile(source, mod),
      fetchLive(source, mod)
    ]);

    let profile = null;
    let live = { supported: false, live: false, roomId: '', title: '', viewers: 0 };
    if (profileResult.status === 'fulfilled') {
      profile = profileResult.value;
      if (profile.uploadError) errors.push(`Uploads: ${profile.uploadError}`);
    } else errors.push(`Uploads: ${profileResult.reason?.message || profileResult.reason}`);
    if (liveResult.status === 'fulfilled') live = liveResult.value;
    else errors.push(`Live: ${liveResult.reason?.message || liveResult.reason}`);
    if (live.error) errors.push(`Live: ${live.error}`);

    const uploadSupported = Boolean(profile?.uploadSupported);
    const liveSupported = Boolean(live.supported);
    if (!uploadSupported && !liveSupported) throw new Error(errors.join(' · ') || 'TikTok Provider ist momentan nicht erreichbar.');

    const snapshot = {
      platform: 'tiktok',
      source,
      creator: String(profile?.creator || source),
      avatar: String(profile?.avatar || ''),
      exists: true,
      liveSupported,
      uploadSupported,
      uploadError: String(profile?.uploadError || ''),
      uploadSource: String(profile?.uploadSource || ''),
      live: Boolean(live.live),
      id: String(live.roomId || ''),
      eventKey: live.live && live.roomId ? `tiktok:${source}:live:${live.roomId}` : `tiktok:${source}:offline`,
      title: String(live.title || ''),
      game: '',
      url: `https://www.tiktok.com/@${source}/live`,
      thumbnail: '',
      startedAt: '',
      viewers: numberOf(live.viewers),
      latestUpload: profile?.latestUpload || null
    };

    const fullyHealthy = liveSupported && uploadSupported;
    setHealth({
      ok: fullyHealthy,
      lastSuccessAt: nowIso(),
      lastError: fullyHealthy ? '' : errors.join(' · ').slice(0, 500),
      capabilities: { live: liveSupported, upload: uploadSupported }
    });
    return snapshot;
  } catch (error) {
    setHealth({
      ok: false,
      lastError: String(error?.message || error || 'Unbekannter Fehler').slice(0, 500),
      capabilities: { live: false, upload: false }
    });
    throw error;
  }
}

function snapshotForTikTokRule(rule, snapshot) {
  if (!snapshot || snapshot.error) return snapshot;
  if (rule?.event !== 'upload') {
    if (!snapshot.liveSupported) return { error: 'TikTok Live-Erkennung ist momentan nicht verfügbar.' };
    return snapshot;
  }
  if (!snapshot.uploadSupported) {
    const detail = snapshot.uploadError ? ` ${snapshot.uploadError}` : '';
    return { error: `TikTok Upload-Erkennung ist momentan nicht verfügbar.${detail}`.slice(0, 900) };
  }
  const upload = snapshot.latestUpload;
  return {
    platform: 'tiktok',
    source: snapshot.source,
    creator: snapshot.creator,
    avatar: snapshot.avatar,
    exists: true,
    live: false,
    id: upload?.id || '',
    eventKey: upload?.id ? `tiktok:${snapshot.source}:upload:${upload.id}` : `tiktok:${snapshot.source}:upload:empty`,
    title: upload?.title || '',
    game: '',
    url: upload?.url || `https://www.tiktok.com/@${snapshot.source}`,
    thumbnail: upload?.thumbnail || '',
    publishedAt: upload?.publishedAt || '',
    startedAt: upload?.publishedAt || '',
    viewers: numberOf(upload?.viewers)
  };
}

module.exports = {
  fetchTikTokSnapshot,
  snapshotForTikTokRule,
  getTikTokProviderHealth,
  normalizeTikTokSource,
  extractRehydrationJson,
  parseProfileDocument,
  pickLatestUploadFromItems,
  findPostList,
  tikTokTimeFromId,
  findBrowserExecutable,
  postItemsFromPayload
};
