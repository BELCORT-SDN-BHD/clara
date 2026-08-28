"use client";

// T9 (port-wave) — the render-job queue (clara.render_jobs). Only a `failed`
// job is requeueable (rung-0 finding, requeue_render_job's own body); a
// manifest-drift refusal (CLR43 requeue_manifest_drifted) is rendered
// verbatim with both digests, and accepting it is a SEPARATE, explicit
// second confirm — never an automatic retry (AGENTS.md: a DoorRefusal is
// never retried by this module; the human decides, then calls again).

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { SectionHeader } from "@/components/common/section-header";
import { EmptyState, LoadingState, StateBanner } from "@/components/common/state";
import { DoorDialog } from "./DoorDialog";
import { useHydratedPart } from "@/lib/parts/hooks";
import { listRenderJobs, requeueRenderJob, isDoorRefusal, DoorRefusal } from "@/lib/reports/api";
import { businessDateTime } from "@/lib/business-date";
import type { RenderJobRow, RenderJobState } from "@/lib/reports/types";
import type { SessionTokenAccessor } from "@/lib/session";

const STATE_VARIANT: Record<RenderJobState, "default" | "destructive" | "outline" | "secondary"> = {
  claimable: "outline",
  running: "secondary",
  done: "default",
  failed: "destructive",
};

export function RenderJobQueuePanel({ clientId, session }: { clientId: string; session: SessionTokenAccessor }) {
  const t = useTranslations("ReportsSnapshotsSeeding.renderJobs");
  const { data: jobs, busy, err, clr, act } = useHydratedPart(session, (s) => listRenderJobs(clientId, { session: s }));

  return (
    <Card>
      <CardHeader>
        <SectionHeader level={2}>{t("heading")}</SectionHeader>
        <CardDescription className="text-xs">{t("subheading")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {jobs && err ? (
          <StateBanner tone="error" code={clr ? `${clr.code}${clr.reason ? ` · ${clr.reason}` : ""}` : undefined}>
            {err}
          </StateBanner>
        ) : null}
        {!jobs ? (
          err ? <StateBanner tone="error">{t("error", { message: err })}</StateBanner> : <LoadingState>{t("loading")}</LoadingState>
        ) : jobs.length === 0 ? (
          <EmptyState>{t("empty")}</EmptyState>
        ) : (
          <div className="flex flex-col gap-2">
            {jobs.map((j) => (
              <RenderJobRowView key={j.id} job={j} busy={busy} act={act} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function RenderJobRowView({ job, busy, act }: { job: RenderJobRow; busy: boolean; act: (fn: () => Promise<void>) => Promise<void> }) {
  const t = useTranslations("ReportsSnapshotsSeeding.renderJobs");

  return (
    <div className="enter-content flex flex-col gap-2 rounded-lg border border-border bg-card p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium font-mono text-card-foreground">{job.kind}</span>
        <Badge variant={STATE_VARIANT[job.state]}>{job.state}</Badge>
        <span className="text-xs text-muted-foreground">{t("attemptsLabel", { attempts: job.attempts, max: job.max_attempts })}</span>
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <dt>{t("enqueuedLabel")}</dt>
        <dd>{businessDateTime(job.enqueued_at)}</dd>
        {job.requeue_reason ? (
          <>
            <dt>{t("requeueReasonLabel")}</dt>
            <dd>{job.requeue_reason}</dd>
          </>
        ) : null}
      </dl>
      {job.last_error ? (
        <StateBanner tone="error" title={t("lastErrorTitle")}>
          {JSON.stringify(job.last_error)}
        </StateBanner>
      ) : null}
      {job.state === "failed" ? <RequeueDialog job={job} busy={busy} act={act} /> : null}
    </div>
  );
}

function RequeueDialog({ job, busy, act }: { job: RenderJobRow; busy: boolean; act: (fn: () => Promise<void>) => Promise<void> }) {
  const t = useTranslations("ReportsSnapshotsSeeding.renderJobs.requeue");
  const [reason, setReason] = useState("");
  const [drift, setDrift] = useState<{ superseded_manifest_sha256: string; manifest_sha256: string } | null>(null);
  const [acceptDrift, setAcceptDrift] = useState(false);

  const submit = () =>
    act(async () => {
      try {
        await requeueRenderJob({ jobId: job.id, reason, acceptDrift });
        setDrift(null);
      } catch (e) {
        // The drift refusal is read here, once, so the SAME dialog can offer
        // the explicit second confirm — every other refusal still surfaces
        // verbatim through the panel's own banner via `act`'s reload cycle,
        // never retried automatically.
        if (isDoorRefusal(e) && e.code === "CLR43" && e.reason === "requeue_manifest_drifted") {
          const detail = (e as DoorRefusal).message;
          setDrift({ superseded_manifest_sha256: job.manifest_sha256, manifest_sha256: detail });
        }
        throw e;
      }
    });

  return (
    <DoorDialog
      triggerLabel={t("trigger")}
      title={t("title")}
      description={t("description")}
      confirmLabel={t("confirm")}
      busy={busy}
      confirmDisabled={reason.trim().length === 0 || (drift !== null && !acceptDrift)}
      onConfirm={submit}
    >
      <div className="flex flex-col gap-2">
        <Input aria-label={t("reasonPlaceholder")} placeholder={t("reasonPlaceholder")} value={reason} onChange={(e) => setReason(e.target.value)} />
        {drift ? (
          <>
            <StateBanner tone="warning" title={t("driftTitle")}>
              {t("driftBody")}
            </StateBanner>
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input type="checkbox" checked={acceptDrift} onChange={(e) => setAcceptDrift(e.target.checked)} />
              {t("driftAcknowledge")}
            </label>
          </>
        ) : null}
      </div>
    </DoorDialog>
  );
}
