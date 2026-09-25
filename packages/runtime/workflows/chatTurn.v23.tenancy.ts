// @frozen
//
// FROZEN — part of the chatTurn_v23 closure. THE FOUR TENANCY TOOLS OF #1137.
//
// A NEW frozen closure beside byte-untouched chatTurn_v1..v22. `chatTurn.v22`'s roster cell
// asserts all four names absent BY NAME "and that is a ruling": at that cut the ten tenancy doors
// of 0300 were `clara_authenticated`-only, cohort `TENANCY_RENT_0300_HUMAN_FNS`, zero machine-lane
// grants. The riders sweep wave built the machine-lane halves in
// `0353_tenancy_agent_twins_obo_confirmations.sql` (hosted 2026-09-25) under the owner's ruling of
// that date, so the ruling is unwound here.
//
// TWO POOLS, AND THE DIFFERENCE IS THE POINT. The READS run inside `readScoped`, which mints a
// plain `interactive` credential on behalf of the initiating human on the `clara_agent_ro` read
// pool — exactly the one wake kind 0353 allowlists. The CONFIRMATIONS run inside
// `pools().withRuntime`, which SET ROLEs to `clara_runtime`, exactly how
// `runStartPrepaymentScheduleWork` calls `clara.create_prepayment_schedule_for`.
//
// NO NEW PART KIND, AND THAT IS A MEASUREMENT RATHER THAN A PREFERENCE (`waveS-lane08-fix.md`
// §7.2). `work_result` IS declared and emittable, but EVERY ONE of its construction sites is a
// `claraWork.*.impl.ts` — six when the fix round measured it, seven once this wave's own
// `claraWork_v7` landed, and not one of them in any `chatTurn.*`
// (`node packages/runtime/scripts/check-parts-parity.mjs` prints the census on every run, and
// `tests/p6-1-parts-parity.test.mjs` pins the list by name). The chat lane has never emitted it,
// and the kind means "a Work run
// reporting its result", which is not what a tool call inside a turn is. The nearest precedent is
// not near by analogy, it is the SAME SHAPE — an on-behalf-of act taken from the conversation
// through a `_for` door on `pools().withRuntime` — so both confirmations return a TYPED TOOL
// RESULT and emit no part of their own. `check-parts-parity.mjs` stays the arbiter.
//
// WHAT THIS MODULE DELIBERATELY DOES NOT DO, from #1137's own list:
//   - no settle tool (`clara.settle_rent_payable` is `clara_authenticated`-only and 0353's tail
//     asserts it stayed that way; two candidate lines of the same amount in one window are two
//     lines a PERSON adjudicates, where they can see both);
//   - no record-terms tool (what a page says is a person's own reading);
//   - no call to an ungranted core (`clara._tenancy_lease_treatment`,
//     `clara._tenancy_rent_plan_draft`, `clara._tenancy_escalation_state`,
//     `clara._rent_payable_unsettled` are granted to nobody and reached only from the doors).

import { z } from "zod";
import { stableOpKey } from "./chatTurn.v11.tools.js";
import { pools, readScoped, type PgExec, type ToolCtx } from "./chatTurn.v15.infra.js";
import {
  governedRefusalV23,
  internalFaultV23,
  notPermittedV23,
  requireClientPinV23,
  type ToolRefusalV23,
} from "./chatTurn.v23.refusals.js";

// =============================================================================================
// 1 · `read_tenancy_terms` (#949 item 1) — WHAT A TENANCY SAYS, AS IT WAS RECORDED.
// =============================================================================================

/** The tool name, as the model sees it and as every census counts it. */
export const READ_TENANCY_TERMS_TOOL = "read_tenancy_terms";

/**
 * #949's input, unchanged. NO `client_id`, and none should be added: all three doors take the
 * DOCUMENT, and each core resolves the client itself under the credential's firm — a client
 * argument would be one more existence surface for no gain.
 *
 * THAT IS NOT THE SAME AS NO CLIENT WALL, and the first cut of this tool conflated the two
 * (ADV-K04-01). The doors are FIRM-scoped, so out of a conversation pinned to one client this tool
 * answered with ANOTHER client's tenancy — driven on `clara_c04`. The wall is in the BODY, against
 * the terms door's own answer, and it costs no argument and no extra door.
 */
export const readTenancyTermsInputSchema = z
  .object({
    document_id: z.string().uuid().describe("the filed tenancy agreement to read"),
  })
  .strict();

export type ReadTenancyTermsInput = z.infer<typeof readTenancyTermsInputSchema>;

/** #1137's refusal sentences for this read, spelled once. */
export const TENANCY_TERMS_REFUSALS: Readonly<Record<string, string>> = Object.freeze({
  /** CLR03 — no credential, a kind that is not allowlisted, no `on_behalf_of`, or a CLIENT-PINNED
   *  credential (the four document-scoped doors refuse a pinned one outright). The document is
   *  NEVER named here. */
  not_permitted: "I cannot read your firm's agreements in this conversation.",
  /** CLR11 — and another firm's real tenancy answers identically, deliberately. The id in the
   *  sentence would be the caller's own, so it leaks nothing, and it is left out anyway. */
  not_found: "I cannot find that agreement under your firm.",
  /** The document is an agreement, but not a tenancy. A deterministic evaluator decided that from
   *  the words the page uses for itself. */
  not_a_tenancy: "That agreement is not a tenancy, so there is no rent plan to read.",
});

export type ReadTenancyTermsResult =
  | {
      ok: true;
      status: "read";
      document_id: string;
      /** `clara.wake_get_contract_terms`'s answer, carried through unchanged. */
      terms: unknown;
      /** `clara.wake_get_tenancy_rent_plan_draft`'s answer, carried through unchanged. */
      draft: unknown;
      /** `clara.wake_propose_contract_terms`'s answer, ONLY when nothing is recorded; null
       *  otherwise, and the null is the ruling rather than an omission. */
      proposal: unknown;
    }
  | ToolRefusalV23;

/** The recorded terms out of the door's answer, as a countable list. A door that answered
 *  something this module cannot count is treated as having recorded nothing, which is the
 *  conservative branch: it offers the proposal beside an unreadable record rather than claiming a
 *  record exists. */
function recordedTerms(answer: unknown): unknown[] {
  const bag = (answer ?? {}) as Record<string, unknown>;
  return Array.isArray(bag.terms) ? (bag.terms as unknown[]) : [];
}

/** The client `clara.wake_get_contract_terms` resolved for this document, or null when the answer
 *  does not carry one. The door builds it as
 *  `jsonb_build_object('document_id', …, 'client_id', v_client, …)` from the live filing, so it is
 *  the estate's own answer to "whose document is this" rather than anything this module derives. */
export function clientOfTerms(answer: unknown): string | null {
  if (answer === null || typeof answer !== "object" || Array.isArray(answer)) return null;
  const value = (answer as Record<string, unknown>).client_id;
  return typeof value === "string" && value !== "" ? value : null;
}

/**
 * The class verdict, as a pure function of the draft door's own answer.
 *
 * Returns the class to REPORT when the document is not a tenancy, and null when it is one (or
 * when the draft could not be read at all, which is not a class verdict and must not be reported
 * as one).
 */
export function tenancyRefusedByClass(draft: unknown): string | null {
  if (draft === null || typeof draft !== "object" || Array.isArray(draft)) return null;
  const bag = draft as Record<string, unknown>;
  const cls = typeof bag.agreement_class === "string" ? bag.agreement_class : null;
  const refusals = Array.isArray(bag.refusals) ? bag.refusals.map((r) => String(r)) : [];
  if (refusals.includes("not_a_tenancy")) return cls ?? "unknown";
  if (cls !== null && cls !== "tenancy") return cls;
  return null;
}

/**
 * What a tenancy says, as it was recorded, plus the treatment branch and the drafted plan.
 *
 * THE PROPOSAL IS READ ONLY WHEN NOTHING IS RECORDED, and that is #1137's own ruling rather than
 * an optimisation: the RECORD is what a person decided, the proposal is what a machine read, and
 * offering the second beside the first invites the model to prefer its own reading.
 */
export async function runReadTenancyTerms(
  ctx: ToolCtx,
  input: ReadTenancyTermsInput,
): Promise<ReadTenancyTermsResult> {
  try {
    return await readScoped(ctx, async (c: PgExec) => {
      const termsRow = await c.query(
        "select clara.wake_get_contract_terms($1::uuid) as terms",
        [input.document_id],
      );
      const terms = (termsRow.rows[0]?.terms ?? null) as unknown;
      // v21's PROVENANCE WALL, and this tool was the only one of the fifty-two without it. The
      // three doors are FIRM-scoped (each refuses a client-pinned credential outright), so a
      // document id carried forward from an earlier turn, or pasted, read ANOTHER client's rent,
      // term, deposit and drafted plan inside this client's workspace — driven on `clara_c04`
      // during the review round. The terms door's own answer NAMES the client it resolved, so the
      // comparison needs no new door and no new argument, and an UNPINNED (firm-level) session —
      // the one this tool was designed for — has no client to contradict and is untouched.
      const termsClient = clientOfTerms(terms);
      if (ctx.clientId !== null && termsClient !== null && termsClient !== ctx.clientId) {
        return {
          ok: false as const,
          code: "CLR11",
          reason: "not_found",
          fix: "Open this conversation from the client whose tenancy you mean, then ask again.",
          // THE SAME SENTENCE a document the firm does not hold gets. A tool that distinguished
          // them would be an existence oracle over the firm's other clients' filings.
          message: TENANCY_TERMS_REFUSALS.not_found!,
          details: {},
        };
      }
      const draftRow = await c.query(
        "select clara.wake_get_tenancy_rent_plan_draft($1::uuid) as draft",
        [input.document_id],
      );
      const draft = (draftRow.rows[0]?.draft ?? null) as unknown;
      const notATenancy = tenancyRefusedByClass(draft);
      if (notATenancy !== null) {
        return {
          ok: false as const,
          code: "CLR10",
          reason: "not_a_tenancy",
          fix: null,
          message: TENANCY_TERMS_REFUSALS.not_a_tenancy!,
          details: { agreement_class: notATenancy },
        };
      }
      const recorded = recordedTerms(terms);
      const proposal = recorded.length === 0
        ? ((await c.query("select clara.wake_propose_contract_terms($1::uuid) as proposal", [input.document_id]))
            .rows[0]?.proposal ?? null) as unknown
        : null;
      return {
        ok: true as const,
        status: "read" as const,
        document_id: input.document_id,
        terms,
        draft,
        proposal,
      };
    });
  } catch (error) {
    return tenancyReadRefusal(error);
  }
}

/**
 * The refusal envelope both document-scoped tenancy reads share.
 *
 * IT NAMES THE TOOL'S OWN TOKEN, and that is a measurement rather than a nicety: the wake door
 * answers `CLR11` with a sentence and NO `detail.reason` (driven in `chat-turn-v23-e2e.mjs` against
 * a document the firm does not hold), so a map that replaced only the message would hand the model
 * `reason: null` and lose the token #1137's refusal table tells a caller to branch on.
 */
export function tenancyReadRefusal(error: unknown, internalMessage = "That tenancy could not be read."): ToolRefusalV23 {
  return governedRefusalV23(
    error,
    (_reason, _detail, code) => {
      // CLR03 IS THIS READ'S OWN SENTENCE. `authoringRefusal` replaces the message of any CLR03
      // with the AUTHORING lane's literal, so #1137's sentence shipped as a constant nothing
      // reached — and a READ is not an authoring action.
      if (code === "CLR03") return notPermittedV23(TENANCY_TERMS_REFUSALS.not_permitted!);
      if (code === "CLR11") return { reason: "not_found", message: TENANCY_TERMS_REFUSALS.not_found! };
      return null;
    },
    internalMessage,
  );
}

// =============================================================================================
// 2 · `read_rent_settlement_candidates` (#949 item 4) — WHICH MONTHS OF RENT ARE STILL OPEN, AND
//     THE DEPOSIT CODING BESIDE THEM.
//
// IT OFFERS EVERY CANDIDATE AND CHOOSES NONE, even when exactly one is offered. A deposit is
// never drafted from the agreement: signing STATES a term, it does not say the money moved.
// =============================================================================================

/** The tool name, as the model sees it and as every census counts it. */
export const READ_RENT_SETTLEMENT_CANDIDATES_TOOL = "read_rent_settlement_candidates";

/** #949's input, unchanged: the client, and nothing that could pick a candidate. */
export const readRentSettlementCandidatesInputSchema = z
  .object({
    client_id: z.string().uuid().describe("the client whose rent and deposits these are"),
  })
  .strict();

export type ReadRentSettlementCandidatesInput = z.infer<typeof readRentSettlementCandidatesInputSchema>;

/** The empty-state sentence, reused verbatim rather than re-spelled. */
export const NO_RENT_MONTH_AWAITING_PAYMENT = "No month of rent is waiting on its payment.";

/** #1137's refusal sentences for this read, spelled once. */
export const RENT_CANDIDATES_REFUSALS: Readonly<Record<string, string>> = Object.freeze({
  /** CLR03 — the credential cannot reach this client's rent at all. */
  not_permitted: "I cannot read this client's rent in this conversation.",
  /** CLR11 — and another firm's real client answers identically. */
  client_not_found: "I cannot find that client under your firm.",
});

export type ReadRentSettlementCandidatesResult =
  | {
      ok: true;
      status: "read";
      client_id: string;
      /** `clara.wake_get_rent_settlement_candidates`'s rows, carried through unchanged — every
       *  candidate of every month, and none of them chosen. */
      months: unknown[];
      /** `clara.wake_get_tenancy_deposit_coding`'s rows, carried through unchanged. */
      deposits: unknown[];
      empty_sentence: string | null;
    }
  | ToolRefusalV23;

function rowsOf(answer: unknown): unknown[] {
  return Array.isArray(answer) ? (answer as unknown[]) : [];
}

/**
 * Which months of rent still owe their payment, and what the deposits coding offers.
 *
 * TWO WALLS AND THEN THE DOORS, the same two every client-scoped read of this cut carries.
 */
export async function runReadRentSettlementCandidates(
  ctx: ToolCtx,
  input: ReadRentSettlementCandidatesInput,
): Promise<ReadRentSettlementCandidatesResult> {
  const pin = requireClientPinV23(ctx, input.client_id, {
    noPinReason: "rent_candidates_needs_client_pin",
    noPinMessage:
      "This conversation is not bound to a client, so there is no rent of theirs to report on.",
    mismatchReason: "client_not_in_conversation",
    mismatchMessage:
      "That is not the client this conversation is about, so I will not read their rent here.",
  });
  if (pin.ok !== true) return pin;
  const clientId = pin.clientId;
  try {
    return await readScoped(ctx, async (c: PgExec) => {
      const monthsRow = await c.query(
        "select clara.wake_get_rent_settlement_candidates($1::uuid) as months",
        [clientId],
      );
      const months = rowsOf(monthsRow.rows[0]?.months ?? null);
      const depositsRow = await c.query(
        "select clara.wake_get_tenancy_deposit_coding($1::uuid) as deposits",
        [clientId],
      );
      const deposits = rowsOf(depositsRow.rows[0]?.deposits ?? null);
      return {
        ok: true as const,
        status: "read" as const,
        client_id: clientId,
        months,
        deposits,
        empty_sentence: months.length === 0 ? NO_RENT_MONTH_AWAITING_PAYMENT : null,
      };
    });
  } catch (error) {
    return governedRefusalV23(
      error,
      (_reason, _detail, code) => {
        if (code === "CLR03") return notPermittedV23(RENT_CANDIDATES_REFUSALS.not_permitted!);
        if (code === "CLR11") return { reason: "client_not_found", message: RENT_CANDIDATES_REFUSALS.client_not_found! };
        return null;
      },
      "That client's rent settlement state could not be read.",
    );
  }
}

// =============================================================================================
// 3 · `confirm_tenancy_rent_plan` (#949 item 2, built under the owner's ruling of 2026-09-25).
//
// AN ACT, NOT A READ. It runs on `pools().withRuntime` (`clara_runtime`) against the OBO twin
// `clara.confirm_tenancy_rent_plan_for` — never `clara.confirm_tenancy_rent_plan`, which stays
// `clara_authenticated`-only. The act is recorded as the PERSON the turn acts for
// (`ctx.createdBy`), never as the agent, and the trail says it was taken in a conversation.
// =============================================================================================

/** The tool name, as the model sees it and as every census counts it. */
export const CONFIRM_TENANCY_RENT_PLAN_TOOL = "confirm_tenancy_rent_plan";

/** #1137's input, unchanged. Every nullable key is an ANSWER on this wire, not an omitted one:
 *  null takes the draft's own account, and a null judgement is "I have none", which the door's
 *  judgement wall then answers with its branch's own question. */
export const confirmTenancyRentPlanInputSchema = z
  .object({
    client_id: z.string().uuid(),
    document_id: z.string().uuid().describe("the filed tenancy agreement whose plan is being confirmed"),
    rent_account: z
      .string()
      .trim()
      .min(1)
      .max(32)
      .nullable()
      .describe("the expense account to debit; null takes the draft's own 6100 Rental of Premises"),
    payable_account: z
      .string()
      .trim()
      .min(1)
      .max(32)
      .nullable()
      .describe("the liability account to credit; null takes the draft's own 2050 Rent Payable"),
    judgement: z
      .string()
      .trim()
      .min(1)
      .max(4000)
      .nullable()
      .describe("REQUIRED when the lessee branch asks; the accountant's own written treatment"),
  })
  .strict();

export type ConfirmTenancyRentPlanInput = z.infer<typeof confirmTenancyRentPlanInputSchema>;

/**
 * THE REFUSAL LADDER, IN ORDER, so a tool author does not reorder it.
 *
 * `waveS-lane08-fix.md` §7.1 names `client_inactive`'s position exactly: it fires AFTER the op-key
 * wall, the firm wall, the filing and kind walls, the reservation, `rent_plan_already_confirmed`,
 * `payable_account_in_use`, the draft's own refusals and the judgement wall — it is the LAST wall,
 * because it lives in the plan step. A replay of an already-successful confirmation returns the
 * stored receipt and never reaches it.
 */
export const CONFIRM_RENT_PLAN_LADDER: readonly string[] = Object.freeze([
  "invalid_op_key",
  "invalid_author",
  "client_not_found",
  "confirm_wrong_kind",
  "terms_incomplete",
  "operation_in_flight",
  "rent_plan_already_confirmed",
  "payable_account_in_use",
  "plan_credits_bank_account",
  "account_not_in_chart",
  "professional_judgement_required",
  "client_inactive",
]);

/**
 * The sentences this cut renders. FOUR TOKENS OF THE LADDER ARE DELIBERATELY ABSENT:
 *
 *  - `professional_judgement_required` — the refusal's MESSAGE is the branch's own question, and
 *    it is given VERBATIM. Composing a sentence for it would replace the standard's question with
 *    this module's paraphrase, which is the one thing #949 forbids by name.
 *  - `invalid_op_key` / `invalid_author` — neither can be caused by a person; both mean the tool
 *    built its call wrong, so they are internal faults with no sentence and no remedy.
 *  - `client_not_found` (CLR11) and the two CLR04 arms are the estate's own and are carried by
 *    the door's message, identical for a non-member author — deliberately.
 */
export const CONFIRM_RENT_PLAN_REFUSALS: Readonly<Record<string, string>> = Object.freeze({
  plan_credits_bank_account:
    "That payable account is one of this client's own bank accounts, so the plan would credit the bank. "
    + "Give the tenancy a liability account instead.",
  payable_account_in_use:
    "Another tenancy's live rent plan already uses that payable account, and two plans on one account share "
    + "their payments month for month. Give this tenancy its own liability account.",
  account_not_in_chart:
    "That account is not in this client's chart, or is inactive. Adding it is the chart door's act, not this one's.",
  rent_plan_already_confirmed:
    "A rent plan already runs on this tenancy. Ending or revising it is the plan lane's own act.",
  confirm_wrong_kind: "That document is not an agreement contract.",
  terms_incomplete:
    "There is no rent plan to confirm yet: some of the tenancy's terms are not recorded, and recording them "
    + "is a person's act on the Contract page.",
  /** waveS-lane08-fix.md §7.1 — `clara.create_accounting_plan`'s own sentence, carried word for
   *  word, now raised by `clara._tenancy_plan_core` too. */
  client_inactive:
    "This client is not active, so no new accounting plan can be created for it. Reactivate the client first.",
  /** The reservation is held by a sibling that has not finished. NOT a door refusal: these two
   *  cores return `clara._reserve_op`'s `{"pending": true}` VERBATIM rather than raising `CLR13`
   *  the way the estate's other reserving doors do, so the tool names the rung itself. */
  operation_in_flight:
    "That confirmation is already being recorded. Ask again in a moment rather than confirming a "
    + "second time.",
});

/** The receipt `clara.confirm_tenancy_rent_plan_for` returns, as much of it as the tool reports. */
export type RentPlanReceipt = {
  document_id: string | null;
  client_id: string | null;
  confirmation_id: string | null;
  plan_id: string | null;
  revision_id: string | null;
  status: string | null;
  /** A COUNT — 24 for a two-year monthly tenancy — never a list. */
  occurrences: number | null;
  next_occurrences: unknown;
  overlap_warning: unknown;
  treatment: unknown;
  professional_judgement: string | null;
};

/**
 * The receipt, shaped for the model. NO `type` DISCRIMINANT, and that is §7.2's settlement: this
 * is a typed tool RESULT in `runStartPrepaymentScheduleWork`'s shape, and the turn's existing
 * mapping decides what reaches the wire. Emitting `work_result` from the chat lane would make it
 * the seventh construction site of a kind that has meant "a Work run reporting its result" for six
 * versions, and would need a parity entry.
 */
export function rentPlanPart(receipt: Record<string, unknown>): RentPlanReceipt {
  const str = (v: unknown): string | null => (v == null ? null : String(v));
  return {
    document_id: str(receipt.document_id),
    client_id: str(receipt.client_id),
    confirmation_id: str(receipt.confirmation_id),
    plan_id: str(receipt.plan_id),
    revision_id: str(receipt.revision_id),
    status: str(receipt.status),
    occurrences: receipt.occurrences == null ? null : Number(receipt.occurrences),
    next_occurrences: receipt.next_occurrences ?? null,
    overlap_warning: receipt.overlap_warning ?? null,
    treatment: receipt.treatment ?? null,
    professional_judgement: str(receipt.professional_judgement),
  };
}

export type ConfirmTenancyRentPlanResult =
  | { ok: true; status: "confirmed"; plan: RentPlanReceipt }
  | ToolRefusalV23;

/**
 * WHETHER THE RESERVATION IS STILL HELD BY A SIBLING.
 *
 * `clara._reserve_op` answers `{"pending": true}` when the key exists but the first call has not
 * finished, and both tenancy cores `return v_dedupe` at that point rather than raising `CLR13`
 * `operation_in_flight` the way `replace_revenue_recognition_schedule`, `skip_plan_occurrence` and
 * `set_firm_document_limits` do. Read as "no plan id" that became "nothing was recorded", which is
 * the opposite of the truth: something may be being recorded at that very moment.
 */
export function reservationPending(receipt: Record<string, unknown> | null): boolean {
  return receipt !== null && receipt.pending === true;
}

/** The refusal for it. CLR13 is the sqlstate the estate's other reserving doors raise for exactly
 *  this condition, so it is the one a caller branching on the code should see. */
export function reservationInFlightV23(message: string): ToolRefusalV23 {
  return {
    ok: false,
    code: "CLR13",
    reason: "operation_in_flight",
    fix: "Ask again in a moment; the first confirmation is still being recorded.",
    message,
    details: {},
  };
}

/**
 * NO `replayed` FLAG, AND THAT IS A MEASUREMENT.
 *
 * `waveS-lane08-fix.md` §7.2 spells the return with `replayed: receipt.replayed === true`, and
 * that expression is a CONSTANT FALSE against the doors as they ship: `clara._finish_op` stores
 * the core's own `jsonb_build_object`, which carries no `replayed` key in either core, and
 * `clara._reserve_op` hands that stored payload back VERBATIM on a converged replay (both read out
 * of `pg_proc` on `clara_c04`; the review round drove two calls with the same task id and the same
 * input, got the same `confirmation_id` and `plan_id`, and both reported `replayed: false`). A
 * field the estate cannot answer is worse than an absent one — the model would tell a person it
 * had just confirmed a plan that was confirmed earlier in the same conversation — so it is absent,
 * and the successor contract for a core that STAMPS a replay marker is recorded in the fix report.
 */

/**
 * The op key, exported so a cell can drive it without a database.
 *
 * A STABLE KEY, DELIBERATELY, and `waveS-lane08-fix.md` §7.3 is the record of why: #949 wrote "a
 * FRESH `p_op_key` per act" for the WEB surface, where two clicks are two intents. In chat a
 * retried tool call is ONE intent. The core's reservation hashes the caller's five arguments and
 * NOT the named author, so a chat confirmation and a human replay of the same decision under the
 * same key converge on ONE receipt and ONE plan — and the key must therefore never be derived
 * from anything that can outlive the initiating person. `ctx.taskId` does not.
 */
export function confirmTenancyRentPlanOpKey(ctx: ToolCtx, input: ConfirmTenancyRentPlanInput): string {
  return stableOpKey(ctx.taskId, CONFIRM_TENANCY_RENT_PLAN_TOOL, input);
}

/** Confirm a tenancy's rent plan, as the person this turn acts for. */
export async function runConfirmTenancyRentPlan(
  ctx: ToolCtx,
  input: ConfirmTenancyRentPlanInput,
): Promise<ConfirmTenancyRentPlanResult> {
  const pin = requireClientPinV23(ctx, input.client_id, {
    noPinReason: "rent_plan_needs_client_pin",
    noPinMessage:
      "This conversation is not bound to a client, so I cannot confirm a rent plan here.",
    mismatchReason: "rent_plan_client_mismatch",
    mismatchMessage:
      "That is not the client this conversation is about, so I will not confirm a rent plan on their books.",
  });
  if (pin.ok !== true) return pin;
  const clientId = pin.clientId;
  const opKey = confirmTenancyRentPlanOpKey(ctx, input);
  try {
    const receipt = await pools().withRuntime(async (c: PgExec) => {
      // `p_judgement` IS SENT EXPLICITLY EVEN WHEN NULL: null is an answer on this wire, not an
      // omitted key.
      const r = await c.query(
        "select clara.confirm_tenancy_rent_plan_for("
        + "p_client          => $1::uuid, "
        + "p_author          => $2::uuid, "
        + "p_document        => $3::uuid, "
        + "p_rent_account    => $4::text, "
        + "p_payable_account => $5::text, "
        + "p_judgement       => $6::text, "
        + "p_op_key          => $7::text) as r",
        [
          clientId,
          ctx.createdBy,
          input.document_id,
          input.rent_account,
          input.payable_account,
          input.judgement,
          opKey,
        ],
      );
      return (r.rows[0]?.r ?? null) as Record<string, unknown> | null;
    });
    if (reservationPending(receipt)) return reservationInFlightV23(CONFIRM_RENT_PLAN_REFUSALS.operation_in_flight!);
    if (!receipt || receipt.plan_id == null) {
      return internalFaultV23("The rent plan could not be confirmed. Nothing was recorded.");
    }
    return {
      ok: true,
      status: "confirmed",
      plan: rentPlanPart(receipt),
    };
  } catch (error) {
    return governedRefusalV23(
      error,
      (reason) => CONFIRM_RENT_PLAN_REFUSALS[reason] ?? null,
      "The rent plan could not be confirmed. Nothing was recorded.",
    );
  }
}

// =============================================================================================
// 4 · `confirm_tenancy_rent_plan_revision` (#949 item 3, under the same ruling).
//
// THE OFFER IS READ FIRST, ON THE READ POOL, AND THE ACT IS TAKEN SECOND, ON THE RUNTIME POOL —
// #1137's own order. The read is what lets the turn say what the plan charges TODAY, what it would
// charge, and from when; the act is what records the revision as the person the turn acts for.
// =============================================================================================

/** The tool name, as the model sees it and as every census counts it. */
export const CONFIRM_TENANCY_RENT_PLAN_REVISION_TOOL = "confirm_tenancy_rent_plan_revision";

/** #1137's input, unchanged. The judgement is NULLABLE here and required in practice: a stepped
 *  rent always makes the branch ask, and that is the DOOR's wall to raise, not the schema's — a
 *  schema that required it would refuse before the branch could hand over its own question. */
export const confirmTenancyRentPlanRevisionInputSchema = z
  .object({
    client_id: z.string().uuid(),
    document_id: z.string().uuid(),
    judgement: z
      .string()
      .trim()
      .min(1)
      .max(4000)
      .nullable()
      .describe("a stepped rent ALWAYS makes the branch ask, so in practice this is required"),
  })
  .strict();

export type ConfirmTenancyRentPlanRevisionInput = z.infer<typeof confirmTenancyRentPlanRevisionInputSchema>;

/** The ladder, in order, as for the confirmation: the same walls, and the revision's own tokens
 *  where the plan step's would be. */
export const CONFIRM_RENT_REVISION_LADDER: readonly string[] = Object.freeze([
  "invalid_op_key",
  "invalid_author",
  "client_not_found",
  "no_confirmed_plan",
  "no_escalation_recorded",
  "already_revised",
  "not_due_yet",
  "operation_in_flight",
  "professional_judgement_required",
]);

/**
 * The sentences this cut renders.
 *
 * `no_escalation_recorded` AND `no_confirmed_plan` BOTH ANSWER `nothing_to_revise` in #1137's
 * table, and each keeps its OWN sentence here, because what a person does next differs: recording
 * an escalation is their act on the Contract page (the frozen questionnaire has no question for a
 * rent review), and confirming a plan is the other tool's.
 *
 * `professional_judgement_required` is absent for the confirmation's reason: the refusal's MESSAGE
 * is the branch's own question, given verbatim.
 */
export const CONFIRM_RENT_REVISION_REFUSALS: Readonly<Record<string, string>> = Object.freeze({
  no_escalation_recorded:
    "No escalation is recorded on this tenancy, so there is nothing to revise. Recording one is a person's act: "
    + "the agreement questionnaire has no question for a rent review.",
  no_confirmed_plan: "No rent plan runs on this tenancy yet, so there is nothing to revise.",
  not_due_yet:
    "That escalation is real but further out than the sixty-day lead, so it cannot be recorded yet.",
  already_revised: "The plan already charges the escalated rent.",
});

/** The receipt `clara.confirm_tenancy_rent_plan_revision_for` returns. */
export type RentPlanRevisionReceipt = {
  document_id: string | null;
  client_id: string | null;
  confirmation_id: string | null;
  plan_id: string | null;
  revision: number | null;
  revision_id: string | null;
  from_cents: number | null;
  to_cents: number | null;
  effective_from: string | null;
  treatment: unknown;
  professional_judgement: string | null;
};

/** The receipt, shaped for the model. NO `type` discriminant, for §7.2's reason. BOTH FIGURES are
 *  carried: a revision a person confirms after seeing only one of them is a revision they were
 *  not shown. */
export function rentPlanRevisionPart(receipt: Record<string, unknown>): RentPlanRevisionReceipt {
  const str = (v: unknown): string | null => (v == null ? null : String(v));
  const num = (v: unknown): number | null => (v == null ? null : Number(v));
  return {
    document_id: str(receipt.document_id),
    client_id: str(receipt.client_id),
    confirmation_id: str(receipt.confirmation_id),
    plan_id: str(receipt.plan_id),
    revision: num(receipt.revision),
    revision_id: str(receipt.revision_id),
    from_cents: num(receipt.from_cents),
    to_cents: num(receipt.to_cents),
    effective_from: str(receipt.effective_from),
    treatment: receipt.treatment ?? null,
    professional_judgement: str(receipt.professional_judgement),
  };
}

/**
 * `offer` IS A DELIBERATE WIDENING of §7.2's shape, and it is recorded rather than smuggled
 * (SPEC-K-L04-06). §7.2 writes `{ ok, status, plan, replayed }`; this returns the escalation
 * offer beside them because the read that produced it ran BEFORE the act — it is what lets the
 * turn say what the plan charged and what it now charges out of the same answer the person was
 * shown, rather than out of the receipt alone. `replayed` is gone for the reason above.
 */
export type ConfirmTenancyRentPlanRevisionResult =
  | { ok: true; status: "revised"; plan: RentPlanRevisionReceipt; offer: unknown }
  | ToolRefusalV23;

/** The revision's own op key. It is STABLE for §7.3's reason, and it lives in its OWN namespace:
 *  a revision is not a confirmation, and one key for both would make a retried revision converge
 *  on the confirmation's receipt. */
export function confirmTenancyRentPlanRevisionOpKey(
  ctx: ToolCtx,
  input: ConfirmTenancyRentPlanRevisionInput,
): string {
  return stableOpKey(ctx.taskId, CONFIRM_TENANCY_RENT_PLAN_REVISION_TOOL, input);
}

/** Confirm a tenancy rent plan's escalation revision, as the person this turn acts for. */
export async function runConfirmTenancyRentPlanRevision(
  ctx: ToolCtx,
  input: ConfirmTenancyRentPlanRevisionInput,
): Promise<ConfirmTenancyRentPlanRevisionResult> {
  const pin = requireClientPinV23(ctx, input.client_id, {
    noPinReason: "rent_revision_needs_client_pin",
    noPinMessage:
      "This conversation is not bound to a client, so I cannot confirm a rent revision here.",
    mismatchReason: "rent_revision_client_mismatch",
    mismatchMessage:
      "That is not the client this conversation is about, so I will not revise a rent plan on their books.",
  });
  if (pin.ok !== true) return pin;
  const clientId = pin.clientId;
  const opKey = confirmTenancyRentPlanRevisionOpKey(ctx, input);
  let offer: unknown = null;
  try {
    // 1 — THE OFFER, on the read pool. It is what lets the turn say both figures out loud before
    //     anything is recorded.
    offer = await readScoped(ctx, async (c: PgExec) => {
      const r = await c.query(
        "select clara.wake_get_tenancy_escalation_revision($1::uuid) as offer",
        [input.document_id],
      );
      return (r.rows[0]?.offer ?? null) as unknown;
    });
  } catch (error) {
    return tenancyReadRefusal(error, "That tenancy's escalation could not be read.");
  }
  try {
    // 2 — THE ACT, on the runtime pool, through the OBO twin.
    const receipt = await pools().withRuntime(async (c: PgExec) => {
      const r = await c.query(
        "select clara.confirm_tenancy_rent_plan_revision_for("
        + "p_client    => $1::uuid, "
        + "p_author    => $2::uuid, "
        + "p_document  => $3::uuid, "
        + "p_judgement => $4::text, "
        + "p_op_key    => $5::text) as r",
        [clientId, ctx.createdBy, input.document_id, input.judgement, opKey],
      );
      return (r.rows[0]?.r ?? null) as Record<string, unknown> | null;
    });
    if (reservationPending(receipt)) return reservationInFlightV23(CONFIRM_RENT_PLAN_REFUSALS.operation_in_flight!);
    if (!receipt || receipt.revision_id == null) {
      return internalFaultV23("The rent revision could not be recorded. Nothing was changed.");
    }
    return {
      ok: true,
      status: "revised",
      plan: rentPlanRevisionPart(receipt),
      offer,
    };
  } catch (error) {
    return governedRefusalV23(
      error,
      (reason) => CONFIRM_RENT_REVISION_REFUSALS[reason] ?? null,
      "The rent revision could not be recorded. Nothing was changed.",
    );
  }
}
