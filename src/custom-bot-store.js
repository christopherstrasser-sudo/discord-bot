const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, '..', 'data');
const dataFile = path.join(dataDir, 'custom-bots.json');
const CIPHER = 'aes-256-gcm';
const SALT = 'orbit-custom-bot-credentials-v1';

function encryptionKey() {
  const secret = String(process.env.SESSION_SECRET || '').trim();
  if (!secret) throw new Error('SESSION_SECRET fehlt; Custom-Bot-Credentials können nicht verschlüsselt werden.');
  return crypto.scryptSync(secret, SALT, 32);
}

function encryptSecret(value) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(CIPHER, encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()]);
  return {
    ciphertext: encrypted.toString('base64'),
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64')
  };
}

function decryptSecret(record) {
  if (!record?.ciphertext || !record?.iv || !record?.tag) return '';
  const decipher = crypto.createDecipheriv(CIPHER, encryptionKey(), Buffer.from(record.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(record.tag, 'base64'));
  const plain = Buffer.concat([
    decipher.update(Buffer.from(record.ciphertext, 'base64')),
    decipher.final()
  ]);
  return plain.toString('utf8');
}

function ensureStore() {
  fs.mkdirSync(dataDir, { recursive: true });
  if (!fs.existsSync(dataFile)) {
    fs.writeFileSync(dataFile, JSON.stringify({ schemaVersion: 1, guilds: {} }, null, 2), 'utf8');
  }
}

function readStore() {
  ensureStore();
  try {
    const parsed = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
    if (!parsed || typeof parsed !== 'object') throw new Error('Invalid custom bot store');
    if (!parsed.guilds || typeof parsed.guilds !== 'object') parsed.guilds = {};
    return parsed;
  } catch (error) {
    const backup = `${dataFile}.corrupt-${Date.now()}`;
    try { fs.copyFileSync(dataFile, backup); } catch {}
    console.warn(`[CUSTOM BOT] Invalid credential store backed up to ${backup}`);
    const fresh = { schemaVersion: 1, guilds: {} };
    fs.writeFileSync(dataFile, JSON.stringify(fresh, null, 2), 'utf8');
    return fresh;
  }
}

function writeStore(store) {
  ensureStore();
  const temp = `${dataFile}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(store, null, 2), { encoding: 'utf8', mode: 0o600 });
  fs.renameSync(temp, dataFile);
  try { fs.chmodSync(dataFile, 0o600); } catch {}
}

function safeRecord(guildId, record) {
  if (!record) return null;
  return {
    guildId,
    configured: Boolean(record.token?.ciphertext),
    applicationId: String(record.applicationId || ''),
    username: String(record.username || ''),
    avatarUrl: String(record.avatarUrl || ''),
    tokenHint: String(record.tokenHint || ''),
    presence: {
      status: String(record.presence?.status || 'online'),
      activityType: String(record.presence?.activityType || 'playing'),
      activityText: String(record.presence?.activityText || ''),
      activityUrl: String(record.presence?.activityUrl || '')
    },
    createdAt: record.createdAt || null,
    updatedAt: record.updatedAt || null
  };
}

function tokenHint(token) {
  const raw = String(token || '');
  if (!raw) return '';
  return `••••••••${raw.slice(-4)}`;
}

function getCustomBot(guildId, options = {}) {
  const record = readStore().guilds[guildId];
  if (!record) return null;
  const safe = safeRecord(guildId, record);
  if (options.withToken) safe.token = decryptSecret(record.token);
  return safe;
}

function listCustomBotGuildIds() {
  return Object.keys(readStore().guilds);
}

function saveCustomBot(guildId, input = {}) {
  const store = readStore();
  const current = store.guilds[guildId] || {};
  const now = new Date().toISOString();
  const next = {
    ...current,
    applicationId: input.applicationId ?? current.applicationId ?? '',
    username: input.username ?? current.username ?? '',
    avatarUrl: input.avatarUrl ?? current.avatarUrl ?? '',
    presence: {
      status: input.presence?.status ?? current.presence?.status ?? 'online',
      activityType: input.presence?.activityType ?? current.presence?.activityType ?? 'playing',
      activityText: input.presence?.activityText ?? current.presence?.activityText ?? '',
      activityUrl: input.presence?.activityUrl ?? current.presence?.activityUrl ?? ''
    },
    createdAt: current.createdAt || now,
    updatedAt: now
  };
  if (input.token) {
    next.token = encryptSecret(input.token);
    next.tokenHint = tokenHint(input.token);
  }
  store.guilds[guildId] = next;
  writeStore(store);
  return safeRecord(guildId, next);
}

function deleteCustomBot(guildId) {
  const store = readStore();
  if (!store.guilds[guildId]) return false;
  delete store.guilds[guildId];
  writeStore(store);
  return true;
}

module.exports = {
  encryptSecret,
  decryptSecret,
  getCustomBot,
  listCustomBotGuildIds,
  saveCustomBot,
  deleteCustomBot
};