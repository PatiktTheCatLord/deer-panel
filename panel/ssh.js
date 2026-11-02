// SSH connection to the VDS: runs a few whitelisted commands and tunnels HTTP to the bot's admin API.
const fs = require('node:fs');
const os = require('node:os');
const net = require('node:net');
const { EventEmitter } = require('node:events');
const { Client } = require('ssh2');

class VdsConnection extends EventEmitter {
  constructor(config) {
    super();
    this.config = config;
    this.ssh = null;
    this.tunnel = null; // local TCP server forwarding to the admin API
    this.tunnelPort = null;
    this.token = null;
    this.logStream = null;
  }

  connect() {
    return new Promise((resolve, reject) => {
      // A profile logs in with a key file (optionally with a passphrase) and/or a password.
      const auth = this.config.privateKeyPath
        ? { privateKey: fs.readFileSync(this.config.privateKeyPath.replace(/^~(?=$|[\\/])/, os.homedir())), passphrase: this.config.passphrase ?? undefined }
        : {};
      if (this.config.password) auth.password = this.config.password;
      const ssh = new Client();
      ssh
        .on('ready', async () => {
          this.ssh = ssh;
          try {
            await this.openTunnel();
            this.token = (await this.exec(`grep '^ADMIN_API_TOKEN=' ${this.config.envPath} | cut -d= -f2`)).stdout.trim();
            resolve();
          } catch (error) {
            reject(error);
          }
        })
        .on('error', reject)
        .on('close', () => {
          this.ssh = null;
          this.tunnel?.close();
          this.tunnel = null;
          this.emit('closed');
        })
        .connect({
          host: this.config.host,
          port: this.config.port,
          username: this.config.username,
          ...auth,
          keepaliveInterval: 15_000,
          readyTimeout: 20_000
        });
    });
  }

  close() {
    this.stopLogs();
    this.ssh?.end();
  }

  // Logged in as a normal user: commands run with passwordless sudo (systemctl, the bot's files).
  wrap(command) {
    if (this.config.username === 'root') return command;
    return `sudo -n sh -c '${command.replace(/'/g, "'\\''")}'`;
  }

  exec(command) {
    return new Promise((resolve, reject) => {
      if (!this.ssh) return reject(new Error('Not connected'));
      this.ssh.exec(this.wrap(command), (error, stream) => {
        if (error) return reject(error);
        let stdout = '';
        let stderr = '';
        stream
          .on('data', chunk => (stdout += chunk))
          .on('close', code => resolve({ code, stdout, stderr }));
        stream.stderr.on('data', chunk => (stderr += chunk));
      });
    });
  }

  // Local port → SSH → 127.0.0.1:apiPort on the VDS. The API never has to be exposed to the internet.
  openTunnel() {
    return new Promise((resolve, reject) => {
      this.tunnel = net.createServer(socket => {
        this.ssh?.forwardOut('127.0.0.1', 0, '127.0.0.1', this.config.apiPort, (error, stream) => {
          if (error) return socket.destroy();
          socket.pipe(stream).pipe(socket);
          stream.on('error', () => socket.destroy());
          socket.on('error', () => stream.destroy());
        });
      });
      this.tunnel.on('error', reject);
      this.tunnel.listen(0, '127.0.0.1', () => {
        this.tunnelPort = this.tunnel.address().port;
        resolve();
      });
    });
  }

  async api(method, path, body) {
    const response = await fetch(`http://127.0.0.1:${this.tunnelPort}${path}`, {
      method,
      headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15_000)
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error ?? `HTTP ${response.status}`);
    return data;
  }

  downloadFile(remotePath, localPath) {
    return new Promise((resolve, reject) => {
      if (!this.ssh) return reject(new Error('Not connected'));
      this.ssh.sftp((error, sftp) => {
        if (error) return reject(error);
        sftp.fastGet(remotePath, localPath, downloadError => {
          sftp.end();
          if (downloadError) reject(downloadError);
          else resolve();
        });
      });
    });
  }

  uploadFile(localPath, remotePath) {
    return new Promise((resolve, reject) => {
      if (!this.ssh) return reject(new Error('Not connected'));
      this.ssh.sftp((error, sftp) => {
        if (error) return reject(error);
        sftp.fastPut(localPath, remotePath, uploadError => {
          sftp.end();
          if (uploadError) reject(uploadError);
          else resolve();
        });
      });
    });
  }

  // Runs a command and passes each output line to onLine; resolves with the exit code.
  execLines(command, onLine) {
    return new Promise((resolve, reject) => {
      if (!this.ssh) return reject(new Error('Not connected'));
      this.ssh.exec(this.wrap(command), (error, stream) => {
        if (error) return reject(error);
        const forward = chunk => chunk.toString().split(/\r?\n/).filter(Boolean).forEach(onLine);
        stream.on('data', forward).on('close', code => resolve(code));
        stream.stderr.on('data', forward);
      });
    });
  }

  // CPU, memory and disk of the VDS (the bot shares it with other services).
  async health() {
    const { stdout } = await this.exec(
      "nproc; cat /proc/loadavg; free -b | awk 'NR==2{print $2, $3, $7}'; df -B1 / | awk 'NR==2{print $2, $3, $4}'; cat /proc/uptime"
    );
    const [cores, loadavg, memory, disk, uptime] = stdout.trim().split('\n');
    const [memTotal, memUsed, memAvailable] = memory.split(' ').map(Number);
    const [diskTotal, diskUsed, diskFree] = disk.split(' ').map(Number);
    return {
      cores: Number(cores),
      load: loadavg.split(' ').slice(0, 3).map(Number),
      memory: { total: memTotal, used: memUsed, available: memAvailable },
      disk: { total: diskTotal, used: diskUsed, free: diskFree },
      uptimeSeconds: Math.round(Number(uptime.split(' ')[0]))
    };
  }

  async serviceStatus() {
    const { stdout } = await this.exec(
      `systemctl show ${this.config.service} -p ActiveState -p SubState -p ActiveEnterTimestamp -p NRestarts -p MemoryCurrent -p MainPID`
    );
    return Object.fromEntries(stdout.trim().split('\n').map(line => line.split(/=(.*)/s).slice(0, 2)));
  }

  async serviceAction(action) {
    if (!['start', 'stop', 'restart'].includes(action)) throw new Error('Unknown action');
    const result = await this.exec(`systemctl ${action} ${this.config.service}`);
    if (result.code !== 0) throw new Error(result.stderr.trim() || `systemctl ${action} failed`);
    return true;
  }

  // Streams the bot's journal; every line is emitted as a 'log' event.
  startLogs(lines = 300) {
    this.stopLogs();
    if (!this.ssh) return;
    this.ssh.exec(this.wrap(`journalctl -u ${this.config.service} -f -n ${lines} -o short-iso --no-pager`), (error, stream) => {
      if (error) return this.emit('log', `[panel] log stream failed: ${error.message}`);
      this.logStream = stream;
      let buffer = '';
      stream.on('data', chunk => {
        buffer += chunk;
        const parts = buffer.split('\n');
        buffer = parts.pop();
        for (const line of parts) this.emit('log', line);
      });
      stream.on('close', () => {
        if (this.logStream === stream) this.logStream = null;
      });
    });
  }

  stopLogs() {
    this.logStream?.close();
    this.logStream = null;
  }
}

module.exports = { VdsConnection };
