// THE W-H PREFILL CHANNEL — checkout-gate-design.md §3.3 / cell W-H.
//
// 裁-92's confirm page needs a convenience: prefill the address the person
// just typed at signup step 1, so they are not forced to retype it beside
// the six-digit code. The design is explicit about the ONE thing that
// convenience may never become: "the email field is typed by the person, or
// read from THIS BROWSER's own signup state. It is never populated from a
// query parameter, a path segment, or any other caller-supplied value."
//
// A URL is caller-supplied by construction — it survives a copy-paste, a
// forwarded link, a shared screenshot. `sessionStorage` is not: it is
// per-tab, per-origin, and never leaves the browser that wrote it, which is
// exactly the property that keeps W-H's binding true (part 1 §3.1 — the
// address must be "this person's own", a fact about what a human typed, not
// a value that rode along in a URL an attacker could construct).
//
// BEST-EFFORT, NEVER LOAD-BEARING. `sessionStorage` throws in some private-
// browsing modes and can be disabled entirely; every function here swallows
// that failure and returns the "nothing to prefill" answer. Losing the
// prefill degrades to "the person types their address again" — annoying,
// never unsafe, and never a crash of the signup step itself.
//
// N2, fix round 2026-09-01 (PR #488 Codex adversarial leg) — RECORDED, NOT
// FIXED HERE: a shared browser/kiosk that leaves this tab open lets the next
// person at the keyboard see the prior applicant's prefilled address on
// `/auth/confirm`. This needs physical access to that same tab and no
// remote vector exists (the value never leaves this origin, this tab —
// `sessionStorage`, not `localStorage`). `forgetSignupEmail` already clears
// it once the code verifies; the residual is the window BEFORE that, on a
// tab someone else can physically reach. No code change proposed for this
// round.

const STORAGE_KEY = "clara-signup-email";

function readSessionStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

/** Called once, from `SignupAccountForm`, the moment `signUp` reports
 *  confirmation is pending — the ONE point in the journey where the browser
 *  has just seen the person type their own address. Never called with a
 *  value that arrived any other way. */
export function rememberSignupEmail(email: string): void {
  const storage = readSessionStorage();
  if (storage === null) return;
  try {
    storage.setItem(STORAGE_KEY, email);
  } catch {
    // A full or disabled store loses the convenience, never the signup.
  }
}

/** Read by the confirm code form on mount, to prefill its email field —
 *  and ONLY there. Returns `null` for anything that is not a nonblank
 *  string, so a corrupted or tampered value never renders as if it were a
 *  real remembered address. */
export function recalledSignupEmail(): string | null {
  const storage = readSessionStorage();
  if (storage === null) return null;
  let value: string | null;
  try {
    value = storage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

/** Cleared once the code is verified and the person has moved on — there is
 *  no further use for it, and an append-only guess at "how long is this
 *  safe to keep" is worse than simply not keeping it past its one job. */
export function forgetSignupEmail(): void {
  const storage = readSessionStorage();
  if (storage === null) return;
  try {
    storage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to contain: worst case the tab keeps a stale value nobody reads.
  }
}
