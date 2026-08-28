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

test("SweepStatusPanel: open_run false with real timestamps renders the CLOSED message and the actual dates, and the acknowledge gap is named honestly", async () => {
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
    assert.match(h.text(), /Acknowledging a finalized sweep run needs its run id/, "the acknowledge gap must be named, never a silent omission or a fake control");
  } finally {
    await h.unmount();
  }
});
