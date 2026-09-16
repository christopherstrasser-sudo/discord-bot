const { PermissionFlagsBits } = require('discord.js');
const {
  getCreatorConfig,
  listCreatorGuildIds,
  getCreatorRuleState,
  setCreatorRuleState,
  appendCreatorHistory
} = require('./creator-store');
const { buildNotificationPayload } = require('./creator-runtime');
const {
  SOCIAL_PLATFORMS,
  fetchSocialPost,
  getSocialProviderHealth
} = require('./creator-social-provider-router');

const DEFAULT_POLL_SECONDS = 90;
let timer = null;
let polling = false;
let lastPollStartedAt = null;
let lastPollFinishedAt = null;
let lastPollError = '';

function pollSeconds() {
  const raw = Number(process.env.CREATOR_POLL_SECONDS || DEFAULT_POLL_SECONDS);
  return Number.isFinite(raw) ? Math.max(60, Math.min(Math.floor(raw), 900)) : DEFAULT_POLL_SECONDS;
}

function sourceOf(rule) {
  return String(rule?.source || '').trim().replace(/^@/, '').toLowerCase();
}

function parseTime(value) {
  const match = String(value || '').match(/^(\d{2}):(\d{2})$/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return hour * 60 + minute;
}

function minuteOfDayInZone(timezone, date = new Date()) {
  try {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23'
    }).formatToParts(date);
    const hour = Number(parts.find(part => part.type === 'hour')?.value || 0);
    const minute = Number(parts.find(part => part.type === 'minute')?.value || 0);
    return hour * 60 + minute;
  } catch {
    return date.getHours() * 60 + date.getMinutes();
  }
}

function inQuietHours(rule, timezone, date = new Date()) {
  if (!rule.quietHours?.enabled) return false;
  const start = parseTime(rule.quietHours.start);
  const end = parseTime(rule.quietHours.end);
  if (start === null || end === null || start === end) return false;
  const now = minuteOfDayInZone(timezone, date);
  return start < end ? now >= start && now < end : now >= start || now < end;
}

function matchesFilters(rule, snapshot) {
  const needle = String(rule.filterTitle || '').trim().toLowerCase();
  return !needle || String(snapshot?.title || '').toLowerCase().includes(needle);
}

function observation(rule, snapshot, eventKey = '') {
  return {
    initialized: true,
    lastObservedAt: new Date().toISOString(),
    lastProviderError: '',
    lastProviderErrorAt: null,
    lastTitle: snapshot?.title || '',
    lastGame: '',
    lastLiveId: '',
    lastSnapshot: snapshot ? {
      creator: snapshot.creator || '',
      live: false,
      id: snapshot.id || '',
      title: snapshot.title || '',
      game: '',
      url: snapshot.url || '',
      viewers: 0,
      startedAt: snapshot.startedAt || snapshot.publishedAt || ''
    } : null,
    ...(eventKey ? { lastEventKey: eventKey } : {})
  };
}

function logHistory(guildId, rule, status, message, snapshot = null) {
  appendCreatorHistory(guildId, {
    ruleId: rule.id,
    ruleName: rule.name,
    platform: rule.platform,
    source: sourceOf(rule),
    event: 'post',
    status,
    message: String(message || '').slice(0, 500),
    title: String(snapshot?.title || '').slice(0, 200),
    url: String(snapshot?.url || '').slice(0, 500)
  });
}

async function sendNotification(client, guildId, rule, snapshot, options = {}) {
  const guild = client.guilds.cache.get(guildId);
  if (!guild) throw new Error('Discord-Server ist nicht verbunden.');
  const channel = guild.channels.cache.get(rule.channelId) || await guild.channels.fetch(rule.channelId).catch(() => null);
  if (!channel?.send) throw new Error('Zielkanal existiert nicht mehr.');

  const me = guild.members.me || await guild.members.fetchMe().catch(() => null);
  const perms = me ? channel.permissionsFor(me) : null;
  if (!perms?.has(PermissionFlagsBits.ViewChannel) || !perms?.has(PermissionFlagsBits.SendMessages) || !perms?.has(PermissionFlagsBits.EmbedLinks)) {
    throw new Error('Dem Bot fehlen Schreib- oder Embed-Rechte im Zielkanal.');
  }

  let allowPing = options.allowPing !== false;
  if (allowPing && rule.pingRoleId) {
    const role = guild.roles.cache.get(rule.pingRoleId) || await guild.roles.fetch(rule.pingRoleId).catch(() => null);
    if (!role) allowPing = false;
    else if (!role.mentionable && !me.permissions.has(PermissionFlagsBits.MentionEveryone)) allowPing = false;
  }

  const payload = buildNotificationPayload(rule, snapshot, { ...options, allowPing });
  const message = await channel.send(payload);
  return { message, pinged: Boolean(rule.pingRoleId && allowPing) };
}

async function processSocialRule(client, guildId, config, rule, snapshot) {
  const state = getCreatorRuleState(guildId, rule.id);
  if (snapshot?.error) {
    const previous = state.lastProviderErrorAt ? Date.parse(state.lastProviderErrorAt) : 0;
    if (!previous || Date.now() - previous > 30 * 60 * 1000 || state.lastProviderError !== snapshot.error) {
      logHistory(guildId, rule, 'error', snapshot.error);
    }
    setCreatorRuleState(guildId, rule.id, {
      lastProviderError: snapshot.error,
      lastProviderErrorAt: new Date().toISOString(),
      lastObservedAt: new Date().toISOString()
    });
    return;
  }

  if (!snapshot?.id) return;
  const key = `${rule.platform}:${sourceOf(rule)}:post:${snapshot.id}`;
  const firstObservation = !state.initialized;
  const isNew = key !== state.lastEventKey;
  const next = observation(rule, snapshot, key);

  if (!isNew) {
    setCreatorRuleState(guildId, rule.id, next);
    return;
  }

  if (firstObservation && !rule.announceFirstMatch) {
    setCreatorRuleState(guildId, rule.id, next);
    logHistory(guildId, rule, 'baseline', 'Aktueller Post als Baseline übernommen – keine rückwirkende Benachrichtigung.', snapshot);
    return;
  }

  if (!matchesFilters(rule, snapshot)) {
    setCreatorRuleState(guildId, rule.id, next);
    logHistory(guildId, rule, 'filtered', 'Neuer Post erkannt, aber durch den Textfilter verworfen.', snapshot);
    return;
  }

  const cooldownMs = Math.max(0, Number(rule.cooldownMinutes || 0)) * 60 * 1000;
  const lastSent = state.lastSentAt ? Date.parse(state.lastSentAt) : 0;
  if (cooldownMs && lastSent && Date.now() - lastSent < cooldownMs) {
    setCreatorRuleState(guildId, rule.id, next);
    logHistory(guildId, rule, 'suppressed', 'Post wegen Cooldown unterdrückt.', snapshot);
    return;
  }

  const quiet = inQuietHours(rule, config.timezone);
  if (quiet && rule.quietHours?.mode === 'suppress') {
    setCreatorRuleState(guildId, rule.id, next);
    logHistory(guildId, rule, 'suppressed', 'Post innerhalb der Quiet Hours unterdrückt.', snapshot);
    return;
  }

  try {
    const result = await sendNotification(client, guildId, rule, snapshot, {
      allowPing: !(quiet && rule.quietHours?.mode === 'no_ping')
    });
    setCreatorRuleState(guildId, rule.id, {
      ...next,
      lastSentAt: new Date().toISOString(),
      lastSentMessageId: result.message.id,
      lastSentChannelId: result.message.channelId
    });
    logHistory(guildId, rule, 'sent', quiet && !result.pinged ? 'Post-Benachrichtigung ohne Ping gesendet.' : 'Post-Benachrichtigung gesendet.', snapshot);
  } catch (error) {
    setCreatorRuleState(guildId, rule.id, next);
    logHistory(guildId, rule, 'error', `Discord-Ausgabe fehlgeschlagen: ${error.message}`, snapshot);
  }
}

async function mapLimit(entries, limit, fn) {
  const items = [...entries];
  let cursor = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const entry = items[cursor++];
      await fn(entry);
    }
  }));
}

async function pollCreatorSocial(client) {
  if (polling || !client?.isReady?.()) return;
  polling = true;
  lastPollStartedAt = new Date().toISOString();
  lastPollError = '';
  try {
    const entries = [];
    for (const guildId of listCreatorGuildIds()) {
      const config = getCreatorConfig(guildId);
      if (!config.enabled || !client.guilds.cache.has(guildId)) continue;
      for (const rule of config.rules || []) {
        if (!SOCIAL_PLATFORMS.has(rule.platform) || rule.enabled === false || !rule.source || !rule.channelId) continue;
        entries.push({ guildId, config, rule });
      }
    }

    await mapLimit(entries, 4, async entry => {
      let snapshot;
      try {
        snapshot = await fetchSocialPost(entry.rule.platform, entry.rule.source);
      } catch (error) {
        snapshot = { error: String(error.message || error) };
      }
      await processSocialRule(client, entry.guildId, entry.config, entry.rule, snapshot);
    });
  } catch (error) {
    lastPollError = String(error.message || error);
    console.warn(`[CREATOR SOCIAL] Poll failed: ${lastPollError}`);
  } finally {
    lastPollFinishedAt = new Date().toISOString();
    polling = false;
  }
}

async function checkSocialRule(rule) {
  if (!SOCIAL_PLATFORMS.has(rule.platform)) throw new Error('Unbekannter Social Provider.');
  return fetchSocialPost(rule.platform, rule.source);
}

function sampleSocialSnapshot(rule) {
  const source = sourceOf(rule) || 'creator';
  const defaults = {
    instagram: ['Instagram', 'https://www.instagram.com/', 'Neuer Post: Heute gibt es etwas Neues aus der Community ✨'],
    bluesky: ['Bluesky', 'https://bsky.app/', 'Neuer Post: Kleines Update direkt aus Bluesky.'],
    x: ['X', 'https://x.com/', 'Neuer Post: Das ist ein Beispiel für einen neuen Beitrag auf X.']
  };
  const [platformName, url, title] = defaults[rule.platform] || ['Social', 'https://example.com/', 'Neuer Social Post'];
  return {
    platform: rule.platform,
    source,
    creator: rule.displayName || source || platformName,
    exists: true,
    live: false,
    id: 'demo-post',
    eventKey: `demo:${rule.platform}:post`,
    title,
    game: '',
    url,
    thumbnail: '',
    avatar: '',
    publishedAt: new Date().toISOString(),
    startedAt: new Date().toISOString(),
    viewers: 0
  };
}

async function sendSocialTest(client, guildId, rule) {
  const snapshot = sampleSocialSnapshot(rule);
  const result = await sendNotification(client, guildId, rule, snapshot, { test: true, allowPing: false });
  logHistory(guildId, rule, 'test', 'Testbenachrichtigung gesendet – ohne Rollen-Ping.', snapshot);
  return { messageId: result.message.id, channelId: result.message.channelId };
}

function getSocialRuntimeStatus() {
  return {
    running: Boolean(timer),
    polling,
    pollSeconds: pollSeconds(),
    lastPollStartedAt,
    lastPollFinishedAt,
    lastPollError,
    providers: getSocialProviderHealth()
  };
}

function startCreatorSocialRuntime(client) {
  if (timer) return;
  const seconds = pollSeconds();
  const run = () => pollCreatorSocial(client).catch(error => console.warn(`[CREATOR SOCIAL] Runtime failed: ${error.message}`));
  setTimeout(run, 9000);
  timer = setInterval(run, seconds * 1000);
  timer.unref?.();
  console.log(`[CREATOR SOCIAL] Runtime active · poll every ${seconds}s`);
}

module.exports = {
  startCreatorSocialRuntime,
  pollCreatorSocial,
  checkSocialRule,
  sendSocialTest,
  getSocialRuntimeStatus,
  sampleSocialSnapshot
};
