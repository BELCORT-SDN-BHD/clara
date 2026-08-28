// Combined loaders for the coding-lane workbench (documents/loaders.ts's own
// pattern: pure orchestration over reads.ts's single-relation reads — this
// file adds no door calls of its own).

import { listCodingLanes, listUncodedFilings } from "./reads";
import type { CodingLane, UncodedFilingRow } from "./types";
import type { SessionTokenAccessor } from "@/lib/session";

export type UncodedFilingEntry = UncodedFilingRow & { lane: CodingLane; reasons: string[] };

type Opts = { session?: SessionTokenAccessor; signal?: AbortSignal };

/** Every uncoded filing for this client, each annotated with its OWN live
 *  `_coding_lane_core` classification. `list_coding_lanes` covers every
 *  ACTIVE filing (coded and uncoded); this loader keeps only the filing_ids
 *  `list_uncoded_filings` itself named — a client-side FILTER over two honest
 *  reads (never a re-derivation of either read's own predicate). A filing
 *  `list_uncoded_filings` returns but `list_coding_lanes` does not (should
 *  not happen — both read the same active-filing population — but never
 *  silently assumed) renders with `lane: "needs_review"`/no reasons rather
 *  than being dropped: an honestly-unclassified row, not a missing one. */
export async function loadUncodedFilingsWithLanes(clientId: string, opts: Opts = {}): Promise<UncodedFilingEntry[]> {
  const [filings, lanes] = await Promise.all([
    listUncodedFilings(clientId, opts),
    listCodingLanes(clientId, opts),
  ]);
  const laneByFiling = new Map(lanes.map((l) => [l.filing_id, l]));
  return filings.map((f) => {
    const l = laneByFiling.get(f.filing_id);
    return { ...f, lane: l?.lane ?? "needs_review", reasons: l?.reasons ?? [] };
  });
}
