// #642 UI-32 — NO IMPLEMENTATION JARGON IN THE TRANSCRIPT.
//
// THE DEFECT, LIVE AGAIN. `components/parts/PartRenderer.tsx` printed `part.tool`
// verbatim, so a reader watching Clara work saw `start_accrual_work` and
// `_agent_get_bank_pack_core`-flavoured tokens in the place a human sentence belongs.
// UI-32 was fixed once and reopened the moment the tool chip came back.
//
// THE RULE: a HUMAN label per tool through next-intl, with the RAW TOKEN as the fallback
// — never a prettified token (`start accrual work`), which reads like a label while
// still being the implementation's own word, and never a blank chip, which would hide
// the fact that a step happened at all.
//
// THE LIST IS MEASURED, NOT GUESSED. These are the 37 keys of `buildToolsV20(...)`,
// enumerated by CALLING it on this rig (packages/runtime/workflows/chatTurn.v20.tools.ts)
// rather than by reading the files — v20 composes v19 which composes v18, and a
// hand-walked union missed several. `clara-tool-labels.test.ts` is the gate that keeps
// this list and `messages/en.json` from drifting apart.
//
// A TOKEN THAT IS NOT ON THIS LIST IS NOT A DEFECT. A newer frozen body may ship a tool
// this build has never heard of, and the honest thing for an old surface to do is show
// the runtime's own word rather than invent a friendly name for a step it cannot
// describe. That is what the fallback is.

/** Every tool `chatTurn_v20` can call, measured from the live tool map. */
export const CHAT_TOOL_TOKENS = [
  "add_bank_account",
  "assess_report_claim",
  "clarify",
  "complete_bank_reconciliation",
  "compose_metric_preview",
  "draft_journal_entry",
  "draft_report_spec",
  "get_bank_pack",
  "get_context_pack",
  "get_journal_entry",
  "list_journal_entries",
  "list_metric_catalog",
  "list_unassigned_documents",
  "match_bank_line",
  "open_client_question",
  "open_report_run",
  "post_journal_entry",
  "propose_bank_identifier_promotion",
  "propose_bank_line_exception",
  "read_books_freeform",
  "read_document",
  "remember_client_information",
  "request_report_preview",
  "resolve_and_book_bank_line",
  "resolve_bank_line_exception",
  "save_metric_definition_draft",
  "seal_report_dataset",
  "settle_from_bank_line",
  "start_accrual_work",
  "start_journal_work",
  "start_periodic_adjustment_work",
  "start_staff_expense_claim_work",
  "trial_balance",
  "unmatch_bank_match",
  "upsert_bank_coa_account",
  "void_bank_reconciliation",
  "void_bank_statement",
] as const;

export type ChatToolToken = (typeof CHAT_TOOL_TOKENS)[number];

const KNOWN = new Set<string>(CHAT_TOOL_TOKENS);

/** A CHECKED lookup, the house discipline for a template message key: the union that
 *  reaches `t(\`tools.${token}\`)` is closed, so the key it builds provably exists. */
export function isChatToolToken(token: string): token is ChatToolToken {
  return KNOWN.has(token);
}

/**
 * The human label for a runtime tool token, or the token itself when this build has no
 * label for it.
 *
 * `translate` is the caller's own scoped `t` — passed in rather than bound here, because
 * a helper that took a `useTranslations` binding of its own would need a hook and could
 * not be called from a `.map`.
 */
export function chatToolLabel(token: string, translate: (key: string) => string): string {
  return isChatToolToken(token) ? translate(`tools.${token}`) : token;
}
