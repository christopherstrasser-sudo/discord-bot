const test = require('node:test');
const assert = require('node:assert/strict');
const {
  identityFromProfile,
  identityFromSearch,
  getInstagramProviderHealth
} = require('../src/creator-instagram-provider');

test('extracts Instagram identity from authenticated profile payload', () => {
  const identity = identityFromProfile({
    data: {
      user: {
        id: '123456789',
        username: 'rakulein',
        full_name: 'Rakulein',
        profile_pic_url: 'https://example.test/avatar.jpg'
      }
    }
  }, 'rakulein');

  assert.equal(identity.id, '123456789');
  assert.equal(identity.username, 'rakulein');
  assert.equal(identity.full_name, 'Rakulein');
});

test('rejects profile identity when the returned username differs', () => {
  assert.equal(identityFromProfile({
    data: { user: { id: '123', username: 'other' } }
  }, 'rakulein'), null);
});

test('extracts exact Instagram identity from top search fallback', () => {
  const identity = identityFromSearch({
    users: [
      { user: { pk: '100', username: 'not-raku' } },
      { user: { pk: '200', username: 'rakulein', full_name: 'Raku' } }
    ]
  }, 'rakulein');

  assert.equal(identity.id, '200');
  assert.equal(identity.full_name, 'Raku');
});

test('Instagram session provider needs no paid external service', () => {
  const oldSession = process.env.INSTAGRAM_SESSION_ID;
  delete process.env.INSTAGRAM_SESSION_ID;

  const missing = getInstagramProviderHealth();
  assert.equal(missing.configured, false);
  assert.equal(missing.userCredentialsRequired, false);
  assert.equal(missing.externalServiceRequired, false);

  process.env.INSTAGRAM_SESSION_ID = 'test-session';
  const configured = getInstagramProviderHealth();
  assert.equal(configured.configured, true);
  assert.equal(configured.sessionConfigured, true);
  assert.equal(configured.externalServiceRequired, false);

  if (oldSession === undefined) delete process.env.INSTAGRAM_SESSION_ID;
  else process.env.INSTAGRAM_SESSION_ID = oldSession;
});
