/**
 * The ⌘K "Ask" seam.
 *
 * PRD §5a: "the rail is where she speaks; the workbench is where the work
 * lives" — ⌘K's Ask section never converses itself (docs/plan/active/
 * mohe-grill-rulings-2026-08-27.md Q3: "Ask = seam"). Selecting the Ask row
 * hands the typed text to the Clara rail and asks it to take focus — the
 * same thing clicking straight into the rail's own composer would do. No
 * model call happens here, and no response is synthesized in ⌘K.
 *
 * CONTRACT for the rail lane (p2-rail), which subscribes to this from code
 * that lands in a different, later PR:
 *
 *   Event name : CLARA_FOCUS_RAIL_EVENT ("clara:focus-rail")
 *   Transport  : a `CustomEvent` dispatched on `window`, not a React
 *                context — the emitter (this command palette) and the
 *                subscriber (the rail) are not mounted under a common
 *                provider yet, so a DOM event is the smallest seam that
 *                needs no shared wiring on either side. Once the rail lane
 *                exists it MAY additionally read this via a context if that
 *                proves nicer to consume — the event stays as the stable,
 *                lane-independent contract either way.
 *   Payload    : `ClaraFocusRailDetail` — `query` is the raw text the user
 *                had typed into ⌘K's Ask input (empty string if none); the
 *                rail is expected to focus its composer and, if `query` is
 *                non-empty, seed it with that text (not send it) so the
 *                accountant can review/edit before it goes anywhere.
 *   Subscribe  : `onFocusRail(handler)` — returns an unsubscribe function.
 *   Emit       : `focusRail(detail)` — SSR-safe no-op when `window` is
 *                undefined.
 */

export const CLARA_FOCUS_RAIL_EVENT = "clara:focus-rail";

export interface ClaraFocusRailDetail {
  /** The text to seed the rail composer with — ⌘K's Ask input, or the context an inbox row
   *  hands over. NEVER auto-sent: the rail seeds and focuses, and sending stays the human's
   *  act (`useFocusRailSubscription`'s own contract). */
  query: string;
  /**
   * Request origin. `"cmdk"` is the palette (the Ask row, and a Do dispatch handing the
   * human to the rail where the run renders itself); `"inbox"` is 裁-17 ④'s "ask Clara about
   * this" handoff from a needs-you row. The field was already "kept explicit for
   * forward-compat" — this is that forward, and it is a widening of a payload nothing
   * branches on, not a new transport.
   */
  source: "cmdk" | "inbox";
}

export type ClaraFocusRailEvent = CustomEvent<ClaraFocusRailDetail>;

/** Emits the focus-the-rail request. SSR-safe (no-ops without `window`). */
export function focusRail(detail: ClaraFocusRailDetail): void {
  if (typeof window === "undefined") {
    return;
  }
  window.dispatchEvent(
    new CustomEvent<ClaraFocusRailDetail>(CLARA_FOCUS_RAIL_EVENT, { detail }),
  );
}

/**
 * Subscribes to focus-the-rail requests. Returns an unsubscribe function.
 * SSR-safe (returns a no-op unsubscribe without `window`).
 */
export function onFocusRail(
  handler: (detail: ClaraFocusRailDetail) => void,
): () => void {
  if (typeof window === "undefined") {
    return () => {};
  }
  const listener = (event: Event) => {
    handler((event as ClaraFocusRailEvent).detail);
  };
  window.addEventListener(CLARA_FOCUS_RAIL_EVENT, listener);
  return () => window.removeEventListener(CLARA_FOCUS_RAIL_EVENT, listener);
}

/**
 * ============================================================================
 * H-50 — THE CLIENT-RECORD INVALIDATION SEAM.
 * ============================================================================
 *
 * THE DEFECT. `commit_client_onboarding` flips `clara.clients.status` from `onboarding` to
 * `active` (0017_wave_b.sql:2825) and `cancel_client_onboarding` flips it to `archived`
 * (:2865). Both fire from `OnboardingChecklistCard`, which lives under `RailMount` — mounted
 * in `app/(firm)/layout.tsx` as a SIBLING of `{children}`, deliberately (see
 * `components/clara/rail-mount.tsx`'s own header). The page that RENDERS the status is
 * `components/firm/client-workspace-overview.tsx`, on the other side of that boundary, and it
 * reads through `useAsyncRead`, whose mount effect has empty deps by contract. So the Home tab
 * kept reading "Status Onboarding" for an activated client until a hard reload, and the
 * /clients register did the same on a back-navigation.
 *
 * WHY A DOM EVENT AND NOT A PROVIDER. Exactly the reason the focus-rail seam above gives: the
 * emitter and the subscribers share no provider, and the structural boundary between them is
 * deliberate and must NOT be removed to carry a signal. `router.refresh()` would not help
 * either — it re-renders Server Components, and both subscribers are client components whose
 * mount effect does not re-run without a remount.
 *
 * WHAT IT IS NOT. It is not a poll and must never become one: a client's status is stable for
 * the client's whole life except at this one transition. It carries NO status value either —
 * only the id of the client whose record changed. A payload carrying the new status would be
 * the writer telling the reader what the database now says, which is the optimistic-UI shape
 * the whole estate forbids; the subscriber RE-READS.
 *
 *   Event name : CLIENT_RECORD_CHANGED ("clara:client-record-changed")
 *   Payload    : `{ clientId }` — the client whose `clara.clients` row changed.
 *   Emit       : after a governed act SUCCEEDS. A refusal changed nothing and emits nothing.
 *   Subscribe  : `onClientRecordChanged(handler)` — returns an unsubscribe function.
 */
export const CLIENT_RECORD_CHANGED_EVENT = "clara:client-record-changed";

export interface ClientRecordChangedDetail {
  /** The client whose `clara.clients` row changed. A subscriber scoped to one client compares
   *  this and ignores every other id; the firm-wide register reloads on any. */
  clientId: string;
}

export type ClientRecordChangedEvent = CustomEvent<ClientRecordChangedDetail>;

/** Announces that a client's own record changed. SSR-safe (no-ops without `window`). */
export function clientRecordChanged(detail: ClientRecordChangedDetail): void {
  if (typeof window === "undefined") {
    return;
  }
  window.dispatchEvent(
    new CustomEvent<ClientRecordChangedDetail>(CLIENT_RECORD_CHANGED_EVENT, { detail }),
  );
}

/** Subscribes to client-record changes. Returns an unsubscribe function. SSR-safe. */
export function onClientRecordChanged(
  handler: (detail: ClientRecordChangedDetail) => void,
): () => void {
  if (typeof window === "undefined") {
    return () => {};
  }
  const listener = (event: Event) => {
    handler((event as ClientRecordChangedEvent).detail);
  };
  window.addEventListener(CLIENT_RECORD_CHANGED_EVENT, listener);
  return () => window.removeEventListener(CLIENT_RECORD_CHANGED_EVENT, listener);
}
