"use client";

// T9 (port-wave) — the render-job queue (clara.render_jobs). Only a `failed`
// job is requeueable (rung-0 finding, requeue_render_job's own body); a
// manifest-drift refusal (CLR43 requeue_manifest_drifted) renders the
// refusal's own message verbatim through the panel's own persistent banner
// (the door dialog itself closes on any confirm attempt, per house
// mechanism — see RequeueDialog's own note), and accepting it is a
// SEPARATE, explicit second confirm on the dialog's NEXT open — never an
// automatic retry (AGENTS.md: a DoorRefusal is never retried by this
// module; the human decides, then calls again).
//
// F2/F3 (independent review, T9 fix round): the DB's refusal names BOTH
// digests in its `detail` object, but wire.ts's RefusalError carries no
// `detail` passthrough — only `.message` (free text) and `.reason` (the one
// parsed discriminant string). This module cannot render a digest it was
// never given, so it renders only what IS real: the job's own, ALREADY-
// LOADED `manifest_sha256`, labelled the SUPERSEDED one — never a fabricated
// "new" digest. (Chosen over widening RefusalError with a `detail` field —
// that is a shared-file, cross-consumer change or a broader fix; this is the
// narrower, in-file one, and the refusal's own message is still shown.)

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { SectionHeader } from "@/components/common/section-header";
import { EmptyState, LoadingState, StateBanner } from "@/components/common/state";
import { DoorDialog } from "./DoorDialog";
import { useHydratedPart } from "@/lib/parts/hooks";
import { listRenderJobs, requeueRenderJob, isDoorRefusal } from "@/lib/reports/api";
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
  // F2/F3 (independent review): a plain boolean — no fabricated digest
  // fields. The only REAL fact available on a drift refusal is the job's
  // own, already-loaded manifest_sha256 (rendered directly below, labelled
  // superseded); the refusal carries no `detail` passthrough (see the file
  // header) to source a "new" digest from.
  const [drift, setDrift] = useState(false);
  const [acceptDrift, setAcceptDrift] = useState(false);

  const submit = () =>
    act(async () => {
      // Gap B (independent review, re-verify round): clear the STALE flag at
      // the top of every attempt, not only on success. Without this, a
      // requeue that fails for an UNRELATED reason (a role refusal, a
      // network error — anything but CLR43 drift) left the checkbox from a
      // PRIOR drift finding standing, forcing consent to a condition this
      // attempt never even re-tested. Clearing first and only re-setting it
      // below when THIS attempt's own refusal names drift keeps the flag
      // honest: a drift refusal immediately re-arms it (so the next open
      // still shows consent for the SAME still-live obstacle), while any
      // other outcome — success, or a changed/different obstacle — retires
      // it.
      setDrift(false);
      try {
        await requeueRenderJob({ jobId: job.id, reason, acceptDrift });
      } catch (e) {
        // The drift refusal is read here, once. DoorDialog's own confirm
        // button closes on ANY resolved onConfirm — including a caught
        // failure, since useHydratedPart's act() never rethrows — so this
        // dialog cannot stay open to offer a same-session second confirm;
        // the refusal renders through the panel's own persistent banner
        // (never inside the dialog, per house law), and `drift` (re-armed
        // here when it applies, cleared otherwise) is what makes the NEXT
        // open show the consent checkbox instead of a blank retry.
        if (isDoorRefusal(e) && e.code === "CLR43" && e.reason === "requeue_manifest_drifted") {
          setDrift(true);
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
      confirmDisabled={reason.trim().length === 0 || (drift && !acceptDrift)}
      onConfirm={submit}
      // F4 (independent review, corrected — self-caught while wiring the
      // fix): `reason` and `acceptDrift` are a FRESH deliberate act every
      // open, so they reset here. `drift` deliberately does NOT reset ON
      // OPEN: this door's own DoorDialog closes after EVERY confirm attempt,
      // success or refusal (act() never rethrows — see submit's own note
      // below), so a drift finding can only ever be SHOWN on the dialog's
      // NEXT open, after the human has read the refusal from the panel's
      // persistent banner and reopens deliberately to accept it. Resetting
      // `drift` HERE (on open) would make that reopen show nothing, trapping
      // every drifted job in a refuse-close-reopen loop with no way to ever
      // complete a requeue. It IS cleared PER ATTEMPT instead — see Gap B's
      // note at the top of `submit`, below — which is a different axis
      // entirely (an attempt's own fresh outcome, not the act of opening).
      onOpenChange={(isOpen) => {
        if (isOpen) {
          setReason("");
          setAcceptDrift(false);
        }
      }}
    >
      <div className="flex flex-col gap-2">
        <Input aria-label={t("reasonPlaceholder")} placeholder={t("reasonPlaceholder")} value={reason} onChange={(e) => setReason(e.target.value)} />
        {drift ? (
          <>
            <StateBanner tone="warning" title={t("driftTitle")}>
              {t("driftBody")}
            </StateBanner>
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <dt>{t("driftSupersededLabel")}</dt>
              <dd className="truncate font-mono">{job.manifest_sha256}</dd>
            </dl>
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
