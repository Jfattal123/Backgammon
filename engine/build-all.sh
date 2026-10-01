#!/bin/sh
# Builds every engine variant from gnubg sources (expects the gnubg-web tree, Emscripten,
# and the object dirs produced below). Outputs into the repository root.
set -e
EMCC=${EMCC:-/home/claude/emscripten/emcc}
GW=${GW:-/home/claude/gnubg-web}
ENG=${ENG:-/home/claude/engine}
OUT=${OUT:-/home/claude/backgammon}
INC=$(cat $ENG/inc.txt)
SRCS="eval.c positionid.c matchid.c matchequity.c mec.c bearoff.c bearoffgammon.c osr.c util.c mtsupport.c lib/cache.c lib/inputs.c lib/isaac.c lib/md5.c lib/neuralnet.c lib/mt19937ar.c lib/list.c"
EXPORTS='["_bg_init","_bg_has_ts","_bg_moves","_bg_cube","_bg_eval","_bg_luck","_bg_points_eq","_bg_eq2mwc","_bg_set_cubeful","_bg_board_buf","_bg_move_buf","_bg_moves_buf","_bg_outf_buf","_bg_outi_buf","_bg_score_list","_bg_set_cache"]'
COMMON="-s MODULARIZE=1 -s EXPORT_NAME=GnubgEngine -s ENVIRONMENT=web,worker,node -s ALLOW_MEMORY_GROWTH=1 -s INITIAL_MEMORY=50331648 -s EXPORTED_FUNCTIONS=$EXPORTS -s EXPORTED_RUNTIME_METHODS=[\"HEAP32\",\"HEAPF32\"] -s FILESYSTEM=1"

# plain objects (no SIMD)
mkdir -p $ENG/obj-plain
cd $GW
for f in $SRCS $ENG/bgapi.c; do b=$(basename $f .c); [ -f gnubg/$f ] && s=gnubg/$f || s=$f; $EMCC -O3 -flto -w $INC -c $s -o $ENG/obj-plain/$b.o; done
# SIMD objects
mkdir -p $ENG/obj-simd2
SF="-O3 -flto -w -msimd128 -msse2 -DUSE_SIMD_INSTRUCTIONS=1 -DUSE_SSE2=1 -DDISABLE_SIMD_TEST=1"
for f in $SRCS lib/neuralnetsse.c $ENG/bgapi.c; do b=$(basename $f .c); [ -f gnubg/$f ] && s=gnubg/$f || s=$f; $EMCC $SF $INC -c $s -o $ENG/obj-simd2/$b.o; done
cd $ENG
# 1. split builds (small .js + .wasm, shared data file) for the web
$EMCC -O3 -flto -msimd128 obj-simd2/*.o obj/glib/*.o -o $OUT/gnubg-engine.js --preload-file data@/ $COMMON
mv $OUT/gnubg-engine.data $OUT/gnubg-engine-data.bin
$EMCC -O3 -flto obj-plain/*.o obj/glib/*.o -o $OUT/gnubg-engine-nosimd.js --preload-file data@/ $COMMON
cmp $OUT/gnubg-engine-nosimd.data $OUT/gnubg-engine-data.bin && rm $OUT/gnubg-engine-nosimd.data
# 2. pure JavaScript fallback (no WebAssembly), single file
$EMCC -O3 obj-plain/*.o obj/glib/*.o -o $OUT/gnubg-engine-asm.js --embed-file data@/ -s SINGLE_FILE=1 -s WASM=0 $COMMON
# 3. single-file SIMD build, inlined into the offline copy
$EMCC -O3 -flto -msimd128 obj-simd2/*.o obj/glib/*.o -o $OUT/tools/gnubg-engine-single.js --embed-file data@/ -s SINGLE_FILE=1 $COMMON
ls -la $OUT/gnubg-engine* $OUT/tools/gnubg-engine-single.js
