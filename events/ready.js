/**
 * Ready Event Handler
 * 
 * Invoked once the bot connects to Discord and completes its internal shard initialization.
 * Starts timer reconciliation for all active giveaways stored in SQLite.
 */

const { Events, ActivityType } = require('discord.js');
const { initScheduler } = require('../utils/scheduler');

module.exports = {
  name: Events.ClientReady,
  once: true,
  execute(client) {
    console.log(`[Bot Ready] Successfully connected as ${client.user.tag} (${client.user.id})`);

    // Set bot presence
    client.user.setPresence({
      activities: [{ name: '🎉 /giveaway start', type: ActivityType.Playing }],
      status: 'online',
    });

    // Reconcile and resume all active giveaway timers from SQLite
    initScheduler(client);
  },
};
