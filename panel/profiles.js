// Connection profiles: one per bot (server address, SSH login, where the bot lives on the server).
// Kept in Electron's userData folder (profiles.json). Passwords and key passphrases are encrypted with
// Electron safeStorage (Windows DPAPI: only this Windows user can read them) and never sent to the window.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { safeStorage } = require('electron');

const DEFAULTS = {
  port: 22,
  username: 'root',
  privateKeyPath: '~/.ssh/id_ed25519',
  service: 'deerpanel',
  serviceUser: 'deerpanel',
  backupService: 'deerpanel-backup.service',
  appDir: '/opt/deerpanel',
  envPath: '/opt/deerpanel/.env',
  apiPort: 7410
};
// These end up in shell commands on the server, so only plain names and absolute paths are allowed.
const SAFE_NAME = /^[A-Za-z0-9_.@-]{1,64}$/;
const SAFE_PATH = /^\/[A-Za-z0-9_./-]{1,200}$/;
const SECRET_KEYS = ['password', 'passphrase'];

class ProfileStore {
  constructor(dir, legacyConfigFile) {
    this.file = path.join(dir, 'profiles.json');
    this.data = this.read();
    if (!this.data.profiles.length && legacyConfigFile && fs.existsSync(legacyConfigFile)) this.importLegacy(legacyConfigFile);
  }

  read() {
    try {
      const data = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      return { activeId: data.activeId ?? null, profiles: Array.isArray(data.profiles) ? data.profiles : [] };
    } catch {
      return { activeId: null, profiles: [] };
    }
  }

  write() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(this.file, JSON.stringify(this.data, null, 2));
  }

  // The old single-connection panel/config.json becomes the first profile (once).
  importLegacy(file) {
    try {
      const old = JSON.parse(fs.readFileSync(file, 'utf8'));
      const profile = this.clean({ ...DEFAULTS, ...old, name: 'My bot' });
      profile.id = crypto.randomUUID();
      this.data = { activeId: profile.id, profiles: [profile] };
      this.write();
    } catch (error) {
      console.warn('[PROFILES] Could not import config.json:', error.message);
    }
  }

  // Checks a profile from the window; throws an Error with a Turkish message.
  clean(input) {
    if (input.type === 'local') return this.cleanLocal(input);
    const text = (value, label, max = 200) => {
      const clean = String(value ?? '').trim();
      if (!clean) throw new Error(`${label} gerekli`);
      if (clean.length > max) throw new Error(`${label} en fazla ${max} karakter`);
      return clean;
    };
    const port = (value, label) => {
      const number = Number(value);
      if (!Number.isInteger(number) || number < 1 || number > 65535) throw new Error(`${label} 1–65535 arası olmalı`);
      return number;
    };
    const name = (value, label) => {
      const clean = text(value, label, 64);
      if (!SAFE_NAME.test(clean)) throw new Error(`${label} sadece harf, rakam ve . _ - @ içerebilir`);
      return clean;
    };
    const dir = (value, label) => {
      const clean = text(value, label).replace(/\/+$/, '');
      if (!SAFE_PATH.test(clean) || clean.includes('..')) throw new Error(`${label} / ile başlayan düz bir yol olmalı (boşluk ve özel karakter olmadan)`);
      return clean;
    };
    const host = text(input.host, 'Sunucu adresi', 253);
    if (!/^[A-Za-z0-9.:-]+$/.test(host)) throw new Error('Sunucu adresi geçersiz');
    const keyPath = String(input.privateKeyPath ?? '').trim();
    return {
      type: 'ssh',
      name: text(input.name, 'Profil adı', 40),
      host,
      port: port(input.port ?? DEFAULTS.port, 'SSH portu'),
      username: name(input.username, 'Kullanıcı'),
      privateKeyPath: keyPath || null,
      service: name(input.service, 'Servis adı'),
      serviceUser: name(input.serviceUser ?? DEFAULTS.serviceUser, 'Servis kullanıcısı'),
      backupService: name(input.backupService, 'Yedek servisi'),
      appDir: dir(input.appDir, 'Bot klasörü'),
      envPath: dir(input.envPath, '.env yolu'),
      apiPort: port(input.apiPort ?? DEFAULTS.apiPort, 'API portu')
    };
  }

  // A bot that runs on this computer: only its folder and API port.
  cleanLocal(input) {
    const name = String(input.name ?? '').trim();
    if (!name || name.length > 40) throw new Error('Profil adı gerekli (en fazla 40 karakter)');
    const botDir = String(input.botDir ?? '').trim();
    if (!path.isAbsolute(botDir)) throw new Error('Bot klasörü tam bir yol olmalı');
    const apiPort = Number(input.apiPort);
    if (!Number.isInteger(apiPort) || apiPort < 1024 || apiPort > 65535) throw new Error('API portu 1024–65535 arası olmalı');
    return { type: 'local', name, botDir, apiPort, service: 'deerpanel', autoStart: input.autoStart !== false };
  }

  // API ports already taken by bots on this computer.
  localPorts() {
    return this.data.profiles.filter(profile => profile.type === 'local').map(profile => profile.apiPort);
  }

  encrypt(value) {
    if (!safeStorage.isEncryptionAvailable()) throw new Error('Bu bilgisayarda şifreli saklama kullanılamıyor; şifre yerine SSH anahtarı kullan');
    return safeStorage.encryptString(value).toString('base64');
  }

  decrypt(value) {
    return value ? safeStorage.decryptString(Buffer.from(value, 'base64')) : null;
  }

  // For the window: no secrets, only whether one is stored.
  list() {
    return {
      activeId: this.data.activeId,
      defaults: DEFAULTS,
      profiles: this.data.profiles.map(({ secrets = {}, ...profile }) => ({
        ...profile,
        hasPassword: Boolean(secrets.password),
        hasPassphrase: Boolean(secrets.passphrase),
        type: profile.type ?? 'ssh',
        keyExists: profile.privateKeyPath ? fs.existsSync(expandHome(profile.privateKeyPath)) : false
      }))
    };
  }

  /**
   * Creates (no id) or updates a profile. Secrets: a string sets it, '' removes it, undefined keeps it.
   * Returns the saved profile's id.
   */
  save(input, secretsInput = {}) {
    const profile = this.clean(input);
    const existing = input.id ? this.data.profiles.find(item => item.id === input.id) : null;
    if (input.id && !existing) throw new Error('Profil bulunamadı');
    const secrets = { ...(existing?.secrets ?? {}) };
    for (const key of SECRET_KEYS) {
      if (secretsInput[key] === undefined) continue;
      if (secretsInput[key] === '') delete secrets[key];
      else secrets[key] = this.encrypt(String(secretsInput[key]));
    }
    if (profile.type === 'ssh') {
      if (!profile.privateKeyPath && !secrets.password) throw new Error('SSH anahtarı ya da şifre gerekli');
      if (profile.privateKeyPath && !fs.existsSync(expandHome(profile.privateKeyPath))) throw new Error(`Anahtar dosyası bulunamadı: ${profile.privateKeyPath}`);
    }

    if (existing) Object.assign(existing, profile, { secrets });
    else this.data.profiles.push({ id: crypto.randomUUID(), ...profile, secrets });
    const id = existing?.id ?? this.data.profiles.at(-1).id;
    this.data.activeId ??= id;
    this.write();
    return id;
  }

  // What the profile picker shows: the server's icon and name (saved after each successful connection).
  setMeta(id, meta) {
    const profile = this.data.profiles.find(item => item.id === id);
    if (!profile) return;
    const avatar = typeof meta.avatar === 'string' && /^https:\/\/cdn\.discordapp\.com\/[\w./?=&-]+$/.test(meta.avatar) ? meta.avatar : null;
    profile.meta = { avatar, guildName: String(meta.guildName ?? '').slice(0, 100) || null, lastUsedAt: new Date().toISOString() };
    this.write();
  }

  remove(id) {
    const before = this.data.profiles.length;
    this.data.profiles = this.data.profiles.filter(item => item.id !== id);
    if (this.data.profiles.length === before) throw new Error('Profil bulunamadı');
    if (this.data.activeId === id) this.data.activeId = this.data.profiles[0]?.id ?? null;
    this.write();
  }

  activate(id) {
    if (!this.data.profiles.some(item => item.id === id)) throw new Error('Profil bulunamadı');
    this.data.activeId = id;
    this.write();
  }

  // A connection config from the form without saving (for "Bağlantıyı dene"). Missing secrets of an
  // existing profile are taken from what is stored.
  preview(input, secretsInput = {}) {
    const profile = this.clean(input);
    const stored = input.id ? this.data.profiles.find(item => item.id === input.id)?.secrets ?? {} : {};
    const secret = key => (secretsInput[key] === undefined ? this.decrypt(stored[key]) : secretsInput[key] || null);
    const result = { ...profile, password: secret('password'), passphrase: secret('passphrase') };
    if (!result.privateKeyPath && !result.password) throw new Error('SSH anahtarı ya da şifre gerekli');
    if (result.privateKeyPath && !fs.existsSync(expandHome(result.privateKeyPath))) throw new Error(`Anahtar dosyası bulunamadı: ${result.privateKeyPath}`);
    return result;
  }

  // Full profile with decrypted secrets, for the SSH connection only (main process).
  active() {
    const profile = this.data.profiles.find(item => item.id === this.data.activeId);
    if (!profile) return null;
    const { secrets = {}, ...rest } = profile;
    return { ...rest, password: this.decrypt(secrets.password), passphrase: this.decrypt(secrets.passphrase) };
  }
}

function expandHome(file) {
  return file.replace(/^~(?=$|[\\/])/, os.homedir());
}

module.exports = { ProfileStore, expandHome, DEFAULTS };
