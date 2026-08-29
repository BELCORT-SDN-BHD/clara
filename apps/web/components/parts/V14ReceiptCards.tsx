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
// receipt, or link". `verdict`, `result` and `pack` are open `Record<string, unknown>`
// shapes; none is walked here, because a value of unknown shape has no honest
// rendering (`[object Object]` is not one).

import { useTranslations } from "next-intl";

import type { BankActPart, BankPackPart, EntryPostedPart, QuestionOpenedPart } from "../../lib/parts/types";
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
  return (
    <PartSummaryCard
      title={t("title")}
      rows={[
        [t("verbLabel"), part.verb],
        [t("subjectLabel"), part.subject_id],
        [t("opKeyLabel"), part.op_key],
      ]}
      note={t("note")}
    />
  );
}

/** A get_bank_pack READ. The digest is the point: every bank act must cite the pack
 *  it was grounded in, so showing the digest beside the act is what makes the pair
 *  auditable in the transcript. */
export function BankPackCard({ part }: { part: BankPackPart }) {
  const t = useTranslations("Clara.parts.bankPack");
  return (
    <PartSummaryCard
      title={t("title")}
      rows={[
        [t("accountLabel"), part.bank_account_id],
        [t("digestLabel"), part.digest],
      ]}
      note={t("note")}
    />
  );
}
