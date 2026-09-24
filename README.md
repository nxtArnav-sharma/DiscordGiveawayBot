# 🎁 Production-Ready Discord Giveaway Bot (v1.0 Self-Host)

A feature-complete, production-grade Discord giveaway bot built with **Node.js** and **`discord.js` v14**. Fully backed by a persistent **SQLite** database with automatic timer reconciliation on restarts, interactive **Discord Modals**, role restrictions, hidden guaranteed-winner priority, offline host network tolerance, and a dedicated **user whitelist security system**.

> **🚀 Latest Self-Host Update (v1.0):**
> - **Host Network Outage Resilience**: Even if the host machine's internet drops, disconnects, or restarts, active giveaways stay unaffected. Timer conclusions safely defer until network reconnects without data loss or premature conclusion.
> - **Separation of Giveaway Name & Prize**: Fixed the issue where Giveaway Name and Prize were treated as the same. They are now distinct fields across modals, embeds, database records, and announcements.
> - **WispByte Cloud Hosting Optimization**: Optimized out-of-the-box for **Node.js 22.0+** using native zero-dependency SQLite (`node:sqlite`). Zero native build tools (no `node-gyp`, Python, or C++ compilers) required on WispByte or containerized environments.

---

## ✨ Features

- **Slash Commands (`/giveaway`)**: Modern Discord slash command system using `SlashCommandBuilder` with subcommands (`config`, `start`, `end`, `reroll`).
- **Discord Modals with Distinct Name & Prize**: Clean popup forms with separate fields for **Giveaway Name** (e.g., `Summer Community Event`) and **Prize** (e.g., `Discord Nitro 1 Month`).
- **Network Offline Host Tolerance**:
  - The bot monitors Discord Gateway shards (`shardDisconnect`, `shardResume`, `shardReconnecting`).
  - If the host's internet goes down, conclusions are held safely in a deferred state.
  - The moment the host reconnects, the reconciliation engine immediately concludes any overdue giveaways and broadcasts announcements.
  - Automated startup connection backoff ensures the bot never crashes if launched before internet connects.
- **Persistent SQLite Storage**: Full database persistence across bot restarts. Active giveaways, configurations, entry pools, and winner history survive downtime.
- **Crash & Restart Timer Reconciliation**: On startup and gateway resume, the scheduler inspects all active giveaways from SQLite. Any giveaways that expired while the bot was offline conclude immediately; active ones have their exact remaining duration restored without time drift.
- **Button-Based Entries (`🎉 Enter Giveaway`)**: Fast, modern Discord button components with instant ephemeral feedback and real-time live entry counter updates on the embed. Includes withdrawal/leave option.
- **Role Restrictions**:
  - **Required Roles**: Require users to hold at least one specific role to enter.
  - **Blacklisted Roles**: Bar users holding blacklisted roles from entering (blacklist always takes precedence).
  - **Live Draw-Time Re-validation**: Disqualifies entrants who left the server or lost eligible roles before the draw occurs (with network-safe verification).
- **Hidden Guaranteed Winner Priority**: Privately designate user IDs to win slots *if and only if* they enter the giveaway. If they don't enter or leave the server, slots fall back smoothly to normal random selection without revealing the feature publicly.
- **Fisher-Yates (Knuth) Winner Shuffle**: Cryptographically fair, unbiased uniform random distribution algorithm for selecting winners.
- **Rerolls with History Tracking**: Reroll winners for ended giveaways while excluding previous winners by default (or optionally allowing repeat winners).
- **User Whitelist Protection**: Dedicated whitelist system configured with user ID `1031935053695037542` to restrict bot operations to authorized operators.

---

## 📁 Project Structure

```
DiscordGiveawayBot/
├── commands/
│   └── giveaway.js             # /giveaway command (config, start, end, reroll)
├── config/
│   └── whitelist.js            # User ID whitelist configuration
├── database/
│   ├── db.js                   # SQLite connection, table schemas & auto-migrations
│   └── repositories.js         # Prepared queries for configs, giveaways, entries, winners
├── events/
│   ├── ready.js                # Bot startup & scheduler reconciliation hook
│   └── interactionCreate.js    # Slash commands, modals, and button dispatcher
├── interactions/
│   ├── buttonHandler.js        # Entry button clicks, role checks, entry counter updates
│   ├── modalCache.js           # Session cache for modal command options
│   └── modalHandler.js         # Modal submission processing & config persistence
├── utils/
│   ├── constants.js            # Embed colors, component IDs, constraints
│   ├── embedBuilder.js         # Clean Discord embed builder (distinct Name & Prize)
│   ├── giveawayManager.js      # Resilient giveaway conclusion & winner announcements
│   ├── networkRetry.js         # Network outage detector & exponential backoff retries
│   ├── parseDuration.js        # Duration string parser (e.g. 1d, 2h30m, 45m)
│   ├── permissions.js          # Whitelist & Manage Server permission validation
│   ├── roleHelper.js           # Role ID/mention parser and formatter
│   ├── scheduler.js            # Timer manager, offline deferral, and gateway reconciler
│   ├── selectWinners.js        # Shared winner selection logic with network safety
│   └── userHelper.js           # User ID/mention parser
├── scratch/                    # Full automated verification test suite
│   ├── test-db.js
│   ├── test-duration.js
│   ├── test-embed.js
│   ├── test-multi-guaranteed.js
│   ├── test-network-resilience.js
│   └── test-winner-selection.js
├── deploy-commands.js          # Slash command registration script (Guild / Global)
├── index.js                    # Resilient application entry point with reconnect loop
├── package.json
├── .env.example
├── .gitignore
├── LICENSE
└── README.md
```

---

## 📋 Prerequisites

- **Node.js** >= 18.0.0 (Optimized for **Node 22+** and **Node 26+**)
- A Discord Bot Application from the [Discord Developer Portal](https://discord.com/developers/applications)

---

## 🚀 Setup & Installation (Self-Host)

### 1. Clone the Repository

```bash
git clone https://github.com/nxtArnav-sharma/DiscordGiveawayBot.git
cd DiscordGiveawayBot
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Discord Developer Portal

1. Go to [Discord Developer Portal](https://discord.com/developers/applications) and create/select your application.
2. Under **General Information**, copy your **Application ID** (`CLIENT_ID`).
3. Under **Bot**:
   - Click **Reset Token** and copy your **Bot Token** (`DISCORD_TOKEN`).
   - Under **Privileged Gateway Intents**, turn **ON** the **SERVER MEMBERS INTENT** (`GuildMembers`).
4. Generate the Bot Invite URL under **OAuth2 -> URL Generator**:
   - **Scopes**: `bot`, `applications.commands`
   - **Bot Permissions**:
     - `Send Messages`
     - `Embed Links`
     - `Read Message History`
     - `Use Application Commands`
   - Open the link to invite the bot to your Discord server.

### 4. Create Environment Variables

Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
*(On Windows PowerShell: `Copy-Item .env.example .env`)*

Edit `.env`:
```env
DISCORD_TOKEN=your_bot_token_here
CLIENT_ID=your_application_client_id_here

# Multiple server IDs separated by commas for instant deployment
GUILD_IDS=1483166185620111363,your_second_guild_id

# Whitelist settings
WHITELISTED_USERS=1031935053695037542
REQUIRE_WHITELIST_ONLY=true
```

### 5. Deploy Slash Commands

Register `/giveaway` with Discord:
```bash
npm run deploy
```

### 6. Start the Bot

```bash
npm start
```

---

## ☁️ WispByte Cloud Hosting (Optimized for Node 22.0)

Version 1.0 includes first-class optimizations specifically tailored for cloud server hosting on **WispByte** (and Pterodactyl-based container platforms):

### Why it's optimized for WispByte:
1. **Zero Native Build Tools**: Uses Node 22.0's native built-in `node:sqlite` engine (`DatabaseSync`). It installs cleanly with `npm install` without needing `node-gyp`, Python, make, or gcc/g++ compilers on the container.
2. **Ultra-Low Memory Footprint**: Idles at ~30MB to 45MB RAM, perfect for budget cloud plans.
3. **Automatic Crash & Network Self-Healing**: Shard reconnect listeners and auto-reconciliation guarantee that container restarts or network throttling never lose active giveaways.

### WispByte Setup Steps:
1. In your **WispByte Game / Bot Panel**, select the **Node.js** egg and choose **Node 22 LTS** (or Node 22.x).
2. Upload the repository files or link via Git repository clone.
3. In the **Environment Variables** / **Startup** tab:
   - Set `Startup Command`: `node index.js`
   - Set environment variables (`DISCORD_TOKEN`, `CLIENT_ID`, `GUILD_IDS`, etc.) or populate your `.env` file via the file manager.
4. Run `npm install` and deploy commands via the console with `node deploy-commands.js`.
5. Start the bot! Data is safely stored in `./data/giveaways.db`.

---

## 🎮 Command Usage Guide

All giveaway commands are grouped under `/giveaway`. Only authorized whitelist users (or administrators if configured) can execute these commands.

### 1. `/giveaway config`
Configures the default giveaway template for the server.

- **Options** (Slash command picker):
  - `hosted_by` *(User, optional)*: Discord user who hosts the giveaway (defaults to you).
  - `required_roles` *(String, optional)*: Role mentions or IDs required to enter (e.g. `@VIP, @Nitro Booster`).
  - `blacklisted_roles` *(String, optional)*: Role mentions or IDs barred from entering.
  - `guaranteed_winner` *(User, optional)*: Single user who always wins if entered (Hidden priority).
  - `guaranteed_winners` *(String, optional)*: Multiple comma-separated user mentions or IDs who always win if entered.
  - `image_url` *(String, optional)*: Direct web link (`http://` or `https://`) to an image/banner artwork to embed.
- **Modal Fields** (Pops up automatically with separate fields):
  - **Giveaway Name**: Title of the event (e.g., `Summer Community Event` or `1K Members Special`).
  - **Prize**: The exact reward (e.g., `Discord Nitro 1 Month` or `$50 Steam Gift Card`).
  - **Number of Winners**: Number of winners to pick (e.g., `1`, `3`).
  - **Duration**: Human-readable duration (e.g., `1d`, `2h30m`, `45m`, `1d12h`, `1w`).
- Once submitted, saves to SQLite and displays an **ephemeral confirmation embed** visible only to you.

### 2. `/giveaway start`
Launches a giveaway using the server's saved template.

- **Options**:
  - `channel` *(Channel, optional)*: Target text channel to host the giveaway in (defaults to current channel).
  - `image_url` *(String, optional)*: Direct image URL to override the template banner for this specific giveaway.
- **Behavior**:
  - Posts the rich giveaway embed displaying both the **Giveaway Name** and **Prize** distinctly.
  - Displays dynamic relative countdown (`<t:TIMESTAMP:R>`) and formatted date.
  - Attaches the **🎉 Enter Giveaway** button.
  - Registers the timer with the scheduler.

### 3. `/giveaway end`
Manually ends an active giveaway early and immediately draws winners.

- **Options**:
  - `identifier` *(String, optional)*: Giveaway ID or Discord Message ID. If omitted and only 1 giveaway is active in the current channel, it automatically selects that one.

### 4. `/giveaway reroll`
Rerolls new winners for an already-ended giveaway.

- **Options**:
  - `identifier` *(String, required)*: Giveaway ID or Message ID of the ended giveaway.
  - `winners` *(Integer, optional)*: Number of new winners to select (defaults to original count).
  - `allow_repeat_winners` *(Boolean, optional)*: Whether prior winners can be picked again (defaults to `False`).

---

## 🔒 Whitelist & Security Configuration

The bot contains a dedicated whitelist module at `config/whitelist.js`.
- Your user ID (`1031935053695037542`) is pre-configured as the primary authorized owner.
- Additional user IDs can be specified via `WHITELISTED_USERS` in `.env` (comma-separated).
- If an unauthorized user attempts to execute `/giveaway`, the bot rejects the command ephemerally.

---

## 🛠️ Verification & Testing

To run the complete automated test suite:
```bash
npm test
```

Or run individual tests:
```bash
node scratch/test-network-resilience.js
node scratch/test-duration.js
node scratch/test-db.js
node scratch/test-embed.js
node scratch/test-winner-selection.js
node scratch/test-multi-guaranteed.js
```

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).
