// Shared diagram geometry. The Ladder and Control Structure views used to
// disagree on node width (152 vs 150), height (58 vs 56), column pitch (196
// vs 215) and subtitle truncation (46 vs 40) for no reason — one file, one
// set of numbers, so the two diagrams read as the same visual language.

export const NODE_W = 152;
export const NODE_H = 58;
export const COL_W = 196;
export const ROW_H = 78;
export const SUBTITLE_MAX = 44;
export const ZOOM_MIN = 40;
export const ZOOM_MAX = 150;
export const ZOOM_DEFAULT = 100;

// Per-depth delay for the staleness cascade animation (views/ladder.js),
// so the ripple reads as travelling outward from the edited entity rather
// than every descendant flashing at once.
export const CASCADE_STEP_MS = 90;
