// #650 — the CLIENT WORK PACK battery for packages/db/migrations/0214_client_work_pack.sql.
//
// FRONTIER-GATED on the `client_work_pack$` stable stem (the `work-list.test.mjs:1-20` shape,
// restated here for this migration's own stem so the slice-frontier legs SKIP cleanly rather
// than red on a database pinned before 0214 lands). A skip is not evidence; the green run that
// matters is the one on a chain that carries 0214.
//
// WHAT THIS FILE IS ABOUT. `clara.get_client_work_pack` is the ONE client-scoped read behind the
// client home's Work attention band: two FACETS over distinct Work ids — what is runnable or
// executing right now, and what a committed operation receipt dated inside the last seven
// Malaysian calendar days — each with its own coverage word and a short preview of rows. It is
// NOT a third aggregation of the review queue: the "needs you" tile on that board keeps reading
// the shipped, viewer-floored `list_review_queue().counts.work_questions` (0180:1065-1105), and
// the pack carries only a STATIC reference to that source so the page cannot grow two numbers
// over one relation (裁-190).
//
// WHAT IT DELIBERATELY DOES NOT PROVE. Nothing here says anything about the BROWSER: the tiles,
// the three no-data arms, the 30 s re-read and the drilldown URLs are proven by the web unit
// cells (`apps/web/lib/work/client-work-pack.test.ts`, `use-client-work-pack.test.ts`,
// `components/firm/client-home/client-work-attention.test.tsx`) and by
// `apps/web/e2e/home-board-walk.spec.ts`. This file proves the door, under real least-privileged
// Postgres roles.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  ROLES, roleQuery, rootQuery, humanQuery, buildWorkWorld, freshWorkClient, endPool, opk,
  assertRaises, assertPair, admitJournalWork, retryAccountingWork, claimWorkRun,
  settleWorkRun, basis, workRow, mintClientObo, wakeRecordJournalEntry, receiptsForWork,
  detailOf, printSkipCount,
} from "./work-journal-fixtures.mjs";
import { markSkip } from "./wave-a-helpers.mjs";
import {
  parkedWork, interruptionsForWork, listReviewQueue, openWorkQuestion, QREASON,
} from "./work-question-fixtures.mjs";

const CLR04 = "CLR04";
const CLR10 = "CLR10";
const CLR13 = "CLR13";
const STEM = "client_work_pack$";

let _ready = null;
async function packLaneReady() {
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

async function gate(t) {
  if (await packLaneReady()) return false;
  markSkip();
  t.skip(`#650 client-work-pack lane absent (no ${STEM} migration applied)`);
  return true;
}

let world = null;
before(async () => {
  // A SKIP IS NOT EVIDENCE, and a FOCUSED run says so out loud. The package-wide sweep preloads
  // `client-work-pack-preintegration-gate.mjs`, which sets the flag below to declare "a database
  // without this lane is an expected pre-integration state". A worker running this file directly
  // against a rig that is supposed to carry 0214 sets nothing, so an absent lane fails here
  // rather than reporting a green run over a file that quietly executed no assertion.
  if (!(await packLaneReady()) && process.env.CLARA_ALLOW_MISSING_CLIENT_WORK_PACK !== "1") {
    throw new Error(
      `#650: no migration matching /${STEM}/ is applied to this database, and `
      + "CLARA_ALLOW_MISSING_CLIENT_WORK_PACK is not set. Apply 0214_client_work_pack.sql, or "
      + "preload tests/client-work-pack-preintegration-gate.mjs if a lane-less database is "
      + "expected here.",
    );
  }
  world = await buildWorkWorld();
});
after(async () => {
  printSkipCount("client-work-pack");
  await endPool();
});

const ALICE = () => world.users.alice; // owner, firm A
const BOB = () => world.users.bob;     // bookkeeper, firm A — the FLOOR this door is written to
const CAROL = () => world.users.carol; // viewer, firm A
const DAVE = () => world.users.dave;   // owner, firm B
const FIRM_A = () => world.firms.A;

// ===========================================================================================
// The door wrapper. NAMED arguments only — a divergence in a parameter name is a real finding
// rather than a silent positional mismatch.
// ===========================================================================================

async function pack(sub, client, { preview = null } = {}) {
  const r = preview === null
    ? await humanQuery(sub, "select clara.get_client_work_pack(p_client => $1::uuid) as result", [client])
    : await humanQuery(sub,
      "select clara.get_client_work_pack(p_client => $1::uuid, p_preview => $2::int) as result",
      [client, preview]);
  return r.rows[0].result;
}

const activeOf = (p) => p.facets.active;
const successOf = (p) => p.facets.recent_success;

/** Admit one Work through the REAL door and leave it QUEUED. */
async function queuedWork(client, memo = "rent") {
  return admitJournalWork({ client, author: ALICE(), basis: basis({ memo }) });
}

/** Admit, claim, and POST through the wake verb, so a COMMITTED receipt exists. This is the only
 *  way the estate mints one — `clara._record_journal_entry_core` is its single writer
 *  (0178:442-445; the live body is 0195:2130). */
async function postedWork(client, { memo = "posted", settle = "completed" } = {}) {
  const admitted = await admitJournalWork({ client, author: ALICE(), basis: basis({ memo }) });
  const w = await workRow(admitted.work_id);
  await claimWorkRun({ task: admitted.task_id, runId: opk("p650-run") });
  const obo = await mintClientObo({ firm: FIRM_A(), obo: ALICE(), client });
  await wakeRecordJournalEntry(obo.secret, {
    client, work: admitted.work_id, logicalOpId: w.logical_op_id, basis: w.basis,
  });
  if (settle !== null) await settleWorkRun({ task: admitted.task_id, outcome: settle });
  const receipts = (await receiptsForWork(admitted.work_id)).filter((r) => r.outcome === "committed");
  assert.equal(receipts.length, 1, "the fixture must have produced exactly one committed receipt");
  return { ...admitted, receipt_id: receipts[0].id };
}

/** Admit, claim, settle `completed` WITHOUT posting — a Work the estate cannot date, because
 *  `clara.accounting_work` carries no completion instant (0178:324-325). */
async function completedWithoutReceipt(client, memo = "no receipt") {
  const admitted = await admitJournalWork({ client, author: ALICE(), basis: basis({ memo }) });
  await claimWorkRun({ task: admitted.task_id, runId: opk("p650-run") });
  await settleWorkRun({ task: admitted.task_id, outcome: "completed" });
  assert.equal((await receiptsForWork(admitted.work_id)).length, 0, "no receipt was written");
  return admitted;
}

/** A SQL expression for an exact instant on a Malaysian calendar day relative to MYT "today".
 *  Built in the DATABASE rather than in JS on purpose: this battery exists to prove the window
 *  is resolved against `Asia/Kuala_Lumpur`, and a JS-side `Date` would resolve it against the
 *  test host's own zone, which is the very confusion under test. */
function mytInstant(dayOffset, clock) {
  const sign = dayOffset < 0 ? "- " : "+ ";
  return "((((now() at time zone 'Asia/Kuala_Lumpur')::date " + sign + Math.abs(dayOffset)
    + ")::timestamp + interval '" + clock + "') at time zone 'Asia/Kuala_Lumpur')";
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** OWNER-LEVEL FIXTURE DML, and it is labelled rather than hidden. `clara.operation_receipts`
 *  carries an append-only belt (0178:465-466) precisely so no lane can restate a receipt's
 *  instant — which also means a test cannot BUILD a dated one through any verb. The instant is
 *  moved as the superuser under `session_replication_role = replica`, the same shape
 *  `a21-adversarial.test.mjs:708` already uses, in ONE simple-query message so the belt is never
 *  left disabled if the update fails. The id is proven uuid-shaped before it is interpolated,
 *  because a simple-query message takes no parameters. */
async function backdateReceipt(receiptId, instantExpr) {
  assert.match(receiptId, UUID_RE, "a fixture receipt id must be uuid-shaped before interpolation");
  await rootQuery(
    "set session_replication_role = replica; "
    + `update clara.operation_receipts set created_at = ${instantExpr} where id = '${receiptId}'; `
    + "reset session_replication_role",
  );
}

/** The same owner-level move for a Work's ADMISSION instant. `clara.accounting_work` is guarded
 *  by `clara._tf_accounting_work_immutable` (0178) and by FORCE RLS, so `created_at` cannot be
 *  restated through any verb either — which is exactly the point: this is how a fixture builds
 *  the ordinary real-world Work that was ADMITTED weeks ago and POSTED this week. */
async function backdateWorkAdmission(workId, instantExpr) {
  assert.match(workId, UUID_RE, "a fixture work id must be uuid-shaped before interpolation");
  await rootQuery(
    "set session_replication_role = replica; "
    + `update clara.accounting_work set created_at = ${instantExpr} where id = '${workId}'; `
    + "reset session_replication_role",
  );
}

/** `clara.list_accounting_work` called with EXACTLY the arguments the browser sends for a facet
 *  drilldown (`apps/web/lib/work/work-list.ts:105-117`). Named arguments only. */
async function listWork(sub, { client = null, status = null, since = null, until = null, limit = 100 } = {}) {
  const r = await humanQuery(sub,
    "select clara.list_accounting_work(p_client => $1::uuid, p_status => $2::text[],"
    + " p_initiator => null, p_purpose => null, p_since => $3::timestamptz,"
    + " p_until => $4::timestamptz, p_q => null, p_cursor => null, p_limit => $5::int) as result",
    [client, status, since, until, limit]);
  return r.rows[0].result;
}

// ===========================================================================================
// p650.pack.active_distinct — ACTIVE IS A COUNT OF DISTINCT WORK IDS, never of runs.
// ===========================================================================================
test("p650.pack.active_distinct — five queued/running Works count 5, even when one has two runs", async (t) => {
  if (await gate(t)) return;
  const client = await freshWorkClient(ALICE(), "p650active");

  const works = [];
  for (let i = 0; i < 5; i += 1) works.push(await queuedWork(client, `active-${i}`));
  // The FIFTH Work is run, FAILED and RETRIED — 0178 refuses a retry of a live run
  // ("accounting work in state running is not retryable"), so a second attempt has to come the
  // way a real one does. It carries TWO `clara.agent_tasks` rows afterwards and is runnable
  // again. A count that joined runs would report six Works here.
  const fifth = works[4];
  await claimWorkRun({ task: fifth.task_id, runId: opk("p650-run") });
  await settleWorkRun({ task: fifth.task_id, outcome: "failed", errorCode: "tool_error" });
  const retried = await retryAccountingWork({ work: fifth.work_id, author: ALICE() });
  assert.ok(retried.task_id, "the retry opened a second run");

  const p = await pack(BOB(), client);
  assert.equal(activeOf(p).count, 5, "five Works, five runnable/executing — never one per run");
  assert.equal(activeOf(p).status, "ok");
  assert.equal(activeOf(p).coverage, "ok", "the default preview of five covers a population of five");
  assert.equal(activeOf(p).rows.length, 5);
  assert.equal(new Set(activeOf(p).rows.map((r) => r.work_id)).size, 5, "no Work appears twice");

  // "Retrying" is a LABEL on the preview rows, and it is a fact (`attempts`), never a guess.
  const retryRow = activeOf(p).rows.find((r) => r.work_id === fifth.work_id);
  assert.ok(retryRow, "the retried Work is in the preview");
  assert.equal(retryRow.retrying, true, "two runs is what makes Retrying a fact");
  assert.ok(retryRow.attempts >= 2, `attempts should be >= 2, got ${retryRow.attempts}`);
  for (const other of activeOf(p).rows.filter((r) => r.work_id !== fifth.work_id)) {
    assert.equal(other.retrying, false, "a Work on its first run is not retrying");
  }

  // NO TOTAL KEY, anywhere in the envelope.
  assert.equal(Object.prototype.hasOwnProperty.call(p, "total"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(p.facets, "total"), false);
});

// ===========================================================================================
// p650.pack.recent_window — SEVEN MALAYSIAN CALENDAR DATES ENDING TODAY, resolved in the DB.
// ===========================================================================================
test("p650.pack.recent_window — the window is seven MYT dates: 00:30 and 23:59 on day-6 are IN, 23:59 on day-7 is OUT", async (t) => {
  if (await gate(t)) return;
  const client = await freshWorkClient(ALICE(), "p650window");

  const inLate = await postedWork(client, { memo: "in-late" });
  const inEarly = await postedWork(client, { memo: "in-early" });
  const out = await postedWork(client, { memo: "out" });

  await backdateReceipt(inLate.receipt_id, mytInstant(-6, "23 hours 59 minutes"));
  // THE DISCRIMINATING ROW. 00:30 MYT on day-6 is 16:30 UTC on day-7, so a window whose lower
  // fence were `current_date - 6` in UTC would exclude it. It is inside the seven Malaysian
  // dates, so it must be counted.
  await backdateReceipt(inEarly.receipt_id, mytInstant(-6, "30 minutes"));
  await backdateReceipt(out.receipt_id, mytInstant(-7, "23 hours 59 minutes"));

  const p = await pack(BOB(), client);
  assert.equal(successOf(p).count, 2, "day-6 is inside the window at both ends of the day; day-7 is not");
  const ids = successOf(p).rows.map((r) => r.work_id);
  assert.ok(ids.includes(inLate.work_id), "23:59 MYT on day-6 is in");
  assert.ok(ids.includes(inEarly.work_id), "00:30 MYT on day-6 is in — a UTC-derived fence would drop it");
  assert.ok(!ids.includes(out.work_id), "23:59 MYT on day-7 is out");

  assert.equal(p.window.timezone, "Asia/Kuala_Lumpur");
  assert.equal(p.window.days, 7);
  // The envelope names the two MYT calendar DATES the browser turns back into the same instants.
  const fences = await rootQuery(
    "select ((now() at time zone 'Asia/Kuala_Lumpur')::date - 6)::text as from_date,"
    + " ((now() at time zone 'Asia/Kuala_Lumpur')::date)::text as to_date");
  assert.equal(p.window.from_date, fences.rows[0].from_date);
  assert.equal(p.window.to_date, fences.rows[0].to_date);
  assert.ok(typeof p.computed_at === "string" && p.computed_at.length > 0,
    "the envelope carries its own READ INSTANT — never a mutation position");
});

// ===========================================================================================
// p650.pack.refused_receipt — a REFUSED receipt is not a success.
// ===========================================================================================
test("p650.pack.refused_receipt — an outcome='refused' receipt is never recent success", async (t) => {
  if (await gate(t)) return;
  const client = await freshWorkClient(ALICE(), "p650refused");
  const w = await completedWithoutReceipt(client, "refused-receipt");

  // DEFENCE IN DEPTH, NOT VERB-REACHABLE, and said out loud. `outcome in ('committed','refused')`
  // is 0178:425's own CHECK, but every live writer of this table inserts 'committed'
  // (0178:1411, 0182:988, 0184:1142, 0194:1723, 0195:2130 — measured at this frontier), so a
  // refused row can only be built by the owner. The cell exists because the CHECK admits the
  // value: a door that counted "a receipt" rather than "a COMMITTED receipt" would pass every
  // other cell in this file.
  const row = await rootQuery(
    `insert into clara.operation_receipts(firm_id, client_id, work_id, purpose, logical_op_id,
       payload_digest, acting_actor, on_behalf_of, via_wake_kind, bundle_digest, run_id, task_id,
       outcome, effects, refusal)
     select w.firm_id, w.client_id, w.id, 'journal_entry', 'p650-refused-' || w.id::text,
            repeat('a', 64), w.initiator, w.initiator, 'interactive_client', 'b', 'r',
            w.current_task_id, 'refused', '{}'::jsonb, jsonb_build_object('reason','fixture')
       from clara.accounting_work w where w.id = $1 returning id`, [w.work_id]);
  assert.equal(row.rows.length, 1, "the refused receipt was planted");

  const p = await pack(BOB(), client);
  assert.equal(successOf(p).count, 0, "a refusal is not a success, however recent");
  assert.deepEqual(successOf(p).rows, []);
});

// ===========================================================================================
// p650.pack.completed_no_receipt — an UNDATABLE completion is not counted, and says so.
// ===========================================================================================
test("p650.pack.completed_no_receipt — a completed Work with no committed receipt is uncounted AND drives coverage='partial'", async (t) => {
  if (await gate(t)) return;
  const client = await freshWorkClient(ALICE(), "p650nodate");
  const posted = await postedWork(client, { memo: "dated" });
  const undated = await completedWithoutReceipt(client, "undated");

  const p = await pack(BOB(), client);
  assert.equal(successOf(p).count, 1, "only the Work a receipt can date is counted");
  assert.deepEqual(successOf(p).rows.map((r) => r.work_id), [posted.work_id]);
  assert.ok(!successOf(p).rows.some((r) => r.work_id === undated.work_id));
  assert.equal(successOf(p).coverage, "partial",
    "a completion the receipt ledger cannot date makes this facet incomplete, not merely smaller");
  assert.equal(successOf(p).status, "partial", "and the facet's answer state says so to the reader");
  assert.equal(successOf(p).coverage_reason, "completions_without_receipt");
  assert.equal(successOf(p).uncounted_completions, 1, "and it names HOW MANY it could not date");
});

// ===========================================================================================
// p650.pack.recent_success_drilldown — THE TILE AND THE LIST IT LINKS TO ARE DATED BY DIFFERENT
// INSTANTS, and this cell is the measurement that makes the board say so instead of implying
// otherwise. (Round-1 review, finding 650-B1.)
//
// The tile counts a COMMITTED RECEIPT inside the seven MYT dates — the estate's only durable
// completion instant (0178:411-465, and `clara.accounting_work` carries none: 0178:324-325).
// The list it links to is `clara.list_accounting_work`, whose `p_since`/`p_until` fence
// `w.created_at` on `clara.accounting_work` — the ADMISSION instant (0189:427-428). There is no
// receipt-dated axis on that door and this wave recuts nothing in 0189 (DECISIONS §1.3), so the
// two populations are the same WEEK over two different SUBJECTS, and they diverge in exactly two
// ways. This cell pins both, so no later change can widen the gap silently and no reader can
// mistake the drilldown for the tile's own population.
//
// The arguments below are the ones the browser really sends: `p_since => window.from` and
// `p_until => window.to` are precisely what `businessDayStart(since)` / `businessDayEnd(until)`
// rebuild from the two calendar dates the href carries — asserted instant-for-instant in
// `apps/web/lib/work/client-work-pack.test.ts` ("recent success → status=completed plus the
// pack's OWN window dates, which rebuild the same instants").
// ===========================================================================================
test("p650.pack.recent_success_drilldown — same week, different subject: the drilldown diverges in exactly two named ways", async (t) => {
  if (await gate(t)) return;
  const client = await freshWorkClient(ALICE(), "p650drill");

  // (a) ADMITTED LONG AGO, POSTED TODAY — counted by the tile, dropped by the list.
  const old = await postedWork(client, { memo: "admitted-long-ago" });
  await backdateWorkAdmission(old.work_id, mytInstant(-30, "9 hours"));
  // (b) ADMITTED AND COMPLETED TODAY WITH NO COMMITTED RECEIPT — returned by the list, and the
  //     one the tile already names out loud through `uncounted_completions`.
  const undated = await completedWithoutReceipt(client, "no-receipt");
  // (c) THE ORDINARY CASE — admitted today, posted today. In both, which is why this is a
  //     disclosure obligation and not a board that is wrong about every row.
  const ordinary = await postedWork(client, { memo: "same-day" });

  const p = await pack(BOB(), client);
  assert.equal(successOf(p).count, 2, "two committed receipts landed inside the window");
  const tileIds = successOf(p).rows.map((r) => r.work_id).sort();
  assert.deepEqual(tileIds, [old.work_id, ordinary.work_id].sort(),
    "the tile is dated by the RECEIPT, so an old admission posted today is in it");

  const page = await listWork(BOB(), {
    client, status: ["completed"], since: p.window.from, until: p.window.to,
  });
  const listIds = page.rows.map((r) => r.id).sort();
  assert.deepEqual(listIds, [undated.work_id, ordinary.work_id].sort(),
    "the list is dated by the ADMISSION, so the same week holds a different set of Works");

  // THE TWO DIVERGENCE CLASSES, named rather than summarised.
  const inTileOnly = tileIds.filter((id) => !listIds.includes(id));
  const inListOnly = listIds.filter((id) => !tileIds.includes(id));
  assert.deepEqual(inTileOnly, [old.work_id],
    "class 1: posted inside the window, admitted before it — the list cannot express this");
  assert.deepEqual(inListOnly, [undated.work_id],
    "class 2: completed inside the window with no receipt — already disclosed as uncounted");
  assert.deepEqual(tileIds.filter((id) => listIds.includes(id)), [ordinary.work_id],
    "and the ordinary same-day Work is in both — the sets overlap, they are not disjoint");

  // CLASS 2 IS ALREADY SAID OUT LOUD BY THE DOOR. Class 1 is not expressible here at all, so it
  // is disclosed by the BOARD: `ClientWorkAttention`'s recent-success tile renders
  // `recentSuccessListBasis` ("The list … is dated by when each Work was started …"), pinned by
  // `client-work-attention.test.tsx` and by the `home.facets.drilldown` walk leg.
  assert.equal(successOf(p).coverage, "partial");
  assert.equal(successOf(p).coverage_reason, "completions_without_receipt");
  assert.equal(successOf(p).uncounted_completions, 1, "the door names class 2 by size");
});

// ===========================================================================================
// p650.pack.over_101_active — THE CELL THAT PROVES THE RULING.
// ===========================================================================================
test("p650.pack.over_101_active — 102 runnable Works still answer; retry stays a preview-row label", async (t) => {
  if (await gate(t)) return;
  t.diagnostic("admits 102 Works through clara.admit_journal_work — the slowest cell in this file");
  const client = await freshWorkClient(ALICE(), "p650over101");
  for (let i = 0; i < 102; i += 1) await queuedWork(client, `bulk-${i}`);

  // `clara._work_run_attempts` refuses a null array or more than 101 ids, CLR10 invalid_work_ids
  // (0189:262-274). A whole-population retry NUMBER would have had to route 102 ids through it
  // and would darken all three tiles at once; the pack asks it only about the PREVIEW.
  const p = await pack(BOB(), client);
  assert.equal(activeOf(p).count, 102, "the population count is not bounded by the helper's ceiling");
  assert.equal(activeOf(p).rows.length, 5, "the preview is still the preview");
  assert.equal(activeOf(p).coverage, "partial",
    "the retry label covers only the preview, so the facet says its disclosure is partial");
  assert.equal(activeOf(p).coverage_reason, "retry_label_preview_only");
  for (const r of activeOf(p).rows) assert.equal(typeof r.retrying, "boolean");

  // And the ceiling is not merely avoided by accident: the preview is clamped well under it.
  const wide = await pack(BOB(), client, { preview: 400 });
  assert.equal(wide.preview_limit, 25, "p_preview clamps to 25 — a quarter of the helper's 101-id ceiling");
  assert.equal(activeOf(wide).rows.length, 25);
  const narrow = await pack(BOB(), client, { preview: 0 });
  assert.equal(narrow.preview_limit, 1, "and clamps up to 1");
});

// ===========================================================================================
// p650.pack.no_sum — FACETS OVERLAP AND ARE NEVER SUMMED.
// ===========================================================================================
test("p650.pack.no_sum — one Work is in TWO facets at once, so the numbers exceed the client's whole Work population", async (t) => {
  if (await gate(t)) return;
  const client = await freshWorkClient(ALICE(), "p650nosum");

  // W1 — POSTED BUT NOT SETTLED. Its run committed a receipt and is still holding the pen, so it
  // is `running` (active) AND carries a committed receipt dated today (recent success). ONE Work,
  // TWO facets: the overlap this criterion exists for, built rather than asserted.
  const both = await postedWork(client, { memo: "sum-both", settle: null });
  const w1 = await workRow(both.work_id);
  assert.ok(["queued", "running"].includes(w1.status),
    `a posted-but-unsettled Work is still runnable; got ${w1.status}`);

  // W2 — parked on a pending question: counted by the shipped review-queue chip, and by neither
  // facet of this pack.
  const parked = await parkedWork({ client, author: ALICE() });
  assert.ok(parked.workId, "the parked Work exists");

  const p = await pack(BOB(), client);
  const queue = await listReviewQueue(BOB(), { scope: { client_id: client } });
  const population = await rootQuery(
    "select count(*)::int as n from clara.accounting_work where client_id = $1", [client]);
  assert.equal(population.rows[0].n, 2, "two Works exist for this client");

  assert.equal(activeOf(p).count, 1, `W1 is runnable; got ${JSON.stringify(activeOf(p))}`);
  assert.equal(successOf(p).count, 1, "and W1 also posted inside the window");
  assert.deepEqual(activeOf(p).rows.map((r) => r.work_id), [both.work_id]);
  assert.deepEqual(successOf(p).rows.map((r) => r.work_id), [both.work_id],
    "the SAME Work id is in both facets — they are not disjoint and never were");
  assert.equal(queue.counts.work_questions, 1, "the shipped chip counts the parked Work");

  // THE INEQUALITY, asserted rather than commented: adding the three attention numbers gives 3
  // for a client that holds 2 Works. They are not a partition, so a total would be a fabrication.
  assert.ok(
    activeOf(p).count + successOf(p).count + queue.counts.work_questions > population.rows[0].n,
    "the three numbers a reader can see exceed the client's entire Work population",
  );
  assert.equal(Object.prototype.hasOwnProperty.call(p, "total"), false, "no total key exists");
  assert.equal(Object.prototype.hasOwnProperty.call(p.facets, "needs_you"), false,
    "needs_you is NOT a facet of this pack — it is a REFERENCE to the shipped review-queue count");
  assert.deepEqual(p.needs_you_ref, { source: "list_review_queue.counts.work_questions" });
  assert.deepEqual(Object.keys(p.facets).sort(), ["active", "recent_success"]);
});

// ===========================================================================================
// p650.pack.floor_viewer — THE FLOOR, and what a viewer KEEPS.
// ===========================================================================================
test("p650.pack.floor_viewer — a viewer is refused CLR04 before any read, and still receives the shipped work_questions count", async (t) => {
  if (await gate(t)) return;
  const client = await freshWorkClient(ALICE(), "p650floor");
  await parkedWork({ client, author: ALICE() });

  await assertRaises(CLR04, () => pack(CAROL(), client), "a viewer reads the work pack");

  // THE OTHER HALF, and it is the whole reason the needs-you tile is not a facet of this pack:
  // `clara.list_review_queue` floors at VIEWER (0016:4563), so folding that number into a
  // bookkeeper-floored pack would TAKE A SHIPPED SURFACE AWAY from viewers.
  const queue = await listReviewQueue(CAROL(), { scope: { client_id: client } });
  assert.ok(queue.counts.work_questions >= 1,
    "a viewer still sees the Work-question count the client home has chipped since #629");
});

// ===========================================================================================
// p650.pack.cross_firm — NO ORACLE, in either direction.
// ===========================================================================================
test("p650.pack.cross_firm — another firm's owner reads zero, and an invented client id answers identically", async (t) => {
  if (await gate(t)) return;
  const client = await freshWorkClient(ALICE(), "p650cross");
  await queuedWork(client, "mine");
  await postedWork(client, { memo: "mine-posted" });

  const theirs = await pack(DAVE(), client);
  assert.equal(activeOf(theirs).count, 0, "firm B sees none of firm A's Work");
  assert.equal(successOf(theirs).count, 0);
  assert.deepEqual(activeOf(theirs).rows, []);
  assert.deepEqual(successOf(theirs).rows, []);

  // THE NO-ORACLE HALF. An id that names nothing at all must be indistinguishable from an id
  // that names somebody else's client — otherwise the door tells firm B that firm A holds a
  // client with this id. `clara.list_accounting_work` answers the same way (0189).
  const invented = await pack(DAVE(), "00000000-0000-4000-8000-0000000000aa");
  assert.deepEqual(
    {
      a: activeOf(invented).count, s: successOf(invented).count,
      ar: activeOf(invented).rows, sr: successOf(invented).rows,
      ac: activeOf(invented).coverage, sc: successOf(invented).coverage,
    },
    { a: 0, s: 0, ar: [], sr: [], ac: "ok", sc: "ok" },
    "an invented id and another firm's client give the same answer");

  // And a NULL client is a caller defect, named rather than served.
  const err = await assertRaises(CLR10, () => pack(BOB(), null), "a null client");
  assert.equal(detailOf(err)?.reason, "invalid_client");
});

// ===========================================================================================
// p650.pack.distinct_defence — THE 裁-190 RULE, guarded on the read the pack REFERENCES.
// ===========================================================================================
test("p650.pack.distinct_defence — the pack never reads agent_interruptions, and the chip it points at is MEASURED rather than assumed", async (t) => {
  if (await gate(t)) return;
  const client = await freshWorkClient(ALICE(), "p650distinct");
  const parked = await parkedWork({ client, author: ALICE() });

  // THE PACK'S OWN HALF: its body does not mention the relation at all. Asserted from `prosrc`
  // because this is a structural rule about what the door is allowed to aggregate, not about
  // what one fixture happens to produce.
  const src = await rootQuery(
    "select prosrc from pg_proc where oid = 'clara.get_client_work_pack(uuid,int)'::regprocedure");
  assert.equal(src.rows[0].prosrc.includes("agent_interruptions"), false,
    "a second aggregation of agent_interruptions beside the shipped chip is the 裁-190 defect");

  // THE REFERENCED READ'S HALF — DEFENCE IN DEPTH, NOT VERB-REACHABLE, and labelled as such.
  //
  // THE INVARIANT IS VERB-ENFORCED, and this is the proof: `open_work_question` refuses outright
  // while any pending row exists for the Work (0180's `question_already_pending`). So every
  // number the shipped chip reports over rows a VERB produced is also a number over Works, which
  // is what makes today's client home honest.
  await assertPair(CLR13, QREASON.questionAlreadyPending,
    () => openWorkQuestion({ task: parked.taskId }),
    "a second pending question on a parked Work");

  // IT IS NOT STRUCTURALLY ENFORCED, and the gap is MEASURED here rather than assumed away.
  // `uq_agent_interruptions_work_version` is on (work_id, question_version) (0180:211-212), so a
  // SECOND pending row at another version is structurally legal — only the owner can build one.
  const pending = await interruptionsForWork(parked.workId);
  const live = pending.find((i) => i.status === "pending");
  assert.ok(live, "the parked Work holds one pending question");
  // Column-agnostic on purpose: this cell is about the COUNT staying Work-keyed, not about
  // 0180's column list, and a hand-written one would rot the moment a later file adds a NOT NULL.
  await rootQuery(
    `insert into clara.agent_interruptions
     select p.* from clara.agent_interruptions i
       cross join lateral jsonb_populate_record(null::clara.agent_interruptions,
         to_jsonb(i) || jsonb_build_object('id', gen_random_uuid(),
                                           'question_version', i.question_version + 1,
                                           'status', 'pending',
                                           'hook_token', 'p650-' || gen_random_uuid()::text)) p
      where i.id = $1`, [live.id]);
  const after = (await interruptionsForWork(parked.workId)).filter((i) => i.status === "pending");
  assert.equal(after.length, 2, "two pending rows for one Work — structurally legal, verb-unreachable");

  // THE MEASURED RESIDUAL, PINNED RATHER THAN FIXED (#650 scope note; see reports/650-final.md).
  // `counts.work_questions` is `count(*) filter (where row_kind='work_question')` (0180:1105) — a
  // ROW count. With two structurally-legal pending rows for ONE Work it reports 2, so the
  // "distinct Work id" invariant this board asks for is carried by the OPEN VERB above, not by
  // the read. #650 does not fix it: `clara.list_review_queue`'s live body is a 0016+0017+0180
  // prosrc splice and changing it is a governed recut, which this slice is explicitly forbidden
  // (brief §3, `pinned_function_recut: []`). This assertion is the pin: a later file that makes
  // the chip Work-keyed reds this line DELIBERATELY, which is the point of writing the current
  // behaviour down.
  const queue = await listReviewQueue(BOB(), { scope: { client_id: client } });
  assert.equal(queue.counts.work_questions, 2,
    "MEASURED, not endorsed: the shipped chip counts review-queue ROWS, so two pending versions of "
    + "one Work read as 2. Verb-unreachable (proven above). Recorded as a residual by #650.");
});

// ===========================================================================================
// p650.pack.catalog — THE POSTURE, read from the catalog rather than from this file's intent.
// ===========================================================================================
test("p650.pack.catalog — SECURITY INVOKER, EXECUTE to clara_authenticated only, and no table privilege moved", async (t) => {
  if (await gate(t)) return;
  const sig = "clara.get_client_work_pack(uuid,int)";
  const row = await rootQuery(
    "select p.prosecdef, pg_get_userbyid(p.proowner) as owner,"
    + " coalesce(array_to_string(p.proacl, ' | '), '(null)') as acl,"
    + " coalesce(array_to_string(p.proconfig, ','), '') as config"
    + ` from pg_proc p where p.oid = '${sig}'::regprocedure`);
  assert.equal(row.rows[0].prosecdef, false,
    "a definer surface would stop borrowing each source's own RLS predicate");
  assert.equal(row.rows[0].owner, "clara_fn_owner");
  assert.equal(row.rows[0].acl, "clara_fn_owner=X/clara_fn_owner | clara_authenticated=X/clara_fn_owner");
  assert.match(row.rows[0].config.replace(/ /g, ""), /search_path=clara,pg_temp/);
  assert.match(row.rows[0].config.replace(/ /g, ""), /plan_cache_mode=force_custom_plan/);

  const pub = await rootQuery(
    `select has_function_privilege('public', '${sig}'::regprocedure, 'execute') as ok`);
  assert.equal(pub.rows[0].ok, false, "PUBLIC holds no EXECUTE");

  // clara.agent_tasks is STILL ungranted — the whole reason the retry label goes through 0189's
  // DEFINER helper rather than reading the relation.
  const tasks = await rootQuery(
    "select count(*)::int as n from information_schema.role_table_grants"
    + " where table_schema='clara' and table_name='agent_tasks' and grantee='clara_authenticated'");
  assert.equal(tasks.rows[0].n, 0);

  // And the three relations the pack reads still grant SELECT and only SELECT.
  const grants = await rootQuery(
    "select table_name, string_agg(distinct privilege_type, ',' order by privilege_type) as p"
    + " from information_schema.role_table_grants"
    + " where table_schema='clara' and grantee='clara_authenticated'"
    + "   and table_name in ('accounting_work','operation_receipts','clients') group by 1 order by 1");
  assert.deepEqual(grants.rows, [
    { table_name: "accounting_work", p: "SELECT" },
    { table_name: "clients", p: "SELECT" },
    { table_name: "operation_receipts", p: "SELECT" },
  ]);
});

// ===========================================================================================
// p650.pack.no_period_axis — THE CELL AC2'S PERIOD CLAUSE CLOSES WITH (DB half).
// ===========================================================================================
test("p650.pack.no_period_axis — the door takes a client and a preview size, and nothing that could name a financial period", async (t) => {
  if (await gate(t)) return;
  const args = await rootQuery(
    "select pg_get_function_arguments('clara.get_client_work_pack(uuid,int)'::regprocedure) as a");
  assert.equal(args.rows[0].a, "p_client uuid, p_preview integer DEFAULT 5",
    "no period, fiscal-year, basis or as-of parameter exists for a caller to narrow a facet with");

  // There is exactly ONE overload, so the signature above is the whole surface.
  const overloads = await rootQuery(
    "select count(*)::int as n from pg_proc p join pg_namespace n on n.oid = p.pronamespace"
    + " where n.nspname='clara' and p.proname='get_client_work_pack'");
  assert.equal(overloads.rows[0].n, 1);

  // And the window derives only from Malaysian "today": the door's own body names the zone and
  // reaches no fiscal relation.
  const src = (await rootQuery(
    "select prosrc from pg_proc where oid = 'clara.get_client_work_pack(uuid,int)'::regprocedure"
  )).rows[0].prosrc;
  assert.ok(src.includes("Asia/Kuala_Lumpur"), "the calendar is Malaysian and it is in the body");
  for (const forbidden of ["fiscal_year", "periodic_adjustments", "close_gate", "accounting_periods"]) {
    assert.equal(src.includes(forbidden), false, `the pack must not reach ${forbidden}`);
  }
});

// ===========================================================================================
// p650.pack.runtime_lane — the model lanes gain NOTHING.
// ===========================================================================================
test("p650.pack.runtime_lane — clara_runtime, the agent role and both wake roles cannot execute the pack", async (t) => {
  if (await gate(t)) return;
  const sig = "clara.get_client_work_pack(uuid,int)";
  for (const role of [ROLES.runtime, ROLES.agentRo, ROLES.wakeInteractive, ROLES.wakeProactive]) {
    const r = await roleQuery(role,
      `select has_function_privilege('${role}', '${sig}'::regprocedure, 'execute') as ok`);
    assert.equal(r.rows[0].ok, false, `${role} must not reach a human's own attention board`);
  }
});
