// The CANONICAL ClaraPart union, ported to apps/web from the LIVE dashboard
// declaration (apps/dashboard/app/shared/parts.ts:139-161) — mechanism, not look.
// It began as the 18-member union confirmed live by
// docs/plan/active/codex-frontend-handoff-errata-2026-08-27.md (ii): the
// frontend-handoff-2026-08-23.md §3.1 count of 21 is STALE — kb_rule_proposal,
// rule_post_receipt and bank_rule_proposal retired with F-A2/F-A3 and are not
// ported here. Four more part types (agent_receipt, firm_question,
// close_proposal, freeform_result) land in a LATER, single batched wire bump
// (mohe-grill-rulings-2026-08-27.md Q8) — this module and its catalog
// (./catalog.ts) are built so that bump is an additive edit, not a rewrite.
//
// 22 MEMBERS AS OF 2026-08-29 (MBB-4, docs/plan/active/mohe-alignment-audit-
// 2026-08-29.md §2): the four chatTurn_v14 receipt kinds at the bottom of this
// file joined the union. They are NOT the Q8 four — that bump is still owed and
// still lands on top of these, taking the catalog to 26. The v14 four were
// already ON THE WIRE and rendering as the "Unsupported part" warning chip,
// because the LIVE registry is `chatTurn: chatTurn_v14`
// (packages/runtime/workflows/registry.ts:54) and its wire union is
//   ClaraPartV14 = ClaraPart | EntryPostedPart | QuestionOpenedPart
//                | BankActPart | BankPackPart
// (packages/runtime/workflows/chatTurn.v14.prompt.ts:27). Declaring them here
// is purely additive on the frontend — no runtime version bump is involved,
// since the emitter already ships them.
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

// --- The chatTurn_v14 receipt kinds -------------------------------------------
// Each shape below is TRANSCRIBED from its declaration inside the frozen v14
// closure, field for field — the runtime is the declarer, this module is the
// reader. Do not "improve" a field name or widen a type here: a mismatch would
// make the renderer read a field the wire does not carry.

/** A chat-lane post that the DB ACCEPTED. Declared at
 *  packages/runtime/workflows/chatTurn.v13.post.ts:101-108, constructed at :218-228
 *  (`client_id` starts `""` there and is filled with the real client at :333), and
 *  carried onto the v14 wire by `toTypedParts_v13`, which `toTypedParts_v14`
 *  re-exports through (chatTurn.v14.prompt.ts:81).
 *
 *  IDENTIFIERS AND THE DB'S OWN VERDICT TOKENS ONLY — no lines, no amount, no
 *  account. The wire carries none, and the card must not invent one
 *  (apps/web/AGENTS.md: "The UI never invents a number"): the entry's lines and
 *  total are read on the journals workbench, which is what the card links to. */
export type EntryPostedPart = {
  type: "entry_posted";
  entry_id: string;
  client_id: string;
  post_receipt_id: string;
  /** F-A2's thirteen-rung receipt vector — DB-owned rung → outcome strings. */
  rung_vector: Record<string, string>;
  verdict: Record<string, unknown>;
};

/** The receipt a successful `open_client_question` yields. Declared at
 *  packages/runtime/workflows/chatTurn.v13.post.ts:111-116, constructed at :403-405.
 *  Carries NO client_id — the durable question lands in the firm's Needs-you
 *  queue, which is where this card links. */
export type QuestionOpenedPart = {
  type: "question_opened";
  question_id: string;
  scope_kind: string;
  question: string;
};

/** One admitted bank-lane act, from any of the twelve BANK_ACT_TOOLS. Declared at
 *  packages/runtime/workflows/chatTurn.v14.bank.ts:77, pushed onto the wire at
 *  chatTurn.v14.prompt.ts:92 (deduped within a segment by `op_key`). `result` is
 *  the door's own return payload — an open shape, so the card renders the named
 *  identifiers and never walks it. */
export type BankActPart = {
  type: "bank_act";
  verb: string;
  subject_id: string | null;
  op_key: string;
  result: Record<string, unknown>;
};

/** A `get_bank_pack` READ — the grounding digest every bank act must cite.
 *  Declared at packages/runtime/workflows/chatTurn.v14.bank.ts:79, pushed at
 *  chatTurn.v14.prompt.ts:94 and deliberately never deduped (each read is a fresh
 *  receipt). `pack` is an open shape; the card renders the account and the digest,
 *  which are what make the act auditable. */
export type BankPackPart = {
  type: "bank_pack";
  bank_account_id: string;
  digest: string;
  pack: Record<string, unknown>;
};

/** The canonical transcript wire union: 22 live members (9 base + 4 Wave-A +
 *  1 Wave-C-c + 2 Wave-D-a + 2 Wave-D-b + 4 chatTurn_v14). Adding a member here
 *  without a matching ./catalog.ts entry fails `tsc` — see catalog.ts's
 *  AllCovered/NoExtra guard. */
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
  | StaffAdvancePart
  | EntryPostedPart
  | QuestionOpenedPart
  | BankActPart
  | BankPackPart;
