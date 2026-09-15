const {
  ChannelType,
  EmbedBuilder,
  PermissionFlagsBits
} = require('discord.js');
const { getGuildSettings } = require('./store');

const COLORS = {
  join: 0x23a559,
  leave: 0xf0b232,
  delete: 0xed4245,
  edit: 0x5865f2,
  create: 0x23a559,
  update: 0x5865f2,
  remove: 0xed4245
};

function truncate(value, max = 1024) {
  const text = String(value ?? '').trim();
  if (!text) return '—';
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 1))}…`;
}

function yesNo(value) {
  return value ? 'Ja' : 'Nein';
}

function channelLabel(channel) {
  if (!channel) return 'Unbekannt';
  return channel.name ? `#${channel.name}` : String(channel.id || 'Unbekannt');
}

function userLabel(user) {
  if (!user) return 'Unbekannt';
  return `${user.tag || user.username || 'Unbekannt'} (${user.id || 'keine ID'})`;
}

function roleColor(role) {
  return role?.hexColor && role.hexColor !== '#000000' ? role.hexColor : 'Standard';
}

function channelTypeLabel(type) {
  const names = {
    [ChannelType.GuildText]: 'Textkanal',
    [ChannelType.GuildVoice]: 'Sprachkanal',
    [ChannelType.GuildCategory]: 'Kategorie',
    [ChannelType.GuildAnnouncement]: 'Ankündigungskanal',
    [ChannelType.GuildStageVoice]: 'Stage-Kanal',
    [ChannelType.GuildForum]: 'Forum',
    [ChannelType.GuildMedia]: 'Medienkanal'
  };
  return names[type] || `Typ ${type}`;
}

async function resolveLogTarget(guild) {
  let settings;
  try {
    settings = getGuildSettings(guild.id);
  } catch (error) {
    console.warn(`[LOGS] Could not load settings for ${guild.name}: ${error.message}`);
    return null;
  }

  if (!settings.logging?.enabled || !settings.logging.channelId) return null;

  const channel = guild.channels.cache.get(settings.logging.channelId) ||
    await guild.channels.fetch(settings.logging.channelId).catch(() => null);

  if (!channel || typeof channel.send !== 'function') {
    console.warn(`[LOGS] Configured log channel is missing in ${guild.name} (${guild.id})`);
    return null;
  }

  const me = guild.members.me || await guild.members.fetchMe().catch(() => null);
  const permissions = me ? channel.permissionsFor(me) : null;

  if (!permissions?.has(PermissionFlagsBits.ViewChannel) || !permissions?.has(PermissionFlagsBits.SendMessages)) {
    console.warn(`[LOGS] Missing write permissions in ${channelLabel(channel)} on ${guild.name}`);
    return null;
  }

  return {
    channel,
    canEmbed: permissions.has(PermissionFlagsBits.EmbedLinks)
  };
}

function embedToFallback(embed) {
  const data = embed.toJSON();
  const lines = [`**${data.title || 'Server-Log'}**`];
  if (data.description) lines.push(data.description);
  for (const field of data.fields || []) {
    lines.push(`**${field.name}:** ${field.value}`);
  }
  return truncate(lines.join('\n'), 1900);
}

async function sendGuildLog(guild, embed) {
  const target = await resolveLogTarget(guild);
  if (!target) return false;

  try {
    if (target.canEmbed) {
      await target.channel.send({ embeds: [embed], allowedMentions: { parse: [] } });
    } else {
      await target.channel.send({ content: embedToFallback(embed), allowedMentions: { parse: [] } });
    }
    return true;
  } catch (error) {
    console.warn(`[LOGS] Could not send log in ${guild.name}: ${error.message}`);
    return false;
  }
}

function baseEmbed(title, color) {
  return new EmbedBuilder()
    .setTitle(title)
    .setColor(color)
    .setTimestamp()
    .setFooter({ text: 'RAKU Server Logs' });
}

async function logMemberJoin(member) {
  if (!member?.guild || member.user?.bot) return;

  const created = member.user.createdTimestamp
    ? `<t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`
    : 'Unbekannt';

  const embed = baseEmbed('Mitglied beigetreten', COLORS.join)
    .setDescription(`**${truncate(member.user.tag || member.user.username, 200)}** ist dem Server beigetreten.`)
    .addFields(
      { name: 'Nutzer', value: userLabel(member.user), inline: false },
      { name: 'Account erstellt', value: created, inline: true },
      { name: 'Mitglieder', value: String(member.guild.memberCount), inline: true }
    );

  if (member.user.displayAvatarURL) {
    embed.setThumbnail(member.user.displayAvatarURL({ size: 128 }));
  }

  await sendGuildLog(member.guild, embed);
}

async function logMemberLeave(member) {
  if (!member?.guild || member.user?.bot) return;

  const joined = member.joinedTimestamp
    ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>`
    : 'Unbekannt';

  const roles = member.roles?.cache
    ?.filter(role => role.id !== member.guild.id)
    .sort((a, b) => b.position - a.position)
    .map(role => role.name)
    .slice(0, 12)
    .join(', ') || 'Keine / unbekannt';

  const embed = baseEmbed('Mitglied verlassen', COLORS.leave)
    .setDescription(`**${truncate(member.user.tag || member.user.username, 200)}** hat den Server verlassen.`)
    .addFields(
      { name: 'Nutzer', value: userLabel(member.user), inline: false },
      { name: 'Beigetreten', value: joined, inline: true },
      { name: 'Mitglieder', value: String(member.guild.memberCount), inline: true },
      { name: 'Rollen', value: truncate(roles), inline: false }
    );

  if (member.user.displayAvatarURL) {
    embed.setThumbnail(member.user.displayAvatarURL({ size: 128 }));
  }

  await sendGuildLog(member.guild, embed);
}

function messageContent(message) {
  if (message?.content?.trim()) return truncate(message.content, 1000);
  if (message?.partial) return 'Inhalt nicht verfügbar (Nachricht war nicht im Cache).';
  return 'Kein Textinhalt.';
}

function attachmentSummary(message) {
  if (!message?.attachments?.size) return null;
  return truncate(
    message.attachments
      .map(attachment => attachment.name || attachment.url || 'Datei')
      .slice(0, 10)
      .join(', '),
    1000
  );
}

async function logMessageDelete(message) {
  if (!message?.guild || message.author?.bot) return;

  const embed = baseEmbed('Nachricht gelöscht', COLORS.delete)
    .addFields(
      { name: 'Nutzer', value: userLabel(message.author), inline: false },
      { name: 'Kanal', value: channelLabel(message.channel), inline: true },
      { name: 'Message ID', value: String(message.id || 'Unbekannt'), inline: true },
      { name: 'Inhalt', value: messageContent(message), inline: false }
    );

  const attachments = attachmentSummary(message);
  if (attachments) embed.addFields({ name: 'Anhänge', value: attachments, inline: false });

  await sendGuildLog(message.guild, embed);
}

async function logMessageUpdate(oldMessage, newMessage) {
  const guild = newMessage?.guild || oldMessage?.guild;
  if (!guild) return;

  let resolvedNew = newMessage;
  if (newMessage?.partial) {
    resolvedNew = await newMessage.fetch().catch(() => newMessage);
  }

  if (resolvedNew?.author?.bot) return;

  const before = oldMessage?.content?.trim() || 'Inhalt vorher nicht im Cache verfügbar.';
  const after = resolvedNew?.content?.trim() || 'Kein Textinhalt / Inhalt nicht verfügbar.';

  if (before === after && !oldMessage?.partial && !newMessage?.partial) return;

  const embed = baseEmbed('Nachricht bearbeitet', COLORS.edit)
    .addFields(
      { name: 'Nutzer', value: userLabel(resolvedNew?.author || oldMessage?.author), inline: false },
      { name: 'Kanal', value: channelLabel(resolvedNew?.channel || oldMessage?.channel), inline: true },
      { name: 'Message ID', value: String(resolvedNew?.id || oldMessage?.id || 'Unbekannt'), inline: true },
      { name: 'Vorher', value: truncate(before, 1000), inline: false },
      { name: 'Nachher', value: truncate(after, 1000), inline: false }
    );

  if (resolvedNew?.url) embed.setURL(resolvedNew.url);
  await sendGuildLog(guild, embed);
}

async function logRoleCreate(role) {
  if (!role?.guild) return;
  const embed = baseEmbed('Rolle erstellt', COLORS.create)
    .addFields(
      { name: 'Rolle', value: `${role.name} (${role.id})`, inline: false },
      { name: 'Farbe', value: roleColor(role), inline: true },
      { name: 'Erwähnbar', value: yesNo(role.mentionable), inline: true },
      { name: 'Separat angezeigt', value: yesNo(role.hoist), inline: true }
    );
  await sendGuildLog(role.guild, embed);
}

async function logRoleDelete(role) {
  if (!role?.guild) return;
  const embed = baseEmbed('Rolle gelöscht', COLORS.remove)
    .addFields(
      { name: 'Rolle', value: `${role.name} (${role.id})`, inline: false },
      { name: 'Farbe', value: roleColor(role), inline: true },
      { name: 'Position', value: String(role.position), inline: true }
    );
  await sendGuildLog(role.guild, embed);
}

async function logRoleUpdate(oldRole, newRole) {
  if (!newRole?.guild) return;
  const changes = [];
  if (oldRole.name !== newRole.name) changes.push(`Name: **${truncate(oldRole.name, 120)}** → **${truncate(newRole.name, 120)}**`);
  if (oldRole.hexColor !== newRole.hexColor) changes.push(`Farbe: **${roleColor(oldRole)}** → **${roleColor(newRole)}**`);
  if (oldRole.hoist !== newRole.hoist) changes.push(`Separat angezeigt: **${yesNo(oldRole.hoist)}** → **${yesNo(newRole.hoist)}**`);
  if (oldRole.mentionable !== newRole.mentionable) changes.push(`Erwähnbar: **${yesNo(oldRole.mentionable)}** → **${yesNo(newRole.mentionable)}**`);
  if (oldRole.permissions.bitfield !== newRole.permissions.bitfield) changes.push('Berechtigungen wurden geändert.');
  if (!changes.length) return;

  const embed = baseEmbed('Rolle geändert', COLORS.update)
    .addFields(
      { name: 'Rolle', value: `${newRole.name} (${newRole.id})`, inline: false },
      { name: 'Änderungen', value: truncate(changes.join('\n'), 1000), inline: false }
    );
  await sendGuildLog(newRole.guild, embed);
}

async function logChannelCreate(channel) {
  if (!channel?.guild) return;
  const embed = baseEmbed('Kanal erstellt', COLORS.create)
    .addFields(
      { name: 'Kanal', value: `${channel.name || 'Unbenannt'} (${channel.id})`, inline: false },
      { name: 'Typ', value: channelTypeLabel(channel.type), inline: true },
      { name: 'Kategorie', value: channel.parent?.name || 'Keine', inline: true }
    );
  await sendGuildLog(channel.guild, embed);
}

async function logChannelDelete(channel) {
  if (!channel?.guild) return;
  const embed = baseEmbed('Kanal gelöscht', COLORS.remove)
    .addFields(
      { name: 'Kanal', value: `${channel.name || 'Unbenannt'} (${channel.id})`, inline: false },
      { name: 'Typ', value: channelTypeLabel(channel.type), inline: true },
      { name: 'Kategorie', value: channel.parent?.name || 'Keine', inline: true }
    );
  await sendGuildLog(channel.guild, embed);
}

async function logChannelUpdate(oldChannel, newChannel) {
  if (!newChannel?.guild) return;
  const changes = [];
  if (oldChannel.name !== newChannel.name) changes.push(`Name: **${truncate(oldChannel.name, 120)}** → **${truncate(newChannel.name, 120)}**`);
  if (oldChannel.parentId !== newChannel.parentId) changes.push(`Kategorie: **${oldChannel.parent?.name || 'Keine'}** → **${newChannel.parent?.name || 'Keine'}**`);
  if ('topic' in oldChannel && oldChannel.topic !== newChannel.topic) changes.push('Thema wurde geändert.');
  if ('nsfw' in oldChannel && oldChannel.nsfw !== newChannel.nsfw) changes.push(`NSFW: **${yesNo(oldChannel.nsfw)}** → **${yesNo(newChannel.nsfw)}**`);
  if ('rateLimitPerUser' in oldChannel && oldChannel.rateLimitPerUser !== newChannel.rateLimitPerUser) {
    changes.push(`Slowmode: **${oldChannel.rateLimitPerUser || 0}s** → **${newChannel.rateLimitPerUser || 0}s**`);
  }
  if ('bitrate' in oldChannel && oldChannel.bitrate !== newChannel.bitrate) changes.push(`Bitrate: **${oldChannel.bitrate}** → **${newChannel.bitrate}**`);
  if ('userLimit' in oldChannel && oldChannel.userLimit !== newChannel.userLimit) changes.push(`User-Limit: **${oldChannel.userLimit || 0}** → **${newChannel.userLimit || 0}**`);
  if (!changes.length) return;

  const embed = baseEmbed('Kanal geändert', COLORS.update)
    .addFields(
      { name: 'Kanal', value: `${newChannel.name || 'Unbenannt'} (${newChannel.id})`, inline: false },
      { name: 'Typ', value: channelTypeLabel(newChannel.type), inline: true },
      { name: 'Änderungen', value: truncate(changes.join('\n'), 1000), inline: false }
    );
  await sendGuildLog(newChannel.guild, embed);
}

module.exports = {
  logMemberJoin,
  logMemberLeave,
  logMessageDelete,
  logMessageUpdate,
  logRoleCreate,
  logRoleDelete,
  logRoleUpdate,
  logChannelCreate,
  logChannelDelete,
  logChannelUpdate
};
