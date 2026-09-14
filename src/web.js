const crypto = require('crypto');
const path = require('path');
const express = require('express');
const session = require('express-session');
const { ChannelType, PermissionFlagsBits } = require('discord.js');
const config = require('./config');
const { client } = require('./bot');
const { getGuildSettings, updateGuildSettings } = require('./store');

const DISCORD_API = 'https://discord.com/api/v10';
const MANAGE_GUILD = 1n << 5n;
const ADMINISTRATOR = 1n << 3n;
const BOT_PERMISSIONS = 268561488n;
const TEST_MESSAGE_COOLDOWN_MS = 5000;
const testMessageCooldowns = new Map();

function canManageGuild(guild) {
  if (guild.owner) return true;
  const permissions = BigInt(guild.permissions || '0');
  return (permissions & MANAGE_GUILD) === MANAGE_GUILD ||
    (permissions & ADMINISTRATOR) === ADMINISTRATOR;
}

function avatarUrl(user) {
  if (!user.avatar) return null;
  return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=128`;
}

function guildIconUrl(guild) {
  if (!guild.icon) return null;
  return `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png?size=128`;
}

function botCanSend(channel, me) {
  if (!me || !channel) return false;
  const permissions = channel.permissionsFor(me);
  return Boolean(
    permissions?.has(PermissionFlagsBits.ViewChannel) &&
    permissions?.has(PermissionFlagsBits.SendMessages)
  );
}

async function discordRequest(pathname, accessToken) {
  const response = await fetch(`${DISCORD_API}${pathname}`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Discord API ${response.status}: ${body}`);
  }

  return response.json();
}

async function exchangeCode(code) {
  const body = new URLSearchParams({
    client_id: config.discord.clientId,
    client_secret: config.discord.clientSecret,
    grant_type: 'authorization_code',
    code,
    redirect_uri: config.discord.redirectUri
  });

  const response = await fetch(`${DISCORD_API}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Discord token exchange failed (${response.status}): ${text}`);
  }

  return response.json();
}

function requireAuth(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: 'not_authenticated' });
  next();
}

function sessionGuild(req, guildId) {
  return (req.session.guilds || []).find(guild => guild.id === guildId) || null;
}

function requireGuildAccess(req, res, next) {
  const guild = sessionGuild(req, req.params.guildId);
  if (!guild) return res.status(403).json({ error: 'guild_access_denied' });
  req.dashboardGuild = guild;
  next();
}

function sanitizeSettingsPatch(body, discordGuild) {
  const current = getGuildSettings(discordGuild.id);
  const patch = {};
  const me = discordGuild.members.me;

  if (body?.welcome && typeof body.welcome === 'object') {
    const enabled = Boolean(body.welcome.enabled);
    const channelId = String(body.welcome.channelId || '').trim();
    const message = String(body.welcome.message ?? current.welcome.message).trim().slice(0, 1800);

    if (enabled && !channelId) throw new Error('Für Welcome muss ein Kanal ausgewählt sein.');
    if (enabled && !message) throw new Error('Die Welcome-Nachricht darf nicht leer sein.');

    if (channelId) {
      const channel = discordGuild.channels.cache.get(channelId);
      const allowedType = channel && [ChannelType.GuildText, ChannelType.GuildAnnouncement].includes(channel.type);
      if (!allowedType || !botCanSend(channel, me)) {
        throw new Error('Der Bot kann in diesem Welcome-Kanal nicht schreiben. Prüfe die Kanalrechte.');
      }
    }

    patch.welcome = { enabled, channelId, message };
  }

  if (body?.autorole && typeof body.autorole === 'object') {
    const enabled = Boolean(body.autorole.enabled);
    const roleId = String(body.autorole.roleId || '').trim();

    if (enabled && !roleId) throw new Error('Für Auto-Role muss eine Rolle ausgewählt sein.');
    if (enabled && !me?.permissions.has(PermissionFlagsBits.ManageRoles)) {
      throw new Error('Dem Bot fehlt die Berechtigung „Rollen verwalten“.');
    }

    if (roleId) {
      const role = discordGuild.roles.cache.get(roleId);
      const manageable = role && !role.managed && role.id !== discordGuild.id && me && role.position < me.roles.highest.position;
      if (!manageable) throw new Error('Diese Rolle kann der Bot nicht vergeben. Prüfe die Rollen-Hierarchie.');
    }

    patch.autorole = { enabled, roleId };
  }

  if (body?.logging && typeof body.logging === 'object') {
    const enabled = Boolean(body.logging.enabled);
    const channelId = String(body.logging.channelId || '').trim();

    if (enabled && !channelId) throw new Error('Für Logging muss ein Kanal ausgewählt sein.');

    if (channelId) {
      const channel = discordGuild.channels.cache.get(channelId);
      const allowedType = channel && [ChannelType.GuildText, ChannelType.GuildAnnouncement].includes(channel.type);
      if (!allowedType || !botCanSend(channel, me)) {
        throw new Error('Der Bot kann in diesem Log-Kanal nicht schreiben. Prüfe die Kanalrechte.');
      }
    }

    patch.logging = { enabled, channelId };
  }

  if (body?.customCommands && typeof body.customCommands === 'object') {
    patch.customCommands = { enabled: Boolean(body.customCommands.enabled) };
  }

  return patch;
}

function dashboardPayload(sessionGuildData) {
  const discordGuild = client.guilds.cache.get(sessionGuildData.id);
  const botInstalled = Boolean(discordGuild);

  if (!discordGuild) {
    return {
      guild: {
        ...sessionGuildData,
        iconUrl: guildIconUrl(sessionGuildData),
        botInstalled: false
      },
      settings: getGuildSettings(sessionGuildData.id),
      channels: [],
      roles: []
    };
  }

  const me = discordGuild.members.me;

  const channels = discordGuild.channels.cache
    .filter(channel =>
      [ChannelType.GuildText, ChannelType.GuildAnnouncement].includes(channel.type) &&
      botCanSend(channel, me)
    )
    .map(channel => ({
      id: channel.id,
      name: channel.name,
      parent: channel.parent?.name || null,
      position: channel.rawPosition
    }))
    .sort((a, b) => a.position - b.position || a.name.localeCompare(b.name, 'de'));

  const canManageRoles = Boolean(me?.permissions.has(PermissionFlagsBits.ManageRoles));
  const highestBotRole = me?.roles.highest.position ?? 0;
  const roles = canManageRoles
    ? discordGuild.roles.cache
        .filter(role => role.id !== discordGuild.id && !role.managed && role.position < highestBotRole)
        .map(role => ({
          id: role.id,
          name: role.name,
          color: role.hexColor,
          position: role.position
        }))
        .sort((a, b) => b.position - a.position)
    : [];

  return {
    guild: {
      id: discordGuild.id,
      name: discordGuild.name,
      iconUrl: discordGuild.iconURL({ size: 128 }) || guildIconUrl(sessionGuildData),
      memberCount: discordGuild.memberCount,
      owner: Boolean(sessionGuildData.owner),
      botInstalled
    },
    capabilities: {
      canManageRoles,
      writableChannels: channels.length
    },
    settings: getGuildSettings(discordGuild.id),
    channels,
    roles
  };
}

function createWebApp() {
  const app = express();
  const isHttps = config.publicBaseUrl.startsWith('https://');

  if (isHttps) app.set('trust proxy', 1);

  app.use(express.json({ limit: '64kb' }));
  app.use(session({
    name: 'raku.sid',
    secret: config.sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: isHttps,
      maxAge: 1000 * 60 * 60 * 24 * 7
    }
  }));

  app.get('/health', (_req, res) => {
    res.json({
      ok: true,
      botReady: client.isReady(),
      guilds: client.guilds.cache.size
    });
  });

  app.get('/auth/discord', (req, res) => {
    const state = crypto.randomBytes(24).toString('hex');
    req.session.oauthState = state;

    const query = new URLSearchParams({
      client_id: config.discord.clientId,
      response_type: 'code',
      redirect_uri: config.discord.redirectUri,
      scope: 'identify guilds',
      state,
      prompt: 'none'
    });

    res.redirect(`https://discord.com/oauth2/authorize?${query.toString()}`);
  });

  app.get('/auth/discord/callback', async (req, res) => {
    try {
      const { code, state, error } = req.query;

      if (error) return res.redirect('/?login=cancelled');
      if (!code || !state || state !== req.session.oauthState) {
        return res.status(400).send('Invalid Discord OAuth state. Please return to the dashboard and try again.');
      }

      delete req.session.oauthState;

      const token = await exchangeCode(code);
      const [user, guilds] = await Promise.all([
        discordRequest('/users/@me', token.access_token),
        discordRequest('/users/@me/guilds', token.access_token)
      ]);

      req.session.user = {
        id: user.id,
        username: user.global_name || user.username,
        discordUsername: user.username,
        avatar: avatarUrl(user)
      };

      req.session.guilds = guilds
        .filter(canManageGuild)
        .map(guild => ({
          id: guild.id,
          name: guild.name,
          icon: guild.icon,
          owner: Boolean(guild.owner),
          permissions: guild.permissions
        }))
        .sort((a, b) => a.name.localeCompare(b.name, 'de'));

      res.redirect('/');
    } catch (error) {
      console.error('[WEB] OAuth callback failed:', error.message);
      res.redirect('/?login=failed');
    }
  });

  app.post('/auth/logout', (req, res) => {
    req.session.destroy(() => res.status(204).end());
  });

  app.get('/api/session', (req, res) => {
    res.json({ authenticated: Boolean(req.session.user), user: req.session.user || null });
  });

  app.get('/api/guilds', requireAuth, (req, res) => {
    const guilds = (req.session.guilds || []).map(guild => {
      const botInstalled = client.guilds.cache.has(guild.id);
      const invite = new URL('https://discord.com/oauth2/authorize');
      invite.searchParams.set('client_id', config.discord.clientId);
      invite.searchParams.set('scope', 'bot applications.commands');
      invite.searchParams.set('permissions', BOT_PERMISSIONS.toString());
      invite.searchParams.set('guild_id', guild.id);
      invite.searchParams.set('disable_guild_select', 'true');

      return {
        ...guild,
        iconUrl: guildIconUrl(guild),
        botInstalled,
        manageUrl: botInstalled ? `/guild/${guild.id}` : null,
        inviteUrl: botInstalled ? null : invite.toString()
      };
    });

    res.json({ guilds });
  });

  app.get('/api/guilds/:guildId/dashboard', requireAuth, requireGuildAccess, (req, res) => {
    res.json(dashboardPayload(req.dashboardGuild));
  });

  app.post('/api/guilds/:guildId/test-message', requireAuth, requireGuildAccess, async (req, res) => {
    const discordGuild = client.guilds.cache.get(req.params.guildId);
    if (!discordGuild) return res.status(409).json({ error: 'bot_not_installed', message: 'Der Bot ist auf diesem Server nicht verbunden.' });

    const channelId = String(req.body?.channelId || '').trim();
    if (!channelId) return res.status(400).json({ error: 'channel_required', message: 'Bitte wähle zuerst einen Kanal aus.' });

    const channel = discordGuild.channels.cache.get(channelId) ||
      await discordGuild.channels.fetch(channelId).catch(() => null);
    const me = discordGuild.members.me || await discordGuild.members.fetchMe().catch(() => null);
    const allowedType = channel && [ChannelType.GuildText, ChannelType.GuildAnnouncement].includes(channel.type);

    if (!allowedType || !botCanSend(channel, me) || typeof channel.send !== 'function') {
      return res.status(400).json({
        error: 'channel_not_writable',
        message: 'Der Bot kann in diesem Kanal nicht schreiben.'
      });
    }

    const cooldownKey = `${req.session.user.id}:${discordGuild.id}`;
    const now = Date.now();
    const lastSentAt = testMessageCooldowns.get(cooldownKey) || 0;
    const remaining = TEST_MESSAGE_COOLDOWN_MS - (now - lastSentAt);

    if (remaining > 0) {
      return res.status(429).json({
        error: 'test_message_cooldown',
        message: `Bitte warte noch ${Math.ceil(remaining / 1000)} Sekunde(n).`
      });
    }

    try {
      const message = await channel.send({
        content: '✅ **RAKU Bot Test erfolgreich**\nVerbindung und Schreibrechte für diesen Kanal funktionieren.',
        allowedMentions: { parse: [] }
      });
      testMessageCooldowns.set(cooldownKey, now);
      console.log(`[TEST] Test message sent to #${channel.name} in ${discordGuild.name} by dashboard user ${req.session.user.id}`);
      res.json({ ok: true, channelId: channel.id, channelName: channel.name, messageId: message.id });
    } catch (error) {
      console.warn(`[TEST] Could not send test message in ${discordGuild.name}: ${error.message}`);
      res.status(500).json({ error: 'send_failed', message: 'Die Testnachricht konnte nicht gesendet werden.' });
    }
  });

  app.patch('/api/guilds/:guildId/settings', requireAuth, requireGuildAccess, (req, res) => {
    const discordGuild = client.guilds.cache.get(req.params.guildId);
    if (!discordGuild) return res.status(409).json({ error: 'bot_not_installed' });

    try {
      const patch = sanitizeSettingsPatch(req.body, discordGuild);
      const settings = updateGuildSettings(discordGuild.id, patch, req.session.user.id);
      res.json({ ok: true, settings });
    } catch (error) {
      res.status(400).json({ error: 'invalid_settings', message: error.message });
    }
  });

  app.get('/guild/:guildId', (_req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
  });

  app.use(express.static(path.join(__dirname, '..', 'public')));

  return app;
}

async function startWeb() {
  const app = createWebApp();
  return new Promise(resolve => {
    const server = app.listen(config.port, '0.0.0.0', () => {
      console.log(`[WEB] Dashboard: ${config.publicBaseUrl}`);
      console.log(`[WEB] Discord callback: ${config.discord.redirectUri}`);
      resolve(server);
    });
  });
}

module.exports = { createWebApp, startWeb };
