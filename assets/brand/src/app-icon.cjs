// Writes the panel's app icon (panel/assets/icon.png and icon.ico) from logo.html?v=icon.
// Usage (from the repo root): panel\node_modules\.bin\electron assets/brand/src/app-icon.cjs
// Each ICO size is drawn at its own size, so small icons stay sharp.
const fs = require('node:fs');
const path = require('node:path');
const { app, BrowserWindow } = require('electron');

app.disableHardwareAcceleration();
app.on('window-all-closed', () => {});

const OUT = path.join(__dirname, '..', '..', '..', 'panel', 'assets');
const SIZES = [256, 64, 48, 32, 24, 16];

async function draw(size) {
  const window = new BrowserWindow({ width: 400, height: 400, show: false, webPreferences: { offscreen: true } });
  await window.loadFile(path.join(__dirname, 'logo.html'), { search: 'v=icon' });
  const cdp = window.webContents.debugger;
  cdp.attach('1.3');
  await cdp.sendCommand('Emulation.setDeviceMetricsOverride', { width: size, height: size, deviceScaleFactor: 1, mobile: false });
  await cdp.sendCommand('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } });
  await new Promise(resolve => setTimeout(resolve, 300));
  const { data } = await cdp.sendCommand('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: size, height: size, scale: 1 } });
  window.destroy();
  return Buffer.from(data, 'base64');
}

// ICO with PNG payloads (supported since Windows Vista).
function ico(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  let offset = 6 + 16 * images.length;
  const entries = images.map(({ size, png }) => {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size >= 256 ? 0 : size, 0);
    entry.writeUInt8(size >= 256 ? 0 : size, 1);
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(png.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += png.length;
    return entry;
  });
  return Buffer.concat([header, ...entries, ...images.map(image => image.png)]);
}

app.whenReady().then(async () => {
  const images = [];
  for (const size of SIZES) images.push({ size, png: await draw(size) });
  fs.writeFileSync(path.join(OUT, 'icon.png'), images[0].png);
  fs.writeFileSync(path.join(OUT, 'icon.ico'), ico(images));
  console.log(`icon.png and icon.ico (${SIZES.join(', ')}) written to ${OUT}`);
  app.quit();
});
