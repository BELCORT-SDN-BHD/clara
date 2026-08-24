// Wave-B battery — GATE 5: cross-firm SECURITY DEFINER probes over every K/W/S
// writer from migration 0017 (+ 0016's sign_coding_rule). A firm-B OWNER
// (dave) targets firm-A ids: the 15 HUMAN-lane writers refuse CLR11 (the
// firm-in-your-firm check fires before any state/business check); the 2
// RUNTIME-lane writers (publish_wiki_page_version, create_seeding_batch) have
// no caller firm at all (clara_runtime is one global role) — their cross-firm
// surface is a foreign OBJECT REFERENCE, refused CLR02. CONTRACT-BLIND (this
// pass read 0017/0016 to fix expected codes for the design; a param/arity/CLR
// divergence at run time is still a FINDING). FAILS below 0017.
//
// BATTERY CLOSURE (adjudicated fix): two more runtime-lane foreign-reference
// probes close the gate — record_opening_targets_parsed and
// record_wiki_source_ingest, each given a firm-A seed/client but a firm-B
// document reference. Both fn bodies were read directly (0017_wave_b.sql)
// before writing these cells: record_wiki_source_ingest's document lookup
// joins document_filings on (document_id,client_id) AND clients on
// (id,firm_id=doc.firm_id) — a firm-B document can never satisfy either join
// for a firm-A client, so it surfaces "not found" -> CLR02, CONFIRMING the
// CLR02-provenance-family hypothesis. record_opening_targets_parsed's tie-
// document lookup ALSO filters `firm_id=s.firm_id` (a firm-B document can
// never match), so the guard is equally real — but its typed refusal is
// CLR31/tie_mismatch (the CLR30-exported opening-seed family, 0017:3070-3079),
// NOT CLR02. That is a verified DIVERGENCE from the CLR02 hypothesis (reported
// as a finding, not silently absorbed) — not a production gap: both fns refuse
// the foreign reference and mutate nothing, they are just typed differently.
//
// SWEEP DEPTH: the no-mutation guard snapshots row counts (opening seed
// registry/items/targets/approvals, wiki_pages+versions, seeding
// batches/proposals, audit_log, domain_events maxSeq) BEFORE the full probe
// sweep and re-checks AFTER, plus op_receipts=0 for every probe's op_key (a
// refusal must reserve nothing) — not just the handful of field-level asserts
// the original cell carried.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  CLR, CLR30 as CLR_OPENING, rootQuery, opk,
  assertRaises, endPool, printLaneNotes, detailReason,
  fail0017, wbEnsureReady,
  buildWaveBWorld, onboardingClient, seedOpeningCoa, WB_COA,
  filedDocument,
  createOpeningSeed, draftOpeningItem, recordOpeningTarget, seedFixedAsset, keyedRes,
  approveOpeningSeed, supersedeOpeningItem, cancelOpeningSeed, reopenOpeningSeed,
  approveOpeningCorrection, retireWikiPage,
  tickProposal, declineProposal, completeSeedingBatch, cancelSeedingBatch,
  publishWikiPage, createSeedingBatch, recordOpeningTargetsParsed, recordWikiIngest,
  seedRegRow, openingItemRows, openingApprovalRows, pageRow, batchRow, proposalRows,
  planRevision, stageFirmAProbeRule,
} from "./wb-fixtures.mjs";
import { maxSeq } from "../rig-events-helpers.mjs";

let live = false;
let w = null;
let onb = null;
let seed = null;
let item0 = null;
let page = null;
let batch = null;
let prop = null;
let rule = null;
let bDoc = null;
let preSweep = null;
const probeReceipts = []; // {fn, opKey} for every probe fired across every battery below

/** The sweep-depth snapshot (item 6): everything a probe sweep could plausibly
 *  have mutated, for the ONE staged seed/client this file drives. */
async function sweepSnapshot({ firm, client, seed: s }) {
  const reg = await seedRegRow(s);
  const items = await openingItemRows(s);
  const approvals = await openingApprovalRows(s);
  const targets = await rootQuery("select count(*)::int as n from clara.opening_tb_targets where seed_id=$1", [s]);
  const pages = await rootQuery("select count(*)::int as n from clara.wiki_pages where client_id=$1", [client]);
  const versions = await rootQuery(
    "select count(*)::int as n from clara.wiki_page_versions v join clara.wiki_pages p on p.id=v.page_id where p.client_id=$1", [client]);
  const batches = await rootQuery("select count(*)::int as n from clara.seeding_batches where client_id=$1", [client]);
  const proposals = await rootQuery("select count(*)::int as n from clara.seeding_proposals where client_id=$1", [client]);
  const audit = await rootQuery("select count(*)::int as n from clara.audit_log where firm_id=$1", [firm]);
  const seq = await maxSeq(firm);
  return {
    regState: reg.state, itemsN: items.length, approvalsN: approvals.length,
    targetsN: targets.rows[0].n, pagesN: pages.rows[0].n, versionsN: versions.rows[0].n,
    batchesN: batches.rows[0].n, proposalsN: proposals.rows[0].n, auditN: audit.rows[0].n, seq,
  };
}

before(async () => {
  live = await wbEnsureReady();
  if (!live) return;
  w = await buildWaveBWorld();

  // [risk 1] dave MUST be firm-B OWNER — every admin-floor probe (cancel/
  // reopen/approve_opening_*, tick/decline/complete/cancel_seeding_*) depends
  // on clearing BOTH the bookkeeper and admin floors before ever reaching the
  // firm check. buildWaveBWorld builds dave via createFirm(users.dave)=owner;
  // assert it explicitly so a future world change fails loudly, not silently.
  const daveMem = (await rootQuery(
    "select role from clara.firm_memberships where firm_id=$1 and user_id=$2 and status='active'",
    [w.firms.B, w.users.dave])).rows[0];
  assert.equal(daveMem?.role, "owner", "dave is firm-B OWNER (the single load-bearing world fact for this gate)");

  // Stage every firm-A target ONCE. Every probe below refuses BEFORE any
  // state/business check runs, so the SAME staged objects are safe to reuse
  // across all probes (no probe ever reaches a mutation).
  onb = await onboardingClient(w.users.hana);
  await seedOpeningCoa(w.users.alice, onb.client);
  const seedR = await createOpeningSeed(w.users.bob, { client: onb.client, plan: onb.plan });
  seed = seedR.seed_id ?? seedR.id;
  await draftOpeningItem(w.users.bob, {
    // [AMB-0018-1] keyed lane → seed-bound mint (WB-R24(i)), not the generic mint.
    client: onb.client, seed, resolution: keyedRes(w.users.bob, { client: onb.client, seed }),
    item: { item_kind: "gl_balance", item_key: "probe:item0" },
    lines: [{ account_code: WB_COA.cash, debit_cents: 1_000, credit_cents: 0 }],
  });
  item0 = (await openingItemRows(seed))[0].id;

  await publishWikiPage({ client: w.clients.A1, firm: w.firms.A, slug: "xf" });
  page = (await pageRow(w.clients.A1, "xf")).id;

  const maDoc = await filedDocument(w.users.alice, { firm: w.firms.A, client: w.clients.A1, kind: "management_account" });
  const batchR = await createSeedingBatch({
    client: w.clients.A1, document: maDoc.documentId,
    proposals: [{ proposal_kind: "wiki_fact", proposal_key: "k", payload: { x: 1 }, evidence: { y: 1 } }],
  });
  batch = batchR.batch_id ?? batchR.id;
  prop = (await proposalRows(batch))[0].id;

  rule = await stageFirmAProbeRule(w.users.alice, { firm: w.firms.A, client: w.clients.A1, accountCode: WB_COA.expense });

  // The runtime-lane probes' cross-firm REFERENCE target: a firm-B document.
  bDoc = await filedDocument(w.users.dave, { firm: w.firms.B, client: w.clients.B1, kind: "bank_statement" });

  // SWEEP DEPTH prestate pin — taken AFTER every fixture is staged, BEFORE any probe fires.
  preSweep = await sweepSnapshot({ firm: w.firms.A, client: onb.client, seed });
});
after(async () => { printLaneNotes("wb-x-crossfirm"); await endPool(); });

test("META: 0017 applied — dave is firm-B owner and every firm-A probe target is staged", async () => {
  fail0017(live);
  assert.ok(seed && item0 && page && batch && prop && rule && bDoc, "every firm-A/firm-B probe target staged");
});

test("Cross-firm HUMAN-lane battery (15 writers): firm-B owner (dave) targeting firm-A ids -> CLR11 (not-found-in-your-firm), zero mutation", async () => {
  fail0017(live);
  const dave = w.users.dave;
  const mk = (fn, factory) => { const opKey = opk(`xf_${fn}`); return [fn, () => factory(opKey), opKey]; };
  const probes = [
    mk("create_opening_seed", (opKey) => createOpeningSeed(dave, { client: onb.client, plan: onb.plan, opKey })),
    // [risk 2] a DUMMY resolution uuid: the CLR11 seed-firm-check in
    // _draft_opening_item_core (0017:3180) precedes assert_client_resolved.
    mk("draft_opening_item", (opKey) => draftOpeningItem(dave, {
      client: onb.client, seed, resolution: randomUUID(),
      item: { item_kind: "gl_balance", item_key: "x" },
      lines: [{ account_code: WB_COA.cash, debit_cents: 1_000, credit_cents: 0 }],
      opKey,
    })),
    mk("record_opening_target", (opKey) => recordOpeningTarget(dave, {
      seed, line: { line_key: "x", account_code: WB_COA.cash, debit_cents: 1_000, credit_cents: 0 }, opKey,
    })),
    mk("seed_fixed_asset", (opKey) => seedFixedAsset(dave, {
      client: onb.client, seed, asset: { item_key: "fa1", cost_cents: 1_000 }, opKey,
    })),
    // [risk 3] the serializable wrapper enters serializable, the isolation
    // assert passes, THEN the firm check fires — surfaces CLR11, never 40001.
    mk("approve_opening_seed", async (opKey) => approveOpeningSeed(dave, {
      seed, planRevision: await planRevision(onb.plan), entryRevisions: {}, opKey,
    })),
    mk("supersede_opening_item", (opKey) => supersedeOpeningItem(dave, { item: item0, opKey })),
    mk("cancel_opening_seed", (opKey) => cancelOpeningSeed(dave, { seed, opKey })),
    mk("reopen_opening_seed", (opKey) => reopenOpeningSeed(dave, { seed, opKey })),
    mk("approve_opening_correction", (opKey) => approveOpeningCorrection(dave, { seed, entryRevisions: {}, opKey })),
    mk("retire_wiki_page", (opKey) => retireWikiPage(dave, { page, opKey })),
    // sign_coding_rule RETIRED with F-A2 PR-3 (Annex B.1) — dropped, so its cross-firm
    // probe entry is removed too (14-writer battery, was 15).
    mk("tick_seeding_proposal", (opKey) => tickProposal(dave, { proposal: prop, opKey })),
    mk("decline_seeding_proposal", (opKey) => declineProposal(dave, { proposal: prop, opKey })),
    mk("complete_seeding_batch", (opKey) => completeSeedingBatch(dave, { batch, opKey })),
    mk("cancel_seeding_batch", (opKey) => cancelSeedingBatch(dave, { batch, opKey })),
  ];
  assert.equal(probes.length, 14, "the full 14-writer human-lane battery (sign_coding_rule retired with F-A2 PR-3)");
  for (const [label, run, opKey] of probes) {
    await assertRaises(CLR.notFound, run, `firm-B dave -> firm-A ${label}`);
    probeReceipts.push({ fn: label, opKey });
  }
});

test("Cross-firm RUNTIME-lane writers (publish_wiki_page_version, create_seeding_batch): NO firm-B actor exists — the cross-firm attack surface is a foreign OBJECT REFERENCE, refused CLR02", async () => {
  fail0017(live);
  const wpubKey = opk("xf_publish_wiki_page_version");
  const batchKey = opk("xf_create_seeding_batch");
  const probes = [
    ["publish_wiki_page_version (runtime lane — cross-firm REFERENCE, not actor)", () => publishWikiPage({
      client: w.clients.A1, firm: w.firms.A, slug: "xf-cite",
      citations: [{ source_kind: "document", document_id: bDoc.documentId }], opKey: wpubKey,
    }), wpubKey, "publish_wiki_page_version"],
    ["create_seeding_batch (runtime lane — cross-firm REFERENCE, not actor)", () => createSeedingBatch({
      client: w.clients.A1, document: bDoc.documentId,
      proposals: [{ proposal_kind: "wiki_fact", proposal_key: "k", payload: { x: 1 }, evidence: { y: 1 } }], opKey: batchKey,
    }), batchKey, "create_seeding_batch"],
  ];
  for (const [label, run, opKey, fn] of probes) {
    await assertRaises(CLR.provenance, run, label);
    probeReceipts.push({ fn, opKey });
  }
});

test("BATTERY CLOSURE: record_opening_targets_parsed + record_wiki_source_ingest — a firm-A seed/client given a firm-B document reference. Both fn bodies were read from 0017_wave_b.sql before writing this cell: record_wiki_source_ingest's document_filings/clients join CONFIRMS the CLR02-provenance-family hypothesis; record_opening_targets_parsed's tie-document lookup ALSO filters firm_id (equally real guard, zero mutation) but its typed refusal is CLR31/tie_mismatch (the CLR30-exported opening-seed family) — a verified DIVERGENCE from CLR02, reported as a finding rather than papered over", async () => {
  fail0017(live);
  const targetsKey = opk("xf_record_opening_targets_parsed");
  const ingestKey = opk("xf_record_wiki_source_ingest");

  // record_opening_targets_parsed (0017:3070): `select * into d from
  // clara.documents where id=p_document and firm_id=s.firm_id` — a firm-B
  // document can NEVER satisfy firm_id=s.firm_id, so `d` is not-found and the
  // fn falls into its generic "parsed targets do not match the tie document"
  // branch: errcode CLR31 ('opening_seed' family, exported as CLR30),
  // detail.reason='tie_mismatch'. NOT CLR02 — the divergence this cell proves.
  const err1 = await assertRaises(CLR_OPENING, () => recordOpeningTargetsParsed({
    seed, document: bDoc.documentId,
    lines: [{ line_key: "xf-probe", account_code: WB_COA.cash, source_label: "xf-probe",
      debit_cents: 1_000, credit_cents: 0,
      extraction_ref: { extraction_id: randomUUID(), region_id: randomUUID() } }],
    opKey: targetsKey,
  }), "firm-A seed -> firm-B document reference: record_opening_targets_parsed");
  assert.equal(detailReason(err1), "tie_mismatch", "typed reason: tie_mismatch (NOT a CLR02 provenance refusal)");
  probeReceipts.push({ fn: "record_opening_targets_parsed", opKey: targetsKey });

  // record_wiki_source_ingest (0017:2238): the document lookup joins
  // document_filings ON (document_id,client_id=p_client) AND clients ON
  // (id=f.client_id, firm_id=doc.firm_id) — a firm-B document can satisfy
  // NEITHER join for a firm-A client, so it surfaces "not found" -> CLR02,
  // CONFIRMING the hypothesis.
  await assertRaises(CLR.provenance, () => recordWikiIngest({
    client: onb.client, document: bDoc.documentId, opKey: ingestKey,
  }), "firm-A client -> firm-B document reference: record_wiki_source_ingest");
  probeReceipts.push({ fn: "record_wiki_source_ingest", opKey: ingestKey });
});

test("No-mutation guard: after the full probe sweep, every firm-A target is byte-unchanged (definer writers refuse BEFORE any write) and every probe reserved ZERO op_receipts", async () => {
  fail0017(live);

  // Field-level asserts (the original cell's coverage, kept).
  assert.equal((await seedRegRow(seed)).state, "open", "no approval/cancel/reopen leaked");
  assert.equal((await openingApprovalRows(seed)).length, 0, "zero opening approvals");
  assert.equal((await pageRow(w.clients.A1, "xf")).state, "active", "retire_wiki_page did not fire");
  assert.equal((await batchRow(batch)).state, "open", "seeding batch untouched");
  assert.equal((await proposalRows(batch))[0].state, "proposed", "seeding proposal untouched");
  const ruleRow = (await rootQuery("select status, signed_by from clara.coding_rules where id=$1", [rule])).rows[0];
  assert.equal(ruleRow.status, "proposed", "the firm-A coding rule's status unchanged");
  assert.equal(ruleRow.signed_by, null, "the firm-A coding rule's signed_by unchanged");

  // SWEEP DEPTH: full-count comparison, BEFORE (preSweep) vs AFTER (now) — the
  // registry/items/targets/approvals, wiki pages+versions, seeding
  // batches+proposals, audit_log, and domain_events maxSeq must ALL be
  // byte-unchanged after 18 refused probes across 4 batteries (was 19; the
  // sign_coding_rule probe retired with F-A2 PR-3).
  assert.ok(probeReceipts.length >= 18, `every battery pushed its receipts (got ${probeReceipts.length})`);
  const postSweep = await sweepSnapshot({ firm: w.firms.A, client: onb.client, seed });
  assert.deepEqual(postSweep, preSweep, "the full sweep snapshot is IDENTICAL before vs after every probe");

  // op_receipts=0 for EVERY probe's op_key — a refusal reserves nothing.
  for (const { fn, opKey } of probeReceipts) {
    const r = await rootQuery("select count(*)::int as n from clara.op_receipts where fn=$1 and op_key=$2", [fn, opKey]);
    assert.equal(r.rows[0].n, 0, `op_receipts holds ZERO rows for ${fn}'s op_key ${opKey} — the refusal reserved nothing`);
  }
});
