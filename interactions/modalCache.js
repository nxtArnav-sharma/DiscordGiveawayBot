/**
 * Pending Modal Configuration Cache
 * 
 * Temporarily retains command options passed to `/giveaway config` across
 * the modal display and submission lifecycle.
 */

const { LIMITS } = require('../utils/constants');

// Map<string, { options: object, expiresAt: number }>
const pendingConfigCache = new Map();

/**
 * Stores pending slash command options for a modal session.
 * @param {string} sessionId
 * @param {object} options
 */
function setPendingConfig(sessionId, options) {
  pendingConfigCache.set(sessionId, {
    options,
    expiresAt: Date.now() + LIMITS.PENDING_CONFIG_TTL_MS,
  });
}

/**
 * Retrieves and consumes pending slash command options for a modal session.
 * @param {string} sessionId
 * @returns {object|null}
 */
function getAndClearPendingConfig(sessionId) {
  const item = pendingConfigCache.get(sessionId);
  if (!item) return null;

  pendingConfigCache.delete(sessionId);

  if (Date.now() > item.expiresAt) {
    return null;
  }

  return item.options;
}

// Periodic cleanup of expired cache entries
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of pendingConfigCache.entries()) {
    if (now > value.expiresAt) {
      pendingConfigCache.delete(key);
    }
  }
}, 5 * 60 * 1000);

module.exports = {
  setPendingConfig,
  getAndClearPendingConfig,
};
