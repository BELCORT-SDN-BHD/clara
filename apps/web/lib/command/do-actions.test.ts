// 裁-37 — ⌘K "Do" is lit by a LIVE allowlist read, per action, every time.
//
// THE ACCEPTANCE THE DESIGN OF RECORD NAMES, verbatim: "the Do allowlist read proven to be
// per-action and live (a test in which the allowlist changes between two invocations and the
// palette follows)". That is the third cell below, and it drives the change through the REAL
// read (`loadDoEnv`) rather than by handing the predicate two different objects — a copy of
// the input is not the gate (裁-107a).

import assert from "node:assert/strict";
import { test } from "node:test";

import { DO_ACTIONS, findDoAction, isDoActionPermitted, permittedDoActions, type DoActionEnv } from "./do-actions";
import { loadDoEnv, runDoAction } from "./do-dispatch";
import { isDoorRefusal } from "@/lib/doors";
import type { CallerContextRow } from "@/lib/identity/caller-context";
import type { SessionTokenAccessor } from "@/lib/session";

const CLIENT_ID = "22222222-2222-4222-8222-222222222222";
const PLAN_ID = "33333333-3333-4333-8333-333333333333";
const session: SessionTokenAccessor = { getAccessToken: async () => "tok" };

const ctxAt = (role: string, rank: number | null): CallerContextRow => ({
  user_id: "11111111-1111-4111-8111-111111111111",
  firm_id: "44444444-4444-4444-8444-444444444444",
  firm_name: "BELCORT",
  role,
  role_rank: rank,
  is_operator: false,
});

const OWNER = ctxAt("owner", 3);
const ADMIN = ctxAt("admin", 2);
const BOOKKEEPER = ctxAt("bookkeeper", 1);
const VIEWER = ctxAt("viewer", 0);

const openPlanClient = { clientId: CLIENT_ID, clientStatus: "onboarding", planId: PLAN_ID, planState: "open" };
const noPlanClient = { clientId: CLIENT_ID, clientStatus: "active", planId: null, planState: null };

const idsFor = (env: DoActionEnv) => permittedDoActions(env).map((spec) => spec.id).sort();

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

async function withFetch(impl: (url: string, init?: RequestInit) => Response, run: (calls: { url: string; body: unknown }[]) => Promise<void>): Promise<void> {
  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
  const calls: { url: string; body: unknown }[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    let body: unknown = null;
    if (typeof init?.body === "string") { try { body = JSON.parse(init.body); } catch { body = init.body; } }
    calls.push({ url, body });
    return impl(url, init);
  }) as typeof fetch;
  try {
    await run(calls);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
  }
}

// ---------------------------------------------------------------------------
// THE FLOORS, transcribed from each door's live body
// ---------------------------------------------------------------------------

test("every Do row is gated on the floor its own door enforces, and the DB's rank is what meets it", () => {
  // open_client_onboarding is `_human_ctx(role_rank('admin'))` (0287_client_birth_wall.sql §B),
  // NOT bookkeeper. A bookkeeper who saw this row would meet CLR04 on click.
  assert.deepEqual(idsFor({ ctx: BOOKKEEPER, client: null, query: "ROME PROPERTIES" }), []);
  assert.deepEqual(idsFor({ ctx: ADMIN, client: null, query: "ROME PROPERTIES" }), ["beginClientOnboarding"]);
  assert.deepEqual(idsFor({ ctx: OWNER, client: null, query: "ROME PROPERTIES" }), ["beginClientOnboarding"]);

  // The interview start floors at bookkeeper (interviewRoutes.ts:280 `isBookkeeperPlus`), so
  // a bookkeeper DOES get it — the two floors are genuinely different and this proves the
  // catalog carries both rather than one blanket rank.
  assert.deepEqual(idsFor({ ctx: BOOKKEEPER, client: openPlanClient, query: "" }), ["startClientInterview"]);
  assert.deepEqual(
    idsFor({ ctx: ADMIN, client: openPlanClient, query: "" }),
    ["startClientInterview"],
    "an open plan already exists, so bootstrap's own precondition excludes it even for an admin",
  );
  assert.deepEqual(idsFor({ ctx: ADMIN, client: noPlanClient, query: "" }), ["bootstrapClientPlan"]);
});

test("FAIL-CLOSED: no context, no rank, and a viewer all light nothing", () => {
  for (const ctx of [null, ctxAt("owner", null), VIEWER]) {
    assert.deepEqual(
      idsFor({ ctx, client: openPlanClient, query: "ROME PROPERTIES" }),
      [],
      "a null context, a NULL role_rank (the DB declining to rank the caller) and a viewer are all 'nothing offered'",
    );
  }
});

test("a client-altitude row is absent at firm altitude, and an unread client is not an absent one", () => {
  assert.deepEqual(idsFor({ ctx: OWNER, client: null, query: "" }), [], "no client in scope, no client rows, and an empty query drops begin too");
  // `client: null` is what a FAILED client read produces. It must drop the rows, never
  // default them in on a precondition nobody established.
  assert.equal(isDoActionPermitted(findDoAction("startClientInterview")!, { ctx: OWNER, client: null, query: "" }), false);
});

test("each action's OWN live precondition gates it, not just the role", () => {
  const committed = { clientId: CLIENT_ID, clientStatus: "active", planId: PLAN_ID, planState: "committed" };
  assert.deepEqual(idsFor({ ctx: OWNER, client: committed, query: "" }), [], "a committed plan starts no interview and needs no bootstrap");
  assert.deepEqual(
    idsFor({ ctx: OWNER, client: { ...noPlanClient, clientStatus: "onboarding" }, query: "" }),
    [],
    "bootstrap_client_plan refuses a client that is not already active (0017:2578-2604) — the row is absent rather than doomed",
  );
  assert.deepEqual(idsFor({ ctx: OWNER, client: null, query: "   " }), [], "a blank name is not a name");
});

// ---------------------------------------------------------------------------
// THE DESIGN'S OWN ACCEPTANCE: the allowlist changes between two invocations
// ---------------------------------------------------------------------------

test("PER-ACTION AND LIVE: the same caller's rows change when the DATABASE's answer changes, with no redeploy", async () => {
  let role = { role: "bookkeeper", role_rank: 1 };
  await withFetch(
    (url) => {
      if (url.includes("/rest/v1/caller_context")) return json([{ ...OWNER, ...role }]);
      if (url.includes("/rest/v1/clients")) return json([{ id: CLIENT_ID, name: "ROME PROPERTIES", status: "active" }]);
      if (url.includes("/rest/v1/onboarding_plans")) return json([]);
      throw new Error(`unexpected fetch: ${url}`);
    },
    async (calls) => {
      // INVOCATION 1 — the database says bookkeeper. Bootstrap floors at admin, so it is absent.
      const first = await loadDoEnv(session, CLIENT_ID);
      assert.deepEqual(idsFor({ ...first, query: "" }), []);

      // The GRANT CHANGES in the database — nothing in the browser is invalidated, rebuilt
      // or redeployed.
      role = { role: "admin", role_rank: 2 };

      // INVOCATION 2 — the palette asks again and follows.
      const second = await loadDoEnv(session, CLIENT_ID);
      assert.deepEqual(idsFor({ ...second, query: "" }), ["bootstrapClientPlan"]);

      const contextReads = calls.filter((c) => c.url.includes("/rest/v1/caller_context"));
      assert.equal(contextReads.length, 2, "the allowlist is READ on each invocation — never cached across opens");
      assert.match(contextReads[0]!.url, /limit=2/, "exact-one: an ambiguous context stays observable");
    },
  );
});

test("a failed ALLOWLIST read THROWS — 'could not check' is not 'nothing to do'", async () => {
  await withFetch(
    () => json({ message: "boom" }, 500),
    async () => {
      // Swallowing this into an empty list would tell a professional their role grants
      // nothing, on the strength of a read that never landed. The palette renders the two
      // states with different sentences, so the read has to hand it two outcomes.
      await assert.rejects(() => loadDoEnv(session, CLIENT_ID));
    },
  );
});

test("a failed CLIENT precondition read drops only the client rows, and never the whole section", async () => {
  await withFetch(
    (url) => {
      if (url.includes("/rest/v1/caller_context")) return json([{ ...OWNER }]);
      return json({ message: "boom" }, 500);
    },
    async () => {
      const env = await loadDoEnv(session, CLIENT_ID);
      assert.ok(env.ctx, "the caller's authority was established");
      assert.equal(env.client, null, "the client's own state was not — so its rows are absent");
      assert.deepEqual(
        idsFor({ ...env, query: "ROME PROPERTIES" }),
        ["beginClientOnboarding"],
        "the action that needs no client precondition still stands",
      );
    },
  );
});

test("a caller with NO active membership lights nothing, and that is a read, not a failure", async () => {
  await withFetch(
    (url) => (url.includes("/rest/v1/caller_context") ? json([]) : json([])),
    async () => {
      const env = await loadDoEnv(session, null);
      assert.equal(env.ctx, null, "zero rows is the holding state's own fail-closed default");
      assert.deepEqual(idsFor({ ...env, query: "ROME PROPERTIES" }), []);
    },
  );
});

// ---------------------------------------------------------------------------
// THE SECURITY WALL: nothing executes that the read did not return
// ---------------------------------------------------------------------------

test("SECURITY: an action outside the live allowlist executes NOTHING, even when dispatched directly", async () => {
  const spec = findDoAction("beginClientOnboarding")!;
  // A bookkeeper is below this door's admin floor, so the row never renders. This drives the
  // DISPATCHER anyway — the shape a stale render, or anything else that got a click through,
  // would take — and proves the second gate holds.
  await withFetch(
    (url) => {
      throw new Error(`no door may be reached: ${url}`);
    },
    async (calls) => {
      const result = await runDoAction(spec, { ctx: BOOKKEEPER, client: null, query: "ROME PROPERTIES" }, session);
      assert.deepEqual(result, { kind: "refused" });
      assert.deepEqual(calls, [], "not one request left the browser");
    },
  );
});

test("SECURITY: a permitted action calls its door with exactly the arguments the live body takes", async () => {
  // #899: this dispatch now reaches clara.open_client_onboarding, not clara.begin_client_
  // onboarding — see do-dispatch.ts's own "beginClientOnboarding" case.
  const spec = findDoAction("beginClientOnboarding")!;
  await withFetch(
    (url) => {
      if (url.includes("/rest/v1/rpc/open_client_onboarding")) {
        return json({ client_id: CLIENT_ID, plan_id: PLAN_ID });
      }
      throw new Error(`unexpected fetch: ${url}`);
    },
    async (calls) => {
      const result = await runDoAction(spec, { ctx: ADMIN, client: null, query: "  ROME PROPERTIES  " }, session);
      assert.deepEqual(result, { kind: "navigated", href: `/clients/${CLIENT_ID}` }, "the destination is the DB's OWN returned client id");

      const door = calls.find((c) => c.url.includes("/rest/v1/rpc/open_client_onboarding"));
      assert.ok(door);
      const body = door.body as Record<string, unknown>;
      assert.equal(body.p_name, "ROME PROPERTIES", "trimmed — the door refuses a blank name and never sees the padding");
      assert.equal(typeof body.p_op_key, "string");
      // The palette never asks the identity read, so both new parameters travel as null — the
      // door's OWN arity-1/arity->=2 wall is what clears or refuses this call, never a client-
      // side guess (0287's header).
      assert.equal(body.p_identifier, null);
      assert.equal(body.p_acknowledged_candidate, null);
      assert.deepEqual(
        Object.keys(body).sort(),
        ["p_acknowledged_candidate", "p_identifier", "p_name", "p_op_key"],
        "exactly the four parameters clara.open_client_onboarding(p_name text, p_op_key text, p_identifier jsonb, p_acknowledged_candidate uuid) declares",
      );
    },
  );
});

test("#899: the palette cannot create a two-match client — the door's own arity->=2 refusal propagates VERBATIM, and nothing is dispatched twice or navigated to", async () => {
  // THE PALETTE NEVER ASKS clara.client_identity_candidates first (unlike AddClientControl):
  // it dispatches the typed name straight to the birth door, so this is the one path where the
  // DOOR'S OWN structural wall — not a client-side pre-check — is the only thing standing
  // between a typed name and a third same-family client. This is what 0287_client_birth_wall.sql
  // closed p649.identity.direct_birth_residual FOR.
  const spec = findDoAction("beginClientOnboarding")!;
  await withFetch(
    (url) => {
      if (url.includes("/rest/v1/rpc/open_client_onboarding")) {
        return json(
          {
            code: "CLR10",
            message: "this name matches 2 existing clients or counterparties in your firm; decide which business this is before another record is created",
            details: JSON.stringify({
              reason: "name_family_collision", class: "client_identity", name: "ROME VENTURES", arity: 2,
              candidates: [{ id: CLIENT_ID, name: "Rome Public Advisory", party_kind: "client", match_reason: "name_family" }],
            }),
          },
          400,
        );
      }
      throw new Error(`unexpected fetch: ${url}`);
    },
    async (calls) => {
      await assert.rejects(
        () => runDoAction(spec, { ctx: ADMIN, client: null, query: "ROME VENTURES" }, session),
        (err: unknown) => {
          assert.ok(isDoorRefusal(err), "a DoorRefusal, not a swallowed failure");
          assert.equal((err as { code: string }).code, "CLR10");
          assert.equal((err as { reason: string | null }).reason, "name_family_collision");
          return true;
        },
      );
      assert.equal(calls.length, 1, "exactly one call left the browser — never a retry, never a second attempt");
    },
  );
});

test("#899: the palette cannot create a one-match client silently either — it carries no acknowledgement face, so the door's own arity-1 wall refuses and names the register's control, VERBATIM", async () => {
  // env.identityAcknowledgedCandidate is set only by a face that showed a candidate and read a
  // tick (AddClientControl) — the palette never sets it, so this dispatch reaches
  // clara.open_client_onboarding exactly as the arity->=2 cell above does: p_identifier and
  // p_acknowledged_candidate both null. open_client_onboarding requires an acknowledgement at
  // EVERY arity 1, not only clears it like the legacy begin_client_onboarding door does — this is
  // what "refuses and points at the register's control" (0899's own Agent Brief) means in code.
  const spec = findDoAction("beginClientOnboarding")!;
  await withFetch(
    (url) => {
      if (url.includes("/rest/v1/rpc/open_client_onboarding")) {
        return json(
          {
            code: "CLR10",
            message: "this name matches an existing client or counterparty in your firm; open the client register's Add Client control to review it and acknowledge before a new record is created",
            details: JSON.stringify({
              reason: "identity_acknowledgement_required", class: "client_identity", name: "TIMUR VENTURES", arity: 1,
              candidates: [{ id: CLIENT_ID, name: "Timur Public Advisory", party_kind: "client", match_reason: "name_family" }],
            }),
          },
          400,
        );
      }
      throw new Error(`unexpected fetch: ${url}`);
    },
    async (calls) => {
      await assert.rejects(
        () => runDoAction(spec, { ctx: ADMIN, client: null, query: "TIMUR VENTURES" }, session),
        (err: unknown) => {
          assert.ok(isDoorRefusal(err), "a DoorRefusal, not a swallowed failure");
          assert.equal((err as { code: string }).code, "CLR10");
          assert.equal((err as { reason: string | null }).reason, "identity_acknowledgement_required");
          assert.match((err as { message: string }).message, /client register's Add Client control/,
            "the DB's own message, rendered verbatim, is what points the human at the register — not a client-side sentence");
          return true;
        },
      );
      const door = calls.find((c) => c.url.includes("/rest/v1/rpc/open_client_onboarding"));
      assert.equal((door!.body as Record<string, unknown>).p_acknowledged_candidate, null,
        "the palette forwards no acknowledgement — it has no candidate face to read one from");
      assert.equal(calls.length, 1, "exactly one call left the browser — never a retry, never a second attempt");
    },
  );
});

test("the catalog carries no action without a floor, and every altitude is one of the two the palette knows", () => {
  assert.ok(DO_ACTIONS.length > 0);
  for (const spec of DO_ACTIONS) {
    assert.ok(["viewer", "bookkeeper", "admin", "owner"].includes(spec.floor), `${spec.id} declares a real firm role as its floor`);
    assert.ok(["any", "client"].includes(spec.altitude), `${spec.id} declares a known altitude`);
  }
});
