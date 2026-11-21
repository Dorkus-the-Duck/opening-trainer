// Checkmates trainer, defending with the lone king: you play Black against king and pawn and
// Stockfish (White) tries to win. You hold the draw by winning the pawn, getting stalemated,
// repeating the position, or surviving HOLD_MOVES moves.
import { Chess } from 'chess.js';
import { h, fill, clear } from '../ui.js';
import { Board, arrow } from '../board.js';
import { LEVEL_NAMES } from '../data/mates.js';
import positions from '../../content/mate-positions.json' with { type: 'json' };
import { getCard, learnCard, gradeCard, fmtWait, GRADES } from '../srs.js';
import * as engine from '../engine.js';
import { store } from '../store.js';
import { go, renderNav } from '../app.js';
import { layout, progress, mateCardId } from './mates.js';

const HOLD_MOVES = 15;

export function defendPractice(root, { id, review, rest = [] }, t) {
  const set = positions.sets[t.practice.set] || [];
  const p = progress(id);
  const el = layout(root);
  let board = null;
  let timers = [];
  let token = 0;
  let g = null;
  const later = (fn, ms) => timers.push(setTimeout(fn, ms));

  function pick() {
    const lv = Math.min(p.level, set.length - 1);
    const pool = set[lv];
    let pos;
    do { pos = pool[Math.floor(Math.random() * pool.length)]; } while (pool.length > 1 && pos.fen === p.lastFen);
    p.lastFen = pos.fen;
    store.save();
    return { ...pos, level: lv };
  }

  function start(pos) {
    token++;
    timers.forEach(clearTimeout); timers = [];
    engine.stop();
    g = { pos, history: [], moves: 0, mistakes: 0, hints: 0, over: false };
    if (board) board.destroy();
    clear(el.board);
    board = new Board(el.board, { fen: pos.fen, orientation: 'black', movable: 'black', onMove });
    fill(el.head,
      h('div', { class: 'session-mode' }, review ? 'Checkmates · review' : 'Checkmates · practice'),
      h('h2', null, t.name),
      h('div', { class: 'muted' }, `Level ${pos.level + 1}: ${LEVEL_NAMES[t.practice.set][pos.level]} · you play Black`));
    clear(el.feed);
    yourTurn();
  }

  function yourTurn(extra) {
    board.setMovable('black');
    const count = g.pos.holds === 1 ? 'Only one move' : g.pos.holds === 2 ? 'Two moves' : 'Several moves';
    el.setPrompt('you', h('span', null, h('b', null, 'Your move. '), 'Hold the draw: stop the pawn, win it, or get stalemated.'),
      g.moves === 0 ? `${count} ${g.pos.holds === 1 ? 'keeps' : 'keep'} the draw here. Survive ${HOLD_MOVES} moves to hold it.` : `Moves held: ${g.moves} of ${HOLD_MOVES}.`,
      extra);
    renderControls();
  }

  function onMove(move) {
    if (!g || g.over || board.chess.turn() !== 'b') return false;
    g.history.push({ fen: board.fen(), last: board.lastMove, moves: g.moves, feed: el.feed.childElementCount });
    later(() => afterMine(move), 0);
    return true;
  }

  function evaluate(fen) {
    return new Promise((resolve) => {
      let last = null;
      engine.analyze(fen, { depth: 14, onInfo: (m) => { last = m; }, onDone: () => resolve(last) });
    });
  }

  async function afterMine(move) {
    const my = token;
    board.setMovable('none');
    board.setShapes([]);
    const fen = board.fen();
    const c = new Chess(fen);
    addFeed(move.san, 'you');
    g.moves++;
    if (move.captured) { held('You won the pawn! A lone king can\'t mate, so it\'s a draw.'); return; }
    el.setPrompt('opp', 'Checking your move…');
    const sc = await evaluate(fen); // White to move: White's point of view
    if (my !== token) return;
    if (sc && ((sc.mate !== undefined && sc.mate > 0) || sc.cp > 150)) {
      g.mistakes++;
      el.setPrompt('wrong', h('b', null, `${move.san}? That lets White win`),
        'After this move White can force the pawn through. Usually the fix: keep your king in front of the pawn, take the opposition when White\'s king comes close, and step straight back when the pawn advances.',
        h('div', { class: 'btn-row' }, h('button', { class: 'btn primary small', onClick: takeBack }, '↩ Take it back')));
      renderControls();
      return;
    }
    if (c.isThreefoldRepetition()) { held('Same position three times: a draw by repetition.'); return; }
    whiteMove();
  }

  function whiteMove() {
    const my = token;
    el.setPrompt('opp', 'White is thinking…');
    engine.bestMove(board.fen(), { movetime: 400, skill: 20 }).then((uci) => {
      if (my !== token || !uci || g.over) return;
      later(() => {
        const m = board.play({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
        addFeed(m.san, 'opp');
        const c = new Chess(board.fen());
        if (c.isStalemate()) { held('Stalemate! You have no legal move and you are not in check: a draw.'); return; }
        if (m.promotion) { lost('The pawn promoted. Take your last move back and look for one that keeps your king in front of the pawn.'); return; }
        if (g.moves >= HOLD_MOVES) { held(`You held for ${HOLD_MOVES} moves and White still can't get through. That's a draw.`); return; }
        yourTurn();
      }, 250);
    });
  }

  function takeBack() {
    const prev = g.history.pop();
    if (!prev) return;
    token++;
    engine.stop();
    board.setFen(prev.fen, prev.last);
    g.moves = prev.moves;
    g.over = false;
    board.setShapes([]);
    while (el.feed.childElementCount > prev.feed) el.feed.firstChild.remove();
    yourTurn();
  }

  function hint() {
    if (g.over || board.chess.turn() !== 'b') return;
    g.hints++;
    const my = token;
    el.setPrompt('you', 'Looking for a drawing move…');
    engine.bestMove(board.fen(), { movetime: 700, skill: 20 }).then((uci) => {
      if (my !== token || !uci) return;
      board.setShapes([arrow(uci.slice(0, 2), uci.slice(2, 4), 'yellow')]);
      yourTurn(h('div', { class: 'muted small' }, 'Hint: a move that holds is shown in yellow.'));
    });
  }

  function addFeed(san, who) {
    el.feed.prepend(h('div', { class: `feed-item ${who}` },
      h('div', { class: 'feed-head' }, h('span', { class: 'feed-move' }, san), h('span', { class: 'muted small' }, who === 'opp' ? 'White' : 'You'))));
  }

  function buttons(gr) {
    if (review) {
      const card = gradeCard(mateCardId(id), 'w', gr, { mistakes: g.mistakes, hints: g.hints });
      renderNav();
      return h('div', { class: 'btn-row' },
        h('span', { class: 'muted small' }, `Graded ${GRADES[gr].label} · next review in ${fmtWait(card.due - Date.now())}`),
        h('button', { class: 'btn primary', onClick: () => (rest.length ? go('session', { mode: 'review', queue: rest }) : go('home')) }, rest.length ? 'Next review →' : 'Done'));
    }
    return h('div', { class: 'btn-row' },
      h('button', { class: 'btn primary', onClick: () => start(pick()) }, 'Next position'),
      h('button', { class: 'btn', onClick: () => start(g.pos) }, 'Same position again'),
      h('button', { class: 'btn ghost', onClick: () => go('mates') }, 'All checkmates'));
  }

  function held(text) {
    const clean = g.mistakes === 0 && g.hints === 0;
    g.over = true;
    board.setMovable('none');
    p.solved++;
    let levelUp = '';
    if (clean && g.pos.level === p.level && p.level < set.length - 1) {
      p.level++;
      p.unlocked = Math.max(p.unlocked, p.level);
      levelUp = `Level ${p.level + 1} unlocked: ${LEVEL_NAMES[t.practice.set][p.level]}.`;
    }
    if (!getCard(mateCardId(id), 'w')) learnCard(mateCardId(id), 'w');
    store.save();
    el.setPrompt('done', h('b', null, 'Draw! You held it ✓'), text,
      clean ? 'No mistakes, no hints.' : `${g.mistakes} mistake${g.mistakes === 1 ? '' : 's'}, ${g.hints} hint${g.hints === 1 ? '' : 's'}.`,
      levelUp && h('div', { class: 'prompt-sub' }, h('b', null, levelUp)),
      buttons(clean ? 2 : 1));
    renderControls();
  }

  function lost(text) {
    g.over = true;
    board.setMovable('none');
    if (p.level > 0) { p.level--; store.save(); }
    el.setPrompt('wrong', h('b', null, 'White got through'), text,
      !review && h('div', { class: 'btn-row' }, h('button', { class: 'btn primary small', onClick: takeBack }, '↩ Take it back')),
      buttons(0));
    renderControls();
  }

  function renderControls() {
    fill(el.controls,
      !g.over && h('button', { class: 'btn small', onClick: hint }, 'Hint'),
      !g.over && h('button', { class: 'btn small', disabled: !g.history.length, onClick: takeBack }, 'Take back'),
      h('button', { class: 'btn small', onClick: () => start(g.pos) }, 'Restart'),
      !review && h('button', { class: 'btn small', onClick: () => go('mateLesson', { id }) }, 'Lesson'),
      h('button', { class: 'btn small ghost', onClick: () => go(review ? 'home' : 'mates') }, 'Exit'));
  }

  el.showTips(t);
  if (!set.length) { el.setPrompt('wrong', 'No practice positions yet.'); return () => {}; }
  start(pick());
  return () => { token++; timers.forEach(clearTimeout); engine.stop(); board?.destroy(); };
}
