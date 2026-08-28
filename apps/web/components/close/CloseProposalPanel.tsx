"use client";

// "Clara proposes close" — the WORKBENCH half (port-wave-plan part2 §8.1:
// "three of the four [P6] parts have a workbench half in T1 (close_proposal,
// agent_receipt) … shipping the card before the workbench would mean a card
// whose 'open the full object' destination does not exist"). This panel
// reads the live `clara.close_proposals` row for the current close run
// (getRows — a real table read, p_cp_human: bookkeeper+, firm-scoped) and
// lets a human settle it (adopt/withdraw) through `settle_close_proposal`.
//
// What is STILL NOT BUILT here: the CARD — a proactive `close_proposal` typed
// part Clara raises unprompted in the chat rail. That is the P6 four-part
// wire bump's own scope (chatTurn_v15, apps/web/lib/parts/{types,catalog}.ts
// + PartRenderer.tsx) — recorded here as P6-owed, not fabricated as a
// NotBuiltNote, because the object this panel opens is real and live.

import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { useState } from "react";
import { useHydratedPart } from "@/lib/parts/hooks";
import { listCloseProposalsForRun, settleCloseProposal } from "@/lib/close/api";
import type { SessionTokenAccessor } from "@/lib/session";
import { EmptyState, LoadingState, StateBanner } from "@/components/common/state";
import { businessDateTime } from "@/lib/business-date";
import { SectionHeader } from "@/components/common/section-header";
import { CloseDoorDialog } from "./CloseDoorDialog";

export function CloseProposalPanel({
  closeRunId,
  session,
  reloadPlan,
}: {
  /** `null` when no close run exists yet for this fiscal year — close_proposals.
   *  close_run_id is NOT NULL, so no proposal can exist either; this panel
   *  skips the fetch rather than reading zero rows and calling it "empty". */
  closeRunId: string | null;
  session: SessionTokenAccessor;
  /** ClosePlanPanel's own plan (+ readiness + years) reload — called after
   *  every settle, success or refusal, same discipline as every other door
   *  on this page. */
  reloadPlan: () => Promise<void>;
}) {
  const t = useTranslations("ClientClose.proposal");
  const proposals = useHydratedPart(session, (s) => (closeRunId ? listCloseProposalsForRun(closeRunId, { session: s }) : Promise.resolve([])));
  const actAndReloadPlan = (fn: () => Promise<void>): Promise<void> => proposals.act(fn).then(() => reloadPlan());

  return (
    <section className="flex flex-col gap-2">
      <SectionHeader level={3}>{t("heading")}</SectionHeader>
      {closeRunId === null ? <EmptyState>{t("noRun")}</EmptyState> : null}
      {closeRunId !== null && proposals.loading && proposals.data === null ? <LoadingState>{t("loading")}</LoadingState> : null}
      {proposals.err ? (
        <StateBanner tone="error" code={proposals.clr ? `${proposals.clr.code}${proposals.clr.reason ? ` · ${proposals.clr.reason}` : ""}` : undefined}>
          {proposals.err}
        </StateBanner>
      ) : null}
      {closeRunId !== null && proposals.data && proposals.data.length === 0 ? <EmptyState>{t("empty")}</EmptyState> : null}
      {proposals.data?.map((p) => (
        <div key={p.id} className="enter-content flex flex-col gap-1.5 rounded-lg border border-border bg-card p-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={p.state === "open" ? "default" : p.state === "adopted" ? "secondary" : "outline"}>{p.state}</Badge>
            <span className="text-xs text-muted-foreground">{p.model_name} {p.model_version} · {businessDateTime(p.created_at)}</span>
          </div>
          <p className="text-card-foreground">{p.narrative}</p>
          <p className="text-xs text-muted-foreground">{p.rationale}</p>
          <span className="text-xs text-muted-foreground">{t("drafted", { count: p.drafted.length })}</span>
          {p.state === "open" ? (
            <div className="flex flex-wrap gap-2">
              <AdoptDialog busy={proposals.busy} onConfirm={() => actAndReloadPlan(async () => { await settleCloseProposal(p.id, "adopted", null, { session }); })} />
              <WithdrawDialog busy={proposals.busy} onConfirm={(reason) => actAndReloadPlan(async () => { await settleCloseProposal(p.id, "withdrawn", reason, { session }); })} />
            </div>
          ) : (
            <span className="text-xs text-muted-foreground">
              {t("settledBy")}: {p.settled_by} · {p.settled_at ? businessDateTime(p.settled_at) : ""} {p.settle_reason ? `· ${p.settle_reason}` : ""}
            </span>
          )}
        </div>
      ))}
    </section>
  );
}

function AdoptDialog({ busy, onConfirm }: { busy: boolean; onConfirm: () => Promise<void> }) {
  const t = useTranslations("ClientClose.proposal.adopt");
  return (
    <CloseDoorDialog triggerLabel={t("trigger")} title={t("title")} description={t("description")} confirmLabel={t("confirm")} busy={busy} onConfirm={onConfirm} />
  );
}

function WithdrawDialog({ busy, onConfirm }: { busy: boolean; onConfirm: (reason: string) => Promise<void> }) {
  const t = useTranslations("ClientClose.proposal.withdraw");
  const [reason, setReason] = useState("");
  return (
    <CloseDoorDialog
      triggerLabel={t("trigger")}
      triggerVariant="destructive"
      title={t("title")}
      description={t("description")}
      confirmLabel={t("confirm")}
      busy={busy}
      confirmDisabled={reason.trim().length === 0}
      onConfirm={() => onConfirm(reason)}
    >
      <Textarea aria-label={t("trigger")} placeholder={t("reasonPlaceholder")} value={reason} onChange={(e) => setReason(e.target.value)} />
    </CloseDoorDialog>
  );
}
