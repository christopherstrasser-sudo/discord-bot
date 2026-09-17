const {
  getCustomBot,
  saveCustomBot,
  deleteCustomBot
} = require('./custom-bot-store');
const {
  normalizePresence,
  snapshot,
  applyPresence,
  connectCustomBot,
  disconnectCustomBot,
  reconnectStoredCustomBot
} = require('./custom-bot-manager');

function access(req, res, next) {
  if (!req.session?.user) return res.status(401).json({ error: 'not_authenticated', message: 'Nicht angemeldet.' });
  const allowed = (req.session.guilds || []).some(guild => guild.id === req.params.guildId);
  if (!allowed) return res.status(403).json({ error: 'guild_access_denied', message: 'Kein Zugriff auf diesen Server.' });
  next();
}

function responseFor(guildId) {
  return {
    config: getCustomBot(guildId) || {
      guildId,
      configured: false,
      applicationId: '',
      username: '',
      avatarUrl: '',
      tokenHint: '',
      presence: normalizePresence({})
    },
    runtime: snapshot(guildId)
  };
}

function attachCustomBotApi(app) {
  app.get('/api/guilds/:guildId/custom-bot', access, (req, res) => {
    res.json(responseFor(req.params.guildId));
  });

  app.post('/api/guilds/:guildId/custom-bot/connect', access, async (req, res) => {
    const guildId = req.params.guildId;
    const token = String(req.body?.token || '').trim();
    if (!token) return res.status(400).json({ error: 'token_missing', message: 'Bitte einen Bot-Token eintragen.' });

    const presence = normalizePresence(req.body?.presence || {});
    try {
      const state = await connectCustomBot(guildId, token, presence);
      saveCustomBot(guildId, {
        token,
        applicationId: state.applicationId,
        username: state.username,
        avatarUrl: state.avatarUrl,
        presence
      });
      res.json({ ok: true, ...responseFor(guildId) });
    } catch (error) {
      res.status(400).json({ error: 'custom_bot_connect_failed', message: error.message });
    }
  });

  app.post('/api/guilds/:guildId/custom-bot/reconnect', access, async (req, res) => {
    const guildId = req.params.guildId;
    try {
      const state = await reconnectStoredCustomBot(guildId);
      saveCustomBot(guildId, {
        applicationId: state.applicationId,
        username: state.username,
        avatarUrl: state.avatarUrl,
        presence: state.presence || getCustomBot(guildId)?.presence
      });
      res.json({ ok: true, ...responseFor(guildId) });
    } catch (error) {
      res.status(400).json({ error: 'custom_bot_reconnect_failed', message: error.message });
    }
  });

  app.patch('/api/guilds/:guildId/custom-bot/presence', access, async (req, res) => {
    const guildId = req.params.guildId;
    const stored = getCustomBot(guildId);
    if (!stored?.configured) return res.status(404).json({ error: 'custom_bot_missing', message: 'Für diesen Server ist kein Custom Bot eingerichtet.' });
    const presence = normalizePresence(req.body || {});
    try {
      applyPresence(guildId, presence);
      saveCustomBot(guildId, { presence });
      res.json({ ok: true, ...responseFor(guildId) });
    } catch (error) {
      res.status(409).json({ error: 'custom_bot_offline', message: `${error.message} Nutze zuerst „Neu verbinden“.` });
    }
  });

  app.delete('/api/guilds/:guildId/custom-bot', access, async (req, res) => {
    const guildId = req.params.guildId;
    await disconnectCustomBot(guildId);
    deleteCustomBot(guildId);
    res.json({ ok: true, ...responseFor(guildId) });
  });
}

module.exports = { attachCustomBotApi };