/* ===================== NET (play a friend) =====================
   Uses the page's live room. Each player publishes, in their presence, the last
   few actions they made (numbered); the other side applies any it hasn't seen.
   Each side rolls its own dice. Nothing is stored on a server: both players keep
   the match in their own browser and re-publish on reconnect. */
const RoomNet = (() => {
  let room = null, gr = null, unsub = null;
  let st = null;            // persisted net state (lives in M.net)
  let queue = [], waiters = [];
  let oppPeer = null, oppSeen = false, queued = 0;
  let hooks = {};
  const ALPHA = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

  async function available() {
    try {
      if (!window.claude || !window.claude.use) return null;
      if (!room) room = await window.claude.use('room');
      return room;
    } catch (e) { return null; }
  }
  const rname = (code) => 'bg-' + code.toLowerCase();
  function genCode() {
    const a = new Uint8Array(5); crypto.getRandomValues(a);
    return [...a].map(x => ALPHA[x % ALPHA.length]).join('');
  }
  function publish() {
    if (!gr || !st) return;
    gr.presence({ v: 1, code: st.code, role: st.role, name: st.name, cfg: st.cfg || null, log: st.out.slice(-30) }).catch(() => { });
  }
  function deliver() {
    while (waiters.length && queue.length) waiters.shift()(queue.shift());
  }
  function onPeers(ch) {
    if (!st) return;
    const opp = ch.peers.find(p => !p.isMe && p.presence && p.presence.code === st.code && p.presence.role && p.presence.role !== st.role);
    const had = !!oppPeer;
    oppPeer = opp || null;
    if (opp) {
      if (opp.presence.name) st.oppName = String(opp.presence.name).slice(0, 24);
      if (!oppSeen) { oppSeen = true; hooks.found && hooks.found(opp.presence); }
      else if (!had) hooks.status && hooks.status('back');
      // take any actions we haven't applied or queued yet, in order
      const log = Array.isArray(opp.presence.log) ? opp.presence.log : [];
      for (const a of log.slice().sort((x, y) => x.s - y.s)) if (a && a.s === queued + 1) { queue.push(a); queued = a.s; }
      deliver();
    } else if (had) hooks.status && hooks.status('gone');
  }
  async function enter(state, h) {
    st = state; hooks = h || {};
    queue = []; waiters = []; oppPeer = null; oppSeen = false; queued = st.inSeq;
    if (!(await available())) throw new Error('unavailable');
    if (gr) { try { await gr.leave(); } catch (e) { } gr = null; }
    gr = await room.join(rname(st.code));
    unsub = gr.onPeers(onPeers);
    publish();
  }
  return {
    available, genCode,
    // host a new game; cfg = {matchTo, cubeOn, jacoby}
    async host(cfg, name, h) { await enter({ code: genCode(), role: 'host', name, cfg, out: [], inSeq: 0, oppName: '' }, h); return st; },
    async join(code, name, h) { await enter({ code: code.toUpperCase().replace(/[^A-Z0-9]/g, ''), role: 'guest', name, cfg: null, out: [], inSeq: 0, oppName: '' }, h); return st; },
    async resume(state, h) { await enter(state, h); return st; },
    setHooks(h) { hooks = Object.assign(hooks, h); },
    send(action) { if (!st) return; action.s = st.out.length + 1; st.out.push(action); publish(); },
    // next action from the friend (in order)
    next() { return new Promise(res => { waiters.push(res); deliver(); }).then(a => { st.inSeq = a.s; return a; }); },
    cancelWaits() { waiters = []; },
    async leave() { try { if (unsub) unsub(); if (gr) await gr.leave(); } catch (e) { } gr = null; st = null; queue = []; waiters = []; },
    get state() { return st; },
    get connected() { return !!oppPeer; },
    get oppName() { return (st && st.oppName) || 'Friend'; },
    kind: 'room'
  };
})();

/* ---------- Firebase transport (used everywhere except inside claude.ai) ----------
   games/<CODE> = { cfg, created, host: {uid, name, online, log: {1: action, 2: ...}}, guest: {...} }
   Each player signs in anonymously; database rules only let a player write their own side. */
const FB_CONFIG = {
  apiKey: 'AIzaSyCtgG6XwUBsdahptNGjk4EEjZoN3GLQBWw',
  authDomain: 'backgammon-9ef1f.firebaseapp.com',
  databaseURL: 'https://backgammon-9ef1f-default-rtdb.europe-west1.firebasedatabase.app',
  projectId: 'backgammon-9ef1f',
  storageBucket: 'backgammon-9ef1f.firebasestorage.app',
  messagingSenderId: '1070142091943',
  appId: '1:1070142091943:web:92d1f694467f70514e6182'
};
const FbNet = (() => {
  let db = null, uid = null, st = null, hooks = {};
  let queue = [], waiters = [], queued = 0, oppSeen = false, oppOnline = false, offs = [];
  const buf = new Map();
  const ALPHA = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const genCode = () => { const a = new Uint8Array(5); crypto.getRandomValues(a); return [...a].map(x => ALPHA[x % ALPHA.length]).join(''); };
  const loadScript = (src) => new Promise((res, rej) => { const el = document.createElement('script'); el.src = src; el.onload = res; el.onerror = () => rej(new Error('load ' + src)); document.head.appendChild(el); });
  async function load(name) {
    try { await loadScript('vendor/' + name); } catch (e) { await loadScript('https://cdn.jsdelivr.net/npm/firebase@10.12.2/' + name); }
  }
  let initP = null;
  function init() {
    if (initP) return initP;
    initP = (async () => {
      if (!window.firebase || !window.firebase.database) {
        if (!window.firebase) await load('firebase-app-compat.js');
        await load('firebase-auth-compat.js');
        await load('firebase-database-compat.js');
      }
      if (!firebase.apps.length) firebase.initializeApp(FB_CONFIG);
      const auth = firebase.auth();
      if (!auth.currentUser) {
        await new Promise(res => { const u = auth.onAuthStateChanged(() => { u(); res(); }); });
        if (!auth.currentUser) await auth.signInAnonymously();
      }
      uid = auth.currentUser.uid;
      db = firebase.database();
      return db;
    })();
    initP.catch(() => { initP = null; });
    return initP;
  }
  const ref = (p) => db.ref('games/' + st.code + (p ? '/' + p : ''));
  const within = (pr, ms) => Promise.race([pr, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout: no answer from ' + FB_CONFIG.databaseURL)), ms))]);
  const other = () => st.role === 'host' ? 'guest' : 'host';
  function deliver() { while (waiters.length && queue.length) waiters.shift()(queue.shift()); }
  function watchOnline() {
    const mine = ref(st.role + '/online');
    const cref = db.ref('.info/connected');
    const h = cref.on('value', s => { if (s.val() && st) { mine.onDisconnect().set(false); mine.set(true); } });
    offs.push(() => cref.off('value', h));
  }
  function watch() {
    const nref = ref(other() + '/name');
    const h1 = nref.on('value', s => {
      const n = s.val();
      if (!n) return;
      st.oppName = String(n).slice(0, 24);
      if (!oppSeen) { oppSeen = true; hooks.found && hooks.found({ name: st.oppName, cfg: st.cfg }); }
      hooks.status && hooks.status('name');
    });
    const oref = ref(other() + '/online');
    const h2 = oref.on('value', s => {
      const on = !!s.val();
      if (on === oppOnline) return;
      oppOnline = on;
      if (oppSeen) hooks.status && hooks.status(on ? 'back' : 'gone');
    });
    const lref = ref(other() + '/log');
    const h3 = lref.on('child_added', s => {
      const a = s.val();
      if (!a || typeof a.s !== 'number' || a.s <= queued) return;
      buf.set(a.s, a);
      while (buf.has(queued + 1)) { queue.push(buf.get(queued + 1)); buf.delete(queued + 1); queued++; }
      deliver();
    });
    offs.push(() => nref.off('value', h1), () => oref.off('value', h2), () => lref.off('child_added', h3));
  }
  function reset(state, h) {
    offs.forEach(f => { try { f(); } catch (e) { } }); offs = [];
    st = state; hooks = h || {}; queue = []; waiters = []; buf.clear(); queued = st.inSeq || 0; oppSeen = false; oppOnline = false;
  }
  return {
    kind: 'firebase',
    genCode,
    async available() { try { await init(); return true; } catch (e) { console.warn('friend play unavailable', e); return null; } },
    async host(cfg, name, h) {
      await init();
      let code;
      for (let i = 0; i < 5; i++) {
        code = genCode();
        const r = await within(db.ref('games/' + code + '/created').once('value'), 12000);
        if (!r.exists()) break;
      }
      reset({ code, role: 'host', name, cfg, out: [], inSeq: 0, oppName: '', uid }, h);
      // update() checks each child against its own rule (a set() on the game node itself would be refused)
      await within(ref().update({ cfg, created: firebase.database.ServerValue.TIMESTAMP, host: { uid, name, online: true } }), 12000);
      watchOnline(); watch();
      return st;
    },
    async join(code, name, h) {
      await init();
      code = code.toUpperCase().replace(/[^A-Z0-9]/g, '');
      const snap = await within(db.ref('games/' + code).once('value'), 12000);
      const v = snap.val();
      if (!v || !v.host) throw new Error('nogame');
      if (v.guest && v.guest.uid && v.guest.uid !== uid) throw new Error('full');
      reset({ code, role: 'guest', name, cfg: v.cfg, out: [], inSeq: 0, oppName: String(v.host.name || 'Friend').slice(0, 24), uid }, h);
      await ref('guest').update({ uid, name, online: true });
      watchOnline(); watch();
      return st;
    },
    async resume(state, h) {
      await init();
      reset(state, h);
      oppSeen = true;
      watchOnline(); watch();
      return st;
    },
    setHooks(h) { hooks = Object.assign(hooks, h); },
    send(action) {
      if (!st) return;
      action.s = st.out.length + 1;
      st.out.push(action);
      ref(st.role + '/log/' + action.s).set(action).catch(e => console.warn('send failed', e));
    },
    next() { return new Promise(res => { waiters.push(res); deliver(); }).then(a => { st.inSeq = a.s; return a; }); },
    cancelWaits() { waiters = []; },
    async leave() {
      try { if (st && db) await ref(st.role + '/online').set(false); } catch (e) { }
      offs.forEach(f => { try { f(); } catch (e) { } }); offs = [];
      st = null; queue = []; waiters = [];
    },
    get state() { return st; },
    get connected() { return oppOnline; },
    get oppName() { return (st && st.oppName) || 'Friend'; }
  };
})();

// Inside claude.ai the page's live room is used; everywhere else (GitHub Pages, offline copy) Firebase.
const inClaude = () => !!(window.claude && window.claude.use);
const Net = {
  get impl() { return inClaude() ? RoomNet : FbNet; },
  get kind() { return this.impl.kind; },
  available() { return this.impl.available(); },
  genCode() { return this.impl.genCode(); },
  host(c, n, h) { return this.impl.host(c, n, h); },
  join(c, n, h) { return this.impl.join(c, n, h); },
  resume(s, h) { return this.impl.resume(s, h); },
  setHooks(h) { return this.impl.setHooks(h); },
  send(a) { return this.impl.send(a); },
  next() { return this.impl.next(); },
  cancelWaits() { return this.impl.cancelWaits(); },
  leave() { return this.impl.leave(); },
  get state() { return this.impl.state; },
  get connected() { return this.impl.connected; },
  get oppName() { return this.impl.oppName; }
};
