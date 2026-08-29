// @frozen
//
// FROZEN — part of the closePrep_v1 closure (see closePrep.v1.infra.ts for what this class is).
//
// THIS FILE (reads) — the shared call helper plus the SIX read wrappers of the twelve 0138
// minted. Split from the write half only for the repo's 500-line module budget; the two halves
// are one tool set, assembled in closePrep.v1.tools.ts.
//
// WHY THE READS ARE WRAPPERS AND NOT A PLAIN GRANT, restated because it shapes every call here:
// 0138's own note (:1291-1294) is that a firm-scoped grant on get_close_plan would let a
// client-pinned lane read EVERY client's plan in the firm. So each read goes through
// _close_wake_ctx, which re-derives the subject's client and refuses anything the credential is
// not pinned to. That is why a read here costs an op key and a rationale: it is a receipted act,
// not a free look.

import { tool } from "ai";
import { z } from "zod";
import { READ_TOOLS, closeModelIdentity } from "./closePrep.v1.prompt.js";
import { closeScoped, closeOpKey, type CloseTaskContext, type PgExec } from "./closePrep.v1.infra.js";

/** One oracle-safe refusal for every authority/tenant fault, identical regardless of whether the
 *  subject exists — a refusal that varies with existence is an existence oracle. */
export function closeRefusal(e: unknown): { error: string } {
  const code = (e as { code?: string })?.code;
  if (code === "CLR03" || code === "CLR04" || code === "CLR10" || code === "CLR11") {
    return { error: `refused (${code}): this act is not available to this run on this client.` };
  }
  const message = e instanceof Error ? e.message : String(e);
  return { error: `the act did not go through: ${message}` };
}

/** The per-run record. `acts` counts only replies the DATABASE marked admitted — never the
 *  model's account of what it did (constraint 2 in its narrowest form). */
export type CloseRunRecord = { reads: number; acts: number; closeRunId: string | null };

export function newCloseRunRecord(): CloseRunRecord {
  return { reads: 0, acts: 0, closeRunId: null };
}

/**
 * Call one 0138 wrapper. `verb` is the WRAPPER'S OWN NAME and `subjectId` its declared subject —
 * both feed closeOpKey, which must reproduce the database's own derivation exactly or
 * _close_wake_ctx refuses with CLR10 'op_key_not_derived'. Passing the wrong subject here is
 * therefore a LOUD failure, not a silent mis-scope: the DB checks our arithmetic on every call.
 *
 * WHAT NAMED NOTATION BOUGHT, AND WHAT IT DID NOT — stated here because an overstated safety
 * claim in a frozen file is what makes the next author careless (independent review).
 *   CLOSED: "which DB parameter is this?" A wrong or misplaced NAME is a loud parse error, every
 *     call site is self-documenting, and G1B-I3 machine-checks the names against the catalog in
 *     order. The four silent prose-transposition cases can no longer be written by NAME.
 *   OPEN:  "which VALUE is bound to this placeholder?" `p_narrative => $3` is right only while $3
 *     holds the narrative. Write `p_narrative => $4, p_rationale => $3` and case A is back, with
 *     the names looking perfect.
 *
 * AND ON THIS LANE THAT MAPPING IS SPLIT ACROSS TWO FILES, which is the part worth guarding: each
 * call site supplies $1..$n through `argsBefore`, and THIS function appends the tail three. Every
 * site's tail placeholder numbers therefore encode an assumption about that append order which is
 * stated nowhere. Add one argument to an argsBefore array without bumping the tail numbers and the
 * rationale lands in the new parameter's slot — same-typed, non-blank, silent.
 *
 * THE GUARD BELOW BOUNDS EXACTLY THAT. It re-derives the expected placeholder count from the
 * values actually being sent and checks the SQL agrees, and it checks the tail three are bound to
 * the last three placeholders BY NAME. It cannot catch a swap WITHIN argsBefore (the call site
 * owns that, and G1B-E2a is what exercises it) — but it does catch the drift class, which is the
 * one that arrives later, from an edit that looks local and safe.
 *
 * A THROW IS THE RIGHT REFUSAL: it happens before any credential is minted, and the caller turns
 * it into a named refusal the model can read.
 */
export async function callCloseVerb(
  ctx: CloseTaskContext,
  verb: string,
  subjectId: string,
  sql: string,
  argsBefore: unknown[],
  rationale: string,
  modelId: string,
): Promise<unknown> {
  const values = [...argsBefore, rationale, JSON.stringify(closeModelIdentity(modelId)), closeOpKey(ctx.taskId, verb, subjectId)];
  assertTailBinding(verb, sql, values.length);
  return closeScoped(ctx, (c: PgExec) => c.query(sql, values).then((r) => r.rows[0]?.r ?? null));
}

/** The three names this helper always appends, in the order it appends them. Every one of 0138's
 *  twelve wrappers ends with exactly this triple — verified against all twelve signatures. */
const TAIL = ["p_rationale", "p_model", "p_op_key"] as const;

export function assertTailBinding(verb: string, sql: string, valueCount: number): void {
  const placeholders = new Set([...sql.matchAll(/\$(\d+)/g)].map((m) => Number(m[1])));
  if (placeholders.size !== valueCount || Math.max(...placeholders) !== valueCount) {
    throw new Error(
      `${verb}: SQL binds ${placeholders.size} distinct placeholders (max $${Math.max(...placeholders)}) but ${valueCount} values are being sent — a call site's argsBefore and its tail numbering have drifted apart`,
    );
  }
  TAIL.forEach((name, k) => {
    const n = valueCount - TAIL.length + 1 + k;
    if (!new RegExp(`\\b${name}\\s*=>\\s*\\$${n}\\b`).test(sql)) {
      throw new Error(`${verb}: expected \`${name} => $${n}\` — callCloseVerb appends ${TAIL.join(", ")} as the last three values, and this SQL does not bind them there`);
    }
  });
}

/** A close wrapper's jsonb reply, read POSITIVELY for admission.
 *
 *  THE KEY IS `status` AND THE ADMITTED VALUE IS 'acted' — read off 0138's own agent cores
 *  (e.g. `_agent_begin_close_core`, 0138:2100 / :2107), not guessed. An earlier draft of this
 *  function looked for `outcome === 'admitted'`, which is the BANK lane's receipt vocabulary and
 *  appears nowhere in a close reply: it would have counted zero acts on every successful run, so
 *  every proposing pass would have settled as though it had found nothing to do. Caught by
 *  reading the migration, not by a test — which is exactly why the cell below pins it.
 *
 *  Review law 2 holds: this counts what the reply SAYS, never the absence of an error. A call
 *  that threw never reaches here at all (the caller turns it into a refusal object), and a
 *  refusal reply says 'refused' in the same field. */
export function countIfAdmitted(rec: CloseRunRecord, reply: unknown): unknown {
  if ((reply as { status?: unknown } | null)?.status === "acted") rec.acts += 1;
  return reply;
}

const RATIONALE = z.string().min(1).describe("Why you are making this call, in one plain sentence.");

export function buildCloseReadTools(ctx: CloseTaskContext, modelId: string, rec: CloseRunRecord) {
  /** A read counts ONLY when the database says it acted.
   *
   *  THIS IS THE COUNTER THAT DECIDES WHETHER THE RUN SETTLED HONESTLY, which is why it gets the
   *  same treatment as `acts` rather than a looser one. An earlier draft incremented whenever the
   *  call did not THROW — but a close read's refusals do not throw: 0138:1799-1800 says so in
   *  words ("never raise: the transaction COMMITS so the reason is durable"), and
   *  `_close_read_gate` returns {status:'refused', …} (0138:1839) exactly like every write core.
   *  So a run whose every read was refused would have counted six reads, taken the `nothing_due`
   *  branch, and settled the task COMPLETED — writing twelve durable refused receipts while
   *  reporting a green night. That is the precise inversion of review law 2, in the one place the
   *  lane's own honesty depends on it.
   *
   *  The acted shape is `_agent_close_read_core`'s own: {status:'acted', receipt_id, result}
   *  (0138:1852). Same key, same value, same test as the write half — one vocabulary. */
  const read = async (verb: string, subject: string, sql: string, args: unknown[], rationale: string) => {
    try {
      const out = await callCloseVerb(ctx, verb, subject, sql, args, rationale, modelId);
      if ((out as { status?: unknown } | null)?.status === "acted") rec.reads += 1;
      return out;
    } catch (e) {
      return closeRefusal(e);
    }
  };

  return {
    [READ_TOOLS.LIST_FY]: tool({
      description: "List this client's fiscal years: which are open, reopened or closed, and when each ends. Start here.",
      inputSchema: z.object({ rationale: RATIONALE }),
      execute: ({ rationale }: { rationale: string }) =>
        read(
          "wake_list_fiscal_years",
          ctx.clientId,
          "select clara.wake_list_fiscal_years(p_client => $1, p_rationale => $2, p_model => $3::jsonb, p_op_key => $4) as r",
          [ctx.clientId],
          rationale,
        ),
    }),

    [READ_TOOLS.CLOSE_PLAN]: tool({
      description: "Read the close plan for one fiscal year — the ordered steps a close of this year involves.",
      inputSchema: z.object({ fiscal_year_id: z.string().uuid(), rationale: RATIONALE }),
      execute: ({ fiscal_year_id, rationale }: { fiscal_year_id: string; rationale: string }) =>
        read(
          "wake_get_close_plan",
          fiscal_year_id,
          "select clara.wake_get_close_plan(p_fiscal_year_id => $1, p_rationale => $2, p_model => $3::jsonb, p_op_key => $4) as r",
          [fiscal_year_id],
          rationale,
        ),
    }),

    [READ_TOOLS.READINESS]: tool({
      description: "Read whether this fiscal year is ready to close, and what is blocking it if not. Blockers are facts; read them before acting.",
      inputSchema: z.object({ fiscal_year_id: z.string().uuid(), rationale: RATIONALE }),
      execute: ({ fiscal_year_id, rationale }: { fiscal_year_id: string; rationale: string }) =>
        read(
          "wake_get_close_readiness",
          fiscal_year_id,
          // TWO ADJACENT UUIDs — transposition case B. Named notation closes ONE HALF of that
          // hazard and it is worth being exact about which: a wrong or misplaced NAME is now a
          // loud parse error rather than a silent mis-scope, and G1B-I3 machine-checks the names
          // against the catalog in order. What it does NOT close is the placeholder-to-VALUE
          // mapping: `p_client => $1` is correct only while $1 holds the client id. See
          // callCloseVerb's own header for the residual, and for the guard that bounds it.
          "select clara.wake_get_close_readiness(p_client => $1, p_fy => $2, p_rationale => $3, p_model => $4::jsonb, p_op_key => $5) as r",
          [ctx.clientId, fiscal_year_id],
          rationale,
        ),
    }),

    [READ_TOOLS.DRY_RUN]: tool({
      description: "Test close readiness WITHOUT committing to anything — use this to check a shape before you act on it.",
      inputSchema: z.object({ fiscal_year_id: z.string().uuid(), rationale: RATIONALE }),
      execute: ({ fiscal_year_id, rationale }: { fiscal_year_id: string; rationale: string }) =>
        read(
          "wake_dry_run_close_readiness",
          fiscal_year_id,
          "select clara.wake_dry_run_close_readiness(p_client => $1, p_fy => $2, p_rationale => $3, p_model => $4::jsonb, p_op_key => $5) as r",
          [ctx.clientId, fiscal_year_id],
          rationale,
        ),
    }),

    [READ_TOOLS.VERIFY]: tool({
      description: "Verify an existing close receipt — what it covers and whether it still holds.",
      inputSchema: z.object({ close_receipt_id: z.string().uuid(), rationale: RATIONALE }),
      execute: ({ close_receipt_id, rationale }: { close_receipt_id: string; rationale: string }) =>
        read(
          "wake_verify_close",
          close_receipt_id,
          "select clara.wake_verify_close(p_receipt => $1, p_rationale => $2, p_model => $3::jsonb, p_op_key => $4) as r",
          [close_receipt_id],
          rationale,
        ),
    }),

    [READ_TOOLS.SNAPSHOT_STATE]: tool({
      description: "Read the state of one period snapshot.",
      inputSchema: z.object({ snapshot_id: z.string().uuid(), rationale: RATIONALE }),
      execute: ({ snapshot_id, rationale }: { snapshot_id: string; rationale: string }) =>
        read(
          "wake_snapshot_state",
          snapshot_id,
          "select clara.wake_snapshot_state(p_snapshot => $1, p_rationale => $2, p_model => $3::jsonb, p_op_key => $4) as r",
          [snapshot_id],
          rationale,
        ),
    }),
  };
}
