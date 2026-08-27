"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { readCorrectionPreview, type CorrectionPreview } from "@/lib/documents/reads";
import { approveCorrection, proposeCorrection, recordDocumentResolution } from "@/lib/documents/doors";
import { readErrorKey } from "@/lib/documents/copy";
import { isDoorError, isDoorRefusal } from "@/lib/doors";
import { DoorFeedback } from "./door-feedback";
import type { ClientRow, DocumentRow } from "@/lib/documents/types";
import type { PartClr } from "@/lib/parts/hooks";

type Step = "select" | "preview" | "proposed" | "done";

/**
 * Wrong-client correction wizard — preview (blast-radius) → record the destination
 * resolution → propose (immutable, hash-bound) → approve by a distinct eligible
 * checker (or a solo-firm attestation). Ported MECHANISM from
 * apps/dashboard/app/documents/CorrectionWizard.tsx; every step's refusal (CLR19
 * distinct-checker, CLR01 destination attribution, a stale plan) renders VERBATIM,
 * never retried automatically.
 */
export function CorrectionWizard({
  open, document: doc, fromClient, clients, clientsErr, clientsClr, onClose, onDone,
}: {
  open: boolean;
  document: DocumentRow;
  fromClient: string;
  clients: ClientRow[];
  /** The PARENT's clients-read state (documents-workbench.tsx's own hydrated
   *  cell) — independent review 2026-08-27, N10: a failed clients read must
   *  render HERE, next to the picker it starves, not just wherever the parent
   *  happens to render its own DoorFeedback. An empty dropdown with no visible
   *  reason reads as "no other clients exist", a false absence (review law 2). */
  clientsErr: string | null;
  clientsClr: PartClr;
  onClose: () => void;
  onDone: () => void;
}) {
  const t = useTranslations("ClientDocuments");
  const [step, setStep] = useState<Step>("select");
  const [toClient, setToClient] = useState("");
  const [preview, setPreview] = useState<CorrectionPreview | null>(null);
  const [proposal, setProposal] = useState<{ correction_id: string; plan_hash: string } | null>(null);
  const [attestation, setAttestation] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [clr, setClr] = useState<PartClr>(null);

  const clientName = (id: string) => clients.find((c) => c.id === id)?.name || id;

  const run = async (fn: () => Promise<void>) => {
    setBusy(true); setErr(null); setClr(null);
    try {
      await fn();
    } catch (e) {
      if (isDoorRefusal(e)) {
        // A governed CLR refusal — verbatim, never re-worded (CLR19 distinct-
        // checker, CLR01 destination attribution, a stale plan hash).
        setErr(e.message);
        setClr({ code: e.code, reason: e.reason });
      } else if (isDoorError(e)) {
        // no_session/forbidden/not_found/... each get their OWN honest sentence —
        // never one shared "something went wrong" bucket (copy.ts's readErrorKey;
        // DoorErrorKind and ReadErrorKind share the same taxonomy).
        setErr(t(readErrorKey(e.kind)));
      } else {
        setErr(e instanceof Error ? e.message : String(e));
      }
    } finally {
      setBusy(false);
    }
  };

  const reset = () => { setStep("select"); setToClient(""); setPreview(null); setProposal(null); setAttestation(""); setErr(null); setClr(null); };
  const close = () => { reset(); onClose(); };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) close(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("correctionTitle")}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          {t("correctionFrom", { client: clientName(fromClient), document: doc.original_filename ?? doc.id })}
        </p>

        {step === "select" ? (
          <div className="flex flex-col gap-2">
            <DoorFeedback err={clientsErr} clr={clientsClr} />
            <Select value={toClient} onValueChange={(v) => setToClient(v ?? "")}>
              <SelectTrigger aria-label={t("correctionMoveTo")}><SelectValue placeholder={t("correctionMoveTo")} /></SelectTrigger>
              <SelectContent>
                {clients.filter((c) => c.id !== fromClient && c.status === "active").map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name ?? c.id}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              disabled={busy || !toClient}
              onClick={() => void run(async () => {
                setPreview(await readCorrectionPreview(doc.id, fromClient, toClient));
                setStep("preview");
              })}
            >
              {t("correctionPreview")}
            </Button>
          </div>
        ) : null}

        {step === "preview" && preview ? (
          <div className="flex flex-col gap-2">
            <p className="text-xs text-muted-foreground">
              {t("correctionBlastRadius", { count: preview.items.length, closed: preview.closed_period_blockers.length })}
            </p>
            <Table>
              <TableHeader>
                <TableRow><TableHead>{t("correctionColEntry")}</TableHead><TableHead>{t("correctionColAction")}</TableHead><TableHead>{t("correctionColStatus")}</TableHead></TableRow>
              </TableHeader>
              <TableBody>
                {preview.items.map((item) => (
                  <TableRow key={item.entry_id}>
                    <TableCell className="font-mono text-xs">{item.entry_id}</TableCell>
                    <TableCell>{item.action}</TableCell>
                    <TableCell>{item.status}</TableCell>
                  </TableRow>
                ))}
                {preview.items.length === 0 ? (
                  <TableRow><TableCell colSpan={3} className="text-muted-foreground">{t("correctionNoEntries")}</TableCell></TableRow>
                ) : null}
              </TableBody>
            </Table>
            <Button
              disabled={busy}
              onClick={() => void run(async () => {
                await recordDocumentResolution(doc.id, toClient, "correction_destination");
                const out = await proposeCorrection(doc.id, fromClient, toClient, t("correctionReasonDefault", { from: clientName(fromClient), to: clientName(toClient) }));
                setProposal({ correction_id: out.correction_id, plan_hash: out.plan_hash });
                setStep("proposed");
              })}
            >
              {t("correctionPropose")}
            </Button>
          </div>
        ) : null}

        {step === "proposed" && proposal ? (
          <div className="flex flex-col gap-2">
            <p className="text-xs text-muted-foreground">{t("correctionDistinctCheckerNote")}</p>
            <Textarea
              value={attestation}
              onChange={(e) => setAttestation(e.target.value)}
              placeholder={t("correctionAttestationPlaceholder")}
              rows={2}
            />
            <Button
              disabled={busy}
              onClick={() => void run(async () => {
                await approveCorrection(proposal.correction_id, proposal.plan_hash, attestation.trim() || null);
                setStep("done");
                onDone();
              })}
            >
              {t("correctionApprove")}
            </Button>
          </div>
        ) : null}

        {step === "done" ? <p className="text-sm text-success">{t("correctionDone")}</p> : null}

        <DoorFeedback err={err} clr={clr} />

        <DialogFooter>
          <Button variant="outline" onClick={close}>{t("correctionClose")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
