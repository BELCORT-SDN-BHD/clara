// Opening balances & carry-down — T2. Reads plus the one read-flavoured RPC
// (`get_opening_dryrun`, transport via `callDoor` but NOT a governed act —
// apps/web/AGENTS.md's own carve-out). Governed writes live in
// ./opening-doors.ts; shared types in ./opening-types.ts. Every table read
// below is a plain firm-scoped relation with a direct `clara_authenticated`
// SELECT policy (census-confirmed via `pg_policy`, not assumed) — no bespoke
// "list" RPC exists for `opening_seed_registry` / `opening_items` /
// `opening_tb_targets`, so this module reads them with `getRows` like every
// other registers surface.

import { getRows } from "../read";
import { callDoor } from "../doors";
import type { SessionTokenAccessor } from "@/lib/session";
import type {
  OpeningSeedRow,
  OpeningItemRow,
  OpeningTbTargetRow,
  OpeningEntryRevisionRow,
  OpeningDryrun,
} from "./opening-types";

const OPENING_SEED_COLS =
  "id,firm_id,client_id,plan_id,as_of,state,tie_document_id,tie_document_sha256,created_by,created_at," +
  "batch_n,finalized_at,finalized_by,tie_asserted_at,through_event_seq,cancelled_at,cancelled_by,cancel_reason";

/** Every opening seed this client has ever had (cancelled ones included, oldest
 *  first) — `uq_opening_seed_registry_once` (a partial unique index on
 *  `client_id` where `state <> 'cancelled'`, census-confirmed) means at most
 *  ONE of these is ever live at a time; the caller picks the live one
 *  (`state !== "cancelled"`) rather than this module deciding for it. */
export function loadOpeningSeeds(session: SessionTokenAccessor, clientId: string): Promise<OpeningSeedRow[]> {
  return getRows<OpeningSeedRow>("opening_seed_registry", {
    select: OPENING_SEED_COLS,
    filters: { client_id: `eq.${clientId}` },
    order: "created_at.asc",
    session,
  });
}

const OPENING_ITEM_COLS =
  "id,firm_id,client_id,seed_id,item_kind,item_key,entry_id,counterparty_id,fixed_asset_id,item_ref,item_date," +
  "amount_cents,sst_portion_cents,sst_rate_bp,sst_basis,state,superseded_by_item,supersedes_item_id,created_by,created_at";

export function loadOpeningItems(session: SessionTokenAccessor, seedId: string): Promise<OpeningItemRow[]> {
  return getRows<OpeningItemRow>("opening_items", {
    select: OPENING_ITEM_COLS,
    filters: { seed_id: `eq.${seedId}` },
    order: "item_key.asc",
    session,
  });
}

const OPENING_TB_TARGET_COLS =
  "id,firm_id,client_id,seed_id,line_key,account_code,source_label,debit_cents,credit_cents,provenance_kind," +
  "document_id,source_sha256,extraction_ref,entered_by,created_at";

export function loadOpeningTbTargets(session: SessionTokenAccessor, seedId: string): Promise<OpeningTbTargetRow[]> {
  return getRows<OpeningTbTargetRow>("opening_tb_targets", {
    select: OPENING_TB_TARGET_COLS,
    filters: { seed_id: `eq.${seedId}` },
    order: "line_key.asc",
    session,
  });
}

/** The narrow slice of `journal_entries` the approve/approve-correction
 *  dialogs need to build `p_entry_revisions`. `clara_authenticated` holds a
 *  plain firm-scoped ALL policy on this table (census-confirmed) — no
 *  bespoke view exists, so this reads the base table directly like every
 *  existing journals surface already does. */
export function loadOpeningEntryRevisions(
  session: SessionTokenAccessor,
  entryIds: string[],
): Promise<OpeningEntryRevisionRow[]> {
  if (entryIds.length === 0) return Promise.resolve([]);
  return getRows<OpeningEntryRevisionRow>("journal_entries", {
    select: "id,revision_token,status,is_opening_balance,reversal_of",
    filters: { id: `in.(${entryIds.join(",")})` },
    session,
  });
}

/** The onboarding plan's current `revision_token` — `approve_opening_seed`'s
 *  `p_expected_plan_revision` argument (an optimistic-concurrency token, CLR31
 *  `stale_plan` on a mismatch). Narrow read, one row. */
export function loadOnboardingPlanRevision(
  session: SessionTokenAccessor,
  planId: string,
): Promise<{ id: string; revision_token: string } | null> {
  return getRows<{ id: string; revision_token: string }>("onboarding_plans", {
    select: "id,revision_token",
    filters: { id: `eq.${planId}` },
    session,
  }).then((rows) => rows[0] ?? null);
}

/** This client's own onboarding plan(s) — `create_opening_seed`'s `p_plan`
 *  must belong to the client (`p.client_id <> p_client` → CLR11); the door
 *  itself asserts no `state` requirement, so this read returns EVERY plan the
 *  client has (oldest first) and the caller picks the one it wants to seed
 *  against — preferring a non-cancelled plan is a presentation choice the
 *  workbench makes, never a door precondition this module invents. */
export function loadOnboardingPlansForClient(
  session: SessionTokenAccessor,
  clientId: string,
): Promise<{ id: string; state: string; revision_token: string; created_at: string }[]> {
  return getRows<{ id: string; state: string; revision_token: string; created_at: string }>("onboarding_plans", {
    select: "id,state,revision_token,created_at",
    filters: { client_id: `eq.${clientId}`, scope_kind: "eq.client" },
    order: "created_at.asc",
    session,
  });
}

/** EVERY plan item for this plan (fix round 2, rev-t2: widened from the
 *  original two-item_key filter so the SAME read also carries the fix
 *  round's own chase-list predicate — `required_for_commit && state NOT IN
 *  ('answered','resolved')` — without a second endpoint call). The two
 *  opening-POSITION keys the interview's `openingItems()` builder mints
 *  (fix round, rev-t2, F3 — TRUED, was a false census):
 *  `packages/runtime/workflows/interview.v1.questions.ts:87-92` (a `@frozen`
 *  file — read, never edited) writes EXACTLY ONE of
 *  `item_key: "first_year_zero_opening"` (`item_kind: "must_ask"`,
 *  `state: "answered"` — a new/first-year client's zero opening, no seed
 *  needed) or `item_key: "carry_down_deferred"` (`item_kind: "todo"`,
 *  `state: "deferred"` — an ongoing client's carry-down, deferred pending
 *  materials) onto the plan at interview time. `clara_authenticated` holds a
 *  plain firm-scoped SELECT policy on `onboarding_plan_items`
 *  (`p_onboarding_plan_items_human`, census-confirmed) — the SAME live
 *  instrument the prior build's `openingPositionFromPlan()`/`stillToCapture()`
 *  (`apps/dashboard/app/clients/plan/model.ts:22-44`) already read. An empty
 *  plan (the interview has not reached this step, or the plan predates
 *  Wave-B) returns `[]` — a legitimate, honestly-rendered answer, not an
 *  error. */
export type OpeningPositionPlanItem = { id: string; item_key: string; item_kind: string; state: string; question: string; required_for_commit: boolean };

export function loadOpeningPositionPlanItems(
  session: SessionTokenAccessor,
  planId: string,
): Promise<OpeningPositionPlanItem[]> {
  return getRows<OpeningPositionPlanItem>("onboarding_plan_items", {
    select: "id,item_key,item_kind,state,question,required_for_commit",
    filters: { plan_id: `eq.${planId}` },
    session,
  });
}

/** Builds the `p_entry_revisions` object shape `clara._opening_revision_matches`
 *  accepts for a JSON OBJECT input: `{ [entry_id]: revision_token }` (the
 *  live body reads `p_revisions->>p_entry::text` for the object branch —
 *  simpler to assemble client-side than the array-of-pairs alternative the
 *  same function also accepts). */
export function buildEntryRevisionsMap(rows: OpeningEntryRevisionRow[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const r of rows) out[r.id] = r.revision_token;
  return out;
}

/** clara.get_opening_dryrun(p_seed) — viewer+. Read-flavoured RPC (labelled
 *  as a read at this call site, per apps/web/AGENTS.md). */
export function getOpeningDryrun(session: SessionTokenAccessor, seedId: string): Promise<OpeningDryrun> {
  return callDoor<OpeningDryrun>("get_opening_dryrun", { p_seed: seedId }, { session });
}

/** The LIVE `client_resolutions` row `record_opening_keyed_resolution` most
 *  recently minted for this seed (`bound_scope_kind='opening_seed'`,
 *  `bound_scope_id=seed.id`, `superseded_at is null`) — an UNTIED seed's own
 *  `draft_opening_item`/`seed_fixed_asset` calls need this row's `id` as
 *  their `p_resolution` argument: `clara.assert_client_resolved_bound` (both
 *  doors' shared precondition) matches on the EXACT id, never on a null
 *  "figure it out" placeholder (a null `p_resolution` can never equal a real
 *  row's `id`, so it always raises CLR01). `null` when no keyed resolution
 *  has been minted yet — the caller steers the human to
 *  `record_opening_keyed_resolution` first (gating SHAPES, never HIDES: the
 *  door itself is still the wall this read only avoids a doomed call
 *  against). */
export function loadOpeningKeyedResolution(session: SessionTokenAccessor, seedId: string): Promise<{ id: string } | null> {
  return getRows<{ id: string }>("client_resolutions", {
    select: "id",
    filters: { bound_scope_kind: "eq.opening_seed", bound_scope_id: `eq.${seedId}`, superseded_at: "is.null" },
    session,
  }).then((rows) => rows[0] ?? null);
}
