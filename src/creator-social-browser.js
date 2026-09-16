const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');

const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/153.0.0.0 Safari/537.36';
let browserPromise = null;

function existing(candidates) {
  return candidates.filter(Boolean).find(candidate => {
    try { return fs.existsSync(candidate); } catch { return false; }
  }) || '';
}

function findBrowserExecutable() {
  const envPath = [
    process.env.RAKU_BROWSER_PATH,
    process.env.PUPPETEER_EXECUTABLE_PATH,
    process.env.CHROME_PATH
  ].map(value => String(value || '').trim()).filter(Boolean);

  const local = String(process.env.LOCALAPPDATA || '');
  const pf = String(process.env.PROGRAMFILES || '');
  const pfx86 = String(process.env['PROGRAMFILES(X86)'] || '');
  const home = String(process.env.HOME || process.env.USERPROFILE || '');
  const candidates = [...envPath];

  if (process.platform === 'win32') {
    for (const root of [local, pf, pfx86]) {
      if (!root) continue;
      candidates.push(
        path.join(root, 'Google', 'Chrome', 'Application', 'chrome.exe'),
        path.join(root, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
        path.join(root, 'BraveSoftware', 'Brave-Browser', 'Application', 'brave.exe')
      );
    }
  } else if (process.platform === 'darwin') {
    candidates.push(
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
      '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
      path.join(home, 'Applications', 'Google Chrome.app', 'Contents', 'MacOS', 'Google Chrome')
    );
  } else {
    candidates.push(
      '/usr/bin/google-chrome-stable',
      '/usr/bin/google-chrome',
      '/usr/bin/chromium',
      '/usr/bin/chromium-browser',
      '/usr/bin/microsoft-edge-stable',
      '/usr/bin/brave-browser'
    );
  }

  return existing(candidates);
}

async function getBrowser() {
  if (browserPromise) return browserPromise;
  browserPromise = (async () => {
    const executablePath = findBrowserExecutable();
    if (!executablePath) {
      throw new Error('Kein lokaler Chrome-, Edge- oder Brave-Browser gefunden. Optional RAKU_BROWSER_PATH setzen.');
    }
    const args = ['--disable-dev-shm-usage', '--no-first-run', '--no-default-browser-check'];
    if (process.platform !== 'win32') args.push('--no-sandbox', '--disable-setuid-sandbox');
    const browser = await puppeteer.launch({ executablePath, headless: true, args });
    browser.on('disconnected', () => { browserPromise = null; });
    return browser;
  })().catch(error => {
    browserPromise = null;
    throw error;
  });
  return browserPromise;
}

async function withPage(fn) {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setUserAgent(BROWSER_UA);
    await page.setExtraHTTPHeaders({ 'Accept-Language': 'de-DE,de;q=0.9,en;q=0.8' });
    await page.setViewport({ width: 1365, height: 900, deviceScaleFactor: 1 });
    page.setDefaultTimeout(15000);
    page.setDefaultNavigationTimeout(30000);
    return await fn(page);
  } finally {
    await page.close().catch(() => {});
  }
}

function safeIso(value) {
  const parsed = Date.parse(String(value || ''));
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : '';
}

function cleanText(value, fallback) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text || fallback;
}

function buildInstagramBrowserSnapshot(source, data = {}) {
  const url = String(data.url || '');
  const match = url.match(/instagram\.com\/(?:p|reel)\/([^/?#]+)/i);
  const id = String(data.id || match?.[1] || '');
  if (!id || !url) throw new Error('Instagram Browser-Fallback konnte keinen Post-Link bestimmen.');
  const publishedAt = safeIso(data.publishedAt) || new Date().toISOString();
  return {
    platform: 'instagram',
    source,
    creator: cleanText(data.creator, source),
    exists: true,
    live: false,
    id,
    eventKey: `instagram:${source}:post:${id}`,
    title: cleanText(data.title, `${source} hat einen neuen Instagram-Post veröffentlicht.`),
    game: '',
    url,
    thumbnail: String(data.thumbnail || ''),
    avatar: String(data.avatar || ''),
    publishedAt,
    startedAt: publishedAt,
    viewers: 0
  };
}

function buildXBrowserSnapshot(source, row = {}) {
  const url = String(row.url || '');
  const match = url.match(/(?:x|twitter)\.com\/[^/]+\/status\/(\d+)/i);
  const id = String(row.id || match?.[1] || '');
  if (!id || !url) throw new Error('X Browser-Fallback konnte keinen Post-Link bestimmen.');
  const publishedAt = safeIso(row.publishedAt) || new Date().toISOString();
  return {
    platform: 'x',
    source,
    creator: cleanText(row.creator, source),
    exists: true,
    live: false,
    id,
    eventKey: `x:${source}:post:${id}`,
    title: cleanText(row.title, `${source} hat einen neuen Post auf X veröffentlicht.`),
    game: '',
    url,
    thumbnail: String(row.thumbnail || ''),
    avatar: String(row.avatar || ''),
    publishedAt,
    startedAt: publishedAt,
    viewers: 0
  };
}

async function browserFetchJson(page, endpoint, headers = {}) {
  return page.evaluate(async ({ endpoint, headers }) => {
    try {
      const response = await fetch(endpoint, { credentials: 'include', headers });
      const text = await response.text();
      return {
        ok: response.ok,
        status: response.status,
        url: response.url,
        contentType: response.headers.get('content-type') || '',
        text: text.slice(0, 2_500_000)
      };
    } catch (error) {
      return { ok: false, status: 0, url: endpoint, contentType: '', text: '', error: String(error?.message || error) };
    }
  }, { endpoint, headers });
}

function parseBrowserJson(result) {
  if (!result?.ok || !String(result.contentType || '').toLowerCase().includes('json')) return null;
  try { return JSON.parse(result.text); } catch { return null; }
}

async function fetchInstagramBrowserData(source) {
  return withPage(async page => {
    const profileUrl = `https://www.instagram.com/${encodeURIComponent(source)}/`;
    await page.goto(profileUrl, { waitUntil: 'domcontentloaded' });

    const apiHeaders = {
      'X-IG-App-ID': process.env.INSTAGRAM_PUBLIC_APP_ID || '936619743392459',
      'X-ASBD-ID': process.env.INSTAGRAM_PUBLIC_ASBD_ID || '198387',
      'X-Requested-With': 'XMLHttpRequest'
    };

    const feedResult = await browserFetchJson(
      page,
      `https://www.instagram.com/api/v1/feed/user/${encodeURIComponent(source)}/username/?count=6`,
      apiHeaders
    );
    const feedJson = parseBrowserJson(feedResult);
    if (feedJson?.items?.length) return { kind: 'feed', data: feedJson, transport: 'browser-feed' };

    const profileResult = await browserFetchJson(
      page,
      `https://www.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(source)}`,
      apiHeaders
    );
    const profileJson = parseBrowserJson(profileResult);
    if (profileJson?.data?.user || profileJson?.user) return { kind: 'profile', data: profileJson, transport: 'browser-profile' };

    await page.waitForSelector('a[href*="/p/"], a[href*="/reel/"]', { timeout: 9000 }).catch(() => {});
    const links = await page.evaluate(() => {
      const seen = new Set();
      const result = [];
      for (const anchor of document.querySelectorAll('a[href*="/p/"], a[href*="/reel/"]')) {
        const href = anchor.href;
        if (!href || seen.has(href)) continue;
        seen.add(href);
        result.push(href);
        if (result.length >= 3) break;
      }
      return result;
    });

    if (!links.length) {
      const body = await page.evaluate(() => document.body?.innerText?.slice(0, 600) || '');
      throw new Error(`Instagram Browser-Profil enthält keine sichtbaren Posts${body ? ` (${body.slice(0, 180)})` : ''}.`);
    }

    const candidates = [];
    for (const url of links) {
      try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 22000 });
        await page.waitForSelector('time, meta[property="og:description"]', { timeout: 5000 }).catch(() => {});
        const post = await page.evaluate(() => ({
          url: location.href,
          title: document.querySelector('meta[property="og:description"]')?.content || document.querySelector('meta[name="description"]')?.content || '',
          thumbnail: document.querySelector('meta[property="og:image"]')?.content || '',
          publishedAt: document.querySelector('time[datetime]')?.getAttribute('datetime') || '',
          creator: document.querySelector('meta[property="og:title"]')?.content || ''
        }));
        candidates.push(buildInstagramBrowserSnapshot(source, post));
      } catch {}
    }

    if (!candidates.length) throw new Error('Instagram Browser-Fallback konnte die sichtbaren Post-Seiten nicht auslesen.');
    candidates.sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
    return { kind: 'snapshot', snapshot: candidates[0], transport: 'browser-dom' };
  });
}

async function fetchXBrowserPost(source) {
  return withPage(async page => {
    await page.goto(`https://x.com/${encodeURIComponent(source)}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('article[data-testid="tweet"]', { timeout: 12000 }).catch(() => {});

    const rows = await page.evaluate(source => {
      const replyWords = /replying to|antwort an|en réponse à|in risposta a|respondiendo a|返信先/i;
      const out = [];
      for (const article of document.querySelectorAll('article[data-testid="tweet"]')) {
        const links = [...article.querySelectorAll('a[href*="/status/"]')].map(a => a.href);
        const ownUrl = links.find(href => {
          try { return new URL(href).pathname.toLowerCase().startsWith(`/${source.toLowerCase()}/status/`); } catch { return false; }
        });
        if (!ownUrl) continue;
        const id = ownUrl.match(/\/status\/(\d+)/)?.[1] || '';
        if (!id) continue;
        const socialContext = article.querySelector('[data-testid="socialContext"]')?.innerText || '';
        if (/repost|retweet|retweeted/i.test(socialContext)) continue;
        const bodyText = article.innerText || '';
        if (replyWords.test(bodyText)) continue;
        const title = article.querySelector('[data-testid="tweetText"]')?.innerText || '';
        const publishedAt = article.querySelector('time[datetime]')?.getAttribute('datetime') || '';
        const userBlock = article.querySelector('[data-testid="User-Name"]')?.innerText || '';
        const creator = userBlock.split('\n').find(line => line && !line.startsWith('@')) || source;
        const images = [...article.querySelectorAll('img')].map(img => img.src).filter(Boolean);
        const thumbnail = images.find(src => /pbs\.twimg\.com\/media\//i.test(src)) || '';
        const avatar = images.find(src => /pbs\.twimg\.com\/profile_images\//i.test(src)) || '';
        out.push({ id, url: ownUrl, title, publishedAt, creator, thumbnail, avatar });
      }
      return out;
    }, source);

    if (!rows.length) {
      const body = await page.evaluate(() => document.body?.innerText?.slice(0, 600) || '');
      throw new Error(`X Browser-Profil enthält keine sichtbaren eigenen Posts${body ? ` (${body.slice(0, 180)})` : ''}.`);
    }

    const snapshots = rows.map(row => buildXBrowserSnapshot(source, row));
    snapshots.sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
    return snapshots[0];
  });
}

module.exports = {
  findBrowserExecutable,
  buildInstagramBrowserSnapshot,
  buildXBrowserSnapshot,
  fetchInstagramBrowserData,
  fetchXBrowserPost
};
