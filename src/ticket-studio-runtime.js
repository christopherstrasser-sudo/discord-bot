const {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  Events,
  ModalBuilder,
  PermissionFlagsBits,
  TextInputBuilder,
  TextInputStyle
} = require('discord.js');
const {
  getTicketConfig,
  createTicketRecord,
  getTicketRecord,
  updateTicketRecord,
  countOpenTickets,
  saveTranscript
} = require('./ticket-store');

const PRIORITY_META = {
  low: { label: 'Niedrig', color: 0x57F287 },
  normal: { label: 'Normal', color: 0x5865F2 },
  high: { label: 'Hoch', color: 0xFEE75C },
  urgent: { label: 'Dringend', color: 0xED4245 }
};

function cleanEmoji(value) {
  return String(value || '').trim().normalize('NFC').replace(/[\uFE0E\uFE0F]/g, '');
}

function safeChannelPart(value) {
  return String(value || 'user')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32) || 'user';
}

function findPanel(config, panelId, requireActive = true) {
  if (requireActive && !config?.enabled) return null;
  const panel = (config?.panels || []).find(entry => entry.id === panelId) || null;
  if (requireActive && panel?.enabled === false) return null;
  return panel;
}

function findType(panel, typeId, requireActive = true) {
  const type = (panel?.types || []).find(entry => entry.id === typeId) || null;
  if (requireActive && type?.enabled === false) return null;
  return type;
}

function buildPublishedPanelPayload(panel) {
  const embed = new EmbedBuilder()
    .setColor(/^#[0-9A-F]{6}$/i.test(panel.color || '') ? panel.color : '#5865F2')
    .setTitle(String(panel.title || 'Support Center').slice(0, 256))
    .setDescription(String(panel.description || 'Wähle unten den passenden Bereich für dein Anliegen.').slice(0, 1800))
    .setFooter({ text: 'RAKU Ticket Studio · private Support-Tickets' });

  const components = [];
  const types = (panel.types || []).filter(type => type.enabled !== false).slice(0, 10);
  const described = types.filter(type => String(type.description || '').trim()).slice(0, 10);
  if (described.length) {
    embed.addFields(described.map(type => ({
      name: `${cleanEmoji(type.emoji)} ${String(type.label || 'Ticket')}`.trim().slice(0, 256),
      value: String(type.description || '').slice(0, 1024),
      inline: true
    })));
  }

  for (let start = 0; start < types.length; start += 5) {
    const row = new ActionRowBuilder();
    for (const type of types.slice(start, start + 5)) {
      const button = new ButtonBuilder()
        .setCustomId(`raku_ticket_open:${panel.id}:${type.id}`)
        .setLabel(String(type.label || 'Ticket öffnen').slice(0, 80))
        .setStyle(type.priority === 'urgent' ? ButtonStyle.Danger : type.priority === 'high' ? ButtonStyle.Primary : ButtonStyle.Secondary);
      const emoji = cleanEmoji(type.emoji);
      if (emoji) button.setEmoji(emoji);
      row.addComponents(button);
    }
    components.push(row);
  }

  return { embeds: [embed], components };
}

function buildOpenModal(panel, type) {
  const modal = new ModalBuilder()
    .setCustomId(`raku_ticket_modal:${panel.id}:${type.id}`)
    .setTitle(String(type.modalTitle || type.label || 'Ticket öffnen').slice(0, 45));

  for (const question of (type.questions || []).slice(0, 5)) {
    const input = new TextInputBuilder()
      .setCustomId(`q:${question.id}`)
      .setLabel(String(question.label || 'Antwort').slice(0, 45))
      .setStyle(question.style === 'paragraph' ? TextInputStyle.Paragraph : TextInputStyle.Short)
      .setRequired(question.required !== false);

    const placeholder = String(question.placeholder || '').trim();
    if (placeholder) input.setPlaceholder(placeholder.slice(0, 100));
    const min = Number(question.minLength || 0);
    const max = Number(question.maxLength || (question.style === 'paragraph' ? 1500 : 200));
    if (min > 0) input.setMinLength(Math.min(min, max));
    input.setMaxLength(Math.max(1, Math.min(max, 4000)));
    modal.addComponents(new ActionRowBuilder().addComponents(input));
  }
  return modal;
}

async function getMember(interaction) {
  if (interaction.member?.roles?.cache) return interaction.member;
  return interaction.guild.members.fetch(interaction.user.id).catch(() => null);
}

async function isStaff(interaction, panel) {
  if (interaction.memberPermissions?.has(PermissionFlagsBits.ManageChannels)) return true;
  const member = await getMember(interaction);
  if (!member) return false;
  return (panel.staffRoleIds || []).some(roleId => member.roles.cache.has(roleId));
}

function ticketHeaderPayload(ticket, panel, type) {
  const priority = PRIORITY_META[ticket.priority] || PRIORITY_META.normal;
  const status = ticket.status === 'closed' ? 'Geschlossen' : ticket.claimedBy ? 'In Bearbeitung' : 'Offen';
  const embed = new EmbedBuilder()
    .setColor(ticket.status === 'closed' ? 0x4E5058 : priority.color)
    .setTitle(`#${String(ticket.number).padStart(4, '0')} · ${type?.label || 'Support'}`)
    .setDescription(`Ticket von <@${ticket.userId}>`)
    .addFields(
      { name: 'Status', value: status, inline: true },
      { name: 'Priorität', value: priority.label, inline: true },
      { name: 'Zuständig', value: ticket.claimedBy ? `<@${ticket.claimedBy}>` : 'Noch niemand', inline: true }
    )
    .setFooter({ text: `Ticket-ID ${ticket.id}` })
    .setTimestamp(new Date(ticket.createdAt));

  for (const answer of ticket.answers || []) {
    embed.addFields({
      name: String(answer.label || 'Antwort').slice(0, 256),
      value: String(answer.value || '—').slice(0, 1024),
      inline: false
    });
  }

  const row = new ActionRowBuilder();
  if (ticket.status === 'open') {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`raku_ticket_claim:${ticket.id}`)
        .setLabel(ticket.claimedBy ? 'Freigeben' : 'Übernehmen')
        .setStyle(ticket.claimedBy ? ButtonStyle.Secondary : ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`raku_ticket_close:${ticket.id}`)
        .setLabel('Ticket schließen')
        .setStyle(ButtonStyle.Danger)
    );
  } else {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`raku_ticket_delete:${ticket.id}`)
        .setLabel('Kanal löschen')
        .setStyle(ButtonStyle.Danger)
    );
  }

  return { embeds: [embed], components: [row] };
}

async function updateTicketHeader(guild, ticket, panel, type) {
  if (!ticket.controlMessageId || !ticket.channelId) return;
  const channel = guild.channels.cache.get(ticket.channelId) || await guild.channels.fetch(ticket.channelId).catch(() => null);
  if (!channel?.messages) return;
  const message = await channel.messages.fetch(ticket.controlMessageId).catch(() => null);
  if (message) await message.edit(ticketHeaderPayload(ticket, panel, type)).catch(() => null);
}

async function createTicket(interaction, panel, type, answers) {
  const currentOpen = countOpenTickets(interaction.guild.id, interaction.user.id, panel.id);
  const maxOpen = Math.max(1, Math.min(Number(panel.maxOpenPerUser || 1), 5));
  if (currentOpen >= maxOpen) {
    throw new Error(`Du hast bereits ${currentOpen} offene(s) Ticket(s) in diesem Bereich. Maximal erlaubt: ${maxOpen}.`);
  }

  const guild = interaction.guild;
  const me = guild.members.me || await guild.members.fetchMe();
  if (!me.permissions.has(PermissionFlagsBits.ManageChannels)) {
    throw new Error('Dem Bot fehlt „Kanäle verwalten“.');
  }

  const staffRoles = (panel.staffRoleIds || [])
    .map(id => guild.roles.cache.get(id))
    .filter(Boolean);
  if (!staffRoles.length) {
    throw new Error('Keine konfigurierte Support-Rolle ist mehr verfügbar.');
  }

  const overwrites = [
    { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
    {
      id: interaction.user.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.AttachFiles,
        PermissionFlagsBits.EmbedLinks
      ]
    },
    {
      id: me.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.ManageChannels,
        PermissionFlagsBits.ManageMessages,
        PermissionFlagsBits.AttachFiles,
        PermissionFlagsBits.EmbedLinks
      ]
    },
    ...staffRoles.map(role => ({
      id: role.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.ManageMessages,
        PermissionFlagsBits.AttachFiles,
        PermissionFlagsBits.EmbedLinks
      ]
    }))
  ];

  const provisional = createTicketRecord(guild.id, {
    panelId: panel.id,
    typeId: type.id,
    userId: interaction.user.id,
    userTag: interaction.user.tag || interaction.user.username,
    channelId: '',
    controlMessageId: '',
    priority: type.priority || 'normal',
    answers
  });

  const channelName = `ticket-${String(provisional.number).padStart(4, '0')}-${safeChannelPart(interaction.user.username)}`.slice(0, 100);
  let channel;
  try {
    channel = await guild.channels.create({
      name: channelName,
      type: ChannelType.GuildText,
      parent: panel.categoryId || undefined,
      topic: `RAKU Ticket ${provisional.id} · User ${interaction.user.id}`.slice(0, 1024),
      permissionOverwrites: overwrites,
      reason: `RAKU Ticket Studio · ${type.label || 'Support'} · ${interaction.user.tag || interaction.user.username}`
    });
  } catch (error) {
    updateTicketRecord(guild.id, provisional.id, { status: 'failed', closedAt: new Date().toISOString() });
    throw error;
  }

  let ticket = updateTicketRecord(guild.id, provisional.id, { channelId: channel.id });
  const pingRoles = staffRoles.map(role => `<@&${role.id}>`).join(' ');
  let control;
  try {
    control = await channel.send({
      content: [interaction.user.toString(), pingRoles].filter(Boolean).join(' '),
      ...ticketHeaderPayload(ticket, panel, type),
      allowedMentions: {
        users: [interaction.user.id],
        roles: staffRoles.map(role => role.id)
      }
    });
  } catch (error) {
    updateTicketRecord(guild.id, ticket.id, {
      status: 'failed',
      closedAt: new Date().toISOString(),
      failureReason: String(error.message || error).slice(0, 500)
    });
    await channel.delete(`RAKU Ticket ${ticket.id} setup failed`).catch(() => null);
    throw new Error(`Ticket-Kanal konnte nicht initialisiert werden: ${error.message}`);
  }
  ticket = updateTicketRecord(guild.id, ticket.id, { controlMessageId: control.id });
  return { ticket, channel };
}

async function collectTranscript(channel, maxMessages = 1000) {
  const messages = [];
  let before;
  while (messages.length < maxMessages) {
    const batch = await channel.messages.fetch({ limit: Math.min(100, maxMessages - messages.length), before }).catch(() => null);
    if (!batch?.size) break;
    messages.push(...batch.values());
    before = batch.last().id;
    if (batch.size < 100) break;
  }
  messages.sort((a, b) => a.createdTimestamp - b.createdTimestamp);
  const lines = [
    `RAKU Ticket Transcript`,
    `Server: ${channel.guild.name} (${channel.guild.id})`,
    `Kanal: #${channel.name} (${channel.id})`,
    `Erstellt: ${new Date().toISOString()}`,
    '',
    '------------------------------------------------------------',
    ''
  ];
  for (const message of messages) {
    const stamp = new Date(message.createdTimestamp).toISOString();
    const author = message.author ? `${message.author.tag} (${message.author.id})` : 'Unbekannt';
    const content = String(message.content || '').replace(/\r?\n/g, '\n    ');
    lines.push(`[${stamp}] ${author}`);
    if (content) lines.push(`    ${content}`);
    for (const attachment of message.attachments.values()) lines.push(`    [Anhang] ${attachment.url}`);
    if (message.embeds.length) lines.push(`    [${message.embeds.length} Embed(s)]`);
    lines.push('');
  }
  return lines.join('\n');
}

async function sendTranscriptLog(guild, panel, ticket, transcriptPath) {
  if (!panel.logChannelId) return;
  const channel = guild.channels.cache.get(panel.logChannelId) || await guild.channels.fetch(panel.logChannelId).catch(() => null);
  if (!channel?.send) return;
  const embed = new EmbedBuilder()
    .setColor(0x4E5058)
    .setTitle(`Ticket #${String(ticket.number).padStart(4, '0')} geschlossen`)
    .addFields(
      { name: 'User', value: `<@${ticket.userId}>`, inline: true },
      { name: 'Geschlossen von', value: ticket.closedBy ? `<@${ticket.closedBy}>` : 'System', inline: true },
      { name: 'Ticket-ID', value: ticket.id, inline: true }
    )
    .setTimestamp();
  await channel.send({
    embeds: [embed],
    files: [new AttachmentBuilder(transcriptPath, { name: `${ticket.id}-transcript.txt` })],
    allowedMentions: { parse: [] }
  }).catch(error => console.warn(`[TICKETS] Transcript log failed in ${guild.name}: ${error.message}`));
}

async function handleOpenButton(interaction, panel, type) {
  const questions = (type.questions || []).slice(0, 5);
  if (questions.length) {
    const currentOpen = countOpenTickets(interaction.guild.id, interaction.user.id, panel.id);
    const maxOpen = Math.max(1, Math.min(Number(panel.maxOpenPerUser || 1), 5));
    if (currentOpen >= maxOpen) {
      await interaction.reply({ content: `⚠️ Du hast bereits ${currentOpen} offene(s) Ticket(s).`, ephemeral: true });
      return;
    }
    await interaction.showModal(buildOpenModal(panel, type));
    return;
  }

  await interaction.deferReply({ ephemeral: true });
  const { channel } = await createTicket(interaction, panel, type, []);
  await interaction.editReply({ content: `✅ Dein Ticket wurde erstellt: ${channel}` });
}

async function handleModalSubmit(interaction, panel, type) {
  await interaction.deferReply({ ephemeral: true });
  const answers = (type.questions || []).slice(0, 5).map(question => ({
    id: question.id,
    label: question.label,
    value: interaction.fields.getTextInputValue(`q:${question.id}`) || '—'
  }));
  const { channel } = await createTicket(interaction, panel, type, answers);
  await interaction.editReply({ content: `✅ Dein Ticket wurde erstellt: ${channel}` });
}

async function handleClaim(interaction, ticket, panel, type) {
  if (!(await isStaff(interaction, panel))) throw new Error('Nur das Support-Team kann Tickets übernehmen.');
  let next;
  if (!ticket.claimedBy) {
    next = updateTicketRecord(interaction.guild.id, ticket.id, { claimedBy: interaction.user.id });
  } else if (ticket.claimedBy === interaction.user.id) {
    next = updateTicketRecord(interaction.guild.id, ticket.id, { claimedBy: null });
  } else {
    throw new Error('Dieses Ticket wurde bereits von einem anderen Teammitglied übernommen.');
  }
  await updateTicketHeader(interaction.guild, next, panel, type);
  await interaction.reply({ content: next.claimedBy ? '✅ Ticket übernommen.' : '✅ Ticket freigegeben.', ephemeral: true });
}

async function handleClose(interaction, ticket, panel, type) {
  const staff = await isStaff(interaction, panel);
  if (!staff && !(panel.userCanClose !== false && ticket.userId === interaction.user.id)) {
    throw new Error('Du darfst dieses Ticket nicht schließen.');
  }
  if (ticket.status !== 'open') throw new Error('Dieses Ticket ist bereits geschlossen.');

  await interaction.deferReply({ ephemeral: true });
  const channel = interaction.channel;
  const transcript = await collectTranscript(channel);
  const transcriptPath = saveTranscript(interaction.guild.id, ticket.id, transcript);
  const next = updateTicketRecord(interaction.guild.id, ticket.id, {
    status: 'closed',
    closedAt: new Date().toISOString(),
    closedBy: interaction.user.id,
    transcriptPath
  });

  await channel.permissionOverwrites.edit(ticket.userId, { SendMessages: false }).catch(() => null);
  if (panel.archiveCategoryId) {
    await channel.setParent(panel.archiveCategoryId, { lockPermissions: false, reason: `RAKU Ticket ${ticket.id} archived` }).catch(() => null);
  }
  const closedName = `closed-${String(ticket.number).padStart(4, '0')}-${safeChannelPart(ticket.userTag)}`.slice(0, 100);
  await channel.setName(closedName, `RAKU Ticket ${ticket.id} closed`).catch(() => null);
  await sendTranscriptLog(interaction.guild, panel, next, transcriptPath);
  await updateTicketHeader(interaction.guild, next, panel, type);
  await interaction.editReply({ content: '✅ Ticket geschlossen. Transcript wurde erstellt.' });
}

async function handleDelete(interaction, ticket, panel) {
  if (!(await isStaff(interaction, panel))) throw new Error('Nur das Support-Team kann geschlossene Ticket-Kanäle löschen.');
  if (ticket.status !== 'closed') throw new Error('Schließe das Ticket zuerst.');
  await interaction.reply({ content: '🗑️ Kanal wird gelöscht …', ephemeral: true });
  updateTicketRecord(interaction.guild.id, ticket.id, { status: 'deleted', deletedAt: new Date().toISOString(), deletedBy: interaction.user.id });
  setTimeout(() => interaction.channel?.delete(`RAKU Ticket ${ticket.id} deleted`).catch(() => null), 1200);
}

async function handleTicketInteraction(interaction) {
  if (!interaction?.guild) return false;
  const customId = String(interaction.customId || '');
  const open = customId.match(/^raku_ticket_open:([^:]+):([^:]+)$/);
  const modal = customId.match(/^raku_ticket_modal:([^:]+):([^:]+)$/);
  const claim = customId.match(/^raku_ticket_claim:(.+)$/);
  const close = customId.match(/^raku_ticket_close:(.+)$/);
  const del = customId.match(/^raku_ticket_delete:(.+)$/);
  if (!open && !modal && !claim && !close && !del) return false;

  try {
    const config = getTicketConfig(interaction.guild.id);

    if (open || modal) {
      const panel = findPanel(config, (open || modal)[1], true);
      const type = findType(panel, (open || modal)[2], true);
      if (!panel || !type) throw new Error('Dieser Ticket-Bereich ist aktuell nicht verfügbar.');
      if (open) await handleOpenButton(interaction, panel, type);
      else await handleModalSubmit(interaction, panel, type);
      return true;
    }

    const ticketId = (claim || close || del)[1];
    const ticket = getTicketRecord(interaction.guild.id, ticketId);
    if (!ticket) throw new Error('Dieses Ticket wurde nicht gefunden.');
    const panel = findPanel(config, ticket.panelId, false);
    const type = findType(panel, ticket.typeId, false);
    if (!panel) throw new Error('Die Konfiguration dieses Tickets existiert nicht mehr.');

    if (claim) await handleClaim(interaction, ticket, panel, type);
    else if (close) await handleClose(interaction, ticket, panel, type);
    else await handleDelete(interaction, ticket, panel);
  } catch (error) {
    const content = `⚠️ ${error.message || 'Ticket-Aktion fehlgeschlagen.'}`;
    if (interaction.deferred || interaction.replied) await interaction.editReply({ content }).catch(() => null);
    else await interaction.reply({ content, ephemeral: true }).catch(() => null);
  }

  return true;
}

function attachTicketRuntime(client) {
  client.on(Events.InteractionCreate, interaction => {
    handleTicketInteraction(interaction).catch(error => {
      console.warn(`[TICKETS] Interaction failed: ${error.message}`);
    });
  });
}

module.exports = {
  attachTicketRuntime,
  handleTicketInteraction,
  buildPublishedPanelPayload,
  cleanEmoji
};
