// THE LANE-B SEAM — `clara.sign_dpa` (checkout-gate-design-part2.md §1.1).
//
// FS-4 C-6 Lane A builds the DPA step's UI and its read
// (`dpa-server-reads.ts`); it does not call `sign_dpa` for real. Two
// independent reasons, both worth naming rather than papering over:
//
//   1. `sign_dpa` is not in C-1 as actually built (measured against the live
//      migration text, PR #478 `UNNUMBERED_checkout_gate_c1_dpa.sql`): that
//      cohort creates the four tables and seeds the beta placeholder row,
//      and grants NOTHING to `clara_authenticated` — "C-1 creates no human
//      door". The door itself lands in a later PR.
//   2. Even once it exists, calling a real governed door from a Lane-A PR
//      would be exactly the "wall call" this train's split explicitly
//      reserves for Lane B (the work order's own words).
//
// THE STUB BELOW ALWAYS REPORTS "unavailable" — never a fabricated success.
// A checkbox (or a button) that looked like it recorded a signature while
// recording nothing is the precise fake receipt `apps/web/AGENTS.md`
// forbids, and it is the exact defect `signup-account-form.tsx`'s v1 DPA
// checkbox was built to avoid with a `NotBuiltNote` — moving the gate here
// must not lose that discipline.
//
// LANE B'S COMPLETION CONTRACT. Replace `signDpa` with a real `callDoor`
// invocation once the door exists and is granted, exactly as
// `lib/identity/doors.ts`'s `claimIdentity` calls `claim_identity`. Nothing
// in `signup-dpa-form.tsx` needs to change beyond removing its own "seam"
// framing: the component already renders whatever this function returns.

export type SignDpaParams = {
  readonly version: string;
  readonly bodySha256: string;
};

export type SignDpaOutcome =
  | { readonly kind: "signed" }
  | { readonly kind: "unavailable" };

export type SignDpa = (params: SignDpaParams) => Promise<SignDpaOutcome>;

/** THE PRODUCTION DEFAULT. See this module's header. */
export const signDpa: SignDpa = async () => ({ kind: "unavailable" });
