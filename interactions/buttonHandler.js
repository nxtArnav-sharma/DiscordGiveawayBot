/**
 * Button Interaction Handler
 * 
 * Handles entry and withdrawal interactions for active giveaways.
 * Validates member roles against required and blacklisted roles in real-time,
 * prevents duplicate entries, and updates the live entry counter on the message embed.
 */

const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} = require('discord.js');
const { giveawayRepository, entryRepository } = require('../database/repositories');
const { buildGiveawayEmbed } = require('../utils/embedBuilder');
const { COMPONENTS, COLORS } = require('../utils/constants');

/**
 * Updates the public giveaway embed with the current entry count.
 * 
 * @param {import('discord.js').Message} message
 * @param {object} giveaway
 * @param {number} entryCount
 */
async function updateGiveawayMessageCount(message, giveaway, entryCount) {
  try {
    const updatedEmbed = buildGiveawayEmbed(giveaway, entryCount, 'active');
    await message.edit({ embeds: [updatedEmbed] });
  } catch (err) {
    console.error(`[Button Handler] Failed to update entry count on message ${message.id}:`, err);
  }
}

/**
 * Handles button interactions for giveaway entries and withdrawals.
 * 
 * @param {import('discord.js').ButtonInteraction} interaction
 */
async function handleButtonInteraction(interaction) {
  const customId = interaction.customId;

  // -------------------------------------------------------------------------
  // 1. Enter Giveaway Interaction
  // -------------------------------------------------------------------------
  if (customId === COMPONENTS.ENTER_BUTTON_ID) {
    // Find active giveaway by the message ID
    const giveaway = giveawayRepository.getGiveawayByMessageId(interaction.message.id);

    if (!giveaway || giveaway.status !== 'active') {
      return interaction.reply({
        content: '❌ This giveaway is no longer active.',
        flags: MessageFlags.Ephemeral,
      });
    }

    const member = interaction.member;
    if (!member) {
      return interaction.reply({
        content: '❌ Could not retrieve your server member details. Please try again.',
        flags: MessageFlags.Ephemeral,
      });
    }

    // Role Check A: Blacklist Check
    const blacklistedRoles = giveaway.blacklisted_roles || [];
    const isBlacklisted = blacklistedRoles.some((roleId) => member.roles.cache.has(roleId));
    if (isBlacklisted) {
      return interaction.reply({
        content: '❌ You are blacklisted from entering this giveaway.',
        flags: MessageFlags.Ephemeral,
      });
    }

    // Role Check B: Required Roles Check
    const requiredRoles = giveaway.required_roles || [];
    if (requiredRoles.length > 0) {
      const hasRequiredRole = requiredRoles.some((roleId) => member.roles.cache.has(roleId));
      if (!hasRequiredRole) {
        return interaction.reply({
          content: '❌ You do not have a required role to enter this giveaway.',
          flags: MessageFlags.Ephemeral,
        });
      }
    }

    // Check if user has already entered
    const alreadyEntered = entryRepository.hasEntered(giveaway.id, interaction.user.id);
    if (alreadyEntered) {
      // Optional Nice-to-Have: Provide a button to leave/withdraw entry
      const leaveRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`${COMPONENTS.LEAVE_BUTTON_ID}:${giveaway.id}`)
          .setLabel('Leave Giveaway')
          .setStyle(ButtonStyle.Danger)
      );

      return interaction.reply({
        content: "You've already entered this giveaway! If you wish to withdraw, click below:",
        components: [leaveRow],
        flags: MessageFlags.Ephemeral,
      });
    }

    // Record entry in database
    const success = entryRepository.addEntry(giveaway.id, interaction.user.id);
    if (!success) {
      return interaction.reply({
        content: "You've already entered this giveaway.",
        flags: MessageFlags.Ephemeral,
      });
    }

    // Fetch updated entry count
    const entryCount = entryRepository.getEntryCount(giveaway.id);

    // Ephemeral confirmation to entrant
    await interaction.reply({
      content: '🎉 You have entered the giveaway! Good luck!',
      flags: MessageFlags.Ephemeral,
    });

    // Update entry count displayed on the public giveaway embed
    await updateGiveawayMessageCount(interaction.message, giveaway, entryCount);
    return;
  }

  // -------------------------------------------------------------------------
  // 2. Leave / Withdraw Entry Interaction (Stretch feature)
  // -------------------------------------------------------------------------
  if (customId.startsWith(`${COMPONENTS.LEAVE_BUTTON_ID}:`)) {
    const giveawayId = parseInt(customId.split(':')[1], 10);
    const giveaway = giveawayRepository.getGiveawayById(giveawayId);

    if (!giveaway || giveaway.status !== 'active') {
      return interaction.reply({
        content: '❌ This giveaway is no longer active.',
        flags: MessageFlags.Ephemeral,
      });
    }

    const removed = entryRepository.removeEntry(giveaway.id, interaction.user.id);
    if (!removed) {
      return interaction.reply({
        content: 'You are not entered in this giveaway.',
        flags: MessageFlags.Ephemeral,
      });
    }

    const entryCount = entryRepository.getEntryCount(giveaway.id);

    await interaction.reply({
      content: '✅ You have withdrawn your entry from this giveaway.',
      flags: MessageFlags.Ephemeral,
    });

    // Update public embed if channel and message are accessible
    const channel = await interaction.client.channels.fetch(giveaway.channel_id).catch(() => null);
    if (channel) {
      const msg = await channel.messages.fetch(giveaway.message_id).catch(() => null);
      if (msg) {
        await updateGiveawayMessageCount(msg, giveaway, entryCount);
      }
    }
  }
}

module.exports = {
  handleButtonInteraction,
};
