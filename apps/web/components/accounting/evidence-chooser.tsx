"use client";

// #634/#728/#643 — THE SOURCE-DOCUMENT CHOOSER, and the two reads behind it, as ONE component
// both accounting-work admission forms mount.
//
// WHY IT IS A COMPONENT AT ALL. It was inline JSX inside `journal-composer.tsx` until #643 needed
// the same control on a second door (`periodic-adjustment-form.tsx`): the brief's web line asks
// that form to reuse "`JournalBasisFields`, THE EVIDENCE CHOOSER, `lib/work/journal-draft.ts`'s
// intent key and the composer's lost-response arm". Reuse of a chooser that exists only as fifty
// lines of one form's render body is a copy, and a copy is two places for the spoken-for rule, the
// disabled-option rule and the degradation rules to drift. So the block moved HERE, byte for byte,
// and the composer now mounts it — one control, one set of ids, one vocabulary of refusals.
//
// WHAT DID NOT MOVE WITH IT, deliberately. The `source_conflict` PHASE — the banner, the link into
// the claimant's books, the claimant read with its AbortSignal — stays in the composer. That is
// not the chooser's job: the chooser offers documents and reports a choice; what a door says about
// that choice, and what the next action is, belongs to the form that owns the door. This component
// takes `invalid` and `errorText` and paints them; it decides nothing.
//
// ONE CONTROL, ONE ELEMENT ID, AND IT IS THE BASIS VOCABULARY'S. The id is
// `fieldElementId("evidence")` on BOTH forms, because `evidence` is a `JournalFieldId` and
// `fieldForServerPath` already maps the wire's `source_refs[N]` / `sourceRefs[N]` onto it — so a
// refusal naming the evidence lands on this control whichever door raised it, with no second
// mapper. (`periodic-adjustment-form.tsx`'s own `AdjustmentFormFieldId` is the union that carries
// it, and its posting-date/memo controls already use the same namespace.)
//
// A NATIVE <select> RATHER THAN A COMBOBOX. Appendix D asks for the simplest control that carries
// the job: this list is a client's filed documents (tens, not thousands), a native select is
// typeable, works at 320 px and at 200 % zoom, needs no portal and no focus trap, and it is the
// one control every assistive technology already knows.

import { useTranslations } from "next-intl";

import { fieldElementId, type FieldNode } from "@/components/accounting/journal-basis-fields";
import { SpokenForNotes } from "@/components/work/spoken-for-note";
import { StateBanner } from "@/components/common/state";
import { NativeSelect } from "@/components/common/native-select";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useAsyncRead } from "@/lib/firm/use-async-read";
import {
  listClientEvidenceDocuments,
  listSpokenForDocuments,
  mergeSpokenFor,
  type EvidenceDocument,
  type EvidenceOption,
  type SpokenForDocumentRow,
} from "@/lib/work/evidence";
import type { SessionTokenAccessor } from "@/lib/session";

/** Everything the chooser needs, and everything a FORM needs about the same two reads. Returned as
 *  one object so a caller cannot hold half of it: the composer's `source_conflict` arm reads
 *  `spokenFor` (the raw advisory rows) to name the claimant without a second round trip, and the
 *  chooser reads `options` (the merge) to disable what is already spoken for. */
export type EvidenceReads = {
  /** The client's filed, byte-verified documents, each annotated with the entry that already backs
   *  it, or `null`. Empty while either read is in flight — never a guess. */
  options: EvidenceOption[];
  /** The ADVISORY rows as the door answered them, or `null` when that read failed. `null` and `[]`
   *  are different facts: see `mergeSpokenFor`'s own note. */
  spokenFor: SpokenForDocumentRow[] | null;
  /** The documents read's OWN failure — a preparer who wanted no document is not blocked by it. */
  documentsFailed: boolean;
  /** The spoken-for read's own, separately: "we could not check" is never "nothing is spoken for". */
  spokenForFailed: boolean;
  reloadDocuments: () => void;
};

/**
 * The two reads, with the estate's degradation posture already applied.
 *
 * EACH FAILS ON ITS OWN. The documents read failing degrades the form to "no document" rather than
 * to a dead form — the admission door re-checks the document against the client's live filings
 * regardless. The spoken-for read failing disables nothing — the door's own conflict refusal is
 * what actually protects the entry, and "we could not check" must never silently read as "nothing
 * is spoken for".
 *
 * BOTH LOADERS ARE INJECTABLE for the same reason the chart's is: a cell must be able to drive the
 * chooser without a network.
 */
export function useEvidenceReads(
  clientId: string,
  opts: {
    session?: SessionTokenAccessor;
    loadDocuments?: () => Promise<EvidenceDocument[]>;
    loadSpokenFor?: () => Promise<SpokenForDocumentRow[]>;
  } = {},
): EvidenceReads {
  const { session, loadDocuments, loadSpokenFor } = opts;
  const documentsRead = useAsyncRead<EvidenceDocument[]>(() =>
    loadDocuments ? loadDocuments() : listClientEvidenceDocuments(clientId, { session }),
  );
  const spokenForRead = useAsyncRead<SpokenForDocumentRow[]>(() =>
    loadSpokenFor ? loadSpokenFor() : listSpokenForDocuments(clientId, { session }),
  );
  const spokenFor = spokenForRead.error !== null ? null : spokenForRead.data;
  return {
    options: mergeSpokenFor(documentsRead.data ?? [], spokenFor),
    spokenFor,
    documentsFailed: documentsRead.error !== null,
    spokenForFailed: spokenForRead.error !== null,
    reloadDocuments: () => void documentsRead.reload(),
  };
}

/**
 * #634 — EVIDENCE, AND IT IS OPTIONAL.
 *
 * The raw balanced JV stays an EXPERT PATH: an entry may be recorded with no document at all, and
 * this section says so in words rather than leaving a preparer to infer it from an empty control.
 * "No document" is the DEFAULT OPTION and is selectable on purpose — a chooser whose empty state is
 * only the absence of a choice cannot be re-chosen with the keyboard once something has been
 * picked.
 */
export function EvidenceChooser({
  clientId,
  reads,
  value,
  onChange,
  disabled,
  invalid,
  errorText,
  registerField,
}: {
  clientId: string;
  reads: EvidenceReads;
  /** The chosen document, or `null` for "no document" — which is a CHOICE, not a missing value. */
  value: string | null;
  /** The new choice, `null` when the empty option is picked. A form that is showing a refusal ABOUT
   *  the old choice retires it here: leaving the banner up beside a document that is no longer
   *  selected would be the form describing a state that has passed. */
  onChange: (documentId: string | null) => void;
  disabled: boolean;
  invalid: boolean;
  /** This render's message for the control, or "" — never a truthy placeholder. */
  errorText: string;
  registerField: (node: FieldNode | null) => void;
}) {
  /** #634's own copy lives in its own namespace (`ManualJournal`) rather than being folded into
   *  `JournalComposer` — the manual-JV journey spans this form, the Work detail's late attachment
   *  and the journals table, and one namespace for one journey keeps those three surfaces' words
   *  together. #643's second door reuses the SAME words: it is the same control asking the same
   *  question, and a second spelling of "Source document" would be a second concept. */
  const tm = useTranslations("ManualJournal");
  const t = useTranslations("JournalComposer");
  /** #728's own copy (findings 1-5, this journey's evidence picker included). */
  const tWalk = useTranslations("WalkFindings728");
  const id = fieldElementId("evidence");

  return (
    <div className="flex flex-col gap-1.5">
      {/* A REAL `<label for>`, not a `<legend>`. MEASURED, on #634's own browser walk: a
          `<fieldset>`/`<legend>` around ONE control gives the group a name and leaves the
          `<select>` itself nameless — axe-core's `select-name` rule is critical about exactly that,
          and a screen reader landing on the control would hear no name at all. */}
      <Label htmlFor={id}>{tm("evidence.legend")}</Label>
      <p id={`${id}-help`} className="text-xs text-muted-foreground">
        {tm("evidence.help")}
      </p>
      {/* `NativeSelect`, NOT a hand-rolled `<select>`: the account picker on every line and the
          late-attachment dialog both use it, and it is what carries the house focus ring, the
          disabled treatment and the `aria-invalid` border. A bare element here looked almost right
          and showed the browser's default focus outline instead of the product's. */}
      <NativeSelect
        id={id}
        ref={(node) => registerField(node)}
        className="w-full"
        value={value ?? ""}
        disabled={disabled}
        aria-invalid={invalid ? true : undefined}
        aria-describedby={`${id}-help ${id}-error`}
        onChange={(e) => onChange(e.target.value === "" ? null : e.target.value)}
      >
        <option value="">{tm("evidence.none")}</option>
        {reads.options.map((doc) => (
          // #728 finding 5 — DISABLED, never hidden: see lib/work/evidence.ts's own note on
          // `mergeSpokenFor` for why a document already backing a posted entry stays in the list
          // rather than being filtered out. THE REASON RIDES THE LABEL (review round, N9): it is
          // the one place a browsing person reads, it is announced with the option, and it costs no
          // extra node per document — which the paragraph-per-document it replaced did. The link to
          // the conflicting entry belongs to the SELECTED document alone, below.
          <option key={doc.documentId} value={doc.documentId} disabled={doc.spokenFor !== null}>
            {evidenceOptionLabel(doc, tm)}
            {doc.spokenFor !== null ? ` — ${tWalk("evidenceSpokenForOption")}` : ""}
          </option>
        ))}
      </NativeSelect>
      <p id={`${id}-error`} className="text-xs text-error" role="alert">
        {errorText}
      </p>
      {/* The documents read degrades ON ITS OWN, exactly as the chart read does: no document is a
          valid answer, so a failed list must not stop a submit. */}
      {reads.documentsFailed ? (
        <StateBanner
          tone="warning"
          action={
            <Button type="button" variant="outline" size="sm" onClick={() => reads.reloadDocuments()}>
              {t("retry")}
            </Button>
          }
        >
          {tm("evidence.unavailable")}
        </StateBanner>
      ) : null}
      {reads.spokenForFailed ? (
        <p className="text-xs text-muted-foreground">{tWalk("evidenceSpokenForUnavailable")}</p>
      ) : null}
      <SpokenForNotes clientId={clientId} options={reads.options} selectedDocumentId={value ?? ""} />
    </div>
  );
}

/** One document, as a single readable option: its filename, what KIND of document it is, and the
 *  date it belongs to. Built here rather than in the read so the words are translated and the shape
 *  stays a plain string — a native `<option>` renders text, not markup, and a screen reader reads
 *  exactly what is written here. */
function evidenceOptionLabel(
  doc: EvidenceDocument,
  t: (key: string, values?: Record<string, string>) => string,
): string {
  const name = doc.filename ?? t("evidence.unnamed");
  const kind = doc.kind ?? t("evidence.unknownKind");
  // The document's own business date when it has one; otherwise the day it was filed to this
  // client. Sliced to the calendar day rather than re-formatted: this journey is about EXACT dates,
  // and a locale re-render here would be a second date format beside the posting-date control's ISO
  // one.
  const date = (doc.financialDate ?? doc.filedAt).slice(0, 10);
  return t("evidence.option", { name, kind, date });
}
