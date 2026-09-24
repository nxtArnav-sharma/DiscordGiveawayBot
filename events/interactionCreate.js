/**
 * InteractionCreate Event Handler
 * 
 * Central dispatcher for:
 *  - Slash commands (/giveaway)
 *  - Modal submissions (Giveaway configuration modal)
 *  - Button clicks (Enter / Leave giveaway)
 */

const { Events, MessageFlags } = require('discord.js');
const { handleConfigModalSubmit } = require('../interactions/modalHandler');
const { handleButtonInteraction } = require('../interactions/buttonHandler');
const { COMPONENTS } = require('../utils/constants');

module.exports = {
  name: Events.InteractionCreate,
  async execute(interaction) {
    try {
      // 1. Slash Commands
      if (interaction.isChatInputCommand()) {
        const command = interaction.client.commands.get(interaction.commandName);
        if (!command) {
          console.warn(`[Interaction] Command not found: ${interaction.commandName}`);
          return;
        }

        await command.execute(interaction);
        return;
      }

      // 2. Modal Submissions
      if (interaction.isModalSubmit()) {
        if (interaction.customId.startsWith(COMPONENTS.CONFIG_MODAL_PREFIX)) {
          await handleConfigModalSubmit(interaction);
          return;
        }
      }

      // 3. Button Interactions
      if (interaction.isButton()) {
        if (
          interaction.customId === COMPONENTS.ENTER_BUTTON_ID ||
          interaction.customId.startsWith(`${COMPONENTS.LEAVE_BUTTON_ID}:`)
        ) {
          await handleButtonInteraction(interaction);
          return;
        }
      }
    } catch (err) {
      console.error('[Interaction Handler Error]:', err);
      const errorMessage = '❌ Something went wrong while processing this action. Please try again.';

      try {
        if (interaction.deferred || interaction.replied) {
          await interaction.followUp({ content: errorMessage, flags: MessageFlags.Ephemeral });
        } else {
          await interaction.reply({ content: errorMessage, flags: MessageFlags.Ephemeral });
        }
      } catch (replyErr) {
        console.error('[Interaction Handler] Failed to send fallback error reply:', replyErr);
      }
    }
  },
};
