// Background thread that hosts one copy of the GNU Backgammon engine.
// Load order: fast build (WebAssembly SIMD) -> standard WebAssembly -> plain JavaScript.
let E = null, kind = '';
const SIMD_TEST = new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11]);
const hasSimd = () => { try { return typeof WebAssembly === 'object' && WebAssembly.validate(SIMD_TEST); } catch (e) { return false; } };
const opts = { locateFile: (p, dir) => (dir || '') + (p.endsWith('.data') ? 'gnubg-engine-data.bin' : p) };
function boot(M, k) { E = makeEngineAPI(M); kind = k; postMessage({ type: 'ready', kind, ts: E.hasTS() }); }
async function start() {
  if (self.GNUBG_INLINE) { boot(await GnubgEngine(), 'inline'); return; }
  importScripts('engine-api.js');
  const tries = [];
  if (hasSimd()) tries.push(['gnubg-engine.js', 'simd']);
  if (typeof WebAssembly === 'object') tries.push(['gnubg-engine-nosimd.js', 'wasm']);
  tries.push(['gnubg-engine-asm.js', 'js']);
  let err = null;
  for (const [file, k] of tries) {
    try {
      importScripts(file);
      const M = await GnubgEngine(k === 'js' ? {} : opts);
      boot(M, k);
      return;
    } catch (e) { err = e; }
  }
  postMessage({ type: 'error', msg: String(err) });
}
start().catch(e => postMessage({ type: 'error', msg: String(e) }));

onmessage = (ev) => {
  const { id, fn, args } = ev.data;
  if (!E) { postMessage({ id, ok: false, msg: 'Engine not ready' }); return; }
  try {
    const t = performance.now();
    const r = E[fn](...args);
    postMessage({ id, ok: true, r, ms: performance.now() - t });
  } catch (e) { postMessage({ id, ok: false, msg: String(e && e.stack || e) }); }
};
