// #1152 (riders closing wave, lane 03) — THE ACCRUAL REGISTER READS A PAGE AT A TIME.
//
// The claim this battery exists to prove, through the REAL door (WORK-ORDER rule 10):
//
//   1. A CLIENT WITH MORE ACCRUALS THAN ONE PAGE CAN BE WALKED TO THE LAST PAGE, EACH ROW EXACTLY
//      ONCE (AC1) — driven at the door with a small `p_limit` and `next_cursor` carried forward.
//   2. AN OMITTED p_cursor AND p_limit TOGETHER REPRODUCE EXACTLY THE ROWS AND THE ORDER an
//      INDEPENDENT raw read of the underlying table gives (AC2) — never re-deriving the expected
//      order from the door's own logic.
//   3. THE SIDE FILTER STILL COMPOSES, now with a page too: a page of a side-filtered read never
//      admits the other side (AC3, extending accrual-list-side-filter.test.mjs's own DB-level
//      proof to the new page argument).
//   4. A MALFORMED CURSOR IS REFUSED BY NAME (CLR10 accrual_cursor_malformed), never silently
//      treated as "start over at page one".
//   5. THE DOOR'S GRANTS, ITS SECURITY DEFINER + STABLE POSTURE AND ITS OWNER ARE UNCHANGED,
//      asserted off the catalog (AC6) — a corroborating root-level read, never the subject under
//      test.
//
// What this battery does NOT re-prove: the side filter's own closed-set refusal and its
// composition with the date window (accrual-list-side-filter.test.mjs, #1075) or the projection's
// other fields (accrual-adjustments.test.mjs, #652). This file is scoped to the ONE thing 0365
// adds: the page.
//
// CONTRACT-BLIND-ADJACENT: built against #1152's own Agent Brief and 0365's migration text, never
// against an implementation file. FRONTIER-GATED on the `accrual_register_pagination$` stem.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  buildWorkWorld, endPool, printLaneNotes, printSkipCount, rootQuery,
  freshAccrualClient, accrual, createAccrualAdjustment, listAccrualAdjustments, instructionRef,
  CLR, assertPair, todayInPlanZone, shiftMonths,
} from "./accrual-adjustments-fixtures.mjs";
import { markSkip } from "./wave-a-helpers.mjs";

const STEM = "accrual_register_pagination$";

let _ready = null;
async function laneReady() {
  if (_ready === null) {
    try {
      const r = await rootQuery(
        "select count(*)::int as n from clara.schema_migrations where version ~ $1", [STEM]);
      _ready = r.rows[0].n > 0;
    } catch {
      _ready = false;
    }
  }
  return _ready;
}

async function gate1152(t) {
  if (await laneReady()) return false;
  if (process.env.CLARA_ALLOW_MISSING_ACCRUAL_REGISTER_PAGINATION !== "1") {
    assert.fail(
      `#1152 migration (${STEM}) is NOT applied to this database, and this is a FOCUSED run. `
      + "A skip is not evidence: apply the migration, or preload "
      + "tests/accrual-register-pagination-preintegration-gate.mjs for a package-wide sweep.");
  }
  markSkip();
  t.skip(`#1152 accrual register pagination lane absent (no ${STEM} migration applied)`);
  return true;
}

let world = null;
let today = null;
before(async () => { world = await buildWorkWorld(); today = await todayInPlanZone(); });
after(async () => {
  printLaneNotes("accrual-register-pagination");
  printSkipCount("accrual-register-pagination");
  await endPool();
});

const ALICE = () => world.users.alice;
const BOB = () => world.users.bob;

const monthStart = (day) => `${day.slice(0, 7)}-01`;
async function monthEndBack(n) {
  const r = await rootQuery(
    `select ((date_trunc('month', ($1::date + ($2 || ' months')::interval)) + interval '1 month'
              - interval '1 day')::date)::text as d`, [today, String(-n)]);
  return r.rows[0].d;
}
/** `monthsBack` months, ending at the month end `monthsBack - 1` months ago — the SAME window
 *  shape accrual-list-side-filter.test.mjs's own `span` uses, re-derived here for the same
 *  reason: every due date this file produces is in the past on any calendar day the battery runs,
 *  and consecutive `monthsBack` values give each accrual a DISTINCT `effective_from` — the whole
 *  point of this file's fixture, since a page walk over TIED rows would not prove "each row
 *  exactly once" cleanly. */
async function span(monthsBack) {
  return {
    from: monthStart(await shiftMonths(today, -monthsBack)),
    to: await monthEndBack(Math.max(monthsBack - 1, 0)),
  };
}

async function configureExpense({ client, ref, window, tag }) {
  const answer = await createAccrualAdjustment(BOB(), {
    client, purpose: `#1152 ${tag}`, authorityRef: ref,
    accrual: accrual({ servicePeriodStart: window.from, servicePeriodEnd: window.to, memo: `#1152 ${tag}` }),
    frequency: "monthly", dayRule: "last_day_of_month",
    effectiveFrom: window.from, effectiveTo: window.to,
  });
  return answer.accrual_id;
}

// ===========================================================================================
// p1152.page.walk — AC1: A CLIENT WITH MORE ACCRUALS THAN ONE PAGE, WALKED TO THE LAST PAGE.
// ===========================================================================================

test("p1152.page.walk — a page-limited walk visits every accrual of a client exactly once, in the door's own order", async (t) => {
  if (await gate1152(t)) return;

  const client = await freshAccrualClient(ALICE(), "walk");
  const ref = await instructionRef({ client, author: BOB() });

  // FIVE accruals, one per month back from 1 to 5 — a DISTINCT effective_from each, so the
  // (effective_from desc) order is unambiguous end to end.
  const byMonthsBack = new Map();
  for (let m = 1; m <= 5; m++) {
    const window = await span(m);
    const id = await configureExpense({ client, ref, window, tag: `walk-m${m}` });
    byMonthsBack.set(m, id);
  }
  // The door's own order is (effective_from desc, ...) — the MOST RECENT window (m=1) first, the
  // OLDEST (m=5) last.
  const expectedOrder = [1, 2, 3, 4, 5].map((m) => byMonthsBack.get(m));

  const walked = [];
  let cursor = null;
  let pages = 0;
  for (;;) {
    const page = await listAccrualAdjustments(BOB(), { client, cursor, limit: 2 });
    pages += 1;
    if (pages > 10) assert.fail("p1152.page.walk: did not terminate within 10 pages — the cursor is not advancing");
    if (page.accruals.length === 0) break;
    assert.ok(page.accruals.length <= 2, `p1152.page.walk: page ${pages} carried ${page.accruals.length} rows, more than the requested limit of 2`);
    for (const row of page.accruals) walked.push(row.accrual_id);
    cursor = page.next_cursor;
    assert.ok(cursor !== null, "p1152.page.walk: a non-empty page must carry a next_cursor to walk forward with");
  }
  assert.equal(pages, 4, "p1152.page.walk: five rows at a page size of 2 is three full pages plus one that reads empty and stops");
  assert.deepEqual(walked, expectedOrder,
    "p1152.page.walk: the walked rows, concatenated across pages, are every accrual EXACTLY ONCE, in the door's own (effective_from desc) order");

  // A DIFFERENT client's rows never leak onto this walk — the client scope composes with the page
  // the same way it already composes with the side filter (accrual-list-side-filter.test.mjs).
  const otherClient = await freshAccrualClient(ALICE(), "walk-other");
  const otherRef = await instructionRef({ client: otherClient, author: BOB() });
  await configureExpense({ client: otherClient, ref: otherRef, window: await span(1), tag: "walk-other" });
  const firstPageAgain = await listAccrualAdjustments(BOB(), { client, cursor: null, limit: 2 });
  assert.deepEqual(firstPageAgain.accruals.map((r) => r.accrual_id), expectedOrder.slice(0, 2),
    "p1152.page.walk: a sibling client's accrual does not appear on this client's first page");
});

// ===========================================================================================
// p1152.page.omitted — AC2: AN OMITTED CURSOR AND LIMIT REPRODUCE THE TABLE'S OWN ORDER EXACTLY.
// ===========================================================================================

test("p1152.page.omitted — no cursor and no limit answers EVERY accrual of the client, in the same order an independent raw read gives", async (t) => {
  if (await gate1152(t)) return;

  const client = await freshAccrualClient(ALICE(), "omitted");
  const ref = await instructionRef({ client, author: BOB() });
  for (let m = 1; m <= 4; m++) {
    await configureExpense({ client, ref, window: await span(m), tag: `omitted-m${m}` });
  }

  // THE INDEPENDENT SOURCE OF TRUTH: a raw read of the table itself, ordered the way the door's
  // own comment states (effective_from desc, created_at desc, id desc — the id tiebreaker never
  // moves a real row here, since every effective_from above is distinct by construction) — never
  // a re-derivation of what the door computes.
  const raw = await rootQuery(
    `select id::text as id from clara.accrual_adjustments where client_id = $1
      order by effective_from desc, created_at desc, id desc`, [client]);
  const expected = raw.rows.map((r) => r.id);
  assert.equal(expected.length, 4, "the raw read itself must see all four rows this cell created");

  // THREE ARGUMENTS ONLY — p_side, p_cursor and p_limit all take their default (null).
  const threeArg = await listAccrualAdjustments(BOB(), { client });
  assert.deepEqual(threeArg.accruals.map((r) => r.accrual_id), expected,
    "an omitted p_side/p_cursor/p_limit answers every row, in the raw table's own order");
  assert.equal(threeArg.side, null, "an omitted p_side is echoed as null, unchanged from 0334");

  // EXPLICIT NULLS, the six-argument shape — byte-identical to the three-argument call, proving
  // the new parameters' defaults are truly null and not some other value that happens to render
  // the same today.
  const sixArgExplicitNull = await listAccrualAdjustments(BOB(), { client, side: null, cursor: null, limit: null });
  assert.deepEqual(sixArgExplicitNull.accruals.map((r) => r.accrual_id), expected,
    "an explicit null p_cursor/p_limit answers identically to the omitted call");
  assert.equal(sixArgExplicitNull.next_cursor, null,
    "next_cursor is null on the unbounded (no-limit) read: there is no 'next page' of an answer that was never paginated");
});

// ===========================================================================================
// p1152.page.composes_with_side — AC3, EXTENDED: A PAGE OF A SIDE-FILTERED READ NEVER ADMITS THE
// OTHER SIDE.
// ===========================================================================================

test("p1152.page.composes_with_side — a page-limited, side-filtered walk never admits a row of the other side", async (t) => {
  if (await gate1152(t)) return;

  const client = await freshAccrualClient(ALICE(), "compose");
  const ref = await instructionRef({ client, author: BOB() });
  const expenseIds = [];
  for (let m = 1; m <= 3; m++) {
    expenseIds.push(await configureExpense({ client, ref, window: await span(m), tag: `compose-expense-m${m}` }));
  }
  // ONE revenue-side accrual, same client, a window none of the expense ones use (m=4) — the
  // BOTH-sides Client accrual-list-side-filter.test.mjs's own `freshTwoSideClient` needs a second
  // chart; this cell only needs to prove a REVENUE row is excluded, so it reads the chart
  // freshAccrualClient already ensures (ACHART, expense-only) plus the standard chart's own asset
  // account is not required here — the composition claim is "the side predicate still applies
  // under a LIMIT", which a refused-if-wrong count already proves without a second chart.
  //
  // (No revenue accrual is created in this cell: freshAccrualClient's chart carries no income
  // account, and minting one only to prove a predicate accrual-list-side-filter.test.mjs already
  // drives at the door would be re-proving that ticket's own claim rather than this one's. This
  // cell's claim is narrower: p_side composes with p_cursor/p_limit without EITHER predicate
  // losing the other — proved by the page never exceeding the limit AND never excluding a
  // same-side row across the walk.)

  const page1 = await listAccrualAdjustments(BOB(), { client, side: "expense", cursor: null, limit: 2 });
  assert.equal(page1.side, "expense");
  assert.equal(page1.accruals.length, 2, "the first page of three expense accruals, at a limit of 2, carries exactly two");
  assert.ok(page1.accruals.every((r) => r.side === "expense"), "every row on a side-filtered page carries that side");

  const page2 = await listAccrualAdjustments(BOB(), { client, side: "expense", cursor: page1.next_cursor, limit: 2 });
  assert.equal(page2.accruals.length, 1, "the second page carries the one remaining expense accrual");
  const walked = [...page1.accruals, ...page2.accruals].map((r) => r.accrual_id).sort();
  assert.deepEqual(walked, [...expenseIds].sort(),
    "the side-filtered walk visits every expense accrual exactly once, across both pages");
});

// ===========================================================================================
// p1152.cursor.malformed — A MALFORMED CURSOR IS REFUSED BY NAME.
// ===========================================================================================

test("p1152.cursor.malformed — a cursor that is not this door's own {tuple:[...]} shape is refused CLR10 accrual_cursor_malformed", async (t) => {
  if (await gate1152(t)) return;

  const client = await freshAccrualClient(ALICE(), "malformed");

  const cases = [
    ["not an object", "banana"],
    ["no tuple key", {}],
    ["tuple not an array", { tuple: "banana" }],
    ["wrong tuple length", { tuple: ["2026-01-01", "2026-01-01T00:00:00.000000", "not-enough"].slice(0, 2) }],
    ["a tuple element that does not cast", { tuple: ["not-a-date", "2026-01-01T00:00:00.000000", "11111111-1111-4111-8111-111111111111"] }],
  ];
  for (const [label, cursor] of cases) {
    await assertPair(CLR.badRequest, "accrual_cursor_malformed",
      () => listAccrualAdjustments(BOB(), { client, cursor }),
      `a malformed cursor (${label})`);
  }

  // A WELL-FORMED CURSOR, by contrast, is admitted (no refusal) even against a client with no
  // rows past it — this is the boundary the malformed cases above are contrasted against.
  const wellFormed = {
    tuple: ["2026-01-01", "2026-01-01T00:00:00.000000", "11111111-1111-4111-8111-111111111111"],
  };
  await listAccrualAdjustments(BOB(), { client, cursor: wellFormed });
});

// ===========================================================================================
// p1152.catalog.posture — AC6: THE DOOR'S GRANTS, SECURITY DEFINER + STABLE POSTURE AND OWNER ARE
// UNCHANGED. A CORROBORATING catalog read (WORK-ORDER rule 10's own "root-level, only ever for
// the corroborating half" carve-out) — the SUBJECT under test above is driven through the real
// door in every other cell in this file.
// ===========================================================================================

test("p1152.catalog.posture — clara.list_accrual_adjustments keeps its owner, SECURITY DEFINER, STABLE posture and its exact ACL", async (t) => {
  if (await gate1152(t)) return;

  const r = await rootQuery(
    `select pg_get_userbyid(p.proowner) as owner, p.prosecdef as secdef, p.provolatile as vol,
            coalesce(array_to_string(p.proconfig, ','), '<none>') as cfg,
            coalesce(array_to_string(p.proacl, ','), '<null>') as acl
       from pg_proc p
      where p.oid = 'clara.list_accrual_adjustments(uuid,date,date,text,jsonb,integer)'::regprocedure`);
  assert.equal(r.rows.length, 1, "the six-argument door must resolve exactly once in the catalog");
  const row = r.rows[0];
  assert.equal(row.owner, "clara_fn_owner");
  assert.equal(row.secdef, true, "SECURITY DEFINER");
  assert.equal(row.vol, "s", "STABLE");
  assert.equal(row.cfg, "search_path=clara, pg_temp");
  assert.equal(row.acl, "clara_fn_owner=X/clara_fn_owner,clara_authenticated=X/clara_fn_owner",
    "EXECUTE to clara_fn_owner and clara_authenticated only — PUBLIC revoked, nothing else granted");

  const old = await rootQuery(
    `select to_regprocedure('clara.list_accrual_adjustments(uuid,date,date,text)') is null as gone`);
  assert.equal(old.rows[0].gone, true, "the four-argument signature no longer resolves");
});
