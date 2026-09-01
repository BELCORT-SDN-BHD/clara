// THE LANE-B SEAM — checkout-gate-design.md §2.1 / §3.4's C1/C2 attempt wall.
//
// FS-4 C-6 Lane A (this PR) builds the code-entry surface and the handler's
// SHAPE; it does not, and cannot, wire the real wall. §3.5 of part 1 is why:
// the confirming caller has no session yet, so this cannot be a
// `clara_authenticated` PostgREST call like every other door on this train —
// it has to go `apps/web` → the runtime (`CLARA_RUNTIME_URL`, server-to-
// server) → `clara.claim_confirmation_attempt` / `settle_confirmation_
// attempt`. That runtime route is C-5's, not built on this tip.
//
// THE STUB BELOW ALWAYS REFUSES, HONESTLY, RATHER THAN LETTING EVERY CALLER
// THROUGH. A six-digit code is guessable (part 1 §3.4): the whole reason
// C1/C2 exist is that `verifyOtp` alone is not a sufficient wall. A seam that
// defaulted to "allowed" so the happy path looked done would be building a
// confirmation form with NO rate limit at all and calling it finished — the
// exact shape of fake success `apps/web/AGENTS.md` forbids ("the UI never
// invents... a missing backend verb renders honestly 'not built yet'").
// `"unavailable"` is its own outcome, distinct from the wall's own two real
// refusals (wrong-code, locked) precisely so the confirm page never claims a
// lockout that did not happen — it says the true thing: this mechanism is
// not connected yet.
//
// LANE B'S COMPLETION CONTRACT. Replace `claimConfirmationAttempt` and
// `settleConfirmationAttempt` below with real calls to the runtime route
// C-5 adds. Nothing else in `handler.ts` needs to change: it already
// branches on `"allowed" | "rejected" | "unavailable"`, and the day this
// function can genuinely return the first two, real evidence flows through
// the exact same call sites. Do not widen the return type without updating
// `handler.ts`'s switch — TypeScript will refuse a non-exhaustive one.

/** What the wall decided, told apart from "the wall isn't reachable at all". */
export type ConfirmationAttemptOutcome =
  | { readonly kind: "allowed"; readonly remaining: number }
  | {
      readonly kind: "rejected";
      readonly scope: "address" | "origin";
      readonly retryAfterSeconds: number;
    }
  | { readonly kind: "unavailable" };

export type ClaimConfirmationAttemptParams = {
  readonly email: string;
  readonly origin: string;
};

export type ClaimConfirmationAttempt = (
  params: ClaimConfirmationAttemptParams,
) => Promise<ConfirmationAttemptOutcome>;

export type ConfirmationAttemptSettlement = "accepted" | "rejected";

export type SettleConfirmationAttempt = (
  outcome: ConfirmationAttemptSettlement,
) => Promise<void>;

/**
 * THE PRODUCTION DEFAULT. Every real caller of `handleEmailConfirmationPost`
 * gets this until Lane B replaces it — never a bypass, never a fabricated
 * "allowed". See this module's header for why that is the honest choice
 * rather than a shortcut.
 */
export const claimConfirmationAttempt: ClaimConfirmationAttempt = async () => ({
  kind: "unavailable",
});

/**
 * Informational only — settling an attempt that could not have been claimed
 * (the stub above never returns `"allowed"`) is a no-op today. Kept as its
 * own seam so Lane B's replacement of `claimConfirmationAttempt` does not
 * also have to invent this call site from scratch.
 */
export const settleConfirmationAttempt: SettleConfirmationAttempt = async () => {};
