// Dev helper: drive the running app over the Chrome DevTools protocol.
//   (start the app with: electron . --remote-debugging-port=9333)
//   node test/cdp.mjs eval "<js expression>"
//   node test/cdp.mjs shot out.png
const [, , cmd, arg] = process.argv;
const targets = await (await fetch('http://127.0.0.1:9333/json')).json();
const page = targets.find((t) => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data); pending.get(m.id)?.(m); };
await new Promise((r) => (ws.onopen = r));
const call = (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });

if (cmd === 'eval') {
  const r = await call('Runtime.evaluate', { expression: arg, awaitPromise: true, returnByValue: true });
  console.log(JSON.stringify(r.result.result?.value ?? r.result.exceptionDetails ?? r.result, null, 1));
} else if (cmd === 'move') {
  // node test/cdp.mjs move e2e4  -> clicks the two squares on the visible board
  const expr = `(() => { const b = document.querySelector('cg-board').getBoundingClientRect();
    const black = !!document.querySelector('.cg-wrap.orientation-black'); const s = b.width / 8;
    const pos = (sq) => { let f = sq.charCodeAt(0) - 97, r = +sq[1] - 1; if (black) { f = 7 - f; r = 7 - r; }
      return [b.left + (f + .5) * s, b.top + (7 - r + .5) * s]; };
    return [pos('${arg.slice(0, 2)}'), pos('${arg.slice(2, 4)}')]; })()`;
  const r = await call('Runtime.evaluate', { expression: expr, returnByValue: true });
  const wait = (ms) => new Promise((res) => setTimeout(res, ms));
  for (const [x, y] of r.result.result.value) {
    await call('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
    await wait(40);
    await call('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1 });
    await wait(60);
    await call('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: 1 });
    await wait(150);
  }
  console.log('moved', arg);
} else if (cmd === 'shot') {
  const r = await call('Page.captureScreenshot', { format: 'png' });
  (await import('node:fs')).writeFileSync(arg, Buffer.from(r.result.data, 'base64'));
  console.log('saved', arg);
}
ws.close();
