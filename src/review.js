/* ===================== REVIEW ===================== */
// Layout: a slim header (back, which games, stats) and one row of filters (whose / which);
// the board; one "decision card" saying what happened, with big prev/next;
// then the other candidate moves. The full move list and the stats open as sheets
// (on big screens the move list is a permanent column).
const Review = (() => {
  let M = null, scope = 'all', filt = 'all', who = 'both', sel = null, rows = [], running = false, candSel = null, sheet = null;
  const deep = new Map();

  function games() { return scope === 'all' ? M.games : [M.games[scope]].filter(Boolean); }
  const pname = (p) => p === 0 ? 'You' : (M && M.oppName) || 'Bot';
  function absOwner(rec) { const o = rec.ctx.owner, pc = rec.k === 'move' ? rec.p : rec.doubler; return o === -1 ? -1 : o === 1 ? pc : 1 - pc; }
  function recPairs(rec) { return R.toGnubg(rec.subs || []).slice(0, (rec.subs || []).length * 2); }
  function luckWord(l) {
    if (l == null) return '';
    if (l >= 0.6) return '<span class="lk up">Joker</span>';
    if (l >= 0.3) return '<span class="lk up">Lucky</span>';
    if (l <= -0.6) return '<span class="lk down">Anti-joker</span>';
    if (l <= -0.3) return '<span class="lk down">Unlucky</span>';
    return '';
  }
  const isForced = (r) => r.k === 'move' && (r.forced || r.forcedNone || (r.an && r.an.total <= 1));
  function recBand(r) {
    if (r.k === 'move') { if (!r.an || isForced(r)) return null; return band(r.an.loss); }
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
  const whoOk = (r) => who === 'both' || r.p === (who === 'you' ? 0 : 1);
  function passes(row) {
    const r = row.r;
    if (!whoOk(r)) return false;
    if (filt === 'all') return true;
    return recBand(r) === filt;
  }
  function counts() {
    const c = { all: 0, good: 0, doubtful: 0, error: 0, blunder: 0 };
    for (const row of rows) {
      if (row.sep || !whoOk(row.r)) continue;
      c.all++;
      const b = recBand(row.r); if (b) c[b]++;
    }
    return c;
  }
  function visible() { return rows.map((row, i) => (!row.sep && passes(row)) ? i : -1).filter(i => i >= 0); }

  /* ---------- pieces ---------- */
  function headerHTML() {
    const scopes = [['all', M.matchTo ? 'Whole match' : 'Game']].concat(M.matchTo && M.games.length > 1 ? M.games.map((g, i) => [String(i), `Game ${g.no}`]) : []);
    const w = [['you', 'You'], ['both', 'Both'], ['bot', pname(1)]];
    const c = counts();
    const f = [['all', 'All'], ['good', 'Good'], ['doubtful', 'Doubtful'], ['error', 'Errors'], ['blunder', 'Blunders']];
    return `<header class="rvh">
        <button class="iconbtn" id="rvBack" type="button" aria-label="Back to the board">${ICON.back}</button>
        <h1>Review</h1>
        ${scopes.length > 1 ? `<select class="sel sm" id="rvScope" aria-label="Which games">${scopes.map(([v, l]) => `<option value="${v}" ${String(scope) === v ? 'selected' : ''}>${l}</option>`).join('')}</select>` : ''}
        <span id="rvProg"></span>
        <div class="spacer"></div>
        <div class="seg sm who" id="fWho" role="group" aria-label="Whose decisions">${w.map(([v, l]) => `<button type="button" data-v="${v}" aria-pressed="${who === v}">${esc(l)}</button>`).join('')}</div>
        <div class="bands" id="fBand" role="group" aria-label="Which decisions">${f.map(([v, l]) => `<button type="button" class="b-${v}" data-v="${v}" aria-pressed="${filt === v}"><span class="n">${c[v]}</span><span class="l">${l}</span></button>`).join('')}</div>
        <button class="iconbtn labelled" id="rvStatsBtn" type="button" aria-label="Match stats">${ICON.chart}<span class="lt">Stats</span></button>
    </header>`;
  }

  function boardSVG() {
    if (sel == null || !rows[sel] || rows[sel].sep) return '';
    const { r, g } = rows[sel];
    const st = { b: r.b, cubeOn: M.cubeOn && !g.crawford, cube: r.ctx.cube, owner: absOwner(r) };
    if (r.k === 'move') {
      st.dice = r.dice; st.diceP = r.p;
      const played = recPairs(r), alt = shownPairs(r);
      st.arrows = [{ p: r.p, pairs: played, color: 'amber' }];
      if (alt && !samePos(r, alt, played)) st.arrows.push({ p: r.p, pairs: alt, color: 'green' });
    }
    return staticBoardSVG(st, { flip: Settings.flip, humanLight: Settings.humanLight, label: r.k === 'move' ? 'Position before the move' : 'Position at the cube decision' });
  }
  function candsFor(r) { return deep.get(r) || (r.an ? r.an.cands : []); }
  function shownPairs(r) { const c = candsFor(r); if (!c.length) return null; return (candSel != null && c[candSel] ? c[candSel] : c[0]).m; }
  function posKey(r, pairs) { const x = R.simulatePairs(r.b[r.p], r.b[1 - r.p], pairs); return R.key(x.me, x.opp); }
  function samePos(r, a, b) { return posKey(r, a) === posKey(r, b); }

  // the decision card: what happened, how good it was, prev/next
  function cardHTML() {
    const vis = visible(), k = vis.indexOf(sel);
    const what = filt === 'all' ? 'decision' : BAND_LABEL[filt].toLowerCase() + (filt === 'good' ? ' move' : '');
    const nav = `<div class="rvnav">
        <button class="navbtn" id="navPrev" type="button" aria-label="Previous" ${k <= 0 ? 'disabled' : ''}>${ICON.back}<span>Prev</span></button>
        <button class="navpos" id="navList" type="button" aria-label="Show the list of moves">${vis.length ? `<b class="num">${k >= 0 ? k + 1 : '–'}</b> of <b class="num">${vis.length}</b>` : 'None'} <span>${what}${vis.length === 1 ? '' : 's'}</span></button>
        <button class="navbtn next" id="navNext" type="button" aria-label="Next" ${(k >= vis.length - 1 && k >= 0) || !vis.length ? 'disabled' : ''}><span>Next</span>${ICON.back}</button>
      </div>`;
    if (sel == null || !rows[sel] || rows[sel].sep) {
      return `<div class="dc-empty">${vis.length ? 'Pick a decision.' : `No ${filt === 'all' ? '' : BAND_LABEL[filt].toLowerCase() + ' '}decisions${who === 'both' ? '' : ' for ' + (who === 'you' ? 'you' : esc(pname(1)))}. Try another filter.`}</div>${nav}`;
    }
    const { r, g, n } = rows[sel];
    const b = recBand(r), loss = recLoss(r);
    const verdict = isForced(r) ? `<span class="verdict plain">${r.forcedNone ? 'No move' : 'Forced'}</span>`
      : b ? `<span class="verdict ${b}">${BAND_LABEL[b]}</span>${loss > 0.0005 ? `<span class="loss num">${fmtLoss(loss)}</span>` : ''}`
      : '<span class="spin" aria-label="Analysing"></span>';
    const title = r.k === 'move' ? `${esc(pname(r.p))} rolled <b class="num">${r.dice[0]}-${r.dice[1]}</b>`
      : r.k === 'cube' ? `${esc(pname(r.p))} ${r.action === 'double' ? `doubled to ${r.ctx.cube * 2}` : 'didn’t double'}`
      : `${esc(pname(r.p))} ${r.action === 'take' ? 'took' : 'passed'}`;
    let lines = '';
    if (r.k === 'move') {
      const me = r.b[r.p], opp = r.b[1 - r.p], played = recPairs(r), cands = candsFor(r);
      const best = cands.length ? cands[0].m : null;
      lines += `<div class="ln"><span class="k amber">Played</span><span class="num mv">${esc(r.forcedNone ? 'No legal move' : R.notation(me, opp, played))}</span></div>`;
      if (best && !samePos(r, best, played)) lines += `<div class="ln"><span class="k green">Best</span><span class="num mv">${esc(R.notation(me, opp, best))}</span></div>`;
      else if (best && !isForced(r)) lines += `<div class="ln"><span class="k green">Best</span><span class="muted">Same as played</span></div>`;
    } else if (r.an) {
      const a = r.an, dbl = Math.min(a.dt, a.dp);
      const proper = r.k === 'take' ? (a.dt <= a.dp ? 'Take' : 'Pass') : dbl <= a.nd ? (a.dt > a.dp && a.dp > a.nd ? 'Too good, pass' : 'No double') : (a.dt <= a.dp ? 'Double, take' : 'Double, pass');
      const mine = r.k === 'cube' ? (r.action === 'double' ? 'Double' : 'No double') : (r.action === 'take' ? 'Take' : 'Pass');
      lines += `<div class="ln"><span class="k amber">Chose</span><span>${mine}${r.tutorSwitched ? ' <small class="muted">(after tutor)</small>' : ''}</span></div>`;
      lines += `<div class="ln"><span class="k green">Proper</span><span>${proper}</span></div>`;
    }
    return `<div class="dc-top"><span class="pd" style="${dotStyle(r.p)}"></span><span class="who">${title}</span>${r.k === 'move' ? luckWord(r.luck) : ''}<span class="grow"></span>${verdict}</div>
      <div class="dc-sub">Game ${g.no} · ${r.k === 'move' ? 'move' : 'turn'} ${n}${g.crawford ? ' · Crawford' : ''}</div>
      <div class="dc-lines">${lines}</div>${nav}`;
  }

  // other candidates (or cube numbers)
  function moreHTML() {
    if (sel == null || !rows[sel] || rows[sel].sep) return '';
    const { r } = rows[sel];
    if (r.k === 'move') {
      if (r.forcedNone) return `<div class="more-h">No legal move with this roll.</div>`;
      const an = r.an, dp = deep.get(r), cands = candsFor(r);
      if (!an && !dp) return `<div class="loading pad"><span class="spin"></span>Analysing…</div>`;
      if (isForced(r)) return `<div class="more-h">Only one way to play this roll.</div>`;
      const me = r.b[r.p], opp = r.b[1 - r.p], top = cands[0] ? cands[0].eq : 0, pk = posKey(r, recPairs(r));
      const shown = candSel == null ? 0 : candSel;
      const list = cands.map((c, i) => {
        const played = posKey(r, c.m) === pk;
        return `<button type="button" class="cand${played ? ' played' : ''}${i === shown ? ' on' : ''}" data-c="${i}">
          <span class="rk num">${(c.i != null ? c.i : i) + 1}</span>
          <span class="cm"><span class="num mv">${esc(R.notation(me, opp, c.m))}${played ? '<span class="tag">played</span>' : ''}</span>
            <span class="wl num">Win ${(c.pr[0] * 100).toFixed(1)}% · gammon ${(c.pr[1] * 100).toFixed(1)}% · lose g ${(c.pr[3] * 100).toFixed(1)}%</span></span>
          <span class="eq num">${fmtEq(c.eq)}<small>${i === 0 ? 'best' : (c.eq - top).toFixed(3)}</small></span>
        </button>`;
      }).join('');
      const lvl = dp ? 'Grandmaster check' : (LEVELS.find(l => l.v === (r.alv || 5)) || LEVELS[1]).name;
      return `<div class="more-h"><span>Top moves</span><span class="muted">${lvl} · ${an ? an.total : '?'} legal${dp || (r.alv || 5) >= 7 ? '' : ` · <button class="linkbtn" id="deepBtn" type="button">Check deeper</button>`}</span></div>
        <div class="cands">${list}</div><div class="hint muted">Tap a move to draw it on the board in green.</div>`;
    }
    const a = r.an;
    if (!a) return `<div class="loading pad"><span class="spin"></span>Analysing…</div>`;
    const dbl = Math.min(a.dt, a.dp), bestRow = dbl > a.nd ? (a.dt <= a.dp ? 'dt' : 'dp') : 'nd';
    const row = (k, l, v) => `<div class="crow${bestRow === k ? ' best' : ''}"><span>${l}</span><span class="num">${fmtEq(v)}</span></div>`;
    return `<div class="more-h"><span>Cube equities</span><span class="muted">for ${r.doubler === 0 ? 'you' : esc(pname(1))} as doubler</span></div>
      <div class="cubebox">${row('nd', 'No double', a.nd)}${row('dt', 'Double, take', a.dt)}${row('dp', 'Double, pass', a.dp)}</div>
      <div class="hint muted">Doubler wins ${(a.pr[0] * 100).toFixed(1)}% (gammons ${(a.pr[1] * 100).toFixed(1)}%), loses a gammon ${(a.pr[3] * 100).toFixed(1)}%. Money-game units.</div>`;
  }

  function listHTML() {
    let s = '', any = false;
    rows.forEach((row, i) => {
      if (row.sep) {
        const res = row.g.result;
        s += `<div class="gamesep"><span>Game ${row.g.no}${row.g.crawford ? ' · Crawford' : ''}</span><span>${res ? `${esc(pname(res.winner))} +${res.points}` : 'In progress'}</span></div>`;
        return;
      }
      if (!passes(row)) return;
      any = true;
      const r = row.r, b = recBand(r), loss = recLoss(r);
      let mv;
      if (r.k === 'move') mv = r.forcedNone ? 'No move' : esc(R.notation(r.b[r.p], r.b[1 - r.p], recPairs(r)));
      else mv = r.k === 'cube' ? (r.action === 'double' ? `Doubles to ${r.ctx.cube * 2}` : 'No double') : (r.action === 'take' ? 'Takes' : 'Passes');
      const right = isForced(r) ? '<span class="muted sm">forced</span>'
        : b ? `<span class="loss num">${loss > 0.0005 ? fmtLoss(loss) : ''}</span><span class="bd ${b}" title="${BAND_LABEL[b]}"></span>` : '<span class="spin"></span>';
      s += `<button class="mrow" type="button" data-i="${i}" ${sel === i ? 'aria-current="true"' : ''}>
        <span class="no num">${row.n}</span><span class="pd" style="${dotStyle(r.p)}"></span><span class="dice num">${r.k === 'move' ? r.dice[0] + '' + r.dice[1] : ''}</span>
        <span class="mv${r.k === 'move' ? ' num' : ''}">${mv}</span><span class="right">${right}</span></button>`;
    });
    if (!any) s += `<div class="empty">Nothing matches these filters.</div>`;
    return s;
  }

  function statsHTML() {
    const gs = games();
    const a = Game.stats(gs, 0), b = Game.stats(gs, 1);
    const pr = (x) => x == null ? '–' : x.toFixed(1);
    const sgn = (x, d) => (x >= 0 ? '+' : '−') + Math.abs(x).toFixed(d);
    let result = '';
    const net = a.luckPts - b.luckPts;
    if (gs.length === 1 || !M.matchTo) {
      const g = gs[0];
      if (g && g.result) {
        const res = g.result.winner === 0 ? g.result.points : -g.result.points;
        result = `<div class="kv2"><span>Result</span><span class="num">${sgn(res, 2)} pts</span><span>Your net luck</span><span class="num">${sgn(net, 2)} pts</span><span>Luck-adjusted result</span><span class="num"><b>${sgn(res - net, 2)} pts</b></span></div>`;
      }
    } else {
      const netM = (a.luckMwc - b.luckMwc) * 100;
      const res = M.over ? (M.winner === 0 ? 100 : 0) : null;
      result = `<div class="kv2"><span>Your net luck</span><span class="num">${sgn(netM, 1)}% match chance</span>${res != null ? `<span>Luck-adjusted result</span><span class="num"><b>${(res - netM).toFixed(1)}%</b></span>` : ''}</div>`;
    }
    const col = (n, st, p) => `<div class="pcol"><div class="who"><span class="pd" style="${dotStyle(p)}"></span>${esc(n)}</div>
      <div class="big num">${pr(st.prAll)}</div><div class="lbl">${st.prAll != null ? prLabel(st.prAll) : st.pending ? 'Analysing…' : 'No decisions'}</div></div>`;
    const line = (l, x, y) => `<span class="num">${x}</span><span class="l">${l}</span><span class="num">${y}</span>`;
    return `<div class="prhead">${col('You', a, 0)}<div class="vs">PR</div>${col(pname(1), b, 1)}</div>
      <div class="cmp">
        ${line('Checker PR', pr(a.prChecker), pr(b.prChecker))}
        ${line('Cube PR', pr(a.prCube), pr(b.prCube))}
        ${line('Decisions', `${a.nChecker} + ${a.nCube}`, `${b.nChecker} + ${b.nCube}`)}
        ${line('Doubtful', a.cnt.doubtful + a.ccnt.doubtful, b.cnt.doubtful + b.ccnt.doubtful)}
        ${line('Errors', a.cnt.error + a.ccnt.error, b.cnt.error + b.ccnt.error)}
        ${line('Blunders', a.cnt.blunder + a.ccnt.blunder, b.cnt.blunder + b.ccnt.blunder)}
        ${line('Luck (pts)', sgn(a.luckPts, 2), sgn(b.luckPts, 2))}
        ${line('Dice', a.luckN ? luckLabel(a.luckPer) : '–', b.luckN ? luckLabel(b.luckPer) : '–')}
      </div>${result}
      <p class="muted small">PR is the average equity lost per decision × 500 (lower is better). Bands: doubtful 0.04, error 0.08, blunder 0.16.</p>`;
  }

  /* ---------- render ---------- */
  function render(keepScroll) {
    const el = $('#review');
    const keep = {};
    if (keepScroll) for (const id of ['rvList', 'rvMore', 'rvStatsBody']) { const x = $('#' + id); if (x) keep[id] = x.scrollTop; }
    el.innerHTML = `${headerHTML()}
      <div class="rv-main">
        <aside class="rvlist" id="rvListWrap" aria-label="All decisions">
          <div class="sheet-h"><b>Moves</b><button class="iconbtn" data-close type="button" aria-label="Close">${ICON.close}</button></div>
          <div class="sheet-b movelist" id="rvList">${listHTML()}</div>
        </aside>
        <section class="rvboard" id="rvBoard"><div class="mini" id="rvMini"></div></section>
        <section class="dcard" id="rvCard"></section>
        <section class="rvmore" id="rvMore"></section>
      </div>
      <aside class="rvstats" id="rvStatsWrap" aria-label="Stats">
        <div class="sheet-h"><b>Stats</b><button class="iconbtn" data-close type="button" aria-label="Close">${ICON.close}</button></div>
        <div class="sheet-b" id="rvStatsBody">${statsHTML()}</div>
      </aside>
      <div class="rvscrim" id="rvScrim"></div>`;
    el.dataset.sheet = sheet || '';
    fillDetail();
    for (const id in keep) { const x = $('#' + id); if (x) x.scrollTop = keep[id]; }
    wire();
    fit();
    if (!keepScroll) showSel();
    progress();
  }
  function fillDetail() {
    $('#rvMini').innerHTML = boardSVG();
    $('#rvCard').innerHTML = cardHTML();
    $('#rvMore').innerHTML = moreHTML();
    $('#review').querySelectorAll('.mrow').forEach(b => b.setAttribute('aria-current', String(+b.dataset.i === sel)));
    wireDetail();
  }
  // side-by-side layouts: the board column is exactly as wide as the board at full height
  function fit() {
    const main = $('#review .rv-main'), b = $('#rvBoard');
    if (!main || !b) return;
    main.style.setProperty('--bw', Math.max(220, Math.round((b.clientHeight - 8) * 974 / 732) + 8) + 'px');
  }
  function showSel() { const b = $(`#review .mrow[data-i="${sel}"]`); if (b) b.scrollIntoView({ block: 'nearest' }); }
  function openSheet(s) { sheet = s; $('#review').dataset.sheet = s || ''; if (s === 'list') showSel(); }
  function wire() {
    const el = $('#review');
    $('#rvBack').onclick = close;
    const sc = $('#rvScope');
    if (sc) sc.onchange = () => { scope = sc.value === 'all' ? 'all' : +sc.value; sel = null; candSel = null; buildRows(); ensureSel(); render(); };
    $('#fBand').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; filt = b.dataset.v; ensureSel(); render(); };
    $('#fWho').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; who = b.dataset.v; ensureSel(); render(); };
    $('#rvStatsBtn').onclick = () => openSheet(sheet === 'stats' ? null : 'stats');
    $('#rvScrim').onclick = () => openSheet(null);
    el.querySelectorAll('[data-close]').forEach(x => x.onclick = () => openSheet(null));
    $('#rvList').onclick = (e) => { const b = e.target.closest('.mrow'); if (!b) return; select(+b.dataset.i); if (sheet === 'list') openSheet(null); };
    // swipe the board left/right to step through
    const bd = $('#rvBoard');
    let sx = null, sy = 0;
    bd.onpointerdown = (e) => { sx = e.clientX; sy = e.clientY; };
    bd.onpointerup = (e) => { if (sx == null) return; const dx = e.clientX - sx, dy = e.clientY - sy; sx = null; if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) move(dx < 0 ? 1 : -1); };
  }
  function wireDetail() {
    const pv = $('#navPrev'), nx = $('#navNext'), nl = $('#navList');
    if (pv) pv.onclick = () => move(-1);
    if (nx) nx.onclick = () => move(1);
    if (nl) nl.onclick = () => openSheet('list');
    $('#review').querySelectorAll('.cand[data-c]').forEach(x => x.onclick = () => { candSel = +x.dataset.c || null; const st = $('#rvMore').scrollTop; fillDetail(); $('#rvMore').scrollTop = st; });
    const db = $('#deepBtn');
    if (db) db.onclick = async () => {
      const { r } = rows[sel];
      db.disabled = true; db.textContent = 'Checking…';
      try {
        const res = await Engine.call('moves', r.b[1 - r.p], r.b[r.p], r.dice[0], r.dice[1], r.ctx, 7, R.toGnubg(r.subs));
        deep.set(r, res.moves.slice(0, 10).map((m, i) => ({ m: m.move, eq: m.eq, pr: m.probs, ply: m.ply, i })));
      } catch (e) { UI.toast('Deeper check failed'); }
      candSel = null;
      if (rows[sel] && rows[sel].r === r) fillDetail();
    };
  }
  function ensureSel() {
    const vis = visible();
    if (!vis.includes(sel)) sel = vis.length ? vis[0] : null;
    candSel = null;
  }
  function select(i) { sel = i; candSel = null; fillDetail(); $('#rvMore').scrollTop = 0; }
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
    if (pe) pe.innerHTML = `<span class="loading" title="Analysing ${missing.length} decision${missing.length > 1 ? 's' : ''}"><span class="spin"></span><span class="num">${missing.length}</span></span>`;
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
      if (Game.M === M && !M.over) Store.set('current', M);
      else { const hist = Store.get('history', []); const i = hist.findIndex(h => h.id === M.id); if (i >= 0) { const c = clone(M); c.cur = null; hist[i] = c; Store.set('history', hist); } }
    })();
  }

  function onKey(e) {
    if ($('#review').hidden || (e.target.closest && e.target.closest('select'))) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight' || e.key === 'j') { e.preventDefault(); move(1); }
    if (e.key === 'ArrowUp' || e.key === 'ArrowLeft' || e.key === 'k') { e.preventDefault(); move(-1); }
  }
  document.addEventListener('keydown', onKey);
  let ro = null;

  function open(match, sc) {
    M = match;
    scope = sc == null ? 'all' : sc;
    if (!M.matchTo) scope = 'all';
    filt = 'all'; who = 'both'; sel = null; candSel = null; sheet = null;
    buildRows();
    // open on your first error (then your first doubtful move, then the first move)
    const find = (bands) => rows.findIndex(row => !row.sep && row.r.p === 0 && bands.includes(recBand(row.r)));
    let first = find(['error', 'blunder']);
    if (first < 0) first = find(['doubtful']);
    if (first < 0) first = rows.findIndex(row => !row.sep);
    sel = first >= 0 ? first : null;
    $('#review').hidden = false;
    render();
    if (!ro && window.ResizeObserver) { ro = new ResizeObserver(() => fit()); ro.observe($('#review')); }
  }
  // Escape: close an open sheet first, then the review
  function back() { if (sheet) openSheet(null); else close(); }
  function close() { $('#review').hidden = true; $('#review').innerHTML = ''; }
  return { open, close, back };
})();
