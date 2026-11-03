import { ChannelType } from 'discord.js';
import {
  MAX_FAQS,
  MOD_LOG_CHANNEL_PERMISSIONS,
  SHOWCASE_CHANNEL_PERMISSIONS,
  WELCOME_CHANNEL_PERMISSIONS
} from '../../config.js';
import { getGuildSettings, updateGuildSettings } from '../../utils/storage.js';
import { formatPermissionList, missingChannelPermissions } from '../../utils/helpers.js';
import { roleAssignProblem } from '../../utils/members.js';
import { resetActivity } from '../../utils/stats.js';
import { MODULES, PER_SERVER_COMMANDS, getModules, setModules, syncGuildCommands } from '../../utils/modules.js';
import { HttpError, requireText } from '../http.js';
import { DEFAULT_LANGUAGE, LANGUAGES } from '../../i18n.js';

const BASIC = ['ViewChannel', 'SendMessages', 'EmbedLinks'];

// Settings the panel may change, with the same checks as the slash commands.
const CHANNEL_SETTINGS = {
  welcomeChannelId: WELCOME_CHANNEL_PERMISSIONS,
  showcaseChannelId: SHOWCASE_CHANNEL_PERMISSIONS,
  modLogChannelId: MOD_LOG_CHANNEL_PERMISSIONS,
  statsChannelId: BASIC,
  staffAlertChannelId: BASIC
};
// Roles that only have to exist (the bot pings them, it does not give them).
const PING_ROLE_SETTINGS = ['staffRoleId'];
const ROLE_SETTINGS = ['autoRoleId', 'showcaseRoleId'];
const TEXT_SETTINGS = { welcomeMessage: 1500, brandName: 60, brandFooter: 100, showcaseItem: 30, showcaseTitle: 40 };
const KEYS = ['language', ...Object.keys(CHANNEL_SETTINGS), ...ROLE_SETTINGS, ...PING_ROLE_SETTINGS, ...Object.keys(TEXT_SETTINGS)];

function get({ guild }) {
  const settings = getGuildSettings(guild.id);
  return {
    ...Object.fromEntries(KEYS.map(key => [key, settings[key] ?? null])),
    language: settings.language ?? DEFAULT_LANGUAGE,
    languages: LANGUAGES
  };
}

async function update({ guild, body }) {
  const changes = await body();
  const before = getGuildSettings(guild.id);
  const updates = {};

  for (const [key, value] of Object.entries(changes)) {
    if (!KEYS.includes(key)) throw new HttpError(400, `Unknown setting: ${key}`);
    if (value === null || value === '') {
      updates[key] = null;
      continue;
    }
    if (key === 'language') {
      if (!LANGUAGES[value]) throw new HttpError(400, 'Unknown language');
    } else if (CHANNEL_SETTINGS[key]) {
      const channel = guild.channels.cache.get(value);
      if (!channel || ![ChannelType.GuildText, ChannelType.GuildAnnouncement].includes(channel.type)) throw new HttpError(400, 'Pick a text channel');
      const missing = missingChannelPermissions(channel, CHANNEL_SETTINGS[key]);
      if (missing.length) throw new HttpError(400, `The bot is missing ${formatPermissionList(missing).replace(/`/g, '')} in #${channel.name}`);
    } else if (PING_ROLE_SETTINGS.includes(key)) {
      if (!guild.roles.cache.has(value)) throw new HttpError(400, 'That role no longer exists');
    } else if (ROLE_SETTINGS.includes(key)) {
      const role = guild.roles.cache.get(value);
      if (!role) throw new HttpError(400, 'That role no longer exists');
      const problem = roleAssignProblem(role, guild.members.me);
      if (problem) throw new HttpError(400, `@${role.name} can't be used: ${problem.replace(/`/g, '')}`);
    } else {
      updates[key] = requireText(value, 'Text', TEXT_SETTINGS[key]);
      continue;
    }
    updates[key] = value;
  }

  // Same side effects as /showcase setup and /stats setup when they are switched on for the first time.
  if (updates.showcaseChannelId && !before.showcaseChannelId) updates.showcaseSince = new Date().toISOString();
  updateGuildSettings(guild.id, updates);
  if (updates.statsChannelId && !before.statsChannelId) resetActivity(guild.id);

  console.log(`[ADMIN] Settings changed from the panel: ${Object.keys(changes).join(', ')}.`);
  return get({ guild });
}

// ---------- modules ----------

const moduleList = guild => ({
  modules: Object.entries(MODULES).map(([key, module]) => ({ key, label: module.label, description: module.description, commands: module.commands, requires: module.requires ?? [], addon: module.addon ?? null, enabled: getModules(guild.id)[key] })),
  perServerCommands: PER_SERVER_COMMANDS
});

async function saveModules({ guild, body }) {
  const changes = await body();
  try {
    setModules(guild.id, changes);
  } catch (error) {
    throw new HttpError(400, error.message);
  }
  console.log(`[ADMIN] Modules changed from the panel: ${Object.entries(changes).map(([key, on]) => `${key} ${on ? 'on' : 'off'}`).join(', ')}.`);
  // The new command list shows up in Discord right away.
  if (PER_SERVER_COMMANDS) await syncGuildCommands(guild).catch(error => console.error('[MODULES] Command sync failed:', error.message));
  return moduleList(guild);
}

// ---------- FAQ ----------

function faqs({ guild }) {
  return Object.entries(getGuildSettings(guild.id).faqs).map(([id, faq]) => ({ id: Number(id), ...faq }));
}

async function cleanFaq(guild, body, editId) {
  const data = await body();
  const question = requireText(data.question, 'Question', 100);
  const answer = requireText(data.answer, 'Answer', 2000);
  const duplicate = Object.entries(getGuildSettings(guild.id).faqs).some(
    ([id, faq]) => id !== String(editId) && faq.question.toLowerCase() === question.toLowerCase()
  );
  if (duplicate) throw new HttpError(400, 'An entry with this question already exists');
  return { question, answer };
}

async function addFaq({ guild, body }) {
  if (Object.keys(getGuildSettings(guild.id).faqs).length >= MAX_FAQS) throw new HttpError(400, `The FAQ is full (${MAX_FAQS} entries)`);
  const { question, answer } = await cleanFaq(guild, body);
  let id;
  updateGuildSettings(guild.id, settings => {
    id = settings.nextFaqId;
    settings.faqs[id] = { question, answer, uses: 0 };
    settings.nextFaqId += 1;
  });
  return { id };
}

async function editFaq({ guild, params, body }) {
  if (!getGuildSettings(guild.id).faqs[params.id]) throw new HttpError(404, 'FAQ entry not found');
  const { question, answer } = await cleanFaq(guild, body, params.id);
  updateGuildSettings(guild.id, settings => {
    Object.assign(settings.faqs[params.id], { question, answer });
  });
  return { ok: true };
}

function deleteFaq({ guild, params }) {
  if (!getGuildSettings(guild.id).faqs[params.id]) throw new HttpError(404, 'FAQ entry not found');
  updateGuildSettings(guild.id, settings => {
    delete settings.faqs[params.id];
  });
  return { ok: true };
}

export default [
  ['GET', /^\/api\/modules$/, ({ guild }) => moduleList(guild)],
  ['PATCH', /^\/api\/modules$/, saveModules],
  ['GET', /^\/api\/settings$/, get],
  ['PATCH', /^\/api\/settings$/, update],
  ['GET', /^\/api\/faqs$/, faqs],
  ['POST', /^\/api\/faqs$/, addFaq],
  ['PUT', /^\/api\/faqs\/(?<id>\d+)$/, editFaq],
  ['DELETE', /^\/api\/faqs\/(?<id>\d+)$/, deleteFaq]
];
