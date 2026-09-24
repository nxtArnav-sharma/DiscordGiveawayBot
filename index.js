/**
 * Discord Giveaway Bot Entry Point
 * 
 * Initializes the Discord Client with required intents, loads commands and events,
 * and starts the bot process.
 */

require('dotenv').config();
const { Client, Collection, GatewayIntentBits } = require('discord.js');
const fs = require('fs');
const path = require('path');

// Ensure token is present
const token = process.env.DISCORD_TOKEN;
if (!token) {
  console.error('❌ Error: DISCORD_TOKEN is missing in the .env file.');
  process.exit(1);
}

// Initialize Client with required intents
// Note: GuildMembers is a privileged intent and must be enabled in the Discord Developer Portal
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
  ],
});

client.commands = new Collection();

// ---------------------------------------------------------------------------
// 1. Load Commands
// ---------------------------------------------------------------------------
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter((file) => file.endsWith('.js'));

for (const file of commandFiles) {
  const filePath = path.join(commandsPath, file);
  const command = require(filePath);
  if ('data' in command && 'execute' in command) {
    client.commands.set(command.data.name, command);
    console.log(`[Command Loader] Loaded /${command.data.name}`);
  } else {
    console.warn(`[Command Loader] Warning: Command at ${filePath} is missing "data" or "execute".`);
  }
}

// ---------------------------------------------------------------------------
// 2. Load Events
// ---------------------------------------------------------------------------
const eventsPath = path.join(__dirname, 'events');
const eventFiles = fs.readdirSync(eventsPath).filter((file) => file.endsWith('.js'));

for (const file of eventFiles) {
  const filePath = path.join(eventsPath, file);
  const event = require(filePath);
  if (event.once) {
    client.once(event.name, (...args) => event.execute(...args));
  } else {
    client.on(event.name, (...args) => event.execute(...args));
  }
  console.log(`[Event Loader] Registered event: ${event.name}`);
}

// ---------------------------------------------------------------------------
// 3. Global Process Error Shields
// ---------------------------------------------------------------------------
process.on('unhandledRejection', (reason, promise) => {
  console.error('[Unhandled Rejection] at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('[Uncaught Exception]:', err);
});

// ---------------------------------------------------------------------------
// 4. Connect to Discord
// ---------------------------------------------------------------------------
client.login(token).catch((err) => {
  console.error('❌ Failed to login to Discord:', err);
  process.exit(1);
});
