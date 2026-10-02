/* ===================== BOARD (SVG) ===================== */
// Board geometry. SLOTS = how many checkers a point shows before the stack squeezes up:
// 5 is the classic look; short landscape screens use fewer (bigger checkers), tall screens more.
const G = { F: 14, FV: 26, RAIL: 54, PW: 64, BAR: 58, TRAY: 66, CD: 58, MID: 100 };
// compact frame (phones held upright): thinner rails, bar and tray so the points and checkers get more of the width
G.setFrame = function (compact) {
  this.COMPACT = !!compact;
  // compact: edge-to-edge points, no side rail (cube and pips move to the bar and tray), checkers fill the point width
  Object.assign(this, compact ? { F: 0, RAIL: 0, BAR: 46, TRAY: 36, CD: 62, TIN: 28, SLAB: 24, BAROFF: 54 } : { F: 14, RAIL: 54, BAR: 58, TRAY: 66, CD: 58, TIN: 52, SLAB: 44, BAROFF: 46 });
  this.W = this.F + this.RAIL + 12 * this.PW + this.BAR + this.TRAY + this.F;
  this.FL = this.F + this.RAIL;                 // field left
  this.XR = this.FL + 6 * this.PW + this.BAR;   // right half start
  this.BARX = this.FL + 6 * this.PW + this.BAR / 2;
  this.TRAYX = this.XR + 6 * this.PW + this.TRAY / 2;
  this.RAILX = this.F + this.RAIL / 2;
};
G.setFrame(false);
G.midFor = (n) => n <= 4 ? 82 : 100;   // short boards get a slimmer middle strip
G.setSlots = function (n) {
  this.SLOTS = n; this.MID = this.midFor(n);
  this.PL = n * this.CD;             // point length
  this.FH = 2 * this.PL + this.MID;
  this.H = this.FV * 2 + this.FH;
  this.MIDY = this.FV + this.FH / 2;
};
G.heightFor = (n) => G.FV * 2 + 2 * n * G.CD + G.midFor(n);
G.setSlots(5);
// Pick the point length (checkers per point before stacks squeeze) for a w x h box.
// Big screens keep the classic 5 (or longer if there is spare height). Small screens trade a little
// checker size for natural proportions: 4 is fine, 3 only when there is no other way.
G.bestSlots = function (w, h, maxN = 10) {
  const px = (n) => this.CD * Math.min(w / this.W, h / this.heightFor(n));
  if (px(5) >= 40) { let best = 5; for (let n = 5; n <= maxN; n++) if (px(n) >= px(5) * 0.99) best = n; return best; }
  const pen = { 3: 0.62, 4: 0.84 };
  let best = 5, bs = -1;
  for (let n = 3; n <= maxN; n++) { const sc = px(n) * (pen[n] || 1); if (sc >= bs * 0.995) { if (sc > bs) bs = sc; best = n; } }
  return best;
};

const SVGNS = 'http://www.w3.org/2000/svg';
let ROT = 0; // 90 when the board is drawn rotated for portrait screens
const trT = (x, y) => ROT ? ` transform="rotate(90 ${x} ${y})"` : '';
const trG = () => ROT ? ' rotate(90)' : '';
// offset in screen terms (dx right, dy down) from a local point
const offs = (c, dx, dy = 0) => ROT ? { x: c.x - dy, y: c.y + dx } : { x: c.x + dx, y: c.y + dy };
const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// Geometry helpers. Locations: {t:'pt', i:0..23 (human index)}, {t:'bar', p}, {t:'off', p}
function geo(flip) {
  const mx = (x) => flip ? G.W - x : x;
  function ptX(i) {
    const n = i + 1;
    let x;
    if (n <= 6) x = G.XR + (6 - n) * G.PW + G.PW / 2;
    else if (n <= 12) x = G.FL + (12 - n) * G.PW + G.PW / 2;
    else if (n <= 18) x = G.FL + (n - 13) * G.PW + G.PW / 2;
    else x = G.XR + (n - 19) * G.PW + G.PW / 2;
    return mx(x);
  }
  const isTop = (i) => i >= 12;
  function stackPos(loc, k, count) {
    if (loc.t === 'pt') {
      const step = count <= G.SLOTS ? G.CD : (G.PL - G.CD) / (count - 1);
      const y = isTop(loc.i) ? G.FV + G.CD / 2 + k * step : G.H - G.FV - G.CD / 2 - k * step;
      return { x: ptX(loc.i), y };
    }
    if (loc.t === 'bar') {
      const step = count <= 3 ? G.CD * 0.92 : (G.CD * 2.6) / (count - 1);
      // human (p0) enters top -> sits in top half of bar; bot in bottom half
      const y = loc.p === 0 ? G.MIDY - G.BAROFF - k * step : G.MIDY + G.BAROFF + k * step;
      return { x: mx(G.BARX), y };
    }
    // off tray
    const ts = Math.min(15, (G.FH / 2 - 40) / 14);
    const y = loc.p === 0 ? G.H - G.FV - 12 - k * ts : G.FV + 12 + k * ts;
    return { x: mx(G.TRAYX), y };
  }
  const diceCenter = (p) => ({ x: mx(p === 0 ? G.XR + 3 * G.PW : G.FL + 3 * G.PW), y: G.MIDY });
  const halfCenter = diceCenter;
  function cubePos(owner, offeredTo) {
    if (offeredTo === 0 || offeredTo === 1) { const c = halfCenter(offeredTo); return { x: c.x, y: c.y }; }
    const y = owner === 0 ? G.H - G.FV - 34 : owner === 1 ? G.FV + 34 : G.MIDY;
    return { x: mx(G.COMPACT ? G.BARX : G.RAILX), y };
  }
  return { mx, ptX, isTop, stackPos, diceCenter, halfCenter, cubePos };
}

// location of a side's index in human space
function locOf(p, idx) {
  if (idx === 24) return { t: 'bar', p };
  if (idx < 0) return { t: 'off', p };
  return { t: 'pt', i: p === 0 ? idx : 23 - idx };
}
const locKey = (l) => l.t === 'pt' ? 'pt' + l.i : l.t + l.p;

function pipDots(v) {
  const d = 13;
  const P = { tl: [-d, -d], tr: [d, -d], ml: [-d, 0], mr: [d, 0], bl: [-d, d], br: [d, d], c: [0, 0] };
  const m = { 1: ['c'], 2: ['tr', 'bl'], 3: ['tr', 'c', 'bl'], 4: ['tl', 'tr', 'bl', 'br'], 5: ['tl', 'tr', 'c', 'bl', 'br'], 6: ['tl', 'tr', 'ml', 'mr', 'bl', 'br'] };
  return (m[v] || []).map(k => P[k]);
}

function checkerColors(p, humanLight) {
  const light = (p === 0) === humanLight;
  return light
    ? { fill: 'url(#gLight)', rim: 'var(--chk-light-rim)', ring: 'rgba(0,0,0,.10)', slab: '#e9e4da', slabRim: '#b9b3a8', text: '#1a1d21' }
    : { fill: 'url(#gDark)', rim: 'var(--chk-dark-rim)', ring: 'rgba(255,255,255,.08)', slab: '#2a2e33', slabRim: '#4a5058', text: '#f2efe9' };
}
function diceColors(p, humanLight) {
  const light = (p === 0) === humanLight;
  return light ? { face: '#f7f4ee', edge: '#c9c2b6', pip: '#1a1d21' } : { face: '#24282d', edge: '#3d434b', pip: '#f2efe9' };
}

// Static board base (frame, field, points, numbers, tray, rail)
function boardBaseSVG(flip, opts = {}) {
  const g = geo(flip);
  let s = '';
  s += `<defs>
    <radialGradient id="gLight" cx="38%" cy="32%" r="75%"><stop offset="0" stop-color="#ffffff"/><stop offset=".55" stop-color="#f1ede6"/><stop offset="1" stop-color="#d9d3c8"/></radialGradient>
    <radialGradient id="gDark" cx="38%" cy="32%" r="75%"><stop offset="0" stop-color="#4b5159"/><stop offset=".5" stop-color="#22262b"/><stop offset="1" stop-color="#121417"/></radialGradient>
    <linearGradient id="gField" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#25393f"/><stop offset=".5" stop-color="#20333a"/><stop offset="1" stop-color="#25393f"/></linearGradient>
    <linearGradient id="gPtAt" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#47767e"/><stop offset="1" stop-color="#355f67"/></linearGradient>
    <linearGradient id="gPtAb" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#47767e"/><stop offset="1" stop-color="#355f67"/></linearGradient>
    <linearGradient id="gPtBt" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d6c4a8"/><stop offset="1" stop-color="#b9a585"/></linearGradient>
    <linearGradient id="gPtBb" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#d6c4a8"/><stop offset="1" stop-color="#b9a585"/></linearGradient>
    <filter id="fShadow" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="2.5" stdDeviation="2.2" flood-color="#000" flood-opacity=".38"/></filter>
    <filter id="fLift" x="-40%" y="-40%" width="180%" height="180%"><feDropShadow dx="0" dy="10" stdDeviation="7" flood-color="#000" flood-opacity=".42"/></filter>
    <marker id="mArrow" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#f2b84b"/></marker>
    <marker id="mArrowG" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#5fd39b"/></marker>
  </defs>`;
  s += `<rect x="0" y="0" width="${G.W}" height="${G.H}" rx="${G.COMPACT ? 6 : 18}" fill="var(--frame)"/>`;
  // field halves
  const lx = g.mx(G.FL), rx = g.mx(G.XR);
  const hx = (x) => flip ? x - 6 * G.PW : x;
  s += `<rect x="${hx(lx)}" y="${G.FV}" width="${6 * G.PW}" height="${G.FH}" rx="6" fill="url(#gField)"/>`;
  s += `<rect x="${hx(rx)}" y="${G.FV}" width="${6 * G.PW}" height="${G.FH}" rx="6" fill="url(#gField)"/>`;
  // bar
  s += `<rect x="${g.mx(G.BARX) - G.BAR / 2 + 6}" y="${G.FV}" width="${G.BAR - 12}" height="${G.FH}" rx="6" fill="#1a292d"/>`;
  // tray
  const tx = g.mx(G.TRAYX) - G.TIN / 2;
  s += `<rect x="${tx}" y="${G.FV}" width="${G.TIN}" height="${G.FH / 2 - 8}" rx="6" fill="#132024"/>`;
  s += `<rect x="${tx}" y="${G.MIDY + 8}" width="${G.TIN}" height="${G.FH / 2 - 8}" rx="6" fill="#132024"/>`;
  // points
  for (let i = 0; i < 24; i++) {
    const x = g.ptX(i), top = g.isTop(i);
    const y0 = top ? G.FV : G.H - G.FV, y1 = top ? G.FV + G.PL - 8 : G.H - G.FV - G.PL + 8;
    const c = i % 2 === 0 ? (top ? 'url(#gPtAt)' : 'url(#gPtAb)') : (top ? 'url(#gPtBt)' : 'url(#gPtBb)');
    s += `<path d="M${x - G.PW / 2 + 3},${y0} L${x},${y1} L${x + G.PW / 2 - 3},${y0} Z" fill="${c}"/>`;
    if (opts.numbers !== false) {
      const ny = top ? G.FV - 8 : G.H - G.FV + 17;
      const ry = top ? G.FV / 2 : G.H - G.FV / 2;
      s += ROT ? `<text class="ptnum" x="${x}" y="${ry}" text-anchor="middle" dominant-baseline="central"${trT(x, ry)}>${i + 1}</text>`
        : `<text class="ptnum" x="${x}" y="${G.COMPACT ? (top ? G.FV - 6 : G.H - G.FV + 19) : ny}" text-anchor="middle"${G.COMPACT ? ' style="font-size:16px"' : ''}>${i + 1}</text>`;
    }
  }
  return s;
}

function checkerSVG(id, p, humanLight, x, y, inTray) {
  const c = checkerColors(p, humanLight);
  const r = G.CD / 2 - 1;
  return `<g class="chk${inTray ? ' tray' : ''}" data-id="${id}" data-p="${p}" transform="translate(${x},${y})">
    <g class="disc" ${inTray ? 'style="display:none"' : ''} filter="url(#fShadow)">
      <circle r="${r}" fill="${c.fill}" stroke="${c.rim}" stroke-width="1.5"/>
      <circle r="${r - 9}" fill="none" stroke="${c.ring}" stroke-width="2"/>
    </g>
    <rect class="slab" ${inTray ? '' : 'style="display:none"'} x="${-G.SLAB / 2}" y="-6" width="${G.SLAB}" height="12" rx="3" fill="${c.slab}" stroke="${c.slabRim}" stroke-width="1"/>
  </g>`;
}

function dieSVG(cx, cy, v, col, opts = {}) {
  const sz = opts.size || 52, r = 10;
  const op = opts.used ? .32 : 1;
  let s = `<g class="die" transform="translate(${cx},${cy})${opts.rot ? ` rotate(${opts.rot})` : ''}" opacity="${op}">`;
  s += `<rect x="${-sz / 2}" y="${-sz / 2}" width="${sz}" height="${sz}" rx="${r}" fill="${col.face}" stroke="${col.edge}" stroke-width="1.5" filter="url(#fShadow)"/>`;
  const k = sz / 52;
  for (const [dx, dy] of pipDots(v)) s += `<circle cx="${dx * k}" cy="${dy * k}" r="${4.6 * k}" fill="${col.pip}"/>`;
  s += `</g>`;
  return s;
}

function cubeSVG(x, y, value, size = 46) {
  const v = value || 64;
  const fs = v >= 100 ? 15 : v >= 10 ? 19 : 22;
  return `<g class="cube" transform="translate(${x},${y})">
    <rect x="${-size / 2}" y="${-size / 2}" width="${size}" height="${size}" rx="8" fill="#f4efe4" stroke="#c7bfae" stroke-width="1.5" filter="url(#fShadow)"/>
    <text y="${fs * 0.36}" text-anchor="middle" font-size="${fs}" font-weight="800" fill="#1a1d21" style="font-family:var(--font-num)">${v}</text>
  </g>`;
}

// Arrow path between two locations (for showing moves)
function arrowPath(g, fromLoc, toLoc, fromK, toK) {
  const a = g.stackPos(fromLoc, fromK, Math.max(fromK + 1, 1));
  const b = g.stackPos(toLoc, toK, Math.max(toK + 1, 1));
  const dx = b.x - a.x, dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len, ny = dx / len;
  const bend = Math.min(80, len * 0.22);
  const cx = (a.x + b.x) / 2 + nx * bend, cy = (a.y + b.y) / 2 + ny * bend;
  // shorten ends
  const sh = 20;
  const ax = a.x + (cx - a.x) / Math.hypot(cx - a.x, cy - a.y) * sh, ay = a.y + (cy - a.y) / Math.hypot(cx - a.x, cy - a.y) * sh;
  const bx = b.x + (cx - b.x) / Math.hypot(cx - b.x, cy - b.y) * sh, by = b.y + (cy - b.y) / Math.hypot(cx - b.x, cy - b.y) * sh;
  return `M${ax},${ay} Q${cx},${cy} ${bx},${by}`;
}

// Full static board snapshot as SVG string (review / previews).
// st: {b:[b0,b1], dice:[d0,d1]|null, diceP, cube, owner, arrows:[{p, pairs, color}] }
function staticBoardSVG(st, o) {
  const savedRot = ROT, savedSlots = G.SLOTS, savedFrame = G.COMPACT; ROT = 0; G.setFrame(false); G.setSlots(5);
  try { return staticBoardSVG0(st, o); } finally { ROT = savedRot; G.setFrame(savedFrame); G.setSlots(savedSlots); }
}
function staticBoardSVG0(st, o) {
  const flip = !!o.flip, humanLight = o.humanLight !== false;
  const g = geo(flip);
  let s = `<svg xmlns="${SVGNS}" viewBox="0 0 ${G.W} ${G.H}" role="img" aria-label="${esc(o.label || 'Board position')}">`;
  s += boardBaseSVG(flip, { numbers: true });
  let id = 0;
  const counts = {};
  for (let p = 0; p < 2; p++) {
    const b = st.b[p];
    for (let idx = 0; idx <= 24; idx++) {
      const loc = locOf(p, idx);
      for (let k = 0; k < b[idx]; k++) { const pt = g.stackPos(loc, k, b[idx]); s += checkerSVG(id++, p, humanLight, pt.x, pt.y, false); }
      if (b[idx] > 5 && loc.t === 'pt') {
        const pt = g.stackPos(loc, b[idx] - 1, b[idx]);
        s += `<text x="${pt.x}" y="${pt.y + 6}" text-anchor="middle" font-size="18" font-weight="800" fill="${checkerColors(p, humanLight).text}">${b[idx]}</text>`;
      }
    }
    const offN = R.off(b), offLoc = { t: 'off', p };
    for (let k = 0; k < offN; k++) { const pt = g.stackPos(offLoc, k, offN); s += checkerSVG(id++, p, humanLight, pt.x, pt.y, true); }
    counts[p] = R.pips(b);
  }
  if (st.dice) {
    const c = g.diceCenter(st.diceP), col = diceColors(st.diceP, humanLight);
    s += dieSVG(c.x - 33, c.y, st.dice[0], col) + dieSVG(c.x + 33, c.y, st.dice[1], col);
  }
  if (st.cubeOn) { const cp = g.cubePos(st.owner == null ? -1 : st.owner); s += cubeSVG(cp.x, cp.y, st.owner === -1 || st.owner == null ? (st.cube > 1 ? st.cube : 64) : st.cube); }
  // pip counts
  s += `<text x="${g.mx(G.RAILX)}" y="${G.H - G.FV - 70}" text-anchor="middle" font-size="13" fill="var(--board-text)" style="font-family:var(--font-num)">${counts[0]}</text>`;
  s += `<text x="${g.mx(G.RAILX)}" y="${G.FV + 78}" text-anchor="middle" font-size="13" fill="var(--board-text)" style="font-family:var(--font-num)">${counts[1]}</text>`;
  if (st.arrows) for (const ar of st.arrows) s += arrowsSVG(g, st.b, ar.p, ar.pairs, ar.color);
  s += `</svg>`;
  return s;
}

// Draws arrows for a move by player p (gnubg pairs in p's indexing) starting from boards bb
function arrowsSVG(g, bb, p, pairs, color) {
  if (!pairs || !pairs.length) return '';
  const me = bb[p].slice(), opp = bb[1 - p].slice();
  const col = color === 'green' ? '#5fd39b' : '#f2b84b';
  const mk = color === 'green' ? 'mArrowG' : 'mArrow';
  let s = '';
  for (let i = 0; i < pairs.length; i += 2) {
    const from = pairs[i], to = pairs[i + 1];
    const fl = locOf(p, from), tl = locOf(p, to);
    const fk = Math.max(0, me[from] - 1);
    me[from]--;
    let tk;
    if (to >= 0) { tk = me[to]; me[to]++; if (opp[23 - to] === 1) { opp[23 - to] = 0; opp[24]++; tk = 0; } }
    else tk = R.off(me) - 1 + 1;
    s += `<path d="${arrowPath(g, fl, tl, fk, Math.max(0, Math.min(tk, 4)))}" fill="none" stroke="${col}" stroke-width="5" stroke-linecap="round" marker-end="url(#${mk})" opacity=".95"/>`;
  }
  return s;
}

/* ---------- Interactive board ---------- */
function createBoard(svg, cb) {
  let flip = false, humanLight = true, showPips = true, rot = 0, slots = 5, compact = false;
  let g = geo(false);
  const stacks = new Map(); // locKey -> [ids]
  const where = new Map();  // id -> loc
  const els = new Map();    // id -> element
  const posOf = new Map();  // id -> {x,y}
  let layers = {};
  let speed = 1;
  let interactive = false;
  let drag = null;
  let dests = null; // Map dest -> path for current drag/selection
  let marked = new Set();
  let reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;


  let root = svg;
  function build() {
    ROT = rot;
    const eflip = rot ? !flip : flip;
    g = geo(eflip);
    svg.setAttribute('viewBox', rot ? `0 0 ${G.H} ${G.W}` : `0 0 ${G.W} ${G.H}`);
    svg.innerHTML = `<g id="root"${rot ? ` transform="matrix(0,-1,1,0,0,${G.W})"` : ''}>` + boardBaseSVG(eflip) +
      `<g id="lyHint"></g><g id="lyPips"></g><g id="lyChk"></g><g id="lyArrows"></g><g id="lyDice"></g><g id="lyCube"></g><g id="lyBtn"></g><g id="lyDrag"></g></g>`;
    root = svg.querySelector('#root');
    layers = { hint: svg.querySelector('#lyHint'), pips: svg.querySelector('#lyPips'), chk: svg.querySelector('#lyChk'), arrows: svg.querySelector('#lyArrows'), dice: svg.querySelector('#lyDice'), cube: svg.querySelector('#lyCube'), btn: svg.querySelector('#lyBtn'), drag: svg.querySelector('#lyDrag') };
  }

  function setPositions(b) {
    // assign checker ids to stacks for board pair b
    stacks.clear(); where.clear(); els.clear(); posOf.clear();
    let html = '';
    for (let p = 0; p < 2; p++) {
      let id = p * 15;
      const side = b[p];
      for (let idx = 0; idx <= 24; idx++) {
        const loc = locOf(p, idx), k = locKey(loc);
        for (let n = 0; n < side[idx]; n++) { push(k, id); where.set(id, loc); id++; }
      }
      const offLoc = { t: 'off', p };
      for (let n = 0; n < R.off(side); n++) { push(locKey(offLoc), id); where.set(id, offLoc); id++; }
    }
    for (let id = 0; id < 30; id++) {
      const loc = where.get(id), st = stacks.get(locKey(loc));
      const k = st.indexOf(id), pt = g.stackPos(loc, k, st.length);
      html += checkerSVG(id, id < 15 ? 0 : 1, humanLight, pt.x, pt.y, loc.t === 'off');
      posOf.set(id, pt);
    }
    layers.chk.innerHTML = html;
    layers.chk.querySelectorAll('.chk').forEach(el => els.set(+el.dataset.id, el));
    orderZ();
    updateCounts();
    marked.forEach(id => mark(id, true));
  }
  function push(k, id) { if (!stacks.has(k)) stacks.set(k, []); stacks.get(k).push(id); }

  function orderZ() {
    // draw stacks bottom-to-top so upper checkers overlap correctly
    for (const [, ids] of stacks) for (const id of ids) layers.chk.appendChild(els.get(id));
  }

  function layoutStack(k, loc, animate) {
    const ids = stacks.get(k) || [];
    const proms = [];
    ids.forEach((id, n) => {
      const pt = g.stackPos(loc, n, ids.length);
      const cur = posOf.get(id);
      if (!cur || Math.abs(cur.x - pt.x) > .5 || Math.abs(cur.y - pt.y) > .5) proms.push(animateTo(id, pt, animate ? 140 : 0));
    });
    return Promise.all(proms);
  }

  function updateCounts() {
    // stack count labels for tall stacks + pip counts
    let s = '';
    for (const [k, ids] of stacks) {
      if (!k.startsWith('pt') && !k.startsWith('bar')) continue;
      if (ids.length > (k.startsWith('bar') ? 3 : G.SLOTS)) {
        const top = ids[ids.length - 1], pt = posOf.get(top), p = top < 15 ? 0 : 1;
        s += `<text class="cnt" x="${pt.x}" y="${pt.y}" dominant-baseline="central" text-anchor="middle" font-size="18" font-weight="800" fill="${checkerColors(p, humanLight).text}" style="pointer-events:none;font-family:var(--font-num)"${trT(pt.x, pt.y)}>${ids.length}</text>`;
      }
    }
    layers.hint.querySelectorAll('.cnt').forEach(e => e.remove());
    // counts must render above checkers: put in arrows layer group "counts"
    let cg = svg.querySelector('#lyCounts');
    if (!cg) { cg = document.createElementNS(SVGNS, 'g'); cg.id = 'lyCounts'; layers.chk.after(cg); }
    // borne-off counts beside each tray stack
    for (let p = 0; p < 2; p++) {
      const ids = stacks.get('off' + p) || [];
      if (!ids.length) continue;
      const tp = g.stackPos({ t: 'off', p }, ids.length - 1, ids.length);
      const ty = p === 0 ? tp.y - 22 : tp.y + 22;
      s += `<text x="${tp.x}" y="${ty}" text-anchor="middle" dominant-baseline="central" font-size="13" font-weight="700" fill="var(--board-text)" style="pointer-events:none;font-family:var(--font-num)"${trT(tp.x, ty)}>${ids.length}</text>`;
    }
    cg.innerHTML = s;
    if (showPips && cb.pips) {
      const pp = cb.pips();
      const rx = g.mx(G.RAILX);
      const pipTxt = (y, v, lblDy) => ROT
        ? `<text x="${rx}" y="${y}" text-anchor="middle" dominant-baseline="central" font-size="13" font-weight="600" fill="var(--board-text)" style="font-family:var(--font-num)"${trT(rx, y)}>${v} <tspan font-size="9" opacity=".7" letter-spacing="1">PIPS</tspan></text>`
        : `<text x="${rx}" y="${y}" text-anchor="middle" font-size="13" font-weight="600" fill="var(--board-text)" style="font-family:var(--font-num)">${v}</text><text x="${rx}" y="${y + lblDy}" text-anchor="middle" font-size="9" letter-spacing="1" fill="var(--board-text)" opacity=".7">PIPS</text>`;
      if (G.COMPACT) {
        const tx = g.mx(G.TRAYX), t = (y, v) => `<text x="${tx}" y="${y}" text-anchor="middle" font-size="16" font-weight="600" fill="var(--board-text)" style="font-family:var(--font-num)">${v}</text>`;
        layers.pips.innerHTML = pp ? t(G.MIDY + 30, pp[0]) + t(G.MIDY - 18, pp[1]) : '';
      } else
      layers.pips.innerHTML = pp ? pipTxt(G.H - G.FV - 70, pp[0], -16) + pipTxt(G.FV + 78, pp[1], 16) : '';
    } else layers.pips.innerHTML = '';
  }

  const ease = (t) => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  function setXY(id, x, y, scale) {
    const el = els.get(id);
    el.setAttribute('transform', `translate(${x},${y})${scale && scale !== 1 ? ` scale(${scale})` : ''}`);
    posOf.set(id, { x, y });
  }
  function animateTo(id, pt, dur, lift, endScale) {
    const el = els.get(id);
    const from = posOf.get(id) || pt;
    dur = reduceMotion ? 0 : dur * speed;
    if (dur <= 0) { setXY(id, pt.x, pt.y); return Promise.resolve(); }
    if (lift) layers.drag.appendChild(el);
    const disc = el.querySelector('.disc');
    if (lift && disc) disc.setAttribute('filter', 'url(#fLift)');
    return new Promise(res => {
      const t0 = performance.now();
      function step(now) {
        const t = Math.min(1, (now - t0) / dur), e = ease(t);
        const x = from.x + (pt.x - from.x) * e, y = from.y + (pt.y - from.y) * e;
        let sc = lift ? 1 + 0.09 * Math.sin(Math.PI * t) : 1;
        if (endScale) sc *= 1 + (endScale - 1) * e;
        setXY(id, x, y, sc);
        if (t < 1) requestAnimationFrame(step);
        else {
          if (lift && disc) disc.setAttribute('filter', 'url(#fShadow)');
          res();
        }
      }
      requestAnimationFrame(step);
    });
  }

  function setTrayLook(id, inTray) {
    const el = els.get(id);
    if (inTray) { const r = el.querySelector('.mk'); if (r) r.remove(); }
    el.classList.toggle('tray', inTray);
    el.querySelector('.disc').style.display = inTray ? 'none' : '';
    el.querySelector('.slab').style.display = inTray ? '' : 'none';
  }

  // Move top checker of player p from index `from` to `to` (-1 off). hit handled if flagged.
  async function moveChecker(p, from, to, hit, opts = {}) {
    const fl = locOf(p, from), tl = locOf(p, to);
    const fk = locKey(fl), tk = locKey(tl);
    const fst = stacks.get(fk) || [];
    const id = fst.pop();
    if (id == null) return;
    const proms = [];
    let hitId = null;
    if (hit) {
      const tst = stacks.get(tk) || [];
      hitId = tst.pop();
      const bl = { t: 'bar', p: 1 - p };
      push(locKey(bl), hitId); where.set(hitId, bl);
    }
    push(tk, id); where.set(id, tl);
    const tst = stacks.get(tk);
    const target = g.stackPos(tl, tst.length - 1, tst.length);
    const dur = opts.dur != null ? opts.dur : 270;
    if (tl.t !== 'off') setTrayLook(id, false);
    cb.sound && cb.sound('move');
    // borne-off checkers shrink as they slide into the tray, then settle as a slab
    const main = animateTo(id, target, dur, true, tl.t === 'off' ? 0.55 : null).then(() => {
      if (tl.t === 'off') { setTrayLook(id, true); setXY(id, target.x, target.y); }
      cb.sound && cb.sound(tl.t === 'off' ? 'off' : 'place');
    });
    proms.push(main);
    if (hitId != null) {
      const bl = { t: 'bar', p: 1 - p };
      proms.push(new Promise(r => setTimeout(r, dur * speed * 0.55)).then(() => { cb.sound && cb.sound('hit'); return animateTo(hitId, g.stackPos(bl, stacks.get(locKey(bl)).length - 1, stacks.get(locKey(bl)).length), 300, true); }));
    }
    await Promise.all(proms);
    // relayout affected stacks (compression)
    await Promise.all([layoutStack(fk, fl, true), layoutStack(tk, tl, true), hitId != null ? layoutStack(locKey({ t: 'bar', p: 1 - p }), { t: 'bar', p: 1 - p }, true) : null]);
    orderZ();
    updateCounts();
    return id;
  }

  // Reverse of moveChecker (for undo)
  async function unmoveChecker(p, from, to, hit) {
    const fl = locOf(p, from), tl = locOf(p, to);
    const fk = locKey(fl), tk = locKey(tl);
    const id = (stacks.get(tk) || []).pop();
    if (id == null) return;
    push(fk, id); where.set(id, fl);
    setTrayLook(id, false);
    const fst = stacks.get(fk);
    const proms = [animateTo(id, g.stackPos(fl, fst.length - 1, fst.length), 200, true)];
    if (hit) {
      const bl = { t: 'bar', p: 1 - p }, bk = locKey(bl);
      const hid = stacks.get(bk).pop();
      push(tk, hid); where.set(hid, tl);
      const tst = stacks.get(tk);
      proms.push(animateTo(hid, g.stackPos(tl, tst.length - 1, tst.length), 220, true));
      proms.push(layoutStack(bk, bl, true));
    }
    cb.sound && cb.sound('place');
    await Promise.all(proms);
    await Promise.all([layoutStack(fk, fl, true), layoutStack(tk, tl, true)]);
    orderZ();
    updateCounts();
  }

  /* ---- dice ---- */
  let diceState = null; // {p, vals, used:[bool], order:[i,j]}
  function drawDice(st, dieRot) {
    diceState = st;
    if (cb.barDice && !dieRot) cb.barDice(st);
    if (!st) { layers.dice.innerHTML = ''; return; }
    const c = g.diceCenter(st.p), col = diceColors(st.p, humanLight);
    let s = '';
    const vals = st.vals;
    if (st.single) {
      // opening roll: one die each side
      for (const [pp, v] of st.single) {
        const cc = g.diceCenter(pp);
        s += dieSVG(cc.x, cc.y, v, diceColors(pp, humanLight), { rot: dieRot ? dieRot[pp] : 0 });
      }
      layers.dice.innerHTML = s; return;
    }
    if (vals.length === 4) {
      // doubles: show two dice, with small used markers
      const usedN = st.used.filter(Boolean).length;
      s += `<g class="btn" data-btn="dice" role="button" aria-label="Dice">`;
      const a = offs(c, -33), b2 = offs(c, 33);
      s += dieSVG(a.x, a.y, vals[0], col, { used: usedN >= 4, rot: dieRot ? dieRot[0] : 0 });
      s += dieSVG(b2.x, b2.y, vals[0], col, { rot: dieRot ? dieRot[1] : 0 });
      // markers under the dice showing how many moves are left
      for (let k = 0; k < 4; k++) { const q = offs(c, -27 + k * 18, 44); s += `<circle cx="${q.x}" cy="${q.y}" r="4.5" fill="${k < 4 - usedN ? '#f2b84b' : 'rgba(255,255,255,.18)'}"/>`; }
      s += `</g>`;
    } else {
      const ord = st.order || [0, 1];
      s += `<g class="btn" data-btn="dice" role="button" aria-label="Dice, tap to swap order">`;
      ord.forEach((vi, pos) => { const q = offs(c, pos === 0 ? -33 : 33); s += dieSVG(q.x, q.y, vals[vi], col, { used: st.used[vi], rot: dieRot ? dieRot[pos] : 0 }); });
      s += `</g>`;
    }
    layers.dice.innerHTML = s;
  }
  async function rollDice(st, dur) {
    dur = reduceMotion ? 0 : dur;
    cb.sound && cb.sound('dice');
    if (dur > 0) {
      const t0 = performance.now();
      await new Promise(res => {
        let last = 0;
        function step(now) {
          const t = (now - t0) / dur;
          if (t >= 1) return res();
          if (now - last > 55) {
            last = now;
            const fake = st.single
              ? { single: st.single.map(([pp]) => [pp, 1 + Math.floor(Math.random() * 6)]) }
              : { ...st, vals: st.vals.map(() => 1 + Math.floor(Math.random() * 6)) };
            const rr = (1 - t) * 40;
            const dr = st.single ? { 0: (Math.random() - .5) * rr, 1: (Math.random() - .5) * rr } : [(Math.random() - .5) * rr, (Math.random() - .5) * rr];
            if (fake.vals && fake.vals.length === 4) fake.vals = [fake.vals[0], fake.vals[0], fake.vals[0], fake.vals[0]];
            drawDice(fake, dr);
          }
          requestAnimationFrame(step);
        }
        requestAnimationFrame(step);
      });
    }
    drawDice(st);
  }

  /* ---- cube ---- */
  let cubeState = null;
  function drawCube(st, animate) {
    const prevPos = cubeState && cubeState.pos;
    cubeState = st;
    if (!st || !st.on) { layers.cube.innerHTML = ''; return; }
    const pos = g.cubePos(st.owner, st.offeredTo);
    const val = st.offeredTo != null ? st.value * 2 : (st.owner === -1 ? (st.value > 1 ? st.value : 64) : st.value);
    const size = st.offeredTo != null ? 64 : G.COMPACT ? 40 : 46;
    let html = cubeSVG(0, 0, val, size);
    let extra = '';
    if (st.canDouble && G.COMPACT) {
      html = `<rect x="${-size / 2 - 4}" y="${-size / 2 - 4}" width="${size + 8}" height="${size + 8}" rx="10" fill="none" stroke="#f2b84b" stroke-width="2.5"><animate attributeName="opacity" values="1;.45;1" dur="1.6s" repeatCount="indefinite"/></rect>` + html;
    } else if (st.canDouble) {
      // the cube itself is the Double button, with a small label beside it on the rail
      html = `<rect x="${-size / 2 - 5}" y="${-size / 2 - 5}" width="${size + 10}" height="${size + 10}" rx="12" fill="none" stroke="#f2b84b" stroke-width="2.5"><animate attributeName="opacity" values="1;.45;1" dur="1.6s" repeatCount="indefinite"/></rect>` + html;
      const q = ROT ? offs(pos, 64, 0) : offs(pos, 0, st.owner === 0 ? -48 : 48);
      extra = `<g class="btn" data-btn="double" role="button" tabindex="0" aria-label="Offer a double" transform="translate(${q.x},${q.y})${trG()}">
        <rect x="${-Math.min(26, G.RAIL / 2 + 4)}" y="-13" width="${Math.min(52, G.RAIL + 8)}" height="26" rx="13" fill="#f2b84b"/>
        <text y="4" text-anchor="middle" font-size="${G.COMPACT ? 8.5 : 10.5}" font-weight="800" letter-spacing=".3" fill="#16201d">DOUBLE</text></g>`;
    }
    layers.cube.innerHTML = `<g class="cubewrap${st.canDouble ? ' btn' : ''}" ${st.canDouble ? 'data-btn="double" role="button" aria-label="Offer a double"' : ''} transform="translate(${pos.x},${pos.y})${trG()}">${html}</g>${extra}`;
    if (animate && prevPos && !reduceMotion && (prevPos.x !== pos.x || prevPos.y !== pos.y)) {
      const w = layers.cube.querySelector('.cubewrap');
      const from = prevPos;
      const t0 = performance.now(), dur = 300 * speed;
      w.setAttribute('transform', `translate(${from.x},${from.y})${trG()}`);
      (function step(now) { const t = Math.min(1, (now - t0) / dur), e = ease(t); w.setAttribute('transform', `translate(${from.x + (pos.x - from.x) * e},${from.y + (pos.y - from.y) * e})${trG()}`); if (t < 1) requestAnimationFrame(step); })(t0);
    }
    cubeState.pos = pos;
  }

  /* ---- buttons ---- */
  // btns: [{id, label, kind:'primary'|'accent'|'ghost', side:0|1, slot:'left'|'right'|'center'|'l2'|'r2', w}]
  function drawButtons(btns) {
    let s = '';
    // portrait: large HTML buttons below the board instead of tiny in-board ones
    if (cb.htmlButtons) {
      cb.htmlButtons(btns || []);
      if (cb.isPortrait && cb.isPortrait()) { layers.btn.innerHTML = ''; return; }
    }
    // scale buttons up when the board is drawn small (phones in landscape)
    const bw = svg.getBoundingClientRect().width || G.W;
    const k = Math.min(1.45, Math.max(1, 0.62 / (bw / G.W)));
    for (const b of btns || []) {
      if (b.htmlOnly) continue;
      const c = g.halfCenter(b.side || 0);
      const w = (b.w || 112) * Math.min(k, 1.15), h = 46 * k;
      let dx = 0;
      if (b.slot === 'left') dx = -64; else if (b.slot === 'right') dx = 64;
      else if (b.slot === 'farleft') dx = -128; else if (b.slot === 'farright') dx = 128;
      const q = offs(c, dx, b.dy || 0), x = q.x, y = q.y;
      const fill = b.kind === 'accent' ? '#f2b84b' : b.kind === 'primary' ? '#f2efe9' : 'rgba(255,255,255,.10)';
      const tc = b.kind === 'ghost' ? '#e6ece9' : '#16201d';
      const stroke = b.kind === 'ghost' ? 'rgba(255,255,255,.22)' : 'none';
      s += `<g class="btn" data-btn="${b.id}" role="button" tabindex="0" aria-label="${esc(b.aria || b.label)}" transform="translate(${x},${y})${trG()}">
        <rect x="${-w / 2}" y="${-h / 2}" width="${w}" height="${h}" rx="${h / 2}" fill="${fill}" stroke="${stroke}" stroke-width="1.5" ${b.kind !== 'ghost' ? 'filter="url(#fShadow)"' : ''}/>
        ${b.icon ? `<g transform="translate(${-w / 2 + 22},0)" stroke="${tc}" fill="none" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">${b.icon}</g>` : ''}
        <text x="${b.icon ? 10 : 0}" y="${6 * k}" text-anchor="middle" font-size="${16 * k}" font-weight="700" fill="${tc}">${esc(b.label)}</text>
      </g>`;
    }
    layers.btn.innerHTML = s;
  }

  // status text in a half (e.g., thinking)
  function drawStatus(side, text) {
    let el = svg.querySelector('#lyStatus');
    if (!el) { el = document.createElementNS(SVGNS, 'g'); el.id = 'lyStatus'; layers.btn.before(el); }
    if (!text) { el.innerHTML = ''; return; }
    const c = g.halfCenter(side);
    el.innerHTML = `<g transform="translate(${c.x},${c.y})${trG()}"><rect x="-80" y="-18" width="160" height="36" rx="18" fill="rgba(0,0,0,.28)"/>
      <circle cx="-52" cy="0" r="4" fill="#f2b84b"><animate attributeName="opacity" values="1;.25;1" dur="1s" repeatCount="indefinite"/></circle>
      <text x="8" y="5" text-anchor="middle" font-size="14" font-weight="600" fill="#e6ece9">${esc(text)}</text></g>`;
  }

  /* ---- highlights ---- */
  function showDests(fromIdx, map) {
    dests = map;
    let s = '';
    if (map) for (const [d] of map) {
      const loc = locOf(0, d);
      if (loc.t === 'off') {
        const x = g.mx(G.TRAYX), y = G.MIDY + 8 + (G.FH / 2 - 8) / 2;
        s += `<rect x="${x - G.TIN / 2}" y="${G.MIDY + 8}" width="${G.TIN}" height="${G.FH / 2 - 8}" rx="6" fill="rgba(242,184,75,.22)" stroke="#f2b84b" stroke-width="2"/>`;
        continue;
      }
      const k = locKey(loc), n = (stacks.get(k) || []).length;
      const isHit = n === 1 && stacks.get(k)[0] >= 15;
      const pt = g.stackPos(loc, isHit ? 0 : n, isHit ? 1 : n + 1);
      const top = g.isTop(loc.i);
      const x = g.ptX(loc.i), y0 = top ? G.FV : G.H - G.FV, y1 = top ? G.FV + G.PL - 8 : G.H - G.FV - G.PL + 8;
      s += `<path d="M${x - G.PW / 2 + 3},${y0} L${x},${y1} L${x + G.PW / 2 - 3},${y0} Z" fill="rgba(242,184,75,.20)"/>`;
      s += `<circle cx="${pt.x}" cy="${pt.y}" r="${G.CD / 2 - 6}" fill="rgba(242,184,75,.18)" stroke="#f2b84b" stroke-width="2.5" stroke-dasharray="${isHit ? '0' : '5 5'}"/>`;
    }
    layers.hint.innerHTML = s;
  }
  function clearDests() { dests = null; layers.hint.innerHTML = ''; }

  function mark(id, on) {
    const el = els.get(id); if (!el) return;
    let ring = el.querySelector('.mk');
    if (on && el.classList.contains('tray')) return;
    if (on && !ring) { ring = document.createElementNS(SVGNS, 'circle'); ring.setAttribute('class', 'mk'); ring.setAttribute('r', String(G.CD / 2 + 1)); ring.setAttribute('fill', 'none'); ring.setAttribute('stroke', '#f2b84b'); ring.setAttribute('stroke-width', '2.5'); ring.setAttribute('opacity', '.85'); el.appendChild(ring); }
    if (!on && ring) ring.remove();
  }
  function setMarked(ids) { marked.forEach(id => mark(id, false)); marked = new Set(ids || []); marked.forEach(id => mark(id, true)); }

  function drawArrows(html) { layers.arrows.innerHTML = html || ''; }
  function arrowsFor(bb, p, pairs, color) { return arrowsSVG(g, bb, p, pairs, color); }

  /* ---- input ---- */
  function svgPoint(ev) {
    const pt = svg.createSVGPoint(); pt.x = ev.clientX; pt.y = ev.clientY;
    const m = root.getScreenCTM(); return m ? pt.matrixTransform(m.inverse()) : { x: 0, y: 0 };
  }
  function humanIdxOfId(id) {
    const loc = where.get(id);
    if (!loc) return null;
    if (loc.t === 'bar') return 24;
    if (loc.t === 'pt') return loc.i;
    return null;
  }
  function destAt(pt) {
    if (!dests) return null;
    // tray
    const tx = g.mx(G.TRAYX);
    if (dests.has(-1) && Math.abs(pt.x - tx) < G.TRAY / 2 + 10 && pt.y > G.MIDY - 20) return -1;
    let best = null, bd = 1e9;
    for (const [d] of dests) {
      if (d < 0) { const dd = Math.hypot(pt.x - tx, pt.y - (G.H - G.FV - 80)); if (dd < bd) { bd = dd; best = d; } continue; }
      const loc = locOf(0, d), x = g.ptX(loc.i), top = g.isTop(loc.i);
      const inCol = Math.abs(pt.x - x) <= G.PW / 2 && (top ? pt.y < G.MIDY + 10 : pt.y > G.MIDY - 10);
      if (inCol) return d;
      const cy = top ? G.FV + G.PL / 2 : G.H - G.FV - G.PL / 2;
      const dd = Math.hypot(pt.x - x, (pt.y - cy) * 0.6);
      if (dd < bd) { bd = dd; best = d; }
    }
    return bd < 70 ? best : null;
  }

  svg.addEventListener('pointerdown', (ev) => {
    const btn = ev.target.closest('.btn');
    if (btn) return; // handled on click
    const ce = ev.target.closest('.chk');
    if (!interactive) return;
    if (dests && !ce) {
      // tap on a highlighted destination while a checker is selected
      const pt = svgPoint(ev); const d = destAt(pt);
      if (d != null && cb.drop && drag == null && selFrom != null) { const f = selFrom; selFrom = null; clearDests(); cb.drop(f, d); return; }
    }
    if (!ce) { if (selFrom != null) { selFrom = null; clearDests(); } return; }
    let id = +ce.dataset.id;
    if (id >= 15) { // opponent checker: maybe it's a destination (hit)
      if (dests && selFrom != null) { const d = destAt(svgPoint(ev)); if (d != null) { const f = selFrom; selFrom = null; clearDests(); cb.drop(f, d); } }
      return;
    }
    let from = humanIdxOfId(id);
    if (from == null) return;
    if (dests && selFrom != null && dests.has(from) && from !== selFrom) {
      const f = selFrom; selFrom = null; clearDests(); cb.drop(f, from); return;
    }
    if (!cb.canPick(from)) { cb.cantPick && cb.cantPick(from); return; }
    // always drag the top checker of that stack
    const k = locKey(where.get(id)); const st = stacks.get(k); id = st[st.length - 1];
    const start = svgPoint(ev);
    drag = { id, from, start, moved: false, pointerId: ev.pointerId, orig: { ...posOf.get(id) } };
    svg.setPointerCapture(ev.pointerId);
    ev.preventDefault();
  });
  svg.addEventListener('pointermove', (ev) => {
    if (!drag || ev.pointerId !== drag.pointerId) return;
    const pt = svgPoint(ev);
    if (!drag.moved) {
      if (Math.hypot(pt.x - drag.start.x, pt.y - drag.start.y) < 9) return;
      drag.moved = true;
      selFrom = null;
      showDests(drag.from, cb.dests(drag.from));
      const el = els.get(drag.id);
      layers.drag.appendChild(el);
      el.classList.add('dragging');
      el.querySelector('.disc').setAttribute('filter', 'url(#fLift)');
    }
    setXY(drag.id, pt.x, pt.y - 6, 1.08);
  });
  function endDrag(ev, cancel) {
    if (!drag || (ev && ev.pointerId !== drag.pointerId)) return;
    const d = drag; drag = null;
    const el = els.get(d.id);
    if (!d.moved) {
      if (!cancel) cb.tap(d.from);
      return;
    }
    el.classList.remove('dragging');
    el.querySelector('.disc').setAttribute('filter', 'url(#fShadow)');
    const pt = ev ? svgPoint(ev) : d.start;
    const dest = cancel ? null : destAt(pt);
    clearDests();
    if (dest != null) {
      // put checker back into its stack position logically, then let the controller move it (animates from current spot)
      cb.drop(d.from, dest, true);
    } else {
      animateTo(d.id, d.orig, 160).then(orderZ);
    }
  }
  svg.addEventListener('pointerup', (ev) => endDrag(ev, false));
  svg.addEventListener('pointercancel', (ev) => endDrag(ev, true));

  let selFrom = null;
  function select(from) {
    selFrom = from;
    showDests(from, cb.dests(from));
  }

  svg.addEventListener('click', (ev) => {
    const btn = ev.target.closest('.btn');
    if (btn) { ev.preventDefault(); cb.button(btn.dataset.btn); }
  });
  svg.addEventListener('keydown', (ev) => {
    const btn = ev.target.closest && ev.target.closest('.btn');
    if (btn && (ev.key === 'Enter' || ev.key === ' ')) { ev.preventDefault(); cb.button(btn.dataset.btn); }
  });

  build();
  return {
    rebuild(b, o) { if (o) { flip = !!o.flip; humanLight = o.humanLight !== false; showPips = o.pips !== false; if (o.rot != null) rot = o.rot; if (o.slots) slots = o.slots; if (o.compact != null) compact = !!o.compact; } G.setFrame(compact); G.setSlots(slots); build(); setPositions(b); if (diceState) drawDice(diceState); if (cubeState) drawCube(cubeState); },
    get rot() { return rot; },
    get slots() { return slots; },
    toScreen(x, y) { const m = root.getScreenCTM(); return { x: m.a * x + m.c * y + m.e, y: m.b * x + m.d * y + m.f }; },
    setPositions, moveChecker, unmoveChecker, drawDice, rollDice, drawCube, drawButtons, drawStatus, showDests, clearDests, select,
    setInteractive(v) { interactive = v; if (!v) { selFrom = null; clearDests(); } },
    setSpeed(s) { speed = s; },
    setMarked, drawArrows, arrowsFor, updateCounts,
    idsMovedLast: () => [],
    topIdAt(p, idx) { const st = stacks.get(locKey(locOf(p, idx))) || []; return st[st.length - 1]; },
    get selFrom() { return selFrom; },
    get dragging() { return !!drag; }
  };
}
