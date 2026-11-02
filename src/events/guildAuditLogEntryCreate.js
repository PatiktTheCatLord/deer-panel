import { AuditLogEvent, Events } from 'discord.js';
import { LOG_COLORS, sendModLog } from '../utils/modlog.js';
import { recordModAction } from '../utils/moderation.js';
import { t } from '../i18n.js';

// Bans, kicks and timeouts come from the audit log so we know who did it and why — whether they
// were done in Discord, with the bot or from the desktop panel. They go to #mod-log and the
// moderation history the panel shows. Needs the GuildModeration intent and "View Audit Log".
export default {
  name: Events.GuildAuditLogEntryCreate,
  async execute(entry, guild) {
    const target = entry.targetId ? await guild.client.users.fetch(entry.targetId).catch(() => null) : null;
    const moderator = entry.executorId ? `<@${entry.executorId}>` : 'Unknown';
    const who = target ?? (entry.targetId ? `<@${entry.targetId}>` : t(guild.id, 'event.guildAuditLogEntryCreate.unknownUser'));
    const fields = [
      { name: 'Moderator', value: moderator, inline: true },
      { name: 'Reason', value: entry.reason || t(guild.id, 'event.guildAuditLogEntryCreate.noReasonGiven'), inline: true }
    ];
    const record = (type, extra = {}) =>
      recordModAction(guild.id, {
        type,
        userId: entry.targetId,
        username: target?.username ?? null,
        moderatorId: entry.executorId ?? null,
        reason: entry.reason ?? null,
        ...extra
      });

    switch (entry.action) {
      case AuditLogEvent.MemberBanAdd:
        record('ban');
        return sendModLog(guild, { color: LOG_COLORS.ban, title: t(guild.id, 'event.guildAuditLogEntryCreate.memberBanned'), description: t(guild.id, 'event.guildAuditLogEntryCreate.wasBanned', { who }), user: target, fields });

      case AuditLogEvent.MemberBanRemove:
        record('unban');
        return sendModLog(guild, { color: LOG_COLORS.unban, title: t(guild.id, 'event.guildAuditLogEntryCreate.memberUnbanned'), description: t(guild.id, 'event.guildAuditLogEntryCreate.wasUnbanned', { who }), user: target, fields });

      case AuditLogEvent.MemberKick:
        record('kick');
        return sendModLog(guild, { color: LOG_COLORS.kick, title: t(guild.id, 'event.guildAuditLogEntryCreate.memberKicked'), description: t(guild.id, 'event.guildAuditLogEntryCreate.wasKicked', { who }), user: target, fields });

      case AuditLogEvent.MemberUpdate: {
        const change = entry.changes.find(item => item.key === 'communication_disabled_until');
        if (!change) return;

        if (change.new) {
          const until = Math.floor(Date.parse(change.new) / 1000);
          record('timeout', { until: change.new, durationMinutes: Math.max(1, Math.round((Date.parse(change.new) - Date.now()) / 60_000)) });
          return sendModLog(guild, {
            color: LOG_COLORS.timeout,
            title: t(guild.id, 'event.guildAuditLogEntryCreate.memberTimedOut'),
            description: `${who} was timed out until <t:${until}:F> (<t:${until}:R>).`,
            user: target,
            fields
          });
        }
        record('untimeout');
        return sendModLog(guild, {
          color: LOG_COLORS.unban,
          title: t(guild.id, 'event.guildAuditLogEntryCreate.timeoutRemoved'),
          description: t(guild.id, 'event.guildAuditLogEntryCreate.sTimeoutWasRemoved', { who }),
          user: target,
          fields
        });
      }
    }
  }
};
