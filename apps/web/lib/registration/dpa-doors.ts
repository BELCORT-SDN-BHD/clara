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
// LANE B'S COMPLETION CONTRACT — read this before touching `signDpa`.
// Replace the body below with a real `callDoor("sign_dpa", { p_version:
// params.version, p_body_sha256: params.bodySha256, p_op_key: params.opKey })`
// once the door exists and is granted, exactly as `lib/identity/doors.ts`'s
// `claimIdentity` calls `claim_identity`.
//
// A — fix round 2026-09-01 (PR #488, fs4-pr488-review's mid-round addition):
// `clara.sign_dpa(p_version text, p_body_sha256 bytea, p_op_key text)`
// (checkout-gate-design-part2.md:51) is THREE required params and refuses
// `op_key is required` -> CLR10 on a missing one. This seam's params were
// missing the third — a literal implementation of the seam would have hit
// CLR10 on every real call. `opKey` is now part of `SignDpaParams`, and the
// CALLER MINTS AND HOLDS IT — never this function. `signup-dpa-form.tsx`
// mints one with `crypto.randomUUID()` and keeps it in a `useRef` for the
// lifetime of the component (`signup-firm-form.tsx`'s own op_key idiom,
// that file's header), so a transport failure after the door already
// committed replays the receipt on retry instead of colliding with it.
// Minting a fresh key per call here (inside `signDpa`, on every invocation)
// would be the wrong fix even though it satisfies the type: it hands every
// retry of the SAME click a NEW key, defeating the idempotency the key
// exists for. (The blast radius is bounded regardless — `sign_dpa` is also
// structurally idempotent on `dpa_signatures`' `unique (user_id,
// dpa_version)`, survey F6, so a double-click replays rather than double-
// signs — but the op_key contract is still worth getting right before Lane
// B builds the real call on top of it.)
//
// THE ONE THING THIS REPLACEMENT MUST NOT DO (M2, fix round 2026-09-01):
// `params.bodySha256` MUST be forwarded to `p_body_sha256` VERBATIM, exactly
// as the caller supplied it — never recomputed, never re-read from a fresh
// `clara.dpa_documents` select inside this function. `params.bodySha256` is
// the hash of the exact bytes `signup-dpa-form.tsx` rendered to the person
// (see that file's own `handleSign` comment); the design's OWN point
// (checkout-gate-design-part2.md §1.1: "that last wall is the one that
// matters") is that `sign_dpa` re-validates that submitted hash against the
// row's CURRENT value and refuses CLR10 on a mismatch — e.g. the document was
// superseded between render and click. Recomputing the hash here from a
// fresh read would make the door agree with itself unconditionally and
// silently delete the only thing binding a signature to the bytes the signer
// actually saw. If a fresh read is added for some OTHER reason, its hash
// must never replace `params.bodySha256` in the argument sent to the door.
//
// Nothing in `signup-dpa-form.tsx` needs to change beyond removing its own
// "seam" framing: the component already renders whatever this function
// returns, and it already threads the shown document's own hash through
// (`DpaDocumentState.ready.bodySha256`, from `dpa-server-reads.ts`).

export type SignDpaParams = {
  readonly version: string;
  readonly bodySha256: string;
  /** Minted and held by the CALLER (`signup-dpa-form.tsx`'s `useRef`), never
   *  by this function — see the header's item A for why re-minting per call
   *  would be the wrong fix even though it type-checks. */
  readonly opKey: string;
};

// NOTE FOR THE SEAM↔DOOR COMPLETION TABLE (PR #488): `sign_dpa`'s real
// success/replay carries `{signature_id, signed_at, replay}` (survey F6);
// the bare `"signed"` below drops all three. THIS IS A LAWFUL DECISION
// TODAY, NOT A DEFECT (fs4-pr488-review, round 3) — the rule that tells
// this case apart from M1/M2/A: a dropped PARAM is a defect by default
// (the door refuses without it, silently and unrecoverably — sign_dpa's own
// `op_key is required` -> CLR10 is exactly that shape, which is why A was a
// fix); a dropped RETURN FIELD is a decision by default (the call still
// succeeds, `{kind:"signed"}` is true whether the door minted a fresh
// signature or replayed one, so nothing is fabricated, and widening the
// return later is additive and compile-checked at every consumer the
// moment one exists). `signup-dpa-form.tsx` has no next step to route a
// real signature to yet (its own header: "there is no built checkout to
// send anyone to"), so inventing fields nothing here reads would be shape
// ahead of need.
//
// THE KNOWN WIDENING, named so it is not rediscovered: `replay` is the
// field that will matter FIRST. The moment a receipt surface exists,
// "you signed this on <date>" versus a bare "signed" becomes a real
// distinction, and `signature_id`/`signed_at` are the evidence this
// estate's receipt discipline will want. Lane B widens this arm when that
// receipt surface is built — not before.
export type SignDpaOutcome =
  | { readonly kind: "signed" }
  | { readonly kind: "unavailable" };

export type SignDpa = (params: SignDpaParams) => Promise<SignDpaOutcome>;

/** THE PRODUCTION DEFAULT. See this module's header. */
export const signDpa: SignDpa = async () => ({ kind: "unavailable" });
