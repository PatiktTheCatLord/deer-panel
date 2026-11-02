import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  InteractionContextType,
  MessageFlags
} from 'discord.js';
import {
  COLORS,
  MOD_LOG_CHANNEL_PERMISSIONS,
  REQUIRED_BOT_PERMISSIONS,
  SHOWCASE_CHANNEL_PERMISSIONS,
  WELCOME_CHANNEL_PERMISSIONS
} from '../config.js';
import { getGuildSettings } from '../utils/storage.js';
import { formatPermissionList, missingChannelPermissions } from '../utils/helpers.js';
import { roleAssignProblem } from '../utils/members.js';
import { brand } from '../utils/branding.js';
import { showcaseWords } from '../utils/branding.js';
import { t } from '../i18n.js';

const OK = '✅';
const WARN = '⚠️';
const OFF = '⬜';

// Each check returns { status, text, problems[] } for one system.
function checkChannel(guild, channelId, permissions, label) {
  if (!channelId) return { status: OFF, text: t(guild.id, 'cmd.setup.notConfigured'), problems: [] };
  const channel = guild.channels.cache.get(channelId);
  if (!channel) return { status: WARN, text: t(guild.id, 'cmd.setup.channelDeleted'), problems: [t(guild.id, 'cmd.setup.theChannelWasDeleted', { label })] };
  const missing = missingChannelPermissions(channel, permissions);
  if (missing.length) {
    return { status: WARN, text: `${channel}`, problems: [t(guild.id, 'cmd.setup.missingIn', { label, formatPermissionList: formatPermissionList(missing), channel })] };
  }
  return { status: OK, text: `${channel}`, problems: [] };
}

function checkRole(guild, roleId, label) {
  const role = guild.roles.cache.get(roleId);
  if (!role) return [t(guild.id, 'cmd.setup.theRoleWasDeleted', { label })];
  const problem = roleAssignProblem(role, guild.members.me);
  return problem ? [t(guild.id, 'cmd.setup.text', { label, role, problem })] : [];
}

function merge(...results) {
  const problems = results.flatMap(result => result.problems);
  const status = results.some(result => result.status === WARN) || problems.length
    ? WARN
    : results.every(result => result.status === OFF) ? OFF : OK;
  return { status, problems };
}

function runChecks(guild) {
  const s = getGuildSettings(guild.id);
  const systems = [];

  const welcome = checkChannel(guild, s.welcomeChannelId, WELCOME_CHANNEL_PERMISSIONS, 'Welcome');
  systems.push({ name: t(guild.id, 'cmd.setup.welcome'), ...welcome, cmd: '/welcome setup' });

  const autoProblems = s.autoRoleId ? checkRole(guild, s.autoRoleId, 'Auto-role') : [];
  systems.push({
    name: t(guild.id, 'cmd.setup.autoRole'),
    status: !s.autoRoleId ? OFF : autoProblems.length ? WARN : OK,
    text: s.autoRoleId ? `<@&${s.autoRoleId}>` : t(guild.id, 'cmd.setup.notConfigured2'),
    problems: autoProblems,
    cmd: '/autorole setup'
  });

  const verification = s.verification
    ? merge(checkChannel(guild, s.verification.channelId, ['ViewChannel', 'SendMessages', 'EmbedLinks'], 'Verification'), {
        status: OK,
        problems: checkRole(guild, s.verification.roleId, 'Verification')
      })
    : { status: OFF, problems: [] };
  systems.push({
    name: t(guild.id, 'cmd.setup.verification'),
    ...verification,
    text: s.verification ? t(guild.id, 'cmd.setup.in', { roleId: s.verification.roleId, channelId: s.verification.channelId }) : t(guild.id, 'cmd.setup.notConfigured3'),
    cmd: '/verify setup'
  });

  const panelProblems = s.selfRoles.flatMap(entry => checkRole(guild, entry.roleId, 'Role panel'));
  if (s.selfRoles.length && !s.rolePanel) panelProblems.push(t(guild.id, 'cmd.setup.rolePanelRolesAre'));
  systems.push({
    name: t(guild.id, 'cmd.setup.rolePanel'),
    status: !s.selfRoles.length ? OFF : panelProblems.length ? WARN : OK,
    text: s.selfRoles.length ? t(guild.id, 'cmd.setup.roleS', { length: s.selfRoles.length, value: s.rolePanel ? ` · <#${s.rolePanel.channelId}>` : '' }) : t(guild.id, 'cmd.setup.notConfigured4'),
    problems: panelProblems,
    cmd: '/roles add'
  });

  const showcase = checkChannel(guild, s.showcaseChannelId, SHOWCASE_CHANNEL_PERMISSIONS, 'Showcase');
  if (s.showcaseChannelId && s.showcaseRoleId) showcase.problems.push(...checkRole(guild, s.showcaseRoleId, `${showcaseWords(guild.id).title} role`));
  systems.push({ name: t(guild.id, 'cmd.setup.showcase', { Item: showcaseWords(guild.id).Item }), ...merge(showcase), text: showcase.text, cmd: '/showcase setup' });

  const modlog = checkChannel(guild, s.modLogChannelId, MOD_LOG_CHANNEL_PERMISSIONS, 'Mod log');
  const modChannel = guild.channels.cache.get(s.modLogChannelId);
  if (modChannel?.permissionsFor(guild.roles.everyone)?.has(PermissionFlagsBits.ViewChannel)) {
    modlog.problems.push(t(guild.id, 'cmd.setup.modLogIsVisible', { modChannel }));
  }
  systems.push({ name: t(guild.id, 'cmd.setup.modLog'), ...merge(modlog), text: modlog.text, cmd: '/modlog setup' });

  const stats = checkChannel(guild, s.statsChannelId, ['ViewChannel', 'SendMessages', 'EmbedLinks'], 'Weekly report');
  systems.push({ name: t(guild.id, 'cmd.setup.weeklyReport'), ...stats, cmd: '/stats setup' });

  const faqCount = Object.keys(s.faqs).length;
  systems.push({ name: t(guild.id, 'cmd.setup.faq'), status: faqCount ? OK : OFF, text: t(guild.id, 'cmd.setup.entr', { faqCount, value: faqCount === 1 ? 'y' : 'ies' }), problems: [], cmd: '/faq-manage add' });

  return systems;
}

export default {
  data: new SlashCommandBuilder()
    .setName('setup')
    .setDescription('Shows every bot system, what is configured and what still needs fixing (staff).')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setContexts(InteractionContextType.Guild),

  async execute(interaction) {
    const { guild } = interaction;
    const systems = runChecks(guild);

    const missingPermissions = REQUIRED_BOT_PERMISSIONS.filter(name => !guild.members.me.permissions.has(PermissionFlagsBits[name]));
    const problems = [
      ...(missingPermissions.length ? [t(interaction.guildId, 'cmd.setup.botIsMissingServer', { formatPermissionList: formatPermissionList(missingPermissions) })] : []),
      ...systems.flatMap(system => system.problems)
    ];
    if (guild.members.me.permissions.has(PermissionFlagsBits.Administrator)) {
      problems.push(t(interaction.guildId, 'cmd.setup.theBotHasAdministrator'));
    }

    const lines = systems.map(system => t(interaction.guildId, 'cmd.setup.text2', { status: system.status, name: system.name, text: system.text, value: system.status === OFF ? ` · \`${system.cmd}\`` : '' }));
    const configured = systems.filter(system => system.status !== OFF).length;

    const embed = new EmbedBuilder()
      .setColor(problems.length ? COLORS.warning : COLORS.success)
      .setTitle(t(interaction.guildId, 'cmd.setup.botSetupSystemsOn', { name: brand(guild.id).name, configured, length: systems.length }))
      .setDescription(lines.join('\n'))
      .addFields({
        name: problems.length ? t(interaction.guildId, 'cmd.setup.toFix', { WARN, length: problems.length }) : t(interaction.guildId, 'cmd.setup.noProblemsFound', { OK }),
        value: problems.length ? problems.slice(0, 10).map(problem => `• ${problem}`).join('\n').slice(0, 1024) : t(interaction.guildId, 'cmd.setup.everythingThatIsTurned')
      })
      .setFooter({ text: t(interaction.guildId, 'cmd.setup.workingNeedsAttentionNot', { OK, WARN, OFF }) });

    return interaction.reply({ embeds: [embed], allowedMentions: { parse: [] }, flags: MessageFlags.Ephemeral });
  }
};
