// #659 — THE SEVEN STATES, and the property that makes them worth testing at all: they are SEVEN
// DIFFERENT STRINGS. A surface with seven arms that all read "No data" has seven arms and one
// answer; the whole point of the ladder is that a professional can tell "nothing is running" from
// "I could not find out" from "you may not look" from "this is taking a while", and act
// differently on each.
//
// `client-work-attention.tsx:23-29` named five (loading / empty / partial / unknown / denied). A
// PAGED REGISTER needs two more: the first-use empty (a firm with no clients, which is the state
// this page ships in on day one) and the stale/delayed face.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { PathnameContext, SearchParamsContext } from "next/dist/shared/lib/hooks-client-context.shared-runtime";
import { NextIntlClientProvider } from "next-intl";

import { renderComponent } from "../../../test/hookHarness";
import { enableDomInspection } from "../../../test/domInspect";
import messages from "../../../messages/en.json";
import { DoorRefusal } from "../../../lib/doors";
import { EMPTY_PORTFOLIO_PACK, type PortfolioPack, type PortfolioRow } from "../../../lib/firm/portfolio-pack";
import type { FirmPortfolioState } from "../../../lib/firm/use-firm-portfolio";
import { FirmPortfolioSection } from "./firm-portfolio-section";

enableDomInspection();

const router = { replace: () => {}, refresh: () => {}, push: () => {}, back: () => {}, forward: () => {}, prefetch: () => {} };

function App(children: unknown, search = "") {
  return createElement(NextIntlClientProvider, {
    locale: "en", messages, timeZone: "Asia/Kuala_Lumpur",
    children: createElement(
      SearchParamsContext.Provider as never,
      { value: new URLSearchParams(search) as never },
      createElement(
        AppRouterContext.Provider as never,
        { value: router as never },
        createElement(PathnameContext.Provider as never, { value: "/" as never }, children as never),
      ),
    ),
  });
}

function row(over: Partial<PortfolioRow> = {}): PortfolioRow {
  return {
    client_id: "c1", name: "Rome Properties", status: "active",
    active: 2, attentionFailed: 0, failed: 0, refused: 0, recentSuccess: 1,
    uncountedCompletions: 0, coverage: "ok", coverageReason: null, preview: [],
    ...over,
  };
}

function pack(rows: PortfolioRow[], over: Partial<PortfolioPack> = {}): PortfolioPack {
  return {
    ...EMPTY_PORTFOLIO_PACK,
    computedAt: "2026-09-19T02:00:00.000Z", previewLimit: 3, pageLimit: 50, rows,
    window: {
      from: null, to: null, fromDate: "2026-09-13", toDate: "2026-09-19",
      timezone: "Asia/Kuala_Lumpur", days: 7,
    },
    sources: {
      reviewQueueSignal: "watermark", reviewQueueExcludes: ["onboarding", "archived"],
      complianceSignal: "stale_evaluator", complianceWindowHours: 48,
      lintSignal: "stale_evaluator", sweepSignal: "last_finalized_at",
    },
    needsYouRef: { source: "list_review_queue.counts", floor: "viewer", excludes: ["onboarding", "archived"] },
    ...over,
  };
}

function state(over: Partial<FirmPortfolioState> = {}): FirmPortfolioState {
  return {
    pack: pack([row()]), loading: false, refreshing: false, staleError: null, denied: null,
    failedFirstRead: false, readAt: Date.parse("2026-09-19T02:00:00.000Z"), delayed: false,
    reload: () => {}, ...over,
  };
}

const CONTROL = createElement("button", { type: "button" }, "Add client");

async function mount(s: FirmPortfolioState, opts: { control?: boolean; registerEmpty?: boolean; search?: string } = {}) {
  return renderComponent(App(
    createElement(FirmPortfolioSection, {
      portfolio: s,
      needsYouClients: new Set<string>(),
      registerEmpty: opts.registerEmpty ?? false,
      creationControl: opts.control === false ? undefined : CONTROL,
    }),
    opts.search ?? "",
  ));
}

const refusal = () => new DoorRefusal("CLR04", "insufficient role",
  { reason: null, status: 403, pgCode: "CLR04", codeSource: "sqlstate" });

/** Collect one state's rendered text so the last cell can prove the seven are seven. */
async function textFor(s: FirmPortfolioState, opts?: Parameters<typeof mount>[1]): Promise<string> {
  const h = await mount(s, opts);
  try { return h.text(); } finally { await h.unmount(); }
}

// ===========================================================================================

test("1 — LOADING is a skeleton, never a zero", async () => {
  const h = await mount(state({ loading: true, pack: pack([]), readAt: null }));
  try {
    const text = h.text();
    assert.doesNotMatch(text, /\b0\b/, "a zero during the first read is a number this build has not got");
    assert.doesNotMatch(text, /No clients yet/, "and an empty state during a read is a claim it cannot make");
    const skeleton = h.find((n) => String((n as { getAttribute?: (k: string) => string | null })
      .getAttribute?.("aria-hidden") ?? "") === "true");
    assert.ok(skeleton, "a table-shaped stand-in for a KNOWN layout");
  } finally { await h.unmount(); }
});

test("2 — ZERO CLIENTS is the first-use Empty, and the creation affordance is BESIDE it", async () => {
  const h = await mount(state({ pack: pack([]) }), { registerEmpty: true });
  try {
    assert.match(h.text(), /No clients yet/);
    assert.match(h.text(), /Add the first client and this table fills in/);
    assert.match(h.text(), /This firm has no clients yet\. Start with the first one\./,
      "the affordance's COPY changes with the empty state");
    assert.match(h.text(), /Add client/, "and the control itself is on screen");
  } finally { await h.unmount(); }
});

test("2b — the creation control is mounted OUTSIDE the state machine, so a re-read that returns a row cannot remount it", async () => {
  // THE MOUNT RULE, asserted structurally rather than by prose. A control hung off the zero-client
  // branch would disappear from the DOM the moment the register came back non-empty — and with it
  // a typed name and an arity-1 acknowledgement, mid-edit.
  const empty = await mount(state({ pack: pack([]) }), { registerEmpty: true });
  try {
    assert.match(empty.text(), /Add client/);
    await empty.rerender(App(createElement(FirmPortfolioSection, {
      portfolio: state({ pack: pack([row()]) }),
      needsYouClients: new Set<string>(),
      registerEmpty: false,
      creationControl: CONTROL,
    })));
    assert.match(empty.text(), /Add client/, "the control survives the register filling in");
    assert.doesNotMatch(empty.text(), /This firm has no clients yet/, "only the sentence above it changes");
  } finally { await empty.unmount(); }
});

test("3 — ZERO WORKLOAD is a designed caught-up sentence, and it is NOT the queue's 'nothing is waiting'", async () => {
  const h = await mount(state({
    pack: pack([row({ active: 0, attentionFailed: 0, recentSuccess: 0 })]),
  }));
  try {
    assert.match(h.text(), /Every client is clear/);
    assert.match(h.text(), /different answer from the review queue above/,
      "the two can legitimately disagree, and the page says which question this one answers");
    assert.doesNotMatch(h.text(), /No clients yet/, "a firm WITH clients and no Work is not an empty register");
  } finally { await h.unmount(); }
});

test("4 — PARTIAL names what part of the answer the door is not making, at the row AND at the page", async () => {
  const h = await mount(state({
    pack: pack(
      [row({ coverage: "partial", coverageReason: "completions_without_receipt", uncountedCompletions: 2 })],
      { truncated: true, nextCursor: "YWJj", coverage: "partial", coverageReason: "register_page_truncated" },
    ),
  }));
  try {
    assert.match(h.text(), /2 finished Work carry no dated receipt/, "the ROW says which part is short");
    assert.match(h.text(), /This is the first 1 clients by name/, "and the PAGE says it is a page");
  } finally { await h.unmount(); }
});

test("5 — STALE is the read's own date plus a delayed face, with the numbers STILL on screen", async () => {
  const h = await mount(state({ delayed: true, staleError: new Error("network") }));
  try {
    assert.match(h.text(), /Read at /, "the board dates its own read");
    assert.match(h.text(), /taking longer than usual/);
    assert.match(h.text(), /Rome Properties/, "and a transport failure never blanks the board");
  } finally { await h.unmount(); }
});

test("6 — DENIED is a permission, not a failure — and it says the needs-you numbers above are still theirs", async () => {
  const h = await mount(state({ denied: refusal(), pack: pack([]) }));
  try {
    assert.match(h.text(), /Work records need a bookkeeper role/);
    assert.match(h.text(), /read at a lower floor and are still yours/,
      "ticket 650's own honest two-floor face, restated at firm altitude");
    assert.doesNotMatch(h.text(), /could not be read/, "a permission is not a failure");
    assert.doesNotMatch(h.text(), /No clients yet/, "and it is certainly not an empty register");
  } finally { await h.unmount(); }
});

test("7 — INITIAL ERROR is typed and retryable, and is NOT the stale face", async () => {
  const h = await mount(state({
    failedFirstRead: true, staleError: new Error("boom"), pack: pack([]), readAt: null,
  }));
  try {
    assert.match(h.text(), /The portfolio could not be read/);
    assert.match(h.text(), /Try again/, "retryable");
    assert.match(h.text(), /has not been read yet/, "and there is no date to show, because nothing was read");
    assert.doesNotMatch(h.text(), /taking longer than usual/);
  } finally { await h.unmount(); }
});

test("the SEVEN states are SEVEN DIFFERENT STRINGS", async () => {
  const seen = new Map<string, string>();
  const cases: [string, FirmPortfolioState, Parameters<typeof mount>[1]?][] = [
    ["loading", state({ loading: true, pack: pack([]), readAt: null }), { control: false }],
    ["zeroClients", state({ pack: pack([]) }), { registerEmpty: true, control: false }],
    ["zeroWorkload", state({ pack: pack([row({ active: 0, attentionFailed: 0, recentSuccess: 0 })]) }), { control: false }],
    ["partial", state({ pack: pack([row({ coverage: "partial", coverageReason: "retry_label_preview_only" })]) }), { control: false }],
    ["stale", state({ delayed: true, staleError: new Error("x") }), { control: false }],
    ["denied", state({ denied: refusal(), pack: pack([]) }), { control: false }],
    ["error", state({ failedFirstRead: true, staleError: new Error("x"), pack: pack([]), readAt: null }), { control: false }],
  ];
  for (const [name, s, opts] of cases) seen.set(name, await textFor(s, opts));
  assert.equal(seen.size, 7);
  const texts = [...seen.values()];
  for (let i = 0; i < texts.length; i += 1) {
    for (let j = i + 1; j < texts.length; j += 1) {
      assert.notEqual(texts[i], texts[j],
        `${[...seen.keys()][i]} and ${[...seen.keys()][j]} render the same thing — a ladder with two identical rungs has one`);
    }
  }
});

test("a narrowed board with no matching client is a DIFFERENT empty from a firm with no clients", async () => {
  const h = await mount(state({ pack: pack([row({ status: "active" })]) }), { search: "status=archived" });
  try {
    assert.match(h.text(), /No client matches this view/);
    assert.match(h.text(), /Clear the filters/, "and there is a way out of it");
    assert.doesNotMatch(h.text(), /No clients yet/);
  } finally { await h.unmount(); }
});
