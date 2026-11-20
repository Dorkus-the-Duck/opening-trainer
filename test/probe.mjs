// node test/probe.mjs "e4 c6 Nc3 d5"  -> top 3 engine moves at the end of the line
import { Chess } from 'chess.js';
import { spawn } from 'node:child_process';
const chess = new Chess();
for (const s of process.argv[2].split(/\s+/).filter(Boolean)) chess.move(s);
const sf = spawn(process.execPath, ['node_modules/stockfish/bin/stockfish-19-single.js']);
let buf = '', res = {};
sf.stdout.on('data', (d) => {
  buf += d; let i;
  while ((i = buf.indexOf('\n')) >= 0) {
    const l = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
    const m = l.match(/depth (\d+).* multipv (\d) score (cp|mate) (-?\d+).* pv (.*)/);
    if (m) res[m[2]] = `${m[3]} ${m[4]}  ${m[5].split(' ').slice(0, 8).join(' ')}`;
    if (l.startsWith('bestmove')) { console.log(chess.fen()); console.log(res); sf.stdin.write('quit\n'); }
  }
});
sf.stdin.write(`uci\nsetoption name MultiPV value 3\nposition fen ${chess.fen()}\ngo depth 18\n`);
