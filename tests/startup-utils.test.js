const test = require('node:test');
const assert = require('node:assert/strict');
const {
  formatErrorDetails,
  isTransientDiscordError,
  retryTransient
} = require('../src/startup-utils');

test('recognizes Discord HTTP 5xx and Internal Server Error as transient', () => {
  assert.equal(isTransientDiscordError({ status: 500, message: 'Internal Server Error' }), true);
  assert.equal(isTransientDiscordError(new Error('Internal Server Error')), true);
  assert.equal(isTransientDiscordError({ code: 'ECONNRESET', message: 'socket reset' }), true);
});

test('does not retry configuration errors such as invalid token', () => {
  assert.equal(isTransientDiscordError(new Error('An invalid token was provided.')), false);
});

test('formats useful startup diagnostics without requiring a stack trace', () => {
  const text = formatErrorDetails({ name: 'DiscordAPIError', message: 'Internal Server Error', code: 0, status: 500 });
  assert.match(text, /DiscordAPIError/);
  assert.match(text, /Internal Server Error/);
  assert.match(text, /HTTP 500/);
});

test('retries transient startup failures and eventually succeeds', async () => {
  let calls = 0;
  const retries = [];
  const result = await retryTransient(async () => {
    calls += 1;
    if (calls < 3) {
      const error = new Error('Internal Server Error');
      error.status = 500;
      throw error;
    }
    return 'ready';
  }, {
    attempts: 5,
    delays: [1, 1, 1, 1],
    sleep: async () => {},
    onRetry: info => retries.push(info.nextAttempt)
  });

  assert.equal(result, 'ready');
  assert.equal(calls, 3);
  assert.deepEqual(retries, [2, 3]);
});

test('fails immediately for non-transient startup errors', async () => {
  let calls = 0;
  await assert.rejects(
    retryTransient(async () => {
      calls += 1;
      throw new Error('An invalid token was provided.');
    }, { attempts: 5, sleep: async () => {} }),
    /invalid token/
  );
  assert.equal(calls, 1);
});
