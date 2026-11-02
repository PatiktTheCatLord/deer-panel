// `npm run release`: checks the bot and packs it into releases/deer-panel-<version>-<commit>.tgz.
// The desktop panel installs such a package on a server (Bakım → Güncelle); .env and data/ are never in it.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const run = (command, args, options = {}) => spawnSync(command, args, { cwd: ROOT, encoding: 'utf8', ...options });

for (const script of ['check', 'check:locales']) {
  // npm is a .cmd file on Windows, so it runs through the shell (fixed text, no user input).
  const result = spawnSync(`npm run --silent ${script}`, { cwd: ROOT, stdio: 'inherit', shell: true });
  if (result.status !== 0) {
    console.error(`❌ npm run ${script} failed — no package was made.`);
    process.exit(1);
  }
}

const { version } = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const git = run('git', ['rev-parse', '--short', 'HEAD']);
const commit = git.status === 0 ? git.stdout.trim() : 'nogit';
const dirty = run('git', ['status', '--porcelain', '--', 'src', 'package.json', 'package-lock.json']).stdout?.trim();
const name = `deer-panel-${version}-${commit}${dirty ? '-dirty' : ''}.tgz`;

// The bot reports this to the panel (/api/status → build).
const buildFile = path.join(ROOT, 'src', 'build.json');
fs.writeFileSync(buildFile, JSON.stringify({ version, commit, dirty: Boolean(dirty), builtAt: new Date().toISOString() }, null, 2));
fs.mkdirSync(path.join(ROOT, 'releases'), { recursive: true });
try {
  const tar = run('tar', ['-czf', `releases/${name}`, 'package.json', 'package-lock.json', 'src', 'deploy/deerpanel.service', 'deploy/deerpanel-backup.service', 'deploy/deerpanel-backup.timer', 'deploy/backup.sh']);
  if (tar.status !== 0) throw new Error(tar.stderr || 'tar failed');
} finally {
  fs.rmSync(buildFile, { force: true });
}
const size = fs.statSync(path.join(ROOT, 'releases', name)).size;
console.log(`✅ releases/${name} (${(size / 1024).toFixed(0)} KB)${dirty ? ' — ⚠️ has uncommitted changes' : ''}`);
console.log('Install it from the desktop panel: Bakım → Güncelle → Paket seç.');
