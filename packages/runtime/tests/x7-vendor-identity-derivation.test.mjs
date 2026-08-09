// THE DERIVATION, RE-RUN IN CI. Every number the vendor-identity headers quote is produced here
// from the corpus, so the decision can be re-executed and challenged instead of taken on trust.
//
// The precedent is round 5's rejected case-discontinuity predicate, which has stayed executable
// through four subsequent rounds and settled the same argument twice. If a future reader thinks
// the shipped rule is too coarse, the tighter alternative is right there — run it and read which
// document it lets through.

process.env.RELAY_TEST_MODE ??= "1";

import { test } from "node:test";
import assert from "node:assert/strict";

import { CORPUS, measure, reverseDirection, shipped, subsetOnly, suffixOnly }
  from "./x7-vendor-identity-derivation.mjs";

test("the SHIPPED rule has zero leaks and zero false holds over the whole corpus", () => {
  const m = measure(shipped);
  assert.deepEqual(m.leaks, [], "a LEAK is the seller emitted as the buyer — the forbidden outcome");
  assert.deepEqual(m.falseHolds, [], "a FALSE HOLD is a real buyer refused");
  // The nine collateral holds are the DECLARED safe-holds (a)-(e). They are a cost, not a bug,
  // and the count is asserted so widening the fold again cannot quietly enlarge it.
  assert.equal(m.collateral.length, 9);
  assert.equal(CORPUS.length, 33);
});

test("REJECTED #1 — subset only: 8 leaks, which is why the substring clause exists", () => {
  // What shipped one commit earlier. The join fixed the under-fragmented seller and left every
  // over-joined spelling open: five fragment shapes plus all three glued-noise ones.
  const m = measure(subsetOnly);
  assert.equal(m.leaks.length, 8);
  assert.equal(m.falseHolds.length, 0);
  assert.equal(m.leaks.includes("N1b letter-spaced logo"), true, "the shape the reviewer caught");
});

test("REJECTED #2 — suffix-only containment: TIGHTER, and it leaks", () => {
  // THE HONEST COMPARISON, and the reason it must be scored in two columns rather than one.
  // Suffix-only is genuinely MORE ACCURATE than the shipped rule: 5 collateral holds against 9,
  // because it admits the interior-substring companies the shipped rule refuses. If the two
  // failure modes were summed it would look like the better rule.
  //
  // It is rejected on the LEAK column alone. With OCR noise glued INTO a word rather than split
  // off it, suffix-only admits the seller as the buyer — a wrong counterparty on real books.
  // A hold is recoverable by the human who is already looking; a wrong counterparty is not.
  const m = measure(suffixOnly);
  assert.equal(m.collateral.length, 5, "genuinely more accurate on the collateral axis…");
  assert.deepEqual(m.leaks.sort(), ["glued at BOTH ends", "glued at the END"], "…and it LEAKS");
});

test("FORBIDDEN — the reverse containment direction inverts the franchise calibration", () => {
  // The clause that looks like a missing symmetry and is not. `romesecretary` IS inside
  // `romesecretarypenang`, so adding the reverse refuses a legitimate branch buyer — while
  // fixing none of the leaks that motivated the term.
  const m = measure(reverseDirection);
  assert.deepEqual(m.falseHolds, ["cal-2 franchise"]);
  assert.equal(m.leaks.length > 0, true, "and it does not even close the glued-noise shapes");
});
