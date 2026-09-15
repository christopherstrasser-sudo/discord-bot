const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { getHandle, setHandle } = require('./tiktok-handle-cache');

const DEFAULT_PORT = 31887;
const STATE_DIR = path.join(process.cwd(), 'data', 'tiktok-collector');
const DEVICE_STATE_FILE = path.join(STATE_DIR, 'device.json');
const ENGINE_LOG_FILE = path.join(STATE_DIR, 'signature-engine.log');
let child = null;
let startupPromise = null;
let engineHealth = { ready: false, pid: null, lastError: '', lastReadyAt: null };

function optionalEnv(name) {
  return String(process.env[name] || '').trim();
}

function port() {
  const n = Number(optionalEnv('TIKTOK_SIGNATURE_PORT') || DEFAULT_PORT);
  return Number.isInteger(n) && n >= 1024 && n <= 65535 ? n : DEFAULT_PORT;
}

function baseUrl() {
  return `http://127.0.0.1:${port()}`;
}

function randomDeviceId() {
  const head = BigInt(Date.now()) * 1000000n;
  const tail = BigInt(Math.floor(Math.random() * 900000 + 100000));
  return String(head + tail).slice(0, 19).padEnd(19, '7');
}

function deviceId() {
  try {
    const data = JSON.parse(fs.readFileSync(DEVICE_STATE_FILE, 'utf8'));
    if (/^\d{18,20}$/.test(String(data.deviceId || ''))) return String(data.deviceId);
  } catch {}
  const id = randomDeviceId();
  fs.mkdirSync(STATE_DIR, { recursive: true });
  const tmp = `${DEVICE_STATE_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify({ deviceId: id, createdAt: new Date().toISOString() }, null, 2));
  fs.renameSync(tmp, DEVICE_STATE_FILE);
  return id;
}

async function requestJson(url, options = {}, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const text = await response.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; }
    catch { throw new Error(`Ungültige JSON-Antwort von ${url} (${text.length} Bytes).`); }
    if (!response.ok) throw new Error(data?.message || `HTTP ${response.status}`);
    return data;
  } finally {
    clearTimeout(timer);
  }
}

async function readHealth(timeoutMs = 1500) {
  try {
    const data = await requestJson(`${baseUrl()}/health`, {}, timeoutMs);
    if (data?.status !== 'ok') return null;
    if (data.ready) {
      engineHealth.ready = true;
      engineHealth.lastReadyAt = new Date().toISOString();
      engineHealth.lastError = '';
    }
    return data;
  } catch {
    return null;
  }
}

function packageRoot() {
  return path.dirname(require.resolve('tiktok-signature/package.json'));
}

function serverPath() {
  return path.join(packageRoot(), 'server.mjs');
}

function hardenLoopbackBindingText(text) {
  const input = String(text || '');
  if (input.includes('server.listen(PORT, "127.0.0.1", () => {')) return input;
  const needle = 'server.listen(PORT, () => {';
  if (!input.includes(needle)) {
    throw new Error('TikTok Signature Engine: Server-Binding der gepinnten Version wurde unerwartet geändert.');
  }
  return input.replace(needle, 'server.listen(PORT, "127.0.0.1", () => {');
}

function hardenServerBinding(script) {
  const original = fs.readFileSync(script, 'utf8');
  const hardened = hardenLoopbackBindingText(original);
  if (hardened !== original) fs.writeFileSync(script, hardened, 'utf8');
}

async function waitUntilReady(proc, timeoutMs = 75000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (proc && proc.exitCode !== null) {
      throw new Error(`TikTok Signature Engine wurde beendet (Code ${proc.exitCode}). Siehe ${ENGINE_LOG_FILE}.`);
    }
    const state = await readHealth(2500);
    if (state?.ready) return state;
    await new Promise(resolve => setTimeout(resolve, 750));
  }
  const state = await readHealth(2500);
  throw new Error(`TikTok Signature Engine wurde nicht rechtzeitig bereit.${state?.initializing ? ' Initialisierung läuft noch.' : ''} Siehe ${ENGINE_LOG_FILE}.`);
}

async function ensureEngine(deps) {
  const existing = await readHealth();
  if (existing?.ready) return existing;
  if (startupPromise) return startupPromise;

  startupPromise = (async () => {
    const executablePath = deps.findBrowserExecutable();
    if (!executablePath) throw new Error('Kein lokaler Edge/Chrome für die TikTok Signature Engine gefunden.');
    const script = serverPath();
    if (!fs.existsSync(script)) throw new Error('tiktok-signature ist nicht vollständig installiert.');

    hardenServerBinding(script);
    fs.mkdirSync(STATE_DIR, { recursive: true });
    const logFd = fs.openSync(ENGINE_LOG_FILE, 'a');
    try {
      child = spawn(process.execPath, [script], {
        cwd: packageRoot(),
        windowsHide: true,
        detached: false,
        stdio: ['ignore', logFd, logFd],
        env: {
          ...process.env,
          PORT: String(port()),
          PUPPETEER_EXECUTABLE_PATH: executablePath,
          PUPPETEER_SKIP_DOWNLOAD: 'true',
          MAX_GENERATIONS_BEFORE_REFRESH: optionalEnv('TIKTOK_SIGNATURE_MAX_GENERATIONS') || '350',
          MAX_SESSION_AGE_MS: optionalEnv('TIKTOK_SIGNATURE_SESSION_MS') || String(45 * 60 * 1000)
        }
      });
    } finally {
      fs.closeSync(logFd);
    }

    engineHealth.pid = child.pid || null;
    child.on('exit', code => {
      engineHealth.ready = false;
      engineHealth.pid = null;
      engineHealth.lastError = `Signature Engine beendet (Code ${code ?? 'n/a'}).`;
      child = null;
    });
    child.on('error', error => {
      engineHealth.ready = false;
      engineHealth.lastError = String(error?.message || error);
    });
    child.unref();

    return waitUntilReady(child);
  })();

  try {
    return await startupPromise;
  } catch (error) {
    engineHealth.lastError = String(error?.message || error);
    throw error;
  } finally {
    startupPromise = null;
  }
}

function commonParams(extra = {}) {
  const params = new URLSearchParams({
    WebIdLastTime: String(Date.now()),
    aid: '1988',
    app_language: 'en',
    app_name: 'tiktok_web',
    browser_language: 'en-US',
    browser_name: 'Mozilla',
    browser_online: 'true',
    browser_platform: 'MacIntel',
    browser_version: '5.0',
    channel: 'tiktok_web',
    cookie_enabled: 'true',
    device_id: deviceId(),
    device_platform: 'web_pc',
    focus_state: 'true',
    history_len: '2',
    is_fullscreen: 'false',
    is_page_visible: 'true',
    language: 'en',
    os: 'mac',
    priority_region: 'US',
    region: 'US',
    screen_height: '1080',
    screen_width: '1920',
    tz_name: 'America/New_York',
    webcast_language: 'en',
    ...extra
  });
  return params;
}

function searchUrl(source) {
  const params = commonParams({ count: '10', cursor: '0', keyword: source, from_page: 'search' });
  return `https://www.tiktok.com/api/search/user/full/?${params.toString()}`;
}

function videosUrl(secUid) {
  const params = commonParams({ count: '30', coverFormat: '0', cursor: '0', secUid, from_page: 'user' });
  return `https://www.tiktok.com/api/post/item_list/?${params.toString()}`;
}

async function signUrl(url, deps, navigateTo = '') {
  await ensureEngine(deps);
  const payload = await requestJson(`${baseUrl()}/signature`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, ...(navigateTo ? { navigateTo } : {}) })
  }, navigateTo ? 70000 : 30000);
  if (payload?.status !== 'ok' || !payload?.data?.signed_url) {
    throw new Error(payload?.message || 'TikTok Signature Engine lieferte keine signierte URL.');
  }
  return payload.data;
}

async function fetchSigned(url, deps, navigateTo = '') {
  const signed = await signUrl(url, deps, navigateTo);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(signed.signed_url, {
      headers: {
        'User-Agent': String(signed.navigator?.user_agent || ''),
        Cookie: String(signed.cookies || ''),
        Accept: 'application/json',
        Referer: 'https://www.tiktok.com/'
      },
      signal: controller.signal
    });
    const text = await response.text();
    if (!response.ok) throw new Error(`TikTok signed API HTTP ${response.status}.`);
    if (!text.trim()) throw new Error(`TikTok signed API lieferte HTTP ${response.status} mit 0 Bytes.`);
    let data;
    try { data = JSON.parse(text); }
    catch { throw new Error(`TikTok signed API lieferte ungültiges JSON (${text.length} Bytes).`); }
    return data;
  } finally {
    clearTimeout(timer);
  }
}

function exactUserFromSearch(data, source) {
  const entries = Array.isArray(data?.user_list) ? data.user_list : (Array.isArray(data?.userList) ? data.userList : []);
  const normalized = String(source || '').toLowerCase();
  const users = entries.map(entry => entry?.user_info || entry?.userInfo || entry).filter(Boolean);
  return users.find(user => String(user.uniqueId || user.unique_id || '').toLowerCase() === normalized) || null;
}

function cachedProfile(source) {
  const cached = getHandle(source);
  if (!cached?.secUid) return null;
  return {
    secUid: cached.secUid,
    creator: cached.creator || source,
    avatar: cached.avatar || ''
  };
}

function cacheProfile(source, profile) {
  setHandle(source, profile);
  return profile;
}

async function publicProfileFallback(source, deps) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(`https://www.tiktok.com/@${encodeURIComponent(source)}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9'
      },
      redirect: 'follow',
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`Profil HTTP ${response.status}`);
    const parsed = deps.parseProfileDocument(await response.text(), source);
    if (!parsed.secUid) throw new Error('Profil enthält keine secUid.');
    return {
      secUid: parsed.secUid,
      creator: String(parsed.creator || source),
      avatar: String(parsed.avatar || '')
    };
  } finally {
    clearTimeout(timer);
  }
}

async function resolveUser(source, deps) {
  const cached = cachedProfile(source);
  if (cached) return cached;

  const errors = [];
  const search = searchUrl(source);
  try {
    const data = await fetchSigned(search, deps);
    const user = exactUserFromSearch(data, source);
    const secUid = String(user?.secUid || user?.sec_uid || '').trim();
    if (user && secUid) {
      return cacheProfile(source, {
        secUid,
        creator: String(user.nickname || user.uniqueId || user.unique_id || source),
        avatar: String(user.avatarLarger || user.avatar_larger?.url_list?.[0] || user.avatarThumb || user.avatar_thumb?.url_list?.[0] || '')
      });
    }
    errors.push('Signierte Suche lieferte keinen exakten Creator mit secUid.');
  } catch (error) {
    errors.push(`Signierte Suche: ${error?.message || error}`);
  }

  try {
    const navigateTo = `https://www.tiktok.com/search/user?q=${encodeURIComponent(source)}`;
    const data = await fetchSigned(search, deps, navigateTo);
    const user = exactUserFromSearch(data, source);
    const secUid = String(user?.secUid || user?.sec_uid || '').trim();
    if (user && secUid) {
      return cacheProfile(source, {
        secUid,
        creator: String(user.nickname || user.uniqueId || user.unique_id || source),
        avatar: String(user.avatarLarger || user.avatar_larger?.url_list?.[0] || user.avatarThumb || user.avatar_thumb?.url_list?.[0] || '')
      });
    }
    errors.push('Search-Page-Intercept lieferte keinen exakten Creator mit secUid.');
  } catch (error) {
    errors.push(`Search-Page-Intercept: ${error?.message || error}`);
  }

  try {
    return cacheProfile(source, await publicProfileFallback(source, deps));
  } catch (error) {
    errors.push(`Profil-Fallback: ${error?.message || error}`);
  }

  throw new Error(`TikTok Creator @${source} konnte nicht zuverlässig aufgelöst werden. ${errors.join(' · ')}`);
}

async function fetchTikTokSignedUpload(source, deps) {
  const profile = await resolveUser(source, deps);
  let data;
  try {
    data = await fetchSigned(videosUrl(profile.secUid), deps);
  } catch (error) {
    const first = String(error?.message || error);
    try {
      data = await fetchSigned(videosUrl(profile.secUid), deps, `https://www.tiktok.com/@${source}`);
    } catch (fallbackError) {
      throw new Error(`Signer: ${first} · Page-Intercept: ${fallbackError?.message || fallbackError}`);
    }
  }
  const items = deps.postItemsFromPayload(data);
  const latestUpload = deps.pickLatestUploadFromItems(items, source);
  if (!latestUpload) {
    const status = Number(data?.statusCode ?? data?.status_code ?? 0);
    throw new Error(`Signierte TikTok Post-API lieferte keine Beiträge${status ? ` (Status ${status})` : ''}.`);
  }
  return { latestUpload, profile, source: 'signature-engine' };
}

function getSignatureEngineHealth() {
  return { ...engineHealth, port: port(), baseUrl: baseUrl(), logFile: ENGINE_LOG_FILE };
}

module.exports = {
  ensureEngine,
  fetchTikTokSignedUpload,
  getSignatureEngineHealth,
  exactUserFromSearch,
  commonParams,
  searchUrl,
  videosUrl,
  deviceId,
  port,
  hardenLoopbackBindingText
};
