import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  InteractionContextType,
  MessageFlags
} from 'discord.js';
import { getGuildSettings, updateGuildSettings } from '../utils/storage.js';
import { discordTimestamp, formatPermissionList, missingChannelPermissions } from '../utils/helpers.js';
import { buildWeeklyReport, nextReportSlot, resetActivity } from '../utils/stats.js';
import { t } from '../i18n.js';

const ephemeral = { flags: MessageFlags.Ephemeral };

export default {
  data: new SlashCommandBuilder()
    .setName('stats')
    .setDescription('Weekly server report for staff (members, messages, moderation).')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setContexts(InteractionContextType.Guild)
    .addSubcommand(sub =>
      sub
        .setName('setup')
        .setDescription('Sets the staff channel for the weekly report (every Monday 09:00 UTC).')
        .addChannelOption(opt =>
          opt.setName('channel').setDescription('Staff-only channel').addChannelTypes(ChannelType.GuildText).setRequired(true)
        )
    )
    .addSubcommand(sub => sub.setName('preview').setDescription('Shows the report so far (only to you, nothing is reset).'))
    .addSubcommand(sub => sub.setName('disable').setDescription('Stops the weekly report.')),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();
    const { guild } = interaction;

    if (subcommand === 'setup') {
      const channel = interaction.options.getChannel('channel');
      const missing = missingChannelPermissions(channel, ['ViewChannel', 'SendMessages', 'EmbedLinks']);
      if (missing.length) {
        return interaction.reply({ content: t(interaction.guildId, 'cmd.stats.iCanTPost', { channel, formatPermissionList: formatPermissionList(missing) }), ...ephemeral });
      }

      const isNew = !getGuildSettings(guild.id).statsChannelId;
      updateGuildSettings(guild.id, { statsChannelId: channel.id });
      // Start counting from now on first setup, so the first report covers a clean period.
      if (isNew) resetActivity(guild.id);

      return interaction.reply({
        content: t(interaction.guildId, 'cmd.stats.weeklyReportsWillBe', { channel, discordTimestamp: discordTimestamp(nextReportSlot(guild.id)) }),
        ...ephemeral
      });
    }

    if (subcommand === 'preview') {
      return interaction.reply({ embeds: [buildWeeklyReport(guild)], ...ephemeral });
    }

    if (subcommand === 'disable') {
      updateGuildSettings(guild.id, { statsChannelId: null });
      return interaction.reply({ content: t(interaction.guildId, 'cmd.stats.weeklyReportDisabled'), ...ephemeral });
    }
  }
};
