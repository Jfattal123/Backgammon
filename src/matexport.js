/* ===================== MATCH EXPORT ===================== */
// Writes a match in the Jellyfish ".mat" text format, which GNU Backgammon, eXtreme Gammon,
// BGBlitz and most other analysers import. Player 0 (you) is the left column, player 1 the right.
const MatExport = (() => {
  const pt = (i) => i === 24 ? 25 : i < 0 ? 0 : i + 1;   // own-perspective index -> point number (bar 25, off 0)
  const pad = (s, n) => s.length >= n ? s + ' ' : s + ' '.repeat(n - s.length);
  const clean = (s) => String(s || '').replace(/[:\r\n]/g, ' ').trim().slice(0, 24) || 'Player';

  function moveText(r) {
    const d = r.dice.slice().sort((a, b) => b - a).join('');
    if (r.forcedNone || !r.subs || !r.subs.length) return d + ':';
    return d + ': ' + r.subs.map(s => pt(s.from) + '/' + pt(s.to) + (s.hit ? '*' : '')).join(' ');
  }
  // one game's decisions as cells [{side, text}]
  function cells(g) {
    const out = [];
    for (const r of g.recs || []) {
      if (r.k === 'move' && r.dice) out.push({ side: r.p, text: moveText(r) });
      else if (r.k === 'cube' && r.action === 'double') out.push({ side: r.p, text: ' Doubles => ' + (r.ctx && r.ctx.cube ? r.ctx.cube * 2 : 2) });
      else if (r.k === 'take') out.push({ side: r.p, text: r.action === 'take' ? ' Takes' : ' Drops' });
    }
    return out;
  }
  function gameText(g, i, M, names) {
    const s = g.startScore || [0, 0];
    const L = [];
    L.push(' Game ' + (i + 1));
    L.push(' ' + pad(names[0] + ' : ' + s[0], 31) + names[1] + ' : ' + s[1]);
    // lay the cells into numbered rows, left then right, leaving a gap if a side is skipped
    const slots = [];
    for (const c of cells(g)) {
      if (slots.length % 2 !== c.side) slots.push('');
      slots.push(c.text);
    }
    for (let k = 0; k < slots.length; k += 2) {
      const n = String(k / 2 + 1).padStart(3, ' ') + ') ';
      L.push(n + pad(slots[k], 28) + (slots[k + 1] || ''));
    }
    if (g.result) {
      const p = g.result.points;
      const last = M.over && i === M.games.length - 1 && M.matchTo;
      const t = 'Wins ' + p + ' point' + (p === 1 ? '' : 's') + (last ? ' and the match' : '');
      L.push((g.result.winner === 0 ? '      ' : ' '.repeat(33)) + t);
    }
    return L.join('\n');
  }
  function toMat(M, names) {
    names = (names || ['You', 'Bot']).map(clean);
    if (names[0] === names[1]) names[1] += ' 2';
    const d = new Date(M.created || Date.now());
    const head = [
      '; [Site "Prime Backgammon"]',
      '; [Player 1 "' + names[0] + '"]',
      '; [Player 2 "' + names[1] + '"]',
      '; [EventDate "' + d.getFullYear() + '.' + String(d.getMonth() + 1).padStart(2, '0') + '.' + String(d.getDate()).padStart(2, '0') + '"]',
      '',
      ' ' + (M.matchTo || 0) + ' point match',
      ''
    ];
    return head.join('\n') + '\n' + M.games.map((g, i) => gameText(g, i, M, names)).join('\n\n') + '\n';
  }
  function fileName(M, names) {
    const d = new Date(M.created || Date.now());
    const stamp = d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0') + '-' + String(d.getHours()).padStart(2, '0') + String(d.getMinutes()).padStart(2, '0');
    return ('prime-' + clean(names[1]) + '-' + stamp).toLowerCase().replace(/[^a-z0-9-]+/g, '-') + '.mat';
  }
  return { toMat, fileName };
})();
if (typeof module !== 'undefined') module.exports = { MatExport };
