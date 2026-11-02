import { getGuildSettings } from '../../utils/storage.js';
import { BOT_CONFIG_FIELDS, getBotConfig, updateBotConfig } from '../../utils/botConfig.js';
import { nextPickSlot, runPetOfTheWeek, showcaseCandidates } from '../../utils/showcase.js';
import { buildWeeklyReport, nextReportSlot, sendWeeklyReport } from '../../utils/stats.js';
import { HttpError } from '../http.js';

// Showcase winner of the week, the weekly staff report and the bot's adjustable values.

async function showcase({ guild }) {
  const settings = getGuildSettings(guild.id);
  const channel = settings.showcaseChannelId ? guild.channels.cache.get(settings.showcaseChannelId) : null;
  if (!channel) return { configured: false, candidates: [], nextPick: null, lastWinnerId: settings.showcaseLastWinnerId };
  const candidates = await showcaseCandidates(channel);
  return {
    configured: true,
    nextPick: nextPickSlot(guild.id).toISOString(),
    lastWinnerId: settings.showcaseLastWinnerId,
    lastWinnerName: guild.members.cache.get(settings.showcaseLastWinnerId)?.displayName ?? null,
    candidates: candidates.slice(0, 12).map(({ message, hearts }) => {
      const media = message.attachments.find(item => item.contentType?.startsWith('image/') || item.contentType?.startsWith('video/'));
      return {
        id: message.id,
        url: message.url,
        hearts,
        authorName: message.member?.displayName ?? message.author.username,
        createdAt: message.createdAt.toISOString(),
        image: media?.contentType?.startsWith('image/') ? media.url : null
      };
    })
  };
}

async function pick({ guild }) {
  if (!getGuildSettings(guild.id).showcaseChannelId) throw new HttpError(400, 'The showcase is not set up');
  const result = await runPetOfTheWeek(guild);
  console.log('[ADMIN] Showcase winner picked by hand (panel).');
  return { result };
}

function report({ guild }) {
  return {
    embed: buildWeeklyReport(guild).toJSON(),
    configured: Boolean(getGuildSettings(guild.id).statsChannelId),
    nextReport: nextReportSlot(guild.id).toISOString()
  };
}

async function sendReport({ guild }) {
  if (!(await sendWeeklyReport(guild))) throw new HttpError(400, 'The weekly report channel is not set up');
  console.log('[ADMIN] Weekly report sent by hand (panel).');
  return { ok: true };
}

function config({ guild }) {
  return { values: getBotConfig(guild.id), fields: BOT_CONFIG_FIELDS };
}

async function saveConfig({ guild, body }) {
  const changes = await body();
  try {
    const values = updateBotConfig(guild.id, changes);
    console.log(`[ADMIN] Bot config changed: ${Object.keys(changes).join(', ')} (panel).`);
    return { values, fields: BOT_CONFIG_FIELDS };
  } catch (error) {
    throw new HttpError(400, error.message);
  }
}

export default [
  ['GET', /^\/api\/showcase$/, showcase],
  ['POST', /^\/api\/showcase\/pick$/, pick],
  ['GET', /^\/api\/report$/, report],
  ['POST', /^\/api\/report\/send$/, sendReport],
  ['GET', /^\/api\/botconfig$/, config],
  ['PATCH', /^\/api\/botconfig$/, saveConfig]
];
