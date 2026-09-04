"use client";

// T9 (port-wave) — wiki page curation (clara.wiki_pages). A read list plus
// the one write door in scope, retire_wiki_page — authoring/editing a page's
// CONTENT has no human door in this catalog (wiki_page_versions is written
// by the seeding-tick projection and by Clara's own agent lane; rung-0 found
// no clara_authenticated write verb for it), so this panel is a curation
// surface (retire only), never a page editor.

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { SectionHeader } from "@/components/common/section-header";
import { NotBuiltNote } from "@/components/common/not-built-note";
import { EmptyState, LoadingState, StateBanner } from "@/components/common/state";
import { DoorDialog } from "./DoorDialog";
import { useHydratedPart } from "@/lib/parts/hooks";
import { listWikiPages, retireWikiPage } from "@/lib/reports/api";
import { businessDateTime } from "@/lib/business-date";
import type { WikiPageRow } from "@/lib/reports/types";
import type { SessionTokenAccessor } from "@/lib/session";

export function WikiCurationPanel({ clientId, session }: { clientId: string; session: SessionTokenAccessor }) {
  const t = useTranslations("ReportsSnapshotsSeeding.wiki");
  const { data: pages, busy, err, clr, act } = useHydratedPart(session, (s) => listWikiPages(clientId, { session: s }));

  return (
    <Card>
      <CardHeader>
        <SectionHeader level={2}>{t("heading")}</SectionHeader>
        <CardDescription className="text-xs">{t("subheading")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <NotBuiltNote className="text-xs">{t("editNotice")}</NotBuiltNote>
        {pages && err ? (
          <StateBanner tone="error" code={clr ? `${clr.code}${clr.reason ? ` · ${clr.reason}` : ""}` : undefined}>
            {err}
          </StateBanner>
        ) : null}
        {!pages ? (
          err ? <StateBanner tone="error">{t("error", { message: err })}</StateBanner> : <LoadingState>{t("loading")}</LoadingState>
        ) : pages.length === 0 ? (
          <EmptyState>{t("empty")}</EmptyState>
        ) : (
          <div className="flex flex-col gap-2">
            {pages.map((p) => (
              <WikiPageRowView key={p.id} page={p} busy={busy} act={act} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function WikiPageRowView({ page, busy, act }: { page: WikiPageRow; busy: boolean; act: (fn: () => Promise<void>) => Promise<boolean> }) {
  const t = useTranslations("ReportsSnapshotsSeeding.wiki");
  return (
    <div className="enter-content flex flex-col gap-2 rounded-lg border border-border bg-card p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium text-card-foreground">{page.title}</span>
        <Badge variant={page.state === "active" ? "outline" : "destructive"}>{page.state}</Badge>
        <span className="font-mono text-xs text-muted-foreground">{page.page_kind}</span>
      </div>
      <span className="font-mono text-xs text-muted-foreground">{page.slug}</span>
      <span className="text-xs text-muted-foreground">{t("updatedLabel")}: {businessDateTime(page.updated_at)}</span>
      {page.state === "retired" && page.retire_reason ? (
        <p className="text-xs text-muted-foreground">{t("retireReasonLabel")}: {page.retire_reason}</p>
      ) : null}
      {page.state === "active" ? <RetireDialog pageId={page.id} busy={busy} act={act} /> : null}
    </div>
  );
}

function RetireDialog({ pageId, busy, act }: { pageId: string; busy: boolean; act: (fn: () => Promise<void>) => Promise<boolean> }) {
  const t = useTranslations("ReportsSnapshotsSeeding.wiki.retire");
  const [reason, setReason] = useState("");
  return (
    <DoorDialog
      triggerLabel={t("trigger")}
      title={t("title")}
      description={t("description")}
      confirmLabel={t("confirm")}
      busy={busy}
      confirmDisabled={reason.trim().length === 0}
      onConfirm={() => act(async () => { await retireWikiPage({ pageId, reason }); })}
    >
      <Input aria-label={t("reasonPlaceholder")} placeholder={t("reasonPlaceholder")} value={reason} onChange={(e) => setReason(e.target.value)} />
    </DoorDialog>
  );
}
