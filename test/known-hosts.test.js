// Deer Panel: SSH host keys pinned on first use (panel/knownHosts.js): npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { KnownHosts, HostKeyChangedError, fingerprint } = require('../panel/knownHosts.js');

const fresh = () => new KnownHosts(fs.mkdtempSync(path.join(os.tmpdir(), 'deer-hosts-')));
const KEY = Buffer.from('server key one');
const OTHER = Buffer.from('server key two');

test('fingerprints look like OpenSSH ones', () => {
  assert.match(fingerprint(KEY), /^SHA256:[A-Za-z0-9+/]{43}$/);
});

test('the first key is pinned, the same key passes again', () => {
  const hosts = fresh();
  assert.equal(hosts.check('Example.com', 2222, KEY).first, true);
  assert.equal(hosts.check('example.com', '2222', KEY).first, false);
});

test('a different key is refused and the pin stays', () => {
  const hosts = fresh();
  hosts.check('example.com', 22, KEY);
  assert.throws(() => hosts.check('example.com', 22, OTHER), error => error instanceof HostKeyChangedError && error.message.startsWith('HOST_KEY_CHANGED') && error.expected === fingerprint(KEY));
  assert.throws(() => hosts.check('example.com', 22, OTHER), HostKeyChangedError);
});

test('hosts and ports are pinned separately', () => {
  const hosts = fresh();
  hosts.check('example.com', 22, KEY);
  assert.equal(hosts.check('example.com', 2222, OTHER).first, true);
  assert.equal(hosts.check('other.example', 22, OTHER).first, true);
});

test('forgetting a host lets the next key be pinned', () => {
  const hosts = fresh();
  hosts.check('example.com', 22, KEY);
  assert.equal(hosts.forget('example.com', 22), true);
  assert.equal(hosts.forget('example.com', 22), false);
  assert.equal(hosts.check('example.com', 22, OTHER).first, true);
  assert.throws(() => hosts.check('example.com', 22, KEY), HostKeyChangedError);
});

test('a broken file is treated as empty', () => {
  const hosts = fresh();
  fs.writeFileSync(hosts.file, '{not json');
  assert.equal(hosts.check('example.com', 22, KEY).first, true);
});
