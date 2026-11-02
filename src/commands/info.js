import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, InteractionContextType, MessageFlags } from 'discord.js';
import { COLORS } from '../config.js';
import { warningPolicy } from '../utils/moderation.js';
import { getGuildSettings } from '../utils/storage.js';
import { discordTimestamp, truncate } from '../utils/helpers.js';
import { flushMemberActivity, sumRecent } from '../utils/activity.js';
import { brand } from '../utils/branding.js';
import { showcaseWords } from '../utils/branding.js';
import { t } from '../i18n.js';

const DAY_MS = 24 * 60 * 60 * 1000;

function formatMinutes(guildId, minutes) {
  if (minutes < 60) return t(guildId, 'common.minutes', { m: minutes });
  return t(guildId, 'common.hoursMinutes', { h: Math.floor(minutes / 60), m: minutes % 60 });
}

function activityLevel(guildId, messages30, voice30) {
  const score = messages30 + voice30 / 10; // 10 minutes in voice ≈ 1 message
  const level = score >= 150 ? 'veryActive' : score >= 30 ? 'active' : score >= 1 ? 'occasional' : 'inactive';
  return t(guildId, `cmd.info.level.${level}`);
}

// Position of the user among all members, ranked by messages in the last 30 days.
function messageRank(memberActivity, userId) {
  const ranked = Object.entries(memberActivity)
    .map(([id, data]) => [id, sumRecent(data.days, 30)])
    .filter(([, count]) => count > 0)
    .sort(([, a], [, b]) => b - a);
  const index = ranked.findIndex(([id]) => id === userId);
  return index === -1 ? null : { position: index + 1, total: ranked.length };
}

export default {
  ownerOnly: true,
  data: new SlashCommandBuilder()
    .setName('info')
    .setDescription('Everything about a member: activity, warnings, notes (owner only).')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setContexts(InteractionContextType.Guild)
    .addUserOption(opt => opt.setName('user').setDescription('Member (type a name, or paste an ID for people who left)').setRequired(true)),

  async execute(interaction) {
    const { guild } = interaction;
    const user = await interaction.options.getUser('user').fetch().catch(() => interaction.options.getUser('user'));
    const member = await guild.members.fetch(user.id).catch(() => null);

    flushMemberActivity();
    const settings = getGuildSettings(guild.id);
    const activity = settings.memberActivity[user.id];
    const warnings = settings.warnings[user.id] ?? [];
    const notes = settings.notes[user.id] ?? [];
    const policy = warningPolicy(guild.id);
    const activeWarnings = warnings.filter(warning => Date.now() - Date.parse(warning.createdAt) < policy.windowDays * DAY_MS);
    const timedOutUntil = member?.communicationDisabledUntilTimestamp > Date.now() ? member.communicationDisabledUntilTimestamp : null;

    const embed = new EmbedBuilder()
      .setColor(timedOutUntil || activeWarnings.length >= policy.alertThreshold ? COLORS.danger : activeWarnings.length ? COLORS.warning : COLORS.primary)
      .setAuthor({ name: `${user.tag}${user.bot ? ' 🤖' : ''}`, iconURL: user.displayAvatarURL({ size: 128 }) })
      .setThumbnail(user.displayAvatarURL({ size: 256 }))
      .setTitle(t(interaction.guildId, 'cmd.info.memberInfo'));

    // Account
    const accountLines = [
      t(interaction.guildId, 'cmd.info.id', { id: user.id }),
      t(interaction.guildId, 'cmd.info.accountCreated', { discordTimestamp: discordTimestamp(user.createdTimestamp, 'D'), discordTimestamp2: discordTimestamp(user.createdTimestamp, 'R') })
    ];
    if (member) {
      accountLines.push(t(interaction.guildId, 'cmd.info.joinedServer', { discordTimestamp: discordTimestamp(member.joinedTimestamp, 'D'), discordTimestamp2: discordTimestamp(member.joinedTimestamp, 'R') }));
      if (member.nickname) accountLines.push(t(interaction.guildId, 'cmd.info.nickname', { nickname: member.nickname }));
      if (member.premiumSinceTimestamp) accountLines.push(t(interaction.guildId, 'cmd.info.boostingSince', { discordTimestamp: discordTimestamp(member.premiumSinceTimestamp, 'R') }));
    } else {
      accountLines.push(t(interaction.guildId, 'cmd.info.notInTheServer', { value: activity?.lastLeftAt ? ` — left ${discordTimestamp(activity.lastLeftAt, 'R')}` : '' }));
    }
    if (activity?.joins > 1) accountLines.push(t(interaction.guildId, 'cmd.info.joinedTimesLeft', { joins: activity.joins, leaves: activity.leaves }));
    embed.addFields({ name: t(interaction.guildId, 'cmd.info.account'), value: accountLines.join('\n') });

    if (member) {
      const roles = member.roles.cache
        .filter(role => role.id !== guild.id)
        .sort((a, b) => b.position - a.position)
        .map(role => `${role}`);
      embed.addFields({ name: t(interaction.guildId, 'cmd.info.roles', { length: roles.length }), value: truncate(roles.slice(0, 20).join(' '), 1024) || '*None*' });
    }

    // Activity
    if (activity) {
      const messages7 = sumRecent(activity.days, 7);
      const messages30 = sumRecent(activity.days, 30);
      const voice7 = sumRecent(activity.voiceDays, 7);
      const voice30 = sumRecent(activity.voiceDays, 30);
      const rank = messageRank(settings.memberActivity, user.id);
      const topChannels = Object.entries(activity.channels)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 3)
        .map(([channelId, count]) => `<#${channelId}> (${count})`)
        .join(', ');

      embed.addFields(
        {
          name: t(interaction.guildId, 'cmd.info.activity', { activityLevel: activityLevel(interaction.guildId, messages30, voice30) }),
          value:
            t(interaction.guildId, 'cmd.info.messages7d30dTotal', { messages7, messages30, messages: activity.messages, formatMinutes: formatMinutes(interaction.guildId, voice7), formatMinutes2: formatMinutes(interaction.guildId, voice30), formatMinutes3: formatMinutes(interaction.guildId, activity.voiceMinutes), value: activity.lastMessageAt ? discordTimestamp(activity.lastMessageAt, 'R') : t(interaction.guildId, 'cmd.info.never'), value2: rank ? t(interaction.guildId, 'cmd.info.rank', { position: rank.position, total: rank.total }) : '', value3: topChannels ? t(interaction.guildId, 'cmd.info.favouriteChannels', { channels: topChannels }) : '' })
        }
      );
    } else {
      embed.addFields({ name: t(interaction.guildId, 'cmd.info.activity2'), value: t(interaction.guildId, 'cmd.info.noActivityRecordedYet') });
    }

    // Moderation
    const moderationLines = [
      t(interaction.guildId, 'cmd.info.warningsActiveAlertAt', { length: activeWarnings.length, alertThreshold: policy.alertThreshold, length2: warnings.length }),
      ...warnings
        .slice(-3)
        .reverse()
        .map(warning => t(interaction.guildId, 'cmd.info.text', { id: warning.id, discordTimestamp: discordTimestamp(warning.createdAt, 'R'), truncate: truncate(warning.reason, 120) }))
    ];
    if (timedOutUntil) moderationLines.push(t(interaction.guildId, 'cmd.info.timedOutUntil', { discordTimestamp: discordTimestamp(timedOutUntil, 'F') }));
    if (settings.verification && member) {
      moderationLines.push(member.roles.cache.has(settings.verification.roleId) ? t(interaction.guildId, 'cmd.info.verified') : t(interaction.guildId, 'cmd.info.notVerified'));
    }
    embed.addFields({ name: t(interaction.guildId, 'cmd.info.moderation'), value: moderationLines.join('\n') });

    // Contributions (showcase)
    const wins = settings.showcaseWins[user.id] ?? 0;
    embed.addFields({
      name: t(interaction.guildId, 'cmd.info.contributions'),
      value: t(interaction.guildId, 'cmd.info.showcaseWins', { title: showcaseWords(guild.id).title, wins, value: wins === 1 ? '' : 's' })
    });

    // Private notes
    if (notes.length) {
      embed.addFields({
        name: t(interaction.guildId, 'cmd.info.notes', { length: notes.length }),
        value: truncate(
          notes
            .slice(-5)
            .reverse()
            .map(note => `**#${note.id}** ${discordTimestamp(note.createdAt, 'd')} — ${note.text}`)
            .join('\n'),
          1024
        )
      });
    }

    embed.setFooter({
      text: t(interaction.guildId, 'cmd.info.activityCountedSinceOnly', { footer: brand(guild.id).footer, value: settings.memberActivitySince ? new Date(settings.memberActivitySince).toISOString().slice(0, 10) : 'today' })
    });

    return interaction.reply({ embeds: [embed], allowedMentions: { parse: [] }, flags: MessageFlags.Ephemeral });
  }
};
