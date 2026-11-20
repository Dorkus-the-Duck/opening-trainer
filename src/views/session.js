// Learn / Drill session over a queue of { varId, side }.
// Learn: the trainer shows each of your moves (arrow + explanation) and you play it.
// Drill: you play the line from memory; mistakes get an engine comparison, then you grade it.
import { h, fill, sideName, sideIcon, clear } from '../ui.js';
import { Board, arrow, circle } from '../board.js';
import { getVariation, bookMoves, fenKey } from '../repertoire.js';
import { learnCard, gradeCard, getCard, suggestGrade, GRADES, fmtWait } from '../srs.js';
import * as engine from '../engine.js';
import { store } from '../store.js';
import { go, renderNav } from '../app.js';
import { openFeedback } from '../feedback.js';

export function sessionView(root, { mode = 'learn', queue = [] }) {
  if (!queue.length) { go('home'); return; }
  let qi = 0;
  let timers = [];
  let board = null;
  let s = null; // current line state
  const results = [];

  const later = (fn, ms) => { const t = setTimeout(fn, ms); timers.push(t); };
  const clearTimers = () => { timers.forEach(clearTimeout); timers = []; };

  // ---------- layout ----------
  const boardEl = h('div', { class: 'cg-board' });
  const evalBar = h('div', { class: 'evalbar' }, h('div', { class: 'evalbar-fill' }));
  const header = h('div', { class: 'session-head' });
  const prompt = h('div', { class: 'prompt' });
  const feed = h('div', { class: 'feed' });
  const enginePane = h('div', { class: 'engine-pane' });
  const controls = h('div', { class: 'controls' });
  const progress = h('div', { class: 'progress' }, h('div', { class: 'progress-fill' }));

  root.append(h('div', { class: 'board-layout' },
    h('div', { class: 'board-col' },
      h('div', { class: 'board-and-bar' }, evalBar, h('div', { class: 'board-wrap' }, boardEl)),
      progress),
    h('div', { class: 'side-col' }, header, prompt, controls, enginePane, feed)));

  const keyHandler = (e) => {
    if (e.target.closest('input,textarea')) return;
    if (e.key === 'h' && s && !s.done) hint();
  };
  window.addEventListener('keydown', keyHandler);

  // ---------- engine pane ----------
  let engineOn = mode === 'learn' ? true : store.data.settings.engineInSessions;
  function analysePosition() {
    engine.stop();
    if (!engineOn) { clear(enginePane); evalBar.style.visibility = 'hidden'; return; }
    evalBar.style.visibility = 'visible';
    const fen = board.fen();
    const lines = h('div', { class: 'engine-lines' }, h('div', { class: 'muted small' }, 'Thinking…'));
    fill(enginePane, lines);
    const best = {};
    engine.analyze(fen, {
      depth: store.data.settings.engineDepth, multipv: 2,
      onInfo: (m) => {
        best[m.multipv] = m;
        if (m.multipv === 1) setEvalBar(engine.toWhite(m, fen));
        fill(lines, ...Object.keys(best).sort().map((k) => {
          const i = best[k];
          return h('div', { class: 'engine-line' },
            h('span', { class: 'score' }, engine.fmtScore(engine.toWhite(i, fen))),
            h('span', { class: 'pv' }, engine.pvToSan(fen, i.pv, 8)));
        }), h('div', { class: 'muted tiny' }, `Stockfish 19 · depth ${best[1]?.depth ?? ''}`));
      },
    });
  }
  function setEvalBar(sc) {
    evalBar.firstChild.style.height = `${(engine.whiteShare(sc) * 100).toFixed(1)}%`;
    evalBar.title = engine.fmtScore(sc);
  }

  // ---------- line flow ----------
  function startLine() {
    clearTimers();
    const item = queue[qi];
    const v = getVariation(item.varId);
    if (!v) { next(); return; }
    s = {
      v, side: item.side, ply: 0, mistakes: 0, hints: 0, plyMiss: {}, done: false,
      userPlies: v.plies.filter((p) => p.color === item.side).length,
    };
    if (board) board.destroy();
    clear(boardEl);
    board = new Board(boardEl, {
      fen: v.startFen,
      orientation: item.side === 'w' ? 'white' : 'black',
      movable: 'none',
      onMove,
    });
    evalBar.classList.toggle('flip', item.side === 'b');
    clear(feed);
    const card = getCard(v.id, item.side);
    fill(header, 
      h('div', { class: 'session-mode' },
        mode === 'learn' ? 'Learn' : 'Drill',
        queue.length > 1 && h('span', { class: 'muted' }, ` · line ${qi + 1} of ${queue.length}`)),
      h('h2', null, v.name),
      h('div', { class: 'muted' }, `${v.openingName} · you play ${sideIcon(item.side)} ${sideName(item.side)}`),
      mode === 'review' && card && Object.keys(card.weakPlies || {}).length > 0 &&
        h('div', { class: 'muted small' }, `Weak spots so far: ${Object.keys(card.weakPlies).map((p) => plyLabel(v.plies[p], +p)).join(', ')}`),
    );
    if (mode === 'learn') {
      feed.append(h('div', { class: 'feed-item intro' },
        v.summary && h('p', null, v.summary),
        v.plans?.[item.side] && h('p', null, h('b', null, `Your plan as ${sideName(item.side)}: `), v.plans[item.side]),
        v.notes && h('p', { class: 'callout' }, '⚠ ', v.notes)));
    }
    renderControls();
    updateProgress();
    analysePosition();
    later(step, 400);
  }

  function plyLabel(p, i) {
    if (!p) return '?';
    const n = Math.floor(i / 2) + 1;
    return p.color === 'w' ? `${n}.${p.san}` : `${n}...${p.san}`;
  }

  function step() {
    const { v, side } = s;
    board.setShapes([]);
    updateProgress();
    if (s.ply >= v.plies.length) { finish(); return; }
    const p = v.plies[s.ply];
    if (p.color !== side) {
      board.setMovable('none');
      setPrompt('opp', `${sideName(p.color)} is moving…`);
      later(() => {
        board.play(p.san);
        addFeed(p, s.ply, 'opp');
        s.ply++;
        analysePosition();
        step();
      }, mode === 'learn' ? 700 : 450);
      return;
    }
    board.setMovable(side === 'w' ? 'white' : 'black');
    s.wrongHere = 0;
    s.hintHere = 0;
    if (mode === 'learn') {
      board.setShapes([arrow(p.from, p.to)]);
      setPrompt('you', h('span', null, 'Play ', h('b', null, plyLabel(p, s.ply)), ' (shown by the arrow).'), p.why);
    } else {
      setPrompt('you', 'Your move. What does the line call for here?');
    }
    showNote();
  }

  function onMove(move) {
    if (!s || s.done) return false;
    const p = s.v.plies[s.ply];
    if (!p || p.color !== s.side) return false;
    if (move.san === p.san) {
      board.setShapes([]);
      board.setMovable('none');
      addFeed(p, s.ply, s.wrongHere || s.hintHere ? 'you-miss' : 'you');
      s.ply++;
      later(() => { analysePosition(); step(); }, 60);
      return true;
    }
    // wrong move
    s.wrongHere++;
    s.mistakes++;
    s.plyMiss[s.ply] = true;
    const fenBefore = p.fenBefore;
    const alt = bookMoves(fenBefore).find((b) => b.san === move.san);
    const msg = h('div', { class: 'wrong' },
      h('div', null, h('b', null, `${move.san} isn't the move in this line.`),
        alt ? ` It is book in ${alt.lines.map((l) => l.name).join(', ')}, but here we're learning ${p.san}.` : ''),
      h('div', { class: 'compare muted small' }, 'Asking the engine how it compares…'));
    setPrompt('wrong', msg);
    const yourUci = move.from + move.to + (move.promotion || '');
    engine.evaluateMoves(fenBefore, [yourUci, p.uci], 14).then((sc) => {
      const cmp = msg.querySelector('.compare');
      if (!cmp || !sc[yourUci] || !sc[p.uci]) return;
      const diff = (engine.scoreValue(sc[p.uci]) - engine.scoreValue(sc[yourUci])) / 100;
      const fmt = (x) => engine.fmtScore(x); // mover's point of view
      cmp.textContent = `Engine, from your side: your ${move.san} ${fmt(sc[yourUci])} vs ${p.san} ${fmt(sc[p.uci])}. ` +
        (diff > 0.6 ? 'Yours is clearly worse.' : diff > 0.2 ? 'Yours is a bit worse.' : 'About equal for the engine, but stick to the line so you know the plans that follow.');
      analysePosition();
    });
    if (mode === 'learn' || s.wrongHere >= 2) board.setShapes([arrow(p.from, p.to)]);
    else later(() => board.setShapes([circle(p.from, 'yellow')]), 0);
    return false;
  }

  function hint() {
    const p = s.v.plies[s.ply];
    if (!p || p.color !== s.side) return;
    s.hints++;
    s.hintHere++;
    s.plyMiss[s.ply] = true;
    if (s.hintHere === 1) {
      board.setShapes([circle(p.from, 'yellow')]);
      setPrompt('you', 'Hint: the highlighted piece moves.', p.why ? `Idea: ${firstSentence(p.why)}` : null);
    } else {
      board.setShapes([arrow(p.from, p.to, 'yellow')]);
      setPrompt('you', h('span', null, 'The move is ', h('b', null, p.san), '.'), p.why);
    }
  }

  function firstSentence(t) {
    // Strip the move itself out of the idea so the hint doesn't give it away.
    const sentence = t.split(/(?<=\.)\s/)[0];
    return sentence;
  }

  function finish() {
    s.done = true;
    board.setMovable('none');
    updateProgress();
    const { v, side } = s;
    const missed = Object.keys(s.plyMiss).map(Number);
    clear(prompt);
    if (mode === 'learn') {
      const existed = !!getCard(v.id, side);
      learnCard(v.id, side);
      results.push({ v, side });
      prompt.className = 'prompt done';
      fill(prompt,
        h('h3', null, 'Line complete ✓'),
        h('p', null, existed
          ? 'Already in your review schedule. Drill it whenever you like.'
          : 'Added to your reviews. The first review comes in a few hours; after that the gaps grow as you remember it.'),
        h('div', { class: 'btn-row' },
          h('button', { class: 'btn primary', onClick: () => { mode = 'review'; startLine(); } }, 'Drill it now'),
          h('button', { class: 'btn', onClick: () => startLine() }, 'Walk through again'),
          h('button', { class: 'btn ghost', onClick: () => openExplore() }, 'Explore final position'),
          h('button', { class: 'btn', onClick: next }, qi + 1 < queue.length ? 'Next line →' : 'Done')));
    } else {
      const suggested = suggestGrade(s.mistakes, s.hints);
      prompt.className = 'prompt done';
      fill(prompt,
        h('h3', null, s.mistakes === 0 && s.hints === 0 ? 'Perfect run ✓' : `Finished: ${s.mistakes} mistake${s.mistakes === 1 ? '' : 's'}, ${s.hints} hint${s.hints === 1 ? '' : 's'}`),
        missed.length > 0 && h('p', { class: 'muted' }, 'Trouble spots: ', missed.map((i) => plyLabel(v.plies[i], i)).join(', ')),
        h('p', null, 'How well did you know it?'),
        h('div', { class: 'grade-row' }, GRADES.map((g) => h('button', {
          class: 'btn grade g' + g.id + (g.id === suggested ? ' suggested' : ''),
          title: g.hint,
          onClick: () => {
            const card = gradeCard(v.id, side, g.id, { mistakes: s.mistakes, hints: s.hints, missedPlies: missed });
            results.push({ v, side, grade: g.id, next: card.due - Date.now() });
            renderNav();
            next();
          },
        }, g.label, h('span', { class: 'tiny' }, previewInterval(g.id))))),
        h('div', { class: 'muted tiny' }, 'Suggested grade highlighted, based on your mistakes and hints.'));
    }
  }

  function previewInterval(g) {
    const c = getCard(s.v.id, s.side);
    if (g === 0) return '10m';
    const reps = c ? c.reps : 0, iv = c ? c.interval : 0, ease = c ? c.ease : 2.5;
    let d;
    if (g === 1) d = reps === 0 ? 1 : Math.max(1, Math.round(iv * 1.2));
    else {
      d = reps === 0 ? 1 : reps === 1 ? 3 : Math.round(iv * ease);
      if (g === 3) d = Math.round(d * 1.3) + 1;
    }
    return `${d}d`;
  }

  function next() {
    qi++;
    if (qi < queue.length) { startLine(); return; }
    // session summary
    clearTimers();
    engine.stop();
    clear(prompt).className = 'prompt done';
    fill(prompt,
      h('h3', null, mode === 'learn' ? 'Session complete' : 'Reviews done'),
      h('ul', { class: 'summary' }, results.map((r) => h('li', null,
        `${r.v.name} (${sideName(r.side)})`,
        r.grade !== undefined && h('span', { class: 'muted' }, ` · ${GRADES[r.grade].label}, next in ${fmtWait(r.next)}`)))),
      h('div', { class: 'btn-row' }, h('button', { class: 'btn primary', onClick: () => go('home') }, 'Back to repertoire')));
    clear(controls);
  }

  // ---------- panel helpers ----------
  function setPrompt(kind, main, sub) {
    prompt.className = 'prompt ' + kind;
    fill(prompt, h('div', { class: 'prompt-main' }, main), sub && h('div', { class: 'prompt-sub' }, sub));
  }

  function addFeed(p, i, kind) {
    const who = kind === 'opp' ? sideName(p.color) : 'You';
    const item = h('div', { class: `feed-item ${kind}` },
      h('div', { class: 'feed-head' },
        h('span', { class: 'feed-move' }, plyLabel(p, i)),
        h('span', { class: 'muted small' }, kind === 'you-miss' ? 'You (with help)' : who)),
      p.why && h('div', { class: 'feed-why' }, p.why));
    feed.prepend(item);
  }

  function showNote() {
    const n = store.data.notes[fenKey(board.fen())];
    if (n?.text) prompt.append(h('div', { class: 'note-chip' }, h('b', null, '📝 Your note: '), n.text));
  }

  function updateProgress() {
    const pct = s ? (s.ply / s.v.plies.length) * 100 : 0;
    progress.firstChild.style.width = `${pct}%`;
  }

  function openExplore() {
    go('explore', { varId: s.v.id, side: s.side, toPly: s.ply });
  }

  function renderControls() {
    fill(controls, 
      mode === 'review' && h('button', { class: 'btn small', onClick: hint, title: 'Shortcut: H' }, 'Hint'),
      h('button', { class: 'btn small', onClick: () => startLine() }, 'Restart line'),
      h('button', { class: 'btn small', onClick: openExplore }, 'Explore from here'),
      h('button', {
        class: 'btn small ghost', title: 'Report a wrong move or explanation in this line',
        onClick: () => openFeedback('line', s && [`Line: ${s.v.name} [${s.v.id}], training ${sideName(s.side)}, after ply ${s.ply}`]),
      }, '⚑ Report a problem'),
      h('label', { class: 'toggle' },
        h('input', {
          type: 'checkbox', checked: engineOn,
          onChange: (e) => {
            engineOn = e.target.checked;
            if (mode === 'review') { store.data.settings.engineInSessions = engineOn; store.save(); }
            analysePosition();
          },
        }), ' Engine'),
      h('button', { class: 'btn small ghost', onClick: () => go('home') }, 'Exit'));
  }

  startLine();

  return () => {
    clearTimers();
    window.removeEventListener('keydown', keyHandler);
    engine.stop();
    board?.destroy();
  };
}
