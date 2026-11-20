// Spaced repetition: one card per (variation, side). Scheduling is a simplified SM-2 / Anki scheme.
import { store } from './store.js';

const MIN = 60 * 1000;
const DAY = 24 * 60 * MIN;

export const GRADES = [
  { id: 0, label: 'Again', hint: 'Forgot it: see it again in 10 minutes' },
  { id: 1, label: 'Hard', hint: 'Got there with mistakes' },
  { id: 2, label: 'Good', hint: 'Knew it' },
  { id: 3, label: 'Easy', hint: 'Effortless' },
];

export const cardKey = (varId, side) => `${varId}|${side}`;
export const getCard = (varId, side) => store.data.cards[cardKey(varId, side)];

export function learnCard(varId, side) {
  const key = cardKey(varId, side);
  if (!store.data.cards[key]) {
    store.data.cards[key] = {
      ease: 2.5, interval: 0, reps: 0, lapses: 0,
      learnedAt: Date.now(), due: Date.now() + 4 * 60 * MIN, history: [], weakPlies: {},
    };
  }
  store.save();
  return store.data.cards[key];
}

export function forgetCard(varId, side) {
  delete store.data.cards[cardKey(varId, side)];
  store.save();
}

// Suggested grade from a drill result.
export function suggestGrade(mistakes, hints) {
  if (mistakes >= 3) return 0;
  if (mistakes >= 1 || hints >= 2) return 1;
  if (hints === 1) return 1;
  return 2;
}

export function gradeCard(varId, side, grade, result = {}) {
  const card = getCard(varId, side) || learnCard(varId, side);
  const now = Date.now();
  if (grade === 0) {
    card.reps = 0;
    card.lapses++;
    card.interval = 0;
    card.ease = Math.max(1.3, card.ease - 0.2);
    card.due = now + 10 * MIN;
  } else {
    let iv;
    if (grade === 1) {
      iv = card.reps === 0 ? 1 : Math.max(1, Math.round(card.interval * 1.2));
      card.ease = Math.max(1.3, card.ease - 0.15);
    } else {
      iv = card.reps === 0 ? 1 : card.reps === 1 ? 3 : Math.round(card.interval * card.ease);
      if (grade === 3) { iv = Math.round(iv * 1.3) + 1; card.ease += 0.15; }
    }
    card.reps++;
    card.interval = iv;
    card.due = now + iv * DAY;
  }
  card.history.push({ t: now, grade, mistakes: result.mistakes || 0, hints: result.hints || 0 });
  for (const ply of result.missedPlies || []) card.weakPlies[ply] = (card.weakPlies[ply] || 0) + 1;
  store.save();
  return card;
}

export function dueCards() {
  const now = Date.now();
  return Object.entries(store.data.cards)
    .filter(([, c]) => c.due <= now)
    .sort((a, b) => a[1].due - b[1].due)
    .map(([key]) => { const [varId, side] = key.split('|'); return { varId, side }; });
}

export function describeDue(card) {
  if (!card) return { label: 'New', cls: 'new' };
  const ms = card.due - Date.now();
  if (ms <= 0) return { label: 'Due', cls: 'due' };
  if (card.interval >= 21) return { label: `Mastered · ${fmtWait(ms)}`, cls: 'mastered' };
  return { label: `Next in ${fmtWait(ms)}`, cls: 'learning' };
}

export function fmtWait(ms) {
  if (ms < 60 * MIN) return `${Math.max(1, Math.round(ms / MIN))}m`;
  if (ms < DAY) return `${Math.round(ms / (60 * MIN))}h`;
  return `${Math.round(ms / DAY)}d`;
}
