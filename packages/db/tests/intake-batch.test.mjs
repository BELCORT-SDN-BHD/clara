// #636 — the INTAKE BATCH battery for packages/db/migrations/0229_intake_batches.sql.
//
// FRONTIER-GATED on the `intake_batches$` stable stem (the `client-work-pack.test.mjs:1-80`
// shape, restated here for this migration's own stem so the slice-frontier legs SKIP cleanly
// rather than red on a database pinned before 0229 lands). A skip is not evidence; the green run
// that matters is the one on a chain that carries 0229, and a FOCUSED run without the
// preintegration gate module FAILS LOUDLY below it.
//
// WHAT THIS FILE IS ABOUT. `clara.intake_batches` is a firm-scoped, durable grouping of admitted
// sources. Its member child carries up to THREE identities in order — intake always, document
// once in custody, Work once some lane admits one — and the read derives FIVE overlapping facets
// at read time, never storing a count. Cancelling fans out one `clara.cancel_accounting_work` per
// live child, so a child that already posted keeps its receipt.
//
// WHAT IT DELIBERATELY DOES NOT PROVE. Nothing here says anything about the BROWSER: the card,
// its eight states, the 320px/200%/reduced-motion cells and the deep link are proven by
// `apps/web/components/documents/intake-batch-*.test.tsx` and
// `apps/web/e2e/intake-batch-walk.spec.ts`. The runtime fan-out and its resume are proven by
// `packages/runtime/tests/intake-batch-unit.test.mjs` and `intake-batch-e2e.mjs`. This file proves
// the doors, under real least-privileged Postgres roles.
//
// EVERY ASSERTION GOES THROUGH `humanQuery` / `roleQuery` least-privileged personas. `rootQuery`
// appears only as LABELLED fixture DML and as catalog reads.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  ROLES, roleQuery, rootQuery, humanQuery, namedCall, opk, endPool, assertRaises,
  buildWorkWorld, admitJournalWork, basis, claimWorkRun, settleWorkRun, mintClientObo,
  wakeRecordJournalEntry, workRow, receiptsForWork, detailOf, printSkipCount, retryAccountingWork,
  tasksForWork,
} from "./work-journal-fixtures.mjs";
import { markSkip } from "./wave-a-helpers.mjs";
import { sha } from "./rig-helpers.mjs";
import { seedIntake, finalizeIntake, fileDocument } from "./rig-docs-fixtures.mjs";

const CLR04 = "CLR04";
const CLR10 = "CLR10";
const CLR11 = "CLR11";
const CLR13 = "CLR13";
const CLR18 = "CLR18";
const STEM = "intake_batches$";

let _ready = null;
async function batchLaneReady() {
  if (_ready === null) {
    try {
      const r = await rootQuery(
        "select count(*)::int as n from clara.schema_migrations where version ~ $1", [STEM]);
      _ready = r.rows[0].n > 0;
    } catch {
      _ready = false;
    }
  }
  return _ready;
}
async function gate(t) {
  if (await batchLaneReady()) return false;
  markSkip();
  t.skip(`#636 intake-batch lane absent (no ${STEM} migration applied)`);
  return true;
}

// #964 — the document-ingest capacity window's move to Asia/Kuala_Lumpur lives in its OWN
// migration (0252), a separate frontier from 0229's above: a slice-frontier CI leg can be pinned
// AT 0229, before 0252 lands, and the cell below must skip cleanly there rather than red on a
// `get_intake_batch` capacity block that has not yet moved off the UTC day. Mirrors work-list
// .test.mjs's `INTENT_KEY_STEM` / `gateIntentKey` pattern for the identical reason.
const MYT_WINDOW_STEM = "document_ingest_window_myt$";
let _mytReady = null;
async function mytWindowReady() {
  if (_mytReady === null) {
    try {
      const r = await rootQuery(
        "select count(*)::int as n from clara.schema_migrations where version ~ $1", [MYT_WINDOW_STEM]);
      _mytReady = r.rows[0].n > 0;
    } catch {
      _mytReady = false;
    }
  }
  return _mytReady;
}
async function gateMytWindow(t) {
  if (await mytWindowReady()) return false;
  markSkip();
  t.skip(`#964 document-ingest MYT window absent (no ${MYT_WINDOW_STEM} migration applied)`);
  return true;
}

let world = null;
before(async () => {
  // A SKIP IS NOT EVIDENCE, and a FOCUSED run says so out loud.
  if (!(await batchLaneReady()) && process.env.CLARA_ALLOW_MISSING_INTAKE_BATCHES !== "1") {
    throw new Error(
      `#636: no migration matching /${STEM}/ is applied to this database, and `
      + "CLARA_ALLOW_MISSING_INTAKE_BATCHES is not set. Apply 0229_intake_batches.sql, or "
      + "preload tests/intake-batches-preintegration-gate.mjs if a lane-less database is "
      + "expected here.",
    );
  }
  world = await buildWorkWorld();
});
after(async () => {
  printSkipCount("intake-batch");
  await endPool();
});

const ALICE = () => world.users.alice; // owner, firm A
const BOB = () => world.users.bob;     // bookkeeper, firm A — the floor these doors are written to
const CAROL = () => world.users.carol; // viewer, firm A
const DAVE = () => world.users.dave;   // owner, firm B
const FIRM_A = () => world.firms.A;

// ===========================================================================================
// The door wrappers. NAMED arguments only — a divergence in a parameter name is a real finding
// rather than a silent positional mismatch.
// ===========================================================================================

const runtime = (sql, params) => roleQuery(ROLES.runtime, sql, params).then((r) => r.rows[0].result);

const openBatch = (actor, { origin = "documents_tab", label = "p636 batch", session = null,
  opKey = null } = {}) =>
  runtime(namedCall("open_intake_batch", [
    { name: "p_actor", cast: "uuid" }, { name: "p_origin", cast: "text" },
    { name: "p_label", cast: "text" }, { name: "p_session", cast: "uuid" },
    { name: "p_op_key", cast: "text" },
  ]), [actor, origin, label, session, opKey ?? opk("p636-open")]);

const attach = (actor, batch, intake, opKey = null) =>
  runtime(namedCall("attach_intake_to_batch", [
    { name: "p_actor", cast: "uuid" }, { name: "p_batch", cast: "uuid" },
    { name: "p_intake", cast: "uuid" }, { name: "p_op_key", cast: "text" },
  ]), [actor, batch, intake, opKey ?? opk("p636-attach")]);

const setDependency = (actor, intake, dependency, reason = null, opKey = null) =>
  runtime(namedCall("set_intake_batch_member_dependency", [
    { name: "p_actor", cast: "uuid" }, { name: "p_intake", cast: "uuid" },
    { name: "p_dependency", cast: "text" }, { name: "p_reason", cast: "text" },
    { name: "p_op_key", cast: "text" },
  ]), [actor, intake, dependency, reason, opKey ?? opk("p636-dep")]);

const cancelBatch = (actor, batch, opKey) =>
  runtime(namedCall("cancel_intake_batch", [
    { name: "p_actor", cast: "uuid" }, { name: "p_batch", cast: "uuid" },
    { name: "p_op_key", cast: "text" },
  ]), [actor, batch, opKey]);

const sweep = (limit = 20) =>
  runtime(namedCall("sweep_intake_batch_cancellations", [{ name: "p_limit", cast: "int" }]), [limit]);

const cancelWork = (work, author, opKey) =>
  runtime(namedCall("cancel_accounting_work", [
    { name: "p_work", cast: "uuid" }, { name: "p_author", cast: "uuid" },
    { name: "p_op_key", cast: "text" },
  ]), [work, author, opKey]);

async function getBatch(sub, batch, { preview = null } = {}) {
  const r = preview === null
    ? await humanQuery(sub, "select clara.get_intake_batch(p_batch => $1::uuid) as result", [batch])
    : await humanQuery(sub,
      "select clara.get_intake_batch(p_batch => $1::uuid, p_preview => $2::int) as result",
      [batch, preview]);
  return r.rows[0].result;
}

// ===========================================================================================
// Fixture builders. `seedIntake` is LABELLED fixture DML (the runtime lane's own insert, the
// `rig-docs-intakes.test.mjs:88` idiom) — the estate has no single door that drives bytes from
// `uploading` to `verified` without a real upload, and this battery is about the batch, not the
// pipeline. `clara.finalize_document_intake` (the REAL door) is what creates the document, which
// is what §C's custody trigger actually keys on.
// ===========================================================================================

const memberRow = (intake) => rootQuery(
  "select * from clara.intake_batch_members where intake_id=$1", [intake]).then((r) => r.rows[0]);
const batchRow = (id) => rootQuery(
  "select * from clara.intake_batches where id=$1", [id]).then((r) => r.rows[0]);
const eventsFor = (member) => rootQuery(
  "select event, detail, actor_id from clara.intake_batch_member_events where member_id=$1 order by recorded_at, event",
  [member]).then((r) => r.rows);

/** An intake of `firm`, verified and ready to finalize. Labelled fixture DML. */
async function verifiedIntake(firm, uploadedBy, { filename = "p636.pdf" } = {}) {
  const digest = sha(randomUUID());
  return seedIntake({
    firm, uploadedBy, origin: "documents_tab", status: "verified", filename,
    sha256: digest, storageKey: `firms/${firm}/docs/${digest}.pdf`,
  });
}

/** A member in CUSTODY: intake attached, then finalized so a document exists. */
async function custodyMember(batch, { firm = null, actor = null, filename } = {}) {
  const f = firm ?? FIRM_A();
  const a = actor ?? ALICE();
  const intake = await verifiedIntake(f, a, { filename });
  const attached = await attach(a, batch, intake);
  await finalizeIntake({ intake });
  const doc = (await rootQuery(
    "select document_id from clara.document_intakes where id=$1", [intake])).rows[0].document_id;
  return { intake, document: doc, member_id: attached.member_id };
}

/** A member whose document is FILED to `client` and named by a freshly admitted Work. */
async function workMember(batch, client, { actor = null, memo = "p636" } = {}) {
  const a = actor ?? ALICE();
  const m = await custodyMember(batch, { actor: a });
  await fileDocument(a, { document: m.document, client });
  const admitted = await admitJournalWork({
    client, author: a, basis: basis({ memo }),
    sourceRefs: [{ kind: "document", document_id: m.document }],
  });
  return { ...m, ...admitted };
}

/** Post a Work through the wake verb so a COMMITTED operation receipt exists. */
async function postWork({ client, work, task }) {
  const w = await workRow(work);
  await claimWorkRun({ task, runId: opk("p636-run") });
  const obo = await mintClientObo({ firm: FIRM_A(), obo: ALICE(), client });
  await wakeRecordJournalEntry(obo.secret, {
    client, work, logicalOpId: w.logical_op_id, basis: w.basis,
  });
  await settleWorkRun({ task, outcome: "completed" });
  const receipts = (await receiptsForWork(work)).filter((r) => r.outcome === "committed");
  assert.equal(receipts.length, 1, "the fixture must have produced exactly one committed receipt");
  return receipts[0].id;
}

// ===========================================================================================
// CELLS 2-7 — THE MEASUREMENTS. They ran BEFORE the migration text was written (see 0229's
// header §M1/M2/M3) and are pinned here so a later change to the pipeline reds against #636
// instead of silently moving what this ticket reports.
// ===========================================================================================

test("p636.batch.capacity_refusal — the shipped ceilings are FLUSH and the refusal names its guard", async (t) => {
  if (await gate(t)) return;
  // A fresh firm of its own, so the count is this cell's and nobody else's.
  const { createFirm, seedAdmission, insertUser } = await import("./rig-fixtures.mjs");
  const owner = await insertUser(`p636cap_${Date.now().toString(36)}`, "owner");
  const firm = await createFirm(owner, {
    name: `p636cap_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    token: await seedAdmission(), opKey: opk("p636-firm"),
  });
  const create = namedCall("create_document_intake", [
    { name: "p_uploaded_by", cast: "uuid" }, { name: "p_origin", cast: "text" },
    { name: "p_chat_session", cast: "uuid" }, { name: "p_filename", cast: "text" },
    { name: "p_mime", cast: "text" }, { name: "p_declared_bytes", cast: "bigint" },
    { name: "p_token_hash", cast: "text" }, { name: "p_expires_at", cast: "timestamptz" },
    { name: "p_op_key", cast: "text" },
  ]);
  let admitted = 0; let err = null;
  for (let i = 1; i <= 120; i++) {
    try {
      await roleQuery(ROLES.runtime, create, [
        owner, "documents_tab", null, `cap${i}.pdf`, "application/pdf", 1048576,
        sha(`p636cap-${firm}-${i}`), new Date(Date.now() + 900_000).toISOString(),
        opk(`p636cap${i}`)]);
      admitted += 1;
    } catch (e) { err = e; break; }
  }
  assert.equal(admitted, 100, "exactly 100 <=1MB PDFs are admitted on the shipped defaults");
  assert.equal(err?.code, CLR18, "the 101st is refused CLR18");
  assert.match(err.message, /docs/, "the refusal names the DOCS guard, not the pages guard");
  assert.equal(err.detail ?? null, null,
    "the 0007 capacity refusals carry NO detail.reason — the surface renders the message itself");
  const used = await rootQuery(
    `select count(*)::int docs, coalesce(sum(pages_reserved),0)::int pages
       from clara.document_ingest_reservations
      where firm_id=$1 and state <> 'refunded'
        and created_at >= (date_trunc('day', now() at time zone 'utc') at time zone 'utc')`, [firm]);
  assert.deepEqual(used.rows[0], { docs: 100, pages: 1000 },
    "both ceilings are FLUSH at 100 members of this kind — a battery sized below that never reds here");
});

test("p636.batch.ladder_by_kind — the same member count binds on DIFFERENT ceilings by file kind", async (t) => {
  if (await gate(t)) return;
  const ladder = await rootQuery(
    `select clara._declared_page_ceiling(1048576,'image/png') as img,
            clara._declared_page_ceiling(1048576,'application/pdf') as pdf1,
            clara._declared_page_ceiling(5242880,'application/pdf') as pdf5,
            clara._declared_page_ceiling(10485760,'application/pdf') as pdf10,
            clara._declared_page_ceiling(20971520,'application/pdf') as pdf20`);
  assert.deepEqual(ladder.rows[0], { img: 1, pdf1: 10, pdf5: 50, pdf10: 100, pdf20: 200 },
    "the five rungs are 1/10/50/100/200 (0007:1622-1630)");
  // The derivation C83.X2 asks for, as arithmetic over the measured rungs and the shipped
  // defaults (docs 100 / pages 1000). MEASURED end-to-end in p636.batch.capacity_refusal for the
  // <=1MB PDF row, and by driving the real door for the other two on the rig (0229 header M1).
  const cap = (pages) => Math.min(100, Math.floor(1000 / pages));
  assert.equal(cap(1), 100, "image members: the DOCS ceiling binds at 100");
  assert.equal(cap(10), 100, "<=1MB PDF members: both ceilings bind flush at 100");
  assert.equal(cap(50), 20, "<=5MB PDF members: the PAGES ceiling binds at 20");
  assert.equal(cap(200), 5, ">10MB PDF members: the PAGES ceiling binds at 5");
});

// #964 recut: this cell was `p636.batch.capacity_window_utc`, pinning a UTC-day window and
// asserting nothing about what the window SHOULD be ("moving it to MYT is #635's call"). #964 is
// that call. The cell is renamed so it no longer asserts UTC is correct, and its assertions now
// pin the Asia/Kuala_Lumpur boundary #964 shipped — the SAME raw-predicate technique (pure SQL
// timezone arithmetic over crafted instants, since `document_ingest_reservations.created_at` is
// IMMUTABLE and nothing in this estate can move `now()` for a session), pointed at the new zone.
// Unlike its predecessor this is NOT gated on 0252: the expression is true independent of which
// body is live, which is exactly what makes a future move visible in a diff rather than silent
// (0229's own words about this cell, restated). The MECHANISM proof — that the three production
// bodies actually COMPUTE this expression — lives in document-ingest-window-myt.test.mjs, gated
// on 0252's stem, never duplicated here.
test("p964.window.capacity_window_myt — the daily window is an Asia/Kuala_Lumpur calendar day, reset at MYT midnight", async (t) => {
  if (await gate(t)) return;
  const w = (await rootQuery(
    `select (date_trunc('day', now() at time zone 'Asia/Kuala_Lumpur') at time zone 'Asia/Kuala_Lumpur') as ws,
            ((date_trunc('day', now() at time zone 'Asia/Kuala_Lumpur') at time zone 'Asia/Kuala_Lumpur')
               at time zone 'Asia/Kuala_Lumpur')::time::text as local_time`)).rows[0];
  assert.equal(w.local_time, "00:00:00",
    "the MYT-day boundary lands at MYT MIDNIGHT — the card says 'resets at midnight', never 08:00");
  const ws = w.ws.getTime();

  // AC3 + the boundary itself: a pair straddling MYT MIDNIGHT falls in DIFFERENT windows.
  const straddleMidnight = await rootQuery(
    `select (v.ts >= (date_trunc('day', now() at time zone 'Asia/Kuala_Lumpur') at time zone 'Asia/Kuala_Lumpur')) as counted_today,
            (date_trunc('day', v.ts at time zone 'Asia/Kuala_Lumpur') at time zone 'Asia/Kuala_Lumpur') as myt_window
       from unnest($1::timestamptz[]) as v(ts)`,
    [[ws - 1000, ws + 1000].map((t2) => new Date(t2).toISOString())]);
  const [beforeMidnight, afterMidnight] = straddleMidnight.rows;
  assert.notEqual(beforeMidnight.myt_window.getTime(), afterMidnight.myt_window.getTime(),
    "two reservations straddling MYT MIDNIGHT fall in DIFFERENT daily windows");
  assert.equal(beforeMidnight.counted_today, false);
  assert.equal(afterMidnight.counted_today, true);

  // AC2: 09:00 MYT and 23:00 MYT of the SAME MYT date count toward ONE quota.
  const sameDay = await rootQuery(
    `select (date_trunc('day', v.ts at time zone 'Asia/Kuala_Lumpur') at time zone 'Asia/Kuala_Lumpur') as myt_window
       from unnest($1::timestamptz[]) as v(ts)`,
    [[ws + 9 * 3600 * 1000, ws + 23 * 3600 * 1000].map((t2) => new Date(t2).toISOString())]);
  assert.equal(sameDay.rows[0].myt_window.getTime(), sameDay.rows[1].myt_window.getTime(),
    "09:00 MYT and 23:00 MYT of the same MYT date must count toward ONE quota");

  // AC1: a reservation at 06:00 MYT counts against TODAY's MYT window — under the OLD 08:00-reset
  // window it would still have belonged to YESTERDAY's window (06:00 MYT is before 08:00 MYT).
  const sixAmMyt = await rootQuery(
    `select (v.ts >= (date_trunc('day', now() at time zone 'Asia/Kuala_Lumpur') at time zone 'Asia/Kuala_Lumpur')) as counted_myt_today,
            (v.ts >= (date_trunc('day', now() at time zone 'utc') at time zone 'utc')) as counted_old_utc_today
       from unnest($1::timestamptz[]) as v(ts)`,
    [[new Date(ws + 6 * 3600 * 1000).toISOString()]]);
  assert.equal(sixAmMyt.rows[0].counted_myt_today, true,
    "06:00 MYT must count against TODAY's MYT window");
  assert.equal(sixAmMyt.rows[0].counted_old_utc_today, false,
    "06:00 MYT falls before the OLD 08:00-MYT UTC-day reset — the exact gap #964 closes");
});

// #964's other named acceptance criterion for this file: "the batch-board capacity descriptor
// reports the MYT-midnight window, and the batch card shows it without a second hardcoded
// string." Gated on 0252's OWN stem (never 0229's): a leg pinned at 0229 must skip cleanly here,
// not red on a capacity block that has not yet moved off the UTC day.
test("p964.window.capacity_descriptor_myt — get_intake_batch reports capacity as myt_day / 00:00, never utc_day / 08:00", async (t) => {
  if (await gate(t)) return;
  if (await gateMytWindow(t)) return;
  const batch = await openBatch(ALICE());
  const read = await getBatch(BOB(), batch.batch_id);
  assert.deepEqual(read.capacity,
    { window: "myt_day", resets_at_local: "00:00", timezone: "Asia/Kuala_Lumpur" },
    "the capacity descriptor must report the MYT-midnight window, not the retired UTC-day one");
});

test("p636.batch.derived_key_author — a resumed fan-out MUST re-issue with the STORED actor", async (t) => {
  if (await gate(t)) return;
  const admitted = await admitJournalWork({
    client: world.clients.A1, author: ALICE(), basis: basis({ memo: "p636 derived key" }) });
  const key = opk("p636-derived");
  const first = await cancelWork(admitted.work_id, ALICE(), key);
  const replay = await cancelWork(admitted.work_id, ALICE(), key);
  assert.equal(first.replayed, false);
  assert.equal(replay.replayed, true);
  assert.deepEqual({ ...replay, replayed: null }, { ...first, replayed: null },
    "the replay is the stored receipt, identical apart from its `replayed` marker");
  const err = await assertRaises(CLR10, () => cancelWork(admitted.work_id, BOB(), key),
    "the same key under a DIFFERENT author");
  assert.equal(detailOf(err).reason, "op_key_conflict",
    "clara._work_door_ctx hashes {work, author} (0184:262-264) — this is why the parent STORES cancel_requested_by");
});

test("p636.census.no_recut — the twelve pinned bodies are byte-identical after 0229", async (t) => {
  if (await gate(t)) return;
  // #964 (migration 0252) deliberately recuts THREE of these twelve — the exact reservation
  // helpers 0229's OWN header named as pinned-but-not-recut ("the three reservation bodies are
  // untouched and pinned below"), moving them from a UTC day to an Asia/Kuala_Lumpur one. That
  // claim was always scoped to 0229 itself ("byte-identical AFTER 0229", never "forever"), and
  // 0229's header said so explicitly: "Moving the window to MYT is #635's ticket, not this one's."
  // This cell now pins BOTH generations for those three names, selected by whether 0252 is live,
  // so it stays a true regression watch in both the pre- and post-#964 world rather than a false
  // red on a later ticket's IN-SCOPE, fully-verified recut (document-ingest-window-myt.test.mjs
  // carries that recut's own prestate/reverse-substitution proof).
  const mytLive = await mytWindowReady();
  const pins = [
    ["clara._tf_accounting_work_immutable()", "a1c4e0fc07dfe535433ee3061c54192ffeba640eae1375d8a2f529b3d1ff518e"],
    ["clara._assert_journal_source_refs(uuid,uuid,jsonb,boolean)", "f028c8ea70f7bcfde3cdd8ebaae045964ca763746010011a50d4c489bff232d2"],
    ["clara._admit_accounting_work_core(uuid,uuid,text,text,jsonb,jsonb,text,jsonb,text)", "10b89677d342a424d5959ded8ad2c8c974c4ff9bdc26f5c0dd6c773a15af2612"],
    ["clara.cancel_accounting_work(uuid,uuid,text)", "27c7295b656c779aa80878e30e5113b3512ae773ce64ab64450f44c98eed871b"],
    ["clara._work_door_ctx(uuid,uuid,text,text,text,text)", "bd7bc3934fa919b2167b49f84b40f5205bcfcfc5207aaa31b94ce1c186ac2c7c"],
    ["clara.create_document_intake(uuid,text,uuid,text,text,bigint,text,timestamptz,text)", "09784b31f65ee230d2cf2e25426d43e6d529f1a5476468d96c4ef486a5c92e9d"],
    ["clara.finalize_document_intake(uuid,text,text,jsonb,integer,text,uuid,uuid,text)", "8f9e0b1944c8910bcdef049d250ca834b74a4aa33084b38d97acc868b4a697d7"],
    ["clara._reserve_document_ingest(uuid,uuid,integer,timestamptz)",
      mytLive ? "32a42ca3de5c3f4de81971530430ceffe4f763eb9ed2b7e215941c8a94e70400"
              : "074c9b180729e3f2d8af8d9fecb38be158db9e2a74e4292b11ff7533a1ed9734"],
    ["clara._resize_document_reservation(uuid,uuid,integer)",
      mytLive ? "865f01a0c1094caf82efe9b9fec8b3bc4d611d1266be26058a42e9d8b60cc622"
              : "41528b318065207775e48c4ac3f196f07d6cdf0511d108affc72b86c07114dbf"],
    ["clara._settle_document_reservation(uuid,uuid,integer)",
      mytLive ? "c96f43c0d5e4acec8871012044f3c4763f7af13b139b91ba7f3cede26f4b7d00"
              : "b72d83e70645d7bbce44a491002981576059e9d0db41a95ee07e6b87930ddee6"],
    ["clara._declared_page_ceiling(bigint,text)", "82bc5e67afd4ea074665a320f357092fb0e93af9221f10b489a50cec3e4b4ca6"],
    ["clara.list_accounting_work(uuid,text[],uuid,text[],timestamptz,timestamptz,text,text,integer)", "61bd9184fe271e081af426647c4081155c6d086368411478d1f2be88a1f4ca5a"],
  ];
  for (const [sig, expected] of pins) {
    const r = await rootQuery(
      "select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') as sha from pg_proc p where p.oid = $1::regprocedure",
      [sig]);
    assert.equal(r.rows[0].sha, expected, `${sig} MOVED unexpectedly — 0229 recuts nothing, and only #964's named MYT-window change is tolerated`);
  }
});

test("p636.batch.work_id_stamp — the lane-agnostic Work stamp fires once, and its no-op path is cheap", async (t) => {
  if (await gate(t)) return;
  const batch = await openBatch(ALICE(), { label: "p636 stamp" });
  const m = await workMember(batch.batch_id, world.clients.A1, { memo: "p636 stamp" });
  const row = await memberRow(m.intake);
  assert.equal(row.document_id, m.document, "custody stamped document_id from the finalized intake");
  assert.equal(row.work_id, m.work_id, "the Work stamp joined the Work that NAMED the document");
  assert.equal(row.client_id, world.clients.A1, "and carried the Work's client onto the member");

  // A SECOND, unrelated admission does NOT restamp (the `where work_id is null` guard).
  const other = await admitJournalWork({
    client: world.clients.A1, author: ALICE(), basis: basis({ memo: "p636 unrelated" }),
    sourceRefs: [{ kind: "document", document_id: m.document }],
  });
  const after = await memberRow(m.intake);
  assert.equal(after.work_id, m.work_id, "the member keeps its FIRST Work; a later admission does not restamp");
  assert.notEqual(other.work_id, m.work_id);

  // THE NEGATIVE HALF — the cost measurement. A Work naming NO document, and a Work naming a
  // document in no batch, both leave every member untouched, and the no-op is measured.
  const before = await rootQuery("select count(*)::int n from clara.intake_batch_members where work_id is not null");
  const t0 = process.hrtime.bigint();
  for (let i = 0; i < 20; i++) {
    await admitJournalWork({ client: world.clients.A2, author: ALICE(), basis: basis({ memo: `p636 noop ${i}` }) });
  }
  const perAdmission = Number(process.hrtime.bigint() - t0) / 20 / 1e6;
  const afterCount = await rootQuery("select count(*)::int n from clara.intake_batch_members where work_id is not null");
  assert.equal(afterCount.rows[0].n, before.rows[0].n,
    "20 documentless admissions stamped nothing — the FIRST statement is the cheap negative");
  assert.ok(perAdmission < 500,
    `a documentless admission stays well under half a second end to end (measured ${perAdmission.toFixed(1)}ms) — the read-time-derivation fallback in 0229 §D is NOT needed`);
});

// ===========================================================================================
// CELLS 8-25 — THE DOORS.
// ===========================================================================================

test("p636.batch.attach_idempotent — one intake, one member, forever", async (t) => {
  if (await gate(t)) return;
  const batch = await openBatch(ALICE(), { label: "p636 attach" });
  const intake = await verifiedIntake(FIRM_A(), ALICE());
  const key = opk("p636-attach-once");
  const first = await attach(ALICE(), batch.batch_id, intake, key);
  assert.equal(first.attached, true);
  const replay = await attach(ALICE(), batch.batch_id, intake, key);
  assert.equal(replay.replayed, true, "the same key replays the stored receipt");
  assert.equal(replay.member_id, first.member_id);
  const again = await attach(ALICE(), batch.batch_id, intake, opk("p636-attach-twice"));
  assert.equal(again.attached, false, "a second attach to the SAME batch is ABSORBED, never a second row");
  assert.equal(again.member_id, first.member_id);
  const n = await rootQuery("select count(*)::int n from clara.intake_batch_members where intake_id=$1", [intake]);
  assert.equal(n.rows[0].n, 1, "unique(intake_id) IS AC1's once-only admission, structurally");

  const other = await openBatch(ALICE(), { label: "p636 attach other" });
  const err = await assertRaises(CLR13,
    () => attach(ALICE(), other.batch_id, intake, opk("p636-attach-elsewhere")),
    "attaching an intake that already belongs to another batch");
  assert.equal(detailOf(err).reason, "intake_already_in_batch");
  assert.equal(detailOf(err).batch_id, batch.batch_id, "the refusal NAMES the holder");

  // A third firm's intake cannot be attached at all, and the refusal is not an oracle.
  const theirs = await verifiedIntake(world.firms.B, DAVE());
  const cross = await assertRaises(CLR11,
    () => attach(ALICE(), batch.batch_id, theirs, opk("p636-attach-cross")),
    "attaching another firm's intake");
  assert.equal(detailOf(cross).reason, "intake_not_found");
  const invented = await assertRaises(CLR11,
    () => attach(ALICE(), batch.batch_id, randomUUID(), opk("p636-attach-invented")),
    "attaching a uuid naming nothing");
  assert.equal(detailOf(invented).reason, "intake_not_found",
    "another firm's intake and an invented uuid answer IDENTICALLY — no existence oracle");
});

test("p636.batch.no_transaction — some children fail and the rest still reach admitted", async (t) => {
  if (await gate(t)) return;
  const batch = await openBatch(ALICE(), { label: "p636 not-one-transaction" });
  const good = []; const bad = [];
  for (let i = 0; i < 5; i++) good.push(await workMember(batch.batch_id, world.clients.A1, { memo: `p636 ok ${i}` }));
  for (let i = 0; i < 3; i++) {
    const intake = await verifiedIntake(FIRM_A(), ALICE());
    await attach(ALICE(), batch.batch_id, intake, opk(`p636-bad${i}`));
    // LABELLED FIXTURE DML: the estate's own failure door is clara.fail_document_intake, which
    // the runtime calls; here it is driven directly through the same runtime persona.
    await roleQuery(ROLES.runtime,
      "select clara.fail_document_intake($1::uuid,$2::text,$3::text) as result",
      [intake, "storage_error", opk(`p636-fail${i}`)]);
    bad.push(intake);
  }
  const pack = await getBatch(ALICE(), batch.batch_id, { preview: 25 });
  assert.equal(pack.facets.admitted.count, 5, "the five that could be admitted were");
  assert.equal(pack.facets.failed.count, 3, "the three that failed are failed, and nothing else moved");
  assert.equal((await batchRow(batch.batch_id)).state, "open",
    "the parent stays OPEN — it is not one transaction and must not be");
});

test("p636.batch.distinct_work_ids — a child with two runs counts once", async (t) => {
  if (await gate(t)) return;
  const batch = await openBatch(ALICE(), { label: "p636 distinct" });
  const m = await workMember(batch.batch_id, world.clients.A1, { memo: "p636 distinct" });
  const tasks0 = await tasksForWork(m.work_id);
  await settleWorkRun({ task: tasks0[0].id, outcome: "failed", errorCode: "tool_error" });
  await retryAccountingWork({ work: m.work_id, author: ALICE() });
  const tasks = await tasksForWork(m.work_id);
  assert.ok(tasks.length >= 2, "the fixture opened a second run for one Work");
  const pack = await getBatch(ALICE(), batch.batch_id);
  assert.equal(pack.facets.admitted.count, 1,
    "two runs of ONE Work are ONE admitted id — the facet counts DISTINCT work ids");
  assert.equal(pack.facets.admitted.rows.length, 1);
  assert.equal(pack.facets.admitted.rows[0].retrying, true,
    "the preview row carries the retry LABEL, which is a fact about that row, not a population number");
});

test("p636.batch.settled_is_a_receipt — completion is a committed receipt, never a status", async (t) => {
  if (await gate(t)) return;
  const batch = await openBatch(ALICE(), { label: "p636 settled" });
  const posted = await workMember(batch.batch_id, world.clients.A1, { memo: "p636 posted" });
  await postWork({ client: world.clients.A1, work: posted.work_id, task: posted.task_id });

  const ghost = await workMember(batch.batch_id, world.clients.A1, { memo: "p636 ghost" });
  await claimWorkRun({ task: ghost.task_id, runId: opk("p636-ghost") });
  await settleWorkRun({ task: ghost.task_id, outcome: "completed" });
  assert.equal((await receiptsForWork(ghost.work_id)).length, 0, "the ghost posted nothing");

  const pack = await getBatch(ALICE(), batch.batch_id);
  assert.equal(pack.facets.settled.count, 1, "only the Work with a COMMITTED receipt is settled");
  assert.equal(pack.facets.settled.uncounted_completions, 1,
    "the completion the database holds no receipt for is NAMED, never counted and never excluded");
  assert.equal(pack.facets.settled.coverage, "partial");
  assert.equal(pack.facets.settled.coverage_reason, "completions_without_receipt");
});

test("p636.batch.facets_overlap — the facets overlap, exceed the member count, and are never summed", async (t) => {
  if (await gate(t)) return;
  const batch = await openBatch(ALICE(), { label: "p636 overlap" });
  const m = await workMember(batch.batch_id, world.clients.A1, { memo: "p636 overlap" });
  await setDependency(ALICE(), m.intake, "awaiting_fact", "the preparer asked which client this is");
  const pack = await getBatch(ALICE(), batch.batch_id);
  const members = await rootQuery(
    "select count(*)::int n from clara.intake_batch_members where batch_id=$1", [batch.batch_id]);
  assert.equal(members.rows[0].n, 1);
  assert.equal(pack.facets.admitted.count, 1, "the one member is admitted");
  assert.equal(pack.facets.waiting.count, 1, "…AND waiting, at the same time");
  const sum = ["admitted", "settled", "waiting", "failed", "unassigned"]
    .reduce((acc, k) => acc + pack.facets[k].count, 0);
  assert.ok(sum > members.rows[0].n,
    "the facet numbers legitimately EXCEED the member count — they are not a partition and must never be added up");
});

test("p636.batch.no_percentage — the envelope carries no denominator at any depth", async (t) => {
  if (await gate(t)) return;
  const batch = await openBatch(ALICE(), { label: "p636 no denominator" });
  await workMember(batch.batch_id, world.clients.A1, { memo: "p636 nd" });
  const pack = await getBatch(ALICE(), batch.batch_id);
  const banned = /^(total|totals|percent|percentage|progress|ratio|denominator|of_total|page_count|pages)$/i;
  const walk = (node, path) => {
    if (node === null || typeof node !== "object") return;
    if (Array.isArray(node)) { node.forEach((v, i) => walk(v, `${path}[${i}]`)); return; }
    for (const [k, v] of Object.entries(node)) {
      assert.ok(!banned.test(k), `${path}.${k} could be read as a denominator — AC3 forbids a fabricated percentage`);
      walk(v, `${path}.${k}`);
    }
  };
  walk(pack, "pack");
  assert.deepEqual(Object.keys(pack).sort(),
    ["batch", "cancel_blocked", "capacity", "computed_at", "facets", "pending_members",
      "preview_limit", "waiting_basis"],
    "the envelope's top-level key set is exactly these eight — cancel_blocked (a NAMED reason or "
    + "null, never a number) and pending_members (a population count nothing divides by) joined "
    + "in fix round 1, ADV-636-03 and ADV-636-01");
  assert.equal(pack.cancel_blocked, null, "an open batch has nothing to name");
  assert.deepEqual(Object.keys(pack.facets).sort(),
    ["admitted", "failed", "settled", "unassigned", "waiting"]);
  // #964 (0252) moved the SHIPPED window from a UTC day to an Asia/Kuala_Lumpur one; this
  // assertion is a collateral shape-check inside a "no denominator" battery, not the window's own
  // pin (that is `p964.window.capacity_window_myt` above), so it tracks whichever generation is
  // actually live rather than gating the whole cell on 0252.
  assert.deepEqual(pack.capacity,
    (await mytWindowReady())
      ? { window: "myt_day", resets_at_local: "00:00", timezone: "Asia/Kuala_Lumpur" }
      : { window: "utc_day", resets_at_local: "08:00", timezone: "Asia/Kuala_Lumpur" },
    "the capacity block reports the SHIPPED window so the surface can say a real reset time, never 'midnight' as a made-up default");
  const src = await rootQuery(
    "select prosrc from pg_proc where oid = 'clara.get_intake_batch(uuid,integer)'::regprocedure");
  assert.equal(src.rows[0].prosrc.includes("'total'"), false,
    "the tail's own prosrc probe is green (0229 §H T8)");
});

test("p636.batch.preview_bound — a large batch still answers, and the PREVIEW is what is labelled", async (t) => {
  if (await gate(t)) return;
  const batch = await openBatch(ALICE(), { label: "p636 preview" });
  // 120 members without 120 documents: the preview clamp is about the ADMITTED ids handed to
  // clara._work_run_attempts, and a member needs only an intake to exist.
  for (let i = 0; i < 120; i++) {
    const intake = await verifiedIntake(FIRM_A(), ALICE(), { filename: `p636-preview-${i}.pdf` });
    await attach(ALICE(), batch.batch_id, intake, opk(`p636-prev${i}`));
  }
  const pack = await getBatch(ALICE(), batch.batch_id, { preview: 100 });
  assert.equal(pack.preview_limit, 25,
    "p_preview is clamped 1..25 — clara._work_run_attempts refuses more than 101 ids (0189:262-274)");
  const members = await rootQuery(
    "select count(*)::int n from clara.intake_batch_members where batch_id=$1", [batch.batch_id]);
  assert.equal(members.rows[0].n, 120, "all 120 members exist");
  assert.equal(await getBatch(ALICE(), batch.batch_id, { preview: 0 }).then((p) => p.preview_limit), 1,
    "and the floor is 1");
});

test("p636.batch.preview_bound (admitted) — a population larger than the preview names its own limitation", async (t) => {
  if (await gate(t)) return;
  const batch = await openBatch(ALICE(), { label: "p636 preview admitted" });
  for (let i = 0; i < 4; i++) await workMember(batch.batch_id, world.clients.A1, { memo: `p636 pv ${i}` });
  const pack = await getBatch(ALICE(), batch.batch_id, { preview: 2 });
  assert.equal(pack.facets.admitted.count, 4);
  assert.equal(pack.facets.admitted.rows.length, 2);
  assert.equal(pack.facets.admitted.coverage, "partial");
  assert.equal(pack.facets.admitted.coverage_reason, "retry_label_preview_only",
    "the PREVIEW is labelled, never the population (0214:59-78)");
});

test("p636.batch.dependency_lifecycle — three values, a clear, a refusal, and one ledger row each", async (t) => {
  if (await gate(t)) return;
  const batch = await openBatch(ALICE(), { label: "p636 dependency" });
  const m = await custodyMember(batch.batch_id);
  for (const value of ["awaiting_fact", "awaiting_attribution", "awaiting_capacity"]) {
    const out = await setDependency(ALICE(), m.intake, value, `reason for ${value}`, opk(`p636-dep-${value}`));
    assert.equal(out.dependency, value);
    assert.equal((await memberRow(m.intake)).dependency, value);
  }
  const cleared = await setDependency(ALICE(), m.intake, null, null, opk("p636-dep-clear"));
  assert.equal(cleared.dependency, null);
  const row = await memberRow(m.intake);
  assert.equal(row.dependency, null);
  assert.equal(row.dependency_reason, null, "clearing the dependency clears its reason too");

  const err = await assertRaises(CLR10,
    () => setDependency(ALICE(), m.intake, "awaiting_lunch", null, opk("p636-dep-bad")),
    "an unknown dependency value");
  assert.equal(detailOf(err).reason, "invalid_dependency");

  const events = await eventsFor(m.member_id);
  const sets = events.filter((e) => e.event === "dependency_set");
  const clears = events.filter((e) => e.event === "dependency_cleared");
  assert.equal(sets.length, 3, "one dependency_set ledger row per transition");
  assert.equal(clears.length, 1);
  assert.equal(sets[0].detail.reason, "reason for awaiting_fact",
    "the reason travels VERBATIM — it is the database's own sentence when the capacity door calls this");

  // A member whose INTAKE failed with `limit` is WAITING, never FAILED (D4).
  const quota = await custodyMember(batch.batch_id);
  await setDependency(ALICE(), quota.intake, "awaiting_capacity",
    "document daily limit reached (docs)", opk("p636-dep-quota"));
  const pack = await getBatch(ALICE(), batch.batch_id, { preview: 25 });
  assert.equal(pack.waiting_basis.by_dependency.awaiting_capacity, 1);
  assert.ok(pack.facets.waiting.count >= 1);
  const waitingIds = pack.facets.waiting.rows.map((r) => r.member_id);
  const failedIds = pack.facets.failed.rows.map((r) => r.member_id);
  assert.ok(waitingIds.includes(quota.member_id), "a quota-blocked member is WAITING");
  assert.ok(!failedIds.includes(quota.member_id), "…and never FAILED — a quota block is a wait, not a death");
});

test("p636.batch.cancel_keeps_receipts — cancel-remaining keeps every committed receipt", async (t) => {
  if (await gate(t)) return;
  const batch = await openBatch(ALICE(), { label: "p636 cancel" });
  const committed = await workMember(batch.batch_id, world.clients.A1, { memo: "p636 committed" });
  const receiptId = await postWork({ client: world.clients.A1, work: committed.work_id, task: committed.task_id });
  const running = await workMember(batch.batch_id, world.clients.A1, { memo: "p636 running" });
  await claimWorkRun({ task: running.task_id, runId: opk("p636-running") });
  const queued = await workMember(batch.batch_id, world.clients.A1, { memo: "p636 queued" });

  const key = opk("p636-cancel-decision");
  const decision = await cancelBatch(ALICE(), batch.batch_id, key);
  assert.equal(decision.state, "cancelling");
  assert.equal(decision.cancel_requested_by, ALICE());
  assert.equal(decision.cancel_op_key, key);
  const childWorks = decision.children.map((c) => c.work_id);
  assert.ok(!childWorks.includes(committed.work_id),
    "the child that already committed is NOT in the live list — its receipt is a fact, not a target");
  assert.ok(childWorks.includes(running.work_id) && childWorks.includes(queued.work_id));

  // THE FAN-OUT, exactly as packages/runtime/lib/intake-batches.mjs performs it: one call per
  // child, one transaction each, key derived from the parent decision.
  const outcomes = {};
  for (const child of decision.children) {
    outcomes[child.work_id] = await cancelWork(child.work_id, decision.cancel_requested_by,
      `${decision.cancel_op_key}:${child.work_id}`);
  }
  assert.equal(outcomes[queued.work_id].status, "cancelled", "the queued child settles cancelled");
  assert.ok(["cancel_requested", "stopping", "cancelled"].includes(outcomes[running.work_id].status),
    `the running child reaches a stopping state (got ${outcomes[running.work_id].status})`);

  // The committed child's receipt is UNTOUCHED, and the batch still reveals it.
  const receipts = (await receiptsForWork(committed.work_id)).filter((r) => r.outcome === "committed");
  assert.equal(receipts.length, 1);
  assert.equal(receipts[0].id, receiptId, "the committed receipt survived the cancellation, byte for byte");
  const pack = await getBatch(ALICE(), batch.batch_id, { preview: 25 });
  assert.equal(pack.facets.settled.count, 1, "the card reveals the completed receipt while stopping");

  const replay = await cancelBatch(ALICE(), batch.batch_id, key);
  assert.equal(replay.replayed, true);
  assert.deepEqual(replay.children, decision.children,
    "a replay returns the IDENTICAL child list — that is what makes the resume deterministic");
  const err = await assertRaises(CLR13,
    () => cancelBatch(ALICE(), batch.batch_id, opk("p636-cancel-second")),
    "a second decision under a DIFFERENT key");
  assert.equal(detailOf(err).reason, "batch_already_cancelling");
  assert.equal(detailOf(err).cancel_op_key, key, "the refusal names the LIVE decision");
});

test("p636.batch.cancel_while_settling — a child already stopping answers already_stopping and the parent is never terminal early", async (t) => {
  if (await gate(t)) return;
  const batch = await openBatch(ALICE(), { label: "p636 settling" });
  const m = await workMember(batch.batch_id, world.clients.A1, { memo: "p636 settling" });
  await claimWorkRun({ task: m.task_id, runId: opk("p636-settling") });
  // The child is already being stopped by its own per-Work cancel, before the batch decides.
  const solo = await cancelWork(m.work_id, ALICE(), opk("p636-solo-cancel"));
  assert.ok(["cancel_requested", "stopping"].includes(solo.status),
    `a claimed run stops rather than settling instantly (got ${solo.status})`);

  const key = opk("p636-settling-batch");
  const decision = await cancelBatch(ALICE(), batch.batch_id, key);
  assert.equal(decision.state, "cancelling", "the parent reports STOPPING, never terminal");
  assert.equal(decision.children.length, 1, "the stopping child is still LIVE — it holds no committed receipt");
  const out = await cancelWork(m.work_id, decision.cancel_requested_by,
    `${decision.cancel_op_key}:${m.work_id}`);
  // ADV-636-04: this line used to compare an expression with itself, so the converge-a-stopping-run
  // arm (0199:295-304) was asserted NOWHERE. It returns `reason='already_stopping'` with
  // `cancelled=false` and the WORK's own status — measured, then asserted by name.
  assert.equal(out.reason, "already_stopping",
    "the fan-out's call lands on 0199's already-stopping arm, by name");
  assert.equal(out.cancelled, false, "…so it changes nothing and does not re-notify the world");
  assert.equal(out.replayed, false, "…and it is that arm, not a stored replay of the solo press");
  assert.ok(["cancel_requested", "stopping", "cancelled"].includes(out.status),
    "the fan-out's call converges on the stopping arm rather than raising");
  assert.equal((await batchRow(batch.batch_id)).state, "cancelling",
    "the parent stays `cancelling` until the sweep sees nothing live");
});

test("p636.batch.cancel_all_terminal — cancelling a finished batch is terminal in the SAME call", async (t) => {
  if (await gate(t)) return;
  const batch = await openBatch(ALICE(), { label: "p636 all terminal" });
  const m = await workMember(batch.batch_id, world.clients.A1, { memo: "p636 terminal" });
  await postWork({ client: world.clients.A1, work: m.work_id, task: m.task_id });
  const decision = await cancelBatch(ALICE(), batch.batch_id, opk("p636-terminal"));
  assert.deepEqual(decision.children, [], "no child is live");
  assert.equal(decision.state, "cancelled", "…so the parent is terminal at once, with no sweep round-trip");
  const row = await batchRow(batch.batch_id);
  assert.equal(row.state, "cancelled");
  assert.ok(row.cancelled_at, "and it is dated");
});

test("p636.batch.sweep_settles — the sweep hands back the STORED actor and key, and settles once", async (t) => {
  if (await gate(t)) return;
  const batch = await openBatch(ALICE(), { label: "p636 sweep" });
  const m = await workMember(batch.batch_id, world.clients.A1, { memo: "p636 sweep" });
  await claimWorkRun({ task: m.task_id, runId: opk("p636-sweep-run") });
  const key = opk("p636-sweep-decision");
  const decision = await cancelBatch(ALICE(), batch.batch_id, key);
  assert.equal(decision.state, "cancelling");

  const first = await sweep(20);
  const mine = first.batches.find((b) => b.batch_id === batch.batch_id);
  assert.ok(mine, "the cancelling parent is on the worklist");
  assert.equal(mine.cancel_requested_by, ALICE(),
    "the sweep hands back the STORED actor — a different author under the same key is CLR10 op_key_conflict");
  assert.equal(mine.cancel_op_key, key, "…and the STORED key");
  assert.equal(mine.live.length, 1);

  // The belt re-issues the fan-out with exactly those; the ENGINE then settles the stopped run,
  // which is the moment the child stops being live. The sweep is what notices.
  for (const child of mine.live) {
    await cancelWork(child.work_id, mine.cancel_requested_by, `${mine.cancel_op_key}:${child.work_id}`);
  }
  const midway = await sweep(20);
  assert.ok(!midway.settled.includes(batch.batch_id),
    "a child that is STOPPING is still live — the parent is not settled early (appendix-C-journeys.md:82)");
  await settleWorkRun({ task: m.task_id, outcome: "cancelled" });
  const second = await sweep(20);
  assert.ok(second.settled.includes(batch.batch_id), "the parent with nothing live is settled");
  assert.equal((await batchRow(batch.batch_id)).state, "cancelled");
  const third = await sweep(20);
  assert.ok(!third.settled.includes(batch.batch_id), "…exactly once; the guard is the state");

  const err = await assertRaises(CLR10, () => sweep(0), "a limit outside 1..100");
  assert.equal(detailOf(err).reason, "invalid_limit");
  await assertRaises(CLR10, () => sweep(101), "a limit above 100");
});

test("p636.batch.reservation_atomicity — a refused child refunds its slot while a settled sibling keeps its actual pages", async (t) => {
  if (await gate(t)) return;
  const batch = await openBatch(ALICE(), { label: "p636 reservations" });
  const create = namedCall("create_document_intake", [
    { name: "p_uploaded_by", cast: "uuid" }, { name: "p_origin", cast: "text" },
    { name: "p_chat_session", cast: "uuid" }, { name: "p_filename", cast: "text" },
    { name: "p_mime", cast: "text" }, { name: "p_declared_bytes", cast: "bigint" },
    { name: "p_token_hash", cast: "text" }, { name: "p_expires_at", cast: "timestamptz" },
    { name: "p_op_key", cast: "text" },
  ]);
  const made = await roleQuery(ROLES.runtime, create, [
    ALICE(), "documents_tab", null, "p636-res.pdf", "application/pdf", 1048576,
    sha(randomUUID()), new Date(Date.now() + 900_000).toISOString(), opk("p636-res")]);
  const intake = made.rows[0].result.intake_id;
  await attach(ALICE(), batch.batch_id, intake, opk("p636-res-attach"));
  const reserved = await rootQuery(
    "select state, pages_reserved from clara.document_ingest_reservations where intake_id=$1", [intake]);
  assert.equal(reserved.rows[0].state, "reserved");
  assert.equal(reserved.rows[0].pages_reserved, 10, "the declared ceiling reserved ten pages");

  // The estate's own failure door refunds the reservation atomically with the outcome.
  await roleQuery(ROLES.runtime, "select clara.fail_document_intake($1::uuid,$2::text,$3::text) as result",
    [intake, "storage_error", opk("p636-res-fail")]);
  const refunded = await rootQuery(
    "select state from clara.document_ingest_reservations where intake_id=$1", [intake]);
  assert.equal(refunded.rows[0].state, "refunded",
    "the slot is released atomically with the actual admission outcome (0007:1694 family)");
  const pack = await getBatch(ALICE(), batch.batch_id, { preview: 25 });
  assert.equal(pack.facets.failed.count, 1, "and the member reads as failed, not as waiting");
});

test("p636.batch.one_receipt_through_retry — C51.1's owed cell: failure -> retry -> success leaves ONE receipt", async (t) => {
  if (await gate(t)) return;
  const batch = await openBatch(ALICE(), { label: "p636 one receipt" });
  const m = await workMember(batch.batch_id, world.clients.A1, { memo: "p636 one receipt" });
  const w = await workRow(m.work_id);
  const first = (await tasksForWork(m.work_id))[0];
  await claimWorkRun({ task: first.id, runId: opk("p636-attempt-1") });
  await settleWorkRun({ task: first.id, outcome: "failed", errorCode: "tool_error", error: { why: "rig" } });
  await retryAccountingWork({ work: m.work_id, author: ALICE() });
  const tasks = await tasksForWork(m.work_id);
  const retryTask = tasks.find((x) => x.id !== first.id);
  assert.ok(retryTask, "the retry opened a second run");
  await claimWorkRun({ task: retryTask.id, runId: opk("p636-attempt-2") });
  const obo = await mintClientObo({ firm: FIRM_A(), obo: ALICE(), client: world.clients.A1 });
  await wakeRecordJournalEntry(obo.secret, {
    client: world.clients.A1, work: m.work_id, logicalOpId: w.logical_op_id, basis: w.basis,
  });
  await settleWorkRun({ task: retryTask.id, outcome: "completed" });
  const receipts = await rootQuery(
    "select count(*)::int n from clara.operation_receipts where logical_op_id=$1 and outcome='committed'",
    [w.logical_op_id]);
  assert.equal(receipts.rows[0].n, 1,
    "EXACTLY ONE committed operation receipt for the child's logical_op_id — the retry repeated no completed effect");
  const pack = await getBatch(ALICE(), batch.batch_id);
  assert.equal(pack.facets.settled.count, 1);
});

test("p636.batch.authority_revoked_midbatch — C51.4's owed cell: a revoked membership refuses by name and touches no sibling", async (t) => {
  if (await gate(t)) return;
  const batch = await openBatch(BOB(), { label: "p636 authority" });
  const kept = await workMember(batch.batch_id, world.clients.A1, { actor: ALICE(), memo: "p636 kept" });
  const keptReceipt = await postWork({ client: world.clients.A1, work: kept.work_id, task: kept.task_id });
  const nextIntake = await verifiedIntake(FIRM_A(), ALICE());

  // LABELLED FIXTURE DML: the estate's membership door is clara.remove_member / set_member_role;
  // a direct status flip is the narrowest possible revocation for this cell.
  await rootQuery("update clara.firm_memberships set status='removed' where user_id=$1 and firm_id=$2",
    [BOB(), FIRM_A()]);
  try {
    const err = await assertRaises(CLR04,
      () => attach(BOB(), batch.batch_id, nextIntake, opk("p636-authz-mid")),
      "the revoked member's next governed act");
    assert.equal(detailOf(err).reason, "actor_not_active",
      "the refusal carries its typed reason — the live recheck is inside the door, not in the caller");
    const receipts = (await receiptsForWork(kept.work_id)).filter((r) => r.outcome === "committed");
    assert.equal(receipts.length, 1);
    assert.equal(receipts[0].id, keptReceipt, "the already-committed sibling is untouched");
    const pack = await getBatch(ALICE(), batch.batch_id, { preview: 25 });
    assert.equal(pack.facets.settled.count, 1,
      "and the board still answers for a caller who IS still a member");
  } finally {
    await rootQuery("update clara.firm_memberships set status='active' where user_id=$1 and firm_id=$2",
      [BOB(), FIRM_A()]);
  }
});

test("p636.batch.floors — the grant matrix, asked of the live catalog", async (t) => {
  if (await gate(t)) return;
  const batch = await openBatch(ALICE(), { label: "p636 floors" });
  const err = await assertRaises(CLR04, () => getBatch(CAROL(), batch.batch_id),
    "a viewer reading the board");
  assert.match(err.message, /insufficient role/);

  const runtimeFns = ["clara.open_intake_batch(uuid,text,text,uuid,text)",
    "clara.attach_intake_to_batch(uuid,uuid,uuid,text)",
    "clara.set_intake_batch_member_dependency(uuid,uuid,text,text,text)",
    "clara.cancel_intake_batch(uuid,uuid,text)",
    "clara.sweep_intake_batch_cancellations(integer)"];
  for (const sig of runtimeFns) {
    const r = await rootQuery(
      `select has_function_privilege('clara_runtime',$1,'EXECUTE') as rt,
              has_function_privilege('clara_authenticated',$1,'EXECUTE') as auth,
              has_function_privilege('clara_agent_ro',$1,'EXECUTE') as agent`, [sig]);
    assert.deepEqual(r.rows[0], { rt: true, auth: false, agent: false }, `${sig} is clara_runtime ONLY`);
  }
  const board = await rootQuery(
    `select has_function_privilege('clara_authenticated','clara.get_intake_batch(uuid,integer)','EXECUTE') as auth,
            has_function_privilege('clara_runtime','clara.get_intake_batch(uuid,integer)','EXECUTE') as rt`);
  assert.deepEqual(board.rows[0], { auth: true, rt: false },
    "the board is clara_authenticated ONLY — the pool's worklist is the sweep verb");

  for (const rel of ["intake_batches", "intake_batch_members", "intake_batch_member_events"]) {
    const g = await rootQuery(
      `select bool_or(has_table_privilege(r, 'clara.'||$1, 'INSERT')
                   or has_table_privilege(r, 'clara.'||$1, 'UPDATE')
                   or has_table_privilege(r, 'clara.'||$1, 'DELETE')) as any_dml
         from unnest(array['clara_authenticated','clara_runtime','clara_agent_ro',
                           'clara_wake_interactive','clara_wake_proactive']) r`, [rel]);
    assert.equal(g.rows[0].any_dml, false, `no application role holds DML on clara.${rel}`);
  }
});

test("p636.batch.cross_firm — another firm reads zero, and an invented id answers identically", async (t) => {
  if (await gate(t)) return;
  const batch = await openBatch(ALICE(), { label: "p636 cross firm" });
  await workMember(batch.batch_id, world.clients.A1, { memo: "p636 cross" });
  const theirs = await assertRaises(CLR11, () => getBatch(DAVE(), batch.batch_id),
    "firm B's owner reading firm A's batch");
  assert.equal(detailOf(theirs).reason, "batch_not_found");
  const invented = await assertRaises(CLR11, () => getBatch(DAVE(), randomUUID()),
    "firm B's owner reading a uuid naming nothing");
  assert.equal(detailOf(invented).reason, "batch_not_found",
    "an invented id and another firm's real id answer IDENTICALLY — no existence oracle");
  const nulled = await assertRaises(CLR10, () => getBatch(ALICE(), null), "a null batch");
  assert.equal(detailOf(nulled).reason, "invalid_batch");
});

test("p636.batch.member_rls_child — the CHILDREN are read directly, bypassing the door", async (t) => {
  if (await gate(t)) return;
  const batch = await openBatch(ALICE(), { label: "p636 child rls" });
  const m = await workMember(batch.batch_id, world.clients.A1, { memo: "p636 child rls" });
  // Firm A's own bookkeeper sees the rows…
  const mine = await humanQuery(BOB(),
    "select count(*)::int n from clara.intake_batch_members where batch_id=$1", [batch.batch_id]);
  assert.equal(mine.rows[0].n, 1);
  // …and firm B's owner, selecting the CHILD TABLES DIRECTLY, sees ZERO. A cell that only ever
  // goes through get_intake_batch would be asserting the PARENT's policy while a child leaked.
  const members = await humanQuery(DAVE(),
    "select count(*)::int n from clara.intake_batch_members where batch_id=$1", [batch.batch_id]);
  assert.equal(members.rows[0].n, 0, "firm B reads ZERO member rows of firm A's batch");
  const events = await humanQuery(DAVE(),
    "select count(*)::int n from clara.intake_batch_member_events where batch_id=$1", [batch.batch_id]);
  assert.equal(events.rows[0].n, 0, "…and ZERO member events");
  const parent = await humanQuery(DAVE(),
    "select count(*)::int n from clara.intake_batches where id=$1", [batch.batch_id]);
  assert.equal(parent.rows[0].n, 0);

  // The same persona holds no DML on either child.
  for (const rel of ["intake_batch_members", "intake_batch_member_events"]) {
    await assertRaises("42501",
      () => humanQuery(BOB(), `delete from clara.${rel} where firm_id=$1`, [FIRM_A()]),
      `a bookkeeper deleting from clara.${rel}`);
  }
  // The event ledger is append-only even to its owner's own DML path.
  await assertRaises("CLR08",
    () => rootQuery("update clara.intake_batch_member_events set detail='{}'::jsonb where member_id=$1",
      [m.member_id]),
    "updating an append-only member event");
});

test("p636.batch.open_refusals — label, origin, session and op key, each by name", async (t) => {
  if (await gate(t)) return;
  const bad = [
    [{ opKey: "   " }, "invalid_op_key"],
    [{ label: "   " }, "invalid_label"],
    [{ label: "x".repeat(121) }, "invalid_label"],
    [{ origin: "email" }, "invalid_origin"],
    [{ origin: "chat" }, "invalid_session"],
    [{ session: randomUUID() }, "invalid_session"],
  ];
  for (const [opts, reason] of bad) {
    const err = await assertRaises(CLR10, () => openBatch(ALICE(), opts), `open with ${reason}`);
    assert.equal(detailOf(err).reason, reason);
  }
  // 'chat' is admitted FROM DAY ONE so #664 needs no migration (§3.2's binding mitigation).
  const { rows } = await rootQuery(
    `select pg_get_constraintdef(oid) as def from pg_constraint
      where conrelid='clara.intake_batches'::regclass and contype='c'
        and pg_get_constraintdef(oid) like '%origin%'`);
  assert.match(rows[0].def, /'chat'/, "the origin CHECK admits 'chat' already");

  const viewer = await assertRaises(CLR04, () => openBatch(CAROL()), "a viewer opening a batch");
  assert.equal(detailOf(viewer).reason, "insufficient_role");
  const stranger = await assertRaises(CLR11, () => openBatch(randomUUID()), "a non-member opening a batch");
  assert.equal(detailOf(stranger).reason, "batch_actor_not_authorised",
    "a non-member gets the not-found shape — no existence oracle about the firm");
});

test("p636.batch.attach_refuses_a_closed_batch — nothing joins a stopping parent", async (t) => {
  if (await gate(t)) return;
  const batch = await openBatch(ALICE(), { label: "p636 closed" });
  const m = await workMember(batch.batch_id, world.clients.A1, { memo: "p636 closed" });
  await claimWorkRun({ task: m.task_id, runId: opk("p636-closed-run") });
  await cancelBatch(ALICE(), batch.batch_id, opk("p636-closed-cancel"));
  const late = await verifiedIntake(FIRM_A(), ALICE());
  const err = await assertRaises(CLR13, () => attach(ALICE(), batch.batch_id, late, opk("p636-late")),
    "attaching to a cancelling batch");
  assert.equal(detailOf(err).reason, "batch_not_open",
    "no new operation is admitted after cancellation — appendix C's own state-owner rule");
});

// ===========================================================================================
// FIX ROUND 1 — the cells the three reviews were owed. Each one RED against the shipped 0229
// before the repair, and each one names the finding it closes.
// ===========================================================================================

/** LABELLED FIXTURE DML through the estate's OWN doors: a document's extraction attempt driven
 *  queued -> running -> failed. A task cannot be hand-failed (`illegal document processing
 *  transition queued -> failed`, measured), so the claim door runs first and the persist door
 *  carries the error code, exactly as the engine's own lane does. */
async function failExtraction(document, { errorCode = "engine_error" } = {}) {
  const task = (await rootQuery(
    `select id, lane from clara.document_processing_tasks
      where document_id=$1 order by version_n desc, created_at desc limit 1`, [document])).rows[0];
  assert.ok(task, "finalize_document_intake queues a processing task for every document in custody");
  await roleQuery(ROLES.runtime,
    "select clara.claim_document_processing_task($1::uuid,$2::text,true) as result",
    [task.id, opk("p636-claim")]);
  // Each lane has its OWN failure door and refuses the other's (`classify tasks are settled by
  // classify_document`, CLR16 — measured). The batch read does not care which lane failed, but
  // the fixture must go through the right one or it proves nothing.
  if (task.lane === "classify") {
    await roleQuery(ROLES.runtime,
      "select clara.fail_classify($1::uuid,$2::text,$3::text) as result",
      [task.id, errorCode, opk("p636-failclassify")]);
  } else {
    await roleQuery(ROLES.runtime,
      `select clara.persist_document_extraction($1::uuid,'failed',null::int,null::jsonb,null::jsonb,
          $2::text,null::text,$3::text) as result`,
      [task.id, errorCode, opk("p636-persist")]);
  }
  return task.id;
}

test("p636.batch.failed_excludes_settled — a child that POSTED is never also reported failed", async (t) => {
  if (await gate(t)) return;
  // V636R-1 / ADV-636-02. MEASURED on this rig before the repair: batch 0ac00d27 answered
  // {admitted 95, settled 95, failed 35} with 31 members holding BOTH a committed receipt and a
  // failed ocr attempt — the World leg the final report cited as AC2's evidence.
  const batch = await openBatch(ALICE(), { label: "p636 failed-vs-settled" });
  const m = await workMember(batch.batch_id, world.clients.A1, { memo: "p636 recovered" });
  await failExtraction(m.document);
  await postWork({ client: world.clients.A1, work: m.work_id, task: m.task_id });

  const pack = await getBatch(ALICE(), batch.batch_id, { preview: 25 });
  assert.equal(pack.facets.settled.count, 1, "the child holds a committed receipt, so it is SETTLED");
  assert.equal(pack.facets.failed.count, 0,
    "…and a business-complete child is NEVER also 'Extraction failed' — 'settled' and 'failed' are "
    + "not compatible overlapping states the way 'admitted' and 'waiting' are");
  assert.deepEqual(pack.facets.failed.rows, [], "and it is absent from the preview too");

  // THE OTHER HALF: a member that failed extraction and has NOT posted is still honestly failed.
  const open = await workMember(batch.batch_id, world.clients.A1, { memo: "p636 still failed" });
  await failExtraction(open.document);
  const after = await getBatch(ALICE(), batch.batch_id, { preview: 25 });
  assert.equal(after.facets.failed.count, 1, "a live child whose CURRENT attempt failed is failed");
  assert.equal(after.facets.failed.rows[0].member_id, open.member_id);
  assert.equal(after.facets.failed.rows[0].task_error_code, "engine_error",
    "and the row names the engine's own code");
});

test("p636.batch.cancel_before_admission — a batch stopped BEFORE its files became Work is not terminal", async (t) => {
  if (await gate(t)) return;
  // ADV-636-01 (blocker). MEASURED on this rig before the repair: two custody members with no Work
  // answered {"state":"cancelled","children":[]}, the sweep never saw the parent again, and a Work
  // admitted AFTERWARDS was stamped onto the cancelled batch and posted.
  const batch = await openBatch(ALICE(), { label: "p636 stop during ingest" });
  const a = await custodyMember(batch.batch_id, { filename: "p636-pre-a.pdf" });
  const b = await custodyMember(batch.batch_id, { filename: "p636-pre-b.pdf" });

  const key = opk("p636-pre-cancel");
  const decision = await cancelBatch(ALICE(), batch.batch_id, key);
  assert.deepEqual(decision.children, [], "no child holds a Work yet, so the fan-out has no target");
  assert.equal(decision.pending_members, 2,
    "…but TWO members are still in flight toward one, and the decision says so");
  assert.equal(decision.state, "cancelling",
    "a terminal flip here would mean 'nothing more can happen' while two files are still in ingest");
  assert.equal((await batchRow(batch.batch_id)).state, "cancelling");

  const onList = (await sweep(50)).batches.find((x) => x.batch_id === batch.batch_id);
  assert.ok(onList, "the parent stays on the sweep's worklist rather than disappearing");

  // A Work admitted afterwards IS stamped (the stamp is lane-agnostic by ruling) — and because the
  // parent is still `cancelling`, the sweep now hands it back as a live child to stop.
  await fileDocument(ALICE(), { document: a.document, client: world.clients.A1 });
  const late = await admitJournalWork({
    client: world.clients.A1, author: ALICE(), basis: basis({ memo: "p636 late admission" }),
    sourceRefs: [{ kind: "document", document_id: a.document }],
  });
  const second = (await sweep(50)).batches.find((x) => x.batch_id === batch.batch_id);
  assert.ok(second, "the parent is still on the worklist");
  assert.deepEqual(second.live.map((c) => c.work_id), [late.work_id],
    "the late child is handed to the fan-out — AC4's 'cancel remaining children', on the real journey");
  assert.equal(second.cancel_requested_by, ALICE(), "…with the STORED actor");
  assert.equal(second.cancel_op_key, key, "…and the STORED key");
  void b;
});

test("p636.batch.cancel_blocked_after_revocation — a stuck fan-out is NAMED, never silently green", async (t) => {
  if (await gate(t)) return;
  // ADV-636-03. MEASURED before the repair: with the stored canceller's membership removed, every
  // resumed child refused CLR04 forever, the parent never left `cancelling`, and nothing on the
  // board or in the belt said so.
  const batch = await openBatch(BOB(), { label: "p636 blocked" });
  const m = await workMember(batch.batch_id, world.clients.A1, { actor: ALICE(), memo: "p636 blocked" });
  await claimWorkRun({ task: m.task_id, runId: opk("p636-blocked-run") });
  const decision = await cancelBatch(BOB(), batch.batch_id, opk("p636-blocked-cancel"));
  assert.equal(decision.state, "cancelling");

  const live = await getBatch(ALICE(), batch.batch_id);
  assert.equal(live.cancel_blocked, null, "while the canceller is active there is nothing to name");

  await rootQuery("update clara.firm_memberships set status='removed' where user_id=$1 and firm_id=$2",
    [BOB(), FIRM_A()]);
  try {
    const err = await assertRaises(CLR04,
      () => cancelWork(m.work_id, decision.cancel_requested_by,
        `${decision.cancel_op_key}:${m.work_id}`),
      "the resumed fan-out re-issues with the STORED actor, who no longer holds authority");
    assert.equal(detailOf(err).reason, "actor_not_active");

    const stuck = await getBatch(ALICE(), batch.batch_id);
    assert.equal(stuck.batch.state, "cancelling", "the parent cannot settle — its children are untouched");
    assert.equal(stuck.cancel_blocked, "canceller_not_active",
      "…and the board NAMES why, instead of showing 'stopping' forever with no explanation");
    assert.ok((await sweep(50)).batches.some((x) => x.batch_id === batch.batch_id),
      "the worklist still carries it — the blockage is reported, not hidden by dropping the parent");
  } finally {
    await rootQuery("update clara.firm_memberships set status='active' where user_id=$1 and firm_id=$2",
      [BOB(), FIRM_A()]);
  }
});

test("p636.batch.settled_preview_is_newest — the settled preview is the NEWEST receipts, not the lowest uuids", async (t) => {
  if (await gate(t)) return;
  // ADV-636-09: the `limit` sat inside the `distinct on (work_id)` subquery, so the preview was the
  // v_preview lowest work_id UUIDs while the envelope's own order claims `committed_at desc`.
  const batch = await openBatch(ALICE(), { label: "p636 settled preview" });
  const order = [];
  // The ids are random uuids, so "newest receipt" and "lowest uuid" coincide by chance once in N.
  // Post until they DIVERGE, or this cell is green against the bug it exists to catch — which is
  // exactly what happened on its first run.
  for (let i = 0; i < 8; i++) {
    const m = await workMember(batch.batch_id, world.clients.A1, { memo: `p636 preview ${i}` });
    await postWork({ client: world.clients.A1, work: m.work_id, task: m.task_id });
    order.push(m.work_id);
    if (order.length >= 3 && [...order].sort()[0] !== order[order.length - 1]) break;
  }
  const newest = order[order.length - 1];
  assert.notEqual([...order].sort()[0], newest,
    "the cell only discriminates when the LOWEST work_id is not the newest receipt");
  const pack = await getBatch(ALICE(), batch.batch_id, { preview: 1 });
  assert.equal(pack.facets.settled.count, order.length, "every one of them holds a committed receipt");
  assert.equal(pack.facets.settled.rows.length, 1, "…and the preview shows one");
  assert.equal(pack.facets.settled.rows[0].work_id, newest,
    "the one it shows is the MOST RECENTLY committed, which is what the envelope's order says");
});
