// Renderer-side client for the Stockfish process running in the main process.
import { Chess } from 'chess.js';

let nextId = 1;
const handlers = new Map();

window.api.engine.onInfo((m) => handlers.get(m.id)?.onInfo?.(m));
window.api.engine.onDone((m) => {
  const h = handlers.get(m.id);
  handlers.delete(m.id);
  h?.onDone?.(m);
});

// Start a search. opts: { multipv, depth, movetime, searchmoves, skill, onInfo, onDone }.
// Any running search is stopped first. Returns the request id.
export function analyze(fen, opts = {}) {
  const id = nextId++;
  handlers.set(id, opts);
  window.api.engine.go({
    id, fen,
    multipv: opts.multipv || 1,
    depth: opts.depth, movetime: opts.movetime,
    searchmoves: opts.searchmoves, skill: opts.skill,
  });
  return id;
}

export function stop() { window.api.engine.stop(); }

export function bestMove(fen, { movetime = 800, skill = 20 } = {}) {
  return new Promise((resolve) => analyze(fen, { movetime, skill, onDone: (m) => resolve(m.bestmove) }));
}

// Evaluate specific moves from one position. Resolves to { [uci]: score } with scores
// from the mover's point of view (see scoreFromMover).
export function evaluateMoves(fen, ucis, depth = 14) {
  const moves = [...new Set(ucis)];
  const scores = {};
  return new Promise((resolve) => analyze(fen, {
    depth, multipv: moves.length, searchmoves: moves,
    onInfo: (m) => { scores[m.pv[0]] = { cp: m.cp, mate: m.mate, depth: m.depth, pv: m.pv }; },
    onDone: () => resolve(scores),
  }));
}

// Engine scores are from the side to move. Convert to White's point of view.
export function toWhite(info, fen) {
  const black = fen.split(' ')[1] === 'b';
  if (info.mate !== undefined) return { mate: black ? -info.mate : info.mate };
  return { cp: black ? -info.cp : info.cp };
}

export function fmtScore(s) {
  if (!s) return '–';
  if (s.mate !== undefined) return s.mate === 0 ? '#' : (s.mate > 0 ? `#${s.mate}` : `-#${-s.mate}`);
  const v = s.cp / 100;
  return (v > 0 ? '+' : '') + v.toFixed(2);
}

export function scoreValue(s) {
  if (!s) return 0;
  if (s.mate !== undefined) return s.mate > 0 ? 10000 - s.mate : -10000 - s.mate;
  return s.cp;
}

// White winning chance 0..1 for the eval bar.
export function whiteShare(s) {
  if (!s) return 0.5;
  if (s.mate !== undefined) return s.mate > 0 ? 1 : 0;
  return 1 / (1 + Math.exp(-0.004 * s.cp));
}

export function pvToSan(fen, pv, max = 10) {
  const chess = new Chess(fen);
  const parts = [];
  for (const uci of pv.slice(0, max)) {
    const turn = chess.turn();
    const num = chess.moveNumber();
    let m;
    try { m = chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] }); } catch { break; }
    if (turn === 'w') parts.push(`${num}.${m.san}`);
    else parts.push(parts.length === 0 ? `${num}...${m.san}` : m.san);
  }
  return parts.join(' ');
}
