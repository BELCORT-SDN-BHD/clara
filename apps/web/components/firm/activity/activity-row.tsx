"use client";

// One row of the unified Activity feed (#632). Every field rendered here is a column the door
// already gives — this component never composes a sentence out of raw ids, and it never prints
// `payload`/rationale (neither is ever on the wire for this feed; see lib/firm/activity.ts's own
// header for why).
//
// C77.3 (attribution present on every row): actor is ALWAYS rendered — via <MemberName>, which
// itself falls back to the honest shortened raw id rather than a blank (components/common/
// member-name.tsx) — and "on behalf of"/the wake-kind delegation are shown EXPLICITLY beside it
// whenever the row carries them, never folded into a tooltip a screen reader would miss.
//
// THE RECEIPT-KIND LABEL RIDES THE EXISTING "FirmActivity.receiptKinds" NAMESPACE, DELIBERATELY,
// rather than a copy under "Activity". `lib/firm/receipt-kinds.test.ts` pins that exact path
// against `clara.agent_receipt_surfaces`'s own registered rows — moving the strings would mean
// either breaking that pin or re-deriving it, for no behavioural gain. "keep receipt-kinds.ts
// pinned and used for receipt labels" (the work order's own words) is read literally here.

import Link from "next/link";
import { useTranslations } from "next-intl";

import { Badge } from "@/components/parts/PartBadge";
import { businessDateTime } from "@/lib/business-date";
import {
  activityJournalsHref,
  describeActivity,
  isKnownActivityStatus,
  primaryActivityHref,
  type ActivityRow as ActivityRowData,
} from "@/lib/firm/activity";
import type { MemberNameResolver } from "@/lib/members/use-member-names";
import { MemberName } from "@/components/common/member-name";

const STATUS_TONE = {
  approved: "neutral",
  reversed: "warning",
  superseded: "warning",
  withdrawn: "warning",
} as const;

export function ActivityRow({
  row,
  clientNames,
  memberNames,
  onOpenDetail,
}: {
  row: ActivityRowData;
  clientNames: ReadonlyMap<string, string>;
  memberNames: MemberNameResolver;
  onOpenDetail: (row: ActivityRowData) => void;
}) {
  const t = useTranslations("Activity");
  const tReceipt = useTranslations("FirmActivity");
  const clientLabel = row.client_id ? (clientNames.get(row.client_id) ?? t("clientUnnamed")) : t("noClient");
  const href = primaryActivityHref(row);

  const sentence = describeActivity(row, t, tReceipt);

  return (
    <li className="enter-content flex flex-col gap-2 rounded-lg border border-border bg-card p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="neutral">{t(`kindLabels.${row.kind}`)}</Badge>
        {row.status ? (
          <Badge tone={isKnownActivityStatus(row.status) ? STATUS_TONE[row.status] : "neutral"}>
            {isKnownActivityStatus(row.status) ? t(`statusLabels.${row.status}`) : row.status}
          </Badge>
        ) : null}
        <span className="text-xs text-muted-foreground">{businessDateTime(row.occurred_at)}</span>
      </div>

      <button
        type="button"
        onClick={() => onOpenDetail(row)}
        className="rounded text-left text-sm font-medium text-card-foreground underline-offset-4 hover:underline focus-visible:ring-3 focus-visible:ring-ring/70 focus-visible:outline-none"
      >
        {sentence}
      </button>

      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
        <dt className="text-muted-foreground">{t("columnActor")}</dt>
        <dd className="truncate text-card-foreground">
          <MemberName userId={row.actor} resolver={memberNames} />
          {row.on_behalf_of ? (
            <span className="ml-1 text-muted-foreground">
              {t("onBehalfOf")} <MemberName userId={row.on_behalf_of} resolver={memberNames} showRole={false} />
            </span>
          ) : null}
          {row.via_wake_kind ? (
            // A raw technical token, deliberately not translated: via_wake_kind spans several
            // independently-registered wake-kind vocabularies across the three sources this feed
            // unions (see 0181's header), and no closed enum here would stay true as new kinds
            // register — an honest raw value beats a guessed or silently-stale translation.
            <span className="ml-1 text-muted-foreground">
              · {t("via")} {row.via_wake_kind}
            </span>
          ) : null}
        </dd>
        <dt className="text-muted-foreground">{t("columnClient")}</dt>
        <dd className="text-card-foreground">
          {row.client_id ? (
            <Link href={`/clients/${row.client_id}`} className="underline-offset-4 hover:underline">
              {clientLabel}
            </Link>
          ) : (
            clientLabel
          )}
        </dd>
      </dl>

      {/* Two SEPARATE lines, each a REAL anchor — a corrected entry links to both the original
          and the replacement it was corrected into/from (review finding 7). Both land on the
          Journals tab with `?entry=<id>` today (#634's lane reads that param; until it merges the
          page lands on the tab regardless, which is the honest destination either way). */}
      {row.client_id && row.original_entry_id ? (
        <Link
          href={activityJournalsHref(row.client_id, row.original_entry_id)}
          className="w-fit text-xs text-primary underline-offset-4 hover:underline"
        >
          {t("linksToOriginal")}
        </Link>
      ) : null}
      {row.client_id && row.replacement_entry_id ? (
        <Link
          href={activityJournalsHref(row.client_id, row.replacement_entry_id)}
          className="w-fit text-xs text-primary underline-offset-4 hover:underline"
        >
          {t("linksToReplacement")}
        </Link>
      ) : null}

      {href ? (
        <Link href={href} className="w-fit text-xs text-primary underline-offset-4 hover:underline">
          {t(row.work_id ? "viewWork" : "viewObject")}
        </Link>
      ) : null}
    </li>
  );
}
