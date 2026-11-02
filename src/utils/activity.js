import { updateGuildSettings } from './storage.js';
import { isEnabled } from './modules.js';

// Per-member activity for /info: messages, voice time, joins/leaves.
// Like the weekly stats, counts are kept in memory and written to disk by flushMemberActivity().
const DAY_MS = 24 * 60 * 60 * 1000;
const KEEP_DAYS = 30;

const buffer = new Map(); // guildId -> Map(userId -> pending counts)
const voiceSessions = new Map(); // "guildId:userId" -> start timestamp

const dayKey = (time = Date.now()) => new Date(time).toISOString().slice(0, 10);

function pending(guildId, userId) {
  let users = buffer.get(guildId);
  if (!users) buffer.set(guildId, (users = new Map()));
  let counts = users.get(userId);
  if (!counts) {
    counts = { messages: 0, days: {}, channels: {}, voiceMinutes: 0, voiceDays: {}, lastMessageAt: null, joins: 0, leaves: 0, lastLeftAt: null };
    users.set(userId, counts);
  }
  return counts;
}

export function trackMemberMessage(guildId, userId, channelId) {
  if (!isEnabled(guildId, 'activity')) return;
  const counts = pending(guildId, userId);
  const day = dayKey();
  counts.messages += 1;
  counts.days[day] = (counts.days[day] ?? 0) + 1;
  counts.channels[channelId] = (counts.channels[channelId] ?? 0) + 1;
  counts.lastMessageAt = new Date().toISOString();
}

export function trackMemberJoin(guildId, userId) {
  if (!isEnabled(guildId, 'activity')) return;
  pending(guildId, userId).joins += 1;
}

export function trackMemberLeave(guildId, userId) {
  if (!isEnabled(guildId, 'activity')) return;
  const counts = pending(guildId, userId);
  counts.leaves += 1;
  counts.lastLeftAt = new Date().toISOString();
}

function addVoiceMinutes(guildId, userId, startedAt, endedAt = Date.now()) {
  const minutes = Math.round((endedAt - startedAt) / 60_000);
  if (minutes <= 0) return;
  const counts = pending(guildId, userId);
  const day = dayKey(endedAt);
  counts.voiceMinutes += minutes;
  counts.voiceDays[day] = (counts.voiceDays[day] ?? 0) + minutes;
}

export function startVoiceSession(guildId, userId, startedAt = Date.now()) {
  if (!isEnabled(guildId, 'activity')) return;
  const key = `${guildId}:${userId}`;
  if (!voiceSessions.has(key)) voiceSessions.set(key, startedAt);
}

export function endVoiceSession(guildId, userId) {
  const key = `${guildId}:${userId}`;
  const startedAt = voiceSessions.get(key);
  if (startedAt === undefined) return;
  voiceSessions.delete(key);
  addVoiceMinutes(guildId, userId, startedAt);
}

// Ongoing voice sessions are counted up to now and continue from now, so long calls show up before they end.
function checkpointVoiceSessions() {
  const now = Date.now();
  for (const [key, startedAt] of voiceSessions) {
    const [guildId, userId] = key.split(':');
    addVoiceMinutes(guildId, userId, startedAt, now);
    voiceSessions.set(key, now);
  }
}

function mergeDays(target = {}, source) {
  for (const [day, count] of Object.entries(source)) target[day] = (target[day] ?? 0) + count;
  const oldest = dayKey(Date.now() - KEEP_DAYS * DAY_MS);
  for (const day of Object.keys(target)) if (day < oldest) delete target[day];
  return target;
}

export function flushMemberActivity() {
  checkpointVoiceSessions();

  for (const [guildId, users] of buffer) {
    updateGuildSettings(guildId, settings => {
      settings.memberActivitySince ??= new Date().toISOString();
      for (const [userId, counts] of users) {
        const stored = (settings.memberActivity[userId] ??= {
          messages: 0, days: {}, channels: {}, voiceMinutes: 0, voiceDays: {}, lastMessageAt: null, joins: 0, leaves: 0, lastLeftAt: null
        });
        stored.messages += counts.messages;
        stored.voiceMinutes += counts.voiceMinutes;
        stored.joins += counts.joins;
        stored.leaves += counts.leaves;
        stored.days = mergeDays(stored.days, counts.days);
        stored.voiceDays = mergeDays(stored.voiceDays, counts.voiceDays);
        for (const [channelId, count] of Object.entries(counts.channels)) {
          stored.channels[channelId] = (stored.channels[channelId] ?? 0) + count;
        }
        if (counts.lastMessageAt) stored.lastMessageAt = counts.lastMessageAt;
        if (counts.lastLeftAt) stored.lastLeftAt = counts.lastLeftAt;
      }
    });
  }
  buffer.clear();
}

// Sum of the per-day counts for the last `days` days.
export function sumRecent(dayCounts = {}, days) {
  const oldest = dayKey(Date.now() - (days - 1) * DAY_MS);
  return Object.entries(dayCounts)
    .filter(([day]) => day >= oldest)
    .reduce((total, [, count]) => total + count, 0);
}
