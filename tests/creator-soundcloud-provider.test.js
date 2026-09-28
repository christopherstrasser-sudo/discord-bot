const test = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeSoundCloudSource,
  parseSoundCloudHydration,
  hydratedTracks,
  buildSoundCloudSnapshot,
  parseSoundCloudRss,
  getSoundCloudProviderHealth
} = require('../src/creator-soundcloud-provider');
const {
  SOCIAL_PLATFORMS,
  normalizeSocialHandle
} = require('../src/creator-social-provider-router');

test('normalizes SoundCloud profile names and profile URLs', () => {
  assert.equal(normalizeSoundCloudSource('@Rakulein'), 'rakulein');
  assert.equal(normalizeSoundCloudSource('https://soundcloud.com/Rakulein/'), 'rakulein');
  assert.equal(normalizeSoundCloudSource('https://soundcloud.com/Rakulein/tracks'), 'rakulein');
  assert.equal(normalizeSocialHandle('soundcloud', 'soundcloud.com/Rakulein'), 'rakulein');
  assert.throws(() => normalizeSoundCloudSource('https://soundcloud.com/rakulein/example-track'), /Künstlerprofil/);
});

test('SoundCloud is keyless and registered as a creator social platform', () => {
  assert.equal(SOCIAL_PLATFORMS.has('soundcloud'), true);
  const health = getSoundCloudProviderHealth();
  assert.equal(health.configured, true);
  assert.equal(health.userCredentialsRequired, false);
  assert.equal(health.backendCredentialsRequired, false);
  assert.equal(health.browserRequired, false);
  assert.equal(health.rssFallback, true);
});

test('parses public SoundCloud hydration with current web client id', () => {
  const hydration = [
    { hydratable: 'apiClient', data: { id: 'WEBCLIENT123' } },
    { hydratable: 'user', data: { id: 42, permalink: 'rakulein', username: 'Rakulein', full_name: 'Raku', avatar_url: 'https://example.test/avatar.jpg' } }
  ];
  const html = '<html><script>window.__sc_hydration = ' + JSON.stringify(hydration) + ';</script></html>';
  const parsed = parseSoundCloudHydration(html, 'rakulein');
  assert.equal(parsed.clientId, 'WEBCLIENT123');
  assert.equal(parsed.user.id, '42');
  assert.equal(parsed.user.permalink, 'rakulein');
});

test('extracts only own hydrated SoundCloud tracks', () => {
  const hydration = [{
    hydratable: 'stream',
    data: {
      collection: [
        { kind: 'track', id: 1, title: 'Eigener Track', permalink_url: 'https://soundcloud.com/rakulein/own', created_at: '2026-09-27T12:00:00Z', user: { id: 42 } },
        { kind: 'track', id: 2, title: 'Repost', permalink_url: 'https://soundcloud.com/other/repost', created_at: '2026-09-28T12:00:00Z', user: { id: 99 } }
      ]
    }
  }];
  const tracks = hydratedTracks(hydration, '42');
  assert.equal(tracks.length, 1);
  assert.equal(tracks[0].title, 'Eigener Track');
});

test('builds newest own SoundCloud upload and ignores a newer repost', () => {
  const snapshot = buildSoundCloudSnapshot('rakulein', {
    id: '42',
    username: 'Rakulein',
    avatar_url: 'https://example.test/avatar.jpg'
  }, {
    collection: [
      {
        urn: 'soundcloud:tracks:1',
        kind: 'track',
        title: 'Alter Track',
        created_at: '2026-09-20T12:00:00Z',
        permalink_url: 'https://soundcloud.com/rakulein/alter-track',
        user: { id: 42 }
      },
      {
        urn: 'soundcloud:tracks:2',
        kind: 'track',
        title: 'Neuer Track',
        display_date: '2026-09-28T06:00:00Z',
        permalink_url: 'https://soundcloud.com/rakulein/neuer-track',
        artwork_url: 'https://example.test/cover.jpg',
        playback_count: 123,
        duration: 180000,
        user: { id: 42 }
      },
      {
        urn: 'soundcloud:tracks:3',
        kind: 'track',
        title: 'Fremder Repost',
        display_date: '2026-09-28T07:00:00Z',
        permalink_url: 'https://soundcloud.com/other/repost',
        user: { id: 99 }
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

test('parses SoundCloud RSS fallback into the same creator snapshot shape', () => {
  const xml = '<?xml version="1.0"?><rss><channel>' +
    '<item><title><![CDATA[Alter Track]]></title><link>https://soundcloud.com/rakulein/old</link><guid>tag:soundcloud,2010:tracks/100</guid><pubDate>Sat, 26 Sep 2026 12:00:00 GMT</pubDate></item>' +
    '<item><title><![CDATA[Neuer &amp; Track]]></title><link>https://soundcloud.com/rakulein/new</link><guid>tag:soundcloud,2010:tracks/101</guid><pubDate>Mon, 28 Sep 2026 06:00:00 GMT</pubDate><itunes:image href="https://example.test/rss.jpg"/></item>' +
    '</channel></rss>';
  const snapshot = parseSoundCloudRss(xml, 'rakulein', { id: '42', username: 'Rakulein' });
  assert.equal(snapshot.id, 'soundcloud:tracks:101');
  assert.equal(snapshot.title, 'Neuer & Track');
  assert.equal(snapshot.url, 'https://soundcloud.com/rakulein/new');
  assert.equal(snapshot.thumbnail, 'https://example.test/rss.jpg');
});
