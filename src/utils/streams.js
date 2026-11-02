import { ChannelType, EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import { getAllSettings, getGuildSettings, updateGuildSettings } from './storage.js';
import { formatPermissionList, missingChannelPermissions, truncate } from './helpers.js';
import { brand } from './branding.js';
import { isEnabled } from './modules.js';
import { t } from '../i18n.js';

// Stream alerts: the bot checks Kick, Twitch and YouTube channels every few minutes and posts an
// announcement (from a template the owner can change) when one goes live. Each stream is announced once.
// Twitch and Kick need a free app (Client ID + Secret), saved in the panel or in .env;
// YouTube needs nothing (the channel's /live page shows the stream while it is live).
const CHECK_INTERVAL_MS = 2 * 60 * 1000;
const MAX_STREAMERS = 25;
const TEXT_TYPES = [ChannelType.GuildText, ChannelType.GuildAnnouncement];
const COLOR = { twitch: 0x9146ff, kick: 0x53fc18, youtube: 0xff0000 };

export const PLATFORMS = {
  twitch: { label: 'Twitch', url: login => `https://www.twitch.tv/${login}` },
  kick: { label: 'Kick', url: login => `https://kick.com/${login}` },
  youtube: { label: 'YouTube', url: login => `https://www.youtube.com/${login.startsWith('UC') ? `channel/${login}` : login}` }
};

const KEY_FIELDS = {
  twitchClientId: 'TWITCH_CLIENT_ID',
  twitchClientSecret: 'TWITCH_CLIENT_SECRET',
  kickClientId: 'KICK_CLIENT_ID',
  kickClientSecret: 'KICK_CLIENT_SECRET'
};

const DEFAULT_STREAMS = {
  channelId: null,
  roleId: null,
  // null = the language file's default text, '' = left out
  template: { content: null, title: null, description: null },
  // Edit the announcement to "ended" when the stream is over
  markEnded: true,
  keys: {},
  streamers: [],
  nextStreamerId: 1
};

export function getStreamSettings(guildId) {
  const saved = getGuildSettings(guildId).streams ?? {};
  return { ...structuredClone(DEFAULT_STREAMS), ...saved, template: { ...DEFAULT_STREAMS.template, ...saved.template } };
}

function saveStreams(guildId, change) {
  updateGuildSettings(guildId, settings => {
    const streams = { ...structuredClone(DEFAULT_STREAMS), ...settings.streams };
    change(streams);
    settings.streams = streams;
  });
}

// Panel-saved keys win over .env.
function keysOf(guildId) {
  const saved = getStreamSettings(guildId).keys;
  return Object.fromEntries(Object.entries(KEY_FIELDS).map(([key, env]) => [key, saved[key] || process.env[env]?.trim() || null]));
}

export function keyStatus(guildId) {
  const keys = keysOf(guildId);
  const saved = getStreamSettings(guildId).keys;
  return {
    twitch: Boolean(keys.twitchClientId && keys.twitchClientSecret),
    kick: Boolean(keys.kickClientId && keys.kickClientSecret),
    fromEnv: Object.keys(KEY_FIELDS).filter(key => keys[key] && !saved[key])
  };
}

// ---------- platform checks ----------

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36',
  'Accept-Language': 'en-US,en;q=0.9',
  Cookie: 'SOCS=CAI; CONSENT=YES+'
};

async function request(url, options = {}) {
  const response = await fetch(url, { ...options, signal: AbortSignal.timeout(15_000) });
  if (!response.ok) {
    const error = new Error(`${new URL(url).host} answered ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return response;
}

// App access tokens (client credentials), cached until shortly before they expire.
const tokens = new Map();
async function appToken(tokenUrl, clientId, clientSecret) {
  const cacheKey = `${tokenUrl}|${clientId}`;
  const cached = tokens.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.token;
  const response = await request(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, grant_type: 'client_credentials' })
  }).catch(error => {
    throw new Error(error.status === 400 || error.status === 401 || error.status === 403 ? 'the Client ID or Secret is wrong' : error.message);
  });
  const { access_token: token, expires_in: expiresIn } = await response.json();
  tokens.set(cacheKey, { token, expiresAt: Date.now() + Math.max(60, (Number(expiresIn) || 3600) - 300) * 1000 });
  return token;
}

const list = (name, values) => values.map(value => `${name}=${encodeURIComponent(value)}`).join('&');

// Each checker gets the logins of one server and returns Map(login → live stream | null) plus a name lookup.
// A live stream: { key, title, game, viewers, thumbnail, url, name, startedAt }
const CHECKERS = {
  async twitch(logins, keys) {
    if (!keys.twitchClientId || !keys.twitchClientSecret) throw new Error('Twitch keys are missing');
    const token = await appToken('https://id.twitch.tv/oauth2/token', keys.twitchClientId, keys.twitchClientSecret);
    const headers = { 'Client-Id': keys.twitchClientId, Authorization: `Bearer ${token}` };
    const result = new Map(logins.map(login => [login, null]));
    const { data } = await (await request(`https://api.twitch.tv/helix/streams?first=100&${list('user_login', logins)}`, { headers })).json();
    for (const stream of data ?? []) {
      result.set(stream.user_login.toLowerCase(), {
        key: stream.id,
        name: stream.user_name,
        title: stream.title,
        game: stream.game_name || null,
        viewers: stream.viewer_count,
        thumbnail: stream.thumbnail_url?.replace('{width}', '1280').replace('{height}', '720') + `?t=${Date.now()}`,
        url: PLATFORMS.twitch.url(stream.user_login),
        startedAt: stream.started_at
      });
    }
    return result;
  },

  async kick(logins, keys) {
    if (!keys.kickClientId || !keys.kickClientSecret) throw new Error('Kick keys are missing');
    const token = await appToken('https://id.kick.com/oauth/token', keys.kickClientId, keys.kickClientSecret);
    const result = new Map(logins.map(login => [login, null]));
    const { data } = await (await request(`https://api.kick.com/public/v1/channels?${list('slug', logins)}`, { headers: { Authorization: `Bearer ${token}` } })).json();
    for (const channel of data ?? []) {
      if (!channel.stream?.is_live) continue;
      result.set(channel.slug.toLowerCase(), {
        key: channel.stream.start_time || channel.stream_title,
        name: channel.slug,
        title: channel.stream_title,
        game: channel.category?.name || null,
        viewers: channel.stream.viewer_count,
        thumbnail: channel.stream.thumbnail || null,
        url: PLATFORMS.kick.url(channel.slug),
        startedAt: channel.stream.start_time || null
      });
    }
    return result;
  },

  async youtube(logins) {
    const result = new Map();
    for (const login of logins) {
      const html = await (await request(`${PLATFORMS.youtube.url(login)}/live`, { headers: BROWSER_HEADERS })).text();
      const videoId = html.match(/<link rel="canonical" href="https:\/\/www\.youtube\.com\/watch\?v=([\w-]{11})"/)?.[1];
      if (!videoId || !/"isLiveNow":true/.test(html)) {
        result.set(login, null);
        continue;
      }
      const json = pattern => {
        const raw = html.match(pattern)?.[1];
        try {
          return raw ? JSON.parse(`"${raw}"`) : null;
        } catch {
          return null;
        }
      };
      result.set(login, {
        key: videoId,
        name: json(/"ownerChannelName":"((?:[^"\\]|\\.)*)"/) ?? login,
        title: json(/"videoDetails":\{"videoId":"[\w-]{11}","title":"((?:[^"\\]|\\.)*)"/) ?? json(/<meta name="title" content="([^"]*)"/),
        game: json(/"category":"((?:[^"\\]|\\.)*)"/),
        viewers: null,
        thumbnail: `https://i.ytimg.com/vi/${videoId}/maxresdefault_live.jpg`,
        url: `https://www.youtube.com/watch?v=${videoId}`,
        startedAt: json(/"startTimestamp":"([^"]+)"/)
      });
    }
    return result;
  }
};

// ---------- adding streamers ----------

// Accepts a name or a channel link and returns the login the checkers use.
export function parseChannel(platform, input) {
  const text = String(input ?? '').trim();
  if (!text) throw new Error('Enter a channel name or link');
  const path = text.replace(/^(https?:\/\/)?(www\.|m\.)?(twitch\.tv|kick\.com|youtube\.com)\//i, '').replace(/[?#].*$/, '').replace(/\/+$/, '');
  if (platform === 'youtube') {
    const channelId = path.match(/(?:^|channel\/)(UC[\w-]{22})(?:\/|$)/)?.[1];
    if (channelId) return channelId;
    const handle = path.match(/^@?([\w.-]{3,30})(?:\/|$)/)?.[1];
    if (handle && (path.startsWith('@') || !text.includes('/'))) return `@${handle}`;
    throw new Error('Enter the YouTube handle (@name) or the channel link');
  }
  const login = path.split('/')[0].toLowerCase();
  if (platform === 'twitch' && !/^[a-z0-9_]{3,25}$/.test(login)) throw new Error('A Twitch name has 3–25 letters, numbers or _');
  if (platform === 'kick' && !/^[a-z0-9_-]{3,25}$/.test(login)) throw new Error('A Kick name has 3–25 letters, numbers, _ or -');
  return login;
}

// Checks that the channel exists where it can (YouTube: the page loads; Twitch / Kick: only with keys).
async function verifyChannel(guildId, platform, login) {
  const keys = keysOf(guildId);
  if (platform === 'youtube') {
    const response = await fetch(PLATFORMS.youtube.url(login), { headers: BROWSER_HEADERS, signal: AbortSignal.timeout(15_000) }).catch(() => null);
    if (response?.status === 404) throw new Error('No YouTube channel with that name');
    const html = response?.ok ? await response.text() : '';
    return html.match(/<meta property="og:title" content="([^"]*)"/)?.[1] ?? null;
  }
  if (platform === 'twitch' && keys.twitchClientId && keys.twitchClientSecret) {
    const token = await appToken('https://id.twitch.tv/oauth2/token', keys.twitchClientId, keys.twitchClientSecret);
    const { data } = await (await request(`https://api.twitch.tv/helix/users?login=${encodeURIComponent(login)}`, { headers: { 'Client-Id': keys.twitchClientId, Authorization: `Bearer ${token}` } })).json();
    if (!data?.length) throw new Error('No Twitch channel with that name');
    return data[0].display_name;
  }
  if (platform === 'kick' && keys.kickClientId && keys.kickClientSecret) {
    const token = await appToken('https://id.kick.com/oauth/token', keys.kickClientId, keys.kickClientSecret);
    const { data } = await (await request(`https://api.kick.com/public/v1/channels?slug=${encodeURIComponent(login)}`, { headers: { Authorization: `Bearer ${token}` } })).json();
    if (!data?.length) throw new Error('No Kick channel with that name');
    return data[0].slug;
  }
  return null;
}

export async function addStreamer(guildId, { platform, channel, name }) {
  if (!PLATFORMS[platform]) throw new Error('Pick Kick, Twitch or YouTube');
  const login = parseChannel(platform, channel);
  const current = getStreamSettings(guildId).streamers;
  if (current.length >= MAX_STREAMERS) throw new Error(`At most ${MAX_STREAMERS} channels`);
  if (current.some(item => item.platform === platform && item.login.toLowerCase() === login.toLowerCase())) throw new Error('That channel is already on the list');
  const found = await verifyChannel(guildId, platform, login);
  const label = typeof name === 'string' && name.trim() ? truncate(name.trim(), 60) : found ?? login.replace(/^@/, '');
  let added;
  saveStreams(guildId, streams => {
    added = { id: streams.nextStreamerId++, platform, login, name: label, live: null, lastKey: null, error: null, addedAt: new Date().toISOString() };
    streams.streamers.push(added);
  });
  return added;
}

export function removeStreamer(guildId, id) {
  if (!getStreamSettings(guildId).streamers.some(item => item.id === id)) throw new Error('Channel not found');
  saveStreams(guildId, streams => {
    streams.streamers = streams.streamers.filter(item => item.id !== id);
  });
}

// ---------- settings ----------

const TEMPLATE_LIMITS = { content: 1000, title: 256, description: 2000 };

export function updateStreamSettings(guild, data) {
  const changes = {};
  if ('channelId' in data) {
    const channel = data.channelId ? guild.channels.cache.get(data.channelId) : null;
    if (data.channelId && (!channel || !TEXT_TYPES.includes(channel.type))) throw new Error('Pick a text or announcement channel');
    const missing = channel ? missingChannelPermissions(channel, ['ViewChannel', 'SendMessages', 'EmbedLinks']) : [];
    if (missing.length) throw new Error(`The bot can't post in #${channel.name}: missing ${formatPermissionList(missing).replace(/`/g, '')}`);
    changes.channelId = channel?.id ?? null;
  }
  if ('roleId' in data) {
    const role = data.roleId ? guild.roles.cache.get(data.roleId) : null;
    if (data.roleId && !role) throw new Error('That role no longer exists');
    changes.roleId = role?.id ?? null;
  }
  if ('markEnded' in data) changes.markEnded = Boolean(data.markEnded);
  if (data.template) {
    changes.template = {};
    for (const [key, max] of Object.entries(TEMPLATE_LIMITS)) {
      if (!(key in data.template)) continue;
      // null = back to the default text, '' = leave that part out
      const value = data.template[key];
      if (value !== null && typeof value !== 'string') throw new Error(`The ${key} must be text`);
      if (value?.length > max) throw new Error(`The ${key} can be at most ${max} characters`);
      changes.template[key] = value;
    }
  }
  saveStreams(guild.id, streams => {
    Object.assign(streams, { ...changes, template: { ...streams.template, ...changes.template } });
  });
  return getStreamSettings(guild.id);
}

// '' removes a saved key, a missing field leaves it as it is.
export function updateStreamKeys(guildId, data) {
  saveStreams(guildId, streams => {
    for (const key of Object.keys(KEY_FIELDS)) {
      if (typeof data[key] !== 'string') continue;
      const value = data[key].trim();
      if (value.length > 200) throw new Error(`${key} is too long`);
      if (value) streams.keys[key] = value;
      else delete streams.keys[key];
    }
  });
  tokens.clear();
  return keyStatus(guildId);
}

// ---------- announcing ----------

export function templateTexts(guildId) {
  const { template } = getStreamSettings(guildId);
  return {
    content: template.content ?? t(guildId, 'stream.template.content'),
    title: template.title ?? t(guildId, 'stream.template.title'),
    description: template.description ?? t(guildId, 'stream.template.description')
  };
}

const fill = (text, vars) => text.replace(/\{(\w+)\}/g, (match, name) => (name in vars ? String(vars[name] ?? '') : match));

export function streamVars(guildId, streamer, stream, role) {
  // A name the owner gave (or found when adding) wins over the platform's spelling of the login.
  const named = streamer.name && streamer.name.toLowerCase() !== streamer.login.replace(/^@/, '').toLowerCase();
  return {
    streamer: (named ? streamer.name : stream.name) || streamer.name,
    platform: PLATFORMS[streamer.platform].label,
    title: stream.title || t(guildId, 'stream.noTitle'),
    game: stream.game || t(guildId, 'stream.noGame'),
    url: stream.url,
    viewers: stream.viewers ?? '—',
    role: role ? `${role}` : ''
  };
}

export function buildStreamMessage(guild, streamer, stream, role) {
  const texts = templateTexts(guild.id);
  const vars = streamVars(guild.id, streamer, stream, role);
  const embed = new EmbedBuilder()
    .setColor(COLOR[streamer.platform])
    .setAuthor({ name: `🔴 ${vars.platform} · ${vars.streamer}`, url: stream.url })
    .setTitle(truncate(fill(texts.title, vars), 256) || null)
    .setURL(stream.url)
    .setDescription(truncate(fill(texts.description, vars), 4000) || null)
    .setFooter({ text: brand(guild.id).footer })
    .setTimestamp(stream.startedAt ? new Date(stream.startedAt) : new Date());
  if (stream.game) embed.addFields({ name: t(guild.id, 'stream.category'), value: truncate(stream.game, 1024), inline: true });
  if (stream.thumbnail) embed.setImage(stream.thumbnail);
  return {
    content: truncate(fill(texts.content, vars), 2000).trim() || undefined,
    embeds: [embed],
    allowedMentions: { roles: role ? [role.id] : [] }
  };
}

function canPingRole(channel, role) {
  return role.mentionable || channel.permissionsFor(channel.guild.members.me)?.has(PermissionFlagsBits.MentionEveryone);
}

function announceTarget(guild) {
  const settings = getStreamSettings(guild.id);
  const channel = settings.channelId ? guild.channels.cache.get(settings.channelId) : null;
  if (!channel) throw new Error('Pick the channel for stream announcements first');
  const role = settings.roleId ? guild.roles.cache.get(settings.roleId) : null;
  return { channel, role: role && canPingRole(channel, role) ? role : null };
}

// Panel → "Send a test": a made-up stream through the real template.
export async function sendTestAnnouncement(guild, streamerId) {
  const { channel, role } = announceTarget(guild);
  const settings = getStreamSettings(guild.id);
  const streamer = settings.streamers.find(item => item.id === streamerId) ?? { platform: 'twitch', login: 'example', name: 'Example' };
  const stream = {
    name: streamer.name,
    title: t(guild.id, 'stream.testTitle'),
    game: 'Just Chatting',
    viewers: 42,
    thumbnail: null,
    url: PLATFORMS[streamer.platform].url(streamer.login),
    startedAt: new Date().toISOString()
  };
  const message = await channel.send(buildStreamMessage(guild, streamer, stream, role));
  return { url: message.url };
}

async function markEnded(guild, streamer) {
  const channel = guild.channels.cache.get(streamer.live.channelId);
  const message = await channel?.messages.fetch(streamer.live.messageId).catch(() => null);
  const [embed] = message?.embeds ?? [];
  if (!embed) return;
  const ended = EmbedBuilder.from(embed)
    .setColor(0x99aab5)
    .setAuthor({ name: `⚫ ${PLATFORMS[streamer.platform].label} · ${streamer.name} — ${t(guild.id, 'stream.ended')}`, url: embed.url ?? undefined });
  await message.edit({ embeds: [ended], allowedMentions: { parse: [] } }).catch(() => {});
}

// One round for one server: ask each platform once for all its channels, announce new streams.
export async function checkGuild(guild) {
  const settings = getStreamSettings(guild.id);
  if (!settings.streamers.length) return { checked: 0, announced: 0 };
  const keys = keysOf(guild.id);
  const results = new Map(); // streamer id → { stream } | { error }
  for (const platform of Object.keys(PLATFORMS)) {
    const streamers = settings.streamers.filter(item => item.platform === platform);
    if (!streamers.length) continue;
    try {
      const live = await CHECKERS[platform](streamers.map(item => (platform === 'youtube' ? item.login : item.login.toLowerCase())), keys);
      for (const item of streamers) results.set(item.id, { stream: live.get(platform === 'youtube' ? item.login : item.login.toLowerCase()) ?? null });
    } catch (error) {
      for (const item of streamers) results.set(item.id, { error: error.message });
    }
  }

  let target = null;
  let targetError = null;
  try {
    target = announceTarget(guild);
  } catch (error) {
    targetError = error.message;
  }

  let announced = 0;
  for (const streamer of settings.streamers) {
    const result = results.get(streamer.id);
    if (!result) continue;
    const update = { error: result.error ?? null, checkedAt: new Date().toISOString() };
    const { stream } = result;

    if (stream && stream.key !== streamer.lastKey && target) {
      try {
        const message = await target.channel.send(buildStreamMessage(guild, streamer, stream, target.role));
        Object.assign(update, { lastKey: stream.key, live: { key: stream.key, title: stream.title, url: stream.url, channelId: target.channel.id, messageId: message.id, since: stream.startedAt ?? new Date().toISOString() }, lastAnnouncedAt: new Date().toISOString() });
        announced += 1;
        console.log(`[STREAMS] ${PLATFORMS[streamer.platform].label} · ${streamer.name} is live — announced in #${target.channel.name}.`);
      } catch (error) {
        update.error = `Could not post: ${error.message}`;
      }
    } else if (stream && stream.key !== streamer.lastKey) {
      update.error = targetError;
    } else if (stream && streamer.live) {
      update.live = { ...streamer.live, title: stream.title };
    } else if (!stream && !result.error && streamer.live) {
      if (settings.markEnded) await markEnded(guild, streamer);
      update.live = null;
      console.log(`[STREAMS] ${PLATFORMS[streamer.platform].label} · ${streamer.name} ended.`);
    }

    saveStreams(guild.id, streams => {
      const saved = streams.streamers.find(item => item.id === streamer.id);
      if (saved) Object.assign(saved, update);
    });
  }
  return { checked: results.size, announced };
}

let running = false;
async function checkAllGuilds(client) {
  if (running) return;
  running = true;
  try {
    for (const guildId of Object.keys(getAllSettings())) {
      const guild = client.guilds.cache.get(guildId);
      if (!guild || !isEnabled(guildId, 'streams')) continue;
      await checkGuild(guild).catch(error => console.error(`[STREAMS] Check failed for ${guild.name}:`, error.message));
    }
  } finally {
    running = false;
  }
}

export function startStreamScheduler(client) {
  checkAllGuilds(client);
  setInterval(() => checkAllGuilds(client), CHECK_INTERVAL_MS).unref();
}

export const STREAM_CHECK_MINUTES = CHECK_INTERVAL_MS / 60_000;
