// Tiny DOM helpers.
export function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v === undefined || v === null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'value') el.value = v;
      else if (k === 'checked') el.checked = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const c of children) {
    if (c === undefined || c === null || c === false) continue;
    if (Array.isArray(c)) append(el, c);
    else el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

export function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); return el; }

// Replace an element's children, skipping false/null like h() does.
export function fill(el, ...children) { clear(el); append(el, children); return el; }

export const sideName = (s) => (s === 'w' ? 'White' : 'Black');
export const sideIcon = (s) => (s === 'w' ? '♔' : '♚');

export function modal(title, body, actions) {
  const back = h('div', { class: 'modal-back' });
  const close = () => back.remove();
  const box = h('div', { class: 'modal' },
    h('h3', null, title),
    body,
    h('div', { class: 'modal-actions' }, actions.map((a) => h('button', {
      class: a.primary ? 'btn primary' : 'btn',
      onClick: () => { if (a.onClick?.() !== false) close(); },
    }, a.label))));
  back.append(box);
  back.addEventListener('mousedown', (e) => { if (e.target === back) close(); });
  document.body.append(back);
  box.querySelector('input,textarea')?.focus();
  return close;
}

export function toast(text) {
  const t = h('div', { class: 'toast' }, text);
  document.body.append(t);
  setTimeout(() => t.classList.add('show'), 10);
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 2200);
}
