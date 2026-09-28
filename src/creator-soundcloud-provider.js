const API_BASE = 'https://api.soundcloud.com';
const TOKEN_URL = 'https://secure.soundcloud.com/oauth/token';

let tokenState = { accessToken: '', refreshToken: '', expiresAt: 0 };
const userCache = new Map();
const latestCache = new Map();
const inflight = new Map();

const health = {
  configured: false,
  ok: true,
  mode: 'official-api',
  lastCheckedAt: null,
  lastSuccessAt: null,
  lastError: ''
};

function optionalEnv(name) {
  return String(process.env[name] || '').trim();
}

function configured() {
  return Boolean(optionalEnv('SOUNDCLOUD_CLIENT_ID') && optionalEnv('SOUNDCLOUD_CLIENT_SECRET'));
}

function nowIso() {
  return new Date().toISOString();
}

function updateHealth(ok, error = '') {
  health.configured = configured();
  health.ok = ok;
  health.mode = 'official-api';
  health.lastCheckedAt = nowIso();
  if (ok) {
    health.lastSuccessAt = nowIso();
    health.lastError = '';
  } else {
    health.lastError = String(error || '').replace(/\s+/g, ' ').trim().slice(0, 500);
  }
}

function getSoundCloudProviderHealth() {
  return {
    ...health,
    configured: configured(),
    userCredentialsRequired: false,
    backendCredentialsRequired: true
  };
}

function normalizeSoundCloudSource(value) {
  let source = String(value || '').trim();
  if (!source) return '';

  if (/^(?:https?:\/\/)?(?:www\.)?soundcloud\.com\//i.test(source)) {
    try {
      const url = new URL(/^https?:\/\//i.test(source) ? source : `https://${source}`);
      const parts = decodeURIComponent(url.pathname || '').split('/').filter(Boolean);
      if (parts.length !== 1) throw new Error('not_profile');
      source = parts[0];
    } catch {
      throw new Error('SoundCloud: Bitte ein Künstlerprofil wie soundcloud.com/artist oder den Profilnamen eintragen.');
    }
  }

  source = source.replace(/^@/, '').trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9._-]{0,99}$/.test(source)) {
    throw new Error('SoundCloud: Bitte ein gültiges Künstlerprofil bzw. einen Profilnamen eintragen.');
  }
  return source;
}

function profileUrl(source) {
  return `https://soundcloud.com/${encodeURIComponent(source)}`;
}

function timeoutMs() {
  const raw = Number(optionalEnv('SOUNDCLOUD_TIMEOUT_MS') || 15000);
  return Number.isFinite(raw) ? Math.max(5000, Math.min(Math.floor(raw), 30000)) : 15000;
}

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(options.timeoutMs || timeoutMs()));
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function readError(response) {
  const text = await response.text().catch(() => '');
  if (!text) return `HTTP ${response.status}`;
  try {
    const parsed = JSON.parse(text);
    return String(parsed?.message || parsed?.error_description || parsed?.error || `HTTP ${response.status}`);
  } catch {
    return `HTTP ${response.status}: ${text.slice(0, 220)}`;
  }
}

async function requestToken(grantType, refreshToken = '') {
  const clientId = optionalEnv('SOUNDCLOUD_CLIENT_ID');
  const clientSecret = optionalEnv('SOUNDCLOUD_CLIENT_SECRET');
  if (!clientId || !clientSecret) {
    throw new Error('SoundCloud Provider ist serverseitig nicht konfiguriert (SOUNDCLOUD_CLIENT_ID / SOUNDCLOUD_CLIENT_SECRET).');
  }

  const body = new URLSearchParams({ grant_type: grantType });
  const headers = {
    Accept: 'application/json; charset=utf-8',
    'Content-Type': 'application/x-www-form-urlencoded'
  };

  if (grantType === 'client_credentials') {
    headers.Authorization = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`;
  } else {
    body.set('refresh_token', refreshToken);
    body.set('client_id', clientId);
    body.set('client_secret', clientSecret);
  }

  const response = await fetchWithTimeout(TOKEN_URL, {
    method: 'POST',
    headers,
    body: body.toString()
  });
  if (!response.ok) throw new Error(`SoundCloud OAuth: ${await readError(response)}`);

  const data = await response.json();
  if (!data?.access_token) throw new Error('SoundCloud OAuth lieferte kein Access Token.');
  const expiresIn = Math.max(300, Number(data.expires_in || 3600));
  tokenState = {
    accessToken: String(data.access_token),
    refreshToken: String(data.refresh_token || ''),
    expiresAt: Date.now() + expiresIn * 1000
  };
  return tokenState.accessToken;
}

async function accessToken() {
  if (!configured()) {
    throw new Error('SoundCloud Provider ist serverseitig nicht konfiguriert (SOUNDCLOUD_CLIENT_ID / SOUNDCLOUD_CLIENT_SECRET).');
  }
  if (tokenState.accessToken && tokenState.expiresAt - Date.now() > 90000) return tokenState.accessToken;

  if (tokenState.refreshToken) {
    try {
      return await requestToken('refresh_token', tokenState.refreshToken);
    } catch {
      tokenState = { accessToken: '', refreshToken: '', expiresAt: 0 };
    }
  }
  return requestToken('client_credentials');
}

async function apiJson(url, retry = true) {
  const token = await accessToken();
  const response = await fetchWithTimeout(url, {
    headers: {
      Accept: 'application/json; charset=utf-8',
      Authorization: `OAuth ${token}`,
      'User-Agent': 'Orbit-Discord-Control/0.32'
    },
    redirect: 'follow'
  });
  if (response.status === 401 && retry) {
    tokenState = { accessToken: '', refreshToken: '', expiresAt: 0 };
    return apiJson(url, false);
  }
  if (!response.ok) throw new Error(`SoundCloud API: ${await readError(response)}`);
  return response.json();
}

async function resolveSoundCloudUser(source) {
  const hit = userCache.get(source);
  if (hit && hit.expiresAt > Date.now()) return hit.user;

  const params = new URLSearchParams({ url: profileUrl(source) });
  const user = await apiJson(`${API_BASE}/resolve?${params.toString()}`);
  if (!user || String(user.kind || '').toLowerCase() !== 'user') {
    throw new Error('SoundCloud Künstlerprofil wurde nicht gefunden.');
  }
  const urn = String(user.urn || (user.id ? `soundcloud:users:${user.id}` : ''));
  if (!urn) throw new Error('SoundCloud Künstlerprofil hat keine verwertbare User-ID.');
  const normalized = { ...user, urn };
  userCache.set(source, { user: normalized, expiresAt: Date.now() + 24 * 60 * 60 * 1000 });
  return normalized;
}

function buildSoundCloudSnapshot(source, user, tracks) {
  const collection = Array.isArray(tracks) ? tracks : (Array.isArray(tracks?.collection) ? tracks.collection : []);
  const candidates = collection
    .filter(track => track && (track.urn || track.id) && track.permalink_url)
    .map(track => ({ track, time: Date.parse(String(track.created_at || '')) || 0 }))
    .sort((a, b) => b.time - a.time);
  const current = candidates[0]?.track;
  if (!current) throw new Error('SoundCloud Profil hat keine öffentlich abrufbaren Uploads.');

  const id = String(current.urn || current.id);
  const creator = String(user?.full_name || user?.username || current?.user?.username || source);
  const publishedAt = String(current.created_at || '');
  return {
    platform: 'soundcloud',
    source,
    creator,
    exists: true,
    live: false,
    id,
    eventKey: `soundcloud:${source}:upload:${id}`,
    title: String(current.title || `${creator} hat einen neuen Track veröffentlicht.`).trim(),
    game: '',
    url: String(current.permalink_url || profileUrl(source)),
    thumbnail: String(current.artwork_url || user?.avatar_url || current?.user?.avatar_url || ''),
    avatar: String(user?.avatar_url || current?.user?.avatar_url || ''),
    publishedAt,
    startedAt: publishedAt,
    viewers: 0,
    views: Number(current.playback_count || 0),
    duration: Number(current.duration || 0)
  };
}

function cacheSeconds() {
  const raw = Number(optionalEnv('CREATOR_SOUNDCLOUD_MIN_FETCH_SECONDS') || 90);
  return Number.isFinite(raw) ? Math.max(60, Math.min(Math.floor(raw), 900)) : 90;
}

async function fetchSoundCloudUpload(value) {
  const source = normalizeSoundCloudSource(value);
  const cached = latestCache.get(source);
  if (cached && Date.now() - cached.at < cacheSeconds() * 1000) return cached.snapshot;
  if (inflight.has(source)) return inflight.get(source);

  const request = (async () => {
    try {
      const user = await resolveSoundCloudUser(source);
      const params = new URLSearchParams({
        limit: '10',
        sort: 'desc',
        linked_partitioning: 'true',
        access: 'playable,preview,blocked'
      });
      const tracks = await apiJson(`${API_BASE}/users/${encodeURIComponent(user.urn)}/tracks?${params.toString()}`);
      const snapshot = buildSoundCloudSnapshot(source, user, tracks);
      latestCache.set(source, { at: Date.now(), snapshot });
      updateHealth(true);
      return snapshot;
    } catch (error) {
      updateHealth(false, error?.message || error);
      throw error;
    } finally {
      inflight.delete(source);
    }
  })();

  inflight.set(source, request);
  return request;
}

module.exports = {
  normalizeSoundCloudSource,
  buildSoundCloudSnapshot,
  fetchSoundCloudUpload,
  getSoundCloudProviderHealth
};
