# Prime Backgammon

Backgammon in the browser against the GNU Backgammon engine (World Class to Grandmaster strength), with match play, the doubling cube, PR and luck analysis, a tutor mode, and play-a-friend.

**Play:** https://jfattal123.github.io/Backgammon/

## How it's put together
- `index.html` – the app (built from `src/`).
- `gnubg-engine.js` – GNU Backgammon compiled to WebAssembly, with its neural nets, bearoff databases and the Rockwell-Kazaross match equity table embedded. `gnubg-engine-asm.js` is a plain-JavaScript fallback for browsers that block WebAssembly.
- `engine-worker.js`, `engine-api.js` – run the engine in a background thread.
- `src/` – the app's source (rules, board, game flow, review, screens). Rebuild with `python3 tools/build.py`.
- `engine/` – the small C API (`bgapi.c`) and build scripts used to compile gnubg with Emscripten.

## Licence
GNU Backgammon is free software under the GNU General Public License v3 (see `COPYING`); this app, which includes it, is distributed under the same licence. GNU Backgammon source: https://www.gnu.org/software/gnubg/ (web port basis: https://github.com/hwatheod/gnubg-web).
