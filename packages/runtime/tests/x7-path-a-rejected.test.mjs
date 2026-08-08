// The REJECTION of path (A), re-run in CI so it is a fact rather than a claim.
//
// A reviewer could only rate the recorded figures PLAUSIBLE, because the predicate had not been
// retained. It is retained now (`x7-path-a-rejected.mjs`) with an explicit named corpus, and this
// file asserts the table the contract doc quotes. If someone later believes path (A) should have
// been adopted, they can change the predicate here and watch the numbers move.

process.env.RELAY_TEST_MODE ??= "1";

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  measurePathA, caseDiscontinuity, shippedCandidate,
  CONSTRUCTED_23, E2E_5, LEGIT_TITLECASE,
} from "./x7-path-a-rejected.mjs";

test("the corpus is what it claims to be — 23 DISTINCT constructed forms, not 24", () => {
  assert.equal(CONSTRUCTED_23.length, 23);
  assert.equal(new Set(CONSTRUCTED_23).size, 23, "no duplicates — the '24' figure double-counted `trading as`");
  assert.equal(E2E_5.length, 5);
});

test("path (A) FAILS the decision rule — closes the 5, but loses legitimate names", () => {
  const t = measurePathA();
  // The half it PASSES: every end-to-end leak closes.
  assert.equal(t.e2eClosed, 5, "5/5 end-to-end leaks closed");
  assert.equal(t.e2eTotal, 5);
  // The half it FAILS: the rule required ZERO legitimate loss.
  const lost = [...t.lostAllCaps, ...t.lostTitleCase, ...t.lostLowercase];
  assert.ok(lost.length > 0, "the decision rule required zero legitimate-name loss");
  assert.deepEqual(t.lostTitleCase.sort(), [...LEGIT_TITLECASE].filter((s) => t.lostTitleCase.includes(s)).sort());
  assert.equal(t.lostTitleCase.length, 4, "4 of 5 TITLE-CASE names lost, incl. `Bank of China (Malaysia) Berhad`");
  assert.equal(t.lostAllCaps.length, 0, "all-caps names survive — the mechanism is case-sensitive");
  assert.equal(t.lostLowercase.length, 0, "all-lowercase OCR renderings survive too");
});

test("THE STRUCTURAL REASON: the class survives RE-CASING, so (A) closes a casing, not a class", () => {
  const t = measurePathA();
  assert.equal(t.allCapsClosed, 0, "0 of the constructed forms close once printed ALL-CAPS");
  assert.ok(t.allCapsCandidates > 0, "…and they are still live candidates in that casing");
  // Malaysian invoices commonly print all-caps, so this is the operative shape, not a corner.
  assert.equal(caseDiscontinuity("A DIVISION OF AMATERUS GROUP SDN BHD"), false);
  assert.equal(caseDiscontinuity("A division of AMATERUS GROUP SDN BHD"), true);
  assert.equal(shippedCandidate("A DIVISION OF AMATERUS GROUP SDN BHD"), true, "and it remains a candidate today");
});
