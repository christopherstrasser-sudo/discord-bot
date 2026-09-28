const fs = require('fs');
const path = require('path');
const { recordAnalyticsEvent } = require('./analytics-store');

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
  store.guilds[guildId] ||= { rules: {}, history: [], eventLedger: {} };
  store.guilds[guildId].rules ||= {};
  store.guilds[guildId].history ||= [];
  store.guilds[guildId].eventLedger ||= {};
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


function eventLedgerKey(eventKey, channelId) {
  return String(channelId || '') + '|' + String(eventKey || '');
}

function pruneEventLedger(guild) {
  const entries = Object.entries(guild.eventLedger || {});
  if (entries.length <= 500) return;
  entries.sort((a, b) => Date.parse(b[1]?.updatedAt || b[1]?.sentAt || 0) - Date.parse(a[1]?.updatedAt || a[1]?.sentAt || 0));
  guild.eventLedger = Object.fromEntries(entries.slice(0, 400));
}

function claimCreatorEvent(guildId, eventKey, channelId, ruleId) {
  if (!eventKey || !channelId) return true;
  const store = readStateStore();
  const guild = ensureGuildState(store, guildId);
  const key = eventLedgerKey(eventKey, channelId);
  const existing = guild.eventLedger[key] || null;
  const now = Date.now();

  if (existing?.status === 'sent') return false;
  if (existing?.status === 'pending') {
    const claimedAt = Date.parse(existing.claimedAt || 0);
    if (claimedAt && now - claimedAt < 2 * 60 * 1000) return false;
  }

  guild.eventLedger[key] = {
    eventKey: String(eventKey),
    channelId: String(channelId),
    ruleId: String(ruleId || ''),
    status: 'pending',
    claimedAt: new Date(now).toISOString(),
    updatedAt: new Date(now).toISOString()
  };
  pruneEventLedger(guild);
  writeJson(stateFile, store);
  return true;
}

function confirmCreatorEvent(guildId, eventKey, channelId, messageId, ruleId) {
  if (!eventKey || !channelId) return;
  const store = readStateStore();
  const guild = ensureGuildState(store, guildId);
  const key = eventLedgerKey(eventKey, channelId);
  const now = new Date().toISOString();
  guild.eventLedger[key] = {
    ...(guild.eventLedger[key] || {}),
    eventKey: String(eventKey),
    channelId: String(channelId),
    ruleId: String(ruleId || guild.eventLedger[key]?.ruleId || ''),
    messageId: String(messageId || ''),
    status: 'sent',
    sentAt: now,
    updatedAt: now
  };
  pruneEventLedger(guild);
  writeJson(stateFile, store);
}

function releaseCreatorEventClaim(guildId, eventKey, channelId) {
  if (!eventKey || !channelId) return;
  const store = readStateStore();
  const guild = ensureGuildState(store, guildId);
  const key = eventLedgerKey(eventKey, channelId);
  if (guild.eventLedger[key]?.status === 'pending') {
    delete guild.eventLedger[key];
    writeJson(stateFile, store);
  }
}

function recordCreatorEventSent(guildId, eventKey, channelId, messageId, ruleId) {
  confirmCreatorEvent(guildId, eventKey, channelId, messageId, ruleId);
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
  if (item?.status === 'sent') recordAnalyticsEvent(guildId, 'creator_event');
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
  pruneCreatorRuleState,
  claimCreatorEvent,
  confirmCreatorEvent,
  releaseCreatorEventClaim,
  recordCreatorEventSent
};
