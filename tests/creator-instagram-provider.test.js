const test = require('node:test');
const assert = require('node:assert/strict');
const {
  collectMediaItems,
  mediaShortcode,
  normalizeInstagramSnapshot,
  latestOwnSnapshot,
  getInstagramProviderHealth
} = require('../src/creator-instagram-provider');

test('extracts canonical Instagram shortcode from provider payloads', () => {
  assert.equal(mediaShortcode({ code: 'ABC123' }), 'ABC123');
  assert.equal(mediaShortcode({ shortcode: 'XYZ_987' }), 'XYZ_987');
  assert.equal(mediaShortcode({ permalink: 'https://www.instagram.com/reel/REEL_42/' }), 'REEL_42');
});

test('normalizes provider media to shortcode-based event identity', () => {
  const snapshot = normalizeInstagramSnapshot('rakulein', {
    username: 'rakulein',
    full_name: 'Rakulein',
    profile_pic_url: 'https://example.test/avatar.jpg'
  }, {
    pk: '999999999',
    code: 'POST_ABC',
    product_type: 'clips',
    taken_at: 1789990000,
    caption: { text: 'Neuer Reel Post' },
    user: { username: 'rakulein' },
    image_versions2: { candidates: [{ url: 'https://example.test/post.jpg' }] }
  });

  assert.equal(snapshot.id, 'POST_ABC');
  assert.equal(snapshot.providerMediaId, '999999999');
  assert.equal(snapshot.eventKey, 'instagram:rakulein:post:POST_ABC');
  assert.equal(snapshot.url, 'https://www.instagram.com/reel/POST_ABC/');
  assert.equal(snapshot.title, 'Neuer Reel Post');
});

test('picks newest own Instagram media and ignores foreign content', () => {
  const latest = latestOwnSnapshot('rakulein', { username: 'rakulein' }, [
    {
      pk: '1',
      code: 'OLD',
      taken_at: 1789900000,
      user: { username: 'rakulein' }
    },
    {
      pk: '2',
      code: 'NEW',
      taken_at: 1790000000,
      user: { username: 'rakulein' }
    },
    {
      pk: '3',
      code: 'FOREIGN',
      taken_at: 1791000000,
      user: { username: 'othercreator' }
    }
  ]);

  assert.equal(latest.id, 'NEW');
});

test('collects Hiker-style tuple and object media responses', () => {
  const tuple = collectMediaItems([[{ code: 'ONE' }], 'cursor']);
  const object = collectMediaItems({ items: [{ code: 'TWO' }] });
  assert.deepEqual(tuple.map(item => item.code), ['ONE']);
  assert.deepEqual(object.map(item => item.code), ['TWO']);
});

test('Instagram managed provider reports setup state without user credentials', () => {
  const oldHiker = process.env.HIKERAPI_KEY;
  const oldScrape = process.env.SCRAPECREATORS_API_KEY;
  const oldRelay = process.env.ORBIT_SOCIAL_RELAY_URL;
  delete process.env.HIKERAPI_KEY;
  delete process.env.SCRAPECREATORS_API_KEY;
  delete process.env.ORBIT_SOCIAL_RELAY_URL;
  const health = getInstagramProviderHealth();
  assert.equal(health.configured, false);
  assert.equal(health.userCredentialsRequired, false);
  assert.equal(health.directInstagramRequests, false);
  if (oldHiker !== undefined) process.env.HIKERAPI_KEY = oldHiker;
  if (oldScrape !== undefined) process.env.SCRAPECREATORS_API_KEY = oldScrape;
  if (oldRelay !== undefined) process.env.ORBIT_SOCIAL_RELAY_URL = oldRelay;
});
