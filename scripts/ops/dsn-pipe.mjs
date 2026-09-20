#!/usr/bin/env node
// The ceremony DSN bridge (F-T4 item F / fix-queue-design.md §6).
//
//   <secret source> | node scripts/ops/dsn-pipe.mjs -- <command> [args...]
//   <secret source> | node scripts/ops/dsn-pipe.mjs --child-os wsl -- wsl -u root -- <command>
//
// #917 — `pg_dump` 17 lives only in WSL on this rig, and the pinned CA's path (below) is written
// in the WINDOWS spelling. A WSL child cannot open a Windows-spelled path, so `--child-os wsl`
// (or simply invoking `wsl` as the child command — it is auto-detected too) respells the DSN's
// `sslrootcert` and the two CA env vars (PGSSLROOTCERT, NODE_EXTRA_CA_CERTS) to the `/mnt/<drive>/…`
// form for the CHILD only, sets `WSLENV` so those two plus the six PG identity vars actually cross
// the Windows/WSL environment boundary (nothing crosses it that is not named in WSLENV — see
// buildChildEnv's header), and deliberately never lists DATABASE_URL there: only the WSL-side
// `bash`/`pg_dump`/`psql` need the PG* vars and the two CA vars, and the whole DSN is kept to this
// process and its DIRECT child (the `wsl` invocation itself), never handed across the OS boundary
// as one string. The CA fingerprint check (validateCa, below) always runs against the ORIGINAL
// Windows-spelled DEFAULT_CA_PATH — respelling is a step applied only to EMITTED values, never to
// the path the trust check itself reads.
//
// Reads a Postgres DSN on STDIN — never argv, never a file — forces `sslmode=verify-full`
// AND `sslrootcert=<committed CA>` onto the DSN itself (not just the env; a DSN-level pin is
// what makes node-postgres treat the CA as EXCLUSIVE rather than merely additional — see the
// review note on withVerifyFull below), points PGSSLROOTCERT / NODE_EXTRA_CA_CERTS at the same
// committed pooler CA (ops/tls/pooler-ca.crt) for libpq-based tools, and spawns <command> with
// the DSN in the CHILD's environment only. The DSN is never written to disk, never logged, and
// never appears in any process's argv (this script's own or the child's) — it travels
// env-to-end exactly once.
//
// This bridge became durable after two live ceremonies degraded to
// `sslmode=no-verify` because the prior dsn-pipe.mjs was session-local and gone
// (fix-queue-survey.md F20-F22).
//
// No dependencies — Node built-ins only.

import { spawn } from "node:child_process";
import { X509Certificate } from "node:crypto";
import { readFileSync, realpathSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
/** Absolute path to the committed pooler CA, resolved from THIS file's location — never cwd. */
export const DEFAULT_CA_PATH = resolve(HERE, "..", "..", "ops", "tls", "pooler-ca.crt");

/**
 * #917 — respell a Windows-spelled absolute path (`C:\Users\…` or `C:/Users/…`) to the
 * `/mnt/<drive>/…` form a WSL child can open. A path that does not start with a drive letter
 * (already POSIX-shaped — the normal case on the Linux CI runners this selftest also runs on) is
 * returned with backslashes normalised to forward slashes and is otherwise UNCHANGED: this
 * function only ever adds the `/mnt/<drive>` prefix, it never invents one.
 * @param {string} windowsPath
 * @returns {string}
 */
export function toWslPath(windowsPath) {
  const m = /^([A-Za-z]):[\\/](.*)$/.exec(windowsPath);
  if (!m) return windowsPath.replace(/\\/g, "/");
  const drive = m[1].toLowerCase();
  const rest = m[2].replace(/\\/g, "/");
  return `/mnt/${drive}/${rest}`;
}

/** Recognised `--child-os` values. Anything else is refused (fail-closed), never silently
 * ignored — "Out of scope: any child OS other than WSL" (#917). */
const VALID_CHILD_OS = new Set(["wsl"]);

/**
 * #917 — an explicit `--child-os` always wins; absent, a `wsl` child command is auto-detected
 * (the ticket's own alternative phrasing for the same trigger). Every other child command is
 * untouched — this bridge's default (Windows- or Linux-native) behaviour is unchanged.
 * @param {string|null} explicitChildOs
 * @param {string} cmd the resolved child command (argv[0] after `--`)
 * @returns {"wsl"|null}
 */
export function resolveChildOs(explicitChildOs, cmd) {
  if (explicitChildOs) return explicitChildOs;
  if (cmd === "wsl") return "wsl";
  return null;
}

/**
 * #917 — the `WSLENV` list this bridge emits for a `wsl` child: the six PG identity vars
 * (needed by a bare `pg_dump`/`psql` on the WSL side, exactly like a native child) plus the two
 * CA vars, which are ALREADY respelled to `/mnt/<drive>/…` by the time they reach this list (no
 * `/p` flag — that would ask WSL to translate an already-WSL-native path a second time), plus
 * `CLARA_BACKUP_DIR/p` — carried over from the hand wrapper this bridge replaces
 * (RELEASE-RUNBOOK-0225-0233.md:213), WITH its `/p` flag: unlike the CA vars, dsn-pipe.mjs never
 * reads or respells `CLARA_BACKUP_DIR` itself, so WSL's own WSLENV machinery must translate the
 * Windows path an operator sets on the Windows side into the `/mnt/<drive>/…` form
 * `packages/db/scripts/backup.mjs`'s own `CLARA_BACKUP_DIR` read (line 54) expects — dropping it
 * from this list would silently fall back to `backup.mjs`'s default directory instead of the
 * operator's chosen one (L05B-S02). `DATABASE_URL` is deliberately never listed: only the PG* +
 * CA + backup-dir vars need to reach the WSL side, and crossing the whole DSN over the
 * Windows/WSL environment boundary as one string is exactly the wider leak surface this bridge
 * exists to avoid — MEASURED to actually work end-to-end against a real `wsl.exe` on this rig
 * (this selftest's own WSL-boundary cell).
 *
 * IMPORTANT — read with L05B-S01: naming a var in `WSLENV` only gets it INTO the WSL child's
 * environment; it says nothing about how that child's TLS stack USES it. A bare `pg_dump`/`psql`
 * on the WSL side reads `PGSSLMODE`/`PGSSLROOTCERT` and treats the pinned CA as EXCLUSIVE, same
 * as the Windows side. A Node `pg` client running ON THE WSL SIDE (e.g. `backup.mjs`'s own
 * `--profile full` path, which this bridge's own AC1 command runs there) is DIFFERENT: with no
 * `DATABASE_URL` in its environment, `packages/db/lib/pg.mjs`'s `connConfig()` returns `{}`, so
 * node-postgres falls back to `readSSLConfigFromEnvironment()`, which maps `PGSSLMODE=verify-full`
 * to a bare `ssl: true` — NODE_EXTRA_CA_CERTS then only AUGMENTS Node's global trust store; it
 * does not make the pinned CA exclusive the way an explicit DSN `sslrootcert` does for the `pg`
 * path on the Windows side. This is not a regression (the wrapper being replaced had the same
 * shape) and is not a defect in `pg_dump`'s own trust (libpq is unaffected) — it is a real,
 * narrower guarantee for a WSL-side Node client specifically, recorded here so the next reader
 * does not assume the exclusivity DSN-pin/README paragraph above covers this leg too.
 */
export const WSL_ENV_LIST = "PGHOST:PGPORT:PGUSER:PGPASSWORD:PGDATABASE:PGSSLMODE:PGSSLROOTCERT:NODE_EXTRA_CA_CERTS:CLARA_BACKUP_DIR/p";

// Captured from the live pooler 2026-08-23 and independently confirmed byte-identical against
// Supabase's own publicly-hosted copy (https://supabase-downloads.s3-ap-southeast-1.amazonaws.com
// /prod/ssl/prod-ca-2021.crt, fetched over standard web PKI -- a channel independent of the
// pooler's own handshake). Pinning
// the exact fingerprint here means a swapped or corrupted ops/tls/pooler-ca.crt is refused at
// preflight rather than silently trusted -- rotate this constant in the SAME PR that replaces
// the .crt file.
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
 * Split argv into the bridge's own flags and the child command after `--`.
 * `--` must be the FIRST token, UNLESS it is preceded by exactly one recognised flag,
 * `--child-os <os>` (#917) — any OTHER token before `--`, or an unrecognised `--child-os` value,
 * is a mistake, not something to silently discard or guess at (review finding C3: `indexOf("--")`
 * previously accepted, and dropped, arbitrary leading tokens; #917 keeps that same fail-closed
 * shape for its one new flag).
 * @returns {{ cmd: string, cmdArgs: string[], childOs: "wsl"|null }}
 */
export function splitArgv(argv) {
  let i = 0;
  let childOs = null;
  if (argv[i] === "--child-os") {
    childOs = argv[i + 1] ?? null;
    if (!VALID_CHILD_OS.has(childOs)) {
      throw new Error(`dsn-pipe: --child-os ${JSON.stringify(childOs)} is not supported (only "wsl" is) — refusing rather than guessing.`);
    }
    i += 2;
  }
  if (argv[i] !== "--" || argv.length < i + 2) {
    throw new Error(
      "dsn-pipe: usage: <secret source> | node scripts/ops/dsn-pipe.mjs [--child-os wsl] -- <command> [args...]  " +
        "(`--` must be the first argument, or the first argument after `--child-os <os>`)",
    );
  }
  const [cmd, ...cmdArgs] = argv.slice(i + 1);
  return { cmd, cmdArgs, childOs };
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
    let childOs;
    ({ cmd, cmdArgs, childOs } = splitArgv(process.argv.slice(2)));
    const effectiveChildOs = resolveChildOs(childOs, cmd);
    // #917 — respelling touches only the value EMITTED to the DSN/env; validateCa (above)
    // already ran against the untouched, Windows-spelled DEFAULT_CA_PATH.
    const caPath = effectiveChildOs === "wsl" ? toWslPath(DEFAULT_CA_PATH) : DEFAULT_CA_PATH;
    dsn = readDsnFromStdin();
    env = buildChildEnv({ dsn, caPath });
    if (effectiveChildOs === "wsl") env.WSLENV = WSL_ENV_LIST;
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

/**
 * True when THIS module is the process entry point — the guard that keeps `main()` from firing
 * when the selftests `import()` this file for its pure functions.
 *
 * IT COMPARES FILES, NOT SPELLINGS (#756). `process.argv[1]` is whatever the caller typed,
 * resolved LEXICALLY; `import.meta.url` is the module's REALPATH, because Node's ESM loader
 * resolves symlinks before it records the URL. On stock macOS `os.tmpdir()` is under `/var`,
 * which is a symlink to `/private/var`, so a copy of this script staged in a temp directory
 * compared UNEQUAL: `main()` never ran, the process exited 0 having done nothing, and the
 * selftest's "a missing CA FAILS CLOSED" cell read that 0 as a FAIL — turning the root
 * `pnpm lint` ladder red on every Mac while Linux CI stayed green. Realpathing both sides
 * makes the guard answer the question it means to ask.
 *
 * A side that cannot be realpathed (a script unlinked between spawn and now) falls back to its
 * lexical form rather than throwing: the guard must never be the reason this tool fails to run.
 *
 * Exported so the selftest can pin BOTH outcomes directly, without staging a process per case.
 */
export function isEntryPoint(argv1, moduleUrl) {
  if (!argv1) return false;
  const real = (p) => {
    try {
      return realpathSync(p);
    } catch {
      return p;
    }
  };
  return real(resolve(argv1)) === real(fileURLToPath(moduleUrl));
}

if (isEntryPoint(process.argv[1], import.meta.url)) main();
