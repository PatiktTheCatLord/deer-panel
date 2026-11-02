import { EmbedBuilder } from 'discord.js';
import { getGuildSettings, updateGuildSettings } from './storage.js';

// The bot's rule messages in the rules channel (posted once, edited in place from the desktop panel,
// so the verification button below them keeps working).

async function rulesChannel(guild) {
  const settings = getGuildSettings(guild.id);
  const channelId = settings.rulesMessages?.channelId ?? settings.verification?.channelId ?? guild.rulesChannelId;
  return channelId ? guild.channels.cache.get(channelId) ?? null : null;
}

// Finds the rule messages: saved ids, or the bot's embeds without buttons in the rules channel.
async function findRuleMessages(guild) {
  const channel = await rulesChannel(guild);
  if (!channel) throw new Error('No rules channel found');
  const saved = getGuildSettings(guild.id).rulesMessages;

  if (saved?.messageIds?.length) {
    const messages = await Promise.all(saved.messageIds.map(id => channel.messages.fetch(id).catch(() => null)));
    if (messages.every(Boolean)) return messages;
  }

  const recent = await channel.messages.fetch({ limit: 50 });
  const messages = [...recent.values()]
    .filter(message => message.author.id === guild.client.user.id && message.embeds.length && !message.components.length)
    .sort((a, b) => a.createdTimestamp - b.createdTimestamp);
  updateGuildSettings(guild.id, { rulesMessages: { channelId: channel.id, messageIds: messages.map(message => message.id) } });
  return messages;
}

export async function getRules(guild) {
  const messages = await findRuleMessages(guild);
  return messages.map(message => {
    const embed = message.embeds[0];
    return {
      messageId: message.id,
      url: message.url,
      title: embed.title ?? '',
      description: embed.description ?? '',
      fields: embed.fields.map(field => ({ name: field.name, value: field.value }))
    };
  });
}

// Replaces the text of one rule message; color, footer and order stay the same.
export async function updateRule(guild, messageId, { title, description, fields }) {
  const messages = await findRuleMessages(guild);
  const message = messages.find(item => item.id === messageId);
  if (!message) throw new Error('Rule message not found');

  const clean = (value, max, label) => {
    const text = typeof value === 'string' ? value.trim() : '';
    if (text.length > max) throw new Error(`${label} can be at most ${max} characters`);
    return text;
  };
  const newFields = (fields ?? []).map(field => ({ name: clean(field.name, 256, 'Field name'), value: clean(field.value, 1024, 'Field text') }));
  if (newFields.some(field => !field.name || !field.value)) throw new Error('Every field needs a name and a text');
  if (newFields.length > 25) throw new Error('At most 25 fields');
  const newTitle = clean(title, 256, 'Title');
  const newDescription = clean(description, 4096, 'Text');
  if (!newTitle && !newDescription && !newFields.length) throw new Error('The message would be empty');

  const embed = EmbedBuilder.from(message.embeds[0]).setTitle(newTitle || null).setDescription(newDescription || null).setFields(newFields);
  if (JSON.stringify(embed.toJSON()).length > 6000) throw new Error('The message is too long for Discord (6000 characters)');
  await message.edit({ embeds: [embed], allowedMentions: { parse: [] } });
  return { url: message.url };
}
