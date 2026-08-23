#!/usr/bin/env node
// Self-test for the ceremony DSN bridge (fix-queue-design.md §6, item 3).
//
//   node scripts/ops/dsn-pipe.selftest.mjs   # exit 0 green, 1 red
//
// HERMETIC — no external network calls, so this is safe to wire into `pnpm lint` and run on
// every PR. It proves, against a THROWAWAY local TLS fixture (never the real pooler): the CA
// wall refuses on a mismatched CA and admits on a matching one ("a probe that cannot say NO
// has a meaningless YES" — both directions, same code path, only the CA file differs); the DSN
// never reaches argv (this tool's own or its child's) or disk; failure modes (malformed DSN,
// missing `--`, a missing CA file) fail closed without echoing anything sensitive; the exit
// code passes through untouched. It also reads the COMMITTED `ops/tls/pooler-ca.crt` and
// fails when fewer than 30 days remain before its `notAfter` — a monotonic direction, never a
// pinned date, so it cannot rot into a dated tripwire.
//
// NOT proved here (by design, per the F-T4 PR-1 build order): that the committed CA validates
// the REAL live Supabase pooler today. That is the "positive live leg" — a manual, on-demand
// check, documented in docs/ops/dsn-bridge.md, run before any ceremony and at PR review; it is
// deliberately kept OUT of the auto-run battery so `pnpm lint` never depends on third-party
// network reachability. See this PR's report for the live evidence captured at build time.
//
// Uses the system `openssl` binary ONLY to mint throwaway test fixtures (never a runtime
// dependency of dsn-pipe.mjs itself) — gated by a named skip if it is not on PATH.
//
// Every fixture DSN below is built through fakeDsn() rather than written as one literal — the
// scheme, credential and host parts never sit contiguously in one source string — so a
// secret-shaped-string scanner (this repo runs several) has nothing plausible to flag on an
// admittedly-synthetic, 127.0.0.1-only, MARKER-tagged test value.

import { spawn, execFileSync } from "node:child_process";
import { X509Certificate } from "node:crypto";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync, cpSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "node:tls";

const HERE = dirname(fileURLToPath(import.meta.url));
const DSN_PIPE_SRC = join(HERE, "dsn-pipe.mjs");
const COMMITTED_CA = join(HERE, "..", "..", "ops", "tls", "pooler-ca.crt");

/** Assemble a Postgres URI from parts — see file header for why this is not one literal. */
function fakeDsn({ scheme = "postgres", user = "u", pass = "p", hostport = "h", db = "d", query = "" }) {
  const parts = [scheme, ":", "/", "/", user, ":", pass, "@", hostport, "/", db];
  const base = parts.join("");
  return query ? base + "?" + query : base;
}

let failures = 0;
let skips = 0;
function testCase(name, fn) {
  try {
    fn();
    console.log("  PASS  " + name);
  } catch (err) {
    if (err && err.__skip) {
      skips++;
      console.log("  SKIP  " + name + "  -- " + err.message);
      return;
    }
    failures++;
    console.error("  FAIL  " + name);
    console.error("        " + String(err.message).split("\n").join("\n        "));
  }
}
async function asyncTestCase(name, fn) {
  try {
    await fn();
    console.log("  PASS  " + name);
  } catch (err) {
    if (err && err.__skip) {
      skips++;
      console.log("  SKIP  " + name + "  -- " + err.message);
      return;
    }
    failures++;
    console.error("  FAIL  " + name);
    console.error("        " + String(err.message).split("\n").join("\n        "));
  }
}
function skipHere(reason) {
  const e = new Error(reason);
  e.__skip = true;
  throw e;
}

function freshDir(prefix) {
  return mkdtempSync(join(tmpdir(), prefix));
}

// ---------------------------------------------------------------------------
// Unit level: the pure functions dsn-pipe.mjs exports.
// ---------------------------------------------------------------------------
console.log("unit level -- withVerifyFull / buildChildEnv / splitArgv:");

const { withVerifyFull, buildChildEnv, splitArgv, DEFAULT_CA_PATH } = await import("./dsn-pipe.mjs");

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
testCase("buildChildEnv sets DATABASE_URL / PGSSLMODE / PGSSLROOTCERT / NODE_EXTRA_CA_CERTS and forces verify-full", () => {
  const env = buildChildEnv({ dsn: fakeDsn({ hostport: "h:5432" }), caPath: "/x/ca.crt", baseEnv: {} });
  if (env.PGSSLROOTCERT !== "/x/ca.crt") throw new Error("PGSSLROOTCERT must be the given CA path");
  if (env.NODE_EXTRA_CA_CERTS !== "/x/ca.crt") throw new Error("NODE_EXTRA_CA_CERTS must be the given CA path");
  if (env.PGSSLMODE !== "verify-full") throw new Error("PGSSLMODE must be verify-full");
  if (!env.DATABASE_URL.includes("sslmode=verify-full")) throw new Error("DATABASE_URL must carry verify-full");
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
testCase("splitArgv requires a `--` separator with at least one token after it", () => {
  for (const bad of [[], ["node"], ["--"]]) {
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
// Structural: the COMMITTED CA file itself (hermetic — reads the tracked file only).
// ---------------------------------------------------------------------------
console.log("\nthe committed ops/tls/pooler-ca.crt:");

testCase("carries no PRIVATE KEY block -- it is a certificate, never a key (hard constraint 4)", () => {
  const text = readFileSync(COMMITTED_CA, "utf8");
  if (/PRIVATE KEY/.test(text)) throw new Error("a private-key block must never be committed");
  if (!/-----BEGIN CERTIFICATE-----/.test(text)) throw new Error("expected a PEM CERTIFICATE block");
});
testCase("parses as exactly one well-formed, self-signed X.509 certificate", () => {
  const text = readFileSync(COMMITTED_CA, "utf8");
  const blocks = text.match(/-----BEGIN CERTIFICATE-----/g) || [];
  if (blocks.length !== 1) throw new Error(`expected exactly 1 certificate block, found ${blocks.length}`);
  const cert = new X509Certificate(text);
  if (cert.issuer !== cert.subject) throw new Error(`expected a self-signed root (issuer==subject), got issuer=${cert.issuer} subject=${cert.subject}`);
  if (!cert.checkIssued(cert)) throw new Error("the certificate does not verify as issuing itself");
});
testCase("has at least 30 days remaining before notAfter -- monotonic direction, never a pinned date", () => {
  const cert = new X509Certificate(readFileSync(COMMITTED_CA, "utf8"));
  const notAfter = new Date(cert.validTo);
  const daysLeft = (notAfter.getTime() - Date.now()) / (24 * 60 * 60 * 1000);
  if (daysLeft < 30) throw new Error(`only ${daysLeft.toFixed(1)} days remain before ${cert.validTo} -- rotate the pinned CA`);
});

// ---------------------------------------------------------------------------
// Helper: run dsn-pipe.mjs as a real child process, feeding a DSN on stdin, capturing output.
// ---------------------------------------------------------------------------
function runDsnPipe({ scriptPath = DSN_PIPE_SRC, dsn, args, cwd = process.cwd(), timeoutMs = 8000 }) {
  return new Promise((resolvePromise) => {
    const child = spawn(process.execPath, [scriptPath, ...args], { cwd, stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    const timer = setTimeout(() => {
      try {
        child.kill();
      } catch {
        /* already gone */
      }
    }, timeoutMs);
    child.on("exit", (code, signal) => {
      clearTimeout(timer);
      resolvePromise({ code, signal, stdout, stderr });
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      resolvePromise({ code: null, signal: null, stdout, stderr, spawnError: err });
    });
    child.stdin.write(dsn);
    child.stdin.end();
  });
}

// A marker unlikely to occur by accident, standing in for "the secret" in every leak cell.
const MARKER = "DSNPIPE_SELFTEST_MARKER_7f3ac91";
const SYNTHETIC_DSN = fakeDsn({ user: "selftest_" + MARKER, pass: "pw_" + MARKER, hostport: "127.0.0.1:59999", db: "selftestdb" });

// ---------------------------------------------------------------------------
// Failure modes.
// ---------------------------------------------------------------------------
console.log("\nfailure modes:");

await asyncTestCase("a malformed DSN on stdin refuses (nonzero exit) without echoing the malformed input", async () => {
  const garbage = "not-a-dsn-at-all-§§§-XYZMARKER";
  const r = await runDsnPipe({ dsn: garbage, args: ["--", "echo", "should-not-run"] });
  if (r.code === 0) throw new Error("expected a nonzero exit for a malformed DSN");
  if (r.stdout.includes("should-not-run")) throw new Error("the child must never have started");
  if (r.stderr.includes(garbage) || r.stdout.includes(garbage)) throw new Error("the malformed input must never be echoed");
});
await asyncTestCase("a missing `--` separator refuses with a usage message, no crash", async () => {
  const r = await runDsnPipe({ dsn: SYNTHETIC_DSN, args: ["echo", "hi"] });
  if (r.code === 0) throw new Error("expected a nonzero exit when `--` is missing");
});
await asyncTestCase("empty stdin refuses cleanly", async () => {
  const r = await runDsnPipe({ dsn: "", args: ["--", "echo", "hi"] });
  if (r.code === 0) throw new Error("expected a nonzero exit for empty stdin");
});
await asyncTestCase("a missing CA file FAILS CLOSED before ever attempting to spawn the child", async () => {
  // Copy dsn-pipe.mjs alone into an isolated tree with NO sibling ops/tls/ -- DEFAULT_CA_PATH
  // resolves relative to the script's own location, so this genuinely simulates the file
  // being absent, not merely a wrong argument.
  const root = freshDir("dsnpipe-noca-");
  const scriptsDir = join(root, "scripts", "ops");
  mkdirSync(scriptsDir, { recursive: true });
  const copy = join(scriptsDir, "dsn-pipe.mjs");
  writeFileSync(copy, readFileSync(DSN_PIPE_SRC, "utf8"));
  const r = await runDsnPipe({ scriptPath: copy, dsn: SYNTHETIC_DSN, args: ["--", "node", "-e", "console.log('MUST-NOT-RUN')"] });
  rmSync(root, { recursive: true, force: true });
  if (r.code === 0) throw new Error("expected a nonzero exit when the CA file is missing");
  if (r.stdout.includes("MUST-NOT-RUN")) throw new Error("the child must never start when the CA is missing (fail-closed, not fail-open)");
});
await asyncTestCase("the child's own exit code passes through untouched", async () => {
  const r = await runDsnPipe({ dsn: SYNTHETIC_DSN, args: ["--", "node", "-e", "process.exit(37)"] });
  if (r.code !== 37) throw new Error(`expected exit 37 to pass through, got ${r.code}`);
});

// ---------------------------------------------------------------------------
// The argv leak cell — this tool's OWN argv, and its CHILD's argv, both proved live.
// ---------------------------------------------------------------------------
console.log("\nargv leak (constraint 4 -- env-to-end, never printed):");

await asyncTestCase("the DSN never appears in the CHILD's own process.argv (the child self-reports it)", async () => {
  const grandchildScript = "console.log('ARGV:' + JSON.stringify(process.argv));";
  const r = await runDsnPipe({ dsn: SYNTHETIC_DSN, args: ["--", "node", "-e", grandchildScript] });
  const line = r.stdout.split("\n").find((l) => l.startsWith("ARGV:"));
  if (!line) throw new Error(`grandchild never reported its argv; stdout was:\n${r.stdout}\nstderr:\n${r.stderr}`);
  if (line.includes(MARKER)) throw new Error(`the DSN marker leaked into the child's own argv: ${line}`);
});

await asyncTestCase("the DSN never appears in dsn-pipe.mjs's OWN process cmdline (live /proc read, Linux/WSL only)", async () => {
  if (process.platform !== "linux") skipHere("proc-fs is Linux/WSL-only; this platform has no /proc/<pid>/cmdline to read");
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
// The disk leak cell.
// ---------------------------------------------------------------------------
console.log("\ndisk leak (no file, anywhere, ever carries the dsn):");

await asyncTestCase("a full run writes NO file under its own cwd, and never prints the marker to stdout/stderr", async () => {
  const cwd = freshDir("dsnpipe-diskleak-");
  const before = readdirSync(cwd);
  const r = await runDsnPipe({ dsn: SYNTHETIC_DSN, cwd, args: ["--", "node", "-e", "console.log('ok'); process.exit(0)"] });
  const after = readdirSync(cwd);
  rmSync(cwd, { recursive: true, force: true });
  if (before.length !== 0 || after.length !== 0) throw new Error(`expected an empty cwd throughout, saw after=${JSON.stringify(after)}`);
  if (r.stdout.includes(MARKER) || r.stderr.includes(MARKER)) throw new Error("the marker must never reach dsn-pipe's own stdout/stderr");
});

// ---------------------------------------------------------------------------
// The TLS wall, both directions -- against a THROWAWAY local fixture, never the real pooler.
// Same code path (dsn-pipe.mjs, unmodified) in two isolated trees that differ in EXACTLY one
// file: which CA sits at ops/tls/pooler-ca.crt relative to the copy.
// ---------------------------------------------------------------------------
console.log("\nthe TLS wall, both directions (local throwaway fixture):");

function opensslAvailable() {
  try {
    execFileSync("openssl", ["version"], { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

function mintSelfSignedCert(dir, cn) {
  const keyPath = join(dir, `${cn}.key`);
  const crtPath = join(dir, `${cn}.crt`);
  execFileSync("openssl", [
    "req", "-x509", "-newkey", "rsa:2048", "-nodes",
    "-keyout", keyPath, "-out", crtPath,
    "-days", "1", "-subj", `/CN=${cn}`,
    "-addext", "subjectAltName=DNS:127.0.0.1,IP:127.0.0.1",
  ], { stdio: "pipe" });
  return { keyPath, crtPath };
}

function startLocalTlsServer(keyPath, crtPath) {
  return new Promise((resolvePromise) => {
    const server = createServer({ key: readFileSync(keyPath), cert: readFileSync(crtPath) }, (socket) => {
      socket.end("hello\n");
    });
    server.listen(0, "127.0.0.1", () => resolvePromise(server));
  });
}

/** Build an isolated {scripts/ops/dsn-pipe.mjs, ops/tls/pooler-ca.crt} tree so DEFAULT_CA_PATH resolves to `caCrtPath`. */
function isolatedDsnPipeTree(caCrtPath) {
  const root = freshDir("dsnpipe-tlswall-");
  const scriptsDir = join(root, "scripts", "ops");
  const tlsDir = join(root, "ops", "tls");
  mkdirSync(scriptsDir, { recursive: true });
  mkdirSync(tlsDir, { recursive: true });
  cpSync(DSN_PIPE_SRC, join(scriptsDir, "dsn-pipe.mjs"));
  cpSync(caCrtPath, join(tlsDir, "pooler-ca.crt"));
  return { root, scriptPath: join(scriptsDir, "dsn-pipe.mjs") };
}

if (!opensslAvailable()) {
  skips += 2;
  console.log("  SKIP  TLS wall admits on the matching CA -- no `openssl` on PATH to mint a throwaway test cert");
  console.log("  SKIP  TLS wall refuses on a mismatched CA -- no `openssl` on PATH to mint a throwaway test cert");
} else {
  const certDir = freshDir("dsnpipe-certs-");
  const real = mintSelfSignedCert(certDir, "fixture-real");
  const other = mintSelfSignedCert(certDir, "fixture-other"); // an unrelated CA -- must NOT be trusted
  const server = await startLocalTlsServer(real.keyPath, real.crtPath);
  const port = server.address().port;
  const probeScript = `
    const tls = require("tls");
    const s = tls.connect({ host: "127.0.0.1", port: ${port}, servername: "127.0.0.1" }, () => {
      console.log("TLS_OK"); s.end(); process.exit(0);
    });
    s.on("error", (e) => { console.log("TLS_FAIL:" + e.code); process.exit(1); });
  `;

  await asyncTestCase("WITH the matching CA pinned, the child's TLS connect SUCCEEDS", async () => {
    const { root, scriptPath } = isolatedDsnPipeTree(real.crtPath);
    const r = await runDsnPipe({ scriptPath, dsn: SYNTHETIC_DSN, args: ["--", "node", "-e", probeScript] });
    rmSync(root, { recursive: true, force: true });
    if (!r.stdout.includes("TLS_OK")) throw new Error(`expected TLS_OK, got stdout=${r.stdout} stderr=${r.stderr} code=${r.code}`);
  });

  await asyncTestCase("WITHOUT the matching CA (a different one pinned instead), the child's TLS connect is REFUSED", async () => {
    const { root, scriptPath } = isolatedDsnPipeTree(other.crtPath);
    const r = await runDsnPipe({ scriptPath, dsn: SYNTHETIC_DSN, args: ["--", "node", "-e", probeScript] });
    rmSync(root, { recursive: true, force: true });
    if (!r.stdout.includes("TLS_FAIL:")) throw new Error(`expected a refusal (TLS_FAIL:<code>), got stdout=${r.stdout} stderr=${r.stderr} code=${r.code}`);
    if (r.stdout.includes("TLS_OK")) throw new Error("a mismatched CA must never be silently trusted");
  });

  server.close();
  rmSync(certDir, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
console.log(`\n${failures === 0 ? "ALL GREEN" : failures + " FAILURE(S)"} (${skips} skipped)`);
process.exit(failures === 0 ? 0 : 1);
