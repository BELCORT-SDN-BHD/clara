// #659 — the FIRM PORTFOLIO PACK battery for packages/db/migrations/0231_firm_portfolio_pack.sql.
//
// FRONTIER-GATED on the `firm_portfolio_pack$` stable stem (the `client-work-pack.test.mjs:38-62`
// shape, restated here for this migration's own stem so the slice-frontier legs SKIP cleanly
// rather than red on a database pinned before 0231 lands). A skip is not evidence; the green run
// that matters is the one on a chain that carries 0231.
//
// WHAT THIS FILE IS ABOUT. `clara.get_firm_portfolio_pack` is the ONE firm-wide read behind Firm
// Home's portfolio table: one row per client the caller's RLS admits, each carrying counts of
// DISTINCT `clara.accounting_work` ids (active, attention-needing, recently successful), a
// coverage word, and a short preview of rows. It is the read `get_client_work_pack` makes ONE
// ALTITUDE DOWN, and it inherits that door's law: no money key of any kind, no sum, no period
// parameter, and a preview that never approaches `clara._work_run_attempts`' 101-id ceiling.
//
// AND IT IS A KEYSET PAGE WHOSE CURSOR IS A SORT POSITION, NEVER A LOOKUP. The door takes no
// client argument at all, so the only channel through which a client identity can enter it is the
// `lower(name)|uuid` pair packed inside `p_cursor`. The body compares that pair against
// `(lower(c.name), c.id)` under a firm predicate that is always present and NEVER resolves it
// against `clara.clients` — not to validate it, not to reject a cursor whose client was since
// archived. `p659.portfolio.cross_firm` asserts that a cursor naming another firm's REAL client
// and one naming an invented pair answer IDENTICALLY, which is what keeps `list_review_queue`'s
// CLR10 cross-firm existence oracle (0016:4569-4575) from being rebuilt inside a paging argument.
//
// WHAT IT DELIBERATELY DOES NOT PROVE. Nothing here says anything about the BROWSER: the portfolio
// table, its seven states, the URL state and the drilldown links are proven by the web unit cells
// (`apps/web/lib/firm/portfolio-url-state.test.ts`, `use-firm-portfolio.test.ts`,
// `components/firm/firm-home/firm-portfolio.test.tsx`) and by `apps/web/e2e/home-board-walk.spec.ts`.
// This file proves the door, under real least-privileged Postgres roles.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  ROLES, roleQuery, rootQuery, humanQuery, namedCall, endPool, opk,
  assertRaises, assertPair, admitJournalWork, retryAccountingWork, claimWorkRun,
  settleWorkRun, basis, workRow, mintClientObo, wakeRecordJournalEntry, receiptsForWork,
  acceptPublishedLegal, printSkipCount, WCHART,
} from "./work-journal-fixtures.mjs";
import {
  createClient, createFirm, addMember, insertUser, seedAdmission, sandboxName,
} from "./rig-fixtures.mjs";
import { markSkip } from "./wave-a-helpers.mjs";
import { upsertAccountClassed } from "./s6-helpers.mjs";

const CLR04 = "CLR04";
const CLR10 = "CLR10";
const STEM = "firm_portfolio_pack$";
const PACK_SIG = "clara.get_firm_portfolio_pack(int,text,int)";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

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
  t.skip(`#659 firm-portfolio-pack lane absent (no ${STEM} migration applied)`);
  return true;
}

before(async () => {
  // A SKIP IS NOT EVIDENCE, and a FOCUSED run says so out loud — `client-work-pack.test.mjs`'s
  // own argument, restated for this stem. The package-wide sweep preloads
  // `firm-portfolio-pack-preintegration-gate.mjs`; a focused invocation does not.
  if (!(await packLaneReady()) && process.env.CLARA_ALLOW_MISSING_FIRM_PORTFOLIO_PACK !== "1") {
    throw new Error(
      `#659: no migration matching /${STEM}/ is applied to this database, and `
      + "CLARA_ALLOW_MISSING_FIRM_PORTFOLIO_PACK is not set. Apply 0231_firm_portfolio_pack.sql, "
      + "or preload tests/firm-portfolio-pack-preintegration-gate.mjs if a lane-less database is "
      + "expected here.",
    );
  }
});
after(async () => {
  printSkipCount("firm-portfolio-pack");
  await endPool();
});

// ===========================================================================================
// A FRESH FIRM PER CELL, and that is what makes a FIRM-WIDE count assertable at all.
//
// Every other Work battery shares one world because every other door is client-scoped: a cell can
// mint its own client and assert exact numbers over it. This door takes NO client argument — its
// answer is the whole register — so a shared firm would make each cell's row set depend on every
// cell that ran before it. Each cell therefore builds its own firm, its own owner/bookkeeper/
// viewer, and exactly the clients it means to count.
// ===========================================================================================

async function freshFirm(tag) {
  const prefix = sandboxName();
  const users = {
    owner: await insertUser(prefix, `${tag}own`),
    keeper: await insertUser(prefix, `${tag}bk`),
    viewer: await insertUser(prefix, `${tag}vw`),
  };
  const firm = await createFirm(users.owner, {
    name: `${prefix}_${tag}`, token: await seedAdmission(), opKey: opk("p659-firm"),
  });
  await addMember(users.owner, { firm, user: users.keeper, role: "bookkeeper", opKey: opk("p659-mem") });
  await addMember(users.owner, { firm, user: users.viewer, role: "viewer", opKey: opk("p659-mem") });
  await acceptPublishedLegal(users.owner);
  return { prefix, firm, ...users };
}

/** The chart `admitJournalWork`'s basis posts against — `ensureWorkChart`'s two live accounts,
 *  restated here because that helper is private to `work-journal-fixtures.mjs` and this battery
 *  needs to CHOOSE its clients' names (the keyset order is the subject of two cells). */
async function mkChart(sub, client) {
  await upsertAccountClassed(sub, {
    client, code: WCHART.expense, name: "Office Rent", type: "expense", opKey: opk("p659-coa"),
  });
  await upsertAccountClassed(sub, {
    client, code: WCHART.bank, name: "Maybank Current", type: "asset", opKey: opk("p659-coa"),
  });
}

/** An ACTIVE client of `sub`'s firm with the battery's chart, under a name this cell chose. */
async function namedClient(sub, name) {
  const client = await createClient(sub, { name, opKey: opk("p659-cli") });
  await mkChart(sub, client);
  return client;
}

/** A client left at its BIRTH status. `clara.create_client` births `onboarding` (0017:658-659);
 *  the shared fixture then drives it to `active` through the audited plan verbs. This one does
 *  not, because "a client the review queue's active-client join structurally excludes" is the
 *  subject of `p659.portfolio.onboarding_disclosed`. */
async function onboardingClient(sub, name) {
  const r = await humanQuery(sub,
    "select clara.create_client(p_name => $1, p_op_key => $2) as receipt", [name, opk("p659-cli")]);
  const client = r.rows[0].receipt.client_id;
  const st = await rootQuery("select status from clara.clients where id = $1", [client]);
  assert.equal(st.rows[0].status, "onboarding", "the birth door still births an onboarding client");
  await mkChart(sub, client);
  return client;
}

/** OWNER-LEVEL FIXTURE DML, labelled rather than hidden. The only door that archives a client is
 *  `clara.cancel_client_onboarding` (0017:2865), which needs an OPEN onboarding plan and an admin
 *  — a four-verb detour to set one column this battery only reads. The estate's own batteries take
 *  exactly this shortcut for exactly this reason (`client-work-pack.test.mjs`'s `backdateReceipt`). */
async function archiveClient(client) {
  assert.match(client, UUID_RE, "a fixture client id must be uuid-shaped");
  await rootQuery("update clara.clients set status = 'archived' where id = $1", [client]);
}

// ===========================================================================================
// The door wrapper. NAMED arguments only — a divergence in a parameter name is a real finding
// rather than a silent positional mismatch.
// ===========================================================================================

async function portfolio(sub, { limit = null, cursor = null, preview = null } = {}) {
  const specs = [];
  const vals = [];
  if (limit !== null) { specs.push({ name: "p_limit", cast: "int" }); vals.push(limit); }
  if (cursor !== null) { specs.push({ name: "p_cursor", cast: "text" }); vals.push(cursor); }
  if (preview !== null) { specs.push({ name: "p_preview", cast: "int" }); vals.push(preview); }
  const sql = specs.length === 0
    ? "select clara.get_firm_portfolio_pack() as result"
    : namedCall("get_firm_portfolio_pack", specs);
  const r = await humanQuery(sub, sql, vals);
  return r.rows[0].result;
}

const rowFor = (pack, client) => pack.rows.find((r) => r.client_id === client) ?? null;

/** The cursor the door mints, spelled the way the door spells it — used by the cells that forge
 *  one. `Buffer.from(...).toString("base64")` is the encoding `encode(..., 'base64')` writes. */
const mintCursor = (name, id) => Buffer.from(`${name.toLowerCase()}|${id}`, "utf8").toString("base64");

/** Admit one Work through the REAL door and leave it QUEUED. */
const queuedWork = (client, owner, memo = "rent") =>
  admitJournalWork({ client, author: owner, basis: basis({ memo }) });

/** Admit, claim, and POST through the wake verb, so a COMMITTED receipt exists — the estate's one
 *  writer of `clara.operation_receipts` (0178:442-445). */
async function postedWork(firm, client, owner, { memo = "posted", settle = "completed" } = {}) {
  const admitted = await admitJournalWork({ client, author: owner, basis: basis({ memo }) });
  const w = await workRow(admitted.work_id);
  await claimWorkRun({ task: admitted.task_id, runId: opk("p659-run") });
  const obo = await mintClientObo({ firm, obo: owner, client });
  await wakeRecordJournalEntry(obo.secret, {
    client, work: admitted.work_id, logicalOpId: w.logical_op_id, basis: w.basis,
  });
  if (settle !== null) await settleWorkRun({ task: admitted.task_id, outcome: settle });
  const receipts = (await receiptsForWork(admitted.work_id)).filter((r) => r.outcome === "committed");
  assert.equal(receipts.length, 1, "the fixture must have produced exactly one committed receipt");
  return { ...admitted, receipt_id: receipts[0].id };
}

/** Admit, claim, settle without posting — a Work the estate cannot DATE. */
async function completedWithoutReceipt(client, owner, memo = "no receipt") {
  const admitted = await admitJournalWork({ client, author: owner, basis: basis({ memo }) });
  await claimWorkRun({ task: admitted.task_id, runId: opk("p659-run") });
  await settleWorkRun({ task: admitted.task_id, outcome: "completed" });
  assert.equal((await receiptsForWork(admitted.work_id)).length, 0, "no receipt was written");
  return admitted;
}

/** Admit, claim and settle into a terminal status this battery names. `p_error_code` admits only
 *  the six operational tokens (0178:1126-1129), so a REFUSAL travels as a typed `p_error` object
 *  instead — `work-journal-admission.test.mjs:432`'s own shape. */
async function settledWork(client, owner, outcome, memo = outcome) {
  const admitted = await admitJournalWork({ client, author: owner, basis: basis({ memo }) });
  await claimWorkRun({ task: admitted.task_id, runId: opk("p659-run") });
  await settleWorkRun({
    task: admitted.task_id,
    outcome,
    errorCode: outcome === "failed" ? "tool_error" : null,
    error: outcome === "refused"
      ? { code: "CLR19", reason: "write_into_closed_period", message: "rig", recoverable: true }
      : null,
  });
  const w = await workRow(admitted.work_id);
  assert.equal(w.status, outcome, `the fixture Work should be ${outcome}, is ${w.status}`);
  return admitted;
}

/** A SQL expression for an exact instant on a Malaysian calendar day relative to MYT "today" —
 *  built in the DATABASE, because the zone the window is resolved against is the subject. */
function mytInstant(dayOffset, clock) {
  const sign = dayOffset < 0 ? "- " : "+ ";
  return "((((now() at time zone 'Asia/Kuala_Lumpur')::date " + sign + Math.abs(dayOffset)
    + ")::timestamp + interval '" + clock + "') at time zone 'Asia/Kuala_Lumpur')";
}

async function backdateReceipt(receiptId, instantExpr) {
  assert.match(receiptId, UUID_RE, "a fixture receipt id must be uuid-shaped before interpolation");
  await rootQuery(
    "set session_replication_role = replica; "
    + `update clara.operation_receipts set created_at = ${instantExpr} where id = '${receiptId}'; `
    + "reset session_replication_role",
  );
}

async function packSrc() {
  const r = await rootQuery(`select prosrc from pg_proc where oid = '${PACK_SIG}'::regprocedure`);
  return r.rows[0].prosrc;
}

// ===========================================================================================
// p659.portfolio.distinct — THE COUNTS ARE OVER DISTINCT WORK IDS, never over runs.
// ===========================================================================================
test("p659.portfolio.distinct — one Work with two runs counts once; five active Works count 5", async (t) => {
  if (await gate(t)) return;
  const w = await freshFirm("dist");
  const client = await namedClient(w.owner, `${w.prefix} alpha`);

  const works = [];
  for (let i = 0; i < 5; i += 1) works.push(await queuedWork(client, w.owner, `active-${i}`));
  // The FIFTH Work is run, FAILED and RETRIED, so it carries TWO `clara.agent_tasks` rows and is
  // runnable again. A count that joined runs would report six Works here.
  const fifth = works[4];
  await claimWorkRun({ task: fifth.task_id, runId: opk("p659-run") });
  await settleWorkRun({ task: fifth.task_id, outcome: "failed", errorCode: "tool_error" });
  const retried = await retryAccountingWork({ work: fifth.work_id, author: w.owner });
  assert.ok(retried.task_id, "the retry opened a second run");

  const p = await portfolio(w.keeper);
  const row = rowFor(p, client);
  assert.ok(row, "the client is on the caller's own portfolio page");
  assert.equal(row.active, 5, "five Works, five runnable/executing — never one per run");
  assert.equal(row.name, `${w.prefix} alpha`);
  assert.equal(row.status, "active");

  // The preview is a PREVIEW, and the count is never its length.
  assert.ok(row.preview.length <= 3, "the default preview is three rows");
  assert.notEqual(row.active, row.preview.length, "the count is not rows.length");

  // NO SUM KEY anywhere in the envelope or the row.
  assert.equal(Object.prototype.hasOwnProperty.call(p, "sum"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(row, "sum"), false);
});

// ===========================================================================================
// p659.portfolio.no_sum — THE COLUMNS OVERLAP AND ARE NEVER A PARTITION.
// ===========================================================================================
test("p659.portfolio.no_sum — a Work that is active AND inside the success window is in both columns", async (t) => {
  if (await gate(t)) return;
  const w = await freshFirm("nosum");
  const client = await namedClient(w.owner, `${w.prefix} overlap`);

  // POSTED but NOT settled: the receipt is committed (so the success window counts it) and the
  // Work is still `running` (so the active column counts it too). One Work, two columns.
  const both = await postedWork(w.firm, client, w.owner, { memo: "both", settle: null });
  const live = await workRow(both.work_id);
  assert.equal(live.status, "running", "an unsettled posted Work is still running");

  const p = await portfolio(w.keeper);
  const row = rowFor(p, client);
  assert.equal(row.active, 1);
  assert.equal(row.recent_success, 1);
  const population = await rootQuery(
    "select count(*)::int as n from clara.accounting_work where client_id = $1", [client]);
  assert.equal(population.rows[0].n, 1, "there is exactly ONE Work for this client");
  assert.ok(row.active + row.recent_success > population.rows[0].n,
    "the columns exceed the Work population — they overlap, and the door publishes nothing to add them into");
});

// ===========================================================================================
// p659.portfolio.attention_failed — failed AND refused, with the split published.
// ===========================================================================================
test("p659.portfolio.attention_failed — failed+refused are counted and split; cancelled/expired/stopping are in none of the three columns", async (t) => {
  if (await gate(t)) return;
  const w = await freshFirm("att");
  const client = await namedClient(w.owner, `${w.prefix} attention`);

  await settledWork(client, w.owner, "failed", "f1");
  await settledWork(client, w.owner, "failed", "f2");
  await settledWork(client, w.owner, "refused", "r1");
  const cancelled = await settledWork(client, w.owner, "cancelled", "c1");
  const expired = await settledWork(client, w.owner, "expired", "e1");
  assert.ok(cancelled.work_id && expired.work_id);

  const p = await portfolio(w.keeper);
  const row = rowFor(p, client);
  assert.equal(row.failed, 2, "two failed");
  assert.equal(row.refused, 1, "one refused");
  assert.equal(row.attention_failed, 3, "the column is the two tokens together");
  assert.equal(row.failed + row.refused, row.attention_failed,
    "the split adds to the column, so the surface never guesses which population the link carries");
  assert.equal(row.active, 0, "cancelled and expired are not active");
  assert.equal(row.recent_success, 0, "and neither is a success");

  // THE LIVE STATUS CHECK, read rather than transcribed — the `failed | refused` split is a
  // measurement of what `clara.accounting_work` actually admits (p659.measure.work_status_facets).
  const chk = await rootQuery(
    "select pg_get_constraintdef(oid) as d from pg_constraint "
    + "where conrelid = 'clara.accounting_work'::regclass and conname = 'accounting_work_status_check'");
  for (const token of ["queued", "running", "awaiting_input", "stopping", "completed",
    "refused", "failed", "cancelled", "expired"]) {
    assert.ok(chk.rows[0].d.includes(`'${token}'`), `the live CHECK admits ${token}`);
  }
});

// ===========================================================================================
// p659.portfolio.window — SEVEN MALAYSIAN CALENDAR DATES ENDING TODAY.
// ===========================================================================================
test("p659.portfolio.window — 00:30 and 23:59 on day-6 are IN, 23:59 on day-7 is OUT; from_date/to_date are published", async (t) => {
  if (await gate(t)) return;
  const w = await freshFirm("win");
  const client = await namedClient(w.owner, `${w.prefix} window`);

  const inLate = await postedWork(w.firm, client, w.owner, { memo: "in-late" });
  const inEarly = await postedWork(w.firm, client, w.owner, { memo: "in-early" });
  const out = await postedWork(w.firm, client, w.owner, { memo: "out" });
  await backdateReceipt(inLate.receipt_id, mytInstant(-6, "23 hours 59 minutes"));
  // 00:30 MYT on day-6 is 16:30 UTC on day-7: a UTC-derived fence would drop it.
  await backdateReceipt(inEarly.receipt_id, mytInstant(-6, "30 minutes"));
  await backdateReceipt(out.receipt_id, mytInstant(-7, "23 hours 59 minutes"));

  const p = await portfolio(w.keeper);
  const row = rowFor(p, client);
  assert.equal(row.recent_success, 2, "day-6 is inside the window at both ends of the day; day-7 is not");
  assert.equal(p.window.timezone, "Asia/Kuala_Lumpur");
  assert.equal(p.window.days, 7);

  const fences = await rootQuery(
    "select ((now() at time zone 'Asia/Kuala_Lumpur')::date - 6)::text as from_date, "
    + "(now() at time zone 'Asia/Kuala_Lumpur')::date::text as to_date");
  assert.equal(p.window.from_date, fences.rows[0].from_date,
    "the envelope names the two MYT calendar dates a drilldown rebuilds");
  assert.equal(p.window.to_date, fences.rows[0].to_date);
});

// ===========================================================================================
// p659.portfolio.onboarding_disclosed — THE 0017 WALL, PINNED AS A DISCLOSED FACT.
// ===========================================================================================
test("p659.portfolio.onboarding_disclosed — an archived client's Work counts while list_review_queue structurally excludes it, an onboarding client is disclosed the same way, and the admission door refuses new Work for both", async (t) => {
  if (await gate(t)) return;
  const w = await freshFirm("onb");

  // THE REACHABLE HALF, MEASURED. `clara.admit_accounting_work` refuses a client that is not
  // `active` ('client is not active -- no new accounting work'), so an ONBOARDING client with Work
  // is not a state this estate can reach through a door today. An ARCHIVED one is: the Work was
  // admitted while the client was active and the client was archived afterwards, which is exactly
  // the client whose Work this board still counts and whose attention numbers the queue does not.
  const archived = await namedClient(w.owner, `${w.prefix} archived co`);
  await queuedWork(archived, w.owner, "work before the archive");
  await archiveClient(archived);

  // AND THE UNREACHABLE HALF, DISCLOSED ANYWAY. An onboarding client carries no Work, and the row
  // still says which population its attention numbers are missing from.
  const onboarding = await onboardingClient(w.owner, `${w.prefix} onboarding co`);
  await assertRaises(CLR10, () => queuedWork(onboarding, w.owner, "refused"),
    "the admission door refuses Work for a client that is not active");

  const p = await portfolio(w.keeper);
  const arch = rowFor(p, archived);
  assert.ok(arch, "the pack counts every client the caller's RLS admits, whatever its status");
  assert.equal(arch.status, "archived");
  assert.equal(arch.active, 1, "clara.accounting_work carries no active-client guard");
  assert.equal(arch.coverage, "partial");
  assert.equal(arch.coverage_reason, "onboarding_client_excluded_from_queue");

  const onb = rowFor(p, onboarding);
  assert.ok(onb, "an onboarding client is on the register too");
  assert.equal(onb.status, "onboarding");
  assert.equal(onb.active, 0);
  assert.equal(onb.coverage_reason, "onboarding_client_excluded_from_queue");

  // THE OTHER HALF, measured rather than transcribed: the queue's own counts exclude both.
  for (const client of [archived, onboarding]) {
    const q = await humanQuery(w.keeper,
      "select clara.list_review_queue(p_scope => $1::jsonb, p_cursor => null, p_limit => 50) as result",
      [JSON.stringify({ client_id: client })]);
    const queue = q.rows[0].result;
    assert.equal(queue.counts.open_tasks + queue.counts.open_questions + queue.counts.needs_you, 0,
      "the queue's active-client join (0017:523-591) sees nothing for a non-active client");
  }

  // AND THE ENVELOPE DECLARES THE CONTRACT rather than re-reading the queue.
  assert.deepEqual(p.sources.review_queue.excludes, ["onboarding", "archived"]);
  assert.equal(p.sources.review_queue.signal, "watermark");
  assert.equal(p.needs_you_ref.floor, "viewer");
  assert.deepEqual(p.needs_you_ref.excludes, ["onboarding", "archived"]);
});

// ===========================================================================================
// p659.portfolio.partial_receipt — a completion this database cannot DATE is named, not dropped.
// ===========================================================================================
test("p659.portfolio.partial_receipt — a completed Work with no committed receipt is uncounted, drives coverage=partial with completions_without_receipt, and is reported", async (t) => {
  if (await gate(t)) return;
  const w = await freshFirm("part");
  const client = await namedClient(w.owner, `${w.prefix} undated`);
  await completedWithoutReceipt(client, w.owner, "undated");

  const p = await portfolio(w.keeper);
  const row = rowFor(p, client);
  assert.equal(row.recent_success, 0, "a completion with no receipt cannot be dated, so it is not counted");
  assert.equal(row.uncounted_completions, 1, "and it is REPORTED rather than quietly making the figure smaller");
  assert.equal(row.coverage, "partial");
  assert.equal(row.coverage_reason, "completions_without_receipt");
});

// ===========================================================================================
// p659.portfolio.preview_ceiling — 101 IS A CEILING ON THE HELPER, NOT ON THE ANSWER.
// ===========================================================================================
test("p659.portfolio.preview_ceiling — a page whose preview ids exceed 101 still answers; the cut rows carry retry_label_preview_only; p_preview=0 assembles no preview at all", async (t) => {
  if (await gate(t)) return;
  const w = await freshFirm("ceil");
  // 21 clients x 5 active Works = 105 preview ids at p_preview=5, four past the helper's own
  // ceiling (0189:262-274). A pack that handed the helper the whole page would REFUSE here.
  for (let i = 0; i < 21; i += 1) {
    const c = await namedClient(w.owner, `${w.prefix} ceil ${String(i).padStart(2, "0")}`);
    for (let k = 0; k < 5; k += 1) await queuedWork(c, w.owner, `c${i}-${k}`);
  }

  const p = await portfolio(w.keeper, { limit: 100, preview: 5 });
  assert.equal(p.rows.length, 21, "the whole page answers");
  for (const row of p.rows) assert.equal(row.active, 5);

  const labelled = p.rows.filter((r) => r.preview.some((x) => x.attempts !== null));
  const cut = p.rows.filter((r) => r.coverage_reason === "retry_label_preview_only");
  assert.ok(labelled.length > 0, "the rows inside the 101 cut carry their attempt labels");
  assert.ok(cut.length > 0, "and the rows beyond it say which part of the answer the door is not making");
  assert.equal(cut.every((r) => r.coverage === "partial"), true);

  // p_preview = 0 — the cheap page. No preview rows at all. Whether the HELPER is called zero
  // times is a separate question, and this cell does not answer it: see
  // `p659.portfolio.preview_zero_calls_helper_zero_times` below, which counts the calls.
  const cheap = await portfolio(w.keeper, { limit: 100, preview: 0 });
  assert.equal(cheap.rows.length, 21);
  for (const row of cheap.rows) {
    assert.deepEqual(row.preview, [], "p_preview=0 assembles no preview ids");
    assert.equal(row.active, 5, "and the COUNT is unaffected — it never came from the preview");
  }
});

// ===========================================================================================
// p659.portfolio.floor_viewer — the two floors, and the shipped viewer number that survives.
// ===========================================================================================
test("p659.portfolio.floor_viewer — a viewer is refused CLR04 before any read, and still receives the viewer-floored review-queue counts", async (t) => {
  if (await gate(t)) return;
  const w = await freshFirm("floor");
  const client = await namedClient(w.owner, `${w.prefix} floor`);
  await queuedWork(client, w.owner, "floor");

  await assertRaises(CLR04, () => portfolio(w.viewer), "a viewer is below the Work floor");

  const q = await humanQuery(w.viewer,
    "select clara.list_review_queue(p_scope => '{}'::jsonb, p_cursor => null, p_limit => 50) as result");
  assert.ok(q.rows[0].result.counts,
    "the shipped viewer-floored counts still answer — the asymmetry is the design, not a defect");

  // And the bookkeeper above it reads the pack.
  const p = await portfolio(w.keeper);
  assert.ok(rowFor(p, client), "the bookkeeper floor is where the Work reads live (0189:344-347)");
});

// ===========================================================================================
// p659.portfolio.cross_firm — THE CURSOR IS A SORT KEY, NEVER A LOOKUP.
// ===========================================================================================
test("p659.portfolio.cross_firm — a cursor naming another firm's REAL client and one naming nothing answer identically; list_review_queue does NOT", async (t) => {
  if (await gate(t)) return;
  const a = await freshFirm("xfa");
  const b = await freshFirm("xfb");
  // Firm A holds `alpha…` and `zeta…`; firm B holds `mid…`. The forged pair sorts strictly
  // between firm A's two rows, so it positions firm A's page after `alpha` either way.
  const stamp = Date.now().toString(36);
  const alphaName = `alpha ${stamp}`;
  const zetaName = `zeta ${stamp}`;
  const midName = `mid ${stamp}`;
  const alpha = await namedClient(a.owner, alphaName);
  const zeta = await namedClient(a.owner, zetaName);
  const mid = await namedClient(b.owner, midName);
  await queuedWork(alpha, a.owner, "a");
  await queuedWork(zeta, a.owner, "z");
  await queuedWork(mid, b.owner, "m");

  const real = await portfolio(a.keeper, { cursor: mintCursor(midName, mid) });
  const invented = await portfolio(a.keeper, {
    cursor: mintCursor(midName, "11111111-1111-4111-8111-111111111111"),
  });
  // The read INSTANT differs between two calls by construction and is not part of the answer, so
  // it is blanked on both sides (it appears twice: at envelope level and in `sources.work`).
  const shape = (p) => JSON.parse(JSON.stringify(p, (k, v) => (k === "computed_at" ? null : v)));
  assert.deepEqual(shape(real), shape(invented),
    "a real referent and an absent one are INDISTINGUISHABLE — the body never resolves the pair");
  assert.deepEqual(real.rows.map((r) => r.client_id), [zeta],
    "both answer a well-formed page of the CALLER's own firm positioned after that sort key");
  assert.equal(real.truncated, false);
  assert.equal(real.next_cursor, null);

  // A cursorless call: firm A's clients, and no firm-B row, id or count anywhere.
  const all = await portfolio(a.keeper);
  const ids = all.rows.map((r) => r.client_id);
  assert.ok(ids.includes(alpha) && ids.includes(zeta));
  assert.ok(!ids.includes(mid), "no firm-B row");
  assert.equal(JSON.stringify(all).includes(mid), false, "no firm-B id anywhere in the envelope");

  // THE CONTRAST, recorded as a CHOICE rather than assumed: `list_review_queue` takes an explicit
  // client scope and raises CLR10 for a client outside the firm (0016:4569-4575) — a cross-firm
  // existence oracle this door has no argument to rebuild, and must not rebuild inside its cursor.
  await assertRaises(CLR10, () => humanQuery(a.keeper,
    "select clara.list_review_queue(p_scope => $1::jsonb, p_cursor => null, p_limit => 50) as result",
    [JSON.stringify({ client_id: mid })]), "list_review_queue IS an existence oracle for a foreign client");
});

// ===========================================================================================
// p659.portfolio.no_money — THE DECISIVE NEGATIVE for AC1's second half.
// ===========================================================================================
test("p659.portfolio.no_money — the body names no money key and the envelope carries none", async (t) => {
  if (await gate(t)) return;
  const w = await freshFirm("money");
  const client = await namedClient(w.owner, `${w.prefix} money`);
  await postedWork(w.firm, client, w.owner, { memo: "posted" });

  // The banned tokens are ASSEMBLED rather than written, so this assertion's own source does not
  // put the words it forbids into a file a later grep will read as a violation.
  const banned = ["amount" + "_cents", "_" + "cents", "de" + "bit", "cre" + "dit", "to" + "tal"];
  const body = await packSrc();
  for (const token of banned) {
    assert.equal(body.includes(token), false,
      `the portfolio body must not name ${token} — an in-body COMMENT is part of prosrc too`);
  }

  const p = await portfolio(w.keeper);
  const flat = JSON.stringify(p);
  for (const token of [...banned, "amount", "bal" + "ance"]) {
    assert.equal(flat.includes(token), false, `the envelope carries no ${token} key`);
  }
});

// ===========================================================================================
// p659.portfolio.catalog — posture, signature, ACL, and the privileges that did NOT move.
// ===========================================================================================
test("p659.portfolio.catalog — SECURITY INVOKER, STABLE, both GUCs pinned, EXECUTE to clara_authenticated only, no period axis, no table privilege moved", async (t) => {
  if (await gate(t)) return;
  const meta = await rootQuery(
    "select pg_get_userbyid(p.proowner) as owner, p.prosecdef, p.provolatile, "
    + "coalesce(array_to_string(p.proconfig, ','), '') as cfg, "
    + "coalesce(array_to_string(p.proacl, ' | '), '(null)') as acl, "
    + "pg_get_function_arguments(p.oid) as args "
    + `from pg_proc p where p.oid = '${PACK_SIG}'::regprocedure`);
  const m = meta.rows[0];
  assert.equal(m.owner, "clara_fn_owner");
  assert.equal(m.prosecdef, false,
    "SECURITY INVOKER — every relation it reads is already granted behind forced firm-scoped RLS");
  assert.equal(m.provolatile, "s", "STABLE");
  assert.ok(m.cfg.replace(/ /g, "").includes("search_path=clara,pg_temp"));
  assert.ok(m.cfg.replace(/ /g, "").includes("plan_cache_mode=force_custom_plan"));
  assert.equal(m.acl, "clara_fn_owner=X/clara_fn_owner | clara_authenticated=X/clara_fn_owner");
  assert.equal(m.args,
    "p_limit integer DEFAULT 50, p_cursor text DEFAULT NULL::text, p_preview integer DEFAULT 3",
    "the signature is the enforcement of `a financial period never narrows Work attention` AND of `the firm is not a parameter`");

  const n = await rootQuery(
    "select count(*)::int as n from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace "
    + "where ns.nspname = 'clara' and p.proname = 'get_firm_portfolio_pack'");
  assert.equal(n.rows[0].n, 1, "exactly one pg_proc row — an overload would be a second surface");

  const moved = await rootQuery(
    "select string_agg(format('%s:%s', table_name, privilege_type), ',' order by table_name, privilege_type) as bad "
    + "from information_schema.role_table_grants where table_schema = 'clara' "
    + "and grantee = 'clara_authenticated' and table_name in ('accounting_work','operation_receipts','clients') "
    + "and privilege_type <> 'SELECT'");
  assert.equal(moved.rows[0].bad, null,
    "the three relations this read borrows still carry SELECT and nothing else");
  const tasks = await rootQuery(
    "select count(*)::int as n from information_schema.role_table_grants "
    + "where table_schema = 'clara' and table_name = 'agent_tasks' and grantee = 'clara_authenticated'");
  assert.equal(tasks.rows[0].n, 0,
    "clara.agent_tasks is STILL ungranted — the retry label goes through 0189's helper");
});

// ===========================================================================================
// p659.portfolio.machine_lanes — no model lane executes either new door.
// ===========================================================================================
test("p659.portfolio.machine_lanes — clara_runtime, the agent role and both wake roles cannot execute either function", async (t) => {
  if (await gate(t)) return;
  for (const role of [ROLES.runtime, ROLES.agentRo, ROLES.wakeInteractive, ROLES.wakeProactive]) {
    await assertRaises("42501", () => roleQuery(role, "select clara.get_firm_portfolio_pack()"),
      `${role} must not execute get_firm_portfolio_pack`);
    await assertRaises("42501", () => roleQuery(role,
      "select clara.get_compliance_watch_disposition('11111111-1111-4111-8111-111111111111'::uuid)"),
      `${role} must not execute get_compliance_watch_disposition`);
  }
});

// ===========================================================================================
// p659.portfolio.paging — the cursor round-trips, INCLUDING through a piped client name.
// ===========================================================================================
test("p659.portfolio.paging — next_cursor round-trips, a name containing | round-trips too, a malformed cursor and an empty name component both refuse CLR10 invalid_cursor", async (t) => {
  if (await gate(t)) return;
  const w = await freshFirm("page");
  // `clara.clients.name` carries NO character CHECK, so a pipe is a legal client name and the
  // cursor must split at the LAST one. A first-pipe split hands the uuid cast a fragment.
  const piped = await namedClient(w.owner, "Acme | KL Sdn Bhd");
  const later = await namedClient(w.owner, "Zenith Holdings");
  await queuedWork(piped, w.owner, "p");
  await queuedWork(later, w.owner, "l");

  const first = await portfolio(w.keeper, { limit: 1 });
  assert.equal(first.rows.length, 1);
  assert.equal(first.rows[0].client_id, piped, "lower(name) orders `acme | kl sdn bhd` first");
  assert.equal(first.truncated, true);
  assert.equal(first.coverage, "partial");
  assert.equal(first.coverage_reason, "register_page_truncated");
  assert.ok(typeof first.next_cursor === "string" && first.next_cursor.length > 0);
  assert.equal(Buffer.from(first.next_cursor, "base64").toString("utf8"), `acme | kl sdn bhd|${piped}`,
    "the cursor is the sort key, spelled `lower(name)|uuid`");

  const second = await portfolio(w.keeper, { limit: 1, cursor: first.next_cursor });
  assert.equal(second.rows.length, 1);
  assert.equal(second.rows[0].client_id, later, "the piped name round-tripped: the split is at the LAST |");
  assert.equal(second.truncated, false);
  assert.equal(second.next_cursor, null);

  await assertPair(CLR10, "invalid_cursor", () => portfolio(w.keeper, { cursor: "not base64 at all !!" }),
    "a malformed cursor");
  await assertPair(CLR10, "invalid_cursor", () => portfolio(w.keeper, { cursor: mintCursor("", piped) }),
    "an EMPTY name component compares below every real row and would answer a clean first page");
  await assertPair(CLR10, "invalid_cursor", () => portfolio(w.keeper, { cursor: mintCursor("   ", piped) }),
    "a whitespace-only name component refuses with the same token");
  await assertPair(CLR10, "invalid_cursor",
    () => portfolio(w.keeper, { cursor: Buffer.from("no pipe here", "utf8").toString("base64") }),
    "a cursor with no pipe at all");
  await assertPair(CLR10, "invalid_cursor",
    () => portfolio(w.keeper, { cursor: Buffer.from("alpha|not-a-uuid", "utf8").toString("base64") }),
    "a cursor whose trailing component is not a uuid");
});

// ===========================================================================================
// p659.portfolio.cursor_stability — THE ORDERED-KEY CELL. The version of this bug that never reds.
// ===========================================================================================
test("p659.portfolio.cursor_stability — a register that gains, renames and archives rows across an open page boundary repeats no row and drops none the caller may see", async (t) => {
  if (await gate(t)) return;
  const w = await freshFirm("stab");
  const stamp = Date.now().toString(36);
  const made = {};
  for (const n of ["bravo", "delta", "foxtrot", "hotel"]) {
    made[n] = await namedClient(w.owner, `${n} ${stamp}`);
  }

  const page1 = await portfolio(w.keeper, { limit: 2 });
  assert.deepEqual(page1.rows.map((r) => r.client_id), [made.bravo, made.delta]);
  assert.equal(page1.truncated, true);

  // The register MOVES between the two fetches: a birth, a rename across the boundary, an archive.
  const added = await namedClient(w.owner, `charlie ${stamp}`);
  await rootQuery("update clara.clients set name = $2 where id = $1", [made.foxtrot, `zulu ${stamp}`]);
  await archiveClient(made.hotel);

  const page2 = await portfolio(w.keeper, { limit: 2, cursor: page1.next_cursor });
  const seen = new Set(page1.rows.map((r) => r.client_id));
  for (const r of page2.rows) {
    assert.equal(seen.has(r.client_id), false, `page 2 repeats ${r.name}, which page 1 already carried`);
  }
  assert.equal(page2.rows.some((r) => r.client_id === made.hotel), true,
    "an ARCHIVED client is still a client the caller may see — the pack drops nothing");
  assert.equal(page2.rows.some((r) => r.client_id === added), false,
    "a client born BEFORE the fence is not resurrected onto a later page");

  // THE ORDER ITSELF, asserted out of the body so a later refactor cannot quietly return to an
  // unordered page (0203:601's literal-order probe shape).
  assert.ok((await packSrc()).includes("order by lower(c.name), c.id"),
    "the keyset order is in the body, not in a caller's hope");
});

// ===========================================================================================
// p659.portfolio.no_recut — the five prestate pins are still byte-identical after 0231.
// ===========================================================================================
async function migrationApplied(pattern) {
  const r = await rootQuery(
    "select count(*)::int as n from clara.schema_migrations where version ~ $1", [pattern]);
  return r.rows[0].n > 0;
}

test("p659.portfolio.no_recut — list_review_queue, list_accounting_work, get_client_work_pack, _work_run_attempts and list_activity are untouched", async (t) => {
  if (await gate(t)) return;
  // TWO OF THE FIVE ARE PINNED IN BOTH GENERATIONS (wave 2, 2026-09-20). This cell's claim is
  // "0231 recuts nothing", and that claim is still exactly what it asserts — but two of the five
  // bodies were LATER recut, in scope, by tickets of their own, and a pin that named only the
  // pre-image would turn their verified work into a false red here:
  //   · clara.list_review_queue — #974 (0260) splices one `authority_rows` CTE, one union arm
  //     and one `authority_id` json-builder gate for the `depreciation_authority_pending` row
  //     kind. 0260's own postcheck proves the ten pre-existing row kinds survive at their exact
  //     pre-splice marker counts; that recut's proof lives in
  //     depreciation-authority-pending-rowkind.test.mjs, not here. Then ticket 1012 (0288)
  //     splices the SAME body the other way for the first time: the `seeding_rows` CTE and its
  //     union arm are REMOVED, because the prior-GL seeding lane they chased is retired. 0288's
  //     own postcheck proves the TEN surviving row kinds sit at their exact pre-splice marker
  //     counts and that the shared column vector did not move; the behavioural proof lives in
  //     ninth-rowkind-seeding-proposal.test.mjs and seeding-lane-retired.test.mjs.
  //   · clara.list_activity — #840 (0262) projects `successor_work_id`, then #861 (0264) rebuilds
  //     the kind ladder with five new rungs. Both are create-or-replace recuts that 0262/0264's
  //     own tails re-measure; activity-feed.test.mjs carries their behavioural proof.
  //   · clara.list_accounting_work — #880 (0266) adds the claim projection
  //     (`claim_id`/`claimant_label`) so the work list no longer asks
  //     clara.get_work_claim_origin by name, and then #905 (0267) DROPS the nine-argument
  //     signature and creates an ELEVEN-argument one (two trailing timestamptz receipt-window
  //     bounds, both defaulting to null, so every existing call of up to nine arguments still
  //     resolves). This one differs in kind from the other two: the pin does not merely move,
  //     the SIGNATURE STOPS EXISTING, so `'<nine-arg sig>'::regprocedure` raises 42883
  //     ("function ... does not exist") rather than returning a different sha. Both the pin map
  //     and the prosecdef read below therefore select the signature as well as the value.
  //     0266's and 0267's own tails re-measure the body; work-list-receipt-window.test.mjs and
  //     work-list-claim-label.test.mjs carry the behavioural proof, not this cell.
  // So each of the three carries its pre-image AND its post-image, selected on whether the
  // recutting migration is applied — the shape intake-batch.test.mjs uses for #964's window
  // recut, for the same reason. The other two (get_client_work_pack, _work_run_attempts) are
  // unmoved in either world.
  //
  // WHY ONE GATE COVERS BOTH OF list_accounting_work's RECUTS: 0266 and 0267 are consecutive
  // files in one ordered chain, so the post-0266 / pre-0267 nine-argument body is not a state
  // any database rests in — a chain that stopped between them failed, and a sha mismatch here is
  // then the right answer rather than a false red.
  const reviewQueueRecut = await migrationApplied("^0260_");
  const seedingRetired = await migrationApplied("^0288_");
  const activityRecut = await migrationApplied("^0264_");
  const workListWidened = await migrationApplied("^0267_");
  const workListSig = workListWidened ? "clara.list_accounting_work(uuid,text[],uuid,text[],timestamptz,timestamptz,text,text,int,timestamptz,timestamptz)" : "clara.list_accounting_work(uuid,text[],uuid,text[],timestamptz,timestamptz,text,text,int)";
  const PINS = {
    "clara.list_review_queue(jsonb,jsonb,int)":
      seedingRetired
        ? "f4a34c72e567bf825d4376d043ea23cc3d8bcd2d4f0caaee3a5d052bf8a25d69"
        : reviewQueueRecut
          ? "1641f99f4d295400bd39bd7b2cee3ac4cac2c34e7478078014e7305d99d9b570"
          : "29deb82d1609441d40a5be6131ffac12dc6b0ee8f1d37645dd9de986ce3eaf40",
    [workListSig]:
      workListWidened
        ? "dffa917db2180f5a13be48795ea823ef5cece813677d8d6ad6c61cf01726a828"
        : "61bd9184fe271e081af426647c4081155c6d086368411478d1f2be88a1f4ca5a",
    "clara.get_client_work_pack(uuid,int)":
      "07698be0d6867787bcea81994214edd017216c0471bf95db21f7629d1572441e",
    "clara._work_run_attempts(uuid[])":
      "3da8d655d78cac6eede8444321492fc4a1b5797a4f8a826fb878e26081cfa69e",
    "clara.list_activity(text,int,uuid,text[],timestamptz,timestamptz,uuid)":
      activityRecut
        ? "02a7f720a936dc434013047835e4cda1661c2576ff0dcbc86636d6a0cbf8f869"
        : "dec4bc22c7d01ca67e651168aa18718f05e47b9c9aba2ec84288981992e9f870",
  };
  for (const [sig, sha] of Object.entries(PINS)) {
    const r = await rootQuery(
      "select encode(sha256(convert_to(prosrc, 'UTF8')), 'hex') as sha "
      + `from pg_proc where oid = '${sig}'::regprocedure`);
    assert.equal(r.rows[0].sha, sha,
      `${sig} DRIFTED — 0231 recuts nothing, and only #974's (0260), #840/#861's (0262/0264), `
      + "#880/#905's (0266/0267) and ticket 1012's (0288) own named recuts are tolerated");
  }
  const secdef = await rootQuery(
    "select (select prosecdef from pg_proc where oid = 'clara.list_review_queue(jsonb,jsonb,int)'::regprocedure) as q, "
    + `(select prosecdef from pg_proc where oid = '${workListSig}'::regprocedure) as w, `
    + "(select prosecdef from pg_proc where oid = 'clara.list_activity(text,int,uuid,text[],timestamptz,timestamptz,uuid)'::regprocedure) as a");
  assert.equal(secdef.rows[0].q, true, "list_review_queue is still SECURITY DEFINER");
  assert.equal(secdef.rows[0].w, false, "list_accounting_work is still SECURITY INVOKER");
  assert.equal(secdef.rows[0].a, false, "list_activity is still SECURITY INVOKER");
});

// ===========================================================================================
// FIX ROUND 1 · A1 — WHAT A `work_question` QUEUE ROW CAN AND CANNOT ADDRESS.
//
// #659 repointed the Needs-you inbox's `work_question` row at `/clients/:clientId/work/:workId`,
// built from the row's `task_id`, on the brief's premise that "the row carries the parked run in
// task_id". The premise is true and the CONCLUSION is false: `task_id` is an `agent_tasks` id, and
// the accounting Work is a DIFFERENT column of the same interruption (`work_id`), which the queue
// row does not publish. A link built from `task_id` addresses a Work-detail route that resolves
// nothing (`apps/web/lib/work/reads.ts`'s `getAccountingWork` returns null for an id that is not an
// `accounting_work.id`).
//
// The web cell that was supposed to catch this asserted the builder's output against a MADE-UP
// uuid, so it was true by construction. This cell uses a REAL parked Work, through the real doors,
// and measures the two ids against each other. It is also a live guard on the residual: the day
// `list_review_queue` learns to publish `work_id`, the last assertion reds and tells the next lane
// that the deep link it wanted is now buildable.
// ===========================================================================================

test("p659.links.work_question_row_cannot_address_its_work", async (t) => {
  if (await gate(t)) return;
  const { parkedWork, listReviewQueue } = await import("./work-question-fixtures.mjs");
  const w = await freshFirm("lnk");
  const client = await namedClient(w.owner, `${w.prefix} Rome Properties`);

  const parked = await parkedWork({ client, author: w.owner });
  assert.match(parked.workId, UUID_RE);
  assert.match(parked.taskId, UUID_RE);
  assert.notEqual(parked.taskId, parked.workId,
    "the parked RUN and the accounting WORK are two different rows — this is the whole finding");

  const envelope = await listReviewQueue(w.owner);
  const row = (envelope.rows ?? []).find(
    (r) => r.row_kind === "work_question" && r.client_id === client);
  assert.ok(row, "the owner's queue carries the pending question as a work_question row");

  // WHAT THE ROW ACTUALLY PUBLISHES. `wqi.task_id` — the agent task — beside `wqi.id` as the row's
  // own id. The Work reached the row only through the join `accounting_work wqw on wqw.id =
  // wqi.work_id`, which contributes the client and the memo and no id at all.
  assert.equal(row.task_id, parked.taskId, "task_id is the AGENT TASK, exactly as 0180 selects it");
  assert.notEqual(row.task_id, parked.workId,
    "so `/clients/:id/work/<task_id>` addresses a Work that does not exist");
  assert.equal(row.id, parked.questionId, "and the row's own id is the INTERRUPTION, not the Work");

  // THE RESIDUAL, ASSERTED. No column of this row carries the accounting Work's id, so there is
  // nothing on it a correct deep link could be built from today.
  const carriers = Object.entries(row).filter(([, v]) => v === parked.workId).map(([k]) => k);
  assert.deepEqual(carriers, [],
    "no field of the queue row is the accounting_work id — when one appears, the deep link becomes buildable");
});

// ===========================================================================================
// p659.portfolio.preview_zero_calls_helper_zero_times — THE CALL COUNT, COUNTED.
//
// Fix round 1, finding A9. The migration header claims "`p_preview = 0` calls the helper NOT AT
// ALL — the cheap page", and nothing in this battery measured a call: `preview_ceiling` asserted
// only that the preview array came back empty and the counts were unaffected, which is true
// whether the helper runs or not. The body keeps `left join clara._work_run_attempts(v_labelled)`
// in the statement unconditionally, so the zero is a PLAN SHAPE, not a guard in the SQL — with
// `v_preview_ids` empty the outer scan yields no rows and the inner function scan is never
// executed. That is worth believing only if it is counted, so this cell counts it.
//
// HOW: `pg_stat_user_functions` with `track_functions = 'all'` set on THIS session, forced to
// flush with `pg_stat_force_next_flush()` (PG 15+) because stats are otherwise reported at
// transaction end with a minimum interval and the first, un-forced form of this probe read zeros
// for BOTH arms — a measurement that would have "confirmed" the claim by measuring nothing.
//
// The counter is cluster-wide, so this cell takes a DELTA across its own two calls and asserts the
// SHAPE (0 then 1), not an absolute.
// ===========================================================================================
test("p659.portfolio.preview_zero_calls_helper_zero_times", async (t) => {
  if (await gate(t)) return;
  const { getPool } = await import("./rig-helpers.mjs");
  const w = await freshFirm("cnt");
  const c1 = await namedClient(w.owner, `${w.prefix} Counted Co`);
  await queuedWork(c1, w.owner, "cnt-1");

  const conn = await getPool().connect();
  const calls = async () => {
    await conn.query("select pg_stat_force_next_flush()");
    const r = await conn.query(
      `select coalesce(sum(f.calls), 0)::int as n
         from pg_stat_user_functions f join pg_proc p on p.oid = f.funcid
         join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'clara' and p.proname = '_work_run_attempts'`);
    return r.rows[0].n;
  };
  try {
    await conn.query("set track_functions = 'all'");
    await conn.query(`set role ${ROLES.authenticated}`);
    await conn.query(
      "select set_config('request.jwt.claims', json_build_object('sub', $1::text)::text, false)", [w.keeper]);

    const before = await calls();
    const cheap = await conn.query("select clara.get_firm_portfolio_pack(p_preview => 0) as result");
    const afterCheap = await calls();
    assert.deepEqual(cheap.rows[0].result.rows.map((r) => r.preview), [[]], "the cheap page has no preview");
    assert.equal(afterCheap - before, 0,
      "p_preview = 0 does not reach clara._work_run_attempts at all — the header's claim, counted");

    const full = await conn.query("select clara.get_firm_portfolio_pack(p_preview => 3) as result");
    const afterFull = await calls();
    assert.equal(full.rows[0].result.rows[0].preview.length, 1, "the full page has its preview");
    assert.equal(afterFull - afterCheap, 1,
      "and a page that DOES want labels asks the helper exactly once, for the whole cut array");
  } finally { conn.release(); }
});
