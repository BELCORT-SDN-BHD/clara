// #692 — THE FIRM DOCUMENT-LIMITS UPSERT IS COLUMN-PRESERVING.
// Migration: 0196_firm_document_limits_preserving.sql (recut of 0007_document_pipeline.sql:545).
//
// WHY EVERY CELL RUNS AS ROOT, stated once here because it is the whole reason this battery looks
// unlike the rest of the package. There is NO public writer for clara.firm_document_limits and
// this ticket deliberately adds none (#692 "Out of scope: adding a public writer or a settings
// surface for the limits"). The table grants SELECT to clara_authenticated and NOTHING else to any
// application role, and the only routine in the schema that writes it is the BEFORE-INSERT trigger
// itself, which is EXECUTE-granted to nobody — both halves are already asserted by C-26 in
// tests/rig-docs-metering.test.mjs. So the trigger is reachable only by an owner-level or superuser
// hand: the operator ceremony, and this rig's own root fixture. A cell here that tried to drive the
// door through a role would be testing the grant matrix, not the trigger.
//
// WHAT WAS WRONG, and what these cells hold the recut to. The 0007 body answered every INSERT
// against an existing row with a HARDCODED column list — docs_per_day, pages_per_day,
// ocr_concurrency, updated_by, all from NEW — so an upsert that meant to move one limit moved all
// of them, and 0090's fourth limit column (llm_witness_concurrency) was never carried at all: a
// write naming it was silently DROPPED. The recut coalesces NEW against the existing row for all
// four limit columns and for updated_by.
//
// THE RULE THE CELLS PIN. NULL means "leave this column alone", and an OMITTED column IS a NULL
// here — 0196 dropped the four limit columns' table defaults precisely so that it is. Postgres
// fills an unnamed column with its table DEFAULT before any BEFORE-ROW trigger sees the row, and a
// default is a value the trigger cannot tell from a deliberate one; while those defaults stood,
// the NAIVE writer (`insert (firm_id, pages_per_day) values (:f, 13)`) still reset the other three.
// Cell 7 is that writer, and cell 1 is the other side of the same coin: with no column defaults
// left, the TRIGGER supplies 100 / 1000 / 2 / 2 on a firm's first insert, so a fresh row is
// observably what it always was. Cell 1 reads `column_default` from the catalog as well, so the
// two halves cannot drift apart silently.
//
// THE RED-ON-OLD PROOF (cell 9) restores the 0007 body inside a transaction it rolls back, and
// shows what the recut removes. It has two arms, because the defect has two halves. FIRST it also
// restores the four table DEFAULTS, rebuilding the HISTORICAL world whole — and there the naive
// one-column upsert SUCCEEDS and silently resets the limits it did not name over the operator's
// own, which is the data loss #692 was actually filed about. THEN it drops the defaults again, to
// the world 0196 leaves, and shows that the old body cannot express preservation in EITHER
// spelling there (both the naive omission and the explicit NULL die on NOT NULL, now that nothing
// fills those columns but the trigger), that it silently DROPS a write to llm_witness_concurrency
// even when every column is supplied, and that it wipes updated_by. Without this cell the others
// would prove the schema is in some state, not that this migration put it there.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { rootQuery, asRoot, endPool } from "./rig-fixtures.mjs";

/** The #692 migration's STABLE STEM, probed against clara.schema_migrations — never a file
 *  listing, and never a migration NUMBER (numbers are claimed at merge). */
const STEM = "firm_document_limits_preserving$";

const LIMITS = ["docs_per_day", "pages_per_day", "ocr_concurrency", "llm_witness_concurrency"];
const COLS = `${LIMITS.join(", ")}, updated_by, updated_at`;

/** A baseline that shares no value with any table default (100 / 1000 / 2 / 2), so a cell can
 *  never mistake "the row was preserved" for "the row was reset to a default that happened to
 *  match". */
const BASE = { docs_per_day: 11, pages_per_day: 22, ocr_concurrency: 3, llm_witness_concurrency: 4 };
/** The four values 0196 moved OFF the columns and INTO the trigger's first-insert arm. */
const DEFAULTS = { docs_per_day: 100, pages_per_day: 1000, ocr_concurrency: 2, llm_witness_concurrency: 2 };

let live = false;
let executed = 0;
const EXPECTED_CELLS = 9;

let firm = null;
let actor = null;
/** The row (or null) the battery found on the chosen firm, restored in `after`. */
let priorRow = null;

async function laneReady() {
  try {
    const r = await rootQuery(
      "select count(*)::int as n from clara.schema_migrations where version ~ $1", [STEM]);
    return r.rows[0].n > 0;
  } catch {
    return false;
  }
}

before(async () => {
  live = await laneReady();
  if (!live) return;
  firm = (await rootQuery("select id from clara.firms order by created_at asc, id asc limit 1")).rows[0]?.id ?? null;
  actor = (await rootQuery("select id from clara.users where email is not null order by id asc limit 1")).rows[0]?.id ?? null;
  assert.ok(firm, "no firm exists — seed the database before running this battery");
  assert.ok(actor, "no user exists — seed the database before running this battery");
  priorRow = (await rootQuery(
    `select ${COLS} from clara.firm_document_limits where firm_id = $1`, [firm])).rows[0] ?? null;
});

after(async () => {
  if (live && firm) {
    // Leave the chosen firm exactly as this battery found it: a limits row nobody asked for is a
    // value another battery could later read and reason about.
    await rootQuery("delete from clara.firm_document_limits where firm_id = $1", [firm]);
    if (priorRow) {
      await rootQuery(
        `insert into clara.firm_document_limits
           (firm_id, docs_per_day, pages_per_day, ocr_concurrency, llm_witness_concurrency, updated_by)
         values ($1, $2, $3, $4, $5, $6)`,
        [firm, priorRow.docs_per_day, priorRow.pages_per_day, priorRow.ocr_concurrency,
          priorRow.llm_witness_concurrency, priorRow.updated_by]);
      await rootQuery("update clara.firm_document_limits set updated_at = $2 where firm_id = $1",
        [firm, priorRow.updated_at]);
    }
  }
  if (live) {
    assert.equal(executed, EXPECTED_CELLS, `expected ${EXPECTED_CELLS} cells to run, ${executed} did`);
  }
  await endPool();
});

function gate(t) {
  if (live) return false;
  if (process.env.CLARA_ALLOW_MISSING_FIRM_DOCUMENT_LIMITS === "1") {
    console.warn("SKIP firm-document-limits: 0196 is not applied (explicit pre-integration run).");
    t.skip("#692 firm-document-limits recut absent -- explicit pre-integration run");
    return true;
  }
  assert.fail(
    "#692: the column-preserving firm_document_limits recut is absent. Apply "
    + "0196_firm_document_limits_preserving.sql (or its numbered suite copy), or set "
    + "CLARA_ALLOW_MISSING_FIRM_DOCUMENT_LIMITS=1 for the package-wide pre-integration sweep.",
  );
  return true;
}

const cell = (name, fn) => test(name, async (t) => { if (gate(t)) return; executed += 1; await fn(t); });

async function readRow() {
  return (await rootQuery(
    `select ${COLS} from clara.firm_document_limits where firm_id = $1`, [firm])).rows[0] ?? null;
}

/** Put the chosen firm's row at BASE with a known actor, from nothing. The DELETE is what makes
 *  each cell independent of the one before it. */
async function baseline() {
  await rootQuery("delete from clara.firm_document_limits where firm_id = $1", [firm]);
  await rootQuery(
    `insert into clara.firm_document_limits
       (firm_id, docs_per_day, pages_per_day, ocr_concurrency, llm_witness_concurrency, updated_by)
     values ($1, $2, $3, $4, $5, $6)`,
    [firm, BASE.docs_per_day, BASE.pages_per_day, BASE.ocr_concurrency, BASE.llm_witness_concurrency, actor]);
  return readRow();
}

/** The PRESERVING upsert shape a future writer must use: every limit column NAMED, and NULL for
 *  the ones it is not setting. `values` maps column -> value; unlisted limits are sent as NULL. */
async function upsert(values, { actorId = null } = {}) {
  const params = [firm, ...LIMITS.map((c) => (c in values ? values[c] : null)), actorId];
  return rootQuery(
    `insert into clara.firm_document_limits
       (firm_id, ${LIMITS.join(", ")}, updated_by)
     values ($1, $2, $3, $4, $5, $6)`, params);
}

/** The OTHER spelling of the same intent, and the one #692 was actually filed about: the column
 *  being moved is NAMED and every other limit is left OUT of the statement. `column` is always a
 *  member of LIMITS — a literal of this file, never caller input. */
async function upsertOmitting(column, value) {
  return rootQuery(
    `insert into clara.firm_document_limits (firm_id, ${column}) values ($1, $2)`, [firm, value]);
}

// ---------------------------------------------------------------------------------------------
// FIRST INSERT — observably unchanged by #692, but for a different reason than before: the four
// limit columns no longer carry a table default, and the TRIGGER supplies 100 / 1000 / 2 / 2.
// Both halves are asserted here, so the relocation cannot half-rot.
// ---------------------------------------------------------------------------------------------

cell("a first insert with all four limits OMITTED still lands 100/1000/2/2 — from the trigger, not from a column default", async () => {
  // The catalog half: the four defaults really left the table. Without this, the cell below could
  // be passing on defaults that were never dropped, and cell 7 would be the only thing that reds.
  const defs = (await rootQuery(
    `select column_name, column_default from information_schema.columns
      where table_schema = 'clara' and table_name = 'firm_document_limits'
        and column_name = any($1::text[]) order by column_name`, [LIMITS])).rows;
  assert.equal(defs.length, 4, "the four limit columns are not all present");
  assert.deepEqual(defs.filter((c) => c.column_default !== null), [],
    "a limit column still carries a table DEFAULT — an omitted column would arrive as that value "
    + "and be written over the firm's own, which is exactly the loss 0196 closes");
  // updated_at keeps its own default: 0196 drops the FOUR limit defaults and no other.
  const stamp = (await rootQuery(
    `select column_default from information_schema.columns where table_schema = 'clara'
       and table_name = 'firm_document_limits' and column_name = 'updated_at'`)).rows[0].column_default;
  assert.match(stamp ?? "", /now\(\)/, "updated_at lost its now() default — the drop was not surgical");

  await rootQuery("delete from clara.firm_document_limits where firm_id = $1", [firm]);
  const r = await rootQuery(
    "insert into clara.firm_document_limits (firm_id) values ($1) returning firm_id", [firm]);
  assert.equal(r.rowCount, 1, "the BEFORE-INSERT trigger swallowed the FIRST insert — the row would never be created");
  const row = await readRow();
  assert.ok(row, "no row landed for a firm that had none");
  for (const c of LIMITS) {
    assert.equal(row[c], DEFAULTS[c],
      `${c} is ${row[c]} on a first insert, want ${DEFAULTS[c]} — the trigger is now the ONLY thing that supplies it`);
  }
  assert.equal(row.updated_by, null, "updated_by is not null on a first insert that named no actor");
  assert.ok(row.updated_at instanceof Date, "updated_at was not stamped on the first insert");

  // …and the SECOND insert for the same firm is swallowed rather than raising a primary-key
  // violation — the pseudo-upsert 0007 exists for, unchanged.
  const again = await rootQuery(
    "insert into clara.firm_document_limits (firm_id) values ($1) returning firm_id", [firm]);
  assert.equal(again.rowCount, 0, "a repeat insert was not swallowed — the pseudo-upsert is gone");
});

cell("a first insert that names ONE limit takes it and fills the other three from the trigger", async () => {
  // The MIXED first-insert path: the one a missing first-insert arm would break without any cell
  // above noticing, because a bare (firm_id) insert and a full one both go through arms of their
  // own. A NOT NULL column left NULL here would be 23502 rather than a wrong value.
  await rootQuery("delete from clara.firm_document_limits where firm_id = $1", [firm]);
  await rootQuery(
    "insert into clara.firm_document_limits (firm_id, pages_per_day) values ($1, 13)", [firm]);
  const row = await readRow();
  assert.deepEqual(
    { docs_per_day: row.docs_per_day, pages_per_day: row.pages_per_day,
      ocr_concurrency: row.ocr_concurrency, llm_witness_concurrency: row.llm_witness_concurrency },
    { docs_per_day: DEFAULTS.docs_per_day, pages_per_day: 13,
      ocr_concurrency: DEFAULTS.ocr_concurrency, llm_witness_concurrency: DEFAULTS.llm_witness_concurrency },
    "a first insert naming one limit did not fill the other three from the trigger's first-insert arm",
  );
});

// ---------------------------------------------------------------------------------------------
// PRESERVATION — one cell per limit column, so a failure names the column that is still
// collateral. Each: move ONE limit, assert the other THREE are exactly what they were.
// ---------------------------------------------------------------------------------------------

for (const target of LIMITS) {
  cell(`an upsert that moves only ${target} leaves the other three limit columns exactly as they were, in BOTH spellings`, async () => {
    // TWO SPELLINGS, ONE RULE, EVERY COLUMN. "An upsert that names one column leaves the others
    // as they were" (#692's Agent Brief) is a claim about the statement a writer actually types,
    // and there are two of those: the explicit NULL a generated writer emits, and the OMISSION
    // the ticket was filed about. They reach the trigger identically ONLY because 0196 dropped
    // the four table defaults, so neither may stand in for the other.
    for (const spelling of ["explicit-NULL", "omitted"]) {
      const before0 = await baseline();
      const moved = BASE[target] + 50; // shares no value with any default or any other baseline value
      if (spelling === "explicit-NULL") await upsert({ [target]: moved });
      else await upsertOmitting(target, moved);
      const after0 = await readRow();

      assert.equal(after0[target], moved,
        `${spelling}: ${target} did not take the value the upsert named`);
      for (const other of LIMITS.filter((c) => c !== target)) {
        assert.equal(
          after0[other], before0[other],
          `${spelling}: ${other} was rewritten to ${after0[other]} by an upsert that only named `
          + `${target} (it was ${before0[other]}) — the 0007 hardcoded column list is back`,
        );
      }
      // The actor the upsert did not name survives (the one rule, applied to updated_by too), and
      // the write stamp moved because the row really did move.
      assert.equal(after0.updated_by, before0.updated_by,
        `${spelling}: updated_by was wiped by an upsert that named no actor`);
      assert.ok(after0.updated_at > before0.updated_at,
        `${spelling}: updated_at did not move for an upsert that really changed a limit`);
    }
  });
}

// ---------------------------------------------------------------------------------------------
// THE NO-OP — an upsert that names nothing changes nothing, updated_at included.
// ---------------------------------------------------------------------------------------------

cell("an upsert that is NULL for every column changes nothing at all, updated_at included", async () => {
  const before0 = await baseline();
  const r = await upsert({});
  assert.equal(r.rowCount, 0, "an all-NULL upsert was not swallowed");
  const after0 = await readRow();
  assert.deepEqual(after0, before0,
    "an all-NULL upsert moved the row — with no column named there is nothing to record, and a "
    + "moved updated_at would misreport when the limits last changed",
  );

  // Vacuity control: the same shape WITH one column named does move the row, so the assertion
  // above is not passing because the fixture writes nothing.
  await upsert({ pages_per_day: 99 });
  const moved = await readRow();
  assert.equal(moved.pages_per_day, 99, "the control upsert did not land — the no-op cell proves nothing");
  assert.ok(moved.updated_at > before0.updated_at, "a real change did not move updated_at");
});

// ---------------------------------------------------------------------------------------------
// THE NAIVE WRITER — the one #692 was filed about. It names the column it cares about and leaves
// the rest out of the statement entirely. This is the cell the whole ticket exists for.
// ---------------------------------------------------------------------------------------------

cell("an upsert that OMITS the other three limit columns preserves them — omission IS preservation", async () => {
  const before0 = await baseline();
  await rootQuery(
    "insert into clara.firm_document_limits (firm_id, pages_per_day) values ($1, 13)", [firm]);
  const row = await readRow();
  assert.equal(row.pages_per_day, 13, "the named column did not take");
  assert.deepEqual(
    { docs_per_day: row.docs_per_day, ocr_concurrency: row.ocr_concurrency,
      llm_witness_concurrency: row.llm_witness_concurrency },
    { docs_per_day: before0.docs_per_day, ocr_concurrency: before0.ocr_concurrency,
      llm_witness_concurrency: before0.llm_witness_concurrency },
    "a one-column upsert reset the columns it did not mention — either a limit column regained a "
    + "table default (so it reaches the trigger as a value instead of NULL) or the preserving arm "
    + "is gone; this is the exact latent data-loss path #692 closes",
  );
  assert.equal(row.updated_by, before0.updated_by, "updated_by was wiped by a naive one-column upsert");
  assert.ok(row.updated_at > before0.updated_at, "updated_at did not move for a real change");
});

// ---------------------------------------------------------------------------------------------
// RED ON OLD — the 0007 body, restored inside a transaction that is rolled back. Without this the
// cells above would prove the schema is in some state, not that 0196 put it there.
// ---------------------------------------------------------------------------------------------

// clara._tf_firm_document_limits_upsert()'s 0007 body, transcribed VERBATIM from
// packages/db/migrations/0007_document_pipeline.sql:545-554. Never imported from the live catalog:
// the point of this cell is to compare the recut against the exact text it replaced.
const BODY_0007 = `create or replace function clara._tf_firm_document_limits_upsert() returns trigger
  language plpgsql security definer set search_path = clara, pg_temp as $$
begin
  update clara.firm_document_limits set docs_per_day=new.docs_per_day,
    pages_per_day=new.pages_per_day,ocr_concurrency=new.ocr_concurrency,
    updated_at=now(),updated_by=new.updated_by where firm_id=new.firm_id;
  if found then return null; end if;
  new.updated_at:=now();
  return new;
end $$;`;

/** The four table DEFAULTS 0196 dropped (0007:366-368 and 0090:298), restored so the RED-ON-OLD
 *  cell can rebuild the HISTORICAL world whole — the 0007 body alone is only half of it. */
const DEFAULTS_0007 = LIMITS.map(
  (c) => `alter table clara.firm_document_limits alter column ${c} set default ${DEFAULTS[c]};`).join("\n");
/** …and 0196's own relocation (0196:289-292), re-applied inside the same transaction so the
 *  NOT-NULL arm below is measured against the world this migration actually leaves behind. */
const DROP_DEFAULTS_0196 = LIMITS.map(
  (c) => `alter table clara.firm_document_limits alter column ${c} drop default;`).join("\n");

cell("RED ON OLD: with the 0007 defaults back the old body silently resets the columns it was not given, and without them it cannot preserve in either spelling", async () => {
  const before0 = await baseline();

  const losses = await asRoot(async (c) => {
    await c.query("begin");
    try {
      await c.query(BODY_0007);
      const probe = async (sql, params) => {
        await c.query("savepoint p");
        try {
          await c.query(sql, params);
          await c.query("release savepoint p");
          return null;
        } catch (err) {
          await c.query("rollback to savepoint p");
          return err.code;
        }
      };

      // (0) THE DEFECT AS FILED, which needs the HISTORICAL world and not merely the historical
      //     body: the 0007 trigger AND the four table defaults 0196 moved off the columns. Here
      //     the naive one-column upsert SUCCEEDS — and that is the loss. Postgres fills the three
      //     unnamed limits with 100 / 1000 / 2 before the trigger sees the row, the hardcoded
      //     UPDATE writes them over the operator's own 11 / 22 / 3, and nothing anywhere reports
      //     it. Probes (1)-(3) below then drop the defaults again and measure the OTHER half.
      await c.query(DEFAULTS_0007);
      const historic = await probe(
        "insert into clara.firm_document_limits (firm_id, pages_per_day) values ($1, 13)", [firm]);
      const afterHistoric = (await c.query(
        `select ${COLS} from clara.firm_document_limits where firm_id = $1`, [firm])).rows[0];

      // Back to the world 0196 leaves, and back to the baseline row, so the arms below measure the
      // post-relocation body-only defect rather than the wreckage of the arm above.
      await c.query(DROP_DEFAULTS_0196);
      await c.query(
        `update clara.firm_document_limits set docs_per_day=$2, pages_per_day=$3,
           ocr_concurrency=$4, llm_witness_concurrency=$5, updated_by=$6 where firm_id=$1`,
        [firm, BASE.docs_per_day, BASE.pages_per_day, BASE.ocr_concurrency,
          BASE.llm_witness_concurrency, actor]);

      // (1) THE NAIVE ONE-COLUMN UPSERT. With 0196's default relocation in place and the 0007 body
      //     back, the three NOT NULL limits reach the heap as the NULLs they now arrive as: the
      //     old body writes NEW straight through, so it cannot even complete the statement.
      const naive = await probe(
        "insert into clara.firm_document_limits (firm_id, pages_per_day) values ($1, 13)", [firm]);
      // (2) …and neither can the explicit-NULL spelling, for the same reason.
      const explicit = await probe(
        `insert into clara.firm_document_limits
           (firm_id, docs_per_day, pages_per_day, ocr_concurrency, llm_witness_concurrency, updated_by)
         values ($1, 61, null, null, null, null)`, [firm]);

      // (3) THE SILENT LOSS, with EVERY column supplied so nothing can die on NOT NULL: the 0007
      //     UPDATE has no llm_witness_concurrency arm at all, so that write is dropped, and it
      //     takes updated_by from NEW, so an upsert naming no actor wipes it. The three supplied
      //     values SHARE NO VALUE WITH ANY TABLE DEFAULT (this file's own rule, :49-52), so
      //     "the body wrote what it was handed" cannot be confused with "a default landed".
      await c.query(
        `insert into clara.firm_document_limits
           (firm_id, docs_per_day, pages_per_day, ocr_concurrency, llm_witness_concurrency)
         values ($1, 71, 72, 7, 9)`, [firm]);
      const after0 = (await c.query(
        `select ${COLS} from clara.firm_document_limits where firm_id = $1`, [firm])).rows[0];
      return { historic, afterHistoric, naive, explicit, after0 };
    } finally {
      await c.query("rollback");
    }
  });

  assert.equal(losses.historic, null,
    "the HISTORICAL world refused the naive one-column upsert — then this arm is not reproducing "
    + "the defect #692 was filed about, which is a write that SUCCEEDS and loses data");
  assert.deepEqual(
    { docs_per_day: losses.afterHistoric.docs_per_day,
      pages_per_day: losses.afterHistoric.pages_per_day,
      ocr_concurrency: losses.afterHistoric.ocr_concurrency,
      llm_witness_concurrency: losses.afterHistoric.llm_witness_concurrency },
    { docs_per_day: DEFAULTS.docs_per_day, pages_per_day: 13,
      ocr_concurrency: DEFAULTS.ocr_concurrency,
      llm_witness_concurrency: BASE.llm_witness_concurrency },
    "THE FILED DEFECT: under the 0007 body with the 0007 defaults, an upsert that named only "
    + `pages_per_day must reset docs_per_day to ${DEFAULTS.docs_per_day} and ocr_concurrency to `
    + `${DEFAULTS.ocr_concurrency} over the operator's own ${BASE.docs_per_day} / `
    + `${BASE.ocr_concurrency}, and leave llm_witness_concurrency at ${BASE.llm_witness_concurrency} `
    + "because the hardcoded UPDATE never carried that column at all — the rewrite and the "
    + "omission are the same bug seen from its two ends",
  );
  assert.equal(losses.afterHistoric.updated_by, null,
    "…and it wipes updated_by, which is the same loss applied to the actor column");

  assert.equal(losses.naive, "23502",
    "the 0007 body completed a naive one-column upsert — this cell is no longer exercising the "
    + "body 0196 replaced, or the limit columns regained their table defaults");
  assert.equal(losses.explicit, "23502",
    "the 0007 body did NOT die on NOT NULL for an explicit-NULL upsert — it cannot express "
    + "preservation, and that failure is the point of this probe");
  assert.equal(losses.after0.llm_witness_concurrency, BASE.llm_witness_concurrency,
    "the 0007 body carried llm_witness_concurrency — it does not, and this is the write it drops");
  assert.notEqual(losses.after0.llm_witness_concurrency, 9,
    "the restored body wrote llm_witness_concurrency, so it is not the 0007 body");
  assert.deepEqual(
    { docs_per_day: losses.after0.docs_per_day, pages_per_day: losses.after0.pages_per_day,
      ocr_concurrency: losses.after0.ocr_concurrency },
    { docs_per_day: 71, pages_per_day: 72, ocr_concurrency: 7 },
    "the 0007 body did not write the three limits it was handed — the probe is not reaching it",
  );
  assert.equal(losses.after0.updated_by, null,
    "the 0007 body did not wipe updated_by for an upsert that named no actor");

  // THE ROLLBACK HELD: the live body is the recut one again, the four defaults are gone again,
  // and the recut still preserves. The DEFAULT half is asserted explicitly because arm (0) above
  // put them back — a rollback that failed to take them away would leave this database in the
  // pre-0196 world with every other cell in this file quietly passing on table defaults.
  const src = (await rootQuery(
    "select prosrc from pg_proc where oid = 'clara._tf_firm_document_limits_upsert()'::regprocedure")).rows[0].prosrc;
  assert.ok(src.includes("coalesce(new.llm_witness_concurrency, v_old.llm_witness_concurrency)"),
    "the 0007 body survived the rollback — the live trigger is no longer the 0196 recut");
  const defsAfter = (await rootQuery(
    `select column_name, column_default from information_schema.columns
      where table_schema = 'clara' and table_name = 'firm_document_limits'
        and column_name = any($1::text[]) order by column_name`, [LIMITS])).rows;
  assert.deepEqual(defsAfter.filter((c) => c.column_default !== null), [],
    "a limit column still carries a table DEFAULT after the rollback — arm (0)'s restoration "
    + "escaped its transaction and this database is no longer the one 0196 left");
  const restored = await readRow();
  assert.deepEqual(restored, before0, "the rolled-back transaction left the row changed");
  await upsert({ docs_per_day: 77 });
  const now0 = await readRow();
  assert.equal(now0.docs_per_day, 77);
  assert.equal(now0.pages_per_day, before0.pages_per_day, "the recut body no longer preserves after the rollback");
  assert.equal(now0.llm_witness_concurrency, before0.llm_witness_concurrency,
    "the recut body no longer preserves llm_witness_concurrency after the rollback");
});
