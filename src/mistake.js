// Turns an engine refutation of a wrong move into a short plain-English explanation.
import { Chess } from 'chess.js';
import { scoreValue, fmtScore } from './engine.js';

const VALUE = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
const NAME = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };
const SIDE = { w: 'White', b: 'Black' };

function count(chess, color) {
  const c = { p: 0, n: 0, b: 0, r: 0, q: 0 };
  for (const row of chess.board()) for (const sq of row) if (sq && sq.color === color && sq.type !== 'k') c[sq.type]++;
  return c;
}
const material = (c) => Object.entries(c).reduce((s, [t, n]) => s + VALUE[t] * n, 0);
const lost = (before, after) => Object.fromEntries(Object.keys(before).map((t) => [t, Math.max(0, before[t] - after[t])]).filter(([, n]) => n > 0));

function listPieces(l) {
  const words = ['', 'a', 'two', 'three', 'four'];
  const order = ['q', 'r', 'b', 'n', 'p'];
  const parts = order.filter((t) => l[t]).map((t) => (l[t] === 1 ? `${t === 'p' ? 'a' : 'the'} ${NAME[t]}` : `${words[l[t]] || l[t]} ${NAME[t]}s`));
  return parts.length > 1 ? parts.slice(0, -1).join(', ') + ' and ' + parts.at(-1) : parts[0] || '';
}

// Numbered SAN for a run of moves starting from fen.
export function sanLine(fen, sans) {
  const chess = new Chess(fen);
  return sans.map((san, i) => {
    const n = chess.moveNumber();
    const w = chess.turn() === 'w';
    chess.move(san);
    return w ? `${n}.${san}` : i === 0 ? `${n}...${san}` : san;
  }).join(' ');
}

// fenBefore: position before your move. you: chess.js move you played. pv: UCI moves starting with yours.
// yours / line: engine scores (mover's point of view) for your move and the line's move.
// Returns { grade, symbol, verdict, sans, reasons[] } where sans is the side line in SAN (your move first).
export function explainMistake({ fenBefore, you, pv, yours, line, lineSan }) {
  const me = new Chess(fenBefore).turn();
  const opp = me === 'w' ? 'b' : 'w';
  const chess = new Chess(fenBefore);
  const startMine = count(chess, me), startTheirs = count(chess, opp);

  // Play the refutation, stopping once things are quiet (no capture or check) after at least 4 plies.
  const sans = [];
  const moves = [];
  for (const uci of pv.slice(0, 10)) {
    let m;
    try { m = chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] }); } catch { break; }
    sans.push(m.san);
    moves.push(m);
    if (sans.length >= 4 && !m.captured && !chess.inCheck() && sans.length % 2 === 0) break;
    if (sans.length >= 8) break;
  }
  const lostMine = lost(startMine, count(chess, me));
  const lostTheirs = lost(startTheirs, count(chess, opp));
  // Like-for-like trades cancel out (a pawn for a pawn isn't worth mentioning).
  for (const t of Object.keys(lostMine)) {
    const k = Math.min(lostMine[t], lostTheirs[t] || 0);
    if (!k) continue;
    lostMine[t] -= k; lostTheirs[t] -= k;
    if (!lostMine[t]) delete lostMine[t];
    if (!lostTheirs[t]) delete lostTheirs[t];
  }
  const net = material(lostMine) - material(lostTheirs);

  const diff = yours && line ? scoreValue(line) - scoreValue(yours) : 0;
  const matedIn = yours?.mate !== undefined && yours.mate < 0 ? -yours.mate : null;
  let grade, symbol;
  if (matedIn || diff >= 250) { grade = 'Blunder'; symbol = '??'; }
  else if (diff >= 100) { grade = 'Mistake'; symbol = '?'; }
  else if (diff >= 40) { grade = 'Inaccuracy'; symbol = '?!'; }
  else { grade = 'Playable'; symbol = ''; }

  const reasons = [];
  const reply = moves[1];
  if (matedIn) {
    reasons.push(`It allows a forced mate: ${SIDE[opp]} mates in ${matedIn}.`);
  } else if (reply) {
    // What the opponent's answer does.
    if (reply.captured) {
      const after = new Chess(fenBefore); after.move(you.san);
      const defended = after.attackers(reply.to, me).length > 0;
      reasons.push(`${SIDE[opp]} answers ${reply.san}, taking your ${NAME[reply.captured]}${defended ? '' : ' (your move left it undefended)'}.`);
    } else if (reply.san.includes('+')) {
      reasons.push(`${SIDE[opp]} answers ${reply.san} with check.`);
    } else {
      const after = new Chess(fenBefore); after.move(you.san); after.move(reply.san);
      // Pieces of yours the reply now attacks that are loose or worth more than the attacker.
      const hit = [];
      for (const row of after.board()) for (const sq of row) {
        if (!sq || sq.color !== me || sq.type === 'k' || sq.type === 'p') continue;
        if (!after.attackers(sq.square, opp).includes(reply.to)) continue;
        const loose = after.attackers(sq.square, me).length === 0;
        if (loose || VALUE[sq.type] > VALUE[reply.piece]) hit.push(`${NAME[sq.type]} on ${sq.square}`);
      }
      reasons.push(`${SIDE[opp]}'s best answer is ${reply.san}` + (hit.length ? `, which attacks your ${hit.join(' and ')}.` : '.'));
    }
    if (net >= 1) {
      const what = lostMine.r && lostTheirs.n + lostTheirs.b === 1 && net >= 1 && net <= 3 && !lostMine.q
        ? 'the exchange'
        : listPieces(lostMine) + (material(lostTheirs) ? ` for ${listPieces(lostTheirs)}` : '');
      reasons.push(`By the end of the side line you have lost ${what}: about ${net} pawn${net === 1 ? '' : 's'} of material.`);
    } else if (net <= -1) {
      reasons.push(`You win material back in this line, but ${SIDE[opp]} gets more than enough for it.`);
    } else if (grade !== 'Playable') {
      reasons.push(`No material is lost, but ${SIDE[opp]} gets the easier position.`);
    }
  }
  if (yours && line) {
    reasons.push(`Engine, from your side: ${fmtScore(yours)} after your move, ${fmtScore(line)} after ${lineSan}` +
      (grade === 'Playable' ? '. About equal, but stick to the line so you know the plans that follow.' : ` (${(diff / 100).toFixed(1)} pawns worse).`));
  }
  return { grade, symbol, verdict: grade === 'Playable' ? 'Playable, but not the line' : grade, sans, reasons };
}
