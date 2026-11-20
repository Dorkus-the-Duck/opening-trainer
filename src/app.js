import 'chessground/assets/chessground.base.css';
import 'chessground/assets/chessground.brown.css';
import 'chessground/assets/chessground.cburnett.css';
import './themes/norse.css';
import './styles.css';

import { store } from './store.js';
import { h, clear } from './ui.js';
import { dueCards } from './srs.js';
import * as engine from './engine.js';
import { homeView } from './views/home.js';
import { openingView } from './views/opening.js';
import { sessionView } from './views/session.js';
import { exploreView } from './views/explore.js';
import { libraryView, editorView } from './views/library.js';

const VIEWS = { home: homeView, opening: openingView, session: sessionView, explore: exploreView, library: libraryView, editor: editorView };

let cleanup = null;
let currentView = 'home';
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
  const due = dueCards().length;
  const item = (view, label, extra) => h('button', {
    class: 'nav-item' + (currentView === view ? ' active' : ''),
    onClick: () => go(view),
  }, label, extra);
  clear(nav).append(
    h('div', { class: 'brand' }, h('span', { class: 'brand-mark' }, '♞'), 'Opening Trainer'),
    item('home', 'Repertoire'),
    h('button', {
      class: 'nav-item' + (due ? ' has-due' : ''),
      disabled: !due,
      onClick: () => go('session', { mode: 'review', queue: dueCards() }),
    }, 'Review', h('span', { class: 'badge' + (due ? ' hot' : '') }, String(due))),
    item('explore', 'Explore & Study'),
    item('library', 'My Lines'),
    h('label', { class: 'set-picker' }, 'Set',
      h('select', {
        class: 'select small',
        onChange: (e) => { store.data.settings.theme = e.target.value; store.save(); applyTheme(); },
      }, [['norse', 'Norse (Lewis)'], ['classic', 'Classic']].map(([v, l]) =>
        h('option', { value: v, selected: store.data.settings.theme === v }, l)))),
  );
}

function applyTheme() {
  document.body.classList.toggle('theme-norse', store.data.settings.theme === 'norse');
}

setInterval(() => { if (currentView !== 'session') renderNav(); }, 60 * 1000);

await store.load();
applyTheme();
go('home');
