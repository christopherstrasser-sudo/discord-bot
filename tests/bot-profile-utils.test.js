const test = require('node:test');
const assert = require('node:assert/strict');
const {
  MAX_NICKNAME,
  MAX_BIO,
  validateNickname,
  validateBio,
  validateAvatarData,
  guildMemberAvatarUrl,
  sanitizeBotProfileInput
} = require('../src/bot-profile-utils');

test('trims and validates per-server bot nickname', () => {
  assert.equal(validateNickname('  RAKU Support  '), 'RAKU Support');
  assert.equal(validateNickname(''), '');
  assert.throws(() => validateNickname('x'.repeat(MAX_NICKNAME + 1)), /maximal 32/);
});

test('trims and validates bot bio', () => {
  assert.equal(validateBio('  Dein Community Bot  '), 'Dein Community Bot');
  assert.throws(() => validateBio('x'.repeat(MAX_BIO + 1)), /maximal 190/);
});

test('accepts supported avatar data URI', () => {
  const data = `data:image/png;base64,${Buffer.from('fake-png').toString('base64')}`;
  assert.equal(validateAvatarData(data), data);
});

test('rejects malformed avatar input', () => {
  assert.throws(() => validateAvatarData('https://example.test/avatar.png'), /PNG-, JPG-, GIF- oder WebP/);
  assert.throws(() => validateAvatarData('data:image/svg+xml;base64,PHN2Zz4='), /PNG-, JPG-, GIF- oder WebP/);
});

test('rejects oversized avatar data', () => {
  const huge = Buffer.alloc(769 * 1024, 1).toString('base64');
  assert.throws(() => validateAvatarData(`data:image/png;base64,${huge}`), /zu groß/);
});

test('builds guild member avatar CDN URLs', () => {
  assert.equal(
    guildMemberAvatarUrl('123', '456', 'abc123'),
    'https://cdn.discordapp.com/guilds/123/users/456/avatars/abc123.png?size=256'
  );
  assert.equal(
    guildMemberAvatarUrl('123', '456', 'a_animated'),
    'https://cdn.discordapp.com/guilds/123/users/456/avatars/a_animated.gif?size=256'
  );
  assert.equal(guildMemberAvatarUrl('123', '456', ''), '');
});

test('sanitizes partial Bot Profile patches without inventing fields', () => {
  const patch = sanitizeBotProfileInput({ nickname: ' Server Bot ', resetAvatar: true });
  assert.equal(patch.hasNickname, true);
  assert.equal(patch.nickname, 'Server Bot');
  assert.equal(patch.hasBio, false);
  assert.equal(patch.bio, undefined);
  assert.equal(patch.resetAvatar, true);
});