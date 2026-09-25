// #1058 — `clara.entry_post_receipts.via_wake_kind` is NOT renamed; a catalog comment on the
// column, plus this file's own README section, disclose that it now carries non-wake POSTING
// LANE values alongside its original wake-credential kinds (riders sweep wave, lane 07).
//
// THE SEAM IS DOCUMENTATION, NOT BEHAVIOUR. The issue's own Agent Brief asks for a 118-file
// rename. The owner's ruling on the ticket (2026-09-24, "Ruling applied under the owner's
// delegation of 2026-09-23") and this lane's own scan (SWEEP-PLAN.md, the #1058 row of "Owner
// questions") both refuse the rename: the name appears across roughly 118 source files and nine
// frozen workflow files (three of which carry PROSE about this very column that can never be
// corrected: `chatTurn.v13.post.ts`, `chatTurn.v15.freeform.ts`, `chatTurn.v15.infra.ts`), and two
// of those frozen files (`bankAgent.v1.usage.ts:120`, `closePrep.v1.usage.ts:91`) build SQL that
// names a `p_via_wake_kind` parameter of a DIFFERENT door, `clara.record_agent_usage_event`
// (0110:365-370), which must keep its own spelling because a frozen workflow body is never
// edited. The fix taken instead: `comment on column` plus a `packages/db/README.md` section.
// Migration: 0350_via_wake_kind_lane_disclosure.sql. Frontier-gated on its own STABLE STEM
// (`via_wake_kind_lane_disclosure$`), never its number — numbers are claimed at merge
// (packages/db/README.md), the `firm_setup_committed_tin_backfill$` idiom.
//
// THE WIDENING, MEASURED RATHER THAN RESTATED. `entry_post_receipts_via_wake_kind_check` admits
// five values today: `autodraft`/`interactive` (0106, the original wake-only pair),
// `bank_agent` (0121 — a THIRD genuine wake-credential kind, added alongside
// `wake_credentials`' own CHECKs gaining the same disjunct in the same file), `payroll_facts`
// (0297/#946 — a posting LANE, not a wake credential: 0297's own header says the vocabulary
// "was closed to the three WAKE kinds" before this lane existed, and this lane is not one) and
// `contract_facts` (0299/#948 — a second posting LANE, same reasoning, tail-asserted at
// 0299:3343-3347). Two of the five live values name a posting lane, not a wake kind — the reason
// the column's own name now undersells what it holds.
//
// WHAT IS UNDER TEST, one cell per acceptance criterion #1058 carries under the ruling:
//   the chosen path (comment + README, naming the widening and refusing the rename) —
//     p1058.comment.discloses_the_lane_widening_and_the_no_rename_ruling
//     p1058.readme.section_discloses_the_lane_widening_and_the_no_rename_ruling
//   "existing data and its meaning are unchanged; this is [documentation], not a schema or
//   behaviour change" (the ticket's own AC3, still binding under the ruling), driven against the
//   live catalog rather than read off this file's own prose —
//     p1058.catalog.column_not_renamed_and_check_enumeration_unchanged

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { endPool, rootQuery } from "./rig-helpers.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const README_PATH = join(HERE, "..", "README.md");
const STEM = "via_wake_kind_lane_disclosure$";
const TABLE = "clara.entry_post_receipts";
const EXPECTED_CHECK =
  "CHECK ((via_wake_kind = ANY (ARRAY['autodraft'::text, 'interactive'::text, 'bank_agent'::text, 'payroll_facts'::text, 'contract_facts'::text])))";

let ready = false;
let executed = 0;
const EXPECTED_CELLS = 3;

/** True iff a migration whose version matches the stem is recorded applied. Catalog-probed
 *  against `clara.schema_migrations`, never inferred from a file listing. */
async function laneReady() {
  const r = await rootQuery(
    "select count(*)::int as n from clara.schema_migrations where version ~ $1", [STEM]);
  return r.rows[0].n > 0;
}

before(async () => { ready = await laneReady(); });
after(async () => {
  if (ready) assert.equal(executed, EXPECTED_CELLS, `expected ${EXPECTED_CELLS} cells to run, ${executed} did`);
  await endPool();
});

/** A FOCUSED run (just this file, no gate preload) FAILS LOUDLY when the migration is missing. */
function gate(t) {
  if (ready) return false;
  if (process.env.CLARA_ALLOW_MISSING_VIA_WAKE_KIND_LANE_DISCLOSURE === "1") {
    console.warn(`SKIP entry-post-receipts-via-wake-kind-disclosure: no ${STEM} migration applied (explicit pre-integration run).`);
    t.skip("entry-post-receipts-via-wake-kind-disclosure lane absent -- explicit pre-integration run");
    return true;
  }
  assert.fail(
    "the #1058 via_wake_kind lane disclosure is required for a focused run: apply 0350_via_wake_kind_lane_disclosure.sql");
}

function cell(name, fn) {
  test(name, async (t) => {
    if (gate(t)) return;
    executed += 1;
    await fn(t);
  });
}

// ---------------------------------------------------------------------------------------------
// AC1 -- the catalog comment.
// ---------------------------------------------------------------------------------------------
cell("p1058.comment.discloses_the_lane_widening_and_the_no_rename_ruling", async () => {
  const r = await rootQuery(
    `select col_description($1::regclass,
       (select attnum from pg_attribute where attrelid=$1::regclass and attname='via_wake_kind')) as c`,
    [TABLE],
  );
  const comment = r.rows[0]?.c;
  assert.ok(comment, "clara.entry_post_receipts.via_wake_kind carries no catalogue comment at all");
  for (const token of ["payroll_facts", "contract_facts", "#1058"]) {
    assert.ok(comment.includes(token),
      `the via_wake_kind column comment must name ${token} (got: ${JSON.stringify(comment)})`);
  }
  assert.match(comment, /not (only |a )?renam|no rename|never renam/i,
    `the comment must plainly say the column is not renamed (got: ${JSON.stringify(comment)})`);
});

// ---------------------------------------------------------------------------------------------
// AC1 -- the README section.
// ---------------------------------------------------------------------------------------------
cell("p1058.readme.section_discloses_the_lane_widening_and_the_no_rename_ruling", () => {
  const readme = readFileSync(README_PATH, "utf8");
  const heading = "## 0350";
  const idx = readme.indexOf(heading);
  assert.ok(idx >= 0, "packages/db/README.md carries no ## 0350 section for #1058");
  const nextHeadingIdx = readme.indexOf("\n## ", idx + heading.length);
  const section = nextHeadingIdx >= 0 ? readme.slice(idx, nextHeadingIdx) : readme.slice(idx);
  for (const token of ["via_wake_kind", "payroll_facts", "contract_facts", "#1058"]) {
    assert.ok(section.includes(token), `the 0350 README section must name ${token}`);
  }
  assert.match(section, /not (only |a )?renam|no rename|never renam/i,
    "the 0350 README section must plainly say the column is not renamed");
});

// ---------------------------------------------------------------------------------------------
// AC3 -- "existing data and its meaning are unchanged; this is [documentation], not a schema or
// behaviour change", driven against the live catalog.
// ---------------------------------------------------------------------------------------------
cell("p1058.catalog.column_not_renamed_and_check_enumeration_unchanged", async () => {
  const col = await rootQuery(
    `select data_type from information_schema.columns
     where table_schema='clara' and table_name='entry_post_receipts' and column_name='via_wake_kind'`);
  assert.equal(col.rows.length, 1,
    "clara.entry_post_receipts.via_wake_kind must still exist, unrenamed, as text");
  assert.equal(col.rows[0].data_type, "text");

  const renamed = await rootQuery(
    `select column_name from information_schema.columns
     where table_schema='clara' and table_name='entry_post_receipts'
       and column_name in ('via_posting_kind','via_authorisation_kind','via_lane_kind')`);
  assert.equal(renamed.rows.length, 0,
    "no alternate spelling of via_wake_kind exists on clara.entry_post_receipts -- this file must not have renamed it under a new name either");

  const chk = await rootQuery(
    `select pg_get_constraintdef(c.oid) as def from pg_constraint c
     where c.conrelid='clara.entry_post_receipts'::regclass
       and c.conname='entry_post_receipts_via_wake_kind_check'`);
  assert.equal(chk.rows.length, 1, "entry_post_receipts_via_wake_kind_check must still exist");
  assert.equal(chk.rows[0].def, EXPECTED_CHECK,
    `the CHECK's admitted-value enumeration must be byte-identical to its pre-#1058 measured state -- this ticket adds no new admitted value and removes none (got: ${chk.rows[0].def})`);

  const cols = await rootQuery(
    `select count(*)::int as n from pg_attribute
     where attrelid='clara.entry_post_receipts'::regclass and attnum>0 and not attisdropped`);
  assert.equal(cols.rows[0].n, 14, "clara.entry_post_receipts must still carry Annex E.1's 14 columns");
});
