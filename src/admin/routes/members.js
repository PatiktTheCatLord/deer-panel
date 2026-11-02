import { getGuildSettings } from '../../utils/storage.js';
import { flushMemberActivity, sumRecent } from '../../utils/activity.js';
import { activeWarnings, addNote, addWarning, removeNote, removeWarning, warningPolicy } from '../../utils/moderation.js';
import { HttpError, requireText } from '../http.js';
import { BUILD } from '../../utils/build.js';

const ID = '(?<id>\\d{17,20})';
const path = pattern => new RegExp(`^${pattern}$`);

function memberSummary(member) {
  return {
    id: member.id,
    username: member.user.username,
    displayName: member.displayName,
    avatar: member.user.displayAvatarURL({ size: 64 }),
    bot: member.user.bot,
    joinedAt: member.joinedTimestamp
  };
}

function status({ client, guild }) {
  const settings = getGuildSettings(guild.id);
  return {
    bot: {
      tag: client.user.tag,
      avatar: client.user.displayAvatarURL({ size: 128 }),
      uptimeSeconds: Math.round(process.uptime()),
      pingMs: Math.round(client.ws.ping),
      memoryMB: Math.round(process.memoryUsage().rss / 1024 / 1024),
      build: BUILD
    },
    guild: {
      id: guild.id,
      name: guild.name,
      icon: guild.iconURL({ size: 128 }),
      memberCount: guild.memberCount,
      humans: guild.members.cache.filter(member => !member.user.bot).size
    },
    counts: {
      warnings: Object.values(settings.warnings).flat().length,
      notes: Object.values(settings.notes).flat().length,
      faqs: Object.keys(settings.faqs).length
    }
  };
}

const DAY_MS = 24 * 60 * 60 * 1000;

// Quick filters for the member list.
function memberFilter(guild, name) {
  const settings = getGuildSettings(guild.id);
  const policy = warningPolicy(guild.id);
  const verifiedRole = settings.verification?.roleId;
  const filters = {
    new: member => Date.now() - member.user.createdTimestamp < 7 * DAY_MS,
    unverified: member => Boolean(verifiedRole) && !member.roles.cache.has(verifiedRole),
    inactive: member => {
      const last = settings.memberActivity[member.id]?.lastMessageAt;
      return !last || Date.now() - Date.parse(last) > 30 * DAY_MS;
    },
    warned: member => activeWarnings(settings.warnings[member.id] ?? [], policy.windowDays).length > 0,
    timedout: member => member.communicationDisabledUntilTimestamp > Date.now()
  };
  return filters[name] ?? null;
}

async function allMembers(guild) {
  if (guild.members.cache.size < guild.memberCount) await guild.members.fetch().catch(() => {});
  return [...guild.members.cache.values()];
}

async function list({ guild, url }) {
  flushMemberActivity();
  const query = (url.searchParams.get('q') ?? '').toLowerCase().trim();
  const filter = memberFilter(guild, url.searchParams.get('filter'));
  return (await allMembers(guild))
    .filter(member => !query || [member.user.username, member.displayName, member.id].some(text => text.toLowerCase().includes(query)))
    .filter(member => !filter || (!member.user.bot && filter(member)))
    .sort((a, b) => a.user.bot - b.user.bot || a.displayName.localeCompare(b.displayName)) // people first, then bots
    .slice(0, 100)
    .map(memberSummary);
}

// One row per member for the CSV export in the panel.
async function exportMembers({ guild }) {
  flushMemberActivity();
  const settings = getGuildSettings(guild.id);
  const policy = warningPolicy(guild.id);
  return (await allMembers(guild))
    .filter(member => !member.user.bot)
    .map(member => {
      const activity = settings.memberActivity[member.id];
      const warnings = settings.warnings[member.id] ?? [];
      return {
        id: member.id,
        username: member.user.username,
        displayName: member.displayName,
        joinedAt: member.joinedAt?.toISOString() ?? '',
        accountCreated: member.user.createdAt.toISOString(),
        roles: member.roles.cache.filter(role => role.id !== guild.id).map(role => role.name).join(' | '),
        messages30d: activity ? sumRecent(activity.days, 30) : 0,
        messagesTotal: activity?.messages ?? 0,
        voiceMinutesTotal: activity?.voiceMinutes ?? 0,
        lastMessageAt: activity?.lastMessageAt ?? '',
        activeWarnings: activeWarnings(warnings, policy.windowDays).length,
        totalWarnings: warnings.length,
        notes: (settings.notes[member.id] ?? []).length
      };
    });
}

async function profile({ client, guild, params }) {
  const userId = params.id;
  const member = await guild.members.fetch(userId).catch(() => null);
  const user = member?.user ?? (await client.users.fetch(userId).catch(() => null));
  if (!user) throw new HttpError(404, 'User not found');

  flushMemberActivity();
  const settings = getGuildSettings(guild.id);
  const activity = settings.memberActivity[userId];
  const warnings = settings.warnings[userId] ?? [];
  const policy = warningPolicy(guild.id);
  const active = new Set(activeWarnings(warnings, policy.windowDays).map(warning => warning.id));

  return {
    id: user.id,
    username: user.username,
    displayName: member?.displayName ?? user.globalName ?? user.username,
    avatar: user.displayAvatarURL({ size: 256 }),
    bot: user.bot,
    inServer: Boolean(member),
    isOwner: user.id === guild.ownerId,
    createdAt: user.createdTimestamp,
    joinedAt: member?.joinedTimestamp ?? null,
    timeoutUntil: member?.communicationDisabledUntilTimestamp > Date.now() ? member.communicationDisabledUntilTimestamp : null,
    roles: member
      ? member.roles.cache
          .filter(role => role.id !== guild.id)
          .sort((a, b) => b.position - a.position)
          .map(role => ({ name: role.name, color: role.hexColor }))
      : [],
    activity: activity
      ? {
          messages7: sumRecent(activity.days, 7),
          messages30: sumRecent(activity.days, 30),
          messagesTotal: activity.messages,
          voice7: sumRecent(activity.voiceDays, 7),
          voice30: sumRecent(activity.voiceDays, 30),
          voiceTotal: activity.voiceMinutes,
          lastMessageAt: activity.lastMessageAt,
          joins: activity.joins,
          leaves: activity.leaves
        }
      : null,
    warnings: warnings.map(warning => ({ ...warning, active: active.has(warning.id) })).reverse(),
    warningPolicy: policy,
    notes: [...(settings.notes[userId] ?? [])].reverse(),
    contributions: {
      petOfTheWeek: settings.showcaseWins[userId] ?? 0
    }
  };
}

async function warn({ guild, params, actorId, body }) {
  const reason = requireText((await body()).reason, 'Reason', 500);
  const member = await guild.members.fetch(params.id).catch(() => null);
  if (!member) throw new HttpError(400, 'That user is not in the server');
  if (member.user.bot) throw new HttpError(400, "Bots can't be warned");
  if (member.id === guild.ownerId) throw new HttpError(400, "The server owner can't be warned");
  const result = await addWarning(guild, member, reason, { moderatorId: actorId, via: 'desktop panel' });
  console.log(`[ADMIN] Warning #${result.warning.id} added to ${member.user.tag} from the panel.`);
  return result;
}

function unwarn({ guild, params }) {
  if (!removeWarning(guild.id, params.id, Number(params.item))) throw new HttpError(404, 'Warning not found');
  console.log(`[ADMIN] Warning #${params.item} removed from ${params.id} via the panel.`);
  return { ok: true };
}

async function note({ guild, params, actorId, body }) {
  return { id: addNote(guild.id, params.id, requireText((await body()).text, 'Note', 500), actorId) };
}

function unnote({ guild, params }) {
  if (!removeNote(guild.id, params.id, Number(params.item))) throw new HttpError(404, 'Note not found');
  return { ok: true };
}

export default [
  ['GET', path('/api/status'), status],
  ['GET', path('/api/members'), list],
  ['GET', path('/api/export/members'), exportMembers],
  ['GET', path(`/api/members/${ID}`), profile],
  ['POST', path(`/api/members/${ID}/warnings`), warn],
  ['DELETE', path(`/api/members/${ID}/warnings/(?<item>\\d+)`), unwarn],
  ['POST', path(`/api/members/${ID}/notes`), note],
  ['DELETE', path(`/api/members/${ID}/notes/(?<item>\\d+)`), unnote]
];
