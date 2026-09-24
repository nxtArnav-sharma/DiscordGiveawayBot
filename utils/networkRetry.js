/**
 * Network Resilience & Retry Utilities
 * 
 * Provides exponential backoff retries and network outage detection
 * to ensure giveaway operations survive host network disconnects and packet loss.
 */

class NetworkOfflineError extends Error {
  constructor(message = 'Host network connection is offline or Discord Gateway is unreachable.') {
    super(message);
    this.name = 'NetworkOfflineError';
  }
}

/**
 * Checks if an error is caused by a network outage, socket timeout, or temporary Discord gateway disconnect.
 * @param {Error|any} err
 * @returns {boolean}
 */
function isNetworkError(err) {
  if (!err) return false;
  if (err instanceof NetworkOfflineError || err.name === 'NetworkOfflineError') return true;

  const code = err.code || err.cause?.code;
  const networkCodes = [
    'ENOTFOUND',
    'ECONNRESET',
    'ECONNREFUSED',
    'ETIMEDOUT',
    'EHOSTUNREACH',
    'ENETUNREACH',
    'EAI_AGAIN',
    'UND_ERR_CONNECT_TIMEOUT',
    'UND_ERR_SOCKET',
    'UND_ERR_BODY_TIMEOUT',
    'UND_ERR_HEADERS_TIMEOUT',
    'UND_ERR_RESPONSE_STATUS_CODE',
  ];
  if (code && networkCodes.includes(code)) return true;

  // Discord.js / undici / node-fetch network error names
  const networkNames = [
    'FetchError',
    'AbortError',
    'ConnectTimeoutError',
    'SocketError',
    'TimeoutError',
  ];
  if (networkNames.includes(err.name) || (err.cause && networkNames.includes(err.cause.name))) {
    return true;
  }

  // HTTP Gateway / Cloudflare / Discord transient outage status codes
  const status = err.status || err.httpStatus;
  if (status && [500, 502, 503, 504].includes(status)) {
    return true;
  }

  // Fallback string matching on error message
  const msg = (err.message || '').toLowerCase();
  if (
    msg.includes('fetch failed') ||
    msg.includes('getaddrinfo') ||
    msg.includes('connection timed out') ||
    msg.includes('client has been disconnected') ||
    msg.includes('gateway is not connected') ||
    msg.includes('socket hung up') ||
    msg.includes('econnreset') ||
    msg.includes('und_err') ||
    msg.includes('network error')
  ) {
    return true;
  }

  return false;
}

/**
 * Wraps an async Discord API operation with exponential backoff retries on transient network errors.
 * 
 * @template T
 * @param {() => Promise<T>} operation
 * @param {object} [options={}]
 * @param {number} [options.maxRetries=3]
 * @param {number} [options.initialDelayMs=1000]
 * @param {number} [options.maxDelayMs=8000]
 * @param {string} [options.context='Discord Operation']
 * @returns {Promise<T>}
 */
async function withNetworkRetry(operation, options = {}) {
  const maxRetries = options.maxRetries ?? 3;
  const initialDelay = options.initialDelayMs ?? 1000;
  const maxDelay = options.maxDelayMs ?? 8000;
  const context = options.context || 'Discord Operation';

  let lastError;
  let delay = initialDelay;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (err) {
      lastError = err;

      // If it's a permanent API error (e.g. 404 Unknown Message, 403 Missing Permissions), don't retry
      if (!isNetworkError(err)) {
        throw err;
      }

      if (attempt < maxRetries) {
        console.warn(
          `[Network Resilience] ${context} encountered network error: "${err.message}". Retrying in ${delay}ms (attempt ${attempt}/${maxRetries})...`
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
        delay = Math.min(delay * 2, maxDelay);
      }
    }
  }

  throw lastError;
}

module.exports = {
  NetworkOfflineError,
  isNetworkError,
  withNetworkRetry,
};
