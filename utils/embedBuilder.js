/**
 * Giveaway Embed Builder
 * Generates styled embeds matching the exact clean card layout:
 * 
 * 🎉 {Title} (ENDED)
 * 🎁 Prize: {Title}
 * 👤 Hosted By: <@{HostId}>
 * 🏆 Winners: <@{WinnerId}>   (when ended)
 * -----------------
 * 🏆 Winners       👥 Entries       ⏳ Ends In
 * `1`              `0`              <t:1726746660:R>
 * 
 * [Optional Image Banner]
 * Ends at • 9/19/2026 5:21 PM
 */

const { EmbedBuilder } = require('discord.js');
const { COLORS } = require('./constants');
const { formatRoleList } = require('./roleHelper');

/**
 * Builds the clean giveaway embed matching the reference UI design.
 * 
 * @param {object} giveaway - Giveaway record
 * @param {number} entryCount - Current number of entrants
 * @param {'active'|'ended'} [status='active']
 * @param {string[]} [winnerIds=[]] - Array of winner user IDs (when ended)
 * @returns {EmbedBuilder}
 */
function buildGiveawayEmbed(giveaway, entryCount, status = 'active', winnerIds = []) {
  const endTimestampSec = Math.floor(giveaway.end_timestamp / 1000);
  const isEnded = status === 'ended';

  const embed = new EmbedBuilder();

  // 1. Embed Title: "🎉 {Title}" or "🎉 {Title} (ENDED)"
  embed.setTitle(isEnded ? `🎉 ${giveaway.title} (ENDED)` : `🎉 ${giveaway.title}`);
  embed.setColor(isEnded ? COLORS.ENDED : COLORS.PRIMARY);

  // 2. Top Info Section
  const prize = giveaway.prize || giveaway.title;
  const descLines = [
    `🎁 **Prize:** ${prize}`,
    `👤 **Hosted By:** <@${giveaway.host_id}>`,
  ];

  const requiredRoles = giveaway.required_roles || [];
  if (requiredRoles.length > 0) {
    descLines.push(`📜 **Required Roles:** ${formatRoleList(requiredRoles)}`);
  }

  const blacklistedRoles = giveaway.blacklisted_roles || [];
  if (blacklistedRoles.length > 0) {
    descLines.push(`⛔ **Blacklisted Roles:** ${formatRoleList(blacklistedRoles)}`);
  }

  // When ended, show the winner tags above the divider
  if (isEnded) {
    descLines.push('');
    const winnerText = winnerIds && winnerIds.length > 0
      ? winnerIds.map((id) => `<@${id}>`).join(', ')
      : '*No valid entries*';
    descLines.push(`🏆 **Winners:** ${winnerText}`);
  }

  // Clean horizontal divider
  descLines.push('-----------------');

  embed.setDescription(descLines.join('\n'));

  // 3. Three-column inline statistics
  embed.addFields(
    {
      name: '🏆 Winners',
      value: `\`${giveaway.winner_count}\``,
      inline: true,
    },
    {
      name: '👥 Entries',
      value: `\`${entryCount}\``,
      inline: true,
    },
    {
      name: '⏳ Ends In',
      value: `<t:${endTimestampSec}:R>`,
      inline: true,
    }
  );

  // 4. Large center image banner (if provided)
  if (giveaway.image_url && typeof giveaway.image_url === 'string' && giveaway.image_url.startsWith('http')) {
    embed.setImage(giveaway.image_url);
  }

  // 5. Clean Discord native footer with timestamp
  // Displays as: "Ends at • MM/DD/YYYY HH:MM AM/PM"
  embed.setFooter({ text: isEnded ? 'Ended at' : 'Ends at' });
  embed.setTimestamp(new Date(giveaway.end_timestamp));

  return embed;
}

module.exports = {
  buildGiveawayEmbed,
};
