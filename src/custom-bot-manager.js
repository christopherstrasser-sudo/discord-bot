const {
  ActivityType,
  Client,
  GatewayIntentBits,
  PermissionFlagsBits,
  PermissionsBitField
} = require('discord.js');
const {
  getCustomBot,
  listCustomBotGuildIds
} = require('./custom-bot-store');

const clients = new Map();
const runtime = new Map();

const ACTIVITY_TYPES = {
  playing: ActivityType.Playing,
  streaming: ActivityType.Streaming,
  listening: ActivityType.Listening,
  watching: ActivityType.Watching,
  competing: ActivityType.Competing
};

function normalizePresence(input = {}) {
  const statuses = new Set(['online', 'idle', 'dnd', 'invisible']);
  const activityTypes = new Set(Object.keys(ACTIVITY_TYPES));
  const status = statuses.has(String(input.status || '').toLowerCase()) ? String(input.status).toLowerCase() : 'online';
  const activityType = activityTypes.has(String(input.activityType || '').toLowerCase()) ? String(input.activityType).toLowerCase() : 'playing';
  const activityText = String(input.activityText || '').trim().slice(0, 128);
  const activityUrl = /^https?:\/\//i.test(String(input.activityUrl || '').trim()) ? String(input.activityUrl).trim().slice(0, 300) : '';
  return { status, activityType, activityText, activityUrl };
}

function recommendedPermissions() {
  return new PermissionsBitField([
    PermissionFlagsBits.ViewAuditLog,
    PermissionFlagsBits.KickMembers,
    PermissionFlagsBits.BanMembers,
    PermissionFlagsBits.ManageChannels,
    PermissionFlagsBits.ManageGuild,
    PermissionFlagsBits.AddReactions,
    PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.SendMessages,
    PermissionFlagsBits.ManageMessages,
    PermissionFlagsBits.EmbedLinks,
    PermissionFlagsBits.ReadMessageHistory,
    PermissionFlagsBits.Connect,
    PermissionFlagsBits.Speak,
    PermissionFlagsBits.MoveMembers,
    PermissionFlagsBits.ManageRoles,
    PermissionFlagsBits.ManageWebhooks,
    PermissionFlagsBits.ModerateMembers
  ]).bitfield.toString();
}

function inviteUrl(applicationId, guildId = '') {
  if (!applicationId) return '';
  const query = new URLSearchParams({
    client_id: String(applicationId),
    scope: 'bot applications.commands',
    permissions: recommendedPermissions()
  });
  if (guildId) {
    query.set('guild_id', String(guildId));
    query.set('disable_guild_select', 'true');
  }
  return `https://discord.com/oauth2/authorize?${query}`;
}

function snapshot(guildId) {
  const state = runtime.get(guildId) || {};
  const client = clients.get(guildId);
  const applicationId = client?.user?.id || state.applicationId || '';
  return {
    connected: Boolean(client?.isReady()),
    inTargetGuild: Boolean(client?.isReady() && client.guilds.cache.has(guildId)),
    applicationId,
    username: client?.user?.username || state.username || '',
    avatarUrl: client?.user?.displayAvatarURL?.({ size: 128 }) || state.avatarUrl || '',
    inviteUrl: inviteUrl(applicationId, guildId),
    lastConnectedAt: state.lastConnectedAt || null,
    lastError: state.lastError || '',
    starting: Boolean(state.starting)
  };
}

function setRuntime(guildId, patch) {
  runtime.set(guildId, { ...(runtime.get(guildId) || {}), ...patch });
}

function applyPresence(guildId, presenceInput = {}) {
  const client = clients.get(guildId);
  if (!client?.isReady()) throw new Error('Custom Bot ist nicht verbunden.');
  const presence = normalizePresence(presenceInput);
  const activities = presence.activityText ? [{
    name: presence.activityText,
    type: ACTIVITY_TYPES[presence.activityType],
    ...(presence.activityType === 'streaming' && presence.activityUrl ? { url: presence.activityUrl } : {})
  }] : [];
  client.user.setPresence({ status: presence.status, activities });
  return presence;
}

async function disconnectCustomBot(guildId) {
  const client = clients.get(guildId);
  clients.delete(guildId);
  if (client) {
    try { client.destroy(); } catch {}
  }
  setRuntime(guildId, { starting: false, lastConnectedAt: null });
}

async function connectCustomBot(guildId, token, presenceInput = {}) {
  const rawToken = String(token || '').trim();
  if (!rawToken) throw new Error('Bot-Token fehlt.');
  if (clients.has(guildId)) await disconnectCustomBot(guildId);

  const client = new Client({ intents: [GatewayIntentBits.Guilds] });
  clients.set(guildId, client);
  setRuntime(guildId, { starting: true, lastError: '' });

  client.on('guildCreate', guild => {
    if (guild.id === guildId) setRuntime(guildId, { lastError: '' });
  });
  client.on('error', error => setRuntime(guildId, { lastError: String(error?.message || error) }));
  client.on('shardError', error => setRuntime(guildId, { lastError: String(error?.message || error) }));

  try {
    await client.login(rawToken);
    if (!client.isReady()) {
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Discord-Verbindung hat zu lange gebraucht.')), 15000);
        client.once('ready', () => { clearTimeout(timer); resolve(); });
      });
    }
    const presence = applyPresence(guildId, presenceInput);
    setRuntime(guildId, {
      starting: false,
      applicationId: client.user.id,
      username: client.user.username,
      avatarUrl: client.user.displayAvatarURL?.({ size: 128 }) || '',
      lastConnectedAt: new Date().toISOString(),
      lastError: ''
    });
    return { ...snapshot(guildId), presence };
  } catch (error) {
    clients.delete(guildId);
    try { client.destroy(); } catch {}
    setRuntime(guildId, { starting: false, lastError: String(error?.message || error) });
    const wrapped = new Error(`Custom Bot konnte nicht verbunden werden: ${error?.message || error}`);
    wrapped.cause = error;
    throw wrapped;
  }
}

async function reconnectStoredCustomBot(guildId) {
  const stored = getCustomBot(guildId, { withToken: true });
  if (!stored?.token) throw new Error('Für diesen Server ist kein Custom Bot gespeichert.');
  return connectCustomBot(guildId, stored.token, stored.presence);
}

async function startStoredCustomBots() {
  const guildIds = listCustomBotGuildIds();
  if (!guildIds.length) return;
  console.log(`[CUSTOM BOT] Restoring ${guildIds.length} custom bot connection(s)`);
  for (const guildId of guildIds) {
    reconnectStoredCustomBot(guildId)
      .then(state => console.log(`[CUSTOM BOT] ${state.username || state.applicationId} ready for guild ${guildId}`))
      .catch(error => console.warn(`[CUSTOM BOT] Could not restore guild ${guildId}: ${error.message}`));
  }
}

function getCustomBotClient(guildId) {
  const client = clients.get(guildId);
  return client?.isReady() ? client : null;
}

module.exports = {
  normalizePresence,
  inviteUrl,
  snapshot,
  applyPresence,
  connectCustomBot,
  disconnectCustomBot,
  reconnectStoredCustomBot,
  startStoredCustomBots,
  getCustomBotClient
};