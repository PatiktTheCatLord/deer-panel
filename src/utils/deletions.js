import { AuditLogEvent } from 'discord.js';

// Who deleted a message? Discord does not say in the delete event, so the audit log is checked:
// - a moderator or a bot deleting someone else's message leaves an audit log entry
//   (Discord merges repeated deletes into one entry and raises its count);
// - a member deleting their own message leaves no entry.
// Returns { kind: 'moderator' | 'bot' | 'author' | 'unknown', executor? }.

const AUDIT_DELAY_MS = 1500; // the entry shows up shortly after the delete event
const FRESH_MS = 10_000;
const seenCounts = new Map(); // audit entry id -> count already used

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

export async function findDeleter(message) {
  const authorId = message.author?.id ?? null;
  await wait(AUDIT_DELAY_MS);
  let entries;
  try {
    entries = await message.guild.fetchAuditLogs({ type: AuditLogEvent.MessageDelete, limit: 6 });
  } catch {
    // Missing "View Audit Log": we can only say who wrote it.
    return { kind: 'unknown' };
  }

  const now = Date.now();
  for (const entry of entries.entries.values()) {
    if (entry.extra?.channel?.id !== message.channelId) continue;
    if (authorId && entry.targetId !== authorId) continue;
    const count = Number(entry.extra?.count ?? 1);
    const previous = seenCounts.get(entry.id);
    const fresh = now - entry.createdTimestamp < FRESH_MS && previous === undefined;
    const raised = previous !== undefined && count > previous;
    if (!fresh && !raised) continue;
    seenCounts.set(entry.id, count);
    if (seenCounts.size > 500) seenCounts.delete(seenCounts.keys().next().value);
    const executor = entry.executor ?? (entry.executorId ? await message.client.users.fetch(entry.executorId).catch(() => null) : null);
    return { kind: executor?.bot ? 'bot' : 'moderator', executor };
  }
  // No matching entry: the author deleted it (unless the message was too old to know the author).
  return { kind: authorId ? 'author' : 'unknown' };
}

// One line for the bot's log (the desktop panel's Loglar view filters on "[DELETE]").
export function deletionLogLine(message, deleter) {
  const where = message.channel?.name ? `#${message.channel.name}` : `channel ${message.channelId}`;
  const author = message.author ? `${message.author.tag}${message.author.bot ? ' (bot)' : ''}` : 'unknown author (older message)';
  const content = message.content ? ` "${message.content.replace(/\s+/g, ' ').slice(0, 150)}${message.content.length > 150 ? '…' : ''}"` : '';
  const attachments = message.attachments?.size ? ` +${message.attachments.size} file(s)` : '';
  const by = {
    moderator: `by moderator ${deleter.executor?.tag ?? '?'}`,
    bot: `by bot ${deleter.executor?.tag ?? '?'}`,
    author: 'by the author',
    unknown: 'by unknown'
  }[deleter.kind];
  return `[DELETE] ${where} · ${author}:${content}${attachments} — deleted ${by}`;
}
