"use client";

// T9 (port-wave) — seeding batches + proposals (clara.seeding_batches /
// clara.seeding_proposals), READ-ONLY SINCE #1012.
//
// #1012 (0288_seeding_lane_retired.sql; owner ruling 2026-09-20 on #983): the prior-GL seeding
// lane is RETIRED. `clara.create_seeding_batch`, `clara.tick_seeding_proposal` and
// `clara.decline_seeding_proposal` answer one typed refusal, because the product direction is
// the Client KB — nobody pre-registers by hand what Clara can learn from a source. So this
// panel offers no Tick and no Decline: a control whose only possible outcome is a refusal is
// worse than no control, and the beta rule is that nothing is switched off silently, which is
// why the retirement notice is rendered rather than the controls simply vanishing.
//
// WHAT THE PANEL STILL IS. Every past batch and proposal stays on screen, read straight off the
// real tables under RLS, with its state, its kind and its payload — the retirement deletes
// nothing. The two CLOSERS survive as door dialogs: a batch left open at the moment of
// retirement must still be cancellable or completable by the firm that owns it, or its history
// would be stranded open forever. The `seeding_proposal` needs-you row that used to bridge into
// this panel is gone with the row kind itself (0288 §C), so this tab is the only surface the
// lane has left, and it asks nobody for anything.

import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { SectionHeader } from "@/components/common/section-header";
import { EmptyState, LoadingState, StateBanner } from "@/components/common/state";
import { DoorDialog } from "./DoorDialog";
import { useHydratedPart } from "@/lib/parts/hooks";
import {
  listSeedingBatches,
  listSeedingProposals,
  cancelSeedingBatch,
  completeSeedingBatch,
} from "@/lib/reports/api";
import { businessDateTime } from "@/lib/business-date";
import type { SeedingBatchRow, SeedingBatchState, SeedingProposalRow, SeedingProposalState } from "@/lib/reports/types";
import type { SessionTokenAccessor } from "@/lib/session";
import { useState } from "react";

const BATCH_VARIANT: Record<SeedingBatchState, "default" | "destructive" | "outline" | "secondary"> = {
  open: "outline",
  completed: "default",
  cancelled: "destructive",
};

const PROPOSAL_VARIANT: Record<SeedingProposalState, "default" | "destructive" | "outline" | "secondary"> = {
  proposed: "outline",
  ticked: "default",
  declined: "destructive",
  refused: "destructive",
};

export function SeedingBatchesPanel({ clientId, session }: { clientId: string; session: SessionTokenAccessor }) {
  const t = useTranslations("ReportsSnapshotsSeeding.seeding");
  const batches = useHydratedPart(session, (s) => listSeedingBatches(clientId, { session: s }));
  const proposals = useHydratedPart(session, (s) => listSeedingProposals(clientId, { session: s }));

  const proposalsByBatch = new Map<string, SeedingProposalRow[]>();
  for (const p of proposals.data ?? []) {
    const list = proposalsByBatch.get(p.batch_id) ?? [];
    list.push(p);
    proposalsByBatch.set(p.batch_id, list);
  }

  // Batch-scoped acts (cancel/complete) reload proposals too — a completed
  // batch's stats are DERIVED from proposal state, so the two reads travel
  // together even though a batch act writes no proposal row of its own.
  const actBatch = async (fn: () => Promise<void>): Promise<boolean> => {
    // CB-AE2E-004: the batch WRITE's own outcome is what the dialogs read.
    const ok = await batches.act(fn);
    await proposals.reload();
    return ok;
  };
  // #1012: there is no proposal-scoped act any more. The tick/decline pair was the only one,
  // and both doors are retired, so `proposals` is a pure read here.

  // F1 (independent review, HIGH): the loading/error gate below used to
  // consult ONLY batches.err — a proposals-only failure (e.g. a 401 on that
  // one read while batches loaded fine) rendered as a PERMANENT spinner,
  // since !proposals.data stayed true forever with no err ever surfacing.
  // Both hooks' err/clr are consulted now, whichever is set.
  const loadErr = batches.err ?? proposals.err;
  const loadClr = batches.err ? batches.clr : proposals.clr;
  const dataReady = batches.data && proposals.data;

  return (
    <Card>
      <CardHeader>
        <SectionHeader level={2}>{t("heading")}</SectionHeader>
        <CardDescription className="text-xs">{t("subheading")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <StateBanner tone="info">{t("retiredNotice")}</StateBanner>
        {dataReady && loadErr ? (
          <StateBanner tone="error" code={loadClr ? `${loadClr.code}${loadClr.reason ? ` · ${loadClr.reason}` : ""}` : undefined}>
            {loadErr}
          </StateBanner>
        ) : null}
        {!dataReady ? (
          loadErr ? <StateBanner tone="error">{t("error", { message: loadErr })}</StateBanner> : <LoadingState>{t("loading")}</LoadingState>
        ) : batches.data!.length === 0 ? (
          <EmptyState>{t("empty")}</EmptyState>
        ) : (
          <div className="flex flex-col gap-3">
            {batches.data!.map((b) => (
              <BatchGroup
                key={b.id}
                batch={b}
                proposals={proposalsByBatch.get(b.id) ?? []}
                busy={batches.busy || proposals.busy}
                actBatch={actBatch}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function BatchGroup({
  batch,
  proposals,
  busy,
  actBatch,
}: {
  batch: SeedingBatchRow;
  proposals: SeedingProposalRow[];
  busy: boolean;
  actBatch: (fn: () => Promise<void>) => Promise<boolean>;
}) {
  const t = useTranslations("ReportsSnapshotsSeeding.seeding");
  const openCount = proposals.filter((p) => p.state === "proposed").length;

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={BATCH_VARIANT[batch.state]}>{batch.state}</Badge>
        <span className="text-xs text-muted-foreground">{businessDateTime(batch.created_at)}</span>
        <span className="text-xs text-muted-foreground">{t("openCount", { count: openCount })}</span>
      </div>
      {batch.state === "open" ? (
        <div className="flex flex-wrap gap-2">
          <CancelBatchDialog batchId={batch.id} busy={busy} act={actBatch} />
          <CompleteBatchDialog batchId={batch.id} busy={busy} act={actBatch} />
        </div>
      ) : batch.cancel_reason ? (
        <p className="text-xs text-muted-foreground">{t("cancelReasonLabel")}: {batch.cancel_reason}</p>
      ) : null}
      {proposals.length === 0 ? (
        <EmptyState className="text-xs">{t("noProposals")}</EmptyState>
      ) : (
        <ul className="flex flex-col gap-2">
          {proposals.map((p) => (
            <ProposalRow key={p.id} proposal={p} />
          ))}
        </ul>
      )}
    </div>
  );
}

function CancelBatchDialog({ batchId, busy, act }: { batchId: string; busy: boolean; act: (fn: () => Promise<void>) => Promise<boolean> }) {
  const t = useTranslations("ReportsSnapshotsSeeding.seeding.cancelBatch");
  const [reason, setReason] = useState("");
  return (
    <DoorDialog
      triggerLabel={t("trigger")} title={t("title")} confirmLabel={t("confirm")} busy={busy}
      confirmDisabled={reason.trim().length === 0}
      onConfirm={() => act(async () => { await cancelSeedingBatch({ batchId, reason }); })}
    >
      <Input aria-label={t("reasonPlaceholder")} placeholder={t("reasonPlaceholder")} value={reason} onChange={(e) => setReason(e.target.value)} />
    </DoorDialog>
  );
}

function CompleteBatchDialog({ batchId, busy, act }: { batchId: string; busy: boolean; act: (fn: () => Promise<void>) => Promise<boolean> }) {
  const t = useTranslations("ReportsSnapshotsSeeding.seeding.completeBatch");
  return (
    <DoorDialog
      triggerLabel={t("trigger")} title={t("title")} description={t("description")} confirmLabel={t("confirm")} busy={busy}
      onConfirm={() => act(async () => { await completeSeedingBatch(batchId); })}
    />
  );
}

function ProposalRow({ proposal }: { proposal: SeedingProposalRow }) {
  // #1012: READ-ONLY. This row used to carry Tick and Decline whenever its batch was open and
  // its own state was 'proposed'; both doors are retired, so the row renders what the proposal
  // says and nothing a person can press. The state badge still distinguishes a proposal that
  // was ticked, declined or refused before the retirement from one left open.
  return (
    <li className="flex flex-col gap-1 rounded-md border border-border/60 p-2">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={PROPOSAL_VARIANT[proposal.state]}>{proposal.state}</Badge>
        <span className="font-mono text-xs text-card-foreground">{proposal.proposal_kind}</span>
      </div>
      <p className="text-xs text-muted-foreground wrap-anywhere">{JSON.stringify(proposal.payload)}</p>
    </li>
  );
}
