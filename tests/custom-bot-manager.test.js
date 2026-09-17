const test = require('node:test');
const assert = require('node:assert/strict');

process.env.SESSION_SECRET ||= 'test-session-secret-for-custom-bot';

const { normalizePresence, inviteUrl } = require('../src/custom-bot-manager');
const { encryptSecret, decryptSecret } = require('../src/custom-bot-store');

test('normalizePresence accepts supported states and trims values', () => {
  const value = normalizePresence({
    status: 'DND',
    activityType: 'watching',
    activityText: '  auf der Community  ',
    activityUrl: 'https://twitch.tv/example'
  });
  assert.deepEqual(value, {
    status: 'dnd',
    activityType: 'watching',
    activityText: 'auf der Community',
    activityUrl: 'https://twitch.tv/example'
  });
});

test('normalizePresence falls back for unsupported values', () => {
  const value = normalizePresence({ status: 'banana', activityType: 'sleeping', activityUrl: 'javascript:alert(1)' });
  assert.equal(value.status, 'online');
  assert.equal(value.activityType, 'playing');
  assert.equal(value.activityUrl, '');
});

test('custom bot token encryption roundtrips without plaintext storage', () => {
  const token = 'super-secret-discord-token.1234';
  const encrypted = encryptSecret(token);
  assert.notEqual(encrypted.ciphertext, token);
  assert.equal(decryptSecret(encrypted), token);
  assert.ok(encrypted.iv);
  assert.ok(encrypted.tag);
});

test('inviteUrl binds invite to the selected guild', () => {
  const url = new URL(inviteUrl('123456789', '987654321'));
  assert.equal(url.hostname, 'discord.com');
  assert.equal(url.searchParams.get('client_id'), '123456789');
  assert.equal(url.searchParams.get('guild_id'), '987654321');
  assert.equal(url.searchParams.get('disable_guild_select'), 'true');
  assert.match(url.searchParams.get('scope'), /applications\.commands/);
});