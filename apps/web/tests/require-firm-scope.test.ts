// `./next-runtime-globals` FIRST, per its own header: this file loads
// `next/navigation` (transitively, through lib/require-firm-scope.ts), and Next's
// server bundle throws "Invariant: AsyncLocalStorage accessed in runtime where it
// is not available" without that global.
import "./next-runtime-globals";

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const WEB_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

import {
  FIRM_SCOPE_FORBIDDEN_BODY,
  FIRM_SCOPE_FORBIDDEN_STATUS,
  HOLDING_ROUTE,
  firmScopeGuard,
  requireFirmScope,
  resolveFirmScope,
  type ScopeDenialReason,
  type ScopeDeps,
  type ScopeOutcome,
} from "../lib/require-firm-scope";
import {
  isCallerContextRow,
  type CallerContextRow,
} from "../lib/firm/caller-context";
import {
  serverSessionFrom,
  subjectFromClaims,
  tokenFromSession,
  type ServerSession,
} from "../lib/supabase/server-session";
import { stripComments } from "../test/sourceOracle";
/**
 * THE SCOPE SPINE'S BEHAVIOUR (P4-2; design `p4-design-2026-08-27.md` §4 E).
 * Its structural half — the route-leaf census, the three registries, the
 * `await` pins and the SQL-lexed rung-0 census — is
 * `tests/firm-scope-surfaces.test.ts` and `tests/firm-scope-db-pins.test.ts`.
 * What the proxy forwards, and on which leg, is `tests/runtime-outbound.test.ts`.
 *
 * Proven here:
 *  1. THE DECISION, BOTH DIRECTIONS. One well-formed row grants and hands back
 *     that row AND the session it was decided from; no session, zero rows, >1 row,
 *     a row failing validation, and a thrown read each deny with their own reason.
 *     Every denial cell is re-run against a WALL-LESS MUTANT and required to FAIL.
 *  2. ONE PRINCIPAL (HIGH-1). The grant carries the very session object the
 *     decision verified, so an entrance that must forward a token cannot reach for
 *     a second, unverified one.
 *  3. EVERY PINNED FIELD (MEDIUM-2), table-driven: each of the six columns,
 *     missing / null / wrong-typed, must produce `malformed`.
 *  4. THE ADAPTERS. The layouts throw Next's REAL `NEXT_REDIRECT` with the digest
 *     asserted to NAME `/pending`; the API adapter answers a STATUS, not a
 *     redirect, and hands back the session to forward.
 *  5. THE COST. One session resolution per scoped request.
 */

const SUB = "11111111-1111-4111-8111-111111111111";
const FIRM = "22222222-2222-4222-8222-222222222222";

/** A well-formed context row. Every field distinct and non-default, so a grant
 *  cell asserting `deepEqual` cannot pass against a fabricated blank. */
const MEMBER: CallerContextRow = {
  user_id: SUB,
  firm_id: FIRM,
  firm_name: "BELCORT SDN BHD",
  role: "owner",
  role_rank: 3,
  is_operator: true,
};

const SESSION: ServerSession = { accessToken: "token-A", subject: SUB };

const withRows = (rows: unknown[]): ScopeDeps => ({
  resolveSession: async () => SESSION,
  read: async () => rows as CallerContextRow[],
});

const noSession: ScopeDeps = { resolveSession: async () => null, read: async () => [MEMBER] };
const sessionThrows: ScopeDeps = {
  resolveSession: async () => {
    throw new Error("cookies() outside a request scope");
  },
  read: async () => [MEMBER],
};
const readThrows: ScopeDeps = {
  resolveSession: async () => SESSION,
  read: async () => {
    throw new Error("read failed: 503 from PostgREST");
  },
};

/**
 * THE MUTANT — the spine with every fail-closed branch removed. It grants on
 * whatever it was given, which is precisely the NULL-`jwt_firm()` defect this
 * train exists to prevent. Each denial cell is run against it and REQUIRED to
 * fail; that failure IS the recorded RED.
 */
const grantAlways = async (): Promise<ScopeOutcome> => ({
  granted: true,
  context: MEMBER,
  session: SESSION,
});

type Resolver = (deps: ScopeDeps) => Promise<ScopeOutcome>;

/** The one assertion shape both the real spine and the mutant are put through, so
 *  the RED-before control is byte-identical to the cell it controls. */
async function assertDenied(
  resolve: Resolver,
  deps: ScopeDeps,
  reason: ScopeDenialReason,
): Promise<void> {
  const outcome = await resolve(deps);
  assert.equal(outcome.granted, false, "GRANTED where a denial was required");
  assert.equal(
    (outcome as { reason: ScopeDenialReason }).reason,
    reason,
    "denied for the wrong reason",
  );
}

async function assertMutantIsRed(deps: ScopeDeps, reason: ScopeDenialReason): Promise<void> {
  await assert.rejects(
    () => assertDenied(grantAlways, deps, reason),
    /GRANTED where a denial was required/,
  );
}

describe("resolveFirmScope — the one decision", () => {
  it("POSITIVE CONTROL: one well-formed row grants, returning THAT row", async () => {
    const outcome = await resolveFirmScope(withRows([MEMBER]));
    assert.equal(outcome.granted, true);
    assert.deepEqual(
      (outcome as { context: CallerContextRow }).context,
      MEMBER,
      "the granted context must be the row the read returned, not a fabrication",
    );
  });

  it("HIGH-1: a grant carries the SAME session the decision verified", async () => {
    const outcome = await resolveFirmScope(withRows([MEMBER]));
    assert.equal(outcome.granted, true);
    assert.strictEqual(
      (outcome as { session: ServerSession }).session,
      SESSION,
      "the grant must hand back the very session it decided from — an entrance that " +
        "forwards a token must not be able to reach for a second, unverified one",
    );
  });

  it("HIGH-1: the read is issued on the GRANTING session's own token", async () => {
    let sawToken: string | null = null;
    await resolveFirmScope({
      resolveSession: async () => SESSION,
      read: async (session) => {
        sawToken = session.accessToken;
        return [MEMBER];
      },
    });
    assert.equal(sawToken, SESSION.accessToken);
  });

  it("NO SESSION denies — no_membership would be a different, wrong story", async () => {
    await assertDenied(resolveFirmScope, noSession, "no_session");
    await assertMutantIsRed(noSession, "no_session");
  });

  it("a THROWING session resolution denies, never propagates", async () => {
    await assertDenied(resolveFirmScope, sessionThrows, "no_session");
    await assertMutantIsRed(sessionThrows, "no_session");
  });

  it("an EMPTY read denies — no_membership", async () => {
    await assertDenied(resolveFirmScope, withRows([]), "no_membership");
    await assertMutantIsRed(withRows([]), "no_membership");
  });

  it("a FAILED read denies — read_failed, and never propagates the throw", async () => {
    await assertDenied(resolveFirmScope, readThrows, "read_failed");
    await assertMutantIsRed(readThrows, "read_failed");
  });

  it("MORE THAN ONE row denies — ambiguous, never 'pick the first'", async () => {
    const two = withRows([MEMBER, { ...MEMBER, firm_id: "33333333-3333-4333-8333-333333333333" }]);
    await assertDenied(resolveFirmScope, two, "ambiguous");
    await assertMutantIsRed(two, "ambiguous");
  });

  it("a null role_rank is a REAL context and still grants (the DB permits it)", async () => {
    const outcome = await resolveFirmScope(withRows([{ ...MEMBER, role_rank: null }]));
    assert.equal(
      outcome.granted,
      true,
      "denying a null rank would strand a genuine member; consumers compare fail-closed instead",
    );
  });
});

// ---------------------------------------------------------------------------
// MEDIUM-2 — every pinned field, table-driven
// ---------------------------------------------------------------------------

/**
 * One row per REJECTION the validator owes. The previous validator checked four of
 * six columns, so a row missing `firm_name` and `is_operator` — or carrying the
 * string `"true"` where a boolean belongs — granted and was then handed onward as
 * a trusted `CallerContextRow`. A partial validator launders an unvalidated field
 * behind a checked one, which is worse than none.
 */
const MALFORMED_ROWS: ReadonlyArray<{ readonly what: string; readonly row: unknown }> = [
  { what: "not an object", row: "a string" },
  { what: "null", row: null },
  { what: "user_id missing", row: { ...MEMBER, user_id: undefined } },
  { what: "user_id not a uuid", row: { ...MEMBER, user_id: "u1" } },
  { what: "user_id null", row: { ...MEMBER, user_id: null } },
  { what: "firm_id missing", row: { ...MEMBER, firm_id: undefined } },
  { what: "firm_id not a uuid", row: { ...MEMBER, firm_id: "f1" } },
  { what: "firm_name missing", row: { ...MEMBER, firm_name: undefined } },
  { what: "firm_name empty", row: { ...MEMBER, firm_name: "" } },
  { what: "firm_name null", row: { ...MEMBER, firm_name: null } },
  { what: "firm_name not a string", row: { ...MEMBER, firm_name: 7 } },
  { what: "role missing", row: { ...MEMBER, role: undefined } },
  { what: "role off the ladder", row: { ...MEMBER, role: "superuser" } },
  { what: "role empty", row: { ...MEMBER, role: "" } },
  { what: "role_rank a float", row: { ...MEMBER, role_rank: 2.5 } },
  { what: "role_rank NaN", row: { ...MEMBER, role_rank: Number.NaN } },
  { what: "role_rank a numeric string", row: { ...MEMBER, role_rank: "3" } },
  { what: "is_operator missing", row: { ...MEMBER, is_operator: undefined } },
  { what: "is_operator the STRING true", row: { ...MEMBER, is_operator: "true" } },
  { what: "is_operator null", row: { ...MEMBER, is_operator: null } },
  { what: "only the four once-checked fields", row: { user_id: SUB, firm_id: FIRM, role: "owner", role_rank: 3 } },
];

describe("MEDIUM-2 — every pinned field is validated, not four of six", () => {
  for (const { what, row } of MALFORMED_ROWS) {
    it(`denies malformed: ${what}`, async () => {
      assert.equal(isCallerContextRow(row), false, `isCallerContextRow accepted: ${what}`);
      await assertDenied(resolveFirmScope, withRows([row]), "malformed");
    });
  }

  it("POSITIVE CONTROL: the fully-formed row passes the same validator", () => {
    assert.equal(isCallerContextRow(MEMBER), true);
    assert.equal(isCallerContextRow({ ...MEMBER, role_rank: null }), true);
    for (const role of ["viewer", "bookkeeper", "admin", "owner"]) {
      assert.equal(isCallerContextRow({ ...MEMBER, role }), true, `rejected the real role ${role}`);
    }
  });

  it("RED-before: the old four-field validator passes rows this one rejects", () => {
    const fourFieldsOnly = (r: Record<string, unknown>) =>
      typeof r.user_id === "string" &&
      typeof r.firm_id === "string" &&
      typeof r.role === "string" &&
      (r.role_rank === null || typeof r.role_rank === "number");
    const spoof = { user_id: SUB, firm_id: FIRM, role: "owner", role_rank: 3, is_operator: "true" };
    assert.equal(fourFieldsOnly(spoof), true, "control: the old shape admitted this");
    assert.equal(isCallerContextRow(spoof), false, "the new validator must reject it");
  });
});

// ---------------------------------------------------------------------------
// ENTRANCES 1 AND 2 — the layouts' adapter, through Next's REAL redirect
// ---------------------------------------------------------------------------

/** Next's `redirect()` throws an `Error` carrying
 *  `digest === "NEXT_REDIRECT;replace;/pending;307;"`. Asserting the DIGEST, not
 *  merely "something threw", is what makes this cell name the destination. */
function redirectDigest(e: unknown): string {
  const digest: unknown = (e as { digest?: unknown }).digest;
  assert.equal(typeof digest, "string", "not a Next redirect — no string digest");
  return digest as string;
}

async function assertRedirectsToHolding(deps: ScopeDeps): Promise<void> {
  await assert.rejects(
    () => requireFirmScope(deps),
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

  it("every denial reason redirects to the holding route", async () => {
    await assertRedirectsToHolding(noSession);
    await assertRedirectsToHolding(withRows([]));
    await assertRedirectsToHolding(readThrows);
    await assertRedirectsToHolding(withRows([MEMBER, MEMBER]));
    await assertRedirectsToHolding(withRows([{ hello: "world" }]));
  });

  it("POSITIVE CONTROL: a real membership passes through and returns its context", async () => {
    assert.deepEqual(await requireFirmScope(withRows([MEMBER])), MEMBER);
  });

  it("RED-before: an adapter that does not redirect fails the very same cell", async () => {
    const noRedirect = async (deps: ScopeDeps) => {
      await resolveFirmScope(deps);
      return MEMBER;
    };
    await assert.rejects(
      () =>
        assert.rejects(
          () => noRedirect(withRows([])),
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
// ENTRANCE 3 — a STATUS, never a redirect; and the session to forward
// ---------------------------------------------------------------------------

describe("firmScopeGuard — entrance 3 (the runtime API route)", () => {
  it("refuses with 403, asserted as a status and not a redirect", async () => {
    const guard = await firmScopeGuard(withRows([]));
    assert.equal(guard.ok, false);
    const res = (guard as { response: Response }).response;
    assert.ok(res instanceof Response, "must answer with a Response, not a throw");
    assert.equal(res.status, FIRM_SCOPE_FORBIDDEN_STATUS);
    assert.equal(res.status, 403, "the design fixes this at 403");
    assert.ok(res.status < 300 || res.status >= 400, "a 3xx would be the forbidden redirect");
    assert.equal(res.headers.get("location"), null, "a Location header is a redirect in all but status");
    assert.deepEqual(await res.json(), FIRM_SCOPE_FORBIDDEN_BODY);
  });

  it("every denial reason refuses the same way — fail-closed, not fail-open", async () => {
    for (const deps of [noSession, readThrows, withRows([MEMBER, MEMBER]), withRows([{}])]) {
      const guard = await firmScopeGuard(deps);
      assert.equal(guard.ok, false);
      assert.equal((guard as { response: Response }).response.status, 403);
    }
  });

  it("POSITIVE CONTROL: a grant yields the session whose token must be forwarded", async () => {
    const guard = await firmScopeGuard(withRows([MEMBER]));
    assert.equal(guard.ok, true);
    assert.strictEqual((guard as { session: ServerSession }).session, SESSION);
  });

  it("RED-before: a permissive adapter (always ok) fails the 403 cell", async () => {
    const alwaysAllows = async () => ({ ok: true as const, session: SESSION });
    await assert.rejects(async () => {
      const guard = await alwaysAllows();
      assert.equal(guard.ok, false, "GRANTED where a refusal was required");
    }, /GRANTED where a refusal was required/);
  });

  it("the refusal body names no denial reason — a probe learns nothing", () => {
    const body = JSON.stringify(FIRM_SCOPE_FORBIDDEN_BODY);
    for (const reason of ["no_session", "no_membership", "ambiguous", "malformed", "read_failed"]) {
      assert.ok(!body.includes(reason), `the refusal body leaks the reason "${reason}"`);
    }
  });
});

// ---------------------------------------------------------------------------
// THE SERVER SESSION SEAM — the deciding halves, driven
// ---------------------------------------------------------------------------

describe("lib/supabase/server-session — the deciding halves", () => {
  it("tokenFromSession: only a non-empty string token is a token", () => {
    assert.equal(tokenFromSession({ access_token: "abc" }), "abc");
    assert.equal(tokenFromSession(null), null);
    assert.equal(tokenFromSession(undefined), null);
    assert.equal(tokenFromSession({}), null);
    assert.equal(tokenFromSession({ access_token: "" }), null, "an empty token is not a session");
    assert.equal(tokenFromSession({ access_token: 42 }), null);
  });

  it("subjectFromClaims: only a uuid-shaped sub is an identity", () => {
    assert.equal(subjectFromClaims({ sub: SUB }), SUB);
    assert.equal(subjectFromClaims(null), null);
    assert.equal(subjectFromClaims(undefined), null);
    assert.equal(subjectFromClaims({}), null, "an absent sub is not an identity");
    assert.equal(subjectFromClaims({ sub: 42 }), null);
    assert.equal(subjectFromClaims({ sub: "" }), null);
  });

  it("subjectFromClaims refuses a claim that would reshape the PostgREST filter", () => {
    for (const hostile of ["not-a-uuid", `${SUB}&select=*`, `${SUB} or true`, "*", `${SUB}\n`]) {
      assert.equal(
        subjectFromClaims({ sub: hostile }),
        null,
        `accepted a malformed sub: ${JSON.stringify(hostile)}`,
      );
    }
  });

  it("serverSessionFrom: BOTH halves or nothing — never a bundle with one guessed", () => {
    assert.deepEqual(serverSessionFrom({ access_token: "t" }, { sub: SUB }), {
      accessToken: "t",
      subject: SUB,
    });
    assert.equal(serverSessionFrom({ access_token: "t" }, {}), null, "a token with no verified subject");
    assert.equal(serverSessionFrom(null, { sub: SUB }), null, "a subject with no token");
    assert.equal(serverSessionFrom(null, null), null);
  });

  it("RED-before: a helper that trusts the claim verbatim fails the cell above", () => {
    const trusting = (claims: unknown) => (claims as { sub?: string } | null)?.sub ?? null;
    assert.throws(() => {
      assert.equal(trusting({ sub: `${SUB}&select=*` }), null, "accepted a malformed sub");
    }, /accepted a malformed sub/);
  });
});

// ---------------------------------------------------------------------------
// THE COST — one session resolution per scoped request
// ---------------------------------------------------------------------------

describe("the cost of a scoped request", () => {
  it("ONE session resolution and ONE read per decision", async () => {
    let sessions = 0;
    let reads = 0;
    const outcome = await resolveFirmScope({
      resolveSession: async () => {
        sessions += 1;
        return SESSION;
      },
      read: async () => {
        reads += 1;
        return [MEMBER];
      },
    });
    assert.equal(outcome.granted, true);
    assert.equal(sessions, 1, "the decision resolved the session more than once");
    assert.equal(reads, 1, "the decision read caller_context more than once");
  });

  it("a DENIAL costs no read it does not need", async () => {
    let reads = 0;
    await resolveFirmScope({
      resolveSession: async () => null,
      read: async () => {
        reads += 1;
        return [MEMBER];
      },
    });
    assert.equal(reads, 0, "the read went out for a caller with no session at all");
  });

  it("resolveServerSession is memoised per request with React's cache()", () => {
    // The memo cannot be OBSERVED here — React's `cache` only memoises inside a
    // request's own render scope, and a bare `node --test` process has none, so a
    // behavioural assertion would measure the harness rather than the code. What
    // is asserted is the wrapping itself, plus ONE module-level function object
    // (never a per-render accessor, so the singleton law is respected).
    const src = readFileSync(join(WEB_ROOT, "lib/supabase/server-session.ts"), "utf8");
    assert.match(
      src,
      /export const resolveServerSession = cache\(/,
      "the session resolution is no longer memoised per request",
    );
    assert.match(src, /from "react"/, "React's cache is not the memo being used");
  });

  it("the session module holds NO module-level mutable state at all", () => {
    // The old check only rejected a bare top-level `let`/`var` (#451 Codex round 2,
    // item 6), so `export let`, a `const` Map/Set, and a stateful global regex all
    // passed. Any of those can outlive a request and carry one caller's data into
    // the next — the single failure mode that would make a per-request memo unsafe.
    //
    // The `g`-flag clause is not theoretical: a module-level global regex reused
    // across calls carries `lastIndex`, and that exact hazard produced a real
    // under-counting bug in this branch's OWN migration census.
    const code = stripComments(readFileSync(join(WEB_ROOT, "lib/supabase/server-session.ts"), "utf8"));

    assert.doesNotMatch(code, /^\s*(export\s+)?(let|var)\s/m, "a mutable module-level binding");
    // The TYPE ARGUMENT matters: `new Map<string, T>(` does not contain the
    // literal `new Map(`, and a substring check for it waves the cache straight
    // through — caught by this suite's own mutant panel.
    assert.doesNotMatch(
      code,
      /new\s+(Map|Set|WeakMap|WeakSet|Array)\s*(<[^>]*>)?\s*\(/,
      "a module-level collection is a cache that outlives a request",
    );
    for (const m of code.matchAll(/=\s*\/(?:[^/\\\n]|\\.)+\/([a-z]*)/g)) {
      const flags = m[1] as string;
      assert.ok(
        !flags.includes("g") && !flags.includes("y"),
        `a module-level regex with /${flags} carries lastIndex across calls`,
      );
    }
  });

  it("VACUITY CONTROL: the mutable-store check catches each shape it claims to", () => {
    const rejects = (src: string, pattern: RegExp) => {
      const code = stripComments(src);
      return pattern.test(code);
    };
    assert.equal(rejects("export let sessions = null;", /^\s*(export\s+)?(let|var)\s/m), true);
    assert.equal(rejects("let sessions = null;", /^\s*(export\s+)?(let|var)\s/m), true);
    assert.equal(rejects("var sessions = null;", /^\s*(export\s+)?(let|var)\s/m), true);
    assert.equal(rejects("const SAFE = 1;", /^\s*(export\s+)?(let|var)\s/m), false);
    assert.ok(stripComments("const c = new Map();").includes("new Map("));
    assert.ok(!stripComments("// const c = new Map();").includes("new Map("));
    const flagsOf = (src: string) =>
      [...src.matchAll(/=\s*\/(?:[^/\\\n]|\\.)+\/([a-z]*)/g)].map((m) => m[1]);
    assert.deepEqual(flagsOf("const R = /ab/gi;"), ["gi"], "a global regex is not detected");
    assert.deepEqual(flagsOf("const R = /ab/i;"), ["i"]);
  });
});
