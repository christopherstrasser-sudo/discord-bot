const {
  ActivityType,
  PermissionFlagsBits,
  PermissionsBitField
} = require('discord.js');
const {
  getCustomBot,
  listCustomBotGuildIds
} = require('./custom-bot-store');
const {
  createOrbitClient,
  attachCoreBotRuntime
} = require('./bot');
const { attachTicketRuntime } = require('./ticket-studio-runtime');
const { attachVoiceStudioRuntime } = require('./voice-studio-runtime');
const { attachAnalyticsRuntime } = require('./analytics-runtime');
const {
  registerCustomClient,
  unregisterCustomClient,
  setCustomModeActive,
  isCustomModeActive
} = require('./guild-client-router');

const clients = new Map();
const runtime = new Map();

const ACTIVITY_TYPES = {
  playing: ActivityType.Playing,
  streaming: ActivityType.Streaming,
  listening: ActivityType.Listening,
  watching: ActivityType.Watching,
  competing: ActivityType.Competing
};

function normalizeStreamingUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const parsed = new URL(raw);
    const host = parsed.hostname.toLowerCase();
    const supportedHost = host === 'twitch.tv' || host.endsWith('.twitch.tv') ||
      host === 'youtube.com' || host.endsWith('.youtube.com');
    if (parsed.protocol !== 'https:' || !supportedHost) return '';
    return parsed.toString().slice(0, 300);
  } catch {
    return '';
  }
}

function normalizePresence(input = {}) {
  const statuses = new Set(['online', 'idle', 'dnd', 'invisible']);
  const activityTypes = new Set(Object.keys(ACTIVITY_TYPES));
  const status = statuses.has(String(input.status || '').toLowerCase()) ? String(input.status).toLowerCase() : 'online';
  const activityType = activityTypes.has(String(input.activityType || '').toLowerCase()) ? String(input.activityType).toLowerCase() : 'playing';
  const activityText = String(input.activityText || '').trim().slice(0, 128);
  const activityUrl = normalizeStreamingUrl(input.activityUrl);
  return { status, activityType, activityText, activityUrl };
}

function activityDisplayText(presenceInput = {}) {
  return normalizePresence(presenceInput).activityText;
}

function buildActivity(presenceInput = {}) {
  const presence = normalizePresence(presenceInput);
  if (!presence.activityText) return null;
  return {
    name: activityDisplayText(presence),
    state: presence.activityText,
    type: ACTIVITY_TYPES[presence.activityType],
    ...(presence.activityType === 'streaming' && presence.activityUrl ? { url: presence.activityUrl } : {})
  };
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
    active: isCustomModeActive(guildId),
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
  const activity = buildActivity(presence);
  client.user.setPresence({ status: presence.status, activities: activity ? [activity] : [] });
  return presence;
}

function attachReplacementRuntimes(guildId, client) {
  attachCoreBotRuntime(client, { label: `CUSTOM BOT ${guildId}` });
  attachTicketRuntime(client);
  attachVoiceStudioRuntime(client);
  attachAnalyticsRuntime(client);
}

async function disconnectCustomBot(guildId) {
  const client = clients.get(guildId);
  clients.delete(guildId);
  unregisterCustomClient(guildId, client);
  if (client) {
    try { client.destroy(); } catch {}
  }
  setRuntime(guildId, { starting: false, lastConnectedAt: null });
}

async function connectCustomBot(guildId, token, presenceInput = {}) {
  const rawToken = String(token || '').trim();
  if (!rawToken) throw new Error('Bot-Token fehlt.');
  if (clients.has(guildId)) await disconnectCustomBot(guildId);

  const client = createOrbitClient();
  clients.set(guildId, client);
  registerCustomClient(guildId, client);
  setCustomModeActive(guildId, Boolean(getCustomBot(guildId)?.active));
  attachReplacementRuntimes(guildId, client);
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
    unregisterCustomClient(guildId, client);
    try { client.destroy(); } catch {}
    setRuntime(guildId, { starting: false, lastError: String(error?.message || error) });
    const message = String(error?.message || error);
    const hint = /disallowed intent/i.test(message)
      ? ' Aktiviere im Discord Developer Portal unter Bot die Server Members- und Message Content-Intents.'
      : '';
    const wrapped = new Error(`Custom Bot konnte nicht verbunden werden: ${message}${hint}`);
    wrapped.cause = error;
    throw wrapped;
  }
}

async function reconnectStoredCustomBot(guildId) {
  const stored = getCustomBot(guildId, { withToken: true });
  if (!stored?.token) throw new Error('Für diesen Server ist kein Custom Bot gespeichert.');
  setCustomModeActive(guildId, Boolean(stored.active));
  return connectCustomBot(guildId, stored.token, stored.presence);
}

async function startStoredCustomBots() {
  const guildIds = listCustomBotGuildIds();
  if (!guildIds.length) return [];
  console.log(`[CUSTOM BOT] Restoring ${guildIds.length} replacement bot connection(s)`);

  const results = await Promise.allSettled(guildIds.map(async guildId => {
    try {
      const state = await reconnectStoredCustomBot(guildId);
      console.log(`[CUSTOM BOT] ${state.username || state.applicationId} ready for guild ${guildId}${state.active ? ' · ACTIVE' : ' · standby'}`);
      return { guildId, ok: true, state };
    } catch (error) {
      console.warn(`[CUSTOM BOT] Could not restore guild ${guildId}: ${error.message}`);
      return { guildId, ok: false, error: error.message };
    }
  }));

  return results.map(result => result.status === 'fulfilled' ? result.value : ({ ok: false, error: String(result.reason?.message || result.reason) }));
}

function getCustomBotClient(guildId) {
  const client = clients.get(guildId);
  return client?.isReady() ? client : null;
}

module.exports = {
  normalizePresence,
  normalizeStreamingUrl,
  activityDisplayText,
  buildActivity,
  inviteUrl,
  snapshot,
  applyPresence,
  connectCustomBot,
  disconnectCustomBot,
  reconnectStoredCustomBot,
  startStoredCustomBots,
  getCustomBotClient
};
