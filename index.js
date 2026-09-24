/**
 * Discord Giveaway Bot Entry Point
 * 
 * Initializes the Discord Client with required intents and resilient REST configuration,
 * registers network resilience listeners to survive host network outages,
 * loads commands and events, and initiates an auto-reconnecting gateway session.
 */

require('dotenv').config();
const { Client, Collection, GatewayIntentBits } = require('discord.js');
const fs = require('fs');
const path = require('path');
const { reconcileActiveGiveaways } = require('./utils/scheduler');

// Ensure token is present
const token = process.env.DISCORD_TOKEN;
if (!token) {
  console.error('❌ Error: DISCORD_TOKEN is missing in the .env file.');
  process.exit(1);
}

// Initialize Client with required intents and network resilience configuration
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
  ],
  rest: {
    retries: 5,
    timeout: 15000,
  },
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
// 3. Network Outage & Shard Health Monitoring
// ---------------------------------------------------------------------------
client.on('shardDisconnect', (event, id) => {
  console.warn(
    `[Network Monitor] Shard ${id} disconnected (code: ${event.code}). Host network connection may be down. Giveaways remain safely preserved in SQLite.`
  );
});

client.on('shardReconnecting', (id) => {
  console.log(`[Network Monitor] Shard ${id} attempting to reconnect to Discord Gateway...`);
});

client.on('shardResume', (id, replayedEvents) => {
  console.log(
    `[Network Monitor] Shard ${id} reconnected! (${replayedEvents} event(s) replayed). Reconciling active giveaways...`
  );
  reconcileActiveGiveaways(client);
});

client.on('shardError', (error, id) => {
  console.error(`[Network Monitor] Shard ${id} connection error:`, error.message);
});

client.on('error', (error) => {
  console.error('[Discord Client Error]:', error.message);
});

// ---------------------------------------------------------------------------
// 4. Global Process Error Shields
// ---------------------------------------------------------------------------
process.on('unhandledRejection', (reason, promise) => {
  console.error('[Unhandled Rejection] at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('[Uncaught Exception]:', err);
});

// ---------------------------------------------------------------------------
// 5. Connect to Discord with Network Outage Backoff
// ---------------------------------------------------------------------------
async function startBot() {
  let attempt = 1;
  let delay = 3000;

  while (true) {
    try {
      console.log(`[Startup] Connecting to Discord Gateway (attempt ${attempt})...`);
      await client.login(token);
      console.log('[Startup] Successfully connected to Discord Gateway.');
      break;
    } catch (err) {
      console.error(`[Startup] Connection attempt ${attempt} failed: ${err.message}`);
      console.log(`[Startup] Host network may be down or unreachable. Retrying in ${Math.round(delay / 1000)}s...`);
      await new Promise((resolve) => setTimeout(resolve, delay));
      attempt++;
      delay = Math.min(delay * 1.5, 30000);
    }
  }
}

startBot();
