// THE RECEIPT-KIND ROSTER, and the register it is pinned against.
//
// E-2 / CB-AE2E-018, the second-order half. `components/firm/firm-activity-feed.tsx`
// carried a SEVEN-member map and a header citing
// `0103_f_a7_pi_additive.sql:294-301` as "the closed registry". That citation
// has been superseded TWICE — `0142_fa7b_pr_a_client_onboarding_open.sql:314-315`
// registered `onboarding_agent` and `0154_binding_proposal_pr_1.sql:1067-1068`
// registered `binding_agent`, and both arms carry REAL projections (their shims
// are `create view` bodies in those same files, not stubs). So the feed's
// "honest raw-value fallback" had quietly become the DEFAULT path for two live
// kinds, rendering the snake_case token to a professional.
//
// THE ROSTER IS PINNED, so this cannot rot a third time.
// `lib/firm/receipt-kinds.test.ts` parses `clara.agent_receipt_surfaces`'s own
// rows out of `packages/db/migrations/` and requires this array to cover every
// one of them. The register is APPEND-ONLY at the database level
// (`t_agent_receipt_surfaces_append_only`, 0103:974-978), which is what makes a
// static parse of the INSERTs a sound census rather than a snapshot: a row that
// was ever registered is still registered.
//
// WHY A PARSE AT ALL, RATHER THAN A JOIN. The join that used to enforce this
// died with `apps/dashboard` at the P6-X source delete — its rig-gated cell read
// the DEPLOYED register. Nothing replaced it, and the identical class is already
// written down at `lib/firm/needs-you.ts:55-70`. A parse is the strongest thing
// a database-free `apps/web` test can do, and it is strictly better than the
// hand roster it replaces.
//
// COVERAGE IS NOT THE SAME AS CONTENT, and the feed says so separately. FOUR of
// the nine arms project real rows — f_a6 (`0131:1507`), f_a7 (`0126:773`), f_a7b
// (`0142:319`) and pb_binding (`0154:999`). The other FIVE — f_a2 `entry_post`,
// f_a3 `bank_agent`, f_a4 `agent_act`, f_a5 `report_agent` and f_a8 `web_fetch`
// — are still the `0103:311-372` typed-empty stubs (`select null::… where
// false`), censused 2026-09-04: `_agent_receipt_src_f_a2/3/4/5/8` each have
// EXACTLY ONE definition across every migration, and it is 0103's. Posting an
// entry, a bank-agent act, a generic agent act, a report-agent act and a web
// fetch therefore produce NOTHING in this feed by construction. That is a
// DATABASE gap (its own lane), not a web one — the web's duty is to stop the
// page claiming otherwise.

/** Every `receipt_kind` `clara.agent_receipt_surfaces` currently registers, in
 *  registration order. Extend this array — never a standalone literal — the day
 *  a tenth item registers; the pin below is what makes that a RED test rather
 *  than a raw token on screen. */
export const AGENT_RECEIPT_KINDS = [
  // 0103_f_a7_pi_additive.sql:294-301 — the original seven.
  "entry_post",
  "bank_agent",
  "agent_act",
  "report_agent",
  "freeform_read",
  "agent_filing",
  "web_fetch",
  // 0142_fa7b_pr_a_client_onboarding_open.sql:314-315 — the eighth.
  "onboarding_agent",
  // 0154_binding_proposal_pr_1.sql:1067-1068 — the ninth.
  "binding_agent",
] as const;

export type AgentReceiptKind = (typeof AGENT_RECEIPT_KINDS)[number];

export function isKnownAgentReceiptKind(kind: string): kind is AgentReceiptKind {
  return (AGENT_RECEIPT_KINDS as readonly string[]).includes(kind);
}

/**
 * The four arms whose shim is a REAL projection today, and therefore the only
 * kinds this feed can currently show. Used for one honest sentence on the
 * page — the feed used to promise "what the agent did across every client"
 * over a union five of whose nine arms cannot emit a row.
 *
 * Each entry names the migration whose `create view clara._agent_receipt_src_*`
 * body replaced 0103's stub. Censused by grepping every migration for each
 * shim's own definition and counting the results — one definition means the
 * 0103 stub still stands.
 */
export const WIRED_AGENT_RECEIPT_KINDS = [
  "freeform_read", // 0131_f_a6_freeform_read.sql
  "agent_filing", // 0126_f_a7_beta_filing_verb.sql
  "onboarding_agent", // 0142_fa7b_pr_a_client_onboarding_open.sql
  "binding_agent", // 0154_binding_proposal_pr_1.sql
] as const satisfies readonly AgentReceiptKind[];

/** The five whose shim is still 0103's typed-empty stub. The two lists are
 *  disjoint and together cover AGENT_RECEIPT_KINDS — asserted by the test, so
 *  neither can silently fall out of step with the roster above. */
export const UNWIRED_AGENT_RECEIPT_KINDS = [
  "entry_post",
  "bank_agent",
  "agent_act",
  "report_agent",
  "web_fetch",
] as const satisfies readonly AgentReceiptKind[];
