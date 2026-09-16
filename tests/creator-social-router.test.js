const test = require('node:test');
const assert = require('node:assert/strict');
const { xMdSnapshot, getSocialProviderHealth } = require('../src/creator-social-provider-router');

test('normalizes newest original x.md profile post into creator snapshot', () => {
  const snapshot = xMdSnapshot({
    profile: {
      name: 'Rakulein',
      screen_name: 'Rakulein',
      avatar_url: 'https://example.test/avatar.jpg'
    },
    posts: [
      {
        id: '100',
        text: 'Alter Post',
        created_at: '2026-09-15T10:00:00.000Z',
        url: 'https://x.com/Rakulein/status/100',
        author: { name: 'Rakulein', screen_name: 'Rakulein' }
      },
      {
        id: '101',
        text: 'Neuer Post',
        created_at: '2026-09-16T13:00:00.000Z',
        url: 'https://x.com/Rakulein/status/101',
        author: { name: 'Rakulein', screen_name: 'Rakulein', avatar_url: 'https://example.test/avatar2.jpg' },
        media: { photos: [{ url: 'https://example.test/post.jpg' }] }
      },
      {
        id: '102',
        text: 'Reply',
        created_at: '2026-09-16T13:10:00.000Z',
        replying_to: { screen_name: 'someone' }
      }
    ]
  }, 'rakulein');

  assert.equal(snapshot.id, '101');
  assert.equal(snapshot.title, 'Neuer Post');
  assert.equal(snapshot.url, 'https://x.com/Rakulein/status/101');
  assert.equal(snapshot.thumbnail, 'https://example.test/post.jpg');
  assert.equal(snapshot.avatar, 'https://example.test/avatar2.jpg');
  assert.equal(snapshot.eventKey, 'x:rakulein:post:101');
});

test('x provider requires no customer credentials and Instagram exposes backend provider state', () => {
  const health = getSocialProviderHealth();
  assert.equal(health.x.configured, true);
  assert.equal(health.x.userCredentialsRequired, false);
  assert.equal(health.instagram.configured, true);
  assert.equal(health.instagram.userCredentialsRequired, false);
  assert.equal(typeof health.instagram.serverProviderConfigured, 'boolean');
});