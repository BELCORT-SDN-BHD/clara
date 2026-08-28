"use client";

// The Journals workbench's controller hook — wires the generic hydrate-never-
// trust mechanism (lib/parts/hooks.ts's `useHydratedPart`) to this tab's own
// combined read (`loadJournalsWorkbench`) and its governed doors. NO OPTIMISTIC
// UI: every action re-reads the whole client picture on completion, success or
// failure alike (hooks.ts's own header) — this module invents no shortcut
// around that mechanism, it only names the loader and the doors.
//
// `readErrorKind` SIDE CHANNEL: `useHydratedPart`'s own `applyFailure` folds any
// `WireError` (which `ReadError`/`DoorError` both subtype) down to a plain
// message string — `.kind` (no_session/forbidden/not_found/unauthenticated/…)
// is not part of its returned state. The mission asks for distinct renderings
// per kind, so this hook observes the SAME thrown error a second time, via its
// own catch-and-rethrow around the loader, and exposes the kind separately —
// it does not change hooks.ts's own classification or add a second copy of
// that judgement logic, it only reads the `.kind` a lower layer already
// computed before letting the exact same error continue to `applyFailure`.
//
// N4 (independent review): the combined loader's OWN read RPC
// (`listReviewQueue`, via `callDoor`) fails as a `DoorError`, not a
// `ReadError` — the first pass here only checked `isReadError`, so an RPC
// read failure inside the same `Promise.all` silently produced `readErrorKind:
// null` even though `DoorError` carries the identical `.kind` shape
// (`WireErrorKind`, shared/journals/wire-error-kind.ts). `kindOfReadFailure`
// below checks BOTH — one classification, read from whichever of the two
// classes actually threw.
//
// FIX-2 / N1 (independent review): `useHydratedPart`'s busy/err/clr are ONE
// state per hook instance, not per row/action — the first pass handed the
// SAME err/clr to every draft's detail panel and to the posted panel's every
// row, so a refusal from reversing entry A could render attached to entry B's
// still-open detail view (cross-attribution). `actingId` tracks WHICH row (or
// the sentinel `"compose"`) the CURRENT busy/err/clr belongs to — set
// synchronously, before `state.act()` is even called, so it always lands in
// the SAME React batch as `act()`'s own `setBusy(true); setErr(null);
// setClr(null)` (hooks.ts's own act() does this at the top of its body, before
// its first `await`). A consuming component must compare `actingId` against
// its OWN row's id before rendering `err`/`clr` — see components/journals's
// per-panel usage.

import { useCallback, useState } from "react";
import { useHydratedPart } from "@/lib/parts/hooks";
import { sessionTokenAccessor } from "@/lib/session-accessor";
import { isReadError, type ReadErrorKind } from "@/lib/read";
import { isDoorError } from "@/lib/doors";
import type { SessionTokenAccessor } from "@/lib/session";
import {
  approveEntry,
  composeManualEntry,
  loadJournalsWorkbench,
  reverseEntry,
  reviseEntry,
  type ComposeManualEntryInput,
} from "./api";
import {
  answerInterruption,
  approveRoutineEntry,
  listPendingInterruptions,
  withdrawDraft,
} from "./governance-doors";
import { promoteClarifyToQuestion } from "@/lib/coding/doors";
import { listAgentTaskClientIds } from "@/lib/coding/reads";
import type { EntryLineInput, JournalsDataWithInterruptions } from "./types";

/** T6: the P3 combined loader (`loadJournalsWorkbench`) predates the firm-wide
 *  interruptions read — folded in HERE rather than editing api.ts's already-
 *  500-line loader (this repo's own file-size convention, api.test.ts's
 *  header), and rather than a second parallel `useHydratedPart` cycle, so
 *  answering an interruption rides the SAME single act()-and-reload
 *  discipline as every other door on this tab. */
/** F12, independent review: the client_id lookup used to run as a THIRD,
 *  serial `await` after `Promise.all` had already resolved BOTH the main
 *  workbench read and the interruptions read — adding a full extra round
 *  trip to the whole tab's critical path for a value only the promote
 *  control needs. Folded into the SAME parallel wave instead, chained off
 *  `listPendingInterruptions` (it needs that read's own output as input, so
 *  it cannot start any earlier) — it now runs CONCURRENTLY with
 *  `loadJournalsWorkbench`, not after both. `.catch(() => ({}))`: a failure
 *  here must degrade ONLY the promote control (interruptions-panel.tsx omits
 *  it for a task with no known client_id — its own header), never the
 *  entries/drafts/posted data this whole tab actually needs. */
async function loadJournalsWorkbenchWithInterruptions(
  session: SessionTokenAccessor,
  clientId: string,
): Promise<JournalsDataWithInterruptions> {
  const interruptionsWithClients = listPendingInterruptions({ session }).then(async (interruptions) => {
    const clientIdByTaskId = await listAgentTaskClientIds(interruptions.map((i) => i.task_id), { session })
      .then((rows) => Object.fromEntries(rows.map((r) => [r.id, r.client_id])))
      .catch(() => ({}) as Record<string, string | null>);
    return { interruptions, clientIdByTaskId };
  });
  const [data, { interruptions, clientIdByTaskId }] = await Promise.all([
    loadJournalsWorkbench(session, clientId),
    interruptionsWithClients,
  ]);
  return { ...data, interruptions, clientIdByTaskId };
}

/** The sentinel `actingId` for the compose ceremony — not a real entry id
 *  (a new entry has none until the door succeeds), but a stable identity the
 *  compose dialog can compare against. */
export const COMPOSE_ACTING_ID = "compose";

function kindOfReadFailure(e: unknown): ReadErrorKind | null {
  if (isReadError(e)) return e.kind;
  if (isDoorError(e)) return e.kind;
  return null;
}

export function useJournalsWorkbench(clientId: string, auth: SessionTokenAccessor = sessionTokenAccessor) {
  const [readErrorKind, setReadErrorKind] = useState<ReadErrorKind | null>(null);
  const [actingId, setActingId] = useState<string | null>(null);

  const loader = useCallback(
    async (session: SessionTokenAccessor) => {
      try {
        const data = await loadJournalsWorkbenchWithInterruptions(session, clientId);
        setReadErrorKind(null);
        return data;
      } catch (e) {
        setReadErrorKind(kindOfReadFailure(e));
        throw e; // unchanged — useHydratedPart's own applyFailure still classifies this
      }
    },
    [clientId],
  );
  const state = useHydratedPart<JournalsDataWithInterruptions>(auth, loader);

  const approve = useCallback(
    (entryId: string, expectedRevision: string, attestation?: string | null) => {
      setActingId(entryId);
      return state.act(() => approveEntry(auth, entryId, expectedRevision, attestation));
    },
    [auth, state],
  );

  const revise = useCallback(
    (entryId: string, lines: EntryLineInput[], expectedRevision: string, onOk?: () => void) => {
      setActingId(entryId);
      return state.act(() => reviseEntry(auth, entryId, lines, expectedRevision).then(() => undefined), onOk);
    },
    [auth, state],
  );

  const reverse = useCallback(
    (entryId: string, reason: string, onOk?: () => void) => {
      setActingId(entryId);
      return state.act(() => reverseEntry(auth, entryId, reason).then(() => undefined), onOk);
    },
    [auth, state],
  );

  const compose = useCallback(
    (input: ComposeManualEntryInput, onOk?: () => void) => {
      setActingId(COMPOSE_ACTING_ID);
      return state.act(() => composeManualEntry(auth, clientId, input).then(() => undefined), onOk);
    },
    [auth, clientId, state],
  );

  // --- T6 additions: the routine quick-approve, draft withdrawal, and the
  // firm-wide agent-clarify answer door — all ride the SAME act()-and-reload
  // cycle as approve/revise/reverse/compose above (hydrate-never-trust). ---

  const approveRoutine = useCallback(
    (entryId: string, expectedRevision: string, onOk?: () => void) => {
      setActingId(entryId);
      return state.act(() => approveRoutineEntry(entryId, expectedRevision, { session: auth }), onOk);
    },
    [auth, state],
  );

  const withdraw = useCallback(
    (entryId: string, reason: string, expectedRevision: string, onOk?: () => void) => {
      setActingId(entryId);
      return state.act(() => withdrawDraft(entryId, reason, expectedRevision, { session: auth }), onOk);
    },
    [auth, state],
  );

  const answerClarify = useCallback(
    (interruptionId: string, answer: Record<string, unknown>, onOk?: () => void) => {
      setActingId(interruptionId);
      return state.act(() => answerInterruption(interruptionId, answer, { session: auth }), onOk);
    },
    [auth, state],
  );

  // T7 (port-wave plan §4: promote_clarify_to_question, "the workbench half
  // only, no wire change") — the SAME act()-and-reload cycle as every other
  // door here. `scopeId` is the caller's own already-resolved client_id
  // (interruptionClientIds above) — this hook does not derive it itself.
  const promoteClarify = useCallback(
    (interruptionId: string, scopeId: string, onOk?: () => void) => {
      setActingId(interruptionId);
      return state.act(() => promoteClarifyToQuestion(interruptionId, "client", scopeId, { session: auth }).then(() => undefined), onOk);
    },
    [auth, state],
  );

  return { ...state, readErrorKind, actingId, approve, revise, reverse, compose, approveRoutine, withdraw, answerClarify, promoteClarify };
}
