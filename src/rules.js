/* ===================== RULES ===================== */
// Each side's board: array(25) from its own perspective: 0 = ace point .. 23 = 24-point, 24 = bar.
const R = (() => {
  const startSide = () => { const a = Array(25).fill(0); a[5] = 5; a[7] = 3; a[12] = 5; a[23] = 2; return a; };
  const sum = (a) => a.reduce((s, x) => s + x, 0);
  const off = (a) => 15 - sum(a);
  const pips = (a) => a.reduce((s, x, i) => s + x * (i + 1), 0);
  const key = (me, opp) => me.join(',') + '|' + opp.join(',');
  const canBearOff = (me) => { if (me[24]) return false; for (let i = 6; i < 24; i++) if (me[i]) return false; return true; };

  // Returns destination index (-1 = off) or null if illegal.
  function subDest(me, opp, from, d) {
    if (!me[from]) return null;
    if (me[24] && from !== 24) return null;
    const to = from - d;
    if (to >= 0) return opp[23 - to] >= 2 ? null : to;
    if (!canBearOff(me)) return null;
    if (to === -1) return -1;
    for (let i = from + 1; i < 6; i++) if (me[i]) return null;
    return -1;
  }
  // Applies in place; returns {to, hit}
  function applySub(me, opp, from, d) {
    const to = subDest(me, opp, from, d);
    me[from]--;
    let hit = false;
    if (to >= 0) {
      me[to]++;
      if (opp[23 - to] === 1) { opp[23 - to] = 0; opp[24]++; hit = true; }
    }
    return { from, to, die: d, hit };
  }
  const diceList = (d0, d1) => d0 === d1 ? [d0, d0, d0, d0] : [d0, d1];
  const removeOne = (arr, v) => { const i = arr.indexOf(v); const c = arr.slice(); c.splice(i, 1); return c; };
  const distinct = (arr) => [...new Set(arr)];

  // Max number of dice playable from this state with the remaining dice.
  function maxUsable(me, opp, rem, memo) {
    if (!rem.length) return 0;
    const k = key(me, opp) + '#' + rem.slice().sort().join('');
    if (memo.has(k)) return memo.get(k);
    let best = 0;
    outer: for (const d of distinct(rem)) {
      for (let f = 24; f >= 0; f--) {
        if (subDest(me, opp, f, d) === null) continue;
        const m2 = me.slice(), o2 = opp.slice();
        applySub(m2, o2, f, d);
        const v = 1 + maxUsable(m2, o2, removeOne(rem, d), memo);
        if (v > best) best = v;
        if (best === rem.length) break outer;
      }
    }
    memo.set(k, best);
    return best;
  }

  // Turn analysis for a roll: computes the number of dice that must be played,
  // the larger-die rule, and all distinct final positions.
  function turnInfo(me, opp, d0, d1) {
    const dice = diceList(d0, d1);
    const memo = new Map();
    const maxTotal = maxUsable(me, opp, dice, memo);
    let forceDie = null;
    if (maxTotal === 1 && d0 !== d1) {
      const hi = Math.max(d0, d1);
      for (let f = 24; f >= 0; f--) if (subDest(me, opp, f, hi) !== null) { forceDie = hi; break; }
    }
    // collect distinct finals
    const finals = new Map(); // key -> sequence
    const seen = new Set();
    (function dfs(m, o, rem, seq) {
      if (seq.length === maxTotal) { const k = key(m, o); if (!finals.has(k)) finals.set(k, seq.slice()); return; }
      const sk = key(m, o) + '#' + rem.slice().sort().join('') + '#' + seq.length;
      if (seen.has(sk)) return; seen.add(sk);
      for (const d of distinct(rem)) {
        if (seq.length === 0 && forceDie && d !== forceDie) continue;
        for (let f = 24; f >= 0; f--) {
          if (subDest(m, o, f, d) === null) continue;
          const m2 = m.slice(), o2 = o.slice();
          const s = applySub(m2, o2, f, d);
          if (seq.length + 1 + maxUsable(m2, o2, removeOne(rem, d), memo) !== maxTotal) continue;
          seq.push(s); dfs(m2, o2, removeOne(rem, d), seq); seq.pop();
        }
      }
    })(me.slice(), opp.slice(), dice, []);
    return { dice, maxTotal, forceDie, finals, memo };
  }

  // Given the state after a partial move, is submove (from, d) legal as the next step?
  function stepLegal(ti, me, opp, rem, done, from, d) {
    if (!rem.includes(d)) return false;
    if (done === 0 && ti.forceDie && d !== ti.forceDie) return false;
    if (subDest(me, opp, from, d) === null) return false;
    const m2 = me.slice(), o2 = opp.slice();
    applySub(m2, o2, from, d);
    return done + 1 + maxUsable(m2, o2, removeOne(rem, d), ti.memo) === ti.maxTotal;
  }

  // All destinations for the checker at `from`, including multi-step moves of the same checker.
  // order: preferred die order (array of die values, first = preferred).
  function destinations(ti, me, opp, rem, done, from, order) {
    const res = new Map(); // dest -> path [{from,d}]
    const pref = distinct(order.filter(d => rem.includes(d)).concat(rem));
    (function walk(m, o, r, dn, f, path) {
      for (const d of pref) {
        if (!r.includes(d)) continue;
        if (!stepLegal(ti, m, o, r, dn, f, d)) continue;
        const m2 = m.slice(), o2 = o.slice();
        const s = applySub(m2, o2, f, d);
        const p2 = path.concat([{ from: f, d }]);
        const prev = res.get(s.to);
        if (!prev || prev.length > p2.length) res.set(s.to, p2);
        // bearing off: when several dice work, use the smallest so the larger stays free
        else if (s.to < 0 && prev.length === p2.length && p2.length === 1 && d < prev[0].d) res.set(s.to, p2);
        if (s.to >= 0 && !s.hit) walk(m2, o2, removeOne(r, d), dn + 1, s.to, p2);
        else if (s.to >= 0 && s.hit && p2.length < 4) walk(m2, o2, removeOne(r, d), dn + 1, s.to, p2);
      }
    })(me, opp, rem, done, from, []);
    return res;
  }

  // Convert a sequence of submoves to gnubg anMove (8 ints, -1 padded)
  function toGnubg(seq) {
    const a = [];
    for (const s of seq) a.push(s.from, s.to < 0 ? -1 : s.to);
    while (a.length < 8) a.push(-1);
    return a.slice(0, 8);
  }

  // Simulate gnubg move pairs on boards (copy), returning submoves with hit info
  function simulatePairs(me, opp, pairs) {
    const m = me.slice(), o = opp.slice(), subs = [];
    for (let i = 0; i < pairs.length; i += 2) {
      const from = pairs[i], to = pairs[i + 1];
      m[from]--;
      let hit = false;
      if (to >= 0) { m[to]++; if (o[23 - to] === 1) { o[23 - to] = 0; o[24]++; hit = true; } }
      subs.push({ from, to, hit, die: to < 0 ? null : from - to });
    }
    return { subs, me: m, opp: o };
  }

  // Standard notation, e.g. "13/9 24/21", "bar/22*", "6/off(2)", "13/7*/2"
  function notation(me, opp, pairs) {
    if (!pairs || !pairs.length) return 'No move';
    const { subs } = simulatePairs(me, opp, pairs);
    const name = (i) => i === 24 ? 'bar' : i < 0 ? 'off' : String(i + 1);
    // chain moves of the same checker
    let segs = subs.map(s => ({ pts: [s.from, s.to], hits: [false, s.hit] }));
    let merged = true;
    while (merged) {
      merged = false;
      for (let i = 0; i < segs.length && !merged; i++) {
        for (let j = 0; j < segs.length && !merged; j++) {
          if (i === j) continue;
          const a = segs[i], b = segs[j];
          const aEnd = a.pts[a.pts.length - 1];
          if (aEnd >= 0 && aEnd === b.pts[0]) {
            // only merge if no other segment ends at the same point (keeps it unambiguous)
            const others = segs.filter((s, k) => k !== i && s.pts[s.pts.length - 1] === aEnd).length;
            const starters = segs.filter((s, k) => k !== j && s.pts[0] === aEnd).length;
            if (others || starters) continue;
            segs[i] = { pts: a.pts.concat(b.pts.slice(1)), hits: a.hits.concat(b.hits.slice(1)) };
            segs.splice(j, 1);
            merged = true;
          }
        }
      }
    }
    const strs = segs.map(sg => {
      let out = name(sg.pts[0]);
      for (let k = 1; k < sg.pts.length; k++) {
        const isLast = k === sg.pts.length - 1;
        if (!isLast && !sg.hits[k]) continue; // skip silent intermediate points
        out += '/' + name(sg.pts[k]) + (sg.hits[k] ? '*' : '');
      }
      return { s: out, from: sg.pts[0] };
    });
    strs.sort((a, b) => b.from - a.from);
    const counts = new Map();
    for (const x of strs) counts.set(x.s, (counts.get(x.s) || 0) + 1);
    return [...counts.entries()].map(([s, c]) => c > 1 ? `${s}(${c})` : s).join(' ');
  }

  // Result of a finished game for the winner given loser's board
  function gameValue(loser) {
    if (off(loser) > 0) return 1;
    let bg = loser[24] > 0;
    for (let i = 18; i < 24; i++) if (loser[i]) bg = true;
    return bg ? 3 : 2;
  }

  return { startSide, sum, off, pips, key, canBearOff, subDest, applySub, diceList, removeOne, turnInfo, stepLegal, destinations, toGnubg, simulatePairs, notation, gameValue };
})();
if (typeof module !== 'undefined') module.exports = { R };
