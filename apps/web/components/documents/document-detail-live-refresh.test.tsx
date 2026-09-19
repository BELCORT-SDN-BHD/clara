// #904 — THE DOCUMENT DETAIL PANEL'S PROCESSING TASKS REFRESH LIVE, bounded, while any task is
// non-terminal — and STOP once every task is terminal.
//
// #650's final report named this the WORKBENCH'S OWN defect, distinct from the pre-filing
// intake-receipts settle poll (`documents-workbench-refresh.test.tsx`'s own #633 battery, at the
// bottom of that file): that poll covers the UPLOAD QUEUE before a document is filed; this one
// covers a FILED document's own extraction/OCR tasks, read via `document_processing_tasks_visible`
// and rendered by `DocumentMetadata`'s "Extraction tasks" section. Before this ticket a task that
// moved `running` -> `done` while the panel stayed open was invisible until a manual reload.
//
// READ COUNTS ARE THE DISCRIMINATING POST-CONDITION, not rendered text: a poll tick that reads the
// SAME still-running row back is invisible to a text assertion, and "the panel still says Running"
// is exactly the defect. `document_processing_tasks_visible`'s own read count is what proves a
// background tick actually happened, the same idiom `documents-workbench-refresh.test.tsx` uses for
// `document_intakes_visible`.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderComponent, textOf } from "../../test/hookHarness";
import { enableDomInspection } from "../../test/domInspect";
import { configureSessionTokenSource, resetSessionTokenSource } from "../../lib/session-accessor";
import { DocumentsWorkbench } from "./documents-workbench";
import {
  documentsApp, makeNavigation, DOCUMENTS_CLIENT, DOC_PDF, DOC_ROWS, FILING_ROWS,
} from "./documents-test-fixtures";

enableDomInspection();

const TASK_ID = "t1111111-1111-4111-8111-111111111111";

function taskRow(status: "queued" | "held_egress" | "running" | "done" | "failed") {
  return {
    id: TASK_ID, document_id: DOC_PDF, lane: "extraction", status, version_n: 1,
    attempt_count: 1, error_code: null, created_at: "2026-04-01T00:00:02Z",
    started_at: status === "queued" ? null : "2026-04-01T00:00:03Z",
    finished_at: status === "done" || status === "failed" ? "2026-04-01T00:00:10Z" : null,
    updated_at: "2026-04-01T00:00:10Z",
  };
}

/** The workbench's read surface, counted by relation — `tasks` is a function so a cell can change
 *  what the NEXT poll tick returns (the settle transition), the same shape
 *  `documents-workbench-refresh.test.tsx`'s own `receiptFetch` uses for the intake-receipts poll. */
function makeFetch(counts: Record<string, number>, tasks: () => unknown[]): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = String(input);
    const relation = /\/rest\/v1\/(?:rpc\/)?([a-z_]+)/.exec(url)?.[1] ?? "unknown";
    counts[relation] = (counts[relation] ?? 0) + 1;
    const body = (() => {
      switch (relation) {
        case "document_filings": return FILING_ROWS.filter((f) => f.document_id === DOC_PDF);
        case "documents": return [DOC_ROWS[DOC_PDF]];
        case "clients": return [{ id: DOCUMENTS_CLIENT, name: "Rome Properties", status: "active" }];
        case "document_processing_tasks_visible": return tasks();
        case "attribution_candidates": return [];
        case "document_extractions": return [];
        case "document_regions": return [];
        case "journal_entries": return [];
        case "coding_tasks_visible": return [];
        case "lint_findings": return [];
        case "get_document_state": return null;
        case "list_source_revisions": return null;
        case "list_source_dependents": return null;
        default: return [];
      }
    })();
    return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
}

// FAST, matching documents-workbench-refresh.test.tsx's own fix-round note: the shipped poll waits
// 1.5s before its first tick and backs off from there, while `h.settle()` is a 0ms macrotask hop —
// a zero-delay budget is what makes every assertion below non-vacuous rather than measuring a poll
// that never got a single tick. `maxTicks` is generous (matching that file's own WIDE_POLL, sized
// up further): with a 0ms delay a tick fires on nearly every settle(), and `withDetailOpen`'s own
// mount/rerender settles already spend a chunk of a small budget before a cell's body ever runs —
// measured here (a `maxTicks: 20` budget exhausted during setup, before a single assertion ran).
const FAST_POLL = { baseDelayMs: 0, maxDelayMs: 0, maxTicks: 500 } as const;

/** Settle until `condition` holds or a REAL wall-clock deadline passes — the
 *  `onboarding-field-composition.test.tsx` idiom, generalized. A fixed settle COUNT is what the
 *  fix round above measured as flaky under a full-directory run (163 tests sharing the process's
 *  timer queue): the same 30 settles that always caught a tick in isolation sometimes caught zero
 *  under contention. A deadline gives the real event loop the time it needs regardless of how many
 *  OTHER files' timers are queued alongside this one's. */
async function settleUntil(
  h: { settle: () => Promise<void> },
  condition: () => boolean,
  label: string,
): Promise<void> {
  const deadline = Date.now() + 10_000;
  while (!condition()) {
    if (Date.now() >= deadline) throw new Error(`timed out waiting for ${label}`);
    await h.settle();
  }
}

async function withDetailOpen(
  tasks: () => unknown[],
  run: (h: Awaited<ReturnType<typeof renderComponent>>, counts: Record<string, number>) => Promise<void>,
): Promise<void> {
  const counts: Record<string, number> = {};
  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  globalThis.fetch = makeFetch(counts, tasks);
  configureSessionTokenSource(async () => "tok");
  const nav = makeNavigation();
  const tree = () => documentsApp(createElement(DocumentsWorkbench, { clientId: DOCUMENTS_CLIENT, settlePoll: FAST_POLL }), nav);
  const h = await renderComponent(tree());
  try {
    for (let i = 0; i < 8; i++) await h.settle();
    const row = h.find((n) => n.tagName === "TR" && textOf(n).includes("invoice-april.pdf"));
    assert.ok(row, "the filed document's row must render");
    await h.fireEvent(row!, "click");
    for (let i = 0; i < 8; i++) await h.settle();
    // THE SELECTION IS A router.push, READ BACK OUT OF ?document= — the navigation stub's own
    // header note (documents-test-fixtures.ts): a push updates the stub's history stack but the
    // tree already rendered with the OLD SearchParamsContext value, so the detail panel never
    // mounts without a re-render carrying the new params — exactly what the App Router does to a
    // client component when only the query changes. documents-workbench-refresh.test.tsx's own
    // `sync()` is the same step, inlined here since this file needs it in one place only.
    await h.rerender(tree());
    for (let i = 0; i < 10; i++) await h.settle();
    await run(h, counts);
  } finally {
    await h.unmount();
    globalThis.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
    resetSessionTokenSource();
  }
}

test("904 — a RUNNING task is polled: document_processing_tasks_visible re-reads without a manual reload", async () => {
  await withDetailOpen(() => [taskRow("running")], async (h, counts) => {
    assert.match(h.text(), /Extracting…/, "the panel opens showing the task's current status");
    const mount = counts.document_processing_tasks_visible ?? 0;
    assert.ok(mount >= 1, "control: the detail panel must read the tasks relation at least once on mount");
    await settleUntil(h, () => (counts.document_processing_tasks_visible ?? 0) > mount,
      "a poll tick past the mount read");
  });
});

test("904 — the transition to DONE renders with no manual reload, then polling STOPS", async () => {
  let done = false;
  await withDetailOpen(() => [taskRow(done ? "done" : "running")], async (h, counts) => {
    assert.match(h.text(), /Extracting…/);
    done = true; // the next tick's read returns the settled row — no click, no reload() call here.
    await settleUntil(h, () => h.text().includes("Extraction complete"),
      "the DONE status to appear from the poll alone, matching the original defect report");
    assert.doesNotMatch(h.text(), /Extracting…/, "the stale status must not linger beside the fresh one");

    // The poll's `enabled` flips false on this same render; give it a real window to prove it
    // ACTUALLY stopped rather than merely not yet ticking again.
    const afterSettle = counts.document_processing_tasks_visible ?? 0;
    for (let i = 0; i < 100; i++) await h.settle();
    assert.equal(
      counts.document_processing_tasks_visible, afterSettle,
      `once every task is terminal the poll must issue NO further reads — grew from ${afterSettle} to ${counts.document_processing_tasks_visible}`,
    );
  });
});

test("904 — a FULLY SETTLED document (queued/running task ALREADY done) is never polled at all", async () => {
  await withDetailOpen(() => [taskRow("done")], async (h, counts) => {
    assert.match(h.text(), /Extraction complete/);
    const mount = counts.document_processing_tasks_visible ?? 0;
    for (let i = 0; i < 100; i++) await h.settle();
    assert.equal(
      counts.document_processing_tasks_visible, mount,
      "an already-terminal task set must never enter the poll's budget — an open tab is not a hot read loop",
    );
  });
});

test("904 — the intake-receipts settle poll is unaffected: a running processing task never triggers a document_intakes_visible read", async () => {
  // The two polls are independent `useSettlePoll` calls with distinct `enabled` predicates and
  // `resetKey`s (this one keyed by documentId, the receipts one by clientId) — this cell is the
  // regression guard for AC3, that adding the tasks poll never makes the UNRELATED intake-receipts
  // relation grow. An empty receipts queue means document_intakes_visible only reads on mount, from
  // the OTHER poll's own logic (documents-workbench-refresh.test.tsx's #633 battery); it must not
  // grow further just because the tasks poll is separately ticking on the same page.
  await withDetailOpen(() => [taskRow("running")], async (h, counts) => {
    for (let i = 0; i < 8; i++) await h.settle();
    const mountIntakes = counts.document_intakes_visible ?? 0;
    const mountTasks = counts.document_processing_tasks_visible ?? 0;
    await settleUntil(h, () => (counts.document_processing_tasks_visible ?? 0) > mountTasks,
      "control: the tasks poll to actually run");
    assert.equal(
      counts.document_intakes_visible ?? 0, mountIntakes,
      "the tasks poll must never issue a read against the unrelated intake-receipts relation",
    );
  });
});
