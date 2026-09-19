"use client";

// #635 (D2) — THE ONLY IN-APP PLACE AN OWNER CAN PUT A WITHDRAWN LEGAL STANDING BACK.
//
// THE GAP THIS CLOSES, measured. `clara._accounting_work_egress_live` (0195:875) withdraws a
// firm's derived model-egress authority the moment a newer legal version is published
// (0195:890-892) — no sweep, no second switch. The remedy `WorkDetail.egressNotAuthorized.body`
// names ("an owner must accept the current versions") had NO destination in the product: the one
// accept surface was `(entry)`'s signup stage, which a signed-in owner never sees again. This
// dialog is that destination.
//
// IT IMPORTS `lib/registration/legal-reads.ts` AND `lib/registration/legal-doors.ts` UNCHANGED —
// the sixth importer, and the first inside `(firm)`. They are not forked and not copied. The
// three properties those modules carry are the three this dialog depends on:
//
//  1. THE BYTES ARE READ AT THE MOMENT OF ACCEPTING, from `clara.get_current_legal_documents()`,
//     and `body_sha256` is forwarded VERBATIM. The standing door deliberately carries neither
//     the body nor the digest (0233's own header), so there is no second copy of the text on
//     this page that could drift from the one the acceptance door hashes.
//  2. THE OP KEY IS MINTED ONCE PER (kind, version) AND HELD ACROSS RETRIES. A retry after a
//     lost response must REPLAY, not accept twice; minting a fresh key per attempt would destroy
//     exactly the property the key exists for (0185:766-775 returns the ORIGINAL instant).
//  3. A STALE REFUSAL IS A RE-READ, NEVER A RESUBMIT. `stale_version` and `hash_mismatch`
//     (`STALE_ACCEPT_REASONS`) both mean "what you were shown is no longer what the database
//     holds" — so the dialog fetches the current version and shows it, and the person accepts
//     THAT. Re-posting the same digest could only ever refuse again.
//
// A DRAFT RENDERS AS A LABELLED PREVIEW WITH NO CONTROL. `accept_legal_document` refuses a draft
// CLR09/`not_published` anyway (0185), and offering a control the database will refuse is how a
// person comes to believe they have signed something that is still being written.

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2Icon } from "lucide-react";
import { useTranslations } from "next-intl";

import { StateBanner } from "@/components/common/state";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { formatInstant } from "@/lib/firm/commercial-format";
import {
  acceptLegalDocument as productionAcceptLegalDocument,
  type AcceptLegalDocument,
  type AcceptLegalDocumentOutcome,
} from "@/lib/registration/legal-doors";
import {
  loadCurrentLegalDocuments as productionLoadCurrentLegalDocuments,
  type LegalDocumentRow,
  type LegalKind,
} from "@/lib/registration/legal-reads";
import { sessionTokenAccessor } from "@/lib/session-accessor";

type LoadDocuments = () => Promise<LegalDocumentRow[]>;

export type AcceptLegalDialogProps = {
  readonly kind: LegalKind;
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  /** Called after an acceptance the database confirmed (including a replay) so the standing
   *  card re-reads. Hydrate-never-trust: this dialog paints no standing of its own. */
  readonly onAccepted: () => void;
  /** Injected for the unit cells; production uses the shipped modules. */
  readonly loadDocuments?: LoadDocuments;
  readonly accept?: AcceptLegalDocument;
  /** Injected for the unit cells so a mint is observable; production mints a uuid. */
  readonly mintOpKey?: () => string;
};

type DocState =
  | { readonly status: "loading" }
  | { readonly status: "ready"; readonly row: LegalDocumentRow }
  | { readonly status: "absent" }
  | { readonly status: "failed" };

function defaultLoadDocuments(): Promise<LegalDocumentRow[]> {
  return productionLoadCurrentLegalDocuments(sessionTokenAccessor);
}

function defaultMintOpKey(): string {
  return `accept-legal-${crypto.randomUUID()}`;
}

export function AcceptLegalDialog({
  kind,
  open,
  onOpenChange,
  onAccepted,
  loadDocuments = defaultLoadDocuments,
  accept = productionAcceptLegalDocument,
  mintOpKey = defaultMintOpKey,
}: AcceptLegalDialogProps) {
  const t = useTranslations("FirmSettings");
  const [doc, setDoc] = useState<DocState>({ status: "loading" });
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<AcceptLegalDocumentOutcome | null>(null);

  // THE OP KEY, MINTED ONCE PER (kind, version) AND HELD. A `useRef` keyed by the version it was
  // minted for: a retry of the SAME version reuses it (so a lost response replays), and a
  // re-read that moves the version mints a new one (a different document is a different act).
  const opKeyRef = useRef<{ version: number; key: string } | null>(null);

  // THE LOADER IS READ THROUGH A REF, NOT DEPENDED ON BY IDENTITY — `lib/parts/hooks.ts`'s own
  // "P3 FOLLOW-UP" discipline, and this component earned it: a caller passing an inline
  // `loadDocuments={async () => …}` gives `read` a new identity every render, which re-fires the
  // effect below, which sets state, which renders again. The unit cells caught exactly that as an
  // out-of-memory storm. `read` now depends on the KIND alone, and a manual re-read still calls
  // whichever loader body is current.
  const loadRef = useRef(loadDocuments);
  loadRef.current = loadDocuments;

  const read = useCallback(async () => {
    setDoc({ status: "loading" });
    try {
      const rows = await loadRef.current();
      const row = rows.find((r) => r.kind === kind) ?? null;
      setDoc(row === null ? { status: "absent" } : { status: "ready", row });
    } catch {
      setDoc({ status: "failed" });
    }
  }, [kind]);

  useEffect(() => {
    if (!open) return;
    setOutcome(null);
    void read();
  }, [open, read]);

  const row = doc.status === "ready" ? doc.row : null;
  const acceptable = row !== null && row.status === "published";

  async function confirm() {
    if (row === null || !acceptable) return;
    if (opKeyRef.current === null || opKeyRef.current.version !== row.version) {
      opKeyRef.current = { version: row.version, key: mintOpKey() };
    }
    setBusy(true);
    const result = await accept({
      documentKind: kind,
      version: row.version,
      bodySha256: row.body_sha256,
      opKey: opKeyRef.current.key,
    });
    setBusy(false);
    setOutcome(result);
    if (result.kind === "accepted") onAccepted();
  }

  const accepted = outcome?.kind === "accepted" ? outcome : null;
  const refused = outcome?.kind === "refused" ? outcome : null;
  const stale = refused?.stale === true;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {t("acceptDialogTitle", { kind: kind === "terms" ? t("legalKindTerms") : t("legalKindDpa") })}
          </DialogTitle>
          <DialogDescription>
            {t("acceptDialogDescription", { version: row?.version ?? 0 })}
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="flex flex-col gap-3">
          {doc.status === "loading" ? <Skeleton className="h-24 w-full" /> : null}
          {doc.status === "failed" || doc.status === "absent" ? (
            <StateBanner tone="error">{t("acceptDialogReadFailed")}</StateBanner>
          ) : null}
          {row !== null && row.status !== "published" ? (
            // A DRAFT IS A PREVIEW. `legal-reads.ts:27-31` is the whole reason this face exists.
            <StateBanner tone="neutral">{t("legalDraftNote")}</StateBanner>
          ) : null}
          {row !== null ? (
            <>
              <p className="text-xs text-muted-foreground">{t("acceptDialogTextLabel")}</p>
              {/* THE EXACT BYTES THE DOOR RETURNED, rendered and never re-derived. */}
              <div className="max-h-64 overflow-y-auto rounded-lg border p-3 text-sm whitespace-pre-wrap" tabIndex={0}>
                {row.body}
              </div>
            </>
          ) : null}
          {stale ? (
            <StateBanner tone="warning" title={t("acceptDialogStaleHeading")} code={refused?.code}
              action={<Button type="button" variant="outline" size="sm" onClick={() => { setOutcome(null); void read(); }}>{t("acceptDialogReread")}</Button>}>
              {t("acceptDialogStaleBody")}
            </StateBanner>
          ) : null}
          {refused !== null && !stale ? (
            // A GOVERNED REFUSAL, VERBATIM — the database's own sentence and its own code.
            <StateBanner tone="error" code={refused.code}>{refused.message}</StateBanner>
          ) : null}
          {outcome?.kind === "unavailable" ? (
            <StateBanner tone="warning">{t("acceptDialogUnavailable")}</StateBanner>
          ) : null}
          {accepted !== null ? (
            <StateBanner tone="info">
              {accepted.replay
                ? t("acceptDialogReplayed", { date: formatInstant(accepted.acceptedAt) ?? accepted.acceptedAt })
                : t("acceptDialogAccepted", { date: formatInstant(accepted.acceptedAt) ?? accepted.acceptedAt })}
            </StateBanner>
          ) : null}
        </DialogBody>
        <DialogFooter>
          <DialogClose render={<Button type="button" variant="outline" disabled={busy} />}>
            {t("acceptDialogCancel")}
          </DialogClose>
          {/* NO RESUBMIT AGAINST A STALE DIGEST. While `stale` is outstanding the confirm control
              is GONE, not disabled: the only lawful next move is the re-read in the banner above,
              and re-posting the digest the door just rejected could never do anything but refuse
              again (`STALE_ACCEPT_REASONS`). */}
          {acceptable && accepted === null && !stale ? (
            <Button type="button" onClick={confirm} disabled={busy}>
              {busy ? <Loader2Icon className="size-4 animate-spin" aria-hidden="true" /> : null}
              {busy ? t("acceptDialogBusy") : t("acceptDialogConfirm")}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
