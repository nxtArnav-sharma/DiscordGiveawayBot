/**
 * Whitelist Configuration
 * 
 * Defines the authorized Discord user IDs permitted to execute giveaway management
 * commands (/giveaway config, /giveaway start, /giveaway end, /giveaway reroll).
 * 
 * The primary owner ID is explicitly included by default.
 * Additional user IDs can be added to the array or passed via the WHITELISTED_USERS
 * environment variable (comma-separated).
 */

require('dotenv').config();

// Primary whitelisted users (Owner / Bot Administrators)
const DEFAULT_WHITELISTED_USERS = [
  '1031935053695037542', // Bot Owner
];

// Load additional whitelisted IDs from environment if provided
const envUsers = process.env.WHITELISTED_USERS
  ? process.env.WHITELISTED_USERS.split(',').map((id) => id.trim()).filter(Boolean)
  : [];

// Combined unique set of whitelisted user IDs
const whitelistedUserIds = new Set([...DEFAULT_WHITELISTED_USERS, ...envUsers]);

/**
 * Check if a Discord user ID is on the authorized whitelist.
 * @param {string} userId - Discord user snowflake ID
 * @returns {boolean}
 */
function isUserWhitelisted(userId) {
  if (!userId) return false;
  return whitelistedUserIds.has(String(userId));
}

/**
 * Get the current list of whitelisted user IDs.
 * @returns {string[]}
 */
function getWhitelistedUsers() {
  return Array.from(whitelistedUserIds);
}

/**
 * Dynamically add a user ID to the whitelist at runtime.
 * @param {string} userId - Discord user snowflake ID
 */
function addWhitelistedUser(userId) {
  if (userId) {
    whitelistedUserIds.add(String(userId));
  }
}

module.exports = {
  isUserWhitelisted,
  getWhitelistedUsers,
  addWhitelistedUser,
};
