// Pure plan-as-document model (settled dashboard plan §3.2 / F15 / L5). No DOM, no DB —
// every function here is a total, DB-figures-in / view-out mapper the page renders and the
// tests exercise directly. The DB remains the single authority: commitReadiness is a
// LOCAL preview of commit_client_onboarding's gate (so the button can explain itself), never
// the gate — the actual commit surfaces the DB refusal verbatim.

import type { OnboardingPlanRow, OnboardingPlanItemRow, OnboardingPlanRevisionRow, PlanItemKind } from "../../shared/onboardingApi";

export type ItemGroups = { must_ask: OnboardingPlanItemRow[]; capture: OnboardingPlanItemRow[]; todo: OnboardingPlanItemRow[] };

/** Group the plan items by kind (must_ask / capture / todo), each in stable creation order. */
export function groupItems(items: readonly OnboardingPlanItemRow[]): ItemGroups {
  const g: ItemGroups = { must_ask: [], capture: [], todo: [] };
  for (const it of items) {
    const k: PlanItemKind = it.item_kind === "must_ask" || it.item_kind === "capture" || it.item_kind === "todo" ? it.item_kind : "capture";
    g[k].push(it);
  }
  return g;
}

/** An item counts as "answered enough" for commit when its state is answered or resolved. */
export function isSatisfied(it: Pick<OnboardingPlanItemRow, "state">): boolean {
  return it.state === "answered" || it.state === "resolved";
}

/** The still-to-capture checklist: every required-for-commit item not yet satisfied, plus the
 *  deferred todos (carry_down / non-straight-line FA) that a human still owns. Deferred todos
 *  never block commit but ARE outstanding work the packet must show (the Intercom-packet law). */
export function stillToCapture(items: readonly OnboardingPlanItemRow[]): OnboardingPlanItemRow[] {
  return items.filter((it) => (it.required_for_commit && !isSatisfied(it)) || (it.item_kind === "todo" && it.state === "deferred"));
}

/** Whether the client carries an opening position the way commit_client_onboarding requires:
 *  a first_year_zero_opening (answered/resolved) OR a carry_down_deferred (deferred/resolved).
 *  A finalized opening seed also satisfies the DB, but that lives on the seed registry (the
 *  OpeningDryRunCard reads it) — so this returns null ("unknown from the plan alone") when no
 *  opening item is present, and the DB stays the authority. */
export function openingPositionFromPlan(items: readonly OnboardingPlanItemRow[]): "zero" | "carry_down" | null {
  const zero = items.find((it) => it.item_key === "first_year_zero_opening" && isSatisfied(it));
  if (zero) return "zero";
  const carry = items.find((it) => it.item_key === "carry_down_deferred" && (it.state === "deferred" || it.state === "resolved"));
  if (carry) return "carry_down";
  return null;
}

export type CommitBlocker =
  | { kind: "plan_not_open" }
  | { kind: "required_unresolved"; items: OnboardingPlanItemRow[] }
  | { kind: "opening_position_unconfirmed" };

export type CommitReadiness = { ready: boolean; blockers: CommitBlocker[] };

/** A LOCAL preview of the commit gate (commit_client_onboarding). `seedFinalized` lets the
 *  caller feed the OpeningDryRunCard's seed state in — when a finalized seed exists the opening
 *  requirement is met even without a plan opening item. This never authorizes a commit; it only
 *  lets the button say WHY it is (not) ready. The DB is the real gate. */
export function commitReadiness(
  plan: Pick<OnboardingPlanRow, "state">,
  items: readonly OnboardingPlanItemRow[],
  opts: { seedFinalized?: boolean } = {},
): CommitReadiness {
  const blockers: CommitBlocker[] = [];
  if (plan.state !== "open") blockers.push({ kind: "plan_not_open" });
  const unresolved = items.filter((it) => it.required_for_commit && !isSatisfied(it));
  if (unresolved.length > 0) blockers.push({ kind: "required_unresolved", items: unresolved });
  const hasOpening = opts.seedFinalized === true || openingPositionFromPlan(items) !== null;
  if (!hasOpening) blockers.push({ kind: "opening_position_unconfirmed" });
  return { ready: blockers.length === 0, blockers };
}

// ---------------------------------------------------------------------------
// Commit-refusal classification (the CLR envelope from wire.ts PgrestError).
// ---------------------------------------------------------------------------

export type CommitRefusal =
  | { kind: "stale_plan" }                 // CLR06 / reason stale_plan → re-review + retry
  | { kind: "distinct_checker" }           // CLR05 → a non-contributor admin must approve (F15: no temp-admin here)
  | { kind: "self_attestation" }           // CLR05 → solo firm: a typed attestation unlocks commit
  | { kind: "checker_required" }           // CLR05 → no attributed contributor (degenerate)
  | { kind: "required_unresolved" }        // CLR10 → a required question remains
  | { kind: "opening_required" }           // CLR10 → an opening position is required
  | { kind: "other"; message: string };

type ClrError = { clr?: string | null; reason?: string | null; pgCode?: string; message?: string };

/** Classify a commit_client_onboarding refusal into the surfaces the plan page renders. Reads
 *  the governed CLR code + the machine reason token (wire.ts PgrestError), never prose. */
export function classifyCommitRefusal(err: unknown): CommitRefusal {
  const e = (err ?? {}) as ClrError;
  const clr = e.clr ?? e.pgCode ?? null;
  const reason = e.reason ?? null;
  if (clr === "CLR06" || reason === "stale_plan") return { kind: "stale_plan" };
  if (clr === "CLR05") {
    if (reason === "distinct_checker") return { kind: "distinct_checker" };
    if (reason === "self_attestation") return { kind: "self_attestation" };
    if (reason === "checker_required") return { kind: "checker_required" };
  }
  if (clr === "CLR10") {
    const msg = (e.message ?? "").toLowerCase();
    if (msg.includes("opening position")) return { kind: "opening_required" };
    if (msg.includes("required onboarding questions")) return { kind: "required_unresolved" };
  }
  return { kind: "other", message: typeof e.message === "string" ? e.message : "commit refused" };
}

export function isStalePlan(err: unknown): boolean {
  return classifyCommitRefusal(err).kind === "stale_plan";
}

/** Classify a bootstrap_client_plan refusal (F11) by its reason token (detail json). */
export function classifyBootstrapRefusal(err: unknown): "not_active" | "plan_exists" | "other" {
  const e = (err ?? {}) as ClrError;
  if (e.reason === "active_client_bootstrap_required") return "not_active";
  if (e.reason === "active_client_plan_already_exists") return "plan_exists";
  return "other";
}

// ---------------------------------------------------------------------------
// Revisions record (intended-vs-actual — the P19/P14 audit trail).
// ---------------------------------------------------------------------------

export type RevisionView = { revision_n: number; item_count: number; created_at: string; state: string | null };

/** Render the append-only revision snapshots as an intended-vs-actual timeline. Each snapshot
 *  is `{ … , items: [...] }` (clara._onboarding_plan_snapshot); we read only its shape, never
 *  recompute a figure. */
export function revisionsRecord(revisions: readonly OnboardingPlanRevisionRow[]): RevisionView[] {
  return revisions
    .slice()
    .sort((a, b) => a.revision_n - b.revision_n)
    .map((r) => {
      const snap = (r.snapshot ?? {}) as Record<string, unknown>;
      const items = Array.isArray(snap.items) ? snap.items : [];
      const state = typeof snap.state === "string" ? snap.state : null;
      return { revision_n: r.revision_n, item_count: items.length, created_at: r.created_at, state };
    });
}
