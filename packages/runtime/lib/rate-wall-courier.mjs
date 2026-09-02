// FS-4 C-5 — THE TRUSTED-CLIENT-IP COURIER (裁-64① · 裁-93 option B · 裁-107 M1).
//
// The rate wall's second limb keys on ONE FACT: `sha256(pepper ‖ proxy-observed client IP)`,
// one value PER ADDRESS. This module is the only thing in the runtime that computes it.
//
// M1 — WHY THIS EXISTS AT ALL, AND WHY IT IS NOT THE `Origin` HEADER. PR #488's adversarial leg
// found the seam feeding `proveSameOrigin`'s CSRF proof — the browser's `Origin` REQUEST HEADER
// — into the field meant to carry this digest. That header is IDENTICAL for every visitor to
// one deployment, so keying C2 on it would mean five rejected guesses from ANYONE lock out
// every applicant's signup, everywhere. `apps/web/app/(entry)/auth/confirm/verify/confirmation-wall.ts`
// records the finding at length and brands the type so a bare string cannot be assigned. This
// module never reads `Origin`, never reads `Referer`, and never reads the socket peer address:
// exactly one header name, supplied by configuration, and nothing else.
//
// FAIL CLOSED, IN BOTH HALVES, AND IT IS NOT A DEFAULT. Absent `CLARA_TRUSTED_CLIENT_IP_HEADER`
// ⇒ no digest. Absent `CLARA_RATE_WALL_PEPPER` ⇒ no digest. A header present but not carrying a
// parseable IP literal ⇒ no digest. A caller with no digest cannot claim an attempt at all
// (design part 3 §3: "absent ⇒ checkout refuses"), because the alternative — proceeding with a
// constant or a placeholder — is the M1 defect in a new costume: one shared value for the whole
// deployment, and a rate wall that locks everyone out together or nobody at all.
//
// WHICH ENTRY OF A MULTI-VALUED HEADER, AND WHY THE LAST. A single-valued header
// (`Fly-Client-IP`, `CF-Connecting-IP`, `True-Client-IP`) has one answer. `X-Forwarded-For` is a
// LIST, and the entries are not equally trustworthy: the FIRST is whatever the original client
// claimed and is therefore attacker-chosen — an attacker who sets
// `X-Forwarded-For: 1.2.3.4` gets a fresh rate-wall budget per forged address, which is the
// whole wall deleted. Each proxy APPENDS the address it actually observed, so the LAST entry is
// the one written by the hop nearest this process. This module takes the last non-empty entry
// and validates it as an IP literal. If the deployment ever puts more than one proxy in front
// of the runtime, the correct header is the single-valued one its own edge sets — the deploy
// notes say so, and this comment is why.
//
// THE DIGEST IS `sha256(pepper ‖ value)`, LITERALLY, BECAUSE THE DB SAYS SO. `0161`'s own
// comments on `open_checkout_intent` and `claim_confirmation_attempt` both read
// "sha256(pepper || proxy-observed client IP)", and part 3 §2.1 spells the email limb
// "sha256(pepper ‖ lower(email))". A plain hash of a concatenation is weaker than an HMAC —
// length extension is not exploitable here (nothing verifies a digest, the pepper is a prefix
// and the output is compared for equality only), but HMAC would still be the better primitive.
// Changing it is a DESIGN decision, not a build one: the two limbs must agree byte for byte
// with whatever `apps/web`'s own courier computes for `open_checkout_intent`, and a unilateral
// switch here would silently split the wall in two. Recorded in the PR body as an open question.

import { createHash } from "node:crypto";
import { isIP } from "node:net";

/**
 * The env var naming the ONE header this module reads.
 *
 * ITS DEPLOYED VALUE IS PINNED BY THE OTHER SIDE, and a mismatch 503s every confirmation rather
 * than failing quietly: `apps/web`'s Lane B (#517) sets `AUTH_WALL_CLIENT_IP_HEADER =
 * "x-clara-client-ip"` on its server-to-server call, so `CLARA_TRUSTED_CLIENT_IP_HEADER` must be
 * exactly `x-clara-client-ip` on the runtime. It is deliberately still a VARIABLE — the header a
 * deployment can trust is a deployment fact (`Fly-Client-IP`, `CF-Connecting-IP`, a bare
 * `X-Forwarded-For`), and hard-coding one would be the "a wall keyed on a client-settable header
 * is not a wall" trap design part 1 §4.1 names. The deploy notes carry the value; this comment
 * carries the coupling.
 */
export const TRUSTED_HEADER_VAR = "CLARA_TRUSTED_CLIENT_IP_HEADER";
export const PEPPER_VAR = "CLARA_RATE_WALL_PEPPER";
/** Both digests are exactly 32 bytes — `claim_confirmation_attempt` and `open_checkout_intent`
 *  each raise CLR10 `a digest is required` on any other length. */
export const DIGEST_BYTES = 32;

/** The configured header NAME, lower-cased, or null when unset/blank (fail closed). */
export function trustedClientIpHeaderName(env = process.env) {
  const raw = env[TRUSTED_HEADER_VAR];
  if (typeof raw !== "string") return null;
  const name = raw.trim().toLowerCase();
  return name === "" ? null : name;
}

/** The pepper, or null when unset/blank (fail closed). NEVER logged, never returned. */
function pepper(env = process.env) {
  const raw = env[PEPPER_VAR];
  if (typeof raw !== "string") return null;
  return raw.trim() === "" ? null : raw;
}

/**
 * Read the proxy-observed client address out of a header bag.
 *
 * @param {(name: string) => string|undefined|null} readHeader e.g. `(n) => req.header(n)`
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {string|null} a validated IP literal, or null (fail closed)
 */
export function proxyObservedClientIp(readHeader, env = process.env) {
  const name = trustedClientIpHeaderName(env);
  if (name === null) return null;
  const raw = readHeader(name);
  if (typeof raw !== "string" || raw.trim() === "") return null;
  const parts = raw
    .split(",")
    .map((p) => p.trim())
    .filter((p) => p !== "");
  if (parts.length === 0) return null;
  // The LAST entry — the hop nearest this process wrote it. See the header.
  let candidate = parts[parts.length - 1];
  // An IPv6 literal in a Forwarded-style list may be bracketed, with or without a port.
  const bracketed = /^\[(.+)\](?::\d+)?$/.exec(candidate);
  if (bracketed) candidate = bracketed[1];
  // A bare IPv4 with a port. Never stripped from a bare IPv6, whose colons are the address.
  else if (/^\d{1,3}(?:\.\d{1,3}){3}:\d+$/.test(candidate)) candidate = candidate.slice(0, candidate.lastIndexOf(":"));
  return isIP(candidate) === 0 ? null : candidate;
}

/**
 * `sha256(pepper ‖ value)` as a 32-byte Buffer, or null when the pepper is unset (fail closed).
 * @param {string} value
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {Buffer|null}
 */
export function pepperedDigest(value, env = process.env) {
  const p = pepper(env);
  if (p === null || typeof value !== "string" || value === "") return null;
  return createHash("sha256").update(p, "utf8").update(value, "utf8").digest();
}

/**
 * The C2 limb's key: the digest of the proxy-observed client address.
 * @returns {Buffer|null} 32 bytes, or null when ANY input is missing (fail closed)
 */
export function originDigestFrom(readHeader, env = process.env) {
  const ip = proxyObservedClientIp(readHeader, env);
  return ip === null ? null : pepperedDigest(ip, env);
}

/**
 * The C1 limb's key: `sha256(pepper ‖ lower(email))` (design part 3 §2.1 — "the ADDRESS never
 * lands, only its peppered digest"). Trimmed and lower-cased so `A@B.com ` and `a@b.com` are
 * one budget; an attacker who could split them by casing would get five guesses per spelling.
 * @param {string} email
 * @returns {Buffer|null}
 */
export function emailDigestFor(email, env = process.env) {
  if (typeof email !== "string") return null;
  const normalised = email.trim().toLowerCase();
  return normalised === "" ? null : pepperedDigest(normalised, env);
}
