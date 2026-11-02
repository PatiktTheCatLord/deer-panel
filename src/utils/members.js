import { EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { COLORS } from '../config.js';
import { fillTemplate } from './helpers.js';
import { brand } from './branding.js';
import { t, tn } from '../i18n.js';

export function buildWelcomeEmbed(user, guild, template, { title = t(guild.id, 'welcome.title') } = {}) {
  return new EmbedBuilder()
    .setColor(COLORS.primary)
    .setTitle(title)
    .setDescription(fillTemplate(template || t(guild.id, 'welcome.default'), { user, guild }))
    .setThumbnail(user.displayAvatarURL({ size: 256 }))
    .addFields(
      { name: t(guild.id, 'welcome.member'), value: user.tag, inline: true },
      { name: t(guild.id, 'welcome.total'), value: `${guild.memberCount}`, inline: true },
      { name: t(guild.id, 'welcome.created'), value: `<t:${Math.floor(user.createdTimestamp / 1000)}:R>`, inline: false }
    )
    .setTimestamp()
    .setFooter({ text: brand(guild.id).footer, iconURL: guild.iconURL() ?? undefined });
}

// Explains why the bot can't give out a role, or returns null when it can.
export function roleAssignProblem(role, botMember) {
  if (!botMember.permissions.has(PermissionFlagsBits.ManageRoles)) return t(role.guild.id, 'staff.members.theBotIsMissing');
  if (role.managed) return t(role.guild.id, 'staff.members.theRoleIsManaged');
  if (role.id === role.guild.id) return t(role.guild.id, 'staff.members.everyoneCannotBeAssigned');
  if (role.position >= botMember.roles.highest.position) return t(role.guild.id, 'staff.members.theRoleIsAbove');
  return null;
}

export async function assignAutoRole(member, autoRoleId) {
  const role = member.guild.roles.cache.get(autoRoleId);
  if (!role) {
    console.warn(`[AUTOROLE] Configured role ${autoRoleId} no longer exists in ${member.guild.name}.`);
    return;
  }
  if (member.roles.cache.has(role.id)) return;

  const problem = roleAssignProblem(role, member.guild.members.me);
  if (problem) {
    console.warn(`[AUTOROLE ERROR] Cannot assign "${role.name}": ${problem}.`);
    return;
  }

  try {
    await member.roles.add(role, 'Auto-role for new member');
    console.log(`[AUTOROLE] Assigned "${role.name}" role to ${member.user.tag}.`);
  } catch (error) {
    console.error(`[AUTOROLE ERROR] Failed to assign role to ${member.user.tag}:`, error);
  }
}
