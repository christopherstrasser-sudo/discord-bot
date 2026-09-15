const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, '..', 'data');
const configFile = path.join(dataDir, 'creator-config.json');
const stateFile = path.join(dataDir, 'creator-state.json');

const DEFAULT_CONFIG = Object.freeze({
  enabled: false,
  timezone: process.env.CREATOR_DEFAULT_TIMEZONE || 'Europe/Berlin',
  rules: []
});

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function ensureDir() {
  fs.mkdirSync(dataDir, { recursive: true });
}

function readJson(file, fallback) {
  ensureDir();
  if (!fs.existsSync(file)) {
    fs.writeFileSync(file, JSON.stringify(fallback, null, 2), 'utf8');
    return clone(fallback);
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!parsed || typeof parsed !== 'object') throw new Error('Invalid JSON root');
    return parsed;
  } catch (error) {
    const backup = `${file}.corrupt-${Date.now()}`;
    try { fs.copyFileSync(file, backup); } catch {}
    console.warn(`[CREATOR] Corrupt datastore backed up to ${backup}`);
    fs.writeFileSync(file, JSON.stringify(fallback, null, 2), 'utf8');
    return clone(fallback);
  }
}

function writeJson(file, value) {
  ensureDir();
  const temp = `${file}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(value, null, 2), 'utf8');
  fs.renameSync(temp, file);
}

function readConfigStore() {
  const store = readJson(configFile, { schemaVersion: 1, guilds: {} });
  store.guilds ||= {};
  return store;
}

function getCreatorConfig(guildId) {
  const store = readConfigStore();
  const saved = store.guilds[guildId] || {};
  return {
    enabled: Boolean(saved.enabled),
    timezone: String(saved.timezone || DEFAULT_CONFIG.timezone),
    rules: Array.isArray(saved.rules) ? clone(saved.rules) : []
  };
}

function setCreatorConfig(guildId, config, updatedBy = null) {
  const store = readConfigStore();
  store.guilds[guildId] = {
    enabled: Boolean(config?.enabled),
    timezone: String(config?.timezone || DEFAULT_CONFIG.timezone),
    rules: Array.isArray(config?.rules) ? clone(config.rules) : [],
    updatedAt: new Date().toISOString(),
    updatedBy
  };
  writeJson(configFile, store);
  return getCreatorConfig(guildId);
}

function listCreatorGuildIds() {
  return Object.keys(readConfigStore().guilds || {});
}

function readStateStore() {
  const store = readJson(stateFile, { schemaVersion: 1, guilds: {} });
  store.guilds ||= {};
  return store;
}

function ensureGuildState(store, guildId) {
  store.guilds[guildId] ||= { rules: {}, history: [] };
  store.guilds[guildId].rules ||= {};
  store.guilds[guildId].history ||= [];
  return store.guilds[guildId];
}

function getCreatorRuleState(guildId, ruleId) {
  const store = readStateStore();
  const state = store.guilds[guildId]?.rules?.[ruleId] || {};
  return clone(state);
}

function setCreatorRuleState(guildId, ruleId, patch) {
  const store = readStateStore();
  const guild = ensureGuildState(store, guildId);
  guild.rules[ruleId] = {
    ...(guild.rules[ruleId] || {}),
    ...clone(patch),
    updatedAt: new Date().toISOString()
  };
  writeJson(stateFile, store);
  return clone(guild.rules[ruleId]);
}

function appendCreatorHistory(guildId, item) {
  const store = readStateStore();
  const guild = ensureGuildState(store, guildId);
  guild.history.unshift({
    id: `H${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`,
    at: new Date().toISOString(),
    ...clone(item)
  });
  guild.history = guild.history.slice(0, 120);
  writeJson(stateFile, store);
  return clone(guild.history[0]);
}

function getCreatorHistory(guildId, limit = 40) {
  const store = readStateStore();
  const items = store.guilds[guildId]?.history || [];
  return clone(items.slice(0, Math.max(1, Math.min(Number(limit) || 40, 120))));
}

function pruneCreatorRuleState(guildId, validRuleIds) {
  const valid = new Set(validRuleIds || []);
  const store = readStateStore();
  const guild = ensureGuildState(store, guildId);
  let changed = false;
  for (const ruleId of Object.keys(guild.rules)) {
    if (!valid.has(ruleId)) {
      delete guild.rules[ruleId];
      changed = true;
    }
  }
  if (changed) writeJson(stateFile, store);
}

module.exports = {
  DEFAULT_CONFIG,
  getCreatorConfig,
  setCreatorConfig,
  listCreatorGuildIds,
  getCreatorRuleState,
  setCreatorRuleState,
  appendCreatorHistory,
  getCreatorHistory,
  pruneCreatorRuleState
};
