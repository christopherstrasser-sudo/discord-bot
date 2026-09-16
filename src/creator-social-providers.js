const SOCIAL_PLATFORMS = new Set(['instagram', 'bluesky', 'x']);

const providerHealth = {
  instagram: { configured: false, ok: false, lastCheckedAt: null, lastSuccessAt: null, lastError: '' },
  bluesky: { configured: true, ok: true, lastCheckedAt: null, lastSuccessAt: null, lastError: '' },
  x: { configured: false, ok: false, lastCheckedAt: null, lastSuccessAt: null, lastError: '' }
};

const xUserCache = new Map();
const X_USER_CACHE_MS = 24 * 60 * 60 * 1000;

function nowIso() {
  return new Date().toISOString();
}

function optionalEnv(name) {
  return String(process.env[name] || '').trim();
}

function updateHealth(provider, patch) {
  providerHealth[provider] = {
    ...providerHealth[provider],
    ...patch,
    lastCheckedAt: nowIso()
  };
}

function success(provider) {
  updateHealth(provider, { ok: true, lastSuccessAt: nowIso(), lastError: '' });
}

function failure(provider, error) {
  updateHealth(provider, {
    ok: false,
    lastError: String(error?.message || error || 'Unbekannter Fehler').slice(0, 500)
  });
}

function getSocialProviderHealth() {
  const instagramConfigured = Boolean(optionalEnv('INSTAGRAM_GRAPH_ACCESS_TOKEN') && optionalEnv('INSTAGRAM_GRAPH_IG_USER_ID'));
  const xConfigured = Boolean(optionalEnv('X_BEARER_TOKEN'));
  return JSON.parse(JSON.stringify({
    instagram: { ...providerHealth.instagram, configured: instagramConfigured },
    bluesky: { ...providerHealth.bluesky, configured: true },
    x: { ...providerHealth.x, configured: xConfigured }
  }));
}

async function fetchJson(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(options.timeoutMs || 12000));
  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        Accept: 'application/json',
        'User-Agent': 'RAKU-Creator-Hub/1.0',
        ...(options.headers || {})
      },
      signal: controller.signal
    });
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`HTTP ${response.status}${body ? `: ${body.slice(0, 300)}` : ''}`);
    }
    return response.json();
  } finally {
    clearTimeout(timeout);
  }
}

function cleanPostText(value, fallback = 'Neuer Post') {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text || fallback;
}

function normalizeSocialHandle(platform, value) {
  let source = String(value || '').trim();
  if (!source) return '';

  if (platform === 'instagram') {
    if (/^(?:https?:\/\/)?(?:www\.)?instagram\.com\//i.test(source)) {
      const url = new URL(/^https?:\/\//i.test(source) ? source : `https://${source}`);
      source = decodeURIComponent(url.pathname || '').split('/').filter(Boolean)[0] || '';
    }
    source = source.replace(/^@/, '').toLowerCase();
    if (!/^[a-z0-9._]{1,30}$/.test(source)) throw new Error('Instagram: Bitte einen gültigen @Handle eintragen.');
    return source;
  }

  if (platform === 'bluesky') {
    if (/^(?:https?:\/\/)?bsky\.app\/profile\//i.test(source)) {
      const url = new URL(/^https?:\/\//i.test(source) ? source : `https://${source}`);
      const match = decodeURIComponent(url.pathname || '').match(/^\/profile\/([^/?#]+)/i);
      source = match?.[1] || '';
    }
    source = source.replace(/^@/, '').toLowerCase();
    if (/^did:[a-z0-9:%._-]+$/i.test(source)) return source;
    if (!/^(?=.{3,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(source)) {
      throw new Error('Bluesky: Bitte einen Handle wie name.bsky.social oder eine bsky.app/profile/... URL eintragen.');
    }
    return source;
  }

  if (platform === 'x') {
    if (/^(?:https?:\/\/)?(?:www\.)?(?:x|twitter)\.com\//i.test(source)) {
      const url = new URL(/^https?:\/\//i.test(source) ? source : `https://${source}`);
      source = decodeURIComponent(url.pathname || '').split('/').filter(Boolean)[0] || '';
    }
    source = source.replace(/^@/, '').toLowerCase();
    if (!/^[a-z0-9_]{1,15}$/.test(source)) throw new Error('X: Bitte einen gültigen @Handle eintragen.');
    return source;
  }

  throw new Error(`Unbekannte Social-Plattform: ${platform}`);
}

function newestByTimestamp(items) {
  return [...items].sort((a, b) => Date.parse(b?.timestamp || b?.created_at || b?.createdAt || 0) - Date.parse(a?.timestamp || a?.created_at || a?.createdAt || 0))[0] || null;
}

async function fetchInstagramPost(value) {
  const source = normalizeSocialHandle('instagram', value);
  const token = optionalEnv('INSTAGRAM_GRAPH_ACCESS_TOKEN');
  const igUserId = optionalEnv('INSTAGRAM_GRAPH_IG_USER_ID');
  const apiVersion = optionalEnv('INSTAGRAM_GRAPH_VERSION') || 'v26.0';
  if (!token || !igUserId) throw new Error('Instagram Provider ist nicht konfiguriert. INSTAGRAM_GRAPH_ACCESS_TOKEN und INSTAGRAM_GRAPH_IG_USER_ID fehlen.');

  try {
    const fields = `business_discovery.username(${source}){username,name,profile_picture_url,media.limit(5){id,caption,media_type,media_url,permalink,thumbnail_url,timestamp}}`;
    const params = new URLSearchParams({ fields, access_token: token });
    const data = await fetchJson(`https://graph.facebook.com/${encodeURIComponent(apiVersion)}/${encodeURIComponent(igUserId)}?${params.toString()}`);
    const account = data?.business_discovery;
    if (!account) throw new Error('Instagram Account nicht gefunden oder nicht als Professional Account über Business Discovery erreichbar.');
    const media = newestByTimestamp(account?.media?.data || []);
    if (!media?.id) throw new Error('Instagram Account hat keine abrufbaren Posts.');

    const thumbnail = String(media.thumbnail_url || (media.media_type === 'IMAGE' ? media.media_url : '') || '');
    const creator = String(account.name || account.username || source);
    const publishedAt = String(media.timestamp || '');
    const result = {
      platform: 'instagram',
      source,
      creator,
      exists: true,
      live: false,
      id: String(media.id),
      eventKey: `instagram:${source}:post:${media.id}`,
      title: cleanPostText(media.caption, `${creator} hat einen neuen Instagram-Post veröffentlicht.`),
      game: '',
      url: String(media.permalink || `https://www.instagram.com/${source}/`),
      thumbnail,
      avatar: String(account.profile_picture_url || ''),
      publishedAt,
      startedAt: publishedAt,
      viewers: 0
    };
    success('instagram');
    return result;
  } catch (error) {
    failure('instagram', error);
    throw error;
  }
}

function blueskyPostUrl(post, source) {
  const uri = String(post?.uri || '');
  const rkey = uri.split('/').filter(Boolean).at(-1) || '';
  const handle = String(post?.author?.handle || source || '');
  return rkey && handle ? `https://bsky.app/profile/${encodeURIComponent(handle)}/post/${encodeURIComponent(rkey)}` : `https://bsky.app/profile/${encodeURIComponent(handle || source)}`;
}

function blueskyThumbnail(embed) {
  return String(embed?.images?.[0]?.thumb || embed?.external?.thumb || embed?.media?.images?.[0]?.thumb || embed?.media?.external?.thumb || '');
}

async function fetchBlueskyPost(value) {
  const source = normalizeSocialHandle('bluesky', value);
  try {
    const params = new URLSearchParams({ actor: source, limit: '10', filter: 'posts_no_replies' });
    const data = await fetchJson(`https://public.api.bsky.app/xrpc/app.bsky.feed.getAuthorFeed?${params.toString()}`);
    const item = (data?.feed || []).find(entry => !entry?.reason && entry?.post?.record?.$type === 'app.bsky.feed.post') || null;
    const post = item?.post;
    if (!post?.uri) throw new Error('Bluesky Account wurde nicht gefunden oder hat keine abrufbaren Posts.');
    const record = post.record || {};
    const id = String(post.uri).split('/').filter(Boolean).at(-1) || String(post.cid || '');
    const creator = String(post.author?.displayName || post.author?.handle || source);
    const publishedAt = String(record.createdAt || post.indexedAt || '');
    const result = {
      platform: 'bluesky',
      source,
      creator,
      exists: true,
      live: false,
      id,
      eventKey: `bluesky:${source}:post:${id}`,
      title: cleanPostText(record.text, `${creator} hat einen neuen Bluesky-Post veröffentlicht.`),
      game: '',
      url: blueskyPostUrl(post, source),
      thumbnail: blueskyThumbnail(post.embed),
      avatar: String(post.author?.avatar || ''),
      publishedAt,
      startedAt: publishedAt,
      viewers: 0
    };
    success('bluesky');
    return result;
  } catch (error) {
    failure('bluesky', error);
    throw error;
  }
}

async function resolveXUser(source) {
  const cached = xUserCache.get(source);
  if (cached && cached.expiresAt > Date.now()) return cached.user;
  const token = optionalEnv('X_BEARER_TOKEN');
  if (!token) throw new Error('X Provider ist nicht konfiguriert. X_BEARER_TOKEN fehlt.');
  const data = await fetchJson(`https://api.x.com/2/users/by/username/${encodeURIComponent(source)}?user.fields=name,username,profile_image_url`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!data?.data?.id) throw new Error('X Account wurde nicht gefunden.');
  xUserCache.set(source, { user: data.data, expiresAt: Date.now() + X_USER_CACHE_MS });
  return data.data;
}

async function fetchXPost(value) {
  const source = normalizeSocialHandle('x', value);
  const token = optionalEnv('X_BEARER_TOKEN');
  if (!token) throw new Error('X Provider ist nicht konfiguriert. X_BEARER_TOKEN fehlt.');

  try {
    const user = await resolveXUser(source);
    const params = new URLSearchParams({
      max_results: '5',
      exclude: 'replies,retweets',
      'tweet.fields': 'created_at,attachments',
      expansions: 'attachments.media_keys',
      'media.fields': 'media_key,type,url,preview_image_url'
    });
    const data = await fetchJson(`https://api.x.com/2/users/${encodeURIComponent(user.id)}/tweets?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const post = newestByTimestamp(data?.data || []);
    if (!post?.id) throw new Error('X Account hat keine abrufbaren Posts.');

    const mediaByKey = new Map((data?.includes?.media || []).map(media => [String(media.media_key), media]));
    const media = (post.attachments?.media_keys || []).map(key => mediaByKey.get(String(key))).find(Boolean) || null;
    const publishedAt = String(post.created_at || '');
    const creator = String(user.name || user.username || source);
    const result = {
      platform: 'x',
      source,
      creator,
      exists: true,
      live: false,
      id: String(post.id),
      eventKey: `x:${source}:post:${post.id}`,
      title: cleanPostText(post.text, `${creator} hat einen neuen Post auf X veröffentlicht.`),
      game: '',
      url: `https://x.com/${encodeURIComponent(user.username || source)}/status/${encodeURIComponent(post.id)}`,
      thumbnail: String(media?.url || media?.preview_image_url || ''),
      avatar: String(user.profile_image_url || ''),
      publishedAt,
      startedAt: publishedAt,
      viewers: 0
    };
    success('x');
    return result;
  } catch (error) {
    failure('x', error);
    throw error;
  }
}

async function fetchSocialPost(platform, source) {
  if (platform === 'instagram') return fetchInstagramPost(source);
  if (platform === 'bluesky') return fetchBlueskyPost(source);
  if (platform === 'x') return fetchXPost(source);
  throw new Error(`Unbekannter Social Provider: ${platform}`);
}

module.exports = {
  SOCIAL_PLATFORMS,
  getSocialProviderHealth,
  normalizeSocialHandle,
  fetchInstagramPost,
  fetchBlueskyPost,
  fetchXPost,
  fetchSocialPost
};
