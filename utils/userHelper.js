/**
 * User Parsing and Formatting Helper
 * Parses user IDs/mentions from command options and formats them for display.
 */

/**
 * Extracts and validates Discord user IDs from a string of mentions or snowflake IDs.
 * 
 * @param {string} input - Comma or whitespace separated user IDs or mentions (<@123456789> or <@!123456789>)
 * @param {import('discord.js').Guild} guild - The Discord guild to validate membership against
 * @returns {Promise<{ validUserIds: string[], invalidTokens: string[] }>}
 */
async function parseAndValidateUsers(input, guild) {
  if (!input || typeof input !== 'string') {
    return { validUserIds: [], invalidTokens: [] };
  }

  // Match user mentions (<@ID> or <@!ID>) or plain snowflake digits (17-20 digits)
  const tokens = input
    .split(/[\s,]+/)
    .map((t) => t.trim())
    .filter(Boolean);

  const validUserIds = [];
  const invalidTokens = [];

  for (const token of tokens) {
    const mentionMatch = token.match(/^<@!?(\d{17,20})>$/);
    const userId = mentionMatch ? mentionMatch[1] : (/^\d{17,20}$/.test(token) ? token : null);

    if (userId) {
      const member = await guild.members.fetch(userId).catch(() => null);
      if (member) {
        if (!validUserIds.includes(userId)) {
          validUserIds.push(userId);
        }
      } else {
        invalidTokens.push(token);
      }
    } else {
      invalidTokens.push(token);
    }
  }

  return { validUserIds, invalidTokens };
}

/**
 * Formats an array of user IDs into readable mentions for embeds.
 * @param {string[]} userIds
 * @returns {string}
 */
function formatUserList(userIds) {
  if (!userIds || userIds.length === 0) return 'None';
  return userIds.map((id) => `<@${id}>`).join(', ');
}

module.exports = {
  parseAndValidateUsers,
  formatUserList,
};
