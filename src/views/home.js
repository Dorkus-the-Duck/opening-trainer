import { h, sideName, sideIcon } from '../ui.js';
import { getOpenings } from '../repertoire.js';
import { getCard, describeDue, dueCards } from '../srs.js';
import { store } from '../store.js';
import { go } from '../app.js';

export function homeView(root) {
  let side = store.data.settings.homeSide || 'w';

  function render() {
    root.replaceChildren();
    const due = dueCards();
    const openings = getOpenings();
    const all = openings.flatMap((o) => o.variations.flatMap((v) => v.sides.map((s) => ({ v, s }))));
    const learned = all.filter(({ v, s }) => getCard(v.id, s)).length;

    root.append(
      h('div', { class: 'page' },
        h('div', { class: 'hero' },
          h('div', null,
            h('h1', null, 'Your repertoire'),
            h('p', { class: 'muted' }, `${learned} of ${all.length} lines learned. Learn a line once, then the trainer schedules reviews just before you'd forget it.`)),
          h('div', { class: 'hero-actions' },
            h('button', {
              class: 'btn primary big', disabled: !due.length,
              onClick: () => go('session', { mode: 'review', queue: due }),
            }, due.length ? `Review ${due.length} due line${due.length > 1 ? 's' : ''}` : 'Nothing due'),
            h('button', { class: 'btn big', onClick: () => go('explore') }, 'Open the board'))),

        h('div', { class: 'tabs' },
          ['w', 'b'].map((s) => h('button', {
            class: 'tab' + (side === s ? ' active' : ''),
            onClick: () => { side = s; store.data.settings.homeSide = s; store.save(); render(); },
          }, `${sideIcon(s)}  Playing ${sideName(s)}`))),

        h('div', { class: 'opening-grid' },
          openings.filter((o) => o.variations.some((v) => v.sides.includes(side))).map((o) => openingCard(o, side))),
      ),
    );
  }

  function openingCard(o, side) {
    const vars = o.variations.filter((v) => v.sides.includes(side));
    const dueHere = vars.filter((v) => { const c = getCard(v.id, side); return c && c.due <= Date.now(); });
    const newHere = vars.filter((v) => !getCard(v.id, side));
    return h('div', { class: 'card opening-card' },
      h('div', { class: 'card-head' },
        h('div', null,
          h('h2', null, o.name),
          h('div', { class: 'muted small' }, [o.eco, o.moves].filter(Boolean).join(' · '))),
        h('button', { class: 'btn ghost', onClick: () => go('opening', { id: o.id, side }) }, 'Overview & plans →')),
      o.blurb && h('p', { class: 'blurb' }, o.blurb),
      h('div', { class: 'card-sub' },
        h('span', null, `As ${sideName(side)}: ${vars.length - newHere.length}/${vars.length} learned`),
        dueHere.length > 0 && h('button', {
          class: 'btn small primary',
          onClick: () => go('session', { mode: 'review', queue: dueHere.map((v) => ({ varId: v.id, side })) }),
        }, `Review ${dueHere.length} due`),
        newHere.length > 0 && h('button', {
          class: 'btn small',
          onClick: () => go('session', { mode: 'learn', queue: newHere.map((v) => ({ varId: v.id, side })) }),
        }, `Learn ${newHere.length} new`)),
      h('div', { class: 'var-list' }, vars.map((v) => varRow(v, side))));
  }

  function varRow(v, side) {
    const card = getCard(v.id, side);
    const st = describeDue(card);
    return h('div', { class: 'var-row' },
      h('div', { class: 'var-info' },
        h('div', { class: 'var-name' }, v.name, v.custom && h('span', { class: 'tag' }, 'custom')),
        h('div', { class: 'muted small' }, v.summary || '')),
      h('span', { class: `pill ${st.cls}` }, st.label),
      h('div', { class: 'var-actions' },
        h('button', { class: 'btn small', onClick: () => go('session', { mode: 'learn', queue: [{ varId: v.id, side }] }) }, card ? 'Re-learn' : 'Learn'),
        h('button', { class: 'btn small', disabled: !card, title: card ? '' : 'Learn it first', onClick: () => go('session', { mode: 'review', queue: [{ varId: v.id, side }] }) }, 'Drill'),
        h('button', { class: 'btn small ghost', onClick: () => go('explore', { varId: v.id, side }) }, 'Explore')));
  }

  render();
}
