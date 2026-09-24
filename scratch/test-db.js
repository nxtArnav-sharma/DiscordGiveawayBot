/**
 * Test Database & Repositories
 */

const assert = require('assert');
const {
  configRepository,
  giveawayRepository,
  entryRepository,
  winnerRepository,
} = require('../database/repositories');

console.log('--- Testing SQLite Database & Repositories ---');

const testGuildId = 'test_guild_123456';
const testHostId = 'test_user_host';

// 1. Test Config Save & Get
const configData = {
  title: 'Summer Community Celebration',
  prize: 'Nitro 1 Month',
  host_id: testHostId,
  winner_count: 2,
  duration_ms: 3600000,
  required_roles: ['role_1', 'role_2'],
  blacklisted_roles: ['role_banned'],
  guaranteed_winner_ids: ['1031935053695037542'],
  image_url: 'https://example.com/banner.png',
};

configRepository.saveConfig(testGuildId, configData);
const loadedConfig = configRepository.getConfig(testGuildId);

assert.strictEqual(loadedConfig.title, 'Summer Community Celebration');
assert.strictEqual(loadedConfig.prize, 'Nitro 1 Month');
assert.strictEqual(loadedConfig.winner_count, 2);
assert.strictEqual(loadedConfig.image_url, 'https://example.com/banner.png');
assert.deepStrictEqual(loadedConfig.required_roles, ['role_1', 'role_2']);
assert.deepStrictEqual(loadedConfig.blacklisted_roles, ['role_banned']);
assert.deepStrictEqual(loadedConfig.guaranteed_winner_ids, ['1031935053695037542']);
console.log('✔ Config save and retrieve with image_url passed');

// Overwrite test
const updatedConfigData = {
  ...configData,
  title: 'Nitro 1 Year',
  winner_count: 5,
  image_url: 'https://example.com/new_banner.png',
};
configRepository.saveConfig(testGuildId, updatedConfigData);
const reloadedConfig = configRepository.getConfig(testGuildId);
assert.strictEqual(reloadedConfig.title, 'Nitro 1 Year');
assert.strictEqual(reloadedConfig.winner_count, 5);
console.log('✔ Config full overwrite passed');

// 2. Test Giveaway Lifecycle
const messageId = `msg_${Date.now()}`;
const endTimestamp = Date.now() + 100000;

const giveawayId = giveawayRepository.createGiveaway({
  guild_id: testGuildId,
  channel_id: 'channel_101',
  message_id: messageId,
  title: reloadedConfig.title,
  host_id: reloadedConfig.host_id,
  winner_count: reloadedConfig.winner_count,
  required_roles: reloadedConfig.required_roles,
  blacklisted_roles: reloadedConfig.blacklisted_roles,
  guaranteed_winner_ids: reloadedConfig.guaranteed_winner_ids,
  end_timestamp: endTimestamp,
});

assert(giveawayId > 0, 'giveawayId must be positive integer');
console.log(`✔ Giveaway created with ID #${giveawayId}`);

const fetchedById = giveawayRepository.getGiveawayById(giveawayId);
assert.strictEqual(fetchedById.id, giveawayId);
assert.strictEqual(fetchedById.status, 'active');

const fetchedByMsg = giveawayRepository.getGiveawayByMessageId(messageId);
assert.strictEqual(fetchedByMsg.id, giveawayId);
console.log('✔ Giveaway retrieval by ID and message ID passed');

const activeChannel = giveawayRepository.getActiveGiveawaysByChannel('channel_101');
assert(activeChannel.some((g) => g.id === giveawayId));
console.log('✔ getActiveGiveawaysByChannel passed');

// 3. Test Entries & Constraints
const userA = 'user_111';
const userB = 'user_222';

const enterA1 = entryRepository.addEntry(giveawayId, userA);
assert.strictEqual(enterA1, true, 'First entry should succeed');

const enterA2 = entryRepository.addEntry(giveawayId, userA);
assert.strictEqual(enterA2, false, 'Duplicate entry should be rejected by UNIQUE constraint');

entryRepository.addEntry(giveawayId, userB);
assert.strictEqual(entryRepository.getEntryCount(giveawayId), 2);
assert.strictEqual(entryRepository.hasEntered(giveawayId, userA), true);
assert.strictEqual(entryRepository.hasEntered(giveawayId, 'non_entrant'), false);
console.log('✔ Entry insertion, uniqueness constraint, and count passed');

// Remove entry test (withdraw)
entryRepository.removeEntry(giveawayId, userB);
assert.strictEqual(entryRepository.getEntryCount(giveawayId), 1);
console.log('✔ Entry removal (leave/withdraw) passed');

// 4. Test Winners & History
winnerRepository.recordWinners(giveawayId, [userA], false);
const prevWinners = winnerRepository.getPreviousWinnerIds(giveawayId);
assert.deepStrictEqual(prevWinners, [userA]);
console.log('✔ Winner recording and history retrieval passed');

// 5. Status update test
giveawayRepository.updateGiveawayStatus(giveawayId, 'ended');
const endedGiveaway = giveawayRepository.getGiveawayById(giveawayId);
assert.strictEqual(endedGiveaway.status, 'ended');
console.log('✔ Giveaway status transition to "ended" passed');

console.log('All Database tests passed!\n');
