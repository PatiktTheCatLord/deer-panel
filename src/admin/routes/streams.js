import {
  PLATFORMS,
  STREAM_CHECK_MINUTES,
  addStreamer,
  checkGuild,
  getStreamSettings,
  keyStatus,
  removeStreamer,
  sendTestAnnouncement,
  templateTexts,
  updateStreamKeys,
  updateStreamSettings
} from '../../utils/streams.js';
import { t } from '../../i18n.js';
import { HttpError } from '../http.js';

// Stream alerts: watched Kick / Twitch / YouTube channels, the announcement template and the platform keys.
// Keys are write-only: the panel only learns whether they are set.

async function asBadRequest(fn) {
  try {
    return await fn();
  } catch (error) {
    throw new HttpError(400, error.message);
  }
}

function overview({ guild }) {
  const settings = getStreamSettings(guild.id);
  return {
    channelId: settings.channelId,
    roleId: settings.roleId,
    markEnded: settings.markEnded,
    template: settings.template,
    texts: templateTexts(guild.id),
    defaults: {
      content: t(guild.id, 'stream.template.content'),
      title: t(guild.id, 'stream.template.title'),
      description: t(guild.id, 'stream.template.description'),
      noTitle: t(guild.id, 'stream.noTitle'),
      noGame: t(guild.id, 'stream.noGame')
    },
    keys: keyStatus(guild.id),
    checkMinutes: STREAM_CHECK_MINUTES,
    platforms: Object.fromEntries(Object.entries(PLATFORMS).map(([key, platform]) => [key, platform.label])),
    streamers: settings.streamers.map(({ id, platform, login, name, live, error, checkedAt, lastAnnouncedAt }) => ({
      id,
      platform,
      login,
      name,
      url: PLATFORMS[platform].url(login),
      live: live ? { title: live.title, url: live.url, since: live.since, messageUrl: `https://discord.com/channels/${guild.id}/${live.channelId}/${live.messageId}` } : null,
      error,
      checkedAt: checkedAt ?? null,
      lastAnnouncedAt: lastAnnouncedAt ?? null
    }))
  };
}

async function save({ guild, body }) {
  const data = await body();
  await asBadRequest(() => updateStreamSettings(guild, data));
  return overview({ guild });
}

async function saveKeys({ guild, body }) {
  const data = await body();
  const keys = await asBadRequest(() => updateStreamKeys(guild.id, data));
  console.log('[ADMIN] Stream platform keys changed (panel).');
  return { keys };
}

async function add({ guild, body }) {
  const data = await body();
  const streamer = await asBadRequest(() => addStreamer(guild.id, data));
  console.log(`[ADMIN] Watching ${PLATFORMS[streamer.platform].label} · ${streamer.name} for stream alerts (panel).`);
  return { id: streamer.id, name: streamer.name };
}

async function remove({ guild, params }) {
  await asBadRequest(() => removeStreamer(guild.id, Number(params.id)));
  return { ok: true };
}

async function test({ guild, body }) {
  const { streamerId } = await body();
  return asBadRequest(() => sendTestAnnouncement(guild, Number(streamerId) || null));
}

async function checkNow({ guild }) {
  return asBadRequest(() => checkGuild(guild));
}

export default [
  ['GET', /^\/api\/streams$/, overview],
  ['PATCH', /^\/api\/streams$/, save],
  ['PUT', /^\/api\/streams\/keys$/, saveKeys],
  ['POST', /^\/api\/streams\/streamers$/, add],
  ['DELETE', /^\/api\/streams\/streamers\/(?<id>\d+)$/, remove],
  ['POST', /^\/api\/streams\/test$/, test],
  ['POST', /^\/api\/streams\/check$/, checkNow]
];
