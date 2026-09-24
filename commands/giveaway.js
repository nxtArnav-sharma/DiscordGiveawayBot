/**
 * /giveaway Slash Command
 * 
 * Provides unified subcommands for giveaway administration:
 *  - /giveaway config: opens modal to create/update guild giveaway template
 *  - /giveaway start: launches giveaway from template
 *  - /giveaway end: manually ends active giveaway
 *  - /giveaway reroll: selects new winners from ended giveaway pool
 */

const {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  ActionRowBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
} = require('discord.js');

const { checkGiveawayPermissions } = require('../utils/permissions');
const { setPendingConfig } = require('../interactions/modalCache');
const { configRepository, giveawayRepository } = require('../database/repositories');
const { scheduleGiveaway, cancelScheduledGiveaway } = require('../utils/scheduler');
const { endGiveaway, rerollGiveaway } = require('../utils/giveawayManager');
const { formatRoleList } = require('../utils/roleHelper');
const { formatDuration } = require('../utils/parseDuration');
const { buildGiveawayEmbed } = require('../utils/embedBuilder');
const { COLORS, COMPONENTS } = require('../utils/constants');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('giveaway')
    .setDescription('Manage server giveaways')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    // -----------------------------------------------------------------------
    // Subcommand: config
    // -----------------------------------------------------------------------
    .addSubcommand((subcommand) =>
      subcommand
        .setName('config')
        .setDescription('Configure the default giveaway template for this server')
        .addUserOption((option) =>
          option
            .setName('hosted_by')
            .setDescription('Discord user who hosts the giveaway (defaults to you)')
            .setRequired(false)
        )
        .addStringOption((option) =>
          option
            .setName('required_roles')
            .setDescription('Role mentions or IDs required to enter (e.g. @VIP, 123456789)')
            .setRequired(false)
        )
        .addStringOption((option) =>
          option
            .setName('blacklisted_roles')
            .setDescription('Role mentions or IDs barred from entering')
            .setRequired(false)
        )
        .addUserOption((option) =>
          option
            .setName('guaranteed_winner')
            .setDescription('Single user who always wins if entered (Hidden feature)')
            .setRequired(false)
        )
        .addStringOption((option) =>
          option
            .setName('guaranteed_winners')
            .setDescription('Multiple user mentions/IDs who always win if entered (comma-separated)')
            .setRequired(false)
        )
        .addStringOption((option) =>
          option
            .setName('image_url')
            .setDescription('Direct URL to an image banner for the giveaway embed (http/https)')
            .setRequired(false)
        )
    )
    // -----------------------------------------------------------------------
    // Subcommand: start
    // -----------------------------------------------------------------------
    .addSubcommand((subcommand) =>
      subcommand
        .setName('start')
        .setDescription('Start a giveaway using the configured template')
        .addChannelOption((option) =>
          option
            .setName('channel')
            .setDescription('Channel to post the giveaway in (defaults to current channel)')
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(false)
        )
        .addStringOption((option) =>
          option
            .setName('image_url')
            .setDescription('Direct image URL to override the template banner')
            .setRequired(false)
        )
    )
    // -----------------------------------------------------------------------
    // Subcommand: end
    // -----------------------------------------------------------------------
    .addSubcommand((subcommand) =>
      subcommand
        .setName('end')
        .setDescription('End an active giveaway early and announce winners')
        .addStringOption((option) =>
          option
            .setName('identifier')
            .setDescription('Giveaway ID or Message ID (optional if only 1 active in channel)')
            .setRequired(false)
        )
    )
    // -----------------------------------------------------------------------
    // Subcommand: reroll
    // -----------------------------------------------------------------------
    .addSubcommand((subcommand) =>
      subcommand
        .setName('reroll')
        .setDescription('Reroll new winner(s) for an already-ended giveaway')
        .addStringOption((option) =>
          option
            .setName('identifier')
            .setDescription('Giveaway ID or Message ID of the ended giveaway')
            .setRequired(true)
        )
        .addIntegerOption((option) =>
          option
            .setName('winners')
            .setDescription('Number of new winners to select (defaults to original count)')
            .setMinValue(1)
            .setRequired(false)
        )
        .addBooleanOption((option) =>
          option
            .setName('allow_repeat_winners')
            .setDescription('Allow previous winners to win again (default: False)')
            .setRequired(false)
        )
    ),

  /**
   * Main command execution router.
   * @param {import('discord.js').ChatInputCommandInteraction} interaction
   */
  async execute(interaction) {
    // 1. Permission and Whitelist Verification
    const permCheck = checkGiveawayPermissions(interaction);
    if (!permCheck.authorized) {
      return interaction.reply({
        content: permCheck.reason,
        flags: MessageFlags.Ephemeral,
      });
    }

    const subcommand = interaction.options.getSubcommand();

    try {
      // ---------------------------------------------------------------------
      // /giveaway config
      // ---------------------------------------------------------------------
      if (subcommand === 'config') {
        const hostedBy = interaction.options.getUser('hosted_by')?.id || interaction.user.id;
        const requiredRoles = interaction.options.getString('required_roles') || '';
        const blacklistedRoles = interaction.options.getString('blacklisted_roles') || '';
        const guaranteedWinnerSingle = interaction.options.getUser('guaranteed_winner')?.id || null;
        const guaranteedWinnersString = interaction.options.getString('guaranteed_winners')?.trim() || '';
        const imageUrl = interaction.options.getString('image_url')?.trim() || null;

        // Existing config for prefilling modal fields
        const existingConfig = configRepository.getConfig(interaction.guildId);

        // Store options in cache with session ID
        const sessionId = `${interaction.guildId}_${interaction.user.id}_${Date.now()}`;
        setPendingConfig(sessionId, {
          hostedBy,
          requiredRoles,
          blacklistedRoles,
          guaranteedWinnerSingle,
          guaranteedWinnersString,
          imageUrl: imageUrl !== null ? imageUrl : (existingConfig?.image_url || null),
        });

        // Build Discord Modal
        const modal = new ModalBuilder()
          .setCustomId(`${COMPONENTS.CONFIG_MODAL_PREFIX}${sessionId}`)
          .setTitle('Giveaway Configuration');

        const titleInput = new TextInputBuilder()
          .setCustomId('title')
          .setLabel('Giveaway Name')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('e.g. Summer Community Event / 1K Members Giveaway')
          .setMaxLength(256)
          .setRequired(true);

        if (existingConfig?.title) {
          titleInput.setValue(existingConfig.title);
        }

        const prizeInput = new TextInputBuilder()
          .setCustomId('prize')
          .setLabel('Prize')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('e.g. Discord Nitro 1 Month / $25 Steam Gift Card')
          .setMaxLength(256)
          .setRequired(true);

        if (existingConfig?.prize) {
          prizeInput.setValue(existingConfig.prize);
        }

        const winnersInput = new TextInputBuilder()
          .setCustomId('winners')
          .setLabel('Number of Winners')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('e.g. 1')
          .setMaxLength(3)
          .setRequired(true);

        if (existingConfig?.winner_count) {
          winnersInput.setValue(String(existingConfig.winner_count));
        }

        const durationInput = new TextInputBuilder()
          .setCustomId('duration')
          .setLabel('Duration (e.g. 1d, 2h30m, 45m)')
          .setStyle(TextInputStyle.Short)
          .setPlaceholder('e.g. 1d, 2h30m, 45m, 1d12h')
          .setMaxLength(32)
          .setRequired(true);

        if (existingConfig?.duration_ms) {
          durationInput.setValue(formatDuration(existingConfig.duration_ms));
        }

        modal.addComponents(
          new ActionRowBuilder().addComponents(titleInput),
          new ActionRowBuilder().addComponents(prizeInput),
          new ActionRowBuilder().addComponents(winnersInput),
          new ActionRowBuilder().addComponents(durationInput)
        );

        // Modals must be shown immediately as the initial response
        return await interaction.showModal(modal);
      }

      // ---------------------------------------------------------------------
      // /giveaway start
      // ---------------------------------------------------------------------
      if (subcommand === 'start') {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const config = configRepository.getConfig(interaction.guildId);
        if (!config) {
          return interaction.editReply({
            content: '❌ No giveaway template configured for this server yet. Please run `/giveaway config` first!',
          });
        }

        const targetChannel = interaction.options.getChannel('channel') || interaction.channel;

        // Verify bot permissions in the target channel
        const botMember = interaction.guild.members.me;
        const channelPerms = targetChannel.permissionsFor(botMember);
        if (!channelPerms.has(PermissionFlagsBits.SendMessages) || !channelPerms.has(PermissionFlagsBits.EmbedLinks)) {
          return interaction.editReply({
            content: `❌ The bot lacks permission to send messages and embed links in ${targetChannel}.`,
          });
        }

        const endTimestampMs = Date.now() + config.duration_ms;
        const overrideImageUrl = interaction.options.getString('image_url')?.trim() || null;
        const finalImageUrl = overrideImageUrl || config.image_url || null;

        const giveawayData = {
          guild_id: interaction.guildId,
          channel_id: targetChannel.id,
          title: config.title,
          prize: config.prize || config.title,
          host_id: config.host_id,
          winner_count: config.winner_count,
          required_roles: config.required_roles,
          blacklisted_roles: config.blacklisted_roles,
          guaranteed_winner_ids: config.guaranteed_winner_ids,
          image_url: finalImageUrl,
          end_timestamp: endTimestampMs,
        };

        // Build Public Giveaway Embed
        const giveawayEmbed = buildGiveawayEmbed(giveawayData, 0, 'active');

        // Build "Enter Giveaway" button
        const actionRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(COMPONENTS.ENTER_BUTTON_ID)
            .setLabel('Enter Giveaway')
            .setEmoji('🎉')
            .setStyle(ButtonStyle.Primary)
        );

        // Post message to target channel
        const giveawayMessage = await targetChannel.send({
          embeds: [giveawayEmbed],
          components: [actionRow],
        });

        // Save active giveaway in SQLite
        const giveawayId = giveawayRepository.createGiveaway({
          ...giveawayData,
          message_id: giveawayMessage.id,
        });

        // Update embed with real giveaway ID in footer
        giveawayData.id = giveawayId;
        const finalEmbed = buildGiveawayEmbed(giveawayData, 0, 'active');
        await giveawayMessage.edit({ embeds: [finalEmbed] });

        // Register timer with scheduler
        const createdRecord = giveawayRepository.getGiveawayById(giveawayId);
        scheduleGiveaway(interaction.client, createdRecord);

        return interaction.editReply({
          content: `✅ Giveaway started successfully in ${targetChannel}! [Jump to Giveaway](${giveawayMessage.url})`,
        });
      }

      // ---------------------------------------------------------------------
      // /giveaway end
      // ---------------------------------------------------------------------
      if (subcommand === 'end') {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const identifier = interaction.options.getString('identifier')?.trim();
        let targetGiveaway = null;

        if (identifier) {
          targetGiveaway = giveawayRepository.getGiveawayByIdentifier(identifier);
          if (!targetGiveaway || targetGiveaway.guild_id !== interaction.guildId) {
            return interaction.editReply({
              content: `❌ No giveaway found matching identifier \`${identifier}\` on this server.`,
            });
          }
          if (targetGiveaway.status !== 'active') {
            return interaction.editReply({
              content: `❌ Giveaway #${targetGiveaway.id} has already ended.`,
            });
          }
        } else {
          // Default to active giveaway in the current channel if unambiguous
          const channelActive = giveawayRepository.getActiveGiveawaysByChannel(interaction.channelId);

          if (channelActive.length === 0) {
            return interaction.editReply({
              content: '❌ There are no active giveaways currently running in this channel. Specify an `identifier` to end one in another channel.',
            });
          }

          if (channelActive.length > 1) {
            const list = channelActive
              .map((g) => `• ID **${g.id}** (Msg: \`${g.message_id}\`): **${g.title}** (Prize: **${g.prize || g.title}**)`)
              .join('\n');
            return interaction.editReply({
              content:
                '❌ Multiple active giveaways found in this channel. Please specify the `identifier` option:\n\n' + list,
            });
          }

          targetGiveaway = channelActive[0];
        }

        // Cancel pending scheduler timeout
        cancelScheduledGiveaway(targetGiveaway.id);

        // Execute shared winner selection and conclude giveaway
        const results = await endGiveaway(interaction.client, targetGiveaway, { endedBy: interaction.user.id });

        if (results?.deferred) {
          return interaction.editReply({
            content: `⏳ Host connection is currently interrupted. Giveaway #${targetGiveaway.id} conclusion is queued and will execute automatically the moment connection is re-established.`,
          });
        }

        return interaction.editReply({
          content: `✅ Giveaway #${targetGiveaway.id} ("${targetGiveaway.title}") has been ended.`,
        });
      }

      // ---------------------------------------------------------------------
      // /giveaway reroll
      // ---------------------------------------------------------------------
      if (subcommand === 'reroll') {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const identifier = interaction.options.getString('identifier', true).trim();
        const winnerCountOverride = interaction.options.getInteger('winners');
        const allowRepeat = interaction.options.getBoolean('allow_repeat_winners') || false;

        const targetGiveaway = giveawayRepository.getGiveawayByIdentifier(identifier);

        if (!targetGiveaway || targetGiveaway.guild_id !== interaction.guildId) {
          return interaction.editReply({
            content: `❌ No giveaway found matching identifier \`${identifier}\` on this server.`,
          });
        }

        if (targetGiveaway.status !== 'ended') {
          return interaction.editReply({
            content: `❌ Giveaway #${targetGiveaway.id} is still active. Only ended giveaways can be rerolled. Use \`/giveaway end\` first if you want to end it early.`,
          });
        }

        // Execute reroll with exclusion of prior winners unless allowRepeat is true
        const result = await rerollGiveaway(interaction.client, targetGiveaway, {
          winnerCount: winnerCountOverride,
          allowRepeatWinners: allowRepeat,
        });

        return interaction.editReply({
          content: `✅ Reroll executed for giveaway #${targetGiveaway.id}. ${
            result.winners.length > 0
              ? `New winner(s): ${result.winners.map((id) => `<@${id}>`).join(', ')}`
              : 'No new eligible winners found.'
          }`,
        });
      }
    } catch (err) {
      console.error('[Command /giveaway Error]:', err);
      const errorMsg = '❌ An unexpected error occurred while executing this command. Please try again.';

      if (interaction.deferred || interaction.replied) {
        return interaction.editReply({ content: errorMsg }).catch(() => null);
      }
      return interaction.reply({ content: errorMsg, flags: MessageFlags.Ephemeral }).catch(() => null);
    }
  },
};
