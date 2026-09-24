/**
 * Giveaway Manager
 * Coordinates ending giveaways, updating embeds/buttons, announcing winners, and handling rerolls.
 * Fully fortified against host network outages, transient connection blips, and Discord API timeouts.
 */

const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');
const { giveawayRepository, entryRepository, winnerRepository } = require('../database/repositories');
const { selectWinners } = require('./selectWinners');
const { buildGiveawayEmbed } = require('./embedBuilder');
const { withNetworkRetry, isNetworkError, NetworkOfflineError } = require('./networkRetry');

/**
 * Concludes an active giveaway, disables buttons, updates embed, and posts public winner announcement.
 * 
 * If the host's network is offline or Discord Gateway is disconnected, this function
 * safely defers conclusion without altering the database status, ensuring the giveaway
 * is not prematurely ended or lost while disconnected.
 * 
 * @param {import('discord.js').Client} client
 * @param {object} giveaway - Giveaway record
 * @param {object} [options={}]
 * @param {string} [options.endedBy] - User ID who manually triggered the end (if any)
 * @returns {Promise<object|null>} The winner selection results, or { deferred: true } if network offline
 */
async function endGiveaway(client, giveaway, options = {}) {
  // 1. Double-check the giveaway is still active in the database to prevent race conditions
  const current = giveawayRepository.getGiveawayById(giveaway.id);
  if (!current || current.status !== 'active') {
    return null;
  }

  // 2. Guard: If Discord Gateway is currently disconnected, defer conclusion
  if (!client.isReady()) {
    console.warn(`[Giveaway #${giveaway.id}] Host network offline or Discord Gateway disconnected. Deferring conclusion.`);
    return { deferred: true, reason: 'CLIENT_OFFLINE' };
  }

  // 3. Clear any prior uncommitted winners from an earlier interrupted draw attempt
  winnerRepository.clearWinners(giveaway.id, false);

  // 4. Select winners using shared logic (includes member & role re-validation)
  let results;
  try {
    results = await selectWinners(client, current);
  } catch (err) {
    if (isNetworkError(err) || err instanceof NetworkOfflineError) {
      console.warn(`[Giveaway #${giveaway.id}] Network error during winner selection (${err.message}). Deferring conclusion.`);
      winnerRepository.clearWinners(giveaway.id, false);
      return { deferred: true, reason: 'NETWORK_OFFLINE', error: err.message };
    }
    console.error(`[Giveaway #${giveaway.id}] Permanent error selecting winners:`, err);
    // On unexpected permanent error, mark ended to avoid infinite loop
    giveawayRepository.updateGiveawayStatus(giveaway.id, 'ended');
    return null;
  }

  // 5. Fetch Discord channel with network retry
  let channel = null;
  try {
    channel = await withNetworkRetry(
      () => client.channels.fetch(giveaway.channel_id),
      { context: `Channel Fetch (${giveaway.channel_id})`, maxRetries: 3 }
    );
  } catch (err) {
    if (isNetworkError(err)) {
      console.warn(`[Giveaway #${giveaway.id}] Network offline while fetching channel. Deferring conclusion.`);
      winnerRepository.clearWinners(giveaway.id, false);
      return { deferred: true, reason: 'NETWORK_OFFLINE', error: err.message };
    }
    console.warn(`[Giveaway #${giveaway.id}] Channel ${giveaway.channel_id} permanently inaccessible:`, err.message);
  }

  // 6. Update original giveaway message and announce winners (if channel is accessible)
  if (channel) {
    const totalEntries = entryRepository.getEntryCount(giveaway.id);

    // Prepare disabled button row
    const disabledRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('giveaway_ended_indicator')
        .setLabel('Enter Giveaway')
        .setEmoji('🎉')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(true)
    );

    const endedEmbed = buildGiveawayEmbed(current, totalEntries, 'ended', results.winners);

    // Attempt to update original message
    try {
      const originalMessage = await withNetworkRetry(
        () => channel.messages.fetch(giveaway.message_id),
        { context: `Message Fetch (${giveaway.message_id})`, maxRetries: 3 }
      ).catch((err) => {
        if (isNetworkError(err)) throw err;
        return null; // Message deleted or not found
      });

      if (originalMessage) {
        await withNetworkRetry(
          () => originalMessage.edit({
            embeds: [endedEmbed],
            components: [disabledRow],
          }),
          { context: `Message Edit (${giveaway.message_id})`, maxRetries: 3 }
        );
      }
    } catch (err) {
      if (isNetworkError(err)) {
        console.warn(`[Giveaway #${giveaway.id}] Network offline while editing message. Deferring conclusion.`);
        winnerRepository.clearWinners(giveaway.id, false);
        return { deferred: true, reason: 'NETWORK_OFFLINE', error: err.message };
      }
      console.error(`[Giveaway #${giveaway.id}] Could not edit original message:`, err.message);
    }

    // Post winner announcement
    try {
      const prize = current.prize || current.title;
      const isDistinctPrize = current.prize && current.prize !== current.title;

      if (results.winners.length > 0) {
        const winnerMentions = results.winners.map((id) => `<@${id}>`).join(', ');
        let announcement = isDistinctPrize
          ? `🎉 Congratulations ${winnerMentions}! You won **${prize}** in **${current.title}**!`
          : `🎉 Congratulations ${winnerMentions}! You won **${prize}**!`;

        if (results.insufficientEntries) {
          announcement += `\n*(Fewer winners than requested were chosen due to insufficient valid entries)*`;
        }

        await withNetworkRetry(
          () => channel.send({
            content: announcement,
            allowedMentions: { users: results.winners },
          }),
          { context: `Winner Announcement (#${giveaway.id})`, maxRetries: 3 }
        );
      } else {
        const announcement = `No valid entries — no winner could be determined for **${current.title}**.`;
        await withNetworkRetry(
          () => channel.send({ content: announcement }),
          { context: `Zero-Winner Announcement (#${giveaway.id})`, maxRetries: 3 }
        );
      }
    } catch (err) {
      if (isNetworkError(err)) {
        console.warn(`[Giveaway #${giveaway.id}] Network offline while sending announcement. Deferring conclusion.`);
        winnerRepository.clearWinners(giveaway.id, false);
        return { deferred: true, reason: 'NETWORK_OFFLINE', error: err.message };
      }
      console.error(`[Giveaway #${giveaway.id}] Failed to send announcement:`, err.message);
    }
  }

  // 7. Atomic Status Transition: Only mark as ended once Discord updates completed or verified unavailable
  giveawayRepository.updateGiveawayStatus(giveaway.id, 'ended');
  console.log(`[Giveaway #${giveaway.id}] Successfully concluded and marked as ended.`);

  return results;
}

/**
 * Rerolls winners for an already-ended giveaway.
 * 
 * @param {import('discord.js').Client} client
 * @param {object} giveaway - Ended giveaway record
 * @param {object} [options={}]
 * @param {number} [options.winnerCount] - Number of new winners to roll
 * @param {boolean} [options.allowRepeatWinners=false] - Whether prior winners can win again
 * @returns {Promise<object>} Reroll selection results
 */
async function rerollGiveaway(client, giveaway, options = {}) {
  const allowRepeat = !!options.allowRepeatWinners;
  const previousWinnerIds = allowRepeat ? [] : winnerRepository.getPreviousWinnerIds(giveaway.id);

  // Execute winner selection with exclusion of previous winners
  const results = await selectWinners(client, giveaway, {
    winnerCount: options.winnerCount || giveaway.winner_count,
    excludeUserIds: previousWinnerIds,
    isReroll: true,
  });

  const channel = await withNetworkRetry(
    () => client.channels.fetch(giveaway.channel_id),
    { context: `Reroll Channel Fetch (${giveaway.channel_id})`, maxRetries: 3 }
  ).catch((err) => {
    if (isNetworkError(err)) throw new NetworkOfflineError(err.message);
    return null;
  });

  if (!channel) {
    throw new Error('Giveaway channel could not be found.');
  }

  const prize = giveaway.prize || giveaway.title;
  const isDistinctPrize = giveaway.prize && giveaway.prize !== giveaway.title;

  if (results.winners.length > 0) {
    const winnerMentions = results.winners.map((id) => `<@${id}>`).join(', ');
    let announcement = isDistinctPrize
      ? `🔁 **REROLL**: Congratulations ${winnerMentions}! You won **${prize}** in **${giveaway.title}**!`
      : `🔁 **REROLL**: Congratulations ${winnerMentions}! You won **${prize}**!`;

    if (results.insufficientEntries) {
      announcement += `\n*(Note: Only ${results.winners.length} eligible entrant(s) were available for reroll)*`;
    }

    await withNetworkRetry(
      () => channel.send({
        content: announcement,
        allowedMentions: { users: results.winners },
      }),
      { context: `Send Reroll Announcement (#${giveaway.id})`, maxRetries: 3 }
    );
  } else {
    await withNetworkRetry(
      () => channel.send({
        content: `🔁 **REROLL**: No eligible new winners could be found for **${giveaway.title}**.`,
      }),
      { context: `Send Zero-Reroll Announcement (#${giveaway.id})`, maxRetries: 3 }
    );
  }

  return results;
}

module.exports = {
  endGiveaway,
  rerollGiveaway,
};
