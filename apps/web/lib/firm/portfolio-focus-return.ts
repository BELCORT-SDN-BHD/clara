// #659 (fix round 1, finding A3) — FOCUS RETURNS TO THE CONTROL THAT LEFT.
//
// AC2's second half and AC7's keyboard clause both ask for one thing: a professional who tabs to a
// count on Firm Home, opens it, reads the Work list and presses Back must land with focus on the
// count they left from — not at the top of the document, which on this board means tabbing past a
// heading, a register link, two disclosure sentences and every earlier row to get back to where
// they already were.
//
// THE BROWSER DOES NOT DO THIS FOR US. Back out of a soft navigation restores scroll, not focus;
// measured on the real build by `p659.home.drilldown`, which read
// `document.activeElement?.getAttribute("aria-label")` after `goBack()` and got the empty string —
// i.e. `<body>`. (The cell that was supposed to prove this before compared
// `document.activeElement?.textContent` against a HARD-CODED "3" inside a three-leg loop, which the
// board's own "Needs you: 3" satisfied from an ancestor on every leg. It could not fail.)
//
// THE CHANNEL IS `sessionStorage`, on `lib/registration/signup-email-storage.ts`'s argument and in
// its shape: per-tab, per-origin, never in the URL. A focus marker in the address bar would survive
// a copy-paste and a forwarded link and would move a stranger's focus; this cannot leave the tab
// that wrote it. It is BEST-EFFORT AND NEVER LOAD-BEARING — `sessionStorage` throws in some private
// modes and can be disabled outright, and every function here swallows that and answers "nothing to
// restore". Losing the marker degrades to the focus behaviour that shipped before this module.
//
// AND IT IS TAKE-ONCE. `takePortfolioReturnFocus` clears as it reads, so a marker can move focus
// exactly one time. This board re-reads itself on four triggers (focus, visibilitychange, a 30 s
// tick and CLIENT_RECORD_CHANGED); a marker that survived its own use would yank the caret out of
// whatever the person had moved on to, every thirty seconds.

const STORAGE_KEY = "clara-firm-portfolio-return-focus";

function readSessionStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

/** The stable identity of one count link — the client it belongs to and which of the three counts
 *  it is. Used both as the marker's value and as the link's own `id`, so the thing remembered and
 *  the thing focused cannot be spelled two ways. */
export function portfolioCountLinkId(clientId: string, kind: string): string {
  return `portfolio-count-${clientId}-${kind}`;
}

/** Called when a count link is activated — by pointer or by Enter, which a browser dispatches as a
 *  click on an anchor, so one handler covers both. */
export function rememberPortfolioReturnFocus(clientId: string, kind: string): void {
  const storage = readSessionStorage();
  if (storage === null) return;
  try {
    storage.setItem(STORAGE_KEY, portfolioCountLinkId(clientId, kind));
  } catch {
    // A full or disabled store costs the person their focus position, never the navigation.
  }
}

/** Read AND clear. `null` when there is nothing to restore — which is the answer on a first visit,
 *  on a reload, in a private mode that refuses the store, and on every re-read after the first. */
export function takePortfolioReturnFocus(): string | null {
  const storage = readSessionStorage();
  if (storage === null) return null;
  try {
    const value = storage.getItem(STORAGE_KEY);
    storage.removeItem(STORAGE_KEY);
    return value === null || value === "" ? null : value;
  } catch {
    return null;
  }
}
