// T11 client onboarding — reads + doors. See ./types.ts's header for the rung-0
// grounding: five human doors, all EXECUTE-granted to clara_authenticated
// (0017:5137-5161, floors enforced INSIDE each body via
// `_human_ctx(role_rank(...))` — admin for begin/bootstrap/commit/cancel,
// bookkeeper+ for resolve — never re-derived client-side; the DB is the wall,
// this module only shapes the affordance). FOUR of the five are UNCHANGED
// since 0017 (no CREATE OR REPLACE, no splice, found across every migration
// file). The fifth, commit_client_onboarding, is CREATEd at 0017 then
// DYNAMICALLY SPLICED by 0018_gate_k_domain.sql SS4 — see that function's own
// doc comment below for what changed and why this matters (the migration-
// citation law: chase the LIVE body, never the first CREATE).
//
// Reads ride `getRows` (../read) — direct RLS-scoped table GETs, not RPCs; see
// ./types.ts's header for the grant/policy citations. Writes ride `callDoor`
// (../doors); every op_key is minted fresh per attempt (crypto.randomUUID()),
// never reused across a retry (doors.ts's "never retry a refusal" law).

import { callDoor, DoorRefusal, isDoorRefusal } from "../doors";
import { getRows } from "../read";
import type { SessionTokenAccessor } from "@/lib/session";
import type { OnboardingClientRow, OnboardingPlanItemRow, OnboardingPlanRow } from "./types";

export { DoorRefusal, isDoorRefusal };

type Opts = { session?: SessionTokenAccessor; signal?: AbortSignal };

const PLAN_COLUMNS =
  "id,firm_id,scope_kind,client_id,state,revision_token,revision_n,committed_at,committed_by," +
  "review_maker,reviewed_at,contributors,commit_attestation,cancelled_at,cancelled_by,cancel_reason," +
  "created_at,updated_at,opened_by_agent,opener_model,opened_from_question";

const ITEM_COLUMNS =
  "id,plan_id,firm_id,item_kind,item_key,question,answer,state,required_for_commit," +
  "answered_by,answered_at,created_at,updated_at";

/** The client's most recently created onboarding plan (any state) — `null`
 *  when this client has never had one at all (the pre-0017 bootstrap case, or
 *  a client this session cannot see). `uq_onboarding_plans_one_open`
 *  (0017:1038-1039) means at most one row can ever be `state='open'` for a
 *  given client, so "most recent" and "the open one, if any exists" agree in
 *  the only case that matters for the checklist's own honesty — a committed
 *  or cancelled plan is still the most recent history worth showing when no
 *  open one exists. */
export async function getMostRecentOnboardingPlan(clientId: string, opts: Opts = {}): Promise<OnboardingPlanRow | null> {
  const rows = await getRows<OnboardingPlanRow>("onboarding_plans", {
    select: PLAN_COLUMNS,
    filters: { client_id: `eq.${clientId}` },
    order: "created_at.desc",
    limit: 1,
    ...opts,
  });
  return rows[0] ?? null;
}

/** Every item on one plan, in creation order (the interview/bootstrap's own
 *  authoring order — never re-sorted by state or key here). */
export async function listOnboardingPlanItems(planId: string, opts: Opts = {}): Promise<OnboardingPlanItemRow[]> {
  return getRows<OnboardingPlanItemRow>("onboarding_plan_items", {
    select: ITEM_COLUMNS,
    filters: { plan_id: `eq.${planId}` },
    order: "created_at.asc",
    ...opts,
  });
}

/** Just enough of `clara.clients` to tell the card's three shapes apart —
 *  never the full register read (`lib/firm/reads.ts`'s own job). `null` when
 *  this session cannot see the client at all (RLS, or a bad id). */
export async function getOnboardingClient(clientId: string, opts: Opts = {}): Promise<OnboardingClientRow | null> {
  const rows = await getRows<OnboardingClientRow>("clients", {
    select: "id,name,status",
    filters: { id: `eq.${clientId}` },
    limit: 1,
    ...opts,
  });
  return rows[0] ?? null;
}

/** F2 fix (rev-t11): whether a FINALIZED opening seed exists for this
 *  client+plan — the one disjunct of commit_client_onboarding's
 *  `opening_position_required` OR-of-three-EXISTS (0017:2812-2822) this
 *  module cannot answer from `onboarding_plan_items` alone (the other two
 *  disjuncts are item-key checks over data this card already holds; see
 *  `OnboardingChecklistCard.tsx`'s `openingPositionCaptured`). T2 (port-wave
 *  plan §4 T2) owns `opening_seed_registry`'s own UI — this is a narrow,
 *  read-only existence check, not a re-implementation of T2's surface. Same
 *  access class as onboarding_plans/items: direct `clara_authenticated`
 *  SELECT grant, no DML (0017:5114-5122). Deliberately checked so this
 *  card's opening-position gate is HONEST (never a false denial the DB
 *  would actually allow) rather than skipped outright. */
export async function hasFinalizedOpeningSeed(clientId: string, planId: string, opts: Opts = {}): Promise<boolean> {
  const rows = await getRows<{ id: string }>("opening_seed_registry", {
    select: "id",
    filters: { client_id: `eq.${clientId}`, plan_id: `eq.${planId}`, state: "eq.finalized" },
    limit: 1,
    ...opts,
  });
  return rows.length > 0;
}

const opKey = (): string => crypto.randomUUID();

/** clara.begin_client_onboarding(p_name text, p_op_key text) — 0017:2492,
 *  admin floor. Mints a BRAND NEW client (status 'onboarding') + its plan in
 *  one transaction — this is the ONLY one of the five doors that does not
 *  take an existing client id. Returns `{client_id, plan_id}` (0017:2522). */
export async function beginClientOnboarding(name: string, opts: Opts = {}): Promise<{ client_id: string; plan_id: string }> {
  return callDoor("begin_client_onboarding", { p_name: name, p_op_key: opKey() }, opts);
}

/** clara.bootstrap_client_plan(p_client uuid, p_op_key text) — 0017:2567,
 *  admin floor. The B-12 bridge for an ACTIVE client born before 0017 with no
 *  onboarding plan at all — refuses `active_client_bootstrap_required` (CLR10)
 *  if the client is not already 'active', and is plan-idempotent (a repeat
 *  call on an already-bootstrapped client returns the existing plan/item,
 *  `bootstrap_status: 'already_bootstrapped'`, 0017:2602-2604) — never a
 *  second plan. */
export async function bootstrapClientPlan(
  clientId: string,
  opts: Opts = {},
): Promise<{ client_id: string; plan_id: string; item_id: string; status: string; bootstrap_status: string }> {
  return callDoor("bootstrap_client_plan", { p_client: clientId, p_op_key: opKey() }, opts);
}

/** clara.resolve_onboarding_plan_item(p_plan uuid, p_item_key text,
 *  p_resolution text, p_op_key text) — 0017:2706, bookkeeper+ floor. Writes
 *  `answer=to_jsonb(p_resolution)`, `state='resolved'` (0017:2726-2733) —
 *  there is no separate "answer" vs "resolve" door in this train's scope;
 *  this is the one generic human resolution door for a plan item. */
export async function resolveOnboardingPlanItem(
  planId: string,
  itemKey: string,
  resolution: string,
  opts: Opts = {},
): Promise<{ plan_id: string; item_id: string; state: string; revision_token: string; revision_n: number }> {
  return callDoor(
    "resolve_onboarding_plan_item",
    { p_plan: planId, p_item_key: itemKey, p_resolution: resolution, p_op_key: opKey() },
    opts,
  );
}

/** clara.commit_client_onboarding(p_client uuid, p_plan uuid,
 *  p_expected_plan_revision uuid, p_op_key text, p_attestation text DEFAULT
 *  NULL) — CREATEd at 0017:2751, then DYNAMICALLY SPLICED by
 *  0018_gate_k_domain.sql SS4 (anchor-based prosrc surgery, not a
 *  CREATE OR REPLACE — the LIVE body differs from 0017's own text; the
 *  migration-citation law: "chase the LIVE body… never cite a migration's
 *  first CREATE without checking what superseded it"). Signature and floor
 *  (admin) are UNCHANGED by the splice — only the CLR10 arm gained typed
 *  `reason` detail tokens, code still CLR10 throughout:
 *  `op_key_required` · `plan_not_open` · `client_not_onboarding` (site-2
 *  SPLITS with pinned precedence — plan_not_open wins when both the plan is
 *  non-open AND the client isn't 'onboarding') · `questions_unresolved` ·
 *  `opening_position_required`. `attestation` is OPTIONAL and stays unpassed
 *  (`null`) unless a prior CLR05 refusal named it ('self_attestation') —
 *  never a client-side guess at whether a distinct checker exists; the DB is
 *  the wall (mirrors lib/close/api.ts's `finalizeClose`, the same "pass it
 *  only once a refusal has named it" discipline). */
export async function commitClientOnboarding(
  args: { clientId: string; planId: string; expectedPlanRevision: string; attestation?: string | null },
  opts: Opts = {},
): Promise<{ client_id: string; plan_id: string; status: string; review_maker: string | null; attestation_kind: string }> {
  return callDoor(
    "commit_client_onboarding",
    {
      p_client: args.clientId,
      p_plan: args.planId,
      p_expected_plan_revision: args.expectedPlanRevision,
      p_op_key: opKey(),
      p_attestation: args.attestation ?? null,
    },
    opts,
  );
}

/** clara.cancel_client_onboarding(p_client uuid, p_plan uuid, p_reason text,
 *  p_op_key text) — 0017:2843, admin floor. Archives the client (law 6 — no
 *  delete verb exists anywhere in the estate) and terminates the plan
 *  `state='cancelled'`. A reason is REQUIRED (CLR10 if blank, 0017:2849-2850). */
export async function cancelClientOnboarding(
  args: { clientId: string; planId: string; reason: string },
  opts: Opts = {},
): Promise<{ client_id: string; plan_id: string; status: string }> {
  return callDoor(
    "cancel_client_onboarding",
    { p_client: args.clientId, p_plan: args.planId, p_reason: args.reason, p_op_key: opKey() },
    opts,
  );
}
