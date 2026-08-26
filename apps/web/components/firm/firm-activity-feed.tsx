"use client";

// The firm activity feed — clara.agent_receipts_visible at firm altitude (owner
// ruling Q3, the ADR-0074 inversion made surface). AN AUDIT TRAIL (what happened),
// never conflated with Needs-you (what awaits) — this build's coordinator ruling.
// Every field rendered is a column from the receipt contract itself, never derived.

import { useTranslations } from "next-intl";
import Link from "next/link";
import { useAsyncRead } from "@/lib/firm/use-async-read";
import { loadFirmActivity, type AgentReceiptRow } from "@/lib/firm/reads";
import { sessionTokenAccessor } from "@/lib/session-accessor";
import { DataState } from "./data-state";
import { Badge } from "@/components/parts/PartBadge";

export function FirmActivityFeed() {
  const t = useTranslations("FirmActivity");
  const { data, loading, error } = useAsyncRead(() => loadFirmActivity(sessionTokenAccessor));
  const rows = data ?? [];

  return (
    <div className="flex flex-col gap-4">
      <p className="max-w-prose text-sm text-muted-foreground">{t("subheading")}</p>
      <DataState loading={loading} error={error} isEmpty={rows.length === 0} emptyMessage={t("emptyMessage")}>
        <ul className="flex flex-col gap-2">
          {rows.map((row) => (
            <ReceiptRow key={row.receipt_id} row={row} />
          ))}
        </ul>
      </DataState>
    </div>
  );
}

function ReceiptRow({ row }: { row: AgentReceiptRow }) {
  const t = useTranslations("FirmActivity");
  return (
    <li className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="neutral">{row.receipt_kind}</Badge>
        <Badge tone={row.scope === "platform" ? "info" : "neutral"}>
          {row.scope === "platform" ? t("platformScope") : row.client_id ? (
            <Link href={`/clients/${row.client_id}`} className="underline-offset-4 hover:underline">
              {row.client_id.slice(0, 8)}
            </Link>
          ) : (
            row.scope
          )}
        </Badge>
        <span className="text-xs text-muted-foreground">{new Date(row.occurred_at).toLocaleString()}</span>
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
        <dt className="text-muted-foreground">{t("columnActor")}</dt>
        <dd className="truncate text-card-foreground">{row.acting_actor}</dd>
        <dt className="text-muted-foreground">{t("columnBasis")}</dt>
        <dd className="text-card-foreground">{row.rationale ?? t("noRationale")}</dd>
      </dl>
    </li>
  );
}
