// components/clara/OnboardingChecklistCard.tsx — render-state tests. Pins the
// N/N counter as a DB-read fact (a fixture where completed !== total, both
// values traced to the mocked read, never a client-computed percentage — the
// MUTANT this kills: freezing the counter to a constant), the resolve door's
// per-row visibility (the MUTANT this kills: hiding the door for a pending
// item), and the three top-level shapes (begin-only at firm altitude,
// bootstrap-eligible, full plan).

import { test } from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { NextIntlClientProvider } from "next-intl";
import { CLIENT_RECORD_CHANGED_EVENT } from "../../lib/command/bus";
import { clickButton, renderComponent, textOf } from "../../test/hookHarness";
import { enableDomInspection } from "../../test/domInspect";
import { configureSessionTokenSource, resetSessionTokenSource, sessionTokenAccessor } from "../../lib/session-accessor";
import messages from "../../messages/en.json";
import { OnboardingChecklistCard } from "./OnboardingChecklistCard";

enableDomInspection();

// H-50 — `test/hookHarness.ts` stubs a minimal `window` whose three event methods are NO-OPS,
// which is fine for a component that never listens. This file asserts a real dispatch/listen
// round trip on `CLIENT_RECORD_CHANGED`, so the stub's methods are swapped for a real
// `EventTarget`'s — same object identity, real behaviour. Exactly the swap
// `tests/focusRailSubscription.test.mjs` already makes for the sibling focus-rail event, and
// without it a "no event was announced" assertion would pass because NOTHING can be announced,
// which is the absence-from-the-wrong-instrument class rather than a measurement.
const realEventTarget = new EventTarget();
globalThis.window.addEventListener = realEventTarget.addEventListener.bind(realEventTarget);
globalThis.window.removeEventListener = realEventTarget.removeEventListener.bind(realEventTarget);
globalThis.window.dispatchEvent = realEventTarget.dispatchEvent.bind(realEventTarget);

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

function App(children: ReturnType<typeof createElement>) {
  return createElement(NextIntlClientProvider, { locale: "en", messages, children });
}

const PLAN = {
  id: "plan-1", firm_id: "f1", scope_kind: "client", client_id: "c1", state: "open",
  revision_token: "rev-1", revision_n: 1, committed_at: null, committed_by: null,
  review_maker: "u1", reviewed_at: "2026-08-01T00:00:00Z", contributors: ["u1"],
  commit_attestation: null, cancelled_at: null, cancelled_by: null, cancel_reason: null,
  created_at: "2026-08-01T00:00:00Z", updated_at: "2026-08-01T00:00:00Z",
  opened_by_agent: false, opener_model: null, opened_from_question: null,
};

// A fixture where completed !== total — 2 of 5 — so a frozen "0 / 0" or a
// frozen "N / N" mutant is caught either way.
const ITEMS_2_OF_5 = [
  { id: "i1", plan_id: "plan-1", firm_id: "f1", item_kind: "must_ask", item_key: "legal_name", question: "Legal name", answer: "Rome Public Advisory", state: "answered", required_for_commit: true, answered_by: "u1", answered_at: "2026-08-01T00:00:00Z", created_at: "2026-08-01T00:00:00Z", updated_at: "2026-08-01T00:00:00Z" },
  { id: "i2", plan_id: "plan-1", firm_id: "f1", item_kind: "must_ask", item_key: "entity_type", question: "Entity type", answer: "sdn_bhd", state: "resolved", required_for_commit: true, answered_by: "u1", answered_at: "2026-08-01T00:00:00Z", created_at: "2026-08-01T00:00:00Z", updated_at: "2026-08-01T00:00:00Z" },
  { id: "i3", plan_id: "plan-1", firm_id: "f1", item_kind: "must_ask", item_key: "fye", question: "Financial year end", answer: null, state: "pending", required_for_commit: true, answered_by: null, answered_at: null, created_at: "2026-08-01T00:00:00Z", updated_at: "2026-08-01T00:00:00Z" },
  { id: "i4", plan_id: "plan-1", firm_id: "f1", item_kind: "capture", item_key: "opening_position", question: "Opening position", answer: null, state: "pending", required_for_commit: false, answered_by: null, answered_at: null, created_at: "2026-08-01T00:00:00Z", updated_at: "2026-08-01T00:00:00Z" },
  { id: "i5", plan_id: "plan-1", firm_id: "f1", item_kind: "todo", item_key: "coa_seed", question: "Chart of accounts seed", answer: null, state: "pending", required_for_commit: false, answered_by: null, answered_at: null, created_at: "2026-08-01T00:00:00Z", updated_at: "2026-08-01T00:00:00Z" },
];

const NO_GAPS = {
  "/rest/v1/clients": [{ id: "c1", name: "Rome Public Advisory", status: "onboarding" }],
  // F2 fix: loadClientOnboarding always reads opening_seed_registry once a
  // plan exists — none of these fixtures exercise the commit gate, so an
  // empty (not-finalized) answer is correct and irrelevant to what each
  // test actually asserts.
  "/rest/v1/opening_seed_registry": [],
};

function mockFetch(planItemsOverride?: unknown[], planOverride?: Record<string, unknown>) {
  const impl = (async (url: RequestInfo | URL) => {
    const u = String(url);
    if (u.includes("/rest/v1/onboarding_plans")) return jsonResponse([planOverride ?? PLAN]);
    if (u.includes("/rest/v1/onboarding_plan_items")) return jsonResponse(planItemsOverride ?? ITEMS_2_OF_5);
    for (const [path, body] of Object.entries(NO_GAPS)) if (u.includes(path)) return jsonResponse(body);
    throw new Error(`unexpected fetch: ${u}`);
  }) as typeof fetch;
  return impl;
}

/** Every BUTTON in the tree whose visible text is exactly `label`. */
function buttonsLabelled(root: unknown, label: string): unknown[] {
  const hits: unknown[] = [];
  const walk = (n: { tagName?: string; childNodes?: unknown[] }) => {
    if (n.tagName === "BUTTON" && textOf(n as never) === label) hits.push(n);
    for (const c of n.childNodes ?? []) walk(c as never);
  };
  walk(root as never);
  return hits;
}

/** The OPEN dialog's own controls live on `document.body`, not in the mount container: Base UI
 *  portals open dialog content out of the render root (apps/web/AGENTS.md's first dialog law).
 *  A search of `h.container` alone finds only the trigger, which is why every dialog cell here
 *  walks the body and excludes the trigger BY IDENTITY. */
function dialogNode(predicate: (n: { tagName?: string }) => boolean): unknown {
  const walk = (n: { tagName?: string; childNodes?: unknown[] }): unknown => {
    if (predicate(n)) return n;
    for (const c of n.childNodes ?? []) {
      const hit = walk(c as never);
      if (hit) return hit;
    }
    return null;
  };
  return walk(document.body as never);
}

/** Opens the Commit dialog and returns its own Confirm control, distinct from the trigger by
 *  IDENTITY (the exclusion idiom the keyboard battery already uses: both carry the same text). */
async function openCommitDialog(h: { container: unknown; settle: () => Promise<void> }): Promise<unknown> {
  const trigger = buttonsLabelled(h.container, "Commit onboarding")[0];
  assert.ok(trigger, "the Commit trigger must still RENDER on a live plan (gating shapes, never hides)");
  await clickButton(trigger as never);
  for (let i = 0; i < 4; i++) await h.settle();
  const confirm = dialogNode((n) => n.tagName === "BUTTON" && textOf(n as never) === "Commit onboarding" && (n as unknown) !== trigger);
  assert.ok(confirm, "the dialog's own Confirm control must render, distinct from the trigger");
  return confirm;
}

async function mount(clientId?: string) {
  const h = await renderComponent(App(createElement(OnboardingChecklistCard, { clientId, session: sessionTokenAccessor })));
  for (let i = 0; i < 5; i++) await h.settle();
  return h;
}

test("the N/N counter reads '2 / 5' from a DB fixture where completed !== total — both values DB-read, never a fabricated percentage (freeze-the-counter mutant)", async () => {
  await withMockedEnv(mockFetch(), async () => {
    const h = await mount("c1");
    try {
      assert.match(h.text(), /2\s*\/\s*5/, `expected the exact completed/total pair from the fixture; got: ${h.text()}`);
      assert.doesNotMatch(h.text(), /%/, "the counter must never render a percentage");
    } finally {
      await h.unmount();
    }
  });
});

test("the counter tracks a DIFFERENT completed/total pair when the fixture changes — proves it is DERIVED, not a hardcoded string", async () => {
  const allPending = ITEMS_2_OF_5.map((i) => ({ ...i, state: "pending", answered_by: null, answered_at: null }));
  await withMockedEnv(mockFetch(allPending), async () => {
    const h = await mount("c1");
    try {
      assert.match(h.text(), /0\s*\/\s*5/, `expected 0 / 5 once every item is pending; got: ${h.text()}`);
    } finally {
      await h.unmount();
    }
  });
});

test("the Resolve door renders for a PENDING item row (hide-the-door mutant)", async () => {
  await withMockedEnv(mockFetch(), async () => {
    const h = await mount("c1");
    try {
      const resolveTriggers = [] as unknown[];
      const walk = (n: { tagName?: string; childNodes?: unknown[] }) => {
        if (n.tagName === "BUTTON" && textOf(n as never) === "Resolve") resolveTriggers.push(n);
        for (const c of n.childNodes ?? []) walk(c as never);
      };
      walk(h.container as never);
      assert.equal(resolveTriggers.length, ITEMS_2_OF_5.length, "every item row (pending or not) must render its own Resolve trigger — gating shapes, never hides");
    } finally {
      await h.unmount();
    }
  });
});

test("firm altitude (no clientId): renders the Begin-onboarding affordance, with NO onboarding-plan read at all", async () => {
  const impl = (async (url: RequestInfo | URL) => {
    throw new Error(`unexpected fetch at firm altitude: ${String(url)}`);
  }) as typeof fetch;
  await withMockedEnv(impl, async () => {
    const h = await mount(undefined);
    try {
      assert.match(h.text(), /Begin client onboarding/);
    } finally {
      await h.unmount();
    }
  });
});

// ===========================================================================================
// H-26 / H-28 — structured answers, and the internal binding row.
// ===========================================================================================

/** The plan the LIVE interview actually writes: a binding row plus object answers. */
const INTERVIEW_ITEMS = [
  { id: "b1", plan_id: "plan-1", firm_id: "f1", item_kind: "capture", item_key: "interview_run", question: null, answer: { run_id: "run-9" }, state: "answered", required_for_commit: false, answered_by: "u1", answered_at: "2026-08-01T00:00:00Z", created_at: "2026-08-01T00:00:00Z", updated_at: "2026-08-01T00:00:00Z" },
  { id: "s1", plan_id: "plan-1", firm_id: "f1", item_kind: "must_ask", item_key: "ssm", question: "Registration number", answer: { registration: "202401047756", normalized: "202401047756", form: "unified", format_verified: true }, state: "answered", required_for_commit: true, answered_by: "u1", answered_at: "2026-08-01T00:00:00Z", created_at: "2026-08-01T00:00:00Z", updated_at: "2026-08-01T00:00:00Z" },
  { id: "s2", plan_id: "plan-1", firm_id: "f1", item_kind: "must_ask", item_key: "coa_seed_decision", question: "Chart of accounts", answer: { seed: "firm_template" }, state: "answered", required_for_commit: true, answered_by: "u1", answered_at: "2026-08-01T00:00:00Z", created_at: "2026-08-01T00:00:00Z", updated_at: "2026-08-01T00:00:00Z" },
  { id: "s3", plan_id: "plan-1", firm_id: "f1", item_kind: "must_ask", item_key: "fye", question: "Financial year end", answer: null, state: "pending", required_for_commit: true, answered_by: null, answered_at: null, created_at: "2026-08-01T00:00:00Z", updated_at: "2026-08-01T00:00:00Z" },
];

test("H-26 — a structured (object) answer renders as prose: no '[object Object]' and no JSON braces anywhere on the card", async () => {
  await withMockedEnv(mockFetch(INTERVIEW_ITEMS), async () => {
    const h = await mount("c1");
    try {
      const text = h.text();
      assert.doesNotMatch(text, /\[object Object\]/, `the whole defect, asserted on the rendered DOM; got: ${text}`);
      assert.doesNotMatch(text, /\{"/, `no raw JSON may reach the face; got: ${text}`);
      // DISCRIMINATING: this sentence exists only because the formatter recognised the shape.
      assert.match(text, /Registration 202401047756 — format checked/, `got: ${text}`);
      assert.match(text, /firm's standard chart of accounts/, `got: ${text}`);
    } finally {
      await h.unmount();
    }
  });
});

test("H-28 — the internal `interview_run` binding row is neither rendered nor counted (it used to make the header read '1 / 1')", async () => {
  await withMockedEnv(mockFetch(INTERVIEW_ITEMS), async () => {
    const h = await mount("c1");
    try {
      const text = h.text();
      assert.doesNotMatch(text, /interview_run/, `the binding row is not a question anyone answered; got: ${text}`);
      // Three real items, two settled — NOT 3 / 4, which is what counting the binding row gives.
      assert.match(text, /2\s*\/\s*3/, `got: ${text}`);
    } finally {
      await h.unmount();
    }
  });
});

// ===========================================================================================
// CB-AE2E-023 — the settled receipt.
// ===========================================================================================

const COMMITTED_PLAN = {
  ...PLAN,
  state: "committed",
  revision_n: 7,
  committed_at: "2026-09-04T02:00:00Z",
  committed_by: "u-committer",
  commit_attestation: "Sole practitioner; reviewed against the certificate.",
};

test("CB-AE2E-023 — a COMMITTED plan renders no Commit and no Cancel trigger, and does render committed_at/committed_by", async () => {
  await withMockedEnv(mockFetch(ITEMS_2_OF_5, COMMITTED_PLAN), async () => {
    const h = await mount("c1");
    try {
      assert.equal(buttonsLabelled(h.container, "Commit onboarding").length, 0, "a Commit trigger on a committed plan can only open a dialog the DB refuses");
      assert.equal(buttonsLabelled(h.container, "Cancel onboarding").length, 0, "and so can a Cancel trigger");
      const text = h.text();
      assert.match(text, /Committed by/, `the receipt names who committed it; got: ${text}`);
      assert.match(text, /u-committer/, `got: ${text}`);
      assert.match(text, /Sole practitioner; reviewed against the certificate\./, "commit_attestation was read and rendered nowhere before this");
      assert.match(text, /Plan revision/, `got: ${text}`);
    } finally {
      await h.unmount();
    }
  });
});

test("CB-AE2E-023 — the settled receipt COLLAPSES the item list behind a disclosure, and the disclosure opens it", async () => {
  await withMockedEnv(mockFetch(ITEMS_2_OF_5, COMMITTED_PLAN), async () => {
    const h = await mount("c1");
    try {
      assert.doesNotMatch(h.text(), /Rome Public Advisory/, "the answers start collapsed");
      const toggle = h.find((n) => (n as { tagName?: string }).tagName === "BUTTON" && /Show the 5 recorded answers/.test(textOf(n)));
      assert.ok(toggle, `expected the disclosure trigger; got: ${h.text()}`);
      await clickButton(toggle);
      await h.settle();
      // DISCRIMINATING: this answer text exists nowhere on the collapsed card.
      assert.match(h.text(), /Rome Public Advisory/, `got: ${h.text()}`);
    } finally {
      await h.unmount();
    }
  });
});

test("CB-AE2E-023 — a CANCELLED plan gets the same receipt treatment, off cancel_reason", async () => {
  const cancelled = { ...PLAN, state: "cancelled", cancelled_at: "2026-09-04T03:00:00Z", cancelled_by: "u-canceller", cancel_reason: "Client withdrew" };
  await withMockedEnv(mockFetch(ITEMS_2_OF_5, cancelled), async () => {
    const h = await mount("c1");
    try {
      assert.equal(buttonsLabelled(h.container, "Commit onboarding").length, 0);
      assert.equal(buttonsLabelled(h.container, "Cancel onboarding").length, 0);
      assert.match(h.text(), /Client withdrew/, `got: ${h.text()}`);
      assert.match(h.text(), /u-canceller/, `got: ${h.text()}`);
    } finally {
      await h.unmount();
    }
  });
});

// ===========================================================================================
// 裁-187 — the attestation field is hidden until the DOOR asks for it.
// ===========================================================================================

/** A plan the card's own gate does NOT block: every required item settled, and the opening
 *  position captured by `first_year_zero_opening` — the first of
 *  `commit_client_onboarding`'s three opening disjuncts (0017_wave_b.sql:2812-2822). Without
 *  this the dialog's Confirm is disabled and `clickButton` rightly refuses to click it. */
const COMMITTABLE_ITEMS = [
  { id: "c-1", plan_id: "plan-1", firm_id: "f1", item_kind: "must_ask", item_key: "legal_name", question: "Legal name", answer: "Rome Public Advisory", state: "answered", required_for_commit: true, answered_by: "u1", answered_at: "2026-08-01T00:00:00Z", created_at: "2026-08-01T00:00:00Z", updated_at: "2026-08-01T00:00:00Z" },
  { id: "c-2", plan_id: "plan-1", firm_id: "f1", item_kind: "must_ask", item_key: "first_year_zero_opening", question: "Opening position", answer: { opening: "zero" }, state: "answered", required_for_commit: true, answered_by: "u1", answered_at: "2026-08-01T00:00:00Z", created_at: "2026-08-01T00:00:00Z", updated_at: "2026-08-01T00:00:00Z" },
];

/** The open dialog's attestation textarea, if it is there at all. */
function attestationField(): unknown {
  return dialogNode((n) => (n as { getAttribute?: (a: string) => string | null }).getAttribute?.("aria-label") === "Attestation");
}

test("裁-187 — the commit dialog carries NO attestation field until a refusal names one", async () => {
  await withMockedEnv(mockFetch(COMMITTABLE_ITEMS), async () => {
    const h = await mount("c1");
    try {
      await openCommitDialog(h);
      assert.equal(attestationField(), null, "the click IS the act — no attestation ceremony on the happy path");
    } finally {
      await h.unmount();
      for (let i = 0; i < 3; i++) await h.settle();
    }
  });
});

test("裁-187 — a CLR05 'self_attestation' refusal REVEALS the field beside the verbatim refusal; another CLR05 arm does not", async () => {
  // The door's own arm: `raise … using errcode='CLR05', detail='{"reason":"self_attestation"}'`
  // (0017_wave_b.sql:2799-2801, read live in this worktree).
  const refuse = (details: string) => (async (url: RequestInfo | URL) => {
    const u = String(url);
    if (u.includes("/rpc/commit_client_onboarding")) {
      return jsonResponse({ code: "CLR05", message: "solo onboarding commit requires an attestation", details }, 400);
    }
    return mockFetch(COMMITTABLE_ITEMS)(url as never);
  }) as typeof fetch;

  for (const [details, shouldReveal] of [
    ['{"reason":"self_attestation"}', true],
    // A DIFFERENT CLR05 arm of the same door. It is a refusal no attestation can answer, so
    // revealing the field would be offering a doomed round trip.
    ['{"reason":"distinct_checker"}', false],
  ] as const) {
    await withMockedEnv(refuse(details), async () => {
      const h = await mount("c1");
      try {
        const confirm = await openCommitDialog(h);
        await clickButton(confirm as never);
        for (let i = 0; i < 6; i++) await h.settle();
        // The refusal renders VERBATIM either way — that half never depended on the token.
        assert.match(h.text(), /solo onboarding commit requires an attestation/, `got: ${h.text()}`);
        await openCommitDialog(h);
        assert.equal(Boolean(attestationField()), shouldReveal, `details=${details} should ${shouldReveal ? "" : "NOT "}reveal the attestation field`);
      } finally {
        await h.unmount();
        for (let i = 0; i < 3; i++) await h.settle();
      }
    });
  }
});

// ===========================================================================================
// H-50 — the client-scope invalidation event.
// ===========================================================================================

test("H-50 — a SUCCESSFUL commit announces CLIENT_RECORD_CHANGED exactly once, and a REFUSED one announces nothing", async () => {
  for (const [outcome, expected] of [["ok", 1], ["refused", 0]] as const) {
    const impl = (async (url: RequestInfo | URL) => {
      const u = String(url);
      if (u.includes("/rpc/commit_client_onboarding")) {
        return outcome === "ok"
          ? jsonResponse({ client_id: "c1", plan_id: "plan-1", status: "active" })
          : jsonResponse({ code: "CLR10", message: "required onboarding questions remain unresolved", details: '{"reason":"questions_unresolved"}' }, 400);
      }
      return mockFetch(COMMITTABLE_ITEMS)(url as never);
    }) as typeof fetch;

    await withMockedEnv(impl, async () => {
      const seen: string[] = [];
      const listener = (e: Event) => seen.push((e as CustomEvent<{ clientId: string }>).detail.clientId);
      window.addEventListener(CLIENT_RECORD_CHANGED_EVENT, listener);
      const h = await mount("c1");
      try {
        const confirm = await openCommitDialog(h);
        await clickButton(confirm as never);
        for (let i = 0; i < 6; i++) await h.settle();
        assert.deepEqual(seen, expected === 1 ? ["c1"] : [], `${outcome}: expected ${expected} announcement(s), saw ${JSON.stringify(seen)}`);
      } finally {
        window.removeEventListener(CLIENT_RECORD_CHANGED_EVENT, listener);
        await h.unmount();
        for (let i = 0; i < 3; i++) await h.settle();
      }
    });
  }
});

test("an active pre-0017 client with no plan renders the Bootstrap affordance, not a fabricated empty plan", async () => {
  const impl = (async (url: RequestInfo | URL) => {
    const u = String(url);
    if (u.includes("/rest/v1/clients")) return jsonResponse([{ id: "c2", name: "Bee Creative Solution", status: "active" }]);
    if (u.includes("/rest/v1/onboarding_plans")) return jsonResponse([]);
    throw new Error(`unexpected fetch: ${u}`);
  }) as typeof fetch;
  await withMockedEnv(impl, async () => {
    const h = await mount("c2");
    try {
      assert.match(h.text(), /Bootstrap onboarding plan/);
    } finally {
      await h.unmount();
    }
  });
});
