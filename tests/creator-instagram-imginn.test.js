const test = require('node:test');
const assert = require('node:assert/strict');
const {
  extractPostCodes,
  parsePostedOn,
  parseImginnPostHtml
} = require('../src/creator-instagram-imginn');

test('extracts unique Imginn post codes in profile order', () => {
  const html = `
    <a href="/p/OLDPIN123/">Pinned</a>
    <a href="https://imginn.com/p/NEWPOST456/">New</a>
    <a href="/p/NEWPOST456/">Duplicate</a>
    <a href="/p/THIRD789/">Third</a>
  `;
  assert.deepEqual(extractPostCodes(html, 6), ['OLDPIN123', 'NEWPOST456', 'THIRD789']);
});

test('parses exact Posted On timestamp instead of relative label', () => {
  const html = `<div>2 days ago</div><div>Posted On: September 8th 2026, 08:46 pm</div>`;
  assert.equal(parsePostedOn(html), '2026-09-08T20:46:00.000Z');
});

test('parses Imginn post detail into Instagram snapshot', () => {
  const html = `<!doctype html>
    <html><head>
      <meta property="og:title" content="Rakulein (@rakulein): Neuer Post">
      <meta property="og:description" content="Heute gibt es ein neues Update &amp; einen Stream!">
      <meta property="og:image" content="https://scontent.example.test/post.jpg">
    </head><body>
      <div>Posted On: September 16th 2026, 01:15 pm</div>
      <p>Heute gibt es ein neues Update &amp; einen Stream!</p>
      <h3>Comments (4)</h3>
    </body></html>`;
  const snapshot = parseImginnPostHtml(html, 'rakulein', 'ABC_123');
  assert.equal(snapshot.platform, 'instagram');
  assert.equal(snapshot.source, 'rakulein');
  assert.equal(snapshot.creator, 'Rakulein');
  assert.equal(snapshot.id, 'ABC_123');
  assert.equal(snapshot.title, 'Heute gibt es ein neues Update & einen Stream!');
  assert.equal(snapshot.thumbnail, 'https://scontent.example.test/post.jpg');
  assert.equal(snapshot.url, 'https://www.instagram.com/p/ABC_123/');
  assert.equal(snapshot.publishedAt, '2026-09-16T13:15:00.000Z');
});

test('falls back to visible caption text if OpenGraph description is absent', () => {
  const html = `
    <h1>Rakulein (@rakulein)</h1>
    <div>Posted On: September 15th 2026, 09:05 am</div>
    <p>Das ist die sichtbare Caption.</p>
    <h2>Comments (2)</h2>
  `;
  const snapshot = parseImginnPostHtml(html, 'rakulein', 'POST999');
  assert.match(snapshot.title, /sichtbare Caption/);
  assert.equal(snapshot.publishedAt, '2026-09-15T09:05:00.000Z');
});