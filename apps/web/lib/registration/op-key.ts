// NIT-1, fix round 2026-09-01 (fs4-pr488-review, PR #488) — hoisted out of
// `signup-dpa-form.tsx` and `signup-firm-form.tsx`, which each carried a
// byte-identical local `const newOpKey = (): string => crypto.randomUUID();`.
// Op-key minting is idempotency-IDENTITY-bearing machinery, not incidental
// plumbing — every door on this train relies on the SAME value surviving a
// retry of the same attempt (both callers' own headers explain why). If a
// later change needs a prefix, a namespace, or different entropy, one copy
// of two would get missed; a shared function cannot drift that way.
//
// Deliberately NOT a repo-wide consolidation: every other door caller in
// this codebase (`lib/bank/doors.ts`, `lib/journals/api.ts`, …) mints its
// own local `crypto.randomUUID()` one-liner, and that broader pattern is
// left alone — those modules are unrelated to each other, so a shared
// import would buy nothing. `signup-dpa-form.tsx` and `signup-firm-form.tsx`
// are different: two sibling steps of the SAME signup journey, in the same
// directory, calling doors under the same idempotency contract — exactly
// the case where one shared definition is worth the import.

/** Mint a fresh op_key. Callers hold the result (typically in a `useRef`)
 *  for the lifetime of one attempt — never re-minted mid-attempt, always
 *  re-minted for a genuinely new one. See the callers' own headers for
 *  what "new attempt" means for that specific door. */
export const newOpKey = (): string => crypto.randomUUID();
