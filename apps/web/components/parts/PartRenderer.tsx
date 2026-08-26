import type { ClaraPart } from "../../lib/parts/types";
import { isStatusResolverType } from "../../lib/parts/catalog";
import { Badge } from "./PartBadge";
import { PartSummaryCard, type SummaryRow } from "./PartSummaryCard";

// The fail-closed part renderer (contract §3.1 / frontend-handoff-2026-08-23 §3.1,
// apps/dashboard/app/chat/parts.tsx's TranscriptParts precedent). MECHANISM ported,
// not the look: every one of the catalog's 18 live types renders SOMETHING visible
// (or the declared-nothing resolver case); an unrecognised kind renders the visible
// fallback chip below, never nothing — text-to-hydration, never text-to-code.
//
// P3 does the rich card UIs (live DB hydration per type via lib/parts/hooks.ts +
// the specific read fn each part names). This module ships the mechanism plus
// honest basic rendering: text/clarify/refusal/attachment render their own real
// content; every identifier-only receipt-shaped type gets a labeled summary card of
// its ids (PartSummaryCard.tsx) — never a fabricated figure, never a fabricated
// status.

/** Mirrors apps/dashboard/app/chat/parts.tsx's FALLBACK_UNSUPPORTED_PREFIX
 *  byte-for-byte. The parity test (../../lib/parts/catalog.test.tsx) asserts every
 *  registered render type never reaches this. */
export const FALLBACK_UNSUPPORTED_PREFIX = "Unsupported part: ";

// ONE source of truth (fix-round finding 6): SummaryPartType is DERIVED from the
// array, not hand-duplicated alongside it — the two could otherwise drift (a type
// listing a member the array omits, or vice versa) with nothing to catch it.
const SUMMARY_TYPES = [
  "je_review", "doc_review", "diff", "sweep_receipt", "open_question",
  "bank_recon_receipt", "fixed_asset", "depreciation_run_receipt",
  "adjustment_run_receipt", "staff_advance",
] as const;

type SummaryPartType = (typeof SUMMARY_TYPES)[number];

function isSummaryPart(t: ClaraPart["type"]): t is SummaryPartType {
  return (SUMMARY_TYPES as readonly string[]).includes(t);
}

/** Every identifier-only receipt-shaped part's {title, rows, note} — one function,
 *  one exhaustive switch, so a 10-branch JSX repetition doesn't have to exist. */
function summaryOf(part: Extract<ClaraPart, { type: SummaryPartType }>): { title: string; rows: SummaryRow[]; note?: string | null } {
  switch (part.type) {
    case "je_review":
      return {
        title: "Journal entry review",
        rows: [["entry", part.entry_id], ["document", part.document_id], ["client", part.client_id], ["provenance", part.provenance_tier]],
        note: part.exception ? "An amount exception is flagged on this draft." : part.uncertainty?.note,
      };
    case "doc_review":
      return { title: "Document review", rows: [["document", part.document_id], ["entry", part.entry_id], ["client", part.client_id]] };
    case "diff":
      return { title: "Entry diff", rows: [["entry", part.entry_id], ["client", part.client_id]] };
    case "sweep_receipt":
      return { title: "Auto-draft sweep receipt", rows: [["run", part.run_id]] };
    case "open_question":
      return { title: "Open question", rows: [["question", part.question_id], ["client", part.client_id]] };
    case "bank_recon_receipt":
      return { title: "Bank reconciliation receipt", rows: [["statement", part.statement_id], ["client", part.client_id]] };
    case "fixed_asset":
      return { title: "Fixed asset", rows: [["asset", part.asset_id], ["client", part.client_id], ["label", part.label]] };
    case "depreciation_run_receipt":
      return { title: "Depreciation run receipt", rows: [["run", part.run_id], ["client", part.client_id], ["label", part.label]] };
    case "adjustment_run_receipt":
      return { title: "Adjustment run receipt", rows: [["run", part.run_id], ["client", part.client_id], ["label", part.label]] };
    case "staff_advance":
      return { title: "Staff advance", rows: [["advance", part.advance_id], ["client", part.client_id], ["label", part.label]] };
  }
}

export function PartRenderer({ part }: { part: ClaraPart }) {
  if (part.type === "text") {
    return part.text.trim() ? <p className="max-w-prose text-sm text-foreground">{part.text}</p> : null;
  }

  if (part.type === "attachment") {
    // Real rendering (not the generic receipt-summary shape): mirrors
    // apps/dashboard/app/chat/parts.tsx's attachment chip — icon + ids. No filename
    // enrichment (that lookup is chat-page wiring, a later lane's job); honest
    // ids-only is still a real, non-generic render.
    return (
      <div className="flex flex-col gap-1 rounded-lg border border-border bg-card p-3 text-sm">
        <div className="flex items-center gap-2">
          <span aria-hidden>📎</span>
          <span className="font-medium text-card-foreground">Attached document</span>
        </div>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
          <dt className="text-muted-foreground">document</dt>
          <dd className="truncate text-card-foreground">{part.document_id}</dd>
          <dt className="text-muted-foreground">intake</dt>
          <dd className="truncate text-card-foreground">{part.intake_id}</dd>
        </dl>
      </div>
    );
  }

  if (part.type === "tool_call") {
    // A standalone renderer has no view of sibling tool_result/tool_error parts, so
    // it names the tool honestly without inventing a running/ok/error status — the
    // chat-list composition that resolves that status (mirroring
    // apps/dashboard/app/chat/parts.tsx's toolStatuses) is a later lane's wiring.
    return <Badge tone="neutral">{part.tool}</Badge>;
  }

  if (part.type === "clarify") {
    return (
      <div className="flex flex-col gap-1 rounded-lg border border-border bg-card p-3 text-sm">
        <Badge tone="info">Visible to your firm</Badge>
        <p className="text-card-foreground">{part.question}</p>
        {part.context ? <p className="text-xs text-muted-foreground">{part.context}</p> : null}
        <p className="text-xs text-muted-foreground">{part.framing}</p>
      </div>
    );
  }

  if (part.type === "clarify_closed") {
    return (
      <div className="flex flex-col gap-1 rounded-lg border border-border bg-card p-3 text-sm">
        <Badge tone="info">Visible to your firm</Badge>
        <p className="text-card-foreground">
          Clarify {part.reason}. {part.framing}
        </p>
      </div>
    );
  }

  if (part.type === "refusal") {
    // The deliberate no-hydrate exception (contract §3.2): a governed refusal
    // renders its code + message VERBATIM — there is no draft left to hydrate, and
    // the copy is never re-worded (apps/dashboard/app/chat/parts.tsx:209-218).
    return (
      <div className="flex flex-col gap-1 rounded-lg border border-error/30 bg-error-muted p-3 text-sm">
        <Badge tone="error">
          {part.code}
          {part.reason ? ` · ${part.reason}` : ""}
        </Badge>
        <p className="text-error">{part.message}</p>
      </div>
    );
  }

  if (isSummaryPart(part.type)) {
    const { title, rows, note } = summaryOf(part as Extract<ClaraPart, { type: SummaryPartType }>);
    return <PartSummaryCard title={title} rows={rows} note={note} />;
  }

  // tool_result / tool_error resolve their call's chip — render nothing (the one
  // place this is declared is the catalog's STATUS_RESOLVER_TYPES).
  if (isStatusResolverType(part.type)) return null;

  // Explicit fallback: an unknown/unsupported part type is made VISIBLE, never
  // silently dropped. The catalog's AllCovered/NoExtra guard keeps this branch
  // unreachable for any type in the live ClaraPart union at compile time; it exists
  // for a wire payload that does not typecheck against that union at all (a stale
  // client, a future server, or malformed data).
  const unknown = part as { type?: unknown };
  return (
    <span className="inline-flex items-center rounded-full border border-warning/40 bg-warning-muted px-2 py-0.5 text-xs font-medium text-warning">
      {FALLBACK_UNSUPPORTED_PREFIX}
      {typeof unknown.type === "string" ? unknown.type : "?"}
    </span>
  );
}
