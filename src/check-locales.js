// `npm run check:locales`: finds text keys used in the code that are missing from src/locales/en.json,
// keys in en.json nothing uses, and keys other languages have not translated yet. Exits with 1 on missing keys.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LANGUAGES, localeKeys } from './i18n.js';

const SRC = path.dirname(fileURLToPath(import.meta.url));
// i18n.js itself builds the _one / _other keys.
const files = fs.readdirSync(SRC, { recursive: true }).filter(file => file.endsWith('.js') && file !== 'i18n.js').map(file => path.join(SRC, file));

const used = new Set();
const dynamic = new Set(); // prefixes of keys built at runtime, e.g. `help.${key}`
for (const file of files) {
  const code = fs.readFileSync(file, 'utf8');
  for (const [, key] of code.matchAll(/\btn?\([^,()]+,\s*'([\w.]+)'/g)) used.add(key);
  for (const [, prefix] of code.matchAll(/\btn?\([^,()]+,\s*`([\w.]+)\$\{/g)) dynamic.add(prefix);
  for (const [, key] of code.matchAll(/\btn?\([^,()]+,\s*[^,()]*\?\s*'([\w.]+)'\s*:\s*'([\w.]+)'/g)) used.add(key);
  for (const [, , key] of code.matchAll(/\btn?\([^,()]+,\s*[^,()]*\?\s*'([\w.]+)'\s*:\s*'([\w.]+)'/g)) used.add(key);
}

const english = localeKeys('en');
const known = new Set(english);
// tn('x') uses x_one / x_other.
const exists = key => known.has(key) || (known.has(`${key}_one`) && known.has(`${key}_other`));
const missing = [...used].filter(key => !exists(key));
const isUsed = key => used.has(key) || used.has(key.replace(/_(one|other)$/, '')) || [...dynamic].some(prefix => key.startsWith(prefix));
const unused = english.filter(key => !isUsed(key));

console.log(`${used.size} keys used in the code, ${english.length} in en.json, ${dynamic.size} built at runtime (${[...dynamic].join(', ')}).`);
if (unused.length) console.log(`ℹ️ Not used anywhere (${unused.length}): ${unused.join(', ')}`);
for (const code of Object.keys(LANGUAGES).filter(code => code !== 'en')) {
  const translated = new Set(localeKeys(code));
  const todo = english.filter(key => !translated.has(key));
  console.log(`${LANGUAGES[code]}: ${english.length - todo.length}/${english.length} translated${todo.length ? ` (English is used for the rest)` : ''}.`);
}
if (missing.length) {
  console.error(`❌ Missing in en.json: ${missing.join(', ')}`);
  process.exit(1);
}
console.log('✅ Every text key used in the code exists in en.json.');
