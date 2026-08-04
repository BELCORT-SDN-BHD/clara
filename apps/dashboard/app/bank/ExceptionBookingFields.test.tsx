// The AF-2 exception booking surface — round-3 render cells (the
// ReconciliationSnapshotTables.test.tsx pattern: createElement +
// renderToStaticMarkup, no jsdom).
//
// Round 3's standing instruction: a cell that only walks the path the fix took
// proves nothing. So these do NOT merely assert that the settlement control
// exists. They assert the two PROPERTIES that would have caught the original
// defect without anyone knowing which button was broken:
//   P1. NO submit control in this surface is enabled while the request it would
//       send is inadmissible — checked by rendering the surface's own initial
//       state and looking for an enabled submit, not by naming a button.
//   P2. Every disabled submit is accompanied by the REASON, so a control that
//       cannot act always says why.
// Plus the direct regression pin: the dead "Declare only (high-stakes park)"
// control is GONE, and the surface no longer promises a park at all.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ExceptionBookingFields, OpenItemAllocations, AdvanceApplicationFields } from "./ExceptionBookingFields";
import { SnapshotTables } from "./ReconciliationSnapshotTables";
import { toSnapshot } from "./reconSnapshotModel";
import { af2Admission } from "./resolveBookModel";

function render(props: Partial<Parameters<typeof ExceptionBookingFields>[0]> = {}): string {
  return renderToStaticMarkup(createElement(ExceptionBookingFields, {
    token: "jwt", clientId: "c1", exceptionId: "exc-1", lineAmountCents: 1_000_000,
    disposition: "matched_booking", note: "the deposit is ACME invoice 42",
    busy: false, onSubmit: () => {},
    ...props,
  }));
}

/** Every `<button …>` in the markup, with whether it carries the disabled
 *  attribute. React renders `disabled` as a bare attribute when true. */
function buttons(html: string): { label: string; disabled: boolean }[] {
  return [...html.matchAll(/<button\b([^>]*)>(.*?)<\/button>/g)].map((m) => ({
    label: m[2]!.replace(/<[^>]*>/g, "").trim(),
    disabled: /\sdisabled(\s|=|>)/.test(m[1]!),
  }));
}

// ===========================================================================
// THE REGRESSION PIN.
// ===========================================================================

test("[round-3 RED] the dead 'Declare only (high-stakes park)' control is GONE", () => {
  const html = render();
  assert.ok(!/declare only/i.test(html),
    "this button sent neither p_draft nor p_allocations and refused CLR10 booking_request_invalid/no_booking on EVERY click");
  // …and the surface no longer promises a park as something a human requests.
  assert.match(html, /park is NOT a separate button/i);
  assert.match(html, /the DB\s+decides/i);
});

test("[round-3] the SETTLEMENT leg — the only leg that can park — is now reachable, and is the default", () => {
  const html = render();
  assert.match(html, /Settle open items/, "the settlement leg must be offered");
  assert.match(html, /Hand-code an entry/, "…beside the hand-draft leg");
  assert.match(html, /Select a counterparty to list its open items/,
    "the settlement leg's open-item picker is what produces p_allocations");
});

// ===========================================================================
// THE PROPERTIES — these are what would have caught the defect blind.
// ===========================================================================

test("[P1] on BOTH legs, no submit control is ENABLED while the request it would send is inadmissible", () => {
  // BOTH legs are rendered for real (`initialLeg`), not the same markup twice —
  // round 3's own lesson: a cell that walks one corridor proves one corridor.
  for (const leg of ["settle", "draft"] as const) {
    const html = render({ initialLeg: leg });
    const submits = buttons(html).filter((b) => /^Resolve \+|^Complete every line$/.test(b.label));
    assert.ok(submits.length >= 1, `a submit control must exist on the ${leg} leg`);
    for (const b of submits) {
      assert.equal(b.disabled, true,
        `${leg} leg: "${b.label}" is enabled on an empty form — it would send an inadmissible request`);
    }
  }
  // And the predicate agrees about WHY on each: an empty settlement is
  // `no_booking`; an empty hand-draft is `draft_malformed`.
  const s = af2Admission({ disposition: "matched_booking", note: "n", allocations: [] });
  assert.equal(s.admitted === false && s.axis, "no_booking");
  const d = af2Admission({ disposition: "matched_booking", note: "n", draft: { posting_date: "", memo: "", lines: [] } });
  assert.equal(d.admitted === false && d.axis, "draft_malformed");
});

test("[P2] a disabled submit always states its reason, in the admission body's own words", () => {
  const html = render();
  const a = af2Admission({ disposition: "matched_booking", note: "the deposit is ACME invoice 42", draft: null, allocations: [] });
  assert.equal(a.admitted, false);
  const reason = a.admitted === false ? a.message : "";
  assert.ok(html.includes(reason.slice(0, 60)),
    "the disabled control must carry the SAME sentence the predicate would refuse with");
});

test("[P2] a blank NOTE disables the submit and says so — the note belongs to the row above, so the reason must travel down", () => {
  const html = render({ note: "  " });
  for (const b of buttons(html).filter((x) => /^Resolve \+/.test(x.label))) {
    assert.equal(b.disabled, true);
  }
  assert.match(html, /resolution note is required/i);
});

test("[round-3] with no session the settlement leg is NOT offered as a control that cannot be filled", () => {
  const html = render({ token: null, clientId: null });
  assert.ok(!/Select a counterparty/.test(html), "no half-dead picker");
  assert.match(html, /needs a signed-in session/i, "…and it says why, rather than rendering nothing");
});

test("[round-3] the refund quadrant warns BEFORE the DB is asked (a settle_from_bank_line law, design §4.6)", () => {
  // A CUSTOMER against an OUTFLOW is a refund — the sanctioned workaround copy
  // must appear rather than a control the DB will refuse. Both quadrants are
  // rendered for real, so this cannot pass by rendering the lawful one twice.
  const refundHtml = render({ lineAmountCents: -50_000, initialKind: "customer" });
  assert.match(refundHtml, /does not support it directly/,
    "customer + outflow is refund_not_supported; the workaround must be stated up front");
  const lawfulHtml = render({ lineAmountCents: 50_000, initialKind: "customer" });
  assert.ok(!/does not support it directly/.test(lawfulHtml),
    "a customer settling an INFLOW is an ordinary receipt — no refund warning");
  const vendorHtml = render({ lineAmountCents: -50_000, initialKind: "vendor" });
  assert.ok(!/does not support it directly/.test(vendorHtml),
    "a vendor settling an OUTFLOW is an ordinary payment — no refund warning");
});

test("[round-3] an unreadable open-item list reads as UNAVAILABLE, never as 'nothing is owed'", () => {
  // The same house law /advances and /assets carry, applied to the control that
  // decides how much money is allocated. All THREE states are asserted, because
  // the dangerous one is the middle: an empty list that came from a FAILURE.
  const item = {
    id: "0d87188e-645a-453a-953f-71df97773db7", domain: "ar" as const, counterparty_id: "cp1",
    item_kind: "invoice", item_date: "2035-01-02", due_date: null,
    amount_cents: 100000, outstanding_cents: 100000, entry_id: "e1",
  };
  const call = (available: boolean | null, items: typeof item[]) => renderToStaticMarkup(createElement(
    OpenItemAllocations, { items, available, domain: "ar" as const, allocations: {}, onAllocate: () => {} },
  ));
  const failed = call(false, []);
  assert.match(failed, /could not be read/i);
  assert.ok(!/No open items/.test(failed), "a failed read must NEVER borrow the genuinely-empty wording");
  const genuinelyEmpty = call(true, []);
  assert.match(genuinelyEmpty, /No open items/);
  assert.ok(!/could not be read/.test(genuinelyEmpty));
  const populated = call(true, [item]);
  assert.match(populated, /outstanding/, "a populated list renders the DB's own outstanding figure verbatim");
  assert.match(populated, /invoice/);
});

// ===========================================================================
// THE BADGE THIS ROUND MADE REACHABLE.
// ===========================================================================

const PARKED_SNAPSHOT = {
  outstanding_entry_sides: [], outstanding_group_items: [], outstanding_line_sides: [],
  bank_uncleared_opening: [],
  exceptions: [{
    exception_id: "exc-1", line_id: "line-1", kind: "bank_error", status: "open",
    amount_cents: 1_000_000, entry_date: "2035-01-15",
    pending_resolution: {
      exception_id: "exc-1", disposition: "matched_booking", note: "ACME invoice 42",
      declared_by: "user-1", declared_at: "2035-01-15T02:00:00+08:00",
    },
  }],
};

test("[round-3] the 'resolution parked' badge renders — and is now a state a dashboard act can actually create", () => {
  const html = renderToStaticMarkup(createElement(SnapshotTables, {
    snapshot: toSnapshot(PARKED_SNAPSHOT), token: "jwt", clientId: "c1",
    onResolveAndBook: () => {},
  }));
  assert.match(html, /resolution parked/);
  assert.match(html, /a checker must flip the pending line/);
});

test("[round-3] the read-only (voided receipt) reuse renders NO booking control at all", () => {
  const html = renderToStaticMarkup(createElement(SnapshotTables, { snapshot: toSnapshot(PARKED_SNAPSHOT) }));
  assert.match(html, /resolution parked/, "a frozen snapshot still shows the historical fact");
  assert.ok(!/Settle open items/.test(html), "…but offers no act on it");
  assert.ok(!/Resolve \+/.test(html));
});

// ===========================================================================
// [round-7 F-F2] THE STAFF-ADVANCE APPLICATION CHANNEL.
// ===========================================================================

test("[F-F2] the hand-draft leg offers the staff-advance affordance when a session exists", () => {
  const html = render({ initialLeg: "draft" });
  assert.match(html, /This draft repays a staff advance/);
});

test("[F-F2] without a session the advance affordance says why, not a half-dead control", () => {
  const html = render({ initialLeg: "draft", token: null, clientId: null });
  assert.ok(!/This draft repays a staff advance/.test(html));
  assert.match(html, /need a signed-in session to list this client.{1,6}s advances/i);
});

test("[F-F2] AdvanceApplicationFields renders the kind selector, the CLR40 hint, and one line option per draft line", () => {
  const html = renderToStaticMarkup(createElement(AdvanceApplicationFields, {
    token: "jwt", clientId: "c1",
    lines: [{ account_code: "601-000" }, { account_code: "350-003" }],
    kind: "bank_return", onKindChange: () => {},
    reason: "", onReasonChange: () => {},
    rows: [{ line_no: 1, advance_id: "", amount_cents: 0 }], onRowsChange: () => {},
  }));
  assert.match(html, /advance_application_missing/);
  assert.match(html, /line 1 — 601-000/);
  assert.match(html, /line 2 — 350-003/);
  assert.match(html, /Select an advance/);
});

test("[F-F2 WDB-R4 off-path] a draft with NO advance section still admits cleanly — the channel is additive, never required", () => {
  const a = af2Admission({
    disposition: "matched_booking", note: "n",
    draft: { posting_date: "2026-05-01", memo: "m", lines: [{ account_code: "601-000", debit_cents: 100, credit_cents: 0 }, { account_code: "400-000", debit_cents: 0, credit_cents: 100 }] },
    advanceApplications: null,
  });
  assert.equal(a.admitted, true);
});
