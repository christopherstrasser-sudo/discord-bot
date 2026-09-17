let appToken = null;
let appTokenExpiresAt = 0;

function optionalEnv(name) {
  return String(process.env[name] || '').trim();
}

async function fetchJson(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(options.timeoutMs || 12000));
  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        'User-Agent': 'Orbit-Discord-Control/Twitch-Clips',
        ...(options.headers || {})
      },
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

async function getAppToken() {
  const clientId = optionalEnv('TWITCH_CLIENT_ID');
  const clientSecret = optionalEnv('TWITCH_CLIENT_SECRET');
  if (!clientId || !clientSecret) throw new Error('Twitch Provider ist nicht konfiguriert.');
  if (appToken && Date.now() < appTokenExpiresAt - 60000) return appToken;

  const query = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'client_credentials'
  });
  const data = await fetchJson(`https://id.twitch.tv/oauth2/token?${query}`, { method: 'POST' });
  if (!data?.access_token) throw new Error('Twitch OAuth hat kein Access Token geliefert.');
  appToken = data.access_token;
  appTokenExpiresAt = Date.now() + Math.max(60, Number(data.expires_in || 3600)) * 1000;
  return appToken;
}

function timestamp(value) {
  const parsed = Date.parse(String(value || ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeClip(clip, user, gameName, source) {
  const id = String(clip?.id || '');
  if (!id) return null;
  const publishedAt = String(clip.created_at || '');
  return {
    platform: 'twitch',
    source,
    creator: String(clip.broadcaster_name || user?.display_name || source),
    clipper: String(clip.creator_name || ''),
    live: false,
    exists: true,
    id,
    eventKey: `twitch:${source}:clip:${id}`,
    title: String(clip.title || 'Neuer Twitch Clip'),
    game: String(gameName || ''),
    url: String(clip.url || `https://clips.twitch.tv/${id}`),
    thumbnail: String(clip.thumbnail_url || ''),
    avatar: String(user?.profile_image_url || ''),
    publishedAt,
    startedAt: publishedAt,
    viewers: 0,
    views: Number(clip.view_count || 0),
    duration: Number(clip.duration || 0)
  };
}

function sortClipsNewestFirst(clips) {
  return [...(clips || [])].sort((a, b) => timestamp(b?.created_at || b?.publishedAt) - timestamp(a?.created_at || a?.publishedAt));
}

async function fetchUsers(logins, headers) {
  const params = new URLSearchParams();
  logins.forEach(login => params.append('login', login));
  const data = await fetchJson(`https://api.twitch.tv/helix/users?${params}`, { headers });
  return new Map((data?.data || []).map(user => [String(user.login || '').toLowerCase(), user]));
}

async function fetchGames(gameIds, headers) {
  const ids = [...new Set(gameIds.filter(Boolean))].slice(0, 100);
  if (!ids.length) return new Map();
  const params = new URLSearchParams();
  ids.forEach(id => params.append('id', id));
  const data = await fetchJson(`https://api.twitch.tv/helix/games?${params}`, { headers });
  return new Map((data?.data || []).map(game => [String(game.id), String(game.name || '')]));
}

async function fetchClipPage(userId, headers, options = {}) {
  const params = new URLSearchParams({ broadcaster_id: userId, first: '100' });
  if (options.startedAt) params.set('started_at', new Date(options.startedAt).toISOString());
  if (options.endedAt) params.set('ended_at', new Date(options.endedAt).toISOString());
  if (options.after) params.set('after', options.after);
  return fetchJson(`https://api.twitch.tv/helix/clips?${params}`, { headers, timeoutMs: 15000 });
}

async function fetchBroadcasterClips(userId, headers, options = {}) {
  const maxPages = Math.max(1, Math.min(Number(options.maxPages || 3), 10));
  const clips = [];
  let after = '';
  for (let page = 0; page < maxPages; page += 1) {
    const data = await fetchClipPage(userId, headers, { ...options, after });
    clips.push(...(data?.data || []));
    after = String(data?.pagination?.cursor || '');
    if (!after) break;
  }
  return sortClipsNewestFirst(clips);
}

async function mapLimit(items, limit, fn) {
  const values = [...items];
  const output = new Map();
  let cursor = 0;
  async function worker() {
    while (cursor < values.length) {
      const item = values[cursor++];
      try { output.set(item, await fn(item)); }
      catch (error) { output.set(item, { error: String(error?.message || error) }); }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, values.length) }, () => worker()));
  return output;
}

async function fetchTwitchClipStatuses(logins, options = {}) {
  const unique = [...new Set((logins || []).map(value => String(value || '').trim().toLowerCase()).filter(Boolean))].slice(0, 100);
  if (!unique.length) return new Map();

  const token = await getAppToken();
  const clientId = optionalEnv('TWITCH_CLIENT_ID');
  const headers = { 'Client-Id': clientId, Authorization: `Bearer ${token}` };
  const users = await fetchUsers(unique, headers);
  const rawByLogin = await mapLimit(unique, 4, async login => {
    const user = users.get(login);
    if (!user) return { user: null, clips: [] };
    const clips = await fetchBroadcasterClips(String(user.id), headers, options);
    return { user, clips };
  });

  const gameIds = [];
  for (const value of rawByLogin.values()) {
    if (value?.clips) value.clips.forEach(clip => gameIds.push(String(clip.game_id || '')));
  }
  const games = await fetchGames(gameIds, headers);
  const result = new Map();

  for (const login of unique) {
    const raw = rawByLogin.get(login);
    if (raw?.error) {
      result.set(login, { error: raw.error });
      continue;
    }
    if (!raw?.user) {
      result.set(login, null);
      continue;
    }
    const items = (raw.clips || [])
      .map(clip => normalizeClip(clip, raw.user, games.get(String(clip.game_id || '')) || '', login))
      .filter(Boolean);
    const latest = items[0] || {
      platform: 'twitch', source: login, creator: raw.user.display_name || login,
      exists: true, live: false, id: '', eventKey: `twitch:${login}:clip:none`, title: '', game: '',
      url: `https://www.twitch.tv/${login}/clips`, thumbnail: '', avatar: raw.user.profile_image_url || '',
      publishedAt: '', startedAt: '', viewers: 0, clipper: '', views: 0, duration: 0
    };
    result.set(login, { ...latest, items });
  }

  return result;
}

async function fetchLatestTwitchClip(login, options = {}) {
  const source = String(login || '').trim().toLowerCase();
  if (!source) throw new Error('Twitch Kanalname fehlt.');
  const endedAt = Date.now();
  const startedAt = options.startedAt || endedAt - 7 * 24 * 60 * 60 * 1000;
  const map = await fetchTwitchClipStatuses([source], {
    startedAt,
    endedAt,
    maxPages: options.maxPages || 10
  });
  const snapshot = map.get(source);
  if (!snapshot) throw new Error('Twitch Creator wurde nicht gefunden.');
  if (snapshot.error) throw new Error(snapshot.error);
  if (!snapshot.id) throw new Error('Für diesen Twitch-Kanal wurde im abgefragten Zeitraum kein Clip gefunden.');
  return snapshot;
}

module.exports = {
  sortClipsNewestFirst,
  normalizeClip,
  fetchTwitchClipStatuses,
  fetchLatestTwitchClip
};
