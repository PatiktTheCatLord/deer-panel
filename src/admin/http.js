// Small helpers shared by the admin API routes.
const MAX_BODY = 20_000;

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export async function readJson(request) {
  let body = '';
  for await (const chunk of request) {
    body += chunk;
    if (body.length > MAX_BODY) throw new HttpError(413, 'Request too large');
  }
  try {
    return body ? JSON.parse(body) : {};
  } catch {
    throw new HttpError(400, 'Invalid JSON');
  }
}

// The member the panel acts as (shown in the mod log, embeds and notes).
export function ownerId(guild) {
  return (process.env.OWNER_IDS ?? '').split(',').map(id => id.trim()).find(Boolean) || guild.ownerId;
}

export function requireText(value, label, max, { required = true } = {}) {
  const clean = typeof value === 'string' ? value.trim() : '';
  if (required && !clean) throw new HttpError(400, `${label} is required`);
  if (clean.length > max) throw new HttpError(400, `${label} can be at most ${max} characters`);
  return clean || null;
}
