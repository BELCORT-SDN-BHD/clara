// GATE (b) — structural a11y scan of T6's new journals-half surfaces: the
// entry-diff panel (its own self-fetching hydration, unlike the fixed-prop
// panels elsewhere in this dir — fetch is mocked, journals-a11y.test.tsx's
// sibling precedent) and the interruptions ("Clarifications") panel.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { NextIntlClientProvider } from "next-intl";
import { renderComponent } from "../../test/hookHarness";
import { enableDomInspection } from "../../test/domInspect";
import { checkAccessibility } from "../../test/a11yRules";
import messages from "../../messages/en.json";
import { EntryDiffContent } from "./entry-diff-panel";
import { InterruptionsPanel } from "./interruptions-panel";
import type { AgentInterruptionRow } from "../../lib/journals/types";

enableDomInspection();

function App(children: ReturnType<typeof createElement>) {
  return createElement(NextIntlClientProvider, { locale: "en", messages, children });
}

const ENTRY_DIFF = {
  entry_id: "e1",
  revisions: [
    { revision_no: 1, actor_kind: "human", actor: "u1", reason: "typo fix", created_at: "2026-04-01T00:00:00Z", header: {}, legs: [], rule_decision_id: null, deltas_vs_prev: [{ field: "memo", before: "old", after: "new", delta_cents: null }] },
  ],
};
const DOC_DIFF = {
  entry_id: "e1", document_id: "doc-1",
  fields: [{ field: "invoice.total", doc_value: "10000", doc_region_id: "r1", doc_page: "1", doc_region_locator_kind: "page_polygon", doc_region_locator: {}, entry_value: "10000", delta_cents: 0, no_region: false }],
};

// Wrapped in the SAME ambient <h1> the real page (journals-workbench.tsx's
// own PageHeader) renders above this — documents-a11y.test.tsx's own note:
// EntryDiffContent's SectionHeader level={2} is the correct next rung after
// that h1 (DraftsQueuePanel establishes no h2/h3 of its own today), and
// testing it standalone without that ambient h1 would flag a heading-order
// violation that is an artifact of this fixture, not a real defect.
test("EntryDiffContent has zero violations once loaded (doc diff + revisions both populated)", async () => {
  const h = await renderComponent(App(createElement("div", null, createElement("h1", null, "Journals"), createElement(EntryDiffContent, { entryDiff: ENTRY_DIFF, docDiff: DOC_DIFF }))));
  try {
    for (let i = 0; i < 2; i++) await h.settle();
    assert.match(h.text(), /invoice\.total/);
    const violations = checkAccessibility(h.container as never);
    assert.deepEqual(violations, [], JSON.stringify(violations));
  } finally {
    await h.unmount();
  }
});

test("EntryDiffContent has zero violations for a no-source-document, never-revised entry", async () => {
  const h = await renderComponent(
    App(createElement("div", null, createElement("h1", null, "Journals"), createElement(EntryDiffContent, { entryDiff: { entry_id: "e2", revisions: [] }, docDiff: null }))),
  );
  try {
    for (let i = 0; i < 2; i++) await h.settle();
    const violations = checkAccessibility(h.container as never);
    assert.deepEqual(violations, [], JSON.stringify(violations));
  } finally {
    await h.unmount();
  }
});

const INTERRUPTION: AgentInterruptionRow = {
  id: "i1", task_id: "t1", kind: "clarify", question: { text: "Which account for this line?" },
  answer: null, status: "pending", asked_of: null, answered_by: null,
  expires_at: "2026-04-01T01:00:00Z", created_at: "2026-04-01T00:00:00Z", answered_at: null,
};

test("InterruptionsPanel has zero violations (one pending clarify, structured question)", async () => {
  const h = await renderComponent(
    App(createElement(InterruptionsPanel, { interruptions: [INTERRUPTION], busy: false, err: null, clr: null, actingId: null, onAnswer: () => {}, clientIdByTaskId: {} })),
  );
  try {
    for (let i = 0; i < 2; i++) await h.settle();
    const violations = checkAccessibility(h.container as never);
    assert.deepEqual(violations, [], JSON.stringify(violations));
  } finally {
    await h.unmount();
  }
});

test("InterruptionsPanel has zero violations for an opaque (schema-less) question, rendered as raw JSON", async () => {
  const opaque: AgentInterruptionRow = { ...INTERRUPTION, id: "i2", question: { foo: "bar", n: 1 } };
  const h = await renderComponent(
    App(createElement(InterruptionsPanel, { interruptions: [opaque], busy: false, err: null, clr: null, actingId: null, onAnswer: () => {}, clientIdByTaskId: {} })),
  );
  try {
    for (let i = 0; i < 2; i++) await h.settle();
    assert.match(h.text(), /"foo": "bar"/);
    const violations = checkAccessibility(h.container as never);
    assert.deepEqual(violations, [], JSON.stringify(violations));
  } finally {
    await h.unmount();
  }
});

test("InterruptionsPanel empty state has zero violations", async () => {
  const h = await renderComponent(
    App(createElement(InterruptionsPanel, { interruptions: [], busy: false, err: null, clr: null, actingId: null, onAnswer: () => {}, clientIdByTaskId: {} })),
  );
  try {
    for (let i = 0; i < 2; i++) await h.settle();
    const violations = checkAccessibility(h.container as never);
    assert.deepEqual(violations, [], JSON.stringify(violations));
  } finally {
    await h.unmount();
  }
});
