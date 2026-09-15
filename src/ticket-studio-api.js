const crypto = require('crypto');
const { ChannelType, PermissionFlagsBits } = require('discord.js');
const { client } = require('./bot');
const { getTicketConfig, setTicketConfig, listGuildTickets } = require('./ticket-store');
const { buildPublishedPanelPayload, cleanEmoji } = require('./ticket-studio-runtime');

const MAX_PANELS = 5;
const MAX_TYPES = 10;
const MAX_QUESTIONS = 5;
const PRIORITIES = new Set(['low', 'normal', 'high', 'urgent']);

function access(req, res, next) {
  if (!req.session?.user) return res.status(401).json({ error: 'not_authenticated', message: 'Nicht angemeldet.' });
  const guildAccess = (req.session.guilds || []).some(guild => guild.id === req.params.guildId);
  if (!guildAccess) return res.status(403).json({ error: 'guild_access_denied', message: 'Kein Zugriff auf diesen Server.' });
  if (!client.guilds.cache.has(req.params.guildId)) return res.status(409).json({ error: 'bot_not_installed', message: 'Bot ist nicht verbunden.' });
  next();
}

function safeId(value, prefix) {
  const raw = String(value || '').trim();
  return /^[A-Za-z0-9_-]{1,28}$/.test(raw) ? raw : `${prefix}_${crypto.randomBytes(8).toString('hex')}`;
}

function str(value, max) {
  return String(value || '').trim().slice(0, max);
}

function writable(channel, me) {
  const p = channel?.permissionsFor?.(me);
  return Boolean(p?.has(PermissionFlagsBits.ViewChannel) && p?.has(PermissionFlagsBits.SendMessages));
}

function metaForGuild(guild) {
  const me = guild.members.me;
  const channels = guild.channels.cache
    .filter(channel => [ChannelType.GuildText, ChannelType.GuildAnnouncement].includes(channel.type) && writable(channel, me))
    .map(channel => ({ id: channel.id, name: channel.name, parent: channel.parent?.name || '', position: channel.rawPosition }))
    .sort((a, b) => a.position - b.position || a.name.localeCompare(b.name, 'de'));

  const categories = guild.channels.cache
    .filter(channel => channel.type === ChannelType.GuildCategory)
    .map(channel => ({ id: channel.id, name: channel.name, position: channel.rawPosition }))
    .sort((a, b) => a.position - b.position || a.name.localeCompare(b.name, 'de'));

  const staffRoles = guild.roles.cache
    .filter(role => role.id !== guild.id && !role.managed)
    .map(role => ({ id: role.id, name: role.name, color: role.hexColor, position: role.position }))
    .sort((a, b) => b.position - a.position);

  const tickets = listGuildTickets(guild.id);
  return {
    channels,
    categories,
    staffRoles,
    capabilities: {
      canManageChannels: Boolean(me?.permissions.has(PermissionFlagsBits.ManageChannels)),
      canEmbedLinks: Boolean(me?.permissions.has(PermissionFlagsBits.EmbedLinks))
    },
    stats: {
      open: tickets.filter(ticket => ticket.status === 'open').length,
      closed: tickets.filter(ticket => ticket.status === 'closed').length,
      total: tickets.length
    }
  };
}

function sanitizeQuestion(raw, index) {
  const style = raw?.style === 'paragraph' ? 'paragraph' : 'short';
  const maxDefault = style === 'paragraph' ? 1500 : 200;
  let minLength = Number(raw?.minLength || 0);
  let maxLength = Number(raw?.maxLength || maxDefault);
  minLength = Number.isFinite(minLength) ? Math.max(0, Math.min(Math.floor(minLength), 4000)) : 0;
  maxLength = Number.isFinite(maxLength) ? Math.max(1, Math.min(Math.floor(maxLength), 4000)) : maxDefault;
  if (minLength > maxLength) minLength = maxLength;
  return {
    id: safeId(raw?.id, `q${index + 1}`),
    label: str(raw?.label, 45) || `Frage ${index + 1}`,
    placeholder: str(raw?.placeholder, 100),
    style,
    required: raw?.required !== false,
    minLength,
    maxLength
  };
}

function sanitizeType(raw, index) {
  const questions = Array.isArray(raw?.questions) ? raw.questions.slice(0, MAX_QUESTIONS) : [];
  return {
    id: safeId(raw?.id, `type${index + 1}`),
    enabled: raw?.enabled !== false,
    label: str(raw?.label, 80) || `Ticket-Typ ${index + 1}`,
    emoji: cleanEmoji(str(raw?.emoji, 64)),
    description: str(raw?.description, 180),
    priority: PRIORITIES.has(raw?.priority) ? raw.priority : 'normal',
    modalTitle: str(raw?.modalTitle, 45) || str(raw?.label, 45) || 'Ticket öffnen',
    questions: questions.map(sanitizeQuestion)
  };
}

function sanitizePanel(raw, index, previous) {
  const typesRaw = Array.isArray(raw?.types) ? raw.types : [];
  if (typesRaw.length > MAX_TYPES) throw new Error(`Panel ${index + 1}: maximal ${MAX_TYPES} Ticket-Typen.`);
  const staffRoleIds = [...new Set((Array.isArray(raw?.staffRoleIds) ? raw.staffRoleIds : []).map(String).filter(Boolean))].slice(0, 10);
  return {
    id: safeId(raw?.id, `panel${index + 1}`),
    enabled: raw?.enabled !== false,
    name: str(raw?.name, 60) || `Ticket Panel ${index + 1}`,
    channelId: str(raw?.channelId, 32),
    categoryId: str(raw?.categoryId, 32),
    archiveCategoryId: str(raw?.archiveCategoryId, 32),
    logChannelId: str(raw?.logChannelId, 32),
    staffRoleIds,
    maxOpenPerUser: (() => {
      const value = Number(raw?.maxOpenPerUser ?? 1);
      return Number.isFinite(value) ? Math.max(1, Math.min(Math.floor(value), 5)) : 1;
    })(),
    userCanClose: raw?.userCanClose !== false,
    title: str(raw?.title, 256) || 'Support Center',
    description: str(raw?.description, 1800) || 'Wähle unten den passenden Bereich für dein Anliegen.',
    color: /^#[0-9A-F]{6}$/i.test(String(raw?.color || '')) ? String(raw.color).toUpperCase() : '#5865F2',
    types: typesRaw.map(sanitizeType),
    messageId: previous?.messageId || '',
    publishedChannelId: previous?.publishedChannelId || '',
    publishedAt: previous?.publishedAt || ''
  };
}

function sanitizeConfig(input, current) {
  const panelsRaw = Array.isArray(input?.panels) ? input.panels : [];
  if (panelsRaw.length > MAX_PANELS) throw new Error(`Maximal ${MAX_PANELS} Ticket-Panels pro Server.`);
  const prev = new Map((current.panels || []).map(panel => [panel.id, panel]));
  return {
    enabled: Boolean(input?.enabled),
    panels: panelsRaw.map((panel, index) => {
      const id = safeId(panel?.id, `panel${index + 1}`);
      return sanitizePanel({ ...panel, id }, index, prev.get(id));
    })
  };
}

async function validatePanelForPublish(guild, panel) {
  const me = guild.members.me || await guild.members.fetchMe().catch(() => null);
  if (!me?.permissions.has(PermissionFlagsBits.ManageChannels)) throw new Error('Dem Bot fehlt „Kanäle verwalten“.');
  if (!panel.enabled) throw new Error('Aktiviere das Panel zuerst.');
  if (!panel.channelId) throw new Error('Wähle einen Kanal für das Ticket-Panel.');
  if (!panel.categoryId) throw new Error('Wähle eine Kategorie für neue Tickets.');
  if (!panel.staffRoleIds.length) throw new Error('Wähle mindestens eine Support-Rolle.');
  if (!panel.types.length) throw new Error('Füge mindestens einen Ticket-Typ hinzu.');

  const channel = guild.channels.cache.get(panel.channelId) || await guild.channels.fetch(panel.channelId).catch(() => null);
  if (!channel || !writable(channel, me) || !channel.send) throw new Error('Der Panel-Kanal ist nicht beschreibbar.');
  const channelPermissions = channel.permissionsFor(me);
  if (!channelPermissions?.has(PermissionFlagsBits.EmbedLinks)) throw new Error('Dem Bot fehlt im Panel-Kanal „Links einbetten“.');
  const category = guild.channels.cache.get(panel.categoryId) || await guild.channels.fetch(panel.categoryId).catch(() => null);
  if (!category || category.type !== ChannelType.GuildCategory) throw new Error('Die Ticket-Kategorie existiert nicht mehr.');
  if (panel.archiveCategoryId) {
    const archive = guild.channels.cache.get(panel.archiveCategoryId) || await guild.channels.fetch(panel.archiveCategoryId).catch(() => null);
    if (!archive || archive.type !== ChannelType.GuildCategory) throw new Error('Die Archiv-Kategorie existiert nicht mehr.');
  }
  if (panel.logChannelId) {
    const logChannel = guild.channels.cache.get(panel.logChannelId) || await guild.channels.fetch(panel.logChannelId).catch(() => null);
    if (!logChannel || !writable(logChannel, me) || !logChannel.send) throw new Error('Der Transcript-Log-Kanal ist nicht beschreibbar.');
    const logPermissions = logChannel.permissionsFor(me);
    if (!logPermissions?.has(PermissionFlagsBits.AttachFiles) || !logPermissions?.has(PermissionFlagsBits.EmbedLinks)) {
      throw new Error('Für Transcript-Logs braucht der Bot „Dateien anhängen“ und „Links einbetten“.');
    }
  }
  for (const roleId of panel.staffRoleIds) {
    if (!guild.roles.cache.has(roleId)) throw new Error('Mindestens eine Support-Rolle existiert nicht mehr.');
  }
  return { channel };
}

async function removePublished(guild, panel) {
  if (!panel.messageId || !panel.publishedChannelId) return;
  const channel = guild.channels.cache.get(panel.publishedChannelId) || await guild.channels.fetch(panel.publishedChannelId).catch(() => null);
  const message = await channel?.messages?.fetch(panel.messageId).catch(() => null);
  if (message) await message.delete().catch(() => null);
}

function rejectedTypeEmojiIndex(error) {
  const message = String(error?.message || '');
  if (!message.includes('COMPONENT_INVALID_EMOJI')) return null;
  const match = message.match(/components\[(\d+)\]\.components\[(\d+)\]\.emoji(?:\.name)?/i);
  if (!match) return null;
  return Number(match[1]) * 5 + Number(match[2]);
}

async function deliverPanelMessage(channel, panel, existingMessage = null) {
  let safePanel = panel;
  for (let attempt = 0; attempt <= (panel.types?.length || 0); attempt += 1) {
    try {
      const payload = buildPublishedPanelPayload(safePanel);
      if (existingMessage) {
        await existingMessage.edit(payload);
        return { message: existingMessage, panel: safePanel };
      }
      const message = await channel.send(payload);
      return { message, panel: safePanel };
    } catch (error) {
      const index = rejectedTypeEmojiIndex(error);
      const activeTypes = (safePanel.types || []).filter(type => type.enabled !== false);
      const rejectedType = Number.isInteger(index) ? activeTypes[index] : null;
      if (!rejectedType?.emoji) throw error;
      console.warn(`[TICKETS] Discord rejected emoji ${JSON.stringify(rejectedType.emoji)} for ${rejectedType.label}; retrying without it.`);
      safePanel = {
        ...safePanel,
        types: safePanel.types.map(type => type.id === rejectedType.id ? { ...type, emoji: '' } : type)
      };
    }
  }
  throw new Error('Ticket-Panel konnte wegen ungültiger Emojis nicht veröffentlicht werden.');
}

async function publishPanel(guild, panel) {
  const { channel } = await validatePanelForPublish(guild, panel);
  let existingMessage = null;
  if (panel.messageId && panel.publishedChannelId === panel.channelId) {
    existingMessage = await channel.messages.fetch(panel.messageId).catch(() => null);
  }
  if (!existingMessage && panel.messageId) await removePublished(guild, panel);
  const delivered = await deliverPanelMessage(channel, panel, existingMessage);
  return {
    ...delivered.panel,
    messageId: delivered.message.id,
    publishedChannelId: channel.id,
    publishedAt: new Date().toISOString()
  };
}

function attachTicketStudioApi(app) {
  app.get('/api/guilds/:guildId/ticket-studio', access, (req, res) => {
    const guild = client.guilds.cache.get(req.params.guildId);
    res.json({ config: getTicketConfig(guild.id), meta: metaForGuild(guild) });
  });

  app.patch('/api/guilds/:guildId/ticket-studio', access, (req, res) => {
    const guild = client.guilds.cache.get(req.params.guildId);
    try {
      const current = getTicketConfig(guild.id);
      const config = sanitizeConfig(req.body || {}, current);
      const nextPanelIds = new Set(config.panels.map(panel => panel.id));
      const removedPanelIds = new Set((current.panels || []).filter(panel => !nextPanelIds.has(panel.id)).map(panel => panel.id));
      if (removedPanelIds.size) {
        const blocked = listGuildTickets(guild.id).some(ticket => ticket.status === 'open' && removedPanelIds.has(ticket.panelId));
        if (blocked) throw new Error('Ein entferntes Ticket-Panel hat noch offene Tickets. Schließe diese zuerst.');
      }
      const saved = setTicketConfig(guild.id, config, req.session.user.id);
      res.json({ ok: true, config: saved, meta: metaForGuild(guild) });
    } catch (error) {
      res.status(400).json({ error: 'invalid_ticket_studio', message: error.message });
    }
  });

  app.post('/api/guilds/:guildId/ticket-studio/:panelId/publish', access, async (req, res) => {
    const guild = client.guilds.cache.get(req.params.guildId);
    try {
      const config = getTicketConfig(guild.id);
      if (!config.enabled) throw new Error('Aktiviere Ticket Studio zuerst.');
      const index = config.panels.findIndex(panel => panel.id === req.params.panelId);
      if (index < 0) throw new Error('Ticket-Panel nicht gefunden.');
      const published = await publishPanel(guild, config.panels[index]);
      config.panels[index] = published;
      const saved = setTicketConfig(guild.id, config, req.session.user.id);
      res.json({ ok: true, config: saved, panel: published, messageUrl: `https://discord.com/channels/${guild.id}/${published.publishedChannelId}/${published.messageId}` });
    } catch (error) {
      console.warn(`[TICKETS] Publish failed in ${guild?.name || req.params.guildId}: ${error.message}`);
      res.status(400).json({ error: 'ticket_publish_failed', message: error.message });
    }
  });

  app.post('/api/guilds/:guildId/ticket-studio/:panelId/unpublish', access, async (req, res) => {
    const guild = client.guilds.cache.get(req.params.guildId);
    try {
      const config = getTicketConfig(guild.id);
      const index = config.panels.findIndex(panel => panel.id === req.params.panelId);
      if (index < 0) throw new Error('Ticket-Panel nicht gefunden.');
      await removePublished(guild, config.panels[index]);
      config.panels[index] = { ...config.panels[index], messageId: '', publishedChannelId: '', publishedAt: '' };
      const saved = setTicketConfig(guild.id, config, req.session.user.id);
      res.json({ ok: true, config: saved, panel: config.panels[index] });
    } catch (error) {
      res.status(400).json({ error: 'ticket_unpublish_failed', message: error.message });
    }
  });
}

module.exports = { attachTicketStudioApi };
