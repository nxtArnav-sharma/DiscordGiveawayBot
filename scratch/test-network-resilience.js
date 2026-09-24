/**
 * Test Network Resilience & Offline Tolerance
 */

const assert = require('assert');
const { isNetworkError, NetworkOfflineError, withNetworkRetry } = require('../utils/networkRetry');
const { endGiveaway } = require('../utils/giveawayManager');
const { giveawayRepository, entryRepository } = require('../database/repositories');

console.log('--- Testing Network Resilience & Offline Tolerance ---');

// 1. Test isNetworkError detection
const testNetworkErrors = [
  Object.assign(new Error('getaddrinfo ENOTFOUND discord.com'), { code: 'ENOTFOUND' }),
  Object.assign(new Error('read ECONNRESET'), { code: 'ECONNRESET' }),
  Object.assign(new Error('connect ETIMEDOUT'), { code: 'ETIMEDOUT' }),
  Object.assign(new Error('Fetch failed'), { name: 'FetchError' }),
  Object.assign(new Error('AbortError'), { name: 'AbortError' }),
  Object.assign(new Error('Internal Server Error'), { status: 500 }),
  Object.assign(new Error('Bad Gateway'), { status: 502 }),
  Object.assign(new Error('Service Unavailable'), { status: 503 }),
  new NetworkOfflineError('Client disconnected'),
];

for (const err of testNetworkErrors) {
  assert.strictEqual(isNetworkError(err), true, `Failed to recognize ${err.message} as network error`);
  console.log(`✔ Correctly identified network error: ${err.message}`);
}

const nonNetworkErrors = [
  new Error('Validation failed'),
  Object.assign(new Error('Unknown Channel'), { status: 404, code: 10003 }),
  Object.assign(new Error('Missing Permissions'), { status: 403, code: 50013 }),
];

for (const err of nonNetworkErrors) {
  assert.strictEqual(isNetworkError(err), false, `Should not be network error: ${err.message}`);
  console.log(`✔ Correctly identified non-network error: ${err.message}`);
}

(async () => {
  // 2. Test withNetworkRetry with transient error that succeeds on attempt 2
  let attempts = 0;
  const retryResult = await withNetworkRetry(async () => {
    attempts++;
    if (attempts === 1) {
      const err = new Error('getaddrinfo ENOTFOUND');
      err.code = 'ENOTFOUND';
      throw err;
    }
    return 'recovered_data';
  }, { maxRetries: 3, initialDelayMs: 50 });

  assert.strictEqual(retryResult, 'recovered_data');
  assert.strictEqual(attempts, 2);
  console.log('✔ withNetworkRetry successfully recovered from transient network error');

  // 3. Test giveaway preservation when host network is offline
  const offlineGiveawayId = giveawayRepository.createGiveaway({
    guild_id: 'guild_offline_test',
    channel_id: 'channel_offline_test',
    message_id: `msg_offline_${Date.now()}`,
    title: 'Offline Resilience Giveaway',
    prize: 'Discord Nitro Year',
    host_id: 'host_offline',
    winner_count: 1,
    required_roles: [],
    blacklisted_roles: [],
    guaranteed_winner_ids: [],
    end_timestamp: Date.now() - 1000, // already expired
  });

  entryRepository.addEntry(offlineGiveawayId, 'user_entrant_1');

  // Mock client that is offline (!isReady())
  const offlineClient = {
    isReady: () => false,
  };

  const offlineRecord = giveawayRepository.getGiveawayById(offlineGiveawayId);
  const endResult = await endGiveaway(offlineClient, offlineRecord);

  assert(endResult && endResult.deferred === true, 'End result should be deferred when client is offline');
  assert.strictEqual(endResult.reason, 'CLIENT_OFFLINE');

  // Crucial check: The giveaway in SQLite MUST still be 'active'!
  const postCheckRecord = giveawayRepository.getGiveawayById(offlineGiveawayId);
  assert.strictEqual(postCheckRecord.status, 'active', 'Giveaway status must remain active while host is offline');
  console.log('✔ Giveaway kept safe as "active" in SQLite when host is offline');

  // 4. Test recovery when host network comes back online
  let messageEdited = false;
  let announcementSent = false;

  const recoveredClient = {
    isReady: () => true,
    guilds: {
      async fetch() {
        return {
          id: 'guild_offline_test',
          name: 'Online Guild',
          members: {
            async fetch(userId) {
              return {
                id: userId,
                roles: { cache: new Set() },
              };
            },
          },
        };
      },
    },
    channels: {
      async fetch() {
        return {
          id: 'channel_offline_test',
          async send() {
            announcementSent = true;
          },
          messages: {
            async fetch() {
              return {
                id: 'msg_offline',
                async edit() {
                  messageEdited = true;
                },
              };
            },
          },
        };
      },
    },
  };

  const recoveredResult = await endGiveaway(recoveredClient, postCheckRecord);
  assert(recoveredResult && !recoveredResult.deferred, 'Conclusion should succeed once network is recovered');
  assert.strictEqual(recoveredResult.winners[0], 'user_entrant_1');
  assert.strictEqual(messageEdited, true, 'Original embed must be edited');
  assert.strictEqual(announcementSent, true, 'Winner announcement must be sent');

  const finalRecord = giveawayRepository.getGiveawayById(offlineGiveawayId);
  assert.strictEqual(finalRecord.status, 'ended', 'Giveaway should now be marked ended');
  console.log('✔ Giveaway concluded perfectly and marked ended once network restored');

  console.log('All Network Resilience tests passed!\n');
})();
