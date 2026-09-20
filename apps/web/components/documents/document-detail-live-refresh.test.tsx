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

/** L07-07 — a live, non-terminal intake row FILED TO `DOC_PDF` (already in `FILING_ROWS`, so
 *  `buildReceipts`'s "filed to this client" arm shows it with no `caller_context` row needed). Used
 *  only by the cell that must prove the receipts poll is GENUINELY live, not merely inert. */
const LIVE_INTAKE_ROW = {
  id: "9a9a9a9a-9a9a-4a9a-8a9a-9a9a9a9a9a9a", uploaded_by: "22222222-2222-4222-8222-222222222222",
  origin: "documents_tab", original_filename: "still-verifying.pdf", declared_mime: "application/pdf",
  declared_bytes: 1024, status: "verifying", document_id: DOC_PDF, failure_code: null,
  expires_at: null, created_at: "2026-04-01T00:00:00.000Z", updated_at: "2026-04-01T00:00:00.000Z",
};

/** The workbench's read surface, counted by relation — `tasks` is a function so a cell can change
 *  what the NEXT poll tick returns (the settle transition), the same shape
 *  `documents-workbench-refresh.test.tsx`'s own `receiptFetch` uses for the intake-receipts poll.
 *  `intakeRows` defaults to an empty queue (every 904 cell but the L07-07 one wants the RECEIPTS
 *  poll inert, so a tasks-poll assertion is never accidentally satisfied by the other poll).
 *  `docRow` defaults to the fixed `DOC_ROWS[DOC_PDF]` literal every pre-existing cell relies on;
 *  CRS-07-02's own cell is the only caller that varies it, so it can prove the `documents` relation
 *  (and so the extraction badge derived from it) actually catches up on the settling tick. */
function makeFetch(
  counts: Record<string, number>, tasks: () => unknown[], intakeRows: () => unknown[] = () => [],
  docRow: () => Record<string, unknown> = () => DOC_ROWS[DOC_PDF] as Record<string, unknown>,
): typeof fetch {
  return (async (input: RequestInfo | URL) => {
    const url = String(input);
    const relation = /\/rest\/v1\/(?:rpc\/)?([a-z_]+)/.exec(url)?.[1] ?? "unknown";
    counts[relation] = (counts[relation] ?? 0) + 1;
    const body = (() => {
      switch (relation) {
        case "document_filings": return FILING_ROWS.filter((f) => f.document_id === DOC_PDF);
        case "documents": return [docRow()];
        case "clients": return [{ id: DOCUMENTS_CLIENT, name: "Rome Properties", status: "active" }];
        case "document_processing_tasks_visible": return tasks();
        case "document_intakes_visible": return intakeRows();
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
  opts: {
    intakeRows?: () => unknown[];
    docRow?: () => Record<string, unknown>;
    settlePoll?: { maxTicks?: number; baseDelayMs?: number; maxDelayMs?: number };
  } = {},
): Promise<void> {
  const counts: Record<string, number> = {};
  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  globalThis.fetch = makeFetch(counts, tasks, opts.intakeRows, opts.docRow);
  configureSessionTokenSource(async () => "tok");
  const nav = makeNavigation();
  const tree = () => documentsApp(
    createElement(DocumentsWorkbench, { clientId: DOCUMENTS_CLIENT, settlePoll: opts.settlePoll ?? FAST_POLL }),
    nav,
  );
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

test("904.L07-07 — the intake-receipts poll is GENUINELY live alongside the tasks poll, not merely inert: with a real unsettled intake row, BOTH polls keep ticking their own relation independently", async () => {
  // The cell above (AC3) only proves the tasks poll never touches document_intakes_visible while
  // the receipts poll's own `enabled` predicate is FALSE throughout (empty queue) — a weaker claim
  // than "the receipts poll is unaffected". This cell seeds one non-terminal intake row filed to
  // the SAME document the tasks poll is watching, so the receipts poll is actually running, and
  // proves each relation grows on ITS OWN poll's schedule rather than the other's.
  await withDetailOpen(
    () => [taskRow("running")],
    async (h, counts) => {
      for (let i = 0; i < 8; i++) await h.settle();
      const mountIntakes = counts.document_intakes_visible ?? 0;
      const mountTasks = counts.document_processing_tasks_visible ?? 0;
      await settleUntil(h, () => (counts.document_processing_tasks_visible ?? 0) > mountTasks,
        "control: the tasks poll to actually run");
      await settleUntil(h, () => (counts.document_intakes_visible ?? 0) > mountIntakes,
        "the receipts poll must keep ticking on its own schedule — non-vacuous only because this " +
        "cell's fixture makes it genuinely live, unlike the AC3 cell above",
      );
    },
    { intakeRows: () => [LIVE_INTAKE_ROW] },
  );
});

test("904.L07-02 — a poll tick issues exactly ONE read (document_processing_tasks_visible), never the whole detail bundle", async () => {
  // use-settle-poll.ts's own `onTick` contract: "One read." A whole-bundle `reload()` costs five
  // (or six) reads a tick; this proves the narrowed tick touches nothing else the mount read pays
  // for once.
  await withDetailOpen(() => [taskRow("running")], async (h, counts) => {
    for (let i = 0; i < 8; i++) await h.settle();
    const before = {
      documents: counts.documents ?? 0,
      document_filings: counts.document_filings ?? 0,
      document_extractions: counts.document_extractions ?? 0,
      journal_entries: counts.journal_entries ?? 0,
      tasks: counts.document_processing_tasks_visible ?? 0,
    };
    await settleUntil(h, () => (counts.document_processing_tasks_visible ?? 0) > before.tasks,
      "control: a tick actually ran");
    assert.equal(counts.documents ?? 0, before.documents, "a tick must not re-read the document row");
    assert.equal(counts.document_filings ?? 0, before.document_filings, "a tick must not re-read filings");
    assert.equal(counts.document_extractions ?? 0, before.document_extractions, "a tick must not re-read extractions");
    assert.equal(counts.journal_entries ?? 0, before.journal_entries, "a tick must not re-read entries");
  });
});

test("904.L07-A02 — exhausted, with a task still non-terminal, is a VISIBLE end: a message and a manual Refresh, not a silent stop", async () => {
  // use-settle-poll.ts bound 3: `exhausted` exists "so the surface can offer a manual Refresh
  // instead of spinning forever" — the same law intake-receipts.tsx already renders for the
  // sibling poll. A tiny maxTicks reaches exhaustion inside the test's own settle budget instead of
  // waiting out the shipped ~142s.
  const TINY_POLL = { baseDelayMs: 0, maxDelayMs: 0, maxTicks: 2 } as const;
  await withDetailOpen(
    () => [taskRow("running")],
    async (h, counts) => {
      await settleUntil(h, () => h.text().includes("stopped checking"),
        "the exhausted state to render its own visible end, not a silent stop");
      const button = h.find((n) =>
        (n as { getAttribute?: (k: string) => unknown }).getAttribute?.("data-testid") === "extraction-tasks-refresh");
      assert.ok(button, "a manual Refresh control must be offered once exhausted");
      const beforeClick = counts.document_processing_tasks_visible ?? 0;
      await h.fireEvent(button!, "click");
      for (let i = 0; i < 5; i++) await h.settle();
      assert.ok(
        (counts.document_processing_tasks_visible ?? 0) > beforeClick,
        "clicking Refresh must issue a fresh read, proving it is wired to reload() rather than decorative",
      );
    },
    { settlePoll: TINY_POLL },
  );
});

test("CRS-07-02 — the SETTLING tick pays the whole bundle once, so the extraction badge (and the rest of the panel) catch up with the tasks strip", async () => {
  // Fix round (904) narrowed every tick to `listProcessingTasksForDocument` alone — correct for
  // every INTERMEDIATE tick (904.L07-02 above), but the settling tick is different: it is the one
  // moment the panel KNOWS the bundle it read at mount is now stale (a task just went terminal), and
  // narrowing that tick too left the extraction badge (`documentBadges(doc)`, driven by `data.document
  // .extraction_status`) and the rest of `data` frozen at their mount values forever after. This
  // mirrors `documents-workbench.tsx`'s own settled-tick law for the receipts poll (`narrowRef.current
  // = false; // settled: pay the other three reads once, then stop`) applied to this poll instead.
  let done = false;
  await withDetailOpen(
    () => [taskRow(done ? "done" : "running")],
    async (h, counts) => {
      assert.match(h.text(), /extraction: running/, "the mount-time badge starts stale-able: running");
      const before = {
        documents: counts.documents ?? 0,
        document_extractions: counts.document_extractions ?? 0,
      };
      done = true; // the next tick's task read AND document read both report the settled state.
      await settleUntil(h, () => h.text().includes("Extraction complete"),
        "the tasks strip to settle, same trigger as the plain 904 DONE cell");

      assert.match(h.text(), /extraction: done/,
        "the extraction badge must catch up on the SAME tick the tasks strip settles — no separate reload");
      assert.doesNotMatch(h.text(), /extraction: running/, "the stale badge must not linger beside the fresh one");

      // document_regions is NOT asserted here: this fixture's document_extractions is always empty,
      // so loadDocumentDetail's own short-circuit (reads.ts's listRegionsForExtractionIds, "no
      // current extraction ids -> []") correctly issues no document_regions call at all — that is
      // the pre-existing, correct behaviour, not something CRS-07-02 changes.
      assert.equal(counts.documents ?? 0, before.documents + 1,
        "the settling tick pays the full bundle EXACTLY ONCE — the `documents` relation must grow by one, not zero and not repeatedly");
      assert.equal(counts.document_extractions ?? 0, before.document_extractions + 1,
        "document_extractions must grow by exactly one on the settling tick too (the same full reload)");

      // The poll must still actually STOP once settled — CRS-07-02's fix must not turn the
      // settling-tick's one-time full reload into a standing full-bundle poll.
      const afterSettle = { documents: counts.documents ?? 0, tasks: counts.document_processing_tasks_visible ?? 0 };
      for (let i = 0; i < 100; i++) await h.settle();
      assert.equal(counts.documents, afterSettle.documents, "no further `documents` reads once every task is terminal");
      assert.equal(counts.document_processing_tasks_visible, afterSettle.tasks, "no further tasks reads once every task is terminal");
    },
    { docRow: () => ({ ...DOC_ROWS[DOC_PDF], extraction_status: done ? "done" : "running" }) },
  );
});
