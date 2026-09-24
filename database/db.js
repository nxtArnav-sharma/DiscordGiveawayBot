/**
 * SQLite Database Connection & Schema Setup
 * 
 * Supports both better-sqlite3 and Node's built-in node:sqlite (DatabaseSync)
 * with identical synchronous API, ensuring zero-configuration deployment across
 * different Node.js versions (including Node 22+ and Node 26+).
 */

const path = require('path');
const fs = require('fs');

// Ensure data directory exists
const DATA_DIR = path.resolve(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_PATH = path.join(DATA_DIR, 'giveaways.db');

let dbInstance;

try {
  // Attempt to load better-sqlite3 if available
  const BetterSqlite3 = require('better-sqlite3');
  dbInstance = new BetterSqlite3(DB_PATH);
  dbInstance.pragma('journal_mode = WAL');
  dbInstance.pragma('foreign_keys = ON');
} catch {
  // Fall back to Node.js native SQLite (built into Node 22+)
  const { DatabaseSync } = require('node:sqlite');
  dbInstance = new DatabaseSync(DB_PATH);
  dbInstance.exec('PRAGMA journal_mode = WAL;');
  dbInstance.exec('PRAGMA foreign_keys = ON;');
}

// Initialize tables and indexes
dbInstance.exec(`
  -- Guild Configuration Template (stores default settings per server)
  CREATE TABLE IF NOT EXISTS guild_configs (
    guild_id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    host_id TEXT NOT NULL,
    winner_count INTEGER NOT NULL DEFAULT 1,
    duration_ms INTEGER NOT NULL,
    required_roles TEXT NOT NULL DEFAULT '[]',
    blacklisted_roles TEXT NOT NULL DEFAULT '[]',
    guaranteed_winner_ids TEXT NOT NULL DEFAULT '[]',
    image_url TEXT DEFAULT NULL,
    updated_at INTEGER NOT NULL
  );

  -- Giveaways Table (active and ended giveaway records)
  CREATE TABLE IF NOT EXISTS giveaways (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    guild_id TEXT NOT NULL,
    channel_id TEXT NOT NULL,
    message_id TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    host_id TEXT NOT NULL,
    winner_count INTEGER NOT NULL DEFAULT 1,
    required_roles TEXT NOT NULL DEFAULT '[]',
    blacklisted_roles TEXT NOT NULL DEFAULT '[]',
    guaranteed_winner_ids TEXT NOT NULL DEFAULT '[]',
    image_url TEXT DEFAULT NULL,
    end_timestamp INTEGER NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('active', 'ended')) DEFAULT 'active',
    created_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_giveaways_status_end ON giveaways(status, end_timestamp);
  CREATE INDEX IF NOT EXISTS idx_giveaways_channel_status ON giveaways(channel_id, status);

  -- Entrant Pool
  CREATE TABLE IF NOT EXISTS giveaway_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    giveaway_id INTEGER NOT NULL,
    user_id TEXT NOT NULL,
    entered_at INTEGER NOT NULL,
    FOREIGN KEY (giveaway_id) REFERENCES giveaways(id) ON DELETE CASCADE,
    UNIQUE(giveaway_id, user_id)
  );

  CREATE INDEX IF NOT EXISTS idx_entries_giveaway_user ON giveaway_entries(giveaway_id, user_id);

  -- Winner History (tracks original winners and rerolls)
  CREATE TABLE IF NOT EXISTS giveaway_winners (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    giveaway_id INTEGER NOT NULL,
    user_id TEXT NOT NULL,
    is_reroll INTEGER NOT NULL DEFAULT 0,
    selected_at INTEGER NOT NULL,
    FOREIGN KEY (giveaway_id) REFERENCES giveaways(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_winners_giveaway ON giveaway_winners(giveaway_id);
`);

// Safe migration for existing databases to add image_url if not already present
try {
  dbInstance.exec('ALTER TABLE guild_configs ADD COLUMN image_url TEXT;');
} catch {
  // Column already exists
}

try {
  dbInstance.exec('ALTER TABLE giveaways ADD COLUMN image_url TEXT;');
} catch {
  // Column already exists
}

module.exports = dbInstance;
