"use client";

// The Journals workbench's controller hook — wires the generic hydrate-never-
// trust mechanism (lib/parts/hooks.ts's `useHydratedPart`) to this tab's own
// combined read (`loadJournalsWorkbench`) and its governed doors. NO OPTIMISTIC
// UI: every action re-reads the whole client picture on completion, success or
// failure alike (hooks.ts's own header) — this module invents no shortcut
// around that mechanism, it only names the loader and the doors.
//
// `readErrorKind` SIDE CHANNEL: `useHydratedPart`'s own `applyFailure` folds any
// `WireError` (which `ReadError` subtypes) down to a plain message string —
// `.kind` (no_session/forbidden/not_found/…) is not part of its returned state.
// The mission asks for distinct no_session/forbidden/not_found renderings for a
// READ failure, so this hook observes the SAME thrown error a second time, via
// its own catch-and-rethrow around the loader, and exposes the kind separately —
// it does not change hooks.ts's own classification or add a second copy of that
// judgement logic, it only reads the `.kind` already computed by lib/read.ts's
// `ReadError` before letting the exact same error continue to `applyFailure`.

import { useCallback, useState } from "react";
import { useHydratedPart } from "@/lib/parts/hooks";
import { sessionTokenAccessor } from "@/lib/session-accessor";
import { isReadError, type ReadErrorKind } from "@/lib/read";
import type { SessionTokenAccessor } from "@/lib/session";
import {
  approveEntry,
  composeManualEntry,
  loadJournalsWorkbench,
  reverseEntry,
  reviseEntry,
  type ComposeManualEntryInput,
} from "./api";
import type { EntryLineInput, JournalsData } from "./types";

export function useJournalsWorkbench(clientId: string, auth: SessionTokenAccessor = sessionTokenAccessor) {
  const [readErrorKind, setReadErrorKind] = useState<ReadErrorKind | null>(null);

  const loader = useCallback(
    async (session: SessionTokenAccessor) => {
      try {
        const data = await loadJournalsWorkbench(session, clientId);
        setReadErrorKind(null);
        return data;
      } catch (e) {
        setReadErrorKind(isReadError(e) ? e.kind : null);
        throw e; // unchanged — useHydratedPart's own applyFailure still classifies this
      }
    },
    [clientId],
  );
  const state = useHydratedPart<JournalsData>(auth, loader);

  const approve = useCallback(
    (entryId: string, expectedRevision: string, attestation?: string | null) =>
      state.act(() => approveEntry(auth, entryId, expectedRevision, attestation)),
    [auth, state],
  );

  const revise = useCallback(
    (entryId: string, lines: EntryLineInput[], expectedRevision: string) =>
      state.act(() => reviseEntry(auth, entryId, lines, expectedRevision).then(() => undefined)),
    [auth, state],
  );

  const reverse = useCallback(
    (entryId: string, reason: string) => state.act(() => reverseEntry(auth, entryId, reason).then(() => undefined)),
    [auth, state],
  );

  const compose = useCallback(
    (input: ComposeManualEntryInput, onOk?: () => void) =>
      state.act(() => composeManualEntry(auth, clientId, input).then(() => undefined), onOk),
    [auth, clientId, state],
  );

  return { ...state, readErrorKind, approve, revise, reverse, compose };
}
