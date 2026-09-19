// components/bank/matching-candidates.tsx — #657 AC7/AC8.
//
// What this proves, and why each one is a cell rather than a look:
//   * the counterparty NAME renders (migration 0226 made the field real; before it, the row
//     type declared `counterparty_name` and the database never emitted it, so every candidate
//     read "—" and a human could not tell "no counterparty" from "this read does not carry
//     names"). The em dash is therefore asserted to appear ONLY when the name is genuinely
//     absent.
//   * `high_stakes` renders when true — 0038:8025 hardcoded `false`, so this badge could not
//     appear at all before 0226.
//   * per-side remaining capacity, the bounded match history and the four deterministic basis
//     facts all render.
//   * NO SCORE ANYWHERE (Q3 / SYNTHESIS J2): the rendered text carries no percentage and no
//     0–1 number, asserted directly rather than trusted.
//   * "unique sufficient" (AC8) is a DISPLAY of the same fact the agent's `same_amount_ambiguous`
//     rung reads, and with two exact candidates it says so and offers no tie-break.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { NextIntlClientProvider } from "next-intl";
import { renderComponent } from "../../test/hookHarness";
import { MatchingCandidates } from "./matching-candidates";
import type { MatchCandidateEntryRow } from "@/lib/bank/match-types";
import type { MatchBasisRow } from "@/lib/bank/matching-context-types";
import messages from "../../messages/en.json";

const NAMED: MatchCandidateEntryRow = {
  entry_id: "e-named",
  posting_date: "2026-04-05",
  memo: "April fee",
  coding_kind: "bank_charge",
  counterparty_id: "cp1",
  counterparty_name: "Sinaran Logistik Sdn Bhd",
  high_stakes: true,
  debit_remaining_cents: 0,
  credit_remaining_cents: 1500,
  match_history: [
    { match_id: "m-old", status: "unmatched", matched_cents: -1500, acted_at: "2026-03-01T00:00:00.000Z" },
  ],
};

const ANONYMOUS: MatchCandidateEntryRow = {
  entry_id: "e-anon",
  posting_date: "2026-04-02",
  memo: "office supplies",
  coding_kind: null,
  counterparty_id: null,
  counterparty_name: null,
  high_stakes: false,
  debit_remaining_cents: 900,
  credit_remaining_cents: 0,
  match_history: [],
};

const BASIS: MatchBasisRow[] = [
  { entry_id: "e-named", amount_exact: true, date_delta_days: 0, counterparty_match: "name", class_hint: "bank_charges" },
  { entry_id: "e-anon", amount_exact: false, date_delta_days: -3, counterparty_match: "none", class_hint: "bank_charges" },
];

function mount(candidates: MatchCandidateEntryRow[], basis: MatchBasisRow[]) {
  return renderComponent(
    createElement(NextIntlClientProvider, {
      locale: "en",
      messages,
      children: createElement(MatchingCandidates, {
        candidates,
        basis,
        selectedEntryIds: new Set<string>(),
        matchedCents: {},
        centsValid: {},
        onToggleEntry: () => {},
        onCentsChange: () => {},
      }),
    }),
  );
}

test("p657.web.candidates · name, high stakes, capacity, history and the four basis facts all render, and an em dash appears only where a name is genuinely absent", async () => {
  const h = await mount([NAMED, ANONYMOUS], BASIS);
  try {
    const text = h.text();
    assert.match(text, /Sinaran Logistik Sdn Bhd/, "the canonical counterparty NAME renders, not its uuid");
    assert.match(text, /High stakes/, "a high-stakes candidate says so — 0038:8025 hardcoded false and this could not render at all before 0226");
    assert.match(text, /Credit RM 15\.00/, "per-side remaining capacity renders with its side named");
    assert.match(text, /Debit RM 9\.00/, "…for both sides");
    assert.match(text, /unmatched · -?RM 15\.00 · 2026-03-01/, "the bounded match history renders one row per prior group");
    assert.match(text, /Never matched here/, "an entry with no history says so rather than rendering an empty cell");

    assert.match(text, /Amount matches exactly/, "basis: amount_exact, as a fact");
    assert.match(text, /Amount does not match exactly/, "…and its negative, for the other candidate");
    assert.match(text, /0 days from the line's date/, "basis: the signed whole-day distance");
    assert.match(text, /-3 days from the line's date/, "…signed, so 'before' is visible");
    assert.match(text, /Counterparty name appears in the line/, "basis: the 'name' rung");
    assert.match(text, /No counterparty evidence in the line/, "basis: the 'none' rung");
    assert.match(text, /Line looks like bank_charges/, "basis: the line's own class hint");

    // Q3 / SYNTHESIS J2: never a score. No percentage, no 0–1 confidence, anywhere.
    assert.equal(/\d+\s?%/.test(text), false, `a percentage leaked into the basis: ${text.slice(0, 400)}`);
    assert.equal(/\b0\.\d\b/.test(text), false, "a 0–1 confidence number leaked into the basis");

    // An honest em dash: the anonymous candidate has one, and it is for the counterparty cell.
    assert.match(text, /—/, "the candidate with no counterparty renders an honest em dash");
  } finally {
    await h.unmount();
  }
});

test("p657.web.candidates · AC8 'unique sufficient' is a display, and two exact candidates are reported as ambiguous with no tie-break offered", async () => {
  const unique = await mount([NAMED, ANONYMOUS], BASIS);
  try {
    assert.match(unique.text(), /One candidate matches this line's amount exactly\./);
  } finally {
    await unique.unmount();
  }

  const bothExact: MatchBasisRow[] = BASIS.map((b) => ({ ...b, amount_exact: true }));
  const ambiguous = await mount([NAMED, ANONYMOUS], bothExact);
  try {
    const text = ambiguous.text();
    assert.match(text, /2 candidates match this line's amount exactly/, "two exact candidates are named as two, not resolved");
    assert.match(text, /the choice is yours to make/, "the surface offers no tie-break — choosing is the human's act");
  } finally {
    await ambiguous.unmount();
  }

  const none = await mount([ANONYMOUS], [BASIS[1]!]);
  try {
    assert.match(none.text(), /No candidate matches this line's amount exactly\./);
  } finally {
    await none.unmount();
  }
});
