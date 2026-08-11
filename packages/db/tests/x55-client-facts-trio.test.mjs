// 0055 (Wave E lane alpha, E-R12 trio) rig -- PART 1: the F-1 subledger
// battery (F1a/F1b/F1c/F1e/F1f), the role battery, and F2a (the context-pack
// splice). packages/db/migrations/0055_client_facts_trio.sql. Matrix: docs/plan/
// wave-e-acceptance-matrix.md §6 Section F (cells F1a-F4). Design home:
// docs/plan/active/wave-e-design-skeleton-part4.md §3. Fixture helpers live in the
// sibling x55-fixtures.mjs; PART 2 (F3a-shape/F3d/F3f/F4/door refusals) lives
// in x55-client-facts-door.test.mjs (the repo's 500-line gate split, x38/x40
// precedent).
//
// CONTRACT-BLIND on 0055 itself: every structural claim (F1a's identity/census/
// item_date-not-null; the S2 apply-path guard; the door's ACL) is probed off the
// LIVE CATALOG (pg_proc.prosrc / pg_get_functiondef / pg_attribute / has_
// function_privilege), never by reading 0055_client_facts_trio.sql. F2a's claim
// is asserted on the RETURNED get_context_pack JSON, never on migration source
// (the matrix's own "spelling is not identity" / "derived state" laws).
//
// House idioms reused, not reinvented: rootQuery/humanQuery/roleQuery/ROLES/CLR/
// PG/opk/assertRaises/reasonOf from the wave-a-fixtures chain (studied via
// x52-contact-person-facts.test.mjs); the subledger fixture shapes are REBUILT
// LOCALLY (x55-fixtures.mjs) verbatim from the pinned interfaces proven live in
// x37-wave-c-a-subledger.test.mjs / x40-wave-c-c-tieout.test.mjs; the onboarding-
// plan lifecycle and get_context_pack reads reuse wave-b/wb-fixtures.mjs
// directly -- the proven contributor/distinct-checker shape from wb-o-lifecycle
// .test.mjs's own working O4 commit cell (open admin != answer bookkeeper !=
// commit owner).
//
// _book_today() (the apply-path guard's clock) reads statement_timestamp() in
// Asia/Kuala_Lumpur -- the REAL wall-clock date, un-mockable from the rig. Cells
// that need a "future" item read clara._book_today() once and offset from it.
//
// Loud, counted skips when 0055 is absent (the x52 idiom) -- safe to run against
// a pre-0055 target.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  rootQuery, roleQuery, ROLES, CLR, PG, idOf, upsertAccountClassed,
  endPool, printLaneNotes, noteLane, printSkipCount, markSkip,
  waveAEnsureReady, reasonOf, opk, assertRaises,
} from "./wave-a-fixtures.mjs";
import * as wb from "./wave-b/wb-fixtures.mjs";
import { addBankAccount, enterStatement, settleFromBankLine } from "./x38-match-fixtures.mjs";
import {
  has0055, setupCoa, AR1, REVN, caught,
  birthCounterparty, approvedGeneric, itemsOf, outstandingOf,
  openArItem, openApItem, allocateReceipt, allocatePayment, applyOpenItems, groupOf,
  controlGlAsOf, arTotalsAt, bookToday, addDaysStr, recordClientFact, committedClientWithEntityType,
} from "./x55-fixtures.mjs";

let ready = false;
let has55 = false;
let world = null;

function skip55(t) {
  if (!ready || !has55) {
    markSkip();
    t.skip("0055 (client-facts trio) not present");
    return true;
  }
  return false;
}

before(async () => {
  ready = await waveAEnsureReady();
  if (!ready) { noteLane("0011 surface absent -- x55 suite skipped"); return; }
  has55 = await has0055();
  if (!has55) { noteLane("0055 not applied -- client-facts trio absent"); return; }
  world = await wb.buildWaveBWorld();
  await setupCoa(world.users.alice, world.clients.A1);
  await setupCoa(world.users.alice, world.clients.A2);
});
after(async () => { printLaneNotes("x55-client-facts-trio"); printSkipCount("x55-client-facts-trio"); await endPool(); });

// ===========================================================================
// 1. F1a -- IDENTITY (verify-first, before any new code): the wrapper/core
// delegation, the wall's identity (predicate + reason token, exactly once per
// core), the positive caller census, and open_items.item_date NOT NULL.
// ===========================================================================

test("F1a IDENTITY -- allocate_receipt/allocate_payment delegate to their cores; each core carries the unborn-item wall exactly once; the caller census is exactly the three known callers; open_items.item_date is NOT NULL", async (t) => {
  if (skip55(t)) return;
  const WALL = "if i.item_date is not null and p_posting_date < i.item_date then";
  for (const [wrapperSig, coreName] of [
    ["clara.allocate_receipt(uuid,uuid,date,text,text,bigint,jsonb,text,bigint,text,text,text)", "_allocate_receipt_core"],
    ["clara.allocate_payment(uuid,uuid,date,text,text,bigint,jsonb,text,bigint,text,text,text)", "_allocate_payment_core"],
  ]) {
    const wrapperSrc = (await rootQuery(
      "select coalesce(nullif(p.prosrc,''), pg_get_functiondef(p.oid)) as s from pg_proc p where p.oid=$1::regprocedure",
      [wrapperSig],
    )).rows[0].s;
    assert.ok(wrapperSrc.includes(`clara.${coreName}(`), `the live wrapper for ${wrapperSig} delegates to clara.${coreName}`);

    const coreCount = (await rootQuery(
      "select count(*)::int as n from pg_proc p where p.pronamespace='clara'::regnamespace and p.proname=$1",
      [coreName],
    )).rows[0].n;
    assert.equal(coreCount, 1, `clara.${coreName} exists at exactly one arity (an overloaded core is two behaviours wearing one name)`);

    const coreSrc = (await rootQuery(
      `select coalesce(nullif(p.prosrc,''), pg_get_functiondef(p.oid)) as s from pg_proc p
        where p.pronamespace='clara'::regnamespace and p.proname=$1`,
      [coreName],
    )).rows[0].s;
    const wallCount = coreSrc.split(WALL).length - 1;
    assert.equal(wallCount, 1, `the unborn-item predicate appears exactly once in clara.${coreName} (got ${wallCount})`);
    const reasonCount = coreSrc.split("allocation_to_unborn_item").length - 1;
    assert.equal(reasonCount, 1, `allocation_to_unborn_item appears exactly once in clara.${coreName} (got ${reasonCount})`);
  }

  const census = (await rootQuery(
    `select coalesce(array_agg(p.proname::text order by p.proname), '{}') as c
       from pg_proc p
      where p.pronamespace='clara'::regnamespace
        and p.proname not in ('_allocate_receipt_core','_allocate_payment_core')
        and (p.prosrc like '%\\_allocate\\_receipt\\_core(%' escape '\\'
          or p.prosrc like '%\\_allocate\\_payment\\_core(%' escape '\\')`,
  )).rows[0].c;
  assert.deepEqual(census, ["_settle_from_bank_line_core", "allocate_payment", "allocate_receipt"],
    `the allocation-core caller census, read live (got ${JSON.stringify(census)}) -- a caller appeared or vanished`);

  const notnull = (await rootQuery(
    "select attnotnull as v from pg_attribute where attrelid='clara.open_items'::regclass and attname='item_date'",
  )).rows[0].v;
  assert.equal(notnull, true, "clara.open_items.item_date is NOT NULL -- the wall's predicate short-circuits on NULL");
});

// ===========================================================================
// 2. F1b -- RIGHT ANSWER (the advance/deposit flow): money received before the
// bill exists posts as an advance; once the invoice exists, apply_open_items
// pairs them; AR aging ties to the control GL in cents.
// ===========================================================================

test("F1b RIGHT ANSWER -- money received BEFORE the bill exists books as an advance; apply_open_items pairs it once the invoice exists; AR aging ties to control in cents", async (t) => {
  if (skip55(t)) return;
  const sub = world.users.alice;
  const client = world.clients.A1;
  const today = await bookToday();
  const receiptDate = addDaysStr(today, -20);
  const invoiceDate = addDaysStr(today, -10);
  const cp = await birthCounterparty(sub, { client, name: `X55 F1B ${randomUUID().slice(0, 6)}`, kind: "customer" });

  // The advance: a receipt with EMPTY allocations books the cash and mints a
  // settlement (on-account credit) open item -- no invoice exists yet.
  const receipt = await allocateReceipt(sub, { client, counterparty: cp, postingDate: receiptDate, amountCents: 70000, allocations: [] });
  const settleItems = await itemsOf(receipt.entry_id);
  assert.equal(settleItems.length, 1, "an unallocated receipt mints exactly one settlement item");
  assert.equal(settleItems[0].item_kind, "settlement");
  assert.equal(Number(settleItems[0].amount_cents), -70000, "the settlement item is the full receipt, as an on-account credit");

  // Later: the invoice arrives.
  const inv = await openArItem(sub, { client, cp, cents: 50000, postingDate: invoiceDate });

  // apply_open_items pairs the advance's credit against the new invoice -- the
  // sanctioned remedy the F1c/F1e refusal messages themselves name.
  const applyReceipt = await applyOpenItems(sub, {
    client, applications: [{ source_item_id: settleItems[0].id, target_item_id: inv.item, amount_cents: 50000 }],
  });
  assert.ok(applyReceipt, "apply_open_items SUCCEEDS -- the guard is not a brick");
  assert.equal(await outstandingOf(inv.item), 0, "the invoice is fully settled by the advance");
  assert.equal(await outstandingOf(settleItems[0].id), -20000, "the advance's residual on-account credit remains");

  for (const asOf of [today, addDaysStr(today, 5)]) {
    const aging = await arTotalsAt(sub, client, asOf);
    const control = await controlGlAsOf(client, "ar", asOf);
    assert.equal(Number(aging.totals.total_cents), control, `AR aging ties to the control GL at as_of=${asOf} (aging=${aging.totals.total_cents}, control=${control})`);
  }
});

// ===========================================================================
// 3. F1c -- REFUSAL (allocate_receipt / allocate_payment): an open item dated
// LATER than the caller's own posting_date refuses CLR10 allocation_to_unborn_
// item, carrying item_id/item_date/posting_date; no override argument exists;
// the SAME-day boundary passes (predicate is strict <, not <=).
// ===========================================================================

test("F1c allocate_receipt/allocate_payment REFUSE an allocation dated before the item's own item_date -- allocation_to_unborn_item, no override; the same-day boundary PASSES", async (t) => {
  if (skip55(t)) return;
  const sub = world.users.alice;
  const client = world.clients.A1;
  // Derived from the guard's own clock, never hard-coded (review R1 MN-5: a fixed
  // "2028-06-01" would silently invert the cell the day the calendar catches up).
  const future = addDaysStr(await bookToday(), 400);
  const cust = await birthCounterparty(sub, { client, name: `X55 F1C CUST ${randomUUID().slice(0, 6)}`, kind: "customer" });
  const vend = await birthCounterparty(sub, { client, name: `X55 F1C VEND ${randomUUID().slice(0, 6)}`, kind: "vendor" });
  const inv = await openArItem(sub, { client, cp: cust, cents: 40000, postingDate: future });
  const bill = await openApItem(sub, { client, cp: vend, cents: 25000, postingDate: future });

  const errR = await caught(() => allocateReceipt(sub, {
    client, counterparty: cust, postingDate: "2020-01-01", amountCents: 40000,
    allocations: [{ item_id: inv.item, amount_cents: 40000 }],
  }));
  assert.ok(errR, "allocate_receipt against a not-yet-born item must be refused");
  assert.equal(errR.code, "CLR10", `expected CLR10 (got ${errR.code} -- ${errR.message})`);
  assert.equal(reasonOf(errR), "allocation_to_unborn_item");
  assert.match(errR.message ?? "", new RegExp(inv.item), "the raise names the item_id");
  // The matrix cell's EXACT assertion (F1c): the detail carries item_id, item_date AND
  // posting_date -- a reason token alone is a weaker paraphrase (review R1 MJ-2). A refusal
  // surface renders from this payload; each field is asserted, not assumed.
  const detR = JSON.parse(errR.detail ?? "{}");
  assert.equal(detR.item_id, inv.item, "detail.item_id names the unborn item");
  assert.equal(String(detR.item_date), future, "detail.item_date is the item's own date");
  assert.equal(String(detR.posting_date), "2020-01-01", "detail.posting_date is the refused settlement date");
  assert.equal(await outstandingOf(inv.item), 40000, "the refused call left the item untouched");

  const errP = await caught(() => allocatePayment(sub, {
    client, counterparty: vend, postingDate: "2020-01-01", amountCents: 25000,
    allocations: [{ item_id: bill.item, amount_cents: 25000 }],
  }));
  assert.ok(errP, "allocate_payment against a not-yet-born item must be refused");
  assert.equal(errP.code, "CLR10", `expected CLR10 (got ${errP.code} -- ${errP.message})`);
  assert.equal(reasonOf(errP), "allocation_to_unborn_item");
  const detP = JSON.parse(errP.detail ?? "{}");
  assert.equal(detP.item_id, bill.item, "detail.item_id names the unborn item (payment side)");
  assert.equal(String(detP.item_date), future, "detail.item_date (payment side)");
  assert.equal(String(detP.posting_date), "2020-01-01", "detail.posting_date (payment side)");
  assert.equal(await outstandingOf(bill.item), 25000, "the refused call left the item untouched");

  // The boundary: SAME-day allocation PASSES (the predicate is <, not <=) -- BOTH sides.
  const okR = await allocateReceipt(sub, {
    client, counterparty: cust, postingDate: future, amountCents: 40000,
    allocations: [{ item_id: inv.item, amount_cents: 40000 }],
  });
  assert.ok(okR, "a same-day allocation against the item's own item_date must succeed");
  assert.equal(await outstandingOf(inv.item), 0, "the same-day allocation settled the item");

  const okP = await allocatePayment(sub, {
    client, counterparty: vend, postingDate: future, amountCents: 25000,
    allocations: [{ item_id: bill.item, amount_cents: 25000 }],
  });
  assert.ok(okP, "a same-day allocation via allocate_payment against the item's own item_date must ALSO succeed (payment-side boundary)");
  assert.equal(await outstandingOf(bill.item), 0, "the same-day payment settled the item");

  // No override argument exists on either function.
  for (const sig of [
    "clara.allocate_receipt(uuid,uuid,date,text,text,bigint,jsonb,text,bigint,text,text,text)",
    "clara.allocate_payment(uuid,uuid,date,text,text,bigint,jsonb,text,bigint,text,text,text)",
  ]) {
    const args = (await rootQuery("select pg_get_function_identity_arguments($1::regprocedure) as a", [sig])).rows[0].a;
    assert.doesNotMatch(args, /override/i, `${sig} carries no override argument (got: ${args})`);
  }
});

// ===========================================================================
// 3b. THE COMPOSITE/PREHELD PATH -- the wall is inherited by the THIRD census
// member too (F1a's own count: _settle_from_bank_line_core, allocate_payment,
// allocate_receipt), not just the two public wrappers. settle_from_bank_line
// calls clara._allocate_receipt_core DIRECTLY (0044:1927), so a bank-line
// settlement against a not-yet-born item must refuse identically.
// ===========================================================================

test("Composite path -- settle_from_bank_line REFUSES a not-yet-born item exactly like the public wrappers (the wall's third caller)", async (t) => {
  if (skip55(t)) return;
  const sub = world.users.alice;
  const client = world.clients.A1;
  const future = addDaysStr(await bookToday(), 400);
  const bankCoa = "171-C55";
  await upsertAccountClassed(sub, { client, code: bankCoa, name: "Bank GL (x55 composite)", type: "asset", opKey: opk("x55-bankgl") });
  const bankAcct = await addBankAccount(sub, {
    client, bankCode: "MBB", accountNumber: `1099${randomUUID().slice(0, 10)}`, coaAccountCode: bankCoa,
  });
  const bankAccountId = idOf(bankAcct, "bank_account_id", "id");
  const cust = await birthCounterparty(sub, { client, name: `X55 COMPOSITE ${randomUUID().slice(0, 6)}`, kind: "customer" });
  const inv = await openArItem(sub, { client, cp: cust, cents: 40000, postingDate: future });

  const stmt = await enterStatement(sub, {
    client, bankAccount: bankAccountId, periodStart: "2026-09-01", periodEnd: "2026-09-30", opening: 0,
    specs: [{ amountCents: 40000, entryDate: "2026-09-10" }], keepPeriod: true,
  });

  const err = await caught(() => settleFromBankLine(sub, {
    client, line: stmt.lines[0].id, counterparty: cust,
    allocations: [{ item_id: inv.item, amount_cents: 40000 }],
    postingDate: "2026-09-10", controlAccount: AR1,
  }));
  assert.ok(err, "a settlement against a not-yet-born item must be refused through the composite path too");
  assert.equal(err.code, "CLR10", `expected CLR10 (got ${err.code} -- ${err.message})`);
  assert.equal(reasonOf(err), "allocation_to_unborn_item");
  assert.equal(await outstandingOf(inv.item), 40000, "the refused composite call left the item untouched");
});

// ===========================================================================
// 4. F1e -- the APPLY-PATH guard: a future-dated source item against a
// historical target REFUSES CLR10 apply_before_item_date.
// ===========================================================================

test("F1e apply_open_items REFUSES pairing a future-dated source item against a historical target -- apply_before_item_date", async (t) => {
  if (skip55(t)) return;
  const sub = world.users.alice;
  const client = world.clients.A2;
  const today = await bookToday();
  const past = addDaysStr(today, -30);
  const future = addDaysStr(today, 30);
  const cp = await birthCounterparty(sub, { client, name: `X55 F1E ${randomUUID().slice(0, 6)}`, kind: "customer" });
  const inv = await openArItem(sub, { client, cp, cents: 80000, postingDate: past });
  // The credit note: Dr revenue / Cr receivable control -- a NEGATIVE ar item,
  // dated in the FUTURE relative to clara._book_today() (the guard's own clock).
  const credEntry = await approvedGeneric(sub, { client, cp, cpKind: "customer", debit: REVN, credit: AR1, cents: 30000, postingDate: future, memo: "x55 future credit note" });
  const credItems = await itemsOf(credEntry);
  assert.equal(credItems.length, 1);
  const cred = credItems[0];
  assert.equal(Number(cred.amount_cents), -30000, "a receivable credit nets to a NEGATIVE ar item");

  const err = await caught(() => applyOpenItems(sub, {
    client, applications: [{ source_item_id: cred.id, target_item_id: inv.item, amount_cents: 30000 }],
  }));
  assert.ok(err, "applying a future-dated source item must be refused");
  assert.equal(err.code, "CLR10", `expected CLR10 (got ${err.code} -- ${err.message})`);
  assert.equal(reasonOf(err), "apply_before_item_date");
  // The guard's full detail shape (review R1 MJ-2): both items, both dates, and the clock
  // the refusal was measured against.
  const det = JSON.parse(err.detail ?? "{}");
  assert.equal(det.source_item_id, cred.id, "detail.source_item_id");
  assert.equal(String(det.source_item_date), future, "detail.source_item_date");
  assert.equal(det.target_item_id, inv.item, "detail.target_item_id");
  assert.equal(String(det.target_item_date), past, "detail.target_item_date");
  assert.equal(String(det.book_today), today, "detail.book_today is the guard's own clock");
  assert.equal(await outstandingOf(inv.item), 80000, "the refused apply left the historical target untouched");
  assert.equal(await outstandingOf(cred.id), -30000, "and the future-dated source untouched");

  // The guard is greatest(si, ti): a future-dated TARGET refuses identically (review R1
  // MN-4) -- a historical credit against an invoice that does not yet exist is the same
  // aging break reached from the other side.
  const invFut = await openArItem(sub, { client, cp, cents: 50000, postingDate: future });
  const credPastEntry = await approvedGeneric(sub, { client, cp, cpKind: "customer", debit: REVN, credit: AR1, cents: 20000, postingDate: past, memo: "x55 historical credit vs future target" });
  const credPast = (await itemsOf(credPastEntry))[0];
  const errT = await caught(() => applyOpenItems(sub, {
    client, applications: [{ source_item_id: credPast.id, target_item_id: invFut.item, amount_cents: 20000 }],
  }));
  assert.ok(errT, "applying against a future-dated TARGET must be refused");
  assert.equal(errT.code, "CLR10");
  assert.equal(reasonOf(errT), "apply_before_item_date");
  assert.equal(await outstandingOf(invFut.item), 50000, "the future target untouched");
  assert.equal(await outstandingOf(credPast.id), -20000, "the historical source untouched");
});

// ===========================================================================
// 5. F1f -- RIGHT ANSWER: same-day AND historical apply_open_items pairs both
// SUCCEED; the allocation pair shares ONE effective_date; AR aging ties to
// control at as_of=today and a later date.
// ===========================================================================

test("F1f RIGHT ANSWER -- same-day AND historical apply_open_items pairs both succeed; the allocation pair shares ONE effective_date; AR aging ties to control at two as-ofs", async (t) => {
  if (skip55(t)) return;
  const sub = world.users.alice;
  const client = world.clients.A2;
  const today = await bookToday();
  const cp = await birthCounterparty(sub, { client, name: `X55 F1F ${randomUUID().slice(0, 6)}`, kind: "customer" });

  // Same-day pair.
  const invSame = await openArItem(sub, { client, cp, cents: 20000, postingDate: today });
  const credSameEntry = await approvedGeneric(sub, { client, cp, cpKind: "customer", debit: REVN, credit: AR1, cents: 20000, postingDate: today, memo: "x55 same-day credit" });
  const credSame = (await itemsOf(credSameEntry))[0];
  const applySame = await applyOpenItems(sub, {
    client, applications: [{ source_item_id: credSame.id, target_item_id: invSame.item, amount_cents: 20000 }],
  });
  assert.ok(applySame, "the same-day apply SUCCEEDS");
  const groupSame = groupOf(applySame);
  assert.ok(groupSame, "the receipt names its application_group");
  // effective_date::text -- reading the bare `date` column lets node-pg parse it into a
  // LOCAL-midnight JS Date, and comparing that via toISOString() rolls back a UTC calendar
  // day on any positive-offset host. Casting to text in SQL sidesteps client-side tz entirely.
  const allocRowsSame = (await rootQuery(
    "select effective_date::text as effective_date from clara.open_item_allocations where application_group=$1", [groupSame],
  )).rows;
  assert.equal(allocRowsSame.length, 2, "the pair writes exactly two allocation rows");
  const datesSame = new Set(allocRowsSame.map((r) => r.effective_date));
  assert.equal(datesSame.size, 1, `the pair shares ONE effective_date (got ${[...datesSame]})`);
  assert.equal([...datesSame][0], today, `the shared effective_date IS the act date (today), not merely a shared one (got ${[...datesSame][0]})`);

  // Historical pair, at DIFFERENT item dates.
  const histTarget = addDaysStr(today, -40);
  const histSource = addDaysStr(today, -10);
  const invHist = await openArItem(sub, { client, cp, cents: 15000, postingDate: histTarget });
  const credHistEntry = await approvedGeneric(sub, { client, cp, cpKind: "customer", debit: REVN, credit: AR1, cents: 15000, postingDate: histSource, memo: "x55 historical credit" });
  const credHist = (await itemsOf(credHistEntry))[0];
  const applyHist = await applyOpenItems(sub, {
    client, applications: [{ source_item_id: credHist.id, target_item_id: invHist.item, amount_cents: 15000 }],
  });
  assert.ok(applyHist, "the historical apply SUCCEEDS");
  const groupHist = groupOf(applyHist);
  const allocRowsHist = (await rootQuery(
    "select effective_date::text as effective_date from clara.open_item_allocations where application_group=$1", [groupHist],
  )).rows;
  const datesHist = new Set(allocRowsHist.map((r) => r.effective_date));
  assert.equal(datesHist.size, 1, `the historical pair also shares ONE effective_date (got ${[...datesHist]})`);
  assert.equal([...datesHist][0], today, `the historical pair's effective_date is ALSO the act date (today) -- act-dating, not either ITEM's own date (histTarget=${histTarget}, histSource=${histSource}, got ${[...datesHist][0]})`);

  for (const asOf of [today, addDaysStr(today, 5)]) {
    const aging = await arTotalsAt(sub, client, asOf);
    const control = await controlGlAsOf(client, "ar", asOf);
    assert.equal(Number(aging.totals.total_cents), control, `AR aging ties to control at as_of=${asOf} (aging=${aging.totals.total_cents}, control=${control})`);
  }
});

// ===========================================================================
// 6. Role battery -- the door / allocate_receipt / apply_open_items under
// clara_agent_ro refuse 42501 BEFORE any body runs; the door's floor is
// admin+ (a bookkeeper refuses CLR04, an admin passes).
// ===========================================================================

test("Role battery -- clara_agent_ro holds NO execute on the door, allocate_receipt, or apply_open_items: 42501 before any body runs", async (t) => {
  if (skip55(t)) return;
  await assertRaises(PG.insufficientPrivilege, () => roleQuery(
    ROLES.agentRo,
    `select clara.record_client_fact(p_client => $1, p_fact_key => $2, p_fact_value => $3::jsonb,
       p_basis => $4, p_basis_kind => $5, p_source_document_id => $6, p_op_key => $7) as r`,
    [randomUUID(), "msic", '"68109"', "x", "owner_instruction", null, opk("x55-ro-door")],
  ), "agent_ro record_client_fact");

  await assertRaises(PG.insufficientPrivilege, () => roleQuery(
    ROLES.agentRo,
    `select clara.allocate_receipt(p_client => $1, p_counterparty => $2, p_posting_date => $3::date,
       p_memo => $4, p_bank_account => $5, p_amount_cents => $6::bigint, p_allocations => $7::jsonb,
       p_op_key => $8, p_control_account => $9) as r`,
    [randomUUID(), randomUUID(), "2026-01-01", "x", "x", 100, "[]", opk("x55-ro-ar"), AR1],
  ), "agent_ro allocate_receipt");

  await assertRaises(PG.insufficientPrivilege, () => roleQuery(
    ROLES.agentRo,
    "select clara.apply_open_items(p_client => $1, p_applications => $2::jsonb, p_reason => $3, p_op_key => $4) as r",
    [randomUUID(), "[]", "x", opk("x55-ro-apply")],
  ), "agent_ro apply_open_items");
});

test("Role battery -- record_client_fact's floor is admin+: a bookkeeper is refused CLR04, an admin passes", async (t) => {
  if (skip55(t)) return;
  const client = world.clients.A1;
  await assertRaises(CLR.authz, () => recordClientFact(world.users.bob, {
    client, factKey: "msic", factValue: "68109", basis: "x", basisKind: "owner_instruction",
  }), "bookkeeper record_client_fact");

  const ok = await recordClientFact(world.users.hana, {
    client, factKey: "msic", factValue: "68109", basis: "owner said so, by phone", basisKind: "owner_instruction",
  });
  assert.ok(ok?.fact_id, "an admin passes and a fact_id is returned");
});

// ===========================================================================
// 7. F2a -- RIGHT ANSWER: entity_type reaches the context pack's client object,
// per client, coalescing (live client_facts row) over (committed interview
// answer). Asserted on the RETURNED PACK JSON, never the migration source.
// ===========================================================================

test("F2a RIGHT ANSWER -- get_context_pack's client object carries entity_type from the committed interview answer (fallback path); msic key is present", async (t) => {
  if (skip55(t)) return;
  const client = await committedClientWithEntityType(world, { entityType: "sole_prop", name: `x55f2a_fallback_${randomUUID().slice(0, 6)}` });
  const pack = await wb.packHuman(world.users.alice, { client, purpose: "wiki_coding" });
  assert.equal(pack?.client?.entity_type, "sole_prop", "entity_type reaches the pack from the interview answer (no client_facts row exists for this client)");
  assert.ok(Object.prototype.hasOwnProperty.call(pack.client, "msic"), "the client object carries an msic key");
});

test("F2a RIGHT ANSWER -- a door-recorded fact WINS over a DIFFERING committed interview answer", async (t) => {
  if (skip55(t)) return;
  const client = await committedClientWithEntityType(world, { entityType: "sdn_bhd", name: `x55f2a_factwins_${randomUUID().slice(0, 6)}` });
  const preFact = await wb.packHuman(world.users.alice, { client, purpose: "wiki_coding" });
  assert.equal(preFact?.client?.entity_type, "sdn_bhd", "before any fact is recorded, the interview answer reads through");

  await recordClientFact(world.users.hana, {
    client, factKey: "entity_type", factValue: "sole_prop",
    basis: "owner corrected the classification: it is actually a sole proprietorship", basisKind: "owner_instruction",
  });
  const postFact = await wb.packHuman(world.users.alice, { client, purpose: "wiki_coding" });
  assert.equal(postFact?.client?.entity_type, "sole_prop", "the DOOR fact wins over the (differing) committed interview answer");
  assert.ok(Object.prototype.hasOwnProperty.call(postFact.client, "msic"), "the client object carries an msic key");
});

// PART 2 (F3a-shape, F3d, F3f, F4, the door refusal battery) lives in the
// sibling x55-client-facts-door.test.mjs -- the same 500-line gate split.
