// The four checkout door callers — the decoding walls that sit between
// PostgREST's answer and a money-surface act.
//
// WHY THESE ARE CELLED SEPARATELY from the route. The route's cells prove the
// ORDER and the refusals; these prove what each caller will and will not accept
// as an answer. `getCurrentCheckoutPlan`'s unknown-token refusal in particular
// is named as a wall in the PR body's seam↔door table and had no RED-before at
// all (review M4): neutering it left the whole suite green.

import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import {
  cancelCheckoutIntent,
  claimPaidFirm,
  getCurrentCheckoutPlan,
  getOwnCheckoutIntentSession,
  openCheckoutIntent,
  recordCheckoutSession,
} from "./checkout-doors";
import { CHECKOUT_INTENT_STATUSES } from "./checkout-progress-reads";
import type { SessionTokenAccessor } from "@/lib/session";

const accessor: SessionTokenAccessor = { getAccessToken: async () => "test-token" };

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

async function withDoor<T>(answer: () => Response, run: () => Promise<T>): Promise<T> {
  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  globalThis.fetch = (async () => answer()) as typeof fetch;
  try {
    return await run();
  } finally {
    globalThis.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
  }
}

test("M4: an UNKNOWN payment_method_collection REFUSES — it is never defaulted", async () => {
  // The DB CHECK is the real wall and this is defence-in-depth, but the PR body
  // names it as a wall, so it owes a RED-before. What makes it worth having:
  // the alternative to throwing is passing an unknown token straight to Stripe,
  // or silently falling back to a mode the design rejects at RM0.
  for (const mode of ["sometimes", "", null, 7, undefined, "IF_REQUIRED", "Always"]) {
    await assert.rejects(
      () =>
        withDoor(
          () => json([{ local_key: "clara-beta-2026", payment_method_collection: mode }]),
          () => getCurrentCheckoutPlan(accessor),
        ),
      (err: unknown) => {
        assert.match(String((err as Error).message), /payment_method_collection/);
        return true;
      },
      `mode ${JSON.stringify(mode)}`,
    );
  }

  // MUST-NOT-RED CONTROL: both real tokens resolve, so the refusals above are
  // the guard discriminating rather than the caller being broken.
  for (const mode of ["if_required", "always"] as const) {
    assert.deepEqual(
      await withDoor(
        () => json([{ local_key: "clara-beta-2026", payment_method_collection: mode }]),
        () => getCurrentCheckoutPlan(accessor),
      ),
      { localKey: "clara-beta-2026", paymentMethodCollection: mode },
    );
  }
});

test("a plan answer with no usable local_key refuses rather than building a Session", async () => {
  for (const rows of [[], [{}], [{ payment_method_collection: "always" }], null,
    [{ local_key: "", payment_method_collection: "always" }]]) {
    await assert.rejects(
      () => withDoor(() => json(rows), () => getCurrentCheckoutPlan(accessor)),
      /get_current_checkout_plan/,
      JSON.stringify(rows),
    );
  }
});

test("openCheckoutIntent requires all three fields the route then spends", async () => {
  const complete = { intent_id: "int-1", price_local_key: "k", stripe_price_id: "price_1" };
  assert.deepEqual(
    await withDoor(() => json(complete), () =>
      openCheckoutIntent({ registration: "r", originDigest: "\\xab", opKey: "o" }, accessor)),
    { intentId: "int-1", priceLocalKey: "k", stripePriceId: "price_1" },
  );
  // A partial answer is not an intent. The route would otherwise send a Session
  // to Stripe naming an empty price or stamp an intent that does not exist.
  for (const key of ["intent_id", "price_local_key", "stripe_price_id"]) {
    const partial: Record<string, unknown> = { ...complete };
    delete partial[key];
    await assert.rejects(
      () => withDoor(() => json(partial), () =>
        openCheckoutIntent({ registration: "r", originDigest: "\\xab", opKey: "o" }, accessor)),
      /open_checkout_intent/,
      `missing ${key}`,
    );
  }
});

test("claimPaidFirm requires a firm id, and carries the door's own replay marker", async () => {
  const complete = { firm_id: "f", plan_id: "p", registration_id: "r" };
  assert.deepEqual(
    await withDoor(() => json(complete), () => claimPaidFirm({ registration: "r", opKey: "o" }, accessor)),
    { firmId: "f", planId: "p", registrationId: "r", replay: false },
  );
  assert.equal(
    (await withDoor(() => json({ ...complete, replay: true }), () =>
      claimPaidFirm({ registration: "r", opKey: "o" }, accessor))).replay,
    true,
  );
  await assert.rejects(() =>
    withDoor(() => json({ plan_id: "p", registration_id: "r" }), () =>
      claimPaidFirm({ registration: "r", opKey: "o" }, accessor)));
});

test("recordCheckoutSession sends exactly the three door parameters", async () => {
  let sent: Record<string, unknown> | null = null;
  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    sent = JSON.parse(String(init?.body ?? "{}"));
    return json({ intent_id: "int-1", recorded: true });
  }) as typeof fetch;
  try {
    await recordCheckoutSession({ intentId: "int-1", sessionId: "cs_1", opKey: "o" }, accessor);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
  }
  assert.deepEqual(sent, { p_intent: "int-1", p_session_id: "cs_1", p_op_key: "o" });
});

// ===========================================================================
// #628 REVIEW — THE INTENT'S STATUS IS A CLOSED UNION, DECODED AS ONE
// ===========================================================================

const REGISTRATION = "11111111-1111-1111-1111-111111111111";
const INTENT = "44444444-4444-4444-8444-444444444444";

test("#628 review — every status in the CLOSED vocabulary decodes, and nothing else does", async () => {
  // WHAT WAS WRONG. `OwnCheckoutIntentSession.status` was typed `string` beside
  // a `CheckoutIntentStatus` union that already spelled the column's CHECK. The
  // cost was not theoretical: `cancel/handler.ts` branches on
  // `status === "expired"`, and against a bare `string` TypeScript accepts a
  // comparison to a literal that can never occur — a typo there would have
  // compiled into an arm that never fires, silently, forever.
  for (const status of CHECKOUT_INTENT_STATUSES) {
    const row = await withDoor(
      () => json([{ intent_id: INTENT, session_id: "cs_628", status }]),
      () => getOwnCheckoutIntentSession(REGISTRATION, accessor),
    );
    assert.deepEqual(row, { intentId: INTENT, sessionId: "cs_628", status }, status);
  }

  // A STATUS OUTSIDE THE VOCABULARY IS NO ROW — not a weaker observation of a
  // known one. The caller would otherwise go on to decide, on the surface that
  // ENDS A PAYMENT, whether to cancel an intent whose state it cannot name.
  // `null` reaches the cancel route as `nothing_to_cancel`, which is honest.
  for (const status of ["", "refunded", "PAID", 9, null, undefined, {}]) {
    assert.equal(
      await withDoor(
        () => json([{ intent_id: INTENT, session_id: "cs_628", status }]),
        () => getOwnCheckoutIntentSession(REGISTRATION, accessor),
      ),
      null,
      JSON.stringify(status),
    );
  }
});

test("#628 review — cancel_checkout_intent's own status is decoded the same way", async () => {
  // The value the handler compares to `"expired"`. A door answering a status
  // this build cannot name is a door this build must not translate into a
  // sentence for a person: it THROWS, and the cancel route's catch renders
  // `unavailable` — the honest card for "the door answered something we do not
  // understand".
  for (const status of CHECKOUT_INTENT_STATUSES) {
    const out = await withDoor(
      () => json({ status, session_id: "cs_628" }),
      () => cancelCheckoutIntent({ intentId: INTENT, opKey: "k" }, accessor),
    );
    assert.deepEqual(out, { status, sessionId: "cs_628", replay: false }, status);
  }
  for (const status of ["refunded", "Cancelled"]) {
    await assert.rejects(
      () => withDoor(
        () => json({ status, session_id: "cs_628" }),
        () => cancelCheckoutIntent({ intentId: INTENT, opKey: "k" }, accessor),
      ),
      /does not know how to read/,
      status,
    );
  }
});

test("#628's DB round — the web NEVER calls `get_admission_capacity`", () => {
  // IT IS OPERATOR-ONLY. The applicant-facing verdict rides on
  // `get_own_checkout_progress`'s `capacity_full` column, which is why the two
  // pre-firm faces can refuse to offer a pay control the door would refuse
  // anyway. A browser-side call to the operator read would be this app asking a
  // question it has no standing to ask, and it would go RED at the door rather
  // than in review — which is a refusal an applicant reads, on a money surface.
  //
  // SCANNED AT THE SOURCE, not asserted about this module alone: the property
  // is "no path in this app", and a roster that only watched its own file would
  // miss the next one.
  const webRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
  const skip = new Set(["node_modules", ".next", ".open-next", ".wrangler", ".git"]);
  const offenders: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith(".") || skip.has(entry.name)) continue;
      const abs = join(dir, entry.name);
      if (entry.isDirectory()) { walk(abs); continue; }
      // APPLICATION paths only. A cell (this one included) may name the door in
      // a string; what must not exist is a shipped path that calls it.
      if (!/\.(ts|tsx|mjs|js)$/.test(entry.name) || /\.test\./.test(entry.name)) continue;
      // The QUOTED name — a door name as a `callDoor` argument or an RPC path.
      // Prose mentions (`get_admission_capacity()`, in this module's own
      // headers) carry a paren and are deliberately not matched: the property
      // is about calls, not about whether the door may be named in a comment.
      if (/(["'`])get_admission_capacity\1/.test(readFileSync(abs, "utf8"))) {
        offenders.push(relative(webRoot, abs));
      }
    }
  };
  walk(webRoot);
  assert.deepEqual(offenders, [], "an application path names the operator-only capacity door");
});
