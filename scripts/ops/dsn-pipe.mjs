#!/usr/bin/env node
// The ceremony DSN bridge (F-T4 item F / fix-queue-design.md §6).
//
//   <secret source> | node scripts/ops/dsn-pipe.mjs -- <command> [args...]
//
// Reads a Postgres DSN on STDIN — never argv, never a file — forces `sslmode=verify-full`
// AND `sslrootcert=<committed CA>` onto the DSN itself (not just the env; a DSN-level pin is
// what makes node-postgres treat the CA as EXCLUSIVE rather than merely additional — see the
// review note on withVerifyFull below), points PGSSLROOTCERT / NODE_EXTRA_CA_CERTS at the same
// committed pooler CA (ops/tls/pooler-ca.crt) for libpq-based tools, and spawns <command> with
// the DSN in the CHILD's environment only. The DSN is never written to disk, never logged, and
// never appears in any process's argv (this script's own or the child's) — it travels
// env-to-end exactly once, per hard constraint 4 and the ADR-0075 receipting law.
//
// Recipe of record: docs/plan/completed/wave-e-delta-ceremony-asrun.md:71-80 ("The
// connection mechanism"), made durable after two live ceremonies degraded to
// `sslmode=no-verify` because the prior dsn-pipe.mjs was session-local and gone
// (fix-queue-survey.md F20-F22).
//
// No dependencies — Node built-ins only.

import { spawn } from "node:child_process";
import { X509Certificate } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
/** Absolute path to the committed pooler CA, resolved from THIS file's location — never cwd. */
export const DEFAULT_CA_PATH = resolve(HERE, "..", "..", "ops", "tls", "pooler-ca.crt");

// Captured from the live pooler 2026-08-23 and independently confirmed byte-identical against
// Supabase's own publicly-hosted copy (https://supabase-downloads.s3-ap-southeast-1.amazonaws.com
// /prod/ssl/prod-ca-2021.crt, fetched over standard web PKI -- a channel independent of the
// pooler's own handshake). See docs/ops/dsn-bridge.md "CA provenance" for both readings. Pinning
// the exact fingerprint here means a swapped or corrupted ops/tls/pooler-ca.crt is refused at
// preflight rather than silently trusted -- rotate this constant in the SAME PR that replaces
// the .crt file (docs/ops/dsn-bridge.md "Rotation").
const EXPECTED_CA_FINGERPRINT_SHA256 =
  "80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA";

/**
 * Parse, and structurally validate, the pinned CA at `caPath`. Existence alone is not enough --
 * an empty or truncated file would pass a bare existsSync() check while providing no trust
 * anchor at all. Throws (fail-closed) on any of: unreadable, not a CERTIFICATE block, does not
 * parse as X.509, missing the CA:TRUE basicConstraint, outside its own validity window, or a
 * sha256 fingerprint that does not match EXPECTED_CA_FINGERPRINT_SHA256.
 * @param {string} caPath
 * @returns {X509Certificate}
 */
export function validateCa(caPath) {
  let text;
  try {
    text = readFileSync(caPath, "utf8");
  } catch (err) {
    throw new Error(`dsn-pipe: FAIL-CLOSED — could not read the pinned CA at ${caPath}: ${err.code ?? err.message}`);
  }
  if (!text.includes("-----BEGIN CERTIFICATE-----")) {
    throw new Error(`dsn-pipe: FAIL-CLOSED — ${caPath} does not contain a PEM CERTIFICATE block`);
  }
  let cert;
  try {
    cert = new X509Certificate(text);
  } catch (err) {
    throw new Error(`dsn-pipe: FAIL-CLOSED — ${caPath} did not parse as a valid X.509 certificate: ${err.message}`);
  }
  if (cert.ca !== true) {
    throw new Error(`dsn-pipe: FAIL-CLOSED — ${caPath} is not a CA certificate (basicConstraints CA:TRUE required)`);
  }
  const now = Date.now();
  if (now < Date.parse(cert.validFrom) || now > Date.parse(cert.validTo)) {
    throw new Error(`dsn-pipe: FAIL-CLOSED — ${caPath} is outside its validity window (${cert.validFrom} .. ${cert.validTo})`);
  }
  if (cert.fingerprint256 !== EXPECTED_CA_FINGERPRINT_SHA256) {
    throw new Error(
      `dsn-pipe: FAIL-CLOSED — ${caPath}'s sha256 fingerprint does not match the pinned expectation ` +
        `(got ${cert.fingerprint256}, expected ${EXPECTED_CA_FINGERPRINT_SHA256}) — the committed CA may ` +
        `have been swapped or corrupted`,
    );
  }
  return cert;
}

/**
 * Force `sslmode=verify-full` AND `sslrootcert=<caPath>` onto a Postgres DSN, replacing any
 * caller-supplied value for either — the pin must be EXCLUSIVE, never caller-overridable
 * (review finding B1: a caller-supplied `?sslrootcert=/tmp/other-ca.crt` must lose, and without
 * an explicit `sslrootcert` in the DSN itself, node-postgres's `pg` path falls back to Node's
 * ~150-root default trust store AUGMENTED by NODE_EXTRA_CA_CERTS rather than PINNED to only our
 * CA -- `sslrootcert` is what pg-connection-string turns into an explicit `ssl.ca`, which
 * REPLACES the default trust store for that connection). Also refuses a DSN missing a host or a
 * database name (a bare `postgresql://` silently connecting to "wherever the caller's env
 * defaults to" is not a DSN this bridge should ever forward). Throws (never echoes the input) on
 * any of these.
 * @param {string} dsn
 * @param {string} [caPath]
 * @returns {string}
 */
export function withVerifyFull(dsn, caPath = DEFAULT_CA_PATH) {
  let u;
  try {
    u = new URL(dsn);
  } catch {
    throw new Error("dsn-pipe: stdin did not parse as a URI (expected postgres://... or postgresql://...)");
  }
  if (u.protocol !== "postgres:" && u.protocol !== "postgresql:") {
    throw new Error(`dsn-pipe: unsupported scheme ${JSON.stringify(u.protocol)} (expected postgres: or postgresql:)`);
  }
  if (!u.hostname) {
    throw new Error("dsn-pipe: stdin's DSN carries no host — refusing an incomplete URI");
  }
  const dbName = decodeURIComponent((u.pathname || "").replace(/^\//, ""));
  if (!dbName) {
    throw new Error("dsn-pipe: stdin's DSN carries no database name — refusing an incomplete URI");
  }
  u.searchParams.set("sslmode", "verify-full");
  u.searchParams.delete("sslrootcert"); // drop any caller-supplied value -- see the exclusivity note above
  // NOT u.searchParams.set("sslrootcert", caPath): URLSearchParams' own serializer encodes a
  // space as `+` (the application/x-www-form-urlencoded convention), which a URI-style query
  // parser does NOT reliably decode back to a space (review finding F3) -- a CA path containing
  // a space (common on Windows: "Program Files", a user's full name) would then round-trip as a
  // literal `+` and fail to open. encodeURIComponent() below always emits `%20`, which every
  // correct query parser decodes unambiguously.
  const base = u.toString();
  const sep = base.includes("?") ? "&" : "?";
  return base + sep + "sslrootcert=" + encodeURIComponent(caPath);
}

// Copied verbatim from packages/db/lib/pg.mjs:28-37 (PG_IDENTITY_VARS) -- the identical hazard:
// any of these surviving into the child's env can silently redirect a bare libpq client (e.g.
// `psql` invoked with no DSN of its own) to a DIFFERENT server while the TLS mode still looks
// correct (review finding A3). NODE_OPTIONS can inject `--require` into any Node child (A4).
const PG_IDENTITY_VARS = ["PGHOST", "PGHOSTADDR", "PGPORT", "PGUSER", "PGPASSWORD", "PGDATABASE", "PGSERVICE", "PGSERVICEFILE"];
const SCRUB_KEYS = [...PG_IDENTITY_VARS, "NODE_OPTIONS"];

/**
 * The environment the CHILD process receives — the ONLY place the DSN is ever written.
 * Scrub-then-build: two hostile-shell settings REFUSE LOUDLY rather than being silently
 * scrubbed (an operator should know their shell was hostile) --
 *   - NODE_TLS_REJECT_UNAUTHORIZED=0 disables TLS certificate validation process-wide for any
 *     Node child (review finding A2);
 *   - NODE_DEBUG containing "child_process" makes Node print the full spawn environment,
 *     DSN included, to stderr (review finding A1, reproduced).
 * Everything else in SCRUB_KEYS is removed silently, then re-populated from the REWRITTEN DSN's
 * own components (never from baseEnv — mirrors packages/db/lib/pg.mjs:104-120's
 * childEnvForExternalTools(), the established precedent for this exact problem in this repo).
 * This is what lets a bare libpq CLI tool (`psql`, `pg_dump`, no positional connection string
 * argument at all) connect through this bridge purely via env — the alternative, an operator
 * writing `psql "$DATABASE_URL" -f file.sql`, would put the DSN into psql's own argv, a leak
 * this bridge does not otherwise control (review finding F1: the bridge itself never puts the
 * DSN in argv/logs/disk, but an arbitrary CHILD can still leak what it explicitly re-emits).
 * The four TLS/DSN vars plus the five PG* identity vars are set LAST so they always win
 * regardless of what baseEnv or the scrub list carried (review finding B2).
 * @param {{ dsn: string, caPath?: string, baseEnv?: NodeJS.ProcessEnv }} args
 * @returns {NodeJS.ProcessEnv}
 */
/**
 * Reproduces Node's OWN `NODE_DEBUG` matcher (`lib/internal/util/debuglog.js`) exactly, rather
 * than a naive substring/word-boundary check. Node's real matcher escapes regex metacharacters,
 * turns `*` into a wildcard, turns `,` into alternation, and matches CASE-INSENSITIVELY — so
 * `NODE_DEBUG=*`, `child*`, `CHILD_PROCESS`, and `child_pro*` all enable child_process
 * debugging (review finding F1, reproduced against the real CLI: `NODE_DEBUG=*` dumped the full
 * spawn env, DSN included, to stderr — a naive `/\bchild_process\b/` check missed every one of
 * these). Verified empirically against `util.debuglog('child_process').enabled` for the same
 * set of values Node's own source produces before trusting this reconstruction.
 * @param {string | undefined} nodeDebugValue
 * @returns {boolean}
 */
export function nodeDebugEnablesChildProcess(nodeDebugValue) {
  if (!nodeDebugValue) return false;
  const escaped = nodeDebugValue
    .replace(/[|\\{}()[\]^$+?.]/g, "\\$&")
    .replaceAll("*", ".*")
    .replaceAll(",", "$|^");
  return new RegExp(`^${escaped}$`, "i").test("child_process");
}

export function buildChildEnv({ dsn, caPath = DEFAULT_CA_PATH, baseEnv = process.env }) {
  if (String(baseEnv.NODE_TLS_REJECT_UNAUTHORIZED) === "0") {
    throw new Error(
      "dsn-pipe: refusing — the calling shell has NODE_TLS_REJECT_UNAUTHORIZED=0 set, which disables TLS " +
        "certificate validation process-wide for any Node child. Unset it and retry.",
    );
  }
  if (nodeDebugEnablesChildProcess(baseEnv.NODE_DEBUG)) {
    throw new Error(
      "dsn-pipe: refusing — the calling shell's NODE_DEBUG enables 'child_process' debugging (Node's own " +
        "matcher, not a literal match — this covers '*', 'child*', wildcards and comma lists too), which " +
        "makes Node print the full spawn environment (the DSN included) to stderr. Unset it and retry.",
    );
  }
  const withSsl = withVerifyFull(dsn, caPath);
  const u = new URL(withSsl); // already validated by withVerifyFull -- host and database are non-empty
  const scrubbed = { ...baseEnv };
  for (const k of SCRUB_KEYS) delete scrubbed[k];
  const env = {
    ...scrubbed,
    DATABASE_URL: withSsl,
    PGSSLMODE: "verify-full", // redundant safety net for libpq tools reading PG* vars, not the DSN
    PGSSLROOTCERT: caPath,
    NODE_EXTRA_CA_CERTS: caPath, // augments Node's global TLS trust store; the DSN's own sslrootcert is what PINS for the `pg` path
    PGHOST: u.hostname,
    PGPORT: u.port || "5432",
    PGDATABASE: decodeURIComponent(u.pathname.replace(/^\//, "")),
  };
  // Guarded, not unconditional (mirrors packages/db/lib/pg.mjs:113-114): an EMPTY PGUSER/
  // PGPASSWORD is not "unset" to libpq -- it is a literal empty credential, which suppresses
  // ~/.pgpass lookup for a genuinely password-less DSN (review finding F4). Only set them when
  // the DSN actually carried a value.
  if (u.username) env.PGUSER = decodeURIComponent(u.username);
  if (u.password) env.PGPASSWORD = decodeURIComponent(u.password);
  return env;
}

/** Read the whole of STDIN synchronously (fd 0), trimmed. Never reads argv or a file. */
export function readDsnFromStdin() {
  let raw;
  try {
    raw = readFileSync(0, "utf8");
  } catch (err) {
    throw new Error(`dsn-pipe: could not read stdin: ${err.code ?? err.message}`);
  }
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error("dsn-pipe: stdin was empty — pipe the DSN in, e.g. `fly ssh console ... printenv DATABASE_URL | node scripts/ops/dsn-pipe.mjs -- <cmd>`");
  }
  return trimmed;
}

/**
 * Split argv into the bridge's own flags (none today) and the child command after `--`.
 * `--` must be the VERY FIRST token — this bridge has no flags of its own, so any token before
 * `--` is a mistake, not something to silently discard (review finding C3: `indexOf("--")`
 * previously accepted, and dropped, arbitrary leading tokens).
 */
export function splitArgv(argv) {
  if (argv[0] !== "--" || argv.length < 2) {
    throw new Error("dsn-pipe: usage: <secret source> | node scripts/ops/dsn-pipe.mjs -- <command> [args...]  (`--` must be the FIRST argument)");
  }
  const [cmd, ...cmdArgs] = argv.slice(1);
  return { cmd, cmdArgs };
}

function main() {
  try {
    validateCa(DEFAULT_CA_PATH);
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }

  let cmd, cmdArgs, dsn, env;
  try {
    ({ cmd, cmdArgs } = splitArgv(process.argv.slice(2)));
    dsn = readDsnFromStdin();
    env = buildChildEnv({ dsn });
  } catch (err) {
    // Never interpolate `dsn` itself into a message — every throw site above already avoids it.
    console.error(err.message);
    process.exit(1);
  }

  const child = spawn(cmd, cmdArgs, { stdio: "inherit", shell: false, env });
  child.on("error", (err) => {
    console.error(`dsn-pipe: failed to start ${JSON.stringify(cmd)}: ${err.message}`);
    process.exit(1);
  });
  child.on("exit", (code, signal) => {
    process.exit(signal ? 1 : (code ?? 1));
  });
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) main();
