// @frozen
//
// FROZEN — part of the bankAgent_v1 closure (see bankAgent.v1.infra.ts for what this class is).
//
// THIS FILE (tools) — the AI-SDK wiring over exactly FOUR of the thirteen wrappers granted to
// clara_wake_bank. The other nine are deliberately NOT exposed, and the reason is a scope
// ruling, not an oversight: this lane matches and PROPOSES. wake_settle_from_bank_line,
// wake_resolve_and_book_bank_line, wake_unmatch_bank_match, wake_void_bank_reconciliation,
// wake_void_bank_statement, wake_complete_bank_reconciliation, wake_resolve_bank_line_exception,
// wake_add_bank_account and wake_upsert_account either mint books entries beyond bank matching
// or destroy existing work, and neither belongs to an unattended pass with no human in the
// room. Widening the set is a bankAgent_v2, with its own review.
//
// THE IN-RUN PACK RECORD (the same law autoDraft.v9.toolset.ts states for its read record).
// Every write wrapper takes p_inputs_digest, and 0129's freshness check requires that digest to
// name a REAL, PRIOR pack read bound to THIS task. The closure below remembers the digest the
// pack tool actually returned in THIS execution; a write attempted before any pack read is
// refused locally, by name, rather than sent to the database to fail with a CLR code nobody can
// read. A WDK REPLAY rebuilds this record EMPTY, which fails closed — that is the load-bearing
// half, not the ergonomics.

import { tool } from "ai";
import { z } from "zod";
import { PACK_TOOL, MATCH_TOOL, EXCEPTION_TOOL, PROMOTION_TOOL, bankModelIdentity } from "./bankAgent.v1.prompt.js";
import { bankScoped, bankOpKey, type BankTaskContext, type PgExec } from "./bankAgent.v1.infra.js";

/** DID THE DATABASE JUDGE THIS, or did the call never reach it? Only the estate's own typed
 *  refusal codes count as a verdict — a POSITIVE test on the one signal that means "the DB
 *  considered this and said no". Everything else (pools, a mint failure, a driver fault) falls to
 *  the other branch, which is the fail-safe direction: none of those is the model's fault. */
function isDbVerdict(e: unknown): boolean {
  const code = (e as { code?: unknown })?.code;
  return typeof code === "string" && /^CLR\d{2}$/.test(code);
}

/** One oracle-safe refusal string for every authority/tenant fault, identical regardless of
 *  whether the subject exists — the same shape autoDraft's safeRead uses, for the same reason:
 *  a refusal that varies with existence is an existence oracle.
 *
 *  IT ALSO RECORDS WHO IS AT FAULT (S9) — see BankRunRecord.infraFaults. */
function refusal(rec: BankRunRecord, e: unknown): { error: string } {
  const code = (e as { code?: string })?.code;
  if (!isDbVerdict(e)) rec.infraFaults += 1;
  if (code === "CLR03" || code === "CLR04" || code === "CLR10" || code === "CLR11") {
    return { error: `refused (${code}): this act is not available to this run on this client.` };
  }
  const message = e instanceof Error ? e.message : String(e);
  return { error: `the act did not go through: ${message}` };
}

/** The mutable per-run record. One per tool set, i.e. per model-step execution attempt. */
/** `packReads` counts pack reads ONLY, and only to keep their op keys distinct — see bankOpKey's
 *  own header for why a read carries a counter and a write must not (S2/S8). */
/** `infraFaults` counts tool calls that NEVER REACHED the database, so this lane cannot blame the
 *  model for its own bugs (S9) — see closePrep.v1.reads.ts's own record for the full statement. */
export type BankRunRecord = { digest: string | null; admitted: number; packReads: number; infraFaults: number };

export function newBankRunRecord(): BankRunRecord {
  return { digest: null, admitted: 0, packReads: 0, infraFaults: 0 };
}

/** Count a bank act, from a CLOSED WORLD OF THREE REPLY SHAPES.
 *
 *  THE BANK CORES DO NOT CARRY A UNIFORM ADMITTED MARKER, and that was measured rather than
 *  assumed: a refusal returns {status:'refused', ...} (0121:6008, :6023, :6238, :6255), but a
 *  SUCCESS returns the delegate's OWN result verbatim — `return v_res` (0121:6027), whose shape
 *  differs per verb (a match id here, an op receipt there). The 'admitted' vocabulary exists only
 *  on `bank_agent_receipts.outcome`, which the verb writes internally and which clara_runtime
 *  cannot read (measured on the rig: SELECT is granted to clara_authenticated and clara_fn_owner
 *  ONLY). So there is no single positive key to test, and inventing one would be worse than
 *  naming the limitation.
 *
 *  THE CLOSED WORLD, enumerated, is what makes this honest rather than absence-based: a call that
 *  THREW never reaches here (the caller turned it into {error}); a DB refusal says
 *  status='refused'; everything else is a real delegate result. Three shapes, no fourth.
 *
 *  WHAT THIS COUNT DRIVES, so the blast radius is on the record: the metering row's `outcome`
 *  label and the run's own returned outcome kind. BOTH the 'acted' and 'nothing_due' kinds settle
 *  the task COMPLETED, and no value derived here is ever passed into a DB verb — so a
 *  misclassification costs a wrong metering label, never a wrong number in the books
 *  (constraint 2). */
export function countIfAdmitted(rec: BankRunRecord, reply: unknown): unknown {
  const r = reply as { status?: unknown; error?: unknown } | null;
  if (r && typeof r === "object" && r.error === undefined && r.status !== "refused") rec.admitted += 1;
  return reply;
}

export function buildBankAgentTools(ctx: BankTaskContext, modelId: string, rec: BankRunRecord) {
  const model = bankModelIdentity(modelId);
  const needPack = () =>
    rec.digest === null
      ? { error: `call ${PACK_TOOL} first — every act must be grounded in a pack read from this run.` }
      : null;

  return {
    [PACK_TOOL]: tool({
      description:
        "Read the bank pack for this run's bank account: the live statement, its unmatched lines, the candidate approved journal entries, open items and any open proposals. This read is itself receipted. Call it first.",
      inputSchema: z.object({
        rationale: z.string().min(1).describe("Why you are reading — one plain sentence."),
      }),
      execute: async ({ rationale }: { rationale: string }) => {
        try {
          // A READ CARRIES A COUNTER (S8). Re-reading the pack after acting is the normal shape
          // the DB explicitly designs for; a constant key would make exactly that re-read raise
          // CLR10 op_key_identity_mismatch, because acting MOVES the pack digest. See bankOpKey.
          const opKey = bankOpKey("pack", ctx.taskId, `${ctx.bankAccountId}_${(rec.packReads += 1)}`);
          const pack = await bankScoped(ctx, (c: PgExec) =>
            c
              .query("select clara.wake_get_bank_pack(p_client => $1, p_bank_account => $2, p_rationale => $3, p_model => $4::jsonb, p_op_key => $5) as pack", [
                ctx.clientId,
                ctx.bankAccountId,
                rationale,
                JSON.stringify(model),
                opKey,
              ])
              .then((r) => r.rows[0]?.pack ?? null),
          );
          // Record WHAT THE DATABASE ACTUALLY RETURNED, never a digest we computed ourselves.
          const digest = (pack as { digest?: unknown } | null)?.digest;
          if (typeof digest === "string" && digest.length > 0) rec.digest = digest;
          return pack;
        } catch (e) {
          return refusal(rec, e);
        }
      },
    }),

    [MATCH_TOOL]: tool({
      description:
        "Link statement lines to approved journal entries. Amounts must tie; the database checks and refuses if they do not. Only lines and entries you saw in the pack.",
      inputSchema: z.object({
        // `lines` MAY be bare ids: the core accepts a JSON string element OR {line_id}
        // (0121:5860-5863's own jsonb_typeof branch). `entries` MAY NOT — see below.
        lines: z.array(z.string().uuid()).min(1).describe("Statement line ids from the pack."),
        // THE ENTRIES ARE OBJECTS, AND A BARE ID IS SILENTLY WORTHLESS. The core reads
        // elem->>'entry_id' and elem->>'matched_cents' (0121:5864-5869); `->>` on a JSON *string*
        // element yields NULL, so a bare-id array filters down to zero entries and zero cents —
        // which then fails tie_nonzero (0121:5897) and is not_evaluable on same_amount_ambiguous
        // (0121:5909), refusing the act before the delegate is ever reached. An earlier draft
        // declared this a uuid array, which would have made the ONLY books-writing verb this lane
        // exposes permanently un-admittable, with a refusal blaming the amounts rather than the
        // shape. The sibling chat lane already has the right shape
        // (chatTurn.v14.bankSchemas.ts:42) — this is that contract, re-read from the core.
        entries: z
          .array(
            z.object({
              entry_id: z.string().uuid().describe("An approved journal entry id from the pack's `candidates`."),
              matched_cents: z
                .number()
                .int()
                // ZERO IS REFUSED BY THE DELEGATE (0121:1940, CLR10 entries_malformed — "a
                // non-zero whole matched_cents"). Refusing it here turns a CLR code the model
                // cannot act on into a schema error it can.
                .refine((v) => v !== 0, "an entry must settle a non-zero amount")
                .describe(
                  "The signed effect on the bank account for THIS entry, in cents — taken from the candidate's own debit_remaining_cents (positive) or credit_remaining_cents (negative). Never computed by you.",
                ),
            }),
          )
          .min(1)
          .describe("The entries to match, each with the amount it settles. Amounts must tie against the lines; the database checks."),
        rationale: z.string().min(1).describe("What ties these together, in plain words a bookkeeper can check."),
      }),
      execute: async ({
        lines,
        entries,
        rationale,
      }: {
        lines: string[];
        entries: Array<{ entry_id: string; matched_cents: number }>;
        rationale: string;
      }) => {
        const blocked = needPack();
        if (blocked) return blocked;
        try {
          // The subject is the SORTED line set, so the same match proposed with its lines in a
          // different order is the same operation — a replay, not a second act.
          const opKey = bankOpKey("match", ctx.taskId, [...lines].sort().join("_"));
          return await bankScoped(ctx, (c: PgExec) =>
            c
              // TRANSPOSITION CASE D, the bank tail: p_rationale, p_inputs_digest and p_op_key are
              // three adjacent texts. The rationale/op_key swap is the dangerous one — both are
              // non-blank so both guards pass, and 0129:1052 parses the op key by POSITION
              // (split_part(key,':',2)); prose yields '' -> NULL, so the freshness check falls
              // back to its loose client+digest match and ADMITS the act, storing each value in
              // the other's column. Named notation makes the NAME half safe. The value half is
              // still positional — but on THIS lane the SQL and its value array are one
              // expression, so both halves are read together at a glance; the close lane's are
              // split across two files, which is why its helper carries an extra guard.
              .query("select clara.wake_match_bank_line(p_client => $1, p_lines => $2::jsonb, p_entries => $3::jsonb, p_adjustments => $4::jsonb, p_ack_period_exceptions => $5, p_rationale => $6, p_model => $7::jsonb, p_inputs_digest => $8, p_op_key => $9) as r", [
                ctx.clientId,
                JSON.stringify(lines),
                JSON.stringify(entries),
                JSON.stringify([]),
                false,
                rationale,
                JSON.stringify(model),
                rec.digest,
                opKey,
              ])
              .then((r) => countIfAdmitted(rec, r.rows[0]?.r ?? null)),
          );
        } catch (e) {
          return refusal(rec, e);
        }
      },
    }),

    [EXCEPTION_TOOL]: tool({
      description:
        "PROPOSE an exception on one statement line you cannot match. This writes a proposal for a human to settle; it does not except the line itself.",
      inputSchema: z.object({
        line_id: z.string().uuid(),
        // A CLOSED DB ROSTER, SO A CLOSED SCHEMA. 0121:5546 refuses anything but these two with
        // CLR10 kind_malformed. Declaring it as free text moved a refusal the model can act on
        // ("not one of the two allowed values") into a CLR code it cannot — the same argument the
        // pack-before-write guard above makes.
        kind: z
          .enum(["bank_error", "disputed"])
          .describe("bank_error when the BANK's own line is wrong; disputed when the amount or party is contested."),
        reason: z.string().min(1).describe("What is wrong with this line, concretely."),
        rationale: z.string().min(1).describe("Why an exception rather than a match — name what you ruled out."),
      }),
      execute: async ({ line_id, kind, reason, rationale }: { line_id: string; kind: string; reason: string; rationale: string }) => {
        const blocked = needPack();
        if (blocked) return blocked;
        try {
          const opKey = bankOpKey("except", ctx.taskId, line_id);
          return await bankScoped(ctx, (c: PgExec) =>
            c
              // $4::uuid — p_evidence_document is always NULL from this lane (an unattended pass
              // cites no evidence document), and a BARE null gives the planner no type to infer.
              // Cast explicitly rather than rely on there happening to be one overload today.
              .query("select clara.wake_propose_bank_line_exception(p_line => $1, p_kind => $2, p_reason => $3, p_evidence_document => $4::uuid, p_rationale => $5, p_model => $6::jsonb, p_inputs_digest => $7, p_op_key => $8) as r", [
                line_id,
                kind,
                reason,
                null,
                rationale,
                JSON.stringify(model),
                rec.digest,
                opKey,
              ])
              .then((r) => countIfAdmitted(rec, r.rows[0]?.r ?? null)),
          );
        } catch (e) {
          return refusal(rec, e);
        }
      },
    }),

    [PROMOTION_TOOL]: tool({
      description:
        "PROPOSE that a recurring printed identifier on the statement belongs to a counterparty. A proposal for a human, never a change to the books.",
      inputSchema: z.object({
        counterparty_id: z.string().uuid(),
        // The client_identifiers catalog's own closed roster (0121:5618 refuses anything else
        // with CLR10 identifier_kind_malformed).
        identifier_kind: z.enum(["tin", "ssm", "bank_account"]),
        identifier_value: z.string().min(1),
        times_seen: z.number().int().positive().describe("How many times you saw it in the pack. Count, never estimate."),
        rationale: z.string().min(1),
      }),
      execute: async (a: {
        counterparty_id: string;
        identifier_kind: string;
        identifier_value: string;
        times_seen: number;
        rationale: string;
      }) => {
        const blocked = needPack();
        if (blocked) return blocked;
        try {
          const opKey = bankOpKey("promote", ctx.taskId, `${a.counterparty_id}_${a.identifier_kind}_${a.identifier_value}`);
          return await bankScoped(ctx, (c: PgExec) =>
            c
              // $5::int — p_times_seen is declared int and the driver sends a JS number as text;
              // cast so the coercion is stated here rather than left to overload resolution.
              .query("select clara.wake_propose_bank_identifier_promotion(p_client => $1, p_counterparty => $2, p_identifier_kind => $3, p_identifier_value => $4, p_times_seen => $5::int, p_rationale => $6, p_model => $7::jsonb, p_inputs_digest => $8, p_op_key => $9) as r", [
                ctx.clientId,
                a.counterparty_id,
                a.identifier_kind,
                a.identifier_value,
                a.times_seen,
                a.rationale,
                JSON.stringify(model),
                rec.digest,
                opKey,
              ])
              .then((r) => countIfAdmitted(rec, r.rows[0]?.r ?? null)),
          );
        } catch (e) {
          return refusal(rec, e);
        }
      },
    }),
  };
}
