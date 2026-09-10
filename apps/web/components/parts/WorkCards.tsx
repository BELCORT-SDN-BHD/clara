"use client";

// B6 — THE THREE DURABLE-WORK CARDS. The receipt a conversation leaves behind
// when Clara admits an accounting operation, the run's own progress note, and
// the committed effect.
//
// THEY RENDER THE WIRE AND STOP, exactly as the four chatTurn_v14 receipt cards
// do (./V14ReceiptCards.tsx's header for the full argument), and the reason is
// the same one stated positively: what a reader needs from a chat card is the
// IDENTITY of the thing that happened plus a route to where it lives. The Work's
// status, its basis, its receipt and its posted lines are all read LIVE on the
// Work detail page, under the caller's own RLS. Hydrating them here would put a
// second, slower copy of that page inside a transcript — and a copy that goes
// stale the moment the run settles, because a conversation stays on screen
// forever while a Work does not stay queued.
//
// §5's ANNOUNCEMENT BOUNDARY IS WHY NONE OF THESE IS A LIVE REGION. The
// transcript already has one announcement owner (ClaraThreadView's own log);
// a card that also announced itself would say the same result twice. These are
// static content inside that region.
//
// EVERY LINK IS A REAL IN-APP PATH OR IT IS NOT RENDERED. `work_accepted` and
// `work_result` carry a client id and can build one; `work_status` does not
// carry one at all (see ../../lib/parts/types.ts), so it offers none rather than
// inventing a route from a value the wire does not have.

import { useTranslations } from "next-intl";

import { Badge } from "./PartBadge";
import { PartSummaryCard } from "./PartSummaryCard";
import { usableId } from "./PartCardShell";
import { workDetailHref } from "@/lib/navigation/tree";
import type { WorkAcceptedPart, WorkResultPart, WorkStatusPart } from "@/lib/parts/types";

/** The accepted-Work receipt. Links to the durable detail — the persistent
 *  outcome §3 requires an accepted long operation to have. */
export function WorkAcceptedCard({ part }: { part: WorkAcceptedPart }) {
  const t = useTranslations("Clara.parts.workAccepted");
  const addressable = usableId(part.work_id) && usableId(part.client_id);
  return (
    <PartSummaryCard
      title={t("title")}
      rows={[
        [t("purposeLabel"), part.purpose],
        [t("workLabel"), part.work_id],
        [t("operationLabel"), part.logical_op_id],
      ]}
      note={t("note")}
      link={addressable ? { href: workDetailHref(part.client_id, part.work_id), label: t("link") } : null}
    />
  );
}

/** The compact status line. NOT a card: it is one observed word about a run that
 *  is still going, and wrapping it in a titled panel would give a progress note
 *  the same visual weight as a receipt. Named for a screen reader, so "running"
 *  is never announced as a bare adjective with no subject. */
export function WorkStatusLine({ part }: { part: WorkStatusPart }) {
  const t = useTranslations("Clara.parts.workStatus");
  return (
    // `text-secondary-ink`, NOT `text-muted-foreground`, and the reason is a
    // MEASUREMENT rather than a preference. This line is the only part on these
    // three cards that sits directly on the assistant bubble's `bg-clara-muted`
    // rather than on a `bg-card` panel, and axe measured `muted-foreground`
    // (#687171) on that ground at 4.49:1 — short of the 4.5:1 AA floor, caught
    // by this ticket's browser walk. `InterviewRunCard.tsx` records the same
    // defect and the same remedy: `secondary-ink` (#4b5353) is an existing
    // catalogued secondary-prose token, strictly darker on every channel, and
    // clears clara-muted at 7.08:1. The token-contrast gate does not carry a
    // `muted-foreground-on-clara-muted` pair because the product must simply not
    // use that pairing; the pair that IS catalogued is this one.
    <p className="flex flex-wrap items-center gap-2 text-xs text-secondary-ink">
      <span>{t("label")}</span>
      {/* The DB's own status word, verbatim — never translated, because it is a
          value the database owns rather than this app's copy. The label beside
          it is this app's words, which is what makes the pair readable. */}
      <Badge tone="info">{part.status}</Badge>
      <span className="wrap-anywhere">{t("workLabel", { work: part.work_id })}</span>
    </p>
  );
}

/** The committed effect: one entry, one receipt. Links to the journals
 *  workbench, which holds the live read of that entry's lines and total — the
 *  same destination `EntryPostedCard` uses, and for the same reason. */
export function WorkResultCard({ part }: { part: WorkResultPart }) {
  const t = useTranslations("Clara.parts.workResult");
  const addressable = usableId(part.client_id);
  return (
    <PartSummaryCard
      title={t("title")}
      rows={[
        [t("entryLabel"), part.entry_id],
        [t("receiptLabel"), part.receipt_id],
        [t("workLabel"), part.work_id],
      ]}
      note={t("note")}
      link={
        addressable
          ? { href: `/clients/${encodeURIComponent(part.client_id)}/journals`, label: t("link") }
          : null
      }
    />
  );
}
