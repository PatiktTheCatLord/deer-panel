import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { getGuildSettings, updateGuildSettings } from './storage.js';
import { MODULES, isEnabled } from './modules.js';

// Addons: features other people write, kept outside src/ so updates never touch them.
// Each one is a folder addons/<id>/ with an addon.json and an ES module (see ADDONS.md):
//   addon.json  { "id": "hello-world", "name": "Hello World", "version": "1.0.0", "description": "…", "author": "…", "main": "index.js" }
//   index.js    export default { commands: [...], events: [...] }   (or a function (context) => that object)
// Every addon becomes a module (key "addon:<id>") that can be switched off per server in the panel.
// A broken addon is skipped and listed with its error; it never stops the bot.

const SRC_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const ADDONS_DIR = path.resolve(process.env.ADDONS_DIR || path.join(SRC_DIR, '..', 'addons'));
export const ADDON_ID = /^[a-z0-9][a-z0-9-]{1,39}$/;
export const MAX_ADDONS = 50;

const loaded = []; // { id, name, version, description, author, homepage, commands, events, error }

export const addonKey = id => `addon:${id}`;
export const listAddons = () => loaded.map(addon => ({ ...addon, commands: [...addon.commands] }));

function readManifest(dir, folder) {
  const file = path.join(dir, 'addon.json');
  if (!fs.existsSync(file)) throw new Error('addon.json is missing');
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    throw new Error(`addon.json is not valid JSON: ${error.message}`);
  }
  if (manifest.id !== folder) throw new Error(`addon.json "id" must be "${folder}" (the folder name)`);
  const text = (value, max) => (typeof value === 'string' ? value.trim().slice(0, max) : '');
  const main = text(manifest.main, 100) || 'index.js';
  if (path.isAbsolute(main) || main.split(/[\\/]/).includes('..')) throw new Error('"main" must be a file inside the addon folder');
  return {
    id: folder,
    name: text(manifest.name, 60) || folder,
    version: text(manifest.version, 20),
    description: text(manifest.description, 300),
    author: text(manifest.author, 60),
    homepage: /^https?:\/\//.test(manifest.homepage ?? '') ? text(manifest.homepage, 300) : '',
    main
  };
}

// The guild an event is about, for the per-server switch; null when there is none (e.g. ClientReady).
function guildIdOf(args) {
  for (const arg of args) {
    if (!arg || typeof arg !== 'object') continue;
    if (arg.guild?.id) return arg.guild.id;
    if (typeof arg.guildId === 'string') return arg.guildId;
    if (arg.constructor?.name === 'Guild') return arg.id;
  }
  return null;
}

// What an addon gets: its own small data store per server and a logger with its name.
function contextFor(id) {
  const log = (...parts) => console.log(`[ADDON ${id}]`, ...parts);
  return {
    id,
    log,
    error: (...parts) => console.error(`[ADDON ${id}]`, ...parts),
    isEnabled: guildId => isEnabled(guildId, addonKey(id)),
    data: {
      get: guildId => structuredClone(getGuildSettings(guildId).addonData?.[id] ?? {}),
      set: (guildId, value) => updateGuildSettings(guildId, settings => {
        settings.addonData = { ...(settings.addonData ?? {}), [id]: structuredClone(value ?? {}) };
      })
    }
  };
}

async function loadOne(folder, takenCommands) {
  const dir = path.join(ADDONS_DIR, folder);
  const manifest = readManifest(dir, folder);
  const entry = path.join(dir, manifest.main);
  if (!fs.existsSync(entry)) throw new Error(`${manifest.main} is missing`);
  const mod = await import(pathToFileURL(entry).href);
  const context = contextFor(folder);
  const value = typeof mod.default === 'function' ? await mod.default(context) : mod.default;
  if (!value || typeof value !== 'object') throw new Error(`${manifest.main} must export an object (or a function that returns one)`);

  const commands = value.commands ?? [];
  const events = value.events ?? [];
  if (!Array.isArray(commands) || !Array.isArray(events)) throw new Error('"commands" and "events" must be lists');
  for (const command of commands) {
    const name = command?.data?.name;
    if (!name || typeof command.execute !== 'function') throw new Error('every command needs "data" (a SlashCommandBuilder) and "execute"');
    if (takenCommands.has(name)) throw new Error(`/${name} already exists`);
  }
  for (const event of events) {
    if (!event?.name || typeof event.execute !== 'function') throw new Error('every event needs "name" and "execute"');
  }
  return { manifest, commands, events };
}

/**
 * Loads every addon in ADDONS_DIR. `takenCommands` are the names of the bot's own commands.
 * Returns the commands and events to register; each event is wrapped so it only runs on servers
 * where the addon is on, and so an error inside it is logged instead of crashing the bot.
 */
export async function loadAddons(takenCommands) {
  loaded.length = 0;
  if (!fs.existsSync(ADDONS_DIR)) return { commands: [], events: [] };
  const taken = new Set(takenCommands);
  const folders = fs.readdirSync(ADDONS_DIR, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && !entry.name.startsWith('.'))
    .map(entry => entry.name)
    .sort();
  const commands = [];
  const events = [];

  for (const folder of folders) {
    if (loaded.length >= MAX_ADDONS) {
      console.warn(`[ADDONS] More than ${MAX_ADDONS} addons; ${folder} and the rest were skipped.`);
      break;
    }
    if (!ADDON_ID.test(folder)) {
      console.warn(`[ADDONS] Skipped "${folder}": folder names may only use a-z, 0-9 and "-" (2-40 characters).`);
      continue;
    }
    try {
      const { manifest, commands: own, events: ownEvents } = await loadOne(folder, taken);
      const key = addonKey(folder);
      MODULES[key] = { label: manifest.name, description: manifest.description, commands: own.map(command => command.data.name), addon: folder };
      for (const command of own) {
        taken.add(command.data.name);
        command.addon = folder;
        commands.push(command);
      }
      for (const event of ownEvents) {
        events.push({
          name: event.name,
          once: Boolean(event.once),
          addon: folder,
          async execute(...args) {
            const guildId = guildIdOf(args);
            if (guildId && !isEnabled(guildId, key)) return;
            try {
              await event.execute(...args);
            } catch (error) {
              console.error(`[ADDON ${folder}] Error in ${event.name}:`, error);
            }
          }
        });
      }
      const { main, ...info } = manifest;
      loaded.push({ ...info, commands: own.map(command => command.data.name), events: ownEvents.length, error: null });
      console.log(`[ADDONS] ${manifest.name}${manifest.version ? ` ${manifest.version}` : ''} loaded (${own.length} command(s), ${ownEvents.length} event(s)).`);
    } catch (error) {
      loaded.push({ id: folder, name: folder, version: '', description: '', author: '', homepage: '', commands: [], events: 0, error: error.message });
      console.error(`[ADDONS] Could not load "${folder}": ${error.message}`);
    }
  }
  return { commands, events };
}
