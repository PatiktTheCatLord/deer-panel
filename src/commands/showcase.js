import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  EmbedBuilder,
  InteractionContextType,
  MessageFlags
} from 'discord.js';
import { COLORS, SHOWCASE, SHOWCASE_CHANNEL_PERMISSIONS } from '../config.js';
import { getGuildSettings, updateGuildSettings } from '../utils/storage.js';
import { formatPermissionList, missingChannelPermissions } from '../utils/helpers.js';
import { roleAssignProblem } from '../utils/members.js';
import { nextPickSlot, runPetOfTheWeek } from '../utils/showcase.js';
import { showcaseWords } from '../utils/branding.js';
import { t } from '../i18n.js';

const ephemeral = { flags: MessageFlags.Ephemeral };
const timestamp = date => `<t:${Math.floor(date.getTime() / 1000)}:F> (<t:${Math.floor(date.getTime() / 1000)}:R>)`;

export default {
  data: new SlashCommandBuilder()
    .setName('showcase')
    .setDescription('Showcase channel and the weekly winner vote (staff).')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setContexts(InteractionContextType.Guild)
    .addSubcommand(sub =>
      sub
        .setName('setup')
        .setDescription('Sets the showcase channel and an optional winner role.')
        .addChannelOption(opt =>
          opt
            .setName('channel')
            .setDescription('Channel where members post their pictures and videos')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true)
        )
        .addRoleOption(opt => opt.setName('winner-role').setDescription('Role the weekly winner holds for a week'))
    )
    .addSubcommand(sub => sub.setName('disable').setDescription('Turns off the showcase and the weekly vote.'))
    .addSubcommand(sub => sub.setName('status').setDescription('Shows the showcase settings and the next vote.'))
    .addSubcommand(sub => sub.setName('pick').setDescription("Picks and announces this week's winner right now.")),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();
    const { guild } = interaction;
    const settings = getGuildSettings(guild.id);

    if (subcommand === 'setup') {
      const channel = interaction.options.getChannel('channel');
      const role = interaction.options.getRole('winner-role');

      const missing = missingChannelPermissions(channel, SHOWCASE_CHANNEL_PERMISSIONS);
      if (missing.length) {
        return interaction.reply({ content: t(interaction.guildId, 'cmd.showcase.iCanTRun', { channel, formatPermissionList: formatPermissionList(missing) }), ...ephemeral });
      }
      const problem = role ? roleAssignProblem(role, guild.members.me) : null;
      if (problem) {
        return interaction.reply({ content: t(interaction.guildId, 'cmd.showcase.canTBeUsed', { role, problem }), allowedMentions: { parse: [] }, ...ephemeral });
      }

      updateGuildSettings(guild.id, {
        showcaseChannelId: channel.id,
        showcaseRoleId: role?.id ?? null,
        // Only start counting from now, so an old slot doesn't fire right after setup.
        showcaseSince: settings.showcaseChannelId ? settings.showcaseSince : new Date().toISOString()
      });

      const embed = new EmbedBuilder()
        .setColor(COLORS.success)
        .setTitle(t(interaction.guildId, 'cmd.showcase.showcaseConfigured', { Item: showcaseWords(guild.id).Item }))
        .setDescription(
          t(interaction.guildId, 'cmd.showcase.everyPictureOrVideo', { channel, reaction: SHOWCASE.reaction, windowDays: SHOWCASE.windowDays, title: showcaseWords(guild.id).title })
        )
        .addFields(
          { name: t(interaction.guildId, 'cmd.showcase.nextVote'), value: timestamp(nextPickSlot(guild.id)) },
          { name: t(interaction.guildId, 'cmd.showcase.winnerRole'), value: role ? `${role}` : '`None`' }
        );

      return interaction.reply({ embeds: [embed], allowedMentions: { parse: [] } });
    }

    if (subcommand === 'disable') {
      updateGuildSettings(guild.id, { showcaseChannelId: null, showcaseSince: null });
      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(COLORS.danger)
            .setTitle(t(interaction.guildId, 'cmd.showcase.showcaseDisabled', { Item: showcaseWords(guild.id).Item }))
            .setDescription(t(interaction.guildId, 'cmd.showcase.noMoreReactionsAnd'))
        ]
      });
    }

    if (subcommand === 'status') {
      const embed = new EmbedBuilder()
        .setColor(COLORS.primary)
        .setTitle(t(interaction.guildId, 'cmd.showcase.showcaseStatus', { Item: showcaseWords(guild.id).Item }))
        .addFields(
          { name: 'Channel', value: settings.showcaseChannelId ? `<#${settings.showcaseChannelId}>` : t(interaction.guildId, 'cmd.showcase.notConfigured'), inline: true },
          { name: t(interaction.guildId, 'cmd.showcase.winnerRole2'), value: settings.showcaseRoleId ? `<@&${settings.showcaseRoleId}>` : '`None`', inline: true },
          { name: t(interaction.guildId, 'cmd.showcase.currentWinner'), value: settings.showcaseLastWinnerId ? `<@${settings.showcaseLastWinnerId}>` : t(interaction.guildId, 'cmd.showcase.noneYet'), inline: true },
          { name: t(interaction.guildId, 'cmd.showcase.nextVote2'), value: settings.showcaseChannelId ? timestamp(nextPickSlot(guild.id)) : '`—`' }
        );
      return interaction.reply({ embeds: [embed], ...ephemeral });
    }

    if (subcommand === 'pick') {
      if (!settings.showcaseChannelId) {
        return interaction.reply({ content: t(interaction.guildId, 'cmd.showcase.runShowcaseSetupFirst'), ...ephemeral });
      }
      await interaction.deferReply(ephemeral);
      const result = await runPetOfTheWeek(guild);
      return interaction.editReply({ content: result, allowedMentions: { parse: [] } });
    }
  }
};
