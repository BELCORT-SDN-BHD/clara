// #966 — THE INTAKE RECOVERY BELT MUST NOT BE ABLE TO FAIL A LIVE INTAKE.
//
// THE MEASURED DEFECT. `recoverPendingDocumentIntakes` opened and parsed EVERY pending intake's
// spool sidecar on every leader sweep (`listIntakeMetas`), though it acts on at most ten. A live
// intake writes its own sidecar ATOMICALLY — write a temp file, `rename()` it into place — and on
// Windows a `rename()` over a destination another handle holds open fails `EPERM`. So a sweep
// landing between two `writeIntakeMeta` calls threw inside the intake, which was then failed with
// an untyped `internal` reason: MEASURED as a 500 on the byte PUT (#636's `636-final.md`
// follow-up 3; `intake-batch-e2e.mjs`'s own header records one child in six at the default 2 s
// cadence, and a run that could not finish at all at child 84 of 100).
//
// THE PROPERTY, RE-MEASURED HERE RATHER THAN ASSERTED. On this host, `open(path,'r')` held across
// a `rename()` over that path is `EPERM` every time, and a tight reader loop against 500 bare
// renames lost 414 of them. Both halves of the fix are cells below:
//
//   1 · THE WRITER. `atomicJson`'s rename retries on the Windows locking codes for a bounded
//       window instead of surfacing them. A reader's handle is held for microseconds, so the retry
//       turns a hard failure into a sub-millisecond wait. This is the shape `graceful-fs` has
//       shipped for a decade (`lib/polyfills.js`: "Windows: EPERM on rename, retry for up to 60
//       seconds") — see this package's own node_modules copy.
//   2 · THE READER. The belt now decides what to SKIP from directory metadata (`stat`, which does
//       NOT hold a handle a rename can block — cell `p966.stat_is_not_a_handle` measures that too)
//       BEFORE opening anything, so the recency guard that was always there runs AHEAD of the open
//       rather than behind it, and a sweep opens at most the ten sidecars it can act on.
//
// PURE unit cells: a real temp spool directory, no DB, no world, no network.

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, open, readFile, rename, rm, stat, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

let root;
let previousSpool;

before(async () => {
  const base = process.env.CLARA_TEST_TMP_ROOT || tmpdir();
  await mkdir(base, { recursive: true });
  root = await mkdtemp(join(base, "clara-sidecar-race-"));
  previousSpool = process.env.CLARA_SPOOL_DIR;
  process.env.CLARA_SPOOL_DIR = join(root, "spool");
});

after(async () => {
  if (previousSpool === undefined) delete process.env.CLARA_SPOOL_DIR;
  else process.env.CLARA_SPOOL_DIR = previousSpool;
  await rm(root, { recursive: true, force: true });
});

const {
  intakePaths, listIntakeMetaEntries, listIntakeMetas, readIntakeMeta, writeIntakeMeta,
} = await import("../lib/spool.mjs");
const { recoverPendingDocumentIntakes } = await import("../lib/intake.mjs");

/** A sidecar body shaped like a live, mid-flight upload. `n` is the write counter the race cell
 *  reads back, so "the last write is the one on disk" is a positive assertion. */
const sidecar = (intakeId, n, over = {}) => ({
  schemaVersion: 1,
  intakeId,
  firmId: randomUUID(),
  status: "spooled",
  tokenHash: "0".repeat(64),
  expiresAt: new Date(Date.now() + 15 * 60_000).toISOString(),
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  n,
  ...over,
});

/** A metadata-first listing double: entries the belt may skip UNOPENED, each counting its own
 *  `read()`. This is the shape the belt now consumes, and the only way to observe "was this file
 *  opened?" without instrumenting the filesystem. */
function entryDouble(id, { ageMs, body }) {
  const entry = {
    reads: 0,
    name: `intake-${id}.json`,
    path: join(process.env.CLARA_SPOOL_DIR, `intake-${id}.json`),
    mtimeMs: Date.now() - ageMs,
    read: async () => { entry.reads += 1; return body; },
  };
  return entry;
}

const refuse = (what) => () => { throw new Error(`${what} must not be reached in this cell`); };

// ---------------------------------------------------------------------------
// 1 · THE HOST PROPERTY, measured rather than assumed.
// ---------------------------------------------------------------------------

test("p966.host: a held read handle DOES block rename on this host — the defect's premise, measured", async () => {
  const path = join(root, "premise.json");
  await writeFile(path, "{}\n");
  const fh = await open(path, "r");
  let code = "ok";
  try {
    const tmp = `${path}.tmp`;
    await writeFile(tmp, "{}\n");
    await rename(tmp, path);
  } catch (err) {
    code = err?.code ?? String(err);
  } finally {
    await fh.close();
  }
  if (process.platform === "win32") {
    assert.equal(code, "EPERM",
      "if this ever stops being EPERM the whole ticket's premise has changed — say so loudly rather than passing quietly");
  } else {
    assert.equal(code, "ok", "POSIX renames over an open destination; the retry below costs nothing here");
  }
});

test("p966.stat_is_not_a_handle: reading directory METADATA never blocks a rename — the fix's premise", async () => {
  const path = join(root, "metadata.json");
  await writeFile(path, "{}\n");
  const pending = stat(path);
  const tmp = `${path}.m.tmp`;
  await writeFile(tmp, "{}\n");
  await assert.doesNotReject(rename(tmp, path),
    "a metadata read must never be the handle that fails a live intake's write — this is why the belt skips from stat, not from a parse");
  assert.ok((await pending).isFile());
});

// ---------------------------------------------------------------------------
// 2 · THE WRITER — the acceptance criterion with a number in it.
// ---------------------------------------------------------------------------

const ATTEMPTS = 500;

test(`p966.race: ${ATTEMPTS} sidecar writes against concurrent belt-shaped sweeps record ZERO EPERM-class failures`, async () => {
  const id = randomUUID();
  await writeIntakeMeta(id, sidecar(id, 0));

  let stop = false;
  let sweeps = 0;
  // The sweep's OWN read path, in a tight loop — `listIntakeMetas` is what the belt used to call
  // every cycle, and it is the handle that made the next rename EPERM.
  const sweeping = (async () => { while (!stop) { await listIntakeMetas(); sweeps += 1; } })();

  const failures = [];
  for (let i = 1; i <= ATTEMPTS; i += 1) {
    try {
      await writeIntakeMeta(id, sidecar(id, i));
    } catch (err) {
      failures.push({ i, code: err?.code ?? String(err) });
    }
  }
  stop = true;
  await sweeping;

  assert.deepEqual(failures, [],
    `every sidecar write must land while the belt reads: ${failures.length} of ${ATTEMPTS} failed `
    + `(${JSON.stringify(failures.slice(0, 5))}) — each one is a live intake failed with an untyped 'internal'`);
  assert.ok(sweeps >= 20,
    `the reader genuinely contended (${sweeps} sweeps over ${ATTEMPTS} writes) — a cell that passed because nothing read is vacuous`);
  assert.equal((await readIntakeMeta(id)).n, ATTEMPTS,
    "…and the LAST write is the one on disk: a retry that gave up quietly would leave an earlier body");
});

// ---------------------------------------------------------------------------
// 3 · THE READER — the recency guard ahead of the open.
// ---------------------------------------------------------------------------

test("p966.quiet: a sidecar written inside the quiet window is NEVER opened during a sweep", async () => {
  const fresh = entryDouble(randomUUID(), { ageMs: 0, body: refuse("a freshly-written sidecar") });
  const settled = randomUUID();
  const quiet = entryDouble(settled, { ageMs: 60_000, body: sidecar(settled, 1, { status: "uploading" }) });

  const out = await recoverPendingDocumentIntakes({
    withRuntime: refuse("the DB"),
    enqueue: refuse("an enqueue"),
    listEntries: async () => [fresh, quiet],
  });

  assert.equal(fresh.reads, 0,
    "THE WHOLE TICKET: the guard has to decide from directory metadata, before the open — a skip that "
    + "happens after the parse cannot prevent the race, because the handle is already taken");
  assert.equal(quiet.reads, 1, "…and a settled sidecar IS read, so the cell is not passing by reading nothing");
  assert.deepEqual(out, { recovered: 0, deferred: 0, expired: 0 },
    "'uploading' is not one of the belt's actionable states — it is read and left alone");
});

test("p966.budget: a sweep opens at most the TEN sidecars it can act on, never the whole directory", async () => {
  const entries = Array.from({ length: 25 }, () => {
    const id = randomUUID();
    return entryDouble(id, { ageMs: 60_000, body: sidecar(id, 1, { status: "uploading" }) });
  });
  await recoverPendingDocumentIntakes({
    withRuntime: refuse("the DB"),
    enqueue: refuse("an enqueue"),
    listEntries: async () => entries,
  });
  assert.equal(entries.filter((e) => e.reads > 0).length, 10,
    "the belt acts on at most ten and must now OPEN at most ten — opening all 25 is the cost this ticket removes");
  assert.deepEqual(entries.slice(0, 10).map((e) => e.reads), Array(10).fill(1), "…the first ten, each exactly once");
});

test("p966.quiet: the quiet window does not eat the BUDGET — ten still get read past a crowd of live uploads", async () => {
  const live = Array.from({ length: 30 }, () => entryDouble(randomUUID(), { ageMs: 0, body: refuse("a live upload") }));
  const settled = Array.from({ length: 12 }, () => {
    const id = randomUUID();
    return entryDouble(id, { ageMs: 60_000, body: sidecar(id, 1, { status: "uploading" }) });
  });
  await recoverPendingDocumentIntakes({
    withRuntime: refuse("the DB"),
    enqueue: refuse("an enqueue"),
    listEntries: async () => [...live, ...settled],
  });
  assert.equal(live.filter((e) => e.reads > 0).length, 0, "not one live upload is opened");
  assert.equal(settled.filter((e) => e.reads > 0).length, 10,
    "…and the skip happens BEFORE the ten-item budget is taken, or thirty live uploads would starve the belt entirely");
});

// ---------------------------------------------------------------------------
// 4 · WHAT THE BELT STILL DOES — the guard is a skip, not a retirement.
// ---------------------------------------------------------------------------

test("p966.expire: an intake past its 15-minute capability is still failed through the DB writer and its spool cleared", async () => {
  const id = randomUUID();
  const meta = sidecar(id, 1, { expiresAt: new Date(Date.now() - 1000).toISOString() });
  await writeIntakeMeta(id, meta);
  await writeFile(intakePaths(id).bytes, "spooled bytes");
  // The belt reads mtime, not `updatedAt`: age the file the way an abandoned upload's file IS old.
  const old = new Date(Date.now() - 60_000);
  await utimes(intakePaths(id).meta, old, old);

  const calls = [];
  const out = await recoverPendingDocumentIntakes({
    withRuntime: async (fn) => fn({ query: async (sql, params) => (calls.push({ sql: String(sql), params }), { rows: [{ receipt: {} }] }) }),
    enqueue: refuse("an enqueue"),
  });

  assert.equal(out.expired, 1, "the expiry arm still fires");
  assert.equal(calls.length, 1);
  assert.match(calls[0].sql, /clara\.fail_document_intake/, "…through the DB writer, never by unlinking behind the estate's back");
  assert.deepEqual(calls[0].params.slice(0, 2), [id, "expired"], "…with the intake's own id and the typed reason");
  assert.equal(await readIntakeMeta(id), null, "…and the sidecar is gone");
  await assert.rejects(readFile(intakePaths(id).bytes), { code: "ENOENT" }, "…as are the spooled bytes");
});

test("p966.resume: an intake left mid-flight by a crash is still driven, once it is past the guard", async () => {
  const id = randomUUID();
  await writeIntakeMeta(id, sidecar(id, 1, { status: "verified" }));
  const old = new Date(Date.now() - 60_000);
  await utimes(intakePaths(id).meta, old, old);

  const log = [];
  const out = await recoverPendingDocumentIntakes({
    withRuntime: async (fn) => fn({ query: async () => ({ rows: [{ receipt: null }] }) }),
    // The finalize this drives refuses on the capability hash (the cell hands it a sidecar whose
    // token hash matches nothing), which is the belt's DEFERRED arm — positive evidence that the
    // belt opened this intake and carried it into `finalizeDocumentIntake`, without this unit cell
    // having to stand up storage and a real capability. The real resume is proven end to end in
    // intake-db.test.mjs's `recovers a crashed mid-flight intake` cell.
    enqueue: async () => ({ runId: "x" }),
    log: (m) => log.push(m),
  });

  assert.equal(out.deferred, 1, "the belt carried a past-the-guard intake into the finalize path");
  assert.equal(out.expired, 0, "…and did not mistake a live capability for an expired one");
  assert.ok(log.some((m) => m.includes(id)), `the deferral names the intake (got ${JSON.stringify(log)})`);
});

// ---------------------------------------------------------------------------
// 5 · THE LISTING — the shape the belt now consumes.
// ---------------------------------------------------------------------------

test("p966.listing: the metadata listing carries mtime and a lazy read, and opens nothing by itself", async () => {
  const id = randomUUID();
  await writeIntakeMeta(id, sidecar(id, 7));
  const entries = (await listIntakeMetaEntries()).filter((e) => e.name === `intake-${id}.json`);
  assert.equal(entries.length, 1);
  const [entry] = entries;
  assert.equal(typeof entry.mtimeMs, "number");
  assert.ok(Math.abs(Date.now() - entry.mtimeMs) < 60_000, "…and it is this file's own mtime, not a placeholder");
  assert.equal(typeof entry.read, "function", "the parse is LAZY — the caller decides whether a handle is ever taken");
  assert.equal((await entry.read()).n, 7, "…and it reads the same body listIntakeMetas would have returned");
});

test("p966.listing: listIntakeMetas keeps its old contract — one code path, not two that drift", async () => {
  const good = randomUUID();
  await writeIntakeMeta(good, sidecar(good, 3));
  const badName = `intake-${randomUUID()}.json`;
  await writeFile(join(process.env.CLARA_SPOOL_DIR, badName), "{ not json");

  const rows = await listIntakeMetas();
  assert.equal(rows.find((r) => r.intakeId === good)?.n, 3, "a healthy sidecar still comes back parsed");
  assert.deepEqual(rows.find((r) => r.file === badName), { corrupt: true, file: badName },
    "…and an unparseable one still comes back as the same `{corrupt, file}` marker, so every existing caller is unchanged");
  await rm(join(process.env.CLARA_SPOOL_DIR, badName), { force: true });
});
