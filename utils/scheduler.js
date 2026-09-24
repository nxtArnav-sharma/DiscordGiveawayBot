/**
 * Scheduler & Reconciler
 * 
 * Reconciles active giveaways against stored SQLite end-timestamps on boot and reconnects,
 * schedules accurate conclusion timeouts with drift protection, and guarantees that giveaways
 * survive host network outages and disconnections without data loss or premature conclusion.
 */

const { giveawayRepository } = require('../database/repositories');
const { endGiveaway } = require('./giveawayManager');

// In-memory registry of scheduled NodeJS.Timeout handles keyed by giveaway ID
const activeTimeouts = new Map();

// Maximum safe 32-bit signed integer delay for setTimeout (~24.85 days)
const MAX_TIMEOUT_MS = 2147483647;

// Short retry interval when host network is offline and conclusion is deferred
const OFFLINE_RETRY_DELAY_MS = 15000;

// Periodic safety reconcile interval (drift guard + offline recovery)
const RECONCILE_INTERVAL_MS = 30000;

let driftIntervalHandle = null;

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

  // If the giveaway end timestamp has already passed, attempt immediate conclusion
  if (remainingMs <= 0) {
    console.log(`[Scheduler] Giveaway #${giveaway.id} end timestamp has passed (${remainingMs}ms). Concluding...`);
    (async () => {
      try {
        const result = await endGiveaway(client, giveaway);
        if (result?.deferred) {
          console.warn(`[Scheduler] Giveaway #${giveaway.id} conclusion deferred (host network offline). Retrying in ${OFFLINE_RETRY_DELAY_MS / 1000}s...`);
          const retryHandle = setTimeout(() => {
            const current = giveawayRepository.getGiveawayById(giveaway.id);
            if (current && current.status === 'active') {
              scheduleGiveaway(client, current);
            }
          }, OFFLINE_RETRY_DELAY_MS);
          activeTimeouts.set(giveaway.id, retryHandle);
        }
      } catch (err) {
        console.error(`[Scheduler] Error concluding expired giveaway #${giveaway.id}:`, err);
      }
    })();
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
      const result = await endGiveaway(client, current).catch((err) => {
        console.error(`[Scheduler] Error ending giveaway #${current.id}:`, err);
        return null;
      });

      // If network was offline when the timer fired, schedule retry
      if (result?.deferred) {
        console.warn(`[Scheduler] Giveaway #${current.id} conclusion deferred (host network offline). Retrying in ${OFFLINE_RETRY_DELAY_MS / 1000}s...`);
        const retryHandle = setTimeout(() => {
          const recheck = giveawayRepository.getGiveawayById(current.id);
          if (recheck && recheck.status === 'active') {
            scheduleGiveaway(client, recheck);
          }
        }, OFFLINE_RETRY_DELAY_MS);
        activeTimeouts.set(current.id, retryHandle);
      }
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
 * Reconciles all active giveaways from the database.
 * Called on startup, on gateway reconnect (shardResume), and by the periodic drift guard.
 * 
 * @param {import('discord.js').Client} client
 */
function reconcileActiveGiveaways(client) {
  try {
    const activeGiveaways = giveawayRepository.getAllActiveGiveaways();
    const now = Date.now();
    let overdueCount = 0;

    for (const giveaway of activeGiveaways) {
      if (giveaway.end_timestamp <= now) {
        overdueCount++;
        cancelScheduledGiveaway(giveaway.id);
        endGiveaway(client, giveaway)
          .then((res) => {
            if (res?.deferred) {
              console.warn(`[Scheduler Reconciler] Giveaway #${giveaway.id} remains queued (waiting for network)...`);
            }
          })
          .catch((err) => {
            console.error(`[Scheduler Reconciler] Error concluding #${giveaway.id}:`, err);
          });
      } else if (!activeTimeouts.has(giveaway.id)) {
        scheduleGiveaway(client, giveaway);
      }
    }

    if (overdueCount > 0) {
      console.log(`[Scheduler Reconciler] Reconciled ${activeGiveaways.length} active giveaway(s) (${overdueCount} overdue).`);
    }
  } catch (err) {
    console.error('[Scheduler Reconciler] Error during reconciliation:', err);
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
  console.log('[Scheduler] Initializing giveaway scheduler & drift guard...');

  // Immediate reconciliation
  reconcileActiveGiveaways(client);

  // Periodic safety drift check & offline network recovery interval
  if (!driftIntervalHandle) {
    driftIntervalHandle = setInterval(() => {
      reconcileActiveGiveaways(client);
    }, RECONCILE_INTERVAL_MS);
  }
}

module.exports = {
  scheduleGiveaway,
  cancelScheduledGiveaway,
  reconcileActiveGiveaways,
  initScheduler,
};
