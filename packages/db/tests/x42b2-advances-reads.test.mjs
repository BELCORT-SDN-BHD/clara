// ===========================================================================
// [WAVE D-b SPLIT — D-b2 (0045, recurring adjustments — ships LAST)] A FORK OF `x42-advances-reads.test.mjs`.
//
// THE SPLIT MOVES CELLS; IT NEVER EDITS THEM. Every `test(...)` block below is
// byte-for-byte the block of the same name in x42-advances-reads.test.mjs; the prologue
// (imports, world builder, before/after, module-level helpers) is byte-for-byte the
// original's (bar any substitution named below) and is shared by every fork of this
// file. The ONLY authored bytes in this file are this banner.
//
// CELLS HERE (1): x42v.f1
// CELLS IN THE SIBLING FORK(S): b1 → D-b1
//
// WHY THIS CUT: measured, not argued — each cell here is green on clara_f1_b0132 (… + 0045)
// and its subject is shipped by that slice. The sibling cells stay red until their
// own slice ships; keeping them in one file is what would make a slice's CI red for
// a reason that has nothing to do with the slice.
//
// AT MERGE: this fork REPLACES its share of the original — the original file is
// deleted in the FIRST slice PR that lands a fork of it, and every fork of
// x42-advances-reads.test.mjs lands with its own slice.
// ===========================================================================
// 0042 Wave D-b — the STAFF-ADVANCE battery, part 2: APPLICATIONS (design §3.3, the
// WCA-R7 branch) · THE READ SURFACE (§3.4: summary · statement · tie) · THE
// `revise_entry` PROPOSAL WALL · THE FLOORS.
//
// CONTRACT-BLIND (see the x42-adv-helpers.mjs header). Split out of
// x42-advances.test.mjs only because the repo enforces a 500-line file ceiling;
// `node --test tests/` discovers both automatically.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  opk, endPool, printLaneNotes, printSkipCount, noteLane, idOf, assertRaises,
  x42EnsureReady, skip42, refusesWith, caught, T, E, EA1955_FACTS,
  HIGH_STAKES_CENTS, ADV1, ADV2, ADV3, BANKV, WAGES, OTHERV, mon, dayIn, today, dayDiff,
  advWorld, freshAdvClient, enrolHere, retireAdvance, approvedEntry, approveDraft, disburse,
  applyToAdvance, bookApplication, applicationLines, advanceSummary, advanceStatement,
  advanceTie, rowsBy, numOf, advanceRows, advanceRow, applicationRows, applicationRowsOf,
  entryRowOf, entryLinesOf, glNet, outstandingAt, mirrorIdOf, reverseEntry, reviseEntry,
} from "./x42-adv-world.mjs";

let live = false;
let w = null;

before(async () => {
  live = await x42EnsureReady();
  if (live) w = await advWorld();
});

after(async () => {
  printLaneNotes("x42-advances-reads");
  printSkipCount("x42-advances-reads");
  await endPool();
});

const skipHere = (t) => skip42(t, live, "the Wave-D-b application/read battery");

/** Reverse an entry and settle its mirror (the mirror drafts when high-stakes). */
async function reverseAndSettle(sub, { entry, reason }) {
  await reverseEntry(sub, { entry, reason, opKey: opk("x42rrev") });
  const mirror = await mirrorIdOf(entry);
  assert.ok(mirror, `reverse_entry minted a mirror for ${entry}`);
  if ((await entryRowOf(mirror)).status === "draft") await approveDraft(mirror, { maker: sub });
  return mirror;
}

/** Assert `staff_advance_tie` reads exactly zero on every row, and hand back the rows. */
async function assertTieAtZero(client, asOf, label) {
  const payload = await advanceTie(w.users.alice, client, asOf);
  const rows = rowsBy(payload, "account_code", `staff_advance_tie (${label})`);
  assert.ok(rows.length >= 1, `${label}: the tie reports at least one account row at ${asOf}`);
  for (const r of rows) {
    const reg = numOf(r, /^register_cents$/, `${label} tie row ${r.account_code}`);
    const gl = numOf(r, /^gl_cents$/, `${label} tie row ${r.account_code}`);
    const diff = numOf(r, /^difference_cents$/, `${label} tie row ${r.account_code}`);
    assert.equal(diff, 0, `${label}: ${r.account_code} ties to the sen at ${asOf} (register ${reg} vs GL ${gl})`);
    assert.equal(reg - gl, 0, `${label}: …and the difference really is register − GL, recomputed`);
  }
  return rows;
}

// ===========================================================================
// x42v.f — THE PROPOSAL WALL + THE FLOORS.
// ===========================================================================

test("x42v.f1 revise_entry refuses a draft carrying the staff_advance_application proposal flag (CLR10 proposal_not_revisable) — the draft may only be approved or withdrawn", async (t) => {
  if (skipHere(t)) return;
  const { client } = await freshAdvClient("f1");
  const hs = (await disburse({ client, cents: HIGH_STAKES_CENTS + 400_000, postingDate: dayIn(mon(-3), 2) })).advance;
  const cents = HIGH_STAKES_CENTS + 100_000;
  const drafted = await bookApplication(w.users.bob, {
    client, postingDate: dayIn(mon(-2), 6),
    lines: applicationLines(ADV1, cents, { counter: BANKV }),
    allocations: [{ line_no: 2, advance_id: hs.id, amount_cents: cents }],
    kind: "bank_return", reason: "x42 f1 high stakes",
  });
  assert.equal(drafted.status, "drafted", "mandatory setup: the high-stakes application drafted");
  const entry = idOf(drafted, "entry_id", "id");
  const row = await entryRowOf(entry);
  assert.ok(row.flags && row.flags.staff_advance_application,
    `mandatory setup: the draft carries the named flags key (got ${JSON.stringify(row.flags)})`);
  const flag = row.flags.staff_advance_application;
  assert.equal(flag.kind, "bank_return", "the flags payload carries the proposal kind (ABI §B)");
  assert.equal(flag.reason, "x42 f1 high stakes", "…the reason");
  assert.deepEqual(flag.allocations, [{ line_no: 2, advance_id: hs.id, amount_cents: cents }],
    "…and the allocations verbatim");

  await refusesWith(() => reviseEntry(w.users.bob, {
    entry, lines: applicationLines(ADV1, cents - 1, { counter: BANKV }), expectedRevision: row.revision_token,
  }), E.badRequest, T.proposalNotRevisable, "revising a draft that carries a D-b proposal flag");
  assert.equal((await entryRowOf(entry)).status, "draft", "…the draft is untouched");
  assert.equal((await applicationRowsOf(hs.id)).length, 0, "…and no register row was minted by the attempt");
});
