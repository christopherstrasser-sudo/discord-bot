const base = require('./creator-social-providers');

const snapshotCache = new Map();
const inflight = new Map();
const backoff = new Map();

const health = {
  configured: true,
  ok: true,
  mode: 'anonymous-web-profile',
  lastCheckedAt: null,
  lastSuccessAt: null,
  lastError: ''
};

function env(name) {
  return String(process.env[name] || '').trim();
}

function nowIso() {
  return new Date().toISOString();
}

function compactError(error) {
  return String(error?.message || error || 'Unbekannter Fehler').replace(/\s+/g, ' ').trim().slice(0, 320);
}

function getInstagramProviderHealth() {
  return {
    ...health,
    configured: true,
    userCredentialsRequired: false,
    backendCredentialsRequired: false,
    browserRequired: false,
    externalServiceRequired: false,
    manualSetupRequired: false
  };
}

function updateHealth(ok, error = '') {
  health.configured = true;
  health.ok = ok;
  health.mode = 'anonymous-web-profile';
  health.lastCheckedAt = nowIso();
  if (ok) {
    health.lastSuccessAt = nowIso();
    health.lastError = '';
  } else {
    health.lastError = compactError(error);
  }
}

function cacheSeconds() {
  const raw = Number(env('CREATOR_INSTAGRAM_MIN_FETCH_SECONDS') || 600);
  return Number.isFinite(raw) ? Math.max(300, Math.min(Math.floor(raw), 3600)) : 600;
}

function manualRefreshFloorSeconds() {
  const raw = Number(env('CREATOR_INSTAGRAM_MANUAL_REFRESH_SECONDS') || 60);
  return Number.isFinite(raw) ? Math.max(30, Math.min(Math.floor(raw), 300)) : 60;
}

function anonymousHeaders() {
  return {
    Accept: '*/*',
    'Accept-Encoding': 'gzip, deflate',
    'Accept-Language': 'en-US,en;q=0.8',
    Connection: 'keep-alive',
    Referer: 'https://www.instagram.com/',
    'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36',
    'x-ig-app-id': '936619743392459',
    Cookie: 'sessionid=; mid=; ig_pr=1; ig_vw=1920; csrftoken=; s_network=; ds_user_id='
  };
}

async function requestProfile(source) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 18000);
  try {
    const url = 'https://www.instagram.com/api/v1/users/web_profile_info/?username=' + encodeURIComponent(source);
    const response = await fetch(url, {
      method: 'GET',
      headers: anonymousHeaders(),
      redirect: 'follow',
      signal: controller.signal
    });
    const text = await response.text();

    if (!response.ok) {
      const error = new Error('HTTP ' + response.status + (text ? ': ' + text.replace(/\s+/g, ' ').slice(0, 220) : ''));
      error.status = response.status;
      throw error;
    }

    const trimmed = text.trim();
    if (!trimmed.startsWith('{')) {
      throw new Error('Instagram lieferte kein JSON.');
    }

    let data;
    try {
      data = JSON.parse(trimmed);
    } catch {
      throw new Error('Instagram lieferte ungültiges JSON.');
    }

    return base.parseInstagramProfileInfo(data, source);
  } finally {
    clearTimeout(timeout);
  }
}

function remainingBackoffSeconds(source) {
  const state = backoff.get(source);
  if (!state || state.until <= Date.now()) return 0;
  return Math.ceil((state.until - Date.now()) / 1000);
}

function noteSuccess(source) {
  backoff.delete(source);
}

function noteFailure(source, error) {
  const previous = backoff.get(source)?.failures || 0;
  const failures = Math.min(previous + 1, 7);
  const baseSeconds = error?.status === 429 ? 5 * 60 : 60;
  const seconds = Math.min(baseSeconds * Math.pow(2, failures - 1), 60 * 60);
  backoff.set(source, {
    failures,
    until: Date.now() + seconds * 1000
  });
}

function cachedSnapshot(source) {
  return snapshotCache.get(source) || null;
}

async function fetchInstagramAnonymous(value, options = {}) {
  const source = base.normalizeSocialHandle('instagram', value);
  const cached = cachedSnapshot(source);
  const ageMs = cached ? Date.now() - cached.at : Number.POSITIVE_INFINITY;
  const allowedAgeSeconds = options.force ? manualRefreshFloorSeconds() : cacheSeconds();

  if (cached && ageMs < allowedAgeSeconds * 1000) return cached.snapshot;

  const wait = remainingBackoffSeconds(source);
  if (wait) {
    if (cached?.snapshot) {
      updateHealth(false, 'Instagram Rate-Limit aktiv; letzter erfolgreicher Stand wird weiterverwendet.');
      return cached.snapshot;
    }
    throw new Error('Instagram pausiert nach Rate-Limit noch ca. ' + wait + 's.');
  }

  if (inflight.has(source)) return inflight.get(source);

  const request = (async () => {
    try {
      const snapshot = await requestProfile(source);
      snapshotCache.set(source, { at: Date.now(), snapshot });
      noteSuccess(source);
      updateHealth(true);
      return snapshot;
    } catch (error) {
      noteFailure(source, error);
      updateHealth(false, error);
      const stale = cachedSnapshot(source);
      if (stale?.snapshot) return stale.snapshot;
      throw new Error('Instagram aktuell nicht anonym abrufbar (' + compactError(error) + ').');
    } finally {
      inflight.delete(source);
    }
  })();

  inflight.set(source, request);
  return request;
}

module.exports = {
  anonymousHeaders,
  fetchInstagramAnonymous,
  getInstagramProviderHealth
};
