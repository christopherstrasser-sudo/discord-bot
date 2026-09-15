const test = require('node:test');
const assert = require('node:assert/strict');
const { uploadFromBrowserPayload } = require('../src/tiktok-signature-browser-fetch');

test('browser-session payload is converted into latest TikTok upload', () => {
  const deps = {
    postItemsFromPayload: data => data.itemList || [],
    pickLatestUploadFromItems: items => items[0] ? {
      id: String(items[0].id),
      title: String(items[0].desc || ''),
      url: `https://www.tiktok.com/@rakulein/video/${items[0].id}`
    } : null
  };
  const result = uploadFromBrowserPayload({
    status: 'ok',
    data: {
      statusCode: 0,
      itemList: [{ id: '7512345678901234567', desc: 'Test Upload' }]
    }
  }, 'rakulein', deps, { secUid: 'sec-123', creator: 'Rakulein' });

  assert.equal(result.latestUpload.id, '7512345678901234567');
  assert.equal(result.profile.secUid, 'sec-123');
  assert.equal(result.source, 'browser-session-api');
});

test('browser-session payload rejects empty TikTok response', () => {
  const deps = {
    postItemsFromPayload: () => [],
    pickLatestUploadFromItems: () => null
  };
  assert.throws(
    () => uploadFromBrowserPayload({ status: 'ok', data: null }, 'rakulein', deps),
    /keine verwertbaren Daten/
  );
});
