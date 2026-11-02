import { getGuildSettings, updateGuildSettings } from './storage.js';
import { featureOfCommand, openFeatures, rememberCommandPermissions } from './permissions.js';

// Features that can be switched on or off per server (panel → Settings → Modules).
// A module that is off: its slash commands are removed from that server, its buttons answer
// "turned off", and its events / schedulers do nothing there. Saved data is kept.
// Commands not listed here (help, ping, setup, serverinfo, info, backup) belong to the core.
export const MODULES = {
  welcome: { label: 'Welcome', description: 'Welcome message and auto-role for new members', commands: ['welcome', 'autorole'] },
  verification: { label: 'Verification', description: 'Verify button that unlocks the server', commands: ['verify'] },
  moderation: { label: 'Moderation', description: 'Warnings, private notes, AutoMod warnings and staff alerts', commands: ['warn', 'note', 'modlog'] },
  roles: { label: 'Role panel', description: 'Buttons to pick roles', commands: ['roles'] },
  showcase: { label: 'Showcase', description: 'Picture showcase with ❤️ and a weekly winner', commands: ['showcase'] },
  activity: { label: 'Activity', description: 'Message and voice counts, /top and leaderboards', commands: ['top'] },
  stats: { label: 'Weekly report', description: 'Weekly staff report', commands: ['stats'], requires: ['activity'] },
  faq: { label: 'FAQ', description: 'Frequently asked questions', commands: ['faq', 'faq-manage'] },
  streams: { label: 'Stream alerts', description: 'Announces when Kick, Twitch or YouTube channels go live', commands: [] }
};

const MODULE_BY_COMMAND = new Map(Object.entries(MODULES).flatMap(([key, module]) => module.commands.map(name => [name, key])));

export function moduleOfCommand(commandName) {
  return MODULE_BY_COMMAND.get(commandName) ?? null;
}

// Everything is on unless switched off.
export function isEnabled(guildId, key) {
  if (!guildId || !MODULES[key]) return true;
  return getGuildSettings(guildId).modules?.[key] !== false;
}

export function commandEnabled(guildId, commandName) {
  const key = moduleOfCommand(commandName);
  return !key || isEnabled(guildId, key);
}

export function getModules(guildId) {
  return Object.fromEntries(Object.keys(MODULES).map(key => [key, isEnabled(guildId, key)]));
}

// Validates and saves; throws an Error with a readable message (e.g. a module others depend on).
export function setModules(guildId, changes) {
  const next = { ...getModules(guildId) };
  for (const [key, value] of Object.entries(changes)) {
    if (!MODULES[key]) throw new Error(`Unknown module: ${key}`);
    if (typeof value !== 'boolean') throw new Error(`${key} must be true or false`);
    next[key] = value;
  }
  for (const [key, module] of Object.entries(MODULES)) {
    for (const needed of module.requires ?? []) {
      if (next[key] && !next[needed]) throw new Error(`${module.label} needs ${MODULES[needed].label}: turn ${MODULES[key].label} off first, or keep ${MODULES[needed].label} on`);
    }
  }
  updateGuildSettings(guildId, { modules: next });
  return next;
}

// How slash commands are registered (.env COMMAND_MODE):
// - "global" (default): one list for every server the bot is in; a module that is off still shows its
//   commands, they answer "turned off" (interaction check).
// - "server": each server gets its own list without the commands of modules that are off.
// The bot keeps the other kind empty, so switching modes never shows a command twice.
export const COMMAND_MODE = process.env.COMMAND_MODE?.trim().toLowerCase() === 'server' ? 'server' : 'global';
export const PER_SERVER_COMMANDS = COMMAND_MODE === 'server';

// Slash commands only work inside servers (guild install, guild context), also when registered globally.
// Staff commands whose feature a permission rule hands out are shown to everyone (`open`): Discord can't
// show a command to chosen roles, so the bot checks who may use it (utils/permissions.js).
export function commandPayload(command, open = new Set()) {
  const payload = { ...command.data.toJSON(), contexts: [0], integration_types: [0] };
  if (open.has(featureOfCommand(command.data.name))) payload.default_member_permissions = null;
  return payload;
}

// Registers only the enabled commands on this server (instant; replaces the server's command list).
export async function syncGuildCommands(guild) {
  rememberCommandPermissions(guild.client.commands.values());
  const open = openFeatures([guild.id]);
  const commands = [...guild.client.commands.values()].filter(command => commandEnabled(guild.id, command.data.name));
  await guild.commands.set(commands.map(command => commandPayload(command, open)));
  return commands.length;
}

// On startup: register the commands the way COMMAND_MODE says and empty the other kind.
// Returns a short summary for the log.
let openKey = null; // which staff features the registered lists show to everyone

export async function syncAllCommands(client) {
  const guilds = [...client.guilds.cache.values()];
  rememberCommandPermissions(client.commands.values());
  const open = openFeatures(guilds.map(guild => guild.id));
  openKey = [...open].sort().join(',');
  if (PER_SERVER_COMMANDS) {
    const global = await client.application.commands.fetch();
    if (global.size) await client.application.commands.set([]);
    const counts = [];
    for (const guild of guilds) counts.push(`${guild.name}: ${await syncGuildCommands(guild)}`);
    return `per server (${counts.join(', ') || 'no servers'})${global.size ? `, removed ${global.size} global` : ''}`;
  }
  const commands = [...client.commands.values()].map(command => commandPayload(command, open));
  await client.application.commands.set(commands);
  let cleared = 0;
  for (const guild of guilds) {
    const own = await guild.commands.fetch().catch(() => null);
    if (own?.size) {
      await guild.commands.set([]);
      cleared += 1;
    }
  }
  return `global: ${commands.length} commands${cleared ? `, removed the old per-server lists of ${cleared} server(s)` : ''}`;
}

// After the permission rules change: registers the command lists again only when a staff command
// has to become visible to everyone (or hidden again). Returns true when it did.
export async function refreshOpenCommands(client) {
  const key = [...openFeatures([...client.guilds.cache.keys()])].sort().join(',');
  if (key === openKey) return false;
  await syncAllCommands(client);
  return true;
}
