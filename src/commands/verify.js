import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  InteractionContextType,
  MessageFlags
} from 'discord.js';
import { COLORS } from '../config.js';
import { getGuildSettings, updateGuildSettings } from '../utils/storage.js';
import { formatPermissionList, missingChannelPermissions } from '../utils/helpers.js';
import { roleAssignProblem } from '../utils/members.js';
import { LOG_COLORS, sendModLog } from '../utils/modlog.js';
import { brand } from '../utils/branding.js';
import { t, tn } from '../i18n.js';

const ephemeral = { flags: MessageFlags.Ephemeral };
const DAY_MS = 24 * 60 * 60 * 1000;

export function buildPanel(guildId, title, description) {
  const embed = new EmbedBuilder()
    .setColor(COLORS.success)
    .setTitle(title || t(guildId, 'verify.panelTitle', { name: brand(guildId).name }))
    .setDescription(description || t(guildId, 'verify.panelText'))
    .setFooter({ text: brand(guildId).footer });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('verify:confirm').setLabel(t(guildId, 'verify.button')).setEmoji('✅').setStyle(ButtonStyle.Success)
  );

  return { embeds: [embed], components: [row] };
}

export default {
  data: new SlashCommandBuilder()
    .setName('verify')
    .setDescription('Verification button that unlocks the server (staff).')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setContexts(InteractionContextType.Guild)
    .addSubcommand(sub =>
      sub
        .setName('setup')
        .setDescription('Posts the verification panel.')
        .addRoleOption(opt => opt.setName('role').setDescription('Role given after verifying, e.g. @Verified').setRequired(true))
        .addChannelOption(opt =>
          opt
            .setName('channel')
            .setDescription('Where to post the panel, e.g. #rules')
            .addChannelTypes(ChannelType.GuildText)
            .setRequired(true)
        )
        .addIntegerOption(opt =>
          opt
            .setName('min-account-age')
            .setDescription('Minimum Discord account age in days (0 = no limit)')
            .setMinValue(0)
            .setMaxValue(365)
        )
        .addStringOption(opt => opt.setName('title').setDescription('Panel title').setMaxLength(100))
        .addStringOption(opt => opt.setName('description').setDescription('Panel text').setMaxLength(1000))
    )
    .addSubcommand(sub => sub.setName('status').setDescription('Shows the verification settings.'))
    .addSubcommand(sub => sub.setName('disable').setDescription('Removes the verification panel.')),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();
    const { guild } = interaction;
    const { verification } = getGuildSettings(guild.id);

    if (subcommand === 'setup') {
      const role = interaction.options.getRole('role');
      const channel = interaction.options.getChannel('channel');
      const minAccountAgeDays = interaction.options.getInteger('min-account-age') ?? 0;

      const problem = roleAssignProblem(role, guild.members.me);
      if (problem) {
        return interaction.reply({ content: t(interaction.guildId, 'cmd.verify.canTBeUsed', { role, problem }), allowedMentions: { parse: [] }, ...ephemeral });
      }
      const missing = missingChannelPermissions(channel, ['ViewChannel', 'SendMessages', 'EmbedLinks']);
      if (missing.length) {
        return interaction.reply({ content: t(interaction.guildId, 'cmd.verify.iCanTPost', { channel, formatPermissionList: formatPermissionList(missing) }), ...ephemeral });
      }

      // Keep a single working panel.
      if (verification?.messageId) {
        await guild.channels.cache.get(verification.channelId)?.messages.delete(verification.messageId).catch(() => {});
      }

      const message = await channel.send(buildPanel(interaction.guildId, interaction.options.getString('title'), interaction.options.getString('description')));
      updateGuildSettings(guild.id, {
        verification: { roleId: role.id, channelId: channel.id, messageId: message.id, minAccountAgeDays }
      });

      const { autoRoleId } = getGuildSettings(guild.id);
      const tips = [
        t(interaction.guildId, 'cmd.verify.giveThePermissionsMembers', { role }),
        t(interaction.guildId, 'cmd.verify.keepVisibleForEveryone', { channel })
      ];
      if (autoRoleId) tips.push(t(interaction.guildId, 'cmd.verify.autoRoleIsStill', { autoRoleId }));

      const embed = new EmbedBuilder()
        .setColor(COLORS.success)
        .setTitle(t(interaction.guildId, 'cmd.verify.verificationPanelPosted'))
        .setDescription(t(interaction.guildId, 'cmd.verify.membersGetAfterClicking', { url: message.url, role }))
        .addFields(
          { name: t(interaction.guildId, 'cmd.verify.minimumAccountAge'), value: minAccountAgeDays ? t(interaction.guildId, 'cmd.verify.dayS', { minAccountAgeDays }) : t(interaction.guildId, 'cmd.verify.noLimit'), inline: true },
          { name: t(interaction.guildId, 'cmd.verify.nextSteps'), value: tips.map(tip => `• ${tip}`).join('\n') }
        );
      return interaction.reply({ embeds: [embed], allowedMentions: { parse: [] }, ...ephemeral });
    }

    if (subcommand === 'status') {
      const embed = new EmbedBuilder()
        .setColor(verification ? COLORS.primary : COLORS.neutral)
        .setTitle(t(interaction.guildId, 'cmd.verify.verificationStatus'))
        .addFields(
          { name: 'Role', value: verification ? `<@&${verification.roleId}>` : t(interaction.guildId, 'cmd.verify.notConfigured'), inline: true },
          { name: 'Panel', value: verification ? `https://discord.com/channels/${guild.id}/${verification.channelId}/${verification.messageId}` : '`—`', inline: true },
          { name: t(interaction.guildId, 'cmd.verify.minimumAccountAge2'), value: verification?.minAccountAgeDays ? t(interaction.guildId, 'cmd.verify.dayS2', { minAccountAgeDays: verification.minAccountAgeDays }) : t(interaction.guildId, 'cmd.verify.noLimit2'), inline: true }
        );
      return interaction.reply({ embeds: [embed], ...ephemeral });
    }

    if (subcommand === 'disable') {
      if (verification?.messageId) {
        await guild.channels.cache.get(verification.channelId)?.messages.delete(verification.messageId).catch(() => {});
      }
      updateGuildSettings(guild.id, { verification: null });
      return interaction.reply({
        content: t(interaction.guildId, 'cmd.verify.verificationDisabledAndThe'),
        ...ephemeral
      });
    }
  },

  // customId: verify:confirm
  async handleButton(interaction) {
    const { verification } = getGuildSettings(interaction.guildId);
    const role = verification ? interaction.guild.roles.cache.get(verification.roleId) : null;

    if (!role) {
      return interaction.reply({ content: t(interaction.guildId, 'verify.notSetUp'), ...ephemeral });
    }
    if (interaction.member.roles.cache.has(role.id)) {
      return interaction.reply({ content: t(interaction.guildId, 'verify.already'), ...ephemeral });
    }

    const accountAgeDays = (Date.now() - interaction.user.createdTimestamp) / DAY_MS;
    if (verification.minAccountAgeDays && accountAgeDays < verification.minAccountAgeDays) {
      await sendModLog(interaction.guild, {
        color: LOG_COLORS.warn,
        title: t(interaction.guildId, 'cmd.verify.verificationBlockedNewAccount'),
        description: t(interaction.guildId, 'cmd.verify.triedToVerifyBut', { user: interaction.user, floor: Math.floor(accountAgeDays), minAccountAgeDays: verification.minAccountAgeDays }),
        user: interaction.user
      });
      return interaction.reply({
        content: t(interaction.guildId, 'verify.tooNew', { days: verification.minAccountAgeDays }),
        ...ephemeral
      });
    }

    const problem = roleAssignProblem(role, interaction.guild.members.me);
    if (problem) {
      console.warn(`[VERIFY] Cannot give "${role.name}": ${problem}.`);
      return interaction.reply({ content: t(interaction.guildId, 'verify.failed'), ...ephemeral });
    }

    await interaction.member.roles.add(role, 'Verification button');
    await sendModLog(interaction.guild, {
      color: LOG_COLORS.verify,
      title: t(interaction.guildId, 'cmd.verify.memberVerified'),
      description: t(interaction.guildId, 'cmd.verify.verified', { user: interaction.user }),
      user: interaction.user
    });
    return interaction.reply({ content: t(interaction.guildId, 'verify.done', { name: brand(interaction.guildId).name }), ...ephemeral });
  }
};
