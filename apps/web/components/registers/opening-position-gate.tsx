"use client";

// F3 (fix round, rev-t2): the "no opening seed yet" state, TRUED. The prior
// scope note claimed no live field could tell a deferred carry-down from a
// first-year-zero client and rendered the same empty state for both — a
// FALSE census (wrong instrument: `information_schema.columns` on
// `clients`/`onboarding_plans`, when the real determination is a ROW on
// `clara.onboarding_plan_items` — see lib/registers/opening.ts's own
// `loadOpeningPositionPlanItems` header for the full grounding). This file
// reads that row and renders honestly:
//   - `carry_down_deferred` (state='deferred') — the port-wave plan's own
//     §5 T2 row: "deferred-activation banner + chase list". The Create
//     trigger STAYS reachable (the carry-down is wanted, just deferred).
//   - `first_year_zero_opening` — no seed is wanted at all; text only, no
//     Create trigger (this is the one branch T2 does NOT offer the door on,
//     by deliberate design, not a hidden precondition — a first-year zero
//     opening has nothing to carry down).
//   - neither found (interview hasn't reached this step, or a pre-Wave-B
//     plan, or no plan at all) — the prior generic empty state.

import { useTranslations } from "next-intl";
import { useAsyncRead } from "@/lib/firm/use-async-read";
import { loadOpeningPositionPlanItems } from "@/lib/registers/opening";
import { sessionTokenAccessor } from "@/lib/session-accessor";
import { EmptyState, LoadingState, StateBanner } from "@/components/common/state";
import { NotBuiltNote } from "@/components/common/not-built-note";
import { ErrorMessage } from "@/components/firm/data-state";
import { CreateOpeningSeedDialog } from "./opening-seed-lifecycle";

export function NoOpeningSeedState({
  clientId,
  plan,
  plansLoading,
  busy,
  act,
}: {
  clientId: string;
  plan: { id: string } | null;
  plansLoading: boolean;
  busy: boolean;
  act: (fn: () => Promise<void>) => Promise<boolean>;
}) {
  const t = useTranslations("OpeningCarryDown");

  if (!plan) {
    return (
      <div className="flex flex-col gap-2">
        <EmptyState>{t("noSeedYet")}</EmptyState>
        <div>
          <CreateOpeningSeedDialog clientId={clientId} planId={null} busy={busy} act={act} />
        </div>
        {!plansLoading ? <p className="text-xs text-warning">{t("noPlanNote")}</p> : null}
      </div>
    );
  }

  return <OpeningPositionGate key={plan.id} clientId={clientId} planId={plan.id} busy={busy} act={act} />;
}

function OpeningPositionGate({
  clientId,
  planId,
  busy,
  act,
}: {
  clientId: string;
  planId: string;
  busy: boolean;
  act: (fn: () => Promise<void>) => Promise<boolean>;
}) {
  const t = useTranslations("OpeningCarryDown");
  const { data, loading, error } = useAsyncRead(() => loadOpeningPositionPlanItems(sessionTokenAccessor, planId));

  if (loading) return <LoadingState>{t("openingPosition.loading")}</LoadingState>;
  if (error) return <ErrorMessage error={error} />;

  const items = data ?? [];
  const deferred = items.find((i) => i.item_key === "carry_down_deferred" && i.state === "deferred");
  const firstYearZero = items.find((i) => i.item_key === "first_year_zero_opening");

  // First-year-zero: no carry-down exists — a seed is not wanted here, so
  // (deliberately) no Create trigger renders in this branch.
  if (firstYearZero) {
    return <EmptyState>{t("openingPosition.firstYearZero")}</EmptyState>;
  }

  if (deferred) {
    return (
      <div className="flex flex-col gap-2">
        <StateBanner tone="info" title={t("openingPosition.deferredTitle")}>
          {deferred.question}
        </StateBanner>
        <NotBuiltNote>{t("openingPosition.notBuiltNote")}</NotBuiltNote>
        <div>
          <CreateOpeningSeedDialog clientId={clientId} planId={planId} busy={busy} act={act} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <EmptyState>{t("noSeedYet")}</EmptyState>
      <div>
        <CreateOpeningSeedDialog clientId={clientId} planId={planId} busy={busy} act={act} />
      </div>
    </div>
  );
}
