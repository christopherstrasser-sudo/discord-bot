const test = require('node:test');
const assert = require('node:assert/strict');
const {
  exactUserFromSearch,
  searchUrl,
  videosUrl,
  port,
  hardenLoopbackBindingText
} = require('../src/tiktok-signature-engine');

test('signature engine finds exact TikTok user match', () => {
  const user = exactUserFromSearch({
    user_list: [
      { user_info: { unique_id: 'other', sec_uid: 'sec-other' } },
      { user_info: { unique_id: 'Rakulein', sec_uid: 'sec-raku' } }
    ]
  }, 'rakulein');
  assert.equal(user.sec_uid, 'sec-raku');
});

test('signature engine never silently selects a different creator', () => {
  const user = exactUserFromSearch({
    user_list: [{ user_info: { unique_id: 'almostrakulein', sec_uid: 'wrong' } }]
  }, 'rakulein');
  assert.equal(user, null);
});

test('signature engine builds search URL from public handle', () => {
  const url = new URL(searchUrl('rakulein'));
  assert.equal(url.pathname, '/api/search/user/full/');
  assert.equal(url.searchParams.get('keyword'), 'rakulein');
  assert.equal(url.searchParams.get('from_page'), 'search');
  assert.equal(url.searchParams.get('tz_name'), 'America/New_York');
  assert.match(url.searchParams.get('device_id'), /^\d{18,20}$/);
});

test('signature engine builds user video URL', () => {
  const url = new URL(videosUrl('SEC-123'));
  assert.equal(url.pathname, '/api/post/item_list/');
  assert.equal(url.searchParams.get('secUid'), 'SEC-123');
  assert.equal(url.searchParams.get('from_page'), 'user');
  assert.equal(url.searchParams.get('count'), '30');
});

test('signature sidecar has a non-privileged default port', () => {
  assert.ok(port() >= 1024);
});

test('signature sidecar is forced to bind only to loopback', () => {
  const source = 'server.listen(PORT, () => {\n  console.log("ready");\n});';
  const hardened = hardenLoopbackBindingText(source);
  assert.match(hardened, /server\.listen\(PORT, "127\.0\.0\.1", \(\) => \{/);
  assert.equal(hardenLoopbackBindingText(hardened), hardened);
});
