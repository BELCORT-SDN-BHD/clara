// 裁-20 — the sweep-receipt card's upgrade from an id-only summary to a rich
// hydrated card with the audited `acknowledge_sweep_run` control
// (docs/plan/active/mohe-grill-rulings-2026-08-28.md:268-272).
//
// WHAT A GREEN HERE HAS TO PROVE, beyond "it renders":
//
//   1. THE FIVE COUNTERS ARE THE DB'S, PRINTED — and nothing reconciles them.
//      0108's own comment on `posted_count` says why it is a fourth counter and
//      not a fold into `drafted_count`: folding "would make a posted row
//      indistinguishable from a drafted one in the run summary". A card that
//      summed them, or rendered "N of M", would be doing the very arithmetic the
//      schema split apart (hard constraint 2). The fixture's counters are chosen
//      so that any plausible sum or difference is a DISTINCT number from every
//      counter, and the cell asserts none of those sums appears.
//
//   2. THE ACKNOWLEDGE GATE IS THE DOOR'S OWN, AND IT IS ASSERTED THROUGH
//      `clickButton` — which THROWS on a disabled node. So an open run's cell
//      reads `.disabled` directly (never routing a click through it and hoping
//      nothing happens), and only the finalized cell actually clicks. This is
//      the F6/P3 defect class the guard exists for: a control that RENDERS but
//      never admits a click.
//
//   3. AN OUTCOME THIS BUILD HAS NEVER SEEN STILL RENDERS. `sweep_run_items.
//      outcome`'s CHECK has been WIDENED twice and never narrowed (0108 added
//      `posted`, 0151 added `refused_concurrency`); a card that switched
//      exhaustively on the values it knew would have shipped blind to both.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement, type ReactElement } from "react";
import { NextIntlClientProvider } from "next-intl";
import { clickButton, renderComponent, textOf } from "../../test/hookHarness";
import { enableDomInspection } from "../../test/domInspect";
import { configureSessionTokenSource, resetSessionTokenSource, sessionTokenAccessor } from "../../lib/session-accessor";
import { ThreadActionCoordinatorProvider } from "../../lib/parts/thread-action-coordinator";
import { PartRenderer, FALLBACK_UNSUPPORTED_PREFIX } from "./PartRenderer";
import type { ClaraPart, SweepReceiptPart } from "../../lib/parts/types";
import messages from "../../messages/en.json";

enableDomInspection();

type Stub = Record<string, unknown>;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

type Call = { url: string; body: unknown };
type Seen = { calls: Call[] };
const CALLER_CONTEXT = [{
  user_id: "11111111-1111-4111-8111-111111111111",
  firm_id: "22222222-2222-4222-8222-222222222222",
  firm_name: "BELCORT",
  role: "owner",
  role_rank: 40,
  is_operator: true,
}];

function withMockedEnv(impl: (url: string) => Response, run: (seen: Seen) => Promise<void>): Promise<void> {
  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const seen: Seen = { calls: [] };
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  globalThis.fetch = (async (u: unknown, init?: { body?: unknown }) => {
    const url = String(u);
    let body: unknown = null;
    if (typeof init?.body === "string") {
      try {
        body = JSON.parse(init.body);
      } catch {
        body = init.body;
      }
    }
    seen.calls.push({ url, body });
    if (url.includes("/rest/v1/caller_context")) return jsonResponse(CALLER_CONTEXT);
    return impl(url);
  }) as typeof fetch;
  configureSessionTokenSource(async () => "tok");
  return run(seen).finally(() => {
    globalThis.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
    resetSessionTokenSource();
  });
}

function App(part: ClaraPart): ReactElement {
  return createElement(NextIntlClientProvider, {
    locale: "en",
    messages,
    timeZone: "Asia/Kuala_Lumpur",
    children: createElement(
      ThreadActionCoordinatorProvider,
      { session: sessionTokenAccessor, children: createElement(PartRenderer, { part }) },
    ),
  });
}

/** Poll `h.settle()` (one real macrotask hop) until `condition()` is true,
 *  instead of a FIXED hop count — a guess that only held under whatever load
 *  existed when it was picked. CI's db-estate leg reds this file's own
 *  "surfaces the door's CLR refusal" cell under the estate suite's shared
 *  load (main runs green; a heavier-load run tips a fixed 6-hop wait past
 *  its margin) — the exact class #491/v16-act-cards.test.tsx already
 *  diagnosed and fixed there. Bounded by a real wall-clock timeout so a
 *  genuine regression still reds, named rather than hung. Assertions stay
 *  byte-identical; only the WAITING strategy changes. */
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

const ackButton = (n: Stub) => n.tagName === "BUTTON" && textOf(n).trim() === "Acknowledge this run";

function textWithElementBoundaries(node: Stub): string {
  if (node.nodeType === 3) return String(node.nodeValue ?? "");
  const children = (node.childNodes as Stub[] | undefined) ?? [];
  if (children.length > 0) return children.map(textWithElementBoundaries).join(" ");
  return typeof node.textContent === "string" ? node.textContent : "";
}

const SWEEP: SweepReceiptPart = { type: "sweep_receipt", run_id: "run-3c88" };

/** A FINALIZED run. The five counters are deliberately MULTI-DIGIT and chosen so
 *  that the figures a reconciling UI would produce are long enough not to
 *  collide by accident with anything else on the card (an id, a date, another
 *  counter): 601 + 307 + 71 + 23 = 1002 (the sum of the four outcome counters)
 *  and 1009 - 601 = 408. Neither 1002 nor 408 is itself a counter or a substring
 *  of one, so cell 1 can assert their ABSENCE without accidentally asserting
 *  away a value the card SHOULD print. */
const RUN_FINALIZED = {
  id: "run-3c88",
  firm_id: "firm-1",
  state: "finalized",
  window_started_at: "2026-08-30T00:00:00Z",
  window_ended_at: "2026-08-30T01:00:00Z",
  expected_count: 1009,
  drafted_count: 601,
  posted_count: 307,
  skipped_count: 71,
  refused_count: 23,
  token_reserved: 900,
  token_spent: 850,
  checkpoint_seq: 7,
  acknowledged_by: null,
  acknowledged_at: null,
  created_at: "2026-08-30T00:00:00Z",
  finalized_at: "2026-08-30T01:00:00Z",
};

const ITEMS = [
  {
    run_id: "run-3c88", filing_id: "filing-a1", firm_id: "firm-1", client_id: "client-1", document_id: "doc-1",
    outcome: "drafted", entry_id: "entry-a1", refusal_token: null, tokens_reserved: 50, tokens_spent: 48,
    created_at: "2026-08-30T00:10:00Z",
  },
  {
    // 0151's widening — an outcome that did not exist when the union was first
    // written. It must render as the DB spells it.
    run_id: "run-3c88", filing_id: "filing-b2", firm_id: "firm-1", client_id: "client-1", document_id: "doc-2",
    outcome: "refused_concurrency", entry_id: null,
    refusal_token: { reason: "another sweep held the lane", model_estimated_cents: 424242 },
    tokens_reserved: 0, tokens_spent: 0, created_at: "2026-08-30T00:11:00Z",
  },
];

const detail = (run: unknown, items: unknown[] = ITEMS) => jsonResponse({ run, items });

test("sweep_receipt hydrates get_sweep_run and prints the DB's five counters — never a sum, a difference or an 'N of M'", async () => {
  await withMockedEnv(
    () => detail(RUN_FINALIZED),
    async (seen) => {
      const h = await renderComponent(App(SWEEP));
      try {
        for (let i = 0; i < 5; i++) await h.settle();
        const call = seen.calls.find((c) => c.url.includes("/rest/v1/rpc/get_sweep_run"));
        assert.ok(call, "the card must call get_sweep_run — the ONLY human-reachable read of a sweep run");
        assert.deepEqual(call.body, { p_run: "run-3c88" }, "addressed by the part's own run_id");

        const compactText = h.text();
        const text = textWithElementBoundaries(h.container);
        assert.doesNotMatch(text, new RegExp(FALLBACK_UNSUPPORTED_PREFIX), "sweep_receipt must never reach the unsupported-part chip");
        assert.match(text, /Auto-draft sweep receipt/);
        assert.doesNotMatch(text, /\bnull\b|\bundefined\b/, "absent acknowledgement facts drop their rows instead of becoming text");
        // The five DB columns, each under its OWN label — a stronger claim than
        // "the digits appear somewhere", which a card mislabelling two counters
        // would also satisfy. (`textOf` concatenates with no separator, so a
        // label and its value are adjacent in the rendered text.)
        for (const [label, value] of [
          ["expected", 1009], ["drafted", 601], ["posted", 307], ["skipped", 71], ["refused", 23],
        ] as const) {
          assert.match(compactText, new RegExp(`${label}${value}`), `${label} must render its own DB column's value`);
        }
        // And nothing this UI derived from them. 0108's own comment on
        // posted_count is why: the schema split these apart so a posted row
        // stays distinguishable from a drafted one, and folding them back
        // together in the UI would undo exactly that.
        assert.doesNotMatch(text, /1002/, "the sum of the four outcome counters is a figure only a reconciling UI could produce");
        assert.doesNotMatch(text, /408/, "expected minus drafted, likewise");
        assert.doesNotMatch(text, /of 1009/, "an 'N of M' is a reconciliation the schema deliberately does not make");
      } finally {
        await h.unmount();
      }
    },
  );
});

test("sweep_receipt renders an outcome spelling this build has never seen, as the DB spells it", async () => {
  await withMockedEnv(
    () => detail(RUN_FINALIZED),
    async () => {
      const h = await renderComponent(App(SWEEP));
      try {
        for (let i = 0; i < 5; i++) await h.settle();
        const text = h.text();
        assert.match(text, /drafted/, "a known outcome renders");
        assert.match(text, /refused_concurrency/, "0151's widening must render — the union is open for exactly this reason");
        assert.match(text, /filing-b2/, "the item's filing renders beside its outcome");
        // `refusal_token` is caller-shaped jsonb with no per-outcome schema.
        assert.doesNotMatch(text, /424242/, "a numeral inside `refusal_token` must never reach the screen");
        assert.doesNotMatch(text, /\[object Object\]/);
      } finally {
        await h.unmount();
      }
    },
  );
});

test("sweep_receipt: the acknowledge gate is CLOSED on an open run — the control renders, disabled, with the door's own reason", async () => {
  await withMockedEnv(
    () =>
      detail({
        ...RUN_FINALIZED,
        state: "open",
        window_ended_at: null,
        finalized_at: null,
      }),
    async (seen) => {
      const h = await renderComponent(App(SWEEP));
      try {
        for (let i = 0; i < 5; i++) await h.settle();
        const btn = h.find(ackButton);
        assert.ok(btn, "the control must RENDER while gated — gating shapes, never hides");
        // Asserted DIRECTLY. Routing a click through `clickButton` here would
        // throw by design; a test that means to prove a control is closed reads
        // the gate rather than hoping a click does nothing.
        assert.equal(btn.disabled, true, "acknowledge_sweep_run refuses CLR29 not_finalized — the card mirrors that one precondition");
        assert.match(h.text(), /has not finalized yet/, "the reason is visible beside the disabled control");
        assert.equal(
          seen.calls.find((c) => c.url.includes("acknowledge_sweep_run")),
          undefined,
          "a gated card must never have called the door",
        );
      } finally {
        await h.unmount();
      }
    },
  );
});

test("sweep_receipt: acknowledging a FINALIZED run posts run + op_key, then re-reads to the acknowledged row", async () => {
  let served: unknown = RUN_FINALIZED;
  await withMockedEnv(
    (url) => {
      if (url.includes("/rest/v1/rpc/acknowledge_sweep_run")) {
        served = { ...RUN_FINALIZED, acknowledged_by: "user-tao", acknowledged_at: "2026-08-30T06:00:00Z" };
        return jsonResponse({ ok: true });
      }
      if (url.includes("/rest/v1/rpc/get_sweep_run")) return detail(served);
      throw new Error(`unexpected fetch: ${url}`);
    },
    async (seen) => {
      const h = await renderComponent(App(SWEEP));
      try {
        for (let i = 0; i < 5; i++) await h.settle();

        // ASSERT THE GATE, THEN ACT.
        const btn = h.find(ackButton)!;
        assert.equal(btn.disabled, false, "a finalized, unacknowledged run must admit the act");
        await clickButton(btn);
        for (let i = 0; i < 6; i++) await h.settle();

        const call = seen.calls.find((c) => c.url.includes("/rest/v1/rpc/acknowledge_sweep_run"));
        assert.ok(call, "the door must have been called");
        const body = call.body as Record<string, unknown>;
        assert.equal(body.p_run, "run-3c88", "the subject is the part's own run_id");
        assert.ok(typeof body.p_op_key === "string" && body.p_op_key.length > 0, "the actor-scoped deterministic op_key reaches the door");

        // THE DISCRIMINATING POST-CONDITION — facts that exist only on the
        // re-read row, plus the control now closed against a second act.
        const after = h.text();
        assert.match(after, /user-tao/, "acknowledged_by is only on the post-act row");
        assert.match(after, /already been acknowledged/, "the card says why it will not act again");
        assert.equal(h.find(ackButton)!.disabled, true, "the live body is idempotent here, so offering the act again would be offering a no-op");
      } finally {
        await h.unmount();
      }
    },
  );
});

test("sweep_receipt surfaces the door's CLR refusal verbatim and keeps the run on screen", async () => {
  await withMockedEnv(
    (url) => {
      if (url.includes("/rest/v1/rpc/acknowledge_sweep_run")) {
        // The door's own agent-identity arm (0011:2790-2793) — a verdict only
        // the DB can reach, which is exactly why the card never guesses it.
        return jsonResponse({ code: "CLR03", message: "agent identity cannot acknowledge a sweep" }, 400);
      }
      if (url.includes("/rest/v1/rpc/get_sweep_run")) return detail(RUN_FINALIZED);
      throw new Error(`unexpected fetch: ${url}`);
    },
    async () => {
      const h = await renderComponent(App(SWEEP));
      try {
        await settleUntil(h, () => h.find(ackButton) != null, "the finalized run to hydrate and reveal its Acknowledge control");
        await clickButton(h.find(ackButton)!);
        await settleUntil(h, () => /CLR03/.test(h.text()), "the CLR03 refusal to render after the acknowledge attempt");
        const after = h.text();
        assert.match(after, /CLR03/, "the CLR code renders");
        assert.match(after, /agent identity cannot acknowledge a sweep/, "the door's own message renders verbatim, never re-worded");
        // Sticky across the re-read the failure itself triggers: the row still
        // reads fine, and a read succeeding must not erase the write's refusal.
        assert.match(after, /Auto-draft sweep receipt/, "the run is still real and stays on screen");
      } finally {
        await h.unmount();
      }
    },
  );
});

test("sweep_receipt renders 'not visible' when get_sweep_run returns null for this session — never a fabricated run", async () => {
  await withMockedEnv(
    // The live body returns SQL NULL for a run of another firm (0011:3585-3594).
    () => jsonResponse(null),
    async () => {
      const h = await renderComponent(App(SWEEP));
      try {
        for (let i = 0; i < 5; i++) await h.settle();
        const text = h.text();
        assert.match(text, /not visible to your session/, "a null return is the DB's honest answer, not an error it never raised");
        assert.doesNotMatch(text, /Reading the latest/, "and it must SETTLE — a spinner here would be a permanent lie");
        assert.equal(h.find(ackButton), null, "no run means no act");
      } finally {
        await h.unmount();
      }
    },
  );
});

test("sweep_receipt with a BLANK run_id fails closed: a visible notice, and NO request is ever made", async () => {
  await withMockedEnv(
    () => {
      throw new Error("no request may be made for an unaddressable part");
    },
    async (seen) => {
      const h = await renderComponent(App({ ...SWEEP, run_id: "" }));
      try {
        for (let i = 0; i < 4; i++) await h.settle();
        assert.deepEqual(seen.calls.filter((call) => !call.url.includes("/caller_context")), [], "an unaddressable part must never issue an object request");
        assert.match(h.text(), /could not be opened/);
        assert.match(h.text(), /run_id/);
      } finally {
        await h.unmount();
      }
    },
  );
});
