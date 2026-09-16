const { ChannelType } = require('discord.js');
const { client } = require('./bot');
const {
  getAnalyticsConfig,
  updateAnalyticsConfig,
  clearAnalyticsData,
  getAnalyticsSnapshot,
  flushAnalyticsStore
} = require('./analytics-store');
const { humanVoiceCount } = require('./analytics-runtime');

function requireAnalyticsAccess(req, res, next) {
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

function validTimezone(value) {
  const timezone = String(value || '').trim();
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(new Date());
    return timezone;
  } catch {
    throw new Error('Die angegebene Zeitzone ist ungültig.');
  }
}

function sanitizeConfig(input, current) {
  const retention = Number(input?.retentionDays ?? current.retentionDays);
  if (!Number.isFinite(retention) || retention < 30 || retention > 365) {
    throw new Error('Aufbewahrung muss zwischen 30 und 365 Tagen liegen.');
  }
  return {
    enabled: input?.enabled === undefined ? Boolean(current.enabled) : Boolean(input.enabled),
    retentionDays: Math.round(retention),
    timezone: validTimezone(input?.timezone ?? current.timezone)
  };
}

function channelName(guild, id) {
  const channel = guild.channels.cache.get(id);
  if (!channel) return `Gelöschter Kanal · ${id}`;
  if (channel.type === ChannelType.GuildVoice || channel.type === ChannelType.GuildStageVoice) return `🔊 ${channel.name}`;
  return `#${channel.name}`;
}

function decorateSnapshot(guild, snapshot) {
  return {
    ...snapshot,
    topMessageChannels: snapshot.topMessageChannels.map(item => ({ ...item, name: channelName(guild, item.id) })),
    topVoiceChannels: snapshot.topVoiceChannels.map(item => ({ ...item, name: channelName(guild, item.id) })),
    live: {
      members: guild.memberCount,
      voiceUsers: humanVoiceCount(guild)
    }
  };
}

function timezones() {
  return [
    'Europe/Berlin', 'Europe/London', 'Europe/Paris', 'Europe/Vienna', 'Europe/Zurich',
    'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
    'Asia/Tokyo', 'Asia/Singapore', 'Australia/Sydney', 'UTC'
  ];
}

function attachAnalyticsApi(app) {
  app.get('/api/guilds/:guildId/analytics', requireAnalyticsAccess, (req, res) => {
    const guild = client.guilds.cache.get(req.params.guildId);
    try {
      const range = [7, 30, 90].includes(Number(req.query.range)) ? Number(req.query.range) : 7;
      res.json({
        ok: true,
        config: getAnalyticsConfig(guild.id),
        snapshot: decorateSnapshot(guild, getAnalyticsSnapshot(guild.id, range)),
        meta: { timezones: timezones() }
      });
    } catch (error) {
      res.status(500).json({ error: 'analytics_load_failed', message: error.message });
    }
  });

  app.patch('/api/guilds/:guildId/analytics', requireAnalyticsAccess, (req, res) => {
    const guild = client.guilds.cache.get(req.params.guildId);
    try {
      const current = getAnalyticsConfig(guild.id);
      const next = sanitizeConfig(req.body || {}, current);
      const saved = updateAnalyticsConfig(guild.id, next, req.session.user.id);
      flushAnalyticsStore();
      res.json({
        ok: true,
        config: saved,
        snapshot: decorateSnapshot(guild, getAnalyticsSnapshot(guild.id, Number(req.body?.range) || 7)),
        meta: { timezones: timezones() }
      });
    } catch (error) {
      res.status(400).json({ error: 'invalid_analytics_config', message: error.message });
    }
  });

  app.delete('/api/guilds/:guildId/analytics/data', requireAnalyticsAccess, (req, res) => {
    const guild = client.guilds.cache.get(req.params.guildId);
    try {
      const config = clearAnalyticsData(guild.id, req.session.user.id);
      flushAnalyticsStore();
      res.json({
        ok: true,
        config,
        snapshot: decorateSnapshot(guild, getAnalyticsSnapshot(guild.id, 7)),
        meta: { timezones: timezones() }
      });
    } catch (error) {
      res.status(500).json({ error: 'analytics_reset_failed', message: error.message });
    }
  });
}

module.exports = {
  attachAnalyticsApi,
  sanitizeConfig,
  decorateSnapshot
};
