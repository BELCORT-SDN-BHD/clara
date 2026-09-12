// A MISSING LOCAL OBJECT IS A TYPED StorageError, NEVER A PROCESS-LEVEL 'error' EVENT.
//
// Why this file exists (#630, fourth review round). In RELAY_TEST_MODE the three older object
// families (docs, wiki, reports) answered a read by handing back a bare `createReadStream(path)`
// — a LAZY stream whose `open()` failure surfaces as an `'error'` EVENT on a later I/O turn, not
// as a rejected promise. `downloadCanonical` then `await`s `mkdir(dirname(destination))` BEFORE
// `pipeline()` attaches any listener, so on a missing object the event fired into an empty
// listener set and Node raised it as an uncaughtException. `packages/runtime/scripts/serve.mjs`
// treats uncaughtException as fatal (`process.exit(1)`), so ONE absent test-storage file took the
// whole crash-only supervisor down at startup — which is why this branch's four standalone runtime
// e2es could not run at all on a rebuilt rig (the local_facts lane sweeps `clara.documents` rows
// whose bytes are not in `packages/runtime/test-storage`).
//
// `artifactResponseFor` records WHY the cure is needed — the local path must raise the SAME typed,
// retryable `storage_error` the real Supabase path raises for the identical condition, or the
// local test is measuring a different failure from the deployed one — but until round 6 it had
// adopted only the CLASSIFIER and still handed back a lazy stream after its stat (see the artifact
// cells at the end of this file). These cells hold every family to that contract and, crucially,
// assert the NEGATIVE: no `'error'` reaches the process while a read of a missing object is in
// flight, including across an `await` between the open and the pipeline.
//
// Unit level: storage.mjs's own RELAY_TEST_MODE seam, a temp CLARA_TEST_STORAGE_DIR, no rig.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  StorageError,
  downloadArtifactCanonical,
  downloadCanonical,
  hashCanonical,
  hashReportCanonical,
  hashSandboxCanonical,
  hashWikiCanonical,
  localObjectExists,
  localOpenFailure,
  verifySandboxCanonical,
} from "../lib/storage.mjs";

const FIRM = "87dba009-1c2d-4e5f-8a9b-0c1d2e3f4a5b";
const CLIENT = "11111111-2222-4333-8444-555555555555";
const SHA = "81b2cea9".padEnd(64, "0");

const DOCS_KEY = `firms/${FIRM}/docs/${SHA}.xml`;
const WIKI_KEY = `firms/${FIRM}/wiki/${CLIENT}/${SHA}.md`;
const REPORT_KEY = `firms/${FIRM}/reports/${SHA}.pdf`;

let root;
let previousStorageDir;
let previousMode;

before(async () => {
  const base = process.env.CLARA_TEST_TMP_ROOT || tmpdir();
  await mkdir(base, { recursive: true });
  root = await mkdtemp(join(base, "clara-storage-missing-"));
  previousStorageDir = process.env.CLARA_TEST_STORAGE_DIR;
  previousMode = process.env.RELAY_TEST_MODE;
  process.env.CLARA_TEST_STORAGE_DIR = join(root, "storage");
  process.env.RELAY_TEST_MODE = "1";
});

after(async () => {
  if (previousStorageDir === undefined) delete process.env.CLARA_TEST_STORAGE_DIR;
  else process.env.CLARA_TEST_STORAGE_DIR = previousStorageDir;
  if (previousMode === undefined) delete process.env.RELAY_TEST_MODE;
  else process.env.RELAY_TEST_MODE = previousMode;
  if (root) await rm(root, { recursive: true, force: true });
});

/** Run `fn` with a process-level `uncaughtException` watcher installed, and return every error
 *  that reached the process while it ran. Two drains of the macrotask queue afterwards, because
 *  the event this guards against is emitted by libuv's `open()` callback — a LATER turn than the
 *  microtask the rejection settles on, so a same-tick assertion would pass on the broken code. */
async function withUncaughtWatch(fn) {
  const caught = [];
  const onUncaught = (err) => { caught.push(err); };
  process.on("uncaughtException", onUncaught);
  try {
    const outcome = await fn().then(
      (value) => ({ resolved: value }),
      (err) => ({ rejected: err }),
    );
    await new Promise((resolve) => setTimeout(resolve, 25));
    await new Promise((resolve) => setImmediate(resolve));
    return { ...outcome, caught };
  } finally {
    process.off("uncaughtException", onUncaught);
  }
}

function assertTypedStorageMiss(outcome, what) {
  assert.deepEqual(
    outcome.caught.map((e) => `${e?.code ?? ""}:${e?.message ?? e}`),
    [],
    `${what}: a missing object must reach no process-level 'error' listener`,
  );
  assert.ok(outcome.rejected instanceof StorageError, `${what}: must reject with a StorageError`);
  assert.equal(outcome.rejected.code, "storage_error", `${what}: the retryable storage code`);
}

test("storage (docs): downloadCanonical of an ABSENT object rejects StorageError and raises no uncaughtException", async () => {
  // The exact shape that killed the supervisor: an `await` (the destination mkdir) between the
  // stream's creation and the pipeline that would have listened to it.
  const destination = join(root, "out", "deep", "nested", `${SHA}.xml`);
  assert.equal(await localObjectExists(DOCS_KEY), false, "precondition: the object is absent");

  const outcome = await withUncaughtWatch(() => downloadCanonical(DOCS_KEY, destination, SHA));
  assertTypedStorageMiss(outcome, "downloadCanonical");
});

test("storage (docs): hashCanonical of an ABSENT object rejects StorageError and raises no uncaughtException", async () => {
  const outcome = await withUncaughtWatch(() => hashCanonical(DOCS_KEY));
  assertTypedStorageMiss(outcome, "hashCanonical");
});

test("storage (wiki + reports): an ABSENT object is the same typed miss, never a process 'error'", async () => {
  assertTypedStorageMiss(await withUncaughtWatch(() => hashWikiCanonical(WIKI_KEY)), "hashWikiCanonical");
  assertTypedStorageMiss(await withUncaughtWatch(() => hashReportCanonical(REPORT_KEY)), "hashReportCanonical");
});

test("storage (docs): a PRESENT object still downloads and hashes — the cure is the miss, not the read", async () => {
  const bytes = "<invoice/>";
  const { createHash } = await import("node:crypto");
  const sha = createHash("sha256").update(bytes).digest("hex");
  const presentKey = `firms/${FIRM}/docs/${sha}.xml`;
  const objectPath = join(process.env.CLARA_TEST_STORAGE_DIR, "firms", FIRM, "docs", `${sha}.xml`);
  await mkdir(join(process.env.CLARA_TEST_STORAGE_DIR, "firms", FIRM, "docs"), { recursive: true });
  await writeFile(objectPath, bytes);

  assert.equal(await localObjectExists(presentKey), true);
  const destination = join(root, "present", `${sha}.xml`);
  const result = await downloadCanonical(presentKey, destination, sha);
  assert.equal(result.sha256, sha);
  assert.equal(await hashCanonical(presentKey), sha);
});

// ===========================================================================================
// #630 (fifth review round, finding [3]) — AN OPEN FAILURE IS NOT ALWAYS AN ABSENT OBJECT.
//
// The cure above turned every local open failure into ONE message: "(object absent)". A
// permission failure, a directory standing where the object should be, or fd exhaustion then
// reaches an operator as a missing object — and because `storage_error` is in local-facts.mjs's
// RETRYABLE set, the lane keeps re-driving the task while its log says bytes are gone that are
// in fact present and unreadable. `localObjectExists` in the same file already keeps ENOENT and
// everything else apart (:191-199); the stream opener did not.
//
// WHY THE NON-ENOENT ARM IS PINNED AT THE CLASSIFIER RATHER THAN THROUGH A REAL FAILURE. There
// is no portable way to force EACCES / EMFILE / EISDIR from a test that must pass on both this
// Windows rig and Linux CI: opening a DIRECTORY raises EISDIR on Linux and SUCCEEDS on Windows
// (measured on this rig with node v22.23.2), a deny-ACL is a no-op for a container's root, and
// the only deterministic Windows codes (EPERM on config\SAM, EBUSY on pagefile.sys — also
// measured) are system paths a sandboxed test must not touch. So the DECISION is the seam: the
// four cells below drive `localOpenFailure` with the errno shapes libuv actually produces, and
// the ENOENT cells above prove the real opener routes through it unchanged.
// ===========================================================================================

test("storage: ENOENT (and a parent that is not a directory) is the ONLY failure reported as an absent object", () => {
  for (const code of ["ENOENT", "ENOTDIR"]) {
    const err = localOpenFailure(Object.assign(new Error("boom"), { code }), "canonical");
    assert.ok(err instanceof StorageError, `${code} must still be a StorageError`);
    assert.equal(err.code, "storage_error", `${code} keeps the retryable storage code`);
    assert.equal(err.message, "canonical storage read failed (object absent)",
      `${code} is the absent-object message this lane's callers already read`);
  }
});

test("storage: EACCES / EMFILE / EISDIR are reported as themselves, never as an absent object", () => {
  for (const code of ["EACCES", "EMFILE", "EISDIR", "EPERM", "EBUSY"]) {
    const err = localOpenFailure(Object.assign(new Error("boom"), { code }), "wiki");
    assert.ok(err instanceof StorageError, `${code} must still be a StorageError`);
    assert.equal(err.code, "storage_error",
      `${code} keeps the retryable storage code — the retry is bounded, and downgrading it here `
      + "would change the lane's behaviour rather than its diagnosis");
    assert.equal(err.message, `wiki storage read failed (${code})`,
      `${code} must name itself so an operator is not sent looking for bytes that are present`);
    assert.equal(err.message.includes("object absent"), false,
      `${code} must NOT claim the object is absent`);
  }
});

test("storage: an open failure with no errno says so rather than inventing one", () => {
  const err = localOpenFailure(new Error("boom"), "report");
  assert.equal(err.message, "report storage read failed (open failed, no errno)");
  assert.equal(err.message.includes("object absent"), false);
});

test("storage: the classifier survives a non-Error rejection", () => {
  const err = localOpenFailure(undefined, "artifact");
  assert.ok(err instanceof StorageError);
  assert.equal(err.message, "artifact storage read failed (open failed, no errno)");
});

// ===========================================================================================
// #630 (sixth review round, finding [4]) — THE ARTIFACT FAMILY ACTUALLY TAKES THE CURE.
//
// The header above (and storage.mjs's own, until this round) claimed the artifact family "already
// had the cure". It did not: `artifactResponseFor` stat'd the object with an `open`/`close` pair,
// shared the CLASSIFIER, and then handed back a fresh, LAZY `createReadStream(path)` — a SECOND,
// unprotected open on a later libuv turn. The stat only closes the steady-state miss; an object
// that disappears (a rig sweep) or an open that fails (a Windows sharing violation, fd pressure)
// INSIDE the stat→open window fired 'error' into an empty listener set, and
// `scripts/serve.mjs`'s fatal handler exits 1. `downloadArtifactCanonical` holds that window open
// deliberately: it `await`s the destination `mkdir` before `pipeline()` attaches anything.
//
// Both cells below are one-sided on purpose. They assert the NEGATIVE this file exists for — no
// error reaches the process — and accept either real outcome (the bytes, or a typed StorageError),
// because which of the two a vanishing object yields is a genuine race and pinning it would be
// pinning the scheduler.
// ===========================================================================================

const SANDBOX_KEY = `firms/${FIRM}/sandbox/${SHA}.pdf`;
const ARTIFACT_KEY = `firms/${FIRM}/reports/${SHA}.pdf`;

test("storage (artifact + sandbox): an ABSENT object is the same typed miss the other three families give", async () => {
  // No `localObjectExists` precondition here: that helper validates through `safeKey`, the DOCS
  // family's own validator, which refuses a `reports/`-or-`sandbox/` key by design. Nothing has
  // ever written under this temp storage root, so the object's absence is the fixture itself.
  const destination = join(root, "artifact-out", "deep", "nested", `${SHA}.pdf`);

  assertTypedStorageMiss(
    await withUncaughtWatch(() => downloadArtifactCanonical(ARTIFACT_KEY, destination, SHA)),
    "downloadArtifactCanonical",
  );
  assertTypedStorageMiss(
    await withUncaughtWatch(() => hashSandboxCanonical(SANDBOX_KEY)),
    "hashSandboxCanonical",
  );
  assertTypedStorageMiss(
    await withUncaughtWatch(() => verifySandboxCanonical(SANDBOX_KEY, SHA)),
    "verifySandboxCanonical",
  );
});

test("storage (artifact): an object that VANISHES after the stat never reaches the process as an 'error'", async () => {
  const { createHash } = await import("node:crypto");
  const bytes = "%PDF-1.7\n% a sealed sandbox export\n";
  const sha = createHash("sha256").update(bytes).digest("hex");
  const key = `firms/${FIRM}/sandbox/${sha}.pdf`;
  const objectDir = join(process.env.CLARA_TEST_STORAGE_DIR, "firms", FIRM, "sandbox");
  const objectPath = join(objectDir, `${sha}.pdf`);
  await mkdir(objectDir, { recursive: true });

  const caught = [];
  const onUncaught = (err) => { caught.push(err); };
  process.on("uncaughtException", onUncaught);
  try {
    // A sweeper removing the bytes while a read is in flight — the ordinary state of a rebuilt rig
    // whose database still holds rows for objects the sweep took. 40 rounds: the lazy re-open lost
    // this race within the first handful every time it was measured.
    for (let i = 0; i < 40; i += 1) {
      await writeFile(objectPath, bytes);
      const destination = join(root, "vanish", String(i), `${sha}.pdf`);
      const read = downloadArtifactCanonical(key, destination, sha).then(
        () => "downloaded",
        (err) => (err instanceof StorageError ? `storage:${err.code}` : `OTHER:${err?.code ?? err}`),
      );
      // Windows refuses to unlink a file an eager handle still holds — that refusal is the cure
      // working, not a test failure, so the sweep's own error is swallowed and the round counted.
      const sweep = rm(objectPath, { force: true }).catch(() => {});
      const [outcome] = await Promise.all([read, sweep]);
      assert.ok(outcome === "downloaded" || outcome.startsWith("storage:"),
        `round ${i}: a vanishing object is the bytes or a typed StorageError, never a bare fs error `
        + `— saw ${outcome}`);
      await rm(objectPath, { force: true }).catch(() => {});
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
    await new Promise((resolve) => setImmediate(resolve));
    assert.deepEqual(caught.map((e) => `${e?.code ?? ""}:${e?.message ?? e}`), [],
      "a lost race must not reach the process as an uncaughtException — scripts/serve.mjs treats "
      + "one as fatal and exits 1, taking the crash-only supervisor down over one absent object");
  } finally {
    process.off("uncaughtException", onUncaught);
  }
});
