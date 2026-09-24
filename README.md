# 🎁 Production-Ready Discord Giveaway Bot

A feature-complete, production-grade Discord giveaway bot built with **Node.js** and **`discord.js` v14**. Fully backed by a persistent **SQLite** database with automatic timer reconciliation on restarts, interactive **Discord Modals**, role restrictions, hidden guaranteed-winner priority, and a dedicated **user whitelist security system**.

---

## ✨ Features

- **Slash Commands (`/giveaway`)**: Modern Discord slash command system using `SlashCommandBuilder` with subcommands (`config`, `start`, `end`, `reroll`).
- **Discord Modals**: Clean, native multi-field popup forms for configuring title, winner count, and duration.
- **Persistent SQLite Storage**: Full database persistence across bot restarts. Active giveaways, configurations, entry pools, and winner history survive downtime.
- **Crash & Restart Timer Reconciliation**: On startup, the scheduler inspects all active giveaways from SQLite. Any giveaways that expired while the bot was offline conclude immediately; active ones have their exact remaining duration restored without time drift.
- **Button-Based Entries (`🎉 Enter Giveaway`)**: Fast, modern Discord button components with instant ephemeral feedback and real-time live entry counter updates on the embed. Includes withdrawal/leave option.
- **Role Restrictions**:
  - **Required Roles**: Require users to hold at least one specific role to enter.
  - **Blacklisted Roles**: Bar users holding blacklisted roles from entering (blacklist always takes precedence).
  - **Live Draw-Time Re-validation**: Disqualifies entrants who left the server or lost eligible roles before the draw occurs.
- **Hidden Guaranteed Winner Priority**: Privately designate a user ID to win one of the slots *if and only if* they enter the giveaway. If they don't enter or leave the server, the slot falls back smoothly to normal random selection without revealing the feature publicly.
- **Fisher-Yates (Knuth) Winner Shuffle**: Cryptographically fair, unbiased random distribution algorithm for selecting winners.
- **Rerolls with History Tracking**: Reroll winners for ended giveaways while excluding previous winners by default (or optionally allowing repeat winners).
- **User Whitelist Protection**: Dedicated whitelist system configured with user ID `1031935053695037542` to restrict bot operations to authorized operators.

---

## 📁 Project Structure

```
Giveaway Bot/
├── commands/
│   └── giveaway.js             # /giveaway command (config, start, end, reroll)
├── config/
│   └── whitelist.js            # User ID whitelist configuration
├── database/
│   ├── db.js                   # SQLite connection & table schemas
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
│   ├── giveawayManager.js      # Giveaway conclusion, message updating, announcements
│   ├── parseDuration.js        # Duration string parser (e.g. 1d, 2h30m, 45m)
│   ├── permissions.js          # Whitelist & Manage Server permission validation
│   ├── roleHelper.js           # Role ID/mention parser and formatter
│   ├── scheduler.js            # In-memory timer manager & drift safety interval
│   └── selectWinners.js        # Shared winner selection logic
├── deploy-commands.js          # Slash command registration script (Guild / Global)
├── index.js                    # Application entry point
├── package.json
├── .env.example
└── README.md
```

---

## 📋 Prerequisites

- **Node.js** >= 18.0.0 (Supports Node 18, 20, 22, and 26+)
- A Discord Bot Application from the [Discord Developer Portal](https://discord.com/developers/applications)

---

## 🚀 Setup & Installation

### 1. Clone or Open the Workspace

Ensure your terminal is in the project root directory:
```bash
git clone https://github.com/nxtArnav-sharma/DiscordGiveawayBot.git
cd DiscordGiveawayBot
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure the Discord Developer Portal

1. Go to [Discord Developer Portal](https://discord.com/developers/applications) and select/create your application.
2. Under **General Information**, copy your **Application ID** (this is your `CLIENT_ID`).
3. Navigate to **Bot**:
   - Click **Reset Token** and copy your **Bot Token** (this is your `DISCORD_TOKEN`).
   - Under **Privileged Gateway Intents**, turn **ON** the **SERVER MEMBERS INTENT** (`GuildMembers`). *This is required for checking member roles and guild presence.*
4. Generate the Bot Invite URL under **OAuth2 -> URL Generator**:
   - **Scopes**: `bot`, `applications.commands`
   - **Bot Permissions**:
     - `Send Messages`
     - `Embed Links`
     - `Read Message History`
     - `Use Application Commands`
     - `Mention Everyone` (Optional, only if tagging winners with role mentions)
   - Open the generated URL in your browser to invite the bot to your Discord server.

### 4. Create Environment Variables

Copy `.env.example` to `.env`:
```bash
copy .env.example .env
```

Edit `.env` and fill in your values:
```env
DISCORD_TOKEN=your_bot_token_here
CLIENT_ID=your_application_client_id_here

# Multiple server IDs separated by commas for instant deployment
GUILD_IDS=1483166185620111363,123456789012345678

# Whitelist settings
WHITELISTED_USERS=1031935053695037542
REQUIRE_WHITELIST_ONLY=true
```

> **Tip:** Setting `GUILD_IDS` allows instant slash command registration across all your specified servers. To register commands globally for all servers in production, simply leave `GUILD_IDS` blank.

### 5. Deploy Slash Commands

Register the `/giveaway` command with Discord:
```bash
npm run deploy
```

### 6. Start the Bot

```bash
npm start
```

---

## 🎮 Command Usage Guide

All giveaway commands are grouped under `/giveaway`. Only users on the whitelist (or administrators if whitelist-only mode is disabled) can use these commands.

### 1. `/giveaway config`
Configures the default giveaway template for the server.

- **Options** (Slash command picker):
  - `hosted_by` *(User, optional)*: Discord user who hosts the giveaway (defaults to you).
  - `required_roles` *(String, optional)*: Role mentions or IDs required to enter (e.g. `@VIP, @Nitro Booster`).
  - `blacklisted_roles` *(String, optional)*: Role mentions or IDs barred from entering.
  - `guaranteed_winner` *(User, optional)*: Single user who always wins if entered (Hidden feature).
  - `guaranteed_winners` *(String, optional)*: Multiple comma-separated user mentions or IDs who always win if entered (e.g. `@User1, @User2`).
  - `image_url` *(String, optional)*: Direct web link (`http://` or `https://`) to an image/banner artwork to embed.
- **Modal Fields** (Pops up automatically):
  - `Prize / Title`: The prize name (e.g., `Discord Nitro 1 Month`).
  - `Number of Winners`: Number of winners to pick (e.g., `1`, `3`).
  - `Duration`: Human-readable duration (e.g., `1d`, `2h30m`, `45m`, `1d12h`, `1w`).
- Once submitted, saves to SQLite and sends an **ephemeral confirmation embed** visible only to you.

### 2. `/giveaway start`
Launches a giveaway using the server's saved template.

- **Options**:
  - `channel` *(Channel, optional)*: Target text channel to host the giveaway in (defaults to current channel).
  - `image_url` *(String, optional)*: Direct image URL to override the template banner for this specific giveaway.
- **Behavior**:
  - Posts the rich giveaway embed with big artwork banner, live relative countdown (`<t:TIMESTAMP:R>`), and formatted date.
  - Attaches the **🎉 Enter Giveaway** button.
  - Adds the giveaway record to SQLite and registers the timer with the reconciler.

### 3. `/giveaway end`
Manually ends an active giveaway early and immediately draws winners.

- **Options**:
  - `identifier` *(String, optional)*: Giveaway ID or Discord Message ID. If omitted and only 1 giveaway is active in the current channel, it automatically selects that one.
- **Behavior**:
  - Disables the button on the original message and updates the embed.
  - Selects winners using the shared winner selector.
  - Announces winners publicly in the channel tagging them.

### 4. `/giveaway reroll`
Rerolls new winners for an already-ended giveaway.

- **Options**:
  - `identifier` *(String, required)*: Giveaway ID or Message ID of the ended giveaway.
  - `winners` *(Integer, optional)*: Number of new winners to select (defaults to original count).
  - `allow_repeat_winners` *(Boolean, optional)*: Whether prior winners can be picked again (defaults to `False`).
- **Behavior**:
  - Excludes all previous winners from the candidate pool by default.
  - Posts a new `🔁 REROLL` announcement in the channel tagging the new winner(s).

---

## 🔒 Whitelist & Security Configuration

The bot contains a dedicated whitelist module at `config/whitelist.js`.
- Your user ID (`1031935053695037542`) is pre-configured as the primary authorized owner.
- You can add additional authorized user IDs either in `config/whitelist.js` or via the `WHITELISTED_USERS` variable in `.env` (comma-separated).
- If an unauthorized user attempts to execute `/giveaway`, the bot immediately rejects the command ephemerally.

---

## 🗄️ Database Architecture (SQLite)

The bot stores data in `./data/giveaways.db` using WAL mode for maximum reliability and concurrency.

| Table | Primary Key | Description |
| :--- | :--- | :--- |
| `guild_configs` | `guild_id` | Stores default giveaway template per Discord server. |
| `giveaways` | `id` (AUTOINCREMENT) | Tracks every active and completed giveaway with timestamps. |
| `giveaway_entries` | `id` (AUTOINCREMENT) | Records user entries. Has `UNIQUE(giveaway_id, user_id)`. |
| `giveaway_winners` | `id` (AUTOINCREMENT) | Audit log of all winners and rerolls. |

---

## 🛠️ Verification & Testing

To run the full suite of verification tests:
```bash
npm test
```

Or run individual tests:
```bash
node scratch/test-duration.js
node scratch/test-db.js
node scratch/test-winner-selection.js
```

