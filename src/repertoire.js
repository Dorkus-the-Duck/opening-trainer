// Merges built-in and custom lines, precomputes positions, and indexes "book" moves by position.
import { Chess } from 'chess.js';
import { content } from './content.js';
import { store } from './store.js';
import { START_FEN } from './board.js';

export const fenKey = (fen) => fen.split(' ').slice(0, 4).join(' ');

let cache = null;
export function invalidate() { cache = null; }

function prepare(v, opening) {
  const chess = new Chess(v.startFen || START_FEN);
  const plies = [];
  for (const [san, why] of v.moves) {
    const fenBefore = chess.fen();
    let m;
    try { m = chess.move(san); } catch { break; }
    plies.push({
      san: m.san, why: why || '', from: m.from, to: m.to, color: m.color,
      uci: m.from + m.to + (m.promotion || ''), fenBefore, fenAfter: chess.fen(),
    });
  }
  return {
    ...v,
    startFen: v.startFen || START_FEN,
    sides: v.sides || ['w', 'b'],
    openingId: opening.id,
    openingName: opening.name,
    plies,
  };
}

function build() {
  const OPENINGS = content.openings;
  const openings = OPENINGS.map((o) => ({ ...o, builtIn: true, variations: [] }));
  for (const o of store.data.customOpenings) openings.push({ overview: [], plans: {}, ...o, builtIn: false, variations: [] });
  const byId = new Map(openings.map((o) => [o.id, o]));

  for (const o of OPENINGS) for (const v of o.variations) byId.get(o.id).variations.push(prepare(v, o));
  for (const v of store.data.custom) {
    const o = byId.get(v.openingId);
    if (o) o.variations.push(prepare({ ...v, custom: true }, o));
  }

  const variations = new Map();
  const book = new Map();
  for (const o of openings) {
    for (const v of o.variations) {
      variations.set(v.id, v);
      for (const p of v.plies) {
        const k = fenKey(p.fenBefore);
        if (!book.has(k)) book.set(k, []);
        const list = book.get(k);
        let entry = list.find((e) => e.san === p.san);
        if (!entry) { entry = { san: p.san, uci: p.uci, why: p.why, lines: [] }; list.push(entry); }
        if (!entry.why && p.why) entry.why = p.why;
        if (!entry.lines.some((l) => l.id === v.id)) entry.lines.push({ id: v.id, name: v.name, opening: o.name });
      }
    }
  }
  return { openings, variations, book };
}

function get() { return cache || (cache = build()); }

export const getOpenings = () => get().openings;
export const getOpening = (id) => get().openings.find((o) => o.id === id);
export const getVariation = (id) => get().variations.get(id);
export const bookMoves = (fen) => get().book.get(fenKey(fen)) || [];
