// #651 — the depreciation runs TABLE, and the preview-first dialog it now opens.
//
// WHAT EACH CELL PINS:
//   runs.columns    `skipped` and `entry_id` have been returned by clara.list_depreciation_runs
//                   since 0041 and this panel rendered NEITHER, so a run that quietly skipped half
//                   the register looked identical to one that charged everything.
//   runs.collapse   a run whose skips are all benign may collapse; one carrying work somebody still
//                   owes renders OPEN (appendix D row 17).
//   runs.preview    opening the dialog READS the preview and shows the database's own period —
//                   and the two date inputs the dialog used to carry are gone.
//   runs.one_key    Confirm posts the period the PREVIEW named, with the decision's own op key, and
//                   a second attempt at the same decision reuses it.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";

import { renderComponent, textOf, clickButton } from "../../test/hookHarness";
import { enableDomInspection } from "../../test/domInspect";
import { configureSessionTokenSource, resetSessionTokenSource } from "../../lib/session-accessor";
import { DepreciationRunsPanel } from "./fa-depreciation-runs-panel";
import {
  intlApp, faRun, faPreview, findAll, tid, attr, jsonResponse, FA_CLIENT, type StubNode,
} from "./fa-depreciation-test-fixtures";

enableDomInspection();

const bodyNode = () =>
  (globalThis as unknown as { document: { body: StubNode & { appendChild: (c: unknown) => void } } }).document.body;

type Call = { url: string; body: Record<string, unknown> };

async function mountPanel(opts: { runs?: unknown[]; preview?: unknown; runFails?: boolean } = {}) {
  const calls: Call[] = [];
  const impl = (async (u: RequestInfo | URL, init?: RequestInit) => {
    const url = String(u);
    calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : {} });
    if (url.includes("/rpc/list_depreciation_runs")) return jsonResponse({ client_id: FA_CLIENT, runs: opts.runs ?? [] });
    if (url.includes("/rpc/preview_depreciation_run")) return jsonResponse(opts.preview ?? faPreview());
    if (url.includes("/rpc/run_depreciation_manual")) {
      return opts.runFails
        ? jsonResponse({ code: "CLR38", message: "an un-dead depreciation draft is outstanding", details: '{"reason":"period_draft_outstanding"}' }, 400)
        : jsonResponse({ status: "drafted", entry_id: "e-9999", charged_cents: 7500, entries: 1, skipped: [] });
    }
    throw new Error(`unexpected fetch: ${url}`);
  }) as typeof fetch;

  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  globalThis.fetch = impl;
  configureSessionTokenSource(async () => "tok");

  const h = await renderComponent(intlApp(createElement(DepreciationRunsPanel, {
    clientId: FA_CLIENT, hasLiveAuthority: true,
  })));
  bodyNode().appendChild(h.container);
  for (let i = 0; i < 6; i++) await h.settle();

  const teardown = async () => {
    await h.unmount();
    globalThis.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
    resetSessionTokenSource();
  };
  return { h, calls, teardown };
}

test("runs.columns a run's SKIPPED assets and the entry it posted both render — the read returned them from the start and nobody showed them", async () => {
  const { h, teardown } = await mountPanel({
    runs: [faRun({ skipped: [{ asset_id: "a-1", reason: "incomplete" }, { asset_id: "a-2", reason: "fully_depreciated" }] })],
  });
  try {
    const row = findAll(h.container as never, (n) => n.tagName === "TR" && tid(n).startsWith("fa-run-row-"))[0];
    assert.ok(row, "the run renders");
    const text = textOf(row as never);
    assert.match(text, /2026-06-01/, "its period");
    assert.match(text, /100\.00/, "…what it charged, to the sen");
    assert.match(text, /2 skipped/, "…HOW MANY assets it skipped");
    const link = findAll(row as never, (n) => n.tagName === "A")[0];
    assert.ok(link, "…and a link to the journal entry it posted");
    assert.match(String(attr(link as never, "href")), /\/journals\?tab=posted&entry=e-3333/);
    assert.match(h.text(), /waiting on depreciation particulars/, "…with each reason in WORDS");
  } finally {
    await teardown();
  }
});

test("runs.collapse a run whose skips are all benign may collapse; one carrying work somebody still owes renders OPEN", async () => {
  const benign = await mountPanel({
    runs: [faRun({ id: "run-b", skipped: [{ asset_id: "a", reason: "fully_depreciated" }] })],
  });
  try {
    assert.equal(attr(benign.h.find((n) => tid(n) === "fa-run-skipped-run-b") as never, "data-starts-open"), "false");
  } finally {
    await benign.teardown();
  }

  const owed = await mountPanel({
    runs: [faRun({ id: "run-o", skipped: [{ asset_id: "a", reason: "disposal_draft_outstanding" }] })],
  });
  try {
    assert.equal(attr(owed.h.find((n) => tid(n) === "fa-run-skipped-run-o") as never, "data-starts-open"), "true",
      "a disposal draft somebody still has to approve or withdraw is not hidden behind a disclosure");
  } finally {
    await owed.teardown();
  }
});

test("runs.preview opening the dialog READS the preview and shows the database's own period — and there are no date inputs left to get wrong", async () => {
  const { h, calls, teardown } = await mountPanel();
  try {
    const trigger = h.find((n) => n.tagName === "BUTTON" && textOf(n).includes("Run depreciation"));
    assert.ok(trigger, "the run trigger renders");
    await h.fireEvent(trigger!, "click");
    for (let i = 0; i < 8; i++) await h.settle();

    assert.ok(calls.some((c) => c.url.includes("/rpc/preview_depreciation_run")),
      "the dialog reads the preview when it OPENS — never eagerly for every client on the page");
    const period = findAll(bodyNode(), (n) => tid(n) === "fa-preview-period")[0];
    assert.ok(period, "…and the period the DATABASE chose renders");
    assert.match(textOf(period! as never), /2026-07-01/);

    // THE TWO DATE INPUTS ARE GONE. The only lawful value a person could have typed was the one
    // the database already knew, and typing anything else earned a refusal that read like a bug.
    const dates = findAll(bodyNode(), (n) => {
      const k = Object.keys(n).find((c) => c.startsWith("__reactProps"));
      const props = k ? ((n as unknown as Record<string, unknown>)[k] as Record<string, unknown>) : {};
      return n.tagName === "INPUT" && props.type === "date";
    });
    assert.equal(dates.length, 0, "no date input remains in the run dialog");
  } finally {
    await teardown();
  }
});

test("runs.one_key Confirm posts the period the PREVIEW named, with the decision's own op key — and a retry of the same decision reuses it", async () => {
  const { h, calls, teardown } = await mountPanel({ runFails: true });
  try {
    const trigger = h.find((n) => n.tagName === "BUTTON" && textOf(n).includes("Run depreciation"));
    await h.fireEvent(trigger!, "click");
    for (let i = 0; i < 8; i++) await h.settle();

    const cancel = findAll(bodyNode(), (n) => n.tagName === "BUTTON" && textOf(n as never).trim() === "Cancel").pop();
    const footer = findAll(bodyNode(), (n) => (n.childNodes ?? []).includes(cancel!))[0];
    const confirm = findAll(footer!, (n) => n.tagName === "BUTTON" && textOf(n as never).trim() === "Run this period")[0];
    assert.ok(confirm, "the dialog's Confirm control renders");

    await clickButton(confirm as never);
    for (let i = 0; i < 8; i++) await h.settle();
    const first = calls.filter((c) => c.url.includes("/rpc/run_depreciation_manual"));
    assert.equal(first.length, 1, "one attempt, one call");
    assert.equal(first[0]!.body.p_period_start, "2026-07-01", "the period is the PREVIEW's, never a typed one");
    assert.equal(first[0]!.body.p_period_end, "2026-07-31");
    const key = first[0]!.body.p_op_key;
    assert.equal(typeof key, "string");

    // THE RETRY. The run was REFUSED, so the dialog is still open and this is the same decision —
    // the key must not move, or a lost response would be answered with a refusal instead of the
    // receipt the first attempt already earned.
    await clickButton(confirm as never);
    for (let i = 0; i < 8; i++) await h.settle();
    const both = calls.filter((c) => c.url.includes("/rpc/run_depreciation_manual"));
    assert.equal(both.length, 2, "the retry really went out");
    assert.equal(both[1]!.body.p_op_key, key, "…on the SAME operation key: one decision, one key");
  } finally {
    await teardown();
  }
});
