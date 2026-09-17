const { getCustomBot, listActiveCustomBotGuildIds } = require('./custom-bot-store');

let sharedClient = null;
const customClients = new Map();
const activeCustomGuilds = new Set(listActiveCustomBotGuildIds());

function setSharedClient(client) {
  sharedClient = client || null;
  return sharedClient;
}

function registerCustomClient(guildId, client) {
  const id = String(guildId || '');
  if (!id || !client) return;
  customClients.set(id, client);
}

function unregisterCustomClient(guildId, client = null) {
  const id = String(guildId || '');
  const current = customClients.get(id);
  if (!current) return;
  if (client && current !== client) return;
  customClients.delete(id);
}

function setCustomModeActive(guildId, active) {
  const id = String(guildId || '');
  if (!id) return false;
  if (active) activeCustomGuilds.add(id);
  else activeCustomGuilds.delete(id);
  return activeCustomGuilds.has(id);
}

function isCustomModeActive(guildId) {
  return activeCustomGuilds.has(String(guildId || ''));
}

function customClientFor(guildId) {
  return customClients.get(String(guildId || '')) || null;
}

function sharedGuild(guildId) {
  const id = String(guildId || '');
  if (!id || !sharedClient?.guilds?.cache) return null;
  return sharedClient.guilds.cache.get(id) || null;
}

function customGuild(guildId) {
  const id = String(guildId || '');
  const client = customClientFor(id);
  if (!client?.isReady?.()) return null;
  return client.guilds.cache.get(id) || null;
}

function getActiveClient(guildId) {
  const id = String(guildId || '');
  if (!id) return null;
  if (isCustomModeActive(id)) {
    const custom = customClientFor(id);
    return custom?.isReady?.() && custom.guilds.cache.has(id) ? custom : null;
  }
  return sharedClient?.isReady?.() && sharedClient.guilds.cache.has(id) ? sharedClient : null;
}

function getActiveGuild(guildId) {
  const client = getActiveClient(guildId);
  return client?.guilds?.cache?.get(String(guildId || '')) || null;
}

function shouldHandleGuildEvent(client, guildId) {
  const id = String(guildId || '');
  if (!client || !id) return false;
  if (isCustomModeActive(id)) return customClientFor(id) === client;
  return sharedClient === client;
}

function configuredCustomBot(guildId) {
  try { return getCustomBot(String(guildId || '')); } catch { return null; }
}

function botModeStatus(guildId) {
  const id = String(guildId || '');
  const configured = configuredCustomBot(id);
  const custom = customClientFor(id);
  const customConnected = Boolean(custom?.isReady?.() && custom.guilds.cache.has(id));
  const standardConnected = Boolean(sharedClient?.isReady?.() && sharedClient.guilds.cache.has(id));
  const customActive = isCustomModeActive(id);
  return {
    guildId: id,
    mode: customActive ? 'custom' : 'standard',
    customConfigured: Boolean(configured?.configured),
    customActive,
    customConnected,
    standardConnected,
    activeConnected: customActive ? customConnected : standardConnected,
    applicationId: configured?.applicationId || '',
    username: configured?.username || ''
  };
}

function getSharedClient() {
  return sharedClient;
}

function getSharedGuild(guildId) {
  return sharedGuild(guildId);
}

function getCustomGuild(guildId) {
  return customGuild(guildId);
}

module.exports = {
  setSharedClient,
  registerCustomClient,
  unregisterCustomClient,
  setCustomModeActive,
  isCustomModeActive,
  customClientFor,
  getActiveClient,
  getActiveGuild,
  shouldHandleGuildEvent,
  botModeStatus,
  getSharedClient,
  getSharedGuild,
  getCustomGuild
};