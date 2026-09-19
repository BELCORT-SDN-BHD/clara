// #656 — `OpeningTargetDocumentPanel`, the tied-seed target surface that did not exist.
//
// `opening-seed-workbench.tsx` mounted `OpeningTargetKeyedPanel` only when `!seed.tie_document_id`,
// so a basis bound to a document rendered its four tie gates over targets NOBODY COULD SEE. These
// cells hold the three claims the panel makes:
//
//   1. provenance renders for a document row and for a keyed row, and the document row carries the
//      three things that make a figure traceable: the document, its sha-12 and the REGION id;
//   2. an unmapped row is an ACTION, never a dash — "—" says "nothing here", when what is true is
//      "this line still needs an account";
//   3. the footer's mapped/unmapped counts AND cents are right, and carry NO PERCENTAGE. It is a
//      COVERAGE figure, labelled as one, and it lives outside `OpeningDryrunStrip` because a
//      coverage figure worn as a tie figure is exactly C-25's defect.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { NextIntlClientProvider } from "next-intl";
import { renderComponent, textOf } from "../../test/hookHarness";
import { enableDomInspection } from "../../test/domInspect";
import { openingCoverage, provenanceOf, shaShort } from "../../lib/registers/opening-source";
import { OpeningTargetDocumentPanel } from "./opening-target-document-panel";
import type { OpeningSeedRow, OpeningTbTargetRow } from "../../lib/registers/opening-types";
import messages from "../../messages/en.json";

enableDomInspection();

const SHA = "b3d9".padEnd(64, "0");

const SEED: OpeningSeedRow = {
  id: "s1", firm_id: "f1", client_id: "c1", plan_id: "p1", as_of: "2026-01-01", state: "open",
  tie_document_id: "doc-1", tie_document_sha256: SHA, created_by: "u1",
  created_at: "2026-01-01T00:00:00Z", batch_n: 0, finalized_at: null, finalized_by: null,
  tie_asserted_at: null, through_event_seq: null, cancelled_at: null, cancelled_by: null,
  cancel_reason: null,
};

function target(over: Partial<OpeningTbTargetRow> & { id: string; line_key: string }): OpeningTbTargetRow {
  return {
    firm_id: "f1", client_id: "c1", seed_id: "s1",
    account_code: "1000", source_label: "Cash and bank",
    debit_cents: 10_500_000, credit_cents: 0,
    provenance_kind: "document", document_id: "doc-1", source_sha256: SHA,
    extraction_ref: { extraction_id: "ext-1", region_id: "reg-7" }, entered_by: null,
    created_at: "2026-01-02T00:00:00Z",
    ...over,
  } as OpeningTbTargetRow;
}

// ---------------------------------------------------------------------------------------------
// Pure: the two helpers the panel is built on.
// ---------------------------------------------------------------------------------------------

test("provenanceOf reads a document row's evidence and a keyed row's author, and never mixes them", () => {
  const doc = provenanceOf(target({ id: "t1", line_key: "r:reg-7" }));
  assert.deepEqual(doc, { kind: "document", documentId: "doc-1", sha256: SHA, regionId: "reg-7", extractionId: "ext-1" });

  const keyed = provenanceOf(target({
    id: "t2", line_key: "cash", provenance_kind: "keyed",
    document_id: null, source_sha256: null, extraction_ref: null, entered_by: "u9",
  }));
  assert.deepEqual(keyed, { kind: "keyed", enteredBy: "u9" });

  // A document row whose extraction_ref is malformed degrades to "no region", never to a crash and
  // never to a fabricated id.
  const odd = provenanceOf(target({ id: "t3", line_key: "x", extraction_ref: { region_id: 42 } }));
  assert.equal(odd.kind === "document" ? odd.regionId : "n/a", null);
});

test("shaShort is twelve characters, and an absent sha is empty rather than 'null'", () => {
  assert.equal(shaShort(SHA), SHA.slice(0, 12));
  assert.equal(shaShort(null), "");
  assert.equal(shaShort("short"), "");
});

test("openingCoverage counts rows and sums BOTH sides, and mints no percentage", () => {
  const rows = [
    target({ id: "t1", line_key: "a", debit_cents: 1000, credit_cents: 0 }),
    target({ id: "t2", line_key: "b", debit_cents: 0, credit_cents: 700 }),
    target({ id: "t3", line_key: "c", account_code: null, debit_cents: 0, credit_cents: 300, provenance_kind: "keyed", document_id: null, source_sha256: null, extraction_ref: null, entered_by: "u9" }),
  ];
  assert.deepEqual(openingCoverage(rows), {
    mappedCount: 2, unmappedCount: 1,
    mappedDebitCents: 1000, mappedCreditCents: 700,
    unmappedDebitCents: 0, unmappedCreditCents: 300,
  });
  // An empty basis is all zeros — never a divide-by-zero, never "100% mapped".
  assert.deepEqual(openingCoverage([]), {
    mappedCount: 0, unmappedCount: 0,
    mappedDebitCents: 0, mappedCreditCents: 0, unmappedDebitCents: 0, unmappedCreditCents: 0,
  });
  // An account code that is only whitespace is NOT a mapping.
  assert.equal(openingCoverage([target({ id: "t4", line_key: "d", account_code: "  " })]).unmappedCount, 1);
});

// ---------------------------------------------------------------------------------------------
// The panel.
// ---------------------------------------------------------------------------------------------

async function mount(targets: OpeningTbTargetRow[], documentName: string | null = "TB-2025.pdf") {
  const el = createElement(NextIntlClientProvider, {
    locale: "en",
    messages,
    children: createElement("div", null,
      createElement("h1", null, "Registers"),
      createElement(OpeningTargetDocumentPanel, { clientId: "c1", seed: SEED, targets, documentName })),
  });
  const h = await renderComponent(el);
  for (let i = 0; i < 4; i++) await h.settle();
  return h;
}

test("a document row renders the source label AS PRINTED, its provenance badge, the document, the sha-12 and the region", async () => {
  const h = await mount([target({ id: "t1", line_key: "r:reg-7", source_label: "CASH AT BANK" })]);
  try {
    const body = h.text();
    assert.match(body, /CASH AT BANK/, "the label the SOURCE printed, not the chart's name for the account");
    assert.match(body, /Document/, "the provenance badge names the lane");
    assert.match(body, /TB-2025\.pdf/, "…the document it was read from");
    assert.match(body, new RegExp(SHA.slice(0, 12)), "…its sha-12");
    assert.match(body, /reg-7/, "…and the exact region, so the figure is traceable to a place on the page");
  } finally {
    await h.unmount();
  }
});

test("a keyed row renders as keyed and carries no document, sha or region", async () => {
  const h = await mount([target({
    id: "t1", line_key: "cash", provenance_kind: "keyed",
    document_id: null, source_sha256: null, extraction_ref: null, entered_by: "u9",
  })]);
  try {
    const body = h.text();
    assert.match(body, /Keyed/);
    assert.doesNotMatch(body, /reg-7/, "a keyed figure has no region to cite, and must not borrow one");
  } finally {
    await h.unmount();
  }
});

test("an UNMAPPED row renders as an ACTION linking to the chart, never as a dash", async () => {
  const h = await mount([target({
    id: "t1", line_key: "re", account_code: null, source_label: "Retained earnings",
    provenance_kind: "keyed", document_id: null, source_sha256: null, extraction_ref: null, entered_by: "u9",
  })]);
  try {
    const link = h.find((n) => n.tagName === "A" && textOf(n).includes("Map this line"));
    assert.ok(link, "an unmapped line must offer the act that resolves it");
    // The stub DOM's `setAttribute` is a no-op (hookHarness.ts's own mkNode), so the href is read
    // off the props React itself assigned — the same mechanism `clickButton`/`setFieldValue` use,
    // and the idiom components/clara/onboarding-begin-keyboard.test.tsx:145 already carries.
    const propsKey = Object.keys(link).find((k) => k.startsWith("__reactProps"));
    const href = propsKey ? (link[propsKey] as { href?: string }).href : undefined;
    assert.equal(href, "/clients/c1/registers?tab=accounts",
      "…and point at the register where an account is actually created");
    // The em dash `—` is what the keyed panel renders for an absent account; this panel must not.
    const cells = [] as string[];
    h.find((n) => { if (n.tagName === "TD") cells.push(textOf(n)); return false; });
    assert.ok(!cells.includes("—"), `no cell may render a bare dash for an unmapped account: ${JSON.stringify(cells)}`);
  } finally {
    await h.unmount();
  }
});

test("the footer states coverage as counts AND cents on both sides, labelled as coverage, with no percentage", async () => {
  const h = await mount([
    target({ id: "t1", line_key: "a", debit_cents: 10_500_000, credit_cents: 0 }),
    target({ id: "t2", line_key: "b", debit_cents: 0, credit_cents: 10_500_000 }),
    target({
      id: "t3", line_key: "c", account_code: null, debit_cents: 0, credit_cents: 25_000,
      provenance_kind: "keyed", document_id: null, source_sha256: null, extraction_ref: null, entered_by: "u9",
    }),
  ]);
  try {
    const footer = h.find((n) => n.tagName === "DL");
    assert.ok(footer, "the coverage footer must render as a description list, not loose text");
    const ariaLabel = (footer as unknown as { getAttribute?: (k: string) => string | null }).getAttribute?.("aria-label");
    assert.match(String(ariaLabel ?? ""), /mapped/i,
      "the footer says out loud that it is about COVERAGE — it is not the tie");
    const text = textOf(footer);
    assert.match(text, /Mapped/);
    assert.match(text, /2 line\(s\)/);
    assert.match(text, /Not yet mapped/);
    assert.match(text, /1 line\(s\)/);
    assert.match(text, /105,000\.00/, "cents are rendered, both sides, from the DB's own figures");
    assert.match(text, /250\.00/);
    assert.doesNotMatch(text, /%/, "NO PERCENTAGE: an opening basis is complete or it is not");
  } finally {
    await h.unmount();
  }
});

test("on a wholly document-sourced basis the footer STATES that an unmapped line is impossible, instead of printing a zero (fix-round A10)", async () => {
  // R5, on the rendered face. `unmappedCount` is STRUCTURALLY always 0 here — two database walls
  // make a parsed target both source-exact and chart-present — so "Not yet mapped: 0 line(s),
  // Dr 0.00 / Cr 0.00" renders a CONSTANT as if it were a measurement, and a reader who does not
  // know R5 reads it as "everything is mapped". That is C-25's defect one layer down: a figure
  // that cannot say anything else, read as if it had.
  const h = await mount([
    target({ id: "t1", line_key: "a", debit_cents: 10_500_000, credit_cents: 0 }),
    target({ id: "t2", line_key: "b", debit_cents: 0, credit_cents: 10_500_000 }),
  ]);
  try {
    const footer = h.find((n) => n.tagName === "DL");
    assert.ok(footer, "the coverage footer must still render");
    const text = textOf(footer);
    assert.match(text, /Mapped/, "the mapped side is a real measurement and stays");
    assert.match(text, /2 line\(s\)/);
    assert.doesNotMatch(text, /0 line\(s\)/,
      "a count that can only ever be zero is not a coverage figure");
    assert.doesNotMatch(text, /Dr RM 0\.00/, "…and neither is a zero on each side of it");
    assert.match(text, /cannot carry an unmapped line/,
      "…the structural fact is SAID instead, so the reader learns why there is no such count");
    assert.match(text, /Not yet mapped/,
      "the TERM stays, so the row a person looks for is still there to read");
  } finally {
    await h.unmount();
  }
});

test("a basis carrying a KEYED row keeps the numeric unmapped count — it is a real state there", async () => {
  const h = await mount([
    target({ id: "t1", line_key: "a", debit_cents: 10_500_000, credit_cents: 0 }),
    target({
      id: "t2", line_key: "c", account_code: null, debit_cents: 0, credit_cents: 25_000,
      provenance_kind: "keyed", document_id: null, source_sha256: null, extraction_ref: null, entered_by: "u9",
    }),
  ]);
  try {
    const footer = h.find((n) => n.tagName === "DL");
    assert.ok(footer, "the coverage footer must still render");
    const text = textOf(footer);
    assert.match(text, /Not yet mapped/);
    assert.match(text, /1 line\(s\)/);
    assert.match(text, /250\.00/);
  } finally {
    await h.unmount();
  }
});

test("a tied basis with nothing read yet renders the successful-empty state, not an error", async () => {
  const h = await mount([]);
  try {
    assert.match(h.text(), /Nothing has been read from this document yet/);
    assert.match(h.text(), /Bound to TB-2025\.pdf/, "…and it still says WHICH document it is bound to");
  } finally {
    await h.unmount();
  }
});
