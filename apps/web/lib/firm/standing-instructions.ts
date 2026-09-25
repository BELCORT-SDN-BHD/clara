// #1050 — the firm's STANDING INSTRUCTION to Clara, and the two governed doors that give it and
// take it back (migration 0338 §B and §G).
//
// WHAT IT IS, in the firm's own words: "let Clara establish prepayment schedules at close". A
// clocked `close_prep` run has nobody at the keyboard, and every accounting plan in this estate
// names the person whose instruction authorises it — so until a NAMED MEMBER of the firm says in
// advance that Clara may do this, the unattended lane refuses `wake_authority_absent` and writes
// nothing. This module is the surface that lets a member say it, see that it stands, and withdraw
// it. Without it #1050's database half ships dark, which the standing owner ruling of 2026-09-20
// ("beta: nothing dark — a compliance gate prompts, it never disables") does not allow.
//
// THE READ NEEDS NO DOOR (law 31). `clara.firm_standing_instructions` carries FORCED row-level
// security with a `firm_id = clara.jwt_firm()` policy and grants `clara_authenticated` SELECT and
// nothing else — no INSERT, no UPDATE, no DELETE, and no grant at all to any machine lane. So the
// live row is an ordinary firm-scoped read, and the ONLY way to write one is through the two
// SECURITY DEFINER doors below.
//
// A FRESH OP KEY PER SUBMISSION, never a deterministic one, and it is the same reasoning
// `lib/firm/capacity-doors.ts` sets out at length: `clara.op_receipts` rows never expire, so a key
// derived from the instruction and its sentence would make a SECOND recording — after a
// withdrawal, by a different member, or with a restated reason — replay the first receipt and
// write nothing. Giving an instruction, taking it back and giving it again are three genuine acts
// of firm governance, and each owes its own row.
//
// NOTHING IS PAINTED AS TRUTH. Both doors answer with a receipt; the card re-reads the live row
// afterwards rather than trusting it (hydrate-never-trust, `lib/doors.ts`).

import { callDoor, isDoorRefusal, type CallDoorOptions } from "@/lib/doors";
import { getRows, type GetRowsOptions } from "@/lib/read";

export const FIRM_STANDING_INSTRUCTIONS_RELATION = "firm_standing_instructions";
export const RECORD_STANDING_INSTRUCTION_DOOR = "record_firm_standing_instruction";
export const WITHDRAW_STANDING_INSTRUCTION_DOOR = "withdraw_firm_standing_instruction";

/** The ONE instruction key migration 0338 mints. The door refuses any other by name, so this is a
 *  literal on both sides rather than a value a surface may compose. */
export const PREPAYMENT_SCHEDULE_AT_CLOSE = "prepayment_schedule_at_close";

type StandingInstructionRow = {
  readonly id: string;
  readonly instruction_key: string;
  readonly reason: string;
  readonly recorded_by: string;
  readonly recorded_at: string;
};

/** The live instruction, as the firm's own member may read it. */
export type FirmStandingInstruction = {
  readonly id: string;
  readonly instructionKey: string;
  /** The one-line reason the member gave it under. The row is the record of record. */
  readonly reason: string;
  readonly recordedBy: string;
  readonly recordedAt: string;
};

/** Absence is a legitimate state, not an error (law 2): a firm that has instructed nothing reads
 *  `null`, and the card says so in words rather than showing an empty box. */
export async function loadPrepaymentStandingInstruction(
  opts: Pick<GetRowsOptions, "session" | "signal"> = {},
): Promise<FirmStandingInstruction | null> {
  const rows = await getRows<StandingInstructionRow>(FIRM_STANDING_INSTRUCTIONS_RELATION, {
    select: "id,instruction_key,reason,recorded_by,recorded_at",
    filters: {
      instruction_key: `eq.${PREPAYMENT_SCHEDULE_AT_CLOSE}`,
      // THE LIVE ONE. Withdrawn rows are kept forever (0338 §A is append-only) so a plan written
      // while one stood still reads the basis it was written under; this read wants the one in
      // force, and the relation's own partial unique index guarantees there is at most one.
      withdrawn_at: "is.null",
    },
    limit: 1,
    session: opts.session,
    signal: opts.signal,
  });
  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id,
    instructionKey: row.instruction_key,
    reason: row.reason,
    recordedBy: row.recorded_by,
    recordedAt: row.recorded_at,
  };
}

/** What either door answered. A governed refusal is a STATE with the database's own sentence and
 *  its own reason token; it is never re-worded here and never retried. */
export type StandingInstructionOutcome =
  | { readonly kind: "recorded"; readonly instructionId: string }
  | { readonly kind: "withdrawn"; readonly instructionId: string }
  | {
      readonly kind: "refused";
      readonly code: string;
      readonly reason: string | null;
      /** 0338's `detail.axis` — which half of the input the door refused. */
      readonly axis: string | null;
      readonly message: string;
    }
  /** Transport, auth, or a response this build will not act on. */
  | { readonly kind: "unavailable" };

export type StandingInstructionParams = {
  /** The firm's own sentence. Both doors refuse a blank one BY NAME, so it is not pre-validated
   *  away here: the database's refusal is the one the person is shown. */
  readonly reason: string;
  /** Minted FRESH for THIS submission — see this file's header. */
  readonly opKey: string;
};

function refusal(err: unknown): StandingInstructionOutcome {
  if (!isDoorRefusal(err)) return { kind: "unavailable" };
  const axis = typeof err.detail?.axis === "string" ? err.detail.axis : null;
  return { kind: "refused", code: err.code ?? "CLR", reason: err.reason ?? null, axis, message: err.message };
}

function receiptId(out: unknown): string | null {
  if (typeof out !== "object" || out === null) return null;
  const id = (out as Record<string, unknown>).instruction_id;
  return typeof id === "string" && id.length > 0 ? id : null;
}

/** `clara.record_firm_standing_instruction(p_instruction_key, p_reason, p_op_key)` — admin floor,
 *  `clara_authenticated` only. Version-forward: an unchanged re-recording by the same member is
 *  idempotent; a restated reason withdraws the live row and inserts a fresh one. */
export async function recordPrepaymentStandingInstruction(
  params: StandingInstructionParams,
  opts: CallDoorOptions = {},
): Promise<StandingInstructionOutcome> {
  try {
    const out = await callDoor<Record<string, unknown>>(RECORD_STANDING_INSTRUCTION_DOOR, {
      p_instruction_key: PREPAYMENT_SCHEDULE_AT_CLOSE,
      p_reason: params.reason,
      p_op_key: params.opKey,
    }, opts);
    const id = receiptId(out);
    // POSITIVELY CHECKED. A 200 carrying a receipt this build cannot read is not evidence that
    // anything was recorded, and this card must never tell a firm Clara may act when it cannot.
    if (id === null) return { kind: "unavailable" };
    return { kind: "recorded", instructionId: id };
  } catch (err) {
    return refusal(err);
  }
}

/** `clara.withdraw_firm_standing_instruction(p_instruction_key, p_reason, p_op_key)` — the same
 *  floor and the same lane. Withdrawal closes the lane to NEW schedules; a plan already written
 *  keeps posting under the member who authorised it, exactly as #940's ruling leaves a running
 *  amortisation posting to term end when its account's roster enrolment is retired. */
export async function withdrawPrepaymentStandingInstruction(
  params: StandingInstructionParams,
  opts: CallDoorOptions = {},
): Promise<StandingInstructionOutcome> {
  try {
    const out = await callDoor<Record<string, unknown>>(WITHDRAW_STANDING_INSTRUCTION_DOOR, {
      p_instruction_key: PREPAYMENT_SCHEDULE_AT_CLOSE,
      p_reason: params.reason,
      p_op_key: params.opKey,
    }, opts);
    const id = receiptId(out);
    if (id === null) return { kind: "unavailable" };
    return { kind: "withdrawn", instructionId: id };
  } catch (err) {
    return refusal(err);
  }
}

export function newStandingInstructionOpKey(): string {
  return `op-standing-${crypto.randomUUID()}`;
}
