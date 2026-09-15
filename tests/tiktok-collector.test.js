const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const {
  clampPoolSize,
  dataRoot,
  profileFromScope,
  postItemsFromAny
} = require('../src/tiktok-collector');

test('collector pool size is bounded', () => {
  assert.equal(clampPoolSize(undefined), 1);
  assert.equal(clampPoolSize('0'), 1);
  assert.equal(clampPoolSize('2'), 2);
  assert.equal(clampPoolSize('99'), 3);
});

test('collector stores persistent sessions below data directory', () => {
  assert.equal(dataRoot(), path.join(process.cwd(), 'data', 'tiktok-collector'));
});

test('collector extracts public profile identity from hydration scope', () => {
  const profile = profileFromScope({
    'webapp.user-detail': {
      userInfo: {
        user: { uniqueId: 'rakulein', nickname: 'Raku', secUid: 'sec-123', avatarLarger: 'avatar' },
        stats: { videoCount: 12 }
      }
    }
  }, 'rakulein');
  assert.equal(profile.creator, 'Raku');
  assert.equal(profile.secUid, 'sec-123');
  assert.equal(profile.avatar, 'avatar');
  assert.equal(profile.videoCount, 12);
  assert.equal(profile.videoCountKnown, true);
});

test('collector accepts TikTok post payload variants', () => {
  const item = { id: '7990000000000000000' };
  assert.deepEqual(postItemsFromAny({ itemList: [item] }), [item]);
  assert.deepEqual(postItemsFromAny({ item_list: [item] }), [item]);
  assert.deepEqual(postItemsFromAny({ data: { items: [item] } }), [item]);
});
