// @frozen
//
// FROZEN — part of the autoDraft_v9 closure (F-A2: the agentic posting lane; see
// autoDraft.v9.tools.ts for the one statement of what changed and why). A NEW frozen closure
// beside the byte-untouched autoDraft_v1..v8 (ARCHITECTURE Appendix A: a behavioural change
// ships as a new _vN export, never an in-place edit — the registry repoints `autoDraft:` here).
//
// THIS FILE (post) — NEW in v9, and it exists for a mechanical reason worth stating so nobody
// folds it back: `autoDraft.v9.prompt.ts` is at the repo's 500-line file ceiling, and the POST
// toolface is the one part of v9 that has no v8 ancestor to sit beside. It carries ONLY the
// leaf shapes — the tool name, the input schema and the posted card — with NO import from
// prompt.ts, so the dependency runs one way (prompt.ts imports and re-exports from here) and
// there is no cycle. Everything that needs `RefusalPart` stays in prompt.ts.
//
// Third-party imports (zod) are outside the freeze surface.

import { z } from "zod";

/** F-A2: the POST tool. Named separately from DRAFT_TOOL because the two are different ACTS —
 *  a draft is a proposal, a post is an entry in the client's books — and every stop condition,
 *  reducer and settle branch in this closure discriminates on which one produced a result. */
export const POST_TOOL = "post_journal_entry";

// ---------------------------------------------------------------------------
// The post_journal_entry input schema.
//
// IT CARRIES NO FIGURES, AND THAT IS THE DESIGN. The entry is already in the database; every
// wall reads it there. What the model supplies is exactly the three things only it knows: WHICH
// entry, WHICH revision it read, and WHY. Everything else the verb requires — the client, the
// books_version token, the model snapshot and the idempotency key — is assembled server-side by
// the wrapper in autoDraft.v9.tools.ts, because `clara.wake_post_entry` refuses a blank
// rationale, an incomplete model snapshot, a null books token or a blank op key, and an agent
// that could pick any of them could pick a wrong one (design §3.1: "the agent never picks an
// authoritative input").
// ---------------------------------------------------------------------------
export const postJournalEntryInputSchema = z.object({
  entry_id: z.string().uuid().describe("The entry draft_journal_entry just returned in THIS run."),
  revision_token: z
    .string()
    .uuid()
    .describe(
      "The revision_token draft_journal_entry returned with that entry. It is the statement of " +
        "which version of the entry you are posting; if anyone has touched the draft since, the " +
        "token no longer matches and the post is refused.",
    ),
  rationale: z
    .string()
    .min(1)
    .max(4000)
    .describe(
      "WHY this coding is right for this document, in your own words — what the document is, " +
        "which side the client is on, and what made it unambiguous. Recorded permanently on the " +
        "posting receipt beside your model identity. Never blank, never a restatement of the " +
        "figures.",
    ),
});
export type PostInput = z.infer<typeof postJournalEntryInputSchema>;

/** The card a SUCCESSFUL post yields. `rung_vector` is the DB's own three-valued vector over the
 *  closed roster — carried VERBATIM, never re-derived here, because the DB is the only thing
 *  that evaluated it and a second derivation is a second opinion nobody asked for.
 *  `post_receipt_id` is the `clara.entry_post_receipts` row id, which is the surface design §6
 *  counts POSTED from (it cross-checks `sweep_run_items.outcome='posted'`, and a disagreement
 *  between the two is itself a finding). */
export type EntryPostedPart = {
  type: "entry_posted";
  entry_id: string;
  client_id: string;
  post_receipt_id: string;
  rung_vector: Record<string, string>;
  verdict: Record<string, unknown>;
};
