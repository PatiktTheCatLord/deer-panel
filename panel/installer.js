// Setting up a new bot from the panel: Discord token check, invite link, the bot's .env and the
// server install (systemd). Runs in the main process only.
const crypto = require('node:crypto');

const DISCORD_API = 'https://discord.com/api/v10';

// Application flags: privileged intents switched on in the Developer Portal (full or "limited").
const INTENT_FLAGS = [
  { name: 'Server Members Intent', bits: [1 << 14, 1 << 15] },
  { name: 'Message Content Intent', bits: [1 << 18, 1 << 19] }
];

// What the bot needs on a server (config.js REQUIRED_BOT_PERMISSIONS + kick/ban for the panel's moderation).
const PERMISSIONS = {
  KickMembers: 1n << 1n,
  BanMembers: 1n << 2n,
  AddReactions: 1n << 6n,
  ViewAuditLog: 1n << 7n,
  ViewChannel: 1n << 10n,
  SendMessages: 1n << 11n,
  EmbedLinks: 1n << 14n,
  AttachFiles: 1n << 15n,
  ReadMessageHistory: 1n << 16n,
  MentionEveryone: 1n << 17n,
  ManageRoles: 1n << 28n,
  CreatePublicThreads: 1n << 35n,
  SendMessagesInThreads: 1n << 38n,
  ModerateMembers: 1n << 40n
};

const TOKEN_FORMAT = /^[\w-]{20,40}\.[\w-]{4,10}\.[\w-]{20,60}$/;

async function discord(token, path) {
  const response = await fetch(`${DISCORD_API}${path}`, { headers: { Authorization: `Bot ${token}` } });
  if (response.status === 401) throw new Error('Token geçersiz — Developer Portal → Bot → Reset Token ile yenisini al');
  if (!response.ok) throw new Error(`Discord cevap vermedi (${response.status})`);
  return response.json();
}

/** Checks a bot token with Discord: the bot's name, the application id and missing privileged intents. */
async function checkDiscordToken(rawToken) {
  const token = String(rawToken ?? '').trim();
  if (!TOKEN_FORMAT.test(token)) throw new Error('Bu bir bot token\'ına benzemiyor (üç parçalı, noktalarla ayrılmış uzun bir metin)');
  const [user, application] = await Promise.all([discord(token, '/users/@me'), discord(token, '/applications/@me')]);
  const flags = Number(application.flags ?? 0);
  return {
    token,
    applicationId: application.id,
    bot: {
      id: user.id,
      name: user.global_name ?? user.username,
      tag: user.discriminator && user.discriminator !== '0' ? `${user.username}#${user.discriminator}` : user.username,
      avatar: user.avatar ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=128` : `https://cdn.discordapp.com/embed/avatars/${Number(BigInt(user.id) >> 22n) % 6}.png`
    },
    missingIntents: INTENT_FLAGS.filter(intent => !intent.bits.some(bit => flags & bit)).map(intent => intent.name)
  };
}

function inviteUrl(applicationId) {
  if (!/^\d{17,20}$/.test(String(applicationId))) throw new Error('Geçersiz uygulama kimliği');
  const permissions = Object.values(PERMISSIONS).reduce((sum, bit) => sum | bit, 0n);
  return `https://discord.com/oauth2/authorize?client_id=${applicationId}&scope=bot%20applications.commands&permissions=${permissions}`;
}

// The bot's .env for a new install. A fresh admin API token is made here and only ever stored there.
function envFile({ token, applicationId, ownerId, apiPort }) {
  if (ownerId && !/^\d{17,20}$/.test(ownerId)) throw new Error('Discord kullanıcı kimliği 17–20 rakam olmalı');
  return [
    '# Made by the Deer Panel setup.',
    `DISCORD_TOKEN=${token}`,
    `CLIENT_ID=${applicationId}`,
    `OWNER_IDS=${ownerId ?? ''}`,
    'COMMAND_MODE=global',
    `ADMIN_API_TOKEN=${crypto.randomBytes(32).toString('hex')}`,
    `ADMIN_API_PORT=${apiPort}`,
    ''
  ].join('\n');
}

// systemd units for a profile (folder, user and names from the profile, all validated by profiles.js).
function serviceUnits({ appDir, service, serviceUser, backupService }, nodePath) {
  const timer = backupService.replace(/\.service$/, '');
  return {
    [`${service}.service`]: `[Unit]
Description=Deer Panel Discord bot (${service})
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=${serviceUser}
Group=${serviceUser}
WorkingDirectory=${appDir}
ExecStart=${nodePath} src/index.js
Environment=NODE_ENV=production
Environment=NODE_OPTIONS=--max-old-space-size=256
MemoryMax=400M
Restart=always
RestartSec=10
KillSignal=SIGINT
TimeoutStopSec=20
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=${appDir}/data

[Install]
WantedBy=multi-user.target
`,
    [backupService.endsWith('.service') ? backupService : `${backupService}.service`]: `[Unit]
Description=Deer Panel daily data backup (${service})

[Service]
Type=oneshot
User=${serviceUser}
Group=${serviceUser}
ExecStart=/bin/sh ${appDir}/deploy/backup.sh
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=${appDir}/backups
`,
    [`${timer}.timer`]: `[Unit]
Description=Nightly data backup of ${service}

[Timer]
OnCalendar=*-*-* 03:30:00 UTC
Persistent=true
RandomizedDelaySec=5min

[Install]
WantedBy=timers.target
`
  };
}

const b64 = text => Buffer.from(text).toString('base64');

/**
 * Bash script that installs the bot on a fresh Linux server (run as root, or with passwordless sudo).
 * Every value is either validated by profiles.js or passed as base64 (.env, units).
 */
function serverInstallScript(profile, { packagePath, env }) {
  const { appDir: dir, service, serviceUser: user, backupService, apiPort } = profile;
  const timer = `${backupService.replace(/\.service$/, '')}.timer`;
  const units = serviceUnits(profile, '__NODE__');
  const writeUnits = Object.entries(units)
    .map(([name, text]) => `echo ${b64(text)} | base64 -d | sed "s#__NODE__#$NODE_BIN#" > /etc/systemd/system/${name}`)
    .join('\n');
  return `set -eE
fail() { echo "✖ $1"; exit 1; }
trap 'echo "✖ Kurulum yarıda kaldı (satır $LINENO)"' ERR
echo "==> Sunucu kontrol ediliyor"
command -v systemctl >/dev/null || fail "Bu sunucuda systemd yok — Ubuntu ya da Debian gibi bir Linux gerekli"
[ -e ${dir}/.env ] && fail "${dir} klasöründe zaten bir bot var. Başka bir klasör seç ya da 'Çalışan botumu bağla' seçeneğini kullan"
systemctl cat ${service}.service >/dev/null 2>&1 && fail "${service} adında bir servis zaten var — başka bir servis adı seç"
echo "==> Node.js kontrol ediliyor"
node_major() { node -v 2>/dev/null | sed 's/^v\\([0-9]*\\).*/\\1/'; }
if [ -z "$(node_major)" ] || [ "$(node_major)" -lt 18 ]; then
  if command -v apt-get >/dev/null; then
    echo "Node.js kuruluyor (apt)…"
    DEBIAN_FRONTEND=noninteractive apt-get update -qq && DEBIAN_FRONTEND=noninteractive apt-get install -y -qq nodejs npm >/dev/null
  fi
fi
[ -n "$(node_major)" ] && [ "$(node_major)" -ge 18 ] || fail "Node.js 18 ya da üstü gerekli ve otomatik kurulamadı. nodejs.org adresindeki Linux kurulumuyla Node.js 20 kurup tekrar dene"
command -v npm >/dev/null || fail "npm bulunamadı (Node.js ile birlikte kurulmalı)"
NODE_BIN=$(command -v node)
echo "Node.js $(node -v) · $NODE_BIN"
echo "==> Kullanıcı ve klasör"
id ${user} >/dev/null 2>&1 || useradd --system --home-dir ${dir} --shell /usr/sbin/nologin ${user}
mkdir -p ${dir}/data ${dir}/backups
tar -xzf ${packagePath} -C ${dir}
rm -f ${packagePath}
echo "==> Ayar dosyası (.env)"
echo ${b64(env)} | base64 -d > ${dir}/.env
chown -R ${user}:${user} ${dir}
chmod 600 ${dir}/.env
chmod 700 ${dir}/data ${dir}/backups
echo "==> Bağımlılıklar kuruluyor (1-2 dakika sürebilir)"
cd ${dir} && sudo -u ${user} -H npm ci --omit=dev --no-audit --no-fund --cache ${dir}/.npm-cache --loglevel=error
echo "==> Servis oluşturuluyor"
${writeUnits}
systemctl daemon-reload
systemctl enable --now ${service}.service >/dev/null 2>&1
systemctl enable --now ${timer} >/dev/null 2>&1 || true
echo "==> Bot başlatılıyor"
sleep 12
if ! systemctl is-active --quiet ${service}; then
  journalctl -u ${service} -n 15 --no-pager -o cat
  fail "Bot başlamadı (yukarıdaki kayda bak)"
fi
journalctl -u ${service} -n 8 --no-pager -o cat
echo "==> Yönetim API'si kontrol ediliyor"
for i in 1 2 3 4 5 6; do
  if node -e "fetch('http://127.0.0.1:${apiPort}/api/status').then(r => process.exit(r.status === 401 || r.ok || r.status === 503 ? 0 : 1)).catch(() => process.exit(1))"; then echo "API çalışıyor"; exit 0; fi
  sleep 5
done
fail "Bot çalışıyor ama yönetim API'sine ulaşılamadı (port ${apiPort})"`;
}

module.exports = { checkDiscordToken, inviteUrl, envFile, serviceUnits, serverInstallScript, PERMISSIONS };
