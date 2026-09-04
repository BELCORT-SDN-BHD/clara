// H-32 / H-33 / CB-AE2E-022 — the Journals "Clarifications" tab.
//
// The H-32 fixture is built FROM THE WRITER'S OWN LITERAL, not from what the
// panel happened to read: `openInterruptionStep` writes
// `{ type: "clarify", question, context, framing }` at
// packages/runtime/workflows/chatTurn.v10.impl.ts:328, and every one of the ten
// `open_interruption` callers in packages/runtime writes the same shape. The
// panel used to read `question.text`, which no writer produces — so it fell to
// the raw-JSON dump on 100% of rows. A cell built from the panel's old
// expectation would have gone on passing while the product showed a blob.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { NextIntlClientProvider } from "next-intl";

import { renderComponent, textOf } from "../../test/hookHarness";
import { enableDomInspection } from "../../test/domInspect";
import messages from "../../messages/en.json";
import { InterruptionsPanel } from "./interruptions-panel";
import type { AgentInterruptionRow } from "../../lib/journals/types";

enableDomInspection();

const WEB_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

/** Transcribed from chatTurn.v10.impl.ts:328 — the shape the runtime writes. */
const LIVE_SHAPE: AgentInterruptionRow = {
  id: "i1", task_id: "t1", kind: "clarify",
  question: {
    type: "clarify",
    question: "Which financial year does this invoice belong to?",
    context: "The invoice date is 2026-03-31 and the client's year end is 31 March.",
    framing: "This question and its answer are visible to your firm.",
  },
  answer: null, status: "pending", asked_of: null, answered_by: null,
  expires_at: "2026-09-17T14:45:00Z", created_at: "2026-09-03T00:00:00Z", answered_at: null,
};

function App(children: ReturnType<typeof createElement>) {
  return createElement(NextIntlClientProvider, { locale: "en", messages, timeZone: "Asia/Kuala_Lumpur", children });
}

function panel(rows: AgentInterruptionRow[]) {
  return App(
    createElement(InterruptionsPanel, {
      interruptions: rows, busy: false, err: null, clr: null, actingId: null,
      onAnswer: () => {}, clientIdByTaskId: {},
    }),
  );
}

test("H-32: the question TEXT renders and the raw-JSON dump does not, for the shape the runtime actually writes", async () => {
  const h = await renderComponent(panel([LIVE_SHAPE]));
  try {
    for (let i = 0; i < 2; i++) await h.settle();
    assert.match(h.text(), /Which financial year does this invoice belong to\?/);
    assert.match(h.text(), /the client's year end is 31 March/, "the writer's own context line renders beside it");
    assert.equal(
      (h.container as unknown as { querySelectorAll(s: string): unknown[] }).querySelectorAll("pre").length,
      0,
      "the fail-closed JSON dump must not be reached for a payload the reader understands",
    );
    assert.doesNotMatch(h.text(), /Clara is asking for a clarification/, "the opaque placeholder is for an unreadable payload only");
  } finally {
    await h.unmount();
  }
});

test("H-32 COMPATIBILITY ARM: a legacy `.text` payload still renders as text", async () => {
  // The column is untyped jsonb (0006_runtime_core.sql:198) and the absence of
  // a `.text` writer TODAY is not proof no stored row carries one.
  const legacy: AgentInterruptionRow = { ...LIVE_SHAPE, id: "i2", question: { text: "A legacy-shaped question" } };
  const h = await renderComponent(panel([legacy]));
  try {
    for (let i = 0; i < 2; i++) await h.settle();
    assert.match(h.text(), /A legacy-shaped question/);
    assert.equal((h.container as unknown as { querySelectorAll(s: string): unknown[] }).querySelectorAll("pre").length, 0);
  } finally {
    await h.unmount();
  }
});

// MUST-NOT-RED CONTROL. The `<pre>` arm is the fail-closed branch and it has
// to stay REACHABLE — a reader that "understood" every payload would be
// inventing a shape it cannot prove.
test("H-32 FAIL-CLOSED ARM: a payload with neither key still dumps the raw JSON", async () => {
  const opaque: AgentInterruptionRow = { ...LIVE_SHAPE, id: "i3", question: { foo: "bar", n: 1 } };
  const h = await renderComponent(panel([opaque]));
  try {
    for (let i = 0; i < 2; i++) await h.settle();
    assert.equal((h.container as unknown as { querySelectorAll(s: string): unknown[] }).querySelectorAll("pre").length, 1);
    assert.match(h.text(), /"foo": "bar"/);
    assert.match(h.text(), /Clara is asking for a clarification/);
  } finally {
    await h.unmount();
  }
});

test("H-32: the expiry is LABELLED and carries a time of day — it is a deadline instant, not a calendar date", async () => {
  const h = await renderComponent(panel([LIVE_SHAPE]));
  try {
    for (let i = 0; i < 2; i++) await h.settle();
    const text = h.text();
    assert.match(text, /Answer by/, "an unlabelled date beside a question says nothing about what it is");
    // 2026-09-17T14:45:00Z in Asia/Kuala_Lumpur (+08:00) is 22:45 on the 17th.
    // The old <FormattedDate> path rendered "Sep 17, 2026" and dropped the
    // time entirely — this asserts the time SURVIVED, which is the half that
    // was missing.
    assert.match(text, /Sep 17, 2026/);
    assert.match(text, /10:45\s?PM|22:45/, `no time of day in: ${text}`);
  } finally {
    await h.unmount();
  }
});

test("H-33: the Journals answer control's accessible name says WHERE it is, so it cannot collide with the rail's", async () => {
  const h = await renderComponent(panel([LIVE_SHAPE]));
  try {
    for (let i = 0; i < 2; i++) await h.settle();
    const field = h.find((n) => n.tagName === "TEXTAREA");
    assert.ok(field, "the answer field must render");
    const label = (field as unknown as { getAttribute(a: string): string | null }).getAttribute("aria-label");
    assert.equal(label, "Your answer (Journals clarifications)");
    // The rail's ClarifyCard keeps the short name — the two must DIFFER, and
    // this reads the rail's own message value rather than re-typing it.
    const railLabel = (messages as unknown as { Clara: { parts: { clarify: { answerLabel: string } } } }).Clara.parts.clarify.answerLabel;
    assert.equal(railLabel, "Your answer");
    assert.notEqual(label, railLabel, "two controls on one route may not ship the same accessible name");
  } finally {
    await h.unmount();
  }
});

/**
 * CB-AE2E-022 — the copy guard.
 *
 * SCOPED to the two namespaces this lane owns, with an ARGUED allow-list,
 * rather than a blanket ban over the whole message file: a blanket rule would
 * red on a sibling lane's strings in a session where several lanes edit
 * en.json at once, which makes it a tripwire for other people's work rather
 * than a guard on this one.
 *
 * The allow-list has exactly one member and it is the honest-absence note.
 * components/common/not-built-note.tsx's own header records that these notes
 * "name a DB verb signature verbatim" — that is the point of them: a note that
 * says a control is missing without saying WHICH door is missing tells a
 * reader nothing they can act on.
 */
const VERB_LEAK = /\bclara\.[a-z_]+\b|\b(record_client_resolution|draft_entry|withdraw_draft|request_reextraction|request_autodraft|classify_consent_evidence_document|approve_routine_entry)\b/;
const ALLOWED_VERB_KEYS = new Set(["JournalsWorkbench.drafts.reviseNotBuilt"]);

function leafStrings(node: unknown, prefix: string, out: [string, string][]): void {
  if (typeof node === "string") { out.push([prefix, node]); return; }
  if (node && typeof node === "object") {
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      leafStrings(v, prefix ? `${prefix}.${k}` : k, out);
    }
  }
}

test("CB-AE2E-022: no DB verb identifier reaches user copy in the journals namespaces", () => {
  const raw = JSON.parse(readFileSync(join(WEB_ROOT, "messages", "en.json"), "utf8")) as Record<string, unknown>;
  const out: [string, string][] = [];
  leafStrings(raw.JournalsWorkbench, "JournalsWorkbench", out);
  leafStrings(raw.DraftsDocumentGovernance, "DraftsDocumentGovernance", out);
  assert.ok(out.length > 60, `the walk found only ${out.length} strings — it is not reading the file`);

  const leaks = out.filter(([key, value]) => VERB_LEAK.test(value) && !ALLOWED_VERB_KEYS.has(key));
  assert.deepEqual(leaks, [], `implementation vocabulary in user copy: ${JSON.stringify(leaks, null, 2)}`);

  // POSITIVE CONTROL on the matcher itself: an empty `leaks` proves nothing
  // unless the pattern can still SEE a leak. The allow-listed note carries a
  // real verb name, so it is the live proof the regex works.
  for (const key of ALLOWED_VERB_KEYS) {
    const row = out.find(([k]) => k === key);
    assert.ok(row, `${key} is allow-listed but no longer exists — drop it from the list`);
    assert.ok(VERB_LEAK.test(row![1]), `${key} is allow-listed but carries no verb name — drop it from the list`);
  }
});

test("CB-AE2E-022: the compose dialog's description says what the act DOES, and what it costs the reader", () => {
  const description = (messages as unknown as { JournalsWorkbench: { compose: { description: string } } })
    .JournalsWorkbench.compose.description;
  assert.doesNotMatch(description, VERB_LEAK);
  // The two facts the old copy carried are both KEPT: the entry is booked
  // against this client (the record_client_resolution half — CLR01, invariant
  // 1) and it lands as a DRAFT (draft_entry returns status 'draft').
  assert.match(description, /this client/i);
  assert.match(description, /draft/i);
  assert.match(description, /nothing posts until it is approved/i);
});

test("the Clarifications panel still renders one card per pending row", async () => {
  const h = await renderComponent(panel([LIVE_SHAPE, { ...LIVE_SHAPE, id: "i9", question: { question: "Second question" } }]));
  try {
    for (let i = 0; i < 2; i++) await h.settle();
    const fields = (h.container as unknown as { querySelectorAll(s: string): unknown[] }).querySelectorAll("textarea");
    assert.equal(fields.length, 2);
    assert.match(textOf(h.container as never), /Second question/);
  } finally {
    await h.unmount();
  }
});
