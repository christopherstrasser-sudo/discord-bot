const providerHealth = {
  twitch: { configured: false, ok: false, lastCheckedAt: null, lastSuccessAt: null, lastError: '' },
  youtube: { configured: true, ok: true, lastCheckedAt: null, lastSuccessAt: null, lastError: '' },
  tiktok: { configured: false, ok: false, lastCheckedAt: null, lastSuccessAt: null, lastError: '' }
};

let twitchToken = null;
let twitchTokenExpiresAt = 0;
const youtubeHandleCache = new Map();
const YOUTUBE_HANDLE_CACHE_MS = 24 * 60 * 60 * 1000;

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
  updateHealth(provider, { ok: false, lastError: String(error?.message || error || 'Unbekannter Fehler').slice(0, 500) });
}

function getProviderHealth() {
  const twitchConfigured = Boolean(optionalEnv('TWITCH_CLIENT_ID') && optionalEnv('TWITCH_CLIENT_SECRET'));
  const tiktokConfigured = Boolean(optionalEnv('TIKTOK_STATUS_ENDPOINT'));
  return JSON.parse(JSON.stringify({
    ...providerHealth,
    twitch: { ...providerHealth.twitch, configured: twitchConfigured },
    youtube: { ...providerHealth.youtube, configured: true },
    tiktok: { ...providerHealth.tiktok, configured: tiktokConfigured }
  }));
}

async function fetchJson(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(options.timeoutMs || 10000));
  try {
    const response = await fetch(url, {
      ...options,
      headers: { 'User-Agent': 'RAKU-Creator-Hub/0.9.1', ...(options.headers || {}) },
      signal: controller.signal
    });
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`HTTP ${response.status}${body ? `: ${body.slice(0, 240)}` : ''}`);
    }
    return response.json();
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchText(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(options.timeoutMs || 10000));
  try {
    const response = await fetch(url, {
      ...options,
      headers: { 'User-Agent': 'RAKU-Creator-Hub/0.9.1', ...(options.headers || {}) },
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.text();
  } finally {
    clearTimeout(timeout);
  }
}

async function getTwitchAppToken() {
  const clientId = optionalEnv('TWITCH_CLIENT_ID');
  const clientSecret = optionalEnv('TWITCH_CLIENT_SECRET');
  if (!clientId || !clientSecret) throw new Error('Twitch Provider ist nicht konfiguriert.');
  if (twitchToken && Date.now() < twitchTokenExpiresAt - 60000) return twitchToken;

  const query = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'client_credentials'
  });
  const data = await fetchJson(`https://id.twitch.tv/oauth2/token?${query.toString()}`, { method: 'POST' });
  if (!data?.access_token) throw new Error('Twitch OAuth hat kein Access Token geliefert.');
  twitchToken = data.access_token;
  twitchTokenExpiresAt = Date.now() + Math.max(60, Number(data.expires_in || 3600)) * 1000;
  return twitchToken;
}

async function fetchTwitchStatuses(logins) {
  const unique = [...new Set((logins || []).map(value => String(value || '').trim().toLowerCase()).filter(Boolean))].slice(0, 100);
  if (!unique.length) return new Map();

  try {
    const token = await getTwitchAppToken();
    const clientId = optionalEnv('TWITCH_CLIENT_ID');
    const headers = { 'Client-Id': clientId, Authorization: `Bearer ${token}` };
    const streamParams = new URLSearchParams();
    unique.forEach(login => streamParams.append('user_login', login));
    const userParams = new URLSearchParams();
    unique.forEach(login => userParams.append('login', login));

    const [streams, users] = await Promise.all([
      fetchJson(`https://api.twitch.tv/helix/streams?${streamParams.toString()}`, { headers }),
      fetchJson(`https://api.twitch.tv/helix/users?${userParams.toString()}`, { headers })
    ]);

    const usersByLogin = new Map((users?.data || []).map(user => [String(user.login).toLowerCase(), user]));
    const streamsByLogin = new Map((streams?.data || []).map(stream => [String(stream.user_login).toLowerCase(), stream]));
    const result = new Map();

    for (const login of unique) {
      const user = usersByLogin.get(login) || null;
      if (!user) {
        result.set(login, null);
        continue;
      }
      const stream = streamsByLogin.get(login) || null;
      result.set(login, {
        platform: 'twitch',
        source: login,
        creator: stream?.user_name || user.display_name || login,
        exists: true,
        live: Boolean(stream),
        id: stream?.id || '',
        eventKey: stream?.id ? `twitch:${login}:live:${stream.id}` : `twitch:${login}:offline`,
        title: stream?.title || '',
        game: stream?.game_name || '',
        url: `https://www.twitch.tv/${login}`,
        thumbnail: stream?.thumbnail_url ? stream.thumbnail_url.replace('{width}', '1280').replace('{height}', '720') : '',
        avatar: user.profile_image_url || '',
        startedAt: stream?.started_at || '',
        viewers: Number(stream?.viewer_count || 0)
      });
    }
    success('twitch');
    return result;
  } catch (error) {
    failure('twitch', error);
    throw error;
  }
}

function decodeXml(value) {
  return String(value || '')
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replace(/&#(\d+);/g, (_m, n) => String.fromCodePoint(Number(n)));
}

function tagValue(xml, tag) {
  const match = String(xml || '').match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  return match ? decodeXml(match[1].trim()) : '';
}

function attributeValue(xml, tag, attribute) {
  const match = String(xml || '').match(new RegExp(`<${tag}[^>]*\\s${attribute}=["']([^"']+)["'][^>]*>`, 'i'));
  return match ? decodeXml(match[1]) : '';
}

function normalizeYouTubeLookup(value) {
  let source = String(value || '').trim();
  if (!source) throw new Error('YouTube @Handle fehlt.');

  if (/^(?:https?:\/\/)?(?:www\.)?youtube\.com\//i.test(source)) {
    try {
      const url = new URL(/^https?:\/\//i.test(source) ? source : `https://${source}`);
      const path = decodeURIComponent(url.pathname || '');
      const channelMatch = path.match(/^\/channel\/(UC[A-Za-z0-9_-]{20,40})(?:\/|$)/i);
      if (channelMatch) return { kind: 'id', value: channelMatch[1] };
      const handleMatch = path.match(/^\/@([^/?#]+)(?:\/|$)/u);
      if (handleMatch) source = `@${handleMatch[1]}`;
      else throw new Error('unsupported_path');
    } catch {
      throw new Error('YouTube: Bitte @Handle oder eine youtube.com/@handle URL eintragen.');
    }
  }

  if (/^UC[A-Za-z0-9_-]{20,40}$/.test(source)) return { kind: 'id', value: source };
  if (!source.startsWith('@')) source = `@${source}`;
  const handle = source.slice(1).trim();
  if (!handle || handle.length > 100 || /[\s/?#]/u.test(handle)) {
    throw new Error('YouTube: Ungültiger @Handle.');
  }
  return { kind: 'handle', value: `@${handle}` };
}

function extractYouTubeChannelId(html) {
  const text = String(html || '');
  const patterns = [
    /<meta[^>]+itemprop=["']channelId["'][^>]+content=["'](UC[A-Za-z0-9_-]{20,40})["']/i,
    /<meta[^>]+content=["'](UC[A-Za-z0-9_-]{20,40})["'][^>]+itemprop=["']channelId["']/i,
    /"externalId":"(UC[A-Za-z0-9_-]{20,40})"/,
    /\\"externalId\\":\\"(UC[A-Za-z0-9_-]{20,40})\\"/,
    /"channelId":"(UC[A-Za-z0-9_-]{20,40})"/,
    /https:\/\/www\.youtube\.com\/channel\/(UC[A-Za-z0-9_-]{20,40})/
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return match[1];
  }
  return '';
}

async function resolveYouTubeChannelId(source, options = {}) {
  const lookup = normalizeYouTubeLookup(source);
  if (lookup.kind === 'id') return { channelId: lookup.value, source: lookup.value };

  const cacheKey = lookup.value.toLowerCase();
  const cached = youtubeHandleCache.get(cacheKey);
  if (!options.force && cached && cached.expiresAt > Date.now()) {
    return { channelId: cached.channelId, source: lookup.value };
  }

  const html = await fetchText(`https://www.youtube.com/${encodeURI(lookup.value)}`, {
    headers: { 'Accept-Language': 'de-DE,de;q=0.9,en;q=0.8' },
    timeoutMs: 12000
  });
  const channelId = extractYouTubeChannelId(html);
  if (!channelId) throw new Error(`YouTube: ${lookup.value} konnte nicht aufgelöst werden.`);

  youtubeHandleCache.set(cacheKey, {
    channelId,
    expiresAt: Date.now() + YOUTUBE_HANDLE_CACHE_MS
  });
  return { channelId, source: lookup.value };
}

async function fetchYouTubeFeed(channelId, publicSource) {
  const xml = await fetchText(`https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(channelId)}`);
  const authorBlock = xml.match(/<author>([\s\S]*?)<\/author>/i)?.[1] || '';
  const creator = tagValue(authorBlock, 'name') || publicSource || channelId;
  const entry = xml.match(/<entry>([\s\S]*?)<\/entry>/i)?.[1] || '';
  const videoId = entry ? tagValue(entry, 'yt:videoId') : '';
  const title = entry ? tagValue(entry, 'title') : '';
  const publishedAt = entry ? tagValue(entry, 'published') : '';
  const videoUrl = entry ? attributeValue(entry, 'link', 'href') : '';
  const thumbnail = entry ? attributeValue(entry, 'media:thumbnail', 'url') : '';
  const channelUrl = publicSource?.startsWith('@')
    ? `https://www.youtube.com/${encodeURI(publicSource)}`
    : `https://www.youtube.com/channel/${channelId}`;
  const url = videoUrl || (videoId ? `https://www.youtube.com/watch?v=${videoId}` : channelUrl);

  return {
    platform: 'youtube',
    source: publicSource || channelId,
    channelId,
    creator,
    exists: true,
    live: false,
    id: videoId,
    eventKey: videoId ? `youtube:${channelId}:upload:${videoId}` : `youtube:${channelId}:empty`,
    title,
    game: '',
    url,
    thumbnail,
    avatar: '',
    startedAt: publishedAt,
    publishedAt,
    viewers: 0
  };
}

async function fetchYouTubeStatus(source) {
  let lookup;
  try {
    lookup = normalizeYouTubeLookup(source);
    let resolved = await resolveYouTubeChannelId(lookup.value);
    let result;
    try {
      result = await fetchYouTubeFeed(resolved.channelId, lookup.value);
    } catch (error) {
      if (lookup.kind !== 'handle') throw error;
      youtubeHandleCache.delete(lookup.value.toLowerCase());
      resolved = await resolveYouTubeChannelId(lookup.value, { force: true });
      result = await fetchYouTubeFeed(resolved.channelId, lookup.value);
    }
    success('youtube');
    return result;
  } catch (error) {
    failure('youtube', error);
    throw error;
  }
}

function tiktokEndpoint(username) {
  const template = optionalEnv('TIKTOK_STATUS_ENDPOINT');
  if (!template) throw new Error('TikTok Provider ist nicht verbunden.');
  if (template.includes('{username}')) return template.replaceAll('{username}', encodeURIComponent(username));
  const url = new URL(template);
  url.searchParams.set('username', username);
  return url.toString();
}

async function fetchTikTokStatus(username) {
  const source = String(username || '').trim().replace(/^@/, '').toLowerCase();
  if (!source) throw new Error('TikTok Username fehlt.');
  try {
    const data = await fetchJson(tiktokEndpoint(source));
    if (typeof data?.live !== 'boolean') throw new Error('TikTok Adapter liefert kein gültiges live-Feld.');
    if (data.exists === false) throw new Error('TikTok Creator wurde nicht gefunden.');
    const liveId = String(data.liveId || data.roomId || data.id || '');
    const result = {
      platform: 'tiktok',
      source,
      creator: String(data.creator || data.displayName || source),
      exists: true,
      live: Boolean(data.live),
      id: liveId,
      eventKey: data.live && liveId ? `tiktok:${source}:live:${liveId}` : `tiktok:${source}:offline`,
      title: String(data.title || ''),
      game: '',
      url: String(data.url || `https://www.tiktok.com/@${source}/live`),
      thumbnail: String(data.thumbnail || ''),
      avatar: String(data.avatar || ''),
      startedAt: String(data.startedAt || ''),
      viewers: Number(data.viewers || 0)
    };
    success('tiktok');
    return result;
  } catch (error) {
    failure('tiktok', error);
    throw error;
  }
}

module.exports = {
  getProviderHealth,
  fetchTwitchStatuses,
  fetchYouTubeStatus,
  fetchTikTokStatus,
  resolveYouTubeChannelId,
  extractYouTubeChannelId
};
