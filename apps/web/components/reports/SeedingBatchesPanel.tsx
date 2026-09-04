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

  // Batch-scoped acts (cancel/complete) reload proposals too — a completed
  // batch's stats are DERIVED from proposal state, so the two reads travel
  // together even though a batch act writes no proposal row of its own.
  const actBatch = async (fn: () => Promise<void>): Promise<boolean> => {
    // CB-AE2E-004: the batch WRITE's own outcome is what the dialogs read.
    const ok = await batches.act(fn);
    await proposals.reload();
    return ok;
  };
  // F5 (independent review): proposal-scoped acts (tick/decline) ride
  // proposals' OWN act()-and-reload cycle (part2 §7.1(2)) directly — never a
  // hand-rolled err state that drops the CLR code, which is what ProposalRow
  // did before this fix.
  const actProposal = proposals.act;

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
                actProposal={actProposal}
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
  actProposal,
}: {
  batch: SeedingBatchRow;
  proposals: SeedingProposalRow[];
  busy: boolean;
  actBatch: (fn: () => Promise<void>) => Promise<boolean>;
  actProposal: (fn: () => Promise<void>) => Promise<boolean>;
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
            <ProposalRow key={p.id} proposal={p} batchOpen={batch.state === "open"} busy={busy} act={actProposal} />
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

function ProposalRow({
  proposal,
  batchOpen,
  busy,
  act,
}: {
  proposal: SeedingProposalRow;
  batchOpen: boolean;
  busy: boolean;
  // F5 (independent review): the SAME useHydratedPart act()-and-reload shape
  // every sibling door in this file already uses — a refusal's CLR code +
  // reason now surfaces through the panel's own top banner (loadErr/loadClr
  // above), never a hand-rolled local err that drops the code.
  act: (fn: () => Promise<void>) => Promise<boolean>;
}) {
  return (
    <li className="flex flex-col gap-1 rounded-md border border-border/60 p-2">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={PROPOSAL_VARIANT[proposal.state]}>{proposal.state}</Badge>
        <span className="font-mono text-xs text-card-foreground">{proposal.proposal_kind}</span>
      </div>
      <p className="text-xs text-muted-foreground wrap-anywhere">{JSON.stringify(proposal.payload)}</p>
      {batchOpen && proposal.state === "proposed" ? (
        <div className="flex flex-wrap gap-2">
          <TickDialog proposalId={proposal.id} busy={busy} act={act} />
          <DeclineDialog proposalId={proposal.id} busy={busy} act={act} />
        </div>
      ) : null}
    </li>
  );
}

function TickDialog({ proposalId, busy, act }: { proposalId: string; busy: boolean; act: (fn: () => Promise<void>) => Promise<boolean> }) {
  const t = useTranslations("ReportsSnapshotsSeeding.seeding.tick");
  return (
    <DoorDialog
      triggerLabel={t("trigger")} title={t("title")} description={t("description")} confirmLabel={t("confirm")} busy={busy}
      onConfirm={() => act(async () => { await tickSeedingProposal(proposalId); })}
    />
  );
}

function DeclineDialog({ proposalId, busy, act }: { proposalId: string; busy: boolean; act: (fn: () => Promise<void>) => Promise<boolean> }) {
  const t = useTranslations("ReportsSnapshotsSeeding.seeding.decline");
  const [reason, setReason] = useState("");
  return (
    <DoorDialog
      triggerLabel={t("trigger")} title={t("title")} confirmLabel={t("confirm")} busy={busy}
      confirmDisabled={reason.trim().length === 0}
      onConfirm={() => act(async () => { await declineSeedingProposal({ proposalId, reason }); })}
    >
      <Input aria-label={t("reasonPlaceholder")} placeholder={t("reasonPlaceholder")} value={reason} onChange={(e) => setReason(e.target.value)} />
    </DoorDialog>
  );
}
