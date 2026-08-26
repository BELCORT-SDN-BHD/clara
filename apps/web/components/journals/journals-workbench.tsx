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
  // a real failure behind a generic message (mission's mechanism rules). ---

  if (workbench.readErrorKind === "no_session") {
    return <p className="p-8 text-sm text-warning">{t("noSession")}</p>;
  }
  if (workbench.readErrorKind === "forbidden") {
    return <p className="p-8 text-sm text-destructive">{t("forbidden")}</p>;
  }
  if (workbench.readErrorKind === "not_found") {
    return <p className="p-8 text-sm text-destructive">{t("notFound")}</p>;
  }
  if (workbench.err && !workbench.data) {
    return (
      <div className="flex flex-col gap-2 p-8">
        <p className="text-sm text-destructive">{t("loadError", { message: workbench.err })}</p>
        <button type="button" className="text-sm text-primary underline" onClick={() => void workbench.reload()}>
          {t("retry")}
        </button>
      </div>
    );
  }
  if (workbench.loading && !workbench.data) {
    return <p className="p-8 text-sm text-muted-foreground">{t("loading")}</p>;
  }
  if (!workbench.data) {
    // Not loading, no error, no data yet — the pre-mount instant only.
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
          entries={data.entries}
          lines={data.lines}
          accounts={data.accounts}
          busy={workbench.busy}
          err={workbench.err}
          clr={workbench.clr}
          onApprove={(id, rev, attestation) => void workbench.approve(id, rev, attestation)}
          onRevise={(id, lines, rev) => void workbench.revise(id, lines, rev)}
        />
      )}
      {tab === "posted" && (
        <PostedPanel
          entries={data.entries}
          lines={data.lines}
          busy={workbench.busy}
          err={workbench.err}
          clr={workbench.clr}
          onReverse={(id, reason) => void workbench.reverse(id, reason)}
        />
      )}
    </main>
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
