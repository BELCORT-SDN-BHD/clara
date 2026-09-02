// FS-4 C-6 Lane B — `apps/web`'s HALF OF THE TRUSTED-CLIENT-IP COURIER
// (裁-64① · checkout-gate-design part 1 §4 option B · part 3 §3 · 裁-107 M1).
//
// TWO LIMBS, ONE FACT. The rate wall keys on `sha256(pepper ‖ proxy-observed
// client IP)` — one value PER ADDRESS. Two surfaces need it and they need it
// in DIFFERENT forms:
//
//   · `POST /checkout` calls `clara.open_checkout_intent(uuid, bytea, text)`
//     itself, so it needs THE DIGEST, as PostgREST's `bytea` wire spelling.
//   · the confirm verify POST calls the runtime's `POST /api/auth-wall/confirm`,
//     which computes its OWN digest with its OWN copy of the pepper — so this
//     app forwards THE ADDRESS, under a header the runtime is configured to
//     read. (`apps/web` sits between the browser and the runtime, so the
//     address the runtime observes on the socket is `apps/web`'s, not the
//     applicant's. C-5's deploy notes say exactly this.)
//
// SO WHY IS THE DIGEST HERE AT ALL, AND NOT ONLY IN THE RUNTIME? Because
// `open_checkout_intent` is a `clara_authenticated` door and no runtime role
// can reach it — measured on the rig by C-5 (#511's "What is NOT here"
// section: `clara.open_checkout_intent(uuid,bytea,text) runtime=false
// authenticated=true`, and `extraction-slice-0022-postverify.sql:165-167`
// RAISES if any machine login could `SET ROLE clara_authenticated`). The
// checkout door can only be called by the person's own session token, which
// only `apps/web` holds. Design part 3 §3 puts `CLARA_RATE_WALL_PEPPER` in
// `apps/web` for exactly this reason ("M3: it sits with its READER").
//
// ============================================================================
// BYTE-IDENTITY WITH THE RUNTIME'S COPY — HOW IT IS PROVEN, NOT ASSERTED
// ============================================================================
// The two limbs MUST agree byte for byte or the wall silently splits in two:
// the confirm limb and the checkout limb would count different populations
// under names that read the same. `packages/runtime/lib/rate-wall-courier.mjs`
// is the other copy. It is NOT importable here — that package targets Node and
// this app builds for Cloudflare Workers through OpenNext (`node:net` and
// `node:crypto` are not in this app's production import graph; `grep -rn
// 'from "node:' apps/web/app apps/web/lib apps/web/components` finds only test
// files). So this is a second implementation, and it is PINNED three ways in
// `./courier.test.ts`:
//
//   1. KNOWN-ANSWER VECTORS. `sha256(pepper ‖ value)` is reproducible from
//      first principles; the test pins exact hex for fixed inputs. Any
//      implementation that produces those vectors agrees with any other that
//      does — which is the only property that actually matters.
//   2. IP-PARSER PARITY AGAINST `node:net`. The runtime validates with
//      `isIP()`. Tests run under Node, so the suite drives THIS module's
//      validator and `node:net`'s `isIP` over one table of addresses and
//      asserts they agree on every row — including the shapes a hand-rolled
//      regex classically gets wrong (`::ffff:1.2.3.4`, `1.2.3.4.5`,
//      `01.2.3.4`, a zone id). A disagreement is a digest split.
//   3. THE MULTI-VALUE RULE. `X-Forwarded-For` is a LIST and the entries are
//      not equally trustworthy: the FIRST is whatever the original client
//      claimed (attacker-chosen — one forged address per guess is the wall
//      deleted), and each proxy APPENDS what it actually observed, so the LAST
//      entry is the one written by the hop nearest us. Same rule, same cell.
//
// FAIL CLOSED, IN EVERY HALF, AND IT IS NOT A DEFAULT. No configured header
// name ⇒ no address. No pepper ⇒ no digest. A header present but not carrying
// a parseable IP literal ⇒ no address. Design part 3 §3: "absent ⇒ checkout
// refuses". The alternative — a constant, a placeholder, the socket peer, the
// `Origin` header — is the M1 defect in a new costume: ONE shared value for
// the whole deployment, so five rejected guesses from anyone lock out every
// applicant at once. PR #488 paid for that finding already.
//
// NOTHING HERE READS `Origin` OR `Referer`, and nothing here logs or returns
// the pepper or the address. The address is used to compute a digest and is
// forwarded on exactly one server-to-server hop; it is never persisted, never
// rendered, and never sent to the browser.

/** The env var naming the ONE header this app's own edge sets. On Cloudflare
 *  that is `CF-Connecting-IP` (design part 1 §4.1). */
export const TRUSTED_HEADER_VAR = "CLARA_TRUSTED_CLIENT_IP_HEADER";

/** The env var holding the shared pepper. NEVER logged, never returned. */
export const PEPPER_VAR = "CLARA_RATE_WALL_PEPPER";

/** Both doors raise `CLR10 a digest is required` on any other length
 *  (`0161`'s `open_checkout_intent` and `claim_confirmation_attempt` each
 *  check `octet_length(...) <> 32`). */
export const DIGEST_BYTES = 32;

/**
 * The header name `apps/web` SETS on its server-to-server call to the
 * runtime's auth wall, carrying the address this app's own edge observed.
 *
 * A CONSTANT, DELIBERATELY, RATHER THAN A FOURTH ENV VAR. The runtime reads
 * whatever `CLARA_TRUSTED_CLIENT_IP_HEADER` names on ITS side; if this app
 * also read the name from configuration, the two could be set to different
 * strings and the runtime would answer 503 `origin_digest_unavailable` for
 * every applicant with nothing in either app's own configuration looking
 * wrong. One fixed spelling on the sending side leaves exactly one value to
 * get right, in one place, and C-5's deploy notes already name this exact
 * string as the value to configure there.
 */
export const AUTH_WALL_CLIENT_IP_HEADER = "x-clara-client-ip";

export type HeaderReader = (name: string) => string | null | undefined;

/** The configured header NAME, lower-cased, or null when unset/blank. */
export function trustedClientIpHeaderName(
  env: Record<string, string | undefined> = process.env,
): string | null {
  const raw = env[TRUSTED_HEADER_VAR];
  if (typeof raw !== "string") return null;
  const name = raw.trim().toLowerCase();
  return name === "" ? null : name;
}

function pepper(env: Record<string, string | undefined>): string | null {
  const raw = env[PEPPER_VAR];
  if (typeof raw !== "string") return null;
  return raw.trim() === "" ? null : raw;
}

const IPV4 = /^(?:(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)\.){3}(?:25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)$/;

/**
 * Is this string an IP literal? Agrees with `node:net`'s `isIP` — pin 2 in
 * this module's header drives both over one table and asserts row-by-row
 * equality, because a disagreement here splits the wall's two limbs.
 *
 * The IPv4 arm rejects a leading zero (`01.2.3.4`), which matters: some
 * resolvers read a leading-zero octet as octal, so accepting it would let one
 * address be spelled several ways and carry several rate-wall budgets.
 *
 * The IPv6 arm implements the grammar rather than approximating it: at most
 * one `::`, at most 8 groups of 1–4 hex digits, and an optional trailing
 * dotted-quad that consumes two groups (`::ffff:1.2.3.4`).
 *
 * A ZONE ID (`fe80::1%eth0`) IS ACCEPTED, and the first cut of this file had
 * it backwards. The comment here used to say "`isIP` refuses it too" — that
 * was an assertion, not a measurement, and pin 2 reddened on it immediately.
 * MEASURED on the runner (Node v20.19.5): `isIP("fe80::1%eth0")` is 6,
 * `isIP("1.2.3.4%eth0")` is 0, an empty zone is 0, and the accepted zone
 * charset is exactly `[-.0-9:A-Za-z]+` (enumerated over printable ASCII —
 * `_`, whitespace and every other punctuation mark are refused). This arm
 * matches that, because PARITY is the load-bearing property, not this
 * module's private opinion about zones: if the runtime's `isIP` accepts an
 * address this one refuses, the confirm limb keys on a digest the checkout
 * limb never computes, and the wall is split.
 *
 * THE RESIDUAL, STATED: `fe80::1%eth0` and `fe80::1%eth1` digest differently,
 * so one host reachable under two zone spellings would carry two rate-wall
 * budgets. That is inherited from `isIP` and is bounded — a zone id names a
 * LOCAL interface, so an address carrying one cannot have been observed by a
 * public edge proxy as a remote client address in the first place.
 */
export function isIpLiteral(value: string): boolean {
  if (typeof value !== "string" || value === "") return false;
  if (IPV4.test(value)) return true;
  return isIpv6Literal(value);
}

const IPV6_ZONE = /^[-.0-9:A-Za-z]+$/;

function isIpv6Literal(value: string): boolean {
  const percent = value.indexOf("%");
  if (percent !== -1) {
    // Exactly one zone, non-empty, in the measured charset — and only on IPv6.
    const zone = value.slice(percent + 1);
    if (zone === "" || !IPV6_ZONE.test(zone)) return false;
    return isIpv6Literal(value.slice(0, percent));
  }
  const doubleColons = value.split("::").length - 1;
  if (doubleColons > 1) return false;
  const compressed = doubleColons === 1;
  if (!compressed && (value.startsWith(":") || value.endsWith(":"))) return false;
  // `::` at either end leaves an empty side; normalise both sides to group lists.
  const [headRaw, tailRaw] = compressed ? value.split("::") : [value, null];
  const head = headRaw === "" ? [] : headRaw.split(":");
  const tail = tailRaw === undefined || tailRaw === null || tailRaw === "" ? [] : tailRaw.split(":");
  const groups = [...head, ...tail];
  if (groups.some((g) => g === "")) return false;

  // A trailing dotted quad is allowed, and consumes TWO of the eight groups.
  let hexGroups = groups;
  let consumed = 0;
  const last = groups[groups.length - 1];
  if (last !== undefined && last.includes(".")) {
    if (!IPV4.test(last)) return false;
    hexGroups = groups.slice(0, -1);
    consumed = 2;
  }
  if (hexGroups.some((g) => !/^[0-9a-fA-F]{1,4}$/.test(g))) return false;

  const total = hexGroups.length + consumed;
  return compressed ? total <= 7 : total === 8;
}

/**
 * Read the proxy-observed client address out of a header bag.
 *
 * Returns a validated IP literal, or null (fail closed) when the header name
 * is unconfigured, the header is absent or blank, or the value does not parse.
 */
export function proxyObservedClientIp(
  readHeader: HeaderReader,
  env: Record<string, string | undefined> = process.env,
): string | null {
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
  let candidate = parts[parts.length - 1] as string;
  // An IPv6 literal in a Forwarded-style list may be bracketed, with or
  // without a port.
  const bracketed = /^\[(.+)\](?::\d+)?$/.exec(candidate);
  if (bracketed?.[1] !== undefined) candidate = bracketed[1];
  // A bare IPv4 with a port. NEVER stripped from a bare IPv6, whose colons
  // are the address itself.
  else if (/^\d{1,3}(?:\.\d{1,3}){3}:\d+$/.test(candidate)) {
    candidate = candidate.slice(0, candidate.lastIndexOf(":"));
  }
  return isIpLiteral(candidate) ? candidate : null;
}

function toHex(bytes: Uint8Array): string {
  let out = "";
  for (const b of bytes) out += b.toString(16).padStart(2, "0");
  return out;
}

/**
 * `sha256(pepper ‖ value)` as lowercase hex, or null when the pepper is unset
 * (fail closed).
 *
 * WEB CRYPTO, NOT `node:crypto` — this module is in the Cloudflare Workers
 * production graph. `crypto.subtle` is available in Workers and in Node ≥ 18,
 * so the same code runs in the app and under the test runner; the runtime's
 * copy uses `createHash("sha256").update(pepper).update(value)`, which is the
 * same bytes through a different API. The known-answer vectors are what prove
 * that, not this comment.
 */
export async function pepperedDigestHex(
  value: string,
  env: Record<string, string | undefined> = process.env,
): Promise<string | null> {
  const p = pepper(env);
  if (p === null || typeof value !== "string" || value === "") return null;
  const enc = new TextEncoder();
  const pepperBytes = enc.encode(p);
  const valueBytes = enc.encode(value);
  const joined = new Uint8Array(pepperBytes.length + valueBytes.length);
  joined.set(pepperBytes, 0);
  joined.set(valueBytes, pepperBytes.length);
  const digest = await crypto.subtle.digest("SHA-256", joined);
  return toHex(new Uint8Array(digest));
}

/**
 * PostgREST's wire spelling for a `bytea` argument: the `\x`-prefixed hex
 * text form, which Postgres' own `bytea` input function parses (the cluster
 * ships `bytea_output = hex`, and hex INPUT is accepted regardless of that
 * setting). `open_checkout_intent`'s `octet_length(p_origin_digest) <> 32`
 * check is what proves the round trip landed 32 bytes rather than 64
 * characters — cell `courier.pgrest` drives the real door on the rig.
 */
export function byteaLiteral(hex: string): string {
  return `\\x${hex}`;
}

/**
 * The C2/rate-wall key for a request: the digest of the proxy-observed client
 * address, already in PostgREST's `bytea` spelling — or null when ANY input
 * is missing (fail closed, all the way through).
 */
export async function originDigestArgFrom(
  readHeader: HeaderReader,
  env: Record<string, string | undefined> = process.env,
): Promise<string | null> {
  const ip = proxyObservedClientIp(readHeader, env);
  if (ip === null) return null;
  const hex = await pepperedDigestHex(ip, env);
  return hex === null ? null : byteaLiteral(hex);
}
