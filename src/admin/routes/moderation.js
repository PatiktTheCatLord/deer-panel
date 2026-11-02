import { getGuildSettings } from '../../utils/storage.js';
import { activeWarnings, warningPolicy } from '../../utils/moderation.js';
import { roleAssignProblem } from '../../utils/members.js';
import { HttpError, requireText } from '../http.js';

// Moderation from the desktop panel: timeout, kick, ban, unban, manual verification,
// the moderation history (warnings + bans/kicks/timeouts), search and staff alerts.
const ID = '(?<id>\\d{17,20})';
const MAX_TIMEOUT_MINUTES = 28 * 24 * 60; // Discord's limit
const DAY_MS = 24 * 60 * 60 * 1000;

// The reason shows up in Discord's audit log and #mod-log, so mark panel actions.
const panelReason = reason => `[Panel] ${reason}`;

async function targetMember(guild, id) {
  const member = await guild.members.fetch(id).catch(() => null);
  if (!member) throw new HttpError(400, 'That user is not in the server');
  if (member.id === guild.ownerId) throw new HttpError(400, "The server owner can't be moderated");
  if (member.id === guild.client.user.id) throw new HttpError(400, "The bot can't moderate itself");
  return member;
}

async function timeout({ guild, params, body }) {
  const data = await body();
  const minutes = Number(data.minutes);
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > MAX_TIMEOUT_MINUTES) throw new HttpError(400, 'Duration must be 1 minute to 28 days');
  const reason = requireText(data.reason, 'Reason', 400);
  const member = await targetMember(guild, params.id);
  if (!member.moderatable) throw new HttpError(400, "The bot's role is not high enough to time out this member");
  await member.timeout(minutes * 60_000, panelReason(reason));
  console.log(`[ADMIN] ${member.user.tag} timed out for ${minutes} min (panel).`);
  return { until: Date.now() + minutes * 60_000 };
}

async function untimeout({ guild, params }) {
  const member = await targetMember(guild, params.id);
  if (!member.moderatable) throw new HttpError(400, "The bot's role is not high enough for this member");
  await member.timeout(null, panelReason('Timeout removed'));
  return { ok: true };
}

async function kick({ guild, params, body }) {
  const reason = requireText((await body()).reason, 'Reason', 400);
  const member = await targetMember(guild, params.id);
  if (!member.kickable) throw new HttpError(400, "The bot's role is not high enough to kick this member");
  await member.kick(panelReason(reason));
  console.log(`[ADMIN] ${member.user.tag} kicked (panel).`);
  return { ok: true };
}

async function ban({ guild, params, body }) {
  const data = await body();
  const reason = requireText(data.reason, 'Reason', 400);
  const days = Number(data.deleteMessageDays ?? 0);
  if (!Number.isInteger(days) || days < 0 || days > 7) throw new HttpError(400, 'Message deletion must be 0–7 days');
  const member = await guild.members.fetch(params.id).catch(() => null);
  if (member) {
    if (member.id === guild.ownerId || member.id === guild.client.user.id) throw new HttpError(400, "This member can't be banned");
    if (!member.bannable) throw new HttpError(400, "The bot's role is not high enough to ban this member");
  }
  // Works for people who already left, too.
  await guild.members.ban(params.id, { reason: panelReason(reason), deleteMessageSeconds: days * 86400 });
  console.log(`[ADMIN] ${params.id} banned (panel).`);
  return { ok: true };
}

async function unban({ guild, params }) {
  await guild.members.unban(params.id, panelReason('Unbanned')).catch(() => {
    throw new HttpError(404, 'That user is not banned');
  });
  return { ok: true };
}

async function bans({ guild }) {
  const list = await guild.bans.fetch();
  return list.map(item => ({ id: item.user.id, username: item.user.username, avatar: item.user.displayAvatarURL({ size: 64 }), reason: item.reason }));
}

// Gives the verification role by hand (e.g. accounts too new for the button).
async function verify({ guild, params }) {
  const roleId = getGuildSettings(guild.id).verification?.roleId;
  const role = roleId ? guild.roles.cache.get(roleId) : null;
  if (!role) throw new HttpError(400, 'Verification is not set up');
  const problem = roleAssignProblem(role, guild.members.me);
  if (problem) throw new HttpError(400, problem.replace(/`/g, ''));
  const member = await targetMember(guild, params.id);
  if (member.roles.cache.has(role.id)) return { alreadyVerified: true };
  await member.roles.add(role, panelReason('Verified by hand'));
  console.log(`[ADMIN] ${member.user.tag} verified by hand (panel).`);
  return { alreadyVerified: false };
}

// Warnings + bans/kicks/timeouts in one list, newest first.
function history({ guild, url }) {
  const settings = getGuildSettings(guild.id);
  const type = url.searchParams.get('type') || null;
  const userId = url.searchParams.get('user') || null;
  const days = Number(url.searchParams.get('days')) || null;
  const since = days ? Date.now() - days * DAY_MS : 0;
  const name = id => guild.members.cache.get(id)?.displayName ?? null;

  const warnings = Object.entries(settings.warnings).flatMap(([memberId, list]) =>
    list.map(warning => ({
      type: 'warning',
      id: warning.id,
      userId: memberId,
      moderatorId: warning.moderatorId,
      reason: warning.reason,
      via: warning.via ?? null,
      createdAt: warning.createdAt
    }))
  );
  const actions = settings.modActions.map(action => ({ ...action }));

  return [...warnings, ...actions]
    .filter(item => (!type || item.type === type) && (!userId || item.userId === userId) && Date.parse(item.createdAt) >= since)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 500)
    .map(item => ({ ...item, userName: name(item.userId) ?? item.username ?? null, moderatorName: item.moderatorId ? name(item.moderatorId) : null }));
}

// Searches notes and warnings (text) across all members.
function search({ guild, url }) {
  const query = (url.searchParams.get('q') ?? '').toLowerCase().trim();
  if (query.length < 2) throw new HttpError(400, 'Type at least 2 characters');
  const settings = getGuildSettings(guild.id);
  const name = id => guild.members.cache.get(id)?.displayName ?? null;
  const hits = [];
  for (const [userId, notes] of Object.entries(settings.notes)) {
    for (const note of notes) if (note.text.toLowerCase().includes(query)) hits.push({ kind: 'note', userId, userName: name(userId), id: note.id, text: note.text, createdAt: note.createdAt });
  }
  for (const [userId, warnings] of Object.entries(settings.warnings)) {
    for (const warning of warnings) if (warning.reason.toLowerCase().includes(query)) hits.push({ kind: 'warning', userId, userName: name(userId), id: warning.id, text: warning.reason, createdAt: warning.createdAt });
  }
  return hits.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 200);
}

// Staff alerts after a given id (the panel polls this to show Windows notifications).
function alerts({ guild, url }) {
  const after = Number(url.searchParams.get('after')) || 0;
  return getGuildSettings(guild.id).staffAlerts.filter(alert => alert.id > after);
}

// Members with many active warnings right now (for the overview).
function flagged({ guild }) {
  const settings = getGuildSettings(guild.id);
  const policy = warningPolicy(guild.id);
  return Object.entries(settings.warnings)
    .map(([userId, list]) => ({ userId, userName: guild.members.cache.get(userId)?.displayName ?? null, active: activeWarnings(list, policy.windowDays).length }))
    .filter(item => item.active >= policy.alertThreshold)
    .sort((a, b) => b.active - a.active);
}

export default [
  ['POST', new RegExp(`^/api/members/${ID}/timeout$`), timeout],
  ['DELETE', new RegExp(`^/api/members/${ID}/timeout$`), untimeout],
  ['POST', new RegExp(`^/api/members/${ID}/kick$`), kick],
  ['POST', new RegExp(`^/api/members/${ID}/ban$`), ban],
  ['DELETE', new RegExp(`^/api/bans/${ID}$`), unban],
  ['GET', /^\/api\/bans$/, bans],
  ['POST', new RegExp(`^/api/members/${ID}/verify$`), verify],
  ['GET', /^\/api\/modlog$/, history],
  ['GET', /^\/api\/search$/, search],
  ['GET', /^\/api\/alerts$/, alerts],
  ['GET', /^\/api\/flagged$/, flagged]
];
