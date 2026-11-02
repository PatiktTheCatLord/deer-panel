import { getGuildSettings } from './storage.js';
import { flushMemberActivity, sumRecent } from './activity.js';
import { t, tn } from '../i18n.js';

// What can be ranked. `period: true` → can be limited to the last 7 / 30 days
// (daily counts are kept 30 days).
export const LEADERBOARDS = {
  messages: { label: 'Messages', period: true },
  voice: { label: 'Voice time', period: true },
  activeDays: { label: 'Active days', period: true, maxDays: 30 }
};

function formatMinutes(guildId, minutes) {
  return minutes < 60 ? t(guildId, 'common.minutes', { m: minutes }) : t(guildId, 'common.hoursMinutes', { h: Math.floor(minutes / 60), m: minutes % 60 });
}

// Days with at least one message or a voice minute in the period (daily counts only go back 30 days).
function activeDays(data, period) {
  const days = new Set([...Object.keys(data.days ?? {}), ...Object.keys(data.voiceDays ?? {})]);
  if (period === 'all') return days.size;
  const oldest = new Date(Date.now() - (Number(period) - 1) * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  return [...days].filter(day => day >= oldest).length;
}

// Returns [{ userId, value, label }] for every member, unsorted.
export function scores(guildId, type, period = '30') {
  const board = LEADERBOARDS[type];
  if (!board) throw new Error(`Unknown leaderboard: ${type}`);
  flushMemberActivity();
  const activity = getGuildSettings(guildId).memberActivity;
  return Object.entries(activity).map(([userId, data]) => {
    if (type === 'voice') {
      const minutes = period === 'all' ? data.voiceMinutes ?? 0 : sumRecent(data.voiceDays, Number(period));
      return { userId, value: minutes, label: formatMinutes(guildId, minutes) };
    }
    if (type === 'activeDays') {
      const count = activeDays(data, period);
      return { userId, value: count, label: tn(guildId, 'top.days', count) };
    }
    const messages = period === 'all' ? data.messages ?? 0 : sumRecent(data.days, Number(period));
    return { userId, value: messages, label: tn(guildId, 'top.messages', messages, { count: messages.toLocaleString('en-US') }) };
  });
}

// Current human members with a value above 0, highest first.
export function ranking(guild, type, period) {
  return scores(guild.id, type, period)
    .filter(score => score.value > 0)
    .filter(score => {
      const member = guild.members.cache.get(score.userId);
      return member && !member.user.bot;
    })
    .sort((a, b) => b.value - a.value);
}
