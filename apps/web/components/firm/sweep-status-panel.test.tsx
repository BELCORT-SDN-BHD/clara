// F8, independent review (the mutant panel): SweepStatusPanel, pinned with
// a DISCRIMINATING assertion per state — a fixture that only ever exercises
// one branch (or none) can't fail if the component were stubbed to always
// render the same thing.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { NextIntlClientProvider } from "next-intl";
import { renderComponent } from "../../test/hookHarness";
import { SweepStatusPanel } from "./sweep-status-panel";
import messages from "../../messages/en.json";

function App(children: ReturnType<typeof createElement>) {
  return createElement(NextIntlClientProvider, { locale: "en", messages, children });
}

test("SweepStatusPanel: renders nothing at all when sweep is null (no data has ever loaded)", async () => {
  const h = await renderComponent(App(createElement(SweepStatusPanel, { sweep: null })));
  try {
    await h.settle();
    assert.equal(h.text(), "", "must render nothing, never a fabricated 'no sweep' claim, while sweep itself is unknown");
  } finally {
    await h.unmount();
  }
});

test("SweepStatusPanel: open_run true renders the OPEN message, never the closed one", async () => {
  const h = await renderComponent(
    App(createElement(SweepStatusPanel, { sweep: { open_run: true, last_finalized_at: null, last_ack_at: null } })),
  );
  try {
    await h.settle();
    assert.match(h.text(), /A sweep run is currently open/);
    assert.doesNotMatch(h.text(), /No sweep run is currently open/);
    assert.match(h.text(), /Never/, "last_finalized_at/last_ack_at, both null, must render the honest 'Never' — not a blank or a fabricated date");
  } finally {
    await h.unmount();
  }
});

// RE-TRUED 2026-09-04 (P2 · face-vs-door-payload). P6-2 replaced the original
// not-built note with a POINTER at Clara's sweep-receipt card, on the belief
// that a `sweep_receipt` part carries a run id into a thread when a sweep
// finalizes. The census in sweep-status-panel.tsx's own header shows nothing in
// the runtime or the database ever emits that part, so the pointer sent a
// professional to a message that is never written. This cell now pins the
// honest shape and, crucially, pins the RETIRED CLAIM AS ABSENT — a later lane
// restoring the pointer without restoring the producer reds here.
test("SweepStatusPanel: open_run false with real timestamps renders the CLOSED message, the actual dates, and an HONEST not-built note for acknowledging", async () => {
  const h = await renderComponent(
    App(createElement(SweepStatusPanel, {
      sweep: { open_run: false, last_finalized_at: "2026-04-01T18:00:00Z", last_ack_at: "2026-04-02T09:00:00Z" },
    })),
  );
  try {
    await h.settle();
    assert.match(h.text(), /No sweep run is currently open/);
    assert.doesNotMatch(h.text(), /A sweep run is currently open/);
    assert.doesNotMatch(h.text(), /Never/, "real timestamps must render as real dates, not the 'Never' fallback");
    assert.match(h.text(), /not reachable yet/, "the panel must state the gap honestly rather than pointing at a surface nobody can reach");
    assert.match(h.text(), /never produced by the agent runtime/, "and must name the MISSING PRODUCER, which is what makes the note actionable");
    assert.doesNotMatch(
      h.text(),
      /acknowledge the run there/,
      "the retired pointer must not come back without its producer — nothing emits a sweep_receipt part",
    );
  } finally {
    await h.unmount();
  }
});

// E-3 / CB-AE2E-026, the owner's "Sweep run 是什么??": the panel explained at
// length why it holds no acknowledge control and never said what a sweep IS.
test("SweepStatusPanel: the DEFINITION of a sweep renders BEFORE the open/closed state banner", async () => {
  const h = await renderComponent(
    App(createElement(SweepStatusPanel, { sweep: { open_run: true, last_finalized_at: null, last_ack_at: null } })),
  );
  try {
    await h.settle();
    const text = h.text();
    const definitionAt = text.indexOf("A sweep is one unattended pass");
    const bannerAt = text.indexOf("A sweep run is currently open");
    assert.ok(definitionAt >= 0, "the panel must define the noun it is named after");
    assert.ok(bannerAt >= 0, "the state banner must still render");
    assert.ok(definitionAt < bannerAt, "the definition must come FIRST — a state banner answers a question nobody can ask yet");
    assert.match(text, /drafted, how many it skipped and how many it refused/, "the definition must be the DB's own columns, not an invented description");
  } finally {
    await h.unmount();
  }
});
