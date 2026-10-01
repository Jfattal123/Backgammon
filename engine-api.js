// Thin JS wrapper over the GNU Backgammon engine (WebAssembly or JS build).
// Boards are gnubg TanBoards for the player ON ROLL: opp[25], me[25],
// each indexed from its own ace point (0..23), 24 = bar.
// ctx: {matchTo, sOpp, sMe, cube, owner(-1 centred | 0 opponent | 1 player on roll), crawford, jacoby, cubeful}
function makeEngineAPI(M) {
  M._bg_init();
  const bBuf = M._bg_board_buf() >> 2, mBuf = M._bg_move_buf() >> 2;
  const fBuf = M._bg_outf_buf() >> 2, iBuf = M._bg_outi_buf() >> 2;
  const H32 = () => M.HEAP32, HF = () => M.HEAPF32;
  function setBoard(opp, me) {
    const h = H32();
    for (let i = 0; i < 25; i++) { h[bBuf + i] = opp[i]; h[bBuf + 25 + i] = me[i]; }
  }
  function args(x) {
    M._bg_set_cubeful(x.cubeful === false ? 0 : 1);
    return [x.matchTo | 0, x.sOpp | 0, x.sMe | 0, x.cube || 1, x.owner == null ? -1 : x.owner, x.crawford ? 1 : 0, x.jacoby ? 1 : 0];
  }
  function trimMove(mv) {
    const out = [];
    for (let k = 0; k < 8; k += 2) { if (mv[k] < 0) break; out.push(mv[k], mv[k + 1]); }
    return out;
  }
  return {
    hasTS: () => !!M._bg_has_ts(),
    // -> {moves:[{move:[from,to,...], eq, probs:[w,wg,wbg,lg,lbg,eqCubeless], ply}], played:index|-1}
    moves(opp, me, d0, d1, ctx, level, played) {
      setBoard(opp, me);
      const a = args(ctx);
      if (played) { const h = H32(); for (let i = 0; i < 8; i++) h[mBuf + i] = played[i] == null ? -1 : played[i]; }
      const n = M._bg_moves(d0, d1, ...a, level, played ? 1 : 0);
      const f = HF(), out = [];
      for (let i = 0; i < n; i++) {
        const o = fBuf + 16 * i, mv = [];
        for (let k = 0; k < 8; k++) mv.push(Math.round(f[o + k]));
        out.push({ move: trimMove(mv), eq: f[o + 8], probs: [f[o + 9], f[o + 10], f[o + 11], f[o + 12], f[o + 13], f[o + 14]], ply: f[o + 15] });
      }
      return { moves: out, played: played ? H32()[iBuf] : -1, total: H32()[iBuf + 1] };
    },
    cube(opp, me, ctx, level) {
      setBoard(opp, me);
      const cd = M._bg_cube(...args(ctx), level);
      const f = HF(), h = H32();
      return {
        cd, optimal: f[fBuf], nd: f[fBuf + 1], dt: f[fBuf + 2], dp: f[fBuf + 3],
        probs: [f[fBuf + 4], f[fBuf + 5], f[fBuf + 6], f[fBuf + 7], f[fBuf + 8], f[fBuf + 9]],
        close: !!h[iBuf + 1], available: !!h[iBuf + 2]
      };
    },
    evaluate(opp, me, ctx, level) {
      setBoard(opp, me);
      M._bg_eval(...args(ctx), level);
      const f = HF();
      return { probs: [0, 1, 2, 3, 4, 5].map(k => f[fBuf + k]), eq: f[fBuf + 6] };
    },
    luck(opp, me, d0, d1, ctx) {
      setBoard(opp, me);
      M._bg_luck(d0, d1, ...args(ctx));
      const f = HF();
      return { luck: f[fBuf], actual: f[fBuf + 1], mean: f[fBuf + 2] };
    },
    pointsEq(points, ctx) { return M._bg_points_eq(points, ...args(ctx)); },
    eq2mwc(eq, ctx) { const a = args(ctx); return M._bg_eq2mwc(eq, a[0], a[1], a[2], a[3], a[4], a[5]); }
  };
}
if (typeof module !== 'undefined') module.exports = { makeEngineAPI };
