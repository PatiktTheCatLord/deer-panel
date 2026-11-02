import { Events } from 'discord.js';
import { getGuildSettings } from '../utils/storage.js';
import { assignAutoRole } from '../utils/members.js';
import { isEnabled } from '../utils/modules.js';

// The auto-role for members who just accepted the server rules (Membership Screening).
export default {
  name: Events.GuildMemberUpdate,
  async execute(oldMember, newMember) {
    if (newMember.user.bot || newMember.pending) return;
    // Only react to the pending -> accepted transition (a partial old member has pending === null).
    if (oldMember.pending === false) return;

    const { autoRoleId } = getGuildSettings(newMember.guild.id);
    if (autoRoleId && isEnabled(newMember.guild.id, 'welcome')) await assignAutoRole(newMember, autoRoleId);
  }
};
