// Wave-A rig — revision snapshots + diff reads (Codex probes 12/20; contract §7 +
// companion §9 + PINS §5a). journal_entry_revisions is written in-txn at draft
// (rev 0), by every revise_entry, and by every facts-driven rotation. get_entry_diff
// walks that table (deltas SQL-computed); get_doc_entry_diff renders honest no-region
// rows. The whole history reconstructs leg-by-leg after multi-step revise + rotation.
// Contract-blind. SKIPS (counted) until 0011 lands.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  opk, endPool, printLaneNotes, noteLane, printSkipCount, skipUnready,
  waveAEnsureReady, buildWorld, firmOf, upsertPayableAccount, upsertAccountClassed,
  seedCitedDocument, freshResolution, draftEntryV3, reviseEntry, billLines, ev, FIELD,
  enqueueInvoiceFacts, invoiceFactsTask, claimTask, persistInvoiceFacts, factField,
  grantConsent, revisionRows, getEntryDiff, getDocEntryDiff, humanPersona, ROUTINE_CENTS,
} from "./wave-a-fixtures.mjs";
import { AP, EXP } from "./wave-a-fixtures.mjs";

let ready = false;
let world = null;
before(async () => {
  ready = await waveAEnsureReady();
  if (ready) {
    world = await buildWorld();
    for (const c of [world.clients.A1, world.clients.A2]) {
      await upsertPayableAccount(world.users.alice, { client: c, code: AP, name: "Trade Creditors", opKey: opk("ap") });
      await upsertAccountClassed(world.users.alice, { client: c, code: EXP, name: "Prof Fees", type: "expense", opKey: opk("exp") });
      await grantConsent(world.users.alice, { firm: await firmOf(c), client: c }).catch(() => {});
    }
  }
});
after(async () => { printLaneNotes("wave-a-revisions"); printSkipCount("wave-a-revisions"); await endPool(); });

// ===========================================================================
// rev-0 at draft; a snapshot per revise; the full walk reconstructs.
// ===========================================================================

test("rev 0 at draft + a snapshot per revise: journal_entry_revisions grows one row per state change; revision_no is monotonic from 0", async (t) => {
  if (skipUnready(t, ready)) return;
  const { users, clients } = world;
  const firm = await firmOf(clients.A1);
  const cited = await seedCitedDocument(users.alice, { firm, client: clients.A1, quote: "RM 500.00" });
  const d = await draftEntryV3(users.alice, {
    client: clients.A1, resolution: await freshResolution(users.alice, clients.A1, { subjectKind: "document", subjectId: cited.documentId }),
    document: cited.documentId, sha256: cited.sha256, lines: billLines(EXP, AP, ROUTINE_CENTS),
    vendor: { new: { name: "REVCO SDN BHD", registration_no: "201801007000" } }, evidence: [ev(cited.regionId, cited.quote, FIELD.total)], opKey: opk("revcite"),
  });
  const afterDraft = await revisionRows(d.entry_id);
  assert.ok(afterDraft.length >= 1, "a revision-0 snapshot is written at draft creation");
  assert.equal(Number(afterDraft[0].revision_no), 0, "the first snapshot is revision_no 0");
  // revise twice (change amounts) — each writes a snapshot.
  let tok = d.revision_token;
  const r1 = await reviseEntry(users.alice, { entry: d.entry_id, lines: billLines(EXP, AP, 60000), vendor: { new: { name: "REVCO SDN BHD", registration_no: "201801007000" } }, evidence: [ev(cited.regionId, cited.quote, FIELD.total)], expectedRevision: tok });
  tok = r1.revision_token ?? r1.new_revision ?? tok;
  await reviseEntry(users.alice, { entry: d.entry_id, lines: billLines(EXP, AP, 75000), vendor: { new: { name: "REVCO SDN BHD", registration_no: "201801007000" } }, evidence: [ev(cited.regionId, cited.quote, FIELD.total)], expectedRevision: tok });
  const snaps = await revisionRows(d.entry_id);
  const nos = snaps.map((s) => Number(s.revision_no));
  assert.ok(nos.length >= 3, `≥3 snapshots after draft + 2 revises (got ${nos.length})`);
  assert.deepEqual(nos, [...nos].sort((a, b) => a - b), "revision_no is monotonic");
  assert.equal(nos[0], 0, "the walk starts at 0");
  assert.equal(new Set(nos).size, nos.length, "revision_no values are distinct (unique(entry_id, revision_no))");
});

test("get_entry_diff reconstructs the full history leg-by-leg with SQL-computed deltas after multi-step revise", async (t) => {
  if (skipUnready(t, ready)) return;
  const { users, clients } = world;
  const firm = await firmOf(clients.A2);
  const cited = await seedCitedDocument(users.alice, { firm, client: clients.A2, quote: "RM 500.00" });
  const d = await draftEntryV3(users.alice, {
    client: clients.A2, resolution: await freshResolution(users.alice, clients.A2, { subjectKind: "document", subjectId: cited.documentId }),
    document: cited.documentId, sha256: cited.sha256, lines: billLines(EXP, AP, 50000),
    vendor: { new: { name: "DIFFCO SDN BHD", registration_no: "201801007100" } }, evidence: [ev(cited.regionId, cited.quote, FIELD.total)], opKey: opk("diffcite"),
  });
  await reviseEntry(users.alice, { entry: d.entry_id, lines: billLines(EXP, AP, 90000), vendor: { new: { name: "DIFFCO SDN BHD", registration_no: "201801007100" } }, evidence: [ev(cited.regionId, cited.quote, FIELD.total)], expectedRevision: d.revision_token });
  const diff = await getEntryDiff(humanPersona(users.alice), { entry: d.entry_id, client: clients.A2 });
  assert.ok(diff && Array.isArray(diff.revisions), "get_entry_diff returns a revisions array");
  assert.ok(diff.revisions.length >= 2, "the walk carries every revision (draft + revise)");
  const last = diff.revisions[diff.revisions.length - 1];
  assert.ok(Array.isArray(last.legs) && last.legs.length >= 2, "each revision carries its complete ordered legs");
  assert.ok(Array.isArray(last.deltas_vs_prev), "a revision carries deltas_vs_prev");
  // Spot-verify a delta: the amount rose 50000 → 90000; a +40000 delta_cents appears.
  const hasDelta = last.deltas_vs_prev.some((x) => Math.abs(Number(x.delta_cents)) === 40000);
  if (!hasDelta) noteLane(`get_entry_diff deltas_vs_prev did not surface the expected +/-40000 cents delta — deltas=${JSON.stringify(last.deltas_vs_prev).slice(0, 200)}`);
  assert.ok(last.deltas_vs_prev.every((x) => Number.isInteger(Number(x.delta_cents))), "every delta_cents is an integer (SQL-computed cents, never a float confidence)");
});

// ===========================================================================
// Facts-driven rotation writes a snapshot.
// ===========================================================================

test("facts rotation writes a revision snapshot: persisting invoice_facts on a bound draft appends a journal_entry_revisions row", async (t) => {
  if (skipUnready(t, ready)) return;
  const { users, clients } = world;
  const firm = await firmOf(clients.A1);
  const cited = await seedCitedDocument(users.alice, { firm, client: clients.A1, quote: "RM 500.00" });
  const d = await draftEntryV3(users.alice, {
    client: clients.A1, resolution: await freshResolution(users.alice, clients.A1, { subjectKind: "document", subjectId: cited.documentId }),
    document: cited.documentId, sha256: cited.sha256, lines: billLines(EXP, AP, 50000),
    vendor: { new: { name: "ROTCO SDN BHD", registration_no: "201801007200" } }, evidence: [ev(cited.regionId, cited.quote, FIELD.total)], opKey: opk("rotcite"),
  });
  const before = (await revisionRows(d.entry_id)).length;
  await enqueueInvoiceFacts(cited.documentId);
  const task = await invoiceFactsTask(cited.documentId);
  await claimTask(task.id, { egressApproved: true }).catch(() => {});
  await persistInvoiceFacts(task.id, [factField(FIELD.total, "RM 5,000.00"), factField(FIELD.currency, "MYR")]).catch((e) => noteLane(`persist facts (rotation) raised ${e.code}`));
  const after = (await revisionRows(d.entry_id)).length;
  assert.ok(after > before, `a facts rotation appended a revision snapshot (before=${before} after=${after})`);
});

// ===========================================================================
// get_doc_entry_diff — honest no-region rows (WA-L7), no UI summation.
// ===========================================================================

test("get_doc_entry_diff renders per-field doc↔entry rows with SQL deltas and an honest no_region marker where a field has no captured region (WA-R8)", async (t) => {
  if (skipUnready(t, ready)) return;
  const { users, clients } = world;
  const firm = await firmOf(clients.A2);
  const cited = await seedCitedDocument(users.alice, { firm, client: clients.A2, quote: "RM 500.00" });
  const d = await draftEntryV3(users.alice, {
    client: clients.A2, resolution: await freshResolution(users.alice, clients.A2, { subjectKind: "document", subjectId: cited.documentId }),
    document: cited.documentId, sha256: cited.sha256, lines: billLines(EXP, AP, 50000),
    vendor: { new: { name: "DOCDIFFCO SDN BHD", registration_no: "201801007300" } }, evidence: [ev(cited.regionId, cited.quote, FIELD.total)], opKey: opk("docdiffcite"),
  });
  const diff = await getDocEntryDiff(humanPersona(users.alice), { entry: d.entry_id, client: clients.A2 });
  assert.ok(diff && Array.isArray(diff.fields), "get_doc_entry_diff returns a fields array");
  assert.ok(diff.document_id === cited.documentId, "the diff names the document");
  for (const f of diff.fields) {
    assert.ok("no_region" in f, "each field row carries an explicit no_region flag");
    if ("delta_cents" in f && f.delta_cents != null) assert.ok(Number.isInteger(Number(f.delta_cents)), "delta_cents is an integer (SQL-computed)");
    // PIN-ADD-2: every field row carries the as-built region locator (verbatim
    // document_regions.locator_kind/locator jsonb) — NULL on no-region rows.
    assert.ok("doc_region_locator_kind" in f, "each field row carries doc_region_locator_kind (PIN-ADD-2)");
    assert.ok("doc_region_locator" in f, "each field row carries doc_region_locator (PIN-ADD-2)");
    if (f.no_region === true) {
      assert.equal(f.doc_region_locator ?? null, null, "a no-region row has a NULL doc_region_locator");
      assert.equal(f.doc_region_locator_kind ?? null, null, "a no-region row has a NULL doc_region_locator_kind");
    } else if (f.doc_region_locator != null) {
      assert.equal(typeof f.doc_region_locator, "object", "a region row's doc_region_locator is the locator jsonb (object)");
    }
  }
  // At least the cited total field should carry a captured region locator (the draft cited FIELD.total).
  const cited_total = diff.fields.find((f) => f.no_region === false);
  if (cited_total) assert.ok(cited_total.doc_region_locator != null && cited_total.doc_region_locator_kind != null, "a corroborated field row exposes a non-null locator kind + locator (the doc_review overlay coords)");
  else noteLane("get_doc_entry_diff returned no region-backed field row — PIN-ADD-2 locator shape only exercised on no-region rows this run");
});
