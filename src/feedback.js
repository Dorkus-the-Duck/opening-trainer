// Feedback / bug report: drafts an email to the app's author with the report plus context
// (app and line-pack versions, the current screen and board position).
import { h, modal, toast } from './ui.js';
import { content } from './content.js';
import config from '../app.config.json' with { type: 'json' };

const KINDS = [
  ['bug', 'Bug: something broke or behaved oddly'],
  ['line', 'Wrong or inaccurate line / explanation'],
  ['idea', 'Suggestion or new line request'],
  ['other', 'Other'],
];

function context() {
  const board = document.querySelector('.cg-wrap')?.__board;
  const title = document.querySelector('#main h1, #main h2')?.textContent?.trim();
  return [
    title && `Screen: ${title}`,
    board && `Position (FEN): ${board.fen()}`,
    board && board.chess.history().length > 0 && `Moves on board: ${board.chess.history().join(' ')}`,
  ].filter(Boolean);
}

export async function openFeedback(kind = 'bug', extra = []) {
  const info = await window.api.appInfo();
  const ctx = [...(extra || []), ...context()];
  const kindSel = h('select', { class: 'select' }, KINDS.map(([v, l]) => h('option', { value: v, selected: v === kind }, l)));
  const text = h('textarea', { class: 'input', rows: 6, placeholder: 'What happened, or what is wrong? For a line, say which move and what you think it should be.' });
  const withCtx = h('input', { type: 'checkbox', checked: true });
  const body = h('div', null,
    h('p', { class: 'muted small' }, 'This opens an email to the author in your mail app, already filled in. Just press Send.'),
    kindSel, text,
    h('label', { class: 'muted small', style: { display: 'flex', gap: '6px', alignItems: 'center', marginTop: '6px' } }, withCtx,
      'Include the current position and app version'),
    ctx.length > 0 && h('pre', { class: 'muted small', style: { whiteSpace: 'pre-wrap', margin: '6px 0 0' } }, ctx.join('\n')));

  modal('Send feedback', body, [
    { label: 'Cancel' },
    {
      label: 'Write email', primary: true,
      onClick: () => {
        if (!text.value.trim()) { toast('Write a short description first'); text.focus(); return false; }
        const label = KINDS.find(([v]) => v === kindSel.value)[1].split(':')[0];
        const lines = [text.value.trim(), ''];
        if (withCtx.checked) lines.push('---', `App ${info.version} · lines v${content.version} · ${info.platform}`, ...ctx);
        const subject = `[Opening Trainer] ${label}: ${text.value.trim().split('\n')[0].slice(0, 60)}`;
        const url = `mailto:${config.feedbackEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(lines.join('\n'))}`;
        window.api.openExternal(url);
        toast('Opening your mail app…');
      },
    },
  ]);
}
