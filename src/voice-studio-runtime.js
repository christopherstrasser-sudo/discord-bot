const {
  ChannelType,
  Events,
  PermissionFlagsBits
} = require('discord.js');
const {
  getVoiceConfig,
  listVoiceRooms,
  getVoiceRoom,
  findVoiceRoomByOwner,
  upsertVoiceRoom,
  removeVoiceRoom,
  nextVoiceSequence
} = require('./voice-studio-store');

const creating = new Set();
const cleanupTimers = new Map();
let attached = false;

function normalizeRoomName(value) {
  const cleaned = String(value || '')
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return (cleaned || 'Voice Room').slice(0, 100);
}

function renderRoomName(template, member, counter = 1) {
  const value = String(template || '🎧 {displayName}')
    .replaceAll('{displayName}', member?.displayName || member?.user?.globalName || member?.user?.username || 'Member')
    .replaceAll('{username}', member?.user?.username || 'member')
    .replaceAll('{counter}', String(counter));
  return normalizeRoomName(value);
}

function normalizeUserLimit(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(99, Math.trunc(n)));
}

function humanMembers(channel) {
  if (!channel?.members) return [];
  return [...channel.members.values()].filter(member => !member.user?.bot);
}

function roomIsEmpty(channel) {
  return humanMembers(channel).length === 0;
}

function clearCleanupTimer(channelId) {
  const timer = cleanupTimers.get(channelId);
  if (timer) clearTimeout(timer);
  cleanupTimers.delete(channelId);
}

async function botMember(guild) {
  return guild.members.me || guild.members.fetchMe().catch(() => null);
}

function hasRuntimePermissions(me) {
  return Boolean(
    me?.permissions.has(PermissionFlagsBits.ManageChannels) &&
    me?.permissions.has(PermissionFlagsBits.MoveMembers)
  );
}

async function applyOwnerControls(channel, ownerId, enabled) {
  if (!channel || !ownerId || !enabled) return;
  try {
    await channel.permissionOverwrites.edit(ownerId, {
      ViewChannel: true,
      Connect: true,
      ManageChannels: true,
      MoveMembers: true
    }, { reason: 'RAKU Voice Studio room owner controls' });
  } catch (error) {
    console.warn(`[VOICE] Could not grant owner controls in ${channel.name}: ${error.message}`);
  }
}

async function revokeOwnerControls(channel, ownerId) {
  if (!channel || !ownerId) return;
  try {
    await channel.permissionOverwrites.delete(ownerId, 'RAKU Voice Studio ownership transfer');
  } catch (error) {
    console.warn(`[VOICE] Could not revoke old owner controls in ${channel.name}: ${error.message}`);
  }
}

async function transferOwnership(channel, room, nextOwner, config) {
  if (!channel || !room || !nextOwner) return room;
  if (config.ownerControls) {
    await revokeOwnerControls(channel, room.ownerId);
    await applyOwnerControls(channel, nextOwner.id, true);
  }
  const updated = upsertVoiceRoom({
    ...room,
    ownerId: nextOwner.id,
    ownerTag: nextOwner.user?.tag || nextOwner.user?.username || nextOwner.id,
    transferredAt: new Date().toISOString()
  });
  console.log(`[VOICE] Ownership of ${channel.name} transferred to ${nextOwner.user?.tag || nextOwner.id}`);
  return updated;
}

async function deleteManagedRoom(channelId, reason = 'RAKU Voice Studio cleanup') {
  clearCleanupTimer(channelId);
  const room = getVoiceRoom(channelId);
  if (!room) return false;

  const client = module.exports._client;
  const guild = client?.guilds.cache.get(room.guildId);
  const channel = guild?.channels.cache.get(channelId) || await guild?.channels.fetch(channelId).catch(() => null);

  if (channel && !roomIsEmpty(channel)) return false;
  if (channel) {
    try {
      await channel.delete(reason);
    } catch (error) {
      console.warn(`[VOICE] Could not delete ${channel.name}: ${error.message}`);
      return false;
    }
  }

  removeVoiceRoom(channelId);
  console.log(`[VOICE] Removed temporary room ${room.name || channelId}`);
  return true;
}

function scheduleCleanup(channelId) {
  clearCleanupTimer(channelId);
  const room = getVoiceRoom(channelId);
  if (!room) return;
  const config = getVoiceConfig(room.guildId);
  const delayMs = Math.max(0, Math.min(300, Number(config.cleanupDelaySeconds || 0))) * 1000;

  const timer = setTimeout(async () => {
    cleanupTimers.delete(channelId);
    await deleteManagedRoom(channelId).catch(error => {
      console.warn(`[VOICE] Cleanup failed for ${channelId}: ${error.message}`);
    });
  }, delayMs);

  if (typeof timer.unref === 'function') timer.unref();
  cleanupTimers.set(channelId, timer);
}

async function resolveExistingOwnerRoom(guild, member, config) {
  const existing = findVoiceRoomByOwner(guild.id, member.id);
  if (!existing) return null;
  const channel = guild.channels.cache.get(existing.channelId) || await guild.channels.fetch(existing.channelId).catch(() => null);
  if (!channel || channel.type !== ChannelType.GuildVoice) {
    removeVoiceRoom(existing.channelId);
    return null;
  }

  const humans = humanMembers(channel);
  if (humans.length && !channel.members.has(member.id) && config.autoTransferOwner) {
    await transferOwnership(channel, existing, humans[0], config);
    return null;
  }

  return { room: existing, channel };
}

async function createRoomForVoiceState(state) {
  const member = state.member;
  const guild = state.guild;
  if (!member || member.user.bot) return;

  const config = getVoiceConfig(guild.id);
  if (!config.enabled || !config.lobbyChannelId || state.channelId !== config.lobbyChannelId) return;

  const key = `${guild.id}:${member.id}`;
  if (creating.has(key)) return;
  creating.add(key);

  try {
    const me = await botMember(guild);
    if (!hasRuntimePermissions(me)) {
      console.warn(`[VOICE] Missing Manage Channels or Move Members in ${guild.name}`);
      return;
    }

    const lobby = state.channel;
    if (!lobby || lobby.type !== ChannelType.GuildVoice) return;

    const existing = await resolveExistingOwnerRoom(guild, member, config);
    if (existing?.channel) {
      clearCleanupTimer(existing.channel.id);
      try {
        await state.setChannel(existing.channel, 'RAKU Voice Studio: return owner to existing room');
      } catch (error) {
        console.warn(`[VOICE] Could not move ${member.user.tag} to existing room: ${error.message}`);
      }
      return;
    }

    let parentId = config.categoryId || lobby.parentId || null;
    if (parentId) {
      const parent = guild.channels.cache.get(parentId) || await guild.channels.fetch(parentId).catch(() => null);
      if (!parent || parent.type !== ChannelType.GuildCategory) parentId = lobby.parentId || null;
    }

    const counter = nextVoiceSequence(guild.id);
    const name = renderRoomName(config.roomNameTemplate, member, counter);
    const userLimit = normalizeUserLimit(config.userLimit);
    const requestedBitrate = Number(config.bitrateKbps || 0) * 1000;
    const maxBitrate = Number(guild.maximumBitrate || 96000);
    const bitrate = requestedBitrate > 0
      ? Math.max(8000, Math.min(requestedBitrate, maxBitrate))
      : undefined;

    const channel = await guild.channels.create({
      name,
      type: ChannelType.GuildVoice,
      parent: parentId || undefined,
      userLimit,
      ...(bitrate ? { bitrate } : {}),
      reason: `RAKU Voice Studio room for ${member.user.tag}`
    });

    const room = upsertVoiceRoom({
      channelId: channel.id,
      guildId: guild.id,
      ownerId: member.id,
      ownerTag: member.user.tag,
      name: channel.name,
      createdAt: new Date().toISOString(),
      lobbyChannelId: config.lobbyChannelId
    });

    await applyOwnerControls(channel, member.id, config.ownerControls);

    try {
      await state.setChannel(channel, 'RAKU Voice Studio: create private room');
      console.log(`[VOICE] Created ${channel.name} for ${member.user.tag} in ${guild.name}`);
    } catch (error) {
      removeVoiceRoom(channel.id);
      await channel.delete('RAKU Voice Studio: rollback failed move').catch(() => null);
      console.warn(`[VOICE] Could not move ${member.user.tag}; rolled room back: ${error.message}`);
    }

    return room;
  } catch (error) {
    console.warn(`[VOICE] Room creation failed in ${guild.name}: ${error.message}`);
  } finally {
    creating.delete(key);
  }
}

async function handleManagedRoomLeave(oldState) {
  const room = getVoiceRoom(oldState.channelId);
  if (!room) return;
  const channel = oldState.channel;
  if (!channel) {
    removeVoiceRoom(oldState.channelId);
    return;
  }

  const humans = humanMembers(channel);
  if (!humans.length) {
    scheduleCleanup(channel.id);
    return;
  }

  if (room.ownerId === oldState.id) {
    const config = getVoiceConfig(room.guildId);
    if (config.autoTransferOwner) {
      await transferOwnership(channel, room, humans[0], config);
    }
  }
}

async function handleVoiceStateUpdate(oldState, newState) {
  if (newState.member?.user?.bot || oldState.member?.user?.bot) return;

  if (newState.channelId && getVoiceRoom(newState.channelId)) {
    clearCleanupTimer(newState.channelId);
  }

  if (oldState.channelId && oldState.channelId !== newState.channelId) {
    await handleManagedRoomLeave(oldState);
  }

  if (newState.channelId && oldState.channelId !== newState.channelId) {
    await createRoomForVoiceState(newState);
  }
}

async function reconcileVoiceRooms(client) {
  for (const guild of client.guilds.cache.values()) {
    for (const room of listVoiceRooms(guild.id)) {
      const channel = guild.channels.cache.get(room.channelId) || await guild.channels.fetch(room.channelId).catch(() => null);
      if (!channel || channel.type !== ChannelType.GuildVoice) {
        removeVoiceRoom(room.channelId);
        continue;
      }
      if (roomIsEmpty(channel)) scheduleCleanup(room.channelId);
    }
  }
}

function attachVoiceStudioRuntime(client) {
  if (attached) return;
  attached = true;
  module.exports._client = client;

  client.on(Events.VoiceStateUpdate, (oldState, newState) => {
    handleVoiceStateUpdate(oldState, newState).catch(error => console.warn(`[VOICE] Voice state handler failed: ${error.message}`));
  });

  client.on(Events.ChannelDelete, channel => {
    if (getVoiceRoom(channel.id)) {
      clearCleanupTimer(channel.id);
      removeVoiceRoom(channel.id);
    }
  });

  client.on(Events.ClientReady, readyClient => {
    reconcileVoiceRooms(readyClient).catch(error => console.warn(`[VOICE] Reconcile failed: ${error.message}`));
  });
}

module.exports = {
  attachVoiceStudioRuntime,
  reconcileVoiceRooms,
  deleteManagedRoom,
  renderRoomName,
  normalizeRoomName,
  normalizeUserLimit,
  roomIsEmpty,
  humanMembers,
  _client: null
};
