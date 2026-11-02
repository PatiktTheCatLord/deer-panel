import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  InteractionContextType,
  MessageFlags
} from 'discord.js';
import { COLORS } from '../config.js';
import { getGuildSettings } from '../utils/storage.js';
import { discordTimestamp, truncate } from '../utils/helpers.js';
import { activeWarnings, addWarning, clearWarnings, removeWarning, warningPolicy } from '../utils/moderation.js';
import { brand } from '../utils/branding.js';
import { t } from '../i18n.js';

const ephemeral = { flags: MessageFlags.Ephemeral };

// Moderators can only act on members below them (the owner can act on everyone).
function hierarchyProblem(interaction, target) {
  if (!target) return null;
  if (target.id === interaction.user.id) return t(interaction.guildId, 'cmd.warn.youCanTWarn');
  if (target.user.bot) return t(interaction.guildId, 'cmd.warn.botsCanTBe');
  if (target.id === interaction.guild.ownerId) return t(interaction.guildId, 'cmd.warn.theServerOwnerCan');
  if (interaction.user.id !== interaction.guild.ownerId && target.roles.highest.position >= interaction.member.roles.highest.position) {
    return t(interaction.guildId, 'cmd.warn.youCanOnlyWarn');
  }
  return null;
}

export default {
  data: new SlashCommandBuilder()
    .setName('warn')
    .setDescription('Warning system; staff is alerted when a member has many warnings (staff).')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .setContexts(InteractionContextType.Guild)
    .addSubcommand(sub =>
      sub
        .setName('add')
        .setDescription('Warns a member (DM + mod log). Staff is alerted at the warning alert level.')
        .addUserOption(opt => opt.setName('user').setDescription('Member to warn').setRequired(true))
        .addStringOption(opt => opt.setName('reason').setDescription('Reason (sent to the member)').setRequired(true).setMaxLength(500))
    )
    .addSubcommand(sub =>
      sub
        .setName('list')
        .setDescription("Shows a member's warnings.")
        .addUserOption(opt => opt.setName('user').setDescription('Member').setRequired(true))
    )
    .addSubcommand(sub =>
      sub
        .setName('remove')
        .setDescription('Removes one warning.')
        .addUserOption(opt => opt.setName('user').setDescription('Member').setRequired(true))
        .addIntegerOption(opt => opt.setName('id').setDescription('Warning number from /warn list').setRequired(true).setMinValue(1))
    )
    .addSubcommand(sub =>
      sub
        .setName('clear')
        .setDescription('Removes all warnings of a member.')
        .addUserOption(opt => opt.setName('user').setDescription('Member').setRequired(true))
    ),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();
    const { guild } = interaction;
    const user = interaction.options.getUser('user');
    const userWarnings = getGuildSettings(guild.id).warnings[user.id] ?? [];
    const policy = warningPolicy(guild.id);

    if (subcommand === 'add') {
      const member = await guild.members.fetch(user.id).catch(() => null);
      if (!member) {
        return interaction.reply({ content: t(interaction.guildId, 'cmd.warn.thatUserIsNot'), ...ephemeral });
      }
      const problem = hierarchyProblem(interaction, member);
      if (problem) return interaction.reply({ content: t(interaction.guildId, 'cmd.warn.text', { problem }), ...ephemeral });

      const reason = interaction.options.getString('reason');
      const result = await addWarning(guild, member, reason, { moderatorId: interaction.user.id });

      const lines = [t(interaction.guildId, 'cmd.warn.wasWarnedActiveIn', { user, active: result.active, windowDays: policy.windowDays, alertThreshold: policy.alertThreshold })];
      if (!result.dmSent) lines.push(t(interaction.guildId, 'cmd.warn.couldNotDmThe'));
      if (result.alerted) lines.push(t(interaction.guildId, 'cmd.warn.alertLevelReachedThe'));

      return interaction.reply({ content: lines.join('\n'), allowedMentions: { parse: [] }, ...ephemeral });
    }

    if (subcommand === 'list') {
      const active = new Set(activeWarnings(userWarnings, policy.windowDays).map(warning => warning.id));
      const lines = userWarnings
        .slice(-15)
        .reverse()
        .map(warning =>
          t(interaction.guildId, 'cmd.warn.by', { value: active.has(warning.id) ? '🟡' : '⚪', id: warning.id, discordTimestamp: discordTimestamp(warning.createdAt, 'R'), moderatorId: warning.moderatorId, truncate: truncate(warning.reason, 200) })
        );

      const embed = new EmbedBuilder()
        .setColor(active.size >= policy.alertThreshold ? COLORS.danger : active.size ? COLORS.warning : COLORS.success)
        .setAuthor({ name: user.tag, iconURL: user.displayAvatarURL({ size: 128 }) })
        .setTitle(t(interaction.guildId, 'cmd.warn.warningsActiveTotal', { size: active.size, length: userWarnings.length }))
        .setDescription(lines.join('\n') || t(interaction.guildId, 'cmd.warn.noWarnings'))
        .setFooter({ text: t(interaction.guildId, 'cmd.warn.activeLastDaysExpired', { footer: brand(guild.id).footer, windowDays: policy.windowDays }) });

      return interaction.reply({ embeds: [embed], ...ephemeral });
    }

    if (subcommand === 'remove') {
      const id = interaction.options.getInteger('id');
      if (!removeWarning(guild.id, user.id, id)) {
        return interaction.reply({ content: t(interaction.guildId, 'cmd.warn.hasNoWarning', { user, id }), allowedMentions: { parse: [] }, ...ephemeral });
      }
      return interaction.reply({ content: t(interaction.guildId, 'cmd.warn.warningRemovedFrom', { id, user }), allowedMentions: { parse: [] }, ...ephemeral });
    }

    if (subcommand === 'clear') {
      const count = clearWarnings(guild.id, user.id);
      return interaction.reply({ content: t(interaction.guildId, 'cmd.warn.clearedWarningSOf', { count, user }), allowedMentions: { parse: [] }, ...ephemeral });
    }
  }
};
