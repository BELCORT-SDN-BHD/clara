"use client";

// #640 — the revise route's thin loader around `PlanForm`.
//
// IT EXISTS SO THE FORM NEVER RENDERS AGAINST A PLAN IT HAS NOT READ. `PlanForm` seeds its state
// ONCE, from the live revision handed in as a prop — React state initialisers do not re-run when a
// prop arrives later, so a form mounted before the read resolved would hold an empty schedule and
// silently supersede the live revision with blanks. Gating the mount on the read is the whole job
// of this file; it holds no form logic of its own.
//
// A PLAN THAT CANNOT BE REVISED SAYS SO RATHER THAN RENDERING A FORM THAT CAN ONLY REFUSE
// (裁-187's rule): an ENDED plan is terminal, and `clara.revise_accounting_plan` answers CLR10
// `plan_ended`, so the surface explains and links back instead.
//
// #936 — AND A PLAN WHOSE FIGURES ARE STATED ON AN ACCRUAL IS CORRECTED ON THE ACCRUAL, NOT HERE.
// This is the defect #936's first sentence names, closed at the only surface that can start the
// act. `clara.revise_accounting_plan` ACCEPTS a revision of an accrual's plan — it knows nothing
// about accruals — and records a new plan revision carrying the new basis, while
// `clara.accrual_adjustments` stays keyed to the revision it was written for (0222). A reader
// joining plan -> revision -> accrual detail afterwards sees the OLD amount beside the NEW one the
// ledger will post from the next due date: the books contradicting themselves. The dedicated door
// `clara.correct_accrual_adjustment` (0284) is the one that advances BOTH together, and the
// correction form is where a person reaches it.
//
// THE DISCRIMINATOR IS A SECOND READ, because the plan read carries no such field and `kind`
// cannot stand in for it (`liveAccrualForPlan`'s own note). It is folded into the SAME `DataState`
// as the plan read, so this route renders the form only once BOTH reads have succeeded: a surface
// that fell back to the form when it could not tell would be choosing to risk the contradiction,
// and the plan's other lifecycle controls are all still on the detail page.

import Link from "next/link";
import { useTranslations } from "next-intl";

import { DataState } from "@/components/firm/data-state";
import { StateBanner } from "@/components/common/state";
import { buttonVariants } from "@/components/ui/button";
import { PlanForm } from "./plan-form";
import { loadPlan } from "@/lib/plans/api";
import { loadAccruals, liveAccrualForPlan } from "@/lib/accruals/api";
import { accrualCorrectHref, planDetailHref } from "@/lib/navigation/tree";
import { planControls } from "@/lib/plans/schedule";
import { useAsyncRead } from "@/lib/firm/use-async-read";

export function PlanReviseForm({ clientId, planId }: { clientId: string; planId: string }) {
  const t = useTranslations("Plans");
  const plan = useAsyncRead(() => loadPlan(planId));
  const accruals = useAsyncRead(() => loadAccruals(clientId));
  const row = plan.data;
  const backingAccrual = row === null ? null : liveAccrualForPlan(accruals.data ?? [], row.plan_id);

  return (
    <DataState
      loading={plan.loading || accruals.loading}
      error={plan.error ?? accruals.error}
      isEmpty={row === null}
      emptyMessage={t("notFound")}
    >
      {row === null ? null : backingAccrual !== null ? (
        <StateBanner
          tone="neutral"
          title={t("reviseIsCorrectionTitle")}
          action={
            <Link
              href={accrualCorrectHref(clientId, backingAccrual.accrual_id)}
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              {t("reviseIsCorrectionAction")}
            </Link>
          }
        >
          {t("reviseIsCorrectionBody")}
        </StateBanner>
      ) : planControls(row.status).revise ? (
        <PlanForm clientId={clientId} plan={row} />
      ) : (
        <StateBanner
          tone="neutral"
          title={t("reviseUnavailableTitle")}
          action={
            <Link
              href={planDetailHref(clientId, planId)}
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              {t("backToPlan")}
            </Link>
          }
        >
          {t("reviseUnavailableBody")}
        </StateBanner>
      )}
    </DataState>
  );
}
