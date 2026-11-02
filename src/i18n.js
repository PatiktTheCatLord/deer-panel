import fs from 'node:fs';
import { getGuildSettings } from './utils/storage.js';

// Texts members see live in src/locales/<language>.json. A server picks its language in the panel
// (settings.language); missing keys fall back to English, so a translation can be partial.
// Adding a language: copy en.json, translate the values and list it here.
export const LANGUAGES = { en: 'English', tr: 'Türkçe' };
export const DEFAULT_LANGUAGE = 'en';

const load = code => JSON.parse(fs.readFileSync(new URL(`./locales/${code}.json`, import.meta.url), 'utf8'));
const LOCALES = Object.fromEntries(Object.keys(LANGUAGES).map(code => [code, load(code)]));

export function guildLanguage(guildId) {
  const language = guildId ? getGuildSettings(guildId).language : null;
  return LANGUAGES[language] ? language : DEFAULT_LANGUAGE;
}

const lookup = (table, key) => key.split('.').reduce((node, part) => (node && typeof node === 'object' ? node[part] : undefined), table);

// Unknown {placeholders} are left as they are (the welcome template fills its own later).
const fill = (text, vars) => text.replace(/\{(\w+)\}/g, (match, name) => (name in vars ? String(vars[name]) : match));

/** Text for a server: t(guildId, 'verify.done', { name }). Returns the key itself when it is missing everywhere. */
export function t(guildId, key, vars = {}) {
  const text = lookup(LOCALES[guildLanguage(guildId)], key) ?? lookup(LOCALES[DEFAULT_LANGUAGE], key);
  if (typeof text !== 'string') {
    console.warn(`[I18N] Missing text: ${key}`);
    return key;
  }
  return fill(text, vars);
}

/** Counted text: picks `<key>_one` or `<key>_other` and passes `count` along. */
export function tn(guildId, key, count, vars = {}) {
  return t(guildId, `${key}_${count === 1 ? 'one' : 'other'}`, { count, ...vars });
}

// For the check script: every key of a language as dotted paths.
export function localeKeys(code = DEFAULT_LANGUAGE) {
  const keys = [];
  const walk = (node, prefix) => {
    for (const [name, value] of Object.entries(node)) {
      if (name.startsWith('_')) continue;
      if (typeof value === 'string') keys.push(prefix + name);
      else walk(value, `${prefix}${name}.`);
    }
  };
  walk(LOCALES[code], '');
  return keys;
}
