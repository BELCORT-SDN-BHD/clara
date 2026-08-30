// @frozen
//
// FROZEN — part of the chatTurn_v16 closure (P6-1: THE FOUR-CARD WIRE BUMP, ruling Q8 at
// 裁-9's depth). A NEW frozen closure beside byte-untouched chatTurn_v1..v15 (ARCHITECTURE
// Appendix A).
//
// THIS FILE IS THE DECLARER, AND IT EXISTS SO THERE IS EXACTLY ONE. `apps/web/lib/parts/
// types.ts` is the READER, and it states the law about this file in its own words at
// :113-116 — "the runtime is the declarer, this module is the reader. Do not 'improve' a
// field name or widen a type here: a mismatch would make the renderer read a field the wire
// does not carry." P6-2 transcribes these four shapes field for field out of THIS file. That
// is why all four sit together in one module with no producer code beside them: v13's and
// v14's part shapes live next to the tools that mint them (chatTurn.v13.post.ts,
// chatTurn.v14.bank.ts), which was right for them because each had a producer in this lane.
// Three of these four do not (see chatTurn.v16.prompt.ts's header for the grant facts), so
// "beside the producer" would have scattered them across three lanes' files or, worse,
// invented a producer to give them a home.
//
// IDENTIFIERS ONLY — the same law every member of the union already obeys
// (apps/web/lib/parts/types.ts:25-29: "hydrate-never-trust ... a card re-derives
// authoritative state from a pinned DB read function on mount and after every action").
// Each shape below carries the minimum needed to ADDRESS its object and route to it, and
// nothing a hydrate re-derives. Each docblock names the read the card hydrates on, the act
// door (where there is one) whose subject argument the identifier IS, and the live DB body
// the field list was copied from — so a reviewer checks the transcription instead of
// trusting it.

/**
 * ONE agent act's receipt, generic across every receipt-bearing lane.
 *
 * HYDRATES `clara.agent_receipts_visible` — the one bookkeeper+ read surface over every agent
 * act receipt (0103_f_a7_pi_additive.sql:406-413, granted to `clara_authenticated` at :1030).
 * `apps/web/lib/firm/reads.ts`'s `loadFirmActivity` already reads it; the card filters that
 * same view rather than opening a second door. There is no act: a receipt records what
 * happened and nothing settles it.
 *
 * THE ADDRESS IS THE PAIR, NOT `receipt_id` ALONE. The view is a UNION of per-item shim views,
 * and `receipt_id` is by its own contract "the member row's own primary key rendered as text
 * (member PKs are uuid on some tables, bigint on others)" — `clara.agent_receipt_contract`
 * ordinal 2 (0103:260). A primary key is unique inside its member table and nowhere else, so
 * `receipt_id` alone does not name a row of this view. `receipt_kind` (ordinal 1, 0103:259) is
 * the discriminator that closes it: the two together are the address.
 *
 * `receipt_kind` IS `string`, AND THE REASON IS MEASURED RATHER THAN STYLISTIC. The world of
 * kinds is `clara.agent_receipt_surfaces`, a TABLE later items insert into — and it has
 * ALREADY moved twice past the seven 0103 seeded at :294-301 (`entry_post`, `bank_agent`,
 * `agent_act`, `report_agent`, `freeform_read`, `agent_filing`, `web_fetch`). Read live on a
 * rig at frontier 0155 it holds NINE rows: F-A7b's `onboarding_agent` and the binding
 * proposal's `binding_agent` joined after. So a union of literals transcribed from 0103 would
 * have shipped two kinds short on the day it was written, and a card for a real receipt would
 * have been unrenderable on a wire that already carried it — the failure mode `RefusalCode`'s
 * own open union (`(string & {})`) exists to avoid. p6-1-chatturn-v16-db.test.mjs re-reads that
 * count rather than restating this sentence.
 *
 * `client_id` IS NULLABLE, AND STRUCTURALLY SO — ordinal 4's own semantics: "NULL where the
 * act is structurally client-less (pre-attribution filing, a firm-narrow read)". A card
 * renders the firm-altitude case as firm-altitude; it never infers a client for it.
 */
export type AgentReceiptPart = {
  type: "agent_receipt";
  receipt_kind: string;
  receipt_id: string;
  client_id: string | null;
};

/**
 * A FIRM-scoped open question — the carrier for a document that has no client yet.
 *
 * HYDRATES `clara.firm_open_questions_visible` (0137_debt_human_read_surfaces.sql:248, 14
 * columns, bookkeeper+; `apps/web/lib/firm/needs-you-gaps.ts`'s `loadFirmOpenQuestions`
 * already reads it). ACTS through `clara.resolve_firm_question(p_question, p_resolution,
 * p_client, p_op_key)` (0103:637) and `clara.dismiss_firm_question(p_question, p_reason,
 * p_op_key)` (0103:679). `question_id` IS both doors' subject argument — which is the whole
 * field list, and the reason this shape is one field wide.
 *
 * IT CARRIES NO `client_id`, AND THAT IS THE POINT RATHER THAN AN OMISSION.
 * `clara.firm_open_questions` has no client_id COLUMN AT ALL — not nullable, absent — and
 * the table says why in its own header (0103:556-558, D-11): "a question that exists BECAUSE
 * no client is known cannot carry one, and a nullable column would let a caller put one
 * there and quietly re-create the ambiguity." A `client_id` on this part would re-create at
 * the wire exactly what the schema refused. The client a human names when they answer lands
 * in `named_client` on the settled row (0103:574) — a read, never a part field.
 *
 * `document_id` IS DELIBERATELY NOT CARRIED EITHER. It is NOT NULL on the row (0103:562), so
 * every hydrate returns it; copying it here would give the card a second, older source for a
 * value it already reads, and a route computed off the copy could disagree with the row it
 * renders.
 */
export type FirmQuestionPart = { type: "firm_question"; question_id: string };

/**
 * ONE close proposal — the close agent's drafted plan, standing until a human settles it.
 *
 * HYDRATES `clara.close_proposals` (0138_f_a4_pr_1c_close_agent_limb.sql:450; policy
 * `p_cp_human`, bookkeeper+ and firm-scoped, at :558 — re-cut by 0140:3719, which is the
 * live body). `apps/web/lib/close/api.ts:326`'s `listCloseProposalsForRun` already reads it.
 * ACTS through `clara.settle_close_proposal(p_proposal, p_state, p_reason, p_op_key)`
 * (0138:1667).
 *
 * THREE FIELDS, AND EACH ONE IS FORCED.
 *   `proposal_id` — the settle door's subject argument.
 *   `close_run_id` — needed to FETCH at all. The ABI publishes no single-row getter: the only
 *     read is "every proposal for one close run", filtered `close_run_id=eq.<id>`
 *     (api.ts:328-330). So the card fetches that list and picks its own row by
 *     `proposal_id` — the same "pick by id from a list" fallback `staff_advance` documents
 *     (apps/web/lib/parts/types.ts:104-110), never a fabricated read function.
 *   `client_id` — the route to the close workbench, and NOT NULL on the row.
 *
 * NOTHING FROM THE PROPOSAL'S OWN CONTENT RIDES HERE — not `state`, not `narrative`, not
 * `drafted`, not `bound_digests`, not `model_name`. `state` is the one a copy would actively
 * lie about: at most one proposal per run is ever `open` (`uq_close_proposal_live`,
 * 0138:482), and a human adopting or withdrawing it flips that value under a card already on
 * screen. The card re-reads; it never renders a remembered verdict.
 */
export type CloseProposalPart = {
  type: "close_proposal";
  proposal_id: string;
  close_run_id: string;
  client_id: string;
};

/**
 * ONE audited freeform read — the receipt of a SELECT the model composed and the DATABASE ran.
 *
 * HYDRATES `clara.freeform_read_log` (0131_f_a6_freeform_read.sql ALTERs the 0002 original at
 * :500-546; bookkeeper+ direct RLS read, and `apps/web/lib/reports/api.ts:184`'s
 * `listFreeformReads` already reads it). There is no act door, and there is no history
 * getter either — `clara.list_freeform_reads` does not exist anywhere in the estate
 * (fe-train-plan-2026-08-30.md:336 measured it at zero hits across 155 migrations), so the
 * card renders the one receipt it was handed and offers no "see all" link it cannot honour.
 *
 * THE RESULT ROWS ARE NOT HERE, AND THEY ARE NOWHERE DURABLE. `clara.wake_freeform_read`
 * hands its rows to the turn and nothing persists them — `apps/web/lib/reports/types.ts:
 * 115-119` states it: "A RECEIPT log, not the query's own result rows (those are never
 * persisted — only Clara's read of them, live in the chat, is ephemeral by design; the
 * durable artifact is this audit trail)." So this part addresses the RECEIPT — the SQL, the
 * stated purpose, the compiled scope, the rung vector, the row and byte counts, the outcome,
 * every one of them DB-owned — while the rows themselves stay exactly where the transcript
 * already carries them, in the `tool_result` part of the same turn.
 *
 * `read_id` IS A STRING CARRYING A BIGINT. `clara.freeform_read_log.id` is a bigint
 * (`apps/web/lib/reports/types.ts:120-121` types the row's own field `number`) and the verb
 * returns it as a jsonb NUMBER — `'read_id', v_read_id` at 0131:1266. It is rendered as text
 * on this wire for the same reason `clara.agent_receipt_contract` ordinal 2 renders every
 * member primary key as text: a part is persisted to jsonb and re-parsed by a browser, and a
 * bigint that round-trips through a JS number is a number that can come back wrong. The
 * emitter (`toTypedParts_v16`) stringifies once, at the boundary; the card filters
 * `id=eq.<read_id>`.
 */
export type FreeformResultPart = { type: "freeform_result"; read_id: string };

/** The four kinds Q8 adds, as ONE union — the shape `ClaraPartV16` widens `ClaraPartV15` by,
 *  and the exact set P6-2's reader transcribes. Named so a census can assert "exactly four"
 *  against a declaration rather than against a comment. */
export type ClaraPartV16Additions = AgentReceiptPart | FirmQuestionPart | CloseProposalPart | FreeformResultPart;

/** The four kinds' discriminants, spelled ONCE, in declaration order. The union above is the
 *  authority on the SHAPES; this array exists so a test (and P6-2's catalog parity cell) can
 *  assert the NAMES without retyping them — "spelling is not identity" applies to a card
 *  catalog as much as to a database guard. */
export const CHATTURN_V16_PART_KINDS = ["agent_receipt", "firm_question", "close_proposal", "freeform_result"] as const;
