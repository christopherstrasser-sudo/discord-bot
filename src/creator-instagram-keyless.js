const base = require('./creator-social-providers');

let impitPromise = null;

function optionalEnv(name) {
  return String(process.env[name] || '').trim();
}

function compactError(error) {
  return String(error?.message || error || 'Unbekannter Fehler').replace(/\s+/g, ' ').trim().slice(0, 220);
}

async function getImpit() {
  if (!impitPromise) {
    impitPromise = import('impit')
      .then(mod => {
        if (!mod?.Impit) throw new Error('Impit HTTP transport konnte nicht geladen werden.');
        return new mod.Impit({ browser: 'chrome' });
      })
      .catch(error => {
        impitPromise = null;
        throw error;
      });
  }
  return impitPromise;
}

function responseCookies(headers) {
  if (!headers) return [];
  try {
    if (typeof headers.getSetCookie === 'function') return headers.getSetCookie();
  } catch {}
  const raw = headers.get?.('set-cookie');
  return raw ? [raw] : [];
}

function cookieValue(headers, name) {
  const needle = `${name}=`;
  for (const header of responseCookies(headers)) {
    for (const part of String(header || '').split(/,(?=[^;,]+=)/)) {
      const segment = part.trim();
      const index = segment.toLowerCase().indexOf(needle.toLowerCase());
      if (index < 0) continue;
      const value = segment.slice(index + needle.length).split(';')[0].trim();
      if (value) return value;
    }
  }
  return '';
}

function walkJson(value, visit, depth = 0) {
  if (!value || depth > 20) return;
  if (Array.isArray(value)) {
    for (const item of value) walkJson(item, visit, depth + 1);
    return;
  }
  if (typeof value !== 'object') return;
  visit(value);
  for (const child of Object.values(value)) walkJson(child, visit, depth + 1);
}

function identityFromJson(value, source) {
  let match = null;
  walkJson(value, node => {
    if (match || typeof node !== 'object') return;
    if (String(node.username || '').toLowerCase() !== source) return;
    const id = String(node.pk || node.pk_id || node.id || node.profile_id || '');
    if (!/^\d+$/.test(id)) return;
    match = {
      id,
      username: source,
      full_name: String(node.full_name || node.name || source),
      profile_pic_url: String(node.profile_pic_url || node.profile_pic_url_hd || node.hd_profile_pic_url_info?.url || '')
    };
  });
  return match;
}

function extractInstagramIdentityFromHtml(html, source) {
  const text = String(html || '');
  const scripts = [...text.matchAll(/<script[^>]+type=["']application\/json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  for (const match of scripts) {
    try {
      const identity = identityFromJson(JSON.parse(match[1]), source);
      if (identity) return identity;
    } catch {}
  }

  const profilePage = text.match(/profilePage_(\d+)/i);
  if (profilePage) return { id: profilePage[1], username: source, full_name: source, profile_pic_url: '' };
  const profileId = text.match(/["']profile_id["']\s*:\s*["']?(\d+)["']?/i);
  if (profileId) return { id: profileId[1], username: source, full_name: source, profile_pic_url: '' };

  const escaped = source.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const nearUsername = text.match(new RegExp(`["']username["']\\s*:\\s*["']${escaped}["'][\\s\\S]{0,900}?["'](?:pk|pk_id|id)["']\\s*:\\s*["']?(\\d+)`, 'i'));
  if (nearUsername) return { id: nearUsername[1], username: source, full_name: source, profile_pic_url: '' };
  return null;
}

function identityFromTopSearch(data, source) {
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

async function fetchText(client, url, options = {}) {
  const response = await client.fetch(url, {
    ...options,
    headers: {
      'Accept-Language': 'de-DE,de;q=0.9,en;q=0.8',
      ...(options.headers || {})
    },
    redirect: options.redirect || 'follow'
  });
  const text = await response.text();
  if (!response.ok) {
    const error = new Error(`HTTP ${response.status}${text ? `: ${text.slice(0, 220)}` : ''}`);
    error.status = response.status;
    error.responseHeaders = response.headers;
    throw error;
  }
  return { text, headers: response.headers, url: response.url };
}

async function fetchJson(client, url, options = {}) {
  const result = await fetchText(client, url, {
    ...options,
    headers: {
      Accept: 'application/json, text/plain, */*',
      ...(options.headers || {})
    }
  });
  try {
    return { data: JSON.parse(result.text), headers: result.headers, url: result.url };
  } catch {
    throw new Error(`Instagram lieferte kein JSON (${result.text.slice(0, 120)}).`);
  }
}

function instagramHeaders(source) {
  return {
    'X-IG-App-ID': optionalEnv('INSTAGRAM_PUBLIC_APP_ID') || '936619743392459',
    'X-ASBD-ID': optionalEnv('INSTAGRAM_PUBLIC_ASBD_ID') || '198387',
    'X-Requested-With': 'XMLHttpRequest',
    Referer: `https://www.instagram.com/${source}/`
  };
}

async function resolveIdentity(client, source) {
  const errors = [];
  let csrf = '';
  let identity = null;

  try {
    const seed = await fetchText(client, `https://www.instagram.com/${encodeURIComponent(source)}/`, {
      headers: {
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8'
      }
    });
    csrf = cookieValue(seed.headers, 'csrftoken');
    identity = extractInstagramIdentityFromHtml(seed.text, source);
  } catch (error) {
    errors.push(`html: ${compactError(error)}`);
  }

  if (!identity) {
    try {
      const params = new URLSearchParams({ context: 'blended', query: source, include_reel: 'false', __a: '1' });
      const search = await fetchJson(client, `https://www.instagram.com/web/search/topsearch/?${params.toString()}`, {
        headers: instagramHeaders(source)
      });
      identity = identityFromTopSearch(search.data, source);
      csrf ||= cookieValue(search.headers, 'csrftoken');
      if (!identity) errors.push('topsearch: exakter Handle nicht gefunden');
    } catch (error) {
      errors.push(`topsearch: ${compactError(error)}`);
    }
  }

  if (!identity) throw new Error(`Instagram User-ID konnte nicht aufgelöst werden (${errors.join(' | ')}).`);
  return { identity, csrf, errors };
}

function parseGraphqlTimeline(data, source, identity) {
  const edge = data?.data?.user?.edge_owner_to_timeline_media
    || data?.data?.xdt_api__v1__feed__user_timeline_graphql_connection
    || null;
  if (!edge) throw new Error('Instagram GraphQL lieferte keine Timeline.');

  const profile = {
    id: identity.id,
    pk: identity.id,
    username: source,
    full_name: identity.full_name || source,
    profile_pic_url: identity.profile_pic_url || '',
    edge_owner_to_timeline_media: edge
  };
  return base.parseInstagramProfileInfo({ data: { user: profile } }, source);
}

async function fetchByNumericId(client, source, identity, headers) {
  const response = await fetchJson(client, `https://www.instagram.com/api/v1/feed/user/${encodeURIComponent(identity.id)}/?count=12`, { headers });
  return base.parseInstagramFeedPayload(response.data, source, response.data?.user || identity);
}

async function fetchByGraphql(client, source, identity, csrf, headers) {
  const variables = {
    data: {
      count: 12,
      include_relationship_info: true,
      latest_besties_reel_media: true,
      latest_reel_media: true
    },
    id: String(identity.id)
  };
  const params = new URLSearchParams({
    variables: JSON.stringify(variables),
    doc_id: optionalEnv('INSTAGRAM_TIMELINE_DOC_ID') || '7950326061742207',
    server_timestamps: 'true'
  });
  const gqlHeaders = {
    ...headers,
    Accept: '*/*',
    ...(csrf ? { 'X-CSRFToken': csrf } : {})
  };

  try {
    const result = await fetchJson(client, `https://www.instagram.com/graphql/query/?${params.toString()}`, { headers: gqlHeaders });
    return parseGraphqlTimeline(result.data, source, identity);
  } catch (getError) {
    const result = await fetchJson(client, 'https://www.instagram.com/graphql/query/', {
      method: 'POST',
      headers: { ...gqlHeaders, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString()
    });
    try {
      return parseGraphqlTimeline(result.data, source, identity);
    } catch (postError) {
      throw new Error(`GET ${compactError(getError)} | POST ${compactError(postError)}`);
    }
  }
}

async function fetchLegacyUsernamePaths(client, source, headers) {
  const errors = [];
  try {
    const result = await fetchJson(client, `https://www.instagram.com/api/v1/feed/user/${encodeURIComponent(source)}/username/?count=6`, { headers });
    return base.parseInstagramFeedPayload(result.data, source, result.data?.user || result.data?.items?.[0]?.user || {});
  } catch (error) {
    errors.push(`username-feed: ${compactError(error)}`);
  }
  try {
    const result = await fetchJson(client, `https://www.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(source)}`, { headers });
    return base.parseInstagramProfileInfo(result.data, source);
  } catch (error) {
    errors.push(`profile: ${compactError(error)}`);
  }
  throw new Error(errors.join(' | '));
}

async function fetchInstagramKeyless(value) {
  const source = base.normalizeSocialHandle('instagram', value);
  const client = await getImpit();
  const headers = instagramHeaders(source);
  const errors = [];

  let resolved = null;
  try {
    resolved = await resolveIdentity(client, source);
  } catch (error) {
    errors.push(`identity: ${compactError(error)}`);
  }

  if (resolved?.identity?.id) {
    try {
      return { snapshot: await fetchByNumericId(client, source, resolved.identity, headers), mode: 'id-feed' };
    } catch (error) {
      errors.push(`id-feed: ${compactError(error)}`);
    }

    try {
      return { snapshot: await fetchByGraphql(client, source, resolved.identity, resolved.csrf, headers), mode: 'graphql' };
    } catch (error) {
      errors.push(`graphql: ${compactError(error)}`);
    }
  }

  try {
    return { snapshot: await fetchLegacyUsernamePaths(client, source, headers), mode: 'legacy-web' };
  } catch (error) {
    errors.push(compactError(error));
  }

  throw new Error(errors.join(' | ').slice(0, 700));
}

module.exports = {
  fetchInstagramKeyless,
  extractInstagramIdentityFromHtml,
  identityFromTopSearch,
  parseGraphqlTimeline
};