import { ChannelType } from 'discord.js';

const TEXT_TYPES = [ChannelType.GuildText, ChannelType.GuildAnnouncement];

// Channel and role lists used by the panel's pickers.
// ?kind=all also lists forum and voice channels (for settings the bot only watches).
function channels({ guild, url }) {
  const all = url.searchParams.get('kind') === 'all';
  return [...guild.channels.cache.values()]
    .filter(channel => (all ? !channel.isThread() && channel.type !== ChannelType.GuildCategory : TEXT_TYPES.includes(channel.type)))
    .sort((a, b) => (a.parent?.position ?? -1) - (b.parent?.position ?? -1) || a.position - b.position)
    .map(channel => ({
      id: channel.id,
      name: channel.name,
      category: channel.parent?.name ?? null,
      announcement: channel.type === ChannelType.GuildAnnouncement,
      voice: channel.isVoiceBased()
    }));
}

function roles({ guild }) {
  return [...guild.roles.cache.values()]
    .filter(role => role.id !== guild.id && !role.managed)
    .sort((a, b) => b.position - a.position)
    .map(role => ({ id: role.id, name: role.name, color: role.hexColor, mentionable: role.mentionable }));
}

export default [
  ['GET', /^\/api\/discord\/channels$/, channels],
  ['GET', /^\/api\/discord\/roles$/, roles]
];
