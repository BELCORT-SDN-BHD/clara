// The CANONICAL ClaraPart union, ported to apps/web from the LIVE dashboard
// declaration (apps/dashboard/app/shared/parts.ts:139-161) — mechanism, not look.
// This is the 18-member union confirmed live by
// docs/plan/active/codex-frontend-handoff-errata-2026-08-27.md (ii): the
// frontend-handoff-2026-08-23.md §3.1 count of 21 is STALE — kb_rule_proposal,
// rule_post_receipt and bank_rule_proposal retired with F-A2/F-A3 and are not
// ported here. Four more part types (agent_receipt, firm_question,
// close_proposal, freeform_result) land in a LATER, single batched wire bump
// (mohe-grill-rulings-2026-08-27.md Q8) — this module and its catalog
// (./catalog.ts) are built so that bump is an additive edit, not a rewrite.
//
// Every member below carries IDENTIFIERS ONLY (plus the two live-transcript
// leaf types, `text`/`clarify`, which are themselves the payload) — hydrate-
// never-trust (contract §3.2): a card re-derives authoritative state from a
// pinned DB read function on mount and after every action. `refusal` is the
// deliberate exception (there is no draft left to hydrate).

/** Two-tier amount provenance (contract §4): a machine-corroborated total vs a
 *  model read from the document. Tier A = "verified", Tier B = "model_read". */
export type ProvenanceTier = "verified" | "model_read";

/** Qualitative uncertainty (S6-R5 / WA-L2 — never a percentage): a note + alternatives. */
export type Uncertainty = { note: string; alternatives: string[] };

/** The CLR codes a refusal part can carry (contract §12 / §10). `string` keeps the
 *  union open for codes the runtime maps that this module has not enumerated; the
 *  card renders `code` + `message` verbatim regardless. */
export type RefusalCode =
  | "CLR21" | "CLR22" | "CLR23" | "CLR24" | "CLR25"
  | "CLR26" | "CLR27" | "CLR28" | "CLR29"
  | (string & {});

/** The attachment part shape a submitted turn carries. The runtime rides this on
 *  the wire but never declares it in its own union — the dashboard (and now this
 *  module) is the canonical declarer. */
export type AttachmentPart = { type: "attachment"; document_id: string; intake_id: string };

/** The je_review part: identifiers only; the card re-derives authoritative state
 *  via get_draft_review on hydrate, never trusting the persisted snapshot. */
export type JeReviewPart = {
  type: "je_review";
  entry_id: string;
  revision_token: string;
  client_id: string;
  document_id: string;
  provenance_tier: ProvenanceTier;
  uncertainty?: Uncertainty;
  // The draft PERSISTS an amount exception instead of refusing at draft time; the
  // part flags it so the card renders the persisted exception panel on hydrate.
  exception?: boolean;
};

/** The split-view evidence surface: document bytes beside the entry, per-leg region
 *  cites, and the DB-computed doc<->entry derivation panel. Hydrates
 *  get_doc_entry_diff + get_draft_review (+ the document-bytes route). */
export type DocReviewPart = { type: "doc_review"; document_id: string; entry_id: string; client_id: string };

/** The revision-walk diff: renders get_entry_diff rows — every delta_cents is
 *  DB-computed; the UI never sums. */
export type DiffPart = { type: "diff"; entry_id: string; client_id: string };

/** The auto-draft sweep-run receipt: renders get_sweep_run; opening a FINALIZED run
 *  offers the audited bookkeeper+ acknowledgement. */
export type SweepReceiptPart = { type: "sweep_receipt"; run_id: string };

/** A durable open question: renders get_open_question; resolve/dismiss are
 *  human-only bookkeeper+ acts. */
export type OpenQuestionPart = { type: "open_question"; question_id: string; client_id: string };

/** A completed (or voided) bank reconciliation's receipt. Keyed on `statement_id`,
 *  NOT `recon_id` — the only read RPC is get_bank_reconciliation(statement)
 *  (recons are born 1:1 on a live statement). */
export type BankReconReceiptPart = { type: "bank_recon_receipt"; statement_id: string; client_id: string };

/** A fixed asset's register row. Identifier-only; the card hydrates
 *  get_fixed_asset(asset_id) on mount — every cents figure is DB-projected
 *  (schedule/charges/accumulated), never summed here. */
export type FixedAssetPart = { type: "fixed_asset"; client_id: string; asset_id: string; label?: string };

/** A depreciation run's receipt: minted at approve, never editable — a correction
 *  reverses the period entry and re-runs. Identifier-only; the card hydrates
 *  get_depreciation_run(run_id) on mount. */
export type DepreciationRunReceiptPart = { type: "depreciation_run_receipt"; client_id: string; run_id: string; label?: string };

/** An adjustment-template occurrence's receipt: minted after the (possible)
 *  auto-reversal mirror, fully immutable — a correction rides
 *  reverse_adjustment_pair/reverse_entry, never an edit. Identifier-only; the card
 *  hydrates get_adjustment_run(run_id) on mount. */
export type AdjustmentRunReceiptPart = { type: "adjustment_run_receipt"; client_id: string; run_id: string; label?: string };

/** A staff advance's register row. Identifier-only; the card hydrates
 *  staff_advance_summary(client, as_of=today) and picks the row by advance_id —
 *  there is no single-row getter in the ABI, so this follows the same
 *  "pick by id from a list" fallback — never a fabricated read fn. Every
 *  outstanding/cents figure is DB-derived by the summary read itself, never
 *  summed here. */
export type StaffAdvancePart = { type: "staff_advance"; client_id: string; advance_id: string; label?: string };

/** The canonical transcript wire union: 18 live members (9 base + 4 Wave-A +
 *  1 Wave-C-c + 2 Wave-D-a + 2 Wave-D-b). Adding a member here without a matching
 *  ./catalog.ts entry fails `tsc` — see catalog.ts's AllCovered/NoExtra guard. */
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
  | DocReviewPart
  | DiffPart
  | SweepReceiptPart
  | OpenQuestionPart
  | BankReconReceiptPart
  | FixedAssetPart
  | DepreciationRunReceiptPart
  | AdjustmentRunReceiptPart
  | StaffAdvancePart;
