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

import { renderComponent, clickButton, textOf } from "../../test/hookHarness";
import { enableDomInspection } from "../../test/domInspect";
import { configureSessionTokenSource, resetSessionTokenSource } from "../../lib/session-accessor";
import { PartRenderer, FALLBACK_UNSUPPORTED_PREFIX } from "./PartRenderer";
import { FirmScopeProvider } from "../firm-scope-provider";
import { WORK_CARD_POLL_MS, onWorkDetailRoute } from "./WorkCards";
import type { ClaraPart } from "../../lib/parts/types";
import messages from "../../messages/en.json";

enableDomInspection();

// #839 (fix round) — THE ONE LIVE HANDLE THIS FILE HAS TO REFUSE. `getSessionIdentity()` builds the
// app's REAL `@supabase/ssr` browser client (see `stubBackend`'s anon-key note), and auth-js opens a
// `BroadcastChannel` — the channel a real browser uses to tell its OTHER TABS that this one signed
// in or out — as soon as that client initialises, and never closes it. Node 22 has that global, and
// its implementation is a `MessagePort` that keeps the event loop alive: measured, the file ran
// 16/16 cells green and then never exited, which is a HANG of the whole suite rather than a failure
// in it. A node cell is one tab; it has no siblings to tell. So auth-js is handed an inert channel,
// and the `@supabase/ssr` singleton it caches for the rest of the process holds THAT.
class InertBroadcastChannel {
  onmessage: unknown = null;
  onmessageerror: unknown = null;
  constructor(readonly name: string) {}
  postMessage(): void {}
  addEventListener(): void {}
  removeEventListener(): void {}
  close(): void {}
}
(globalThis as Record<string, unknown>).BroadcastChannel = InertBroadcastChannel;

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
  const originalKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  // #839 (fix round) — AND THE ANON KEY. `getSessionIdentity()` calls `createClient()`, which
  // hands both env values to `createBrowserClient`; with the key missing the constructor THROWS,
  // the panel's whole hydrate rejects, and every cell below reached the door-unreachable arm no
  // matter what the door answered. Supplying a placeholder key lets that read resolve to "no
  // session" — the honest harness state, and the one arm the restate control has to survive.
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = originalKey ?? "test-anon-key";
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
      if (originalKey === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = originalKey;
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
      // #643/#644 (wave-3 integration) — the purpose is now LABELLED, through the one mapping in
      // lib/work/purpose-label.ts, rather than rendered as the column's own token. The raw token
      // still appears on this card, but only inside the logical operation identity below.
      assert.match(text, /Journal entry/, "the purpose reads as a label");
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

// #643/#644 (wave-3 integration, v19 review NOTE-3) — THE PURPOSE LABEL ON THIS CARD.
//
// WHAT WENT WRONG WITHOUT IT. chatTurn_v19's `start_periodic_adjustment_work` admits Work whose
// purpose is `periodic_stock_adjustment` or `payroll_obligation` (migration 0194). This card
// rendered `part.purpose` raw, so the SAME Work read "payroll_obligation" in the transcript and
// "Supplied payroll obligation" on its own detail page and on the journals row — the exact defect
// `lib/work/purpose-label.ts`'s header was written to prevent, arriving through a surface that
// module had no caller on.
//
// AND THE RULE THE MODULE KEEPS: an UNKNOWN purpose renders VERBATIM. A build that has not learned
// a value shows the value rather than crashing on a missing key or inventing a label — the posture
// `basis_origin` takes on the same pages. That half is asserted here too, because it is the half a
// naive `t(\`purpose${camel(p)}\`)` would have broken.
test("work_accepted labels EVERY purpose 0194 admits, and renders an unknown one verbatim", async () => {
  const cases: ReadonlyArray<readonly [string, string]> = [
    ["journal_entry", "Journal entry"],
    ["periodic_stock_adjustment", "Periodic stock adjustment"],
    ["payroll_obligation", "Supplied payroll obligation"],
  ];
  for (const [purpose, label] of cases) {
    const backend = stubBackend((call) => (call.fn === "accounting_work" ? { status: 200, body: [] } : { status: 404, body: {} }));
    try {
      const h = await renderComponent(App({ ...ACCEPTED, purpose, logical_op_id: `work:work-1:${purpose}:1` } as ClaraPart));
      try {
        await settleUntil(h, () => backend.calls.some((c) => c.fn === "accounting_work"), "the Work status was read");
        await h.settle();
        assert.match(h.text(), new RegExp(label), `${purpose} reads as "${label}"`);
      } finally {
        await h.unmount();
      }
    } finally {
      backend.restore();
    }
  }

  // …AND THE FOURTH VALUE THIS BUILD HAS NOT LEARNED. `clara.accounting_work.purpose`'s CHECK can
  // widen before this file does; when it does, the reader sees the database's word, not a crash.
  const backend = stubBackend((call) => (call.fn === "accounting_work" ? { status: 200, body: [] } : { status: 404, body: {} }));
  try {
    const h = await renderComponent(
      App({ ...ACCEPTED, purpose: "some_future_purpose", logical_op_id: "work:work-1:some_future_purpose:1" } as ClaraPart),
    );
    try {
      await settleUntil(h, () => backend.calls.some((c) => c.fn === "accounting_work"), "the Work status was read");
      await h.settle();
      assert.match(h.text(), /some_future_purpose/, "an unregistered purpose renders verbatim");
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
  //
  // AND THE BODY IS RUN, not merely scheduled (review round 2). A spy that recorded only the DELAY
  // passed on `setInterval(() => {}, WORK_CARD_POLL_MS)` — a card that schedules an empty tick and
  // never converges past `stopping`, which is the exact defect this cell is named for. The
  // callbacks are captured and fired by hand, and the assertion is that the Work was RE-READ.
  const scheduled: number[] = [];
  const ticks: Array<() => void> = [];
  const cleared: unknown[] = [];
  const realSet = globalThis.setInterval;
  const realClear = globalThis.clearInterval;
  globalThis.setInterval = ((fn: () => void, ms?: number) => {
    scheduled.push(Number(ms));
    ticks.push(fn);
    return realSet(fn, 1_000_000);   // never fires on its own inside the cell
  }) as typeof globalThis.setInterval;
  globalThis.clearInterval = ((id: unknown) => { cleared.push(id); return realClear(id as never); }) as typeof globalThis.clearInterval;

  const part = { ...ACCEPTED, work_id: PARKED_WORK, client_id: PARKED_CLIENT } as ClaraPart;
  try {
    for (const [status, polls] of [["running", true], ["stopping", true], ["cancelled", false], ["completed", false]] as const) {
      scheduled.length = 0;
      ticks.length = 0;
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
        if (polls) {
          const before = backend.calls.filter((c) => c.fn === "accounting_work").length;
          // A SNAPSHOT of the callbacks, never the live array: each re-render re-registers the
          // interval, so iterating the array itself would keep firing bodies the loop is creating.
          await h.act(async () => {
            for (const tick of [...ticks]) tick();
            await new Promise((r) => setTimeout(r, 0));
          });
          for (let i = 0; i < 4; i += 1) await h.settle();
          assert.ok(backend.calls.filter((c) => c.fn === "accounting_work").length > before,
            `${status}: the tick RE-READ the Work — an interval that schedules an empty body is not `
            + "convergence, and that is what this cell used to accept");
        }
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

/** The dialog is PORTALLED to `document.body`, which this card's container never reaches — so the
 *  search walks the body, exactly as work-cancel-dialog.test.tsx does. */
function bodyNode(): Stub {
  return (globalThis as unknown as { document: { body: Stub } }).document.body;
}

function findInBody(predicate: (n: Stub) => boolean): Stub | null {
  const walk = (n: Stub): Stub | null => {
    if (predicate(n)) return n;
    for (const c of ((n.childNodes as Stub[] | undefined) ?? [])) {
      const found = walk(c);
      if (found) return found;
    }
    return null;
  };
  return walk(bodyNode());
}

test("630 the rail card's poll never unmounts an OPEN cancel decision", async () => {
  // MEASURED SHAPE (review): the three-second re-read the cell above pins is also what can take
  // `cancellable` false while a bookkeeper is reading the confirmation — a colleague cancelling from
  // the Work detail page, or the run settling on its own. The open modal then unmounted with no
  // dismissal, focus was lost, and the `lost`/`unavailable` retry arm (which deliberately keeps the
  // dialog AND its op key) was destroyed the same way. While the modal is open it stays mounted
  // whatever the status says; the DOOR is still the authority on what the confirm does.
  let status = "running";
  const ticks: Array<() => void> = [];
  const realSet = globalThis.setInterval;
  globalThis.setInterval = ((fn: () => void) => {
    ticks.push(fn);
    return realSet(fn, 1_000_000);
  }) as typeof globalThis.setInterval;
  const part = { ...ACCEPTED, work_id: PARKED_WORK, client_id: PARKED_CLIENT } as ClaraPart;
  const backend = stubBackend((call) =>
    call.fn === "accounting_work"
      ? { status: 200, body: [{ id: PARKED_WORK, client_id: PARKED_CLIENT, status }] }
      : { status: 404, body: {} });
  const h = await renderComponent(ScopedApp(part, 1));
  try {
    (bodyNode() as { appendChild: (n: unknown) => void }).appendChild(h.container);
    await settleUntil(h, () => backend.calls.some((c) => c.fn === "accounting_work"), "the Work status was read");
    for (let i = 0; i < 6; i += 1) await h.settle();
    const trigger = findInBody((n) => n.tagName === "BUTTON" && textOf(n as never).trim() === "Cancel Work");
    assert.ok(trigger, "precondition: a running Work is cancellable from the rail");
    await h.act(async () => { await clickButton(trigger as never); });
    for (let i = 0; i < 4; i += 1) await h.settle();
    assert.match(textOf(bodyNode() as never), /Cancel this Work\?/, "precondition: the decision is open");

    // …and now the row settles under them, on the card's own poll.
    status = "cancelled";
    await h.act(async () => {
      for (const tick of [...ticks]) tick();
      await new Promise((r) => setTimeout(r, 0));
    });
    for (let i = 0; i < 6; i += 1) await h.settle();
    assert.match(textOf(bodyNode() as never), /Cancel this Work\?/,
      "the open decision is still on screen: a poll must not destroy a modal somebody is reading");
  } finally {
    globalThis.setInterval = realSet;
    await h.unmount();
    backend.restore();
  }
});

// #839 (fix round, review finding L09-ADV-05) ------------------------------------------------
// THE RAIL IS MOUNTED ON THE WORK DETAIL ROUTE. `app/(firm)/layout.tsx` renders `<RailMount />`
// for the whole group and the Work detail page is inside it, so a card that offered restate
// unconditionally put a SECOND restate control beside the one `work-detail.tsx` already mounts.
// The decision is a pure function for the reason `offersRestateFor` is one: `useParams()` is an
// App-Router context read this harness has no seam for.
test("839 onWorkDetailRoute: the rail knows when it is sitting on the Work's own detail page", () => {
  const WORK_ID = "11111111-1111-4111-8111-111111111111";
  assert.equal(onWorkDetailRoute({ workId: WORK_ID, clientId: "c" }, WORK_ID), true,
    "same work in the route segment: B3 already offers restate here");
  assert.equal(onWorkDetailRoute({ workId: "22222222-2222-4222-8222-222222222222" }, WORK_ID), false,
    "a DIFFERENT Work's detail page is not this card's page");
  assert.equal(onWorkDetailRoute({ clientId: "c" }, WORK_ID), false,
    "no work segment at all: an ordinary (firm) route, where the rail is the only offer");
  assert.equal(onWorkDetailRoute(null, WORK_ID), false,
    "outside the router entirely (a node cell), the rail is the only offer");
  assert.equal(onWorkDetailRoute({ workId: [WORK_ID] }, WORK_ID), true,
    "a catch-all segment arrives as an array, and its first element is still the id");
  assert.equal(onWorkDetailRoute({ workId: WORK_ID }, ""), false,
    "an unaddressable part never matches a real route segment");
});

// #839 (fix round) — THE RENDER PROOF AC2 ASKS FOR, AND THE TWO GATES AC3 NEEDS ----------------
//
// AC2 is "a cell proves the rail's affordance OFFERS the restate action". Round 1 proved only the
// pure predicate and a direct `RestateWorkPanel` mount, because `WorkQuestionPanel` would not
// render anything at all until `getSessionIdentity()` resolved — a real `@supabase/ssr` browser
// read this harness has no seam for (see this file's own header). Restating never needed that
// read: it needs the question RECORD and the caller's session token, so the offer now renders on
// every arm of the panel that has a record, and these cells drive the REAL card.
//
// The door is made to ANSWER here (unlike the "PARKED mounts the panel" cell above, which makes it
// fail on purpose): a record carrying the Work's admitted `basis` (migration 0265) is exactly the
// input `offersRestateFor` reads, and the identity read still comes back empty, which is precisely
// the arm that used to swallow the control.

/** `clara.get_work_pending_question`'s own row shape, enough of it for the restate gate. */
function pendingQuestionWire(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    question_id: "33333333-3333-4333-8333-333333333333",
    work_id: PARKED_WORK,
    client_id: PARKED_CLIENT,
    task_id: "44444444-4444-4444-8444-444444444444",
    firm_id: "55555555-5555-4555-8555-555555555555",
    question_version: 1,
    status: "pending",
    question: "Which date should this post on?",
    context: null,
    reason: null,
    fields: [],
    source_ref: null,
    basis_digest: "d",
    expires_at: "2026-09-15T00:00:00.000Z",
    created_at: "2026-09-01T00:00:00.000Z",
    answer: null,
    answered_by: null,
    answered_at: null,
    answered_role: null,
    delivery_state: "pending",
    delivery_attempts: 0,
    work_status: "awaiting_input",
    work_basis_digest: "d",
    basis: {
      posting_date: "2026-09-01",
      memo: "Office rent, September",
      currency: "MYR",
      lines: [
        { account_code: "6100", debit_cents: 120_000, credit_cents: 0, description: "rent" },
        { account_code: "1100", debit_cents: 0, credit_cents: 120_000, description: null },
      ],
    },
    ...over,
  };
}

function parkedBackend(question: Record<string, unknown> | null = pendingQuestionWire()): ReturnType<typeof stubBackend> {
  return stubBackend((call) => {
    if (call.fn === "accounting_work") {
      return { status: 200, body: [{ id: PARKED_WORK, client_id: PARKED_CLIENT, status: "awaiting_input" }] };
    }
    if (call.fn === "get_work_pending_question" || call.fn === "get_work_question") {
      return { status: 200, body: question };
    }
    return { status: 404, body: {} };
  });
}

/** Every node carrying `data-testid="id"`, in document order — AC3 is a COUNT, not a presence. */
function allByTestId(container: Stub, id: string): Stub[] {
  const out: Stub[] = [];
  const walk = (n: Stub) => {
    if ((n as { getAttribute?: (k: string) => string | null }).getAttribute?.("data-testid") === id) out.push(n);
    for (const c of (n.childNodes as Stub[] | undefined) ?? []) walk(c);
  };
  walk(container);
  return out;
}

test("839 (AC2) a parked work_accepted card RENDERS the restate control for a bookkeeper", async () => {
  const backend = parkedBackend();
  try {
    const h = await renderComponent(ScopedApp(PARKED, 1));
    try {
      await settleUntil(
        h,
        () => byTestId(h.container, "work-restate") !== null,
        "the rail card offers Restate as a new instruction once the record carries a basis",
      );
      const submit = byTestId(h.container, "work-restate-submit");
      assert.ok(submit, "…as a real control, not a sentence");
      assert.match(h.text(), /Restate as a new instruction/);
      // §5, one announcement owner: the transcript already has one.
      assert.deepEqual(liveRegions(h.container), []);
    } finally {
      await h.unmount();
    }
  } finally {
    backend.restore();
  }
});

test("839 (fix round, L09-ADV-06) the SAME card withholds restate below the bookkeeper floor", async () => {
  // `clara.restate_accounting_work` reaches `clara._work_door_ctx`, which raises CLR04 for a lower
  // rank — the identical floor this card already applies to Cancel Work, with the identical
  // argument: a destructive control shown to people who can never use it is a 403 dressed as an
  // affordance. A restatement cancels the Work, so it is at least as destructive as that one.
  //
  // THE ABSENCE IS THE SAME WAIT AS THE CELL ABOVE, INVERTED, rather than a fixed number of hops:
  // the cell above measures the control appearing in ~20ms, so a viewer's card is settled for 75
  // TIMES that and the control must never appear. (A blind `await h.settle()` or two would be the
  // weaker shape twice over: it could assert an absence the hydrate had simply not reached yet,
  // and against a subject that DOES offer the control it hangs instead of failing — this harness
  // cannot keep settling once base-ui's `<Textarea>` inside `RestateWorkPanel` is mounted.)
  const backend = parkedBackend();
  try {
    const h = await renderComponent(ScopedApp(PARKED, 0));
    try {
      await assert.rejects(
        settleUntil(h, () => byTestId(h.container, "work-restate") !== null,
          "a restate control a viewer must never be offered", 1_500),
        /timed out/,
        "a viewer is offered no restate control at all",
      );
      // …AND THE CARD REALLY DID HYDRATE, so that absence is measured rather than a card that
      // never got as far as deciding: the panel read the question door for THIS Work.
      assert.ok(backend.calls.some((c) => c.fn === "get_work_pending_question" && c.body.p_work === PARKED_WORK),
        "positive control: the question door was read, so the panel had its record and withheld the offer");
      assert.match(h.text(), /Clara accepted/, "…and the card itself is on screen");
    } finally {
      await h.unmount();
    }
  } finally {
    backend.restore();
  }
});

test("839 (AC3) a transcript carrying BOTH work cards for one Work offers EXACTLY ONE restate control", async () => {
  // THE DUPLICATE AC3 FORBIDS, driven rather than argued. `work_accepted` is durable and
  // `work_question` is the live-stream face of the SAME Work in the SAME conversation, and before
  // this both mounted a restate control on exactly the same condition (a Work parked on a pending
  // question). The durable card is the one owner.
  const questionPart: ClaraPart = {
    type: "work_question",
    work_id: PARKED_WORK,
    client_id: PARKED_CLIENT,
    question_id: "33333333-3333-4333-8333-333333333333",
    question_version: 1,
    status: "pending",
  } as ClaraPart;
  const backend = parkedBackend();
  try {
    const h = await renderComponent(createElement(NextIntlClientProvider, {
      locale: "en",
      messages,
      timeZone: "Asia/Kuala_Lumpur",
      children: createElement(FirmScopeProvider, {
        scope: { role_rank: 1, is_operator: false } as never,
        children: createElement(
          "div",
          null,
          createElement(PartRenderer, { part: PARKED }),
          createElement(PartRenderer, { part: questionPart }),
        ),
      }),
    }));
    try {
      await settleUntil(
        h,
        () => allByTestId(h.container, "work-restate").length > 0,
        "the durable card's restate control appears",
      );
      await h.settle();
      await h.settle();
      assert.equal(allByTestId(h.container, "work-restate").length, 1,
        "exactly one restate control for one Work, however many cards describe it");
    } finally {
      await h.unmount();
    }
  } finally {
    backend.restore();
  }
});
