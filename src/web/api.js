// Browser stand-in for the Electron preload bridge (window.api), used by the web/iPhone/iPad build.
// Data lives in localStorage, Stockfish runs in a Web Worker, and app updates come from the service worker.
const DATA_KEY = 'opening-trainer-data';
const VERSION = globalThis.__APP_VERSION__ || 'web';

function emitter() {
  const subs = [];
  return { on: (cb) => subs.push(cb), emit: (m) => subs.forEach((cb) => { try { cb(m); } catch (e) { console.error(e); } }) };
}

// ---------- Stockfish (lite single-threaded WASM) ----------
const info = emitter();
const done = emitter();
let worker = null;
let current = null;   // request being searched
let pending = null;   // request waiting for the current search to stop
let stopping = false;
let ready = false;
const queued = [];

function send(cmd) {
  if (!worker) return;
  if (!ready && cmd !== 'uci' && cmd !== 'isready' && !cmd.startsWith('setoption')) { queued.push(cmd); return; }
  worker.postMessage(cmd);
}

function startEngine() {
  worker = new Worker('engine/stockfish-19-lite-single.js');
  worker.onmessage = (e) => { if (typeof e.data === 'string') e.data.split('\n').forEach((l) => { l = l.trim(); if (l) onLine(l); }); };
  worker.onerror = (e) => {
    console.error('[stockfish]', e.message || e);
    worker = null; ready = false;
    if (current) done.emit({ id: current.id, bestmove: null, error: 'engine failed' });
    current = null; pending = null;
  };
  send('uci');
  send('setoption name Hash value 32');
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

function onLine(line) {
  if (line === 'readyok' && !ready) {
    ready = true;
    while (queued.length) worker.postMessage(queued.shift());
    return;
  }
  if (line.startsWith('info') && line.includes(' pv ') && current && !stopping) {
    const m = parseInfo(line);
    if (m.pv && (m.cp !== undefined || m.mate !== undefined)) info.emit({ id: current.id, ...m });
    return;
  }
  if (line.startsWith('bestmove')) {
    const d = current;
    current = null; stopping = false;
    if (d) done.emit({ id: d.id, bestmove: line.split(' ')[1] || null });
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

// Async so handlers registered right after a call still see its messages.
const later = (fn) => setTimeout(fn, 0);

// ---------- app updates (service worker) ----------
const updateReady = emitter();
let reloading = false;
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker?.register('sw.js').then((reg) => {
    const watch = (sw) => sw && sw.addEventListener('statechange', () => {
      if (sw.state === 'installed' && navigator.serviceWorker.controller) updateReady.emit({ version: 'new' });
    });
    watch(reg.installing);
    reg.addEventListener('updatefound', () => watch(reg.installing));
    setInterval(() => reg.update().catch(() => {}), 60 * 60 * 1000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) reg.update().catch(() => {}); });
  }).catch((e) => console.warn('service worker', e));
  navigator.serviceWorker?.addEventListener('controllerchange', () => { if (reloading) location.reload(); });
}

function download(name, text) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

window.api = {
  web: true,
  loadData: async () => {
    try { const s = localStorage.getItem(DATA_KEY); return s ? JSON.parse(s) : null; } catch { return null; }
  },
  saveData: async (data) => {
    try { localStorage.setItem(DATA_KEY, JSON.stringify(data)); } catch (e) { console.error('save failed', e); }
  },
  // On the web there's no file to show: export a backup instead.
  revealData: async () => download(`opening-trainer-backup-${new Date().toISOString().slice(0, 10)}.json`, localStorage.getItem(DATA_KEY) || '{}'),
  importData: () => new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.onchange = async () => {
      const f = input.files[0];
      if (!f) return resolve(false);
      try {
        const data = JSON.parse(await f.text());
        if (!data || typeof data !== 'object' || !data.cards) throw new Error('not a backup');
        localStorage.setItem(DATA_KEY, JSON.stringify(data));
        resolve(true);
      } catch { resolve(false); }
    };
    input.click();
  }),
  appInfo: async () => ({ version: VERSION, packaged: true, platform: `web (${navigator.platform || 'browser'})` }),
  content: {
    cached: async () => null,   // the site always serves the latest lines with the app
    onUpdated: () => {},
  },
  onUpdateReady: (cb) => updateReady.on(cb),
  restartToUpdate: async () => {
    reloading = true;
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg?.waiting) reg.waiting.postMessage('skipWaiting');
    else location.reload();
  },
  openExternal: async (url) => {
    if (/^(mailto:|https:)/.test(url)) {
      if (url.startsWith('mailto:')) location.href = url;
      else window.open(url, '_blank', 'noopener');
    }
  },
  proposals: { list: async () => null, review: async () => null, approve: async () => null },
  engine: {
    go: (req) => later(() => {
      if (!worker) startEngine();
      if (current) {
        if (pending) done.emit({ id: pending.id, bestmove: null, cancelled: true });
        pending = req;
        if (!stopping) { stopping = true; send('stop'); }
      } else {
        startSearch(req);
      }
    }),
    stop: () => later(() => {
      if (pending) { done.emit({ id: pending.id, bestmove: null, cancelled: true }); pending = null; }
      if (current && !stopping) { stopping = true; send('stop'); }
    }),
    onInfo: (cb) => info.on(cb),
    onDone: (cb) => done.on(cb),
  },
};
