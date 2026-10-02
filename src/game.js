/* ===================== ENGINE CLIENT ===================== */
// One engine copy per background thread. `Engine` does analysis in the background;
// `Play` is a small pool that the bot's thinking (and tutor checks) use, so the bot never
// waits behind analysis and its move search is spread across the processor's cores.
function makeEngineWorker(cacheBits) {
  let worker, seq = 0, readyRes, readyRej, info = null, busy = 0;
  const pend = new Map();
  const ready = new Promise((res, rej) => { readyRes = res; readyRej = rej; });
  try {
    if (window.GNUBG_WORKER_SRC) {
      if (!makeEngineWorker.url) makeEngineWorker.url = URL.createObjectURL(new Blob([window.GNUBG_WORKER_SRC], { type: 'text/javascript' }));
      worker = new Worker(makeEngineWorker.url);
    } else worker = new Worker('engine-worker.js');
  } catch (e) { readyRej(e); }
  if (worker) {
    worker.onmessage = (ev) => {
      const d = ev.data;
      if (d.type === 'ready') { info = d; if (cacheBits) worker.postMessage({ id: 0, fn: 'setCache', args: [cacheBits] }); readyRes(d); return; }
      if (d.type === 'error') { readyRej(new Error(d.msg)); return; }
      const p = pend.get(d.id); if (!p) return;
      pend.delete(d.id); busy--;
      d.ok ? p.res(d.r) : p.rej(new Error(d.msg));
    };
    worker.onerror = (e) => readyRej(new Error(e.message || 'Engine failed to load'));
  }
  ready.catch(() => { });
  function call(fn, ...args) {
    busy++;
    return ready.then(() => new Promise((res, rej) => { const id = ++seq; pend.set(id, { res, rej }); worker.postMessage({ id, fn, args }); }), (e) => { busy--; throw e; });
  }
  return { ready, call, get info() { return info; }, get busy() { return busy; } };
}
const Engine = makeEngineWorker(0);

const Play = (() => {
  const cores = navigator.hardwareConcurrency || 4;
  const mem = navigator.deviceMemory || 8;
  let n = Math.max(1, Math.min(4, cores - 1));
  if (mem <= 2) n = Math.min(n, 1); else if (mem <= 4) n = Math.min(n, 2);
  try { const f = +new URLSearchParams(location.search).get('pool'); if (f >= 1 && f <= 6) n = f; } catch (e) { } // testing override
  const workers = [];
  // start the pool once the main engine is up, so first load isn't slowed down
  const started = Engine.ready.then(() => { for (let i = 0; i < n; i++) workers.push(makeEngineWorker(17)); }).catch(() => { });
  function readyWorkers() { return workers.filter(w => w.info); }
  function pick() {
    const r = readyWorkers();
    if (!r.length) return Engine;
    return r.reduce((a, b) => (b.busy < a.busy ? b : a));
  }
  const call = (fn, ...args) => pick().call(fn, ...args);

  // gnubg's preset searches: plies and move filters [accept, extra, threshold] per ply
  const N8 = [0, 8, 0.16], L16 = [0, 16, 0.32], SKIP = [-1, 0, 0], L4 = [0, 4, 0.08];
  const SEARCH = { 4: { plies: 0, f: [] }, 5: { plies: 2, f: [N8, SKIP] }, 6: { plies: 2, f: [L16, SKIP] }, 7: { plies: 3, f: [L16, SKIP, L4] } };
  const byScore = (a, b) => (b.eq - a.eq) || ((b.eq2 || 0) - (a.eq2 || 0));

  // score `list` at `plies`, split across the ready engines
  async function scoreSplit(opp, me, list, plies, ctx, level) {
    const ws = readyWorkers();
    const pool = ws.length ? ws : [Engine];
    const chunks = pool.map(() => []);
    list.forEach((m, i) => chunks[i % pool.length].push(m));
    const res = await Promise.all(chunks.map((c, i) => c.length ? pool[i].call('scoreList', opp, me, c.map(m => padMove(m.move)), plies, ctx, level) : []));
    chunks.forEach((c, i) => c.forEach((m, j) => { const r = res[i][j]; m.eq = r.eq; m.eq2 = r.eq2; m.probs = r.probs; m.ply = plies; }));
  }
  const padMove = (mv) => { const a = mv.slice(0, 8); while (a.length < 8) a.push(-1); return a; };
  const same = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

  // The bot's (or tutor's) move search: the same steps as gnubg's own, with each deep step shared out.
  async function moves(opp, me, d0, d1, ctx, level, played) {
    await started;
    const S = SEARCH[level];
    if (!S || readyWorkers().length < 2) return pick().call('moves', opp, me, d0, d1, ctx, level, played);
    const base = await pick().call('moves', opp, me, d0, d1, ctx, 4, played); // every move, scored at 0-ply
    const all = base.moves.map(m => ({ ...m, eq2: m.probs[5] }));
    let playedIdx = base.played;
    const playedMove = playedIdx >= 0 ? all[playedIdx] : null;
    if (!all.length) return { moves: [], played: -1, total: 0 };
    let cand = all.length, maxPly = 0;
    let finished = false;
    for (let iPly = 0; iPly < S.plies; iPly++) {
      const f = S.f[iPly] || [0, 0, 0];
      if (f[0] < 0) continue;
      if (iPly > 0) await scoreSplit(opp, me, all.slice(0, cand), iPly, ctx, level);
      const head = all.slice(0, cand).sort(byScore);
      all.splice(0, cand, ...head);
      const k = cand;
      cand = Math.min(f[0], cand);
      const limit = Math.min(k, cand + f[1]);
      for (; cand < limit; cand++) if (all[cand].eq < all[0].eq - f[2]) break;
      maxPly = iPly;
      if (cand === 1 && f[0] !== 1) { finished = true; break; }
    }
    if (!finished) {
      await scoreSplit(opp, me, all.slice(0, cand), S.plies, ctx, level);
      const head = all.slice(0, cand).sort(byScore);
      all.splice(0, cand, ...head);
      maxPly = S.plies;
    }
    // analysis: make sure the played move and the best move are judged at full depth
    if (playedMove) {
      const need = [];
      if (playedMove.ply < S.plies && !same(playedMove.move, all[0].move)) need.push(playedMove);
      if (need.length && all[0].ply < S.plies) need.push(all[0]);
      if (need.length) await scoreSplit(opp, me, need, S.plies, ctx, level);
    }
    const out = all.map(m => ({ move: m.move, eq: m.eq, probs: m.probs, ply: m.ply }));
    const pi = playedMove ? all.indexOf(playedMove) : -1;
    return { moves: out, played: pi, total: base.total };
  }
  return { call, moves, get size() { return readyWorkers().length; } };
})();
/* ===================== HELPERS ===================== */
const LEVELS = [
  { v: 4, name: 'Expert', note: '0-ply, instant' },
  { v: 5, name: 'World Class', note: '2-ply, fastest strong level' },
  { v: 6, name: 'Supremo', note: '2-ply, wider search' },
  { v: 7, name: 'Grandmaster', note: '3-ply, strongest' }
];
const aLevel = () => Math.max(5, (typeof Game !== 'undefined' && Game.M && Game.M.level) || Settings.level || 5);
const SKILL = { doubtful: 0.04, error: 0.08, blunder: 0.16 };
function band(loss) {
  if (loss == null) return null;
  if (loss >= SKILL.blunder) return 'blunder';
  if (loss >= SKILL.error) return 'error';
  if (loss >= SKILL.doubtful) return 'doubtful';
  return 'good';
}
const BAND_LABEL = { good: 'Good', best: 'Best', doubtful: 'Doubtful', error: 'Error', blunder: 'Blunder' };
function prLabel(pr) {
  if (pr == null || isNaN(pr)) return '';
  const t = [[2.5, 'Supernatural'], [5, 'World Class'], [7.5, 'Expert'], [12.5, 'Advanced'], [17.5, 'Intermediate'], [22.5, 'Casual'], [30, 'Beginner'], [35, 'Distracted'], [1e9, 'Awful']];
  for (const [x, n] of t) if (pr < x) return n;
}
function luckLabel(perMove) {
  const r = perMove * 10;
  if (r > 0.6) return 'Go to Las Vegas';
  if (r > 0.3) return 'Good dice, man!';
  if (r < -0.6) return 'Go to bed';
  if (r < -0.3) return 'Bad dice, man!';
  return 'Average dice';
}
function rollDie() {
  const a = new Uint8Array(1);
  while (true) { crypto.getRandomValues(a); if (a[0] < 252) return 1 + (a[0] % 6); }
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const fmtEq = (x) => (x >= 0 ? '+' : '−') + Math.abs(x).toFixed(3);
const fmtLoss = (x) => x > 0.0005 ? '−' + x.toFixed(3) : '0.000';
const clone = (o) => JSON.parse(JSON.stringify(o));

/* ===================== SOUND ===================== */
const Sound = (() => {
  let ctx = null, on = true;
  function ac() { if (!ctx) { try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { ctx = null; } } return ctx; }
  function tone(f, d, type = 'sine', vol = .08, when = 0) {
    const c = ac(); if (!c) return;
    const o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.value = f;
    g.gain.setValueAtTime(vol, c.currentTime + when);
    g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + when + d);
    o.connect(g); g.connect(c.destination); o.start(c.currentTime + when); o.stop(c.currentTime + when + d + .02);
  }
  function noise(d, vol = .06, when = 0, hp = 1200) {
    const c = ac(); if (!c) return;
    const len = Math.floor(c.sampleRate * d), buf = c.createBuffer(1, len, c.sampleRate), data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
    const s = c.createBufferSource(), g = c.createGain(), f = c.createBiquadFilter();
    f.type = 'highpass'; f.frequency.value = hp;
    s.buffer = buf; g.gain.value = vol; s.connect(f); f.connect(g); g.connect(c.destination); s.start(c.currentTime + when);
  }
  function play(kind) {
    if (!on) return;
    if (kind === 'place') { tone(190, .07, 'triangle', .07); noise(.025, .05, 0, 2500); }
    else if (kind === 'hit') { tone(140, .12, 'triangle', .1); noise(.05, .07, 0, 1500); }
    else if (kind === 'off') { tone(320, .08, 'sine', .05); }
    else if (kind === 'dice') { for (let i = 0; i < 4; i++) noise(.03, .05, i * .045, 3000); }
    else if (kind === 'cube') { tone(240, .09, 'square', .03); }
  }
  return { play, set on(v) { on = v; if (v) ac(); }, get on() { return on; }, unlock() { const c = ac(); if (c && c.state === 'suspended') c.resume(); } };
})();

/* ===================== STORAGE ===================== */
const Store = {
  get(k, d) { try { const v = localStorage.getItem('prime.v1.' + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('prime.v1.' + k, JSON.stringify(v)); return true; } catch (e) { return false; } },
  del(k) { try { localStorage.removeItem('prime.v1.' + k); } catch (e) { } }
};

const DEFAULT_SETTINGS = { level: 7, diceHighFirst: true, tutorAny: true, speed: 'normal', diceAnim: true, autoForced: true, autoRoll: true, flip: false, pips: true, sound: true, humanLight: true };
let Settings = Object.assign({}, DEFAULT_SETTINGS, Store.get('settings', {}));
if (!Settings.v2) { Settings.level = 7; Settings.v2 = true; Store.set('settings', Settings); } // Grandmaster is now the default
Settings.flip = false; // always: you move from top right round to bottom right
const SPEEDS = { fast: .6, normal: 1, slow: 1.5 };

/* ===================== GAME CONTROLLER ===================== */
const Game = (() => {
  let M = null;        // match
  let board = null;    // board view
  let busy = false;    // animation lock
  let turnInfo = null; // rules info for human's current roll
  let partial = [];    // human submoves this turn [{from,to,die,hit,snap}]
  let rem = [];        // remaining dice values
  let order = [0, 1];  // display order of dice indices
  let phase = 'idle';  // idle | opening | preroll | moving | cubeOffer | botTurn | tutor | over
  let pendingCube = null; // promise for human cube analysis
  let lastBotIds = [];
  let resignOffered = 0;
  let pendingRecord = null; // move record in progress (tutor first attempt)
  const ui = {}; // hooks set by UI layer

  const cur = () => M && M.cur;
  const friend = () => !!(M && M.opp === 'friend');
  const oppName = () => friend() ? (M.oppName = Net.oppName) : 'Bot';
  const game = () => M && M.games[M.games.length - 1];

  function ctxFor(p) {
    const c = cur(), g = game();
    return {
      matchTo: M.matchTo, sMe: M.score[p], sOpp: M.score[1 - p],
      cube: c.cube.value, owner: c.cube.owner === -1 ? -1 : (c.cube.owner === p ? 1 : 0),
      crawford: !!g.crawford, jacoby: !!(M.matchTo === 0 && M.jacoby && M.cubeOn), cubeful: !!M.cubeOn
    };
  }
  const sides = (p) => { const b = cur().b; return { me: b[p], opp: b[1 - p] }; };
  function canDouble(p) {
    if (!M.cubeOn) return false;
    const c = cur(), g = game();
    if (g.crawford) return false;
    if (c.cube.owner !== -1 && c.cube.owner !== p) return false;
    if (M.matchTo && M.score[p] + c.cube.value >= M.matchTo) return false; // dead cube for doubler
    return true;
  }

  function save() {
    if (!M) return;
    try { M.savedAt = Date.now(); Store.set('current', M); } catch (e) { }
  }

  /* ---------- analysis ---------- */
  const ANALYSIS_MAX_CANDS = 8;
  function compactMoves(res, playedIdx) {
    const keep = res.moves.slice(0, ANALYSIS_MAX_CANDS).map((m, i) => ({ ...m, i }));
    if (playedIdx >= ANALYSIS_MAX_CANDS && res.moves[playedIdx]) keep.push({ ...res.moves[playedIdx], i: playedIdx });
    return keep.map(m => ({ m: m.move, eq: +m.eq.toFixed(5), pr: m.probs.map(x => +x.toFixed(4)), ply: m.ply, i: m.i }));
  }
  // fg = someone is waiting for this (tutor): use the play pool; otherwise background engine
  async function analyseMove(rec, precomputed, fg) {
    const me = rec.b[rec.p], opp = rec.b[1 - rec.p];
    try {
      if (rec.forcedNone) { rec.an = { cands: [], played: -1, loss: 0, total: 0 }; }
      else {
        const played = R.toGnubg(rec.subs);
        const res = precomputed || (fg ? await Play.moves(opp, me, rec.dice[0], rec.dice[1], rec.ctx, aLevel(), played)
          : await Engine.call('moves', opp, me, rec.dice[0], rec.dice[1], rec.ctx, aLevel(), played));
        let pi = precomputed ? 0 : res.played;
        if (pi < 0) pi = 0;
        // best = highest eq among full-ply moves
        let best = res.moves[0];
        for (const m of res.moves) if (m.ply >= best.ply && m.eq > best.eq) best = m;
        const loss = Math.max(0, best.eq - res.moves[pi].eq);
        rec.an = { cands: compactMoves(res, pi), played: pi, loss: +loss.toFixed(5), total: res.total };
        rec.alv = aLevel();
      }
      if (rec.luck == null) {
        const L = await Engine.call('luck', opp, me, rec.dice[0], rec.dice[1], rec.ctx);
        rec.luck = +L.luck.toFixed(5);
        if (M.matchTo) {
          const hi = await Engine.call('eq2mwc', 1, rec.ctx), lo = await Engine.call('eq2mwc', -1, rec.ctx);
          rec.mwcK = +((hi - lo) / 2).toFixed(5);
        }
      }
    } catch (e) { console.warn('analysis failed', e); }
    return rec;
  }
  function cubeLoss(rec) {
    const a = rec.an; if (!a) return null;
    if (rec.k === 'cube') {
      const dbl = Math.min(a.dt, a.dp);
      const opt = Math.max(a.nd, dbl);
      const got = rec.action === 'double' ? dbl : a.nd;
      return Math.max(0, opt - got);
    } else { // take decision, a is from doubler perspective
      const best = Math.min(a.dt, a.dp);
      const got = rec.action === 'take' ? a.dt : a.dp;
      return Math.max(0, got - best);
    }
  }
  async function analyseCube(rec, pre) {
    try {
      const a = pre || await Engine.call('cube', rec.b[1 - rec.doubler], rec.b[rec.doubler], rec.ctx, aLevel());
      rec.an = { nd: +a.nd.toFixed(5), dt: +a.dt.toFixed(5), dp: +a.dp.toFixed(5), optimal: +a.optimal.toFixed(5), cd: a.cd, close: a.close, pr: a.probs.map(x => +x.toFixed(4)) };
      rec.loss = +cubeLoss(rec).toFixed(5);
      rec.counted = rec.k === 'take' || rec.action === 'double' || rec.an.close || rec.loss > 0.0005;
    } catch (e) { console.warn('cube analysis failed', e); }
    return rec;
  }
  // engine 'cube' wants (opp, me) for the doubler on roll
  function cubeCall(doubler, ctx, fg) {
    const b = cur().b;
    return (fg ? Play : Engine).call('cube', b[1 - doubler], b[doubler], ctx, aLevel());
  }
  // (analysis level follows the bot's level, so the bot's own cube decisions use it too)
  async function ensureAnalysis(rec) {
    if (rec.k === 'move' && (!rec.an || rec.luck == null)) await analyseMove(rec);
    else if ((rec.k === 'cube' || rec.k === 'take') && !rec.an) {
      const a = await Engine.call('cube', rec.b[1 - rec.doubler], rec.b[rec.doubler], rec.ctx, aLevel());
      await analyseCube(rec, a);
    }
    return rec;
  }

  /* ---------- match lifecycle ---------- */
  function newMatch(opts) {
    M = {
      id: 'm' + Date.now().toString(36), created: Date.now(), mode: opts.mode, matchTo: opts.matchTo, cubeOn: opts.cubeOn,
      jacoby: opts.jacoby, level: opts.level, score: [0, 0], crawfordUsed: false, games: [], cur: null, over: false, winner: null,
      opp: opts.opp || 'bot', net: opts.net || null, oppName: opts.oppName || ''
    };
    if (friend()) { M.mode = 'normal'; Net.setHooks(netHooks()); }
    startGame();
  }
  function startGame() {
    const g = { no: M.games.length + 1, startScore: M.score.slice(), crawford: false, recs: [], result: null };
    if (M.matchTo && M.cubeOn && !M.crawfordUsed && (M.score[0] === M.matchTo - 1 || M.score[1] === M.matchTo - 1)) { g.crawford = true; M.crawfordUsed = true; }
    M.games.push(g);
    M.cur = { b: [R.startSide(), R.startSide()], turn: -1, cube: { value: 1, owner: -1 }, dice: null, opening: true };
    resignOffered = 0;
    lastBotIds = [];
    render(true);
    save();
    ui.update && ui.update();
    openingRoll();
  }

  function render(full) {
    const c = cur();
    board.setSpeed(SPEEDS[Settings.speed] || 1);
    board.rebuild(c.b, { flip: Settings.flip, humanLight: Settings.humanLight, pips: Settings.pips, rot: boardRot(), slots: boardSlots() });
    board.drawCube({ on: M.cubeOn && !game().crawford, value: c.cube.value, owner: c.cube.owner });
    board.drawDice(null);
    board.drawButtons([]);
    board.drawStatus(0, ''); board.drawStatus(1, '');
    board.drawArrows('');
  }

  async function openingRoll() {
    if (friend()) return friendOpening();
    phase = 'opening';
    busy = true;
    let a, b;
    do {
      a = rollDie(); b = rollDie();
      await board.rollDice({ single: [[0, a], [1, b]] }, Settings.diceAnim ? 320 : 0);
      if (a === b) { ui.toast && ui.toast(`Both rolled ${a}. Rolling again`); await sleep(650); }
    } while (a === b);
    await sleep(420);
    const p = a > b ? 0 : 1;
    const dice = p === 0 ? [a, b] : [b, a];
    cur().opening = false;
    busy = false;
    if (p === 0) await humanRolled(dice, true);
    else await botPlay(dice, true);
  }

  // Roll sits alone in the middle of your half; Double lives on the cube (and, in the
  // portrait button bar, at the far end away from Roll).
  function prerollButtons(dbl) {
    const b = [{ id: 'roll', label: 'Roll', kind: 'primary', side: 0, slot: 'center', w: 120, aria: 'Roll the dice' }];
    if (dbl) b.push({ id: 'double', label: 'Double', kind: 'accent', htmlOnly: true, aria: 'Offer a double' });
    return b;
  }
  function drawCubeNow(canDbl, animate) {
    const c = cur();
    board.drawCube({ on: M.cubeOn && !game().crawford, value: c.cube.value, owner: c.cube.owner, canDouble: !!canDbl }, animate);
  }
  /* ---------- human turn ---------- */
  async function humanPreRoll() {
    phase = 'preroll';
    const c = cur();
    c.turn = 0; c.dice = null;
    board.drawDice(null);
    save();
    ui.update && ui.update();
    const dbl = canDouble(0);
    pendingCube = dbl ? cubeCall(0, ctxFor(0), M.mode === 'tutor' || !friend()) : null;
    if (!dbl && Settings.autoRoll) { await sleep(120); return doRoll(); }
    board.drawButtons(prerollButtons(dbl));
    if (dbl) drawCubeNow(true);
  }

  async function doRoll(skipCubeRecord) {
    if (!skipCubeRecord && phase !== 'preroll') return;
    phase = 'rolling';
    board.drawButtons([]);
    drawCubeNow(false);
    if (canDouble(0) && !skipCubeRecord) {
      // record the "no double" decision
      const rec = { k: 'cube', p: 0, doubler: 0, action: 'nodouble', b: clone(cur().b), ctx: ctxFor(0) };
      game().recs.push(rec);
      if (M.mode === 'tutor') {
        const a = await pendingCube;
        await analyseCube(rec, a);
        if (rec.loss != null && tutorFlag(rec.loss)) {
          phase = 'tutor';
          const choice = await ui.tutorCube(rec, 'nodouble');
          phase = 'rolling';
          if (choice === 'switch') { rec.tutorSwitched = true; return doDouble(true); }
        }
      } else if (pendingCube) pendingCube.then(a => analyseCube(rec, a)).catch(() => { });
    }
    const d = [rollDie(), rollDie()];
    if (friend()) Net.send({ t: 'roll', d });
    await humanRolled(d, false);
  }

  async function humanRolled(dice, opening) {
    phase = 'moving';
    const c = cur();
    c.turn = 0; c.dice = dice;
    // the larger die always comes first; tapping the dice swaps them for this roll only
    order = dice[0] >= dice[1] ? [0, 1] : [1, 0];
    partial = []; rem = R.diceList(dice[0], dice[1]);
    const { me, opp } = sides(0);
    turnInfo = R.turnInfo(me, opp, dice[0], dice[1]);
    pendingRecord = { k: 'move', p: 0, dice: dice.slice(), b: clone(c.b), ctx: ctxFor(0), subs: [] };
    if (turnInfo.maxTotal === 0) {
      phase = 'auto';
      pendingRecord.forcedNone = true;
      // shut out completely (no roll at all could move): skip straight on.
      // Otherwise show the roll so it is clear what was rolled, then pass the turn.
      if (!opening && !shutOut(me, opp)) {
        busy = true;
        await board.rollDice(diceView(dice), Settings.diceAnim ? 300 : 0);
        ui.toast && ui.toast('No legal move with ' + dice.join('-'));
        await sleep(1100);
        busy = false;
      }
      return commitHuman(true);
    }
    if (!opening) { busy = true; await board.rollDice(diceView(dice), Settings.diceAnim ? 300 : 0); busy = false; }
    else board.drawDice(diceView(dice));
    save();
    ui.update && ui.update();
    if (turnInfo.finals.size === 1 && Settings.autoForced) {
      const seq = [...turnInfo.finals.values()][0];
      phase = 'auto';
      await sleep(250);
      busy = true;
      for (const s of seq) await playStep(s.from, s.die, true);
      busy = false;
      await sleep(200);
      return commitHuman(true);
    }
    board.setInteractive(true);
    drawMoveButtons();
  }

  function diceView(dice) {
    const vals = dice[0] === dice[1] ? [dice[0], dice[0], dice[0], dice[0]] : dice.slice();
    return { p: 0, vals, used: vals.map(() => false), order: order.slice() };
  }
  function usedFlags(vals) {
    if (!rem) return vals.map(() => false);
    if (vals.length === 4) { const n = 4 - rem.length; return vals.map((_, i) => i < n); }
    const r = rem.slice();
    return vals.map(v => { const i = r.indexOf(v); if (i >= 0) { r.splice(i, 1); return false; } return true; });
  }
  function drawMoveButtons() {
    const c = cur();
    if (!c.dice) return;
    board.drawDice({ p: 0, vals: c.dice[0] === c.dice[1] ? [c.dice[0], c.dice[0], c.dice[0], c.dice[0]] : c.dice.slice(), used: usedFlags(c.dice[0] === c.dice[1] ? [c.dice[0], c.dice[0], c.dice[0], c.dice[0]] : c.dice), order: order.slice() });
    const btns = [];
    if (partial.length) btns.push({ id: 'undo', label: 'Undo', kind: 'ghost', side: 0, slot: 'farleft', w: 100, aria: 'Undo last checker move' });
    if (turnInfo && partial.length === turnInfo.maxTotal) btns.push({ id: 'done', label: 'Done', kind: 'accent', side: 0, slot: 'farright', w: 100, aria: 'Confirm move' });
    board.drawButtons(btns);
    ui.update && ui.update();
  }

  function preferredDice() {
    const c = cur();
    if (c.dice[0] === c.dice[1]) return [c.dice[0]];
    return order.map(i => c.dice[i]);
  }
  function canPick(from) {
    if (phase !== 'moving' || busy || !turnInfo) return false;
    const { me, opp } = sides(0);
    if (!me[from]) return false;
    for (const d of new Set(rem)) if (R.stepLegal(turnInfo, me, opp, rem, partial.length, from, d)) return true;
    return false;
  }
  function dests(from) {
    if (!turnInfo) return new Map();
    const { me, opp } = sides(0);
    return R.destinations(turnInfo, me, opp, rem, partial.length, from, preferredDice());
  }
  async function tap(from) {
    if (phase !== 'moving' || busy || !turnInfo) return;
    const { me, opp } = sides(0);
    // bearing off: prefer the smallest die that takes the checker off
    const offDice = [...new Set(rem)].sort((a, b) => a - b).filter(d => R.subDest(me, opp, from, d) === -1 && R.stepLegal(turnInfo, me, opp, rem, partial.length, from, d));
    if (offDice.length > 1) { busy = true; await playStep(from, offDice[0]); busy = false; afterStep(); return; }
    for (const d of preferredDice().concat(rem)) {
      if (!rem.includes(d)) continue;
      if (R.stepLegal(turnInfo, me, opp, rem, partial.length, from, d)) { busy = true; await playStep(from, d); busy = false; afterStep(); return; }
    }
  }
  async function drop(from, dest) {
    if (phase !== 'moving' || busy || !turnInfo) return;
    const path = dests(from).get(dest);
    if (!path) return;
    busy = true;
    for (const st of path) await playStep(st.from, st.d, false, path.length > 1 ? 170 : 200);
    busy = false;
    afterStep();
  }
  async function playStep(from, d, auto, dur) {
    const c = cur();
    const snap = clone(c.b);
    const s = R.applySub(c.b[0], c.b[1], from, d);
    partial.push({ ...s, snap });
    rem = R.removeOne(rem, d);
    board.setMarked([]);
    await board.moveChecker(0, from, s.to, s.hit, { dur });
    if (auto) drawMoveButtons();
  }
  function afterStep() {
    drawMoveButtons();
    if (turnInfo && partial.length === turnInfo.maxTotal && rem.length >= 0) {
      // all usable dice played: nothing else to do; wait for Done (tap dice also confirms)
    }
  }
  async function undo() {
    if (phase !== 'moving' || busy || !partial.length) return;
    busy = true;
    const s = partial.pop();
    cur().b = s.snap;
    rem.push(s.die);
    await board.unmoveChecker(0, s.from, s.to, s.hit);
    busy = false;
    drawMoveButtons();
  }
  async function undoAll(fast) {
    busy = true;
    while (partial.length) {
      const s = partial.pop();
      cur().b = s.snap;
      rem.push(s.die);
      await board.unmoveChecker(0, s.from, s.to, s.hit);
    }
    busy = false;
  }
  function swapDice() {
    const c = cur();
    if (phase !== 'moving' || busy || !c.dice || c.dice[0] === c.dice[1]) return;
    if (partial.length) return;
    order = [order[1], order[0]];
    drawMoveButtons();
  }
  async function diceTap() {
    if (phase !== 'moving') return;
    if (turnInfo && partial.length === turnInfo.maxTotal) return confirmMove();
    swapDice();
  }

  async function confirmMove() {
    if (phase !== 'moving' || busy || !turnInfo) return;
    if (partial.length !== turnInfo.maxTotal) return;
    return commitHuman(false);
  }

  function tutorFlag(loss) { return Settings.tutorAny ? loss > 0.001 : loss >= SKILL.doubtful; }

  async function commitHuman(forced) {
    phase = 'committing';
    board.setInteractive(false);
    board.drawButtons([]);
    const rec = pendingRecord;
    const subsNow = partial.map(s => ({ from: s.from, to: s.to, die: s.die, hit: s.hit }));
    if (!rec.tutorDone) rec.subs = subsNow;   // the first attempt is what counts
    rec.forced = forced || (turnInfo && turnInfo.finals.size <= 1);
    if (M.mode === 'tutor' && !rec.forced && !rec.forcedNone && !rec.tutorDone) {
      phase = 'tutor';
      board.drawStatus(0, 'Checking your move');
      await analyseMove(rec, null, true);
      board.drawStatus(0, '');
      rec.tutorDone = true;
      if (rec.an && tutorFlag(rec.an.loss)) {
        const choice = await ui.tutorMove(rec);
        board.drawArrows('');
        if (choice === 'retry') {
          if (partial.length) await undoAll();
          rec.retried = true;
          phase = 'moving';
          board.setInteractive(true);
          drawMoveButtons();
          return; // stays pending; first attempt already analysed
        }
        if (choice === 'best') {
          if (partial.length) await undoAll();
          await playPairs(rec.an.cands[0].m);
          rec.playedBest = true;
        } else if (choice === 'keep' && !partial.length) {
          await playPairs(R.toGnubg(rec.subs).filter(x => x !== -1 || true).slice(0, rec.subs.length * 2));
        }
      }
    } else if (!rec.an) {
      analyseMove(rec); // background
    }
    game().recs.push(rec);
    if (friend()) Net.send({ t: 'move', m: rec.forcedNone ? [] : R.toGnubg(rec.subs).slice(0, rec.subs.length * 2) });
    pendingRecord = null;
    cur().dice = null;
    board.drawDice(null);
    turnInfo = null; partial = [];
    if (checkWin(0)) return;
    save();
    await sleep(120);
    if (friend()) friendTurn(); else botTurn();
  }
  // play gnubg-style pairs for the human (used for tutor "best" / "keep")
  async function playPairs(pairs) {
    busy = true;
    const { subs } = R.simulatePairs(cur().b[0], cur().b[1], pairs);
    for (const s of subs) {
      const c = cur(), snap = clone(c.b);
      const die = s.to >= 0 ? s.from - s.to : bestDieFor(s.from);
      const r = R.applySub(c.b[0], c.b[1], s.from, die);
      partial.push({ ...r, snap }); rem = R.removeOne(rem, die);
      await board.moveChecker(0, s.from, r.to, r.hit);
    }
    busy = false;
  }
  // tutor: rewind to the start of the turn and show your move (amber) vs the best move (green)
  async function previewBest(rec) {
    if (partial.length) await undoAll();
    const b = cur().b;
    const best = rec.an.cands[0].m;
    board.drawArrows(board.arrowsFor(b, 0, R.toGnubg(rec.subs).slice(0, rec.subs.length * 2), 'amber') + board.arrowsFor(b, 0, best, 'green'));
  }
  function bestDieFor(from) {
    // bearing off with a larger die: pick the smallest remaining die that bears off legally
    const { me, opp } = sides(0);
    const ds = [...new Set(rem)].sort((a, b) => a - b);
    for (const d of ds) if (R.subDest(me, opp, from, d) === -1) return d;
    return ds[ds.length - 1];
  }

  async function doDouble(fromTutor) {
    if (!fromTutor && phase !== 'preroll') return;
    phase = 'doubling';
    board.drawButtons([]);
    drawCubeNow(false);
    const a = await pendingCube;
    const rec = { k: 'cube', p: 0, doubler: 0, action: 'double', b: clone(cur().b), ctx: ctxFor(0) };
    await analyseCube(rec, a);
    if (!fromTutor) {
      game().recs.push(rec);
      if (M.mode === 'tutor' && rec.loss != null && tutorFlag(rec.loss)) {
        phase = 'tutor';
        const choice = await ui.tutorCube(rec, 'double');
        phase = 'doubling';
        if (choice === 'switch') { rec.tutorSwitched = true; return doRoll(true); }
      }
    }
    phase = 'cubeOffer';
    const c = cur();
    Sound.play('cube');
    board.drawCube({ on: true, value: c.cube.value, owner: c.cube.owner, offeredTo: 1, prev: null }, true);
    let take;
    if (friend()) {
      Net.send({ t: 'dbl' });
      board.drawStatus(1, `${oppName()} is deciding`);
      let act;
      do { act = await Net.next(); } while (act.t !== 'take' && act.t !== 'pass');
      take = act.t === 'take';
    } else {
      board.drawStatus(1, 'Considering…');
      await sleep(500);
      // bot decides: take if doubler's equity when taken < when passed
      take = rec.an ? rec.an.dt < rec.an.dp : true;
    }
    const trec = { k: 'take', p: 1, doubler: 0, action: take ? 'take' : 'pass', b: clone(c.b), ctx: ctxFor(0) };
    await analyseCube(trec, a);
    game().recs.push(trec);
    board.drawStatus(1, '');
    if (!take) {
      ui.toast && ui.toast(`${oppName()} passes`);
      await sleep(500);
      return endGame(0, c.cube.value, 'pass');
    }
    ui.toast && ui.toast(`${oppName()} takes`);
    c.cube.value *= 2; c.cube.owner = 1;
    board.drawCube({ on: true, value: c.cube.value, owner: 1 }, true);
    save();
    ui.update && ui.update();
    await sleep(350);
    const d = [rollDie(), rollDie()];
    if (friend()) Net.send({ t: 'roll', d });
    await humanRolled(d, false);
  }

  /* ---------- bot turn ---------- */
  async function botTurn() {
    phase = 'botTurn';
    const c = cur();
    c.turn = 1; c.dice = null;
    ui.update && ui.update();
    board.setMarked([]);
    // resignation check + cube decision
    let ca = null;
    if (canDouble(1)) {
      ca = await cubeCall(1, ctxFor(1), true);
      const rec = { k: 'cube', p: 1, doubler: 1, action: 'nodouble', b: clone(c.b), ctx: ctxFor(1) };
      const doubles = [0, 1, 5, 7, 8, 16, 17, 18, 19, 20].includes(ca.cd);
      rec.action = doubles ? 'double' : 'nodouble';
      await analyseCube(rec, ca);
      game().recs.push(rec);
      if (doubles) {
        const res = await humanCubeResponse(ca);
        if (res === 'pass') return;
      }
    }
    // the bot resigns only when winning has become mathematically impossible
    const lvl = certainLoss(c.b[1], c.b[0]);
    if (lvl && lvl !== resignOffered) {
      resignOffered = lvl;
      const ok = await ui.botResigns(lvl);
      if (ok) return endGame(0, lvl, 'resign');
    }
    const d = [rollDie(), rollDie()];
    await botPlay(d, false);
  }
  // Bot (side `me`, on roll) vs human (`opp`). Returns 0, 1 (single) or 2 (gammon) when the
  // bot cannot win even if it rolls 6-6 every turn and the human rolls 2-1 every turn.
  function certainLoss(me, opp) {
    if (me[24] || opp[24]) return 0;
    let mMax = -1, oMax = -1;
    for (let i = 0; i < 24; i++) { if (me[i]) mMax = i; if (opp[i]) oMax = i; }
    if (mMax + oMax >= 23) return 0; // still contact: anything can happen
    // human: an achievable number of turns rolling 2-1 every time (upper bound)
    const hTurns = turnsWithRoll(opp, 2, 1);
    // bot: a lower bound on turns with 6-6 every time
    const n = 15 - R.off(me);
    const botTurns = Math.max(Math.ceil(R.pips(me) / 24), Math.ceil(n / 4));
    // bot rolls first; it wins if it finishes on its turn k <= human's finishing turn
    if (botTurns <= hTurns) return 0;
    if (R.off(me) === 0) {
      let outside = 0;
      for (let i = 6; i < 24; i++) outside += me[i] * (i - 5);
      const firstOff = Math.ceil((outside + 1) / 24);
      if (firstOff > hTurns) {
        // backgammon too if it can't even get every checker out of your home board in time
        let stuck = 0, nStuck = 0;
        for (let i = 18; i < 24; i++) { stuck += me[i] * (i - 17); nStuck += me[i]; }
        if (nStuck && Math.max(Math.ceil(stuck / 24), Math.ceil(nStuck / 4)) > hTurns) return 3;
        return 2;
      }
    }
    return 1;
  }
  function turnsWithRoll(side, d0, d1) {
    let me = side.slice(), opp = Array(25).fill(0), turns = 0;
    while (R.off(me) < 15 && turns < 200) {
      const ti = R.turnInfo(me, opp, d0, d1);
      let best = null, bp = 1e9;
      for (const seq of ti.finals.values()) {
        const m = me.slice(), o = opp.slice();
        for (const st of seq) R.applySub(m, o, st.from, st.die);
        const score = R.pips(m) * 20 - R.off(m);
        if (score < bp) { bp = score; best = m; }
      }
      if (best) me = best;
      turns++;
    }
    return turns;
  }
  async function humanCubeResponse(ca) {
    const c = cur();
    phase = 'cubeOffer';
    Sound.play('cube');
    board.drawCube({ on: true, value: c.cube.value, owner: c.cube.owner, offeredTo: 0 }, true);
    const choice = await new Promise(res => {
      ui._cubeResolve = res;
      board.drawButtons([
        { id: 'take', label: 'Take', kind: 'primary', side: 0, slot: 'left', w: 112, aria: 'Take the double', dy: 70 },
        { id: 'pass', label: 'Pass', kind: 'ghost', side: 0, slot: 'right', w: 112, aria: 'Pass the double', dy: 70 }
      ]);
      ui.toast && ui.toast(`${oppName()} doubles to ${c.cube.value * 2}`);
    });
    board.drawButtons([]);
    const rec = { k: 'take', p: 0, doubler: 1, action: choice, b: clone(c.b), ctx: ctxFor(1) };
    await analyseCube(rec, ca);
    let final = choice;
    if (!friend() && M.mode === 'tutor' && rec.loss != null && tutorFlag(rec.loss)) {
      const t = await ui.tutorCube(rec, choice);
      if (t === 'switch') { final = choice === 'take' ? 'pass' : 'take'; rec.tutorSwitched = true; }
    }
    game().recs.push(rec);
    if (friend()) Net.send({ t: final });
    if (final === 'pass') { await endGame(1, c.cube.value, 'pass'); return 'pass'; }
    c.cube.value *= 2; c.cube.owner = 0;
    board.drawCube({ on: true, value: c.cube.value, owner: 0 }, true);
    save();
    ui.update && ui.update();
    await sleep(250);
    return 'take';
  }

  async function botPlay(dice, opening) {
    phase = 'botTurn';
    const c = cur();
    c.turn = 1; c.dice = dice;
    ui.update && ui.update();
    if (!opening && R.turnInfo(c.b[1], c.b[0], dice[0], dice[1]).maxTotal === 0) {
      // the bot cannot move: show the roll unless no roll at all could move, then go to your turn
      if (!shutOut(c.b[1], c.b[0])) {
        await board.rollDice({ p: 1, vals: dice[0] === dice[1] ? [dice[0], dice[0], dice[0], dice[0]] : dice.slice(), used: [false, false, false, false], order: [0, 1] }, Settings.diceAnim ? 300 : 0);
        ui.toast && ui.toast(oppName() + ' can’t move with ' + dice.join('-'));
        await sleep(1100);
        board.drawDice(null);
      }
      const rec = { k: 'move', p: 1, dice: dice.slice(), b: clone(c.b), ctx: ctxFor(1), subs: [], forcedNone: true };
      analyseMove(rec);
      game().recs.push(rec);
      c.dice = null;
      save();
      return humanPreRoll();
    }
    if (!opening) await board.rollDice({ p: 1, vals: dice[0] === dice[1] ? [dice[0], dice[0], dice[0], dice[0]] : dice.slice(), used: [false, false, false, false], order: [0, 1] }, Settings.diceAnim ? 300 : 0);
    else board.drawDice({ p: 1, vals: dice.slice(), used: [false, false], order: [0, 1] });
    const ctx = ctxFor(1);
    const me = c.b[1], opp = c.b[0];
    const rec = { k: 'move', p: 1, dice: dice.slice(), b: clone(c.b), ctx, subs: [] };
    const t0 = performance.now();
    let thinking = setTimeout(() => board.drawStatus(1, 'Thinking'), 500);
    let res;
    try { res = await Play.moves(opp, me, dice[0], dice[1], ctx, M.level || 5); }
    catch (e) { ui.toast && ui.toast('Engine error: ' + e.message); return; }
    clearTimeout(thinking); board.drawStatus(1, '');
    const el = performance.now() - t0;
    if (el < 380) await sleep(380 - el);
    if (!res.moves.length) {
      rec.forcedNone = true;
    } else {
      const best = res.moves[0].move;
      const { subs } = R.simulatePairs(me, opp, best);
      const ids = [];
      for (let i = 0; i < subs.length; i++) {
        const s = subs[i];
        const sim = R.simulatePairs(c.b[1], c.b[0], [s.from, s.to]);
        c.b[1] = sim.me; c.b[0] = sim.opp;
        const id = await board.moveChecker(1, s.from, s.to, s.hit);
        ids.push(id);
        await sleep(60);
      }
      rec.subs = subs.map(s => ({ from: s.from, to: s.to, die: s.die, hit: s.hit }));
      rec.forced = res.total <= 1;
      lastBotIds = ids.filter(x => x != null);
      board.setMarked(lastBotIds);
      // analysis: reuse when bot plays at analysis level
      if ((M.level || 5) === aLevel()) analyseMove(rec, res); else analyseMove(rec);
      rec.alv = aLevel();
    }
    if (rec.forcedNone) analyseMove(rec);
    game().recs.push(rec);
    await sleep(250);
    c.dice = null;
    board.drawDice(null);
    if (checkWin(1)) return;
    save();
    humanPreRoll();
  }

  /* ---------- friend (remote player) ---------- */
  function netHooks() {
    return {
      status: (k) => {
        if (k === 'gone') { ui.toast && ui.toast(`${oppName()} disconnected. Waiting for them to come back`); board.drawStatus(1, `Waiting for ${oppName()}`); }
        if (k === 'back') { ui.toast && ui.toast(`${oppName()} is back`); board.drawStatus(1, ''); }
        ui.update && ui.update();
      }
    };
  }
  async function friendOpening() {
    phase = 'opening';
    const c = cur();
    let mine, theirs;
    if (M.net.role === 'host') {
      if (!c.openMsg) {
        let a, b;
        do { a = rollDie(); b = rollDie(); } while (a === b);
        c.openMsg = { a, b };
        Net.send({ t: 'open', a, b, g: game().no });
        save();
      }
      mine = c.openMsg.a; theirs = c.openMsg.b;
    } else {
      board.drawStatus(1, `Waiting for ${oppName()}`);
      let act;
      do { act = await Net.next(); } while (act.t !== 'open');
      board.drawStatus(1, '');
      mine = act.b; theirs = act.a;
    }
    busy = true;
    await board.rollDice({ single: [[0, mine], [1, theirs]] }, Settings.diceAnim ? 320 : 0);
    await sleep(420);
    busy = false;
    c.opening = false;
    if (mine > theirs) await humanRolled([mine, theirs], true);
    else { await remotePlay([theirs, mine], true); }
  }
  // Their turn: wait for what they do next (double, roll, resign).
  async function friendTurn() {
    phase = 'remote';
    const c = cur();
    c.turn = 1; c.dice = null;
    ui.update && ui.update();
    board.setMarked([]);
    save();
    board.drawStatus(1, Net.connected ? '' : `Waiting for ${oppName()}`);
    while (true) {
      const act = await Net.next();
      if (act.t === 'dbl') {
        const ca = await cubeCall(1, ctxFor(1));
        const rec = { k: 'cube', p: 1, doubler: 1, action: 'double', b: clone(c.b), ctx: ctxFor(1) };
        await analyseCube(rec, ca);
        game().recs.push(rec);
        const res = await humanCubeResponse(ca);
        if (res === 'pass') return;
        phase = 'remote';
        continue;
      }
      if (act.t === 'resign') {
        const ok = await ui.botResigns(act.l, oppName());
        Net.send({ t: ok ? 'racc' : 'rdec' });
        if (ok) return endGame(0, act.l, 'resign');
        continue;
      }
      if (act.t === 'roll') {
        if (canDouble(1)) {
          const rec = { k: 'cube', p: 1, doubler: 1, action: 'nodouble', b: clone(c.b), ctx: ctxFor(1) };
          game().recs.push(rec);
          cubeCall(1, ctxFor(1)).then(a => analyseCube(rec, a)).catch(() => { });
        }
        return remotePlay(act.d, false);
      }
    }
  }
  // true when no roll at all (all 21) would give this side a legal move, e.g. on the bar against a closed board
  function shutOut(me, opp) {
    for (let a = 1; a <= 6; a++) for (let b = a; b <= 6; b++) if (R.turnInfo(me, opp, a, b).maxTotal > 0) return false;
    return true;
  }
  async function remotePlay(dice, opening) {
    phase = 'remote';
    const c = cur();
    c.turn = 1; c.dice = dice;
    ui.update && ui.update();
    const ctx = ctxFor(1);
    const rec = { k: 'move', p: 1, dice: dice.slice(), b: clone(c.b), ctx, subs: [] };
    const canMove = R.turnInfo(c.b[1], c.b[0], dice[0], dice[1]).maxTotal > 0;
    if (canMove || !shutOut(c.b[1], c.b[0])) {
      if (!opening) await board.rollDice({ p: 1, vals: dice[0] === dice[1] ? [dice[0], dice[0], dice[0], dice[0]] : dice.slice(), used: [false, false, false, false], order: [0, 1] }, Settings.diceAnim ? 300 : 0);
      else board.drawDice({ p: 1, vals: dice.slice(), used: [false, false], order: [0, 1] });
    }
    let act;
    do { act = await Net.next(); } while (act.t !== 'move');
    const pairs = Array.isArray(act.m) ? act.m.slice(0, 8).map(x => x | 0) : [];
    if (!pairs.length) rec.forcedNone = true;
    else {
      const { subs } = R.simulatePairs(c.b[1], c.b[0], pairs);
      const ids = [];
      for (const s of subs) {
        const sim = R.simulatePairs(c.b[1], c.b[0], [s.from, s.to]);
        c.b[1] = sim.me; c.b[0] = sim.opp;
        ids.push(await board.moveChecker(1, s.from, s.to, s.hit));
        await sleep(60);
      }
      rec.subs = subs.map(s => ({ from: s.from, to: s.to, die: s.die, hit: s.hit }));
      lastBotIds = ids.filter(x => x != null);
      board.setMarked(lastBotIds);
    }
    analyseMove(rec);
    game().recs.push(rec);
    await sleep(200);
    c.dice = null;
    board.drawDice(null);
    if (checkWin(1)) return;
    save();
    humanPreRoll();
  }

  /* ---------- game end ---------- */
  function checkWin(p) {
    const c = cur();
    if (R.off(c.b[p]) < 15) return false;
    let lvl = R.gameValue(c.b[1 - p]);
    if (M.matchTo === 0 && M.jacoby && M.cubeOn && c.cube.value === 1 && c.cube.owner === -1) lvl = 1;
    endGame(p, lvl * c.cube.value, ['', 'single', 'gammon', 'backgammon'][lvl], lvl);
    return true;
  }
  async function endGame(winner, points, how, lvl) {
    phase = 'over';
    board.setInteractive(false);
    board.drawButtons([]);
    const g = game(), c = cur();
    if (how === 'resign') {
      let lv = points;
      const jac = M.matchTo === 0 && M.jacoby && M.cubeOn && c.cube.value === 1 && c.cube.owner === -1;
      how = ['', 'single game', 'gammon', 'backgammon'][lv] + ' resigned';
      if (jac) lv = 1;
      points = lv * c.cube.value;
    }
    if (how === 'pass') how = 'double passed';
    g.result = { winner, points, how, cube: c.cube.value };
    M.score[winner] += points;
    if (M.matchTo && M.score[winner] >= M.matchTo) { M.over = true; M.winner = winner; }
    if (!M.matchTo) { M.over = true; M.winner = winner; }
    save();
    ui.update && ui.update();
    await sleep(350);
    ui.gameOver && ui.gameOver(g, M);
    if (M.over) { archive(); if (friend()) setTimeout(() => Net.leave(), 4000); }
  }
  function archive() {
    const hist = Store.get('history', []);
    const i = hist.findIndex(h => h.id === M.id);
    const copy = clone(M); copy.cur = null;
    if (i >= 0) hist[i] = copy; else hist.unshift(copy);
    while (hist.length > 25) hist.pop();
    if (!Store.set('history', hist)) { // storage full: drop oldest analyses
      while (hist.length > 5) hist.pop();
      Store.set('history', hist);
    }
    Store.del('current');
  }
  function nextGame() { if (!M.over) startGame(); }

  async function humanResign(lvl) {
    if (!M || M.over || phase === 'over' || phase === 'opening') return false;
    const c = cur();
    if (friend()) {
      if (!(phase === 'preroll' || phase === 'moving')) return 'notnow';
      if (phase === 'moving' && partial.length) await undoAll();
      const was = phase;
      phase = 'resigning';
      board.setInteractive(false);
      Net.send({ t: 'resign', l: lvl });
      board.drawStatus(1, `${oppName()} is deciding`);
      let act;
      do { act = await Net.next(); } while (act.t !== 'racc' && act.t !== 'rdec');
      board.drawStatus(1, '');
      if (act.t === 'racc') { await endGame(1, lvl, 'resign'); return true; }
      phase = was;
      if (was === 'moving') { board.setInteractive(true); drawMoveButtons(); }
      return false;
    }
    // bot evaluates from its own perspective as if on roll
    const ctx = ctxFor(1);
    let ev;
    if (c.turn === 1 || c.turn === -1) ev = await Play.call('evaluate', c.b[0], c.b[1], ctx, aLevel());
    else { const e0 = await Play.call('evaluate', c.b[1], c.b[0], ctxFor(0), aLevel()); ev = { eq: -e0.eq }; }
    const val = await Engine.call('pointsEq', lvl, ctx);
    const accept = val >= ev.eq - 1e-4;
    if (accept) {
      if (pendingRecord && phase === 'moving') { await undoAll(); }
      board.setInteractive(false);
      await endGame(1, lvl, 'resign');
    }
    return accept;
  }

  /* ---------- resume ---------- */
  async function resume(saved) {
    M = saved;
    render(true);
    ui.update && ui.update();
    const c = cur();
    if (M.over) return;
    if (friend()) {
      try { await Net.resume(M.net, netHooks()); M.net = Net.state; }
      catch (e) { ui.toast && ui.toast('Can’t reconnect to your friend here'); return; }
      if (c.opening || c.turn === -1) return friendOpening();
      if (c.turn === 0) { if (c.dice) return humanRolled(c.dice, true); return humanPreRoll(); }
      return friendTurn();
    }
    if (c.opening || c.turn === -1) return openingRoll();
    if (c.turn === 0) { if (c.dice) return humanRolled(c.dice, true); return humanPreRoll(); }
    return botTurn();
  }

  /* ---------- stats ---------- */
  function stats(games, p) {
    let cl = 0, cn = 0, ul = 0, un = 0, luck = 0, luckN = 0, luckPts = 0, luckMwc = 0;
    const cnt = { doubtful: 0, error: 0, blunder: 0 }, ccnt = { doubtful: 0, error: 0, blunder: 0 };
    let pending = 0;
    for (const g of games) for (const r of g.recs) {
      if (r.p !== p) continue;
      if (r.k === 'move') {
        if (r.luck != null) { luck += r.luck; luckN++; luckPts += r.luck * (r.ctx.cube || 1); if (r.mwcK) luckMwc += r.luck * r.mwcK; }
        if (!r.an) { if (!r.forcedNone) pending++; continue; }
        if (r.forced || r.forcedNone || r.an.total <= 1) continue;
        cl += r.an.loss; cn++;
        const b = band(r.an.loss); if (cnt[b] != null) cnt[b]++;
      } else if (r.k === 'cube' || r.k === 'take') {
        if (!r.an) { pending++; continue; }
        if (!r.counted) continue;
        ul += r.loss; un++;
        const b = band(r.loss); if (ccnt[b] != null) ccnt[b]++;
      }
    }
    const pr = (l, n) => n ? 500 * l / n : null;
    return {
      prChecker: pr(cl, cn), prCube: pr(ul, un), prAll: pr(cl + ul, cn + un), nChecker: cn, nCube: un,
      lossChecker: cl, lossCube: ul, cnt, ccnt, luck, luckN, luckPts, luckMwc, luckPer: luckN ? luck / luckN : 0, pending
    };
  }

  return {
    attach(b, hooks) { board = b; Object.assign(ui, hooks); },
    newMatch, resume, nextGame, humanResign, stats, ensureAnalysis, band,
    get M() { return M; }, get phase() { return phase; }, get busy() { return busy; }, previewBest,
    canPick, dests, tap, drop, undo, diceTap, swapDice,
    button(id) {
      Sound.unlock();
      if (id === 'roll') return doRoll();
      if (id === 'double') return doDouble();
      if (id === 'undo') return undo();
      if (id === 'done') return confirmMove();
      if (id === 'dice') return diceTap();
      if (id === 'take' || id === 'pass') { const r = ui._cubeResolve; ui._cubeResolve = null; if (r) r(id); }
    },
    key(e) {
      if (phase === 'moving') {
        if (e.key === 'Backspace' || (e.key === 'z' && (e.ctrlKey || e.metaKey))) { e.preventDefault(); undo(); }
        else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (turnInfo && partial.length === turnInfo.maxTotal) confirmMove(); else swapDice(); }
      } else if (phase === 'preroll') {
        if (e.key === 'Enter' || e.key === ' ' || e.key === 'r') { e.preventDefault(); doRoll(); }
        else if (e.key === 'd' && canDouble(0)) { e.preventDefault(); doDouble(); }
      }
    },
    redraw() {
      if (!M) return;
      const c = cur();
      const sel = { dice: c.dice, phase };
      board.setSpeed(SPEEDS[Settings.speed] || 1);
      board.rebuild(c.b, { flip: Settings.flip, humanLight: Settings.humanLight, pips: Settings.pips, rot: boardRot(), slots: boardSlots() });
      drawCubeNow(phase === 'preroll' && canDouble(0));
      if (phase === 'moving') drawMoveButtons();
      if (phase === 'preroll') board.drawButtons(prerollButtons(canDouble(0)));
      else if (c.dice) board.drawDice({ p: c.turn === 1 ? 1 : 0, vals: c.dice.slice(), used: [false, false], order: [0, 1] });
      board.setMarked(lastBotIds);
    },
    pips() { if (!M || !M.cur) return null; return [R.pips(M.cur.b[0]), R.pips(M.cur.b[1])]; },
    canDoubleNow: () => M && phase === 'preroll' && canDouble(0),
    get isFriend() { return friend(); },
    get oppName() { return M ? (friend() ? Net.oppName : 'Bot') : 'Bot'; },
    debugRestart() { render(true); humanRolled(cur().dice, true); },
    certainLoss
  };
})();
