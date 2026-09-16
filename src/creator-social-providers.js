const SOCIAL_PLATFORMS = new Set(['instagram', 'bluesky', 'x']);

const providerHealth = {
  instagram: { configured: true, ok: true, mode: 'public-web', lastCheckedAt: null, lastSuccessAt: null, lastError: '' },
  bluesky: { configured: true, ok: true, mode: 'public-appview', lastCheckedAt: null, lastSuccessAt: null, lastError: '' },
  x: { configured: true, ok: true, mode: 'public-syndication', lastCheckedAt: null, lastSuccessAt: null, lastError: '' }
};

const publicCache = new Map();
const inflight = new Map();
const xUserCache = new Map();
const X_USER_CACHE_MS = 24 * 60 * 60 * 1000;
const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36';

function nowIso() {
  return new Date().toISOString();
}

function optionalEnv(name) {
  return String(process.env[name] || '').trim();
}

function envSeconds(name, fallback, min, max) {
  const value = Number(optionalEnv(name) || fallback);
  return Number.isFinite(value) ? Math.max(min, Math.min(Math.floor(value), max)) : fallback;
}

function updateHealth(provider, patch) {
  providerHealth[provider] = {
    ...providerHealth[provider],
    ...patch,
    configured: true,
    lastCheckedAt: nowIso()
  };
}

function success(provider, mode) {
  updateHealth(provider, { ok: true, mode: mode || providerHealth[provider]?.mode || '', lastSuccessAt: nowIso(), lastError: '' });
}

function failure(provider, error) {
  updateHealth(provider, { ok: false, lastError: String(error?.message || error || 'Unbekannter Fehler').slice(0, 500) });
}

function getSocialProviderHealth() {
  const instagramFallback = Boolean(optionalEnv('INSTAGRAM_GRAPH_ACCESS_TOKEN') && optionalEnv('INSTAGRAM_GRAPH_IG_USER_ID'));
  const xFallback = Boolean(optionalEnv('X_BEARER_TOKEN'));
  return JSON.parse(JSON.stringify({
    instagram: { ...providerHealth.instagram, configured: true, optionalFallbackConfigured: instagramFallback },
    bluesky: { ...providerHealth.bluesky, configured: true },
    x: { ...providerHealth.x, configured: true, optionalFallbackConfigured: xFallback }
  }));
}

async function fetchResponse(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(options.timeoutMs || 12000));
  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        'User-Agent': BROWSER_UA,
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
    return response;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchJson(url, options = {}) {
  const response = await fetchResponse(url, {
    ...options,
    headers: { Accept: 'application/json', ...(options.headers || {}) }
  });
  return response.json();
}

async function fetchText(url, options = {}) {
  const response = await fetchResponse(url, {
    ...options,
    headers: { Accept: 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8', ...(options.headers || {}) }
  });
  return response.text();
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
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

function cachedSource(platform, source, ttlSeconds, loader) {
  const key = `${platform}:${source}`;
  const cached = publicCache.get(key);
  if (cached && Date.now() - cached.at < ttlSeconds * 1000) return Promise.resolve(cached.value);
  if (inflight.has(key)) return inflight.get(key);
  const request = Promise.resolve()
    .then(loader)
    .then(value => {
      publicCache.set(key, { at: Date.now(), value });
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

function instagramCaption(node) {
  const edgeCaption = node?.edge_media_to_caption?.edges?.[0]?.node?.text;
  const caption = node?.caption?.text ?? node?.caption;
  return String(edgeCaption || caption || node?.text || '').trim();
}

function instagramImage(node) {
  return String(
    node?.display_url || node?.xdt_display_url || node?.thumbnail_src || node?.thumbnail_url ||
    node?.image_versions2?.candidates?.[0]?.url || ''
  );
}

function instagramOwner(node) {
  return String(node?.owner?.username || node?.user?.username || node?.username || '').toLowerCase();
}

function instagramCandidate(node, source, profile = {}) {
  const shortcode = String(node?.shortcode || node?.xdt_shortcode || node?.code || '');
  const id = String(node?.id || node?.pk || node?.xdt_id || shortcode || '');
  if (!shortcode || !id) return null;
  const timestamp = node?.taken_at_timestamp ?? node?.xdt_taken_at_timestamp ?? node?.taken_at ?? node?.timestamp ?? node?.created_at;
  const publishedMs = timestampMs(timestamp);
  if (!publishedMs) return null;
  const owner = instagramOwner(node);
  if (owner && owner !== source) return null;
  const type = String(node?.product_type || node?.xdt_product_type || node?.media_type || '').toLowerCase();
  const reel = type === 'clips' || type === 'reel' || type === 'video' || type === '2';
  const creator = String(profile.full_name || profile.name || profile.username || owner || source);
  const publishedAt = new Date(publishedMs).toISOString();
  return {
    platform: 'instagram', source, creator, exists: true, live: false, id,
    eventKey: `instagram:${source}:post:${id}`,
    title: cleanPostText(instagramCaption(node), `${creator} hat einen neuen Instagram-Post veröffentlicht.`),
    game: '',
    url: `https://www.instagram.com/${reel ? 'reel' : 'p'}/${encodeURIComponent(shortcode)}/`,
    thumbnail: instagramImage(node),
    avatar: String(profile.profile_pic_url_hd || profile.profile_picture_url || profile.profile_pic_url || ''),
    publishedAt, startedAt: publishedAt, viewers: 0
  };
}

function parseInstagramProfileInfo(data, source) {
  const profile = data?.data?.user || data?.user || null;
  if (!profile) throw new Error('Instagram Profil wurde nicht gefunden.');
  if (profile.is_private) throw new Error('Instagram Profil ist privat.');
  const nodes = (profile?.edge_owner_to_timeline_media?.edges || []).map(edge => edge?.node).filter(Boolean);
  const candidates = nodes.map(node => instagramCandidate(node, source, profile)).filter(Boolean).sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
  if (!candidates.length) throw new Error('Instagram Profil hat keine öffentlich abrufbaren Posts.');
  return candidates[0];
}

function walkJson(value, visit, depth = 0) {
  if (!value || depth > 18) return;
  if (Array.isArray(value)) {
    for (const item of value) walkJson(item, visit, depth + 1);
    return;
  }
  if (typeof value !== 'object') return;
  visit(value);
  for (const child of Object.values(value)) walkJson(child, visit, depth + 1);
}

function parseInstagramFeedPayload(data, source, profile = {}) {
  const rawCandidates = [];
  const seen = new Set();
  const add = node => {
    if (!node || typeof node !== 'object') return;
    const marker = String(node.pk || node.id || node.code || node.shortcode || node.xdt_shortcode || '');
    if (marker && seen.has(marker)) return;
    if (marker) seen.add(marker);
    rawCandidates.push(node);
  };

  for (const item of data?.items || []) add(item);
  walkJson(data, node => {
    const hasCode = node?.shortcode || node?.xdt_shortcode || node?.code;
    const hasTime = node?.taken_at_timestamp ?? node?.xdt_taken_at_timestamp ?? node?.taken_at ?? node?.timestamp ?? node?.created_at;
    if (hasCode && hasTime) add(node);
  });

  const discoveredProfile = data?.user || data?.data?.user || data?.items?.[0]?.user || profile || {};
  if (discoveredProfile?.is_private) throw new Error('Instagram Profil ist privat.');
  const candidates = rawCandidates
    .map(node => instagramCandidate(node, source, discoveredProfile))
    .filter(Boolean)
    .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
  if (!candidates.length) throw new Error('Instagram Feed enthielt keinen auswertbaren öffentlichen Post.');
  return candidates[0];
}

function parseInstagramRelayHtml(html, source) {
  const payloads = [];
  const scriptRegex = /<script[^>]+type=["']application\/json["'][^>]*>([\s\S]*?)<\/script>/gi;
  for (const match of String(html || '').matchAll(scriptRegex)) {
    try { payloads.push(JSON.parse(match[1])); } catch {}
  }
  const next = String(html || '').match(/<script[^>]+id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i);
  if (next) {
    try { payloads.push(JSON.parse(next[1])); } catch {}
  }
  if (!payloads.length) throw new Error('Instagram Profil-Payload fehlt.');

  let profile = null;
  const rawCandidates = [];
  for (const payload of payloads) {
    walkJson(payload, node => {
      if (!profile && String(node?.username || '').toLowerCase() === source && (node?.profile_pic_url || node?.profile_pic_url_hd || node?.full_name)) profile = node;
      if (node?.shortcode || node?.xdt_shortcode || node?.code) rawCandidates.push(node);
    });
  }
  const candidates = rawCandidates
    .map(node => instagramCandidate(node, source, profile || {}))
    .filter(Boolean)
    .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
  if (!candidates.length) throw new Error('Instagram Profilseite enthielt keinen auswertbaren öffentlichen Post.');
  return candidates[0];
}

async function fetchInstagramFeedByUsername(source, headers) {
  const endpoint = `https://www.instagram.com/api/v1/feed/user/${encodeURIComponent(source)}/username/?count=6`;
  const response = await fetchResponse(endpoint, { headers, timeoutMs: 15000, redirect: 'follow' });
  const contentType = String(response.headers.get('content-type') || '').toLowerCase();
  if (!contentType.includes('json') || !String(response.url || '').includes('/api/v1/feed/user/')) {
    throw new Error('Instagram Feed-by-Username wurde auf die Web-App umgeleitet.');
  }
  let data;
  try {
    data = JSON.parse(await response.text());
  } catch {
    throw new Error('Instagram Feed-by-Username lieferte kein gültiges JSON.');
  }
  return parseInstagramFeedPayload(data, source, data?.user || data?.items?.[0]?.user || {});
}

async function fetchInstagramPublic(source) {
  const headers = {
    'Accept-Language': 'de-DE,de;q=0.9,en;q=0.8',
    'X-IG-App-ID': optionalEnv('INSTAGRAM_PUBLIC_APP_ID') || '936619743392459',
    'X-ASBD-ID': optionalEnv('INSTAGRAM_PUBLIC_ASBD_ID') || '198387',
    'X-Requested-With': 'XMLHttpRequest',
    Referer: `https://www.instagram.com/${source}/`
  };
  const errors = [];

  try {
    return await fetchInstagramFeedByUsername(source, headers);
  } catch (error) {
    errors.push(`feed: ${String(error?.message || error)}`);
  }

  try {
    const data = await fetchJson(`https://www.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(source)}`, { headers, timeoutMs: 15000 });
    return parseInstagramProfileInfo(data, source);
  } catch (error) {
    errors.push(`profile: ${String(error?.message || error)}`);
  }

  try {
    const html = await fetchText(`https://www.instagram.com/${encodeURIComponent(source)}/`, { headers, timeoutMs: 15000 });
    return parseInstagramRelayHtml(html, source);
  } catch (error) {
    errors.push(`html: ${String(error?.message || error)}`);
  }

  throw new Error(`Instagram öffentlicher Feed aktuell nicht abrufbar (${errors.map(item => item.slice(0, 90)).join(' | ').slice(0, 260)}).`);
}

async function fetchInstagramGraphFallback(source) {
  const token = optionalEnv('INSTAGRAM_GRAPH_ACCESS_TOKEN');
  const igUserId = optionalEnv('INSTAGRAM_GRAPH_IG_USER_ID');
  if (!token || !igUserId) throw new Error('Kein optionaler Meta Graph Fallback konfiguriert.');
  const apiVersion = optionalEnv('INSTAGRAM_GRAPH_VERSION') || 'v26.0';
  const fields = `business_discovery.username(${source}){username,name,profile_picture_url,media.limit(5){id,caption,media_type,media_url,permalink,thumbnail_url,timestamp}}`;
  const data = await fetchJson(`https://graph.facebook.com/${encodeURIComponent(apiVersion)}/${encodeURIComponent(igUserId)}?${new URLSearchParams({ fields, access_token: token })}`);
  const account = data?.business_discovery;
  const media = [...(account?.media?.data || [])].sort((a, b) => timestampMs(b?.timestamp) - timestampMs(a?.timestamp))[0];
  if (!account || !media?.id) throw new Error('Meta Graph Fallback lieferte keinen Post.');
  const publishedAt = String(media.timestamp || '');
  const creator = String(account.name || account.username || source);
  return {
    platform: 'instagram', source, creator, exists: true, live: false, id: String(media.id),
    eventKey: `instagram:${source}:post:${media.id}`,
    title: cleanPostText(media.caption, `${creator} hat einen neuen Instagram-Post veröffentlicht.`),
    game: '', url: String(media.permalink || `https://www.instagram.com/${source}/`),
    thumbnail: String(media.thumbnail_url || media.media_url || ''), avatar: String(account.profile_picture_url || ''),
    publishedAt, startedAt: publishedAt, viewers: 0
  };
}

async function fetchInstagramPost(value) {
  const source = normalizeSocialHandle('instagram', value);
  const ttl = envSeconds('CREATOR_INSTAGRAM_MIN_FETCH_SECONDS', 600, 120, 3600);
  try {
    return await cachedSource('instagram', source, ttl, async () => {
      try {
        const result = await fetchInstagramPublic(source);
        success('instagram', 'public-web');
        return result;
      } catch (publicError) {
        if (!optionalEnv('INSTAGRAM_GRAPH_ACCESS_TOKEN') || !optionalEnv('INSTAGRAM_GRAPH_IG_USER_ID')) throw publicError;
        const result = await fetchInstagramGraphFallback(source);
        success('instagram', 'graph-fallback');
        return result;
      }
    });
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
      platform: 'bluesky', source, creator, exists: true, live: false, id,
      eventKey: `bluesky:${source}:post:${id}`,
      title: cleanPostText(record.text, `${creator} hat einen neuen Bluesky-Post veröffentlicht.`),
      game: '', url: blueskyPostUrl(post, source), thumbnail: blueskyThumbnail(post.embed), avatar: String(post.author?.avatar || ''),
      publishedAt, startedAt: publishedAt, viewers: 0
    };
    success('bluesky', 'public-appview');
    return result;
  } catch (error) {
    failure('bluesky', error);
    throw error;
  }
}

function cleanXText(tweet) {
  let text = String(tweet?.full_text || tweet?.text || '');
  for (const item of tweet?.entities?.urls || []) {
    if (item?.url && item?.display_url) text = text.split(item.url).join(item.display_url);
  }
  for (const item of tweet?.extended_entities?.media || tweet?.entities?.media || []) {
    if (item?.url) text = text.split(item.url).join('');
  }
  return cleanPostText(text, 'Neuer Post auf X');
}

function xMedia(tweet) {
  const media = tweet?.mediaDetails || tweet?.extended_entities?.media || tweet?.entities?.media || [];
  return String(media?.[0]?.media_url_https || media?.[0]?.media_url || '');
}

function parseXSyndicationHtml(html, source) {
  const match = String(html || '').match(/<script[^>]+id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i);
  if (!match) throw new Error('X Syndication Payload fehlt.');
  const data = JSON.parse(match[1]);
  const entries = data?.props?.pageProps?.timeline?.entries || [];
  const posts = [];
  for (const entry of entries) {
    const tweet = entry?.content?.tweet;
    if (!tweet?.id_str || tweet.retweeted_status || tweet.in_reply_to_status_id_str) continue;
    const user = tweet.user || {};
    const handle = String(user.screen_name || source || '').toLowerCase();
    if (handle && handle !== source) continue;
    const createdMs = timestampMs(tweet.created_at);
    if (!createdMs) continue;
    posts.push({ tweet, user, createdMs });
  }
  posts.sort((a, b) => b.createdMs - a.createdMs);
  const current = posts[0];
  if (!current) throw new Error('X Profil hat keine abrufbaren öffentlichen Posts.');
  const { tweet, user, createdMs } = current;
  const handle = String(user.screen_name || source);
  const id = String(tweet.id_str);
  const publishedAt = new Date(createdMs).toISOString();
  return {
    platform: 'x', source, creator: String(user.name || handle), exists: true, live: false, id,
    eventKey: `x:${source}:post:${id}`,
    title: cleanXText(tweet), game: '',
    url: `https://x.com/${encodeURIComponent(handle)}/status/${encodeURIComponent(id)}`,
    thumbnail: xMedia(tweet), avatar: String(user.profile_image_url_https || user.profile_image_url || ''),
    publishedAt, startedAt: publishedAt, viewers: 0
  };
}

async function fetchXSyndication(source) {
  const url = `https://syndication.twitter.com/srv/timeline-profile/screen-name/${encodeURIComponent(source)}?showReplies=false`;
  let lastError = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const html = await fetchText(url, { timeoutMs: 15000, headers: { 'Accept-Language': 'de-DE,de;q=0.9,en;q=0.8' } });
      return parseXSyndicationHtml(html, source);
    } catch (error) {
      lastError = error;
      if (error?.status !== 429 || attempt === 2) break;
      await sleep(1500 * (attempt + 1));
    }
  }
  throw lastError || new Error('X Syndication Feed nicht erreichbar.');
}

async function resolveXUser(source) {
  const cached = xUserCache.get(source);
  if (cached && cached.expiresAt > Date.now()) return cached.user;
  const token = optionalEnv('X_BEARER_TOKEN');
  if (!token) throw new Error('Kein optionaler X API Fallback konfiguriert.');
  const data = await fetchJson(`https://api.x.com/2/users/by/username/${encodeURIComponent(source)}?user.fields=name,username,profile_image_url`, { headers: { Authorization: `Bearer ${token}` } });
  if (!data?.data?.id) throw new Error('X Account wurde nicht gefunden.');
  xUserCache.set(source, { user: data.data, expiresAt: Date.now() + X_USER_CACHE_MS });
  return data.data;
}

async function fetchXApiFallback(source) {
  const token = optionalEnv('X_BEARER_TOKEN');
  if (!token) throw new Error('Kein optionaler X API Fallback konfiguriert.');
  const user = await resolveXUser(source);
  const params = new URLSearchParams({ max_results: '5', exclude: 'replies,retweets', 'tweet.fields': 'created_at,attachments', expansions: 'attachments.media_keys', 'media.fields': 'media_key,type,url,preview_image_url' });
  const data = await fetchJson(`https://api.x.com/2/users/${encodeURIComponent(user.id)}/tweets?${params.toString()}`, { headers: { Authorization: `Bearer ${token}` } });
  const post = [...(data?.data || [])].sort((a, b) => timestampMs(b?.created_at) - timestampMs(a?.created_at))[0];
  if (!post?.id) throw new Error('X API Fallback lieferte keinen Post.');
  const mediaByKey = new Map((data?.includes?.media || []).map(media => [String(media.media_key), media]));
  const media = (post.attachments?.media_keys || []).map(key => mediaByKey.get(String(key))).find(Boolean) || null;
  const publishedAt = String(post.created_at || '');
  const creator = String(user.name || user.username || source);
  return {
    platform: 'x', source, creator, exists: true, live: false, id: String(post.id),
    eventKey: `x:${source}:post:${post.id}`,
    title: cleanPostText(post.text, `${creator} hat einen neuen Post auf X veröffentlicht.`), game: '',
    url: `https://x.com/${encodeURIComponent(user.username || source)}/status/${encodeURIComponent(post.id)}`,
    thumbnail: String(media?.url || media?.preview_image_url || ''), avatar: String(user.profile_image_url || ''),
    publishedAt, startedAt: publishedAt, viewers: 0
  };
}

async function fetchXPost(value) {
  const source = normalizeSocialHandle('x', value);
  const ttl = envSeconds('CREATOR_X_MIN_FETCH_SECONDS', 180, 60, 1800);
  try {
    return await cachedSource('x', source, ttl, async () => {
      try {
        const result = await fetchXSyndication(source);
        success('x', 'public-syndication');
        return result;
      } catch (publicError) {
        if (!optionalEnv('X_BEARER_TOKEN')) throw new Error(`X öffentlicher Feed aktuell nicht abrufbar (${String(publicError?.message || publicError).slice(0, 180)}).`);
        const result = await fetchXApiFallback(source);
        success('x', 'api-fallback');
        return result;
      }
    });
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
  parseInstagramProfileInfo,
  parseInstagramFeedPayload,
  parseInstagramRelayHtml,
  parseXSyndicationHtml,
  fetchInstagramPost,
  fetchBlueskyPost,
  fetchXPost,
  fetchSocialPost
};