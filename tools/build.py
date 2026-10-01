"""Assemble the app from src/ into:
  index.html            - the GitHub Pages site (full document)
  artifact/index.html   - the claude.ai artifact page (no skeleton; the host adds one)
  dist/Prime-Backgammon-offline.html - single-file offline copy (engine inlined)
Run from the repository root: python3 tools/build.py"""
import json, os
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(root)
shell = open('src/shell.html').read()
css = open('src/style.css').read()
js = '\n'.join(open('src/' + f).read() for f in ['rules.js', 'board.js', 'net.js', 'game.js', 'ui.js', 'review.js'])
js = js.replace("if (typeof module !== 'undefined') module.exports = { R };", '')
body = shell.replace('/*STYLE*/', css).replace('/*SCRIPT*/', js)
head = ('<!doctype html><html lang="en"><head><meta charset="utf-8">'
        '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">'
        '<meta name="apple-mobile-web-app-capable" content="yes"><meta name="mobile-web-app-capable" content="yes">'
        '<style>:root{color-scheme:light;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}'
        'body{margin:0;font:14px system-ui}img{max-width:100%}[hidden]{display:none!important}</style>')
site = body.replace('<!--WORKER-->', '')
open('index.html', 'w').write(head + site.replace('<div id="app">', '</head><body>\n<div id="app">', 1) + '\n</body></html>')
os.makedirs('artifact', exist_ok=True)
open('artifact/index.html', 'w').write(site)
eng = 'self.GNUBG_INLINE = true;\n' + open('tools/gnubg-engine-single.js').read() + '\n' + open('engine-api.js').read() + '\n' + open('engine-worker.js').read()
worker = '<script>window.GNUBG_WORKER_SRC = ' + json.dumps(eng).replace('</', '<\\/') + ';</script>'
os.makedirs('dist', exist_ok=True)
off = body.replace('<!--WORKER-->', worker)
open('dist/Prime-Backgammon-offline.html', 'w').write(head + off.replace('<div id="app">', '</head><body>\n<div id="app">', 1) + '\n</body></html>')
print('built index.html, artifact/index.html, dist/Prime-Backgammon-offline.html')
