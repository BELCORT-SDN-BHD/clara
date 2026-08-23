#!/usr/bin/env node
// Self-test for the ceremony DSN bridge (fix-queue-design.md §6, item 3), hardened by the
// F-T4 PR-1 consolidated review round (2 findings-legs: 3 critical / 3 high / 5 medium). The
// D4 real-node-postgres-path cell lives in the sibling dsn-pipe.pgpath.selftest.mjs (kept
// separate so neither file crosses the repo's file-size convention); shared scaffolding is in
// dsn-pipe.selftest-helpers.mjs.
//
//   node scripts/ops/dsn-pipe.selftest.mjs   # exit 0 green, 1 red
//
// HERMETIC — safe to wire into `pnpm lint`, runs every PR, no external network calls. Proves:
// the CA wall refuses on a mismatch and admits on a match (raw TLS probe here; the `pg`-library
// path is the sibling file); hostile-shell env vars are refused loudly or scrubbed before the
// child ever sees them; the pin is EXCLUSIVE (a caller-supplied sslrootcert/PGSSLROOTCERT/
// PGSSLMODE/NODE_EXTRA_CA_CERTS/DATABASE_URL/PGHOST etc. all lose to the bridge's own values,
// which also let a bare libpq CLI tool connect via env alone — no DSN in ITS argv either); the
// committed CA is structurally validated (CA:TRUE, in-window, exact fingerprint), not just
// present; the DSN never reaches argv or disk; every negative cell is honest (no spawn error, no
// signal, no timeout masquerading as a refusal); every absence-detector has a positive-control
// twin proving it CAN say NO.
//
// NOT proved here (deliberately): that the committed CA validates the REAL live Supabase pooler
// today. That is the "positive live leg" — a manual, on-demand check, documented in
// docs/ops/dsn-bridge.md, run before any ceremony and at PR review; it is deliberately kept OUT
// of the auto-run battery so `pnpm lint` never depends on third-party network reachability. See
// this PR's report for the live evidence captured at build time, including an INDEPENDENT-
// CHANNEL byte-comparison against Supabase's own publicly-hosted copy of the certificate.
//
// Uses the system `openssl` binary to mint throwaway test fixtures (never a runtime dependency
// of dsn-pipe.mjs itself). On Linux, a missing `openssl` FAILS this battery rather than
// skipping it — the CI runners are Linux and always carry it (review D5).

import { mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer as createTlsServer } from "node:tls";
import {
  createHarness, freshDir, fakeDsn, runDsnPipe, assertCleanRefusal,
  opensslAvailableForCaFixtures, reportOpensslMissing, mintCert, spawnWithBuiltEnv, MARKER,
} from "./dsn-pipe.selftest-helpers.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const DSN_PIPE_SRC = join(HERE, "dsn-pipe.mjs");
const COMMITTED_CA = join(HERE, "..", "..", "ops", "tls", "pooler-ca.crt");

const { testCase, asyncTestCase, skipHere, reportFail, reportSkip, summarize } = createHarness();

// ---------------------------------------------------------------------------
// Unit level: the pure functions dsn-pipe.mjs exports.
// ---------------------------------------------------------------------------
console.log("unit level -- withVerifyFull / buildChildEnv / splitArgv / validateCa:");

const { withVerifyFull, buildChildEnv, splitArgv, validateCa, DEFAULT_CA_PATH } = await import("./dsn-pipe.mjs");

testCase("withVerifyFull forces sslmode=verify-full even when the input carries a different mode", () => {
  const out = withVerifyFull(fakeDsn({ hostport: "h:5432", query: "sslmode=require" }));
  if (!out.includes("sslmode=verify-full")) throw new Error(`expected verify-full, got: ${out}`);
  if (out.includes("sslmode=require")) throw new Error(`the weaker mode must not survive: ${out}`);
});
testCase("withVerifyFull sets sslmode=verify-full when the input carries none at all", () => {
  const out = withVerifyFull(fakeDsn({ hostport: "h:5432" }));
  if (!out.includes("sslmode=verify-full")) throw new Error(`expected verify-full appended, got: ${out}`);
});
testCase("withVerifyFull preserves user/password/host/db unchanged", () => {
  const out = withVerifyFull(fakeDsn({ scheme: "postgresql", user: "theuser", pass: "thepass", hostport: "example.test:5432", db: "thedb" }));
  for (const part of ["theuser", "thepass", "example.test", "5432", "thedb"]) {
    if (!out.includes(part)) throw new Error(`expected ${part} to survive, got: ${out}`);
  }
});
testCase("withVerifyFull refuses a non-postgres scheme WITHOUT echoing the input", () => {
  const bad = fakeDsn({ scheme: "https", hostport: "h" });
  let threw = null;
  try {
    withVerifyFull(bad);
  } catch (e) {
    threw = e;
  }
  if (!threw) throw new Error("expected a throw for a non-postgres scheme");
  if (threw.message.includes(bad)) throw new Error("the raw input must never appear in the error message");
});
testCase("withVerifyFull refuses garbage WITHOUT echoing the input", () => {
  const garbage = "not a uri at all §§§";
  let threw = null;
  try {
    withVerifyFull(garbage);
  } catch (e) {
    threw = e;
  }
  if (!threw) throw new Error("expected a throw for unparseable input");
  if (threw.message.includes(garbage)) throw new Error("the raw input must never appear in the error message");
});
testCase("(C2) withVerifyFull refuses a DSN with no host", () => {
  let threw = null;
  try {
    withVerifyFull("postgres:///d"); // scheme + empty authority + db, no host
  } catch (e) {
    threw = e;
  }
  if (!threw) throw new Error("expected a throw for a hostless DSN");
});
testCase("(C2) withVerifyFull refuses a DSN with no database name", () => {
  let threw = null;
  try {
    withVerifyFull(fakeDsn({ hostport: "h:5432", db: "" }));
  } catch (e) {
    threw = e;
  }
  if (!threw) throw new Error("expected a throw for a databaseless DSN");
});
testCase("(B1) withVerifyFull forces sslrootcert=<caPath>, replacing any caller-supplied value", () => {
  const out = withVerifyFull(fakeDsn({ hostport: "h:5432", query: "sslrootcert=%2Ftmp%2Fother-ca.crt" }), "/the/pinned/ca.crt");
  const url = new URL(out);
  if (url.searchParams.get("sslrootcert") !== "/the/pinned/ca.crt") {
    throw new Error(`expected sslrootcert to be forced to the pinned path, got: ${url.searchParams.get("sslrootcert")}`);
  }
  if (out.includes("other-ca.crt")) throw new Error("the caller-supplied sslrootcert must not survive anywhere in the output");
});
testCase("buildChildEnv sets DATABASE_URL / PGSSLMODE / PGSSLROOTCERT / NODE_EXTRA_CA_CERTS and forces verify-full", () => {
  const env = buildChildEnv({ dsn: fakeDsn({ hostport: "h:5432" }), caPath: "/x/ca.crt", baseEnv: {} });
  if (env.PGSSLROOTCERT !== "/x/ca.crt") throw new Error("PGSSLROOTCERT must be the given CA path");
  if (env.NODE_EXTRA_CA_CERTS !== "/x/ca.crt") throw new Error("NODE_EXTRA_CA_CERTS must be the given CA path");
  if (env.PGSSLMODE !== "verify-full") throw new Error("PGSSLMODE must be verify-full");
  if (!env.DATABASE_URL.includes("sslmode=verify-full")) throw new Error("DATABASE_URL must carry verify-full");
  if (!env.DATABASE_URL.includes("sslrootcert=")) throw new Error("DATABASE_URL must carry sslrootcert");
});
testCase("buildChildEnv does not mutate the baseEnv object passed in", () => {
  const base = { EXISTING: "1" };
  buildChildEnv({ dsn: fakeDsn({}), caPath: "/x/ca.crt", baseEnv: base });
  if (Object.keys(base).length !== 1) throw new Error("baseEnv must not be mutated in place");
});
testCase("buildChildEnv defaults caPath to the committed pooler-ca.crt, resolved from the script's own location (not cwd)", () => {
  if (!DEFAULT_CA_PATH.endsWith(join("ops", "tls", "pooler-ca.crt"))) {
    throw new Error(`unexpected default CA path: ${DEFAULT_CA_PATH}`);
  }
});
testCase("(A2) buildChildEnv REFUSES LOUDLY when the calling shell has NODE_TLS_REJECT_UNAUTHORIZED=0", () => {
  let threw = null;
  try {
    buildChildEnv({ dsn: fakeDsn({}), caPath: "/x/ca.crt", baseEnv: { NODE_TLS_REJECT_UNAUTHORIZED: "0" } });
  } catch (e) {
    threw = e;
  }
  if (!threw) throw new Error("expected a loud refusal, not a silent scrub");
  if (!/NODE_TLS_REJECT_UNAUTHORIZED/.test(threw.message)) throw new Error(`error must name the hostile var: ${threw.message}`);
});
testCase("(A1) buildChildEnv REFUSES LOUDLY when NODE_DEBUG contains 'child_process'", () => {
  let threw = null;
  try {
    buildChildEnv({ dsn: fakeDsn({}), caPath: "/x/ca.crt", baseEnv: { NODE_DEBUG: "fs,child_process" } });
  } catch (e) {
    threw = e;
  }
  if (!threw) throw new Error("expected a loud refusal, not a silent scrub");
  if (!/NODE_DEBUG/.test(threw.message)) throw new Error(`error must name the hostile var: ${threw.message}`);
});
testCase("(A1) a NODE_DEBUG that does NOT mention child_process is NOT refused (no over-trigger)", () => {
  const env = buildChildEnv({ dsn: fakeDsn({ hostport: "h:5432" }), caPath: "/x/ca.crt", baseEnv: { NODE_DEBUG: "fs,http" } });
  if (env.DATABASE_URL === undefined) throw new Error("expected a normal build to proceed");
});
testCase("(A3) buildChildEnv SCRUBS the hostile PG identity vars that have no DSN-derived replacement (PGSERVICE/PGSERVICEFILE/PGHOSTADDR)", () => {
  const hostile = { PGSERVICE: "z", PGSERVICEFILE: "w", PGHOSTADDR: "1.2.3.4" };
  const env = buildChildEnv({ dsn: fakeDsn({ hostport: "h:5432" }), caPath: "/x/ca.crt", baseEnv: hostile });
  for (const k of Object.keys(hostile)) {
    if (k in env) throw new Error(`${k} must be scrubbed from the child env, found: ${env[k]}`);
  }
});
testCase("(A3/F1) buildChildEnv REPLACES hostile PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE with the DSN-derived values (never the hostile baseEnv's)", () => {
  const hostile = { PGHOST: "evil.example", PGPORT: "1", PGUSER: "root", PGPASSWORD: "x", PGDATABASE: "y" };
  const env = buildChildEnv({ dsn: fakeDsn({ user: "u1", pass: "p1", hostport: "h1:5555", db: "d1" }), caPath: "/x/ca.crt", baseEnv: hostile });
  const want = { PGHOST: "h1", PGPORT: "5555", PGUSER: "u1", PGPASSWORD: "p1", PGDATABASE: "d1" };
  for (const [k, v] of Object.entries(want)) {
    if (env[k] !== v) throw new Error(`hostile ${k} must lose to the DSN-derived value, got: ${env[k]}`);
  }
});
testCase("(F1) buildChildEnv populates PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE from a CLEAN baseEnv too (bare `psql`, no argv connection string, connects via env alone), and defaults PGPORT to 5432 when the DSN omits it", () => {
  const env = buildChildEnv({ dsn: fakeDsn({ user: "u2", pass: "p2", hostport: "h2:6666", db: "d2" }), caPath: "/x/ca.crt", baseEnv: {} });
  const got = { PGHOST: env.PGHOST, PGPORT: env.PGPORT, PGUSER: env.PGUSER, PGPASSWORD: env.PGPASSWORD, PGDATABASE: env.PGDATABASE };
  if (got.PGHOST !== "h2" || got.PGPORT !== "6666" || got.PGUSER !== "u2" || got.PGPASSWORD !== "p2" || got.PGDATABASE !== "d2") {
    throw new Error(`expected the PG* identity vars derived from the DSN, got: ${JSON.stringify(got)}`);
  }
  const noPort = buildChildEnv({ dsn: fakeDsn({ hostport: "h3", db: "d3" }), caPath: "/x/ca.crt", baseEnv: {} });
  if (noPort.PGPORT !== "5432") throw new Error(`expected the standard Postgres port as the default, got: ${noPort.PGPORT}`);
});
testCase("(A4) buildChildEnv SCRUBS NODE_OPTIONS silently", () => {
  const env = buildChildEnv({ dsn: fakeDsn({ hostport: "h:5432" }), caPath: "/x/ca.crt", baseEnv: { NODE_OPTIONS: "--require=/tmp/evil.js" } });
  if ("NODE_OPTIONS" in env) throw new Error(`NODE_OPTIONS must be scrubbed, found: ${env.NODE_OPTIONS}`);
});
testCase("(B2) the bridge's own four vars WIN over ANY hostile baseEnv preset of the same names", () => {
  const hostile = {
    PGSSLMODE: "disable",
    PGSSLROOTCERT: "/tmp/attacker-ca.crt",
    NODE_EXTRA_CA_CERTS: "/tmp/attacker-ca.crt",
    DATABASE_URL: fakeDsn({ hostport: "evil:5432" }),
  };
  const env = buildChildEnv({ dsn: fakeDsn({ hostport: "h:5432" }), caPath: "/the/real/ca.crt", baseEnv: hostile });
  if (env.PGSSLMODE !== "verify-full") throw new Error(`hostile PGSSLMODE must lose, got: ${env.PGSSLMODE}`);
  if (env.PGSSLROOTCERT !== "/the/real/ca.crt") throw new Error(`hostile PGSSLROOTCERT must lose, got: ${env.PGSSLROOTCERT}`);
  if (env.NODE_EXTRA_CA_CERTS !== "/the/real/ca.crt") throw new Error(`hostile NODE_EXTRA_CA_CERTS must lose, got: ${env.NODE_EXTRA_CA_CERTS}`);
  if (env.DATABASE_URL.includes("evil")) throw new Error(`hostile preset DATABASE_URL must lose entirely, got: ${env.DATABASE_URL}`);
});
testCase("(C3) splitArgv requires `--` to be the FIRST token — a leading token is refused, not discarded", () => {
  for (const bad of [[], ["node"], ["--"], ["leading-token", "--", "echo", "hi"]]) {
    let threw = null;
    try {
      splitArgv(bad);
    } catch (e) {
      threw = e;
    }
    if (!threw) throw new Error(`expected a throw for argv=${JSON.stringify(bad)}`);
  }
  const ok = splitArgv(["--", "echo", "hi"]);
  if (ok.cmd !== "echo" || ok.cmdArgs.join(",") !== "hi") throw new Error(`unexpected split: ${JSON.stringify(ok)}`);
});

// ---------------------------------------------------------------------------
// (C1) validateCa — structural validation, not just existence.
// ---------------------------------------------------------------------------
console.log("\n(C1) validateCa -- structural CA validation:");

testCase("the COMMITTED CA passes validateCa (CA:TRUE, in-window, exact pinned fingerprint)", () => {
  const cert = validateCa(COMMITTED_CA);
  if (cert.ca !== true) throw new Error("committed CA must report ca===true");
});
testCase("an EMPTY file fails closed (existence alone is not enough)", () => {
  const dir = freshDir("dsnpipe-ca-empty-");
  const p = join(dir, "empty.crt");
  writeFileSync(p, "");
  let threw = null;
  try {
    validateCa(p);
  } catch (e) {
    threw = e;
  }
  rmSync(dir, { recursive: true, force: true });
  if (!threw) throw new Error("expected a throw for an empty file");
});
testCase("a TRUNCATED PEM block fails closed", () => {
  const dir = freshDir("dsnpipe-ca-trunc-");
  const p = join(dir, "trunc.crt");
  const full = readFileSync(COMMITTED_CA, "utf8");
  writeFileSync(p, full.slice(0, Math.floor(full.length / 2)));
  let threw = null;
  try {
    validateCa(p);
  } catch (e) {
    threw = e;
  }
  rmSync(dir, { recursive: true, force: true });
  if (!threw) throw new Error("expected a throw for a truncated PEM block");
});

const harnessForOpenssl = { reportFail, reportSkip };
if (!opensslAvailableForCaFixtures()) {
  reportOpensslMissing(harnessForOpenssl, "validateCa negative fixtures (not-a-CA / wrong-fingerprint / expired)", 3);
} else {
  const fixDir = freshDir("dsnpipe-ca-fixtures-");

  testCase("a cert WITHOUT basicConstraints CA:TRUE fails closed (not a CA)", () => {
    const { crtPath } = mintCert(fixDir, "leaf-not-a-ca", { ca: false });
    let threw = null;
    try {
      validateCa(crtPath);
    } catch (e) {
      threw = e;
    }
    if (!threw) throw new Error("expected a throw for a non-CA certificate");
    if (!/CA:TRUE/.test(threw.message)) throw new Error(`expected the CA:TRUE reason, got: ${threw.message}`);
  });

  testCase("a DIFFERENT, currently-valid CA cert fails closed on FINGERPRINT MISMATCH", () => {
    const { crtPath } = mintCert(fixDir, "different-ca", { ca: true });
    let threw = null;
    try {
      validateCa(crtPath);
    } catch (e) {
      threw = e;
    }
    if (!threw) throw new Error("expected a throw for a fingerprint mismatch");
    if (!/fingerprint/i.test(threw.message)) throw new Error(`expected a fingerprint-shaped reason, got: ${threw.message}`);
  });

  testCase("an EXPIRED CA cert fails closed on the validity window", () => {
    const { crtPath } = mintCert(fixDir, "expired-ca", { ca: true, notBefore: "20200101000000Z", notAfter: "20200102000000Z" });
    let threw = null;
    try {
      validateCa(crtPath);
    } catch (e) {
      threw = e;
    }
    if (!threw) throw new Error("expected a throw for an expired certificate");
    if (!/validity window/i.test(threw.message)) throw new Error(`expected a validity-window reason, got: ${threw.message}`);
  });

  rmSync(fixDir, { recursive: true, force: true });
}

const SYNTHETIC_DSN = fakeDsn({ user: "selftest_" + MARKER, pass: "pw_" + MARKER, hostport: "127.0.0.1:59999", db: "selftestdb" });

// ---------------------------------------------------------------------------
// Failure modes -- HONEST (D1): every refusal is checked for spawnError/signal/timeout too.
// ---------------------------------------------------------------------------
console.log("\nfailure modes (honest -- D1):");

await asyncTestCase("a malformed DSN on stdin refuses cleanly without echoing the malformed input", async () => {
  const garbage = "not-a-dsn-at-all-§§§-XYZMARKER";
  const r = await runDsnPipe({ scriptPath: DSN_PIPE_SRC, dsn: garbage, args: ["--", "echo", "should-not-run"] });
  assertCleanRefusal(r);
  if (r.stdout.includes("should-not-run")) throw new Error("the child must never have started");
  if (r.stderr.includes(garbage) || r.stdout.includes(garbage)) throw new Error("the malformed input must never be echoed");
});
await asyncTestCase("a missing `--` separator refuses cleanly with a usage message", async () => {
  const r = await runDsnPipe({ scriptPath: DSN_PIPE_SRC, dsn: SYNTHETIC_DSN, args: ["echo", "hi"] });
  assertCleanRefusal(r);
  if (!/usage/i.test(r.stderr)) throw new Error(`expected a usage message, got stderr=${r.stderr}`);
});
await asyncTestCase("a leading token before `--` refuses cleanly (C3 -- no silent discard)", async () => {
  const r = await runDsnPipe({ scriptPath: DSN_PIPE_SRC, dsn: SYNTHETIC_DSN, args: ["leading", "--", "echo", "hi"] });
  assertCleanRefusal(r);
});
await asyncTestCase("empty stdin refuses cleanly", async () => {
  const r = await runDsnPipe({ scriptPath: DSN_PIPE_SRC, dsn: "", args: ["--", "echo", "hi"] });
  assertCleanRefusal(r);
});
await asyncTestCase("a missing CA file FAILS CLOSED cleanly before ever attempting to spawn the child", async () => {
  const root = freshDir("dsnpipe-noca-");
  const scriptsDir = join(root, "scripts", "ops");
  mkdirSync(scriptsDir, { recursive: true });
  const copy = join(scriptsDir, "dsn-pipe.mjs");
  writeFileSync(copy, readFileSync(DSN_PIPE_SRC, "utf8"));
  const r = await runDsnPipe({ scriptPath: copy, dsn: SYNTHETIC_DSN, args: ["--", "node", "-e", "console.log('MUST-NOT-RUN')"] });
  rmSync(root, { recursive: true, force: true });
  assertCleanRefusal(r);
  if (r.stdout.includes("MUST-NOT-RUN")) throw new Error("the child must never start when the CA is missing (fail-closed, not fail-open)");
});
await asyncTestCase("the child's own exit code passes through untouched (a SUCCESS path, not a refusal)", async () => {
  const r = await runDsnPipe({ scriptPath: DSN_PIPE_SRC, dsn: SYNTHETIC_DSN, args: ["--", "node", "-e", "process.exit(37)"] });
  if (r.spawnError || r.timedOut || r.signal !== null) throw new Error(`expected a clean pass-through, got ${JSON.stringify(r)}`);
  if (r.code !== 37) throw new Error(`expected exit 37 to pass through, got ${r.code}`);
});

// ---------------------------------------------------------------------------
// The argv leak cell — this tool's OWN argv, and its CHILD's argv, both proved live, each with
// a POSITIVE CONTROL (D2): the detector must also be shown to catch a KNOWN-LEAKY case.
// ---------------------------------------------------------------------------
console.log("\nargv leak (constraint 4 -- env-to-end, never printed), with positive controls (D2):");

function argvListContainsMarker(argvArray) {
  return argvArray.some((a) => String(a).includes(MARKER));
}

testCase("(D2) positive control: argvListContainsMarker DOES catch a deliberately-leaky argv", () => {
  if (!argvListContainsMarker(["node", "--evil=" + MARKER])) {
    throw new Error("the detector failed to catch a KNOWN leak -- it cannot say NO, so its silence proves nothing");
  }
});
testCase("(D2) negative control: argvListContainsMarker does NOT false-positive on a clean argv", () => {
  if (argvListContainsMarker(["node", "-e", "console.log(1)"])) {
    throw new Error("the detector false-positived on a genuinely clean argv");
  }
});

await asyncTestCase("the DSN never appears in the CHILD's own process.argv (the child self-reports it)", async () => {
  const grandchildScript = "console.log('ARGV:' + JSON.stringify(process.argv));";
  const r = await runDsnPipe({ scriptPath: DSN_PIPE_SRC, dsn: SYNTHETIC_DSN, args: ["--", "node", "-e", grandchildScript] });
  const line = r.stdout.split("\n").find((l) => l.startsWith("ARGV:"));
  if (!line) throw new Error(`grandchild never reported its argv; stdout was:\n${r.stdout}\nstderr:\n${r.stderr}`);
  const reportedArgv = JSON.parse(line.slice("ARGV:".length));
  if (argvListContainsMarker(reportedArgv)) throw new Error(`the DSN marker leaked into the child's own argv: ${line}`);
});

await asyncTestCase("the DSN never appears in dsn-pipe.mjs's OWN process cmdline (live /proc read, Linux/WSL only)", async () => {
  if (process.platform !== "linux") skipHere("proc-fs is Linux/WSL-only; this platform has no /proc/<pid>/cmdline to read");
  const { spawn } = await import("node:child_process");
  const grandchildScript = "setTimeout(() => {}, 1500);"; // keep the whole chain alive briefly
  const child = spawn(process.execPath, [DSN_PIPE_SRC, "--", "node", "-e", grandchildScript], { stdio: ["pipe", "ignore", "ignore"] });
  child.stdin.write(SYNTHETIC_DSN);
  child.stdin.end();
  await new Promise((r) => setTimeout(r, 300)); // let it actually start
  let cmdline = "";
  try {
    cmdline = readFileSync(`/proc/${child.pid}/cmdline`, "utf8").replace(/\0/g, " ");
  } catch (e) {
    child.kill();
    skipHere(`could not read /proc/${child.pid}/cmdline: ${e.message}`);
  }
  child.kill();
  if (cmdline.includes(MARKER)) throw new Error(`the DSN marker leaked into dsn-pipe.mjs's own cmdline: ${cmdline}`);
});

// ---------------------------------------------------------------------------
// The disk leak cell — cwd AND the OS tmpdir (D3), each with a positive control (D2).
// ---------------------------------------------------------------------------
console.log("\ndisk leak (no file, anywhere, ever carries the dsn), with positive controls (D2):");

function dirTreeContainsMarker(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (dirTreeContainsMarker(p)) return true;
    } else if (entry.isFile()) {
      if (readFileSync(p, "utf8").includes(MARKER)) return true;
    }
  }
  return false;
}

testCase("(D2) positive control: dirTreeContainsMarker DOES catch a deliberately-leaky file", () => {
  const dir = freshDir("dsnpipe-diskleak-positive-control-");
  writeFileSync(join(dir, "leaky.txt"), "oops: " + MARKER);
  const caught = dirTreeContainsMarker(dir);
  rmSync(dir, { recursive: true, force: true });
  if (!caught) throw new Error("the detector failed to catch a KNOWN leak -- it cannot say NO, so its silence proves nothing");
});
testCase("(D2) negative control: dirTreeContainsMarker does NOT false-positive on clean files", () => {
  const dir = freshDir("dsnpipe-diskleak-negative-control-");
  writeFileSync(join(dir, "clean.txt"), "nothing to see here");
  const caught = dirTreeContainsMarker(dir);
  rmSync(dir, { recursive: true, force: true });
  if (caught) throw new Error("the detector false-positived on a genuinely clean file");
});

await asyncTestCase("a full run writes NO file under its own CWD, and never prints the marker to stdout/stderr", async () => {
  const cwd = freshDir("dsnpipe-diskleak-cwd-");
  const before = readdirSync(cwd);
  const r = await runDsnPipe({ scriptPath: DSN_PIPE_SRC, dsn: SYNTHETIC_DSN, cwd, args: ["--", "node", "-e", "console.log('ok'); process.exit(0)"] });
  const after = readdirSync(cwd);
  const leaked = dirTreeContainsMarker(cwd);
  rmSync(cwd, { recursive: true, force: true });
  if (before.length !== 0 || after.length !== 0) throw new Error(`expected an empty cwd throughout, saw after=${JSON.stringify(after)}`);
  if (leaked) throw new Error("a file under cwd carried the marker");
  if (r.stdout.includes(MARKER) || r.stderr.includes(MARKER)) throw new Error("the marker must never reach dsn-pipe's own stdout/stderr");
});

await asyncTestCase("(D3) a full run writes NO file into the OS TEMP DIR either (TMPDIR/TMP/TEMP redirected to a fresh, watched dir)", async () => {
  const fakeTmp = freshDir("dsnpipe-diskleak-tmpdir-");
  const before = readdirSync(fakeTmp);
  const env = { ...process.env, TMPDIR: fakeTmp, TMP: fakeTmp, TEMP: fakeTmp };
  const r = await runDsnPipe({ scriptPath: DSN_PIPE_SRC, dsn: SYNTHETIC_DSN, env, args: ["--", "node", "-e", "console.log('ok'); process.exit(0)"] });
  const after = readdirSync(fakeTmp);
  const leaked = dirTreeContainsMarker(fakeTmp);
  rmSync(fakeTmp, { recursive: true, force: true });
  if (before.length !== 0 || after.length !== 0) throw new Error(`expected the redirected temp dir to stay empty, saw after=${JSON.stringify(after)}`);
  if (leaked) throw new Error("a file under the OS temp dir carried the marker");
  if (r.stdout.includes(MARKER) || r.stderr.includes(MARKER)) throw new Error("the marker must never reach dsn-pipe's own stdout/stderr");
});

// ---------------------------------------------------------------------------
// The TLS wall, both directions -- against a THROWAWAY local fixture, never the real pooler.
// The REAL, unmodified buildChildEnv() (imported directly from dsn-pipe.mjs) builds the env for
// a throwaway CA; a fresh child process is spawned with that env to attempt the connection. This
// deliberately bypasses the CLI's validateCa() preflight gate (which pins the ONE production
// CA's exact fingerprint, review C1, and would refuse any throwaway fixture before a connection
// is ever attempted) -- validateCa() is proved separately, directly, in the (C1) section above.
// (The real node-postgres path is D4, in the sibling dsn-pipe.pgpath.selftest.mjs.)
// ---------------------------------------------------------------------------
console.log("\nthe TLS wall, both directions (local throwaway fixture, raw TLS probe):");

function startLocalTlsServer(keyPath, crtPath) {
  return new Promise((resolvePromise) => {
    const server = createTlsServer({ key: readFileSync(keyPath), cert: readFileSync(crtPath) }, (socket) => {
      socket.end("hello\n");
    });
    server.listen(0, "127.0.0.1", () => resolvePromise(server));
  });
}

if (!opensslAvailableForCaFixtures()) {
  reportOpensslMissing(harnessForOpenssl, "TLS wall admits on the matching CA", 1);
  reportOpensslMissing(harnessForOpenssl, "TLS wall refuses on a mismatched CA", 1);
} else {
  const certDir = freshDir("dsnpipe-certs-");
  const real = mintCert(certDir, "fixture-real", { ca: true });
  const other = mintCert(certDir, "fixture-other", { ca: true }); // an unrelated CA -- must NOT be trusted
  const server = await startLocalTlsServer(real.keyPath, real.crtPath);
  const port = server.address().port;
  const probeScript = `
    const tls = require("tls");
    const s = tls.connect({ host: "127.0.0.1", port: ${port}, servername: "127.0.0.1" }, () => {
      console.log("TLS_OK"); s.end(); process.exit(0);
    });
    s.on("error", (e) => { console.log("TLS_FAIL:" + e.code); process.exit(1); });
  `;

  await asyncTestCase("WITH the matching CA pinned, the child's raw TLS connect SUCCEEDS", async () => {
    const r = await spawnWithBuiltEnv({ dsnPipeSrc: DSN_PIPE_SRC, dsn: SYNTHETIC_DSN, caPath: real.crtPath, probeScript });
    if (!r.stdout.includes("TLS_OK")) throw new Error(`expected TLS_OK, got stdout=${r.stdout} stderr=${r.stderr} code=${r.code}`);
  });

  await asyncTestCase("WITHOUT the matching CA (a different one pinned instead), the child's raw TLS connect is REFUSED", async () => {
    const r = await spawnWithBuiltEnv({ dsnPipeSrc: DSN_PIPE_SRC, dsn: SYNTHETIC_DSN, caPath: other.crtPath, probeScript });
    if (!r.stdout.includes("TLS_FAIL:")) throw new Error(`expected a refusal (TLS_FAIL:<code>), got stdout=${r.stdout} stderr=${r.stderr} code=${r.code}`);
    if (r.stdout.includes("TLS_OK")) throw new Error("a mismatched CA must never be silently trusted");
  });

  server.close();
  rmSync(certDir, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
process.exit(summarize());
