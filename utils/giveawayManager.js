/**
 * Giveaway Manager
 * Coordinates ending giveaways, updating embeds/buttons, announcing winners, and handling rerolls.
 */

const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');
const { giveawayRepository, entryRepository, winnerRepository } = require('../database/repositories');
const { selectWinners } = require('./selectWinners');
const { buildGiveawayEmbed } = require('./embedBuilder');
const { COLORS, COMPONENTS } = require('./constants');

/**
 * Concludes an active giveaway, disables buttons, updates embed, and posts public winner announcement.
 * 
 * @param {import('discord.js').Client} client
 * @param {object} giveaway - Giveaway record
 * @param {object} [options={}]
 * @param {string} [options.endedBy] - User ID who manually triggered the end (if any)
 * @returns {Promise<object|null>} The winner selection results
 */
async function endGiveaway(client, giveaway, options = {}) {
  // Double-check the giveaway is still active in the database to prevent race conditions
  const current = giveawayRepository.getGiveawayById(giveaway.id);
  if (!current || current.status !== 'active') {
    return null;
  }

  // Mark status as ended
  giveawayRepository.updateGiveawayStatus(giveaway.id, 'ended');

  // Select winners using shared logic
  let results;
  try {
    results = await selectWinners(client, current);
  } catch (err) {
    console.error(`[Giveaway #${giveaway.id}] Error selecting winners:`, err);
    return null;
  }

  // Fetch Discord channel
  const channel = await client.channels.fetch(giveaway.channel_id).catch(() => null);
  if (!channel) {
    console.warn(`[Giveaway #${giveaway.id}] Target channel ${giveaway.channel_id} not found.`);
    return results;
  }

  // Fetch the original giveaway message
  const originalMessage = await channel.messages.fetch(giveaway.message_id).catch(() => null);

  const totalEntries = entryRepository.getEntryCount(giveaway.id);

  // 1. Update the original giveaway message
  if (originalMessage) {
    // Disabled ended button
    const disabledRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('giveaway_ended_indicator')
        .setLabel('Enter Giveaway')
        .setEmoji('🎉')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(true)
    );

    const endedEmbed = buildGiveawayEmbed(current, totalEntries, 'ended', results.winners);

    await originalMessage.edit({
      embeds: [endedEmbed],
      components: [disabledRow],
    }).catch((err) => console.error(`[Giveaway #${giveaway.id}] Failed to edit original message:`, err));
  }

  // 2. Announce winners in the channel
  if (results.winners.length > 0) {
    const winnerMentions = results.winners.map((id) => `<@${id}>`).join(', ');
    let announcement = `🎉 Congratulations ${winnerMentions}! You won **${giveaway.title}**!`;

    if (results.insufficientEntries) {
      announcement += `\n*(Fewer winners than requested were chosen due to insufficient valid entries)*`;
    }

    await channel.send({
      content: announcement,
      allowedMentions: { users: results.winners },
    }).catch((err) => console.error(`[Giveaway #${giveaway.id}] Failed to send winner announcement:`, err));
  } else {
    await channel.send({
      content: `No valid entries — no winner could be determined for **${giveaway.title}**.`,
    }).catch((err) => console.error(`[Giveaway #${giveaway.id}] Failed to send zero-winner announcement:`, err));
  }

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

  const channel = await client.channels.fetch(giveaway.channel_id).catch(() => null);
  if (!channel) {
    throw new Error('Giveaway channel could not be found.');
  }

  if (results.winners.length > 0) {
    const winnerMentions = results.winners.map((id) => `<@${id}>`).join(', ');
    let announcement = `🔁 **REROLL**: Congratulations ${winnerMentions}! You won **${giveaway.title}**!`;

    if (results.insufficientEntries) {
      announcement += `\n*(Note: Only ${results.winners.length} eligible entrant(s) were available for reroll)*`;
    }

    await channel.send({
      content: announcement,
      allowedMentions: { users: results.winners },
    });
  } else {
    await channel.send({
      content: `🔁 **REROLL**: No eligible new winners could be found for **${giveaway.title}**.`,
    });
  }

  return results;
}

module.exports = {
  endGiveaway,
  rerollGiveaway,
};
