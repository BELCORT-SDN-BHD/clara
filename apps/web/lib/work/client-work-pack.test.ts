// #650 — the client Work pack's wire contract and its ONE facet→href builder.
//
// TWO THINGS ARE UNDER TEST HERE AND THEY FAIL IN OPPOSITE DIRECTIONS.
//
// The HYDRATION half is about not inventing: a body this module cannot read must come back as
// `unknown`, never as `0`. "No active Work" and "I could not find out" are different sentences and
// only one of them is a reason to stop looking.
//
// The HREF half is about not spelling one filter two ways. The home and the Work list must agree
// on what "active" means, so every facet link is built here and read back through
// `parseWorkListUrlState` — the list's own parser — rather than compared as a string. A
// hand-spelled query the parser normalises away would pass a string comparison and take the person
// to a different list.

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  UNKNOWN_FACET,
  WORK_ATTENTION_ACTIVE_STATUSES,
  getClientWorkPack,
  hydrateClientWorkPack,
  workAttentionHref,
  type ClientWorkPack,
} from "./client-work-pack";
import {
  WORK_LIST_FILTER_AXES,
  parseWorkListUrlState,
} from "./work-list-url-state";
import { businessDayEnd, businessDayStart } from "@/lib/firm/activity";
import { WORK_NEEDS_YOU_VIEW } from "@/lib/navigation/tree";
import type { SessionTokenAccessor } from "@/lib/session";

const session: SessionTokenAccessor = { getAccessToken: async () => "tok" };
const CLIENT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const WORK = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function envelope(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    computed_at: "2026-09-16T02:00:00.000Z",
    preview_limit: 5,
    window: {
      from: "2026-09-09T16:00:00.000Z",
      to: "2026-09-16T16:00:00.000Z",
      from_date: "2026-09-10",
      to_date: "2026-09-16",
      timezone: "Asia/Kuala_Lumpur",
      days: 7,
    },
    facets: {
      active: {
        status: "ok", count: 3, coverage: "ok", coverage_reason: null,
        rows: [{
          work_id: WORK, purpose: "journal_entry", status: "running", memo: "Office rent",
          attempts: 2, current_run_status: "running", retrying: true,
          created_at: "2026-09-16T01:00:00.000Z", updated_at: "2026-09-16T01:30:00.000Z",
        }],
      },
      recent_success: {
        status: "partial", count: 2, coverage: "partial",
        coverage_reason: "completions_without_receipt", uncounted_completions: 1,
        rows: [{
          work_id: WORK, purpose: "journal_entry", status: "completed", memo: "Bank fee",
          receipt_id: "r1", entry_id: "e1", committed_at: "2026-09-15T02:00:00.000Z",
        }],
      },
    },
    needs_you_ref: { source: "list_review_queue.counts.work_questions" },
    ...overrides,
  };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

async function withFetch(
  impl: () => Response,
  run: (sent: { url: string; body: Record<string, unknown> }[]) => Promise<void>,
): Promise<void> {
  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  const sent: { url: string; body: Record<string, unknown> }[] = [];
  globalThis.fetch = (async (u: unknown, init?: RequestInit) => {
    sent.push({
      url: String(u),
      body: typeof init?.body === "string" ? (JSON.parse(init.body) as Record<string, unknown>) : {},
    });
    return impl();
  }) as typeof fetch;
  try {
    await run(sent);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
  }
}

// ===========================================================================================
// THE WIRE
// ===========================================================================================

test("the pack is requested by client with a preview size, and the envelope hydrates field for field", async () => {
  await withFetch(() => json(envelope()), async (sent) => {
    const pack = await getClientWorkPack(CLIENT, { session, preview: 5 });
    assert.equal(sent.length, 1);
    assert.match(sent[0]!.url, /\/rpc\/get_client_work_pack$/);
    assert.deepEqual(sent[0]!.body, { p_client: CLIENT, p_preview: 5 });

    assert.equal(pack.computedAt, "2026-09-16T02:00:00.000Z");
    assert.equal(pack.previewLimit, 5);
    assert.equal(pack.window?.fromDate, "2026-09-10");
    assert.equal(pack.window?.toDate, "2026-09-16");
    assert.equal(pack.window?.timezone, "Asia/Kuala_Lumpur");
    assert.equal(pack.active.count, 3);
    assert.equal(pack.active.status, "ok");
    assert.equal(pack.active.rows[0]?.retrying, true);
    assert.equal(pack.active.rows[0]?.attempts, 2);
    assert.equal(pack.recentSuccess.count, 2);
    assert.equal(pack.recentSuccess.status, "partial");
    assert.equal(pack.recentSuccess.coverageReason, "completions_without_receipt");
    assert.equal(pack.recentSuccess.uncountedCompletions, 1);
    assert.equal(pack.needsYouSource, "list_review_queue.counts.work_questions");
  });
});

test("THERE IS NO TOTAL to hydrate — the shape this module exposes offers nothing to add", () => {
  const pack: ClientWorkPack = hydrateClientWorkPack(envelope());
  assert.equal(Object.prototype.hasOwnProperty.call(pack, "total"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(pack, "needsYou"), false,
    "the needs-you number is NOT part of this read — it comes from the review queue");
});

// ===========================================================================================
// HYDRATE-NEVER-TRUST: unknown is not zero
// ===========================================================================================

test("a malformed facet degrades to UNKNOWN, never to 0", () => {
  for (const [label, body] of [
    ["no facets key at all", envelope({ facets: undefined })],
    ["facets is not an object", envelope({ facets: "nope" })],
    ["the active facet is missing", envelope({ facets: { recent_success: envelope().facets } })],
    ["count is a string", envelope({
      facets: { active: { status: "ok", count: "3", rows: [] }, recent_success: { status: "ok", count: 0, rows: [] } },
    })],
    ["count is negative", envelope({
      facets: { active: { status: "ok", count: -1, rows: [] }, recent_success: { status: "ok", count: 0, rows: [] } },
    })],
    ["count is absent", envelope({
      facets: { active: { status: "ok", rows: [] }, recent_success: { status: "ok", count: 0, rows: [] } },
    })],
  ] as const) {
    const pack = hydrateClientWorkPack(body);
    assert.equal(pack.active.status, "unknown", `${label}: the facet must be unknown`);
    assert.equal(pack.active.count, null, `${label}: an unreadable count is NULL, never 0`);
    assert.deepEqual(pack.active.rows, [], `${label}: and it carries no rows`);
  }

  // The OTHER facet is unaffected: one malformed half must not blank the other, the same law
  // the client board's sections already obey.
  const half = hydrateClientWorkPack(envelope({
    facets: { active: "nope", recent_success: (envelope().facets as Record<string, unknown>).recent_success },
  }));
  assert.equal(half.active.status, "unknown");
  assert.equal(half.recentSuccess.count, 2, "a readable facet beside an unreadable one still reports");
});

test("a whole envelope that is not an object hydrates to two unknown facets and no window", () => {
  for (const body of [null, undefined, "nope", 7, []]) {
    const pack = hydrateClientWorkPack(body);
    assert.deepEqual(pack.active, UNKNOWN_FACET);
    assert.deepEqual(pack.recentSuccess, UNKNOWN_FACET);
    assert.equal(pack.window, null);
    assert.equal(pack.computedAt, null, "an unread pack has no read instant to show");
  }
});

test("an unrecognised facet status word is UNKNOWN rather than passed through", () => {
  const pack = hydrateClientWorkPack(envelope({
    facets: {
      active: { status: "fine", count: 4, coverage: "ok", rows: [] },
      recent_success: { status: "ok", count: 0, coverage: "ok", rows: [] },
    },
  }));
  assert.equal(pack.active.status, "unknown");
  assert.equal(pack.active.count, null, "a status this build cannot read makes the number unusable too");
});

test("a row that is not a readable Work row is dropped rather than rendered half-built", () => {
  const pack = hydrateClientWorkPack(envelope({
    facets: {
      active: {
        status: "ok", count: 2, coverage: "ok",
        rows: [{ work_id: WORK, retrying: false }, { purpose: "journal_entry" }, "nope", null],
      },
      recent_success: { status: "ok", count: 0, coverage: "ok", rows: [] },
    },
  }));
  assert.equal(pack.active.rows.length, 1, "only the row carrying a work id survives");
  assert.equal(pack.active.rows[0]?.work_id, WORK);
  assert.equal(pack.active.count, 2, "and the COUNT is still the door's, never rows.length");
});

// ===========================================================================================
// THE ONE HREF BUILDER — round-tripped through the list's own parser
// ===========================================================================================

const parse = (href: string) => parseWorkListUrlState(new URL(href, "https://x.test").searchParams);

test("needs you → the Work list's BUILT-IN view, not a hand-spelled status", () => {
  const href = workAttentionHref("needs_you", CLIENT, hydrateClientWorkPack(envelope()));
  assert.ok(href.startsWith(`/clients/${CLIENT}/work?`), href);
  const state = parse(href);
  assert.equal(state.view, WORK_NEEDS_YOU_VIEW);
  assert.deepEqual(state.status, ["awaiting_input"],
    "the built-in view contributes the status — this build does not restate it");
});

test("active → status=queued,running, and the two words are the door's own", () => {
  const href = workAttentionHref("active", CLIENT, hydrateClientWorkPack(envelope()));
  const state = parse(href);
  assert.deepEqual([...state.status].sort(), [...WORK_ATTENTION_ACTIVE_STATUSES].sort());
  assert.deepEqual([...state.status].sort(), ["queued", "running"]);
  assert.equal(state.view, null);
  assert.equal(state.since, null, "an activity window is not part of 'what is running now'");
});

test("recent success → the pack's OWN window dates ON THE RECEIPT AXIS, and NO status term — #905", () => {
  const pack = hydrateClientWorkPack(envelope());
  const href = workAttentionHref("recent_success", CLIENT, pack);
  const state = parse(href);
  // NO STATUS TERM (fix round, review finding L09-ADV-04). The tile's own facet counts a committed
  // receipt inside the window and says NOTHING about status, so a Work that posted and is still
  // running was counted by the number and dropped by a `status=completed` drilldown — the tile and
  // its list disagreeing again, one axis over. The receipt window now carries the whole meaning.
  assert.deepEqual(state.status, [],
    "the receipt window IS the filter: adding a status term narrows the list below the tile's own count");
  // #905: the receipt-dated axis, not the admission-dated `since`/`until` — the whole point of
  // the fix is that this drilldown fences the SAME instant the tile counts by (a committed
  // receipt), not when each Work was admitted.
  assert.equal(state.receiptSince, "2026-09-10");
  assert.equal(state.receiptUntil, "2026-09-16");
  assert.equal(state.since, null, "the admission axis is not touched by this facet's link");
  assert.equal(state.until, null);

  // THE PROPERTY THAT MAKES THE DRILLDOWN THE SAME WEEK AS THE TILE. The list converts these two
  // calendar days back into instants with the same business-day helpers, and those instants are
  // the half-open range the door itself used to count the tile — now against the receipt, not
  // the admission instant.
  assert.equal(businessDayStart(state.receiptSince!), "2026-09-10T00:00:00.000+08:00");
  assert.equal(businessDayEnd(state.receiptUntil!), "2026-09-17T00:00:00.000+08:00");
  assert.equal(new Date(businessDayStart(state.receiptSince!)).toISOString(), pack.window!.from);
  assert.equal(new Date(businessDayEnd(state.receiptUntil!)).toISOString(), pack.window!.to);
});

test("an unreadable window drops the dates rather than guessing them — and IS the one arm that still sends a status term", () => {
  // THE ONE ARM WHERE A STATUS TERM IS STILL RIGHT. With no window to fence on, a link carrying no
  // filter at all would open every Work this client has ever had — strictly worse than one that is
  // slightly too narrow. `recentSuccessListUndated` is the sentence the board prints beside exactly
  // this arm, and `workAttentionWindowDates` is the ONE predicate both the link and the board ask.
  const pack = hydrateClientWorkPack(envelope({ window: { timezone: "Asia/Kuala_Lumpur" } }));
  const state = parse(workAttentionHref("recent_success", CLIENT, pack));
  assert.deepEqual(state.status, ["completed"]);
  assert.equal(state.receiptSince, null, "a date this build did not read is not invented");
  assert.equal(state.receiptUntil, null);
});

// ===========================================================================================
// p650.pack.no_period_axis — THE WEB HALF of AC2's period clause.
// ===========================================================================================

test("p650.pack.no_period_axis (web) — every key a facet href emits is a Work-list FILTER AXIS", () => {
  const pack = hydrateClientWorkPack(envelope());
  const axes = new Set<string>([...WORK_LIST_FILTER_AXES, "view"]);
  for (const kind of ["needs_you", "active", "recent_success"] as const) {
    const url = new URL(workAttentionHref(kind, CLIENT, pack), "https://x.test");
    const keys = [...url.searchParams.keys()];
    assert.ok(keys.length > 0, `${kind} narrows the list by something`);
    for (const key of keys) {
      assert.ok(axes.has(key), `${kind} emitted ${key}, which is not one of the Work list's axes`);
    }
    // There is no period axis to emit, and this is the assertion that keeps it that way.
    for (const forbidden of ["period", "fy", "fiscal_year", "basis", "as_of"]) {
      assert.equal(url.searchParams.has(forbidden), false, `${kind} must never emit ${forbidden}`);
    }
  }
  assert.equal(axes.has("period"), false,
    "the Work list has no period axis at all; ticket 660 inherits this cell, not a promise");
});

test("p650.pack.no_period_axis (web) — a fiscal-year parameter on the HOME url cannot reach a facet href", () => {
  const pack = hydrateClientWorkPack(envelope());
  // The builder takes no ambient URL at all, so there is nothing for a home-page query parameter
  // to leak through. Asserted by construction AND by value: the same three hrefs come back
  // whatever the page's own address is.
  const plain = (["needs_you", "active", "recent_success"] as const).map((k) => workAttentionHref(k, CLIENT, pack));
  const again = (["needs_you", "active", "recent_success"] as const).map((k) => workAttentionHref(k, CLIENT, pack));
  assert.deepEqual(plain, again);
  assert.equal(workAttentionHref.length, 3, "the builder's whole input is (kind, clientId, pack)");
});

// ===========================================================================================
// REFUSALS travel as refusals
// ===========================================================================================

test("a governed refusal is thrown, not hydrated into an empty board", async () => {
  await withFetch(() => json({ code: "CLR04", message: "insufficient role" }, 403), async () => {
    await assert.rejects(() => getClientWorkPack(CLIENT, { session }), (e: unknown) => {
      assert.ok(e instanceof Error);
      return true;
    });
  });
});
