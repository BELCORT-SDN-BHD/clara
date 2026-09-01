"use client";

// Firm-level questions (clara.firm_open_questions_visible) and client-
// identifier promotion proposals (clara.client_identifier_promotions_visible)
// — the two human read/act surfaces migration 0137 added (verb-coverage
// census, 2026-08-28; lib/firm/needs-you-gaps.ts carries the full grounding
// and was previously the honest "not built" note this component used to
// render verbatim). Two independent lists, two independent hydrate-never-
// trust loops: acting on a question never touches the promotions list and
// vice versa.

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useAsyncRead } from "@/lib/firm/use-async-read";
import {
  loadFirmOpenQuestions,
  resolveFirmQuestion,
  dismissFirmQuestion,
  loadIdentifierPromotions,
  confirmIdentifierPromotion,
  declineIdentifierPromotion,
  shouldShowGapErrorBanner,
} from "@/lib/firm/needs-you-gaps";
import { loadClientRegister } from "@/lib/firm/reads";
import { sessionTokenAccessor } from "@/lib/session-accessor";
import { SectionHeader } from "@/components/common/section-header";
import { NotBuiltNote } from "@/components/common/not-built-note";
import { DataState, ErrorMessage } from "./data-state";
import { FirmQuestionRow } from "./firm-question-row";
import { IdentifierPromotionRow } from "./identifier-promotion-row";

export function NeedsYouGaps() {
  const t = useTranslations("NeedsYou");
  const clients = useAsyncRead(() => loadClientRegister(sessionTokenAccessor));
  const questions = useAsyncRead(() => loadFirmOpenQuestions(sessionTokenAccessor));
  const promotions = useAsyncRead(() => loadIdentifierPromotions(sessionTokenAccessor));
  const [actingQuestion, setActingQuestion] = useState<string | null>(null);
  const [actingPromotion, setActingPromotion] = useState<string | null>(null);

  const questionRows = questions.data ?? [];
  const promotionRows = promotions.data ?? [];

  const handleResolve = (id: string, resolution: string, clientId: string | null): Promise<boolean> => {
    setActingQuestion(id);
    return questions.act(() => resolveFirmQuestion(
      sessionTokenAccessor,
      id,
      resolution,
      clientId,
      crypto.randomUUID(),
    ).then(() => undefined));
  };
  const handleDismiss = (id: string, reason: string): Promise<boolean> => {
    setActingQuestion(id);
    return questions.act(() => dismissFirmQuestion(
      sessionTokenAccessor,
      id,
      reason,
      crypto.randomUUID(),
    ).then(() => undefined));
  };
  const handleConfirm = (id: string): Promise<boolean> => {
    setActingPromotion(id);
    return promotions.act(() => confirmIdentifierPromotion(sessionTokenAccessor, id).then(() => undefined));
  };
  const handleDecline = (id: string, reason: string): Promise<boolean> => {
    setActingPromotion(id);
    return promotions.act(() => declineIdentifierPromotion(sessionTokenAccessor, id, reason).then(() => undefined));
  };

  const showQuestionsBanner = shouldShowGapErrorBanner(questions.data !== null, questions.error, questionRows, actingQuestion);
  const showPromotionsBanner = shouldShowGapErrorBanner(promotions.data !== null, promotions.error, promotionRows, actingPromotion);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <SectionHeader level={2}>{t("firmQuestionsHeading")}</SectionHeader>
        {showQuestionsBanner ? <ErrorMessage error={questions.error} /> : null}
        <DataState
          loading={questions.loading}
          error={questions.data === null ? questions.error : null}
          isEmpty={questionRows.length === 0}
          emptyMessage={t("firmQuestionsEmpty")}
        >
          <ul className="flex flex-col gap-2">
            {questionRows.map((row) => (
              <FirmQuestionRow
                key={row.id}
                row={row}
                busy={questions.busy}
                error={actingQuestion === row.id ? questions.error : null}
                clients={clients.data ?? []}
                clientsUnavailable={clients.data === null && clients.error !== null}
                onResolve={handleResolve}
                onDismiss={handleDismiss}
              />
            ))}
          </ul>
        </DataState>
      </div>
      <div className="flex flex-col gap-2">
        <SectionHeader level={2}>{t("identifierPromotionsHeading")}</SectionHeader>
        {showPromotionsBanner ? <ErrorMessage error={promotions.error} /> : null}
        <DataState
          loading={promotions.loading}
          error={promotions.data === null ? promotions.error : null}
          isEmpty={promotionRows.length === 0}
          emptyMessage={t("identifierPromotionsEmpty")}
        >
          <ul className="flex flex-col gap-2">
            {promotionRows.map((row) => (
              <IdentifierPromotionRow
                key={row.id}
                row={row}
                busy={promotions.busy}
                error={actingPromotion === row.id ? promotions.error : null}
                onConfirm={handleConfirm}
                onDecline={handleDecline}
              />
            ))}
          </ul>
        </DataState>
        {/* FS-0 residual (2026-08-31 census): add_client_alias/
            retire_client_alias are LIVE doors (0007/0016) with no UI —
            distinct from the promotion list above, which only shows
            aliases Clara proposes promoting. Named beside it so a reader
            sees both the automated and the by-hand path in one place. */}
        <NotBuiltNote>{t("clientAliasNotBuilt")}</NotBuiltNote>
        {/* P6-T (FS-8, 裁-80) — moved here from the top of NeedsYouInbox
            (independent review, PR #487, N4/orchestrator ruling): a
            not-built note must never outrank the user's actual work on the
            flagship inbox, so it lives at the bottom, beside this file's
            other honest notes, not above the live queue. clara.
            statutory_deadlines has been live-empty since migration 0139
            (no grant, no verb); F-T2's feed lands here once built — not a
            new row_kind, not a new page. */}
        <NotBuiltNote>{t("statutoryDeadlinesNotBuilt")}</NotBuiltNote>
      </div>
    </div>
  );
}
