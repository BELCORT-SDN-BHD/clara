"use client";

// SECTION F — close. The current fiscal year and its status, the year end with the BASIS it was
// set on, the readiness gate tally, and a live close-prep hold if one stands.
//
// THE YEAR END CARRIES ITS SOURCE. `clara.clients.fy_end_month/day` is read through
// `getClientFyEnd`, and `fy_end_source` on the fiscal year says whether the date was asserted by
// a human, taken from a filed document, or defaulted to 31 December (lib/close/types.ts's
// `FyEndSource`). A year end shown without that word is a date the reader would take as
// established fact when it may be a default nobody has confirmed.
//
// THE GATE TALLY IS A COUNT OVER THE DB'S OWN VERDICTS, NOT A JUDGEMENT. `get_close_readiness`
// returns one `state` per measured gate and deliberately computes NO overall "ready" boolean
// (ADR-065/E-R2; lib/close/types.ts says so explicitly). This section counts how many of the
// returned gates are `pass` out of how many were RETURNED, and says nothing about whether the
// year can close — that verdict is the close tab's, behind the door that owns it.
//
// A GATE THE DB HAS NEVER MEASURED IS ABSENT FROM `gates[]` ENTIRELY, so the denominator here is
// "gates measured", never "gates that exist". The close tab cross-references the live
// `close_gate_checks` catalog to show unmeasured ones; a summary line that silently folded them
// in would report a smaller denominator and a rosier ratio.
//
// NO CONTROL. Begin, finalize, abandon and reopen are admin+ acts on the close tab. 裁-187
// abolished their attestation ceremonies; it did not move them onto a summary board.

import Link from "next/link";
import { useTranslations } from "next-intl";

import { Badge } from "@/components/parts/PartBadge";
import { SectionHeader } from "@/components/common/section-header";
import { getClientFyEnd, getCloseReadiness, getLiveClosePrepHold, listFiscalYears } from "@/lib/close/api";
import type { CloseReadiness, FiscalYearRow } from "@/lib/close/types";
import { useAsyncRead } from "@/lib/firm/use-async-read";
import { sessionTokenAccessor } from "@/lib/session-accessor";
import { DataState, ErrorMessage } from "../data-state";

/** The fiscal year this board reports on: the one with the highest `ordinal`, which is the DB's
 *  own ordering column for the client's year sequence. Chosen, never composed from dates. */
export function currentFiscalYear(rows: readonly FiscalYearRow[]): FiscalYearRow | null {
  return rows.reduce<FiscalYearRow | null>(
    (best, row) => (best === null || row.ordinal > best.ordinal ? row : best),
    null,
  );
}

/** How many of the gates the DB RETURNED are passing. `advisory` is not counted as passing:
 *  it is the DB's own third verdict and folding it into `pass` would overstate readiness. */
export function gateTally(readiness: CloseReadiness | null): { met: number; total: number } {
  const gates = readiness?.gates ?? [];
  return { met: gates.filter((gate) => gate.state === "pass").length, total: gates.length };
}

type CloseSnapshot = { year: FiscalYearRow | null; readiness: CloseReadiness | null };

export function ClientCloseSummary({ clientId }: { clientId: string }) {
  const t = useTranslations("ClientWorkspace");
  const opts = { session: sessionTokenAccessor };

  const close = useAsyncRead<CloseSnapshot>(async () => {
    const years = await listFiscalYears(clientId, opts);
    const year = currentFiscalYear(years);
    if (year === null) return { year: null, readiness: null };
    const readiness = await getCloseReadiness(clientId, year.fiscal_year_id, opts);
    return { year, readiness };
  });
  const fyEnd = useAsyncRead(() => getClientFyEnd(clientId, opts));
  const hold = useAsyncRead(() => getLiveClosePrepHold(clientId, opts));

  const year = close.data?.year ?? null;
  const { met, total } = gateTally(close.data?.readiness ?? null);
  const fy = fyEnd.data;

  return (
    <section aria-labelledby="client-home-close" className="flex flex-col gap-2">
      <SectionHeader level={2}>
        <span id="client-home-close">{t("closeHeading")}</span>
      </SectionHeader>
      <DataState
        loading={close.loading}
        error={close.error}
        isEmpty={year === null}
        emptyMessage={t("closeEmpty")}
      >
        {year ? (
          <dl className="enter-content grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
            <dt className="text-muted-foreground">{t("closeYear")}</dt>
            <dd className="text-foreground">
              {year.label} · {t(`closeStatus.${year.status}`)}
            </dd>
            <dt className="text-muted-foreground">{t("closeYearEnd")}</dt>
            <dd className="text-foreground">
              {fy && fy.fy_end_month !== null && fy.fy_end_day !== null
                ? t("closeYearEndSource", {
                    date: `${String(fy.fy_end_day).padStart(2, "0")}/${String(fy.fy_end_month).padStart(2, "0")}`,
                    source: t(`closeYearEndBasis.${year.fy_end_source}`),
                  })
                : t("closeYearEndUnset")}
            </dd>
            <dt className="text-muted-foreground">{t("closeReadinessLabel")}</dt>
            <dd className="text-foreground">{t("closeReadiness", { met, total })}</dd>
          </dl>
        ) : null}
      </DataState>
      {fyEnd.error ? <ErrorMessage error={fyEnd.error} /> : null}
      {hold.error ? <ErrorMessage error={hold.error} /> : null}
      {hold.data ? <Badge tone="warning">{t("closeHold")}</Badge> : null}
      <Link
        href={`/clients/${clientId}/close`}
        className="text-xs text-primary underline-offset-4 hover:underline"
      >
        {t("closeOpenTab")}
      </Link>
    </section>
  );
}
