"use client";

// #635 (C55.21 / C-02) — WHAT CLARA'S MODELS WERE ASKED TO DO FOR THIS FIRM, BY MONTH.
//
// THE TWO BUCKETS ARE NEVER SUMMED, AND THE SEPARATION IS STRUCTURAL. `clara.get_llm_usage_summary`
// refuses to fold them (0110:718-727: "a platform call is real spend and must be visible, but
// adding it to a firm's total would bill one tenant for a global act"), so this card renders them
// as two labelled groups with two subtotals and no grand total. A "total" row here would be the
// surface making an addition the database deliberately declined to make.
//
// FRESHNESS IS PUBLISHED, NOT HIDDEN. `unpriced_calls` is 0110:702-704's own tripwire: a call
// whose day has no effective `llm_price_table` row is COUNTED but not priced. The card says how
// many, beside the figure, and the CSV carries the same count — so a file cannot read as a
// complete bill when the screen said it was not.
//
// THE MONEY IS THE PROVIDER'S, IN USD, AND IT IS NEVER CONVERTED. `llm_price_table.currency` is
// `'USD'` by CHECK (0110:497) with the FX non-goal written beside it (0110:494-496); migration
// 0233's tail re-reads that CHECK so a later widening reds the migration instead of silently
// mislabelling money. The label says "provider price (USD), not your books" wherever a figure
// appears, and the separation sentence says the rest: these are Clara's own costs, they are not a
// client's figures, and they never post to a ledger. **No chart** — #660 owns `ui:add chart`, and
// appendix D's readable-table rule is this card's.
//
// THE WINDOW IS THE DOOR'S OWN, AND IT IS UTC. 0110:711-712 bins the month and 0110:750 filters
// rows by `(created_at at time zone 'utc')::date`, so the month this card labels is a UTC month,
// not an `Asia/Kuala_Lumpur` one. `lib/firm/usage-period.ts` derives the bounds the same way the
// door does and the line under the selector prints them, rather than letting a reader assume the
// house calendar applies to a figure it does not apply to.
//
// THE CSV IS CLIENT-SIDE, FROM THE ROWS ON SCREEN. No route, no door, no byte path, no
// `Content-Disposition` — `lib/firm/usage-csv.ts` serialises the same array this table renders and
// `triggerDownload` hands it over. The action is ABSENT on an empty period rather than disabled
// with zero rows (appendix D §136: a named zero after a complete read).

import { useTranslations } from "next-intl";

import { StateBanner } from "@/components/common/state";
import { TechnicalDetail } from "@/components/common/technical-detail";
import { NativeSelect } from "@/components/common/native-select";
import { SectionHeader } from "@/components/common/section-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { triggerDownload } from "@/lib/download-mechanism";
import { formatInteger, formatMoneyCents, formatUsageMonth, formatUtcDay } from "@/lib/firm/commercial-format";
import type { FirmUsageRow, UsageScope } from "@/lib/firm/commercial-reads";
import { buildUsageCsv, usageCsvFilename } from "@/lib/firm/usage-csv";
import type { UsagePeriod } from "@/lib/firm/usage-period";
import type { FirmSettingsView } from "./firm-settings-view";

const SCOPE_ORDER: readonly UsageScope[] = ["firm", "platform"];

export type AiUsageCardProps = {
  readonly view: FirmSettingsView<readonly FirmUsageRow[]>;
  readonly period: UsagePeriod;
  readonly months: readonly string[];
  readonly firmName: string;
  readonly onPeriodChange: (month: string) => void;
  readonly onRetry: () => void;
  /** Injected by the unit cells so the object-URL handoff is observable without a DOM download. */
  readonly download?: (args: { blob: Blob; filename: string }) => void;
};

export function AiUsageCard({
  view,
  period,
  months,
  firmName,
  onPeriodChange,
  onRetry,
  download = triggerDownload,
}: AiUsageCardProps) {
  const t = useTranslations("FirmSettings");
  const rows = view.status === "ready" ? view.data : null;
  const currency = rows?.find((r) => r.priceCurrency.length > 0)?.priceCurrency ?? "USD";
  const unpriced = (rows ?? []).reduce((sum, r) => sum + r.unpricedCalls, 0);
  const hasRows = rows !== null && rows.length > 0;

  function onDownload() {
    if (rows === null || rows.length === 0) return;
    const csv = buildUsageCsv(rows, {
      firmName,
      fromDate: period.fromDate,
      toDate: period.toDate,
      currency,
    });
    download({
      blob: new Blob([csv], { type: "text/csv;charset=utf-8" }),
      filename: usageCsvFilename(period.month),
    });
  }

  return (
    <Card>
      <CardHeader>
        <SectionHeader level={2}>{t("usageHeading")}</SectionHeader>
        <CardDescription className="text-xs">{t("usageSubheading")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted-foreground" htmlFor="firm-usage-period">
              {t("usagePeriodLabel")}
            </label>
            <NativeSelect
              id="firm-usage-period"
              value={period.month}
              onChange={(e) => onPeriodChange(e.currentTarget.value)}
            >
              {months.map((month) => (
                <option key={month} value={month}>
                  {formatUsageMonth(month)}
                </option>
              ))}
            </NativeSelect>
          </div>
          {hasRows ? (
            <Button type="button" variant="outline" size="sm" onClick={onDownload}>
              {t("usageDownload")}
            </Button>
          ) : null}
        </div>

        <p className="text-xs text-muted-foreground">
          {t("usageWindow", { from: formatUtcDay(period.fromDate), to: formatUtcDay(period.toDate) })}
        </p>
        {period.fellBack ? <StateBanner tone="neutral">{t("usageBadPeriod")}</StateBanner> : null}

        {view.status === "loading" ? <Skeleton className="h-32 w-full" /> : null}

        {view.status === "denied" ? (
          <StateBanner tone="warning" code="CLR04">{view.message}</StateBanner>
        ) : null}

        {view.status === "failed" ? (
          <StateBanner tone="error" action={<Button type="button" variant="outline" size="sm" onClick={onRetry}>{t("retry")}</Button>}>
            {t("readFailed")}
            <TechnicalDetail>{`get_firm_ai_usage: ${view.message}`}</TechnicalDetail>
          </StateBanner>
        ) : null}

        {rows !== null && rows.length === 0 ? (
          // A NAMED ZERO after a complete read — and the download action is ABSENT, not disabled
          // over an empty table (appendix D §136).
          <p className="text-sm text-muted-foreground">{t("usageEmpty")}</p>
        ) : null}

        {hasRows ? (
          <>
            {unpriced > 0 ? (
              <StateBanner tone="neutral">{t("usageUnpriced", { count: unpriced })}</StateBanner>
            ) : null}
            {SCOPE_ORDER.map((scope) => {
              const scopeRows = rows.filter((r) => r.scope === scope);
              if (scopeRows.length === 0) return null;
              const label = scope === "firm" ? t("usageScopeFirm") : t("usageScopePlatform");
              return (
                <section key={scope} className="flex flex-col gap-1" aria-label={label}>
                  <SectionHeader level={3}>{label}</SectionHeader>
                  <p className="text-xs text-muted-foreground">
                    {scope === "firm" ? t("usageScopeFirmNote") : t("usageScopePlatformNote")}
                  </p>
                  <Table aria-label={label}>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("usageColCallKind")}</TableHead>
                        <TableHead className="text-right">{t("usageColCalls")}</TableHead>
                        <TableHead className="text-right">{t("usageColInput")}</TableHead>
                        <TableHead className="text-right">{t("usageColOutput")}</TableHead>
                        <TableHead className="text-right">{t("usageColSpend")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {scopeRows.map((row) => (
                        <TableRow key={`${row.scope}:${row.callKind}`}>
                          <TableCell>{row.callKind}</TableCell>
                          <TableCell className="text-right tabular-nums">{formatInteger(row.calls)}</TableCell>
                          <TableCell className="text-right tabular-nums">{formatInteger(row.inputTokens)}</TableCell>
                          <TableCell className="text-right tabular-nums">{formatInteger(row.outputTokens)}</TableCell>
                          <TableCell className="text-right tabular-nums">
                            {/* A FIGURE ONLY WHERE SOMETHING WAS PRICED. A zero beside four
                                unpriced calls would read as "this cost nothing". */}
                            {row.pricedCalls > 0 ? formatMoneyCents(row.spendCents, row.priceCurrency) : "—"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </section>
              );
            })}
            <p className="max-w-prose text-xs text-muted-foreground">{t("usageCurrencyNote", { currency })}</p>
          </>
        ) : null}

        <p className="max-w-prose text-xs text-muted-foreground">
          {t("usageSeparation")}{" "}
          <a className="underline underline-offset-4" href="/clients">
            {t("usageClientsLink")}
          </a>
        </p>
      </CardContent>
    </Card>
  );
}
