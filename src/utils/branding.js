import { DEFAULT_SHOWCASE_WORDS } from '../config.js';
import { getGuildSettings, updateGuildSettings } from './storage.js';

// The community name and embed footer, per server (set in the panel; see prepareGuild for the defaults).
export function brand(guildId) {
  const settings = getGuildSettings(guildId);
  const name = settings.brandName ?? 'Community';
  return { name, footer: settings.brandFooter ?? name };
}

// Showcase wording: what members post (singular, e.g. "creation") and the weekly winner's title.
export function showcaseWords(guildId) {
  const settings = getGuildSettings(guildId);
  const item = settings.showcaseItem ?? DEFAULT_SHOWCASE_WORDS.item;
  return { item, Item: item.charAt(0).toUpperCase() + item.slice(1), title: settings.showcaseTitle ?? DEFAULT_SHOWCASE_WORDS.title };
}

// Runs on startup and when the bot joins a server, once per server: the server name becomes the brand.
// Showcase wording and the welcome text stay empty, so the general defaults apply until set in the panel.
export function prepareGuild(guild) {
  const settings = getGuildSettings(guild.id);
  if (settings.preparedAt) return false;
  const updates = {
    brandName: settings.brandName ?? guild.name,
    brandFooter: settings.brandFooter ?? guild.name,
    preparedAt: new Date().toISOString()
  };
  updateGuildSettings(guild.id, updates);
  console.log(`[SETUP] Prepared ${guild.name}: brand "${updates.brandName}".`);
  return true;
}
