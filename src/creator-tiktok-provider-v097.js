const legacy = require('./creator-tiktok-provider');
const {
  fetchTikTokCollectorUpload,
  collectorStatus
} = require('./tiktok-collector');
const {
  fetchTikTokSignedUpload,
  getSignatureEngineHealth
} = require('./tiktok-signature-engine');

const health = {
  configured: true,
  ok: false,
  lastCheckedAt: null,
  lastSuccessAt: null,
  lastError: '',
  mode: 'signature+collector',
  capabilities: { live: null, upload: null },
  collector: null,
  signatureEngine: null
};

let pirateTokPromise = null;

function nowIso() {
  return new Date().toISOString();
}

function optionalEnv(name) {
  return String(process.env[name] || '').trim();
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

function numberOf(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
}

function uploadDeps() {
  return {
    findBrowserExecutable: legacy.findBrowserExecutable,
    parseProfileDocument: legacy.parseProfileDocument,
    pickLatestUploadFromItems: legacy.pickLatestUploadFromItems,
    postItemsFromPayload: legacy.postItemsFromPayload,
    timeoutMs,
    language,
    region
  };
}

async function loadPirateTok() {
  if (!pirateTokPromise) pirateTokPromise = import('piratetok-live-js');
  return pirateTokPromise;
}

function setHealth(patch = {}) {
  Object.assign(health, patch, {
    lastCheckedAt: nowIso(),
    collector: collectorStatus(),
    signatureEngine: getSignatureEngineHealth()
  });
}

function getTikTokProviderHealth() {
  return JSON.parse(JSON.stringify({
    ...health,
    configured: true,
    mode: 'signature+collector',
    collector: collectorStatus(),
    signatureEngine: getSignatureEngineHealth()
  }));
}

async function fetchLive(source, mod) {
  try {
    const result = await mod.checkOnline(source, timeoutMs(), language(), region());
    const roomId = String(result?.roomId || '').trim();
    if (!roomId) return { supported: true, live: false, roomId: '', title: '', viewers: 0 };
    let info = null;
    try {
      info = await mod.fetchRoomInfo(roomId, timeoutMs(), '', language(), region());
    } catch (error) {
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
    return {
      supported: false,
      live: false,
      roomId: '',
      title: '',
      viewers: 0,
      error: String(error?.message || error)
    };
  }
}

function normalizedUpload(result, source) {
  return {
    supported: true,
    latestUpload: result.latestUpload || null,
    creator: String(result.profile?.creator || source),
    avatar: String(result.profile?.avatar || ''),
    source: String(result.source || 'tiktok')
  };
}

async function fetchUpload(source) {
  const deps = uploadDeps();
  const errors = [];

  try {
    const signed = await fetchTikTokSignedUpload(source, deps);
    return normalizedUpload(signed, source);
  } catch (error) {
    errors.push(`Signature: ${error?.message || error}`);
  }

  try {
    const collected = await fetchTikTokCollectorUpload(source, deps);
    return normalizedUpload(collected, source);
  } catch (error) {
    errors.push(`Collector: ${error?.message || error}`);
  }

  return {
    supported: false,
    latestUpload: null,
    creator: source,
    avatar: '',
    source: 'signature+collector',
    error: errors.join(' · ')
  };
}

async function fetchTikTokSnapshot(username) {
  const source = legacy.normalizeTikTokSource(username);
  const errors = [];
  try {
    const mod = await loadPirateTok();
    const [uploadResult, liveResult] = await Promise.all([
      fetchUpload(source),
      fetchLive(source, mod)
    ]);

    if (uploadResult.error) errors.push(`Uploads: ${uploadResult.error}`);
    if (liveResult.error) errors.push(`Live: ${liveResult.error}`);

    const uploadSupported = Boolean(uploadResult.supported);
    const liveSupported = Boolean(liveResult.supported);
    if (!uploadSupported && !liveSupported) {
      throw new Error(errors.join(' · ') || 'TikTok Provider ist momentan nicht erreichbar.');
    }

    const snapshot = {
      platform: 'tiktok',
      source,
      creator: String(uploadResult.creator || source),
      avatar: String(uploadResult.avatar || ''),
      exists: true,
      liveSupported,
      uploadSupported,
      uploadError: uploadSupported ? '' : String(uploadResult.error || ''),
      uploadSource: String(uploadResult.source || ''),
      live: Boolean(liveResult.live),
      id: String(liveResult.roomId || ''),
      eventKey: liveResult.live && liveResult.roomId
        ? `tiktok:${source}:live:${liveResult.roomId}`
        : `tiktok:${source}:offline`,
      title: String(liveResult.title || ''),
      game: '',
      url: `https://www.tiktok.com/@${source}/live`,
      thumbnail: '',
      startedAt: '',
      viewers: numberOf(liveResult.viewers),
      latestUpload: uploadResult.latestUpload || null
    };

    const fullyHealthy = liveSupported && uploadSupported;
    setHealth({
      ok: fullyHealthy,
      lastSuccessAt: nowIso(),
      lastError: fullyHealthy ? '' : errors.join(' · ').slice(0, 1000),
      capabilities: { live: liveSupported, upload: uploadSupported }
    });
    return snapshot;
  } catch (error) {
    setHealth({
      ok: false,
      lastError: String(error?.message || error || 'Unbekannter Fehler').slice(0, 1000),
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
    return { error: `TikTok Upload-Erkennung ist momentan nicht verfügbar.${detail}`.slice(0, 1500) };
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
    eventKey: upload?.id
      ? `tiktok:${snapshot.source}:upload:${upload.id}`
      : `tiktok:${snapshot.source}:upload:empty`,
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
  normalizeTikTokSource: legacy.normalizeTikTokSource
};
