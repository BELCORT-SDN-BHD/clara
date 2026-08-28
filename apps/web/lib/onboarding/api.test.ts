// lib/onboarding/api.ts — argument-shape + refusal-passthrough tests for the
// five T11 doors. The wire mechanism itself (status-before-CLR, abort
// carve-out, malformed body) is already proven in doors.test.ts/wire.test.ts;
// this file pins each wrapper's EXACT function name + arg names ground in
// ./api.ts's own header, and that a refusal survives verbatim through it.

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  beginClientOnboarding,
  bootstrapClientPlan,
  resolveOnboardingPlanItem,
  commitClientOnboarding,
  cancelClientOnboarding,
  isDoorRefusal,
} from "./api";
import type { SessionTokenAccessor } from "@/lib/session";

function fakeSession(token: string | null = "tok"): SessionTokenAccessor {
  return { getAccessToken: async () => token };
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

async function withMockedFetch(impl: typeof fetch, run: () => Promise<void>): Promise<void> {
  const original = globalThis.fetch;
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  globalThis.fetch = impl;
  try {
    await run();
  } finally {
    globalThis.fetch = original;
    if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
  }
}

type Seen = { fn: string; body: Record<string, unknown> };

/** `seen.first()` asserts there was EXACTLY one fetch call before handing it
 *  back — a real, loud failure if a wrapper ever calls fetch zero or more
 *  than once (never a silent `undefined` index). */
function captureFetch(result: unknown, status = 200): { impl: typeof fetch; seen: { first(): Seen } } {
  const calls: Seen[] = [];
  const impl = (async (url: RequestInfo | URL, init?: RequestInit) => {
    const fn = String(url).split("/rpc/")[1] ?? "";
    calls.push({ fn, body: JSON.parse(String(init?.body ?? "{}")) });
    return jsonResponse(result, status);
  }) as typeof fetch;
  return {
    impl,
    seen: {
      first(): Seen {
        assert.equal(calls.length, 1, `expected exactly one fetch call, got ${calls.length}`);
        return calls[0] as Seen;
      },
    },
  };
}

test("beginClientOnboarding posts p_name + a fresh op_key (UUID-shaped) to begin_client_onboarding", async () => {
  const { impl, seen } = captureFetch({ client_id: "c1", plan_id: "p1" });
  await withMockedFetch(impl, async () => {
    const out = await beginClientOnboarding("Rome Public Advisory", { session: fakeSession() });
    assert.deepEqual(out, { client_id: "c1", plan_id: "p1" });
  });
  const s = seen.first();
  assert.equal(s.fn, "begin_client_onboarding");
  assert.equal(s.body.p_name, "Rome Public Advisory");
  assert.match(String(s.body.p_op_key), /^[0-9a-f-]{36}$/);
  assert.equal(Object.keys(s.body).length, 2, "exactly p_name + p_op_key — no third argument");
});

test("beginClientOnboarding's CLR10 duplicate-name refusal (uq_clients_firm_name) surfaces verbatim", async () => {
  const impl = (async () =>
    jsonResponse({ code: "CLR10", message: "a client with that name already exists" }, 400)) as typeof fetch;
  await withMockedFetch(impl, async () => {
    await assert.rejects(beginClientOnboarding("Rome Properties", { session: fakeSession() }), (e: unknown) => {
      assert.ok(isDoorRefusal(e));
      assert.equal((e as import("./api").DoorRefusal).code, "CLR10");
      assert.equal((e as import("./api").DoorRefusal).message, "a client with that name already exists");
      return true;
    });
  });
});

test("bootstrapClientPlan posts p_client + op_key to bootstrap_client_plan", async () => {
  const { impl, seen } = captureFetch({ client_id: "c1", plan_id: "p1", item_id: "i1", status: "active", bootstrap_status: "created" });
  await withMockedFetch(impl, async () => {
    await bootstrapClientPlan("c1", { session: fakeSession() });
  });
  const s = seen.first();
  assert.equal(s.fn, "bootstrap_client_plan");
  assert.deepEqual(Object.keys(s.body).sort(), ["p_client", "p_op_key"]);
  assert.equal(s.body.p_client, "c1");
});

test("bootstrapClientPlan's CLR10 active_client_bootstrap_required refusal surfaces verbatim", async () => {
  const impl = (async () =>
    jsonResponse(
      { code: "CLR10", message: "plan bootstrap is only for pre-0017 active clients", details: '{"reason":"active_client_bootstrap_required"}' },
      400,
    )) as typeof fetch;
  await withMockedFetch(impl, async () => {
    await assert.rejects(bootstrapClientPlan("c1", { session: fakeSession() }), (e: unknown) => {
      assert.ok(isDoorRefusal(e));
      assert.equal((e as import("./api").DoorRefusal).code, "CLR10");
      assert.equal((e as import("./api").DoorRefusal).reason, "active_client_bootstrap_required");
      return true;
    });
  });
});

test("resolveOnboardingPlanItem posts p_plan + p_item_key + p_resolution + op_key", async () => {
  const { impl, seen } = captureFetch({ plan_id: "p1", item_id: "i1", state: "resolved", revision_token: "rt2", revision_n: 2 });
  await withMockedFetch(impl, async () => {
    await resolveOnboardingPlanItem("p1", "carry_down_deferred", "confirmed with the client", { session: fakeSession() });
  });
  const s = seen.first();
  assert.equal(s.fn, "resolve_onboarding_plan_item");
  assert.deepEqual(
    { p_plan: s.body.p_plan, p_item_key: s.body.p_item_key, p_resolution: s.body.p_resolution },
    { p_plan: "p1", p_item_key: "carry_down_deferred", p_resolution: "confirmed with the client" },
  );
  assert.match(String(s.body.p_op_key), /^[0-9a-f-]{36}$/);
});

test("commitClientOnboarding posts all four required args, p_attestation defaulting null when omitted", async () => {
  const { impl, seen } = captureFetch({ client_id: "c1", plan_id: "p1", status: "active", review_maker: "u1", attestation_kind: "distinct_checker" });
  await withMockedFetch(impl, async () => {
    await commitClientOnboarding({ clientId: "c1", planId: "p1", expectedPlanRevision: "rt1" }, { session: fakeSession() });
  });
  const s = seen.first();
  assert.equal(s.fn, "commit_client_onboarding");
  assert.deepEqual(
    { p_client: s.body.p_client, p_plan: s.body.p_plan, p_expected_plan_revision: s.body.p_expected_plan_revision, p_attestation: s.body.p_attestation },
    { p_client: "c1", p_plan: "p1", p_expected_plan_revision: "rt1", p_attestation: null },
  );
});

test("commitClientOnboarding carries an explicit attestation through only once supplied", async () => {
  const { impl, seen } = captureFetch({ client_id: "c1", plan_id: "p1", status: "active", review_maker: "u1", attestation_kind: "self_approval_attestation" });
  await withMockedFetch(impl, async () => {
    await commitClientOnboarding(
      { clientId: "c1", planId: "p1", expectedPlanRevision: "rt1", attestation: "I attest I onboarded this client alone" },
      { session: fakeSession() },
    );
  });
  assert.equal(seen.first().body.p_attestation, "I attest I onboarded this client alone");
});

test("commitClientOnboarding's CLR05 self_attestation refusal surfaces verbatim", async () => {
  const impl = (async () =>
    jsonResponse(
      { code: "CLR05", message: "solo onboarding commit requires an attestation", details: '{"reason":"self_attestation"}' },
      400,
    )) as typeof fetch;
  await withMockedFetch(impl, async () => {
    await assert.rejects(
      commitClientOnboarding({ clientId: "c1", planId: "p1", expectedPlanRevision: "rt1" }, { session: fakeSession() }),
      (e: unknown) => {
        assert.ok(isDoorRefusal(e));
        assert.equal((e as import("./api").DoorRefusal).code, "CLR05");
        assert.equal((e as import("./api").DoorRefusal).reason, "self_attestation");
        return true;
      },
    );
  });
});

test("commitClientOnboarding's CLR10 questions_unresolved refusal surfaces verbatim (0018_gate_k_domain.sql's typed-reason splice of the LIVE body — not the plain 0017 text)", async () => {
  const impl = (async () =>
    jsonResponse(
      { code: "CLR10", message: "required onboarding questions remain unresolved", details: '{"reason":"questions_unresolved"}' },
      400,
    )) as typeof fetch;
  await withMockedFetch(impl, async () => {
    await assert.rejects(
      commitClientOnboarding({ clientId: "c1", planId: "p1", expectedPlanRevision: "rt1" }, { session: fakeSession() }),
      (e: unknown) => {
        assert.ok(isDoorRefusal(e));
        assert.equal((e as import("./api").DoorRefusal).code, "CLR10");
        assert.equal((e as import("./api").DoorRefusal).reason, "questions_unresolved");
        return true;
      },
    );
  });
});

test("commitClientOnboarding's CLR06 stale_plan refusal surfaces verbatim", async () => {
  const impl = (async () =>
    jsonResponse({ code: "CLR06", message: "stale onboarding plan revision", details: '{"reason":"stale_plan"}' }, 400)) as typeof fetch;
  await withMockedFetch(impl, async () => {
    await assert.rejects(
      commitClientOnboarding({ clientId: "c1", planId: "p1", expectedPlanRevision: "stale-token" }, { session: fakeSession() }),
      (e: unknown) => {
        assert.ok(isDoorRefusal(e));
        assert.equal((e as import("./api").DoorRefusal).code, "CLR06");
        return true;
      },
    );
  });
});

test("cancelClientOnboarding posts p_client + p_plan + p_reason + op_key to cancel_client_onboarding", async () => {
  const { impl, seen } = captureFetch({ client_id: "c1", plan_id: "p1", status: "archived" });
  await withMockedFetch(impl, async () => {
    await cancelClientOnboarding({ clientId: "c1", planId: "p1", reason: "opened in error, duplicate of an existing client" }, { session: fakeSession() });
  });
  const s = seen.first();
  assert.equal(s.fn, "cancel_client_onboarding");
  assert.deepEqual(
    { p_client: s.body.p_client, p_plan: s.body.p_plan, p_reason: s.body.p_reason },
    { p_client: "c1", p_plan: "p1", p_reason: "opened in error, duplicate of an existing client" },
  );
  assert.match(String(s.body.p_op_key), /^[0-9a-f-]{36}$/);
});

test("cancelClientOnboarding's CLR10 not-open refusal surfaces verbatim", async () => {
  const impl = (async () => jsonResponse({ code: "CLR10", message: "client onboarding is not open" }, 400)) as typeof fetch;
  await withMockedFetch(impl, async () => {
    await assert.rejects(
      cancelClientOnboarding({ clientId: "c1", planId: "p1", reason: "duplicate" }, { session: fakeSession() }),
      (e: unknown) => {
        assert.ok(isDoorRefusal(e));
        assert.equal((e as import("./api").DoorRefusal).code, "CLR10");
        assert.equal((e as import("./api").DoorRefusal).message, "client onboarding is not open");
        return true;
      },
    );
  });
});
