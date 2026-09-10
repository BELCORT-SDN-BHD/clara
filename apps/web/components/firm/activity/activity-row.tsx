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
  agentReceiptKindOf,
  primaryActivityHref,
  type ActivityRow as ActivityRowData,
} from "@/lib/firm/activity";
import { isKnownAgentReceiptKind } from "@/lib/firm/receipt-kinds";
import type { MemberNameResolver } from "@/lib/members/use-member-names";
import { MemberName } from "@/components/common/member-name";

type Translate = (key: string, values?: Record<string, string>) => string;

const STATUS_TONE = {
  approved: "neutral",
  reversed: "warning",
  superseded: "warning",
  withdrawn: "warning",
} as const;

/** The four states 0181's own status derivation can produce (this migration's header). Anything
 *  else — e.g. the raw `je.status` pass-through for a still-`draft` entry — renders its own
 *  value rather than a fabricated label; the checked lookup is what keeps that honest instead of
 *  guessing at a translation key that may not exist. */
function isKnownActivityStatus(value: string): value is keyof typeof STATUS_TONE {
  return value in STATUS_TONE;
}

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

  const sentence = describeRow(row, t, tReceipt);

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

      {row.original_entry_id || row.replacement_entry_id ? (
        <p className="text-xs text-muted-foreground">
          {row.original_entry_id ? t("linksToOriginal") : null}
          {row.replacement_entry_id ? t("linksToReplacement") : null}
        </p>
      ) : null}

      {href ? (
        <Link href={href} className="w-fit text-xs text-primary underline-offset-4 hover:underline">
          {t(row.work_id ? "viewWork" : "viewObject")}
        </Link>
      ) : null}
    </li>
  );
}

/** The one sentence a row shows — always a DB-provided fact, never a composed guess.
 *  event: `description` (event_types' own sentence). agent_receipt: the pinned receipt-kind
 *  label. operation_receipt: the Work purpose label (`event_type` carries the purpose, per
 *  0181's own header — the door's ONE allowed substitute for a fabricated sentence). */
function describeRow(row: ActivityRowData, t: Translate, tReceipt: Translate): string {
  if (row.source === "event") return row.description ?? row.event_type ?? t("unlabeledEvent");
  if (row.source === "agent_receipt") {
    const kind = agentReceiptKindOf(row);
    return kind && isKnownAgentReceiptKind(kind) ? tReceipt(`receiptKinds.${kind}`) : (kind ?? t("unlabeledEvent"));
  }
  // operation_receipt: event_type carries clara.accounting_work.purpose, a closed CHECK
  // ('journal_entry' today, 0178:305) — a purpose this build has not registered a label for
  // renders itself rather than a guessed translation.
  if (!row.event_type) return t("unlabeledEvent");
  return row.event_type === "journal_entry" ? t("workPurposes.journal_entry") : row.event_type;
}
