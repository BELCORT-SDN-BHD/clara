// ⌘K "Do" — the live allowlist READ and the one dispatcher (裁-37).
//
// ONE READ PER PALETTE OPEN, never a module cache. `loadDoEnv` is called from the palette's
// own mount effect, so every invocation of ⌘K asks the database again: a grant changed in
// another tab, a role revoked a minute ago, a plan committed since the last open — all of it
// lands on the next open with nothing to invalidate and nothing to redeploy.
//
// THE READ IS FAIL-CLOSED IN BOTH DIRECTIONS. A failed `caller_context` read yields
// `ctx: null`, which `permittedDoActions` turns into an empty list. A failed CLIENT read
// yields `client: null`, which drops every client-altitude row rather than offering one on a
// precondition nobody established — `planId: null` inside a SUCCESSFUL client read means
// "read, and there is no plan"; a failed read never produces that shape.
//
// THE DISPATCHER RE-CHECKS. `runDoAction` evaluates `isDoActionPermitted` against the same
// env before it touches a door — the SAME predicate the render list used, not a copy of it
// (裁-107a: a gate proved through a copy of its predicate is not proved). A row that reached
// a click by any route other than that predicate returning true does nothing.

import { beginClientOnboarding, bootstrapClientPlan, getMostRecentOnboardingPlan, getOnboardingClient } from "@/lib/onboarding/api";
import { startClientInterview } from "@/lib/interview/api";
import { loadCallerContext } from "@/lib/identity/caller-context";
import type { SessionTokenAccessor } from "@/lib/session";
import { isDoActionPermitted, type ClientDoContext, type DoActionEnv, type DoActionSpec } from "./do-actions";

/**
 * The live allowlist read. `query` is folded in by the caller at render time; this function
 * reads only what the DATABASE owns.
 *
 * THE TWO FAILURES ARE NOT THE SAME FAILURE, and this function keeps them apart:
 *
 *   * The ALLOWLIST read failing THROWS. "We could not find out what you may do" and "there
 *     is nothing here for you to do" are different sentences, and the palette renders them
 *     differently — collapsing the first into the second would tell a professional their role
 *     grants nothing on the strength of a read that never landed.
 *   * A CLIENT precondition read failing is CAUGHT and yields `client: null`, which drops
 *     every client-altitude row. That is the fail-closed arm for one action's own
 *     precondition, not a claim about the caller's authority, and it must not take the whole
 *     section down with it.
 */
export async function loadDoEnv(
  session: SessionTokenAccessor,
  clientId: string | null,
): Promise<Omit<DoActionEnv, "query">> {
  const ctx = await loadCallerContext(session);
  if (clientId === null) return { ctx, client: null };
  const client = await loadClientDoContext(session, clientId).catch(() => null);
  return { ctx, client };
}

async function loadClientDoContext(
  session: SessionTokenAccessor,
  clientId: string,
): Promise<ClientDoContext | null> {
  // The SAME two reads OnboardingChecklistCard's own loader makes, in the same order — one
  // shape for "what is this client's onboarding state", not a second, drifting one. A client
  // RLS does not admit resolves to `null` here (no row, no rows offered), never to a
  // fabricated status.
  const client = await getOnboardingClient(clientId, { session });
  if (!client) return null;
  const plan = await getMostRecentOnboardingPlan(clientId, { session });
  return {
    clientId,
    clientStatus: client.status,
    planId: plan?.id ?? null,
    planState: plan?.state ?? null,
  };
}

export type DoDispatchResult =
  | { kind: "refused" }
  | { kind: "navigated"; href: string }
  | { kind: "done" };

/**
 * Performs EXACTLY ONE governed act, then reports where the human should look. Nothing here
 * invents a receipt: `begin_client_onboarding` returns the DB's own `{client_id, plan_id}`
 * and the caller navigates to that client's real workspace; the interview start returns the
 * runtime's own run id and the caller opens the rail, where the run renders itself. A
 * refusal is NOT caught here — `callDoor`'s `DoorRefusal` propagates to the palette, which
 * renders it verbatim (apps/web/AGENTS.md).
 */
export async function runDoAction(
  spec: DoActionSpec,
  env: DoActionEnv,
  session: SessionTokenAccessor,
): Promise<DoDispatchResult> {
  if (!isDoActionPermitted(spec, env)) return { kind: "refused" };

  switch (spec.id) {
    case "beginClientOnboarding": {
      const out = await beginClientOnboarding(env.query.trim(), { session });
      return { kind: "navigated", href: `/clients/${out.client_id}` };
    }
    case "startClientInterview": {
      const client = env.client;
      // Re-narrowed rather than asserted: `ready` already proved both, and TypeScript is
      // told the same thing the predicate established instead of being overridden.
      if (client === null || client.planId === null) return { kind: "refused" };
      await startClientInterview({ clientId: client.clientId, planId: client.planId }, { session });
      return { kind: "done" };
    }
    case "bootstrapClientPlan": {
      const client = env.client;
      if (client === null) return { kind: "refused" };
      await bootstrapClientPlan(client.clientId, { session });
      return { kind: "done" };
    }
  }
}
