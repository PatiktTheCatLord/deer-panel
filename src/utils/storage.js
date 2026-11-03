import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, '../../data');
export const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');
// Nightly copies made by deploy/backup.sh on the server.
export const BACKUP_DIR = path.resolve(DATA_DIR, '../backups');

const DEFAULT_GUILD_SETTINGS = {
  welcomeChannelId: null,
  welcomeMessage: null,
  autoRoleId: null,
  // Self-role panel: [{ roleId, label, emoji }] and the posted panel message
  selfRoles: [],
  rolePanel: null,
  // Showcase
  showcaseChannelId: null,
  showcaseRoleId: null,
  showcaseSince: null,
  showcaseLastPickAt: null,
  showcaseLastWinnerId: null,
  // Moderation log
  modLogChannelId: null,
  // FAQ: { id: { question, answer, uses } }
  faqs: {},
  nextFaqId: 1,
  // Warnings: { userId: [{ id, reason, moderatorId, createdAt }] }
  warnings: {},
  nextWarningId: 1,
  // Verification panel: { roleId, channelId, messageId, minAccountAgeDays }
  verification: null,
  // Weekly staff report and the activity counted since the last one
  statsChannelId: null,
  statsLastReportAt: null,
  activity: null,
  // Per-member activity for /info: { userId: { messages, days, channels, voiceMinutes, voiceDays, lastMessageAt, joins, leaves, lastLeftAt } }
  memberActivity: {},
  memberActivitySince: null,
  // Private owner notes: { userId: [{ id, text, authorId, createdAt }] }
  notes: {},
  nextNoteId: 1,
  // Weekly showcase wins per user: { userId: count }
  showcaseWins: {},
  // Daily server history for the panel's charts: { 'YYYY-MM-DD': { joins, leaves, members } }
  history: {},
  // Values changed in the panel (see utils/botConfig.js)
  botConfig: {},
  // Community name in embeds (see utils/branding.js)
  brandName: null,
  brandFooter: null,
  preparedAt: null,
  // Showcase wording (see utils/branding.js → showcaseWords); null = general default
  showcaseItem: null,
  showcaseTitle: null,
  // Language of the texts members see (src/locales/<language>.json)
  language: 'en',
  // Modules switched on/off: { key: boolean }, missing = on (see utils/modules.js)
  modules: {},
  // Staff alerts (many warnings): channel + role to ping, and the alerts the panel turns into notifications
  staffAlertChannelId: null,
  staffRoleId: null,
  staffAlerts: [],
  // Bans / kicks / timeouts from the audit log: [{ type, userId, moderatorId, reason, durationMinutes?, createdAt }]
  modActions: [],
  // The bot's rule messages in the rules channel: { channelId, messageIds }
  rulesMessages: null,
  // Stream alerts (see utils/streams.js): channel, role, template, platform keys and the watched channels
  streams: null,
  // Who may use staff features (utils/permissions.js)
  permissions: null,
  // Addons' own data: { addonId: { ... } } (utils/addons.js → context.data)
  addonData: {}
};

// Ensure data directory and settings file exist
function ensureStorage() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(SETTINGS_FILE)) {
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify({}, null, 2), 'utf-8');
  }
}

function withDefaults(settings = {}) {
  return {
    ...structuredClone(DEFAULT_GUILD_SETTINGS),
    ...settings
  };
}

// Settings are read on every message, so keep the parsed file in memory.
// Only this process writes the file, so the cache is refreshed on every write.
let cache = null;

// Read all guild settings (a copy, so callers can't change the cache by accident)
export function getAllSettings() {
  if (!cache) {
    ensureStorage();
    try {
      cache = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8'));
    } catch (error) {
      console.error('Error reading settings file:', error);
      return {};
    }
  }
  return structuredClone(cache);
}

// Write to a temp file first, then swap it in, so a crash never leaves a half-written file.
function writeAllSettings(all) {
  ensureStorage();
  const tmpFile = `${SETTINGS_FILE}.tmp`;
  fs.writeFileSync(tmpFile, JSON.stringify(all, null, 2), 'utf-8');
  fs.renameSync(tmpFile, SETTINGS_FILE);
  cache = structuredClone(all);
}

// Get settings for a specific guild
export function getGuildSettings(guildId) {
  const all = getAllSettings();
  return withDefaults(all[guildId]);
}

// Update settings for a specific guild.
// `updates` is either a partial object to merge, or a function that mutates the settings in place.
export function updateGuildSettings(guildId, updates) {
  const all = getAllSettings();
  const current = withDefaults(all[guildId]);

  if (typeof updates === 'function') {
    updates(current);
    all[guildId] = current;
  } else {
    all[guildId] = { ...current, ...updates };
  }

  try {
    writeAllSettings(all);
    return all[guildId];
  } catch (error) {
    console.error(`Failed to save settings for guild (${guildId}):`, error);
    throw error;
  }
}
