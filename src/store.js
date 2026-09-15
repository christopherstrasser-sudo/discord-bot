const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, '..', 'data');
const dataFile = path.join(dataDir, 'guild-settings.json');

const DEFAULT_GUILD_SETTINGS = Object.freeze({
  welcome: {
    enabled: false,
    channelId: '',
    message: 'Hey {user}! 👋 Willkommen auf **{server}**!'
  },
  autorole: {
    enabled: false,
    roleId: ''
  },
  logging: {
    enabled: false,
    channelId: ''
  },
  customCommands: {
    enabled: false,
    commands: []
  }
});

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function ensureStore() {
  fs.mkdirSync(dataDir, { recursive: true });

  if (!fs.existsSync(dataFile)) {
    const initial = { schemaVersion: 1, guilds: {} };
    fs.writeFileSync(dataFile, JSON.stringify(initial, null, 2), 'utf8');
  }
}

function readStore() {
  ensureStore();

  try {
    const parsed = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
    if (!parsed || typeof parsed !== 'object') throw new Error('Invalid datastore root');
    if (!parsed.guilds || typeof parsed.guilds !== 'object') parsed.guilds = {};
    return parsed;
  } catch (error) {
    const backup = `${dataFile}.corrupt-${Date.now()}`;
    try {
      fs.copyFileSync(dataFile, backup);
    } catch {}

    console.warn(`[STORE] Invalid datastore was backed up to ${backup}`);
    const fresh = { schemaVersion: 1, guilds: {} };
    fs.writeFileSync(dataFile, JSON.stringify(fresh, null, 2), 'utf8');
    return fresh;
  }
}

function writeStore(store) {
  ensureStore();
  const tempFile = `${dataFile}.tmp`;
  fs.writeFileSync(tempFile, JSON.stringify(store, null, 2), 'utf8');
  fs.renameSync(tempFile, dataFile);
}

function mergeSettings(current, patch) {
  const next = clone(current);

  for (const moduleName of Object.keys(DEFAULT_GUILD_SETTINGS)) {
    if (!patch[moduleName] || typeof patch[moduleName] !== 'object') continue;
    next[moduleName] = {
      ...next[moduleName],
      ...patch[moduleName]
    };
  }

  return next;
}

function getGuildSettings(guildId) {
  const store = readStore();
  const saved = store.guilds[guildId]?.settings || {};
  return mergeSettings(clone(DEFAULT_GUILD_SETTINGS), saved);
}

function updateGuildSettings(guildId, patch, updatedBy) {
  const store = readStore();
  const current = getGuildSettings(guildId);
  const settings = mergeSettings(current, patch);

  store.guilds[guildId] = {
    ...(store.guilds[guildId] || {}),
    settings,
    updatedAt: new Date().toISOString(),
    updatedBy: updatedBy || null
  };

  writeStore(store);
  return settings;
}

module.exports = {
  DEFAULT_GUILD_SETTINGS,
  getGuildSettings,
  updateGuildSettings
};
