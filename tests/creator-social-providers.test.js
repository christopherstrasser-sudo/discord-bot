const test = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeSocialHandle,
  parseInstagramProfileInfo,
  parseInstagramFeedPayload,
  parseInstagramRelayHtml,
  parseXSyndicationHtml,
  getSocialProviderHealth
} = require('../src/creator-social-providers');

test('normalizes Instagram handles and profile URLs', () => {
  assert.equal(normalizeSocialHandle('instagram', '@Rakulein'), 'rakulein');
  assert.equal(normalizeSocialHandle('instagram', 'https://www.instagram.com/Rakulein/'), 'rakulein');
});

test('normalizes Bluesky handles and profile URLs', () => {
  assert.equal(normalizeSocialHandle('bluesky', '@rakulein.bsky.social'), 'rakulein.bsky.social');
  assert.equal(normalizeSocialHandle('bluesky', 'https://bsky.app/profile/rakulein.bsky.social'), 'rakulein.bsky.social');
  assert.equal(normalizeSocialHandle('bluesky', 'did:plc:abc123'), 'did:plc:abc123');
});

test('normalizes X handles and legacy Twitter URLs', () => {
  assert.equal(normalizeSocialHandle('x', '@Rakulein'), 'rakulein');
  assert.equal(normalizeSocialHandle('x', 'https://x.com/Rakulein'), 'rakulein');
  assert.equal(normalizeSocialHandle('x', 'https://twitter.com/Rakulein'), 'rakulein');
});

test('social providers are available without user API credentials', () => {
  const health = getSocialProviderHealth();
  assert.equal(health.instagram.configured, true);
  assert.equal(health.bluesky.configured, true);
  assert.equal(health.x.configured, true);
});

test('parses newest Instagram post from public web profile info', () => {
  const snapshot = parseInstagramProfileInfo({
    data: {
      user: {
        username: 'rakulein',
        full_name: 'Rakulein',
        profile_pic_url: 'https://example.test/avatar.jpg',
        edge_owner_to_timeline_media: {
          edges: [
            { node: { id: 'old', shortcode: 'OLD123', taken_at_timestamp: 100, display_url: 'https://example.test/old.jpg', edge_media_to_caption: { edges: [{ node: { text: 'Alter Post' } }] } } },
            { node: { id: 'new', shortcode: 'NEW456', taken_at_timestamp: 200, product_type: 'clips', display_url: 'https://example.test/new.jpg', edge_media_to_caption: { edges: [{ node: { text: 'Neuer Reel Post' } }] } } }
          ]
        }
      }
    }
  }, 'rakulein');
  assert.equal(snapshot.id, 'new');
  assert.equal(snapshot.title, 'Neuer Reel Post');
  assert.equal(snapshot.url, 'https://www.instagram.com/reel/NEW456/');
  assert.equal(snapshot.thumbnail, 'https://example.test/new.jpg');
  assert.equal(snapshot.avatar, 'https://example.test/avatar.jpg');
});

test('parses newest Instagram post from public feed-by-username payload', () => {
  const snapshot = parseInstagramFeedPayload({
    user: { username: 'rakulein', full_name: 'Rakulein', profile_pic_url: 'https://example.test/avatar.jpg' },
    items: [
      {
        pk: 'old-feed',
        code: 'OLDFEED',
        taken_at: 300,
        media_type: 1,
        user: { username: 'rakulein' },
        caption: { text: 'Alter Feed Post' },
        image_versions2: { candidates: [{ url: 'https://example.test/old-feed.jpg' }] }
      },
      {
        pk: 'new-feed',
        code: 'NEWFEED',
        taken_at: 500,
        media_type: 2,
        product_type: 'clips',
        user: { username: 'rakulein' },
        caption: { text: 'Neuer Feed Reel' },
        image_versions2: { candidates: [{ url: 'https://example.test/new-feed.jpg' }] }
      }
    ]
  }, 'rakulein');
  assert.equal(snapshot.id, 'new-feed');
  assert.equal(snapshot.title, 'Neuer Feed Reel');
  assert.equal(snapshot.url, 'https://www.instagram.com/reel/NEWFEED/');
  assert.equal(snapshot.thumbnail, 'https://example.test/new-feed.jpg');
  assert.equal(snapshot.avatar, 'https://example.test/avatar.jpg');
});

test('parses Instagram media from logged-out application/json relay payload', () => {
  const payload = {
    profile: { username: 'rakulein', full_name: 'Rakulein', profile_pic_url: 'https://example.test/avatar.jpg' },
    feed: [{ owner: { username: 'rakulein' }, xdt_id: 'relay-new', xdt_shortcode: 'RELAY1', xdt_taken_at_timestamp: 400, xdt_display_url: 'https://example.test/relay.jpg', caption: { text: 'Relay Post' } }]
  };
  const html = `<html><script type="application/json">${JSON.stringify(payload)}</script></html>`;
  const snapshot = parseInstagramRelayHtml(html, 'rakulein');
  assert.equal(snapshot.id, 'relay-new');
  assert.equal(snapshot.title, 'Relay Post');
  assert.equal(snapshot.url, 'https://www.instagram.com/p/RELAY1/');
});

test('parses newest original X post from public syndication and ignores pinned old/retweets/replies', () => {
  const tweet = (id, text, created, extra = {}) => ({
    id_str: id,
    full_text: text,
    created_at: created,
    user: { screen_name: 'Rakulein', name: 'Rakulein', profile_image_url_https: 'https://example.test/x.jpg' },
    ...extra
  });
  const payload = {
    props: { pageProps: { timeline: { entries: [
      { content: { tweet: tweet('1', 'Pinned aber alt', 'Mon Sep 14 10:00:00 +0000 2026') } },
      { content: { tweet: tweet('2', 'Das ist der neue Post', 'Wed Sep 16 12:30:00 +0000 2026', { extended_entities: { media: [{ media_url_https: 'https://example.test/post.jpg' }] } }) } },
      { content: { tweet: tweet('3', 'Retweet', 'Wed Sep 16 12:40:00 +0000 2026', { retweeted_status: { id_str: '99' } }) } },
      { content: { tweet: tweet('4', 'Reply', 'Wed Sep 16 12:50:00 +0000 2026', { in_reply_to_status_id_str: '2' }) } }
    ] } } }
  };
  const html = `<html><script id="__NEXT_DATA__" type="application/json">${JSON.stringify(payload)}</script></html>`;
  const snapshot = parseXSyndicationHtml(html, 'rakulein');
  assert.equal(snapshot.id, '2');
  assert.equal(snapshot.title, 'Das ist der neue Post');
  assert.equal(snapshot.url, 'https://x.com/Rakulein/status/2');
  assert.equal(snapshot.thumbnail, 'https://example.test/post.jpg');
});

test('rejects invalid social handles', () => {
  assert.throws(() => normalizeSocialHandle('instagram', 'bad handle'), /Instagram/);
  assert.throws(() => normalizeSocialHandle('bluesky', 'not-a-handle'), /Bluesky/);
  assert.throws(() => normalizeSocialHandle('x', 'this-handle-is-way-too-long'), /X:/);
});