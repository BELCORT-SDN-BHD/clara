"use client";

// #933 — CLARA'S PROPOSAL, SEEDED ONTO A PARTICULARS FORM: the one open/seed/clear cycle the two
// register-side answering entrances share.
//
// WHY IT IS A HOOK AND NOT A SECOND COPY. The asset page dialog
// (`./fa-row-actions.tsx`'s `CompleteParticularsDialog`) and the Needs-you inline form
// (`../firm/fixed-asset-incomplete-affordance.tsx`) are different components with different open
// boundaries — a `FaDoorDialog`'s `onOpen`/`onClosed` on one side, a plain button's own
// `open` state on the other — but the PROPOSAL half of both was the same twenty lines, including
// the guard below, which is the kind of invariant that drifts once it is written twice
// (standards review STD-1, 2026-09-24). The conversation entrance is deliberately NOT a caller:
// it is handed the whole question record and reads the block straight off `source_ref`, with no
// read of its own to seed from.
//
// THE THREE RULES THIS HOOK OWNS, and they are the whole of it:
//
//   1. READ ON OPEN, NEVER ON MOUNT. Reading on mount would ask the database for a proposal about
//      a form nobody has opened — once per row of the register.
//   2. SEED ONLY AN UNTOUCHED FORM. The read resolves a tick after the open; a person who started
//      typing while it was in flight keeps what they typed. A suggestion that arrives late is
//      still only a suggestion.
//   3. CLOSING CLEARS IT. The close is the decision boundary (#978 made it so for the operation
//      key), so the next open is a fresh read and a fresh seed — never a stale proposal from a
//      previous visit.
//
// IT NEVER THROWS AND NEVER BLOCKS. `loadAssetParticularsProposal` answers `null` for a failed
// read, a client with nothing parked and a question carrying no block alike, and this hook then
// leaves the form exactly as it was: today's empty form, which is what every one of these
// entrances did before #933.

import { useState } from "react";
import type { Dispatch, SetStateAction } from "react";

import { sessionTokenAccessor } from "@/lib/session-accessor";
import {
  loadAssetParticularsProposal, particularsFromProposal,
} from "@/lib/registers/fa-particulars-proposal";
import type { FaParticularsProposal } from "@/lib/registers/fa-particulars-proposal";
import type { FaParticularsInput } from "@/lib/registers/fixed-assets";
import { EMPTY_PARTICULARS } from "./fa-particulars-fields";

export type FaParticularsProposalSeed = {
  /** The block to render beside the fields (`<FaProposalNote />`), or `null` for none. */
  proposal: FaParticularsProposal | null;
  /** Call when the form OPENS: reads the proposal and seeds an untouched form from it. */
  seed: () => void;
  /** Call when the form CLOSES or is submitted: drops the proposal and the seeded values. */
  clear: () => void;
};

export function useFaParticularsProposal(
  { clientId, assetId }: { clientId: string; assetId: string },
  setParticulars: Dispatch<SetStateAction<FaParticularsInput>>,
): FaParticularsProposalSeed {
  const [proposal, setProposal] = useState<FaParticularsProposal | null>(null);

  const seed = () => {
    void loadAssetParticularsProposal(sessionTokenAccessor, { clientId, assetId }).then((p) => {
      if (p === null) return;
      setProposal(p);
      setParticulars((current) =>
        current === EMPTY_PARTICULARS ? particularsFromProposal(p, current) : current);
    });
  };

  const clear = () => {
    setProposal(null);
    setParticulars(EMPTY_PARTICULARS);
  };

  return { proposal, seed, clear };
}
