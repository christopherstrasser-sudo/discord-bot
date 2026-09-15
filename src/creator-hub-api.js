const crypto = require('crypto');
const { ChannelType, PermissionFlagsBits } = require('discord.js');
const { client } = require('./bot');
const {
  getCreatorConfig,
  setCreatorConfig,
  getCreatorHistory,
  pruneCreatorRuleState
} = require('./creator-store');
const {
  checkCreatorRule,
  sendCreatorTest,
  getRuntimeStatus
} = require('./creator-runtime');

const MAX_RULES = 30;
const PLATFORMS = new Set(['twitch', 'youtube', 'tiktok']);
const EVENTS = {
  twitch: new Set(['live', 'title_change', 'category_change']),
  youtube: new Set(['upload']),
  tiktok: new Set(['live'])
};

function access(req, res, next) {
  if (!req.session?.user) return res.status(401).json({ error: 'not_authenticated', message: 'Nicht angemeldet.' });
  const allowed = (req.session.guilds || []).some(guild => guild.id === req.params.guildId);
  if (!allowed) return res.status(403).json({ error: 'guild_access_denied', message: 'Kein Zugriff auf diesen Server.' });
  if (!client.guilds.cache.has(req.params.guildId)) return res.status(409).json({ error: 'bot_not_installed', message: 'Bot ist nicht verbunden.' });
  next();
}

function safeId(value, prefix = 'rule') {
  const raw = String(value || '').trim();
  return /^[A-Za-z0-9_-]{1,28}$/.test(raw) ? raw : `${prefix}_${crypto.randomBytes(6).toString('hex')}`;
}

function str(value, max = 200) {
  return String(value ?? '').trim().slice(0, max);
}

function validTimezone(value) {
  const zone = str(value, 80) || 'Europe/Berlin';
  try {
    new Intl.DateTimeFormat('en', { timeZone: zone }).format(new Date());
    return zone;
  } catch {
    throw new Error(`Ungültige Zeitzone: ${zone}`);
  }
}

function validTime(value, fallback) {
  const raw = str(value, 5) || fallback;
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(raw)) throw new Error(`Ungültige Uhrzeit: ${raw}`);
  return raw;
}

function normalizeSource(platform, value) {
  const source = str(value, 100).replace(platform === 'tiktok' ? /^@/ : /$^/, '').trim();
  if (platform === 'twitch' && !/^[A-Za-z0-9_]{3,25}$/.test(source)) {
    throw new Error('Twitch: Bitte den Kanalnamen ohne URL eintragen.');
  }
  if (platform === 'youtube' && !/^UC[A-Za-z0-9_-]{20,40}$/.test(source)) {
    throw new Error('YouTube: Bitte eine Channel-ID eintragen, die mit UC beginnt.');
  }
  if (platform === 'tiktok' && !/^[A-Za-z0-9._]{2,30}$/.test(source)) {
    throw new Error('TikTok: Bitte den @Handle ohne URL eintragen.');
  }
  return platform === 'youtube' ? source : source.toLowerCase();
}

function sanitizeRule(raw, index) {
  const platform = str(raw?.platform, 20).toLowerCase();
  if (!PLATFORMS.has(platform)) throw new Error(`Regel ${index + 1}: unbekannte Plattform.`);
  const event = str(raw?.event, 30).toLowerCase();
  if (!EVENTS[platform].has(event)) throw new Error(`Regel ${index + 1}: Event ${event || '—'} wird für ${platform} nicht unterstützt.`);
  const quietMode = raw?.quietHours?.mode === 'suppress' ? 'suppress' : 'no_ping';
  const cooldown = Number(raw?.cooldownMinutes ?? 10);
  const cooldownMinutes = Number.isFinite(cooldown) ? Math.max(0, Math.min(Math.floor(cooldown), 1440)) : 10;

  return {
    id: safeId(raw?.id),
    enabled: raw?.enabled !== false,
    name: str(raw?.name, 80) || `Creator Regel ${index + 1}`,
    platform,
    source: normalizeSource(platform, raw?.source),
    displayName: str(raw?.displayName, 80),
    event,
    channelId: str(raw?.channelId, 32),
    pingRoleId: str(raw?.pingRoleId, 32),
    cooldownMinutes,
    announceFirstMatch: Boolean(raw?.announceFirstMatch),
    filterTitle: str(raw?.filterTitle, 100),
    filterGame: str(raw?.filterGame, 100),
    message: str(raw?.message, 500),
    embedTitle: str(raw?.embedTitle, 256),
    embedDescription: str(raw?.embedDescription, 1800),
    color: /^#[0-9A-F]{6}$/i.test(String(raw?.color || '')) ? String(raw.color).toUpperCase() : '',
    buttonLabel: str(raw?.buttonLabel, 80),
    showThumbnail: raw?.showThumbnail !== false,
    quietHours: {
      enabled: Boolean(raw?.quietHours?.enabled),
      start: validTime(raw?.quietHours?.start, '22:00'),
      end: validTime(raw?.quietHours?.end, '08:00'),
      mode: quietMode
    }
  };
}

function validateRuleAgainstGuild(rule, guild) {
  if (!rule.channelId) throw new Error(`${rule.name}: Zielkanal fehlt.`);
  const channel = guild.channels.cache.get(rule.channelId);
  const me = guild.members.me;
  const perms = channel?.permissionsFor?.(me);
  const validChannel = channel && [ChannelType.GuildText, ChannelType.GuildAnnouncement].includes(channel.type);
  if (!validChannel || !perms?.has(PermissionFlagsBits.ViewChannel) || !perms?.has(PermissionFlagsBits.SendMessages) || !perms?.has(PermissionFlagsBits.EmbedLinks)) {
    throw new Error(`${rule.name}: Bot kann im Zielkanal nicht mit Embeds schreiben.`);
  }
  if (rule.pingRoleId) {
    const role = guild.roles.cache.get(rule.pingRoleId);
    if (!role || role.id === guild.id || role.managed) throw new Error(`${rule.name}: Ping-Rolle ist nicht verfügbar.`);
    if (!role.mentionable && !me?.permissions.has(PermissionFlagsBits.MentionEveryone)) {
      throw new Error(`${rule.name}: Die Ping-Rolle ist nicht erwähnbar. Aktiviere „Rolle erwähnbar“ oder gib dem Bot die passende Mention-Berechtigung.`);
    }
  }
}

function sanitizeConfig(input, guild) {
  const rulesRaw = Array.isArray(input?.rules) ? input.rules : [];
  if (rulesRaw.length > MAX_RULES) throw new Error(`Maximal ${MAX_RULES} Creator-Regeln pro Server.`);
  const rules = rulesRaw.map(sanitizeRule);
  const ids = new Set();
  for (const rule of rules) {
    if (ids.has(rule.id)) rule.id = safeId('', 'rule');
    ids.add(rule.id);
    validateRuleAgainstGuild(rule, guild);
  }
  return {
    enabled: Boolean(input?.enabled),
    timezone: validTimezone(input?.timezone),
    rules
  };
}

function metaForGuild(guild) {
  const me = guild.members.me;
  const channels = guild.channels.cache
    .filter(channel => {
      if (![ChannelType.GuildText, ChannelType.GuildAnnouncement].includes(channel.type)) return false;
      const p = channel.permissionsFor(me);
      return Boolean(p?.has(PermissionFlagsBits.ViewChannel) && p?.has(PermissionFlagsBits.SendMessages) && p?.has(PermissionFlagsBits.EmbedLinks));
    })
    .map(channel => ({ id: channel.id, name: channel.name, parent: channel.parent?.name || '', position: channel.rawPosition }))
    .sort((a, b) => a.position - b.position || a.name.localeCompare(b.name, 'de'));

  const canMentionEveryone = Boolean(me?.permissions.has(PermissionFlagsBits.MentionEveryone));
  const roles = guild.roles.cache
    .filter(role => role.id !== guild.id && !role.managed && (role.mentionable || canMentionEveryone))
    .map(role => ({ id: role.id, name: role.name, color: role.hexColor, mentionable: role.mentionable, position: role.position }))
    .sort((a, b) => b.position - a.position);

  return {
    channels,
    roles,
    capabilities: {
      canMentionEveryone,
      writableChannels: channels.length,
      pingRoles: roles.length
    },
    runtime: getRuntimeStatus()
  };
}

function publicSnapshot(snapshot) {
  if (!snapshot) return null;
  return {
    platform: snapshot.platform,
    source: snapshot.source,
    creator: snapshot.creator,
    exists: snapshot.exists !== false,
    live: Boolean(snapshot.live),
    id: snapshot.id || '',
    title: snapshot.title || '',
    game: snapshot.game || '',
    url: snapshot.url || '',
    thumbnail: snapshot.thumbnail || '',
    avatar: snapshot.avatar || '',
    startedAt: snapshot.startedAt || snapshot.publishedAt || '',
    viewers: Number(snapshot.viewers || 0)
  };
}

function attachCreatorHubApi(app) {
  app.get('/api/guilds/:guildId/creator-hub', access, (req, res) => {
    const guild = client.guilds.cache.get(req.params.guildId);
    res.json({
      config: getCreatorConfig(guild.id),
      meta: metaForGuild(guild),
      history: getCreatorHistory(guild.id, 50)
    });
  });

  app.patch('/api/guilds/:guildId/creator-hub', access, (req, res) => {
    const guild = client.guilds.cache.get(req.params.guildId);
    try {
      const config = sanitizeConfig(req.body || {}, guild);
      const saved = setCreatorConfig(guild.id, config, req.session.user.id);
      pruneCreatorRuleState(guild.id, saved.rules.map(rule => rule.id));
      res.json({ ok: true, config: saved, meta: metaForGuild(guild), history: getCreatorHistory(guild.id, 50) });
    } catch (error) {
      res.status(400).json({ error: 'invalid_creator_hub', message: error.message });
    }
  });

  app.post('/api/guilds/:guildId/creator-hub/:ruleId/check', access, async (req, res) => {
    const guild = client.guilds.cache.get(req.params.guildId);
    try {
      const config = getCreatorConfig(guild.id);
      const rule = config.rules.find(item => item.id === req.params.ruleId);
      if (!rule) throw new Error('Creator-Regel nicht gefunden.');
      const snapshot = await checkCreatorRule(rule);
      res.json({ ok: true, snapshot: publicSnapshot(snapshot), runtime: getRuntimeStatus() });
    } catch (error) {
      res.status(400).json({ error: 'creator_check_failed', message: error.message, runtime: getRuntimeStatus() });
    }
  });

  app.post('/api/guilds/:guildId/creator-hub/:ruleId/test', access, async (req, res) => {
    const guild = client.guilds.cache.get(req.params.guildId);
    try {
      const config = getCreatorConfig(guild.id);
      const rule = config.rules.find(item => item.id === req.params.ruleId);
      if (!rule) throw new Error('Creator-Regel nicht gefunden.');
      validateRuleAgainstGuild(rule, guild);
      const result = await sendCreatorTest(client, guild.id, rule);
      res.json({ ok: true, ...result, history: getCreatorHistory(guild.id, 50) });
    } catch (error) {
      res.status(400).json({ error: 'creator_test_failed', message: error.message });
    }
  });

  app.get('/api/guilds/:guildId/creator-hub/history', access, (req, res) => {
    res.json({ history: getCreatorHistory(req.params.guildId, 80) });
  });
}

module.exports = { attachCreatorHubApi };
