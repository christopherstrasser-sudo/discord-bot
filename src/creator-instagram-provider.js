const base = require('./creator-social-providers');

const HIKER_BASE = 'https://api.hikerapi.com';
const SCRAPECREATORS_BASE = 'https://api.scrapecreators.com';

const cache = new Map();
const inflight = new Map();
const userIdCache = new Map();

const health = {
  configured: false,
  ok: true,
  mode: 'managed-provider',
  lastCheckedAt: null,
  lastSuccessAt: null,
  lastError: '',
  provider: ''
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

function providerConfig() {
  const relayUrl = (env('ORBIT_SOCIAL_RELAY_URL') || env('RAKU_SOCIAL_RELAY_URL')).replace(/\/+$/, '');
  const relayToken = env('ORBIT_SOCIAL_RELAY_TOKEN') || env('RAKU_SOCIAL_RELAY_TOKEN');
  const hikerKey = env('HIKERAPI_KEY');
  const scrapeCreatorsKey = env('SCRAPECREATORS_API_KEY');
  return { relayUrl, relayToken, hikerKey, scrapeCreatorsKey };
}

function getInstagramProviderHealth() {
  const cfg = providerConfig();
  const configured = Boolean(cfg.relayUrl || cfg.hikerKey || cfg.scrapeCreatorsKey);
  return {
    ...health,
    configured,
    userCredentialsRequired: false,
    browserRequired: false,
    directInstagramRequests: false,
    managedProvider: true,
    hikerConfigured: Boolean(cfg.hikerKey),
    scrapeCreatorsConfigured: Boolean(cfg.scrapeCreatorsKey),
    relayConfigured: Boolean(cfg.relayUrl)
  };
}

function updateHealth(ok, provider, error = '') {
  health.configured = true;
  health.ok = ok;
  health.provider = provider || health.provider || '';
  health.mode = provider || 'managed-provider';
  health.lastCheckedAt = nowIso();
  if (ok) {
    health.lastSuccessAt = nowIso();
    health.lastError = '';
  } else {
    health.lastError = compactError(error);
  }
}

function ttlMs() {
  const raw = Number(env('CREATOR_INSTAGRAM_MIN_FETCH_SECONDS') || 300);
  const seconds = Number.isFinite(raw) ? Math.max(120, Math.min(Math.floor(raw), 1800)) : 300;
  return seconds * 1000;
}

async function requestJson(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Number(options.timeoutMs || 20000));
  try {
    const response = await fetch(url, {
      method: options.method || 'GET',
      headers: {
        Accept: 'application/json',
        'User-Agent': 'Orbit-Discord-Control/0.31',
        ...(options.headers || {})
      },
      body: options.body,
      redirect: 'follow',
      signal: controller.signal
    });
    const text = await response.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch {}
    if (!response.ok) {
      const detail = data?.message || data?.detail || data?.error || text || `HTTP ${response.status}`;
      const error = new Error(`HTTP ${response.status}: ${String(detail).replace(/\s+/g, ' ').slice(0, 260)}`);
      error.status = response.status;
      throw error;
    }
    return data;
  } finally {
    clearTimeout(timer);
  }
}

function cached(source, loader) {
  const hit = cache.get(source);
  if (hit && Date.now() - hit.at < ttlMs()) return Promise.resolve(hit.value);
  if (inflight.has(source)) return inflight.get(source);
  const request = Promise.resolve()
    .then(loader)
    .then(value => {
      cache.set(source, { at: Date.now(), value });
      return value;
    })
    .finally(() => inflight.delete(source));
  inflight.set(source, request);
  return request;
}

function timestampMs(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value > 1e12 ? value : value * 1000;
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 0) return numeric > 1e12 ? numeric : numeric * 1000;
  const parsed = Date.parse(String(value || ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function shortcodeFromUrl(value) {
  const match = String(value || '').match(/instagram\.com\/(?:p|reel|tv)\/([A-Za-z0-9_-]+)/i);
  return String(match?.[1] || '');
}

function mediaShortcode(media) {
  return String(
    media?.code ||
    media?.shortcode ||
    media?.xdt_shortcode ||
    shortcodeFromUrl(media?.permalink) ||
    shortcodeFromUrl(media?.url) ||
    shortcodeFromUrl(media?.link) ||
    ''
  ).trim();
}

function mediaOwner(media) {
  return String(
    media?.user?.username ||
    media?.owner?.username ||
    media?.username ||
    media?.author?.username ||
    ''
  ).replace(/^@/, '').toLowerCase();
}

function mediaCaption(media) {
  return String(
    media?.caption_text ||
    media?.caption?.text ||
    media?.caption ||
    media?.text ||
    media?.title ||
    ''
  ).replace(/\s+/g, ' ').trim();
}

function mediaImage(media) {
  const candidates = [
    media?.thumbnail_url,
    media?.display_url,
    media?.media_url,
    media?.image_versions2?.candidates?.[0]?.url,
    media?.carousel_media?.[0]?.image_versions2?.candidates?.[0]?.url,
    media?.image?.url
  ];
  return String(candidates.find(Boolean) || '');
}

function mediaPublishedMs(media) {
  return timestampMs(
    media?.taken_at ??
    media?.taken_at_timestamp ??
    media?.created_at ??
    media?.created_at_utc ??
    media?.timestamp ??
    media?.caption?.created_at_utc ??
    media?.caption?.created_at
  );
}

function isReel(media) {
  const type = String(media?.product_type || media?.media_type || media?.type || '').toLowerCase();
  return type === 'clips' || type === 'reel' || type === 'video' || type === '2' || Boolean(media?.video_url || media?.video_versions?.length);
}

function collectMediaItems(data) {
  if (!data) return [];
  if (Array.isArray(data)) {
    if (Array.isArray(data[0])) return data[0];
    return data.filter(item => item && typeof item === 'object');
  }
  const candidates = [
    data.items,
    data.medias,
    data.media,
    data.posts,
    data.data?.items,
    data.data?.medias,
    data.data?.posts,
    data.response?.items
  ];
  for (const value of candidates) {
    if (Array.isArray(value)) return value;
  }
  return [];
}

function normalizeInstagramSnapshot(source, profile, media) {
  const shortcode = mediaShortcode(media);
  if (!shortcode) throw new Error('Instagram Provider lieferte einen Post ohne Shortcode.');
  const owner = mediaOwner(media);
  if (owner && owner !== source) throw new Error(`Instagram Provider lieferte fremden Content von @${owner}.`);

  const publishedMs = mediaPublishedMs(media);
  if (!publishedMs) throw new Error('Instagram Provider lieferte einen Post ohne Veröffentlichungszeit.');
  const creator = String(profile?.full_name || profile?.name || profile?.username || owner || source);
  const publishedAt = new Date(publishedMs).toISOString();
  const reel = isReel(media);
  const url = String(media?.permalink || media?.url || media?.link || `https://www.instagram.com/${reel ? 'reel' : 'p'}/${encodeURIComponent(shortcode)}/`);
  return {
    platform: 'instagram',
    source,
    creator,
    exists: true,
    live: false,
    id: shortcode,
    providerMediaId: String(media?.pk || media?.id || ''),
    eventKey: `instagram:${source}:post:${shortcode}`,
    title: mediaCaption(media) || `${creator} hat einen neuen Instagram-Post veröffentlicht.`,
    game: '',
    url,
    thumbnail: mediaImage(media),
    avatar: String(profile?.profile_pic_url_hd || profile?.profile_picture_url || profile?.profile_pic_url || ''),
    publishedAt,
    startedAt: publishedAt,
    viewers: 0
  };
}

function latestOwnSnapshot(source, profile, medias) {
  const candidates = medias
    .map(media => {
      try {
        return normalizeInstagramSnapshot(source, profile, media);
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
  if (!candidates.length) throw new Error('Instagram Provider lieferte keine auswertbaren eigenen Posts.');
  return candidates[0];
}

async function fetchViaRelay(source, cfg) {
  const data = await requestJson(`${cfg.relayUrl}/v1/instagram/latest?handle=${encodeURIComponent(source)}`, {
    headers: cfg.relayToken ? { Authorization: `Bearer ${cfg.relayToken}` } : {}
  });
  const raw = data?.snapshot || data;
  if (!raw) throw new Error('ORBIT Social Relay lieferte keine Daten.');
  const shortcode = mediaShortcode(raw) || String(raw.id || '');
  if (!shortcode) throw new Error('ORBIT Social Relay lieferte keinen Shortcode.');
  const publishedMs = timestampMs(raw.publishedAt || raw.startedAt || raw.created_at || raw.taken_at);
  if (!publishedMs) throw new Error('ORBIT Social Relay lieferte keine Veröffentlichungszeit.');
  const publishedAt = new Date(publishedMs).toISOString();
  const creator = String(raw.creator || raw.username || source);
  return {
    platform: 'instagram',
    source,
    creator,
    exists: true,
    live: false,
    id: shortcode,
    providerMediaId: String(raw.providerMediaId || ''),
    eventKey: `instagram:${source}:post:${shortcode}`,
    title: String(raw.title || `${creator} hat einen neuen Instagram-Post veröffentlicht.`),
    game: '',
    url: String(raw.url || `https://www.instagram.com/p/${encodeURIComponent(shortcode)}/`),
    thumbnail: String(raw.thumbnail || ''),
    avatar: String(raw.avatar || ''),
    publishedAt,
    startedAt: publishedAt,
    viewers: 0
  };
}

async function hikerUser(source, key) {
  const hit = userIdCache.get(source);
  if (hit && hit.expiresAt > Date.now()) return hit.user;
  const params = new URLSearchParams({ username: source });
  const user = await requestJson(`${HIKER_BASE}/v1/user/by/username?${params.toString()}`, {
    headers: { 'x-access-key': key }
  });
  if (!user || (!user.pk && !user.id)) throw new Error('HikerAPI konnte das Instagram-Profil nicht auflösen.');
  if (user.is_private) throw new Error('Instagram Profil ist privat.');
  const normalized = { ...user, pk: String(user.pk || user.id) };
  userIdCache.set(source, { user: normalized, expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000 });
  return normalized;
}

async function fetchViaHiker(source, key) {
  const user = await hikerUser(source, key);
  const params = new URLSearchParams({ user_id: String(user.pk) });
  const data = await requestJson(`${HIKER_BASE}/v1/user/medias/chunk?${params.toString()}`, {
    headers: { 'x-access-key': key }
  });
  return latestOwnSnapshot(source, user, collectMediaItems(data));
}

async function fetchViaScrapeCreators(source, key) {
  const params = new URLSearchParams({ handle: source, trim: 'false' });
  const data = await requestJson(`${SCRAPECREATORS_BASE}/v2/instagram/user/posts?${params.toString()}`, {
    headers: { 'x-api-key': key }
  });
  const profile = data?.user || data?.profile || data?.items?.[0]?.user || {};
  if (profile?.is_private) throw new Error('Instagram Profil ist privat.');
  return latestOwnSnapshot(source, profile, collectMediaItems(data));
}

async function fetchInstagramManaged(value) {
  const source = base.normalizeSocialHandle('instagram', value);
  const cfg = providerConfig();
  if (!cfg.relayUrl && !cfg.hikerKey && !cfg.scrapeCreatorsKey) {
    updateHealth(false, 'setup-required', 'Kein Instagram Read-Provider konfiguriert. HIKERAPI_KEY oder SCRAPECREATORS_API_KEY serverseitig hinterlegen.');
    throw new Error('Instagram Read-Provider fehlt: HIKERAPI_KEY oder SCRAPECREATORS_API_KEY serverseitig hinterlegen.');
  }

  return cached(source, async () => {
    const errors = [];

    if (cfg.relayUrl) {
      try {
        const snapshot = await fetchViaRelay(source, cfg);
        updateHealth(true, 'orbit-relay');
        return snapshot;
      } catch (error) {
        errors.push(`Relay: ${compactError(error)}`);
      }
    }

    if (cfg.hikerKey) {
      try {
        const snapshot = await fetchViaHiker(source, cfg.hikerKey);
        updateHealth(true, 'hikerapi');
        return snapshot;
      } catch (error) {
        errors.push(`HikerAPI: ${compactError(error)}`);
      }
    }

    if (cfg.scrapeCreatorsKey) {
      try {
        const snapshot = await fetchViaScrapeCreators(source, cfg.scrapeCreatorsKey);
        updateHealth(true, 'scrapecreators');
        return snapshot;
      } catch (error) {
        errors.push(`ScrapeCreators: ${compactError(error)}`);
      }
    }

    const message = `Instagram Provider aktuell nicht abrufbar (${errors.join(' | ').slice(0, 700)}).`;
    updateHealth(false, 'managed-provider', message);
    throw new Error(message);
  });
}

module.exports = {
  collectMediaItems,
  mediaShortcode,
  normalizeInstagramSnapshot,
  latestOwnSnapshot,
  fetchInstagramManaged,
  getInstagramProviderHealth
};
