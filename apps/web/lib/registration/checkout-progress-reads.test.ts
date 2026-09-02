// The §2.1 checkout-progress probe (checkout-progress-reads.ts's header).
// FS-4 C-6: `checkout_intents` and `firm_registration_payments` do not exist
// on `main` yet, so the discriminating claim this file makes is the DEGRADE
// itself — every failure shape (a missing relation, a permission denial, a
// genuine network error) must fold to `false`, INDEPENDENTLY per fact, never
// throw and never guess a positive from an absence.

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  NO_CHECKOUT_PROGRESS,
  probeCheckoutProgress,
} from "./checkout-progress-reads";
import type { SessionTokenAccessor } from "@/lib/session";

const REGISTRATION = "11111111-1111-1111-1111-111111111111";
const APPLICANT = "22222222-2222-2222-2222-222222222222";
const accessor: SessionTokenAccessor = { getAccessToken: async () => "test-token" };

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

async function withEnv<T>(impl: typeof fetch, run: () => Promise<T>): Promise<T> {
  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  globalThis.fetch = impl;
  try {
    return await run();
  } finally {
    globalThis.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
  }
}

test("neither relation exists yet: BOTH facts degrade to false, independently, never throwing", async () => {
  await withEnv(
    (async () => jsonResponse({ code: "42P01", message: "relation does not exist" }, 404)) as typeof fetch,
    async () => {
      const progress = await probeCheckoutProgress(accessor, REGISTRATION, APPLICANT);
      assert.deepEqual(progress, NO_CHECKOUT_PROGRESS);
    },
  );
});

test("a permission denial (the table exists but grants nothing) degrades identically to an absent table", async () => {
  await withEnv(
    (async () => jsonResponse({ code: "42501", message: "permission denied" }, 403)) as typeof fetch,
    async () => {
      const progress = await probeCheckoutProgress(accessor, REGISTRATION, APPLICANT);
      assert.deepEqual(progress, NO_CHECKOUT_PROGRESS);
    },
  );
});

test("ONE relation failing must not blind the OTHER — each probe is independent", async () => {
  await withEnv(
    (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("checkout_intents")) {
        return jsonResponse({ code: "42P01", message: "relation does not exist" }, 404);
      }
      return jsonResponse([{ id: "row-1" }]);
    }) as typeof fetch,
    async () => {
      const progress = await probeCheckoutProgress(accessor, REGISTRATION, APPLICANT);
      assert.equal(progress.checkoutOpen, false, "the missing relation must not report progress");
      assert.equal(progress.paidUnconsumed, true, "the OTHER relation's real row was lost");
    },
  );
});

test("a checkout_intents row with a non-null session_id → checkoutOpen: true", async () => {
  await withEnv(
    (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("checkout_intents")) return jsonResponse([{ session_id: "cs_test_123" }]);
      return jsonResponse([]);
    }) as typeof fetch,
    async () => {
      const progress = await probeCheckoutProgress(accessor, REGISTRATION, APPLICANT);
      assert.deepEqual(progress, { checkoutOpen: true, paidUnconsumed: false });
    },
  );
});

test("a checkout_intents row with session_id NULL is NOT checkoutOpen — the filter, and the guard, both matter", async () => {
  await withEnv(
    (async (input: RequestInfo | URL) => {
      const url = String(input);
      // PostgREST would refuse this filter to return a null row at all, but the
      // guard in checkout-progress-reads.ts must not trust the shape blindly.
      if (url.includes("checkout_intents")) return jsonResponse([{ session_id: null }]);
      return jsonResponse([]);
    }) as typeof fetch,
    async () => {
      const progress = await probeCheckoutProgress(accessor, REGISTRATION, APPLICANT);
      assert.equal(progress.checkoutOpen, false);
    },
  );
});

test("a firm_registration_payments row → paidUnconsumed: true", async () => {
  await withEnv(
    (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("firm_registration_payments")) return jsonResponse([{ id: "pay-1" }]);
      return jsonResponse([]);
    }) as typeof fetch,
    async () => {
      const progress = await probeCheckoutProgress(accessor, REGISTRATION, APPLICANT);
      assert.deepEqual(progress, { checkoutOpen: false, paidUnconsumed: true });
    },
  );
});

test("both probes scope by registration_id AND applicant — the composite pair, not applicant alone", async () => {
  const seenFilters: string[] = [];
  await withEnv(
    (async (input: RequestInfo | URL) => {
      const url = String(input);
      seenFilters.push(url);
      return jsonResponse([]);
    }) as typeof fetch,
    async () => {
      await probeCheckoutProgress(accessor, REGISTRATION, APPLICANT);
    },
  );
  assert.equal(seenFilters.length, 2, "exactly one query per relation");
  for (const url of seenFilters) {
    assert.match(url, new RegExp(`registration_id=eq\\.${REGISTRATION}`));
    assert.match(url, new RegExp(`applicant=eq\\.${APPLICANT}`));
  }
});
