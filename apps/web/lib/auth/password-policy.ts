// THE ONE PASSWORD-POLICY FACT, held once (PR 541 stage 2).
//
// ============================================================================
// WHY A CONSTANT AND NOT THREE LITERALS
// ============================================================================
// Three surfaces take a new password — `/signup`, `/invite/[token]` and
// `/auth/recover/password` — and before this module they carried three
// independent numbers: 8, 8 and 12. The reset face was right and the two entry
// faces were four characters short, so an applicant could satisfy the browser
// and then be refused by hosted Auth with a raw provider message
// (`signup-account-form.tsx` renders `signUpError.message` verbatim) about a
// rule nothing had told them one line earlier.
//
// The drift was invisible because each site's own comment said the value was
// "a UI convenience ONLY", which is TRUE and is exactly why nobody moved it
// when the server minimum moved. A courtesy that disagrees with the wall is
// not a courtesy; it is a wrong answer delivered politely. One constant, three
// readers, and a census cell (`components/password-policy.test.tsx`) that
// walks the shipped tree and reds if a fourth password input appears carrying
// its own number.
//
// ============================================================================
// 12 IS MEASURED, NOT CHOSEN
// ============================================================================
// The authoritative policy lives in hosted Supabase Auth and this repo cannot
// enforce it. The value here is the one that was READ BACK from the project
// through the Management API during FS-11 Wave-G step 18 on 2026-09-03:
// `password_min_length` **12** (`docs/plan/completed/
// fs11-wave-g-asrun-2026-09-03-part6.md:230`). So the sentence the UI states is
// a report of a measured setting, not an aspiration — the distinction hard
// constraint 2 draws, applied to a configuration fact instead of a number in a
// ledger.
//
// WHAT THE POLICY SENTENCE DELIBERATELY DOES NOT SAY, and this is the part a
// future editor must not "restore": it makes NO claim about breached
// passwords. The same Management-API read returned `password_hibp_enabled`
// **false** (part6.md:238, carried into the handover as H-40, an open owner
// decision). `messages/en.json`'s old `PasswordReset.description` asserted
// "ClaraBook also refuses known breached passwords" over a project that does
// not — the app claiming a wall it cannot see. The clause is gone until the
// setting is on; re-add it in the SAME change that flips HIBP and records the
// read-back, never before.
//
// STILL NOT THE WALL. `minLength` is a browser courtesy that any direct SDK or
// Auth API call bypasses. Hosted Auth is the wall; this is what the person is
// told before they type, so the wall is never their first news of the rule.

/** The minimum length the three password surfaces state and enforce as a
 *  browser courtesy. Mirrors the hosted project's measured
 *  `password_min_length`; move both together or not at all. */
export const PASSWORD_MIN_LENGTH = 12;
