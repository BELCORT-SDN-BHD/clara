// Wave-B battery — GATE 5: cross-firm SECURITY DEFINER probes over every K/W/S
// writer from migration 0017 (+ 0016's sign_coding_rule). A firm-B OWNER
// (dave) targets firm-A ids: the 15 HUMAN-lane writers refuse CLR11 (the
// firm-in-your-firm check fires before any state/business check); the 2
// RUNTIME-lane writers (publish_wiki_page_version, create_seeding_batch) have
// no caller firm at all (clara_runtime is one global role) — their cross-firm
// surface is a foreign OBJECT REFERENCE, refused CLR02. CONTRACT-BLIND (this
// pass read 0017/0016 to fix expected codes for the design; a param/arity/CLR
// divergence at run time is still a FINDING). FAILS below 0017.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  CLR, rootQuery,
  assertRaises, endPool, printLaneNotes,
  fail0017, wbEnsureReady,
  buildWaveBWorld, onboardingClient, seedOpeningCoa, WB_COA,
  filedDocument, freshResolution,
  createOpeningSeed, draftOpeningItem, recordOpeningTarget, seedFixedAsset,
  approveOpeningSeed, supersedeOpeningItem, cancelOpeningSeed, reopenOpeningSeed,
  approveOpeningCorrection, retireWikiPage, signCodingRule,
  tickProposal, declineProposal, completeSeedingBatch, cancelSeedingBatch,
  publishWikiPage, createSeedingBatch,
  seedRegRow, openingItemRows, openingApprovalRows, pageRow, batchRow, proposalRows,
  planRevision, stageFirmAProbeRule,
} from "./wb-fixtures.mjs";

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
  // across all 15+2 probes (no probe ever reaches a mutation).
  onb = await onboardingClient(w.users.hana);
  await seedOpeningCoa(w.users.alice, onb.client);
  const seedR = await createOpeningSeed(w.users.bob, { client: onb.client, plan: onb.plan });
  seed = seedR.seed_id ?? seedR.id;
  await draftOpeningItem(w.users.bob, {
    client: onb.client, seed, resolution: freshResolution(w.users.bob, onb.client),
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
});
after(async () => { printLaneNotes("wb-x-crossfirm"); await endPool(); });

test("META: 0017 applied — dave is firm-B owner and every firm-A probe target is staged", async () => {
  fail0017(live);
  assert.ok(seed && item0 && page && batch && prop && rule && bDoc, "every firm-A/firm-B probe target staged");
});

test("Cross-firm HUMAN-lane battery (15 writers): firm-B owner (dave) targeting firm-A ids -> CLR11 (not-found-in-your-firm), zero mutation", async () => {
  fail0017(live);
  const dave = w.users.dave;
  const probes = [
    ["create_opening_seed", () => createOpeningSeed(dave, { client: onb.client, plan: onb.plan })],
    // [risk 2] a DUMMY resolution uuid: the CLR11 seed-firm-check in
    // _draft_opening_item_core (0017:3180) precedes assert_client_resolved.
    ["draft_opening_item", () => draftOpeningItem(dave, {
      client: onb.client, seed, resolution: randomUUID(),
      item: { item_kind: "gl_balance", item_key: "x" },
      lines: [{ account_code: WB_COA.cash, debit_cents: 1_000, credit_cents: 0 }],
    })],
    ["record_opening_target", () => recordOpeningTarget(dave, {
      seed, line: { line_key: "x", account_code: WB_COA.cash, debit_cents: 1_000, credit_cents: 0 },
    })],
    ["seed_fixed_asset", () => seedFixedAsset(dave, {
      client: onb.client, seed, asset: { item_key: "fa1", cost_cents: 1_000 },
    })],
    // [risk 3] the serializable wrapper enters serializable, the isolation
    // assert passes, THEN the firm check fires — surfaces CLR11, never 40001.
    ["approve_opening_seed", async () => approveOpeningSeed(dave, {
      seed, planRevision: await planRevision(onb.plan), entryRevisions: {},
    })],
    ["supersede_opening_item", () => supersedeOpeningItem(dave, { item: item0 })],
    ["cancel_opening_seed", () => cancelOpeningSeed(dave, { seed })],
    ["reopen_opening_seed", () => reopenOpeningSeed(dave, { seed })],
    ["approve_opening_correction", () => approveOpeningCorrection(dave, { seed, entryRevisions: {} })],
    ["retire_wiki_page", () => retireWikiPage(dave, { page })],
    ["sign_coding_rule", () => signCodingRule(dave, { rule })],
    ["tick_seeding_proposal", () => tickProposal(dave, { proposal: prop })],
    ["decline_seeding_proposal", () => declineProposal(dave, { proposal: prop })],
    ["complete_seeding_batch", () => completeSeedingBatch(dave, { batch })],
    ["cancel_seeding_batch", () => cancelSeedingBatch(dave, { batch })],
  ];
  assert.equal(probes.length, 15, "the full 15-writer human-lane battery");
  for (const [label, run] of probes) {
    await assertRaises(CLR.notFound, run, `firm-B dave -> firm-A ${label}`);
  }
});

test("Cross-firm RUNTIME-lane writers (publish_wiki_page_version, create_seeding_batch): NO firm-B actor exists — the cross-firm attack surface is a foreign OBJECT REFERENCE, refused CLR02", async () => {
  fail0017(live);
  const probes = [
    ["publish_wiki_page_version (runtime lane — cross-firm REFERENCE, not actor)", () => publishWikiPage({
      client: w.clients.A1, firm: w.firms.A, slug: "xf-cite",
      citations: [{ source_kind: "document", document_id: bDoc.documentId }],
    })],
    ["create_seeding_batch (runtime lane — cross-firm REFERENCE, not actor)", () => createSeedingBatch({
      client: w.clients.A1, document: bDoc.documentId,
      proposals: [{ proposal_kind: "wiki_fact", proposal_key: "k", payload: { x: 1 }, evidence: { y: 1 } }],
    })],
  ];
  for (const [label, run] of probes) {
    await assertRaises(CLR.provenance, run, label);
  }
});

test("No-mutation guard: after the full 17-probe sweep, every firm-A target is byte-unchanged (definer writers refuse BEFORE any write)", async () => {
  fail0017(live);
  assert.equal((await seedRegRow(seed)).state, "open", "no approval/cancel/reopen leaked");
  assert.equal((await openingApprovalRows(seed)).length, 0, "zero opening approvals");
  assert.equal((await pageRow(w.clients.A1, "xf")).state, "active", "retire_wiki_page did not fire");
  assert.equal((await batchRow(batch)).state, "open", "seeding batch untouched");
  assert.equal((await proposalRows(batch))[0].state, "proposed", "seeding proposal untouched");
  const ruleRow = (await rootQuery("select status, signed_by from clara.coding_rules where id=$1", [rule])).rows[0];
  assert.equal(ruleRow.status, "proposed", "the firm-A coding rule's status unchanged");
  assert.equal(ruleRow.signed_by, null, "the firm-A coding rule's signed_by unchanged");
});
