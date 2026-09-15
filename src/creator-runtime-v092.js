const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  PermissionFlagsBits
} = require('discord.js');
const {
  getCreatorConfig,
  listCreatorGuildIds,
  getCreatorRuleState,
  setCreatorRuleState,
  appendCreatorHistory
} = require('./creator-store');
const {
  getProviderHealth,
  fetchTwitchStatuses,
  fetchYouTubeStatus
} = require('./creator-providers');
const {
  fetchTikTokSnapshot,
  snapshotForTikTokRule,
  getTikTokProviderHealth
} = require('./creator-tiktok-provider');

const DEFAULT_POLL_SECONDS = 90;
let timer = null;
let polling = false;
let lastPollStartedAt = null;
let lastPollFinishedAt = null;
let lastPollError = '';

function clampPollSeconds() {
  const raw = Number(process.env.CREATOR_POLL_SECONDS || DEFAULT_POLL_SECONDS);
  return Number.isFinite(raw) ? Math.max(60, Math.min(Math.floor(raw), 900)) : DEFAULT_POLL_SECONDS;
}

function sourceOf(rule) {
  const raw = String(rule?.source || '').trim();
  if (rule?.platform === 'youtube') return raw;
  return (rule?.platform === 'tiktok' ? raw.replace(/^@/, '') : raw).toLowerCase();
}

function sourceKey(rule) {
  return `${rule.platform}:${sourceOf(rule)}`;
}

function platformLabel(platform) {
  return { twitch: 'Twitch', youtube: 'YouTube', tiktok: 'TikTok' }[platform] || platform;
}

function eventLabel(event) {
  return {
    live: 'Live-Start',
    upload: 'Neuer Upload',
    title_change: 'Titel geändert',
    category_change: 'Kategorie geändert'
  }[event] || event;
}

function sampleSnapshot(rule) {
  const platform = rule.platform;
  const source = sourceOf(rule) || 'creator';
  if (platform === 'youtube' || (platform === 'tiktok' && rule.event === 'upload')) {
    return {
      platform,
      source,
      creator: rule.displayName || 'Creator',
      live: false,
      id: 'demo-video',
      eventKey: `demo:${platform}:upload`,
      title: platform === 'tiktok' ? 'Neues TikTok ist online ✨' : 'Mein neues Video ist da!',
      game: '',
      url: platform === 'tiktok' ? 'https://www.tiktok.com/' : 'https://www.youtube.com/',
      thumbnail: '',
      avatar: '',
      publishedAt: new Date().toISOString(),
      startedAt: new Date().toISOString(),
      viewers: platform === 'tiktok' ? 12400 : 0
    };
  }
  return {
    platform,
    source,
    creator: rule.displayName || source || 'Creator',
    live: true,
    id: 'demo-live',
    eventKey: `demo:${platform}:live`,
    title: platform === 'tiktok' ? 'Wir sind live ✨' : 'Ranked Grind mit der Community',
    game: platform === 'twitch' ? 'VALORANT' : '',
    url: platform === 'tiktok' ? 'https://www.tiktok.com/' : 'https://www.twitch.tv/',
    thumbnail: '',
    avatar: '',
    startedAt: new Date().toISOString(),
    viewers: 128
  };
}

function templateVariables(rule, snapshot) {
  return {
    creator: snapshot.creator || rule.displayName || sourceOf(rule),
    title: snapshot.title || '',
    game: snapshot.game || '',
    url: snapshot.url || '',
    platform: platformLabel(rule.platform),
    source: sourceOf(rule),
    viewers: snapshot.viewers ? String(snapshot.viewers) : '0',
    event: eventLabel(rule.event)
  };
}

function renderTemplate(template, variables) {
  let value = String(template || '');
  for (const [key, replacement] of Object.entries(variables)) {
    value = value.replaceAll(`{${key}}`, String(replacement || ''));
  }
  return value;
}

function normalizeColor(value, platform) {
  if (/^#[0-9A-F]{6}$/i.test(String(value || ''))) return String(value).toUpperCase();
  return { twitch: '#9146FF', youtube: '#FF0000', tiktok: '#FE2C55' }[platform] || '#5865F2';
}

function defaultEmbedTitle(rule) {
  if (rule.platform === 'youtube') return '🎬 {creator} hat ein neues Video';
  if (rule.platform === 'tiktok' && rule.event === 'upload') return '🎵 Neues TikTok von {creator}';
  if (rule.event === 'category_change') return '🎮 {creator} spielt jetzt {game}';
  if (rule.event === 'title_change') return '✏️ Neuer Stream-Titel';
  return '🔴 {creator} ist jetzt live!';
}

function defaultEmbedDescription(rule) {
  if (rule.platform === 'youtube') return '**{title}**\n\nJetzt auf YouTube ansehen.';
  if (rule.platform === 'tiktok' && rule.event === 'upload') return '**{title}**\n\nJetzt auf TikTok ansehen.';
  if (rule.event === 'category_change') return '**{title}**\nNeue Kategorie: **{game}**';
  if (rule.event === 'title_change') return '**{title}**';
  return '**{title}**\n{game}';
}

function defaultButtonLabel(rule) {
  if (rule.platform === 'youtube') return 'Video ansehen';
  if (rule.platform === 'tiktok') return rule.event === 'upload' ? 'TikTok ansehen' : 'TikTok öffnen';
  return 'Stream ansehen';
}

function buildNotificationPayload(rule, snapshot, options = {}) {
  const vars = templateVariables(rule, snapshot);
  const mentionRoleId = options.allowPing === false ? '' : String(rule.pingRoleId || '');
  const mention = mentionRoleId ? `<@&${mentionRoleId}>` : '';
  const message = renderTemplate(rule.message || '', vars).trim();
  const content = [mention, message].filter(Boolean).join(' ').slice(0, 2000) || undefined;
  const embedTitle = renderTemplate(rule.embedTitle || defaultEmbedTitle(rule), vars).trim().slice(0, 256);
  const embedDescription = renderTemplate(rule.embedDescription || defaultEmbedDescription(rule), vars).trim().slice(0, 4096);
  const embed = new EmbedBuilder()
    .setColor(normalizeColor(rule.color, rule.platform))
    .setTitle(embedTitle || `${vars.creator} · ${vars.event}`)
    .setDescription(embedDescription || vars.title || vars.url || 'Neue Creator-Aktivität')
    .setFooter({ text: `RAKU Creator Hub · ${vars.platform}${options.test ? ' · TEST' : ''}` })
    .setTimestamp();

  if (snapshot.avatar && /^https?:\/\//i.test(snapshot.avatar)) embed.setAuthor({ name: vars.creator, iconURL: snapshot.avatar });
  else embed.setAuthor({ name: vars.creator });
  if (rule.showThumbnail !== false && snapshot.thumbnail && /^https?:\/\//i.test(snapshot.thumbnail)) embed.setImage(snapshot.thumbnail);
  if (snapshot.game) embed.addFields({ name: 'Kategorie', value: snapshot.game.slice(0, 1024), inline: true });
  if (snapshot.viewers && rule.event === 'live') embed.addFields({ name: 'Zuschauer', value: Number(snapshot.viewers).toLocaleString('de-DE'), inline: true });

  const components = [];
  if (snapshot.url && /^https?:\/\//i.test(snapshot.url)) {
    components.push(new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setStyle(ButtonStyle.Link)
        .setURL(snapshot.url)
        .setLabel(String(rule.buttonLabel || defaultButtonLabel(rule)).slice(0, 80))
    ));
  }

  return {
    content,
    embeds: [embed],
    components,
    allowedMentions: mentionRoleId ? { parse: [], roles: [mentionRoleId] } : { parse: [] }
  };
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

function parseTime(value) {
  const match = String(value || '').match(/^(\d{2}):(\d{2})$/);
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h > 23 || m > 59) return null;
  return h * 60 + m;
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
  const titleNeedle = String(rule.filterTitle || '').trim().toLowerCase();
  const gameNeedle = String(rule.filterGame || '').trim().toLowerCase();
  if (titleNeedle && !String(snapshot.title || '').toLowerCase().includes(titleNeedle)) return false;
  if (gameNeedle && !String(snapshot.game || '').toLowerCase().includes(gameNeedle)) return false;
  return true;
}

function eventForRule(rule, snapshot, state) {
  if (!snapshot || snapshot.error) return null;
  const source = sourceOf(rule);

  if (rule.event === 'upload') {
    if (!snapshot.id) return null;
    const key = `${rule.platform}:${source}:upload:${snapshot.id}`;
    return key !== state.lastEventKey ? { key, kind: 'upload' } : null;
  }

  if (rule.event === 'live') {
    if (!snapshot.live || !snapshot.id) return null;
    const key = `${rule.platform}:${source}:live:${snapshot.id}`;
    return key !== state.lastEventKey ? { key, kind: 'live' } : null;
  }

  if (!snapshot.live || !snapshot.id || state.lastLiveId !== snapshot.id) return null;
  if (rule.event === 'title_change' && state.lastTitle && snapshot.title && state.lastTitle !== snapshot.title) {
    return { key: `${rule.platform}:${source}:title:${snapshot.id}:${snapshot.title}`, kind: 'title_change' };
  }
  if (rule.event === 'category_change' && state.lastGame && snapshot.game && state.lastGame !== snapshot.game) {
    return { key: `${rule.platform}:${source}:game:${snapshot.id}:${snapshot.game}`, kind: 'category_change' };
  }
  return null;
}

function currentObservation(rule, snapshot, state, event) {
  const next = {
    initialized: true,
    lastObservedAt: new Date().toISOString(),
    lastProviderError: '',
    lastProviderErrorAt: null,
    lastTitle: snapshot?.title || '',
    lastGame: snapshot?.game || '',
    lastLiveId: snapshot?.live ? (snapshot.id || '') : '',
    lastSnapshot: snapshot ? {
      creator: snapshot.creator || '',
      live: Boolean(snapshot.live),
      id: snapshot.id || '',
      title: snapshot.title || '',
      game: snapshot.game || '',
      url: snapshot.url || '',
      viewers: Number(snapshot.viewers || 0),
      startedAt: snapshot.startedAt || snapshot.publishedAt || ''
    } : null
  };
  if (event?.key) next.lastEventKey = event.key;
  else if (!state.initialized && rule.event === 'upload' && snapshot?.id) next.lastEventKey = `${rule.platform}:${sourceOf(rule)}:upload:${snapshot.id}`;
  else if (!state.initialized && rule.event === 'live' && snapshot?.live && snapshot?.id) next.lastEventKey = `${rule.platform}:${sourceOf(rule)}:live:${snapshot.id}`;
  return next;
}

async function sendRuleNotification(client, guildId, rule, snapshot, options = {}) {
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

function logHistory(guildId, rule, status, message, snapshot = null) {
  appendCreatorHistory(guildId, {
    ruleId: rule.id,
    ruleName: rule.name,
    platform: rule.platform,
    source: sourceOf(rule),
    event: rule.event,
    status,
    message: String(message || '').slice(0, 500),
    title: String(snapshot?.title || '').slice(0, 200),
    url: String(snapshot?.url || '').slice(0, 500)
  });
}

async function processRule(client, guildId, config, rule, snapshot) {
  const state = getCreatorRuleState(guildId, rule.id);

  if (snapshot?.error) {
    const now = Date.now();
    const previous = state.lastProviderErrorAt ? Date.parse(state.lastProviderErrorAt) : 0;
    if (!previous || now - previous > 30 * 60 * 1000 || state.lastProviderError !== snapshot.error) {
      logHistory(guildId, rule, 'error', snapshot.error);
    }
    setCreatorRuleState(guildId, rule.id, {
      lastProviderError: snapshot.error,
      lastProviderErrorAt: new Date().toISOString(),
      lastObservedAt: new Date().toISOString()
    });
    return;
  }

  const event = eventForRule(rule, snapshot, state);
  const firstObservation = !state.initialized;
  const observation = currentObservation(rule, snapshot, state, event);

  if (!event) {
    setCreatorRuleState(guildId, rule.id, observation);
    if (firstObservation) logHistory(guildId, rule, 'baseline', 'Quelle initialisiert – keine rückwirkende Benachrichtigung.', snapshot);
    return;
  }

  if (firstObservation && !rule.announceFirstMatch) {
    setCreatorRuleState(guildId, rule.id, observation);
    logHistory(guildId, rule, 'baseline', 'Aktueller Zustand als Baseline übernommen.', snapshot);
    return;
  }

  if (!matchesFilters(rule, snapshot)) {
    setCreatorRuleState(guildId, rule.id, observation);
    logHistory(guildId, rule, 'filtered', 'Event erkannt, aber durch Filter verworfen.', snapshot);
    return;
  }

  const cooldownMs = Math.max(0, Number(rule.cooldownMinutes || 0)) * 60 * 1000;
  const lastSent = state.lastSentAt ? Date.parse(state.lastSentAt) : 0;
  if (cooldownMs && lastSent && Date.now() - lastSent < cooldownMs) {
    setCreatorRuleState(guildId, rule.id, observation);
    logHistory(guildId, rule, 'suppressed', 'Event wegen Cooldown unterdrückt.', snapshot);
    return;
  }

  const quiet = inQuietHours(rule, config.timezone);
  if (quiet && rule.quietHours?.mode === 'suppress') {
    setCreatorRuleState(guildId, rule.id, observation);
    logHistory(guildId, rule, 'suppressed', 'Event innerhalb der Quiet Hours unterdrückt.', snapshot);
    return;
  }

  try {
    const result = await sendRuleNotification(client, guildId, rule, snapshot, { allowPing: !(quiet && rule.quietHours?.mode === 'no_ping') });
    setCreatorRuleState(guildId, rule.id, {
      ...observation,
      lastSentAt: new Date().toISOString(),
      lastSentMessageId: result.message.id,
      lastSentChannelId: result.message.channelId
    });
    logHistory(guildId, rule, 'sent', quiet && !result.pinged ? 'Benachrichtigung ohne Ping gesendet.' : 'Benachrichtigung gesendet.', snapshot);
  } catch (error) {
    setCreatorRuleState(guildId, rule.id, observation);
    logHistory(guildId, rule, 'error', `Discord-Ausgabe fehlgeschlagen: ${error.message}`, snapshot);
  }
}

async function mapLimit(items, limit, fn) {
  const values = [...items];
  const result = new Map();
  let cursor = 0;
  async function worker() {
    while (cursor < values.length) {
      const index = cursor++;
      const item = values[index];
      try { result.set(item, await fn(item)); }
      catch (error) { result.set(item, { error: String(error.message || error) }); }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, values.length) }, () => worker()));
  return result;
}

async function loadSnapshots(ruleEntries) {
  const snapshots = new Map();
  const twitch = new Set();
  const youtube = new Set();
  const tiktok = new Set();
  for (const { rule } of ruleEntries) {
    const source = sourceOf(rule);
    if (!source) continue;
    if (rule.platform === 'twitch') twitch.add(source);
    else if (rule.platform === 'youtube') youtube.add(source);
    else if (rule.platform === 'tiktok') tiktok.add(source);
  }

  if (twitch.size) {
    try {
      const data = await fetchTwitchStatuses([...twitch]);
      for (const source of twitch) snapshots.set(`twitch:${source}`, data.get(source) || { error: 'Twitch Creator wurde nicht gefunden.' });
    } catch (error) {
      for (const source of twitch) snapshots.set(`twitch:${source}`, { error: String(error.message || error) });
    }
  }

  const yt = await mapLimit(youtube, 4, fetchYouTubeStatus);
  for (const [source, value] of yt) snapshots.set(`youtube:${source}`, value);
  const tt = await mapLimit(tiktok, 4, fetchTikTokSnapshot);
  for (const [source, value] of tt) snapshots.set(`tiktok:${source}`, value);
  return snapshots;
}

function selectSnapshot(rule, snapshot) {
  if (rule.platform === 'tiktok') return snapshotForTikTokRule(rule, snapshot);
  return snapshot;
}

async function pollCreatorHub(client) {
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
        if (rule.enabled === false || !rule.source || !rule.channelId) continue;
        entries.push({ guildId, config, rule });
      }
    }
    const snapshots = await loadSnapshots(entries);
    for (const entry of entries) {
      const raw = snapshots.get(sourceKey(entry.rule)) || { error: 'Provider lieferte keinen Status.' };
      await processRule(client, entry.guildId, entry.config, entry.rule, selectSnapshot(entry.rule, raw));
    }
  } catch (error) {
    lastPollError = String(error.message || error);
    console.warn(`[CREATOR] Poll failed: ${lastPollError}`);
  } finally {
    lastPollFinishedAt = new Date().toISOString();
    polling = false;
  }
}

async function checkCreatorRule(rule) {
  const source = sourceOf(rule);
  if (rule.platform === 'twitch') {
    const map = await fetchTwitchStatuses([source]);
    return map.get(source) || null;
  }
  if (rule.platform === 'youtube') return fetchYouTubeStatus(source);
  if (rule.platform === 'tiktok') return selectSnapshot(rule, await fetchTikTokSnapshot(source));
  throw new Error('Unbekannter Provider.');
}

async function sendCreatorTest(client, guildId, rule) {
  const snapshot = sampleSnapshot(rule);
  const result = await sendRuleNotification(client, guildId, rule, snapshot, { test: true, allowPing: false });
  logHistory(guildId, rule, 'test', 'Testbenachrichtigung gesendet – ohne Rollen-Ping.', snapshot);
  return { messageId: result.message.id, channelId: result.message.channelId };
}

function getRuntimeStatus() {
  const providers = getProviderHealth();
  providers.tiktok = getTikTokProviderHealth();
  return {
    running: Boolean(timer),
    polling,
    pollSeconds: clampPollSeconds(),
    lastPollStartedAt,
    lastPollFinishedAt,
    lastPollError,
    providers
  };
}

function startCreatorRuntime(client) {
  if (timer) return;
  const seconds = clampPollSeconds();
  const run = () => pollCreatorHub(client).catch(error => console.warn(`[CREATOR] Runtime failed: ${error.message}`));
  setTimeout(run, 5000);
  timer = setInterval(run, seconds * 1000);
  timer.unref?.();
  console.log(`[CREATOR] Runtime active · poll every ${seconds}s`);
}

module.exports = {
  startCreatorRuntime,
  pollCreatorHub,
  checkCreatorRule,
  sendCreatorTest,
  getRuntimeStatus,
  buildNotificationPayload,
  sampleSnapshot,
  eventForRule,
  selectSnapshot
};
