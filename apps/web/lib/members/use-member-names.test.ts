// CB-AE2E-027 / CB-AE2E-028 — the member-name resolver, and the three ways it must
// refuse to guess.
//
// `clara.firm_members_visible` (0141:512, granted to clara_authenticated at
// 0141:597) is firm-scoped by `clara.jwt_firm()`, floored at bookkeeper+, and its
// `email` column is null-masked below admin+. A caller BELOW the floor gets ZERO
// ROWS rather than a refusal — it is a view, not a door, so there is no CLR code on
// this path at all. That makes "the roster came back empty" ambiguous between "you
// may not read it" and "there is nobody", and this module claims neither: every
// unresolved id falls through to the caller's shortened-raw-id rendering.

import { test } from "node:test";
import assert from "node:assert/strict";

import { renderHook } from "../../test/hookHarness";
import { configureSessionTokenSource, resetSessionTokenSource, sessionTokenAccessor } from "@/lib/session-accessor";
import { useMemberNames } from "./use-member-names";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

const ROSTER = [
  { membership_id: "m1", user_id: "11111111-1111-4111-8111-111111111111", display_name: "Tao Lim", email: "tao@example.com", role: "owner", role_rank: 40, status: "active", created_at: "2026-01-01T00:00:00Z", removed_at: null },
  { membership_id: "m2", user_id: "22222222-2222-4222-8222-222222222222", display_name: "Siti Rahman", email: null, role: "bookkeeper", role_rank: 10, status: "removed", created_at: "2026-01-02T00:00:00Z", removed_at: "2026-06-01T00:00:00Z" },
  { membership_id: "m3", user_id: "33333333-3333-4333-8333-333333333333", display_name: "Clara (agent)", email: null, role: "agent", role_rank: 5, status: "active", created_at: "2026-01-03T00:00:00Z", removed_at: null },
];

function withRoster(impl: typeof fetch, run: () => Promise<void>): Promise<void> {
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

const okRoster = (async () => jsonResponse(ROSTER)) as typeof fetch;
const emptyRoster = (async () => jsonResponse([])) as typeof fetch;
const failedRoster = (async () => jsonResponse({ message: "permission denied for view firm_members_visible" }, 403)) as typeof fetch;

test("resolves a known user_id to its display_name, role and status", async () => {
  await withRoster(okRoster, async () => {
    const h = await renderHook(() => useMemberNames(sessionTokenAccessor));
    try {
      await h.settle();
      await h.settle();
      const tao = h.current.resolve("11111111-1111-4111-8111-111111111111");
      assert.equal(tao?.display_name, "Tao Lim");
      assert.equal(tao?.role, "owner");
      assert.equal(tao?.email, "tao@example.com");
    } finally {
      await h.unmount();
    }
  });
});

test("a DEPARTED member still resolves — the view publishes removed memberships, and an audit surface wants the name", async () => {
  await withRoster(okRoster, async () => {
    const h = await renderHook(() => useMemberNames(sessionTokenAccessor));
    try {
      await h.settle();
      await h.settle();
      const siti = h.current.resolve("22222222-2222-4222-8222-222222222222");
      assert.equal(siti?.display_name, "Siti Rahman");
      assert.equal(siti?.removed_at, "2026-06-01T00:00:00Z", "…and the caller can say so beside the name");
    } finally {
      await h.unmount();
    }
  });
});

test("the AGENT identity is a member row too, so an agent-lane acting_actor resolves", async () => {
  await withRoster(okRoster, async () => {
    const h = await renderHook(() => useMemberNames(sessionTokenAccessor));
    try {
      await h.settle();
      await h.settle();
      assert.equal(h.current.resolve("33333333-3333-4333-8333-333333333333")?.display_name, "Clara (agent)");
    } finally {
      await h.unmount();
    }
  });
});

test("an UNKNOWN id resolves null — the caller renders the shortened raw id, never a guessed name", async () => {
  await withRoster(okRoster, async () => {
    const h = await renderHook(() => useMemberNames(sessionTokenAccessor));
    try {
      await h.settle();
      await h.settle();
      assert.equal(h.current.resolve("99999999-9999-4999-8999-999999999999"), null);
      assert.equal(h.current.resolve(null), null);
      assert.equal(h.current.resolve(undefined), null);
      assert.equal(h.current.resolve(""), null);
    } finally {
      await h.unmount();
    }
  });
});

// THE BELOW-THE-FLOOR CASE. Absence is not evidence: an empty roster and a failed
// roster must both fall through to the honest raw-id rendering, and neither may be
// reported as "this firm has no members".
test("an EMPTY roster (the below-bookkeeper case) resolves every id to null and fabricates nothing", async () => {
  await withRoster(emptyRoster, async () => {
    const h = await renderHook(() => useMemberNames(sessionTokenAccessor));
    try {
      await h.settle();
      await h.settle();
      assert.deepEqual(h.current.members, []);
      assert.equal(h.current.resolve("11111111-1111-4111-8111-111111111111"), null);
      assert.equal(h.current.error, null, "an empty read is not an error — and not a claim either");
    } finally {
      await h.unmount();
    }
  });
});

test("a FAILED roster read resolves every id to null, and reports the failure separately", async () => {
  await withRoster(failedRoster, async () => {
    const h = await renderHook(() => useMemberNames(sessionTokenAccessor));
    try {
      await h.settle();
      await h.settle();
      assert.equal(h.current.resolve("11111111-1111-4111-8111-111111111111"), null, "a read that failed must never resolve a name");
      assert.deepEqual(h.current.members, [], "and it must not leave a partial or cached list behind");
      assert.ok(h.current.error, "the failure is available to a caller that wants to say so");
    } finally {
      await h.unmount();
    }
  });
});

test("a null session issues no read at all — the roster stays empty and nothing resolves", async () => {
  let calls = 0;
  const counting = (async () => {
    calls += 1;
    return jsonResponse(ROSTER);
  }) as typeof fetch;
  await withRoster(counting, async () => {
    const h = await renderHook(() => useMemberNames(null));
    try {
      await h.settle();
      await h.settle();
      assert.equal(calls, 0, "no session, no read");
      assert.equal(h.current.resolve("11111111-1111-4111-8111-111111111111"), null);
    } finally {
      await h.unmount();
    }
  });
});
