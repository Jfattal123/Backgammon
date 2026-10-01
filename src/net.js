/* ===================== NET (play a friend) =====================
   Uses the page's live room. Each player publishes, in their presence, the last
   few actions they made (numbered); the other side applies any it hasn't seen.
   Each side rolls its own dice. Nothing is stored on a server: both players keep
   the match in their own browser and re-publish on reconnect. */
const Net = (() => {
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
    async leave() { try { if (unsub) unsub(); if (gr) await gr.leave(); } catch (e) { } gr = null; st = null; queue = []; waiters = []; },
    get state() { return st; },
    get connected() { return !!oppPeer; },
    get oppName() { return (st && st.oppName) || 'Friend'; }
  };
})();
