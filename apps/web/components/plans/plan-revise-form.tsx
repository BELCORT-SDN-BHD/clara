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

import Link from "next/link";
import { useTranslations } from "next-intl";

import { DataState } from "@/components/firm/data-state";
import { StateBanner } from "@/components/common/state";
import { buttonVariants } from "@/components/ui/button";
import { PlanForm } from "./plan-form";
import { loadPlan } from "@/lib/plans/api";
import { planDetailHref } from "@/lib/navigation/tree";
import { planControls } from "@/lib/plans/schedule";
import { useAsyncRead } from "@/lib/firm/use-async-read";

export function PlanReviseForm({ clientId, planId }: { clientId: string; planId: string }) {
  const t = useTranslations("Plans");
  const plan = useAsyncRead(() => loadPlan(planId));
  const row = plan.data;

  return (
    <DataState
      loading={plan.loading}
      error={plan.error}
      isEmpty={row === null}
      emptyMessage={t("notFound")}
    >
      {row === null ? null : planControls(row.status).revise ? (
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
