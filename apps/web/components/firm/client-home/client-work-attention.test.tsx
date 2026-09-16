// #650 — the Work attention band: three tiles, and the five ways a tile can have no number.
//
// THE CELL THAT MATTERS MOST is the one that tells EMPTY from UNKNOWN from DENIED. All three
// render "no number", and a build that collapsed them would tell a bookkeeper "nothing is running
// for this client" when the truth was "this read failed" or "you may not see this". Those are
// three different next actions, so they are three different renderings and each is asserted by
// its own words.
//
// AND THE BADGE CARRIES THE WORD (C08.6). A tone is not a state: every state a tile can be in is
// readable as text, so the band survives a greyscale screenshot and a screen reader alike.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { NextIntlClientProvider } from "next-intl";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { PathnameContext } from "next/dist/shared/lib/hooks-client-context.shared-runtime";

import { renderComponent } from "../../../test/hookHarness";
import { enableDomInspection } from "../../../test/domInspect";
import { checkAccessibility } from "../../../test/a11yRules";
import messages from "../../../messages/en.json";
import { ClientWorkAttention } from "./client-work-attention";
import { UNKNOWN_FACET, type ClientWorkPack } from "@/lib/work/client-work-pack";
import type { ReviewQueueState } from "@/lib/firm/use-review-queue";
import { DoorRefusal } from "@/lib/doors";

enableDomInspection();

const CLIENT = "c1c1c1c1-0000-4000-8000-000000000001";
const WORK_A = "11111111-1111-4111-8111-111111111111";
const WORK_B = "22222222-2222-4222-8222-222222222222";

function pack(overrides: Partial<ClientWorkPack> = {}): ClientWorkPack {
  return {
    computedAt: "2026-09-16T02:00:00.000Z",
    previewLimit: 5,
    window: {
      from: "2026-09-09T16:00:00.000Z", to: "2026-09-16T16:00:00.000Z",
      fromDate: "2026-09-10", toDate: "2026-09-16", timezone: "Asia/Kuala_Lumpur", days: 7,
    },
    active: {
      status: "ok", count: 3, coverage: "ok", coverageReason: null, uncountedCompletions: null,
      rows: [
        {
          work_id: WORK_A, purpose: "journal_entry", status: "running", memo: "Office rent",
          attempts: 2, current_run_status: "running", retrying: true,
          created_at: "2026-09-16T01:00:00.000Z", committed_at: null, receipt_id: null, entry_id: null,
        },
        {
          work_id: WORK_B, purpose: "payroll_obligation", status: "queued", memo: null,
          attempts: 1, current_run_status: null, retrying: false,
          created_at: "2026-09-16T00:00:00.000Z", committed_at: null, receipt_id: null, entry_id: null,
        },
      ],
    },
    recentSuccess: {
      status: "ok", count: 2, coverage: "ok", coverageReason: null, uncountedCompletions: 0,
      rows: [{
        work_id: WORK_B, purpose: "journal_entry", status: "completed", memo: "Bank fee",
        attempts: null, current_run_status: null, retrying: false,
        created_at: null, committed_at: "2026-09-15T02:00:00.000Z", receipt_id: "r1", entry_id: "e1",
      }],
    },
    needsYouSource: "list_review_queue.counts.work_questions",
    ...overrides,
  };
}

function queueState(overrides: Partial<ReviewQueueState> = {}): ReviewQueueState {
  return {
    rows: [], counts: {
      needs_you: 2, needs_review: 4, ready: 1, open_drafts: 1, open_questions: 1, open_tasks: 0,
      compliance_watches: 0, lint_findings: 2, work_questions: 4,
    },
    sweep: null, loading: false, loadingMore: false, busy: false, error: null, hasMore: false,
    reload: () => {}, loadMore: async () => {}, act: async () => true,
    ...overrides,
  } as ReviewQueueState;
}

async function mount(opts: {
  load?: () => Promise<ClientWorkPack>;
  queue?: ReviewQueueState;
  pathname?: string;
} = {}) {
  const h = await renderComponent(
    createElement(NextIntlClientProvider, {
      locale: "en", messages,
      children: createElement(
        AppRouterContext.Provider as never,
        { value: { replace: () => {}, refresh: () => {}, push: () => {}, back: () => {}, forward: () => {}, prefetch: () => {} } as never },
        createElement(
          PathnameContext.Provider as never,
          { value: (opts.pathname ?? `/clients/${CLIENT}`) as never },
          // The band is an `<h2>` SECTION of a page whose `<h1>` is the client's own name
          // (the identity band). Mounted alone it would open the document on an h2, which is a
          // heading-order violation of the HARNESS rather than of this component — so the
          // fixture supplies the page's own top-level heading. The real ordering is proven
          // where both are mounted: `client-workspace-overview.test.tsx`.
          createElement("div", null,
            createElement("h1", null, "Rome Properties Sdn Bhd"),
          createElement(ClientWorkAttention, {
            clientId: CLIENT,
            queue: opts.queue ?? queueState(),
            load: opts.load ?? (async () => pack()),
            now: () => Date.parse("2026-09-16T02:00:10.000Z"),
          })),
        ),
      ),
    }),
  );
  for (let i = 0; i < 8; i += 1) await h.settle();
  return h;
}

/** Every `href` on screen. */
function hrefs(h: { container: unknown }): string[] {
  const out: string[] = [];
  const walk = (n: unknown): void => {
    const node = n as { getAttribute?: (k: string) => string | null; childNodes?: unknown[] };
    const href = node.getAttribute?.("href");
    if (typeof href === "string") out.push(href);
    for (const c of node.childNodes ?? []) walk(c);
  };
  walk(h.container);
  return out;
}

// ===========================================================================================

test("the three tiles carry the three numbers, each a link into its OWN scoped list", async () => {
  const h = await mount();
  try {
    const text = h.text();
    assert.match(text, /Waiting on a person/);
    assert.match(text, /Running now/);
    assert.match(text, /Finished recently/);
    // The needs-you tile is the SHIPPED review-queue number, restated — never recomputed.
    assert.match(text, /4 Works are waiting on a person/);
    assert.match(text, /3 Works are queued or running/);
    assert.match(text, /2 Works finished in the last 7 days/);

    const links = hrefs(h);
    assert.ok(links.includes(`/clients/${CLIENT}/work?view=needs-you`), links.join(" | "));
    assert.ok(links.includes(`/clients/${CLIENT}/work?status=queued%2Crunning`), links.join(" | "));
    assert.ok(
      links.includes(`/clients/${CLIENT}/work?status=completed&since=2026-09-10&until=2026-09-16`),
      links.join(" | "),
    );
    // And each preview row is a link to the Work's own address.
    assert.ok(links.includes(`/clients/${CLIENT}/work/${WORK_A}`), links.join(" | "));
  } finally { await h.unmount(); }
});

// ===========================================================================================
// THE DRILLDOWN SAYS WHAT IT IS DATED BY (round-1 review, finding 650-B1).
//
// The recent-success tile counts a COMMITTED RECEIPT inside the seven Malaysian dates; the list
// its number opens fences `clara.accounting_work.created_at` — when the Work was STARTED
// (0189:427-428). There is no receipt-dated axis on that door, so the drilldown is the same week
// over a different subject, and the divergence is measured, not assumed:
// `packages/db/tests/client-work-pack.test.mjs` `p650.pack.recent_success_drilldown` builds both
// classes on the rig. The board's obligation is therefore the same one it already carries for
// "retrying": name the filter the list CAN express and disclose the part it cannot, rather than
// let a number imply a page it does not open.
// ===========================================================================================
test("the recent-success count DISCLOSES what its list is dated by — the same week, not the same Works", async () => {
  const h = await mount();
  try {
    const text = h.text();
    assert.match(text, /dated by when each Work started, not when it posted/,
      "the tile says which instant its drilldown fences on");
    // ONCE, and on the tile that owns it. "Running now" links to a status-only filter with no
    // dates at all, so the sentence would be false there.
    assert.equal(text.match(/dated by when each Work started/g)?.length, 1);
    const beforeActive = text.split("Running now")[0] ?? "";
    assert.ok(!beforeActive.includes("dated by when each Work started"),
      "the disclosure belongs to the dated facet, not to the one with no window");
  } finally { await h.unmount(); }
});

test("with nothing to open, there is no drilldown and therefore nothing to disclose", async () => {
  const h = await mount({ load: async () => pack({
    recentSuccess: { status: "ok", count: 0, coverage: "ok", coverageReason: null, uncountedCompletions: 0, rows: [] },
  }) });
  try {
    assert.match(h.text(), /No Work finished for this client in the last seven days\./);
    assert.ok(!h.text().includes("dated by when each Work started"),
      "an empty facet offers no link, so it makes no promise to qualify");
  } finally { await h.unmount(); }
});

// ===========================================================================================
// THE ONE LINK A DENIED CALLER IS STILL OFFERED (round-1 review, finding 650-N4).
//
// The needs-you count is VIEWER-floored (`clara.list_review_queue`, 0016:4563) and the Work list
// it opens is BOOKKEEPER-floored (0189:344-347). A caller the pack refused is exactly a caller
// below that floor, so the one populated tile on their board points at a door that will refuse
// them. The link stays — a role can change, and hiding the destination would hide the reason —
// but it stops being silent about where it leads.
// ===========================================================================================
test("a DENIED pack makes the needs-you tile say that the list behind its number needs a bookkeeper role", async () => {
  const h = await mount({
    load: async () => {
      throw new DoorRefusal("CLR04", "insufficient role",
        { reason: null, status: 403, pgCode: "CLR04", codeSource: "sqlstate" });
    },
  });
  try {
    const text = h.text();
    assert.match(text, /4 Works are waiting on a person/, "the viewer-floored number still shows");
    assert.match(text, /Opening the Work list needs a bookkeeper role/);
    // And it is the DENIAL that puts it there, not the tile.
  } finally { await h.unmount(); }
});

test("a readable pack leaves the needs-you count unqualified — the caller can open what it points at", async () => {
  const h = await mount();
  try {
    assert.ok(!h.text().includes("Opening the Work list needs a bookkeeper role"));
  } finally { await h.unmount(); }
});

test("the overlap is stated in WORDS, and nothing on the band can be added up", async () => {
  const h = await mount();
  try {
    assert.match(h.text(), /A Work can appear in more than one of these/);
    assert.match(h.text(), /do not add them together/);
    assert.doesNotMatch(h.text(), /\bTotal\b/, "there is no total, so no total is shown");
    // The needs-you tile names whose number it is, so a reader can see it is not a third count of
    // the same population computed here.
    assert.match(h.text(), /also chipped under Needs your attention/);
  } finally { await h.unmount(); }
});

test("the band says when it was READ, and never claims to know the database's position", async () => {
  const h = await mount();
  try {
    assert.match(h.text(), /Read at /);
    assert.doesNotMatch(h.text(), /up to date|watermark|synced/i,
      "no Work mutation emits an event, so a freshness claim past the read instant is invention");
  } finally { await h.unmount(); }
});

test("EMPTY, UNKNOWN and DENIED are three different renderings — and none of them is a 0", async () => {
  const empty = await mount({
    load: async () => pack({
      active: { status: "ok", count: 0, coverage: "ok", coverageReason: null, uncountedCompletions: null, rows: [] },
    }),
  });
  try {
    assert.match(empty.text(), /Nothing is running for this client right now/);
    assert.doesNotMatch(empty.text(), /could not be read/);
    assert.doesNotMatch(empty.text(), /not permitted/);
  } finally { await empty.unmount(); }

  const unknown = await mount({ load: async () => pack({ active: UNKNOWN_FACET }) });
  try {
    assert.match(unknown.text(), /could not be read/);
    assert.match(unknown.text(), /Unknown/, "the state is a WORD, not only a tone");
    assert.doesNotMatch(unknown.text(), /Nothing is running for this client right now/,
      "an unread facet must never render the honest-empty claim");
    assert.doesNotMatch(unknown.text(), /0 Works are queued or running/,
      "and it must never render a zero");
  } finally { await unknown.unmount(); }

  const denied = await mount({
    load: async () => {
      throw new DoorRefusal("CLR04", "insufficient role",
        { reason: null, status: 403, pgCode: "CLR04", codeSource: "sqlstate" });
    },
  });
  try {
    assert.match(denied.text(), /Your role does not include this/);
    assert.match(denied.text(), /Not permitted/, "the state is a WORD, not only a tone");
    assert.doesNotMatch(denied.text(), /Nothing is running for this client right now/);
    // THE #625 CASE, and the reason the needs-you tile is not part of this read: the two halves
    // of this page have different floors, so a viewer sees one populated tile beside two
    // no-permission ones — and the band SAYS why rather than looking broken.
    assert.match(denied.text(), /4 Works are waiting on a person/,
      "the viewer-floored number this page has shown since ticket 629 is still there");
    assert.match(denied.text(), /Work records need a bookkeeper role/);
  } finally { await denied.unmount(); }
});

test("a PARTIAL facet names what it is not claiming, rather than reporting a smaller number as whole", async () => {
  const h = await mount({
    load: async () => pack({
      active: {
        status: "partial", count: 40, coverage: "partial", coverageReason: "retry_label_preview_only",
        uncountedCompletions: null, rows: pack().active.rows,
      },
      recentSuccess: {
        status: "partial", count: 2, coverage: "partial",
        coverageReason: "completions_without_receipt", uncountedCompletions: 3,
        rows: pack().recentSuccess.rows,
      },
    }),
  });
  try {
    const text = h.text();
    assert.match(text, /Partly known/, "the state is a WORD");
    assert.match(text, /Retrying is shown for the newest 2 of 40/);
    assert.match(text, /3 completed Works carry no receipt/);
    assert.match(text, /40 Works are queued or running/, "the number the door DID answer still stands");
  } finally { await h.unmount(); }
});

test("RETRYING is a row label derived from the run count, and it is not offered as a filter", async () => {
  const h = await mount();
  try {
    assert.match(h.text(), /Retrying/);
    assert.match(h.text(), /2nd run/, "the label carries the fact it is derived from");
    // The active drilldown names the two statuses the list can actually express.
    assert.ok(hrefs(h).includes(`/clients/${CLIENT}/work?status=queued%2Crunning`));
    assert.equal(hrefs(h).some((href) => href.includes("retry")), false,
      "'retrying' is not an expressible Work-list filter, so no link pretends it is");
    // …and the tile discloses that, rather than letting the drilldown look complete.
    assert.match(h.text(), /The list cannot filter by retrying/);
  } finally { await h.unmount(); }
});

test("the run ordinal is computed by the locale, not by three hand-written exceptions", async () => {
  // Round-1 review note (STANDARDS 1 / SPEC F1): the key was ICU `plural` with `=2`/`=3` exact
  // matches standing in for ordinals, which is right up to 20 and wrong from 21 on ("21th run").
  // `selectordinal` asks CLDR for the English ordinal category instead, so the suffix is derived
  // rather than enumerated. `attempts` has no ceiling in the estate — `clara._work_run_attempts`
  // counts every run a Work has had — so "unlikely" was the only thing holding the old spelling up.
  const many = (n: number) => pack({
    active: {
      status: "ok", count: 1, coverage: "ok", coverageReason: null, uncountedCompletions: null,
      rows: [{
        work_id: WORK_A, purpose: "journal_entry", status: "running", memo: "Office rent",
        attempts: n, current_run_status: "running", retrying: true,
        created_at: "2026-09-16T01:00:00.000Z", committed_at: null, receipt_id: null, entry_id: null,
      }],
    },
  });
  for (const [n, expected] of [[1, "1st run"], [2, "2nd run"], [3, "3rd run"], [4, "4th run"],
    [11, "11th run"], [21, "21st run"], [22, "22nd run"], [33, "33rd run"]] as const) {
    const h = await mount({ load: async () => many(n) });
    try {
      assert.ok(h.text().includes(expected), `attempts=${n} must render "${expected}"`);
    } finally { await h.unmount(); }
  }
});

test("a preview row renders its purpose through the SHARED label map, unknown values verbatim", async () => {
  const h = await mount();
  try {
    assert.match(h.text(), /Supplied payroll obligation/, "the shared purpose vocabulary (ticket 638), unchanged");
    assert.match(h.text(), /Journal entry/);
  } finally { await h.unmount(); }

  const odd = await mount({
    load: async () => pack({
      active: {
        ...pack().active,
        rows: [{ ...pack().active.rows[0]!, purpose: "staff_expense_claim" }],
      },
    }),
  });
  try {
    assert.match(odd.text(), /staff_expense_claim/,
      "a purpose this build has not learned renders VERBATIM rather than crashing a t() lookup");
  } finally { await odd.unmount(); }
});

test("a failed FIRST read offers Retry and says nothing about the client's Work", async () => {
  let attempts = 0;
  const h = await mount({
    load: async () => {
      attempts += 1;
      if (attempts === 1) throw new Error("boom");
      return pack();
    },
  });
  try {
    assert.match(h.text(), /could not be read/);
    assert.doesNotMatch(h.text(), /Nothing is running for this client right now/);
    const button = h.find((n) => String((n as { textContent?: string }).textContent ?? "") === "Retry");
    assert.ok(button, "a failed read offers a retry");
  } finally { await h.unmount(); }
});

test("p650.pack.no_period_axis (board) — a fiscal-year parameter in the page's address changes NOTHING", async () => {
  const plain = await mount({ pathname: `/clients/${CLIENT}` });
  const plainText = plain.text();
  const plainHrefs = hrefs(plain).join("|");
  await plain.unmount();

  const withFy = await mount({ pathname: `/clients/${CLIENT}?fy=2026&period=2026-08` });
  try {
    assert.equal(withFy.text(), plainText, "the same three counts, whatever the page's own query");
    assert.equal(hrefs(withFy).join("|"), plainHrefs, "and the same three drilldowns");
    assert.equal(plainHrefs.includes("fy="), false);
    assert.equal(plainHrefs.includes("period="), false);
  } finally { await withFy.unmount(); }
});

test("the band is axe-clean, and each count's accessible name is a full noun phrase", async () => {
  const h = await mount();
  try {
    const violations = checkAccessibility(h.container as never);
    assert.deepEqual(violations, [], JSON.stringify(violations));
    // The LINK text is the sentence, never a bare number beside a separate label.
    const link = h.find((n) => String((n as { textContent?: string }).textContent ?? "")
      .startsWith("3 Works are queued or running"));
    assert.ok(link, "the count link names what it counts");
  } finally { await h.unmount(); }
});
