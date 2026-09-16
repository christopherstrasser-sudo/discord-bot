const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeSocialHandle } = require('../src/creator-social-providers');

test('normalizes Instagram handles and profile URLs', () => {
  assert.equal(normalizeSocialHandle('instagram', '@Rakulein'), 'rakulein');
  assert.equal(normalizeSocialHandle('instagram', 'https://www.instagram.com/Rakulein/'), 'rakulein');
});

test('normalizes Bluesky handles and profile URLs', () => {
  assert.equal(normalizeSocialHandle('bluesky', '@rakulein.bsky.social'), 'rakulein.bsky.social');
  assert.equal(normalizeSocialHandle('bluesky', 'https://bsky.app/profile/rakulein.bsky.social'), 'rakulein.bsky.social');
  assert.equal(normalizeSocialHandle('bluesky', 'did:plc:abc123'), 'did:plc:abc123');
});

test('normalizes X handles and legacy Twitter URLs', () => {
  assert.equal(normalizeSocialHandle('x', '@Rakulein'), 'rakulein');
  assert.equal(normalizeSocialHandle('x', 'https://x.com/Rakulein'), 'rakulein');
  assert.equal(normalizeSocialHandle('x', 'https://twitter.com/Rakulein'), 'rakulein');
});

test('rejects invalid social handles', () => {
  assert.throws(() => normalizeSocialHandle('instagram', 'bad handle'), /Instagram/);
  assert.throws(() => normalizeSocialHandle('bluesky', 'not-a-handle'), /Bluesky/);
  assert.throws(() => normalizeSocialHandle('x', 'this-handle-is-way-too-long'), /X:/);
});
