const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildInstagramBrowserSnapshot,
  buildXBrowserSnapshot
} = require('../src/creator-social-browser');

test('builds Instagram snapshot from browser DOM metadata', () => {
  const snapshot = buildInstagramBrowserSnapshot('rakulein', {
    url: 'https://www.instagram.com/reel/ABC123/',
    title: 'Neuer Reel aus dem Browser',
    thumbnail: 'https://example.test/reel.jpg',
    publishedAt: '2026-09-16T13:00:00Z',
    creator: 'Rakulein'
  });
  assert.equal(snapshot.platform, 'instagram');
  assert.equal(snapshot.id, 'ABC123');
  assert.equal(snapshot.eventKey, 'instagram:rakulein:post:ABC123');
  assert.equal(snapshot.title, 'Neuer Reel aus dem Browser');
  assert.equal(snapshot.thumbnail, 'https://example.test/reel.jpg');
  assert.equal(snapshot.publishedAt, '2026-09-16T13:00:00.000Z');
});

test('builds X snapshot from rendered timeline row', () => {
  const snapshot = buildXBrowserSnapshot('rakulein', {
    id: '1234567890123456789',
    url: 'https://x.com/rakulein/status/1234567890123456789',
    title: 'Post aus der gerenderten Timeline',
    creator: 'Rakulein',
    thumbnail: 'https://pbs.twimg.com/media/example.jpg',
    avatar: 'https://pbs.twimg.com/profile_images/example.jpg',
    publishedAt: '2026-09-16T13:15:00Z'
  });
  assert.equal(snapshot.platform, 'x');
  assert.equal(snapshot.id, '1234567890123456789');
  assert.equal(snapshot.eventKey, 'x:rakulein:post:1234567890123456789');
  assert.equal(snapshot.title, 'Post aus der gerenderten Timeline');
  assert.equal(snapshot.thumbnail, 'https://pbs.twimg.com/media/example.jpg');
  assert.equal(snapshot.publishedAt, '2026-09-16T13:15:00.000Z');
});

test('browser snapshot builders reject missing post links', () => {
  assert.throws(() => buildInstagramBrowserSnapshot('rakulein', { title: 'x' }), /Post-Link/);
  assert.throws(() => buildXBrowserSnapshot('rakulein', { title: 'x' }), /Post-Link/);
});
