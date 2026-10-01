/*
 * bgapi.c - thin WebAssembly API over the GNU Backgammon engine.
 * Licensed under the GNU GPL v3 (same as GNU Backgammon).
 *
 * Board convention (gnubg TanBoard): b[0..24] = player NOT on roll,
 * b[25..49] = player ON roll. Each side indexed from its own ace point
 * (0 = 1-point ... 23 = 24-point, 24 = bar).
 *
 * Match context (ints): matchTo (0 = money), scoreOpp, scoreMe, cube,
 * owner (-1 centred, 0 opponent, 1 player on roll), crawford, jacoby.
 */
#include "config.h"
#include <glib.h>
#include <stdio.h>
#include <string.h>
#include <math.h>
#include <emscripten.h>
#include "backgammon.h"
#include "eval.h"
#include "matchequity.h"
#include "positionid.h"
#include "multithread.h"

static int inited = 0;
static int gCubeful = 1;
EMSCRIPTEN_KEEPALIVE void bg_set_cubeful(int f) { gCubeful = f ? 1 : 0; }

/* shared buffers */
static int inBoard[50];
static int inMove[8];
static float outF[4096];
static int outI[4096];

EMSCRIPTEN_KEEPALIVE int *bg_board_buf(void) { return inBoard; }
EMSCRIPTEN_KEEPALIVE int *bg_move_buf(void) { return inMove; }
EMSCRIPTEN_KEEPALIVE float *bg_outf_buf(void) { return outF; }
EMSCRIPTEN_KEEPALIVE int *bg_outi_buf(void) { return outI; }

static void load_board(TanBoard b) {
    int i;
    for (i = 0; i < 25; i++) {
        b[0][i] = (unsigned int) inBoard[i];
        b[1][i] = (unsigned int) inBoard[25 + i];
    }
}

static void set_ci(cubeinfo *pci, int matchTo, int sOpp, int sMe, int cube, int owner, int crawford, int jacoby) {
    int anScore[2];
    anScore[0] = sOpp;
    anScore[1] = sMe;
    SetCubeInfo(pci, cube, owner, 1, matchTo, anScore, crawford, jacoby, FALSE, VARIATION_STANDARD);
}

static void get_level(int level, evalcontext *pec, movefilter (**ppmf)[MAX_FILTER_PLIES]) {
    if (level < 0) level = 0;
    if (level >= NUM_SETTINGS) level = NUM_SETTINGS - 1;
    *pec = aecSettings[level];
    pec->fCubeful = gCubeful;
    pec->fDeterministic = TRUE;
    if (aiSettingsMoveFilter[level] >= 0)
        *ppmf = aaamfMoveFilterSettings[aiSettingsMoveFilter[level]];
    else
        *ppmf = aaamfMoveFilterSettings[2];
}

EMSCRIPTEN_KEEPALIVE int bg_init(void) {
    if (inited) return 1;
    InitMatchEquity("/met/Rockwell-Kazaross.xml");
    EvalInitialise(NULL, "/gnubg.wd", FALSE, NULL);
    MT_InitThreads();
    inited = 1;
    return 1;
}

/* Is two-sided bearoff db loaded? */
EMSCRIPTEN_KEEPALIVE int bg_has_ts(void) { return pbc2 != NULL; }

/*
 * Rank moves. Output per move (stride 16 floats in outF):
 *  [0..7] anMove (as floats), [8] equity (EMG, cubeful), [9..14] probs
 *  (win, winG, winBG, loseG, loseBG, cubeless eq), [15] plies evaluated.
 * If inMove[0] != -2, the played move is located and forced to full-ply
 * evaluation; its index is returned in outI[0] (-1 if not found).
 * Returns number of moves (max 200).
 */
EMSCRIPTEN_KEEPALIVE int bg_moves(int d0, int d1, int matchTo, int sOpp, int sMe, int cube, int owner,
                                  int crawford, int jacoby, int level, int locatePlayed) {
    TanBoard b;
    cubeinfo ci;
    evalcontext ec;
    movefilter (*pmf)[MAX_FILTER_PLIES];
    movelist ml;
    positionkey key;
    unsigned int i, n;
    int iPlayed = -1;

    load_board(b);
    set_ci(&ci, matchTo, sOpp, sMe, cube, owner, crawford, jacoby);
    get_level(level, &ec, &pmf);

    if (locatePlayed) {
        TanBoard bAfter;
        memcpy(bAfter, b, sizeof(TanBoard));
        ApplyMove(bAfter, inMove, FALSE);
        PositionKey((ConstTanBoard) bAfter, &key);
        if (FindnSaveBestMoves(&ml, d0, d1, (ConstTanBoard) b, &key, 0.0f, &ci, &ec, pmf) < 0)
            return -1;
    } else {
        if (FindnSaveBestMoves(&ml, d0, d1, (ConstTanBoard) b, NULL, 0.0f, &ci, &ec, pmf) < 0)
            return -1;
    }
    n = ml.cMoves;

    if (locatePlayed) {
        for (i = 0; i < n; i++) {
            if (EqualKeys(ml.amMoves[i].key, key)) {
                iPlayed = (int) i;
                break;
            }
        }
        /* Ensure played move evaluated at full plies (like gnubg analysis) */
        if (iPlayed >= 0 && ml.amMoves[iPlayed].esMove.ec.nPlies < ec.nPlies) {
            ScoreMove(NULL, &ml.amMoves[iPlayed], &ci, &ec, ec.nPlies);
            ml.amMoves[iPlayed].esMove.ec = ec;
            ml.amMoves[iPlayed].esMove.et = EVAL_EVAL;
        }
        /* make sure the best (index 0) is also at full plies */
        if (n > 0 && ml.amMoves[0].esMove.ec.nPlies < ec.nPlies && ec.nPlies > 0) {
            ScoreMove(NULL, &ml.amMoves[0], &ci, &ec, ec.nPlies);
            ml.amMoves[0].esMove.ec = ec;
            ml.amMoves[0].esMove.et = EVAL_EVAL;
        }
    }

    outI[1] = (int) n;          /* total number of legal moves */
    if (n > 40) n = 40;
    if (iPlayed >= (int) n) {   /* keep the played move in the returned list */
        ml.amMoves[n] = ml.amMoves[iPlayed];
        iPlayed = (int) n;
        n++;
    }
    for (i = 0; i < n; i++) {
        move *pm = &ml.amMoves[i];
        float *o = outF + 16 * i;
        int k;
        for (k = 0; k < 8; k++) o[k] = (float) pm->anMove[k];
        o[8] = pm->rScore;
        for (k = 0; k < 5; k++) o[9 + k] = pm->arEvalMove[k];
        o[14] = pm->arEvalMove[OUTPUT_EQUITY];
        o[15] = (float) (pm->esMove.et == EVAL_NONE ? -1 : (int) pm->esMove.ec.nPlies);
    }
    outI[0] = iPlayed;
    if (ml.amMoves) g_free(ml.amMoves);
    return (int) n;
}

/*
 * Cube decision for player on roll (the potential doubler).
 * outF: [0] optimal eq, [1] no double, [2] double/take, [3] double/pass,
 *       [4..10] cubeless outputs (win,wg,wbg,lg,lbg,eq,cubefulEq of no-double)
 * outI: [0] cubedecision enum, [1] isClose, [2] doubling available (1/0)
 */
EMSCRIPTEN_KEEPALIVE int bg_cube(int matchTo, int sOpp, int sMe, int cube, int owner, int crawford, int jacoby, int level) {
    TanBoard b;
    cubeinfo ci;
    evalcontext ec;
    evalsetup es;
    movefilter (*pmf)[MAX_FILTER_PLIES];
    float aarOutput[2][NUM_ROLLOUT_OUTPUTS];
    float arDouble[4];
    cubedecision cd;
    int k;

    load_board(b);
    set_ci(&ci, matchTo, sOpp, sMe, cube, owner, crawford, jacoby);
    get_level(level, &ec, &pmf);
    es.et = EVAL_EVAL;
    es.ec = ec;

    if (GeneralCubeDecisionE(aarOutput, (ConstTanBoard) b, &ci, &ec, &es) < 0)
        return -1;
    cd = FindCubeDecision(arDouble, aarOutput, &ci);
    for (k = 0; k < 4; k++) outF[k] = arDouble[k];
    for (k = 0; k < 7; k++) outF[4 + k] = aarOutput[0][k];
    outI[0] = (int) cd;
    outI[1] = isCloseCubedecision(arDouble);
    outI[2] = GetDPEq(NULL, NULL, &ci);
    return (int) cd;
}

/*
 * Position evaluation for player on roll (before rolling).
 * outF: [0..4] win,wg,wbg,lg,lbg  [5] cubeless eq  [6] cubeful eq (EMG)
 */
EMSCRIPTEN_KEEPALIVE int bg_eval(int matchTo, int sOpp, int sMe, int cube, int owner, int crawford, int jacoby, int level) {
    TanBoard b;
    cubeinfo ci;
    evalcontext ec;
    movefilter (*pmf)[MAX_FILTER_PLIES];
    float ar[NUM_ROLLOUT_OUTPUTS];
    int k;

    load_board(b);
    set_ci(&ci, matchTo, sOpp, sMe, cube, owner, crawford, jacoby);
    get_level(level, &ec, &pmf);
    if (GeneralEvaluationE(ar, (ConstTanBoard) b, &ci, &ec) < 0)
        return -1;
    for (k = 0; k < 7; k++) outF[k] = ar[k];
    if (!gCubeful) outF[6] = ar[OUTPUT_EQUITY];
    else if (matchTo) outF[6] = mwc2eq(ar[OUTPUT_CUBEFUL_EQUITY], &ci);
    return 0;
}

/*
 * Luck of a roll for the player on roll (0-ply cubeful, as gnubg analysis).
 * outF[0] = luck (EMG) = eq(best after actual roll) - mean over 36 rolls.
 * outF[1] = equity after actual roll, outF[2] = mean.
 */
EMSCRIPTEN_KEEPALIVE int bg_luck(int d0, int d1, int matchTo, int sOpp, int sMe, int cube, int owner, int crawford, int jacoby) {
    TanBoard b;
    cubeinfo ci;
    evalcontext ec = { TRUE, 0, FALSE, TRUE, 0.0f };
    ec.fCubeful = gCubeful;
    float sum = 0.0f, actual = 0.0f;
    int i, j;

    load_board(b);
    set_ci(&ci, matchTo, sOpp, sMe, cube, owner, crawford, jacoby);

    for (i = 1; i <= 6; i++) {
        for (j = 1; j <= i; j++) {
            movelist ml;
            float eq;
            if (FindnSaveBestMoves(&ml, i, j, (ConstTanBoard) b, NULL, 0.0f, &ci, &ec, aaamfMoveFilterSettings[2]) < 0)
                return -1;
            if (ml.cMoves == 0) {
                /* no legal move: evaluate position after passing */
                TanBoard bb;
                float ar[NUM_ROLLOUT_OUTPUTS];
                cubeinfo ci2;
                memcpy(bb, b, sizeof(TanBoard));
                SwapSides(bb);
                set_ci(&ci2, ci.nMatchTo, ci.anScore[1], ci.anScore[0], ci.nCube,
                       ci.fCubeOwner < 0 ? -1 : !ci.fCubeOwner, ci.fCrawford, ci.fJacoby);
                GeneralEvaluationE(ar, (ConstTanBoard) bb, &ci2, &ec);
                if (!gCubeful) eq = -ar[OUTPUT_EQUITY];
                else eq = ci.nMatchTo ? mwc2eq(1.0f - ar[OUTPUT_CUBEFUL_EQUITY], &ci) : -ar[OUTPUT_CUBEFUL_EQUITY];
            } else {
                eq = ml.amMoves[0].rScore;
            }
            if (ml.amMoves) g_free(ml.amMoves);
            sum += (i == j ? 1.0f : 2.0f) * eq;
            if ((i == d0 && j == d1) || (i == d1 && j == d0))
                actual = eq;
        }
    }
    outF[1] = actual;
    outF[2] = sum / 36.0f;
    outF[0] = actual - outF[2];
    return 0;
}

/*
 * Equity (EMG, from the perspective of player on roll) of the player on roll
 * winning nPoints (positive) or losing (negative points) right now.
 */
EMSCRIPTEN_KEEPALIVE float bg_points_eq(int nPoints, int matchTo, int sOpp, int sMe, int cube, int owner, int crawford, int jacoby) {
    cubeinfo ci;
    float mwc;
    /* nPoints is the resignation multiplier (1 single, 2 gammon, 3 bg), signed */
    int pts = (nPoints < 0 ? -nPoints : nPoints) * cube;
    set_ci(&ci, matchTo, sOpp, sMe, cube, owner, crawford, jacoby);
    if (matchTo == 0)
        return (float) nPoints;
    mwc = getME(ci.anScore[0], ci.anScore[1], ci.nMatchTo, 1, pts, nPoints > 0 ? 1 : 0, ci.fCrawford,
                aafMET, aafMETPostCrawford);
    return mwc2eq(mwc, &ci);
}

/* MWC <-> EMG conversion for display */
EMSCRIPTEN_KEEPALIVE float bg_eq2mwc(float eq, int matchTo, int sOpp, int sMe, int cube, int owner, int crawford) {
    cubeinfo ci;
    set_ci(&ci, matchTo, sOpp, sMe, cube, owner, crawford, 0);
    if (!matchTo) return eq;
    return eq2mwc(eq, &ci);
}
