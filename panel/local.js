// Things the panel keeps on this computer (in Electron's userData folder):
// the optional PIN, and the history of actions taken in the panel.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

class LocalStore {
  constructor(dir) {
    fs.mkdirSync(dir, { recursive: true });
    this.settingsFile = path.join(dir, 'panel-settings.json');
    this.historyFile = path.join(dir, 'panel-history.jsonl');
  }

  readSettings() {
    try {
      return JSON.parse(fs.readFileSync(this.settingsFile, 'utf8'));
    } catch {
      return {};
    }
  }

  writeSettings(changes) {
    fs.writeFileSync(this.settingsFile, JSON.stringify({ ...this.readSettings(), ...changes }, null, 2));
  }

  // ---------- PIN (stored as a salted scrypt hash, never in plain text) ----------

  hasPin() {
    return Boolean(this.readSettings().pinHash);
  }

  checkPin(pin) {
    const { pinHash, pinSalt } = this.readSettings();
    if (!pinHash) return true;
    const hash = crypto.scryptSync(String(pin), Buffer.from(pinSalt, 'hex'), 32);
    return crypto.timingSafeEqual(hash, Buffer.from(pinHash, 'hex'));
  }

  setPin(pin) {
    if (pin === null) return this.writeSettings({ pinHash: null, pinSalt: null });
    if (!/^\d{4,8}$/.test(String(pin))) throw new Error('PIN 4–8 rakam olmalı');
    const salt = crypto.randomBytes(16);
    const hash = crypto.scryptSync(String(pin), salt, 32);
    this.writeSettings({ pinHash: hash.toString('hex'), pinSalt: salt.toString('hex') });
  }

  // ---------- action history ----------

  log(action, detail, ok = true) {
    const line = JSON.stringify({ time: new Date().toISOString(), action, detail, ok });
    fs.appendFileSync(this.historyFile, `${line}\n`);
  }

  history(limit = 500) {
    try {
      return fs
        .readFileSync(this.historyFile, 'utf8')
        .trim()
        .split('\n')
        .filter(Boolean)
        .slice(-limit)
        .map(line => JSON.parse(line))
        .reverse();
    } catch {
      return [];
    }
  }
}

// Excel-friendly CSV (UTF-8 with BOM, ";" separator as Turkish Excel expects).
function toCsv(rows) {
  if (!rows.length) return '﻿';
  const columns = Object.keys(rows[0]);
  const cell = value => {
    const text = value === null || value === undefined ? '' : String(value);
    return /[;"\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return `﻿${[columns.join(';'), ...rows.map(row => columns.map(column => cell(row[column])).join(';'))].join('\r\n')}`;
}

module.exports = { LocalStore, toCsv };
