import { EmbedBuilder } from 'discord.js';
import { COLORS, SHOWCASE } from '../config.js';
import { getAllSettings, getGuildSettings, updateGuildSettings } from './storage.js';
import { roleAssignProblem } from './members.js';
import { lastWeeklySlot } from './helpers.js';
import { getBotConfig } from './botConfig.js';
import { brand, showcaseWords } from './branding.js';
import { isEnabled } from './modules.js';
import { t, tn } from '../i18n.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const CHECK_INTERVAL_MS = 10 * 60 * 1000;
const MAX_PAGES = 10; // scan at most 1000 messages per vote

export function getShowcaseMedia(message) {
  return message.attachments.find(
    attachment => attachment.contentType?.startsWith('image/') || attachment.contentType?.startsWith('video/')
  );
}

// The most recent weekly showcase pick (e.g. Sunday 18:00 UTC) at or before `now`.
export function lastPickSlot(guildId, now = new Date()) {
  const config = getBotConfig(guildId);
  return lastWeeklySlot(now, config.showcaseWeekday, config.showcaseHourUtc);
}

export function nextPickSlot(guildId, now = new Date()) {
  return new Date(lastPickSlot(guildId, now).getTime() + 7 * DAY_MS);
}

function heartCount(message) {
  const reaction = message.reactions.cache.find(r => r.emoji.name === SHOWCASE.reaction);
  if (!reaction) return 0;
  return reaction.count - (reaction.me ? 1 : 0);
}

// All media posts of the voting window with their ❤️ count, best first (ties: the earlier post wins).
export async function showcaseCandidates(channel, now = new Date()) {
  const since = now.getTime() - SHOWCASE.windowDays * DAY_MS;
  const candidates = [];
  let before;

  for (let page = 0; page < MAX_PAGES; page++) {
    const batch = await channel.messages.fetch({ limit: 100, before });
    if (!batch.size) break;

    for (const message of batch.values()) {
      if (message.createdTimestamp < since || message.author.bot || !getShowcaseMedia(message)) continue;
      candidates.push({ message, hearts: heartCount(message) });
    }

    const oldest = batch.last();
    if (oldest.createdTimestamp < since) break;
    before = oldest.id;
  }

  return candidates.sort((a, b) => b.hearts - a.hearts || a.message.createdTimestamp - b.message.createdTimestamp);
}

// Scans the showcase channel for the most-hearted media post of the voting window.
export async function findPetOfTheWeek(channel, now = new Date()) {
  const [best] = await showcaseCandidates(channel, now);
  return best?.hearts > 0 ? best : null;
}

async function moveWinnerRole(guild, settings, winnerId) {
  if (!settings.showcaseRoleId) return;
  const role = guild.roles.cache.get(settings.showcaseRoleId);
  const problem = role ? roleAssignProblem(role, guild.members.me) : t(guild.id, 'staff.showcase.roleWasDeleted');
  if (problem) {
    console.warn(`[SHOWCASE] Cannot give the winner role: ${problem}.`);
    return;
  }

  const { title } = showcaseWords(guild.id);
  if (settings.showcaseLastWinnerId && settings.showcaseLastWinnerId !== winnerId) {
    const previous = await guild.members.fetch(settings.showcaseLastWinnerId).catch(() => null);
    await previous?.roles.remove(role, `${title} ended`).catch(() => {});
  }
  const winner = await guild.members.fetch(winnerId).catch(() => null);
  await winner?.roles.add(role, title).catch(error => console.warn('[SHOWCASE] Role add failed:', error.message));
}

// Picks and announces the weekly showcase winner. Returns a short text describing the result.
export async function runPetOfTheWeek(guild, now = new Date()) {
  const settings = getGuildSettings(guild.id);
  const channel = settings.showcaseChannelId ? guild.channels.cache.get(settings.showcaseChannelId) : null;
  if (!channel) return t(guild.id, 'staff.showcase.theShowcaseChannelIs');

  const result = await findPetOfTheWeek(channel, now);
  updateGuildSettings(guild.id, { showcaseLastPickAt: now.toISOString() });

  if (!result) {
    console.log(`[SHOWCASE] No hearted posts in ${guild.name} this week.`);
    return t(guild.id, 'staff.showcase.noPostInThe', { windowDays: SHOWCASE.windowDays, reaction: SHOWCASE.reaction });
  }

  const { message, hearts } = result;
  const media = getShowcaseMedia(message);
  const words = showcaseWords(guild.id);

  const embed = new EmbedBuilder()
    .setColor(COLORS.orange)
    .setTitle(t(guild.id, 'staff.showcase.text', { title: words.title }))
    .setDescription(
      t(guild.id, 'showcase.winnerText', { author: message.author, item: words.item, hearts, reaction: SHOWCASE.reaction, url: message.url })
    )
    .setThumbnail(message.author.displayAvatarURL({ size: 128 }))
    .setFooter({ text: t(guild.id, 'showcase.winnerFooter', { footer: brand(guild.id).footer, item: words.item, reaction: SHOWCASE.reaction }) })
    .setTimestamp(now);
  if (media.contentType.startsWith('image/')) embed.setImage(media.url);

  await channel.send({ content: `${message.author}`, embeds: [embed], allowedMentions: { users: [message.author.id] } });
  await moveWinnerRole(guild, settings, message.author.id);
  updateGuildSettings(guild.id, current => {
    current.showcaseLastWinnerId = message.author.id;
    current.showcaseWins[message.author.id] = (current.showcaseWins[message.author.id] ?? 0) + 1;
  });

  console.log(`[SHOWCASE] ${words.title} in ${guild.name}: ${message.author.tag} (${hearts} hearts).`);
  return t(guild.id, 'staff.showcase.wonWith', { author: message.author, hearts, reaction: SHOWCASE.reaction, url: message.url });
}

async function checkAllGuilds(client) {
  const now = new Date();

  for (const [guildId, stored] of Object.entries(getAllSettings())) {
    if (!stored.showcaseChannelId || !isEnabled(guildId, 'showcase')) continue;
    const guild = client.guilds.cache.get(guildId);
    if (!guild) continue;
    const slot = lastPickSlot(guildId, now);

    // Skip slots that passed before the showcase was set up or that were already handled.
    const handledUntil = Math.max(Date.parse(stored.showcaseLastPickAt ?? 0) || 0, Date.parse(stored.showcaseSince ?? 0) || 0);
    if (slot.getTime() <= handledUntil) continue;

    await runPetOfTheWeek(guild, now).catch(error => console.error(`[SHOWCASE] Weekly pick failed in ${guild.name}:`, error));
  }
}

// Checks every 10 minutes (and once at startup, to catch up after downtime).
export function startShowcaseScheduler(client) {
  checkAllGuilds(client);
  setInterval(() => checkAllGuilds(client), CHECK_INTERVAL_MS).unref();
}
