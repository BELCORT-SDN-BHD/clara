"use client";

// #636 — STOP THIS BATCH. One confirm, ONE governed call.
//
// THE FAN-OUT IS THE SERVER'S, NOT THIS DIALOG'S. `POST /api/runtime/intake/batches/:id/cancel`
// makes exactly one decision (`clara.cancel_intake_batch`) and the runtime then issues one
// `clara.cancel_accounting_work` per live child, one call per transaction. N calls from a browser
// is the shape `components/documents/DocumentsDoorDialog.tsx:8-9` forbids, and a half-finished N —
// a tab closed after child 12 of 40 — would leave a batch nobody could reason about.
//
// ONE OP KEY PER OPEN DECISION, and a new press renews it. Copied from
// `components/work/work-cancel-dialog.tsx:95-107` WITH ITS SOURCE NAMED, on the
// `components/accounting/plan-lifecycle-dialogs.tsx:66` precedent for copying a small idiom rather
// than importing across a feature boundary. An unobserved first attempt and its retry are ONE
// operation to the database (`clara._reserve_op` replays the stored result for the same key +
// the same request hash); a DIFFERENT key against a batch that is already stopping is refused
// CLR13 `batch_already_cancelling` by name, so a second press can never re-key the children.
//
// THE DRAFT IS PRESERVED ACROSS A REFUSAL: the dialog stays open, the refusal renders inline, and
// nothing the person typed or chose is thrown away.
//
// FOCUS RETURNS to the control that opened it — a dialog that closes into the void is where
// keyboard users lose their place.

import { useCallback, useRef, useState, type RefObject } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { StateBanner } from "@/components/common/state";
import { cancelIntakeBatch } from "@/lib/documents/intake-batch-doors";
import { isDoorRefusal } from "@/lib/doors";
import { sessionTokenAccessor } from "@/lib/session-accessor";
import type { SessionTokenAccessor } from "@/lib/session";

/** A stable key per OPEN DECISION. Minted when the dialog opens and reused for every attempt at
 *  that decision, so an unobserved first attempt and its retry are ONE operation to the database.
 *  A new press of the trigger is a new decision and mints a new one.
 *  (`work-cancel-dialog.tsx:95-107`, copied with its source named.) */
function useDecisionKey(): { key: () => string; renew: () => void } {
  const ref = useRef<string | null>(null);
  return {
    key: () => {
      if (ref.current === null) ref.current = crypto.randomUUID();
      return ref.current;
    },
    renew: () => { ref.current = null; },
  };
}

export function IntakeBatchCancelDialog({
  batchId,
  label,
  liveChildren,
  pendingMembers,
  onOpenChange,
  onCancelled,
  returnFocusTo,
  cancel = cancelIntakeBatch,
  session = sessionTokenAccessor,
}: {
  batchId: string;
  label: string;
  /** How many children the read believes are still running. A number, never a percentage. */
  liveChildren: number;
  /** Members that hold no Work yet and are still arriving or still being extracted. FIX ROUND 1,
   *  ADV-636-01: without it this dialog said "0 operations are still running" for a batch stopped
   *  during ingest, which is the exact moment a hundred-file batch is most likely to be stopped. */
  pendingMembers: number;
  onOpenChange: (open: boolean) => void;
  /** Re-read the batch after ANY completed attempt, refusal included — hydrate-never-trust. */
  onCancelled: () => void;
  returnFocusTo?: RefObject<HTMLButtonElement | null>;
  cancel?: typeof cancelIntakeBatch;
  session?: SessionTokenAccessor;
}) {
  const t = useTranslations("IntakeBatch");
  const decision = useDecisionKey();
  const [pending, setPending] = useState(false);
  const [refusal, setRefusal] = useState<{ code: string | null; message: string } | null>(null);

  const close = useCallback(() => {
    decision.renew(); // a new press is a NEW decision
    onOpenChange(false);
    returnFocusTo?.current?.focus();
  }, [decision, onOpenChange, returnFocusTo]);

  const confirm = useCallback(async () => {
    setPending(true);
    setRefusal(null);
    try {
      await cancel(batchId, decision.key(), { session });
      onCancelled();
      close();
    } catch (err) {
      // The refusal renders VERBATIM and the dialog STAYS OPEN — the draft is preserved.
      if (isDoorRefusal(err)) setRefusal({ code: err.code ?? null, message: err.message });
      else setRefusal({ code: null, message: err instanceof Error ? err.message : String(err) });
      onCancelled(); // hydrate-never-trust: re-read even after a refusal
    } finally {
      setPending(false);
    }
  }, [batchId, cancel, close, decision, onCancelled, session]);

  return (
    <Dialog open onOpenChange={(open) => { if (!open) close(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("cancel.title", { label })}</DialogTitle>
          <DialogDescription>{t("cancel.body", { n: liveChildren })}</DialogDescription>
        </DialogHeader>
        {pendingMembers > 0 ? (
          <p className="text-muted-foreground text-sm" data-testid="intake-batch-cancel-pending">
            {t("cancel.stillArriving", { n: pendingMembers })}
          </p>
        ) : null}
        <p className="text-muted-foreground text-sm">{t("cancel.receiptsKept")}</p>
        {refusal ? (
          <StateBanner tone="error" title={t("cancel.refusedTitle")}>
            <p>{refusal.message}</p>
            {refusal.code ? <p className="mt-1 text-xs">{refusal.code}</p> : null}
          </StateBanner>
        ) : null}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={close} disabled={pending}>
            {t("cancel.dismiss")}
          </Button>
          <Button type="button" onClick={() => void confirm()} disabled={pending}>
            {pending ? t("cancel.pending") : t("cancel.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
