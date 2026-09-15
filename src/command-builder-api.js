const crypto = require('crypto');
const { client } = require('./bot');
const { getGuildSettings, updateGuildSettings } = require('./store');

const MAX_COMMANDS = 50;
const MAX_BLOCKS = 12;
const MAX_EMBEDS = 3;
const MAX_BUTTONS = 5;
const ALLOWED_BLOCKS = new Set(['text', 'embed', 'button', 'random']);

function safeId(value, prefix) {
  const raw = String(value || '').trim();
  return /^[a-zA-Z0-9_-]{1,80}$/.test(raw) ? raw : `${prefix}_${crypto.randomUUID()}`;
}

function normalizeTrigger(value) {
  let trigger = String(value || '').trim().toLowerCase();
  if (trigger && !trigger.startsWith('!')) trigger = `!${trigger}`;
  return trigger;
}

function optionalHttpUrl(value, label) {
  const text = String(value || '').trim();
  if (!text) return '';
  if (text.length > 1000) throw new Error(`${label} ist zu lang.`);

  let url;
  try {
    url = new URL(text);
  } catch {
    throw new Error(`${label} muss eine gültige URL sein.`);
  }

  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error(`${label} muss mit http:// oder https:// beginnen.`);
  }
  return url.toString();
}

function sanitizeBlock(block, commandTrigger) {
  if (!block || typeof block !== 'object') throw new Error(`${commandTrigger}: Ungültiger Baustein.`);
  const type = String(block.type || '').trim().toLowerCase();
  if (!ALLOWED_BLOCKS.has(type)) throw new Error(`${commandTrigger}: Unbekannter Baustein „${type || '?'}“.`);

  const id = safeId(block.id, 'block');

  if (type === 'text') {
    const text = String(block.text || '').trim();
    if (!text) throw new Error(`${commandTrigger}: Ein Text-Baustein ist leer.`);
    if (text.length > 1800) throw new Error(`${commandTrigger}: Ein Text-Baustein darf maximal 1800 Zeichen lang sein.`);
    return { id, type, text };
  }

  if (type === 'embed') {
    const title = String(block.title || '').trim();
    const description = String(block.description || '').trim();
    const footer = String(block.footer || '').trim();
    const color = String(block.color || '#5865F2').trim().toUpperCase();
    const imageUrl = optionalHttpUrl(block.imageUrl, `${commandTrigger}: Embed-Bild`);

    if (!title && !description && !imageUrl) {
      throw new Error(`${commandTrigger}: Ein Embed braucht Titel, Text oder Bild.`);
    }
    if (title.length > 256) throw new Error(`${commandTrigger}: Embed-Titel darf maximal 256 Zeichen lang sein.`);
    if (description.length > 3500) throw new Error(`${commandTrigger}: Embed-Text darf maximal 3500 Zeichen lang sein.`);
    if (footer.length > 512) throw new Error(`${commandTrigger}: Embed-Footer darf maximal 512 Zeichen lang sein.`);
    if (!/^#[0-9A-F]{6}$/.test(color)) throw new Error(`${commandTrigger}: Ungültige Embed-Farbe.`);

    return { id, type, title, description, footer, color, imageUrl };
  }

  if (type === 'button') {
    const label = String(block.label || '').trim();
    const url = optionalHttpUrl(block.url, `${commandTrigger}: Button-Link`);
    if (!label) throw new Error(`${commandTrigger}: Ein Button braucht eine Beschriftung.`);
    if (label.length > 80) throw new Error(`${commandTrigger}: Button-Beschriftung darf maximal 80 Zeichen lang sein.`);
    if (!url) throw new Error(`${commandTrigger}: Ein Button braucht einen Link.`);
    return { id, type, label, url };
  }

  const rawOptions = Array.isArray(block.options) ? block.options : [];
  const options = rawOptions.map(option => String(option || '').trim()).filter(Boolean);
  if (options.length < 2 || options.length > 10) {
    throw new Error(`${commandTrigger}: Zufall braucht 2 bis 10 Antwortmöglichkeiten.`);
  }
  for (const option of options) {
    if (option.length > 500) throw new Error(`${commandTrigger}: Zufallsantworten dürfen maximal 500 Zeichen lang sein.`);
  }
  return { id, type, options };
}

function legacyBlocks(item) {
  const response = String(item?.response || '').trim();
  if (!response) return [];
  return [{ id: safeId('', 'block'), type: 'text', text: response.slice(0, 1800) }];
}

function sanitizeCommandList(value) {
  const commands = Array.isArray(value) ? value : [];
  if (commands.length > MAX_COMMANDS) throw new Error(`Es sind maximal ${MAX_COMMANDS} Custom Commands pro Server erlaubt.`);

  const seen = new Set();

  return commands.map((item, index) => {
    if (!item || typeof item !== 'object') throw new Error(`Command ${index + 1} ist ungültig.`);

    const trigger = normalizeTrigger(item.trigger);
    if (!/^![a-z0-9][a-z0-9_-]{0,31}$/.test(trigger)) {
      throw new Error(`Command ${index + 1}: Verwende 1–32 Zeichen nach ! und nur a-z, 0-9, _ oder -.`);
    }
    if (seen.has(trigger)) throw new Error(`Der Command ${trigger} ist doppelt vorhanden.`);
    seen.add(trigger);

    const cooldownSeconds = Number(item.cooldownSeconds ?? 0);
    if (!Number.isInteger(cooldownSeconds) || cooldownSeconds < 0 || cooldownSeconds > 3600) {
      throw new Error(`${trigger}: Cooldown muss zwischen 0 und 3600 Sekunden liegen.`);
    }

    const delivery = item.delivery === 'reply' ? 'reply' : 'send';
    const sourceBlocks = Array.isArray(item.blocks) && item.blocks.length ? item.blocks : legacyBlocks(item);
    if (!sourceBlocks.length) throw new Error(`${trigger}: Füge mindestens einen Baustein hinzu.`);
    if (sourceBlocks.length > MAX_BLOCKS) throw new Error(`${trigger}: Maximal ${MAX_BLOCKS} Bausteine pro Command.`);

    const blocks = sourceBlocks.map(block => sanitizeBlock(block, trigger));
    if (blocks.filter(block => block.type === 'embed').length > MAX_EMBEDS) {
      throw new Error(`${trigger}: Maximal ${MAX_EMBEDS} Embed-Bausteine.`);
    }
    if (blocks.filter(block => block.type === 'button').length > MAX_BUTTONS) {
      throw new Error(`${trigger}: Maximal ${MAX_BUTTONS} Button-Bausteine.`);
    }

    const fallbackText = blocks.find(block => block.type === 'text')?.text ||
      blocks.find(block => block.type === 'random')?.options?.[0] ||
      blocks.find(block => block.type === 'embed')?.description ||
      blocks.find(block => block.type === 'embed')?.title ||
      '[Flow Command]';

    return {
      id: safeId(item.id, 'cmd'),
      trigger,
      response: String(fallbackText).slice(0, 1800),
      enabled: item.enabled !== false,
      cooldownSeconds,
      delivery,
      blocks
    };
  });
}

function requireBuilderAccess(req, res, next) {
  if (!req.session?.user) return res.status(401).json({ error: 'not_authenticated', message: 'Nicht angemeldet.' });
  const guildAccess = (req.session.guilds || []).find(guild => guild.id === req.params.guildId);
  if (!guildAccess) return res.status(403).json({ error: 'guild_access_denied', message: 'Kein Zugriff auf diesen Server.' });
  if (!client.guilds.cache.has(req.params.guildId)) {
    return res.status(409).json({ error: 'bot_not_installed', message: 'Der Bot ist auf diesem Server nicht verbunden.' });
  }
  next();
}

function attachCommandBuilderApi(app) {
  app.patch('/api/guilds/:guildId/command-builder', requireBuilderAccess, (req, res) => {
    try {
      const current = getGuildSettings(req.params.guildId);
      const enabled = req.body?.enabled === undefined
        ? Boolean(current.customCommands?.enabled)
        : Boolean(req.body.enabled);
      const commands = sanitizeCommandList(req.body?.commands);

      const settings = updateGuildSettings(
        req.params.guildId,
        { customCommands: { enabled, commands } },
        req.session.user.id
      );

      res.json({ ok: true, customCommands: settings.customCommands });
    } catch (error) {
      res.status(400).json({ error: 'invalid_command_builder', message: error.message });
    }
  });
}

module.exports = {
  attachCommandBuilderApi,
  sanitizeCommandList
};
