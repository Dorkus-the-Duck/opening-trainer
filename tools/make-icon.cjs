// Rasterises assets/icon.svg into assets/icon.png, a multi-size assets/icon.ico, and full-bleed
// square icons for the web app (assets/web/icon-*.png; iOS rounds the corners itself).
// Run with Electron (it does the SVG rendering): npx electron tools/make-icon.cjs
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

const SIZES = [16, 24, 32, 48, 64, 128, 256];
const WEB_SIZES = [180, 192, 512];
const dir = path.join(__dirname, '..', 'assets');

// ICO container holding PNG images (supported since Windows Vista).
function toIco(pngs) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(pngs.length, 4);
  const entries = [];
  let offset = 6 + 16 * pngs.length;
  for (const { size, data } of pngs) {
    const e = Buffer.alloc(16);
    e.writeUInt8(size >= 256 ? 0 : size, 0);
    e.writeUInt8(size >= 256 ? 0 : size, 1);
    e.writeUInt16LE(1, 4);
    e.writeUInt16LE(32, 6);
    e.writeUInt32LE(data.length, 8);
    e.writeUInt32LE(offset, 12);
    offset += data.length;
    entries.push(e);
  }
  return Buffer.concat([header, ...entries, ...pngs.map((p) => p.data)]);
}

app.whenReady().then(async () => {
  const svg = fs.readFileSync(path.join(dir, 'icon.svg'), 'utf8');
  // Web icons: the knight without the rounded frame (drawn over a full-square background).
  const bare = svg.replace(/<rect [^>]*rx=[^>]*\/>\n?/g, '');
  const win = new BrowserWindow({ show: false });
  await win.loadURL('data:text/html,<body></body>');
  const urls = await win.webContents.executeJavaScript(`(async () => {
    const img = new Image();
    img.src = 'data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}';
    await img.decode();
    const bare = new Image();
    bare.src = 'data:image/svg+xml;base64,${Buffer.from(bare).toString('base64')}';
    await bare.decode();
    return ${JSON.stringify(SIZES)}.map((s) => {
      const c = document.createElement('canvas');
      c.width = c.height = s;
      const ctx = c.getContext('2d');
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, s, s);
      return c.toDataURL('image/png');
    }).concat(${JSON.stringify(WEB_SIZES)}.map((s) => {
      // Crop to the inner tile and fill the corners so the icon is a full square.
      const c = document.createElement('canvas');
      c.width = c.height = s;
      const ctx = c.getContext('2d');
      const g = ctx.createLinearGradient(0, 0, 0, s);
      g.addColorStop(0, '#5d6e70'); g.addColorStop(1, '#2f3a3c');
      ctx.fillStyle = g; ctx.fillRect(0, 0, s, s);
      ctx.imageSmoothingQuality = 'high';
      const k = s / 212;
      ctx.drawImage(bare, -22 * k, -22 * k, 256 * k, 256 * k);
      return c.toDataURL('image/png');
    }));
  })()`);
  const png = (u) => Buffer.from(u.split(',')[1], 'base64');
  const pngs = urls.slice(0, SIZES.length).map((u, i) => ({ size: SIZES[i], data: png(u) }));
  fs.mkdirSync(path.join(dir, 'web'), { recursive: true });
  WEB_SIZES.forEach((s, i) => fs.writeFileSync(path.join(dir, 'web', `icon-${s}.png`), png(urls[SIZES.length + i])));
  fs.writeFileSync(path.join(dir, 'icon.png'), pngs[pngs.length - 1].data);
  fs.writeFileSync(path.join(dir, 'icon.ico'), toIco(pngs));
  console.log('wrote assets/icon.png, assets/icon.ico and assets/web/icon-*.png');
  app.quit();
});
