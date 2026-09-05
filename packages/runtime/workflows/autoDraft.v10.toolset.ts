// @frozen
//
// FROZEN — part of the autoDraft_v10 closure (see autoDraft.v10.tools.ts for the one statement
// of what v10 is). A NEW frozen closure beside the byte-untouched autoDraft_v1..v9
// (ARCHITECTURE Appendix A).
//
// THIS FILE IS A VERSION-RENAME of autoDraft.v9.toolset.ts, byte-identical but for ONE import
// line: `./autoDraft.v9.tools.js` -> `./autoDraft.v10.tools.js`, which is the only sibling that
// reaches the changed errors map. `.postcall.js` deliberately STAYS at v9 — it imports only the
// Tier B/C/D post vocabulary and `DbError` from v9's errors module, never `refusalFromDbError`,
// so the POST lane's behaviour is byte-identical and re-versioning it would buy nothing.
//
// THIS FILE (toolset) — the AI-SDK wiring, moved out of `autoDraft.v9.tools.ts` at v9 (that file
// is at the repo's 500-line ceiling and the POST tool joins the set here). The five perception
// reads and the draft write were BYTE-CARRIED from v8's `buildAutoDraftTools`; what was NEW at
// v9 is the sixth tool, `post_journal_entry`, and the two guards around it.
//
// THE TWO GUARDS, AND WHY THEY ARE HERE RATHER THAN IN THE DB. Neither is a wall — the DB owns
// every wall — and neither can admit anything the ladder would refuse. They exist because a
// refusal a bookkeeper can act on beats an abort nobody can read:
//
//   1. POST ONLY WHAT THIS RUN DRAFTED. The tool set closure remembers the entry the draft tool
//      returned in THIS execution, and a post naming any other entry is refused before any DB
//      call. The DB's A8 already refuses a post of anything the agent did not draft AND nobody
//      has touched, so this adds no authority — it turns a cross-entry mistake into a named
//      refusal instead of a CLR-coded one, and (the load-bearing half) a WDK REPLAY rebuilds
//      this record EMPTY, which fails closed.
//   2. POST ONCE. One document, one entry, one post. A second call is refused locally rather
//      than relying on the op-key replay to return the stored receipt, because "the second call
//      quietly got the first call's answer" is a worse transcript than "the second call was
//      refused". The determinism of the op key still backstops a genuine WDK replay.

import { tool } from "ai";
import { z } from "zod";
import { DRAFT_TOOL, draftJournalEntryInputSchema } from "./autoDraft.v9.prompt.js";
import { POST_TOOL, postJournalEntryInputSchema, type PostInput } from "./autoDraft.v9.post.js";
import { runDraftJournalEntry, newReadSnapshots, extractRev, type DraftInput } from "./autoDraft.v10.tools.js";
import { runPostJournalEntry } from "./autoDraft.v9.postcall.js";
import { readScoped, safeRead, type ToolCtx } from "./autoDraft.v9.infra.js";
import type { PostToolResult } from "./autoDraft.v9.prompt.js";

/**
 * Build the autoDraft tool set. Every read is client-pinned under the autodraft credential; a
 * read tool's authority/tenant error becomes ONE oracle-safe refusal (safeRead). NO clarify tool
 * (unattended). The five perception reads (companion §4 allowlist) + the draft write + F-A2's
 * post write. `modelId` is the snapshot the run was dispatched with; it rides onto the posting
 * receipt as law 71's model identity.
 */
export function buildAutoDraftTools(ctx: ToolCtx, modelId: string) {
  const clientId = ctx.clientId;
  // THE IN-RUN READ RECORD (the fix round's gate). One map per tool set, i.e. per model-step
  // execution: read_document writes the snapshot rev it showed the model, the draft wrapper
  // requires it. A replay rebuilds this EMPTY, which fails closed.
  const reads = newReadSnapshots();
  // F-A2's in-run DRAFT record — same law, same lifetime, same replay behaviour: the entry this
  // run drafted, and whether it has already been posted.
  let draftedEntryId: string | null = null;
  let postedOnce = false;

  return {
    read_document: tool({
      description:
        "Read this document's stored extraction: filing state, invoice facts (when present), bounded text, and the numbered regions — each carries an `idx` you cite as evidence.",
      inputSchema: z.object({ document_id: z.string().uuid().optional() }),
      execute: () =>
        safeRead(() =>
          readScoped(ctx, (c) =>
            c.query("select clara.get_document_extract($1::uuid, $2::uuid) as x", [ctx.documentId, clientId]).then((r) => {
              const extract = r.rows[0]?.x ?? null;
              // Record WHAT WAS SHOWN, not that a read happened: the rev is the mapping the
              // model is about to index into. A throwing read records nothing, so a failed
              // read can never license a citation.
              reads.set(ctx.documentId, extractRev(extract));
              return extract;
            }),
          ),
        ),
    }),
    get_context_pack: tool({
      description: "Read the typed context pack for this client (chart of accounts, recent entries, and the books_version token).",
      inputSchema: z.object({ purpose: z.literal("wiki_coding").optional() }),
      execute: ({ purpose }: { purpose?: "wiki_coding" }) =>
        safeRead(() =>
          readScoped(ctx, async (c) => {
            // FORK-6: the marker GUC is set txn-local on the SAME client, immediately
            // before the pack fetch, inside the SAME readScoped transaction — the DB
            // gate (0017's get_context_pack case) reads current_setting inside this
            // one txn, so the pair must share it. D22: v9 keeps sending 'v25' — it is a
            // CAPABILITY token, not a version assertion, so it does not move with the closure.
            await c.query("select set_config('clara.pack_consumer', $1, true)", ["v25"]);
            const r = await c.query("select clara.get_context_pack($1, $2) as pack", [clientId, purpose ?? "wiki_coding"]);
            return r.rows[0]?.pack ?? null;
          }),
        ),
    }),
    coding_lane: tool({
      description: "Read the DB-computed lane and reasons for this filing (READY / NEEDS REVIEW / NEEDS YOU) — qualitative signals only.",
      inputSchema: z.object({}),
      execute: () =>
        safeRead(() =>
          readScoped(ctx, (c) =>
            c
              .query("select lane, reasons from clara.coding_lane($1, $2)", [clientId, ctx.filingId])
              .then((r) => r.rows[0] ?? null),
          ),
        ),
    }),
    get_draft_review: tool({
      description: "Read the authoritative review state of an existing draft entry for this client (outcome, exception panel, evidence).",
      inputSchema: z.object({ entry_id: z.string().uuid() }),
      execute: ({ entry_id }: { entry_id: string }) =>
        safeRead(() =>
          readScoped(ctx, (c) => c.query("select clara.get_draft_review($1::uuid, $2::uuid) as r", [entry_id, clientId]).then((r) => r.rows[0]?.r ?? null)),
        ),
    }),
    [DRAFT_TOOL]: tool({
      description:
        "Draft ONE journal entry: a supplier bill — with NO stated tax, or a stated ZERO tax, in the facts, " +
        "expense debit(s) GROSS + a credit to Accounts Payable GROSS with the vendor; with a STATED NONZERO tax, expense debit(s) NET + " +
        "ONE sst_purchase_cost debit equal EXACTLY to the stated tax + the Accounts Payable credit GROSS — " +
        "a sales invoice / sales credit note (Trade Debtors debit/credit gross + revenue credit/debit net, + an SST output " +
        "credit/debit when the document states tax) with the customer — or a generic journal_entry mirroring a voucher's own " +
        "stated debits and credits, which takes NO counterparty and NO receivable or payable line. " +
        "Provide coding_kind, lines, document_id, the counterparty (required except on a journal_entry), and an evidence array citing " +
        "each amount by its region `idx` from read_document (never a region id) — never set " +
        "counterparty.kind yourself, it is derived from coding_kind. If the document is not lawfully draftable, do NOT call this — " +
        "explain the block in text. Drafting does not post: call post_journal_entry after this succeeds.",
      inputSchema: draftJournalEntryInputSchema,
      execute: async (input: DraftInput) => {
        const result = await runDraftJournalEntry(ctx, input, reads);
        if (result.ok) draftedEntryId = result.je_review.entry_id;
        return result;
      },
    }),
    [POST_TOOL]: tool({
      description:
        "POST the entry you just drafted into the client's books, under your own identity. Call this ONCE, only after " +
        "draft_journal_entry succeeded, with the entry_id and revision_token it returned and a short rationale in your own " +
        "words saying why this coding is right for this document. The database re-evaluates every gate and either posts the " +
        "entry or returns a typed refusal naming the gate that stopped it; a refusal is a normal outcome — the entry stays a " +
        "draft for a human and you simply say so in plain text. Never call this for an entry you did not draft in this run, " +
        "never call it twice, and never re-draft after a refused post.",
      inputSchema: postJournalEntryInputSchema,
      execute: async (input: PostInput): Promise<PostToolResult> => {
        if (draftedEntryId === null || input.entry_id !== draftedEntryId) {
          return {
            ok: false,
            tier: "B",
            refusal: {
              type: "refusal",
              code: "CLR11",
              reason: "post_entry_not_drafted_here",
              message: "This run may only post the entry it drafted in this run.",
            },
          };
        }
        if (postedOnce) {
          return {
            ok: false,
            tier: "B",
            refusal: {
              type: "refusal",
              code: "CLR29",
              reason: "post_already_attempted",
              message: "This entry has already been submitted for posting in this run.",
            },
          };
        }
        postedOnce = true;
        return runPostJournalEntry(ctx, input, modelId);
      },
    }),
  };
}
