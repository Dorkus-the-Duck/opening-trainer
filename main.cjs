const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

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
  const script = path.join(__dirname, 'node_modules', 'stockfish', 'bin', 'stockfish-19-single.js');
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
});

app.on('window-all-closed', () => {
  if (engine) { try { engine.stdin.write('quit\n'); } catch {} engine.kill(); }
  app.quit();
});
