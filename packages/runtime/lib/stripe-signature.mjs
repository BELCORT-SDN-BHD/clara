// FS-4 C-5 — STRIPE WEBHOOK SIGNATURE VERIFICATION, implemented against the published scheme.
//
// WHY THIS IS NOT `stripe.webhooks.constructEvent`. The work order asked for the official
// `stripe` Node SDK. It is not installable on this lane and the reason is mechanical, not a
// preference: `stripe` appears in NO package.json in this workspace, in no `pnpm-lock.yaml`
// entry (measured: `grep -c stripe pnpm-lock.yaml` = 0) and in no store leaf under
// `node_modules/.pnpm`. Adding it needs `pnpm install`, which every lane brief in this sprint
// forbids outright — every worktree JUNCTIONS the main checkout's `node_modules`, so a
// mid-install store takes every concurrent lane's build and tests down with it. The honest
// options were (a) ship nothing, or (b) implement the documented scheme in ~60 lines against
// `node:crypto`. This is (b), and the PR body records it as a deviation so the reviewer judges
// the substitution rather than discovering it.
//
// THE SCHEME, read from Stripe's own "Verify webhook signatures manually" documentation
// (docs.stripe.com/webhooks, retrieved 2026-09-02 through the Stripe docs MCP, not from
// memory):
//
//   Stripe-Signature: t=1492774577,v1=5257a869…,v0=6ffbb59b…
//
//   1. Split on ",", then on "=", into prefix/value pairs. `t` is the timestamp; `v1` is the
//      signature (there may be SEVERAL during a secret roll — up to 24h of overlap).
//   2. signed_payload = `${t}` + "." + the RAW request body, byte for byte.
//   3. expected = HMAC-SHA256(secret, signed_payload), hex.
//   4. Compare in CONSTANT TIME against each received v1, and check the timestamp age against
//      a tolerance.
//
// "IGNORE ALL SCHEMES THAT ARE NOT v1" IS A WALL, NOT TIDINESS. Stripe's own text gives the
// reason — downgrade attacks. It also sends a FAKE `v0` on test events, so a verifier that
// accepted any scheme it recognised would accept a value that proves nothing. `v0` is
// discarded here by construction: nothing but the literal `v1` key is ever collected.
//
// THE TOLERANCE IS ONE-SIDED, DELIBERATELY, AND IT MATCHES THE SDK. `stripe-node` rejects an
// event whose timestamp is more than `tolerance` seconds OLD and says nothing about one in the
// future. That asymmetry is right: the tolerance exists to stop a captured payload being
// replayed later, and a captured payload always carries a PAST timestamp. A future-dated event
// still has to carry a valid HMAC, which an attacker without the secret cannot produce, and
// rejecting on forward clock skew would drop legitimate events for no gain. Being stricter than
// the reference implementation on a surface whose failure mode is "a paying customer's firm
// never opens" is the wrong trade.
//
// THE RAW BYTES ARE THE SUBJECT. This module takes a Buffer and hashes it unmodified. Any
// re-serialisation — `JSON.parse` then `JSON.stringify`, a body parser's whitespace or key
// reordering — changes the bytes and the signature will not match. That is why the router
// mounts before `express.json()`; see `src/stripeRoutes.ts`.

import { createHmac, timingSafeEqual } from "node:crypto";

/** Stripe's own default in every official library. Seconds. */
export const DEFAULT_TOLERANCE_SECONDS = 300;

/** A typed verification failure. `code` is a short stable token for the log line; the MESSAGE
 *  is never surfaced to the caller (a 400 body that explains WHY is an oracle for a forger). */
export class StripeSignatureError extends Error {
  constructor(code, message) {
    super(message || code);
    this.name = "StripeSignatureError";
    this.code = code;
  }
}

/**
 * Split the header into its timestamp and its v1 signatures.
 *
 * A malformed element is SKIPPED rather than fatal — the header is an extensible list and
 * Stripe already sends at least one scheme (`v0`) this verifier must not understand. What is
 * fatal is the absence of the two things the scheme needs: a whole-number `t` and at least one
 * `v1`.
 *
 * @param {string|undefined|null} header the raw `Stripe-Signature` value
 * @returns {{timestamp: number, signatures: string[]}}
 */
export function parseStripeSignatureHeader(header) {
  if (typeof header !== "string" || header.trim() === "") {
    throw new StripeSignatureError("signature_header_absent", "no Stripe-Signature header");
  }
  let timestamp = null;
  const signatures = [];
  for (const element of header.split(",")) {
    const idx = element.indexOf("=");
    if (idx <= 0) continue;
    const prefix = element.slice(0, idx).trim();
    const value = element.slice(idx + 1).trim();
    if (prefix === "t") {
      // Parsed from the TEXT: `Number("0x10")` is 16 and `Number("1e9")` is a billion, so a
      // coercion-only read admits shapes Stripe never sends.
      if (/^[0-9]+$/.test(value)) timestamp = Number(value);
    } else if (prefix === "v1") {
      // Hex only. A non-hex value can never equal a hex digest, but rejecting it here keeps the
      // constant-time compare below operating on two buffers of a known encoding.
      if (/^[0-9a-fA-F]+$/.test(value)) signatures.push(value.toLowerCase());
    }
    // Every other scheme — `v0` included — is discarded. See the header: downgrade attacks.
  }
  if (timestamp === null || !Number.isSafeInteger(timestamp)) {
    throw new StripeSignatureError("signature_timestamp_absent", "no usable t= in Stripe-Signature");
  }
  if (signatures.length === 0) {
    throw new StripeSignatureError("signature_v1_absent", "no v1 signature in Stripe-Signature");
  }
  return { timestamp, signatures };
}

/**
 * HMAC-SHA256 over `${timestamp}.${rawBody}` with the endpoint secret as the key.
 * @param {string} secret the `whsec_…` endpoint signing secret
 * @param {number} timestamp
 * @param {Buffer|string} rawBody the EXACT bytes of the request body
 * @returns {string} lowercase hex
 */
export function computeStripeSignature(secret, timestamp, rawBody) {
  const body = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(String(rawBody), "utf8");
  return createHmac("sha256", secret)
    .update(`${timestamp}.`, "utf8")
    .update(body)
    .digest("hex");
}

/** Constant-time hex compare. Unequal lengths are unequal — and are compared away WITHOUT
 *  `timingSafeEqual`, which throws on a length mismatch rather than returning false. */
function hexEquals(a, b) {
  if (typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  const ba = Buffer.from(a, "hex");
  const bb = Buffer.from(b, "hex");
  if (ba.length !== bb.length || ba.length === 0) return false;
  return timingSafeEqual(ba, bb);
}

/**
 * Verify a Stripe webhook signature. Throws `StripeSignatureError` on ANY failure; returns the
 * accepted timestamp on success. It NEVER parses the body and NEVER returns it — the caller
 * decides what to do with bytes this function has blessed.
 *
 * @param {{rawBody: Buffer|string, header: string|undefined, secret: string|undefined,
 *          toleranceSeconds?: number, nowMs?: number}} args
 * @returns {{timestamp: number}}
 */
export function verifyStripeSignature({ rawBody, header, secret, toleranceSeconds = DEFAULT_TOLERANCE_SECONDS, nowMs = Date.now() }) {
  // FAIL CLOSED on a missing secret. An earlier shape of this route (Stripe's own quickstart
  // sample, and it is worth naming because it is the sample a build lane copies) skips
  // verification entirely when the secret is unset and trusts `JSON.parse` instead. On this
  // surface that would make an unconfigured deployment accept forged events that mint firms.
  if (typeof secret !== "string" || secret.trim() === "") {
    throw new StripeSignatureError("signing_secret_absent", "STRIPE_WEBHOOK_SECRET is not configured");
  }
  const { timestamp, signatures } = parseStripeSignatureHeader(header);
  const ageSeconds = Math.floor(nowMs / 1000) - timestamp;
  if (ageSeconds > toleranceSeconds) {
    throw new StripeSignatureError("signature_timestamp_stale", "the signature timestamp is outside the tolerance");
  }
  const expected = computeStripeSignature(secret, timestamp, rawBody);
  // EVERY candidate is compared, never short-circuited on the first match, so a rolled secret's
  // second signature is honoured. `some` would also work; the loop is written out so the
  // "compare against all of them" property is visible rather than idiomatic.
  let matched = false;
  for (const candidate of signatures) {
    if (hexEquals(expected, candidate)) matched = true;
  }
  if (!matched) {
    throw new StripeSignatureError("signature_mismatch", "no signature matched the expected value");
  }
  return { timestamp };
}

/**
 * Mint a signed `Stripe-Signature` header over a payload — the local equivalent of the SDK's
 * `Stripe.webhooks.generateTestHeaderString`, and the reason this file can be tested at all
 * without the SDK or a network round trip.
 *
 * TEST INSTRUMENT, AND IT IS NOT A BACK DOOR. It computes exactly what `computeStripeSignature`
 * computes, so it cannot mint a header the verifier would accept unless the caller already
 * holds the secret — which is the whole security property. It lives beside the verifier rather
 * than in a test file so a cell can mutate the VERIFIER and watch the cell redden, instead of
 * mutating a second private copy of the same arithmetic and proving nothing.
 *
 * @param {{payload: Buffer|string, secret: string, timestamp?: number, scheme?: string,
 *          signature?: string}} args
 * @returns {string}
 */
export function generateTestHeaderString({ payload, secret, timestamp = Math.floor(Date.now() / 1000), scheme = "v1", signature = null }) {
  const sig = signature ?? computeStripeSignature(secret, timestamp, payload);
  return `t=${timestamp},${scheme}=${sig}`;
}
