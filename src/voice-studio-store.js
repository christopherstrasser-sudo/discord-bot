const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DATA_FILE = path.join(DATA_DIR, 'voice-studio.json');

const DEFAULT_VOICE_CONFIG = Object.freeze({
  enabled: false,
  lobbyChannelId: '',
  categoryId: '',
  roomNameTemplate: '🎧 {displayName}',
  userLimit: 5,
  bitrateKbps: 0,
  cleanupDelaySeconds: 8,
  ownerControls: true,
  autoTransferOwner: true
});

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function freshStore() {
  return { schemaVersion: 1, guilds: {}, rooms: {}, sequences: {} };
}

function ensureStore() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(freshStore(), null, 2), 'utf8');
  }
}

function readStore() {
  ensureStore();
  try {
    const parsed = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    if (!parsed || typeof parsed !== 'object') throw new Error('Invalid Voice Studio datastore root');
    if (!parsed.guilds || typeof parsed.guilds !== 'object') parsed.guilds = {};
    if (!parsed.rooms || typeof parsed.rooms !== 'object') parsed.rooms = {};
    if (!parsed.sequences || typeof parsed.sequences !== 'object') parsed.sequences = {};
    return parsed;
  } catch (error) {
    const backup = `${DATA_FILE}.corrupt-${Date.now()}`;
    try { fs.copyFileSync(DATA_FILE, backup); } catch {}
    console.warn(`[VOICE] Invalid datastore was backed up to ${backup}`);
    const store = freshStore();
    fs.writeFileSync(DATA_FILE, JSON.stringify(store, null, 2), 'utf8');
    return store;
  }
}

function writeStore(store) {
  ensureStore();
  const temp = `${DATA_FILE}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(store, null, 2), 'utf8');
  fs.renameSync(temp, DATA_FILE);
}

function normalizeConfig(saved = {}) {
  return {
    ...clone(DEFAULT_VOICE_CONFIG),
    ...(saved && typeof saved === 'object' ? clone(saved) : {})
  };
}

function getVoiceConfig(guildId) {
  const store = readStore();
  return normalizeConfig(store.guilds[guildId]?.config);
}

function updateVoiceConfig(guildId, config, updatedBy = null) {
  const store = readStore();
  const next = normalizeConfig(config);
  store.guilds[guildId] = {
    ...(store.guilds[guildId] || {}),
    config: next,
    updatedAt: new Date().toISOString(),
    updatedBy: updatedBy || null
  };
  writeStore(store);
  return clone(next);
}

function listVoiceRooms(guildId) {
  const store = readStore();
  return Object.values(store.rooms)
    .filter(room => room?.guildId === guildId)
    .map(clone);
}

function getVoiceRoom(channelId) {
  const room = readStore().rooms[channelId];
  return room ? clone(room) : null;
}

function findVoiceRoomByOwner(guildId, ownerId) {
  return listVoiceRooms(guildId).find(room => room.ownerId === ownerId) || null;
}

function upsertVoiceRoom(room) {
  if (!room?.channelId || !room?.guildId || !room?.ownerId) {
    throw new Error('Voice room requires channelId, guildId and ownerId.');
  }
  const store = readStore();
  store.rooms[room.channelId] = {
    ...(store.rooms[room.channelId] || {}),
    ...clone(room),
    updatedAt: new Date().toISOString()
  };
  writeStore(store);
  return clone(store.rooms[room.channelId]);
}

function removeVoiceRoom(channelId) {
  const store = readStore();
  const existed = Boolean(store.rooms[channelId]);
  if (existed) {
    delete store.rooms[channelId];
    writeStore(store);
  }
  return existed;
}

function nextVoiceSequence(guildId) {
  const store = readStore();
  const current = Number(store.sequences[guildId] || 0);
  const next = Number.isSafeInteger(current) ? current + 1 : 1;
  store.sequences[guildId] = next > 9999 ? 1 : next;
  writeStore(store);
  return store.sequences[guildId];
}

module.exports = {
  DEFAULT_VOICE_CONFIG,
  getVoiceConfig,
  updateVoiceConfig,
  listVoiceRooms,
  getVoiceRoom,
  findVoiceRoomByOwner,
  upsertVoiceRoom,
  removeVoiceRoom,
  nextVoiceSequence
};
