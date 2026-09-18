// #658 — `observed_revisions` rendered on B3's Diagnostics section, for the first time.
//
// WHAT WAS WRONG. `lib/work/diagnostics.ts` has TYPED `observed_revisions` since #631 and nothing
// in the repo rendered it, while deployed `claraWork_v4` has been WRITING
// `observed_revisions.knowledge_version` on every model call (`claraWork.v4.impl.ts:593`). So the
// estate recorded which knowledge version a run reasoned under and had no surface that said so —
// the human-visible half of #885.
//
// THE PRODUCT CLAIMS THESE CELLS MAKE:
//   1. every recorded key renders, key by key, from the rows the component ALREADY loaded;
//   2. NO SECOND TRACE READ — one `get_work_execution_trace` per page, because two would double
//      the request and split the honesty story across two components;
//   3. a step with no observed revisions renders nothing rather than an empty label;
//   4. a key outside the closed six renders VERBATIM rather than crashing on a missing message;
//   5. the section's "re-read is a READ" labelling is intact.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { NextIntlClientProvider } from "next-intl";

import messages from "../../messages/en.json";
import { renderComponent } from "../../test/hookHarness";
import { enableDomInspection } from "../../test/domInspect";
import { ObservedRevisions, WorkDiagnostics } from "./work-diagnostics";
import type { WorkTraceRead, WorkTraceRow } from "../../lib/work/diagnostics";

enableDomInspection();

const WORK = "11111111-1111-4111-8111-111111111111";

function withMockedEnv(impl: typeof fetch, run: () => Promise<void>): Promise<void> {
  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  globalThis.fetch = impl;
  return run().finally(() => {
    globalThis.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
  });
}

function row(over: Partial<WorkTraceRow> = {}): WorkTraceRow {
  return {
    id: "t-1",
    run_id: "wrun_01M20WGD9ETKK6RWCBA8CWG1GE",
    seq: 1,
    phase: "model_call",
    capability_id: "accounting_work.model_segment",
    registry_version: "clara-capability-registry/v1",
    bundle_id: "clara-work/v4",
    bundle_digest: "a".repeat(64),
    instructions_id: "clara-work-instructions/v4",
    skills: [],
    tools_id: "clara-work-tools/v4",
    model_id: "llm-openai:gpt",
    purpose: "accounting_work",
    authorization_id: null,
    consent_ref: null,
    activation_ref: null,
    input_digest: null,
    observed_revisions: { knowledge_version: "42" },
    started_at: "2026-09-19T02:00:00Z",
    ended_at: "2026-09-19T02:00:01Z",
    duration_ms: 1000,
    outcome: "ok",
    refusal: null,
    receipt_id: null,
    task_id: "task-1",
    ...over,
  };
}

/** The section takes an INJECTABLE reader (`work-diagnostics.tsx:92-97`), and the sibling cells in
 *  work-diagnostics.test.tsx drive it that way. Injecting keeps these cells about the RENDER and
 *  lets the "how many trace reads did this page make" claim be counted rather than inferred. */
function App(read?: () => Promise<WorkTraceRead>) {
  return createElement(NextIntlClientProvider, {
    locale: "en", messages,
    children: createElement(WorkDiagnostics, {
      workId: WORK, ...(read ? { read: read as never } : {}),
    }),
  });
}

// ---------------------------------------------------------------------------------------------
// The renderer, on its own — it is the whole rule and it is exported so a cell can hold it.
// ---------------------------------------------------------------------------------------------

test("wdo.01 a step with NO observed revisions renders nothing at all", async () => {
  for (const empty of [null, undefined, {}, { knowledge_version: null }]) {
    const h = await renderComponent(createElement(NextIntlClientProvider, {
      locale: "en", messages,
      children: createElement(ObservedRevisions, { observed: empty as Record<string, unknown> | null }),
    }));
    try {
      await h.settle();
      assert.equal(h.text().trim(), "",
        "an empty label is a place a reader would look for a fact that is not there");
    } finally {
      await h.unmount();
    }
  }
});

test("wdo.02 every recorded key renders, sorted, and a key outside the closed six renders VERBATIM", async () => {
  const h = await renderComponent(createElement(NextIntlClientProvider, {
    locale: "en", messages,
    children: createElement(ObservedRevisions, {
      observed: { knowledge_version: "42", books_version: 7, some_future_key: "x1" },
    }),
  }));
  try {
    await h.settle();
    const text = h.text();
    assert.match(text, /books_version 7/);
    assert.match(text, /knowledge_version 42/);
    assert.match(text, /some_future_key x1/,
      "the CHECK vocabulary can widen before this file does — the same rule phaseLabel follows");
    assert.ok(text.indexOf("books_version") < text.indexOf("knowledge_version"), "sorted, so a diff is readable");
  } finally {
    await h.unmount();
  }
});

// ---------------------------------------------------------------------------------------------
// In place, on the section that already loaded the rows
// ---------------------------------------------------------------------------------------------

test("wdo.03 the versions render inside the rows the section ALREADY loaded — no second trace read", async () => {
  let traceReads = 0;
  await withMockedEnv(
    (async (url: RequestInfo | URL) => { throw new Error(`no fetch expected: ${String(url)}`); }) as typeof fetch,
    async () => {
      const h = await renderComponent(App(async () => {
        traceReads += 1;
        return {
          kind: "ok",
          rows: [
            row({ observed_revisions: { knowledge_version: "42" } }),
            row({ id: "t-2", seq: 2, phase: "settle", observed_revisions: {}, capability_id: "accounting_work.settle" }),
          ],
        };
      }));
      try {
        for (let i = 0; i < 6; i++) await h.settle();
        // The step table is behind the section's own disclosure — open it. It is found by its
        // `aria-expanded`, which is the ONE attribute that distinguishes it from the re-read
        // control and is also the thing that makes it a disclosure for a screen reader at all.
        const toggle = h.find((n) => n.tagName === "BUTTON" && n.getAttribute?.("aria-expanded") != null);
        assert.ok(toggle, "the steps disclosure must be present");
        assert.equal(toggle?.getAttribute?.("aria-expanded"), "false", "…and it starts closed");
        await h.fireEvent(toggle!, "click");
        for (let i = 0; i < 4; i++) await h.settle();
        const text = h.text();
        assert.match(text, /knowledge_version 42/,
          "the version deployed claraWork_v4 has been writing since issue 631 is finally READABLE");
        assert.ok(h.find((n) => n.getAttribute?.("data-testid") === "work-diagnostics-observed"));
        assert.equal(traceReads, 1,
          "ONE get_work_execution_trace for the page: a second component would double the request and split the honesty story");
      } finally {
        await h.unmount();
        for (let i = 0; i < 3; i++) await h.settle();
      }
    },
  );
});

test("wdo.04 the section's `re-read is a READ` labelling is intact", async () => {
  await withMockedEnv(
    (async (url: RequestInfo | URL) => { throw new Error(`no fetch expected: ${String(url)}`); }) as typeof fetch,
    async () => {
      const h = await renderComponent(App(async () => ({ kind: "unreadable", message: "boom" })));
      try {
        for (let i = 0; i < 6; i++) await h.settle();
        assert.match(h.text(), /Re-read trace/,
          "a failed trace read still offers a RE-READ — a read, never a re-run");
      } finally {
        await h.unmount();
        for (let i = 0; i < 3; i++) await h.settle();
      }
    },
  );
});
