// #850 fix round 2 (L06-SPEC-R2-03) — the overlap-vs-sequential DECISION for the two-build drill's
// second scratch build, tested as a pure function of the machine's own reported core count so the
// choice is made in code, not left as a declined guard in a CI comment (the review's own words:
// "leaving it in a CI comment is not a decision"). See scratch-image.mjs's own header on
// `shouldOverlapSecondBuild` for the measurement this threshold answers: idle 5.1s vs 36.9s (7x)
// with one concurrent `pnpm typecheck`, and that contended run FAILED on a real `pollTask` timeout
// inside the claraWork leg — on the very 2-4-core class of runner #850 targets.
import test from "node:test";
import assert from "node:assert/strict";
import { shouldOverlapSecondBuild, OVERLAP_MIN_CORES } from "./scratch-image.mjs";

test("shouldOverlapSecondBuild refuses to overlap on a thin core budget (GitHub-hosted standard runners report 2)", () => {
  assert.equal(shouldOverlapSecondBuild(2), false);
});

test("shouldOverlapSecondBuild refuses one core short of the threshold, allows at the threshold", () => {
  assert.equal(shouldOverlapSecondBuild(OVERLAP_MIN_CORES - 1), false);
  assert.equal(shouldOverlapSecondBuild(OVERLAP_MIN_CORES), true);
});

test("shouldOverlapSecondBuild allows the overlap with real headroom (this dev rig's own shape)", () => {
  assert.equal(shouldOverlapSecondBuild(24), true);
});

test("shouldOverlapSecondBuild treats an unreadable core count as NOT safe to overlap, never as infinite headroom", () => {
  assert.equal(shouldOverlapSecondBuild(NaN), false);
  assert.equal(shouldOverlapSecondBuild(undefined), false);
  assert.equal(shouldOverlapSecondBuild(0), false);
});
