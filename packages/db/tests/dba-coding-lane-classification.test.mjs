// DB-A -- THE CODING LANE'S POPULATION (H-53), THE CLASSIFICATION QUESTION (H-22), THE CoA
// CHART STATE (H-29) AND THE OPENING-APPROVAL ISOLATION PIN (CB-AE2E-004).
//
// Battery for the DB-A migration set (numbered at merge): dba4 (list_uncoded_filings +
// list_review_queue's filing_rows), dba5 (set_document_kind), dba6 (coa_chart_state) and
// dba7 (the approve_opening_* proconfig pin).
//
// EVERY CELL READS THE CATALOG OR A DOOR, never a filename and never a schema_migrations row.
// Every positive assertion carries its must-not-go-green control on the same fixture.
//
// NEVER LIVE: this file drives writes and runs only against a disposable rig.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  rootQuery, humanQuery, endPool, printLaneNotes, noteLane, printSkipCount, markSkip,
  waveAEnsureReady, filedDocument, openQuestion,
} from "./wave-a-fixtures.mjs";
import { classifyDocument, setDocumentKind } from "./a21-helpers.mjs";
import { claimTask } from "./s6-fixtures.mjs";
import * as wb from "./wave-b/wb-fixtures.mjs";
import { caught } from "./x56-fixtures.mjs";

let ready = false, world = null;

/** Present iff the DB-A coding-lane set is applied — read from the live BODIES, never a name. */
async function hasDbaCodingLane() {
  const r = await rootQuery(
    `select
       (position('_is_codeable_kind' in (select prosrc from pg_proc where oid='clara.list_uncoded_filings(uuid)'::regprocedure)) > 0) as lane,
       (position('_is_codeable_kind' in (select prosrc from pg_proc where oid='clara.list_review_queue(jsonb,jsonb,integer)'::regprocedure)) > 0) as queue,
       (position('open_questions' in (select prosrc from pg_proc where oid='clara.set_document_kind(uuid,text,text,text)'::regprocedure)) > 0) as kind,
       (position('seed_decision_plan_state' in (select prosrc from pg_proc where oid='clara.coa_chart_state(uuid)'::regprocedure)) > 0) as coa,
       (position('onboarding_plan_open' in (select prosrc from pg_proc where oid='clara.apply_coa_template(uuid,uuid,text[],text)'::regprocedure)) > 0) as apply`);
  const x = r.rows[0];
  return x.lane && x.queue && x.kind && x.coa && x.apply;
}

before(async () => {
  const base = await waveAEnsureReady();
  if (!base) { noteLane("0011 surface absent — DB-A coding-lane battery dormant"); return; }
  if (!(await hasDbaCodingLane())) { noteLane("DB-A coding-lane set not applied — battery dormant"); return; }
  ready = true;
  world = await wb.buildWaveBWorld();
});
after(async () => {
  printLaneNotes("dba-coding-lane-classification");
  printSkipCount("dba-coding-lane-classification");
  await endPool();
});

function gate(t) {
  if (!ready) { markSkip(); t.skip("DB-A coding-lane surface absent"); return true; }
  return false;
}

/** A plan-free active client of the world's firm A. Minted as a ROOT insert rather than
 *  through clara.create_client on purpose: the governed creator births an ONBOARDING client
 *  WITH a plan, and the H-29 cells below need a client whose only onboarding plan is the one
 *  the cell itself plants — otherwise "no decision" would be a claim about a fixture rather
 *  than about the read. Same shape f-a3-pr1b-agent-limb.test.mjs:588 uses. */
async function freshClient(tag) {
  const firm = world.firms.A;
  const c = await rootQuery(
    `insert into clara.clients(id, firm_id, name, status) values (gen_random_uuid(),$1,$2,'active') returning id`,
    [firm, `DB-A ${tag} ${Date.now()}-${Math.random().toString(16).slice(2)}`]);
  return { firm, client: c.rows[0].id };
}

/** The queue returns ONE jsonb snapshot with a `rows` array — not a setof. */
async function queueUncodedFilingIds(sub, client) {
  const r = await humanQuery(sub,
    "select clara.list_review_queue(p_scope => $1::jsonb, p_cursor => null, p_limit => 500) as r",
    [JSON.stringify({ client_id: client })]);
  return (r.rows[0].r.rows ?? [])
    .filter((x) => x.row_kind === "uncoded_filing")
    .map((x) => x.filing_id);
}

/** The classify lane's live task for a document, if file_document's auto-enqueue opened one. */
const classifyTaskOf = (doc) => rootQuery(
  "select to_jsonb(t) as row from clara.document_processing_tasks t where t.document_id=$1 and t.lane='classify' order by t.created_at desc limit 1",
  [doc]).then((r) => r.rows[0]?.row ?? null);

/** A low-confidence (<0.8) classification that binds to the auto-enqueued classify task.
 *  file_document opens that task, and classify_document's no-task ceremony refuses
 *  (CLR16) on a document that already carries classify history — so the call must bind
 *  explicitly, exactly as a21-classifier-gate.test.mjs:149-155 does. */
async function classifyLowConfidence(document, kind) {
  const task = await classifyTaskOf(document);
  assert.ok(task, "mandatory setup: file_document's auto-enqueue opened a classify task");
  const claimed = await claimTask(task.id, { egressApproved: false });
  const r = await classifyDocument({
    document, kind, confidence: 0.4,
    task: task.id, run: claimed.workflow_run_id, secret: claimed.claim_secret,
  });
  assert.equal(r.kind_set, false, "mandatory setup: a <0.8 verdict does NOT stamp the kind");
  return r;
}

const laneFilingIds = async (client) =>
  (await rootQuery(
    "select coalesce(array_agg((r ->> 'filing_id')::uuid order by r ->> 'filing_id'), '{}') as ids from clara.list_uncoded_filings($1) r",
    [client])).rows[0].ids;

// =====================================================================================
// DBA-4 (H-53) -- THE POPULATION READERS.
// =====================================================================================

test("dba.4a H-53: a consent_evidence filing leaves the coding lane; an UNCLASSIFIED one and an INVOICE both stay", async (t) => {
  if (gate(t)) return;
  const prep = world.users.bob;
  const { firm, client } = await freshClient("4a");
  const consent = await filedDocument(prep, { firm, client, kind: "consent_evidence" });
  const unclassified = await filedDocument(prep, { firm, client });
  const invoice = await filedDocument(prep, { firm, client, kind: "invoice" });

  const ids = await laneFilingIds(client);
  assert.ok(!ids.includes(consent.filingId),
    "consent evidence is structurally exempt from facts extraction and set_document_kind refuses the kind (CLR28) — no entry will ever exist, so it is not work to code");
  assert.ok(ids.includes(unclassified.filingId),
    "an UNCLASSIFIED filing IS work — somebody must say what it is, so a NULL kind stays in the lane");
  assert.ok(ids.includes(invoice.filingId),
    "and an INVOICE stays — the exclusion is not a blanket");
  assert.equal(ids.length, 2, "exactly two of the three filings are outstanding coding work");
});

test("dba.4b H-53: list_review_queue's filing_rows carries the SAME exclusion — the client home and the lane cannot disagree", async (t) => {
  if (gate(t)) return;
  const owner = world.users.alice, prep = world.users.bob;
  const { firm, client } = await freshClient("4b");
  const consent = await filedDocument(prep, { firm, client, kind: "consent_evidence" });
  const invoice = await filedDocument(prep, { firm, client, kind: "invoice" });

  const uncoded = await queueUncodedFilingIds(owner, client);
  assert.ok(!uncoded.includes(consent.filingId),
    "no 'Uncoded filing' row on the client home for a document that can never carry an entry");
  assert.ok(uncoded.includes(invoice.filingId),
    "the invoice still produces one — the must-not-go-green control for the splice");
});

test("dba.4c the SAME definition drives both readers: flipping one codeability row moves the lane and the queue together", async (t) => {
  if (gate(t)) return;
  const owner = world.users.alice, prep = world.users.bob;
  const { firm, client } = await freshClient("4c");
  const doc = await filedDocument(prep, { firm, client, kind: "identity_document" });

  const queueIds = () => queueUncodedFilingIds(owner, client);
  assert.ok(!(await laneFilingIds(client)).includes(doc.filingId), "excluded from the lane");
  assert.ok(!(await queueIds()).includes(doc.filingId), "and from the queue");

  await rootQuery("update clara.document_kind_codeability set codeable=true where kind='identity_document'");
  try {
    assert.ok((await laneFilingIds(client)).includes(doc.filingId), "one row flipped, and the lane admits it");
    assert.ok((await queueIds()).includes(doc.filingId),
      "and the queue admits it in the same breath — neither reader re-derives the predicate");
  } finally {
    await rootQuery("update clara.document_kind_codeability set codeable=false where kind='identity_document'");
  }
});

// =====================================================================================
// DBA-5 (H-22) -- THE VERB THAT ANSWERS THE QUESTION CLOSES IT.
// =====================================================================================

test("dba.5a H-22: set_document_kind RESOLVES the origin='classification' question it answers, and appends resolve_open_question's own event", async (t) => {
  if (gate(t)) return;
  const prep = world.users.bob;
  const { firm, client } = await freshClient("5a");
  const doc = await filedDocument(prep, { firm, client });

  // A low-confidence classification (< 0.8) writes NO kind and opens the question instead.
  await classifyLowConfidence(doc.documentId, "invoice");
  const opened = await rootQuery(
    `select id, status from clara.open_questions
      where document_id=$1 and origin='classification' order by opened_at`, [doc.documentId]);
  assert.equal(opened.rowCount, 1, "mandatory setup: the low-confidence classifier opened exactly one question");
  assert.equal(opened.rows[0].status, "open");
  const qid = opened.rows[0].id;

  const res = await setDocumentKind(prep, {
    document: doc.documentId, kind: "invoice", reason: "DB-A rig: it is a supplier bill",
  });
  const after = await rootQuery(
    "select status, resolution_text, resolved_by from clara.open_questions where id=$1", [qid]);
  assert.equal(after.rows[0].status, "resolved",
    "the human answered the question by naming the kind, so the question is ANSWERED — not withdrawn");
  assert.match(after.rows[0].resolution_text, /invoice/,
    "and the resolution text names the kind that answered it");
  assert.match(after.rows[0].resolution_text, /supplier bill/,
    "carrying the human's OWN reason — the verb frames it, it does not invent one");
  assert.equal(after.rows[0].resolved_by, prep, "attributed to the human who set the kind");

  const ev = await rootQuery(
    `select payload from clara.domain_events
      where event_type='open_question.resolved' and (payload->>'question_id')::uuid=$1`, [qid]);
  assert.equal(ev.rowCount, 1, "exactly one open_question.resolved event, resolve_open_question's own shape");
  assert.equal(ev.rows[0].payload.status, "resolved");
  assert.equal(ev.rows[0].payload.source, "set_document_kind",
    "and it says WHICH door closed it, so the timeline is readable rather than merely consistent");

  assert.deepEqual(res.resolved_questions, [qid],
    "the op result names what the verb closed on the caller's behalf");
  assert.equal(res.resolved_question_count, 1);
});

test("dba.5b the scope is narrow: a MANUAL question on the same document survives set_document_kind untouched", async (t) => {
  if (gate(t)) return;
  const prep = world.users.bob;
  const { firm, client } = await freshClient("5b");
  const doc = await filedDocument(prep, { firm, client });
  await classifyLowConfidence(doc.documentId, "receipt");

  // A DIFFERENT question about the SAME document. Setting a kind does not answer
  // "which client does this belong to?" and must not pretend it did.
  const manual = await openQuestion(prep, {
    client, scopeKind: "document", scopeId: doc.documentId,
    question: "DB-A rig: whose document is this, Rome or Bee?",
  });
  const manualId = manual.question_id ?? manual.id ?? manual;

  await setDocumentKind(prep, { document: doc.documentId, kind: "receipt", reason: "DB-A rig: a cash receipt" });

  const rows = await rootQuery(
    "select origin, status from clara.open_questions where document_id=$1 order by origin", [doc.documentId]);
  const byOrigin = Object.fromEntries(rows.rows.map((r) => [r.origin, r.status]));
  assert.equal(byOrigin.classification, "resolved", "the classification question is closed");
  assert.equal(byOrigin.manual, "open",
    "and the MANUAL question is still open — a different question, and answering one is not answering the other");
  assert.ok(manualId, "mandatory setup: the manual question was really minted");
});

test("dba.5c the filing leaves needs_you on that ground: the lane no longer reports open_question after the kind is set", async (t) => {
  if (gate(t)) return;
  const prep = world.users.bob;
  const { firm, client } = await freshClient("5c");
  const doc = await filedDocument(prep, { firm, client });
  await classifyLowConfidence(doc.documentId, "invoice");

  const laneBefore = (await rootQuery(
    "select clara._coding_lane_core($1,$2) as r", [client, doc.filingId])).rows[0].r;
  assert.ok(String(laneBefore.reasons ?? laneBefore).includes("open_question"),
    "mandatory setup: the open classification question really does pin the filing at needs_you");

  await setDocumentKind(prep, { document: doc.documentId, kind: "invoice", reason: "DB-A rig: a supplier bill" });
  const laneAfter = (await rootQuery(
    "select clara._coding_lane_core($1,$2) as r", [client, doc.filingId])).rows[0].r;
  assert.ok(!String(laneAfter.reasons ?? laneAfter).includes("open_question"),
    "and after the kind is set the filing is no longer blocked on a question that has been answered");
});

// =====================================================================================
// DBA-6 (H-29) -- THE CoA CHART STATE.
// =====================================================================================

async function applyTemplate(sub, { client, template, opKey }) {
  const r = await humanQuery(sub,
    "select clara.apply_coa_template(p_client => $1, p_template => $2, p_families => null, p_op_key => $3) as r",
    [client, template, opKey]);
  return r.rows[0].r;
}

// createdAt and id are explicit wherever a cell plants MORE THAN ONE plan for a client. The
// created_at column defaults to now(), which is transaction-stable, so plans written together
// tie on it and the reading falls to its later ORDER BY terms; id defaults to a random uuid, so
// a cell that leaves it unset cannot say which row a tie-break picked. That combination red
// 0173's own tail on CI. Pinning both is what makes dba.9d's mutant deterministic.
async function plantPlan(firm, client, { state, seed, committedAt = null, createdAt = null, id = null, user }) {
  const p = await rootQuery(
    `insert into clara.onboarding_plans(id, firm_id, client_id, scope_kind, state, committed_at, committed_by,
        created_at)
       values (coalesce($7::uuid, gen_random_uuid()), $1,$2,'client',$3,$4,$5,
               coalesce($6::timestamptz, now())) returning id`,
    [firm, client, state, committedAt, state === "committed" ? user : null, createdAt, id]);
  await rootQuery(
    `insert into clara.onboarding_plan_items(plan_id, firm_id, item_kind, item_key, question, state,
        answer, answered_by, answered_at)
       values ($1,$2,'must_ask','coa_seed_decision','DB-A rig','answered',$3::jsonb,$4,now())`,
    [p.rows[0].id, firm, JSON.stringify({ seed }), user]);
  return p.rows[0].id;
}
const chartState = async (client) =>
  (await rootQuery("select clara.coa_chart_state($1) as r", [client])).rows[0].r;

test("dba.6a 裁-193: an OPEN plan REPORTS seed_decision_plan_state=open and changes nothing else — the card can say 'decided in the interview' without the read claiming it is settled", async (t) => {
  if (gate(t)) return;
  const owner = world.users.alice;
  const { firm, client } = await freshClient("6a");

  const before0 = await chartState(client);
  assert.equal(before0.state, "undecided", "mandatory setup: no plan, no decision");
  assert.equal(before0.seed_decision_plan_state, null,
    "and the absence arm reports a NULL plan state rather than inventing one");

  await plantPlan(firm, client, { state: "open", seed: "firm_template", user: owner });
  const now = await chartState(client);
  assert.equal(now.seed_decision_plan_state, "open",
    "the read SAYS a decision was made in the interview — the card can stop claiming 'undecided'");
  // 裁-193's CONTAINMENT, and it is the point of the ruling: an open plan changes exactly ONE
  // key. If it reached seed_decision or the six-state `state`, the card would offer an apply
  // that clara.apply_coa_template refuses.
  assert.equal(now.state, "undecided", "the six-state verdict is UNCHANGED from main");
  assert.equal(now.seed_decision, null, "and no decision value leaks out of the open plan");
  // NULL, not false: seed_wants_template is `dec.seed in (…)` over the COMMITTED CTE, and a
  // three-valued NULL is exactly what main returns when no committed decision exists.
  assert.equal(now.seed_wants_template, null, "nor a template intent");
});

test("dba.6b the committed decision reads through, and outranks an open plan sitting beside it", async (t) => {
  if (gate(t)) return;
  const owner = world.users.alice;
  const { firm, client } = await freshClient("6b");
  // The OPEN plan is answered LATER, so recency alone would pick it. Only the ORDER BY's
  // first term keeps the committed decision on top.
  await plantPlan(firm, client, {
    state: "committed", seed: "manual", committedAt: new Date(Date.now() - 86400000).toISOString(), user: owner });
  await plantPlan(firm, client, { state: "open", seed: "firm_template", user: owner });

  const r = await chartState(client);
  assert.equal(r.seed_decision, "manual",
    "the COMMITTED answer reads through — 裁-193 changed the plan-state key, never the decision read");
  assert.equal(r.seed_decision_plan_state, "committed",
    "and committed outranks the open plan sitting beside it");
  assert.equal(r.state, "declined", "the six-state CASE reads off the committed decision");
});

test("dba.6c a CANCELLED plan is not an onboarding in progress — it reports no plan state at all", async (t) => {
  if (gate(t)) return;
  const owner = world.users.alice;
  const { firm, client } = await freshClient("6c");
  const plan = await plantPlan(firm, client, { state: "open", seed: "firm_template", user: owner });
  assert.equal((await chartState(client)).seed_decision_plan_state, "open",
    "mandatory setup: the open plan is reported before it is cancelled");

  await rootQuery(
    `update clara.onboarding_plans set state='cancelled', committed_at=null, committed_by=null,
        cancelled_at=now(), cancelled_by=$2, cancel_reason='DB-A rig cancel' where id=$1`, [plan, owner]);
  const r = await chartState(client);
  assert.equal(r.state, "undecided", "a withdrawn onboarding's answer is not a decision anybody stands behind");
  assert.equal(r.seed_decision, null);
  assert.equal(r.seed_decision_plan_state, null,
    "and a cancelled plan does not even report a plan state — it is not an onboarding in progress");
});

// =====================================================================================
// DBA-9 (裁-193) -- THE WALL. The face is dba6; this is the door.
// =====================================================================================

test("dba.9a 裁-193: apply_coa_template REFUSES onboarding_plan_open while the plan is open, and admits once it is committed", async (t) => {
  if (gate(t)) return;
  const owner = world.users.alice;
  const { firm, client } = await freshClient("9a");
  const tpl = (await rootQuery(
    "select id from clara.coa_templates where scope='platform' and state='published' order by version desc limit 1")).rows[0];
  assert.ok(tpl, "mandatory setup: the platform starter template is published");

  const plan = await plantPlan(firm, client, { state: "open", seed: "firm_template", user: owner });
  const refused = await caught(() => applyTemplate(owner, { client, template: tpl.id, opKey: `dba9a-open-${client}` }));
  assert.ok(refused, "the door REFUSES while the interview is still open — a UI that merely hid the button would not");
  assert.equal(JSON.parse(refused.detail ?? "{}").reason, "onboarding_plan_open",
    "by its own typed reason, not a generic error");
  assert.equal((await rootQuery(
    "select count(*)::int n from clara.coa_accounts where client_id=$1", [client])).rows[0].n, 0,
    "and nothing was planted — the rung refuses before the first write");

  // COMMIT the plan, and the SAME call now goes through. Without this the refusal could be
  // unconditional and the cell above would still pass.
  await rootQuery(
    `update clara.onboarding_plans set state='committed', committed_at=now(), committed_by=$2 where id=$1`,
    [plan, owner]);
  const ok = await applyTemplate(owner, { client, template: tpl.id, opKey: `dba9a-committed-${client}` });
  assert.ok(ok, "once committed, the apply proceeds exactly as before");
  assert.ok((await rootQuery(
    "select count(*)::int n from clara.coa_accounts where client_id=$1", [client])).rows[0].n > 0,
    "and the chart is planted");
});

test("dba.9c the rung refuses ONLY 'open': a CANCELLED plan is admitted and its chart is planted", async (t) => {
  if (gate(t)) return;
  const owner = world.users.alice;
  const { firm, client } = await freshClient("9c");
  const tpl = (await rootQuery(
    "select id from clara.coa_templates where scope='platform' and state='published' order by version desc limit 1")).rows[0];

  const plan = await plantPlan(firm, client, { state: "open", seed: "firm_template", user: owner });
  const refused = await caught(() => applyTemplate(owner, { client, template: tpl.id, opKey: `dba9c-open-${client}` }));
  assert.equal(JSON.parse(refused?.detail ?? "{}").reason, "onboarding_plan_open",
    "mandatory setup: the open plan really is what refuses");

  // CANCELLED is not an onboarding in progress. If the rung refused here, a withdrawn
  // onboarding would strand that client's chart permanently — the header claims it does not,
  // and this is the cell that holds the claim to it.
  await rootQuery(
    `update clara.onboarding_plans set state='cancelled', committed_at=null, committed_by=null,
        cancelled_at=now(), cancelled_by=$2, cancel_reason='dba9c cancel' where id=$1`, [plan, owner]);
  const ok = await applyTemplate(owner, { client, template: tpl.id, opKey: `dba9c-cancelled-${client}` });
  assert.ok(ok, "a CANCELLED plan is admitted — the rung refuses an interview in progress, not a withdrawn one");
  assert.ok((await rootQuery(
    "select count(*)::int n from clara.coa_accounts where client_id=$1", [client])).rows[0].n > 0,
    "and the chart is planted");
});

test("dba.9d THE TIE: an open and a committed plan sharing one created_at refuse — the tie-break resolves toward open, and the mutant that deletes it reds every run", async (t) => {
  if (gate(t)) return;
  const owner = world.users.alice;
  const { firm, client } = await freshClient("9d");
  const tpl = (await rootQuery(
    "select id from clara.coa_templates where scope='platform' and state='published' order by version desc limit 1")).rows[0];

  // Both plans share ONE created_at, which is the case "most recent" cannot decide — and it is
  // reachable in production, because now() is transaction-stable and a door that writes two
  // plans in one transaction stamps them identically. The committed row is given the HIGHER
  // uuid deliberately: `id desc` is the final ORDER BY term, so deleting `(state='open') desc`
  // makes the read pick 'committed' and ADMIT on EVERY run, not on half of them. That is what
  // makes this cell a deterministic mutant detector rather than a coin flip of its own.
  const [lo, hi] = (await rootQuery("select gen_random_uuid() a, gen_random_uuid() b")).rows
    .flatMap((r) => [r.a, r.b]).sort();
  const tie = new Date(Date.now() - 3600_000).toISOString();
  await plantPlan(firm, client, {
    state: "committed", seed: "firm_template", user: owner, id: hi, committedAt: tie, createdAt: tie });
  await plantPlan(firm, client, {
    state: "open", seed: "firm_template", user: owner, id: lo, createdAt: tie });

  // The fixture's own premise, asserted rather than assumed: the rows really do tie, and the
  // committed one really does hold the higher id. Without this the mutant could pass vacuously.
  // id::text collate "C" rather than max(id): uuid has no max() aggregate, and C collation is
  // byte order — the same order Postgres uses for uuid, and the same JS .sort() gave us above.
  const shape = (await rootQuery(
    `select count(distinct created_at)::int ties,
            (max(id::text collate "C") filter (where state='committed'))
              > (max(id::text collate "C") filter (where state='open')) as committed_is_higher
       from clara.onboarding_plans where client_id=$1 and scope_kind='client'`, [client])).rows[0];
  assert.equal(shape.ties, 1, "mandatory setup: both plans share exactly one created_at");
  assert.equal(shape.committed_is_higher, true, "mandatory setup: the committed row holds the higher uuid");

  const refused = await caught(() => applyTemplate(owner, { client, template: tpl.id, opKey: `dba9d-${client}` }));
  assert.equal(JSON.parse(refused?.detail ?? "{}").reason, "onboarding_plan_open",
    "a tie resolves toward the OPEN plan, so the door refuses rather than deciding at random");
  assert.equal((await rootQuery(
    "select count(*)::int n from clara.coa_accounts where client_id=$1", [client])).rows[0].n, 0,
    "and no chart was planted behind the refusal");
});

test("dba.9b a client with NO plan at all is unaffected — the rung refuses an open interview, never an absent one", async (t) => {
  if (gate(t)) return;
  const owner = world.users.alice;
  const { client } = await freshClient("9b");
  const tpl = (await rootQuery(
    "select id from clara.coa_templates where scope='platform' and state='published' order by version desc limit 1")).rows[0];
  const ok = await applyTemplate(owner, { client, template: tpl.id, opKey: `dba9b-${client}` });
  assert.ok(ok, "no plan, no refusal");
  assert.ok((await rootQuery(
    "select count(*)::int n from clara.coa_accounts where client_id=$1", [client])).rows[0].n > 0,
    "the chart is planted");
});

// =====================================================================================
// DBA-7 (CB-AE2E-004) -- THE OPENING-APPROVAL ISOLATION PIN, ABSOLUTE.
// =====================================================================================

test("dba.7a the serializable proconfig pin is in the MIGRATE path: both opening-approval regprocedures carry it, by exact signature", async (t) => {
  if (gate(t)) return;
  const r = await rootQuery(
    `select s as sig,
            (to_regprocedure(s) is not null) as resolves,
            coalesce((select coalesce(p.proconfig::text,'') from pg_proc p where p.oid=to_regprocedure(s)),'') as cfg
       from unnest(array['clara.approve_opening_seed(uuid,uuid,text,jsonb,text,text)',
                         'clara.approve_opening_correction(uuid,jsonb,text,text)']) s
      order by 1`);
  assert.equal(r.rowCount, 2, "both subjects come back — a census that silently drops a missing one proves nothing");
  for (const row of r.rows) {
    assert.equal(row.resolves, true, `${row.sig} resolves at its EXACT signature (spelling is not identity)`);
    assert.ok(row.cfg.includes("default_transaction_isolation=serializable"),
      `${row.sig} carries the pin — without it every opening approval through PostgREST refuses CLR31 not_serializable in the browser while the rig stays green`);
    assert.ok(row.cfg.includes("search_path"),
      `${row.sig} still carries its search_path pin beside the new one — an ALTER FUNCTION ... SET must not displace it`);
  }
});

test("dba.7b the in-body assert the pin exists FOR is still there — a pin on a body that no longer demands it would be an unexplained behaviour change", async (t) => {
  if (gate(t)) return;
  const r = await rootQuery(
    `select p.oid::regprocedure::text as sig, (position('not_serializable' in p.prosrc) > 0) as asserts
       from unnest(array['clara.approve_opening_seed(uuid,uuid,text,jsonb,text,text)',
                         'clara.approve_opening_correction(uuid,jsonb,text,text)']) s
       join pg_proc p on p.oid = s::regprocedure order by 1`);
  assert.equal(r.rowCount, 2);
  for (const row of r.rows) {
    assert.equal(row.asserts, true,
      `${row.sig} still raises not_serializable without the level — the reason the pin has to exist`);
  }
});
