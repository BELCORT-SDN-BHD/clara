// Honest lifecycle copy for the client Documents workbench — every string names a
// REAL DB-owned state, never invents one. EVERY function here returns a next-intl
// KEY (or a small data shape a component resolves into keys), never English text
// (STYLE law; independent review 2026-08-27 N12) — the `t()` call always happens at
// the component boundary, mirroring components/command/command-palette.tsx's own
// `tGoRoutes(route.id)` dynamic-key precedent. `isEInvoice` ports the exact inline
// logic apps/dashboard/app/documents/page.tsx:71-73 and DocumentDetail.tsx:23-26/103
// use (never re-derived); the rest are this tab's own additions over the same
// DocumentRow/FilingRow/CandidateRow shapes.

import type { CandidateRow, DocumentRow, ExtractionStatus, FilingRow } from "./types";
import type { WireErrorKind } from "@/lib/wire-error-kind";
import type { QueueItem } from "./useUploadQueue";

/** e_invoice_xml (and any XML MIME, or a document already flagged stored_unparsed)
 *  is stored but never parsed — apps/dashboard/app/documents/page.tsx:71/
 *  DocumentDetail.tsx:23-26, ported verbatim. Pure boolean, no copy involved. */
export function isEInvoice(doc: Pick<DocumentRow, "extraction_status" | "document_kind" | "mime_type">): boolean {
  return doc.extraction_status === "stored_unparsed"
    || doc.document_kind === "e_invoice_xml"
    || (doc.mime_type ?? "").toLowerCase().includes("xml");
}

/** Key namespace "extractionStatus.*" — every `ExtractionStatus` value, including
 *  `held_egress` (reads "awaiting egress approval" everywhere else in the estate,
 *  apps/dashboard/app/shared/intake.ts's processingStatusCopy — same MEANING, a
 *  SEPARATE key namespace from `taskStatus.*` since the two are independently-
 *  evolving DB enums that only coincidentally share this one value name). */
export function extractionStatusKey(status: ExtractionStatus): string {
  return `extractionStatus.${status}`;
}

/** Key namespace "filingBasis.*" — `document_filings.basis`, every value DB-named,
 *  'judgement' included (the F-A7 agent-lane wake filing; packages/db/migrations/
 *  0125_f_a7_alpha2_judgement_recut.sql:167-170, absent from apps/dashboard's own
 *  copy since it predates that widening). legacy-0007/seed-0007 share one key
 *  deliberately (apps/dashboard never distinguishes them in its own copy either). */
export function filingBasisKey(basis: FilingRow["basis"]): string {
  switch (basis) {
    case "human": return "filingBasis.human";
    case "rule": return "filingBasis.rule";
    case "judgement": return "filingBasis.judgement";
    case "correction": return "filingBasis.correction";
    case "legacy-0007":
    case "seed-0007":
      return "filingBasis.legacyImport";
  }
}

/** Key namespace "candidateRuleBand.*" — apps/dashboard/app/documents/
 *  DocumentDetail.tsx:18-21's RULE_BAND, keyed instead of rendered: a candidate's
 *  confidence renders as a named band, never a percentage (S5-D2). */
export function candidateRuleBandKey(ruleKind: CandidateRow["rule_kind"]): string {
  switch (ruleKind) {
    case "name_exact": return "candidateRuleBand.name_exact";
    case "alias_exact": return "candidateRuleBand.alias_exact";
  }
}

/** Key namespace "readError.*" — distinct, honest copy per `WireErrorKind`
 *  (read.ts's `ReadError.kind` / doors.ts's `DoorError.kind` / runtime-wire.ts's
 *  `RuntimeError.kind` — the SAME taxonomy, wire-error-kind.ts). `no_session` /
 *  `forbidden` / `not_found` each get their OWN key (the 404 = "not reachable
 *  today" precedent, reportsApi) — never one shared "something went wrong" bucket.
 *  Read directly off `.kind`, never derived from message text ("spelling is not
 *  identity" — AGENTS.md). */
export function readErrorKey(kind: WireErrorKind): string {
  return `readError.${kind}`;
}

/** The next-intl KEY for a queue item's PRIMARY label, given its structured
 *  `state`/`failureCode`/`errorPhase` — every non-"error" state names a real
 *  DB-owned or hook-owned status; "error"/"failed" carry no key (the caller
 *  renders `item.error`/`failureCode` verbatim alongside, never in place of, this
 *  chrome phrase). */
export function queueStateLabelKey(item: Pick<QueueItem, "state" | "errorPhase">): string {
  switch (item.state) {
    case "queued": return "queueQueued";
    case "starting": return "queueStarting";
    case "uploading": return "queueUploading";
    case "verifying": return "queueVerifying";
    case "filing": return "queueFiling";
    case "ready": return "queueReady";
    case "failed": return "queueFailed";
    case "error":
      switch (item.errorPhase) {
        case "filing": return "queueErrorFiling";
        case "timeout": return "queueErrorTimeout";
        case "upload":
        default:
          return "queueErrorUpload";
      }
  }
}

/** The recovery-refused chrome phrase's KEY, given the DB's discriminant reason —
 *  the same four cases apps/dashboard/app/shared/intake.ts's `recoveryCopy` (never
 *  re-derived here, this only maps to a KEY instead of English text) switches on,
 *  plus an honest default for any other reason the DB might send. `null` means no
 *  recovery was attempted (the ordinary case) — the caller renders nothing extra. */
export function queueRecoveryLabelKey(reason: string | null): string | null {
  if (reason === null) return null;
  switch (reason) {
    case "mime_mismatch": return "queueRecoveryMimeMismatch";
    case "attempt_cap": return "queueRecoveryAttemptCap";
    case "lane_busy": return "queueRecoveryLaneBusy";
    default: return "queueRecoveryNotRetried";
  }
}

/** A document's metadata badges as STRUCTURED entries — document-metadata.tsx
 *  resolves each into a `t()` call (two-step for `extraction`, whose own status
 *  key is translated first, then interpolated — "extraction: {status}"). Only
 *  `documentKind` interpolates a raw value directly: `document_kind` is itself a
 *  DB-owned enum string (e.g. "invoice"), not chrome prose — same treatment as
 *  `filingBasisKey`/`candidateRuleBandKey` leaving THEIR enum inputs untranslated,
 *  just without even a wrapping key since there is no fixed enumeration of kinds
 *  worth a full key set (DOCUMENT_KINDS already has 20 members). */
export type DocumentBadge =
  | { kind: "extraction"; statusKey: string }
  | { kind: "pageCount"; count: number }
  | { kind: "documentKind"; value: string }
  | { kind: "financialDate"; date: string }
  | { kind: "retention"; state: string; until: string | null }
  | { kind: "legalHold" }
  | { kind: "eInvoice" };

export function documentBadges(doc: DocumentRow): DocumentBadge[] {
  const badges: DocumentBadge[] = [{ kind: "extraction", statusKey: extractionStatusKey(doc.extraction_status) }];
  if (doc.page_count !== null) badges.push({ kind: "pageCount", count: doc.page_count });
  if (doc.document_kind) badges.push({ kind: "documentKind", value: doc.document_kind });
  if (doc.financial_date) badges.push({ kind: "financialDate", date: doc.financial_date });
  badges.push({ kind: "retention", state: doc.retention_state, until: doc.retain_until });
  if (doc.legal_hold) badges.push({ kind: "legalHold" });
  if (isEInvoice(doc)) badges.push({ kind: "eInvoice" });
  return badges;
}
