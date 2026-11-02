// A bot that runs on this computer, started by the panel itself (profile type "local").
// It runs with the Node.js built into the panel (ELECTRON_RUN_AS_NODE), so nothing else has to be installed.
// Same interface as VdsConnection (ssh.js), so the rest of the panel does not care where the bot runs.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');
const { spawn } = require('node:child_process');
const { EventEmitter } = require('node:events');

const RESTART_DELAY_MS = 10_000;
const BACKUP_NAME = /^settings-\d{4}-\d{2}-\d{2}\.json\.gz$/;
const KEEP_BACKUPS = 14;

function readEnv(file) {
  try {
    return Object.fromEntries(
      fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(line => /^\w+=/.test(line)).map(line => line.split(/=(.*)/s).slice(0, 2))
    );
  } catch {
    return {};
  }
}

class LocalBot extends EventEmitter {
  constructor(config) {
    super();
    this.config = config; // { botDir, apiPort, ... }
    this.child = null;
    this.wanted = false; // should be running (restarts after a crash)
    this.startedAt = null;
    this.restarts = 0;
    this.restartTimer = null;
    this.lines = []; // last log lines, for the Loglar view
    this.local = true;
  }

  get dir() {
    return this.config.botDir;
  }

  get token() {
    return readEnv(path.join(this.dir, '.env')).ADMIN_API_TOKEN ?? null;
  }

  async connect() {
    if (!fs.existsSync(path.join(this.dir, 'src', 'index.js'))) throw new Error(`Bot bulunamadı: ${this.dir}`);
    if (this.config.autoStart !== false) this.start();
    this.connected = true;
  }

  close() {
    // Closing the panel's connection does not stop the bot; stopping is an explicit action (or quitting the panel).
    this.connected = false;
  }

  log(text) {
    const line = `${new Date().toISOString()} local ${this.config.service ?? 'deerpanel'}[${this.child?.pid ?? '-'}]: ${text}`;
    this.lines.push(line);
    if (this.lines.length > 500) this.lines.shift();
    this.emit('log', line);
  }

  start() {
    this.wanted = true;
    clearTimeout(this.restartTimer);
    if (this.child) return;
    const child = spawn(process.execPath, ['src/index.js'], {
      cwd: this.dir,
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', NODE_ENV: 'production' },
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
      windowsHide: true
    });
    this.child = child;
    this.startedAt = new Date();
    const forward = chunk => chunk.toString().split(/\r?\n/).filter(Boolean).forEach(line => this.log(line));
    child.stdout.on('data', forward);
    child.stderr.on('data', forward);
    child.on('exit', code => {
      this.child = null;
      this.log(`[panel] bot stopped (exit code ${code})`);
      if (this.wanted) {
        this.restarts += 1;
        this.restartTimer = setTimeout(() => this.start(), RESTART_DELAY_MS);
      }
    });
  }

  // Asks the bot to save and log out (IPC), and kills it if it does not stop in time.
  stop() {
    this.wanted = false;
    clearTimeout(this.restartTimer);
    const child = this.child;
    if (!child) return Promise.resolve();
    return new Promise(resolve => {
      const timer = setTimeout(() => child.kill(), 20_000);
      child.once('exit', () => {
        clearTimeout(timer);
        resolve();
      });
      try {
        child.send('shutdown');
      } catch {
        child.kill();
      }
    });
  }

  async serviceStatus() {
    const running = Boolean(this.child);
    return {
      ActiveState: running ? 'active' : this.wanted ? 'activating' : 'inactive',
      SubState: running ? 'running' : this.wanted ? 'auto-restart' : 'dead',
      ActiveEnterTimestamp: running && this.startedAt ? this.startedAt.toString() : '',
      NRestarts: String(this.restarts),
      MemoryCurrent: '[not set]',
      MainPID: String(this.child?.pid ?? 0)
    };
  }

  async serviceAction(action) {
    if (action === 'start') this.start();
    else if (action === 'stop') await this.stop();
    else if (action === 'restart') {
      await this.stop();
      this.start();
    } else throw new Error('Unknown action');
    return true;
  }

  async health() {
    let disk = { total: 0, used: 0, free: 0 };
    try {
      const stats = fs.statfsSync(this.dir);
      disk = { total: stats.blocks * stats.bsize, free: stats.bavail * stats.bsize, used: (stats.blocks - stats.bfree) * stats.bsize };
    } catch {
      // statfs is not available everywhere
    }
    const total = os.totalmem();
    const free = os.freemem();
    return { cores: os.cpus().length, load: os.loadavg(), memory: { total, used: total - free, available: free }, disk, uptimeSeconds: Math.round(os.uptime()) };
  }

  startLogs() {
    for (const line of this.lines.slice(-300)) this.emit('log', line);
  }

  stopLogs() {}

  async api(method, apiPath, body) {
    const response = await fetch(`http://127.0.0.1:${this.config.apiPort}${apiPath}`, {
      method,
      headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15_000)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error ?? `HTTP ${response.status}`);
    return data;
  }

  // ---------- backups (same names as on a server) ----------

  backupDir() {
    return path.join(this.dir, 'backups');
  }

  listBackups() {
    fs.mkdirSync(this.backupDir(), { recursive: true });
    return fs
      .readdirSync(this.backupDir())
      .filter(name => BACKUP_NAME.test(name))
      .map(name => {
        const stats = fs.statSync(path.join(this.backupDir(), name));
        return { name, size: stats.size, modified: stats.mtimeMs };
      })
      .sort((a, b) => b.modified - a.modified);
  }

  backupNow() {
    const data = path.join(this.dir, 'data', 'settings.json');
    if (!fs.existsSync(data)) throw new Error('Henüz yedeklenecek veri yok');
    fs.mkdirSync(this.backupDir(), { recursive: true });
    const name = `settings-${new Date().toISOString().slice(0, 10)}.json.gz`;
    fs.writeFileSync(path.join(this.backupDir(), name), zlib.gzipSync(fs.readFileSync(data)));
    for (const old of this.listBackups().slice(KEEP_BACKUPS)) fs.rmSync(path.join(this.backupDir(), old.name));
    return this.listBackups();
  }

  backupFile(name) {
    if (!BACKUP_NAME.test(name)) throw new Error('Geçersiz yedek adı');
    return path.join(this.backupDir(), name);
  }

  async restoreBackup(name) {
    const file = this.backupFile(name);
    const wasRunning = this.wanted;
    await this.stop();
    const data = path.join(this.dir, 'data', 'settings.json');
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    if (fs.existsSync(data)) fs.copyFileSync(data, path.join(this.dir, 'data', `settings.before-restore-${stamp}.json`));
    fs.writeFileSync(data, zlib.gunzipSync(fs.readFileSync(file)));
    if (wasRunning) this.start();
    return { safetyCopy: `settings.before-restore-${stamp}.json` };
  }

  // Replaces the code with the bot bundled in this panel version (keeps .env, data/ and backups/).
  async updateFrom(bundleDir, onLine) {
    const wasRunning = this.wanted;
    onLine('==> Bot durduruluyor');
    await this.stop();
    onLine('==> Kod değiştiriliyor');
    for (const entry of ['src', 'node_modules', 'deploy']) {
      fs.rmSync(path.join(this.dir, entry), { recursive: true, force: true });
      if (fs.existsSync(path.join(bundleDir, entry))) fs.cpSync(path.join(bundleDir, entry), path.join(this.dir, entry), { recursive: true });
    }
    for (const file of ['package.json', 'package-lock.json']) fs.copyFileSync(path.join(bundleDir, file), path.join(this.dir, file));
    if (wasRunning) {
      onLine('==> Bot başlatılıyor');
      this.start();
    }
  }
}

// Copies the bundled bot to a new folder and writes its .env (first install on this computer).
function installLocalBot(bundleDir, botDir, env) {
  if (fs.existsSync(path.join(botDir, '.env'))) throw new Error(`Bu klasörde zaten bir bot var: ${botDir}`);
  fs.mkdirSync(botDir, { recursive: true });
  for (const entry of ['src', 'node_modules', 'deploy', 'package.json', 'package-lock.json']) {
    fs.cpSync(path.join(bundleDir, entry), path.join(botDir, entry), { recursive: true });
  }
  fs.mkdirSync(path.join(botDir, 'data'), { recursive: true });
  fs.mkdirSync(path.join(botDir, 'backups'), { recursive: true });
  fs.writeFileSync(path.join(botDir, '.env'), env, { mode: 0o600 });
}

module.exports = { LocalBot, installLocalBot };
