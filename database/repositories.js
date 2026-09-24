/**
 * Database Repositories
 * Encapsulated CRUD operations for configs, giveaways, entries, and winners.
 */

const db = require('./db');

/**
 * Helper to safely parse JSON arrays from DB text fields.
 */
function safeParseJson(jsonString, fallback = []) {
  if (!jsonString) return fallback;
  try {
    const parsed = JSON.parse(jsonString);
    return Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

// ---------------------------------------------------------------------------
// Guild Config Repository
// ---------------------------------------------------------------------------

const configRepository = {
  /**
   * Retrieve guild giveaway configuration template.
   * @param {string} guildId
   * @returns {object|null}
   */
  getConfig(guildId) {
    const stmt = db.prepare('SELECT * FROM guild_configs WHERE guild_id = ?');
    const row = stmt.get(guildId);
    if (!row) return null;

    return {
      guild_id: row.guild_id,
      title: row.title,
      prize: row.prize || row.title,
      host_id: row.host_id,
      winner_count: Number(row.winner_count),
      duration_ms: Number(row.duration_ms),
      required_roles: safeParseJson(row.required_roles),
      blacklisted_roles: safeParseJson(row.blacklisted_roles),
      guaranteed_winner_ids: safeParseJson(row.guaranteed_winner_ids),
      image_url: row.image_url || null,
      updated_at: Number(row.updated_at),
    };
  },

  /**
   * Save or fully overwrite guild configuration template.
   * @param {string} guildId
   * @param {object} config
   */
  saveConfig(guildId, config) {
    const stmt = db.prepare(`
      INSERT INTO guild_configs (
        guild_id, title, prize, host_id, winner_count, duration_ms,
        required_roles, blacklisted_roles, guaranteed_winner_ids, image_url, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(guild_id) DO UPDATE SET
        title = excluded.title,
        prize = excluded.prize,
        host_id = excluded.host_id,
        winner_count = excluded.winner_count,
        duration_ms = excluded.duration_ms,
        required_roles = excluded.required_roles,
        blacklisted_roles = excluded.blacklisted_roles,
        guaranteed_winner_ids = excluded.guaranteed_winner_ids,
        image_url = excluded.image_url,
        updated_at = excluded.updated_at
    `);

    stmt.run(
      guildId,
      config.title,
      config.prize || config.title,
      config.host_id,
      config.winner_count,
      config.duration_ms,
      JSON.stringify(config.required_roles || []),
      JSON.stringify(config.blacklisted_roles || []),
      JSON.stringify(config.guaranteed_winner_ids || []),
      config.image_url || null,
      Date.now()
    );
  },
};

// ---------------------------------------------------------------------------
// Giveaway Repository
// ---------------------------------------------------------------------------

function formatGiveawayRow(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    guild_id: row.guild_id,
    channel_id: row.channel_id,
    message_id: row.message_id,
    title: row.title,
    prize: row.prize || row.title,
    host_id: row.host_id,
    winner_count: Number(row.winner_count),
    required_roles: safeParseJson(row.required_roles),
    blacklisted_roles: safeParseJson(row.blacklisted_roles),
    guaranteed_winner_ids: safeParseJson(row.guaranteed_winner_ids),
    image_url: row.image_url || null,
    end_timestamp: Number(row.end_timestamp),
    status: row.status,
    created_at: Number(row.created_at),
  };
}

const giveawayRepository = {
  /**
   * Create a new giveaway record.
   * @param {object} data
   * @returns {number} The created giveaway ID
   */
  createGiveaway(data) {
    const stmt = db.prepare(`
      INSERT INTO giveaways (
        guild_id, channel_id, message_id, title, prize, host_id,
        winner_count, required_roles, blacklisted_roles,
        guaranteed_winner_ids, image_url, end_timestamp, status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)
    `);

    const result = stmt.run(
      data.guild_id,
      data.channel_id,
      data.message_id,
      data.title,
      data.prize || data.title,
      data.host_id,
      data.winner_count,
      JSON.stringify(data.required_roles || []),
      JSON.stringify(data.blacklisted_roles || []),
      JSON.stringify(data.guaranteed_winner_ids || []),
      data.image_url || null,
      data.end_timestamp,
      Date.now()
    );

    return Number(result.lastInsertRowid);
  },

  /**
   * Fetch giveaway by internal integer ID.
   * @param {number|string} id
   * @returns {object|null}
   */
  getGiveawayById(id) {
    const stmt = db.prepare('SELECT * FROM giveaways WHERE id = ?');
    const row = stmt.get(Number(id));
    return formatGiveawayRow(row);
  },

  /**
   * Fetch giveaway by Discord message ID.
   * @param {string} messageId
   * @returns {object|null}
   */
  getGiveawayByMessageId(messageId) {
    const stmt = db.prepare('SELECT * FROM giveaways WHERE message_id = ?');
    const row = stmt.get(String(messageId));
    return formatGiveawayRow(row);
  },

  /**
   * Fetch giveaway by either numeric ID or message ID.
   * @param {string|number} identifier
   * @returns {object|null}
   */
  getGiveawayByIdentifier(identifier) {
    if (!identifier) return null;
    const str = String(identifier).trim();
    // Try message ID first
    let row = db.prepare('SELECT * FROM giveaways WHERE message_id = ?').get(str);
    if (!row && /^\d+$/.test(str)) {
      row = db.prepare('SELECT * FROM giveaways WHERE id = ?').get(Number(str));
    }
    return formatGiveawayRow(row);
  },

  /**
   * Get active giveaways for a specific channel.
   * @param {string} channelId
   * @returns {object[]}
   */
  getActiveGiveawaysByChannel(channelId) {
    const stmt = db.prepare("SELECT * FROM giveaways WHERE channel_id = ? AND status = 'active' ORDER BY end_timestamp ASC");
    const rows = stmt.all(channelId);
    return rows.map(formatGiveawayRow);
  },

  /**
   * Get all currently active giveaways across all guilds (used by scheduler).
   * @returns {object[]}
   */
  getAllActiveGiveaways() {
    const stmt = db.prepare("SELECT * FROM giveaways WHERE status = 'active' ORDER BY end_timestamp ASC");
    const rows = stmt.all();
    return rows.map(formatGiveawayRow);
  },

  /**
   * Update the status of a giveaway.
   * @param {number} id
   * @param {'active'|'ended'} status
   */
  updateGiveawayStatus(id, status) {
    const stmt = db.prepare('UPDATE giveaways SET status = ? WHERE id = ?');
    stmt.run(status, Number(id));
  },
};

// ---------------------------------------------------------------------------
// Entry Repository
// ---------------------------------------------------------------------------

const entryRepository = {
  /**
   * Add a user entry to a giveaway.
   * @param {number} giveawayId
   * @param {string} userId
   * @returns {boolean} True if entered, false if already entered
   */
  addEntry(giveawayId, userId) {
    try {
      const stmt = db.prepare(`
        INSERT INTO giveaway_entries (giveaway_id, user_id, entered_at)
        VALUES (?, ?, ?)
      `);
      stmt.run(Number(giveawayId), String(userId), Date.now());
      return true;
    } catch (err) {
      if (err.message && err.message.includes('UNIQUE constraint failed')) {
        return false;
      }
      throw err;
    }
  },

  /**
   * Remove a user entry (toggle/leave support).
   * @param {number} giveawayId
   * @param {string} userId
   * @returns {boolean} True if removed
   */
  removeEntry(giveawayId, userId) {
    const stmt = db.prepare('DELETE FROM giveaway_entries WHERE giveaway_id = ? AND user_id = ?');
    const result = stmt.run(Number(giveawayId), String(userId));
    return result.changes > 0;
  },

  /**
   * Check if a user has entered a giveaway.
   * @param {number} giveawayId
   * @param {string} userId
   * @returns {boolean}
   */
  hasEntered(giveawayId, userId) {
    const stmt = db.prepare('SELECT 1 FROM giveaway_entries WHERE giveaway_id = ? AND user_id = ?');
    const row = stmt.get(Number(giveawayId), String(userId));
    return !!row;
  },

  /**
   * Get total entry count for a giveaway.
   * @param {number} giveawayId
   * @returns {number}
   */
  getEntryCount(giveawayId) {
    const stmt = db.prepare('SELECT COUNT(*) as count FROM giveaway_entries WHERE giveaway_id = ?');
    const row = stmt.get(Number(giveawayId));
    return row ? Number(row.count) : 0;
  },

  /**
   * Get all entries for a giveaway.
   * @param {number} giveawayId
   * @returns {{ user_id: string, entered_at: number }[]}
   */
  getEntries(giveawayId) {
    const stmt = db.prepare('SELECT user_id, entered_at FROM giveaway_entries WHERE giveaway_id = ?');
    return stmt.all(Number(giveawayId));
  },
};

// ---------------------------------------------------------------------------
// Winner Repository
// ---------------------------------------------------------------------------

const winnerRepository = {
  /**
   * Record winners in the database.
   * @param {number} giveawayId
   * @param {string[]} winnerUserIds
   * @param {boolean} isReroll
   */
  recordWinners(giveawayId, winnerUserIds, isReroll = false) {
    const stmt = db.prepare(`
      INSERT INTO giveaway_winners (giveaway_id, user_id, is_reroll, selected_at)
      VALUES (?, ?, ?, ?)
    `);

    const now = Date.now();
    for (const userId of winnerUserIds) {
      stmt.run(Number(giveawayId), String(userId), isReroll ? 1 : 0, now);
    }
  },

  /**
   * Get IDs of all previously recorded winners for a giveaway (to exclude on reroll).
   * @param {number} giveawayId
   * @returns {string[]}
   */
  getPreviousWinnerIds(giveawayId) {
    const stmt = db.prepare('SELECT DISTINCT user_id FROM giveaway_winners WHERE giveaway_id = ?');
    const rows = stmt.all(Number(giveawayId));
    return rows.map((r) => r.user_id);
  },

  /**
   * Get all winner records for a giveaway.
   * @param {number} giveawayId
   * @returns {object[]}
   */
  getWinners(giveawayId) {
    const stmt = db.prepare('SELECT * FROM giveaway_winners WHERE giveaway_id = ? ORDER BY selected_at ASC');
    return stmt.all(Number(giveawayId));
  },

  /**
   * Remove uncommitted winner records for a giveaway (used during retry recovery).
   * @param {number} giveawayId
   * @param {boolean} [isReroll=false]
   */
  clearWinners(giveawayId, isReroll = false) {
    const stmt = db.prepare('DELETE FROM giveaway_winners WHERE giveaway_id = ? AND is_reroll = ?');
    stmt.run(Number(giveawayId), isReroll ? 1 : 0);
  },
};

module.exports = {
  configRepository,
  giveawayRepository,
  entryRepository,
  winnerRepository,
};
