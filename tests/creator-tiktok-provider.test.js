const test = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeTikTokSource,
  extractRehydrationJson,
  parseProfileDocument,
  pickLatestUploadFromItems,
  snapshotForTikTokRule,
  getTikTokProviderHealth
} = require('../src/creator-tiktok-provider');

const fixture = `<!doctype html><html><body>
<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application/json">
{"__DEFAULT_SCOPE__":{"webapp.user-detail":{"statusCode":0,"userInfo":{"user":{"uniqueId":"rakulein","nickname":"Rakulein","avatarLarger":"https://example.com/avatar.jpg"},"stats":{"videoCount":3}}},"webapp.user-post":{"itemList":[{"id":"700","desc":"Pinned old post","createTime":"1700000000","stats":{"playCount":10},"video":{"cover":"https://example.com/old.jpg"}},{"id":"999","desc":"Newest post","createTime":"1789470000","stats":{"playCount":321},"video":{"cover":"https://example.com/new.jpg"}},{"id":"800","desc":"Middle post","createTime":"1750000000","stats":{"playCount":22}}]}}}
</script></body></html>`;

test('normalizes TikTok handles and profile URLs', () => {
  assert.equal(normalizeTikTokSource('@Rakulein'), 'rakulein');
  assert.equal(normalizeTikTokSource('https://www.tiktok.com/@Rakulein'), 'rakulein');
  assert.throws(() => normalizeTikTokSource('https://www.tiktok.com/video/123'), /@Handle/);
});

test('extracts TikTok rehydration JSON', () => {
  const data = extractRehydrationJson(fixture);
  assert.ok(data.__DEFAULT_SCOPE__['webapp.user-detail']);
});

test('selects newest upload by createTime instead of list position', () => {
  const items = extractRehydrationJson(fixture).__DEFAULT_SCOPE__['webapp.user-post'].itemList;
  const upload = pickLatestUploadFromItems(items, 'rakulein');
  assert.equal(upload.id, '999');
  assert.equal(upload.title, 'Newest post');
  assert.equal(upload.viewers, 321);
  assert.equal(upload.url, 'https://www.tiktok.com/@rakulein/video/999');
  assert.match(upload.publishedAt, /^2026-/);
});

test('parses creator metadata and upload capability from public profile document', () => {
  const profile = parseProfileDocument(fixture, 'rakulein');
  assert.equal(profile.creator, 'Rakulein');
  assert.equal(profile.avatar, 'https://example.com/avatar.jpg');
  assert.equal(profile.uploadSupported, true);
  assert.equal(profile.latestUpload.id, '999');
});

test('treats a zero-video profile as supported but empty', () => {
  const html = `<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application/json">{"__DEFAULT_SCOPE__":{"webapp.user-detail":{"statusCode":0,"userInfo":{"user":{"uniqueId":"empty"},"stats":{"videoCount":0}}}}}</script>`;
  const profile = parseProfileDocument(html, 'empty');
  assert.equal(profile.uploadSupported, true);
  assert.equal(profile.latestUpload, null);
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

test('built-in TikTok provider is configured without external endpoint', () => {
  const state = getTikTokProviderHealth();
  assert.equal(state.configured, true);
  assert.equal(state.mode, 'built-in');
});
