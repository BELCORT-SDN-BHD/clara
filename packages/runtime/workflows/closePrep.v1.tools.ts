// @frozen
//
// FROZEN — part of the closePrep_v1 closure (see closePrep.v1.infra.ts for what this class is).
//
// THIS FILE (tools) — the SIX write wrappers, and the assembler that joins them to the six reads
// in closePrep.v1.reads.ts. Twelve tools total: exactly the twelve 0138 minted, no more.
//
// THE THIRTEENTH IS DELIBERATELY ABSENT. wake_establish_prepayment_schedule is F-A4 PR-2b's own
// (parked at the time this closure was built) and is NOT exposed here. When it lands it belongs
// to closePrep_v2, with its own review — not to an edit of this frozen body.
//
// SO IS EVERY LAW-71 ACT, AND THAT WALL IS THE DATABASE'S, NOT THIS FILE'S. settle_close_proposal,
// finalize_close, attest_close_exception and reopen_fiscal_year are granted to
// clara_authenticated ONLY: the agent entrance is cut below the close_and_attest capability gate
// (0138 §G's own note that "NEITHER entrance reaches the other's wall"). Their absence from this
// tool set is convenience for the model, never the containment — the containment is that
// clara_wake_interactive holds no EXECUTE on them at all, which the battery proves BY CALLING
// them and reading the refusal, never by reading this comment.

import { tool } from "ai";
import { z } from "zod";
import { CLOSE_FY_LABEL_MAX, CLOSE_PROSE_MAX, WRITE_TOOLS } from "./closePrep.v1.prompt.js";
import {
  buildCloseReadTools,
  callCloseVerb,
  closeRefusal,
  countIfAdmitted,
  type CloseRunRecord,
} from "./closePrep.v1.reads.js";
import { pools, readCloseTaskStatus, type CloseTaskContext, type PgExec } from "./closePrep.v1.infra.js";

const RATIONALE = z
  .string()
  .min(1)
  .max(CLOSE_PROSE_MAX)
  .describe("Why this act, in plain words a bookkeeper can check tomorrow.");

export { newCloseRunRecord, type CloseRunRecord } from "./closePrep.v1.reads.js";

export function buildClosePrepTools(ctx: CloseTaskContext, modelId: string, rec: CloseRunRecord) {
  /** A LOCAL refusal — an act the model attempted that never reached the database because this
   *  closure refused it first. Counted as a refusal, never an infra fault. */
  const localRefusal = (message: string): { error: string } => {
    rec.refusals += 1;
    return { error: message };
  };

  /**
   * 裁-44 / FOLD-2(a) — RE-ASK THE BOOKS BEFORE EVERY WRITE, before any credential is minted.
   *
   * The claim CAS proved the task was 'running' when the run started; it proves nothing about the
   * middle. A cancel landing after the first admitted read leaves the task 'cancel_requested'
   * while the model keeps proposing — and on THIS lane every wrapper mints a fresh TASK-BOUND
   * credential, so an ungated pass keeps minting live credentials and writing under books that
   * already say it stopped. Reads are deliberately not gated: a read changes nothing, and letting
   * one finish is what lets the run settle truthfully rather than mid-sentence.
   */
  const guardWrite = async (): Promise<{ error: string } | null> => {
    rec.writeAttempts += 1;
    const stopped = () =>
      localRefusal(`this run's task is no longer running (${rec.cancelledAs}) — stop now; nothing further will be recorded.`);
    if (rec.cancelledAs !== null) return stopped();
    let status: string | null;
    try {
      status = await pools().withRuntime((c: PgExec) => readCloseTaskStatus(c, ctx.taskId));
    } catch (e) {
      // Unknown is not 'running' (review law 2). Fail closed, and attribute it to us: the database
      // never judged anything here. closeRefusal takes the infra-fault count.
      closeRefusal(rec, e);
      return localRefusal("the act did not go through: this run could not confirm its own task is still live. Stop.");
    }
    if (status !== "running") {
      rec.cancelledAs = status ?? "absent";
      return stopped();
    }
    return null;
  };

  const write = async (verb: string, subject: string, sql: string, args: unknown[], rationale: string) => {
    const blocked = await guardWrite();
    if (blocked) return blocked;
    try {
      const reply = await callCloseVerb(ctx, verb, subject, sql, args, rationale, modelId);
      return countIfAdmitted(rec, reply);
    } catch (e) {
      // A thrown write is a refusal as much as a returned one — 裁-44 / FOLD-3 counts both, so a
      // night in which every act was refused settles failed rather than nothing_due.
      rec.refusals += 1;
      return closeRefusal(rec, e);
    }
  };

  return {
    ...buildCloseReadTools(ctx, modelId, rec),

    [WRITE_TOOLS.DEPRECIATION]: tool({
      description:
        "Run the depreciation catch-up through a date. Do this BEFORE beginning a close: after the freeze these periods cannot clear at all. Requires a live human-signed depreciation authority — you execute an authority, you never sign one.",
      inputSchema: z.object({
        through: z.string().describe("An ISO date (YYYY-MM-DD). A date beyond the book clock is refused, correctly."),
        rationale: RATIONALE,
      }),
      execute: ({ through, rationale }: { through: string; rationale: string }) =>
        write(
          "wake_run_depreciation_catchup",
          ctx.clientId,
          "select clara.wake_run_depreciation_catchup(p_client => $1, p_through => $2::date, p_rationale => $3, p_model => $4::jsonb, p_op_key => $5) as r",
          [ctx.clientId, through],
          rationale,
        ),
    }),

    [WRITE_TOOLS.SNAPSHOT_MINT]: tool({
      description: "Mint the month snapshot for a month start date, where one is owed.",
      inputSchema: z.object({ month_start: z.string().describe("An ISO date (YYYY-MM-DD), the first of the month."), rationale: RATIONALE }),
      execute: ({ month_start, rationale }: { month_start: string; rationale: string }) =>
        write(
          "wake_mint_month_snapshot",
          ctx.clientId,
          "select clara.wake_mint_month_snapshot(p_client => $1, p_month_start => $2::date, p_rationale => $3, p_model => $4::jsonb, p_op_key => $5) as r",
          [ctx.clientId, month_start],
          rationale,
        ),
    }),

    [WRITE_TOOLS.OPEN_FY]: tool({
      description: "Open a NEW fiscal year for this client. Only when the year that should follow the one ending does not exist yet.",
      inputSchema: z.object({
        // 裁-44 / FOLD-7 — a LABEL is a name, not prose. clara.fiscal_years.label is guarded only
        // as non-blank (0056:236) and every human surface renders it inline, so an essay here is a
        // layout defect as well as an injection surface. 120 is the ruled cap.
        label: z.string().min(1).max(CLOSE_FY_LABEL_MAX).describe("The year's label, in the client's own existing convention."),
        starts_on: z.string().describe("An ISO date (YYYY-MM-DD) — the day after the previous year ends."),
        rationale: RATIONALE,
      }),
      execute: ({ label, starts_on, rationale }: { label: string; starts_on: string; rationale: string }) =>
        write(
          "wake_open_fiscal_year",
          ctx.clientId,
          // TRANSPOSITION CASE C: p_label and p_rationale are both free-form text and both guards
          // are only "non-blank" — a swap SUCCEEDS, minting a fiscal year whose label is a
          // sentence of prose and whose receipt rationale is a year name. Named notation makes
          // the NAME half safe; the value half is still positional (callCloseVerb's header).
          "select clara.wake_open_fiscal_year(p_client => $1, p_label => $2, p_starts_on => $3::date, p_rationale => $4, p_model => $5::jsonb, p_op_key => $6) as r",
          [ctx.clientId, label, starts_on],
          rationale,
        ),
    }),

    [WRITE_TOOLS.BEGIN]: tool({
      description:
        "Open the close RUN for a fiscal year. This starts the preparation; it does not close anything. Read readiness first, and clear the mechanical blockers first.",
      inputSchema: z.object({ fiscal_year_id: z.string().uuid(), rationale: RATIONALE }),
      execute: async ({ fiscal_year_id, rationale }: { fiscal_year_id: string; rationale: string }) => {
        const reply = await write(
          "wake_begin_close",
          fiscal_year_id,
          "select clara.wake_begin_close(p_fy => $1, p_rationale => $2, p_model => $3::jsonb, p_op_key => $4) as r",
          [fiscal_year_id],
          rationale,
        );
        // Remember the run id the DATABASE returned. THE PATH IS `result.close_run_id`, NESTED —
        // `_agent_begin_close_core` returns {status, receipt_id, result} on the acted path
        // (0138:2107) and the run id lives inside `result` (0138:2104 reads it from there for the
        // receipt). An earlier draft read it off the top level and would have recorded null on
        // every successful begin. Read off the reply, never reconstructed; diagnostics only —
        // the model still names the close run explicitly on propose/abandon, so nothing depends
        // on this being populated.
        const result = (reply as { result?: { close_run_id?: unknown } } | null)?.result;
        if (typeof result?.close_run_id === "string") rec.closeRunId = result.close_run_id;
        return reply;
      },
    }),

    [WRITE_TOOLS.PROPOSE]: tool({
      description:
        "Record the close proposal: what you drafted and the narrative explaining it. This is the run's real output — a human settles it, you never do.",
      inputSchema: z.object({
        close_run_id: z.string().uuid(),
        // THE SHAPE IS AN ARRAY OF ATTESTATION TEXTS, ONE PER OUTSTANDING GATE ITEM — not a bag
        // of figures, and not an object. Three instruments: close_proposals.drafted carries
        // `check (jsonb_typeof(drafted) = 'array')` (0138:464) and its own column comment names
        // the element shape (0138:463); and the core refuses a non-array, an empty array, any
        // element missing a non-blank check_key / item_key / text, and any duplicated
        // (check_key, item_key) pair (0138:2226-2246). An earlier draft declared this a
        // free-form object, which would have refused the lane's own stated real output — the
        // proposal a human is meant to settle — on shape, every single time.
        drafted: z
          .array(
            z.object({
              // 裁-44 / FOLD-7 — the two KEYS are echoed back from get_close_readiness's own
              // vocabulary, so they are identifiers rather than prose; the attestation itself is
              // prose and takes the house cap.
              check_key: z.string().min(1).max(CLOSE_FY_LABEL_MAX).describe("The gate check this text attests to, exactly as get_close_readiness named it."),
              item_key: z.string().min(1).max(CLOSE_FY_LABEL_MAX).describe("The outstanding item within that check, exactly as get_close_readiness named it."),
              text: z.string().min(1).max(CLOSE_PROSE_MAX).describe("The attestation itself, in plain words a human can accept or reject."),
            }),
          )
          .min(1)
          .describe(
            "One attestation per outstanding item. Take every check_key/item_key pair from the readiness read — never invent one, and never repeat a pair.",
          ),
        narrative: z.string().min(1).max(CLOSE_PROSE_MAX).describe("The explanation a bookkeeper reads in the morning. Never imply a human decision has been made."),
        rationale: RATIONALE,
      }),
      execute: ({
        close_run_id,
        drafted,
        narrative,
        rationale,
      }: {
        close_run_id: string;
        // THE ANNOTATION MUST TRACK THE SCHEMA, and nothing machine-checked will ever tell you it
        // does not: `tool()`'s execute is loosely typed, so an explicit parameter annotation
        // OVERRIDES inference rather than being checked against inputSchema. In a frozen file
        // that makes a stale annotation a lie the next reader has no reason to doubt. This one
        // was stale for exactly one round (it still said Record<string, unknown> after the schema
        // became an array) and was caught by an independent review, not by a gate.
        drafted: Array<{ check_key: string; item_key: string; text: string }>;
        narrative: string;
        rationale: string;
      }) =>
        write(
          "wake_propose_close",
          close_run_id,
          // TRANSPOSITION CASE A, the worst of the four: p_narrative and p_rationale are adjacent,
          // both free-form text, both guarded only as non-blank. A swap SUCCEEDS — and the
          // narrative is what a human reads to settle the proposal, so the reader would get the
          // internal rationale while the audit receipt got the client-facing narrative. No error,
          // no rung, no way to tell from either side. Named notation makes the NAME half safe;
          // the value half is still positional, and callCloseVerb's guard bounds what remains.
          "select clara.wake_propose_close(p_close_run => $1, p_drafted => $2::jsonb, p_narrative => $3, p_rationale => $4, p_model => $5::jsonb, p_op_key => $6) as r",
          [close_run_id, JSON.stringify(drafted), narrative],
          rationale,
        ),
    }),

    [WRITE_TOOLS.ABANDON]: tool({
      description:
        "Abandon a close run you opened, with an honest reason. An abandoned run with a clear reason is a good outcome; a half-open run nobody can interpret is not.",
      inputSchema: z.object({
        close_run_id: z.string().uuid(),
        // 裁-44 / FOLD-7 — this becomes clara.close_runs.end_reason (0120:1186), whose only guard
        // is non-blank. A structured abandonment-code roster is the DB pass's own question; the
        // cap is what this PR can do without a migration.
        reason: z.string().min(1).max(CLOSE_PROSE_MAX).describe("What made this run un-continuable. Concrete, not apologetic."),
        rationale: RATIONALE,
      }),
      execute: ({ close_run_id, reason, rationale }: { close_run_id: string; reason: string; rationale: string }) =>
        write(
          "wake_abandon_close",
          close_run_id,
          // TRANSPOSITION CASE A's sibling: p_reason and p_rationale, adjacent, both prose, both
          // non-blank-guarded. Same silent swap, same fix.
          "select clara.wake_abandon_close(p_close_run => $1, p_reason => $2, p_rationale => $3, p_model => $4::jsonb, p_op_key => $5) as r",
          [close_run_id, reason],
          rationale,
        ),
    }),
  };
}
