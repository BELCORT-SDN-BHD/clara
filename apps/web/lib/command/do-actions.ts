// ⌘K "Do" — the dispatchable runs, and the LIVE allowlist that decides which of them this
// caller may see or fire (裁-37).
//
// ============================================================================
// THE RULING, AND THE ONE PLACE THIS BUILD DEPARTS FROM ITS WORDING
// ============================================================================
// 裁-37: "lit ONLY for the DB-allowlisted wake verbs, with a live allowlist check per
// action — the palette asks the database what it may do, every time, rather than shipping a
// hard-coded list that drifts the day a verb's grant changes… The allowlist read is the same
// shape the rest of the estate uses, so this mints no new mechanism."
//
// MEASURED AT RUNG 0 (2026-09-02): `clara.wake_fn_allowlist` is NOT READABLE by a human
// session, and cannot be made so without minting the mechanism the ruling's own last
// sentence forbids. The table is created at 0002_foundation.sql:247; 0002:482-493 enables
// and FORCES RLS on it with an owner-only policy, and 0002:522-525 says in its own words
// that it "gets no app policy at all — invisible to app roles"; a repo-wide grep for a
// GRANT on it returns nothing. It is a belt on the WAKE roles' EXECUTE grants — it lists
// which `wake_*` entry function each wake_kind may invoke — and `clara_authenticated` holds
// EXECUTE on none of those functions in the first place. A palette that "asked the database
// what it may do" through that table would be asking about the AGENT's authority, not the
// human's, and it could not ask at all.
//
// WHAT THIS SHIPS INSTEAD, and why it satisfies the ruling's PURPOSE. The rows are lit from
// a LIVE, PER-ACTION read of the relations the caller's own session genuinely holds:
//   * `clara.caller_context` — the caller's live `role_rank`, the DB's OWN evaluation of
//     `clara.role_rank(m.role)` (0141:549). Every action declares the floor its door's live
//     body enforces through `clara._human_ctx(clara.role_rank(...))`, and the row lights only
//     when the DB's rank meets it. Change a member's role in the database and the palette
//     follows on the next open, with nothing to redeploy — which is the drift the ruling names.
//   * the action's OWN precondition, read live where it has one (an open onboarding plan,
//     an absent one), so a row is never offered for a dispatch the DB would refuse anyway.
// No cache, no memo across opens: `CommandKProvider` mounts the palette body fresh on every
// invocation, and the read runs then.
//
// **THIS IS A DEPARTURE FROM THE RULING'S LITERAL WORDING AND IS FLAGGED TO THE OWNER IN THE
// PR BODY, NOT ABSORBED** (constraint 1: a design-vs-contract collision is the owner's call).
// If the owner wants the wake allowlist itself, that is a DB PR minting a human-readable
// projection of it — a new mechanism, and a separate decision.
//
// ============================================================================
// FAIL-CLOSED, TWICE
// ============================================================================
// (1) RENDER: `permittedDoActions` returns `[]` for a null context — a failed read, a signed
//     out session, a caller with no active membership, or an ambiguous two-row context all
//     land there. The palette then shows an honest empty note, never a disabled row that
//     implies the action exists for someone else.
// (2) EXECUTE: `isDoActionPermitted` is re-evaluated inside the dispatcher against the SAME
//     live context, so a row that reached the DOM through any means (a stale render, a
//     mutated list) still cannot fire. The render list and the execute gate call ONE
//     predicate — never a copy of it — because a gate proved through a copy of its predicate
//     is not proved at all (裁-107a).
//
// The database is still the wall behind both: every door below is `security definer` with
// its own `_human_ctx` floor and raises CLR04 for a caller under it. Nothing here is the
// security boundary; it is the honest-affordance boundary, so a professional is not offered
// a control that would refuse.

import type { CallerContextRow, FirmRole } from "@/lib/identity/caller-context";
import { meetsFloor } from "@/lib/identity/caller-context";

export type DoActionId = "beginClientOnboarding" | "startClientInterview" | "bootstrapClientPlan";

/** What the palette knows about the client altitude it is sitting on, read live when a
 *  client is in scope. Every field is a DB fact or `null` for "not read" — a null never
 *  means "no", it means the row is not offered (absence is not evidence). */
export type ClientDoContext = {
  clientId: string;
  /** `clara.clients.status` for this client, via `getOnboardingClient`. */
  clientStatus: string | null;
  /** The most recent `clara.onboarding_plans` row's id and state, or null when none. */
  planId: string | null;
  planState: string | null;
};

export type DoActionEnv = {
  ctx: CallerContextRow | null;
  client: ClientDoContext | null;
  /** The text typed into the palette — the name argument `begin_client_onboarding` takes. */
  query: string;
};

export interface DoActionSpec {
  id: DoActionId;
  /** Where the row can appear at all. `client` rows need a client in the URL. */
  altitude: "any" | "client";
  /**
   * The floor the DOOR's own live body enforces, TRANSCRIBED AT RUNG 0 — read out of the
   * body, never inferred from the door's name or from a sibling's floor. Two of these three
   * are `admin`, not the `bookkeeper` an "onboarding is bookkeeper work" reading would
   * assume, and a palette that guessed would have offered a bookkeeper two rows that CLR04
   * on click:
   *   begin_client_onboarding      0017_wave_b.sql:2497  `_human_ctx(role_rank('admin'))`
   *   bootstrap_client_plan        0017_wave_b.sql:2574  `_human_ctx(role_rank('admin'))`
   *   /api/interview/client/start  packages/runtime/src/interviewRoutes.ts:280 —
   *                                `isBookkeeperPlus(p.role)`, and the DB re-validates the
   *                                caller on the binding write (`update_onboarding_plan`,
   *                                CLR04, 0017:2662-2667). Bookkeeper.
   */
  floor: FirmRole;
  keywords?: string[];
  /** The action's own live precondition. `true` only when a READ positively established it. */
  ready: (env: DoActionEnv) => boolean;
}

export const DO_ACTIONS: readonly DoActionSpec[] = [
  {
    // The palette's own input IS the door's `p_name` argument — type a name, dispatch the
    // file. Offered at every altitude because the door mints a brand-new client and takes
    // no existing client id (OnboardingChecklistCard's own header records that shape).
    id: "beginClientOnboarding",
    altitude: "any",
    floor: "admin",
    keywords: ["begin", "onboard", "new client", "open a file"],
    ready: (env) => env.query.trim().length > 0,
  },
  {
    // Idempotent by the route's own contract: 202 mints, 200 `existing:true` returns the run
    // already bound to this plan. Only while the plan is OPEN — every other state is a run
    // the interview cannot bind to.
    id: "startClientInterview",
    altitude: "client",
    floor: "bookkeeper",
    keywords: ["interview", "questions", "continue", "resume"],
    ready: (env) => env.client?.planState === "open" && typeof env.client.planId === "string",
  },
  {
    // The carry-down plan a pre-existing ACTIVE client never received. `no plan` is read,
    // not inferred from a failed read: `planId === null` here is only ever set by a
    // successful `getMostRecentOnboardingPlan` that returned nothing.
    id: "bootstrapClientPlan",
    altitude: "client",
    floor: "admin",
    keywords: ["bootstrap", "plan", "carry down"],
    ready: (env) => env.client !== null && env.client.clientStatus === "active" && env.client.planId === null,
  },
];

/**
 * THE ONE PREDICATE. Both the render list and the execute gate call this — see the
 * fail-closed note above for why it is not duplicated.
 */
export function isDoActionPermitted(spec: DoActionSpec, env: DoActionEnv): boolean {
  if (!meetsFloor(env.ctx, spec.floor)) return false;
  if (spec.altitude === "client" && env.client === null) return false;
  return spec.ready(env);
}

/** The live allowlist's answer: the subset this caller may dispatch, right now. */
export function permittedDoActions(env: DoActionEnv, catalog: readonly DoActionSpec[] = DO_ACTIONS): DoActionSpec[] {
  return catalog.filter((spec) => isDoActionPermitted(spec, env));
}

export function findDoAction(id: string, catalog: readonly DoActionSpec[] = DO_ACTIONS): DoActionSpec | null {
  return catalog.find((spec) => spec.id === id) ?? null;
}
