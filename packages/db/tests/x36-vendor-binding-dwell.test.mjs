// Migration 0028 -- the vendor identity binding dwell predicate (task #36, team-lead's
// mandated cells). Part 1 Sec3.3 condition 3a: the evidence window's dwell requirement is
// COLLECTIVE over the three-document window as a set -- three DISTINCT posting_date values
// AND max(posting_date)-min(posting_date) >= 14 days -- computed fresh on every derivation,
// never a per-document comparison against any fixed date. This file proves exactly that
// against clara._derive_vendor_binding_proposal directly (the shared derivation body
// propose/sign both call), using the four cells the work order specified:
//   1. {2025-08-25, 2025-08-29, 2025-10-13} -- the real live window shape -- PASSES.
//   2. {25/08, 25/08, 29/08} -- FAILS on both conjuncts separately provable (2 distinct
//      dates; 4-day span).
//   3. {25/08, 29/08, 05/09} -- FAILS on span alone (3 distinct, 11 days).
//   4. {25/08, 25/08, 13/10} -- FAILS on distinctness alone (49-day span, 2 dates).
//
// Cases 2-4 fail the dwell gate BEFORE _derive_vendor_binding_proposal ever reaches F1/F2/F3
// (the function's own order: evidence count -> dwell -> restated -> F1 -> F2 -> F3), so their
// fixtures only need entries/documents wired well enough to reach the dwell check -- they do
// NOT need F1/F2/F3-satisfying extractions/regions. Case 1 is the one cell that must clear
// every later gate too, so it carries the full EZSEC-shaped fixture (matching F1/F2/F3).
//
// Fixtures live in x36-vendor-binding-helpers.mjs (shared with x36-vendor-binding-ceremony).
// Serial discipline: --test-concurrency=1 (shared rig convention).

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { endPool } from "./rig-helpers.mjs";
import { noteLane, printLaneNotes } from "./rig-runtime-helpers.mjs";
import { buildWorld } from "./x1-helpers.mjs";
import {
  has28, seedPayableAccount, seedVendorCounterparty, seedBareDocument,
  seedApprovedEntry, seedF123Evidence, deriveOrError,
} from "./x36-vendor-binding-helpers.mjs";

let has0028 = false;
let w = null;

before(async () => {
  has0028 = await has28();
  if (!has0028) { noteLane("0028 absent -- x36-vendor-binding-dwell battery FAILS loudly rather than skipping"); return; }
  w = await buildWorld();
  await seedPayableAccount(w.firms.A, w.clients.A1);
});
after(async () => { printLaneNotes("x36-vendor-binding-dwell"); await endPool(); });

function requireReady() {
  if (!has0028) {
    throw new Error(
      "0028 NOT applied (clara.schema_migrations has no '0028_%' row) -- this battery is "
      + "REQUIRED to fail against the 27-migration prestate.");
  }
}

// ---------------------------------------------------------------------------

test("x36 readiness", () => { requireReady(); assert.ok(w, "world built"); });

test("x36.1 DWELL cell 1 -- {2025-08-25, 2025-08-29, 2025-10-13} PASSES (the real live window shape)", async () => {
  requireReady();
  const cp = await seedVendorCounterparty(w.firms.A, w.clients.A1, "D1");
  const invoiceId = `EZSEC-IV-${randomUUID().slice(0, 5)}`;
  const dates = ["2025-08-25", "2025-08-29", "2025-10-13"];
  const docs = [];
  for (const d of dates) {
    const doc = await seedBareDocument(w.firms.A, `dwell1-${d}`);
    await seedF123Evidence(w.firms.A, doc.id, cp, invoiceId);
    // approved_at must be real-clock-recent, AFTER the extraction rows above (the
    // evidence_restated gate compares extraction creation against the entry's approval,
    // never against posting_date). posting_date carries the historical accounting date;
    // approved_at models "when the human actually clicked approve" -- realistically close
    // to now, not backdated to the posting date. Leave it unset -> defaults to now().
    await seedApprovedEntry(w.firms.A, w.clients.A1, cp.id, doc, { postingDate: d });
    docs.push(doc);
  }
  const out = await deriveOrError(w.firms.A, w.clients.A1, cp.id);
  assert.equal(out.ok, true, `cell 1 must pass every gate including dwell, got: ${JSON.stringify(out)}`);
  assert.equal(out.receipt.counterparty_id, cp.id);
});

test("x36.2 DWELL cell 2 -- {25/08, 25/08, 29/08} FAILS: 2 distinct dates AND a 4-day span, both conjuncts", async () => {
  requireReady();
  const cp = await seedVendorCounterparty(w.firms.A, w.clients.A1, "D2");
  const dates = ["2025-08-25", "2025-08-25", "2025-08-29"];
  for (const [i, d] of dates.entries()) {
    const doc = await seedBareDocument(w.firms.A, `dwell2-${i}`);
    await seedApprovedEntry(w.firms.A, w.clients.A1, cp.id, doc, { postingDate: d, approvedAt: `2025-08-${25 + i}T12:00:00Z` });
  }
  const out = await deriveOrError(w.firms.A, w.clients.A1, cp.id);
  assert.equal(out.ok, false, "cell 2 must refuse -- only 2 distinct dates in a 4-day span");
  assert.match(out.message, /window_too_recent/, `expected window_too_recent, got: ${out.message}`);
});

test("x36.3 DWELL cell 3 -- {25/08, 29/08, 05/09} FAILS on span alone: 3 distinct dates, 11-day span", async () => {
  requireReady();
  const cp = await seedVendorCounterparty(w.firms.A, w.clients.A1, "D3");
  const dates = ["2025-08-25", "2025-08-29", "2025-09-05"];
  for (const [i, d] of dates.entries()) {
    const doc = await seedBareDocument(w.firms.A, `dwell3-${i}`);
    await seedApprovedEntry(w.firms.A, w.clients.A1, cp.id, doc, { postingDate: d, approvedAt: `2025-0${d.slice(5, 7) === "08" ? "8" : "9"}-${d.slice(8, 10)}T12:00:00Z` });
  }
  const out = await deriveOrError(w.firms.A, w.clients.A1, cp.id);
  assert.equal(out.ok, false, "cell 3 must refuse -- 3 distinct dates but only an 11-day span (needs >=14)");
  assert.match(out.message, /window_too_recent/, `expected window_too_recent, got: ${out.message}`);
});

test("x36.4 DWELL cell 4 -- {25/08, 25/08, 13/10} FAILS on distinctness alone: 49-day span, only 2 distinct dates", async () => {
  requireReady();
  const cp = await seedVendorCounterparty(w.firms.A, w.clients.A1, "D4");
  const dates = ["2025-08-25", "2025-08-25", "2025-10-13"];
  const approvedAts = ["2025-08-25T10:00:00Z", "2025-08-25T14:00:00Z", "2025-10-13T12:00:00Z"];
  for (const [i, d] of dates.entries()) {
    const doc = await seedBareDocument(w.firms.A, `dwell4-${i}`);
    await seedApprovedEntry(w.firms.A, w.clients.A1, cp.id, doc, { postingDate: d, approvedAt: approvedAts[i] });
  }
  const out = await deriveOrError(w.firms.A, w.clients.A1, cp.id);
  assert.equal(out.ok, false, "cell 4 must refuse -- a 49-day span does not save only 2 distinct dates");
  assert.match(out.message, /window_too_recent/, `expected window_too_recent, got: ${out.message}`);
});
