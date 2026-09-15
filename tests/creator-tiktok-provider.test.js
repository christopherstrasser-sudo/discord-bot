const test = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeTikTokSource,
  extractRehydrationJson,
  parseProfileDocument,
  pickLatestUploadFromItems,
  snapshotForTikTokRule,
  getTikTokProviderHealth,
  findPostList,
  tikTokTimeFromId
} = require('../src/creator-tiktok-provider');

const fixture = `<!doctype html><html><body>
<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application/json">
{"__DEFAULT_SCOPE__":{"webapp.user-detail":{"statusCode":0,"userInfo":{"user":{"uniqueId":"rakulein","nickname":"Rakulein","avatarLarger":"https://example.com/avatar.jpg","secUid":"MS4wLjABAAAA-test"},"stats":{"videoCount":3}}},"webapp.user-post":{"itemList":[{"id":"7000000000000000000","desc":"Pinned old post","createTime":"1700000000","stats":{"playCount":10},"video":{"cover":"https://example.com/old.jpg"}},{"id":"7990000000000000000","desc":"Newest post","createTime":"1789470000","stats":{"playCount":321},"video":{"cover":"https://example.com/new.jpg"}},{"id":"7500000000000000000","desc":"Middle post","createTime":"1750000000","stats":{"playCount":22}}]}}}
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
  assert.equal(upload.id, '7990000000000000000');
  assert.equal(upload.title, 'Newest post');
  assert.equal(upload.viewers, 321);
  assert.equal(upload.url, 'https://www.tiktok.com/@rakulein/video/7990000000000000000');
  assert.match(upload.publishedAt, /^2026-/);
});

test('finds a post list when TikTok moves it deeper in hydration state', () => {
  const scope = {
    strange2026Bucket: {
      nested: {
        payload: {
          items: [
            { id: '7990000000000000001', createTime: 1789470001, desc: 'Deep post', video: { cover: 'x' } }
          ]
        }
      }
    }
  };
  const list = findPostList(scope);
  assert.equal(list.length, 1);
  assert.equal(list[0].desc, 'Deep post');
});

test('parses creator metadata and upload capability from public profile document', () => {
  const profile = parseProfileDocument(fixture, 'rakulein');
  assert.equal(profile.creator, 'Rakulein');
  assert.equal(profile.avatar, 'https://example.com/avatar.jpg');
  assert.equal(profile.secUid, 'MS4wLjABAAAA-test');
  assert.equal(profile.uploadSupported, true);
  assert.equal(profile.latestUpload.id, '7990000000000000000');
  assert.equal(profile.uploadSource, 'ssr');
});

test('recognizes 2026 header-only profile as requiring a post fallback', () => {
  const html = `<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application/json">{"__DEFAULT_SCOPE__":{"webapp.user-detail":{"statusCode":0,"userInfo":{"user":{"uniqueId":"creator","secUid":"MS4wLjABAAAA-fallback"},"stats":{"videoCount":12}}}}}</script>`;
  const profile = parseProfileDocument(html, 'creator');
  assert.equal(profile.uploadSupported, false);
  assert.equal(profile.latestUpload, null);
  assert.equal(profile.secUid, 'MS4wLjABAAAA-fallback');
});

test('treats a zero-video profile as supported but empty', () => {
  const html = `<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application/json">{"__DEFAULT_SCOPE__":{"webapp.user-detail":{"statusCode":0,"userInfo":{"user":{"uniqueId":"empty"},"stats":{"videoCount":0}}}}}</script>`;
  const profile = parseProfileDocument(html, 'empty');
  assert.equal(profile.uploadSupported, true);
  assert.equal(profile.latestUpload, null);
});

test('can derive post time from a TikTok snowflake id for DOM fallback sorting', () => {
  const unix = 1789470000;
  const id = ((BigInt(unix) << 32n) | 123n).toString();
  assert.equal(tikTokTimeFromId(id), unix);
  const upload = pickLatestUploadFromItems([{ id, desc: 'DOM post', author: { uniqueId: 'rakulein' }, video: { cover: 'x' } }], 'rakulein');
  assert.equal(upload.id, id);
  assert.match(upload.publishedAt, /^2026-/);
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

test('surfaces upload fallback diagnostics instead of a generic capability error', () => {
  const result = snapshotForTikTokRule({ event: 'upload' }, {
    source: 'rakulein',
    uploadSupported: false,
    liveSupported: true,
    uploadError: 'API blockiert · Browser nicht verfügbar'
  });
  assert.match(result.error, /API blockiert/);
});

test('built-in TikTok provider is configured without external endpoint', () => {
  const state = getTikTokProviderHealth();
  assert.equal(state.configured, true);
  assert.equal(state.mode, 'built-in');
});
