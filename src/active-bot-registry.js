const { getCustomBot } = require('./custom-bot-store');

let sharedClient = null;
const customClients = new Map();

function setSharedClient(client) {
  sharedClient = client || null;
}

function setCustomClient(guildId, client) {
  if (!guildId) return;
  if (client) customClients.set(String(guildId), client);
  else customClients.delete(String(guildId));
}

function removeCustomClient(guildId) {
  customClients.delete(String(guildId));
}

function isCustomMode(guildId) {
  try {
    return getCustomBot(String(guildId))?.mode === 'custom';
  } catch {
    return false;
  }
}

function getCustomClient(guildId) {
  return customClients.get(String(guildId)) || null;
}

function getActiveClient(guildId) {
  const id = String(guildId || '');
  if (!id) return null;
  if (isCustomMode(id)) {
    const custom = customClients.get(id);
    return custom?.isReady?.() ? custom : null;
  }
  return sharedClient?.isReady?.() ? sharedClient : sharedClient;
}

function getActiveGuild(guildId) {
  const id = String(guildId || '');
  const client = getActiveClient(id);
  return client?.guilds?.cache?.get(id) || null;
}

function sharedShouldHandleGuild(guildId) {
  return !isCustomMode(guildId);
}

function customShouldHandleGuild(boundGuildId, eventGuildId) {
  const bound = String(boundGuildId || '');
  const eventId = String(eventGuildId || '');
  return Boolean(bound && eventId && bound === eventId && isCustomMode(bound));
}

function activeGuildIds() {
  const ids = new Set();
  if (sharedClient?.guilds?.cache) {
    for (const id of sharedClient.guilds.cache.keys()) {
      if (!isCustomMode(id)) ids.add(String(id));
    }
  }
  for (const [id, client] of customClients) {
    if (isCustomMode(id) && client?.guilds?.cache?.has(id)) ids.add(String(id));
  }
  return [...ids];
}

module.exports = {
  setSharedClient,
  setCustomClient,
  removeCustomClient,
  isCustomMode,
  getCustomClient,
  getActiveClient,
  getActiveGuild,
  sharedShouldHandleGuild,
  customShouldHandleGuild,
  activeGuildIds
};
