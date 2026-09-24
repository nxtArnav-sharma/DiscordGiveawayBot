/**
 * Test Winner Selection Logic
 */

const assert = require('assert');
const { selectWinners } = require('../utils/selectWinners');
const { giveawayRepository, entryRepository, winnerRepository } = require('../database/repositories');

console.log('--- Testing Winner Selection Logic ---');

// Create mock guild and members
function createMockClient(membersMap) {
  return {
    guilds: {
      async fetch(guildId) {
        return {
          id: guildId,
          name: 'Test Server',
          members: {
            async fetch(userId) {
              const data = membersMap[userId];
              if (!data) return null; // Member left guild
              return {
                id: userId,
                roles: {
                  cache: new Set(data.roles || []),
                },
              };
            },
          },
        };
      },
    },
  };
}

(async () => {
  // Test Scenario 1: Guaranteed winner enters and claims slot
  const gwId = 'guaranteed_winner_999';
  const normalUser1 = 'user_norm_1';
  const normalUser2 = 'user_norm_2';

  const gwGiveawayId = giveawayRepository.createGiveaway({
    guild_id: 'guild_mock',
    channel_id: 'chan_mock',
    message_id: `msg_mock_gw_${Date.now()}`,
    title: 'Guaranteed Winner Test',
    host_id: 'host_1',
    winner_count: 2,
    required_roles: [],
    blacklisted_roles: [],
    guaranteed_winner_ids: [gwId],
    end_timestamp: Date.now() + 10000,
  });

  entryRepository.addEntry(gwGiveawayId, gwId);
  entryRepository.addEntry(gwGiveawayId, normalUser1);
  entryRepository.addEntry(gwGiveawayId, normalUser2);

  const mockClient1 = createMockClient({
    [gwId]: { roles: [] },
    [normalUser1]: { roles: [] },
    [normalUser2]: { roles: [] },
  });

  const giveawayRecord1 = giveawayRepository.getGiveawayById(gwGiveawayId);
  const result1 = await selectWinners(mockClient1, giveawayRecord1);

  assert.strictEqual(result1.winners.length, 2);
  assert(result1.winners.includes(gwId), 'Guaranteed winner must be in winners list');
  assert.strictEqual(result1.guaranteedWinnerHonored, true);
  assert.strictEqual(result1.guaranteedWinnerFallback, false);
  console.log('✔ Scenario 1: Guaranteed winner entered and claimed slot');

  // Test Scenario 2: Guaranteed winner did NOT enter (fallback to random)
  const fallbackGwGiveawayId = giveawayRepository.createGiveaway({
    guild_id: 'guild_mock',
    channel_id: 'chan_mock',
    message_id: `msg_mock_fallback_${Date.now()}`,
    title: 'Guaranteed Winner Fallback Test',
    host_id: 'host_1',
    winner_count: 2,
    required_roles: [],
    blacklisted_roles: [],
    guaranteed_winner_ids: ['did_not_enter_user'],
    end_timestamp: Date.now() + 10000,
  });

  entryRepository.addEntry(fallbackGwGiveawayId, normalUser1);
  entryRepository.addEntry(fallbackGwGiveawayId, normalUser2);

  const giveawayRecord2 = giveawayRepository.getGiveawayById(fallbackGwGiveawayId);
  const result2 = await selectWinners(mockClient1, giveawayRecord2);

  assert.strictEqual(result2.winners.length, 2);
  assert.strictEqual(result2.guaranteedWinnerHonored, false);
  assert.strictEqual(result2.guaranteedWinnerFallback, true);
  console.log('✔ Scenario 2: Guaranteed winner did not enter, fell back to random');

  // Test Scenario 3: Role validation (blacklist & required roles & left server)
  const roleTestGiveawayId = giveawayRepository.createGiveaway({
    guild_id: 'guild_mock',
    channel_id: 'chan_mock',
    message_id: `msg_mock_roles_${Date.now()}`,
    title: 'Role Filtering Test',
    host_id: 'host_1',
    winner_count: 2,
    required_roles: ['role_vip'],
    blacklisted_roles: ['role_banned'],
    guaranteed_winner_ids: [],
    end_timestamp: Date.now() + 10000,
  });

  const validUser = 'user_vip';
  const blacklistedUser = 'user_banned';
  const unqualifiedUser = 'user_no_vip';
  const leftUser = 'user_left';

  entryRepository.addEntry(roleTestGiveawayId, validUser);
  entryRepository.addEntry(roleTestGiveawayId, blacklistedUser);
  entryRepository.addEntry(roleTestGiveawayId, unqualifiedUser);
  entryRepository.addEntry(roleTestGiveawayId, leftUser);

  const mockClient2 = createMockClient({
    [validUser]: { roles: ['role_vip'] },
    [blacklistedUser]: { roles: ['role_vip', 'role_banned'] }, // Has VIP but also banned -> should be disqualified
    [unqualifiedUser]: { roles: ['other_role'] },               // Lacks VIP -> should be disqualified
    // leftUser omitted from members map -> left guild
  });

  const giveawayRecord3 = giveawayRepository.getGiveawayById(roleTestGiveawayId);
  const result3 = await selectWinners(mockClient2, giveawayRecord3);

  assert.deepStrictEqual(result3.winners, [validUser]);
  assert.strictEqual(result3.totalEntries, 4);
  assert.strictEqual(result3.validEntries, 1);
  assert.strictEqual(result3.insufficientEntries, true);
  console.log('✔ Scenario 3: Role blacklists, requirements, and departed members filtered correctly');

  // Test Scenario 4: Reroll excluding previous winners
  const rerollGiveawayId = giveawayRepository.createGiveaway({
    guild_id: 'guild_mock',
    channel_id: 'chan_mock',
    message_id: `msg_mock_reroll_${Date.now()}`,
    title: 'Reroll Exclusion Test',
    host_id: 'host_1',
    winner_count: 1,
    required_roles: [],
    blacklisted_roles: [],
    guaranteed_winner_ids: [],
    end_timestamp: Date.now() + 10000,
  });

  const uA = 'candidate_A';
  const uB = 'candidate_B';
  entryRepository.addEntry(rerollGiveawayId, uA);
  entryRepository.addEntry(rerollGiveawayId, uB);

  const mockClient3 = createMockClient({
    [uA]: { roles: [] },
    [uB]: { roles: [] },
  });

  // Suppose uA already won originally
  winnerRepository.recordWinners(rerollGiveawayId, [uA], false);

  const giveawayRecord4 = giveawayRepository.getGiveawayById(rerollGiveawayId);
  const priorWinners = winnerRepository.getPreviousWinnerIds(rerollGiveawayId);

  const rerollResult = await selectWinners(mockClient3, giveawayRecord4, {
    winnerCount: 1,
    excludeUserIds: priorWinners,
    isReroll: true,
  });

  assert.deepStrictEqual(rerollResult.winners, [uB], 'Reroll must pick candidate B since candidate A already won');
  console.log('✔ Scenario 4: Reroll properly excludes prior winners');

  console.log('All Winner Selection tests passed!\n');
})();
