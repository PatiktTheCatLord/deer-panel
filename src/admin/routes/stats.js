import { getGuildSettings } from '../../utils/storage.js';
import { flushActivity } from '../../utils/stats.js';
import { LEADERBOARDS, ranking } from '../../utils/leaderboard.js';
import { HttpError } from '../http.js';

const DAY_MS = 24 * 60 * 60 * 1000;

// Last 30 days for the panel's charts. Messages and voice come from the per-member daily counts
// (kept 30 days); joins, leaves and member count from the daily history.
function charts({ guild }) {
  flushActivity();
  const settings = getGuildSettings(guild.id);
  const days = Array.from({ length: 30 }, (_, index) => new Date(Date.now() - (29 - index) * DAY_MS).toISOString().slice(0, 10));
  const sumOver = field => days.map(day => Object.values(settings.memberActivity).reduce((sum, member) => sum + (member[field]?.[day] ?? 0), 0));

  const topChannels = Object.entries(
    Object.values(settings.memberActivity).reduce((totals, member) => {
      for (const [channelId, count] of Object.entries(member.channels ?? {})) totals[channelId] = (totals[channelId] ?? 0) + count;
      return totals;
    }, {})
  )
    .sort(([, a], [, b]) => b - a)
    .slice(0, 8)
    .map(([channelId, count]) => ({ name: guild.channels.cache.get(channelId)?.name ?? 'deleted channel', count }));

  return {
    days,
    messages: sumOver('days'),
    voiceMinutes: sumOver('voiceDays'),
    joins: days.map(day => settings.history[day]?.joins ?? 0),
    leaves: days.map(day => settings.history[day]?.leaves ?? 0),
    members: days.map(day => settings.history[day]?.members ?? null),
    topChannels,
    historySince: Object.keys(settings.history).sort()[0] ?? null
  };
}

// Top members for one leaderboard type (the panel's "Sıralamalar" window).
function leaderboard({ guild, url }) {
  const type = url.searchParams.get('type') || 'messages';
  const period = url.searchParams.get('period') || '30';
  if (!LEADERBOARDS[type]) throw new HttpError(400, 'Unknown leaderboard');
  if (!['7', '30', 'all'].includes(period)) throw new HttpError(400, 'Unknown period');
  const ranked = ranking(guild, type, period);
  return {
    boards: LEADERBOARDS,
    total: ranked.length,
    rows: ranked.slice(0, 25).map(row => {
      const member = guild.members.cache.get(row.userId);
      return { ...row, name: member.displayName, avatar: member.user.displayAvatarURL({ size: 64 }) };
    })
  };
}

export default [
  ['GET', /^\/api\/stats$/, charts],
  ['GET', /^\/api\/leaderboard$/, leaderboard]
];
