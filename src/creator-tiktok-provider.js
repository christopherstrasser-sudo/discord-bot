const health = {
  configured: false,
  ok: false,
  lastCheckedAt: null,
  lastSuccessAt: null,
  lastError: '',
  capabilities: { live: null, upload: null }
};

function optionalEnv(name) {
  return String(process.env[name] || '').trim();
}

function nowIso() {
  return new Date().toISOString();
}

function setHealth(patch = {}) {
  Object.assign(health, patch, { lastCheckedAt: nowIso() });
}

function getTikTokProviderHealth() {
  return JSON.parse(JSON.stringify({
    ...health,
    configured: Boolean(optionalEnv('TIKTOK_STATUS_ENDPOINT'))
  }));
}

function endpointFor(username) {
  const template = optionalEnv('TIKTOK_STATUS_ENDPOINT');
  if (!template) throw new Error('TikTok Provider ist nicht verbunden.');
  if (template.includes('{username}')) return template.replaceAll('{username}', encodeURIComponent(username));
  const url = new URL(template);
  url.searchParams.set('username', username);
  return url.toString();
}

async function fetchJson(url, timeoutMs = 12000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'RAKU-Creator-Hub/0.9.2',
        Accept: 'application/json'
      },
      signal: controller.signal
    });
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`HTTP ${response.status}${body ? `: ${body.slice(0, 240)}` : ''}`);
    }
    return response.json();
  } finally {
    clearTimeout(timer);
  }
}

function isoTime(value) {
  if (value === null || value === undefined || value === '') return '';
  if (typeof value === 'number' || /^\d+$/.test(String(value))) {
    const raw = Number(value);
    const millis = raw > 10_000_000_000 ? raw : raw * 1000;
    const date = new Date(millis);
    return Number.isNaN(date.getTime()) ? '' : date.toISOString();
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toISOString();
}

function pickUpload(data, source) {
  const hasNested = Object.prototype.hasOwnProperty.call(data || {}, 'latestUpload') ||
    Object.prototype.hasOwnProperty.call(data || {}, 'latestVideo');
  const advertised = data?.capabilities?.upload === true;
  const supported = hasNested || advertised;
  const raw = data?.latestUpload ?? data?.latestVideo ?? null;
  if (!raw || typeof raw !== 'object') return { supported, upload: null };

  const id = String(raw.id || raw.videoId || raw.awemeId || '').trim();
  const title = String(raw.title || raw.description || raw.caption || '').trim();
  const url = String(raw.url || raw.shareUrl || raw.share_url || (id ? `https://www.tiktok.com/@${source}/video/${id}` : '')).trim();
  const thumbnail = String(raw.thumbnail || raw.cover || raw.coverUrl || raw.cover_url || '').trim();
  const publishedAt = isoTime(raw.publishedAt || raw.createTime || raw.create_time || raw.createdAt || raw.created_at);

  return {
    supported,
    upload: id ? {
      id,
      title,
      url,
      thumbnail,
      publishedAt,
      viewers: Number(raw.views || raw.viewCount || raw.view_count || 0)
    } : null
  };
}

async function fetchTikTokSnapshot(username) {
  const source = String(username || '').trim().replace(/^@/, '').toLowerCase();
  if (!source) throw new Error('TikTok @Handle fehlt.');

  try {
    const data = await fetchJson(endpointFor(source));
    if (data?.exists === false) throw new Error('TikTok Creator wurde nicht gefunden.');

    const liveSupported = typeof data?.live === 'boolean' || data?.capabilities?.live === true;
    const { supported: uploadSupported, upload } = pickUpload(data, source);
    if (!liveSupported && !uploadSupported) {
      throw new Error('TikTok Adapter unterstützt weder Live-Status noch Upload-Erkennung.');
    }

    const liveId = String(data.liveId || data.roomId || data.id || '').trim();
    const snapshot = {
      platform: 'tiktok',
      source,
      creator: String(data.creator || data.displayName || source),
      avatar: String(data.avatar || ''),
      exists: true,
      liveSupported,
      uploadSupported,
      live: liveSupported ? Boolean(data.live) : false,
      id: liveId,
      eventKey: data.live && liveId ? `tiktok:${source}:live:${liveId}` : `tiktok:${source}:offline`,
      title: String(data.title || ''),
      game: '',
      url: String(data.url || `https://www.tiktok.com/@${source}/live`),
      thumbnail: String(data.thumbnail || ''),
      startedAt: String(data.startedAt || ''),
      viewers: Number(data.viewers || 0),
      latestUpload: upload
    };

    setHealth({
      ok: true,
      lastSuccessAt: nowIso(),
      lastError: '',
      capabilities: { live: liveSupported, upload: uploadSupported }
    });
    return snapshot;
  } catch (error) {
    setHealth({ ok: false, lastError: String(error?.message || error || 'Unbekannter Fehler').slice(0, 500) });
    throw error;
  }
}

function snapshotForTikTokRule(rule, snapshot) {
  if (!snapshot || snapshot.error) return snapshot;
  if (rule?.event !== 'upload') {
    if (!snapshot.liveSupported) return { error: 'TikTok Adapter unterstützt keine Live-Erkennung.' };
    return snapshot;
  }

  if (!snapshot.uploadSupported) {
    return { error: 'TikTok Adapter unterstützt noch keine Upload-Erkennung.' };
  }

  const upload = snapshot.latestUpload;
  return {
    platform: 'tiktok',
    source: snapshot.source,
    creator: snapshot.creator,
    avatar: snapshot.avatar,
    exists: true,
    live: false,
    id: upload?.id || '',
    eventKey: upload?.id ? `tiktok:${snapshot.source}:upload:${upload.id}` : `tiktok:${snapshot.source}:upload:empty`,
    title: upload?.title || '',
    game: '',
    url: upload?.url || `https://www.tiktok.com/@${snapshot.source}`,
    thumbnail: upload?.thumbnail || '',
    publishedAt: upload?.publishedAt || '',
    startedAt: upload?.publishedAt || '',
    viewers: Number(upload?.viewers || 0)
  };
}

module.exports = {
  fetchTikTokSnapshot,
  snapshotForTikTokRule,
  getTikTokProviderHealth,
  pickUpload
};
