"use client";

// The real Journals tab (replaces the P2 placeholder at
// app/(firm)/clients/[clientId]/journals/page.tsx). Owns the ONE combined
// hydration (lib/journals/use-journals-workbench.ts) for the whole tab; every
// child panel below is purely presentational over the data/actions this
// component hands down — no panel fetches on its own.

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useJournalsWorkbench } from "@/lib/journals/use-journals-workbench";
import { DraftsQueuePanel } from "@/components/journals/drafts-queue-panel";
import { PostedPanel } from "@/components/journals/posted-panel";
import { ComposeDialog } from "@/components/journals/compose-dialog";

type Tab = "drafts" | "posted";

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

  if (workbench.readErrorKind === "no_session") {
    return <ReadFailure tone="warning" message={t("noSession")} onRetry={() => void workbench.reload()} retryLabel={t("retry")} />;
  }
  if (workbench.readErrorKind === "unauthenticated") {
    // N4: distinct from "forbidden" — a 401 means the SESSION itself is
    // rejected (expired/invalid JWT), never a governed refusal (wire.ts's own
    // "spelling is not identity" ordering: status is checked before any CLR
    // parsing) — the fix is signing in again, not asking for a grant.
    return <ReadFailure tone="destructive" message={t("unauthenticated")} onRetry={() => void workbench.reload()} retryLabel={t("retry")} />;
  }
  if (workbench.readErrorKind === "forbidden") {
    return <ReadFailure tone="destructive" message={t("forbidden")} onRetry={() => void workbench.reload()} retryLabel={t("retry")} />;
  }
  if (workbench.readErrorKind === "not_found") {
    return <ReadFailure tone="destructive" message={t("notFound")} onRetry={() => void workbench.reload()} retryLabel={t("retry")} />;
  }
  if (workbench.err && !workbench.data) {
    return (
      <ReadFailure tone="destructive" message={t("loadError", { message: workbench.err })} onRetry={() => void workbench.reload()} retryLabel={t("retry")} />
    );
  }
  if (!workbench.data) {
    // Loading, or the pre-mount instant with no error yet either.
    return <p className="p-8 text-sm text-muted-foreground">{t("loading")}</p>;
  }

  const data = workbench.data;

  return (
    <main className="flex flex-col gap-4 p-8">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl font-semibold text-foreground">{t("heading")}</h1>
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
      </div>
      <div className="flex gap-1 border-b border-border">
        <TabButton active={tab === "drafts"} onClick={() => setTab("drafts")} label={t("tabs.drafts")} />
        <TabButton active={tab === "posted"} onClick={() => setTab("posted")} label={t("tabs.posted")} />
      </div>
      {tab === "drafts" && (
        <DraftsQueuePanel
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
        />
      )}
      {tab === "posted" && (
        <PostedPanel
          entries={data.entries}
          lines={data.lines}
          linesTruncated={data.linesTruncated}
          busy={workbench.busy}
          err={workbench.err}
          clr={workbench.clr}
          actingId={workbench.actingId}
          onReverse={(id, reason, onOk) => void workbench.reverse(id, reason, onOk)}
        />
      )}
    </main>
  );
}

function ReadFailure({
  tone,
  message,
  onRetry,
  retryLabel,
}: {
  tone: "warning" | "destructive";
  message: string;
  onRetry: () => void;
  retryLabel: string;
}) {
  return (
    <div className="flex flex-col items-start gap-2 p-8">
      <p className={tone === "warning" ? "text-sm text-warning" : "text-sm text-destructive"}>{message}</p>
      <button type="button" className="text-sm text-primary underline" onClick={onRetry}>
        {retryLabel}
      </button>
    </div>
  );
}

function TabButton({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={
        active
          ? "border-b-2 border-primary px-2 pb-2 text-sm font-medium text-foreground"
          : "border-b-2 border-transparent px-2 pb-2 text-sm font-medium text-muted-foreground hover:text-foreground"
      }
    >
      {label}
    </button>
  );
}
