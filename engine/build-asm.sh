set -e
cd /home/claude/gnubg-web
INC=$(cat /home/claude/engine/inc.txt)
/home/claude/emscripten/emcc -O3 -w $INC -c /home/claude/engine/bgapi.c -o /home/claude/engine/obj/bg/bgapi.o
cd /home/claude/engine
/home/claude/emscripten/emcc -O3 obj/bg/*.o obj/glib/*.o -o build/gnubg-engine-asm.js -s WASM=0 \
  --embed-file data@/ -s SINGLE_FILE=1 -s MODULARIZE=1 -s EXPORT_NAME=GnubgEngine \
  -s ENVIRONMENT=web,worker,node -s ALLOW_MEMORY_GROWTH=1 -s INITIAL_MEMORY=67108864 \
  -s 'EXPORTED_FUNCTIONS=["_bg_init","_bg_has_ts","_bg_moves","_bg_cube","_bg_eval","_bg_luck","_bg_points_eq","_bg_eq2mwc","_bg_set_cubeful","_bg_board_buf","_bg_move_buf","_bg_outf_buf","_bg_outi_buf"]' \
  -s 'EXPORTED_RUNTIME_METHODS=["HEAP32","HEAPF32"]' -s FILESYSTEM=1
ls -la build/
