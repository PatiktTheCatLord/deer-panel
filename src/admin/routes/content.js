import { ChannelType, EmbedBuilder } from 'discord.js';
import { COLORS, MAX_SELF_ROLES } from '../../config.js';
import { getGuildSettings, updateGuildSettings } from '../../utils/storage.js';
import { formatPermissionList, missingChannelPermissions } from '../../utils/helpers.js';
import { roleAssignProblem } from '../../utils/members.js';
import { getRules, updateRule } from '../../utils/rules.js';
import { CUSTOM_EMOJI, UNICODE_EMOJI, refreshPanel } from '../../commands/roles.js';
import { HttpError, requireText } from '../http.js';

// Rules editor, role panel editor, messages and polls sent as the bot.
const TEXT_TYPES = [ChannelType.GuildText, ChannelType.GuildAnnouncement];

async function asBadRequest(fn) {
  try {
    return await fn();
  } catch (error) {
    throw new HttpError(400, error.message);
  }
}

function textChannel(guild, channelId) {
  const channel = guild.channels.cache.get(channelId);
  if (!channel || !TEXT_TYPES.includes(channel.type)) throw new HttpError(400, 'Pick a text channel');
  const missing = missingChannelPermissions(channel, ['ViewChannel', 'SendMessages', 'EmbedLinks']);
  if (missing.length) throw new HttpError(400, `The bot is missing ${formatPermissionList(missing).replace(/`/g, '')} in #${channel.name}`);
  return channel;
}

// ---------- rules ----------

const rules = ({ guild }) => asBadRequest(() => getRules(guild));

async function saveRule({ guild, params, body }) {
  const data = await body();
  const result = await asBadRequest(() => updateRule(guild, params.id, data));
  console.log(`[ADMIN] Rule message ${params.id} edited (panel).`);
  return result;
}

// ---------- role panel ----------

function rolePanel({ guild }) {
  const settings = getGuildSettings(guild.id);
  return {
    roles: settings.selfRoles.map(entry => {
      const role = guild.roles.cache.get(entry.roleId);
      return { ...entry, roleName: role?.name ?? null, problem: role ? roleAssignProblem(role, guild.members.me) : 'role was deleted' };
    }),
    panel: settings.rolePanel
      ? { channelId: settings.rolePanel.channelId, url: `https://discord.com/channels/${guild.id}/${settings.rolePanel.channelId}/${settings.rolePanel.messageId}` }
      : null,
    max: MAX_SELF_ROLES
  };
}

async function saveRoles(guild, change) {
  updateGuildSettings(guild.id, change);
  await refreshPanel(guild);
  return rolePanel({ guild });
}

async function addPanelRole({ guild, body }) {
  const data = await body();
  const role = guild.roles.cache.get(data.roleId);
  if (!role) throw new HttpError(400, 'Pick a role');
  const problem = roleAssignProblem(role, guild.members.me);
  if (problem) throw new HttpError(400, `@${role.name} can't be used: ${problem.replace(/`/g, '')}`);
  const emoji = requireText(data.emoji ?? '', 'Emoji', 64, { required: false });
  if (emoji && !CUSTOM_EMOJI.test(emoji) && !UNICODE_EMOJI.test(emoji)) throw new HttpError(400, 'That emoji is not valid');
  const entry = {
    roleId: role.id,
    label: requireText(data.label ?? '', 'Label', 80, { required: false }) ?? role.name.slice(0, 80),
    emoji,
    description: requireText(data.description ?? '', 'Description', 100, { required: false })
  };
  const settings = getGuildSettings(guild.id);
  const exists = settings.selfRoles.some(item => item.roleId === role.id);
  if (!exists && settings.selfRoles.length >= MAX_SELF_ROLES) throw new HttpError(400, `The panel can hold at most ${MAX_SELF_ROLES} roles`);
  return saveRoles(guild, current => {
    const index = current.selfRoles.findIndex(item => item.roleId === role.id);
    if (index === -1) current.selfRoles.push(entry);
    else current.selfRoles[index] = entry;
  });
}

async function removePanelRole({ guild, params }) {
  if (!getGuildSettings(guild.id).selfRoles.some(item => item.roleId === params.id)) throw new HttpError(404, 'That role is not on the panel');
  return saveRoles(guild, current => {
    current.selfRoles = current.selfRoles.filter(item => item.roleId !== params.id);
  });
}

async function orderPanelRoles({ guild, body }) {
  const { roleIds } = await body();
  const current = getGuildSettings(guild.id).selfRoles;
  if (!Array.isArray(roleIds) || roleIds.length !== current.length || !current.every(item => roleIds.includes(item.roleId))) {
    throw new HttpError(400, 'The new order must contain every panel role once');
  }
  return saveRoles(guild, settings => {
    settings.selfRoles = roleIds.map(id => settings.selfRoles.find(item => item.roleId === id));
  });
}

// ---------- messages and polls as the bot ----------

async function say({ guild, body }) {
  const data = await body();
  const channel = textChannel(guild, data.channelId);
  const content = requireText(data.content ?? '', 'Message', 2000, { required: false });
  const embedTitle = requireText(data.embedTitle ?? '', 'Embed title', 256, { required: false });
  const embedText = requireText(data.embedText ?? '', 'Embed text', 4000, { required: false });
  if (!content && !embedTitle && !embedText) throw new HttpError(400, 'Write a message or an embed');

  const embeds = embedTitle || embedText
    ? [new EmbedBuilder().setColor(COLORS.primary).setTitle(embedTitle || null).setDescription(embedText || null)]
    : [];
  // Never pings anyone: mentions in the text are shown but not notified.
  const message = await channel.send({ content: content || undefined, embeds, allowedMentions: { parse: [] } });
  console.log(`[ADMIN] Message sent as the bot in #${channel.name} (panel).`);
  return { url: message.url };
}

async function poll({ guild, body }) {
  const data = await body();
  const channel = textChannel(guild, data.channelId);
  const question = requireText(data.question, 'Question', 300);
  const answers = (Array.isArray(data.answers) ? data.answers : []).map(answer => (typeof answer === 'string' ? answer.trim() : '')).filter(Boolean);
  if (answers.length < 2 || answers.length > 10) throw new HttpError(400, 'A poll needs 2 to 10 answers');
  if (answers.some(answer => answer.length > 55)) throw new HttpError(400, 'Answers can be at most 55 characters');
  const hours = Number(data.hours ?? 24);
  if (!Number.isInteger(hours) || hours < 1 || hours > 768) throw new HttpError(400, 'Duration must be 1 to 768 hours (32 days)');

  const message = await channel.send({
    poll: { question: { text: question }, answers: answers.map(text => ({ text })), duration: hours, allowMultiselect: Boolean(data.multiple) }
  });
  console.log(`[ADMIN] Poll "${question}" posted in #${channel.name} (panel).`);
  return { url: message.url };
}

export default [
  ['GET', /^\/api\/rules$/, rules],
  ['PUT', /^\/api\/rules\/(?<id>\d{17,20})$/, saveRule],
  ['GET', /^\/api\/rolepanel$/, rolePanel],
  ['POST', /^\/api\/rolepanel\/roles$/, addPanelRole],
  ['DELETE', /^\/api\/rolepanel\/roles\/(?<id>\d{17,20})$/, removePanelRole],
  ['POST', /^\/api\/rolepanel\/order$/, orderPanelRoles],
  ['POST', /^\/api\/say$/, say],
  ['POST', /^\/api\/poll$/, poll]
];
