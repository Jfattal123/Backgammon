# Bot audit

Checks that the app's bot plays what GNU Backgammon would play, using the real gnubg program as judge.

Needs Node and GNU Backgammon 1.07 with Python (`apt install gnubg` on Ubuntu; the binary is `/usr/games/gnubg`).

1. Play bot-vs-bot matches with the app's own move search and engine:
   `node tools/audit/selfplay.js <seed> <match length> <matches> out/m`
   This writes `out/m-0.mat`, `out/m-1.mat`, … plus `out/m-stats.json`, which counts any move where the app's
   search and gnubg's native search pick different positions.
2. Have gnubg analyse each match, here at 3-ply (Grandmaster), the bot's own setting:
   `mkdir -p res && MATF=$PWD/out/m-0.mat PLIES=3 /usr/games/gnubg -t -q -p tools/audit/ana.py | grep ^RESULT | cut -c8- > res/m-0.gm3.json`
   Use `PLIES=4` (and name the file `.p4.json`) for a deeper judge than the bot, and `MET=Kazaross-XG2` to try gnubg's newer match equity table.
3. Summarise: `python3 tools/audit/summ.py res`

Matches you play in the app can go through step 2 too: Review → Export → Download .mat.
