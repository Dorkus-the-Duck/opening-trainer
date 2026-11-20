// Generates src/themes/norse.css: a Lewis-chessmen-inspired piece set (ivory vs red-stained ivory)
// and a bone-and-slate board. Run: npm run theme
import fs from 'node:fs';

const COLORS = {
  white: { hi: '#fffaf0', base: '#efe2c4', sh: '#c4a97c', deep: '#9a7f55', line: '#3b2a17', acc: '#b08a4f', carve: '#6b5233' },
  black: { hi: '#d0604a', base: '#9c2f21', sh: '#621a11', deep: '#46100a', line: '#1a0603', acc: '#e0b465', carve: '#2a0805' },
};

const plinth = (c) => `
  <path d="M22 93 Q22 85 30 84 H70 Q78 85 78 93 Z" fill="url(#d)"/>
  <path d="M28 88.5 H72" stroke="${c.carve}" stroke-width="1.2" opacity=".6"/>`;

const PIECES = {
  // Seated king: throne, crown with cross, beard, sword across the knees.
  king: (c) => `
  <path d="M27 84 V38 Q27 28 37 28 H63 Q73 28 73 38 V84 Z" fill="url(#d)"/>
  <path d="M31 37 Q36 31 41 37 M59 37 Q64 31 69 37" fill="none" stroke="${c.carve}" stroke-width="1.5"/>
  <path d="M33 84 L35 60 Q37 50 50 49 Q63 50 65 60 L67 84 Z" fill="url(#g)"/>
  <path d="M50 53 V83" stroke="${c.carve}" stroke-width="1.3" opacity=".6"/>
  <circle cx="50" cy="40" r="8.5" fill="url(#g)"/>
  <ellipse cx="47" cy="39" rx="1.3" ry="1.7" fill="${c.line}" stroke="none"/><ellipse cx="53" cy="39" rx="1.3" ry="1.7" fill="${c.line}" stroke="none"/>
  <path d="M43 43 Q50 56 57 43 Q50 47.5 43 43 Z" fill="url(#d)"/>
  <path d="M40.5 35.5 L40.5 24 L45 29 L50 21 L55 29 L59.5 24 L59.5 35.5 Z" fill="${c.acc}"/>
  <path d="M50 21 V11 M46 14.5 H54" stroke="${c.line}" stroke-width="4.2"/>
  <path d="M50 21 V11 M46 14.5 H54" stroke="${c.acc}" stroke-width="1.8"/>
  <path d="M28 68 L76 62" stroke="${c.line}" stroke-width="6"/>
  <path d="M37 67 L75.5 62.2" stroke="${c.hi}" stroke-width="2.4"/>
  <path d="M36 61.5 L37.5 72.5" stroke="${c.line}" stroke-width="4.4"/>
  <path d="M36 61.5 L37.5 72.5" stroke="${c.acc}" stroke-width="2"/>
  <circle cx="44" cy="66" r="3.6" fill="url(#g)"/>
  <circle cx="59" cy="64" r="3.6" fill="url(#g)"/>`,

  // Seated queen: rounded throne back, veil, many-pointed crown, the famous hand-to-cheek pose.
  queen: (c) => `
  <path d="M27 84 V42 Q27 25 50 25 Q73 25 73 42 V84 Z" fill="url(#d)"/>
  <path d="M33 40 Q50 30 67 40" fill="none" stroke="${c.carve}" stroke-width="1.5"/>
  <path d="M32 84 L36 56 Q38 36 50 34 Q62 36 64 56 L68 84 Z" fill="url(#g)"/>
  <path d="M41.5 41 Q39.5 53 37.5 63 M58.5 41 Q60.5 53 62.5 63" fill="none" stroke="${c.carve}" stroke-width="1.3" opacity=".7"/>
  <ellipse cx="50" cy="42" rx="7" ry="8" fill="url(#g)"/>
  <ellipse cx="46.5" cy="41" rx="1.3" ry="1.7" fill="${c.line}" stroke="none"/><ellipse cx="52.5" cy="41" rx="1.3" ry="1.7" fill="${c.line}" stroke="none"/>
  <path d="M42 35 L41.5 26.5 L45 31 L47.5 24.5 L50 30 L52.5 24.5 L55 31 L58.5 26.5 L58 35 Z" fill="${c.acc}"/>
  <circle cx="41.5" cy="25.5" r="1.8" fill="${c.acc}"/><circle cx="47.5" cy="23.5" r="1.8" fill="${c.acc}"/>
  <circle cx="52.5" cy="23.5" r="1.8" fill="${c.acc}"/><circle cx="58.5" cy="25.5" r="1.8" fill="${c.acc}"/>
  <path d="M46 67 L61.5 63.5 L58 50" fill="none" stroke="${c.line}" stroke-width="7.4"/>
  <path d="M46 67 L61.5 63.5 L58 50" fill="none" stroke="${c.base}" stroke-width="3.4"/>
  <circle cx="57.5" cy="47.5" r="3.6" fill="url(#g)"/>
  <ellipse cx="42" cy="69" rx="4.2" ry="3.2" fill="url(#g)"/>`,

  // Bishop: cleft mitre, chasuble, book in one hand and a curled crozier in the other.
  bishop: (c) => `
  <path d="M33 84 L37 52 Q50 44 63 52 L67 84 Z" fill="url(#g)"/>
  <path d="M39.5 60 Q50 67 60.5 60 M50 65 V83" fill="none" stroke="${c.carve}" stroke-width="1.3" opacity=".7"/>
  <circle cx="50" cy="41" r="7.5" fill="url(#g)"/>
  <ellipse cx="47" cy="41.5" rx="1.3" ry="1.7" fill="${c.line}" stroke="none"/><ellipse cx="53" cy="41.5" rx="1.3" ry="1.7" fill="${c.line}" stroke="none"/>
  <path d="M41.5 36.5 Q40 24 45.5 13 L50 20.5 L54.5 13 Q60 24 58.5 36.5 Z" fill="${c.acc}"/>
  <path d="M42 31.5 H58 M50 20.5 V36" stroke="${c.line}" stroke-width="1.3"/>
  <path d="M70 86 V30 Q70 18 61.5 19 Q55.5 21 58 27 Q60.5 30.5 64 27.5" fill="none" stroke="${c.line}" stroke-width="5.4"/>
  <path d="M70 86 V30 Q70 18 61.5 19 Q55.5 21 58 27 Q60.5 30.5 64 27.5" fill="none" stroke="${c.acc}" stroke-width="2.4"/>
  <circle cx="69.5" cy="57" r="3.7" fill="url(#g)"/>
  <rect x="35" y="56" width="11" height="10" rx="1.2" fill="url(#d)"/>
  <path d="M40.5 57 V65" stroke="${c.acc}" stroke-width="1.3"/>`,

  // Knight: a small sturdy horse facing left, rider in a nasal helm, kite shield and spear.
  knight: (c) => `
  <path d="M75.5 4 L78.5 12 L73 12 Z" fill="${c.acc}"/>
  <path d="M75.8 12 L72.5 50" stroke="${c.line}" stroke-width="2.6"/>
  <path d="M52 52 Q60 40 70 46 L72 72 L56 72 Z" fill="url(#g)"/>
  <circle cx="62" cy="34" r="6" fill="url(#g)"/>
  <path d="M55.5 34 Q56 22 62 14.5 Q68 22 68.5 34 Z" fill="${c.acc}"/>
  <path d="M62 27 V38" stroke="${c.line}" stroke-width="1.8"/>
  <path d="M39.5 24 L43.5 11.5 L47.5 24 Z" fill="url(#g)"/>
  <path d="M32 84 L35 68 Q36 60 32 56.5 L20 52.5 Q12.5 50.5 14.5 44 L27 32 Q32 23.5 41 22 Q47.5 20.5 51.5 26.5 Q57.5 34 58.5 48 L62.5 84 Z" fill="url(#g)"/>
  <path d="M45.5 23.5 L50.5 29.5 L49 34 L54.5 38.5 L53 43 L57.5 48.5" fill="none" stroke="${c.carve}" stroke-width="1.6"/>
  <path d="M23.5 41.5 L35 47 L33.5 34" fill="none" stroke="${c.acc}" stroke-width="1.8"/>
  <circle cx="31" cy="37.5" r="2.1" fill="${c.line}" stroke="none"/>
  <path d="M17.5 46.5 Q19.5 45 21 47.5 M15.5 50.5 L21.5 50.5" fill="none" stroke="${c.line}" stroke-width="1.4"/>
  <path d="M60.5 48 H78.5 V58 Q77.5 70 69.5 78.5 Q61.5 70 60.5 58 Z" fill="url(#d)"/>
  <path d="M69.5 50.5 V75 M61.5 57 H77.5" stroke="${c.acc}" stroke-width="2.2"/>`,

  // Rook as a warder: conical nasal helm behind a painted round shield.
  rook: (c) => `
  <path d="M35 84 L37 50 Q50 42 63 50 L65 84 Z" fill="url(#g)"/>
  <path d="M66 47 L73 34" stroke="${c.line}" stroke-width="4.4"/>
  <path d="M66 47 L73 34" stroke="${c.acc}" stroke-width="1.8"/>
  <path d="M68 37.5 L73 41" stroke="${c.line}" stroke-width="3"/>
  <circle cx="50" cy="35" r="7.5" fill="url(#g)"/>
  <ellipse cx="47" cy="37" rx="1.3" ry="1.7" fill="${c.line}" stroke="none"/><ellipse cx="53" cy="37" rx="1.3" ry="1.7" fill="${c.line}" stroke="none"/>
  <path d="M41.5 35 Q41.5 21.5 50 12 Q58.5 21.5 58.5 35 Z" fill="${c.acc}"/>
  <path d="M41.8 31.5 H58.2" stroke="${c.line}" stroke-width="1.6"/>
  <path d="M50 31.5 V40" stroke="${c.line}" stroke-width="2.2"/>
  <circle cx="50" cy="63" r="19.5" fill="url(#d)"/>
  <path d="M50 63 L50 46.5 A16.5 16.5 0 0 1 66.5 63 Z M50 63 L50 79.5 A16.5 16.5 0 0 1 33.5 63 Z" fill="url(#g)" stroke-width="1.2"/>
  <circle cx="50" cy="63" r="16.5" fill="none" stroke-width="1.2"/>
  <circle cx="50" cy="63" r="5" fill="${c.acc}"/>
  <circle cx="50" cy="45.2" r="1.2" fill="${c.line}" stroke="none"/><circle cx="50" cy="80.8" r="1.2" fill="${c.line}" stroke="none"/>
  <circle cx="32.2" cy="63" r="1.2" fill="${c.line}" stroke="none"/><circle cx="67.8" cy="63" r="1.2" fill="${c.line}" stroke="none"/>`,

  // Pawn as a runestone carved with the Algiz rune.
  pawn: (c) => `
  <path d="M30 93 Q30 86 36 85 H64 Q70 86 70 93 Z" fill="url(#d)"/>
  <path d="M35 85 L34 51 Q34 34 50 33 Q66 34 66 51 L65 85 Z" fill="url(#g)"/>
  <path d="M38.5 82 L38 51.5 Q38 38 50 37.5 Q62 38 62 51.5 L61.5 82" fill="none" stroke="${c.carve}" stroke-width="1.3" opacity=".7"/>
  <path d="M50 46 V76 M50 55 L42.5 46.5 M50 55 L57.5 46.5" fill="none" stroke="${c.carve}" stroke-width="3"/>`,
};

function pieceSvg(name, color) {
  const c = COLORS[color];
  const body = PIECES[name](c) + (name === 'pawn' ? '' : plinth(c));
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
<defs>
  <linearGradient id="g" x1="0" x2="1"><stop offset="0" stop-color="${c.hi}"/><stop offset=".45" stop-color="${c.base}"/><stop offset="1" stop-color="${c.sh}"/></linearGradient>
  <linearGradient id="d" x1="0" x2="1"><stop offset="0" stop-color="${c.base}"/><stop offset="1" stop-color="${c.deep}"/></linearGradient>
</defs>
<g stroke="${c.line}" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round">${body}
</g></svg>`;
}

// Bone and slate squares with a stone-grain texture.
function boardSvg() {
  const light = '#d9cdae', dark = '#4f5e60';
  let squares = '';
  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      const isDark = (r + f) % 2 === 1;
      squares += `<rect x="${f * 100}" y="${r * 100}" width="100" height="100" fill="${isDark ? dark : light}"/>`;
      squares += `<rect x="${f * 100 + 3}" y="${r * 100 + 3}" width="94" height="94" fill="none" stroke="${isDark ? '#3d4a4c' : '#c7b995'}" stroke-width="2"/>`;
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800" preserveAspectRatio="none">
<defs><filter id="n" x="0" y="0" width="100%" height="100%">
  <feTurbulence type="fractalNoise" baseFrequency=".012 .09" numOctaves="4" seed="7"/>
  <feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 .55 -.18"/>
</filter></defs>
${squares}
<rect width="800" height="800" filter="url(#n)" opacity=".55"/>
</svg>`;
}

// Interlaced braid for the frame.
function knotSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
<rect width="24" height="24" fill="#2b1d12"/>
<g fill="none" stroke-linecap="round">
  <path d="M0 12 C6 2 18 2 24 12" stroke="#120b06" stroke-width="5"/>
  <path d="M0 12 C6 2 18 2 24 12" stroke="#b48a4c" stroke-width="2.4"/>
  <path d="M0 12 C6 22 18 22 24 12" stroke="#120b06" stroke-width="5"/>
  <path d="M0 12 C6 22 18 22 24 12" stroke="#b48a4c" stroke-width="2.4"/>
</g></svg>`;
}

const uri = (svg) => `url("data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}")`;

let css = `/* Generated by tools/gen-norse.mjs, do not edit by hand. */\n`;
for (const color of ['white', 'black']) {
  for (const name of Object.keys(PIECES)) {
    css += `body.theme-norse .cg-wrap piece.${name}.${color} { background-image: ${uri(pieceSvg(name, color))}; }\n`;
  }
}
css += `body.theme-norse cg-board { background-image: ${uri(boardSvg())}; }\n`;
css += `body.theme-norse .board-wrap { --frame: ${uri(knotSvg())}; }\n`;

// App icon: the ivory knight on a slate tile with a bronze rim.
function iconSvg() {
  const knight = pieceSvg('knight', 'white').replace('<svg ', '<svg x="34" y="30" width="188" height="188" ');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256">
<defs><linearGradient id="tile" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5d6e70"/><stop offset="1" stop-color="#2f3a3c"/></linearGradient></defs>
<rect x="8" y="8" width="240" height="240" rx="48" fill="#120b06"/>
<rect x="14" y="14" width="228" height="228" rx="43" fill="#b48a4c"/>
<rect x="22" y="22" width="212" height="212" rx="36" fill="url(#tile)"/>
${knight}
</svg>`;
}

fs.mkdirSync('src/themes', { recursive: true });
fs.writeFileSync('src/themes/norse.css', css);
fs.mkdirSync('assets', { recursive: true });
fs.writeFileSync('assets/icon.svg', iconSvg());
if (process.argv.includes('--preview')) {
  // Writes a quick preview page of all pieces on both square colours.
  const cells = ['king', 'queen', 'rook', 'bishop', 'knight', 'pawn'].flatMap((n) => ['white', 'black'].map((c) => pieceSvg(n, c)));
  const img = (svg, px) => `<img width=${px} height=${px} style="display:block" src="data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}">`;
  const row = (px) => `<div style="display:flex">${cells.map((svg, i) => `<div style="background:${i % 2 ? '#4f5e60' : '#d9cdae'}">${img(svg, px)}</div>`).join('')}</div>`;
  const html = `<body style="margin:0;background:#222;overflow:hidden">${row(120)}${row(64)}</body>`;
  fs.writeFileSync(process.argv[process.argv.indexOf('--preview') + 1], html);
}
console.log('wrote src/themes/norse.css', (css.length / 1024).toFixed(1) + ' KB');
