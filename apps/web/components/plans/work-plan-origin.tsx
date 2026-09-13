"use client";

// #640 — "From plan <purpose>" on journey B3's Work identity block.
//
// ONE ROW, AND ONLY WHEN THERE IS ONE. `clara.get_work_plan_origin` answers NULL for a Work nobody
// scheduled — which is most of them — and this component renders NOTHING in that case rather than
// an empty row. A label with a dash beside it on every manually composed entry would be noise on
// the surface a professional reads most often.
//
// IT IS A SELF-CONTAINED CHILD RATHER THAN A PROP ON `WorkFacts`, deliberately. #641 is
// restructuring `components/work/work-detail.tsx` into Tabs at the same time, so this lane's
// footprint there is ONE import and ONE JSX line inside the existing identity `<dl>`; the read,
// the loading posture and the link all live here. A prop threaded through two component
// boundaries would have been three edits in a file another ticket is rewriting.
//
// IT RENDERS NOTHING WHILE THE READ IS IN FLIGHT, AND THAT IS THE RIGHT POSTURE HERE rather than a
// loading sentence: the row is supplementary provenance beside facts that are already on screen,
// and a "Loading…" line that usually resolves to "there is no plan" would flicker on every Work.
// A FAILED read is equally silent for the same reason — the Work's own identity is unaffected by
// it, and the plan page is where a person goes when they want the schedule.

import Link from "next/link";
import { useTranslations } from "next-intl";

import { loadWorkPlanOrigin } from "@/lib/plans/api";
import { planDetailHref } from "@/lib/navigation/tree";
import { useAsyncRead } from "@/lib/firm/use-async-read";

export function WorkPlanOriginRow({ clientId, workId }: { clientId: string; workId: string }) {
  const t = useTranslations("WorkDetail");
  const origin = useAsyncRead(() => loadWorkPlanOrigin(workId));
  const row = origin.data;
  if (row === null || row === undefined) return null;
  return (
    <>
      <dt className="text-muted-foreground">{t("fromPlanLabel")}</dt>
      <dd className="text-foreground">
        <span className="inline-flex flex-wrap items-baseline gap-1">
          <span>{t("fromPlan", { purpose: row.purpose })}</span>
          <Link className="underline underline-offset-2" href={planDetailHref(clientId, row.plan_id)}>
            {t("fromPlanLink")}
          </Link>
        </span>
      </dd>
    </>
  );
}
