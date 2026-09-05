"use client";

// The real Journals tab (replaces the P2 placeholder at
// app/(firm)/clients/[clientId]/journals/page.tsx). Owns the ONE combined
// hydration (lib/journals/use-journals-workbench.ts) for the whole tab; every
// child panel below is purely presentational over the data/actions this
// component hands down — no panel fetches on its own.

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useJournalsWorkbench } from "@/lib/journals/use-journals-workbench";
import { PageHeader, PageShell } from "@/components/common/page-shell";
import { SectionTabs } from "@/components/common/section-tabs";
import { LoadingState, StateBanner, type BannerTone } from "@/components/common/state";
import { Button } from "@/components/ui/button";
import { DraftsQueuePanel } from "@/components/journals/drafts-queue-panel";
import { PostedPanel } from "@/components/journals/posted-panel";
import { ComposeDialog } from "@/components/journals/compose-dialog";
import { InterruptionsPanel } from "@/components/journals/interruptions-panel";
import { JournalStatusLegend } from "@/components/journals/status-legend";

type Tab = "drafts" | "posted" | "clarifications";

export function JournalsWorkbench({ clientId }: { clientId: string }) {
  const t = useTranslations("JournalsWorkbench");
  const workbench = useJournalsWorkbench(clientId);
  const [tab, setTab] = useState<Tab>("drafts");
  const [composeOpen, setComposeOpen] = useState(false);

  // --- honest, distinct states — no state below fabricates a number or hides
  // a real failure behind a generic message (mission's mechanism rules).
  // N5 (independent review): every read-failure branch below gets the SAME
  // retry affordance the generic branch already had — a distinct MESSAGE is
  // not a reason to withhold the one recovery action that might actually work
  // (a session that was momentarily stale, a grant that just landed). ---

  // P3 polish, structure: every state below now renders INSIDE the page shell
  // and keeps the page's own title. Before this pass a read failure or the
  // loading instant replaced the whole surface, so Journals was the one tab
  // whose <h1> could vanish — a professional loses their place in the IA
  // exactly when something has gone wrong. The BRANCHES themselves, and N5's
  // rule that every failure kind keeps the same retry affordance, are
  // untouched; only the frame around them and the tone mapping changed
  // (no_session is a state, not a fault — components/common/state.tsx).
  const failure = readFailure(workbench.readErrorKind, workbench.err, workbench.data, t);
  if (failure) {
    return (
      <PageShell>
        <PageHeader title={t("heading")} />
        <StateBanner
          tone={failure.tone}
          action={
            <Button type="button" variant="outline" size="sm" onClick={() => void workbench.reload()}>
              {t("retry")}
            </Button>
          }
        >
          {failure.message}
        </StateBanner>
      </PageShell>
    );
  }
  if (!workbench.data) {
    // Loading, or the pre-mount instant with no error yet either.
    return (
      <PageShell>
        <PageHeader title={t("heading")} />
        <LoadingState>{t("loading")}</LoadingState>
      </PageShell>
    );
  }

  const data = workbench.data;

  return (
    <PageShell>
      <PageHeader
        title={t("heading")}
        action={
          <ComposeDialog
            open={composeOpen}
            onOpenChange={setComposeOpen}
            accounts={data.accounts}
            busy={workbench.busy}
            err={workbench.err}
            clr={workbench.clr}
            actingId={workbench.actingId}
            onSubmit={(input) => void workbench.compose(input, () => setComposeOpen(false))}
          />
        }
      />
      <SectionTabs
        label={t("heading")}
        items={[
          { value: "drafts" as const, label: t("tabs.drafts") },
          { value: "posted" as const, label: t("tabs.posted") },
          { value: "clarifications" as const, label: t("tabs.clarifications", { count: data.interruptions.length }) },
        ]}
        value={tab}
        onSelect={setTab}
      />
      {/* CB-AE2E-021 (D): the state legend sits under the tab strip rather
          than inside one panel — the "Posted"/"Approved" confusion it settles
          spans the drafts tab and the posted tab equally, and a legend that
          only appears on one of them explains the split from inside it. */}
      <JournalStatusLegend />
      {tab === "drafts" && (
        <DraftsQueuePanel
          clientId={clientId}
          queueRows={data.queueRows}
          queueCounts={data.queueCounts}
          entries={data.entries}
          lines={data.lines}
          linesTruncated={data.linesTruncated}
          accounts={data.accounts}
          busy={workbench.busy}
          err={workbench.err}
          clr={workbench.clr}
          actingId={workbench.actingId}
          onApprove={(id, rev, attestation) => void workbench.approve(id, rev, attestation)}
          onRevise={(id, lines, rev, onOk) => void workbench.revise(id, lines, rev, onOk)}
          onApproveRoutine={(id, rev) => void workbench.approveRoutine(id, rev)}
          onWithdraw={(id, reason, rev, onOk) => workbench.withdraw(id, reason, rev, onOk)}
        />
      )}
      {tab === "clarifications" && (
        <InterruptionsPanel
          interruptions={data.interruptions}
          busy={workbench.busy}
          err={workbench.err}
          clr={workbench.clr}
          actingId={workbench.actingId}
          onAnswer={(id, answer, onOk) => void workbench.answerClarify(id, answer, onOk)}
          clientIdByTaskId={data.clientIdByTaskId}
          onPromote={(id, scopeId) => workbench.promoteClarify(id, scopeId)}
        />
      )}
      {tab === "posted" && (
        <PostedPanel
          clientId={clientId}
          entries={data.entries}
          lines={data.lines}
          linesTruncated={data.linesTruncated}
          entriesTruncated={data.entriesTruncated}
          accounts={data.accounts}
          busy={workbench.busy}
          err={workbench.err}
          clr={workbench.clr}
          actingId={workbench.actingId}
          onReverse={(id, reason, onOk) => void workbench.reverse(id, reason, onOk)}
        />
      )}
    </PageShell>
  );
}

/**
 * The read-failure branch table, extracted so the render body reads as one
 * decision rather than five near-identical early returns. Same kinds, same
 * order, same messages — the only change is the TONE each one carries, which
 * now follows the product-wide ladder in components/common/state.tsx:
 * `no_session` is a state (info), everything else here is a genuine failure
 * (error). N4's distinction between `unauthenticated` (the session itself is
 * rejected — sign in again) and `forbidden` (a missing grant) is preserved
 * verbatim, because they are two different fixes.
 */
function readFailure(
  kind: string | null,
  err: string | null,
  data: unknown,
  t: (key: string, values?: Record<string, string>) => string,
): { tone: BannerTone; message: string } | null {
  if (kind === "no_session") return { tone: "info", message: t("noSession") };
  if (kind === "unauthenticated") return { tone: "error", message: t("unauthenticated") };
  if (kind === "forbidden") return { tone: "warning", message: t("forbidden") };
  if (kind === "not_found") return { tone: "neutral", message: t("notFound") };
  if (err && !data) return { tone: "error", message: t("loadError", { message: err }) };
  return null;
}
