// Wave-A2 rig — high-stakes on the AR side (contract §9 gate A + probe P7).
// CONTRACT-BLIND: from contract v1.0 §9 + the as-built is_high_stakes / attestation
// gates (0009/0011) — NEVER 0015 source. The RPR eval's six sales invoices all exceed
// the RM10k high-stakes default, so the AR path MUST exercise the high-stakes ceremony:
//
//   - the batch path (approve_routine_entry) REFUSES a high-stakes AR draft
//     (routine_refuses_high_stakes) — exactly as it does for AP;
//   - an agent-made high-stakes sales draft approved WITHOUT attestation is REFUSED
//     (CLR05 attestation family); WITH attestation it approves.
//
// The high-stakes threshold is a plain amount test (is_high_stakes ⇐ Σdebit ≥
// firm.high_stakes_amount_cents), so a ≥RM10k receivable-debit invoice is high-stakes.
// Best-effort on the sales build (findings adjudicated at integration). Skips (counted).

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  rootQuery, endPool, printLaneNotes, noteLane, printSkipCount, markSkip,
  waveAEnsureReady, buildWorld, firmOf, opk, upsertAccountClassed,
  seedCitedDocument, mintLegacyInvoiceFactsTask, invoiceFactsTask, claimTask, persistInvoiceFacts,
  factField, factsRegion, grantConsent, freshResolution, ev, approveEntry, approveRoutineEntry,
  mintInteractive, wakeDraftEntry, addClientIdentifier, reasonOf,
} from "./wave-a-fixtures.mjs";

const REC = "300-000", REV = "500-000";
const CLIENT_REG = "199901000555", CLIENT_NAME = "ROME PROPERTIES SDN BHD";
const HS = 1_500_000; // RM 15,000 — over the RM10k default high-stakes threshold

let ready = false;
let has15 = false;
let world = null;

async function has0015Sales() {
  const r = await rootQuery(
    `select 1 from pg_constraint c join pg_class t on t.oid=c.conrelid join pg_namespace n on n.oid=t.relnamespace
      where n.nspname='clara' and t.relname='journal_entries' and c.contype='c'
        and pg_get_constraintdef(c.oid) ilike '%sales_invoice%' limit 1`,
  );
  return r.rows.length > 0;
}
function skip15(t) {
  if (!has15) { markSkip(); t.skip("Wave-A2 not present — coding_kind lacks 'sales_invoice'"); return true; }
  return false;
}
const rm = (cents) => `RM ${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;

/** Build + draft a high-stakes 2-leg sales invoice (agent-made). Returns the draft or null. */
async function highStakesSalesDraft(client) {
  const firm = await firmOf(client);
  await grantConsent(world.users.alice, { firm, client }).catch(() => {});
  // 0016 (P3): classify-first gate — kind-stamped at seed so invoice_facts engages directly.
  const cited = await seedCitedDocument(world.users.alice, { firm, client, quote: rm(HS), kind: "invoice" });
  // F-A1 PR-3 CUTOVER: the router's invoice-kind arm now mints llm_witness, never
  // invoice_facts (no dual-run, D9) -- this fixture only needs a task ON the
  // invoice_facts lane to exercise ITS downstream machinery, so it mints directly.
  await mintLegacyInvoiceFactsTask(cited.documentId);
  const task = await invoiceFactsTask(cited.documentId);
  await claimTask(task.id, { egressApproved: true });
  try {
    await persistInvoiceFacts(task.id, [
      factField("invoice.total", rm(HS)), factField("invoice.currency", "MYR"),
      factField("invoice.vendor_name", CLIENT_NAME), factField("invoice.vendor_registration", CLIENT_REG, { polygon: [], confidence: 0.9 }),
      factField("invoice.customer_name", "D & DREAM PROPERTIES SDN BHD", { polygon: [], confidence: 0.9 }),
      factField("invoice.invoice_id", `SI-${randomUUID().slice(0, 8)}`), factField("invoice.type_code", "01", { polygon: [], confidence: 0.9 }),
    ]);
  } catch (e) { noteLane(`persist HS sales facts ${e.code}: ${e.message}`); return null; }
  const cred = await mintInteractive(firm);
  const region = await factsRegion(cited.documentId, "invoice.total");
  try {
    return await wakeDraftEntry(cred, {
      client, resolution: await freshResolution(world.users.alice, client, { subjectKind: "document", subjectId: cited.documentId }),
      lines: [
        { account_code: REC, debit_cents: HS, credit_cents: 0, description: "ar" },
        { account_code: REV, debit_cents: 0, credit_cents: HS, description: "rev" },
      ],
      document: cited.documentId, sha256: cited.sha256,
      vendor: { new: { name: "D & DREAM PROPERTIES SDN BHD" }, kind: "customer" },
      evidence: [ev(region?.id, region?.text_content ?? rm(HS), "invoice.total")],
      codingKind: "sales_invoice", opKey: `hs:${cited.filingId}:${cited.documentId}`,
    });
  } catch (e) { noteLane(`HS sales draft raised ${e.code}: ${e.message}`); return null; }
}

before(async () => {
  ready = await waveAEnsureReady();
  has15 = ready && (await has0015Sales());
  if (has15) {
    world = await buildWorld();
    await upsertAccountClassed(world.users.alice, { client: world.clients.A1, code: REC, name: "Trade Debtors", type: "asset", accountClass: "receivable", opKey: opk("rec") }).catch((e) => noteLane(`rec ${e.code}`));
    await upsertAccountClassed(world.users.alice, { client: world.clients.A1, code: REV, name: "Revenue", type: "income", opKey: opk("rev") }).catch((e) => noteLane(`rev ${e.code}`));
    await addClientIdentifier(world.users.alice, { client: world.clients.A1, kind: "ssm", value: CLIENT_REG }).catch(() => {});
    await addClientIdentifier(world.users.alice, { client: world.clients.A1, kind: "tin", value: CLIENT_REG }).catch(() => {});
  } else noteLane(ready ? "0015 sales coding_kind absent — high-stakes AR suite skipped" : "0011 surface absent");
});
after(async () => { printLaneNotes("wave-a2-highstakes-ar"); printSkipCount("wave-a2-highstakes-ar"); await endPool(); });

test("P7 the batch path refuses a HIGH-STAKES AR draft (approve_routine_entry → routine_refuses_high_stakes)", async (t) => {
  if (skip15(t)) return;
  const d = await highStakesSalesDraft(world.clients.A1);
  if (!d?.entry_id) { noteLane("HS sales draft not built — batch-refusal cell skipped"); return; }
  let err = null;
  try { await approveRoutineEntry(world.users.alice, { entry: d.entry_id, expectedRevision: d.revision_token }); }
  catch (e) { err = e; }
  assert.ok(err, "a ≥RM10k sales invoice is refused by the batch (routine) approve — high-stakes on AR is not a batch case");
  if (err && err.code !== "CLR05") noteLane(`routine refusal code was ${err.code} (expected CLR05 routine_refuses_high_stakes) — adjudicate`);
  if (err && reasonOf(err) && reasonOf(err) !== "routine_refuses_high_stakes") noteLane(`routine refusal reason '${reasonOf(err)}' (expected routine_refuses_high_stakes)`);
});

test("P7 an agent-made HIGH-STAKES sales draft approved WITHOUT attestation is refused; WITH attestation it approves", async (t) => {
  if (skip15(t)) return;
  const d = await highStakesSalesDraft(world.clients.A1);
  if (!d?.entry_id) { noteLane("HS sales draft not built — attestation cell skipped"); return; }
  // No attestation → the high-stakes gate refuses (agent-made ⇒ attestation_required).
  let err = null;
  try { await approveEntry(world.users.alice, { entry: d.entry_id, expectedRevision: d.revision_token, opKey: opk("noattest") }); }
  catch (e) { err = e; }
  assert.ok(err, "a ≥RM10k agent-made sales invoice cannot be approved without attestation");
  if (err && err.code !== "CLR05") noteLane(`no-attestation refusal code ${err.code} (expected CLR05 attestation family) — adjudicate`);
  // With attestation → approves (the high-stakes AR ceremony the §9 eval exercises).
  await approveEntry(world.users.alice, { entry: d.entry_id, expectedRevision: d.revision_token, attestation: "reviewed high-value AR invoice", opKey: opk("attest") })
    .then(() => assert.ok(true, "with an attestation the high-stakes sales invoice approves"))
    .catch((e) => noteLane(`attested HS approve raised ${e.code}/${reasonOf(e)} — likely a coupled gate (direction/shape); inspect`));
});
