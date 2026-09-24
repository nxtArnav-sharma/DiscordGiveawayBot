/**
 * Test Giveaway Embed Builder
 */

const assert = require('assert');
const { buildGiveawayEmbed } = require('../utils/embedBuilder');

console.log('--- Testing Giveaway Embed Builder ---');

const mockGiveaway = {
  id: 42,
  guild_id: 'guild_123',
  channel_id: 'chan_456',
  title: 'Weekly Community Milestone',
  prize: 'Grand Theft Auto V',
  host_id: '1031935053695037542',
  winner_count: 1,
  required_roles: [],
  blacklisted_roles: [],
  image_url: 'https://example.com/banner.png',
  end_timestamp: Date.now() + 3600000,
};

// 1. Test Active Embed
const activeEmbed = buildGiveawayEmbed(mockGiveaway, 0, 'active');
const activeJson = activeEmbed.toJSON();

assert.strictEqual(activeJson.title, '🎉 Weekly Community Milestone');
assert(activeJson.description.includes('🎁 **Prize:** Grand Theft Auto V'));
assert(activeJson.description.includes('👤 **Hosted By:** <@1031935053695037542>'));
assert(activeJson.description.includes('-----------------'));

// Check 3 inline fields
assert.strictEqual(activeJson.fields.length, 3);
assert.strictEqual(activeJson.fields[0].name, '🏆 Winners');
assert.strictEqual(activeJson.fields[0].value, '`1`');
assert.strictEqual(activeJson.fields[0].inline, true);

assert.strictEqual(activeJson.fields[1].name, '👥 Entries');
assert.strictEqual(activeJson.fields[1].value, '`0`');
assert.strictEqual(activeJson.fields[1].inline, true);

assert.strictEqual(activeJson.fields[2].name, '⏳ Ends In');
assert(activeJson.fields[2].value.startsWith('<t:'));
assert.strictEqual(activeJson.fields[2].inline, true);

assert.strictEqual(activeJson.image.url, 'https://example.com/banner.png');
assert.strictEqual(activeJson.footer.text, 'Ends at');
console.log('✔ Active clean embed layout and fields verified');

// 2. Test Ended Embed
const endedEmbed = buildGiveawayEmbed(mockGiveaway, 12, 'ended', ['1031935053695037542']);
const endedJson = endedEmbed.toJSON();

assert.strictEqual(endedJson.title, '🎉 Weekly Community Milestone (ENDED)');
assert(endedJson.description.includes('🎁 **Prize:** Grand Theft Auto V'));
assert(endedJson.description.includes('👤 **Hosted By:** <@1031935053695037542>'));
assert(endedJson.description.includes('🏆 **Winners:** <@1031935053695037542>'));
assert(endedJson.description.includes('-----------------'));

assert.strictEqual(endedJson.fields.length, 3);
assert.strictEqual(endedJson.fields[0].name, '🏆 Winners');
assert.strictEqual(endedJson.fields[0].value, '`1`');
assert.strictEqual(endedJson.fields[1].name, '👥 Entries');
assert.strictEqual(endedJson.fields[1].value, '`12`');
assert.strictEqual(endedJson.fields[2].name, '⏳ Ends In');

assert.strictEqual(endedJson.image.url, 'https://example.com/banner.png');
assert.strictEqual(endedJson.footer.text, 'Ended at');
console.log('✔ Ended clean embed layout and fields verified');

console.log('All Embed Builder tests passed!\n');
