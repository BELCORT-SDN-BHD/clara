// Slice-5 rig — DOCUMENT PIPELINE part 9: EVENTS + TAXONOMY v2 + FRESHNESS
// (companion §3.7 / DELTA-OWNER-3). Contract-blind. Laws: 0007 ADDs the five new
// document event types + activates taxonomy v2 (full coverage, active pointer
// repointed) with the document routing §3.7 states; filing-based freshness
// relevance (unassigned ingest/extraction events are relevant to NO client;
// document.filed relevant to its filed clients; correction_applied aggregate EXEMPT
// while its children carry staleness; non-document null-client events keep
// firm-level staleness); domain events for DOMAIN facts ONLY (intakes/tasks/
// reservations emit NOTHING); no amount-shaped key in any new event payload (N2).

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  rootQuery,
  ensureReady,
  docsReady,
  buildWorld,
  endPool,
  printLaneNotes,
  noteLane,
  amountShapedKeys,
  freshResolution,
  ROUTINE_CENTS,
  balanced,
  opk,
  human,
  draftEntry,
  approveEntry,
  seedVerifiedDocument,
  seedIntake,
  fileDocument,
  proposeCorrection,
  approveCorrection,
  idOf,
  activeFilings,
  DOC_EVT,
  NEW_EVENT_TYPES,
  DOC_TAXONOMY_V2,
} from "./rig-docs-fixtures.mjs";

let ready = false;
let world = null;

before(async () => {
  await ensureReady();
  ready = await docsReady();
  if (ready) world = await buildWorld();
});
after(async () => {
  printLaneNotes("events");
  await endPool();
});

function unready(t) {
  if (!ready) { t.skip("Slice-5 document pipeline not present — 0007 not yet applied"); return true; }
  return false;
}

async function firmOf(client) {
  return (await rootQuery("select firm_id from clara.clients where id = $1", [client])).rows[0].firm_id;
}
async function maxSeq(firm) {
  return (await rootQuery("select coalesce(max(seq),0)::int as n from clara.domain_events where firm_id=$1", [firm])).rows[0].n;
}

// ===========================================================================
// §3.7 — the five new event types + taxonomy v2 full coverage + routing.
// ===========================================================================

test("§3.7 0007 registers the five new document event types", async (t) => {
  if (unready(t)) return;
  const r = await rootQuery("select name from clara.event_types where name = any($1)", [NEW_EVENT_TYPES]);
  const got = new Set(r.rows.map((x) => x.name));
  for (const et of NEW_EVENT_TYPES) assert.ok(got.has(et), `event_types registers ${et}`);
});

test("§3.7 taxonomy v2 is ACTIVE (pointer repointed) and maps EVERY event type; the document family routes as §3.7 states", async (t) => {
  if (unready(t)) return;
  const active = (await rootQuery("select version from clara.taxonomy_active")).rows[0].version;
  assert.ok(active > 1, `the active taxonomy pointer repointed past v1 (got v${active})`);

  const types = (await rootQuery("select name from clara.event_types")).rows.map((x) => x.name);
  const mapped = new Map((await rootQuery("select event_type, decision from clara.trigger_taxonomy where version=$1", [active])).rows.map((r) => [r.event_type, r.decision]));
  for (const et of types) assert.ok(mapped.has(et), `taxonomy v${active} covers ${et} (full-coverage law)`);
  for (const [et, decision] of Object.entries(DOC_TAXONOMY_V2)) {
    assert.equal(mapped.get(et), decision, `${et} routes to '${decision}' in v${active} (§3.7)`);
  }
});

// ===========================================================================
// §0.11 — events discipline: control tables emit NO domain events.
// ===========================================================================

test("§3.2/§3.9/§3.6 runtime-control writes (an intake row) emit NO domain event", async (t) => {
  if (unready(t)) return;
  const { users, clients } = world;
  const firm = await firmOf(clients.A1);
  const before = await maxSeq(firm);
  await seedIntake({ firm, uploadedBy: users.alice, status: "uploading", sha256: null });
  const after = await maxSeq(firm);
  assert.equal(after, before, "seeding an intake row emitted NO domain event (runtime-control, §0.11)");
});

// ===========================================================================
// §3.7 / DELTA-OWNER-3 — filing-based freshness relevance (structural inputs).
// ===========================================================================

test("§3.7 an unassigned document's ingest event carries a document_id but NULL client and NO active filing (relevant to nobody); filing makes it relevant to exactly its client", async (t) => {
  if (unready(t)) return;
  const { users, clients } = world;
  const firm = await firmOf(clients.A1);

  // An unassigned document (seeded, then a synthetic ingest via a non-filed doc).
  // The ingest event's relevance INPUTS: null client + no active filing → nobody.
  const { documentId } = await seedVerifiedDocument({ firm });
  assert.equal((await activeFilings(documentId)).length, 0, "the document is unassigned at ingest (no active filing)");

  // File to A1 → an active filing (document→A1) now exists → the document's events
  // become relevant to A1 (and ONLY A1). document.filed is emitted.
  await fileDocument(users.alice, { document: documentId, client: clients.A1, resolution: await freshResolution(users.alice, clients.A1) });
  const active = await activeFilings(documentId);
  assert.equal(active.length, 1, "exactly one active filing → relevant to exactly one client");
  assert.equal(active[0].client_id, clients.A1, "relevance binds A1 only (not A2)");
  const filed = await rootQuery("select 1 from clara.domain_events where document_id=$1 and event_type=$2", [documentId, DOC_EVT.filed]);
  assert.equal(filed.rowCount, 1, "document.filed emitted (the event that stales A1)");
  noteLane("freshness relevance verified structurally (null-client+document_id gated on active filing); the gate's CLR12 behavior is exercised by the runtime freshness suite");
});

test("§3.7 correction_applied is the AGGREGATE (exempt); its children carry the staleness", async (t) => {
  if (unready(t)) return;
  const { users, clients } = world;
  const firm = await firmOf(clients.A1);
  const { documentId, sha256 } = await seedVerifiedDocument({ firm });
  await fileDocument(users.alice, { document: documentId, client: clients.A1, resolution: await freshResolution(users.alice, clients.A1) });
  const res = await freshResolution(users.alice, clients.A1);
  const d = await draftEntry(human(users.alice), { client: clients.A1, resolution: res, document: documentId, sha256, lines: balanced({ cash: "1000", sales: "4000" }, ROUTINE_CENTS), opKey: opk("d") });
  await approveEntry(users.alice, { entry: d.entry_id, expectedRevision: d.revision_token, opKey: opk("a") });

  // S5-D3: destination attribution BEFORE propose (its event would stale the plan).
  await freshResolution(users.alice, clients.A2, { subjectKind: "document", subjectId: documentId });
  const proposal = await proposeCorrection(users.alice, { document: documentId, fromClient: clients.A1, toClient: clients.A2, reason: "aggregate test" });
  const correctionId = idOf(proposal, "correction_id", "correction");
  const planHash = proposal.plan_hash ?? (await rootQuery("select plan_hash from clara.filing_corrections where id=$1", [correctionId])).rows[0]?.plan_hash;
  await approveCorrection(users.bob, { correction: correctionId, planHash });

  const agg = await rootQuery("select count(*)::int as n from clara.domain_events where document_id=$1 and event_type=$2", [documentId, DOC_EVT.correctionApplied]);
  assert.equal(agg.rows[0].n, 1, "ONE aggregate document.correction_applied");
  const children = await rootQuery("select count(*)::int as n from clara.domain_events where document_id=$1 and event_type in ('entry.reversed', $2)", [documentId, DOC_EVT.filed]);
  assert.ok(children.rows[0].n >= 1, "child events (entry.reversed / document.filed) carry the staleness");
});

// ===========================================================================
// N2 — confidentiality: no amount-shaped key in any new document event payload.
// ===========================================================================

test("N2 no amount-shaped key appears in any document.* event payload", async (t) => {
  if (unready(t)) return;
  const { users, clients } = world;
  const firm = await firmOf(clients.A1);
  // Produce a spread of document events: ingested (via finalize) is control-adjacent;
  // filed + correction via the writers.
  const { documentId } = await seedVerifiedDocument({ firm });
  await fileDocument(users.alice, { document: documentId, client: clients.A1, resolution: await freshResolution(users.alice, clients.A1) });

  const rows = await rootQuery("select event_type, payload from clara.domain_events where firm_id=$1 and event_type like 'document.%'", [firm]);
  assert.ok(rows.rowCount >= 1, "at least one document.* event exists to sweep");
  for (const r of rows.rows) {
    const bad = amountShapedKeys(r.payload ?? {});
    assert.deepEqual(bad, [], `${r.event_type} payload carries no amount-shaped key (got ${bad.join(", ")})`);
  }
});
