// Cells for `apps/web`'s half of the trusted-client-IP courier. The three
// pins this module's own header promises: known-answer digest vectors, IP
// parser parity against `node:net`, and the multi-value last-entry rule —
// plus both fail-closed halves, each with the mutant that reds it.
//
// `node:net` is imported HERE and nowhere in production code: the test runner
// is Node, the app is a Worker. That asymmetry is the whole point of pin 2 —
// it lets the suite hold this module's hand-rolled validator against the exact
// function the runtime's copy uses, without dragging `node:net` into the
// Workers build.

import { test } from "node:test";
import assert from "node:assert/strict";
import { isIP } from "node:net";

import {
  AUTH_WALL_CLIENT_IP_HEADER,
  DIGEST_BYTES,
  PEPPER_VAR,
  TRUSTED_HEADER_VAR,
  byteaLiteral,
  isIpLiteral,
  originDigestArgFrom,
  pepperedDigestHex,
  proxyObservedClientIp,
  trustedClientIpHeaderName,
} from "./courier";

const PEPPER = "lane-b-fixed-test-pepper";
const ENV = { [TRUSTED_HEADER_VAR]: "CF-Connecting-IP", [PEPPER_VAR]: PEPPER };

const headers = (bag: Record<string, string>) => (name: string) => bag[name.toLowerCase()];

// ---------------------------------------------------------------------------
// PIN 1 — known-answer vectors. Reproducible from first principles:
//   node -e "const{createHash}=require('node:crypto');
//            console.log(createHash('sha256').update(PEPPER).update(V).digest('hex'))"
// Any implementation producing these agrees with any other that does, which is
// the only property the two limbs actually need.
// ---------------------------------------------------------------------------
const VECTORS: ReadonlyArray<readonly [string, string]> = [
  ["203.0.113.7", "d19b90c929c64fe2063899233735599d0c46a4fb1f4e6781593b364b7704c60a"],
  ["2001:db8::1", "21c62bf79941c184ef1ed3bb31e774c3c1db9efb44d13b4d78d3fe6b54881e90"],
  // The email limb's own spelling (`sha256(pepper ‖ lower(email))`) rides the
  // same primitive — the runtime computes it, but a vector here pins that the
  // primitive is the same one, so a future apps/web caller cannot drift.
  ["applicant@example.test", "55eebeb51b47cfb7b123c093dccc694df22a9acde43359b01a39f17c9e3ee8a0"],
];

test("PIN 1 — sha256(pepper ‖ value) matches the fixed vectors, 32 bytes each", async () => {
  for (const [value, expected] of VECTORS) {
    const hex = await pepperedDigestHex(value, ENV);
    assert.equal(hex, expected, `digest drifted for ${value}`);
    assert.equal((hex as string).length, DIGEST_BYTES * 2);
  }
});

test("PIN 1b — the bytea wire spelling is the \\x-prefixed hex the doors parse", async () => {
  const arg = await originDigestArgFrom(headers({ "cf-connecting-ip": "203.0.113.7" }), ENV);
  assert.equal(arg, byteaLiteral(VECTORS[0]![1]));
  assert.equal(arg?.startsWith("\\x"), true);
  // 32 bytes on the wire, not 64 — what `octet_length(...) <> 32` measures.
  assert.equal((arg as string).length - 2, DIGEST_BYTES * 2);
});

// ---------------------------------------------------------------------------
// PIN 2 — IP-parser parity with `node:net`'s `isIP`, which is what
// `packages/runtime/lib/rate-wall-courier.mjs` validates with. A disagreement
// on any row is a split wall: one limb counting an address the other drops.
// ---------------------------------------------------------------------------
const ADDRESS_TABLE: readonly string[] = [
  // ordinary
  "203.0.113.7", "0.0.0.0", "255.255.255.255", "10.0.0.1",
  // IPv4 shapes a loose regex gets wrong
  "01.2.3.4", "1.2.3.4.5", "1.2.3", "256.1.1.1", "1.2.3.-1", "1.2.3.4 ", " 1.2.3.4",
  "1.2.3.04", "1..2.3", "",
  // IPv6, ordinary and compressed
  "2001:db8::1", "::1", "::", "fe80::1", "2001:0db8:0000:0000:0000:0000:0000:0001",
  "2001:db8:0:0:0:0:2:1",
  // IPv6 with a trailing dotted quad
  "::ffff:1.2.3.4", "::ffff:192.168.0.1", "64:ff9b::1.2.3.4", "::ffff:1.2.3",
  // IPv6 shapes a loose regex gets wrong
  "2001:db8::1::2", "12345::1", "2001:db8:::1", ":2001:db8::1", "2001:db8::1:",
  "g001:db8::1",
  // ZONE IDS — the row that reddened this pin on the first cut (the module's
  // comment claimed `isIP` refused them; it does not). The charset was
  // enumerated over printable ASCII, so these rows carry both verdicts.
  "fe80::1%eth0", "fe80::1%0", "::1%lo", "fe80::%eth0", "::ffff:1.2.3.4%eth0",
  "fe80::1%a:b", "fe80::1%25eth0", "fe80::1%.", "fe80::1%-",
  "fe80::1%", "fe80::1%_x", "fe80::1%eth 0", "fe80::1%eth0%x", "%eth0",
  "1.2.3.4%eth0", "fe80::1%eth0!", "fe80::1%a+b",
  "2001:0db8:0000:0000:0000:0000:0000:0001:0002",
  // punctuation-only and near misses
  ":", ":::", "1:2:3:4:5:6:7:8", "1:2:3:4:5:6:7:8:9", "1:2:3:4:5:6:7",
];

test("PIN 2 — the validator agrees with node:net's isIP on every row", () => {
  const disagreements = ADDRESS_TABLE.filter(
    (candidate) => isIpLiteral(candidate) !== (isIP(candidate) !== 0),
  );
  assert.deepEqual(
    disagreements,
    [],
    "this validator and node:net's isIP classify these differently — the two rate-wall " +
      "limbs would key on different populations, which is the wall split in two",
  );
});

test("PIN 2 CONTROL — the table is not vacuous: it holds both verdicts", () => {
  const accepted = ADDRESS_TABLE.filter((c) => isIpLiteral(c));
  const refused = ADDRESS_TABLE.filter((c) => !isIpLiteral(c));
  assert.ok(accepted.length >= 12, `only ${accepted.length} rows are accepted`);
  assert.ok(refused.length >= 12, `only ${refused.length} rows are refused`);
});

// ---------------------------------------------------------------------------
// PIN 3 — the multi-value rule. The FIRST entry of an `X-Forwarded-For` list
// is attacker-chosen; each proxy APPENDS what it observed, so the LAST entry
// is the one written by the hop nearest us. Taking the first would hand an
// attacker a fresh rate-wall budget per forged address.
// ---------------------------------------------------------------------------
test("PIN 3 — a list takes the LAST entry, never the client-claimed first", () => {
  const read = headers({ "cf-connecting-ip": "1.2.3.4, 198.51.100.9, 203.0.113.7" });
  assert.equal(proxyObservedClientIp(read, ENV), "203.0.113.7");
});

test("PIN 3b — a bracketed IPv6, with and without a port, and a ported IPv4", () => {
  const at = (v: string) => proxyObservedClientIp(headers({ "cf-connecting-ip": v }), ENV);
  assert.equal(at("[2001:db8::1]:443"), "2001:db8::1");
  assert.equal(at("[2001:db8::1]"), "2001:db8::1");
  assert.equal(at("203.0.113.7:41234"), "203.0.113.7");
  // A BARE IPv6 keeps every colon — stripping a "port" here would corrupt the
  // address into a different (or invalid) one, and silently re-key the wall.
  assert.equal(at("2001:db8::1"), "2001:db8::1");
});

// ---------------------------------------------------------------------------
// FAIL-CLOSED, BOTH HALVES. Each of these is the design's "absent ⇒ checkout
// refuses" (part 3 §3), and each is the arm a wrong implementation would fill
// with a constant.
// ---------------------------------------------------------------------------
test("FAIL CLOSED — no configured header name ⇒ no address and no digest", async () => {
  const env = { [PEPPER_VAR]: PEPPER };
  const read = headers({ "cf-connecting-ip": "203.0.113.7" });
  assert.equal(trustedClientIpHeaderName(env), null);
  assert.equal(proxyObservedClientIp(read, env), null);
  assert.equal(await originDigestArgFrom(read, env), null);
});

test("FAIL CLOSED — a blank configured header name is unset, not the empty header", () => {
  assert.equal(trustedClientIpHeaderName({ [TRUSTED_HEADER_VAR]: "   " }), null);
});

test("FAIL CLOSED — no pepper ⇒ no digest, even with a perfectly good address", async () => {
  const env = { [TRUSTED_HEADER_VAR]: "CF-Connecting-IP" };
  const read = headers({ "cf-connecting-ip": "203.0.113.7" });
  assert.equal(proxyObservedClientIp(read, env), "203.0.113.7");
  assert.equal(await pepperedDigestHex("203.0.113.7", env), null);
  assert.equal(await originDigestArgFrom(read, env), null);
});

test("FAIL CLOSED — a blank pepper is unset, never the empty string", async () => {
  const env = { [TRUSTED_HEADER_VAR]: "CF-Connecting-IP", [PEPPER_VAR]: "  " };
  assert.equal(await pepperedDigestHex("203.0.113.7", env), null);
});

test("FAIL CLOSED — an absent, blank or unparseable header ⇒ no digest", async () => {
  for (const bag of [{} as Record<string,string>, { "cf-connecting-ip": "" }, { "cf-connecting-ip": "not-an-ip" },
    { "cf-connecting-ip": " , , " }, { "cf-connecting-ip": "1.2.3.4, banana" }]) {
    assert.equal(await originDigestArgFrom(headers(bag), ENV), null, JSON.stringify(bag));
  }
});

test("THE HEADER THIS APP SETS toward the runtime is one fixed lower-case name", () => {
  // A constant, not a fourth env var — see the module header. Pinned because
  // C-5's `CLARA_TRUSTED_CLIENT_IP_HEADER` must be set to this exact string on
  // the runtime side, and a silent rename here answers 503 for every applicant.
  assert.equal(AUTH_WALL_CLIENT_IP_HEADER, "x-clara-client-ip");
  assert.equal(AUTH_WALL_CLIENT_IP_HEADER, AUTH_WALL_CLIENT_IP_HEADER.toLowerCase());
});

test("THE HEADER READ IS CASE-INSENSITIVE — configuration spells it as it likes", () => {
  const read = headers({ "cf-connecting-ip": "203.0.113.7" });
  for (const spelling of ["CF-Connecting-IP", "cf-connecting-ip", "Cf-CONNECTING-Ip"]) {
    assert.equal(proxyObservedClientIp(read, { [TRUSTED_HEADER_VAR]: spelling }), "203.0.113.7");
  }
});
