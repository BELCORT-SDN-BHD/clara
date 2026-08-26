"use client";

// One clara.report_artifacts row (0071/0127) — custody metadata only, never a
// download link (see lib/reports/types.ts's header: no byte-download mechanism
// exists anywhere in this catalog). A `pre_sign` row gets the Issue + Archive
// doors (0127); a `signed_original` row gets the Retrieve custody read.

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DoorDialog } from "./DoorDialog";
import { issueReportForApproval, archiveSignedOriginal, retrieveSignedOriginal, isDoorRefusal } from "@/lib/reports/api";
import type { ReportArtifactRow } from "@/lib/reports/types";
import type { SessionTokenAccessor } from "@/lib/session";

export function ArtifactRow({
  artifact,
  session,
  busy,
  act,
}: {
  artifact: ReportArtifactRow;
  session: SessionTokenAccessor;
  busy: boolean;
  act: (fn: () => Promise<void>) => Promise<void>;
}) {
  const t = useTranslations("ClientReports.statutory");
  const [copied, setCopied] = useState(false);

  const copyKey = () => {
    navigator.clipboard?.writeText(artifact.storage_key).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }).catch(() => {});
  };

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium text-card-foreground">{artifact.kind.replace(/_/g, " ")}</span>
        <span className="font-mono text-xs text-muted-foreground">run {artifact.report_run_id.slice(0, 8)}</span>
        {artifact.prepared_by_agent ? <Badge variant="secondary">{t("agentPrepared")}</Badge> : null}
        {artifact.claim_removed ? <Badge variant="destructive">{t("claimRemoved")}</Badge> : null}
        {artifact.uncertified ? <Badge variant="destructive">{t("uncertified")}</Badge> : null}
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="font-mono text-muted-foreground">{artifact.storage_key}</span>
        <Button variant="outline" size="xs" onClick={copyKey}>{copied ? t("copied") : t("copyKey")}</Button>
      </div>
      <p className="text-xs text-muted-foreground">{t("noDownload")}</p>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
        <dt className="text-muted-foreground">sha256</dt>
        <dd className="truncate font-mono text-card-foreground">{artifact.sha256}</dd>
        <dt className="text-muted-foreground">bytes</dt>
        <dd className="font-mono text-card-foreground">{artifact.byte_size.toLocaleString()}</dd>
        <dt className="text-muted-foreground">{t("sealedBy")}</dt>
        <dd className="font-mono text-card-foreground">{artifact.sealed_by} · {artifact.sealed_at}</dd>
      </dl>
      {artifact.kind === "pre_sign" ? (
        <div className="flex flex-wrap gap-2">
          <IssueDialog artifact={artifact} session={session} busy={busy} act={act} />
          <ArchiveDialog artifact={artifact} session={session} busy={busy} act={act} />
        </div>
      ) : null}
      {artifact.kind === "signed_original" ? <RetrieveAction reportRunId={artifact.report_run_id} session={session} /> : null}
    </div>
  );
}

function IssueDialog({
  artifact,
  session,
  busy,
  act,
}: {
  artifact: ReportArtifactRow;
  session: SessionTokenAccessor;
  busy: boolean;
  act: (fn: () => Promise<void>) => Promise<void>;
}) {
  const t = useTranslations("ClientReports.statutory.issue");
  const [reason, setReason] = useState("");
  const [attestation, setAttestation] = useState("");
  return (
    <DoorDialog
      triggerLabel={t("trigger")}
      title={t("title")}
      description={t("description")}
      confirmLabel={t("confirm")}
      busy={busy}
      disabled={reason.trim().length === 0}
      onConfirm={() =>
        act(async () => {
          await issueReportForApproval(
            { reportRunId: artifact.report_run_id, artifactId: artifact.id, expectedArtifactSha256: artifact.sha256, reason, selfAttestation: attestation },
            { session },
          );
        })
      }
    >
      <div className="flex flex-col gap-2">
        <Input aria-label={t("reasonPlaceholder")} placeholder={t("reasonPlaceholder")} value={reason} onChange={(e) => setReason(e.target.value)} />
        <Input aria-label={t("attestationPlaceholder")} placeholder={t("attestationPlaceholder")} value={attestation} onChange={(e) => setAttestation(e.target.value)} />
      </div>
    </DoorDialog>
  );
}

function ArchiveDialog({
  artifact,
  session,
  busy,
  act,
}: {
  artifact: ReportArtifactRow;
  session: SessionTokenAccessor;
  busy: boolean;
  act: (fn: () => Promise<void>) => Promise<void>;
}) {
  const t = useTranslations("ClientReports.statutory.archive");
  const [sha, setSha] = useState("");
  const [byteSize, setByteSize] = useState("");
  const [signer, setSigner] = useState("");
  return (
    <DoorDialog
      triggerLabel={t("trigger")}
      title={t("title")}
      description={t("description")}
      confirmLabel={t("confirm")}
      busy={busy}
      disabled={!sha.trim() || !byteSize.trim() || !signer.trim()}
      onConfirm={() =>
        act(async () => {
          await archiveSignedOriginal(
            {
              reportRunId: artifact.report_run_id, artifactId: artifact.id, sha256: sha.trim().toLowerCase(),
              byteSize: Number(byteSize), signatureEvidence: { kind: "wet_signature", signer_name: signer },
              answersPreSignSha256: artifact.sha256,
            },
            { session },
          );
        })
      }
    >
      <div className="flex flex-col gap-2">
        <Input aria-label={t("shaPlaceholder")} placeholder={t("shaPlaceholder")} value={sha} onChange={(e) => setSha(e.target.value)} />
        <Input aria-label={t("byteSizePlaceholder")} placeholder={t("byteSizePlaceholder")} value={byteSize} onChange={(e) => setByteSize(e.target.value)} />
        <Input aria-label={t("signerPlaceholder")} placeholder={t("signerPlaceholder")} value={signer} onChange={(e) => setSigner(e.target.value)} />
      </div>
    </DoorDialog>
  );
}

function RetrieveAction({ reportRunId, session }: { reportRunId: string; session: SessionTokenAccessor }) {
  const t = useTranslations("ClientReports.statutory.retrieve");
  const [busy, setBusy] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [custody, setCustody] = useState<Awaited<ReturnType<typeof retrieveSignedOriginal>>>(null);
  const [error, setError] = useState<string | null>(null);

  const retrieve = async () => {
    setBusy(true);
    setError(null);
    try {
      setCustody(await retrieveSignedOriginal(reportRunId, { session }));
      setAttempted(true);
    } catch (e) {
      setError(isDoorRefusal(e) ? e.message : e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-1.5 text-xs">
      <Button variant="outline" size="sm" disabled={busy} onClick={retrieve}>{busy ? t("retrieving") : t("trigger")}</Button>
      {attempted && custody ? (
        <>
          <span className="font-mono text-muted-foreground">{custody.storage_key}</span>
          <span className="font-mono text-muted-foreground">sha256 {custody.sha256} · {custody.byte_size.toLocaleString()} bytes</span>
          <span className="text-muted-foreground">{custody.retrieval_note}</span>
        </>
      ) : attempted ? (
        <p className="text-muted-foreground">{t("none")}</p>
      ) : null}
      {error ? <p className="text-destructive">{error}</p> : null}
    </div>
  );
}
