// The carry-down workbench domain model (LANE D3; settled plan §1 F9/F10/F12 + §3.2).
// PURE — zero network, zero React. Every figure a surface renders is a DB-owned cents
// value from a 0017 envelope (get_opening_dryrun, opening_items/journal_entries reads);
// this module NEVER computes a financial number. It holds the DB row shapes, defensive
// mappers, the dry-run + ceremony DISPLAY view-models, and the governed-refusal copy.
// The jsonb payload BUILDERS live in ./openingPayloads (they are a convenience the DB
// re-checks, never an authority).

// ---------------------------------------------------------------------------
// DB row shapes (mirror the 0017 tables / fn returns; read verbatim).
// ---------------------------------------------------------------------------

export type SeedState = "open" | "finalized" | "cancelled";

export type OpeningSeedRow = {
  id: string;
  client_id: string;
  plan_id: string;
  as_of: string;
  state: SeedState;
  tie_document_id: string | null;
  tie_document_sha256: string | null;
  batch_n: number;
  finalized_at: string | null;
  created_at: string | null;
};

export type Provenance = "document" | "keyed";

export type OpeningTargetRow = {
  id: string;
  line_key: string;
  account_code: string | null;
  source_label: string;
  debit_cents: number;
  credit_cents: number;
  provenance_kind: Provenance;
  document_id: string | null;
  entered_by: string | null;
};

export type OpeningItemKind =
  | "gl_balance"
  | "ar_open_item"
  | "ap_open_item"
  | "bank_uncleared"
  | "fixed_asset"
  | "equity_net"
  | "obe_plug";

export type OpeningItemRow = {
  id: string;
  item_kind: OpeningItemKind;
  item_key: string;
  entry_id: string;
  state: "active" | "superseded";
  amount_cents: number | null;
  counterparty_id: string | null;
  fixed_asset_id: string | null;
  item_ref: string | null;
  item_date: string | null;
  supersedes_item_id: string | null;
  superseded_by_item: string | null;
};

// The approval-set read: opening draft entries joined to their item label. Every field
// is DB-authored — the revision_token is the AMB-3 concurrency token, never invented.
export type ApprovalSetEntry = {
  entry_id: string;
  revision_token: string;
  maker: string | null; // journal_entries.last_human_editor — the human who drafted/edited
  posting_date: string | null;
  memo: string | null;
  is_reversal: boolean; // journal_entries.reversal_of is not null
  item_kind: OpeningItemKind | null;
  item_key: string | null;
  supersedes_item_id: string | null;
};

// Every amount is `number | null`: the DB owns the figure, so an amount the envelope
// did NOT carry stays null — we never coerce it to 0 (a fabricated 0 would fake a
// tie/off verdict over data the DB never returned). A row with any null amount is
// "unavailable" and its verdict is withheld (F-H6).
export type DryRunDelta = {
  account_code: string;
  target_debit: number | null;
  target_credit: number | null;
  actual_debit: number | null;
  actual_credit: number | null;
  delta_debit: number | null;
  delta_credit: number | null;
};

export type OpeningDryRun = {
  seed_id: string;
  client_id: string;
  as_of: string;
  state: SeedState;
  obe_net_cents: number | null;
  deltas: DryRunDelta[];
  unmapped_labels: Array<{ line_key: string; source_label: string }>;
  missing_must_asks: Array<{ item_key: string; question: string | null }>;
};

// ---------------------------------------------------------------------------
// Defensive mappers (PostgREST/jsonb → typed; unknown shapes degrade, never crash).
// ---------------------------------------------------------------------------

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}
function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

export function toDryRun(raw: unknown): OpeningDryRun | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const seedId = str(o.seed_id);
  const clientId = str(o.client_id);
  if (!seedId || !clientId) return null;
  const deltas = Array.isArray(o.deltas)
    ? o.deltas.map((d): DryRunDelta => {
        const x = (d ?? {}) as Record<string, unknown>;
        return {
          account_code: str(x.account_code) ?? "—",
          target_debit: num(x.target_debit),
          target_credit: num(x.target_credit),
          actual_debit: num(x.actual_debit),
          actual_credit: num(x.actual_credit),
          delta_debit: num(x.delta_debit),
          delta_credit: num(x.delta_credit),
        };
      })
    : [];
  const unmapped = Array.isArray(o.unmapped_labels)
    ? o.unmapped_labels.map((u) => {
        const x = (u ?? {}) as Record<string, unknown>;
        return { line_key: str(x.line_key) ?? "—", source_label: str(x.source_label) ?? "—" };
      })
    : [];
  const missing = Array.isArray(o.missing_must_asks)
    ? o.missing_must_asks.map((m) => {
        const x = (m ?? {}) as Record<string, unknown>;
        return { item_key: str(x.item_key) ?? "—", question: str(x.question) };
      })
    : [];
  return {
    seed_id: seedId,
    client_id: clientId,
    as_of: str(o.as_of) ?? "—",
    state: (str(o.state) as SeedState) ?? "open",
    obe_net_cents: num(o.obe_net_cents),
    deltas,
    unmapped_labels: unmapped,
    missing_must_asks: missing,
  };
}

// ---------------------------------------------------------------------------
// Dry-run view-model (DISPLAY only — tone from the DB delta, no arithmetic).
// ---------------------------------------------------------------------------

export type DeltaTone = "tied" | "off" | "unavailable";

/** A row is UNAVAILABLE when the DB envelope did not carry every figure for it. We never
 *  coerce a missing amount to 0 — a fabricated 0 would fake a tie/off verdict (F-H6). */
export function deltaUnavailable(d: DryRunDelta): boolean {
  return (
    d.target_debit === null || d.target_credit === null ||
    d.actual_debit === null || d.actual_credit === null ||
    d.delta_debit === null || d.delta_credit === null
  );
}

/** A line ties iff both DB-computed deltas are exactly zero; it is UNAVAILABLE when any
 *  figure is missing (verdict withheld). We never recompute the delta — we read its sign
 *  off the DB figures. */
export function deltaTone(d: DryRunDelta): DeltaTone {
  if (deltaUnavailable(d)) return "unavailable";
  return d.delta_debit === 0 && d.delta_credit === 0 ? "tied" : "off";
}

/** True when the DB says opening-balance-equity nets exactly nil (K4/K5 pre-condition). */
export function obeIsNil(dry: OpeningDryRun): boolean {
  return dry.obe_net_cents === 0;
}

/** True when any displayed line is unavailable (a missing DB figure) — the tie verdict
 *  is withheld while this holds. */
export function dryRunHasUnavailable(dry: OpeningDryRun): boolean {
  return dry.deltas.some(deltaUnavailable);
}

/** Whether every displayed line ties AND OBE nets — the DB's approval pre-conditions,
 *  surfaced for the operator. The DB re-asserts this in-txn; this is a preview only.
 *  An unavailable line can never tie (deltaTone !== 'tied'), so this stays false. */
export function dryRunTies(dry: OpeningDryRun): boolean {
  return (
    dry.deltas.length > 0 &&
    dry.deltas.every((d) => deltaTone(d) === "tied") &&
    dry.unmapped_labels.length === 0 &&
    obeIsNil(dry)
  );
}

export type DryRunVerdict = "ties" | "off" | "unavailable";

/** The tie verdict is WITHHELD ('unavailable') when any line is unavailable — we never
 *  claim a tie/off over data the DB did not fully return (F-H6). */
export function dryRunVerdict(dry: OpeningDryRun): DryRunVerdict {
  if (dryRunHasUnavailable(dry)) return "unavailable";
  return dryRunTies(dry) ? "ties" : "off";
}

export type DryRunSummary = {
  lineCount: number;
  offLineCount: number;
  unavailableCount: number;
  unmappedCount: number;
  missingMustAskCount: number;
  ties: boolean;
  verdict: DryRunVerdict;
};

export function dryRunSummary(dry: OpeningDryRun): DryRunSummary {
  return {
    lineCount: dry.deltas.length,
    offLineCount: dry.deltas.filter((d) => deltaTone(d) === "off").length,
    unavailableCount: dry.deltas.filter(deltaUnavailable).length,
    unmappedCount: dry.unmapped_labels.length,
    missingMustAskCount: dry.missing_must_asks.length,
    ties: dryRunTies(dry),
    verdict: dryRunVerdict(dry),
  };
}

// ---------------------------------------------------------------------------
// The K5/K6 approval ceremony model (AMB-3 revision map + ceremony verb pick).
// ---------------------------------------------------------------------------

/** The AMB-3 object map {entry_id: revision_token} approve_opening_seed /
 *  approve_opening_correction consume. Built VERBATIM from the approval-set read —
 *  every draft entry's DB revision token, never a fabricated one. */
export function buildRevisionMap(entries: ApprovalSetEntry[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const e of entries) map[e.entry_id] = e.revision_token;
  return map;
}

export type CeremonyKind = "initial" | "correction" | null;

/** Which finalizing verb applies to the current draft set. A correction set carries
 *  reversal / supersedes entries (approve_opening_correction); an initial or additive
 *  set is plain drafts (approve_opening_seed). Only an OPEN seed with drafts is
 *  approvable. A mixed set is reported so the operator resolves it before finalizing. */
export function ceremonyKind(seedState: SeedState, entries: ApprovalSetEntry[]): CeremonyKind {
  if (seedState !== "open" || entries.length === 0) return null;
  const hasCorrection = entries.some((e) => e.is_reversal || e.supersedes_item_id !== null);
  return hasCorrection ? "correction" : "initial";
}

export function ceremonyIsMixed(entries: ApprovalSetEntry[]): boolean {
  const hasCorrection = entries.some((e) => e.is_reversal || e.supersedes_item_id !== null);
  const hasPlain = entries.some((e) => !e.is_reversal && e.supersedes_item_id === null);
  return hasCorrection && hasPlain;
}

/** The ONE compound acknowledgment sentence — a single positive attestation over the
 *  DB-displayed facts (dry-run tie, entry count, as-of), framed as one transaction. It
 *  is deliberately NOT a per-item tick list (the tick ceremony is D4's, and the two
 *  must never blur). The cents figure is passed pre-formatted by the caller (fmtCents). */
export function compoundAckSentence(
  entryCount: number,
  asOf: string,
  obeDisplay: string,
  kind: Exclude<CeremonyKind, null>,
): string {
  const noun = kind === "correction" ? "opening correction" : "opening carry-down";
  const n = entryCount === 1 ? "1 draft entry" : `${entryCount} draft entries`;
  return (
    `I have reviewed the trial-balance tie (opening-balance-equity nets ${obeDisplay}), ` +
    `the ${n} listed below with their makers and posting dates, and I approve this ` +
    `${noun} as ONE transaction posting every listed entry as at ${asOf}.`
  );
}

// ---------------------------------------------------------------------------
// The runtime parse-route result (§3.3) narrowed for the keyed-fallback UX.
// ---------------------------------------------------------------------------

export type ParseResult =
  | { status: "parsed"; lines: number }
  | { status: "unparseable"; reason: string }
  | { status: "refused"; code: string | null; message: string };

// ---------------------------------------------------------------------------
// Governed refusal label (verbatim CLR code + reason token — the house idiom).
// ---------------------------------------------------------------------------

export function refusalLabel(clr: { code: string; reason: string | null }): string {
  return clr.reason ? `${clr.code} · ${clr.reason}` : clr.code;
}

/** A short human hint for the opening-family reason tokens that benefit from one.
 *  Generic/authorization codes carry NO hint — the verbatim DB message is the guidance. */
export function refusalHint(code: string, reason: string | null): string {
  if (code === "CLR03") return "Human bookkeeper+ only.";
  switch (reason) {
    case "tie_mismatch":
      return "The trial balance no longer ties to the target — re-check the deltas below.";
    case "obe_not_nil":
      return "Opening-balance-equity must net to nil before approval.";
    case "not_serializable":
      return "Approval must run in a serializable transaction — the deploy ceremony sets this in the DB.";
    case "revision_mismatch":
      return "A draft changed under you — reload the approval set and try again.";
    case "stale_plan":
      return "The onboarding plan advanced — reload and retry.";
    case "registry_not_open":
      return "The seed is not in an approvable state.";
    case "distinct_checker":
      return "A different professional must approve this than drafted it.";
    case "self_attestation":
      return "You are the sole eligible approver — a typed attestation is required to self-approve.";
    case "depreciation_method_unsupported":
      return "Only straight-line depreciation is supported this wave (FORK-7).";
    case "parsed_target_writer_required":
      return "A document-tied seed records targets through the parse action, not the keyed form.";
    default:
      return "";
  }
}
