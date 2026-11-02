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
import { COLORS, MAX_SELF_ROLES } from '../config.js';
import { getGuildSettings, updateGuildSettings } from '../utils/storage.js';
import { formatPermissionList, missingChannelPermissions, truncate } from '../utils/helpers.js';
import { roleAssignProblem } from '../utils/members.js';
import { brand } from '../utils/branding.js';
import { t } from '../i18n.js';

const ephemeral = { flags: MessageFlags.Ephemeral };
export const CUSTOM_EMOJI = /^<a?:\w{2,32}:\d{17,20}>$/;
export const UNICODE_EMOJI = /^\p{Extended_Pictographic}/u;

export function buildPanel(guildId, settings) {
  const panel = settings.rolePanel ?? {};
  const lines = settings.selfRoles.map(
    entry => t(guildId, 'cmd.roles.text', { value: entry.emoji ?? '•', roleId: entry.roleId, value2: entry.description ? ` — ${entry.description}` : '' })
  );

  const embed = new EmbedBuilder()
    .setColor(COLORS.primary)
    .setTitle(panel.title || t(guildId, 'cmd.roles.pickYourRoles'))
    .setDescription(
      t(guildId, 'cmd.roles.text2', { value: panel.description || 'Click a button to get a role, click it again to remove it.', value2: lines.join('\n') || '*No roles yet.*' })
    )
    .setFooter({ text: brand(guildId).footer });

  const rows = [];
  settings.selfRoles.forEach((entry, index) => {
    if (index % 5 === 0) rows.push(new ActionRowBuilder());
    const button = new ButtonBuilder()
      .setCustomId(`roles:toggle:${entry.roleId}`)
      .setLabel(entry.label)
      .setStyle(ButtonStyle.Secondary);
    if (entry.emoji) button.setEmoji(entry.emoji);
    rows.at(-1).addComponents(button);
  });

  return { embeds: [embed], components: rows, allowedMentions: { parse: [] } };
}

// Re-renders the posted panel after the role list changed. Returns false when there is no live panel.
export async function refreshPanel(guild) {
  const settings = getGuildSettings(guild.id);
  if (!settings.rolePanel) return false;

  const channel = guild.channels.cache.get(settings.rolePanel.channelId);
  const message = channel ? await channel.messages.fetch(settings.rolePanel.messageId).catch(() => null) : null;
  if (!message) {
    updateGuildSettings(guild.id, { rolePanel: null });
    return false;
  }

  await message.edit(buildPanel(guild.id, settings));
  return true;
}

export default {
  data: new SlashCommandBuilder()
    .setName('roles')
    .setDescription('Self-role panel: members pick roles with buttons (staff).')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .setContexts(InteractionContextType.Guild)
    .addSubcommand(sub =>
      sub
        .setName('add')
        .setDescription('Adds (or updates) a role on the panel.')
        .addRoleOption(opt => opt.setName('role').setDescription('Role members can pick').setRequired(true))
        .addStringOption(opt => opt.setName('label').setDescription('Button text (defaults to the role name)').setMaxLength(80))
        .addStringOption(opt => opt.setName('emoji').setDescription('Button emoji, e.g. 🪟 or a custom server emoji'))
        .addStringOption(opt => opt.setName('description').setDescription('Short explanation shown on the panel').setMaxLength(100))
    )
    .addSubcommand(sub =>
      sub
        .setName('remove')
        .setDescription('Removes a role from the panel.')
        .addRoleOption(opt => opt.setName('role').setDescription('Role to remove').setRequired(true))
    )
    .addSubcommand(sub => sub.setName('list').setDescription('Shows the roles on the panel and any problems.'))
    .addSubcommand(sub =>
      sub
        .setName('panel')
        .setDescription('Posts the role panel in a channel (replaces the old panel).')
        .addChannelOption(opt =>
          opt
            .setName('channel')
            .setDescription('Where to post the panel')
            .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
            .setRequired(true)
        )
        .addStringOption(opt => opt.setName('title').setDescription('Panel title').setMaxLength(100))
        .addStringOption(opt => opt.setName('description').setDescription('Panel text above the role list').setMaxLength(1000))
    ),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();
    const { guild } = interaction;
    const settings = getGuildSettings(guild.id);

    if (subcommand === 'add') {
      const role = interaction.options.getRole('role');
      const emoji = interaction.options.getString('emoji')?.trim() || null;
      const problem = roleAssignProblem(role, guild.members.me);

      if (problem) {
        return interaction.reply({ content: t(interaction.guildId, 'cmd.roles.canTBeUsed', { role, problem }), ...ephemeral });
      }
      if (emoji && !CUSTOM_EMOJI.test(emoji) && !UNICODE_EMOJI.test(emoji)) {
        return interaction.reply({ content: t(interaction.guildId, 'cmd.roles.thatEmojiIsNot'), ...ephemeral });
      }

      const exists = settings.selfRoles.some(entry => entry.roleId === role.id);
      if (!exists && settings.selfRoles.length >= MAX_SELF_ROLES) {
        return interaction.reply({ content: t(interaction.guildId, 'cmd.roles.thePanelCanHold', { MAXSELFROLES: MAX_SELF_ROLES }), ...ephemeral });
      }

      const entry = {
        roleId: role.id,
        label: interaction.options.getString('label') || truncate(role.name, 80),
        emoji,
        description: interaction.options.getString('description') || null
      };

      updateGuildSettings(guild.id, current => {
        const index = current.selfRoles.findIndex(item => item.roleId === role.id);
        if (index === -1) current.selfRoles.push(entry);
        else current.selfRoles[index] = entry;
      });

      const refreshed = await refreshPanel(guild);
      return interaction.reply({
        content:
          t(interaction.guildId, exists ? 'cmd.roles.updatedOnPanel' : 'cmd.roles.addedToPanel', { role, value2: t(interaction.guildId, refreshed ? 'cmd.roles.panelRefreshed' : 'cmd.roles.postPanelHint') }),
        allowedMentions: { parse: [] },
        ...ephemeral
      });
    }

    if (subcommand === 'remove') {
      const role = interaction.options.getRole('role');
      if (!settings.selfRoles.some(entry => entry.roleId === role.id)) {
        return interaction.reply({ content: t(interaction.guildId, 'cmd.roles.isNotOnThe', { role }), allowedMentions: { parse: [] }, ...ephemeral });
      }

      updateGuildSettings(guild.id, current => {
        current.selfRoles = current.selfRoles.filter(entry => entry.roleId !== role.id);
      });
      await refreshPanel(guild);

      return interaction.reply({ content: t(interaction.guildId, 'cmd.roles.removedFromTheRole', { role }), allowedMentions: { parse: [] }, ...ephemeral });
    }

    if (subcommand === 'list') {
      const me = guild.members.me;
      const lines = settings.selfRoles.map(entry => {
        const role = guild.roles.cache.get(entry.roleId);
        const problem = role ? roleAssignProblem(role, me) : t(interaction.guildId, 'cmd.roles.roleWasDeleted');
        return t(interaction.guildId, 'cmd.roles.text3', { value: entry.emoji ?? '•', label: entry.label, roleId: entry.roleId, value2: problem ? ` ⚠️ ${problem}` : '' });
      });

      const panel = settings.rolePanel
        ? `https://discord.com/channels/${guild.id}/${settings.rolePanel.channelId}/${settings.rolePanel.messageId}`
        : t(interaction.guildId, 'cmd.roles.notPosted');

      const embed = new EmbedBuilder()
        .setColor(COLORS.primary)
        .setTitle(t(interaction.guildId, 'cmd.roles.rolePanel', { length: settings.selfRoles.length, MAXSELFROLES: MAX_SELF_ROLES }))
        .setDescription(lines.join('\n') || t(interaction.guildId, 'cmd.roles.noRolesYetAdd'))
        .addFields({ name: t(interaction.guildId, 'cmd.roles.postedPanel'), value: panel });

      return interaction.reply({ embeds: [embed], ...ephemeral });
    }

    if (subcommand === 'panel') {
      const channel = interaction.options.getChannel('channel');

      if (!settings.selfRoles.length) {
        return interaction.reply({ content: t(interaction.guildId, 'cmd.roles.addAtLeastOne'), ...ephemeral });
      }

      const missing = missingChannelPermissions(channel, ['ViewChannel', 'SendMessages', 'EmbedLinks']);
      if (missing.length) {
        return interaction.reply({ content: t(interaction.guildId, 'cmd.roles.iCanTPost', { channel, formatPermissionList: formatPermissionList(missing) }), ...ephemeral });
      }

      // Remove the previous panel so there is only ever one set of working buttons.
      if (settings.rolePanel) {
        const oldChannel = guild.channels.cache.get(settings.rolePanel.channelId);
        await oldChannel?.messages.delete(settings.rolePanel.messageId).catch(() => {});
      }

      const rolePanel = {
        channelId: channel.id,
        messageId: null,
        title: interaction.options.getString('title'),
        description: interaction.options.getString('description')
      };
      const message = await channel.send(buildPanel(interaction.guildId, { ...settings, rolePanel }));
      rolePanel.messageId = message.id;
      updateGuildSettings(guild.id, { rolePanel });

      return interaction.reply({ content: t(interaction.guildId, 'cmd.roles.rolePanelPosted', { url: message.url }), ...ephemeral });
    }
  },

  // customId: roles:toggle:<roleId>
  async handleButton(interaction) {
    const [, action, roleId] = interaction.customId.split(':');
    if (action !== 'toggle') return;

    const settings = getGuildSettings(interaction.guildId);
    const role = interaction.guild.roles.cache.get(roleId);

    if (!role || !settings.selfRoles.some(entry => entry.roleId === roleId)) {
      return interaction.reply({ content: t(interaction.guildId, 'cmd.roles.thisRoleIsNo'), ...ephemeral });
    }

    const problem = roleAssignProblem(role, interaction.guild.members.me);
    if (problem) {
      console.warn(`[ROLES] Cannot toggle "${role.name}": ${problem}.`);
      return interaction.reply({ content: t(interaction.guildId, 'cmd.roles.iCanTGive'), ...ephemeral });
    }

    const member = interaction.member;
    if (member.roles.cache.has(role.id)) {
      await member.roles.remove(role, 'Self-role panel');
      return interaction.reply({ content: t(interaction.guildId, 'cmd.roles.removed', { role }), allowedMentions: { parse: [] }, ...ephemeral });
    }

    await member.roles.add(role, 'Self-role panel');
    return interaction.reply({ content: t(interaction.guildId, 'cmd.roles.youNowHave', { role }), allowedMentions: { parse: [] }, ...ephemeral });
  }
};
