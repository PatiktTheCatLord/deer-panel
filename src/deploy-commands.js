import 'dotenv/config';
import { REST, Routes } from 'discord.js';
import { loadCommands } from './utils/loadModules.js';
import { listAddons, loadAddons } from './utils/addons.js';
import { COMMAND_MODE, commandEnabled, commandPayload } from './utils/modules.js';

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.CLIENT_ID;
const guildId = process.env.GUILD_ID?.trim();
const isPlaceholder = value => !value || value.includes('YOUR_');

// `npm run deploy -- --check` only builds the command payloads (no token needed).
const checkOnly = process.argv.includes('--check');

const commands = [];
const own = await loadCommands();
const addons = await loadAddons(own.map(command => command.data.name));
for (const command of [...own, ...addons.commands]) {
  commands.push(commandPayload(command));
  console.log(`[LOADED] Prepared /${command.data.name} command${command.addon ? ` (addon ${command.addon})` : ''}.`);
}
const broken = listAddons().filter(addon => addon.error);

if (checkOnly) {
  if (broken.length) {
    console.error(`\n❌ ${broken.length} addon(s) could not be loaded: ${broken.map(addon => `${addon.id} (${addon.error})`).join(', ')}`);
    process.exit(1);
  }
  console.log(`\n✅ ${commands.length} commands built successfully (check only, nothing was registered).`);
  process.exit(0);
}

if (isPlaceholder(token) || isPlaceholder(clientId)) {
  console.error('❌ ERROR: DISCORD_TOKEN and CLIENT_ID must be configured in your .env file!');
  process.exit(1);
}

const rest = new REST().setToken(token);

try {
  console.log(`\n⏳ Started refreshing ${commands.length} application (/) commands...`);

  // The bot does the same on every start (utils/modules.js → syncAllCommands); this is for registering by hand.
  if (COMMAND_MODE === 'global') {
    const data = await rest.put(Routes.applicationCommands(clientId), { body: commands });
    console.log(`✅ Registered ${data.length} global commands (every server the bot is in).`);
    // A server list left from per-server mode would show every command twice.
    if (!isPlaceholder(guildId)) {
      await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: [] });
      console.log(`🧹 Emptied the per-server list of ${guildId}.`);
    }
  } else {
    await rest.put(Routes.applicationCommands(clientId), { body: [] });
    console.log('🧹 Emptied the global list (COMMAND_MODE=server).');
    if (isPlaceholder(guildId)) {
      console.log('ℹ️ Per-server lists are registered by the bot itself when it starts or joins a server.');
    } else {
      // Commands of modules switched off on that server are left out.
      const enabled = commands.filter(command => commandEnabled(guildId, command.name));
      if (enabled.length < commands.length) console.log(`ℹ️ Left out (module off): ${commands.filter(command => !enabled.includes(command)).map(command => `/${command.name}`).join(', ')}`);
      const data = await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: enabled });
      console.log(`✅ Registered ${data.length} commands for server ${guildId}.`);
    }
  }
} catch (error) {
  console.error('❌ Error refreshing commands:', error);
  process.exit(1);
}
