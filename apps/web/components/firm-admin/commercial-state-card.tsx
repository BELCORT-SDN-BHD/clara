"use client";

// #635 — THE PLAN AND THE PAYMENT, AS THE DATABASE HOLDS THEM AND NOT ONE STEP FURTHER.
//
// NOT ONE PRICE APPEARS WHILE `amounts_ruled` IS FALSE (D1, C-01 / C-56). `clara.billing_plans`
// holds one row, seeded `('clara-beta-2026','Clara Beta',0,'MYR',false,true)` (0163:214-215), and
// `amounts_ruled = false` is the DATABASE saying the price has not been set. So the card renders
// the FACT — "Beta — no price has been set for this plan yet" — and never `RM 0.00`, which would
// be a number nobody decided, and never a substitute figure. `amountsRuled` is the RENDER
// CONDITION rather than a note beside a figure, so an owner ruling that sets a real amount shows
// it here with NO code change (`lib/firm/commercial-format.ts`'s `formatPlanAmount` returns null
// until then, and the unit cell is a regex over the whole rendered text).
//
// THERE IS NO "MANAGE BILLING" CONTROL, AT ANY RANK, and its absence is the honest state rather
// than an omission. Nothing in this estate can change a firm's commercial arrangement:
// `billing_plans` has no door at all, and `clara.firm_registration_payments` is written only by
// the Stripe webhook lane (`packages/runtime/src/stripeRoutes.ts`), which is a machine boundary,
// not a human one. A control that could only ever refuse is worse than none (裁-187's own rule,
// `lib/firm/capabilities.ts:14-18`), so the card offers a support route and says why.
//
// INVOICES ARE AN ABSENCE WITH A REASON, not an empty list. The door answers
// `{available:false, reason:'not_collected'}` as a constant — Clara collects no subscription
// invoice for a firm anywhere — and a card that rendered an empty table here would be inviting a
// reader to wait for rows that are not coming. (#655's boundary sentence applies: unqualified
// "invoice" means a CLIENT's accounting document; the firm's own billing document would be a
// SUBSCRIPTION invoice, and it does not exist.)
//
// A REFUSAL ON A RE-READ CLEARS THE FIGURES. The `denied` view carries no `data` field at all
// (`firm-settings-view.ts`), so a live demotion cannot leave a stale plan or payment behind a
// disabled control: the card renders the database's own sentence and nothing else.

import { useTranslations } from "next-intl";

import { StateBanner } from "@/components/common/state";
import { TechnicalDetail } from "@/components/common/technical-detail";
import { SectionHeader } from "@/components/common/section-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDay, formatPlanAmount } from "@/lib/firm/commercial-format";
import type { FirmCommercialState } from "@/lib/firm/commercial-reads";
import type { FirmSettingsView } from "./firm-settings-view";

export const SUPPORT_MAILTO = "mailto:support@clarabook.my?subject=Clara%20commercial%20arrangement";

export function CommercialStateCard({
  view,
  onRetry,
}: {
  readonly view: FirmSettingsView<FirmCommercialState>;
  readonly onRetry: () => void;
}) {
  const t = useTranslations("FirmSettings");
  const state = view.status === "ready" ? view.data : null;
  const planAmount = state === null ? null : formatPlanAmount(state.plan);

  return (
    <Card>
      <CardHeader>
        <SectionHeader level={2}>{t("commercialHeading")}</SectionHeader>
        <CardDescription className="text-xs">{t("commercialSubheading")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {view.status === "loading" ? <Skeleton className="h-24 w-full" /> : null}

        {view.status === "denied" ? (
          <StateBanner tone="warning" code="CLR04">{view.message}</StateBanner>
        ) : null}

        {view.status === "failed" ? (
          <StateBanner tone="error" action={<Button type="button" variant="outline" size="sm" onClick={onRetry}>{t("retry")}</Button>}>
            {t("readFailed")}
            <TechnicalDetail>{`get_firm_commercial_state: ${view.message}`}</TechnicalDetail>
          </StateBanner>
        ) : null}

        {state !== null ? (
          <dl className="flex flex-col gap-3 text-sm">
            <div>
              <dt className="text-xs text-muted-foreground">{t("commercialPlanLabel")}</dt>
              <dd className="font-medium">{state.plan.name}</dd>
              <dd className="text-muted-foreground">
                {planAmount === null
                  ? t("commercialPlanUnruled")
                  : t("commercialPlanAmount", { amount: planAmount, currency: state.plan.currency })}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">{t("commercialPaymentLabel")}</dt>
              <dd>
                {state.payment.recorded && state.payment.recordedAt !== null
                  ? t("commercialPaymentRecorded", {
                      date: formatDay(state.payment.recordedAt) ?? state.payment.recordedAt,
                    })
                  : t("commercialPaymentNone")}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">{t("commercialSubscriptionLabel")}</dt>
              <dd>
                {state.payment.subscriptionPresent
                  ? t("commercialSubscriptionPresent")
                  : t("commercialSubscriptionAbsent")}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">{t("commercialInvoicesLabel")}</dt>
              <dd className="max-w-prose text-muted-foreground">{t("commercialInvoicesUnavailable")}</dd>
              <dd className="pt-1">
                <a className="underline underline-offset-4" href={SUPPORT_MAILTO}>
                  {t("commercialSupport")}
                </a>
              </dd>
            </div>
          </dl>
        ) : null}
      </CardContent>
    </Card>
  );
}
