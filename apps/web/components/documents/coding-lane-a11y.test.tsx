// GATE (b) — structural a11y scan of the coding-lane surface (T7, port-wave
// plan §7.2 "every train with a new panel owes a *-a11y.test.tsx"). Three
// independently-hydrated cells, one mocked RPC/read each. Wrapped in a
// synthetic <h1> — documents-a11y.test.tsx's own idiom: on the real page
// this panel renders under DocumentsWorkbench's own PageHeader <h1>.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { NextIntlClientProvider } from "next-intl";
import { renderComponent, textOf, setFieldValue, clickButton } from "../../test/hookHarness";
import { enableDomInspection } from "../../test/domInspect";
import { checkAccessibility } from "../../test/a11yRules";
import { configureSessionTokenSource, resetSessionTokenSource } from "../../lib/session-accessor";
import { CodingLanePanel } from "./coding-lane-panel";
import messages from "../../messages/en.json";

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

// M12, independent review (pin the fixes): every timestamp below is set to
// 20:00 UTC — 04:00 the FOLLOWING day in Asia/Kuala_Lumpur (UTC+8). A raw
// `.slice(0, 10)` and `businessDate()` therefore disagree by exactly one
// calendar day, so asserting the MYT date (below) fails outright if either
// site regressed to a raw UTC slice.
const UNCODED_FILING = {
  filing_id: "f1", document_id: "d1", client_id: "c1", filed_at: "2026-04-01T20:00:00Z",
  basis: "human", document_kind: "invoice", financial_date: "2026-04-01",
  original_filename: "invoice-april.pdf", mime_type: "application/pdf", extraction_status: "done",
};
const LANE_ROW = { filing_id: "f1", lane: "needs_you", reasons: ["vendor_ambiguous", "high_stakes"] };
const CODING_TASK = {
  id: "t1", client_id: "c1", document_id: "d2", filing_id: "f2", origin: "manual",
  correction_id: null, status: "open", opened_by: "u1", closed_by: null, closed_reason: null,
  result_entry_id: null, created_at: "2026-04-02T20:00:00Z", updated_at: "2026-04-02T20:00:00Z", closed_at: null,
};
const LINT_FINDING = {
  id: "lf1", firm_id: "f1", client_id: "c1", finding_kind: "stale_claim", dedupe_key: "k1",
  severity: "warn", page_id: null, detail: {}, state: "open", opened_at: "2026-04-03T20:00:00Z",
  resolved_conclusion: null, resolved_note: null, resolved_by: null, resolved_at: null, created_at: "2026-04-03T20:00:00Z",
};

type Node = { tagName?: string; childNodes?: Node[] };
function findIn(root: Node, predicate: (n: Node) => boolean): Node | null {
  if (predicate(root)) return root;
  for (const c of root.childNodes ?? []) { const f = findIn(c, predicate); if (f) return f; }
  return null;
}
function realBody(): { appendChild: (c: unknown) => void; removeChild: (c: unknown) => void; childNodes?: unknown[] } {
  return (globalThis as unknown as { document: { body: unknown } }).document.body as never;
}

function mockCodingFetch(u: string): Response {
  if (u.includes("/rpc/list_uncoded_filings")) return jsonResponse([UNCODED_FILING]);
  if (u.includes("/rpc/list_coding_lanes")) return jsonResponse([LANE_ROW]);
  if (u.includes("/rest/v1/coding_tasks_visible")) return jsonResponse([CODING_TASK]);
  if (u.includes("/rest/v1/journal_entries")) return jsonResponse([]);
  if (u.includes("/rest/v1/lint_findings")) return jsonResponse([LINT_FINDING]);
  throw new Error(`unexpected fetch: ${u}`);
}

test("coding-lane panel (uncoded filings + coding tasks + lint findings, all populated) has zero a11y violations", async () => {
  await withMockedEnv(
    async (u) => mockCodingFetch(String(u)),
    async () => {
      const h = await renderComponent(
        createElement(NextIntlClientProvider, {
          locale: "en",
          messages,
          children: createElement("div", null, createElement("h1", null, "Documents"), createElement(CodingLanePanel, { clientId: "c1" })),
        }),
      );
      try {
        for (let i = 0; i < 6; i++) await h.settle();
        const text = h.text();
        assert.match(text, /invoice-april\.pdf/, "the uncoded filing must have actually loaded");
        assert.match(text, /vendor match is ambiguous/i, "the reason badge must render its real label, not the raw code");
        assert.match(text, /Stale claim/, "the lint finding's kind label must render");
        // M6, independent review (pin the fixes): LintFindingDetail is
        // genuinely MOUNTED inside LintFindingActions.
        assert.match(text, /View details/, "LintFindingDetail's reveal trigger must actually be mounted on the lint finding row");
        // M12, independent review: businessDate, not a raw UTC slice — every
        // fixture above sits at 20:00 UTC (04:00 the NEXT day in MYT); the
        // wrong (UTC) date must NOT appear anywhere.
        assert.match(text, /2026-04-02/, "the uncoded filing's date must render in the business timezone (MYT), not raw UTC");
        assert.match(text, /2026-04-03/, "the coding task's date must render in the business timezone (MYT), not raw UTC");
        assert.match(text, /2026-04-04/, "the lint finding's date must render in the business timezone (MYT), not raw UTC");
        assert.doesNotMatch(text, /2026-04-01(?!T)/, "the RAW UTC date must never appear — it would prove a regression to .slice(0, 10)");
        const violations = checkAccessibility(h.container as never);
        assert.deepEqual(violations, [], JSON.stringify(violations));
      } finally {
        await h.unmount();
      }
    },
  );
});

test("coding-lane panel: all three sections render their empty state honestly (no fabricated rows)", async () => {
  await withMockedEnv(
    async (u) => {
      const url = String(u);
      if (url.includes("/rpc/list_uncoded_filings") || url.includes("/rpc/list_coding_lanes")) return jsonResponse([]);
      if (url.includes("/rest/v1/coding_tasks_visible") || url.includes("/rest/v1/lint_findings")) return jsonResponse([]);
      throw new Error(`unexpected fetch: ${url}`);
    },
    async () => {
      const h = await renderComponent(
        createElement(NextIntlClientProvider, {
          locale: "en",
          messages,
          children: createElement("div", null, createElement("h1", null, "Documents"), createElement(CodingLanePanel, { clientId: "c1" })),
        }),
      );
      try {
        for (let i = 0; i < 6; i++) await h.settle();
        assert.match(h.text(), /Nothing in this lane right now/);
        assert.match(h.text(), /No open coding tasks for this client/);
        assert.match(h.text(), /No open lint findings for this client/);
        const violations = checkAccessibility(h.container as never);
        assert.deepEqual(violations, [], JSON.stringify(violations));
      } finally {
        await h.unmount();
      }
    },
  );
});

// M17, independent review (pin the fixes): a FAILED initial load must render
// the refusal, never fall through to an empty-looking list — the exact
// distinction "all three sections render their empty state honestly" above
// does NOT cover (that test's reads all genuinely SUCCEED with zero rows).
test("coding-lane panel: a FAILED initial load renders the refusal for that section, never a fabricated empty list", async () => {
  await withMockedEnv(
    async (u) => {
      const url = String(u);
      if (url.includes("/rpc/list_uncoded_filings") || url.includes("/rpc/list_coding_lanes")) {
        return jsonResponse({ code: "PGRST301", message: "JWT expired" }, 401);
      }
      if (url.includes("/rest/v1/coding_tasks_visible") || url.includes("/rest/v1/lint_findings")) return jsonResponse([]);
      throw new Error(`unexpected fetch: ${url}`);
    },
    async () => {
      const h = await renderComponent(
        createElement(NextIntlClientProvider, {
          locale: "en",
          messages,
          children: createElement("div", null, createElement("h1", null, "Documents"), createElement(CodingLanePanel, { clientId: "c1" })),
        }),
      );
      try {
        for (let i = 0; i < 6; i++) await h.settle();
        assert.doesNotMatch(h.text(), /Nothing in this lane right now/, "a FAILED read must never render the honest-empty message — that claim is reserved for a read that actually succeeded");
        assert.match(h.text(), /Sign in|session|expired|forbidden|Something went wrong/i, "the uncoded-filings section must show ITS OWN failed-read state");
        // The other two sections' reads succeeded independently — proving
        // one cell's failure does not take down its siblings.
        assert.match(h.text(), /No open coding tasks for this client/);
        assert.match(h.text(), /No open lint findings for this client/);
      } finally {
        await h.unmount();
      }
    },
  );
});

// F8, independent review (the mutant panel): the LANE FILTER itself, pinned
// with two filings in two DIFFERENT lanes so filtering is distinguishable —
// a fixture with only one lane cannot fail if the filter were deleted
// entirely (everything would still show).
test("uncoded-filings list: the lane filter genuinely hides rows outside the active tab", async () => {
  const FILING_A = { ...UNCODED_FILING, filing_id: "fa", original_filename: "needs-you-invoice.pdf" };
  const LANE_A = { filing_id: "fa", lane: "needs_you", reasons: [] };
  const FILING_B = { ...UNCODED_FILING, filing_id: "fb", original_filename: "ready-invoice.pdf" };
  const LANE_B = { filing_id: "fb", lane: "ready", reasons: [] };
  await withMockedEnv(
    async (u) => {
      const url = String(u);
      if (url.includes("/rpc/list_uncoded_filings")) return jsonResponse([FILING_A, FILING_B]);
      if (url.includes("/rpc/list_coding_lanes")) return jsonResponse([LANE_A, LANE_B]);
      if (url.includes("/rest/v1/coding_tasks_visible") || url.includes("/rest/v1/lint_findings")) return jsonResponse([]);
      throw new Error(`unexpected fetch: ${url}`);
    },
    async () => {
      const h = await renderComponent(
        createElement(NextIntlClientProvider, {
          locale: "en",
          messages,
          children: createElement("div", null, createElement("h1", null, "Documents"), createElement(CodingLanePanel, { clientId: "c1" })),
        }),
      );
      try {
        for (let i = 0; i < 6; i++) await h.settle();
        // Default tab is "Needs you" — only FILING_A's own lane.
        assert.match(h.text(), /needs-you-invoice\.pdf/, "the needs_you filing must show on the default tab");
        assert.doesNotMatch(h.text(), /ready-invoice\.pdf/, "the ready-lane filing must NOT show on the needs_you tab");

        const readyTab = h.find((n) => n.tagName === "BUTTON" && textOf(n).match(/^Ready \(1\)$/) !== null);
        assert.ok(readyTab, "the Ready tab (with its own count) must render");
        await h.fireEvent(readyTab!, "click");
        await h.settle();

        assert.match(h.text(), /ready-invoice\.pdf/, "switching to the Ready tab must reveal the ready-lane filing");
        assert.doesNotMatch(h.text(), /needs-you-invoice\.pdf/, "the needs_you filing must NOT show on the Ready tab");
      } finally {
        await h.unmount();
      }
    },
  );
});

// F8, independent review: the SECTION-level row-vanish banner (F2's own
// mechanism) — pinned by actually making the acted-on row disappear on
// reload (simulating "someone else already coded it") and proving the
// error surfaces at the SECTION, not silently, since no row remains to
// attach it to.
test("uncoded-filings list: a refusal whose row vanishes on the re-read surfaces as a persistent section banner, not silently", async () => {
  let refused = false;
  await withMockedEnv(
    async (u) => {
      const url = String(u);
      if (url.includes("/rpc/open_coding_task")) {
        refused = true;
        return jsonResponse({ code: "CLR24", message: "active coding-task filing not found" }, 400);
      }
      if (url.includes("/rpc/list_uncoded_filings")) return jsonResponse(refused ? [] : [UNCODED_FILING]);
      if (url.includes("/rpc/list_coding_lanes")) return jsonResponse(refused ? [] : [LANE_ROW]);
      if (url.includes("/rest/v1/coding_tasks_visible") || url.includes("/rest/v1/lint_findings")) return jsonResponse([]);
      throw new Error(`unexpected fetch: ${url}`);
    },
    async () => {
      const h = await renderComponent(
        createElement(NextIntlClientProvider, {
          locale: "en",
          messages,
          children: createElement("div", null, createElement("h1", null, "Documents"), createElement(CodingLanePanel, { clientId: "c1" })),
        }),
      );
      const body = realBody();
      body.appendChild(h.container);
      try {
        for (let i = 0; i < 6; i++) await h.settle();
        const trigger = h.find((n) => n.tagName === "BUTTON" && textOf(n).match(/^Open coding task$/) !== null);
        assert.ok(trigger, "the open-task trigger must render before the refusal");
        await h.fireEvent(trigger!, "click");
        for (let i = 0; i < 4; i++) await h.settle();

        const reasonField = findIn(body as never, (n) => n.tagName === "TEXTAREA");
        await h.act(() => { setFieldValue(reasonField as never, "vendor could not be matched"); });
        const confirmButton = findIn(body as never, (n) => n.tagName === "BUTTON" && textOf(n as never).match(/^Open coding task$/) !== null && n !== trigger);
        await h.act(() => { clickButton(confirmButton as never); });
        for (let i = 0; i < 6; i++) await h.settle();

        assert.ok(refused, "open_coding_task must actually have refused");
        assert.match(h.text(), /active coding-task filing not found/, "the refusal's own message must surface SOMEWHERE");
        assert.match(h.text(), /CLR24/, "the CLR code must survive — proving ActionRefusal, not a degraded generic message, rendered it");
        assert.match(h.text(), /Nothing in this lane right now/, "the row itself is genuinely gone from the re-read (the vanish this banner exists for)");
        // R2, independent review: the domain-neutral title, never the bank's
        // own default ("The bank refused this").
        assert.match(h.text(), /This was refused/, "ActionRefusal must render the CodingActionRefusal wrapper's own title");
        assert.doesNotMatch(h.text(), /The bank refused this/, "the bank's own default title must never leak into a non-bank surface");
      } finally {
        await h.unmount();
        if (body.childNodes?.includes(h.container)) body.removeChild(h.container);
      }
    },
  );
});

// M18, independent review (pin the fixes): R1's own fix, pinned for
// CodingTasksSection specifically — the ONLY task in the list is dismissed,
// dismiss_coding_task itself refuses, and the reload returns zero tasks
// (simulating "someone else already closed it"). Before R1 this banner sat
// behind an early `if (tasks.length === 0) return <EmptyState>` and could
// never render for exactly this, the commonest, case.
test("coding tasks section: a refusal whose ONLY row vanishes on the re-read still surfaces a persistent banner", async () => {
  let refused = false;
  await withMockedEnv(
    async (u) => {
      const url = String(u);
      if (url.includes("/rpc/dismiss_coding_task")) {
        refused = true;
        return jsonResponse({ code: "CLR24", message: "coding task is not open" }, 400);
      }
      if (url.includes("/rest/v1/coding_tasks_visible")) return jsonResponse(refused ? [] : [CODING_TASK]);
      if (url.includes("/rpc/list_uncoded_filings") || url.includes("/rpc/list_coding_lanes")) return jsonResponse([]);
      if (url.includes("/rest/v1/lint_findings")) return jsonResponse([]);
      throw new Error(`unexpected fetch: ${url}`);
    },
    async () => {
      const h = await renderComponent(
        createElement(NextIntlClientProvider, {
          locale: "en",
          messages,
          children: createElement("div", null, createElement("h1", null, "Documents"), createElement(CodingLanePanel, { clientId: "c1" })),
        }),
      );
      const body = realBody();
      body.appendChild(h.container);
      try {
        for (let i = 0; i < 6; i++) await h.settle();
        const trigger = h.find((n) => n.tagName === "BUTTON" && textOf(n).match(/^Dismiss$/) !== null);
        assert.ok(trigger, "the dismiss trigger must render before the refusal");
        await h.fireEvent(trigger!, "click");
        for (let i = 0; i < 4; i++) await h.settle();

        const reasonField = findIn(body as never, (n) => n.tagName === "TEXTAREA");
        await h.act(() => { setFieldValue(reasonField as never, "duplicate task"); });
        const confirmButton = findIn(body as never, (n) => n.tagName === "BUTTON" && textOf(n as never).match(/^Dismiss task$/) !== null);
        await h.act(() => { clickButton(confirmButton as never); });
        for (let i = 0; i < 6; i++) await h.settle();

        assert.ok(refused, "dismiss_coding_task must actually have refused");
        assert.match(h.text(), /coding task is not open/, "the refusal's own message must surface");
        assert.match(h.text(), /CLR24/, "the CLR code must survive");
        assert.match(h.text(), /No open coding tasks for this client/, "the ONLY row is genuinely gone from the re-read — this is the case R1 fixed");
      } finally {
        await h.unmount();
        if (body.childNodes?.includes(h.container)) body.removeChild(h.container);
      }
    },
  );
});

// M19, independent review (pin the fixes): the SAME R1 fix, pinned for
// LintFindingsSection.
test("lint findings section: a refusal whose ONLY row vanishes on the re-read still surfaces a persistent banner", async () => {
  let refused = false;
  await withMockedEnv(
    async (u) => {
      const url = String(u);
      if (url.includes("/rpc/resolve_lint_finding")) {
        refused = true;
        return jsonResponse({ code: "CLR33", message: "lint finding is not open" }, 400);
      }
      if (url.includes("/rest/v1/lint_findings")) return jsonResponse(refused ? [] : [LINT_FINDING]);
      if (url.includes("/rpc/list_uncoded_filings") || url.includes("/rpc/list_coding_lanes")) return jsonResponse([]);
      if (url.includes("/rest/v1/coding_tasks_visible")) return jsonResponse([]);
      throw new Error(`unexpected fetch: ${url}`);
    },
    async () => {
      const h = await renderComponent(
        createElement(NextIntlClientProvider, {
          locale: "en",
          messages,
          children: createElement("div", null, createElement("h1", null, "Documents"), createElement(CodingLanePanel, { clientId: "c1" })),
        }),
      );
      const body = realBody();
      body.appendChild(h.container);
      try {
        for (let i = 0; i < 6; i++) await h.settle();
        const trigger = h.find((n) => n.tagName === "BUTTON" && textOf(n).match(/^Resolve$/) !== null);
        assert.ok(trigger, "the resolve trigger must render before the refusal");
        await h.fireEvent(trigger!, "click");
        for (let i = 0; i < 4; i++) await h.settle();

        const select = findIn(body as never, (n) => n.tagName === "SELECT");
        await h.act(() => { setFieldValue(select as never, "corrected"); });
        const noteField = findIn(body as never, (n) => n.tagName === "TEXTAREA");
        await h.act(() => { setFieldValue(noteField as never, "checked with the client"); });
        const confirmButton = findIn(body as never, (n) => n.tagName === "BUTTON" && textOf(n as never).match(/^Resolve finding$/) !== null);
        await h.act(() => { clickButton(confirmButton as never); });
        for (let i = 0; i < 6; i++) await h.settle();

        assert.ok(refused, "resolve_lint_finding must actually have refused");
        assert.match(h.text(), /lint finding is not open/, "the refusal's own message must surface");
        assert.match(h.text(), /CLR33/, "the CLR code must survive");
        assert.match(h.text(), /No open lint findings for this client/, "the ONLY row is genuinely gone from the re-read — this is the case R1 fixed");
      } finally {
        await h.unmount();
        if (body.childNodes?.includes(h.container)) body.removeChild(h.container);
      }
    },
  );
});

// M8, independent review (pin the fixes): the PER-ROW refusal banner —
// TWO coding tasks present, the refusal is on ONE of them, and that task's
// row STAYS present after the reload (a validation-style refusal, not a
// "someone else settled it" one) — the acted-on row must carry the banner,
// the OTHER task's row must carry NONE, and there must be no
// section-level banner (the row never vanished).
test("coding tasks section: a refusal whose row STAYS present attaches to that row alone, never the other row or a section banner", async () => {
  const OTHER_TASK = { ...CODING_TASK, id: "t2", filing_id: "f3" };
  await withMockedEnv(
    async (u) => {
      const url = String(u);
      if (url.includes("/rpc/dismiss_coding_task")) {
        return jsonResponse({ code: "CLR24", message: "dismissal reason is required" }, 400);
      }
      if (url.includes("/rest/v1/coding_tasks_visible")) return jsonResponse([CODING_TASK, OTHER_TASK]);
      if (url.includes("/rpc/list_uncoded_filings") || url.includes("/rpc/list_coding_lanes")) return jsonResponse([]);
      if (url.includes("/rest/v1/lint_findings")) return jsonResponse([]);
      throw new Error(`unexpected fetch: ${url}`);
    },
    async () => {
      const h = await renderComponent(
        createElement(NextIntlClientProvider, {
          locale: "en",
          messages,
          children: createElement("div", null, createElement("h1", null, "Documents"), createElement(CodingLanePanel, { clientId: "c1" })),
        }),
      );
      const body = realBody();
      body.appendChild(h.container);
      try {
        for (let i = 0; i < 6; i++) await h.settle();
        // Two Dismiss triggers now render (one per task); act on the FIRST.
        const triggers = [] as Node[];
        (function walk(n: Node) {
          if (n.tagName === "BUTTON" && textOf(n as never) === "Dismiss") triggers.push(n);
          for (const c of n.childNodes ?? []) walk(c);
        })(body as never);
        assert.equal(triggers.length, 2, "both tasks must each render their own Dismiss trigger");
        await h.fireEvent(triggers[0]!, "click");
        for (let i = 0; i < 4; i++) await h.settle();

        const reasonField = findIn(body as never, (n) => n.tagName === "TEXTAREA");
        await h.act(() => { setFieldValue(reasonField as never, "trying to dismiss"); });
        const confirmButton = findIn(body as never, (n) => n.tagName === "BUTTON" && textOf(n as never).match(/^Dismiss task$/) !== null);
        await h.act(() => { clickButton(confirmButton as never); });
        for (let i = 0; i < 6; i++) await h.settle();

        assert.match(h.text(), /dismissal reason is required/, "the refusal must surface");
        assert.doesNotMatch(h.text(), /No open coding tasks for this client/, "BOTH tasks are still present — never a fabricated empty claim");
        // The row-vanish (section-level) banner condition never fires here —
        // the acted-on task is still in the reloaded list.
        assert.match(h.text(), /This was refused/, "the per-row banner must render with the domain-neutral title");
      } finally {
        await h.unmount();
        if (body.childNodes?.includes(h.container)) body.removeChild(h.container);
      }
    },
  );
});

// M8 (round 3 pin), team-lead-requested: the SAME per-row-stays-present shape
// as the coding-tasks-section test above, pinned for UncodedFilingsList
// specifically — TWO filings in the SAME lane, the refusal is on ONE of them
// via open_coding_task, and BOTH filings stay present after the reload (a
// validation-style refusal). The instrument hazard team-lead flagged: with
// two rows, `openTaskTrigger` and `openTaskConfirm` are the IDENTICAL string
// ("Open coding task"), so once the dialog is open there are THREE nodes
// matching that label (both triggers + the confirm button) — a probe that
// excludes only the clicked trigger can land on the SIBLING row's trigger and
// report a false absence (the wave-B lesson this pin exists to close). Both
// triggers are captured BEFORE the click and excluded together.
test("uncoded-filings list: a refusal whose row STAYS present attaches to that row alone, never the other row or a section banner", async () => {
  const FILING_A = { ...UNCODED_FILING, filing_id: "fa3", document_id: "da3", original_filename: "invoice-a.pdf" };
  const LANE_A = { filing_id: "fa3", lane: "needs_you", reasons: [] };
  const FILING_B = { ...UNCODED_FILING, filing_id: "fb3", document_id: "db3", original_filename: "invoice-b.pdf" };
  const LANE_B = { filing_id: "fb3", lane: "needs_you", reasons: [] };
  await withMockedEnv(
    async (u) => {
      const url = String(u);
      if (url.includes("/rpc/open_coding_task")) {
        return jsonResponse({ code: "CLR24", message: "vendor could not be verified" }, 400);
      }
      if (url.includes("/rpc/list_uncoded_filings")) return jsonResponse([FILING_A, FILING_B]);
      if (url.includes("/rpc/list_coding_lanes")) return jsonResponse([LANE_A, LANE_B]);
      if (url.includes("/rest/v1/coding_tasks_visible") || url.includes("/rest/v1/lint_findings")) return jsonResponse([]);
      throw new Error(`unexpected fetch: ${url}`);
    },
    async () => {
      const h = await renderComponent(
        createElement(NextIntlClientProvider, {
          locale: "en",
          messages,
          children: createElement("div", null, createElement("h1", null, "Documents"), createElement(CodingLanePanel, { clientId: "c1" })),
        }),
      );
      const body = realBody();
      body.appendChild(h.container);
      try {
        for (let i = 0; i < 6; i++) await h.settle();
        // Both filings must each render their own "Open coding task"
        // trigger — captured up front, BOTH excluded when locating Confirm.
        const triggers: Node[] = [];
        (function walk(n: Node) {
          if (n.tagName === "BUTTON" && textOf(n as never).match(/^Open coding task$/) !== null) triggers.push(n);
          for (const c of n.childNodes ?? []) walk(c);
        })(body as never);
        assert.equal(triggers.length, 2, "both filings must each render their own Open-coding-task trigger");
        await h.fireEvent(triggers[0]!, "click");
        for (let i = 0; i < 4; i++) await h.settle();

        const reasonField = findIn(body as never, (n) => n.tagName === "TEXTAREA");
        await h.act(() => { setFieldValue(reasonField as never, "vendor could not be matched"); });
        const confirmButton = findIn(
          body as never,
          (n) => n.tagName === "BUTTON" && textOf(n as never).match(/^Open coding task$/) !== null && n !== triggers[0] && n !== triggers[1],
        );
        assert.ok(confirmButton, "the dialog's own confirm control must be locatable once BOTH triggers are excluded");
        await h.act(() => { clickButton(confirmButton as never); });
        for (let i = 0; i < 6; i++) await h.settle();

        assert.match(h.text(), /vendor could not be verified/, "the refusal must surface");
        assert.match(h.text(), /CLR24/, "the CLR code must survive");
        assert.doesNotMatch(h.text(), /Nothing in this lane right now/, "BOTH filings are still present — never a fabricated empty claim");
        assert.match(h.text(), /invoice-a\.pdf/, "the acted-on filing's own row must still be present");
        assert.match(h.text(), /invoice-b\.pdf/, "the OTHER filing's row must still be present, untouched");
        const refusalMatches = h.text().match(/This was refused/g) ?? [];
        assert.equal(
          refusalMatches.length, 1,
          "exactly ONE banner may render (the per-row banner on the acted-on filing) — never a second copy on the other row, never a section-level banner on top of it (the row never vanished)",
        );
      } finally {
        await h.unmount();
        if (body.childNodes?.includes(h.container)) body.removeChild(h.container);
      }
    },
  );
});
