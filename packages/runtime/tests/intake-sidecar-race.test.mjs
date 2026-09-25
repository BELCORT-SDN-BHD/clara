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
import { mkdir, mkdtemp, open, readdir, readFile, rename, rm, stat, utimes, writeFile } from "node:fs/promises";
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
  _sidecarLockCountForTest, intakePaths, listIntakeMetaEntries, listIntakeMetas, mergeTaskMeta, readIntakeMeta,
  readTaskMeta, removeTaskMeta, spoolConfig, sweepSpoolTtl, taskMetaPath, writeIntakeMeta, writeTaskMeta,
} = await import("../lib/spool.mjs");
const { recoverPendingDocumentIntakes } = await import("../lib/intake.mjs");
const { reconcileDocumentTasks } = await import("../lib/reconciler.mjs");

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

/**
 * A spool directory of this cell's OWN, restored when it ends.
 *
 * Fix round 1 (review finding L09-B): every filesystem cell here shared ONE spool directory, so
 * `p966.expire` — which sweeps the REAL directory — passed only because `p966.race`'s leftover
 * sidecar was still inside the five-second quiet window when it ran. Proven by shortening the
 * window, which is not that cell's subject at all (it ages its own fixture by a minute):
 * `CLARA_INTAKE_SIDECAR_QUIET_MS=1 node --test tests/intake-sidecar-race.test.mjs` failed it with
 * `2 !== 1`. Any stall over five seconds — a loaded ten-lane rig, a slower CI box, the whole
 * runtime suite — would have done the same. A quiet window is a guard against a live upload; it
 * was never cell isolation, and a gate cell that reds for a reason unrelated to its subject is
 * worse than no cell. `node:test` runs these serially, so the env swap is safe.
 */
async function ownSpool(t) {
  const previous = process.env.CLARA_SPOOL_DIR;
  const dir = await mkdtemp(join(root, "spool-"));
  process.env.CLARA_SPOOL_DIR = dir;
  t.after(() => { process.env.CLARA_SPOOL_DIR = previous; });
  return dir;
}

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

test(`p966.race: ${ATTEMPTS} sidecar writes against concurrent belt-shaped sweeps record ZERO EPERM-class failures`, async (t) => {
  await ownSpool(t);
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
// 2b · THE WRITER, AGAINST ITSELF — two writers of ONE sidecar in ONE process (#1043).
// ---------------------------------------------------------------------------
//
// THE MEASURED DEFECT. `atomicJson` named its temp file `${path}.${pid}.${Date.now()}.tmp`, whose
// only per-call component is a MILLISECOND. Two writers of the SAME sidecar inside ONE process
// therefore compute the SAME temp path whenever they land in the same millisecond, and both then
// `writeFile` into it and `rename` it away:
//
//   * the loser's `rename` finds nothing to move and throws ENOENT — which `renameIntoPlace`
//     deliberately does NOT retry (only EPERM/EACCES/EBUSY do), so it surfaces as an intake failed
//     with an untyped `internal`;
//   * worse and far more often, the two `writeFile`s interleave on the one inode and the body the
//     WINNER renames into place is a splice of both — a sidecar that does not parse. A spliced
//     `intake-<id>.json` makes `requireCapability`'s `readIntakeMeta(...).catch(() => null)` answer
//     "not found" for a live upload; a spliced `task-<id>.json` hard-fails documentIngest_v2.
//
// THE TWO WRITERS ARE REAL AND ARE NOT RARE: `lib/intake.mjs:439` writes the full transport sidecar
// inside `finalizeDocumentIntake`, and `lib/reconciler-documents.mjs:267` merges every
// `clara.document_processing_tasks` row onto its own sidecar on every sweep — and the DB row exists
// from the moment `clara.finalize_document_intake` commits, which is BEFORE intake.mjs:439 runs.
//
// MEASURED AGAINST THE PRE-FIX CODE AT 300 ROUNDS OF THE SHAPE BELOW, and THE RUNNER'S PLATFORM IS
// THE BAD ONE: on Linux (WSL, the shape CI runs) 286 of 300 rounds threw ENOENT and 271 left an
// unparseable sidecar; on this Windows rig, 6 and 116. So 200 rounds is a wide margin on the host
// that matters, and not a thin one here either. CI job 107339673336 is the same defect in the wild
// — the #633 admission e2e's very first upload, 1.8 s after the world booted, failed
// `ENOENT ... rename '.../task-c6245da9-….json.7113.1790191021685.tmp'`.
//
// THE PROPERTY THIS CELL PINS is the one `atomicJson`'s name claims: a reader of a sidecar sees a
// body some writer wrote, WHOLE — never a splice of two, and no writer is told its write failed
// because a sibling won the race.
const COLLIDE_ROUNDS = 200;

/** The full transport sidecar `finalizeDocumentIntake` writes (`lib/intake.mjs:439`). */
const intakeShapedTask = (taskId, n) => ({
  schemaVersion: 1,
  taskId,
  documentId: randomUUID(),
  firmId: randomUUID(),
  storageKey: `firms/${randomUUID()}/docs/${"a".repeat(64)}.pdf`,
  sha256: "a".repeat(64),
  mime: "application/pdf",
  format: "pdf",
  lane: "ocr",
  engineId: "azure-di",
  engineConfig: { model: "prebuilt-layout", pages: "1-20" },
  versionN: 1,
  status: "queued",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  writer: "intake",
  n,
});

/** The DB-row merge `documentTaskIndex` writes (`lib/reconciler-documents.mjs:267`) — the task
 *  columns alone, which carry no transport, so it is much SHORTER than the body above. A splice of
 *  two bodies of the same length could still parse; two lengths make the defect visible. */
const reconcilerShapedTask = (taskId, n) => ({
  taskId,
  lane: "ocr",
  status: "queued",
  runId: null,
  writer: "reconciler",
  n,
});

test(`p1043.collide: ${COLLIDE_ROUNDS} rounds of TWO writers on ONE sidecar leave a WHOLE body every time`, async (t) => {
  await ownSpool(t);
  const taskId = randomUUID();
  const failures = [];
  const spliced = [];
  const wins = { intake: 0, reconciler: 0 };

  for (let i = 1; i <= COLLIDE_ROUNDS; i += 1) {
    const bodies = [intakeShapedTask(taskId, i), reconcilerShapedTask(taskId, i)];
    const settled = await Promise.allSettled(bodies.map((body) => writeTaskMeta(taskId, body)));
    for (const result of settled) {
      if (result.status === "rejected") failures.push({ round: i, code: result.reason?.code ?? String(result.reason) });
    }
    // WHOLE, not merely parseable: the body on disk must be one of the two, field for field. A
    // splice that happens to parse is exactly the failure a `JSON.parse` check would wave through.
    // Raw readFile + JSON.parse here on purpose, not `readTaskMeta`: the cell must see exactly what
    // ANY reader sees on disk right now, splice included, the same raw-filesystem stance
    // `p966.host` above takes with its own open()/rename() rather than going through a wrapper.
    const raw = await readFile(taskMetaPath(taskId), "utf8");
    let onDisk = null;
    try {
      onDisk = JSON.parse(raw);
    } catch (err) {
      spliced.push({ round: i, why: err?.message, bytes: raw.length });
      continue;
    }
    const match = bodies.find((body) => JSON.stringify(body) === JSON.stringify(onDisk));
    if (!match) spliced.push({ round: i, why: "parsed, but equal to neither writer's body", onDisk });
    else wins[match.writer] += 1;
  }

  assert.deepEqual(failures, [],
    `no writer may be told its write failed because a sibling in the SAME process won the race: `
    + `${failures.length} of ${COLLIDE_ROUNDS * 2} writes threw (${JSON.stringify(failures.slice(0, 5))}) — `
    + `each one fails a live intake with an untyped 'internal' (#1043)`);
  assert.deepEqual(spliced, [],
    `every read must see a body some writer wrote, WHOLE: ${spliced.length} of ${COLLIDE_ROUNDS} rounds `
    + `left a spliced sidecar (${JSON.stringify(spliced.slice(0, 3))}) — a spliced intake sidecar reads `
    + `back as 'not found' for a live capability, a spliced task sidecar hard-fails documentIngest_v2`);
  // NON-VACUITY: the two writes genuinely contended. A cell in which one writer always finished
  // before the other started would pass without ever exercising the defect.
  assert.ok(wins.intake > 0 && wins.reconciler > 0,
    `both writers must win rounds — otherwise nothing raced (intake=${wins.intake}, reconciler=${wins.reconciler})`);
  assert.equal((await readTaskMeta(taskId)).taskId, taskId,
    "…and the sidecar is still a readable sidecar at the end, not a temp file left in its place");
});

// ---------------------------------------------------------------------------
// 2b · THE LOST UPDATE — ONE sidecar, one writer at a time (#1044).
// ---------------------------------------------------------------------------
//
// WHAT #1043 LEFT BEHIND, in the README's own words: "Two writers of one sidecar still race on the
// rename itself, and the last rename wins: a full transport write and a DB-row merge landing
// together can still leave the merge's shorter body on disk." That is not a splice — every reader
// still sees a body some writer wrote, WHOLE — it is a LOST UPDATE, and the loss is not
// recoverable: the DB task row carries no transport, the runtime holds no SELECT on
// `clara.documents` (PIN-AB-6), so a sidecar left without `storageKey` cannot be repaired from
// Postgres. What follows is the belt refusing to dispatch the run ("has no transport metadata in
// its sidecar") or `documentIngest_v2` manufacturing a `storage_error` on an already-enqueued run.
//
// THE INTERLEAVE, in the order the ticket names it: `mergeTaskMeta` reads its base (nothing on disk
// yet — `clara.finalize_document_intake` commits the row BEFORE `lib/intake.mjs:439` writes the
// sidecar), the intake path's write lands, and the merge renames its stale body over it.
//
// MEASURED AGAINST THE PRE-FIX CODE, both launch orders, both platforms, 100 rounds each: at the
// natural body size 95 and 99 of 100 rounds lost the storage key on this Windows rig, 97 and 99 of
// 100 under WSL (the runner's platform). With the widener below, 100 of 100 on both. That is why
// this cell is ONE round per arm and not a loop — the interleave is reproduced by construction.
// `p1044.rounds` below keeps the loop, at the natural size, for the same property.
//
// THE WIDENER IS A CLOCK, NOT THE DEFECT. `engine_config` is a jsonb column `documentTaskSnapshot`
// carries verbatim onto the merge's patch; a megabyte of it makes the merge's own temp write long
// enough that the intake's short write always lands inside the merge's read-to-rename window. The
// window exists at any size — the 95-of-100 figure above is the natural one — and the widener only
// removes the need for a sleep.
const WIDENER_BYTES = 1024 * 1024;

/** `reconcilerShapedTask`, widened: the same DB-row patch with a megabyte of `engineConfig`. */
const widenedRow = (taskId, n) => ({
  ...reconcilerShapedTask(taskId, n),
  engineConfig: { model: "prebuilt-layout", widener: "x".repeat(WIDENER_BYTES) },
});

const TRANSPORT_KEYS = ["storageKey", "sha256", "mime", "format"];

test("p1044.lost_update: a merge cannot drop the transport fields a concurrent writer put on disk", async (t) => {
  await ownSpool(t);

  // Both launch orders, because the defect does not care which call was made first: what decides
  // it is which RENAME lands last, and before the fix that was whichever body took longer to write.
  for (const [label, mergeFirst] of [["merge first", true], ["intake write first", false]]) {
    const taskId = randomUUID();
    const intake = intakeShapedTask(taskId, 1);
    const startMerge = () => mergeTaskMeta(taskId, widenedRow(taskId, 1));
    const startWrite = () => writeTaskMeta(taskId, intake);
    await Promise.all(mergeFirst ? [startMerge(), startWrite()] : [startWrite(), startMerge()]);

    const onDisk = await readTaskMeta(taskId);
    for (const key of TRANSPORT_KEYS) {
      assert.equal(onDisk?.[key], intake[key],
        `${label}: the sidecar lost '${key}'. A merge may only change the keys it was given — `
        + `the DB task row carries no transport, and nothing can put it back (the runtime holds no `
        + `SELECT on clara.documents), so this sidecar can never be dispatched (#1044)`);
    }
  }

  // NON-VACUITY. Without this arm the cell would pass against a `mergeTaskMeta` that wrote nothing
  // at all: the two arms above end with the intake's own body on disk. Here the merge is the LAST
  // writer, so its write is the one on disk, and it must carry BOTH what it was given and what it
  // was not.
  const taskId = randomUUID();
  const intake = intakeShapedTask(taskId, 1);
  await writeTaskMeta(taskId, intake);
  await mergeTaskMeta(taskId, reconcilerShapedTask(taskId, 2));
  const merged = await readTaskMeta(taskId);
  assert.equal(merged.writer, "reconciler", "the merge really did write — otherwise the cell proves nothing");
  assert.equal(merged.n, 2, "…with its OWN values for the keys it was given");
  for (const key of TRANSPORT_KEYS) {
    assert.equal(merged[key], intake[key], `…and it kept '${key}', a key it was not given`);
  }
});

test("p1044.sweep: the REAL sweep's merge keeps the transport a concurrent intake write put on disk", async (t) => {
  await ownSpool(t);
  const taskId = randomUUID();
  const intake = intakeShapedTask(taskId, 1);
  // The `clara.document_processing_tasks` row `documentTaskSnapshot` selects — task columns only,
  // no transport (the runtime holds no SELECT on clara.documents, PIN-AB-6), widened as above.
  const row = {
    task_id: taskId,
    document_id: intake.documentId,
    firm_id: intake.firmId,
    engine_id: intake.engineId,
    engine_config: { model: "prebuilt-layout", widener: "x".repeat(WIDENER_BYTES) },
    version_n: 1,
    lane: "ocr",
    status: "queued",
    run_id: null,
    created_at: new Date(Date.now() - 60_000).toISOString(),
  };
  const dispatched = [];
  let intakeWrite = null;
  const client = {
    async query(sql) {
      if (/select t\.id as task_id/.test(sql)) {
        // THE INTAKE'S WRITE, launched at the one moment the ticket names: the DB row exists (this
        // snapshot IS it, and `clara.finalize_document_intake` committed it before the intake path
        // got here), and `lib/intake.mjs:439` has not written the sidecar yet. It lands while the
        // sweep's own merge is between its read and its rename.
        if (!intakeWrite) intakeWrite = writeTaskMeta(taskId, intake);
        return { rows: [row], rowCount: 1 };
      }
      if (/count\(\*\)::int as running/.test(sql)) return { rows: [], rowCount: 0 };
      throw new Error(`p1044.sweep drives no other statement: ${sql.slice(0, 60)}`);
    },
  };
  const deps = {
    graceMs: 0,
    enqueueDocumentIngest: async (id) => (dispatched.push(id), { runId: "run-1044" }),
    getRun: refuse("a run probe — this task carries no run id"),
  };

  const first = await reconcileDocumentTasks(client, deps);
  await intakeWrite;
  // Whether THIS sweep dispatches is a genuine coin toss and is not asserted: a merge that ran
  // entirely before the intake's write legitimately saw no transport, and refusing to dispatch is
  // then the correct fail-closed answer (0051 §2). What must never happen is the sidecar LOSING
  // what the intake wrote, because nothing can put it back.
  const afterSweep = await readTaskMeta(taskId);
  for (const key of TRANSPORT_KEYS) {
    assert.equal(afterSweep?.[key], intake[key],
      `the sweep's merge dropped '${key}' (documentTransportless=${first.documentTransportless}) — `
      + `this task can now never be dispatched (#1044)`);
  }

  // …and because it survived, the NEXT sweep dispatches it. Before the fix the key was gone for
  // good, so this second sweep refused too: documentTransportless=1, documentReenqueued=0.
  const second = await reconcileDocumentTasks(client, deps);
  assert.equal(second.documentTransportless, 0, "the second sweep must not refuse a task whose transport is on disk");
  assert.equal(second.documentReenqueued, 1, "…it dispatches it");
  assert.ok(dispatched.includes(taskId), `…through the ingest enqueue (dispatched=${JSON.stringify(dispatched)})`);
});

// The two cells above reproduce the interleave by construction, with a widened body. This one keeps
// the loop `p1043.collide` uses, at the size production actually writes: the window is not an
// artefact of the widener, and 95 of 100 rounds at THIS size lost the storage key before the fix on
// this rig (97 of 100 under WSL). It also holds the two things a lock is easy to get wrong: a
// merge that lands on a settled body still merges, and a settled queue leaves no entry behind.
const LOST_UPDATE_ROUNDS = 200;

test(`p1044.rounds: ${LOST_UPDATE_ROUNDS} rounds at the NATURAL body size keep every transport field`, async (t) => {
  await ownSpool(t);
  const lost = [];
  const unmerged = [];
  for (let i = 1; i <= LOST_UPDATE_ROUNDS; i += 1) {
    const taskId = randomUUID();
    const intake = intakeShapedTask(taskId, i);
    const startMerge = () => mergeTaskMeta(taskId, reconcilerShapedTask(taskId, i));
    const startWrite = () => writeTaskMeta(taskId, intake);
    // Both launch orders, alternating, because the defect never cared which call was made first.
    await Promise.all(i % 2 === 1 ? [startMerge(), startWrite()] : [startWrite(), startMerge()]);

    const raced = await readTaskMeta(taskId);
    const missing = TRANSPORT_KEYS.filter((key) => raced?.[key] !== intake[key]);
    if (missing.length > 0) lost.push({ round: i, missing });

    // NON-VACUITY, per round: a `mergeTaskMeta` that wrote nothing at all would pass every
    // assertion above, because the intake's own body is a legal outcome of the race. A merge over
    // the SETTLED body must land, and must keep the keys it was not given.
    const settled = await mergeTaskMeta(taskId, reconcilerShapedTask(taskId, -i));
    const wrong = TRANSPORT_KEYS.filter((key) => settled[key] !== intake[key]);
    if (settled.n !== -i || settled.writer !== "reconciler" || wrong.length > 0) {
      unmerged.push({ round: i, n: settled.n, writer: settled.writer, wrong });
    }
  }

  assert.deepEqual(lost, [],
    `a merge may only change the keys it was given: ${lost.length} of ${LOST_UPDATE_ROUNDS} rounds lost a `
    + `transport field (${JSON.stringify(lost.slice(0, 3))}). The DB task row carries none of them and `
    + `nothing can put them back, so each one is a document that can never be dispatched (#1044)`);
  assert.deepEqual(unmerged, [],
    `…and the merge still MERGES: ${unmerged.length} rounds came back without the patch or without the `
    + `keys the patch did not name (${JSON.stringify(unmerged.slice(0, 3))})`);
  assert.equal(_sidecarLockCountForTest(), 0,
    `every queue must be collected when it drains — ${_sidecarLockCountForTest()} left after `
    + `${LOST_UPDATE_ROUNDS} distinct sidecars, and a runtime mints a new task id for every document `
    + `it ever ingests`);
});

// ONE PATH, NOT THREE READS OF THE ENVIRONMENT (review round, ADV-L06-05). `mergeTaskMeta`'s own
// header says the lock's key and the write's target are "the same string by construction, never
// two reads of `CLARA_SPOOL_DIR` that a test could change in between" — and then read through
// `readTaskMeta(id)`, which computes `taskMetaPath(id)` a THIRD time. The lock is taken and the
// merge's turn runs in a later microtask, so anything that repoints the spool between the call and
// that turn made the merge read one directory and write another: a lost update with the same
// consequence #1044 exists to prevent, through the one door the header claimed was closed.
test("p1044.one_path: a merge reads the sidecar at the path it locked, not at whatever the environment says later", async (t) => {
  const dirA = await ownSpool(t);
  const dirB = await mkdtemp(join(root, "spool-elsewhere-"));
  const taskId = randomUUID();
  const intake = intakeShapedTask(taskId, 1);
  await writeTaskMeta(taskId, intake);

  // Synchronous, so it lands before the locked turn's own read — no sleep and no race.
  const merging = mergeTaskMeta(taskId, reconcilerShapedTask(taskId, 1));
  process.env.CLARA_SPOOL_DIR = dirB;
  const merged = await merging;
  process.env.CLARA_SPOOL_DIR = dirA;

  const missing = TRANSPORT_KEYS.filter((key) => merged?.[key] !== intake[key]);
  assert.deepEqual(missing, [],
    `the merge answered without ${JSON.stringify(missing)} — it read an EMPTY base out of ${dirB} and wrote the `
    + `result back to the path it locked in ${dirA}, so the transport fields on disk were dropped by the merge `
    + "that was supposed to preserve them (#1044)");
  const onDisk = await readTaskMeta(taskId);
  assert.deepEqual(TRANSPORT_KEYS.filter((key) => onDisk?.[key] !== intake[key]), [],
    "…and the body left on disk at the locked path carries them too");
  assert.equal(onDisk.n, 1, "…and the patch landed");
});

// THE DELETE IS A MUTATION TOO (review round, ADV-L06-01). `withSidecarLock` closed the merge
// against every WRITE of the same sidecar and left the one remaining mutator — `removeTaskMeta` —
// outside it, so a terminal cleanup's delete could land between a merge's read and its rename and
// be undone by it. THE ORDERING IS THE PRODUCTION ONE, not a contrivance:
// `reconciler-documents.mjs` snapshots the rows whose status is still queued/held_egress/running
// and then merges each onto its own sidecar in a sequential loop, while
// `documentIngest.behavior_v2.mjs` calls `services.removeTaskMeta` the moment a task goes terminal
// — so the delete routinely lands inside a LATER task's merge window. The orphan it leaves is
// permanent: `SPOOL_REAPABLE` matches `intake-*` only, so no TTL sweep ever collects a
// `task-<id>.json`, and the reconciler's degraded arm (`listTaskMetas()` when the document SELECT
// is unavailable) would read it back as a live queued task.
const DELETE_ROUNDS = 50;

test(`p1044.delete: ${DELETE_ROUNDS} rounds of a terminal cleanup against an in-flight merge leave the sidecar GONE`, async (t) => {
  await ownSpool(t);
  const resurrected = [];
  for (let i = 1; i <= DELETE_ROUNDS; i += 1) {
    const taskId = randomUUID();
    await writeTaskMeta(taskId, intakeShapedTask(taskId, i));
    // The widener is the same instrument the lost-update cells use: it lengthens the merge's own
    // temp write so the delete lands INSIDE the window rather than needing a sleep to get there.
    const merge = mergeTaskMeta(taskId, widenedRow(taskId, i));
    const cleanup = removeTaskMeta(taskId);
    await Promise.all([merge, cleanup]);
    if (await readTaskMeta(taskId) !== null) resurrected.push(i);
  }
  assert.deepEqual(resurrected, [],
    `a delete that has been ordered must stay done: ${resurrected.length} of ${DELETE_ROUNDS} rounds came back `
    + `with the sidecar the terminal cleanup deleted (rounds ${JSON.stringify(resurrected.slice(0, 5))}). Nothing `
    + `ever collects it — SPOOL_REAPABLE is intake-only — and the reconciler's degraded arm reads a stray `
    + `task-<id>.json as a live queued task, so each one is a document that can be dispatched again (#1044)`);
  assert.equal(_sidecarLockCountForTest(), 0,
    `…and the delete's own turn is collected like every other: ${_sidecarLockCountForTest()} queue(s) left after `
    + `${DELETE_ROUNDS} distinct sidecars`);
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

test("p966.budget: a sweep opens at most TEN sidecars that carry an intake, never the whole directory", async () => {
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
    "the belt takes at most ten slots and must now OPEN at most ten — opening all 25 is the cost this ticket removes "
    + "(these ten carry an intake, so they spend a slot each although 'uploading' is not actionable: see the LIVE-upload cell below)");
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

test("p966.expire: an intake past its 15-minute capability is still failed through the DB writer and its spool cleared", async (t) => {
  await ownSpool(t);
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

test("p966.expire: a FRESH sidecar past its capability is expired on the NEXT sweep — a delay, not a retirement", async () => {
  // Review finding SPEC-4. On origin/main the expiry arm ran BEFORE the recency guard, so a
  // freshly-stamped-but-expired intake was expired on that same sweep; the guard now runs across
  // the whole listing ahead of everything, so it gates this arm too. That is what the ticket asked
  // for in as many words — "the belt decides what to skip from directory metadata BEFORE opening
  // anything", and `expiresAt` can only be read by opening — and the acceptance criterion it has
  // to keep is "still expires an intake whose upload capability has passed its 15-minute expiry",
  // which carries no latency clause. The change is a bounded DELAY (one quiet window, five
  // seconds, against a fifteen-minute capability ≈ three leader cycles), and this cell is what
  // says so out loud instead of the prose saying it.
  const id = randomUUID();
  const body = () => sidecar(id, 1, { status: "uploading", expiresAt: new Date(Date.now() - 1000).toISOString() });

  const fresh = entryDouble(id, { ageMs: 0, body: body() });
  const now = await drive([fresh], () => {});
  assert.equal(fresh.reads, 0, "inside the quiet window it is not even opened — the guard is ahead of the open");
  assert.deepEqual(now, { recovered: 0, deferred: 0, expired: 0 }, "…so it is not expired on THIS sweep");

  const settled = entryDouble(id, { ageMs: 60_000, body: body() });
  const later = await drive([settled], () => {});
  assert.equal(settled.reads, 1, "…and once the sidecar has been quiet it IS opened…");
  assert.deepEqual(later, { recovered: 0, deferred: 0, expired: 1 },
    "…and expired, so the guard delays this arm by one quiet window and never retires it");
});

test("p966.resume: an intake left mid-flight by a crash is still driven, once it is past the guard", async (t) => {
  await ownSpool(t);
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

test("p966.listing: the metadata listing carries mtime and a lazy read, and opens nothing by itself", async (t) => {
  await ownSpool(t);
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

test("p966.listing: listIntakeMetas keeps its old contract — one code path, not two that drift", async (t) => {
  await ownSpool(t);
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

// ---------------------------------------------------------------------------
// 6 · THE BUDGET IS A BUDGET FOR ACTIONS — junk in the spool must not spend it.
// ---------------------------------------------------------------------------

// The three shapes `read()` hands back that carry NO intake to act on: the `{corrupt, file}`
// marker, a body whose `intakeId` never made it to disk, and `null` (the sidecar was collected
// between the listing and the read). Before #966 no number of them could hide a crashed intake,
// because the filter ran BEFORE the ten were taken (origin/main's `intake.mjs`:
// `listIntakeMetas().filter(row => row && !row.corrupt && row.intakeId)` and only then
// `.slice(0, 10)`). That is the contract these cells hold the new shape to.

const corruptEntry = () => {
  const id = randomUUID();
  return entryDouble(id, { ageMs: 60_000, body: { corrupt: true, file: `intake-${id}.json` } });
};
const idlessEntry = () => entryDouble(randomUUID(), { ageMs: 60_000, body: { schemaVersion: 1, status: "spooled" } });
const goneEntry = () => entryDouble(randomUUID(), { ageMs: 60_000, body: null });

const crashedEntry = () => {
  const id = randomUUID();
  return entryDouble(id, { ageMs: 60_000, body: sidecar(id, 1, { status: "verified" }) });
};

/** The belt's deferred arm as positive evidence that a sidecar was not merely OPENED but carried
 *  into `finalizeDocumentIntake` — the same double `p966.resume` uses, for the same reason. */
const drive = (entries, log) => recoverPendingDocumentIntakes({
  withRuntime: async (fn) => fn({ query: async () => ({ rows: [{ receipt: null }] }) }),
  enqueue: async () => ({ runId: "x" }),
  listEntries: async () => entries,
  log,
});

test("p966.budget: sidecars the belt cannot USE never spend the ten slots it acts with", async () => {
  // Five unparseable, four with no `intakeId`, three already collected — twelve files ahead of the
  // one intake a crash left behind, which is two more than the belt's whole action budget.
  const junk = [...Array.from({ length: 5 }, corruptEntry), ...Array.from({ length: 4 }, idlessEntry),
    ...Array.from({ length: 3 }, goneEntry)];
  const crashed = crashedEntry();

  const log = [];
  const out = await drive([...junk, crashed], (m) => log.push(m));

  assert.equal(crashed.reads, 1,
    "TWELVE unreadable sidecars ahead of one crashed intake must not blind the belt: ten ACTION slots "
    + "spent on files that carry no intake is a human's uploaded document silently never appearing");
  assert.equal(out.deferred, 1, "…and the crashed intake is carried into the finalize path, not merely opened");
  assert.ok(log.some((m) => m.includes("9") && m.includes(junk[0].name)),
    "…and the skip is not silent: ONE bounded line per sweep for the NINE files a human could go and look at "
    + `(a sidecar that vanished between the listing and the read is not an event), naming one of them (got ${JSON.stringify(log)})`);
});

test("p966.budget: …and the READ bound survives — a sweep still opens a bounded number of sidecars", async () => {
  // The open bound is what the ticket exists for: an open is the handle a live intake's next
  // rename collides with. So the belt reads past junk, but not forever — and this cell pins the
  // residual honestly rather than claiming there is none. `sweepSpoolTtl` is what clears it.
  const junk = Array.from({ length: 60 }, corruptEntry);
  const crashed = crashedEntry();

  const out = await drive([...junk, crashed], () => {});

  assert.equal(junk.filter((e) => e.reads > 0).length, 30,
    "thirty opens — three times the action budget — and then the sweep stops rather than reading the whole directory");
  assert.equal(crashed.reads, 0, "…so sixty unusable sidecars DO still delay recovery: the TTL reaper below is what ends that");
  assert.deepEqual(out, { recovered: 0, deferred: 0, expired: 0 });
});

test("p966.budget: a settled LIVE upload DOES spend one of the ten — the carve-out is for junk, not for uploads", async () => {
  // Review finding SPEC-3. The budget above is ten ACTIONS in the sense the carve-out was built
  // for — a sidecar that carries NO intake costs a read and no slot. It is not ten actions in the
  // wider sense: a sidecar that carries a real intake in a status this belt cannot act on
  // (`uploading`, `receiving` — a 20 MB body still streaming, whose last status write is minutes
  // old and so past the quiet window) spends a slot while nothing is done with it. That is
  // origin/main's behaviour byte for byte (its filter was `row && !row.corrupt && row.intakeId`,
  // which also let a live status through into the ten) and it is DELIBERATE here, not an
  // oversight: exempting live uploads would let one sweep open up to RECOVERY_OPEN_BUDGET of them
  // instead of ten, tripling the belt's handle-taking on exactly the files #966 exists to stop
  // touching. The two junks are not alike — this one clears itself and the other does not, which
  // is what the second half of this cell pins.
  const live = Array.from({ length: 10 }, () => {
    const id = randomUUID();
    return entryDouble(id, { ageMs: 60_000, body: sidecar(id, 1, { status: "uploading" }) });
  });
  const crashed = crashedEntry();

  const blinded = await drive([...live, crashed], () => {});

  assert.deepEqual(live.map((e) => e.reads), Array(10).fill(1), "each live sidecar is opened once…");
  assert.equal(crashed.reads, 0,
    "…and ten of them DO hide the crashed intake behind them for this sweep — the residual SPEC-3 names, "
    + "pinned rather than claimed away");
  assert.deepEqual(blinded, { recovered: 0, deferred: 0, expired: 0 });

  // THE CEILING, which corrupt junk has not got: a live sidecar carries a 15-minute capability,
  // and the belt's expiry arm is an action it always takes. So the blind window ends by itself
  // within the capability's life — where `{corrupt}` junk blinds the belt until `sweepSpoolTtl`.
  const stale = Array.from({ length: live.length }, () => {
    const id = randomUUID();
    return entryDouble(id, { ageMs: 60_000, body: sidecar(id, 1, { status: "uploading", expiresAt: new Date(Date.now() - 1000).toISOString() }) });
  });
  const behind = crashedEntry();

  const cleared = await drive([...stale, behind], () => {});

  assert.equal(cleared.expired, 10, "every past-capability live sidecar is expired — the slot is spent on an ACTION");
  assert.equal(behind.reads, 0, "…this sweep is still full, so the crashed intake waits one more cycle…");
  const after = await drive([behind], () => {});
  assert.equal(after.deferred, 1, "…and the NEXT sweep, with those ten gone, carries it into the finalize path");
});

test("p966.reap: the TTL sweep reaps an UNREADABLE sidecar too — the blind window has an end", async (t) => {
  await ownSpool(t);
  // The bound above is honest, not comfortable: junk the belt reads past is junk that has to go
  // away on its own, or a crashed intake sits behind it for as long as somebody keeps the file
  // there. The TTL sweep matched `intake-<uuid>.(bin|json)` ONLY, so a sidecar whose name was not
  // a uuid — exactly the shape a foreign or half-written file takes — was never reaped by anybody.
  const dir = spoolConfig().dir;
  const stale = join(dir, "intake-00junk-1.json");
  const fresh = join(dir, "intake-00junk-2.json");
  await writeFile(stale, "{ not json");
  await writeFile(fresh, "{ not json");
  const old = new Date(Date.now() - 3 * 60 * 60_000); // past any ttl: the floor is 15 minutes, the default 60
  await utimes(stale, old, old);

  const { spoolRemoved } = await sweepSpoolTtl();

  assert.ok(spoolRemoved >= 1, "the stale unreadable sidecar is reaped");
  await assert.rejects(readFile(stale), { code: "ENOENT" }, "…it is really gone");
  assert.equal(await readFile(fresh, "utf8"), "{ not json",
    "…and a sidecar inside the TTL is left exactly where it is: this reaper has never been allowed to race a live capability");
  await rm(fresh, { force: true });
});

test("p966.giveup: a rename that will never succeed costs the intake the DEADLINE and no more", async (t) => {
  // Fix round 1 (review finding L09-C). The retry exists for a handle that lives MICROSECONDS —
  // the recovery belt's own read. A handle that is never released (a stuck indexer or AV scan;
  // #693 already shows Defender holding files on this host) is a different animal: every intake
  // status transition goes through `atomicJson`, so whatever this deadline is, a stuck handle
  // costs it ONCE PER TRANSITION PER INTAKE, on the latency-sensitive intake path, across a
  // hundred-child batch — the exact workload #636/#966 were measured on. At the first cut's two
  // seconds that was measured here at `EPERM after 2003 ms`. The knob is the answer, not the
  // retry: 250 ms is still a thousand times a reader's handle.
  const dir = await ownSpool(t);
  const id = randomUUID();
  await writeIntakeMeta(id, sidecar(id, 1));

  const held = await open(intakePaths(id).meta, "r");
  const started = Date.now();
  let code = "ok";
  try {
    await writeIntakeMeta(id, sidecar(id, 2));
  } catch (err) {
    code = err?.code ?? String(err);
  }
  const elapsed = Date.now() - started;
  await held.close();

  if (process.platform === "win32") {
    assert.equal(code, "EPERM",
      "the ORIGINAL error, unchanged: the retry is a bounded WAIT, never a swallow — a caller that is told the write landed when it did not is worse than a caller that is told it failed");
    assert.ok(elapsed < 1000,
      `a permanently held handle must cost the intake the deadline and stop (took ${elapsed} ms) — every second here is a second of a human's upload`);
  } else {
    assert.equal(code, "ok", "POSIX renames over an open destination; there is nothing to give up on here");
  }
  assert.deepEqual((await readdir(dir)).filter((n) => n.endsWith(".tmp")), [],
    "…and the temp file goes with it: a transient write failure must not grow the spool with files the TTL sweep does not match");
});
