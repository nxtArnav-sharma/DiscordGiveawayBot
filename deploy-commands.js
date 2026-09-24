/**
 * Slash Command Registration Script
 * 
 * Registers the bot's application commands with Discord's API.
 * 
 * Multi-Guild Mode:
 *  - Supports multiple comma-separated guild IDs via GUILD_IDS or GUILD_ID in .env
 *    (e.g., GUILD_IDS=1483166185620111363,123456789012345678)
 *    Commands will be deployed instantly to each specified guild.
 * 
 * Global Mode:
 *  - If GUILD_IDS and GUILD_ID are empty or omitted, commands are deployed globally
 *    across all Discord servers where the bot is installed.
 * 
 * Usage:
 *  node deploy-commands.js
 */

require('dotenv').config();
const { REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.CLIENT_ID;

// Support either GUILD_IDS or GUILD_ID, comma-separated
const rawGuildInput = process.env.GUILD_IDS || process.env.GUILD_ID || '';
const targetGuildIds = rawGuildInput
  .split(',')
  .map((id) => id.trim())
  .filter(Boolean);

if (!token || !clientId) {
  console.error('❌ Error: Missing DISCORD_TOKEN or CLIENT_ID in .env file.');
  process.exit(1);
}

const commands = [];
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter((file) => file.endsWith('.js'));

for (const file of commandFiles) {
  const filePath = path.join(commandsPath, file);
  const command = require(filePath);
  if ('data' in command && 'execute' in command) {
    commands.push(command.data.toJSON());
  } else {
    console.warn(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
  }
}

const rest = new REST().setToken(token);

(async () => {
  try {
    console.log(`Started refreshing ${commands.length} application (/) commands...`);

    if (targetGuildIds.length > 0) {
      // ---------------------------------------------------------------------
      // MULTI-GUILD DEPLOYMENT (Instant per guild)
      // ---------------------------------------------------------------------
      console.log(`Found ${targetGuildIds.length} target guild(s): ${targetGuildIds.join(', ')}\n`);

      let successfulCount = 0;
      let failedGuilds = [];

      for (const guildId of targetGuildIds) {
        try {
          console.log(`Deploying to Guild ID: ${guildId}...`);
          const data = await rest.put(
            Routes.applicationGuildCommands(clientId, guildId),
            { body: commands }
          );
          console.log(`✅ Successfully reloaded ${data.length} commands in Guild: ${guildId}\n`);
          successfulCount++;
        } catch (error) {
          failedGuilds.push({ guildId, error });
          if (error.code === 50001) {
            console.error(`❌ Missing Access for Guild ID: ${guildId}`);
            console.error(`   The bot has not been invited to this server yet, or lacks "applications.commands" scope.`);
            console.error(`   👉 Invite bot to this server: https://discord.com/oauth2/authorize?client_id=${clientId}&permissions=2147700672&scope=bot%20applications.commands\n`);
          } else {
            console.error(`❌ Failed to deploy to Guild ${guildId}:`, error.message, '\n');
          }
        }
      }

      console.log('--------------------------------------------------------------------------------');
      console.log(`Deployment Summary: ${successfulCount}/${targetGuildIds.length} guild(s) updated successfully.`);
      if (failedGuilds.length > 0) {
        console.log(`Note: ${failedGuilds.length} guild(s) could not be updated. Ensure the bot is present in those servers.`);
      }
      console.log('--------------------------------------------------------------------------------\n');
    } else {
      // ---------------------------------------------------------------------
      // GLOBAL DEPLOYMENT (For all servers, takes up to 1h to propagate)
      // ---------------------------------------------------------------------
      console.log('No GUILD_IDS or GUILD_ID specified in .env.');
      console.log('Deploying globally across all Discord servers (may take up to 1 hour to propagate)...');
      const data = await rest.put(
        Routes.applicationCommands(clientId),
        { body: commands }
      );
      console.log(`✅ Successfully reloaded ${data.length} global application (/) commands.`);
    }
  } catch (error) {
    console.error('❌ Fatal error registering application commands:', error);
  }
})();
