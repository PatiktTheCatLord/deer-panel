import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  InteractionContextType,
  MessageFlags
} from 'discord.js';
import { COLORS } from '../config.js';
import { getGuildSettings, updateGuildSettings } from '../utils/storage.js';
import { roleAssignProblem } from '../utils/members.js';
import { t } from '../i18n.js';

export default {
  data: new SlashCommandBuilder()
    .setName('autorole')
    .setDescription('Automatically assigns a role to new members joining the server.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .setContexts(InteractionContextType.Guild)
    .addSubcommand(sub =>
      sub
        .setName('setup')
        .setDescription('Sets the role to automatically give to new members.')
        .addRoleOption(opt =>
          opt
            .setName('role')
            .setDescription('The role to assign to new members')
            .setRequired(true)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('disable')
        .setDescription('Disables the auto-role system.')
    )
    .addSubcommand(sub =>
      sub
        .setName('status')
        .setDescription('Shows the current auto-role configuration.')
    ),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();
    const guildId = interaction.guild.id;
    const settings = getGuildSettings(guildId);

    if (subcommand === 'setup') {
      const role = interaction.options.getRole('role');
      const botMember = interaction.guild.members.me;

      const problem = roleAssignProblem(role, botMember);
      if (problem) {
        const hint = problem.includes('above')
          ? t(interaction.guildId, 'cmd.autorole.moveTheBotS', { highest: botMember.roles.highest, role })
          : '';
        return interaction.reply({
          content: t(interaction.guildId, 'cmd.autorole.canTBeUsed', { role, problem, hint }),
          flags: MessageFlags.Ephemeral
        });
      }

      updateGuildSettings(guildId, {
        autoRoleId: role.id
      });

      const embed = new EmbedBuilder()
        .setColor(COLORS.success)
        .setTitle(t(interaction.guildId, 'cmd.autorole.autoRoleConfigured'))
        .setDescription(
          t(interaction.guildId, 'cmd.autorole.newMembersWillNow', { role })
        )
        .setFooter({ text: t(interaction.guildId, 'cmd.autorole.makeSureTheBot') });

      return interaction.reply({ embeds: [embed] });
    }

    if (subcommand === 'disable') {
      updateGuildSettings(guildId, {
        autoRoleId: null
      });

      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(COLORS.danger)
            .setTitle(t(interaction.guildId, 'cmd.autorole.autoRoleDisabled'))
            .setDescription(t(interaction.guildId, 'cmd.autorole.newMembersWillNo'))
        ]
      });
    }

    if (subcommand === 'status') {
      const role = settings.autoRoleId ? interaction.guild.roles.cache.get(settings.autoRoleId) : null;
      const roleText = settings.autoRoleId ? `<@&${settings.autoRoleId}>` : t(interaction.guildId, 'cmd.autorole.notConfigured');
      const problem = role ? roleAssignProblem(role, interaction.guild.members.me) : null;

      const embed = new EmbedBuilder()
        .setColor(problem || (settings.autoRoleId && !role) ? COLORS.warning : COLORS.primary)
        .setTitle(t(interaction.guildId, 'cmd.autorole.autoRoleStatus'))
        .addFields({ name: t(interaction.guildId, 'cmd.autorole.assignedRole'), value: roleText, inline: true });

      if (settings.autoRoleId && !role) {
        embed.addFields({ name: t(interaction.guildId, 'cmd.autorole.problem'), value: t(interaction.guildId, 'cmd.autorole.theConfiguredRoleNo') });
      } else if (problem) {
        embed.addFields({ name: t(interaction.guildId, 'cmd.autorole.problem2'), value: t(interaction.guildId, 'cmd.autorole.theRoleCanT', { problem }) });
      }

      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }
  }
};
