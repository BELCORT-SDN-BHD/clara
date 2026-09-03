// P6-5 ③ — the SEVENTH firm-question kind, `onboarding_proposed`.
//
// The array in lib/firm/needs-you-gaps.ts pinned SIX values while the live CHECK has carried
// SEVEN since 0142:219-222. Nothing was broken (the renderer is fail-soft), so the cell that
// matters is not "it does not crash" — it is that the kind now renders its OWN label and its
// OWN affordance, and that the numbers it shows are the DATABASE's.

import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement, type ReactElement } from "react";
import { NextIntlClientProvider } from "next-intl";

// Harness before component — see onboarding-amend-and-chart.test.tsx's own note.
import { renderComponent, textOf } from "../../test/hookHarness";
import { enableDomInspection } from "../../test/domInspect";
import { checkAccessibility } from "../../test/a11yRules";
import {
  FIRM_QUESTION_KINDS,
  isKnownFirmQuestionKind,
  readOnboardingProposal,
  type FirmOpenQuestionRow,
} from "../../lib/firm/needs-you-gaps";
import messages from "../../messages/en.json";
import { FirmQuestionRow } from "./firm-question-row";

enableDomInspection();

type Stub = Record<string, unknown>;

const QUESTION_ID = "11111111-1111-4111-8111-111111111111";
const DOCUMENT_ID = "22222222-2222-4222-8222-222222222222";

const PROPOSAL_CANDIDATES = [{
  proposed_name: "ROME PUBLIC ADVISORY",
  basis: {
    citations: [{ region_id: "r1", kind: "region" }, { region_id: "r2", kind: "region" }, { region_id: "r3", kind: "region" }],
    sightings: 4,
  },
}];

const row = (over: Partial<FirmOpenQuestionRow> = {}): FirmOpenQuestionRow => ({
  id: QUESTION_ID,
  firm_id: "f1",
  document_id: DOCUMENT_ID,
  kind: "onboarding_proposed",
  question_text: 'Clara proposes opening a new client file for "ROME PUBLIC ADVISORY" from this document.',
  candidates: PROPOSAL_CANDIDATES,
  status: "open",
  opened_by: "u1",
  opened_at: "2026-09-02T00:00:00Z",
  settled_by: null,
  settled_at: null,
  settlement_text: null,
  named_client: null,
  receipt_id: "receipt-1",
  ...over,
});

function App(r: FirmOpenQuestionRow): ReactElement {
  return createElement(NextIntlClientProvider, {
    locale: "en", messages, timeZone: "Asia/Kuala_Lumpur",
    children: createElement("div", null,
      createElement("h1", null, "Needs you"),
      createElement("ul", null,
        createElement(FirmQuestionRow, {
          row: r, busy: false, error: null, clients: [], clientsUnavailable: true,
          onResolve: async () => true, onDismiss: async () => true,
        }))),
  });
}

test("the array now carries the live CHECK's seventh value, and the predicate follows it", () => {
  assert.equal(FIRM_QUESTION_KINDS.length, 7, "0142:219-222 widened the CHECK to seven values");
  assert.ok(FIRM_QUESTION_KINDS.includes("onboarding_proposed"));
  assert.equal(isKnownFirmQuestionKind("onboarding_proposed"), true);
  // Still a CLOSED world: the predicate did not become permissive on the way.
  assert.equal(isKnownFirmQuestionKind("an_eighth_kind"), false);
});

test("the proposal projection reads only what the live body commits to, and nothing else", () => {
  const read = readOnboardingProposal(PROPOSAL_CANDIDATES);
  assert.deepEqual(read, { proposedName: "ROME PUBLIC ADVISORY", citationCount: 3, sightings: 4 });

  // Every arm that yields NO card rather than a partly-invented one.
  assert.equal(readOnboardingProposal([]), null);
  assert.equal(readOnboardingProposal(null), null);
  assert.equal(readOnboardingProposal([{ basis: { citations: [], sightings: 1 } }]), null, "no proposed_name, no card");
  assert.deepEqual(
    readOnboardingProposal([{ proposed_name: "X" }]),
    { proposedName: "X", citationCount: null, sightings: null },
    "a missing basis is NULL, never 0 — a zero would be a claim about evidence nobody read",
  );
  assert.deepEqual(
    readOnboardingProposal([{ proposed_name: "X", basis: { sightings: "4" } }]),
    { proposedName: "X", citationCount: null, sightings: null },
    "a non-integer sightings is not coerced into a number this card would then display",
  );
});

test("the row renders its own label and the proposal's DB-owned name and figures", async () => {
  const h = await renderComponent(App(row()));
  try {
    const text = h.text();
    assert.match(text, /New client proposed/, "its own label, not the unrecognised-kind arm");
    assert.doesNotMatch(text, /Unrecognized kind/);
    assert.match(text, /Clara proposes opening a client file named "ROME PUBLIC ADVISORY"\./);
    assert.match(text, /Citations3/, "the resolved citation count, from the array's own length");
    assert.match(text, /Sightings4/, "the DERIVED sightings the DB persisted — never a model's claim (裁-22)");

    // The honest gap: no one-click accept, because no door writes `opened_from_question`.
    assert.match(text, /Accepting this proposal in one step is not built/);
    assert.match(text, /has no client yet, so it has no workspace tab to open/);

    // The two REAL doors are still the row's own, untouched.
    const buttons = [] as string[];
    const walk = (n: Stub) => {
      if (n.tagName === "BUTTON") buttons.push(textOf(n).trim());
      for (const c of (n.childNodes as Stub[] | undefined) ?? []) walk(c);
    };
    walk(h.container as Stub);
    assert.deepEqual(buttons.sort(), ["Ask Clara about this", "Dismiss", "Resolve"]);
    assert.equal(h.find((n: Stub) => n.tagName === "A"), null, "no deep link is invented for a document with no client");

    assert.deepEqual(checkAccessibility(h.container as never), []);
  } finally {
    await h.unmount();
  }
});

test("ANOTHER kind carrying a proposal-shaped candidate is NOT rendered as a proposal", async () => {
  // The gate is the KIND, not the shape. A `collision` row whose candidates happen to carry a
  // `proposed_name` is not an onboarding proposal, and reading it as one would be reading a
  // shape the database never committed to for that kind.
  const h = await renderComponent(App(row({ kind: "collision" })));
  try {
    assert.match(h.text(), /Client collision/);
    assert.doesNotMatch(h.text(), /Clara proposes opening a client file named/);
  } finally {
    await h.unmount();
  }
});

test("an onboarding_proposed row with UNREADABLE candidates falls through to the generic rendering", async () => {
  const h = await renderComponent(App(row({ candidates: [{ something_else: true }] })));
  try {
    assert.match(h.text(), /New client proposed/, "the label still resolves");
    assert.doesNotMatch(h.text(), /Clara proposes opening a client file named/, "no name is invented from a shape that carries none");
  } finally {
    await h.unmount();
  }
});
