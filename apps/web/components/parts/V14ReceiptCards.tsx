"use client";

// The four chatTurn_v14 receipt cards (MBB-4, docs/plan/active/
// mohe-alignment-audit-2026-08-29.md §2). Split out of PartRenderer.tsx the way
// PartSummaryCard.tsx was, so each stays independently reviewable and
// PartRenderer's reviewed body grows by four delegating branches, not by four
// inline card bodies.
//
// WHAT THESE ARE. The LIVE registry is `chatTurn: chatTurn_v14`
// (packages/runtime/workflows/registry.ts:54). Its wire union adds four kinds
// (chatTurn.v14.prompt.ts:27) that neither frontend declared until this change, so
// every agent bank act and every chat-posted entry rendered as PartRenderer's
// "Unsupported part" warning chip. The fail-closed fallback was doing its job; what
// was missing is the receipt.
//
// WHAT THEY DELIBERATELY DO NOT DO. Hydrate-never-trust (contract §3.2) says a card
// re-derives authoritative state from a pinned DB read on mount. There is no read fn
// keyed on a post receipt, an op_key or a pack digest, so these four render EXACTLY
// what the wire carries — identifiers plus the DB's own verdict tokens — and link to
// the workbench that does hold the live read. No amount, no line count, no status
// this module inferred: apps/web/AGENTS.md, "the UI never invents a number, verb,
// receipt, or link".
//
// C6 — `result` AND `pack` ARE NOW READ, AND THE OLD RULE IS NARROWED RATHER THAN
// DROPPED. This header used to say none of the three open records is walked "because a
// value of unknown shape has no honest rendering (`[object Object]` is not one)". That
// remains true of `verdict`. It is NOT true of the other two once you read the
// producer, and the census behind this train measured what they actually carry:
//
//   `pack`  IS a VERSIONED DB CONTRACT. `clara._agent_get_bank_pack_core`
//           (0121_f_a3_pr1b_agent_limb.sql) builds it as
//           `jsonb_build_object('schema','clara.bank-pack/v1', …, 'budget',
//           jsonb_build_object('lines', jsonb_array_length(v_lines), 'candidates',
//           jsonb_array_length(v_cands), 'truncated', false))`. Those two counts are
//           computed BY POSTGRES over the rows it just selected — typed DB numerals,
//           printed as handed over, exactly what V16Cards.tsx's rule 1 asks for. The
//           `schema` token is the DB's own declaration of that shape and this card
//           fails closed on anything else.
//   `result` is the delegate core's own return, passed through verbatim by
//           `classifyBankResult` (chatTurn.v14.bank.ts) — DB-authored, never
//           model-authored (a `tool-result` is produced by OUR tool function; the model
//           only authors the `tool-call` input). But it is UNVERSIONED and differs per
//           verb (`{match_id, …}`, `{reconciliation_id, …}`, …), so this card renders
//           only its STRING and BOOLEAN leaves, keyed by the DB's own field names, and
//           renders NO numeral out of it at all. That is strictly stronger than rule 1:
//           where the shape is unversioned, no number reaches the screen by
//           construction, so no future payload can smuggle one past this card.
//
// Nested objects and arrays are still never walked, in either — `[object Object]` is
// still not a rendering.

import { Fragment } from "react";
import { useTranslations } from "next-intl";

import type { BankActPart, BankPackPart, EntryPostedPart, QuestionOpenedPart } from "../../lib/parts/types";
import { bankPackBudget, ledgerTextFields } from "../../lib/parts/bankPayload";
import { Badge } from "./PartBadge";
import { PartSummaryCard } from "./PartSummaryCard";

/** The posted-entry receipt. Links to the client's journals workbench — the surface
 *  that reads the entry's lines and total live from the DB.
 *
 *  THE LINK IS CONDITIONAL ON A REAL client_id. The emitter constructs this part
 *  with `client_id: ""` (chatTurn.v13.post.ts:223) and fills it at :333; anything
 *  that reached the wire un-filled would build `/clients//journals`, a 404 dressed
 *  as an affordance. No client, no link — never a broken one. */
export function EntryPostedCard({ part }: { part: EntryPostedPart }) {
  const t = useTranslations("Clara.parts.entryPosted");
  const rungs = Object.entries(part.rung_vector);
  return (
    <PartSummaryCard
      title={t("title")}
      rows={[
        [t("entryLabel"), part.entry_id],
        [t("clientLabel"), part.client_id],
        [t("receiptLabel"), part.post_receipt_id],
      ]}
      note={t("note")}
      link={part.client_id ? { href: `/clients/${encodeURIComponent(part.client_id)}/journals`, label: t("link") } : null}
    >
      {rungs.length > 0 ? (
        <div className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">{t("rungVectorLabel")}</span>
          <ul className="flex flex-wrap gap-1">
            {rungs.map(([rung, outcome]) => (
              <li key={rung}>
                <Badge tone="neutral">
                  {rung}: {outcome}
                </Badge>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </PartSummaryCard>
  );
}

/** The opened-question receipt. The question text is the DB's own bytes, rendered
 *  verbatim and never re-worded. The part carries no client_id (chatTurn.v13.post.ts:111-116),
 *  so the only honest destination is the firm's Needs-you queue, where the durable
 *  question actually lands. */
export function QuestionOpenedCard({ part }: { part: QuestionOpenedPart }) {
  const t = useTranslations("Clara.parts.questionOpened");
  return (
    <PartSummaryCard
      title={t("title")}
      rows={[
        [t("questionLabel"), part.question_id],
        [t("scopeLabel"), part.scope_kind],
      ]}
      link={{ href: "/needs-you", label: t("link") }}
    >
      <p className="text-card-foreground">{part.question}</p>
    </PartSummaryCard>
  );
}

/** One admitted bank act. `verb` is the door's own name, rendered verbatim — the
 *  card never re-labels a governed verb into friendlier prose, because the verb IS
 *  the receipt's claim about what happened. `subject_id` is nullable on the wire and
 *  simply drops out of the card when absent (PartSummaryCard filters empty rows). */
export function BankActCard({ part }: { part: BankActPart }) {
  const t = useTranslations("Clara.parts.bankAct");
  const fields = ledgerTextFields(part.result);
  return (
    <PartSummaryCard
      title={t("title")}
      rows={[
        [t("verbLabel"), part.verb],
        [t("subjectLabel"), part.subject_id],
        [t("opKeyLabel"), part.op_key],
      ]}
      note={t("note")}
    >
      {fields.length > 0 ? (
        <div className="flex flex-col gap-1">
          <span className="text-xs text-muted-foreground">{t("resultLabel")}</span>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
            {fields.map(([key, value]) => (
              <Fragment key={key}>
                {/* The KEY is the ledger's own field name and the VALUE is the ledger's
                    own token — both verbatim, neither translated. Re-wording either
                    would be re-wording a receipt (the same rule PartRenderer states for
                    `provenance_tier`). */}
                <dt className="text-muted-foreground">{key}</dt>
                <dd className="truncate text-card-foreground">{value}</dd>
              </Fragment>
            ))}
          </dl>
        </div>
      ) : null}
    </PartSummaryCard>
  );
}

/** A get_bank_pack READ. The digest is the point: every bank act must cite the pack
 *  it was grounded in, so showing the digest beside the act is what makes the pair
 *  auditable in the transcript. */
export function BankPackCard({ part }: { part: BankPackPart }) {
  const t = useTranslations("Clara.parts.bankPack");
  const budget = bankPackBudget(part.pack);
  return (
    <PartSummaryCard
      title={t("title")}
      rows={[
        [t("accountLabel"), part.bank_account_id],
        [t("digestLabel"), part.digest],
      ]}
      note={t("note")}
    >
      {budget ? (
        <div className="flex flex-col gap-1">
          {/* Postgres counted these, in the same statement that built the pack this
              digest hashes — `jsonb_array_length(v_lines)` and
              `jsonb_array_length(v_cands)` (0121). They are printed, never combined,
              never totalled, and never counted again on this side. */}
          <span className="text-xs text-muted-foreground">{t("budgetLabel")}</span>
          <ul className="flex flex-wrap gap-1">
            <li><Badge tone="neutral">{t("linesCount", { count: budget.lines })}</Badge></li>
            <li><Badge tone="neutral">{t("candidatesCount", { count: budget.candidates })}</Badge></li>
          </ul>
          {/* TRUNCATED IS A WARNING, not a footnote: it means the pack the act was
              grounded in did not carry everything, and a human deciding on it has to
              know. It renders only when the DB said `true` — an absent or non-boolean
              value is not evidence of completeness either, so nothing is claimed. */}
          {budget.truncated === true ? (
            // A Badge, not a `text-warning` paragraph and not a StateBanner. Bare
            // `text-warning` on `bg-card` is a token pair the contrast gate does not
            // declare, and StateBanner carries `role="alert"` — which inside
            // ClaraThreadView's `role="log" aria-live="polite"` transcript is the
            // nested-live-region defect DS-04 exists to keep out. The warning Badge is
            // `text-warning on bg-warning-muted`, a pair the gate already measures at
            // 6.37:1, and it announces nothing of its own.
            <Badge tone="warning">{t("truncated")}</Badge>
          ) : null}
        </div>
      ) : null}
    </PartSummaryCard>
  );
}
