"use client";

// CB-AE2E-023 — the SETTLED half of the onboarding checklist card. Split out of
// `OnboardingChecklistCard.tsx` only to keep that file readable: this is the same card's
// terminal-plan face, mounted by the same `Loaded` switch, reading the same rows. It makes
// no read and calls no door of its own.

import { useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { SectionHeader } from "@/components/common/section-header";
import { EmptyState, StateBanner } from "@/components/common/state";
import { businessDateTime } from "@/lib/business-date";
import { COA_CHART_APPLY_ITEM_KEY } from "@/lib/onboarding/coa";
import type { SessionTokenAccessor } from "@/lib/session";
import type { OnboardingClientRow, OnboardingPlanItemRow, OnboardingPlanRow } from "@/lib/onboarding/types";
import { ApplyStandardChartControl } from "./ApplyStandardChartControl";
import { OnboardingItemRow } from "./OnboardingItemRow";

/** The rows the checklist card already read. Structurally identical to its own `PlanShape`;
 *  declared here so this module imports no value from its sibling and the two cannot form an
 *  import cycle. */
export type SettledPlanShape = {
  client: OnboardingClientRow | null;
  plan: OnboardingPlanRow;
  items: OnboardingPlanItemRow[];
  openingSeedFinalized: boolean;
};

/** The card's own N/N rule, applied to the settled list — see `completedCount`'s doc comment
 *  in `OnboardingChecklistCard.tsx` for why `state !== "pending"` is the DB-recorded fact. */
function completedCount(items: OnboardingPlanItemRow[]): number {
  return items.filter((i) => i.state !== "pending").length;
}

/**
 * CB-AE2E-023 — THE SETTLED PLAN'S FACE (the owner's "after commit the cards are still
 * there").
 *
 * WHAT WAS WRONG. Visibility was decided in one place and keyed on plan EXISTENCE, never on
 * plan STATE: `ClaraThreadView` mounts this card for any client-scoped thread, the loader
 * deliberately returns the most recent plan in ANY state, and the door row rendered
 * unconditionally with its own comment saying "gating SHAPES, never HIDES". So after a commit
 * the whole checklist stayed on screen with a live Commit trigger and a live Cancel trigger,
 * both opening dialogs the database can only refuse (`commit_client_onboarding` raises CLR10
 * on `p.state<>'open'`, 0017_wave_b.sql:2778; `cancel_client_onboarding` the same at :2857).
 *
 * WHY A VARIANT AND NOT A BRANCH. Shaping a door that cannot succeed is not the same rule as
 * hiding one that could: the SHAPE-never-HIDE discipline exists so a professional is never
 * denied a door the database might have opened. Here the database has already spoken — the
 * plan is terminal and no argument reopens it — so the honest surface is not a disabled
 * button, it is a RECEIPT of what was settled. Making that a separate `Loaded` variant is what
 * lets the live arm keep its doors with no state guard at all.
 *
 * EVERY FIELD IS ALREADY IN HAND — no new read, no new door. `committed_at` / `committed_by` /
 * `commit_attestation` / `review_maker` / `revision_n` / `cancelled_*` all ride `PLAN_COLUMNS`
 * (lib/onboarding/api.ts:27-30); two of them were read and rendered NOWHERE until now.
 */
export function SettledOnboardingCard({
  clientId,
  data,
  refusalBanner,
  session,
  onApplied,
}: {
  clientId: string;
  data: SettledPlanShape;
  refusalBanner: ReactNode;
  session: SessionTokenAccessor;
  onApplied: () => Promise<void>;
}) {
  const t = useTranslations("ClientOnboarding.card");
  const [showItems, setShowItems] = useState(false);
  const { plan, items, client } = data;
  const total = items.length;
  const completed = completedCount(items);
  const chartItem = items.find((item) => item.item_key === COA_CHART_APPLY_ITEM_KEY) ?? null;

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-3">
      <header className="flex flex-wrap items-baseline gap-2">
        <SectionHeader level={2}>{t("heading")}</SectionHeader>
        <span className="text-xs text-muted-foreground" aria-label={t("progressLabel", { completed, total })}>
          {completed} / {total}
        </span>
        <span className="text-xs text-muted-foreground">· {t(`planState.${plan.state}`)}</span>
      </header>

      {refusalBanner}

      {plan.state === "committed" ? (
        <StateBanner tone="info">
          {t("committedNote", { at: plan.committed_at ? businessDateTime(plan.committed_at) : "—" })}
        </StateBanner>
      ) : (
        <StateBanner tone="neutral">{t("cancelledNote", { reason: plan.cancel_reason ?? "" })}</StateBanner>
      )}

      {/* THE RECEIPT. Every value is the row's own; a null renders as the em dash rather than
          as an invented one, because "the database recorded no attestation" and "there was
          one and we did not read it" are different facts and only the first is true here. */}
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
        <dt className="text-muted-foreground">{t("receiptClientStatus")}</dt>
        <dd className="text-card-foreground">{client ? client.status : "—"}</dd>
        {plan.state === "committed" ? (
          <>
            <dt className="text-muted-foreground">{t("receiptCommittedAt")}</dt>
            <dd className="text-card-foreground">{plan.committed_at ? businessDateTime(plan.committed_at) : "—"}</dd>
            <dt className="text-muted-foreground">{t("receiptCommittedBy")}</dt>
            <dd className="text-card-foreground">{plan.committed_by ?? "—"}</dd>
            <dt className="text-muted-foreground">{t("receiptAttestation")}</dt>
            <dd className="text-card-foreground">{plan.commit_attestation ?? t("receiptNoAttestation")}</dd>
            <dt className="text-muted-foreground">{t("receiptReviewMaker")}</dt>
            <dd className="text-card-foreground">{plan.review_maker ?? "—"}</dd>
          </>
        ) : (
          <>
            <dt className="text-muted-foreground">{t("receiptCancelledAt")}</dt>
            <dd className="text-card-foreground">{plan.cancelled_at ? businessDateTime(plan.cancelled_at) : "—"}</dd>
            <dt className="text-muted-foreground">{t("receiptCancelledBy")}</dt>
            <dd className="text-card-foreground">{plan.cancelled_by ?? "—"}</dd>
          </>
        )}
        <dt className="text-muted-foreground">{t("receiptRevision")}</dt>
        <dd className="text-card-foreground">{plan.revision_n}</dd>
      </dl>

      {/* THE CHART CONTROL STAYS REACHABLE ON THE **COMMITTED** ARM ONLY.
          `ApplyStandardChartControl` is the only surface for `clara.apply_coa_template` in the
          whole estate, and its own prop doc records that the apply does NOT need an open plan.
          Collapsing the item list without surfacing this row would have hidden the one control
          a commit unlocks, which is why the receipt hosts it.

          IT IS WRONG ON THE CANCELLED ARM, and that is the `plan.state` test below.
          `clara.coa_chart_state`'s `dec` CTE reads the seed decision out of the client's latest
          COMMITTED plan (`p2.state='committed'`, 0156_coa_apply_template.sql:1082). A CANCELLED
          plan never becomes committed, so for a cancelled onboarding that read can only ever
          answer `undecided` — and the panel would then say "No chart-of-accounts decision has
          been recorded yet — the onboarding interview asks for it" directly beneath a receipt
          saying the plan was cancelled with the interview's answers listed under it. Two false
          sentences side by side on a governed record. The cancelled receipt offers no panel.

          (The panel's own copy for an OPEN plan is DB-A's subject: #551 returns a
          `seed_decision_plan_state` key and the live checklist row should then say "decided in
          the interview, not yet committed". #551 is still open — see the PR body's carry-over.) */}
      {plan.state === "committed" && chartItem ? (
        <div className="flex flex-col gap-2 rounded-lg border border-border bg-muted/40 p-2">
          <p className="text-xs font-medium text-card-foreground">{chartItem.question ?? chartItem.item_key}</p>
          <ApplyStandardChartControl clientId={clientId} planOpen={false} session={session} onApplied={onApplied} />
        </div>
      ) : null}

      {items.length === 0 ? (
        <EmptyState>{t("noItems")}</EmptyState>
      ) : (
        <div className="flex flex-col gap-1">
          <Button
            type="button"
            variant="link"
            size="xs"
            className="self-start px-0"
            aria-expanded={showItems}
            onClick={() => setShowItems((s) => !s)}
          >
            {showItems ? t("receiptHideAnswers") : t("receiptShowAnswers", { count: items.length })}
          </Button>
          {showItems ? (
            <ul className="flex flex-col gap-2 border-t border-border pt-2">
              {items.map((item) => (
                // `planOpen={false}` is the truth, and it is what makes every row's own resolve
                // and amend door correctly unavailable — `resolve_onboarding_plan_item` refuses
                // CLR10 on a non-open plan (0017:2722), so the receipt is the last word.
                <OnboardingItemRow key={item.item_key} item={item} busy={false} planOpen={false} onResolve={async () => {}} />
              ))}
            </ul>
          ) : null}
        </div>
      )}
    </div>
  );
}
