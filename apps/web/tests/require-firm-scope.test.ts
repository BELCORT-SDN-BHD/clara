// `./next-runtime-globals` FIRST, per its own header: this file loads
// `next/navigation` (transitively, through lib/require-firm-scope.ts), and Next's
// server bundle throws "Invariant: AsyncLocalStorage accessed in runtime where it
// is not available" without that global.
import "./next-runtime-globals";

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  FIRM_SCOPE_FORBIDDEN_BODY,
  FIRM_SCOPE_FORBIDDEN_STATUS,
  HOLDING_ROUTE,
  firmScopeRefusal,
  requireFirmScope,
  resolveFirmScope,
  type CallerContextReader,
  type ScopeDenialReason,
  type ScopeOutcome,
} from "../lib/require-firm-scope";
import type { CallerContextRow } from "../lib/firm/caller-context";

/**
 * THE SCOPE SPINE'S BEHAVIOUR (P4-2; design `p4-design-2026-08-27.md` §4 E).
 * Its structural half — one implementation / three entrances / two exemptions,
 * the wire-shape pins and the mechanised rung-0 census — is
 * `tests/firm-scope-surfaces.test.ts`.
 *
 * Two things get proven here:
 *
 *  1. THE DECISION, BOTH DIRECTIONS. One well-formed row grants and hands back
 *     THAT row; zero rows, more than one row, a malformed row and a THROWN read
 *     each deny, with their own reason. Every denial cell is re-run against a
 *     WALL-LESS MUTANT and required to FAIL — the RED-before proof (§0.5 / review
 *     law 2: an assertion that still passes with the wall deleted proves nothing).
 *  2. THE THREE ENTRANCES' ADAPTERS. The layouts' adapter throws Next's REAL
 *     `NEXT_REDIRECT` and the digest is asserted to NAME `/pending` — the shipping
 *     mechanism, not a stand-in, so a redirect to the wrong place fails here. The
 *     API adapter's refusal is asserted as a STATUS (403) and positively asserted
 *     NOT to be a redirect.
 */

/** A well-formed context row. Every field is DISTINCT and non-default so a grant
 *  cell asserting `deepEqual` on it cannot pass against a fabricated blank. */
const MEMBER: CallerContextRow = {
  user_id: "11111111-1111-4111-8111-111111111111",
  firm_id: "22222222-2222-4222-8222-222222222222",
  firm_name: "BELCORT SDN BHD",
  role: "owner",
  role_rank: 3,
  is_operator: true,
};

const readOne: CallerContextReader = async () => [MEMBER];
const readZero: CallerContextReader = async () => [];
const readTwo: CallerContextReader = async () => [
  MEMBER,
  { ...MEMBER, firm_id: "33333333-3333-4333-8333-333333333333" },
];
/** One row that is NOT a context: the pinned columns are absent. What a projection
 *  drift or a truncated body looks like on the wire. */
const readMalformed: CallerContextReader = async () =>
  [{ hello: "world" } as unknown as CallerContextRow];
const readThrows: CallerContextReader = async () => {
  throw new Error("read failed: 503 from PostgREST");
};

/**
 * THE MUTANT — the spine with every fail-closed branch removed. It grants on
 * whatever the read said, which is precisely the NULL-`jwt_firm()` defect this
 * train exists to prevent. Each denial cell below is run against it and REQUIRED
 * to fail; that failure IS the recorded RED.
 */
const grantAlways = async (): Promise<ScopeOutcome> => ({
  granted: true,
  context: MEMBER,
});

type Resolver = (read: CallerContextReader) => Promise<ScopeOutcome>;

/** The one assertion shape both the real spine and the mutant are put through, so
 *  the RED-before control is byte-identical to the cell it controls. */
async function assertDenied(
  resolve: Resolver,
  read: CallerContextReader,
  reason: ScopeDenialReason,
): Promise<void> {
  const outcome = await resolve(read);
  assert.equal(outcome.granted, false, "GRANTED where a denial was required");
  assert.equal(
    (outcome as { reason: ScopeDenialReason }).reason,
    reason,
    "denied for the wrong reason",
  );
}

/** Run the identical assertion against the wall-less mutant and require it to
 *  throw — the RED half of RED-before. Matched on the assertion's own message so
 *  it cannot "pass" by failing for some unrelated reason. */
async function assertMutantIsRed(
  read: CallerContextReader,
  reason: ScopeDenialReason,
): Promise<void> {
  await assert.rejects(
    () => assertDenied(grantAlways, read, reason),
    /GRANTED where a denial was required/,
  );
}

describe("resolveFirmScope — the one decision", () => {
  it("POSITIVE CONTROL: exactly one well-formed row grants, and returns THAT row", async () => {
    const outcome = await resolveFirmScope(readOne);
    assert.equal(outcome.granted, true);
    assert.deepEqual(
      (outcome as { context: CallerContextRow }).context,
      MEMBER,
      "the granted context must be the row the read returned, not a fabrication",
    );
  });

  it("an EMPTY read denies — no_membership (mutant seen RED)", async () => {
    await assertDenied(resolveFirmScope, readZero, "no_membership");
    await assertMutantIsRed(readZero, "no_membership");
  });

  it("a FAILED read denies — read_failed, and never propagates the throw", async () => {
    await assertDenied(resolveFirmScope, readThrows, "read_failed");
    await assertMutantIsRed(readThrows, "read_failed");
  });

  it("MORE THAN ONE row denies — ambiguous, never 'pick the first'", async () => {
    await assertDenied(resolveFirmScope, readTwo, "ambiguous");
    await assertMutantIsRed(readTwo, "ambiguous");
  });

  it("a row without the pinned shape denies — malformed", async () => {
    await assertDenied(resolveFirmScope, readMalformed, "malformed");
    await assertMutantIsRed(readMalformed, "malformed");
  });

  it("a null role_rank is a REAL context and still grants (the DB permits it)", async () => {
    const outcome = await resolveFirmScope(async () => [
      { ...MEMBER, role_rank: null },
    ]);
    assert.equal(
      outcome.granted,
      true,
      "denying a null rank would strand a genuine member; consumers compare fail-closed instead",
    );
  });
});

// ---------------------------------------------------------------------------
// ENTRANCES 1 AND 2 — the layouts' adapter, through Next's REAL redirect
// ---------------------------------------------------------------------------

/** Next's `redirect()` throws an `Error` carrying
 *  `digest === "NEXT_REDIRECT;replace;/pending;307;"`. Asserting the DIGEST, not
 *  merely "something threw", is what makes this cell name the destination: a
 *  redirect to /login would fail it. */
function redirectDigest(e: unknown): string {
  const digest: unknown = (e as { digest?: unknown }).digest;
  assert.equal(typeof digest, "string", "not a Next redirect — no string digest");
  return digest as string;
}

async function assertRedirectsToHolding(read: CallerContextReader): Promise<void> {
  await assert.rejects(
    () => requireFirmScope(read),
    (e: unknown) => {
      const digest = redirectDigest(e);
      assert.match(digest, /^NEXT_REDIRECT;/, "threw, but not a NEXT_REDIRECT");
      assert.ok(
        digest.includes(`;${HOLDING_ROUTE};`),
        `redirected somewhere else: ${digest} does not name ${HOLDING_ROUTE}`,
      );
      return true;
    },
  );
}

describe("requireFirmScope — entrances 1 and 2 (the two layouts)", () => {
  it("the holding route IS /pending — pinned, so a rename is a visible diff", () => {
    assert.equal(HOLDING_ROUTE, "/pending");
  });

  it("an EMPTY read redirects to the holding route", async () => {
    await assertRedirectsToHolding(readZero);
  });

  it("a FAILED read redirects to the SAME place — the design's explicit requirement", async () => {
    await assertRedirectsToHolding(readThrows);
  });

  it("more than one row, and a malformed row, redirect too", async () => {
    await assertRedirectsToHolding(readTwo);
    await assertRedirectsToHolding(readMalformed);
  });

  it("POSITIVE CONTROL: a real membership passes through and returns its context", async () => {
    const scope = await requireFirmScope(readOne);
    assert.deepEqual(scope, MEMBER);
  });

  it("RED-before: an adapter that does not redirect fails the very same cell", async () => {
    // The mutant: `requireFirmScope` with the redirect removed. If the assertion
    // above could pass against this, it would be asserting nothing.
    const noRedirect = async (read: CallerContextReader) => {
      await resolveFirmScope(read);
      return MEMBER;
    };
    await assert.rejects(
      () =>
        assert.rejects(
          () => noRedirect(readZero),
          (e: unknown) => {
            assert.match(redirectDigest(e), /^NEXT_REDIRECT;/);
            return true;
          },
        ),
      /Missing expected rejection/,
    );
  });
});

// ---------------------------------------------------------------------------
// ENTRANCE 3 — the API route's adapter: a STATUS, never a redirect
// ---------------------------------------------------------------------------

describe("firmScopeRefusal — entrance 3 (the runtime API route)", () => {
  it("the refusal status is 403, asserted as a status and not a redirect", async () => {
    const res = await firmScopeRefusal(readZero);
    assert.ok(res instanceof Response, "must answer with a Response, not a throw");
    assert.equal(res.status, FIRM_SCOPE_FORBIDDEN_STATUS);
    assert.equal(res.status, 403, "the design fixes this at 403");
    assert.ok(
      res.status < 300 || res.status >= 400,
      "a 3xx here would be the redirect the design forbids on a data request",
    );
    assert.equal(
      res.headers.get("location"),
      null,
      "a Location header would make this a redirect in all but status",
    );
    assert.deepEqual(await res.json(), FIRM_SCOPE_FORBIDDEN_BODY);
  });

  it("a FAILED read refuses the same way — fail-closed, not fail-open", async () => {
    const res = await firmScopeRefusal(readThrows);
    assert.ok(res instanceof Response);
    assert.equal(res.status, 403);
  });

  it("more than one row, and a malformed row, refuse too", async () => {
    assert.equal((await firmScopeRefusal(readTwo))?.status, 403);
    assert.equal((await firmScopeRefusal(readMalformed))?.status, 403);
  });

  it("POSITIVE CONTROL: a real membership yields null, so the proxy runs", async () => {
    assert.equal(await firmScopeRefusal(readOne), null);
  });

  it("RED-before: a permissive adapter (always null) fails the 403 cell", async () => {
    const alwaysAllows = async (): Promise<Response | null> => null;
    await assert.rejects(async () => {
      const res = await alwaysAllows();
      assert.ok(res instanceof Response, "must answer with a Response, not a throw");
    }, /must answer with a Response/);
  });

  it("the refusal body names no denial reason — a probe learns nothing", async () => {
    const body = JSON.stringify(FIRM_SCOPE_FORBIDDEN_BODY);
    for (const reason of ["no_membership", "ambiguous", "malformed", "read_failed"]) {
      assert.ok(!body.includes(reason), `the refusal body leaks the reason "${reason}"`);
    }
  });
});
