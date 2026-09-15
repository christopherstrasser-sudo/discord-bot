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
const profileCache = new Map();
const PROFILE_CACHE_MS = 60_000;

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

function imageOf(video) {
  return String(video?.dynamicCover || video?.cover || video?.originCover || video?.coverUrl || '').trim();
}

function findPostList(scope) {
  const direct = [
    scope?.['webapp.user-post']?.itemList,
    scope?.['webapp.user-post']?.items,
    scope?.['webapp.user-post-list']?.itemList,
    scope?.['webapp.user-detail']?.userPost?.itemList,
    scope?.['webapp.user-detail']?.userPost?.items
  ];
  for (const list of direct) if (Array.isArray(list)) return list;
  return null;
}

function pickLatestUploadFromItems(items, source) {
  const usable = (Array.isArray(items) ? items : [])
    .filter(item => item && typeof item === 'object' && String(item.id || '').trim())
    .sort((a, b) => numberOf(b.createTime) - numberOf(a.createTime));
  const item = usable[0];
  if (!item) return null;
  const id = String(item.id).trim();
  return {
    id,
    title: String(item.desc || item.description || item.title || 'Neues TikTok').trim(),
    url: `https://www.tiktok.com/@${source}/video/${id}`,
    thumbnail: imageOf(item.video || item),
    publishedAt: item.createTime ? new Date(numberOf(item.createTime) * 1000).toISOString() : '',
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
  const itemList = findPostList(scope);
  const videoCount = numberOf(stats.videoCount);
  const uploadSupported = Array.isArray(itemList) || videoCount === 0;
  const latestUpload = Array.isArray(itemList) ? pickLatestUploadFromItems(itemList, source) : null;

  return {
    creator: String(user.nickname || user.uniqueId || source),
    avatar: String(user.avatarLarger || user.avatarMedium || user.avatarThumb || ''),
    exists: statusCode === 0,
    uploadSupported,
    latestUpload,
    videoCount
  };
}

async function fetchProfile(source, mod) {
  const cached = profileCache.get(source);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs());
  try {
    const ua = typeof mod.randomUa === 'function'
      ? mod.randomUa()
      : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36';
    const response = await fetch(`https://www.tiktok.com/@${encodeURIComponent(source)}`, {
      headers: {
        'User-Agent': ua,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': `${language()}-${region()},${language()};q=0.9,en;q=0.7`,
        Referer: 'https://www.tiktok.com/'
      },
      redirect: 'follow',
      signal: controller.signal
    });
    if (response.status === 403 || response.status === 429) throw new Error(`TikTok Profilzugriff blockiert (HTTP ${response.status}).`);
    if (!response.ok) throw new Error(`TikTok Profil antwortet mit HTTP ${response.status}.`);
    const value = parseProfileDocument(await response.text(), source);
    profileCache.set(source, { value, expiresAt: Date.now() + PROFILE_CACHE_MS });
    return value;
  } finally {
    clearTimeout(timer);
  }
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
    if (profileResult.status === 'fulfilled') profile = profileResult.value;
    else errors.push(`Uploads: ${profileResult.reason?.message || profileResult.reason}`);
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
  if (!snapshot.uploadSupported) return { error: 'TikTok Upload-Erkennung ist momentan nicht verfügbar.' };
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
  pickLatestUploadFromItems
};
