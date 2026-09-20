// #632 — the attributable Activity feed battery for packages/db/migrations/0181_activity_feed.sql.
//
// CONTRACT-BLIND, frontier-gated on the `activity_feed$` stable stem (the
// work-journal-fixtures.mjs workLaneReady()/gateWork() pattern, restated here for this
// migration's own stem so the slice-frontier CI legs skip cleanly rather than red on a database
// pinned before 0181 lands).
//
// WHAT THIS FILE IS ABOUT. `clara.list_activity` unions three already-granted sources
// (clara.firm_timeline_visible, clara.agent_receipts_visible, clara.operation_receipts) into one
// keyset-paged, filterable feed; `clara.get_activity_event` is its detail door. This battery
// proves: the bookkeeper+ floor, cross-firm isolation, the client/kind/since/until filters,
// keyset pagination that is stable across a page boundary with an EXACT timestamp tie, a real
// #623 Work posting's operation_receipt row and its correction chain via clara.reverse_entry, a
// document event, an agent-receipt row, and get_activity_event's no-oracle CLR11 denial.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  rootQuery, humanQuery, buildWorkWorld, freshWorkClient, endPool, opk, assertRaises,
  admitJournalWork, claimWorkRun, mintClientObo, wakeRecordJournalEntry, basis, AGENT_USER_ID,
  printSkipCount,
} from "./work-journal-fixtures.mjs";
import { seedVerifiedDocument } from "./rig-docs-fixtures.mjs";
import { withTxn } from "./rig-txn.mjs";
// #840 — the two verbs its own successor-link cells need; work-cancel-fixtures.mjs re-exports
// everything work-journal-fixtures.mjs does, so only the TWO names this file does not already
// import above are pulled from it (a second import of an already-imported name is a duplicate
// binding, not a convenience).
import { restateAccountingWork, cancelAccountingWork } from "./work-cancel-fixtures.mjs";

const CLR04 = "CLR04";
const CLR10 = "CLR10";
const CLR11 = "CLR11";
const STEM = "activity_feed$";

let _ready = null;
async function activityFeedReady() {
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
  if (await activityFeedReady()) return false;
  t.skip(`#632 activity-feed lane absent (no ${STEM} migration applied)`);
  return true;
}

// #728 — the sweep-attribution recut lives in ITS OWN migration (0183), a separate frontier from
// 0181's above: a slice-frontier CI leg can be pinned AT 0181, before 0183 lands, and the cells
// below must skip cleanly there rather than red on a door that has not yet gained the sweep arm.
const SWEEP_STEM = "activity_sweep_attribution$";
let _sweepReady = null;
async function sweepAttributionReady() {
  if (_sweepReady === null) {
    try {
      const r = await rootQuery(
        "select count(*)::int as n from clara.schema_migrations where version ~ $1", [SWEEP_STEM]);
      _sweepReady = r.rows[0].n > 0;
    } catch {
      _sweepReady = false;
    }
  }
  return _sweepReady;
}

async function gateSweep(t) {
  if (await sweepAttributionReady()) return false;
  t.skip(`#728 activity-sweep-attribution lane absent (no ${SWEEP_STEM} migration applied)`);
  return true;
}

// #770 — the `p_work` door filter lives in ITS OWN migration (0202), a THIRD frontier past
// 0181's and 0183's above. That migration DROPs the six-argument signature and creates a
// seven-argument one, so the wrapper below must address whichever arity the database under test
// actually carries: a slice-frontier leg pinned at 0181 or 0184 must keep every 0181/0183/0184
// cell green, and only the p_work cells skip.
const PWORK_STEM = "list_activity_p_work$";
let _pWorkReady = null;
async function pWorkReady() {
  if (_pWorkReady === null) {
    try {
      const r = await rootQuery(
        "select count(*)::int as n from clara.schema_migrations where version ~ $1", [PWORK_STEM]);
      _pWorkReady = r.rows[0].n > 0;
    } catch {
      _pWorkReady = false;
    }
  }
  return _pWorkReady;
}

async function gatePWork(t) {
  if (await pWorkReady()) return false;
  t.skip(`#770 list_activity p_work lane absent (no ${PWORK_STEM} migration applied)`);
  return true;
}

// #840 — the successor-Work link on a `work.cancelled` row lives in ITS OWN migration (0262), a
// FOURTH frontier past 0181's/0183's/0202's above. Unlike 0202, this recut is `create or replace`
// over an UNCHANGED signature (an additive jsonb key, not a new parameter), so no arity switch is
// owed here — only the stem check itself.
const SUCCESSOR_STEM = "activity_successor_link$";
let _successorReady = null;
async function successorLinkReady() {
  if (_successorReady === null) {
    try {
      const r = await rootQuery(
        "select count(*)::int as n from clara.schema_migrations where version ~ $1", [SUCCESSOR_STEM]);
      _successorReady = r.rows[0].n > 0;
    } catch {
      _successorReady = false;
    }
  }
  return _successorReady;
}

/** `if (await gateSuccessorLink(t)) return;` — the house per-cell frontier gate, always a quiet
 *  skip (the db-slice-frontiers matrix's own need). */
async function gateSuccessorLink(t) {
  if (await successorLinkReady()) return false;
  t.skip(`#840 activity-successor-link lane absent (no ${SUCCESSOR_STEM} migration applied)`);
  return true;
}

/** The pre-integration discriminator (accrual-adjustments-fixtures.mjs's own idiom, restated here
 *  because this file's frontier gates are local rather than imported from a shared fixtures
 *  module): a FOCUSED run against a database without this migration is a real failure, and only
 *  the package-wide sweep's preloaded gate module (activity-successor-link-preintegration-gate.mjs)
 *  turns it into a skip. Called ONCE, by the first cell that depends on this frontier; every other
 *  cell in this lane uses the plain `gateSuccessorLink` above. */
async function assertSuccessorLinkCohortPresent(t) {
  if (await successorLinkReady()) return false;
  if (process.env.CLARA_ALLOW_MISSING_ACTIVITY_SUCCESSOR_LINK === "1") {
    t.skip("#840 activity-successor-link lane absent (pre-integration sweep)");
    return true;
  }
  assert.fail(
    "#840: the activity-successor-link lane is absent. Apply 0262_activity_successor_link.sql, or "
    + "set CLARA_ALLOW_MISSING_ACTIVITY_SUCCESSOR_LINK=1 for the package-wide pre-integration sweep.");
  return true;
}

/** The door's regprocedure address at whatever arity this database carries — every catalog probe
 *  below reads the body through this rather than through a literal signature, so the arity change
 *  0202 makes is stated in ONE place. */
async function listActivitySignature() {
  return (await pWorkReady())
    ? "clara.list_activity(text,int,uuid,text[],timestamptz,timestamptz,uuid)"
    : "clara.list_activity(text,int,uuid,text[],timestamptz,timestamptz)";
}

let world = null;
before(async () => {
  world = await buildWorkWorld();
});
after(async () => {
  printSkipCount("activity-feed");
  await endPool();
});

const FIRM_A = () => world.firms.A;
const ALICE = () => world.users.alice; // owner, firm A
const BOB = () => world.users.bob; // bookkeeper, firm A
const CAROL = () => world.users.carol; // viewer, firm A
const DAVE = () => world.users.dave; // owner, firm B
const FIRM_B = () => world.firms.B;

// ===========================================================================================
// Wrappers over the two new doors, positional (the order this migration declares them in).
// ===========================================================================================

async function listActivity(sub, { cursor = null, limit = 50, client = null, kinds = null, since = null, until = null, work = null } = {}) {
  // #770: the door gained a SEVENTH parameter and lost its six-argument signature in the same
  // migration (0202), so this wrapper picks the arity the database under test actually has.
  if (await pWorkReady()) {
    const r = await humanQuery(sub,
      "select clara.list_activity($1::text,$2::int,$3::uuid,$4::text[],$5::timestamptz,$6::timestamptz,$7::uuid) as result",
      [cursor, limit, client, kinds, since, until, work]);
    return r.rows[0].result;
  }
  assert.equal(work, null,
    "a p_work-scoped read was attempted on a database whose list_activity has no p_work parameter — "
    + "the cell that asked for it must be gated on gatePWork");
  const r = await humanQuery(sub,
    "select clara.list_activity($1::text,$2::int,$3::uuid,$4::text[],$5::timestamptz,$6::timestamptz) as result",
    [cursor, limit, client, kinds, since, until]);
  return r.rows[0].result;
}

async function getActivityEvent(sub, source, id) {
  const r = await humanQuery(sub, "select clara.get_activity_event($1::text,$2::text) as result", [source, id]);
  return r.rows[0].result;
}

// ===========================================================================================
// Fixture builders not already offered by work-journal-fixtures.mjs.
// ===========================================================================================

/** A wired agent_act_receipts row (receipt_kind 'agent_act', 0138/0174) — the cheapest wired
 *  agent-receipt kind to construct directly: a companion agent_tasks row (kind='autodraft', the
 *  same "cheapest lawful shape" binding-proposal-pr-1.test.mjs uses) plus one insert. `occurredAt`
 *  lets a cell force an EXACT timestamp tie against another row, which no product path can do. */
async function mkAgentAct({ firm, client, actingActor = AGENT_USER_ID, occurredAt = null }) {
  const task = (await rootQuery(
    `insert into clara.agent_tasks(firm_id, client_id, kind, status, model_snapshot, created_by)
     values ($1,$2,'autodraft','queued','clara-test-model',$3) returning id`,
    [firm, client, actingActor])).rows[0].id;
  const cols = ["firm_id", "client_id", "act_kind", "subject_kind", "subject_id", "acting_actor",
    "via_wake_kind", "wake_task_id", "model_name", "model_version", "rationale", "verdict", "op_key"];
  const vals = [firm, client, "close_read", "client", client, actingActor,
    "close_prep", task, "clara-test", "1", "#632 rig probe", "acted", opk("w632-aar")];
  let sql = `insert into clara.agent_act_receipts(${cols.join(",")}) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) returning id, created_at`;
  if (occurredAt) {
    sql = `insert into clara.agent_act_receipts(${cols.join(",")}, created_at) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) returning id, created_at`;
    vals.push(occurredAt);
  }
  const r = await rootQuery(sql, vals);
  return { id: r.rows[0].id, createdAt: r.rows[0].created_at, taskId: task };
}

/** Admit + claim + mint OBO + post a documentless #623 Work entry, exactly the
 *  work-journal-post.test.mjs "armed()" shape, returning enough to assert the operation_receipt
 *  row and the entry it produced. */
async function postWorkEntry({ client, author = BOB(), b = null }) {
  const bas = b ?? basis();
  const work = await admitJournalWork({ client, author, basis: bas });
  await claimWorkRun({ task: work.task_id, runId: opk("w632-run") });
  const cred = await mintClientObo({ firm: FIRM_A(), obo: author, client });
  const out = await wakeRecordJournalEntry(cred.secret, {
    client, work: work.work_id, logicalOpId: work.logical_op_id, basis: bas,
  });
  return { ...out, workId: work.work_id, client, author };
}

function rowsOf(page) {
  return Array.isArray(page?.rows) ? page.rows : [];
}

/** #728 — a finalized `clara.sweep_runs` row plus the `sweep.run_completed` event it reports,
 *  the SAME two writes `clara.reconcile_sweep_runs` performs (0011:2753-2764) but constructed
 *  directly (as root) so a cell can force an EXACT `drafted_count` without driving the whole
 *  autodraft machinery. `_append_event` is called directly too (root bypasses its ungranted ACL,
 *  exactly as every other direct-event fixture in this estate's rig does) so the payload carries
 *  the run's own id, precisely as `clara._sweep_events_with_effect` (0183) expects. Returns the
 *  event's OWN id/occurred_at, read back from `clara.domain_events` by (firm_id, seq) — the seq
 *  `_append_event` hands back, never assumed. */
async function mkSweepEvent({ firm, draftedCount, postedCount = 0, refusedCount = 0,
  skippedCount = 0, expectedCount = null }) {
  const exp = expectedCount ?? draftedCount;
  const run = (await rootQuery(
    `insert into clara.sweep_runs(firm_id, state, window_started_at, window_ended_at,
        expected_count, drafted_count, posted_count, refused_count, skipped_count, finalized_at)
     values ($1, 'finalized', now(), now(), $2, $3, $4, $5, $6, now()) returning id`,
    [firm, exp, draftedCount, postedCount, refusedCount, skippedCount])).rows[0].id;
  const seq = (await rootQuery(
    `select clara._append_event($1, 'sweep.run_completed', null, null, null, null, null, null, null,
        jsonb_build_object('run_id', $2::uuid, 'expected_count', $3::int)) as seq`,
    [firm, run, exp])).rows[0].seq;
  const ev = (await rootQuery(
    `select id::text as id, created_at from clara.domain_events where firm_id = $1 and seq = $2`,
    [firm, seq])).rows[0];
  return { runId: run, eventId: ev.id, occurredAt: ev.created_at.toISOString() };
}

// ===========================================================================================
// 1 · Role floor and cross-firm isolation.
// ===========================================================================================

test("af.1 list_activity and get_activity_event refuse a below-bookkeeper caller CLR04", async (t) => {
  if (await gate(t)) return;
  await assertRaises(CLR04, () => listActivity(CAROL()), "af.1 list_activity/viewer");
  await assertRaises(CLR04, () => getActivityEvent(CAROL(), "event", "00000000-0000-0000-0000-000000000000"),
    "af.1 get_activity_event/viewer");
  // The YES that gives the NO meaning: the SAME call succeeds for a bookkeeper of the same firm.
  const page = await listActivity(BOB());
  assert.ok(page && Array.isArray(page.rows), "af.1 a bookkeeper reads a well-shaped page");
});

test("af.2 the feed never crosses a firm boundary", async (t) => {
  if (await gate(t)) return;
  const cli = await freshWorkClient(ALICE(), "af2");
  await mkAgentAct({ firm: FIRM_A(), client: cli });

  const mine = await listActivity(BOB(), { client: cli, limit: 100 });
  assert.ok(rowsOf(mine).length > 0, "af.2 firm A's bookkeeper sees the row it just made (the YES)");

  // Firm B's owner cannot see it even asking firm-wide (no client filter) — every row it could
  // read is scoped to firm_id = jwt_firm() by construction in every one of the three arms.
  const theirs = await listActivity(DAVE(), { limit: 200 });
  assert.equal(rowsOf(theirs).some((r) => r.client_id === cli), false,
    "af.2 firm B never sees firm A's client in an unfiltered read");
  const theirsFiltered = await listActivity(DAVE(), { client: cli, limit: 100 });
  assert.equal(rowsOf(theirsFiltered).length, 0, "af.2 filtering by another firm's client returns nothing, not an error");
});

// ===========================================================================================
// 2 · Filters.
// ===========================================================================================

test("af.3 the client filter narrows to exactly that client's rows", async (t) => {
  if (await gate(t)) return;
  const cliX = await freshWorkClient(ALICE(), "af3x");
  const cliY = await freshWorkClient(ALICE(), "af3y");
  await mkAgentAct({ firm: FIRM_A(), client: cliX });
  await mkAgentAct({ firm: FIRM_A(), client: cliY });

  const onlyX = await listActivity(BOB(), { client: cliX, limit: 100 });
  const rows = rowsOf(onlyX);
  assert.ok(rows.length > 0, "af.3 X has rows");
  assert.ok(rows.every((r) => r.client_id === cliX), "af.3 every row belongs to X");
});

test("af.4 the kind filter narrows to the requested closed-set groups, and an unknown kind refuses CLR10", async (t) => {
  if (await gate(t)) return;
  const cli = await freshWorkClient(ALICE(), "af4");
  await mkAgentAct({ firm: FIRM_A(), client: cli });

  const agentOnly = await listActivity(BOB(), { client: cli, kinds: ["agent"], limit: 100 });
  assert.ok(rowsOf(agentOnly).length > 0, "af.4 the agent-act receipt is in the agent group");
  assert.ok(rowsOf(agentOnly).every((r) => r.kind === "agent"), "af.4 every returned row is kind=agent");

  const journalOnly = await listActivity(BOB(), { client: cli, kinds: ["journal"], limit: 100 });
  assert.equal(rowsOf(journalOnly).length, 0, "af.4 the same client has no journal-kind rows yet");

  await assertRaises(CLR10, () => listActivity(BOB(), { client: cli, kinds: ["not_a_real_kind"] }),
    "af.4 an unrecognised kind is refused, not silently dropped");
});

test("af.5 since/until bound occurred_at on both ends", async (t) => {
  if (await gate(t)) return;
  const cli = await freshWorkClient(ALICE(), "af5");
  const early = await mkAgentAct({ firm: FIRM_A(), client: cli, occurredAt: "2020-01-01T00:00:00Z" });
  const late = await mkAgentAct({ firm: FIRM_A(), client: cli, occurredAt: "2030-01-01T00:00:00Z" });

  const onlyEarly = await listActivity(BOB(), { client: cli, until: "2025-01-01T00:00:00Z", limit: 100 });
  const earlyIds = rowsOf(onlyEarly).map((r) => r.id);
  assert.ok(earlyIds.includes(`agent_act:${early.id}`), "af.5 the early row is within until");
  assert.equal(earlyIds.includes(`agent_act:${late.id}`), false, "af.5 the late row is excluded by until");

  const onlyLate = await listActivity(BOB(), { client: cli, since: "2025-01-01T00:00:00Z", limit: 100 });
  const lateIds = rowsOf(onlyLate).map((r) => r.id);
  assert.ok(lateIds.includes(`agent_act:${late.id}`), "af.5 the late row is within since");
  assert.equal(lateIds.includes(`agent_act:${early.id}`), false, "af.5 the early row is excluded by since");
});

// ===========================================================================================
// 3 · Keyset pagination — stable across a page boundary with an EXACT timestamp tie, dedupe-free.
// ===========================================================================================

test("af.6 keyset pagination pages strictly older, ties break deterministically, no row is served twice or dropped", async (t) => {
  if (await gate(t)) return;
  const cli = await freshWorkClient(ALICE(), "af6");
  // THREE rows sharing the IDENTICAL occurred_at — a tie no product path can construct, forced
  // here because it is exactly the boundary the door's (occurred_at, id) tie-break exists for.
  const tie = "2027-06-15T10:00:00.123456Z";
  const rowsMade = [];
  for (let i = 0; i < 3; i += 1) {
    rowsMade.push(await mkAgentAct({ firm: FIRM_A(), client: cli, occurredAt: tie }));
  }

  const seen = [];
  let cursor = null;
  let guard = 0;
  for (;;) {
    guard += 1;
    assert.ok(guard <= 10, "af.6 pagination did not terminate — a cursor bug would loop forever");
    // kinds=['agent'] isolates the three fixture rows from freshWorkClient's OWN setup noise —
    // its client.created/account.upserted events land on the SAME client id (they are 'documents'
    // kind under this door's grouping) and would otherwise inflate this cell's expected count.
    const page = await listActivity(BOB(), { client: cli, kinds: ["agent"], limit: 1, cursor });
    const pageRows = rowsOf(page);
    if (pageRows.length === 0) break;
    for (const r of pageRows) seen.push(r.id);
    if (!page.truncated) break;
    assert.ok(page.next_cursor, "af.6 a truncated page always carries a next_cursor");
    cursor = page.next_cursor;
  }

  assert.equal(seen.length, 3, "af.6 exactly the three tied rows, no more, no fewer");
  assert.equal(new Set(seen).size, 3, "af.6 dedupe-free paging — no id repeats across pages");
  const expected = rowsMade.map((r) => `agent_act:${r.id}`).sort();
  assert.deepEqual([...seen].sort(), expected, "af.6 the exact same three ids, page-walked one at a time");
});

// ===========================================================================================
// 4 · A real #623 Work posting: the operation_receipt arm, its links, and the correction chain.
// ===========================================================================================

test("af.7 a committed #623 operation receipt appears as a work-kind row with links, and reverse_entry produces the correction chain", async (t) => {
  if (await gate(t)) return;
  const cli = await freshWorkClient(ALICE(), "af7");
  const posted = await postWorkEntry({ client: cli });
  assert.equal(posted.posted, true, "af.7 setup: the Work posted");

  const afterPost = await listActivity(BOB(), { client: cli, limit: 100 });
  const rows = rowsOf(afterPost);
  const workRow = rows.find((r) => r.source === "operation_receipt" && r.receipt_id === posted.receipt_id);
  assert.ok(workRow, "af.7 the committed operation receipt is a row in the feed");
  assert.equal(workRow.kind, "work", "af.7 an operation_receipt row is kind=work");
  assert.equal(workRow.work_id, posted.workId, "af.7 work_id names the Work that produced the entry");
  assert.equal(workRow.object_kind, "entry");
  assert.equal(workRow.object_id, posted.entry_id, "af.7 object_id is the posted entry");
  assert.equal(workRow.event_type, "journal_entry", "af.7 event_type carries the Work's own purpose");
  assert.equal(workRow.status, "approved", "af.7 a fresh, untouched posting is approved");
  assert.equal(workRow.original_entry_id, null);
  assert.equal(workRow.replacement_entry_id, null);

  const detail = await getActivityEvent(BOB(), "operation_receipt", posted.receipt_id);
  assert.equal(detail.work_id, posted.workId, "af.7 detail: same work_id");
  assert.equal(detail.purpose, "journal_entry", "af.7 detail: purpose is exposed (the spec's own whitelisted field)");
  // freshWorkClient names its client `w623_af7_<...>` — assert the JOIN worked rather than a
  // literal, since the exact suffix is timestamp/random.
  const clientRow = (await rootQuery("select name from clara.clients where id=$1", [cli])).rows[0];
  assert.equal(detail.client_name, clientRow.name, "af.7 detail: client_name is the real joined name");

  // THE CORRECTION CHAIN. A bookkeeper human reverses the Work-posted entry through the estate's
  // OWN reverse_entry — #632 does not add a new reversal path.
  const reversal = await humanQuery(BOB(),
    "select clara.reverse_entry($1,$2,$3) as r", [posted.entry_id, "af.7 correction", opk("w632-rev")]);
  const reversalId = reversal.rows[0].r.reversal_id;
  assert.equal(reversal.rows[0].r.status, "approved", "af.7 setup: auto-approved (well under high-stakes)");

  const afterReversal = await listActivity(BOB(), { client: cli, limit: 100 });
  const rows2 = rowsOf(afterReversal);

  const originalRow = rows2.find((r) => r.source === "event" && r.event_type === "entry.reversed" && r.object_id === posted.entry_id);
  assert.ok(originalRow, "af.7 an entry.reversed event names the ORIGINAL entry");
  assert.equal(originalRow.status, "reversed", "af.7 the original's derived status is reversed");
  assert.equal(originalRow.replacement_entry_id, reversalId, "af.7 the original links FORWARD to its replacement");
  assert.equal(originalRow.original_entry_id, null, "af.7 the original has no original of its own");

  const replacementRow = rows2.find((r) => r.source === "event" && r.event_type === "entry.approved" && r.object_id === reversalId);
  assert.ok(replacementRow, "af.7 an entry.approved event names the REPLACEMENT (reversal) entry");
  assert.equal(replacementRow.status, "approved", "af.7 the replacement itself stands approved, untouched");
  assert.equal(replacementRow.original_entry_id, posted.entry_id, "af.7 the replacement links BACK to the original");

  // get_activity_event on the reversed original names the same correction chain.
  const originalDetail = await getActivityEvent(BOB(), "event", originalRow.id);
  assert.equal(originalDetail.replacement_entry_id, reversalId, "af.7 detail: same forward link");
  assert.equal(originalDetail.status, "reversed");
});

// ===========================================================================================
// 5 · A document event.
// ===========================================================================================

test("af.8 a filed document produces a documents-kind event with a document_id", async (t) => {
  if (await gate(t)) return;
  const cli = await freshWorkClient(ALICE(), "af8");
  const seeded = await seedVerifiedDocument({ firm: FIRM_A(), client: cli });

  const page = await listActivity(BOB(), { client: cli, kinds: ["documents"], limit: 100 });
  const rows = rowsOf(page);
  const docRow = rows.find((r) => r.object_id === seeded.documentId);
  assert.ok(docRow, "af.8 the filed document produced a documents-kind row naming it");
  assert.equal(docRow.kind, "documents");
  assert.equal(docRow.object_kind, "document");
  assert.equal(docRow.document_id, seeded.documentId, "af.8 document_id mirrors object_id for a document event");
  assert.ok(docRow.description, "af.8 the row carries event_types' own description sentence");
});

// ===========================================================================================
// 6 · get_activity_event's no-oracle CLR11 denial.
// ===========================================================================================

test("af.9 get_activity_event refuses CLR11 (no oracle) for a genuinely absent id, an unknown source, and a cross-firm id", async (t) => {
  if (await gate(t)) return;
  const cli = await freshWorkClient(ALICE(), "af9");
  const posted = await postWorkEntry({ client: cli });

  await assertRaises(CLR11,
    () => getActivityEvent(BOB(), "operation_receipt", "00000000-0000-0000-0000-000000000000"),
    "af.9 a genuinely absent id");
  await assertRaises(CLR11,
    () => getActivityEvent(BOB(), "not_a_real_source", posted.receipt_id),
    "af.9 an unknown source");
  // The cross-firm case: firm B's owner asks for firm A's real, existing receipt id — the SAME
  // CLR11 as the absent-id case (no oracle: a denied id must not read differently from a
  // never-existed one).
  const crossFirm = await assertRaises(CLR11,
    () => getActivityEvent(DAVE(), "operation_receipt", posted.receipt_id),
    "af.9 a cross-firm id");
  const absent = await assertRaises(CLR11,
    () => getActivityEvent(BOB(), "operation_receipt", "00000000-0000-0000-0000-000000000000"),
    "af.9 absent, for the no-oracle comparison");
  assert.equal(crossFirm.message, absent.message, "af.9 no-oracle: identical refusal text either way");

  // And the malformed agent_receipt pair (no colon) is ALSO CLR11, never a raw parse error.
  await assertRaises(CLR11, () => getActivityEvent(BOB(), "agent_receipt", "not-a-pair"),
    "af.9 a malformed agent_receipt pair");
});

// ===========================================================================================
// 7 · No bare clock. A direct, catalog-level check rather than an unchecked header claim.
// ===========================================================================================

test("af.10 neither door reads a bare now()/clock_timestamp() — no x42 bare-clock roster entry is owed", async (t) => {
  if (await gate(t)) return;
  const bodies = await rootQuery(
    `select p.proname, pg_get_functiondef(p.oid) as def from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'clara' and p.proname in ('list_activity', 'get_activity_event')`);
  assert.equal(bodies.rowCount, 2, "af.10 both function bodies are readable");
  for (const row of bodies.rows) {
    assert.doesNotMatch(row.def, /\bnow\s*\(/i, `af.10 ${row.proname} must not call now()`);
    assert.doesNotMatch(row.def, /clock_timestamp\s*\(/i, `af.10 ${row.proname} must not call clock_timestamp()`);
  }
});

// ===========================================================================================
// 8 · Review findings #5/#15 — the until boundary is EXCLUSIVE, and p_limit clamps both ends.
// ===========================================================================================

test("af.11 the until boundary is EXCLUSIVE at the microsecond — a row AT p_until is excluded, one microsecond before is included", async (t) => {
  if (await gate(t)) return;
  const cli = await freshWorkClient(ALICE(), "af11");
  const boundary = "2028-03-01T00:00:00.000000Z";
  const justBefore = await mkAgentAct({ firm: FIRM_A(), client: cli, occurredAt: "2028-02-28T23:59:59.999999Z" });
  const atBoundary = await mkAgentAct({ firm: FIRM_A(), client: cli, occurredAt: boundary });

  const page = await listActivity(BOB(), { client: cli, kinds: ["agent"], until: boundary, limit: 100 });
  const ids = rowsOf(page).map((r) => r.id);
  assert.ok(ids.includes(`agent_act:${justBefore.id}`), "af.11 the row one microsecond before p_until is included");
  assert.equal(ids.includes(`agent_act:${atBoundary.id}`), false,
    "af.11 the row exactly AT p_until is excluded — the boundary is exclusive, not inclusive");
});

test("af.12 a malformed cursor refuses CLR10 invalid_cursor, never a raw decode exception", async (t) => {
  if (await gate(t)) return;
  await assertRaises(CLR10, () => listActivity(BOB(), { cursor: "not-valid-base64-at-all!!" }),
    "af.12 garbage that is not valid base64");
  await assertRaises(CLR10, () => listActivity(BOB(), { cursor: Buffer.from("no-pipe-in-here", "utf8").toString("base64") }),
    "af.12 valid base64 whose decoded text has no pipe separator");
  await assertRaises(CLR10,
    () => listActivity(BOB(), { cursor: Buffer.from("not-a-timestamp|some-id", "utf8").toString("base64") }),
    "af.12 a pipe-separated pair whose first half does not parse as a timestamptz");
});

test("af.13 p_limit clamps to the door's own [1,100] window on both ends", async (t) => {
  if (await gate(t)) return;
  const cli = await freshWorkClient(ALICE(), "af13");
  // 105 real rows — enough to prove the UPPER clamp (100), not merely that a huge limit does not
  // error. `kinds:['agent']` isolates these from freshWorkClient's own client.created noise.
  for (let i = 0; i < 105; i += 1) {
    await mkAgentAct({ firm: FIRM_A(), client: cli });
  }

  const capped = await listActivity(BOB(), { client: cli, kinds: ["agent"], limit: 100000 });
  assert.equal(rowsOf(capped).length, 100, "af.13 a limit far above the ceiling is clamped DOWN to 100, not honoured literally");
  assert.equal(capped.truncated, true, "af.13 105 real rows behind a 100 cap is a truncated page");

  const floored = await listActivity(BOB(), { client: cli, kinds: ["agent"], limit: 0 });
  assert.equal(rowsOf(floored).length, 1, "af.13 a limit of 0 is clamped UP to 1, not treated as 'no rows'");
  assert.equal(floored.truncated, true, "af.13 one row out of 105 is certainly a truncated page");

  const negative = await listActivity(BOB(), { client: cli, kinds: ["agent"], limit: -5 });
  assert.equal(rowsOf(negative).length, 1, "af.13 a negative limit is also clamped up to the floor of 1");
});

// ===========================================================================================
// 9 · #728 — the sweep heartbeat stops flooding the feed without an actor (C77.3). Migration
// 0183, gated on its OWN stem (SWEEP_STEM) rather than 0181's — see gateSweep's own comment.
// ===========================================================================================

test("af.14 a finalized sweep with drafted_count=0 is ABSENT from the feed, and its deep link answers the same CLR11 no-oracle refusal as a genuinely absent id", async (t) => {
  if (await gateSweep(t)) return;
  const cli = await freshWorkClient(ALICE(), "af14");
  const noop = await mkSweepEvent({ firm: FIRM_A(), draftedCount: 0, expectedCount: 3 });
  // THREE POSITIVE CONTROLS in the SAME window, so the absence below is a measured exclusion
  // rather than a read that happened to return nothing (native review N14). The first two are in
  // the arm the exclusion actually edits — `ev_base`, the clara.firm_timeline_visible arm (delta
  // review [7]: the round's first control rode `agent_act_receipts`, a DIFFERENT union arm, so a
  // regression that emptied ev_base entirely would have passed).
  const kept = await mkSweepEvent({ firm: FIRM_A(), draftedCount: 1, expectedCount: 3 });
  const plain = await mkRawEvent({ firm: FIRM_A(), type: "kb_rule.proposed", client: cli, payload: {} });
  const control = await mkAgentAct({ firm: FIRM_A(), client: cli });

  const page = await listActivity(BOB(), { kinds: ["agent"], since: noop.occurredAt, limit: 100 });
  assert.ok(rowsOf(page).some((r) => r.id === kept.eventId),
    "af.14 POSITIVE CONTROL, SAME ARM AND SAME PREDICATE: a sweep receipt that DID draft is returned by this very read");
  assert.ok(rowsOf(page).some((r) => r.id === `agent_act:${control.id}`),
    "af.14 POSITIVE CONTROL: a real agent-receipt row in the same window and kind IS returned too");
  assert.equal(rowsOf(page).some((r) => r.id === noop.eventId), false,
    "af.14 a zero-effect sweep heartbeat never appears in the feed, even asking for exactly its own kind and instant");
  // And asking under NO kind filter at all (the shape that buried real postings on the live firm)
  // still never surfaces it — with its own ev_base control, since this read carries no kind filter
  // to keep the arm honest.
  const unfiltered = await listActivity(BOB(), { since: noop.occurredAt, limit: 100 });
  assert.ok(rowsOf(unfiltered).some((r) => r.id === plain.eventId),
    "af.14 POSITIVE CONTROL for the unfiltered read: an ordinary timeline event of the same window IS returned");
  assert.ok(rowsOf(unfiltered).some((r) => r.id === kept.eventId),
    "af.14 …and so is the kept sweep receipt, which is the exclusion's own YES");
  assert.equal(rowsOf(unfiltered).some((r) => r.id === noop.eventId), false,
    "af.14 the exclusion holds with no kind filter too, not only under kinds=['agent']");

  const absent = await assertRaises(CLR11, () => getActivityEvent(BOB(), "event", "00000000-0000-0000-0000-000000000000"),
    "af.14 baseline: a genuinely absent id");
  const excluded = await assertRaises(CLR11, () => getActivityEvent(BOB(), "event", noop.eventId),
    "af.14 a deep link to the excluded heartbeat");
  assert.equal(excluded.message, absent.message,
    "af.14 no-oracle: an excluded zero-effect heartbeat must read IDENTICALLY to an id that never existed");
});

test("af.15 a finalized sweep with drafted_count>0 is PRESENT under kind=agent, actor stays null, and the kind filter sorts it correctly", async (t) => {
  if (await gateSweep(t)) return;
  const drafted = await mkSweepEvent({ firm: FIRM_A(), draftedCount: 2, expectedCount: 5 });

  const agentPage = await listActivity(BOB(), { kinds: ["agent"], since: drafted.occurredAt, limit: 100 });
  const row = rowsOf(agentPage).find((r) => r.id === drafted.eventId);
  assert.ok(row, "af.15 a sweep that drafted something IS in the feed under kinds=['agent']");
  assert.equal(row.kind, "agent", "af.15 kind is 'agent', never 'documents' — 0181's fall-through is retired for this event_type");
  assert.equal(row.source, "event");
  assert.equal(row.event_type, "sweep.run_completed");
  // ACTOR STAYS NULL — the truth (WO's own "least-surprising marker"): the web lane recognises
  // kind='agent' + event_type='sweep.run_completed' off columns this door ALREADY outputs and
  // labels a system marker there; no new column is added or claimed here.
  assert.equal(row.actor, null, "af.15 actor is null — a kept sweep row is not attributed to a fabricated actor");
  assert.equal(row.client_id, null, "af.15 the sweep is firm-level — no client to attribute it to either");
  assert.ok(row.description, "af.15 the row still carries event_types' own sentence (\"An autodraft sweep run completed\")");

  // THE OTHER HALF OF THE SORT: a 'documents' filter must NOT pick it up — the fall-through this
  // migration retires for exactly this event_type.
  const documentsPage = await listActivity(BOB(), { kinds: ["documents"], since: drafted.occurredAt, limit: 100 });
  assert.equal(rowsOf(documentsPage).some((r) => r.id === drafted.eventId), false,
    "af.15 kinds=['documents'] no longer catches a sweep heartbeat — the 0181 fall-through moved");

  const detail = await getActivityEvent(BOB(), "event", drafted.eventId);
  assert.equal(detail.kind, "agent", "af.15 get_activity_event agrees with list_activity's own kind");
  assert.equal(detail.actor, null);
  assert.equal(detail.event_type, "sweep.run_completed");
});

// ===========================================================================================
// 9b · #728 REVIEW ROUND — the sweep helper is a DOOR, not a side channel. Cross-model review
// (Codex, 2026-09-11) read 0183 and found two holes in the arm above: the helper was
// clara_authenticated-granted with NO floor of its own, and its clara.sweep_runs lookup was not
// bound to the event's own firm. Both are pinned here.
// ===========================================================================================

/** An event appended to `firm` by root (the only writer that may), returning its own id and
 *  instant read back from clara.domain_events by the seq `_append_event` hands out. Generalises
 *  `mkSweepEvent` above for the cells that need a DIFFERENT event_type or a payload no lawful
 *  sweep would ever write. */
async function mkRawEvent({ firm, type = "sweep.run_completed", client = null, payload }) {
  const seq = (await rootQuery(
    `select clara._append_event($1, $2, $3, null, null, null, null, null, null, $4::jsonb) as seq`,
    [firm, type, client, JSON.stringify(payload)])).rows[0].seq;
  const ev = (await rootQuery(
    `select id::text as id, created_at from clara.domain_events where firm_id = $1 and seq = $2`,
    [firm, seq])).rows[0];
  return { eventId: ev.id, occurredAt: ev.created_at.toISOString() };
}

/** A finalized clara.sweep_runs row in `firm`, with no event pointing at it. */
async function mkSweepRun({ firm, draftedCount }) {
  return (await rootQuery(
    `insert into clara.sweep_runs(firm_id, state, window_started_at, window_ended_at,
        expected_count, drafted_count, finalized_at)
     values ($1, 'finalized', now(), now(), $2, $2, now()) returning id`,
    [firm, draftedCount])).rows[0].id;
}

/** The KEPT sweep receipts this caller's firm has, read through the feed's own definer helper --
 *  the shape PostgREST exposes it as. Takes NO argument: 0183 splits the set read from the point
 *  lookup so the two callers never share one cached plan (delta review, BLOCKER [0]). */
async function keptSweepEvents(sub) {
  const r = await humanQuery(sub,
    "select event_id::text as event_id from clara._sweep_events_with_effect()");
  return r.rows.map((row) => row.event_id);
}

/** The DETAIL door's half of the same fact: does THIS receipt name a run that did something? */
async function sweepEventHasEffect(sub, eventId) {
  const r = await humanQuery(sub,
    "select clara._sweep_event_has_effect($1::uuid) as has", [eventId]);
  return r.rows[0].has;
}

test("af.16 the sweep helper carries the feed's OWN bookkeeper floor — a viewer refused by list_activity cannot read a sweep's drafted_count through the helper either", async (t) => {
  if (await gateSweep(t)) return;
  const drafted = await mkSweepEvent({ firm: FIRM_A(), draftedCount: 3, expectedCount: 9 });

  // THE BASELINE THAT GIVES THE REFUSAL ITS MEANING: the feed itself refuses this viewer.
  await assertRaises(CLR04, () => listActivity(CAROL()), "af.16 baseline: list_activity refuses a viewer");
  // …and so must the helper. Same-firm event ids are readable by ANY member under the firm-only
  // clara.domain_events read policy (0005), so a floorless clara_authenticated-granted helper
  // would hand a VIEWER every sweep's drafted_count one id at a time — a side channel round the
  // floor the door in front of it spends three checks establishing.
  await assertRaises(CLR04, () => keptSweepEvents(CAROL()),
    "af.16 the set helper refuses the SAME viewer, with the SAME code the door uses");
  // BOTH halves carry it: 0183 splits the fact into a set read and a point lookup, and a floor on
  // only one of them is no floor at all.
  await assertRaises(CLR04, () => sweepEventHasEffect(CAROL(), drafted.eventId),
    "af.16 the point-lookup helper refuses that viewer too");

  // AND THE DOOR IT EXISTS FOR IS UNHARMED — the floor is a floor, not a wall.
  assert.ok((await keptSweepEvents(BOB())).includes(drafted.eventId),
    "af.16 a bookkeeper still reads the one fact the feed borrows");
  assert.equal(await sweepEventHasEffect(BOB(), drafted.eventId), true,
    "af.16 …through either half");
  const page = await listActivity(BOB(), { kinds: ["agent"], since: drafted.occurredAt, limit: 100 });
  assert.ok(rowsOf(page).some((r) => r.id === drafted.eventId),
    "af.16 and the kept sweep row still reaches a bookkeeper's feed");
});

test("af.17 a sweep event of THIS firm whose payload names ANOTHER firm's run contributes nothing — the run lookup is bound to the event's own firm", async (t) => {
  if (await gateSweep(t)) return;
  // A run that DID draft, in firm B, and a firm-A event pointing at it. The payload is a plain
  // jsonb field no constraint validates, so this shape is reachable by a bug, a replayed payload
  // or a restore — and a lookup keyed on `run_id` ALONE would answer firm A's feed with firm B's
  // count. Constructed as root because only a definer writer may append an event at all.
  const foreignRun = await mkSweepRun({ firm: FIRM_B(), draftedCount: 4 });
  const ev = await mkRawEvent({ firm: FIRM_A(), payload: { run_id: foreignRun, expected_count: 4 } });

  assert.equal(await sweepEventHasEffect(BOB(), ev.eventId), false,
    "af.17 the helper resolves NOTHING across the firm boundary — another firm's effect is not this firm's fact to report");
  assert.equal((await keptSweepEvents(BOB())).includes(ev.eventId), false,
    "af.17 …and the set form leaves it out for the same reason");
  const page = await listActivity(BOB(), { since: ev.occurredAt, limit: 100 });
  assert.equal(rowsOf(page).some((r) => r.id === ev.eventId), false,
    "af.17 …so the row is treated as the zero-effect heartbeat it is, never kept on a foreign count");
  await assertRaises(CLR11, () => getActivityEvent(BOB(), "event", ev.eventId),
    "af.17 and its deep link answers the same no-oracle refusal every excluded heartbeat gets");
});

test("af.18 the helper answers ONLY for a sweep receipt, and an unresolvable run_id is 'no measured effect' rather than an error that takes the whole feed down", async (t) => {
  if (await gateSweep(t)) return;
  const cli = await freshWorkClient(ALICE(), "af18");
  const run = await mkSweepRun({ firm: FIRM_A(), draftedCount: 5 });

  // (a) A NON-SWEEP event of this firm carrying a `run_id` in its payload. Nothing stops an
  // unrelated event type from using that key, and this helper must never answer for one: its
  // whole contract is "the drafted_count of the run THIS SWEEP RECEIPT reports on".
  const other = await mkRawEvent({
    firm: FIRM_A(), type: "kb_rule.proposed", client: cli, payload: { run_id: run },
  });
  assert.equal(await sweepEventHasEffect(BOB(), other.eventId), false,
    "af.18 a non-sweep event of this firm resolves no run, whatever its payload says");

  // (b) A SWEEP receipt whose `run_id` is not a uuid at all. The cast alone would raise 22P02 —
  // an untyped error, inside a per-row predicate, which would take the ENTIRE feed down for the
  // firm rather than hiding one unverifiable heartbeat.
  const junk = await mkRawEvent({ firm: FIRM_A(), payload: { run_id: "not-a-uuid", expected_count: 1 } });
  assert.equal(await sweepEventHasEffect(BOB(), junk.eventId), false,
    "af.18 a malformed run_id is an unresolvable run, not an error");
  assert.equal((await keptSweepEvents(BOB())).includes(junk.eventId), false,
    "af.18 …and the firm's kept set never names it either");
  const page = await listActivity(BOB(), { since: junk.occurredAt, limit: 100 });
  assert.equal(rowsOf(page).some((r) => r.id === junk.eventId), false,
    "af.18 the feed still answers, with the unverifiable heartbeat excluded — never shown by default");
});

test("af.19 EFFECT IS drafted + posted: a sweep that POSTED entries and drafted none is KEPT, and one that only refused is not", async (t) => {
  if (await gateSweep(t)) return;
  // 0108 split the sweep's bookkeeping into four counters, and its own header says why in so many
  // words: "a post is not a draft". A run that posted entries changed the books MORE than one that
  // merely drafted, so reading drafted_count alone (the first cut of 0183 did) would have hidden
  // exactly the sweep a bookkeeper most needs to see. Native seven-lens review, 2026-09-11.
  const posted = await mkSweepEvent({ firm: FIRM_A(), draftedCount: 0, postedCount: 2, expectedCount: 4 });
  const page = await listActivity(BOB(), { kinds: ["agent"], since: posted.occurredAt, limit: 100 });
  const row = rowsOf(page).find((r) => r.id === posted.eventId);
  assert.ok(row, "af.19 a sweep that posted entries and drafted none IS in the feed");
  assert.equal(row.kind, "agent");
  assert.ok((await keptSweepEvents(BOB())).includes(posted.eventId),
    "af.19 …and the helper itself names it, which is where the drafted+posted sum lives");

  // REFUSALS AND SKIPS ARE DELIBERATELY OUT of the sum: neither moved a cent, a refusal already
  // has its own attributable surface in the agent-receipt lane, and folding them in would re-open
  // the flood this ticket closes (a firm whose sweeps refuse every window would be back to 288
  // unattributed rows a day). Pinned so the decision is a measured contract, not an oversight.
  const refusedOnly = await mkSweepEvent({ firm: FIRM_A(), draftedCount: 0, refusedCount: 3, expectedCount: 3 });
  const after = await listActivity(BOB(), { since: refusedOnly.occurredAt, limit: 100 });
  assert.equal(rowsOf(after).some((r) => r.id === refusedOnly.eventId), false,
    "af.19 a run that only REFUSED is not an effect on the books — excluded, by decision (see 0183 section 1)");
  await assertRaises(CLR11, () => getActivityEvent(BOB(), "event", refusedOnly.eventId),
    "af.19 …and its deep link is the same no-oracle refusal");

  // SKIPS TOO, and pinned for the same reason (delta review [8]: 0183's header and function
  // comment both name skipped_count as excluded, and no cell could express it — mkSweepEvent did
  // not even accept one, so "widen the sum to + skipped_count" was a green change).
  const skippedOnly = await mkSweepEvent({ firm: FIRM_A(), draftedCount: 0, skippedCount: 4, expectedCount: 4 });
  const afterSkip = await listActivity(BOB(), { since: skippedOnly.occurredAt, limit: 100 });
  assert.equal(rowsOf(afterSkip).some((r) => r.id === skippedOnly.eventId), false,
    "af.19 a run that only SKIPPED is not an effect on the books either — a firm whose windows all skip must not be back to 288 rows a day");
  assert.equal(await sweepEventHasEffect(BOB(), skippedOnly.eventId), false,
    "af.19 …and the helper agrees, which is where the sum actually lives");
  await assertRaises(CLR11, () => getActivityEvent(BOB(), "event", skippedOnly.eventId),
    "af.19 …with the same no-oracle deep-link refusal");
});

// ===========================================================================================
// 9c · #728 DELTA REVIEW OF THE FIX ROUND (2026-09-11, BLOCKER [0] + [1]/[2]/[9]). The round's
// only pin for the exclusion's COST was textual, and it was green while the shipped door answered
// its sixth read in 32-48 s: `clara._sweep_events_with_effect(p_event uuid default null)` carried
// an optional-parameter predicate, plpgsql cached that ONE statement for BOTH callers, and after
// five custom-plan executions it switched to the generic plan — a Nested Loop that estimates
// `clara.domain_events` at ONE row (default eq-selectivity for `$2 IS NULL OR id = $2`) and
// rescans `clara.sweep_runs` once per sweep receipt of the firm. The cells below are the two
// halves a textual pin cannot have: a WALL-CLOCK series across the plan-cache boundary, and the
// SHAPE of the generic plan itself.
// ===========================================================================================

/** A dedicated pooled connection held open across many statements inside ONE transaction that is
 *  ALWAYS rolled back — the pooled-connection shape PostgREST holds, and the only way to put a
 *  synthetic sweep history on an append-only table without leaving it there (clara.domain_events
 *  refuses DELETE, so an inserted event is permanent unless the transaction is thrown away). */
async function withRolledBackSession(fn) {
  const { getPool } = await import("./rig-helpers.mjs");
  const c = await getPool().connect();
  try {
    await c.query("begin");
    return await fn(c);
  } finally {
    await c.query("rollback").catch(() => {});
    await c.query("reset role").catch(() => {});
    await c.query("reset all").catch(() => {});
    c.release();
  }
}

/** Wall-clock milliseconds for one statement on an already-open client. */
async function timed(c, sql, params = []) {
  const t0 = process.hrtime.bigint();
  const r = await c.query(sql, params);
  return { ms: Number(process.hrtime.bigint() - t0) / 1e6, rows: r.rows };
}

/** Walk an EXPLAIN (FORMAT JSON) plan tree, yielding every node. */
function planNodes(node) {
  const out = [node];
  for (const child of node.Plans ?? []) out.push(...planNodes(child));
  return out;
}

/** The median of a series, and its minimum — the two statistics a plan flip cannot hide behind.
 *  A busy host raises the MAXIMUM of a series (one GC pause, one checkpoint); a generic plan
 *  raises EVERY call from the sixth on, so the MINIMUM of the tail is the honest detector. */
function median(xs) {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

// THE LOAD, AND WHY IT IS SHAPED LIKE THIS (delta review round 3, finding [0]/[1]). A generic plan
// is only CHEAP-LOOKING when `sr.firm_id = $1` selects a small fraction of a MULTI-TENANT table:
// the estimate is total rows / n_distinct(firm_id), so the flip appears exactly for a firm whose
// sweep history is above the per-firm average — which is every firm this ticket is about. The
// first cut of this cell planted 60 sibling firms and reproduced the flip only on a database the
// rest of the suite had already populated with ~1,650 firms (it was GREEN on a pristine one, which
// is how a 1.9 s regression shipped past it). So the cell now plants the skew ITSELF, and ANALYZEs
// both relations inside its own transaction, so the estimates are the same on a pristine database
// and on a used one.
const SIBLINGS = 1500;      // sibling firms also running the five-minute sweep
const PER_SIBLING = 4;      // …each with a handful of receipts, so the per-firm average is small
const RECEIPTS = 4000;      // …and 14 days of sweeping for the firm under test
const KEPT = RECEIPTS / 20; // …200 of which actually drafted something

// A GENEROUS ABSOLUTE bound: the measured flips were 13.8-16.4 SECONDS a call (the shared-plan
// form) and 0.16-2.0 s (the split form), against a 4-50 ms baseline on this rig. Anything within
// two orders of magnitude of the baseline passes, so this reds on a plan regression, not on a
// busy host.
const CALL_BUDGET_MS = 1500;
const CALLS = 10;
// plpgsql plans a statement CUSTOM for its first five executions in a session and considers the
// GENERIC plan from the sixth: the boundary this cell exists to walk across.
const HEAD = 5;
// The step a flip makes, with a floor so a 0.5 ms baseline cannot make noise look like one.
const FLIP_FACTOR = 4;
const FLIP_FLOOR_MS = 40;

/** THE STATEMENT THE INSTALLED SET HELPER ACTUALLY RUNS, made runnable for an EXPLAIN.
 *
 *  Read from `pg_proc.prosrc` — the same raw column 0183's own prestate sha-pins and af.21 read —
 *  then: `--` comment tails stripped, the `return query` prefix and the trailing `;` removed, and
 *  the one plpgsql variable the statement carries (`c.firm`, the session firm the body took from
 *  clara._human_ctx) rewritten to `$1` so a cell can explain it for a literal firm id.
 *
 *  WHY EXTRACTION AND NOT A COPY (delta review round 4, NIT [3]). af.20 explained a HELPER_SQL
 *  literal that sat beside the body and was kept in step by hand. Nothing tied the two: a recut
 *  that changed the driving side, added a predicate or introduced a second lateral would keep
 *  af.21's `cross join lateral` / `offset 0` substrings green AND leave af.20 measuring the old
 *  text — a cost cell certifying a plan nobody runs. Extracted, the failure is loud: either the
 *  shape assertions below fire, or af.20's own row bound reds on the plan the new body picks. */
/** THE PURE SLICE, split out of `installedSetHelperStatement` (final review, SHOULD-FIX [3]) so
 *  af.20a below can feed it a SYNTHETIC body and prove the slice point without needing a live
 *  database whose installed function happens to end the one way that hid the original defect. */
function extractReturnQueryStatement(rawSrc) {
  const src = rawSrc.replace(/--[^\n]*/g, "");
  const marker = "return query";
  const start = src.indexOf(marker);
  assert.ok(start >= 0,
    "af.20 the installed clara._sweep_events_with_effect() body has no `return query` — this cell "
    + "can no longer derive the statement it measures, which is exactly when it must fail loudly");
  const rest = src.slice(start + marker.length);
  // THE STATEMENT'S OWN TERMINATOR, not the body's last `;` (final review, SHOULD-FIX [3]).
  // `return query <stmt>;` is ONE plpgsql statement, so its FIRST `;` is where it ends — the
  // body's LAST `;` is only the same character today because 0183 happens to close with a bare
  // `end` (no semicolon) right before the dollar-quote (measured on 127.0.0.1:5698's installed
  // prosrc: it ends `...> 0;\nend `, no trailing `;`). A recut written the other, equally valid
  // way — `... > 0;\nend;\n$$` — would shift `lastIndexOf`'s match PAST the statement onto the
  // block's own `end;`, and every vacuity guard below still passes on the resulting
  // `select ... > 0;\nend`: it starts with `select`, still names both relations, still carries
  // exactly one `$1`. The failure would surface later as a raw PostgreSQL syntax error from the
  // EXPLAIN this statement feeds, not as one of this function's own named assertions.
  const end = rest.indexOf(";");
  assert.notEqual(end, -1,
    "af.20 the installed body's `return query` statement has no `;` terminator of its own — "
    + "this cell cannot derive the statement it measures, which is exactly when it must fail "
    + "loudly rather than hand af.20 an unbounded or truncated string");
  // A function replacement, never the string "$1": in String.replace a "$1" is a capture group.
  const stmt = rest.slice(0, end).trim().replace(/\bc\.firm\b/g, () => "$1");
  // VACUITY CONTROLS on the extraction itself, so a botched slice explains something meaningless
  // rather than quietly passing.
  assert.match(stmt, /^select\b/i, `af.20 the extracted statement does not start with select: ${stmt}`);
  assert.match(stmt, /clara\.sweep_runs/, "af.20 …and it must still read clara.sweep_runs");
  assert.match(stmt, /clara\.domain_events/, "af.20 …and clara.domain_events");
  assert.equal(stmt.split("$1").length - 1, 1,
    `af.20 the extracted statement must carry EXACTLY ONE firm placeholder: ${stmt}`);
  assert.equal(stmt.includes("c.firm"), false,
    "af.20 …and no un-rewritten plpgsql variable, which an EXPLAIN could not bind");
  return stmt;
}

async function installedSetHelperStatement() {
  const src = (await rootQuery(
    "select p.prosrc from pg_proc p where p.oid = 'clara._sweep_events_with_effect()'::regprocedure",
  )).rows[0].prosrc;
  return extractReturnQueryStatement(src);
}

test("af.20a the extractor slices at the STATEMENT'S OWN terminator, not the body's last `;` — a synthetic `end;` body proves the fix rather than assuming 0183's own `end` (no semicolon) exercises it", () => {
  // The regression af.20's own comment above names: 0183 today closes `... > 0;\nend` (NO
  // trailing `;`, confirmed against 127.0.0.1:5698's installed prosrc), which happens to make
  // `lastIndexOf(";")` and `indexOf(";")` agree — so a live-database cell alone could pass before
  // AND after this fix, proving nothing about the regression it claims to close. This cell feeds
  // BOTH shapes directly and asserts the extractor lands on the statement's own `;` either way.
  const bareEnd =
    "declare c record;\nbegin\n  c := clara._human_ctx(clara.role_rank('bookkeeper'));\n"
    + "  return query\n  select e.id\n    from clara.sweep_runs sr\n"
    + "    cross join clara.domain_events de\n"
    + "   where sr.firm_id = c.firm\n     and sr.drafted_count + sr.posted_count > 0;\nend ";
  const semicolonEnd =
    "declare c record;\nbegin\n  c := clara._human_ctx(clara.role_rank('bookkeeper'));\n"
    + "  return query\n  select e.id\n    from clara.sweep_runs sr\n"
    + "    cross join clara.domain_events de\n"
    + "   where sr.firm_id = c.firm\n     and sr.drafted_count + sr.posted_count > 0;\nend;\n";
  const fromBareEnd = extractReturnQueryStatement(bareEnd);
  const fromSemicolonEnd = extractReturnQueryStatement(semicolonEnd);
  assert.equal(fromSemicolonEnd, fromBareEnd,
    "af.20a the SAME return-query statement must come out of both a bare `end` body (0183 today) "
    + `and an \`end;\` body (an equally valid recut) — got bare=${JSON.stringify(fromBareEnd)} `
    + `semicolon=${JSON.stringify(fromSemicolonEnd)}`);
  assert.doesNotMatch(fromSemicolonEnd, /\bend\b/,
    `af.20a the \`end;\` body's block terminator must not leak into the extracted statement — got ${fromSemicolonEnd}`);
});

test("af.20 BOUNDED COST: ten consecutive calls of each caller on ONE connection stay flat across the plpgsql plan-cache boundary, and the plan they run reads the KEPT set rather than the firm's history", async (t) => {
  if (await gateSweep(t)) return;
  const pWork = await pWorkReady();
  const firm = FIRM_A();
  const claims = JSON.stringify({ sub: BOB(), role: "authenticated" });

  // The statement `clara._sweep_events_with_effect` runs — EXTRACTED FROM THE INSTALLED BODY,
  // not hand-copied beside it (delta review round 4, NIT [3]). A copy is a copy: a later recut
  // that changed the driving side or added a predicate would leave af.20 explaining the OLD text
  // and certifying a plan nobody runs, while af.21's two substring pins stayed green. Read from
  // the catalog, the plan measured below is the plan the door runs, by construction.
  const HELPER_SQL = await installedSetHelperStatement();

  const report = await withRolledBackSession(async (c) => {
    await c.query(
      `insert into clara.firms(id, name)
       select ('afc00000-0000-4000-8000-' || lpad(g::text, 12, '0'))::uuid, 'af20_sibling_' || g
         from generate_series(1, $1) g`, [SIBLINGS]);
    await c.query(
      `with r as (
         insert into clara.sweep_runs(firm_id, state, window_started_at, window_ended_at,
             expected_count, drafted_count, posted_count, finalized_at)
         select ('afc00000-0000-4000-8000-' || lpad(f::text, 12, '0'))::uuid, 'finalized',
                now() - (g || ' minutes')::interval, now() - (g || ' minutes')::interval, 0,
                0, 0, now() - (g || ' minutes')::interval
           from generate_series(1, $1) f, generate_series(1, $2) g
         returning id, firm_id
       )
       insert into clara.domain_events(firm_id, seq, event_type, payload, created_at)
       select r.firm_id, row_number() over (partition by r.firm_id), 'sweep.run_completed',
              jsonb_build_object('run_id', r.id, 'expected_count', 0),
              now() - (row_number() over () || ' minutes')::interval
         from r`, [SIBLINGS, PER_SIBLING]);
    // …and the firm under test's own history, one twentieth of which is KEPT. The exclusion must
    // cost the kept set, not the history.
    await c.query(
      `with r as (
         insert into clara.sweep_runs(firm_id, state, window_started_at, window_ended_at,
             expected_count, drafted_count, posted_count, finalized_at)
         select $1::uuid, 'finalized',
                now() - (g || ' minutes')::interval, now() - (g || ' minutes')::interval, 0,
                case when g % 20 = 0 then 2 else 0 end, 0, now() - (g || ' minutes')::interval
           from generate_series(1, $2) g
         returning id
       )
       insert into clara.domain_events(firm_id, seq, event_type, payload, created_at)
       select $1::uuid,
              (select coalesce(max(seq), 0) from clara.domain_events where firm_id = $1::uuid)
                + row_number() over (),
              'sweep.run_completed', jsonb_build_object('run_id', r.id, 'expected_count', 0),
              now() - (row_number() over () || ' minutes')::interval
         from r`, [firm, RECEIPTS]);
    await c.query("analyze clara.domain_events");
    await c.query("analyze clara.sweep_runs");

    const kept = (await c.query(
      `select de.id::text as id
         from clara.domain_events de
         join clara.sweep_runs sr on sr.id::text = de.payload ->> 'run_id'
        where de.firm_id = $1::uuid and de.event_type = 'sweep.run_completed'
          and sr.drafted_count + sr.posted_count > 0
        limit 1`, [firm])).rows[0].id;

    // THE PLAN THE HELPER ACTUALLY RUNS, captured while the session is still root. NOT
    // `explain (generic_plan)`: the helpers pin `plan_cache_mode = force_custom_plan`, so the
    // generic rendering of this text is a plan PostgreSQL will never execute for them, and
    // asserting on it would pin a plan nobody runs. What is asserted instead is (a) the catalog
    // clause that makes that true and (b) the plan the planner picks for the real firm id.
    const feedPlan = (await c.query(
      `explain (analyze, format json) ${HELPER_SQL}`, [firm])).rows[0]["QUERY PLAN"][0].Plan;
    const helperConfig = (await c.query(
      `select p.proname, coalesce(p.proconfig, '{}'::text[]) as cfg
         from pg_proc p
        where p.pronamespace = 'clara'::regnamespace
          and p.proname in ('_sweep_events_with_effect', '_sweep_event_has_effect')
        order by 1`)).rows;

    // …then the wall-clock series, as the bookkeeper, on this SAME connection.
    await c.query("set local role clara_authenticated");
    await c.query("select set_config('request.jwt.claims', $1, true)", [claims]);
    const helper = [];
    for (let i = 0; i < CALLS; i += 1) {
      helper.push((await timed(c, "select count(*) from clara._sweep_events_with_effect()")).ms);
    }
    const feed = [];
    for (let i = 0; i < CALLS; i += 1) {
      feed.push((await timed(c,
        "select jsonb_array_length(clara.list_activity(null,25,null,null,null,null)->'rows') as n")).ms);
    }
    const detail = [];
    for (let i = 0; i < CALLS; i += 1) {
      detail.push((await timed(c,
        "select clara.get_activity_event('event', $1) is not null as got", [kept])).ms);
    }
    // #770 — THE SAME SERIES WITH p_work BOUND. The `ev` arm's work_id is a coalesce of an
    // operation-receipt left join and a correlated domain_events payload lookup, so the p_work
    // predicate there is NOT index-backed and the door's measured cost bound is the only guard on
    // it. This firm's history is `RECEIPTS` sweep events, none of which belongs to any Work, so
    // the page is empty and every millisecond measured is the predicate's own.
    const feedWork = [];
    if (pWork) {
      for (let i = 0; i < CALLS; i += 1) {
        feedWork.push((await timed(c,
          "select jsonb_array_length(clara.list_activity(null,25,null,null,null,null,"
          + "'afaa0000-0000-4000-8000-000000000001'::uuid)->'rows') as n")).ms);
      }
    }
    return { helper, feed, detail, feedPlan, helperConfig, feedWork };
  });

  const fmt = (a) => a.map((n) => n.toFixed(1)).join(" / ");
  // (1) THE STEP, on the set helper called DIRECTLY — the narrowest place the flip shows, with
  // none of the feed's other work averaging it away. Compared MINIMUM-of-tail against
  // MEDIAN-of-head: a busy host raises a maximum, a generic plan raises every call from the sixth.
  const head = median(report.helper.slice(0, HEAD));
  const tail = Math.min(...report.helper.slice(HEAD));
  assert.ok(tail <= Math.max(FLIP_FACTOR * head, FLIP_FLOOR_MS),
    `af.20 clara._sweep_events_with_effect() STEPPED UP at the plan-cache boundary: calls 1-${HEAD} median ${head.toFixed(1)} ms, `
    + `cheapest of calls ${HEAD + 1}-${CALLS} ${tail.toFixed(1)} ms — series ${fmt(report.helper)}`);

  // (2) THE ABSOLUTE BUDGET on both doors, which is what a person actually waits for.
  // #770 joins `list_activity (p_work)` to the pair, under the SAME budget and the SAME flatness
  // rule: an un-indexed predicate that reintroduced the cost the plan-cache pin was added to
  // remove would show here first.
  const series20 = [["list_activity", report.feed], ["get_activity_event", report.detail]];
  if (pWork) series20.push(["list_activity (p_work)", report.feedWork]);
  for (const [label, series] of series20) {
    for (const [i, ms] of series.entries()) {
      assert.ok(ms < CALL_BUDGET_MS,
        `af.20 ${label} call ${i + 1} took ${ms.toFixed(1)} ms (budget ${CALL_BUDGET_MS} ms) — series ${fmt(series)}`);
    }
    const feedHead = median(series.slice(0, HEAD));
    const feedTail = Math.min(...series.slice(HEAD));
    assert.ok(feedTail <= Math.max(FLIP_FACTOR * feedHead, FLIP_FLOOR_MS),
      `af.20 ${label} STEPPED UP at the plan-cache boundary: calls 1-${HEAD} median ${feedHead.toFixed(1)} ms, `
      + `cheapest of calls ${HEAD + 1}-${CALLS} ${feedTail.toFixed(1)} ms — series ${fmt(series)}`);
  }

  // (3) THE PLAN, by the rows it READ rather than by the name of its top node. The pathology is
  // "one side is rescanned per row of the other", and it wears a different node type each time it
  // appears (Nested Loop with sweep_runs inner, Nested Loop with sweep_runs outer and a
  // Materialize of the receipts inner, Merge Join over a Seq Scan of the whole history) — so what
  // this asserts is the thing all three have in common and the good plan does not: how many rows
  // of `clara.domain_events` the plan touches. The contract is the KEPT set (one receipt per run
  // that did something), never the firm's 288-a-day history.
  const deRows = planNodes(report.feedPlan)
    .filter((n) => n["Relation Name"] === "domain_events")
    .reduce((sum, n) => sum + (n["Actual Rows"] ?? 0) * (n["Actual Loops"] ?? 1), 0);
  assert.ok(deRows > 0,
    `af.20 vacuity control: the measured plan never read clara.domain_events at all — ${JSON.stringify(report.feedPlan)}`);
  assert.ok(deRows <= 3 * KEPT,
    `af.20 the helper's own plan read ${deRows} rows of clara.domain_events for a KEPT set of ${KEPT} `
    + `(history ${RECEIPTS}) — its cost tracks the firm's sweep history, not the work it reports: ${JSON.stringify(report.feedPlan)}`);

  // (4) THE CATALOG CLAUSE that makes (3) the plan the FUNCTION runs and not merely a plan the
  // planner would pick for a literal. Without it the session firm is planned at the per-firm
  // AVERAGE of a multi-tenant table from the sixth call of every pooled connection — which is the
  // defect (1) measures, asserted here in the one form that is true on every database, busy or
  // idle, pristine or populated.
  assert.deepEqual(report.helperConfig.map((r) => r.proname),
    ["_sweep_event_has_effect", "_sweep_events_with_effect"],
    "af.20 both sweep helpers are installed (vacuity control for the pin below)");
  for (const row of report.helperConfig) {
    assert.ok(row.cfg.includes("plan_cache_mode=force_custom_plan"),
      `af.20 clara.${row.proname} does not pin plan_cache_mode=force_custom_plan (proconfig ${JSON.stringify(row.cfg)}) — `
      + "a generic plan built for the per-firm average is one pooled connection away");
    assert.ok(row.cfg.includes("search_path=clara, pg_temp"),
      `af.20 clara.${row.proname} lost its pinned search_path (proconfig ${JSON.stringify(row.cfg)})`);
  }
});

test("af.21 the exclusion is SET-BASED in the feed and HOISTED in the detail door — the two installed bodies, read from the catalog", async (t) => {
  if (await gateSweep(t)) return;
  // A LIGHT TEXTUAL GUARD, kept only because af.20 above measures the cost (delta review [2]: on
  // its own this shape is both blind — it was green at 48 s a page — and brittle). It catches the
  // one thing a cost cell on a small rig can miss: the correlated per-row form creeping back.
  // Read from the INSTALLED body, the same way this migration's own prestate sha-pins read it.
  const body = (await rootQuery(
    `select p.prosrc from pg_proc p where p.oid = '${await listActivitySignature()}'::regprocedure`,
  )).rows[0].prosrc;
  const calls = body.split("clara._sweep_events_with_effect(").length - 1;
  assert.equal(calls, 1,
    "af.21 EXACTLY ONE textual call site — a second one would almost certainly be a per-row predicate again");
  assert.match(body, /v_kept_sweeps uuid\[\]/,
    "af.21 …and it is materialised into a local array before the union");
  assert.match(body, /v\.event_id = any\(v_kept_sweeps\)/,
    "af.21 …which the union's own predicate tests, so no plan can turn it back into a call per row");
  assert.equal(body.includes("clara._sweep_events_with_effect(v.event_id)"), false,
    "af.21 the correlated per-row form is gone from the deployed body");

  // THE SET HELPER'S OWN BODY, pinned for the two things that decide its COST and that no
  // correctness cell can see (delta review round 3, finding [2]). af.20 measures the plan the
  // planner picks for THIS statement; nothing but this pin notices if the installed body stops
  // being that statement. `offset 0` is an optimisation fence, not decoration: without it the
  // planner pulls the correlated probe up into a plain join and reads the firm's WHOLE receipt
  // history (measured: Merge Join over a Seq Scan, 97-136 ms at 30,000 receipts against 1.6 ms).
  // The pins read the SQL, not its prose: `--` comment tails are stripped first, because the
  // body's own comment says "No LIMIT and no ORDER BY" and a word-match on the raw prosrc reds
  // on exactly the sentence that documents the property (measured on CI, PR #731).
  const setForm = (await rootQuery(
    "select p.prosrc from pg_proc p where p.oid = 'clara._sweep_events_with_effect()'::regprocedure",
  )).rows[0].prosrc.replace(/--[^\n]*/g, "");
  assert.match(setForm, /cross join lateral/,
    "af.21 the set helper probes one receipt per KEPT run through a lateral, not a plain join");
  assert.match(setForm, /offset 0/,
    "af.21 …and the lateral carries its optimisation fence, without which the planner flattens it back into that join");
  assert.equal(/\blimit\b/i.test(setForm), false,
    "af.21 …and the fence is an OFFSET, never a LIMIT: a run named by two receipts must still contribute both");

  // THE DETAIL DOOR'S HALF, which the round left unpinned (delta review [9]) even though 0183's
  // own comment names the hazard for it: a definer call in the WHERE is a filter the planner may
  // run once per row of the whole timeline. Assert it sits AFTER the row is fetched.
  const detail = (await rootQuery(
    "select p.prosrc from pg_proc p where p.oid = 'clara.get_activity_event(text,text)'::regprocedure",
  )).rows[0].prosrc;
  assert.equal(detail.split("clara._sweep_event_has_effect(").length - 1, 1,
    "af.21 get_activity_event calls the point-lookup helper exactly once");
  assert.equal(detail.includes("clara._sweep_events_with_effect("), false,
    "af.21 …and never the SET form: one cached plan per caller shape is the whole point of the split");
  const beforeFetch = detail.slice(0, detail.indexOf("where v.event_id::text = p_id;"));
  assert.ok(beforeFetch.length > 0, "af.21 the event arm's own WHERE is still where this cell expects it");
  assert.equal(beforeFetch.includes("clara._sweep_event_has_effect("), false,
    "af.21 the helper is HOISTED out of the row-fetching statement, never another predicate beside `v.event_id::text = p_id`");
});

test("af.22 the optional-parameter helper is GONE, not merely unused — two callers may not share one cached plan", async (t) => {
  if (await gateSweep(t)) return;
  // The shape the delta review measured at 13.8-16.4 s a call: ONE plpgsql statement carrying
  // `(p_event is null or de.id = p_event)`, cached per session and shared by both doors. An
  // overload that still resolves is an overload a later caller can reach.
  const r = await rootQuery(
    `select to_regprocedure('clara._sweep_events_with_effect(uuid)') is null as gone,
            to_regprocedure('clara._sweep_events_with_effect()') is not null as set_form,
            to_regprocedure('clara._sweep_event_has_effect(uuid)') is not null as point_form`);
  assert.equal(r.rows[0].gone, true,
    "af.22 clara._sweep_events_with_effect(uuid) no longer resolves");
  assert.equal(r.rows[0].set_form, true, "af.22 the zero-argument set form is the feed's door");
  assert.equal(r.rows[0].point_form, true, "af.22 …and the boolean point lookup is the detail door's");

  // The two indexes that make both of them cost the KEPT set rather than the firm's history.
  const idx = (await rootQuery(
    `select c.relname::text as name, pg_get_indexdef(c.oid) as def
       from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'clara' and c.relkind = 'i'
        and c.relname in ('ix_domain_events_sweep_run', 'ix_sweep_runs_firm_effect')
      order by 1`)).rows;
  assert.deepEqual(idx.map((x) => x.name), ["ix_domain_events_sweep_run", "ix_sweep_runs_firm_effect"],
    "af.22 both sweep-attribution indexes are installed");

  // …AND THE RECEIPT INDEX IS THE COMPOSITE ONE (delta review round 3, finding [2]). The
  // expression-ONLY cut this replaced was never chosen by any plan the planner picked, at any of
  // three loads, and when forced it was 5x SLOWER than the plan it replaced: the planner AND-ed it
  // with domain_events_pkey and re-read the firm's whole history per probe. Only the composite
  // matches the helper's whole correlated predicate — the firm bound AND the run reference — which
  // is what turns one kept run into one index scan. af.20's row bound reds behaviourally if this
  // is undone; this cell names WHY, so the next reader does not re-derive it from a plan.
  const receipts = idx[0].def;
  assert.match(receipts, /\(firm_id, \(\(payload ->> 'run_id'::text\)\)\)/,
    `af.22 ix_domain_events_sweep_run must be COMPOSITE on (firm_id, payload->>'run_id') — got ${receipts}`);
  assert.match(receipts, /WHERE \(event_type = 'sweep\.run_completed'::text\)/,
    `af.22 …and partial on the receipt type — got ${receipts}`);
  // The kept-run side, whose partial predicate is the whole premise of the ticket.
  assert.match(idx[1].def, /WHERE \(\(drafted_count \+ posted_count\) > 0\)/,
    `af.22 ix_sweep_runs_firm_effect must stay partial on "a run that did something" — got ${idx[1].def}`);
});

// ===========================================================================================
// af.23 — THE DOOR'S OWN PLAN DISCIPLINE (delta review round 4, BLOCKER [0]).
//
// af.20 above pins the two HELPERS. Round 3 pinned the helpers and stopped there, and the door a
// person actually waits on kept the same defect one level up: `clara.list_activity` binds
// `c.firm`, `p_client`, `p_kinds`, `p_since`, `p_until`, the cursor pair, `v_limit` AND the new
// `v_kept_sweeps` array as plpgsql parameters of ONE union statement, which plpgsql caches per
// SESSION and switches to the GENERIC plan from the sixth execution.
//
// WHY THIS CELL PLANTS `clara.operation_receipts` AND NOT A SWEEP HISTORY. af.20's load is the
// sweep arm; this one is the orx arm (`orr.firm_id = c.firm and orr.outcome = 'committed'`,
// 0183:701), and it is deliberately planted with ZERO sweep rows — MEASURED on a pristine 0183
// chain (127.0.0.1:5697, 1,500 sibling firms x 4 committed receipts + 30,000 for the firm under
// test, sweep history 0, kept 0): calls 1-5 of the door took 229/145/141/145/137 ms and calls
// 6-10 took 1976/2049/2156/2782/2376 ms — a 13.7x step at exactly the plan-cache boundary, with
// no sweep row anywhere in the database. So the flip is NOT #728's `v_kept_sweeps` array (that is
// a SECOND site, measured at 19.5x on 30,000 receipts / 6,000 kept) and it is not the helpers'
// (their series is flat at 0.5-1.1 ms on this very load): it is the door's own statement, and it
// was INHERITED FROM 0181. The same load with `set local plan_cache_mode = force_custom_plan` is
// flat at 147-217 ms across all ten; with `force_generic_plan` it is 2157-2614 ms from call ONE,
// so the tail plan IS the generic plan. Full series: <scratch>/logs/728-fix4-A-before-default.log.
//
// TWO ARMS, BOTH LOAD-BEARING, and they fail for different reasons:
//   (1) THE CATALOG CLAUSE — true on every database, busy or idle, pristine or populated. It is
//       the arm that reds the moment the clause is dropped from either door.
//   (2) THE WALL-CLOCK SERIES at a load big enough to SEE the flip. af.20's 4,000/200 was not:
//       measured flat there, which is how this shipped past a cell written to catch exactly it.
//       Proven red on the pre-fix door (the clause reset inside a rolled-back transaction, same
//       session, same load, one difference — see the same log).
//
// ARM (1) NOW COVERS A THIRD DOOR (final review, SHOULD-FIX [1]). This round shipped
// `clara.list_spoken_for_documents` (0183 section 4) with the identical shape — one cached
// statement binding the session firm and `p_client` — but without the clause, and nothing here
// named it. The catalog-clause arm below now asserts all three; only `list_activity`'s own
// series is wall-clock measured (arm 2), the same asymmetry af.20 already accepts for
// `get_activity_event`.
// ===========================================================================================

// The orx load. `ORX_RECEIPTS` is ~105 days of #623 Work postings at the live cadence; the
// siblings are what make `orr.firm_id = $1` look CHEAP to a generic plan (the estimate is total
// rows / n_distinct(firm_id), i.e. the per-firm AVERAGE of a multi-tenant table).
const ORX_RECEIPTS = 30000;

test("af.23 BOUNDED COST AT THE DOOR: ten consecutive clara.list_activity calls on ONE connection stay flat across the plpgsql plan-cache boundary, and the door pins the custom plan that makes it true", async (t) => {
  if (await gateSweep(t)) return;
  const pWork = await pWorkReady();
  const firm = FIRM_A();
  const claims = JSON.stringify({ sub: BOB(), role: "authenticated" });

  const report = await withRolledBackSession(async (c) => {
    // (a) THE SKEW: 1,500 sibling firms, each with a handful of committed receipts, so the
    // per-firm average is small and the firm under test is far above it.
    await c.query(
      `insert into clara.firms(id, name)
       select ('af230000-0000-4000-8000-' || lpad(g::text, 12, '0'))::uuid, 'af23_sibling_' || g
         from generate_series(1, $1) g`, [SIBLINGS]);
    await c.query(
      `insert into clara.clients(id, firm_id, name)
       select ('af23c000-0000-4000-8000-' || lpad(g::text, 12, '0'))::uuid,
              ('af230000-0000-4000-8000-' || lpad(g::text, 12, '0'))::uuid, 'af23_sib_client_' || g
         from generate_series(1, $1) g`, [SIBLINGS]);
    await c.query(
      `insert into clara.accounting_work(id, firm_id, client_id, purpose, status, initiator,
          initiator_role, intent_key, logical_op_id, basis, basis_digest, basis_origin)
       select ('af23a000-0000-4000-8000-' || lpad(g::text, 12, '0'))::uuid,
              ('af230000-0000-4000-8000-' || lpad(g::text, 12, '0'))::uuid,
              ('af23c000-0000-4000-8000-' || lpad(g::text, 12, '0'))::uuid,
              'journal_entry', 'completed', $2::uuid, 'bookkeeper',
              'af23_sib_intent_' || g, 'af23_sib_logical_' || g, '{}'::jsonb, repeat('a', 64), 'user_direct'
         from generate_series(1, $1) g`, [SIBLINGS, BOB()]);
    await c.query(
      `insert into clara.agent_tasks(id, firm_id, client_id, kind, status, model_snapshot, created_by)
       select ('af239000-0000-4000-8000-' || lpad(g::text, 12, '0'))::uuid,
              ('af230000-0000-4000-8000-' || lpad(g::text, 12, '0'))::uuid,
              ('af23c000-0000-4000-8000-' || lpad(g::text, 12, '0'))::uuid,
              'autodraft', 'queued', 'clara-test-model', $2::uuid
         from generate_series(1, $1) g`, [SIBLINGS, BOB()]);
    await c.query(
      `insert into clara.operation_receipts(firm_id, client_id, work_id, purpose, logical_op_id,
          payload_digest, acting_actor, on_behalf_of, via_wake_kind, bundle_digest, run_id, task_id,
          outcome, effects, created_at)
       select ('af230000-0000-4000-8000-' || lpad(g::text, 12, '0'))::uuid,
              ('af23c000-0000-4000-8000-' || lpad(g::text, 12, '0'))::uuid,
              ('af23a000-0000-4000-8000-' || lpad(g::text, 12, '0'))::uuid,
              'journal_entry', 'af23_sib_logical_' || g || '_' || gs, repeat('b', 64),
              $2::uuid, $2::uuid, 'human', repeat('c', 64), 'af23_sib_run_' || g || '_' || gs,
              ('af239000-0000-4000-8000-' || lpad(g::text, 12, '0'))::uuid, 'committed',
              jsonb_build_object('entry_id', gen_random_uuid()::text),
              now() - (gs || ' minutes')::interval
         from generate_series(1, $1) g, generate_series(1, $3) gs`, [SIBLINGS, BOB(), PER_SIBLING]);

    // (b) …and the firm under test's OWN committed-receipt history, which is what the generic
    // plan mis-estimates at that average.
    await c.query(
      `insert into clara.clients(id, firm_id, name)
       values ('af23d000-0000-4000-8000-000000000001'::uuid, $1::uuid, 'af23_target_client')`, [firm]);
    await c.query(
      `insert into clara.accounting_work(id, firm_id, client_id, purpose, status, initiator,
          initiator_role, intent_key, logical_op_id, basis, basis_digest, basis_origin)
       values ('af23e000-0000-4000-8000-000000000001'::uuid, $1::uuid,
              'af23d000-0000-4000-8000-000000000001'::uuid, 'journal_entry', 'completed', $2::uuid,
              'bookkeeper', 'af23_target_intent', 'af23_target_logical', '{}'::jsonb, repeat('a', 64),
              'user_direct')`, [firm, BOB()]);
    await c.query(
      `insert into clara.agent_tasks(id, firm_id, client_id, kind, status, model_snapshot, created_by)
       values ('af23f000-0000-4000-8000-000000000001'::uuid, $1::uuid,
              'af23d000-0000-4000-8000-000000000001'::uuid, 'autodraft', 'queued', 'clara-test-model',
              $2::uuid)`, [firm, BOB()]);
    await c.query(
      `insert into clara.operation_receipts(firm_id, client_id, work_id, purpose, logical_op_id,
          payload_digest, acting_actor, on_behalf_of, via_wake_kind, bundle_digest, run_id, task_id,
          outcome, effects, created_at)
       select $1::uuid, 'af23d000-0000-4000-8000-000000000001'::uuid,
              'af23e000-0000-4000-8000-000000000001'::uuid, 'journal_entry',
              'af23_target_logical_' || gs, repeat('b', 64), $2::uuid, $2::uuid, 'human',
              repeat('c', 64), 'af23_target_run_' || gs,
              'af23f000-0000-4000-8000-000000000001'::uuid, 'committed',
              jsonb_build_object('entry_id', gen_random_uuid()::text),
              now() - (gs || ' minutes')::interval
         from generate_series(1, $3) gs`, [firm, BOB(), ORX_RECEIPTS]);
    // ANALYZE INSIDE the transaction, for the reason af.20 records: the estimates must be the
    // same on a pristine database and on one the rest of the suite has already populated.
    await c.query("analyze clara.operation_receipts");
    await c.query("analyze clara.accounting_work");
    await c.query("analyze clara.clients");
    await c.query("analyze clara.agent_tasks");

    const doorConfig = (await c.query(
      `select p.proname, coalesce(p.proconfig, '{}'::text[]) as cfg
         from pg_proc p
        where p.pronamespace = 'clara'::regnamespace
          and p.proname in ('list_activity', 'get_activity_event', 'list_spoken_for_documents')
        order by 1`)).rows;
    const planted = (await c.query(
      `select count(*)::int as n from clara.operation_receipts
        where firm_id = $1::uuid and outcome = 'committed'`, [firm])).rows[0].n;

    await c.query("set local role clara_authenticated");
    await c.query("select set_config('request.jwt.claims', $1, true)", [claims]);
    const feed = [];
    for (let i = 0; i < CALLS; i += 1) {
      feed.push((await timed(c,
        "select jsonb_array_length(clara.list_activity(null,25,null,null,null,null)->'rows') as n")).ms);
    }
    // #770 — THE SAME SERIES, SCOPED TO THE TARGET WORK, over the same ORX_RECEIPTS-row history:
    // the `orx` arm's p_work predicate sits inside that arm's own `where`, ahead of its
    // `limit v_limit + 1`, and this is the measurement that says it did not cost the firm's
    // history to apply it.
    const feedWork = [];
    if (pWork) {
      for (let i = 0; i < CALLS; i += 1) {
        feedWork.push((await timed(c,
          "select jsonb_array_length(clara.list_activity(null,25,null,null,null,null,"
          + "'af23e000-0000-4000-8000-000000000001'::uuid)->'rows') as n")).ms);
      }
    }
    return { feed, doorConfig, planted, feedWork };
  });

  const fmt = (a) => a.map((n) => n.toFixed(1)).join(" / ");
  assert.ok(report.planted >= ORX_RECEIPTS,
    `af.23 vacuity control: only ${report.planted} committed receipts were planted for the firm under test`);

  // (1) THE STEP, compared MINIMUM-of-tail against MEDIAN-of-head for the reason af.20 records: a
  // busy host raises a maximum, a generic plan raises EVERY call from the sixth.
  const head = median(report.feed.slice(0, HEAD));
  const tail = Math.min(...report.feed.slice(HEAD));
  assert.ok(tail <= Math.max(FLIP_FACTOR * head, FLIP_FLOOR_MS),
    `af.23 clara.list_activity STEPPED UP at the plan-cache boundary: calls 1-${HEAD} median ${head.toFixed(1)} ms, `
    + `cheapest of calls ${HEAD + 1}-${CALLS} ${tail.toFixed(1)} ms — series ${fmt(report.feed)}. `
    + "A pooled PostgREST connection serves every Activity read after the fifth from that plan.");

  // (1b) #770 — THE SAME STEP AND THE SAME ABSOLUTE BUDGET with p_work bound. The target Work owns
  // every one of the firm's ORX_RECEIPTS committed receipts, so this is the WORST case for the
  // new predicate rather than a trivially empty page.
  if (pWork) {
    for (const [i, ms] of report.feedWork.entries()) {
      assert.ok(ms < CALL_BUDGET_MS,
        `af.23 clara.list_activity(p_work) call ${i + 1} took ${ms.toFixed(1)} ms (budget ${CALL_BUDGET_MS} ms) — series ${fmt(report.feedWork)}`);
    }
    const headW = median(report.feedWork.slice(0, HEAD));
    const tailW = Math.min(...report.feedWork.slice(HEAD));
    assert.ok(tailW <= Math.max(FLIP_FACTOR * headW, FLIP_FLOOR_MS),
      `af.23 clara.list_activity(p_work) STEPPED UP at the plan-cache boundary: calls 1-${HEAD} median ${headW.toFixed(1)} ms, `
      + `cheapest of calls ${HEAD + 1}-${CALLS} ${tailW.toFixed(1)} ms — series ${fmt(report.feedWork)}`);
  }

  // (2) THE CATALOG CLAUSE. Asserted for ALL THREE doors (final review, SHOULD-FIX [1] joined
  // `list_spoken_for_documents` to the `get_activity_event`/`list_activity` pair this cell already
  // held): each one measures flat today or binds a small parameter set, but each binds the SAME
  // session firm the same way, and a surface whose members disagree about their own plan
  // discipline is one someone later "tidies" the wrong way (0183 section 1's rule).
  assert.deepEqual(report.doorConfig.map((r) => r.proname),
    ["get_activity_event", "list_activity", "list_spoken_for_documents"],
    "af.23 all three activity/evidence doors are installed (vacuity control for the pins below)");
  for (const row of report.doorConfig) {
    assert.ok(row.cfg.includes("plan_cache_mode=force_custom_plan"),
      `af.23 clara.${row.proname} does not pin plan_cache_mode=force_custom_plan (proconfig ${JSON.stringify(row.cfg)}) `
      + "— its own statement binds the session firm (list_activity also the filters, cursor and kept-sweep array; "
      + "list_spoken_for_documents also p_client) as plpgsql parameters, and a generic plan built for the "
      + "per-firm average is one pooled connection away");
    assert.ok(row.cfg.includes("search_path=clara, pg_temp"),
      `af.23 clara.${row.proname} lost its pinned search_path (proconfig ${JSON.stringify(row.cfg)})`);
  }
});

// #744(c) — the owner accepted the linear kept-sweep read rather than relating the two clocks
// (a sweep run's finalized_at and its run-completed event's created_at) with a constraint or an
// index. That ruling holds ONLY because today's finalize/created identity is true by
// construction: clara.reconcile_sweep_runs is the SOLE function body that both sets
// clara.sweep_runs.finalized_at and appends the sweep.run_completed event, in the same
// transaction (packages/db/migrations/0011_daily_loop.sql). This cell reads that fact from the
// LIVE CATALOG — not from this file's own memory of the migration — and proves it is not
// vacuously true: a temporary second writer, installed inside a transaction this cell always
// rolls back, must make both counts read 2, or this guard would pass on any world.
test("af.24 the two clocks: exactly ONE function body sets clara.sweep_runs.finalized_at, and exactly ONE appends sweep.run_completed (#744 c) — proven to fail against a temporary second writer", async (t) => {
  if (await gateSweep(t)) return;

  const FINALIZED_AT_WRITER = /update\s+clara\.sweep_runs\b[^;]*?finalized_at\s*=/i;
  const RUN_COMPLETED_APPENDER = /_append_event\([^,)]+,\s*'sweep\.run_completed'/i;

  async function scan(queryFn) {
    const rows = (await queryFn(
      `select p.proname, pg_get_functiondef(p.oid) as def
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'clara' and p.prokind = 'f'`)).rows;
    return {
      finalizers: rows.filter((r) => FINALIZED_AT_WRITER.test(r.def)).map((r) => r.proname).sort(),
      appenders: rows.filter((r) => RUN_COMPLETED_APPENDER.test(r.def)).map((r) => r.proname).sort(),
    };
  }

  // THE LIVE CLAIM.
  const live = await scan(rootQuery);
  assert.deepEqual(live.finalizers, ["reconcile_sweep_runs"],
    `af.24: exactly one function body may set clara.sweep_runs.finalized_at (#744 c); got ${live.finalizers.join(", ") || "(none)"} `
    + "— the finalize/created identity the feed leans on holds only by construction of today's single writer");
  assert.deepEqual(live.appenders, ["reconcile_sweep_runs"],
    `af.24: exactly one function body may append sweep.run_completed (#744 c); got ${live.appenders.join(", ") || "(none)"} `
    + "— the same single writer, same transaction, is what makes the identity true");

  // THE NEGATIVE PROOF. A second writer of BOTH facts, installed for the life of one
  // transaction that is ALWAYS rolled back (never committed, never visible to any other
  // session) must flip both counts to 2 — otherwise this cell could not actually fail.
  const tmpFn = `clara._test744_second_writer_${process.pid}_${Date.now()}`;
  await withTxn(async (c) => {
    await c.query(`
      create function ${tmpFn}(p_run_id uuid) returns void language plpgsql as $body744$
      begin
        update clara.sweep_runs set finalized_at = now() where id = p_run_id;
        perform clara._append_event(null,'sweep.run_completed',null,null,null,null,null,null,null,null);
      end
      $body744$;
    `);
    const withSecondWriter = await scan((sql) => c.query(sql));
    assert.equal(withSecondWriter.finalizers.length, 2,
      `af.24 mutant control: a temporary second finalized_at writer must make the count 2, got ${withSecondWriter.finalizers.length} (${withSecondWriter.finalizers.join(", ")})`);
    assert.equal(withSecondWriter.appenders.length, 2,
      `af.24 mutant control: a temporary second run_completed appender must make the count 2, got ${withSecondWriter.appenders.length} (${withSecondWriter.appenders.join(", ")})`);
  }, { commit: false });

  // THE ROLLBACK PROOF. The temporary second writer must not survive — the live world is
  // exactly what it was before the mutant control ran.
  const after = await scan(rootQuery);
  assert.deepEqual(after.finalizers, ["reconcile_sweep_runs"],
    "af.24: the temporary second writer must not survive the rollback");
  assert.deepEqual(after.appenders, ["reconcile_sweep_runs"],
    "af.24: the temporary second appender must not survive the rollback");
});

// ===========================================================================================
// #770 — THE `p_work` DOOR FILTER (migration 0202).
//
// The Work detail's Activity tab used to read the whole CLIENT feed and keep the rows whose
// `work_id` matched in the browser. Because every union arm carries its OWN
// `order by occurred_at desc, id desc` and `limit v_limit + 1` BEFORE the union, that page was
// the client's newest rows regardless of Work — so a Work whose events sit far back needed
// several over-fetched pages before any of them surfaced, and a page boundary between two of its
// events read as "no activity" while older matching rows went unread.
//
// These cells prove the narrowing happens IN SQL, inside each arm's own `where`, rather than
// anywhere a client could have done it.
// ===========================================================================================

/** A committed `clara.operation_receipts` row for a named Work, constructed directly (as root)
 *  so a cell can force an EXACT `created_at` — a tie no product path can build — and so a
 *  cross-firm fixture needs no second firm's whole Work lane. The shape is af.23's own insert. */
async function mkWorkReceipt({ firm, client, work, task, createdAt = null, tag }) {
  const r = await rootQuery(
    `insert into clara.operation_receipts(firm_id, client_id, work_id, purpose, logical_op_id,
        payload_digest, acting_actor, on_behalf_of, via_wake_kind, bundle_digest, run_id, task_id,
        outcome, effects, created_at)
     values ($1,$2,$3,'journal_entry',$4, repeat('b',64), $5, $5, 'human', repeat('c',64), $6, $7,
        'committed', jsonb_build_object('entry_id', gen_random_uuid()::text),
        coalesce($8::timestamptz, now()))
     returning id::text as id, created_at`,
    [firm, client, work, `af770_${tag}_${opk("af770-lop")}`, AGENT_USER_ID, `af770_run_${tag}_${opk("af770-run")}`,
      task, createdAt]);
  return { id: r.rows[0].id, occurredAt: r.rows[0].created_at };
}

/** An `accounting_work` row plus the `agent_tasks` row its receipts cite, both as root: enough
 *  for the `orx` arm, without driving admit/claim/wake for a Work whose RUN is not the subject. */
async function mkWorkRow({ firm, client, author, tag }) {
  const task = (await rootQuery(
    `insert into clara.agent_tasks(firm_id, client_id, kind, status, model_snapshot, created_by)
     values ($1,$2,'autodraft','queued','clara-test-model',$3) returning id`,
    [firm, client, author])).rows[0].id;
  const work = (await rootQuery(
    `insert into clara.accounting_work(firm_id, client_id, purpose, status, initiator,
        initiator_role, intent_key, logical_op_id, basis, basis_digest, basis_origin)
     values ($1,$2,'journal_entry','completed',$3,'bookkeeper',$4,$5,'{}'::jsonb, repeat('a',64),
        'user_direct') returning id`,
    [firm, client, author, `af770_intent_${tag}_${opk("af770-i")}`, `af770_logical_${tag}_${opk("af770-l")}`]
  )).rows[0].id;
  return { work, task };
}

test("af.25 p_work narrows IN SQL: a second Work's rows in the SAME client never reach a p_work page, and neither does a work_id-less agent-receipt row", async (t) => {
  if (await gatePWork(t)) return;
  const cli = await freshWorkClient(ALICE(), "af770a");
  const a = await mkWorkRow({ firm: FIRM_A(), client: cli, author: BOB(), tag: "a" });
  const b = await mkWorkRow({ firm: FIRM_A(), client: cli, author: BOB(), tag: "b" });
  const rowA = await mkWorkReceipt({ firm: FIRM_A(), client: cli, work: a.work, task: a.task, tag: "a" });
  const rowB = await mkWorkReceipt({ firm: FIRM_A(), client: cli, work: b.work, task: b.task, tag: "b" });
  // …and an agent-act receipt, whose arm projects `null::uuid as work_id` unconditionally.
  await mkAgentAct({ firm: FIRM_A(), client: cli });

  const bothVisible = rowsOf(await listActivity(BOB(), { client: cli, limit: 100 })).map((r) => r.id);
  assert.ok(bothVisible.includes(rowA.id) && bothVisible.includes(rowB.id),
    "af.25 vacuity control: without p_work the client feed carries BOTH Works' receipts");

  const onlyA = rowsOf(await listActivity(BOB(), { client: cli, work: a.work, limit: 100 }));
  assert.ok(onlyA.length > 0, "af.25 the p_work page is not empty (the YES)");
  assert.ok(onlyA.every((r) => r.work_id === a.work),
    `af.25 EVERY row of a p_work page belongs to that Work — got ${JSON.stringify(onlyA.map((r) => r.work_id))}`);
  assert.equal(onlyA.some((r) => r.id === rowB.id), false, "af.25 the second Work's receipt is absent");
  assert.equal(onlyA.some((r) => r.source === "agent_receipt"), false,
    "af.25 the agent-receipt arm — which projects work_id null unconditionally — contributes nothing under p_work");

  // THE PROOF THAT IT IS SQL AND NOT A CLIENT PASS. `limit 1` with p_work=A: the newest row of
  // the CLIENT is B's, so a door that filtered after its per-arm limit would answer an EMPTY page
  // here. This is the reported bug, asserted server-side.
  const oneA = rowsOf(await listActivity(BOB(), { client: cli, work: a.work, limit: 1 }));
  assert.equal(oneA.length, 1, "af.25 a one-row p_work page still finds this Work's newest row");
  assert.equal(oneA[0].work_id, a.work, "af.25 …and it is this Work's row, not the client's newest");
});

test("af.26 a Work whose events are OLDER than a full client page is on the FIRST p_work page", async (t) => {
  if (await gatePWork(t)) return;
  const cli = await freshWorkClient(ALICE(), "af770b");
  const old = await mkWorkRow({ firm: FIRM_A(), client: cli, author: BOB(), tag: "old" });
  const oldRow = await mkWorkReceipt({
    firm: FIRM_A(), client: cli, work: old.work, task: old.task, tag: "old",
    createdAt: "2021-01-01T00:00:00Z",
  });
  // …buried under MORE THAN A FULL ARM PAGE of NEWER receipts belonging to other Works of the
  // same client. STRICTLY MORE than `PAGE + 1`, and that is the whole force of this cell: each
  // arm's own fetch is `limit v_limit + 1`, so a door that applied p_work AFTER the union would
  // still find the old row if only `PAGE` newer ones sat above it. `NEWER` is `PAGE + 3`, so the
  // old row is outside every arm's pre-filter window and ONLY an arm-level predicate reaches it.
  const PAGE = 5;
  const NEWER = PAGE + 3;
  for (let i = 0; i < NEWER; i += 1) {
    const w = await mkWorkRow({ firm: FIRM_A(), client: cli, author: BOB(), tag: `new${i}` });
    await mkWorkReceipt({
      firm: FIRM_A(), client: cli, work: w.work, task: w.task, tag: `new${i}`,
      createdAt: `2030-01-0${i + 1}T00:00:00Z`,
    });
  }

  const unfiltered = rowsOf(await listActivity(BOB(), { client: cli, limit: PAGE }));
  assert.equal(unfiltered.some((r) => r.id === oldRow.id), false,
    "af.26 vacuity control: the old Work's row is NOT on the first unfiltered client page — this is the bug");

  const scoped = rowsOf(await listActivity(BOB(), { client: cli, work: old.work, limit: PAGE }));
  assert.ok(scoped.some((r) => r.id === oldRow.id),
    "af.26 …and it IS on the first p_work page, with no pages to walk — the predicate sits inside each arm's own where, ahead of its own limit");
});

test("af.27 a p_work naming ANOTHER firm's Work answers an EMPTY page — not an error and not an existence signal", async (t) => {
  if (await gatePWork(t)) return;
  const theirClient = await freshWorkClient(DAVE(), "af770c");
  const theirs = await mkWorkRow({ firm: FIRM_B(), client: theirClient, author: DAVE(), tag: "b" });
  const theirRow = await mkWorkReceipt({
    firm: FIRM_B(), client: theirClient, work: theirs.work, task: theirs.task, tag: "b" });

  const dave = rowsOf(await listActivity(DAVE(), { work: theirs.work, limit: 100 }));
  assert.ok(dave.some((r) => r.id === theirRow.id),
    "af.27 vacuity control: the Work's OWN firm reads the row through p_work");

  const bob = await listActivity(BOB(), { work: theirs.work, limit: 100 });
  assert.deepEqual(rowsOf(bob), [], "af.27 firm A reads an empty page for firm B's Work id");
  assert.equal(bob.truncated, false, "af.27 …a well-formed empty page, not a refusal");

  // A GENUINELY ABSENT id is the SAME answer — no oracle: a caller cannot tell "another firm's
  // Work" from "no such Work" by the shape of the reply.
  const absent = await listActivity(BOB(), { work: "00000000-0000-4000-8000-000000000000", limit: 100 });
  assert.deepEqual(rowsOf(absent), [], "af.27 an absent Work id answers the same empty page");
  assert.equal(absent.truncated, bob.truncated, "af.27 …and is indistinguishable from the cross-firm one");
});

test("af.28 keyset pagination holds with p_work set: pages strictly older, ties deterministic, no row served twice or dropped", async (t) => {
  if (await gatePWork(t)) return;
  const cli = await freshWorkClient(ALICE(), "af770d");
  const mine = await mkWorkRow({ firm: FIRM_A(), client: cli, author: BOB(), tag: "keyset" });
  const other = await mkWorkRow({ firm: FIRM_A(), client: cli, author: BOB(), tag: "noise" });
  // THREE rows of THIS Work sharing an IDENTICAL occurred_at — the tie the (occurred_at, id)
  // break exists for — plus one row of another Work at the SAME instant, which must never appear.
  const tie = "2028-03-09T11:22:33.456789Z";
  const made = [];
  for (let i = 0; i < 3; i += 1) {
    made.push((await mkWorkReceipt({
      firm: FIRM_A(), client: cli, work: mine.work, task: mine.task, createdAt: tie, tag: `k${i}` })).id);
  }
  const noise = await mkWorkReceipt({
    firm: FIRM_A(), client: cli, work: other.work, task: other.task, createdAt: tie, tag: "noise" });

  const seen = [];
  let cursor = null;
  let guard = 0;
  for (;;) {
    guard += 1;
    assert.ok(guard <= 10, "af.28 pagination did not terminate — a cursor bug would loop forever");
    const page = await listActivity(BOB(), { client: cli, work: mine.work, limit: 1, cursor });
    const pageRows = rowsOf(page);
    if (pageRows.length === 0) break;
    for (const r of pageRows) seen.push(r.id);
    if (!page.truncated) break;
    assert.ok(page.next_cursor, "af.28 a truncated page always carries a next_cursor");
    cursor = page.next_cursor;
  }

  assert.equal(seen.length, 3, `af.28 exactly this Work's three tied rows — got ${seen.length}`);
  assert.equal(new Set(seen).size, 3, "af.28 dedupe-free paging — no id repeats across pages");
  assert.deepEqual([...seen].sort(), [...made].sort(), "af.28 the exact three ids, page-walked one at a time");
  assert.equal(seen.includes(noise.id), false, "af.28 the other Work's row at the SAME instant never enters the walk");
});

test("af.29 the six-argument signature does not survive as a resolvable overload, and the seven-argument door keeps all five catalog properties", async (t) => {
  if (await gatePWork(t)) return;
  const r = (await rootQuery(
    `select to_regprocedure('clara.list_activity(text,int,uuid,text[],timestamptz,timestamptz)') is null as six_gone,
            to_regprocedure('clara.list_activity(text,int,uuid,text[],timestamptz,timestamptz,uuid)') is not null as seven,
            (select count(*)::int from pg_proc p
              where p.pronamespace = 'clara'::regnamespace and p.proname = 'list_activity') as bodies`)).rows[0];
  assert.equal(r.six_gone, true,
    "af.29 clara.list_activity(text,int,uuid,text[],timestamptz,timestamptz) no longer resolves — an overload that still resolves is an overload a later caller can reach (af.22's own words), and PostgREST would have two candidates");
  assert.equal(r.seven, true, "af.29 the seven-argument door is the one that resolves");
  assert.equal(r.bodies, 1, `af.29 EXACTLY ONE body of this name survives — got ${r.bodies}`);

  // The five properties a DROP + CREATE does NOT preserve, read from the catalog rather than from
  // the migration's own text: PUBLIC revoked, clara_authenticated granted, SECURITY INVOKER, the
  // pinned search_path and the pinned plan_cache_mode. 0184's recut section stated the assumption
  // that dies here verbatim — "Grants are NOT re-issued: create or replace preserves them."
  const posture = (await rootQuery(
    `select pg_get_userbyid(p.proowner) as owner, p.prosecdef as secdef,
            coalesce(array_to_string(p.proconfig, ','), '<none>') as cfg,
            coalesce(array_to_string(p.proacl, ','), '<null>') as acl,
            obj_description(p.oid, 'pg_proc') as cmt
       from pg_proc p
      where p.oid = 'clara.list_activity(text,int,uuid,text[],timestamptz,timestamptz,uuid)'::regprocedure`
  )).rows[0];
  assert.equal(posture.owner, "clara_fn_owner", "af.29 the recut door is still clara_fn_owner's");
  assert.equal(posture.secdef, false, "af.29 …and still SECURITY INVOKER");
  assert.equal(posture.cfg, "search_path=clara, pg_temp,plan_cache_mode=force_custom_plan",
    `af.29 …with BOTH pinned settings restated — got ${posture.cfg}`);
  assert.equal(posture.acl, "clara_fn_owner=X/clara_fn_owner,clara_authenticated=X/clara_fn_owner",
    `af.29 …and EXACTLY the literal ACL {owner, clara_authenticated}: PUBLIC revoked, re-granted by hand after the drop — got ${posture.acl}`);
  assert.ok((posture.cmt ?? "").includes("p_work"),
    "af.29 …and the comment a DROP took with it is re-issued and names the new parameter");
});

test("af.30 omitting p_work reproduces the six-argument door exactly — same rows, same order, same cursor", async (t) => {
  if (await gatePWork(t)) return;
  const cli = await freshWorkClient(ALICE(), "af770e");
  const w = await mkWorkRow({ firm: FIRM_A(), client: cli, author: BOB(), tag: "same" });
  for (let i = 0; i < 3; i += 1) {
    await mkWorkReceipt({ firm: FIRM_A(), client: cli, work: w.work, task: w.task, tag: `s${i}` });
  }
  await mkAgentAct({ firm: FIRM_A(), client: cli });

  const withNull = await listActivity(BOB(), { client: cli, limit: 2, work: null });
  const plain = (await humanQuery(BOB(),
    "select clara.list_activity($1::text,$2::int,$3::uuid,$4::text[],$5::timestamptz,$6::timestamptz) as result",
    [null, 2, cli, null, null, null])).rows[0].result;
  assert.deepEqual(plain, withNull,
    "af.30 the DEFAULT for p_work is null and a six-argument call reaches the same page, cursor included");
  assert.equal(typeof plain.next_cursor, "string", "af.30 vacuity control: this page is truncated and carries a cursor");
});

// ===========================================================================================
// 8 · #840 — THE SUCCESSOR WORK LINK on a `work.cancelled` row (migration 0262).
//
// #721's ruling of 2026-09-12 (point 3): the two Works link both ways on B3 (the Work detail page,
// which already reads `supersedes`/`superseded_by` off `clara.accounting_work` directly) AND on
// the Activity feed. `clara.cancel_accounting_work` has carried the successor in its OWN event's
// payload since #750 (0199, forward-compatibly re-derived by #721's 0200); these two cells prove
// BOTH doors now surface it, additively, and ONLY on the one row it is about.
// ===========================================================================================

test("af.31 a work.cancelled row for a RESTATED Work carries the successor id in BOTH doors, and an unrelated posted Work's own row carries a null successor", async (t) => {
  if (await assertSuccessorLinkCohortPresent(t)) return;
  const cli = await freshWorkClient(ALICE(), "af840a");

  // An UNRELATED Work, posted — the orx arm's own kind=work row, the additive-only control: this
  // row's event_type is a Work purpose ('journal_entry'), never work.cancelled.
  const posted = await postWorkEntry({ client: cli });

  const original = await admitJournalWork({ client: cli, author: BOB(), basis: basis() });
  const restated = await restateAccountingWork({
    work: original.work_id, author: BOB(), basis: basis({ memo: "af840 corrected" }),
  });
  assert.notEqual(restated.work_id, original.work_id, "af.31 setup: restating minted a NEW Work");

  const page = rowsOf(await listActivity(BOB(), { client: cli, kinds: ["work"], limit: 100 }));

  const cancelledRow = page.find((r) => r.event_type === "work.cancelled" && r.work_id === original.work_id);
  assert.ok(cancelledRow, "af.31 the retired Work's cancellation reaches the feed");
  assert.equal(cancelledRow.successor_work_id, restated.work_id,
    "af.31 list_activity projects the successor onto the work.cancelled row");

  const detail = await getActivityEvent(BOB(), "event", cancelledRow.id);
  assert.equal(detail.successor_work_id, restated.work_id,
    "af.31 get_activity_event projects the SAME successor for the SAME row");

  const postedRow = page.find((r) => r.source === "operation_receipt" && r.receipt_id === posted.receipt_id);
  assert.ok(postedRow, "af.31 setup: the unrelated posted Work's own row is on the SAME page");
  assert.equal(postedRow.successor_work_id, null,
    "af.31 additive-only: an operation_receipt row (never a work.cancelled event) carries a null successor");
  const postedDetail = await getActivityEvent(BOB(), "operation_receipt", posted.receipt_id);
  assert.equal(postedDetail.successor_work_id, null, "af.31 …and the SAME null in ITS OWN detail door");
});

test("af.32 an ORDINARY cancellation (no successor) carries a null successor_work_id in both doors, never an absent key", async (t) => {
  if (await gateSuccessorLink(t)) return;
  const cli = await freshWorkClient(ALICE(), "af840b");
  const work = await admitJournalWork({ client: cli, author: BOB(), basis: basis() });
  await cancelAccountingWork({ work: work.work_id, author: BOB() });

  const page = rowsOf(await listActivity(BOB(), { client: cli, kinds: ["work"], limit: 100 }));
  const cancelledRow = page.find((r) => r.event_type === "work.cancelled" && r.work_id === work.work_id);
  assert.ok(cancelledRow, "af.32 the plain cancellation reaches the feed");
  assert.ok(Object.prototype.hasOwnProperty.call(cancelledRow, "successor_work_id"),
    "af.32 the key is PRESENT (additive projection), not merely absent-and-therefore-undefined");
  assert.equal(cancelledRow.successor_work_id, null,
    "af.32 a cancel with no successor carries a null successor");

  const detail = await getActivityEvent(BOB(), "event", cancelledRow.id);
  assert.ok(Object.prototype.hasOwnProperty.call(detail, "successor_work_id"));
  assert.equal(detail.successor_work_id, null, "af.32 …and the SAME null in the detail door");
});
