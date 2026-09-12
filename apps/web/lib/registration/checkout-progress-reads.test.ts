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
  CHECKOUT_INTENT_STATUSES,
  NO_CHECKOUT_PROGRESS,
  OWN_CHECKOUT_PROGRESS_DOOR,
  checkoutProgressFrom,
  checkoutStandingFrom,
  probeCheckoutProgress,
  waitingActsFrom,
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
          ...NO_CHECKOUT_PROGRESS,
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
    ...NO_CHECKOUT_PROGRESS,
    checkoutOpen: true,
    paidUnconsumed: true,
  });
});

// ===========================================================================
// #628 — MIGRATION 0186's FIVE NEW FIELDS
// ===========================================================================

test("#628: the five new fields are carried through, each in its own right", () => {
  assert.deepEqual(
    checkoutProgressFrom([{
      checkout_open: true,
      paid_unconsumed: false,
      intent_status: "processing",
      intent_status_at: "2026-09-12T04:30:00.000Z",
      intent_status_reason: "card_declined",
      intent_session_id: "cs_test_628",
      capacity_full: true,
    }]),
    {
      checkoutOpen: true,
      paidUnconsumed: false,
      intentStatus: "processing",
      intentStatusAt: "2026-09-12T04:30:00.000Z",
      intentStatusReason: "card_declined",
      intentSessionId: "cs_test_628",
      capacityFull: true,
    },
  );
});

test("#628: ALL EIGHT statuses the door can return are read, and a ninth is not", () => {
  // The vocabulary is closed on purpose. A status this build has never seen is
  // not a weaker observation of a known one — every face falls back to the
  // reading it had before the status column existed, rather than guessing which
  // known status an unknown one most resembles.
  for (const status of CHECKOUT_INTENT_STATUSES) {
    assert.equal(
      checkoutProgressFrom([{ checkout_open: true, paid_unconsumed: false, intent_status: status }]).intentStatus,
      status,
      status,
    );
  }
  for (const bogus of ["refunded", "PAID", "", null, 7, {}, ["paid"]]) {
    assert.equal(
      checkoutProgressFrom([{ checkout_open: true, paid_unconsumed: false, intent_status: bogus }]).intentStatus,
      null,
      JSON.stringify(bogus),
    );
  }
});

test("#628: A DOOR THAT PREDATES 0186 STILL YIELDS ITS TWO BOOLEANS", () => {
  // THE MIGRATION-WINDOW PROPERTY, and the reason the new fields are decoded
  // separately from the two booleans rather than all-or-nothing with them.
  // Between the web deploy and the DB deploy — in EITHER order — the door
  // returns the old two-column row. If that degraded the whole observation to
  // NO_CHECKOUT_PROGRESS, an applicant with a live checkout would be told on
  // /pending that they have not started one.
  assert.deepEqual(checkoutProgressFrom([{ checkout_open: true, paid_unconsumed: false }]), {
    ...NO_CHECKOUT_PROGRESS,
    checkoutOpen: true,
    paidUnconsumed: false,
  });
});

test("#628: a nullable text column that is not a usable string is an ABSENCE", () => {
  // `"null"`, `""` and `[object Object]` are the three shapes a careless
  // decoder puts on screen beside somebody's payment. None of them is a time.
  for (const bad of [null, "", 0, {}, []]) {
    const decoded = checkoutProgressFrom([{
      checkout_open: true,
      paid_unconsumed: false,
      intent_status_at: bad,
      intent_status_reason: bad,
      intent_session_id: bad,
    }]);
    assert.equal(decoded.intentStatusAt, null, JSON.stringify(bad));
    assert.equal(decoded.intentStatusReason, null, JSON.stringify(bad));
    assert.equal(decoded.intentSessionId, null, JSON.stringify(bad));
  }
});

test("#628: capacity_full is TRUE only when the door said true", () => {
  // A capacity card closes the door on somebody. `"false"`, `0` and `"yes"` are
  // all truthy-or-falsy in ways that do not survive a shape change, so the test
  // is identity against `true` and nothing else.
  for (const value of [true]) {
    assert.equal(checkoutProgressFrom([{ checkout_open: false, paid_unconsumed: false, capacity_full: value }]).capacityFull, true);
  }
  for (const value of [false, "true", 1, null, undefined, {}]) {
    assert.equal(
      checkoutProgressFrom([{ checkout_open: false, paid_unconsumed: false, capacity_full: value }]).capacityFull,
      false,
      JSON.stringify(value),
    );
  }
});

test("#628: checkoutStandingFrom is TOTAL over the closed status vocabulary", () => {
  // The mapper `/pending` and `/checkout/success` BOTH read. A status with no
  // arm would fall off the end of the switch and produce `undefined`, which
  // renders as no face at all — the silent hole this cell exists to close.
  const expected: Record<string, string | null> = {
    open: null,
    session_created: "awaiting_payment",
    processing: "processing",
    paid: "awaiting_payment",
    consumed: "awaiting_payment",
    expired: "expired",
    payment_failed: "payment_failed",
    cancelled: "cancelled",
  };
  for (const status of CHECKOUT_INTENT_STATUSES) {
    assert.equal(
      checkoutStandingFrom({ ...NO_CHECKOUT_PROGRESS, intentStatus: status }),
      expected[status],
      status,
    );
  }
  // An unreadable status keeps the PRE-#628 reading, which is the whole point
  // of the null arm.
  assert.equal(checkoutStandingFrom(NO_CHECKOUT_PROGRESS), null);
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

// ===========================================================================
// #628 REVIEW — WHAT A WAITING FACE MAY ACTUALLY OFFER
// ===========================================================================

test("#628 review — only a LIVE Session is resumable or cancellable; a paid one is neither", () => {
  // THE DEFECT THIS DECIDES AWAY. `checkoutStandingFrom` maps `paid` and
  // `consumed` onto `awaiting_payment` — correctly: both are reached only when
  // no claimable payment row was observed, so a wait with a re-read is the
  // honest face. But a paid intent KEEPS its stamped Session id, and both
  // waiting faces keyed their controls on that id alone. So somebody whose
  // money had already landed was shown "Cancel and start again" (which
  // `cancel_checkout_intent` refuses `already_paid`) and, on `/pending`,
  // "Resume checkout" as well. Both could only end in a refusal.
  //
  // THE ALLOWLIST IS WALKED IN FULL, so a status added by a later migration is
  // excluded by default rather than silently admitted.
  const withStatus = (status: (typeof CHECKOUT_INTENT_STATUSES)[number]) => ({
    ...NO_CHECKOUT_PROGRESS,
    checkoutOpen: true,
    intentStatus: status,
    intentSessionId: "cs_628",
  });

  assert.deepEqual(
    waitingActsFrom(withStatus("session_created")),
    { resume: true, cancelSessionId: "cs_628" },
    "the ONE status with a live hosted page lost its controls",
  );
  for (const status of CHECKOUT_INTENT_STATUSES.filter((s) => s !== "session_created")) {
    assert.deepEqual(
      waitingActsFrom(withStatus(status)),
      { resume: false, cancelSessionId: null },
      `${status} still offers an act the door would refuse`,
    );
  }

  // THE MIGRATION WINDOW IS UNTOUCHED. With no status this build can read — an
  // older door, between the two deploys — nothing is known that would justify
  // withdrawing a control the product has always offered.
  assert.deepEqual(
    waitingActsFrom({ ...NO_CHECKOUT_PROGRESS, checkoutOpen: true, intentSessionId: "cs_628" }),
    { resume: true, cancelSessionId: "cs_628" },
    "the pre-0186 window lost its controls",
  );
  // AND NO SESSION IS STILL NO CANCEL, whatever the status says.
  assert.deepEqual(
    waitingActsFrom({ ...NO_CHECKOUT_PROGRESS, checkoutOpen: true, intentStatus: "session_created" }),
    { resume: true, cancelSessionId: null },
  );
});
