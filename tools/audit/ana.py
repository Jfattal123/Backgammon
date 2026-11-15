import gnubg, os, json
f = os.environ['MATF']; plies = int(os.environ.get('PLIES', '3')); met = os.environ.get('MET', 'Rockwell-Kazaross')
C = gnubg.command
C('set matchequitytable "/usr/share/gnubg/met/%s.xml"' % met)
C('set threads 1')
for k in ('chequerplay', 'cubedecision'):
    C('set analysis %s evaluation plies %d' % (k, plies))
    C('set analysis %s evaluation cubeful on' % k)
    C('set analysis %s evaluation prune on' % k)
    C('set analysis %s evaluation noise 0' % k)
    C('set analysis %s evaluation deterministic on' % k)
# gnubg's "large" move filter (what Grandmaster uses)
F = {3: [(0, 16, 0.32), (-1, 0, 0), (0, 4, 0.08)], 4: [(0, 16, 0.32), (-1, 0, 0), (0, 4, 0.08), (-1, 0, 0)]}
for i, (a, e, t) in enumerate(F.get(plies, [])):
    C('set analysis movefilter %d %d %d %d %g' % (plies, i, a, e, t))
C('import mat "%s"' % f)
C('analyse match')
m = gnubg.match(analysis=1, boards=0, statistics=1, verbose=0)
out = {'file': f, 'plies': plies, 'decisions': 0, 'moves': 0, 'cube': 0, 'errs': []}
for gi, g in enumerate(m['games']):
    for ai, a in enumerate(g['game']):
        an = a.get('analysis')
        if not an: continue

        if a['action'] == 'move' and 'moves' in an and len(an['moves']) > 1:
            out['moves'] += 1
            best = an['moves'][0]['score']; played = an['moves'][an['imove']]['score']
            loss = best - played
            if loss > 1e-4: out['errs'].append({'g': gi, 'a': ai, 'kind': 'move', 'player': a['player'], 'dice': a['dice'], 'played': a['move'], 'best': an['moves'][0]['move'], 'loss': loss})
        if a['action'] in ('double', 'take', 'drop') or 'cube-decision' in json.dumps(list(an.keys())):
            out['cube'] += 1
    st = m.get('stats') or {}
    out['stats'] = {p: {'moves': st[p]['moves'], 'cube': {k: v for k, v in st[p]['cube'].items() if v and not k.startswith('err-')}, 'rating': st[p]['error-based-fibs-rating']} for p in st}
print('RESULT ' + json.dumps(out, default=str))
