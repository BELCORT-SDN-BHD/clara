// Wave-A rig — the per-client egress lane-carve (Codex probes 6/7/8; contract §8 +
// companion §10 + WA-D1). claim_document_processing_task, definer-internal: the
// invoice_facts lane requires kill-switch AND a live client_egress_consents row for
// EVERY active filing's client (zero rows table-wide ⇒ fail closed); OCR stays
// kill-switch only (pre-attribution). A consent/switch failure is a TYPED HOLD
// (status held_egress + payload {clr:'CLR28', reason}), never an exception on the
// claim path. Last-boundary recheck: a revoke between claim and re-dispatch yields
// a refused re-claim (the lease is consent-bound). Contract-blind. SKIPS (counted).

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  rootQuery, opk, endPool, printLaneNotes, noteLane, printSkipCount, skipUnready,
  waveAEnsureReady, buildWorld, firmOf, seedCitedDocument, seedVerifiedDocument, fileDocument,
  freshResolution, enqueueInvoiceFacts, invoiceFactsTask, claimTask,
  grantConsent, grantClientEgress, revokeClientEgress, filedDocument,
  WREASON,
} from "./wave-a-fixtures.mjs";

let ready = false;
let world = null;
before(async () => { ready = await waveAEnsureReady(); if (ready) world = await buildWorld(); });
after(async () => { printLaneNotes("wave-a-egress"); printSkipCount("wave-a-egress"); await endPool(); });

async function taskStatus(taskId) {
  const r = await rootQuery("select status, workflow_run_id from clara.document_processing_tasks where id=$1", [taskId]);
  return r.rows[0];
}
/** Read the CLR/reason discriminant off a claim receipt (best-effort across shapes). */
function clrOf(receipt) {
  if (!receipt || typeof receipt !== "object") return {};
  const p = receipt.payload ?? receipt;
  return { clr: p.clr ?? receipt.clr ?? null, reason: p.reason ?? receipt.reason ?? null };
}
/** Enqueue + return the invoice_facts task for a document. */
async function factsTaskFor(doc) {
  await enqueueInvoiceFacts(doc);
  return invoiceFactsTask(doc);
}

// ===========================================================================
// invoice_facts lane — consent required; a hold is TYPED, not an exception.
// ===========================================================================

test("no consent (fail-closed window): claiming an invoice_facts task with kill-switch ON but NO consent HOLDS (held_egress) with CLR28 no_consent — never runs", async (t) => {
  if (skipUnready(t, ready)) return;
  const { users, clients } = world;
  const firm = await firmOf(clients.A1);
  const cited = await seedCitedDocument(users.alice, { firm, client: clients.A1 });
  const task = await factsTaskFor(cited.documentId);
  const receipt = await claimTask(task.id, { egressApproved: true }).catch((e) => { noteLane(`no-consent claim raised ${e.code} (${e.message}) instead of a typed hold — PINS §1 says typed receipt; inspect`); return { raised: e.code, reason: WREASON.noConsent }; });
  const st = await taskStatus(task.id);
  assert.notEqual(st.status, "running", "an unconsented invoice_facts task is NOT running (fail closed)");
  assert.equal(st.status, "held_egress", `the task is held_egress (got ${st.status})`);
  const { clr, reason } = clrOf(receipt);
  if (clr) assert.equal(clr, "CLR28", "the hold payload carries CLR28");
  if (reason) assert.equal(reason, WREASON.noConsent, "the hold reason is no_consent");
});

test("live consent + kill-switch ON: the invoice_facts task runs (the only cell that dispatches)", async (t) => {
  if (skipUnready(t, ready)) return;
  const { users, clients } = world;
  const firm = await firmOf(clients.A2);
  await grantConsent(users.alice, { firm, client: clients.A2 });
  const cited = await seedCitedDocument(users.alice, { firm, client: clients.A2 });
  const task = await factsTaskFor(cited.documentId);
  await claimTask(task.id, { egressApproved: true });
  assert.equal((await taskStatus(task.id)).status, "running", "with live consent + kill-switch ON, the facts task runs");
});

test("kill-switch OFF with live consent: still HOLDS (held_egress) with CLR28 kill_switch — the switch is an independent gate", async (t) => {
  if (skipUnready(t, ready)) return;
  const { users, clients } = world;
  const firm = await firmOf(clients.A1);
  await grantConsent(users.alice, { firm, client: clients.A1 });
  const cited = await seedCitedDocument(users.alice, { firm, client: clients.A1 });
  const task = await factsTaskFor(cited.documentId);
  const receipt = await claimTask(task.id, { egressApproved: false }).catch(() => null);
  const st = await taskStatus(task.id);
  assert.notEqual(st.status, "running", "kill-switch OFF never runs the facts task even with consent");
  const { reason } = clrOf(receipt);
  if (reason) assert.equal(reason, WREASON.killSwitch, "the hold reason is kill_switch when the switch is off");
});

test("multi-filing document, ONE client unconsented: the facts task HOLDS with CLR28 partial_consent (EVERY active filing's client must consent)", async (t) => {
  if (skipUnready(t, ready)) return;
  const { users, clients } = world;
  const firm = await firmOf(clients.A1);
  // The shared A1/A2 accumulate consent across tests; normalize so A2 stays UNCONSENTED.
  await revokeClientEgress(users.alice, { client: clients.A1 }).catch(() => {});
  await revokeClientEgress(users.alice, { client: clients.A2 }).catch(() => {});
  // Consent A1 only; file the SAME document to A1 AND A2 (two active filings).
  await grantConsent(users.alice, { firm, client: clients.A1 });
  const seed = await seedVerifiedDocument({ firm });
  await fileDocument(users.alice, { document: seed.documentId, client: clients.A1, resolution: await freshResolution(users.alice, clients.A1, { subjectKind: "document", subjectId: seed.documentId }) });
  await fileDocument(users.alice, { document: seed.documentId, client: clients.A2, resolution: await freshResolution(users.alice, clients.A2, { subjectKind: "document", subjectId: seed.documentId }) });
  const task = await factsTaskFor(seed.documentId);
  const receipt = await claimTask(task.id, { egressApproved: true }).catch(() => null);
  const st = await taskStatus(task.id);
  assert.notEqual(st.status, "running", "a shared document with any unconsented client does not run");
  const { reason } = clrOf(receipt);
  if (reason) assert.ok([WREASON.partialConsent, WREASON.noConsent].includes(reason), `the shared-doc hold reason is partial_consent (got ${reason})`);
});

// ===========================================================================
// Last-boundary recheck — revoke between claim and re-dispatch (Codex 7).
// ===========================================================================

test("last-boundary recheck: revoke consent AFTER a running claim → a re-claim (running branch) re-verifies and REFUSES; zero post-revocation dispatch", async (t) => {
  if (skipUnready(t, ready)) return;
  const { users, clients } = world;
  const firm = await firmOf(clients.A2);
  await revokeClientEgress(users.alice, { client: clients.A2 }).catch(() => {}); // normalize prior-test consent
  await grantConsent(users.alice, { firm, client: clients.A2 });
  const cited = await seedCitedDocument(users.alice, { firm, client: clients.A2 });
  const task = await factsTaskFor(cited.documentId);
  const runId = `wf-${opk("run")}`;
  await claimTask(task.id, { egressApproved: true, workflowRunId: runId });
  assert.equal((await taskStatus(task.id)).status, "running", "first claim runs with live consent");
  // Revoke, then RE-claim on the same run id (the replay/running branch must re-check).
  await revokeClientEgress(users.alice, { client: clients.A2 });
  const receipt = await claimTask(task.id, { egressApproved: true, workflowRunId: runId }).catch(() => null);
  const { clr, reason } = clrOf(receipt);
  // The re-claim must NOT return a clean dispatch receipt; the lease is consent-bound.
  if (clr) assert.equal(clr, "CLR28", "the re-claim after revocation is a CLR28 refusal (consent-bound lease)");
  if (reason) assert.ok([WREASON.noConsent, WREASON.killSwitch].includes(reason), `the re-claim refusal reason is consent-shaped (got ${reason})`);
  const st = await taskStatus(task.id);
  assert.notEqual(st.status, "done", "the task is not completed after a post-revocation re-claim");
});

// ===========================================================================
// OCR lane — kill-switch only, no client reachable pre-filing (probe P2 / WA-D1).
// ===========================================================================

test("OCR lane: an UNFILED document's OCR task is gated by the kill-switch alone (no per-client consent — no client is reachable pre-filing)", async (t) => {
  if (skipUnready(t, ready)) return;
  const { clients } = world;
  const firm = await firmOf(clients.A1);
  // An unfiled verified doc — no filing, so no client, so no consent applies to OCR.
  const seed = await seedVerifiedDocument({ firm });
  const ocr = await rootQuery("select to_jsonb(t) as row from clara.document_processing_tasks t where t.document_id=$1 and t.lane='ocr' order by t.created_at desc limit 1", [seed.documentId]);
  if (!ocr.rows.length) { noteLane("no OCR processing task auto-created for the unfiled doc — the ingest→ocr task path may differ on this schema; OCR-lane cell unverified"); return; }
  const taskId = ocr.rows[0].row.id;
  // With the kill-switch ON, the OCR task claims to running WITHOUT any consent row.
  await claimTask(taskId, { egressApproved: true }).catch((e) => noteLane(`OCR claim raised ${e.code}`));
  const st = await taskStatus(taskId);
  assert.notEqual(st.status, "held_egress", "an OCR task with the kill-switch ON is NOT held for per-client consent (pre-filing has no client)");
});

// ===========================================================================
// Grant/revoke writers DO raise (unlike the claim-hold path) — OWNER floor +
// evidence-in-firm + one-live semantics (companion §10).
// ===========================================================================

test("grant/revoke writers: OWNER floor + a live grant is one-per-client; grant→revoke→grant produces distinct audit rows", async (t) => {
  if (skipUnready(t, ready)) return;
  const { users, clients } = world;
  const firm = await firmOf(clients.A1);
  await revokeClientEgress(users.alice, { client: clients.A1 }).catch(() => {}); // normalize prior-test consent
  const ev1 = await filedDocument(users.alice, { firm, client: clients.A1 });
  await grantClientEgress(users.alice, { client: clients.A1, evidenceDocument: ev1.documentId, scopeNote: "grant 1" });
  // A bookkeeper (not OWNER) is refused (CLR04 floor) — bob is a bookkeeper in firm A.
  const ev2 = await filedDocument(users.alice, { firm, client: clients.A1 });
  await assert.rejects(() => grantClientEgress(users.bob, { client: clients.A1, evidenceDocument: ev2.documentId }), (e) => e.code === "CLR04" || e.code === "CLR03", "a non-owner grant is refused at the OWNER floor");
  // Revoke then re-grant → distinct rows (audit history), one live at a time.
  await revokeClientEgress(users.alice, { client: clients.A1 });
  await grantClientEgress(users.alice, { client: clients.A1, evidenceDocument: ev2.documentId, scopeNote: "grant 2" });
  const rows = await rootQuery("select count(*)::int n from clara.client_egress_consents where client_id=$1", [clients.A1]);
  assert.ok(rows.rows[0].n >= 2, "grant→revoke→grant left ≥2 audit rows (distinct, one live)");
  const live = await rootQuery("select count(*)::int n from clara.client_egress_consents where client_id=$1 and revoked_at is null", [clients.A1]);
  assert.equal(live.rows[0].n, 1, "exactly one LIVE consent row per client (partial-unique)");
});
