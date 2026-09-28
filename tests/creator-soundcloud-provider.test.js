const test = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeSoundCloudSource,
  buildSoundCloudSnapshot,
  getSoundCloudProviderHealth
} = require('../src/creator-soundcloud-provider');
const {
  SOCIAL_PLATFORMS,
  normalizeSocialHandle
} = require('../src/creator-social-provider-router');

test('normalizes SoundCloud profile names and profile URLs', () => {
  assert.equal(normalizeSoundCloudSource('@Rakulein'), 'rakulein');
  assert.equal(normalizeSoundCloudSource('https://soundcloud.com/Rakulein/'), 'rakulein');
  assert.equal(normalizeSocialHandle('soundcloud', 'soundcloud.com/Rakulein'), 'rakulein');
  assert.throws(() => normalizeSoundCloudSource('https://soundcloud.com/rakulein/example-track'), /Künstlerprofil/);
});

test('SoundCloud is registered as a creator social platform', () => {
  assert.equal(SOCIAL_PLATFORMS.has('soundcloud'), true);
  const health = getSoundCloudProviderHealth();
  assert.equal(typeof health.configured, 'boolean');
  assert.equal(health.userCredentialsRequired, false);
  assert.equal(health.backendCredentialsRequired, true);
});

test('builds newest SoundCloud upload snapshot and ignores older ordering', () => {
  const snapshot = buildSoundCloudSnapshot('rakulein', {
    urn: 'soundcloud:users:42',
    username: 'Rakulein',
    avatar_url: 'https://example.test/avatar.jpg'
  }, {
    collection: [
      {
        urn: 'soundcloud:tracks:1',
        kind: 'track',
        title: 'Alter Track',
        created_at: '2026-09-20T12:00:00Z',
        permalink_url: 'https://soundcloud.com/rakulein/alter-track'
      },
      {
        urn: 'soundcloud:tracks:2',
        kind: 'track',
        title: 'Neuer Track',
        created_at: '2026-09-28T06:00:00Z',
        permalink_url: 'https://soundcloud.com/rakulein/neuer-track',
        artwork_url: 'https://example.test/cover.jpg',
        playback_count: 123,
        duration: 180000
      }
    ]
  });

  assert.equal(snapshot.platform, 'soundcloud');
  assert.equal(snapshot.id, 'soundcloud:tracks:2');
  assert.equal(snapshot.title, 'Neuer Track');
  assert.equal(snapshot.url, 'https://soundcloud.com/rakulein/neuer-track');
  assert.equal(snapshot.thumbnail, 'https://example.test/cover.jpg');
  assert.equal(snapshot.avatar, 'https://example.test/avatar.jpg');
  assert.equal(snapshot.eventKey, 'soundcloud:rakulein:upload:soundcloud:tracks:2');
  assert.equal(snapshot.views, 123);
});
