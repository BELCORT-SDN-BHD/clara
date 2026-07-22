// Wave-A2 rig — the LANE-keyed egress gate + the lane↔engine DB CHECK (contract
// §3.4 + probes P1/P9). CONTRACT-BLIND: written straight from
// docs/plan/wave-a2-ar-myinvois-contract.md v1.0 §3.4 + migrations 0007/0009 (the
// as-built task DDL) — NEVER from 0015_ar_myinvois_rules.sql or its companion. The
// battery encodes the SPEC; a divergence between an expectation here and observed
// 0015 behavior is a FINDING for adjudication, never a silent test edit.
//
// The four load-bearing behaviors of §3.4:
//   1. lane += 'local_facts' (the new dedicated local facts lane).
//   2. a NEW DB CHECK binds lane↔engine: lane in ('ocr','invoice_facts') ⟹
//      engine_id LIKE 'azure-%'; lane in ('structured_parse','local_facts','none')
//      ⟹ 'clara-%'. A mis-declared pair REFUSES AT INSERT (not at claim).
//   3. local lanes (structured_parse, local_facts, none) claim WITHOUT a
//      kill-switch or consent hold — they cannot egress.
//   4. egressing lanes (ocr, invoice_facts) STILL hold under kill-switch/consent
//      (byte-identical to as-built — the regression guard).
//
// Skips (loudly, counted) until the 0015 lane surface is live — the marker is the
// live lane CHECK admitting 'local_facts' (a catalog inspection, never a file read).

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  rootQuery, endPool, printLaneNotes, noteLane, printSkipCount, markSkip,
  waveAEnsureReady, buildWorld, firmOf, seedVerifiedDocument, seedCitedDocument,
  enqueueInvoiceFacts, invoiceFactsTask, claimTask, grantConsent, revokeClientEgress,
} from "./wave-a-fixtures.mjs";

let ready = false; // 0011 surface present
let has15 = false; // 0015 lane surface present (lane CHECK admits 'local_facts')
let world = null;

/** 0015 lane marker — the document_processing_tasks lane CHECK admits 'local_facts'.
 *  Inspects the LIVE catalog only (never the migration file). */
async function has0015Lane() {
  const r = await rootQuery(
    `select 1 from pg_constraint c
       join pg_class t on t.oid=c.conrelid join pg_namespace n on n.oid=t.relnamespace
      where n.nspname='clara' and t.relname='document_processing_tasks' and c.contype='c'
        and pg_get_constraintdef(c.oid) ilike '%local_facts%' limit 1`,
  );
  return r.rows.length > 0;
}
function skip15(t) {
  if (!has15) { markSkip(); t.skip("Wave-A2 lane surface not present — 0015 lane CHECK absent"); return true; }
  return false;
}

/** Raw-insert a QUEUED processing task (root; superuser bypasses RLS, the CHECK
 *  constraints still fire). status='queued' ⇒ workflow_run_id/started_at null
 *  satisfy the binding CHECK. Returns the new task id, or throws the CHECK error. */
async function insertTask({ firm, document, lane, engineId, versionN = 1 }) {
  const r = await rootQuery(
    `insert into clara.document_processing_tasks
       (firm_id, document_id, engine_id, engine_config, version_n, lane, status)
     values ($1,$2,$3,'{}'::jsonb,$4,$5,'queued') returning id`,
    [firm, document, engineId, versionN, lane],
  );
  return r.rows[0].id;
}
async function taskStatus(taskId) {
  const r = await rootQuery("select status from clara.document_processing_tasks where id=$1", [taskId]);
  return r.rows[0]?.status ?? null;
}

before(async () => {
  ready = await waveAEnsureReady();
  has15 = ready && (await has0015Lane());
  if (has15) world = await buildWorld();
  else noteLane(ready ? "0015 lane CHECK (local_facts) absent — lane-gate suite skipped" : "0011 surface absent");
});
after(async () => { printLaneNotes("wave-a2-lane-gate"); printSkipCount("wave-a2-lane-gate"); await endPool(); });

// ===========================================================================
// The lane vocabulary + the lane↔engine CHECK exist (shape).
// ===========================================================================

test("§3.4 the document_processing_tasks lane CHECK admits 'local_facts' (the new local facts lane)", async (t) => {
  if (skip15(t)) return;
  const defs = await rootQuery(
    `select pg_get_constraintdef(c.oid) as def from pg_constraint c
       join pg_class t on t.oid=c.conrelid join pg_namespace n on n.oid=t.relnamespace
      where n.nspname='clara' and t.relname='document_processing_tasks' and c.contype='c'`,
  );
  const all = defs.rows.map((x) => x.def).join(" ~~ ");
  for (const l of ["ocr", "structured_parse", "none", "invoice_facts", "local_facts"]) {
    assert.ok(all.includes(`'${l}'`), `lane CHECK admits '${l}' (got: ${all.slice(0, 400)})`);
  }
});

test("§3.4 a lane↔engine CHECK binds lane to the engine prefix (references engine_id AND azure/clara)", async (t) => {
  if (skip15(t)) return;
  const defs = await rootQuery(
    `select pg_get_constraintdef(c.oid) as def from pg_constraint c
       join pg_class t on t.oid=c.conrelid join pg_namespace n on n.oid=t.relnamespace
      where n.nspname='clara' and t.relname='document_processing_tasks' and c.contype='c'`,
  );
  const bound = defs.rows.map((x) => x.def).find((d) => /engine_id/i.test(d) && /azure/i.test(d) && /clara/i.test(d));
  assert.ok(bound, `a CHECK binds lane→engine prefix (azure-% for egress lanes, clara-% for local) — defs: ${defs.rows.map((x) => x.def).join(" ~~ ").slice(0, 500)}`);
});

// ===========================================================================
// Behavioral: a mis-declared (lane, engine) pair REFUSES AT INSERT (probe P1).
// ===========================================================================

test("P1 matching (lane, engine) pairs INSERT; mis-declared pairs REFUSE at insert (23514), not at claim", async (t) => {
  if (skip15(t)) return;
  const firm = await firmOf(world.clients.A1);
  // Distinct documents so the unique(document_id,engine_id,version_n) never collides.
  const docFor = async () => (await seedVerifiedDocument({ firm })).documentId;

  // MATCHING pairs must be accepted.
  const ok = [
    { lane: "local_facts", engineId: "clara-myinvois:v1" },
    { lane: "structured_parse", engineId: "clara-structured:v1" },
    { lane: "invoice_facts", engineId: "azure-di:prebuilt-invoice:2024-11-30" },
    { lane: "ocr", engineId: "azure-di:prebuilt-layout:4.0" },
  ];
  for (const p of ok) {
    const doc = await docFor();
    const id = await insertTask({ firm, document: doc, lane: p.lane, engineId: p.engineId });
    assert.ok(id, `a matching pair (${p.lane}, ${p.engineId}) is accepted`);
  }

  // MIS-DECLARED pairs must REFUSE at insert with a check violation (23514).
  const bad = [
    { lane: "local_facts", engineId: "azure-di:prebuilt-invoice:2024-11-30" }, // local lane, azure engine
    { lane: "invoice_facts", engineId: "clara-myinvois:v1" },                  // egress lane, clara engine
    { lane: "structured_parse", engineId: "azure-di:prebuilt-layout:4.0" },    // local lane, azure engine
    { lane: "ocr", engineId: "clara-structured:v1" },                          // egress lane, non-fixture clara engine (clara-fixture:% is the DECLARED test-namespace escape, admitted on any lane by ck_processing_task_lane_engine_0015 — so finalize_document_intake's clara-fixture:v1 default on lane='ocr' and the OCR-authz fixtures work; a non-fixture clara engine on an egress lane still REFUSES)
  ];
  for (const p of bad) {
    const doc = await docFor();
    await assert.rejects(
      () => insertTask({ firm, document: doc, lane: p.lane, engineId: p.engineId }),
      (e) => e.code === "23514",
      `a mis-declared pair (${p.lane}, ${p.engineId}) REFUSES at insert with 23514 (the lane↔engine CHECK)`,
    );
  }
});

// ===========================================================================
// Behavioral: local lanes claim WITHOUT a hold; egress lanes STILL hold.
// ===========================================================================

test("P9 a local_facts task CLAIMS to running with kill-switch OFF and ZERO consent (no egress ⇒ no hold)", async (t) => {
  if (skip15(t)) return;
  const firm = await firmOf(world.clients.A1);
  // Ensure the client is UNCONSENTED so we prove the local lane skips the consent gate.
  await revokeClientEgress(world.users.alice, { client: world.clients.A1 }).catch(() => {});
  const doc = await seedVerifiedDocument({ firm, mime: "application/xml" });
  const task = await insertTask({ firm, document: doc.documentId, lane: "local_facts", engineId: "clara-myinvois:v1" });
  await claimTask(task, { egressApproved: false }).catch((e) => noteLane(`local_facts claim raised ${e.code} (${e.message}) — a local lane should never hold; inspect`));
  assert.equal(await taskStatus(task), "running", "a local_facts task runs even with the kill-switch OFF and no consent (it cannot egress)");
});

test("P9 a structured_parse task CLAIMS to running with kill-switch OFF (freed from the kill-switch — the DECLARED §3.4 change)", async (t) => {
  if (skip15(t)) return;
  const firm = await firmOf(world.clients.A2);
  const doc = await seedVerifiedDocument({ firm });
  const task = await insertTask({ firm, document: doc.documentId, lane: "structured_parse", engineId: "clara-structured:v1" });
  await claimTask(task, { egressApproved: false }).catch((e) => noteLane(`structured_parse claim raised ${e.code} — §3.4 frees it from the kill-switch; inspect`));
  assert.equal(await taskStatus(task), "running", "a structured_parse task runs with the kill-switch OFF (local, never egresses)");
});

test("regression: an invoice_facts task with kill-switch ON but NO consent STILL HOLDS (egress lane unchanged)", async (t) => {
  if (skip15(t)) return;
  const firm = await firmOf(world.clients.A2);
  await revokeClientEgress(world.users.alice, { client: world.clients.A2 }).catch(() => {});
  // 0016 (P3): classify-first gate — kind-stamped at seed so invoice_facts engages directly.
  const cited = await seedCitedDocument(world.users.alice, { firm, client: world.clients.A2, kind: "invoice" });
  await enqueueInvoiceFacts(cited.documentId);
  const task = await invoiceFactsTask(cited.documentId);
  await claimTask(task.id, { egressApproved: true }).catch(() => null);
  assert.notEqual(await taskStatus(task.id), "running", "an unconsented invoice_facts task never runs — the egress lane still holds (§3.4 unchanged)");
  assert.equal(await taskStatus(task.id), "held_egress", "the egress lane holds at held_egress");
});

test("regression: an invoice_facts task with live consent BUT kill-switch OFF STILL HOLDS (both gates independent)", async (t) => {
  if (skip15(t)) return;
  const firm = await firmOf(world.clients.A1);
  await grantConsent(world.users.alice, { firm, client: world.clients.A1 }).catch(() => {});
  // 0016 (P3): classify-first gate — kind-stamped at seed so invoice_facts engages directly.
  const cited = await seedCitedDocument(world.users.alice, { firm, client: world.clients.A1, kind: "invoice" });
  await enqueueInvoiceFacts(cited.documentId);
  const task = await invoiceFactsTask(cited.documentId);
  await claimTask(task.id, { egressApproved: false }).catch(() => null);
  assert.notEqual(await taskStatus(task.id), "running", "kill-switch OFF still holds the egress lane even with consent");
});
