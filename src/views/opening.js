import { h, sideName, sideIcon } from '../ui.js';
import { getOpening } from '../repertoire.js';
import { getCard, describeDue } from '../srs.js';
import { go } from '../app.js';

function movesText(v) {
  return v.plies.map((p, i) => (i % 2 === 0 ? `${i / 2 + 1}.${p.san}` : p.san)).join(' ');
}

export function openingView(root, { id, side = 'w' }) {
  const o = getOpening(id);
  if (!o) { go('home'); return; }

  root.append(h('div', { class: 'page narrow' },
    h('button', { class: 'btn ghost', onClick: () => go('home') }, '← Repertoire'),
    h('h1', null, o.name),
    h('div', { class: 'muted' }, [o.eco, o.moves].filter(Boolean).join(' · ')),
    (o.overview || []).map((p) => h('p', { class: 'prose' }, p)),
    o.plans && (o.plans.w || o.plans.b) && h('div', { class: 'plans' },
      ['w', 'b'].filter((s) => o.plans[s]).map((s) => h('div', { class: 'plan' + (s === side ? ' mine' : '') },
        h('h3', null, `${sideIcon(s)} Plans for ${sideName(s)}`), h('p', null, o.plans[s])))),
    h('h2', { class: 'section' }, 'Variations'),
    o.variations.map((v) => h('div', { class: 'card variation' },
      h('div', { class: 'card-head' },
        h('h3', null, v.name, v.custom && h('span', { class: 'tag' }, 'custom')),
        h('button', { class: 'btn small ghost', onClick: () => go('explore', { varId: v.id, side }) }, 'Explore on board')),
      h('div', { class: 'moves-text' }, movesText(v)),
      v.summary && h('p', null, v.summary),
      v.plans && h('div', { class: 'plans small' },
        ['w', 'b'].filter((s) => v.plans[s]).map((s) => h('div', { class: 'plan' + (s === side ? ' mine' : '') },
          h('h4', null, `${sideIcon(s)} ${sideName(s)}`), h('p', null, v.plans[s])))),
      v.notes && h('div', { class: 'callout' }, '⚠ ', v.notes),
      h('div', { class: 'var-actions' },
        v.sides.map((s) => {
          const st = describeDue(getCard(v.id, s));
          return h('div', { class: 'side-actions' },
            h('span', { class: 'muted small' }, `As ${sideName(s)}`),
            h('span', { class: `pill ${st.cls}` }, st.label),
            h('button', { class: 'btn small', onClick: () => go('session', { mode: 'learn', queue: [{ varId: v.id, side: s }] }) }, 'Learn'),
            h('button', { class: 'btn small', disabled: !getCard(v.id, s), onClick: () => go('session', { mode: 'review', queue: [{ varId: v.id, side: s }] }) }, 'Drill'));
        })))),
  ));
}
