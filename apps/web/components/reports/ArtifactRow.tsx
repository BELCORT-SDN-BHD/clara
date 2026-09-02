"use client";

// One clara.report_artifacts row (0071/0127) — custody metadata, the Issue + Archive doors on a
// `pre_sign` row, the Retrieve custody read on a `signed_original` one, and — since FS-7 echelon 2
// (裁-96②) — the real byte DOWNLOAD.
//
// THE DOWNLOAD CONTROL IS NOT A LINK AND IS NOT DERIVED HERE. It appears only where
// `clara.list_downloadable_artifacts` says this artifact is downloadable, and that flag is the
// byte door's own gate executed per row — this component never inspects `kind`, `sha256` or
// anything else to decide. The storage key stays on screen as the custody fact it always was; it
// is not, and never becomes, the thing the download uses.

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState, StateBanner } from "@/components/common/state";
import { DoorDialog } from "./DoorDialog";
import { issueReportForApproval, archiveSignedOriginal, retrieveSignedOriginal, isDoorRefusal } from "@/lib/reports/api";
import { DownloadArtifactButton } from "./DownloadArtifactButton";
import type { DownloadableArtifact, ReportArtifactRow } from "@/lib/reports/types";
import type { SessionTokenAccessor } from "@/lib/session";

/** LOW (independent review, L3): `Number(byteSize)` on a malformed string
 *  (empty, whitespace, non-digits) silently becomes NaN, which
 *  JSON.stringify serializes as `null` — a confusing generic CLR10 from the
 *  DB rather than an honest local message. Exported so the validation itself
 *  is unit-tested directly (a static render cannot simulate typing). */
export function isValidByteSize(value: string): boolean {
  return /^[0-9]+$/.test(value.trim());
}

export function ArtifactRow({
  artifact,
  offer,
  session,
  busy,
  act,
}: {
  artifact: ReportArtifactRow;
  /** The OFFER door's row for this artifact, or `null` while the offer read is in flight. */
  offer: DownloadableArtifact | null;
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
    <div className="enter-content flex flex-col gap-2 rounded-lg border border-border bg-card p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        {/* LOW (independent review): render `kind` verbatim — a `_` → ` `
            relabel is a small liberty this build's own verbatim discipline
            (doors.ts's RefusalError message, get_close_plan's gate state)
            does not extend to the DB's own enum values elsewhere either. */}
        <span className="font-medium font-mono text-card-foreground">{artifact.kind}</span>
        <span className="font-mono text-xs text-muted-foreground">{t("runLabel")} {artifact.report_run_id.slice(0, 8)}</span>
        {artifact.prepared_by_agent ? <Badge variant="secondary">{t("agentPrepared")}</Badge> : null}
        {artifact.claim_removed ? <Badge variant="destructive">{t("claimRemoved")}</Badge> : null}
        {artifact.uncertified ? <Badge variant="destructive">{t("uncertified")}</Badge> : null}
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="font-mono text-muted-foreground wrap-anywhere">{artifact.storage_key}</span>
        <Button variant="outline" size="xs" onClick={copyKey}>{copied ? t("copied") : t("copyKey")}</Button>
      </div>
      <p className="text-xs text-muted-foreground">{t("downloadNote")}</p>
      <DownloadArtifactButton offer={offer} session={session} namespace="ClientReports.statutory.download" />
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
        <dt className="text-muted-foreground">{t("sha256Label")}</dt>
        <dd className="truncate font-mono text-card-foreground">{artifact.sha256}</dd>
        <dt className="text-muted-foreground">{t("bytesLabel")}</dt>
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
      confirmDisabled={reason.trim().length === 0}
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
  // LOW (independent review, L3 — stands): `Number(byteSize)` on a malformed
  // string (empty, whitespace, non-digits) silently becomes NaN, which
  // JSON.stringify serializes as `null` — a confusing generic CLR10 from the
  // DB rather than an honest local message. Validated BEFORE the door is ever
  // called; the door never receives a non-digit byteSize from this form.
  const byteSizeValid = isValidByteSize(byteSize);
  return (
    <DoorDialog
      triggerLabel={t("trigger")}
      title={t("title")}
      description={t("description")}
      confirmLabel={t("confirm")}
      busy={busy}
      confirmDisabled={!sha.trim() || !byteSizeValid || !signer.trim()}
      onConfirm={() =>
        act(async () => {
          await archiveSignedOriginal(
            {
              reportRunId: artifact.report_run_id, artifactId: artifact.id, sha256: sha.trim().toLowerCase(),
              byteSize: Number(byteSize.trim()), signatureEvidence: { kind: "wet_signature", signer_name: signer },
              answersPreSignSha256: artifact.sha256,
            },
            { session },
          );
        })
      }
    >
      <div className="flex flex-col gap-2">
        <Input aria-label={t("shaPlaceholder")} placeholder={t("shaPlaceholder")} value={sha} onChange={(e) => setSha(e.target.value)} />
        {/* `aria-invalid` was already a styled state on the Input primitive
            (border + ring in the destructive tone) and nothing in the product
            set it. The local byte-size validation is exactly what it is for:
            the field itself now shows it is the problem, instead of only a
            sentence underneath saying so. */}
        <Input aria-label={t("byteSizePlaceholder")} placeholder={t("byteSizePlaceholder")} value={byteSize} onChange={(e) => setByteSize(e.target.value)} inputMode="numeric" aria-invalid={byteSize.trim().length > 0 && !byteSizeValid} />
        {byteSize.trim().length > 0 && !byteSizeValid ? <p className="text-xs text-error">{t("byteSizeInvalid")}</p> : null}
        <Input aria-label={t("signerPlaceholder")} placeholder={t("signerPlaceholder")} value={signer} onChange={(e) => setSigner(e.target.value)} />
      </div>
    </DoorDialog>
  );
}

function RetrieveAction({ reportRunId, session }: { reportRunId: string; session: SessionTokenAccessor }) {
  const t = useTranslations("ClientReports.statutory.retrieve");
  const tArtifact = useTranslations("ClientReports.statutory");
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
          <span className="font-mono text-muted-foreground wrap-anywhere">{custody.storage_key}</span>
          <span className="font-mono text-muted-foreground wrap-anywhere">
            {tArtifact("sha256Label")} {custody.sha256} · {custody.byte_size.toLocaleString()} {tArtifact("bytesLabel")}
          </span>
          <span className="text-muted-foreground">{custody.retrieval_note}</span>
        </>
      ) : attempted ? (
        <EmptyState className="text-xs">{t("none")}</EmptyState>
      ) : null}
      {error ? <StateBanner tone="error">{error}</StateBanner> : null}
    </div>
  );
}
