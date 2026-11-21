// Checkmates trainer: beginner endgame mates (ladder, K+Q, K+R), stalemate traps, and promotion.
//   matesView        the list of topics
//   mateLessonView   a guided lesson (scripted line or short puzzles)
//   matePracticeView random positions against Stockfish, levels from mate-in-1 upward;
//                    also used for reviews (cards "mate:<id>|w" in the normal review queue)
import { Chess } from 'chess.js';
import { h, fill, clear } from '../ui.js';
import { Board, arrow, circle } from '../board.js';
import { MATE_TOPICS, LEVEL_NAMES, mateTopic } from '../data/mates.js';
import positions from '../../content/mate-positions.json' with { type: 'json' };
import { getCard, learnCard, gradeCard, describeDue, fmtWait, GRADES } from '../srs.js';
import * as engine from '../engine.js';
import { store } from '../store.js';
import { go, renderNav } from '../app.js';

const SIDE = { w: 'White', b: 'Black' };
const NAME = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen' };
export const mateCardId = (id) => `mate:${id}`;

function progress(id) {
  store.data.mates ||= {};
  return (store.data.mates[id] ||= { level: 0, unlocked: 0, solved: 0, lessonDone: false });
}

// ---------- list ----------
export function matesView(root) {
  const card = (t) => {
    const p = progress(t.id);
    const c = getCard(mateCardId(t.id), 'w');
    const due = c ? describeDue(c) : null;
    const levels = LEVEL_NAMES[t.practice.set];
    return h('div', { class: 'card mate-card' },
      h('div', { class: 'card-head' },
        h('div', null,
          h('h3', null, t.name),
          h('div', { class: 'muted small' }, t.pieces)),
        due ? h('span', { class: `pill ${due.cls}` }, due.label) : h('span', { class: 'pill new' }, 'New')),
      h('p', { class: 'blurb' }, t.blurb),
      h('div', { class: 'mate-levels' }, levels.map((name, i) => h('button', {
        class: 'level-chip' + (i <= p.unlocked ? '' : ' locked') + (i === p.level ? ' on' : ''),
        disabled: i > p.unlocked,
        title: i > p.unlocked ? 'Solve the level before cleanly to unlock' : `Practice: ${name}`,
        onClick: () => { p.level = i; store.save(); go('matePractice', { id: t.id }); },
      }, `${i + 1}. ${name}`))),
      h('div', { class: 'btn-row' },
        h('button', { class: 'btn small' + (p.lessonDone ? '' : ' primary'), onClick: () => go('mateLesson', { id: t.id }) }, p.lessonDone ? 'Lesson again' : 'Start lesson'),
        h('button', { class: 'btn small' + (p.lessonDone ? ' primary' : ''), onClick: () => go('matePractice', { id: t.id }) }, `Practice · level ${p.level + 1}`),
        p.solved > 0 && h('span', { class: 'muted small' }, `${p.solved} solved`)));
  };
  root.append(h('div', { class: 'page narrow' },
    h('div', { class: 'hero' },
      h('div', null,
        h('h1', null, 'Checkmates'),
        h('p', { class: 'muted' }, 'Win the won endgames: mate with the pieces you have left, and never let it slip into stalemate. Each topic has a short lesson, then practice against Stockfish that starts at mate-in-1 and builds up. Practiced topics join your Review queue.'))),
    MATE_TOPICS.map(card)));
}

// ---------- shared layout ----------
function layout(root) {
  const el = {
    board: h('div', { class: 'cg-board' }),
    head: h('div', { class: 'session-head' }),
    prompt: h('div', { class: 'prompt' }),
    controls: h('div', { class: 'controls' }),
    feed: h('div', { class: 'feed' }),
    tips: h('div', { class: 'feed' }),
  };
  root.append(h('div', { class: 'board-layout' },
    h('div', { class: 'board-col' }, h('div', { class: 'board-and-bar' }, h('div', { class: 'board-wrap' }, el.board))),
    h('div', { class: 'side-col' }, el.head, el.prompt, el.controls, el.feed, el.tips)));
  el.setPrompt = (kind, main, ...sub) => {
    el.prompt.className = 'prompt ' + kind;
    fill(el.prompt, h('div', { class: 'prompt-main' }, main), ...sub.filter(Boolean).map((s) => (s instanceof Node ? s : h('div', { class: 'prompt-sub' }, s))));
  };
  el.showTips = (t) => fill(el.tips, h('div', { class: 'feed-item intro' }, h('b', null, 'Remember'), h('ul', { class: 'sl-reasons' }, t.tips.map((x) => h('li', null, x)))));
  return el;
}

function head(el, t, label) {
  fill(el.head,
    h('div', { class: 'session-mode' }, label),
    h('h2', null, t.name),
    h('div', { class: 'muted' }, `You play White · ${t.pieces}`));
}

const plyLabel = (fen, san) => {
  const [, turn, , , , num] = fen.split(' ');
  return turn === 'w' ? `${num}.${san}` : `${num}...${san}`;
};

// What's wrong with the position after White's move, if anything (checked without the engine).
function quickProblem(fen) {
  const c = new Chess(fen);
  if (c.isStalemate()) {
    const k = c.board().flat().find((s) => s && s.type === 'k' && s.color === 'b');
    return { kind: 'stalemate', square: k.square, text: 'Stalemate! Black has no legal move and is not in check, so the game is a draw. Take the move back and find one that leaves the king a square (or gives mate).' };
  }
  const grab = c.moves({ verbose: true }).find((m) => m.captured && m.captured !== 'p');
  if (grab) return { kind: 'hang', square: grab.to, text: `Black can take your ${NAME[grab.captured]} on ${grab.to}: nothing protects it. Take the move back and keep it safe (protected by your king, or far from theirs).` };
  return null;
}

// ---------- lesson ----------
export function mateLessonView(root, { id }) {
  const t = mateTopic(id);
  if (!t) { go('mates'); return; }
  const el = layout(root);
  head(el, t, 'Checkmates · lesson');
  el.showTips(t);
  let board = null;
  let timers = [];
  const later = (fn, ms) => timers.push(setTimeout(fn, ms));

  function newBoard(fen, onMove) {
    if (board) board.destroy();
    clear(el.board);
    board = new Board(el.board, { fen, orientation: 'white', movable: 'none', onMove });
  }

  function finish() {
    const p = progress(id);
    p.lessonDone = true;
    learnCard(mateCardId(id), 'w');
    store.save();
    renderNav();
    el.setPrompt('done', h('b', null, 'Lesson complete ✓'),
      'Now practice it against Stockfish. It starts with positions one move from mate and builds up as you get them right. This topic is in your Review queue too.',
      h('div', { class: 'btn-row' },
        h('button', { class: 'btn primary', onClick: () => go('matePractice', { id }) }, 'Practice now'),
        h('button', { class: 'btn', onClick: () => go('mateLesson', { id }) }, 'Lesson again'),
        h('button', { class: 'btn ghost', onClick: () => go('mates') }, 'All checkmates')));
  }

  // Scripted line: you play White's moves (arrow), Black answers.
  function runLine() {
    const L = t.lesson;
    let ply = 0;
    newBoard(L.fen, (move) => {
      const want = L.moves[ply];
      const c = new Chess(board.fen());
      const m = c.move(want[0]);
      if (move.from === m.from && move.to === m.to) { const before = board.fen(); later(() => advance(before), 0); return true; }
      el.setPrompt('wrong', h('span', null, 'Not this time. Play ', h('b', null, want[0]), ' (the arrow).'), want[1]);
      return false;
    });
    fill(el.feed, h('div', { class: 'feed-item intro' }, t.blurb));
    const addFeed = (fen, san, why, who) => el.feed.prepend(h('div', { class: `feed-item ${who}` },
      h('div', { class: 'feed-head' }, h('span', { class: 'feed-move' }, plyLabel(fen, san)), h('span', { class: 'muted small' }, who === 'opp' ? 'Black' : 'You')),
      why && h('div', { class: 'feed-why' }, why)));
    function advance(before) {
      const [san, why] = L.moves[ply];
      addFeed(before, san, why, 'you');
      ply++;
      step();
    }
    function step() {
      board.setShapes([]);
      if (ply >= L.moves.length) { board.setMovable('none'); finish(); return; }
      const [san, why] = L.moves[ply];
      const c = new Chess(board.fen());
      if (c.turn() === 'b') {
        board.setMovable('none');
        el.setPrompt('opp', 'Black is moving…');
        later(() => {
          const before = board.fen();
          board.play(san);
          addFeed(before, san, why, 'opp');
          ply++;
          step();
        }, 650);
        return;
      }
      const m = c.move(san);
      board.setMovable('white');
      board.setShapes([arrow(m.from, m.to)]);
      el.setPrompt('you', h('span', null, 'Play ', h('b', null, plyLabel(board.fen(), san)), ' (shown by the arrow).'), why);
    }
    step();
  }

  // Short puzzles (stalemate traps).
  function runPuzzles() {
    const list = t.lesson.puzzles;
    let i = 0;
    fill(el.feed, h('div', { class: 'feed-item intro' }, t.blurb));
    function show() {
      if (i >= list.length) { board.setMovable('none'); finish(); return; }
      const pz = list[i];
      newBoard(pz.fen, (move) => { later(() => judge(move), 0); return true; });
      board.setMovable('white');
      el.setPrompt('you', h('span', null, h('b', null, `${i + 1}/${list.length}. `), pz.title), pz.hint);
    }
    function retry(kind, title, text, square) {
      board.setMovable('none');
      if (square) board.setShapes([circle(square, 'red')]);
      el.setPrompt(kind, title, text, h('div', { class: 'btn-row' }, h('button', { class: 'btn primary small', onClick: show }, '↩ Try again')));
    }
    function judge(move) {
      const pz = list[i];
      const fen = board.fen();
      const c = new Chess(fen);
      if (pz.traps?.[move.san]) {
        const k = c.board().flat().find((s) => s && s.type === 'k' && s.color === 'b');
        retry('wrong', h('b', null, `${move.san}?? Stalemate.`), pz.traps[move.san], k?.square);
        return;
      }
      const problem = quickProblem(fen);
      let ok;
      if (pz.goal === 'mate') ok = c.isCheckmate();
      else if (pz.goal === 'safe') ok = !problem;
      else ok = pz.goal.includes(move.san);
      if (!ok) {
        if (problem) retry('wrong', h('b', null, problem.kind === 'stalemate' ? `${move.san}?? Stalemate.` : `${move.san}? That drops a piece.`), problem.text, problem.square);
        else retry('wrong', h('b', null, `${move.san} isn't it.`), pz.goal === 'mate' ? 'That isn\'t checkmate. Look for a check the king can\'t escape.' : (pz.wrong || 'Try another move.'));
        return;
      }
      board.setMovable('none');
      el.feed.prepend(h('div', { class: 'feed-item you' }, h('div', { class: 'feed-head' }, h('span', { class: 'feed-move' }, move.san), h('span', { class: 'muted small' }, `Puzzle ${i + 1}`)), h('div', { class: 'feed-why' }, pz.solved)));
      el.setPrompt('done', h('b', null, `${move.san}! `), pz.solved,
        h('div', { class: 'btn-row' }, h('button', { class: 'btn primary small', onClick: () => { i++; show(); } }, i + 1 < list.length ? 'Next puzzle →' : 'Finish')));
    }
    show();
  }

  fill(el.controls,
    h('button', { class: 'btn small', onClick: () => go('mateLesson', { id }) }, 'Restart'),
    h('button', { class: 'btn small', onClick: () => go('matePractice', { id }) }, 'Skip to practice'),
    h('button', { class: 'btn small ghost', onClick: () => go('mates') }, 'Exit'));

  if (t.lesson.kind === 'line') runLine(); else runPuzzles();

  return () => { timers.forEach(clearTimeout); engine.stop(); board?.destroy(); };
}

// ---------- practice ----------
export function matePracticeView(root, { id, review = false, rest = [], fen: startFen, continued = false }) {
  const t = mateTopic(id);
  if (!t) { go('mates'); return; }
  const set = positions.sets[t.practice.set];
  const p = progress(id);
  const el = layout(root);
  let board = null;
  let timers = [];
  let token = 0;
  const later = (fn, ms) => timers.push(setTimeout(fn, ms));
  let g = null; // current game

  const goalText = () => (id === 'promotion' && !g.queened
    ? 'Promote the pawn and keep the new queen safe. Don\'t let Black take the pawn or reach a draw.'
    : 'Checkmate Black. Stockfish defends as well as it can.');

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
    g = { pos, fen0: pos.fen, history: [], moves: 0, quiet: 0, mistakes: 0, hints: 0, over: false, queened: false };
    if (board) board.destroy();
    clear(el.board);
    board = new Board(el.board, { fen: pos.fen, orientation: 'white', movable: 'white', onMove });
    fill(el.head,
      h('div', { class: 'session-mode' }, review ? 'Checkmates · review' : 'Checkmates · practice'),
      h('h2', null, t.name),
      h('div', { class: 'muted' }, continued ? 'Now mate with your new queen.' : `Level ${pos.level + 1}: ${LEVEL_NAMES[t.practice.set][pos.level]}`));
    clear(el.feed);
    if (board.chess.turn() === 'b') { // e.g. carrying on right after a promotion
      board.setMovable('none');
      renderControls();
      blackMove();
    } else yourTurn();
  }

  function yourTurn(extra) {
    board.setMovable('white');
    el.setPrompt('you', h('span', null, h('b', null, 'Your move. '), goalText()),
      pos().mate && g.moves === 0 ? `Best play mates in ${pos().mate}.` : null, extra);
    renderControls();
  }
  const pos = () => g.pos;

  function onMove(move) {
    if (!g || g.over || board.chess.turn() !== 'w') return false;
    g.history.push({ fen: board.fen(), last: board.lastMove, moves: g.moves, quiet: g.quiet, queened: g.queened });
    later(() => afterWhite(move), 0);
    return true;
  }

  async function afterWhite(move) {
    const my = token;
    g.moves++;
    g.quiet = move.piece === 'p' || move.captured ? 0 : g.quiet + 1;
    board.setMovable('none');
    board.setShapes([]);
    addFeed(move, 'you');
    const fen = board.fen();
    const c = new Chess(fen);
    if (c.isCheckmate()) { win(`Checkmate in ${g.moves} move${g.moves === 1 ? '' : 's'}!`); return; }
    const problem = quickProblem(fen);
    if (problem) { mistake(problem.kind === 'stalemate' ? 'Stalemate!' : 'Careful!', problem.text, problem.square); return; }
    if (id === 'promotion' && move.promotion && !g.queened) {
      g.queened = true;
      win('Promoted safely!', true);
      return;
    }
    if (id === 'promotion') {
      // Some king moves throw the win away (opposition). Ask the engine.
      el.setPrompt('opp', 'Checking the position…');
      const sc = await evaluate(fen);
      if (my !== token) return;
      if (sc && sc.mate === undefined && sc.cp > -300) {
        mistake('That lets the win slip', 'After this move Black can hold the draw (the engine no longer sees a win). Usually the fix is to keep your king in front of the pawn and use the opposition. Take it back and try another move.');
        return;
      }
    }
    if (g.quiet >= 50) { lose('50 moves without a capture or pawn move: that is a draw by the 50-move rule. Mate faster next time: shrink the box every move.'); return; }
    blackMove();
  }

  function evaluate(fen) {
    // Score from Black's side (Black to move); a winning White shows as a negative cp or mate.
    return new Promise((resolve) => {
      let last = null;
      engine.analyze(fen, { depth: 14, onInfo: (m) => { last = m; }, onDone: () => resolve(last) });
    });
  }

  function blackMove() {
    const my = token;
    el.setPrompt('opp', 'Black is thinking…');
    engine.bestMove(board.fen(), { movetime: 350, skill: 20 }).then((uci) => {
      if (my !== token || !uci || g.over) return;
      later(() => {
        const m = board.play({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
        addFeed(m, 'opp');
        const c = new Chess(board.fen());
        if (m.captured === 'p') { lose('Black took your pawn, so it is a draw (a lone king can\'t mate). Keep your king close to the pawn.'); return; }
        if (c.isInsufficientMaterial() || c.isDraw()) { lose('The game ended in a draw.'); return; }
        yourTurn();
      }, 250);
    });
  }

  function mistake(title, text, square) {
    g.mistakes++;
    board.setMovable('none');
    if (square) board.setShapes([circle(square, 'red')]);
    el.setPrompt('wrong', h('b', null, title), text,
      h('div', { class: 'btn-row' }, h('button', { class: 'btn primary small', onClick: takeBack }, '↩ Take it back')));
  }

  function takeBack() {
    const prev = g.history.pop();
    if (!prev) return;
    token++;
    engine.stop();
    board.setFen(prev.fen, prev.last);
    Object.assign(g, { moves: prev.moves, quiet: prev.quiet, queened: prev.queened });
    board.setShapes([]);
    el.feed.firstChild?.remove();
    yourTurn();
  }

  function hint() {
    if (g.over || board.chess.turn() !== 'w') return;
    g.hints++;
    const my = token;
    el.setPrompt('you', 'Looking for the best move…');
    engine.bestMove(board.fen(), { movetime: 700, skill: 20 }).then((uci) => {
      if (my !== token || !uci) return;
      board.setShapes([arrow(uci.slice(0, 2), uci.slice(2, 4), 'yellow')]);
      yourTurn(h('div', { class: 'muted small' }, 'Hint: the engine\'s move is shown in yellow.'));
    });
  }

  function addFeed(m, who) {
    el.feed.prepend(h('div', { class: `feed-item ${who}` },
      h('div', { class: 'feed-head' }, h('span', { class: 'feed-move' }, m.san), h('span', { class: 'muted small' }, who === 'opp' ? 'Black' : 'You'))));
  }

  function grade(clean, won) {
    if (!won) return 0;
    if (!clean) return 1;
    return pos().mate && g.moves <= pos().mate ? 3 : 2;
  }

  function finishButtons(gr) {
    const buttons = [];
    if (review) {
      const card = gradeCard(mateCardId(id), 'w', gr, { mistakes: g.mistakes, hints: g.hints });
      renderNav();
      buttons.push(h('span', { class: 'muted small' }, `Graded ${GRADES[gr].label} · next review in ${fmtWait(card.due - Date.now())}`));
      buttons.push(h('button', { class: 'btn primary', onClick: () => (rest.length ? go('session', { mode: 'review', queue: rest }) : go('home')) }, rest.length ? 'Next review →' : 'Done'));
    } else {
      buttons.push(h('button', { class: 'btn primary', onClick: () => start(pick()) }, 'Next position'));
      buttons.push(h('button', { class: 'btn', onClick: () => start(g.pos) }, 'Same position again'));
      buttons.push(h('button', { class: 'btn ghost', onClick: () => go('mates') }, 'All checkmates'));
    }
    return h('div', { class: 'btn-row' }, buttons);
  }

  function win(title, promoted = false) {
    const clean = g.mistakes === 0 && g.hints === 0;
    g.over = true;
    board.setMovable('none');
    if (!continued) p.solved++;
    let levelUp = '';
    if (clean && !continued && g.pos.level === p.level && p.level < set.length - 1) {
      p.level++;
      p.unlocked = Math.max(p.unlocked, p.level);
      levelUp = `Level ${p.level + 1} unlocked: ${LEVEL_NAMES[t.practice.set][p.level]}.`;
    }
    if (!getCard(mateCardId(id), 'w')) learnCard(mateCardId(id), 'w');
    store.save();
    const best = pos().mate && !promoted && !continued ? ` Best possible: mate in ${pos().mate}.` : '';
    const extra = [];
    if (promoted) extra.push(h('button', { class: 'btn', onClick: () => go('matePractice', { id: 'queen', fen: board.fen(), continued: true }) }, 'Keep going: mate with the queen'));
    el.setPrompt('done', h('b', null, `${title} ✓`),
      (clean ? 'No mistakes, no hints.' : `${g.mistakes} mistake${g.mistakes === 1 ? '' : 's'}, ${g.hints} hint${g.hints === 1 ? '' : 's'}.`) + best,
      levelUp && h('div', { class: 'prompt-sub' }, h('b', null, levelUp)),
      extra.length && h('div', { class: 'btn-row' }, extra),
      finishButtons(grade(clean, true)));
    renderControls();
  }

  function lose(text) {
    g.over = true;
    board.setMovable('none');
    if (p.level > 0 && !continued) { p.level--; store.save(); }
    el.setPrompt('wrong', h('b', null, 'Draw'), text, finishButtons(0));
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
  if (startFen) start({ fen: startFen, level: p.level });
  else start(pick());

  return () => { token++; timers.forEach(clearTimeout); engine.stop(); board?.destroy(); };
}
