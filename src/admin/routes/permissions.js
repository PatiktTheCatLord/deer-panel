import { FEATURES, MAX_RULES, getPermissionSettings, savePermissionSettings } from '../../utils/permissions.js';
import { refreshOpenCommands } from '../../utils/modules.js';
import { HttpError, ownerId } from '../http.js';

// Permissions: which roles and members may use which staff features of the bot.

async function overview({ guild }) {
  const settings = getPermissionSettings(guild.id);
  // Members named in rules may not be cached yet.
  const userIds = settings.rules.filter(rule => rule.type === 'user' && !guild.members.cache.has(rule.id)).map(rule => rule.id);
  if (userIds.length) await guild.members.fetch({ user: userIds }).catch(() => {});
  const roles = [...guild.roles.cache.values()]
    .filter(role => role.id !== guild.id && !role.managed)
    .sort((a, b) => b.position - a.position)
    .map(role => ({ id: role.id, name: role.name, color: role.hexColor === '#000000' ? null : role.hexColor, members: role.members.size }));
  const describe = rule => {
    if (rule.type === 'role') {
      const role = guild.roles.cache.get(rule.id);
      return { ...rule, name: role?.name ?? null, color: role && role.hexColor !== '#000000' ? role.hexColor : null, missing: !role };
    }
    const member = guild.members.cache.get(rule.id);
    return { ...rule, name: member?.displayName ?? null, username: member?.user.username ?? null, avatar: member?.displayAvatarURL({ size: 64 }) ?? null, missing: !member };
  };
  const owner = guild.members.cache.get(guild.ownerId);
  const botOwner = ownerId(guild);
  return {
    trustDiscord: settings.trustDiscord,
    rules: settings.rules.map(describe),
    features: Object.entries(FEATURES).map(([key, feature]) => ({ key, commands: feature.commands })),
    roles,
    owner: { id: guild.ownerId, name: owner?.displayName ?? null },
    botOwner: botOwner !== guild.ownerId ? { id: botOwner, name: guild.members.cache.get(botOwner)?.displayName ?? null } : null,
    maxRules: MAX_RULES
  };
}

async function save({ guild, body, client }) {
  try {
    savePermissionSettings(guild.id, await body());
  } catch (error) {
    throw new HttpError(400, error.message);
  }
  console.log(`[ADMIN] Permissions changed from the panel (${getPermissionSettings(guild.id).rules.length} rules).`);
  // A command handed out to a role has to become visible in Discord.
  const refreshed = await refreshOpenCommands(client ?? guild.client).catch(error => {
    console.error('[PERMISSIONS] Command list update failed:', error.message);
    return false;
  });
  return { ...(await overview({ guild })), commandsUpdated: refreshed };
}

export default [
  ['GET', /^\/api\/permissions$/, overview],
  ['PUT', /^\/api\/permissions$/, save]
];
