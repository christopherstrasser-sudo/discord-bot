const fs = require('fs');
const path = require('path');

const dataDir = process.env.RAKU_DATA_DIR || path.join(__dirname, '..', 'data');
const dataFile = path.join(dataDir, 'analytics.json');
const FLUSH_DELAY_MS = 1500;
const DEFAULT_CONFIG = Object.freeze({
  enabled: false,
  retentionDays: 90,
  timezone: process.env.ANALYTICS_DEFAULT_TIMEZONE || 'Europe/Berlin'
});

let cache = null;
let dirty = false;
let flushTimer = null;

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function ensureDir() {
  fs.mkdirSync(dataDir, { recursive: true });
}

function freshStore() {
  return { schemaVersion: 1, guilds: {} };
}

function loadStore() {
  if (cache) return cache;
  ensureDir();
  if (!fs.existsSync(dataFile)) {
    cache = freshStore();
    fs.writeFileSync(dataFile, JSON.stringify(cache, null, 2), 'utf8');
    return cache;
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
    if (!parsed || typeof parsed !== 'object') throw new Error('Invalid analytics datastore root');
    parsed.guilds ||= {};
    cache = parsed;
  } catch (error) {
    const backup = `${dataFile}.corrupt-${Date.now()}`;
    try { fs.copyFileSync(dataFile, backup); } catch {}
    console.warn(`[ANALYTICS] Corrupt datastore backed up to ${backup}`);
    cache = freshStore();
    fs.writeFileSync(dataFile, JSON.stringify(cache, null, 2), 'utf8');
  }
  return cache;
}

function validTimezone(value) {
  const timezone = String(value || '').trim();
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(new Date());
    return timezone;
  } catch {
    return DEFAULT_CONFIG.timezone;
  }
}

function normalizeConfig(input = {}) {
  const retention = Number(input.retentionDays);
  return {
    enabled: Boolean(input.enabled),
    retentionDays: Number.isFinite(retention) ? Math.max(30, Math.min(365, Math.round(retention))) : DEFAULT_CONFIG.retentionDays,
    timezone: validTimezone(input.timezone || DEFAULT_CONFIG.timezone)
  };
}

function ensureGuild(store, guildId) {
  store.guilds[guildId] ||= {
    config: clone(DEFAULT_CONFIG),
    startedAt: null,
    updatedAt: null,
    updatedBy: null,
    days: {}
  };
  const guild = store.guilds[guildId];
  guild.config = normalizeConfig({ ...DEFAULT_CONFIG, ...(guild.config || {}) });
  guild.days ||= {};
  return guild;
}

function getAnalyticsConfig(guildId) {
  const guild = ensureGuild(loadStore(), guildId);
  return { ...clone(guild.config), startedAt: guild.startedAt || null };
}

function scheduleFlush() {
  dirty = true;
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    flushAnalyticsStore();
  }, FLUSH_DELAY_MS);
  if (typeof flushTimer.unref === 'function') flushTimer.unref();
}

function flushAnalyticsStore() {
  if (!dirty || !cache) return;
  ensureDir();
  const temp = `${dataFile}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(cache, null, 2), 'utf8');
  fs.renameSync(temp, dataFile);
  dirty = false;
}

function dateParts(date, timezone) {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      hourCycle: 'h23'
    }).formatToParts(date);
    const pick = type => parts.find(part => part.type === type)?.value || '';
    return { dateKey: `${pick('year')}-${pick('month')}-${pick('day')}`, hour: Number(pick('hour') || 0) };
  } catch {
    return { dateKey: date.toISOString().slice(0, 10), hour: date.getUTCHours() };
  }
}

function emptyDay() {
  return {
    messages: 0,
    joins: 0,
    leaves: 0,
    voiceMinutes: 0,
    voiceSessions: 0,
    peakVoice: 0,
    ticketsOpened: 0,
    ticketsClosed: 0,
    ticketResolutionMinutes: 0,
    commands: 0,
    moderationActions: 0,
    creatorEvents: 0,
    hours: Array(24).fill(0),
    messageChannels: {},
    voiceChannels: {},
    commandNames: {}
  };
}

function safeNumber(value, min = 0, max = Number.MAX_SAFE_INTEGER) {
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.max(min, Math.min(max, number));
}

function incrementMap(map, key, amount = 1) {
  const id = String(key || '').trim();
  if (!id) return;
  map[id] = safeNumber(map[id]) + amount;
}

function pruneGuild(guild, now = new Date()) {
  const retention = guild.config.retentionDays || DEFAULT_CONFIG.retentionDays;
  const cutoff = new Date(now.getTime() - (retention + 2) * 86400000);
  const cutoffKey = dateParts(cutoff, guild.config.timezone).dateKey;
  for (const key of Object.keys(guild.days || {})) {
    if (key < cutoffKey) delete guild.days[key];
  }
}

function updateAnalyticsConfig(guildId, patch = {}, updatedBy = null) {
  const store = loadStore();
  const guild = ensureGuild(store, guildId);
  const previousEnabled = guild.config.enabled;
  guild.config = normalizeConfig({ ...guild.config, ...patch });
  if (!previousEnabled && guild.config.enabled && !guild.startedAt) guild.startedAt = new Date().toISOString();
  guild.updatedAt = new Date().toISOString();
  guild.updatedBy = updatedBy || null;
  pruneGuild(guild);
  scheduleFlush();
  return getAnalyticsConfig(guildId);
}

function clearAnalyticsData(guildId, updatedBy = null) {
  const store = loadStore();
  const guild = ensureGuild(store, guildId);
  guild.days = {};
  guild.startedAt = guild.config.enabled ? new Date().toISOString() : null;
  guild.updatedAt = new Date().toISOString();
  guild.updatedBy = updatedBy || null;
  scheduleFlush();
  return getAnalyticsConfig(guildId);
}

function recordAnalyticsEvent(guildId, type, meta = {}, at = new Date()) {
  if (!guildId) return false;
  const store = loadStore();
  const guild = ensureGuild(store, String(guildId));
  if (!guild.config.enabled) return false;

  const when = at instanceof Date ? at : new Date(at);
  if (Number.isNaN(when.getTime())) return false;
  const { dateKey, hour } = dateParts(when, guild.config.timezone);
  const day = guild.days[dateKey] ||= emptyDay();

  switch (type) {
    case 'message':
      day.messages += 1;
      day.hours[Math.max(0, Math.min(23, hour))] += 1;
      incrementMap(day.messageChannels, meta.channelId, 1);
      break;
    case 'join': day.joins += 1; break;
    case 'leave': day.leaves += 1; break;
    case 'voice_session': {
      const minutes = safeNumber(meta.minutes, 0, 1440);
      if (minutes <= 0) return false;
      day.voiceMinutes += minutes;
      day.voiceSessions += 1;
      incrementMap(day.voiceChannels, meta.channelId, minutes);
      break;
    }
    case 'voice_peak':
      day.peakVoice = Math.max(day.peakVoice || 0, Math.round(safeNumber(meta.count, 0, 1000000)));
      break;
    case 'ticket_open': day.ticketsOpened += 1; break;
    case 'ticket_close':
      day.ticketsClosed += 1;
      day.ticketResolutionMinutes += safeNumber(meta.resolutionMinutes, 0, 525600);
      break;
    case 'command':
      day.commands += 1;
      incrementMap(day.commandNames, String(meta.command || '').slice(0, 80), 1);
      break;
    case 'moderation': day.moderationActions += 1; break;
    case 'creator_event': day.creatorEvents += 1; break;
    default: return false;
  }

  pruneGuild(guild, when);
  scheduleFlush();
  return true;
}

function rangeKeys(days, timezone, now = new Date(), offset = 0) {
  const keys = [];
  for (let index = days - 1 + offset; index >= offset; index -= 1) {
    keys.push(dateParts(new Date(now.getTime() - index * 86400000), timezone).dateKey);
  }
  return [...new Set(keys)];
}

function emptyTotals() {
  return {
    messages: 0, joins: 0, leaves: 0, voiceMinutes: 0, voiceSessions: 0, peakVoice: 0,
    ticketsOpened: 0, ticketsClosed: 0, ticketResolutionMinutes: 0, commands: 0,
    moderationActions: 0, creatorEvents: 0, hours: Array(24).fill(0),
    messageChannels: {}, voiceChannels: {}, commandNames: {}
  };
}

function mergeDay(target, day = {}) {
  for (const key of ['messages','joins','leaves','voiceMinutes','voiceSessions','ticketsOpened','ticketsClosed','ticketResolutionMinutes','commands','moderationActions','creatorEvents']) {
    target[key] += safeNumber(day[key]);
  }
  target.peakVoice = Math.max(target.peakVoice, safeNumber(day.peakVoice));
  for (let hour = 0; hour < 24; hour += 1) target.hours[hour] += safeNumber(day.hours?.[hour]);
  for (const [key, value] of Object.entries(day.messageChannels || {})) incrementMap(target.messageChannels, key, safeNumber(value));
  for (const [key, value] of Object.entries(day.voiceChannels || {})) incrementMap(target.voiceChannels, key, safeNumber(value));
  for (const [key, value] of Object.entries(day.commandNames || {})) incrementMap(target.commandNames, key, safeNumber(value));
  return target;
}

function totalsFor(guild, keys) {
  const totals = emptyTotals();
  for (const key of keys) mergeDay(totals, guild.days[key]);
  return totals;
}

function sortedMap(map, limit = 6) {
  return Object.entries(map || {})
    .map(([id, value]) => ({ id, value: Math.round(safeNumber(value) * 10) / 10 }))
    .sort((a, b) => b.value - a.value)
    .slice(0, limit);
}

function trend(current, previous) {
  const a = safeNumber(current);
  const b = safeNumber(previous);
  if (b <= 0) return a > 0 ? null : 0;
  return Math.round(((a - b) / b) * 1000) / 10;
}

function buildInsights(current, previous) {
  const insights = [];
  const messageTrend = trend(current.messages, previous.messages);
  const voiceTrend = trend(current.voiceMinutes, previous.voiceMinutes);
  const netGrowth = current.joins - current.leaves;
  const avgTicket = current.ticketsClosed ? current.ticketResolutionMinutes / current.ticketsClosed : 0;
  const busiestHour = current.hours.indexOf(Math.max(...current.hours));
  const totalSignals = current.messages + current.voiceSessions + current.ticketsOpened + current.commands + current.creatorEvents;

  if (!totalSignals) {
    insights.push({ tone: 'info', title: 'Baseline wird aufgebaut', text: 'Sobald Aktivität eintrifft, erscheinen hier automatisch Trends und Auffälligkeiten.' });
    return insights;
  }
  if (messageTrend !== null && current.messages >= 20 && messageTrend <= -20) {
    insights.push({ tone: 'warn', title: 'Chat-Aktivität fällt', text: `${Math.abs(messageTrend).toLocaleString('de-DE')} % weniger Nachrichten als im vorherigen Zeitraum.` });
  } else if (messageTrend !== null && current.messages >= 20 && messageTrend >= 20) {
    insights.push({ tone: 'good', title: 'Chat-Aktivität wächst', text: `${messageTrend.toLocaleString('de-DE')} % mehr Nachrichten als im vorherigen Zeitraum.` });
  }
  if (voiceTrend !== null && current.voiceMinutes >= 60 && Math.abs(voiceTrend) >= 25) {
    insights.push({ tone: voiceTrend > 0 ? 'good' : 'info', title: voiceTrend > 0 ? 'Voice wird stärker genutzt' : 'Voice-Nutzung ist ruhiger', text: `${Math.abs(voiceTrend).toLocaleString('de-DE')} % ${voiceTrend > 0 ? 'mehr' : 'weniger'} Voice-Zeit als zuvor.` });
  }
  if (netGrowth < 0) insights.push({ tone: 'warn', title: 'Negatives Mitgliederwachstum', text: `${Math.abs(netGrowth)} mehr Leaves als Joins im gewählten Zeitraum.` });
  if (avgTicket >= 120 && current.ticketsClosed >= 2) insights.push({ tone: 'warn', title: 'Ticket-Laufzeit beobachten', text: `Geschlossene Tickets brauchten im Schnitt ${Math.round(avgTicket)} Minuten.` });
  if (current.messages > 0) insights.push({ tone: 'info', title: 'Aktivstes Zeitfenster', text: `Die meisten Chat-Nachrichten entstehen aktuell zwischen ${String(busiestHour).padStart(2, '0')}:00 und ${String((busiestHour + 1) % 24).padStart(2, '0')}:00 Uhr.` });
  return insights.slice(0, 4);
}

function getAnalyticsSnapshot(guildId, rangeDays = 7, now = new Date()) {
  const store = loadStore();
  const guild = ensureGuild(store, guildId);
  const days = [7, 30, 90].includes(Number(rangeDays)) ? Number(rangeDays) : 7;
  const currentKeys = rangeKeys(days, guild.config.timezone, now, 0);
  const previousKeys = rangeKeys(days, guild.config.timezone, now, days);
  const current = totalsFor(guild, currentKeys);
  const previous = totalsFor(guild, previousKeys);
  const series = currentKeys.map(key => {
    const day = guild.days[key] || emptyDay();
    return {
      date: key,
      messages: Math.round(safeNumber(day.messages)),
      joins: Math.round(safeNumber(day.joins)),
      leaves: Math.round(safeNumber(day.leaves)),
      voiceMinutes: Math.round(safeNumber(day.voiceMinutes) * 10) / 10,
      tickets: Math.round(safeNumber(day.ticketsOpened)),
      commands: Math.round(safeNumber(day.commands))
    };
  });
  const avgTicketMinutes = current.ticketsClosed ? current.ticketResolutionMinutes / current.ticketsClosed : 0;
  return {
    rangeDays: days,
    timezone: guild.config.timezone,
    startedAt: guild.startedAt || null,
    summary: {
      messages: Math.round(current.messages),
      joins: Math.round(current.joins),
      leaves: Math.round(current.leaves),
      netGrowth: Math.round(current.joins - current.leaves),
      voiceMinutes: Math.round(current.voiceMinutes),
      voiceSessions: Math.round(current.voiceSessions),
      peakVoice: Math.round(current.peakVoice),
      ticketsOpened: Math.round(current.ticketsOpened),
      ticketsClosed: Math.round(current.ticketsClosed),
      avgTicketMinutes: Math.round(avgTicketMinutes),
      commands: Math.round(current.commands),
      moderationActions: Math.round(current.moderationActions),
      creatorEvents: Math.round(current.creatorEvents)
    },
    trends: {
      messages: trend(current.messages, previous.messages),
      voiceMinutes: trend(current.voiceMinutes, previous.voiceMinutes),
      joins: trend(current.joins, previous.joins),
      commands: trend(current.commands, previous.commands),
      ticketsOpened: trend(current.ticketsOpened, previous.ticketsOpened)
    },
    series,
    hours: current.hours.map(value => Math.round(value)),
    topMessageChannels: sortedMap(current.messageChannels),
    topVoiceChannels: sortedMap(current.voiceChannels),
    topCommands: sortedMap(current.commandNames),
    insights: buildInsights(current, previous)
  };
}

function __resetAnalyticsStoreForTests() {
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = null;
  cache = null;
  dirty = false;
}

process.once('beforeExit', () => {
  try { flushAnalyticsStore(); } catch {}
});

module.exports = {
  DEFAULT_CONFIG,
  getAnalyticsConfig,
  updateAnalyticsConfig,
  clearAnalyticsData,
  recordAnalyticsEvent,
  getAnalyticsSnapshot,
  flushAnalyticsStore,
  __resetAnalyticsStoreForTests
};
