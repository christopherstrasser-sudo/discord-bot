const fs = require('fs');
const path = require('path');
const { recordAnalyticsEvent } = require('./analytics-store');

const dataDir = path.join(__dirname, '..', 'data');
const configFile = path.join(dataDir, 'ticket-config.json');
const stateFile = path.join(dataDir, 'ticket-state.json');
const transcriptRoot = path.join(dataDir, 'ticket-transcripts');

const DEFAULT_CONFIG = Object.freeze({
  enabled: false,
  panels: []
});

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function ensureDir() {
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(transcriptRoot, { recursive: true });
}

function readJson(file, fallback) {
  ensureDir();
  if (!fs.existsSync(file)) {
    fs.writeFileSync(file, JSON.stringify(fallback, null, 2), 'utf8');
    return clone(fallback);
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!parsed || typeof parsed !== 'object') throw new Error('Invalid JSON root');
    return parsed;
  } catch (error) {
    const backup = `${file}.corrupt-${Date.now()}`;
    try { fs.copyFileSync(file, backup); } catch {}
    console.warn(`[TICKETS] Corrupt datastore backed up to ${backup}`);
    fs.writeFileSync(file, JSON.stringify(fallback, null, 2), 'utf8');
    return clone(fallback);
  }
}

function writeJson(file, value) {
  ensureDir();
  const temp = `${file}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(value, null, 2), 'utf8');
  fs.renameSync(temp, file);
}

function readConfigStore() {
  const store = readJson(configFile, { schemaVersion: 1, guilds: {} });
  store.guilds ||= {};
  return store;
}

function getTicketConfig(guildId) {
  const store = readConfigStore();
  const saved = store.guilds[guildId] || {};
  return {
    enabled: Boolean(saved.enabled),
    panels: Array.isArray(saved.panels) ? clone(saved.panels) : []
  };
}

function setTicketConfig(guildId, config, updatedBy = null) {
  const store = readConfigStore();
  store.guilds[guildId] = {
    enabled: Boolean(config?.enabled),
    panels: Array.isArray(config?.panels) ? clone(config.panels) : [],
    updatedAt: new Date().toISOString(),
    updatedBy
  };
  writeJson(configFile, store);
  return getTicketConfig(guildId);
}

function readStateStore() {
  const store = readJson(stateFile, { schemaVersion: 1, guilds: {} });
  store.guilds ||= {};
  return store;
}

function ensureGuildState(store, guildId) {
  store.guilds[guildId] ||= { counter: 0, tickets: {} };
  store.guilds[guildId].counter ||= 0;
  store.guilds[guildId].tickets ||= {};
  return store.guilds[guildId];
}

function createTicketRecord(guildId, record) {
  const store = readStateStore();
  const guild = ensureGuildState(store, guildId);
  guild.counter += 1;
  const number = guild.counter;
  const id = `T${String(number).padStart(4, '0')}-${Math.random().toString(36).slice(2, 8)}`;
  const next = {
    ...clone(record),
    id,
    number,
    status: 'open',
    claimedBy: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    closedAt: null,
    closedBy: null,
    transcriptPath: ''
  };
  guild.tickets[id] = next;
  writeJson(stateFile, store);
  return clone(next);
}

function getTicketRecord(guildId, ticketId) {
  const store = readStateStore();
  return clone(store.guilds[guildId]?.tickets?.[ticketId] || null);
}

function getTicketByChannel(guildId, channelId) {
  const store = readStateStore();
  const tickets = Object.values(store.guilds[guildId]?.tickets || {});
  return clone(tickets.find(ticket => ticket.channelId === channelId) || null);
}

function listGuildTickets(guildId) {
  const store = readStateStore();
  return clone(Object.values(store.guilds[guildId]?.tickets || {}));
}

function updateTicketRecord(guildId, ticketId, patch) {
  const store = readStateStore();
  const guild = ensureGuildState(store, guildId);
  const previous = guild.tickets[ticketId];
  if (!previous) return null;
  guild.tickets[ticketId] = {
    ...previous,
    ...clone(patch),
    updatedAt: new Date().toISOString()
  };
  const next = guild.tickets[ticketId];
  writeJson(stateFile, store);

  if (!previous.channelId && next.channelId && next.status === 'open') {
    recordAnalyticsEvent(guildId, 'ticket_open');
  }
  if (previous.status === 'open' && next.status === 'closed') {
    const resolutionMinutes = previous.createdAt ? Math.max(0, (Date.parse(next.closedAt || next.updatedAt) - Date.parse(previous.createdAt)) / 60000) : 0;
    recordAnalyticsEvent(guildId, 'ticket_close', { resolutionMinutes });
  }

  return clone(next);
}

function countOpenTickets(guildId, userId, panelId = null) {
  return listGuildTickets(guildId).filter(ticket =>
    ticket.status === 'open' &&
    ticket.userId === userId &&
    (!panelId || ticket.panelId === panelId)
  ).length;
}

function saveTranscript(guildId, ticketId, content) {
  ensureDir();
  const guildDir = path.join(transcriptRoot, guildId);
  fs.mkdirSync(guildDir, { recursive: true });
  const file = path.join(guildDir, `${ticketId}.txt`);
  fs.writeFileSync(file, String(content || ''), 'utf8');
  updateTicketRecord(guildId, ticketId, { transcriptPath: file });
  return file;
}

module.exports = {
  DEFAULT_CONFIG,
  getTicketConfig,
  setTicketConfig,
  createTicketRecord,
  getTicketRecord,
  getTicketByChannel,
  listGuildTickets,
  updateTicketRecord,
  countOpenTickets,
  saveTranscript
};
