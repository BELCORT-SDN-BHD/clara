// ===========================================================================
// [WAVE D-b SPLIT — D-b1 (0043, staff advances)] A FORK OF `x42-advances-reads.test.mjs`.
//
// THE SPLIT MOVES CELLS; IT NEVER EDITS THEM. Every `test(...)` block below is
// byte-for-byte the block of the same name in x42-advances-reads.test.mjs; the prologue
// (imports, world builder, before/after, module-level helpers) is byte-for-byte the
// original's (bar any substitution named below) and is shared by every fork of this
// file. The ONLY authored bytes in this file are this banner.
//
// CELLS HERE (9): x42v.a1, x42v.a2, x42v.a3, x42v.a4, x42v.a5, x42v.s1, x42v.s2, x42v.s3, x42v.f2
// CELLS IN THE SIBLING FORK(S): b2 → D-b2
//
// WHY THIS CUT: measured, not argued — each cell here is green on clara_f1_b01 (… + 0043)
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

// ===========================================================================
// x42v.a — APPLICATIONS (book_staff_advance_application; ABI §A/§B).
// ===========================================================================

test("x42v.a1 the three proposal kinds and the WCA-R7 branch: a routine application POSTS with its application_ids; a high-stakes one DRAFTS with none, and the rows mint at APPROVE", async (t) => {
  if (skipHere(t)) return;
  const { client } = await freshAdvClient("a1");
  const m = mon(-3);

  // The three kinds, each on its own advance, each below the high-stakes floor.
  const counters = { payroll_deduction: WAGES, bank_return: BANKV, claim: OTHERV };
  for (const [kind, counter] of Object.entries(counters)) {
    const { advance } = await disburse({ client, cents: 40_000, postingDate: dayIn(m, 3) });
    const out = await applyToAdvance(w.users.bob, {
      client, advance: advance.id, cents: 40_000, postingDate: dayIn(mon(-2), 7), kind, counter,
    });
    assert.equal(out.receipt.status, "posted", `a routine '${kind}' application POSTS in one act (WCA-R7)`);
    const ids = out.receipt.application_ids;
    assert.ok(Array.isArray(ids) && ids.length === 1,
      `…and its envelope names the ONE application row it minted (got ${JSON.stringify(out.receipt)})`);
    const row = (await applicationRowsOf(advance.id))[0];
    assert.equal(row.id, ids[0], "…the very row the envelope named");
    assert.equal(row.kind, kind, `…stamped kind '${kind}'`);
    assert.equal(row.reason, "x42 rig application", "…carrying the caller's reason verbatim");
    assert.equal(row.reverses_application_id, null, "…and it is a leaf, not a correction");
    assert.equal(await outstandingAt(advance.id, today()), 0, `…the '${kind}' advance is fully applied`);
  }

  // The high-stakes branch: DRAFTS, mints nothing, and the rows appear at approve.
  const hs = await disburse({ client, cents: HIGH_STAKES_CENTS + 500_000, postingDate: dayIn(m, 4) });
  const drafted = await bookApplication(w.users.bob, {
    client, postingDate: dayIn(mon(-2), 11),
    lines: applicationLines(ADV1, HIGH_STAKES_CENTS + 200_000, { counter: BANKV }),
    allocations: [{ line_no: 2, advance_id: hs.advance.id, amount_cents: HIGH_STAKES_CENTS + 200_000 }],
    kind: "bank_return", reason: "x42 a1 high stakes",
  });
  assert.equal(drafted.status, "drafted", "an application above the firm's high-stakes floor DRAFTS for a distinct checker");
  assert.deepEqual(drafted.application_ids, [],
    `…and its envelope carries an EMPTY application_ids (rows mint at APPROVE) — got ${JSON.stringify(drafted)}`);
  const draftEntry = idOf(drafted, "entry_id", "id");
  assert.equal((await entryRowOf(draftEntry)).status, "draft", "…the entry really is a draft");
  assert.equal((await applicationRowsOf(hs.advance.id)).length, 0, "…and NO application row exists yet");

  await approveDraft(draftEntry, { maker: w.users.bob });
  const born = await applicationRowsOf(hs.advance.id);
  assert.equal(born.length, 1, "the checker's approval mints exactly ONE application row");
  assert.equal(born[0].entry_id, draftEntry, "…bound to the approved entry");
  assert.equal(Number(born[0].amount_cents), HIGH_STAKES_CENTS + 200_000, "…for the allocated amount");
});

test("x42v.a2 allocation arithmetic: partial + repeated applications, ONE entry spanning MULTIPLE advances by line_no, and coverage equality on every credit leg", async (t) => {
  if (skipHere(t)) return;
  const { client } = await freshAdvClient("a2");
  const m = mon(-4);
  const a = (await disburse({ client, cents: 100_000, postingDate: dayIn(m, 3) })).advance;
  const b = (await disburse({ client, cents: 80_000, postingDate: dayIn(m, 4) })).advance;

  // Partial, then a second partial on the SAME advance.
  await applyToAdvance(w.users.bob, { client, advance: a.id, cents: 30_000, postingDate: dayIn(mon(-3), 2) });
  await applyToAdvance(w.users.bob, { client, advance: a.id, cents: 25_000, postingDate: dayIn(mon(-3), 20) });
  assert.equal(await outstandingAt(a.id, today()), 45_000, "two partial applications leave the remainder outstanding (100,000 − 55,000)");
  assert.equal((await applicationRowsOf(a.id)).length, 2, "…as two independent append-only rows");

  // ONE entry, ONE credit leg, TWO advances — allocations keyed by line_no.
  const receipt = await bookApplication(w.users.bob, {
    client, postingDate: dayIn(mon(-2), 5), memo: "x42 a2 combined recovery",
    lines: applicationLines(ADV1, 70_000, { counter: BANKV }),
    allocations: [
      { line_no: 2, advance_id: a.id, amount_cents: 45_000 },
      { line_no: 2, advance_id: b.id, amount_cents: 25_000 },
    ],
    kind: "bank_return", reason: "x42 a2 combined",
  });
  assert.equal(receipt.status, "posted", "the combined application posts (below the high-stakes floor)");
  assert.equal(receipt.application_ids.length, 2, "…minting ONE row per allocation");
  assert.equal(await outstandingAt(a.id, today()), 0, "…advance A is now fully applied");
  assert.equal(await outstandingAt(b.id, today()), 55_000, "…and advance B carries its own remainder (80,000 − 25,000)");
  const combined = idOf(receipt, "entry_id", "id");
  const leg = (await entryLinesOf(combined)).find((l) => l.account_code === ADV1);
  for (const row of (await applicationRows(client)).filter((r) => r.entry_id === combined)) {
    assert.equal(row.application_line_id, leg.id, "every row born of the combined entry names THE credit LINE it allocates");
  }

  // Coverage equality: the per-line allocation Σ must equal the leg exactly.
  //
  // [INTEGRATION ADJUDICATION — test_defect] Both arms below pinned `codes: [CLR39, CLR10]`
  // and the build answers CLR40 `advance_application_missing`. The build is right and the
  // guess was wrong: ABI §F has exactly one row for this defect — "the belt: uncovered credit
  // leg | CLR40 | advance_application_missing" — and an under- or over-allocated credit leg IS
  // that defect, caught at propose/approve instead of at commit. §F pins no separate token for
  // coverage equality precisely because it is not a separate defect: same cause, same remedy
  // ("state the allocations that add up to the credit"). Pinned by errcode AND token now,
  // which is strictly stronger than the SQLSTATE-class guess it replaces.
  const c = (await disburse({ client, cents: 50_000, postingDate: dayIn(m, 6) })).advance;
  await refusesWith(() => bookApplication(w.users.bob, {
    client, postingDate: dayIn(mon(-2), 9),
    lines: applicationLines(ADV1, 40_000, { counter: BANKV }),
    allocations: [{ line_no: 2, advance_id: c.id, amount_cents: 30_000 }],
    kind: "bank_return", reason: "x42 a2 under-covered",
  }), E.belt, T.advanceApplicationMissing,
  "an application leaving 10,000 of its credit leg UNALLOCATED (coverage equality)");
  await refusesWith(() => bookApplication(w.users.bob, {
    client, postingDate: dayIn(mon(-2), 9),
    lines: applicationLines(ADV1, 40_000, { counter: BANKV }),
    allocations: [{ line_no: 2, advance_id: c.id, amount_cents: 45_000 }],
    kind: "bank_return", reason: "x42 a2 over-covered",
  }), E.belt, T.advanceApplicationMissing,
  "an application allocating MORE than its credit leg carries");
  assert.equal(await outstandingAt(c.id, today()), 50_000, "…and neither refusal touched the advance");
});

test("x42v.a3 over-application refuses CLR39 advance_over_application — sequentially AND under a two-session race (sorted advance row locks)", async (t) => {
  if (skipHere(t)) return;
  const { client } = await freshAdvClient("a3");
  const m = mon(-3);
  const a = (await disburse({ client, cents: 100_000, postingDate: dayIn(m, 2) })).advance;

  await refusesWith(() => applyToAdvance(w.users.bob, {
    client, advance: a.id, cents: 100_001, postingDate: dayIn(mon(-2), 3),
  }), E.adv, T.advanceOverApplication, "applying one sen more than the advance ever was");

  await applyToAdvance(w.users.bob, { client, advance: a.id, cents: 60_000, postingDate: dayIn(mon(-2), 3) });
  await refusesWith(() => applyToAdvance(w.users.bob, {
    client, advance: a.id, cents: 40_001, postingDate: dayIn(mon(-2), 12),
  }), E.adv, T.advanceOverApplication, "applying past the REMAINING outstanding (100,000 − 60,000)");
  assert.equal(await outstandingAt(a.id, today()), 40_000, "…the remainder is untouched by the refusal");

  // The race: two applications that individually fit and together do not.
  const b = (await disburse({ client, cents: 100_000, postingDate: dayIn(m, 5) })).advance;
  const shot = () => applyToAdvance(w.users.bob, {
    client, advance: b.id, cents: 60_000, postingDate: dayIn(mon(-2), 20),
  });
  const results = await Promise.allSettled([shot(), shot()]);
  const won = results.filter((r) => r.status === "fulfilled");
  const lost = results.filter((r) => r.status === "rejected");
  assert.equal(won.length, 1,
    `exactly ONE of two racing 60,000 applications against a 100,000 advance survives (got ${won.length})`);
  assert.equal(lost.length, 1, "…and exactly one is refused");
  assert.equal(/"reason"\s*:\s*"([a-z0-9_]+)"/.exec(String(lost[0].reason?.detail ?? ""))?.[1],
    T.advanceOverApplication, `…by name (got ${lost[0].reason?.detail ?? lost[0].reason?.message})`);
  assert.equal(lost[0].reason?.code, E.adv, "…with ABI §F's SQLSTATE");
  assert.equal(await outstandingAt(b.id, today()), 40_000, "…and the register reflects exactly ONE application");
});

test("x42v.a4 an application dated before its advance was issued refuses CLR39 application_predates_advance; the issue date itself is admissible", async (t) => {
  if (skipHere(t)) return;
  const { client } = await freshAdvClient("a4");
  const issue = dayIn(mon(-2), 10);
  const a = (await disburse({ client, cents: 50_000, postingDate: issue })).advance;

  await refusesWith(() => applyToAdvance(w.users.bob, {
    client, advance: a.id, cents: 10_000, postingDate: dayIn(mon(-3), 5),
  }), E.adv, T.applicationPredatesAdvance, "an application dated a MONTH before the advance was issued");
  await refusesWith(() => applyToAdvance(w.users.bob, {
    client, advance: a.id, cents: 10_000, postingDate: dayIn(mon(-2), 9),
  }), E.adv, T.applicationPredatesAdvance, "an application dated ONE DAY before the advance was issued");

  const sameDay = await applyToAdvance(w.users.bob, { client, advance: a.id, cents: 10_000, postingDate: issue });
  assert.equal(sameDay.receipt.status, "posted", "an application dated ON the issue date is admissible (the boundary is not a predate)");
  assert.equal(await outstandingAt(a.id, issue), 40_000, "…and it takes effect from that very date");
});

test("x42v.a5 effective_date is HOOK-DERIVED from the entry's posting_date — never the transaction date, on both the posted and the drafted branch", async (t) => {
  if (skipHere(t)) return;
  const { client } = await freshAdvClient("a5");
  const a = (await disburse({ client, cents: 90_000, postingDate: dayIn(mon(-4), 2) })).advance;

  const postingDate = dayIn(mon(-3), 17);
  const posted = await applyToAdvance(w.users.bob, { client, advance: a.id, cents: 20_000, postingDate });
  const row = (await applicationRowsOf(a.id)).find((r) => r.entry_id === posted.entryId);
  assert.equal(row.effective_date, postingDate, "the posted branch stamps effective_date = the entry's posting_date");
  assert.notEqual(row.effective_date, today(), "…and NOT the MYT transaction date (a backdated act is dated where it belongs)");
  assert.equal((await entryRowOf(posted.entryId)).posting_date, postingDate, "…which is the entry's own posting_date");

  // The drafted branch: the row is minted at approve, but still dated at the DRAFT's
  // posting_date — approval time never leaks into the accounting date.
  const hs = (await disburse({ client, cents: HIGH_STAKES_CENTS + 300_000, postingDate: dayIn(mon(-4), 3) })).advance;
  const hsDate = dayIn(mon(-3), 21);
  const drafted = await applyToAdvance(w.users.bob, {
    client, advance: hs.id, cents: HIGH_STAKES_CENTS + 100_000, postingDate: hsDate, counter: BANKV, kind: "bank_return",
  });
  assert.equal(drafted.mode, "drafted", "mandatory setup: the high-stakes application drafted");
  const hsRow = (await applicationRowsOf(hs.id))[0];
  assert.equal(hsRow.effective_date, hsDate, "the drafted branch dates its row at the DRAFT's posting_date, not the approval moment");
});

// ===========================================================================
// x42v.s — THE READ SURFACE (design §3.4; ABI §A row schemas).
// ===========================================================================

test("x42v.s1 staff_advance_summary: per-advance outstanding + days_outstanding + the voided flag, with the three EA-1955 policy notes riding the envelope", async (t) => {
  if (skipHere(t)) return;
  const { client, enrolment } = await freshAdvClient("s1", { personLabel: "S. Ummary" });
  const issue = dayIn(mon(-3), 7);
  const a = (await disburse({ client, cents: 90_000, postingDate: issue })).advance;
  await applyToAdvance(w.users.bob, { client, advance: a.id, cents: 25_000, postingDate: dayIn(mon(-2), 4) });
  const b = (await disburse({ client, cents: 30_000, postingDate: dayIn(mon(-3), 9) })).advance;
  await reverseAndSettle(w.users.alice, { entry: b.entry_id, reason: "x42 s1 paid the wrong person" });

  const asOf = today();
  const payload = await advanceSummary(w.users.alice, client, asOf);
  const rows = rowsBy(payload, "advance_id", "staff_advance_summary");
  const ra = rows.find((r) => r.advance_id === a.id);
  const rb = rows.find((r) => r.advance_id === b.id);
  assert.ok(ra && rb, `both advances are projected (got ${rows.length} row(s))`);

  assert.equal(ra.enrolment_id, enrolment, "the row names the enrolment generation");
  assert.equal(ra.account_code, ADV1, "…its account code");
  assert.equal(ra.person_label, "S. Ummary", "…and the person label the enrolment attested");
  assert.equal(ra.issue_date, issue, "…the issue date");
  assert.equal(numOf(ra, /^amount_cents$/, "the summary row"), 90_000, "…the amount as disbursed");
  assert.equal(numOf(ra, /^outstanding_cents$/, "the summary row"), 65_000, "…and the DERIVED outstanding (90,000 − 25,000)");
  assert.equal(numOf(ra, /^days_outstanding$/, "the summary row"), dayDiff(issue, asOf),
    "days_outstanding is the age at the as-of, derived — never stored");
  assert.equal(ra.voided, false, "a live advance is not voided");

  assert.equal(rb.voided, true, "a reversed disbursement is flagged voided");
  assert.equal(numOf(rb, /^outstanding_cents$/, "the voided summary row"), 0,
    "…and its outstanding unwinds to zero at the void's effective date");
  assert.equal(await outstandingAt(b.id, asOf), 0, "…matching the independently-rebuilt equation");

  const notes = rowsBy(payload, "fact", "staff_advance_summary.policy_notes");
  for (const fact of EA1955_FACTS) {
    const n = notes.find((x) => x.fact === fact);
    assert.ok(n, `the envelope surfaces the '${fact}' EA-1955 note (ABI §A) — got ${notes.map((x) => x.fact).join(",")}`);
    assert.ok(String(n.note ?? "").trim().length > 0, `…with its note text (${fact})`);
    assert.ok(/EA 1955/.test(String(n.source_note ?? "")), `…and its primary-source citation (${fact})`);
  }
});

test("x42v.s2 staff_advance_statement: one running_cents chain per account code across disbursement · application · void", async (t) => {
  if (skipHere(t)) return;
  const { client } = await freshAdvClient("s2");
  const a = (await disburse({ client, cents: 100_000, postingDate: dayIn(mon(-4), 5) })).advance;
  const b = (await disburse({ client, cents: 30_000, postingDate: dayIn(mon(-4), 9) })).advance;
  await applyToAdvance(w.users.bob, { client, advance: a.id, cents: 40_000, postingDate: dayIn(mon(-3), 8) });
  await applyToAdvance(w.users.bob, { client, advance: a.id, cents: 20_000, postingDate: dayIn(mon(-2), 8) });
  await reverseAndSettle(w.users.alice, { entry: b.entry_id, reason: "x42 s2 void the second float" });

  const payload = await advanceStatement(w.users.alice, client, ADV1, mon(-5).start, today());
  const rows = rowsBy(payload, "kind", "staff_advance_statement");
  assert.equal(rows.length, 5, `the statement carries every movement: 2 disbursements, 2 applications, 1 void (got ${rows.length})`);

  let run = 0;
  for (const r of rows) {
    assert.ok(["disbursement", "application", "void"].includes(r.kind), `row kind '${r.kind}' is one of the three (ABI §A)`);
    assert.ok(r.entry_id, `…and every row names the entry that moved it (${r.kind})`);
    const amt = Math.abs(numOf(r, /^amount_cents$/, `the '${r.kind}' statement row`));
    run += r.kind === "disbursement" ? amt : -amt;
    assert.equal(numOf(r, /^running_cents$/, `the '${r.kind}' statement row`), run,
      `running_cents accumulates in row order (after the '${r.kind}' on ${r.date})`);
    if (r.kind === "application") {
      assert.equal(r.application_kind, "payroll_deduction", "an application row carries its application_kind");
      assert.equal(r.reason, "x42 rig application", "…and the reason the booker gave");
    }
  }
  assert.equal(run, 40_000, "the chain closes at the account's outstanding total (100,000 − 60,000 + 30,000 − 30,000)");
  assert.equal(await glNet(client, ADV1, today()), 40_000, "…which is exactly the account's approved GL balance");
});

test("x42v.s3 staff_advance_tie reads ZERO on two independent worlds, groups by ACCOUNT CODE across enrolment generations, and EXPLAINS out-of-window GL movement instead of going red", async (t) => {
  if (skipHere(t)) return;

  // World 1 — one enrolment, one partial application.
  const one = await freshAdvClient("s3a");
  const a1 = (await disburse({ client: one.client, cents: 70_000, postingDate: dayIn(mon(-3), 5) })).advance;
  await applyToAdvance(w.users.bob, { client: one.client, advance: a1.id, cents: 30_000, postingDate: dayIn(mon(-2), 10) });
  await assertTieAtZero(one.client, mon(-1).end, "world 1 (one enrolment, one partial application)");

  // World 2 — two enrolled codes, three advances, mixed applications.
  const two = await freshAdvClient("s3b");
  await enrolHere(w.users.alice, { client: two.client, code: ADV2, personLabel: "B. Rig" });
  const b1 = (await disburse({ client: two.client, cents: 60_000, postingDate: dayIn(mon(-3), 3) })).advance;
  const b2 = (await disburse({ client: two.client, cents: 45_000, postingDate: dayIn(mon(-3), 4), account: ADV2 })).advance;
  const b3 = (await disburse({ client: two.client, cents: 15_000, postingDate: dayIn(mon(-3), 6), account: ADV2 })).advance;
  await applyToAdvance(w.users.bob, { client: two.client, advance: b1.id, cents: 60_000, postingDate: dayIn(mon(-2), 2) });
  await applyToAdvance(w.users.bob, {
    client: two.client, advance: b2.id, accountCode: ADV2, cents: 20_000, postingDate: dayIn(mon(-2), 3),
  });
  assert.ok(b3.id, "mandatory setup: the third advance is untouched, so its full amount stays outstanding");
  await assertTieAtZero(two.client, mon(-1).end, "world 2 (two enrolled codes, three advances)");

  // Out-of-window GL movement: a debit and a credit dated BEFORE the code was ever
  // enrolled (net zero, so enrol-clean-only still admits the code). The tie must
  // explain them rather than report a difference.
  const three = await freshAdvClient("s3c", { enrol: false });
  await approvedEntry(w.users.alice, {
    client: three.client, memo: "x42 s3 pre-enrolment movement out", postingDate: dayIn(mon(-6), 5),
    lines: [
      { account_code: ADV3, debit_cents: 70_000, credit_cents: 0, description: "legacy float out" },
      { account_code: BANKV, debit_cents: 0, credit_cents: 70_000, description: "from bank" },
    ],
  });
  await approvedEntry(w.users.alice, {
    client: three.client, memo: "x42 s3 pre-enrolment movement back", postingDate: dayIn(mon(-4), 5),
    lines: [
      { account_code: BANKV, debit_cents: 70_000, credit_cents: 0, description: "returned" },
      { account_code: ADV3, debit_cents: 0, credit_cents: 70_000, description: "legacy float back" },
    ],
  });
  assert.equal(await glNet(three.client, ADV3), 0, "mandatory setup: the pre-enrolment movements net to zero");
  await enrolHere(w.users.alice, { client: three.client, code: ADV3, personLabel: "C. Rig" });
  const c1 = (await disburse({ client: three.client, cents: 50_000, postingDate: dayIn(mon(-3), 3), account: ADV3 })).advance;
  assert.ok(c1.id, "mandatory setup: an in-window disbursement exists");

  const now = await assertTieAtZero(three.client, mon(-1).end, "world 3 at a CURRENT as-of");
  const nowRow = now.find((r) => r.account_code === ADV3);
  assert.equal(numOf(nowRow, /out_of_window/, "the tie row"), 0,
    "at a current as-of the pre-enrolment pair has netted away — nothing is left out of window");
  assert.equal(numOf(nowRow, /^register_cents$/, "the tie row"), 50_000, "…and the register side is the live advance");

  const mid = await assertTieAtZero(three.client, dayIn(mon(-5), 15), "world 3 at a HISTORICAL as-of between the pre-enrolment movements");
  const midRow = mid.find((r) => r.account_code === ADV3);
  assert.equal(numOf(midRow, /^register_cents$/, "the historical tie row"), 0, "the register carries nothing at that as-of");
  assert.equal(numOf(midRow, /^gl_cents$/, "the historical tie row"), 0,
    "…the GL side is scoped to the union of the code's enrolment windows, so the pre-watermark debit is not in it");
  assert.equal(numOf(midRow, /out_of_window/, "the historical tie row"), 70_000,
    "…and it is EXPLAINED by its own column instead of reading as a difference (design §3.4)");
  assert.ok("explained" in midRow, `…beside the explained column the ABI names (got keys: ${Object.keys(midRow).join(", ")})`);

  // Retire + re-enrol: ONE tie row per ACCOUNT CODE, walking every generation.
  const four = await freshAdvClient("s3d");
  const d1 = (await disburse({ client: four.client, cents: 60_000, postingDate: dayIn(mon(-4), 5) })).advance;
  await applyToAdvance(w.users.bob, { client: four.client, advance: d1.id, cents: 60_000, postingDate: dayIn(mon(-3), 5) });
  await retireAdvance(w.users.hana, { client: four.client, enrolment: four.enrolment, reason: "x42 s3 staff left" });
  await enrolHere(w.users.alice, { client: four.client, personLabel: "the successor" });
  const d2 = (await disburse({ client: four.client, cents: 25_000, postingDate: dayIn(mon(-2), 5) })).advance;
  assert.notEqual(d2.enrolment_id, d1.enrolment_id, "mandatory setup: the two advances sit on DIFFERENT enrolment generations");

  for (const [asOf, label] of [
    [dayIn(mon(-3), 20), "between the generations"],
    [mon(-1).end, "after both generations"],
  ]) {
    const rows = await assertTieAtZero(four.client, asOf, `world 4 ${label}`);
    const mineRows = rows.filter((r) => r.account_code === ADV1);
    assert.equal(mineRows.length, 1,
      `the tie groups by ACCOUNT CODE — one row for ${ADV1} even across two enrolment generations (${label}; got ${mineRows.length})`);
  }
});

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

test("x42v.f2 floors: applications are bookkeeper+ (a viewer is refused CLR04), the three reads are viewer+, and a cross-firm caller gets no existence oracle", async (t) => {
  if (skipHere(t)) return;
  const { client } = await freshAdvClient("f2");
  const a = (await disburse({ client, cents: 40_000, postingDate: dayIn(mon(-2), 4) })).advance;

  await assertRaises(E.authz, () => applyToAdvance(w.users.carol, {
    client, advance: a.id, cents: 10_000, postingDate: dayIn(mon(-1), 4),
  }), "a VIEWER booking a staff-advance application (bookkeeper+)");
  assert.equal((await applicationRowsOf(a.id)).length, 0, "…and nothing was written");

  // viewer+ on all three reads (the grant loop): carol is firm A's viewer.
  const asOf = mon(-1).end;
  const seen = rowsBy(await advanceSummary(w.users.carol, client, asOf), "advance_id", "the viewer's staff_advance_summary");
  assert.ok(seen.some((r) => r.advance_id === a.id), "a VIEWER reads staff_advance_summary");
  assert.ok(rowsBy(await advanceStatement(w.users.carol, client, ADV1, mon(-3).start, asOf), "kind",
    "the viewer's staff_advance_statement").length >= 1, "…and staff_advance_statement");
  assert.ok(rowsBy(await advanceTie(w.users.carol, client, asOf), "account_code",
    "the viewer's staff_advance_tie").length >= 1, "…and staff_advance_tie");

  for (const [label, call] of [
    ["staff_advance_summary", () => advanceSummary(w.users.dave, client, asOf)],
    ["staff_advance_statement", () => advanceStatement(w.users.dave, client, ADV1, mon(-3).start, asOf)],
    ["staff_advance_tie", () => advanceTie(w.users.dave, client, asOf)],
  ]) {
    const err = await caught(call);
    if (err) {
      assert.equal(err.code, E.notFound, `${label} answers a cross-firm caller with the not-found shape (got ${err.code} — ${err.message})`);
    } else {
      const json = JSON.stringify(await call());
      assert.ok(!json.includes(a.id), `${label} leaked an advance id to a cross-firm caller — an existence oracle (${json.slice(0, 200)})`);
      noteLane(`x42v.f2 ${label} answers a cross-firm caller with an EMPTY payload rather than CLR11 — recorded`);
    }
  }
  assert.equal((await advanceRows(client)).length, 1, "the floor cells left the register exactly as they found it");
  assert.ok(await advanceRow(a.id), "…and the advance still reads back");
});
