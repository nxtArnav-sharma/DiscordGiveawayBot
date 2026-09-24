/**
 * Permission & Authorization Utilities
 * 
 * Enforces access control for giveaway management commands:
 * 1. Verifies the user is on the authorized whitelist (e.g., owner 1031935053695037542).
 * 2. Optionally validates Discord guild permissions (Manage Server / Giveaway Manager role).
 */

const { PermissionFlagsBits } = require('discord.js');
const { isUserWhitelisted } = require('../config/whitelist');

/**
 * Validates whether an interaction runner has permission to execute giveaway commands.
 * 
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 * @returns {{ authorized: boolean, reason?: string }}
 */
function checkGiveawayPermissions(interaction) {
  const userId = interaction.user.id;

  // 1. Strict Whitelist Check
  // As required: "only specific user-id of discord which are whitelisted can use the bot"
  const isWhitelisted = isUserWhitelisted(userId);

  // If strict whitelist mode is active (default: true)
  const strictWhitelist = process.env.REQUIRE_WHITELIST_ONLY !== 'false';
  if (strictWhitelist && !isWhitelisted) {
    return {
      authorized: false,
      reason: '⛔ **Access Denied**: You are not on the bot authorization whitelist. Only whitelisted users can operate this bot.',
    };
  }

  // If user is whitelisted, they are granted full superuser administrative access
  if (isWhitelisted) {
    return { authorized: true };
  }

  // 2. Guild Permission Fallback (if strict whitelist is toggled off)
  const member = interaction.member;
  if (!member) {
    return {
      authorized: false,
      reason: '⛔ **Access Denied**: Unable to resolve guild member details.',
    };
  }

  const hasManageGuild = member.permissions && member.permissions.has(PermissionFlagsBits.ManageGuild);
  const hasAdmin = member.permissions && member.permissions.has(PermissionFlagsBits.Administrator);

  if (hasManageGuild || hasAdmin) {
    return { authorized: true };
  }

  return {
    authorized: false,
    reason: '⛔ **Access Denied**: You require the **Manage Server** permission to execute giveaway management commands.',
  };
}

module.exports = {
  checkGiveawayPermissions,
};
