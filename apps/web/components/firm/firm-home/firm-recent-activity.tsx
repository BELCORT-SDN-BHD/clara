"use client";

// #659 (D18.f) — "Recent activity" on Firm Home, swapped from `clara.list_firm_timeline` onto
// `clara.list_activity`, and now rendering WHO did each thing.
//
// WHY THE SWAP. `list_firm_timeline` (0174) returns the event spine's own sentence and an `actor`
// uuid, and this section printed the sentence and dropped the person. `clara.list_activity` (0181,
// live body 0202) is the unified feed `/activity` already reads: it carries the same sentence plus
// the source, the kind, the acting member, the on-behalf-of delegation and the wake kind — which is
// what lets the ONE shared actor cell (`components/firm/activity/activity-actor-line.tsx`) render
// "Clara on behalf of ⟨name⟩" and "Clara (system)" here exactly as it does on the full feed.
// Both doors floor at bookkeeper, so the swap moves NO permission (0174:453 vs 0202:246-249).
//
// ONE ACTOR CELL, NOT A SECOND RENDERING. `ActivityActorLine` carries #728's and #742's findings —
// the missing space between two name fragments, and the four document-pipeline event types that
// were rendering an em dash for rows that did have an author. A second copy here would have to
// re-learn both.
//
// THE "NOT DEPLOYED" ARM IS GONE, DELIBERATELY. `list_firm_timeline` had one because a database
// could predate migration 0174; `clara.list_activity` exists in every database at this frontier
// (0181:218 -> 0202:204), so a 404 from it is a REAL failure — deployment skew, a misnamed
// argument, an outage — and painting it as "not built yet" would be the same lie in the opposite
// direction. It renders as the typed read failure it is.
//
// #861 IS NAMED ON THIS SURFACE AND NOT PATCHED HERE. `clara.list_activity`'s kind ladder misfiles
// membership, invite, asset-acquisition, counterparty-identity and client-home-facet events under
// `documents`. That is a DOOR defect with its own open ticket and a `ready-for-human` label;
// correcting it in the browser would put a second, disagreeing ladder in the product. The residual
// is disclosed under the list instead.

import Link from "next/link";
import { useTranslations } from "next-intl";

import { SectionHeader } from "@/components/common/section-header";
import { ActivityActorLine } from "@/components/firm/activity/activity-actor-line";
import { businessDateTime } from "@/lib/business-date";
import { describeActivity, listActivity, type ActivityRow } from "@/lib/firm/activity";
import { groupByBusinessDay } from "@/lib/firm/home-facts";
import { useAsyncRead } from "@/lib/firm/use-async-read";
import { useMemberNames } from "@/lib/members/use-member-names";
import { sessionTokenAccessor } from "@/lib/session-accessor";
import { DataState } from "../data-state";

/** One glance, not an archive. `/activity` is where the full feed lives and the footer link says
 *  so; the door clamps its own ceiling at 100 either way. */
const PAGE = 12;

export function FirmRecentActivity({ clientNames }: { clientNames: ReadonlyMap<string, string> }) {
  const t = useTranslations("FirmHome");
  const tActivity = useTranslations("Activity");
  const tReceipt = useTranslations("FirmActivity");
  const memberNames = useMemberNames(sessionTokenAccessor);
  const feed = useAsyncRead(() => listActivity({}, { session: sessionTokenAccessor, limit: PAGE }));

  const rows: ActivityRow[] = feed.data?.rows ?? [];
  const days = groupByBusinessDay(rows, (row) => row.occurred_at);

  return (
    <section aria-labelledby="firm-home-activity" className="flex flex-col gap-2">
      <SectionHeader level={2}>
        <span id="firm-home-activity">{t("activityHeading")}</span>
      </SectionHeader>
      <DataState
        loading={feed.loading}
        error={feed.error}
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
                  <li key={`${row.source}:${row.id}`}>
                    <span className="text-card-foreground">
                      {describeActivity(row, tActivity, tReceipt)}
                    </span>
                    {" · "}
                    <ActivityActorLine row={row} memberNames={memberNames} />
                    {row.client_id ? (
                      <>
                        {" · "}
                        {/* ALWAYS UNDERLINED, not `hover:underline` like the standalone links
                            elsewhere on this page. This one sits INSIDE a text block, so WCAG 1.4.1
                            applies: colour alone may not distinguish it from the prose around it,
                            and `--primary` against `--muted-foreground` measures 1.33:1 — well
                            under the 3:1 a colour-only distinction would need. */}
                        <Link
                          href={`/clients/${row.client_id}`}
                          className="text-primary underline underline-offset-4"
                        >
                          {clientNames.get(row.client_id) ?? t("clientUnnamed")}
                        </Link>
                      </>
                    ) : null}
                    {" · "}
                    {businessDateTime(row.occurred_at)}
                  </li>
                ))}
              </ol>
            </div>
          ))}
          {/* THE RESIDUAL, ON THE SURFACE. Named rather than silently carried — see this file's
              header for why the ladder is not corrected in the browser. */}
          <p className="text-xs text-muted-foreground">{t("activityKindResidual")}</p>
          <Link href="/activity" className="text-xs text-primary underline-offset-4 hover:underline">
            {t("seeActivity")}
          </Link>
        </div>
      </DataState>
    </section>
  );
}
