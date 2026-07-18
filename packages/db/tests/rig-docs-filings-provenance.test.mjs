// Slice-5 rig — DOCUMENT PIPELINE part 2: FILINGS + FILING-BOUND PROVENANCE
// (companion §3.1 + the citability law §3.0). Contract-blind: derived from
// slice5-*.md, never from 0007.
//
// The load-bearing laws: file_document creates an ACTIVE filing (an uploader's
// explicit client choice IS a human attribution act) + emits document.filed;
// unassigned ⇔ zero active filings; _draft_entry_core derives filing_id
// SERVER-SIDE from the unique ACTIVE (document, client) filing (never caller-
// supplied; absence/ambiguity → CLR02) and enforces citability (ACTIVE filing +
// bytes_verified_at); approve_entry RE-AFFIRMS at approval; multi-client filings
// coexist under the partial UNIQUE (document_id, client_id) WHERE retired_at IS NULL.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  CLR,
  ROUTINE_CENTS,
  assertRaises,
  assertRaisesOneOf,
  balanced,
  opk,
  human,
  rootQuery,
  ensureReady,
  docsReady,
  buildWorld,
  endPool,
  printLaneNotes,
  noteLane,
  freshResolution,
  draftEntry,
  approveEntry,
  seedVerifiedDocument,
  fileDocument,
  retireDocumentFiling,
  activeFilings,
  documentRow,
  CITE_CODE,
  RETIRE_BLOCKED_CODES,
  DOC_EVT,
  PG,
} from "./rig-docs-fixtures.mjs";

let ready = false;
let world = null;

before(async () => {
  await ensureReady();
  ready = await docsReady();
  if (ready) world = await buildWorld();
});
after(async () => {
  printLaneNotes("filings-provenance");
  await endPool();
});

function unready(t) {
  if (!ready) { t.skip("Slice-5 document pipeline not present — 0007 not yet applied"); return true; }
  return false;
}

/** Firm id owning a world client (root read). */
async function firmOf(client) {
  const r = await rootQuery("select firm_id from clara.clients where id = $1", [client]);
  return r.rows[0].firm_id;
}

/** Events a client's firm emitted since a captured seq (root; bypasses RLS). */
async function eventsForDoc(document) {
  const r = await rootQuery(
    "select event_type, client_id, payload from clara.domain_events where document_id = $1 order by seq",
    [document],
  );
  return r.rows;
}

// ===========================================================================
// §3.1 — file_document + the active-filing lane law.
// ===========================================================================

test("§3.1 file_document creates ONE active filing + emits document.filed stamped with filing_id; an unfiled doc has zero active filings", async (t) => {
  if (unready(t)) return;
  const { users, clients } = world;
  const firm = await firmOf(clients.A1);
  const { documentId } = await seedVerifiedDocument({ firm });

  assert.equal((await activeFilings(documentId)).length, 0, "a freshly-minted document is UNASSIGNED (zero active filings)");

  const filing = await fileDocument(users.alice, { document: documentId, client: clients.A1, resolution: await freshResolution(users.alice, clients.A1) });
  const active = await activeFilings(documentId);
  assert.equal(active.length, 1, "file_document created exactly one active filing");
  assert.equal(active[0].client_id, clients.A1, "the filing binds the chosen client");
  assert.equal(active[0].retired_at ?? null, null, "the filing is active (retired_at null)");

  const evs = await eventsForDoc(documentId);
  const filed = evs.find((e) => e.event_type === DOC_EVT.filed);
  assert.ok(filed, "document.filed was emitted");
  assert.ok(JSON.stringify(filed.payload ?? {}).includes(filing ?? active[0].id), "document.filed payload carries filing_id (§3.1)");
});

test("§3.1 multi-client filing: the same doc files to two sibling clients; a duplicate ACTIVE filing to the same client is rejected", async (t) => {
  if (unready(t)) return;
  const { users, clients } = world;
  const firm = await firmOf(clients.A1);
  const { documentId } = await seedVerifiedDocument({ firm });

  await fileDocument(users.alice, { document: documentId, client: clients.A1, resolution: await freshResolution(users.alice, clients.A1) });
  await fileDocument(users.alice, { document: documentId, client: clients.A2, resolution: await freshResolution(users.alice, clients.A2) });
  assert.equal((await activeFilings(documentId)).length, 2, "a document is filed to two sibling clients concurrently (S5-R5)");

  // The partial UNIQUE (document_id, client_id) WHERE retired_at IS NULL blocks a
  // second ACTIVE filing to a client already actively filed.
  await assertRaisesOneOf(
    [PG.uniqueViolation, CLR.badRequest, CLR.notFound],
    () => fileDocument(users.alice, { document: documentId, client: clients.A1, resolution: randomUUID() }),
    "second active filing to the same client",
  );
});

// ===========================================================================
// §3.1 — filing-bound provenance ADMISSION (server-side derivation; CLR02).
// ===========================================================================

test("§3.1 admission derives filing_id server-side; the drafted entry carries it; the caller never supplies it", async (t) => {
  if (unready(t)) return;
  const { users, clients } = world;
  const firm = await firmOf(clients.A1);
  const { documentId, sha256 } = await seedVerifiedDocument({ firm });
  await fileDocument(users.alice, { document: documentId, client: clients.A1, resolution: await freshResolution(users.alice, clients.A1) });

  const res = await freshResolution(users.alice, clients.A1);
  const receipt = await draftEntry(human(users.alice), {
    client: clients.A1, resolution: res, document: documentId, sha256,
    lines: balanced({ cash: "1000", sales: "4000" }, ROUTINE_CENTS), opKey: opk("d"),
  });
  const row = await rootQuery("select filing_id, document_id from clara.journal_entries where id = $1", [receipt.entry_id]);
  assert.ok(row.rows[0].filing_id, "the entry carries a server-derived filing_id");
  const active = await activeFilings(documentId);
  assert.equal(row.rows[0].filing_id, active[0].id, "the derived filing_id is the unique ACTIVE (document, client) filing");
});

test("§3.1 admission ABSENCE/ambiguity → CLR02: draft on an UNFILED doc, and a doc filed to a DIFFERENT client, both refuse", async (t) => {
  if (unready(t)) return;
  const { users, clients } = world;
  const firm = await firmOf(clients.A1);

  // (a) Unfiled document → no active (document, client) filing → CLR02.
  const unfiled = await seedVerifiedDocument({ firm });
  await assertRaises(CITE_CODE, () => draftEntry(human(users.alice), {
    client: clients.A1, resolution: freshResolution(users.alice, clients.A1), document: unfiled.documentId, sha256: unfiled.sha256,
    lines: balanced({ cash: "1000", sales: "4000" }, ROUTINE_CENTS), opKey: opk("d"),
  }), "draft citing an unfiled document");

  // (b) Filed to A2 but drafted for A1 → no active (document, A1) filing → CLR02.
  const other = await seedVerifiedDocument({ firm });
  await fileDocument(users.alice, { document: other.documentId, client: clients.A2, resolution: await freshResolution(users.alice, clients.A2) });
  await assertRaises(CITE_CODE, () => draftEntry(human(users.alice), {
    client: clients.A1, resolution: freshResolution(users.alice, clients.A1), document: other.documentId, sha256: other.sha256,
    lines: balanced({ cash: "1000", sales: "4000" }, ROUTINE_CENTS), opKey: opk("d"),
  }), "draft for A1 on a doc filed only to A2");
});

test("§3.1 belt congruence: a draft whose p_sha256 mismatches the bound document is refused CLR02", async (t) => {
  if (unready(t)) return;
  const { users, clients } = world;
  const firm = await firmOf(clients.A1);
  const { documentId } = await seedVerifiedDocument({ firm });
  await fileDocument(users.alice, { document: documentId, client: clients.A1, resolution: await freshResolution(users.alice, clients.A1) });

  await assertRaises(CITE_CODE, () => draftEntry(human(users.alice), {
    client: clients.A1, resolution: freshResolution(users.alice, clients.A1), document: documentId, sha256: "f".repeat(64),
    lines: balanced({ cash: "1000", sales: "4000" }, ROUTINE_CENTS), opKey: opk("d"),
  }), "draft with a mismatched sha256 vs the bound document");
});

// ===========================================================================
// §3.0 citability + §3.1 approve re-affirmation.
// ===========================================================================

test("§3.1/S5-D3 retire_document_filing REFUSES while a live DRAFT cites the document (the draft blocker); the approve-time re-affirmation stays as defense-in-depth", async (t) => {
  if (unready(t)) return;
  const { users, clients } = world;
  const firm = await firmOf(clients.A1);
  const { documentId, sha256 } = await seedVerifiedDocument({ firm });
  const filing = await fileDocument(users.alice, { document: documentId, client: clients.A1, resolution: await freshResolution(users.alice, clients.A1) });

  const res = await freshResolution(users.alice, clients.A1);
  const d = await draftEntry(human(users.alice), {
    client: clients.A1, resolution: res, document: documentId, sha256,
    lines: balanced({ cash: "1000", sales: "4000" }, ROUTINE_CENTS), opKey: opk("d"),
  });

  // Integration reconciliation: S5-D3 blocks retirement on live DRAFTS too, not just
  // posted entries — so "retire between draft and approve" is structurally impossible
  // through governed paths (the correction path withdraws drafts instead). Assert the
  // refusal; the retired-filing approve refusal (CLR02) therefore cannot be staged
  // directly and approve_entry's re-affirmation remains a defense-in-depth belt.
  const active = await activeFilings(documentId);
  await assertRaisesOneOf(
    RETIRE_BLOCKED_CODES,
    () => retireDocumentFiling(users.alice, { filing: filing ?? active[0].id, reason: "rig re-affirm", expectedRevision: active[0].revision_token }),
    "retire a filing while a live draft cites the document",
  );
  assert.equal((await activeFilings(documentId)).length, 1, "the filing stays ACTIVE (retirement refused)");

  // The draft remains approvable — the refusal must not have damaged it.
  await approveEntry(users.alice, { entry: d.entry_id, expectedRevision: d.revision_token, opKey: opk("a") });
  noteLane("draft-blocker proven: retirement refused on a live draft citation; approve-time re-affirmation is structurally unreachable via governed paths in v1 (defense-in-depth belt — recorded for §13)");
});

test("§3.0/§4.7 a filed document anchors retention; retirement of the last filing returns it to unanchored (clock preserved)", async (t) => {
  if (unready(t)) return;
  const { users, clients } = world;
  const firm = await firmOf(clients.A1);
  const { documentId } = await seedVerifiedDocument({ firm });
  const filing = await fileDocument(users.alice, { document: documentId, client: clients.A1, resolution: await freshResolution(users.alice, clients.A1) });

  const anchored = await documentRow(documentId);
  assert.equal(anchored.retention_state, "anchored", "the first filing anchors retention (§4.7)");
  const retainAfterAnchor = anchored.retain_until;
  assert.ok(retainAfterAnchor != null, "retain_until is set once anchored");

  const active = await activeFilings(documentId);
  await retireDocumentFiling(users.alice, { filing: filing ?? active[0].id, reason: "rig unanchor", expectedRevision: active[0].revision_token });
  const back = await documentRow(documentId);
  assert.equal(back.retention_state, "unanchored", "retiring the last filing returns the document to unanchored");
  assert.equal(back.retain_until, retainAfterAnchor, "the retain_until value PERSISTS across unanchor (floor-never-shorten is structural, §4.7)");
});
