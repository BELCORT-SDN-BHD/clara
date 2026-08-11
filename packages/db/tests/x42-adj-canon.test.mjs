// 0042 Wave D-b — the ADJUSTMENT-TEMPLATE battery, part 1c: the CANONICAL LINE SET
// (ABI §C) as it is actually reachable through the ABI's own doors.
//
// WHY THIS FILE EXISTS. ABI §C states the template line shape as
// `[{account_code, debit_cents, credit_cents, description?}]` and
// `propose_adjustment_template` ACCEPTS a line whose ZERO side is simply OMITTED — that
// is the spelling a human at psql, an agent composing JSON, or any caller reading the
// ABI literally will naturally write. Every OTHER x42 fixture (and the dashboard's own
// template panel) writes explicit zeros, so the whole battery only ever exercised ONE of
// the two admissible spellings — and the as-built ladder found that the other one was
// bricked for life: the canonical normaliser left the omitted side JSON `null` while the
// occurrence's own `journal_lines` (NOT NULL money columns) stored 0, so arm (2d)'s
// byte-equality axis refused EVERY occurrence with CLR39 adjustment_stale /
// `lines_changed` when nothing had changed, the ramp could never be earned, and the same
// asymmetry hid a genuine content-hash twin from both duplicate walls.
//
// The cells here therefore drive the OMITTED spelling all the way to an APPROVED
// occurrence and to an auto-post, and pin the two spellings as ONE template.
// Split out of `x42-adjustments.test.mjs` only because the repo enforces a 500-line file
// ceiling; `node --test tests/` discovers this file automatically.
//
// CONTRACT-BLIND (see the x42-adj-core.mjs header): authored from
// docs/plan/completed/wave-d-b-design.md §2.1/§2.3/§2.6 + -abi.md §A/§C/§F ONLY.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  endPool, printLaneNotes, printSkipCount, noteLane,
  x42EnsureReady, skip42, refuses, T, CLR10,
  EXPA, ACCR, mon, uniqTag, expectedMode, signedOnMyt, rampClock,
  proposeTemplate, runManual,
  adjWorld, freshAdjClient, liveTemplate, approveDraft,
  templateRow, templateRows, entryRowOf, entryLinesOf, receiptForEntry,
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

/** The ABI §C line shape written in its NATURAL spelling: each row carries ONLY the side
 *  it charges. `propose_adjustment_template` admits it (§C marks neither money key
 *  required, and the validator reads both legs through a coalesce), so it is a first-class
 *  input, not a tolerated malformation. */
const omittedZeroLines = (cents, { debit = EXPA, credit = ACCR } = {}) => [
  { account_code: debit, debit_cents: cents, description: "accrued charge" },
  { account_code: credit, credit_cents: cents, description: "accrual" },
];

/** The SAME template, spelled with both money keys present. Byte-different JSON, one
 *  template — which is exactly what the canonical normaliser is for. */
const explicitZeroLines = (cents, { debit = EXPA, credit = ACCR } = {}) => [
  { account_code: debit, debit_cents: cents, credit_cents: 0, description: "accrued charge" },
  { account_code: credit, debit_cents: 0, credit_cents: cents, description: "accrual" },
];

test("x42.k1 a template proposed in the ABI §C spelling with the ZERO SIDE OMITTED is a fully usable template: it stores both money legs as numbers, its occurrence APPROVES (arm (2d) does not fire), and its ramp is earnable to an auto-post", async (t) => {
  if (skipHere(t)) return;
  const client = await freshAdjClient("k1");
  const cents = 120_000;

  // SURGERY 1 (the helper header): the signature is moved before mon(-4) so the periods
  // under test are NOT catch-up and the ramp's auto-post branch is reachable at all —
  // the branch a bricked template can never demonstrate.
  const tpl = await liveTemplate({
    client, label: "k1", start: mon(-4).start, cents,
    lines: omittedZeroLines(cents), backdateSignTo: mon(-5).end });
  const signedOn = await signedOnMyt(tpl.id);

  // (a) THE STORED CANON. ABI §C's shape names BOTH money keys, so the normalised line the
  // template carries must carry both — as NUMBERS. A JSON `null` here is the whole defect:
  // `journal_lines.debit_cents` / `.credit_cents` are NOT NULL, so a null-sided canon can
  // never byte-equal the very entry the poster writes from it.
  const stored = (await templateRow(tpl.id)).lines;
  assert.equal(stored.length, 2, "the stored canon has one row per proposed line");
  for (const l of stored) {
    assert.equal(typeof l.debit_cents, "number",
      `the canon states debit_cents as a NUMBER on every row (got ${JSON.stringify(l)})`);
    assert.equal(typeof l.credit_cents, "number",
      `…and credit_cents likewise (got ${JSON.stringify(l)})`);
  }
  assert.deepEqual(
    stored.map((l) => [l.account_code, l.debit_cents, l.credit_cents]),
    [[EXPA, cents, 0], [ACCR, 0, cents]],
    "…the omitted side normalising to 0, in the caller's own array order (ABI §C)");

  // (b) THE OCCURRENCE APPROVES. #1 always drafts (the one-time ramp), so this approval is
  // exactly the path arm (2d)'s byte-equality axis guards — and it must PASS, because
  // nothing changed between the run and the approval.
  const p1 = mon(-4);
  const r1 = await runManual(w.users.bob, {
    client, template: tpl.id, periodStart: p1.start, periodEnd: p1.end });
  assert.equal(r1.status, "drafted", "occurrence #1 ALWAYS drafts — the one-time ramp (WD-R8)");
  await approveDraft(w.users.alice, r1.entry_id);
  const e1 = await entryRowOf(r1.entry_id);
  assert.equal(e1.status, "approved",
    "the occurrence of an omitted-zero template APPROVES — arm (2d) must not read the template's own lines as changed");
  assert.ok(await receiptForEntry(r1.entry_id), "…and the approval minted its adjustment_runs receipt");
  assert.deepEqual(
    (await entryLinesOf(r1.entry_id)).map((l) => [l.line_no, l.account_code, Number(l.debit_cents), Number(l.credit_cents)]),
    [[1, EXPA, cents, 0], [2, ACCR, 0, cents]],
    "…and the posted lines carry the charge on the side the template named, to the sen");

  // (c) THE RAMP IS EARNABLE. A template whose occurrences can never approve can never earn
  // autonomy either, so the auto-post is the honest end-to-end proof.
  assert.equal((await rampClock(tpl.id)).earned, true, "an approved un-reversed occurrence earns autonomy");
  const p2 = mon(-3);
  assert.equal(expectedMode({ periodEnd: p2.end, signedOn, rampEarned: true, highStakes: false }), "post",
    "the fixture really reaches the non-catch-up branch (the design's own mode predicate)");
  const r2 = await runManual(w.users.bob, {
    client, template: tpl.id, periodStart: p2.start, periodEnd: p2.end });
  assert.equal(r2.status, "posted", "occurrence #2 AUTO-POSTS — the ramp an omitted-zero template can also earn");
  assert.equal((await entryRowOf(r2.entry_id)).status, "approved",
    "…approved inside the poster's own transaction, arm (2d) clear again");
});

test("x42.k2 the two admissible spellings of ONE template are ONE template: an omitted-zero twin of an explicit-zero proposal refuses template_duplicate on the SAME content_hash, in both directions", async (t) => {
  if (skipHere(t)) return;
  const cents = 90_000;

  // The content hash covers {name, cadence, start_date, end_date, auto_reverse, lines,
  // memo_template} (design §2.1), so the twin must be identical in every one of the seven —
  // only the LINE SPELLING may differ, or the cell would prove nothing about the canon.
  const specOf = (client) => ({
    client, name: `x42 k2 ${uniqTag()}`, cadence: "monthly", start: mon(-3).start,
    end: null, autoReverse: false, memo: "x42 k2",
  });
  const hashOfDuplicateRefusal = (err) =>
    /"content_hash"\s*:\s*"([0-9a-f]+)"/.exec(String(err?.detail ?? ""))?.[1] ?? null;

  // EXPLICIT first, OMITTED second.
  const c1 = await freshAdjClient("k2a");
  const spec1 = specOf(c1);
  const first = await proposeTemplate(w.users.bob, { ...spec1, lines: explicitZeroLines(cents) });
  const err1 = await refuses(
    () => proposeTemplate(w.users.bob, { ...spec1, lines: omittedZeroLines(cents) }),
    T.templateDuplicate,
    "the SAME template re-proposed with its zero sides OMITTED", { code: CLR10 });
  assert.equal(hashOfDuplicateRefusal(err1), first.content_hash,
    "…colliding on the very content_hash the explicit-zero spelling produced (ABI §C: ONE canon)");
  assert.equal((await templateRows(c1)).length, 1, "…and no twin row was written");

  // OMITTED first, EXPLICIT second — the duplicate wall is a property of the canon, not of
  // which spelling happened to arrive first.
  const c2 = await freshAdjClient("k2b");
  const spec2 = specOf(c2);
  const omittedFirst = await proposeTemplate(w.users.bob, { ...spec2, lines: omittedZeroLines(cents) });
  const err2 = await refuses(
    () => proposeTemplate(w.users.bob, { ...spec2, lines: explicitZeroLines(cents) }),
    T.templateDuplicate,
    "the SAME template re-proposed with its zero sides STATED", { code: CLR10 });
  assert.equal(hashOfDuplicateRefusal(err2), omittedFirst.content_hash,
    "…the hash is spelling-independent in this direction too");
  assert.equal((await templateRows(c2)).length, 1, "…and again nothing half-born survives");

  noteLane(`x42.k2 content_hash is spelling-independent (omitted vs explicit zero legs): ${first.content_hash.slice(0, 12)}…`);
});
