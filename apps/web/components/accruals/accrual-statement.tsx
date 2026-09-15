// #652 — THE TWO PERSISTENT BOUNDARY STATEMENTS, on every accrual surface.
//
// THEY ARE PERSISTENT BANNERS, NOT TOASTS, and appendix C §3 is explicit about why: a transient
// acknowledgement cannot carry a boundary a person needs WHILE they are deciding. Both render on
// the list, on every accrual's detail and on the form, above the fold, always — never conditionally,
// never once per session, never behind a "learn more". `PlanBoundaryStatement` is the precedent and
// this is the same shape.
//
// THEY ARE ALSO NOT WARNINGS. Tone `info`: nothing is wrong and nothing is being withheld; this is
// what the product does. `role="status"` follows from that tone (components/common/state.tsx's own
// ladder), so they are announced politely rather than interrupting.
//
// WHY TWO.
//
//   1. CONFIGURATION IS NOT POSTING. `clara.create_accrual_adjustment` writes the plan, its
//      revision, the accrual record, the current period's occurrence and the admitted Work in ONE
//      commit and posts NOTHING; the journal entry and its committed operation receipt arrive in
//      the run's own later commit. A preparer who reads "accrual recorded" and expects an entry in
//      the ledger has been told something false, so the surface says the true thing out loud.
//
//   2. AN ACCRUAL IS NOT A PERIODIC STOCK ADJUSTMENT OR A SUPPLIED PAYROLL OBLIGATION. Those are a
//      separately owned lane (#643, `clara.periodic_adjustments`, /accounting/adjustments): they
//      record a movement a period's own facts establish, they have no schedule and no future
//      occurrence, and they post once. An accrual is a SCHEDULE — an amount accrued on a due date
//      and reversed on the first of the following month — and its typed particulars live in
//      `clara.accrual_adjustments`. Nothing in the product said where that line falls before this
//      ticket, and a preparer standing in front of two adjustment surfaces has to be told.

import { useTranslations } from "next-intl";

import { StateBanner } from "@/components/common/state";

export function AccrualConfigurationBoundary() {
  const t = useTranslations("Accruals");
  return (
    <StateBanner tone="info" title={t("boundaryConfigTitle")}>
      {t("boundaryConfigBody")}
    </StateBanner>
  );
}

export function AccrualShapeBoundary() {
  const t = useTranslations("Accruals");
  return (
    <StateBanner tone="info" title={t("boundaryShapeTitle")}>
      {t("boundaryShapeBody")}
    </StateBanner>
  );
}

/** Both, in the order a preparer needs them: what this act does, then what this surface is for. */
export function AccrualBoundaryStatement() {
  return (
    <div className="flex flex-col gap-2">
      <AccrualConfigurationBoundary />
      <AccrualShapeBoundary />
    </div>
  );
}
