const {
  ChannelType,
  PermissionFlagsBits
} = require('discord.js');
const config = require('./config');
const { client } = require('./bot');
const {
  getVoiceConfig,
  updateVoiceConfig,
  listVoiceRooms,
  getVoiceRoom
} = require('./voice-studio-store');
const { deleteManagedRoom, normalizeUserLimit } = require('./voice-studio-runtime');

const VOICE_BOT_PERMISSIONS = 286387280n;

function requireVoiceStudioAccess(req, res, next) {
  if (!req.session?.user) {
    return res.status(401).json({ error: 'not_authenticated', message: 'Nicht angemeldet.' });
  }
  const access = (req.session.guilds || []).find(guild => guild.id === req.params.guildId);
  if (!access) {
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

function permissionUpgradeUrl(guildId) {
  const url = new URL('https://discord.com/oauth2/authorize');
  url.searchParams.set('client_id', config.discord.clientId);
  url.searchParams.set('scope', 'bot applications.commands');
  url.searchParams.set('permissions', VOICE_BOT_PERMISSIONS.toString());
  url.searchParams.set('guild_id', guildId);
  url.searchParams.set('disable_guild_select', 'true');
  return url.toString();
}

function categoriesForGuild(guild) {
  return guild.channels.cache
    .filter(channel => channel.type === ChannelType.GuildCategory)
    .map(channel => ({ id: channel.id, name: channel.name, position: channel.rawPosition }))
    .sort((a, b) => a.position - b.position || a.name.localeCompare(b.name, 'de'));
}

function voiceChannelsForGuild(guild) {
  const managed = new Set(listVoiceRooms(guild.id).map(room => room.channelId));
  return guild.channels.cache
    .filter(channel => channel.type === ChannelType.GuildVoice && !managed.has(channel.id))
    .map(channel => ({
      id: channel.id,
      name: channel.name,
      parentId: channel.parentId || '',
      parent: channel.parent?.name || null,
      position: channel.rawPosition,
      userLimit: channel.userLimit || 0
    }))
    .sort((a, b) => a.position - b.position || a.name.localeCompare(b.name, 'de'));
}

async function activeRoomsForGuild(guild) {
  const result = [];
  for (const room of listVoiceRooms(guild.id)) {
    const channel = guild.channels.cache.get(room.channelId) || await guild.channels.fetch(room.channelId).catch(() => null);
    if (!channel || channel.type !== ChannelType.GuildVoice) continue;
    const owner = guild.members.cache.get(room.ownerId) || await guild.members.fetch(room.ownerId).catch(() => null);
    const humans = [...channel.members.values()].filter(member => !member.user.bot);
    result.push({
      channelId: channel.id,
      name: channel.name,
      ownerId: room.ownerId,
      ownerName: owner?.displayName || owner?.user?.globalName || owner?.user?.username || room.ownerTag || room.ownerId,
      members: humans.length,
      userLimit: channel.userLimit || 0,
      createdAt: room.createdAt || null
    });
  }
  return result.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
}

async function voiceMeta(guild) {
  const me = await botMember(guild);
  const canManageChannels = Boolean(me?.permissions.has(PermissionFlagsBits.ManageChannels));
  const canMoveMembers = Boolean(me?.permissions.has(PermissionFlagsBits.MoveMembers));
  const canConnect = Boolean(me?.permissions.has(PermissionFlagsBits.Connect));
  const canViewChannels = Boolean(me?.permissions.has(PermissionFlagsBits.ViewChannel));
  const maxBitrateKbps = Math.max(8, Math.floor(Number(guild.maximumBitrate || 96000) / 1000));

  return {
    voiceChannels: voiceChannelsForGuild(guild),
    categories: categoriesForGuild(guild),
    rooms: await activeRoomsForGuild(guild),
    capabilities: {
      canManageChannels,
      canMoveMembers,
      canConnect,
      canViewChannels,
      ready: canManageChannels && canMoveMembers
    },
    maxBitrateKbps,
    permissionUpgradeUrl: permissionUpgradeUrl(guild.id)
  };
}

function integer(value, fallback, min, max) {
  const n = Number(value);
  if (!Number.isInteger(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

async function sanitizeVoiceConfig(input, guild, current) {
  const me = await botMember(guild);
  if (!me) throw new Error('Bot-Mitglied konnte nicht geladen werden.');

  const enabled = input?.enabled === undefined ? Boolean(current.enabled) : Boolean(input.enabled);
  const lobbyChannelId = String(input?.lobbyChannelId ?? current.lobbyChannelId ?? '').trim();
  const categoryId = String(input?.categoryId ?? current.categoryId ?? '').trim();
  const roomNameTemplate = String(input?.roomNameTemplate ?? current.roomNameTemplate ?? '🎧 {displayName}')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim()
    .slice(0, 100);
  const userLimit = normalizeUserLimit(input?.userLimit ?? current.userLimit);
  const cleanupDelaySeconds = integer(input?.cleanupDelaySeconds, Number(current.cleanupDelaySeconds || 8), 0, 300);
  const ownerControls = input?.ownerControls === undefined ? current.ownerControls !== false : Boolean(input.ownerControls);
  const autoTransferOwner = input?.autoTransferOwner === undefined ? current.autoTransferOwner !== false : Boolean(input.autoTransferOwner);
  const maxBitrateKbps = Math.max(8, Math.floor(Number(guild.maximumBitrate || 96000) / 1000));
  let bitrateKbps = integer(input?.bitrateKbps, Number(current.bitrateKbps || 0), 0, maxBitrateKbps);
  if (bitrateKbps > 0 && bitrateKbps < 8) bitrateKbps = 8;

  if (!roomNameTemplate) throw new Error('Das Namensschema für neue Voice-Räume darf nicht leer sein.');

  if (lobbyChannelId) {
    const lobby = guild.channels.cache.get(lobbyChannelId) || await guild.channels.fetch(lobbyChannelId).catch(() => null);
    if (!lobby || lobby.type !== ChannelType.GuildVoice) {
      throw new Error('Der ausgewählte Creator-Kanal ist kein gültiger Voice-Channel.');
    }
    if (getVoiceRoom(lobbyChannelId)) {
      throw new Error('Ein temporärer Voice-Raum kann nicht als Creator-Kanal verwendet werden.');
    }
  }

  if (categoryId) {
    const category = guild.channels.cache.get(categoryId) || await guild.channels.fetch(categoryId).catch(() => null);
    if (!category || category.type !== ChannelType.GuildCategory) {
      throw new Error('Die ausgewählte Zielkategorie existiert nicht mehr.');
    }
    const perms = category.permissionsFor(me);
    if (!perms?.has(PermissionFlagsBits.ManageChannels)) {
      throw new Error('Der Bot kann in dieser Kategorie keine Voice-Channels verwalten.');
    }
  }

  if (enabled && !lobbyChannelId) {
    throw new Error('Wähle zuerst den Voice-Kanal, über den neue Räume erstellt werden.');
  }
  if (enabled && !me.permissions.has(PermissionFlagsBits.ManageChannels)) {
    throw new Error('Voice Studio braucht die Bot-Berechtigung „Kanäle verwalten“.');
  }
  if (enabled && !me.permissions.has(PermissionFlagsBits.MoveMembers)) {
    throw new Error('Voice Studio braucht die Bot-Berechtigung „Mitglieder verschieben“.');
  }

  return {
    enabled,
    lobbyChannelId,
    categoryId,
    roomNameTemplate,
    userLimit,
    bitrateKbps,
    cleanupDelaySeconds,
    ownerControls,
    autoTransferOwner
  };
}

function sanitizeLobbyName(value) {
  const name = String(value || '➕ Eigenen Voice erstellen')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100);
  return name || '➕ Eigenen Voice erstellen';
}

function attachVoiceStudioApi(app) {
  app.get('/api/guilds/:guildId/voice-studio', requireVoiceStudioAccess, async (req, res) => {
    const guild = client.guilds.cache.get(req.params.guildId);
    try {
      res.json({
        ok: true,
        config: getVoiceConfig(guild.id),
        meta: await voiceMeta(guild)
      });
    } catch (error) {
      res.status(500).json({ error: 'voice_studio_load_failed', message: error.message });
    }
  });

  app.patch('/api/guilds/:guildId/voice-studio', requireVoiceStudioAccess, async (req, res) => {
    const guild = client.guilds.cache.get(req.params.guildId);
    try {
      const current = getVoiceConfig(guild.id);
      const next = await sanitizeVoiceConfig(req.body || {}, guild, current);
      const saved = updateVoiceConfig(guild.id, next, req.session.user.id);
      res.json({ ok: true, config: saved, meta: await voiceMeta(guild) });
    } catch (error) {
      res.status(400).json({ error: 'invalid_voice_studio', message: error.message });
    }
  });

  app.post('/api/guilds/:guildId/voice-studio/create-lobby', requireVoiceStudioAccess, async (req, res) => {
    const guild = client.guilds.cache.get(req.params.guildId);
    try {
      const me = await botMember(guild);
      if (!me?.permissions.has(PermissionFlagsBits.ManageChannels)) {
        throw new Error('Zum automatischen Anlegen braucht der Bot „Kanäle verwalten“.');
      }

      const categoryId = String(req.body?.categoryId || '').trim();
      let parent = null;
      if (categoryId) {
        parent = guild.channels.cache.get(categoryId) || await guild.channels.fetch(categoryId).catch(() => null);
        if (!parent || parent.type !== ChannelType.GuildCategory) throw new Error('Die Zielkategorie ist ungültig.');
        if (!parent.permissionsFor(me)?.has(PermissionFlagsBits.ManageChannels)) {
          throw new Error('Der Bot kann in dieser Kategorie keine Kanäle anlegen.');
        }
      }

      const channel = await guild.channels.create({
        name: sanitizeLobbyName(req.body?.name),
        type: ChannelType.GuildVoice,
        parent: parent?.id || undefined,
        userLimit: 0,
        reason: `RAKU Voice Studio lobby created by dashboard user ${req.session.user.id}`
      });

      const current = getVoiceConfig(guild.id);
      const saved = updateVoiceConfig(guild.id, {
        ...current,
        lobbyChannelId: channel.id,
        categoryId: categoryId || current.categoryId || ''
      }, req.session.user.id);

      res.json({ ok: true, channel: { id: channel.id, name: channel.name }, config: saved, meta: await voiceMeta(guild) });
    } catch (error) {
      res.status(400).json({ error: 'voice_lobby_create_failed', message: error.message });
    }
  });

  app.delete('/api/guilds/:guildId/voice-studio/rooms/:channelId', requireVoiceStudioAccess, async (req, res) => {
    const room = getVoiceRoom(req.params.channelId);
    if (!room || room.guildId !== req.params.guildId) {
      return res.status(404).json({ error: 'voice_room_not_found', message: 'Dieser temporäre Raum wird nicht mehr verwaltet.' });
    }

    try {
      const deleted = await deleteManagedRoom(req.params.channelId, 'RAKU Voice Studio: empty room cleanup from dashboard');
      if (!deleted) {
        return res.status(409).json({ error: 'voice_room_not_empty', message: 'Ein belegter Voice-Raum wird aus Sicherheitsgründen nicht gelöscht.' });
      }
      const guild = client.guilds.cache.get(req.params.guildId);
      res.json({ ok: true, meta: await voiceMeta(guild) });
    } catch (error) {
      res.status(400).json({ error: 'voice_room_cleanup_failed', message: error.message });
    }
  });
}

module.exports = {
  attachVoiceStudioApi,
  sanitizeVoiceConfig,
  voiceMeta,
  VOICE_BOT_PERMISSIONS
};
