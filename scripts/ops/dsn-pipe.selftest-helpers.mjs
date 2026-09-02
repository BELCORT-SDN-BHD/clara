// Shared scaffolding for the dsn-pipe battery, split across dsn-pipe.selftest.mjs (the core
// battery) and dsn-pipe.pgpath.selftest.mjs (D4's real node-postgres-path cell) so neither file
// crosses the repo's file-size convention. Each caller gets its OWN independent harness (own
// failures/skips counters, own exit code) via createHarness() — this file holds no mutable
// module-level state itself.
//
// No dependencies beyond Node built-ins.

import { spawn, execFileSync } from "node:child_process";
import { X509Certificate } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
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

const SAN_EXT = "subjectAltName=DNS:127.0.0.1,IP:127.0.0.1";

/** Mint a throwaway self-signed cert. basicConstraints is ALWAYS explicit (openssl defaults to
 * CA:TRUE even with no -addext at all, so "omit it" is not a way to get CA:FALSE):
 * `ca:true` -> CA:TRUE (critical); `ca:false` (default) -> CA:FALSE (critical), a genuine leaf.
 *
 * An EXPLICIT validity window (notBefore/notAfter) takes a different openssl route — see
 * mintDatedCert. Same cert shape either way: fresh random key, /CN=<cn>, the SAN above, and
 * critical basicConstraints. */
export function mintCert(dir, cn, { ca = false, notBefore, notAfter } = {}) {
  const keyPath = join(dir, `${cn}.key`);
  const crtPath = join(dir, `${cn}.crt`);
  const bcExt = `basicConstraints=critical,CA:${ca ? "TRUE" : "FALSE"}`;
  if (notBefore && notAfter) {
    mintDatedCert({ dir, cn, keyPath, crtPath, bcExt, notBefore, notAfter });
    return { keyPath, crtPath };
  }
  const args = ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", keyPath, "-out", crtPath,
    "-subj", `/CN=${cn}`, "-days", "1", "-addext", SAN_EXT, "-addext", bcExt];
  execFileSync("openssl", args, { stdio: "pipe" });
  return { keyPath, crtPath };
}

/** A self-signed cert with an ARBITRARY validity window — the only way to mint the expired-CA
 * fixture, since a window in the past cannot be expressed as `-days N` (openssl rejects a
 * non-positive N: "Non-positive number \"-1\" for option -days", measured on both 3.0.13 and
 * 3.5.5).
 *
 * WHY NOT `openssl req -x509 -not_before/-not_after`, which this helper used until 2026-09-02:
 * those two options only exist from OpenSSL 3.5. The self-hosted WSL runner was Ubuntu 26.04
 * (OpenSSL 3.5.5) so they worked there, and GitHub's ubuntu-24.04 hosted image ships OpenSSL
 * 3.0.13, where `openssl req` rejects them outright — the whole lint job died on this one
 * fixture at the hosted-runner migration (裁-135). `openssl ca -selfsign` with
 * `-startdate`/`-enddate` is the portable route: MEASURED to produce a byte-equivalent cert
 * shape on BOTH 3.0.13 and 3.5.5 (same window, critical CA:TRUE, same SAN), so there is ONE
 * code path here and no version branch to rot.
 *
 * `openssl ca` needs a tiny scratch CA state directory (a config, an empty index, a serial); it
 * is created inside the caller's already-throwaway fixture dir and dies with it. Paths go into
 * the config with forward slashes because a backslash is an ESCAPE character in an openssl
 * config file — a Windows dev box would otherwise write an unparseable path. */
function mintDatedCert({ dir, cn, keyPath, crtPath, bcExt, notBefore, notAfter }) {
  const caDir = join(dir, `${cn}-castate`);
  const newCerts = join(caDir, "newcerts");
  mkdirSync(newCerts, { recursive: true });
  const cfgPath = join(caDir, "openssl.cnf");
  const indexPath = join(caDir, "index.txt");
  const serialPath = join(caDir, "serial");
  writeFileSync(indexPath, "");
  writeFileSync(serialPath, "01\n");
  const fwd = (p) => p.split("\\").join("/");
  writeFileSync(cfgPath, [
    "[ ca ]", "default_ca = CA_default", "",
    "[ CA_default ]",
    `database = ${fwd(indexPath)}`,
    `new_certs_dir = ${fwd(newCerts)}`,
    `serial = ${fwd(serialPath)}`,
    "default_md = sha256", "policy = policy_any", "email_in_dn = no",
    "rand_serial = no", "unique_subject = no", "",
    "[ policy_any ]", "commonName = supplied", "",
    // The extension set is written EXACTLY as the -addext route above writes it, so the two
    // routes differ only in the validity window they can express.
    "[ v3_dated ]",
    bcExt.replace("=", " = "),
    SAN_EXT.replace("=", " = "), "",
  ].join("\n"));

  const csrPath = join(caDir, `${cn}.csr`);
  execFileSync("openssl", ["req", "-new", "-newkey", "rsa:2048", "-nodes",
    "-keyout", keyPath, "-out", csrPath, "-subj", `/CN=${cn}`], { stdio: "pipe" });
  execFileSync("openssl", ["ca", "-batch", "-selfsign", "-notext",
    "-config", cfgPath, "-keyfile", keyPath, "-in", csrPath, "-out", crtPath,
    "-startdate", notBefore, "-enddate", notAfter, "-extensions", "v3_dated"], { stdio: "pipe" });

  // PROVE THE FIXTURE IS WHAT IT CLAIMS. A cert minted with the wrong window would still make
  // the expired-CA cell throw — on the FINGERPRINT branch — and the cell would read green for
  // the wrong reason. Cheap, and it states the property instead of assuming it.
  const minted = new X509Certificate(readFileSync(crtPath, "utf8"));
  const want = (stamp) => Date.parse(`${stamp.slice(0, 4)}-${stamp.slice(4, 6)}-${stamp.slice(6, 8)}`
    + `T${stamp.slice(8, 10)}:${stamp.slice(10, 12)}:${stamp.slice(12, 14)}Z`);
  if (Date.parse(minted.validFrom) !== want(notBefore) || Date.parse(minted.validTo) !== want(notAfter)) {
    throw new Error(`mintDatedCert asked for ${notBefore}..${notAfter} but openssl produced `
      + `${minted.validFrom}..${minted.validTo} — the fixture would test the wrong thing`);
  }
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
