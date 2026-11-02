import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { COLORS } from '../config.js';
import { t } from '../i18n.js';

export default {
  data: new SlashCommandBuilder()
    .setName('ping')
    .setDescription('Checks the bot latency and Discord API latency.'),

  async execute(interaction) {
    const response = await interaction.reply({ content: 'Pinging...', withResponse: true });
    const latency = response.resource.message.createdTimestamp - interaction.createdTimestamp;
    const apiLatency = Math.round(interaction.client.ws.ping);

    const embed = new EmbedBuilder()
      .setColor(COLORS.primary)
      .setTitle(t(interaction.guildId, 'cmd.ping.pong'))
      .addFields(
        { name: t(interaction.guildId, 'cmd.ping.roundtripLatency'), value: `\`${latency}ms\``, inline: true },
        { name: t(interaction.guildId, 'cmd.ping.discordApi'), value: apiLatency >= 0 ? `\`${apiLatency}ms\`` : '`measuring…`', inline: true }
      )
      .setTimestamp();

    await interaction.editReply({ content: null, embeds: [embed] });
  }
};
