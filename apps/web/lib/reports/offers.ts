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
  /** The door's own refusal, when the OFFER call itself was refused (below the read floor, a
   *  client outside the firm). Rendered verbatim by the caller. */
  err: string | null;
  loaded: boolean;
};

export function useDownloadOffers(clientId: string, session: SessionTokenAccessor): DownloadOffers {
  const { data, err } = useHydratedPart(session, (s) => listDownloadableArtifacts(clientId, 200, { session: s }));
  const byId = useMemo(() => {
    const map = new Map<string, DownloadableArtifact>();
    for (const row of data ?? []) map.set(row.artifact_id, row);
    return map;
  }, [data]);
  return {
    offerFor: (artifactId: string) => byId.get(artifactId) ?? null,
    err,
    loaded: data != null,
  };
}
