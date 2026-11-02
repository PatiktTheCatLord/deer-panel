import { Events } from 'discord.js';
import { prepareGuild } from '../utils/branding.js';
import { PER_SERVER_COMMANDS, syncGuildCommands } from '../utils/modules.js';

// A new server: use its name as the brand and link the channels / roles that match by name.
export default {
  name: Events.GuildCreate,
  async execute(guild) {
    console.log(`[GUILD] Joined ${guild.name} (${guild.memberCount} members).`);
    prepareGuild(guild);
    if (PER_SERVER_COMMANDS) await syncGuildCommands(guild).catch(error => console.error(`[MODULES] Could not register commands in ${guild.name}:`, error.message));
  }
};
