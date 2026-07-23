// HUMAN-lane wire client for the Wave-B onboarding lifecycle + plan-as-document
// (settled dashboard plan §3.5; F8/F11/F15). Reads are firm-scoped PostgREST table
// SELECTs (RLS pins them to jwt_firm(); 0017 grants SELECT on the onboarding_plan* tables
// to clara_authenticated). Writers are the named governed fns granted to clara_authenticated
// in 0017 — never a hand-written row; every write carries a fresh op_key (the DB is
// idempotent on (firm, fn, op_key)); the ONE exception is create_firm, whose op_key is the
// STABLE workflow-minted key (O7 token-row receipt ⇒ exactly-once across retries/kills).
// The UI/DB split is absolute: every displayed number/state here is DB-authored verbatim.
//
// The bound rpc signatures (verified against packages/db/migrations/0017_wave_b.sql):
//   create_firm(p_name text, p_admission_token uuid, p_op_key text) → {firm_id, plan_id}
//   begin_client_onboarding(p_name text, p_op_key text) → {client_id, plan_id}
//   commit_client_onboarding(p_client uuid, p_plan uuid, p_expected_plan_revision uuid,
//                            p_op_key text, p_attestation text default null) → {…, attestation_kind}
//   cancel_client_onboarding(p_client uuid, p_plan uuid, p_reason text, p_op_key text)
//   resolve_onboarding_plan_item(p_plan uuid, p_item_key text, p_resolution text, p_op_key text)
//   bootstrap_client_plan(p_client uuid, p_op_key text) → {…, bootstrap_status}

import { pgrestSelect, rpc } from "./wire";

const opKey = () => crypto.randomUUID();
const enc = encodeURIComponent;

// ---------------------------------------------------------------------------
// Row types (mirror the granted onboarding_plan* tables).
// ---------------------------------------------------------------------------

export type PlanState = "open" | "committed" | "cancelled";

export type OnboardingPlanRow = {
  id: string;
  firm_id: string;
  scope_kind: "firm" | "client";
  client_id: string | null;
  state: PlanState;
  revision_token: string;
  revision_n: number;
  committed_at: string | null;
  committed_by: string | null;
  review_maker: string | null;
  reviewed_at: string | null;
  contributors: string[];
  commit_attestation: string | null;
  cancelled_at: string | null;
  cancelled_by: string | null;
  cancel_reason: string | null;
  created_at: string;
  updated_at: string;
};

export type PlanItemKind = "must_ask" | "capture" | "todo";
export type PlanItemState = "pending" | "answered" | "resolved" | "deferred";

export type OnboardingPlanItemRow = {
  id: string;
  plan_id: string;
  firm_id: string;
  item_kind: PlanItemKind;
  item_key: string;
  question: string | null;
  answer: unknown;
  state: PlanItemState;
  required_for_commit: boolean;
  answered_by: string | null;
  answered_at: string | null;
  created_at: string;
  updated_at: string;
};

export type OnboardingPlanRevisionRow = {
  id: string;
  plan_id: string;
  revision_n: number;
  snapshot: Record<string, unknown>;
  created_at: string;
};

const PLAN_COLS =
  "id,firm_id,scope_kind,client_id,state,revision_token,revision_n,committed_at,committed_by," +
  "review_maker,reviewed_at,contributors,commit_attestation,cancelled_at,cancelled_by,cancel_reason,created_at,updated_at";
const ITEM_COLS =
  "id,plan_id,firm_id,item_kind,item_key,question,answer,state,required_for_commit,answered_by,answered_at,created_at,updated_at";

// ---------------------------------------------------------------------------
// Reads (firm-scoped PostgREST table SELECTs).
// ---------------------------------------------------------------------------

export async function getPlan(token: string, planId: string): Promise<OnboardingPlanRow | null> {
  const rows = await pgrestSelect<OnboardingPlanRow>(`onboarding_plans?id=eq.${enc(planId)}&select=${PLAN_COLS}&limit=1`, token);
  return rows[0] ?? null;
}

/** Every plan for a client, newest first — the caller picks the open one (there is at most
 *  one open plan per client, uq_onboarding_plans_one_open) or the latest terminal one. */
export async function plansForClient(token: string, clientId: string): Promise<OnboardingPlanRow[]> {
  return pgrestSelect<OnboardingPlanRow>(
    `onboarding_plans?client_id=eq.${enc(clientId)}&select=${PLAN_COLS}&order=created_at.desc&limit=25`,
    token,
  );
}

/** The client's open plan, or the most recent one when none is open (the plan page target). */
export async function currentPlanForClient(token: string, clientId: string): Promise<OnboardingPlanRow | null> {
  const rows = await plansForClient(token, clientId);
  return rows.find((p) => p.state === "open") ?? rows[0] ?? null;
}

export async function listPlanItems(token: string, planId: string): Promise<OnboardingPlanItemRow[]> {
  return pgrestSelect<OnboardingPlanItemRow>(
    `onboarding_plan_items?plan_id=eq.${enc(planId)}&select=${ITEM_COLS}&order=created_at.asc`,
    token,
  );
}

export async function listPlanRevisions(token: string, planId: string): Promise<OnboardingPlanRevisionRow[]> {
  return pgrestSelect<OnboardingPlanRevisionRow>(
    `onboarding_plan_revisions?plan_id=eq.${enc(planId)}&select=id,plan_id,revision_n,snapshot,created_at&order=revision_n.asc`,
    token,
  );
}

/** The client's opening seed (for the commit-gate OpeningDryRunCard embed only — D3 owns the
 *  full opening surface/openingApi). opening_seed_registry SELECT is granted to
 *  clara_authenticated in 0017; we read the minimal handle: id + state (+ as_of). Returns the
 *  seed for this plan if present (there is at most one live seed per client/plan), else null. */
export type OpeningSeedLite = { id: string; state: "open" | "finalized" | "cancelled"; as_of: string };

export async function openingSeedForPlan(token: string, clientId: string, planId: string): Promise<OpeningSeedLite | null> {
  const rows = await pgrestSelect<OpeningSeedLite>(
    `opening_seed_registry?client_id=eq.${enc(clientId)}&plan_id=eq.${enc(planId)}&select=id,state,as_of&order=created_at.desc&limit=1`,
    token,
  );
  return rows[0] ?? null;
}

// ---------------------------------------------------------------------------
// Governed writers (clara_authenticated; fresh op_key per call except create_firm).
// ---------------------------------------------------------------------------

export type FirmReceipt = { firm_id: string; plan_id: string };

/** create_firm (O7). The op_key MUST be the STABLE key the firm interview minted and surfaced
 *  in the commit park (commitOpKeyFromPrompt) — retries reuse it so create_firm replays the
 *  token-row receipt byte-identically (a DIFFERENT op_key against a consumed token is CLR04).
 *  A same-op_key replay returns the receipt (no error) IN THE DB, so this call is idempotent. */
export async function createFirm(token: string, args: { name: string; admissionToken: string; opKey: string }): Promise<FirmReceipt> {
  const out = (await rpc(
    "create_firm",
    { p_name: args.name, p_admission_token: args.admissionToken, p_op_key: args.opKey },
    token,
  )) as { firm_id?: unknown; plan_id?: unknown } | null;
  const firmId = out?.firm_id;
  const planId = out?.plan_id;
  if (typeof firmId !== "string" || typeof planId !== "string") {
    throw new Error("create_firm returned no {firm_id, plan_id} receipt");
  }
  return { firm_id: firmId, plan_id: planId };
}

export type BeginClientResult = { client_id: string; plan_id: string };

/** begin_client_onboarding — mints the onboarding client + its open plan (admin+). */
export async function beginClientOnboarding(token: string, name: string): Promise<BeginClientResult> {
  const out = (await rpc("begin_client_onboarding", { p_name: name, p_op_key: opKey() }, token)) as {
    client_id?: unknown; plan_id?: unknown;
  } | null;
  const clientId = out?.client_id;
  const planId = out?.plan_id;
  if (typeof clientId !== "string" || typeof planId !== "string") {
    throw new Error("begin_client_onboarding returned no {client_id, plan_id}");
  }
  return { client_id: clientId, plan_id: planId };
}

export type CommitResult = {
  client_id: string;
  plan_id: string;
  status: string;
  review_maker: string | null;
  attestation_kind: string | null;
};

/** commit_client_onboarding — the Gate-O ceremony (admin+). A CLR06/stale_plan refusal is the
 *  re-review signal (the plan revision moved under the caller); the caller re-reads the plan and
 *  retries with the fresh expected revision. A CLR05 (checker_required / distinct_checker /
 *  self_attestation) rides the maker-checker path — see the plan page's commit gate (F15). */
export async function commitClientOnboarding(
  token: string,
  args: { clientId: string; planId: string; expectedRevision: string; attestation?: string | null },
): Promise<CommitResult> {
  return (await rpc(
    "commit_client_onboarding",
    {
      p_client: args.clientId,
      p_plan: args.planId,
      p_expected_plan_revision: args.expectedRevision,
      p_op_key: opKey(),
      p_attestation: args.attestation ?? null,
    },
    token,
  )) as CommitResult;
}

/** cancel_client_onboarding — archives the client + cancels the plan (admin+). Idempotent across
 *  fresh op_keys via the DB dedupe; the two-step client-interview cancel calls this AFTER the
 *  runtime cancel (F8). A reason is mandatory (CLR10 on empty). */
export async function cancelClientOnboarding(token: string, args: { clientId: string; planId: string; reason: string }): Promise<void> {
  await rpc(
    "cancel_client_onboarding",
    { p_client: args.clientId, p_plan: args.planId, p_reason: args.reason, p_op_key: opKey() },
    token,
  );
}

/** resolve_onboarding_plan_item — a bookkeeper+ resolves a must-ask/capture/todo item with a
 *  typed resolution string; the DB stamps state='resolved' and bumps the plan revision. */
export async function resolveOnboardingPlanItem(
  token: string,
  args: { planId: string; itemKey: string; resolution: string },
): Promise<{ plan_id: string; item_id: string; state: string; revision_token: string; revision_n: number }> {
  return (await rpc(
    "resolve_onboarding_plan_item",
    { p_plan: args.planId, p_item_key: args.itemKey, p_resolution: args.resolution, p_op_key: opKey() },
    token,
  )) as { plan_id: string; item_id: string; state: string; revision_token: string; revision_n: number };
}

export type BootstrapResult = {
  client_id: string;
  plan_id: string;
  item_id: string;
  status: string;
  bootstrap_status: "created" | "already_bootstrapped" | string;
};

/** bootstrap_client_plan (F11 / B-12) — the admin object verb on a pre-0017 ACTIVE client with
 *  no plan: mints the incremental carry-down vehicle (a 'carry_down_deferred' todo) WITHOUT
 *  changing the client's active status. Idempotent across fresh op_keys (returns
 *  bootstrap_status 'already_bootstrapped'). The DB refuses a non-active client (CLR10,
 *  reason active_client_bootstrap_required) or an already-non-bootstrap plan
 *  (reason active_client_plan_already_exists) — the caller surfaces the refusal verbatim. */
export async function bootstrapClientPlan(token: string, clientId: string): Promise<BootstrapResult> {
  return (await rpc("bootstrap_client_plan", { p_client: clientId, p_op_key: opKey() }, token)) as BootstrapResult;
}
