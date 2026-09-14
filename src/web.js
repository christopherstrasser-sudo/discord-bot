const crypto = require('crypto');
const path = require('path');
const express = require('express');
const session = require('express-session');
const config = require('./config');
const { client } = require('./bot');

const DISCORD_API = 'https://discord.com/api/v10';
const MANAGE_GUILD = 1n << 5n;
const ADMINISTRATOR = 1n << 3n;
const BASIC_BOT_PERMISSIONS = 84992n; // View Channels, Send Messages, Embed Links, Read Message History

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

function createWebApp() {
  const app = express();
  const isHttps = config.publicBaseUrl.startsWith('https://');

  if (isHttps) app.set('trust proxy', 1);

  app.use(express.json());
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

  app.get('/api/guilds', (req, res) => {
    if (!req.session.user) return res.status(401).json({ error: 'not_authenticated' });

    const guilds = (req.session.guilds || []).map(guild => {
      const botInstalled = client.guilds.cache.has(guild.id);
      const invite = new URL('https://discord.com/oauth2/authorize');
      invite.searchParams.set('client_id', config.discord.clientId);
      invite.searchParams.set('scope', 'bot applications.commands');
      invite.searchParams.set('permissions', BASIC_BOT_PERMISSIONS.toString());
      invite.searchParams.set('guild_id', guild.id);
      invite.searchParams.set('disable_guild_select', 'true');

      return {
        ...guild,
        botInstalled,
        inviteUrl: botInstalled ? null : invite.toString()
      };
    });

    res.json({ guilds });
  });

  app.use(express.static(path.join(__dirname, '..', 'public')));

  return app;
}

async function startWeb() {
  const app = createWebApp();
  return new Promise(resolve => {
    const server = app.listen(config.port, () => {
      console.log(`[WEB] Dashboard: ${config.publicBaseUrl}`);
      console.log(`[WEB] Discord callback: ${config.discord.redirectUri}`);
      resolve(server);
    });
  });
}

module.exports = { createWebApp, startWeb };
