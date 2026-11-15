import json, glob, sys
for tag in ['gm3', 'p4', 'xg']:
    fs = sorted(glob.glob('' + (sys.argv[1] if len(sys.argv) > 1 else 'res') + '/*.%s.json' % tag))
    if not fs: continue
    tm = te = 0; loss = 0.0; big = []; unf = 0; cube_err = 0; skill = 0.0; marked = {}
    for f in fs:
        try: d = json.load(open(f))
        except Exception as e: print('bad', f, e); continue
        tm += d['moves']; te += len(d['errs']); loss += sum(e['loss'] for e in d['errs'])
        big += [(e['loss'], f.split('/')[-1], e['g'], e['a'], e['dice'], e['played'], e['best']) for e in d['errs']]
        for p, v in d['stats'].items():
            unf += v['moves']['unforced-moves']; skill += v['moves']['error-skill']
            for k, x in v['moves']['marked'].items(): marked[k] = marked.get(k, 0) + x
            cube_err += sum(x for k, x in v['cube'].items() if k.startswith(('missed', 'wrong')))
    print('== %s: %d matches, %d decisions with a choice, %d differ from judge (%.1f%%), total loss %.3f, avg/unforced %.4f, PR~%.2f, cube errors %d, marked %s' % (tag, len(fs), tm, te, 100.0 * te / max(1, tm), loss, skill / max(1, unf), 500 * skill / max(1, unf), cube_err, marked))
    for b in sorted(big, reverse=True)[:8]: print('   %.4f %s g%d a%d dice %s played %s best %s' % b)
