const base = require('./creator-social-providers');
const {
  fetchInstagramBrowserData,
  fetchXBrowserPost,
  findBrowserExecutable
} = require('./creator-social-browser');

const fallbackCache = new Map();
const fallbackInflight = new Map();
const primaryBackoff = new Map();
const browserHealth = {
  instagram: { ok: false, lastCheckedAt: null, lastSuccessAt: null, lastError: '', mode: 'browser-fallback' },
  x: { ok: false, lastCheckedAt: null, lastSuccessAt: null, lastError: '', mode: 'browser-fallback' }
};

function nowIso() {
  return new Date().toISOString();
}

function sourceKey(platform, source) {
  return `${platform}:${String(source || '').replace(/^@/, '').trim().toLowerCase()}`;
}

function blockedError(error) {
  const message = String(error?.message || error || '');
  return /HTTP\s+(?:401|403|429)\b|rate limit|too many requests|bitte warte einige minuten/i.test(message);
}

function backoffMs(platform) {
  return platform === 'instagram' ? 30 * 60 * 1000 : 12 * 60 * 1000;
}

function fallbackTtlMs(platform) {
  return platform === 'instagram' ? 5 * 60 * 1000 : 3 * 60 * 1000;
}

function markBrowser(platform, ok, error = '') {
  browserHealth[platform] = {
    ...browserHealth[platform],
    ok,
    lastCheckedAt: nowIso(),
    ...(ok ? { lastSuccessAt: nowIso(), lastError: '' } : { lastError: String(error || '').slice(0, 500) })
  };
}

function compactError(error) {
  return String(error?.message || error || 'Unbekannter Fehler').replace(/\s+/g, ' ').trim().slice(0, 240);
}

async function browserFallback(platform, source) {
  const key = sourceKey(platform, source);
  const cached = fallbackCache.get(key);
  const ttl = fallbackTtlMs(platform);
  if (cached && Date.now() - cached.at < ttl) return cached.value;
  if (fallbackInflight.has(key)) return fallbackInflight.get(key);

  const request = (async () => {
    try {
      let value;
      if (platform === 'x') {
        value = await fetchXBrowserPost(String(source || '').replace(/^@/, '').toLowerCase());
      } else if (platform === 'instagram') {
        const normalized = base.normalizeSocialHandle('instagram', source);
        const browserData = await fetchInstagramBrowserData(normalized);
        if (browserData.kind === 'feed') value = base.parseInstagramFeedPayload(browserData.data, normalized);
        else if (browserData.kind === 'profile') value = base.parseInstagramProfileInfo(browserData.data, normalized);
        else value = browserData.snapshot;
      } else {
        throw new Error(`Kein Browser-Fallback für ${platform}.`);
      }
      fallbackCache.set(key, { at: Date.now(), value });
      markBrowser(platform, true);
      return value;
    } catch (error) {
      markBrowser(platform, false, error);
      throw error;
    } finally {
      fallbackInflight.delete(key);
    }
  })();

  fallbackInflight.set(key, request);
  return request;
}

async function fetchSocialPost(platform, source) {
  if (!['instagram', 'x'].includes(platform)) return base.fetchSocialPost(platform, source);

  const key = sourceKey(platform, source);
  const blockedUntil = Number(primaryBackoff.get(key) || 0);
  let primaryError = null;

  if (Date.now() >= blockedUntil) {
    try {
      const result = await base.fetchSocialPost(platform, source);
      primaryBackoff.delete(key);
      return result;
    } catch (error) {
      primaryError = error;
      if (blockedError(error)) primaryBackoff.set(key, Date.now() + backoffMs(platform));
    }
  } else {
    const seconds = Math.ceil((blockedUntil - Date.now()) / 1000);
    primaryError = new Error(`Öffentlicher ${platform === 'x' ? 'X' : 'Instagram'}-Feed nach Rate-Limit noch ${seconds}s im Backoff.`);
  }

  try {
    return await browserFallback(platform, source);
  } catch (browserError) {
    const label = platform === 'x' ? 'X' : 'Instagram';
    throw new Error(`${label} aktuell weder über öffentlichen Feed noch lokalen Browser abrufbar (Feed: ${compactError(primaryError)} | Browser: ${compactError(browserError)}).`);
  }
}

function getSocialProviderHealth() {
  const health = base.getSocialProviderHealth();
  const browserAvailable = Boolean(findBrowserExecutable());
  for (const platform of ['instagram', 'x']) {
    const fallback = browserHealth[platform];
    health[platform] = {
      ...health[platform],
      ok: Boolean(health[platform]?.ok || fallback.ok),
      mode: fallback.ok ? 'browser-fallback' : health[platform]?.mode,
      browserFallback: {
        available: browserAvailable,
        ok: fallback.ok,
        lastCheckedAt: fallback.lastCheckedAt,
        lastSuccessAt: fallback.lastSuccessAt,
        lastError: fallback.lastError
      }
    };
  }
  return health;
}

module.exports = {
  ...base,
  fetchSocialPost,
  getSocialProviderHealth
};
