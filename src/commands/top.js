import { SlashCommandBuilder, EmbedBuilder, InteractionContextType } from 'discord.js';
import { COLORS } from '../config.js';
import { ranking } from '../utils/leaderboard.js';
import { brand } from '../utils/branding.js';
import { t, tn } from '../i18n.js';

const MEDALS = ['🥇', '🥈', '🥉'];

export default {
  data: new SlashCommandBuilder()
    .setName('top')
    .setDescription('Leaderboard: most active members by messages or voice time.')
    .setContexts(InteractionContextType.Guild)
    .addStringOption(opt =>
      opt
        .setName('type')
        .setDescription('What to rank (default: messages)')
        .addChoices(
          { name: '💬 Messages', value: 'messages' },
          { name: '🔊 Voice time', value: 'voice' }
        )
    )
    .addStringOption(opt =>
      opt
        .setName('period')
        .setDescription('Time range for messages / voice (default: last 30 days)')
        .addChoices({ name: 'Last 7 days', value: '7' }, { name: 'Last 30 days', value: '30' }, { name: 'All time', value: 'all' })
    ),

  async execute(interaction) {
    const type = interaction.options.getString('type') ?? 'messages';
    const period = interaction.options.getString('period') ?? '30';
    const { guild } = interaction;

    const ranked = ranking(guild, type, period);

    const lines = ranked.slice(0, 10).map((score, index) => t(interaction.guildId, 'cmd.top.text', { value: MEDALS[index] ?? `**${index + 1}.**`, userId: score.userId, label: score.label }));

    const ownIndex = ranked.findIndex(score => score.userId === interaction.user.id);
    const own = ownIndex === -1
      ? t(guild.id, 'top.notRanked')
      : t(guild.id, 'top.ranked', { rank: ownIndex + 1, total: ranked.length, label: ranked[ownIndex].label });

    const embed = new EmbedBuilder()
      .setColor(COLORS.orange)
      .setTitle(`${t(guild.id, `top.title.${type}`)} — ${t(guild.id, `top.period.${period}`)}`)
      .setDescription(lines.join('\n') || t(guild.id, 'top.empty'))
      .addFields({ name: t(guild.id, 'top.yourRank'), value: own })
      .setFooter({ text: t(guild.id, 'top.footer', { footer: brand(guild.id).footer }) })
      .setTimestamp();

    return interaction.reply({ embeds: [embed], allowedMentions: { parse: [] } });
  }
};
