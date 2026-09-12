#!/usr/bin/env node
// #620 AC4 / C-57 / C83.28 / C88.9 — the Storage grant/policy battery.
//
// WHAT THIS IS. A permanent allowed/denied battery for `packages/db/deploy/storage-provision.sql`
// run against a REAL Supabase Storage service on an isolated, disposable stack booted by the
// vendor's own CLI (`supabase start`). It is the first thing in this repository that ever touches
// `storage.objects` RLS or the Storage HTTP API: every other storage-touching test runs under
// `RELAY_TEST_MODE=1`, which routes through a local-filesystem fallback and proves nothing about
// the vendor's boundary (packages/runtime/lib/storage.mjs:143-151,176-186).
//
// WHY NOT A BARE SQL ROLE TEST. `SET ROLE clara_storage_docs; insert into storage.objects ...`
// (the `packages/db/tests/rig-helpers.mjs` idiom) measures the Postgres half only. The 2026-07-26
// incident is the standing proof that this is not enough: a probe that used **PUT** — the verb
// Supabase Storage maps to replace/UPDATE, and the verb the runtime never calls — measured a
// privilege gap that was never on the runtime's path, and `wave-b-storage-update-amendment.sql`
// granted UPDATE on `storage.objects` on the strength of it. Its own REVERT records the
// correction: `putCanonical` sends **POST**. So this battery goes through the REPO'S OWN
// PRODUCTION DOOR wherever the verb exists — `putCanonical` / `verifyCanonical` /
// `downloadCanonical` from `packages/runtime/lib/storage.mjs`, unmodified, with the real
// `CLARA_STORAGE_*` environment — and drops to raw `fetch` ONLY for verbs the runtime never
// calls (upsert, PUT, DELETE, cross-bucket GET, a key the client-side validator refuses to spell).
// A cell that measures a verb production does not use is a cell that can be wrong for a year.
//
// WHAT IT DELIBERATELY DOES NOT PROVE — read `README.md` before citing this run as evidence.
// Chiefly: a CONFORMING key in ANOTHER firm's namespace IS readable and writable by this one
// credential (cell B9, reported as LIMIT, not FAIL). Firm isolation rests on
// `clara.get_document_for_human_read*` and the runtime's live-membership check, never on Storage
// RLS. That is a positive, asserted fact here precisely so nobody mistakes a green battery for
// tenant isolation at the Storage layer.
//
// TEARDOWN IS GUARANTEED, NOT BEST-EFFORT. The stack is disposed in a `finally` and on SIGINT /
// SIGTERM. `clara_storage_docs` is CLUSTER-global and is permanently excluded from
// `packages/db/tests/rig-cluster-reset.mjs`'s droppable roster (it is never migration-minted), so
// there is no role sweep that could clean up after a half-run: disposing the whole stack is the
// only correct cleanup, and cell B11 additionally removes the battery's own objects first.
//
// NO PRODUCTION CREDENTIAL EVER ENTERS THIS PROCESS. Every key, secret and DSN is read from
// `supabase status -o json` at runtime — the CLI's own throwaway stack values, different in shape
// from anything hosted, never hard-coded here and never printed. The DSN reaches `psql` through
// libpq `PG*` variables in the child's environment, never argv (the discipline
// `packages/db/lib/pg.mjs` and `scripts/ops/dsn-pipe.mjs` already keep).
//
// USAGE
//   node packages/db/storage-battery/run.mjs
// Needs Docker and either a `supabase` CLI matching SUPABASE_CLI_VERSION on PATH (what CI's
// `supabase/setup-cli` step provides) or network access for `npx --yes supabase@<version>`.
// On a Windows dev box run it from WSL2 Ubuntu — see README.md.

import { spawnSync } from "node:child_process";
import { createHash, createHmac, randomUUID } from "node:crypto";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import pg from "pg";

import { absent, deniedWith, refusal, wikiWireStatus } from "./verdicts.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const DB_PKG = resolve(HERE, "..");
const REPO = resolve(HERE, "..", "..", "..");

/**
 * PINNED CLI VERSION. `.github/workflows/ci.yml`'s `storage-policy-battery` job passes this same
 * string to `supabase/setup-cli`, and the preflight below REFUSES a PATH binary that reports
 * anything else rather than silently measuring a different vendor build. Bumping the pin is a
 * deliberate, reviewed change: the stack's image set, the storage-api version and the wrapped
 * status-code shapes this battery asserts all move with it.
 */
const SUPABASE_CLI_VERSION = "2.117.0";

/** Must match `supabase/config.toml`'s `project_id` — teardown names containers by it. */
const PROJECT_ID = "clara-storage-battery";
const BUCKET = "firm-docs";
/** A second private bucket, so "refused on another bucket" is a measurement, not an absence. */
const OTHER_BUCKET = "clara-battery-other";
const PROVISION_SQL = resolve(DB_PKG, "deploy", "storage-provision.sql");
const STORAGE_MJS = resolve(REPO, "packages", "runtime", "lib", "storage.mjs");

const NPX = process.platform === "win32" ? "npx.cmd" : "npx";
const PSQL = process.env.PSQL || "psql";

// ---------------------------------------------------------------------------
// Verdict ledger. One line per cell, `PASS|FAIL|LIMIT <id> <what>`; a FAIL anywhere exits 1.
// LIMIT is a measured, deliberately-accepted boundary — it is reported, never silently passed.
// ---------------------------------------------------------------------------
const results = [];
function cell(verdict, id, what) {
  results.push({ verdict, id, what });
  console.log(`${verdict} ${id} ${what}`);
}
function verdictOf(ok, id, what, limit = false) {
  cell(ok ? (limit ? "LIMIT" : "PASS") : "FAIL", id, what);
  return ok;
}

// ---------------------------------------------------------------------------
// Process plumbing.
// ---------------------------------------------------------------------------
function runCommand(command, args, options = {}) {
  const res = spawnSync(command, args, {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    ...options,
  });
  if (res.error) throw res.error;
  return res;
}

/**
 * How this process invokes the Supabase CLI. A binary already on PATH is preferred (CI installs
 * one with `supabase/setup-cli`, and a second `npx` download per run is wasted minutes), but ONLY
 * when it reports exactly SUPABASE_CLI_VERSION — a mismatched PATH binary is a different vendor
 * build measuring different behaviour, so it is passed over rather than trusted.
 */
function resolveCli() {
  const probe = spawnSync("supabase", ["--version"], { encoding: "utf8" });
  const onPath = !probe.error && probe.status === 0 ? String(probe.stdout || "").trim() : null;
  if (onPath === SUPABASE_CLI_VERSION) {
    return { argv: ["supabase"], source: `PATH binary (supabase ${onPath})` };
  }
  const why = onPath ? `PATH binary reports ${onPath}, not ${SUPABASE_CLI_VERSION}` : "no usable supabase on PATH";
  return { argv: [NPX, "--yes", `supabase@${SUPABASE_CLI_VERSION}`], source: `npx supabase@${SUPABASE_CLI_VERSION} (${why})` };
}

let CLI = null;
function cli(args, options = {}) {
  const [command, ...prefix] = CLI.argv;
  return runCommand(command, [...prefix, ...args], options);
}

/** `supabase status -o json` prints a human "Stopped services: [...]" line first; parse from `{`. */
function parseStatusJson(raw) {
  const start = String(raw).indexOf("{");
  if (start < 0) throw new Error("supabase status produced no JSON object");
  return JSON.parse(String(raw).slice(start));
}

/**
 * libpq child environment from the stack's own DSN — the DSN never reaches any argv (the
 * discipline `packages/db/lib/pg.mjs` and `scripts/ops/dsn-pipe.mjs` already keep).
 *
 * Ambient connection variables are DELETED, not blanked. `PGSERVICE=""` is not "no service": libpq
 * reads it as a service NAMED the empty string and psql dies with `definition of service "" not
 * found` (measured on the first run of this battery). Every scrubbed key must actually leave the
 * environment, so an inherited estate DSN can neither be used nor half-used.
 */
function libpqEnv(dbUrl) {
  const u = new URL(dbUrl);
  const env = { ...process.env };
  for (const key of ["DATABASE_URL", "WORKFLOW_POSTGRES_URL", "PGSERVICE", "PGSERVICEFILE", "PGOPTIONS", "PGSSLMODE", "PGSSLROOTCERT"]) {
    delete env[key];
  }
  return {
    ...env,
    PGHOST: u.hostname,
    PGPORT: u.port || "5432",
    PGUSER: decodeURIComponent(u.username),
    PGPASSWORD: decodeURIComponent(u.password),
    PGDATABASE: u.pathname.replace(/^\//, "") || "postgres",
  };
}

// ---------------------------------------------------------------------------
// HS256 JWTs, minted with node:crypto against the STACK'S OWN throwaway secret. No new
// dependency: `jose` is a runtime devDependency, and this file must run from `packages/db`.
// ---------------------------------------------------------------------------
function b64url(value) {
  return Buffer.from(value).toString("base64url");
}
function mintJwt(claims, secret) {
  const head = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64url(JSON.stringify(claims));
  const sig = createHmac("sha256", secret).update(`${head}.${body}`).digest("base64url");
  return `${head}.${body}.${sig}`;
}

// ---------------------------------------------------------------------------
// Raw Storage HTTP — used ONLY for verbs the runtime never calls.
// ---------------------------------------------------------------------------
function objectPath(bucket, key) {
  return `${bucket}/${key.split("/").map(encodeURIComponent).join("/")}`;
}
async function rawObject(apiUrl, method, bucket, key, jwt, { headers = {}, body = null, rawPath = null } = {}) {
  const target = `${apiUrl}/storage/v1/object/${rawPath ?? objectPath(bucket, key)}`;
  const response = await fetch(target, {
    method,
    headers: { authorization: `Bearer ${jwt}`, apikey: jwt, ...headers },
    body,
  });
  const text = await response.text().catch(() => "");
  return { ok: response.ok, status: response.status, body: text.slice(0, 300) };
}

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

// ---------------------------------------------------------------------------
// Lifecycle.
// ---------------------------------------------------------------------------
let disposed = false;
function dispose(workdir) {
  if (disposed) return;
  disposed = true;
  console.log("\n--- teardown: supabase stop --no-backup (disposing the whole stack) ---");
  const res = cli(["stop", "--workdir", workdir, "--project-id", PROJECT_ID, "--no-backup"], {
    stdio: ["ignore", "inherit", "inherit"],
  });
  console.log(`teardown: supabase stop exited ${res.status}`);
}

/** Diagnostic: what, if anything, this project left behind before we start. */
function leftovers() {
  const res = spawnSync("docker", ["ps", "-a", "--filter", `name=supabase_.*_${PROJECT_ID}`, "--format", "{{.Names}}"], {
    encoding: "utf8",
  });
  if (res.error || res.status !== 0) return null;
  return String(res.stdout || "").split("\n").map((s) => s.trim()).filter(Boolean);
}

async function main() {
  console.log("=".repeat(78));
  console.log("PROVIDER STACK (supabase start), local — #620 Storage grant/policy battery");
  console.log("=".repeat(78));

  CLI = resolveCli();
  console.log(`cli:      ${CLI.source}`);
  console.log(`node:     ${process.version}  platform: ${process.platform}`);
  const dockerVersion = spawnSync("docker", ["--version"], { encoding: "utf8" });
  console.log(`docker:   ${dockerVersion.error ? "ABSENT" : String(dockerVersion.stdout || "").trim()}`);
  const psqlVersion = spawnSync(PSQL, ["--version"], { encoding: "utf8" });
  console.log(`psql:     ${psqlVersion.error ? "ABSENT" : String(psqlVersion.stdout || "").trim()}`);
  console.log(`ceremony: ${PROVISION_SQL}`);
  console.log(`door:     ${STORAGE_MJS}`);

  const before = leftovers();
  console.log(`preflight: containers named supabase_*_${PROJECT_ID} before start: ${before === null ? "(docker CLI unavailable)" : before.length === 0 ? "none" : before.join(", ")}`);

  // A DISPOSABLE WORKDIR, never the repo. The CLI writes `.temp/` state into its project
  // directory and mounts that directory into containers; copying the committed config into a
  // scratch dir keeps the tree clean and guarantees no migrations/seed are ever mounted.
  const workdir = process.env.CLARA_STORAGE_BATTERY_WORKDIR || (await mkdtemp(join(tmpdir(), "clara-620-battery-")));
  await mkdir(join(workdir, "supabase"), { recursive: true });
  await cp(join(HERE, "supabase", "config.toml"), join(workdir, "supabase", "config.toml"));
  console.log(`workdir:  ${workdir}`);

  const onSignal = (signal) => {
    console.log(`\n[signal ${signal}] disposing the stack before exit`);
    try {
      dispose(workdir);
    } finally {
      process.exit(130);
    }
  };
  process.once("SIGINT", () => onSignal("SIGINT"));
  process.once("SIGTERM", () => onSignal("SIGTERM"));

  const scratch = await mkdtemp(join(tmpdir(), "clara-620-fixtures-"));

  try {
    console.log("\n--- supabase start ---");
    const started = cli(["start", "--workdir", workdir, "-x", "imgproxy,postgres-meta"], {
      stdio: ["ignore", "inherit", "inherit"],
    });
    if (started.status !== 0) throw new Error(`supabase start failed (exit ${started.status})`);

    const status = cli(["status", "--workdir", workdir, "-o", "json"]);
    if (status.status !== 0) throw new Error(`supabase status failed (exit ${status.status})`);
    const stack = parseStatusJson(status.stdout);
    const apiUrl = stack.API_URL;
    const dbUrl = stack.DB_URL;
    const serviceKey = stack.SERVICE_ROLE_KEY;
    const jwtSecret = stack.JWT_SECRET;
    if (!apiUrl || !dbUrl || !serviceKey || !jwtSecret) {
      throw new Error("supabase status did not report API_URL / DB_URL / SERVICE_ROLE_KEY / JWT_SECRET");
    }
    console.log(`stack:    api=${apiUrl} db=${new URL(dbUrl).host} (keys read at runtime, never printed)`);

    // ---- the private buckets -------------------------------------------------
    for (const bucket of [BUCKET, OTHER_BUCKET]) {
      const made = await fetch(`${apiUrl}/storage/v1/bucket`, {
        method: "POST",
        headers: { authorization: `Bearer ${serviceKey}`, apikey: serviceKey, "content-type": "application/json" },
        body: JSON.stringify({ id: bucket, name: bucket, public: false }),
      });
      if (!made.ok) throw new Error(`could not create private bucket ${bucket} (HTTP ${made.status})`);
    }
    console.log(`buckets:  ${BUCKET} and ${OTHER_BUCKET} created PRIVATE with the stack's own service key`);

    // ---- the ceremony under test --------------------------------------------
    console.log(`\n--- applying ${PROVISION_SQL} ---`);
    const applied = runCommand(PSQL, ["-v", "ON_ERROR_STOP=1", "-X", "-f", PROVISION_SQL], {
      env: libpqEnv(dbUrl),
      stdio: ["ignore", "inherit", "inherit"],
    });
    if (applied.status !== 0) throw new Error(`storage-provision.sql failed (exit ${applied.status})`);

    // ---- the three credentials ----------------------------------------------
    const now = Math.floor(Date.now() / 1000);
    const jwtA = mintJwt({ role: "clara_storage_docs", iss: "clara-620-battery", sub: "battery", iat: now, exp: now + 600 }, jwtSecret);
    const jwtB = mintJwt({ role: "authenticated", iss: "clara-620-battery", sub: "battery", iat: now, exp: now + 600 }, jwtSecret);
    const jwtC = mintJwt({ role: "clara_storage_docs", iss: "clara-620-battery", sub: "battery", iat: now - 7200, exp: now - 3600 }, jwtSecret);

    // ---- the production door, configured exactly as the runtime configures it --
    process.env.CLARA_STORAGE_URL = `${apiUrl}/storage/v1/object/${BUCKET}`;
    process.env.CLARA_STORAGE_ROLE = "clara_storage_docs";
    process.env.CLARA_STORAGE_ROLE_JWT = jwtA;
    delete process.env.RELAY_TEST_MODE;
    delete process.env.CLARA_TEST_STORAGE_DIR;
    const door = await import(pathToFileURL(STORAGE_MJS).href);

    const firmA = randomUUID();
    const firmB = randomUUID();
    const payload = Buffer.from(`clara-620-storage-battery\n${randomUUID()}\n`, "utf8");
    const shaA = sha256(payload);
    const keyA = `firms/${firmA}/docs/${shaA}.bin`;
    const fixture = join(scratch, "object.bin");
    await writeFile(fixture, payload);

    console.log("\n--- cells ---");

    // B1 -----------------------------------------------------------------------
    let b1 = null;
    try {
      b1 = await door.putCanonical(fixture, keyA, "application/octet-stream");
    } catch (err) {
      b1 = { error: `${err.code ?? "error"}: ${err.message}` };
    }
    verdictOf(b1?.created === true && b1?.existed === false, "B1",
      `POST a conforming key through putCanonical -> created (${JSON.stringify(b1)})`);

    // B2 -----------------------------------------------------------------------
    let b2 = null;
    try {
      b2 = await door.putCanonical(fixture, keyA, "application/octet-stream");
    } catch (err) {
      b2 = { error: `${err.code ?? "error"}: ${err.message}` };
    }
    verdictOf(b2?.created === false && b2?.existed === true, "B2",
      `the SAME POST again -> existed, not a fatal error (${JSON.stringify(b2)}) — the wrapped-409 branch, the exact code path of the 2026-07-26 incident`);

    // B3 -----------------------------------------------------------------------
    let b3ok = false;
    let b3note = "";
    try {
      const verified = await door.verifyCanonical(keyA, shaA);
      const downloaded = await door.downloadCanonical(keyA, join(scratch, "readback.bin"), shaA);
      const bytes = await readFile(join(scratch, "readback.bin"));
      b3ok = verified.sha256 === shaA && downloaded.sha256 === shaA && bytes.equals(payload);
      b3note = `sha ${shaA.slice(0, 12)}… , ${bytes.length} bytes byte-identical`;
    } catch (err) {
      b3note = `${err.code ?? "error"}: ${err.message}`;
    }
    verdictOf(b3ok, "B3", `GET through verifyCanonical + downloadCanonical -> sha matches (${b3note})`);

    // B4 -----------------------------------------------------------------------
    const tamper = Buffer.from("TAMPERED BY THE BATTERY — this must never land\n", "utf8");
    const upsert = await rawObject(apiUrl, "POST", BUCKET, keyA, jwtA, {
      headers: { "content-type": "application/octet-stream", "x-upsert": "true" },
      body: tamper,
    });
    const replace = await rawObject(apiUrl, "PUT", BUCKET, keyA, jwtA, {
      headers: { "content-type": "application/octet-stream" },
      body: tamper,
    });
    const afterWrite = await door.hashCanonical(keyA).catch((err) => `error ${err.message}`);
    // A DENIAL IS A STATUS, NOT A BOOLEAN. `!ok` is equally true of a 500, a proxy timeout and a
    // wrapped 409 duplicate; only the wrapped 403 says the POLICY answered. The byte read-back
    // stays beside it — together they say "the write did not land AND it was refused for the
    // reason this cell exists to measure".
    verdictOf(deniedWith(upsert, [403]) && deniedWith(replace, [403]) && afterWrite === shaA, "B4",
      `upsert (x-upsert:true) ${refusal(upsert)} and PUT ${refusal(replace)} -> both refused with a wrapped 403, bytes unchanged`);

    // B5 -----------------------------------------------------------------------
    const removed = await rawObject(apiUrl, "DELETE", BUCKET, keyA, jwtA);
    const afterDelete = await door.hashCanonical(keyA).catch((err) => `error ${err.message}`);
    verdictOf(deniedWith(removed, [403]) && afterDelete === shaA, "B5",
      `DELETE ${refusal(removed)} -> refused with a wrapped 403, object still readable (delete-never, storage-provision.sql:80-83)`);

    // B6 -----------------------------------------------------------------------
    const shortSha = shaA.slice(0, 63);
    const nonConforming = [
      { id: "wrong prefix", key: `firms/${firmA}/reports/${shaA}.bin` },
      { id: "63-hex sha", key: `firms/${firmA}/docs/${shortSha}.bin` },
      { id: "uppercase ext", key: `firms/${firmA}/docs/${shaA}.BIN` },
      // WHAT THIS ONE ACTUALLY PUTS ON THE WIRE. `%2E%2E` is a double-dot path segment to WHATWG
      // URL parsing, so `fetch` collapses `docs/%2E%2E/` before the request leaves the process:
      // the vendor is asked for `firms/<uuid>/<sha>.bin`, a key with no `docs/` segment at all.
      // Non-conforming either way, and the `rawPath` is reused byte-for-byte by the service-key
      // read below and by B11's cleanup so that all three requests name one single target.
      { id: "path traversal", key: `firms/${firmA}/docs/../${shaA}.bin`, rawPath: `${BUCKET}/firms/${firmA}/docs/%2E%2E/${shaA}.bin` },
    ];
    // THREE INDEPENDENT ASSERTIONS PER CANDIDATE, because each one alone can be satisfied by the
    // wrong thing happening:
    //   (1) the production door must have created NOTHING. `safeKey` carries an `/i` flag
    //       (storage.mjs:31) while the SQL policy's regex is case-SENSITIVE, so an uppercase
    //       extension passes the runtime validator and reaches the wire — and if the POLICY is
    //       ever weakened to admit it too, `putCanonical` quietly succeeds right here.
    //   (2) the raw POST must be refused with a wrapped **403**, not merely be `!ok`. Once (1) has
    //       created the object, the follow-up `x-upsert:false` POST to the SAME key answers as a
    //       wrapped 409 DUPLICATE — also `!ok`, and precisely why a weakened policy used to read
    //       as "refused by the policy on every variant" (measured, #620 review round 1).
    //   (3) a raw GET with the stack's PRIVILEGED service key must report the key ABSENT. Nothing
    //       is hidden from the service key, so this is the assertion that states no object exists
    //       instead of inferring it from two refusals.
    const b6notes = [];
    let b6ok = true;
    for (const candidate of nonConforming) {
      let doorVerdict = "ACCEPTED";
      try {
        await door.putCanonical(fixture, candidate.key, "application/octet-stream");
      } catch (err) {
        doorVerdict = /canonical storage key is invalid/.test(String(err.message))
          ? "refused by the runtime key validator"
          : `sent, then refused by Storage (${err.code ?? "error"})`;
      }
      const wire = await rawObject(apiUrl, "POST", BUCKET, candidate.key, jwtA, {
        headers: { "content-type": "application/octet-stream", "x-upsert": "false" },
        body: payload,
        rawPath: candidate.rawPath ?? null,
      });
      const serviceRead = await rawObject(apiUrl, "GET", BUCKET, candidate.key, serviceKey, {
        rawPath: candidate.rawPath ?? null,
      });
      const admitted = doorVerdict === "ACCEPTED";
      const denied = deniedWith(wire, [403]);
      const gone = absent(serviceRead);
      if (admitted || !denied || !gone) b6ok = false;
      b6notes.push(
        `${candidate.id}: door ${doorVerdict}${admitted ? " <-- THE POLICY ADMITTED IT" : ""}` +
          `, raw POST ${refusal(wire)}${denied ? "" : " <-- NOT A 403 POLICY DENIAL"}` +
          `, service-key GET ${refusal(serviceRead)}${gone ? " (absent)" : " <-- THE OBJECT EXISTS"}`,
      );
    }
    verdictOf(b6ok, "B6", `POST to a non-conforming key -> the door created nothing, the policy answered 403, and the key is absent to the stack's service key, on every variant — ${b6notes.join("; ")}`);

    // B7 -----------------------------------------------------------------------
    const strangerKey = `firms/${firmA}/docs/${shaA}.bin`;
    const plantedElsewhere = await rawObject(apiUrl, "POST", OTHER_BUCKET, strangerKey, serviceKey, {
      headers: { "content-type": "application/octet-stream", "x-upsert": "false" },
      body: payload,
    });
    const crossBucketGet = await rawObject(apiUrl, "GET", OTHER_BUCKET, strangerKey, jwtA);
    // A DENIED READ IS LAWFULLY EITHER STATUS. The vendor answers a read the SELECT policy hides
    // as "not found" (measured: wrapped 404) rather than "forbidden"; both are refusals of the
    // same request, and pinning only one would be pinning an implementation detail. What is NOT
    // accepted is a 500 or an unwrapped answer, which say nothing about the policy.
    verdictOf(plantedElsewhere.ok && deniedWith(crossBucketGet, [403, 404]), "B7",
      `GET the SAME conforming key in bucket ${OTHER_BUCKET} -> ${refusal(crossBucketGet)} (the policy is bucket-scoped; planted with the service key: HTTP ${plantedElsewhere.status})`);

    // B8 -----------------------------------------------------------------------
    const b8notes = [];
    let b8ok = true;
    for (const [label, jwt] of [["JWT B (role=authenticated)", jwtB], ["JWT C (expired)", jwtC]]) {
      const saved = process.env.CLARA_STORAGE_ROLE_JWT;
      process.env.CLARA_STORAGE_ROLE_JWT = jwt;
      let doorVerdict = "ACCEPTED";
      try {
        await door.putCanonical(fixture, `firms/${firmB}/docs/${shaA}.bin`, "application/octet-stream");
      } catch (err) {
        doorVerdict = `refused by realConfig (${err.code ?? "error"}, HTTP ${err.status ?? "-"})`;
      }
      process.env.CLARA_STORAGE_ROLE_JWT = saved;
      const post = await rawObject(apiUrl, "POST", BUCKET, `firms/${firmB}/docs/${shaA}.bin`, jwt, {
        headers: { "content-type": "application/octet-stream", "x-upsert": "false" },
        body: payload,
      });
      const get = await rawObject(apiUrl, "GET", BUCKET, keyA, jwt);
      const postDenied = deniedWith(post, [403]);
      const getDenied = deniedWith(get, [403, 404]);
      const refused = doorVerdict !== "ACCEPTED" && postDenied && getDenied;
      if (!refused) b8ok = false;
      b8notes.push(`${label}: door ${doorVerdict}, POST ${refusal(post)}${postDenied ? "" : " <-- NOT A 403 POLICY DENIAL"}, GET ${refusal(get)}${getDenied ? "" : " <-- NOT A 403/404 DENIED READ"}`);
    }
    verdictOf(b8ok, "B8", `a non-designated and an expired credential -> refused on POST (wrapped 403) and GET (wrapped 403/404) — ${b8notes.join("; ")}`);

    // B9 — the documented honest limit --------------------------------------------
    const foreignKey = `firms/${firmB}/docs/${shaA}.bin`;
    let b9 = null;
    try {
      b9 = await door.putCanonical(fixture, foreignKey, "application/octet-stream");
    } catch (err) {
      b9 = { error: `${err.code ?? "error"}: ${err.message}` };
    }
    const b9read = await door.hashCanonical(foreignKey).catch((err) => `error ${err.message}`);
    const b9allowed = b9?.created === true && b9read === shaA;
    if (b9allowed) {
      cell("LIMIT", "B9",
        "a CONFORMING key in ANOTHER firm's namespace is WRITABLE AND READABLE by this one credential — Storage RLS is key-shaped, not tenant-shaped. Firm isolation rests on clara.get_document_for_human_read* and the runtime's live-membership check, NEVER on this policy pair.");
    } else {
      cell("FAIL", "B9",
        `expected the documented limit (a foreign-firm conforming key ALLOWED) but the stack refused it (${JSON.stringify(b9)}, read ${b9read}). The limit statement in README.md and in the AC2 argument is now stale — re-derive it before shipping.`);
    }

    // B10 — SQL assertions on the stack DB -----------------------------------------
    const client = new pg.Client({ connectionString: dbUrl });
    await client.connect();
    let b10ok = true;
    const b10notes = [];
    try {
      // (a) no escalation bit — mirrors storage-provision.sql:39-55 as a STANDING assertion.
      const attrs = await client.query(
        `select coalesce(string_agg(x, ', '), '') as bad from (
           select 'SUPERUSER' x from pg_roles where rolname='clara_storage_docs' and rolsuper
           union all select 'BYPASSRLS' from pg_roles where rolname='clara_storage_docs' and rolbypassrls
           union all select 'CREATEDB' from pg_roles where rolname='clara_storage_docs' and rolcreatedb
           union all select 'CREATEROLE' from pg_roles where rolname='clara_storage_docs' and rolcreaterole
           union all select 'REPLICATION' from pg_roles where rolname='clara_storage_docs' and rolreplication
           union all select 'LOGIN' from pg_roles where rolname='clara_storage_docs' and rolcanlogin
           union all select 'INHERIT' from pg_roles where rolname='clara_storage_docs' and rolinherit
         ) s`,
      );
      const bad = attrs.rows[0].bad;
      if (bad !== "") b10ok = false;
      b10notes.push(`escalation bits: ${bad === "" ? "none" : bad}`);

      // (b) the two privileges that must never exist.
      const privs = await client.query(
        `select p as priv, has_table_privilege('clara_storage_docs','storage.objects',p) as held
           from unnest(array['UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','INSERT','SELECT']) p`,
      );
      const held = new Map(privs.rows.map((r) => [r.priv, r.held]));
      const forbidden = ["UPDATE", "DELETE", "TRUNCATE", "REFERENCES", "TRIGGER"].filter((p) => held.get(p));
      const missing = ["INSERT", "SELECT"].filter((p) => !held.get(p));
      if (forbidden.length || missing.length) b10ok = false;
      b10notes.push(`storage.objects privileges: held=${["INSERT", "SELECT"].filter((p) => held.get(p)).join("+") || "NONE"}${forbidden.length ? `, UNEXPECTED=${forbidden.join(",")}` : ", update=false delete=false"}`);

      // (c) THE TEMPORARY-ADMIN-GRANT DETECTOR. `pg_has_role` ERRORS on a role that does not
      //     exist, and SQL does not short-circuit WHERE — so the existence guard MUST be a CASE,
      //     the one construct whose evaluation order Postgres guarantees
      //     (wave-b-storage-update-amendment.sql:150-170 learned this the hard way).
      const admin = await client.query(
        `select coalesce(string_agg(r, ','), '') as inherited
           from unnest(array['postgres','supabase_storage_admin','service_role','supabase_admin','anon','authenticated']) r
          where case when exists (select 1 from pg_roles where rolname = r)
                     then pg_has_role('clara_storage_docs', r, 'member')
                     else false end`,
      );
      const inherited = admin.rows[0].inherited;
      if (inherited !== "") b10ok = false;
      b10notes.push(`admin inheritance: ${inherited === "" ? "none of postgres/supabase_storage_admin/service_role/supabase_admin/anon/authenticated" : `INHERITS ${inherited}`}`);

      // (c2) THE OPEN-WORLD HALF. (c) is a fixed roster and can only catch the escalations
      //      someone thought to name. This one catches ANY parent role, including one this
      //      repository has never heard of — and asserts the membership the ceremony DOES
      //      create still points the documented way round (`grant clara_storage_docs to
      //      authenticator` records roleid=clara_storage_docs, member=authenticator; reading it
      //      from the wrong side silently returns zero rows, which is how a missing membership
      //      would look too).
      const parents = await client.query(
        `select coalesce(string_agg(r.rolname, ','), '') as parents
           from pg_auth_members a join pg_roles m on m.oid = a.member join pg_roles r on r.oid = a.roleid
          where m.rolname = 'clara_storage_docs'`,
      );
      const members = await client.query(
        `select coalesce(string_agg(m.rolname, ','), '') as members
           from pg_auth_members a join pg_roles r on r.oid = a.roleid join pg_roles m on m.oid = a.member
          where r.rolname = 'clara_storage_docs'`,
      );
      // THE CEREMONY PRINCIPAL IS A LAWFUL MEMBER, AND PRETENDING OTHERWISE WOULD BE A FALSE
      // ASSERTION. PostgreSQL 16+ grants the CREATEROLE role that creates a role membership in
      // it automatically, so the principal that runs storage-provision.sql (`postgres` on both
      // the CLI stack and the hosted project — the file says "run this in the Supabase SQL
      // editor as the project owner") always appears here. Measured on the first run of this
      // assertion. What matters is that `authenticator` IS a member — that SET ROLE is the whole
      // custody path — and that nothing ELSE is.
      const ceremonyPrincipal = decodeURIComponent(new URL(dbUrl).username);
      const memberList = members.rows[0].members ? members.rows[0].members.split(",") : [];
      const unexpectedMembers = memberList.filter((m) => m !== "authenticator" && m !== ceremonyPrincipal);
      if (parents.rows[0].parents !== "") b10ok = false;
      if (!memberList.includes("authenticator") || unexpectedMembers.length) b10ok = false;
      b10notes.push(`memberships: parents=${parents.rows[0].parents || "none"}, members=${memberList.join(",") || "NONE"} (authenticator required; ${ceremonyPrincipal} is the ceremony principal, granted automatically by CREATEROLE${unexpectedMembers.length ? `; UNEXPECTED=${unexpectedMembers.join(",")}` : ""})`);

      // (d) exactly the two policies the ceremony creates, no more.
      const policies = await client.query(
        `select policyname, cmd from pg_policies
          where schemaname='storage' and tablename='objects' and 'clara_storage_docs' = any(roles)
          order by policyname`,
      );
      const names = policies.rows.map((r) => `${r.policyname}(${r.cmd})`);
      const expected = ["clara_storage_docs_insert(INSERT)", "clara_storage_docs_select(SELECT)"];
      const policiesOk = names.length === expected.length && names.every((n, i) => n === expected[i]);
      if (!policiesOk) b10ok = false;
      b10notes.push(`pg_policies for the role: ${names.join(", ") || "NONE"}`);
    } finally {
      await client.end().catch(() => {});
    }
    verdictOf(b10ok, "B10", `catalog assertions on the stack DB — ${b10notes.join("; ")}`);

    // B12 — the wiki key family, measured rather than assumed --------------------
    // `putWikiCanonical` writes `firms/<firm>/wiki/<client>/<sha>.md` into this SAME private
    // bucket with this SAME credential (packages/runtime/lib/storage.mjs:272-289), but
    // storage-provision.sql's policy pair matches only `.../docs/<sha64>.<ext>`. Whether the
    // live project carries a second, out-of-band wiki policy pair is hosted-pending —
    // hosted-probe.sql enumerates every policy on storage.objects to answer it.
    const wikiBody = Buffer.from("# clara-620-battery wiki probe\n", "utf8");
    const wikiFixture = join(scratch, "wiki.md");
    await writeFile(wikiFixture, wikiBody);
    const wikiKey = `firms/${firmA}/wiki/${randomUUID()}/${sha256(wikiBody)}.md`;
    let wikiThrew = false;
    let wikiWire = null;
    let wikiVerdict = "ACCEPTED (an object was created)";
    try {
      await door.putWikiCanonical(wikiFixture, wikiKey, "text/markdown");
    } catch (err) {
      wikiThrew = true;
      // THE REFUSAL MUST CARRY A POST-REQUEST MARKER. `safeWikiKey` (storage.mjs:349-355) runs
      // BEFORE the fetch and throws the SAME StorageError class the wire branch throws, so "it
      // threw" is fully compatible with Storage never having been asked: a fixture key that
      // merely failed the client-side grammar would print this LIMIT line after zero network
      // requests, and the scope statement it carries would rest on nothing. Only the post-fetch
      // branch (storage.mjs:387) puts the HTTP status into its message — that status is the marker.
      wikiWire = wikiWireStatus(err.message);
      wikiVerdict = `refused (${err.code ?? "error"}: ${String(err.message).slice(0, 90)})`;
    }
    // Pinned in BOTH directions, like B9: if this ceremony ever starts admitting a wiki key, the
    // README's scope statement and the wiki hosted-pending question are stale, and silence would
    // be the wrong answer.
    if (!wikiThrew) {
      cell("FAIL", "B12",
        `a conforming WIKI key was ${wikiVerdict} — this ceremony creates no wiki policy pair, so an admitted wiki write means the policy set changed. Re-derive README.md's scope statement and B10's expected policy list.`);
    } else if (wikiWire === null) {
      cell("FAIL", "B12",
        `a conforming WIKI key through putWikiCanonical -> ${wikiVerdict}, but the failure carries NO wire status: it happened before any request (safeWikiKey's grammar, storage.mjs:349-355), so this cell measured no Storage boundary at all. Fix the fixture key, then re-read the verdict.`);
    } else {
      cell("LIMIT", "B12",
        `a conforming WIKI key through putWikiCanonical -> ${wikiVerdict} — answered BY STORAGE (HTTP ${wikiWire}), so the request was really made. This ceremony creates NO wiki policy pair (packages/db/deploy carries none), so the wiki family is OUT OF SCOPE for what this battery certifies — whether the live project has one out of band is hosted-pending via hosted-probe.sql.`);
    }

    // B11 — fixture cleanup, with the SERVICE key, never the custody role --------
    const planted = [
      { bucket: BUCKET, key: keyA },
      { bucket: BUCKET, key: foreignKey },
      { bucket: BUCKET, key: wikiKey },
      { bucket: OTHER_BUCKET, key: strangerKey },
      // THE B6 CANDIDATES. An unweakened policy never lets these land, so each delete is a no-op
      // the service key answers 400/404 — and the row count below is what says so. They are on
      // this list so that a WEAKENED policy reds **B6**, the cell that names the weakening, rather
      // than reding B11, whose message only ever talks about fixture cleanup.
      ...nonConforming.map((c) => ({ bucket: BUCKET, key: c.key, rawPath: c.rawPath ?? null })),
    ];
    const deletions = [];
    for (const item of planted) {
      const res = await rawObject(apiUrl, "DELETE", item.bucket, item.key, serviceKey, { rawPath: item.rawPath ?? null });
      deletions.push(`${item.bucket}:${res.status}`);
    }
    const audit = new pg.Client({ connectionString: dbUrl });
    await audit.connect();
    let remaining = -1;
    try {
      const left = await audit.query("select count(*)::int as n from storage.objects where bucket_id = any($1)", [[BUCKET, OTHER_BUCKET]]);
      remaining = left.rows[0].n;
    } finally {
      await audit.end().catch(() => {});
    }
    verdictOf(remaining === 0, "B11",
      `fixture cleanup with the stack SERVICE key (never the custody role): deletes ${deletions.join(", ")}; storage.objects rows left in both buckets: ${remaining}`);

    // ---- summary --------------------------------------------------------------
    const failures = results.filter((r) => r.verdict === "FAIL");
    const limits = results.filter((r) => r.verdict === "LIMIT");
    console.log("\n--- table ---");
    for (const r of results) console.log(`${r.verdict.padEnd(5)} ${r.id.padEnd(4)} ${r.what}`);
    console.log(`\nPASS ${results.length - failures.length - limits.length}   LIMIT ${limits.length}   FAIL ${failures.length}`);
    if (failures.length) {
      console.error(`\nBATTERY RED: ${failures.map((f) => f.id).join(", ")}`);
      process.exitCode = 1;
    } else {
      console.log("\nBATTERY GREEN (limits are measured and deliberate — read README.md before citing this run).");
    }
  } finally {
    await rm(scratch, { recursive: true, force: true }).catch(() => {});
    dispose(workdir);
    if (!process.env.CLARA_STORAGE_BATTERY_WORKDIR) {
      await rm(workdir, { recursive: true, force: true }).catch(() => {});
    }
  }
}

main().catch((err) => {
  console.error(`\nBATTERY ABORTED: ${err?.stack ?? err}`);
  process.exitCode = 1;
});
