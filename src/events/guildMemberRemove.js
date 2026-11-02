import { Events } from 'discord.js';
import { LOG_COLORS, sendModLog } from '../utils/modlog.js';
import { trackActivity } from '../utils/stats.js';
import { endVoiceSession, trackMemberLeave } from '../utils/activity.js';
import { t } from '../i18n.js';

export default {
  name: Events.GuildMemberRemove,
  async execute(member) {
    if (member.user.bot) return;
    trackActivity(member.guild.id, 'leaves');
    trackMemberLeave(member.guild.id, member.id);
    endVoiceSession(member.guild.id, member.id);

    const roles = member.roles?.cache
      .filter(role => role.id !== member.guild.id)
      .map(role => `${role}`)
      .join(' ');

    await sendModLog(member.guild, {
      color: LOG_COLORS.leave,
      title: t(member.guild.id, 'event.guildMemberRemove.memberLeft'),
      description: t(member.guild.id, 'event.guildMemberRemove.leftTheServerKicks', { user: member.user }),
      user: member.user,
      fields: [
        { name: 'Joined', value: member.joinedTimestamp ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>` : null, inline: true },
        { name: t(member.guild.id, 'event.guildMemberRemove.membersNow'), value: `${member.guild.memberCount}`, inline: true },
        { name: 'Roles', value: roles || null }
      ]
    });
  }
};
