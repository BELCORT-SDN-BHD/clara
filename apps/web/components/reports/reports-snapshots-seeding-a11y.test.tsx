// GATE (b) — structural a11y scan of the T9 (port-wave) reports panels:
// snapshot registry, render-job queue, seeding batches, wiki curation. Same
// mechanism as components/close/close-a11y.test.tsx (a hand-written rule
// engine, test/a11yRules.ts, rather than real axe-core) and the same mocked-
// fetch idiom as that file — every panel here self-fetches via useHydratedPart,
// unlike the documents workbench's fixed-prop components.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { NextIntlClientProvider } from "next-intl";
import { renderComponent, textOf, setFieldValue } from "../../test/hookHarness";
import { enableDomInspection } from "../../test/domInspect";
import { checkAccessibility } from "../../test/a11yRules";
import { configureSessionTokenSource, resetSessionTokenSource, sessionTokenAccessor } from "../../lib/session-accessor";
import messages from "../../messages/en.json";
import { SnapshotRegistryPanel } from "./SnapshotRegistryPanel";
import { RenderJobQueuePanel } from "./RenderJobQueuePanel";
import { SeedingBatchesPanel } from "./SeedingBatchesPanel";
import { WikiCurationPanel } from "./WikiCurationPanel";

enableDomInspection();

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function withMockedEnv(impl: typeof fetch, run: () => Promise<void>): Promise<void> {
  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  globalThis.fetch = impl;
  configureSessionTokenSource(async () => "tok");
  return run().finally(() => {
    globalThis.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
    resetSessionTokenSource();
  });
}

type DomNode = { tagName?: string; childNodes?: DomNode[] };
/** `h.find` only walks `h.container` — DialogPortal renders an open dialog's
 *  content into `document.body` instead, outside it (same note as
 *  reports-snapshots-seeding-keyboard.test.tsx's own `findIn`). Needed here
 *  once a dialog is open and this file wants a SPECIFIC element inside it. */
function findIn(root: DomNode, predicate: (n: DomNode) => boolean): DomNode | null {
  if (predicate(root)) return root;
  for (const c of root.childNodes ?? []) {
    const found = findIn(c, predicate);
    if (found) return found;
  }
  return null;
}

/** DoorDialog's Confirm button is a plain `@base-ui/react` Button with a
 *  CONSUMER onClick (`onConfirm`, no arguments read from the event) —
 *  discovered while wiring this file's own F7 fix: hookHarness's `fireEvent`
 *  (a synthetic event handed to `container.__listeners`) reliably opens/
 *  closes the dialog via DialogTrigger/DialogClose, whose click handling is
 *  a base-ui PRIMITIVE behaviour, but never reaches THIS button's wrapped
 *  `externalOnClick` (base-ui's `useButton` `getButtonProps` — the same
 *  class of gap `setFieldValue` exists for on the `<Input>` onChange side,
 *  confirmed by a direct-invoke probe that DOES reach it). Calls the react
 *  fiber's own onClick prop directly, exactly like `setFieldValue` does for
 *  onChange — never a plain `fireEvent(node, "click")` for a DoorDialog
 *  Confirm button specifically (Trigger/Cancel/other primitive-driven clicks
 *  are unaffected and keep using ordinary `fireEvent`). */
async function clickConfirm(node: DomNode): Promise<void> {
  const propsKey = Object.keys(node as object).find((k) => k.startsWith("__reactProps"));
  const onClick = propsKey ? (node as unknown as Record<string, { onClick?: (e: unknown) => unknown }>)[propsKey]?.onClick : undefined;
  if (!onClick) throw new Error("clickConfirm: no onClick prop found on this node — is it really a Button?");
  await onClick({
    type: "click", target: node, currentTarget: node, bubbles: true, cancelable: true,
    defaultPrevented: false, isTrusted: true, timeStamp: Date.now(),
    preventDefault() {}, stopPropagation() {}, persist() {},
  });
}

function App(child: ReturnType<typeof createElement>, heading: string) {
  // Wrapped in the same ambient <h1> the real Reports page renders (P3
  // precedent — close-a11y.test.tsx's own note) so each panel's <h2> reads as
  // a valid section heading, not a page-less orphan.
  return createElement(NextIntlClientProvider, {
    locale: "en",
    messages,
    children: createElement("div", null, createElement("h1", null, heading), child),
  });
}

test("SnapshotRegistryPanel: zero violations, collapsed and with the Mint-snapshot dialog OPEN", async () => {
  const impl = (async (u: RequestInfo | URL) => {
    const url = String(u);
    if (url.includes("/period_snapshots")) {
      return jsonResponse([{ id: "s1", client_id: "c1", reporting_period_id: "p1", period_start: "2026-06-01", period_end: "2026-06-30", kind: "management_accounts", minted_by: "u1", minted_at: "2026-07-01T00:00:00Z", books_watermark: "1:2:3", dataset_sha256: "a".repeat(64) }]);
    }
    throw new Error(`unexpected fetch: ${url}`);
  }) as typeof fetch;

  await withMockedEnv(impl, async () => {
    const h = await renderComponent(App(createElement(SnapshotRegistryPanel, { clientId: "c1", session: sessionTokenAccessor }), "Reports"));
    const body = (globalThis as unknown as { document: { body: { appendChild: (c: unknown) => void } } }).document.body;
    body.appendChild(h.container);
    try {
      for (let i = 0; i < 4; i++) await h.settle();
      assert.match(h.text(), /2026-06-01/, "the panel must show the loaded snapshot");
      assert.deepEqual(checkAccessibility(body as never), [], "collapsed");

      const trigger = h.find((n) => n.tagName === "BUTTON" && textOf(n).includes("Mint snapshot"));
      assert.ok(trigger, "the Mint-snapshot trigger must render");
      await h.fireEvent(trigger!, "click");
      for (let i = 0; i < 6; i++) await h.settle();
      assert.match(textOf(body as never), /Mint a month snapshot/);
      assert.deepEqual(checkAccessibility(body as never), [], "dialog open");
    } finally {
      await h.unmount();
      for (let i = 0; i < 5; i++) await h.settle();
    }
  });
});

test("RenderJobQueuePanel: zero violations across the FULL drift journey — collapsed, first Requeue attempt (refused), the drift banner after close, and the SECOND open with the drift checkbox visible", async () => {
  // F7 (independent review): the drift-checkbox path scanned with `drift`
  // non-null, not only the plain trigger-and-fields open state. DoorDialog
  // closes on ANY confirm attempt (see RequeueDialog's own note) — this
  // fixture walks BOTH opens: the first, which refuses and closes; the
  // second, which is where the checkbox actually renders.
  let requeueCalls = 0;
  const impl = (async (u: RequestInfo | URL) => {
    const url = String(u);
    if (url.includes("/render_jobs")) {
      return jsonResponse([{ id: "rj1", client_id: "c1", report_run_id: "run1", kind: "pre_sign", state: "failed", manifest_sha256: "b".repeat(64), requested_by: "u1", attempts: 3, max_attempts: 5, last_error: { code: "render_timeout" }, supersedes_render_job_id: null, requeue_reason: null, enqueued_at: "2026-07-01T00:00:00Z", finished_at: "2026-07-01T00:05:00Z" }]);
    }
    if (url.includes("/rpc/requeue_render_job")) {
      requeueCalls += 1;
      return jsonResponse(
        { code: "CLR43", message: "the re-derived request differs from the one that failed", details: JSON.stringify({ reason: "requeue_manifest_drifted" }) },
        400,
      );
    }
    throw new Error(`unexpected fetch: ${url}`);
  }) as typeof fetch;

  await withMockedEnv(impl, async () => {
    const h = await renderComponent(App(createElement(RenderJobQueuePanel, { clientId: "c1", session: sessionTokenAccessor }), "Reports"));
    const body = (globalThis as unknown as { document: { body: { appendChild: (c: unknown) => void } } }).document.body;
    body.appendChild(h.container);
    try {
      for (let i = 0; i < 4; i++) await h.settle();
      assert.match(h.text(), /pre_sign/, "the panel must show the loaded render job");
      assert.deepEqual(checkAccessibility(body as never), [], "collapsed");

      // --- First open: no drift known yet, no checkbox. ---
      let trigger = h.find((n) => n.tagName === "BUTTON" && textOf(n).includes("Requeue"));
      assert.ok(trigger, "the Requeue trigger must render for a failed job");
      await h.fireEvent(trigger!, "click");
      for (let i = 0; i < 6; i++) await h.settle();
      assert.match(textOf(body as never), /Requeue this render job/);
      assert.doesNotMatch(textOf(body as never), /I understand this may render a different document/, "no drift is known before the first attempt");
      assert.deepEqual(checkAccessibility(body as never), [], "first open, no drift yet");

      const reasonField = findIn(body as never, (n) => n.tagName === "INPUT" && (n as unknown as { type?: string }).type !== "checkbox");
      assert.ok(reasonField, "the reason field must be reachable");
      // shadcn's <Input> is a @base-ui/react wrapper — a plain dispatched
      // "input" event never reaches its onChange (hookHarness.ts's own
      // header); setFieldValue calls the consumer onChange directly.
      await h.act(() => { setFieldValue(reasonField as never, "render timeout"); });
      for (let i = 0; i < 2; i++) await h.settle();

      const confirmFirst = findIn(
        body as never,
        (n) => n.tagName === "BUTTON" && textOf(n as never) === "Requeue" && (n as unknown) !== (trigger as unknown),
      );
      assert.ok(confirmFirst, "the dialog's own Confirm button must be reachable, distinct from the trigger (F7 disambiguation)");
      await h.act(() => clickConfirm(confirmFirst as never));
      for (let i = 0; i < 8; i++) await h.settle();
      assert.equal(requeueCalls, 1, "exactly one requeue attempt so far");

      // DoorDialog closes on this resolved (though refused) attempt — the
      // panel's own persistent banner now names the refusal.
      assert.match(textOf(body as never), /the re-derived request differs from the one that failed/, "the refusal renders through the panel's persistent banner, not inside the (now-closed) dialog");
      assert.deepEqual(checkAccessibility(body as never), [], "collapsed, after the refused first attempt");

      // --- Second open: drift is now KNOWN, and the checkbox renders. ---
      trigger = h.find((n) => n.tagName === "BUTTON" && textOf(n).includes("Requeue"));
      assert.ok(trigger, "the Requeue trigger must still render after the refusal");
      await h.fireEvent(trigger!, "click");
      for (let i = 0; i < 6; i++) await h.settle();
      assert.match(textOf(body as never), /I understand this may render a different document/, "the SECOND open shows the drift consent checkbox — F7's own target state");
      assert.match(textOf(body as never), /superseded manifest sha256/i);
      assert.match(textOf(body as never), new RegExp("b".repeat(16)), "the job's own, real manifest_sha256 renders — never a fabricated 'new' digest");
      assert.deepEqual(checkAccessibility(body as never), [], "second open, drift checkbox visible");
    } finally {
      await h.unmount();
      for (let i = 0; i < 5; i++) await h.settle();
    }
  });
});

test("SeedingBatchesPanel: zero violations, collapsed and with the Tick dialog OPEN on an open proposal", async () => {
  const impl = (async (u: RequestInfo | URL) => {
    const url = String(u);
    if (url.includes("/seeding_batches")) {
      return jsonResponse([{ id: "b1", client_id: "c1", source_document_id: "doc1", source_sha256: "c".repeat(64), state: "open", stats: {}, created_by: "u1", created_at: "2026-07-01T00:00:00Z", completed_at: null, completed_by: null, cancelled_at: null, cancelled_by: null, cancel_reason: null }]);
    }
    if (url.includes("/seeding_proposals")) {
      return jsonResponse([{ id: "p1", batch_id: "b1", client_id: "c1", proposal_kind: "vendor_account_rule", proposal_key: "k1", payload: { account_code: "5100" }, evidence: {}, state: "proposed", decided_by: null, decided_at: null, decision_reason: null, refuse_reason: null, resulting_rule_id: null, resulting_counterparty_id: null, created_at: "2026-07-01T00:00:00Z" }]);
    }
    throw new Error(`unexpected fetch: ${url}`);
  }) as typeof fetch;

  await withMockedEnv(impl, async () => {
    const h = await renderComponent(App(createElement(SeedingBatchesPanel, { clientId: "c1", session: sessionTokenAccessor }), "Reports"));
    const body = (globalThis as unknown as { document: { body: { appendChild: (c: unknown) => void } } }).document.body;
    body.appendChild(h.container);
    try {
      for (let i = 0; i < 4; i++) await h.settle();
      assert.match(h.text(), /vendor_account_rule/, "the panel must show the loaded proposal");
      assert.deepEqual(checkAccessibility(body as never), [], "collapsed");

      const trigger = h.find((n) => n.tagName === "BUTTON" && textOf(n) === "Tick");
      assert.ok(trigger, "the Tick trigger must render for an open proposal");
      await h.fireEvent(trigger!, "click");
      for (let i = 0; i < 6; i++) await h.settle();
      assert.match(textOf(body as never), /Tick this proposal/);
      assert.deepEqual(checkAccessibility(body as never), [], "dialog open");
    } finally {
      await h.unmount();
      for (let i = 0; i < 5; i++) await h.settle();
    }
  });
});

test("SeedingBatchesPanel: F1 regression pin — batches 200 + proposals 401 renders the ERROR BANNER, never a permanent loading spinner", async () => {
  // F1 (independent review, HIGH — re-verify round): the reviewer's own
  // mutation reverts SeedingBatchesPanel's `loadErr = batches.err ??
  // proposals.err` gate back to `batches.err` alone and stays GREEN today
  // without this pin — an empty pin un-fixes itself on the next edit. This
  // test asserts the ERROR banner renders (never LoadingState's own
  // "Loading seeding batches…" text), which the pre-fix gate could never
  // do for a proposals-only failure: `!proposals.data` stays true forever
  // with `batches.err` null, so the old gate fell through to the spinner
  // branch and stayed there.
  const impl = (async (u: RequestInfo | URL) => {
    const url = String(u);
    if (url.includes("/seeding_batches")) {
      return jsonResponse([{ id: "b1", client_id: "c1", source_document_id: "doc1", source_sha256: "f".repeat(64), state: "open", stats: {}, created_by: "u1", created_at: "2026-07-01T00:00:00Z", completed_at: null, completed_by: null, cancelled_at: null, cancelled_by: null, cancel_reason: null }]);
    }
    if (url.includes("/seeding_proposals")) {
      return jsonResponse({ message: "session rejected (401)" }, 401);
    }
    throw new Error(`unexpected fetch: ${url}`);
  }) as typeof fetch;

  await withMockedEnv(impl, async () => {
    const h = await renderComponent(App(createElement(SeedingBatchesPanel, { clientId: "c1", session: sessionTokenAccessor }), "Reports"));
    const body = (globalThis as unknown as { document: { body: { appendChild: (c: unknown) => void } } }).document.body;
    body.appendChild(h.container);
    try {
      for (let i = 0; i < 6; i++) await h.settle();
      assert.doesNotMatch(
        h.text(),
        /Loading seeding batches/,
        "must NOT be stuck on the loading spinner — batches succeeded, proposals failed, and the pre-fix gate never noticed the latter",
      );
      assert.match(h.text(), /Could not load seeding batches/, "the error banner must render, naming the failure honestly");
      assert.match(h.text(), /session rejected \(401\)/, "the proposals read's own failure message must reach the banner");
      assert.deepEqual(checkAccessibility(body as never), [], "the error-banner state itself has zero structural a11y violations");
    } finally {
      await h.unmount();
      for (let i = 0; i < 5; i++) await h.settle();
    }
  });
});

test("WikiCurationPanel: zero violations, collapsed and with the Retire dialog OPEN", async () => {
  const impl = (async (u: RequestInfo | URL) => {
    const url = String(u);
    if (url.includes("/wiki_pages")) {
      return jsonResponse([{ id: "w1", client_id: "c1", slug: "treatment/gst-input-tax", page_kind: "treatment", title: "GST input tax treatment", counterparty_id: null, current_version_id: "v1", state: "active", retired_at: null, retired_by: null, retire_reason: null, created_at: "2026-06-01T00:00:00Z", updated_at: "2026-06-15T00:00:00Z" }]);
    }
    throw new Error(`unexpected fetch: ${url}`);
  }) as typeof fetch;

  await withMockedEnv(impl, async () => {
    const h = await renderComponent(App(createElement(WikiCurationPanel, { clientId: "c1", session: sessionTokenAccessor }), "Reports"));
    const body = (globalThis as unknown as { document: { body: { appendChild: (c: unknown) => void } } }).document.body;
    body.appendChild(h.container);
    try {
      for (let i = 0; i < 4; i++) await h.settle();
      assert.match(h.text(), /GST input tax treatment/, "the panel must show the loaded wiki page");
      assert.deepEqual(checkAccessibility(body as never), [], "collapsed");

      const trigger = h.find((n) => n.tagName === "BUTTON" && textOf(n).includes("Retire"));
      assert.ok(trigger, "the Retire trigger must render for an active page");
      await h.fireEvent(trigger!, "click");
      for (let i = 0; i < 6; i++) await h.settle();
      assert.match(textOf(body as never), /Retire this wiki page/);
      assert.deepEqual(checkAccessibility(body as never), [], "dialog open");
    } finally {
      await h.unmount();
      for (let i = 0; i < 5; i++) await h.settle();
    }
  });
});
