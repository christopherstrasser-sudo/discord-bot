const test = require('node:test');
const assert = require('node:assert/strict');
const {
  anonymousHeaders,
  getInstagramProviderHealth
} = require('../src/creator-instagram-provider');

test('Instagram anonymous provider sends no login credentials', () => {
  const headers = anonymousHeaders();
  assert.equal(headers['x-ig-app-id'], '936619743392459');
  assert.match(headers['User-Agent'], /Chrome\/142/);
  assert.match(headers.Cookie, /sessionid=;/);
  assert.doesNotMatch(headers.Cookie, /sessionid=[^;]/);
  assert.equal(headers['X-Requested-With'], undefined);
});

test('Instagram provider is zero-setup and needs no external service', () => {
  const health = getInstagramProviderHealth();
  assert.equal(health.configured, true);
  assert.equal(health.userCredentialsRequired, false);
  assert.equal(health.backendCredentialsRequired, false);
  assert.equal(health.browserRequired, false);
  assert.equal(health.externalServiceRequired, false);
  assert.equal(health.manualSetupRequired, false);
});
