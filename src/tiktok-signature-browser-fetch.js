const { getHandle } = require('./tiktok-handle-cache');
const engine = require('./tiktok-signature-engine');

async function requestJson(url, options = {}, timeoutMs = 45000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const text = await response.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; }
    catch { throw new Error(`Browser-Fetch lieferte ungültiges JSON (${text.length} Bytes).`); }
    if (!response.ok) throw new Error(data?.message || `Browser-Fetch HTTP ${response.status}.`);
    return data;
  } finally {
    clearTimeout(timer);
  }
}

function uploadFromBrowserPayload(payload, source, deps, profile = {}) {
  if (!payload || payload.status !== 'ok') {
    throw new Error(payload?.message || 'TikTok Browser-Fetch wurde nicht erfolgreich ausgeführt.');
  }
  const data = payload.data;
  if (!data || typeof data !== 'object') {
    throw new Error('TikTok Browser-Fetch lieferte keine verwertbaren Daten.');
  }
  const status = Number(data.statusCode ?? data.status_code ?? 0);
  if (status !== 0) throw new Error(`TikTok Browser-Fetch Status ${status}.`);
  const items = deps.postItemsFromPayload(data);
  const latestUpload = deps.pickLatestUploadFromItems(items, source);
  if (!latestUpload) throw new Error('TikTok Browser-Fetch lieferte keine Beiträge.');
  return {
    latestUpload,
    profile: {
      secUid: String(profile.secUid || ''),
      creator: String(profile.creator || source),
      avatar: String(profile.avatar || '')
    },
    source: 'browser-session-api'
  };
}

async function fetchTikTokBrowserSessionUpload(source, deps) {
  const profile = getHandle(source);
  if (!profile?.secUid) {
    throw new Error('Für den Browser-Fetch ist noch keine aufgelöste TikTok secUid im Handle-Cache vorhanden.');
  }

  await engine.ensureEngine(deps);
  const health = engine.getSignatureEngineHealth();
  const apiUrl = engine.videosUrl(profile.secUid);
  const payload = await requestJson(`${health.baseUrl}/fetch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: apiUrl })
  }, 50000);

  return uploadFromBrowserPayload(payload, source, deps, profile);
}

function installBrowserFetchFallback() {
  if (engine.__rakuBrowserFetchInstalled) return engine;
  const original = engine.fetchTikTokSignedUpload.bind(engine);
  engine.fetchTikTokSignedUpload = async (source, deps) => {
    try {
      return await original(source, deps);
    } catch (error) {
      const signedError = String(error?.message || error);
      try {
        return await fetchTikTokBrowserSessionUpload(source, deps);
      } catch (browserError) {
        throw new Error(`${signedError} · Browser-Session: ${browserError?.message || browserError}`);
      }
    }
  };
  engine.__rakuBrowserFetchInstalled = true;
  return engine;
}

module.exports = {
  installBrowserFetchFallback,
  fetchTikTokBrowserSessionUpload,
  uploadFromBrowserPayload
};
