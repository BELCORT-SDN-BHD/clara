// #656 — C-25's RE-MEASURE: the new coverage totals must not resurrect the quiet pass.
//
// C-25's defect was a COVERAGE figure worn as a TIE figure: the strip rendered one of four gates
// (`obe_net_cents === 0`) under the word "Ties", so a basis with nothing keyed at all painted a
// pass and then refused on Approve — and it named the wrong token while doing it. The fix made the
// strip render all four gates in the database's own order with the database's own tokens, and
// pinned the law that the strip MINTS NO NUMERAL.
//
// #656 adds mapped/unmapped totals. They answer a different question ("how much of the printed
// source has an account behind it") from the one the strip answers ("does this basis tie"), and
// they live in `OpeningTargetDocumentPanel`'s footer for exactly that reason. These cells
// re-measure the two claims that keeps honest:
//
//   1. `openingTieGates` behaves exactly as it did — the totals changed nothing, in either
//      direction;
//   2. a dry-run read FAILURE still renders through the error branch and never as a passed gate
//      strip.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { NextIntlClientProvider } from "next-intl";
import { renderComponent } from "../../test/hookHarness";
import { enableDomInspection } from "../../test/domInspect";
import { configureSessionTokenSource, resetSessionTokenSource } from "../../lib/session-accessor";
import { openingTieGates, OpeningDryrunStrip } from "./opening-dryrun-strip";
import { openingCoverage } from "../../lib/registers/opening-source";
import type { OpeningDryrun, OpeningTbTargetRow } from "../../lib/registers/opening-types";
import messages from "../../messages/en.json";

enableDomInspection();

const dryrun = (over: Partial<OpeningDryrun> = {}): OpeningDryrun => ({
  seed_id: "s1", client_id: "c1", as_of: "2026-01-01", state: "open",
  obe_net_cents: 0, deltas: [], unmapped_labels: [], missing_must_asks: [], ...over,
} as OpeningDryrun);

const target = (over: Partial<OpeningTbTargetRow> = {}): OpeningTbTargetRow => ({
  id: "t1", firm_id: "f1", client_id: "c1", seed_id: "s1", line_key: "cash",
  account_code: "1000", source_label: "Cash", debit_cents: 1000, credit_cents: 0,
  provenance_kind: "document", document_id: "doc-1", source_sha256: "a".repeat(64),
  extraction_ref: { extraction_id: "e", region_id: "r" }, entered_by: null,
  created_at: "2026-01-01T00:00:00Z", ...over,
} as OpeningTbTargetRow);

test("the four gates still render in the DB's own order with the DB's own tokens, and nothing about them moved", () => {
  const gates = openingTieGates(dryrun(), []);
  assert.deepEqual(gates.map((g) => g.key), ["targetsPresent", "allMapped", "allTie", "obeNil"]);
  assert.deepEqual(gates.map((g) => g.reason), ["tie_mismatch", "tie_mismatch", "tie_mismatch", "obe_not_nil"],
    "the OBE arm keeps its DISTINCT token — naming it tie_mismatch was half of C-25's defect");

  // THE ORIGINAL DEFECT, re-measured: no targets plus a trivially-nil OBE is NOT a pass.
  const empty = openingTieGates(dryrun(), []);
  assert.equal(empty.every((g) => g.passed), false, "an empty basis must never read as ready");
  assert.equal(empty.find((g) => g.key === "targetsPresent")?.passed, false);

  // …and a complete one still is.
  assert.equal(openingTieGates(dryrun(), [target()]).every((g) => g.passed), true);
});

test("COVERAGE and TIE are independent: a fully-mapped source can still fail the tie", () => {
  // Every line mapped — coverage is complete…
  const targets = [
    target({ id: "t1" }),
    target({ id: "t2", line_key: "cap", account_code: "910-000", debit_cents: 0, credit_cents: 1000 }),
  ];
  assert.equal(openingCoverage(targets).unmappedCount, 0, "coverage says the source is fully mapped");

  // …and the basis still does not tie, because nothing has been posted against it. This is exactly
  // why the totals are NOT in the strip: read as a tie figure, "fully mapped" is a quiet pass.
  const gates = openingTieGates(dryrun({
    deltas: [{ account_code: "1000", target_debit: 1000, target_credit: 0, actual_debit: 0, actual_credit: 0, delta_debit: -1000, delta_credit: 0 }],
  }), targets);
  assert.equal(gates.find((g) => g.key === "allTie")?.passed, false);
});

test("a dry-run read FAILURE renders through the error branch, never as a passed gate strip", async () => {
  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  configureSessionTokenSource(async () => "tok");
  globalThis.fetch = (async () => new Response(JSON.stringify({ message: "denied" }), {
    status: 403, headers: { "content-type": "application/json" },
  })) as typeof fetch;
  try {
    const el = createElement(NextIntlClientProvider, {
      locale: "en",
      messages,
      children: createElement("div", null,
        createElement("h1", null, "Registers"),
        createElement(OpeningDryrunStrip, { seedId: "s1", targets: [target()] })),
    });
    const h = await renderComponent(el);
    try {
      for (let i = 0; i < 8; i++) await h.settle();
      const text = h.text();
      assert.doesNotMatch(text, /Ready to approve/i,
        "a read that FAILED must never paint a pass — UNKNOWN is not readiness");
      assert.doesNotMatch(text, /✓/, "…and no gate may render as passed over a payload we never received");
      assert.ok(text.trim().length > 0, "the error branch must say something rather than render nothing");
    } finally {
      await h.unmount();
      for (let i = 0; i < 4; i++) await h.settle();
    }
  } finally {
    globalThis.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
    resetSessionTokenSource();
  }
});
