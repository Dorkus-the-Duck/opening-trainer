// Checks the Checkmates lessons: every scripted move legal, lines end where they say
// (mate or promotion), puzzle traps really are stalemate and puzzle solutions really work.
//   node test/validate-mates.mjs
import { Chess } from 'chess.js';
import { MATE_TOPICS } from '../src/data/mates.js';
import fs from 'node:fs';

let bad = 0;
const fail = (m) => { console.log('FAIL', m); bad++; };

for (const t of MATE_TOPICS) {
  const L = t.lesson;
  if (L.kind === 'line') {
    const c = new Chess(L.fen);
    for (const [i, [san]] of L.moves.entries()) {
      try { c.move(san); } catch { fail(`${t.id}: illegal ${san} at ${i}`); break; }
      if (i < L.moves.length - 1 && (c.isStalemate() || c.isCheckmate())) fail(`${t.id}: game over early at ${san}`);
    }
    const lastSan = L.moves.at(-1)[0];
    if (lastSan.endsWith('#') && !c.isCheckmate()) fail(`${t.id}: does not end in mate`);
    if (t.id === 'promotion' && !lastSan.includes('=Q')) fail(`${t.id}: does not promote`);
    if (t.id === 'defend' && !c.isStalemate()) fail(`${t.id}: does not end in stalemate`);
    console.log(`ok ${t.id} (${L.moves.length} plies)`);
  } else {
    for (const [i, p] of L.puzzles.entries()) {
      const c = new Chess(p.fen);
      for (const [san] of Object.entries(p.traps || {})) {
        const x = new Chess(p.fen);
        try { x.move(san); } catch { fail(`${t.id}#${i}: trap ${san} illegal`); continue; }
        if (!x.isStalemate()) fail(`${t.id}#${i}: trap ${san} is not stalemate`);
      }
      if (p.goal === 'mate') {
        const mates = c.moves().filter((m) => { const x = new Chess(p.fen); x.move(m); return x.isCheckmate(); });
        if (!mates.length) fail(`${t.id}#${i}: no mate in 1`);
        else console.log(`ok ${t.id}#${i} mates: ${mates.join(' ')}`);
      } else if (Array.isArray(p.goal)) {
        for (const san of p.goal) { try { new Chess(p.fen).move(san); } catch { fail(`${t.id}#${i}: goal ${san} illegal`); } }
        console.log(`ok ${t.id}#${i} goal ${p.goal.join(' ')}`);
      } else console.log(`ok ${t.id}#${i} (${p.goal})`);
    }
  }
}

const posFile = new URL('../content/mate-positions.json', import.meta.url);
if (fs.existsSync(posFile)) {
  const { sets } = JSON.parse(fs.readFileSync(posFile, 'utf8'));
  for (const [id, levels] of Object.entries(sets)) {
    for (const lv of levels) for (const p of lv) { try { new Chess(p.fen); } catch { fail(`positions ${id}: bad fen ${p.fen}`); } }
    console.log(`ok positions ${id}: ${levels.map((l) => l.length).join('/')}`);
  }
}
console.log(bad ? `${bad} problem(s)` : 'all good');
process.exit(bad ? 1 : 0);
