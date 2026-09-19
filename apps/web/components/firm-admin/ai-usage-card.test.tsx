// #635 — the model-usage card, mounted.
//
// THE CSV'S BYTES ARE ASSERTED IN `lib/firm/usage-csv.test.ts`; what is asserted HERE is the
// HANDOFF — that the action exists only when there is something to download, and that pressing it
// hands over a blob and a filename. (The browser walk asserts the object-URL recorder instead:
// Playwright's `download` event does not fire under this harness, `documents-viewer-walk.spec.ts:498-501`.)

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { NextIntlClientProvider } from "next-intl";

import { renderComponent, clickButton, textOf } from "../../test/hookHarness";
import { enableDomInspection } from "../../test/domInspect";
import { AiUsageCard, type FirmUsageAnswer } from "./ai-usage-card";
import type { FirmUsageRow } from "../../lib/firm/commercial-reads";
import { resolveUsagePeriod, recentUsageMonths } from "../../lib/firm/usage-period";
import type { FirmSettingsView } from "./firm-settings-view";
import messages from "../../messages/en.json";

enableDomInspection();

type Stub = Record<string, unknown>;

const NOW = new Date("2026-09-19T04:30:00.000Z");
const PERIOD = resolveUsagePeriod("2026-09", NOW);
const MONTHS = recentUsageMonths(NOW);

function row(over: Partial<FirmUsageRow> = {}): FirmUsageRow {
  return {
    scope: "firm",
    callKind: "chat",
    calls: 12,
    inputTokens: 3_000_000,
    outputTokens: 400_000,
    pricedCalls: 12,
    unpricedCalls: 0,
    spendCents: 340,
    priceCurrency: "USD",
    ...over,
  };
}

type Handoff = { filename: string; text: string; blob: Blob };

/** Every cell below is about a period whose answer has ARRIVED, so the stamp is the period's
 *  own month; `mountAnswer` is for the cells that are about the stamp itself. */
async function mount(
  view: FirmSettingsView<readonly FirmUsageRow[]>,
  sink: { periods: string[]; downloads: Handoff[] },
  period = PERIOD,
) {
  const stamped: FirmSettingsView<FirmUsageAnswer> =
    view.status === "ready"
      ? { status: "ready", data: { month: period.month, rows: view.data, dropped: 0 } }
      : view;
  return mountAnswer(stamped, sink, period);
}

async function mountAnswer(
  view: FirmSettingsView<FirmUsageAnswer>,
  sink: { periods: string[]; downloads: Handoff[] },
  period = PERIOD,
) {
  return renderComponent(
    createElement(NextIntlClientProvider, {
      locale: "en",
      messages,
      timeZone: "Asia/Kuala_Lumpur",
      children: createElement(AiUsageCard, {
        view,
        period,
        months: MONTHS,
        firmName: "Tan & Partners",
        onPeriodChange: (month: string) => sink.periods.push(month),
        onRetry: () => {},
        download: ({ blob, filename }) => {
          // THE BYTES ARE READ FROM THE BLOB ITSELF where a cell needs them (`blob.text()` is
          // async, so the handler stashes the Blob and the cell awaits it). `__text` was a stub
          // field nothing ever set; the filename cells never noticed because they never read it.
          sink.downloads.push({ filename, text: (blob as unknown as { __text?: string }).__text ?? "", blob });
        },
      }),
    }),
  );
}

const downloadButton = (h: { find: (p: (n: Stub) => boolean) => Stub | null }) =>
  h.find((n) => n.tagName === "BUTTON" && textOf(n).includes("Download CSV"));

test("p635.web.usage_buckets_never_summed the two scopes render as two labelled groups, with no grand total", async () => {
  const sink = { periods: [] as string[], downloads: [] as Handoff[] };
  const h = await mount(
    { status: "ready", data: [row(), row({ scope: "platform", callKind: "reporting", calls: 9, spendCents: 900 })] },
    sink,
  );
  try {
    const text = h.text();
    assert.match(text, /This firm/);
    assert.match(text, /Platform-wide/);
    assert.match(text, /Calls Clara makes for everyone.*never added to your firm's figures/s,
      "0110:718-727's own rule, in the accountant's words");
    assert.doesNotMatch(text, /\bTotal\b/i,
      "a total row would be this surface making an addition the database deliberately declined to make");
    // The two scope sections are real landmarks, so a screen reader can tell them apart.
    const sections = h.find((n) => (n as Stub).tagName === "SECTION");
    assert.ok(sections, "each bucket is its own labelled section");
  } finally { await h.unmount(); }
});

test("p635.web.usage_unpriced_surfaces the tripwire is published beside the figures, not hidden", async () => {
  const sink = { periods: [] as string[], downloads: [] as Handoff[] };
  const h = await mount({ status: "ready", data: [row({ pricedCalls: 9, unpricedCalls: 3, spendCents: 200 })] }, sink);
  try {
    assert.match(h.text(), /3 calls in this period have no price on record/,
      "0110:702-704's own published tripwire");
  } finally { await h.unmount(); }
});

test("p635.web.usage_currency_labelled a figure never appears without the provider-price label, and nothing is converted", async () => {
  const sink = { periods: [] as string[], downloads: [] as Handoff[] };
  const h = await mount({ status: "ready", data: [row()] }, sink);
  try {
    const text = h.text();
    assert.match(text, /USD 3\.40/, "integer cents, formatted in the currency the door named");
    assert.match(text, /Provider price \(USD\), not your books/);
    assert.match(text, /Nothing here is converted to ringgit and nothing here posts to a ledger/);
    assert.doesNotMatch(text, /\bRM\b/, "there is no rate anywhere in this estate that could honestly produce one");
  } finally { await h.unmount(); }
});

test("p635.web.usage_unpriced_row_shows_no_zero_money a row with nothing priced renders a dash, not a zero", async () => {
  const sink = { periods: [] as string[], downloads: [] as Handoff[] };
  const h = await mount({ status: "ready", data: [row({ pricedCalls: 0, unpricedCalls: 12, spendCents: 0 })] }, sink);
  try {
    assert.doesNotMatch(h.text(), /USD 0\.00/,
      "a zero beside twelve unpriced calls would read as 'this cost nothing', which is not what the door said");
  } finally { await h.unmount(); }
});

test("p635.web.usage_period_round_trip the selector reports the month upward, and the window line is the DOOR's UTC one", async () => {
  const sink = { periods: [] as string[], downloads: [] as Handoff[] };
  const h = await mount({ status: "ready", data: [row()] }, sink);
  try {
    assert.match(h.text(), /Covering 01 Sept 2026 to 30 Sept 2026, counted in UTC\./,
      "0110:711-712 + :750 — a UTC month, said out loud rather than left to a reader's assumption");
    const select = h.find((n) => (n as Stub).tagName === "SELECT");
    assert.ok(select, "the month chooser is a real <select>");
    await h.fireEvent(select as Stub, "change", (n) => { (n as { value?: string }).value = "2026-07"; });
    assert.deepEqual(sink.periods, ["2026-07"], "the card reports the change; the URL is the panel's to own");
  } finally { await h.unmount(); }
});

test("p635.web.usage_bad_period a fallback month is VISIBLE, never silent", async () => {
  const sink = { periods: [] as string[], downloads: [] as Handoff[] };
  const h = await mount({ status: "ready", data: [row()] }, sink, resolveUsagePeriod("2026-13", NOW));
  try {
    assert.match(h.text(), /That month could not be read, so the current month is shown instead/);
    assert.match(h.text(), /Covering 01 Sept 2026/);
  } finally { await h.unmount(); }
});

test("p635.web.usage_empty_no_download an empty period is a named zero and the CSV action is ABSENT, not disabled", async () => {
  const sink = { periods: [] as string[], downloads: [] as Handoff[] };
  const h = await mount({ status: "ready", data: [] }, sink);
  try {
    assert.match(h.text(), /No model calls in this period\./);
    assert.equal(downloadButton(h) !== null, false,
      "appendix D §136: a named zero after a complete read, not a disabled control over an empty table");
  } finally { await h.unmount(); }
});

test("p635.web.usage_download_handoff pressing Download hands over a blob and a month-named file", async () => {
  const sink = { periods: [] as string[], downloads: [] as Handoff[] };
  const h = await mount({ status: "ready", data: [row()] }, sink);
  try {
    const button = downloadButton(h);
    assert.ok(button, "there are rows, so the action is offered");
    await clickButton(button as Stub);
    assert.equal(sink.downloads.length, 1);
    assert.equal(sink.downloads[0]!.filename, "clara-model-usage-2026-09-utc.csv",
      "the filename names the month in the door's own frame; the file's bytes are asserted in lib/firm/usage-csv.test.ts");
  } finally { await h.unmount(); }
});

test("p635.web.usage_denied_clears a CLR04 on a visibility re-read clears the rows and renders the denied face", async () => {
  const sink = { periods: [] as string[], downloads: [] as Handoff[] };
  const h = await mount({ status: "ready", data: [row()] }, sink);
  try {
    assert.match(h.text(), /USD 3\.40/);
    await h.rerender(
      createElement(NextIntlClientProvider, {
        locale: "en",
        messages,
        timeZone: "Asia/Kuala_Lumpur",
        children: createElement(AiUsageCard, {
          view: { status: "denied", message: "insufficient role" },
          period: PERIOD,
          months: MONTHS,
          firmName: "Tan & Partners",
          onPeriodChange: () => {},
          onRetry: () => {},
          download: () => {},
        }),
      }),
    );
    const text = h.text();
    assert.doesNotMatch(text, /USD 3\.40/, "the figures are gone rather than stale");
    assert.doesNotMatch(text, /chat/, "…and so are the rows they sat in");
    assert.match(text, /insufficient role/);
    assert.equal(downloadButton(h) !== null, false, "and there is nothing left to download");
  } finally { await h.unmount(); }
});

test("p635.web.usage_separation the card says these are not a client's figures and links to where those live", async () => {
  const sink = { periods: [] as string[], downloads: [] as Handoff[] };
  const h = await mount({ status: "ready", data: [row()] }, sink);
  try {
    assert.match(h.text(), /These are Clara's own model costs\. They are not a client's figures and they never post to a ledger/,
      "C55.21's separation sentence — ticket 660 owns the money on the client dashboards (spelled without the hash: the token lint reads a three-digit ticket number as a hex colour)");
    assert.ok(h.find((n) => (n as Stub).tagName === "A" && textOf(n as Stub).includes("Go to clients")));
  } finally { await h.unmount(); }
});

// ───────────────────────────────────────────────────────────────────────────
// FIX ROUND 1 — the month STAMP (adversarial A2) and the DROPPED-ROW count
// (adversarial A4).
// ───────────────────────────────────────────────────────────────────────────

test("p635.web.usage_answer_for_another_month is not rendered at all", async () => {
  const sink = { periods: [] as string[], downloads: [] as Handoff[] };
  const h = await mountAnswer(
    { status: "ready", data: { month: "2026-08", rows: [row({ callKind: "august_only_kind" })], dropped: 0 } },
    sink,
    PERIOD,
  );
  try {
    const text = h.text();
    assert.doesNotMatch(text, /august_only_kind/,
      "rows belonging to another month are not this period's table, whatever the label above them says");
    assert.equal(downloadButton(h) !== null, false,
      "and they are certainly not downloadable under this period's provenance header");
    assert.doesNotMatch(text, /No model calls in this period/,
      "…nor is the absence of them a named zero: nothing has been read for THIS month yet");
  } finally { await h.unmount(); }
});

test("p635.web.usage_dropped_rows are counted on screen and the period is never called empty", async () => {
  const sink = { periods: [] as string[], downloads: [] as Handoff[] };
  const h = await mountAnswer(
    { status: "ready", data: { month: PERIOD.month, rows: [], dropped: 2 } },
    sink,
  );
  try {
    const text = h.text();
    assert.match(text, /2 rows for this period could not be read/,
      "the same published tripwire unpriced_calls is: an incomplete table says so");
    assert.doesNotMatch(text, /No model calls in this period/,
      "a read that dropped rows is NOT a named zero — that is a generic successful Empty over a failure");
  } finally { await h.unmount(); }
});

test("p635.web.usage_dropped_rows_reach_the_csv so a spreadsheet cannot read as complete either", async () => {
  const sink = { periods: [] as string[], downloads: [] as Handoff[] };
  const h = await mountAnswer(
    { status: "ready", data: { month: PERIOD.month, rows: [row()], dropped: 1 } },
    sink,
  );
  try {
    const button = downloadButton(h);
    assert.ok(button, "rows were read, so there is something to download");
    await h.fireEvent(button, "click");
    assert.equal(sink.downloads.length, 1);
    assert.match(await sink.downloads[0]!.blob.text(),
      /1 rows returned for this period could not be read and are NOT in this file/);
  } finally { await h.unmount(); }
});
