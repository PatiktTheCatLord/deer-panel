import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  EmbedBuilder,
  InteractionContextType,
  MessageFlags
} from 'discord.js';
import { COLORS, WELCOME_CHANNEL_PERMISSIONS } from '../config.js';
import { getGuildSettings, updateGuildSettings } from '../utils/storage.js';
import { formatPermissionList, missingChannelPermissions } from '../utils/helpers.js';
import { buildWelcomeEmbed } from '../utils/members.js';
import { t } from '../i18n.js';

const PLACEHOLDERS = '`{user}` (mention), `{username}` (name), `{server}` (server name), `{count}` (member count)';

export default {
  data: new SlashCommandBuilder()
    .setName('welcome')
    .setDescription('Manages the community welcome message system.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setContexts(InteractionContextType.Guild)
    .addSubcommand(sub =>
      sub
        .setName('setup')
        .setDescription('Sets the welcome message channel and optional custom template.')
        .addChannelOption(opt =>
          opt
            .setName('channel')
            .setDescription('The text channel where welcome messages will be sent.')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true)
        )
        .addStringOption(opt =>
          opt
            .setName('message')
            .setDescription('Custom welcome message. Placeholders: {user}, {username}, {server}, {count}')
            .setMaxLength(1500)
            .setRequired(false)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('disable')
        .setDescription('Disables the welcome message system.')
    )
    .addSubcommand(sub =>
      sub
        .setName('status')
        .setDescription('Displays the current welcome system configuration.')
    )
    .addSubcommand(sub =>
      sub
        .setName('test')
        .setDescription('Sends a sample test welcome card to the configured channel.')
    ),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();
    const guildId = interaction.guild.id;
    const settings = getGuildSettings(guildId);

    if (subcommand === 'setup') {
      const channel = interaction.options.getChannel('channel');
      const customMessage = interaction.options.getString('message');

      const missing = missingChannelPermissions(channel, WELCOME_CHANNEL_PERMISSIONS);
      if (missing.length) {
        return interaction.reply({
          content: t(interaction.guildId, 'cmd.welcome.iCanTPost', { channel, formatPermissionList: formatPermissionList(missing) }),
          flags: MessageFlags.Ephemeral
        });
      }

      updateGuildSettings(guildId, {
        welcomeChannelId: channel.id,
        welcomeMessage: customMessage || null
      });

      const embed = new EmbedBuilder()
        .setColor(COLORS.success)
        .setTitle(t(interaction.guildId, 'cmd.welcome.welcomeSystemConfigured'))
        .setDescription(t(interaction.guildId, 'cmd.welcome.newMembersWillBe', { channel }))
        .addFields(
          {
            name: 'Template',
            value: customMessage || t(interaction.guildId, 'cmd.welcome.theDefaultTemplateWill')
          },
          {
            name: t(interaction.guildId, 'cmd.welcome.availablePlaceholders'),
            value: PLACEHOLDERS
          }
        )
        .setFooter({ text: t(interaction.guildId, 'cmd.welcome.useWelcomeTestTo') });

      return interaction.reply({ embeds: [embed] });
    }

    if (subcommand === 'disable') {
      updateGuildSettings(guildId, {
        welcomeChannelId: null
      });

      return interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setColor(COLORS.danger)
            .setTitle(t(interaction.guildId, 'cmd.welcome.welcomeSystemDisabled'))
            .setDescription(t(interaction.guildId, 'cmd.welcome.welcomeMessagesWillNo'))
        ]
      });
    }

    if (subcommand === 'status') {
      const channel = settings.welcomeChannelId ? `<#${settings.welcomeChannelId}>` : t(interaction.guildId, 'cmd.welcome.notConfigured');
      const msg = settings.welcomeMessage ? `\`${settings.welcomeMessage}\`` : t(interaction.guildId, 'cmd.welcome.defaultTemplate');

      const embed = new EmbedBuilder()
        .setColor(COLORS.primary)
        .setTitle(t(interaction.guildId, 'cmd.welcome.welcomeSystemConfiguration'))
        .addFields(
          { name: 'Channel', value: channel, inline: true },
          { name: t(interaction.guildId, 'cmd.welcome.customMessage'), value: msg, inline: false }
        );

      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }

    if (subcommand === 'test') {
      if (!settings.welcomeChannelId) {
        return interaction.reply({
          content: t(interaction.guildId, 'cmd.welcome.noWelcomeChannelConfigured'),
          flags: MessageFlags.Ephemeral
        });
      }

      const channel = interaction.guild.channels.cache.get(settings.welcomeChannelId);
      if (!channel) {
        return interaction.reply({
          content: t(interaction.guildId, 'cmd.welcome.theConfiguredChannelCould'),
          flags: MessageFlags.Ephemeral
        });
      }

      const missing = missingChannelPermissions(channel, WELCOME_CHANNEL_PERMISSIONS);
      if (missing.length) {
        return interaction.reply({
          content: t(interaction.guildId, 'cmd.welcome.iCanTPost2', { channel, formatPermissionList: formatPermissionList(missing) }),
          flags: MessageFlags.Ephemeral
        });
      }

      const welcomeEmbed = buildWelcomeEmbed(interaction.user, interaction.guild, settings.welcomeMessage, {
        title: t(interaction.guildId, 'cmd.welcome.welcomeToTheCommunity')
      });

      await channel.send({ embeds: [welcomeEmbed], allowedMentions: { parse: [] } });

      return interaction.reply({
        content: t(interaction.guildId, 'cmd.welcome.testWelcomeMessageSent', { channel }),
        flags: MessageFlags.Ephemeral
      });
    }
  }
};
