// `npm run bundle-bot`: makes a bot release in the project above and puts it inside the panel (panel/bot/):
//   bot/deer-panel.tgz  – uploaded when the bot is installed on a server (the server runs npm ci itself)
//   bot/app/        – the same code with its production dependencies, for running the bot on this computer
//   bot/info.json   – version and commit
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const PANEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = path.resolve(PANEL, '..');
const OUT = path.join(PANEL, 'bot');
const shell = (command, cwd) => {
  const result = spawnSync(command, { cwd, stdio: 'inherit', shell: true });
  if (result.status !== 0) throw new Error(`Failed: ${command}`);
};

shell('npm run --silent release', ROOT);
const releases = path.join(ROOT, 'releases');
const [newest] = fs.readdirSync(releases).filter(name => name.endsWith('.tgz')).map(name => ({ name, time: fs.statSync(path.join(releases, name)).mtimeMs })).sort((a, b) => b.time - a.time);
if (!newest) throw new Error('No release package found');

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(path.join(OUT, 'app'), { recursive: true });
fs.copyFileSync(path.join(releases, newest.name), path.join(OUT, 'deer-panel.tgz'));
// Relative paths: GNU tar (Git Bash) reads "C:…" as a remote host.
const tar = spawnSync('tar', ['-xzf', '../deer-panel.tgz'], { cwd: path.join(OUT, 'app'), stdio: 'inherit' });
if (tar.status !== 0) throw new Error('tar failed');
shell('npm ci --omit=dev --no-audit --no-fund --loglevel=error', path.join(OUT, 'app'));
const build = JSON.parse(fs.readFileSync(path.join(OUT, 'app', 'src', 'build.json'), 'utf8'));
fs.writeFileSync(path.join(OUT, 'info.json'), JSON.stringify({ ...build, file: newest.name }, null, 2));
console.log(`✅ Bot ${build.version} (${build.commit}) bundled into panel/bot/`);
