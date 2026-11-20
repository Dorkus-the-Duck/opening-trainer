// Rasterises assets/icon.svg into assets/icon.png and a multi-size assets/icon.ico.
// Run with Electron (it does the SVG rendering): npx electron tools/make-icon.cjs
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

const SIZES = [16, 24, 32, 48, 64, 128, 256];
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
  const win = new BrowserWindow({ show: false });
  await win.loadURL('data:text/html,<body></body>');
  const urls = await win.webContents.executeJavaScript(`(async () => {
    const img = new Image();
    img.src = 'data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}';
    await img.decode();
    return ${JSON.stringify(SIZES)}.map((s) => {
      const c = document.createElement('canvas');
      c.width = c.height = s;
      const ctx = c.getContext('2d');
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, s, s);
      return c.toDataURL('image/png');
    });
  })()`);
  const pngs = urls.map((u, i) => ({ size: SIZES[i], data: Buffer.from(u.split(',')[1], 'base64') }));
  fs.writeFileSync(path.join(dir, 'icon.png'), pngs[pngs.length - 1].data);
  fs.writeFileSync(path.join(dir, 'icon.ico'), toIco(pngs));
  console.log('wrote assets/icon.png and assets/icon.ico');
  app.quit();
});
