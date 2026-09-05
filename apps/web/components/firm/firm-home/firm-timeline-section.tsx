"use client";

// "Recent activity" — the firm's own event log, day-grouped, read through
// `clara.list_firm_timeline` (lib/firm/timeline.ts).
//
// THE SENTENCE IS THE DB'S. `event_description` is `clara.event_types.description`
// (0005_event_spine.sql:57-61), a human sentence the database owns, joined by the contract's own
// view. This component prints it verbatim — it never composes a sentence out of the event's
// fields, which would be this build narrating the ledger.
//
// THE PAYLOAD IS NOT READ HERE AND CANNOT BE. The contract drops it at the view rather than
// masking it key by key, so there is no field to leak (see lib/firm/timeline.ts's header for
// why the raw `clara.domain_events` grant was the wrong surface for a browser).
//
// THE THREE FAILURE ARMS ARE TOLD APART, and that is the whole point of this file:
//   NOT DEPLOYED  the function is absent from PostgREST's schema cache (404 / 42883) — the
//                 honest `NotBuiltNote`. This is the state on every checkout until the DB lane's
//                 migration merges, and it is NOT an error: nothing is broken, the read simply
//                 does not exist yet.
//   REFUSED       a viewer meets the door's own CLR04 (the contract floors at bookkeeper). That
//                 renders VERBATIM through `ErrorMessage` — it is a true answer about the
//                 caller's rank, and painting it as "not built" would tell them the product is
//                 missing a feature they are merely not ranked for.
//   FAILED        anything else — 401, 403, 5xx, a transport failure — renders as the failure it
//                 is. Absence is not evidence (review law 2): a read that did not answer proves
//                 nothing about whether the firm has activity.

import Link from "next/link";
import { useTranslations } from "next-intl";

import { NotBuiltNote } from "@/components/common/not-built-note";
import { SectionHeader } from "@/components/common/section-header";
import { businessDateTime } from "@/lib/business-date";
import { groupByBusinessDay } from "@/lib/firm/home-facts";
import { isTimelineNotDeployed, listFirmTimeline, type FirmTimelineRow } from "@/lib/firm/timeline";
import { useAsyncRead } from "@/lib/firm/use-async-read";
import { sessionTokenAccessor } from "@/lib/session-accessor";
import { DataState } from "../data-state";

/** One page. The DB clamps to 200; Home wants a glance, not an archive — `/activity` is where
 *  the full feed lives, and the footer link says so. */
const PAGE = 20;

export function FirmTimelineSection({ clientNames }: { clientNames: ReadonlyMap<string, string> }) {
  const t = useTranslations("FirmHome");
  const timeline = useAsyncRead<FirmTimelineRow[]>(() => listFirmTimeline(sessionTokenAccessor, null, PAGE));

  // Read the arm BEFORE DataState, because DataState's own error branch cannot tell the
  // not-deployed shape from a real failure — it classifies by wire kind, and "not_found" means
  // several different things across the app.
  if (isTimelineNotDeployed(timeline.error)) {
    return (
      <section aria-labelledby="firm-home-activity" className="flex flex-col gap-2">
        <SectionHeader level={2}>
          <span id="firm-home-activity">{t("activityHeading")}</span>
        </SectionHeader>
        <NotBuiltNote className="text-xs">{t("activityNotDeployed")}</NotBuiltNote>
      </section>
    );
  }

  const rows = timeline.data ?? [];
  const days = groupByBusinessDay(rows, (row) => row.created_at);

  return (
    <section aria-labelledby="firm-home-activity" className="flex flex-col gap-2">
      <SectionHeader level={2}>
        <span id="firm-home-activity">{t("activityHeading")}</span>
      </SectionHeader>
      <DataState
        loading={timeline.loading}
        error={timeline.error}
        isEmpty={rows.length === 0}
        emptyMessage={t("activityEmpty")}
      >
        <div className="enter-content flex flex-col gap-3">
          {days.map((group) => (
            <div key={group.day} className="flex flex-col gap-1">
              <SectionHeader level={3}>{group.day}</SectionHeader>
              {/* An ORDERED list: this is a chronology, and its order carries meaning. */}
              <ol className="flex flex-col gap-1 text-xs text-muted-foreground">
                {group.items.map((row) => (
                  <li key={row.seq}>
                    <span className="text-card-foreground">{row.event_description}</span>
                    {row.client_id ? (
                      <>
                        {" · "}
                        {/* ALWAYS UNDERLINED, not `hover:underline` like the standalone links
                            elsewhere on this page. This one sits INSIDE a text block, so WCAG
                            1.4.1 applies: colour alone may not distinguish it from the prose
                            around it, and `--primary` against `--muted-foreground` measures
                            1.33:1 — well under the 3:1 a colour-only distinction would need.
                            Measured by the axe leg, which reds without this. */}
                        <Link
                          href={`/clients/${row.client_id}`}
                          className="text-primary underline underline-offset-4"
                        >
                          {clientNames.get(row.client_id) ?? t("clientUnnamed")}
                        </Link>
                      </>
                    ) : null}
                    {" · "}
                    {businessDateTime(row.created_at)}
                  </li>
                ))}
              </ol>
            </div>
          ))}
          <Link href="/activity" className="text-xs text-primary underline-offset-4 hover:underline">
            {t("seeActivity")}
          </Link>
        </div>
      </DataState>
    </section>
  );
}
