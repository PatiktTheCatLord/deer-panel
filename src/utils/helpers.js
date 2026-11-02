import { PermissionFlagsBits } from 'discord.js';

// Replace {user}, {username}, {server} and {count} placeholders.
// A replacer function is used so `$` characters in names are never treated as regex tokens.
export function fillTemplate(template, { user, guild }) {
  const values = {
    user: user.toString(),
    username: user.username,
    server: guild.name,
    count: guild.memberCount.toString()
  };
  return template.replace(/\{(user|username|server|count)\}/g, (_, key) => values[key]);
}

// Returns the names of the permissions the bot is missing in a channel.
export function missingChannelPermissions(channel, permissionNames) {
  const me = channel.guild.members.me;
  const perms = channel.permissionsFor(me);
  return permissionNames.filter(name => !perms?.has(PermissionFlagsBits[name]));
}

export function formatPermissionList(permissionNames) {
  return permissionNames.map(name => `\`${name.replace(/([a-z])([A-Z])/g, '$1 $2')}\``).join(', ');
}

export function truncate(text, max) {
  if (!text) return text;
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

// The most recent weekly moment (e.g. Sunday 18:00 UTC) at or before `now`.
export function lastWeeklySlot(now, weekday, hourUtc) {
  const slot = new Date(now);
  slot.setUTCHours(hourUtc, 0, 0, 0);
  slot.setUTCDate(slot.getUTCDate() - ((slot.getUTCDay() - weekday + 7) % 7));
  if (slot > now) slot.setUTCDate(slot.getUTCDate() - 7);
  return slot;
}

export function discordTimestamp(date, style = 'F') {
  return `<t:${Math.floor(new Date(date).getTime() / 1000)}:${style}>`;
}

const cooldowns = new Map();

// Returns the remaining cooldown in ms (0 if the action is allowed) and starts a new cooldown when allowed.
export function consumeCooldown(key, durationMs) {
  const now = Date.now();
  const expiresAt = cooldowns.get(key) ?? 0;
  if (expiresAt > now) return expiresAt - now;
  cooldowns.set(key, now + durationMs);
  return 0;
}

export function resetCooldown(key) {
  cooldowns.delete(key);
}
