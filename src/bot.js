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

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.MessageContent
  ],
  partials: [
    Partials.Message,
    Partials.Channel,
    Partials.Reaction,
    Partials.User
  ]
});

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
    await member.roles.add(role, 'RAKU Bot Auto-Role');
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

client.once(Events.ClientReady, readyClient => {
  console.log(`[BOT] Logged in as ${readyClient.user.tag}`);
  console.log(`[BOT] Connected to ${readyClient.guilds.cache.size} guild(s)`);
});

client.on(Events.GuildCreate, guild => {
  console.log(`[BOT] Added to guild: ${guild.name} (${guild.id})`);
});

client.on(Events.GuildDelete, guild => {
  console.log(`[BOT] Removed from guild: ${guild.name} (${guild.id})`);
});

client.on(Events.GuildMemberAdd, async member => {
  if (member.user.bot) return;

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

client.on(Events.GuildMemberRemove, member => logMemberLeave(member));
client.on(Events.GuildMemberUpdate, (oldMember, newMember) => logMemberUpdate(oldMember, newMember));
client.on(Events.MessageCreate, message => handleCustomCommand(message));
client.on(Events.MessageDelete, message => logMessageDelete(message));
client.on(Events.MessageUpdate, (oldMessage, newMessage) => logMessageUpdate(oldMessage, newMessage));
client.on(Events.GuildRoleCreate, role => logRoleCreate(role));
client.on(Events.GuildRoleDelete, role => logRoleDelete(role));
client.on(Events.GuildRoleUpdate, (oldRole, newRole) => logRoleUpdate(oldRole, newRole));
client.on(Events.ChannelCreate, channel => logChannelCreate(channel));
client.on(Events.ChannelDelete, channel => logChannelDelete(channel));
client.on(Events.ChannelUpdate, (oldChannel, newChannel) => logChannelUpdate(oldChannel, newChannel));
client.on(Events.GuildBanAdd, ban => logBanAdd(ban));
client.on(Events.GuildBanRemove, ban => logBanRemove(ban));
client.on(Events.InteractionCreate, interaction => handleRoleInteraction(interaction));
client.on(Events.MessageReactionAdd, (reaction, user) => handleRoleReaction(reaction, user, true));
client.on(Events.MessageReactionRemove, (reaction, user) => handleRoleReaction(reaction, user, false));

async function startBot() {
  await client.login(config.discord.botToken);
  return client;
}

module.exports = {
  client,
  startBot,
  renderWelcomeMessage
};
