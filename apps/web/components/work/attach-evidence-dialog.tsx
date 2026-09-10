"use client";

// #634 — LATE ATTACHMENT: naming the source document behind an entry that is
// ALREADY POSTED.
//
// WHY THIS IS SAFE BESIDE LAW 6. It records a fact BESIDE the entry, never on
// it. `clara.attach_entry_evidence` writes one `clara.entry_evidence_links` row
// and touches no column of `clara.journal_entries` — measured, in migration
// 0182's header: `clara._tf_entry_immutable` admits exactly
// {reversed_by, reversal_reason, updated_at} on an approved -> approved UPDATE,
// so a posted entry cannot be rewritten and this door does not try. No amount
// moves, no date, no account, not even the revision token.
//
// A DIALOG AND NOT A ROUTE, and Appendix D is the reason: this IS "a focused,
// bounded form or decision that can complete without losing page context" — one
// choice from a list, one confirm. The journal BASIS is the opposite (a table of
// money with a durable draft) and lives on its own address.
//
// THE CHOICE SURVIVES A REFUSAL. Every refusal arm below leaves the picked
// document picked and the dialog open, because the next act is almost always
// "look at that, then choose again" — closing the dialog would throw away the
// one piece of state the human just produced.
//
// AND THE OP KEY SURVIVES AN UNOBSERVED OUTCOME. `unavailable` means nobody can
// say whether the door ran, so the retry must ride the SAME key and let
// `clara._reserve_op` answer — see `confirm` below for the whole rule.

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";

import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/common/native-select";
import { StateBanner } from "@/components/common/state";
import { journalEntryHref } from "@/lib/navigation/tree";
import {
  attachEntryEvidence,
  findEntryForDocument,
  listClientEvidenceDocuments,
  type AttachEvidenceResult,
  type EvidenceDocument,
} from "@/lib/work/evidence";
import { sessionTokenAccessor } from "@/lib/session-accessor";
import type { SessionTokenAccessor } from "@/lib/session";

/** One option, as a single readable string. Kept identical in SHAPE to the
 *  composer's own label (filename · kind · date) so the same document reads the
 *  same way wherever it is chosen. */
function optionLabel(doc: EvidenceDocument, t: (key: string, values?: Record<string, string>) => string): string {
  const name = doc.filename ?? t("evidence.unnamed");
  const kind = doc.kind ?? t("evidence.unknownKind");
  const date = (doc.financialDate ?? doc.filedAt).slice(0, 10);
  return t("evidence.option", { name, kind, date });
}

export function AttachEvidenceDialog({
  clientId,
  entryId,
  /** The entry's `revision_token` AS THE CALLER LAST READ IT. The door refuses
   *  CLR06 when it is no longer the current row — a staleness gate, not a
   *  version bump: a posted entry's token never moves (see this file's header). */
  expectedRevision,
  /** Re-read after ANY completed attempt, success or refusal — hydrate-never-
   *  trust: this component paints nothing it was not told by a fresh read. */
  onAttached,
  attach = attachEntryEvidence,
  loadDocuments,
  findEntry = findEntryForDocument,
  session = sessionTokenAccessor,
}: {
  clientId: string;
  entryId: string;
  expectedRevision: string;
  onAttached: () => void | Promise<void>;
  attach?: typeof attachEntryEvidence;
  loadDocuments?: () => Promise<EvidenceDocument[]>;
  findEntry?: typeof findEntryForDocument;
  session?: SessionTokenAccessor;
}) {
  const t = useTranslations("ManualJournal");
  const [open, setOpen] = useState(false);
  const [documents, setDocuments] = useState<EvidenceDocument[] | null>(null);
  /** THREE STATES, NOT TWO. `documents === null` is "not read yet",
   *  `documents === []` is "this client has none", and this flag is "we could
   *  not read them". Collapsing the third into the second (which an earlier cut
   *  did) made a failed read say *this client has no filed documents* — a claim
   *  about the client's records that the browser is in no position to make. */
  const [documentsUnavailable, setDocumentsUnavailable] = useState(false);
  const [documentId, setDocumentId] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AttachEvidenceResult | null>(null);
  /** The entry that already stands on the chosen document, resolved FROM THE
   *  ROWS after a source conflict — a governed refusal carries only its
   *  `detail.reason` to a browser (lib/wire.ts), so the id is re-read rather
   *  than invented. Null means "we could not find one", and then no link is
   *  offered at all. */
  const [conflictEntry, setConflictEntry] = useState<string | null>(null);
  /** ONE op key per PRESS, minted when the dialog opens and re-minted after any
   *  completed attempt: two clicks on one decision must not attach twice, and a
   *  genuine second decision must not be swallowed as a duplicate of the first. */
  const opKey = useRef<string>("");
  const selectRef = useRef<HTMLSelectElement | null>(null);

  // INITIAL FOCUS ON THE ONE CONTROL, not on the close button: the whole dialog
  // is a single choice, and landing on the chooser is the shortest keyboard path
  // to making it. An effect rather than a prop because this build's Dialog is
  // the Base UI primitive, whose content has no open-autofocus hook — and the
  // ref is only attached once the content has mounted, which is the render this
  // effect runs after. (Escape, the backdrop and focus RETURN to the trigger are
  // the primitive's own; nothing here overrides them.)
  useEffect(() => {
    if (open) selectRef.current?.focus();
  }, [open]);

  // THE LIST IS READ WHEN THE DIALOG OPENS, not on mount: a page that shows this
  // trigger beside every posted entry must not issue one documents read per row.
  useEffect(() => {
    if (!open) return;
    let live = true;
    opKey.current = crypto.randomUUID();
    void (loadDocuments ? loadDocuments() : listClientEvidenceDocuments(clientId, { session }))
      .then((rows) => {
        if (!live) return;
        setDocuments(rows);
        setDocumentsUnavailable(false);
      })
      .catch(() => {
        // AN UNREADABLE LIST IS A NAMED STATE, never a dialog that hangs on a
        // spinner and never the sentence "this client has no filed documents" —
        // the composer's own documents arm is the model.
        if (!live) return;
        setDocuments([]);
        setDocumentsUnavailable(true);
      });
    return () => {
      live = false;
    };
  }, [open, clientId, loadDocuments, session]);

  const confirm = async () => {
    if (busy || documentId === "") return;
    setBusy(true);
    setConflictEntry(null);
    const answer = await attach(
      { entryId, documentId, expectedRevision, opKey: opKey.current },
      { session },
    );
    setResult(answer);
    setBusy(false);
    // A NEW KEY FOR THE NEXT DECISION — BUT ONLY AFTER A SETTLED OUTCOME. The old
    // key names an answer the database has STORED (an attachment, or a typed
    // refusal it reserved and finished), so reusing it would replay that answer
    // instead of doing the new thing the human is about to ask for.
    //
    // `unavailable` IS NOT A SETTLED OUTCOME. Nothing was observed: the request
    // may have reached the door and written the link, and the response may
    // simply have been lost. Rotating the key there is the one move that turns a
    // safe retry into a SECOND act — §3's lost-response rule ("same operation
    // identity for retries; a NEW intent gets a new identity") says the retry
    // must replay under the SAME key, so `clara._reserve_op` answers with
    // `operation_in_flight` or with the original result rather than attaching
    // again under a fresh identity.
    if (answer.kind !== "unavailable") opKey.current = crypto.randomUUID();
    if (answer.kind === "source_conflict") {
      setConflictEntry(await findEntry(clientId, documentId, { session }).catch(() => null));
    }
    // ALWAYS re-read, refusal included: a stale-revision refusal in particular
    // means the caller's copy of the entry is wrong, and the fix is a fresh read.
    await onAttached();
    if (answer.kind === "attached") {
      setOpen(false);
      setResult(null);
      setDocumentId("");
    }
  };

  const list = documents ?? [];

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        // Closing discards the transient refusal but KEEPS the chosen document,
        // so re-opening after looking at the conflicting entry does not make a
        // human find their file again.
        if (!next) setResult(null);
      }}
    >
      {/* The house `render` prop, not `asChild`: this build's Dialog is the
          Base UI primitive (components/ui/dialog.tsx), and every other door
          dialog in the estate opens the same way. */}
      <DialogTrigger render={<Button variant="outline" size="sm" />}>{t("attach.trigger")}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("attach.title")}</DialogTitle>
          <DialogDescription>{t("attach.description")}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          <Label htmlFor="attach-evidence-document">{t("attach.document")}</Label>
          <NativeSelect
            id="attach-evidence-document"
            ref={selectRef}
            className="w-full"
            value={documentId}
            disabled={busy}
            aria-invalid={result !== null && result.kind !== "attached" ? true : undefined}
            onChange={(e) => {
              setDocumentId(e.target.value);
              // A refusal about the previous choice is retired by making a new
              // one — leaving it up would describe a state that has passed.
              setResult(null);
              setConflictEntry(null);
            }}
          >
            <option value="">{t("attach.choose")}</option>
            {list.map((doc) => (
              <option key={doc.documentId} value={doc.documentId}>
                {optionLabel(doc, t)}
              </option>
            ))}
          </NativeSelect>
          {documentsUnavailable ? (
            <StateBanner tone="warning">{t("attach.documentsUnavailable")}</StateBanner>
          ) : documents !== null && list.length === 0 ? (
            <p className="text-xs text-muted-foreground">{t("attach.noDocuments")}</p>
          ) : null}
          <AttachOutcome clientId={clientId} conflictEntry={conflictEntry} result={result} />
        </div>
        <DialogFooter>
          <DialogClose render={<Button variant="ghost" disabled={busy} />}>{t("attach.cancel")}</DialogClose>
          <Button type="button" size="sm" disabled={busy || documentId === ""} onClick={() => void confirm()}>
            {busy ? t("attach.submitting") : t("attach.submit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Every refusal arm, INLINE and persistent — never a toast, and never a generic
 *  red bar: each one names the concrete constraint and the one next action that
 *  exists for it. */
function AttachOutcome({
  clientId,
  conflictEntry,
  result,
}: {
  clientId: string;
  conflictEntry: string | null;
  result: AttachEvidenceResult | null;
}) {
  const t = useTranslations("ManualJournal");
  if (result === null) return null;
  if (result.kind === "attached") {
    return (
      // `info`, not a success colour: the estate's banner ladder has four tones
      // and none of them is "success" — a completed act is reported as a state,
      // and the durable proof is the re-read row below, not this line.
      <StateBanner tone="info">
        {result.alreadyAttached ? t("attach.alreadyAttached") : t("attach.attached")}
      </StateBanner>
    );
  }
  if (result.kind === "source_conflict") {
    return (
      <StateBanner
        tone="error"
        action={
          conflictEntry === null ? undefined : (
            <Link
              href={journalEntryHref(clientId, conflictEntry)}
              className="text-sm font-medium text-primary underline underline-offset-2"
            >
              {t("attach.sourceConflictLink")}
            </Link>
          )
        }
      >
        {t("attach.sourceConflict")}
      </StateBanner>
    );
  }
  // A SWITCH RATHER THAN AN EIGHT-DEEP TERNARY, and the keys stay LITERAL inside
  // it: `scripts/check-message-keys.mjs` reads `t("…")` call sites to decide
  // which keys are used, so a table lookup would make every message here look
  // unused and the gate would delete copy the product renders.
  const body = ((): string => {
    switch (result.kind) {
      case "invalid_document": return t("attach.invalid");
      case "evidence_already_attached": return t("attach.evidenceAlreadyAttached");
      case "entry_not_approved": return t("attach.notApproved");
      case "entry_reversed": return t("attach.entryReversed");
      case "stale": return t("attach.stale");
      case "denied": return t("attach.denied");
      case "not_found": return t("attach.notFound");
      case "refused": return t("attach.refused");
      default: return t("attach.unavailable");
    }
  })();
  return (
    <StateBanner
      tone={result.kind === "denied" ? "warning" : "error"}
      code={result.kind === "refused" ? (result.code ?? undefined) : undefined}
    >
      {body}
    </StateBanner>
  );
}
