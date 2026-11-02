import fs from 'node:fs';

// Which code is running: src/build.json is written by `npm run release` (version + commit);
// without it (e.g. deploy-vds.sh or a local start) only the package.json version is known.
const read = url => {
  try {
    return JSON.parse(fs.readFileSync(url, 'utf8'));
  } catch {
    return null;
  }
};

const pkg = read(new URL('../../package.json', import.meta.url)) ?? {};
export const BUILD = read(new URL('../build.json', import.meta.url)) ?? { version: pkg.version ?? '?', commit: null, builtAt: null };
