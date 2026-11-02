import { EmbedBuilder } from 'discord.js';
import { MOD_LOG_CHANNEL_PERMISSIONS } from '../config.js';
import { getGuildSettings } from './storage.js';
import { missingChannelPermissions, truncate } from './helpers.js';
import { brand } from './branding.js';
import { t } from '../i18n.js';

export const LOG_COLORS = {
  join: 0x57f287,
  leave: 0x99aab5,
  delete: 0xed4245,
  edit: 0xfee75c,
  ban: 0xa50e0e,
  unban: 0x3ba55c,
  kick: 0xf0a020,
  timeout: 0xe67e22,
  warn: 0xfee75c,
  verify: 0x57f287
};

export function getModLogChannel(guild) {
  const { modLogChannelId } = getGuildSettings(guild.id);
  const channel = modLogChannelId ? guild.channels.cache.get(modLogChannelId) : null;
  if (!channel || missingChannelPermissions(channel, MOD_LOG_CHANNEL_PERMISSIONS).length) return null;
  return channel;
}

// Builds a log embed and posts it to the mod-log channel (does nothing when it's not set up).
export async function sendModLog(guild, { color, title, description, fields = [], user }) {
  const channel = getModLogChannel(guild);
  if (!channel) return;

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(title)
    .setDescription(truncate(description, 4096))
    .setFooter({ text: t(guild.id, 'staff.modlog.modLog', { footer: brand(guild.id).footer, value: user ? ` • User ID: ${user.id}` : '' }) })
    .setTimestamp();

  if (user) embed.setAuthor({ name: user.tag ?? user.username, iconURL: user.displayAvatarURL({ size: 128 }) });
  embed.addFields(fields.filter(field => field.value).map(field => ({ ...field, value: truncate(field.value, 1024) })));

  await channel
    .send({ embeds: [embed], allowedMentions: { parse: [] } })
    .catch(error => console.warn('[MODLOG] Could not send log:', error.message));
}

export function quote(text) {
  return text ? `>>> ${truncate(text, 1000)}` : '*No text content*';
}
