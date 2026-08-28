"use client";

// The merge ceremony's own read-only comparison card — port-wave plan §5's
// note on merge_counterparties: "a preview panel showing exactly what both
// sides carry, read from the DB, before the dialog opens... the UI computes
// nothing about what the merge will do." Mobbin grounding T8: the ManyChat
// "named, separate preview step" pattern to copy, NOT folk's one-click
// merge (the anti-pattern named explicitly). This card is step (a); the
// destructive confirm lives in MergeCounterpartiesDialog, step (b) — two
// components, never collapsed into one, so a human can genuinely inspect
// before the destructive control is even reachable.
//
// Salesforce's per-field radio picker is REJECTED (Mobbin takeaway 2):
// merge_counterparties has no field-level reconciliation — a merge folds
// one party's records into another's, not a value-by-value union. This
// card shows both sides' held data with NO radios, NO picker — the human
// judges from what is shown, and the SURVIVOR/MERGED roles are already
// fixed by which side the caller passed as which (the hygiene panel's own
// picker, upstream of this card).

import { useTranslations } from "next-intl";
import { fmtCents } from "@/lib/registers/money";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { CounterpartyMergePreview, CounterpartyMergeSide } from "@/lib/registers/counterparty";

function SideColumn({ label, side, tc }: { label: string; side: CounterpartyMergeSide; tc: ReturnType<typeof useTranslations> }) {
  const t = useTranslations("ArApCounterparty.mergePreview");
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-2">
      <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{label}</p>
      <p className="truncate text-sm font-medium">{side.counterparty.name}</p>
      <dl className="flex flex-col gap-1 text-xs text-muted-foreground">
        <div className="flex justify-between gap-2">
          <dt>{t("registration")}</dt>
          <dd className="truncate">{side.counterparty.registration_no ?? "—"}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt>{t("tin")}</dt>
          <dd className="truncate">{side.counterparty.tin ?? "—"}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt>{t("terms")}</dt>
          <dd>{side.counterparty.payment_terms_days ?? "—"}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt>{t("outstanding")}</dt>
          <dd>{fmtCents(side.aging?.total_cents ?? null, tc("centsUnsafe"))}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt>{t("openItems")}</dt>
          <dd>{side.aging?.items.length ?? 0}</dd>
        </div>
      </dl>
      {side.aliases.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {side.aliases.map((a) => (
            <Badge key={a.id} variant="outline">
              {a.alias_display}
            </Badge>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function CounterpartyMergePreviewCard({ preview }: { preview: CounterpartyMergePreview }) {
  const t = useTranslations("ArApCounterparty.mergePreview");
  const tc = useTranslations("Common");

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">{t("consequence")}</p>
        <div className="flex flex-col gap-4 sm:flex-row">
          <SideColumn label={t("survivor")} side={preview.survivor} tc={tc} />
          <SideColumn label={t("merged")} side={preview.merged} tc={tc} />
        </div>
      </CardContent>
    </Card>
  );
}
