// Renders the brand pages in this folder to PNG files in assets/brand/.
// Usage (from the repo root): panel\node_modules\.bin\electron assets/brand/src/render.cjs [name filter]
// Pages are plain HTML (brand.css + deer.js); screenshots come from assets/brand/screens/.
const fs = require('node:fs');
const path = require('node:path');
const { app, BrowserWindow, nativeImage } = require('electron');

app.disableHardwareAcceleration();
// Each page gets its own window; closing it must not end the run.
app.on('window-all-closed', () => {});

const SRC = __dirname;
const OUT = path.join(__dirname, '..');

// [page, output, width, height, transparent]
const JOBS = [
  ['logo.html?v=icon', 'logo/icon-1024.png', 1024, 1024, true],
  ['logo.html?v=icon', 'logo/icon-512.png', 512, 512, true],
  ['logo.html?v=mark&c=fff', 'logo/mark-white.png', 1024, 1024, true],
  ['logo.html?v=deer', 'logo/deer.png', 1024, 1024, true],
  ['logo.html?v=mark&c=2f5b4c', 'logo/mark-green.png', 1024, 1024, true],
  ['logo.html?v=mark&c=161a24', 'logo/mark-black.png', 1024, 1024, true],
  ['logo.html?v=line&c=fff', 'logo/line-white.png', 1024, 1024, true],
  ['logo.html?v=line&c=161a24', 'logo/line-black.png', 1024, 1024, true],
  ['wordmark.html?on=dark', 'logo/wordmark-on-dark.png', 1400, 400, true],
  ['wordmark.html?on=light', 'logo/wordmark-on-light.png', 1400, 400, true],
  ['github-social.html', 'github/social-preview.png', 1280, 640],
  ['readme-banner.html', 'github/readme-banner.png', 1600, 480, true],
  ['showcase.html', 'github/overview.png', 1600, 1000],
  ['patreon-cover.html', 'patreon/cover.png', 1600, 400],
  ['logo.html?v=avatar', 'patreon/avatar.png', 1024, 1024],
  ['tier.html?t=fawn', 'patreon/tier-fawn.png', 1200, 675],
  ['tier.html?t=stag', 'patreon/tier-stag.png', 1200, 675],
  ['tier.html?t=grove', 'patreon/tier-grove.png', 1200, 675],
  ['social-square.html', 'social/post-square.png', 1080, 1080],
  ['social-story.html', 'social/story.png', 1080, 1920],
  ['discord-banner.html', 'social/discord-banner.png', 960, 540],
];

// The page size is set through DevTools so images taller than the screen (stories) are not cut off.
async function render([page, output, width, height, transparent]) {
  const window = new BrowserWindow({ width: 800, height: 600, show: false, frame: false, webPreferences: { offscreen: true } });
  const [file, query = ''] = page.split('?');
  await window.loadFile(path.join(SRC, file), { search: query });
  // DevTools only answers once a page is loaded.
  const cdp = window.webContents.debugger;
  cdp.attach('1.3');
  await cdp.sendCommand('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
  if (transparent) await cdp.sendCommand('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } });
  await window.webContents.executeJavaScript('document.fonts.ready.then(() => Promise.all([...document.images].map(i => i.decode().catch(() => {}))))');
  await new Promise(resolve => setTimeout(resolve, 400));
  const { data } = await cdp.sendCommand('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width, height, scale: 1 }, captureBeyondViewport: true });
  const target = path.join(OUT, output);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, Buffer.from(data, 'base64'));
  const size = nativeImage.createFromPath(target).getSize();
  console.log(`${output}  ${size.width}x${size.height}`);
  window.destroy();
}

app.whenReady().then(async () => {
  const filter = process.argv.slice(2).find(arg => !arg.endsWith('.cjs') && !arg.startsWith('-') && arg !== '.');
  for (const job of JOBS) {
    if (filter && !job[0].includes(filter) && !job[1].includes(filter)) continue;
    await render(job).catch(error => console.log(`${job[1]}  FAILED ${error.message}`));
  }
  app.quit();
});
