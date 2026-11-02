import { SlashCommandBuilder, EmbedBuilder, InteractionContextType, MessageFlags } from 'discord.js';
import { COLORS } from '../config.js';
import { updateGuildSettings } from '../utils/storage.js';
import { truncate } from '../utils/helpers.js';
import { getFaqs, respondWithFaqTopics } from '../utils/faq.js';
import { brand } from '../utils/branding.js';
import { t, tn } from '../i18n.js';

export default {
  data: new SlashCommandBuilder()
    .setName('faq')
    .setDescription('Answers to frequently asked questions.')
    .setContexts(InteractionContextType.Guild)
    .addStringOption(opt =>
      opt.setName('topic').setDescription('Start typing a question (leave empty to list all)').setAutocomplete(true)
    )
    .addUserOption(opt => opt.setName('user').setDescription('Mention someone who asked this question')),

  async execute(interaction) {
    const faqs = getFaqs(interaction.guildId);
    const topic = interaction.options.getString('topic');
    const user = interaction.options.getUser('user');

    if (!topic) {
      const entries = Object.values(faqs);
      const embed = new EmbedBuilder()
        .setColor(COLORS.primary)
        .setTitle(t(interaction.guildId, 'faq.title', { name: brand(interaction.guildId).name }))
        .setDescription(
          entries.length
            ? t(interaction.guildId, 'faq.list', { questions: entries.map(faq => `• ${faq.question}`).join('\n') })
            : t(interaction.guildId, 'faq.empty')
        );
      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
    }

    // The option value is the entry id when picked from autocomplete, but members may also type a question.
    const id = faqs[topic]
      ? topic
      : Object.keys(faqs).find(key => faqs[key].question.toLowerCase() === topic.toLowerCase());
    if (!id) {
      return interaction.reply({ content: t(interaction.guildId, 'faq.notFound'), flags: MessageFlags.Ephemeral });
    }
    const faq = faqs[id];

    updateGuildSettings(interaction.guildId, settings => {
      if (settings.faqs[id]) settings.faqs[id].uses = (settings.faqs[id].uses ?? 0) + 1;
    });

    const embed = new EmbedBuilder()
      .setColor(COLORS.primary)
      .setTitle(truncate(`❓ ${faq.question}`, 256))
      .setDescription(faq.answer)
      .setFooter({ text: t(interaction.guildId, 'cmd.faq.faq', { footer: brand(interaction.guildId).footer }) });

    return interaction.reply({
      content: user ? t(interaction.guildId, 'faq.mightHelp', { user }) : undefined,
      embeds: [embed],
      allowedMentions: { users: user ? [user.id] : [] }
    });
  },

  autocomplete: respondWithFaqTopics
};
