/**
 * Test Multiple Guaranteed Winners Logic
 */

const assert = require('assert');
const { selectWinners } = require('../utils/selectWinners');
const { giveawayRepository, entryRepository } = require('../database/repositories');

console.log('--- Testing Multiple Guaranteed Winners Logic ---');

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
              if (!data) return null;
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
  const gw1 = 'guaranteed_1';
  const gw2 = 'guaranteed_2';
  const normal1 = 'normal_entrant_1';
  const normal2 = 'normal_entrant_2';
  const normal3 = 'normal_entrant_3';

  const mockClient = createMockClient({
    [gw1]: { roles: [] },
    [gw2]: { roles: [] },
    [normal1]: { roles: [] },
    [normal2]: { roles: [] },
    [normal3]: { roles: [] },
  });

  // -------------------------------------------------------------------------
  // Case A: 2 Winners Needed, 2 Guaranteed Winners, BOTH Entered
  // -------------------------------------------------------------------------
  const gwGiveawayA = giveawayRepository.createGiveaway({
    guild_id: 'guild_mock',
    channel_id: 'chan_mock',
    message_id: `msg_gw_both_${Date.now()}`,
    title: '2 Guaranteed Winners - Both Entered',
    host_id: 'host_1',
    winner_count: 2,
    required_roles: [],
    blacklisted_roles: [],
    guaranteed_winner_ids: [gw1, gw2],
    end_timestamp: Date.now() + 10000,
  });

  entryRepository.addEntry(gwGiveawayA, gw1);
  entryRepository.addEntry(gwGiveawayA, gw2);
  entryRepository.addEntry(gwGiveawayA, normal1);
  entryRepository.addEntry(gwGiveawayA, normal2);

  const recordA = giveawayRepository.getGiveawayById(gwGiveawayA);
  const resultA = await selectWinners(mockClient, recordA);

  assert.strictEqual(resultA.winners.length, 2);
  assert(resultA.winners.includes(gw1), 'Must contain gw1');
  assert(resultA.winners.includes(gw2), 'Must contain gw2');
  assert.strictEqual(resultA.guaranteedWinnerHonored, true);
  console.log('✔ Case A: Both guaranteed winners entered and claimed both winner slots');

  // -------------------------------------------------------------------------
  // Case B: 2 Winners Needed, 2 Guaranteed Winners, ONLY 1 Entered
  // -------------------------------------------------------------------------
  const gwGiveawayB = giveawayRepository.createGiveaway({
    guild_id: 'guild_mock',
    channel_id: 'chan_mock',
    message_id: `msg_gw_one_${Date.now()}`,
    title: '2 Guaranteed Winners - Only 1 Entered',
    host_id: 'host_1',
    winner_count: 2,
    required_roles: [],
    blacklisted_roles: [],
    guaranteed_winner_ids: [gw1, gw2],
    end_timestamp: Date.now() + 10000,
  });

  // Only gw1 enters; gw2 did NOT enter
  entryRepository.addEntry(gwGiveawayB, gw1);
  entryRepository.addEntry(gwGiveawayB, normal1);
  entryRepository.addEntry(gwGiveawayB, normal2);

  const recordB = giveawayRepository.getGiveawayById(gwGiveawayB);
  const resultB = await selectWinners(mockClient, recordB);

  assert.strictEqual(resultB.winners.length, 2);
  assert(resultB.winners.includes(gw1), 'gw1 entered so must win slot 1');
  assert(!resultB.winners.includes(gw2), 'gw2 did not enter so cannot win');
  assert(resultB.winners.includes(normal1) || resultB.winners.includes(normal2), 'Slot 2 filled by normal entrant');
  assert.strictEqual(resultB.guaranteedWinnerHonored, true);
  assert.strictEqual(resultB.guaranteedWinnerFallback, true);
  console.log('✔ Case B: 1 guaranteed winner claimed slot; second slot smoothly fell back to random entrant');

  // -------------------------------------------------------------------------
  // Case C: 2 Winners Needed, 2 Guaranteed Winners, NEITHER Entered
  // -------------------------------------------------------------------------
  const gwGiveawayC = giveawayRepository.createGiveaway({
    guild_id: 'guild_mock',
    channel_id: 'chan_mock',
    message_id: `msg_gw_none_${Date.now()}`,
    title: '2 Guaranteed Winners - Neither Entered',
    host_id: 'host_1',
    winner_count: 2,
    required_roles: [],
    blacklisted_roles: [],
    guaranteed_winner_ids: [gw1, gw2],
    end_timestamp: Date.now() + 10000,
  });

  // Neither gw1 nor gw2 entered
  entryRepository.addEntry(gwGiveawayC, normal1);
  entryRepository.addEntry(gwGiveawayC, normal2);
  entryRepository.addEntry(gwGiveawayC, normal3);

  const recordC = giveawayRepository.getGiveawayById(gwGiveawayC);
  const resultC = await selectWinners(mockClient, recordC);

  assert.strictEqual(resultC.winners.length, 2);
  assert(!resultC.winners.includes(gw1));
  assert(!resultC.winners.includes(gw2));
  assert.strictEqual(resultC.guaranteedWinnerHonored, false);
  assert.strictEqual(resultC.guaranteedWinnerFallback, true);
  console.log('✔ Case C: Neither guaranteed winner entered; both slots filled fairly via random shuffle');

  console.log('All Multiple Guaranteed Winner tests passed!\n');
})();
