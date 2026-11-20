// "Proposals": review lines proposed for the built-in repertoire before they ship.
// Only available when running from source; files live in content/proposals/.
import { Chess } from 'chess.js';
import { h, fill, toast, modal, sideName } from '../ui.js';
import { Board, START_FEN, arrow } from '../board.js';
import { content } from '../content.js';
import { invalidate } from '../repertoire.js';
import * as engine from '../engine.js';
import { go, renderNav } from '../app.js';

const STATUS = {
  pending: { label: 'Waiting for review', cls: 'new' },
  changes: { label: 'Changes requested', cls: 'learning' },
  rejected: { label: 'Rejected', cls: '' },
};

export function proposalsView(root, { file } = {}) {
  const page = h('div', { class: 'page narrow' }, h('p', { class: 'muted' }, 'Loading…'));
  root.append(page);
  window.api.proposals.list().then((list) => {
    if (list === null) return fill(page, h('h1', null, 'Proposals'), h('p', { class: 'muted' }, 'Reviewing proposals is only available when the app runs from source.'));
    const prop = file && list.find((p) => p.file === file);
    if (prop) { page.remove(); reviewView(root, prop); return; }
    fill(page,
      h('h1', null, 'Proposed lines'),
      h('p', { class: 'muted' }, 'New or changed lines waiting for your check. Play each one through, then approve it (it goes into the repertoire) or send it back with a note.'),
      list.length === 0 && h('div', { class: 'card' }, h('p', { class: 'muted' }, 'Nothing to review right now.')),
      list.map((p) => {
        if (p.error) return h('div', { class: 'card' }, h('b', null, p.file), h('div', { class: 'error' }, 'Could not read: ' + p.error));
        const st = STATUS[p.review?.status || 'pending'] || STATUS.pending;
        const existing = findExisting(p.variation.id);
        return h('div', { class: 'card var-row' },
          h('div', { class: 'var-info' },
            h('div', { class: 'var-name' }, p.variation.name, ' ', h('span', { class: 'tag' }, existing ? 'changes a line' : 'new line')),
            h('div', { class: 'muted small' }, `${openingName(p)} · ${p.variation.moves.length} plies · ${(p.variation.sides || ['w', 'b']).map(sideName).join(' & ')}`),
            p.review?.note && h('div', { class: 'muted small' }, 'Your note: ', p.review.note)),
          h('div', { class: 'var-actions' },
            h('span', { class: `pill ${st.cls}` }, st.label),
            h('button', { class: 'btn small primary', onClick: () => go('proposals', { file: p.file }) }, 'Review')));
      }));
  });
}

function findExisting(id) {
  for (const o of content.openings) for (const v of o.variations) if (v.id === id) return { opening: o, variation: v };
  return null;
}

const openingName = (p) => p.newOpening?.name || content.openings.find((o) => o.id === p.opening)?.name || p.opening;

function reviewView(root, prop) {
  const v = prop.variation;
  const existing = findExisting(v.id)?.variation;

  // Precompute positions; stop at the first illegal move so it can be flagged.
  const chess = new Chess(v.startFen || START_FEN);
  const plies = [];
  let illegalAt = -1;
  for (const [san, why] of v.moves) {
    const fenBefore = chess.fen();
    let m;
    try { m = chess.move(san); } catch { illegalAt = plies.length; break; }
    plies.push({ san: m.san, why, from: m.from, to: m.to, fenBefore, fenAfter: chess.fen() });
  }
  // First ply where the proposal differs from the line it replaces.
  let diffFrom = -1;
  if (existing) {
    diffFrom = v.moves.findIndex((m, i) => !existing.moves[i] || existing.moves[i][0] !== m[0]);
    if (diffFrom < 0 && existing.moves.length !== v.moves.length) diffFrom = v.moves.length;
  }
  const whyChanged = (i) => existing && existing.moves[i] && existing.moves[i][0] === v.moves[i][0] && existing.moves[i][1] !== v.moves[i][1];

  let idx = 0; // number of plies played on the board
  const boardEl = h('div', { class: 'cg-board' });
  const evalEl = h('span', { class: 'score' }, '–');
  const listEl = h('div', { class: 'why-list' });
  const noteEl = h('textarea', { class: 'input', rows: 3, placeholder: 'What should change? (e.g. "12...Qc7 is not the main move, use 12...Rc8")' }, prop.review?.note || '');

  const layout = h('div', { class: 'board-layout' },
    h('div', { class: 'board-col' },
      h('div', { class: 'board-wrap' }, boardEl),
      h('div', { class: 'controls' },
        h('button', { class: 'btn small', onClick: () => goTo(0) }, '⏮'),
        h('button', { class: 'btn small', onClick: () => goTo(idx - 1) }, '◀'),
        h('button', { class: 'btn small', onClick: () => goTo(idx + 1) }, '▶'),
        h('button', { class: 'btn small', onClick: () => goTo(plies.length) }, '⏭'),
        h('button', { class: 'btn small ghost', onClick: () => board.flip() }, 'Flip'),
        h('span', { class: 'muted small' }, 'Engine '), evalEl)),
    h('div', { class: 'side-col' },
      h('div', null, h('button', { class: 'btn ghost', onClick: () => go('proposals') }, '← All proposals')),
      h('h2', null, v.name),
      h('div', { class: 'muted' }, `${openingName(prop)} · ${existing ? 'replaces the current line' : 'new line'} · trains ${(v.sides || ['w', 'b']).map(sideName).join(' & ')}`),
      prop.notes && h('div', { class: 'callout' }, prop.notes),
      illegalAt >= 0 && h('div', { class: 'error' }, `Move ${illegalAt + 1} (${v.moves[illegalAt][0]}) is illegal. Send this back.`),
      existing && diffFrom >= 0 && h('div', { class: 'muted small' }, `Moves differ from the current line from ply ${diffFrom + 1} (marked ●). Explanations that changed are marked ✎.`),
      v.summary && h('p', { class: 'prose' }, v.summary),
      v.plans && h('div', { class: 'plans small' }, ['w', 'b'].filter((s) => v.plans[s]).map((s) => h('div', { class: 'plan' }, h('b', null, sideName(s) + ': '), v.plans[s]))),
      listEl,
      h('div', { class: 'card' },
        h('h3', null, 'Your verdict'),
        noteEl,
        h('div', { class: 'btn-row' },
          h('button', { class: 'btn primary', disabled: illegalAt >= 0, onClick: approve }, 'Approve'),
          h('button', { class: 'btn', onClick: () => review('changes') }, 'Request changes'),
          h('button', { class: 'btn ghost', onClick: () => review('rejected') }, 'Reject')),
        h('p', { class: 'muted small' }, 'Approving adds the line to the repertoire right away. Tell Claude afterwards so it can commit (and publish) it. Notes from "Request changes" are saved in the proposal file for Claude to read.'))));
  root.append(layout);

  const board = new Board(boardEl, { fen: v.startFen || START_FEN, movable: 'none', orientation: (v.sides || ['w'])[0] === 'b' ? 'black' : 'white' });

  function renderList() {
    fill(listEl, plies.map((p, i) => {
      const num = Math.floor(i / 2) + 1 + (i % 2 ? '…' : '.');
      return h('div', { class: 'why-row review-row' + (i === idx - 1 ? ' current' : ''), onClick: () => goTo(i + 1) },
        h('div', { class: 'why-san' }, `${num} ${p.san}`, diffFrom >= 0 && i >= diffFrom ? ' ●' : '', whyChanged(i) ? ' ✎' : ''),
        h('div', { class: 'feed-why' }, p.why || h('span', { class: 'error' }, 'No explanation')));
    }));
    listEl.querySelector('.current')?.scrollIntoView({ block: 'nearest' });
  }

  function goTo(n) {
    idx = Math.max(0, Math.min(plies.length, n));
    const fen = idx ? plies[idx - 1].fenAfter : (v.startFen || START_FEN);
    board.setFen(fen, idx ? [plies[idx - 1].from, plies[idx - 1].to] : undefined);
    const next = plies[idx];
    board.setShapes(next ? [arrow(next.from, next.to)] : []);
    renderList();
    evalEl.textContent = '…';
    engine.analyze(fen, {
      depth: 16,
      onInfo: (m) => { evalEl.textContent = `${engine.fmtScore(engine.toWhite(m, fen))} (d${m.depth}) best ${engine.pvToSan(fen, m.pv, 1)}`; },
    });
  }

  async function approve() {
    if (!confirm(`Add "${v.name}" to the repertoire?`)) return;
    try {
      const pack = await window.api.proposals.approve(prop.file);
      content.use(pack);
      invalidate();
      toast('Approved and added to the repertoire');
      renderNav();
      go('proposals');
    } catch (e) { modal('Could not approve', h('p', null, String(e.message || e)), [{ label: 'OK', primary: true }]); }
  }

  async function review(status) {
    if (status === 'changes' && !noteEl.value.trim()) { toast('Write what should change first'); noteEl.focus(); return; }
    await window.api.proposals.review(prop.file, status, noteEl.value.trim());
    toast(status === 'changes' ? 'Sent back with your note' : 'Rejected');
    go('proposals');
  }

  const onKey = (e) => {
    if (e.target.matches?.('input,textarea,select')) return;
    if (e.key === 'ArrowLeft') goTo(idx - 1);
    else if (e.key === 'ArrowRight') goTo(idx + 1);
    else if (e.key === 'Home') goTo(0);
    else if (e.key === 'End') goTo(plies.length);
  };
  window.addEventListener('keydown', onKey);
  goTo(0);
  return () => { window.removeEventListener('keydown', onKey); board.destroy(); };
}
