"use client";

// T9 (port-wave) — the month-snapshot registry (clara.period_snapshots).
// clara.mint_month_snapshot has NO "already snapshotted" refusal (rung-0
// finding — the live body carries no uniqueness check on client+period+kind);
// a second mint for the same month is a legitimate re-snapshot, not an error
// this UI invents a restriction against. Each row's own current/stale state
// comes from clara.snapshot_state — a read-flavoured RPC, called per row, not
// a governed act (no busy/act wiring for it).

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { SectionHeader } from "@/components/common/section-header";
import { EmptyState, LoadingState, StateBanner } from "@/components/common/state";
import { DoorDialog } from "./DoorDialog";
import { useHydratedPart } from "@/lib/parts/hooks";
import { listPeriodSnapshots, mintMonthSnapshot, snapshotState, isDoorRefusal } from "@/lib/reports/api";
import { businessDateTime, businessToday } from "@/lib/business-date";
import type { SessionTokenAccessor } from "@/lib/session";

export function SnapshotRegistryPanel({ clientId, session }: { clientId: string; session: SessionTokenAccessor }) {
  const t = useTranslations("ReportsSnapshotsSeeding.snapshots");
  const { data: snapshots, busy, err, clr, act } = useHydratedPart(session, (s) => listPeriodSnapshots(clientId, { session: s }));

  return (
    <Card>
      <CardHeader>
        <SectionHeader level={2} action={<MintDialog clientId={clientId} busy={busy} act={act} />}>
          {t("heading")}
        </SectionHeader>
        <CardDescription className="text-xs">{t("subheading")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {snapshots && err ? (
          <StateBanner tone="error" code={clr ? `${clr.code}${clr.reason ? ` · ${clr.reason}` : ""}` : undefined}>
            {err}
          </StateBanner>
        ) : null}
        {!snapshots ? (
          err ? <StateBanner tone="error">{t("error", { message: err })}</StateBanner> : <LoadingState>{t("loading")}</LoadingState>
        ) : snapshots.length === 0 ? (
          <EmptyState>{t("empty")}</EmptyState>
        ) : (
          <div className="flex flex-col gap-2">
            {snapshots.map((s) => (
              <SnapshotRow key={s.id} snapshot={s} session={session} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SnapshotRow({ snapshot, session }: { snapshot: { id: string; period_start: string; period_end: string; minted_at: string; books_watermark: string; dataset_sha256: string }; session: SessionTokenAccessor }) {
  const t = useTranslations("ReportsSnapshotsSeeding.snapshots");
  const [state, setState] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // ./api.ts's snapshotState — a read, not a governed act; fetched lazily per
  // row so a registry with many snapshots does not fire N live-state RPCs on
  // first paint before a human asks for one.
  const check = async () => {
    setLoading(true);
    setError(null);
    try {
      setState(await snapshotState(snapshot.id, { session }));
    } catch (e) {
      setError(isDoorRefusal(e) ? e.message : e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="enter-content flex flex-col gap-2 rounded-lg border border-border bg-card p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium text-card-foreground">{snapshot.period_start} .. {snapshot.period_end}</span>
        {state ? <Badge variant={state === "current" ? "default" : state === "stale" ? "destructive" : "outline"}>{state}</Badge> : null}
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <dt>{t("mintedLabel")}</dt>
        <dd>{businessDateTime(snapshot.minted_at)}</dd>
        <dt>{t("watermarkLabel")}</dt>
        <dd className="font-mono">{snapshot.books_watermark}</dd>
        <dt>{t("shaLabel")}</dt>
        <dd className="truncate font-mono">{snapshot.dataset_sha256}</dd>
      </dl>
      {error ? <StateBanner tone="error">{error}</StateBanner> : null}
      {!state ? (
        <button
          type="button"
          className="self-start text-xs text-primary underline-offset-4 hover:underline disabled:opacity-50"
          disabled={loading}
          onClick={check}
        >
          {loading ? t("checkingState") : t("checkState")}
        </button>
      ) : null}
    </div>
  );
}

function MintDialog({ clientId, busy, act }: { clientId: string; busy: boolean; act: (fn: () => Promise<void>) => Promise<void> }) {
  const t = useTranslations("ReportsSnapshotsSeeding.snapshots.mint");
  const [monthStart, setMonthStart] = useState(() => `${businessToday().slice(0, 7)}-01`);
  // RULING F9 (independent review): one op_key PER DIALOG OPEN, not per call
  // — see lib/reports/api.ts's mintMonthSnapshot header for the full
  // reasoning. Minted once on mount as a safe default (matches the trigger's
  // first render, before any open has happened) and RE-minted every time the
  // dialog actually opens, via DoorDialog's onOpenChange.
  const [opKey, setOpKey] = useState(() => crypto.randomUUID());
  return (
    <DoorDialog
      triggerLabel={t("trigger")}
      title={t("title")}
      description={t("description")}
      confirmLabel={t("confirm")}
      busy={busy}
      confirmDisabled={monthStart.trim().length === 0}
      onConfirm={() => act(async () => { await mintMonthSnapshot({ clientId, monthStart, opKey }); })}
      onOpenChange={(isOpen) => { if (isOpen) setOpKey(crypto.randomUUID()); }}
    >
      <div className="flex flex-col gap-2">
        <Input aria-label={t("monthPlaceholder")} type="date" value={monthStart} onChange={(e) => setMonthStart(e.target.value)} />
        <p className="text-xs text-muted-foreground">{t("monthHint")}</p>
      </div>
    </DoorDialog>
  );
}
