const base = require('./creator-social-providers');
const { fetchInstagramKeyless } = require('./creator-instagram-keyless');
const { fetchInstagramImginn } = require('./creator-instagram-imginn');

const providerHealth = {
  x: { ok: true, mode: 'x-md', lastCheckedAt: null, lastSuccessAt: null, lastError: '' },
  instagram: { ok: true, mode: 'imginn-relay', lastCheckedAt: null, lastSuccessAt: null, lastError: '' }
};

const cache = new Map();
const inflight = new Map();

function nowIso() {
  return new Date().toISOString();
}

function optionalEnv(name) {
  return String(process.env[name] || '').trim();
}

function updateHealth(platform, ok, mode, error = '') {
  providerHealth[platform] = {
    ...providerHealth[platform],
    ok,
    mode,
    lastCheckedAt: nowIso(),
    ...(ok ? { lastSuccessAt: nowIso(), lastError: '' } : { lastError: String(error || '').slice(0, 500) })
  };
}

function sourceKey(platform, source) {
  return `${platform}:${String(source || '').replace(/^@/, '').trim().toLowerCase()}`;
}

function compactError(error) {
  return String(error?.message || error || 'Unbekannter Fehler').replace(/\s+/g, ' ').trim().slice(0, 260);
}

async function fetchJson(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(options.timeoutMs || 15000));
  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        Accept: 'application/json',
        'User-Agent': 'Orbit-Discord-Control/0.29',
        ...(options.headers || {})
      },
      signal: controller.signal
    });
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      const error = new Error(`HTTP ${response.status}${body ? `: ${body.slice(0, 220)}` : ''}`);
      error.status = response.status;
      throw error;
    }
    return response.json();
  } finally {
    clearTimeout(timeout);
  }
}

function cached(platform, source, ttlMs, loader) {
  const key = sourceKey(platform, source);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return Promise.resolve(hit.value);
  if (inflight.has(key)) return inflight.get(key);
  const request = Promise.resolve()
    .then(loader)
    .then(value => {
      cache.set(key, { at: Date.now(), value });
      return value;
    })
    .finally(() => inflight.delete(key));
  inflight.set(key, request);
  return request;
}

function timestampMs(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value > 1e12 ? value : value * 1000;
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 0) return numeric > 1e12 ? numeric : numeric * 1000;
  const parsed = Date.parse(String(value || ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function xMedia(post) {
  const media = post?.media || {};
  const candidates = [
    ...(Array.isArray(media.photos) ? media.photos : []),
    ...(Array.isArray(media.videos) ? media.videos : []),
    ...(Array.isArray(media.animated) ? media.animated : []),
    ...(Array.isArray(media.all) ? media.all : [])
  ];
  const first = candidates.find(Boolean) || null;
  return String(first?.url || first?.thumbnail_url || media?.mosaic?.formats?.jpeg || media?.mosaic?.formats?.webp || '');
}

function xMdSnapshot(data, source) {
  const profile = data?.profile || {};
  const posts = Array.isArray(data?.posts) ? data.posts : [];
  const candidates = posts
    .filter(post => post?.id && !post?.replying_to && !post?.replying_to_status && !post?.reposted_by)
    .map(post => ({ post, ms: timestampMs(post.created_at || post.created_timestamp) }))
    .filter(entry => entry.ms > 0)
    .sort((a, b) => b.ms - a.ms);
  const current = candidates[0];
  if (!current) throw new Error('X Provider hat keine öffentlichen Originalposts geliefert.');

  const post = current.post;
  const author = post.author || profile || {};
  const handle = String(author.screen_name || profile.screen_name || source).replace(/^@/, '');
  const id = String(post.id);
  const publishedAt = new Date(current.ms).toISOString();
  return {
    platform: 'x',
    source,
    creator: String(author.name || profile.name || handle),
    exists: true,
    live: false,
    id,
    eventKey: `x:${source}:post:${id}`,
    title: String(post.text || '').replace(/\s+/g, ' ').trim() || `${handle} hat einen neuen Post auf X veröffentlicht.`,
    game: '',
    url: String(post.url || `https://x.com/${encodeURIComponent(handle)}/status/${encodeURIComponent(id)}`),
    thumbnail: xMedia(post),
    avatar: String(author.avatar_url || profile.avatar_url || ''),
    publishedAt,
    startedAt: publishedAt,
    viewers: 0
  };
}

async function fetchXMdPost(value) {
  const source = base.normalizeSocialHandle('x', value);
  return cached('x', source, 3 * 60 * 1000, async () => {
    const data = await fetchJson(`https://x.pcstyle.dev/api/v1/profiles/${encodeURIComponent(source)}?format=json&limit=10`, { timeoutMs: 18000 });
    const snapshot = xMdSnapshot(data, source);
    updateHealth('x', true, 'x-md');
    return snapshot;
  }).catch(error => {
    updateHealth('x', false, 'x-md', error);
    throw new Error(`X Provider aktuell nicht abrufbar (${compactError(error)}).`);
  });
}

async function fetchInstagramImginnPost(value) {
  const source = base.normalizeSocialHandle('instagram', value);
  return cached('instagram-imginn', source, 8 * 60 * 1000, async () => {
    const snapshot = await fetchInstagramImginn(source, { maxDetails: 6, timeoutMs: 18000 });
    updateHealth('instagram', true, 'imginn-relay');
    return snapshot;
  }).catch(error => {
    throw new Error(`Imginn Relay: ${compactError(error)}`);
  });
}

async function fetchInstagramScrapeCreators(value) {
  const source = base.normalizeSocialHandle('instagram', value);
  const apiKey = optionalEnv('SCRAPECREATORS_API_KEY');
  if (!apiKey) throw new Error('Orbit Instagram Provider ist serverseitig noch nicht konfiguriert.');

  return cached('instagram-provider', source, 5 * 60 * 1000, async () => {
    const params = new URLSearchParams({ handle: source, trim: 'false' });
    const data = await fetchJson(`https://api.scrapecreators.com/v2/instagram/user/posts?${params.toString()}`, {
      timeoutMs: 20000,
      headers: { 'x-api-key': apiKey }
    });
    const snapshot = base.parseInstagramFeedPayload(data, source);
    updateHealth('instagram', true, 'server-provider');
    return snapshot;
  }).catch(error => {
    updateHealth('instagram', false, 'server-provider', error);
    throw error;
  });
}

async function fetchInstagramRelay(source, relayUrl, relayToken) {
  return cached('instagram-relay', source, 5 * 60 * 1000, async () => {
    const data = await fetchJson(`${relayUrl}/v1/instagram/latest?handle=${encodeURIComponent(source)}`, {
      timeoutMs: 20000,
      headers: relayToken ? { Authorization: `Bearer ${relayToken}` } : {}
    });
    const snapshot = data?.snapshot || data;
    if (!snapshot?.id || !snapshot?.url) throw new Error('Orbit Social Relay lieferte keinen gültigen Instagram-Post.');
    updateHealth('instagram', true, 'orbit-relay');
    return { ...snapshot, platform: 'instagram', source };
  });
}

async function fetchInstagramPost(value) {
  const source = base.normalizeSocialHandle('instagram', value);
  const relayUrl = (optionalEnv('ORBIT_SOCIAL_RELAY_URL') || optionalEnv('RAKU_SOCIAL_RELAY_URL')).replace(/\/+$/, '');
  const relayToken = optionalEnv('ORBIT_SOCIAL_RELAY_TOKEN') || optionalEnv('RAKU_SOCIAL_RELAY_TOKEN');
  const errors = [];

  // Stable server-side providers take priority. Dashboard users still only enter a handle.
  if (relayUrl) {
    try {
      return await fetchInstagramRelay(source, relayUrl, relayToken);
    } catch (error) {
      errors.push(`Orbit Relay: ${compactError(error)}`);
    }
  }

  if (optionalEnv('SCRAPECREATORS_API_KEY')) {
    try {
      return await fetchInstagramScrapeCreators(source);
    } catch (error) {
      errors.push(`Provider: ${compactError(error)}`);
    }
  }

  try {
    return await fetchInstagramImginnPost(source);
  } catch (error) {
    errors.push(compactError(error));
  }

  try {
    const result = await fetchInstagramKeyless(source);
    updateHealth('instagram', true, result.mode || 'keyless-web');
    return result.snapshot;
  } catch (error) {
    errors.push(`Instagram direkt: ${compactError(error)}`);
  }

  const message = `Instagram aktuell nicht abrufbar (${errors.join(' | ').slice(0, 760)}).`;
  updateHealth('instagram', false, 'imginn-relay', message);
  throw new Error(message);
}

async function fetchSocialPost(platform, source) {
  if (platform === 'x') return fetchXMdPost(source);
  if (platform === 'instagram') return fetchInstagramPost(source);
  return base.fetchSocialPost(platform, source);
}

function getSocialProviderHealth() {
  const health = base.getSocialProviderHealth();
  health.x = {
    ...(health.x || {}),
    ...providerHealth.x,
    configured: true,
    userCredentialsRequired: false
  };
  health.instagram = {
    ...(health.instagram || {}),
    ...providerHealth.instagram,
    configured: true,
    userCredentialsRequired: false,
    browserRequired: false,
    publicRelayAvailable: true,
    keylessProfileFeed: true,
    serverProviderConfigured: Boolean(optionalEnv('ORBIT_SOCIAL_RELAY_URL') || optionalEnv('RAKU_SOCIAL_RELAY_URL') || optionalEnv('SCRAPECREATORS_API_KEY'))
  };
  return health;
}

module.exports = {
  ...base,
  fetchSocialPost,
  getSocialProviderHealth,
  xMdSnapshot
};
