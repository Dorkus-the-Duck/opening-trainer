// Generates src/themes/sets.css: the piece sets and boards other than Norse (see gen-norse.mjs).
// Every set defines its images as CSS variables on a class (.pieces-<set>, .board-<board>), and
// one rule maps the variables onto chessground's elements. Because variables inherit, a preview
// tile with its own .pieces-x class shows that set even while the page uses another.
// Run: npm run theme   (add --preview out.html for a preview sheet)
import fs from 'node:fs';

const NAMES = ['king', 'queen', 'rook', 'bishop', 'knight', 'pawn'];
const uri = (svg) => `url("data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}")`;
const svgDoc = (body, defs = '') => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${defs}${body}</svg>`;

// ---------- Minimal: flat geometric pieces ----------
const MIN_COLORS = {
  white: { fill: '#fbfaf6', line: '#1f1f1f', detail: '#1f1f1f' },
  black: { fill: '#2a2a2c', line: '#0b0b0c', detail: '#f4f4f0' },
};
const minBase = 'M24 80 H76 Q79 80 79 83 V86 Q79 89 76 89 H24 Q21 89 21 86 V83 Q21 80 24 80 Z';
const MINIMAL = {
  king: (c) => `<path d="M46 9 H54 V16 H61 V24 H54 V32 H46 V24 H39 V16 H46 Z"/>
    <path d="M33 34 H67 L62 52 H38 Z"/><path d="M38 52 H62 L67 80 H33 Z"/>
    <path d="M40 60 H60" stroke="${c.detail}" stroke-width="2.5" fill="none"/>`,
  queen: (c) => `<path d="M27 30 L37 52 H63 L73 30 L60 41 L50 22 L40 41 Z"/>
    <circle cx="27" cy="27" r="4.5"/><circle cx="50" cy="18" r="4.5"/><circle cx="73" cy="27" r="4.5"/>
    <path d="M37 52 H63 L68 80 H32 Z"/><path d="M40 60 H60" stroke="${c.detail}" stroke-width="2.5" fill="none"/>`,
  rook: (c) => `<path d="M29 20 H38 V27 H45.5 V20 H54.5 V27 H62 V20 H71 V40 H29 Z"/>
    <path d="M35 40 H65 V80 H35 Z"/><path d="M35 48 H65" stroke="${c.detail}" stroke-width="2.5" fill="none"/>`,
  bishop: (c) => `<circle cx="50" cy="13" r="4.5"/><path d="M50 18 Q67 34 61 52 H39 Q33 34 50 18 Z"/>
    <path d="M51 29 L57 40" stroke="${c.detail}" stroke-width="3" fill="none"/>
    <path d="M37 52 H63 V58 H37 Z"/><path d="M41 58 H59 L64 80 H36 Z"/>`,
  knight: (c) => `<path d="M33 80 L38 60 Q31 57 26 54 Q22 51 25 46 L42 29 L46 15 L53 25 Q71 30 71 56 L67 80 Z"/>
    <circle cx="42" cy="38" r="3" fill="${c.detail}" stroke="none"/>
    <path d="M55 32 Q64 42 62 60" stroke="${c.detail}" stroke-width="2.5" fill="none"/>`,
  pawn: (c) => `<circle cx="50" cy="35" r="12"/><path d="M40 80 L44 48 H56 L60 80 Z"/><path d="M38 47 H62" stroke-linecap="round"/>`,
};
function minimalSvg(name, color) {
  const c = MIN_COLORS[color];
  return svgDoc(`<g fill="${c.fill}" stroke="${c.line}" stroke-width="3" stroke-linejoin="round">${MINIMAL[name](c)}<path d="${minBase}"/></g>`);
}

// ---------- Shatranj: abstract medieval Islamic chessmen ----------
// Carved ivory against dark ebony. In the early Islamic game the pieces were abstract:
// a throne-like king, a smaller domed vizier, an elephant with two tusks, a horse shown only by a
// pointed head, a chariot with a split top, and a small domed foot-soldier.
const SH_COLORS = {
  white: { hi: '#fffbf0', base: '#eedfbf', sh: '#c3a874', line: '#3a2915', carve: '#8a6c43' },
  black: { hi: '#6a5644', base: '#3d2f24', sh: '#1f1712', line: '#0c0806', carve: '#a8865a' },
};
const shPlinth = 'M24 92 Q24 84 32 83 H68 Q76 84 76 92 Z';
const ring = (y, x1 = 33, x2 = 67) => `<path d="M${x1} ${y} H${x2}" stroke="url(#carve)" stroke-width="1.6" fill="none"/>`;
const dotRing = (cx, cy) => `<circle cx="${cx}" cy="${cy}" r="3.2" fill="none" stroke="url(#carve)" stroke-width="1.3"/><circle cx="${cx}" cy="${cy}" r=".9" fill="url(#carve)" stroke="none"/>`;
const SHATRANJ = {
  king: () => `<path d="M37 44 V25 Q37 19 43 19 H57 Q63 19 63 25 V44 Z" fill="url(#d)"/>
    <path d="M29 83 V53 Q29 43 39 43 H61 Q71 43 71 53 V83 Z" fill="url(#g)"/>
    ${ring(58, 30, 70)}${ring(74, 30, 70)}${dotRing(50, 66)}${dotRing(39, 66)}${dotRing(61, 66)}${dotRing(50, 31)}`,
  queen: () => `<circle cx="50" cy="26" r="5" fill="url(#g)"/>
    <path d="M33 83 V55 Q33 35 50 31 Q67 35 67 55 V83 Z" fill="url(#g)"/>
    ${ring(57, 34, 66)}${ring(74, 33, 67)}${dotRing(50, 46)}${dotRing(50, 66)}`,
  rook: () => `<path d="M29 83 V35 L44 29 L50 45 L56 29 L71 35 V83 Z" fill="url(#g)"/>
    ${ring(55, 30, 70)}${ring(74, 30, 70)}${dotRing(40, 64)}${dotRing(60, 64)}`,
  bishop: () => `<path d="M37 46 Q28 36 33 25 Q38 30 44 40 Z" fill="url(#d)"/><path d="M63 46 Q72 36 67 25 Q62 30 56 40 Z" fill="url(#d)"/>
    <path d="M33 83 V49 Q33 39 43 39 H57 Q67 39 67 49 V83 Z" fill="url(#g)"/>
    ${ring(57, 34, 66)}${ring(74, 33, 67)}${dotRing(50, 48)}${dotRing(50, 66)}`,
  knight: () => `<path d="M33 83 V49 Q33 40 43 40 H57 Q67 40 67 49 V83 Z" fill="url(#g)"/>
    <path d="M34 53 L19 37 Q16 31 22 28 L33 24 Q45 26 59 41 Z" fill="url(#g)"/>
    <circle cx="30" cy="31" r="2" fill="url(#carve)" stroke="none"/>
    ${ring(57, 34, 66)}${ring(74, 33, 67)}${dotRing(50, 66)}`,
  pawn: () => `<path d="M36 83 V64 Q36 50 50 49 Q64 50 64 64 V83 Z" fill="url(#g)"/>${ring(70, 37, 63)}${dotRing(50, 60)}`,
};
function shatranjSvg(name, color) {
  const c = SH_COLORS[color];
  const defs = `<defs>
  <linearGradient id="g" x1="0" x2="1"><stop offset="0" stop-color="${c.hi}"/><stop offset=".45" stop-color="${c.base}"/><stop offset="1" stop-color="${c.sh}"/></linearGradient>
  <linearGradient id="d" x1="0" x2="1"><stop offset="0" stop-color="${c.base}"/><stop offset="1" stop-color="${c.sh}"/></linearGradient>
  <linearGradient id="carve"><stop offset="0" stop-color="${c.carve}"/></linearGradient></defs>`;
  return svgDoc(`<g stroke="${c.line}" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round">${SHATRANJ[name](c)}<path d="${shPlinth}" fill="url(#d)"/></g>`, defs);
}

// ---------- Classic: chessground's cburnett set and brown board, re-exported as variables ----------
const cgAsset = (f) => fs.readFileSync(new URL(`../node_modules/chessground/assets/${f}`, import.meta.url), 'utf8');
function classicPieces() {
  const css = cgAsset('chessground.cburnett.css');
  const out = {};
  for (const m of css.matchAll(/piece\.(\w+)\.(white|black)\s*\{\s*background-image:\s*(url\('[^']+'\))/g)) out[`${m[2]}-${m[1]}`] = m[3];
  return out;
}
const brownBoard = () => cgAsset('chessground.brown.css').match(/cg-board\s*\{[^}]*?background-image:\s*(url\('[^']+'\))/)[1];

// ---------- Boards ----------
function boardSvg(light, dark, texture = '') {
  let squares = '';
  for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) {
    squares += `<rect x="${f * 100}" y="${r * 100}" width="100" height="100" fill="${(r + f) % 2 ? dark : light}"/>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800" preserveAspectRatio="none" shape-rendering="crispEdges">${squares}${texture}</svg>`;
}
const noise = (freq, octaves, seed, alpha, opacity, type = 'fractalNoise') => `<defs><filter id="n" x="0" y="0" width="100%" height="100%">
  <feTurbulence type="${type}" baseFrequency="${freq}" numOctaves="${octaves}" seed="${seed}"/>
  <feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 ${alpha}"/></filter></defs>
  <rect width="800" height="800" filter="url(#n)" opacity="${opacity}"/>`;

// light, dark, optional texture. sq-light/sq-dark also colour the coordinates.
const BOARDS = {
  walnut: ['#e4c495', '#8b5a33', noise('.003 .11', 4, 3, '.7 -.25', '.5')],
  green: ['#eeeed2', '#769656'],
  ice: ['#dee3e6', '#8ca2ad'],
  marble: ['#ebe9e3', '#7b8086', noise('.012', 5, 11, '-1.4 .9', '.16', 'turbulence')],
  bw: ['#efefef', '#555555'],
};

// ---------- CSS ----------
let css = '/* Generated by tools/gen-sets.mjs, do not edit by hand. */\n';
for (const color of ['white', 'black']) for (const n of NAMES) {
  css += `.cg-wrap piece.${n}.${color} { background-image: var(--p-${color}-${n}); }\n`;
}
css += 'cg-board { background-image: var(--board); }\n';

const classic = classicPieces();
const sets = { classic: (n, c) => classic[`${c}-${n}`], minimal: (n, c) => uri(minimalSvg(n, c)), shatranj: (n, c) => uri(shatranjSvg(n, c)) };
for (const [set, img] of Object.entries(sets)) {
  css += `.pieces-${set} {` + ['white', 'black'].flatMap((c) => NAMES.map((n) => ` --p-${c}-${n}: ${img(n, c)};`)).join('') + ' }\n';
}
css += `.board-brown { --board: ${brownBoard()}; --sq-light: #f0d9b5; --sq-dark: #b58863; }\n`;
for (const [name, [light, dark, tex]] of Object.entries(BOARDS)) {
  css += `.board-${name} { --board: ${uri(boardSvg(light, dark, tex))}; --sq-light: ${light}; --sq-dark: ${dark}; }\n`;
}

fs.mkdirSync('src/themes', { recursive: true });
fs.writeFileSync('src/themes/sets.css', css);

if (process.argv.includes('--preview')) {
  const row = (fn, bg) => `<div style="display:flex">${['white', 'black'].flatMap((c) => NAMES.map((n) => `<div style="background:${bg[(NAMES.indexOf(n) + (c === 'black')) % 2]}"><img width=96 height=96 src="data:image/svg+xml;base64,${Buffer.from(fn(n, c)).toString('base64')}"></div>`)).join('')}</div>`;
  const boards = Object.entries(BOARDS).map(([, [l, d, t]]) => `<img width=180 height=180 style="margin:4px" src="data:image/svg+xml;base64,${Buffer.from(boardSvg(l, d, t)).toString('base64')}">`).join('');
  const html = `<body style="margin:0;background:#222">${row(minimalSvg, ['#eeeed2', '#769656'])}${row(shatranjSvg, ['#e4c495', '#8b5a33'])}<div>${boards}</div></body>`;
  fs.writeFileSync(process.argv[process.argv.indexOf('--preview') + 1], html);
}
console.log('wrote src/themes/sets.css', (css.length / 1024).toFixed(1) + ' KB');
