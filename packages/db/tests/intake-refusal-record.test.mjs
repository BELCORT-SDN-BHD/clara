// #965 — A FILE REFUSED AT INTAKE CREATION BY THE DAILY CEILING LEAVES A COMMITTED RECORD.
//
// FRONTIER-GATED on the `intake_refusal_record$` stable stem, the same shape
// `document-ingest-window-myt.test.mjs` uses for #964's own migration: a slice-frontier leg can be
// pinned anywhere below 0254 and every cell here must SKIP cleanly there rather than red against a
// `clara.create_document_intake` that still raises CLR18. A skip is not evidence — a FOCUSED run
// without the preintegration gate module FAILS LOUDLY in `before`.
//
// WHAT THIS FILE IS ABOUT, in one sentence. `clara.create_document_intake` inserted the intake row
// and then reserved against the firm's daily document/page ceilings in the SAME transaction
// (0007:1845-1852); when `clara._reserve_document_ingest` refused with CLR18 the raise rolled that
// transaction back and took the row with it, so an accountant who hit the ceiling had NOTHING to
// look at afterwards — "did my receipt actually get uploaded" had no answer once the 429 faded.
// The owner's 2026-09-20 ruling on #965 is Option B: the refusal COMMITS an intake record at the
// lane's already-existing `failed` status and `limit` failure reason, and the door RETURNS a
// refusal outcome instead of raising.
//
// THE SEAM IS THE DOOR ITSELF. `clara.create_document_intake` is a real, granted door
// (clara_runtime only), so every cell drives it for real through `roleQuery(ROLES.runtime, …)` —
// never by reading `pg_proc.prosrc`, which is what #964 had to do for its three UNGRANTED
// reservation helpers. The batch read `clara.get_intake_batch` is likewise called for real through
// `humanQuery`.
//
// WHY A PER-FIRM LIMITS ROW RATHER THAN 100 REAL UPLOADS. `p636.batch.capacity_refusal` already
// proves the SHIPPED defaults (100 docs / 1000 pages) are flush at a hundred <=1MB PDFs, and
// re-proving that here would cost ~300 more door calls for nothing. What these cells need is a
// ceiling they can reach in two calls AND, separately, the ability to make the DOCS guard and the
// PAGES guard bind independently — which a per-firm `clara.firm_document_limits` row gives
// exactly. The row is LABELLED fixture DML on a firm this file creates and nobody else touches;
// the shipped defaults are never changed (#965's own out-of-scope line).
//
// WHAT THIS FILE DELIBERATELY DOES NOT PROVE. Nothing about the browser, and nothing about the
// runtime's HTTP mapping: that a refusal still reaches the uploader as an unchanged
// `429 {error:"limit", message:"intake limit reached"}` is proven in
// `packages/runtime/tests/intake-refusal-unit.test.mjs` against the exported functions.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  ROLES, roleQuery, rootQuery, namedCall, opk, endPool, printSkipCount,
  acceptPublishedLegal,
} from "./work-journal-fixtures.mjs";
import { markSkip } from "./wave-a-helpers.mjs";
import { sha } from "./rig-helpers.mjs";
import { createFirm, seedAdmission, insertUser } from "./rig-fixtures.mjs";

const STEM = "intake_refusal_record$";

let _ready = null;
async function laneReady() {
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
  if (await laneReady()) return false;
  markSkip();
  t.skip(`#965 at-creation refusal record absent (no ${STEM} migration applied)`);
  return true;
}

before(async () => {
  // A SKIP IS NOT EVIDENCE, and a FOCUSED run says so out loud.
  if (!(await laneReady()) && process.env.CLARA_ALLOW_MISSING_INTAKE_REFUSAL_RECORD !== "1") {
    throw new Error(
      `#965: no migration matching /${STEM}/ is applied to this database, and `
      + "CLARA_ALLOW_MISSING_INTAKE_REFUSAL_RECORD is not set. Apply "
      + "0254_intake_refusal_record.sql, or preload "
      + "tests/intake-refusal-record-preintegration-gate.mjs if a chain below it is expected here.",
    );
  }
});
after(async () => {
  printSkipCount("intake-refusal-record");
  await endPool();
});

// ===========================================================================================
// The door wrapper. NAMED arguments only — a divergence in a parameter name is a real finding
// rather than a silent positional mismatch.
// ===========================================================================================

const CREATE_INTAKE = namedCall("create_document_intake", [
  { name: "p_uploaded_by", cast: "uuid" }, { name: "p_origin", cast: "text" },
  { name: "p_chat_session", cast: "uuid" }, { name: "p_filename", cast: "text" },
  { name: "p_mime", cast: "text" }, { name: "p_declared_bytes", cast: "bigint" },
  { name: "p_token_hash", cast: "text" }, { name: "p_expires_at", cast: "timestamptz" },
  { name: "p_op_key", cast: "text" },
]);

/** Drive the REAL creation door as clara_runtime. `roleQuery` is AUTOCOMMIT (rig-helpers.mjs:120
 *  opens no transaction unless asked), so whatever this call leaves behind is COMMITTED by the
 *  time it returns — which is exactly the property #965 is about. */
async function createIntake(uploadedBy, { filename, bytes = 1048576, mime = "application/pdf" }) {
  const r = await roleQuery(ROLES.runtime, CREATE_INTAKE, [
    uploadedBy, "documents_tab", null, filename, mime, bytes,
    sha(`p965-${filename}-${Math.random()}`), new Date(Date.now() + 900_000).toISOString(),
    opk("p965-create"),
  ]);
  return r.rows[0].result;
}

/** A firm nobody else touches, with an EXPLICIT per-firm ceiling. Labelled fixture DML: there is
 *  no public writer for `clara.firm_document_limits` and #692 deliberately added none, so the
 *  BEFORE-INSERT trigger is reachable only by an owner-level hand — this rig's root fixture, as
 *  `firm-document-limits.test.mjs` states at length for the same table. */
async function firmWithCeiling(tag, { docsPerDay, pagesPerDay }) {
  const stamp = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const owner = await insertUser(`p965${tag}_${stamp}`, "owner");
  const firm = await createFirm(owner, {
    name: `p965${tag}_${stamp}`, token: await seedAdmission(), opKey: opk("p965-firm"),
  });
  await acceptPublishedLegal(owner);
  await rootQuery(
    "insert into clara.firm_document_limits(firm_id, docs_per_day, pages_per_day) values ($1,$2,$3)",
    [firm, docsPerDay, pagesPerDay]);
  return { owner, firm };
}

/** Read the intake back on a DIFFERENT pooled connection than the door ran on. A row this query
 *  can see is a row the door's own transaction COMMITTED — the whole point of the ticket. */
const intakeRow = (id) => rootQuery(
  "select id, firm_id, uploaded_by, original_filename, declared_mime, declared_bytes, status,"
  + " failure_code, created_at from clara.document_intakes where id=$1",
  [id]).then((r) => r.rows[0] ?? null);

const reservationsFor = (intake) => rootQuery(
  "select id, state, pages_reserved from clara.document_ingest_reservations where intake_id=$1",
  [intake]).then((r) => r.rows);

/** Every `create_document_intake` row the append-only audit log holds for this firm, oldest
 *  first. `clara.audit_log` is append-only (0002:270-288), so a row here is permanent evidence. */
const auditFor = (firm) => rootQuery(
  "select actor, args, outcome from clara.audit_log where firm_id=$1 and fn='create_document_intake' order by id",
  [firm]).then((r) => r.rows);

// ===========================================================================================
// SLICE 1 — the refusal is a RETURNED outcome and the record survives it.
// ===========================================================================================

test("p965.refusal.docs_ceiling_commits_a_record — the DOCS guard RETURNS a refusal and the intake row survives it", async (t) => {
  if (await gate(t)) return;
  // docs_per_day 1 with a page ceiling far above the two files' 20 pages, so the DOCS guard — and
  // only the docs guard — is what refuses the second call.
  const { owner, firm } = await firmWithCeiling("docs", { docsPerDay: 1, pagesPerDay: 1000 });

  const admitted = await createIntake(owner, { filename: "p965-admitted.pdf" });
  assert.equal(admitted.status, "uploading", "the first file is admitted exactly as before");
  assert.ok(admitted.reservation_id, "…and holds a real reservation");

  // THE CONTRACT THIS TICKET CHANGES. Before #965 this call RAISED CLR18 and this line threw.
  const refused = await createIntake(owner, { filename: "p965-refused.pdf" });

  assert.equal(refused.refused, true, "a ceiling refusal is a RETURNED outcome, not a raise");
  assert.equal(refused.status, "failed", "…at the lane's existing failed status");
  assert.equal(refused.failure_code, "limit", "…and its existing `limit` failure reason");
  assert.ok(refused.intake_id, "…naming the intake record it committed");
  assert.equal(refused.reservation_id ?? null, null, "a refused file holds NO reservation");

  // COMMITTED, not rolled back: a different connection can see it.
  const row = await intakeRow(refused.intake_id);
  assert.ok(row, "the refused file left a DURABLE record — this is the whole ticket");
  assert.equal(row.status, "failed");
  assert.equal(row.failure_code, "limit");
  assert.equal(row.firm_id, firm, "the record captures the firm");
  assert.equal(row.original_filename, "p965-refused.pdf", "…and identifies the attempted file");

  // The refusal is distinguishable from a successful intake, and the ceiling still held.
  const admittedRow = await intakeRow(admitted.intake_id);
  assert.equal(admittedRow.status, "uploading", "the admitted file is untouched by the refusal");
  assert.deepEqual(await reservationsFor(refused.intake_id), [],
    "no capacity was consumed by the refused file — the ceiling REFUSED, it did not admit");
});

// ===========================================================================================
// SLICE 2 — the record says WHICH ceiling, WHOSE firm, WHICH file and WHEN, and the refusal is
// as auditable as the admission it replaced.
// ===========================================================================================

test("p965.refusal.record_names_the_docs_ceiling_firm_file_and_moment", async (t) => {
  if (await gate(t)) return;
  const { owner, firm } = await firmWithCeiling("named", { docsPerDay: 1, pagesPerDay: 1000 });
  const before = new Date();
  await createIntake(owner, { filename: "p965-first.pdf" });
  const refused = await createIntake(owner, { filename: "p965-turned-away.pdf" });
  const after = new Date();

  assert.equal(refused.ceiling, "documents",
    "the record says WHICH ceiling refused — docs_per_day 1 with 1000 pages spare can only be the docs guard");
  assert.equal(refused.firm_id, firm, "…the firm");
  assert.equal(refused.filename, "p965-turned-away.pdf", "…enough to identify the attempted file");
  assert.match(String(refused.reason), /document daily limit reached \(docs\)/,
    "…and the database's OWN refusal sentence, verbatim, the way 0229's capacity wait carries it");

  const at = new Date(refused.refused_at);
  assert.ok(Number.isFinite(at.getTime()), "refused_at is a real timestamp");
  assert.ok(at >= new Date(before.getTime() - 5000) && at <= new Date(after.getTime() + 5000),
    "…the moment of the attempt, not a default or a zero");

  // The AUDIT LOG — append-only — carries the refusal beside the admission it followed.
  const rows = await auditFor(firm);
  assert.equal(rows.length, 2, "both the admission and the refusal are audited; a refusal is not a silent event");
  assert.equal(rows[0].args.refused ?? false, false, "the first row is the admission");
  assert.ok(rows[0].args.reservation, "…which names the reservation it took");
  assert.equal(rows[1].args.refused, true, "the second row is the refusal");
  assert.equal(rows[1].args.intake, refused.intake_id, "…naming the intake record it committed");
  assert.equal(rows[1].args.ceiling, "documents", "…and which ceiling was hit");
  assert.equal(rows[1].actor, owner, "…attributed to the uploader, exactly as the admission is");
});

test("p965.refusal.pages_ceiling_is_named_apart_from_the_docs_ceiling", async (t) => {
  if (await gate(t)) return;
  // pages_per_day 10 with 100 docs to spare: a single <=1MB PDF declares 10 pages
  // (clara._declared_page_ceiling's second rung), so the FIRST file lands flush and the second
  // can only be refused by the PAGES guard.
  const { owner } = await firmWithCeiling("pages", { docsPerDay: 100, pagesPerDay: 10 });
  const admitted = await createIntake(owner, { filename: "p965-pages-first.pdf" });
  assert.equal(admitted.status, "uploading", "the first file fills the page ceiling exactly");

  const refused = await createIntake(owner, { filename: "p965-pages-refused.pdf" });
  assert.equal(refused.refused, true);
  assert.equal(refused.ceiling, "pages",
    "the PAGES guard is named apart from the docs guard — the two are not collapsed into one word");
  assert.match(String(refused.reason), /document daily limit reached \(pages\)/,
    "…and it is the database's own sentence that says so");
  assert.equal(refused.failure_code, "limit",
    "both ceilings land at the ONE existing failure reason; `ceiling` is the detail, not a second vocabulary");
});
