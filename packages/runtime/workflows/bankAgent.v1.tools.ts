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
// THE PURE HALF LIVES IN bankAgent.v1.pack.ts — the run record, the pack view, the allocation
// derivation and the admitted-reply test. Split for the 500-line module budget, the same way
// closePrep.v1.reads.ts is split from its own tools file. Read that file first: it carries the
// statement of why a match's amounts are the database's and never the model's.
//
// THE MODEL NAMES SUBJECTS; THE DATABASE OWNS EVERY NUMERAL (裁-44 / FOLD-1, hard constraint 2).
// A match's tool input is line ids and entry ids — nothing else.
//
// THE IN-RUN PACK RECORD (the same law autoDraft.v9.toolset.ts states for its read record).
// Every write wrapper takes p_inputs_digest, and 0129's freshness check requires that digest to
// name a REAL, PRIOR pack read bound to THIS task. The closure below remembers the pack the pack
// tool actually returned in THIS execution — its digest, its line amounts and its candidates'
// remaining capacities. A write attempted before any pack read is refused locally, by name,
// rather than sent to the database to fail with a CLR code nobody can read. A WDK REPLAY rebuilds
// this record EMPTY, which fails closed — that is the load-bearing half, not the ergonomics.

import { tool } from "ai";
import { z } from "zod";
import { PACK_TOOL, MATCH_TOOL, EXCEPTION_TOOL, PROMOTION_TOOL, bankModelIdentity } from "./bankAgent.v1.prompt.js";
import { bankScoped, bankOpKey, pools, readWakeTaskStatus, type BankTaskContext, type PgExec } from "./bankAgent.v1.infra.js";
import {
  BANK_PROSE_MAX,
  countIfAdmitted,
  dbRefusalReason,
  deriveMatchAllocation,
  isDbVerdict,
  readPackView,
  refusal,
  type BankRunRecord,
} from "./bankAgent.v1.pack.js";

export {
  BANK_PROSE_MAX,
  countIfAdmitted,
  dbRefusalReason,
  deriveMatchAllocation,
  isAdmittedBankReply,
  newBankRunRecord,
  readPackView,
  type BankAllocation,
  type BankPackView,
  type BankRunRecord,
  type BankVerb,
} from "./bankAgent.v1.pack.js";

export function buildBankAgentTools(ctx: BankTaskContext, modelId: string, rec: BankRunRecord) {
  const model = bankModelIdentity(modelId);
  const prose = (describe: string) => z.string().min(1).max(BANK_PROSE_MAX).describe(describe);

  /** Count a LOCAL refusal — an act the model attempted that never reached the database because
   *  this closure refused it first. It is a refusal, never an infra fault: the fault is the
   *  model's proposal, and 裁-44 / FOLD-3 makes a night of these settle failed rather than green. */
  const localRefusal = (message: string): { error: string } => {
    rec.refusals += 1;
    return { error: message };
  };

  const stopped = () =>
    localRefusal(`this run's task is no longer running (${rec.cancelledAs}) — stop now; nothing further will be recorded.`);

  /** The write gate, in the order the failures must be caught.
   *
   *  IT INCREMENTS writeAttempts FIRST, unconditionally, because 裁-44 / FOLD-3's whole point is
   *  that a run which ATTEMPTED writes and admitted none is a failed night — and a run refused at
   *  the gate attempted just as much as one refused by the database. */
  const guardWrite = async (lineIds: string[]): Promise<{ error: string } | null> => {
    rec.writeAttempts += 1;
    if (rec.cancelledAs !== null) return stopped();
    if (rec.pack === null) {
      return localRefusal(`call ${PACK_TOOL} first — every act must be grounded in a pack read from this run.`);
    }
    // 裁-44 / FOLD-2(a) — RE-ASK THE BOOKS BEFORE MINTING ANYTHING. The claim CAS proved the task
    // was running when the run started; a cancel landing mid-pass leaves it 'cancel_requested'
    // while the model keeps calling. This read is on the RUNTIME pool and mints no credential, so
    // a cancelled task costs one SELECT rather than a live bank credential and a books write.
    let status: string | null;
    try {
      status = await pools().withRuntime((c: PgExec) => readWakeTaskStatus(c, ctx.taskId));
    } catch (e) {
      // The status is UNKNOWN, and unknown is not 'running' (review law 2). Fail closed, and count
      // it as ours rather than the model's — the database never judged anything here.
      refusal(rec, e);
      return localRefusal("the act did not go through: this run could not confirm its own task is still live. Stop.");
    }
    if (status !== "running") {
      rec.cancelledAs = status ?? "absent";
      return stopped();
    }
    // 裁-44 / FOLD-4 — EVERY LINE MUST BE ONE THIS RUN SAW. The pack digest 0129 verifies is bound
    // to the task and the client, never to the bank ACCOUNT: two accounts under one client share a
    // client, so a line from account B would ride account A's digest straight through. The pack's
    // own line set is account-scoped (0121:5725), so binding to it closes that door from here. The
    // DB-side account binding is booked as G1 PR-2 / the 裁-44 DB pass.
    const stranger = lineIds.map((v) => v.toLowerCase()).find((id) => !rec.pack?.lineCents.has(id));
    if (stranger !== undefined) {
      return localRefusal(
        `line ${stranger} is not one of the unmatched lines in the pack this run read — read the pack for the account that line belongs to, in its own run.`,
      );
    }
    return null;
  };

  /** A thrown write, counted and mapped. 裁-44 / FOLD-9(b): CLR10 op_key_identity_mismatch is the
   *  one CLR the model can actually act on, so it gets its own sentence instead of the oracle-safe
   *  one — see the MATCH_TOOL body for what produces it. */
  const writeRefusal = (e: unknown): { error: string } => {
    rec.refusals += 1;
    if (isDbVerdict(e) && dbRefusalReason(e) === "op_key_identity_mismatch") {
      return {
        error:
          "refused: this exact proposal was already attempted in this run, and re-reading the pack does not make it new. " +
          "Name a different set of entries, or propose an exception for a human.",
      };
    }
    // refusal() counts the infra fault when this was not a DB verdict; the refusal count above is
    // already taken, so the two never double-count the same call in the same bucket.
    return refusal(rec, e);
  };

  return {
    [PACK_TOOL]: tool({
      description:
        "Read the bank pack for this run's bank account: the live statement, its unmatched lines, the candidate approved journal entries, open items and any open proposals. This read is itself receipted. Call it first.",
      inputSchema: z.object({
        rationale: prose("Why you are reading — one plain sentence."),
      }),
      execute: async ({ rationale }: { rationale: string }) => {
        try {
          // A READ CARRIES A COUNTER (S8), AND THE COUNTER CARRIES THE STEP ATTEMPT (FOLD-8).
          // Re-reading the pack after acting is the normal shape the DB explicitly designs for; a
          // constant key would make exactly that re-read raise CLR10 op_key_identity_mismatch,
          // because acting MOVES the pack digest. A RUN-LOCAL counter has the same defect one
          // level up: a retried step restarts it at 1 while the digest has moved. See bankOpKey.
          const opKey = bankOpKey("pack", ctx.taskId, `${ctx.bankAccountId}_${rec.attemptKey}_${(rec.packReads += 1)}`);
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
          // Record WHAT THE DATABASE ACTUALLY RETURNED, never a digest or an amount we computed
          // ourselves. A reply with no digest leaves the record untouched, so the write gate keeps
          // refusing — absence is not evidence.
          const view = readPackView(pack);
          if (view !== null) {
            rec.pack = view;
            rec.digest = view.digest;
          }
          return pack;
        } catch (e) {
          return refusal(rec, e);
        }
      },
    }),

    [MATCH_TOOL]: tool({
      description:
        "Link statement lines to approved journal entries you saw in the pack. Name the lines and the entries only — the amounts are the database's, taken from the pack, and are never yours to choose. One entry settles the line up to its own remaining capacity; several entries each settle in FULL and must add up to the line.",
      inputSchema: z.object({
        // `lines` MAY be bare ids: the core accepts a JSON string element OR {line_id}
        // (0121:5860-5863's own jsonb_typeof branch).
        lines: z.array(z.string().uuid()).min(1).describe("Statement line ids from the pack."),
        // 裁-44 / FOLD-1 — BARE IDS, DELIBERATELY. The earlier shape took {entry_id, matched_cents}
        // objects and sent the model's own numbers to a durable books row; 0121's ladder checks
        // only the aggregate tie and each entry's own cap, so a 4,999+5,001 split of a 10,000 line
        // passed every rung. The amounts are now derived from the pack by deriveMatchAllocation,
        // which means a wrong division is no longer expressible rather than merely discouraged.
        entries: z
          .array(z.string().uuid())
          .min(1)
          .describe("Approved journal entry ids from the pack's `candidates`. Amounts are the database's, not yours."),
        rationale: prose("What ties these together, in plain words a bookkeeper can check."),
      }),
      execute: async ({ lines, entries, rationale }: { lines: string[]; entries: string[]; rationale: string }) => {
        const blocked = await guardWrite(lines);
        if (blocked) return blocked;
        const pack = rec.pack;
        if (pack === null) return localRefusal(`call ${PACK_TOOL} first — every act must be grounded in a pack read from this run.`);
        const alloc = deriveMatchAllocation(pack, lines, entries);
        if (!alloc.ok) return localRefusal(`refused (${alloc.reason}): ${alloc.detail}`);
        try {
          // 裁-44 / FOLD-9(a) — THE SUBJECT IS THE LINES *AND* THE ENTRIES, both sorted. Keyed on
          // the lines alone, a REFUSED attempt (receipt subject = the line, 0121:6006) and a later
          // corrected attempt on the same line (receipt subject = the new match, 0121:6025) shared
          // one op key, and clara._agent_bank_receipt's identity check raised CLR10 — so one bad
          // pick made that line un-matchable for the rest of the task while the run still settled
          // COMPLETED. Under FOLD-1 the model's only remaining freedom is WHICH entries, so a
          // corrected proposal IS a different entry set and gets its own key; an identical
          // re-submission keeps the same key and replays, which is what replay is for. Sorted, so
          // the same proposal in a different order stays one operation.
          const subject = `${[...lines].sort().join("_")}|${[...entries].sort().join("_")}`;
          const opKey = bankOpKey("match", ctx.taskId, subject);
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
                JSON.stringify(alloc.entries),
                JSON.stringify([]),
                false,
                rationale,
                JSON.stringify(model),
                rec.digest,
                opKey,
              ])
              .then((r) => countIfAdmitted(rec, "match", r.rows[0]?.r ?? null)),
          );
        } catch (e) {
          return writeRefusal(e);
        }
      },
    }),

    [EXCEPTION_TOOL]: tool({
      description:
        "PROPOSE an exception on one statement line you cannot match. This writes a proposal for a human to settle; it does not except the line itself. Use it whenever the amounts do not divide cleanly — dividing them yourself is not available to you.",
      inputSchema: z.object({
        line_id: z.string().uuid(),
        // A CLOSED DB ROSTER, SO A CLOSED SCHEMA. 0121:5546 refuses anything but these two with
        // CLR10 kind_malformed. Declaring it as free text moved a refusal the model can act on
        // ("not one of the two allowed values") into a CLR code it cannot — the same argument the
        // pack-before-write guard above makes.
        kind: z
          .enum(["bank_error", "disputed"])
          .describe("bank_error when the BANK's own line is wrong; disputed when the amount or party is contested."),
        reason: prose("What is wrong with this line, concretely."),
        rationale: prose("Why an exception rather than a match — name what you ruled out."),
      }),
      execute: async ({ line_id, kind, reason, rationale }: { line_id: string; kind: string; reason: string; rationale: string }) => {
        const blocked = await guardWrite([line_id]);
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
              .then((r) => countIfAdmitted(rec, "exception", r.rows[0]?.r ?? null)),
          );
        } catch (e) {
          return writeRefusal(e);
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
        identifier_value: z.string().min(1).max(BANK_PROSE_MAX),
        times_seen: z.number().int().positive().describe("How many times you saw it in the pack. Count, never estimate."),
        rationale: prose("Why this identifier belongs to this counterparty — name what you saw."),
      }),
      execute: async (a: {
        counterparty_id: string;
        identifier_kind: string;
        identifier_value: string;
        times_seen: number;
        rationale: string;
      }) => {
        // NO LINE TO BIND (裁-44 / FOLD-4): a promotion names a counterparty, not a statement line,
        // so the pack's line set has nothing to say about it. The gate still runs — it is what
        // enforces the pack-read precondition and the cancellation re-read — with an empty list.
        const blocked = await guardWrite([]);
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
              .then((r) => countIfAdmitted(rec, "promotion", r.rows[0]?.r ?? null)),
          );
        } catch (e) {
          return writeRefusal(e);
        }
      },
    }),
  };
}
