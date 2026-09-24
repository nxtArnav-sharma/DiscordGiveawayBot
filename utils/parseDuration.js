/**
 * Duration Parser Utility
 * Converts human-friendly duration strings (e.g., '1d', '2h30m', '45m', '1d12h') into milliseconds.
 */

const { LIMITS } = require('./constants');

/**
 * Parses a duration string into milliseconds.
 * 
 * Supports units:
 *   - w = weeks (7 days)
 *   - d = days (24 hours)
 *   - h = hours (60 minutes)
 *   - m = minutes (60 seconds)
 *   - s = seconds (1000 ms)
 * 
 * @param {string} input - Duration string, e.g. "1d12h30m"
 * @returns {number} Duration in milliseconds
 * @throws {Error} If duration is malformed, zero, negative, or exceeds maximum limit
 */
function parseDuration(input) {
  if (!input || typeof input !== 'string') {
    throw new Error('Duration must be a non-empty string. Valid examples: "1d", "2h30m", "45m", "1d12h", "1w", "30s".');
  }

  const clean = input.trim().toLowerCase();

  // Pattern matches numbers followed by unit characters (w, d, h, m, s)
  const regex = /(\d+)\s*([wdhms])/g;
  let match;
  let totalMs = 0;
  let matchedLength = 0;

  const UNIT_MAP = {
    w: 7 * 24 * 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
    h: 60 * 60 * 1000,
    m: 60 * 1000,
    s: 1000,
  };

  while ((match = regex.exec(clean)) !== null) {
    const value = parseInt(match[1], 10);
    const unit = match[2];

    if (isNaN(value) || value < 0) {
      throw new Error(`Invalid duration value "${match[1]}". Values must be positive integers.`);
    }

    totalMs += value * (UNIT_MAP[unit] || 0);
    matchedLength += match[0].length;
  }

  // Check if the entire string was recognized (ignoring internal spaces)
  const strippedClean = clean.replace(/\s+/g, '');
  const strippedMatched = clean.match(/(\d+\s*[wdhms])/g)?.join('').replace(/\s+/g, '') || '';

  if (totalMs <= 0 || strippedClean !== strippedMatched) {
    throw new Error(
      `Invalid duration format: "${input}".\n` +
      'Please use valid units (s, m, h, d, w). Examples: "1d", "2h30m", "45m", "1d12h", "1w", "30s".'
    );
  }

  if (totalMs < LIMITS.MIN_DURATION_MS) {
    throw new Error(`Duration is too short. Minimum duration is ${LIMITS.MIN_DURATION_MS / 1000} seconds.`);
  }

  if (totalMs > LIMITS.MAX_DURATION_MS) {
    const maxDays = Math.floor(LIMITS.MAX_DURATION_MS / (24 * 60 * 60 * 1000));
    throw new Error(`Duration cannot exceed ${maxDays} days.`);
  }

  return totalMs;
}

/**
 * Formats milliseconds into a human-readable duration string.
 * @param {number} ms - Milliseconds
 * @returns {string} Formatted string like "1d 2h 30m"
 */
function formatDuration(ms) {
  if (!ms || ms <= 0) return '0s';

  const seconds = Math.floor((ms / 1000) % 60);
  const minutes = Math.floor((ms / (1000 * 60)) % 60);
  const hours = Math.floor((ms / (1000 * 60 * 60)) % 24);
  const days = Math.floor(ms / (1000 * 60 * 60 * 24));

  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (seconds > 0 && parts.length === 0) parts.push(`${seconds}s`);

  return parts.join(' ') || '0s';
}

module.exports = {
  parseDuration,
  formatDuration,
};
