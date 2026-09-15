const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const DEFAULT_PORT = 31887;
const DEVICE_STATE_FILE = path.join(process.cwd(), 'data', 'tiktok-collector', 'device.json');
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
  fs.mkdirSync(path.dirname(DEVICE_STATE_FILE), { recursive: true });
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

async function waitUntilReady(proc, timeoutMs = 75000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (proc && proc.exitCode !== null) throw new Error(`TikTok Signature Engine wurde beendet (Code ${proc.exitCode}).`);
    const state = await readHealth(2500);
    if (state?.ready) return state;
    await new Promise(resolve => setTimeout(resolve, 750));
  }
  const state = await readHealth(2500);
  throw new Error(`TikTok Signature Engine wurde nicht rechtzeitig bereit.${state?.initializing ? ' Initialisierung läuft noch.' : ''}`);
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

    child = spawn(process.execPath, [script], {
      cwd: packageRoot(),
      windowsHide: true,
      detached: false,
      stdio: 'ignore',
      env: {
        ...process.env,
        PORT: String(port()),
        PUPPETEER_EXECUTABLE_PATH: executablePath,
        PUPPETEER_SKIP_DOWNLOAD: 'true',
        MAX_GENERATIONS_BEFORE_REFRESH: optionalEnv('TIKTOK_SIGNATURE_MAX_GENERATIONS') || '350',
        MAX_SESSION_AGE_MS: optionalEnv('TIKTOK_SIGNATURE_SESSION_MS') || String(45 * 60 * 1000)
      }
    });
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
    // Der lokale Signer darf den Discord-Bot beim Beenden nicht festhalten.
    // Läuft er weiter, kann der nächste Bot-Start dieselbe warme Guest-Session wiederverwenden.
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
    // Gleiche Fingerprint-Werte wie die lokale Signature Engine / deren getestete Beispiele.
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
  const params = commonParams({
    count: '10',
    cursor: '0',
    keyword: source,
    from_page: 'search'
  });
  return `https://www.tiktok.com/api/search/user/full/?${params.toString()}`;
}

function videosUrl(secUid) {
  const params = commonParams({
    count: '30',
    coverFormat: '0',
    cursor: '0',
    secUid,
    from_page: 'user'
  });
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
  return users.find(user => String(user.uniqueId || user.unique_id || '').toLowerCase() === normalized) || users[0] || null;
}

async function resolveUser(source, deps) {
  const data = await fetchSigned(searchUrl(source), deps);
  const user = exactUserFromSearch(data, source);
  if (!user) throw new Error(`TikTok Creator @${source} wurde über die signierte Suche nicht gefunden.`);
  const secUid = String(user.secUid || user.sec_uid || '').trim();
  if (!secUid) throw new Error(`TikTok Suche lieferte für @${source} keine secUid.`);
  return {
    secUid,
    creator: String(user.nickname || user.uniqueId || user.unique_id || source),
    avatar: String(user.avatarLarger || user.avatar_larger?.url_list?.[0] || user.avatarThumb || user.avatar_thumb?.url_list?.[0] || '')
  };
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
  return { ...engineHealth, port: port(), baseUrl: baseUrl() };
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
  port
};
