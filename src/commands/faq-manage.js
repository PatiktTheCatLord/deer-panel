import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ActionRowBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  InteractionContextType,
  MessageFlags
} from 'discord.js';
import { MAX_FAQS } from '../config.js';
import { updateGuildSettings } from '../utils/storage.js';
import { getFaqs, respondWithFaqTopics } from '../utils/faq.js';
import { t } from '../i18n.js';

const ephemeral = { flags: MessageFlags.Ephemeral };

function buildFaqModal(customId, title, faq) {
  const question = new TextInputBuilder()
    .setCustomId('question')
    .setLabel('Question')
    .setStyle(TextInputStyle.Short)
    .setMaxLength(100)
    .setRequired(true)
    .setPlaceholder('e.g. Where can I download it?');
  const answer = new TextInputBuilder()
    .setCustomId('answer')
    .setLabel('Answer (Markdown supported)')
    .setStyle(TextInputStyle.Paragraph)
    .setMaxLength(2000)
    .setRequired(true);

  if (faq) {
    question.setValue(faq.question);
    answer.setValue(faq.answer);
  }

  return new ModalBuilder()
    .setCustomId(customId)
    .setTitle(title)
    .addComponents(new ActionRowBuilder().addComponents(question), new ActionRowBuilder().addComponents(answer));
}

export default {
  data: new SlashCommandBuilder()
    .setName('faq-manage')
    .setDescription('Add, edit or remove FAQ entries (staff).')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setContexts(InteractionContextType.Guild)
    .addSubcommand(sub => sub.setName('add').setDescription('Adds a new FAQ entry.'))
    .addSubcommand(sub =>
      sub
        .setName('edit')
        .setDescription('Edits an FAQ entry.')
        .addStringOption(opt => opt.setName('topic').setDescription('Entry to edit').setRequired(true).setAutocomplete(true))
    )
    .addSubcommand(sub =>
      sub
        .setName('remove')
        .setDescription('Removes an FAQ entry.')
        .addStringOption(opt => opt.setName('topic').setDescription('Entry to remove').setRequired(true).setAutocomplete(true))
    ),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();
    const faqs = getFaqs(interaction.guildId);

    if (subcommand === 'add') {
      if (Object.keys(faqs).length >= MAX_FAQS) {
        return interaction.reply({ content: t(interaction.guildId, 'cmd.faqManage.theFaqIsFull', { MAXFAQS: MAX_FAQS }), ...ephemeral });
      }
      return interaction.showModal(buildFaqModal('faq-manage:add', '❓ New FAQ Entry'));
    }

    const id = interaction.options.getString('topic');
    const faq = faqs[id];
    if (!faq) {
      return interaction.reply({ content: t(interaction.guildId, 'cmd.faqManage.entryNotFoundPick'), ...ephemeral });
    }

    if (subcommand === 'edit') {
      return interaction.showModal(buildFaqModal(`faq-manage:edit:${id}`, '✏️ Edit FAQ Entry', faq));
    }

    if (subcommand === 'remove') {
      updateGuildSettings(interaction.guildId, settings => {
        delete settings.faqs[id];
      });
      return interaction.reply({ content: t(interaction.guildId, 'cmd.faqManage.removed', { question: faq.question }), ...ephemeral });
    }
  },

  autocomplete: respondWithFaqTopics,

  // customId: faq-manage:add or faq-manage:edit:<id>
  async handleModal(interaction) {
    const [, action, editId] = interaction.customId.split(':');
    const question = interaction.fields.getTextInputValue('question').trim();
    const answer = interaction.fields.getTextInputValue('answer').trim();

    const duplicate = Object.entries(getFaqs(interaction.guildId)).find(
      ([id, faq]) => id !== editId && faq.question.toLowerCase() === question.toLowerCase()
    );
    if (duplicate) {
      return interaction.reply({ content: t(interaction.guildId, 'cmd.faqManage.anEntryWithThis', { answer }), ...ephemeral });
    }

    let saved = false;
    updateGuildSettings(interaction.guildId, settings => {
      if (action === 'edit') {
        if (!settings.faqs[editId]) return;
        Object.assign(settings.faqs[editId], { question, answer });
      } else {
        settings.faqs[settings.nextFaqId] = { question, answer, uses: 0 };
        settings.nextFaqId += 1;
      }
      saved = true;
    });

    if (!saved) {
      return interaction.reply({ content: t(interaction.guildId, 'cmd.faqManage.thatEntryWasRemoved'), ...ephemeral });
    }
    return interaction.reply({ content: t(interaction.guildId, 'cmd.faqManage.faqMembersCanNow', { value: t(interaction.guildId, action === 'edit' ? 'cmd.faqManage.updated' : 'cmd.faqManage.added'), question }), ...ephemeral });
  }
};
