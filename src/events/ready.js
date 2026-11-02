import { ActivityType, Events } from 'discord.js';
import { startShowcaseScheduler } from '../utils/showcase.js';
import { startStatsScheduler } from '../utils/stats.js';
import { startVoiceSession } from '../utils/activity.js';
import { isCountedVoice } from './voiceStateUpdate.js';
import { startAdminApi } from '../admin/server.js';
import { brand, prepareGuild } from '../utils/branding.js';
import { syncAllCommands } from '../utils/modules.js';
import { startStreamScheduler } from '../utils/streams.js';

export default {
  name: Events.ClientReady,
  once: true,
  async execute(client) {
    console.log(`=======================================`);
    console.log(`🤖 Logged in successfully as: ${client.user.tag}`);
    console.log(`🏰 Guilds: ${client.guilds.cache.size}`);
    console.log(`👥 Cached Users: ${client.users.cache.size}`);
    console.log(`=======================================`);

    // Per-server settings that used to be fixed in the code (brand, channels and roles found by name).
    for (const guild of client.guilds.cache.values()) prepareGuild(guild);

    // Slash commands: global or per server (COMMAND_MODE), always matching the current code.
    await syncAllCommands(client)
      .then(summary => console.log(`[COMMANDS] Registered ${summary}.`))
      .catch(error => console.error('[COMMANDS] Could not register slash commands:', error.message));

    // One server: show its name; several: just the help hint.
    const [onlyGuild] = client.guilds.cache.size === 1 ? [...client.guilds.cache.values()] : [];
    client.user.setPresence({
      activities: [
        {
          name: onlyGuild ? `${brand(onlyGuild.id).name} | /help` : '/help',
          type: ActivityType.Watching
        }
      ],
      status: 'online'
    });

    // Members already in voice when the bot starts are counted from now on.
    for (const guild of client.guilds.cache.values()) {
      for (const state of guild.voiceStates.cache.values()) {
        if (isCountedVoice(state)) startVoiceSession(guild.id, state.id);
      }
    }

    startAdminApi(client);
    startShowcaseScheduler(client);
    startStatsScheduler(client);
    startStreamScheduler(client);
  }
};
