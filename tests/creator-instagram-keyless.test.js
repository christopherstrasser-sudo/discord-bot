const test = require('node:test');
const assert = require('node:assert/strict');
const {
  extractInstagramIdentityFromHtml,
  identityFromTopSearch,
  parseGraphqlTimeline
} = require('../src/creator-instagram-keyless');

test('extracts Instagram identity from application/json profile payload', () => {
  const payload = {
    props: {
      profile: {
        pk: '1234567890',
        username: 'rakulein',
        full_name: 'Rakulein',
        profile_pic_url: 'https://example.test/avatar.jpg'
      }
    }
  };
  const html = `<html><script type="application/json">${JSON.stringify(payload)}</script></html>`;
  const identity = extractInstagramIdentityFromHtml(html, 'rakulein');
  assert.deepEqual(identity, {
    id: '1234567890',
    username: 'rakulein',
    full_name: 'Rakulein',
    profile_pic_url: 'https://example.test/avatar.jpg'
  });
});

test('extracts Instagram identity from top search result', () => {
  const identity = identityFromTopSearch({
    users: [
      { user: { pk: '111', username: 'someoneelse', full_name: 'Nope' } },
      { user: { pk: '222', username: 'Rakulein', full_name: 'Rakulein', profile_pic_url: 'https://example.test/a.jpg' } }
    ]
  }, 'rakulein');
  assert.equal(identity.id, '222');
  assert.equal(identity.username, 'rakulein');
  assert.equal(identity.full_name, 'Rakulein');
});

test('parses newest post from anonymous Instagram GraphQL timeline', () => {
  const snapshot = parseGraphqlTimeline({
    data: {
      user: {
        edge_owner_to_timeline_media: {
          edges: [
            {
              node: {
                id: 'old',
                shortcode: 'OLDPOST',
                taken_at_timestamp: 100,
                display_url: 'https://example.test/old.jpg',
                edge_media_to_caption: { edges: [{ node: { text: 'Alt' } }] }
              }
            },
            {
              node: {
                id: 'new',
                shortcode: 'NEWPOST',
                taken_at_timestamp: 200,
                display_url: 'https://example.test/new.jpg',
                edge_media_to_caption: { edges: [{ node: { text: 'Neuester Instagram Post' } }] }
              }
            }
          ]
        }
      }
    }
  }, 'rakulein', {
    id: '222',
    username: 'rakulein',
    full_name: 'Rakulein',
    profile_pic_url: 'https://example.test/avatar.jpg'
  });

  assert.equal(snapshot.id, 'new');
  assert.equal(snapshot.title, 'Neuester Instagram Post');
  assert.equal(snapshot.url, 'https://www.instagram.com/p/NEWPOST/');
  assert.equal(snapshot.thumbnail, 'https://example.test/new.jpg');
  assert.equal(snapshot.avatar, 'https://example.test/avatar.jpg');
});
