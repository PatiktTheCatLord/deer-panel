import { SlashCommandBuilder, PermissionFlagsBits, InteractionContextType, MessageFlags } from 'discord.js';
import { truncate } from '../utils/helpers.js';
import { addNote, removeNote } from '../utils/moderation.js';
import { t } from '../i18n.js';

const ephemeral = { flags: MessageFlags.Ephemeral };

export default {
  ownerOnly: true,
  data: new SlashCommandBuilder()
    .setName('note')
    .setDescription('Private notes about a member, shown in /info (owner only).')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setContexts(InteractionContextType.Guild)
    .addSubcommand(sub =>
      sub
        .setName('add')
        .setDescription('Adds a private note to a member.')
        .addUserOption(opt => opt.setName('user').setDescription('Member (works for people who left, too)').setRequired(true))
        .addStringOption(opt => opt.setName('text').setDescription('The note').setRequired(true).setMaxLength(500))
    )
    .addSubcommand(sub =>
      sub
        .setName('remove')
        .setDescription('Removes a note.')
        .addUserOption(opt => opt.setName('user').setDescription('Member').setRequired(true))
        .addIntegerOption(opt => opt.setName('id').setDescription('Note number shown in /info').setRequired(true).setMinValue(1))
    ),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();
    const user = interaction.options.getUser('user');

    if (subcommand === 'add') {
      const text = interaction.options.getString('text');
      const id = addNote(interaction.guildId, user.id, text, interaction.user.id);
      return interaction.reply({ content: t(interaction.guildId, 'cmd.note.noteAddedTo', { id, user, truncate: truncate(text, 200) }), allowedMentions: { parse: [] }, ...ephemeral });
    }

    if (subcommand === 'remove') {
      const id = interaction.options.getInteger('id');
      if (!removeNote(interaction.guildId, user.id, id)) {
        return interaction.reply({ content: t(interaction.guildId, 'cmd.note.hasNoNote', { user, id }), allowedMentions: { parse: [] }, ...ephemeral });
      }
      return interaction.reply({ content: t(interaction.guildId, 'cmd.note.noteRemovedFrom', { id, user }), allowedMentions: { parse: [] }, ...ephemeral });
    }
  }
};
