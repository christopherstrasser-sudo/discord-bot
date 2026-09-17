const test = require('node:test');
const assert = require('node:assert/strict');
const { sortClipsNewestFirst, normalizeClip } = require('../src/creator-twitch-clips');
const { eventForRule, sampleSnapshot } = require('../src/creator-runtime');

test('sorts Twitch clips by created_at instead of view count', () => {
  const clips = [
    { id: 'popular-old', created_at: '2026-09-17T05:00:00Z', view_count: 5000 },
    { id: 'fresh-low', created_at: '2026-09-17T06:55:00Z', view_count: 1 },
    { id: 'middle', created_at: '2026-09-17T06:00:00Z', view_count: 100 }
  ];
  assert.deepEqual(sortClipsNewestFirst(clips).map(item => item.id), ['fresh-low', 'middle', 'popular-old']);
});

test('normalizes a Twitch clip for Discord notifications', () => {
  const snapshot = normalizeClip({
    id: 'FreshClipSlug',
    url: 'https://clips.twitch.tv/FreshClipSlug',
    broadcaster_name: 'Rakulein',
    creator_name: 'Viewer123',
    title: 'Was war DAS denn?!',
    game_id: '516575',
    thumbnail_url: 'https://example.test/clip.jpg',
    created_at: '2026-09-17T06:55:00Z',
    view_count: 3,
    duration: 27.4
  }, {
    display_name: 'Rakulein',
    profile_image_url: 'https://example.test/avatar.jpg'
  }, 'VALORANT', 'rakulein');

  assert.equal(snapshot.platform, 'twitch');
  assert.equal(snapshot.id, 'FreshClipSlug');
  assert.equal(snapshot.eventKey, 'twitch:rakulein:clip:FreshClipSlug');
  assert.equal(snapshot.clipper, 'Viewer123');
  assert.equal(snapshot.game, 'VALORANT');
  assert.equal(snapshot.url, 'https://clips.twitch.tv/FreshClipSlug');
  assert.equal(snapshot.thumbnail, 'https://example.test/clip.jpg');
  assert.equal(snapshot.publishedAt, '2026-09-17T06:55:00Z');
});

test('detects a Twitch clip as a distinct Creator Hub event', () => {
  const rule = { platform: 'twitch', source: 'rakulein', event: 'clip' };
  const snapshot = {
    platform: 'twitch', source: 'rakulein', id: 'FreshClipSlug', live: false,
    title: 'Fresh clip', url: 'https://clips.twitch.tv/FreshClipSlug'
  };
  assert.deepEqual(eventForRule(rule, snapshot, {}), {
    key: 'twitch:rakulein:clip:FreshClipSlug',
    kind: 'clip'
  });
  assert.equal(eventForRule(rule, snapshot, { lastEventKey: 'twitch:rakulein:clip:FreshClipSlug' }), null);
});

test('Twitch clip test data uses a clip link and clip metadata', () => {
  const snapshot = sampleSnapshot({ platform: 'twitch', source: 'rakulein', displayName: 'Rakulein', event: 'clip' });
  assert.equal(snapshot.live, false);
  assert.equal(snapshot.clipper, 'CommunityMember');
  assert.match(snapshot.url, /clips\.twitch\.tv/);
  assert.equal(snapshot.game, 'VALORANT');
});
