// #659 — the portfolio table itself. Every cell here asserts RENDERED TEXT or a rendered href,
// because the defects this section can carry are all invisible to a type: a count taken from
// `rows.length`, a `?? 0` where the door said "unknown", a drilldown that opens a different
// population from the number that was clicked, and — the one the whole ticket turns on — a money
// figure at firm altitude.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { PathnameContext, SearchParamsContext } from "next/dist/shared/lib/hooks-client-context.shared-runtime";
import { NextIntlClientProvider } from "next-intl";

import { renderComponent } from "../../../test/hookHarness";
import { enableDomInspection } from "../../../test/domInspect";
import { checkAccessibility } from "../../../test/a11yRules";
import messages from "../../../messages/en.json";
import { EMPTY_PORTFOLIO_PACK, type PortfolioPack, type PortfolioRow } from "../../../lib/firm/portfolio-pack";
import type { FirmPortfolioState } from "../../../lib/firm/use-firm-portfolio";
import { FirmPortfolioSection, visiblePortfolioRows } from "./firm-portfolio-section";

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
    active: 40, attentionFailed: 2, failed: 1, refused: 1, recentSuccess: 7,
    uncountedCompletions: 0, coverage: "ok", coverageReason: null,
    preview: [
      { work_id: "w1", purpose: "journal_entry", status: "running", memo: "rent", attempts: 2, current_run_status: "running", retrying: true, created_at: "2026-09-18T01:00:00Z" },
      { work_id: "w2", purpose: "journal_entry", status: "queued", memo: null, attempts: 1, current_run_status: null, retrying: false, created_at: "2026-09-18T02:00:00Z" },
    ],
    ...over,
  };
}

function pack(rows: PortfolioRow[], over: Partial<PortfolioPack> = {}): PortfolioPack {
  return {
    ...EMPTY_PORTFOLIO_PACK,
    computedAt: "2026-09-19T02:00:00.000Z",
    previewLimit: 3,
    pageLimit: 50,
    rows,
    window: {
      from: "2026-09-12T16:00:00Z", to: "2026-09-19T16:00:00Z",
      fromDate: "2026-09-13", toDate: "2026-09-19", timezone: "Asia/Kuala_Lumpur", days: 7,
    },
    sources: {
      reviewQueueSignal: "watermark",
      reviewQueueExcludes: ["onboarding", "archived"],
      complianceSignal: "stale_evaluator", complianceWindowHours: 48,
      lintSignal: "stale_evaluator", sweepSignal: "last_finalized_at",
    },
    needsYouRef: { source: "list_review_queue.counts", floor: "viewer", excludes: ["onboarding", "archived"] },
    ...over,
  };
}

function state(over: Partial<FirmPortfolioState> = {}): FirmPortfolioState {
  return {
    pack: pack([row()]),
    loading: false, refreshing: false, staleError: null, denied: null,
    failedFirstRead: false, readAt: Date.parse("2026-09-19T02:00:00.000Z"), delayed: false,
    reload: () => {},
    ...over,
  };
}

const mount = (s: FirmPortfolioState, search = "", needsYou: string[] = []) =>
  renderComponent(App(
    createElement(FirmPortfolioSection, {
      portfolio: s,
      needsYouClients: new Set(needsYou),
      registerEmpty: s.pack.rows.length === 0,
    }),
    search,
  ));

type Stubbish = {
  tagName?: string;
  getAttribute?: (k: string) => string | null;
  childNodes?: Stubbish[];
};

/** Every anchor's href, document order. Read through `getAttribute` — the harness stores
 *  attributes in its own map, not as DOM properties (test/domInspect.ts). */
const hrefs = (h: Awaited<ReturnType<typeof renderComponent>>): string[] => {
  const out: string[] = [];
  const walk = (n: Stubbish) => {
    if (n.tagName === "A") {
      const href = n.getAttribute?.("href");
      if (typeof href === "string") out.push(href);
    }
    for (const c of (n.childNodes ?? [])) walk(c);
  };
  walk(h.container as never);
  return out;
};

// ===========================================================================================

test("ticket 659: the counts are the DOOR's own fields and NEVER rows.length", async () => {
  const h = await mount(state());
  try {
    // The row's preview carries TWO Works; its active count is FORTY. A count taken from the
    // preview would read 2 here and look entirely plausible.
    assert.match(h.text(), /40/, "the active count is the door's own integer");
    assert.doesNotMatch(h.text(), /\b2 Work running\b/);
  } finally { await h.unmount(); }
});

test("ticket 659: an unreadable count prints 'could not be read', NEVER 0", async () => {
  const h = await mount(state({ pack: pack([row({ active: null, attentionFailed: null, recentSuccess: null })]) }));
  try {
    assert.match(h.text(), /could not be read/);
    // The discriminator: a `?? 0` regression would put a zero on screen and pass every other cell.
    const zeros = (h.text().match(/\b0\b/g) ?? []).length;
    assert.equal(zeros, 0, "'nothing is running' and 'I could not find out' are different next actions");
  } finally { await h.unmount(); }
});

test("ticket 659: each count link carries client= and status=, narrowed to exactly the population it counted", async () => {
  const h = await mount(state());
  try {
    const links = hrefs(h).filter((x) => x.startsWith("/work?"));
    assert.equal(links.length, 3, "three counts, three drilldowns");
    const active = links.find((x) => x.includes("queued"));
    const attention = links.find((x) => x.includes("failed"));
    const recent = links.find((x) => x.includes("completed"));
    assert.ok(active && attention && recent);
    for (const link of links) assert.match(link, /client=c1/, "every drilldown names the client");
    assert.match(active!, /status=queued%2Crunning/);
    assert.match(attention!, /status=failed%2Crefused/,
      "the column counts BOTH tokens, so the link carries both — the click and the count are one population");
    // FIX ROUND 1, FINDING A2 — THE RECENT LINK CARRIES NO WEEK, AND THAT IS THE HONEST SHAPE.
    // The count is dated by the COMMITTED RECEIPT; `clara.list_accounting_work`'s since/until
    // filter `w.created_at`, when the Work STARTED. Passing the pack's window through that axis
    // produced a list that can be DISJOINT from the number clicked — a Work started 30 days ago
    // and posted 2 days ago is counted and is not in the list — so "1" could open an empty page.
    // Dropping the dates makes the link a SUPERSET of the count instead: every Work the number
    // counted is in it, and the surface says the list is not narrowed to the week.
    assert.doesNotMatch(recent!, /since=/,
      "the list door cannot narrow by receipt date, so it is not asked to narrow at all");
    assert.doesNotMatch(recent!, /until=/);
    assert.match(recent!, /^\/work\?client=c1&status=completed$/,
      "client and status only — the population the count is drawn from, never a different week");
  } finally { await h.unmount(); }
});

test("ticket 659: an unreadable window says the column is undated — and the link is the same either way", async () => {
  const h = await mount(state({ pack: pack([row()], { window: null }) }));
  try {
    const recent = hrefs(h).find((x) => x.includes("completed"));
    assert.ok(recent);
    assert.doesNotMatch(recent!, /since=/, "a guessed week is worse than no week");
    assert.match(h.text(), /could not be dated for this read/);
    // Since fix round 1 the dated and undated arms build the SAME href — which is the point: the
    // window's readability changes what the surface can SAY, never which population a click opens.
    assert.match(recent!, /^\/work\?client=c1&status=completed$/);
  } finally { await h.unmount(); }
});

test("ticket 659 (A2): the surface says what the RECENT LINK opens, not only what the count is dated by", async () => {
  // The disclosure named the COUNT's basis and stopped there, so a professional could not know
  // that the list behind the number is not the same seven days. Both halves are now before the
  // click, which is D18.e's own "disclosed before the click" applied to the link as well.
  const h = await mount(state());
  try {
    assert.match(h.text(), /dated by when each Work posted/, "the count's basis");
    assert.match(h.text(), /not narrowed to (that|those) (week|seven days)|opens every completed Work/i,
      "and what the link actually opens");
  } finally { await h.unmount(); }
});

test("ticket 659: a PARTIAL row prints its reason, in words, beside the client it is about", async () => {
  const h = await mount(state({
    pack: pack([
      row({ client_id: "c1", name: "Onboarding Co", status: "onboarding", coverage: "partial", coverageReason: "onboarding_client_excluded_from_queue" }),
      row({ client_id: "c2", name: "Undated Co", coverage: "partial", coverageReason: "completions_without_receipt", uncountedCompletions: 3 }),
      row({ client_id: "c3", name: "Preview Co", coverage: "partial", coverageReason: "retry_label_preview_only" }),
    ]),
  }));
  try {
    assert.match(h.text(), /exclude this client/);
    assert.match(h.text(), /3 finished Work carry no dated receipt/);
    assert.match(h.text(), /Retry labels cover only part of this page/);
  } finally { await h.unmount(); }
});

test("ticket 659: a coverage token this build has not enumerated is SHOWN, not swallowed", async () => {
  const h = await mount(state({
    pack: pack([row({ coverage: "partial", coverageReason: "a_reason_nobody_has_written_yet" })]),
  }));
  try {
    assert.match(h.text(), /Part of this row could not be made \(a_reason_nobody_has_written_yet\)/);
  } finally { await h.unmount(); }
});

test("ticket 659: THE BOARD RENDERS NO AMOUNT ANYWHERE — the decisive negative for AC1's second half", async () => {
  const h = await mount(state({
    pack: pack([row({ name: "Rome Properties" }), row({ client_id: "c2", name: "Bee Creative" })]),
  }));
  try {
    const text = h.text();
    assert.doesNotMatch(text, /RM|MYR|\$/, "Firm Home consolidates no client sums (Wayfinder: 不汇总客户金额)");
    assert.doesNotMatch(text, /\d+\.\d{2}/, "and no figure on it is a decimal amount");
    for (const href of hrefs(h)) {
      assert.doesNotMatch(href, /amount|cents/, "no drilldown carries a money axis either");
    }
  } finally { await h.unmount(); }
});

test("ticket 659: the onboarding disclosure and the recent-success dating are on screen BEFORE any click", async () => {
  const h = await mount(state());
  try {
    assert.match(h.text(), /cover active clients only/, "the two-populations disclosure is not behind a click");
    assert.match(h.text(), /dated by when each Work posted/,
      "and ticket 650's own honest sentence about the recent column is restated at this altitude");
    assert.match(h.text(), /not by when it started/);
  } finally { await h.unmount(); }
});

test("ticket 659: every count link carries an EXPLICIT accessible name — axe cannot make this assertion", async () => {
  const h = await mount(state());
  try {
    const labelled: string[] = [];
    const walk = (n: Stubbish) => {
      if (n.tagName === "A" && (n.getAttribute?.("href") ?? "").startsWith("/work?")) {
        labelled.push(n.getAttribute?.("aria-label") ?? "");
      }
      for (const c of (n.childNodes ?? [])) walk(c);
    };
    walk(h.container as never);
    assert.equal(labelled.length, 3);
    for (const label of labelled) {
      assert.ok(label.length > 0, "five links reading '7' in a row pass every axe rule and say nothing");
      assert.match(label, /Rome Properties/, "and the name says WHOSE number it is");
    }
  } finally { await h.unmount(); }
});

test("ticket 659: the populated table is axe-clean and announced by name", async () => {
  // The section starts at h2 because it lives under the board's own h1 (the firm's name). Mounted
  // ALONE it would red `heading-order` for a page structure this component does not own, so the
  // cell supplies the h1 the real page always has — and asserts everything else for real.
  const h = await renderComponent(App(
    createElement("div", null, [
      createElement("h1", { key: "h1" }, "BELCORT SDN BHD"),
      createElement(FirmPortfolioSection, {
        key: "section",
        portfolio: state(),
        needsYouClients: new Set<string>(),
        registerEmpty: false,
      }),
    ]),
  ));
  try {
    assert.deepEqual(checkAccessibility(h.container as never), []);
    const table = h.find((n) => String((n as { getAttribute?: (k: string) => unknown }).getAttribute?.("aria-label") ?? "")
      .includes("Clients, with the Work"));
    assert.ok(table, "the table carries a label rather than being an anonymous table two landmarks under the h1");
  } finally { await h.unmount(); }
});

test("ticket 659: a truncated page says so, and offers Next", async () => {
  const h = await mount(state({
    pack: pack([row()], { truncated: true, nextCursor: "Y3Vyc29y", coverage: "partial", coverageReason: "register_page_truncated" }),
  }));
  try {
    assert.match(h.text(), /This is the first 1 clients by name/);
    assert.ok(hrefs(h).some((x) => x.includes("cursor=Y3Vyc29y")), "the pager is a real link");
  } finally { await h.unmount(); }
});

// --- the browser-side narrowings, over the page the door returned ------------------------------

test("ticket 659: visiblePortfolioRows narrows by status, name and attention — and `caught_up` is the DESIGNED zero", () => {
  const rows = [
    row({ client_id: "a", name: "Alpha", status: "active", active: 3, attentionFailed: 0 }),
    row({ client_id: "b", name: "Bravo", status: "archived", active: 0, attentionFailed: 2 }),
    row({ client_id: "c", name: "Clear Co", status: "active", active: 0, attentionFailed: 0 }),
  ];
  const s = (over: Record<string, unknown>) => ({
    status: [], attention: null, q: null, cursor: null, ...over,
  }) as never;
  const ids = (out: PortfolioRow[]) => out.map((r) => r.client_id);

  assert.deepEqual(ids(visiblePortfolioRows(rows, s({ status: ["archived"] }), new Set())), ["b"]);
  assert.deepEqual(ids(visiblePortfolioRows(rows, s({ q: "clear" }), new Set())), ["c"], "the name match is case-folded");
  assert.deepEqual(ids(visiblePortfolioRows(rows, s({ attention: "active" }), new Set())), ["a"]);
  assert.deepEqual(ids(visiblePortfolioRows(rows, s({ attention: "failed" }), new Set())), ["b"]);
  assert.deepEqual(ids(visiblePortfolioRows(rows, s({ attention: "needs_you" }), new Set(["a"]))), ["a"],
    "needs_you rides the review queue's OWN rows — no second read, and no door owns both populations");
  assert.deepEqual(ids(visiblePortfolioRows(rows, s({ attention: "caught_up" }), new Set(["a"]))), ["c"],
    "caught up means no Work running, none needing attention, and nothing waiting on a person");
});

// --- fix round 1: the three findings the adversarial lens measured on this section --------------

test("ticket 659 (A5): an UNKNOWN count withholds the reassurance — 'every client is clear' is a KNOWN zero", async () => {
  // The bug this cell exists for: `(r.active ?? 0) === 0` reads "I could not find out what is
  // running" as "nothing is running" and prints the one sentence that tells a principal to stop
  // looking. The count cell already prints "could not be read" — so before this cell, ONE screen
  // could carry both sentences at once.
  const h = await mount(state({ pack: pack([row({ active: null, attentionFailed: null, recentSuccess: null })]) }));
  try {
    assert.match(h.text(), /could not be read/, "the cell is honest about the null");
    assert.doesNotMatch(
      h.text(),
      /Every client is clear/,
      "a count this build could not read cannot be evidence that there is nothing to do",
    );
  } finally { await h.unmount(); }
});

test("ticket 659 (A5): `caught_up` drops a row whose counts are unknown, and so do `active` and `failed`", () => {
  const unknown = row({ client_id: "u", name: "Unknown Co", active: null, attentionFailed: null });
  const s = (over: Record<string, unknown>) => ({
    status: [], attention: null, q: null, cursor: null, ...over,
  }) as never;
  // All three narrowings ask a question about a NUMBER. A row with no number is not an answer to
  // any of them — it is the row a professional must go and look at, and `caught_up` claiming it is
  // the exact inverse of the truth.
  assert.deepEqual(visiblePortfolioRows([unknown], s({ attention: "caught_up" }), new Set()), []);
  assert.deepEqual(visiblePortfolioRows([unknown], s({ attention: "active" }), new Set()), []);
  assert.deepEqual(visiblePortfolioRows([unknown], s({ attention: "failed" }), new Set()), []);
});

test("ticket 659 (A4): the filtered-Empty makes a PAGE-local claim, never a firm-wide one", async () => {
  // `visiblePortfolioRows` narrows the CURRENT KEYSET PAGE — the door takes no filter argument at
  // all. On a firm with more than one page, a matching client can simply be on a later page, so
  // "the firm has clients — none of them matches" is a sentence the build cannot support.
  const h = await mount(
    state({ pack: pack([row({ name: "Rome Properties" })], { truncated: true, nextCursor: "Y3Vyc29y" }) }),
    "q=zeta",
  );
  try {
    assert.doesNotMatch(h.text(), /The firm has clients/, "the page cannot speak for the firm");
    assert.match(h.text(), /on this page/i, "it says which population it actually searched");
    assert.match(h.text(), /later page|Next/i, "and where the rest of the register is");
  } finally { await h.unmount(); }
});

test("ticket 659 (A6): an undated completion is disclosed even when another coverage reason wins the row", async () => {
  // `coverage_reason` is a strict precedence in the door, so an archived client that ALSO carries
  // a finished Work with no receipt publishes only the status token — and the `recent_success = 0`
  // beside it was shown with no explanation at all.
  const h = await mount(state({
    pack: pack([row({
      status: "archived", recentSuccess: 0, uncountedCompletions: 1,
      coverage: "partial", coverageReason: "onboarding_client_excluded_from_queue",
    })]),
  }));
  try {
    assert.match(h.text(), /review queue counts active clients only/, "the precedence winner still shows");
    assert.match(
      h.text(),
      /carries no dated receipt/,
      "and the undated completion, which is why Recent success reads 0, shows beside it",
    );
  } finally { await h.unmount(); }
});
