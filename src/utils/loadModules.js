import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const SRC_DIR = path.resolve(path.dirname(__filename), '..');

// Imports every .js file in src/<folder> and returns their default exports.
export async function loadModules(folder) {
  const dir = path.join(SRC_DIR, folder);
  const files = fs.readdirSync(dir).filter(file => file.endsWith('.js'));
  const modules = [];

  for (const file of files) {
    const mod = await import(pathToFileURL(path.join(dir, file)).href);
    modules.push({ file, value: mod.default });
  }
  return modules;
}

export async function loadCommands() {
  const commands = [];
  for (const { file, value } of await loadModules('commands')) {
    if (value && 'data' in value && 'execute' in value) {
      commands.push(value);
    } else {
      console.warn(`[WARN] The command at ${file} is missing required 'data' or 'execute' properties.`);
    }
  }
  return commands;
}
