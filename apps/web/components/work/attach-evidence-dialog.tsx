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
  listSpokenForDocuments,
  mergeSpokenFor,
  type AttachEvidenceResult,
  type DocumentClaim,
  type EvidenceDocument,
  type SpokenForDocumentRow,
} from "@/lib/work/evidence";
import { sessionTokenAccessor } from "@/lib/session-accessor";
import type { SessionTokenAccessor } from "@/lib/session";
import { landmarkHeadingFor, nextPaint, restoreFocusAfterRow } from "@/components/firm/work-question-affordance";
import { SpokenForNotes } from "@/components/work/spoken-for-note";

/** The claimant read that upgrades a source-conflict refusal with a link and a name is bounded,
 *  because the refusal is already painted and nothing a person waits for depends on it (delta
 *  review round 3, finding [3]). Same budget as the composer's own. */
const CLAIMANT_READ_TIMEOUT_MS = 5000;

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
  loadSpokenFor,
  findEntry = findEntryForDocument,
  session = sessionTokenAccessor,
}: {
  clientId: string;
  entryId: string;
  expectedRevision: string;
  onAttached: () => void | Promise<void>;
  attach?: typeof attachEntryEvidence;
  loadDocuments?: () => Promise<EvidenceDocument[]>;
  /** #728 finding 5 — injectable for the same reason `loadDocuments` is: a node cell has no
   *  session to read `clara.list_spoken_for_documents` through. */
  loadSpokenFor?: () => Promise<SpokenForDocumentRow[]>;
  findEntry?: typeof findEntryForDocument;
  session?: SessionTokenAccessor;
}) {
  const t = useTranslations("ManualJournal");
  const tWalk = useTranslations("WalkFindings728");
  const [open, setOpen] = useState(false);
  const [documents, setDocuments] = useState<EvidenceDocument[] | null>(null);
  /** THREE STATES, NOT TWO. `documents === null` is "not read yet",
   *  `documents === []` is "this client has none", and this flag is "we could
   *  not read them". Collapsing the third into the second (which an earlier cut
   *  did) made a failed read say *this client has no filed documents* — a claim
   *  about the client's records that the browser is in no position to make. */
  const [documentsUnavailable, setDocumentsUnavailable] = useState(false);
  /** #728 finding 5 — `null` before the first settled read (never rendered as a
   *  claim either way), an array on a successful read (possibly empty), and the
   *  UNAVAILABLE flag below on a failed one — `mergeSpokenFor` reads `null` as
   *  "could not check", never as "nothing is spoken for" (see that function's
   *  own note in lib/work/evidence.ts). */
  const [spokenFor, setSpokenFor] = useState<SpokenForDocumentRow[] | null>(null);
  const [spokenForUnavailable, setSpokenForUnavailable] = useState(false);
  const [documentId, setDocumentId] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AttachEvidenceResult | null>(null);
  /** The entry that already stands on the chosen document AND THE CLIENT WHOSE
   *  IT IS, resolved FROM THE ROWS after a source conflict — a governed refusal
   *  carries only its `detail.reason` to a browser (lib/wire.ts), so this is
   *  re-read rather than invented. The claimant may be a SIBLING client of the
   *  same firm (the evidence invariant is firm-wide, `findEntryForDocument`'s
   *  own note), and the link must target THEIR journal: the asking client's
   *  never contains the entry. Null means "we could not find one", and then no
   *  link is offered at all. */
  const [conflictEntry, setConflictEntry] = useState<DocumentClaim | null>(null);
  /** ONE op key per PRESS, minted when the dialog opens and re-minted after any
   *  completed attempt: two clicks on one decision must not attach twice, and a
   *  genuine second decision must not be swallowed as a duplicate of the first. */
  const opKey = useRef<string>("");
  const selectRef = useRef<HTMLSelectElement | null>(null);
  /** The Attach button, and whether the dialog is STILL OPEN — both read by the post-refusal focus
   *  guard in `confirm` below, which runs after two awaits and therefore cannot trust the `open`
   *  its closure captured. */
  const confirmRef = useRef<HTMLButtonElement | null>(null);
  const openRef = useRef(false);
  openRef.current = open;
  /** #728 finding 3 — a container OUTSIDE the portalled `DialogContent` (Base UI
   *  portals open dialog content to `document.body`), so `landmarkHeadingFor`'s
   *  `closest("section")` walk lands on the REAL page section this dialog is
   *  rendered inside of (`work-detail.tsx`'s own "What was recorded" section),
   *  not on a detached subtree. Captured the instant the dialog opens a
   *  successful attempt — see `confirm` below for why that timing matters. */
  const containerRef = useRef<HTMLDivElement | null>(null);

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

  // #728 finding 5 — the SAME "read when the dialog opens" discipline as the document list, and
  // a SEPARATE effect (not folded into the one above) so a failure on ONE read never masquerades
  // as a failure on the other: `documentsUnavailable` and `spokenForUnavailable` are two different
  // claims about two different reads.
  useEffect(() => {
    if (!open) return;
    let live = true;
    void (loadSpokenFor ? loadSpokenFor() : listSpokenForDocuments(clientId, { session }))
      .then((rows) => {
        if (!live) return;
        setSpokenFor(rows);
        setSpokenForUnavailable(false);
      })
      .catch(() => {
        if (!live) return;
        // null, NEVER []: an empty array here would read as "nothing is spoken for", which
        // `mergeSpokenFor` would take literally. See that function's own note.
        setSpokenFor(null);
        setSpokenForUnavailable(true);
      });
    return () => {
      live = false;
    };
  }, [open, clientId, loadSpokenFor, session]);

  /**
   * THE CLAIMANT, RESOLVED AFTER THE REFUSAL IS ALREADY ON SCREEN.
   *
   * An effect rather than an await inside `confirm` (delta review round 4, SHOULD-FIX [6]): the
   * refusal, the re-enabled controls AND the focus recovery must not wait on a read whose only
   * product is a link and a name. The composer answered the identical finding this way one round
   * earlier (components/accounting/journal-composer.tsx); the dialog was left bounded-but-blocking.
   *
   * Bounded three ways, like the composer's: an `AbortSignal` the cleanup fires when the refusal
   * is replaced or the dialog unmounts, a timeout that fires it anyway, and a re-check that the
   * same document is still the one refused before the answer is written — the person may have
   * chosen another while the read was in flight.
   */
  const conflictDocumentId = result?.kind === "source_conflict" ? documentId : null;
  useEffect(() => {
    if (conflictDocumentId === null) return;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), CLAIMANT_READ_TIMEOUT_MS);
    void (async () => {
      // FIRM-WIDE, not client-scoped: see findEntryForDocument's note. The claim this refusal is
      // about may be held by a sibling client the document is also filed to.
      const claim = await findEntry(conflictDocumentId, { session, signal: controller.signal })
        .catch(() => null);
      if (controller.signal.aborted || claim === null) return;
      setConflictEntry(claim);
    })();
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [conflictDocumentId, findEntry, session]);

  const confirm = async () => {
    if (busy || documentId === "") return;
    setBusy(true);
    setConflictEntry(null);
    // #728 finding 3 — captured BEFORE the write: a successful attach removes this WHOLE
    // affordance from work-detail.tsx's tree (the entry now carries a source, so the section's
    // own conditional stops rendering it), so the trigger that opened this dialog is about to
    // unmount along with everything inside it, `containerRef.current` included. The section
    // heading above ("What was recorded") is the stable landmark #629 established for exactly
    // this situation (components/firm/work-question-affordance.tsx) — read while this subtree is
    // still in the document, because afterwards there is nothing left to walk up from.
    const landmark = landmarkHeadingFor(containerRef.current);
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
    // THE REFUSAL'S FOCUS RECOVERY RUNS FIRST — before the re-read, not after it (delta
    // review round 4, the residual behind finding [4]). Moving the advisory claimant read out
    // of the way left one await still in front of this: `onAttached()`, which is authoritative
    // and must always run, but carries no bound at all — so a stalled re-read stranded focus on
    // <body> for EVER, worse than the five seconds the review measured. Nothing about where a
    // person stands inside this dialog depends on the entry behind it: the refusal's one next
    // act is to choose another document, right here. The composer focuses its evidence control
    // in the same tick it sets the phase (journal-composer.tsx `apply`); this is the parity.
    if (answer.kind !== "attached") {
      // #728 finding 3, review round (N8) — A REFUSAL STRANDS FOCUS unless this fires. `busy`
      // disables the select, Cancel AND Attach for the duration of the write, so the Attach button
      // focus was on is disabled UNDER the person's cursor and the browser drops focus to <body>;
      // re-enabling the controls afterwards does not bring it back. Focus goes to the ONE control
      // this refusal asks them to change — not to the refusal banner, which AttachOutcome renders
      // through StateBanner, where an error tone computes role="alert" (components/common/state.tsx)
      // and is therefore announced on its own.
      //
      // GUARDED, NOT UNCONDITIONAL (delta review of the fix round, finding [5]). `busy` does NOT
      // disable everything: DialogContent renders its own close X with no disabled prop, and
      // Escape and the backdrop are never gated, so the dismiss controls stay live through the
      // write. If the person dismissed the dialog — or simply tabbed to that X — moving focus here
      // would YANK it out of where they put it, and on a dialog closing through its exit animation
      // it would land on <body> when the popup unmounts: the very defect N8 closed. So this moves
      // focus only when focus is NOWHERE (the disabled-Attach case it exists for) and the dialog
      // is still open. The sibling fix in this round guards the same way
      // (components/firm/activity/activity-feed.tsx).
      await nextPaint();
      const active = document.activeElement;
      // STRANDED = focus is not on an interactive control that someone could have put it on.
      // MEASURED, three ways this happens and none of them is a deliberate placement: a real
      // browser drops focus to <body> when the focused Attach button is disabled under the
      // cursor; Base UI's focus manager pulls it onto the popup DIV instead when the dialog is
      // open (what this app's own harness records); and some browsers leave it on the Attach
      // button itself once it re-enables. The complement is the case the guard exists for
      // (delta review [5]): `busy` does NOT disable everything — DialogContent renders its own
      // close X with no disabled prop, and Escape and the backdrop are never gated — so anyone
      // who tabbed to a live BUTTON/A/INPUT keeps it, and a dismissed dialog (openRef) is never
      // focused into as it animates out.
      const tag = (active as { tagName?: string } | null)?.tagName ?? "";
      const onALiveControl = tag === "BUTTON" || tag === "A" || tag === "INPUT"
        || tag === "SELECT" || tag === "TEXTAREA";
      const stranded = !onALiveControl || active === confirmRef.current;
      if (openRef.current && stranded) selectRef.current?.focus();
    }
    // ALWAYS re-read, refusal included: a stale-revision refusal in particular
    // means the caller's copy of the entry is wrong, and the fix is a fresh read.
    await onAttached();
    // THE CLAIMANT IS NOT READ HERE AT ALL (delta review round 4, SHOULD-FIX [6] / NIT [4]).
    // Round 3 put it last-and-bounded, which fixed nothing a person feels: it still sat IN FRONT
    // of the focus recovery above, so a PostgREST worker that accepts the connection and stalls
    // left a keyboard or screen-reader user inside an open modal with focus on <body> for the full
    // five seconds — and longer, because `getRows` awaits `session.getAccessToken()` BEFORE the
    // signal ever reaches the wire (lib/read.ts), so a stalled token refresh is outside the
    // timeout altogether. The claimant is resolved by the effect above instead, exactly as the
    // composer does it: nothing on screen, and nothing about where focus sits, waits for a read
    // this file's own comment calls an upgrade that "must cost a link, not the dialog".
    if (answer.kind === "attached") {
      setOpen(false);
      setResult(null);
      setDocumentId("");
      // #728 finding 3 — `nextPaint` (the SAME timing #629's own row-focus fix uses) is awaited
      // before moving focus, because the reload above resolves one tick before React actually
      // commits this affordance's removal — focusing before that commit would target a node the
      // browser is about to detach, reproducing the exact defect this fix exists to close.
      // `restoreFocusAfterRow(null, landmark)` is `null` for the trigger deliberately: this
      // affordance is now known to be gone (the condition that rendered it just became false), so
      // there is no trigger left to check — the call always lands on the landmark.
      await nextPaint();
      restoreFocusAfterRow(null, landmark);
    }
  };

  // `spokenFor` is already `null` both before the first read settles and after a failed one
  // (the catch above never sets `[]`), so it needs no extra branching here — see mergeSpokenFor's
  // own note for why `null` must never be conflated with "read succeeded, found nothing".
  const list = mergeSpokenFor(documents ?? [], spokenFor);

  return (
    // #728 finding 3 — see containerRef's own comment: this wrapper is what `landmarkHeadingFor`
    // walks up from, and it must sit OUTSIDE the portalled DialogContent to land on the real page.
    <div ref={containerRef}>
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
              // #728 finding 5 — DISABLED, never hidden: hiding an option is a claim this
              // advisory read cannot make with certainty (lib/work/evidence.ts's own note on
              // `mergeSpokenFor`). A native `<option disabled>` is announced by every assistive
              // technology as unselectable on its own, and THE REASON RIDES THE LABEL (review
              // round, N9) so C08.6 holds without colour and without a paragraph per document.
              // The link to the conflicting entry belongs to the SELECTED document alone, below.
              <option key={doc.documentId} value={doc.documentId} disabled={doc.spokenFor !== null}>
                {optionLabel(doc, t)}
                {doc.spokenFor !== null ? ` — ${tWalk("evidenceSpokenForOption")}` : ""}
              </option>
            ))}
          </NativeSelect>
          {documentsUnavailable ? (
            <StateBanner tone="warning">{t("attach.documentsUnavailable")}</StateBanner>
          ) : documents !== null && list.length === 0 ? (
            <p className="text-xs text-muted-foreground">{t("attach.noDocuments")}</p>
          ) : null}
          {spokenForUnavailable ? (
            <p className="text-xs text-muted-foreground">{tWalk("evidenceSpokenForUnavailable")}</p>
          ) : null}
          <SpokenForNotes clientId={clientId} options={list} selectedDocumentId={documentId} />
          <AttachOutcome clientId={clientId} conflictEntry={conflictEntry} result={result} />
        </div>
        <DialogFooter>
          <DialogClose render={<Button variant="ghost" disabled={busy} />}>{t("attach.cancel")}</DialogClose>
          <Button type="button" size="sm" ref={confirmRef} disabled={busy || documentId === ""} onClick={() => void confirm()}>
            {busy ? t("attach.submitting") : t("attach.submit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </div>
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
  /** The client whose entry is being attached to — the comparison that decides whether the
   *  refusal has to say WHOSE entry already holds the document (delta review round 3, [5]). */
  clientId: string;
  conflictEntry: DocumentClaim | null;
  result: AttachEvidenceResult | null;
}) {
  const t = useTranslations("ManualJournal");
  const tWalk = useTranslations("WalkFindings728");
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
    // WHEN THE CLAIMANT IS A SIBLING CLIENT, SAY SO BEFORE OFFERING THE DOOR OUT (delta review
    // round 3, finding [5]): the link leaves this client's books, and the advisory surface for the
    // identical fact already names the claimant (`spoken-for-note.tsx`). Same fallback as there.
    //
    // …AND SAY IT OUTSIDE THE LIVE REGION (delta review round 4, finding [7], the same defect the
    // composer carried). `StateBanner tone="error"` computes `role="alert"` — assertive, and
    // implicitly atomic, so ANY mutation re-announces the whole box. The claimant here always
    // arrives after the paint, so writing its sentence and its <Link> into that box announced one
    // refusal twice, the second time contradicting the first about where the link goes. The alert
    // carries the refusal and nothing else; the claimant line and its link are a plain sibling
    // with no role — unannounced, never hidden (components/common/state.tsx's `silent` note).
    const elsewhere = conflictEntry !== null && conflictEntry.clientId !== clientId;
    return (
      <div className="flex w-full max-w-prose flex-col items-start gap-1.5">
        <StateBanner tone="error">{t("attach.sourceConflict")}</StateBanner>
        {conflictEntry === null ? null : (
          <p className="text-sm text-muted-foreground">
            {elsewhere ? (
              <>
                {tWalk("attachSourceConflictElsewhere", {
                  client: conflictEntry.clientName ?? tWalk("evidenceSpokenForUnnamedClient"),
                })}
                {" "}
              </>
            ) : null}
            <Link
              // THE CLAIMANT'S ROUTE, never the asking client's — see conflictEntry's own note.
              href={journalEntryHref(conflictEntry.clientId, conflictEntry.entryId)}
              className="text-sm font-medium text-primary underline underline-offset-2"
            >
              {t("attach.sourceConflictLink")}
            </Link>
          </p>
        )}
      </div>
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
