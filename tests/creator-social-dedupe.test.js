const test = require('node:test');
const assert = require('node:assert/strict');
const { __dedupe } = require('../src/creator-social-runtime');

test('creator dedupe recognizes previously handled event keys', () => {
  assert.equal(__dedupe.eventAlreadyHandled({ lastEventKey: 'instagram:raku:post:ABC' }, 'instagram:raku:post:ABC'), true);
  assert.equal(__dedupe.eventAlreadyHandled({ seenEventKeys: ['instagram:raku:post:ABC'] }, 'instagram:raku:post:ABC'), true);
  assert.equal(__dedupe.eventAlreadyHandled({ seenEventKeys: ['instagram:raku:post:OLD'] }, 'instagram:raku:post:NEW'), false);
});

test('creator dedupe keeps a monotonic publish watermark and recent event history', () => {
  const state = {
    lastPublishedAt: '2026-09-28T07:00:00.000Z',
    seenEventKeys: ['instagram:raku:post:OLD']
  };
  const memory = __dedupe.eventMemory(state, 'instagram:raku:post:NEW', {
    publishedAt: '2026-09-28T07:10:00.000Z'
  });

  assert.equal(memory.lastPublishedAt, '2026-09-28T07:10:00.000Z');
  assert.deepEqual(memory.seenEventKeys.slice(0, 2), [
    'instagram:raku:post:NEW',
    'instagram:raku:post:OLD'
  ]);

  const stale = __dedupe.eventMemory(memory, 'instagram:raku:post:STALE', {
    publishedAt: '2026-09-28T06:50:00.000Z'
  });
  assert.equal(stale.lastPublishedAt, '2026-09-28T07:10:00.000Z');
});

test('creator pending lock is active only for the same recent event', () => {
  const recent = {
    pendingEventKey: 'instagram:raku:post:ABC',
    pendingEventAt: new Date(Date.now() - 20_000).toISOString()
  };
  const old = {
    pendingEventKey: 'instagram:raku:post:ABC',
    pendingEventAt: new Date(Date.now() - 5 * 60_000).toISOString()
  };

  assert.equal(__dedupe.activePending(recent, 'instagram:raku:post:ABC'), true);
  assert.equal(__dedupe.activePending(recent, 'instagram:raku:post:OTHER'), false);
  assert.equal(__dedupe.activePending(old, 'instagram:raku:post:ABC'), false);
});
