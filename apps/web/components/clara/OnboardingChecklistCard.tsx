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
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { SectionHeader } from "@/components/common/section-header";
import { EmptyState, LoadingState, StateBanner } from "@/components/common/state";
import { businessDateTime } from "@/lib/business-date";
import { useHydratedPart } from "@/lib/parts/hooks";
import {
  beginClientOnboarding,
  bootstrapClientPlan,
  cancelClientOnboarding,
  commitClientOnboarding,
  getMostRecentOnboardingPlan,
  getOnboardingClient,
  hasFinalizedOpeningSeed,
  listOnboardingPlanItems,
  resolveOnboardingPlanItem,
} from "@/lib/onboarding/api";
import { isDoorRefusal } from "@/lib/doors";
import { COA_CHART_APPLY_ITEM_KEY } from "@/lib/onboarding/coa";
import { loadPlanRevisions, supersededResolutions, type PlanRevisionRow } from "@/lib/onboarding/resolution-history";
import type { SessionTokenAccessor } from "@/lib/session";
import type { OnboardingClientRow, OnboardingPlanItemRow, OnboardingPlanRow } from "@/lib/onboarding/types";
import { ApplyStandardChartControl } from "./ApplyStandardChartControl";
import { InterviewRunCard } from "./InterviewRunCard";
import { OnboardingDoorDialog } from "./OnboardingDoorDialog";
import { OnboardingItemRow } from "./OnboardingItemRow";

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

type Loaded =
  | { kind: "no_client" }
  | { kind: "no_plan"; client: OnboardingClientRow }
  | {
      kind: "plan";
      client: OnboardingClientRow | null;
      plan: OnboardingPlanRow;
      items: OnboardingPlanItemRow[];
      /** F2 fix — see lib/onboarding/api.ts's `hasFinalizedOpeningSeed` doc
       *  comment for why this read exists. */
      openingSeedFinalized: boolean;
    };

async function loadClientOnboarding(clientId: string, s: SessionTokenAccessor): Promise<Loaded> {
  const client = await getOnboardingClient(clientId, { session: s });
  if (!client) return { kind: "no_client" };
  const plan = await getMostRecentOnboardingPlan(clientId, { session: s });
  if (!plan) return { kind: "no_plan", client };
  const items = await listOnboardingPlanItems(plan.id, { session: s });
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
 *  order (0018_gate_k_domain.sql SS4's site-2 split: `plan_not_open` wins
 *  over `client_not_onboarding` when both are true; `questions_unresolved`
 *  and `opening_position_required` follow, in body order). Returns the
 *  FIRST blocking reason, or `null` once none of the four hold — deliberately
 *  NOT the CLR05 checker arms (`checker_required`/`distinct_checker`/
 *  `self_attestation`): this card never guesses whether a distinct checker
 *  exists, and CLR06 `stale_plan` is inherently a race only the DB can
 *  resolve. Every reason this function returns null for is not a claim the
 *  door will succeed — only that this card found no reason of its own to
 *  block the attempt. */
type CommitBlockReason = "plan_not_open" | "client_not_onboarding" | "questions_unresolved" | "opening_position_required";

function commitBlockReason(
  client: OnboardingClientRow | null,
  plan: OnboardingPlanRow,
  items: OnboardingPlanItemRow[],
  openingSeedFinalized: boolean,
): CommitBlockReason | null {
  if (plan.state !== "open") return "plan_not_open";
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

  const { plan, items } = data;
  const total = items.length;
  const completed = completedCount(items);
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

      {plan.state === "committed" ? (
        <StateBanner tone="info">
          {t("committedNote", { at: plan.committed_at ? businessDateTime(plan.committed_at) : "—" })}
        </StateBanner>
      ) : null}
      {plan.state === "cancelled" ? (
        <StateBanner tone="neutral">
          {t("cancelledNote", { reason: plan.cancel_reason ?? "" })}
        </StateBanner>
      ) : null}

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
        const blockReason = commitBlockReason(data.client, plan, items, data.openingSeedFinalized);
        const cancelBlocked = plan.state !== "open";
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
                act(async () => {
                  await commitClientOnboarding(
                    { clientId, planId: plan.id, expectedPlanRevision: plan.revision_token, attestation: attestation.trim() || null },
                    { session },
                  );
                })
              }
            >
              {blockReason ? <p className="text-xs text-muted-foreground">{t(`commitBlocked.${blockReason}`)}</p> : null}
              <Textarea
                aria-label={t("attestationLabel")}
                placeholder={t("attestationPlaceholder")}
                value={attestation}
                onChange={(e) => setAttestation(e.target.value)}
              />
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
                  }, () => setCancelReason(""))
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

/** Firm-altitude shape — see this file's own header ("SCOPE"). No hydrated
 *  read: there is no plan to scope a read to until AFTER a successful call,
 *  so this is a plain write-and-report affordance, never `useHydratedPart`
 *  over nothing. The DB's own returned `{client_id, plan_id}` is rendered
 *  VERBATIM as the receipt — never a fabricated "success" sentence — with an
 *  honest link into the new workspace (no auto-navigation: the human decides
 *  when to move, matching client-register-list.tsx's own Link-not-redirect
 *  precedent). */
function BeginOnboardingCard({ session }: { session: SessionTokenAccessor }) {
  const t = useTranslations("ClientOnboarding.card");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [clr, setClr] = useState<{ code: string; reason: string | null } | null>(null);
  const [result, setResult] = useState<{ client_id: string; plan_id: string } | null>(null);

  // CB-AE2E-004: resolves the outcome — this card keeps its OWN err/clr rather
  // than a hydrated part's, so it reports success itself and the dialog closes
  // only on the path where the door accepted.
  async function onConfirm(): Promise<boolean> {
    setBusy(true);
    setErr(null);
    setClr(null);
    // F5 fix (rev-t11): a NEW attempt clears the LAST attempt's success
    // receipt too — otherwise a later refusal renders its red banner beside
    // a stale green "created" receipt from an earlier, unrelated success
    // (two contradictory receipts on screen at once, a fabricated-receipt
    // read on a governed act).
    setResult(null);
    try {
      const out = await beginClientOnboarding(name.trim(), { session });
      setResult(out);
      setName("");
      return true;
    } catch (e) {
      if (isDoorRefusal(e)) {
        // N7 nit: the SAME code-slot composition ClientOnboardingCard's own
        // refusalBanner uses, rather than folding the reason into the
        // message text — one presentation for a DoorRefusal across this file.
        setErr(e.message);
        setClr({ code: e.code, reason: e.reason });
      } else {
        setErr(e instanceof Error ? e.message : String(e));
      }
      return false;
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3">
      <SectionHeader level={2}>{t("beginHeading")}</SectionHeader>
      {err ? (
        <StateBanner tone="error" code={clr ? `${clr.code}${clr.reason ? ` · ${clr.reason}` : ""}` : undefined}>
          {err}
        </StateBanner>
      ) : null}
      {result ? (
        <StateBanner tone="info">
          <p>{t("beginResult", { clientId: result.client_id, planId: result.plan_id })}</p>
          {/* F6 fix (rev-t11): a REAL link, not just a claim of one — the
              SAME Link-not-redirect precedent client-register-list.tsx
              already uses (no auto-navigation: the human decides when to
              move). */}
          <Link href={`/clients/${result.client_id}`} className="text-primary underline-offset-4 hover:underline">
            {t("beginResultLink")}
          </Link>
        </StateBanner>
      ) : null}
      <OnboardingDoorDialog
        triggerLabel={t("beginTrigger")}
        title={t("beginTitle")}
        description={t("beginDescription")}
        confirmLabel={t("beginConfirm")}
        busy={busy}
        confirmDisabled={name.trim().length === 0}
        onConfirm={onConfirm}
      >
        <Input
          aria-label={t("nameLabel")}
          placeholder={t("namePlaceholder")}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </OnboardingDoorDialog>
    </div>
  );
}
