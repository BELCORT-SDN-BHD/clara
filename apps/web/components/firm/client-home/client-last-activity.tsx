"use client";

// SECTION G — this client's last agent activity, day-grouped.
//
// IT READS A CLIENT-SCOPED DOOR, NOT A FIRM FEED FILTERED IN THE BROWSER.
// `clara.list_agent_act_receipts(p_client, p_since)` is already scoped to one client by its own
// signature (lib/close/api.ts:271, STABLE, bookkeeper rank). The firm-wide alternative,
// `loadFirmActivity`, has no client filter at all, so using it here would mean reading every
// client's receipts into this browser and discarding the ones that do not match — a cross-client
// read performed to render a single-client card.
//
// THIS IS HISTORY, NOT AN INBOX. Receipts record what already happened; nothing here is waiting
// on anybody. It sits at the bottom of the right column for that reason, and it carries no act.
//
// `act_kind` IS PRINTED AS THE DB SPELLS IT. There is no message catalog for the receipt kinds
// and inventing English for each one would be this build naming the agent's acts. The verdict
// and the timestamp are the DB's too. If a vocabulary is ever minted for these, it lands in the
// message catalog and this line looks it up — it does not get guessed here in the meantime.

import Link from "next/link";
import { useTranslations } from "next-intl";

import { SectionHeader } from "@/components/common/section-header";
import { listAgentActReceipts } from "@/lib/close/api";
import { businessDateTime } from "@/lib/business-date";
import { groupByBusinessDay } from "@/lib/firm/home-facts";
import { useAsyncRead } from "@/lib/firm/use-async-read";
import { sessionTokenAccessor } from "@/lib/session-accessor";
import { DataState } from "../data-state";

/** How many receipts a summary card shows. `/activity` is the full feed. */
const PREVIEW = 8;

export function ClientLastActivity({ clientId }: { clientId: string }) {
  const t = useTranslations("ClientWorkspace");
  // `p_since: null` is the door's own default — every receipt. The cap is applied here, over the
  // rows the DB returned, rather than by inventing a date window the caller cannot justify.
  const receipts = useAsyncRead(() =>
    listAgentActReceipts(clientId, null, { session: sessionTokenAccessor }),
  );

  const rows = (receipts.data ?? []).slice(0, PREVIEW);
  const days = groupByBusinessDay(rows, (row) => row.created_at);

  return (
    <section aria-labelledby="client-home-activity" className="flex flex-col gap-2">
      <SectionHeader level={2}>
        <span id="client-home-activity">{t("activityHeading")}</span>
      </SectionHeader>
      <DataState
        loading={receipts.loading}
        error={receipts.error}
        isEmpty={rows.length === 0}
        emptyMessage={t("activityEmpty")}
      >
        <div className="enter-content flex flex-col gap-3">
          {days.map((group) => (
            <div key={group.day} className="flex flex-col gap-1">
              <SectionHeader level={3}>{group.day}</SectionHeader>
              <ol className="flex flex-col gap-1 text-xs text-muted-foreground">
                {group.items.map((row) => (
                  <li key={row.receipt_id}>
                    <span className="text-card-foreground">{row.act_kind}</span>
                    {" · "}
                    {row.verdict}
                    {" · "}
                    {businessDateTime(row.created_at)}
                  </li>
                ))}
              </ol>
            </div>
          ))}
          <Link href="/activity" className="text-xs text-primary underline-offset-4 hover:underline">
            {t("activitySeeAll")}
          </Link>
        </div>
      </DataState>
    </section>
  );
}
