const test = require('node:test');
const assert = require('node:assert/strict');

process.env.SESSION_SECRET ||= 'test-session-secret-for-router';

const {
  setSharedClient,
  registerCustomClient,
  unregisterCustomClient,
  setCustomModeActive,
  getActiveClient,
  getActiveGuild,
  shouldHandleGuildEvent,
  botModeStatus
} = require('../src/guild-client-router');

function fakeClient(guildIds = [], ready = true) {
  const cache = new Map(guildIds.map(id => [id, { id, name: `Guild ${id}` }]));
  return {
    guilds: { cache },
    isReady: () => ready
  };
}

test('standard mode routes a guild through the shared ORBIT client', () => {
  const shared = fakeClient(['guild-a']);
  const custom = fakeClient(['guild-a']);
  setSharedClient(shared);
  registerCustomClient('guild-a', custom);
  setCustomModeActive('guild-a', false);

  assert.equal(getActiveClient('guild-a'), shared);
  assert.equal(getActiveGuild('guild-a'), shared.guilds.cache.get('guild-a'));
  assert.equal(shouldHandleGuildEvent(shared, 'guild-a'), true);
  assert.equal(shouldHandleGuildEvent(custom, 'guild-a'), false);

  unregisterCustomClient('guild-a', custom);
});

test('custom mode routes the same guild exclusively through its replacement bot', () => {
  const shared = fakeClient(['guild-b']);
  const custom = fakeClient(['guild-b']);
  setSharedClient(shared);
  registerCustomClient('guild-b', custom);
  setCustomModeActive('guild-b', true);

  assert.equal(getActiveClient('guild-b'), custom);
  assert.equal(getActiveGuild('guild-b'), custom.guilds.cache.get('guild-b'));
  assert.equal(shouldHandleGuildEvent(custom, 'guild-b'), true);
  assert.equal(shouldHandleGuildEvent(shared, 'guild-b'), false);
  assert.equal(botModeStatus('guild-b').mode, 'custom');

  setCustomModeActive('guild-b', false);
  unregisterCustomClient('guild-b', custom);
});

test('active custom mode never silently falls back to the shared bot', () => {
  const shared = fakeClient(['guild-c']);
  const disconnectedCustom = fakeClient(['guild-c'], false);
  setSharedClient(shared);
  registerCustomClient('guild-c', disconnectedCustom);
  setCustomModeActive('guild-c', true);

  assert.equal(getActiveClient('guild-c'), null);
  assert.equal(getActiveGuild('guild-c'), null);
  assert.equal(shouldHandleGuildEvent(shared, 'guild-c'), false);
  assert.equal(botModeStatus('guild-c').activeConnected, false);

  setCustomModeActive('guild-c', false);
  unregisterCustomClient('guild-c', disconnectedCustom);
});