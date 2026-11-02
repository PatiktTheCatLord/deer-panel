import { SlashCommandBuilder, EmbedBuilder, ChannelType, InteractionContextType } from 'discord.js';
import { COLORS } from '../config.js';
import { t } from '../i18n.js';

export default {
  data: new SlashCommandBuilder()
    .setName('serverinfo')
    .setDescription('Displays information and statistics about this server.')
    .setContexts(InteractionContextType.Guild),

  async execute(interaction) {
    const { guild } = interaction;

    const countChannels = (...types) => guild.channels.cache.filter(c => types.includes(c.type)).size;
    const textChannels = countChannels(ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.GuildForum);
    const voiceChannels = countChannels(ChannelType.GuildVoice, ChannelType.GuildStageVoice);
    const roleCount = guild.roles.cache.size - 1; // without @everyone

    const embed = new EmbedBuilder()
      .setColor(COLORS.primary)
      .setTitle(t(interaction.guildId, 'cmd.serverinfo.serverInfo', { name: guild.name }))
      .setThumbnail(guild.iconURL({ size: 256 }))
      .addFields(
        { name: t(interaction.guildId, 'cmd.serverinfo.serverOwner'), value: `<@${guild.ownerId}>`, inline: true },
        { name: t(interaction.guildId, 'cmd.serverinfo.totalMembers'), value: `${guild.memberCount}`, inline: true },
        { name: t(interaction.guildId, 'cmd.serverinfo.roles'), value: `${roleCount}`, inline: true },
        { name: t(interaction.guildId, 'cmd.serverinfo.textChannels'), value: `${textChannels}`, inline: true },
        { name: t(interaction.guildId, 'cmd.serverinfo.voiceChannels'), value: `${voiceChannels}`, inline: true },
        { name: t(interaction.guildId, 'cmd.serverinfo.boostTier'), value: t(interaction.guildId, 'cmd.serverinfo.levelBoosts', { premiumTier: guild.premiumTier, value: guild.premiumSubscriptionCount || 0 }), inline: true },
        { name: t(interaction.guildId, 'cmd.serverinfo.createdOn'), value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:D>`, inline: false }
      )
      .setFooter({ text: t(interaction.guildId, 'cmd.serverinfo.serverId', { id: guild.id }) })
      .setTimestamp();

    await interaction.reply({ embeds: [embed], allowedMentions: { parse: [] } });
  }
};
