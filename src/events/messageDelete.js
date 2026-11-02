import { Events } from 'discord.js';
import { getGuildSettings } from '../utils/storage.js';
import { LOG_COLORS, quote, sendModLog } from '../utils/modlog.js';
import { deletionLogLine, findDeleter } from '../utils/deletions.js';
import { t } from '../i18n.js';

export default {
  name: Events.MessageDelete,
  async execute(message) {
    if (!message.guild) return;
    if (message.channelId === getGuildSettings(message.guild.id).modLogChannelId) return;

    // Every delete (also of bot messages) goes to the bot's log, with who deleted it.
    const deleter = await findDeleter(message);
    console.log(deletionLogLine(message, deleter));

    // The mod log channel only gets members' messages (bot messages would be noise there).
    if (message.author?.bot) return;
    const deletedBy = {
      name: t(message.guildId, 'event.messageDelete.deletedBy'),
      value: deleter.executor ? `${deleter.executor}${deleter.kind === 'bot' ? ' 🤖' : ''}` : t(message.guildId, `event.messageDelete.by.${deleter.kind}`),
      inline: true
    };

    // Messages sent before the bot started are not cached, so only the channel is known.
    if (message.partial) {
      return sendModLog(message.guild, {
        color: LOG_COLORS.delete,
        title: t(message.guildId, 'event.messageDelete.messageDeleted'),
        description: t(message.guildId, 'event.messageDelete.anOlderMessageWas', { channel: message.channel }),
        fields: [deletedBy]
      });
    }

    const attachments = message.attachments.map(attachment => attachment.name).join(', ');
    await sendModLog(message.guild, {
      color: LOG_COLORS.delete,
      title: t(message.guildId, 'event.messageDelete.messageDeleted2'),
      description: t(message.guildId, 'event.messageDelete.messageByDeletedIn', { author: message.author, channel: message.channel, quote: quote(message.content) }),
      user: message.author,
      fields: [
        { name: 'Attachments', value: attachments || null },
        { name: 'Sent', value: `<t:${Math.floor(message.createdTimestamp / 1000)}:R>`, inline: true },
        deletedBy
      ]
    });
  }
};
