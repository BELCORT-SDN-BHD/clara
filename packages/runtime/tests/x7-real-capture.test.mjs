// THE A1 GATE — X7 measured against the REAL documents instead of against its own assumptions.
//
// Every other X7 cell is synthetic, and F7's first cut passed all 96 of them while failing on
// live. The difference is not test count: the synthetic corpus was authored by the same reasoning
// that authored the reader, so it could only ever confirm that reasoning. THESE CELLS CANNOT — the
// geometry in `x7-kongcheng-real.mjs` came off Azure, and the answer came off the paper.
//
// THE CROWN CELL is the first one below. If it ever goes red, the F7 fix is broken on the two
// invoices it exists to unblock, whatever the other 96 say.

import assert from "node:assert/strict";
import test from "node:test";
import { normalizeAzureInvoice } from "../workflows/invoiceFacts.v1.azure.mjs";
import { REAL_KONG_CHENG, REAL_BUYER, REAL_CONTACT, RSINV_250601 } from "./x7-kongcheng-real.mjs";

const rowsFor = (result, path) => result.fields.filter((f) => f.field_path === path);
const valueOf = (result, path) => rowsFor(result, path)[0]?.value_raw ?? null;

for (const { name, payload } of REAL_KONG_CHENG) {
  test(`A1 CROWN CELL — ${name}: the BOXED PARTY is the customer, not the Attn person`, () => {
    const result = normalizeAzureInvoice(payload);
    assert.equal(valueOf(result, "invoice.customer_name"), REAL_BUYER);
  });

  test(`A1 — ${name}: the person is emitted as the CONTACT, exactly once, and never as the party`, () => {
    const result = normalizeAzureInvoice(payload);
    assert.equal(valueOf(result, "invoice.contact_person"), REAL_CONTACT);
    // ONE ROW PER FIELD PATH. `persist_invoice_facts` forfeits the WHOLE extraction on conflicting
    // text duplicates (0026:810-819) — which would take the working `invoice.total` down with it.
    assert.equal(rowsFor(result, "invoice.customer_name").length, 1);
    assert.equal(rowsFor(result, "invoice.contact_person").length, 1);
  });

  test(`A1 — ${name}: the receipt names the mechanism (label surface EMPTY, sweep generated)`, () => {
    const receipt = normalizeAzureInvoice(payload).envelope.customer_identity;
    // THE DEFECT SIGNATURE, pinned. `split_line_scanned: 0` with zero refusals in every party head
    // is what the live v10 receipts showed: the label surface found nothing to judge, because
    // these documents print no bill-to label. That has NOT changed — the sweep is what fires.
    assert.equal(receipt.split_line_scanned, 0);
    assert.equal(receipt.anchor_sweep_ran, 1);
    assert.equal(receipt.outcome, "attn_overridden");
    assert.equal(receipt.typed_overridden_attn, 1);
    assert.equal(receipt.attn_key, "lim xiao shan");
    // UNIQUENESS HELD WITH ROOM, not by luck: exactly one line in the anchor's neighbourhood
    // clears the entity-suffix wall on each document.
    assert.equal(receipt.occurrences, 1);
    assert.equal(receipt.contested, 0);
  });

  test(`A1 — ${name}: the SELLER never becomes the buyer`, () => {
    // The seller's own letterhead line, `ROME SECRETARY SDN BHD`, clears BOTH positive walls — it
    // is name-shaped and registered-suffixed — so the only thing keeping it off the ballot is
    // geometry: 2.205in from the typed customer anchor against a 1.0in gate. Measured on this
    // capture, and the reason broadening generation to the anchor's neighbourhood is safe.
    const result = normalizeAzureInvoice(payload);
    assert.equal(valueOf(result, "invoice.customer_name"), REAL_BUYER);
    // NOT asserted as an equality against `ROME SECRETARY SDN BHD`: Azure types VendorName as the
    // LOGO (`M\nROME\nSECRETARY`) on both documents and X6 abstains, so `vendor_name` passes
    // through as that. Confirmed identical on live (capture v2). Out of F7's scope; recorded here
    // rather than quietly asserted away, because it is also WHY the vendor anchor is a logo block.
    assert.equal(valueOf(result, "invoice.vendor_name"), "M\nROME\nSECRETARY");
  });
}

test("A1 — the v1→v2 REGRESSION DIFF signature is flipped", () => {
  // The live pair is the fix's own before/after, for free. v1 emitted 7 field paths; v2 emitted 8,
  // the single addition being `contact_person` — while `customer_name` stayed BYTE-IDENTICAL. That
  // last clause IS the defect. A future version that re-narrows generation would reproduce it
  // silently (contact still emitted, everything else green), so it is asserted head-on.
  //
  // SCOPED TO WHAT THE FIXTURE CAN PRODUCE. Live also emitted `invoice.currency` (MYR) and
  // `invoice.vendor_registration` (202501019265); both ride typed Azure fields / content surfaces
  // the fixture does not transcribe (see its header). Asserting the full live path set here would
  // assert the fixture's own incompleteness, so the cell asserts the X7 DELTA instead.
  const result = normalizeAzureInvoice(RSINV_250601);
  const paths = new Set(result.fields.map((f) => f.field_path));
  assert.equal(paths.has("invoice.contact_person"), true, "v2's one added path");
  assert.equal(paths.has("invoice.customer_name"), true);
  assert.notEqual(valueOf(result, "invoice.customer_name"), REAL_CONTACT, "the defect: byte-identical to v1");
  assert.equal(valueOf(result, "invoice.customer_name"), REAL_BUYER);
});

test("RULING 2 — a known person is WITHDRAWN, never passed through as a confident customer", () => {
  // The real document with its one party line deleted: the F7 shape with no reachable party. This
  // is a DERIVED probe, stated as such — the fixture's own data is never edited. Before this
  // ruling the typed row stood, so the same person shipped twice: honestly as `contact_person`
  // and again as `customer_name`. The honest outcome is the FINCARE shape — no customer at all,
  // `customer_name_missing`, needs_review, where a human already looks.
  const stripped = structuredClone(RSINV_250601);
  const page = stripped.analyzeResult.pages[0];
  const before = page.lines.length;
  page.lines = page.lines.filter((l) => l.content !== REAL_BUYER);
  assert.equal(page.lines.length, before - 1, "the probe must actually remove the buyer line");

  const result = normalizeAzureInvoice(stripped);
  assert.equal(rowsFor(result, "invoice.customer_name").length, 0);
  assert.equal(valueOf(result, "invoice.contact_person"), REAL_CONTACT);

  const receipt = result.envelope.customer_identity;
  assert.equal(receipt.outcome, "attn_withdrawn");
  assert.equal(receipt.typed_withdrawn_attn, 1);
  // The withdraw is driven by a POSITIVE contact read, never by an absence.
  assert.equal(receipt.attn_matched, 1);
  assert.equal(receipt.attn_key, "lim xiao shan");
});

test("RULING 2 does NOT fire when typed disagrees with the accepted contact", () => {
  // The guard is an EQUALITY on a measured contact, not "there is a contact, so drop the typed
  // name". A typed value the reader has nothing to say about must still stand byte-identically —
  // that silence is the reader's oldest law and this ruling does not widen into it.
  const probe = structuredClone(RSINV_250601);
  probe.analyzeResult.pages[0].lines = probe.analyzeResult.pages[0].lines
    .filter((l) => l.content !== REAL_BUYER);
  probe.analyzeResult.documents[0].fields.CustomerName.content = "SOME OTHER PARTY SDN BHD";

  const result = normalizeAzureInvoice(probe);
  assert.equal(valueOf(result, "invoice.customer_name"), "SOME OTHER PARTY SDN BHD");
  assert.equal(valueOf(result, "invoice.contact_person"), REAL_CONTACT);
  assert.equal(result.envelope.customer_identity.typed_withdrawn_attn, 0);
});
