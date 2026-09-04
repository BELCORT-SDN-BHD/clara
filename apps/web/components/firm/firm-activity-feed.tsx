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
// N10: receipt_kind is the closed registry clara.agent_receipt_surfaces —
// translated via a checked lookup with an honest raw-value fallback for anything
// outside it. **TRUED, E-2 / CB-AE2E-018:** that citation used to read
// "(0103:294-301)" and the map held SEVEN kinds, but the register has been
// appended to twice since — `onboarding_agent` (0142:314-315) and
// `binding_agent` (0154:1067-1068) — so the raw-value fallback had become the
// DEFAULT path for two LIVE kinds. The roster now lives in
// lib/firm/receipt-kinds.ts and is PINNED against the register parsed out of the
// migrations, so a tenth kind reds a test instead of printing a snake_case token
// to a professional. That module's header also carries the wired-vs-stub census
// behind `coverageNote` below.
// N11: occurred_at renders in the business timezone explicitly
// (lib/business-date.ts) — an audit trail read by people in different timezones
// must show the SAME moment, not each viewer's own.
// FIX-5: loadFirmActivity reads a flat limit=100, unpaginated — stated honestly
// rather than implying completeness.
//
// P2 · object-object-and-raw-json (the verified sweep, 2026-09-04): the Actor
// cell rendered `acting_actor` RAW, a full uuid, as the answer to "who did
// this". It is now the house `shortId(...)` in a `font-mono` span. A real
// display name is NOT invented here: `lib/members/use-member-names.ts` (lane L7)
// is the resolver that would supply one and is not on `main` at the time of
// writing, so this lane takes the short id and leaves the upgrade to a
// one-import change rather than guessing a name.
//
// THE REACT KEY IS THE PAIR, NOT THE ID. `agent_receipts_visible` is a UNION of
// nine per-item shims, and `clara.agent_receipt_contract` ordinal 2 (0103:260)
// defines `receipt_id` as "the member row's own primary key rendered as text
// (member PKs are uuid on some tables, bigint on others)". A bigint primary key
// is unique inside ITS table and nowhere else, so two members can legitimately
// collide on `receipt_id` alone — which is exactly why lib/firm/reads.ts's own
// `getAgentReceipt` addresses a row by the PAIR. The list key now does the same.

import { useTranslations } from "next-intl";
import Link from "next/link";
import { useAsyncRead } from "@/lib/firm/use-async-read";
import { loadFirmActivity, type AgentReceiptRow } from "@/lib/firm/reads";
import { isKnownAgentReceiptKind } from "@/lib/firm/receipt-kinds";
import { businessDateTime } from "@/lib/business-date";
import { shortId } from "@/lib/registers/money";
import { sessionTokenAccessor } from "@/lib/session-accessor";
import { DataState } from "./data-state";
import { Badge } from "@/components/parts/PartBadge";

export function FirmActivityFeed() {
  const t = useTranslations("FirmActivity");
  const { data, loading, error } = useAsyncRead(() => loadFirmActivity(sessionTokenAccessor));
  const rows = data ?? [];

  return (
    // `subheading` moved up into the page header (app/(firm)/activity/page.tsx)
    // — the one place every surface puts its orientation line. The two
    // remaining notes are caveats about THIS read (the role floor, the flat
    // limit), which belong beside the data they qualify.
    <div className="flex flex-col gap-2">
      <p className="max-w-prose text-xs text-muted-foreground">{t("visibilityNote")}</p>
      {/* WHAT THIS FEED CAN ACTUALLY SHOW. Five of the union's nine arms are
          still typed-empty stubs, so posting an entry or a bank-agent act
          produces no row here at all — see lib/firm/receipt-kinds.ts's census.
          The page's own subheading promises "what the agent did across every
          client"; this line is what keeps that promise honest. */}
      <p className="max-w-prose text-xs text-muted-foreground">{t("coverageNote")}</p>
      <DataState loading={loading} error={error} isEmpty={rows.length === 0} emptyMessage={t("emptyMessage")}>
        <p className="max-w-prose text-xs text-muted-foreground">{t("showingRecent")}</p>
        <ul className="mt-2 flex flex-col gap-2">
          {rows.map((row) => (
            <ReceiptRow key={`${row.receipt_kind}:${row.receipt_id}`} row={row} />
          ))}
        </ul>
      </DataState>
    </div>
  );
}

function ReceiptRow({ row }: { row: AgentReceiptRow }) {
  const t = useTranslations("FirmActivity");
  // A checked lookup, not a cast (FIX-1's exact discipline): only a KNOWN
  // receipt_kind ever reaches t() with a literal, statically-valid key — an
  // unrecognised value renders its own raw text, honest and never a key path.
  // The closed world is lib/firm/receipt-kinds.ts's AGENT_RECEIPT_KINDS, which
  // is pinned against the register's own rows rather than typed here.
  const kindLabel = isKnownAgentReceiptKind(row.receipt_kind)
    ? t(`receiptKinds.${row.receipt_kind}`)
    : row.receipt_kind;
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
        {/* P2 fix: a short id in `font-mono`, never a raw uuid — and never a
            display name this module inferred. See the header. */}
        <dd className="font-mono text-card-foreground">{shortId(row.acting_actor)}</dd>
        <dt className="text-muted-foreground">{t("columnBasis")}</dt>
        <dd className="text-card-foreground">{row.rationale ?? t("noRationale")}</dd>
      </dl>
    </li>
  );
}
