"use client";

// THE DOWNLOAD OFFER, as one hook both Reports panels share (FS-7 echelon 2, 裁-96②).
//
// WHY A HOOK AND NOT A PROP DRILLED FROM THE PAGE. The two panels are independent readers of two
// different relations and neither owns the other; threading one read through `ReportsPage` would
// couple them for no gain. Each calls this, each gets the same door's answer for the same client.
//
// AN ABSENT ROW IS `null`, NOT `false`. The distinction is the whole point of the return shape: a
// caller that cannot tell "the offer has not loaded" from "the door said no" will render a refusal
// message during the first paint of every row. `offerFor` returns `null` until the read lands, and
// `DownloadArtifactButton` renders nothing for a `null`.

import { useMemo } from "react";
import { useHydratedPart } from "@/lib/parts/hooks";
import { listDownloadableArtifacts } from "./api";
import type { DownloadableArtifact } from "./types";
import type { SessionTokenAccessor } from "@/lib/session";

export type DownloadOffers = {
  /** The door's row for one artifact id, or `null` while the read is still in flight OR when the
   *  door returned no row for it at all (an artifact outside this client's offer). */
  offerFor: (artifactId: string) => DownloadableArtifact | null;
  /**
   * The door's own refusal, when the OFFER call ITSELF was refused — a caller below the read floor,
   * or a client outside the firm.
   *
   * BOTH PANELS RENDER IT, and that is not decoration. The artifact LIST is not a door: it is a
   * direct RLS read whose human policy on `clara.report_artifacts` is firm-scoped with NO role rank,
   * while `clara.list_downloadable_artifacts` floors at bookkeeper. So a firm VIEWER reads the rows,
   * the panel draws them, and every Download control is correctly withheld — leaving a tab full of
   * artifacts, no control anywhere, and no reason. That silent state is exactly what the door was
   * shaped to prevent: D8.4's own comment says the door REFUSES rather than returning `[]` because
   * an empty list "would read to a UI as 'nothing to download'". The refusal then has to be shown.
   */
  err: string | null;
};

export function useDownloadOffers(clientId: string, session: SessionTokenAccessor): DownloadOffers {
  const { data, err } = useHydratedPart(session, (s) => listDownloadableArtifacts(clientId, 200, { session: s }));
  const byId = useMemo(() => {
    const map = new Map<string, DownloadableArtifact>();
    for (const row of data ?? []) map.set(row.artifact_id, row);
    return map;
  }, [data]);
  // `loaded` was here and no caller read it. `offerFor` already answers the only question a caller
  // asks — a null is "no offer for this row, yet or ever" and the control renders nothing for it —
  // so a second, unread way to say the same thing was a field to keep in sync for nobody.
  return { offerFor: (artifactId: string) => byId.get(artifactId) ?? null, err };
}
