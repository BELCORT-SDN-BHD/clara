"use client";

// #633 AC3(b) — ONE registry read per mount, shared by every row of a surface.
//
// `clara.document_capabilities` is a GLOBAL 240-row catalogue (12 formats x 20 kinds)
// with no tenant column, granted to `clara_authenticated` under a `for select … using
// (true)` policy (0191:267-271). It is static vocabulary: it cannot change while a
// page is open, so it is read ONCE and is deliberately NOT part of the settle-poll's
// read budget. The alternative the brief rules out by name — calling
// `clara.get_document_state` per list row — would put an N+1 under the user's JWT on
// exactly the hot path the poll already uses.
//
// A FAILED READ IS AN HONEST ABSENCE, NOT A DEFAULT. `index` stays null, every row
// renders the "not published" tier, and nothing is claimed about any file. That is
// why this hook exposes `err`/`clr` rather than swallowing them: a surface that
// cannot read the registry must say so, not quietly promise support.

import { useMemo } from "react";
import { useHydratedPart } from "@/lib/parts/hooks";
import type { SessionTokenAccessor } from "@/lib/session";
import {
  buildCapabilityIndex, readCapabilityRegistry,
  type CapabilityIndex, type CapabilityRegistryRow,
} from "./capability-registry";

export type CapabilityRegistryState = {
  index: CapabilityIndex | null;
  loading: boolean;
  err: string | null;
  clr: ReturnType<typeof useHydratedPart<CapabilityRegistryRow[]>>["clr"];
};

export function useCapabilityRegistry(session: SessionTokenAccessor | null): CapabilityRegistryState {
  const part = useHydratedPart<CapabilityRegistryRow[]>(
    session,
    async (live) => readCapabilityRegistry({ session: live }),
  );
  const index = useMemo(
    () => (part.data ? buildCapabilityIndex(part.data) : null),
    [part.data],
  );
  return { index, loading: part.loading, err: part.err, clr: part.clr };
}
