/* ===================== UI ===================== */
const $ = (s, el = document) => el.querySelector(s);
const ICON = {
  menu: '<svg viewBox="0 0 24 24"><circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/></svg>',
  chart: '<svg viewBox="0 0 24 24"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>',
  plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
  flag: '<svg viewBox="0 0 24 24"><path d="M5 21V4M5 4h11l-2 4 2 4H5"/></svg>',
  gear: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z"/></svg>',
  back: '<svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"/></svg>',
  close: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  logo: '<svg viewBox="0 0 24 24" fill="none"><path d="M3 3.5h8L7 15z" fill="currentColor" opacity=".35"/><path d="M13 3.5h8l-4 11.5z" fill="currentColor" opacity=".35"/><circle cx="7" cy="18.5" r="3.6" fill="currentColor"/><circle cx="17" cy="18.5" r="3.6" stroke="currentColor" stroke-width="1.8"/></svg>'
};
// The board is always drawn the standard way (you move from top right round to bottom right).
// On tall screens it sits at the top with big controls underneath.
function isPortrait() {
  const st = document.querySelector('.stage');
  if (!st) return false;
  const r = st.getBoundingClientRect();
  return r.height > r.width * 1.05;
}
function boardRot() {
  document.getElementById('app').classList.toggle('portrait', isPortrait());
  return 0;
}
const dotStyle = (p) => `background:${(p === 0) === Settings.humanLight ? '#f2efe9' : '#1a1d21'}`;

const UI = (() => {
  let board;
  let toastT;

  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg; t.classList.add('show');
    clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 1700);
  }

  function update() {
    const M = Game.M;
    const sc = $('#score'), mi = $('#matchinfo');
    if (!M) { sc.innerHTML = ''; mi.textContent = ''; return; }
    const g = M.games[M.games.length - 1];
    const turn = M.cur ? M.cur.turn : -1;
    const len = M.matchTo ? `${M.matchTo}-pt` : 'Single';
    sc.innerHTML = `<div class="side${turn === 0 ? ' turn' : ''}"><span class="dot" style="${dotStyle(0)}"></span><span>You</span><span class="pts">${M.score[0]}</span></div>
      <span class="len">${len}</span>
      <div class="side${turn === 1 ? ' turn' : ''}"><span class="pts">${M.score[1]}</span><span>${esc(Game.oppName)}</span><span class="dot" style="${dotStyle(1)}"></span></div>`;
    const bits = [];
    bits.push(M.matchTo ? `${M.matchTo}-point match` : 'Single game');
    bits.push(`Game ${g ? g.no : 1}`);
    if (g && g.crawford) bits.push('Crawford');
    else if (!M.cubeOn) bits.push('No cube');
    if (M.opp === 'friend') bits.push('vs ' + Game.oppName + (Net.connected || M.over ? '' : ' (offline)'));
    else { bits.push(M.mode === 'tutor' ? 'Tutor' : 'Normal'); bits.push(LEVELS.find(l => l.v === M.level)?.name || ''); }
    mi.textContent = bits.join(' · ');
  }

  /* ---------- overlay helpers ---------- */
  function openCard(html, opts = {}) {
    closeCard();
    const s = document.createElement('div');
    s.className = 'scrim'; s.id = 'scrim';
    s.innerHTML = `<div class="card" role="dialog" aria-modal="true">${html}</div>`;
    if (opts.dismiss !== false) s.addEventListener('pointerdown', (e) => { if (e.target === s) closeCard(); });
    document.body.appendChild(s);
    const f = s.querySelector('[autofocus]') || s.querySelector('button');
    f && f.focus({ preventScroll: true });
    return s;
  }
  function closeCard() { const s = $('#scrim'); if (s) s.remove(); }

  function seg(id, options, val) {
    return `<div class="seg" id="${id}" role="group">${options.map(([v, l]) => `<button type="button" data-v="${v}" aria-pressed="${String(v) === String(val)}">${l}</button>`).join('')}</div>`;
  }
  function wireSeg(root, id, cb) {
    const el = root.querySelector('#' + id);
    el.addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      el.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
      cb(b.dataset.v);
    });
  }
  function toggle(id, label, note, checked) {
    return `<label class="toggle" for="${id}"><span class="t"><span>${label}</span>${note ? `<small>${note}</small>` : ''}</span>
      <span class="switch"><input type="checkbox" id="${id}" ${checked ? 'checked' : ''}><span></span></span></label>`;
  }

  /* ---------- setup ---------- */
  const setupState = Object.assign({ format: 'match', len: 5, cube: true, jacoby: false, mode: 'normal' }, Store.get('setup', {}));
  if (!setupState.v2) { setupState.len = 5; setupState.jacoby = false; setupState.v2 = true; } // 5-point matches are the default
  function engineLine() {
    const i = Engine.info;
    if (i) return `<span class="chip good">Engine ready</span>`;
    return `<span class="loading"><span class="spin"></span>Loading GNU Backgammon engine…</span>`;
  }
  function cubeNote(st) {
    if (st.format === 'single') return st.cube ? 'One game played for points: you can double and redouble. The game is worth 1, 2 or 3 points times the cube.' : 'One game, no cube: a win is worth 1, a gammon 2, a backgammon 3.';
    return st.cube ? 'Crawford rule applies automatically.' : 'No doubling: each game is worth 1, 2 or 3 points.';
  }
  function showSetup() {
    const saved = Store.get('current', null);
    const canResume = saved && !saved.over && saved.cur && (!Game.M || Game.M.id !== saved.id || Game.M.over);
    const hist = Store.get('history', []).slice(0, 4);
    const st = setupState;
    const html = `
      <h2>New match</h2>
      <div class="field"><span class="lab">Play against</span>${seg('sOpp', [['bot', 'The computer'], ['friend', 'A friend']], st.opp || 'bot')}</div>
      ${canResume ? `<button class="histitem" id="resume" type="button"><span class="grow"><span><b>Continue your match</b></span><span>${saved.matchTo ? saved.matchTo + '-point match' : 'Single game'} · You ${saved.score[0]} – ${saved.score[1]} ${esc(saved.opp === 'friend' ? (saved.oppName || 'Friend') : 'Bot')}</span></span><span class="chip plain">Resume</span></button>` : ''}
      <div class="field"><span class="lab">Format</span>${seg('sFormat', [['match', 'Match'], ['single', 'Single game']], st.format)}</div>
      <div class="field" id="lenField" ${st.format === 'single' ? 'hidden' : ''}><span class="lab">Match length</span>
        <div class="row"><div class="stepper"><button type="button" id="lenDn" aria-label="Shorter">−</button><output id="lenOut">${st.len} pts</output><button type="button" id="lenUp" aria-label="Longer">+</button></div></div></div>
      <div class="field">${toggle('sCube', 'Doubling cube', '', st.cube)}
        <small id="cubeNote" style="color:var(--muted);font-size:12.5px;margin-top:-4px">${cubeNote(st)}</small>
        <div id="jacWrap" ${st.format === 'single' && st.cube ? '' : 'hidden'}>${toggle('sJac', 'Jacoby rule', 'A gammon or backgammon only counts once the cube has been turned. Off: gammons always count.', st.jacoby)}</div></div>
      <div class="field botonly"><span class="lab">Mode</span>${seg('sMode', [['normal', 'Normal'], ['tutor', 'Tutor']], st.mode)}
        <small id="modeNote" style="color:var(--muted);font-size:13px;line-height:1.45">${st.mode === 'tutor' ? 'Tells you straight after any move or cube decision that isn’t best, and lets you reassess or see the right play.' : 'Play straight through. Full move-by-move analysis is ready after each game.'}</small></div>
      <div class="field botonly"><span class="lab">Opponent</span>
        <select class="sel" id="sLevel" aria-label="Opponent strength">${LEVELS.map(l => `<option value="${l.v}" ${Settings.level === l.v ? 'selected' : ''}>${l.name} · ${l.note}</option>`).join('')}</select></div>
      <div class="row botonly" style="justify-content:space-between"><div id="engLine">${engineLine()}</div><button class="btnx primary" id="startBtn" type="button" autofocus>Start ${st.format === 'single' ? 'game' : 'match'}</button></div>
      <div class="friendonly field" id="friendBox">
        <span class="lab">Your name</span>
        <input class="sel txt" id="fName" maxlength="20" placeholder="So your friend knows it’s you" value="${esc(Store.get('name', ''))}">
        <div class="row" style="justify-content:space-between;margin-top:6px"><small style="color:var(--muted);max-width:26ch">Make a code and send it to your friend. No tutor in friend games; analysis is ready after each game.</small><button class="btnx primary" id="fHost" type="button">Create game</button></div>
        <div class="hr" style="margin:6px 0"></div>
        <span class="lab">Have a code?</span>
        <div class="row"><input class="sel txt code" id="fCode" maxlength="6" placeholder="ABCDE" autocapitalize="characters" autocomplete="off" spellcheck="false"><button class="btnx" id="fJoin" type="button">Join game</button></div>
        <small id="fNote" style="color:var(--muted);line-height:1.45"></small>
      </div>
      ${hist.length ? `<div class="hr"></div><div class="field"><span class="lab">Recent</span><div class="list">${hist.map(h => histItem(h)).join('')}</div></div>` : ''}`;
    const s = openCard(html, { dismiss: !!(Game.M && !Game.M.over) });
    const card = s.querySelector('.card');
    const showOpp = () => {
      const fr = (st.opp || 'bot') === 'friend';
      card.querySelectorAll('.botonly').forEach(e => e.hidden = fr);
      card.querySelectorAll('.friendonly').forEach(e => e.hidden = !fr);
      if (fr) Net.available().then(r => { const n = $('#fNote'); if (n && !r) n.innerHTML = Net.kind === 'room' ? '<b>Not available in this view.</b> Inside Claude, friend play needs both of you signed in and invited to this page. The GitHub version works with just the link.' : '<b>Can’t reach the friend-play server.</b> Check your internet connection and try again.'; });
    };
    wireSeg(card, 'sOpp', (v) => { st.opp = v; Store.set('setup', st); showOpp(); });
    showOpp();
    const cfgNow = () => ({ matchTo: st.format === 'single' ? 0 : st.len, cubeOn: st.cube, jacoby: st.format === 'single' && st.cube && st.jacoby });
    const nameNow = () => { const n = ($('#fName').value || '').trim().slice(0, 20) || 'Friend'; Store.set('name', n); return n; };
    $('#fHost').onclick = () => { Store.set('setup', st); hostFriend(cfgNow(), nameNow()); };
    $('#fJoin').onclick = () => { const c = ($('#fCode').value || '').trim().toUpperCase(); if (c.length < 4) { $('#fNote').textContent = 'Enter the code your friend sent you.'; return; } joinFriend(c, nameNow()); };
    $('#fCode').onkeydown = (e) => { if (e.key === 'Enter') $('#fJoin').click(); };
    wireSeg(card, 'sFormat', (v) => { st.format = v; $('#lenField').hidden = v === 'single'; $('#jacWrap').hidden = !(v === 'single' && st.cube); $('#cubeNote').textContent = cubeNote(st); $('#startBtn').textContent = v === 'single' ? 'Start game' : 'Start match'; });
    wireSeg(card, 'sMode', (v) => { st.mode = v; $('#modeNote').textContent = v === 'tutor' ? 'Tells you straight after any move or cube decision that isn’t best, and lets you reassess or see the right play.' : 'Play straight through. Full move-by-move analysis is ready after each game.'; });
    const setLen = (n) => { st.len = Math.max(1, Math.min(25, n)); $('#lenOut').textContent = st.len + (st.len === 1 ? ' pt' : ' pts'); };
    $('#lenDn').onclick = () => setLen(st.len - (st.len > 3 ? 2 : 1));
    $('#lenUp').onclick = () => setLen(st.len + (st.len >= 3 ? 2 : 1));
    $('#sCube').onchange = (e) => { st.cube = e.target.checked; $('#jacWrap').hidden = !(st.format === 'single' && st.cube); $('#cubeNote').textContent = cubeNote(st); };
    $('#sJac').onchange = (e) => { st.jacoby = e.target.checked; };
    $('#sLevel').onchange = (e) => { Settings.level = +e.target.value; Store.set('settings', Settings); };
    $('#startBtn').onclick = () => {
      Sound.unlock();
      Store.set('setup', st);
      closeCard();
      if (Game.M && Game.M.opp === 'friend') Net.leave();
      Game.newMatch({ mode: st.mode, matchTo: st.format === 'single' ? 0 : st.len, cubeOn: st.cube, jacoby: st.format === 'single' && st.cube && st.jacoby, level: Settings.level });
    };
    if (canResume) $('#resume').onclick = () => { closeCard(); Game.resume(saved); };
    card.querySelectorAll('[data-hist]').forEach(b => b.onclick = () => { const h = Store.get('history', []).find(x => x.id === b.dataset.hist); if (h) { closeCard(); Review.open(h); } });
    if (!Engine.info) Engine.ready.then(() => { const e = $('#engLine'); if (e) e.innerHTML = engineLine(); }).catch(err => { const e = $('#engLine'); if (e) e.innerHTML = `<span class="chip blunder">Engine failed to load</span>`; });
  }
  /* ---------- friend games ---------- */
  // Plain-English reason for a friend-play failure, with the technical code for diagnosis
  function friendError(e) {
    const code = (e && (e.code || e.message)) || String(e);
    let why = 'Something went wrong connecting to the friend-play server.';
    if (/operation-not-allowed|admin-restricted/.test(code)) why = 'Anonymous sign-in isn’t switched on in Firebase (Authentication → Sign-in method → Anonymous).';
    else if (/permission.denied|PERMISSION_DENIED/i.test(code)) why = 'The database refused access. Check the Realtime Database rules were published.';
    else if (/load /.test(code)) why = 'Couldn’t load the friend-play code. Check your internet connection.';
    else if (/network/i.test(code)) why = 'No connection to the friend-play server. Check your internet connection.';
    else if (/timeout/i.test(code)) why = 'The database didn’t answer. It may not have been created yet, or its address is different.';
    else if (/unavailable/.test(code)) why = 'Friend play isn’t available in this view.';
    return why + ' (Details: ' + String(code).slice(0, 160) + ')';
  }
  async function hostFriend(cfg, name) {
    if (Game.M && Game.M.opp === 'friend') await Net.leave();
    const desc = `${cfg.matchTo ? cfg.matchTo + '-point match' : 'Single game'} · ${cfg.cubeOn ? 'with cube' : 'no cube'}${cfg.jacoby ? ' · Jacoby' : ''}`;
    let started = false;
    let st;
    try {
      st = await Net.host(cfg, name, {
        found: (p) => {
          if (started) return; started = true;
          closeCard();
          Game.newMatch({ mode: 'normal', matchTo: cfg.matchTo, cubeOn: cfg.cubeOn, jacoby: cfg.jacoby, level: Settings.level, opp: 'friend', net: Net.state, oppName: Net.oppName });
          toast(`${Net.oppName} joined`);
        }
      });
    } catch (e) {
      console.warn('host failed', e);
      openCard(`<h2>Couldn’t create the game</h2><p class="sub">${esc(friendError(e))}</p>
        <div class="row" style="justify-content:flex-end"><button class="btnx primary" id="feOk">OK</button></div>`);
      $('#feOk').onclick = () => { closeCard(); showSetup(); };
      return;
    }
    const s = openCard(`<h2>Your game code</h2><p class="sub">${esc(desc)}. Send this code to your friend; the match starts as soon as they join.</p>
      <div class="codebig num" id="codeBig">${st.code}</div>
      <div class="row" style="justify-content:space-between"><span class="loading"><span class="spin"></span>Waiting for your friend…</span>
        <span class="row"><button class="btnx" id="cCopy">Copy code</button><button class="btnx" id="cCancel">Cancel</button></span></div>`, { dismiss: false });
    $('#cCopy').onclick = async () => { try { await navigator.clipboard.writeText(st.code); toast('Code copied'); } catch (e) { const r = document.createRange(); r.selectNodeContents($('#codeBig')); const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r); } };
    $('#cCancel').onclick = async () => { started = true; await Net.leave(); closeCard(); showSetup(); };
  }
  async function joinFriend(code, name) {
    if (Game.M && Game.M.opp === 'friend') await Net.leave();
    let started = false;
    openCard(`<h2>Joining ${esc(code)}</h2><p class="sub">Looking for your friend’s game…</p>
      <div class="row" style="justify-content:space-between"><span class="loading"><span class="spin"></span>Connecting</span><button class="btnx" id="jCancel">Cancel</button></div>`, { dismiss: false });
    $('#jCancel').onclick = async () => { started = true; await Net.leave(); closeCard(); showSetup(); };
    try {
      await Net.join(code, name, {
        found: (p) => {
          if (started || !p.cfg) return; started = true;
          const c = p.cfg;
          closeCard();
          Game.newMatch({ mode: 'normal', matchTo: c.matchTo | 0, cubeOn: !!c.cubeOn, jacoby: !!c.jacoby, level: Settings.level, opp: 'friend', net: Net.state, oppName: Net.oppName });
          toast(`Playing ${Net.oppName}`);
        }
      });
    } catch (e) {
      if (started) return;
      const sub = document.querySelector('#scrim .sub'), ld = document.querySelector('#scrim .loading');
      if (ld) ld.remove();
      if (sub) sub.textContent = e.message === 'nogame' ? 'No game with that code. Check the code with your friend.' : e.message === 'full' ? 'That game already has two players.' : friendError(e);
      return;
    }
    setTimeout(() => { if (!started && $('#jCancel')) { const sub = document.querySelector('#scrim .sub'); if (sub) sub.textContent = 'No game with that code yet. Check the code, or ask your friend to keep their game open.'; } }, 8000);
  }

  function histItem(h) {
    const won = h.winner === 0;
    const st = Game.stats(h.games, 0);
    const d = new Date(h.created);
    return `<button class="histitem" type="button" data-hist="${h.id}"><span class="grow"><span><b>${won ? 'Won' : 'Lost'}</b> ${h.score[0]}–${h.score[1]} · ${h.matchTo ? h.matchTo + '-pt' : 'single game'}${h.opp === 'friend' ? ' vs ' + esc(h.oppName || 'Friend') : ''}</span>
      <span>${d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} · ${h.opp === 'friend' ? 'Friend' : h.mode === 'tutor' ? 'Tutor' : 'Normal'}${st.prAll != null ? ` · PR ${st.prAll.toFixed(1)}` : ''}</span></span><span class="chip plain">Review</span></button>`;
  }

  /* ---------- menu ---------- */
  function showMenu(anchor) {
    closeMenu();
    const r = anchor.getBoundingClientRect();
    const m = document.createElement('div');
    m.className = 'menu'; m.id = 'menu'; m.setAttribute('role', 'menu');
    const live = Game.M && !Game.M.over && Game.phase !== 'over';
    m.innerHTML = `<button role="menuitem" data-a="new">${ICON.plus}New match</button>
      ${live ? `<button role="menuitem" data-a="resign">${ICON.flag}Resign…</button>` : ''}
      <div class="sep"></div>
      <button role="menuitem" data-a="settings">${ICON.gear}Settings</button>`;
    document.body.appendChild(m);
    const w = m.offsetWidth;
    m.style.top = (r.bottom + 6) + 'px';
    m.style.left = Math.max(8, Math.min(window.innerWidth - w - 8, r.right - w)) + 'px';
    m.querySelector('button').focus();
    m.addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      closeMenu();
      if (b.dataset.a === 'new') showSetup();
      if (b.dataset.a === 'resign') showResign();
      if (b.dataset.a === 'settings') showSettings();
    });
    setTimeout(() => document.addEventListener('pointerdown', outside), 0);
  }
  function outside(e) { const m = $('#menu'); if (m && !m.contains(e.target)) closeMenu(); }
  function closeMenu() { const m = $('#menu'); if (m) m.remove(); document.removeEventListener('pointerdown', outside); }

  function showResign() {
    const c = Game.M.cur;
    const cube = c ? c.cube.value : 1;
    const s = openCard(`<h2>Resign</h2><p class="sub">${Game.isFriend ? esc(Game.oppName) + ' can accept or decline.' : 'The bot accepts only if your offer is at least what it expects to win.'}</p>
      <div class="list">
        <button class="histitem" data-l="1"><span class="grow"><span><b>Single game</b></span><span>${1 * cube} point${cube > 1 ? 's' : ''}</span></span></button>
        <button class="histitem" data-l="2"><span class="grow"><span><b>Gammon</b></span><span>${2 * cube} points</span></span></button>
        <button class="histitem" data-l="3"><span class="grow"><span><b>Backgammon</b></span><span>${3 * cube} points</span></span></button>
      </div><div class="row" style="justify-content:flex-end"><button class="btnx" id="rsCancel">Keep playing</button></div>`);
    s.querySelectorAll('[data-l]').forEach(b => b.onclick = async () => {
      s.querySelectorAll('button').forEach(x => x.disabled = true);
      const ok = await Game.humanResign(+b.dataset.l);
      closeCard();
      if (ok === 'notnow') toast('You can resign on your own turn');
      else if (!ok) toast(`${Game.oppName} declines your resignation`);
    });
    $('#rsCancel').onclick = closeCard;
  }

  /* ---------- settings ---------- */
  function showSettings() {
    const S = Settings;
    const s = openCard(`<h2>Settings</h2>
      <div class="field"><span class="lab">Opponent</span><select class="sel" id="stLevel" aria-label="Opponent strength">${LEVELS.map(l => `<option value="${l.v}" ${S.level === l.v ? 'selected' : ''}>${l.name} · ${l.note}</option>`).join('')}</select></div>
      <div class="field"><span class="lab">Tutor flags</span>${seg('stTutor', [['any', 'Any move that isn’t best'], ['doubtful', 'Doubtful or worse']], S.tutorAny ? 'any' : 'doubtful')}</div>
      <div class="field"><span class="lab">Animation speed</span>${seg('stSpeed', [['fast', 'Fast'], ['normal', 'Normal'], ['slow', 'Slow']], S.speed)}</div>
      <div class="field"><span class="lab">Your checkers</span>${seg('stCol', [['1', 'Light'], ['0', 'Dark']], S.humanLight ? '1' : '0')}</div>
      <div class="field">
        ${toggle('stDice', 'Dice roll animation', 'A third of a second', S.diceAnim)}
        ${toggle('stForced', 'Auto-play forced moves', 'When only one move is possible', S.autoForced)}
        ${toggle('stRoll', 'Roll automatically', 'When you have no cube decision', S.autoRoll)}
        ${toggle('stPips', 'Pip counts', '', S.pips)}
        ${toggle('stSound', 'Sound', '', S.sound)}
      </div>
      <div class="row" style="justify-content:flex-end"><button class="btnx primary" id="stDone" autofocus>Done</button></div>`);
    const card = s.querySelector('.card');
    const apply = () => { Store.set('settings', Settings); Sound.on = Settings.sound; Game.redraw(); update(); };
    $('#stLevel').onchange = (e) => { S.level = +e.target.value; if (Game.M && !Game.M.over) Game.M.level = S.level; apply(); };
    wireSeg(card, 'stTutor', v => { S.tutorAny = v === 'any'; apply(); });
    wireSeg(card, 'stSpeed', v => { S.speed = v; apply(); });
    wireSeg(card, 'stCol', v => { S.humanLight = v === '1'; apply(); });
    $('#stDice').onchange = e => { S.diceAnim = e.target.checked; apply(); };
    $('#stForced').onchange = e => { S.autoForced = e.target.checked; apply(); };
    $('#stRoll').onchange = e => { S.autoRoll = e.target.checked; apply(); };
    $('#stPips').onchange = e => { S.pips = e.target.checked; apply(); };
    $('#stSound').onchange = e => { S.sound = e.target.checked; apply(); };
    $('#stDone').onclick = closeCard;
  }

  /* ---------- tutor banners ---------- */
  function banner(html) {
    const t = $('#tutor');
    t.innerHTML = html; t.hidden = false;
    return t;
  }
  function hideBanner() { const t = $('#tutor'); t.hidden = true; t.innerHTML = ''; }
  function chipFor(loss) { const b = band(loss); return `<span class="chip ${b}">${BAND_LABEL[b]}</span>`; }

  function tutorMove(rec) {
    return new Promise(res => {
      const me = rec.b[0], opp = rec.b[1];
      const mine = R.notation(me, opp, R.toGnubg(rec.subs).slice(0, rec.subs.length * 2));
      const best = R.notation(me, opp, rec.an.cands[0].m);
      const loss = rec.an.loss;
      const title = loss >= SKILL.doubtful ? `${BAND_LABEL[band(loss)]}: not the best move` : 'Not quite the best move';
      function first() {
        const t = banner(`<div class="thead">${chipFor(loss)}<span class="title">${title}</span><span class="chip plain num">${fmtLoss(loss)}</span></div>
          <div class="tmsg">You played <b class="num">${esc(mine)}</b>. Reassess to try again with the same roll.</div>
          <div class="actions"><button class="btnx primary" data-c="retry">Reassess</button><button class="btnx" data-c="show">Show best move</button><button class="btnx" data-c="keep">Continue</button></div>`);
        t.querySelector('[data-c]').focus();
        t.onclick = async (e) => {
          const b = e.target.closest('button'); if (!b) return;
          if (b.dataset.c === 'show') { t.querySelectorAll('button').forEach(x => x.disabled = true); await Game.previewBest(rec); second(); return; }
          hideBanner(); res(b.dataset.c);
        };
      }
      function second() {
        const t = banner(`<div class="thead">${chipFor(loss)}<span class="title">Best: <span class="num">${esc(best)}</span></span></div>
          <div class="tmsg"><b style="color:var(--good)">Green</b> arrows show the best move, <b style="color:#d9952a">amber</b> show yours (<span class="num">${esc(mine)}</span>, ${fmtLoss(loss)}).</div>
          <div class="actions"><button class="btnx accent" data-c="best">Play best move</button><button class="btnx" data-c="retry">Try again</button><button class="btnx" data-c="keep">Keep my move</button></div>`);
        t.querySelector('[data-c]').focus();
        t.onclick = (e) => { const b = e.target.closest('button'); if (!b) return; hideBanner(); res(b.dataset.c); };
      }
      first();
    });
  }

  function cubeNames(rec) {
    const a = rec.an;
    const rows = [['No double', a.nd], ['Double, take', a.dt], ['Double, pass', a.dp]];
    return rows.map(([n, v]) => `${n} <b class="num">${fmtEq(v)}</b>`).join(' · ');
  }
  function properAction(rec) {
    const a = rec.an;
    const dbl = Math.min(a.dt, a.dp) > a.nd;
    const take = a.dt <= a.dp;
    if (rec.k === 'take') return take ? 'take' : 'pass';
    if (!dbl) return a.dt > a.dp && a.dp > a.nd ? 'no double (too good)' : 'no double';
    return take ? 'double, take' : 'double, pass';
  }
  function tutorCube(rec, action) {
    return new Promise(res => {
      const loss = rec.loss;
      const titles = { nodouble: 'Missed double', double: 'Not a double', take: 'Wrong take', pass: 'Wrong pass' };
      const sw = { nodouble: 'Double instead', double: 'Roll instead', take: 'Pass instead', pass: 'Take instead' };
      const keep = { nodouble: 'Roll anyway', double: 'Double anyway', take: 'Take anyway', pass: 'Pass anyway' };
      let title = titles[action];
      if (action === 'nodouble' && properAction(rec).startsWith('no double')) title = 'Cube decision';
      const t = banner(`<div class="thead">${chipFor(loss)}<span class="title">${title}</span><span class="chip plain num">${fmtLoss(loss)}</span></div>
        <div class="tmsg">Right action: <b>${properAction(rec)}</b>. ${cubeNames(rec)}</div>
        <div class="actions"><button class="btnx primary" data-c="switch">${sw[action]}</button><button class="btnx" data-c="keep">${keep[action]}</button></div>`);
      t.querySelector('[data-c]').focus();
      t.onclick = (e) => { const b = e.target.closest('button'); if (!b) return; hideBanner(); res(b.dataset.c); };
    });
  }

  function botResigns(lvl, who) {
    return new Promise(res => {
      const names = ['', 'a single game', 'a gammon', 'a backgammon'];
      const s = openCard(`<h2>${esc(who || 'Bot')} resigns</h2><p class="sub">${esc(who || 'The bot')} offers to concede ${names[lvl]}.</p>
        <div class="row" style="justify-content:flex-end"><button class="btnx" id="brNo">Play on</button><button class="btnx primary" id="brYes" autofocus>Accept</button></div>`, { dismiss: false });
      $('#brYes').onclick = () => { closeCard(); res(true); };
      $('#brNo').onclick = () => { closeCard(); res(false); };
    });
  }

  /* ---------- game over ---------- */
  async function gameOver(g, M) {
    hideBanner();
    const won = g.result.winner === 0;
    const how = g.result.how;
    const pts = g.result.points;
    const matchOver = M.over;
    const kind = /passed/.test(how) ? 'pass' : /resigned/.test(how) ? 'resign' : how;
    const opp = Game.oppName;
    const who = won ? 'You' : opp;
    let title;
    if (matchOver && M.matchTo) title = won ? 'You win the match' : `${opp} wins the match`;
    else if (kind === 'pass') title = won ? `${opp} passes your double` : `You pass. ${opp} wins`;
    else if (kind === 'resign') title = won ? `${opp} resigns` : 'You resign';
    else title = `${who} win${won ? '' : 's'} ${how === 'single' ? 'the game' : 'a ' + how}`;
    const subtitle = `${who} +${pts} point${pts > 1 ? 's' : ''}${kind === 'resign' ? ' · ' + how : ''}${M.matchTo ? ` · Score ${M.score[0]}–${M.score[1]} (${M.matchTo}-point match)` : ''}`;
    const s = openCard(`<h2>${esc(title)}</h2><p class="sub">${esc(subtitle)}</p>
      <div id="goStats"><span class="loading"><span class="spin"></span>Finishing the analysis…</span></div>
      <div class="row" style="justify-content:flex-end">
        <button class="btnx" id="goReview">${matchOver && M.matchTo ? 'Review match' : 'Review game'}</button>
        <button class="btnx primary" id="goNext" autofocus>${matchOver ? 'New match' : 'Next game'}</button></div>`, { dismiss: false });
    $('#goReview').onclick = () => { closeCard(); Review.open(M, matchOver && M.matchTo ? 'all' : M.games.length - 1, true); };
    $('#goNext').onclick = () => { closeCard(); if (matchOver) showSetup(); else Game.nextGame(); };
    // finish pending analyses for this game
    for (const r of g.recs) await Game.ensureAnalysis(r);
    if (!M.over) Store.set('current', M);
    if (M.over) { const hist = Store.get('history', []); const i = hist.findIndex(h => h.id === M.id); const copy = clone(M); copy.cur = null; if (i >= 0) hist[i] = copy; Store.set('history', hist); }
    const el = $('#goStats'); if (!el) return;
    const scope = matchOver && M.matchTo ? M.games : [g];
    const a = Game.stats(scope, 0), b = Game.stats(scope, 1);
    const pr = (x) => x == null ? '–' : x.toFixed(1);
    el.innerHTML = `<div class="stats">
      ${[['You', a, 0], [Game.oppName, b, 1]].map(([n, st, p]) => `<div class="stat"><div class="who"><span class="dot" style="${dotStyle(p)}"></span>${n}</div>
        <div class="pr"><span class="big">${pr(st.prAll)}</span><span class="lbl">PR</span></div>
        <div class="rating">${prLabel(st.prAll) || 'No decisions'}</div>
        <div class="kv"><span>Checker</span><span>${pr(st.prChecker)}</span><span>Cube</span><span>${pr(st.prCube)}</span><span>Luck</span><span>${st.luckPts >= 0 ? '+' : '−'}${Math.abs(st.luckPts).toFixed(2)}</span></div></div>`).join('')}
    </div>`;
  }

  /* ---------- boot ---------- */
  function init() {
    $('#btnMenu').innerHTML = ICON.menu;
    $('#btnReview').innerHTML = ICON.chart + '<span class="lt">Review</span>';
    $('.brand').insertAdjacentHTML('afterbegin', ICON.logo);
    $('#btnMenu').onclick = (e) => showMenu(e.currentTarget);
    $('#btnReview').onclick = () => { if (Game.M && Game.M.opp === 'friend' && !Game.M.over && Game.phase !== 'over') { toast('Analysis opens when the game ends'); return; } if (Game.M) Review.open(Game.M, Game.M.games.length > 1 ? 'all' : 0); else { const h = Store.get('history', [])[0]; if (h) Review.open(h); else toast('Play a game first'); } };
    board = createBoard($('#board'), {
      canPick: (f) => Game.canPick(f),
      cantPick: () => { if (Game.phase === 'moving' && !Game.busy) toast('That checker can’t move'); },
      dests: (f) => Game.dests(f),
      tap: (f) => Game.tap(f),
      drop: (f, d) => Game.drop(f, d),
      button: (id) => Game.button(id),
      pips: () => Settings.pips ? Game.pips() : null,
      isPortrait: () => document.getElementById('app').classList.contains('portrait'),
      htmlButtons: (btns) => { bar.btns = btns || []; renderBar(); },
      barDice: (st) => { bar.dice = st; renderBar(); },
      sound: (k) => Sound.play(k)
    });
    Sound.on = Settings.sound;
    Game.attach(board, { update, toast, tutorMove, tutorCube, botResigns, gameOver });
    document.addEventListener('keydown', (e) => {
      if ($('#scrim') || !$('#review').hidden || $('#menu')) { if (e.key === 'Escape') { closeMenu(); if (!$('#review').hidden) Review.close(); } return; }
      if (!$('#tutor').hidden) return;
      Game.key(e);
    });
    // initial board behind the setup card
    board.rebuild([R.startSide(), R.startSide()], { flip: Settings.flip, humanLight: Settings.humanLight, pips: Settings.pips, rot: boardRot() });
    board.drawCube({ on: true, value: 1, owner: -1 });
    update();
    // re-orient the board when the screen shape changes (e.g. phone rotation)
    let lastRot = board.rot, rt;
    const onResize = () => {
      clearTimeout(rt);
      rt = setTimeout(function retry() {
        const was = document.getElementById('app').classList.contains('portrait');
        const r = boardRot();
        const now = document.getElementById('app').classList.contains('portrait');
        renderBar();
        if (r === lastRot && was === now) return;
        if (Game.busy || (Game.M && ['opening', 'auto', 'botTurn', 'committing'].includes(Game.phase))) { rt = setTimeout(retry, 300); return; }
        lastRot = r;
        if (Game.M) Game.redraw();
        else { board.rebuild([R.startSide(), R.startSide()], { flip: Settings.flip, humanLight: Settings.humanLight, pips: Settings.pips, rot: r }); board.drawCube({ on: true, value: 1, owner: -1 }); }
      }, 150);
    };
    window.addEventListener('resize', onResize);
    if (window.ResizeObserver) new ResizeObserver(onResize).observe(document.querySelector('.boardbox'));
    const hot = window.claude && window.claude.hot;
    if (hot && hot.snapshot) hot.snapshot(() => ({ M: Game.M }));
    const start = (data) => {
      if (data && data.M && !data.M.over) Game.resume(data.M);
      else showSetup();
    };
    if (hot && hot.ready) hot.ready(start); else start(hot && hot.data || {});
  }
  /* ---------- portrait control bar: big buttons and dice under the board ---------- */
  const bar = { btns: [], dice: null };
  function miniDie(v, used) {
    const P = pipDots(v).map(([x, y]) => `<circle cx="${26 + x}" cy="${26 + y}" r="4.8" fill="currentColor"/>`).join('');
    return `<svg viewBox="0 0 52 52" width="46" height="46" style="opacity:${used ? .3 : 1}"><rect x="1" y="1" width="50" height="50" rx="10" fill="var(--surface-2)" stroke="var(--line)" stroke-width="2"/>${P}</svg>`;
  }
  function renderBar() {
    const el = $('#actbar');
    const portrait = document.getElementById('app').classList.contains('portrait');
    const btns = portrait ? bar.btns : [];
    const dice = portrait && bar.dice && !bar.dice.single && bar.dice.p === 0 ? bar.dice : null;
    if (!btns.length && !dice) { el.hidden = true; el.innerHTML = ''; return; }
    const btn = (b) => `<button type="button" class="btnx ${b.kind === 'primary' ? 'primary' : b.kind === 'accent' ? 'accent' : ''}" data-b="${b.id}" aria-label="${esc(b.aria || b.label)}">${esc(b.label)}</button>`;
    const left = btns.filter(b => b.id === 'double' || b.id === 'undo' || b.id === 'pass');
    const right = btns.filter(b => !left.includes(b));
    let mid = '';
    if (dice) {
      const ord = dice.vals.length === 4 ? [0, 1] : (dice.order || [0, 1]);
      const used = dice.vals.length === 4 ? [dice.used.filter(Boolean).length >= 4, false] : ord.map(i => dice.used[i]);
      mid = `<button type="button" class="dicebtn" data-b="dice" aria-label="Dice: tap to swap which is played first, or to confirm">${ord.map((i, k) => miniDie(dice.vals[i], used[k])).join('')}</button>`;
    }
    el.innerHTML = `<div class="side l">${left.map(btn).join('')}</div>${mid}<div class="side r">${right.map(btn).join('')}</div>`;
    el.hidden = false;
    el.onclick = (e) => { const x = e.target.closest('[data-b]'); if (x) Game.button(x.dataset.b); };
  }
  return { init, toast, update, showSetup, closeCard, renderBar };
})();
