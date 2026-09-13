// THE OPERATOR CONSOLE'S OPERATION IDENTITIES (#615) — one module, because both surfaces that mint
// one need the same guarantee and a second digest would be a second thing to get wrong.
//
// WHY THE KEY IS DETERMINISTIC. `clara._reserve_op` keys replay on `(firm, fn, op_key)` and re-hashes
// the arguments (0004:46-60), so a lost response replays the ORIGINAL receipt only if the retry
// carries the SAME key. A fresh random key per attempt is exactly what defeats that contract: the
// retry finds no receipt, re-enters the body, and meets a spurious refusal (a registration that is
// no longer open, a problem already resolved) instead of the answer the first call actually got.
// Every key below is therefore a PURE function of its inputs — no cache to keep, prune, or forget.
//
// WHY THE DIGEST IS SHA-256 AND NOT A SHORT NON-CRYPTOGRAPHIC HASH. The digest needs no
// cryptographic property — this is a client-side dedupe key, and `_reserve_op`'s own stored
// `request_hash` is the real wall. What it needs is to NOT COLLIDE, and the failure mode of a
// collision is the sharp part: two different argument sets sharing one key means the second is
// refused `op_key_conflict`, and because the key is deterministic there is no way for the person to
// pick a different one — that exact change becomes permanently unsubmittable. A 32-bit hash was the
// first cut here and it collides in practice (measured: FNV-1a 32 maps both "declinate" and
// "macallums" to the same value, at the same length, so carrying the length alongside it does not
// help). Web Crypto's SHA-256 is native in every target browser and in `node --test`, needs no
// dependency, and removes the class.

/** SHA-256 of `input`, hex. Internal: both key builders below go through it, so there is exactly one
 *  digest in this console. */
async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** The op key for one case-scoped act. The SAME (verb, case, caller, text) always reproduces the
 *  SAME key — an A/A retry replays with no cache to remember it — while a genuinely edited text
 *  always reproduces a different one, which matters because `reject_firm_registration`'s own request
 *  hash binds the reason (0145:850-851) and `resolve_stripe_event_problem`'s binds the resolution
 *  (0160 §5): an edited text is a DIFFERENT operation and must not collide with the first.
 *
 *  `callerId` is folded in because `_reserve_op` is scoped only by `(firm, fn, op_key)` — the actor
 *  lives inside the re-hashed arguments, never in the reservation's identity — so a key derived from
 *  the case alone would collide across two operator-firm owners racing one case, and the second
 *  would meet `op_key_conflict` instead of the honest CLR09 a second decider should see. */
export async function supportOpKey(
  verb: "approve" | "reject" | "resolve",
  caseId: string,
  callerId: string,
  text?: string,
): Promise<string> {
  if (text === undefined) return `op-${verb}-${caseId}-${callerId}`;
  const digest = await sha256Hex(text);
  return `op-${verb}-${caseId}-${callerId}-${digest.slice(0, 16)}`;
}

/** The op key for one admission-capacity change. Binds the VALUE and the reason, because
 *  `clara.set_admission_capacity` re-hashes `{max_firms, reason, actor}` (0186 §C): a key that
 *  ignored either would meet `op_key_conflict` instead of replaying.
 *
 *  `null` (unlimited) and `0` (admission closed) are SPELLED DIFFERENTLY on purpose — they are
 *  different policies and must never share an operation identity. */
export async function capacityOpKey(
  callerId: string,
  maxFirms: number | null,
  reason: string,
): Promise<string> {
  const digest = await sha256Hex(reason);
  return `op-capacity-${callerId}-${maxFirms === null ? "unlimited" : maxFirms}-${digest.slice(0, 16)}`;
}
