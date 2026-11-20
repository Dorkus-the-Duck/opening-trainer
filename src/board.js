// Chessground board kept in sync with a chess.js game.
import { Chessground } from 'chessground';
import { Chess } from 'chess.js';

export const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

function destsOf(chess) {
  const dests = new Map();
  for (const m of chess.moves({ verbose: true })) {
    if (!dests.has(m.from)) dests.set(m.from, []);
    dests.get(m.from).push(m.to);
  }
  return dests;
}

export class Board {
  // opts: { fen, orientation: 'white'|'black', movable: 'both'|'white'|'black'|'none', onMove(move) -> boolean }
  // onMove gets the chess.js move the user tried; return true to accept it, false to put the piece back.
  constructor(el, opts = {}) {
    this.opts = opts;
    this.chess = new Chess(opts.fen || START_FEN);
    this.movable = opts.movable || 'both';
    this.lastMove = undefined;
    this.cg = Chessground(el, {
      orientation: opts.orientation || 'white',
      coordinates: true,
      animation: { enabled: true, duration: 180 },
      highlight: { lastMove: true, check: true },
      movable: { free: false, showDests: true, events: { after: (o, d) => this._after(o, d) } },
      premovable: { enabled: false },
      draggable: { showGhost: true },
      drawable: { enabled: true, visible: true },
    });
    el.__board = this; // handy for debugging from DevTools
    this.sync();
  }

  _after(from, to) {
    const test = new Chess(this.chess.fen());
    let move;
    try { move = test.move({ from, to, promotion: 'q' }); } catch { this.sync(); return; }
    const ok = this.opts.onMove ? this.opts.onMove(move) : true;
    if (ok === false) { this.sync(); return; }
    this.chess.move(move.san);
    this.lastMove = [move.from, move.to];
    this.sync();
  }

  sync() {
    const turn = this.chess.turn() === 'w' ? 'white' : 'black';
    const color = this.movable === 'both' ? turn : this.movable === turn ? turn : undefined;
    this.cg.set({
      fen: this.chess.fen(),
      turnColor: turn,
      check: this.chess.inCheck() ? turn : false,
      lastMove: this.lastMove,
      movable: { color, dests: color ? destsOf(this.chess) : new Map() },
    });
  }

  fen() { return this.chess.fen(); }

  setFen(fen, lastMove) {
    this.chess.load(fen);
    this.lastMove = lastMove;
    this.sync();
  }

  // Play a move programmatically (animated). Returns the chess.js move.
  play(san) {
    const m = this.chess.move(san);
    this.lastMove = [m.from, m.to];
    this.cg.move(m.from, m.to);
    this.sync();
    return m;
  }

  setMovable(m) { this.movable = m; this.sync(); }
  setOrientation(o) { this.cg.set({ orientation: o }); }
  flip() { this.cg.toggleOrientation(); }
  orientation() { return this.cg.state.orientation; }
  setShapes(shapes) { this.cg.setAutoShapes(shapes); }
  destroy() { this.cg.destroy(); }
}

export const arrow = (from, to, brush = 'green') => ({ orig: from, dest: to, brush });
export const circle = (sq, brush = 'green') => ({ orig: sq, brush });
