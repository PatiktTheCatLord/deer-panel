import http from 'node:http';
import crypto from 'node:crypto';
import { HttpError, ownerId, readJson } from './http.js';
import memberRoutes from './routes/members.js';
import discordRoutes from './routes/discord.js';
import settingsRoutes from './routes/settings.js';
import statsRoutes from './routes/stats.js';
import moderationRoutes from './routes/moderation.js';
import contentRoutes from './routes/content.js';
import communityRoutes from './routes/community.js';
import streamRoutes from './routes/streams.js';
import permissionRoutes from './routes/permissions.js';
import addonRoutes from './routes/addons.js';

// Admin API for the owner's desktop panel.
// Listens on 127.0.0.1 only (the panel reaches it through an SSH tunnel) and needs ADMIN_API_TOKEN.
const PORT = Number(process.env.ADMIN_API_PORT) || 7410;
const TOKEN = process.env.ADMIN_API_TOKEN ?? '';

// Each route: [method, path pattern, handler(context)]. Named groups in the pattern become context.params.
const ROUTES = [
  ...memberRoutes,
  ...discordRoutes,
  ...moderationRoutes,
  ...contentRoutes,
  ...settingsRoutes,
  ...communityRoutes,
  ...streamRoutes,
  ...permissionRoutes,
  ...addonRoutes,
  ...statsRoutes
];

function authorized(request) {
  const given = Buffer.from((request.headers.authorization ?? '').replace(/^Bearer /, ''));
  const expected = Buffer.from(TOKEN);
  return given.length === expected.length && crypto.timingSafeEqual(given, expected);
}

async function route(client, request, url) {
  const guild = client.guilds.cache.get(process.env.GUILD_ID) ?? client.guilds.cache.first();
  if (!guild) throw new HttpError(503, 'Bot is not in a server');

  for (const [method, pattern, handler] of ROUTES) {
    if (method !== request.method) continue;
    const match = url.pathname.match(pattern);
    if (!match) continue;
    return handler({
      client,
      guild,
      url,
      params: match.groups ?? {},
      actorId: ownerId(guild),
      body: () => readJson(request)
    });
  }
  throw new HttpError(404, 'Not found');
}

export function startAdminApi(client) {
  if (TOKEN.length < 32) {
    console.log('[ADMIN] ADMIN_API_TOKEN is not set (min. 32 characters) — desktop panel API is off.');
    return null;
  }

  const server = http.createServer(async (request, response) => {
    const send = (status, payload) => {
      response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      response.end(JSON.stringify(payload ?? {}));
    };

    if (!authorized(request)) return send(401, { error: 'Unauthorized' });
    try {
      const url = new URL(request.url, 'http://localhost');
      send(200, await route(client, request, url));
    } catch (error) {
      if (!(error instanceof HttpError)) console.error('[ADMIN] Request failed:', error);
      send(error.status ?? 500, { error: error instanceof HttpError ? error.message : 'Internal error' });
    }
  });

  server.on('error', error => console.error('[ADMIN] API server error:', error.message));
  server.listen(PORT, '127.0.0.1', () => console.log(`[ADMIN] Desktop panel API listening on 127.0.0.1:${PORT}.`));
  return server;
}
