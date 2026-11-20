const { app, BrowserWindow, ipcMain, shell, net } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const config = require('./app.config.json');

// Same data folder whether running from source or installed (the installer's product name differs).
app.setPath('userData', path.join(app.getPath('appData'), 'opening-trainer'));

let win = null;
const dataFile = () => path.join(app.getPath('userData'), 'chess-trainer-data.json');

// ---------- persistence ----------
ipcMain.handle('data:load', () => {
  try { return JSON.parse(fs.readFileSync(dataFile(), 'utf8')); } catch { return null; }
});
ipcMain.handle('data:save', (_e, data) => {
  const tmp = dataFile() + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 1));
  fs.renameSync(tmp, dataFile());
  return true;
});
ipcMain.handle('data:reveal', () => shell.showItemInFolder(dataFile()));

ipcMain.handle('app:info', () => ({ version: app.getVersion(), packaged: app.isPackaged, platform: `${process.platform} ${process.getSystemVersion()}` }));
ipcMain.handle('app:openExternal', (_e, url) => {
  if (/^(mailto:|https:\/\/)/.test(url)) return shell.openExternal(url);
});

// ---------- online updates ----------
// Lines: the app downloads content/openings.json from the GitHub repo and uses it when its
// version is newer than what it has, so fixed or new lines reach everyone without a reinstall.
// App: installed copies update themselves from GitHub Releases (electron-updater).
const repoOk = /^[\w.-]+\/[\w.-]+$/.test(config.githubRepo) && !config.githubRepo.startsWith('OWNER/');
const packFile = () => path.join(app.getPath('userData'), 'lines-pack.json');
const readCachedPack = () => { try { return JSON.parse(fs.readFileSync(packFile(), 'utf8')); } catch { return null; } };
const versionLess = (a, b) => {
  const [x, y] = [a, b].map((v) => v.split('.').map(Number));
  for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) < (y[i] || 0);
  return false;
};

ipcMain.handle('content:cached', () => readCachedPack());

async function checkLineUpdates() {
  if (!repoOk) return;
  try {
    const res = await net.fetch(`https://raw.githubusercontent.com/${config.githubRepo}/main/content/openings.json`, { cache: 'no-store' });
    if (!res.ok) return;
    const pack = await res.json();
    if (typeof pack.version !== 'number' || !Array.isArray(pack.openings)) return;
    if (pack.minAppVersion && versionLess(app.getVersion(), pack.minAppVersion)) return;
    if (pack.version <= (readCachedPack()?.version || 0)) return;
    const tmp = packFile() + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(pack));
    fs.renameSync(tmp, packFile());
    toRenderer('content:updated', pack);
  } catch (e) { console.error('[lines update]', e.message); }
}

function checkAppUpdates() {
  if (!app.isPackaged || !repoOk) return;
  const { autoUpdater } = require('electron-updater');
  autoUpdater.on('update-downloaded', (info) => toRenderer('app:update-ready', { version: info.version }));
  autoUpdater.on('error', (e) => console.error('[app update]', e.message));
  autoUpdater.checkForUpdates().catch(() => {});
  ipcMain.handle('app:restart-to-update', () => autoUpdater.quitAndInstall());
}

// ---------- line proposals (only when running from source) ----------
// Proposed lines live in content/proposals/. The Proposals screen lets the owner play them
// through, then approve (merged into content/openings.json) or send back with a note.
const contentIo = app.isPackaged ? null : require('./tools/content-io.cjs');
ipcMain.handle('proposals:list', () => (contentIo ? contentIo.listProposals() : null));
ipcMain.handle('proposals:review', (_e, file, status, note) => contentIo.setReview(file, status, note));
ipcMain.handle('proposals:approve', (_e, file) => contentIo.approve(file));

// ---------- Stockfish ----------
// The engine is Stockfish 19 (WASM build from the `stockfish` npm package), run as a
// child process using Electron's bundled Node. It speaks UCI over stdin/stdout.
let engine = null;
let current = null;   // request being searched
let pending = null;   // request waiting for the current search to stop
let stopping = false;
let engineReady = false;
const queuedLines = [];

function send(cmd) {
  if (!engine) return;
  if (!engineReady && cmd !== 'uci' && cmd !== 'isready' && !cmd.startsWith('setoption')) { queuedLines.push(cmd); return; }
  engine.stdin.write(cmd + '\n');
}

function toRenderer(channel, msg) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, msg);
}

function startEngine() {
  // In the installed app the engine files are unpacked next to app.asar so plain Node can read them.
  const script = path.join(__dirname, 'node_modules', 'stockfish', 'bin', 'stockfish-19-single.js').replace('app.asar', 'app.asar.unpacked');
  engine = spawn(process.execPath, [script], {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true,
  });
  let buf = '';
  engine.stdout.on('data', (d) => {
    buf += d.toString();
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (line) onEngineLine(line);
    }
  });
  engine.stderr.on('data', (d) => console.error('[stockfish]', d.toString()));
  engine.on('exit', (code) => {
    console.error('[stockfish] exited', code);
    engine = null; engineReady = false;
    if (current) toRenderer('engine:done', { id: current.id, bestmove: null, error: 'engine exited' });
    current = null; pending = null;
  });
  send('uci');
  send('setoption name Hash value 64');
  send('isready');
}

function parseInfo(line) {
  const t = line.split(' ');
  const out = {};
  for (let i = 1; i < t.length; i++) {
    switch (t[i]) {
      case 'depth': out.depth = +t[++i]; break;
      case 'multipv': out.multipv = +t[++i]; break;
      case 'nodes': out.nodes = +t[++i]; break;
      case 'score':
        if (t[i + 1] === 'cp') out.cp = +t[i + 2];
        else if (t[i + 1] === 'mate') out.mate = +t[i + 2];
        i += 2;
        break;
      case 'pv': out.pv = t.slice(i + 1); i = t.length; break;
    }
  }
  return out;
}

function onEngineLine(line) {
  if (line === 'readyok' && !engineReady) {
    engineReady = true;
    while (queuedLines.length) engine.stdin.write(queuedLines.shift() + '\n');
    return;
  }
  if (line.startsWith('info') && line.includes(' pv ') && current && !stopping) {
    const info = parseInfo(line);
    if (info.pv && (info.cp !== undefined || info.mate !== undefined)) toRenderer('engine:info', { id: current.id, ...info });
    return;
  }
  if (line.startsWith('bestmove')) {
    const done = current;
    current = null; stopping = false;
    if (done) toRenderer('engine:done', { id: done.id, bestmove: line.split(' ')[1] || null });
    if (pending) { const p = pending; pending = null; startSearch(p); }
  }
}

function startSearch(req) {
  current = req;
  stopping = false;
  send(`setoption name MultiPV value ${req.multipv || 1}`);
  send(`setoption name Skill Level value ${req.skill ?? 20}`);
  send(`position fen ${req.fen}`);
  let go = 'go';
  if (req.depth) go += ` depth ${req.depth}`;
  if (req.movetime) go += ` movetime ${req.movetime}`;
  if (!req.depth && !req.movetime) go += ' infinite';
  if (req.searchmoves && req.searchmoves.length) go += ' searchmoves ' + req.searchmoves.join(' ');
  send(go);
}

ipcMain.on('engine:go', (_e, req) => {
  if (!engine) startEngine();
  if (current) {
    if (pending) toRenderer('engine:done', { id: pending.id, bestmove: null, cancelled: true });
    pending = req;
    if (!stopping) { stopping = true; send('stop'); }
  } else {
    startSearch(req);
  }
});

ipcMain.on('engine:stop', () => {
  if (pending) { toRenderer('engine:done', { id: pending.id, bestmove: null, cancelled: true }); pending = null; }
  if (current && !stopping) { stopping = true; send('stop'); }
});

// ---------- window ----------
function createWindow() {
  win = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1100,
    minHeight: 700,
    backgroundColor: '#1d1f24',
    icon: path.join(__dirname, 'assets', 'icon.ico'),
    title: 'Opening Trainer',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
    },
  });
  win.loadFile(path.join(__dirname, 'src', 'index.html'));
}

app.whenReady().then(() => {
  startEngine();
  createWindow();
  win.webContents.once('did-finish-load', () => { checkLineUpdates(); checkAppUpdates(); });
  setInterval(checkLineUpdates, 6 * 60 * 60 * 1000);
});

app.on('window-all-closed', () => {
  if (engine) { try { engine.stdin.write('quit\n'); } catch {} engine.kill(); }
  app.quit();
});
