// ===========================================================================
// [WAVE D-b SPLIT — D-b1 (0043, staff advances)] A FORK OF `x42-advances.test.mjs`.
//
// THE SPLIT MOVES CELLS; IT NEVER EDITS THEM. Every `test(...)` block below is
// byte-for-byte the block of the same name in x42-advances.test.mjs; the prologue
// (imports, world builder, before/after, module-level helpers) is byte-for-byte the
// original's (bar any substitution named below) and is shared by every fork of this
// file. The ONLY authored bytes in this file are this banner.
//
// CELLS HERE (13): x42v.meta, x42v.e1, x42v.e2, x42v.e3, x42v.e4, x42v.e5, x42v.e6, x42v.e8, x42v.r1, x42v.r2, x42v.r3, x42v.r4, x42v.r5
// CELLS IN THE SIBLING FORK(S): b2 → D-b2
//
// WHY THIS CUT: measured, not argued — each cell here is green on clara_f1_b01 (… + 0043)
// and its subject is shipped by that slice. The sibling cells stay red until their
// own slice ships; keeping them in one file is what would make a slice's CI red for
// a reason that has nothing to do with the slice.
//
// AT MERGE: this fork REPLACES its share of the original — the original file is
// deleted in the FIRST slice PR that lands a fork of it, and every fork of
// x42-advances.test.mjs lands with its own slice.
// ===========================================================================
// 0042 Wave D-b — the STAFF-ADVANCE battery, part 1: ENROLMENT (design §3.1) ·
// THE REGISTER + SOFT-BIRTH + THE PARTICULARS CHASE (design §3.2/§3.3) · THE QUEUE.
//
// CONTRACT-BLIND: authored from `docs/plan/completed/wave-d-b-design.md` §3 + §7 and
// `docs/plan/completed/wave-d-b-design-abi.md` ONLY — this lane NEVER reads 0042's SQL or the
// 0042 section drafts. Every verb is called by its PINNED name with NAMED args;
// every refusal ABI §F names is asserted by its errcode AND its DETAIL reason token,
// verbatim. A divergence at integration is a FINDING for orchestrator adjudication,
// never a silent test edit.
//
// Siblings (all `x42-advances*.test.mjs`, auto-discovered by `node --test tests/`;
// split only because the repo enforces a 500-line file ceiling):
//   x42-advances.test.mjs        markers · enrolment · soft-birth · chase · queue
//   x42-advances-reads.test.mjs  applications · reads · tie · floors · revise
//   x42-advances-belt.test.mjs   the movement belt · reversal doors · temporal cap

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  rootQuery, opk, endPool, printLaneNotes, printSkipCount, noteLane, idOf, assertRaises,
  x42EnsureReady, skip42, refusesWith, refusesNamed, caught, T, E, EA1955_FACTS,
  ADV1, ADV2, ADV3, BANKV, WAGES, OTHERV, ARV, FACOST, FAACCUM, FAEXP,
  mon, dayIn, uniqTag, fnExists, columnExists, advWorld, freshAdvClient, enrolHere, enrolAdvance,
  retireAdvance, approvedEntry, approveDraft, disburse, applyToAdvance, upsertFaProfile,
  completeAdvanceParticulars, addBankAccount, proposeTemplate, advanceRows, advanceRow,
  enrolmentRows, policyRows, entryLinesOf, entryRowOf, glNet, outstandingAt, tableExists,
  queueRowsOfKind, openingBalanceAdvanceClient, mirrorIdOf, reverseEntry } from "./x42-adv-world.mjs";

let live = false;
let w = null;

before(async () => {
  live = await x42EnsureReady();
  if (live) w = await advWorld();
});

after(async () => {
  printLaneNotes("x42-advances");
  printSkipCount("x42-advances");
  await endPool();
});

const skipHere = (t) => skip42(t, live, "the Wave-D-b enrolment/register battery");

/** A digits-only bank account number (0038's account_number_normalized grammar). */
const acctNumber = () => `5${String(Date.now()).slice(-8)}${Math.floor(Math.random() * 90 + 10)}`;

// ===========================================================================
// x42v.meta — the migration row + this lane's marker objects. A partial apply can
// never green the suite silently.
// ===========================================================================

const ADV_TABLES = ["staff_advance_accounts", "staff_advances", "staff_advance_applications", "ea1955_policy"];
const ADV_FNS = [
  "enrol_staff_advance_account", "retire_staff_advance_account",
  "book_staff_advance_application", "complete_staff_advance_particulars",
  "staff_advance_summary", "staff_advance_statement", "staff_advance_tie", "_adv_on_approve",
];

test("x42v.meta 0042 applied: one 0042_* row, the four advance-lane tables, every verb, the ABI §D columns, and the three EA-1955 seed rows", async (t) => {
  if (skipHere(t)) return;

  const mig = await rootQuery("select version from clara.schema_migrations where version ~ '^0042_'");
  assert.equal(mig.rows.length, 1, `exactly one applied 0042_* migration (got ${mig.rows.map((x) => x.version).join(",")})`);

  for (const tbl of ADV_TABLES) assert.ok(await tableExists(tbl), `clara.${tbl} exists (ABI §D)`);
  for (const fn of ADV_FNS) assert.ok(await fnExists(fn), `clara.${fn} exists (ABI §A / design §3.3)`);

  for (const col of ["account_code", "person_label", "enrolment_attestation", "active", "enrolled_at",
    "retired_at", "retired_reason"]) {
    assert.ok(await columnExists("staff_advance_accounts", col), `clara.staff_advance_accounts.${col} exists (ABI §D.4)`);
  }
  for (const col of ["enrolment_id", "account_code", "disbursement_line_id", "entry_id", "issue_date",
    "amount_cents", "purpose", "reference", "voided_by_entry_id", "void_effective_date"]) {
    assert.ok(await columnExists("staff_advances", col), `clara.staff_advances.${col} exists (ABI §D.5)`);
  }
  for (const col of ["advance_id", "enrolment_id", "application_line_id", "entry_id", "kind",
    "amount_cents", "effective_date", "reverses_application_id", "reason"]) {
    assert.ok(await columnExists("staff_advance_applications", col), `clara.staff_advance_applications.${col} exists (ABI §D.6)`);
  }

  // The four application kinds (design §3.2) — `correction` is admitted by the CHECK
  // but is HOOK-BORN ONLY; the proposal verb never accepts it.
  const defs = (await rootQuery(
    `select string_agg(pg_get_constraintdef(c.oid),' ~~ ') as d from pg_constraint c
       join pg_class tb on tb.oid=c.conrelid join pg_namespace n on n.oid=tb.relnamespace
      where n.nspname='clara' and tb.relname='staff_advance_applications' and c.contype='c'`,
  )).rows[0].d ?? "";
  for (const kind of ["payroll_deduction", "bank_return", "claim", "correction"]) {
    assert.ok(defs.includes(kind), `the kind CHECK admits '${kind}' (design §3.2) — defs: ${defs.slice(0, 400)}`);
  }

  // ABI §D.7: the three EA-1955 visibility rows, effective 2026-08-01, open-ended.
  const seeds = await policyRows();
  for (const fact of EA1955_FACTS) {
    const row = seeds.find((r) => r.fact === fact);
    assert.ok(row, `clara.ea1955_policy carries the '${fact}' seed (ABI §D.7) — got ${seeds.map((r) => r.fact).join(",")}`);
    assert.equal(row.effective_from, "2026-08-01", `…effective_from 2026-08-01 (${fact})`);
    assert.equal(row.effective_to, null, `…still open-ended (${fact})`);
    assert.ok(String(row.note ?? "").trim().length > 0, `…with a non-blank note (${fact})`);
    assert.ok(/EA 1955/.test(String(row.source_note ?? "")), `…and a source_note citing the EA 1955 primary text (${fact})`);
  }
});

// ===========================================================================
// x42v.e — ENROLMENT (design §3.1; WDB-G6 admin+, WDB-G7/G15 attestation).
// ===========================================================================

test("x42v.e1 enrolment happy path: an active, asset, non-control, unreserved, zero-balance code enrols; the attestation is stored VERBATIM; wrong-shaped accounts are refused", async (t) => {
  if (skipHere(t)) return;
  const { client } = await freshAdvClient("e1", { enrol: false });
  const attestation = "Dedicated advance account for A. Rig (staff, not a related party) — x42.e1";

  assert.equal(await glNet(client, ADV1), 0, "mandatory setup: the code's approved GL balance is zero (enrol-clean-only)");
  const receipt = await enrolAdvance(w.users.alice, {
    client, accountCode: ADV1, personLabel: "A. Rig", attestation,
  });
  const id = idOf(receipt, "enrolment_id", "id");
  assert.ok(id, `enrol_staff_advance_account names the enrolment (got ${JSON.stringify(receipt)})`);
  assert.equal(receipt.status, "active", "the ABI §A envelope reports status 'active'");

  const rows = await enrolmentRows(client);
  assert.equal(rows.length, 1, "exactly ONE enrolment row was written");
  const row = rows[0];
  assert.equal(row.id, id, "…the row the receipt names");
  assert.equal(row.account_code, ADV1, "account_code as passed");
  assert.equal(row.person_label, "A. Rig", "person_label as passed");
  assert.equal(row.enrolment_attestation, attestation,
    "the attestation is stored VERBATIM — WDB-G15's evidence that related-party status was attested, not structurally derived");
  assert.equal(row.active, true, "a freshly enrolled row is active");
  assert.ok(row.enrolled_at, "…and carries the enrolled_at watermark the belt reads");
  assert.equal(row.retired_at, null, "…with the retirement pair unset (the active XOR retired CHECK)");

  // The shape guards the design states (asset · non-control · not the bank door).
  await refusesNamed(() => enrolAdvance(w.users.alice, { client, accountCode: ARV, personLabel: "control" }),
    "enrolling a CONTROL-class (receivable) account", { codes: [E.badRequest] });
  await refusesNamed(() => enrolAdvance(w.users.alice, { client, accountCode: WAGES, personLabel: "expense" }),
    "enrolling an EXPENSE account (an advance is an asset)", { codes: [E.badRequest] });
  await refusesNamed(() => enrolAdvance(w.users.alice, { client, accountCode: "399-ZZZ", personLabel: "ghost" }),
    "enrolling a code that does not exist on the client's chart", { codes: [E.badRequest, E.notFound] });
  assert.equal((await enrolmentRows(client)).length, 1, "every refusal left the enrolment set untouched");
});

test("x42v.e2 enrol-clean-only: a NONZERO approved GL balance refuses CLR10 enrolment_balance_nonzero — and the gate is the BALANCE, not the movement history", async (t) => {
  if (skipHere(t)) return;
  const { client } = await freshAdvClient("e2", { enrol: false });
  const m = mon(-3);
  const entry = await approvedEntry(w.users.alice, {
    client, memo: "x42 pre-existing advance balance", postingDate: dayIn(m, 6),
    lines: [
      { account_code: ADV1, debit_cents: 75_000, credit_cents: 0, description: "legacy advance" },
      { account_code: BANKV, debit_cents: 0, credit_cents: 75_000, description: "paid" },
    ],
  });
  assert.equal(await glNet(client, ADV1), 75_000, "mandatory setup: the code carries an approved debit balance");

  await refusesWith(
    () => enrolAdvance(w.users.alice, { client, accountCode: ADV1, personLabel: "A. Rig" }),
    E.badRequest, T.enrolmentBalanceNonzero,
    "enrolling a code that already carries an approved GL balance (the attested-baseline debt is a NAMED deferral)",
  );
  assert.equal((await enrolmentRows(client)).length, 0, "…and no enrolment row was written");

  // Unwind the balance to exactly zero: the movement history remains, the balance does not.
  await reverseEntry(w.users.alice, { entry, reason: "x42 e2 unwind", opKey: opk("x42e2rev") });
  const mirror = await mirrorIdOf(entry);
  if ((await entryRowOf(mirror)).status === "draft") await approveDraft(mirror, { maker: w.users.alice });
  assert.equal(await glNet(client, ADV1), 0, "mandatory setup: the approved balance is back to zero");

  const id = await enrolHere(w.users.alice, { client, personLabel: "A. Rig" });
  assert.ok(id, "…and enrolment now succeeds — the gate is the BALANCE, never 'this code was never touched'");
});

// [ROOT-ERADICATION residue R8 — ruled 2026-08-03.] This cell originally RECORDED the
// tab/newline case instead of asserting it, on the reasoning that the house non-blank idiom
// (`nullif(btrim(x),'')`, 573 uses, space-only) was the honest reading of "non-blank". The
// owner ruled otherwise for THIS field only: under [WDB-G15] the attestation is the SOLE
// evidence for a related-party judgement, so a string a reviewer cannot read is not evidence.
// ABI §D.4 now states the rule; the house idiom elsewhere is deliberately UNTOUCHED.
test("x42v.e3 the G15 evidence is mandatory: blank/space/tab/punctuation-only/absent attestations and p_confirm_dedicated=false are each refused BY NAME", async (t) => {
  if (skipHere(t)) return;
  const { client } = await freshAdvClient("e3", { enrol: false });
  const T10 = E.badRequest, TOK = "advance_enrolment_invalid";

  for (const [label, attestation] of [
    ["an EMPTY attestation", ""],
    ["a SPACE-only attestation", "      "],
    ["a TAB/NEWLINE-only attestation (btrim/1 strips spaces ONLY — the R8 hole)", "   \t \n "],
    ["a PUNCTUATION-only attestation (what the whitespace fix alone would still admit)", " -- ... "],
    ["a NULL attestation", null],
  ]) {
    await refusesWith(() => enrolAdvance(w.users.alice, { client, accountCode: ADV1, attestation }),
      T10, TOK, `enrolling with ${label}`);
  }
  await refusesNamed(() => enrolAdvance(w.users.alice, { client, accountCode: ADV1, confirmDedicated: false }),
    "enrolling without p_confirm_dedicated", { codes: [T10] });
  await refusesNamed(() => enrolAdvance(w.users.alice, { client, accountCode: ADV1, confirmDedicated: null }),
    "enrolling with a NULL p_confirm_dedicated", { codes: [T10] });

  assert.equal((await enrolmentRows(client)).length, 0, "no enrolment row was written by any refusal");
  await enrolHere(w.users.alice, { client }); // the same call with both pieces present succeeds
  assert.equal((await enrolmentRows(client)).filter((r) => r.active).length, 1, "…and the well-formed call enrols");
  // The WDB-R4 half of this fix — "what would a stricter blankness rule WRONGLY refuse?" —
  // lives in x42-advances-guards.test.mjs (x42v.g-r8), only because of the 500-line ceiling.
});

test("x42v.e4 enrolment concurrency: two racing enrols on ONE code leave exactly one winner (the client rung + the partial unique WHERE active)", async (t) => {
  if (skipHere(t)) return;
  const { client } = await freshAdvClient("e4", { enrol: false });

  const results = await Promise.allSettled([
    enrolAdvance(w.users.alice, { client, accountCode: ADV1, personLabel: "racer one" }),
    enrolAdvance(w.users.hana, { client, accountCode: ADV1, personLabel: "racer two" }),
  ]);
  const won = results.filter((r) => r.status === "fulfilled");
  const lost = results.filter((r) => r.status === "rejected");
  assert.equal(won.length, 1,
    `exactly ONE racing enrol wins (got ${won.length}; rejections: ${lost.map((r) => `${r.reason?.code}/${r.reason?.message}`).join(" | ")})`);
  assert.equal(lost.length, 1, "…and exactly one loses");
  noteLane(`x42v.e4 the loser refused code=${lost[0].reason?.code ?? "(none)"} — ${String(lost[0].reason?.message).slice(0, 160)}`);

  const active = (await enrolmentRows(client)).filter((r) => r.active);
  assert.equal(active.length, 1, "the register holds exactly ONE active enrolment for the code");
  assert.equal(active[0].id, idOf(won[0].value, "enrolment_id", "id"), "…and it is the winner's row");
});

test("x42v.e5 re-enrolment is version-forward: a RETIRED same-code enrolment does not block a fresh one, and the old row stays intact", async (t) => {
  if (skipHere(t)) return;
  const { client, enrolment } = await freshAdvClient("e5");

  await retireAdvance(w.users.hana, { client, enrolment, reason: "x42 e5 staff left" });
  const retired = (await enrolmentRows(client)).find((r) => r.id === enrolment);
  assert.equal(retired.active, false, "the retired generation is inactive");
  assert.ok(retired.retired_at, "…stamped retired_at");
  assert.equal(retired.retired_reason, "x42 e5 staff left", "…and its reason, verbatim");

  const second = await enrolHere(w.users.alice, { client, personLabel: "the successor" });
  assert.notEqual(second, enrolment, "re-enrolment mints a NEW row (version-forward), never resurrects the old one");
  const rows = await enrolmentRows(client);
  assert.equal(rows.length, 2, "both generations survive");
  assert.equal(rows.filter((r) => r.active).length, 1, "…exactly one is active (the partial unique WHERE active)");
  assert.equal((await enrolmentRows(client)).find((r) => r.id === enrolment).retired_at, retired.retired_at,
    "…and the retired generation is untouched by the re-enrolment (append-only history)");
});

test("x42v.e6 retirement refuses CLR10 advance_outstanding_on_retire while ANY advance is outstanding, and succeeds once every advance is fully applied", async (t) => {
  if (skipHere(t)) return;
  const { client, enrolment } = await freshAdvClient("e6");
  const m = mon(-2);
  const { advance } = await disburse({ client, cents: 60_000, postingDate: dayIn(m, 4) });

  await refusesWith(() => retireAdvance(w.users.hana, { client, enrolment }),
    E.badRequest, T.advanceOutstandingOnRetire,
    "retiring an enrolment while an advance is still outstanding");
  assert.equal((await enrolmentRows(client))[0].active, true, "…and the enrolment stayed active");

  await applyToAdvance(w.users.bob, { client, advance: advance.id, cents: 25_000, postingDate: dayIn(mon(-1), 6) });
  await refusesWith(() => retireAdvance(w.users.hana, { client, enrolment }),
    E.badRequest, T.advanceOutstandingOnRetire,
    "retiring while a PARTIALLY applied advance still has an outstanding remainder");

  await applyToAdvance(w.users.bob, { client, advance: advance.id, cents: 35_000, postingDate: dayIn(mon(-1), 20) });
  assert.equal(await outstandingAt(advance.id, mon(0).end), 0, "mandatory setup: the advance is fully applied");
  const done = await retireAdvance(w.users.hana, { client, enrolment, reason: "x42 e6 settled" });
  assert.equal(done.status, "retired", "…retirement now succeeds with the ABI §A {enrolment_id, status:'retired'} envelope");
  assert.equal(idOf(done, "enrolment_id", "id"), enrolment, "…naming the enrolment it retired");
});

test("x42v.e8 floors (WDB-G6): enrol and retire are admin+ — a bookkeeper is refused CLR04 on both, and the admin path still works", async (t) => {
  if (skipHere(t)) return;
  const { client } = await freshAdvClient("e8", { enrol: false });

  await assertRaises(E.authz, () => enrolAdvance(w.users.bob, { client, accountCode: ADV1, personLabel: "bookkeeper try" }),
    "a BOOKKEEPER enrolling an advance account (WDB-G6: admin+)");
  assert.equal((await enrolmentRows(client)).length, 0, "…and nothing was written");

  const enrolment = await enrolHere(w.users.hana, { client }); // admin
  await assertRaises(E.authz, () => retireAdvance(w.users.bob, { client, enrolment }),
    "a BOOKKEEPER retiring an advance enrolment (WDB-G6: admin+)");
  assert.equal((await enrolmentRows(client))[0].active, true, "…and the enrolment stayed active");
  await retireAdvance(w.users.alice, { client, enrolment }); // owner is above the admin floor
  assert.equal((await enrolmentRows(client))[0].active, false, "…while an owner retires it");
});

// ===========================================================================
// x42v.r — THE REGISTER: soft-birth (hook arm 3), the particulars chase, the queue.
// ===========================================================================

test("x42v.r1 soft-birth: an approved DEBIT on the enrolled code births ONE staff_advances row per debit LINE, keyed to that line, dated at the posting date, honestly incomplete", async (t) => {
  if (skipHere(t)) return;
  const { client, enrolment } = await freshAdvClient("r1");
  const m = mon(-2);
  const { entry, advance } = await disburse({ client, cents: 120_000, postingDate: dayIn(m, 10) });

  assert.equal(advance.client_id, client, "the born row is attributed to the entry's OWN client (tenant congruence by construction)");
  assert.equal(advance.enrolment_id, enrolment, "enrolment_id binds the generation that admitted the movement (design §3.2)");
  assert.equal(advance.account_code, ADV1, "account_code = the enrolled code");
  assert.equal(advance.entry_id, entry, "entry_id links the approving entry");
  assert.equal(advance.issue_date, dayIn(m, 10), "issue_date = the entry's posting_date (an ACCOUNTING date, never transaction time)");
  assert.equal(Number(advance.amount_cents), 120_000, "amount_cents = the debit leg");
  assert.equal(advance.purpose, null, "purpose births NULL — the row is visible and honestly incomplete");
  assert.equal(advance.reference, null, "…and so does reference");
  assert.equal(advance.voided_by_entry_id, null, "…with the void pair unset");
  assert.equal(advance.void_effective_date, null, "…both halves");
  const advLine = (await entryLinesOf(entry)).find((l) => l.account_code === ADV1);
  assert.equal(advance.disbursement_line_id, advLine.id, "disbursement_line_id names THE debit LINE — the birth identity (ABI §D.5, UNIQUE)");

  // TWO debit legs in ONE entry → TWO rows, one per line (the D-a row-shape law).
  const two = await approvedEntry(w.users.alice, {
    client, memo: "x42 r1 two floats in one entry", postingDate: dayIn(m, 18),
    lines: [
      { account_code: ADV1, debit_cents: 30_000, credit_cents: 0, description: "float one" },
      { account_code: ADV1, debit_cents: 20_000, credit_cents: 0, description: "float two" },
      { account_code: BANKV, debit_cents: 0, credit_cents: 50_000, description: "from bank" },
    ],
  });
  const born = (await advanceRows(client)).filter((r) => r.entry_id === two);
  assert.equal(born.length, 2, "TWO debit legs birth TWO register rows — the register is keyed to the LINE, never the entry");
  assert.deepEqual(born.map((r) => Number(r.amount_cents)).sort((a, b) => a - b), [20_000, 30_000],
    "…each carrying its OWN leg's cents");
  assert.equal(new Set(born.map((r) => r.disbursement_line_id)).size, 2, "…on two DISTINCT lines (the unique holds)");
});

test("x42v.r2 the particulars chase: complete_staff_advance_particulars sets {purpose, reference} ONCE (bookkeeper+); a second call refuses CLR10 particulars_already_set", async (t) => {
  if (skipHere(t)) return;
  const { client } = await freshAdvClient("r2");
  const { advance } = await disburse({ client, cents: 45_000, postingDate: dayIn(mon(-2), 8) });

  const receipt = await completeAdvanceParticulars(w.users.bob, {
    client, advance: advance.id, purpose: "Site visit float — Johor", reference: "ADV/2026/0007",
  });
  assert.equal(idOf(receipt, "advance_id", "id"), advance.id, "the ABI §A envelope names the advance");
  assert.equal(receipt.purpose, "Site visit float — Johor", "…echoing the purpose it stored");
  assert.equal(receipt.reference, "ADV/2026/0007", "…and the reference");

  const row = await advanceRow(advance.id);
  assert.equal(row.purpose, "Site visit float — Johor", "the register row carries the purpose verbatim");
  assert.equal(row.reference, "ADV/2026/0007", "…and the reference verbatim");

  await refusesWith(() => completeAdvanceParticulars(w.users.bob, {
    client, advance: advance.id, purpose: "second thoughts", reference: "ADV/2026/0008",
  }), E.badRequest, T.particularsAlreadySet, "completing particulars a SECOND time (set-once)");
  const after = await advanceRow(advance.id);
  assert.equal(after.purpose, "Site visit float — Johor", "…and the refusal left the first answer standing");
  assert.equal(after.reference, "ADV/2026/0007", "…on both columns");
});

test("x42v.r3 soft-birth immunity (design §3.3 arm (3): NOT is_opening_balance AND reversal_of IS NULL) — neither an opening-balance debit nor a reversal-mirror debit births a register row", async (t) => {
  if (skipHere(t)) return;

  // (a) the reversal mirror. Reversing an APPLICATION entry mirrors its advance-side
  // credit into a DEBIT; arm (1) dispatches reversal FIRST and returns, so the mirror
  // mints a correction (x42-advances-belt covers the arithmetic) and never a new advance.
  const { client } = await freshAdvClient("r3a");
  const { advance } = await disburse({ client, cents: 80_000, postingDate: dayIn(mon(-3), 5) });
  const app = await applyToAdvance(w.users.bob, {
    client, advance: advance.id, cents: 30_000, postingDate: dayIn(mon(-2), 9),
  });
  const beforeRows = (await advanceRows(client)).length;
  await reverseEntry(w.users.bob, { entry: app.entryId, reason: "x42 r3 unwind", opKey: opk("x42r3rev") });
  const mirror = await mirrorIdOf(app.entryId);
  assert.ok(mirror, "mandatory setup: reverse_entry minted a mirror");
  if ((await entryRowOf(mirror)).status === "draft") await approveDraft(mirror, { maker: w.users.bob });
  const mirrorLine = (await entryLinesOf(mirror)).find((l) => l.account_code === ADV1);
  assert.ok(Number(mirrorLine.debit_cents) > 0, "mandatory setup: the mirror DEBITS the enrolled advance code");
  assert.equal((await advanceRows(client)).length, beforeRows,
    "a reversal-mirror debit births NO staff_advances row (`reversal_of IS NULL` gates arm (3))");

  // (b) the opening balance — the ONLY producer is the Wave-B K family. Enrolment
  // happens first (while the balance is still zero, as enrol-clean-only demands), so
  // the K5 approval genuinely exercises the `NOT is_opening_balance` gate.
  const k = await openingBalanceAdvanceClient("r3b");
  const err = await caught(k.approve);
  const kRows = await advanceRows(k.client);
  assert.equal(kRows.length, 0,
    `an is_opening_balance debit on an enrolled code NEVER soft-births a staff_advances row (got ${kRows.length})`);
  if (err) {
    // The lawful alternative reading: the movement belt treats an opening-balance
    // debit inside the enrolment window as an unregistered movement and refuses the
    // whole seed approval (the D-a `fa_k_gl_balance_on_enrolled` analogue). Either
    // way NO register row exists — which is this cell's subject.
    noteLane(`x42v.r3 the opening-balance approval REFUSED code=${err.code ?? "(none)"} — ${String(err.message).slice(0, 160)}`);
    assert.ok(/^CLR/.test(String(err.code ?? "")),
      `…and it refused with a NAMED Clara refusal, never an incidental error (got ${err.code} — ${err.message})`);
  } else {
    noteLane("x42v.r3 the opening-balance approval SUCCEEDED and birthed nothing — the belt exempts is_opening_balance movements");
    assert.equal(await glNet(k.client, k.code), k.cents, "…and the GL carries the opening balance the seed stated");
  }
});

test("x42v.r4 the queue chases INCOMPLETE register rows: row_kind='staff_advance_incomplete' names the advance, and a completed row stops chasing", async (t) => {
  if (skipHere(t)) return;
  const { client } = await freshAdvClient("r4");
  const { advance } = await disburse({ client, cents: 55_000, postingDate: dayIn(mon(-2), 12) });

  const hits = await queueRowsOfKind(w.users.alice, client, "staff_advance_incomplete");
  const mine = hits.filter((h) => JSON.stringify(h).includes(advance.id));
  assert.equal(mine.length, 1,
    `the particulars-incomplete advance appears ONCE as row_kind='staff_advance_incomplete' (got ${hits.length} rows of that kind)`);
  const idField = Object.entries(mine[0]).find(([, v]) => v === advance.id)?.[0];
  assert.ok(idField, `…carrying the advance id in a named field (got ${JSON.stringify(mine[0])})`);
  noteLane(`x42v.r4 the queue row names the advance under '${idField}'`);

  await completeAdvanceParticulars(w.users.bob, { client, advance: advance.id });
  const after = await queueRowsOfKind(w.users.alice, client, "staff_advance_incomplete");
  assert.equal(after.filter((h) => JSON.stringify(h).includes(advance.id)).length, 0,
    "a COMPLETED register row stops chasing (visibility, never blocking)");
});

// A dormant-suite marker so an accidentally-empty file is impossible: ADV2/ADV3 exist
// on every x42 chart precisely so the multi-enrolment and tie-generation cells in the
// sibling files have codes of their own.
test("x42v.r5 the lane's chart carries three distinct advance codes, all unreserved until enrolled", async (t) => {
  if (skipHere(t)) return;
  const { client } = await freshAdvClient("r5", { enrol: false });
  for (const code of [ADV1, ADV2, ADV3]) {
    const row = (await rootQuery(
      "select account_type, account_class, is_active from clara.coa_accounts where client_id=$1 and account_code=$2",
      [client, code])).rows[0];
    assert.ok(row, `${code} exists on the x42 chart`);
    assert.equal(row.account_type, "asset", `${code} is an asset`);
    assert.equal(row.account_class, null, `${code} is NON-control`);
    assert.equal(row.is_active, true, `${code} is active`);
    assert.equal(await glNet(client, code), 0, `${code} starts with a zero approved balance`);
  }
  const second = await enrolHere(w.users.alice, { client, code: ADV2, personLabel: "B. Rig" });
  const third = await enrolHere(w.users.alice, { client, code: ADV3, personLabel: "C. Rig" });
  assert.notEqual(second, third, "many enrolments per client coexist — one per CODE (WDB-G13)");
  assert.equal((await enrolmentRows(client)).filter((r) => r.active).length, 2, "…both active at once");
});
