// First-run guided tour: spotlights parts of the app one at a time with a short explanation.
// Runs automatically once (settings.tourDone) and again from the "?" button in the top bar.
import { h } from './ui.js';
import { store } from './store.js';
import { go } from './app.js';

// target: CSS selector to spotlight (omit for a centred card). view: screen to show first.
const STEPS = [
  { title: 'Welcome to Opening Trainer', text: 'This app teaches chess openings the way a coach would: move by move, with the reason behind every move, then spaced repetition so the lines stick. It assumes you play decent chess but don\'t know these openings yet. This tour takes about a minute.' },
  { view: 'home', target: '.tabs', title: 'Pick your side', text: 'Your repertoire is split by colour. "Playing White" holds the lines you play as White, "Playing Black" the ones you play as Black. Every line can be trained from either side.' },
  { view: 'home', target: '.opening-card .card-head .btn.ghost', title: 'Start with the big picture', text: 'Each opening has an Overview & plans page: the typical pawn structures, what each side is aiming for, and the traps to know. Read it once before learning the lines.' },
  { view: 'home', target: '.var-row .var-actions', title: 'Learn, then Drill', text: 'Learn walks you through a line: arrows show your move and each move is explained. Drill makes you play it from memory. At the end you grade yourself and the trainer schedules the next review.' },
  { target: '[data-tour="review"]', title: 'Daily review', text: 'Lines come back just before you would forget them: after 10 minutes if you struggled, then 1 day, 3 days and longer. The number shows how many reviews are due. A few minutes a day is enough.' },
  { target: '[data-tour="explore"]', title: 'Explore & Study', text: 'A free board with Stockfish analysis, the repertoire\'s book moves, and notes you can attach to any position. Notes also pop up during drills when you reach that position. You can play against the engine from any position too.' },
  { target: '[data-tour="library"]', title: 'Your own lines', text: 'Play moves on the Explore board and save them as your own line, with your own explanations. They get the same Learn / Drill / review treatment.' },
  { target: '[data-tour="style"]', title: 'Make it yours', text: 'Choose a piece set and board: Norse (Lewis chessmen), classic, minimal, medieval shatranj, and several boards including black & white.' },
  { target: '[data-tour="feedback"]', title: 'Spotted a mistake?', text: 'Send a bug report, flag a wrong move or explanation, or suggest a line. During Learn and Drill there\'s also a "Report a problem" button that includes the exact line and move.' },
  { view: 'home', title: 'You\'re ready', text: 'Pick a side, open an opening, and press Learn on its first line. You can replay this tour any time with the ? button in the top bar.' },
];

export function startTour() {
  let i = 0;
  const shade = h('div', { class: 'tour-shade' });
  const spot = h('div', { class: 'tour-spot' });
  const card = h('div', { class: 'tour-card' });
  document.body.append(shade, spot, card);

  const finish = () => {
    shade.remove(); spot.remove(); card.remove();
    window.removeEventListener('keydown', onKey);
    window.removeEventListener('resize', place);
    if (!store.data.settings.tourDone) { store.data.settings.tourDone = true; store.save(); }
  };
  const onKey = (e) => {
    if (e.key === 'Escape') finish();
    else if (e.key === 'ArrowRight' || e.key === 'Enter') next();
    else if (e.key === 'ArrowLeft' && i > 0) show(i - 1);
  };
  const next = () => (i < STEPS.length - 1 ? show(i + 1) : finish());

  function place() {
    const step = STEPS[i];
    const target = step.target && document.querySelector(step.target);
    if (!target) {
      spot.style.display = 'none';
      shade.style.clipPath = 'none';
      Object.assign(card.style, { left: '50%', top: '50%', transform: 'translate(-50%, -50%)' });
      return;
    }
    target.scrollIntoView({ block: 'nearest' });
    const r = target.getBoundingClientRect();
    const pad = 6;
    const [x, y, w, hgt] = [r.left - pad, r.top - pad, r.width + pad * 2, r.height + pad * 2];
    // Dim everything except a hole around the target.
    shade.style.clipPath = `path(evenodd, "M0 0H${innerWidth}V${innerHeight}H0Z M${x} ${y}h${w}v${hgt}h${-w}Z")`;
    Object.assign(spot.style, { display: '', left: `${x}px`, top: `${y}px`, width: `${w}px`, height: `${hgt}px` });
    // Card below the target if there is room, otherwise above; kept inside the window.
    const cw = card.offsetWidth, ch = card.offsetHeight;
    const below = r.bottom + 14 + ch < window.innerHeight;
    const left = Math.max(12, Math.min(window.innerWidth - cw - 12, r.left + r.width / 2 - cw / 2));
    const top = below ? r.bottom + 14 : Math.max(12, r.top - ch - 14);
    Object.assign(card.style, { left: `${left}px`, top: `${top}px`, transform: 'none' });
  }

  function show(n) {
    i = n;
    const step = STEPS[i];
    if (step.view && !document.querySelector(`[data-tour="${step.view}"].active`)) go(step.view);
    card.replaceChildren(
      h('div', { class: 'tour-count' }, `${i + 1} / ${STEPS.length}`),
      h('h3', null, step.title),
      h('p', null, step.text),
      h('div', { class: 'tour-actions' },
        h('button', { class: 'btn ghost small', onClick: finish }, i === STEPS.length - 1 ? 'Close' : 'Skip tour'),
        i > 0 && h('button', { class: 'btn small', onClick: () => show(i - 1) }, 'Back'),
        h('button', { class: 'btn primary small', onClick: next }, i === STEPS.length - 1 ? 'Start learning' : 'Next')));
    requestAnimationFrame(place);
  }

  window.addEventListener('keydown', onKey);
  window.addEventListener('resize', place);
  show(0);
}
