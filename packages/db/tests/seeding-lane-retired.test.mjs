// #1012 — THE PRIOR-GL SEEDING LANE IS RETIRED. Migration: 0288_seeding_lane_retired.sql;
// gated on the LIVE CATALOG, never on the migration number.
//
// OWNER RULING 2026-09-20 (#983, closed): the prior-GL seeding lane gets no browser entrance,
// because the product direction is the Client KB — nobody pre-registers by hand what Clara can
// learn from a source. #1012 carries that ruling into the estate: the lane accepts no new work
// and nags nobody, while every past batch, proposal and published page stays readable.
//
// WHAT THIS BATTERY OWNS.
//   * `clara.create_seeding_batch`, `clara.tick_seeding_proposal`,
//     `clara.decline_seeding_proposal` — one shared typed refusal (CLR34,
//     detail.reason = 'seeding_lane_retired') driven through the REAL doors, with nothing
//     written: no batch, no proposal transition, no op_receipts row, no domain event.
//   * `clara.cancel_seeding_batch`, `clara.complete_seeding_batch` — still work on a batch
//     left open at retirement, so a firm can close its own history out.
//   * `clara.list_review_queue` — emits NO `seeding_proposal` row for a client that carries
//     OPEN proposals, and the other ten row kinds are unchanged.
//   * `clara.document_capabilities` for `prior_gl` — basis and limits state the retirement.
//
// HISTORY IS PLANTED, NOT MINTED. After 0288 no door can create a seeding batch, so the
// pre-retirement state every cell reads is planted by root INSERT (the rig's own idiom for a
// fixture whose creating door is gone — 0287's own "rootQuery appears only to PLANT a
// fixture"). Every ASSERTION still runs through a real door or a real per-role session.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import {
  endPool, humanQuery, opk, rootQuery, roleQuery, ROLES, PG, assertRaises,
} from "./rig-fixtures.mjs";
import { CLR33, detailReason } from "./wave-b/wb-helpers.mjs";
import { listReviewQueue, humanPersona } from "./wave-a-reads.mjs";
import {
  buildWaveBWorld, onboardingClient, filedDocument, setDocumentKind,
  createSeedingBatch, cancelSeedingBatch, completeSeedingBatch,
  batchRow, proposalRows, eventsOf,
} from "./wave-b/wb-fixtures.mjs";

const EXPECTED_CELLS = 6;
const RETIRED_REASON = "seeding_lane_retired";

let live = false;
let executed = 0;
let w = null;

/** True iff 0288's cohort is applied: all three write doors carry the retirement marker.
 *  A PARTIAL cohort THROWS — the estate's "wholly present or wholly absent" rule. */
async function retirementCohortApplied() {
  const r = await rootQuery(
    `select
       (select position('${RETIRED_REASON}' in prosrc) > 0
          from pg_proc where oid = 'clara.create_seeding_batch(uuid,uuid,jsonb,text)'::regprocedure)   as creator,
       (select position('${RETIRED_REASON}' in prosrc) > 0
          from pg_proc where oid = 'clara.tick_seeding_proposal(uuid,text)'::regprocedure)             as ticker,
       (select position('${RETIRED_REASON}' in prosrc) > 0
          from pg_proc where oid = 'clara.decline_seeding_proposal(uuid,text,text)'::regprocedure)     as decliner`,
  );
  const row = r.rows[0];
  const flags = Object.values(row);
  const present = flags.filter(Boolean).length;
  if (present !== 0 && present !== flags.length) {
    throw new Error(`#1012 0288 cohort is PARTIAL: ${JSON.stringify(row)}`);
  }
  return present === flags.length;
}

before(async () => {
  live = await retirementCohortApplied();
  if (live) w = await buildWaveBWorld();
});
after(async () => {
  if (live) assert.equal(executed, EXPECTED_CELLS, `expected ${EXPECTED_CELLS} cells to run, ${executed} did`);
  await endPool();
});

function gate(t) {
  if (live) return false;
  if (process.env.CLARA_ALLOW_MISSING_SEEDING_LANE_RETIRED === "1") {
    console.warn("SKIP seeding-lane-retired: the 0288 cohort is not applied (explicit pre-integration run).");
    t.skip("0288 cohort absent -- explicit pre-integration run");
    return true;
  }
  assert.fail("the 0288 seeding-lane-retired cohort is required for a focused run: apply 0288_seeding_lane_retired.sql");
}

function cell(name, fn) {
  test(name, async (t) => {
    if (gate(t)) return;
    await fn(t);
    executed += 1;
  });
}

/** A filed, verified, prior_gl-stamped document — exactly the source create_seeding_batch
 *  admitted before the retirement, so the refusal is proven on an input that WOULD have
 *  succeeded, never on one the door would have refused anyway. */
async function priorGlSource(client) {
  const doc = await filedDocument(w.users.alice, { firm: w.firms.A, client, kind: null });
  await setDocumentKind(w.users.alice, {
    document: doc.documentId, kind: "prior_gl", reason: "#1012 retirement battery source",
  });
  return doc;
}

cell("p1012.create.retired_refusal_writes_nothing", async () => {
  // No explicit name: onboardingClient()'s own default mints a collision-free leading token,
  // which #899's client birth wall (0287) now requires of every fixture client.
  const onb = await onboardingClient(w.users.hana);
  const doc = await priorGlSource(onb.client);
  const key = opk("p1012create");

  const err = await assertRaises(CLR33, () => createSeedingBatch({
    client: onb.client,
    document: doc.documentId,
    proposals: [{
      proposal_kind: "wiki_fact",
      proposal_key: "wf:retired",
      payload: { slug: "profile", fact: "Client trades as a hardware wholesaler." },
      evidence: { prior_gl_lines: [1] },
    }],
    opKey: key,
  }), "create_seeding_batch after the retirement");

  assert.equal(detailReason(err), RETIRED_REASON, "the refusal carries the shared typed reason");
  assert.match(err.message, /retired/i, "the message names the retirement");

  // NOTHING WAS WRITTEN — not a batch, not an op_receipt, not an event.
  const batches = await rootQuery(
    "select count(*)::int as n from clara.seeding_batches where client_id = $1", [onb.client]);
  assert.equal(batches.rows[0].n, 0, "no seeding batch was created for this client");
  const receipts = await rootQuery(
    "select count(*)::int as n from clara.op_receipts where fn = 'create_seeding_batch' and op_key = $1", [key]);
  assert.equal(receipts.rows[0].n, 0, "the refusal reserved no operation — the door refuses BEFORE _reserve_op");
  const events = await eventsOf(w.firms.A, "seeding.batch_created", null);
  assert.equal(
    events.filter((e) => e.client_id === onb.client).length, 0,
    "no seeding.batch_created event for this client");

  // The door still belongs to the runtime lane alone: a human caller is still refused by the
  // privilege wall, not by the new body — the retirement loosens no access.
  await assertRaises(PG.insufficientPrivilege, () => roleQuery(ROLES.authenticated,
    "select clara.create_seeding_batch(p_client => $1, p_document => $2, p_proposals => '[]'::jsonb, p_op_key => $3)",
    [onb.client, doc.documentId, opk("p1012priv")]), "authenticated caller after the retirement");
});

/** A batch that was minted BEFORE the retirement, planted directly because no door can mint
 *  one any more. The document is a REAL filed, verified prior_gl (`priorGlSource`), so the
 *  closers' own `_append_event` can resolve it in the firm/client filing history. */
async function plantHistoricalBatch(client, doc, keys) {
  const b = await rootQuery(
    `insert into clara.seeding_batches(firm_id, client_id, source_document_id, source_sha256, state, stats)
       values ($1, $2, $3::uuid, $4, 'open',
               jsonb_build_object('proposal_count', $5::int, 'refused_count', 0, 'source_document_id', $3::uuid))
     returning id`,
    [w.firms.A, client, doc.documentId, doc.sha256, keys.length]);
  const batch = b.rows[0].id;
  for (const key of keys) {
    await rootQuery(
      `insert into clara.seeding_proposals(batch_id, firm_id, client_id, proposal_kind, proposal_key,
           payload, evidence, state)
         values ($1, $2, $3, 'wiki_fact', $4,
                 '{"slug":"profile","fact":"Client trades as a hardware wholesaler."}'::jsonb,
                 '{"prior_gl_lines":[1]}'::jsonb, 'proposed')`,
      [batch, w.firms.A, client, key]);
  }
  return batch;
}

cell("p1012.deciders.retired_refusal_leaves_the_proposal_open", async () => {
  const onb = await onboardingClient(w.users.hana);
  const doc = await priorGlSource(onb.client);
  const batch = await plantHistoricalBatch(onb.client, doc, ["wf:tick", "wf:decline"]);
  const planted = await proposalRows(batch);
  assert.equal(planted.length, 2, "mandatory setup: two OPEN proposals exist to decide on");
  const [toTick, toDecline] = planted;

  // hana is an ADMIN of firm A — the exact role floor both doors used to enforce, so the
  // refusal below is the RETIREMENT, never an authorisation failure in disguise.
  const tickKey = opk("p1012tick");
  const tickErr = await assertRaises("CLR34", () => humanQuery(w.users.hana,
    "select clara.tick_seeding_proposal(p_proposal => $1, p_op_key => $2) as r",
    [toTick.id, tickKey]), "tick_seeding_proposal after the retirement");
  assert.equal(detailReason(tickErr), RETIRED_REASON, "tick carries the shared typed reason");

  const declineKey = opk("p1012decline");
  const declineErr = await assertRaises("CLR34", () => humanQuery(w.users.hana,
    "select clara.decline_seeding_proposal(p_proposal => $1, p_reason => $2, p_op_key => $3) as r",
    [toDecline.id, "no longer our lane", declineKey]), "decline_seeding_proposal after the retirement");
  assert.equal(detailReason(declineErr), RETIRED_REASON, "decline carries the shared typed reason");

  // ONE SHARED SENTENCE: the two deciders and the creator all say the same thing.
  assert.equal(tickErr.message, declineErr.message, "tick and decline share one message");

  // Both proposals are exactly as they were: still open, never decided.
  const after = await proposalRows(batch);
  assert.deepEqual(
    after.map((p) => [p.proposal_key, p.state, p.decided_by, p.decided_at, p.decision_reason]),
    [["wf:tick", "proposed", null, null, null], ["wf:decline", "proposed", null, null, null]],
    "neither proposal moved");
  const receipts = await rootQuery(
    "select count(*)::int as n from clara.op_receipts where op_key = any ($1::text[])",
    [[tickKey, declineKey]]);
  assert.equal(receipts.rows[0].n, 0, "neither refusal reserved an operation");
  const decided = await eventsOf(w.firms.A, "seeding.proposal_decided", toTick.id);
  assert.equal(decided.length, 0, "no seeding.proposal_decided event was appended");
});

cell("p1012.closers.cancel_and_complete_still_close_a_batch_left_open", async () => {
  const onb = await onboardingClient(w.users.hana);
  const docA = await priorGlSource(onb.client);
  const docB = await priorGlSource(onb.client);
  const toCancel = await plantHistoricalBatch(onb.client, docA, ["wf:a"]);
  const toComplete = await plantHistoricalBatch(onb.client, docB, ["wf:b"]);

  const cancelled = await cancelSeedingBatch(w.users.hana, {
    batch: toCancel, reason: "#1012 retirement: closing a batch nobody can decide any more",
  });
  assert.equal(cancelled.status, "cancelled", "cancel_seeding_batch still answers a receipt");
  const cancelledRow = await batchRow(toCancel);
  assert.equal(cancelledRow.state, "cancelled", "the batch is genuinely cancelled");
  assert.equal(
    cancelledRow.cancel_reason,
    "#1012 retirement: closing a batch nobody can decide any more",
    "the cancellation reason is recorded verbatim");

  const completed = await completeSeedingBatch(w.users.hana, { batch: toComplete });
  assert.equal(completed.status, "completed", "complete_seeding_batch still answers a receipt");
  const completedRow = await batchRow(toComplete);
  assert.equal(completedRow.state, "completed", "the batch is genuinely completed");
  assert.equal(completedRow.stats.still_proposed, 1,
    "completing derives its stats from the proposals that were left open at retirement");

  // HISTORY SURVIVES BOTH: the proposals are still there, still readable, still 'proposed'.
  for (const batch of [toCancel, toComplete]) {
    const rows = await proposalRows(batch);
    assert.equal(rows.length, 1, "the closed batch keeps its proposal row");
    assert.equal(rows[0].state, "proposed", "a closed batch does not rewrite its proposals");
  }
});

/** Every `seeding_proposal` row in an envelope, deep-collected (the a21-helpers
 *  collectRowKind idiom ninth-rowkind-seeding-proposal.test.mjs also uses). */
function rowsOfKind(envelope, kind) {
  const out = [];
  (function walk(n) {
    if (n == null || typeof n !== "object") return;
    if (Array.isArray(n)) { n.forEach(walk); return; }
    if (n.row_kind === kind) out.push(n);
    Object.values(n).forEach(walk);
  })(envelope);
  return out;
}

cell("p1012.queue.no_seeding_row_even_for_a_client_with_open_proposals", async () => {
  const onb = await onboardingClient(w.users.hana);
  const doc = await priorGlSource(onb.client);
  const batch = await plantHistoricalBatch(onb.client, doc, ["wf:q1", "wf:q2"]);
  const open = await proposalRows(batch);
  assert.equal(open.filter((p) => p.state === "proposed").length, 2,
    "mandatory setup: this client carries TWO open proposals in an OPEN batch — exactly the state that used to chase");
  assert.equal((await batchRow(batch)).state, "open", "mandatory setup: the owning batch is open");

  // A POSITIVE CONTROL in the same envelope: an open question on the same firm's
  // long-lived client, so an empty result below is the seeding row's absence and not a
  // read that returned nothing at all.
  await humanQuery(w.users.alice,
    "select clara.open_question(p_client => $1, p_scope_kind => 'client', p_scope_id => $1, p_question => $2, p_op_key => $3) as r",
    [w.clients.A1, "#1012 positive control: is this envelope alive?", opk("p1012q")]);

  for (const scope of [{}, { client_id: onb.client }]) {
    const envelope = await listReviewQueue(humanPersona(w.users.alice), { scope, limit: 500 });
    assert.equal(rowsOfKind(envelope, "seeding_proposal").length, 0,
      `the queue emits NO seeding_proposal row (scope ${JSON.stringify(scope)})`);
  }
  const firmWide = await listReviewQueue(humanPersona(w.users.alice), { scope: {}, limit: 500 });
  assert.ok(rowsOfKind(firmWide, "open_question").length > 0,
    "positive control: the SAME envelope still carries other row kinds");
});

cell("p1012.registry.prior_gl_rows_state_the_retirement_not_an_absent_entrance", async () => {
  const rows = (await rootQuery(
    `select format, typed_facts, business_operation, registry_version, basis, limits
       from clara.document_capabilities where document_kind = 'prior_gl' order by format`)).rows;
  assert.equal(rows.length, 12, "twelve formats, as 0191 seeded them — this ticket inserts and deletes nothing");

  // THE SEVEN ROWS 0228 NAMED. They are exactly the formats packages/runtime/lib/seeding-parse.mjs
  // has a reader for; they were the ones carrying `limits.browser_entrance = "absent"`, and they
  // are the ones whose basis promised the operation.
  const retired = rows.filter((r) => r.limits?.seeding_lane !== undefined);
  assert.deepEqual(retired.map((r) => r.format).sort(),
    ["heic", "jpeg", "pdf", "png", "tiff", "webp", "xlsx"],
    "exactly the seven formats 0228 named now carry the retirement limit");

  for (const r of retired) {
    assert.equal(r.limits.seeding_lane, "retired", `${r.format}: the limit STATES the retirement`);
    assert.equal(r.limits.seeding_lane_reason, "client_kb_replaces_manual_pre_registration",
      `${r.format}: …and names why, the two-key shape 0245 set`);
    assert.equal(r.limits.browser_entrance, undefined,
      `${r.format}: "an absent entrance" is superseded — a retired lane has no entrance to be missing`);
    assert.match(r.basis, /retired/i, `${r.format}: the basis says the lane is retired`);
    assert.match(r.basis, /0288/, `${r.format}: …and names the migration that retired it`);
    assert.doesNotMatch(r.basis, /NO BROWSER ENTRANCE EXISTS YET/,
      `${r.format}: the "not built yet" sentence cannot stand beside a retirement`);
    assert.doesNotMatch(r.basis, /Clara derives nothing to drive it/,
      `${r.format}: 0228 removed that sentence and this ticket does not put it back`);
  }

  // THE LEVEL IS UNCHANGED, on EVERY prior_gl row. The ticket's own out-of-scope line:
  // widening this kind's business-operation or typed-facts level is not this change.
  for (const r of rows) {
    assert.equal(r.business_operation, "stored_only", `${r.format}: business_operation is untouched`);
    assert.equal(r.typed_facts, r.format === "xml" ? "unsupported" : "stored_only",
      `${r.format}: typed_facts is untouched`);
  }

  // THE REGISTRY PUBLISHES ONE VERSION, AND IT ROSE. 4 is what this republication publishes on a
  // chain whose previous publication was #782's 3; a sibling lane republishing first would raise
  // it further, which is why the floor is asserted rather than an exact equality (the ticket's
  // own sequencing note: whichever lands second re-derives against the live rows).
  const v = (await rootQuery(
    `select count(*)::int as n, count(distinct registry_version)::int as versions,
            min(registry_version)::int as v from clara.document_capabilities`)).rows[0];
  assert.equal(v.n, 240, "the republication inserts and deletes nothing");
  assert.equal(v.versions, 1, "the registry publishes exactly one version at a time");
  assert.ok(v.v >= 4, `the registry version rose past #782's 3 (got ${v.v})`);

  // THE HIGH-WATER MARK ROSE WITH IT, every pair, through #846's ordinary writer path.
  const drift = (await rootQuery(
    `select count(*)::int as n from clara.document_capabilities c
       left join clara.document_capability_version_high_water h
         on h.format = c.format and h.document_kind = c.document_kind
      where h.format is null or h.registry_version is distinct from c.registry_version`)).rows[0];
  assert.equal(drift.n, 0, "no pair's high-water mark disagrees with the published registry");
});

/** 0288's own file text. Read from disk, because the claim below is about what the migration
 *  does NOT contain — a fact no catalog read can establish. */
function migration0288() {
  const here = dirname(fileURLToPath(import.meta.url));
  return readFileSync(join(here, "..", "migrations", "0288_seeding_lane_retired.sql"), "utf8");
}

cell("p1012.reads.history_stays_readable_and_firm_scoped", async () => {
  const onb = await onboardingClient(w.users.hana);
  const doc = await priorGlSource(onb.client);
  const batch = await plantHistoricalBatch(onb.client, doc, ["wf:r1", "wf:r2"]);

  // THE READS, through a real per-role session under real RLS — never rootQuery, which would
  // prove only that the rows exist.
  const seen = await humanQuery(w.users.alice,
    `select b.id, b.state, b.source_sha256,
            (select count(*)::int from clara.seeding_proposals p where p.batch_id = b.id) as proposals
       from clara.seeding_batches b where b.id = $1`, [batch]);
  assert.equal(seen.rowCount, 1, "a firm member still reads their own firm's seeding batch after the retirement");
  assert.equal(seen.rows[0].state, "open", "…with its state");
  assert.equal(seen.rows[0].source_sha256, doc.sha256, "…and its source binding");
  assert.equal(seen.rows[0].proposals, 2, "…and both proposals are readable through the same session");

  const props = await humanQuery(w.users.alice,
    "select proposal_key, proposal_kind, state, payload from clara.seeding_proposals where batch_id = $1 order by proposal_key",
    [batch]);
  assert.deepEqual(props.rows.map((r) => [r.proposal_key, r.proposal_kind, r.state]),
    [["wf:r1", "wiki_fact", "proposed"], ["wf:r2", "wiki_fact", "proposed"]],
    "every proposal reads back with its key, kind and state");
  assert.equal(props.rows[0].payload.slug, "profile", "…and its payload, verbatim");

  // FIRM SCOPE IS UNCHANGED: firm B's owner reads none of it.
  const dave = await humanQuery(w.users.dave,
    "select count(*)::int as n from clara.seeding_batches where id = $1", [batch]);
  assert.equal(dave.rows[0].n, 0, "a member of another firm still reads nothing — the retirement loosens no scope");

  // AND THE MIGRATION TOUCHES NO ROW OF EITHER RELATION, by construction rather than by
  // counting: its whole text contains no UPDATE, DELETE or INSERT against them. (The one INSERT
  // it does carry is into the probe's own discarded fixture rows, inside a subtransaction that
  // is forced to roll back — which is why the assertion below is on the WRITE VERBS against
  // these two relation names, not on the word `insert`.)
  const sql = migration0288().toLowerCase();
  for (const verb of ["update clara.seeding_batches", "update clara.seeding_proposals",
    "delete from clara.seeding_batches", "delete from clara.seeding_proposals"]) {
    assert.equal(sql.includes(verb), false, `0288 must contain no "${verb}" — history is not rewritten`);
  }
});
