// The three durable-Work transcript cards (B6), under test.
//
// WHAT A GREEN HERE MEANS. Two of the three still render the WIRE and stop —
// there is no hydrate to prove for `work_status`/`work_result`, so those
// questions stay narrower and sharper than the v16 cards' three: does the
// branch exist at all, does it render the DB's own identifiers verbatim, does
// it build a REAL route, and does it refuse to build one when the payload
// cannot address anything.
//
// THE LINK CELLS ARE THE LOAD-BEARING ONES for those two. `/clients//work/
// work-1` is a 404 dressed as an affordance, and the emitter can genuinely
// construct a part before `client_id` is filled — `entry_posted` has done
// exactly that since chatTurn.v13. So "no client, no link" is asserted, not
// assumed.
//
// #629 (B6) — `work_accepted` NO LONGER STOPS AT THE WIRE. It now hydrates the
// Work's own status (one light `accounting_work` row read) and, while that
// status reads `awaiting_input`, mounts `WorkQuestionPanel` — the gap the
// follow-up review named: a Work that parks on a question becomes
// unanswerable from here after a reload, because `work_question` (below) lives
// only on the run's live stream. Three states are under test: PARKED (the
// panel mounts), NOT PARKED (renders exactly as it always has) and — the one
// this file CANNOT prove — ACCEPTED (the panel's form actually shows a
// submitted or already-settled answer).
//
// WHY "ACCEPTED" IS NOT HERE. `WorkQuestionPanel` (and `WorkQuestionCard`
// below it, which has carried the same shape since P6-2 with no test of its
// own) only renders `WorkQuestionForm` once BOTH `clara.get_work_pending_
// question` AND `getSessionIdentity()` resolve. The second one is a REAL
// `@supabase/ssr` browser client reading a `__Host-`-prefixed, chunked,
// `base64-`-encoded session cookie — machinery this harness has no seam for
// and no business reverse-engineering one test at a time (measured: even
// constructing a plausible cookie needs an HTTPS origin jsdom does not
// provide, on top of the library's own private encoding). `work-detail.
// test.tsx`'s own "AWAITING INPUT" cells record the identical limitation and
// take the identical way around it: PROVE THE WIRING through the panel's
// door-unreachable fallback arm, which still renders and still has no live
// region, and leave the full answer to a browser. `work-question-walk.
// spec.ts`'s B6 cell is that browser — a real signed-in session, a real
// answer, a real convergence.
//
// THE LINK CELLS stay load-bearing for the two wire-only cards below.

import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement, type ReactElement } from "react";
import { NextIntlClientProvider } from "next-intl";

import { renderComponent } from "../../test/hookHarness";
import { enableDomInspection } from "../../test/domInspect";
import { configureSessionTokenSource, resetSessionTokenSource } from "../../lib/session-accessor";
import { PartRenderer, FALLBACK_UNSUPPORTED_PREFIX } from "./PartRenderer";
import { FirmScopeProvider } from "../firm-scope-provider";
import { WORK_CARD_POLL_MS } from "./WorkCards";
import type { ClaraPart } from "../../lib/parts/types";
import messages from "../../messages/en.json";

enableDomInspection();

type Stub = Record<string, unknown>;

function App(part: ClaraPart): ReactElement {
  return createElement(NextIntlClientProvider, {
    locale: "en",
    messages,
    timeZone: "Asia/Kuala_Lumpur",
    children: createElement(PartRenderer, { part }),
  });
}

/** #630 — the SAME card, under a firm scope carrying a rank. The rail is always inside the firm
 *  layout's provider in production; a node cell that mounts one card on its own is not, which is
 *  why the card reads the scope through `useFirmScopeOrNull` and fails closed without it. */
function ScopedApp(part: ClaraPart, roleRank: number | null): ReactElement {
  return createElement(NextIntlClientProvider, {
    locale: "en",
    messages,
    timeZone: "Asia/Kuala_Lumpur",
    children: createElement(FirmScopeProvider, {
      scope: { role_rank: roleRank, is_operator: false } as never,
      children: createElement(PartRenderer, { part }),
    }),
  });
}

/** Every `<a href>` the card rendered, in document order. */
function hrefs(container: Stub): string[] {
  const out: string[] = [];
  const walk = (n: Stub) => {
    if (n.tagName === "A") {
      const href = (n as { getAttribute?: (k: string) => string | null }).getAttribute?.("href");
      if (href) out.push(href);
    }
    for (const c of (n.childNodes as Stub[] | undefined) ?? []) walk(c);
  };
  walk(container);
  return out;
}

/** First node (depth-first) carrying `data-testid="id"`, or null. */
function byTestId(container: Stub, id: string): Stub | null {
  const walk = (n: Stub): Stub | null => {
    if ((n as { getAttribute?: (k: string) => string | null }).getAttribute?.("data-testid") === id) return n;
    for (const c of (n.childNodes as Stub[] | undefined) ?? []) {
      const found = walk(c);
      if (found) return found;
    }
    return null;
  };
  return walk(container);
}

/** Every element that ANNOUNCES itself — `role="alert"`/`"status"`, or a live
 *  `aria-live` — anywhere under `container`. §5's "one announcement owner"
 *  is asserted by proving this list is empty, never by spot-checking one node. */
function liveRegions(container: Stub): Stub[] {
  const out: Stub[] = [];
  const walk = (n: Stub) => {
    const get = (n as { getAttribute?: (k: string) => string | null }).getAttribute;
    const role = get?.("role");
    const ariaLive = get?.("aria-live");
    if (role === "alert" || role === "status" || (ariaLive != null && ariaLive !== "off")) out.push(n);
    for (const c of (n.childNodes as Stub[] | undefined) ?? []) walk(c);
  };
  walk(container);
  return out;
}

/** The wire shape `lib/work/questions.ts`'s `callDoor`/`getRows` build, keyed by the
 *  final path segment (the relation or RPC function name) — the same technique
 *  `work-question-form.test.tsx`'s own `stubDoors` uses, generalised to GETs too
 *  (a filtered `accounting_work` GET's URL ends in `accounting_work` exactly the
 *  same way an RPC POST's ends in the function name). */
type Call = { fn: string; method: string; body: Record<string, unknown> };

function stubBackend(handler: (call: Call) => { status: number; body: unknown }): { calls: Call[]; restore: () => void } {
  const calls: Call[] = [];
  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  globalThis.fetch = (async (input: unknown, init?: { method?: string; body?: string }) => {
    const url = String(input);
    const fn = url.slice(url.lastIndexOf("/") + 1).split("?")[0] ?? "";
    const body = init?.body ? (JSON.parse(init.body) as Record<string, unknown>) : {};
    const call: Call = { fn, method: init?.method ?? "GET", body };
    calls.push(call);
    const { status, body: out } = handler(call);
    return {
      ok: status >= 200 && status < 300,
      status,
      headers: { get: () => "application/json" },
      json: async () => out,
      text: async () => JSON.stringify(out),
    } as unknown as Response;
  }) as typeof globalThis.fetch;
  configureSessionTokenSource(async () => "test-token");
  return {
    calls,
    restore: () => {
      globalThis.fetch = originalFetch;
      if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
      else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
      resetSessionTokenSource();
    },
  };
}

/** Poll `h.settle()` (one real macrotask hop) until `condition()` holds, bounded
 *  by a wall-clock timeout — never a fixed hop count (`sweep-receipt-card.test.
 *  tsx`'s own header records why a fixed count is load-sensitive and flaky). */
async function settleUntil(
  h: { settle: () => Promise<void> },
  condition: () => boolean,
  description: string,
  timeoutMs = 5000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() >= deadline) {
      throw new Error(`settleUntil: timed out after ${timeoutMs}ms waiting for: ${description}`);
    }
    await h.settle();
  }
}

const ACCEPTED: ClaraPart = {
  type: "work_accepted",
  work_id: "work-1",
  client_id: "client-1",
  purpose: "journal_entry",
  logical_op_id: "work:work-1:journal_entry:1",
};

test("work_accepted renders the operation identity and links to the WORK'S OWN page", async () => {
  // #629 (B6) — the card now hydrates the Work's own status to decide whether to offer the parked
  // question panel. This cell's Work reads back NOT FOUND (the fixture never seeded one), which is
  // exactly "not parked": the card renders as it always has, and no panel appears.
  const backend = stubBackend((call) => (call.fn === "accounting_work" ? { status: 200, body: [] } : { status: 404, body: {} }));
  try {
    const h = await renderComponent(App(ACCEPTED));
    try {
      await settleUntil(h, () => backend.calls.some((c) => c.fn === "accounting_work"), "the Work status was read");
      await h.settle();
      const text = h.text();
      assert.match(text, /Accounting work accepted/);
      assert.match(text, /journal_entry/, "the DB's own purpose token, verbatim");
      assert.match(text, /work-1/);
      // The logical operation identity is what makes a replayed commit resolve the
      // ORIGINAL receipt. A professional can match it against the Work page.
      assert.match(text, /work:work-1:journal_entry:1/);
      assert.deepEqual(hrefs(h.container), ["/clients/client-1/work/work-1"]);
      assert.ok(!text.includes(FALLBACK_UNSUPPORTED_PREFIX), "the branch exists — this is not the unsupported chip");
      assert.equal(byTestId(h.container, "work-question-fallback"), null, "no panel when the Work read admits none");
    } finally {
      await h.unmount();
    }
  } finally {
    backend.restore();
  }
});

test("work_accepted whose Work reads NOT PARKED renders exactly as before — no panel at all", async () => {
  const backend = stubBackend((call) =>
    call.fn === "accounting_work"
      ? { status: 200, body: [{ id: "work-1", client_id: "client-1", status: "completed" }] }
      : { status: 404, body: {} },
  );
  try {
    const h = await renderComponent(App(ACCEPTED));
    try {
      await settleUntil(h, () => backend.calls.some((c) => c.fn === "accounting_work"), "the Work status was read");
      await h.settle();
      assert.match(h.text(), /Accounting work accepted/);
      assert.equal(byTestId(h.container, "work-question-fallback"), null);
      assert.equal(byTestId(h.container, "work-question-form"), null);
      assert.equal(byTestId(h.container, "work-question-accepted"), null);
      assert.deepEqual(liveRegions(h.container), []);
    } finally {
      await h.unmount();
    }
  } finally {
    backend.restore();
  }
});

// `lib/work/questions.ts`'s `getPendingWorkQuestion` refuses a malformed id BEFORE ever calling the
// door (`isUuidShape`, the same defence-in-depth `lib/client-id.ts` argues for) — unlike
// `getAccountingWork`, which has no such guard. `ACCEPTED`'s "work-1"/"client-1" satisfy the first
// but not the second, so the PARKED cell below needs ids shaped like the real thing to ever REACH
// the door it is testing.
const PARKED_WORK = "11111111-1111-4111-8111-111111111111";
const PARKED_CLIENT = "22222222-2222-4222-8222-222222222222";
const PARKED: ClaraPart = { ...ACCEPTED, work_id: PARKED_WORK, client_id: PARKED_CLIENT };

test("work_accepted whose Work reads PARKED mounts the SAME question panel, announcing NOTHING", async () => {
  // #629 (B6) — the durable card's own gap: after a reload, `work_question` (the live-stream face)
  // is gone, and this is the ONE part left that can still find the question. `getAccountingWork`
  // reading `awaiting_input` is what must make `WorkAcceptedCard` reach for `WorkQuestionPanel`,
  // addressed by THIS work's id, exactly as B3 (the Work detail) and B4 (Needs-you) address it.
  //
  // `get_work_pending_question` is made to FAIL here rather than to succeed — see this file's own
  // header for why: the panel's `WorkQuestionForm` branch also needs `getSessionIdentity()`, a REAL
  // `@supabase/ssr` browser-client read this harness cannot seed, so a SUCCEEDING door here would
  // still resolve to nothing rendered and this cell would prove nothing. Failing it instead reaches
  // the panel's door-unreachable fallback arm, which DOES render (`work-detail.test.tsx`'s own
  // "AWAITING INPUT" cells take the identical route for the identical reason) — enough to prove the
  // WIRING: the right panel, addressed by the right work id, with no live region of its own.
  const backend = stubBackend((call) => {
    if (call.fn === "accounting_work") {
      return { status: 200, body: [{ id: PARKED_WORK, client_id: PARKED_CLIENT, status: "awaiting_input" }] };
    }
    if (call.fn === "get_work_pending_question") {
      return { status: 500, body: { message: "unreachable in this harness — see the file header" } };
    }
    return { status: 404, body: {} };
  });
  try {
    const h = await renderComponent(App(PARKED));
    try {
      await settleUntil(
        h,
        () => byTestId(h.container, "work-question-fallback") !== null,
        "the panel's fallback renders once the Work reads awaiting_input",
      );
      const askedFor = backend.calls.find((c) => c.fn === "get_work_pending_question");
      assert.ok(askedFor, "the card asked the door for THIS work's pending question");
      assert.equal(askedFor?.body.p_work, PARKED_WORK);
      // §5, one announcement owner. The transcript already has one; `announce="none"` must hold
      // even on the panel's OWN door-unreachable banner, not only on the form's.
      assert.deepEqual(liveRegions(h.container), []);
    } finally {
      await h.unmount();
    }
  } finally {
    backend.restore();
  }
});

test("work_accepted with an EMPTY client_id renders in full and offers NO link", async () => {
  const h = await renderComponent(App({ ...ACCEPTED, client_id: "" } as ClaraPart));
  try {
    assert.match(h.text(), /work-1/, "the card still renders");
    assert.deepEqual(hrefs(h.container), [], "a route built from an empty client id is a 404 dressed as an affordance");
  } finally {
    await h.unmount();
  }
});

test("work_status is a compact NAMED line — never a bare adjective, and never a link", async () => {
  const h = await renderComponent(App({ type: "work_status", work_id: "work-1", status: "running" }));
  try {
    const text = h.text();
    // The label is what makes "running" readable to someone who cannot see the
    // layout; §5's announcement boundary is why it is static text and not a
    // live region of its own.
    assert.match(text, /Work status/);
    assert.match(text, /running/);
    assert.match(text, /work-1/);
    // The part carries no client id at all, so there is no route to build.
    assert.deepEqual(hrefs(h.container), []);
  } finally {
    await h.unmount();
  }
});

test("an UNKNOWN status renders VERBATIM rather than through a missing message key", async () => {
  const h = await renderComponent(App({ type: "work_status", work_id: "work-1", status: "some_future_status" }));
  try {
    assert.match(h.text(), /some_future_status/);
    assert.ok(!h.text().includes("Clara.parts"), "next-intl renders a missing key as its raw dotted path — that must never happen here");
  } finally {
    await h.unmount();
  }
});

test("work_result names the entry AND the receipt, and links to the journals workbench", async () => {
  const h = await renderComponent(
    App({ type: "work_result", work_id: "work-1", client_id: "client-1", entry_id: "entry-1", receipt_id: "receipt-1" }),
  );
  try {
    const text = h.text();
    assert.match(text, /Journal entry posted/);
    assert.match(text, /entry-1/);
    assert.match(text, /receipt-1/);
    // The lines and the total are read live on the workbench — a figure copied
    // into a transcript card goes stale and this UI never invents one.
    assert.ok(!/RM/.test(text), "no amount may appear on a card whose wire carries none");
    assert.deepEqual(hrefs(h.container), ["/clients/client-1/journals"]);
  } finally {
    await h.unmount();
  }
});

test("work_result with no usable client renders without a link", async () => {
  const h = await renderComponent(
    App({ type: "work_result", work_id: "work-1", client_id: "   ", entry_id: "entry-1", receipt_id: "receipt-1" }),
  );
  try {
    assert.match(h.text(), /entry-1/);
    assert.deepEqual(hrefs(h.container), []);
  } finally {
    await h.unmount();
  }
});

// ===========================================================================================
// #630 fix round — THE RAIL CARD'S OWN THREE FINDINGS.
// ===========================================================================================

test("630 the rail card offers Cancel Work only to a bookkeeper+, and never without a scope", async () => {
  const running = { ...ACCEPTED, work_id: PARKED_WORK, client_id: PARKED_CLIENT } as ClaraPart;
  const backend = stubBackend((call) =>
    call.fn === "accounting_work"
      ? { status: 200, body: [{ id: PARKED_WORK, client_id: PARKED_CLIENT, status: "running" }] }
      : { status: 404, body: {} });
  try {
    for (const [rank, offered] of [[1, true], [0, false], [null, false]] as const) {
      const h = await renderComponent(ScopedApp(running, rank));
      try {
        await settleUntil(h, () => backend.calls.some((c) => c.fn === "accounting_work"), "the Work status was read");
        for (let i = 0; i < 6; i += 1) await h.settle();
        const has = /Cancel Work/.test(h.text());
        assert.equal(has, offered,
          `rank=${String(rank)} — clara.cancel_accounting_work floors at bookkeeper, so a viewer or `
          + "an unreadable rank must be offered no destructive control at all");
      } finally {
        await h.unmount();
      }
    }
  } finally {
    backend.restore();
  }
});

test("630 the rail card POLLS while the Work is live and schedules NOTHING once it is terminal", async () => {
  // MEASURED SHAPE (review): `useHydratedPart` reads on mount and on an explicit `reload()` only,
  // so the single re-read a cancel triggers landed while the Work was still `stopping` and the card
  // then showed `stopping` for ever — on a row the database had long since settled. The card's own
  // sentence ("this Work will show its final state once that is settled") was false.
  //
  // The INTERVAL is what is pinned here rather than elapsed wall-clock: a cell that waited three
  // real seconds per assertion would be slow and, worse, would be measuring the host's scheduler.
  const scheduled: number[] = [];
  const cleared: unknown[] = [];
  const realSet = globalThis.setInterval;
  const realClear = globalThis.clearInterval;
  globalThis.setInterval = ((fn: () => void, ms?: number) => {
    scheduled.push(Number(ms));
    return realSet(fn, 1_000_000);   // never actually fires inside the cell
  }) as typeof globalThis.setInterval;
  globalThis.clearInterval = ((id: unknown) => { cleared.push(id); return realClear(id as never); }) as typeof globalThis.clearInterval;

  const part = { ...ACCEPTED, work_id: PARKED_WORK, client_id: PARKED_CLIENT } as ClaraPart;
  try {
    for (const [status, polls] of [["running", true], ["stopping", true], ["cancelled", false], ["completed", false]] as const) {
      scheduled.length = 0;
      const backend = stubBackend((call) =>
        call.fn === "accounting_work"
          ? { status: 200, body: [{ id: PARKED_WORK, client_id: PARKED_CLIENT, status }] }
          : { status: 404, body: {} });
      const h = await renderComponent(ScopedApp(part, 1));
      try {
        await settleUntil(h, () => backend.calls.some((c) => c.fn === "accounting_work"), "the Work status was read");
        for (let i = 0; i < 6; i += 1) await h.settle();
        assert.equal(scheduled.includes(WORK_CARD_POLL_MS), polls,
          `${status}: the card ${polls ? "converges" : "is finished and schedules nothing"}`);
      } finally {
        await h.unmount();
        backend.restore();
      }
    }
    assert.ok(cleared.length > 0, "…and every interval it did schedule is cleared on unmount");
  } finally {
    globalThis.setInterval = realSet;
    globalThis.clearInterval = realClear;
  }
});
