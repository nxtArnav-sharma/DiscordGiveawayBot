/**
 * Shared Winner Selection Logic
 * 
 * Implements re-validation of guild membership & roles at selection time,
 * guaranteed winner priority with graceful fallback, and unbiased Fisher-Yates shuffle.
 */

const { entryRepository, winnerRepository } = require('../database/repositories');

/**
 * Executes winner selection for a giveaway.
 * 
 * @param {import('discord.js').Client} client - Discord Client
 * @param {object} giveaway - Giveaway record from database
 * @param {object} [options={}]
 * @param {number} [options.winnerCount] - Optional winner count override (for rerolls)
 * @param {string[]} [options.excludeUserIds] - User IDs to exclude (e.g. prior winners)
 * @param {boolean} [options.isReroll=false] - Whether this selection is a reroll
 * @returns {Promise<{
 *   winners: string[],
 *   totalEntries: number,
 *   validEntries: number,
 *   guaranteedWinnerHonored: boolean,
 *   guaranteedWinnerFallback: boolean,
 *   insufficientEntries: boolean
 * }>}
 */
async function selectWinners(client, giveaway, options = {}) {
  const targetWinnerCount = Math.max(1, options.winnerCount || giveaway.winner_count);
  const excludeUserIds = new Set(options.excludeUserIds || []);
  const isReroll = !!options.isReroll;

  // 1. Load all entries from database
  const rawEntries = entryRepository.getEntries(giveaway.id);
  const totalEntries = rawEntries.length;

  // Fetch the Discord Guild
  const guild = await client.guilds.fetch(giveaway.guild_id).catch(() => null);
  if (!guild) {
    throw new Error(`Guild ${giveaway.guild_id} could not be fetched.`);
  }

  const requiredRoles = giveaway.required_roles || [];
  const blacklistedRoles = giveaway.blacklisted_roles || [];
  const guaranteedWinnerIds = giveaway.guaranteed_winner_ids || [];

  // 2. Re-validate each entrant at selection time
  const validPool = [];

  for (const entry of rawEntries) {
    const userId = entry.user_id;

    // Exclude prior winners on reroll (unless allow_repeat_winners was specified)
    if (excludeUserIds.has(userId)) {
      continue;
    }

    // Check if member is still in the guild
    const member = await guild.members.fetch(userId).catch(() => null);
    if (!member) {
      console.log(`[Giveaway #${giveaway.id}] User ${userId} is no longer in guild "${guild.name}", disqualified.`);
      continue;
    }

    // Blacklist check: Disqualify if member has ANY blacklisted role
    const hasBlacklistedRole = blacklistedRoles.some((roleId) => member.roles.cache.has(roleId));
    if (hasBlacklistedRole) {
      console.log(`[Giveaway #${giveaway.id}] User ${userId} holds a blacklisted role, disqualified.`);
      continue;
    }

    // Required roles check: If required roles exist, member must have AT LEAST ONE
    if (requiredRoles.length > 0) {
      const hasRequiredRole = requiredRoles.some((roleId) => member.roles.cache.has(roleId));
      if (!hasRequiredRole) {
        console.log(`[Giveaway #${giveaway.id}] User ${userId} lacks required roles at draw time, disqualified.`);
        continue;
      }
    }

    validPool.push(userId);
  }

  const validEntriesCount = validPool.length;
  const selectedWinners = [];
  let guaranteedWinnerHonored = false;
  let guaranteedWinnerFallback = false;

  // 3. Guaranteed Winner Logic:
  // If set and present in the valid entry pool, they take one winner slot automatically.
  // If they did not enter or were disqualified, fall back to normal random selection.
  if (guaranteedWinnerIds.length > 0) {
    for (const gwId of guaranteedWinnerIds) {
      if (selectedWinners.length >= targetWinnerCount) break;

      const gwIndex = validPool.indexOf(gwId);
      if (gwIndex !== -1) {
        // Guaranteed winner entered and qualifies!
        selectedWinners.push(gwId);
        validPool.splice(gwIndex, 1); // Remove from random pool
        guaranteedWinnerHonored = true;
        console.log(`[Giveaway #${giveaway.id}] Guaranteed winner ${gwId} honored.`);
      } else {
        guaranteedWinnerFallback = true;
        console.log(`[Giveaway #${giveaway.id}] Guaranteed winner ${gwId} did not enter or was disqualified; falling back to random draw.`);
      }
    }
  }

  // 4. Random selection for remaining slots using Fisher-Yates shuffle
  const slotsRemaining = targetWinnerCount - selectedWinners.length;

  if (slotsRemaining > 0 && validPool.length > 0) {
    if (validPool.length <= slotsRemaining) {
      // If pool is smaller than or equal to needed slots, take everyone available
      selectedWinners.push(...validPool);
    } else {
      // Fisher-Yates (Knuth) Shuffle algorithm for unbiased uniform random distribution
      for (let i = validPool.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [validPool[i], validPool[j]] = [validPool[j], validPool[i]];
      }

      // Pick the required number of winners
      const picked = validPool.slice(0, slotsRemaining);
      selectedWinners.push(...picked);
    }
  }

  // 5. Record winners in the database
  if (selectedWinners.length > 0) {
    winnerRepository.recordWinners(giveaway.id, selectedWinners, isReroll);
  }

  const insufficientEntries = selectedWinners.length < targetWinnerCount;

  return {
    winners: selectedWinners,
    totalEntries,
    validEntries: validEntriesCount,
    guaranteedWinnerHonored,
    guaranteedWinnerFallback,
    insufficientEntries,
  };
}

module.exports = {
  selectWinners,
};
