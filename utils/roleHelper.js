/**
 * Role Parsing and Formatting Helper
 * Parses role IDs/mentions from command options and formats them for display.
 */

/**
 * Extracts and validates Discord role IDs from a string of mentions/IDs.
 * 
 * @param {string} input - Comma or whitespace separated role IDs or mentions (<@&123456789>)
 * @param {import('discord.js').Guild} guild - The Discord guild to validate against
 * @returns {{ validRoleIds: string[], invalidTokens: string[] }}
 */
function parseAndValidateRoles(input, guild) {
  if (!input || typeof input !== 'string') {
    return { validRoleIds: [], invalidTokens: [] };
  }

  // Match role mentions (<@&ID>) or plain snowflake digits (17-20 digits)
  const tokens = input
    .split(/[\s,]+/)
    .map((t) => t.trim())
    .filter(Boolean);

  const validRoleIds = [];
  const invalidTokens = [];

  for (const token of tokens) {
    const mentionMatch = token.match(/^<@&(\d{17,20})>$/);
    const roleId = mentionMatch ? mentionMatch[1] : (/^\d{17,20}$/.test(token) ? token : null);

    if (roleId && guild.roles.cache.has(roleId)) {
      if (!validRoleIds.includes(roleId)) {
        validRoleIds.push(roleId);
      }
    } else {
      invalidTokens.push(token);
    }
  }

  return { validRoleIds, invalidTokens };
}

/**
 * Formats an array of role IDs into readable mentions for embeds.
 * @param {string[]} roleIds
 * @returns {string}
 */
function formatRoleList(roleIds) {
  if (!roleIds || roleIds.length === 0) return 'None';
  return roleIds.map((id) => `<@&${id}>`).join(', ');
}

module.exports = {
  parseAndValidateRoles,
  formatRoleList,
};
