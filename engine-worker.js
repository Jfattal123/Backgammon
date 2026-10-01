// Background thread that hosts the GNU Backgammon engine.
// Tries the WebAssembly build first, then falls back to the pure-JS build.
let E = null, kind = '';
function boot(M, k) { E = makeEngineAPI(M); kind = k; postMessage({ type: 'ready', kind, ts: E.hasTS() }); }
function loadAsm(err0) {
  try {
    if (!self.GNUBG_INLINE) importScripts('gnubg-engine-asm.js');
    GnubgEngine().then(M => boot(M, 'js')).catch(e => postMessage({ type: 'error', msg: String(err0) + ' / ' + String(e) }));
  } catch (e) { postMessage({ type: 'error', msg: String(err0) + ' / ' + String(e) }); }
}
try {
  if (!self.GNUBG_INLINE) importScripts('gnubg-engine.js', 'engine-api.js');
  GnubgEngine().then(M => boot(M, 'wasm')).catch(loadAsm);
} catch (e) { loadAsm(e); }

onmessage = (ev) => {
  const { id, fn, args } = ev.data;
  if (!E) { postMessage({ id, ok: false, msg: 'Engine not ready' }); return; }
  try {
    const t = performance.now();
    const r = E[fn](...args);
    postMessage({ id, ok: true, r, ms: performance.now() - t });
  } catch (e) { postMessage({ id, ok: false, msg: String(e && e.stack || e) }); }
};
