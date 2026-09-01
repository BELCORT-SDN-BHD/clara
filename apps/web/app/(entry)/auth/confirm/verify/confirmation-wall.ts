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
//
// R4, fix round 2026-09-01 — ONE DISPLAY-BOUND TO HONOUR: `remaining` must
// stay within [0, 5] and `retryAfterSeconds` within [0, 900] (part 1 §3.4's
// own C1/C2 ceilings) — `app/(entry)/auth/confirm/page.tsx`'s NIT-3 clamp
// renders anything outside those bounds as the generic `invalid` card
// instead of the real wrong-code/locked one. A real wall that ever needs a
// longer lockout window than 900s must widen that clamp in the SAME PR, or
// a genuine, non-malicious lockout will render as a mystery "invalid"
// state instead of the honest wait it actually is.
//
// M1/M2, fix round 2026-09-01 (PR #488, law-28 Codex adversarial leg) —
// TWO CONTRACT DEFECTS IN WHAT THIS SEAM HANDS LANE B, fixed here at the
// type level so Lane B's real implementation cannot inherit either mistake.
//
// M1 — THE FIELD NAMED `origin` WAS THE WRONG VALUE, NOT JUST A BAD NAME.
// It was fed `handler.ts`'s `proof.origin` — `proveSameOrigin`'s CSRF proof,
// i.e. the browser's `Origin` REQUEST HEADER. That header is IDENTICAL for
// every visitor to one deployment (e.g. `https://app.clarabook.com`). The
// design's C2 wall (part 1 §4 option B, part 3 §2.1) keys on a DIFFERENT
// fact: `sha256(pepper || proxy-observed CLIENT IP)`, one value PER ADDRESS.
// Handing the header in under any name meant to carry that digest would key
// C2 on one shared value for the whole deployment — five rejected guesses
// from ANYONE would lock out every applicant's signups (law 3, "spelling is
// not identity": the field read like the digest but was never the digest).
// Renamed to `originDigest`, typed as the opaque `OriginDigest` below so a
// bare `string` (the header included) cannot be assigned to it by accident.
//
// Lane A cannot compute a real one at this seam: nothing upstream of
// `handleEmailConfirmationPost` reads a trusted proxy-IP header today (the
// design's own courier for that, part 1 §4.1, is unbuilt), and this file
// must not fabricate an IP-derived digest client-side to fill the gap — a
// browser has no trustworthy view of its own proxy-observed address anyway.
// Of the two honest shapes on offer — (a) let the caller pass the real
// digest once one exists, or (b) mint a second, distinct "unavailable"
// reason — this file takes **(a)**: `originDigest` stays a real, required
// key of the params (nothing is silently omittable), typed `| undefined`,
// and `handler.ts` passes `undefined` explicitly with a comment saying why.
// (b) was rejected because the stub already has exactly one honest "the
// real wall isn't wired up" outcome (`{kind:"unavailable"}`) that already
// covers "no digest either" — a second reason would duplicate it without
// the runtime route existing yet to ever tell the two apart, and widening
// `ConfirmationAttemptOutcome` is the one change this file's own header
// above says never to make casually ("TypeScript will refuse a non-
// exhaustive switch"). Lane B, wiring the real runtime call, either threads
// the trusted-header value through to this seam and drops the `undefined`
// arm, or computes it at the point it makes the call — its choice, made
// where the proxy header is actually readable.
//
// M2 — THE SEAM DROPPED `attempt_id`. Design (part 3 §2.1): the claim door
// returns `{attempt_id, allowed, remaining}` and settle takes `p_attempt
// uuid` — the id names WHICH row this specific guess counted against.
// Without it, a valid-code and a wrong-code request in flight together could
// have settlement stamp the wrong row: exploitable to keep a guess from ever
// counting against C1/C2. `attemptId` now rides the `"allowed"` outcome (the
// only branch that ever reaches `settleAttempt` — a `"rejected"` claim never
// calls `verifyOtp` at all, part 3 §2.1's "an attempt that is never settled
// … counts against C1/C2 as if rejected" is exactly why it needs none), and
// `settleConfirmationAttempt` now requires it as its first argument.

/**
 * An opaque C2 client-address digest — `sha256(pepper || proxy-observed
 * client IP)`, part 1 §4 option B / part 3 §2.1 ("both digests are exactly
 * 32 bytes"). Branded so a caller cannot pass a bare `string` — the `Origin`
 * header included — under this name by accident (M1 above). Nothing in this
 * file constructs one; it exists so Lane B's real value has somewhere typed
 * to land.
 */
export type OriginDigest = string & { readonly __brand: "OriginDigest" };

/** What the wall decided, told apart from "the wall isn't reachable at all". */
export type ConfirmationAttemptOutcome =
  | {
      readonly kind: "allowed";
      /** `clara.claim_confirmation_attempt`'s own `attempt_id` (part 3
       *  §2.1) — the row this guess counted against. MUST be threaded back
       *  into `settleConfirmationAttempt` unchanged (M2 above). */
      readonly attemptId: string;
      readonly remaining: number;
    }
  | {
      /**
       * 裁-103 — OWNER-CONFIRMED 2026-09-01, see the pm ledger
       * (docs/plan/active/mohe-grill-rulings-2026-09-01-pm.md). (Raised by
       * fs4-pr488-review; the finding is theirs, the ruling is the
       * owner's — a review lane is never the ruling authority on a
       * design-vs-contract call, AGENTS.md hard constraint 1.)
       *
       * KEEP THIS SHAPE — do NOT shrink it to match the design text
       * literally: part 3 §2.1's `claim_confirmation_attempt` prose only
       * names `{attempt_id, allowed, remaining}`, no `scope`/`wait`. 裁-103
       * is that the real door must supply BOTH anyway — `scope` explicitly
       * (parsing it back out of an errcode/message would be the law-3
       * "spelling is not identity" trap) and `retryAfterSeconds` because it
       * is derived from DB-owned window state and this UI must never
       * compute it. Lane B WIRES these two fields through from the door's
       * real response; it does not invent them at this seam.
       *
       * RECONCILIATION OWED: `page.tsx`'s R4/NIT-3 clamp renders any
       * `retryAfterSeconds` over 900 as the generic `invalid` card, on the
       * assumption C1/C2's window is 15 minutes (part 1 §3.4). C-3 names
       * the real window when it builds the door; if that window is not
       * 900s, the clamp must be trued to match in the SAME/a follow-up PR,
       * or a genuine lockout longer than the guessed ceiling renders as a
       * mystery "invalid" instead of the honest wait it is. Not guessed
       * here — flagged for whoever lands the real door next.
       */
      readonly kind: "rejected";
      readonly scope: "address" | "origin";
      readonly retryAfterSeconds: number;
    }
  | { readonly kind: "unavailable" };

export type ClaimConfirmationAttemptParams = {
  readonly email: string;
  /**
   * THE C2 CLIENT-ADDRESS DIGEST (part 1 §4 option B / part 3 §2.1) — NEVER
   * the `Origin` request header (M1 above; `proveSameOrigin`'s `origin` is a
   * same-origin CSRF proof, a DIFFERENT fact that happens to share an
   * English word with this one). `undefined` until a caller genuinely has a
   * proxy-observed-address digest to offer — see this module's header for
   * why Lane A never does today, and never fabricates one to fill the gap.
   */
  readonly originDigest: OriginDigest | undefined;
};

export type ClaimConfirmationAttempt = (
  params: ClaimConfirmationAttemptParams,
) => Promise<ConfirmationAttemptOutcome>;

export type ConfirmationAttemptSettlement = "accepted" | "rejected";

export type SettleConfirmationAttempt = (
  /** `ConfirmationAttemptOutcome`'s `"allowed"` arm's own `attemptId`,
   *  unchanged — settling any other value stamps the wrong row (M2 above). */
  attemptId: string,
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
