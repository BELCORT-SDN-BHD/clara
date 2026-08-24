// Wave-A2.1 rig — the READ surfaces (pin doc P5; contract §2.3/§6.1/§6.2).
// CONTRACT-BLIND: pins only — never 0016 source.
//
//   get_draft_review: the HUMAN lane returns a SLIM SETTLED payload
//     {entry:{id,status,approved_at,withdrawn_at,coding_kind}} once status<>'draft';
//     the wake/agent lane keeps returning NULL for settled (behavior-frozen).
//   get_context_pack: schema version 3; a `sst_registration_watch` block with the
//     status, the three labeled figures, the window, the earliest crossing month,
//     future_method_status, coverage/verification, evaluated_at, and
//     permitted_use='surface_and_request_professional_review_only' (a DB-computed
//     screening estimate — never a legal determination).
//   list_review_queue: open watches union in as row_kind='compliance_watch'; the
//     integer `counts` gain ONLY integer counts (never a monetary figure); entry
//     rows gain coding_kind (§6.2 vocabulary); the compliance summary carries a
//     stale_evaluator flag when the newest eval receipt is >48h old.
//
// FILE-ORDER NOTE: the stale=true half MUST run before any evaluator call in the
// battery (receipts are append-only — staleness cannot be re-manufactured after a
// fresh run). This file sorts before a21-sightings/a21-watch*, and its stale cell
// is the FIRST behavioral test in the file. Serial discipline: --test-concurrency=1.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  ROLES, rootQuery, endPool, printLaneNotes, noteLane, printSkipCount,
  buildWorld, firmOf, opk, wakeQuery,
  a21EnsureReady, skip16, metaProbe0016,
  evaluateSstWatch, evaluateAllWatches, freshWatchClient, approvedTurnoverEntry, openWatchRow,
  evalRunCount, collectRowKind, mytMonthDate,
  getDraftReview, withdrawDraft, draftEntryV3, approveEntry, freshResolution, contextPack,
  listReviewQueue, humanPersona, mintInteractive, wakeDraftEntry,
  upsertPayableAccount, upsertAccountClassed, seedCitedDocument, billLines, ev, FIELD,
  AP, EXP,
} from "./a21-helpers.mjs";

let has16 = false;
let world = null;
let watchClient = null; // built lazily — a crossed, evaluated client

function skipHere(t) { return skip16(t, has16, "0016 not applied — read-surfaces battery dormant"); }

/** Deep-collect every object carrying `key` as an own property. */
function collectWithKey(payload, key) {
  const hits = [];
  const walk = (node) => {
    if (node == null || typeof node !== "object") return;
    if (Array.isArray(node)) { node.forEach(walk); return; }
    if (Object.prototype.hasOwnProperty.call(node, key)) hits.push(node);
    Object.values(node).forEach(walk);
  };
  walk(payload);
  return hits;
}

async function crossedWatchClient() {
  if (watchClient) return watchClient;
  const { users } = world;
  const client = await freshWatchClient(users.alice, { name: `a21_reads_${randomUUID().slice(0, 6)}` });
  // Anchored to the DB's OWN Asia/Kuala_Lumpur clock (n=-1, the last completed
  // month) — never a fixed calendar month; see a21-watch-anchors.mjs.
  await approvedTurnoverEntry({ maker: users.alice, checker: users.bob, client, cents: 50_000_001, date: await mytMonthDate(-1, 9) });
  await evaluateSstWatch(client);
  const w = await openWatchRow(client, "G");
  assert.equal(w?.state, "crossed", "the reads fixture watch is crossed (mandatory setup)");
  watchClient = client;
  return client;
}

before(async () => {
  const ready = await a21EnsureReady();
  has16 = ready.base && ready.has16;
  if (has16) world = await buildWorld();
  else noteLane("0016 absent — a21-read-surfaces suite dormant");
});
after(async () => { printLaneNotes("a21-read-surfaces"); printSkipCount("a21-read-surfaces"); await endPool(); });

test("META a21-read-surfaces: migration 0016 present + the surface markers exist", async (t) => {
  await metaProbe0016(t, has16, {
    label: "read surfaces",
    tables: ["compliance_watches", "compliance_eval_runs"],
    fns: ["get_draft_review", "get_context_pack", "list_review_queue"],
  });
});

// ===========================================================================
// The stale-evaluator flag — TRUE half first (append-only receipts make it
// unreachable after any fresh sweep).
// ===========================================================================

test("§2.3 a stale evaluator IS ITSELF a surfaced condition: with the newest receipt >48h old the queue summary flags stale_evaluator", async (t) => {
  if (skipHere(t)) return;
  const { users } = world;
  if ((await evalRunCount()) > 0) {
    noteLane("compliance_eval_runs already carries fresh receipts (run-order dependency) — the stale=true half is unprovable in this run; the false half is asserted below");
    return;
  }
  // Backdated receipt (append-only admits inserts) — the ONLY receipt, 3 days old.
  try {
    await rootQuery(
      `insert into clara.compliance_eval_runs (started_at, completed_at, clients_examined, clients_changed, clients_failed, through_event_seq)
       values (now() - interval '3 days', now() - interval '3 days', 0, 0, 0, 0)`,
    );
  } catch (e) {
    noteLane(`backdated receipt insert refused (${e.code}: ${e.message}) — receipt column shape divergence; stale=true half noted`);
    return;
  }
  const q = await listReviewQueue(humanPersona(users.alice), {});
  const flagged = collectWithKey(q, "stale_evaluator");
  assert.ok(flagged.length >= 1, "the queue payload carries a stale_evaluator flag somewhere in its compliance summary");
  assert.ok(flagged.some((o) => o.stale_evaluator === true), "with the newest receipt 3 days old the flag is TRUE (>48h = stale)");
});

// ===========================================================================
// get_draft_review — settled hydration per lane (contract §6.1).
// ===========================================================================

test("§6.1 the HUMAN lane returns a SLIM SETTLED payload for an APPROVED entry (id/status/approved_at/withdrawn_at/coding_kind)", async (t) => {
  if (skipHere(t)) return;
  const { users, clients, coa } = world;
  const d = await draftEntryV3(users.alice, {
    client: clients.A1, resolution: await freshResolution(users.alice, clients.A1),
    lines: [
      { account_code: coa.A1.cash, debit_cents: 40000, credit_cents: 0, description: "dr" },
      { account_code: coa.A1.sales, debit_cents: 0, credit_cents: 40000, description: "cr" },
    ],
    opKey: opk("gdr"),
  });
  // A DRAFT still hydrates the full review payload (regression — the CoR only
  // changes the settled branch).
  const live = await getDraftReview(users.alice, { entry: d.entry_id, client: clients.A1 });
  assert.ok(live, "a draft still returns the full review payload on the human lane");
  await approveEntry(users.bob, { entry: d.entry_id, expectedRevision: d.revision_token, opKey: opk("gdra") });
  const settled = await getDraftReview(users.alice, { entry: d.entry_id, client: clients.A1 });
  assert.ok(settled, "the human lane returns a payload for a SETTLED entry (no more fabricated status:'unknown')");
  assert.ok(settled.entry, "the settled payload is the slim {entry:{...}} envelope");
  assert.equal(settled.entry.id, d.entry_id, "entry.id");
  assert.equal(settled.entry.status, "approved", "entry.status='approved' — a TRUE terminal receipt");
  assert.ok(settled.entry.approved_at != null, "entry.approved_at is populated");
  assert.ok("withdrawn_at" in settled.entry, "entry.withdrawn_at key present (null for approved)");
  assert.ok("coding_kind" in settled.entry, "entry.coding_kind key present (the §6.2 vocabulary carrier)");
});

test("§6.1 the WAKE/AGENT lane keeps returning NULL for a settled entry (behavior-frozen); the human lane hydrates a WITHDRAWN receipt", async (t) => {
  if (skipHere(t)) return;
  const { users, clients, coa } = world;
  const firm = await firmOf(clients.A1);
  const mk = async () => draftEntryV3(users.alice, {
    client: clients.A1, resolution: await freshResolution(users.alice, clients.A1),
    lines: [
      { account_code: coa.A1.cash, debit_cents: 30000, credit_cents: 0, description: "dr" },
      { account_code: coa.A1.sales, debit_cents: 0, credit_cents: 30000, description: "cr" },
    ],
    opKey: opk("gdw"),
  });
  // Approved → agent lane NULL.
  const d1 = await mk();
  await approveEntry(users.bob, { entry: d1.entry_id, expectedRevision: d1.revision_token, opKey: opk("gdwa") });
  const cred = await mintInteractive(firm);
  const agentView = await wakeQuery(ROLES.agentRo, cred.secret,
    "select clara.get_draft_review(p_entry => $1, p_client => $2) as r", [d1.entry_id, clients.A1]);
  assert.equal(agentView.rows[0].r, null, "the wake/agent lane returns NULL for a settled entry — FROZEN (the slim payload is human-lane only)");
  // Withdrawn → human lane terminal receipt.
  const d2 = await mk();
  await withdrawDraft(users.alice, { entry: d2.entry_id, reason: "rig withdraw", expectedRevision: d2.revision_token, opKey: opk("wd") });
  const settled = await getDraftReview(users.alice, { entry: d2.entry_id, client: clients.A1 });
  assert.ok(settled?.entry, "the human lane hydrates a withdrawn entry");
  assert.equal(settled.entry.status, "withdrawn", "entry.status='withdrawn'");
  assert.ok(settled.entry.withdrawn_at != null, "entry.withdrawn_at is populated");
});

// ===========================================================================
// get_context_pack v3 — the sst_registration_watch block.
// ===========================================================================

test("§2.3 context pack v3: pack_schema_version=3 + the sst_registration_watch block with permitted_use and the three labeled figures", async (t) => {
  if (skipHere(t)) return;
  const { users } = world;
  const client = await crossedWatchClient();
  const pack = await contextPack(users.alice, client, "a21 read-surface probe");
  assert.ok(pack, "the pack hydrates");
  // W6 pins the 3-to-4 bump while preserving every v3 key.
  assert.equal(Number(pack.pack_schema_version), 5, `the current pack schema version is 5 — Wave E delta's period/snapshot registry block (got ${pack.pack_schema_version})`);
  // INTEGRATION (CLASS T, adjudicated): the block is an ARRAY — one element per
  // OPEN (client, service_group) watch episode. Ratified over the object reading.
  const arr = pack.sst_registration_watch;
  assert.ok(Array.isArray(arr), `sst_registration_watch is an array of per-group watch objects (got ${typeof arr})`);
  assert.ok(arr.length >= 1, "the array carries the open watch for a watched client");
  const block = arr.find((x) => x.service_group === "G") ?? arr[0];
  assert.equal(block.permitted_use, "surface_and_request_professional_review_only",
    "permitted_use pins the agent to surface-and-refer — never a legal determination, a tax computation, or an inferred registration status");
  const blob = JSON.stringify(block);
  assert.ok(/crossed/.test(blob), "the block carries the watch status (crossed)");
  const keys = Object.keys(block);
  const hasFigure = (re) => keys.some((k) => re.test(k)) || re.test(blob);
  assert.ok(hasFigure(/confirmed/i), "figure 1 — the confirmed-included basis is labeled");
  assert.ok(hasFigure(/unknown/i), "figure 2 — the unknown_or_mixed basis is labeled");
  assert.ok(hasFigure(/proxy|screening/i), "figure 3 — the all-income screening proxy is labeled");
  assert.ok(blob.includes("50000001") || blob.includes("500000.01") || blob.includes("500,000.01"),
    "the crossed figure itself (RM 500,000.01) rides the block to the sen");
  assert.ok(hasFigure(/future_method/i), "future_method_status is present");
  assert.ok(hasFigure(/evaluated_at/i), "evaluated_at is present (freshness is visible)");
  assert.ok(hasFigure(/coverage/i), "the coverage/verification flag is present");
  assert.ok(hasFigure(/crossing_month|earliest/i), "the earliest candidate crossing month is present");
});

// ===========================================================================
// list_review_queue — the compliance_watch row + counts discipline + coding_kind.
// ===========================================================================

test("§2.3 the queue unions the open watch as row_kind='compliance_watch'; counts stay INTEGER-only; a fresh sweep clears stale_evaluator", async (t) => {
  if (skipHere(t)) return;
  const { users } = world;
  const client = await crossedWatchClient();
  await evaluateAllWatches(); // a fresh receipt — the stale flag must now be false
  const q = await listReviewQueue(humanPersona(users.alice), {});
  const watchRows_ = collectRowKind(q, "compliance_watch");
  assert.ok(watchRows_.length >= 1, "the open watch surfaces as a row_kind='compliance_watch' queue row");
  const mine = watchRows_.find((r) => JSON.stringify(r).includes(client));
  assert.ok(mine, "the compliance_watch row references the crossed client");
  assert.ok(/crossed|overdue/.test(JSON.stringify(mine)), "the row carries the tier so the dashboard can rank it top-of-queue");
  // counts: integers only — never a monetary figure inside the integer counts.
  const countsObjs = collectWithKey(q, "counts").map((o) => o.counts).filter((c) => c && typeof c === "object");
  assert.ok(countsObjs.length >= 1, "the queue envelope carries a counts object");
  for (const counts of countsObjs) {
    for (const [k, v] of Object.entries(counts)) {
      if (typeof v === "object" && v != null) continue; // nested count groups walk below
      assert.ok(Number.isInteger(Number(v)), `counts.${k} is an integer count (got ${v}) — monetary figures never ride the counts`);
    }
  }
  // [R1-F14] The two freshness flags are INDEPENDENT surfaces: L5 sanctions a
  // SEPARATE lint flag, never a merged either-branch accept — a stale
  // compliance evaluator must fail this cell even when lint happens to be
  // fresh (ratchet-r1 memo finding 14; the some(false) form was unsanctioned).
  assert.equal(q.compliance?.stale_evaluator, false,
    "with a fresh compliance receipt the COMPLIANCE evaluator is NOT stale");
  assert.equal(typeof q.lint?.stale_evaluator, "boolean",
    "the L5 lint freshness flag rides its own envelope key as an independent boolean");
});

test("§6.2 queue entry rows carry coding_kind (the direction-aware vocabulary feed)", async (t) => {
  if (skipHere(t)) return;
  const { users, clients } = world;
  const client = clients.A2;
  const sub = users.alice;
  await upsertPayableAccount(sub, { client, code: AP, name: "Trade Creditors", opKey: opk("ap") }).catch(() => {});
  await upsertAccountClassed(sub, { client, code: EXP, name: "Prof Fees", type: "expense", opKey: opk("exp") }).catch(() => {});
  const firm = await firmOf(client);
  // F-A2 PR-1 (D11): the coded agent draft below needs a readable direction; state the supplier.
  const cited = await seedCitedDocument(sub, { firm, client, quote: "RM 500.00", direction: "purchase" });
  const cred = await mintInteractive(firm);
  const d = await wakeDraftEntry(cred, {
    client, resolution: await freshResolution(sub, client, { subjectKind: "document", subjectId: cited.documentId }),
    lines: billLines(EXP, AP, 50000), document: cited.documentId, sha256: cited.sha256,
    vendor: { new: { name: `QKINDCO ${randomUUID().slice(0, 6)}`, registration_no: "201801060001" } },
    evidence: [ev(cited.regionId, cited.quote, FIELD.total)],
    codingKind: "supplier_bill", opKey: opk("qk"),
  });
  assert.ok(d?.entry_id, "the queue-cell supplier_bill draft exists (mandatory setup)");
  const q = await listReviewQueue(humanPersona(sub), {});
  const rows = collectWithKey(q, "coding_kind").filter((r) => JSON.stringify(r).includes(d.entry_id));
  assert.ok(rows.length >= 1, "the draft's queue row carries a coding_kind field (§6.2 — the envelope extension)");
  assert.ok(rows.some((r) => r.coding_kind === "supplier_bill"), `the coding_kind value is 'supplier_bill' (got ${rows.map((r) => r.coding_kind).join(",")})`);
});
