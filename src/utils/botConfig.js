import { SHOWCASE, STATS_REPORT, WARNINGS } from '../config.js';
import { getGuildSettings, updateGuildSettings } from './storage.js';

// Values the owner can change in the desktop panel without a deploy.
// config.js holds the defaults; changes are saved in settings.botConfig.
export const BOT_CONFIG_FIELDS = {
  warningAlertThreshold: { default: WARNINGS.threshold, min: 1, max: 20 },
  warningWindowDays: { default: WARNINGS.windowDays, min: 1, max: 365 },
  autoModWarnings: { default: true, type: 'boolean' },
  showcaseWeekday: { default: SHOWCASE.pickWeekday, min: 0, max: 6 },
  showcaseHourUtc: { default: SHOWCASE.pickHourUtc, min: 0, max: 23 },
  statsWeekday: { default: STATS_REPORT.weekday, min: 0, max: 6 },
  statsHourUtc: { default: STATS_REPORT.hourUtc, min: 0, max: 23 }
};

export function getBotConfig(guildId) {
  const saved = getGuildSettings(guildId).botConfig ?? {};
  return Object.fromEntries(Object.entries(BOT_CONFIG_FIELDS).map(([key, field]) => [key, saved[key] ?? field.default]));
}

// Validates and saves changes; throws an Error with a readable message on bad input.
export function updateBotConfig(guildId, changes) {
  const clean = {};
  for (const [key, value] of Object.entries(changes)) {
    const field = BOT_CONFIG_FIELDS[key];
    if (!field) throw new Error(`Unknown setting: ${key}`);
    if (field.type === 'boolean') {
      if (typeof value !== 'boolean') throw new Error(`${key} must be true or false`);
      clean[key] = value;
      continue;
    }
    const number = Number(value);
    if (!Number.isInteger(number) || number < field.min || number > field.max) {
      throw new Error(`${key} must be a whole number from ${field.min} to ${field.max}`);
    }
    clean[key] = number;
  }
  updateGuildSettings(guildId, settings => {
    settings.botConfig = { ...(settings.botConfig ?? {}), ...clean };
  });
  return getBotConfig(guildId);
}
