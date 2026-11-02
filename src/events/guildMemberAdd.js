import { Events } from 'discord.js';
import { getGuildSettings } from '../utils/storage.js';
import { assignAutoRole, buildWelcomeEmbed } from '../utils/members.js';
import { LOG_COLORS, sendModLog } from '../utils/modlog.js';
import { NEW_ACCOUNT_WARNING_DAYS } from '../config.js';
import { trackActivity } from '../utils/stats.js';
import { trackMemberJoin } from '../utils/activity.js';
import { isEnabled } from '../utils/modules.js';
import { t } from '../i18n.js';

export default {
  name: Events.GuildMemberAdd,
  async execute(member) {
    if (member.user.bot) return;

    const { guild } = member;
    const settings = getGuildSettings(guild.id);
    trackActivity(guild.id, 'joins');
    trackMemberJoin(guild.id, member.id);

    // 1. AUTO-ROLE ASSIGNMENT
    // Members who still have to accept the server rules (Membership Screening) get the role
    // once they pass it, see guildMemberUpdate.js.
    const welcome = isEnabled(guild.id, 'welcome');
    if (welcome && settings.autoRoleId && !member.pending) {
      await assignAutoRole(member, settings.autoRoleId);
    }

    // 2. MOD LOG (new accounts are a common sign of alts / spam bots)
    const accountAgeDays = (Date.now() - member.user.createdTimestamp) / (24 * 60 * 60 * 1000);
    const isNewAccount = accountAgeDays < NEW_ACCOUNT_WARNING_DAYS;
    await sendModLog(guild, {
      color: LOG_COLORS.join,
      title: isNewAccount ? t(guild.id, 'event.guildMemberAdd.memberJoinedNewAccount') : t(guild.id, 'event.guildMemberAdd.memberJoined'),
      description: t(guild.id, 'event.guildMemberAdd.joinedTheServer', { user: member.user }),
      user: member.user,
      fields: [
        { name: t(guild.id, 'event.guildMemberAdd.accountCreated'), value: `<t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`, inline: true },
        { name: t(guild.id, 'event.guildMemberAdd.membersNow'), value: `${guild.memberCount}`, inline: true }
      ]
    });

    // 3. WELCOME MESSAGE
    if (welcome && settings.welcomeChannelId) {
      try {
        const channel = guild.channels.cache.get(settings.welcomeChannelId);
        if (channel?.isTextBased()) {
          await channel.send({
            content: `${member}`,
            embeds: [buildWelcomeEmbed(member.user, guild, settings.welcomeMessage)],
            allowedMentions: { users: [member.id] }
          });
          console.log(`[WELCOME] Sent welcome message for ${member.user.tag} in #${channel.name}.`);
        } else {
          console.warn(`[WELCOME] Configured channel ${settings.welcomeChannelId} was not found in ${guild.name}.`);
        }
      } catch (error) {
        console.error(`[WELCOME ERROR] Failed to send welcome message:`, error);
      }
    }
  }
};
