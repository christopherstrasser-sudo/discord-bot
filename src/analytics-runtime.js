const { Events } = require('discord.js');
const { getAnalyticsConfig, recordAnalyticsEvent } = require('./analytics-store');

const voiceSessions = new Map();

function enabled(guildId) {
  try { return Boolean(getAnalyticsConfig(guildId).enabled); } catch { return false; }
}

function voiceKey(guildId, userId) {
  return `${guildId}:${userId}`;
}

function humanVoiceCount(guild) {
  let count = 0;
  for (const state of guild.voiceStates.cache.values()) {
    if (!state.channelId || state.member?.user?.bot) continue;
    count += 1;
  }
  return count;
}

function seedVoiceSessions(client) {
  const now = Date.now();
  for (const guild of client.guilds.cache.values()) {
    if (!enabled(guild.id)) continue;
    for (const state of guild.voiceStates.cache.values()) {
      if (!state.channelId || state.member?.user?.bot) continue;
      voiceSessions.set(voiceKey(guild.id, state.id), { channelId: state.channelId, startedAt: now });
    }
    recordAnalyticsEvent(guild.id, 'voice_peak', { count: humanVoiceCount(guild) });
  }
}

function attachAnalyticsRuntime(client) {
  client.once(Events.ClientReady, () => seedVoiceSessions(client));

  client.on(Events.MessageCreate, message => {
    if (!message?.guild || message.author?.bot || message.webhookId) return;
    recordAnalyticsEvent(message.guild.id, 'message', { channelId: message.channelId });
  });

  client.on(Events.GuildMemberAdd, member => {
    if (member.user?.bot) return;
    recordAnalyticsEvent(member.guild.id, 'join');
  });

  client.on(Events.GuildMemberRemove, member => {
    if (member.user?.bot) return;
    recordAnalyticsEvent(member.guild.id, 'leave');
    voiceSessions.delete(voiceKey(member.guild.id, member.id));
  });

  client.on(Events.GuildBanAdd, ban => recordAnalyticsEvent(ban.guild.id, 'moderation', { kind: 'ban' }));
  client.on(Events.GuildBanRemove, ban => recordAnalyticsEvent(ban.guild.id, 'moderation', { kind: 'unban' }));

  client.on(Events.GuildMemberUpdate, (oldMember, newMember) => {
    if (newMember.user?.bot) return;
    const before = oldMember.communicationDisabledUntilTimestamp || 0;
    const after = newMember.communicationDisabledUntilTimestamp || 0;
    if (before !== after) recordAnalyticsEvent(newMember.guild.id, 'moderation', { kind: after > Date.now() ? 'timeout' : 'timeout_end' });
  });

  client.on(Events.VoiceStateUpdate, (oldState, newState) => {
    const member = newState.member || oldState.member;
    if (!member || member.user?.bot) return;
    const guildId = newState.guild.id;
    const userId = member.id;
    const key = voiceKey(guildId, userId);
    const oldChannelId = oldState.channelId || null;
    const newChannelId = newState.channelId || null;
    if (oldChannelId === newChannelId) return;

    const previous = voiceSessions.get(key);
    if (oldChannelId && previous?.startedAt) {
      const elapsedMs = Math.max(0, Date.now() - previous.startedAt);
      if (elapsedMs >= 5000) {
        recordAnalyticsEvent(guildId, 'voice_session', {
          channelId: previous.channelId || oldChannelId,
          minutes: elapsedMs / 60000
        });
      }
    }

    if (newChannelId) voiceSessions.set(key, { channelId: newChannelId, startedAt: Date.now() });
    else voiceSessions.delete(key);

    recordAnalyticsEvent(guildId, 'voice_peak', { count: humanVoiceCount(newState.guild) });
  });
}

module.exports = {
  attachAnalyticsRuntime,
  humanVoiceCount
};
