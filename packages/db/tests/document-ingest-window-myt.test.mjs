// #964 — THE DOCUMENT-INGEST DAILY CEILING MOVES FROM A UTC DAY TO Asia/Kuala_Lumpur.
// Migration: 0252_document_ingest_window_myt.sql (recut of 0007_document_pipeline.sql:1632-1714).
//
// WHY THIS FILE TESTS THREE UNGRANTED INTERNAL HELPERS DIRECTLY, stated once because it looks
// unlike most doors-under-a-role batteries in this package. #964's Agent Brief names
// `clara._reserve_document_ingest`, `clara._resize_document_reservation` and
// `clara._settle_document_reservation` as ITS OWN key interfaces ("the three reservation helpers
// each compute a start-of-today boundary and must move together"), and there is no public,
// time-travelling way to observe the boundary they compute: `document_ingest_reservations
// .created_at` is IMMUTABLE (`_tf_reservation_update` raises CLR08, 0007), and nothing in this
// estate can move `now()` for a session. 0229's OWN prestate proved the OLD window the identical
// way (`p.prosrc like '%date_trunc(''day'', now() at time zone ''utc'')%'`, 0229:192-198) rather
// than by driving a reservation at a crafted instant — this file follows that precedent, plus the
// firm-document-limits.test.mjs house shape (a catalog-level recut battery, root-only, no role
// under test) for a small internal-function recut with no public door to observe through.
//
// WHAT THIS FILE DELIBERATELY DOES NOT PROVE. Nothing here drives `clara.get_intake_batch`'s
// `capacity` descriptor: that is `p964.window.capacity_descriptor_myt` in intake-batch.test.mjs,
// gated on this same migration's stem, reusing that file's batch fixtures rather than duplicating
// them here. Nothing here proves a REAL reservation at 06:00 MYT lands in "today"'s window either
// — that would need control over `now()`, which nothing in this estate offers; the raw boundary
// fact (AC1/AC2/AC3) is pinned ONCE, as `p964.window.capacity_window_myt` in
// intake-batch.test.mjs (the renamed, recut `p636.batch.capacity_window_utc`), and THIS file
// proves the three production bodies compute that exact expression, never a mock of it.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { rootQuery, asRoot, endPool } from "./rig-fixtures.mjs";

/** The #964 migration's STABLE STEM, probed against clara.schema_migrations — never a file
 *  listing, and never a migration NUMBER (numbers are claimed at merge). */
const STEM = "document_ingest_window_myt$";

/** The three key interfaces #964's Agent Brief names, and the ONE window clause every one of them
 *  must carry, byte for byte. */
const RESERVE = "clara._reserve_document_ingest(uuid,uuid,integer,timestamptz)";
const RESIZE = "clara._resize_document_reservation(uuid,uuid,integer)";
const SETTLE = "clara._settle_document_reservation(uuid,uuid,integer)";
const HELPERS = [RESERVE, RESIZE, SETTLE];

/** The 0007 clause #964 replaces (six-space indent, verbatim across all three bodies — measured
 *  by `grep` over 0007_document_pipeline.sql:1644,1672,1709 before this file was written). */
const OLD_UTC_CLAUSE =
  "      and created_at >= (date_trunc('day', now() at time zone 'utc') at time zone 'utc');";
/** The clause #964 lands, same shape, Asia/Kuala_Lumpur in both `at time zone` legs. */
const NEW_MYT_CLAUSE =
  "      and created_at >= (date_trunc('day', now() at time zone 'Asia/Kuala_Lumpur') "
  + "at time zone 'Asia/Kuala_Lumpur');";

/** The pre-0252 pre-images, MEASURED on this lane's own rig (clara_l05, PG 17.11, chain
 *  0001->0234) by `encode(sha256(convert_to(prosrc,'UTF8')),'hex')` keyed by `to_regprocedure` —
 *  never transcribed from file text. Identical to 0229:160-165's own pins for the same three
 *  functions, because neither body has moved since 0007. 0252's own §0 prestate carries the same
 *  numbers and refuses to apply if one has drifted; this is the OTHER half of that pair, used by
 *  `p964.window.recuts_landed` to prove the live bodies are no longer their pre-images. */
const PREIMAGE = {
  [RESERVE]: "074c9b180729e3f2d8af8d9fecb38be158db9e2a74e4292b11ff7533a1ed9734",
  [RESIZE]: "41528b318065207775e48c4ac3f196f07d6cdf0511d108affc72b86c07114dbf",
  [SETTLE]: "b72d83e70645d7bbce44a491002981576059e9d0db41a95ee07e6b87930ddee6",
};

let live = false;
let executed = 0;
const EXPECTED_CELLS = 5;

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
  // A SKIP IS NOT EVIDENCE, and a FOCUSED run says so out loud (the house rule, restated from
  // firm-document-limits.test.mjs and legal-enforcement-mode.test.mjs).
  if (!live && process.env.CLARA_ALLOW_MISSING_DOCUMENT_INGEST_WINDOW_MYT !== "1") {
    throw new Error(
      "#964: the document-ingest MYT window recut is absent. Apply "
      + "0252_document_ingest_window_myt.sql, or set "
      + "CLARA_ALLOW_MISSING_DOCUMENT_INGEST_WINDOW_MYT=1 for the package-wide pre-integration sweep.",
    );
  }
});

after(async () => {
  if (live) {
    assert.equal(executed, EXPECTED_CELLS, `expected ${EXPECTED_CELLS} cells to run, ${executed} did`);
  } else {
    console.warn("SKIP document-ingest-window-myt: 0252 is not applied (explicit pre-integration run).");
  }
  await endPool();
});

function gate(t) {
  if (live) return false;
  t.skip("#964 document-ingest MYT window recut absent -- explicit pre-integration run");
  return true;
}

const cell = (name, fn) => test(name, async (t) => { if (gate(t)) return; executed += 1; await fn(t); });

async function prosrcOf(sig) {
  return (await rootQuery(
    "select prosrc from pg_proc where oid = $1::regprocedure", [sig])).rows[0].prosrc;
}

// ---------------------------------------------------------------------------------------------
// THE RAW BOUNDARY FACT (AC1/AC2/AC3: 06:00 MYT counts against today, 09:00/23:00 MYT share one
// quota, the reset is MYT midnight not 08:00) is pinned ONCE, in
// `intake-batch.test.mjs`'s `p964.window.capacity_window_myt` — the renamed, recut
// `p636.batch.capacity_window_utc` — never duplicated here. This file's own job starts one layer
// down: proving the LIVE PRODUCTION BODIES actually compute that boundary, never a copy of it.
//
// CELLS 1-3 — THE MECHANISM. Each of the three key interfaces, read from the live catalog, must
// carry the NEW clause and never the OLD one. "Never edit an applied migration" (work order rule
// 5) means the ONLY way to prove `_reserve_document_ingest`, `_resize_document_reservation` and
// `_settle_document_reservation` actually MOVED is to read what 0252 left behind in pg_proc.
// ---------------------------------------------------------------------------------------------
for (const sig of HELPERS) {
  cell(`p964.window.mechanism_myt — ${sig.split("(")[0].replace("clara.", "")} reads an Asia/Kuala_Lumpur calendar day, never a UTC one`, async () => {
    const src = await prosrcOf(sig);
    assert.ok(src.includes(NEW_MYT_CLAUSE),
      `${sig} does not carry the Asia/Kuala_Lumpur window clause — the live body was not recut`);
    assert.ok(!src.includes(OLD_UTC_CLAUSE),
      `${sig} still carries the OLD UTC window clause alongside the new one — the splice duplicated rather than replaced it`);

    // NON-REGRESSION: the pre-image, with ONLY the window clause substituted back, reproduces the
    // PINNED 0007 body exactly — the same "reverse substitution" proof 0234 uses for its own
    // anchored splices. A live body that hashes to anything else moved MORE than the window.
    const reconstructed = src.replace(NEW_MYT_CLAUSE, OLD_UTC_CLAUSE);
    const { createHash } = await import("node:crypto");
    const sha = createHash("sha256").update(reconstructed, "utf8").digest("hex");
    assert.equal(sha, PREIMAGE[sig],
      `${sig} changed MORE than its window clause — substituting the new clause back for the old `
      + "one does not reproduce the pinned pre-0252 body");
  });
}

// ---------------------------------------------------------------------------------------------
// CELL 4 — reserve, resize and settle AGREE (AC4: "Reserve, resize and settle agree on the same
// window boundary for the same instant"). Proved structurally rather than by timing three doors
// against a shared clock (which this estate cannot fake): the three bodies carry the BYTE-IDENTICAL
// clause, so no instant can ever pass one check and fail another — a mixed state is unrepresentable
// rather than merely untested.
// ---------------------------------------------------------------------------------------------
cell("p964.window.reserve_resize_settle_agree — the three helpers carry the byte-identical window clause", async () => {
  const [reserveSrc, resizeSrc, settleSrc] = await Promise.all(HELPERS.map(prosrcOf));
  for (const [label, src] of [["reserve", reserveSrc], ["resize", resizeSrc], ["settle", settleSrc]]) {
    const count = src.split(NEW_MYT_CLAUSE).length - 1;
    assert.equal(count, 1, `${label} must carry the window clause EXACTLY once, found ${count}`);
  }
});

// ---------------------------------------------------------------------------------------------
// CELL 5 — VACUITY CONTROL (work order rule 4: "show the new cell FAILING against a deliberately
// broken subject once, then restore the subject byte for byte"). Restores
// `_reserve_document_ingest` to its EXACT 0007 pre-image inside a transaction this cell rolls
// back, proves the mechanism check above would have RED on it, then proves the rollback held.
// ---------------------------------------------------------------------------------------------
cell("p964.window.vacuity — the mechanism check REDS against the exact 0007 pre-image, and the rollback holds", async () => {
  const BODY_0007_RESERVE = `create or replace function clara._reserve_document_ingest(p_firm uuid, p_intake uuid, p_pages int,
    p_lease_expires timestamptz) returns uuid
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare v_docs_limit int; v_pages_limit int; v_docs int; v_pages bigint; v_id uuid;
begin
  perform pg_advisory_xact_lock(203005001, hashtext(p_firm::text));
  select coalesce(l.docs_per_day,100), coalesce(l.pages_per_day,1000)
    into v_docs_limit,v_pages_limit from clara.firms f
    left join clara.firm_document_limits l on l.firm_id=f.id where f.id=p_firm;
  select count(*)::int, coalesce(sum(pages_reserved),0) into v_docs,v_pages
    from clara.document_ingest_reservations
    where firm_id=p_firm and state <> 'refunded'
      and created_at >= (date_trunc('day', now() at time zone 'utc') at time zone 'utc');
  if v_docs + 1 > v_docs_limit then
    raise exception 'document daily limit reached (docs)' using errcode='CLR18';
  end if;
  if v_pages + p_pages > v_pages_limit then
    raise exception 'document daily limit reached (pages)' using errcode='CLR18';
  end if;
  insert into clara.document_ingest_reservations(firm_id,intake_id,pages_reserved,lease_expires_at)
    values(p_firm,p_intake,p_pages,p_lease_expires) returning id into v_id;
  return v_id;
end $$;`;

  const probe = await asRoot(async (c) => {
    await c.query("begin");
    try {
      await c.query(BODY_0007_RESERVE);
      const src = (await c.query(
        "select prosrc from pg_proc where oid = $1::regprocedure", [RESERVE])).rows[0].prosrc;
      const { createHash } = await import("node:crypto");
      const sha = createHash("sha256").update(src, "utf8").digest("hex");
      return {
        rolledBackSha: sha,
        hasOld: src.includes(OLD_UTC_CLAUSE),
        hasNew: src.includes(NEW_MYT_CLAUSE),
      };
    } finally {
      await c.query("rollback");
    }
  });

  assert.equal(probe.rolledBackSha, PREIMAGE[RESERVE],
    "the restored body inside the transaction did not hash to the pinned 0007 pre-image — this "
    + "probe is not actually exercising the OLD body");
  assert.equal(probe.hasOld, true,
    "the OLD body must carry the UTC clause — this arm proves the mechanism check is not vacuous");
  assert.equal(probe.hasNew, false,
    "the OLD body must NOT carry the new MYT clause — a true positive requires a real negative");

  // THE ROLLBACK HELD: the live body is the #964 recut again.
  const liveSrc = await prosrcOf(RESERVE);
  assert.ok(liveSrc.includes(NEW_MYT_CLAUSE),
    "the live body lost the MYT window after the rolled-back probe — the transaction escaped");
  assert.ok(!liveSrc.includes(OLD_UTC_CLAUSE),
    "the live body regained the UTC window after the rolled-back probe — the transaction escaped");
});
