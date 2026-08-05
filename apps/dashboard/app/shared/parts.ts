// The CANONICAL ClaraPart union (INTERFACE-PINS §5 / PIN-DELTA-3). This is the ONE
// dashboard-side definition of the persisted transcript wire; `app/chat/api.ts`
// re-exports from here (api.ts is NOT frozen), so every existing `import { …
// ClaraPart } from "./api"` keeps resolving. The runtime's three `ClaraPart`
// unions live in FROZEN files (`chatTurn*.prompt.ts`) — workflow-immutability +
// the freeze IMPORT-ESCAPE law forbid editing them or importing a shared package
// from them, so they stay as-is and a future workflow version converges. The
// runtime-wire parity is instead pinned here by fixture tests (see parts.test.ts):
// every shape the runtime actually emits — including the `attachment` part the
// runtime handles only through an `as` cast (its union never declared it) — MUST
// be assignable to THIS union and renderable through the catalog. That closes the
// dashboard-side `attachment` cast-gap the extraction flagged.

/** Two-tier amount provenance (contract §4): a machine-corroborated total vs a
 *  model read from the document. Tier A = "verified", Tier B = "model_read". */
export type ProvenanceTier = "verified" | "model_read";

/** Qualitative uncertainty (S6-R5 / WA-L2 — never a percentage): a note + alternatives. */
export type Uncertainty = { note: string; alternatives: string[] };

/** The CLR codes a refusal part can carry (contract §12 / §10). `string` keeps the
 *  union open for codes the runtime maps that the dashboard has not enumerated; the
 *  card renders `code` + `message` verbatim regardless. Wave A adds CLR26–29. */
export type RefusalCode =
  | "CLR21" | "CLR22" | "CLR23" | "CLR24" | "CLR25"
  | "CLR26" | "CLR27" | "CLR28" | "CLR29"
  | (string & {});

/** The attachment part shape a submitted turn carries (INTERFACE-PINS 4). The
 *  runtime rides this on the wire but never declares it in its own union — the
 *  dashboard is the canonical declarer. */
export type AttachmentPart = { type: "attachment"; document_id: string; intake_id: string };

/** The je_review part (Slice-6): identifiers only; the card re-derives authoritative
 *  state via get_draft_review on hydrate, never trusting the persisted snapshot. */
export type JeReviewPart = {
  type: "je_review";
  entry_id: string;
  revision_token: string;
  client_id: string;
  document_id: string;
  provenance_tier: ProvenanceTier;
  uncertainty?: Uncertainty;
  // W1/F1: the draft PERSISTS an amount exception instead of refusing at draft time;
  // the part flags it so the card renders the persisted exception panel on hydrate.
  exception?: boolean;
};

// --- Wave-A new part types (contract §9 / INTERFACE-PINS §5) --------------------
// All FIVE carry IDENTIFIERS ONLY; each card hydrates authoritative state via its
// pinned read fn on mount and after every action (never trusting the payload).

/** The split-view evidence surface (contract §5): document bytes beside the entry,
 *  per-leg region cites, and the DB-computed doc↔entry derivation panel. Also the
 *  `/queue` detail pane. Hydrates get_doc_entry_diff + get_draft_review (+ the
 *  document-bytes route). */
export type DocReviewPart = { type: "doc_review"; document_id: string; entry_id: string; client_id: string };

/** The revision-walk diff (contract §7 / WA-R11): renders get_entry_diff rows — every
 *  delta_cents is DB-computed; the UI never sums. */
export type DiffPart = { type: "diff"; entry_id: string; client_id: string };

/** The auto-draft sweep-run receipt (contract §3.5 / WA-R5): renders get_sweep_run;
 *  opening a FINALIZED run offers the audited bookkeeper+ acknowledgement. */
export type SweepReceiptPart = { type: "sweep_receipt"; run_id: string };

/** A KB Layer-2 rule proposal (contract §6 / WA-R9): renders get_coding_rule (+ the
 *  originating question); sign/decline are human-only bookkeeper+ acts. */
export type KbRuleProposalPart = { type: "kb_rule_proposal"; rule_id: string; question_id: string; client_id: string };

/** A durable open question (contract §6 / WA-R10): renders get_open_question; resolve/
 *  dismiss are human-only bookkeeper+ acts. */
export type OpenQuestionPart = { type: "open_question"; question_id: string; client_id: string };

// --- Wave-A2 new part type (contract §6.4/§7; migration 0015 S4) ----------------
/** A posted-by-rule receipt (WA2-R7 / §6.4): identifier-only; the card hydrates the
 *  rule_post_runs receipt (the batch of entries a signed autopost rule posted) via its
 *  pinned read fn on mount, and offers the bookkeeper+ acknowledgement (an ack is NOT
 *  an approval — every rule-post is reversible). Mirrors `SweepReceiptPart`. */
export type RulePostReceiptPart = { type: "rule_post_receipt"; run_id: string };

// --- Wave C-c additions (design v2.1 §7) -----------------------------------------
// Identifier-only, mirroring the Wave-A/A2 receipt/proposal idiom exactly. NOTE (see
// build-0040/u1-notes.md): design §7 names "new ClaraPart members + catalog entries"
// without naming them — C-c ships no new machine lane, so nothing in the runtime
// emits these on the wire TODAY. They are declared here by analogy (a completed
// reconciliation is a receipt, a bank rule proposal is a proposal — the SweepReceiptPart/
// KbRuleProposalPart shape) so the surface exists the day a chat turn references one; both
// cards hydrate authoritative state on mount, same as every other Wave-A/A2 part.

/** A completed (or voided) bank reconciliation's receipt (design §4.1/§6).
 *  Keyed on `statement_id`, NOT `recon_id` — the only read RPC the design
 *  names is `get_bank_reconciliation(statement)` (§6; recons are born 1:1 on
 *  a live statement, WCC-R1), so that is the id this part can actually
 *  hydrate with. */
export type BankReconReceiptPart = { type: "bank_recon_receipt"; statement_id: string; client_id: string };

/** A bank_rules proposal (design §4.3) — match_settle or coding. */
export type BankRuleProposalPart = { type: "bank_rule_proposal"; rule_id: string; client_id: string };

// --- Wave D-a additions (design v2.1 §6/§7; 0041-interface-contract.md §7) ------
// Identifier-only, mirroring the receipt idiom exactly (SweepReceiptPart/
// BankReconReceiptPart). D-a ships no new chatTurn machine lane — chatTurn.v8
// stays FROZEN, untouched — so nothing in the runtime emits these on the wire
// TODAY; they are declared here by analogy (parts.ts:82-90's own precedent
// restated) so the surface exists the day a chat turn references one. Both
// cards hydrate authoritative state on mount, same as every other receipt part.

/** A fixed asset's register row (design §1/§6). Identifier-only; the card
 *  hydrates get_fixed_asset(asset_id) on mount — every cents figure is
 *  DB-projected (schedule/charges/accumulated), never summed here. */
export type FixedAssetPart = { type: "fixed_asset"; client_id: string; asset_id: string; label?: string };

/** A depreciation run's receipt (design §1.5/§3.2/§6): minted at approve,
 *  never editable — a correction reverses the period entry and re-runs.
 *  Identifier-only; the card hydrates get_depreciation_run(run_id) on mount. */
export type DepreciationRunReceiptPart = { type: "depreciation_run_receipt"; client_id: string; run_id: string; label?: string };

// --- Wave D-b additions (design §2.5/§2.7/§2.8/§3.4/§7; wave-d-b-design-abi.md §A) ---
// Identifier-only, mirroring FixedAssetPart/DepreciationRunReceiptPart exactly. D-b
// ships no new chatTurn machine lane — chatTurn.v8 stays FROZEN, untouched — so
// nothing in the runtime emits these on the wire TODAY; they are declared here by
// analogy (parts.ts:101-107's own precedent restated) so the surface exists the day
// a chat turn references one.

/** An adjustment-template occurrence's receipt (design §2.5 "receipts + events" /
 *  §2.7/§2.8): minted after the (possible) auto-reversal mirror, fully immutable —
 *  a correction rides `reverse_adjustment_pair`/`reverse_entry`, never an edit.
 *  Identifier-only; the card hydrates `get_adjustment_run(run_id)` on mount,
 *  mirroring DepreciationRunReceiptPart's receipt idiom exactly. */
export type AdjustmentRunReceiptPart = { type: "adjustment_run_receipt"; client_id: string; run_id: string; label?: string };

/** A staff advance's register row (design §3.2/§3.4). Identifier-only; the card
 *  hydrates `staff_advance_summary(client, as_of=today)` and picks the row by
 *  `advance_id` — there is no single-row getter in the ABI (§9/ABI §A names only
 *  the summary/statement/tie reads), so this follows the SAME "pick by id from a
 *  list" fallback `reconApi.ts`'s `getBankRule` already uses against
 *  `list_bank_rules` (the D4 fix precedent) — never a fabricated read fn. Every
 *  outstanding/cents figure is DB-derived by the summary read itself, never
 *  summed here. */
export type StaffAdvancePart = { type: "staff_advance"; client_id: string; advance_id: string; label?: string };

/** The canonical transcript wire union: 9 existing + 5 Wave-A + 1 Wave-A2 + 2 Wave-C-c + 2 Wave-D-a + 2 Wave-D-b members. */
export type ClaraPart =
  | { type: "text"; text: string }
  | { type: "tool_call"; tool: string; tool_call_id: string; input: unknown }
  | { type: "tool_result"; tool: string; tool_call_id: string; output: unknown }
  | { type: "tool_error"; tool: string; tool_call_id: string; error: string }
  | { type: "clarify"; tool_call_id: string; question: string; context?: string | null; framing: string }
  | { type: "clarify_closed"; reason: "expired" | "cancelled"; framing: string }
  | AttachmentPart
  | JeReviewPart
  | { type: "refusal"; code: RefusalCode; reason?: string; message: string }
  // --- Wave-A additions ---
  | DocReviewPart
  | DiffPart
  | SweepReceiptPart
  | KbRuleProposalPart
  | OpenQuestionPart
  // --- Wave-A2 addition ---
  | RulePostReceiptPart
  // --- Wave C-c additions ---
  | BankReconReceiptPart
  | BankRuleProposalPart
  // --- Wave D-a additions ---
  | FixedAssetPart
  | DepreciationRunReceiptPart
  // --- Wave D-b additions ---
  | AdjustmentRunReceiptPart
  | StaffAdvancePart;
