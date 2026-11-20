// Validates every built-in line: legal moves (chess.js) and, with --engine, flags moves
// Stockfish considers clearly worse than its best move.
//   node test/validate.mjs            -> legality only
//   node test/validate.mjs --engine   -> legality + engine check (a few minutes)
//   add --proposals to check only the lines in content/proposals/ instead of the repertoire.
// A variation can list ply indexes in "intentional" (e.g. a deliberate mistake the line punishes);
// the engine check skips those plies.
import { Chess } from 'chess.js';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import { OPENINGS } from '../src/data/openings.js';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const useEngine = process.argv.includes('--engine');
const proposalsDir = path.join(root, 'content', 'proposals');
const variations = process.argv.includes('--proposals')
  ? fs.readdirSync(proposalsDir).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(fs.readFileSync(path.join(proposalsDir, f), 'utf8')).variation)
  : OPENINGS.flatMap((op) => op.variations);
const DEPTH = 16;
const THRESHOLD = 70; // centipawns

let failures = 0;
const lines = [];
{
  for (const v of variations) {
    const chess = new Chess();
    const fens = [];
    for (const [san, why] of v.moves) {
      if (!why) { console.log(`MISSING EXPLANATION ${v.id} ${san}`); failures++; }
      fens.push(chess.fen());
      try { chess.move(san); } catch {
        console.log(`ILLEGAL ${v.id}: ${san} at ply ${fens.length}`); failures++; break;
      }
    }
    lines.push({ v, fens });
    console.log(`ok ${v.id} (${v.moves.length} plies)`);
  }
}

if (useEngine) {
  const sf = spawn(process.execPath, [path.join(root, 'node_modules/stockfish/bin/stockfish-19-single.js')]);
  let buf = '', waiter = null, last = null;
  sf.stdout.on('data', (d) => {
    buf += d;
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const l = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
      const m = l.match(/score (cp|mate) (-?\d+).* pv (\S+)/);
      if (l.startsWith('info') && m && !l.includes('upperbound') && !l.includes('lowerbound')) last = { score: m[1] === 'cp' ? +m[2] : (m[2] > 0 ? 10000 : -10000), move: m[3] };
      if (l.startsWith('bestmove') && waiter) { const w = waiter; waiter = null; w(last); }
    }
  });
  const cmd = (c) => sf.stdin.write(c + '\n');
  const search = (fen, searchmoves) => new Promise((res) => {
    last = null; waiter = res;
    cmd(`position fen ${fen}`);
    cmd(`go depth ${DEPTH}${searchmoves ? ' searchmoves ' + searchmoves : ''}`);
  });
  cmd('uci'); cmd('setoption name Hash value 64');

  for (const { v, fens } of lines) {
    for (let p = 0; p < v.moves.length; p++) {
      if (v.intentional?.includes(p)) continue;
      const chess = new Chess(fens[p]);
      const mv = chess.move(v.moves[p][0]);
      const uci = mv.from + mv.to + (mv.promotion || '');
      const best = await search(fens[p]);
      const played = best.move === uci ? best : await search(fens[p], uci);
      const loss = best.score - played.score;
      const side = p % 2 ? 'b' : 'w';
      const tag = loss > THRESHOLD ? 'WARN' : '    ';
      if (loss > THRESHOLD) failures++;
      console.log(`${tag} ${v.id} ${Math.floor(p / 2) + 1}${side === 'w' ? '.' : '...'}${v.moves[p][0]}  eval(mover) ${played.score}  best ${best.move} ${best.score}  loss ${loss}`);
    }
  }
  cmd('quit');
}

console.log(failures ? `\n${failures} problem(s)` : '\nall good');
process.exit(failures ? 1 : 0);
