import { Events } from 'discord.js';
import { LOG_COLORS, quote, sendModLog } from '../utils/modlog.js';
import { t } from '../i18n.js';

export default {
  name: Events.MessageUpdate,
  async execute(oldMessage, newMessage) {
    if (!newMessage.guild || oldMessage.partial || newMessage.author?.bot) return;
    // Embeds loading or pins also fire this event; only log real text edits.
    if (oldMessage.content === newMessage.content) return;

    await sendModLog(newMessage.guild, {
      color: LOG_COLORS.edit,
      title: t(newMessage.guildId, 'event.messageUpdate.messageEdited'),
      description: t(newMessage.guildId, 'event.messageUpdate.editedAMessageIn', { author: newMessage.author, channel: newMessage.channel, url: newMessage.url }),
      user: newMessage.author,
      fields: [
        { name: 'Before', value: quote(oldMessage.content) },
        { name: 'After', value: quote(newMessage.content) }
      ]
    });
  }
};
