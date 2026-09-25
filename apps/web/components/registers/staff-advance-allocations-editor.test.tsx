// #1052 — THE SHARED ALLOCATION EDITOR SAYS WHICH ENROLMENT AN ADVANCE CAME FROM.
//
// The owner's ruling of 2026-09-24 on #931 lets a claim discharge an advance held under ANOTHER
// live enrolment of the same client whose person label is the claimant's, on two conditions. The
// second is this file's subject, in the ruling's own words: "the allocation editor shows, beside
// each such advance, the enrolment it came from, so the preparer's confirmation is a confirmation
// of that specific account."
//
// WHY THE SEAM IS THE EDITOR AND NOT ONLY THE CLAIM FORM. Two surfaces mount this component — the
// staff-advance register's book-application dialog and the staff expense claim form — and the
// ruling's sentence is about the editor. A cell that only drove the claim form would leave the
// register's caller free to drift, and would tie the rule to one caller's candidate filter (whose
// widening is #1066's, not this ticket's).
//
// WHAT IS DELIBERATELY NOT HERE: which candidates a caller offers. That is the caller's own
// decision and each caller has its own cells for it.

import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement, type ReactElement } from "react";
import { NextIntlClientProvider } from "next-intl";

import { renderComponent } from "../../test/hookHarness";
import { focusableElements } from "../../test/keyboardWalk";
import { StaffAdvanceAllocationsEditor } from "./staff-advance-allocations-editor";
import type { StaffAdvanceSummaryRow } from "../../lib/registers/staff-advances-doors";
import messages from "../../messages/en.json";

type Stub = Record<string, unknown>;

const OWN_ADVANCE = "11111111-1111-4111-8111-111111111111";
const LABEL_MATCHED_ADVANCE = "22222222-2222-4222-8222-222222222222";

/** One row of `staff_advance_summary`, every field named so a test reads as data, not noise. */
function advanceRow(patch: Partial<StaffAdvanceSummaryRow>): StaffAdvanceSummaryRow {
  return {
    enrolment_id: "e-own", account_code: "1190", person_label: "Farah binti Idris",
    advance_id: OWN_ADVANCE, issue_date: "2026-02-01", amount_cents: 100000,
    outstanding_cents: 40000, days_outstanding: 30, purpose: null, reference: null,
    voided: false, particulars_complete: false, enrolment_active: true,
    ...patch,
  };
}

/** The claimant's own advance, and one held under the client's SECOND live enrolment — the same
 *  person, enrolled again on another account, which is exactly what arm (b) admits. */
const CANDIDATES: StaffAdvanceSummaryRow[] = [
  advanceRow({}),
  advanceRow({
    enrolment_id: "e-second", account_code: "1191", person_label: "farah BINTI idris",
    advance_id: LABEL_MATCHED_ADVANCE, outstanding_cents: 30000,
  }),
];

function Editor(props: {
  allocations?: { advance_id: string; amount_cents: number }[];
  candidates?: StaffAdvanceSummaryRow[];
  sourceEnrolment?: (candidate: StaffAdvanceSummaryRow) => string | null;
  rowProps?: (index: number, key: "advance" | "amount") => Record<string, unknown>;
}): ReactElement {
  return createElement(NextIntlClientProvider, {
    locale: "en",
    messages,
    timeZone: "Asia/Kuala_Lumpur",
    children: createElement(StaffAdvanceAllocationsEditor, {
      allocations: props.allocations ?? [{ advance_id: "", amount_cents: 0 }],
      onChange: () => {},
      candidates: props.candidates ?? CANDIDATES,
      newRow: () => ({ advance_id: "", amount_cents: 0 }),
      optionLabel: (a) => `${a.issue_date} — ${a.outstanding_cents} outstanding`,
      ...(props.sourceEnrolment === undefined ? {} : { sourceEnrolment: props.sourceEnrolment }),
      ...(props.rowProps === undefined ? {} : { rowProps: props.rowProps }),
    }),
  });
}

/** An attribute off a stub node, or null — the house idiom
 *  (`staff-expense-claim-form.test.tsx`'s own `attrOf`) for reading an id or an aria attribute. */
function attrOf(n: Stub, name: string): string | null {
  return (n as { getAttribute?: (k: string) => string | null }).getAttribute?.(name) ?? null;
}

/** The caller's own note: the register spells out the account and the person, which is precisely
 *  "the enrolment it came from". Written here as a literal, never re-derived from the component. */
const note = (c: StaffAdvanceSummaryRow): string | null =>
  c.enrolment_id === "e-own" ? null : `held under ${c.person_label}'s enrolment on ${c.account_code}`;

function findAll(node: Stub, predicate: (n: Stub) => boolean): Stub[] {
  const out: Stub[] = [];
  const visit = (n: Stub) => {
    if (predicate(n)) out.push(n);
    for (const child of ((n as { childNodes?: Stub[] }).childNodes ?? [])) visit(child);
  };
  visit(node);
  return out;
}

function textOf(node: Stub): string {
  const parts: string[] = [];
  const visit = (n: Stub) => {
    if (typeof (n as { textContent?: unknown }).textContent === "string"
        && ((n as { childNodes?: Stub[] }).childNodes ?? []).length === 0) {
      parts.push((n as { textContent: string }).textContent);
    }
    for (const child of ((n as { childNodes?: Stub[] }).childNodes ?? [])) visit(child);
  };
  visit(node);
  return parts.join("");
}

test("ticket 1052 an advance held under ANOTHER enrolment names that enrolment in the chooser, and a directly enrolled one does not", async () => {
  const h = await renderComponent(Editor({ sourceEnrolment: note }));
  try {
    await h.settle();
    const select = h.find((n) => n.tagName === "SELECT");
    assert.ok(select, "the editor renders a chooser");
    const options = ((select as { childNodes?: Stub[] }).childNodes ?? [])
      .filter((n) => n.tagName === "OPTION");
    const byValue = new Map(options.map((o) => [
      (o as { getAttribute?: (k: string) => string | null }).getAttribute?.("value") ?? "",
      textOf(o),
    ]));

    assert.equal(
      byValue.get(LABEL_MATCHED_ADVANCE),
      "2026-02-01 — 30000 outstanding — held under farah BINTI idris's enrolment on 1191",
      "the label-matched advance says which enrolment it came from, after the caller's own label",
    );
    assert.equal(
      byValue.get(OWN_ADVANCE),
      "2026-02-01 — 40000 outstanding",
      "the claimant's own advance is offered exactly as before — no extra text at all",
    );
  } finally {
    await h.unmount();
  }
});

test("ticket 1052 a CONFIRMED allocation on a label-matched advance carries its source enrolment as its own line, and a directly enrolled one carries none", async () => {
  const h = await renderComponent(Editor({
    // Two confirmed lines: the first discharges the claimant's own advance, the second the one
    // held under the other enrolment. What is on screen beside each is what the ruling is about.
    allocations: [
      { advance_id: OWN_ADVANCE, amount_cents: 40000 },
      { advance_id: LABEL_MATCHED_ADVANCE, amount_cents: 20500 },
    ],
    sourceEnrolment: note,
  }));
  try {
    await h.settle();
    const lines = findAll(h.container as Stub, (n) =>
      (n as { getAttribute?: (k: string) => string | null }).getAttribute?.("data-testid")
        === "allocation-source-enrolment");
    assert.equal(lines.length, 1,
      "exactly ONE confirmed line carries a source enrolment — the one that did not come from the "
      + "claimant's own enrolment");
    assert.equal(textOf(lines[0] as Stub), "held under farah BINTI idris's enrolment on 1191",
      "…and it names the account and the person, so the confirmation is of THAT account");
  } finally {
    await h.unmount();
  }
});

test("ticket 1052 a caller that passes no source-enrolment reader renders exactly what it rendered before", async () => {
  // The staff-advance register's own dialog is that caller. Its chooser already names the account
  // and the person in its default label, and nothing about it may move.
  const h = await renderComponent(Editor({
    allocations: [{ advance_id: LABEL_MATCHED_ADVANCE, amount_cents: 20500 }],
  }));
  try {
    await h.settle();
    const lines = findAll(h.container as Stub, (n) =>
      (n as { getAttribute?: (k: string) => string | null }).getAttribute?.("data-testid")
        === "allocation-source-enrolment");
    assert.equal(lines.length, 0, "no source-enrolment line is invented for a caller that asks for none");
    const select = h.find((n) => n.tagName === "SELECT");
    const options = ((select as { childNodes?: Stub[] }).childNodes ?? [])
      .filter((n) => n.tagName === "OPTION");
    assert.deepEqual(
      options.map((o) => textOf(o)),
      ["Select an outstanding advance…", "2026-02-01 — 40000 outstanding", "2026-02-01 — 30000 outstanding"],
      "the option text is the caller's own label, unchanged",
    );
  } finally {
    await h.unmount();
  }
});

// ---------------------------------------------------------------------------------------------
// #1068 — WHEN THE CONFIRMED LIST IS TRULY EMPTY (every row removed), a caller that addresses row
// 0's advance control by field id (the claim form's `claimAllocations` synthesises exactly one
// phantom row for validation, addressed by `allocationFieldId(0, "advanceId")`, whenever the real
// list has nothing in it — `lib/work/staff-expense-claim.ts`'s own header) still needs SOMETHING
// on screen carrying that id, or the existing focus/scroll-to-error behaviour silently finds
// nothing. THE SEAM IS THE EDITOR, for the same reason #1052's own header gives: two callers mount
// this component, and a cell that only drove the claim form would leave the register's caller free
// to drift.
// ---------------------------------------------------------------------------------------------

test("ticket 1068 an EMPTY list wires row zero's own field props onto the add-a-row button", async () => {
  const h = await renderComponent(Editor({
    allocations: [],
    rowProps: (i, key) => (i === 0 && key === "advance"
      ? { id: "advanceId", "aria-invalid": true, "aria-describedby": "advanceId-help advanceId-error" }
      : {}),
  }));
  try {
    await h.settle();
    const node = h.find((n) => attrOf(n, "id") === "advanceId");
    assert.ok(node, "SOMETHING on screen carries row 0's own field id once the list is empty");
    assert.equal(node.tagName, "BUTTON", "…and it is the add-a-row affordance the empty state renders");
    assert.equal(attrOf(node, "aria-invalid"), "true",
      "the caller's own invalid wiring rides along, exactly as it would on a real row 0");
    assert.equal(attrOf(node, "aria-describedby"), "advanceId-help advanceId-error");
  } finally {
    await h.unmount();
  }
});

test("ticket 1068 fix round the error anchor on an empty list stays FOCUSABLE even with nothing to choose", async () => {
  // ADV-01 / L03-SPEC-02. `candidates.length === 0` is an emptiness of OPTIONS, not a reason the
  // one node the refusal is addressed to may not take focus: `.focus()` on a DISABLED element is
  // a silent no-op (the claim form's own measured note), and the repo's own focusability helper
  // agrees. A caller that ADDRESSES the empty state by field id therefore keeps its stand-in
  // operable; a caller that addresses nothing keeps the old "nothing to add" disabled button.
  const h = await renderComponent(Editor({
    allocations: [],
    candidates: [],
    rowProps: (i, key) => (i === 0 && key === "advance" ? { id: "advanceId" } : {}),
  }));
  try {
    await h.settle();
    const node = h.find((n) => attrOf(n as Stub, "id") === "advanceId");
    assert.ok(node, "the empty state still carries row 0's field id with nothing outstanding");
    assert.equal(attrOf(node as Stub, "disabled"), null,
      "…and it is NOT disabled, so focus actually lands on it");
    const reachable = focusableElements(h.container as Stub)
      .some((n) => attrOf(n as Stub, "id") === "advanceId");
    assert.equal(reachable, true,
      "…and the repo's own focusability rule agrees it is keyboard-operable");
  } finally {
    await h.unmount();
  }
});

test("ticket 1068 fix round the empty-state stand-in keeps its OWN accessible name", async () => {
  // ADV-02. `<button>` is a labelable element, so the claim form's `<Label htmlFor=...>` would
  // otherwise supply its accessible name and the one control that ADDS a row would be announced
  // as the chooser it replaced ("Which advance"). An explicit `aria-label` outranks the native
  // label, so the affordance keeps the name its own text carries.
  const h = await renderComponent(Editor({
    allocations: [],
    rowProps: (i, key) => (i === 0 && key === "advance" ? { id: "advanceId" } : {}),
  }));
  try {
    await h.settle();
    const node = h.find((n) => attrOf(n as Stub, "id") === "advanceId");
    assert.ok(node, "the empty state carries row 0's field id");
    assert.equal(attrOf(node as Stub, "aria-label"),
      messages.StaffAdvances.allocationsEditor.addAllocation,
      "…and names itself, rather than inheriting the field's label");
  } finally {
    await h.unmount();
  }
});

test("ticket 1068 fix round a caller that addresses NOTHING keeps the old disabled empty state", async () => {
  // The register's own book-application dialog passes no rowProps: with nothing outstanding its
  // add button is still disabled and still unnamed, byte for byte as before this fix round.
  const h = await renderComponent(Editor({ allocations: [], candidates: [] }));
  try {
    await h.settle();
    const button = h.find((n) => (n as Stub).tagName === "BUTTON" && textOf(n as Stub).includes(
      messages.StaffAdvances.allocationsEditor.addAllocation));
    assert.ok(button, "the add-a-row button still renders");
    assert.equal(attrOf(button as Stub, "disabled"), "",
      "…still disabled when there is nothing at all to add");
    assert.equal(attrOf(button as Stub, "aria-label"), null,
      "…and no aria-label is invented for a caller that names no field");
  } finally {
    await h.unmount();
  }
});

test("ticket 1068 a NON-EMPTY list never steals row zero's field id for the add-a-row button", async () => {
  const h = await renderComponent(Editor({
    allocations: [{ advance_id: "", amount_cents: 0 }],
    rowProps: (i, key) => (i === 0 && key === "advance" ? { id: "advanceId" } : {}),
  }));
  try {
    await h.settle();
    const withId = findAll(h.container as Stub, (n) => attrOf(n, "id") === "advanceId");
    assert.equal(withId.length, 1, "the id names exactly ONE control");
    assert.equal(withId[0]!.tagName, "SELECT", "…and it is the real row's own chooser, not the add button");
  } finally {
    await h.unmount();
  }
});

test("ticket 1068 a caller that passes NO rowProps (the register's own dialog) renders the empty " +
  "add-a-row button exactly as before", async () => {
  const h = await renderComponent(Editor({ allocations: [] }));
  try {
    await h.settle();
    const button = h.find((n) => n.tagName === "BUTTON" && textOf(n).includes(
      messages.StaffAdvances.allocationsEditor.addAllocation));
    assert.ok(button, "the add-a-row button still renders with nothing to spread onto it");
    assert.equal(attrOf(button, "id"), null, "no id is invented for a caller that names none");
    assert.equal(attrOf(button, "aria-invalid"), null);
  } finally {
    await h.unmount();
  }
});
