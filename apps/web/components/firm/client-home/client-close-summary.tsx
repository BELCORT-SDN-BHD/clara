"use client";

// SECTION F — close. The current fiscal year and its status, THAT YEAR's end date with the basis
// the DB records for it, the readiness gate tally, and a live close-prep hold if one stands. The
// client's own standing year end appears only when no fiscal year has been opened, and without a
// basis word — see the next block for why those are two different facts.
//
// THE YEAR END CARRIES ITS SOURCE — AND IT IS THE FISCAL YEAR'S OWN DATE, NOT THE CLIENT'S.
//
// TWO DIFFERENT NUMBERS LIVE UNDER ONE ENGLISH PHRASE, and the first cut of this section paired
// one with the other's provenance (review-557, MAJOR 2 — law 3, spelling is not identity):
//
//   `clara.fiscal_years.ends_on`      the END DATE OF THIS YEAR, and `fy_end_source` beside it
//                                     provenances THAT date — asserted by the firm, taken from a
//                                     filed document, or defaulted to 31 December
//                                     (`0120:1335-1338`).
//   `clara.clients.fy_end_month/day`  the client's STANDING year end, the fiscal-year opener's
//                                     own precondition, written by a DIFFERENT door
//                                     (`0041:3264`, `set_client_fy_end`).
//
// They routinely agree and are not the same fact: a short first period, a change of year end, or
// a year opened before the pair was set all separate them. `fy_end_source` says nothing about
// the client's pair, so printing the pair under that word was a provenance claim the database
// never made.
//
// So: with an open fiscal year, this renders the YEAR's own `ends_on` with the YEAR's own
// source — the pair the DB actually relates. The client's standing year end appears ONLY in the
// no-fiscal-year arm, where it is the honest thing to show, and WITHOUT a basis word, because
// no read provenances it.
//
// `ends_on` is rendered VERBATIM. It is a DATE the DB owns, not an instant, so there is no
// timezone to resolve and nothing for this build to reformat — the one thing `businessDate`
// exists to prevent is exactly what parsing it into a `Date` would reintroduce.
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
              {t("closeYearEndSource", {
                date: year.ends_on,
                source: t(`closeYearEndBasis.${year.fy_end_source}`),
              })}
            </dd>
            <dt className="text-muted-foreground">{t("closeReadinessLabel")}</dt>
            <dd className="text-foreground">{t("closeReadiness", { met, total })}</dd>
          </dl>
        ) : null}
      </DataState>
      {/* The no-fiscal-year arm, and the ONLY place the client's standing pair is shown. It is
          the honest thing to report for a client with no year opened yet — the opener's own
          precondition — and it carries NO basis word, because nothing provenances it. */}
      {!close.loading && !close.error && year === null && fy && fy.fy_end_month !== null && fy.fy_end_day !== null ? (
        <p className="text-xs text-muted-foreground">
          {t("closeYearEndOnFile", {
            date: `${String(fy.fy_end_day).padStart(2, "0")}/${String(fy.fy_end_month).padStart(2, "0")}`,
          })}
        </p>
      ) : null}
      {!close.loading && !close.error && year === null && fy && (fy.fy_end_month === null || fy.fy_end_day === null) ? (
        <p className="text-xs text-muted-foreground">{t("closeYearEndUnset")}</p>
      ) : null}
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
