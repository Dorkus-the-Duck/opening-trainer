// Generates practice positions for the Checkmates trainer into content/mate-positions.json.
// Random legal positions, scored by Stockfish (mate distance), sorted into levels.
//   node tools/gen-mate-positions.mjs [perLevel] [--only setName]   (--only keeps the other sets in the file)
import { Chess } from 'chess.js';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PER_LEVEL = +process.argv[2] || 20;
const ONLY = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1] : null;
const OUT = path.join(root, 'content', 'mate-positions.json');

// ---------- engine ----------
const sf = spawn(process.execPath, [path.join(root, 'node_modules/stockfish/bin/stockfish-19-single.js')]);
let buf = '', waiter = null, last = null;
sf.stdout.on('data', (d) => {
  buf += d;
  let i;
  while ((i = buf.indexOf('\n')) >= 0) {
    const l = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
    const m = l.match(/ score (cp|mate) (-?\d+)/);
    if (l.startsWith('info') && m && !l.includes('bound')) last = m[1] === 'mate' ? { mate: +m[2] } : { cp: +m[2] };
    if ((l.startsWith('bestmove') || l === 'readyok') && waiter) { const w = waiter; waiter = null; w(last); }
  }
});
const cmd = (c) => sf.stdin.write(c + '\n');
const ready = () => new Promise((r) => { waiter = r; cmd('isready'); });
const search = (fen, depth) => new Promise((res) => { last = null; waiter = res; cmd('ucinewgame'); cmd(`position fen ${fen}`); cmd(`go depth ${depth}`); });
cmd('uci'); cmd('setoption name Hash value 64');
await ready();

// ---------- random positions ----------
const FILES = 'abcdefgh';
const sq = (i) => FILES[i % 8] + (Math.floor(i / 8) + 1);
const rnd = (n) => Math.floor(Math.random() * n);

function randomFen(pieces, { pawnRank } = {}) {
  // pieces: white piece letters besides the king, e.g. ['Q'] or ['R','R'] or ['P'].
  for (;;) {
    const used = new Set();
    const place = (ok = () => true) => { for (;;) { const i = rnd(64); if (!used.has(i) && ok(i)) { used.add(i); return i; } } };
    const board = {};
    board[place()] = 'K';
    board[place()] = 'k';
    for (const p of pieces) {
      board[p === 'P' ? place((i) => { const r = Math.floor(i / 8) + 1; return pawnRank ? r === pawnRank : r >= 2 && r <= 7; }) : place()] = p;
    }
    let fen = '';
    for (let r = 7; r >= 0; r--) {
      let empty = 0;
      for (let f = 0; f < 8; f++) {
        const p = board[r * 8 + f];
        if (p) { if (empty) fen += empty; empty = 0; fen += p; } else empty++;
      }
      if (empty) fen += empty;
      if (r) fen += '/';
    }
    fen += ' w - - 0 1';
    let c;
    try { c = new Chess(fen); } catch { continue; }
    // Legal with White to move: Black not in check, kings apart; White must have a move.
    const flipped = new Chess(fen.replace(' w ', ' b '), { skipValidation: true });
    if (flipped.inCheck()) continue;
    if (c.moves().length === 0) continue;
    return { fen, chess: c, board };
  }
}

function mateIn1(c) {
  return c.moves({ verbose: true }).some((m) => { const t = new Chess(c.fen()); t.move(m); return t.isCheckmate(); });
}
function stalemateTraps(c) {
  return c.moves().filter((m) => { const t = new Chess(c.fen()); t.move(m); return t.isStalemate(); });
}

async function mateDistance(fen, depth = 22) {
  const r = await search(fen, depth);
  return r && r.mate > 0 ? r.mate : null;
}

// ---------- sets ----------
const out = { generated: new Date().toISOString().slice(0, 10), sets: ONLY && fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')).sets : {} };

async function mateSet(id, pieces, bands) {
  const levels = bands.map(() => []);
  let tries = 0;
  while (levels.some((l) => l.length < PER_LEVEL) && tries < 20000) {
    tries++;
    const { fen, chess } = randomFen(pieces);
    // Only short mates are rare enough to need the cheap mate-in-1 filter first.
    const needShort = levels[0].length < PER_LEVEL;
    const m1 = mateIn1(chess);
    if (!m1 && !levels.slice(1).some((l) => l.length < PER_LEVEL) && needShort) continue;
    const n = m1 ? 1 : await mateDistance(fen, 22);
    if (!n) continue;
    const li = bands.findIndex(([lo, hi]) => n >= lo && n <= hi);
    if (li < 0 || levels[li].length >= PER_LEVEL) continue;
    // Skip positions where a piece is already hanging to the black king.
    const t = new Chess(fen.replace(' w ', ' b '), { skipValidation: true });
    if (t.moves({ verbose: true }).some((m) => m.captured)) continue;
    levels[li].push({ fen, mate: n });
  }
  out.sets[id] = levels;
  console.log(id, levels.map((l) => l.length).join('/'), `(${tries} tries)`);
}

async function stalemateSet() {
  // Positions with a short mate where at least one natural-looking move is stalemate.
  const levels = [[], []];
  let tries = 0;
  while (levels.some((l) => l.length < PER_LEVEL) && tries < 200000) {
    tries++;
    const pieces = Math.random() < 0.6 ? ['Q'] : ['R'];
    const { fen, chess } = randomFen(pieces);
    const traps = stalemateTraps(chess);
    if (!traps.length) continue;
    const t = new Chess(fen.replace(' w ', ' b '), { skipValidation: true });
    if (t.moves({ verbose: true }).some((m) => m.captured)) continue;
    const m1 = mateIn1(chess);
    const n = m1 ? 1 : (levels[1].length < PER_LEVEL ? await mateDistance(fen, 16) : null);
    if (!n || n > 2) continue;
    const li = n - 1;
    if (levels[li].length >= PER_LEVEL) continue;
    levels[li].push({ fen, mate: n, traps });
  }
  out.sets.stalemate = levels;
  console.log('stalemate', levels.map((l) => l.length).join('/'), `(${tries} tries)`);
}

async function promotionSet() {
  // King and pawn vs king, White wins. Levels by how far the pawn has to go.
  const bands = [[6, 7], [5, 5], [4, 4], [2, 3]];
  const levels = bands.map(() => []);
  let tries = 0;
  while (levels.some((l) => l.length < PER_LEVEL) && tries < 20000) {
    tries++;
    const li = levels.findIndex((l) => l.length < PER_LEVEL);
    const [lo, hi] = bands[li];
    const rank = lo + rnd(hi - lo + 1);
    const { fen, board } = randomFen(['P'], { pawnRank: rank });
    const pawnSq = sq(+Object.entries(board).find(([, p]) => p === 'P')[0]);
    if ('ah'.includes(pawnSq[0])) continue; // rook pawns are mostly draws: keep it simple
    const t = new Chess(fen.replace(' w ', ' b '), { skipValidation: true });
    if (t.moves({ verbose: true }).some((m) => m.captured)) continue;
    const r = await search(fen, 20);
    if (!r || !((r.mate && r.mate > 0) || r.cp > 600)) continue;
    // Needs some technique: the pawn can't just run (the black king is inside the square).
    const files = 'abcdefgh';
    const bkI = +Object.entries(board).find(([, p]) => p === 'k')[0];
    const bkF = bkI % 8, bkR = Math.floor(bkI / 8) + 1;
    const pf = files.indexOf(pawnSq[0]);
    const distPawn = 8 - rank;
    const distKing = Math.max(Math.abs(bkF - pf), 8 - bkR) - 1; // Black moves second
    if (li > 0 && distKing > distPawn) continue;
    levels[li].push({ fen, pawn: pawnSq });
  }
  out.sets.promotion = levels;
  console.log('promotion', levels.map((l) => l.length).join('/'), `(${tries} tries)`);
}

async function defendSet() {
  // King and pawn vs king, Black (you) to move, and the position is a draw with correct play.
  // Levels by how many Black moves keep the draw: several, two, exactly one.
  const levels = [[], [], []];
  let tries = 0;
  while (levels.some((l) => l.length < PER_LEVEL) && tries < 40000) {
    tries++;
    const rank = 2 + rnd(5); // pawn on ranks 2-6
    const { fen: wfen, board } = randomFen(['P'], { pawnRank: rank });
    const fen = wfen.replace(' w ', ' b ');
    let c;
    try { c = new Chess(fen); } catch { continue; }
    if (c.inCheck() && c.moves().length === 0) continue;
    // White's king must not be in check either (Black would be the one who just "moved").
    const wc = new Chess(wfen, { skipValidation: true });
    if (wc.inCheck()) continue;
    if (c.moves({ verbose: true }).some((m) => m.captured)) continue; // no free pawn
    // Black king must be near enough for it to be a real defence, not a race already lost/won.
    const r = await search(fen, 18);
    if (!r || r.mate !== undefined || Math.abs(r.cp) > 30) continue; // overall a draw
    let holds = 0;
    for (const m of c.moves()) {
      const x = new Chess(fen); x.move(m);
      const e = await search(x.fen(), 16); // White to move
      if (e && e.mate === undefined && e.cp < 100) holds++;
    }
    const li = holds >= 3 ? 0 : holds === 2 ? 1 : holds === 1 ? 2 : -1;
    if (li < 0 || levels[li].length >= PER_LEVEL) continue;
    levels[li].push({ fen, holds });
  }
  out.sets.defend = levels;
  console.log('defend', levels.map((l) => l.length).join('/'), `(${tries} tries)`);
}

const want = (n) => !ONLY || ONLY === n;
if (want('ladder')) await mateSet('ladder', ['R', 'R'], [[1, 1], [2, 3], [4, 5], [6, 99]]);
if (want('queen')) await mateSet('queen', ['Q'], [[1, 2], [3, 5], [6, 8], [9, 99]]);
if (want('rook')) await mateSet('rook', ['R'], [[1, 3], [4, 8], [9, 13], [14, 99]]);
if (want('stalemate')) await stalemateSet();
if (want('promotion')) await promotionSet();
if (want('defend')) await defendSet();

fs.writeFileSync(OUT, JSON.stringify(out, null, 0).replace(/\],\[/g, '],\n[').replace(/\},\{/g, '},\n{') + '\n');
console.log('wrote', path.relative(root, OUT));
cmd('quit');
process.exit(0);
