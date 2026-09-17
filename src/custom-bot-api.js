const {
  getCustomBot,
  saveCustomBot,
  setCustomBotActive,
  findCustomBotGuildByApplicationId,
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
const {
  setCustomModeActive,
  botModeStatus,
  getSharedGuild,
  getSharedClient
} = require('./guild-client-router');

function access(req, res, next) {
  if (!req.session?.user) return res.status(401).json({ error: 'not_authenticated', message: 'Nicht angemeldet.' });
  const allowed = (req.session.guilds || []).some(guild => guild.id === req.params.guildId);
  if (!allowed) return res.status(403).json({ error: 'guild_access_denied', message: 'Kein Zugriff auf diesen Server.' });
  next();
}

function emptyConfig(guildId) {
  return {
    guildId,
    configured: false,
    active: false,
    applicationId: '',
    username: '',
    avatarUrl: '',
    tokenHint: '',
    presence: normalizePresence({})
  };
}

function responseFor(guildId) {
  return {
    config: getCustomBot(guildId) || emptyConfig(guildId),
    runtime: snapshot(guildId),
    mode: botModeStatus(guildId)
  };
}

function ensureUniqueApplication(guildId, applicationId) {
  const duplicateGuildId = findCustomBotGuildByApplicationId(applicationId, guildId);
  if (duplicateGuildId) {
    throw new Error('Diese Discord Bot-Application ist bereits einem anderen ORBIT-Server zugeordnet. Für unterschiedliche Aktivitäten braucht jeder Custom Bot eine eigene Application.');
  }
  const sharedId = getSharedClient()?.user?.id || '';
  if (sharedId && String(applicationId) === String(sharedId)) {
    throw new Error('Der öffentliche ORBIT-Bot kann nicht als Custom Bot hinterlegt werden. Verwende eine eigene Discord Application.');
  }
}

function attachCustomBotApi(app) {
  app.get('/api/guilds/:guildId/custom-bot', access, (req, res) => {
    res.json(responseFor(req.params.guildId));
  });

  app.post('/api/guilds/:guildId/custom-bot/connect', access, async (req, res) => {
    const guildId = req.params.guildId;
    const token = String(req.body?.token || '').trim();
    if (!token) return res.status(400).json({ error: 'token_missing', message: 'Bitte einen Bot-Token eintragen.' });

    const existing = getCustomBot(guildId);
    const presence = normalizePresence(req.body?.presence || existing?.presence || {});
    try {
      const state = await connectCustomBot(guildId, token, presence);
      ensureUniqueApplication(guildId, state.applicationId);

      const keepActive = Boolean(existing?.active && state.inTargetGuild);
      saveCustomBot(guildId, {
        token,
        active: keepActive,
        applicationId: state.applicationId,
        username: state.username,
        avatarUrl: state.avatarUrl,
        presence
      });
      setCustomModeActive(guildId, keepActive);
      res.json({ ok: true, ...responseFor(guildId) });
    } catch (error) {
      await disconnectCustomBot(guildId).catch(() => null);
      res.status(400).json({ error: 'custom_bot_connect_failed', message: error.message });
    }
  });

  app.post('/api/guilds/:guildId/custom-bot/reconnect', access, async (req, res) => {
    const guildId = req.params.guildId;
    try {
      const state = await reconnectStoredCustomBot(guildId);
      const stored = getCustomBot(guildId);
      saveCustomBot(guildId, {
        active: Boolean(stored?.active),
        applicationId: state.applicationId,
        username: state.username,
        avatarUrl: state.avatarUrl,
        presence: state.presence || stored?.presence
      });
      setCustomModeActive(guildId, Boolean(stored?.active));
      res.json({ ok: true, ...responseFor(guildId) });
    } catch (error) {
      res.status(400).json({ error: 'custom_bot_reconnect_failed', message: error.message });
    }
  });

  app.post('/api/guilds/:guildId/custom-bot/activate', access, async (req, res) => {
    const guildId = req.params.guildId;
    const stored = getCustomBot(guildId);
    const state = snapshot(guildId);
    if (!stored?.configured) {
      return res.status(404).json({ error: 'custom_bot_missing', message: 'Richte zuerst einen Custom Bot ein.' });
    }
    if (!state.connected) {
      return res.status(409).json({ error: 'custom_bot_offline', message: 'Der Custom Bot ist nicht verbunden. Nutze zuerst „Neu verbinden“.' });
    }
    if (!state.inTargetGuild) {
      return res.status(409).json({ error: 'custom_bot_not_in_guild', message: 'Lade den Custom Bot zuerst über „Bot auf Server einladen“ auf diesen Discord-Server ein.' });
    }

    setCustomBotActive(guildId, true);
    setCustomModeActive(guildId, true);
    res.json({
      ok: true,
      message: 'Custom Bot ist jetzt der aktive ORBIT-Bot für diesen Server. Der öffentliche ORBIT-Bot kann entfernt werden.',
      ...responseFor(guildId)
    });
  });

  app.post('/api/guilds/:guildId/custom-bot/deactivate', access, async (req, res) => {
    const guildId = req.params.guildId;
    if (!getSharedGuild(guildId)) {
      return res.status(409).json({
        error: 'standard_bot_missing',
        message: 'Der öffentliche ORBIT-Bot ist nicht auf diesem Server. Lade ihn zuerst wieder ein, bevor du auf Standardbetrieb zurückschaltest.'
      });
    }
    const stored = getCustomBot(guildId);
    if (!stored?.configured) return res.status(404).json({ error: 'custom_bot_missing', message: 'Kein Custom Bot eingerichtet.' });

    setCustomBotActive(guildId, false);
    setCustomModeActive(guildId, false);
    res.json({ ok: true, ...responseFor(guildId) });
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
    setCustomModeActive(guildId, false);
    await disconnectCustomBot(guildId);
    deleteCustomBot(guildId);
    res.json({ ok: true, ...responseFor(guildId) });
  });
}

module.exports = { attachCustomBotApi };