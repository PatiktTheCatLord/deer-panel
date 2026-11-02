// Deer Panel desktop app (owner only). The bot keeps running on the VDS; this window controls it over SSH.
const path = require('node:path');
const fs = require('node:fs');
const { app, BrowserWindow, Menu, Notification, Tray, dialog, ipcMain, shell } = require('electron');
const { VdsConnection } = require('./ssh');
const { LocalStore, toCsv } = require('./local');
const { ProfileStore } = require('./profiles');
const { LocalBot, installLocalBot } = require('./localbot');
const { checkDiscordToken, envFile, inviteUrl, serverInstallScript } = require('./installer');
const crypto = require('node:crypto');
const translateEn = require('./renderer/translate.js')(require('./renderer/i18n-en.js'));
const net = require('node:net');

// The bot bundled into this panel (npm run bundle-bot): bot/deer-panel.tgz for servers, bot/app for this computer.
const BOT_BUNDLE = path.join(__dirname, 'bot');
// Bots running on this computer keep running while the panel switches profiles; they stop when it quits.
const localBots = new Map(); // profile id -> LocalBot

// Connection settings live in profiles (profiles.js, userData). An old panel/config.json becomes the first one.
const LEGACY_CONFIG = path.join(__dirname, 'config.json');
let profiles = null;
// The active profile with its secrets; null when none is set up yet.
const cfg = () => profiles.active();
// Our Discord server (permanent invite). Fixed here: the window can only ask to open this one.
const COMMUNITY_URL = 'https://discord.gg/hucz7bACBc';
// Our Patreon page; empty = the Patreon buttons stay hidden. PANEL_PATREON_URL (patreon.com only) overrides it for testing.
const PATREON_URL = /^https:\/\/(www\.)?patreon\.com\//.test(process.env.PANEL_PATREON_URL ?? '') ? process.env.PANEL_PATREON_URL : '';
const RELEASE_NAME = /^deer-panel-[\w.+-]+\.tgz$/;
const ICON = path.join(__dirname, 'assets', 'icon.png');
const BACKUP_NAME = /^settings-\d{4}-\d{2}-\d{2}\.json\.gz$/;
const startHidden = process.argv.includes('--hidden');

// Language of the tray, notifications and dialogs: the window picks it (Appearance) and tells main;
// it is kept in userData so the tray is right before the window loads.
let language = 'tr';
const languageFile = () => path.join(app.getPath('userData'), 'language.json');
function loadLanguage() {
  try {
    language = JSON.parse(fs.readFileSync(languageFile(), 'utf8')).language === 'en' ? 'en' : 'tr';
  } catch {
    language = app.getLocale().toLowerCase().startsWith('tr') ? 'tr' : 'en';
  }
}
const L = text => (language === 'en' && text ? translateEn(text) ?? text : text);
let trayTip = 'Deer Panel';
function setTrayTip(text) {
  trayTip = text;
  tray?.setToolTip(L(text));
}

let window = null;
let tray = null;
let connection = null;
let quitting = false;
let store = null;
let unlocked = false; // false until the PIN is entered (true right away when no PIN is set)

// Only these API calls can be made from the window.
const ID = '\\d{17,20}';
const API_RULES = [
  ['GET', '/api/(status|settings|faqs|stats|bans|modlog|search|alerts|flagged|rules|rolepanel|showcase|report|botconfig|leaderboard|modules|streams|permissions)(\\?.*)?'],
  ['GET', '/api/members(\\?.*)?'],
  ['GET', '/api/export/members'],
  ['GET', `/api/members/${ID}`],
  ['GET', '/api/discord/(channels|roles)(\\?kind=all)?'],
  ['POST', `/api/members/${ID}/(warnings|notes|timeout|kick|ban|verify)`],
  ['DELETE', `/api/members/${ID}/(warnings|notes)/\\d+`],
  ['DELETE', `/api/members/${ID}/timeout`],
  ['DELETE', `/api/bans/${ID}`],
  ['POST', '/api/(say|poll|faqs|showcase/pick|report/send|rolepanel/roles|rolepanel/order)'],
  ['PUT', '/api/faqs/\\d+'],
  ['PUT', `/api/rules/${ID}`],
  ['PATCH', '/api/(settings|botconfig|modules|streams)'],
  ['PUT', '/api/streams/keys'],
  ['PUT', '/api/permissions'],
  ['POST', '/api/streams/(streamers|test|check)'],
  ['DELETE', '/api/streams/streamers/\\d+'],
  ['DELETE', '/api/faqs/\\d+'],
  ['DELETE', `/api/rolepanel/roles/${ID}`]
].map(([method, pattern]) => [method, new RegExp(`^${pattern}$`)]);

function send(channel, payload) {
  // Test mode prints the update output.
  if (process.env.PANEL_SCREENSHOT && channel.startsWith('deploy:')) console.log(`[${channel}] ${typeof payload === 'string' ? payload : JSON.stringify(payload)}`);
  if (window && !window.isDestroyed()) window.webContents.send(channel, payload);
}

function requireConnection() {
  if (!connection?.ssh) throw new Error('VDS bağlantısı yok');
  return connection;
}

function showWindow() {
  if (!window || window.isDestroyed()) createWindow();
  window.show();
  window.focus();
}

// ---------- notifications (crash / stop / staff alerts) ----------

let watchTimer = null;
let lastStatus = null;
let lastAlertId = null;
let quietUntil = 0; // stops caused by the panel itself are not reported

function expectStop(ms = 90_000) {
  quietUntil = Date.now() + ms;
}

function notify(title, body) {
  if (Notification.isSupported()) {
    const notification = new Notification({ title: L(title), body: L(body), icon: ICON });
    notification.on('click', showWindow);
    notification.show();
  }
  send('alert', { title: L(title), body: L(body) });
}

async function watch() {
  if (!connection?.ssh) return;
  try {
    const status = await connection.serviceStatus();
    if (lastStatus && Date.now() > quietUntil) {
      if (lastStatus.ActiveState === 'active' && status.ActiveState !== 'active') {
        notify('Bot durdu', 'Bot VDS\'te çalışmıyor. Panelden yeniden başlatabilirsin.');
      } else if (Number(status.NRestarts) > Number(lastStatus.NRestarts)) {
        notify('Bot çöktü ve yeniden başladı', 'Ayrıntılar için Loglar bölümüne bak.');
      }
    }
    lastStatus = status;
  } catch {
    // connection problems are shown by the connection indicator
  }

  // Staff alerts from the bot (member reached the warning alert level).
  try {
    const alerts = await connection.api('GET', `/api/alerts?after=${lastAlertId ?? 0}`);
    if (lastAlertId !== null) {
      for (const alert of alerts) notify(`🚨 ${alert.username ?? 'Bir üye'}: ${alert.active} aktif uyarı`, `Son sebep: ${alert.reason}. Otomatik bir işlem yapılmadı — gözden geçir.`);
    }
    lastAlertId = alerts.at(-1)?.id ?? lastAlertId ?? 0;
  } catch {
    // the bot may be stopped
  }
}

// ---------- connection ----------

async function connect() {
  connection?.close();
  connection?.removeAllListeners?.('log');
  connection?.removeAllListeners?.('closed');
  connection = null;
  const profile = cfg();
  if (!profile) throw new Error('NO_PROFILE: Henüz bağlantı profili yok — Bağlantılar bölümünden ekle.');
  if (profile.type === 'local') {
    if (!localBots.has(profile.id)) localBots.set(profile.id, new LocalBot(profile));
    connection = localBots.get(profile.id);
  } else connection = new VdsConnection(profile);
  connection.on('log', line => send('logs:line', line));
  connection.on('closed', () => {
    send('connection', { connected: false });
    setTrayTip('Deer Panel — bağlantı yok');
  });
  await connection.connect();
  // Remember the server's icon and name for the profile picker (a bot started just now needs a moment).
  const saveMeta = () => connection?.api('GET', '/api/status').then(status => profiles.setMeta(profile.id, { avatar: status.guild.icon ?? status.bot.avatar, guildName: status.guild.name })).catch(() => {});
  saveMeta();
  if (profile.type === 'local') setTimeout(saveMeta, 20_000);
  send('connection', { connected: true, profile: profile.name });
  setTrayTip(`Deer Panel — ${profile.name} bağlı`);
  lastStatus = null;
  lastAlertId = null; // the first check only remembers the newest alert
  clearInterval(watchTimer);
  watchTimer = setInterval(watch, 20_000);
  watch();
  return { profile: profile.name };
}

// Tries a profile from the form without saving it.
async function testProfile(input, secrets) {
  const test = new VdsConnection(profiles.preview(input, secrets));
  try {
    await test.connect();
    const status = await test.serviceStatus();
    return { service: status.ActiveState, api: Boolean(test.token) };
  } finally {
    test.close();
  }
}

// ---------- update (release package) ----------
// A release is a deer-panel-<version>.tgz made with `npm run release` in the bot project. The panel uploads it,
// the server swaps the code (keeping .env and data/), installs dependencies and restarts the bot.
// If a step fails, the previous code is put back and started again.

let deploying = false;
let pendingRelease = null; // chosen in the main process only; the window never passes a file path

async function pickRelease() {
  const { canceled, filePaths } = await dialog.showOpenDialog(window, {
    title: L('Güncelleme paketi seç'),
    filters: [{ name: L('Deer Panel paketi'), extensions: ['tgz'] }],
    properties: ['openFile']
  });
  if (canceled || !filePaths[0]) return null;
  const name = path.basename(filePaths[0]);
  if (!RELEASE_NAME.test(name)) throw new Error('Paket adı deer-panel-<sürüm>.tgz biçiminde olmalı (npm run release ile oluşur)');
  const { size } = fs.statSync(filePaths[0]);
  if (size > 30 * 1024 * 1024) throw new Error('Paket çok büyük (30 MB üstü)');
  pendingRelease = filePaths[0];
  return { name, size, version: name.replace(/^deer-panel-|\.tgz$/g, '') };
}

function updateScript(profile) {
  const { appDir: dir, serviceUser: user, service, backupService } = profile;
  const install = `cd ${dir} && sudo -u ${user} -H npm ci --omit=dev --no-audit --no-fund --cache ${dir}/.npm-cache --loglevel=error`;
  // Every value here was checked by profiles.js (plain names and absolute paths only).
  return `set -eE
SWAPPED=0
rollback() {
  echo "✖ Bir adım başarısız oldu"
  # Only when the code was already replaced; before that nothing on the server changed.
  if [ "$SWAPPED" = 1 ] && [ -d ${dir}/.previous/src ]; then
    echo "==> Önceki kod geri yükleniyor"
    rm -rf ${dir}/src && cp -r ${dir}/.previous/src ${dir}/src
    cp ${dir}/.previous/package.json ${dir}/.previous/package-lock.json ${dir}/
    chown -R ${user}:${user} ${dir}/src ${dir}/package.json ${dir}/package-lock.json
    (${install}) || true
    systemctl restart ${service} || true
  fi
  rm -rf ${dir}/.release ${dir}/.release.tgz
  exit 1
}
trap rollback ERR
echo "==> Yedek alınıyor"
systemctl start ${backupService} || echo "(yedek alınamadı, devam ediliyor)"
echo "==> Paket açılıyor"
rm -rf ${dir}/.release && mkdir -p ${dir}/.release
tar -xzf ${dir}/.release.tgz -C ${dir}/.release
test -f ${dir}/.release/package.json && test -d ${dir}/.release/src
grep -q '"name": "topluluk-discord-bot"' ${dir}/.release/package.json || { echo "✖ Bu paket Deer Panel paketi değil"; false; }
echo "==> Eski kod saklanıyor"
rm -rf ${dir}/.previous && mkdir -p ${dir}/.previous
[ -d ${dir}/src ] && cp -r ${dir}/src ${dir}/package.json ${dir}/package-lock.json ${dir}/.previous/ || true
echo "==> Kod değiştiriliyor"
SWAPPED=1
id ${user} >/dev/null 2>&1 || useradd --system --home-dir ${dir} --shell /usr/sbin/nologin ${user}
mkdir -p ${dir}/data ${dir}/backups
rm -rf ${dir}/src && cp -r ${dir}/.release/src ${dir}/src
cp ${dir}/.release/package.json ${dir}/.release/package-lock.json ${dir}/
if [ -d ${dir}/.release/deploy ]; then rm -rf ${dir}/deploy && cp -r ${dir}/.release/deploy ${dir}/deploy; fi
for unit in ${service}.service ${backupService} ${backupService.replace(/\.service$/, '')}.timer; do
  [ -f ${dir}/deploy/$unit ] && cp ${dir}/deploy/$unit /etc/systemd/system/ || true
done
chown -R ${user}:${user} ${dir}
[ -f ${dir}/.env ] && chmod 600 ${dir}/.env || true
echo "==> Bağımlılıklar kuruluyor"
${install}
echo "==> Bot yeniden başlatılıyor"
systemctl daemon-reload
systemctl restart ${service}
sleep 8
systemctl is-active ${service}
rm -rf ${dir}/.release ${dir}/.release.tgz
journalctl -u ${service} -n 6 --no-pager -o cat`;
}

async function runUpdate() {
  if (deploying) throw new Error('Bir güncelleme zaten çalışıyor');
  if (requireConnection().local) return updateLocal();
  if (!pendingRelease) throw new Error('Önce bir paket seç');
  const profile = cfg();
  const release = pendingRelease;
  const ssh = requireConnection();
  deploying = true;
  expectStop(5 * 60_000);
  const line = text => send('deploy:line', text);
  try {
    line(`==> ${path.basename(release)} yükleniyor`);
    await ssh.uploadFile(release, `${profile.appDir}/.release.tgz`);
    // The script goes through base64, so nothing in it needs shell quoting.
    const encoded = Buffer.from(updateScript(profile)).toString('base64');
    const code = await ssh.execLines(`echo ${encoded} | base64 -d | bash`, line);
    store.log('Güncelleme', path.basename(release), code === 0);
    send('deploy:done', { code });
    if (code === 0) notify('Bot güncellendi', `${path.basename(release)} yüklendi ve bot yeniden başlatıldı.`);
    return code === 0;
  } catch (error) {
    store.log('Güncelleme', `${path.basename(release)}: ${error.message}`, false);
    send('deploy:done', { code: -1, error: error.message });
    throw error;
  } finally {
    deploying = false;
    pendingRelease = null;
    expectStop(30_000);
  }
}

async function updateLocal() {
  const info = bundleInfo();
  deploying = true;
  const line = text => send('deploy:line', text);
  try {
    await connection.updateFrom(path.join(BOT_BUNDLE, 'app'), line);
    store.log('Güncelleme', `yerel bot → ${info.version} (${info.commit})`);
    send('deploy:done', { code: 0 });
    return true;
  } catch (error) {
    send('deploy:done', { code: -1, error: error.message });
    throw error;
  } finally {
    deploying = false;
  }
}

function bundleInfo() {
  try {
    return JSON.parse(fs.readFileSync(path.join(BOT_BUNDLE, 'info.json'), 'utf8'));
  } catch {
    throw new Error('Bu panel sürümünde gömülü bot yok (panel klasöründe npm run bundle-bot)');
  }
}

// ---------- setup wizard (new bots) ----------

async function freeLocalPort() {
  const taken = new Set(profiles.localPorts());
  for (let port = 7410; port < 7500; port += 1) {
    if (taken.has(port)) continue;
    const free = await new Promise(resolve => {
      const server = net.createServer().once('error', () => resolve(false)).listen(port, '127.0.0.1', () => server.close(() => resolve(true)));
    });
    if (free) return port;
  }
  throw new Error('Boş port bulunamadı (7410–7499)');
}

// Installs the bundled bot on a Linux server over SSH and saves the profile. Output goes to setup:line.
async function installOnServer(input, secrets, discordInput) {
  const discordBot = await checkDiscordToken(discordInput.token);
  const config = profiles.preview(input, secrets);
  bundleInfo();
  const line = text => send('setup:line', text);
  const ssh = new VdsConnection(config);
  try {
    line('==> Sunucuya bağlanılıyor');
    await ssh.connect();
    const remote = `/tmp/deer-panel-install-${crypto.randomBytes(6).toString('hex')}.tgz`;
    line('==> Bot paketi yükleniyor');
    await ssh.uploadFile(path.join(BOT_BUNDLE, 'deer-panel.tgz'), remote);
    const env = envFile({ token: discordBot.token, applicationId: discordBot.applicationId, ownerId: discordInput.ownerId || null, apiPort: config.apiPort });
    const encoded = Buffer.from(serverInstallScript(config, { packagePath: remote, env })).toString('base64');
    // exec() adds sudo for non-root users; the script itself goes through base64 (no quoting).
    const code = await ssh.execLines(`echo ${encoded} | base64 -d | bash`, line);
    if (code !== 0) throw new Error('Kurulum tamamlanamadı (ayrıntılar yukarıda)');
  } finally {
    ssh.close();
  }
  const id = profiles.save(input, secrets);
  store.log('Bot sunucuya kuruldu', input.name);
  return { id, applicationId: discordBot.applicationId };
}

// Copies the bundled bot to this computer (userData/bots/…) and saves a local profile.
async function installHere({ name, token, ownerId }) {
  const discordBot = await checkDiscordToken(token);
  bundleInfo();
  const apiPort = await freeLocalPort();
  const botDir = path.join(app.getPath('userData'), 'bots', crypto.randomBytes(4).toString('hex'));
  const input = { type: 'local', name, botDir, apiPort };
  profiles.clean(input); // check the name before copying anything
  send('setup:line', '==> Bot bu bilgisayara kopyalanıyor');
  installLocalBot(path.join(BOT_BUNDLE, 'app'), botDir, envFile({ token: discordBot.token, applicationId: discordBot.applicationId, ownerId: ownerId || null, apiPort }));
  const id = profiles.save(input);
  send('setup:line', `✔ Kuruldu: ${botDir}`);
  store.log('Bot bu bilgisayara kuruldu', name);
  return { id, applicationId: discordBot.applicationId };
}

// ---------- backups ----------

function backupPath(name) {
  if (!BACKUP_NAME.test(name)) throw new Error('Geçersiz yedek adı');
  return `${cfg().appDir}/backups/${name}`;
}

async function listBackups() {
  if (requireConnection().local) return connection.listBackups();
  const { stdout } = await requireConnection().exec(
    `cd ${cfg().appDir}/backups 2>/dev/null && for f in settings-*.json.gz; do [ -e "$f" ] && stat -c '%n %s %Y' "$f"; done`
  );
  return stdout
    .trim()
    .split('\n')
    .filter(Boolean)
    .map(line => {
      const [name, size, time] = line.split(' ');
      return { name, size: Number(size), modified: Number(time) * 1000 };
    })
    .sort((a, b) => b.modified - a.modified);
}

async function backupNow() {
  if (requireConnection().local) {
    const list = connection.backupNow();
    store.log('Yedek alındı', '');
    return list;
  }
  const result = await requireConnection().exec(`systemctl start ${cfg().backupService}`);
  if (result.code !== 0) throw new Error(result.stderr.trim() || 'Yedek alınamadı');
  store.log('Yedek alındı', '');
  return listBackups();
}

async function downloadBackup(name) {
  const local = requireConnection().local;
  const remote = local ? connection.backupFile(name) : backupPath(name);
  const { canceled, filePath } = await dialog.showSaveDialog(window, {
    title: L('Yedeği kaydet'),
    defaultPath: path.join(app.getPath('downloads'), `deer-panel-${name}`),
    filters: [{ name: L('Sıkıştırılmış JSON'), extensions: ['gz'] }]
  });
  if (canceled || !filePath) return null;
  if (local) fs.copyFileSync(remote, filePath);
  else await requireConnection().downloadFile(remote, filePath);
  shell.showItemInFolder(filePath);
  return filePath;
}

// Stops the bot, keeps a copy of the current data, puts the backup in place and starts the bot again.
async function restoreBackup(name) {
  if (requireConnection().local) {
    const result = await connection.restoreBackup(name);
    store.log('Yedek geri yüklendi', name);
    return result;
  }
  const remote = backupPath(name);
  const { appDir: dir, service, serviceUser } = cfg();
  expectStop();
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const result = await requireConnection().exec(
    `set -e; systemctl stop ${service}; ` +
      `cp ${dir}/data/settings.json ${dir}/data/settings.before-restore-${stamp}.json; ` +
      `gunzip -c ${remote} > ${dir}/data/settings.json; ` +
      `chown ${serviceUser}:${serviceUser} ${dir}/data/settings.json ${dir}/data/settings.before-restore-${stamp}.json; ` +
      `systemctl start ${service}`
  );
  store.log('Yedek geri yüklendi', name, result.code === 0);
  if (result.code !== 0) {
    await connection.exec(`systemctl start ${service}`).catch(() => {});
    throw new Error(result.stderr.trim() || 'Geri yükleme başarısız');
  }
  return { safetyCopy: `settings.before-restore-${stamp}.json` };
}

// ---------- CSV export ----------

async function saveCsv(defaultName, rows) {
  const { canceled, filePath } = await dialog.showSaveDialog(window, {
    title: L('CSV olarak kaydet'),
    defaultPath: path.join(app.getPath('documents'), defaultName),
    filters: [{ name: L('CSV (Excel)'), extensions: ['csv'] }]
  });
  if (canceled || !filePath) return null;
  fs.writeFileSync(filePath, toCsv(rows), 'utf8');
  shell.showItemInFolder(filePath);
  return filePath;
}

// ---------- start with Windows ----------

function loginItemOptions() {
  // In development the app is electron.exe + this folder; packaged it's just the exe.
  return app.isPackaged ? { path: process.execPath, args: ['--hidden'] } : { path: process.execPath, args: [path.resolve(__dirname), '--hidden'] };
}

function getAutostart() {
  return app.getLoginItemSettings(loginItemOptions()).openAtLogin;
}

function setAutostart(enabled) {
  app.setLoginItemSettings({ ...loginItemOptions(), openAtLogin: Boolean(enabled) });
  store.log('Windows ile başlama', enabled ? 'açıldı' : 'kapatıldı');
  return getAutostart();
}

// ---------- window and tray ----------

function createWindow() {
  window = new BrowserWindow({
    width: 1340,
    height: 880,
    minWidth: 1060,
    minHeight: 660,
    show: false,
    backgroundColor: '#15171c',
    title: 'Deer Panel',
    icon: ICON,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  window.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  window.once('ready-to-show', () => {
    if (!startHidden || process.env.PANEL_SCREENSHOT) window.show();
  });

  // Closing the window keeps the panel in the tray, so notifications keep coming.
  window.on('close', event => {
    if (quitting || process.env.PANEL_SCREENSHOT) return;
    event.preventDefault();
    window.hide();
    if (!store.readSettings().trayHintShown) {
      notify('Deer Panel arka planda çalışıyor', 'Bildirimler gelmeye devam eder. Tepsideki geyik simgesinden açabilir veya çıkabilirsin.');
      store.writeSettings({ trayHintShown: true });
    }
  });

  // Links (e.g. Discord messages) open in the normal browser, never inside the panel.
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) shell.openExternal(url);
    return { action: 'deny' };
  });
  window.webContents.on('will-navigate', event => event.preventDefault());

  // Test mode: PANEL_SCREENSHOT=file.png [PANEL_VIEW=members] saves a screenshot and quits.
  if (process.env.PANEL_SCREENSHOT) {
    // The test window starts minimized; keep painting it so screenshots show what the code did.
    window.webContents.setBackgroundThrottling(false);
    window.webContents.on('console-message', event => {
      if (event.level === 'error' || event.level === 'warning') console.log(`[renderer ${event.level}] ${event.message}`);
    });
    window.webContents.once('did-finish-load', () => {
      setTimeout(async () => {
        // PANEL_SCROLL=bottom shows the end of the view (for long pages such as Settings).
        // PANEL_TEST_RELEASE=file.tgz runs the update with that package (connection must be up).
        if (process.env.PANEL_TEST_RELEASE) {
          pendingRelease = process.env.PANEL_TEST_RELEASE;
          await runUpdate().catch(error => console.log(`[deploy:error] ${error.message}`));
          await window.webContents.executeJavaScript("showView('maintenance'); new Promise(done => setTimeout(done, 4000))");
        }
        // PANEL_CLICK=element-id clicks a button first (to check a popup).
        // PANEL_EVAL=js prints the result of running js in the window (debugging).
        if (process.env.PANEL_EVAL) {
          console.log(`[eval] ${await window.webContents.executeJavaScript(process.env.PANEL_EVAL).catch(error => `ERR ${error.message}`)}`);
          await new Promise(done => setTimeout(done, 1500));
        }
        // Several ids separated by commas are clicked one after another.
        for (const id of (process.env.PANEL_CLICK ?? '').split(',').filter(Boolean)) {
          await window.webContents.executeJavaScript(`document.getElementById(${JSON.stringify(id)})?.click(); new Promise(done => setTimeout(done, 1500))`);
        }
        if (process.env.PANEL_SCROLL === 'bottom') await window.webContents.executeJavaScript("document.querySelectorAll('.view:not([hidden]), main').forEach(node => node.scrollTo(0, node.scrollHeight)); new Promise(done => setTimeout(done, 300))");
        const image = await window.webContents.capturePage();
        fs.writeFileSync(process.env.PANEL_SCREENSHOT, image.toPNG());
        quitting = true;
        app.quit();
      }, Number(process.env.PANEL_SCREENSHOT_DELAY) || 9000);
    });
  }
}

function createTray() {
  tray = new Tray(ICON);
  setTrayTip(trayTip);
  updateTrayMenu();
  tray.on('click', showWindow);
}

function updateTrayMenu() {
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: L('Paneli aç'), click: showWindow },
      { label: L('Discord sunucumuz'), click: () => shell.openExternal(COMMUNITY_URL) },
      ...(PATREON_URL ? [{ label: L("Patreon'da destek ol ❤️"), click: () => shell.openExternal(PATREON_URL) }] : []),
      { type: 'separator' },
      {
        label: L('Botu yeniden başlat'),
        click: async () => {
          if (!unlocked) return showWindow();
          expectStop();
          try {
            await requireConnection().serviceAction('restart');
            store.log('Servis', 'restart (tepsiden)');
            notify('Bot yeniden başlatıldı', '');
          } catch (error) {
            notify('Yeniden başlatılamadı', error.message);
          }
        }
      },
      { type: 'separator' },
      {
        label: L('Çıkış'),
        click: () => {
          quitting = true;
          app.quit();
        }
      }
    ])
  );
}

// ---------- IPC ----------

// Everything except the PIN screen needs the panel to be unlocked.
function handle(channel, handler, { open = false } = {}) {
  ipcMain.handle(channel, (event, ...args) => {
    if (!open && !unlocked) throw new Error('Panel kilitli');
    return handler(...args);
  });
}

handle('pin:status', () => ({ hasPin: store.hasPin(), unlocked }), { open: true });
handle('pin:unlock', pin => {
  if (!store.checkPin(pin)) {
    store.log('PIN', 'yanlış PIN', false);
    throw new Error('PIN yanlış');
  }
  unlocked = true;
  return true;
}, { open: true });
handle('pin:set', (newPin, currentPin) => {
  if (store.hasPin() && !store.checkPin(currentPin)) throw new Error('Mevcut PIN yanlış');
  store.setPin(newPin);
  store.log('PIN', newPin === null ? 'kaldırıldı' : 'ayarlandı');
  return { hasPin: store.hasPin() };
});

handle('connect', () => connect());
handle('service:status', () => requireConnection().serviceStatus());
handle('service:action', async action => {
  if (action === 'stop' || action === 'restart') expectStop();
  const result = await requireConnection().serviceAction(action);
  store.log('Servis', action);
  return result;
});
handle('vds:health', () => requireConnection().health());
handle('logs:start', () => requireConnection().startLogs());
handle('logs:stop', () => connection?.stopLogs());
handle('api', async (method, apiPath, body) => {
  if (!API_RULES.some(([allowedMethod, pattern]) => allowedMethod === method && pattern.test(apiPath))) {
    throw new Error('İzin verilmeyen istek');
  }
  if (method === 'GET') return requireConnection().api(method, apiPath, body);
  try {
    const result = await requireConnection().api(method, apiPath, body);
    // Platform keys never go into the history.
    store.log(`${method} ${apiPath}`, apiPath === '/api/streams/keys' ? '(anahtarlar gizli)' : body ? JSON.stringify(body).slice(0, 300) : '');
    return result;
  } catch (error) {
    store.log(`${method} ${apiPath}`, error.message, false);
    throw error;
  }
});
handle('update:pick', () => pickRelease());
handle('update:run', () => runUpdate());
handle('profiles:list', () => profiles.list());
handle('setup:checkToken', async token => {
  const result = await checkDiscordToken(token);
  return { applicationId: result.applicationId, bot: result.bot, missingIntents: result.missingIntents };
});
handle('setup:invite', applicationId => shell.openExternal(inviteUrl(applicationId)));
handle('setup:portal', () => shell.openExternal('https://discord.com/developers/applications'));
handle('open:community', () => shell.openExternal(COMMUNITY_URL), { open: true });
handle('open:patreon', () => PATREON_URL && shell.openExternal(PATREON_URL), { open: true });
handle('app:links', () => ({ patreon: Boolean(PATREON_URL) }), { open: true });
handle('app:setLanguage', next => {
  if (next !== 'tr' && next !== 'en') return;
  if (next !== language) {
    language = next;
    try { fs.writeFileSync(languageFile(), JSON.stringify({ language })); } catch {}
  }
  if (tray) {
    updateTrayMenu();
    setTrayTip(trayTip);
  }
}, { open: true });
handle('setup:installServer', (input, secrets, discordInput) => installOnServer(input ?? {}, secrets ?? {}, discordInput ?? {}));
handle('setup:installHere', options => installHere(options ?? {}));
handle('setup:bundle', () => {
  try {
    return bundleInfo();
  } catch {
    return null;
  }
});
handle('profiles:save', (input, secrets) => {
  const id = profiles.save(input ?? {}, secrets ?? {});
  store.log('Bağlantı profili kaydedildi', input?.name ?? '');
  return { id, ...profiles.list() };
});
handle('profiles:remove', id => {
  profiles.remove(id);
  store.log('Bağlantı profili silindi', '');
  return profiles.list();
});
handle('profiles:activate', async id => {
  profiles.activate(id);
  store.log('Bağlantı profili değişti', profiles.active()?.name ?? '');
  return connect();
});
handle('profiles:test', (input, secrets) => testProfile(input ?? {}, secrets ?? {}));
handle('profiles:pickKey', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(window, { title: L('SSH anahtar dosyası'), defaultPath: path.join(app.getPath('home'), '.ssh'), properties: ['openFile', 'showHiddenFiles'] });
  return canceled ? null : filePaths[0];
});
handle('backups:list', () => listBackups());
handle('backups:now', () => backupNow());
handle('backups:download', name => downloadBackup(name));
handle('backups:restore', name => restoreBackup(name));
handle('export:csv', (name, rows) => saveCsv(String(name).replace(/[^\w.-]/g, '_'), Array.isArray(rows) ? rows : []));
handle('history:list', () => store.history());
handle('autostart:get', () => getAutostart());
handle('autostart:set', enabled => setAutostart(enabled));
handle('testView', () => process.env.PANEL_VIEW ?? null, { open: true });
// Started hidden (Windows login) or in test mode: connect to the last profile without the picker.
handle('startup', () => ({ autoConnect: startHidden || Boolean(process.env.PANEL_SCREENSHOT) }), { open: true });

// ---------- app ----------

// A second start (e.g. the shortcut while the panel runs in the tray) just shows the existing window.
if (!app.requestSingleInstanceLock() && !process.env.PANEL_SCREENSHOT) {
  app.quit();
} else {
  app.on('second-instance', showWindow);
  app.setAppUserModelId('Deer Panel');
  app.whenReady().then(() => {
    store = new LocalStore(app.getPath('userData'));
    profiles = new ProfileStore(app.getPath('userData'), LEGACY_CONFIG);
    unlocked = !store.hasPin();
    loadLanguage();
    createTray();
    createWindow();
  });
  let localBotsStopped = false;
  app.on('before-quit', event => {
    quitting = true;
    const running = [...localBots.values()].filter(bot => bot.wanted);
    if (localBotsStopped || !running.length) return;
    // Bots on this computer save their counters and log out before the panel closes.
    event.preventDefault();
    localBotsStopped = true;
    Promise.all(running.map(bot => bot.stop())).finally(() => app.quit());
  });
  app.on('window-all-closed', () => {
    // Stays alive in the tray; quits only through the tray menu.
  });
  app.on('will-quit', () => {
    clearInterval(watchTimer);
    connection?.close();
  });
}
