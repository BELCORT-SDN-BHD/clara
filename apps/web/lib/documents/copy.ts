// Honest lifecycle copy for the client Documents workbench — every string names a
// REAL DB-owned state, never invents one. `extractionStatusCopy`/`isEInvoice` port
// the exact inline logic apps/dashboard/app/documents/page.tsx:71-73 and
// DocumentDetail.tsx:23-26/103 use (never re-derived, never re-worded); the rest are
// this tab's own additions over the same DocumentRow/FilingRow/CandidateRow shapes.

import type { CandidateRow, DocumentRow, ExtractionStatus, FilingRow } from "./types";
import type { WireErrorKind } from "@/lib/wire-error-kind";
import type { QueueItem } from "./useUploadQueue";

/** `held_egress` reads "awaiting egress approval" everywhere else in the estate
 *  (apps/dashboard/app/shared/intake.ts's processingStatusCopy); every other status
 *  is DB-named and rendered verbatim. */
export function extractionStatusCopy(status: ExtractionStatus): string {
  return status === "held_egress" ? "awaiting egress approval" : status;
}

/** e_invoice_xml (and any XML MIME, or a document already flagged stored_unparsed)
 *  is stored but never parsed — apps/dashboard/app/documents/page.tsx:71/
 *  DocumentDetail.tsx:23-26, ported verbatim. */
export function isEInvoice(doc: Pick<DocumentRow, "extraction_status" | "document_kind" | "mime_type">): boolean {
  return doc.extraction_status === "stored_unparsed"
    || doc.document_kind === "e_invoice_xml"
    || (doc.mime_type ?? "").toLowerCase().includes("xml");
}

/** `document_filings.basis` — every value DB-named, 'judgement' included (the
 *  F-A7 agent-lane wake filing; packages/db/migrations/
 *  0125_f_a7_alpha2_judgement_recut.sql:167-170, absent from apps/dashboard's own
 *  copy since it predates that widening). */
export function filingBasisCopy(basis: FilingRow["basis"]): string {
  switch (basis) {
    case "human": return "filed by a human";
    case "rule": return "filed by a matching rule";
    case "judgement": return "filed under agent judgement";
    case "correction": return "filed via a wrong-client correction";
    case "legacy-0007":
    case "seed-0007":
      return "filed (legacy import)";
  }
}

/** apps/dashboard/app/documents/DocumentDetail.tsx:18-21's RULE_BAND, verbatim —
 *  a candidate's confidence renders as a named band, never a percentage (S5-D2). */
export function candidateRuleBandCopy(ruleKind: CandidateRow["rule_kind"]): string {
  switch (ruleKind) {
    case "name_exact": return "exact registered-name match";
    case "alias_exact": return "exact alias match";
  }
}

/** Distinct, honest copy per `WireErrorKind` (read.ts's `ReadError.kind` / doors.ts's
 *  `DoorError.kind` — the SAME taxonomy, wire-error-kind.ts). `no_session` /
 *  `forbidden` / `not_found` each render their OWN sentence (the 404 = "not
 *  reachable today" precedent, reportsApi) — never one shared "something went
 *  wrong" bucket. Read directly off `.kind`, never derived from message text
 *  ("spelling is not identity" — AGENTS.md). */
export function readErrorCopy(kind: WireErrorKind): string {
  switch (kind) {
    case "no_session": return "You're not signed in — sign in to see this.";
    case "unauthenticated": return "Your session has expired — sign in again to see this.";
    case "forbidden": return "You don't have access to this.";
    case "not_found": return "This isn't reachable today.";
    case "server_error": return "The server had a problem reading this — try again shortly.";
    case "transport": return "Couldn't reach the server — check your connection.";
    case "malformed": return "Got an unreadable response from the server.";
    case "unexpected": return "Something unexpected happened reading this.";
  }
}

/** The next-intl KEY (never English text — components/documents/upload-panel.tsx's
 *  own job is the `t()` call) for a queue item's PRIMARY label, given its
 *  structured `state`/`failureCode`/`errorPhase` — every non-"error" state names a
 *  real DB-owned or hook-owned status; "error"/"failed" carry no key (the caller
 *  renders `item.error`/`failureCode` verbatim alongside, never in place of, this
 *  chrome phrase). Dynamic-key dispatch mirrors components/command/command-
 *  palette.tsx's own `tGoRoutes(route.id)` precedent. */
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

/** The badges document-detail.tsx renders for one document's metadata — a plain
 *  data shape so the copy stays independently testable from the JSX that reads it. */
export function documentBadges(doc: DocumentRow): string[] {
  const badges: string[] = [`extraction: ${extractionStatusCopy(doc.extraction_status)}`];
  if (doc.page_count !== null) badges.push(`${doc.page_count} pages`);
  if (doc.document_kind) badges.push(doc.document_kind);
  if (doc.financial_date) badges.push(`date ${doc.financial_date}`);
  badges.push(`retention: ${doc.retention_state}${doc.retain_until ? ` → ${doc.retain_until}` : ""}`);
  if (doc.legal_hold) badges.push("legal hold");
  if (isEInvoice(doc)) badges.push("e-invoice — stored, not parsed");
  return badges;
}
