const test = require('node:test');
const assert = require('node:assert/strict');
const { pickUpload, snapshotForTikTokRule } = require('../src/creator-tiktok-provider');

test('normalizes latestUpload payloads', () => {
  const result = pickUpload({
    latestUpload: {
      id: '7481234567890',
      caption: 'Neues Video',
      shareUrl: 'https://www.tiktok.com/@rakulein/video/7481234567890',
      coverUrl: 'https://example.com/cover.jpg',
      createTime: 1789470000,
      viewCount: 321
    }
  }, 'rakulein');

  assert.equal(result.supported, true);
  assert.equal(result.upload.id, '7481234567890');
  assert.equal(result.upload.title, 'Neues Video');
  assert.equal(result.upload.viewers, 321);
  assert.match(result.upload.publishedAt, /^2026-/);
});

test('supports latestVideo alias and generated TikTok URL', () => {
  const result = pickUpload({ latestVideo: { videoId: '123', description: 'Clip' } }, 'rakulein');
  assert.equal(result.supported, true);
  assert.equal(result.upload.url, 'https://www.tiktok.com/@rakulein/video/123');
});

test('distinguishes unsupported upload adapters from empty profiles', () => {
  assert.deepEqual(pickUpload({}, 'rakulein'), { supported: false, upload: null });
  assert.deepEqual(pickUpload({ capabilities: { upload: true }, latestUpload: null }, 'rakulein'), { supported: true, upload: null });
});

test('selects upload snapshot for TikTok upload rules', () => {
  const snapshot = snapshotForTikTokRule({ event: 'upload' }, {
    source: 'rakulein',
    creator: 'Rakulein',
    avatar: 'https://example.com/avatar.jpg',
    uploadSupported: true,
    liveSupported: true,
    live: false,
    latestUpload: {
      id: '999',
      title: 'Upload',
      url: 'https://www.tiktok.com/@rakulein/video/999',
      thumbnail: 'https://example.com/thumb.jpg',
      publishedAt: '2026-09-15T12:00:00.000Z',
      viewers: 42
    }
  });

  assert.equal(snapshot.id, '999');
  assert.equal(snapshot.title, 'Upload');
  assert.equal(snapshot.live, false);
  assert.equal(snapshot.viewers, 42);
});

test('returns an explicit capability error when upload detection is unavailable', () => {
  const result = snapshotForTikTokRule({ event: 'upload' }, {
    source: 'rakulein',
    creator: 'Rakulein',
    uploadSupported: false,
    liveSupported: true,
    live: false
  });
  assert.match(result.error, /keine Upload-Erkennung|noch keine Upload-Erkennung/);
});
