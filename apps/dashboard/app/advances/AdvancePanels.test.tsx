// EnrolPanel render tests (the AgingWorkbench.test.tsx house style:
// renderToStaticMarkup, no DOM driver).
//
// THE CELL THAT FAILS WITHOUT THE FIX: an ACTIVE enrolment with no disbursed
// advance used to appear on NO surface, so it could not be retired from anywhere
// in the product — while its reservation walled its account code out of the FA
// account profile, the K-doc opening seed, the bank-account binding and the FA
// reversal door, whose refusal (`coa_account_advance_reserved`) NAMES
// `retire_staff_advance_account` as the remedy.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { EnrolPanel } from "./AdvancePanels";
import type { StaffAdvanceSummaryRow, StaffAdvanceTieRead } from "./advancesModel";

const noop = () => {};

function tie(accounts: Partial<StaffAdvanceTieRead["accounts"][number]>[], available = true): StaffAdvanceTieRead {
  return {
    client_id: "c1", as_of: "2026-08-03", tie: true, available,
    accounts: accounts.map((a) => ({
      account_code: "", register_cents: 0, gl_cents: 0, difference_cents: 0,
      out_of_window_cents: 0, explained: true, advance_count: 0, incomplete_count: 0,
      active_enrolment_id: null, ...a,
    })),
  };
}

function summaryRow(over: Partial<StaffAdvanceSummaryRow>): StaffAdvanceSummaryRow {
  return {
    enrolment_id: "", account_code: "", person_label: "", advance_id: "",
    issue_date: null, amount_cents: null, outstanding_cents: null, days_outstanding: null,
    purpose: null, reference: null, particulars_complete: false, enrolment_active: true,
    voided: false, ...over,
  };
}

function render(rows: StaffAdvanceSummaryRow[], t: StaffAdvanceTieRead): string {
  return renderToStaticMarkup(
    createElement(EnrolPanel, { token: "jwt", clientId: "c1", rows, tie: t, onChanged: noop }),
  );
}

test("an ACTIVE enrolment with no disbursed advance is retirable — the tie is its only witness", () => {
  const html = render([], tie([{ account_code: "350-009", active_enrolment_id: "en-9", advance_count: 0 }]));
  assert.ok(html.includes("350-009"), "the enrolment must appear at all");
  assert.ok(html.includes("Retire"), "a retire affordance must be offered for it");
  assert.ok(html.includes("Retire reason for 350-009"), "the retire control must be bound to THAT account");
  assert.ok(html.includes("no advance disbursed"), "and the surface must say why it has no register rows");
});

test("an enrolment visible on BOTH reads is listed once, with the summary's person label", () => {
  const html = render(
    [summaryRow({ enrolment_id: "en-1", account_code: "350-003", person_label: "Ali", advance_id: "a1" })],
    tie([{ account_code: "350-003", active_enrolment_id: "en-1", advance_count: 1 }]),
  );
  assert.equal(html.split("350-003").length - 1, 2, "one row (code cell + aria-label), never a duplicate row");
  assert.ok(html.includes("Ali"));
  assert.ok(!html.includes("no advance disbursed"));
});

test("a RETIRED generation that still holds advances stays listed (the summary's own witness)", () => {
  const html = render(
    [summaryRow({ enrolment_id: "en-0", account_code: "350-001", person_label: "Siti", advance_id: "a0", enrolment_active: false })],
    tie([]),
  );
  assert.ok(html.includes("Siti"));
  assert.ok(html.includes("retired"));
});

test("an UNAVAILABLE tie says so — an empty table must never read as 'nothing is enrolled'", () => {
  const html = render([], tie([], false));
  assert.ok(html.includes("unexpected shape"), "half this list's source failed; the surface must not claim emptiness");
  assert.ok(!html.includes("No advance accounts enrolled"));
});

test("a genuinely empty client says so plainly", () => {
  const html = render([], tie([]));
  assert.ok(html.includes("No advance accounts enrolled on this client yet."));
});

// WHAT THIS FIX DOES NOT THINK OF, stated rather than discovered:
//   * `staff_advance_tie` emits only the ACTIVE enrolment id per code
//     (`active_enrolment_id`). A RETIRED enrolment that never disbursed an advance
//     appears on neither read and is still invisible here — harmless today because
//     a retired enrolment reserves nothing, so no door is walled by it.
//   * The panel offers retire for every listed enrolment; the DB refuses
//     `advance_outstanding_on_retire` while any advance under it is open. That
//     refusal is surfaced verbatim (no local gating) — the /assets precedent.
//   * There is still no dedicated enrolment-LIST read in the ABI. This union is
//     the best the two existing reads can prove; a first-class read would make it
//     unnecessary and is left for the owner.
