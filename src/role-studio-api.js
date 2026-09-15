const crypto = require('crypto');
const {
  ChannelType,
  PermissionFlagsBits
} = require('discord.js');
const { client } = require('./bot');
const { getGuildSettings, updateGuildSettings } = require('./store');
const { buildPanelPayload, emojiKeyFromConfig } = require('./role-studio');

const MAX_PANELS = 10;
const MAX_ITEMS = 20;
const PANEL_MODES = new Set(['buttons', 'select', 'reactions']);
const SELECTION_MODES = new Set(['single', 'multi']);
const BUTTON_STYLES = new Set(['primary', 'secondary', 'success', 'danger']);

function safeId(value, prefix) {
  const raw = String(value || '').trim();
  return /^[a-zA-Z0-9_-]{1,72}$/.test(raw) ? raw : `${prefix}_${crypto.randomUUID()}`;
}

function text(value, max) {
  return String(value || '').trim().slice(0, max);
}

function requireRoleStudioAccess(req, res, next) {
  if (!req.session?.user) {
    return res.status(401).json({ error: 'not_authenticated', message: 'Nicht angemeldet.' });
  }

  const guildAccess = (req.session.guilds || []).find(guild => guild.id === req.params.guildId);
  if (!guildAccess) {
    return res.status(403).json({ error: 'guild_access_denied', message: 'Kein Zugriff auf diesen Server.' });
  }

  if (!client.guilds.cache.has(req.params.guildId)) {
    return res.status(409).json({ error: 'bot_not_installed', message: 'Der Bot ist auf diesem Server nicht verbunden.' });
  }

  next();
}

async function botMember(guild) {
  return guild.members.me || guild.members.fetchMe().catch(() => null);
}

function botCanWrite(channel, me) {
  if (!channel || !me) return false;
  const permissions = channel.permissionsFor(me);
  return Boolean(
    permissions?.has(PermissionFlagsBits.ViewChannel) &&
    permissions?.has(PermissionFlagsBits.SendMessages)
  );
}

async function manageableRole(guild, me, roleId) {
  if (!roleId || !me?.permissions.has(PermissionFlagsBits.ManageRoles)) return null;
  const role = guild.roles.cache.get(roleId) || await guild.roles.fetch(roleId).catch(() => null);
  if (!role || role.id === guild.id || role.managed || role.position >= me.roles.highest.position) return null;
  return role;
}

async function sanitizeItem(item, guild, me, usedRoleIds) {
  const id = safeId(item?.id, 'role');
  const roleId = String(item?.roleId || '').trim();
  const role = roleId ? await manageableRole(guild, me, roleId) : null;

  if (roleId && !role) {
    throw new Error('Mindestens eine ausgewählte Rolle kann der Bot nicht verwalten. Prüfe die Rollen-Hierarchie.');
  }
  if (roleId && usedRoleIds.has(roleId)) {
    throw new Error('Eine Rolle darf innerhalb eines Panels nur einmal verwendet werden.');
  }
  if (roleId) usedRoleIds.add(roleId);

  const label = text(item?.label, 80) || role?.name || 'Rolle auswählen';
  const emoji = text(item?.emoji, 64);
  const description = text(item?.description, 100);
  const style = BUTTON_STYLES.has(item?.style) ? item.style : 'secondary';

  return {
    id,
    roleId,
    label,
    emoji,
    description,
    style
  };
}

async function sanitizePanel(input, guild, me, previous) {
  const id = safeId(input?.id, 'panel');
  const mode = PANEL_MODES.has(input?.mode) ? input.mode : 'buttons';
  const selectionMode = SELECTION_MODES.has(input?.selectionMode) ? input.selectionMode : 'multi';
  const channelId = String(input?.channelId || '').trim();

  if (channelId) {
    const channel = guild.channels.cache.get(channelId) || await guild.channels.fetch(channelId).catch(() => null);
    const allowedType = channel && [ChannelType.GuildText, ChannelType.GuildAnnouncement].includes(channel.type);
    if (!allowedType || !botCanWrite(channel, me)) {
      throw new Error('Mindestens ein Rollen-Panel verwendet einen Kanal, in den der Bot nicht schreiben kann.');
    }
  }

  const rawItems = Array.isArray(input?.items) ? input.items : [];
  if (rawItems.length > MAX_ITEMS) {
    throw new Error(`Maximal ${MAX_ITEMS} Rollen pro Panel.`);
  }

  const usedRoleIds = new Set();
  const items = [];
  for (const item of rawItems) {
    items.push(await sanitizeItem(item, guild, me, usedRoleIds));
  }

  if (mode === 'reactions') {
    const usedEmojis = new Set();
    for (const item of items) {
      if (!item.emoji) continue;
      const key = emojiKeyFromConfig(item.emoji);
      if (usedEmojis.has(key)) throw new Error('Jedes Reaction-Emoji darf innerhalb eines Panels nur einmal vorkommen.');
      usedEmojis.add(key);
    }
  }

  const color = /^#[0-9A-F]{6}$/i.test(String(input?.color || ''))
    ? String(input.color).toUpperCase()
    : '#5865F2';

  return {
    id,
    name: text(input?.name, 60) || 'Neues Rollen-Panel',
    enabled: input?.enabled !== false,
    channelId,
    mode,
    selectionMode,
    allowRemove: input?.allowRemove !== false,
    title: text(input?.title, 256) || 'Wähle deine Rollen',
    description: text(input?.description, 3500),
    color,
    placeholder: text(input?.placeholder, 150) || 'Rollen auswählen …',
    items,
    messageId: previous?.messageId || '',
    publishedChannelId: previous?.publishedChannelId || '',
    publishedAt: previous?.publishedAt || '',
    publishedMode: previous?.publishedMode || ''
  };
}

async function sanitizePanels(value, guild, currentPanels) {
  const panels = Array.isArray(value) ? value : [];
  if (panels.length > MAX_PANELS) throw new Error(`Maximal ${MAX_PANELS} Rollen-Panels pro Server.`);

  const me = await botMember(guild);
  if (!me) throw new Error('Bot-Mitglied konnte nicht geladen werden.');

  const previousById = new Map((currentPanels || []).map(panel => [panel.id, panel]));
  const result = [];
  for (const panel of panels) {
    const id = safeId(panel?.id, 'panel');
    result.push(await sanitizePanel({ ...panel, id }, guild, me, previousById.get(id)));
  }
  return result;
}

function validatePublishPanel(panel, guild, me) {
  if (!panel.enabled) throw new Error('Aktiviere dieses Panel zuerst.');
  if (!panel.channelId) throw new Error('Wähle zuerst einen Zielkanal.');
  if (!panel.items?.length) throw new Error('Füge mindestens eine Rolle hinzu.');
  if (!me?.permissions.has(PermissionFlagsBits.ManageRoles)) {
    throw new Error('Dem Bot fehlt die Berechtigung „Rollen verwalten“.');
  }
  if (panel.items.some(item => !item.roleId)) {
    throw new Error('Jeder Eintrag braucht eine Rolle.');
  }
  if (panel.mode === 'reactions' && panel.items.some(item => !item.emoji)) {
    throw new Error('Im Reaction-Modus braucht jede Rolle ein Emoji.');
  }
}

function emojiCodePoints(value) {
  return Array.from(String(value || ''))
    .map(char => `U+${char.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')}`)
    .join(' ');
}

function rejectedEmojiItemIndex(error, panel) {
  const message = String(error?.message || '');
  if (!message.includes('COMPONENT_INVALID_EMOJI')) return null;

  if (panel.mode === 'buttons') {
    const match = message.match(/components\[(\d+)\]\.components\[(\d+)\]\.emoji(?:\.name)?/i);
    if (!match) return null;
    return Number(match[1]) * 5 + Number(match[2]);
  }

  if (panel.mode === 'select') {
    const match = message.match(/components\[(\d+)\]\.components\[(\d+)\]\.options\[(\d+)\]\.emoji(?:\.name)?/i);
    if (!match) return null;
    const optionIndex = Number(match[3]);
    const itemIndex = panel.allowRemove !== false ? optionIndex - 1 : optionIndex;
    return itemIndex >= 0 ? itemIndex : null;
  }

  return null;
}

function clearItemEmoji(panel, itemIndex) {
  return {
    ...panel,
    items: panel.items.map((item, index) => index === itemIndex ? { ...item, emoji: '' } : item)
  };
}

async function deliverComponentPanel(channel, panel, existingMessage = null) {
  let safePanel = panel;
  const warnings = [];

  for (let attempt = 0; attempt <= panel.items.length; attempt += 1) {
    const payload = buildPanelPayload(safePanel);

    try {
      if (existingMessage) {
        await existingMessage.edit(payload);
        return { message: existingMessage, panel: safePanel, warnings };
      }

      const message = await channel.send(payload);
      return { message, panel: safePanel, warnings };
    } catch (error) {
      const itemIndex = rejectedEmojiItemIndex(error, safePanel);
      const item = Number.isInteger(itemIndex) ? safePanel.items[itemIndex] : null;

      if (!item?.emoji) throw error;

      const rejected = item.emoji;
      console.warn(
        `[ROLE STUDIO] Discord rejected emoji ${JSON.stringify(rejected)} ` +
        `(${emojiCodePoints(rejected)}) for "${item.label}" in ${channel.guild.name}; retrying without it.`
      );

      warnings.push(`Emoji ${rejected} bei „${item.label}“ wurde von Discord nicht akzeptiert und entfernt.`);
      safePanel = clearItemEmoji(safePanel, itemIndex);
    }
  }

  throw new Error('Das Rollen-Panel konnte wegen ungültiger Emojis nicht veröffentlicht werden.');
}

async function removePublishedMessage(guild, panel) {
  if (!panel?.messageId || !panel?.publishedChannelId) return;
  const oldChannel = guild.channels.cache.get(panel.publishedChannelId) ||
    await guild.channels.fetch(panel.publishedChannelId).catch(() => null);
  if (!oldChannel?.messages) return;

  const message = await oldChannel.messages.fetch(panel.messageId).catch(() => null);
  if (message) await message.delete().catch(() => null);
}

async function publishPanel(guild, panel) {
  const me = await botMember(guild);
  validatePublishPanel(panel, guild, me);

  const channel = guild.channels.cache.get(panel.channelId) ||
    await guild.channels.fetch(panel.channelId).catch(() => null);
  if (!channel || !botCanWrite(channel, me) || !channel.messages) {
    throw new Error('Der Zielkanal ist für den Bot nicht beschreibbar.');
  }

  const permissions = channel.permissionsFor(me);
  if (!permissions?.has(PermissionFlagsBits.EmbedLinks)) {
    throw new Error('Dem Bot fehlt in diesem Kanal „Links einbetten“.');
  }

  if (panel.mode === 'reactions') {
    if (!permissions.has(PermissionFlagsBits.AddReactions) || !permissions.has(PermissionFlagsBits.ReadMessageHistory)) {
      throw new Error('Für Reaction-Roles braucht der Bot „Reaktionen hinzufügen“ und „Nachrichtenverlauf anzeigen“.');
    }
  }

  for (const item of panel.items) {
    const role = await manageableRole(guild, me, item.roleId);
    if (!role) throw new Error(`Die Rolle „${item.label}“ kann der Bot nicht mehr verwalten.`);
  }

  let message = null;
  let publishedPanel = panel;
  let warnings = [];

  if (panel.mode !== 'reactions') {
    let existingMessage = null;

    if (panel.publishedMode === panel.mode && panel.messageId && panel.publishedChannelId === panel.channelId) {
      existingMessage = await channel.messages.fetch(panel.messageId).catch(() => null);
    }

    if (!existingMessage && panel.messageId) {
      await removePublishedMessage(guild, panel);
    }

    const delivered = await deliverComponentPanel(channel, panel, existingMessage);
    message = delivered.message;
    publishedPanel = delivered.panel;
    warnings = delivered.warnings;
  } else {
    const payload = buildPanelPayload(panel);
    if (panel.messageId) await removePublishedMessage(guild, panel);
    message = await channel.send(payload);

    try {
      for (const item of panel.items) {
        await message.react(reactionToken(item.emoji));
      }
    } catch (error) {
      await message.delete().catch(() => null);
      throw new Error(`Mindestens ein Reaction-Emoji konnte nicht gesetzt werden: ${error.message}`);
    }
  }

  return {
    panel: {
      ...publishedPanel,
      messageId: message.id,
      publishedChannelId: channel.id,
      publishedAt: new Date().toISOString(),
      publishedMode: panel.mode
    },
    warnings
  };
}

function reactionToken(value) {
  const raw = String(value || '').trim();
  const custom = raw.match(/^<a?:[A-Za-z0-9_]+:(\d{15,22})>$/);
  return custom ? custom[1] : raw;
}

function panelMessageUrl(guildId, panel) {
  if (!panel?.messageId || !panel?.publishedChannelId) return null;
  return `https://discord.com/channels/${guildId}/${panel.publishedChannelId}/${panel.messageId}`;
}

function attachRoleStudioApi(app) {
  app.patch('/api/guilds/:guildId/role-studio', requireRoleStudioAccess, async (req, res) => {
    const guild = client.guilds.cache.get(req.params.guildId);

    try {
      const current = getGuildSettings(guild.id);
      const currentPanels = Array.isArray(current.rolePanels?.panels) ? current.rolePanels.panels : [];
      const panels = await sanitizePanels(req.body?.panels, guild, currentPanels);
      const enabled = req.body?.enabled === undefined
        ? Boolean(current.rolePanels?.enabled)
        : Boolean(req.body.enabled);

      const settings = updateGuildSettings(
        guild.id,
        { rolePanels: { enabled, panels } },
        req.session.user.id
      );

      res.json({ ok: true, rolePanels: settings.rolePanels });
    } catch (error) {
      res.status(400).json({ error: 'invalid_role_studio', message: error.message });
    }
  });

  app.post('/api/guilds/:guildId/role-studio/:panelId/publish', requireRoleStudioAccess, async (req, res) => {
    const guild = client.guilds.cache.get(req.params.guildId);

    try {
      const settings = getGuildSettings(guild.id);
      if (!settings.rolePanels?.enabled) throw new Error('Aktiviere Role Studio zuerst.');

      const panels = Array.isArray(settings.rolePanels.panels) ? settings.rolePanels.panels : [];
      const index = panels.findIndex(panel => panel.id === req.params.panelId);
      if (index === -1) throw new Error('Dieses Rollen-Panel existiert nicht mehr.');

      const result = await publishPanel(guild, panels[index]);
      const published = result.panel;
      const nextPanels = panels.map((panel, panelIndex) => panelIndex === index ? published : panel);
      const next = updateGuildSettings(
        guild.id,
        { rolePanels: { enabled: true, panels: nextPanels } },
        req.session.user.id
      );

      res.json({
        ok: true,
        rolePanels: next.rolePanels,
        panel: published,
        warnings: result.warnings,
        messageUrl: panelMessageUrl(guild.id, published)
      });
    } catch (error) {
      console.warn(`[ROLE STUDIO] Publish failed in ${guild?.name || req.params.guildId}: ${error.message}`);
      res.status(400).json({ error: 'role_panel_publish_failed', message: error.message });
    }
  });

  app.post('/api/guilds/:guildId/role-studio/:panelId/unpublish', requireRoleStudioAccess, async (req, res) => {
    const guild = client.guilds.cache.get(req.params.guildId);

    try {
      const settings = getGuildSettings(guild.id);
      const panels = Array.isArray(settings.rolePanels?.panels) ? settings.rolePanels.panels : [];
      const index = panels.findIndex(panel => panel.id === req.params.panelId);
      if (index === -1) throw new Error('Dieses Rollen-Panel existiert nicht mehr.');

      await removePublishedMessage(guild, panels[index]);

      const cleared = {
        ...panels[index],
        messageId: '',
        publishedChannelId: '',
        publishedAt: '',
        publishedMode: ''
      };
      const nextPanels = panels.map((panel, panelIndex) => panelIndex === index ? cleared : panel);
      const next = updateGuildSettings(
        guild.id,
        { rolePanels: { enabled: Boolean(settings.rolePanels?.enabled), panels: nextPanels } },
        req.session.user.id
      );

      res.json({ ok: true, rolePanels: next.rolePanels, panel: cleared });
    } catch (error) {
      res.status(400).json({ error: 'role_panel_unpublish_failed', message: error.message });
    }
  });
}

module.exports = {
  attachRoleStudioApi,
  sanitizePanels
};
