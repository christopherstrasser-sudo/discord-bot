const API_V2_BASE = 'https://api-v2.soundcloud.com';
const SOUNDCLOUD_BASE = 'https://soundcloud.com';
const RSS_BASE = 'https://feeds.soundcloud.com/users/soundcloud:users:';

const profileCache = new Map();
const latestCache = new Map();
const inflight = new Map();

const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36';

const health = {
  configured: true,
  ok: true,
  mode: 'public-web',
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

function updateHealth(ok, mode, error = '') {
  health.configured = true;
  health.ok = ok;
  health.mode = mode || health.mode || 'public-web';
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
    configured: true,
    userCredentialsRequired: false,
    backendCredentialsRequired: false,
    browserRequired: false,
    rssFallback: true
  };
}

function normalizeSoundCloudSource(value) {
  let source = String(value || '').trim();
  if (!source) return '';

  if (/^(?:https?:\/\/)?(?:www\.)?soundcloud\.com\//i.test(source)) {
    try {
      const url = new URL(/^https?:\/\//i.test(source) ? source : `https://${source}`);
      const parts = decodeURIComponent(url.pathname || '').split('/').filter(Boolean);
      if (!parts.length || parts.length > 2 || (parts.length === 2 && parts[1].toLowerCase() !== 'tracks')) {
        throw new Error('not_profile');
      }
      source = parts[0];
    } catch {
      throw new Error('SoundCloud: Bitte ein Künstlerprofil wie soundcloud.com/artist oder soundcloud.com/artist/tracks eintragen.');
    }
  }

  source = source.replace(/^@/, '').trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9._-]{0,99}$/.test(source)) {
    throw new Error('SoundCloud: Bitte ein gültiges Künstlerprofil bzw. einen Profilnamen eintragen.');
  }
  return source;
}

function profileUrl(source) {
  return `${SOUNDCLOUD_BASE}/${encodeURIComponent(source)}`;
}

function timeoutMs() {
  const raw = Number(optionalEnv('SOUNDCLOUD_TIMEOUT_MS') || 15000);
  return Number.isFinite(raw) ? Math.max(5000, Math.min(Math.floor(raw), 30000)) : 15000;
}

function cacheSeconds() {
  const raw = Number(optionalEnv('CREATOR_SOUNDCLOUD_MIN_FETCH_SECONDS') || 120);
  return Number.isFinite(raw) ? Math.max(60, Math.min(Math.floor(raw), 900)) : 120;
}

async function fetchResponse(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(options.timeoutMs || timeoutMs()));
  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        'User-Agent': BROWSER_UA,
        'Accept-Language': 'de-DE,de;q=0.9,en;q=0.8',
        ...(options.headers || {})
      },
      redirect: 'follow',
      signal: controller.signal
    });
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      const error = new Error(`HTTP ${response.status}${body ? `: ${body.replace(/\s+/g, ' ').slice(0, 220)}` : ''}`);
      error.status = response.status;
      throw error;
    }
    return response;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchText(url, options = {}) {
  const response = await fetchResponse(url, {
    ...options,
    headers: {
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      ...(options.headers || {})
    }
  });
  return response.text();
}

async function fetchJson(url, options = {}) {
  const response = await fetchResponse(url, {
    ...options,
    headers: {
      Accept: 'application/json',
      Referer: 'https://soundcloud.com/',
      Origin: 'https://soundcloud.com',
      ...(options.headers || {})
    }
  });
  return response.json();
}

function extractAssignedJson(source, marker) {
  const text = String(source || '');
  const markerIndex = text.indexOf(marker);
  if (markerIndex < 0) throw new Error(`SoundCloud Hydration-Marker fehlt: ${marker}`);

  let start = markerIndex + marker.length;
  while (start < text.length && /[\s=]/.test(text[start])) start += 1;
  while (start < text.length && text[start] !== '[' && text[start] !== '{') start += 1;
  if (start >= text.length) throw new Error('SoundCloud Hydration-Payload fehlt.');

  const open = text[start];
  const close = open === '[' ? ']' : '}';
  let depth = 0;
  let quote = '';
  let escaped = false;

  for (let i = start; i < text.length; i += 1) {
    const ch = text[i];
    if (quote) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === quote) quote = '';
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (ch === open) depth += 1;
    else if (ch === close) {
      depth -= 1;
      if (depth === 0) return JSON.parse(text.slice(start, i + 1));
    }
  }
  throw new Error('SoundCloud Hydration-Payload ist unvollständig.');
}

function parseSoundCloudHydration(html, source = '') {
  const hydration = extractAssignedJson(html, 'window.__sc_hydration');
  if (!Array.isArray(hydration)) throw new Error('SoundCloud Hydration hat ein unerwartetes Format.');

  const users = hydration
    .filter(entry => entry?.hydratable === 'user' && entry?.data)
    .map(entry => entry.data);
  const wanted = String(source || '').toLowerCase();
  const user = users.find(item => String(item?.permalink || '').toLowerCase() === wanted)
    || users.find(item => String(item?.username || '').toLowerCase() === wanted)
    || users[0]
    || null;

  if (!user?.id) throw new Error('SoundCloud Künstlerprofil wurde nicht gefunden.');
  const apiClient = hydration.find(entry => entry?.hydratable === 'apiClient')?.data || {};
  const clientId = String(apiClient?.id || apiClient?.client_id || '').trim();

  return {
    hydration,
    user: {
      ...user,
      id: String(user.id),
      permalink: String(user.permalink || source || '').toLowerCase()
    },
    clientId
  };
}

function walk(value, visit, depth = 0) {
  if (!value || depth > 18) return;
  if (Array.isArray(value)) {
    for (const item of value) walk(item, visit, depth + 1);
    return;
  }
  if (typeof value !== 'object') return;
  visit(value);
  for (const child of Object.values(value)) walk(child, visit, depth + 1);
}

function hydratedTracks(hydration, userId) {
  const found = [];
  const seen = new Set();
  walk(hydration, node => {
    if (String(node?.kind || '').toLowerCase() !== 'track') return;
    const id = String(node?.id || node?.urn || '');
    if (!id || seen.has(id)) return;
    const ownerId = String(node?.user?.id || node?.user_id || '');
    if (userId && ownerId && ownerId !== String(userId)) return;
    if (!node?.permalink_url) return;
    seen.add(id);
    found.push(node);
  });
  return found;
}

function trackTime(track) {
  const candidates = [
    track?.display_date,
    track?.created_at,
    track?.release_date,
    track?.release_day && track?.release_month && track?.release_year
      ? `${track.release_year}-${String(track.release_month).padStart(2, '0')}-${String(track.release_day).padStart(2, '0')}`
      : ''
  ];
  for (const value of candidates) {
    const ms = Date.parse(String(value || ''));
    if (Number.isFinite(ms) && ms > 0) return ms;
  }
  return 0;
}

function buildSoundCloudSnapshot(source, user, tracks) {
  const collection = Array.isArray(tracks) ? tracks : (Array.isArray(tracks?.collection) ? tracks.collection : []);
  const userId = String(user?.id || '').trim();
  const candidates = collection
    .filter(track => {
      if (!track || (!track.urn && !track.id) || !track.permalink_url) return false;
      const ownerId = String(track?.user?.id || track?.user_id || '').trim();
      return !userId || !ownerId || ownerId === userId;
    })
    .map(track => ({ track, time: trackTime(track) }))
    .filter(entry => entry.time > 0)
    .sort((a, b) => b.time - a.time);

  const current = candidates[0]?.track;
  if (!current) throw new Error('SoundCloud Profil hat keine öffentlich abrufbaren eigenen Uploads.');

  const id = String(current.urn || current.id);
  const creator = String(user?.full_name || user?.username || current?.user?.username || source);
  const publishedMs = trackTime(current);
  const publishedAt = publishedMs ? new Date(publishedMs).toISOString() : '';
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

function decodeXml(value) {
  return String(value || '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'");
}

function xmlTag(block, tag) {
  const pattern = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, 'i');
  return decodeXml(block.match(pattern)?.[1] || '').trim();
}

function parseSoundCloudRss(xml, source, user) {
  const items = [...String(xml || '').matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi)]
    .map(match => match[1]);
  if (!items.length) throw new Error('SoundCloud RSS-Feed enthält keine Tracks.');

  const tracks = items.map((block, index) => {
    const link = xmlTag(block, 'link');
    const guid = xmlTag(block, 'guid');
    const idMatch = guid.match(/tracks[/:](\d+)/i) || link.match(/\/([^/?#]+)$/);
    const image = block.match(/<itunes:image[^>]+href=["']([^"']+)["']/i)?.[1] || '';
    return {
      id: idMatch?.[1] || `rss-${index}`,
      urn: /^\d+$/.test(idMatch?.[1] || '') ? `soundcloud:tracks:${idMatch[1]}` : '',
      kind: 'track',
      title: xmlTag(block, 'title'),
      permalink_url: link,
      display_date: xmlTag(block, 'pubDate'),
      artwork_url: decodeXml(image),
      user: {
        id: user?.id || '',
        username: user?.username || source
      }
    };
  }).filter(track => track.permalink_url && track.title);

  return buildSoundCloudSnapshot(source, user, tracks);
}

async function loadProfile(source, force = false) {
  const cached = profileCache.get(source);
  if (!force && cached && cached.expiresAt > Date.now()) return cached.value;

  const html = await fetchText(profileUrl(source), { timeoutMs: 18000 });
  const parsed = parseSoundCloudHydration(html, source);
  const value = { ...parsed, html };
  profileCache.set(source, { value, expiresAt: Date.now() + 6 * 60 * 60 * 1000 });
  return value;
}

async function fetchTracksFromWebApi(profile) {
  if (!profile?.clientId) throw new Error('SoundCloud Web-Client-ID fehlt im öffentlichen Profil.');
  const params = new URLSearchParams({
    client_id: profile.clientId,
    limit: '10',
    offset: '0',
    linked_partitioning: '1'
  });
  return fetchJson(`${API_V2_BASE}/users/${encodeURIComponent(profile.user.id)}/tracks?${params.toString()}`, { timeoutMs: 18000 });
}

async function fetchRssFallback(source, profile) {
  const xml = await fetchText(`${RSS_BASE}${encodeURIComponent(profile.user.id)}/sounds.rss`, {
    timeoutMs: 18000,
    headers: { Accept: 'application/rss+xml,application/xml,text/xml;q=0.9,*/*;q=0.8' }
  });
  return parseSoundCloudRss(xml, source, profile.user);
}

async function fetchSoundCloudUpload(value) {
  const source = normalizeSoundCloudSource(value);
  const cached = latestCache.get(source);
  if (cached && Date.now() - cached.at < cacheSeconds() * 1000) return cached.snapshot;
  if (inflight.has(source)) return inflight.get(source);

  const request = (async () => {
    const errors = [];
    try {
      let profile = await loadProfile(source);

      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          const tracks = await fetchTracksFromWebApi(profile);
          const snapshot = buildSoundCloudSnapshot(source, profile.user, tracks);
          latestCache.set(source, { at: Date.now(), snapshot });
          updateHealth(true, 'public-web-api');
          return snapshot;
        } catch (error) {
          errors.push(`Web API: ${String(error?.message || error).slice(0, 180)}`);
          if (attempt === 0) {
            profile = await loadProfile(source, true);
            continue;
          }
        }
      }

      try {
        const embedded = hydratedTracks(profile.hydration, profile.user.id);
        if (embedded.length) {
          const snapshot = buildSoundCloudSnapshot(source, profile.user, embedded);
          latestCache.set(source, { at: Date.now(), snapshot });
          updateHealth(true, 'hydration-fallback');
          return snapshot;
        }
      } catch (error) {
        errors.push(`Hydration: ${String(error?.message || error).slice(0, 180)}`);
      }

      try {
        const snapshot = await fetchRssFallback(source, profile);
        latestCache.set(source, { at: Date.now(), snapshot });
        updateHealth(true, 'rss-fallback');
        return snapshot;
      } catch (error) {
        errors.push(`RSS: ${String(error?.message || error).slice(0, 180)}`);
      }

      throw new Error(`SoundCloud aktuell nicht abrufbar (${errors.join(' | ').slice(0, 620)}).`);
    } catch (error) {
      updateHealth(false, 'public-web', error?.message || error);
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
  extractAssignedJson,
  parseSoundCloudHydration,
  hydratedTracks,
  buildSoundCloudSnapshot,
  parseSoundCloudRss,
  fetchSoundCloudUpload,
  getSoundCloudProviderHealth
};
