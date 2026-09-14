// #640 — THE PERSISTENT BOUNDARY STATEMENT, on every plan surface.
//
// Wayfinder #611 (owner-confirmed): "Actually initiating a bank payment or creating/cancelling a
// bank mandate is outside this refresh"; #640's own acceptance: "State clearly that accounting
// schedules create journal Work and do not initiate bank payments or mandates."
//
// IT IS A PERSISTENT ALERT, NOT A TOAST, and appendix C §3 is explicit about why: a transient
// acknowledgement cannot carry a boundary a person needs while they are deciding. This renders on
// the list and on every plan's detail, above the fold, always — never conditionally, never once
// per session, never behind a "learn more".
//
// IT IS ALSO NOT A WARNING. Tone `info`: nothing is wrong and nothing is being withheld; this is
// what the product does. `role="status"` follows from that tone (components/common/state.tsx's
// own ladder), so it is announced politely rather than interrupting.

import { useTranslations } from "next-intl";

import { StateBanner } from "@/components/common/state";

export function PlanBoundaryStatement() {
  const t = useTranslations("Plans");
  return (
    <StateBanner tone="info" title={t("boundaryTitle")}>
      {t("boundaryBody")}
    </StateBanner>
  );
}
