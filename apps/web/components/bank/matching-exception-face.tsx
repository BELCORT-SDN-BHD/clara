"use client";

// #657 · AC12 / C-40 — THE GOVERNING EXCEPTION, ON THE LINE, WITH ITS RECOVERY.
//
// `clara._wdb_line_booking_block` (0044:2459-2779) has answered this question since 0044 and had
// ZERO consumers in `apps/web` or `packages/runtime` — a named door with no UI, which is exactly
// what C-40 carries. Migration 0226's granted wrapper publishes its payload; this component
// renders it.
//
// THREE RULES, and the third is the one that keeps the boundary honest:
//   1. THE LINE STAYS VISIBLE AND PENDING. `list_unmatched_lines` excludes an excepted line by
//      design (0040:4117-4122), so without this face the line simply vanishes and the human is
//      left with a statement that does not tie and nothing to click. The context read is what
//      keeps it on screen.
//   2. THE RECOVERY IS LINKED, NOT DESCRIBED. `remedy_calls` become links into the Exceptions
//      tab of this same workbench (`?tab=exceptions`), so the human moves to where the act
//      lives instead of reading the name of a function.
//   3. THERE IS NO RESOLVE CONTROL HERE, EVER. Resolving an exception is #671's door, and
//      offering it on the matching surface would put two lanes on one act. This component
//      renders the reason, the verdict and the way out, and stops.
//
// It renders the DB's own token (`exception_booking_outstanding`) rather than a re-worded one:
// the block's own header says a human must not learn two names for this state, and `caused_by`
// on each booking is where the widened subject explains itself.

import { useTranslations } from "next-intl";
import Link from "next/link";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { remedyCallsOf, type BankLineMatchingContext } from "@/lib/bank/matching-context-types";

export function MatchingExceptionFace({
  clientId,
  exception,
  block,
}: {
  clientId: string;
  exception: BankLineMatchingContext["exception"];
  block: BankLineMatchingContext["booking_block"];
}) {
  const t = useTranslations("ClientBank.matching");
  if (!exception && !block) return null;
  const exceptionsHref = `/clients/${clientId}/bank?tab=exceptions`;

  return (
    <Alert variant="destructive" data-testid="matching-exception-face">
      <AlertTitle>{t("exceptionTitle")}</AlertTitle>
      <AlertDescription>
        {exception && (
          <p data-testid="exception-reason">
            {t("exceptionKindReason", { kind: exception.kind ?? "—", reason: exception.reason ?? "—" })}
          </p>
        )}
        {block && (
          <>
            <p data-testid="exception-token" className="font-mono text-[11px]">{block.reason}</p>
            <p>{block.blocking ? t("exceptionBlocking") : t("exceptionNotBlocking")}</p>
            {block.remedy && <p data-testid="exception-remedy">{block.remedy}</p>}
            {block.bookings.map((booking, i) => {
              const calls = remedyCallsOf(booking);
              const entryId = typeof booking.entry_id === "string" ? booking.entry_id : null;
              const causedBy = typeof booking.caused_by === "string" ? booking.caused_by : null;
              return (
                <div key={entryId ?? `booking-${i}`} data-testid="exception-booking" className="mt-2">
                  <p className="text-[11px]">
                    {t("exceptionBooking", { entry: entryId ?? "—", cause: causedBy ?? "—" })}
                  </p>
                  {calls.length > 0 && (
                    <ul className="mt-1 flex flex-wrap gap-2 text-[11px]">
                      {calls.map((call) => (
                        <li key={call}>
                          <Link
                            data-testid="exception-remedy-link"
                            className="underline underline-offset-2"
                            href={exceptionsHref}
                          >
                            {t("exceptionRemedyLink", { call })}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </>
        )}
        <p className="mt-2 text-[11px] text-muted-foreground">{t("exceptionNoResolveHere")}</p>
      </AlertDescription>
    </Alert>
  );
}
