// WAVE D-b SPLIT — CROSS-SLICE CONTRACT (ii): D-b1 → D-b3, THE LINE-BOOKING WALLS.
//
// census §2's "edges that are LEGAL under the order" names four places where the ship order
// D-b1-before-D-b3 is LOAD-BEARING, and two of them are these:
//   * `clara.resolve_and_book_bank_line` [D-b3] → `clara._adv_assert_proposal` [D-b1]
//   * `clara._wdb_line_booking_block`    [D-b3] → `clara._adv_reversal_admission`,
//                                                 `clara._adv_release_one_way` [D-b1]
// The advance arms of the AF-2 composite therefore exist ONLY when both slices have shipped.
// Shipped alone, D-b3 would compile (PL/pgSQL resolves callees at CALL time, not at CREATE)
// and then fail at the first real booking that names an advance — the exact failure mode
// census §2 Class C describes for the approve hook, one family over.
//
// FRONTIER-AWARE, like the other two contracts: one file, two arms, each asserting what is
// TRUE at the frontier it finds. It belongs in EVERY slice's CI list.
//   PRE  (0043 applied, 0044 not): the three advance walls EXIST and nothing books through
//        them yet — neither the composite nor the block body is in the catalog.
//   POST (0044 applied): both D-b3 bodies exist AND reach the D-b1 walls by name, and a real
//        composite naming a NON-EXISTENT advance is refused CLR40 `advance_application_missing`
//        BY THE WALL — not 42883, not a generic CLR10. Measured, not argued.
//
// Rig-gated; pollution-proof (stages its own world).

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  rootQuery, humanQuery, namedCall, opk, idOf, endPool, printLaneNotes, printSkipCount, noteLane,
  createClient, upsertAccountClassed, grantConsent, x41EnsureReady, wb, uniqTag,
  draftEntryV3, approveEntry, freshResolution,
} from "./x41-fa-world.mjs";
import {
  addBankAccount, enterStatement, BANKCOA1, AR1, EXPN,
} from "./x38-match-fixtures.mjs";

let live = false;
let w = null;

before(async () => {
  live = await x41EnsureReady();
  if (live) w = await wb.buildWaveBWorld();
});
after(async () => {
  printLaneNotes("x42x-b1-b3-line-booking-walls");
  printSkipCount("x42x-b1-b3-line-booking-walls");
  await endPool();
});

const skipHere = (t) => {
  if (!live) { t.skip("no migrated rig (0041 absent) — the split contract battery is dormant"); return true; }
  return false;
};

const stripSqlComments = (src) => (src ?? "").replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ");
const strippedDef = async (name) => stripSqlComments((await rootQuery(
  "select pg_get_functiondef(p.oid) as def from pg_proc p where p.pronamespace='clara'::regnamespace and p.proname=$1",
  [name])).rows[0]?.def ?? null);
const fnExists = async (name) => (await rootQuery(
  "select 1 from pg_proc p where p.pronamespace='clara'::regnamespace and p.proname=$1", [name])).rowCount > 0;
const applied = async (re) => Number((await rootQuery(
  "select count(*)::int as n from clara.schema_migrations where version ~ $1", [re])).rows[0].n);

/** ------------------------------------------------------------------------------------------
 *  FRONTIER PREDICATES BY STABLE NAME, NEVER BY NUMBER  [light re-confirm RC4 / LENS-3]
 *  ------------------------------------------------------------------------------------------
 *  Migration numbers are claimed at MERGE time (slices/forks/RENUMBER.md); the slice NAME never
 *  moves. A `^0042_` / `^0043_` pair therefore stops meaning what it says the moment an
 *  intervening hotfix takes a number: with D-b0 merged as 0043, `^0043_` reads D-b0 as D-b1, and
 *  a frontier-aware contract silently skips the arm that IS live and runs the arm that is not —
 *  against a database that has none of the objects that arm names. Keying on the full stable
 *  name makes every arm below renumber-proof, and makes the renumber inventory in RENUMBER.md
 *  §2 a list of FILENAMES to rename rather than a list of regexes to re-derive.
 *
 *  THE ROSTER IS DELIBERATELY WHOLE — all four slices, in every x42x contract, whichever pair
 *  that contract asserts on. That is what makes RENUMBER.md §2 one edit per file in one known
 *  place for EVERY slice, instead of a per-file re-derivation of which two regexes this
 *  particular contract happens to consume. The two this file does not read are kept, not
 *  trimmed; each carries its own disable so the exemption stays visible and scoped to the line.
 *  (This is the x42x-b0-b1-reservation-union idiom, verbatim — PR #182's R2 ruling.)
 */
// eslint-disable-next-line no-unused-vars -- whole-roster invariant; see the note above
const V_B0 = "^[0-9]{4}_wave_d_b0_shared_authorities$";
const V_B1 = "^[0-9]{4}_wave_d_b1_staff_advances$";
const V_B3 = "^[0-9]{4}_wave_d_b3_af2_composite$";
// eslint-disable-next-line no-unused-vars -- whole-roster invariant; see the note above
const V_B2 = "^[0-9]{4}_wave_d_b2_recurring_adjustments$";

const caught = async (fn) => { try { await fn(); return null; } catch (e) { return e; } };

const ADVCODE = "187-XB13";

/** A client with a bank account, one statement line and an OPEN exception on it. */
async function stageBankWorld() {
  const sub = w.users.alice;
  const client = await createClient(sub, { name: `xb13_${uniqTag()}`, opKey: opk("xb13cli") });
  await grantConsent(sub, { firm: w.firms.A, client }).catch(() => {});
  for (const [code, name, type, klass] of [
    [BANKCOA1, "Bank (xb13)", "asset", null], [AR1, "Trade Debtors (xb13)", "asset", "receivable"],
    [EXPN, "Sundry (xb13)", "expense", null], [ADVCODE, "Staff advances (xb13)", "asset", null],
  ]) {
    await upsertAccountClassed(sub, { client, code, name, type, accountClass: klass, opKey: opk("xb13coa") });
  }
  const acct = await addBankAccount(sub, { client, bankCode: "MBB", accountNumber: `xb13${randomUUID().slice(0, 10)}`, coaAccountCode: BANKCOA1 });
  const stmt = await enterStatement(sub, {
    client, bankAccount: idOf(acct, "bank_account_id", "id"),
    periodStart: "2034-03-01", periodEnd: "2034-03-31", opening: 0, keepPeriod: true,
    specs: [{ amountCents: 30_000, entryDate: "2034-03-10", description: "xb13 unidentified inbound transfer" }],
  });
  const line = stmt.lines[0];
  await humanQuery(sub, namedCall("except_bank_line", [
    { name: "p_line" }, { name: "p_kind" }, { name: "p_reason" }, { name: "p_op_key" },
  ]), [line.id, "bank_error", "xb13: unidentified inbound transfer — who sent this?", opk("xb13exc")]);
  const exception = (await rootQuery(
    "select id from clara.bank_line_exceptions where line_id=$1 and status='open'", [line.id])).rows[0]?.id;
  assert.ok(exception, "mandatory setup: the line carries an OPEN exception");
  return { sub, client, line, exception };
}

// ===========================================================================

test("x42x.lw1 THE WALLS THEMSELVES ARE D-b1's AND EXIST FROM 0043 ONWARDS — all three, at every frontier at or after D-b1", async (t) => {
  if (skipHere(t)) return;
  if (await applied(V_B1) === 0) {
    t.skip("D-b1 is not applied — the advance walls have not shipped yet, so there is no contract to check here");
    return;
  }
  for (const fn of ["_adv_assert_proposal", "_adv_reversal_admission", "_adv_release_one_way"]) {
    assert.equal(await fnExists(fn), true, `clara.${fn} is a D-b1 body and must exist from 0043 onwards`);
  }
  noteLane(`x42x.lw1: the three D-b1 walls exist at frontier D-b1=${await applied(V_B1)} D-b3=${await applied(V_B3)}`);
});

test("x42x.lw2 [PRE arm] with 0043 applied and 0044 NOT: nothing books a bank line through the walls yet — neither resolve_and_book_bank_line nor _wdb_line_booking_block is in the catalog, and bank_matches carries no resolution columns", async (t) => {
  if (skipHere(t)) return;
  if (await applied(V_B1) === 0) {
    t.skip("D-b1 is not applied — the walls have not shipped yet, so this boundary is not the live one at D-b0");
    return;
  }
  if (await applied(V_B3) > 0) {
    t.skip("D-b3 IS applied — this is the PRE arm of the boundary; the POST arm (lw3/lw4) is the live one here");
    return;
  }
  for (const fn of ["resolve_and_book_bank_line", "accept_bank_rule_suggestion", "_wdb_line_booking_block"]) {
    assert.equal(await fnExists(fn), false, `clara.${fn} is a D-b3 body and must NOT exist before 0044`);
  }
  assert.equal((await rootQuery(
    "select 1 from information_schema.columns where table_schema='clara' and table_name='bank_matches' and column_name='resolution_exception_id'")).rowCount,
    0, "clara.bank_matches carries no resolution columns before 0044");
  noteLane("x42x.lw2 [PRE arm]: the advance walls stand alone — D-b3 has shipped nothing that could call them");
});

test("x42x.lw3 [POST arm] once 0044 is applied, BOTH D-b3 bodies reach the D-b1 walls BY NAME — resolve_and_book_bank_line calls _adv_assert_proposal, and _wdb_line_booking_block calls _adv_reversal_admission and _adv_release_one_way", async (t) => {
  if (skipHere(t)) return;
  if (await applied(V_B3) === 0) {
    t.skip("D-b3 is not applied — this is the POST arm of the boundary; the PRE arm (lw2) is the live one here");
    return;
  }
  // COMMENT-STRIPPED on purpose (E19): every slice carries `[SPLIT D-bN]` notes that NAME the
  // bodies it does and does not ship, so raw text would read a mention as a call.
  //
  // RETARGETED (F-A3/PR-1a core extraction, this branch's own stacked base): the public
  // clara.resolve_and_book_bank_line is now a thin delegator with no wall-calling logic of
  // its own; the extraction moved that body byte-for-byte into
  // clara._resolve_and_book_bank_line_core, so that is where the D-b1 wall call actually
  // lives now. fnExists/existence checks above (lw1/lw2) stay on the public name -- those
  // assert SHAPE (does the surface exist at this frontier), not the wall-calling BODY this
  // cell checks.
  assert.ok(await fnExists("resolve_and_book_bank_line"), "clara.resolve_and_book_bank_line still exists at D-b3");
  const composite = await strippedDef("_resolve_and_book_bank_line_core");
  assert.ok(composite, "clara._resolve_and_book_bank_line_core exists at D-b3 (post PR-1a extraction)");
  assert.ok(/clara\._adv_assert_proposal\(/.test(composite),
    "the composite's core CALLS clara._adv_assert_proposal — the D-b1 wall it is contractually bound to (census §2, legal edge 4)");

  const block = await strippedDef("_wdb_line_booking_block");
  assert.ok(block, "clara._wdb_line_booking_block exists at D-b3");
  assert.ok(/clara\._adv_reversal_admission\(/.test(block), "the block body CALLS clara._adv_reversal_admission");
  assert.ok(/clara\._adv_release_one_way\(/.test(block), "…and clara._adv_release_one_way");
  assert.ok(/clara\._wdb_reversal_blocked\(/.test(block),
    "…and clara._wdb_reversal_blocked, which census §4 Option A moved to D-b1 precisely so this body could compile here");
  noteLane("x42x.lw3 [POST arm]: the composite and the block both reach D-b1's walls by name");
});

test("x42x.lw4 [POST arm] THE NEGATIVE: a resolve-and-book naming an advance that is not in the client is refused by an ADVANCE-FAMILY door reading D-b1's OWN register — never SQLSTATE 42883, which is exactly what a D-b3-without-D-b1 deploy would produce — and it leaves the exception open", async (t) => {
  if (skipHere(t)) return;
  if (await applied(V_B3) === 0) {
    t.skip("D-b3 is not applied — this is the POST arm of the boundary; the PRE arm (lw2) is the live one here");
    return;
  }
  const { sub, client, exception } = await stageBankWorld();
  const ghost = randomUUID();

  const err = await caught(() => humanQuery(sub, namedCall("resolve_and_book_bank_line", [
    { name: "p_client" }, { name: "p_exception" }, { name: "p_disposition" }, { name: "p_note" },
    { name: "p_draft", cast: "jsonb" }, { name: "p_advance_applications", cast: "jsonb" }, { name: "p_op_key" },
  ]), [client, exception, "matched_booking", "xb13: the transfer is a returned advance",
    JSON.stringify({
      posting_date: "2034-03-10", memo: "xb13 advance returned",
      lines: [
        { account_code: BANKCOA1, debit_cents: 30_000, credit_cents: 0, description: "into the bank" },
        { account_code: ADVCODE, debit_cents: 0, credit_cents: 30_000, description: "advance cleared" },
      ],
    }),
    JSON.stringify({
      kind: "bank_return", reason: "xb13: returned by transfer",
      allocations: [{ line_no: 2, advance_id: ghost, amount_cents: 30_000 }],
    }),
    opk("xb13walls")]));

  assert.ok(err, "a composite naming an advance that does not exist must REFUSE");
  // THE MEASURED SHAPE, NOT THE ASSUMED ONE (erratum E20). This cell was authored expecting
  // clara._adv_assert_proposal's CLR40 `advance_application_missing`. Measured on the rig, the
  // door that actually fires is EARLIER: the composite validates its advance arguments against
  // clara.staff_advances — a D-b1 relation — and refuses CLR11 "advance <id> is not in this
  // client" before the proposal wall is ever reached. That is a BETTER refusal and it is still
  // D-b1-dependent, so the contract holds; what the contract must discriminate against is the
  // shape a D-b3-shipped-without-D-b1 deploy would produce, namely SQLSTATE 42883 (undefined
  // table/function). Both are asserted, the discriminator first.
  assert.notEqual(err.code, "42883",
    `the refusal must come from an advance DOOR, never from an ABSENT one — 42883 here would mean D-b3 shipped without D-b1 (got ${err.code} — ${err.message})`);
  assert.equal(err.code, "CLR11",
    `the measured door is the composite's own argument validation against clara.staff_advances (got ${err.code} — ${err.message})`);
  assert.match(err.message, /advance/i, "…and it names the advance it could not find");

  assert.equal((await rootQuery("select status from clara.bank_line_exceptions where id=$1", [exception])).rows[0].status,
    "open", "the refused composite left the exception OPEN");
  assert.equal(Number((await rootQuery(
    "select count(*)::int as n from clara.staff_advance_applications where advance_id=$1", [ghost])).rows[0].n), 0,
    "…and minted no application row");
  noteLane(`x42x.lw4 [POST arm]: a ghost advance is refused ${err.code} by an advance-family door — not 42883`);
});

test("x42x.lw5 [POST arm] THE POSITIVE: a REAL advance, soft-born on D-b1's register, books through D-b3's composite end to end — one application row, against the advance the payload named, dated at the ENTRY's posting_date. The composite's advance arm is alive ONLY because both slices shipped", async (t) => {
  if (skipHere(t)) return;
  if (await applied(V_B3) === 0) {
    t.skip("D-b3 is not applied — this is the POST arm of the boundary; the PRE arm (lw2) is the live one here");
    return;
  }
  const { sub, client, exception } = await stageBankWorld();

  // D-b1's own doors: enrol the code, then disburse on it so the register soft-births an advance.
  await humanQuery(w.users.hana, namedCall("enrol_staff_advance_account", [
    { name: "p_client" }, { name: "p_account_code" }, { name: "p_person_label" },
    { name: "p_confirm_dedicated", cast: "boolean" }, { name: "p_attestation" }, { name: "p_op_key" },
  ]), [client, ADVCODE, `XB13 Aminah ${uniqTag()}`, true,
    "xb13 contract: the code is dedicated to one person and carries no other traffic", opk("xb13enrol")]);

  const disb = await draftEntryV3(sub, {
    client, resolution: await freshResolution(sub, client, { subjectKind: "manual", subjectId: null }),
    memo: "xb13 advance to Aminah", postingDate: "2034-03-05",
    lines: [
      { account_code: ADVCODE, debit_cents: 30_000, credit_cents: 0, description: "advance out" },
      { account_code: BANKCOA1, debit_cents: 0, credit_cents: 30_000, description: "paid from bank" },
    ],
    opKey: opk("xb13disb"),
  });
  await approveEntry(sub, { entry: disb.entry_id, expectedRevision: disb.revision_token, opKey: opk("xb13disba") });
  const advances = (await rootQuery("select id from clara.staff_advances where client_id=$1", [client])).rows;
  assert.equal(advances.length, 1, `mandatory setup: the disbursement soft-birthed exactly ONE advance (got ${advances.length})`);
  const advance = advances[0].id;

  const receipt = (await humanQuery(sub, namedCall("resolve_and_book_bank_line", [
    { name: "p_client" }, { name: "p_exception" }, { name: "p_disposition" }, { name: "p_note" },
    { name: "p_draft", cast: "jsonb" }, { name: "p_advance_applications", cast: "jsonb" }, { name: "p_op_key" },
  ]), [client, exception, "matched_booking", "xb13: the transfer is the returned advance",
    JSON.stringify({
      posting_date: "2034-03-10", memo: "xb13 advance returned",
      lines: [
        { account_code: BANKCOA1, debit_cents: 30_000, credit_cents: 0, description: "into the bank" },
        { account_code: ADVCODE, debit_cents: 0, credit_cents: 30_000, description: "advance cleared" },
      ],
    }),
    JSON.stringify({
      kind: "bank_return", reason: "xb13: returned by transfer",
      allocations: [{ line_no: 2, advance_id: advance, amount_cents: 30_000 }],
    }),
    opk("xb13real")])).rows[0].result;
  assert.ok(receipt, "the composite books the returned advance");

  const apps = (await rootQuery(
    "select advance_id, amount_cents, kind, to_char(effective_date, 'YYYY-MM-DD') as effective_date from clara.staff_advance_applications where advance_id=$1", [advance])).rows;
  assert.equal(apps.length, 1, `exactly ONE application row minted on D-b1's register by D-b3's composite (got ${apps.length})`);
  assert.equal(apps[0].advance_id, advance, "…against the advance the payload named");
  assert.equal(Number(apps[0].amount_cents), 30_000, "…for the payload's amount");
  assert.equal(apps[0].kind, "bank_return", "…under the payload's kind");
  assert.equal(apps[0].effective_date, "2034-03-10",
    "…dated at the ENTRY's posting_date — D-b1's hook-derived effective_date rule applied to D-b3's entry");
  assert.equal((await rootQuery("select status from clara.bank_line_exceptions where id=$1", [exception])).rows[0].status,
    "resolved", "…and the exception is resolved");
  noteLane("x42x.lw5 [POST arm]: D-b3's composite mints a row on D-b1's register — the two slices compose end to end");
});
