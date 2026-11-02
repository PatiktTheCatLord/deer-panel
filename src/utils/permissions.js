import { PermissionFlagsBits } from 'discord.js';
import { getGuildSettings, updateGuildSettings } from './storage.js';
import { isOwner } from './owner.js';

// Who may use the bot's staff features (panel → Permissions). A rule gives a role or one member a set
// of features; a member gets their own rule plus the rules of their roles. A member rule marked `only`
// replaces everything else for that member (their roles' rules and their Discord permissions).
// - The server owner and the bot owners (OWNER_IDS) can always do everything.
// - trustDiscord (on by default): members with the Discord permission a command asks for
//   (e.g. Manage Server for /setup) may use it too, as before. Owner-only commands never count it.
// Commands that are not listed in a feature (/help, /faq, /top…) are for everyone.

export const FEATURES = {
  warn: { commands: ['warn'] },
  members: { commands: ['info', 'note'] },
  roles: { commands: ['roles'] },
  faq: { commands: ['faq-manage'] },
  showcase: { commands: ['showcase'] },
  setup: { commands: ['setup', 'welcome', 'autorole', 'verify', 'modlog', 'stats'] },
  backup: { commands: ['backup'] }
};
export const MAX_RULES = 50;

const FEATURE_BY_COMMAND = new Map(Object.entries(FEATURES).flatMap(([key, feature]) => feature.commands.map(name => [name, key])));
const ID = /^\d{17,20}$/;

export function featureOfCommand(commandName) {
  return FEATURE_BY_COMMAND.get(commandName) ?? null;
}

export function getPermissionSettings(guildId) {
  const stored = getGuildSettings(guildId).permissions ?? {};
  return { trustDiscord: stored.trustDiscord !== false, rules: stored.rules ?? [] };
}

// Validates a whole permission set from the panel and saves it; throws an Error with a readable message.
export function savePermissionSettings(guildId, input) {
  if (!input || typeof input !== 'object') throw new Error('Invalid permissions');
  const rules = Array.isArray(input.rules) ? input.rules : [];
  if (rules.length > MAX_RULES) throw new Error(`At most ${MAX_RULES} rules`);
  const seen = new Set();
  const clean = rules.map(rule => {
    if (rule?.type !== 'role' && rule?.type !== 'user') throw new Error('A rule is for a role or a member');
    if (!ID.test(rule.id ?? '')) throw new Error('Invalid role or member ID');
    const key = `${rule.type}:${rule.id}`;
    if (seen.has(key)) throw new Error('The same role or member is listed twice');
    seen.add(key);
    const features = [...new Set(rule.features ?? [])];
    for (const feature of features) if (!FEATURES[feature]) throw new Error(`Unknown feature: ${feature}`);
    return { type: rule.type, id: rule.id, features, ...(rule.type === 'user' && rule.only ? { only: true } : {}) };
  });
  const permissions = { trustDiscord: input.trustDiscord !== false, rules: clean };
  updateGuildSettings(guildId, { permissions });
  return permissions;
}

const isAllPowerful = member => member.guild.ownerId === member.id || isOwner({ user: member.user, guild: member.guild });

// The features a member has through rules, and whether a member rule replaces everything else.
export function memberFeatures(member) {
  const { rules } = getPermissionSettings(member.guild.id);
  const own = rules.find(rule => rule.type === 'user' && rule.id === member.id);
  if (own?.only) return { features: new Set(own.features), only: true };
  const features = new Set(own?.features ?? []);
  for (const rule of rules) if (rule.type === 'role' && member.roles.cache.has(rule.id)) for (const feature of rule.features) features.add(feature);
  return { features, only: false };
}

// Whether a member may use a feature. `discordPermission` is what the feature asks for in Discord
// (a bigint, or null when Discord permissions should not count).
export function hasFeature(member, feature, discordPermission = null) {
  if (!member?.guild) return false;
  if (isAllPowerful(member)) return true;
  const { features, only } = memberFeatures(member);
  if (features.has(feature)) return true;
  if (only || discordPermission == null) return false;
  return getPermissionSettings(member.guild.id).trustDiscord && member.permissions.has(discordPermission);
}

// Slash command check, done for every command in interactionCreate.
export function canUseCommand(interaction, command) {
  const feature = featureOfCommand(command.data.name);
  if (!feature) return true;
  const needed = command.ownerOnly ? null : COMMAND_PERMISSIONS.get(command.data.name) ?? null;
  return hasFeature(interaction.member, feature, needed);
}

// The Discord permission each staff command asked for in its definition, remembered before the
// command list may open it up (see openFeatures).
const COMMAND_PERMISSIONS = new Map();
export function rememberCommandPermissions(commands) {
  for (const command of commands) {
    const value = command.data.default_member_permissions;
    if (value != null && !COMMAND_PERMISSIONS.has(command.data.name)) COMMAND_PERMISSIONS.set(command.data.name, BigInt(value));
  }
}

// Features some rule hands out in these servers. Their commands are shown to everyone in Discord
// (Discord cannot show a command to chosen roles only); the bot then answers "no permission" to the rest.
export function openFeatures(guildIds) {
  const open = new Set();
  for (const guildId of guildIds) for (const rule of getPermissionSettings(guildId).rules) for (const feature of rule.features) open.add(feature);
  return open;
}
