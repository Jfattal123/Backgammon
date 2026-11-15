// Bot-vs-bot matches using the app's own move search (Play.moves from src/game.js) on the real engine.
// Also asks the engine's native gnubg search for its choice, to check the app's search reproduces it.
// usage: node selfplay.js <seed> <matchTo> <matches> <outprefix>
const fs = require('fs');
const ROOT = require('path').resolve(__dirname, '../..');
const { R } = require(ROOT + '/src/rules.js');
const { MatExport } = require(ROOT + '/src/matexport.js');
const LEVEL = 7;
(async () => {
  const E = await require(__dirname + '/eng.js')();
  // load the app's Play module verbatim, with the engine pool stubbed by this one engine
  const src = fs.readFileSync(ROOT + '/src/game.js', 'utf8');
  const a = src.indexOf('const Play = (() => {'), b = src.indexOf('})();', a) + 5;
  const wrap = (fn, ...x) => new Promise(r => r(E[fn](...x)));
  const navigator = { hardwareConcurrency: 4, deviceMemory: 8 }, location = { search: '' };
  const Engine = { ready: Promise.resolve(), call: wrap };
  const makeEngineWorker = () => ({ info: {}, busy: 0, call: wrap });
  const Play = eval(src.slice(a, b).replace('const Play =', '') );
  await new Promise(r => setTimeout(r, 10));

  const [seed, matchTo, nMatches, out] = [+process.argv[2] || 1, +process.argv[3] || 5, +process.argv[4] || 1, process.argv[5] || 'm'];
  let s = seed >>> 0; const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const die = () => 1 + Math.floor(rnd() * 6);
  const DOUBLES = [0, 1, 5, 7, 8, 16, 17, 18, 19, 20];
  const stats = { moves: 0, nonForced: 0, differ: 0, diffs: [], ms: 0 };
  for (let mi = 0; mi < nMatches; mi++) {
    const M = { created: Date.now(), matchTo, score: [0, 0], games: [], over: false, crawfordUsed: false };
    while (!M.over) {
      const g = { startScore: M.score.slice(), recs: [], crawford: false, result: null };
      if (!M.crawfordUsed && (M.score[0] === matchTo - 1 || M.score[1] === matchTo - 1)) { g.crawford = true; M.crawfordUsed = true; }
      M.games.push(g);
      const bd = [R.startSide(), R.startSide()], cube = { value: 1, owner: -1 };
      let d0, d1; do { d0 = die(); d1 = die(); } while (d0 === d1);
      let p = d0 > d1 ? 0 : 1, dice = p === 0 ? [d0, d1] : [d1, d0], first = true;
      const ctx = (q) => ({ matchTo, sMe: M.score[q], sOpp: M.score[1 - q], cube: cube.value, owner: cube.owner === -1 ? -1 : (cube.owner === q ? 1 : 0), crawford: g.crawford, jacoby: false, cubeful: true });
      const end = (w, pts) => { g.result = { winner: w, points: pts }; M.score[w] += pts; if (M.score[w] >= matchTo) M.over = true; };
      while (!g.result) {
        if (!first) {
          // cube
          const can = !g.crawford && (cube.owner === -1 || cube.owner === p) && M.score[p] + cube.value < matchTo;
          if (can) {
            const ca = E.cube(bd[1 - p], bd[p], ctx(p), LEVEL);
            if (DOUBLES.includes(ca.cd)) {
              g.recs.push({ k: 'cube', p, action: 'double', ctx: ctx(p) });
              const take = ca.dt < ca.dp;
              g.recs.push({ k: 'take', p: 1 - p, action: take ? 'take' : 'pass' });
              if (!take) { end(p, cube.value); break; }
              cube.value *= 2; cube.owner = 1 - p;
            }
          }
          dice = [die(), die()];
        }
        first = false;
        const me = bd[p], opp = bd[1 - p];
        const t0 = Date.now();
        const res = await Play.moves(opp, me, dice[0], dice[1], ctx(p), LEVEL);
        stats.ms += Date.now() - t0;
        const rec = { k: 'move', p, dice: dice.slice(), subs: [] };
        if (res.moves.length) {
          const best = res.moves[0].move;
          stats.moves++;
          if (res.moves.length > 1) {
            stats.nonForced++;
            const nat = E.moves(opp, me, dice[0], dice[1], ctx(p), LEVEL).moves[0].move;
            const k1 = R.simulatePairs(me, opp, best), k2 = R.simulatePairs(me, opp, nat);
            if (R.key(k1.me, k1.opp) !== R.key(k2.me, k2.opp)) { stats.differ++; stats.diffs.push({ me, opp, dice, ctx: ctx(p), app: best, gnubg: nat }); }
          }
          const sim = R.simulatePairs(me, opp, best);
          bd[p] = sim.me; bd[1 - p] = sim.opp;
          rec.subs = sim.subs.map(x => ({ from: x.from, to: x.to, hit: x.hit }));
        } else rec.forcedNone = true;
        g.recs.push(rec);
        if (R.off(bd[p]) === 15) { end(p, R.gameValue(bd[1 - p]) * cube.value); break; }
        p = 1 - p;
      }
    }
    const f = `${out}-${mi}.mat`;
    fs.writeFileSync(f, MatExport.toMat(M, ['BotA', 'BotB']));
    console.log(f, M.score.join('-'), 'games', M.games.length);
  }
  fs.writeFileSync(`${out}-stats.json`, JSON.stringify(stats));
  console.log(JSON.stringify({ moves: stats.moves, nonForced: stats.nonForced, differ: stats.differ, avgMs: Math.round(stats.ms / stats.moves) }));
})();
