// 0042 Wave D-b — the ADJUSTMENT-TEMPLATE battery, part 1c: the CANONICAL LINE SET
// (ABI §C) as it USED TO BE reachable through the ABI's own doors, and why it never is again.
//
// [#927, riders wave 3] `clara.propose_adjustment_template` is RETIRED: a typed refusal now
// fires before ANY argument is even looked at, so the two admissible line spellings this file
// used to drive all the way to an APPROVED occurrence and to an auto-post (ABI §C's zero-side
// OMITTED and zero-side EXPLICIT forms; see migration 0140's history and the as-built ladder
// this file's own git history records) are unreachable code from here on — `clara._adj_canon_
// lines` and `clara._adj_template_hash` are never invoked by any human caller of propose again.
//
// WHAT THIS FILE PROVES NOW, having lost the thing it originally proved. The one regression this
// retirement could plausibly reintroduce is a PARTIAL one: a future "fix" that resurrects some of
// propose's old validation for one shape while leaving the refusal in place for another — exactly
// the class of half-true behaviour the two admissible spellings existed to catch a divergence
// between in the first place. So this file keeps proving the ONE thing that still needs proving:
// the retirement refusal is UNCONDITIONAL on line shape, firing identically for the omitted-zero
// spelling that once bricked itself (x42.k1's original subject) and the explicit-zero spelling
// (x42.k2's), never reaching canonicalisation or the duplicate wall for either one.
//
// CONTRACT-BLIND (see the x42-adj-core.mjs header): authored from
// docs/plan/completed/wave-d-b-design.md §2.1/§2.3/§2.6 + -abi.md §A/§C/§F, and from migration
// 0282's own header (#927) for the retirement shape.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  endPool, printLaneNotes, printSkipCount,
  x42EnsureReady, skip42, skip42Retired, refuses,
  T, CLR10, EXPA, ACCR,
  proposeTemplate,
  adjWorld, freshAdjClient, templateRows,
} from "./x42-adj-helpers.mjs";

let live = false;
let w = null;

before(async () => {
  live = await x42EnsureReady();
  if (live) w = await adjWorld();
});

after(async () => {
  printLaneNotes("x42-adj-canon");
  printSkipCount("x42-adj-canon");
  await endPool();
});

const skipHere = (t) => skip42(t, live, "the Wave-D-b canonical-line battery");

/** The ABI §C line shape written in its NATURAL spelling: each row carries ONLY the side it
 *  charges. Pre-#927 this was a first-class input propose_adjustment_template admitted (§C
 *  marks neither money key required); it is kept here verbatim as the SHAPE, not as evidence
 *  the door still reads it — the retirement cell below proves it does not. */
const omittedZeroLines = (cents, { debit = EXPA, credit = ACCR } = {}) => [
  { account_code: debit, debit_cents: cents, description: "accrued charge" },
  { account_code: credit, credit_cents: cents, description: "accrual" },
];

/** The SAME template, spelled with both money keys present. Byte-different JSON from the
 *  spelling above — pre-#927 this was what the canonical normaliser existed to converge with
 *  the omitted form; both are now equally unreachable. */
const explicitZeroLines = (cents, { debit = EXPA, credit = ACCR } = {}) => [
  { account_code: debit, debit_cents: cents, credit_cents: 0, description: "accrued charge" },
  { account_code: credit, debit_cents: 0, credit_cents: cents, description: "accrual" },
];

test("x42.k1 propose_adjustment_template's retirement refusal is unconditional on line shape: the omitted-zero spelling that once bricked itself and the explicit-zero spelling both refuse identically, before ever reaching canonicalisation or the duplicate wall, and write nothing", async (t) => {
  if (skipHere(t)) return;
  if (await skip42Retired(t, "the propose-retirement-is-unconditional-on-shape cell")) return;
  const cents = 120_000;

  for (const [label, lines] of [
    ["the OMITTED-zero spelling (ABI §C, the shape this file's own history bricked)", omittedZeroLines(cents)],
    ["the EXPLICIT-zero spelling (every other x42 fixture's own shape)", explicitZeroLines(cents)],
  ]) {
    const client = await freshAdjClient("k1");
    const err = await refuses(() => proposeTemplate(w.users.bob, {
      client, name: "x42 k1 retired", cadence: "monthly", start: "2026-07-01", end: null,
      autoReverse: false, lines, memo: "x42 k1",
    }), T.adjustmentTemplateLaneRetired, `proposing with ${label}`, { code: CLR10 });
    assert.match(err.message, /accounting plan/i, `${label}: the message still points at the surviving lane`);
    assert.equal((await templateRows(client)).length, 0,
      `${label}: no half-born template row survives — the door never reached the canon or the duplicate wall`);
  }
});
