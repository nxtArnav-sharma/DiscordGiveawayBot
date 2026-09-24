/**
 * Modal Submission Handler
 * 
 * Processes the `/giveaway config` modal submission, merges text inputs with cached
 * command options, validates members and roles, persists the template to SQLite,
 * and replies with an ephemeral confirmation summary embed.
 */

const { EmbedBuilder, MessageFlags } = require('discord.js');
const { getAndClearPendingConfig } = require('./modalCache');
const { parseDuration, formatDuration } = require('../utils/parseDuration');
const { parseAndValidateRoles, formatRoleList } = require('../utils/roleHelper');
const { parseAndValidateUsers, formatUserList } = require('../utils/userHelper');
const { configRepository } = require('../database/repositories');
const { COLORS } = require('../utils/constants');

/**
 * Handles modal submit interactions for giveaway configuration.
 * 
 * @param {import('discord.js').ModalSubmitInteraction} interaction
 */
async function handleConfigModalSubmit(interaction) {
  const customId = interaction.customId;
  const sessionId = customId.replace('giveaway_config_modal:', '');

  // Retrieve cached command options
  const pending = getAndClearPendingConfig(sessionId);
  if (!pending) {
    return interaction.reply({
      content: '❌ Your configuration session expired or was already submitted. Please run `/giveaway config` again.',
      flags: MessageFlags.Ephemeral,
    });
  }

  // Defer ephemeral reply immediately while validating members and roles
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const rawTitle = interaction.fields.getTextInputValue('title')?.trim();
  let rawPrize;
  try {
    rawPrize = interaction.fields.getTextInputValue('prize')?.trim();
  } catch {
    rawPrize = rawTitle; // Fallback for backward compatibility
  }
  if (!rawPrize) rawPrize = rawTitle;

  const rawWinners = interaction.fields.getTextInputValue('winners')?.trim();
  const rawDuration = interaction.fields.getTextInputValue('duration')?.trim();

  // 1. Validate Giveaway Name
  if (!rawTitle || rawTitle.length === 0) {
    return interaction.editReply({ content: '❌ **Giveaway Name** cannot be empty.' });
  }

  // 1b. Validate Prize
  if (!rawPrize || rawPrize.length === 0) {
    return interaction.editReply({ content: '❌ **Prize** cannot be empty.' });
  }

  // 2. Validate Winners count
  const winnerCount = parseInt(rawWinners, 10);
  if (isNaN(winnerCount) || winnerCount < 1 || String(winnerCount) !== rawWinners) {
    return interaction.editReply({
      content: '❌ **Number of Winners** must be a positive integer (minimum 1).',
    });
  }

  // 3. Validate Duration
  let durationMs;
  try {
    durationMs = parseDuration(rawDuration);
  } catch (err) {
    return interaction.editReply({
      content: `❌ ${err.message}`,
    });
  }

  // 4. Validate Host
  const hostId = pending.hostedBy || interaction.user.id;
  const hostMember = await interaction.guild.members.fetch(hostId).catch(() => null);
  if (!hostMember) {
    return interaction.editReply({
      content: `❌ The host (<@${hostId}>) is not a member of this server.`,
    });
  }

  // 5. Validate Required Roles
  const { validRoleIds: requiredRoles, invalidTokens: invalidReqTokens } = parseAndValidateRoles(
    pending.requiredRoles,
    interaction.guild
  );
  if (invalidReqTokens.length > 0) {
    return interaction.editReply({
      content: `❌ The following required role(s) could not be found in this server: ${invalidReqTokens.map((t) => `\`${t}\``).join(', ')}.`,
    });
  }

  // 6. Validate Blacklisted Roles
  const { validRoleIds: blacklistedRoles, invalidTokens: invalidBlackTokens } = parseAndValidateRoles(
    pending.blacklistedRoles,
    interaction.guild
  );
  if (invalidBlackTokens.length > 0) {
    return interaction.editReply({
      content: `❌ The following blacklisted role(s) could not be found in this server: ${invalidBlackTokens.map((t) => `\`${t}\``).join(', ')}.`,
    });
  }

  // 7. Validate Guaranteed Winner(s) (Single or Multiple)
  const guaranteedWinnerIds = [];

  if (pending.guaranteedWinnerSingle) {
    const gwMember = await interaction.guild.members.fetch(pending.guaranteedWinnerSingle).catch(() => null);
    if (!gwMember) {
      return interaction.editReply({
        content: `❌ The guaranteed winner (<@${pending.guaranteedWinnerSingle}>) is not a member of this server.`,
      });
    }
    guaranteedWinnerIds.push(pending.guaranteedWinnerSingle);
  }

  if (pending.guaranteedWinnersString) {
    const { validUserIds, invalidTokens } = await parseAndValidateUsers(
      pending.guaranteedWinnersString,
      interaction.guild
    );

    if (invalidTokens.length > 0) {
      return interaction.editReply({
        content: `❌ The following guaranteed winner(s) could not be resolved as server members: ${invalidTokens.map((t) => `\`${t}\``).join(', ')}.`,
      });
    }

    for (const uid of validUserIds) {
      if (!guaranteedWinnerIds.includes(uid)) {
        guaranteedWinnerIds.push(uid);
      }
    }
  }

  // Ensure guaranteed winners count does not exceed total winner count
  if (guaranteedWinnerIds.length > winnerCount) {
    return interaction.editReply({
      content: `❌ You specified **${guaranteedWinnerIds.length}** guaranteed winners, but only **${winnerCount}** total winners. Guaranteed winners count cannot exceed the total number of winners.`,
    });
  }

  // 8. Validate Image URL (if provided)
  const imageUrl = pending.imageUrl || null;
  if (imageUrl && !imageUrl.startsWith('http://') && !imageUrl.startsWith('https://')) {
    return interaction.editReply({
      content: '❌ **Image URL** must be a valid web link starting with `http://` or `https://`.',
    });
  }

  // 9. Persist Guild Configuration (Full Replace)
  const configData = {
    guild_id: interaction.guildId,
    title: rawTitle,
    prize: rawPrize,
    host_id: hostId,
    winner_count: winnerCount,
    duration_ms: durationMs,
    required_roles: requiredRoles,
    blacklisted_roles: blacklistedRoles,
    guaranteed_winner_ids: guaranteedWinnerIds,
    image_url: imageUrl,
  };

  configRepository.saveConfig(interaction.guildId, configData);

  // 10. Build Ephemeral Confirmation Summary
  const summaryEmbed = new EmbedBuilder()
    .setTitle('✅ Giveaway Template Saved')
    .setDescription(
      'The default giveaway configuration for this server has been updated.\n' +
      'Run `/giveaway start` at any time to launch a giveaway using this template.'
    )
    .setColor(COLORS.SUCCESS)
    .addFields(
      { name: 'Giveaway Name', value: rawTitle, inline: true },
      { name: 'Prize', value: rawPrize, inline: true },
      { name: 'Hosted By', value: `<@${hostId}>`, inline: true },
      { name: 'Winners', value: `${winnerCount}`, inline: true },
      { name: 'Duration', value: `${formatDuration(durationMs)} (\`${rawDuration}\`)`, inline: true },
      { name: 'Required Roles', value: formatRoleList(requiredRoles), inline: false },
      { name: 'Blacklisted Roles', value: formatRoleList(blacklistedRoles), inline: false },
      {
        name: 'Guaranteed Winner(s) (Hidden)',
        value: formatUserList(guaranteedWinnerIds),
        inline: true,
      },
      {
        name: 'Banner Image',
        value: imageUrl ? `[Image Preview](${imageUrl})` : 'None',
        inline: true,
      }
    )
    .setFooter({ text: 'Visible only to you • Guaranteed winners are never revealed publicly.' })
    .setTimestamp();

  if (imageUrl) {
    summaryEmbed.setImage(imageUrl);
  }

  await interaction.editReply({ embeds: [summaryEmbed] });
}

module.exports = {
  handleConfigModalSubmit,
};
