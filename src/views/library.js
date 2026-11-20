// "My Lines": user-made variations and openings, plus the editor used to create and edit them.
import { Chess } from 'chess.js';
import { h, clear, toast, sideName } from '../ui.js';
import { getOpenings, invalidate } from '../repertoire.js';
import { forgetCard } from '../srs.js';
import { store } from '../store.js';
import { START_FEN } from '../board.js';
import { go } from '../app.js';

export function libraryView(root) {
  const openingName = (id) => getOpenings().find((o) => o.id === id)?.name || '?';
  root.append(h('div', { class: 'page narrow' },
    h('h1', null, 'My lines'),
    h('p', { class: 'muted' }, 'Add your own variations (to an existing opening or a new one). They get the same Learn / Drill / spaced-repetition treatment as the built-in lines.'),
    h('div', { class: 'card' },
      h('h3', null, 'How to add a line'),
      h('ol', { class: 'prose' },
        h('li', null, 'Open ', h('a', { href: '#', onClick: (e) => { e.preventDefault(); go('explore'); } }, 'Explore & Study'), ' and play the moves (book moves are suggested in the Book tab).'),
        h('li', null, 'Click ', h('b', null, 'Save line to repertoire…'), ' under the board.'),
        h('li', null, 'Name it, choose the opening and which side(s) you train it from, and write why each move is played.'))),
    h('h2', { class: 'section' }, `Custom lines (${store.data.custom.length})`),
    store.data.custom.length === 0 && h('p', { class: 'muted' }, 'None yet.'),
    store.data.custom.map((v) => h('div', { class: 'card var-row' },
      h('div', { class: 'var-info' },
        h('div', { class: 'var-name' }, v.name),
        h('div', { class: 'muted small' }, `${openingName(v.openingId)} · ${v.moves.length} plies · ${(v.sides || ['w', 'b']).map(sideName).join(' & ')}`)),
      h('div', { class: 'var-actions' },
        h('button', { class: 'btn small', onClick: () => go('editor', { id: v.id }) }, 'Edit'),
        h('button', { class: 'btn small ghost', onClick: () => go('explore', { varId: v.id }) }, 'Explore'),
        h('button', {
          class: 'btn small ghost',
          onClick: () => {
            if (!confirm(`Delete "${v.name}"? Its review history is deleted too.`)) return;
            store.data.custom = store.data.custom.filter((x) => x !== v);
            forgetCard(v.id, 'w'); forgetCard(v.id, 'b');
            store.save(); invalidate(); go('library');
          },
        }, 'Delete')))),
    store.data.customOpenings.length > 0 && h('h2', { class: 'section' }, 'Custom openings'),
    store.data.customOpenings.map((o) => h('div', { class: 'card' },
      h('div', { class: 'card-head' }, h('h3', null, o.name),
        h('button', {
          class: 'btn small ghost',
          disabled: store.data.custom.some((v) => v.openingId === o.id),
          title: 'Delete its lines first',
          onClick: () => { store.data.customOpenings = store.data.customOpenings.filter((x) => x !== o); store.save(); invalidate(); go('library'); },
        }, 'Delete')),
      o.blurb && h('p', null, o.blurb))),
    h('h2', { class: 'section' }, 'Data'),
    ...(window.api.web ? [
      h('p', { class: 'muted small' }, 'Progress, notes, studies and custom lines are saved in this browser on this device. Download a backup to keep them safe or move them to another device.'),
      h('div', { class: 'btn-row' },
        h('button', { class: 'btn small', onClick: () => window.api.revealData() }, 'Download backup'),
        h('button', { class: 'btn small', onClick: async () => {
          if (await window.api.importData()) location.reload();
          else toast('That file is not an Opening Trainer backup');
        } }, 'Restore backup…')),
    ] : [
      h('p', { class: 'muted small' }, 'Progress, notes, studies and custom lines are stored in one JSON file on this computer. Back it up by copying that file.'),
      h('button', { class: 'btn small', onClick: () => window.api.revealData() }, 'Show data file'),
    ]),
  ));
}

export function editorView(root, { id, draft }) {
  const existing = id ? store.data.custom.find((v) => v.id === id) : null;
  const v = existing ? structuredClone(existing) : {
    id: `custom-${Date.now()}`, name: '', openingId: '', summary: '', plans: { w: '', b: '' }, sides: ['w', 'b'],
    startFen: draft?.startFen && draft.startFen !== START_FEN ? draft.startFen : undefined,
    moves: draft?.moves || [],
  };
  v.plans = v.plans || { w: '', b: '' };
  v.sides = v.sides || ['w', 'b'];

  // Guess the opening from the built-in books when the line starts from the initial position.
  if (!existing && !v.startFen) {
    const sans = v.moves.map((m) => m[0]).join(' ');
    if (sans.startsWith('e4 c6')) v.openingId = 'caro-kann';
    else if (sans.startsWith('e4 e5 Nf3 Nc6 Bc4')) v.openingId = 'italian';
  }

  const openings = getOpenings();
  const err = h('div', { class: 'error' });
  const newOpeningName = h('input', { class: 'input', placeholder: 'New opening name, e.g. Queen\'s Gambit Declined' });
  const openingSel = h('select', { class: 'select', onChange: () => { newOpeningName.style.display = openingSel.value === '__new' ? '' : 'none'; } },
    h('option', { value: '' }, 'Choose opening…'),
    openings.map((o) => h('option', { value: o.id, selected: o.id === v.openingId }, o.name)),
    h('option', { value: '__new' }, '+ New opening…'));
  newOpeningName.style.display = 'none';

  const field = (label, el) => h('label', { class: 'field' }, h('span', null, label), el);
  const nameIn = h('input', { class: 'input', value: v.name, placeholder: 'e.g. Advance Variation – Tal line' });
  const summaryIn = h('textarea', { class: 'note-input', rows: 2, value: v.summary || '', placeholder: 'One or two sentences on what the line is about' });
  const planW = h('textarea', { class: 'note-input', rows: 2, value: v.plans.w || '', placeholder: 'Plans for White' });
  const planB = h('textarea', { class: 'note-input', rows: 2, value: v.plans.b || '', placeholder: 'Plans for Black' });
  const sideW = h('input', { type: 'checkbox', checked: v.sides.includes('w') });
  const sideB = h('input', { type: 'checkbox', checked: v.sides.includes('b') });

  const chess = new Chess(v.startFen || START_FEN);
  const whyInputs = v.moves.map(([san, why], i) => {
    const [, turn, , , , num] = chess.fen().split(' ');
    chess.move(san);
    const ta = h('textarea', { class: 'note-input', rows: 1, value: why || '', placeholder: 'Why is this move played?' });
    return { san, label: turn === 'w' ? `${num}. ${san}` : `${num}... ${san}`, ta, i };
  });

  root.append(h('div', { class: 'page narrow' },
    h('button', { class: 'btn ghost', onClick: () => go('library') }, '← My lines'),
    h('h1', null, existing ? 'Edit line' : 'New repertoire line'),
    field('Line name', nameIn),
    field('Opening', h('div', { class: 'row' }, openingSel, newOpeningName)),
    field('Summary', summaryIn),
    h('div', { class: 'two-col' }, field('Plans for White', planW), field('Plans for Black', planB)),
    h('div', { class: 'field' }, h('span', null, 'Train it as'),
      h('div', { class: 'row' }, h('label', { class: 'toggle' }, sideW, ' White'), h('label', { class: 'toggle' }, sideB, ' Black'))),
    h('h2', { class: 'section' }, 'Moves & explanations'),
    h('p', { class: 'muted small' }, 'Explanations are optional but are what makes a line stick. Moves that already exist in the book were pre-filled.'),
    h('div', { class: 'why-list' }, whyInputs.map((w) => h('div', { class: 'why-row' }, h('div', { class: 'why-san' }, w.label), w.ta))),
    err,
    h('div', { class: 'btn-row' },
      h('button', { class: 'btn primary', onClick: save }, 'Save line'),
      h('button', { class: 'btn', onClick: () => go('library') }, 'Cancel')),
  ));

  function save() {
    const name = nameIn.value.trim();
    if (!name) { err.textContent = 'Give the line a name.'; return; }
    let openingId = openingSel.value;
    if (!openingId) { err.textContent = 'Choose an opening (or create a new one).'; return; }
    if (openingId === '__new') {
      const on = newOpeningName.value.trim();
      if (!on) { err.textContent = 'Name the new opening.'; return; }
      openingId = `custom-op-${Date.now()}`;
      store.data.customOpenings.push({ id: openingId, name: on, blurb: '', overview: [], plans: {} });
    }
    const sides = [sideW.checked && 'w', sideB.checked && 'b'].filter(Boolean);
    if (!sides.length) { err.textContent = 'Pick at least one side.'; return; }
    const out = {
      id: v.id, name, openingId, sides,
      summary: summaryIn.value.trim(),
      plans: { w: planW.value.trim(), b: planB.value.trim() },
      moves: whyInputs.map((w) => [w.san, w.ta.value.trim()]),
    };
    if (v.startFen) out.startFen = v.startFen;
    const idx = store.data.custom.findIndex((x) => x.id === v.id);
    if (idx >= 0) store.data.custom[idx] = out; else store.data.custom.push(out);
    store.save();
    invalidate();
    toast('Line saved, find it on the Repertoire page');
    go('home');
  }
}
