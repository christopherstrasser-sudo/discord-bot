const fs = require('fs');
const path = require('path');

const FILE = path.join(process.cwd(), 'data', 'tiktok-collector', 'signed-handles.json');
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;

function readAll() {
  try {
    const data = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    return data && typeof data === 'object' && !Array.isArray(data) ? data : {};
  } catch {
    return {};
  }
}

function getHandle(source, ttlMs = DEFAULT_TTL_MS) {
  const key = String(source || '').trim().toLowerCase();
  if (!key) return null;
  const entry = readAll()[key];
  if (!entry?.secUid) return null;
  if (Date.now() - Number(entry.updatedAt || 0) > ttlMs) return null;
  return {
    secUid: String(entry.secUid),
    creator: String(entry.creator || key),
    avatar: String(entry.avatar || ''),
    updatedAt: Number(entry.updatedAt || 0)
  };
}

function setHandle(source, profile) {
  const key = String(source || '').trim().toLowerCase();
  const secUid = String(profile?.secUid || '').trim();
  if (!key || !secUid) return;
  const all = readAll();
  all[key] = {
    secUid,
    creator: String(profile?.creator || key),
    avatar: String(profile?.avatar || ''),
    updatedAt: Date.now()
  };
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  const tmp = `${FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(all, null, 2));
  fs.renameSync(tmp, FILE);
}

module.exports = {
  getHandle,
  setHandle,
  DEFAULT_TTL_MS
};
