// Wave A2.1 — the facts-gate consumer (lib/facts-gate.mjs), DB INTEGRATION. Proves the consumer
// reads real document.classified events and re-fires clara.enqueue_invoice_facts(document): an
// invoice-shaped kind admits the invoice_facts lane; a payroll_summary is held with a
// skipped_kind receipt (never a runnable invoice_facts task); the checkpoint converges. The
// enqueue gate itself is exhaustively proven in packages/db/tests/a21-classifier-gate.test.mjs —
// here we prove the CONSUMER WIRING end-to-end.
//
// Env from the ENVIRONMENT (rig.mjs throws otherwise); RELAY_TEST_MODE=1; serial. Row-scoped
// assertions, NEVER TRUNCATE. Group-role identity (asRuntime — this consumer has NO login dance).

process.env.RELAY_TEST_MODE ??= "1";

import { test, after } from "node:test";
import assert from "node:assert/strict";
import { rootQuery, humanQuery, asRuntime, asFnOwner, buildFirm, headSeq, checkpointSeq, deadLettersForFirm, endPool, ensureClassifyConsent, opk } from "./relay-fixtures.mjs";
import { seedVerifiedDocument, seedExtraction, seedRegion } from "./matcher-testkit.mjs";
import { runFactsGateCycle, factsGateHealth, factsGateRedrive, CONSUMERS, FACTS_GATE_CONSUMER, FACTS_GATE_EVENT_TYPE, FACTS_GATE_MAX_ATTEMPTS } from "../lib/facts-gate.mjs";
import { deadLetterCategory, relayFirmCategory } from "../lib/consumer-health.mjs";
import { liveWitnessConsent } from "./f-a1-witness-fixtures.mjs";

async function probe0016() {
  const r = await rootQuery(
    `select
       (select count(*)::int from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname='clara' and p.proname='enqueue_invoice_facts') as fn,
       (select count(*)::int from clara.event_types where name='document.classified') as ev`,
  );
  return Number(r.rows[0].fn) >= 1 && Number(r.rows[0].ev) === 1;
}
const HAS16 = await probe0016();
const skip = HAS16 ? false : "0016 facts-gate surface absent — migrate the target first";

async function probe0177() {
  const r = await rootQuery(
    `select position('awaiting_extraction' in p.prosrc) > 0 as gated
       from pg_proc p where p.oid='clara._enqueue_invoice_facts_core(uuid)'::regprocedure`,
  );
  return Boolean(r.rows[0]?.gated);
}
const HAS177 = HAS16 && (await probe0177());
const skip177 = HAS177 ? false : "0177 classify-after-extraction gate absent — migrate the target first";

after(async () => {
  await endPool();
});

// A verified pdf document with a known kind (the human/classifier verdict — set directly for the
// fixture; document metadata is not a books/event row). Returns the document id.
async function seedKnownKindDoc({ firm, owner, client = null, kind }) {
  const document = await seedVerifiedDocument({ firm, uploadedBy: owner, client });
  await rootQuery("update clara.documents set document_kind=$2 where id=$1", [document, kind]);
  return document;
}

// Emit ONE real document.classified (firm-level) via the audited _append_event helper.
async function emitClassified(firm, document, actor) {
  return asFnOwner(async (c) => {
    const s = await c.query(
      "select clara._append_event($1,'document.classified',null,$2,null,null,null,$3,null,'{}'::jsonb) as seq",
      [firm, actor, document],
    );
    const seq = Number(s.rows[0].seq);
    const e = await c.query("select id from clara.domain_events where firm_id=$1 and seq=$2", [firm, seq]);
    return { seq, eventId: e.rows[0].id };
  });
}

async function emitDocumentEvent(firm, document, actor, eventType) {
  return asFnOwner(async (c) => {
    const s = await c.query(
      "select clara._append_event($1,$2,null,$3,null,null,null,$4,null,'{}'::jsonb) as seq",
      [firm, eventType, actor, document],
    );
    return Number(s.rows[0].seq);
  });
}

async function drainFactsGate(firm) {
  return asRuntime(async (c) => {
    for (let i = 0; i < 30; i++) {
      await runFactsGateCycle(c, { onlyFirm: firm, batchSize: 50 });
      if ((await checkpointSeq(firm, FACTS_GATE_CONSUMER)) === (await headSeq(firm))) return;
    }
    throw new Error(`drainFactsGate: firm ${firm} did not converge to head`);
  });
}

const factsTasks = (doc, lane) =>
  rootQuery("select status, error_code from clara.document_processing_tasks where document_id=$1 and lane=$2 order by created_at", [doc, lane]).then(
    (r) => r.rows,
  );

test("cycle: an invoice-kind document.classified re-fires enqueue → an llm_witness task is admitted; the checkpoint converges", { skip }, async () => {
  // F-A1 PR-3 CUTOVER: the router's invoice-kind arm now mints llm_witness, never
  // invoice_facts (no dual-run, D9) -- the facts_gate consumer's own wiring (re-fire
  // clara.enqueue_invoice_facts) is unchanged; only the LANE the core routes to moved.
  const { owner, firm, client } = await buildFirm("fgc");
  // B3 (cross-model review): the llm_witness enqueue is consent-gated AT ENQUEUE (0090 wall
  // 6/§7e) on the document's ACTIVE FILING(S) -- give the document a real filing (client
  // passed to seedVerifiedDocument, routed through the audited _seed_verified_document
  // writer) and grant witness_extraction consent for that SAME client, so the enqueue
  // genuinely admits rather than failing closed on witness_consent_inactive. "failed" is not
  // an acceptable outcome here: this cell proves the consumer WIRING drives a real, live task.
  await liveWitnessConsent(owner, { firm, client });
  const document = await seedKnownKindDoc({ firm, owner, client, kind: "invoice" });
  await emitClassified(firm, document, owner);

  await drainFactsGate(firm);

  const rows = await factsTasks(document, "llm_witness");
  assert.ok(rows.length >= 1, "the gate re-fired the enqueue onto the llm_witness lane");
  assert.ok(rows.some((r) => ["queued", "held_egress", "running"].includes(r.status)), `an llm_witness task exists and is LIVE (got: ${rows.map((r) => `${r.status}/${r.error_code}`).join(",")})`);
  assert.equal(await checkpointSeq(firm, FACTS_GATE_CONSUMER), await headSeq(firm), "facts_gate checkpoint converged to head");
  assert.equal((await deadLettersForFirm(firm, FACTS_GATE_CONSUMER)).length, 0, "no facts_gate dead-letters");
});

test("cycle: a payroll_summary document.classified is HELD — a skipped_kind receipt, NEVER a runnable invoice_facts task (the classifier gate)", { skip }, async () => {
  const { owner, firm } = await buildFirm("fgc");
  const document = await seedKnownKindDoc({ firm, owner, kind: "payroll_summary" });
  await emitClassified(firm, document, owner);

  await drainFactsGate(firm);

  const rows = await factsTasks(document, "invoice_facts");
  assert.equal(rows.filter((r) => ["queued", "held_egress", "running", "done"].includes(r.status)).length, 0, "NO runnable invoice_facts task for a payroll_summary");
  assert.ok(rows.some((r) => r.status === "failed" && r.error_code === "skipped_kind"), `the gate left a skipped_kind receipt (got: ${rows.map((r) => `${r.status}/${r.error_code}`).join(",")})`);
  assert.equal(await checkpointSeq(firm, FACTS_GATE_CONSUMER), await headSeq(firm), "the checkpoint still converged (a terminal receipt is a success)");
});

test("cycle: a firm with ONLY non-target events advances the checkpoint without re-firing the enqueue", { skip }, async () => {
  const { firm } = await buildFirm("fgc");
  await drainFactsGate(firm);
  assert.equal(await checkpointSeq(firm, FACTS_GATE_CONSUMER), await headSeq(firm), "checkpoint walked to head over non-target events");
});

test("0177 ordering: filing waits for successful extraction; stale and duplicate events enqueue classify exactly once", { skip: skip177 }, async () => {
  const { owner, firm, client } = await buildFirm("fg177");
  const document = await seedVerifiedDocument({ firm, uploadedBy: owner });
  await ensureClassifyConsent(owner, { firm, client });
  await rootQuery(
    "insert into clara.document_filings(firm_id,document_id,client_id,filed_by,basis) values($1,$2,$3,$4,'legacy-0007')",
    [firm, document, client, owner],
  );

  const before = await asRuntime((c) => c.query("select clara.enqueue_invoice_facts($1) as r", [document]));
  assert.equal(before.rows[0].r.status, "awaiting_extraction");
  assert.equal((await factsTasks(document, "classify")).length, 0, "filing before extraction creates no classify task");

  await emitDocumentEvent(firm, document, owner, "document.classified");
  await drainFactsGate(firm);
  assert.equal((await factsTasks(document, "classify")).length, 0, "a spurious classified event cannot bypass OCR");

  await seedExtraction({ firm, document, status: "failed" });
  await emitDocumentEvent(firm, document, owner, "document.extraction_failed");
  await drainFactsGate(firm);
  assert.equal((await factsTasks(document, "classify")).length, 0, "a failed extraction never creates a classify task");

  const extraction = await seedExtraction({ firm, document, status: "done", versionN: 2 });
  await seedRegion({ firm, extraction, fieldPath: "body", textContent: "TAX INVOICE INV-177 TOTAL RM 100" });
  await emitDocumentEvent(firm, document, owner, "document.extraction_completed");
  await emitDocumentEvent(firm, document, owner, "document.extraction_completed");
  await drainFactsGate(firm);

  const tasks = await factsTasks(document, "classify");
  assert.equal(tasks.length, 1, "duplicate completion events converge on one classify task");
  assert.equal(tasks[0].status, "queued");
  assert.equal(await checkpointSeq(firm, FACTS_GATE_CONSUMER), await headSeq(firm));
});

test("0177 ordering: an already-extracted filing enqueues immediately and keeps the classify consent gate", { skip: skip177 }, async () => {
  const { owner, firm, client } = await buildFirm("fg177");
  const document = await seedVerifiedDocument({ firm, uploadedBy: owner });
  await rootQuery(
    "insert into clara.document_filings(firm_id,document_id,client_id,filed_by,basis) values($1,$2,$3,$4,'legacy-0007')",
    [firm, document, client, owner],
  );
  await seedExtraction({ firm, document, status: "done" });

  const blocked = await asRuntime((c) => c.query("select clara.enqueue_invoice_facts($1) as r", [document]));
  assert.equal(blocked.rows[0].r.status, "failed");
  assert.equal(blocked.rows[0].r.reason, "document_processing_consent_inactive");

  const consented = await seedVerifiedDocument({ firm, uploadedBy: owner });
  await rootQuery(
    "insert into clara.document_filings(firm_id,document_id,client_id,filed_by,basis) values($1,$2,$3,$4,'legacy-0007')",
    [firm, consented, client, owner],
  );
  await seedExtraction({ firm, document: consented, status: "done" });
  await ensureClassifyConsent(owner, { firm, client });
  const immediate = await asRuntime((c) => c.query("select clara.enqueue_invoice_facts($1) as r", [consented]));
  assert.equal(immediate.rows[0].r.status, "queued");
  assert.equal((await factsTasks(consented, "classify")).length, 1);
});

test("0177 downstream: duplicate and out-of-order post-classification events admit exactly one facts task", { skip: skip177 }, async () => {
  const { owner, firm, client } = await buildFirm("fg177");
  await liveWitnessConsent(owner, { firm, client });
  const document = await seedVerifiedDocument({ firm, uploadedBy: owner, client });
  await seedExtraction({ firm, document, status: "done" });
  await humanQuery(
    owner,
    "select clara.set_document_kind(p_document=>$1,p_kind=>'invoice',p_reason=>'focused 0177 downstream test',p_op_key=>$2)",
    [document, opk("fg177kind")],
  );

  // set_document_kind has set the actual kind and emitted document.classified. Deliver the
  // extraction-completed signal late, then deliver the classified event again.
  await emitDocumentEvent(firm, document, owner, "document.extraction_completed");
  await emitDocumentEvent(firm, document, owner, "document.classified");
  await drainFactsGate(firm);

  const downstream = await factsTasks(document, "llm_witness");
  assert.equal(downstream.length, 1, "duplicate and out-of-order events converge on one downstream facts task");
  assert.ok(["queued", "held_egress", "running"].includes(downstream[0].status));
  assert.equal(await checkpointSeq(firm, FACTS_GATE_CONSUMER), await headSeq(firm));
  assert.equal((await deadLettersForFirm(firm, FACTS_GATE_CONSUMER)).length, 0);
});

test("checkpoints are independent: the router pointer is untouched by a facts_gate run", { skip }, async () => {
  const { owner, firm } = await buildFirm("fgc");
  const document = await seedKnownKindDoc({ firm, owner, kind: "invoice" });
  await emitClassified(firm, document, owner);
  await drainFactsGate(firm);
  assert.equal(await checkpointSeq(firm, "router"), null, "the router's own pointer is untouched (it never ran)");
});

test("redrive: a seeded facts_gate dead-letter re-fires the enqueue and resolves", { skip }, async () => {
  const { owner, firm } = await buildFirm("fgc");
  const document = await seedKnownKindDoc({ firm, owner, kind: "invoice" });
  const { eventId } = await emitClassified(firm, document, owner);
  await rootQuery(
    `insert into clara.relay_dead_letters (consumer, event_id, reason, attempted_taxonomy_version)
       values ($1, $2, 'rig-seeded', null)`,
    [FACTS_GATE_CONSUMER, eventId],
  );
  const res = await asRuntime((c) => factsGateRedrive(c, eventId));
  assert.deepEqual({ resolved: res.resolved, consumer: res.consumer }, { resolved: true, consumer: FACTS_GATE_CONSUMER });
  const dl = (await deadLettersForFirm(firm, FACTS_GATE_CONSUMER)).find((d) => d.eventId === eventId);
  assert.equal(dl.status, "resolved", "the dead-letter is marked resolved");
  // F-A1 PR-3 CUTOVER: llm_witness, not invoice_facts (see the cycle test's own note above).
  assert.ok((await factsTasks(document, "llm_witness")).length >= 1, "the enqueue re-fired on redrive");
});

test("redrive refuses when there is no facts_gate dead-letter", { skip }, async () => {
  const { owner, firm } = await buildFirm("fgc");
  const document = await seedKnownKindDoc({ firm, owner, kind: "invoice" });
  const { eventId } = await emitClassified(firm, document, owner);
  await assert.rejects(() => asRuntime((c) => factsGateRedrive(c, eventId)), /no dead-letter for consumer='facts_gate'/);
});

// #617 — THE THREE CATEGORIES, AGAINST A REAL DATABASE.
//
// [#686 — 2026-09-09] These cells used to assert an ESTATE DELTA around their own work
// (`seeded.firmsUncheckpointed - before.firmsUncheckpointed === 1`), on the reasoning that an
// absolute estate number would be a fixture of whatever else had run. The delta is no better: CI
// runs `pnpm -r --if-present test`, i.e. the db, web and runtime suites CONCURRENTLY against ONE
// Postgres, and `clara.firm_event_seq` is shared by every consumer and every suite — so it was
// also counting firms another suite created between the two reads (wave-a's twin of this cell
// failed exactly that way on PR #686, `4 !== 1`). What IS deterministic is the PER-FIRM / PER-ROW
// category, so that is what these cells now prove, through the readers in lib/consumer-health.mjs:
// the same SQL text as the estate columns, over state no other suite can touch (their agreement is
// pinned in tests/consumer-health-readers.test.mjs). The estate counts keep only assertions that
// concurrent noise can STRENGTHEN, never break.

test("#617 health: a firm with events and NO checkpoint counts as UNCHECKPOINTED, not merely as lag", { skip }, async () => {
  // The WIRE SHAPE, pinned. #617 moved this query into lib/consumer-health.mjs, shared with
  // every other relay consumer; the fields and their ORDER are what /ready and its readers
  // actually see, so a future consolidation that renames, reorders or drops one fails HERE.
  const shape = await asRuntime((c) => factsGateHealth(c));
  assert.deepEqual(
    Object.keys(shape),
    ["consumer", "lag", "pendingDeadLetters", "firmsTracked", "firmsUncheckpointed", "deadLetters"],
    "factsGateHealth's field set and order",
  );
  const { owner, firm } = await buildFirm("fg617u");
  const document = await seedKnownKindDoc({ firm, owner, kind: "invoice" });
  await emitClassified(firm, document, owner);

  const seededFirm = await asRuntime((c) => relayFirmCategory(c, FACTS_GATE_CONSUMER, firm));
  assert.deepEqual(
    { hasEvents: seededFirm.hasEvents, checkpointed: seededFirm.checkpointed },
    { hasEvents: true, checkpointed: false },
    "a firm with events this consumer has never checkpointed is counted as NOT-YET-MEASURED — and is NOT in firmsTracked, the two being complements",
  );
  assert.equal(
    seededFirm.lag,
    await headSeq(firm),
    "while `lag` reads the missing checkpoint as last_seq 0 and reports the firm's ENTIRE history: exactly the ambiguity this category resolves",
  );
  const seeded = await asRuntime((c) => factsGateHealth(c));
  assert.ok(seeded.firmsUncheckpointed >= 1, "and the estate column carries it — a floor another suite's firms can only raise");

  // The discriminating half: run the consumer. The firm now HAS a checkpoint, so it leaves the
  // uncheckpointed category — while `lag` (which reads a missing checkpoint as last_seq 0) was
  // never able to tell the two states apart on its own.
  await drainFactsGate(firm);
  const drainedFirm = await asRuntime((c) => relayFirmCategory(c, FACTS_GATE_CONSUMER, firm));
  assert.deepEqual(
    { hasEvents: drainedFirm.hasEvents, checkpointed: drainedFirm.checkpointed, lag: drainedFirm.lag },
    { hasEvents: true, checkpointed: true, lag: 0 },
    "once checkpointed the firm leaves the not-yet-measured category and joins the tracked one, contributing nothing to lag (drainFactsGate converged to head)",
  );
  const drained = await asRuntime((c) => factsGateHealth(c));
  assert.ok(drained.firmsTracked >= 1, "which the estate's tracked count carries in turn");
});

test("#617 health: dead letters split into pending vs EXHAUSTED at this consumer's own cap", { skip }, async () => {
  const { owner, firm } = await buildFirm("fg617x");
  const document = await seedKnownKindDoc({ firm, owner, kind: "invoice" });
  const { eventId } = await emitClassified(firm, document, owner);
  await rootQuery(
    `insert into clara.relay_dead_letters (consumer, event_id, reason, attempted_taxonomy_version)
       values ($1, $2, 'rig-seeded #617', null)`,
    [FACTS_GATE_CONSUMER, eventId],
  );

  // BOUNDARY, from below. One attempt short of the cap the row is still inside its retry budget:
  // it counts as pending and NOT as exhausted. Without this arm the cell would pass for an
  // implementation that simply called every pending dead letter exhausted.
  await rootQuery("update clara.relay_dead_letters set attempt_count = $3 where consumer = $1 and event_id = $2", [
    FACTS_GATE_CONSUMER,
    eventId,
    FACTS_GATE_MAX_ATTEMPTS - 1,
  ]);
  assert.equal(
    await asRuntime((c) => deadLetterCategory(c, FACTS_GATE_CONSUMER, eventId, FACTS_GATE_MAX_ATTEMPTS)),
    "pending",
    "a pending dead letter one short of the cap is counted as pending and NOT as exhausted",
  );
  const retrying = await asRuntime((c) => factsGateHealth(c));
  assert.ok(retrying.deadLetters.pending >= 1, "and the estate backlog carries it");
  assert.equal(retrying.pendingDeadLetters, retrying.deadLetters.pending, "the compatibility field still mirrors the pending total");

  // AT the cap: retrying has stopped (processEvent skips past it and advances the checkpoint),
  // so it needs an operator redrive and is reported as its own category.
  await rootQuery("update clara.relay_dead_letters set attempt_count = $3 where consumer = $1 and event_id = $2", [
    FACTS_GATE_CONSUMER,
    eventId,
    FACTS_GATE_MAX_ATTEMPTS,
  ]);
  assert.equal(
    await asRuntime((c) => deadLetterCategory(c, FACTS_GATE_CONSUMER, eventId, FACTS_GATE_MAX_ATTEMPTS)),
    "exhausted",
    "at the cap the row is EXHAUSTED",
  );
  const exhausted = await asRuntime((c) => factsGateHealth(c));
  assert.ok(exhausted.deadLetters.exhausted >= 1, "and the estate's exhausted count carries it");
  assert.ok(
    exhausted.deadLetters.pending >= exhausted.deadLetters.exhausted,
    "an exhausted row is STILL pending — exhausted is a subset, so the two counts must not be subtracted from each other (exact: one snapshot)",
  );
});

test("registry + health: the facts_gate entry is group-runtime and health reports lag/dead-letters", { skip }, async () => {
  assert.equal(CONSUMERS.facts_gate.name, FACTS_GATE_CONSUMER);
  assert.equal(CONSUMERS.facts_gate.identity, "runtime-role");
  assert.equal(FACTS_GATE_EVENT_TYPE, "document.classified");
  const h = await asRuntime((c) => factsGateHealth(c));
  assert.equal(h.consumer, FACTS_GATE_CONSUMER);
  assert.equal(typeof h.lag, "number");
  assert.equal(typeof h.pendingDeadLetters, "number");
  assert.ok(h.lag >= 0 && h.pendingDeadLetters >= 0);
});
