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

// ===========================================================================================
// Wrappers over the two new doors, positional (the order this migration declares them in).
// ===========================================================================================

async function listActivity(sub, { cursor = null, limit = 50, client = null, kinds = null, since = null, until = null } = {}) {
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
