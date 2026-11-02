import { getGuildSettings, updateGuildSettings } from './storage.js';
import { LOG_COLORS, sendModLog } from './modlog.js';
import { getBotConfig } from './botConfig.js';
import { t } from '../i18n.js';

// Warnings, notes, staff alerts and the moderation history, shared by the slash commands,
// AutoMod and the owner's desktop panel. Warnings are never punished automatically:
// at the alert level the staff is told, and they decide.
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_HISTORY = 1000;
const MAX_ALERTS = 100;

export function activeWarnings(list, windowDays, now = Date.now()) {
  return list.filter(warning => now - Date.parse(warning.createdAt) < windowDays * DAY_MS);
}

export function warningPolicy(guildId) {
  const config = getBotConfig(guildId);
  return { alertThreshold: config.warningAlertThreshold, windowDays: config.warningWindowDays };
}

// Tells the staff that a member has many warnings: a message in the alert channel (pinging the staff role)
// and an entry the desktop panel turns into a Windows notification.
async function alertStaff(guild, user, active, warning) {
  const settings = getGuildSettings(guild.id);
  const { alertThreshold, windowDays } = warningPolicy(guild.id);
  const alert = {
    id: (settings.staffAlerts.at(-1)?.id ?? 0) + 1,
    type: 'warnings',
    userId: user.id,
    username: user.username,
    active,
    reason: warning.reason,
    createdAt: new Date().toISOString()
  };
  updateGuildSettings(guild.id, current => {
    current.staffAlerts.push(alert);
    current.staffAlerts = current.staffAlerts.slice(-MAX_ALERTS);
  });

  const channelId = settings.staffAlertChannelId ?? settings.modLogChannelId;
  const channel = channelId ? guild.channels.cache.get(channelId) : null;
  if (!channel) return alert;
  const role = settings.staffRoleId ? guild.roles.cache.get(settings.staffRoleId) : null;
  await channel
    .send({
      content:
        t(guild.id, 'staff.moderation.nowHasActiveWarnings', { value: role ? `${role} ` : '', user, active, alertThreshold, windowDays, reason: warning.reason }),
      allowedMentions: { roles: role ? [role.id] : [] }
    })
    .catch(error => console.warn('[MODERATION] Could not send staff alert:', error.message));
  return alert;
}

/**
 * Saves a warning, DMs the member, writes the mod log and alerts the staff at the alert level.
 * `via` is shown in the mod log (e.g. "desktop panel", "AutoMod").
 */
export async function addWarning(guild, member, reason, { moderatorId, via = null }) {
  const user = member.user;
  let warning;
  updateGuildSettings(guild.id, settings => {
    warning = { id: settings.nextWarningId, reason, moderatorId, createdAt: new Date().toISOString(), via };
    settings.nextWarningId += 1;
    (settings.warnings[user.id] ??= []).push(warning);
  });

  const { alertThreshold, windowDays } = warningPolicy(guild.id);
  const active = activeWarnings(getGuildSettings(guild.id).warnings[user.id], windowDays).length;

  // Tell the member why; DMs may be closed, which is fine.
  const dmSent = await user
    .send(t(guild.id, 'warnings.dm', { server: guild.name, reason, days: windowDays, active }))
    .then(() => true)
    .catch(() => false);

  const alerted = active >= alertThreshold;
  if (alerted) await alertStaff(guild, user, active, warning);

  await sendModLog(guild, {
    color: LOG_COLORS.warn,
    title: t(guild.id, 'staff.moderation.memberWarned', { id: warning.id }),
    description: t(guild.id, 'staff.moderation.wasWarned', { user, value: alerted ? ' 🚨 Alert level reached — staff notified.' : '' }),
    user,
    fields: [
      { name: 'Moderator', value: `<@${moderatorId}>${via ? ` (via ${via})` : ''}`, inline: true },
      { name: t(guild.id, 'staff.moderation.activeWarnings'), value: t(guild.id, 'staff.moderation.alertAt', { active, alertThreshold }), inline: true },
      { name: 'Reason', value: reason }
    ]
  });

  return { warning, active, dmSent, alerted, alertThreshold };
}

export function removeWarning(guildId, userId, warningId) {
  const list = getGuildSettings(guildId).warnings[userId] ?? [];
  if (!list.some(warning => warning.id === warningId)) return false;
  updateGuildSettings(guildId, settings => {
    settings.warnings[userId] = settings.warnings[userId].filter(warning => warning.id !== warningId);
  });
  return true;
}

export function clearWarnings(guildId, userId) {
  const count = (getGuildSettings(guildId).warnings[userId] ?? []).length;
  updateGuildSettings(guildId, settings => {
    delete settings.warnings[userId];
  });
  return count;
}

export function addNote(guildId, userId, text, authorId) {
  let id;
  updateGuildSettings(guildId, settings => {
    id = settings.nextNoteId;
    settings.nextNoteId += 1;
    (settings.notes[userId] ??= []).push({ id, text, authorId, createdAt: new Date().toISOString() });
  });
  return id;
}

export function removeNote(guildId, userId, noteId) {
  const notes = getGuildSettings(guildId).notes[userId] ?? [];
  if (!notes.some(note => note.id === noteId)) return false;
  updateGuildSettings(guildId, settings => {
    settings.notes[userId] = settings.notes[userId].filter(note => note.id !== noteId);
    if (!settings.notes[userId].length) delete settings.notes[userId];
  });
  return true;
}

// Bans, kicks and timeouts (from the audit log) for the panel's moderation history.
export function recordModAction(guildId, action) {
  updateGuildSettings(guildId, settings => {
    settings.modActions.push({ ...action, createdAt: new Date().toISOString() });
    settings.modActions = settings.modActions.slice(-MAX_HISTORY);
  });
}
