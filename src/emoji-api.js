const fs = require('fs');
const path = require('path');

const cacheDir = path.join(__dirname, '..', 'data');
const cacheFile = path.join(cacheDir, 'emoji-data-v1.8.0-de.json');
const SOURCES = [
  {
    label: 'de/cldr',
    url: 'https://cdn.jsdelivr.net/npm/emoji-picker-element-data@1.8.0/de/cldr/data.json'
  },
  {
    label: 'en/emojibase',
    url: 'https://cdn.jsdelivr.net/npm/emoji-picker-element-data@1.8.0/en/emojibase/data.json'
  }
];

let memoryCache = null;
let pendingLoad = null;

function validEmojiData(value) {
  return Array.isArray(value) &&
    value.length > 100 &&
    value.some(item => typeof item?.emoji === 'string' || typeof item?.unicode === 'string');
}

function readDiskCache() {
  if (memoryCache) return memoryCache;

  try {
    const parsed = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
    if (validEmojiData(parsed)) {
      memoryCache = parsed;
      return memoryCache;
    }
  } catch {}

  return null;
}

function writeDiskCache(data) {
  try {
    fs.mkdirSync(cacheDir, { recursive: true });
    const temp = `${cacheFile}.tmp`;
    fs.writeFileSync(temp, JSON.stringify(data), 'utf8');
    fs.renameSync(temp, cacheFile);
  } catch (error) {
    console.warn(`[EMOJI] Cache konnte nicht geschrieben werden: ${error.message}`);
  }
}

async function fetchEmojiData() {
  const cached = readDiskCache();
  if (cached) return cached;
  if (pendingLoad) return pendingLoad;

  pendingLoad = (async () => {
    let lastError = null;

    for (const source of SOURCES) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);

      try {
        const response = await fetch(source.url, {
          signal: controller.signal,
          headers: { 'User-Agent': 'RAKU-Discord-Bot/0.7.4' }
        });

        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const data = await response.json();
        if (!validEmojiData(data)) {
          const firstKeys = Array.isArray(data) && data[0] ? Object.keys(data[0]).slice(0, 8).join(', ') : 'n/a';
          throw new Error(`Ungültige Emoji-Daten (erste Felder: ${firstKeys})`);
        }

        memoryCache = data;
        writeDiskCache(data);
        console.log(`[EMOJI] ${data.length} Emoji-Einträge aus ${source.label} gecacht.`);
        return data;
      } catch (error) {
        lastError = error;
        console.warn(`[EMOJI] Datenquelle fehlgeschlagen (${source.url}): ${error.message}`);
      } finally {
        clearTimeout(timeout);
      }
    }

    throw lastError || new Error('Emoji-Daten konnten nicht geladen werden.');
  })();

  try {
    return await pendingLoad;
  } finally {
    pendingLoad = null;
  }
}

function attachEmojiApi(app) {
  app.get('/api/emoji-data', async (_req, res) => {
    try {
      const data = await fetchEmojiData();
      res.set('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');
      res.json(data);
    } catch (error) {
      console.warn(`[EMOJI] API nicht verfügbar: ${error.message}`);
      res.status(503).json({
        error: 'emoji_data_unavailable',
        message: 'Emoji-Daten konnten nicht geladen werden.'
      });
    }
  });
}

module.exports = { attachEmojiApi };
