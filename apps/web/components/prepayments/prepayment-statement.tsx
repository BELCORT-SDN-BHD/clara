// #653 — THE TWO PERSISTENT STATEMENTS, on every prepayment surface.
//
// THE BOUNDARY. #640's own rule applied to this lane, and sharpened by it: an amortisation
// schedule creates journal Work on each period's month end, and it never initiates a bank payment
// or a mandate. The sharpening is that a prepayment has ALREADY been paid — the money left the
// bank before any of this — so the one thing a reader might fear ("will configuring this pay
// something?") has an answer this sentence gives outright.
//
// THE CONFIGURATION BOUNDARY, which is #653's own and is NOT optional. AC4 asks the surface to
// "distinguish accepted plan configuration from posted occurrence", and the estate cannot give the
// stronger guarantee: `clara.prepayment_schedule_v1` refuses a source entry that has not posted
// (0140:1040-1044), so recognition and configuration can never be ONE commit, and configuration
// posts nothing by itself. Saying so in words is the honest form of a guarantee the product does
// not have — and the list's own "posted N of M periods" column is the same fact as a number.
//
// BOTH ARE PERSISTENT StateBanners, NOT TOASTS (appendix C §3): a transient acknowledgement cannot
// carry a boundary a person needs WHILE they are deciding. Tone `info` on both: nothing is wrong
// and nothing is being withheld — this is what the product does.

import { useTranslations } from "next-intl";

import { StateBanner } from "@/components/common/state";

export function PrepaymentBoundaryStatement() {
  const t = useTranslations("Prepayments");
  return (
    <StateBanner tone="info" title={t("boundaryTitle")}>
      {t("boundaryBody")}
    </StateBanner>
  );
}

export function PrepaymentConfigurationStatement() {
  const t = useTranslations("Prepayments");
  return (
    <StateBanner tone="info" title={t("configurationTitle")}>
      {t("configurationBody")}
    </StateBanner>
  );
}
