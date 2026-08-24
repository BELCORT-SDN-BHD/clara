// @frozen
//
// FROZEN — part of the autoDraft_v9 closure (F-A2: the agentic posting lane; see
// autoDraft.v9.tools.ts for the one statement of what v9 is). A NEW frozen closure beside the
// byte-untouched autoDraft_v1..v8 (ARCHITECTURE Appendix A).
//
// THIS FILE (postcall) — NEW in v9. It is the ONLY caller of `clara.wake_post_entry` on the
// unattended lane, and it does exactly two things: assemble the inputs the agent may not pick,
// and read the DB's receipt back WITHOUT re-deriving any part of it.
//
// WHAT THE AGENT MAY NOT PICK, AND WHY EACH IS ASSEMBLED HERE (design §3.1; the verb refuses
// each one at the door, so a model that could supply them could supply a wrong one):
//   client          — the task's OWN admission-bound client, never a tool argument.
//   books_version   — read from the context pack in the SAME wake-scoped read, so it is the
//                     token this call actually saw rather than one carried from an earlier step.
//   model snapshot  — provider + model + version, all three non-blank (the table CHECK refuses
//                     an incomplete one; the verb refuses it BEFORE the ladder runs, so an
//                     unrecordable post never reaches the walls at all).
//   op_key          — DETERMINISTIC (task + tool + entry). That determinism is what makes a
//                     REPLAYED durable step reuse the reservation instead of posting twice;
//                     minting a fresh key here would defeat it, which is why the verb refuses a
//                     blank one rather than inventing one of its own.
//
// AND THE ONE THING ONLY THE AGENT KNOWS: the rationale. Law 71 puts it on the receipt beside
// the model identity, permanently, and `wake_post_entry` refuses a blank one — an unattended
// post with no stated reason is exactly what this lane may not produce.
//
// THE RECEIPT IS CARRIED, NEVER RE-DERIVED. `rung_vector` and `verdict` record what the DB SAW.
// This file copies them; it never recomputes a rung, never re-reads a wall, and never decides
// that a refusal was really a pass. The one judgement it does make is FAIL-CLOSED: a receipt
// whose shape it does not recognise is `unreadablePostReceiptRefusal`, never a post.

import type { PostToolResult } from "./autoDraft.v9.prompt.js";
import { type PostInput, type EntryPostedPart } from "./autoDraft.v9.post.js";
import {
  tierBRefusal,
  tierCRefusal,
  tierDCapture,
  unreadablePostReceiptRefusal,
  vectorAdmits,
  type DbError,
} from "./autoDraft.v9.errors.js";
import { readScoped, writeScoped, type PgExec, type ToolCtx } from "./autoDraft.v9.infra.js";

/** The model snapshot law 71 records. `provider` is the vendor family, `model` the snapshot id
 *  the run was dispatched with, `version` this workflow closure — so the receipt says not only
 *  WHICH model posted but which body of code asked it to. All three must be non-blank or the
 *  verb refuses; that is asserted here too, so an unrecordable post is refused before the
 *  roundtrip rather than after. */
export const AUTODRAFT_POST_CLOSURE_VERSION = "autoDraft_v9";

export function modelSnapshot(modelId: string): { provider: string; model: string; version: string } {
  return { provider: "openai", model: modelId, version: AUTODRAFT_POST_CLOSURE_VERSION };
}

/** The deterministic idempotency key for ONE post of ONE entry by ONE task. It names the task,
 *  the verb and the entry — never a clock, never a random — because a WDK step that is replayed
 *  after a crash must present the SAME key and get the stored receipt back rather than posting a
 *  second time. */
export function postOpKey(taskId: string, entryId: string): string {
  return `post-entry:${taskId}:${entryId}`;
}

/** The receipt `clara.wake_post_entry` returns (design Annex E.0). Every field is optional at
 *  the type level because nothing here validates the RPC's shape for us — `readPostReceipt`
 *  below is what decides whether a given object is one of the three shapes this lane accepts. */
type PostReceipt = {
  entry_id?: unknown;
  posted?: unknown;
  status?: unknown;
  refusal?: { tier?: unknown; reason?: unknown; rung?: unknown; clr?: unknown; verdict_value?: unknown } | null;
  rung_vector?: unknown;
  post_receipt_id?: unknown;
  verdict?: unknown;
};

function isNonEmptyString(x: unknown): x is string {
  return typeof x === "string" && x.length > 0;
}
function asRecord(x: unknown): Record<string, string> {
  if (!x || typeof x !== "object" || Array.isArray(x)) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(x as Record<string, unknown>)) out[k] = typeof v === "string" ? v : String(v);
  return out;
}
function asObject(x: unknown): Record<string, unknown> {
  return x && typeof x === "object" && !Array.isArray(x) ? (x as Record<string, unknown>) : {};
}

/**
 * Classify the post receipt. THREE recognised shapes and nothing else — anything outside them
 * throws to the caller's fail-closed branch rather than being coerced into the nearest one.
 *
 *   POSTED     `posted === true`, a `post_receipt_id`, `status === 'approved'`, and a rung vector
 *              in which EVERY rung on the closed roster reads 'pass'. That last conjunct is the
 *              consumer contract applied to the producer's own answer: `posted:true` and a
 *              non-admitting vector cannot both be true, and if they ever are, the honest thing
 *              is to refuse to call it a post rather than to believe the boolean.
 *   REFUSED-B  `posted === false`, `refusal.tier === 'B'`, a reason token and the full vector.
 *   REFUSED-C  `posted === false`, `refusal.tier === 'C'`, a reason token and its CLR code.
 *
 * A Tier-D abort never arrives here at all: deferred constraint triggers fire at COMMIT, outside
 * the verb's own exception block, so it surfaces as a THROWN error and is captured by the
 * caller's catch as `last_refusal`.
 */
export function readPostReceipt(receipt: unknown): PostToolResult {
  if (!receipt || typeof receipt !== "object") return { ok: false, refusal: unreadablePostReceiptRefusal(), tier: "B" };
  const r = receipt as PostReceipt;

  if (r.posted === true) {
    const vector = asRecord(r.rung_vector);
    if (!isNonEmptyString(r.post_receipt_id) || !isNonEmptyString(r.entry_id) || r.status !== "approved") {
      return { ok: false, refusal: unreadablePostReceiptRefusal(), tier: "B" };
    }
    if (!vectorAdmits(vector)) {
      // The producer said posted and its own vector disagrees. Refusing to report a post is the
      // only safe reading: a disagreement between the two is a finding, and design §6 already
      // treats a disagreement between `entry_post_receipts` and `sweep_run_items` the same way.
      return { ok: false, refusal: unreadablePostReceiptRefusal(), tier: "B" };
    }
    const posted: EntryPostedPart = {
      type: "entry_posted",
      entry_id: String(r.entry_id),
      client_id: "",
      post_receipt_id: String(r.post_receipt_id),
      rung_vector: vector,
      verdict: asObject(r.verdict),
    };
    return { ok: true, posted };
  }

  if (r.posted === false && r.refusal && typeof r.refusal === "object") {
    const tier = r.refusal.tier;
    const reason = typeof r.refusal.reason === "string" ? r.refusal.reason : undefined;
    if (tier === "B") {
      const rung = typeof r.refusal.rung === "string" ? r.refusal.rung : undefined;
      return { ok: false, refusal: tierBRefusal(reason, rung), rung_vector: asRecord(r.rung_vector), tier: "B" };
    }
    if (tier === "C") {
      const clr = typeof r.refusal.clr === "string" ? r.refusal.clr : undefined;
      return { ok: false, refusal: tierCRefusal(clr, reason), rung_vector: asRecord(r.rung_vector), tier: "C" };
    }
  }

  return { ok: false, refusal: unreadablePostReceiptRefusal(), tier: "B" };
}

/**
 * The post_journal_entry wrapper (exported for direct unit testing). Reads the books token, then
 * executes `clara.wake_post_entry` through the write floor under the autodraft credential.
 * Never throws — always resolves to a typed result.
 *
 * THE BOOKS TOKEN IS READ IN THIS CALL, not carried. `p_books_version` is the agent's statement
 * of what ledger she read; defaulting it would let the lane post against a moved ledger and call
 * it current, which is why the verb refuses a null one. A pack read that yields no token is
 * therefore a REFUSAL here rather than a null passed downstream — absence is not evidence.
 */
export async function runPostJournalEntry(
  ctx: ToolCtx,
  input: PostInput,
  modelId: string,
): Promise<PostToolResult> {
  const snapshot = modelSnapshot(modelId);
  if (!snapshot.provider.trim() || !snapshot.model.trim() || !snapshot.version.trim()) {
    return {
      ok: false,
      tier: "B",
      refusal: {
        type: "refusal",
        code: "CLR10",
        reason: "model_snapshot_incomplete",
        message: "This run cannot name the model that would be posting, so it does not post.",
      },
    };
  }
  try {
    const booksVersion = await readScoped(ctx, async (c: PgExec) => {
      const row = await c.query("select clara.get_context_pack($1, $2) as pack", [ctx.clientId, "coding"]);
      const pack = (row.rows[0]?.pack ?? {}) as { books_version?: unknown };
      return typeof pack.books_version === "number" || typeof pack.books_version === "string" ? pack.books_version : null;
    });
    if (booksVersion === null) {
      return {
        ok: false,
        tier: "B",
        refusal: {
          type: "refusal",
          code: "CLR10",
          reason: "books_version_unreadable",
          message: "The ledger's freshness token could not be read, so this entry is not posted unattended.",
        },
      };
    }

    const receipt = await writeScoped(ctx, async (c: PgExec) => {
      const r = await c.query(
        `select clara.wake_post_entry(
           $1::uuid, $2::uuid, $3::uuid, $4::bigint, $5::text, $6::jsonb, $7::text
         ) as receipt`,
        [
          input.entry_id,
          input.revision_token,
          ctx.clientId,
          booksVersion,
          input.rationale,
          JSON.stringify(snapshot),
          postOpKey(ctx.taskId, input.entry_id),
        ],
      );
      return r.rows[0]?.receipt ?? null;
    });

    const result = readPostReceipt(receipt);
    // The client is the TASK's, not a field of the receipt — the receipt names the entry and the
    // ladder already proved the entry belongs to this client (CLR11 twice over), so reading it
    // back off the payload would add a channel without adding a check.
    if (result.ok) result.posted.client_id = ctx.clientId;
    return result;
  } catch (e) {
    // TIER D — a COMMIT-time abort, which no exception block inside the verb can convert. It is
    // never an admission verdict: the task settles `failed` and the (errcode, reason) is
    // recorded verbatim in `last_refusal`. An UNLISTED Tier-C pair also lands here, by design —
    // the verb re-raises it rather than converting, so it too becomes a task failure and is
    // visible as one.
    const capture = tierDCapture(e as DbError);
    return {
      ok: false,
      tier: "D",
      last_refusal: capture as unknown as Record<string, unknown>,
      refusal: { type: "refusal", code: capture.clr, reason: capture.reason ?? undefined, message: capture.message },
    };
  }
}
