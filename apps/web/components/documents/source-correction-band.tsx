"use client";

// #646 — THE CORRECTION BAND: TWO SEPARATE SENTENCES, ON EVERY VIEW (AC4, AC6).
//
// AC4's exact words: "Show source revision accepted and accounting impact pending separately; no
// fabricated completed books or in-place rewrite." Those are TWO facts with two different owners,
// and collapsing them into one "corrected" badge is precisely the fabrication the criterion
// forbids — the source revision really is accepted and recorded, and the posted result really has
// not been touched.
//
//   * "Source revision accepted" is THIS ticket's own outcome, read back from
//     `clara.list_source_revisions`. It is a PERSISTENT result, not a toast: appendix C §3's
//     success row — "update the persistent object/Work state first".
//   * "Accounting impact pending" is #676's, named with its link. #676's own AC6 is verbatim
//     "Consume accepted source-change/correction Work, then atomically apply complete posted-result
//     changes", and #676 is blocked by this ticket. Nothing here reverses, replaces or re-posts
//     anything, so saying so out loud is the honest state rather than a gap.
//
// THE TRANSFERRED-AWAY SENTENCE. When a wrong-client correction moved this document off the client
// being read, the original client must not watch it silently disappear. The sentence is rendered
// from `list_source_revisions`' own lineage — MEASURED, not assumed: `clara.get_document_state`
// answers NULL for a client with no live filing (its admission requires one, and that
// no-existence-oracle property is deliberate and unchanged by this ticket), so the wave brief's
// suggestion to source this from `get_document_state`'s `filings[]`/`corrections[]` does not hold.
// `list_source_revisions` is FIRM-scoped and carries both, which is why it is the door that
// answers here. Recorded as brief drift in the ticket's report.
//
// THE BAND RENDERS ON EVERY TAB, and that is why it lives above the tab strip rather than inside a
// panel: a person who switched to Accounting to look for the impact must not have to switch back
// to learn that a revision was accepted.

import { useTranslations } from "next-intl";
import Link from "next/link";
import { businessDateTime } from "@/lib/business-date";
import { DoorFeedback } from "./door-feedback";
import type { SourceLineageEntry, SourceRevisionsResult } from "@/lib/documents/types";

const CORRECTION_WORK_ISSUE = "https://github.com/BELCORT-SDN-BHD/clara/issues/676";

/** The correction that moved this document OFF `clientId`, if one did. Read from the lineage's own
 *  `retired_filings`, which the DB attaches to the correction that retired them — never inferred
 *  from "there is a correction and the client is not the destination", which would be true of a
 *  correction that was proposed and never approved. */
export function transferredAway(
  lineage: readonly SourceLineageEntry[], clientId: string,
): { correctionId: string; at: string | null; toClient: string | null } | null {
  for (const entry of lineage) {
    if (entry.entry_kind !== "wrong_client_correction") continue;
    const retired = (entry.retired_filings ?? []).find((f) => f.client_id === clientId);
    if (!retired) continue;
    return {
      correctionId: entry.correction_id ?? "",
      at: retired.retired_at ?? entry.completed_at ?? entry.approved_at ?? null,
      toClient: entry.to_client ?? null,
    };
  }
  return null;
}

export function SourceCorrectionBand({
  revisions, clientId, clientName,
}: {
  /** `null` while the read is in flight or when it answered nothing this caller may see. The band
   *  then renders NOTHING rather than a reassuring empty state — an absent read is not a document
   *  with no history. */
  revisions: SourceRevisionsResult | null;
  clientId: string;
  /** The destination client's display name, when the caller can resolve it. The raw id is the
   *  honest fallback; an invented name would be worse than an ugly one. */
  clientName?: (id: string) => string;
}) {
  const t = useTranslations("ClientDocuments");
  // NEVER TRUSTED TO BE PRESENT. `callDoor` hands back whatever the RPC answered, and a door that
  // answered SQL NULL, an older shape, or nothing at all must render as "no history to show" rather
  // than crash the panel it sits in.
  if (!revisions || !Array.isArray(revisions.lineage)) return null;

  const sourceRevisions = revisions.lineage.filter(
    (e) => e.entry_kind === "fact" || e.entry_kind === "kind");
  const moved = transferredAway(revisions.lineage, clientId);
  if (sourceRevisions.length === 0 && moved === null) return null;

  const latest = sourceRevisions[sourceRevisions.length - 1];

  return (
    <div className="flex flex-col gap-2" data-testid="source-correction-band">
      {sourceRevisions.length > 0 ? (
        <>
          <DoorFeedback
            tone="info"
            clr={null}
            title={t("bandRevisionAcceptedHeading")}
            err={t("bandRevisionAcceptedBody", {
              count: sourceRevisions.length,
              version: revisions.facts_version,
              at: latest?.at ? businessDateTime(latest.at) : t("bandUnknownDate"),
            })}
          />
          {/* SEPARATELY, and by name. The link is the whole point: a pending impact that cannot be
              followed anywhere is indistinguishable from a forgotten one. */}
          <DoorFeedback
            tone="warning"
            clr={null}
            title={t("bandImpactPendingHeading")}
            err={t("bandImpactPendingBody")}
            action={
              <Link
                href={CORRECTION_WORK_ISSUE}
                className="text-sm underline underline-offset-2"
                data-testid="band-impact-link"
              >
                {t("bandImpactPendingLink")}
              </Link>
            }
          />
        </>
      ) : null}
      {moved ? (
        <DoorFeedback
          tone="neutral"
          clr={null}
          title={t("bandTransferredHeading")}
          err={t("bandTransferredBody", {
            date: moved.at ? businessDateTime(moved.at) : t("bandUnknownDate"),
            correction: moved.correctionId,
            client: moved.toClient
              ? (clientName?.(moved.toClient) ?? moved.toClient)
              : t("bandTransferredUnknownClient"),
          })}
        />
      ) : null}
    </div>
  );
}
