/**
 * Application Constants
 * Standardized embed colors, button custom IDs, timeouts, and validation limits.
 */

module.exports = {
  // Visual Embed Colors (Discord integer values)
  COLORS: {
    PRIMARY: 0x5865F2, // Blurple
    GOLD: 0xFEE75C,    // Gold / Highlight
    SUCCESS: 0x57F287, // Green
    ERROR: 0xED4245,   // Red
    ENDED: 0x4F545C,   // Dark Grey for concluded giveaways
  },

  // Button and Component Custom IDs & Prefixes
  COMPONENTS: {
    ENTER_BUTTON_ID: 'giveaway_enter',
    LEAVE_BUTTON_ID: 'giveaway_leave',
    CONFIG_MODAL_PREFIX: 'giveaway_config_modal:',
  },

  // Constraints & Limits
  LIMITS: {
    MAX_DURATION_MS: 30 * 24 * 60 * 60 * 1000, // 30 days max
    MIN_DURATION_MS: 5 * 1000,                  // 5 seconds minimum
    MIN_WINNERS: 1,
    MAX_WINNERS: 100,                           // Practical ceiling
    PENDING_CONFIG_TTL_MS: 15 * 60 * 1000,      // 15 minutes cache TTL for modal options
    RECONCILE_INTERVAL_MS: 60 * 1000,           // 60-second background drift reconciliation
  },
};
