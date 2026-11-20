import 'chessground/assets/chessground.base.css';
import 'chessground/assets/chessground.brown.css';
import './themes/norse.css';
import './themes/sets.css';
import './styles.css';

import { store } from './store.js';
import { h, clear, fill, modal, toast } from './ui.js';
import { content } from './content.js';
import { invalidate } from './repertoire.js';
import { dueCards } from './srs.js';
import * as engine from './engine.js';
import { homeView } from './views/home.js';
import { openingView } from './views/opening.js';
import { sessionView } from './views/session.js';
import { exploreView } from './views/explore.js';
import { libraryView, editorView } from './views/library.js';
import { proposalsView } from './views/proposals.js';
import { openFeedback } from './feedback.js';
import { startTour } from './tour.js';

const VIEWS = { home: homeView, opening: openingView, session: sessionView, explore: exploreView, library: libraryView, editor: editorView, proposals: proposalsView };

let cleanup = null;
let currentView = 'home';
let pendingProposals = null; // null when not running from source
const main = document.getElementById('main');
const nav = document.getElementById('nav');

export function go(view, params = {}) {
  if (cleanup) { try { cleanup(); } catch (e) { console.error(e); } }
  cleanup = null;
  engine.stop();
  currentView = view;
  clear(main);
  window.scrollTo(0, 0);
  cleanup = VIEWS[view](main, params) || null;
  renderNav();
}

export function renderNav() {
  window.api.proposals.list().then((list) => {
    const n = list ? list.filter((p) => !p.review || p.review.status === 'pending').length : null;
    if (n !== pendingProposals) { pendingProposals = n; renderNav(); }
  });
  const due = dueCards().length;
  const item = (view, label, extra) => h('button', {
    class: 'nav-item' + (currentView === view ? ' active' : ''),
    'data-tour': view,
    onClick: () => go(view),
  }, label, extra);
  fill(nav,
    h('div', { class: 'brand' }, h('span', { class: 'brand-mark' }, '♞'), 'Opening Trainer'),
    item('home', 'Repertoire'),
    h('button', {
      class: 'nav-item' + (due ? ' has-due' : ''),
      'data-tour': 'review',
      disabled: !due,
      onClick: () => go('session', { mode: 'review', queue: dueCards() }),
    }, 'Review', h('span', { class: 'badge' + (due ? ' hot' : '') }, String(due))),
    item('explore', 'Explore & Study'),
    item('library', 'My Lines'),
    pendingProposals !== null && item('proposals', 'Proposals', h('span', { class: 'badge' + (pendingProposals ? ' hot' : '') }, String(pendingProposals))),
    h('button', { class: 'nav-item nav-style', 'data-tour': 'style', onClick: stylePicker }, '🎨 Style'),
    h('button', { class: 'nav-item', 'data-tour': 'feedback', title: 'Report a bug, a wrong line, or send an idea', onClick: () => openFeedback() }, '✉ Feedback'),
    h('button', { class: 'nav-item', title: 'Take the tour again', onClick: startTour }, '?'),
  );
}

const PIECE_SETS = [['norse', 'Norse (Lewis)'], ['classic', 'Classic'], ['minimal', 'Minimal'], ['shatranj', 'Shatranj (medieval)']];
const BOARDS = [['norse', 'Bone & slate'], ['brown', 'Brown'], ['walnut', 'Walnut & maple'], ['green', 'Tournament green'], ['ice', 'Blue ice'], ['marble', 'Marble'], ['bw', 'Black & white']];

function applyTheme() {
  const { pieces, board } = store.data.settings;
  document.body.className = document.body.className.replace(/\b(pieces|board)-\S+/g, '').trim();
  document.body.classList.add(`pieces-${pieces}`, `board-${board}`);
}

function stylePicker() {
  const s = store.data.settings;
  const body = h('div');
  const tile = (key, value, label, preview) => h('button', {
    class: 'style-tile' + (s[key] === value ? ' on' : ''),
    onClick: () => { s[key] = value; store.save(); applyTheme(); render(); },
  }, preview, label);
  const render = () => fill(body,
    h('h4', null, 'Pieces'),
    h('div', { class: 'style-grid style-group' }, PIECE_SETS.map(([v, l]) => tile('pieces', v, l,
      h('div', { class: `pieces-${v}` }, h('div', { class: 'cg-wrap' }, h('piece', { class: 'knight white' }), h('piece', { class: 'king black' })))))),
    h('h4', null, 'Board'),
    h('div', { class: 'style-grid style-group' }, BOARDS.map(([v, l]) => tile('board', v, l, h('div', { class: `board-${v}` }, h('div', { class: 'board-swatch' }))))));
  render();
  modal('Board style', body, [{ label: 'Done', primary: true }]);
}

setInterval(() => { if (currentView !== 'session') renderNav(); }, 60 * 1000);

// Lines downloaded earlier (newer than the ones built into this version), and live updates.
content.use(await window.api.content.cached());
window.api.content.onUpdated((pack) => {
  if (!content.use(pack)) return;
  invalidate();
  toast('New and corrected lines downloaded');
  if (currentView === 'home') go('home');
});
window.api.onUpdateReady(({ version }) => modal('Update ready',
  h('p', null, `Version ${version} of Opening Trainer has been downloaded. Restart now to use it, or it installs when you close the app.`),
  [{ label: 'Later' }, { label: 'Restart now', primary: true, onClick: () => { window.api.restartToUpdate(); } }]));

await store.load();
applyTheme();
go('home');
if (!store.data.settings.tourDone) startTour();
