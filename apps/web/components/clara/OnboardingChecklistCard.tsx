"use client";

// T11 — the in-thread onboarding checklist card (port-wave-plan-2026-08-28.md
// §4 T11, §5's Clara-raised-card column; R7, mobbin-grounding-wave-2026-08-28.md
// §T11). R7's ruling and its mobbin grounding are BOTH explicit: a STATEFUL
// CARD INLINE IN THE MESSAGE STREAM (the Manus "task progress" precedent — an
// N/N counter of DB-read completed-over-total, checkmarks that flip as steps
// complete, ONE card, never a side panel/drawer/canvas under any name, no
// wizard pages). This card is mounted directly inside `ClaraThreadView`
// (both the docked rail and the escalated full-screen thread share the one
// component, per that file's own header) — never a `/onboarding` route.
//
// WIRE-PART NOTE (owed to P6, not built here): the mobbin grounding's own
// flag (§T11, item 5) says the actual wire-format addition — a new `ClaraPart`
// variant carried by `chatTurn` — is P6's four-part wire bump to specify
// (part2 §8.1), not this train's. This card is therefore built as a
// DB-HYDRATED card (hydrate-never-trust, `useHydratedPart`) keyed on the
// session's active onboarding plan — reading `clara.onboarding_plans` /
// `clara.onboarding_plan_items` directly (both direct RLS-scoped table reads;
// lib/onboarding/types.ts's header has the grant/policy citations) — NOT a
// `parts[]` member. When P6 lands the wire bump, this card's own read becomes
// the hydrate target for that new part type; nothing here needs to change to
// make that swap.
//
// SCOPE: begin_client_onboarding does not take an existing client id (it
// MINTS a brand-new client), so it is the one door offered at FIRM altitude
// (`clientId` undefined — no client workspace to scope a plan read to yet).
// The other four doors are client-scoped and render once `clientId` is
// known. This split is a judgement call recorded here because no needs-you
// row exists to signal "begin an onboarding" any other way (rung-0 census:
// `list_review_queue` emits exactly eight row_kinds, none named for an
// onboarding plan item or a begin affordance — REVIEW_QUEUE_ROW_KINDS,
// lib/firm/needs-you.ts) and no `/onboarding` route may exist (R7) — this
// card is the ONLY surface for all five doors in the whole product today.

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Textarea } from "@/components/ui/textarea";
import { SectionHeader } from "@/components/common/section-header";
import { EmptyState, LoadingState, StateBanner } from "@/components/common/state";
import { useHydratedPart } from "@/lib/parts/hooks";
import {
  bootstrapClientPlan,
  cancelClientOnboarding,
  commitClientOnboarding,
  getMostRecentOnboardingPlan,
  getOnboardingClient,
  hasFinalizedOpeningSeed,
  listOnboardingPlanItems,
  resolveOnboardingPlanItem,
} from "@/lib/onboarding/api";
import { clientRecordChanged } from "@/lib/command/bus";
import { isInternalItemKey } from "@/lib/onboarding/answer-format";
import { COA_CHART_APPLY_ITEM_KEY } from "@/lib/onboarding/coa";
import { loadPlanRevisions, supersededResolutions, type PlanRevisionRow } from "@/lib/onboarding/resolution-history";
import type { SessionTokenAccessor } from "@/lib/session";
import type { OnboardingClientRow, OnboardingPlanItemRow, OnboardingPlanRow } from "@/lib/onboarding/types";
import { ApplyStandardChartControl } from "./ApplyStandardChartControl";
import { BeginOnboardingCard } from "./OnboardingBeginCard";
import { InterviewRunCard } from "./InterviewRunCard";
import { OnboardingDoorDialog } from "./OnboardingDoorDialog";
import { OnboardingItemRow } from "./OnboardingItemRow";
import { SettledOnboardingCard } from "./OnboardingSettledCard";

/** The one entry point `ClaraThreadView` mounts. `clientId` decides the
 *  shape — see this file's own header for why. */
export function OnboardingChecklistCard({
  clientId,
  session,
}: {
  clientId?: string;
  session: SessionTokenAccessor;
}) {
  if (!clientId) return <BeginOnboardingCard session={session} />;
  return <ClientOnboardingCard clientId={clientId} session={session} />;
}

type PlanShape = {
  client: OnboardingClientRow | null;
  plan: OnboardingPlanRow;
  items: OnboardingPlanItemRow[];
  /** F2 fix — see lib/onboarding/api.ts's `hasFinalizedOpeningSeed` doc
   *  comment for why this read exists. */
  openingSeedFinalized: boolean;
};

type Loaded =
  | { kind: "no_client" }
  | { kind: "no_plan"; client: OnboardingClientRow }
  /** The plan is OPEN — the live checklist, its doors, and the interview. */
  | ({ kind: "plan" } & PlanShape)
  /** CB-AE2E-023 — the plan is COMMITTED or CANCELLED. Same reads, a different face: a
   *  receipt of what was settled, with the item list collapsed and no door that could only
   *  refuse. See `SettledOnboardingCard` for why this is a variant rather than an inline
   *  branch. */
  | ({ kind: "settled" } & PlanShape);

async function loadClientOnboarding(clientId: string, s: SessionTokenAccessor): Promise<Loaded> {
  const client = await getOnboardingClient(clientId, { session: s });
  if (!client) return { kind: "no_client" };
  const plan = await getMostRecentOnboardingPlan(clientId, { session: s });
  if (!plan) return { kind: "no_plan", client };
  const rows = await listOnboardingPlanItems(plan.id, { session: s });
  // H-26 / H-28 — the interview's OWN bookkeeping row is not a question anyone answered.
  // `interview_run` (clientOnboarding.v4.ts:102, `question: null`) is written in state
  // `answered`, so an unfiltered list rendered it as a row reading "interview_run ·
  // [object Object]" AND made the header claim "1 / 1" — 100% complete — before the first
  // question was asked. The interview thread already filtered it; the checklist did not, and
  // the two surfaces disagreed about what "internal" means. One shared set now decides.
  //
  // SAFE FOR THE COMMIT GATE, checked rather than assumed: the gate reads
  // `required_for_commit` rows and the three opening-position item keys, and `interview_run`
  // is `required_for_commit: false` and none of those keys — so removing it here cannot make
  // this card claim a gate the DB would not.
  const items = rows.filter((row) => !isInternalItemKey(row.item_key));
  if (plan.state !== "open") {
    // THE SEED READ IS SKIPPED ON A SETTLED PLAN, and that is not a micro-optimisation.
    // `hasFinalizedOpeningSeed` exists for ONE consumer — `commitBlockReason`'s
    // `opening_position_required` arm — and the settled card has no commit gate to compute.
    // It also THROWS BY DESIGN rather than degrading to a boolean (see its own doc comment in
    // lib/onboarding/api.ts: a `false` fallback would disable Confirm on a gate this card
    // cannot prove is warranted). Awaiting it here meant an unreadable `opening_seed_registry`
    // withdrew the whole RECEIPT into an error state over a value the receipt never uses —
    // a read that can only lose. The live arm below still reads it, and still propagates.
    return { kind: "settled", client, plan, items, openingSeedFinalized: false };
  }
  const openingSeedFinalized = await hasFinalizedOpeningSeed(clientId, plan.id, { session: s });
  return { kind: "plan", client, plan, items, openingSeedFinalized };
}

/** `resolve_onboarding_plan_item` counts an item "completed" toward Q9's
 *  DB-read N/N counter law once it has left `pending` — every non-pending
 *  state carries a non-null `answered_at` (0017:1059-1063's own CHECK), so
 *  this is a fact the DB already recorded, never a client-side derivation of
 *  progress (mobbin-grounding-wave-2026-08-28.md §T11 takeaway 2: "a
 *  completed-count over the plan's own item total, both DB-read values —
 *  never a client-computed percentage"). */
function completedCount(items: OnboardingPlanItemRow[]): number {
  return items.filter((i) => i.state !== "pending").length;
}

/** required_for_commit rows — mirrors commit_client_onboarding's own CLR10
 *  `questions_unresolved` arm (0017:2806-2811 source anchor; the LIVE body
 *  carries this typed reason via 0018_gate_k_domain.sql SS4's splice —
 *  lib/onboarding/api.ts's own doc comment on this door). */
function hasUnresolvedRequiredItem(items: OnboardingPlanItemRow[]): boolean {
  return items.some((i) => i.required_for_commit && i.state !== "answered" && i.state !== "resolved");
}

/** Mirrors the OTHER two (of three) disjuncts of commit_client_onboarding's
 *  `opening_position_required` OR-of-three-EXISTS (0017:2812-2822) that live
 *  on `onboarding_plan_items` itself — the third disjunct (a finalized
 *  `opening_seed_registry` row) is `openingSeedFinalized`, read separately
 *  (see `hasFinalizedOpeningSeed`'s own doc comment; T2 owns that table). */
function openingPositionCaptured(items: OnboardingPlanItemRow[], openingSeedFinalized: boolean): boolean {
  if (openingSeedFinalized) return true;
  if (items.some((i) => i.item_key === "first_year_zero_opening" && (i.state === "answered" || i.state === "resolved"))) return true;
  if (items.some((i) => i.item_key === "carry_down_deferred" && (i.state === "deferred" || i.state === "resolved"))) return true;
  return false;
}

/** F2 fix (rev-t11 finding): the card's ONE piece of judgement logic, now
 *  covering every commit_client_onboarding CLR10 arm this card can HONESTLY
 *  compute from data it already holds — in the LIVE body's OWN precedence
 *  order (0018_gate_k_domain.sql SS4's site-2 split; `questions_unresolved`
 *  and `opening_position_required` follow, in body order). Returns the
 *  FIRST blocking reason, or `null` once none of them hold — deliberately
 *  NOT the CLR05 checker arms (`checker_required`/`distinct_checker`/
 *  `self_attestation`): this card never guesses whether a distinct checker
 *  exists, and CLR06 `stale_plan` is inherently a race only the DB can
 *  resolve. Every reason this function returns null for is not a claim the
 *  door will succeed — only that this card found no reason of its own to
 *  block the attempt.
 *
 *  THE `plan_not_open` ARM IS GONE, and this is where that is recorded rather
 *  than only in a test. It mirrored the live body's first CLR10 arm, and while
 *  the card rendered its doors for a plan in ANY state it was the arm that
 *  disabled Confirm on a settled plan. CB-AE2E-023 made it unreachable: a
 *  non-open plan now routes to `SettledOnboardingCard` before this function is
 *  ever called (see `loadClientOnboarding`'s own return), so the door that
 *  could only be refused is not rendered at all — a stronger guarantee than a
 *  disabled button, and one that leaves no state for this arm to test. It is
 *  deleted rather than left as a dead branch beside live ones, which would
 *  read as a claim that both are reachable. `client_not_onboarding` below is
 *  therefore now the first arm, and it is still correct on its own: the live
 *  body's precedence only mattered while BOTH could be true here, and the
 *  plan-state half can no longer arrive. */
type CommitBlockReason = "client_not_onboarding" | "questions_unresolved" | "opening_position_required";

function commitBlockReason(
  client: OnboardingClientRow | null,
  items: OnboardingPlanItemRow[],
  openingSeedFinalized: boolean,
): CommitBlockReason | null {
  if (client && client.status !== "onboarding") return "client_not_onboarding";
  if (hasUnresolvedRequiredItem(items)) return "questions_unresolved";
  if (!openingPositionCaptured(items, openingSeedFinalized)) return "opening_position_required";
  return null;
}

function ClientOnboardingCard({ clientId, session }: { clientId: string; session: SessionTokenAccessor }) {
  const t = useTranslations("ClientOnboarding.card");
  const { data, busy, err, clr, reload, act } = useHydratedPart(session, (s) => loadClientOnboarding(clientId, s));
  const [cancelReason, setCancelReason] = useState("");
  const [attestation, setAttestation] = useState("");
  const [interviewRunActive, setInterviewRunActive] = useState(false);
  // 裁-27 — the revision trail, read LAZILY when an amend dialog opens. `null` is "not read
  // yet" and is rendered as such; an empty array after a successful read is the different,
  // positive fact "this answer has never been amended". A failed read stays `null` too, and
  // the dialog's "still loading" line is the honest thing to say about a trail we do not
  // have — it never claims there were no prior answers.
  //
  // The RAW snapshots are held once per plan and projected per item at render — one read
  // covers every row's amend dialog, and the projection lives in one tested function rather
  // than being re-derived per row.
  const [planRevisions, setPlanRevisions] = useState<PlanRevisionRow[] | null>(null);

  if (!data) {
    return err ? <StateBanner tone="error" code={clr ? `${clr.code}${clr.reason ? ` · ${clr.reason}` : ""}` : undefined}>{err}</StateBanner> : <LoadingState>{t("loading")}</LoadingState>;
  }

  const refusalBanner = err ? (
    <StateBanner tone="error" code={clr ? `${clr.code}${clr.reason ? ` · ${clr.reason}` : ""}` : undefined}>
      {err}
    </StateBanner>
  ) : null;

  if (data.kind === "no_client") {
    return <EmptyState>{t("clientNotVisible")}</EmptyState>;
  }

  if (data.kind === "no_plan") {
    return (
      <div className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3">
        <SectionHeader level={2}>{t("heading")}</SectionHeader>
        {refusalBanner}
        {data.client.status === "active" ? (
          <>
            <EmptyState>{t("noPlanBootstrapEligible")}</EmptyState>
            <OnboardingDoorDialog
              triggerLabel={t("bootstrapTrigger")}
              title={t("bootstrapTitle")}
              description={t("bootstrapDescription")}
              confirmLabel={t("bootstrapConfirm")}
              busy={busy}
              onConfirm={() => act(async () => { await bootstrapClientPlan(clientId, { session }); })}
            />
          </>
        ) : (
          <EmptyState>{t("noPlanNotEligible", { status: data.client.status })}</EmptyState>
        )}
      </div>
    );
  }

  if (data.kind === "settled") {
    return (
      <SettledOnboardingCard
        clientId={clientId}
        data={data}
        refusalBanner={refusalBanner}
        session={session}
        onApplied={reload}
      />
    );
  }

  const { plan, items } = data;
  const total = items.length;
  const completed = completedCount(items);
  // Always true in this arm (a non-open plan routed to the settled card above); kept as the
  // DERIVED value rather than a literal so the rows below cannot drift from the plan's own
  // state if the routing above ever changes.
  const planOpen = plan.state === "open";

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-3">
      <header className="flex flex-wrap items-baseline gap-2">
        <SectionHeader level={2}>{t("heading")}</SectionHeader>
        <span className="text-xs text-muted-foreground" aria-label={t("progressLabel", { completed, total })}>
          {completed} / {total}
        </span>
        <span className="text-xs text-muted-foreground">· {t(`planState.${plan.state}`)}</span>
      </header>

      <InterviewRunCard clientId={clientId} planId={plan.id} session={session} onActiveChange={setInterviewRunActive} onPlanChanged={reload} />

      {plan.opened_by_agent ? (
        <p className="text-xs text-muted-foreground">
          {plan.opener_model ? t("openedByAgentWithModel", { model: plan.opener_model }) : t("openedByAgent")}
        </p>
      ) : null}

      {refusalBanner}

      {/* The terminal-state banners MOVED to `SettledOnboardingCard` — this arm is reached
          only for an OPEN plan, so a `plan.state === "committed"` test here was a branch that
          could no longer be true, and a dead branch beside a live one reads as a claim that
          both are reachable. */}

      {items.length === 0 ? (
        <EmptyState>{t("noItems")}</EmptyState>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((item) => (
            <OnboardingItemRow
              key={item.item_key}
              item={item}
              busy={busy}
              planOpen={planOpen}
              priorResolutions={planRevisions === null ? null : supersededResolutions(planRevisions, item.item_key)}
              onRequestHistory={() => {
                if (planRevisions !== null) return;
                void loadPlanRevisions(plan.id, { session })
                  .then(setPlanRevisions)
                  // Fail-quiet: the dialog's "still loading" line is the honest thing to say
                  // about a trail we do not have. It never becomes "there were none".
                  .catch(() => {});
              }}
              onResolve={(resolution, onOk) =>
                act(async () => {
                  await resolveOnboardingPlanItem(plan.id, item.item_key, resolution, { session });
                  // The amend just appended a revision; the cached trail is now one behind.
                  setPlanRevisions(null);
                }, onOk)
              }
              extraControls={
                // 裁-128 — the row the interview minted for the chart decision gets the door
                // that decision implies. Keyed on the item_key the interview actually writes
                // (`coa_chart_apply`, interview.v3.questions.ts:89), never on the question
                // text, which is prose and can be re-worded by a later `_vN`.
                item.item_key === COA_CHART_APPLY_ITEM_KEY ? (
                  <ApplyStandardChartControl
                    clientId={clientId}
                    planOpen={planOpen}
                    session={session}
                    onApplied={reload}
                  />
                ) : null
              }
            />
          ))}
        </ul>
      )}

      {(() => {
        // F2 fix (rev-t11) + N1 nit: Commit renders unconditionally once a
        // plan exists — gating SHAPES, never HIDES, matching
        // OnboardingItemRow's own resolve-door discipline (this file's own
        // header used to apply the house rule two different ways in one
        // PR). The standalone Cancel door is hidden only while the interview
        // card owns an active runtime run. Commit's Confirm is gated by the
        // full, ordered `commitBlockReason`; Cancel's by `plan.state`
        // check cancel_client_onboarding's own body makes (0017:2862-2864:
        // `cl.status<>'onboarding' or p.state<>'open'`).
        const blockReason = commitBlockReason(data.client, items, data.openingSeedFinalized);
        const cancelBlocked = plan.state !== "open";
        // ============================================================================
        // 裁-187 (owner, 2026-09-04) — ATTESTATION CEREMONIES ARE ABOLISHED.
        // ============================================================================
        // The click IS the act. The attestation textarea used to render on every commit,
        // labelled "only needed if the DB asks for one" — a field a professional had to read a
        // hedge about and then decide to ignore, on the one screen where the act is already
        // unambiguous.
        //
        // IT IS REVEALED ONLY WHEN THE DOOR ITSELF ASKS. The live
        // `commit_client_onboarding` body raises `CLR05` with
        // `detail='{"reason":"self_attestation"}'` on exactly one arm — the caller is among
        // `p.contributors` AND the firm has fewer than two eligible checkers
        // (0017_wave_b.sql:2795-2801, read in this worktree). That token is the ONLY thing
        // that reveals the field.
        //
        // WHY THE STANDING REFUSAL AND NOT A `useState` FLAG. `clr` is the refusal currently
        // on screen; it is set by `act()`'s catch and retired by the next `act()`. Deriving
        // the reveal from it means the field appears with the refusal it answers and leaves
        // with it — there is no second copy of "the door asked" to go stale. `reason` exists
        // only when the DB sent a `detail` JSON (wire.ts's `parseReasonToken`), so this is the
        // DOOR's own word, not a guess; the code is checked too, so a `reason` token arriving
        // on some other CLR could not open this field.
        //
        // AND NOTHING IS EVER INVENTED. The value posted is whatever the human typed, or
        // `null` — `commitClientOnboarding` already passes `attestation ?? null` and its own
        // doc comment states the same discipline ("stays unpassed unless a prior CLR05 refusal
        // named it"). This card never composes an attestation string.
        const attestationRequired = clr?.code === "CLR05" && clr?.reason === "self_attestation";
        return (
          <div className="flex flex-wrap gap-2">
            {/* Consent shows what it approves (working protocol): the dialog
                lists exactly what commit does — activates the client and
                closes the plan — never a bare "Confirm". */}
            <OnboardingDoorDialog
              triggerLabel={t("commitTrigger")}
              title={t("commitTitle")}
              description={t("commitDescription", { client: data.client?.name ?? clientId, completed, total })}
              confirmLabel={t("commitConfirm")}
              busy={busy}
              confirmDisabled={blockReason !== null}
              onConfirm={() =>
                act(
                  async () => {
                    await commitClientOnboarding(
                      { clientId, planId: plan.id, expectedPlanRevision: plan.revision_token, attestation: attestation.trim() || null },
                      { session },
                    );
                  },
                  // H-50 — the client's own record just changed (`status='active'`,
                  // 0017:2825) and the surfaces that render it live in a different React
                  // subtree. `onOk` fires INSIDE act's try block, so a refusal never reaches
                  // it: a refused commit changed nothing and announces nothing.
                  () => clientRecordChanged({ clientId }),
                )
              }
            >
              {blockReason ? <p className="text-xs text-muted-foreground">{t(`commitBlocked.${blockReason}`)}</p> : null}
              {/* 裁-187 — hidden until the door asks. See `attestationRequired` above. */}
              {attestationRequired ? (
                <>
                  <p className="text-xs text-muted-foreground">{t("attestationRequiredNote")}</p>
                  <Textarea
                    aria-label={t("attestationLabel")}
                    placeholder={t("attestationPlaceholder")}
                    value={attestation}
                    onChange={(e) => setAttestation(e.target.value)}
                  />
                </>
              ) : null}
            </OnboardingDoorDialog>

            {/* Cancel — a destructive, irreversible-from-the-thread act (law
                6: the estate has no delete verb; cancel archives the
                client). No literal "interruption" widget in this codebase
                models a governed cancel act (mobbin-grounding-wave-
                2026-08-28.md §T11 takeaway 5: "no pattern to import" for
                this door) — this reuses the SAME destructive door-dialog
                treatment the thread's other running-act cancels already use
                (components/firm/agent-tasks-panel.tsx's cancel_agent_task,
                components/close/CloseDoors.tsx's abandon): a destructive-
                styled confirm dialog requiring a typed reason, never a
                silent one-click. */}
            {!interviewRunActive ? (
              <OnboardingDoorDialog
                triggerLabel={t("cancelTrigger")}
                triggerVariant="destructive"
                title={t("cancelTitle")}
                description={t("cancelDescription", { client: data.client?.name ?? clientId })}
                confirmLabel={t("cancelConfirm")}
                busy={busy}
                confirmDisabled={cancelBlocked || cancelReason.trim().length === 0}
                onConfirm={() =>
                  act(async () => {
                    await cancelClientOnboarding({ clientId, planId: plan.id, reason: cancelReason.trim() }, { session });
                  }, () => {
                    setCancelReason("");
                    // H-50, the OTHER direction: cancel archives the client (`status='archived'`,
                    // 0017:2865), so the Home tab and the register are just as stale as after a
                    // commit. Same signal, same subscribers.
                    clientRecordChanged({ clientId });
                  })
                }
              >
                {cancelBlocked ? <p className="text-xs text-muted-foreground">{t("cancelBlockedNotOpen")}</p> : null}
                <Textarea
                  aria-label={t("cancelReasonLabel")}
                  placeholder={t("cancelReasonPlaceholder")}
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  disabled={cancelBlocked}
                />
              </OnboardingDoorDialog>
            ) : null}
          </div>
        );
      })()}
    </div>
  );
}
