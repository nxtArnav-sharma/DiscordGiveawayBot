/**
 * Scheduler & Reconciler
 * 
 * Reconciles active giveaways against stored SQLite end-timestamps on boot and
 * schedules accurate conclusion timeouts with drift protection.
 */

const { giveawayRepository } = require('../database/repositories');
const { endGiveaway } = require('./giveawayManager');
const { LIMITS } = require('./constants');

// In-memory registry of scheduled NodeJS.Timeout handles keyed by giveaway ID
const activeTimeouts = new Map();

// Maximum safe 32-bit signed integer delay for setTimeout (~24.85 days)
const MAX_TIMEOUT_MS = 2147483647;

/**
 * Schedules the automatic conclusion of a giveaway.
 * 
 * @param {import('discord.js').Client} client
 * @param {object} giveaway - Giveaway record from database
 */
function scheduleGiveaway(client, giveaway) {
  // Cancel any existing timeout for this giveaway to prevent duplicate timers
  cancelScheduledGiveaway(giveaway.id);

  const remainingMs = giveaway.end_timestamp - Date.now();

  // If the giveaway end timestamp has already passed, conclude immediately
  if (remainingMs <= 0) {
    console.log(`[Scheduler] Giveaway #${giveaway.id} end timestamp has passed. Ending now...`);
    endGiveaway(client, giveaway).catch((err) => {
      console.error(`[Scheduler] Error concluding expired giveaway #${giveaway.id}:`, err);
    });
    return;
  }

  // Node.js setTimeout 32-bit overflow guard:
  // If remaining time exceeds 24.8 days, set timeout to max safe value and re-evaluate on fire.
  const safeDelay = Math.min(remainingMs, MAX_TIMEOUT_MS);

  const timeoutHandle = setTimeout(async () => {
    activeTimeouts.delete(giveaway.id);

    // Refresh record to check current state
    const current = giveawayRepository.getGiveawayById(giveaway.id);
    if (!current || current.status !== 'active') return;

    const recheckRemaining = current.end_timestamp - Date.now();
    if (recheckRemaining > 1000) {
      // Still has remaining time (e.g., if delay was capped by MAX_TIMEOUT_MS)
      scheduleGiveaway(client, current);
    } else {
      await endGiveaway(client, current).catch((err) => {
        console.error(`[Scheduler] Error ending giveaway #${current.id}:`, err);
      });
    }
  }, safeDelay);

  activeTimeouts.set(giveaway.id, timeoutHandle);
  console.log(`[Scheduler] Giveaway #${giveaway.id} scheduled to end in ${Math.round(remainingMs / 1000)}s.`);
}

/**
 * Cancels a scheduled in-memory timeout for a giveaway (e.g., when manually ended early).
 * 
 * @param {number} giveawayId
 */
function cancelScheduledGiveaway(giveawayId) {
  if (activeTimeouts.has(giveawayId)) {
    clearTimeout(activeTimeouts.get(giveawayId));
    activeTimeouts.delete(giveawayId);
  }
}

/**
 * Initializes the scheduler on bot startup.
 * Loads all active giveaways from the database, recalculates remaining time,
 * and launches a safety drift check interval.
 * 
 * @param {import('discord.js').Client} client
 */
function initScheduler(client) {
  console.log('[Scheduler] Reconciling active giveaways from database...');

  const activeGiveaways = giveawayRepository.getAllActiveGiveaways();
  console.log(`[Scheduler] Found ${activeGiveaways.length} active giveaway(s) to reconcile.`);

  for (const giveaway of activeGiveaways) {
    scheduleGiveaway(client, giveaway);
  }

  // Secondary Safety Interval:
  // Runs every 60 seconds to safeguard against system sleep, clock drift, or missed timeouts
  setInterval(() => {
    try {
      const active = giveawayRepository.getAllActiveGiveaways();
      const now = Date.now();

      for (const gw of active) {
        if (gw.end_timestamp <= now) {
          console.log(`[Scheduler Drift Guard] Found overdue giveaway #${gw.id}. Concluding...`);
          cancelScheduledGiveaway(gw.id);
          endGiveaway(client, gw).catch((err) => {
            console.error(`[Scheduler Drift Guard] Failed to conclude #${gw.id}:`, err);
          });
        }
      }
    } catch (err) {
      console.error('[Scheduler Drift Guard] Error during periodic check:', err);
    }
  }, LIMITS.RECONCILE_INTERVAL_MS);
}

module.exports = {
  scheduleGiveaway,
  cancelScheduledGiveaway,
  initScheduler,
};
