const base = require('./creator-social-providers');

const identityCache = new Map();
const snapshotCache = new Map();
const inflight = new Map();
const backoff = new Map();

const health = {
  configured: false,
  ok: true,
  mode: 'session-feed',
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

function sessionCookie() {
  const session = env('INSTAGRAM_SESSION_ID');
  const csrf = env('INSTAGRAM_CSRF_TOKEN');
  const dsUserId = env('INSTAGRAM_DS_USER_ID');
  const parts = [];
  if (session) parts.push('sessionid=' + session);
  if (csrf) parts.push('csrftoken=' + csrf);
  if (dsUserId) parts.push('ds_user_id=' + dsUserId);
  return parts.join('; ');
}

function getInstagramProviderHealth() {
  return {
    ...health,
    configured: Boolean(env('INSTAGRAM_SESSION_ID')),
    userCredentialsRequired: false,
    backendCredentialsRequired: true,
    browserRequired: false,
    externalServiceRequired: false,
    sessionConfigured: Boolean(env('INSTAGRAM_SESSION_ID'))
  };
}

function updateHealth(ok, error = '') {
  health.configured = Boolean(env('INSTAGRAM_SESSION_ID'));
  health.ok = ok;
  health.mode = 'session-feed';
  health.lastCheckedAt = nowIso();
  if (ok) {
    health.lastSuccessAt = nowIso();
    health.lastError = '';
  } else {
    health.lastError = compactError(error);
  }
}

function headers(source) {
  const cookie = sessionCookie();
  const h = {
    Accept: 'application/json, text/plain, */*',
    'Accept-Language': 'de-DE,de;q=0.9,en;q=0.8',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36',
    'X-IG-App-ID': env('INSTAGRAM_PUBLIC_APP_ID') || '936619743392459',
    'X-ASBD-ID': env('INSTAGRAM_PUBLIC_ASBD_ID') || '198387',
    'X-Requested-With': 'XMLHttpRequest',
    Referer: 'https://www.instagram.com/' + source + '/'
  };
  if (cookie) h.Cookie = cookie;
  const csrf = env('INSTAGRAM_CSRF_TOKEN');
  if (csrf) h['X-CSRFToken'] = csrf;
  return h;
}

async function requestJson(url, source, timeoutMs = 18000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      headers: headers(source),
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
    if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
      throw new Error('Instagram lieferte HTML statt JSON.');
    }
    return JSON.parse(trimmed);
  } finally {
    clearTimeout(timer);
  }
}

function identityFromProfile(data, source) {
  const user = data?.data?.user || data?.user || null;
  if (!user) return null;
  if (String(user.username || '').toLowerCase() !== source) return null;
  const id = String(user.id || user.pk || user.pk_id || '');
  if (!/^\d+$/.test(id)) return null;
  return {
    id,
    username: source,
    full_name: String(user.full_name || source),
    profile_pic_url: String(user.profile_pic_url_hd || user.profile_pic_url || '')
  };
}

function identityFromSearch(data, source) {
  for (const row of data?.users || []) {
    const user = row?.user || {};
    if (String(user.username || '').toLowerCase() !== source) continue;
    const id = String(user.pk || user.pk_id || user.id || '');
    if (!/^\d+$/.test(id)) continue;
    return {
      id,
      username: source,
      full_name: String(user.full_name || source),
      profile_pic_url: String(user.profile_pic_url || '')
    };
  }
  return null;
}

async function resolveIdentity(source, force = false) {
  const cached = identityCache.get(source);
  if (!force && cached && cached.expiresAt > Date.now()) return cached.identity;

  const errors = [];
  try {
    const data = await requestJson(
      'https://www.instagram.com/api/v1/users/web_profile_info/?username=' + encodeURIComponent(source),
      source
    );
    const identity = identityFromProfile(data, source);
    if (identity) {
      identityCache.set(source, { identity, expiresAt: Date.now() + 24 * 60 * 60 * 1000 });
      return identity;
    }
    errors.push('profile: keine User-ID');
  } catch (error) {
    errors.push('profile: ' + compactError(error));
  }

  try {
    const params = new URLSearchParams({ context: 'blended', query: source, include_reel: 'false' });
    const data = await requestJson('https://www.instagram.com/web/search/topsearch/?' + params.toString(), source);
    const identity = identityFromSearch(data, source);
    if (identity) {
      identityCache.set(source, { identity, expiresAt: Date.now() + 12 * 60 * 60 * 1000 });
      return identity;
    }
    errors.push('search: Handle nicht gefunden');
  } catch (error) {
    errors.push('search: ' + compactError(error));
  }

  throw new Error('Instagram User-ID konnte nicht aufgelöst werden (' + errors.join(' | ').slice(0, 650) + ').');
}

async function fetchNumericFeed(source, identity) {
  const data = await requestJson(
    'https://www.instagram.com/api/v1/feed/user/' + encodeURIComponent(identity.id) + '/?count=12',
    source
  );
  return base.parseInstagramFeedPayload(data, source, data?.user || identity);
}

function cacheSeconds() {
  const raw = Number(env('CREATOR_INSTAGRAM_MIN_FETCH_SECONDS') || 300);
  return Number.isFinite(raw) ? Math.max(180, Math.min(Math.floor(raw), 1800)) : 300;
}

function backoffSeconds(source) {
  const item = backoff.get(source);
  if (!item || item.until <= Date.now()) return 0;
  return Math.ceil((item.until - Date.now()) / 1000);
}

function noteFailure(source, error) {
  const previous = backoff.get(source)?.failures || 0;
  const failures = Math.min(previous + 1, 6);
  const baseSeconds = error?.status === 429 ? 120 : 30;
  const seconds = Math.min(baseSeconds * Math.pow(2, failures - 1), 30 * 60);
  backoff.set(source, { failures, until: Date.now() + seconds * 1000 });
}

function noteSuccess(source) {
  backoff.delete(source);
}

async function fetchInstagramSession(value) {
  const source = base.normalizeSocialHandle('instagram', value);
  if (!env('INSTAGRAM_SESSION_ID')) {
    const error = new Error('Instagram Session fehlt: INSTAGRAM_SESSION_ID einmalig serverseitig hinterlegen.');
    updateHealth(false, error);
    throw error;
  }

  const cached = snapshotCache.get(source);
  if (cached && Date.now() - cached.at < cacheSeconds() * 1000) return cached.snapshot;

  const wait = backoffSeconds(source);
  if (wait) throw new Error('Instagram pausiert nach Rate-Limit noch ca. ' + wait + 's.');

  if (inflight.has(source)) return inflight.get(source);

  const request = (async () => {
    try {
      let identity = await resolveIdentity(source, false);
      try {
        const snapshot = await fetchNumericFeed(source, identity);
        snapshotCache.set(source, { at: Date.now(), snapshot });
        noteSuccess(source);
        updateHealth(true);
        return snapshot;
      } catch (firstError) {
        if ([400, 401, 403, 404].includes(firstError?.status)) {
          identityCache.delete(source);
          identity = await resolveIdentity(source, true);
          const snapshot = await fetchNumericFeed(source, identity);
          snapshotCache.set(source, { at: Date.now(), snapshot });
          noteSuccess(source);
          updateHealth(true);
          return snapshot;
        }
        throw firstError;
      }
    } catch (error) {
      noteFailure(source, error);
      updateHealth(false, error);
      throw new Error('Instagram aktuell nicht abrufbar (' + compactError(error) + ').');
    } finally {
      inflight.delete(source);
    }
  })();

  inflight.set(source, request);
  return request;
}

module.exports = {
  identityFromProfile,
  identityFromSearch,
  fetchInstagramSession,
  getInstagramProviderHealth
};
