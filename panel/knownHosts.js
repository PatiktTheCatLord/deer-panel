// The servers' SSH host keys, pinned on first use (like OpenSSH's known_hosts). Without this check anyone
// between the panel and the server could pose as the server and catch a password or the bot token
// the setup sends. Kept in userData/known-hosts.json as { "host:port": "SHA256:…" }; host keys are public.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

// The same form OpenSSH prints (ssh-keygen -lf), so the user can compare it on the server.
const fingerprint = key => `SHA256:${crypto.createHash('sha256').update(key).digest('base64').replace(/=+$/, '')}`;
const entry = (host, port) => `${String(host).trim().toLowerCase()}:${Number(port) || 22}`;

class HostKeyChangedError extends Error {
  constructor(host, expected, got) {
    super(
      `HOST_KEY_CHANGED: Sunucunun kimliği (SSH host anahtarı) değişti, bağlanılmadı. Beklenen ${expected}, gelen ${got}. ` +
      'Biri araya girmeye çalışıyor olabilir. Sunucuyu yeniden kurmadıysan bağlanma. Yeniden kurduysan sunucuda ' +
      '`ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub` ile parmak izini karşılaştır; aynıysa profili Bağlantılar bölümünde yeniden kaydet.'
    );
    this.host = host;
    this.expected = expected;
    this.got = got;
  }
}

class KnownHosts {
  constructor(dir) {
    this.file = path.join(dir, 'known-hosts.json');
  }

  read() {
    try {
      return JSON.parse(fs.readFileSync(this.file, 'utf8'));
    } catch {
      return {};
    }
  }

  write(hosts) {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(`${this.file}.tmp`, JSON.stringify(hosts, null, 2));
    fs.renameSync(`${this.file}.tmp`, this.file);
  }

  // Pins the key the first time; afterwards only the same key passes. Returns { fingerprint, first }.
  check(host, port, key) {
    const name = entry(host, port);
    const got = fingerprint(key);
    const hosts = this.read();
    if (!hosts[name]) {
      this.write({ ...hosts, [name]: got });
      return { fingerprint: got, first: true };
    }
    if (hosts[name] !== got) throw new HostKeyChangedError(name, hosts[name], got);
    return { fingerprint: got, first: false };
  }

  // The user saved the profile again on purpose: the next connection pins the server's key anew.
  forget(host, port) {
    const name = entry(host, port);
    const hosts = this.read();
    if (!(name in hosts)) return false;
    delete hosts[name];
    this.write(hosts);
    return true;
  }
}

module.exports = { KnownHosts, HostKeyChangedError, fingerprint };
