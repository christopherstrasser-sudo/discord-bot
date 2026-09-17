const test = require('node:test');
const assert = require('node:assert/strict');

process.env.DISCORD_CLIENT_ID ||= '123456789012345678';
process.env.DISCORD_CLIENT_SECRET ||= 'test-client-secret';
process.env.DISCORD_BOT_TOKEN ||= 'test.bot.token';
process.env.SESSION_SECRET ||= 'test-session-secret-for-custom-bot';

const {
  ActivityType
} = require('discord.js');
const {
  normalizePresence,
  normalizeStreamingUrl,
  activityDisplayText,
  buildActivity,
  inviteUrl
} = require('../src/custom-bot-manager');
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

test('streaming URL accepts Twitch and YouTube HTTPS only', () => {
  assert.equal(normalizeStreamingUrl('https://twitch.tv/rakulein'), 'https://twitch.tv/rakulein');
  assert.equal(normalizeStreamingUrl('https://www.youtube.com/watch?v=test'), 'https://www.youtube.com/watch?v=test');
  assert.equal(normalizeStreamingUrl('http://twitch.tv/rakulein'), '');
  assert.equal(normalizeStreamingUrl('https://example.com/live'), '');
});

test('activityDisplayText adds the visible German activity verb once', () => {
  assert.equal(activityDisplayText({ activityType: 'listening', activityText: 'Spotify' }), 'Hört Spotify');
  assert.equal(activityDisplayText({ activityType: 'streaming', activityText: 'Minecraft' }), 'Streamt Minecraft');
  assert.equal(activityDisplayText({ activityType: 'watching', activityText: 'dem Chat zu' }), 'Schaut dem Chat zu');
  assert.equal(activityDisplayText({ activityType: 'playing', activityText: 'VALORANT' }), 'Spielt VALORANT');
  assert.equal(activityDisplayText({ activityType: 'listening', activityText: 'Hört Spotify' }), 'Hört Spotify');
});

test('buildActivity preserves semantic type while formatting visible name', () => {
  const listening = buildActivity({ activityType: 'listening', activityText: 'Spotify' });
  assert.equal(listening.name, 'Hört Spotify');
  assert.equal(listening.state, 'Spotify');
  assert.equal(listening.type, ActivityType.Listening);

  const streaming = buildActivity({
    activityType: 'streaming',
    activityText: 'Minecraft',
    activityUrl: 'https://twitch.tv/rakulein'
  });
  assert.equal(streaming.name, 'Streamt Minecraft');
  assert.equal(streaming.state, 'Minecraft');
  assert.equal(streaming.type, ActivityType.Streaming);
  assert.equal(streaming.url, 'https://twitch.tv/rakulein');
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