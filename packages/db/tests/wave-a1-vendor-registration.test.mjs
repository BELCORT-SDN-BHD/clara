// Wave-A.1 rig — REGISTERED vendors reach the READY lane when invoice_facts carry
// the vendor registration (0013 / AB-16). The daily-loop as-built (AB-16) captured a
// vendor NAME only, so _coding_lane_core handed _resolve_counterparty a name-only
// proposal and a REGISTERED counterparty came back CLR23 'vendor_ambiguous' → NEEDS
// REVIEW, never READY. 0013 reads invoice.vendor_registration from the same latest
// done invoice_facts extraction and feeds it as registration_no, so the
// registration-dominant lane returns 'registration_match' → the lane reaches READY.
//
// This file SKIPS (loudly, counted) until 0013 is applied — the marker is
// _coding_lane_core's source referencing 'invoice.vendor_registration' (a live
// catalog inspection, never a read of the migration file). Connection is env-only.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  waveAEnsureReady, buildWorld, endPool, rootQuery, noteLane,
  markSkip, printSkipCount, firmOf, opk,
  upsertPayableAccount, upsertAccountClassed,
  grantConsent, seedCitedDocument, enqueueInvoiceFacts, invoiceFactsTask, claimTask,
  persistInvoiceFacts, factField, statedIdentityFields, FIELD,
  draftEntryV3, approveEntry, freshResolution, billLines, ev, counterpartyRows,
  codingLane, humanPersona, AP, EXP,
} from "./wave-a-fixtures.mjs";

const VENDOR = "REGISTERED VENDOR SDN BHD";
const REGISTRATION = "201801000900"; // a new-format SSM registration number

let ready = false; // 0011 surface present
let has13 = false; // 0013 (invoice.vendor_registration) applied
let world = null;
let owner = null;
let client = null;
let counterpartyId = null;

/** 0013 presence marker — _coding_lane_core's body references the registration
 *  field_path. Inspects the LIVE catalog only (never the migration file). */
async function has0013() {
  const r = await rootQuery(
    `select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
       where n.nspname='clara' and p.proname='_coding_lane_core'
         and position('invoice.vendor_registration' in p.prosrc) > 0 limit 1`,
  );
  return r.rows.length > 0;
}

/** Skip loudly + count when 0013 is absent (the WO's marker+count discipline). */
function skip13(t) {
  if (!has13) {
    markSkip();
    t.skip("Wave-A.1 vendor registration not present — 0013 not yet applied");
    return true;
  }
  return false;
}

/** Birth a REGISTERED counterparty: draft + approve a first HUMAN bill whose vendor
 *  proposal carries a registration_no. Returns the born counterparty id (or null). */
async function birthRegisteredVendor() {
  const firm = await firmOf(client);
  await grantConsent(owner, { firm, client }).catch(() => {});
  const first = await seedCitedDocument(owner, { firm, client, quote: "RM 5,000.00" });
  const d1 = await draftEntryV3(owner, {
    client,
    resolution: await freshResolution(owner, client, { subjectKind: "document", subjectId: first.documentId }),
    document: first.documentId, sha256: first.sha256, lines: billLines(EXP, AP, 500000),
    vendor: { new: { name: VENDOR, registration_no: REGISTRATION } },
    evidence: [ev(first.regionId, first.quote, FIELD.total)], opKey: opk("regbirth"),
  });
  await approveEntry(owner, { entry: d1.entry_id, expectedRevision: d1.revision_token, opKey: opk("regap") });
  const regNorm = REGISTRATION.toLowerCase().replace(/[^a-z0-9]/g, "");
  const cps = await counterpartyRows(client);
  return cps.find((c) => (c.registration_normalized ?? "") === regNorm)?.id ?? null;
}

/** A fresh cited + facts filing citing VENDOR by name. When `registration` is passed
 *  the facts ALSO carry an invoice.vendor_registration region; otherwise name-only
 *  (the pre-0013 shape). No draft yet — the DB computes the lane off the facts. */
async function targetFiling({ registration = null, amount = 700000 } = {}) {
  const firm = await firmOf(client);
  await grantConsent(owner, { firm, client }).catch(() => {});
  // 0016 (P3): classify-first gate — kind-stamped at seed so invoice_facts engages directly.
  const cited = await seedCitedDocument(owner, { firm, client, quote: "RM 5,000.00", kind: "invoice" });
  await enqueueInvoiceFacts(cited.documentId);
  const task = await invoiceFactsTask(cited.documentId);
  await claimTask(task.id, { egressApproved: true });
  const fields = [
    factField(FIELD.total, `RM ${(amount / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}`),
    factField(FIELD.currency, "MYR"),
    factField(FIELD.vendorName, VENDOR),
    factField(FIELD.invoiceId, `INV-${randomUUID().slice(0, 8)}`),
    // 0023 (X5): a corroborated OCR total must now STATE its arithmetic — this bill charges
    // no SST, so it states a zero tax and a net equal to its total.
    ...statedIdentityFields(amount),
  ];
  if (registration != null) {
    // Non-monetary: empty polygon is fine (it never corroborates a Tier-A total).
    fields.push(factField("invoice.vendor_registration", registration, { polygon: [], confidence: 0.9 }));
  }
  await persistInvoiceFacts(task.id, fields);
  return cited.filingId;
}

before(async () => {
  ready = await waveAEnsureReady();
  has13 = ready && (await has0013());
  if (!has13) {
    noteLane(ready ? "0013 not applied — vendor_registration marker absent" : "0011 surface absent");
    return;
  }
  world = await buildWorld();
  client = world.clients.A1;
  owner = world.users.alice;
  await upsertPayableAccount(owner, { client, code: "400-000", name: "Trade Creditors", opKey: opk("ap") });
  await upsertAccountClassed(owner, { client, code: "500-A01", name: "Prof Fees", type: "expense", opKey: opk("exp") });
  counterpartyId = await birthRegisteredVendor();
});
after(async () => { printSkipCount("wave-a1-vendor-registration"); await endPool(); });

test("setup sanity: a REGISTERED counterparty was born with a normalized registration", async (t) => {
  if (skip13(t)) return;
  assert.ok(counterpartyId, "the registered vendor counterparty was located");
  const cps = await counterpartyRows(client);
  const cp = cps.find((c) => c.id === counterpartyId);
  assert.ok(cp, "the born counterparty row is readable");
  assert.ok(cp.registration_normalized, "the counterparty carries a registration_normalized (a registered vendor)");
  assert.equal(cp.registration_normalized, REGISTRATION.toLowerCase().replace(/[^a-z0-9]/g, ""));
});

test("WITH invoice.vendor_registration → the registered vendor resolves and the lane is READY (not vendor_ambiguous)", async (t) => {
  if (skip13(t)) return;
  const filing = await targetFiling({ registration: REGISTRATION });
  const lane = await codingLane(humanPersona(owner), { client, filing });
  assert.ok(lane, "the filing computes a lane row");
  assert.ok(!lane.reasons.includes("vendor_ambiguous"),
    `registration must resolve the vendor (reasons: ${JSON.stringify(lane.reasons)})`);
  assert.ok(!lane.reasons.includes("vendor_unresolved"), "the registered vendor is neither ambiguous nor unresolved");
  assert.equal(lane.lane, "ready",
    `a registered vendor with a matching registration reaches READY (lane=${lane.lane}, reasons=${JSON.stringify(lane.reasons)})`);
});

test("WITHOUT invoice.vendor_registration → the SAME setup stays vendor_ambiguous (unchanged pre-0013 behavior)", async (t) => {
  if (skip13(t)) return;
  const filing = await targetFiling({ registration: null });
  const lane = await codingLane(humanPersona(owner), { client, filing });
  assert.ok(lane, "the filing computes a lane row");
  assert.ok(lane.reasons.includes("vendor_ambiguous"),
    `a name-only match against a REGISTERED vendor is still ambiguous (reasons: ${JSON.stringify(lane.reasons)})`);
  assert.notEqual(lane.lane, "ready", "an ambiguous vendor is never READY");
});
