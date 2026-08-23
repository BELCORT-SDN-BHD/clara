// @frozen
//
// FROZEN — part of the chatTurn_v13 closure (F-A2 CHAT PARITY, owner ruling D34). A NEW frozen
// closure beside the byte-untouched chatTurn_v1..v12 (ARCHITECTURE Appendix A: a behavioural
// change ships as a new _vN export, never an in-place edit — registry.ts repoints `chatTurn:`
// here).
//
// THIS FILE (post) — NEW in v13: the attended lane's two F-A2 toolfaces and their wrappers.
//
// PARITY MEANS THE SAME LADDER, NOT A SECOND ONE. The chat post calls the SAME
// `clara.wake_post_entry` the unattended lane calls, so the same thirteen rungs, the same four
// tiers and the same receipt bind it. Nothing in this file is a wall; where it refuses early it
// is saving a roundtrip on something the DB would refuse anyway.
//
// THE ONE THING THAT DIFFERS, AND WHY IT IS THE WHOLE LIMB. The contract requires that what
// cannot post lands as a draft OR A TYPED OPEN QUESTION. The unattended lane already had the
// second half (`autodraft` credentials are client-pinned by construction); the chat lane did
// not, because `wake_open_question` is keyed on the credential's CLIENT PIN and plain
// `interactive` is client-less by construction. `open_client_question` below is that missing
// half, and it is the ONLY caller of the pinned `interactive_client` kind (R-1).
//
// WHAT `via_wake_kind` SAYS ON A CHAT POST, AND WHY IT IS NOT THE PINNED KIND. A chat post lands
// with `via_wake_kind='interactive'` — the plain kind — because the post runs under a plain
// `interactive` credential. `clara.entry_post_receipts`' own CHECK admits only
// {autodraft, interactive}, and `wake_post_entry` is allowlisted for those two kinds and no
// third. The pinned kind holds EXACTLY ONE allowlist row, for `wake_open_question`, which posts
// nothing. All three facts were read off the live catalog on the rig, not from the design text:
// the pinned kind is structurally incapable of posting, which is what makes R-1's narrowing a
// wall rather than a convention.

import { z } from "zod";
import type { RefusalPart } from "./chatTurn.v10.prompt.js";
import { readScoped, writeScoped, questionScoped, type PgExec, type ToolCtx } from "./chatTurn.v13.infra.js";

/** The two F-A2 tool names the chat lane gains. Named constants because the part-promotion law,
 *  the stop conditions and the terminal invariant all discriminate on them. */
export const POST_TOOL = "post_journal_entry";
export const OPEN_QUESTION_TOOL = "open_client_question";

/** The closure identity that rides onto the posting receipt as law 71's `model_snapshot.version`
 *  — which BODY OF CODE asked the model, not only which model answered. */
export const CHATTURN_POST_CLOSURE_VERSION = "chatTurn_v13";

export function chatModelSnapshot(modelId: string): { provider: string; model: string; version: string } {
  return { provider: "openai", model: modelId, version: CHATTURN_POST_CLOSURE_VERSION };
}

/** The deterministic idempotency key for ONE post of ONE entry by ONE chat task. Never a clock,
 *  never a random: a WDK step replayed after a crash must present the SAME key and get the
 *  stored receipt back rather than posting a second time. */
export function chatPostOpKey(taskId: string, entryId: string): string {
  return `chat-post-entry:${taskId}:${entryId}`;
}

// ---------------------------------------------------------------------------------------------
// The toolfaces.
// ---------------------------------------------------------------------------------------------

/** POST carries NO figures — the entry is already in the DB and every wall reads it there. The
 *  model supplies only what it alone knows: which entry, which revision it read, and why. */
export const chatPostJournalEntryInputSchema = z.object({
  entry_id: z.string().uuid().describe("The entry to post — one you drafted for this client in this conversation."),
  revision_token: z
    .string()
    .uuid()
    .describe(
      "The revision_token the draft returned. It states WHICH version of the entry you are " +
        "posting; if anyone has touched the draft since, it no longer matches and the post is refused.",
    ),
  rationale: z
    .string()
    .min(1)
    .max(4000)
    .describe(
      "WHY this coding is right for this document, in your own words. Recorded permanently on the " +
        "posting receipt beside your model identity. Never blank, never a restatement of the figures.",
    ),
});
export type ChatPostInput = z.infer<typeof chatPostJournalEntryInputSchema>;

/** The typed open question — the OTHER half of "a draft or a typed open question". */
export const openClientQuestionInputSchema = z.object({
  scope_kind: z
    .enum(["document", "vendor", "client"])
    .describe("What the question is about: this document, this counterparty, or the client generally."),
  scope_id: z
    .string()
    .uuid()
    .optional()
    .describe("The document or counterparty the question is scoped to. Omit for a client-scoped question."),
  question: z
    .string()
    .min(1)
    .max(2000)
    .describe("The question a person must answer, in plain language. It becomes a durable item in their queue."),
});
export type OpenClientQuestionInput = z.infer<typeof openClientQuestionInputSchema>;

/** The card a successful chat post yields. Same shape as the unattended lane's, deliberately:
 *  one post surface, one card, one thing for the dashboard to render. */
export type EntryPostedPart = {
  type: "entry_posted";
  entry_id: string;
  client_id: string;
  post_receipt_id: string;
  rung_vector: Record<string, string>;
  verdict: Record<string, unknown>;
};

/** The part a successful `open_client_question` yields. */
export type QuestionOpenedPart = {
  type: "question_opened";
  question_id: string;
  scope_kind: string;
  question: string;
};

export type ChatPostToolResult =
  | { ok: true; posted: EntryPostedPart }
  | { ok: false; refusal: RefusalPart; rung_vector?: Record<string, string>; tier: "B" | "C" | "D" };

export type OpenQuestionToolResult = { ok: true; question_opened: QuestionOpenedPart } | { ok: false; refusal: RefusalPart };

// ---------------------------------------------------------------------------------------------
// The refusal vocabulary, chat side. The tokens are the DB's; the messages are attended-lane
// wording — a person is reading them, so they say what to do next, which the unattended lane's
// receipts have no reader to say it to.
// ---------------------------------------------------------------------------------------------

const TIER_B_MESSAGES: Record<string, string> = {
  settlement_kind_human: "Which open bill this settles is your call, not mine — I have left it as a draft for you.",
  not_corroborated: "The document's amounts are not machine-corroborated, so I cannot post it. The draft is ready for you to check.",
  anchor_unbound: "This entry is not bound to a corroborated amount on the document, so I have left it as a draft.",
  anchor_untied: "The entry's amounts do not tie to the corroborated document total, so I have left it as a draft.",
  amount_conflict: "The draft carries an amount exception with no override — the figures disagree, so I have not posted it.",
  human_override_present: "Someone has overridden a number on this draft, so posting it is a person's decision, not mine.",
  unverified_evidence: "The amount-bearing citation is not verified evidence, so I have left this as a draft.",
  facts_moved: "The document's facts moved after this draft was written and a citation still names the old extraction, so I have not posted it.",
  open_question_blocks: "An open question blocks this document — resolve it and I can post.",
  supplier_leg_shape: "The supplier-bill leg shape does not satisfy the ledger's floor, so I have left this as a draft.",
  sales_leg_shape: "The sales leg shape does not satisfy the ledger's floor, so I have left this as a draft.",
  generic_control_leg: "A generic journal entry may not carry a receivable or payable leg — this one does, so I have not posted it.",
  generic_on_directional_document: "This document has a direction (sales or purchase), so it should not be coded as a generic journal entry.",
  generic_registration_untestable: "This document states a party registration I could not check against this client's own identifiers.",
};

const TIER_C_MESSAGES: Record<string, string> = {
  currency_unsupported: "This ledger is MYR-only, so a non-MYR document cannot be posted here.",
  corroboration_contradicted: "The corroborated amount contradicts this entry, so the ledger refused the post.",
  counterparty_landscape_moved: "The counterparty landscape moved while I was posting — read the draft again and we can retry.",
  registration_conflict: "The proposed counterparty's registration conflicts with an existing record.",
  counterparty_birth_race: "Someone created this counterparty at the same moment; read the draft again and we can retry.",
  customer_identity_name_only: "This client's customers are recorded by NAME ONLY — a registration or tax number may not be attached.",
  duplicate_bill: "This exact bill already has an approved entry.",
  duplicate_sales: "This exact sales document already has an approved entry.",
  write_into_closed_period: "The posting date falls in a closed period.",
};

function postRefusal(code: string, reason: string | undefined, table: Record<string, string>, fallback: string): RefusalPart {
  return { type: "refusal", code, reason, message: (reason && table[reason]) ?? fallback };
}

/** THE CONSUMER CONTRACT (design §3.2, D26), applied on the chat side too. A rung ADMITS only on
 *  the exact string 'pass'; `fail`, `not_evaluable`, an unknown value and a MISSING key are all
 *  non-admitting. Written positively on purpose — testing for 'fail' would let a rung added
 *  later arrive absent and read as admitted. */
export const TIER_B_RUNGS = ["B1", "B2", "B3", "B4", "B5", "B6", "B7", "B8", "B9", "B10", "B11", "B14", "B15"] as const;

export function vectorAdmits(vector: Record<string, unknown> | null | undefined): boolean {
  return !!vector && TIER_B_RUNGS.every((r) => vector[r] === "pass");
}

function asStringRecord(x: unknown): Record<string, string> {
  if (!x || typeof x !== "object" || Array.isArray(x)) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(x as Record<string, unknown>)) out[k] = typeof v === "string" ? v : String(v);
  return out;
}

function asObject(x: unknown): Record<string, unknown> {
  return x && typeof x === "object" && !Array.isArray(x) ? (x as Record<string, unknown>) : {};
}

/** Classify the post receipt. Three recognised shapes; anything else is refused as unreadable
 *  rather than coerced into the nearest one. Identical logic to the unattended lane's
 *  `readPostReceipt` — deliberately duplicated rather than imported, because importing across
 *  two frozen closures would make every future edit to one a version change in the other. */
export function readChatPostReceipt(receipt: unknown): ChatPostToolResult {
  const unreadable: ChatPostToolResult = {
    ok: false,
    tier: "B",
    refusal: {
      type: "refusal",
      code: "internal",
      reason: "post_receipt_unreadable",
      message: "The ledger returned a posting receipt I do not recognise, so I have recorded nothing as posted.",
    },
  };
  if (!receipt || typeof receipt !== "object") return unreadable;
  const r = receipt as {
    entry_id?: unknown;
    posted?: unknown;
    status?: unknown;
    refusal?: { tier?: unknown; reason?: unknown; rung?: unknown; clr?: unknown } | null;
    rung_vector?: unknown;
    post_receipt_id?: unknown;
    verdict?: unknown;
  };

  if (r.posted === true) {
    const vector = asStringRecord(r.rung_vector);
    if (typeof r.post_receipt_id !== "string" || !r.post_receipt_id) return unreadable;
    if (typeof r.entry_id !== "string" || !r.entry_id) return unreadable;
    if (r.status !== "approved") return unreadable;
    // The producer said posted and its own vector disagrees. Refusing to report a post is the
    // only safe reading — design §6 treats exactly this class of disagreement as a finding.
    if (!vectorAdmits(vector)) return unreadable;
    return {
      ok: true,
      posted: {
        type: "entry_posted",
        entry_id: r.entry_id,
        client_id: "",
        post_receipt_id: r.post_receipt_id,
        rung_vector: vector,
        verdict: asObject(r.verdict),
      },
    };
  }

  if (r.posted === false && r.refusal && typeof r.refusal === "object") {
    const reason = typeof r.refusal.reason === "string" ? r.refusal.reason : undefined;
    if (r.refusal.tier === "B") {
      return {
        ok: false,
        tier: "B",
        rung_vector: asStringRecord(r.rung_vector),
        refusal: postRefusal("CLR-POST-B", reason, TIER_B_MESSAGES, "This entry did not pass the posting gates, so I have left it as a draft."),
      };
    }
    if (r.refusal.tier === "C") {
      const clr = typeof r.refusal.clr === "string" ? r.refusal.clr : "CLR-POST-C";
      return {
        ok: false,
        tier: "C",
        rung_vector: asStringRecord(r.rung_vector),
        refusal: postRefusal(clr, reason, TIER_C_MESSAGES, "A ledger wall refused this post."),
      };
    }
  }
  return unreadable;
}

/** The six deferred belt tokens (design E.2, GM-3). A Tier-D abort is a COMMIT failure, never an
 *  admission verdict — it is reported as such rather than dressed up as a rung. */
export const TIER_D_BELT_REASONS = [
  "fa_belt_unregistered_movement",
  "fa_cost_adjustment_deferred",
  "fa_k_gl_balance_on_enrolled",
  "advance_mirror_unregistered",
  "advance_movement_unregistered",
  "advance_application_missing",
] as const;

function parseDetail(detail: string | undefined): Record<string, unknown> | undefined {
  if (!detail) return undefined;
  try {
    const parsed = JSON.parse(detail) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Post an entry from the attended lane. Reads the books token in the same wake-scoped read, then
 * calls `clara.wake_post_entry` through the write floor under a PLAIN `interactive` credential.
 * Never throws — always resolves to a typed result.
 */
export async function runChatPostJournalEntry(ctx: ToolCtx, input: ChatPostInput, modelId: string): Promise<ChatPostToolResult> {
  const clientId = ctx.clientId;
  if (!clientId) {
    return {
      ok: false,
      tier: "B",
      refusal: {
        type: "refusal",
        code: "CLR03",
        reason: "post_needs_client_session",
        message: "This conversation is not bound to a client, so there is nothing I can post into.",
      },
    };
  }
  const snapshot = chatModelSnapshot(modelId);
  try {
    const booksVersion = await readScoped(ctx, async (c: PgExec) => {
      const row = await c.query("select clara.get_context_pack($1, $2) as pack", [clientId, "coding"]);
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
          message: "I could not read the ledger's freshness token, so I have not posted this entry.",
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
          clientId,
          booksVersion,
          input.rationale,
          JSON.stringify(snapshot),
          chatPostOpKey(ctx.taskId, input.entry_id),
        ],
      );
      return r.rows[0]?.receipt ?? null;
    });

    const result = readChatPostReceipt(receipt);
    if (result.ok) result.posted.client_id = clientId;
    return result;
  } catch (e) {
    // TIER D — a COMMIT-time abort no exception block inside the verb can convert, or an
    // UNLISTED Tier-C pair the verb deliberately re-raises. Either way it is not an admission
    // verdict, and it is reported with its own (errcode, reason) rather than a guessed token.
    const err = e as { code?: string; detail?: string };
    const detail = parseDetail(err.detail);
    const reason = typeof detail?.reason === "string" ? detail.reason : undefined;
    const belt = reason != null && (TIER_D_BELT_REASONS as readonly string[]).includes(reason);
    return {
      ok: false,
      tier: "D",
      refusal: {
        type: "refusal",
        code: String(err.code ?? "internal"),
        reason,
        message: belt
          ? "A deferred ledger belt refused this post when it committed, so nothing was posted."
          : "This post failed at the ledger and nothing was recorded. The draft is untouched.",
      },
    };
  }
}

/**
 * Open a typed, client-scoped open question — the fail-closed half of the contract, and the ONE
 * call path the pinned `interactive_client` kind exists for (R-1).
 *
 * The op key is deterministic over the whole question, so a WDK replay re-presents the same key
 * and `_reserve_op` returns the stored receipt instead of opening a second copy of the same
 * question in a person's queue.
 */
export async function runOpenClientQuestion(ctx: ToolCtx, input: OpenClientQuestionInput): Promise<OpenQuestionToolResult> {
  const clientId = ctx.clientId;
  if (!clientId) {
    return {
      ok: false,
      refusal: {
        type: "refusal",
        code: "CLR03",
        reason: "question_needs_client_pin",
        message: "This conversation is not bound to a client, so I cannot open a client-scoped question.",
      },
    };
  }
  try {
    const opKey = `chat-q:${ctx.taskId}:${input.scope_kind}:${input.scope_id ?? "-"}`;
    const receipt = await questionScoped(ctx, async (c: PgExec) => {
      const r = await c.query("select clara.wake_open_question($1::uuid, $2, $3::uuid, $4, $5) as receipt", [
        clientId,
        input.scope_kind,
        input.scope_id ?? null,
        input.question.slice(0, 2000),
        opKey,
      ]);
      return r.rows[0]?.receipt ?? null;
    });
    const q = (receipt ?? {}) as { question_id?: unknown };
    if (typeof q.question_id !== "string" || !q.question_id) {
      return {
        ok: false,
        refusal: {
          type: "refusal",
          code: "internal",
          reason: "question_receipt_unreadable",
          message: "I could not confirm that the question was recorded, so treat it as not opened.",
        },
      };
    }
    return {
      ok: true,
      question_opened: { type: "question_opened", question_id: q.question_id, scope_kind: input.scope_kind, question: input.question },
    };
  } catch (e) {
    const err = e as { code?: string };
    return {
      ok: false,
      refusal: {
        type: "refusal",
        code: String(err.code ?? "internal"),
        reason: "question_not_opened",
        message: "I could not open a question against this client in this conversation.",
      },
    };
  }
}
