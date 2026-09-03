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
