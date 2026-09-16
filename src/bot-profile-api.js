const { PermissionFlagsBits } = require('discord.js');
const config = require('./config');
const { client } = require('./bot');
const { getGuildSettings, updateGuildSettings } = require('./store');
const {
  guildMemberAvatarUrl,
  sanitizeBotProfileInput
} = require('./bot-profile-utils');

const DISCORD_API = 'https://discord.com/api/v10';

function access(req, res, next) {
  if (!req.session?.user) return res.status(401).json({ error: 'not_authenticated', message: 'Nicht angemeldet.' });
  const allowed = (req.session.guilds || []).some(guild => guild.id === req.params.guildId);
  if (!allowed) return res.status(403).json({ error: 'guild_access_denied', message: 'Kein Zugriff auf diesen Server.' });
  const guild = client.guilds.cache.get(req.params.guildId);
  if (!guild) return res.status(409).json({ error: 'bot_not_installed', message: 'Der Bot ist auf diesem Server nicht verbunden.' });
  req.botProfileGuild = guild;
  next();
}

async function discordBotRequest(pathname, options = {}) {
  const response = await fetch(`${DISCORD_API}${pathname}`, {
    ...options,
    headers: {
      Authorization: `Bot ${config.discord.botToken}`,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
  const text = await response.text();
  let payload = null;
  try { payload = text ? JSON.parse(text) : null; } catch {}
  if (!response.ok) {
    const message = payload?.message || text || `Discord API ${response.status}`;
    const error = new Error(message);
    error.status = response.status;
    error.code = payload?.code;
    throw error;
  }
  return payload;
}

function globalAvatarUrl() {
  return client.user?.displayAvatarURL?.({ size: 256 }) || '';
}

function profilePayload(guild, member, stored = {}) {
  const userId = client.user?.id || member?.user?.id || '';
  const serverAvatarHash = String(member?.avatar || stored.avatarHash || '');
  const nickname = String(member?.nick ?? stored.nickname ?? '');
  const bio = typeof member?.bio === 'string' ? member.bio : String(stored.bio || '');
  const me = guild.members.me;
  const canChangeNickname = Boolean(me?.permissions?.has(PermissionFlagsBits.ChangeNickname));

  return {
    nickname,
    effectiveName: nickname || client.user?.username || 'Bot',
    bio,
    avatarHash: serverAvatarHash,
    avatarUrl: guildMemberAvatarUrl(guild.id, userId, serverAvatarHash) || globalAvatarUrl(),
    globalAvatarUrl: globalAvatarUrl(),
    hasServerAvatar: Boolean(serverAvatarHash),
    canChangeNickname,
    activity: {
      editable: false,
      scope: 'global',
      reason: 'Discord-Presence ist bei einem Shared Bot global und kann nicht pro Server gesetzt werden.'
    }
  };
}

async function fetchCurrentMember(guild) {
  try {
    return await discordBotRequest(`/guilds/${guild.id}/members/${client.user.id}`, { method: 'GET' });
  } catch {
    const me = guild.members.me || await guild.members.fetchMe().catch(() => null);
    if (!me) throw new Error('Bot-Profil konnte nicht geladen werden.');
    return {
      user: { id: client.user.id },
      nick: me.nickname || null,
      avatar: me.avatar || null
    };
  }
}

async function getBotProfile(guild) {
  const stored = getGuildSettings(guild.id).botProfile || {};
  const member = await fetchCurrentMember(guild);
  return profilePayload(guild, member, stored);
}

function mapDiscordProfileError(error) {
  if (error?.status === 403 || error?.code === 50013) {
    return 'Discord verweigert die Profiländerung. Für den Server-Namen braucht die Bot-Rolle „Nickname ändern“.';
  }
  if (error?.status === 429) return 'Discord limitiert Profiländerungen gerade. Bitte warte kurz und versuche es erneut.';
  return `Discord konnte das Bot-Profil nicht aktualisieren: ${error.message}`;
}

function attachBotProfileApi(app) {
  app.get('/api/guilds/:guildId/bot-profile', access, async (req, res) => {
    try {
      res.json({ profile: await getBotProfile(req.botProfileGuild) });
    } catch (error) {
      res.status(400).json({ error: 'bot_profile_load_failed', message: error.message });
    }
  });

  app.patch('/api/guilds/:guildId/bot-profile', access, async (req, res) => {
    const guild = req.botProfileGuild;
    try {
      const input = sanitizeBotProfileInput(req.body || {});
      const currentMember = await fetchCurrentMember(guild);
      const stored = getGuildSettings(guild.id).botProfile || {};
      const requestedNickname = input.hasNickname ? input.nickname : String(currentMember.nick || stored.nickname || '');
      const currentNickname = String(currentMember.nick || '');
      const me = guild.members.me || await guild.members.fetchMe().catch(() => null);

      if (requestedNickname !== currentNickname && !me?.permissions?.has(PermissionFlagsBits.ChangeNickname)) {
        return res.status(400).json({
          error: 'change_nickname_permission_missing',
          message: 'Der Bot-Rolle fehlt „Nickname ändern“. Avatar und Bio sind serverbezogen möglich, für den Namen braucht Discord diese Berechtigung.'
        });
      }

      const patch = {};
      if (input.hasNickname) patch.nick = input.nickname || null;
      if (input.hasBio) patch.bio = input.bio || null;
      if (input.resetAvatar) patch.avatar = null;
      else if (input.avatarData) patch.avatar = input.avatarData;

      if (!Object.keys(patch).length) return res.json({ ok: true, profile: profilePayload(guild, currentMember, stored) });

      let updated;
      try {
        updated = await discordBotRequest(`/guilds/${guild.id}/members/@me`, {
          method: 'PATCH',
          body: JSON.stringify(patch),
          headers: { 'X-Audit-Log-Reason': encodeURIComponent(`Bot-Profil via RAKU Dashboard von ${req.session.user.id}`) }
        });
      } catch (error) {
        throw new Error(mapDiscordProfileError(error));
      }

      const savedSettings = updateGuildSettings(guild.id, {
        botProfile: {
          nickname: String(updated?.nick || ''),
          bio: input.hasBio ? input.bio : String(stored.bio || ''),
          avatarHash: String(updated?.avatar || '')
        }
      }, req.session.user.id);

      await guild.members.fetchMe({ force: true }).catch(() => null);
      const profile = profilePayload(guild, updated, savedSettings.botProfile);
      res.json({ ok: true, profile });
    } catch (error) {
      res.status(400).json({ error: 'bot_profile_update_failed', message: error.message });
    }
  });
}

module.exports = { attachBotProfileApi, getBotProfile };