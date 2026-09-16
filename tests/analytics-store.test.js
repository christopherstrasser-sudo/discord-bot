const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'raku-analytics-'));
process.env.RAKU_DATA_DIR = tempDir;

const {
  getAnalyticsConfig,
  updateAnalyticsConfig,
  recordAnalyticsEvent,
  getAnalyticsSnapshot,
  flushAnalyticsStore,
  clearAnalyticsData
} = require('../src/analytics-store');

test('analytics stays opt-in and aggregates without user identifiers', () => {
  const guildId = 'guild-1';
  const at = new Date('2026-09-16T10:15:00Z');
  const now = new Date('2026-09-16T12:00:00Z');

  assert.equal(getAnalyticsConfig(guildId).enabled, false);
  assert.equal(recordAnalyticsEvent(guildId, 'message', { channelId: 'c1', userId: 'user-secret' }, at), false);

  updateAnalyticsConfig(guildId, { enabled: true, timezone: 'UTC', retentionDays: 90 }, 'admin');
  recordAnalyticsEvent(guildId, 'message', { channelId: 'c1', userId: 'user-secret' }, at);
  recordAnalyticsEvent(guildId, 'message', { channelId: 'c1' }, at);
  recordAnalyticsEvent(guildId, 'message', { channelId: 'c2' }, at);
  recordAnalyticsEvent(guildId, 'join', {}, at);
  recordAnalyticsEvent(guildId, 'leave', {}, at);
  recordAnalyticsEvent(guildId, 'voice_session', { channelId: 'v1', minutes: 42.5 }, at);
  recordAnalyticsEvent(guildId, 'voice_peak', { count: 6 }, at);
  recordAnalyticsEvent(guildId, 'ticket_open', {}, at);
  recordAnalyticsEvent(guildId, 'ticket_close', { resolutionMinutes: 55 }, at);
  recordAnalyticsEvent(guildId, 'command', { command: '!lurk' }, at);
  recordAnalyticsEvent(guildId, 'moderation', { kind: 'timeout' }, at);
  recordAnalyticsEvent(guildId, 'creator_event', {}, at);

  const snapshot = getAnalyticsSnapshot(guildId, 7, now);
  assert.equal(snapshot.summary.messages, 3);
  assert.equal(snapshot.summary.netGrowth, 0);
  assert.equal(snapshot.summary.voiceMinutes, 43);
  assert.equal(snapshot.summary.peakVoice, 6);
  assert.equal(snapshot.summary.ticketsOpened, 1);
  assert.equal(snapshot.summary.ticketsClosed, 1);
  assert.equal(snapshot.summary.avgTicketMinutes, 55);
  assert.equal(snapshot.summary.commands, 1);
  assert.equal(snapshot.summary.moderationActions, 1);
  assert.equal(snapshot.summary.creatorEvents, 1);
  assert.deepEqual(snapshot.topMessageChannels[0], { id: 'c1', value: 2 });
  assert.deepEqual(snapshot.topCommands[0], { id: '!lurk', value: 1 });
  assert.equal(snapshot.hours[10], 3);

  flushAnalyticsStore();
  const raw = fs.readFileSync(path.join(tempDir, 'analytics.json'), 'utf8');
  assert.equal(raw.includes('user-secret'), false);
});

test('analytics data can be reset without disabling configuration', () => {
  const guildId = 'guild-2';
  const at = new Date('2026-09-16T10:15:00Z');
  updateAnalyticsConfig(guildId, { enabled: true, timezone: 'UTC', retentionDays: 30 }, 'admin');
  recordAnalyticsEvent(guildId, 'message', { channelId: 'c1' }, at);
  clearAnalyticsData(guildId, 'admin');
  const snapshot = getAnalyticsSnapshot(guildId, 7, new Date('2026-09-16T12:00:00Z'));
  assert.equal(getAnalyticsConfig(guildId).enabled, true);
  assert.equal(snapshot.summary.messages, 0);
});

test.after(() => {
  try { flushAnalyticsStore(); } catch {}
  fs.rmSync(tempDir, { recursive: true, force: true });
});
