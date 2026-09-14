"use client";

// #624 — FOUR INDEPENDENT, NAMED STATES, and an honest capability sentence beneath them.
//
// WHAT WAS WRONG. The detail panel's only signal was `extraction: {status}` — one badge over
// `documents.extraction_status`, which describes the LAST processing task to settle. A payroll
// PDF whose OCR finished read "extraction: done"; a professional reasonably concluded Clara had
// understood the document, when in truth the facts router had terminated the pair with
// `skipped_kind` at filing time and would never derive anything from it. That is a placeholder
// success, and the ticket's fourth acceptance criterion is precisely that it stop.
//
// THE SHAPE. Four rows, each with its OWN heading, its OWN single-word state, and its own short
// sentence. They are siblings, never a ladder: a document can be custody-verified, extraction-
// failed, facts-none and operation-not-applicable all at once, and each of those is separately
// true. The capability sentence sits beneath them because it explains the ROOM the four states
// move in — what Clara could do with this (format, kind) at all — and it comes verbatim from
// `clara.document_capabilities.basis`, which is a sentence a professional can argue with.
//
// NO NEW PRIMITIVE. Badge, Table, Separator and the state.tsx ladder are already production
// (appendix D rows 7, 57, 50) and state.tsx's own Loading/Empty ladder covers the read states.
// Nothing here reaches for Alert, Empty or Toast, none of which is installed, and nothing invents
// a colour-only cue: every state is a WORD first, with tone as reinforcement (appendix D's
// "Color cannot be the only status cue").
//
// WHY IT IS ITS OWN HYDRATED CELL rather than a field of `loadDocumentDetail`'s bundle: it reads
// ONE governed RPC that resolves its own scope and can legitimately answer null (a document
// filed to another client). Folding it into the bundle would make that honest null look like a
// failed detail read, and would couple a states refresh to five unrelated relation reads.

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { SectionHeader } from "@/components/common/section-header";
import { EmptyState, LoadingState } from "@/components/common/state";
import { useHydratedPart } from "@/lib/parts/hooks";
import { sessionTokenAccessor } from "@/lib/session-accessor";
import type { SessionTokenAccessor } from "@/lib/session";
import { getDocumentState } from "@/lib/documents/reads";
import { activityJournalsHref } from "@/lib/firm/activity";
import { businessDateTime } from "@/lib/business-date";
import {
  capabilityLimits, custodyVerdict, extractionTone, extractionVerdict, factsTone, factsVerdict,
  failingChecks, landedFactsExtractions, operationVerdict, unmeasuredChecks,
  type DocumentStateResult, type StateTone,
} from "@/lib/documents/document-state";
import { DoorFeedback } from "./door-feedback";

/** Wraps the read's own `DocumentStateResult | null` in a non-null container so
 *  `useHydratedPart`'s `data` can tell "not yet loaded" from "loaded, and the DB legitimately
 *  admitted nothing" — the same shape `DocumentExtractPanel`'s `ExtractLoad` uses, and for the
 *  identical reason. */
type StateLoad = { result: DocumentStateResult | null };

/** A CHECKED key lookup with no dynamic-key cast. `document-facts-table.tsx`'s own header
 *  explains why a `t(\`x.${value}\`)` cast is forbidden here: a missing translation renders the
 *  key itself, and a state row that printed `factsState.invalid` at a professional would be
 *  worse than printing nothing. Every arm below is a literal. */
const CUSTODY_KEY = {
  held: "stateCustody.held",
  verified: "stateCustody.verified",
  stored: "stateCustody.stored",
} as const;

const EXTRACTION_KEY = {
  not_attempted: "stateExtraction.notAttempted",
  pending: "stateExtraction.pending",
  running: "stateExtraction.running",
  done: "stateExtraction.done",
  failed: "stateExtraction.failed",
  stored_unparsed: "stateExtraction.storedUnparsed",
} as const;

const FACTS_KEY = {
  unsupported_kind: "stateFacts.unsupportedKind",
  unsupported_format: "stateFacts.unsupportedFormat",
  pending: "stateFacts.pending",
  none: "stateFacts.none",
  partial: "stateFacts.partial",
  validated: "stateFacts.validated",
  invalid: "stateFacts.invalid",
} as const;

const OPERATION_KEY = {
  not_applicable: "stateOperation.notApplicable",
  uncoded: "stateOperation.uncoded",
  coded: "stateOperation.coded",
  posted: "stateOperation.posted",
  reconciled: "stateOperation.reconciled",
} as const;

const CHECK_KEY: Record<string, string> = {
  "invoice.six_term_identity": "checkName.invoiceSixTermIdentity",
  "statement.chain_closes": "checkName.statementChainCloses",
  "statement.printed_totals": "checkName.statementPrintedTotals",
};

const LIMIT_KEY: Record<string, string> = {
  invoice_line_items: "capabilityLimit.invoiceLineItems",
  opening_balance: "capabilityLimit.openingBalance",
  reader: "capabilityLimit.reader",
  router: "capabilityLimit.router",
};

type Translate = (key: string, params?: Record<string, string | number>) => string;

/** The tone each state word wears. Tokens only — the same semantic roles state.tsx's banner
 *  ladder uses — and never the ONLY cue: the WORD carries the meaning and the tint reinforces it
 *  (appendix D's "Color cannot be the only status cue"). */
const TONE_CLASS: Record<StateTone, string> = {
  neutral: "border-border text-muted-foreground",
  info: "border-info/40 text-info",
  warning: "border-warning/40 text-warning",
  error: "border-error/40 text-error",
};

/** One state row: an axis label, ONE state word, and a sentence.
 *
 *  `role="group"` with an explicit `aria-label` of "<axis>: <state>" is what makes the four
 *  states ANNOUNCED BY NAME (appendix C §4's keyboard/announcement requirement) rather than read
 *  as eight adjacent text fragments a listener has to re-pair. It is deliberately NOT a live
 *  region: the detail pane already owns this document's announcement boundary, and four live
 *  regions here would speak the same document four times on every reload (§5's
 *  one-announcement-owner rule). */
function StateRow({
  label, state, tone, children,
}: {
  label: string;
  state: string;
  tone: StateTone;
  children?: ReactNode;
}) {
  return (
    <div role="group" aria-label={`${label}: ${state}`} className="flex flex-col gap-1">
      <div className="flex flex-wrap items-baseline gap-2">
        <span aria-hidden className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
        <Badge aria-hidden variant="outline" className={cn("text-sm font-medium", TONE_CLASS[tone])}>
          {state}
        </Badge>
      </div>
      {children ? <div className="text-xs text-muted-foreground">{children}</div> : null}
    </div>
  );
}

/** `session` IS INJECTABLE and defaults to the app-wide accessor. The Documents workbench mounts
 *  this panel under the global one, exactly as before; #624 AC4's second half mounts the SAME
 *  panel inside Work detail's Sources tab, and that page threads an explicit `SessionTokenAccessor`
 *  through every child it owns (`work-detail.tsx`'s `session` prop) so a cell can drive the page
 *  with no ambient state. A child reaching past that prop for a module-level global would have
 *  been the one read on the page that could not be driven. */
export function DocumentStatePanel({
  documentId, clientId, session = sessionTokenAccessor,
}: { documentId: string; clientId: string; session?: SessionTokenAccessor }) {
  const t = useTranslations("ClientDocuments");
  const { data, loading, err, clr } = useHydratedPart<StateLoad>(
    session,
    async () => ({ result: await getDocumentState(documentId, clientId, { session }) }),
  );

  return (
    <section className="flex flex-col gap-2" aria-label={t("statesHeading")}>
      <SectionHeader level={4}>{t("statesHeading")}</SectionHeader>
      {loading && !data ? <LoadingState>{t("statesLoading")}</LoadingState> : null}
      {data && data.result === null ? <EmptyState>{t("statesNotAvailable")}</EmptyState> : null}
      {data && data.result !== null ? <StateBody state={data.result} clientId={clientId} t={t} /> : null}
      <DoorFeedback err={err} clr={clr} />
    </section>
  );
}

function StateBody({ state, clientId, t }: { state: DocumentStateResult; clientId: string; t: Translate }) {
  const custody = custodyVerdict(state);
  const extraction = extractionVerdict(state);
  const facts = factsVerdict(state);
  const operation = operationVerdict(state);
  const landed = landedFactsExtractions(state);
  const failing = failingChecks(state);
  const unmeasured = unmeasuredChecks(state);
  const limits = capabilityLimits(state.capability);

  const checkLabel = (name: string) => {
    const key = CHECK_KEY[name];
    // The honest unknown arm, exactly as document-facts-table.tsx does it: a check this app has
    // never seen renders as its own raw name rather than an invented one.
    return key ? t(key) : name;
  };

  return (
    <div className="flex flex-col gap-3">
      <StateRow label={t("stateCustodyLabel")} state={t(CUSTODY_KEY[custody])} tone="neutral">
        {state.custody.legal_hold && state.custody.legal_hold_reason
          ? t("stateCustodyHoldReason", { reason: state.custody.legal_hold_reason })
          : t("stateCustodyDetail", {
            sha: state.custody.sha256.slice(0, 12),
            retention: state.custody.retention_state,
          })}
      </StateRow>

      <StateRow
        label={t("stateExtractionLabel")}
        state={t(EXTRACTION_KEY[extraction])}
        tone={extractionTone(extraction)}
      >
        {state.byte_extraction.tasks.length === 0 ? (
          t("stateExtractionNoTasks")
        ) : (
          <ul className="flex flex-col gap-0.5">
            {state.byte_extraction.tasks.map((task) => (
              <li key={task.id} className="flex flex-wrap items-baseline gap-x-2">
                <span className="font-medium text-foreground">{task.lane}</span>
                <span>{task.status}</span>
                {/* The ENGINE that ran, verbatim. A professional auditing an extraction needs to
                    know which engine produced the reading; a lane name alone does not say. */}
                <span className="wrap-anywhere">{task.engine_id ?? t("stateEngineUnknown")}</span>
                {task.error_code ? <span className="text-error">{task.error_code}</span> : null}
              </li>
            ))}
          </ul>
        )}
      </StateRow>

      <StateRow label={t("stateFactsLabel")} state={t(FACTS_KEY[facts])} tone={factsTone(facts)}>
        <div className="flex flex-col gap-1">
          {/* THE SOURCE VERSION BESIDE EVERY FACT BLOCK (#624 acceptance 2). A fact without the
              extraction version and engine it came from cannot be argued with. */}
          {landed.length > 0 ? (
            <ul className="flex flex-col gap-0.5">
              {landed.map((e) => (
                <li key={e.id} className="flex flex-wrap items-baseline gap-x-2">
                  <span className="font-medium text-foreground">{e.engine_kind}</span>
                  <span>{t("stateFactsVersion", { version: e.version_n ?? 0, regions: e.region_count })}</span>
                  <span className="wrap-anywhere">{e.engine_id ?? t("stateEngineUnknown")}</span>
                  {/* SOURCE FRESHNESS (H-23). A named population without its freshness is the
                      ambiguous unencoded count H-23 exists to replace: "7 regions" says nothing
                      about WHEN they were read, and a professional comparing a document against
                      the books needs to know whether this reading predates the last correction.
                      `businessDateTime` rather than the viewer's locale, for the audit-trail
                      reason lib/business-date.ts's own header records. */}
                  {e.extracted_at
                    ? <span>{t("stateFactsReadAt", { at: businessDateTime(e.extracted_at) })}</span>
                    : <span>{t("stateFactsReadAtUnknown")}</span>}
                </li>
              ))}
            </ul>
          ) : null}

          {/* THE FAILING CHECK IS NAMED. "invalid" with no name is an accusation, not a finding;
              the facts themselves stay readable in the evidence table below either way. */}
          {failing.length > 0 ? (
            <p className="text-error">
              {t("stateFactsFailedChecks", { checks: failing.map((v) => checkLabel(v.check_name)).join(", ") })}
            </p>
          ) : null}
          {unmeasured.length > 0 ? (
            <p>{t("stateFactsUnmeasuredChecks", { checks: unmeasured.map((v) => checkLabel(v.check_name)).join(", ") })}</p>
          ) : null}
          {state.facts.validations.length === 0 && landed.length > 0 ? <p>{t("stateFactsNoChecks")}</p> : null}
        </div>
      </StateRow>

      <StateRow
        label={t("stateOperationLabel")}
        state={t(OPERATION_KEY[operation])}
        tone="neutral"
      >
        {operation === "not_applicable" ? t("stateOperationNotApplicableDetail") : (
          <div className="flex flex-col gap-0.5">
            <p>{t("stateOperationDetail", {
              entries: state.operation.entries.length,
              statements: state.operation.statements.length,
            })}</p>
            {/* THE POSTED ENTRY IS A LINK, not a count (the recipe's "posted entry link").
                A count tells a professional that something was booked; only the link lets them
                go and read it. Built through `activityJournalsHref`, the ONE builder for every
                journal-entry destination in this app, so this surface does not invent a second
                spelling of `?entry=`. */}
            {state.operation.entries.map((e) => (
              <a
                key={e.entry_id}
                href={activityJournalsHref(clientId, e.entry_id)}
                className="w-fit underline underline-offset-2 hover:no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {t("stateOperationEntryLink", { status: e.status })}
              </a>
            ))}
          </div>
        )}
      </StateRow>

      {/* THE CAPABILITY SENTENCE. Verbatim from the registry, never assembled here — it is the
          one place a professional can read WHY the four states above are what they are, and it
          carries the registry version so a later answer can be told from this one. */}
      <div className="flex flex-col gap-1 border-t border-border pt-2">
        <p className="text-xs text-muted-foreground">
          <Badge variant="outline" className="mr-2">
            {t("capabilityRegistryVersion", { version: state.capability.registry_version ?? 0 })}
          </Badge>
          {state.capability.basis}
        </p>
        {limits.length > 0 ? (
          <ul className="flex flex-col gap-0.5 text-xs text-muted-foreground">
            {limits.map(([name, level]) => (
              <li key={name}>
                {LIMIT_KEY[name] ? t(LIMIT_KEY[name], { level }) : t("capabilityLimitUnknown", { name, level })}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
