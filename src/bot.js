const {
  Client,
  Events,
  GatewayIntentBits,
  Partials,
  PermissionFlagsBits
} = require('discord.js');
const config = require('./config');
const { getGuildSettings } = require('./store');
const { handleCustomCommand } = require('./custom-commands');
const { handleRoleInteraction, handleRoleReaction } = require('./role-studio');
const {
  logMemberJoin,
  logMemberLeave,
  logMemberUpdate,
  logMessageDelete,
  logMessageUpdate,
  logRoleCreate,
  logRoleDelete,
  logRoleUpdate,
  logChannelCreate,
  logChannelDelete,
  logChannelUpdate,
  logBanAdd,
  logBanRemove
} = require('./logger');
const {
  setSharedClient,
  getActiveGuild,
  shouldHandleGuildEvent
} = require('./guild-client-router');

const BOT_INTENTS = Object.freeze([
  GatewayIntentBits.Guilds,
  GatewayIntentBits.GuildMembers,
  GatewayIntentBits.GuildMessages,
  GatewayIntentBits.GuildMessageReactions,
  GatewayIntentBits.GuildModeration,
  GatewayIntentBits.GuildVoiceStates,
  GatewayIntentBits.MessageContent
]);

const BOT_PARTIALS = Object.freeze([
  Partials.Message,
  Partials.Channel,
  Partials.Reaction,
  Partials.User
]);

const attachedClients = new WeakSet();

function createOrbitClient() {
  return new Client({
    intents: [...BOT_INTENTS],
    partials: [...BOT_PARTIALS]
  });
}

const sharedClient = createOrbitClient();
setSharedClient(sharedClient);

function createRoutedClient(shared) {
  const cacheProxy = new Proxy(shared.guilds.cache, {
    get(target, property) {
      if (property === 'get') return guildId => getActiveGuild(guildId);
      if (property === 'has') return guildId => Boolean(getActiveGuild(guildId));
      const value = Reflect.get(target, property, target);
      return typeof value === 'function' ? value.bind(target) : value;
    }
  });

  const guildsProxy = new Proxy(shared.guilds, {
    get(target, property) {
      if (property === 'cache') return cacheProxy;
      const value = Reflect.get(target, property, target);
      return typeof value === 'function' ? value.bind(target) : value;
    }
  });

  return new Proxy(shared, {
    get(target, property) {
      if (property === 'guilds') return guildsProxy;
      const value = Reflect.get(target, property, target);
      return typeof value === 'function' ? value.bind(target) : value;
    }
  });
}

// Dashboard/API compatibility: existing modules can keep using `client.guilds.cache.get(id)`.
// The guild lookup is routed to the bot identity that is active for that server.
const client = createRoutedClient(sharedClient);

function renderWelcomeMessage(template, member) {
  return String(template || '')
    .replaceAll('{user}', `<@${member.id}>`)
    .replaceAll('{username}', member.user.username)
    .replaceAll('{displayName}', member.displayName)
    .replaceAll('{server}', member.guild.name)
    .replaceAll('{memberCount}', String(member.guild.memberCount));
}

async function applyAutoRole(member, settings) {
  if (!settings.autorole?.enabled || !settings.autorole.roleId) return;
  if (member.user.bot) return;

  const guild = member.guild;
  const me = guild.members.me || await guild.members.fetchMe().catch(() => null);
  if (!me) {
    console.warn(`[AUTOROLE] Bot member missing in ${guild.name} (${guild.id})`);
    return;
  }

  if (!me.permissions.has(PermissionFlagsBits.ManageRoles)) {
    console.warn(`[AUTOROLE] Missing Manage Roles in ${guild.name} (${guild.id})`);
    return;
  }

  const role = guild.roles.cache.get(settings.autorole.roleId) ||
    await guild.roles.fetch(settings.autorole.roleId).catch(() => null);

  if (!role) {
    console.warn(`[AUTOROLE] Configured role no longer exists in ${guild.name} (${guild.id})`);
    return;
  }

  if (role.managed || role.id === guild.id || role.position >= me.roles.highest.position) {
    console.warn(`[AUTOROLE] Role ${role.name} is not manageable in ${guild.name} (${guild.id})`);
    return;
  }

  if (member.roles.cache.has(role.id)) return;

  try {
    await member.roles.add(role, 'ORBIT Auto-Role');
    console.log(`[AUTOROLE] Added ${role.name} to ${member.user.tag} in ${guild.name}`);
  } catch (error) {
    console.warn(`[AUTOROLE] Could not assign role in ${guild.name}: ${error.message}`);
  }
}

async function sendWelcome(member, settings) {
  if (!settings.welcome?.enabled || !settings.welcome.channelId) return;
  if (member.user.bot) return;

  const guild = member.guild;
  const channel = guild.channels.cache.get(settings.welcome.channelId) ||
    await guild.channels.fetch(settings.welcome.channelId).catch(() => null);

  if (!channel || typeof channel.send !== 'function') {
    console.warn(`[WELCOME] Configured channel no longer exists or is not writable in ${guild.name} (${guild.id})`);
    return;
  }

  const me = guild.members.me || await guild.members.fetchMe().catch(() => null);
  const permissions = me ? channel.permissionsFor(me) : null;

  if (!permissions?.has(PermissionFlagsBits.ViewChannel) || !permissions?.has(PermissionFlagsBits.SendMessages)) {
    console.warn(`[WELCOME] Missing channel permissions in #${channel.name} on ${guild.name}`);
    return;
  }

  const content = renderWelcomeMessage(settings.welcome.message, member).trim();
  if (!content) return;

  try {
    await channel.send({
      content: content.slice(0, 2000),
      allowedMentions: {
        parse: [],
        users: [member.id]
      }
    });
    console.log(`[WELCOME] Welcomed ${member.user.tag} in ${guild.name}`);
  } catch (error) {
    console.warn(`[WELCOME] Could not send welcome in ${guild.name}: ${error.message}`);
  }
}

function handles(targetClient, guildId) {
  return shouldHandleGuildEvent(targetClient, guildId);
}

function attachCoreBotRuntime(targetClient, options = {}) {
  if (!targetClient || attachedClients.has(targetClient)) return targetClient;
  attachedClients.add(targetClient);
  const label = options.label || 'BOT';

  targetClient.once(Events.ClientReady, readyClient => {
    console.log(`[${label}] Logged in as ${readyClient.user.tag}`);
    console.log(`[${label}] Connected to ${readyClient.guilds.cache.size} guild(s)`);
  });

  targetClient.on(Events.GuildCreate, guild => {
    console.log(`[${label}] Added to guild: ${guild.name} (${guild.id})`);
  });

  targetClient.on(Events.GuildDelete, guild => {
    console.log(`[${label}] Removed from guild: ${guild.name} (${guild.id})`);
  });

  targetClient.on(Events.GuildMemberAdd, async member => {
    if (!handles(targetClient, member.guild.id) || member.user.bot) return;

    let settings;
    try {
      settings = getGuildSettings(member.guild.id);
    } catch (error) {
      console.warn(`[MEMBER JOIN] Could not load settings for ${member.guild.name}: ${error.message}`);
      return;
    }

    await applyAutoRole(member, settings);
    await sendWelcome(member, settings);
    await logMemberJoin(member);
  });

  targetClient.on(Events.GuildMemberRemove, member => {
    if (handles(targetClient, member.guild.id)) return logMemberLeave(member);
  });
  targetClient.on(Events.GuildMemberUpdate, (oldMember, newMember) => {
    if (handles(targetClient, newMember.guild.id)) return logMemberUpdate(oldMember, newMember);
  });
  targetClient.on(Events.MessageCreate, message => {
    if (message.guild && handles(targetClient, message.guild.id)) return handleCustomCommand(message);
  });
  targetClient.on(Events.MessageDelete, message => {
    if (message.guild && handles(targetClient, message.guild.id)) return logMessageDelete(message);
  });
  targetClient.on(Events.MessageUpdate, (oldMessage, newMessage) => {
    const guildId = newMessage?.guild?.id || oldMessage?.guild?.id;
    if (guildId && handles(targetClient, guildId)) return logMessageUpdate(oldMessage, newMessage);
  });
  targetClient.on(Events.GuildRoleCreate, role => {
    if (handles(targetClient, role.guild.id)) return logRoleCreate(role);
  });
  targetClient.on(Events.GuildRoleDelete, role => {
    if (handles(targetClient, role.guild.id)) return logRoleDelete(role);
  });
  targetClient.on(Events.GuildRoleUpdate, (oldRole, newRole) => {
    if (handles(targetClient, newRole.guild.id)) return logRoleUpdate(oldRole, newRole);
  });
  targetClient.on(Events.ChannelCreate, channel => {
    if (channel.guild && handles(targetClient, channel.guild.id)) return logChannelCreate(channel);
  });
  targetClient.on(Events.ChannelDelete, channel => {
    if (channel.guild && handles(targetClient, channel.guild.id)) return logChannelDelete(channel);
  });
  targetClient.on(Events.ChannelUpdate, (oldChannel, newChannel) => {
    const guildId = newChannel?.guild?.id || oldChannel?.guild?.id;
    if (guildId && handles(targetClient, guildId)) return logChannelUpdate(oldChannel, newChannel);
  });
  targetClient.on(Events.GuildBanAdd, ban => {
    if (handles(targetClient, ban.guild.id)) return logBanAdd(ban);
  });
  targetClient.on(Events.GuildBanRemove, ban => {
    if (handles(targetClient, ban.guild.id)) return logBanRemove(ban);
  });
  targetClient.on(Events.InteractionCreate, interaction => {
    if (interaction.guild && handles(targetClient, interaction.guild.id)) return handleRoleInteraction(interaction);
  });
  targetClient.on(Events.MessageReactionAdd, (reaction, user) => {
    const guildId = reaction.message?.guild?.id;
    if (guildId && handles(targetClient, guildId)) return handleRoleReaction(reaction, user, true);
  });
  targetClient.on(Events.MessageReactionRemove, (reaction, user) => {
    const guildId = reaction.message?.guild?.id;
    if (guildId && handles(targetClient, guildId)) return handleRoleReaction(reaction, user, false);
  });

  return targetClient;
}

attachCoreBotRuntime(sharedClient, { label: 'BOT' });

async function startBot() {
  await sharedClient.login(config.discord.botToken);
  return sharedClient;
}

module.exports = {
  client,
  sharedClient,
  BOT_INTENTS,
  BOT_PARTIALS,
  createOrbitClient,
  attachCoreBotRuntime,
  startBot,
  renderWelcomeMessage
};