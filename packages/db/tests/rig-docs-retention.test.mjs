// Slice-5 rig — DOCUMENT PIPELINE part 8: RETENTION + LEGAL HOLD (S5-R9,
// companion §4.7 / §3.0). Contract-blind. Laws: unanchored (retain_until NULL only
// before the FIRST anchor; retention_state governs deletability) → anchored (FY-end
// + filing offset + 7y) → MAX across active filings' clocks; floor-never-shorten is
// STRUCTURAL — retain_until PERSISTS across unanchor→re-anchor and a recompute is
// MAX(current, new); last-filing-retired returns to unanchored (clock preserved);
// place/release_legal_hold are admin+floor, reason-required, audited, and
// clock-INDEPENDENT.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  ROLES,
  PG,
  assertRaises,
  rootQuery,
  roleQuery,
  ensureReady,
  docsReady,
  buildWorld,
  endPool,
  printLaneNotes,
  freshResolution,
  seedVerifiedDocument,
  fileDocument,
  retireDocumentFiling,
  placeLegalHold,
  releaseLegalHold,
  documentRow,
  activeFilings,
} from "./rig-docs-fixtures.mjs";

let ready = false;
let world = null;

before(async () => {
  await ensureReady();
  ready = await docsReady();
  if (ready) world = await buildWorld();
});
after(async () => {
  printLaneNotes("retention");
  await endPool();
});

function unready(t) {
  if (!ready) { t.skip("Slice-5 document pipeline not present — 0007 not yet applied"); return true; }
  return false;
}

async function firmOf(client) {
  return (await rootQuery("select firm_id from clara.clients where id = $1", [client])).rows[0].firm_id;
}

async function fileTo(sub, document, client) {
  const filing = await fileDocument(sub, { document, client, resolution: await freshResolution(sub, client) });
  const active = (await activeFilings(document)).find((f) => f.client_id === client);
  return filing ?? active.id;
}

// ===========================================================================
// §4.7 — the anchor lifecycle + MAX-across-filings + persistent floor.
// ===========================================================================

test("§4.7 unanchored → anchored on first filing; a second filing never SHORTENS retain_until (MAX across active filings)", async (t) => {
  if (unready(t)) return;
  const { users, clients } = world;
  const firm = await firmOf(clients.A1);
  const { documentId } = await seedVerifiedDocument({ firm });

  const pre = await documentRow(documentId);
  assert.equal(pre.retention_state, "unanchored", "a freshly-minted document is unanchored");
  assert.equal(pre.retain_until ?? null, null, "retain_until is NULL only before the FIRST anchor");

  await fileTo(users.alice, documentId, clients.A1);
  const anchored = await documentRow(documentId);
  assert.equal(anchored.retention_state, "anchored", "the first filing anchors the document");
  const afterFirst = anchored.retain_until;
  assert.ok(afterFirst != null, "retain_until is set once anchored");

  await fileTo(users.alice, documentId, clients.A2);
  const afterSecond = await documentRow(documentId);
  assert.ok(afterSecond.retain_until >= afterFirst, "a second filing never SHORTENS retain_until (MAX across active filings' clocks)");
});

test("§4.7 floor-never-shorten across unanchor → re-anchor: the value PERSISTS and re-anchor never drops below it", async (t) => {
  if (unready(t)) return;
  const { users, clients } = world;
  const firm = await firmOf(clients.A1);
  const { documentId } = await seedVerifiedDocument({ firm });

  const filing = await fileTo(users.alice, documentId, clients.A1);
  const anchored = await documentRow(documentId);
  const floor = anchored.retain_until;

  // Unanchor (retire the only filing) — the value persists; state governs deletability.
  const row = (await activeFilings(documentId)).find((f) => f.id === filing) ?? (await activeFilings(documentId))[0];
  await retireDocumentFiling(users.alice, { filing, reason: "rig unanchor", expectedRevision: row.revision_token });
  const unanchored = await documentRow(documentId);
  assert.equal(unanchored.retention_state, "unanchored", "retiring the last filing returns to unanchored");
  assert.equal(unanchored.retain_until, floor, "the retain_until value PERSISTS across unanchor (structural floor, §4.7)");

  // Re-anchor — the recompute is MAX(current floor, new clock), never below the floor.
  await fileTo(users.alice, documentId, clients.A1);
  const reanchored = await documentRow(documentId);
  assert.equal(reanchored.retention_state, "anchored", "re-filing re-anchors");
  assert.ok(reanchored.retain_until >= floor, "re-anchor never drops below the persisted floor");
});

// ===========================================================================
// §4.7 — legal hold: audited, floored, clock-independent.
// ===========================================================================

test("§4.7 place_legal_hold sets the hold + reason, audits it, and holds regardless of the clock; release clears the flag but keeps the floor", async (t) => {
  if (unready(t)) return;
  const { users, clients } = world;
  const firm = await firmOf(clients.A1);
  const { documentId } = await seedVerifiedDocument({ firm }); // unanchored — the hold is clock-INDEPENDENT

  await placeLegalHold(users.alice, { document: documentId, reason: "litigation hold rig" });
  const held = await documentRow(documentId);
  assert.equal(held.legal_hold, true, "the legal hold is set");
  assert.ok((held.legal_hold_reason ?? "").length > 0, "a reason is recorded (required)");
  const audit = await rootQuery("select count(*)::int as n from clara.audit_log where firm_id=$1 and fn='place_legal_hold'", [firm]);
  assert.ok(audit.rows[0].n >= 1, "place_legal_hold wrote an audit_log row");

  // Held → undeletable even as superuser, even though it's unanchored (clock-independent).
  await assert.rejects(() => rootQuery("delete from clara.documents where id=$1", [documentId]), "a held document is undeletable");

  await releaseLegalHold(users.alice, { document: documentId, reason: "hold lifted" });
  const released = await documentRow(documentId);
  assert.equal(released.legal_hold, false, "release clears the hold flag");
  const audit2 = await rootQuery("select count(*)::int as n from clara.audit_log where firm_id=$1 and fn='release_legal_hold'", [firm]);
  assert.ok(audit2.rows[0].n >= 1, "release_legal_hold wrote an audit_log row");
});

test("§3.10 legal-hold writers are human-only: the agent lane cannot place a hold", async (t) => {
  if (unready(t)) return;
  const { clients } = world;
  const firm = await firmOf(clients.A1);
  const { documentId } = await seedVerifiedDocument({ firm });
  await assertRaises(PG.insufficientPrivilege, () => roleQuery(ROLES.agentRo, "select clara.place_legal_hold(p_document => $1, p_reason => 'x', p_op_key => 'x')", [documentId]), "agent EXECUTE place_legal_hold");
});
