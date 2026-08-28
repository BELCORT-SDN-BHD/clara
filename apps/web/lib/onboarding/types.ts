// T11 (port-wave plan §4 T11) — client onboarding, the five HUMAN doors:
// begin_client_onboarding · bootstrap_client_plan · resolve_onboarding_plan_item ·
// commit_client_onboarding · cancel_client_onboarding — four CREATEd at
// 0017_wave_b.sql and UNCHANGED since (rung-0 census: no CREATE OR REPLACE,
// no dynamic splice, in any migration file). The fifth,
// commit_client_onboarding, is CREATEd at 0017 then DYNAMICALLY SPLICED by
// 0018_gate_k_domain.sql SS4 (typed CLR10 `reason` tokens; same code, same
// signature, same floor) — see ../onboarding/api.ts's own doc comment on
// that door. F-A7b PR-a (0142) is a DIFFERENT mechanism
// (wake_propose_client_onboarding / accept_onboarding_proposal, PR-b's) — it
// touches none of these five bodies; its only effect on this file is the
// three honest-label columns below (D-3, 0142), which are additive and live.
//
// Every row shape here is read VERBATIM off `clara.onboarding_plans` /
// `clara.onboarding_plan_items` — both are direct RLS-scoped table reads
// (`grant select … to clara_authenticated`, `0017_wave_b.sql:5114-5122`; the
// human policy `p_onboarding_plans_human`/`p_onboarding_plan_items_human`,
// `0017_wave_b.sql:1437-1439`), the SAME "registers-read-only" shape Q3 already
// uses for adjacent tables — never a fabricated getter RPC.

/** `clara.onboarding_plans.state` — 0017_wave_b.sql:1000. */
export type OnboardingPlanState = "open" | "committed" | "cancelled";

/** `clara.onboarding_plan_items.item_kind` — 0017_wave_b.sql:1045. */
export type OnboardingPlanItemKind = "must_ask" | "capture" | "todo";

/** `clara.onboarding_plan_items.state` — 0017_wave_b.sql:1049-1050. */
export type OnboardingPlanItemState = "pending" | "answered" | "resolved" | "deferred";

/** `clara.onboarding_plans` — 0017_wave_b.sql:995-1037, widened by three
 *  columns in 0142 (D-3): `opened_by_agent`/`opener_model`/
 *  `opened_from_question`, ADD COLUMN only, no body CoR. The CHECK
 *  `ck_onboarding_plans_terminal` (0017:1029-1036) is why `committed_at`/
 *  `committed_by`/`cancelled_at`/`cancelled_by`/`cancel_reason` are typed
 *  nullable rather than split into a discriminated union here — this module
 *  renders them exactly as the row reads, never re-deriving the CHECK's own
 *  shape as a client-side type refinement. */
export type OnboardingPlanRow = {
  id: string;
  firm_id: string;
  scope_kind: "firm" | "client";
  client_id: string | null;
  state: OnboardingPlanState;
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
  /** 0142 D-3 — honest label. `false`/`null`/`null` for every plan a human
   *  opened; non-null only when a Clara-authored proposal was accepted (PR-b,
   *  not yet built) — the CHECK ships null-iff-not-agent, this module trusts
   *  it rather than re-deriving it. */
  opened_by_agent: boolean;
  opener_model: string | null;
  opened_from_question: string | null;
};

/** `clara.onboarding_plan_items` — 0017_wave_b.sql:1041-1064. `answer` is the
 *  raw jsonb the DB stored (a `resolve_onboarding_plan_item` call always
 *  writes `to_jsonb(text)`, 0017:2732) — rendered as text, never re-parsed
 *  into a shape this module invents. */
export type OnboardingPlanItemRow = {
  id: string;
  plan_id: string;
  firm_id: string;
  item_kind: OnboardingPlanItemKind;
  item_key: string;
  question: string | null;
  answer: unknown;
  state: OnboardingPlanItemState;
  required_for_commit: boolean;
  answered_by: string | null;
  answered_at: string | null;
  created_at: string;
  updated_at: string;
};

/** The minimal `clara.clients` projection this domain reads — just enough to
 *  tell a brand-new client (no plan at all yet, nothing to bootstrap) from a
 *  pre-0017 active client with no plan (bootstrap_client_plan's own reason
 *  for existing, 0017:2563-2566) from an already-onboarding/active one. */
export type OnboardingClientRow = {
  id: string;
  name: string;
  status: "onboarding" | "active" | "archived" | string;
};
