// #941 — THE THREE PERSISTENT STATEMENTS, on every deferred-revenue surface.
//
// THE BOUNDARY. #653's rule applied to this lane, and inverted by it: a recognition schedule
// creates journal Work on each period's month end, and it never issues an invoice, never touches
// MyInvois and never asks a customer for money. The money arrived BEFORE any of this — that is what
// makes it deferred — so the one thing a reader might fear ("will configuring this bill someone?")
// has an answer this sentence gives outright.
//
// THE CONFIGURATION BOUNDARY, #653's own and not optional here either: the door refuses a receipt
// that has not posted, so recognition and configuration can never be ONE commit, and configuration
// posts nothing by itself. Saying so in words is the honest form of a guarantee the product does
// not have — and the list's "posted N of M periods" column is the same fact as a number.
//
// THE TAX BOUNDARY, which is THIS lane's own. Output tax on an advance is owed to the Royal
// Malaysian Customs Department under the Service Tax Act 2018: it is not revenue and it never
// becomes revenue. Migration 0308 excludes any leg stamped `sst_output` from the candidate set, so
// a receipt of Dr bank / Cr deferred revenue / Cr SST output has exactly ONE candidate leg and the
// tax leg stays where the invoice put it. An accountant deciding whether to recognise something
// needs that sentence WHILE they decide, not after.
//
// ALL THREE ARE PERSISTENT StateBanners, NOT TOASTS (appendix C §3): a transient acknowledgement
// cannot carry a boundary a person needs while they are deciding. Tone `info` on all three:
// nothing is wrong and nothing is being withheld — this is what the product does.

import { useTranslations } from "next-intl";

import { StateBanner } from "@/components/common/state";

export function RecognitionBoundaryStatement() {
  const t = useTranslations("DeferredRevenue");
  return (
    <StateBanner tone="info" title={t("boundaryTitle")}>
      {t("boundaryBody")}
    </StateBanner>
  );
}

export function RecognitionConfigurationStatement() {
  const t = useTranslations("DeferredRevenue");
  return (
    <StateBanner tone="info" title={t("configurationTitle")}>
      {t("configurationBody")}
    </StateBanner>
  );
}

export function RecognitionTaxStatement() {
  const t = useTranslations("DeferredRevenue");
  return (
    <StateBanner tone="info" title={t("taxTitle")}>
      {t("taxBody")}
    </StateBanner>
  );
}
