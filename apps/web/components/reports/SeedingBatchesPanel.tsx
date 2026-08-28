"use client";

// T9 (port-wave) — seeding batches + proposals (clara.seeding_batches /
// clara.seeding_proposals). PLAN-VS-CATALOG CONFLICT, reported (see the
// build's own report): the port-wave plan's §5 table lists a `seeding_
// proposal` needs-you row with tick/decline inline acts, but the LIVE
// clara.list_review_queue body (rung-0 census against the 0140 catalog) has
// exactly eight row_kind values — draft, uncoded_filing, open_question,
// coding_task, compliance_watch, lint_finding, fixed_asset_incomplete,
// staff_advance_incomplete — none of them `seeding_proposal`. Registering a
// ninth kind into lib/firm/needs-you.ts's closed world would fabricate a
// row the DB never emits (AGENTS.md's "the UI never invents a... link").
// This panel is the buildable substitute: a direct RLS read of the real
// tables, with the SAME tick/decline doors as door dialogs rather than
// needs-you inline acts — cancel/complete batch doors sit alongside them,
// since a batch is the object those doors govern.

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
  declineSeedingProposal,
  tickSeedingProposal,
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

  const reload = async () => {
    await Promise.all([batches.reload(), proposals.reload()]);
  };
  const act = async (fn: () => Promise<void>) => {
    await batches.act(fn);
    await proposals.reload();
  };

  return (
    <Card>
      <CardHeader>
        <SectionHeader level={2}>{t("heading")}</SectionHeader>
        <CardDescription className="text-xs">{t("subheading")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {batches.data && batches.err ? (
          <StateBanner tone="error" code={batches.clr ? `${batches.clr.code}${batches.clr.reason ? ` · ${batches.clr.reason}` : ""}` : undefined}>
            {batches.err}
          </StateBanner>
        ) : null}
        {!batches.data || !proposals.data ? (
          batches.err ? <StateBanner tone="error">{t("error", { message: batches.err })}</StateBanner> : <LoadingState>{t("loading")}</LoadingState>
        ) : batches.data.length === 0 ? (
          <EmptyState>{t("empty")}</EmptyState>
        ) : (
          <div className="flex flex-col gap-3">
            {batches.data.map((b) => (
              <BatchGroup
                key={b.id}
                batch={b}
                proposals={proposalsByBatch.get(b.id) ?? []}
                busy={batches.busy || proposals.busy}
                actBatch={act}
                reload={reload}
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
  reload,
}: {
  batch: SeedingBatchRow;
  proposals: SeedingProposalRow[];
  busy: boolean;
  actBatch: (fn: () => Promise<void>) => Promise<void>;
  reload: () => Promise<void>;
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
            <ProposalRow key={p.id} proposal={p} batchOpen={batch.state === "open"} busy={busy} reload={reload} />
          ))}
        </ul>
      )}
    </div>
  );
}

function CancelBatchDialog({ batchId, busy, act }: { batchId: string; busy: boolean; act: (fn: () => Promise<void>) => Promise<void> }) {
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

function CompleteBatchDialog({ batchId, busy, act }: { batchId: string; busy: boolean; act: (fn: () => Promise<void>) => Promise<void> }) {
  const t = useTranslations("ReportsSnapshotsSeeding.seeding.completeBatch");
  return (
    <DoorDialog
      triggerLabel={t("trigger")} title={t("title")} description={t("description")} confirmLabel={t("confirm")} busy={busy}
      onConfirm={() => act(async () => { await completeSeedingBatch(batchId); })}
    />
  );
}

function ProposalRow({
  proposal,
  batchOpen,
  busy,
  reload,
}: {
  proposal: SeedingProposalRow;
  batchOpen: boolean;
  busy: boolean;
  reload: () => Promise<void>;
}) {
  const [err, setErr] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  const run = (fn: () => Promise<void>) => async () => {
    setWorking(true);
    setErr(null);
    try {
      await fn();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setWorking(false);
      await reload();
    }
  };

  return (
    <li className="flex flex-col gap-1 rounded-md border border-border/60 p-2">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={PROPOSAL_VARIANT[proposal.state]}>{proposal.state}</Badge>
        <span className="font-mono text-xs text-card-foreground">{proposal.proposal_kind}</span>
      </div>
      <p className="text-xs text-muted-foreground wrap-anywhere">{JSON.stringify(proposal.payload)}</p>
      {err ? <StateBanner tone="error">{err}</StateBanner> : null}
      {batchOpen && proposal.state === "proposed" ? (
        <div className="flex flex-wrap gap-2">
          <TickDialog proposalId={proposal.id} busy={busy || working} run={run} />
          <DeclineDialog proposalId={proposal.id} busy={busy || working} run={run} />
        </div>
      ) : null}
    </li>
  );
}

function TickDialog({ proposalId, busy, run }: { proposalId: string; busy: boolean; run: (fn: () => Promise<void>) => () => Promise<void> }) {
  const t = useTranslations("ReportsSnapshotsSeeding.seeding.tick");
  return (
    <DoorDialog
      triggerLabel={t("trigger")} title={t("title")} description={t("description")} confirmLabel={t("confirm")} busy={busy}
      onConfirm={run(async () => { await tickSeedingProposal(proposalId); })}
    />
  );
}

function DeclineDialog({ proposalId, busy, run }: { proposalId: string; busy: boolean; run: (fn: () => Promise<void>) => () => Promise<void> }) {
  const t = useTranslations("ReportsSnapshotsSeeding.seeding.decline");
  const [reason, setReason] = useState("");
  return (
    <DoorDialog
      triggerLabel={t("trigger")} title={t("title")} confirmLabel={t("confirm")} busy={busy}
      confirmDisabled={reason.trim().length === 0}
      onConfirm={run(async () => { await declineSeedingProposal({ proposalId, reason }); })}
    >
      <Input aria-label={t("reasonPlaceholder")} placeholder={t("reasonPlaceholder")} value={reason} onChange={(e) => setReason(e.target.value)} />
    </DoorDialog>
  );
}
