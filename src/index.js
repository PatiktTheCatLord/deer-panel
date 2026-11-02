import 'dotenv/config';
import { Client, Collection, GatewayIntentBits, Partials } from 'discord.js';
import { loadCommands, loadModules } from './utils/loadModules.js';
import { flushActivity } from './utils/stats.js';

const token = process.env.DISCORD_TOKEN;

if (!token || token.trim() === '' || token.includes('YOUR_')) {
  console.log('\n======================================================');
  console.log('⚠️  ATTENTION: Discord Bot Token Not Found!');
  console.log('Please open .env and provide DISCORD_TOKEN and CLIENT_ID.');
  console.log('Check README.md for complete step-by-step instructions.');
  console.log('======================================================\n');
  process.exit(1);
}

// Initialize client
// NOTE: GuildMembers and MessageContent are privileged intents. Enable "Server Members Intent"
// and "Message Content Intent" in the Developer Portal (Bot tab), otherwise login fails.
// - GuildMembers: welcome messages, auto-role, join/leave log
// - GuildMessages + MessageContent: showcase images, deleted/edited message log
// - GuildModeration: ban / kick / timeout log (audit log entries)
// - GuildVoiceStates: voice time per member for /info and /top
// - GuildMessageReactions: ❤️ counts in the showcase
// - AutoModerationExecution: automatic warnings when AutoMod blocks a message
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.AutoModerationExecution
  ],
  // Lets member / message events fire for objects that were not cached (e.g. after a restart).
  partials: [Partials.GuildMember, Partials.Message, Partials.Channel, Partials.Reaction, Partials.User]
});

client.commands = new Collection();

// Load commands
for (const command of await loadCommands()) {
  client.commands.set(command.data.name, command);
  console.log(`[COMMAND] /${command.data.name} loaded.`);
}

// Load events
for (const { file, value: event } of await loadModules('events')) {
  if (!event?.name || !event.execute) {
    console.warn(`[WARN] File ${file} is missing 'name' or 'execute' export!`);
    continue;
  }

  if (event.once) {
    client.once(event.name, (...args) => event.execute(...args));
  } else {
    client.on(event.name, (...args) => event.execute(...args));
  }
  console.log(`[EVENT] ${event.name} listener registered.`);
}

// Process error handlers
process.on('unhandledRejection', error => {
  console.error('[ERROR - Unhandled Rejection]:', error);
});

process.on('uncaughtException', error => {
  console.error('[ERROR - Uncaught Exception]:', error);
});

// Close the gateway connection cleanly on Ctrl+C / service stop
async function shutdown(reason) {
  console.log(`\n[SHUTDOWN] ${reason} received, logging out...`);
  flushActivity();
  await client.destroy();
  process.exit(0);
}
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => shutdown(signal));
// Run by the desktop panel on Windows (no signals there): the panel asks over the IPC channel.
process.on('message', message => {
  if (message === 'shutdown') shutdown('Panel stop');
});

// Log in
client.login(token).catch(err => {
  console.error('❌ Failed to log in. Please verify your bot token:');
  console.error(err.message);
  if (err.message.includes('disallowed intents')) {
    console.error('➡️  Enable "Server Members Intent" and "Message Content Intent" in the Developer Portal → Bot → Privileged Gateway Intents.');
  }
  process.exit(1);
});
