// The card-catalog registry, ported mechanism-for-mechanism from
// apps/dashboard/app/chat/partCatalog.ts: the SINGLE source of truth for which
// persisted `ClaraPart` types PartRenderer.tsx can render. Adding a wire part type
// without registering it here fails typecheck (the AllCovered/NoExtra exhaustiveness
// asserts below); adding it here without a render branch in PartRenderer fails the
// parity test (./catalog.test.tsx) — closing the same silent-drop class the
// dashboard's catalog closes (an unknown part type must never just vanish).

import type { ClaraPart } from "./types";

export type PartType = ClaraPart["type"];

/** Types that intentionally render NOTHING on their own: they resolve an earlier
 *  `tool_call` chip's status (running/ok/error), never a standalone element.
 *  Consumed by PartRenderer.tsx so "renders nothing" is declared in ONE place. */
export const STATUS_RESOLVER_TYPES = ["tool_result", "tool_error"] as const;
export type StatusResolverType = (typeof STATUS_RESOLVER_TYPES)[number];

/** A catalog entry: the type has a persisted-render branch, plus >=1 reachability
 *  fixture the parity test renders and asserts non-empty. */
export type CatalogEntry = { renderBranch: true; fixtures: ClaraPart[] };

/** The part types that render a VISIBLE persisted element. Every key here MUST
 *  have a branch in PartRenderer.tsx; the parity test (./catalog.test.tsx) enforces
 *  it. 24 render-branch entries + the 2 STATUS_RESOLVER_TYPES above = 26 total,
 *  matching the live ClaraPart union in ./types.ts exactly.
 *
 *  The count's own history, because every step of it was a measurement rather
 *  than a plan: 16 + 2 = 18 until 2026-08-29, when MBB-4 registered the four
 *  chatTurn_v14 receipt kinds the live emitter was already putting on the wire
 *  (20 + 2 = 22); then 24 + 2 = 26 on 2026-08-30, when P6-2 registered the four
 *  chatTurn_v16 kinds P6-1 declared (ruling Q8). */
export const PART_CATALOG = {
  text: {
    renderBranch: true,
    fixtures: [{ type: "text", text: "Booked to 620-000 Professional fees." }],
  },
  attachment: {
    renderBranch: true,
    fixtures: [{ type: "attachment", document_id: "doc-1111", intake_id: "intake-1111" }],
  },
  tool_call: {
    renderBranch: true,
    fixtures: [{ type: "tool_call", tool: "read_document", tool_call_id: "call-1", input: { document_id: "doc-1111" } }],
  },
  clarify: {
    renderBranch: true,
    fixtures: [
      {
        type: "clarify",
        tool_call_id: "call-2",
        question: "Which client is this BRIGHTPATH bill for?",
        context: "Two active clients share this vendor.",
        framing: "This question and its answer are visible to your firm.",
      },
    ],
  },
  clarify_closed: {
    renderBranch: true,
    fixtures: [{ type: "clarify_closed", reason: "expired", framing: "This question and its answer are visible to your firm." }],
  },
  je_review: {
    renderBranch: true,
    fixtures: [
      {
        type: "je_review",
        entry_id: "entry-1111",
        revision_token: "rev-1111",
        client_id: "client-1111",
        document_id: "doc-1111",
        provenance_tier: "model_read",
        uncertainty: { note: "Vendor name matched but registration not printed.", alternatives: ["620-000 Professional fees", "630-000 Consultancy"] },
      },
      {
        type: "je_review",
        entry_id: "entry-2222",
        revision_token: "rev-2222",
        client_id: "client-1111",
        document_id: "doc-2222",
        provenance_tier: "verified",
      },
      {
        type: "je_review",
        entry_id: "entry-3333",
        revision_token: "rev-3333",
        client_id: "client-1111",
        document_id: "doc-3333",
        provenance_tier: "verified",
        exception: true,
      },
    ],
  },
  refusal: {
    renderBranch: true,
    fixtures: [
      { type: "refusal", code: "CLR21", reason: "amount_conflict", message: "CLR21: the proposed lines do not match the machine-corroborated total." },
      { type: "refusal", code: "CLR23", message: "CLR23: a payable line needs a resolved vendor." },
    ],
  },
  doc_review: {
    renderBranch: true,
    fixtures: [{ type: "doc_review", document_id: "doc-4444", entry_id: "entry-4444", client_id: "client-1111" }],
  },
  diff: {
    renderBranch: true,
    fixtures: [{ type: "diff", entry_id: "entry-5555", client_id: "client-1111" }],
  },
  sweep_receipt: {
    renderBranch: true,
    fixtures: [{ type: "sweep_receipt", run_id: "run-6666" }],
  },
  open_question: {
    renderBranch: true,
    fixtures: [{ type: "open_question", question_id: "q-8888", client_id: "client-1111" }],
  },
  bank_recon_receipt: {
    renderBranch: true,
    fixtures: [{ type: "bank_recon_receipt", statement_id: "stmt-1010", client_id: "client-1111" }],
  },
  fixed_asset: {
    renderBranch: true,
    fixtures: [{ type: "fixed_asset", client_id: "client-1111", asset_id: "asset-1212", label: "Delivery van" }],
  },
  depreciation_run_receipt: {
    renderBranch: true,
    fixtures: [{ type: "depreciation_run_receipt", client_id: "client-1111", run_id: "run-1313" }],
  },
  adjustment_run_receipt: {
    renderBranch: true,
    fixtures: [{ type: "adjustment_run_receipt", client_id: "client-1111", run_id: "run-1414" }],
  },
  staff_advance: {
    renderBranch: true,
    fixtures: [{ type: "staff_advance", client_id: "client-1111", advance_id: "advance-1515" }],
  },

  // --- The four chatTurn_v14 receipt kinds (MBB-4) ---------------------------
  // Every fixture below is shaped from the EMITTER's own construction site, not
  // from a guess: see the per-type citations in ./types.ts.
  entry_posted: {
    renderBranch: true,
    fixtures: [
      {
        type: "entry_posted",
        entry_id: "entry-1616",
        client_id: "client-1111",
        post_receipt_id: "receipt-1616",
        rung_vector: { document_present: "pass", amount_corroborated: "pass", counterparty_resolved: "pass" },
        verdict: { admitted: true },
      },
      // `client_id` is "" between the part's construction (chatTurn.v13.post.ts:223)
      // and the fill at :333. A card that built `/clients//journals` from that would
      // be a broken link, so the branch drops the link instead — this fixture is the
      // reachability proof that it still renders.
      // (The two fixtures carry the SAME rung_vector KEYS on purpose: `satisfies`
      // keeps the literal inferred type, and TypeScript unifies a mixed-key array
      // of object literals by making the odd keys optional-undefined — which then
      // fails `Record<string, string>`. The empty-vector branch is covered instead
      // in ../../components/parts/v14-receipt-cards.test.tsx, where the fixture is
      // annotated `EntryPostedPart` directly.)
      {
        type: "entry_posted",
        entry_id: "entry-1717",
        client_id: "",
        post_receipt_id: "receipt-1717",
        rung_vector: { document_present: "pass", amount_corroborated: "n_a", counterparty_resolved: "n_a" },
        verdict: {},
      },
    ],
  },
  question_opened: {
    renderBranch: true,
    fixtures: [
      {
        type: "question_opened",
        question_id: "q-1818",
        scope_kind: "document",
        question: "Is the BRIGHTPATH invoice a repair or a capital improvement?",
      },
    ],
  },
  bank_act: {
    renderBranch: true,
    fixtures: [
      { type: "bank_act", verb: "match_bank_line", subject_id: "line-1919", op_key: "op-1919", result: { matched: true } },
      // subject_id is nullable on the wire (chatTurn.v14.bank.ts:77) — an act with
      // no single subject (a reconciliation complete, say) must still render.
      { type: "bank_act", verb: "complete_bank_reconciliation", subject_id: null, op_key: "op-2020", result: {} },
      // C6 — THE SHAPE THE LEDGER ACTUALLY RETURNS, beside the two invented ones
      // above. `result` is `_agent_match_bank_line_core`'s own `v_res`, passed through
      // verbatim by `classifyBankResult` (chatTurn.v14.bank.ts); 0121 returns the
      // delegate's row, whose identifier for this verb is `match_id`. The card renders
      // string/boolean leaves and drops numerals — lib/parts/bankPayload.ts's header
      // says why — so this fixture carries one of each to exercise both sides.
      {
        type: "bank_act",
        verb: "match_bank_line",
        subject_id: "line-2626",
        op_key: "bank-match_bank_line:task-1:0:{}",
        result: { match_id: "match-2626", status: "live", matched_cents: 125_00 },
      },
    ],
  },
  bank_pack: {
    renderBranch: true,
    fixtures: [
      { type: "bank_pack", bank_account_id: "acct-2121", digest: "sha256:2121deadbeef", pack: { lines: 12 } },
      // C6 — the VERSIONED shape `clara._agent_get_bank_pack_core` builds
      // (0121_f_a3_pr1b_agent_limb.sql): the `clara.bank-pack/v1` token plus a `budget`
      // whose two counts Postgres computed with `jsonb_array_length`. The fixture above
      // it is deliberately KEPT — it is not this shape, and it is what proves the card
      // falls back to identifiers instead of guessing at an unrecognised payload.
      {
        type: "bank_pack",
        bank_account_id: "acct-2727",
        digest: "sha256:2727deadbeef",
        pack: {
          schema: "clara.bank-pack/v1",
          budget: { lines: 12, candidates: 4, truncated: false },
        },
      },
    ],
  },

  // --- The four chatTurn_v16 kinds (P6-2, ruling Q8) --------------------------
  // Every fixture below is shaped from the frozen DECLARER's own type
  // (packages/runtime/workflows/chatTurn.v16.parts.ts, transcribed into
  // ./types.ts field for field), never from a guess about what a card would
  // like to receive.
  //
  // THESE FIXTURES DELIBERATELY EXERCISE THE UN-HYDRATED SHELL, and that is the
  // property worth having here rather than a limitation to apologise for. The
  // parity test renders through `renderToStaticMarkup`, where effects never run,
  // so each card paints its pre-hydrate state: title, wire identifiers, and the
  // loading line. That is exactly the state a real user sees for the first paint
  // of every one of these cards, and asserting it is non-empty and not the
  // fallback chip is what proves the branch exists at all. The HYDRATED bodies
  // (and every act, gate and refusal branch) are proven separately, against real
  // mounted components with mocked reads, in
  // `../../components/parts/v16-read-cards.test.tsx`,
  // `../../components/parts/v16-act-cards.test.tsx`, and
  // `../../components/parts/v16-cards-a11y.test.tsx`.
  agent_receipt: {
    renderBranch: true,
    fixtures: [
      { type: "agent_receipt", receipt_kind: "entry_post", receipt_id: "receipt-2222", client_id: "client-1111" },
      // `client_id` is NULLABLE and structurally so — the view's ordinal 4:
      // "NULL where the act is structurally client-less (pre-attribution
      // filing, a firm-narrow read)". The card renders that case as
      // firm-altitude; it must never infer a client for it.
      { type: "agent_receipt", receipt_kind: "agent_filing", receipt_id: "receipt-2323", client_id: null },
    ],
  },
  firm_question: {
    renderBranch: true,
    fixtures: [{ type: "firm_question", question_id: "fq-2424" }],
  },
  close_proposal: {
    renderBranch: true,
    fixtures: [
      { type: "close_proposal", proposal_id: "prop-2525", close_run_id: "run-2525", client_id: "client-1111" },
    ],
  },
  freeform_result: {
    renderBranch: true,
    // `read_id` is a STRING carrying a bigint (clara.freeform_read_log.id is a
    // bigint; the emitter stringifies once at the boundary because a bigint
    // round-tripped through a JS number can come back wrong). The fixture is a
    // string for that reason, not by accident.
    fixtures: [{ type: "freeform_result", read_id: "90071992547409911" }],
  },
} satisfies Record<string, CatalogEntry>;

export type RenderBranchType = keyof typeof PART_CATALOG;

/** The full set of part types PartRenderer.tsx accounts for (visible + resolver). */
export type CoveredType = RenderBranchType | StatusResolverType;

// --- Compile-time parity guard (closes silent-drop at `tsc` time) --------------
// If a new `ClaraPart` member is added to ./types.ts without being categorised here
// (a render branch in PART_CATALOG, or a STATUS_RESOLVER_TYPES entry), `_covered`
// stops being assignable from `true` and the build fails. The reverse assert
// forbids catalog entries for types the wire cannot carry.
type AllCovered = [PartType] extends [CoveredType] ? true : ["UNCATEGORISED_PART_TYPE", Exclude<PartType, CoveredType>];
type NoExtra = [CoveredType] extends [PartType] ? true : ["CATALOG_TYPE_NOT_ON_WIRE", Exclude<CoveredType, PartType>];
const _covered: AllCovered = true;
const _noExtra: NoExtra = true;
void _covered;
void _noExtra;

/** Render-branch type names (runtime list for the parity test). */
export const RENDER_BRANCH_TYPES = Object.keys(PART_CATALOG) as RenderBranchType[];

/** True when a part type has a visible persisted-render branch. */
export function isRenderBranchType(t: string): t is RenderBranchType {
  return Object.prototype.hasOwnProperty.call(PART_CATALOG, t);
}

/** True when a part type intentionally renders nothing (resolves a tool chip). */
export function isStatusResolverType(t: string): t is StatusResolverType {
  return (STATUS_RESOLVER_TYPES as readonly string[]).includes(t);
}
