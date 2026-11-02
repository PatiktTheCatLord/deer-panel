import { Events } from 'discord.js';
import { SHOWCASE } from '../config.js';
import { getGuildSettings } from '../utils/storage.js';
import { getShowcaseMedia } from '../utils/showcase.js';
import { trackActivity } from '../utils/stats.js';
import { trackMemberMessage } from '../utils/activity.js';
import { isEnabled } from '../utils/modules.js';

export default {
  name: Events.MessageCreate,
  async execute(message) {
    if (!message.inGuild() || message.author.bot) return;

    // Message counts for the weekly report
    trackActivity(message.guildId, 'messages', message.channelId);
    trackMemberMessage(message.guildId, message.author.id, message.channelId);

    // Add the vote reaction to every picture / video posted in the showcase channel.
    const { showcaseChannelId } = getGuildSettings(message.guildId);
    if (message.channelId !== showcaseChannelId || !isEnabled(message.guildId, 'showcase') || !getShowcaseMedia(message)) return;

    await message.react(SHOWCASE.reaction).catch(error => console.warn('[SHOWCASE] Could not react:', error.message));
  }
};
