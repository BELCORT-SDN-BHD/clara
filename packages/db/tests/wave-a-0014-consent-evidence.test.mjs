// Wave-A rig — first-class consent-evidence documents (0014). RPR's egress consent
// can now cite the REAL signed consent PDF (a genuine FK) WITHOUT dragging the legal
// letter into the bookkeeping pipeline: no filing, no coding task, and — structurally
// — no invoice-facts extraction (so the signed consent letter is never egressed
// cross-border). The bookkeeping provenance invariant (correct for invoices) stays
// pristine; the consent document simply rides in the event PAYLOAD, not the typed
// domain_events.document_id column.
//
// SKIPS (loudly, counted) until 0014 is applied — the marker is
// _enqueue_invoice_facts_core's source referencing 'consent_evidence' (a live catalog
// inspection, never a read of the migration file). Connection is env-only.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  waveAEnsureReady, buildWorld, firmOf, seedVerifiedDocument,
  grantClientEgress, revokeClientEgress,
  rootQuery, endPool, noteLane, markSkip, printSkipCount,
} from "./wave-a-fixtures.mjs";

let ready = false; // 0011 surface present
let has14 = false; // 0014 (consent_evidence) applied
let world = null;
let owner = null;

/** 0014 presence marker — the facts-enqueue helper structurally exempts consent
 *  evidence. Inspects the LIVE catalog only (never the migration file). */
async function has0014() {
  const r = await rootQuery(
    `select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
       where n.nspname='clara' and p.proname='_enqueue_invoice_facts_core'
         and position('consent_evidence' in p.prosrc) > 0 limit 1`,
  );
  return r.rows.length > 0;
}
function skip14(t) {
  if (!has14) {
    markSkip();
    t.skip("Wave-A.1 consent-evidence documents not present — 0014 not yet applied");
    return true;
  }
  return false;
}

async function liveConsent(client) {
  const r = await rootQuery(
    "select id, evidence_document_id from clara.client_egress_consents where client_id=$1 and revoked_at is null",
    [client]);
  return r.rows[0] ?? null;
}
async function docKind(doc) {
  const r = await rootQuery("select document_kind from clara.documents where id=$1", [doc]);
  return r.rows[0]?.document_kind ?? null;
}
async function factsTaskCount(doc) {
  const r = await rootQuery(
    "select count(*)::int n from clara.document_processing_tasks where document_id=$1 and lane='invoice_facts'",
    [doc]);
  return r.rows[0].n;
}
async function lastEvent(type, client) {
  const r = await rootQuery(
    "select document_id, payload from clara.domain_events where event_type=$1 and client_id=$2 order by seq desc limit 1",
    [type, client]);
  return r.rows[0] ?? null;
}

before(async () => {
  ready = await waveAEnsureReady();
  has14 = ready && (await has0014());
  if (!has14) {
    noteLane(ready ? "0014 not applied — consent_evidence marker absent" : "0011 surface absent");
    return;
  }
  world = await buildWorld();
  owner = world.users.alice; // the firm owner (grant_client_egress is OWNER-floored)
});
after(async () => { printSkipCount("wave-a-0014-consent-evidence"); await endPool(); });

test("grant citing an UNFILED verified firm document: real FK, doc stamped consent_evidence, NO facts task, event routes the doc via PAYLOAD (not the typed column)", async (t) => {
  if (skip14(t)) return;
  const client = world.clients.A2;
  const firm = await firmOf(client);
  await revokeClientEgress(owner, { client }).catch(() => {}); // normalize any prior consent
  const doc = await seedVerifiedDocument({ firm }); // client=null → UNFILED, no filing
  assert.equal(doc.filingId, null, "the consent-evidence document is UNFILED (no bookkeeping filing)");

  const r = await grantClientEgress(owner, {
    client, evidenceDocument: doc.documentId,
    scopeNote: "RPR cross-border document-processing consent (signed PDF)",
  });
  assert.equal(r.status, "live", "the grant is live");

  const live = await liveConsent(client);
  assert.ok(live, "a live consent row exists");
  assert.equal(live.evidence_document_id, doc.documentId, "the consent cites the REAL document (the FK the owner wanted)");
  assert.equal(await docKind(doc.documentId), "consent_evidence", "the cited document is stamped consent_evidence");
  assert.equal(await factsTaskCount(doc.documentId), 0, "NO invoice_facts task was enqueued on the consent letter");

  const ev = await lastEvent("egress.consent_granted", client);
  assert.ok(ev, "a consent_granted event exists");
  assert.equal(ev.document_id, null, "the event's typed document_id is NULL — the bookkeeping filing-history invariant does not apply to a legal artifact");
  assert.equal(ev.payload?.evidence_document_id, doc.documentId, "the event payload carries the evidence document");
});

test("revoke a doc-citing consent: succeeds (no filing-history CLR10) and routes the doc via payload", async (t) => {
  if (skip14(t)) return;
  const client = world.clients.A2;
  const firm = await firmOf(client);
  await revokeClientEgress(owner, { client }).catch(() => {});
  const doc = await seedVerifiedDocument({ firm });
  await grantClientEgress(owner, { client, evidenceDocument: doc.documentId, scopeNote: "consent" });

  const r = await revokeClientEgress(owner, { client, reason: "superseded" });
  assert.equal(r.status, "revoked", "the doc-citing consent revokes cleanly (the pre-0014 path would CLR10 here)");
  assert.equal(await liveConsent(client), null, "no live consent remains");

  const ev = await lastEvent("egress.consent_revoked", client);
  assert.equal(ev.document_id, null, "the revoke event's typed document_id is NULL");
  assert.equal(ev.payload?.evidence_document_id, doc.documentId, "the revoke event payload carries the evidence document");
});

test("citing a document already classified (e.g. an invoice) is REFUSED — you cannot cite a coded bill as consent evidence (CLR28)", async (t) => {
  if (skip14(t)) return;
  const client = world.clients.A1;
  const firm = await firmOf(client);
  await revokeClientEgress(owner, { client }).catch(() => {});
  const doc = await seedVerifiedDocument({ firm, kind: "invoice" }); // pre-classified, unfiled
  await assert.rejects(
    () => grantClientEgress(owner, { client, evidenceDocument: doc.documentId, scopeNote: "bad" }),
    (e) => e.code === "CLR28",
    "a document already classified as something else is refused (evidence_kind_conflict)");
  assert.equal(await docKind(doc.documentId), "invoice", "the pre-existing document_kind is not overwritten");
  assert.equal(await liveConsent(client), null, "the failed grant left no live consent (atomic rollback)");
});

test("_enqueue_invoice_facts_core structurally exempts a consent_evidence document (the signed letter is never egressed)", async (t) => {
  if (skip14(t)) return;
  const client = world.clients.A2;
  const firm = await firmOf(client);
  await revokeClientEgress(owner, { client }).catch(() => {});
  const doc = await seedVerifiedDocument({ firm });
  await grantClientEgress(owner, { client, evidenceDocument: doc.documentId, scopeNote: "consent" });
  // Even an EXPLICIT enqueue attempt is refused structurally.
  const res = await rootQuery("select clara._enqueue_invoice_facts_core($1) as r", [doc.documentId]);
  assert.equal(res.rows[0].r.status, "skipped_consent_evidence", "the consent letter is structurally exempt from facts extraction");
  assert.equal(await factsTaskCount(doc.documentId), 0, "no facts task exists even after an explicit enqueue attempt");
});
