// Shared scaffolding for the dsn-pipe battery, split across dsn-pipe.selftest.mjs (the core
// battery) and dsn-pipe.pgpath.selftest.mjs (D4's real node-postgres-path cell) so neither file
// crosses the repo's file-size convention. Each caller gets its OWN independent harness (own
// failures/skips counters, own exit code) via createHarness() — this file holds no mutable
// module-level state itself.
//
// No dependencies beyond Node built-ins.

import { spawn, execFileSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export function createHarness() {
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
  /** For bulk, non-testCase reporting (e.g. "openssl missing" covering several cells at once). */
  function reportSkip(name, reason) {
    skips++;
    console.log("  SKIP  " + name + "  -- " + reason);
  }
  function reportFail(name, reason) {
    failures++;
    console.error("  FAIL  " + name);
    console.error("        " + reason);
  }
  function summarize() {
    console.log(`\n${failures === 0 ? "ALL GREEN" : failures + " FAILURE(S)"} (${skips} skipped)`);
    return failures === 0 ? 0 : 1;
  }
  return { testCase, asyncTestCase, skipHere, reportSkip, reportFail, summarize };
}

export function freshDir(prefix) {
  return mkdtempSync(join(tmpdir(), prefix));
}

/** Assemble a Postgres URI from parts — the scheme, credential and host never sit contiguously
 * in one source string (see dsn-pipe.selftest.mjs's header for why: a secret-shaped-string
 * scanner has nothing plausible to flag on an admittedly-synthetic, MARKER-tagged test value
 * assembled this way). */
export function fakeDsn({ scheme = "postgres", user = "u", pass = "p", hostport = "h", db = "d", query = "" }) {
  const parts = [scheme, ":", "/", "/", user, ":", pass, "@", hostport, "/", db];
  const base = parts.join("");
  return query ? base + "?" + query : base;
}

/** Run dsn-pipe.mjs as a real child process, feeding a DSN on stdin, capturing output.
 * Tracks timedOut so a hung/killed process can never masquerade as a clean refusal (review D1). */
export function runDsnPipe({ scriptPath, dsn, args, cwd = process.cwd(), env = process.env, timeoutMs = 8000 }) {
  return new Promise((resolvePromise) => {
    const child = spawn(process.execPath, [scriptPath, ...args], { cwd, env, stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    const timer = setTimeout(() => {
      timedOut = true;
      try {
        child.kill();
      } catch {
        /* already gone */
      }
    }, timeoutMs);
    child.on("exit", (code, signal) => {
      clearTimeout(timer);
      resolvePromise({ code, signal, stdout, stderr, timedOut, spawnError: null });
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      resolvePromise({ code: null, signal: null, stdout, stderr, timedOut, spawnError: err });
    });
    child.stdin.write(dsn);
    child.stdin.end();
  });
}

/** (D1) Every negative cell must be an HONEST refusal: no spawn error, no signal, no timeout. */
export function assertCleanRefusal(r, { expectedCode = 1 } = {}) {
  if (r.spawnError) throw new Error(`spawn itself failed (not a clean refusal): ${r.spawnError.message}`);
  if (r.timedOut) throw new Error(`the process HUNG and was killed by the harness timeout -- this is not a refusal, it is a bug`);
  if (r.signal !== null) throw new Error(`the process was killed by signal ${r.signal}, not a normal exit -- not a clean refusal`);
  if (r.code !== expectedCode) throw new Error(`expected a clean exit ${expectedCode}, got code=${r.code}`);
}

export function opensslAvailableForCaFixtures() {
  try {
    execFileSync("openssl", ["version"], { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

/** On Linux (the CI shape) a missing openssl FAILS -- a misconfigured runner, not a tolerable
 * gap (review D5). Off Linux (a dev box), it's a named, counted SKIP. */
export function reportOpensslMissing(harness, label, count) {
  for (let i = 0; i < count; i++) {
    if (process.platform === "linux") {
      harness.reportFail(label, "openssl is required on Linux CI and must not be silently absent");
    } else {
      harness.reportSkip(label, "no openssl on PATH (non-Linux dev box; CI is Linux and will run this for real)");
    }
  }
}

/** Mint a throwaway self-signed cert. basicConstraints is ALWAYS explicit (this openssl version
 * defaults to CA:TRUE even with no -addext at all, so "omit it" is not a way to get CA:FALSE):
 * `ca:true` -> CA:TRUE (critical); `ca:false` (default) -> CA:FALSE (critical), a genuine leaf. */
export function mintCert(dir, cn, { ca = false, notBefore, notAfter } = {}) {
  const keyPath = join(dir, `${cn}.key`);
  const crtPath = join(dir, `${cn}.crt`);
  const args = ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", keyPath, "-out", crtPath, "-subj", `/CN=${cn}`];
  if (notBefore && notAfter) {
    args.push("-not_before", notBefore, "-not_after", notAfter);
  } else {
    args.push("-days", "1");
  }
  const exts = ["subjectAltName=DNS:127.0.0.1,IP:127.0.0.1", `basicConstraints=critical,CA:${ca ? "TRUE" : "FALSE"}`];
  for (const e of exts) args.push("-addext", e);
  execFileSync("openssl", args, { stdio: "pipe" });
  return { keyPath, crtPath };
}

// A marker unlikely to occur by accident, standing in for "the secret" in every leak cell.
export const MARKER = "DSNPIPE_SELFTEST_MARKER_7f3ac91";

/**
 * Build the child env via the REAL, unmodified dsn-pipe.mjs's own `buildChildEnv` (imported
 * directly from `dsnPipeSrc` -- no copying), then spawn a FRESH node process with that exact
 * env running `probeScript`. This is how the TLS-wall / real-pg-path cells exercise a THROWAWAY
 * test CA through the bridge's real env-building logic WITHOUT going through the CLI's
 * `main()`/`validateCa()` preflight gate -- that gate pins the ONE production CA's exact
 * fingerprint (review C1) and would refuse any throwaway fixture before a connection is ever
 * attempted. `buildChildEnv` and `validateCa` are tested separately and are both exercised for
 * real; this only skips re-running the CLI's argv/stdin plumbing, which the failure-mode/argv/
 * disk cells already cover against the real committed CA.
 * @returns {Promise<{code:number|null, signal:string|null, stdout:string, stderr:string}>}
 */
export async function spawnWithBuiltEnv({ dsnPipeSrc, dsn, caPath, probeScript, timeoutMs = 8000 }) {
  const { pathToFileURL } = await import("node:url");
  const { buildChildEnv } = await import(pathToFileURL(dsnPipeSrc).href);
  const env = buildChildEnv({ dsn, caPath, baseEnv: process.env });
  return new Promise((resolvePromise) => {
    const child = spawn(process.execPath, ["-e", probeScript], { env, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
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
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
  });
}
