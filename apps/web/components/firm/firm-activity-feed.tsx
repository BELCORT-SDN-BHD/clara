"use client";

// The firm activity feed — clara.agent_receipts_visible at firm altitude (owner
// ruling Q3, the ADR-0074 inversion made surface). AN AUDIT TRAIL (what happened),
// never conflated with Needs-you (what awaits) — this build's coordinator ruling.
// Every field rendered is a column from the receipt contract itself, never derived.
//
// N8 (independent review, 2026-08-27): a role below bookkeeper+ reads an EMPTY
// feed (the view's own role floor, 0103_f_a7_pi_additive.sql:410) — this module
// cannot distinguish that from "nothing happened yet" client-side (no second read
// exists to probe the viewer's own role), so it states the floor as a static,
// honest caption rather than attempting a fabricated role detection.
// N10: receipt_kind is the closed registry clara.agent_receipt_surfaces
// (0103:294-301) — translated via a checked lookup with an honest raw-value
// fallback for anything outside it. N11: occurred_at renders in the business
// timezone explicitly (lib/business-date.ts) — an audit trail read by
// people in different timezones must show the SAME moment, not each viewer's own.
// FIX-5: loadFirmActivity reads a flat limit=100, unpaginated — stated honestly
// rather than implying completeness.

import { useTranslations } from "next-intl";
import Link from "next/link";
import { useAsyncRead } from "@/lib/firm/use-async-read";
import { loadFirmActivity, type AgentReceiptRow } from "@/lib/firm/reads";
import { businessDateTime } from "@/lib/business-date";
import { sessionTokenAccessor } from "@/lib/session-accessor";
import { DataState } from "./data-state";
import { Badge } from "@/components/parts/PartBadge";
import { MemberName } from "@/components/common/member-name";
import { useMemberNames, type MemberNameResolver } from "@/lib/members/use-member-names";

export function FirmActivityFeed() {
  const t = useTranslations("FirmActivity");
  const { data, loading, error } = useAsyncRead(() => loadFirmActivity(sessionTokenAccessor));
  const rows = data ?? [];
  // CB-AE2E-027 (same class): `agent_receipts_visible.acting_actor` is a uuid
  // (0103:261, contract ordinal 6 "who acted"). ONE roster read for the whole
  // feed, held here and passed down — never one per row.
  const memberNames = useMemberNames(sessionTokenAccessor);

  return (
    // `subheading` moved up into the page header (app/(firm)/activity/page.tsx)
    // — the one place every surface puts its orientation line. The two
    // remaining notes are caveats about THIS read (the role floor, the flat
    // limit), which belong beside the data they qualify.
    <div className="flex flex-col gap-2">
      <p className="max-w-prose text-xs text-muted-foreground">{t("visibilityNote")}</p>
      <DataState loading={loading} error={error} isEmpty={rows.length === 0} emptyMessage={t("emptyMessage")}>
        <p className="max-w-prose text-xs text-muted-foreground">{t("showingRecent")}</p>
        <ul className="mt-2 flex flex-col gap-2">
          {rows.map((row) => (
            <ReceiptRow key={row.receipt_id} row={row} memberNames={memberNames} />
          ))}
        </ul>
      </DataState>
    </div>
  );
}

const RECEIPT_KIND_KEYS: Record<string, "receiptKinds.entry_post" | "receiptKinds.bank_agent" | "receiptKinds.agent_act" | "receiptKinds.report_agent" | "receiptKinds.freeform_read" | "receiptKinds.agent_filing" | "receiptKinds.web_fetch"> = {
  entry_post: "receiptKinds.entry_post",
  bank_agent: "receiptKinds.bank_agent",
  agent_act: "receiptKinds.agent_act",
  report_agent: "receiptKinds.report_agent",
  freeform_read: "receiptKinds.freeform_read",
  agent_filing: "receiptKinds.agent_filing",
  web_fetch: "receiptKinds.web_fetch",
};

function ReceiptRow({ row, memberNames }: { row: AgentReceiptRow; memberNames: MemberNameResolver }) {
  const t = useTranslations("FirmActivity");
  const key = RECEIPT_KIND_KEYS[row.receipt_kind];
  // A checked lookup, not a cast (FIX-1's exact discipline): only a KNOWN
  // receipt_kind ever reaches t() with a literal, statically-valid key — an
  // unrecognised value (the registry, 0103:294-301, is closed but a future
  // member would land here first) renders its own raw text, honest and never a
  // key path.
  const kindLabel = key ? t(key) : row.receipt_kind;
  return (
    <li className="enter-content flex flex-col gap-2 rounded-lg border border-border bg-card p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="neutral">{kindLabel}</Badge>
        <Badge tone={row.scope === "platform" ? "info" : "neutral"}>
          {row.scope === "platform" ? (
            t("platformScope")
          ) : row.client_id ? (
            <Link href={`/clients/${row.client_id}`} className="underline-offset-4 hover:underline">
              {row.client_id.slice(0, 8)}
            </Link>
          ) : row.scope === "firm" ? (
            t("firmScopeNoClient")
          ) : (
            row.scope // N10 honest fallback: a scope value outside the known {firm, platform} pair
          )}
        </Badge>
        <span className="text-xs text-muted-foreground">{businessDateTime(row.occurred_at)}</span>
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
        <dt className="text-muted-foreground">{t("columnActor")}</dt>
        <dd className="truncate text-card-foreground"><MemberName userId={row.acting_actor} resolver={memberNames} /></dd>
        <dt className="text-muted-foreground">{t("columnBasis")}</dt>
        <dd className="text-card-foreground">{row.rationale ?? t("noRationale")}</dd>
      </dl>
    </li>
  );
}
