const PROFILE_BASE = 'https://imginn.com';
const DEFAULT_MAX_DETAILS = 6;

function decodeHtml(value) {
  return String(value || '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)));
}

function stripTags(value) {
  return decodeHtml(String(value || '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<(?:br\s*\/?>|\/p\s*>|\/div\s*>|\/li\s*>|\/h[1-6]\s*>)/gi, '\n')
    .replace(/<[^>]+>/g, ' '))
    .replace(/\r/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function metaContent(html, key, attr = 'property') {
  const escaped = String(key).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patterns = [
    new RegExp(`<meta[^>]+${attr}=["']${escaped}["'][^>]+content=["']([^"']*)["'][^>]*>`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+${attr}=["']${escaped}["'][^>]*>`, 'i')
  ];
  for (const pattern of patterns) {
    const match = String(html || '').match(pattern);
    if (match) return decodeHtml(match[1]).trim();
  }
  return '';
}

function normalizeCode(value) {
  const code = String(value || '').trim();
  return /^[A-Za-z0-9_-]{4,32}$/.test(code) ? code : '';
}

function extractPostCodes(profileHtml, limit = DEFAULT_MAX_DETAILS) {
  const html = String(profileHtml || '');
  const found = [];
  const seen = new Set();
  const patterns = [
    /href=["'](?:https?:\/\/imginn\.com)?\/p\/([A-Za-z0-9_-]{4,32})\/?(?:[?#][^"']*)?["']/gi,
    /(?:https?:\/\/imginn\.com)?\/p\/([A-Za-z0-9_-]{4,32})\//gi
  ];
  for (const pattern of patterns) {
    for (const match of html.matchAll(pattern)) {
      const code = normalizeCode(match[1]);
      if (!code || seen.has(code)) continue;
      seen.add(code);
      found.push(code);
      if (found.length >= limit) return found;
    }
  }
  return found;
}

const MONTHS = {
  january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
  july: 6, august: 7, september: 8, october: 9, november: 10, december: 11
};

function parsePostedOn(text) {
  const clean = stripTags(text);
  const match = clean.match(/Posted\s+On:\s*([A-Za-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?\s+(\d{4}),?\s+(\d{1,2}):(\d{2})\s*(am|pm)/i);
  if (!match) return '';
  const month = MONTHS[match[1].toLowerCase()];
  if (month === undefined) return '';
  let hour = Number(match[4]);
  const minute = Number(match[5]);
  const suffix = match[6].toLowerCase();
  if (suffix === 'pm' && hour !== 12) hour += 12;
  if (suffix === 'am' && hour === 12) hour = 0;
  const date = new Date(Date.UTC(Number(match[3]), month, Number(match[2]), hour, minute, 0));
  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
}

function captionFromPostHtml(html) {
  const og = metaContent(html, 'og:description');
  if (og && !/^instagram story viewer/i.test(og)) return og.replace(/\s+/g, ' ').trim();
  const description = metaContent(html, 'description', 'name');
  if (description && !/^instagram story viewer/i.test(description)) return description.replace(/\s+/g, ' ').trim();

  const text = stripTags(html);
  const match = text.match(/Posted\s+On:\s*[^\n]+\n+([\s\S]*?)(?:\n+Comments\s*\(|\n+More posts|$)/i);
  return String(match?.[1] || '').replace(/\s+/g, ' ').trim();
}

function creatorFromPostHtml(html, source) {
  const title = metaContent(html, 'og:title') || metaContent(html, 'twitter:title', 'name');
  const match = title.match(/^(.+?)\s*\(@[^)]+\)/);
  return String(match?.[1] || source).trim();
}

function imageFromPostHtml(html) {
  const og = metaContent(html, 'og:image');
  if (og) return og;
  const twitter = metaContent(html, 'twitter:image', 'name');
  if (twitter) return twitter;
  const match = String(html || '').match(/https?:\/\/[^"'\s>]+(?:cdninstagram\.com|imginn\.com)[^"'\s>]*/i);
  return decodeHtml(match?.[0] || '');
}

function parseImginnPostHtml(html, source, code) {
  const postCode = normalizeCode(code);
  if (!postCode) throw new Error('Imginn Post-Code ist ungültig.');
  const publishedAt = parsePostedOn(html);
  const creator = creatorFromPostHtml(html, source);
  const title = captionFromPostHtml(html) || `${creator} hat einen neuen Instagram-Post veröffentlicht.`;
  return {
    platform: 'instagram',
    source,
    creator,
    exists: true,
    live: false,
    id: postCode,
    eventKey: `instagram:${source}:post:${postCode}`,
    title,
    game: '',
    url: `https://www.instagram.com/p/${encodeURIComponent(postCode)}/`,
    thumbnail: imageFromPostHtml(html),
    avatar: '',
    publishedAt,
    startedAt: publishedAt,
    viewers: 0
  };
}

async function requestText(url, timeoutMs = 18000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      headers: {
        Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'de-DE,de;q=0.9,en;q=0.8',
        'Cache-Control': 'no-cache',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36'
      },
      redirect: 'follow',
      signal: controller.signal
    });
    const text = await response.text();
    if (!response.ok) {
      const error = new Error(`HTTP ${response.status}${text ? `: ${stripTags(text).slice(0, 180)}` : ''}`);
      error.status = response.status;
      throw error;
    }
    return text;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchInstagramImginn(source, options = {}) {
  const handle = String(source || '').replace(/^@/, '').trim().toLowerCase();
  if (!/^[a-z0-9._]{1,30}$/.test(handle)) throw new Error('Imginn: ungültiger Instagram-Handle.');
  const maxDetails = Math.max(3, Math.min(Number(options.maxDetails || DEFAULT_MAX_DETAILS), 8));
  const profileHtml = await requestText(`${PROFILE_BASE}/${encodeURIComponent(handle)}/`, Number(options.timeoutMs || 18000));
  const codes = extractPostCodes(profileHtml, maxDetails);
  if (!codes.length) throw new Error('Imginn lieferte für dieses öffentliche Profil keine Post-Links.');

  const details = [];
  for (let index = 0; index < codes.length; index += 2) {
    const batch = codes.slice(index, index + 2);
    const resolved = await Promise.all(batch.map(async code => {
      try {
        const html = await requestText(`${PROFILE_BASE}/p/${encodeURIComponent(code)}/`, Number(options.timeoutMs || 18000));
        return parseImginnPostHtml(html, handle, code);
      } catch {
        return null;
      }
    }));
    details.push(...resolved.filter(Boolean));
  }

  if (!details.length) throw new Error('Imginn lieferte Post-Links, aber keine Detailseite konnte ausgewertet werden.');
  const dated = details.filter(item => item.publishedAt && Number.isFinite(Date.parse(item.publishedAt)));
  if (dated.length) dated.sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
  return (dated[0] || details[0]);
}

module.exports = {
  extractPostCodes,
  parsePostedOn,
  parseImginnPostHtml,
  fetchInstagramImginn
};