"use client";

// THE GOVERNED-KNOWLEDGE RECEIPT CARD (#644, minted by chatTurn_v19).
//
// It renders the wire and stops, exactly as the four chatTurn_v14 receipt cards and the three
// durable-Work cards do (./V14ReceiptCards.tsx's header carries the full argument). What a reader
// needs from a chat card is the IDENTITY of what happened plus a route to where it lives — and
// for a knowledge record that route is `/clients/:clientId/knowledge/:recordId`, the C13 detail
// page, which reads the value, the trust, the basis, the applicability and the whole revision
// history live under the caller's own RLS.
//
// WHY NO VALUE IS PRINTED HERE, and this is the one decision worth stating plainly: a knowledge
// record is CORRECTABLE and WITHDRAWABLE by design (0192's whole point), and a conversation stays
// on screen forever while a record does not stay current. A card that printed "trade_nature =
// services" would go on saying so after somebody corrected it to "mixed", inside a transcript a
// professional might later read as evidence of what Clara was told. The key, the version and the
// act are stable facts about the CAPTURE; the value is a fact about the RECORD, and the record has
// its own page.
//
// §5's ANNOUNCEMENT BOUNDARY: not a live region. The transcript already has one announcement owner
// (ClaraThreadView's own log); a card that announced itself would say the same result twice.
//
// EVERY LINK IS A REAL IN-APP PATH OR IT IS NOT RENDERED. The runtime knowledge lane is
// client-scoped by construction (0192 refuses a client-less capture, `knowledge_scope_invalid`),
// so a blank `client_id` should not occur — but a card that built `/clients//knowledge/…` from one
// would be a 404 dressed as an affordance, so the link drops and the card still renders.

import { useTranslations } from "next-intl";

import { knowledgeRecordHref } from "@/lib/navigation/tree";
import type { KnowledgeReceiptPart } from "@/lib/parts/types";

import { PartSummaryCard } from "./PartSummaryCard";
import { usableId } from "./PartCardShell";

/** The two acts 0192 admits through this lane. Anything else the database might one day return
 *  renders VERBATIM rather than through a missing `t()` key — the checked-lookup discipline
 *  `work_status` already follows for a status this build does not know. */
const KNOWN_REVISION_KINDS = new Set(["capture", "correction"]);

export function KnowledgeReceiptCard({ part }: { part: KnowledgeReceiptPart }) {
  const t = useTranslations("Clara.parts.knowledgeReceipt");
  const addressable = usableId(part.record_id) && usableId(part.client_id);
  const act = KNOWN_REVISION_KINDS.has(part.revision_kind)
    ? t(part.revision_kind === "correction" ? "actCorrection" : "actCapture")
    : part.revision_kind;
  return (
    <PartSummaryCard
      title={t("title")}
      rows={[
        [t("keyLabel"), part.knowledge_key],
        [t("actLabel"), act],
        [t("versionLabel"), part.knowledge_version],
      ]}
      note={t("note")}
      link={addressable ? { href: knowledgeRecordHref(part.client_id, part.record_id), label: t("link") } : null}
    />
  );
}
