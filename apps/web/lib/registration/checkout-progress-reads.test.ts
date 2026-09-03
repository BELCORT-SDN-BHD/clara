// The §2.1 checkout-progress probe, REPOINTED by FS-4 C-6 Lane B onto
// `clara.get_own_checkout_progress(uuid)` — one self-scoped door, replacing
// two relation reads that were unreachable by construction (the two C-3
// tables grant every application role nothing, permanently; the module's own
// header carries the measurement).
//
// WHAT THESE CELLS CLAIM, AND WHAT THEY DELIBERATELY DO NOT. The DEGRADE is
// still the load-bearing property: every failure shape — a missing door, a
// governed refusal, a malformed row, a network error — must fold to "nothing
// was observed" and never throw, because `/pending` renders `pending` from
// that answer and an absence must never be reported as "the person has not
// opened checkout" (review law 2). What is NEW is that the two facts now
// arrive TOGETHER, in one snapshot, so a `paid` card can no longer be built
// from a payment that was consumed between two separate round trips.

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  NO_CHECKOUT_PROGRESS,
  OWN_CHECKOUT_PROGRESS_DOOR,
  checkoutProgressFrom,
  probeCheckoutProgress,
} from "./checkout-progress-reads";
import type { SessionTokenAccessor } from "@/lib/session";

const REGISTRATION = "11111111-1111-1111-1111-111111111111";
const APPLICANT = "22222222-2222-2222-2222-222222222222";
const accessor: SessionTokenAccessor = { getAccessToken: async () => "test-token" };

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

async function withFetch<T>(impl: typeof fetch, run: () => Promise<T>): Promise<T> {
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

test("the door does not exist yet: the probe degrades to nothing observed, never throwing", async () => {
  await withFetch(
    (async () => jsonResponse({ code: "42883", message: "function does not exist" }, 404)) as typeof fetch,
    async () => {
      assert.deepEqual(
        await probeCheckoutProgress(accessor, REGISTRATION, APPLICANT),
        NO_CHECKOUT_PROGRESS,
      );
    },
  );
});

test("a governed refusal degrades identically — a foreign registration is owed no answer", async () => {
  // `get_own_checkout_progress` raises CLR04 `not your registration request`
  // for somebody else's row. That is caught here like every other cause on
  // purpose: a caller asking about a registration that is not theirs must not
  // even learn the difference between "refused" and "nothing there".
  await withFetch(
    (async () => jsonResponse({ code: "CLR04", message: "not your registration request" }, 403)) as typeof fetch,
    async () => {
      assert.deepEqual(
        await probeCheckoutProgress(accessor, REGISTRATION, APPLICANT),
        NO_CHECKOUT_PROGRESS,
      );
    },
  );
});

test("a transport failure degrades rather than propagating into the holding page", async () => {
  await withFetch(
    (async () => { throw new Error("ECONNRESET"); }) as typeof fetch,
    async () => {
      assert.deepEqual(
        await probeCheckoutProgress(accessor, REGISTRATION, APPLICANT),
        NO_CHECKOUT_PROGRESS,
      );
    },
  );
});

test("the door's own two booleans are carried through, both polarities, in ONE call", async () => {
  for (const row of [
    { checkout_open: true, paid_unconsumed: false },
    { checkout_open: false, paid_unconsumed: true },
    { checkout_open: true, paid_unconsumed: true },
    { checkout_open: false, paid_unconsumed: false },
  ]) {
    let calls = 0;
    await withFetch(
      (async () => { calls += 1; return jsonResponse([row]); }) as typeof fetch,
      async () => {
        assert.deepEqual(await probeCheckoutProgress(accessor, REGISTRATION, APPLICANT), {
          checkoutOpen: row.checkout_open,
          paidUnconsumed: row.paid_unconsumed,
        });
      },
    );
    assert.equal(calls, 1, "the two facts must arrive in ONE snapshot, not two round trips");
  }
});

test("the probe calls the door BY NAME and passes the registration, and nothing else", async () => {
  const seen: Array<{ url: string; body: unknown }> = [];
  await withFetch(
    (async (input: RequestInfo | URL, init?: RequestInit) => {
      seen.push({ url: String(input), body: JSON.parse(String(init?.body ?? "null")) });
      return jsonResponse([{ checkout_open: false, paid_unconsumed: false }]);
    }) as typeof fetch,
    async () => { await probeCheckoutProgress(accessor, REGISTRATION, APPLICANT); },
  );
  assert.equal(seen.length, 1);
  assert.match(seen[0]!.url, new RegExp(`/rpc/${OWN_CHECKOUT_PROGRESS_DOOR}$`));
  // The APPLICANT is deliberately NOT a parameter: the door reads `jwt_sub()`
  // itself, so there is no caller-supplied identity for it to be wrong about.
  assert.deepEqual(seen[0]!.body, { p_registration: REGISTRATION });
});

test("a malformed row is NO observation, not a weak one", () => {
  // Every one of these would be a positive `paid` or `checkout_open` card
  // built on a value the door did not actually return. The decoder is what
  // stops a shape change from silently promoting garbage into a state.
  for (const rows of [
    null,
    {},
    [],
    [null],
    [{ checkout_open: "true", paid_unconsumed: false }],
    [{ checkout_open: true, paid_unconsumed: "yes" }],
    [{ checkout_open: 1, paid_unconsumed: 0 }],
    [{ checkoutOpen: true, paidUnconsumed: true }],
    [{ checkout_open: true }],
  ]) {
    assert.deepEqual(checkoutProgressFrom(rows), NO_CHECKOUT_PROGRESS, JSON.stringify(rows));
  }
  // MUST-NOT-RED control: the well-formed shape is still read.
  assert.deepEqual(checkoutProgressFrom([{ checkout_open: true, paid_unconsumed: true }]), {
    checkoutOpen: true,
    paidUnconsumed: true,
  });
});

test("the retired relation reads are gone: no request names either C-3 table", async () => {
  const urls: string[] = [];
  await withFetch(
    (async (input: RequestInfo | URL) => {
      urls.push(String(input));
      return jsonResponse([{ checkout_open: true, paid_unconsumed: true }]);
    }) as typeof fetch,
    async () => { await probeCheckoutProgress(accessor, REGISTRATION, APPLICANT); },
  );
  assert.ok(urls.length > 0, "VACUITY CONTROL: no request was observed at all");
  for (const url of urls) {
    assert.equal(/checkout_intents|firm_registration_payments/.test(url), false, url);
  }
});
