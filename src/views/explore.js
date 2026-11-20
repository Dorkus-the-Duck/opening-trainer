// Free analysis board: move tree with variations, engine, book moves, position notes, saved studies,
// play-vs-engine, and "save this line to my repertoire".
import { Chess } from 'chess.js';
import { h, fill, clear, modal, toast, sideName } from '../ui.js';
import { Board, START_FEN, arrow } from '../board.js';
import { getVariation, bookMoves, fenKey } from '../repertoire.js';
import * as engine from '../engine.js';
import { store } from '../store.js';
import { go } from '../app.js';

export function exploreView(root, params = {}) {
  // ---------- move tree ----------
  let nodes, cur, startFen;
  function resetTree(fen = START_FEN) {
    startFen = fen;
    nodes = [{ id: 0, fen, san: null, parent: null, children: [] }];
    cur = 0;
  }
  function addMove(fromId, san) {
    const parent = nodes[fromId];
    const existing = parent.children.map((c) => nodes[c]).find((n) => n.san === san);
    if (existing) return existing.id;
    const chess = new Chess(parent.fen);
    const m = chess.move(san);
    const node = { id: nodes.length, fen: chess.fen(), san: m.san, from: m.from, to: m.to, uci: m.from + m.to + (m.promotion || ''), parent: fromId, children: [] };
    nodes.push(node);
    parent.children.push(node.id);
    return node.id;
  }
  function pathTo(id) {
    const out = [];
    for (let n = nodes[id]; n.parent !== null; n = nodes[n.parent]) out.unshift(n);
    return out;
  }
  function serialize() {
    return nodes.slice(1).filter((n) => !n.deleted).map((n) => ({ id: n.id, parent: n.parent, san: n.san }));
  }
  function restore(fen, list, curId) {
    resetTree(fen);
    const map = { 0: 0 };
    for (const n of list) if (map[n.parent] !== undefined) map[n.id] = addMove(map[n.parent], n.san);
    cur = map[curId] ?? 0;
  }

  // ---------- layout ----------
  const boardEl = h('div', { class: 'cg-board' });
  const evalBar = h('div', { class: 'evalbar' }, h('div', { class: 'evalbar-fill' }));
  const movesEl = h('div', { class: 'movetree' });
  const navEl = h('div', { class: 'nav-row' });
  const engineEl = h('div', { class: 'engine-pane' });
  const bookEl = h('div', { class: 'book-pane' });
  const notesEl = h('div', { class: 'notes-pane' });
  const toolsEl = h('div', { class: 'tools' });
  const titleEl = h('div', { class: 'explore-title' });
  const tabsEl = h('div', { class: 'subtabs' });
  const tabBody = h('div', { class: 'tab-body' });

  root.append(h('div', { class: 'board-layout' },
    h('div', { class: 'board-col' },
      h('div', { class: 'board-and-bar' }, evalBar, h('div', { class: 'board-wrap' }, boardEl)),
      navEl, toolsEl),
    h('div', { class: 'side-col' }, titleEl, engineEl, movesEl, tabsEl, tabBody)));

  let engineOn = true;
  let vsEngine = null; // 'w' | 'b' | null: the colour the engine plays
  let tab = 'book';
  let title = 'Free exploration';

  // ---------- init from params ----------
  resetTree();
  if (params.varId) {
    const v = getVariation(params.varId);
    if (v) {
      resetTree(v.startFen);
      let id = 0;
      for (const p of v.plies) id = addMove(id, p.san);
      cur = params.toPly !== undefined ? pathIdAt(params.toPly) : 0;
      title = `${v.openingName}: ${v.name}`;
    }
  } else if (params.study) {
    const st = store.data.studies.find((x) => x.id === params.study);
    if (st) { restore(st.startFen, st.nodes, st.cur); title = st.name; }
  } else if (params.noteKey) {
    const n = store.data.notes[params.noteKey];
    if (n) {
      resetTree(n.startFen || START_FEN);
      let id = 0;
      for (const san of n.line || []) id = addMove(id, san);
      cur = id;
      if (fenKey(nodes[cur].fen) !== params.noteKey) { resetTree(params.noteKey + ' 0 1'); }
    }
  }
  function pathIdAt(ply) {
    let id = 0;
    for (let i = 0; i < ply && nodes[id].children.length; i++) id = nodes[id].children[0];
    return id;
  }

  const board = new Board(boardEl, {
    fen: nodes[cur].fen,
    orientation: params.side === 'b' ? 'black' : 'white',
    movable: 'both',
    onMove: (move) => {
      if (vsEngine && nodes[cur].fen.split(' ')[1] === vsEngine) return false;
      cur = addMove(cur, move.san);
      setTimeout(() => { render(); maybeEngineMove(); }, 0);
      return true;
    },
  });

  // ---------- rendering ----------
  function render() {
    const node = nodes[cur];
    board.setFen(node.fen, node.from ? [node.from, node.to] : undefined);
    board.setMovable(vsEngine ? (vsEngine === 'w' ? 'black' : 'white') : 'both');
    board.setShapes([]);
    evalBar.classList.toggle('flip', board.orientation() === 'black');
    fill(titleEl, h('h2', null, title), h('div', { class: 'muted small' }, gameStatus(node.fen)));
    renderMoves();
    renderNavRow();
    renderTab();
    analyse();
  }

  function gameStatus(fen) {
    const c = new Chess(fen);
    if (c.isCheckmate()) return 'Checkmate';
    if (c.isStalemate()) return 'Stalemate';
    if (c.isDraw()) return 'Draw';
    return `${sideName(c.turn())} to move`;
  }

  function moveLabel(node, forceNum) {
    const parentFen = nodes[node.parent].fen;
    const [, turn, , , , num] = parentFen.split(' ');
    if (turn === 'w') return `${num}. ${node.san}`;
    return forceNum ? `${num}... ${node.san}` : node.san;
  }

  function moveSpan(node, forceNum) {
    const hasNote = !!store.data.notes[fenKey(node.fen)]?.text;
    return h('span', {
      class: 'mv' + (node.id === cur ? ' current' : '') + (hasNote ? ' noted' : ''),
      onClick: () => { cur = node.id; render(); },
    }, moveLabel(node, forceNum));
  }

  function lineEls(fromId, forceFirst) {
    const out = [];
    let n = nodes[fromId];
    let force = forceFirst;
    while (n.children.length) {
      const [mainId, ...alts] = n.children;
      out.push(moveSpan(nodes[mainId], force));
      force = false;
      for (const a of alts) {
        out.push(h('span', { class: 'variation' }, '(', moveSpan(nodes[a], true), ...lineEls(a, false), ')'));
        force = true;
      }
      n = nodes[mainId];
    }
    return out;
  }

  function renderMoves() {
    fill(movesEl, nodes.length > 1 ? h('div', null, ...lineEls(0, true)) : h('div', { class: 'muted small' }, 'Make a move on the board, or load a line from the Book tab.'));
    movesEl.querySelector('.current')?.scrollIntoView({ block: 'nearest' });
  }

  function renderNavRow() {
    const btn = (label, title, fn, dis) => h('button', { class: 'btn small', title, disabled: dis, onClick: fn }, label);
    const node = nodes[cur];
    fill(navEl, 
      btn('⏮', 'Start (Home)', () => { cur = 0; render(); }, cur === 0),
      btn('◀', 'Back (←)', back, cur === 0),
      btn('▶', 'Forward (→)', forward, !node.children.length),
      btn('⏭', 'End (End)', () => { while (nodes[cur].children.length) cur = nodes[cur].children[0]; render(); }, !node.children.length),
      btn('⇅', 'Flip board (F)', flip),
      btn('Promote', 'Make this move the main line', promote, !(node.parent !== null && nodes[node.parent].children[0] !== cur)),
      btn('Delete', 'Delete this move and everything after it', del, cur === 0),
    );
  }

  function flip() { board.flip(); evalBar.classList.toggle('flip', board.orientation() === 'black'); }
  function back() { if (nodes[cur].parent !== null) { cur = nodes[cur].parent; render(); } }
  function forward() { if (nodes[cur].children.length) { cur = nodes[cur].children[0]; render(); } }
  function promote() {
    const p = nodes[nodes[cur].parent];
    p.children = [cur, ...p.children.filter((c) => c !== cur)];
    render();
  }
  function del() {
    const node = nodes[cur];
    const p = nodes[node.parent];
    p.children = p.children.filter((c) => c !== cur);
    const mark = (id) => { nodes[id].deleted = true; nodes[id].children.forEach(mark); };
    mark(cur);
    cur = p.id;
    render();
  }

  // ---------- engine ----------
  function analyse() {
    engine.stop();
    const fen = nodes[cur].fen;
    if (!engineOn || new Chess(fen).isGameOver()) {
      evalBar.style.visibility = engineOn ? 'visible' : 'hidden';
      fill(engineEl, engineHeader());
      return;
    }
    evalBar.style.visibility = 'visible';
    const linesEl = h('div', { class: 'engine-lines' }, h('div', { class: 'muted small' }, 'Thinking…'));
    fill(engineEl, engineHeader(), linesEl);
    const best = {};
    engine.analyze(fen, {
      multipv: 3,
      onInfo: (m) => {
        if (m.depth > 30) return;
        best[m.multipv] = m;
        if (m.multipv === 1) {
          const sc = engine.toWhite(m, fen);
          evalBar.firstChild.style.height = `${(engine.whiteShare(sc) * 100).toFixed(1)}%`;
          evalBar.title = engine.fmtScore(sc);
          if (m.pv[0]) board.setShapes([arrow(m.pv[0].slice(0, 2), m.pv[0].slice(2, 4), 'paleBlue')]);
        }
        fill(linesEl, ...Object.keys(best).sort().map((k) => {
          const i = best[k];
          return h('div', {
            class: 'engine-line clickable', title: 'Click to play the first move',
            onClick: () => { const mv = new Chess(fen).move({ from: i.pv[0].slice(0, 2), to: i.pv[0].slice(2, 4), promotion: i.pv[0][4] }); cur = addMove(cur, mv.san); render(); },
          }, h('span', { class: 'score' }, engine.fmtScore(engine.toWhite(i, fen))), h('span', { class: 'pv' }, engine.pvToSan(fen, i.pv, 10)));
        }), h('div', { class: 'muted tiny' }, `Stockfish 19 · depth ${best[1]?.depth ?? ''}`));
      },
    });
  }

  function engineHeader() {
    return h('div', { class: 'engine-head' },
      h('label', { class: 'toggle' }, h('input', { type: 'checkbox', checked: engineOn, onChange: (e) => { engineOn = e.target.checked; if (!engineOn) board.setShapes([]); analyse(); } }), ' Engine analysis'),
      h('select', {
        class: 'select small', title: 'Play against the engine from this position',
        onChange: (e) => {
          vsEngine = e.target.value || null;
          if (vsEngine) { engineOn = false; board.setOrientation(vsEngine === 'w' ? 'black' : 'white'); }
          render();
          maybeEngineMove();
        },
      },
      h('option', { value: '' }, 'Analysis mode'),
      h('option', { value: 'b', selected: vsEngine === 'b' }, 'Play vs engine: I\'m White'),
      h('option', { value: 'w', selected: vsEngine === 'w' }, 'Play vs engine: I\'m Black')),
      vsEngine && h('select', {
        class: 'select small', title: 'Engine strength',
        onChange: (e) => { store.data.settings.engineSkill = +e.target.value; store.save(); },
      }, [[3, 'Easy'], [8, 'Club'], [14, 'Strong'], [20, 'Full strength']].map(([v, l]) => h('option', { value: v, selected: store.data.settings.engineSkill === v }, l))));
  }

  async function maybeEngineMove() {
    const fen = nodes[cur].fen;
    if (!vsEngine || fen.split(' ')[1] !== vsEngine || new Chess(fen).isGameOver()) return;
    const at = cur;
    const uci = await engine.bestMove(fen, { movetime: 700, skill: store.data.settings.engineSkill });
    if (!uci || cur !== at || !vsEngine) return;
    const mv = new Chess(fen).move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
    cur = addMove(cur, mv.san);
    render();
  }

  // ---------- side tabs ----------
  function renderTab() {
    const tabs = [['book', 'Book'], ['notes', 'Notes'], ['studies', 'Saved studies']];
    fill(tabsEl, ...tabs.map(([id, label]) => h('button', { class: 'subtab' + (tab === id ? ' active' : ''), onClick: () => { tab = id; renderTab(); } }, label)));
    clear(tabBody);
    if (tab === 'book') renderBook();
    if (tab === 'notes') renderNotes();
    if (tab === 'studies') renderStudies();
  }

  function renderBook() {
    const node = nodes[cur];
    if (node.parent !== null) {
      const played = bookMoves(nodes[node.parent].fen).find((b) => b.san === node.san);
      tabBody.append(h('div', { class: 'book-last' + (played ? '' : ' off') },
        h('div', { class: 'small muted' }, 'Last move'),
        played
          ? [h('div', null, h('b', null, moveLabel(node, true)), h('span', { class: 'muted small' }, ` · ${played.lines.map((l) => l.name).join(', ')}`)), h('p', null, played.why)]
          : h('div', null, h('b', null, moveLabel(node, true)), ' is not in your repertoire lines.')));
    }
    const list = bookMoves(node.fen);
    tabBody.append(h('div', { class: 'small muted' }, list.length ? 'Repertoire moves from here' : 'No repertoire moves from this position.'));
    for (const b of list) {
      tabBody.append(h('div', { class: 'book-move', onClick: () => { cur = addMove(cur, b.san); render(); } },
        h('div', null, h('b', null, b.san), h('span', { class: 'muted small' }, ` · ${b.lines.map((l) => l.name).join(', ')}`)),
        b.why && h('div', { class: 'small' }, b.why)));
    }
  }

  let noteTimer = null;
  function renderNotes() {
    const node = nodes[cur];
    const key = fenKey(node.fen);
    const existing = store.data.notes[key];
    const ta = h('textarea', {
      class: 'note-input', rows: 6, placeholder: 'Write a note about this position: plans, traps, what you keep forgetting… Notes are tied to the position, so they also show up in drills when you reach it.',
      value: existing?.text || '',
      onInput: (e) => {
        clearTimeout(noteTimer);
        const text = e.target.value;
        noteTimer = setTimeout(() => {
          if (text.trim()) store.data.notes[key] = { text, updated: Date.now(), startFen, line: pathTo(cur).map((n) => n.san) };
          else delete store.data.notes[key];
          store.save();
          renderMoves();
          if (all) renderAll();
        }, 400);
      },
    });
    let all = null;
    const renderAll = () => {
      const entries = Object.entries(store.data.notes).sort((a, b) => b[1].updated - a[1].updated);
      fill(all, h('div', { class: 'small muted' }, `All notes (${entries.length})`),
        ...entries.map(([k, n]) => h('div', { class: 'note-row' + (k === key ? ' current' : '') },
          h('div', { class: 'note-line small muted' }, n.line?.length ? lineText(n.line, n.startFen) : 'Position'),
          h('div', { class: 'note-text' }, n.text.length > 140 ? n.text.slice(0, 140) + '…' : n.text),
          k !== key && h('button', { class: 'btn tiny', onClick: () => openNote(n) }, 'Open'))));
    };
    all = h('div', { class: 'notes-all' });
    tabBody.append(h('div', { class: 'small muted' }, 'Note for this position'), ta, all);
    renderAll();
  }

  function lineText(sans, fen = START_FEN) {
    const c = new Chess(fen);
    const out = [];
    for (const s of sans) {
      const [, turn, , , , num] = c.fen().split(' ');
      try { c.move(s); } catch { break; }
      out.push(turn === 'w' ? `${num}.${s}` : out.length ? s : `${num}...${s}`);
    }
    return out.join(' ');
  }

  function openNote(n) {
    resetTree(n.startFen || START_FEN);
    let id = 0;
    for (const s of n.line || []) id = addMove(id, s);
    cur = id;
    title = 'Note';
    render();
  }

  function renderStudies() {
    const name = h('input', { class: 'input', placeholder: 'Study name', value: title !== 'Free exploration' ? title : '' });
    tabBody.append(
      h('div', { class: 'row' }, name, h('button', {
        class: 'btn small primary',
        onClick: () => {
          const nm = name.value.trim() || `Study ${store.data.studies.length + 1}`;
          const existing = store.data.studies.find((s) => s.name === nm);
          const data = { id: existing?.id || `st-${Date.now()}`, name: nm, startFen, nodes: serialize(), cur, updated: Date.now() };
          if (existing) Object.assign(existing, data); else store.data.studies.unshift(data);
          store.save();
          title = nm;
          toast(existing ? 'Study updated' : 'Study saved');
          render();
        },
      }, 'Save')),
      h('div', { class: 'small muted' }, 'Saves the whole move tree, including side variations.'),
      ...store.data.studies.map((st) => h('div', { class: 'note-row' },
        h('div', null, h('b', null, st.name), h('span', { class: 'muted small' }, ` · ${st.nodes.length} moves · ${new Date(st.updated).toLocaleDateString()}`)),
        h('div', { class: 'row' },
          h('button', { class: 'btn tiny', onClick: () => { restore(st.startFen, st.nodes, st.cur); title = st.name; render(); } }, 'Open'),
          h('button', { class: 'btn tiny ghost', onClick: () => { if (confirm(`Delete study "${st.name}"?`)) { store.data.studies = store.data.studies.filter((x) => x !== st); store.save(); renderTab(); } } }, 'Delete')))));
  }

  // ---------- tools ----------
  function renderTools() {
    fill(toolsEl, 
      h('button', { class: 'btn small', onClick: () => { resetTree(); title = 'Free exploration'; render(); } }, 'New board'),
      h('button', { class: 'btn small', onClick: loadDialog }, 'Load FEN / PGN'),
      h('button', { class: 'btn small', onClick: copyDialog }, 'Copy FEN / PGN'),
      h('button', { class: 'btn small primary', onClick: saveAsLine, title: 'Turn the moves leading to this position into a repertoire line you can learn and drill' }, 'Save line to repertoire…'));
  }

  function loadDialog() {
    const ta = h('textarea', { class: 'note-input', rows: 6, placeholder: 'Paste a FEN, or PGN / moves like: 1.e4 c6 2.d4 d5' });
    const err = h('div', { class: 'error small' });
    modal('Load position', h('div', null, ta, err), [
      { label: 'Cancel' },
      {
        label: 'Load', primary: true,
        onClick: () => {
          const txt = ta.value.trim();
          if (!txt) return false;
          try {
            if (/^[rnbqkpRNBQKP1-8]+(\/[rnbqkpRNBQKP1-8]+){7}\s/.test(txt)) {
              new Chess(txt); // validates
              resetTree(txt);
            } else {
              const c = new Chess();
              c.loadPgn(txt);
              const hdrFen = c.getHeaders?.().FEN;
              resetTree(hdrFen || START_FEN);
              let id = 0;
              for (const m of c.history()) id = addMove(id, m);
              cur = id;
            }
          } catch (e) { err.textContent = 'Could not read that: ' + e.message; return false; }
          title = 'Loaded position';
          render();
          return true;
        },
      }]);
  }

  function copyDialog() {
    const path = pathTo(cur);
    const c = new Chess(startFen);
    for (const n of path) c.move(n.san);
    const fen = nodes[cur].fen;
    const pgn = c.pgn();
    modal('Copy position', h('div', null,
      h('div', { class: 'small muted' }, 'FEN'), h('textarea', { class: 'note-input mono', rows: 2, readonly: true, value: fen }),
      h('div', { class: 'small muted' }, 'Moves (PGN) to this position'), h('textarea', { class: 'note-input mono', rows: 4, readonly: true, value: pgn })), [
      { label: 'Copy FEN', onClick: () => { navigator.clipboard.writeText(fen); toast('FEN copied'); } },
      { label: 'Copy PGN', primary: true, onClick: () => { navigator.clipboard.writeText(pgn); toast('PGN copied'); } }]);
  }

  function saveAsLine() {
    const path = pathTo(cur);
    if (path.length < 2) { toast('Play at least a couple of moves first'); return; }
    go('editor', { draft: { startFen, moves: path.map((n) => [n.san, bookMoves(nodes[n.parent].fen).find((b) => b.san === n.san)?.why || '']) } });
  }

  // ---------- keys ----------
  const onKey = (e) => {
    if (e.target.closest('input,textarea,select')) return;
    if (e.key === 'ArrowLeft') { back(); e.preventDefault(); }
    else if (e.key === 'ArrowRight') { forward(); e.preventDefault(); }
    else if (e.key === 'Home') { cur = 0; render(); }
    else if (e.key === 'End') { while (nodes[cur].children.length) cur = nodes[cur].children[0]; render(); }
    else if (e.key === 'f') flip();
  };
  window.addEventListener('keydown', onKey);

  renderTools();
  render();

  return () => {
    window.removeEventListener('keydown', onKey);
    clearTimeout(noteTimer);
    engine.stop();
    board.destroy();
  };
}
