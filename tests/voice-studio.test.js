const test = require('node:test');
const assert = require('node:assert/strict');
const {
  renderRoomName,
  normalizeRoomName,
  normalizeUserLimit,
  roomIsEmpty,
  humanMembers
} = require('../src/voice-studio-runtime');

test('Voice Studio renders room name variables safely', () => {
  const member = {
    displayName: 'Raku',
    user: { username: 'rakulein', globalName: 'Rakulein' }
  };
  assert.equal(renderRoomName('🎧 {displayName} · {username} · #{counter}', member, 12), '🎧 Raku · rakulein · #12');
});

test('Voice Studio strips control characters and clamps Discord channel names', () => {
  const value = `  Hello\u0000   ${'x'.repeat(120)}  `;
  const result = normalizeRoomName(value);
  assert.equal(result.includes('\u0000'), false);
  assert.equal(result.length, 100);
  assert.match(result, /^Hello x+/);
});

test('Voice Studio normalizes user limits to Discord range', () => {
  assert.equal(normalizeUserLimit(-5), 0);
  assert.equal(normalizeUserLimit(0), 0);
  assert.equal(normalizeUserLimit(7.9), 7);
  assert.equal(normalizeUserLimit(120), 99);
  assert.equal(normalizeUserLimit('nope'), 0);
});

test('Voice Studio ignores bots when deciding whether a room is empty', () => {
  const onlyBot = { members: new Map([['bot', { user: { bot: true } }]]) };
  const human = { members: new Map([
    ['bot', { user: { bot: true } }],
    ['user', { user: { bot: false } }]
  ]) };
  assert.equal(roomIsEmpty(onlyBot), true);
  assert.equal(roomIsEmpty(human), false);
  assert.equal(humanMembers(human).length, 1);
});
