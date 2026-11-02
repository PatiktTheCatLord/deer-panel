import { EmbedBuilder } from 'discord.js';
import { COLORS } from '../config.js';
import { getBotConfig } from './botConfig.js';
import { getAllSettings, getGuildSettings, updateGuildSettings } from './storage.js';
import { discordTimestamp, lastWeeklySlot } from './helpers.js';
import { flushMemberActivity } from './activity.js';
import { brand, showcaseWords } from './branding.js';
import { isEnabled } from './modules.js';
import { t } from '../i18n.js';

const CHECK_INTERVAL_MS = 10 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

// Counted in memory and written to disk every 10 minutes, so messages don't cause a file write each.
const buffer = new Map();

export function trackActivity(guildId, key, channelId) {
  let counts = buffer.get(guildId);
  if (!counts) {
    counts = { joins: 0, leaves: 0, messages: 0, channels: {} };
    buffer.set(guildId, counts);
  }
  counts[key] += 1;
  if (channelId) counts.channels[channelId] = (counts.channels[channelId] ?? 0) + 1;
}

function emptyActivity(since = new Date()) {
  return { since: since.toISOString(), joins: 0, leaves: 0, messages: 0, channels: {} };
}

export function flushActivity() {
  flushMemberActivity();
  for (const [guildId, counts] of buffer) {
    updateGuildSettings(guildId, settings => {
      const activity = (settings.activity ??= emptyActivity());
      activity.joins += counts.joins;
      activity.leaves += counts.leaves;
      activity.messages += counts.messages;
      for (const [channelId, count] of Object.entries(counts.channels)) {
        activity.channels[channelId] = (activity.channels[channelId] ?? 0) + count;
      }
      const day = historyDay(settings);
      day.joins += counts.joins;
      day.leaves += counts.leaves;
    });
  }
  buffer.clear();
}

// Today's entry in the daily history (kept for a year) used by the panel's charts.
const HISTORY_DAYS = 365;
function historyDay(settings) {
  const today = new Date().toISOString().slice(0, 10);
  settings.history ??= {};
  if (!settings.history[today]) {
    settings.history[today] = { joins: 0, leaves: 0, members: null };
    const oldest = new Date(Date.now() - HISTORY_DAYS * DAY_MS).toISOString().slice(0, 10);
    for (const day of Object.keys(settings.history)) if (day < oldest) delete settings.history[day];
  }
  return settings.history[today];
}

function recordMemberCount(guild) {
  updateGuildSettings(guild.id, settings => {
    historyDay(settings).members = guild.memberCount;
  });
}

function lastReportSlot(guildId, now) {
  const config = getBotConfig(guildId);
  return lastWeeklySlot(now, config.statsWeekday, config.statsHourUtc);
}

export function nextReportSlot(guildId, now = new Date()) {
  return new Date(lastReportSlot(guildId, now).getTime() + 7 * DAY_MS);
}

const after = since => record => record.createdAt && Date.parse(record.createdAt) >= since;
const updatedAfter = since => record => record.updatedAt && Date.parse(record.updatedAt) >= since;

export function buildWeeklyReport(guild, now = new Date()) {
  flushActivity();
  const settings = getGuildSettings(guild.id);
  const activity = settings.activity ?? emptyActivity(new Date(now.getTime() - 7 * DAY_MS));
  const since = Date.parse(activity.since);

  const warnings = Object.values(settings.warnings).flat();

  const topChannels = Object.entries(activity.channels)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([channelId, count], index) => t(guild.id, 'staff.stats.text', { value: index + 1, channelId, count }));

  const net = activity.joins - activity.leaves;
  const count = (list, status) => list.filter(item => status.includes(item.status)).length;

  return new EmbedBuilder()
    .setColor(COLORS.primary)
    .setTitle(t(guild.id, 'staff.stats.weeklyServerReport'))
    .setDescription(t(guild.id, 'staff.stats.text2', { discordTimestamp: discordTimestamp(since, 'D'), discordTimestamp2: discordTimestamp(now, 'D') }))
    .addFields(
      {
        name: t(guild.id, 'staff.stats.members'),
        value: t(guild.id, 'staff.stats.joinedLeftNetTotal', { joins: activity.joins, leaves: activity.leaves, value: net >= 0 ? '+' : '', net, memberCount: guild.memberCount }),
        inline: true
      },
      {
        name: t(guild.id, 'staff.stats.messages'),
        value: t(guild.id, 'staff.stats.total', { messages: activity.messages, value: topChannels.join('\n') || '*No messages counted.*' }),
        inline: true
      },
      {
        name: t(guild.id, 'staff.stats.moderation'),
        value: t(guild.id, 'staff.stats.warningsGiven', { length: warnings.filter(after(since)).length }),
        inline: true
      },
      {
        name: t(guild.id, 'staff.stats.text3', { title: showcaseWords(guild.id).title }),
        value: settings.showcaseLastWinnerId ? `<@${settings.showcaseLastWinnerId}>` : t(guild.id, 'staff.stats.noneYet'),
        inline: true
      }
    )
    .setFooter({ text: t(guild.id, 'staff.stats.nextReport', { footer: brand(guild.id).footer }) })
    .setTimestamp(nextReportSlot(guild.id, now));
}

// Sends the report and starts a new counting period.
export async function sendWeeklyReport(guild, now = new Date()) {
  const { statsChannelId } = getGuildSettings(guild.id);
  const channel = statsChannelId ? guild.channels.cache.get(statsChannelId) : null;
  if (!channel) return false;

  await channel.send({ embeds: [buildWeeklyReport(guild, now)], allowedMentions: { parse: [] } });
  updateGuildSettings(guild.id, { activity: emptyActivity(now), statsLastReportAt: now.toISOString() });
  console.log(`[STATS] Weekly report sent in ${guild.name}.`);
  return true;
}

async function checkAllGuilds(client) {
  flushActivity();
  for (const guild of client.guilds.cache.values()) recordMemberCount(guild);
  const now = new Date();

  for (const [guildId, stored] of Object.entries(getAllSettings())) {
    if (!stored.statsChannelId || !isEnabled(guildId, 'stats')) continue;
    const guild = client.guilds.cache.get(guildId);
    if (!guild || lastReportSlot(guildId, now).getTime() <= (Date.parse(stored.statsLastReportAt ?? 0) || 0)) continue;

    await sendWeeklyReport(guild, now).catch(error => console.error(`[STATS] Weekly report failed in ${guild.name}:`, error));
  }
}

export function startStatsScheduler(client) {
  checkAllGuilds(client);
  setInterval(() => checkAllGuilds(client), CHECK_INTERVAL_MS).unref();
}

export function resetActivity(guildId, now = new Date()) {
  buffer.delete(guildId);
  updateGuildSettings(guildId, { activity: emptyActivity(now), statsLastReportAt: now.toISOString() });
}
