function firstValue(values) {
  return values.find(value => value !== undefined && value !== null && value !== '');
}

function errorStatus(error) {
  const value = firstValue([
    error?.status,
    error?.statusCode,
    error?.httpStatus,
    error?.response?.status,
    error?.rawError?.status,
    error?.cause?.status
  ]);
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function errorCode(error) {
  const value = firstValue([
    error?.code,
    error?.rawError?.code,
    error?.cause?.code
  ]);
  return value === undefined ? '' : String(value);
}

function formatErrorDetails(error) {
  const name = String(error?.name || 'Error');
  const message = String(error?.message || error || 'Unbekannter Fehler');
  const code = errorCode(error);
  const status = errorStatus(error);
  const parts = [`${name}: ${message}`];
  if (code) parts.push(`Code ${code}`);
  if (status !== null) parts.push(`HTTP ${status}`);
  return parts.join(' · ');
}

function isTransientDiscordError(error) {
  const status = errorStatus(error);
  if (status === 408 || status === 425 || status === 429 || (status !== null && status >= 500 && status <= 599)) {
    return true;
  }

  const code = errorCode(error).toUpperCase();
  if ([
    'ECONNRESET',
    'ECONNREFUSED',
    'ETIMEDOUT',
    'EAI_AGAIN',
    'ENOTFOUND',
    'UND_ERR_CONNECT_TIMEOUT',
    'UND_ERR_HEADERS_TIMEOUT',
    'UND_ERR_SOCKET'
  ].includes(code)) {
    return true;
  }

  const message = String(error?.message || error || '').toLowerCase();
  return [
    'internal server error',
    'bad gateway',
    'service unavailable',
    'gateway timeout',
    'fetch failed',
    'socket hang up',
    'network error',
    'temporarily unavailable',
    'econnreset',
    'etimedout'
  ].some(fragment => message.includes(fragment));
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function retryTransient(operation, options = {}) {
  const attempts = Math.max(1, Math.min(Number(options.attempts || 5), 10));
  const delays = Array.isArray(options.delays) && options.delays.length
    ? options.delays
    : [2000, 4000, 8000, 12000];
  const sleep = options.sleep || delay;

  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation(attempt);
    } catch (error) {
      lastError = error;
      if (!isTransientDiscordError(error) || attempt >= attempts) throw error;

      const delayMs = Number(delays[Math.min(attempt - 1, delays.length - 1)] || 2000);
      options.onRetry?.({
        error,
        attempt,
        nextAttempt: attempt + 1,
        attempts,
        delayMs,
        details: formatErrorDetails(error)
      });
      await sleep(delayMs);
    }
  }
  throw lastError;
}

module.exports = {
  errorStatus,
  errorCode,
  formatErrorDetails,
  isTransientDiscordError,
  retryTransient
};
