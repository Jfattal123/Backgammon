/* ===================== BOARD (SVG) ===================== */
// Board geometry. SLOTS = how many checkers a point shows before the stack squeezes up:
// 5 is the classic look; short landscape screens use fewer (bigger checkers), tall screens more.
const G = { FV: 26, PW: 64, TXT: 12 };
// Two frames, same look:
//  standard (laptops, tablets, phones on their side): left rail for the cube and pip counts, tray on the right
//  compact  (phones held upright): no side rail (cube sits on the bar, pip counts in the tray) so the
//           points and checkers get as much of the narrow screen as possible
G.FRAMES = {
  standard: { F: 14, RAIL: 54, BAR: 58, TRAY: 66, CD: 59, TIN: 50, SLAB: 42, BAROFF: 47, RX: 18, FV: 26 },
  compact: { F: 6, RAIL: 0, BAR: 46, TRAY: 46, CD: 60, TIN: 38, SLAB: 30, BAROFF: 54, RX: 10, FV: 30 }
};
G.frameOf = (compact) => G.FRAMES[compact ? 'compact' : 'standard'];
G.widthOf = (compact) => { const f = G.frameOf(compact); return 2 * f.F + f.RAIL + 12 * G.PW + f.BAR + f.TRAY; };
G.midFor = (n) => n <= 4 ? 82 : 100;   // short boards get a slimmer middle strip
G.heightOf = (compact, n, mid) => G.frameOf(compact).FV * 2 + 2 * n * G.frameOf(compact).CD + (mid || G.midFor(n));
// Board text (point numbers, pip counts) is sized for the screen, not the board: about 10.5px however
// big or small the board is drawn, within what the number strip can hold.
G.setTextScale = function (pxPerUnit) { this.TXT = Math.max(11, Math.min(this.FV - 6, 10.5 / (pxPerUnit || 1))); };
G.setFrame = function (compact) {
  this.COMPACT = !!compact;
  Object.assign(this, this.frameOf(compact));
  this.W = this.widthOf(compact);
  this.FL = this.F + this.RAIL;                 // field left
  this.XR = this.FL + 6 * this.PW + this.BAR;   // right half start
  this.BARX = this.FL + 6 * this.PW + this.BAR / 2;
  this.TRAYX = this.XR + 6 * this.PW + this.TRAY / 2;
  this.RAILX = this.F + this.RAIL / 2;
};
G.setSlots = function (n, mid) {
  this.SLOTS = n; this.MID = mid || this.midFor(n);
  this.PL = n * this.CD;             // point length
  this.FH = 2 * this.PL + this.MID;
  this.H = this.FV * 2 + this.FH;
  this.MIDY = this.FV + this.FH / 2;
};
G.setFrame(false);
G.setSlots(5);
// Pick the point length (checkers per point before stacks squeeze) for a w x h box. Pure: does not
// change the current geometry. Big screens keep the classic 5 (or longer if there is spare height).
// Small screens trade a little checker size for natural proportions: 4 is fine, 3 only when there is no other way.
G.bestSlots = function (w, h, maxN = 10, compact = false) {
  const CD = this.frameOf(compact).CD, W = this.widthOf(compact);
  const px = (n) => CD * Math.min(w / W, h / this.heightOf(compact, n));
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
    ? { fill: 'url(#gLight)', dish: 'url(#gLightDish)', rim: '#aea695', ring: 'rgba(92,80,62,.30)', ring2: 'rgba(255,255,255,.9)', spec: 'rgba(255,255,255,.95)', slab: 'url(#gSlabL)', slabRim: '#b3ac9f', text: '#1a1d21' }
    : { fill: 'url(#gDark)', dish: 'url(#gDarkDish)', rim: '#0b0d0f', ring: 'rgba(0,0,0,.62)', ring2: 'rgba(255,255,255,.10)', spec: 'rgba(255,255,255,.26)', slab: 'url(#gSlabD)', slabRim: '#50565f', text: '#f2efe9' };
}
function diceColors(p, humanLight) {
  const light = (p === 0) === humanLight;
  return light ? { face: 'url(#gDieL)', edge: '#c4bcae', pip: '#1a1d21', hi: 'rgba(255,255,255,.85)' } : { face: 'url(#gDieD)', edge: '#111316', pip: '#f2efe9', hi: 'rgba(255,255,255,.13)' };
}

// Static board base (frame, field, points, numbers, tray, rail)
const BOARD_DEFS = `<defs>
    <radialGradient id="gLight" cx="36%" cy="28%" r="82%"><stop offset="0" stop-color="#ffffff"/><stop offset=".5" stop-color="#f3efe7"/><stop offset="1" stop-color="#cfc8ba"/></radialGradient>
    <radialGradient id="gDark" cx="36%" cy="28%" r="82%"><stop offset="0" stop-color="#5a616b"/><stop offset=".45" stop-color="#272b31"/><stop offset="1" stop-color="#0d0f12"/></radialGradient>
    <linearGradient id="gLightDish" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d8d1c4"/><stop offset=".55" stop-color="#efeae1"/><stop offset="1" stop-color="#fdfbf7"/></linearGradient>
    <linearGradient id="gDarkDish" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0e1013"/><stop offset=".55" stop-color="#1e2227"/><stop offset="1" stop-color="#3a4048"/></linearGradient>
    <radialGradient id="gSh"><stop offset=".6" stop-color="#000" stop-opacity=".5"/><stop offset=".84" stop-color="#000" stop-opacity=".2"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>
    <linearGradient id="gSlabL" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fbf8f2"/><stop offset="1" stop-color="#d6cfc2"/></linearGradient>
    <linearGradient id="gSlabD" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#41474f"/><stop offset="1" stop-color="#1b1e22"/></linearGradient>
    <linearGradient id="gDieL" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#e7e1d5"/></linearGradient>
    <linearGradient id="gDieD" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3b4149"/><stop offset="1" stop-color="#1a1d21"/></linearGradient>
    <linearGradient id="gCube" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fdfaf3"/><stop offset="1" stop-color="#e2dac9"/></linearGradient>
    <linearGradient id="gFrame" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#21353a"/><stop offset=".5" stop-color="#182a2e"/><stop offset="1" stop-color="#101d20"/></linearGradient>
    <linearGradient id="gField" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#274047"/><stop offset=".5" stop-color="#20363c"/><stop offset="1" stop-color="#274047"/></linearGradient>
    <radialGradient id="gGlow" cx="50%" cy="50%" r="78%"><stop offset="0" stop-color="#fff" stop-opacity=".06"/><stop offset=".55" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".2"/></radialGradient>
    <linearGradient id="gLip" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity=".34"/><stop offset="1" stop-color="#000" stop-opacity="0"/></linearGradient>
    <linearGradient id="gBar" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#132227"/><stop offset=".12" stop-color="#24393f"/><stop offset=".5" stop-color="#1c2f34"/><stop offset=".88" stop-color="#24393f"/><stop offset="1" stop-color="#132227"/></linearGradient>
    <linearGradient id="gBrass" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e3c27d"/><stop offset=".5" stop-color="#b8924a"/><stop offset="1" stop-color="#8a6a2e"/></linearGradient>
    <linearGradient id="gPtAt" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#528790"/><stop offset="1" stop-color="#34606a"/></linearGradient>
    <linearGradient id="gPtAb" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#528790"/><stop offset="1" stop-color="#34606a"/></linearGradient>
    <linearGradient id="gPtBt" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e2d2b7"/><stop offset="1" stop-color="#b9a585"/></linearGradient>
    <linearGradient id="gPtBb" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#e2d2b7"/><stop offset="1" stop-color="#b9a585"/></linearGradient>
    <filter id="fShadow" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="2.5" stdDeviation="2.2" flood-color="#000" flood-opacity=".38"/></filter>
    <marker id="mArrow" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#f2b84b"/></marker>
    <marker id="mArrowG" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#5fd39b"/></marker>
  </defs>`;
function boardBaseSVG(flip, opts = {}) {
  const g = geo(flip);
  let s = BOARD_DEFS;
  // frame: a raised edge, lit from above
  s += `<rect x="0" y="0" width="${G.W}" height="${G.H}" rx="${G.RX}" fill="url(#gFrame)"/>`;
  s += `<rect x=".75" y=".75" width="${G.W - 1.5}" height="${G.H - 1.5}" rx="${G.RX - .75}" fill="none" stroke="rgba(255,255,255,.09)" stroke-width="1.5"/>`;
  // the two wells the checkers sit in
  const lx = g.mx(G.FL), rx = g.mx(G.XR);
  const hx = (x) => flip ? x - 6 * G.PW : x;
  const wells = [hx(lx), hx(rx)];
  for (const x0 of wells) s += `<rect x="${x0}" y="${G.FV}" width="${6 * G.PW}" height="${G.FH}" rx="5" fill="url(#gField)"/>`;
  // bar: a raised spine with a seam (and hinges where there is room for them)
  const bx = g.mx(G.BARX);
  s += `<rect x="${bx - G.BAR / 2 + 5}" y="${G.FV}" width="${G.BAR - 10}" height="${G.FH}" rx="5" fill="url(#gBar)"/>`;
  s += `<line x1="${bx}" y1="${G.FV + 6}" x2="${bx}" y2="${G.H - G.FV - 6}" stroke="rgba(0,0,0,.34)" stroke-width="1.5"/>`;
  if (!G.COMPACT) for (const hy of [G.FV + G.FH * 0.085, G.H - G.FV - G.FH * 0.085]) {
    s += `<rect x="${bx - 9}" y="${hy - 17}" width="18" height="34" rx="3.5" fill="url(#gBrass)" stroke="rgba(0,0,0,.4)" stroke-width="1"/><line x1="${bx}" y1="${hy - 16}" x2="${bx}" y2="${hy + 16}" stroke="rgba(0,0,0,.35)" stroke-width="1.2"/>`;
    for (const dy of [-10, 10]) s += `<circle cx="${bx - 4.6}" cy="${hy + dy}" r="1.5" fill="rgba(60,42,12,.7)"/><circle cx="${bx + 4.6}" cy="${hy + dy}" r="1.5" fill="rgba(60,42,12,.7)"/>`;
  }
  // bear-off trays
  const tx = g.mx(G.TRAYX) - G.TIN / 2;
  for (const y0 of [G.FV, G.MIDY + 6]) {
    s += `<rect x="${tx}" y="${y0}" width="${G.TIN}" height="${G.FH / 2 - 6}" rx="5" fill="#0e191c" stroke="rgba(0,0,0,.3)" stroke-width="1"/>`;
    s += `<rect x="${tx}" y="${y0}" width="${G.TIN}" height="12" rx="5" fill="url(#gLip)"/>`;
  }
  // points, with softened tips
  for (let i = 0; i < 24; i++) {
    const x = g.ptX(i), top = g.isTop(i), dir = top ? 1 : -1;
    const y0 = top ? G.FV : G.H - G.FV, y1 = top ? G.FV + G.PL - 6 : G.H - G.FV - G.PL + 6;
    const c = i % 2 === 0 ? (top ? 'url(#gPtAt)' : 'url(#gPtAb)') : (top ? 'url(#gPtBt)' : 'url(#gPtBb)');
    const hw = G.PW / 2 - 4;
    s += `<path d="M${x - hw},${y0} L${x - 3},${y1 - dir * 7} Q${x},${y1 + dir} ${x + 3},${y1 - dir * 7} L${x + hw},${y0} Z" fill="${c}" stroke="rgba(255,255,255,.07)" stroke-width="1"/>`;
    if (opts.numbers !== false) {
      const fs = G.TXT;
      const ny = top ? G.FV / 2 + fs * 0.36 : G.H - G.FV / 2 + fs * 0.36;
      s += `<text class="ptnum" x="${x}" y="${ny}" text-anchor="middle" style="font-size:${fs}px">${i + 1}</text>`;
    }
  }
  // lighting: a soft pool of light in each well, darker towards its corners, and the shadow its top lip casts
  for (const x0 of wells) {
    s += `<rect x="${x0}" y="${G.FV}" width="${6 * G.PW}" height="${G.FH}" rx="5" fill="url(#gGlow)" pointer-events="none"/>`;
    s += `<rect x="${x0}" y="${G.FV}" width="${6 * G.PW}" height="16" rx="5" fill="url(#gLip)" pointer-events="none"/>`;
    s += `<rect x="${x0 + .75}" y="${G.FV + .75}" width="${6 * G.PW - 1.5}" height="${G.FH - 1.5}" rx="5" fill="none" stroke="rgba(0,0,0,.4)" stroke-width="1.5"/>`;
  }
  return s;
}

function checkerSVG(id, p, humanLight, x, y, inTray) {
  const c = checkerColors(p, humanLight);
  const r = G.CD / 2 - 1, d = r * 0.7;
  // the shadow is a soft-edged disc under the checker (far cheaper to animate than a blur filter)
  return `<g class="chk${inTray ? ' tray' : ''}" data-id="${id}" data-p="${p}" transform="translate(${x},${y})">
    <circle class="sh" ${inTray ? 'style="display:none"' : ''} cy="2.5" r="${r + 3.5}" fill="url(#gSh)"/>
    <g class="disc" ${inTray ? 'style="display:none"' : ''}>
      <circle class="body" r="${r}" fill="${c.fill}" stroke="${c.rim}" stroke-width="1.2"/>
      <circle r="${d}" fill="${c.dish}"/>
      <circle r="${d}" fill="none" stroke="${c.ring}" stroke-width="1.5"/>
      <circle r="${d - 1.7}" fill="none" stroke="${c.ring2}" stroke-width="1" opacity=".55"/>
      <circle r="${r * 0.4}" fill="none" stroke="${c.ring}" stroke-width="1.2" opacity=".5"/>
      <path d="M${-r * 0.8},${-r * 0.36} A${r * 0.88},${r * 0.88} 0 0 1 ${-r * 0.1},${-r * 0.87}" fill="none" stroke="${c.spec}" stroke-width="2" stroke-linecap="round"/>
    </g>
    <g class="slab" ${inTray ? '' : 'style="display:none"'}><rect x="${-G.SLAB / 2}" y="-6" width="${G.SLAB}" height="12" rx="3" fill="${c.slab}" stroke="${c.slabRim}" stroke-width="1"/></g>
  </g>`;
}

function dieSVG(cx, cy, v, col, opts = {}) {
  const sz = opts.size || 52, r = 11 * sz / 52;
  const op = opts.used ? .32 : 1;
  let s = `<g class="die" transform="translate(${cx},${cy})${opts.rot ? ` rotate(${opts.rot})` : ''}${opts.sc && opts.sc !== 1 ? ` scale(${opts.sc})` : ''}" opacity="${op}">`;
  s += `<rect x="${-sz / 2}" y="${-sz / 2}" width="${sz}" height="${sz}" rx="${r}" fill="${col.face}" stroke="${col.edge}" stroke-width="1.2" filter="url(#fShadow)"/>`;
  s += `<rect x="${-sz / 2 + 2.2}" y="${-sz / 2 + 2.2}" width="${sz - 4.4}" height="${sz - 4.4}" rx="${r - 2}" fill="none" stroke="${col.hi}" stroke-width="1.2"/>`;
  const k = sz / 52;
  for (const [dx, dy] of pipDots(v)) s += `<circle cx="${dx * k}" cy="${dy * k}" r="${4.7 * k}" fill="${col.pip}"/>`;
  s += `</g>`;
  return s;
}

function cubeSVG(x, y, value, size = 46) {
  const v = value || 64;
  const fs = (v >= 100 ? 15 : v >= 10 ? 19 : 22) * size / 46;
  return `<g class="cube" transform="translate(${x},${y})">
    <rect x="${-size / 2}" y="${-size / 2}" width="${size}" height="${size}" rx="9" fill="url(#gCube)" stroke="#b9b09d" stroke-width="1.2" filter="url(#fShadow)"/>
    <rect x="${-size / 2 + 3}" y="${-size / 2 + 3}" width="${size - 6}" height="${size - 6}" rx="6.5" fill="none" stroke="rgba(184,146,74,.55)" stroke-width="1.2"/>
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
  const savedRot = ROT, savedSlots = G.SLOTS, savedMid = G.MID, savedFrame = G.COMPACT, savedTxt = G.TXT; ROT = 0; G.setFrame(false); G.setSlots(5); G.TXT = 13;
  try { return staticBoardSVG0(st, o); } finally { ROT = savedRot; G.setFrame(savedFrame); G.setSlots(savedSlots, savedMid); G.TXT = savedTxt; }
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
  s += `<text x="${g.mx(G.RAILX)}" y="${G.H - G.FV - 118}" text-anchor="middle" font-size="13" fill="var(--board-text)" style="font-family:var(--font-num)">${counts[0]}</text>`;
  s += `<text x="${g.mx(G.RAILX)}" y="${G.FV + 132}" text-anchor="middle" font-size="13" fill="var(--board-text)" style="font-family:var(--font-num)">${counts[1]}</text>`;
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
  let flip = false, humanLight = true, showPips = true, rot = 0, slots = 5, compact = false, mid = 0;
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
  // Everything the board shows is remembered, so a rebuild (rotation, resize, settings) redraws it exactly.
  // `gen` changes on every rebuild: animations started before it stop touching the new board.
  let gen = 0, lastBtns = [], statusTxt = ['', ''], arrowsHtml = '';


  let root = svg;
  // explicit pixel size: no reliance on how each browser sizes an SVG from its viewBox
  function size(w, h) {
    svg.style.width = Math.max(1, Math.floor(w)) + 'px'; svg.style.height = Math.max(1, Math.floor(h)) + 'px';
    svg.style.borderRadius = (G.RX * w / G.W).toFixed(1) + 'px';   // so the (cheap) CSS shadow follows the frame's corners
  }
  function build() {
    gen++;
    selFrom = null; dests = null; drag = null;
    ROT = rot;
    const eflip = rot ? !flip : flip;
    g = geo(eflip);
    svg.setAttribute('viewBox', rot ? `0 0 ${G.H} ${G.W}` : `0 0 ${G.W} ${G.H}`);
    svg.innerHTML = `<g id="root"${rot ? ` transform="matrix(0,-1,1,0,0,${G.W})"` : ''}>` + boardBaseSVG(eflip) +
      `<g id="lyHint"></g><g id="lyPips"></g><g id="lyChk"></g><g id="lyFx" pointer-events="none"></g><g id="lyArrows"></g><g id="lyDice"></g><g id="lyCube"></g><g id="lyBtn"></g><g id="lyDrag"></g></g>`;
    root = svg.querySelector('#root');
    layers = { hint: svg.querySelector('#lyHint'), pips: svg.querySelector('#lyPips'), chk: svg.querySelector('#lyChk'), fx: svg.querySelector('#lyFx'), arrows: svg.querySelector('#lyArrows'), dice: svg.querySelector('#lyDice'), cube: svg.querySelector('#lyCube'), btn: svg.querySelector('#lyBtn'), drag: svg.querySelector('#lyDrag') };
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
      s += `<text x="${tp.x}" y="${ty}" text-anchor="middle" dominant-baseline="central" font-size="${Math.min(G.TRAY * 0.42, G.TXT * 1.05)}" font-weight="700" fill="var(--board-text)" style="pointer-events:none;font-family:var(--font-num)"${trT(tp.x, ty)}>${ids.length}</text>`;
    }
    cg.innerHTML = s;
    if (showPips && cb.pips) {
      const pp = cb.pips();
      const rx = g.mx(G.RAILX);
      const fv = Math.min(19, G.TXT * 1.12), fl = Math.min(12, G.TXT * 0.72);
      const pipTxt = (y, v, lblDy) => `<text x="${rx}" y="${y}" text-anchor="middle" font-size="${fv}" font-weight="600" fill="var(--board-text)" style="font-family:var(--font-num)">${v}</text><text x="${rx}" y="${y + lblDy * fl / 9}" text-anchor="middle" font-size="${fl}" letter-spacing="1" fill="var(--board-text)" opacity=".7">PIPS</text>`;
      if (G.COMPACT) {
        // compact: in the tray, beside the middle (yours below, theirs above)
        const fv = Math.min(G.TRAY * 0.5, G.TXT), fl = Math.min(11, fv * 0.55);
        const tx = g.mx(G.TRAYX), t = (y, v) => `<text x="${tx}" y="${y}" text-anchor="middle" font-size="${fv}" font-weight="600" fill="var(--board-text)" style="font-family:var(--font-num)">${v}</text>`;
        const lbl = (y) => `<text x="${tx}" y="${y}" text-anchor="middle" font-size="${fl}" letter-spacing=".5" fill="var(--board-text)" opacity=".7">PIPS</text>`;
        layers.pips.innerHTML = pp ? t(G.MIDY + 8 + fv, pp[0]) + lbl(G.MIDY + 10 + fv + fl) + t(G.MIDY - 8 - fl - 2, pp[1]) + lbl(G.MIDY - 6) : '';
      } else
      // clear of an owned cube (and its Double label) at the rail ends and of the centred cube
      layers.pips.innerHTML = pp ? pipTxt(G.H - G.FV - 118, pp[0], -16) + pipTxt(G.FV + 132, pp[1], 16) : '';
    } else layers.pips.innerHTML = '';
  }

  const ease = (t) => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  // checkers leave briskly and settle softly
  const glide = (t) => 1 - Math.pow(1 - Math.pow(t, 1.25), 3);
  function setXY(id, x, y, scale) {
    const el = els.get(id);
    el.setAttribute('transform', `translate(${x},${y})${scale && scale !== 1 ? ` scale(${scale})` : ''}`);
    posOf.set(id, { x, y });
  }
  // How far a checker is off the board (0 resting .. 1 held): its shadow drops away and softens
  function setLift(el, L) {
    const sh = el && el.querySelector('.sh'); if (!sh) return;
    const r = G.CD / 2 - 1;
    sh.setAttribute('cy', (2.5 + 10 * L).toFixed(2)); sh.setAttribute('r', (r + 3.5 + 6 * L).toFixed(2)); sh.setAttribute('opacity', (1 - 0.32 * L).toFixed(3));
  }
  // a small squash as a checker lands
  function settle(el) {
    const disc = el && el.querySelector('.disc');
    if (reduceMotion || !disc || !disc.animate) return;
    disc.animate([{ transform: 'scale(1)' }, { transform: 'scale(.95)', offset: .35 }, { transform: 'scale(1.025)', offset: .7 }, { transform: 'scale(1)' }], { duration: 210 * Math.max(.7, speed), easing: 'ease-out' });
  }
  // "no": a checker that can't move shakes its head
  function nudge(el) {
    const disc = el && el.querySelector('.disc');
    if (reduceMotion || !disc || !disc.animate) return;
    disc.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-5px)' }, { transform: 'translateX(4px)' }, { transform: 'translateX(-2px)' }, { transform: 'translateX(0)' }], { duration: 260, easing: 'ease-out' });
  }
  // an expanding ring (a hit, a checker reaching the tray)
  function fxRing(x, y, o = {}) {
    if (reduceMotion || !layers.fx) return;
    const r0 = o.r || G.CD / 2, k = o.k || 1.9, ms = (o.ms || 420), col = o.col || '#f2b84b', my = gen;
    const c = document.createElementNS(SVGNS, 'circle');
    c.setAttribute('cx', x); c.setAttribute('cy', y); c.setAttribute('fill', o.fill || 'none'); c.setAttribute('stroke', col);
    layers.fx.appendChild(c);
    const t0 = performance.now();
    (function step(now) {
      const t = Math.max(0, Math.min(1, (now - t0) / ms));
      if (my !== gen || t >= 1) { c.remove(); return; }
      const e = 1 - Math.pow(1 - t, 3);
      c.setAttribute('r', (r0 * (1 + (k - 1) * e)).toFixed(2)); c.setAttribute('opacity', (0.9 * (1 - t)).toFixed(3)); c.setAttribute('stroke-width', (3.5 * (1 - t) + .5).toFixed(2));
      requestAnimationFrame(step);
    })(t0);
  }
  function animateTo(id, pt, dur, lift, endScale) {
    const el = els.get(id);
    const from = posOf.get(id) || pt;
    dur = reduceMotion ? 0 : dur * speed;
    if (!el) return Promise.resolve();
    if (dur <= 0) { setXY(id, pt.x, pt.y); setLift(el, 0); return Promise.resolve(); }
    if (lift) layers.drag.appendChild(el);
    // a longer journey lifts higher; a checker already in the hand (dragged) comes down from there
    const dist = Math.hypot(pt.x - from.x, pt.y - from.y);
    const peak = lift ? Math.min(1, 0.45 + dist / (G.PW * 9)) : 0;
    const held = lift === 'held';
    const my = gen;
    return new Promise(res => {
      const t0 = performance.now();
      function step(now) {
        if (my !== gen) return res();   // the board was rebuilt underneath us: stop
        const t = Math.max(0, Math.min(1, (now - t0) / dur)), e = lift ? glide(t) : ease(t);
        const x = from.x + (pt.x - from.x) * e, y = from.y + (pt.y - from.y) * e;
        const L = held ? 1 - e : peak * Math.sin(Math.PI * Math.min(1, t * 1.04));
        let sc = 1 + (held ? 0.1 : 0.11) * Math.max(0, L);
        if (endScale) sc *= 1 + (endScale - 1) * e;
        setXY(id, x, y, sc);
        if (lift) setLift(el, Math.max(0, L));
        if (t < 1) requestAnimationFrame(step);
        else { if (lift) { setLift(el, 0); if (!endScale) settle(el); } res(); }
      }
      requestAnimationFrame(step);
    });
  }

  function setTrayLook(id, inTray) {
    const el = els.get(id);
    if (inTray) { const r = el.querySelector('.mk'); if (r) r.remove(); }
    el.classList.toggle('tray', inTray);
    el.querySelector('.disc').style.display = inTray ? 'none' : '';
    el.querySelector('.sh').style.display = inTray ? 'none' : '';
    el.querySelector('.slab').style.display = inTray ? '' : 'none';
  }

  // Deal the checkers onto the board, stack by stack (start of a game). Purely cosmetic: positions are already final.
  function dealIn() {
    if (reduceMotion) return 0;
    let col = 0, last = 0;
    const keys = [...stacks.keys()].filter(k => k.startsWith('pt')).sort((a, b) => g.ptX(+a.slice(2)) - g.ptX(+b.slice(2)));
    for (const k of keys) {
      const ids = stacks.get(k); if (!ids.length) continue;
      ids.forEach((id, j) => {
        const el = els.get(id), disc = el.querySelector('.disc'), sh = el.querySelector('.sh');
        if (!disc.animate) return;
        const delay = (col * 42 + j * 34) * speed, d = 250 * speed;
        last = Math.max(last, delay + d);
        disc.animate([{ opacity: 0, transform: 'scale(.5)' }, { opacity: 1, transform: 'scale(1.07)', offset: .65 }, { opacity: 1, transform: 'scale(1)' }], { duration: d, delay, easing: 'cubic-bezier(.2,.8,.3,1)', fill: 'backwards' });
        sh.animate([{ opacity: 0 }, { opacity: 1 }], { duration: d, delay, fill: 'backwards' });
      });
      col++;
    }
    if (last) cb.sound && cb.sound('deal');
    return last;
  }

  // Move top checker of player p from index `from` to `to` (-1 off). hit handled if flagged.
  async function moveChecker(p, from, to, hit, opts = {}) {
    const my = gen;
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
    if (id === heldId) { opts = { ...opts, held: true }; heldId = null; }
    if (tl.t !== 'off') setTrayLook(id, false);
    cb.sound && cb.sound('lift', p);
    // borne-off checkers shrink as they slide into the tray, then settle as a slab
    const main = animateTo(id, target, dur, opts.held ? 'held' : true, tl.t === 'off' ? 0.55 : null).then(() => {
      if (my !== gen) return;
      if (tl.t === 'off') {
        setTrayLook(id, true); setXY(id, target.x, target.y);
        const slab = els.get(id).querySelector('.slab');
        if (!reduceMotion && slab.animate) slab.animate([{ transform: 'scale(1.35,1.8)', opacity: .4 }, { transform: 'scale(1)', opacity: 1 }], { duration: 220, easing: 'cubic-bezier(.2,.8,.3,1)' });
      }
      cb.sound && cb.sound(tl.t === 'off' ? 'off' : 'place', p);
    });
    proms.push(main);
    if (hitId != null) {
      const bl = { t: 'bar', p: 1 - p };
      proms.push(new Promise(r => setTimeout(r, dur * speed * 0.62)).then(() => { if (my !== gen) return; cb.sound && cb.sound('hit'); fxRing(target.x, target.y, { k: 2.1, ms: 460, col: '#ff8a5c' }); return animateTo(hitId, g.stackPos(bl, stacks.get(locKey(bl)).length - 1, stacks.get(locKey(bl)).length), 300, true); }));
    }
    await Promise.all(proms);
    if (my !== gen) return id;   // rebuilt mid-move: the new board already shows the result
    // relayout affected stacks (compression)
    await Promise.all([layoutStack(fk, fl, true), layoutStack(tk, tl, true), hitId != null ? layoutStack(locKey({ t: 'bar', p: 1 - p }), { t: 'bar', p: 1 - p }, true) : null]);
    if (my !== gen) return id;
    orderZ();
    updateCounts();
    return id;
  }

  // Reverse of moveChecker (for undo)
  async function unmoveChecker(p, from, to, hit) {
    const my = gen;
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
    if (my !== gen) return;
    await Promise.all([layoutStack(fk, fl, true), layoutStack(tk, tl, true)]);
    if (my !== gen) return;
    orderZ();
    updateCounts();
  }

  /* ---- dice ---- */
  let diceState = null; // {p, vals, used:[bool], order:[i,j]}
  // pose (while the dice are in the air): per die {dx, dy, rot, sc, v}, keyed by position (or by player for the opening roll)
  function drawDice(st, pose) {
    diceState = st;
    if (!pose && cb.barDice) cb.barDice(st);
    if (!st) { layers.dice.innerHTML = ''; return; }
    // phones held upright show your dice in the big control bar under the board, so not twice
    if (!st.single && st.p === 0 && cb.isPortrait && cb.isPortrait()) { layers.dice.innerHTML = ''; return; }
    const c = g.diceCenter(st.p), col = diceColors(st.p, humanLight);
    const P = (k) => (pose && pose[k]) || {};
    const DS = G.COMPACT ? 76 : 52, gap = DS * 0.635;   // upright phones draw the board small, so the dice are larger on it
    const at = (q, k) => ({ x: q.x + (P(k).dx || 0), y: q.y + (P(k).dy || 0) });
    let s = '';
    const vals = st.vals;
    if (st.single) {
      // opening roll: one die each side
      for (const [pp, v] of st.single) {
        const q = at(g.diceCenter(pp), pp);
        s += dieSVG(q.x, q.y, P(pp).v || v, diceColors(pp, humanLight), { rot: P(pp).rot, sc: P(pp).sc, size: DS });
      }
      layers.dice.innerHTML = s; return;
    }
    if (vals.length === 4) {
      // doubles: show two dice, with small used markers
      const usedN = st.used.filter(Boolean).length;
      s += `<g class="btn" data-btn="dice" role="button" aria-label="Dice">`;
      const a = at(offs(c, -gap), 0), b2 = at(offs(c, gap), 1);
      s += dieSVG(a.x, a.y, P(0).v || vals[0], col, { used: usedN >= 4, rot: P(0).rot, sc: P(0).sc, size: DS });
      s += dieSVG(b2.x, b2.y, P(1).v || vals[0], col, { rot: P(1).rot, sc: P(1).sc, size: DS });
      // markers under the dice showing how many moves are left
      const mk = DS / 52;
      if (!pose) for (let k = 0; k < 4; k++) { const q = offs(c, (-27 + k * 18) * mk, 44 * mk); s += `<circle cx="${q.x}" cy="${q.y}" r="${4.5 * mk}" fill="${k < 4 - usedN ? '#f2b84b' : 'rgba(255,255,255,.18)'}"/>`; }
      s += `</g>`;
    } else {
      const ord = st.order || [0, 1];
      s += `<g class="btn" data-btn="dice" role="button" aria-label="Dice, tap to swap order">`;
      ord.forEach((vi, pos) => { const q = at(offs(c, pos === 0 ? -gap : gap), pos); s += dieSVG(q.x, q.y, P(pos).v || vals[vi], col, { used: st.used[vi], rot: P(pos).rot, sc: P(pos).sc, size: DS }); });
      s += `</g>`;
    }
    layers.dice.innerHTML = s;
  }
  // Throw the dice: they tumble in from the edge of their half, bounce once and settle on the roll.
  async function rollDice(st, dur) {
    dur = reduceMotion ? 0 : dur * (0.5 + 0.5 * speed);
    cb.sound && cb.sound('dice');
    if (dur > 0) {
      const t0 = performance.now(), my = gen;
      const keys = st.single ? st.single.map(([pp]) => pp) : [0, 1];
      const inBoard = !!st.single || st.p !== 0 || !(cb.isPortrait && cb.isPortrait());
      const rnd = () => 1 + Math.floor(Math.random() * 6);
      const th = keys.map((key, i) => {
        const c = g.diceCenter(st.single ? key : st.p);
        const side = c.x > G.W / 2 ? 1 : -1;   // from the nearer outside edge
        return { dx: side * (150 + Math.random() * 70), dy: (Math.random() - .5) * 90, rot: (Math.random() < .5 ? -1 : 1) * (360 + Math.random() * 300), lag: i * 0.08, v: rnd(), at: 0 };
      });
      await new Promise(res => {
        function step(now) {
          const t = (now - t0) / dur;
          if (t >= 1 || my !== gen) return res();
          const pose = {}; let changed = false;
          th.forEach((d, i) => {
            const tt = Math.max(0, Math.min(1, (t - d.lag) / (1 - d.lag))), e = 1 - Math.pow(1 - tt, 3);
            if (tt < 0.72) { if (now - d.at > 58) { d.at = now; let v; do { v = rnd(); } while (v === d.v); d.v = v; changed = true; } }
            else if (d.v) { d.v = 0; changed = true; }   // 0: show the real value
            const hop = Math.abs(Math.sin(Math.min(1, tt * 1.18) * Math.PI * 1.5)) * (1 - tt);
            pose[keys[i]] = { dx: d.dx * (1 - e), dy: d.dy * (1 - e), rot: d.rot * (1 - e), sc: 1 + 0.3 * hop + 0.25 * (1 - e), v: d.v };
          });
          if (inBoard) drawDice(st, pose);
          else if (changed && cb.barDice) cb.barDice({ ...st, rolling: true, faces: th.map(d => d.v) });
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
    const prevPos = cubeState && cubeState.pos, prevVal = cubeState && cubeState.shown;
    cubeState = st;
    if (!st || !st.on) { layers.cube.innerHTML = ''; return; }
    const pos = g.cubePos(st.owner, st.offeredTo);
    const val = st.offeredTo != null ? st.value * 2 : (st.owner === -1 ? (st.value > 1 ? st.value : 64) : st.value);
    const size = st.offeredTo != null ? (G.COMPACT ? 96 : 64) : G.COMPACT ? 40 : 46;
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
      const t0 = performance.now(), dur = 300 * speed, my = gen;
      w.setAttribute('transform', `translate(${from.x},${from.y})${trG()}`);
      (function step(now) { if (my !== gen) return; const t = Math.min(1, (now - t0) / dur), e = ease(t); w.setAttribute('transform', `translate(${from.x + (pos.x - from.x) * e},${from.y + (pos.y - from.y) * e})${trG()}`); if (t < 1) requestAnimationFrame(step); })(t0);
    }
    cubeState.pos = pos; cubeState.shown = val;
    const face = layers.cube.querySelector('.cube');
    if (animate && !reduceMotion && face && face.animate && prevVal != null && prevVal !== val)
      face.animate([{ transform: 'scale(1) rotate(0deg)' }, { transform: 'scale(1.28) rotate(-8deg)', offset: .4 }, { transform: 'scale(1) rotate(0deg)' }], { duration: 420 * Math.max(.7, speed), easing: 'cubic-bezier(.3,.7,.3,1)' });
  }

  /* ---- buttons ---- */
  // btns: [{id, label, kind:'primary'|'accent'|'ghost', side:0|1, slot:'left'|'right'|'center'|'l2'|'r2', w}]
  function drawButtons(btns) {
    const had = new Set(lastBtns.map(b => b.id));
    lastBtns = btns || [];
    refreshPickable();
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
      s += `<g class="btn" data-btn="${b.id}" role="button" tabindex="0" aria-label="${esc(b.aria || b.label)}" transform="translate(${x},${y})${trG()}"><g class="bi${had.has(b.id) ? '' : ' in'}">
        <rect x="${-w / 2}" y="${-h / 2}" width="${w}" height="${h}" rx="${h / 2}" fill="${fill}" stroke="${stroke}" stroke-width="1.5" ${b.kind !== 'ghost' ? 'filter="url(#fShadow)"' : ''}/>
        ${b.kind !== 'ghost' ? `<rect x="${-w / 2 + 2}" y="${-h / 2 + 2}" width="${w - 4}" height="${h - 4}" rx="${h / 2 - 2}" fill="none" stroke="rgba(255,255,255,.45)" stroke-width="1"/>` : ''}
        ${b.icon ? `<g transform="translate(${-w / 2 + 22},0)" stroke="${tc}" fill="none" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">${b.icon}</g>` : ''}
        <text x="${b.icon ? 10 : 0}" y="${6 * k}" text-anchor="middle" font-size="${16 * k}" font-weight="700" fill="${tc}">${esc(b.label)}</text>
      </g></g>`;
    }
    layers.btn.innerHTML = s;
  }

  // status text in a half (e.g., thinking)
  function drawStatus(side, text) {
    statusTxt[side] = text || '';
    if (!text && statusTxt[1 - side]) { const o = 1 - side; statusTxt[side] = ''; return drawStatus(o, statusTxt[o]); }
    let el = svg.querySelector('#lyStatus');
    if (!el) { el = document.createElementNS(SVGNS, 'g'); el.id = 'lyStatus'; layers.btn.before(el); }
    if (!text) { el.innerHTML = ''; return; }
    const c = g.halfCenter(side);
    const tw = Math.max(96, String(text).length * 8.4 + 62), dots = [0, 1, 2].map(i => `<circle class="sdot" style="animation-delay:${i * .14}s" cx="${-tw / 2 + 20 + i * 9}" cy="0" r="3.2" fill="#f2b84b"/>`).join('');
    const sk = Math.min(2, Math.max(1, G.TXT / 12)).toFixed(2);   // readable however small the board is drawn
    el.innerHTML = `<g transform="translate(${c.x},${c.y})${trG()} scale(${sk})"><g class="spill"><rect x="${-tw / 2}" y="-19" width="${tw}" height="38" rx="19" fill="rgba(8,16,18,.55)" stroke="rgba(255,255,255,.08)" stroke-width="1"/>
      ${dots}<text x="${-tw / 2 + 48}" y="5" font-size="14" font-weight="600" fill="#e6ece9">${esc(text)}</text></g></g>`;
  }

  /* ---- highlights ---- */
  function showDests(fromIdx, map) {
    dests = map;
    let s = '';
    if (map) for (const [d] of map) {
      const loc = locOf(0, d);
      if (loc.t === 'off') {
        const x = g.mx(G.TRAYX), y = G.MIDY + 8 + (G.FH / 2 - 8) / 2;
        s += `<rect class="dst" data-d="${d}" x="${x - G.TIN / 2}" y="${G.MIDY + 6}" width="${G.TIN}" height="${G.FH / 2 - 6}" rx="5" fill="rgba(242,184,75,.22)" stroke="#f2b84b" stroke-width="2"/>`;
        continue;
      }
      const k = locKey(loc), n = (stacks.get(k) || []).length;
      const isHit = n === 1 && stacks.get(k)[0] >= 15;
      const pt = g.stackPos(loc, isHit ? 0 : n, isHit ? 1 : n + 1);
      const top = g.isTop(loc.i);
      const x = g.ptX(loc.i), y0 = top ? G.FV : G.H - G.FV, y1 = top ? G.FV + G.PL - 8 : G.H - G.FV - G.PL + 8;
      s += `<g class="dst" data-d="${d}"><path class="glow" d="M${x - G.PW / 2 + 3},${y0} L${x},${y1} L${x + G.PW / 2 - 3},${y0} Z" fill="rgba(242,184,75,.20)"/>`;
      s += `<circle class="spot" cx="${pt.x}" cy="${pt.y}" r="${G.CD / 2 - 6}" fill="rgba(242,184,75,.18)" stroke="${isHit ? '#ff8a5c' : '#f2b84b'}" stroke-width="2.5" stroke-dasharray="${isHit ? '0' : '5 5'}"/></g>`;
    }
    layers.hint.innerHTML = s;
  }
  function clearDests() { dests = null; layers.hint.innerHTML = ''; }
  // which of your checkers can be picked up right now (for the pointer and hover feedback)
  function refreshPickable() {
    if (!layers.chk) return;
    layers.chk.querySelectorAll('.chk.can').forEach(e => e.classList.remove('can'));
    if (!interactive || !cb.canPick) return;
    for (const [k, ids] of stacks) {
      if (!ids.length || ids[ids.length - 1] >= 15) continue;
      const idx = k === 'bar0' ? 24 : k.startsWith('pt') ? +k.slice(2) : null;
      if (idx != null && cb.canPick(idx)) { const el = els.get(ids[ids.length - 1]); el && el.classList.add('can'); }
    }
  }

  function mark(id, on) {
    const el = els.get(id); if (!el) return;
    let ring = el.querySelector('.mk');
    if (on && el.classList.contains('tray')) return;
    if (on && !ring) { ring = document.createElementNS(SVGNS, 'circle'); ring.setAttribute('class', 'mk'); ring.setAttribute('r', String(G.CD / 2 + 1)); ring.setAttribute('fill', 'none'); ring.setAttribute('stroke', '#f2b84b'); ring.setAttribute('stroke-width', '2.5'); ring.setAttribute('opacity', '.85'); el.appendChild(ring); }
    if (!on && ring) ring.remove();
  }
  function setMarked(ids) { marked.forEach(id => mark(id, false)); marked = new Set(ids || []); marked.forEach(id => mark(id, true)); }

  function drawArrows(html) { arrowsHtml = html || ''; layers.arrows.innerHTML = arrowsHtml; }
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
    if (!cb.canPick(from)) { nudge(ce); cb.cantPick && cb.cantPick(from); return; }
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
      setLift(el, 1);
      cb.sound && cb.sound('pick');
    }
    setXY(drag.id, pt.x, pt.y - 6, 1.1);
    // the destination under the finger answers
    const hot = destAt(pt);
    if (hot !== drag.hot) { drag.hot = hot; layers.hint.querySelectorAll('[data-d]').forEach(n => n.classList.toggle('hot', hot != null && +n.dataset.d === hot)); }
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
    const pt = ev ? svgPoint(ev) : d.start;
    const dest = cancel ? null : destAt(pt);
    clearDests();
    if (dest != null) {
      // put checker back into its stack position logically, then let the controller move it (animates from current spot)
      heldId = d.id;
      Promise.resolve(cb.drop(d.from, dest, true)).finally(() => { if (heldId === d.id) { heldId = null; setLift(el, 0); } });
    } else {
      animateTo(d.id, d.orig, 190, 'held').then(orderZ);
    }
  }
  svg.addEventListener('pointerup', (ev) => endDrag(ev, false));
  svg.addEventListener('pointercancel', (ev) => endDrag(ev, true));

  let selFrom = null, heldId = null;   // heldId: the checker just dropped from a drag (it comes down from the hand, no second lift)
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
    rebuild(b, o) {
      if (o) { flip = !!o.flip; humanLight = o.humanLight !== false; showPips = o.pips !== false; if (o.rot != null) rot = o.rot; if (o.slots) slots = o.slots; if (o.compact != null) compact = !!o.compact; mid = o.mid || 0; }
      G.setFrame(compact); G.setSlots(slots, mid);
      if (o && o.px) G.setTextScale(o.px.w / G.W);
      build(); setPositions(b);
      if (cubeState) drawCube(cubeState);
      drawDice(diceState);
      drawButtons(lastBtns);
      statusTxt.forEach((t, sd) => { if (t) drawStatus(sd, t); });
      layers.arrows.innerHTML = arrowsHtml;
      if (o && o.px) size(o.px.w, o.px.h);
    },
    size,
    get rot() { return rot; },
    get slots() { return slots; },
    get compact() { return compact; },
    get mid() { return mid; },
    get aspect() { return G.W / G.H; },
    toScreen(x, y) { const m = root.getScreenCTM(); return { x: m.a * x + m.c * y + m.e, y: m.b * x + m.d * y + m.f }; },
    setPositions, moveChecker, unmoveChecker, drawDice, rollDice, drawCube, drawButtons, drawStatus, showDests, clearDests, select,
    setInteractive(v) { interactive = v; if (!v) { selFrom = null; clearDests(); } refreshPickable(); },
    dealIn, fxRing, refreshPickable,
    setSpeed(s) { speed = s; },
    setMarked, drawArrows, arrowsFor, updateCounts,
    idsMovedLast: () => [],
    topIdAt(p, idx) { const st = stacks.get(locKey(locOf(p, idx))) || []; return st[st.length - 1]; },
    get selFrom() { return selFrom; },
    get dragging() { return !!drag; }
  };
}
