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
import { rootQuery, asRuntime, asFnOwner, buildFirm, headSeq, checkpointSeq, deadLettersForFirm, endPool } from "./relay-fixtures.mjs";
import { seedVerifiedDocument } from "./matcher-testkit.mjs";
import { runFactsGateCycle, factsGateHealth, factsGateRedrive, CONSUMERS, FACTS_GATE_CONSUMER, FACTS_GATE_EVENT_TYPE } from "../lib/facts-gate.mjs";

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

after(async () => {
  await endPool();
});

// A verified pdf document with a known kind (the human/classifier verdict — set directly for the
// fixture; document metadata is not a books/event row). Returns the document id.
async function seedKnownKindDoc({ firm, owner, kind }) {
  const document = await seedVerifiedDocument({ firm, uploadedBy: owner });
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

test("cycle: an invoice-kind document.classified re-fires enqueue → an invoice_facts task is admitted; the checkpoint converges", { skip }, async () => {
  const { owner, firm } = await buildFirm("fgc");
  const document = await seedKnownKindDoc({ firm, owner, kind: "invoice" });
  await emitClassified(firm, document, owner);

  await drainFactsGate(firm);

  const rows = await factsTasks(document, "invoice_facts");
  assert.ok(rows.length >= 1, "the gate re-fired the enqueue onto the invoice_facts lane");
  assert.ok(rows.some((r) => ["queued", "held_egress", "running"].includes(r.status)), `an invoice_facts task is runnable (got: ${rows.map((r) => `${r.status}/${r.error_code}`).join(",")})`);
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
  assert.ok((await factsTasks(document, "invoice_facts")).length >= 1, "the enqueue re-fired on redrive");
});

test("redrive refuses when there is no facts_gate dead-letter", { skip }, async () => {
  const { owner, firm } = await buildFirm("fgc");
  const document = await seedKnownKindDoc({ firm, owner, kind: "invoice" });
  const { eventId } = await emitClassified(firm, document, owner);
  await assert.rejects(() => asRuntime((c) => factsGateRedrive(c, eventId)), /no dead-letter for consumer='facts_gate'/);
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
