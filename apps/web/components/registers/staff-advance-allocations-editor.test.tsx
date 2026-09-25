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
  sourceEnrolment?: (candidate: StaffAdvanceSummaryRow) => string | null;
}): ReactElement {
  return createElement(NextIntlClientProvider, {
    locale: "en",
    messages,
    timeZone: "Asia/Kuala_Lumpur",
    children: createElement(StaffAdvanceAllocationsEditor, {
      allocations: props.allocations ?? [{ advance_id: "", amount_cents: 0 }],
      onChange: () => {},
      candidates: CANDIDATES,
      newRow: () => ({ advance_id: "", amount_cents: 0 }),
      optionLabel: (a) => `${a.issue_date} — ${a.outstanding_cents} outstanding`,
      ...(props.sourceEnrolment === undefined ? {} : { sourceEnrolment: props.sourceEnrolment }),
    }),
  });
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
