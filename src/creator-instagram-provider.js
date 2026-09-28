const base = require('./creator-social-providers');

let impitPromise = null;
const identityCache = new Map();
const snapshotCache = new Map();
const inflight = new Map();
const backoff = new Map();

const health = {
  configured: true,
  ok: true,
  mode: 'browser-tls',
  authenticated: false,
  lastCheckedAt: null,
  lastSuccessAt: null,
  lastError: ''
};

function optionalEnv(name) {
  return String(process.env[name] || '').trim();
}

function nowIso() {
  return new Date().toISOString();
}

function compactError(error) {
  return String(error?.message || error || 'Unbekannter Fehler').replace(/\s+/g, ' ').trim().slice(0, 260);
}

function updateHealth(ok, mode, error) {
  health.ok = ok;
  health.mode = mode || health.mode;
  health.authenticated = Boolean(optionalEnv('INSTAGRAM_SESSION_ID'));
  health.lastCheckedAt = nowIso();
  if (ok) {
    health.lastSuccessAt = nowIso();
    health.lastError = '';
  } else {
    health.lastError = compactError(error);
  }
}

function getInstagramProviderHealth() {
  return {
    ...health,
    configured: true,
    userCredentialsRequired: false,
    backendCredentialsRequired: false,
    browserRequired: false,
    tlsImpersonation: true,
    sessionConfigured: Boolean(optionalEnv('INSTAGRAM_SESSION_ID'))
  };
}

async function getImpit() {
  if (!impitPromise) {
    impitPromise = import('impit').then(mod => {
      if (!mod?.Impit) throw new Error('Impit HTTP transport konnte nicht geladen werden.');
      return new mod.Impit({ browser: 'chrome' });
    }).catch(error => {
      impitPromise = null;
      throw error;
    });
  }
  return impitPromise;
}

function cookieHeader() {
  const parts = [];
  const session = optionalEnv('INSTAGRAM_SESSION_ID');
  const csrf = optionalEnv('INSTAGRAM_CSRF_TOKEN');
  const dsUserId = optionalEnv('INSTAGRAM_DS_USER_ID');
  if (session) parts.push('sessionid=' + session);
  if (csrf) parts.push('csrftoken=' + csrf);
  if (dsUserId) parts.push('ds_user_id=' + dsUserId);
  return parts.join('; ');
}

function instagramHeaders(source, json = true) {
  const headers = {
    'Accept-Language': 'de-DE,de;q=0.9,en;q=0.8',
    'X-IG-App-ID': optionalEnv('INSTAGRAM_PUBLIC_APP_ID') || '936619743392459',
    'X-ASBD-ID': optionalEnv('INSTAGRAM_PUBLIC_ASBD_ID') || '198387',
    'X-Requested-With': 'XMLHttpRequest',
    Referer: 'https://www.instagram.com/' + source + '/'
  };
  if (json) headers.Accept = 'application/json, text/plain, */*';
  const cookie = cookieHeader();
  if (cookie) headers.Cookie = cookie;
  const csrf = optionalEnv('INSTAGRAM_CSRF_TOKEN');
  if (csrf) headers['X-CSRFToken'] = csrf;
  return headers;
}

async function request(client, url, options) {
  const response = await client.fetch(url, {
    ...(options || {}),
    headers: {
      ...(options?.headers || {})
    },
    redirect: 'follow'
  });
  const text = await response.text();
  const finalUrl = String(response.url || url);
  if (!response.ok) {
    const error = new Error('HTTP ' + response.status + (text ? ': ' + text.replace(/\s+/g, ' ').slice(0, 220) : ''));
    error.status = response.status;
    throw error;
  }
  return { text, finalUrl, headers: response.headers };
}

async function requestJson(client, url, options) {
  const result = await request(client, url, options);
  const content = result.text.trim();
  if (!content.startsWith('{') && !content.startsWith('[')) {
    throw new Error('Instagram lieferte HTML statt JSON' + (result.finalUrl ? ' (' + result.finalUrl + ')' : '') + '.');
  }
  try {
    return { data: JSON.parse(content), finalUrl: result.finalUrl };
  } catch {
    throw new Error('Instagram lieferte ungültiges JSON.');
  }
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

function identityFromHtml(html, source) {
  const text = String(html || '');
  const scripts = [...text.matchAll(/<script[^>]+type=["']application\/json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  const walk = (value, visit, depth = 0) => {
    if (!value || depth > 20) return;
    if (Array.isArray(value)) {
      for (const item of value) walk(item, visit, depth + 1);
      return;
    }
    if (typeof value !== 'object') return;
    visit(value);
    for (const child of Object.values(value)) walk(child, visit, depth + 1);
  };
  for (const match of scripts) {
    try {
      let found = null;
      walk(JSON.parse(match[1]), node => {
        if (found || String(node?.username || '').toLowerCase() !== source) return;
        const id = String(node.pk || node.pk_id || node.id || node.profile_id || '');
        if (!/^\d+$/.test(id)) return;
        found = {
          id,
          username: source,
          full_name: String(node.full_name || node.name || source),
          profile_pic_url: String(node.profile_pic_url || node.profile_pic_url_hd || '')
        };
      });
      if (found) return found;
    } catch {}
  }
  const match = text.match(/profilePage_(\d+)/i) || text.match(/["']profile_id["']\s*:\s*["']?(\d+)/i);
  return match ? { id: match[1], username: source, full_name: source, profile_pic_url: '' } : null;
}

async function resolveIdentity(client, source, force) {
  const cached = identityCache.get(source);
  if (!force && cached && cached.expiresAt > Date.now()) return cached.identity;

  const errors = [];
  try {
    const params = new URLSearchParams({ context: 'blended', query: source, include_reel: 'false' });
    const result = await requestJson(client, 'https://www.instagram.com/web/search/topsearch/?' + params.toString(), {
      headers: instagramHeaders(source)
    });
    const identity = identityFromSearch(result.data, source);
    if (identity) {
      identityCache.set(source, { identity, expiresAt: Date.now() + 24 * 60 * 60 * 1000 });
      return identity;
    }
    errors.push('Search: Handle nicht gefunden');
  } catch (error) {
    errors.push('Search: ' + compactError(error));
  }

  try {
    const result = await request(client, 'https://www.instagram.com/' + encodeURIComponent(source) + '/', {
      headers: {
        ...instagramHeaders(source, false),
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      }
    });
    const identity = identityFromHtml(result.text, source);
    if (identity) {
      identityCache.set(source, { identity, expiresAt: Date.now() + 6 * 60 * 60 * 1000 });
      return identity;
    }
    errors.push('HTML: keine User-ID');
  } catch (error) {
    errors.push('HTML: ' + compactError(error));
  }

  throw new Error('Instagram User-ID konnte nicht aufgelöst werden (' + errors.join(' | ').slice(0, 600) + ').');
}

async function fetchTimelineById(client, source, identity) {
  const url = 'https://www.instagram.com/api/v1/feed/user/' + encodeURIComponent(identity.id) + '/?count=12';
  const result = await requestJson(client, url, { headers: instagramHeaders(source) });
  return base.parseInstagramFeedPayload(result.data, source, result.data?.user || identity);
}

async function fetchTimelineByUsername(client, source) {
  const url = 'https://www.instagram.com/api/v1/feed/user/' + encodeURIComponent(source) + '/username/?count=12';
  const result = await requestJson(client, url, { headers: instagramHeaders(source) });
  return base.parseInstagramFeedPayload(result.data, source, result.data?.user || result.data?.items?.[0]?.user || {});
}

function snapshotCacheSeconds() {
  const raw = Number(optionalEnv('CREATOR_INSTAGRAM_MIN_FETCH_SECONDS') || 300);
  return Number.isFinite(raw) ? Math.max(120, Math.min(Math.floor(raw), 1800)) : 300;
}

function backoffSeconds(source) {
  const item = backoff.get(source);
  if (!item || item.until <= Date.now()) return 0;
  return Math.max(1, Math.ceil((item.until - Date.now()) / 1000));
}

function noteFailure(source) {
  const previous = backoff.get(source)?.failures || 0;
  const failures = Math.min(previous + 1, 6);
  const seconds = Math.min(15 * Math.pow(2, failures), 15 * 60);
  backoff.set(source, { failures, until: Date.now() + seconds * 1000 });
}

function noteSuccess(source) {
  backoff.delete(source);
}

async function fetchInstagramPost(value) {
  const source = base.normalizeSocialHandle('instagram', value);
  const cached = snapshotCache.get(source);
  if (cached && Date.now() - cached.at < snapshotCacheSeconds() * 1000) return cached.snapshot;
  const wait = backoffSeconds(source);
  if (wait) throw new Error('Instagram Provider pausiert nach Rate-Limit noch ca. ' + wait + 's.');
  if (inflight.has(source)) return inflight.get(source);

  const promise = (async () => {
    const client = await getImpit();
    const errors = [];
    try {
      let identity = null;
      try {
        identity = await resolveIdentity(client, source, false);
      } catch (error) {
        errors.push(compactError(error));
      }

      if (identity?.id) {
        try {
          const snapshot = await fetchTimelineById(client, source, identity);
          snapshotCache.set(source, { at: Date.now(), snapshot });
          noteSuccess(source);
          updateHealth(true, optionalEnv('INSTAGRAM_SESSION_ID') ? 'session-id-feed' : 'public-id-feed');
          return snapshot;
        } catch (error) {
          errors.push('ID-Feed: ' + compactError(error));
          if ([400, 401, 403, 429].includes(error?.status)) identityCache.delete(source);
        }
      }

      try {
        const snapshot = await fetchTimelineByUsername(client, source);
        snapshotCache.set(source, { at: Date.now(), snapshot });
        noteSuccess(source);
        updateHealth(true, 'username-feed');
        return snapshot;
      } catch (error) {
        errors.push('Username-Feed: ' + compactError(error));
      }

      throw new Error('Instagram aktuell nicht abrufbar (' + errors.join(' | ').slice(0, 700) + ').');
    } catch (error) {
      noteFailure(source);
      updateHealth(false, 'browser-tls', error);
      throw error;
    } finally {
      inflight.delete(source);
    }
  })();

  inflight.set(source, promise);
  return promise;
}

module.exports = {
  fetchInstagramPost,
  getInstagramProviderHealth,
  identityFromSearch,
  identityFromHtml
};
