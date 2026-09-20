// #636 — THE BATCH CARD'S EIGHT STATES, and the three rules that hold in every one of them.
//
// NO `Progress` ELEMENT IN ANY STATE. NO PERCENTAGE-SHAPED STRING IN ANY STATE. NO TOTAL. Those
// are not stylistic preferences: the door supplies no denominator (0229's own tail asserts it),
// appendix D item 44 permits `Progress` only for a known numerator/denominator, and AC3 forbids a
// fabricated percentage. A cell that only checked the happy path would let one creep into the
// stopping banner or the loading skeleton.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { NextIntlClientProvider } from "next-intl";
import { renderComponent, textOf } from "../../test/hookHarness";
import { enableDomInspection } from "../../test/domInspect";
import messages from "../../messages/en.json";
import { IntakeBatchCard, type IntakeBatchCardState } from "./intake-batch-card";
import { toIntakeBatchPack } from "../../lib/documents/intake-batch";

enableDomInspection();

const BATCH = "b1111111-1111-4111-8111-111111111111";
const CLIENT = "c1111111-1111-4111-8111-111111111111";

function body(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    computed_at: "2026-04-05T02:00:00Z",
    preview_limit: 10,
    batch: {
      id: BATCH, label: "April sources", origin: "documents_tab", state: "open",
      opened_by: "u1", opened_at: "2026-04-05T01:00:00Z", cancel_requested_at: null,
    },
    facets: {
      admitted: { status: "ok", count: 95, coverage: "ok", coverage_reason: null, rows: [
        { member_id: "m1", work_id: "w1", client_id: CLIENT, document_id: "d1", work_status: "running",
          purpose: "journal_entry", memo: "April rent", attempts: 2, retrying: true, created_at: "2026-04-05T01:10:00Z" },
      ] },
      settled: { status: "ok", count: 90, coverage: "ok", coverage_reason: null, uncounted_completions: 0, rows: [
        { member_id: "m2", work_id: "w2", client_id: CLIENT, receipt_id: "r2", entry_id: "e2",
          committed_at: "2026-04-05T01:20:00Z" },
      ] },
      waiting: { status: "ok", count: 3, coverage: "ok", coverage_reason: null, rows: [
        { member_id: "m3", intake_id: "i3", document_id: "d3", work_id: null, client_id: null,
          dependency: "awaiting_capacity", dependency_reason: "document daily limit reached (docs)",
          filename: "receipt-88.pdf", intake_status: "finalized", intake_failure_code: null,
          has_open_question: false, created_at: "2026-04-05T01:30:00Z" },
      ] },
      failed: { status: "ok", count: 1, coverage: "ok", coverage_reason: null, rows: [
        { member_id: "m4", intake_id: "i4", document_id: null, work_id: null, filename: "broken.pdf",
          intake_status: "failed", intake_failure_code: "storage_error", task_error_code: null,
          created_at: "2026-04-05T01:40:00Z" },
      ] },
      unassigned: { status: "ok", count: 1, coverage: "ok", coverage_reason: null, rows: [
        { member_id: "m5", intake_id: "i5", document_id: "d5", filename: "unknown.pdf",
          intake_status: "finalized", created_at: "2026-04-05T01:50:00Z" },
      ] },
    },
    waiting_basis: {
      by_question: 1,
      by_dependency: { awaiting_fact: 1, awaiting_attribution: 0, awaiting_capacity: 1 },
      by_unfiled: 1, by_capacity_failure: 0,
    },
    // #964: the daily window moved from a UTC day (utc_day/08:00) to an Asia/Kuala_Lumpur day.
    capacity: { window: "myt_day", resets_at_local: "00:00", timezone: "Asia/Kuala_Lumpur" },
    ...overrides,
  };
}

const ready = (over: Record<string, unknown> = {}): IntakeBatchCardState =>
  ({ kind: "ready", pack: toIntakeBatchPack(BATCH, body(over)) });

function App(children: ReturnType<typeof createElement>) {
  return createElement(NextIntlClientProvider, { locale: "en", messages, children });
}

async function render(state: IntakeBatchCardState, props: Record<string, unknown> = {}) {
  const h = await renderComponent(App(createElement(IntakeBatchCard, {
    state, clientId: CLIENT, facet: "all", onFacetChange: () => {}, onRefresh: () => {}, ...props,
  } as never)));
  for (let i = 0; i < 2; i += 1) await h.settle();
  return h;
}

/** THE THREE RULES, checked on a rendered container rather than on a story about it. */
function assertNoDenominator(h: { container: unknown }, where: string): void {
  const container = h.container as { querySelectorAll: (s: string) => unknown[] };
  const bars = container.querySelectorAll("[role='progressbar']");
  assert.equal(bars.length, 0, `${where}: a Progress element rendered — the door supplies no denominator`);
  const text = textOf(h.container as never);
  assert.ok(!/\d+\s*%/.test(text), `${where}: a percentage-shaped string rendered: ${text}`);
  assert.ok(!/\b\d+\s+of\s+\d+\b/i.test(text), `${where}: an "x of y" string rendered: ${text}`);
}

test("intake batch card: LOADING renders a skeleton and an sr-only sentence, and no denominator", async () => {
  const h = await render({ kind: "loading" });
  const text = textOf(h.container as never);
  assert.match(text, /Loading this source batch/);
  assertNoDenominator(h, "loading");
  await h.unmount();
});

test("intake batch card: DENIED clears the rows, explains the access state, and offers nothing that could only refuse", async () => {
  const h = await render({ kind: "denied" });
  const text = textOf(h.container as never);
  assert.match(text, /cannot read this batch/i);
  assert.ok(!text.includes("April sources"), "no batch content leaks into the denied face");
  const buttons = (h.container as { querySelectorAll: (s: string) => unknown[] }).querySelectorAll("button");
  assert.equal(buttons.length, 0, "a denied face offers no control that could only refuse");
  assertNoDenominator(h, "denied");
  await h.unmount();
});

test("intake batch card: a FAILED FIRST READ is an Alert plus Retry, never an Empty", async () => {
  const h = await render({ kind: "failed", message: "read did not answer" });
  const text = textOf(h.container as never);
  assert.match(text, /could not be read/i);
  assert.match(text, /not an empty batch/i, "a read that did not answer proves nothing about the population");
  assert.match(text, /Try again/);
  assertNoDenominator(h, "failed");
  await h.unmount();
});

test("intake batch card: READY renders LABELLED facet counts with their coverage word, and computed_at", async () => {
  const h = await render(ready());
  const text = textOf(h.container as never);
  for (const label of ["Admitted", "Committed", "Waiting", "Failed", "Unassigned"]) {
    assert.ok(text.includes(label), `the ${label} facet is labelled`);
  }
  assert.ok(text.includes("95") && text.includes("90"), "the counts render");
  assert.match(text, /Read at/, "the read instant is labelled, so a stale table is labelled rather than mistaken for a settled one");
  assertNoDenominator(h, "ready");
  await h.unmount();
});

test("intake batch card: a PARTIAL facet renders its named reason, and uncounted completions are NAMED", async () => {
  const h = await render(ready({
    facets: {
      ...(body().facets as Record<string, unknown>),
      admitted: { status: "partial", count: 95, coverage: "partial", coverage_reason: "retry_label_preview_only", rows: [] },
      settled: { status: "partial", count: 90, coverage: "partial", coverage_reason: "completions_without_receipt", uncounted_completions: 4, rows: [] },
    },
  }));
  const text = textOf(h.container as never);
  assert.match(text, /Partial/);
  assert.match(text, /the preview only/);
  assert.match(text, /some completions carry no receipt/);
  assert.match(text, /4 finished without a receipt/, "a completion the database cannot date is NAMED, never counted and never excluded");
  assertNoDenominator(h, "partial");
  await h.unmount();
});

test("intake batch card: an UNKNOWN facet says so instead of showing zero", async () => {
  const h = await render(ready({
    facets: { ...(body().facets as Record<string, unknown>), waiting: { rows: [] } },
  }));
  const text = textOf(h.container as never);
  assert.match(text, /Not known/, "unknown is not zero — the two are different sentences");
  await h.unmount();
});

test("intake batch card: SUCCESSFUL-EMPTY says what will appear and the permitted first action", async () => {
  const empty = Object.fromEntries(["admitted", "settled", "waiting", "failed", "unassigned"].map((k) => [
    k, { status: "ok", count: 0, coverage: "ok", coverage_reason: null, rows: [] },
  ]));
  const h = await render(ready({ facets: empty }));
  const text = textOf(h.container as never);
  assert.match(text, /No sources have joined this batch yet/);
  assert.match(text, /will appear here/);
  assertNoDenominator(h, "empty");
  await h.unmount();
});

test("intake batch card: NO RESULTS preserves the facet and offers Show all right there", async () => {
  const h = await render(ready(), { facet: "failed" as never });
  // `failed` has a row in the default body, so ask for one that does not.
  const h2 = await render(ready({
    facets: {
      ...(body().facets as Record<string, unknown>),
      failed: { status: "ok", count: 0, coverage: "ok", coverage_reason: null, rows: [] },
    },
  }), { facet: "failed" as never });
  const text = textOf(h2.container as never);
  assert.match(text, /No sources in this batch are Failed right now/);
  assert.match(text, /Other groups still have rows/, "a facet with no rows while others have rows is NOT an Empty");
  assert.match(text, /Show all/);
  await h.unmount();
  await h2.unmount();
});

test("intake batch card: CANCELLING says STOPPING and REVEALS the completed receipts; terminal is never shown early", async () => {
  const h = await render(ready({
    batch: { ...(body().batch as Record<string, unknown>), state: "cancelling", cancel_requested_at: "2026-04-05T02:00:00Z" },
  }));
  const text = textOf(h.container as never);
  // FIX ROUND 1 (STANDARDS `chinese-string-in-en-json`): the shipped string used to be
  // "正在停止 · Stopping this batch" and this cell asserted the Chinese half, locking a phrase
  // from the planning documents into the single `en` locale. `git show origin/main:…/en.json`
  // carries zero CJK, so it was the file's first and only instance, not its convention.
  assert.match(text, /Stopping this batch/);
  assert.ok(!/[一-鿿]/.test(text), "the en locale renders English");
  assert.match(text, /already been committed and their receipts are kept/);
  assert.ok(!text.includes("This batch was stopped"), "terminal cancellation is NOT shown while children are still finishing");
  assertNoDenominator(h, "cancelling");
  await h.unmount();
});

test("intake batch card: CANCELLED says no new operations were admitted and offers no Stop control", async () => {
  const h = await render(ready({
    batch: { ...(body().batch as Record<string, unknown>), state: "cancelled" },
  }));
  const text = textOf(h.container as never);
  assert.match(text, /This batch was stopped/);
  assert.ok(!text.includes("Stop this batch"), "a terminal batch offers no Stop — an affordance that could only refuse");
  await h.unmount();
});

test("intake batch card: the EXHAUSTED poll says so and offers a manual Refresh (C77.1)", async () => {
  const h = await render(ready(), { pollExhausted: true as never });
  const text = textOf(h.container as never);
  assert.match(text, /No longer watching for changes/);
  assert.match(text, /Press Refresh to read again/);
  assert.match(text, /Refresh/);
  await h.unmount();
});

test("p636.card.child_addresses — UI-30/UI-31: every preview row names its OWN state and carries its OWN link, and the card offers more than Cancel", async () => {
  const h = await render(ready());
  const container = h.container as { querySelectorAll: (s: string) => { getAttribute: (a: string) => string | null }[] };
  const text = textOf(h.container as never);
  // Every row's own durable state word, at the CHILD's altitude — the historical card said nothing.
  assert.match(text, /Running/, "the admitted child names its own Work status");
  assert.match(text, /Committed/, "the settled child names its own outcome");
  assert.match(text, /Awaiting the daily quota/, "the waiting child names its DECLARED dependency, not a generic 'waiting'");
  assert.match(text, /Upload failed/, "the failed child names how it failed");
  assert.match(text, /Not filed to a client/, "the unassigned child names what is missing");
  assert.match(text, /Retried/, "a retried child carries its retry label, which is a fact about that row");

  const links = container.querySelectorAll("a");
  const hrefs = links.map((a) => a.getAttribute("href") ?? "");
  assert.ok(hrefs.some((href) => href.includes("/work/w1")), "the admitted child links to ITS OWN Work");
  assert.ok(hrefs.some((href) => href.includes("?document=d3")), "a child with no Work yet links to ITS OWN document");
  assert.ok(hrefs.length >= 3, `every preview row offers its own address (found ${hrefs.length})`);

  // …and at least ONE act besides Cancel exists on the card (UI-30's own complaint).
  assert.match(text, /Refresh/);
  assert.match(text, /All/);
  await h.unmount();
});

test("intake batch card: the capacity sentence says 00:00 and never 'midnight' or 'tomorrow'", async () => {
  const h = await render(ready());
  const text = textOf(h.container as never);
  assert.match(text, /resets at 00:00 Asia\/Kuala_Lumpur/);
  assert.ok(!/midnight/i.test(text), "the window is an Asia/Kuala_Lumpur day, reset at 00:00 MYT — never the word 'midnight'");
  assert.ok(!/tomorrow/i.test(text), "…and never 'tomorrow', which is wrong for half the day");
  await h.unmount();
});

test("intake batch card: the NAMED RESIDUAL is on the surface, not only in a report", async () => {
  // RECUT (L05-SPEC-02 / ADV-W2L05-02). This cell used to pin "a file refused by the daily quota
  // before it was accepted never joins a batch" — true until #965's 0254, which commits the
  // refused intake so the runtime can attach it as an `awaiting_capacity` wait. The card now
  // LISTS such a file, so the old sentence was a claim the same card disproved.
  const h = await render(ready());
  const text = textOf(h.container as never);
  assert.ok(!/never joins a batch/i.test(text), "the retired claim is gone from the surface");
  assert.match(text, /keeps its record and shows here as waiting for the quota/);
  assert.match(text, /none of its bytes were stored/, "…and the firm is told nothing was kept");
  assert.match(text, /upload list above/, "…and it points at the list that DOES render the database's own message and remedy");
  await h.unmount();
});

/** A batch holding a file the ceiling refused AT CREATION — the shape #965's 0254 made possible.
 *  The refusal commits its intake at failed/limit, the runtime attaches it and declares
 *  `awaiting_capacity`, so the member sets BOTH of the banner's triggers at once. */
const refusedAtCreation = () => ready({
  facets: {
    ...(body().facets as Record<string, unknown>),
    waiting: {
      status: "ok", count: 1, coverage: "ok", coverage_reason: null, rows: [
        { member_id: "m9", intake_id: "i9", document_id: null, work_id: null, client_id: null,
          dependency: "awaiting_capacity", dependency_reason: "document daily limit reached (docs)",
          filename: "over-quota.pdf", intake_status: "failed", intake_failure_code: "limit",
          has_open_question: false, created_at: "2026-04-05T01:30:00Z" },
      ],
    },
  },
  waiting_basis: {
    by_question: 0,
    by_dependency: { awaiting_fact: 0, awaiting_attribution: 0, awaiting_capacity: 1 },
    by_unfiled: 0, by_capacity_failure: 1,
  },
});

test("intake batch card: a quota-refused source is never promised an automatic resume (ADV-W2L05-03)", async () => {
  // NOTHING in the estate re-drives such a file: the refusal takes no reservation and mints no
  // capability, `beginDocumentIntake` returns before any sidecar is written, and
  // `recoverPendingDocumentIntakes` only re-drives the six RECOVERABLE_STATES — `failed` is not
  // one of them. A banner promising it will "continue after the reset" is a promise the record
  // cannot keep.
  const h = await render(refusedAtCreation());
  const text = textOf(h.container as never);
  assert.match(text, /resets at 00:00 Asia\/Kuala_Lumpur/, "the door's own reset moment is still stated");
  assert.ok(!/continue after the reset/i.test(text),
    "the card must not promise a resume nothing in the estate performs");
  assert.match(text, /upload it again/i, "…it states the remedy the firm actually has");
  await h.unmount();
});

test("intake batch card: waiting_basis states BOTH sources, so two numbers over one relation can be explained", async () => {
  const h = await render(ready());
  const text = textOf(h.container as never);
  assert.match(text, /1 on an open question/);
  assert.match(text, /1 awaiting a fact/);
  assert.match(text, /1 awaiting the daily quota/);
  assert.match(text, /1 not yet filed to a client/);
  await h.unmount();
});

test("intake batch card: a STOPPING batch whose canceller lost authority NAMES why it cannot finish (ADV-636-03)", async () => {
  const h = await render(ready({
    batch: { ...(body().batch as Record<string, unknown>), state: "cancelling", cancel_requested_at: "2026-04-05T02:00:00Z" },
    cancel_blocked: "canceller_not_active",
  }));
  const text = textOf(h.container as never);
  assert.match(text, /This batch cannot finish stopping/,
    "a parent that can never settle says so, instead of showing 'stopping' for ever");
  assert.match(text, /no longer an active member/);
  // #968 (fix round) shipped a remedy AT THE DOOR: while the batch is still stopping and the
  // stored canceller holds no active bookkeeper+ membership of this firm, a different active
  // bookkeeper may press Stop again and the door admits it as a genuinely new decision. The
  // banner named only the two pre-#968 workarounds, so it sent the firm the long way round.
  assert.match(text, /press Stop again/i,
    "…and names the remedy this product actually ships (#968), first");
  assert.match(text, /remaining work item from its own page/,
    "…without dropping the fallbacks that still work");
  assertNoDenominator(h, "cancel blocked");
  await h.unmount();
});

test("intake batch card: an OPEN batch names no blockage", async () => {
  const h = await render(ready());
  assert.ok(!textOf(h.container as never).includes("cannot finish stopping"));
  await h.unmount();
});

test("intake batch card: the FIRM-LEAF mount keeps Cancel — 'read-only apart from Cancel' (STANDARDS)", async () => {
  const h = await render(ready(), { clientId: null as never });
  assert.match(textOf(h.container as never), /Stop this batch/,
    "the firm leaf mounts this read-only APART FROM CANCEL; the old `readOnly` prop gated that one "
    + "button and nothing else, so it hid the only act the mount was supposed to keep and made "
    + "unassigned-sources.tsx's onCancelled handler dead code");
  await h.unmount();
});

test("intake batch card: a TERMINAL batch offers no Stop even on the firm-leaf mount", async () => {
  const h = await render(ready({ batch: { ...(body().batch as Record<string, unknown>), state: "cancelled" } }),
    { clientId: null as never });
  assert.ok(!textOf(h.container as never).includes("Stop this batch"),
    "an affordance that could only refuse is still never offered");
  await h.unmount();
});

test("intake batch card: a child that POSTED is rendered as committed, never as a failure (V636R-1)", async () => {
  // The door is what stops a settled member appearing under `failed` (0229's facet predicate, and
  // p636.batch.failed_excludes_settled). This cell pins the OTHER half: the card must not invent
  // the state either — a settled row renders its receipt, and the failed facet renders only what
  // the door put there.
  const h = await render(ready({
    facets: {
      ...(body().facets as Record<string, unknown>),
      failed: { status: "ok", count: 0, coverage: "ok", coverage_reason: null, rows: [] },
    },
  }));
  const text = textOf(h.container as never);
  assert.ok(!text.includes("Extraction failed"),
    "no row claims an extraction failure the door did not report");
  assert.match(text, /Committed/, "the settled child keeps its own outcome word");
  await h.unmount();
});
