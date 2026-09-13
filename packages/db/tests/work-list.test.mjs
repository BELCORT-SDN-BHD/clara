// #641 — the B-style Work LIST battery for packages/db/migrations/0189_work_list_reads.sql.
//
// FRONTIER-GATED on the `work_list_reads$` stable stem (the work-journal-fixtures.mjs
// workLaneReady()/gateWork() pattern, restated here for this migration's own stem so the
// slice-frontier CI legs SKIP cleanly rather than red on a database pinned before 0189 lands).
// A skip is not evidence; the green run that matters is the one on a chain that carries 0189.
//
// WHAT THIS FILE IS ABOUT. `clara.list_accounting_work` is the ONE server-backed read behind both
// Work lists (`/work` firm-wide and `/clients/:id/work`): filterable, keyset-paged, newest first,
// with the two CANONICAL signals the status LABELS are derived from carried on every row — the
// number of runs the Work has had (`attempts`, which is what makes "Retrying" a fact rather than
// a guess) and the pending question it is parked on. `clara.get_accounting_work_row` is the
// addressed-row door: the #719 lesson, that a `?work=<id>` deep link must resolve a row which may
// be nowhere near the current page window. And `clara.save_my_preferences` gains ONE new
// enumerated interface key, `workViews`, so a saved filter set is durable per person.
//
// WHAT IT DELIBERATELY DOES NOT PROVE. Nothing here says anything about the BROWSER: the Empty
// taxonomy, the filter bar, Pagination and the Tabs are proven by the web unit cells and
// `apps/web/e2e/work-list-walk.spec.ts`. This file proves the door.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  rootQuery, humanQuery, buildWorkWorld, freshWorkClient, endPool, opk, assertRaises,
  admitJournalWork, retryAccountingWork, claimWorkRun, settleWorkRun, basis, detailOf,
  printSkipCount,
} from "./work-journal-fixtures.mjs";
import { parkedWork } from "./work-question-fixtures.mjs";

const CLR04 = "CLR04";
const CLR06 = "CLR06";
const CLR10 = "CLR10";
const CLR11 = "CLR11";
const STEM = "work_list_reads$";

let _ready = null;
async function workListReady() {
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
  if (await workListReady()) return false;
  t.skip(`#641 work-list lane absent (no ${STEM} migration applied)`);
  return true;
}

let world = null;
before(async () => {
  world = await buildWorkWorld();
});
after(async () => {
  printSkipCount("work-list");
  await endPool();
});

const ALICE = () => world.users.alice; // owner, firm A
const BOB = () => world.users.bob;     // bookkeeper, firm A
const CAROL = () => world.users.carol; // viewer, firm A
const DAVE = () => world.users.dave;   // owner, firm B
const CLIENT_B1 = () => world.clients.B1;

// ===========================================================================================
// Wrappers over the two new doors. NAMED arguments only — a divergence in a parameter name is a
// real finding rather than a silent positional mismatch.
// ===========================================================================================

const LIST_CALL =
  "select clara.list_accounting_work("
  + "p_client => $1::uuid, p_status => $2::text[], p_initiator => $3::uuid, p_purpose => $4::text[],"
  + "p_since => $5::timestamptz, p_until => $6::timestamptz, p_q => $7::text,"
  + "p_cursor => $8::text, p_limit => $9::int) as result";

async function listWork(sub, {
  client = null, status = null, initiator = null, purpose = null,
  since = null, until = null, q = null, cursor = null, limit = 25,
} = {}) {
  const r = await humanQuery(sub, LIST_CALL,
    [client, status, initiator, purpose, since, until, q, cursor, limit]);
  return r.rows[0].result;
}

async function getWorkRow(sub, workId) {
  const r = await humanQuery(sub,
    "select clara.get_accounting_work_row(p_work => $1::uuid) as result", [workId]);
  return r.rows[0].result;
}

async function getPrefs(sub) {
  const r = await humanQuery(sub, "select clara.get_my_preferences() as result");
  return r.rows[0].result;
}

async function savePrefs(sub, { version, patch, opKey = null }) {
  const r = await humanQuery(sub,
    "select clara.save_my_preferences(p_expected_version => $1::int, p_patch => $2::jsonb,"
    + " p_op_key => $3::text) as result",
    [version, JSON.stringify(patch), opKey ?? opk("w641-prefs")]);
  return r.rows[0].result;
}

const ids = (page) => page.rows.map((r) => r.id);

/** Admit one Work and settle it to a named terminal, so a cell can build a roster of statuses
 *  through the REAL verbs rather than by planting rows (a planted status would prove nothing
 *  about what the estate can actually produce). */
async function settledWork({ client, author = null, outcome, memo = "rent", errorCode = null, error = null }) {
  const admitted = await admitJournalWork({
    client, author: author ?? ALICE(), basis: basis({ memo }),
  });
  await claimWorkRun({ task: admitted.task_id, runId: opk("w641-run") });
  await settleWorkRun({ task: admitted.task_id, outcome, errorCode, error });
  return admitted;
}

// ===========================================================================================
// wl.1 — THE FLOOR. A viewer is below bookkeeper and is refused CLR04 before any row is read.
// ===========================================================================================
test("wl.1 list_accounting_work floors at bookkeeper: a viewer is refused CLR04", async (t) => {
  if (await gate(t)) return;
  await assertRaises(CLR04, () => listWork(CAROL()), "viewer lists work");
  await assertRaises(CLR04, () => getWorkRow(CAROL(), world.clients.A1), "viewer reads a work row");
});

// ===========================================================================================
// wl.2 — A SHORT PAGE IS HONEST ABOUT BEING SHORT. `truncated=false`, `next_cursor=null`: the
// caller must never be handed a cursor that names a page which does not exist, and must never
// infer a total from one page (AC1's own line).
// ===========================================================================================
test("wl.2 a short page reports truncated=false and next_cursor=null", async (t) => {
  if (await gate(t)) return;
  const client = await freshWorkClient(ALICE(), "wl2");
  await admitJournalWork({ client, author: ALICE(), basis: basis({ memo: "one" }) });

  const page = await listWork(BOB(), { client, limit: 25 });
  assert.equal(page.truncated, false, "a one-row answer under the limit is not truncated");
  assert.equal(page.next_cursor, null, "a short page mints no cursor");
  assert.equal(page.rows.length, 1);
});

// ===========================================================================================
// wl.3 — THE KEYSET ROUND TRIP. Three Works, two statuses, limit 2: page 1 carries two rows and
// a cursor; that cursor's page carries the third and closes the feed. No row appears twice and
// none is skipped — the property a `limit/offset` pager loses the moment a row is inserted.
// ===========================================================================================
test("wl.3 a minted cursor round-trips to the next page in a stable, gapless order", async (t) => {
  if (await gate(t)) return;
  const client = await freshWorkClient(ALICE(), "wl3");
  const a = await admitJournalWork({ client, author: ALICE(), basis: basis({ memo: "first" }) });
  const b = await settledWork({ client, outcome: "completed", memo: "second" });
  const c = await admitJournalWork({ client, author: ALICE(), basis: basis({ memo: "third" }) });

  const page1 = await listWork(BOB(), { client, limit: 2 });
  assert.equal(page1.rows.length, 2, "page 1 is exactly the limit");
  assert.equal(page1.truncated, true, "a full page with more behind it says so");
  assert.ok(typeof page1.next_cursor === "string" && page1.next_cursor.length > 0, "page 1 mints a cursor");

  const page2 = await listWork(BOB(), { client, limit: 2, cursor: page1.next_cursor });
  assert.equal(page2.rows.length, 1, "page 2 carries the remaining row");
  assert.equal(page2.truncated, false);
  assert.equal(page2.next_cursor, null);

  const seen = [...ids(page1), ...ids(page2)];
  assert.equal(new Set(seen).size, 3, "no row is paged twice");
  assert.deepEqual(new Set(seen), new Set([c.work_id, b.work_id, a.work_id]), "no row is skipped");
  // Newest first, by the door's own order.
  assert.deepEqual(seen, [c.work_id, b.work_id, a.work_id], "the order is (created_at desc, id desc)");
});

// ===========================================================================================
// wl.4 — CROSS-FIRM. A bookkeeper of ANOTHER firm reads zero rows for this firm's client, and
// the addressed-row door gives the same no-oracle answer an unknown id gets.
// ===========================================================================================
test("wl.4 another firm's owner reads zero rows and gets no oracle on the row door", async (t) => {
  if (await gate(t)) return;
  const client = await freshWorkClient(ALICE(), "wl4");
  const mine = await admitJournalWork({ client, author: ALICE(), basis: basis({ memo: "mine" }) });

  const theirs = await listWork(DAVE(), { client });
  assert.deepEqual(theirs.rows, [], "firm B sees none of firm A's Work");

  const unfiltered = await listWork(DAVE(), {});
  assert.ok(!ids(unfiltered).includes(mine.work_id), "nor through an unfiltered read");

  await assertRaises(CLR11, () => getWorkRow(DAVE(), mine.work_id), "firm B addresses firm A's Work");
  await assertRaises(CLR11, () => getWorkRow(BOB(), "00000000-0000-4000-8000-000000000000"),
    "an id that never existed");
});

// ===========================================================================================
// wl.5 — THE STATUS FILTER, and its closed roster. An unknown token is refused rather than
// silently matching nothing: a status this build does not know is a caller defect, and a door
// that answered `[]` for it would look exactly like "no such Work".
// ===========================================================================================
test("wl.5 the status filter returns only matching rows; an unknown status is refused CLR10", async (t) => {
  if (await gate(t)) return;
  const client = await freshWorkClient(ALICE(), "wl5");
  const queued = await admitJournalWork({ client, author: ALICE(), basis: basis({ memo: "queued one" }) });
  const done = await settledWork({ client, outcome: "completed", memo: "done one" });

  const onlyCompleted = await listWork(BOB(), { client, status: ["completed"] });
  assert.deepEqual(ids(onlyCompleted), [done.work_id]);

  const both = await listWork(BOB(), { client, status: ["completed", "queued"] });
  assert.equal(new Set(ids(both)).size, 2);
  assert.ok(ids(both).includes(queued.work_id));

  const none = await listWork(BOB(), { client, status: ["cancelled"] });
  assert.deepEqual(none.rows, [], "a filter that matches nothing is an honest empty page");
  assert.equal(none.truncated, false);

  const err = await assertRaises(CLR10, () => listWork(BOB(), { client, status: ["not_a_status"] }),
    "an unknown status token");
  assert.equal(detailOf(err)?.reason, "invalid_status");
});

// ===========================================================================================
// wl.6 — A MALFORMED CURSOR IS A TYPED REFUSAL, never a silent page 1. A caller following a
// hand-edited `?cursor=` must be told, not quietly shown the top of the list as if it were the
// page they asked for.
// ===========================================================================================
test("wl.6 a malformed cursor is refused CLR10 invalid_cursor", async (t) => {
  if (await gate(t)) return;
  const err = await assertRaises(CLR10, () => listWork(BOB(), { cursor: "not-a-cursor" }),
    "a malformed cursor");
  assert.equal(detailOf(err)?.reason, "invalid_cursor");
});

// ===========================================================================================
// wl.7 — THE LIMIT IS CLAMPED, both ends. A caller asking for 10,000 rows gets the ceiling, not
// the whole table; a caller asking for 0 or a negative gets one row rather than an empty page
// that would read as "there is nothing here".
// ===========================================================================================
test("wl.7 p_limit clamps to 1..100", async (t) => {
  if (await gate(t)) return;
  const client = await freshWorkClient(ALICE(), "wl7");
  for (const memo of ["a", "b", "c"]) {
    await admitJournalWork({ client, author: ALICE(), basis: basis({ memo }) });
  }
  const zero = await listWork(BOB(), { client, limit: 0 });
  assert.equal(zero.rows.length, 1, "limit 0 clamps up to 1");
  assert.equal(zero.truncated, true, "and still says there is more");

  const huge = await listWork(BOB(), { client, limit: 10_000 });
  assert.equal(huge.rows.length, 3, "limit 10000 clamps to the ceiling, which this client is under");
});

// ===========================================================================================
// wl.8 — THE PURPOSE AND INITIATOR FILTERS. Purpose carries one value on this estate today
// (`journal_entry`, 0178's own CHECK) and other lanes are widening it; the door therefore filters
// on it WITHOUT a second roster of its own, so an unknown purpose matches nothing rather than
// raising against a list that has already drifted.
// ===========================================================================================
test("wl.8 the purpose and initiator filters narrow the page", async (t) => {
  if (await gate(t)) return;
  const client = await freshWorkClient(ALICE(), "wl8");
  const byAlice = await admitJournalWork({ client, author: ALICE(), basis: basis({ memo: "alice" }) });
  const byBob = await admitJournalWork({ client, author: BOB(), basis: basis({ memo: "bob" }) });

  const journal = await listWork(BOB(), { client, purpose: ["journal_entry"] });
  assert.equal(new Set(ids(journal)).size, 2, "both are journal_entry Work");

  const nothing = await listWork(BOB(), { client, purpose: ["a_purpose_that_does_not_exist"] });
  assert.deepEqual(nothing.rows, [], "an unknown purpose matches nothing and raises nothing");

  const alicesOnly = await listWork(BOB(), { client, initiator: ALICE() });
  assert.deepEqual(ids(alicesOnly), [byAlice.work_id]);
  const bobsOnly = await listWork(BOB(), { client, initiator: BOB() });
  assert.deepEqual(ids(bobsOnly), [byBob.work_id]);
});

// ===========================================================================================
// wl.9 — FREE TEXT over the basis memo. Matched by CONTAINMENT rather than by a LIKE pattern
// built from caller input, so a `%` or `_` a person types is a literal character they are
// searching for and never a wildcard the door silently granted them.
// ===========================================================================================
test("wl.9 free text matches the basis memo by containment, case-insensitively", async (t) => {
  if (await gate(t)) return;
  const client = await freshWorkClient(ALICE(), "wl9");
  const rent = await admitJournalWork({ client, author: ALICE(), basis: basis({ memo: "Quarterly RENT to Maybank" }) });
  await admitJournalWork({ client, author: ALICE(), basis: basis({ memo: "Stationery purchase" }) });

  const hit = await listWork(BOB(), { client, q: "rent" });
  assert.deepEqual(ids(hit), [rent.work_id], "case-insensitive containment");

  const literal = await listWork(BOB(), { client, q: "%" });
  assert.deepEqual(literal.rows, [], "a percent sign is a literal, not a wildcard that matches everything");
});

// ===========================================================================================
// wl.10 — THE DATE FENCE. `p_since` is inclusive and `p_until` is exclusive, so two adjacent
// windows tile the timeline without double-counting the instant on their shared boundary.
// ===========================================================================================
test("wl.10 since is inclusive and until is exclusive", async (t) => {
  if (await gate(t)) return;
  const client = await freshWorkClient(ALICE(), "wl10");
  const w = await admitJournalWork({ client, author: ALICE(), basis: basis({ memo: "fenced" }) });
  const at = (await rootQuery("select created_at from clara.accounting_work where id=$1", [w.work_id]))
    .rows[0].created_at;

  const inclusive = await listWork(BOB(), { client, since: at });
  assert.ok(ids(inclusive).includes(w.work_id), "p_since includes a row AT the boundary instant");

  const exclusive = await listWork(BOB(), { client, until: at });
  assert.ok(!ids(exclusive).includes(w.work_id), "p_until excludes a row AT the boundary instant");
});

// ===========================================================================================
// wl.11 — THE RETRY SIGNAL IS A COUNT OF REAL RUNS, not a flag anybody set. A Work that has been
// retried carries `attempts = 2`; a fresh one carries 1. This is the canonical fact the list's
// "Retrying" LABEL is derived from — without it the UI would be inventing a state (#641's own
// "never invent state" line).
// ===========================================================================================
test("wl.11 attempts counts the Work's real runs, so a retry is a fact and not a guess", async (t) => {
  if (await gate(t)) return;
  const client = await freshWorkClient(ALICE(), "wl11");
  const fresh = await admitJournalWork({ client, author: ALICE(), basis: basis({ memo: "one run" }) });
  const failed = await settledWork({
    client, outcome: "failed", memo: "retried",
    errorCode: "internal", error: { code: "CLR10", reason: "transient", message: "boom", recoverable: true },
  });
  await retryAccountingWork({ work: failed.work_id, author: ALICE() });

  const page = await listWork(BOB(), { client, limit: 25 });
  const byId = new Map(page.rows.map((r) => [r.id, r]));
  assert.equal(byId.get(fresh.work_id).attempts, 1, "a Work admitted once has had one run");
  assert.equal(byId.get(failed.work_id).attempts, 2, "a retried Work has had two");

  const addressed = await getWorkRow(BOB(), failed.work_id);
  assert.equal(addressed.attempts, 2, "the addressed-row door reports the same count");
});

// ===========================================================================================
// wl.12 — THE PARKED QUESTION IS ON THE LIST ROW. "Needs you" is the label the list shows for
// `awaiting_input`; the QUESTION's own identity travels with the row so the list can link
// straight to the thing that is waiting rather than making a second read per row.
// ===========================================================================================
test("wl.12 a parked Work carries its pending question's id and version", async (t) => {
  if (await gate(t)) return;
  const client = await freshWorkClient(ALICE(), "wl12");
  const parked = await parkedWork({ client, author: ALICE() });
  const quiet = await admitJournalWork({ client, author: ALICE(), basis: basis({ memo: "not parked" }) });

  const page = await listWork(BOB(), { client, limit: 25 });
  const byId = new Map(page.rows.map((r) => [r.id, r]));
  const row = byId.get(parked.workId);
  assert.equal(row.status, "awaiting_input", "the mirror moved the Work");
  assert.equal(row.pending_question_id, parked.questionId);
  assert.equal(row.pending_question_version, parked.version);
  assert.equal(byId.get(quiet.work_id).pending_question_id, null, "a Work parked on nothing carries null");

  const onlyParked = await listWork(BOB(), { client, status: ["awaiting_input"] });
  assert.deepEqual(ids(onlyParked), [parked.workId], "the Needs-you view is a status filter, not a second read");
});

// ===========================================================================================
// wl.13 — THE ADDRESSED ROW LIVES OUTSIDE THE PAGE WINDOW (#719's own lesson). A deep link to a
// Work that is three pages down must resolve; a list-only read would have shown a not-found for
// a row the caller is perfectly entitled to see.
// ===========================================================================================
test("wl.13 get_accounting_work_row resolves a Work that page 1 does not contain", async (t) => {
  if (await gate(t)) return;
  const client = await freshWorkClient(ALICE(), "wl13");
  const oldest = await admitJournalWork({ client, author: ALICE(), basis: basis({ memo: "oldest" }) });
  for (const memo of ["n1", "n2", "n3", "n4"]) {
    await admitJournalWork({ client, author: ALICE(), basis: basis({ memo }) });
  }

  const page1 = await listWork(BOB(), { client, limit: 2 });
  assert.ok(!ids(page1).includes(oldest.work_id), "the oldest Work is genuinely off page 1");

  const addressed = await getWorkRow(BOB(), oldest.work_id);
  assert.equal(addressed.id, oldest.work_id);
  assert.equal(addressed.memo, "oldest", "and carries the same projection a list row does");
  assert.ok(typeof addressed.client_name === "string" && addressed.client_name.length > 0);
});

// ===========================================================================================
// wl.14 — THE FIRM-WIDE READ CARRIES THE CLIENT. `/work` lists every client's Work in one table,
// so the client NAME has to come from the door — a browser that resolved 100 ids against a
// register read would be a second source of truth for whose books a row belongs to.
// ===========================================================================================
test("wl.14 the firm-wide read spans clients and names each row's client", async (t) => {
  if (await gate(t)) return;
  const c1 = await freshWorkClient(ALICE(), "wl14a");
  const c2 = await freshWorkClient(ALICE(), "wl14b");
  const w1 = await admitJournalWork({ client: c1, author: ALICE(), basis: basis({ memo: "in c1" }) });
  const w2 = await admitJournalWork({ client: c2, author: ALICE(), basis: basis({ memo: "in c2" }) });

  const firmWide = await listWork(BOB(), { limit: 100 });
  const byId = new Map(firmWide.rows.map((r) => [r.id, r]));
  assert.ok(byId.has(w1.work_id) && byId.has(w2.work_id), "one unfiltered read spans both clients");
  assert.equal(byId.get(w1.work_id).client_id, c1);
  assert.ok(typeof byId.get(w1.work_id).client_name === "string" && byId.get(w1.work_id).client_name.length > 0);

  const scoped = await listWork(BOB(), { client: c2, limit: 100 });
  assert.deepEqual(ids(scoped), [w2.work_id], "the client filter narrows the same door");
});

// ===========================================================================================
// wl.15 — EVERY ORIGIN IS LISTED. A Work admitted from a Clara conversation is the SAME durable
// record as one admitted from the composer, and #629's finding is that a chat-originated Work is
// reachable nowhere else. The door therefore filters on NOTHING to do with origin, and the row
// carries `basis_origin` so the list can SHOW where it came from.
// ===========================================================================================
test("wl.15 a clara_interpreted Work is listed beside a user_direct one, with its origin", async (t) => {
  if (await gate(t)) return;
  const client = await freshWorkClient(ALICE(), "wl15");
  const direct = await admitJournalWork({
    client, author: ALICE(), basis: basis({ memo: "typed by a person" }), origin: "user_direct",
  });
  const interpreted = await admitJournalWork({
    client, author: ALICE(), basis: basis({ memo: "asked in chat" }), origin: "clara_interpreted",
  });

  const page = await listWork(BOB(), { client, limit: 25 });
  const byId = new Map(page.rows.map((r) => [r.id, r]));
  assert.equal(byId.get(direct.work_id).basis_origin, "user_direct");
  assert.equal(byId.get(interpreted.work_id).basis_origin, "clara_interpreted");
});

// ===========================================================================================
// wl.16 — SAVED VIEWS. `interface.workViews` is ONE new enumerated key on the preferences door
// 0179 already owns; nothing about the shape is stored that the write did not validate.
// ===========================================================================================
test("wl.16 save_my_preferences accepts interface.workViews and get_my_preferences returns it", async (t) => {
  if (await gate(t)) return;
  const before = await getPrefs(BOB());
  const views = [
    { id: "needs-my-attention", name: "Needs my attention", query: "status=awaiting_input" },
    { id: "failures", name: "Failures", query: "status=failed,refused" },
  ];
  const saved = await savePrefs(BOB(), { version: before.version, patch: { interface: { workViews: views } } });
  assert.deepEqual(saved.interface.workViews, views);

  const read = await getPrefs(BOB());
  assert.deepEqual(read.interface.workViews, views, "the door round-trips the saved views");

  // THE SHALLOW MERGE STILL HOLDS: saving a motion preference cannot clear the views.
  const after = await savePrefs(BOB(), {
    version: read.version, patch: { interface: { motion: "reduced" } },
  });
  assert.deepEqual(after.interface.workViews, views, "one save cannot clear an unrelated setting");
  assert.equal(after.interface.motion, "reduced");
});

test("wl.17 an ill-shaped workViews patch is refused CLR10 with the field path as its reason", async (t) => {
  if (await gate(t)) return;
  const me = ALICE();
  const cases = [
    ["not an array", { workViews: { id: "x" } }],
    ["an element that is not an object", { workViews: ["x"] }],
    ["a blank id", { workViews: [{ id: "  ", name: "n", query: "" }] }],
    ["a missing name", { workViews: [{ id: "x", query: "" }] }],
    ["an unknown key inside a view", { workViews: [{ id: "x", name: "n", query: "", colour: "red" }] }],
    ["duplicate ids", { workViews: [{ id: "x", name: "a", query: "" }, { id: "x", name: "b", query: "" }] }],
  ];
  for (const [label, iface] of cases) {
    const prefs = await getPrefs(me);
    const err = await assertRaises(CLR10,
      () => savePrefs(me, { version: prefs.version, patch: { interface: iface } }), label);
    assert.equal(detailOf(err)?.reason, "interface.workViews", `${label}: names the field path`);
  }
  // And the pre-existing guarantees are untouched: an unknown interface key still refuses under
  // its own path, and a stale version still refuses CLR06.
  const prefs = await getPrefs(me);
  const unknown = await assertRaises(CLR10,
    () => savePrefs(me, { version: prefs.version, patch: { interface: { nope: 1 } } }), "an unknown key");
  assert.equal(detailOf(unknown)?.reason, "interface.nope");
  await assertRaises(CLR06,
    () => savePrefs(me, { version: prefs.version + 7, patch: { interface: { motion: "system" } } }),
    "a stale expected version");
});

// ===========================================================================================
// wl.18 — THE TERMINAL OUTCOME TRAVELS WITH THE ROW. A failed Work's typed error code/reason is
// on the list row, so the list can say WHY without opening every item — and a completed Work's
// posted entry id is there for the same reason.
// ===========================================================================================
test("wl.18 a settled Work carries its typed outcome on the list row", async (t) => {
  if (await gate(t)) return;
  const client = await freshWorkClient(ALICE(), "wl18");
  const refused = await settledWork({
    client, outcome: "refused", memo: "refused one",
    errorCode: "internal", error: { code: "CLR13", reason: "period_locked", message: "the period is locked" },
  });

  const page = await listWork(BOB(), { client, limit: 25 });
  const row = page.rows.find((r) => r.id === refused.work_id);
  assert.equal(row.status, "refused");
  assert.equal(row.error_reason, "period_locked");
  assert.equal(row.error_code, "CLR13");
});

// ===========================================================================================
// wl.19 — A CLIENT OF ANOTHER FIRM CANNOT BE USED AS A PROBE. Passing firm B's client id as
// `p_client` from firm A answers an empty page, never a refusal that would confirm the id exists.
// ===========================================================================================
test("wl.19 a cross-firm p_client answers an empty page, not an oracle", async (t) => {
  if (await gate(t)) return;
  const page = await listWork(BOB(), { client: CLIENT_B1() });
  assert.deepEqual(page.rows, []);
  assert.equal(page.truncated, false);
  assert.equal(page.next_cursor, null);
});
