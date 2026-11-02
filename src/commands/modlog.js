import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  EmbedBuilder,
  InteractionContextType,
  MessageFlags
} from 'discord.js';
import { COLORS, MOD_LOG_CHANNEL_PERMISSIONS } from '../config.js';
import { getGuildSettings, updateGuildSettings } from '../utils/storage.js';
import { formatPermissionList, missingChannelPermissions } from '../utils/helpers.js';
import { t } from '../i18n.js';

const LOGGED_EVENTS =
  '📥 Joins (new accounts flagged) • 📤 Leaves\n' +
  '🗑️ Deleted messages • ✏️ Edited messages\n' +
  '🔨 Bans / unbans • 👢 Kicks • 🔇 Timeouts (with moderator and reason)';

export default {
  data: new SlashCommandBuilder()
    .setName('modlog')
    .setDescription('Logs joins, leaves, deleted/edited messages and moderation actions (staff).')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setContexts(InteractionContextType.Guild)
    .addSubcommand(sub =>
      sub
        .setName('setup')
        .setDescription('Sets the private channel where logs are posted.')
        .addChannelOption(opt =>
          opt
            .setName('channel')
            .setDescription('Staff-only log channel')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true)
        )
    )
    .addSubcommand(sub => sub.setName('disable').setDescription('Stops logging.'))
    .addSubcommand(sub => sub.setName('status').setDescription('Shows the log channel and possible problems.')),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();
    const { guild } = interaction;

    if (subcommand === 'setup') {
      const channel = interaction.options.getChannel('channel');
      const missing = missingChannelPermissions(channel, MOD_LOG_CHANNEL_PERMISSIONS);
      if (missing.length) {
        return interaction.reply({
          content: t(interaction.guildId, 'cmd.modlog.iCanTPost', { channel, formatPermissionList: formatPermissionList(missing) }),
          flags: MessageFlags.Ephemeral
        });
      }

      updateGuildSettings(guild.id, { modLogChannelId: channel.id });

      const embed = new EmbedBuilder()
        .setColor(COLORS.success)
        .setTitle(t(interaction.guildId, 'cmd.modlog.modLogConfigured'))
        .setDescription(t(interaction.guildId, 'cmd.modlog.logsWillBePosted', { channel }))
        .addFields({ name: t(interaction.guildId, 'cmd.modlog.loggedEvents'), value: LOGGED_EVENTS });

      const warnings = [];
      if (!guild.members.me.permissions.has(PermissionFlagsBits.ViewAuditLog)) {
        warnings.push(t(interaction.guildId, 'cmd.modlog.theBotNeedsView'));
      }
      if (channel.permissionsFor(guild.roles.everyone)?.has(PermissionFlagsBits.ViewChannel)) {
        warnings.push(t(interaction.guildId, 'cmd.modlog.isVisibleToEveryone', { channel }));
      }
      if (warnings.length) embed.setColor(COLORS.warning).addFields({ name: t(interaction.guildId, 'cmd.modlog.check'), value: warnings.join('\n') });

      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }

    if (subcommand === 'disable') {
      updateGuildSettings(guild.id, { modLogChannelId: null });
      return interaction.reply({ content: t(interaction.guildId, 'cmd.modlog.modLogDisabled'), flags: MessageFlags.Ephemeral });
    }

    if (subcommand === 'status') {
      const { modLogChannelId } = getGuildSettings(guild.id);
      const channel = modLogChannelId ? guild.channels.cache.get(modLogChannelId) : null;
      const problems = [];
      if (modLogChannelId && !channel) problems.push(t(interaction.guildId, 'cmd.modlog.theLogChannelWas'));
      if (channel) {
        const missing = missingChannelPermissions(channel, MOD_LOG_CHANNEL_PERMISSIONS);
        if (missing.length) problems.push(t(interaction.guildId, 'cmd.modlog.missingIn', { channel, formatPermissionList: formatPermissionList(missing) }));
      }
      if (!guild.members.me.permissions.has(PermissionFlagsBits.ViewAuditLog)) {
        problems.push(t(interaction.guildId, 'cmd.modlog.missingViewAuditLog'));
      }

      const embed = new EmbedBuilder()
        .setColor(problems.length ? COLORS.warning : COLORS.primary)
        .setTitle(t(interaction.guildId, 'cmd.modlog.modLogStatus'))
        .addFields(
          { name: 'Channel', value: modLogChannelId ? `<#${modLogChannelId}>` : t(interaction.guildId, 'cmd.modlog.notConfigured') },
          { name: t(interaction.guildId, 'cmd.modlog.loggedEvents2'), value: LOGGED_EVENTS }
        );
      if (problems.length) embed.addFields({ name: t(interaction.guildId, 'cmd.modlog.problems'), value: problems.join('\n') });

      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }
  }
};
