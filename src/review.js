/* ===================== REVIEW ===================== */
const Review = (() => {
  let M = null, scope = 'all', filt = 'all', who = 'both', sel = null, rows = [], running = false, candSel = null, tab = 'analysis';
  const deep = new Map();

  function games() { return scope === 'all' ? M.games : [M.games[scope]].filter(Boolean); }
  const pname = (p) => p === 0 ? 'You' : (M && M.oppName) || 'Bot';
  function absOwner(rec) { const o = rec.ctx.owner, pc = rec.k === 'move' ? rec.p : rec.doubler; return o === -1 ? -1 : o === 1 ? pc : 1 - pc; }
  function recPairs(rec) { return R.toGnubg(rec.subs || []).slice(0, (rec.subs || []).length * 2); }
  function luckTag(l) {
    if (l == null) return '';
    if (l >= 0.6) return '<span class="lk up" title="Very lucky roll">Joker</span>';
    if (l >= 0.3) return '<span class="lk up" title="Lucky roll">Lucky</span>';
    if (l <= -0.6) return '<span class="lk down" title="Very unlucky roll">Anti-joker</span>';
    if (l <= -0.3) return '<span class="lk down" title="Unlucky roll">Unlucky</span>';
    return '';
  }
  function recBand(r) {
    if (r.k === 'move') { if (!r.an || r.forced || r.forcedNone || r.an.total <= 1) return null; return band(r.an.loss); }
    if (!r.an) return null;
    return band(r.loss);
  }
  function recLoss(r) { return r.k === 'move' ? (r.an ? r.an.loss : null) : r.loss; }

  function buildRows() {
    rows = [];
    games().forEach((g) => {
      const gi = M.games.indexOf(g);
      rows.push({ sep: true, g, gi });
      let n = 0;
      for (const r of g.recs) {
        if (r.k === 'move') n++;
        if (r.k === 'cube' && r.action === 'nodouble' && !r.counted && !(r.loss > 0.0005)) continue;
        rows.push({ r, g, gi, n: Math.max(1, r.k === 'move' ? n : n + 1) });
      }
    });
  }
  function passes(row) {
    const r = row.r;
    if (who !== 'both' && r.p !== (who === 'you' ? 0 : 1)) return false;
    if (filt === 'all') return true;
    const b = recBand(r);
    if (!b) return false;
    return b === filt;
  }
  function counts() {
    const c = { all: 0, good: 0, doubtful: 0, error: 0, blunder: 0 };
    for (const row of rows) {
      if (row.sep) continue;
      const r = row.r;
      if (who !== 'both' && r.p !== (who === 'you' ? 0 : 1)) continue;
      c.all++;
      const b = recBand(r); if (b) c[b]++;
    }
    return c;
  }

  function rowHTML(row, idx) {
    const r = row.r;
    const b = recBand(r), loss = recLoss(r);
    let mv, cls = 'mv';
    if (r.k === 'move') mv = r.forcedNone ? 'Cannot move' : esc(R.notation(r.b[r.p], r.b[1 - r.p], recPairs(r)));
    else {
      cls = 'mv cube';
      const cube = r.ctx.cube;
      mv = r.k === 'cube' ? (r.action === 'double' ? `Doubles to ${cube * 2}` : 'No double') : (r.action === 'take' ? 'Takes' : 'Passes');
    }
    const dice = r.k === 'move' ? `${r.dice[0]}${r.dice[1]}` : '';
    const right = (r.k === 'move' && (r.forced || r.forcedNone || (r.an && r.an.total <= 1))) ? `<span class="chip plain">Forced</span>`
      : b ? `<span class="chip ${b}">${BAND_LABEL[b]}</span><span class="loss">${b === 'good' && loss < 0.0005 ? '' : fmtLoss(loss)}</span>` : `<span class="spin" aria-label="Analysing"></span>`;
    return `<button class="mrow" type="button" data-i="${idx}" ${sel === idx ? 'aria-current="true"' : ''}>
      <span class="no">${row.n}</span><span class="pd" style="${dotStyle(r.p)}" title="${pname(r.p)}"></span><span class="dice">${dice}</span>
      <span class="${cls}">${mv}</span><span class="right">${r.k === 'move' ? luckTag(r.luck) : ''}${right}</span></button>`;
  }

  function statsHTML() {
    const gs = games();
    const a = Game.stats(gs, 0), b = Game.stats(gs, 1);
    const pr = (x) => x == null ? '–' : x.toFixed(1);
    // result + luck adjusted
    let resultLine = '';
    const single = gs.length === 1;
    const net = a.luckPts - b.luckPts;
    if (single || !M.matchTo) {
      const g = gs[0];
      if (g && g.result) {
        const res = g.result.winner === 0 ? g.result.points : -g.result.points;
        resultLine = `<div class="kv" style="grid-column:1/-1"><span>Result</span><span>${res > 0 ? '+' : ''}${res.toFixed(2)} pts</span><span>Net luck (you)</span><span>${net >= 0 ? '+' : '−'}${Math.abs(net).toFixed(2)} pts</span><span>Luck-adjusted result</span><span>${(res - net) >= 0 ? '+' : '−'}${Math.abs(res - net).toFixed(2)} pts</span></div>`;
      }
    } else {
      const netM = (a.luckMwc - b.luckMwc) * 100;
      const res = M.over ? (M.winner === 0 ? 100 : 0) : null;
      resultLine = `<div class="kv" style="grid-column:1/-1"><span>Net luck (you)</span><span>${netM >= 0 ? '+' : '−'}${Math.abs(netM).toFixed(1)}% match winning chance</span>${res != null ? `<span>Luck-adjusted result</span><span>${(res - netM).toFixed(1)}%</span>` : ''}</div>`;
    }
    const one = (n, st, p) => `<div class="stat"><div class="who"><span class="dot" style="${dotStyle(p)}"></span>${n}</div>
      <div class="pr"><span class="big">${pr(st.prAll)}</span><span class="lbl">PR</span></div>
      <div class="rating">${st.prAll != null ? prLabel(st.prAll) : st.pending ? 'Analysing…' : 'No decisions yet'}</div>
      <div class="kv">
        <span>Checker PR</span><span>${pr(st.prChecker)}</span>
        <span>Cube PR</span><span>${pr(st.prCube)}</span>
        <span>Decisions</span><span>${st.nChecker} + ${st.nCube}</span>
        <span>Doubtful</span><span>${st.cnt.doubtful + st.ccnt.doubtful}</span>
        <span>Errors</span><span>${st.cnt.error + st.ccnt.error}</span>
        <span>Blunders</span><span>${st.cnt.blunder + st.ccnt.blunder}</span>
        <span>Luck</span><span>${st.luckPts >= 0 ? '+' : '−'}${Math.abs(st.luckPts).toFixed(2)}</span>
      </div><div class="rating" title="Average luck per roll">${st.luckN ? luckLabel(st.luckPer) : ''}</div></div>`;
    return `<div class="stats">${one('You', a, 0)}${one(pname(1), b, 1)}${resultLine ? `<div class="stat" style="grid-column:1/-1">${resultLine}</div>` : ''}</div>`;
  }

  function filtersHTML() {
    const c = counts();
    const f = [['all', 'All'], ['good', 'Good'], ['doubtful', 'Doubtful'], ['error', 'Errors'], ['blunder', 'Blunders']];
    return `<div class="bands" id="fBand" role="group" aria-label="Show">${f.map(([v, l]) => `<button type="button" class="b-${v}" data-v="${v}" aria-pressed="${filt === v}"><span class="l">${l}</span><span class="n">${c[v]}</span></button>`).join('')}</div>`;
  }
  function whoHTML() {
    const w = [['both', 'Both'], ['you', 'You'], ['bot', pname(1)]];
    return `<div class="seg sm" id="fWho" role="group" aria-label="Player">${w.map(([v, l]) => `<button type="button" data-v="${v}" aria-pressed="${who === v}">${esc(l)}</button>`).join('')}</div>`;
  }

  function listHTML() {
    let s = '', any = false;
    rows.forEach((row, i) => {
      if (row.sep) {
        if (scope === 'all' || true) {
          const res = row.g.result;
          s += `<div class="gamesep"><span>Game ${row.g.no}${row.g.crawford ? ' · Crawford' : ''}</span><span>${res ? `${pname(res.winner)} +${res.points}` : 'In progress'}</span></div>`;
        }
        return;
      }
      if (!passes(row)) return;
      any = true;
      s += rowHTML(row, i);
    });
    if (!any) s += `<div class="empty">No ${filt === 'all' ? '' : BAND_LABEL[filt].toLowerCase() + ' '}decisions here.</div>`;
    return s;
  }

  // board pane: nav strip (prev / what this decision is / next) above the position
  function boardHTML() {
    const vis = visible(), k = vis.indexOf(sel);
    const lbl = filt === 'all' ? 'decisions' : BAND_LABEL[filt].toLowerCase() + (filt === 'good' ? ' moves' : 's');
    const count = `${vis.length ? (k >= 0 ? k + 1 : '–') + ' of ' + vis.length : 'No'} ${lbl}${who !== 'both' ? ' · ' + (who === 'you' ? 'you' : esc(pname(1))) : ''}`;
    let l1 = '<span class="muted">Nothing selected</span>', board = '<div class="empty">Nothing to show with these filters.</div>';
    if (sel != null && rows[sel] && !rows[sel].sep) {
      const { r, g, n } = rows[sel];
      const loss = recLoss(r), b = recBand(r);
      const forced = r.k === 'move' && (r.forced || r.forcedNone || (r.an && r.an.total <= 1));
      const what = r.k === 'move' ? r.dice.join('-') : r.k === 'cube' ? 'Cube' : 'Take/pass';
      l1 = `<span class="pd" style="${dotStyle(r.p)}"></span><b>${esc(pname(r.p))}</b><span class="num">${what}</span>
        ${forced ? '<span class="chip plain">Forced</span>' : b ? `<span class="chip ${b}">${BAND_LABEL[b]}</span>${b === 'good' && loss < 0.0005 ? '' : `<span class="num muted">${fmtLoss(loss)}</span>`}` : '<span class="spin"></span>'}
        ${r.k === 'move' ? luckTag(r.luck) : ''}`;
      const st = { b: r.b, cubeOn: M.cubeOn && !g.crawford, cube: r.ctx.cube, owner: absOwner(r) };
      if (r.k === 'move') {
        st.dice = r.dice; st.diceP = r.p;
        const best = bestPairsFor(r);
        st.arrows = [{ p: r.p, pairs: recPairs(r), color: 'amber' }];
        if (best && !samePos(r, best, recPairs(r))) st.arrows.push({ p: r.p, pairs: best, color: 'green' });
      }
      board = staticBoardSVG(st, { flip: Settings.flip, humanLight: Settings.humanLight, label: r.k === 'move' ? 'Position before the move' : 'Position at the cube decision' });
      return [`<button class="navbtn" id="navPrev" type="button" aria-label="Previous" ${k <= 0 ? 'disabled' : ''}>${ICON.back}</button>
        <div class="info"><div class="l1">${l1}</div><div class="l2">${count} · Game ${g.no}, ${r.k === 'move' ? 'move' : 'turn'} ${n}</div></div>
        <button class="navbtn flipx" id="navNext" type="button" aria-label="Next" ${k >= vis.length - 1 ? 'disabled' : ''}>${ICON.back}</button>`,
        `<div class="mini">${board}</div>`];
    }
    return [`<button class="navbtn" id="navPrev" type="button" aria-label="Previous" disabled>${ICON.back}</button>
      <div class="info"><div class="l1">${l1}</div><div class="l2">${count}</div></div>
      <button class="navbtn flipx" id="navNext" type="button" aria-label="Next" ${vis.length ? '' : 'disabled'}>${ICON.back}</button>`, `<div class="mini">${board}</div>`];
  }
  function candsFor(r) { return deep.get(r) || (r.an ? r.an.cands : []); }
  function bestPairsFor(r) { const c = candsFor(r); if (!c.length) return null; return (candSel != null && c[candSel] ? c[candSel] : c[0]).m; }
  function posKey(r, pairs) { const x = R.simulatePairs(r.b[r.p], r.b[1 - r.p], pairs); return R.key(x.me, x.opp); }
  function samePos(r, a, b) { return posKey(r, a) === posKey(r, b); }

  // analysis pane: what was played vs best, the candidate list or the cube numbers
  function analysisHTML() {
    if (sel == null || !rows[sel] || rows[sel].sep) return `<div class="empty">Pick a decision from Moves, or change the filters at the top.</div>`;
    const { r } = rows[sel];
    if (r.k === 'move') {
      const played = recPairs(r), an = r.an, dp = deep.get(r), cands = candsFor(r);
      const me = r.b[r.p], opp = r.b[1 - r.p];
      const best = bestPairsFor(r);
      let s = `<div class="pb"><div><span class="k amber">Played</span><span class="num">${esc(r.forcedNone ? 'No legal move' : R.notation(me, opp, played))}</span></div>
        ${best && cands.length && !samePos(r, best, played) ? `<div><span class="k green">${candSel ? 'Selected' : 'Best'}</span><span class="num">${esc(R.notation(me, opp, best))}</span></div>` : best && cands.length ? '<div><span class="k green">Best</span><span class="muted">Same as played</span></div>' : ''}
        ${r.luck != null ? `<div><span class="k">Roll luck</span><span class="num">${fmtEq(r.luck)}</span></div>` : ''}</div>`;
      if (r.forcedNone) return s;
      if (!an && !dp) return s + `<div class="loading" style="padding:12px"><span class="spin"></span>Analysing…</div>`;
      const top = cands[0] ? cands[0].eq : 0;
      const playedKey = posKey(r, played);
      s += `<div class="tablewrap"><table class="ct"><thead><tr><th>#</th><th>Move</th><th class="n">Equity</th><th class="n">Diff</th><th class="n">Win</th><th class="n">W g</th><th class="n">L g</th><th class="n">Depth</th></tr></thead><tbody>
        ${cands.map((c, i) => {
          const isPlayed = posKey(r, c.m) === playedKey;
          return `<tr class="${isPlayed ? 'played' : ''} ${i === 0 ? 'best' : ''} ${candSel === i || (candSel == null && i === 0) ? 'sel' : ''}" data-c="${i}"><td>${(c.i != null ? c.i : i) + 1}</td><td class="num">${esc(R.notation(me, opp, c.m))}${isPlayed ? ' <span class="chip plain tiny">Played</span>' : ''}</td>
            <td class="n">${fmtEq(c.eq)}</td><td class="n">${i === 0 ? '' : (c.eq - top).toFixed(3)}</td>
            <td class="n">${(c.pr[0] * 100).toFixed(1)}</td><td class="n">${(c.pr[1] * 100).toFixed(1)}</td><td class="n">${(c.pr[3] * 100).toFixed(1)}</td><td class="n muted">${c.ply >= 0 ? c.ply + '-ply' : ''}</td></tr>`;
        }).join('')}</tbody></table></div>
        <div class="row" style="justify-content:space-between;padding:10px 4px 4px"><small class="muted">Tap a move to see it on the board · ${dp ? 'Grandmaster (3-ply) check' : (LEVELS.find(l => l.v === (r.alv || 5)) || LEVELS[1]).name + ' analysis'} · ${an ? an.total : '?'} legal moves</small>
        ${dp || (r.alv || 5) >= 7 ? '' : `<button class="btnx" id="deepBtn" type="button">Deeper check</button>`}</div>`;
      return s;
    }
    const a = r.an;
    if (!a) return `<div class="loading" style="padding:12px"><span class="spin"></span>Analysing…</div>`;
    const dbl = Math.min(a.dt, a.dp);
    const proper = (() => { if (dbl <= a.nd) return a.dt > a.dp && a.dp > a.nd ? 'Too good to double, pass' : (a.dt <= a.dp ? 'No double, take' : 'No double'); return a.dt <= a.dp ? 'Double, take' : 'Double, pass'; })();
    const mine = r.k === 'cube' ? (r.action === 'double' ? 'Double' : 'No double') : (r.action === 'take' ? 'Take' : 'Pass');
    const bestRow = dbl > a.nd ? (a.dt <= a.dp ? 'dt' : 'dp') : 'nd';
    return `<div class="cubegrid">
      <span class="muted">${esc(pname(r.p))} chose</span><span><b>${mine}</b>${r.tutorSwitched ? ' <small class="muted">(changed after tutor)</small>' : ''}</span>
      <span class="muted">Proper action</span><span><b>${proper}</b></span>
      <span class="muted">Equity lost</span><span class="n">${fmtLoss(r.loss)}</span>
      <span class="hr2"></span><span class="hr2"></span>
      <span class="${bestRow === 'nd' ? 'best' : ''}">No double</span><span class="n">${fmtEq(a.nd)}</span>
      <span class="${bestRow === 'dt' ? 'best' : ''}">Double, take</span><span class="n">${fmtEq(a.dt)}</span>
      <span class="${bestRow === 'dp' ? 'best' : ''}">Double, pass</span><span class="n">${fmtEq(a.dp)}</span>
      <span class="muted">Doubler wins</span><span class="n">${(a.pr[0] * 100).toFixed(1)}% · gammons ${(a.pr[1] * 100).toFixed(1)}%</span>
      <span class="muted">Doubler loses gammon</span><span class="n">${(a.pr[3] * 100).toFixed(1)}%</span>
    </div><small class="muted" style="padding:0 4px 8px;display:block">Equities are from ${r.doubler === 0 ? 'your' : esc(pname(1)) + '’s'} side as the player who could double, in normalised money-game units.</small>`;
  }

  function visible() { return rows.map((row, i) => (!row.sep && passes(row)) ? i : -1).filter(i => i >= 0); }
  function ensureSel() {
    const vis = visible();
    if (!vis.includes(sel)) sel = vis.length ? vis[0] : null;
    candSel = null;
  }
  const TABS = [['moves', 'Moves'], ['analysis', 'Analysis'], ['stats', 'Stats']];
  function render(keepScroll) {
    const el = $('#review');
    const keep = {};
    if (keepScroll) for (const id of ['rvMoves', 'rvAnalysis', 'rvStats']) { const x = $('#' + id); if (x) keep[id] = x.scrollTop; }
    const scopes = [['all', M.matchTo ? 'Whole match' : 'Game']].concat(M.matchTo ? M.games.map((g, i) => [String(i), `Game ${g.no}`]) : []);
    el.dataset.tab = tab;
    el.innerHTML = `<header class="rvh">
        <button class="iconbtn" id="rvBack" type="button" aria-label="Back to the board">${ICON.back}</button>
        <h1>Review</h1>
        ${scopes.length > 1 ? `<select class="sel sm" id="rvScope" aria-label="Which games">${scopes.map(([v, l]) => `<option value="${v}" ${String(scope) === v ? 'selected' : ''}>${l}</option>`).join('')}</select>` : ''}
        <span id="rvProg"></span>
        <div class="spacer"></div>
        ${whoHTML()}
        ${filtersHTML()}
      </header>
      <div class="rv-body">
        <div class="rvnav panel" id="rvNav"></div>
        <section class="rvboard panel" id="rvBoard"></section>
        <div class="tabs" role="tablist">${TABS.map(([v, l]) => `<button type="button" role="tab" data-t="${v}" aria-selected="${tab === v}">${l}</button>`).join('')}</div>
        <section class="pane panel" id="rvMoves"><div class="movelist" role="list">${listHTML()}</div></section>
        <section class="pane panel" id="rvAnalysis">${analysisHTML()}</section>
        <section class="pane panel" id="rvStats">${statsHTML()}</section>
      </div>`;
    fillBoard();
    for (const id in keep) $('#' + id).scrollTop = keep[id];
    wire();
    fit();
    if (!keepScroll) showSel();
    progress();
  }
  // in side-by-side layouts the board column is exactly as wide as the board at full height
  function fit() {
    const body = $('#review .rv-body'), b = $('#rvBoard');
    if (!body || !b) return;
    const h = b.clientHeight - 12;
    body.style.setProperty('--bw', Math.max(220, Math.round(h * 974 / 732) + 12) + 'px');
  }
  function showSel() {
    const b = $(`#review .mrow[data-i="${sel}"]`); if (b) b.scrollIntoView({ block: 'nearest' });
  }
  function fillBoard() { const [nav, bd] = boardHTML(); $('#rvNav').innerHTML = nav; $('#rvBoard').innerHTML = bd; }
  function renderDetail() {
    fillBoard();
    $('#rvAnalysis').innerHTML = analysisHTML();
    $('#review').querySelectorAll('.mrow').forEach(b => b.setAttribute('aria-current', String(+b.dataset.i === sel)));
    wireDetail();
  }
  function setTab(t) {
    tab = t; $('#review').dataset.tab = t;
    $('#review').querySelectorAll('.tabs [data-t]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.t === t)));
    if (t === 'moves') showSel();
  }
  function wire() {
    const el = $('#review');
    $('#rvBack').onclick = close;
    const sc = $('#rvScope');
    if (sc) sc.onchange = () => { scope = sc.value === 'all' ? 'all' : +sc.value; sel = null; candSel = null; buildRows(); ensureSel(); render(); };
    $('#fBand').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; filt = b.dataset.v; ensureSel(); render(); };
    $('#fWho').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; who = b.dataset.v; ensureSel(); render(); };
    el.querySelector('.tabs').onclick = (e) => { const b = e.target.closest('[data-t]'); if (b) setTab(b.dataset.t); };
    el.querySelector('.movelist').onclick = (e) => { const b = e.target.closest('.mrow'); if (!b) return; select(+b.dataset.i); };
    wireDetail();
  }
  function wireDetail() {
    const d = $('#review');
    const pv = $('#navPrev'), nx = $('#navNext');
    if (pv) pv.onclick = () => move(-1);
    if (nx) nx.onclick = () => move(1);
    d.querySelectorAll('tr[data-c]').forEach(tr => tr.onclick = () => { candSel = +tr.dataset.c || null; renderDetail(); });
    const db = $('#deepBtn');
    if (db) db.onclick = async () => {
      const { r } = rows[sel];
      db.disabled = true; db.innerHTML = '<span class="spin"></span>Checking…';
      try {
        const res = await Engine.call('moves', r.b[1 - r.p], r.b[r.p], r.dice[0], r.dice[1], r.ctx, 7, R.toGnubg(r.subs));
        deep.set(r, res.moves.slice(0, 10).map((m, i) => ({ m: m.move, eq: m.eq, pr: m.probs, ply: m.ply, i })));
      } catch (e) { UI.toast('Deeper check failed'); }
      candSel = null;
      if (rows[sel] && rows[sel].r === r) renderDetail();
    };
  }
  function select(i) { sel = i; candSel = null; renderDetail(); }
  function move(delta) {
    const vis = visible();
    if (!vis.length) return;
    let k = vis.indexOf(sel);
    k = k < 0 ? 0 : Math.max(0, Math.min(vis.length - 1, k + delta));
    select(vis[k]);
    showSel();
  }
  function progress() {
    const missing = [];
    for (const g of M.games) for (const r of g.recs) if ((r.k === 'move' && (!r.an || r.luck == null)) || ((r.k === 'cube' || r.k === 'take') && !r.an)) missing.push(r);
    const pe = $('#rvProg');
    if (!missing.length) { if (pe) pe.innerHTML = ''; return; }
    if (pe) pe.innerHTML = `<span class="loading" title="Analysing ${missing.length} decision${missing.length > 1 ? 's' : ''}"><span class="spin"></span><span class="num">${missing.length}</span><span class="lt">left</span></span>`;
    if (running) return;
    running = true;
    (async () => {
      let k = 0;
      for (const r of missing) {
        await Game.ensureAnalysis(r);
        k++;
        if (!$('#review') || $('#review').hidden) break;
        if (k % 6 === 0 || k === missing.length) render(true);
      }
      running = false;
      if (!$('#review').hidden) render(true);
      // persist
      if (Game.M === M && !M.over) Store.set('current', M);
      else { const hist = Store.get('history', []); const i = hist.findIndex(h => h.id === M.id); if (i >= 0) { const c = clone(M); c.cur = null; hist[i] = c; Store.set('history', hist); } }
    })();
  }

  function onKey(e) {
    if ($('#review').hidden) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight' || e.key === 'j') { e.preventDefault(); move(1); }
    if (e.key === 'ArrowUp' || e.key === 'ArrowLeft' || e.key === 'k') { e.preventDefault(); move(-1); }
  }
  document.addEventListener('keydown', onKey);
  let ro = null;

  function open(match, sc, fromGame) {
    M = match;
    scope = sc == null ? 'all' : sc;
    if (!M.matchTo) scope = 'all';
    filt = 'all'; who = 'both'; sel = null; candSel = null;
    buildRows();
    // open on your first error (then your first doubtful move, then the first move)
    const find = (bands) => rows.findIndex(row => !row.sep && row.r.p === 0 && bands.includes(recBand(row.r)));
    let first = find(['error', 'blunder']);
    if (first < 0) first = find(['doubtful']);
    if (first < 0) first = rows.findIndex(row => !row.sep);
    sel = first >= 0 ? first : null;
    tab = 'analysis';
    $('#review').hidden = false;
    render();
    if (!ro && window.ResizeObserver) { ro = new ResizeObserver(() => fit()); ro.observe($('#review')); }
  }
  function close() { $('#review').hidden = true; $('#review').innerHTML = ''; }
  return { open, close };
})();
