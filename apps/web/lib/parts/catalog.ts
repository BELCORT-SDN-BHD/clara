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
 *  it. 16 render-branch entries + the 2 STATUS_RESOLVER_TYPES above = 18 total,
 *  matching the live ClaraPart union in ./types.ts exactly. */
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
