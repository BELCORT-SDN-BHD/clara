// F-A4 (close key 1) -- PR-1a / WINDOW A, THE MEASUREMENT LAYER battery, for
// migrations/UNNUMBERED_f_a4_pr_1a_measurement_layer.sql (numbered at merge).
//
// THE GATE BELOW READS THE CATALOG, never a filename and never a schema_migrations row, so a
// renumber can never move what this battery asserts. Design of record:
// docs/plan/active/close-key-1-design.md v2 SS3.5 + SS3.10; mechanism
// close-key-1-annexes-1-mechanics.md A.5/A.6; cells A-3, A-4, A-5, A-11 of Annex D.1 and
// census C15.
//
// SCOPE: the three D1 rows of Annex F.1 (`_evaluate_one_gate` recut to delegate,
// `_gate_outstanding_items`' new arm, the fourteenth catalog row) and the three additive
// bodies (`_measure_one_gate`, `_close_gate_undated`, `_close_dry_run_core`). NOT in scope:
// every wake wrapper, the receipt table, the wake kind and the clock -- those are PR-1b/1c/2.
//
// NEVER LIVE: this file drives writes and runs only against a disposable rig.
//
// -----------------------------------------------------------------------------------------
// THE REFERENCE BODY, and why cell A-3 is a real before/after rather than a self-comparison.
// -----------------------------------------------------------------------------------------
// A-3 must prove the extraction did not move a single measured_digest. A digest measured by
// the NEW path and re-measured by the NEW path proves nothing (a self-referential cell). So
// this file installs the PRE-MIGRATION body under a second name -- sliced MECHANICALLY out of
// 0056_wave_e_close_model.sql, never retyped -- and proves it IS the pre-image by hashing its
// installed prosrc against the sha256 the migration pins (63ebc5fe...). Only then does it
// compare, gate by gate, on ONE fixture close over ONE set of facts. That is law 32's
// "write it against the old artifact", available inside a single post-migration rig.
//
// (Law 32's other half -- that the reference is the artifact and not a lookalike -- is the
// sha assertion. Spelling is not identity: a body named `_evaluate_one_gate` in a migration
// file is only the pre-image if its bytes hash to the pinned value, so that is what is
// checked, not the name it was found under.)

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import {
  rootQuery, humanQuery, endPool, printLaneNotes, noteLane, printSkipCount, markSkip,
  waveAEnsureReady, filedDocument,
} from "./wave-a-fixtures.mjs";
import * as wb from "./wave-b/wb-fixtures.mjs";
import {
  has0056, caught, cleanCloseableFY, beginClose, attestClose, finalizeClose,
  getCloseReadiness, plainEntry, bookToday, addDaysStr, BANK1, REVN,
  hasQd6Wall, QD6_GATE_KEY,
} from "./x56-fixtures.mjs";
import { latestGates, fyStatus, detailOf } from "./er9-corpus-fixtures.mjs";

/** The prosrc sha256 the migration pins for the PRE-migration `_evaluate_one_gate`. Held here
 *  as this battery's OWN independent copy: the cell re-derives the reference body from the
 *  0056 migration file and compares against this constant, so neither value is derived from
 *  the other and a drift in either is a finding. */
const EOG_PRE_SHA = "63ebc5feef4449b24537870282ae9f6fd0adbf63d42151922bafa05b81ce0b39";
/** The thirteen catalog keys that existed BEFORE PR-1a. Census C15's pre-image, held
 *  explicitly so the added key is proven ADDED rather than counted into a total. */
const PRE_KEYS = [
  "ap_control_tie", "ar_control_tie", "bank_recon_identity", "bank_recon_informational",
  "closing_stock_present", "depreciation_through_fy_end", "fa_control_tie",
  "fa_register_tie_view", "opening_continuity_tie", "open_bank_recon_items",
  "pl_retained_earnings_roll", "unapproved_drafts_in_period", "uncoded_documents",
];
const NEW_KEY = "undated_documents";
const PREV_FN = "clara._f_a4_eog_prev(uuid,text)";

let ready = false, has56 = false, applied = false, world = null;
let thisYear = null, lastYear = null;

/** IS THE MIGRATION IN THIS REPO AT ALL? Read off disk, by STEM, so a renumber cannot move it.
 *
 *  THIS IS A FALSE-GREEN NET, and the hole it plugs is real and silent. The runner selects
 *  files with `/^\d+.*\.sql$/` (scripts/migrate.mjs) and `continue`s past anything else with
 *  NO warning -- so a migration still named `UNNUMBERED_*.sql` (the authoring convention;
 *  numbers are claimed at merge) is NEVER APPLIED. If this battery then merely SKIPPED on
 *  "not applied", a PR carrying an unnumbered migration would go green having tested nothing:
 *  two absences multiplying into a pass. So: file present + not applied => THROW. */
function migrationFilePresent() {
  const dir = new URL("../migrations/", import.meta.url);
  const files = readdirSync(dir);
  const mine = files.filter((f) => f.includes("f_a4_pr_1a_measurement_layer") && f.endsWith(".sql"));
  const numbered = mine.filter((f) => /^\d{4}_/.test(f));
  return { present: mine.length > 0, names: mine, numbered: numbered.length > 0 };
}

/** THE CAPABILITY, read from the catalog -- the instrument production uses. THREE
 *  independently-checked facts, never one: the measurement core exists, the catalog carries
 *  the fourteenth row, AND the item body itemizes an undated payload. A HALF-applied Window A
 *  is DRIFT, not dormancy, and must fail loudly rather than skip. */
async function windowAReady() {
  const r = await rootQuery(`
    select to_regprocedure('clara._measure_one_gate(text,uuid,uuid)') is not null as core,
           exists (select 1 from clara.close_gate_checks k where k.check_key = $1) as row_present,
           coalesce(clara._gate_outstanding_items($1,
             '{"undated":[{"filing_id":"probe"}]}'::jsonb), '{}') = array['probe'] as itemized`,
    [NEW_KEY]);
  const s = r.rows[0];
  if (!s.core && !s.row_present && !s.itemized) return false;
  if (!s.core || !s.row_present || !s.itemized) {
    throw new Error(`F-A4 PR-1a DRIFT: Window A is HALF applied -- core=${s.core} row_present=${s.row_present} itemized=${s.itemized}. Apply the measurement-layer migration as a whole.`);
  }
  return true;
}

/** Install the PRE-migration `_evaluate_one_gate` under a second name, sliced mechanically out
 *  of the 0056 migration file. Owner is re-pointed to clara_fn_owner so it executes under the
 *  same identity (and therefore the same RLS posture) the real body does -- otherwise the
 *  comparison would be between two bodies AND two postures, and a difference could not be
 *  attributed. */
async function installReferenceBody() {
  const src = readFileSync(new URL("../migrations/0056_wave_e_close_model.sql", import.meta.url), "utf8");
  const START = "create function clara._evaluate_one_gate(p_run uuid, p_check_key text) returns jsonb";
  const END = "revoke all on function clara._evaluate_one_gate(uuid, text) from public;";
  const i = src.indexOf(START), j = src.indexOf(END);
  assert.ok(i >= 0, "mandatory setup: 0056 carries the original _evaluate_one_gate definition");
  assert.ok(j > i, "mandatory setup: its revoke follows the definition");
  assert.equal(src.indexOf(START, i + 1), -1, "mandatory setup: 0056 defines _evaluate_one_gate exactly once");
  const ddl = src.slice(i, j).replace(
    START, "create function clara._f_a4_eog_prev(p_run uuid, p_check_key text) returns jsonb");
  assert.equal(ddl.includes("_evaluate_one_gate"), false, "the reference DDL no longer names the live body");
  await rootQuery(ddl);
  await rootQuery(`alter function ${PREV_FN} owner to clara_fn_owner`);
}

before(async () => {
  ready = await waveAEnsureReady();
  if (!ready) { noteLane("0011 surface absent -- F-A4 PR-1a battery skipped"); return; }
  has56 = await has0056();
  if (!has56) { noteLane("0056 not applied -- the close model is absent"); return; }
  applied = await windowAReady();
  if (!applied) {
    const m = migrationFilePresent();
    if (m.present) {
      throw new Error(
        `F-A4 PR-1a FALSE-GREEN NET: the measurement-layer migration IS in this repo (${m.names.join(", ")}) but is NOT applied to this database. `
        + (m.numbered
          ? "It is numbered, so the runner should have applied it -- run `pnpm db:migrate` before this battery."
          : "IT IS STILL UNNUMBERED: scripts/migrate.mjs selects on /^\\d+.*\\.sql$/ and skips anything else WITHOUT a warning, so this file was never applied. Claim its number before opening the PR.")
        + " This battery REFUSES to skip: a migration that shipped and a battery that skipped are two absences that would multiply into a green.");
    }
    noteLane("F-A4 PR-1a (Window A) not applied and its migration is not in this repo -- battery skipped");
    return;
  }
  world = await wb.buildWaveBWorld();
  const today = await bookToday();               // the DB's OWN clock (MYT), the one the gate reads
  thisYear = Number(String(today).slice(0, 4));
  lastYear = thisYear - 1;
  await installReferenceBody();
});

after(async () => {
  if (applied) { try { await rootQuery(`drop function if exists ${PREV_FN}`); } catch { /* rig teardown */ } }
  printLaneNotes("f-a4-pr1a-measurement");
  printSkipCount("f-a4-pr1a-measurement");
  await endPool();
});

function gate(t) {
  if (!ready || !has56) { markSkip(); t.skip("0056 (close model) not present"); return true; }
  if (!applied) { markSkip(); t.skip("F-A4 PR-1a (Window A) not applied"); return true; }
  return false;
}

/** Re-measure a gate WITHOUT recording anything, through the production measurement body, and
 *  return its digest exactly as _evaluate_one_gate would compute it. */
async function freshDigest(client, fy, key) {
  const r = await rootQuery(
    `select m ->> 'state' as state,
            case when (m ->> 'measured_present')::boolean then m -> 'measured' end as measured,
            md5(coalesce(case when (m ->> 'measured_present')::boolean then m -> 'measured' end,
                         '{}'::jsonb)::text) as digest
       from (select clara._measure_one_gate($3, $1, $2) as m) s`, [client, fy, key]);
  return r.rows[0];
}

/** The SAME question asked of the leaf evaluator directly -- neither reading derived from the
 *  other. Used to prove the extraction is transparent rather than merely self-consistent. */
async function leafDigest(client, fy, fn) {
  const r = await rootQuery(
    `select md5(coalesce(${fn}($1, $2), '{}'::jsonb)::text) as digest, ${fn}($1, $2) as measured`,
    [client, fy]);
  return r.rows[0];
}

const firmOfClient = async (client) =>
  (await rootQuery("select firm_id from clara.clients where id=$1", [client])).rows[0].firm_id;

// =====================================================================================
// CENSUS C15 -- the catalog is FOURTEEN rows and the fourteenth is the one PR-1a added.
// =====================================================================================
test("f-a4.pr1a.C15 census: the gate catalog carries the thirteen pre-existing checks plus undated_documents as the ADDED drawer-2 key -- every pre-existing key still present, named individually", async (t) => {
  if (gate(t)) return;
  // Q-D6's close-seal wall adds a FIFTEENTH row in drawer 1. Its migration ships UNNUMBERED
  // and migrate.mjs skips it by filename until the number is claimed (裁-108), so the roster
  // this cell expects is chosen by a LIVE CATALOG witness -- and it is still an EXACT roster
  // on both branches, never a relaxed superset.
  const qd6 = await hasQd6Wall();
  const rows = (await rootQuery(
    "select check_key, drawer, title, evaluator_fn, applies_when from clara.close_gate_checks order by check_key")).rows;
  assert.equal(rows.length, qd6 ? 15 : 14, "census C15: the catalog is fourteen rows, fifteen once Q-D6 lands");
  const keys = rows.map((r) => r.check_key);
  for (const k of PRE_KEYS) {
    assert.ok(keys.includes(k), `the pre-existing key ${k} survives PR-1a -- the catalog is append-only and nothing may be lost`);
  }
  assert.deepEqual([...keys].sort(), [...PRE_KEYS, NEW_KEY, ...(qd6 ? [QD6_GATE_KEY] : [])].sort(),
    "the catalog is EXACTLY the thirteen pre-existing keys plus undated_documents (plus Q-D6's wall once applied) -- no other key arrived");
  assert.equal(rows.filter((r) => r.drawer === 1).length, qd6 ? 7 : 6,
    "six drawer-1 identities, seven once Q-D6's close-seal wall lands");
  assert.equal(rows.filter((r) => r.drawer === 2).length, 6, "drawer 2 grows from five to six");
  assert.equal(rows.filter((r) => r.drawer === 3).length, 2, "two drawer-3 advisory checks, unmoved");
  const nu = rows.find((r) => r.check_key === NEW_KEY);
  assert.equal(nu.drawer, 2, "the undated gate is DRAWER 2 -- attestable per item, never an absolute drawer-1 block (OQ-3)");
  assert.equal(nu.applies_when, "always", "an undated filing is possible for every client, not only a goods trader");
  assert.equal(nu.evaluator_fn, "clara._close_gate_undated");
  const resolves = (await rootQuery(
    "select to_regprocedure($1 || '(uuid,uuid)') is not null as ok", [nu.evaluator_fn])).rows[0].ok;
  assert.equal(resolves, true, "the catalog's evaluator_fn names a function that actually exists");

  // THE DATED GATE'S SHIPPED TITLE IS UNTOUCHED -- D-18's whole reason for a new row. If the
  // repair had widened uncoded_documents, this title would now be a lie AND uncorrectable.
  const dated = rows.find((r) => r.check_key === "uncoded_documents");
  assert.equal(dated.title, "No FY-dated filings without an entry",
    "uncoded_documents keeps its shipped title -- the catalog is append-only, so a widened population would have made it permanently false");
});

test("f-a4.pr1a.net the false-green net can SEE its own migration -- the positive control without which the net's silence would mean nothing", async (t) => {
  if (gate(t)) return;
  const m = migrationFilePresent();
  assert.equal(m.present, true,
    "the measurement-layer migration is on disk under the stem this battery watches. A net that cannot find its own migration would report 'nothing to check' forever, and every future rename would pass it silently -- so the net's INPUT is asserted, not assumed");
  assert.ok(m.names.length >= 1, `found: ${m.names.join(", ")}`);
});

test("f-a4.pr1a.C15b the catalog is still APPEND-ONLY after PR-1a's insert -- the fourteenth row can no more be edited than the first", async (t) => {
  if (gate(t)) return;
  const upd = await caught(() => rootQuery(
    "update clara.close_gate_checks set title='moved' where check_key=$1", [NEW_KEY]));
  assert.ok(upd, "an UPDATE on the catalog must refuse");
  assert.match(upd.message, /append-only/i, `expected the append-only refusal (got ${upd.message})`);
  const del = await caught(() => rootQuery(
    "delete from clara.close_gate_checks where check_key=$1", [NEW_KEY]));
  assert.ok(del, "a DELETE on the catalog must refuse");
  assert.match(del.message, /append-only/i, `expected the append-only refusal (got ${del.message})`);
  const still = (await rootQuery("select count(*)::int as n from clara.close_gate_checks")).rows[0].n;
  assert.equal(still, (await hasQd6Wall()) ? 15 : 14, "and the catalog is untouched by the two refusals");
});

// =====================================================================================
// A-3 -- DIGEST EQUIVALENCE ACROSS THE `_measure_one_gate` EXTRACTION.
// =====================================================================================
test("f-a4.pr1a.A-3 digest equivalence: on one fixture close over one set of facts, the THIRTEEN pre-existing measured_digest values are byte-identical between the pre-migration body and the recut one, and undated_documents is an ADDED key the old engine could not measure at all", async (t) => {
  if (gate(t)) return;
  const owner = world.users.alice, prep = world.users.bob;

  // (1) THE REFERENCE IS THE PRE-IMAGE, proven by hash and not by the name it was found under.
  const refSha = (await rootQuery(
    `select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') as sha
       from pg_proc p where p.oid = '${PREV_FN}'::regprocedure`)).rows[0].sha;
  assert.equal(refSha, EOG_PRE_SHA,
    "the reference body sliced out of 0056 hashes to the prosrc sha256 the migration pinned as the PRE-migration _evaluate_one_gate -- without this the comparison below would be against a lookalike");
  const liveSha = (await rootQuery(
    `select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') as sha
       from pg_proc p where p.oid = 'clara._evaluate_one_gate(uuid,text)'::regprocedure`)).rows[0].sha;
  assert.notEqual(liveSha, EOG_PRE_SHA,
    "and the LIVE body is genuinely different -- otherwise this cell would be comparing a body with itself and could never fail");

  // (2) ONE fixture close, measured by the NEW path.
  const fx = await cleanCloseableFY(owner, { tag: "fa4a3", prepSub: prep, startsOn: `${thisYear}-01-01` });
  const begun = await beginClose(owner, { fy: fx.fy });
  const now = new Map((begun.gates ?? []).map((g) => [g.check_key, g]));
  assert.equal(now.size, (await hasQd6Wall()) ? 15 : 14, "the recut engine measured EVERY catalog row");

  // (3) THE SAME facts, measured by the PRE-migration body -- THROUGH THE SAME HUMAN SESSION
  // that ran begin_close. That is not a formality: `clara.fa_register_tie` (the
  // fa_register_tie_view evaluator) opens `_human_ctx(viewer)` as its FIRST act, so measured
  // from a session with no authenticated actor it raises CLR04 and the gate records `error`.
  // Comparing a human-session reading against a root-session one would have "found" a
  // difference the extraction did not cause -- measure with the instrument production uses.
  // It appends its own result rows to the same run (close_gate_results is append-only), so
  // nothing is overwritten and both measurements survive in the record.
  const mismatched = [];
  for (const key of PRE_KEYS) {
    const prev = (await humanQuery(owner,
      `select clara._f_a4_eog_prev($1, $2) as r`, [begun.close_run_id, key])).rows[0].r;
    if (prev.measured_digest !== now.get(key).measured_digest) {
      mismatched.push(`${key}: pre=${prev.measured_digest} post=${now.get(key).measured_digest}`);
    }
    assert.equal(prev.state, now.get(key).state,
      `${key}: the DERIVED state must also survive the extraction (the v_state case moved with the dispatch)`);
  }
  assert.deepEqual(mismatched, [],
    "every one of the thirteen pre-existing measured_digest values is byte-identical across the extraction -- a moved digest would silently invalidate every signed attestation in the estate");
  // THE POSITIVE CONTROL ON THE SESSION POSTURE. If the human context had been absent, the
  // human-context-dependent gate would have read `error` on BOTH sides and the loop above
  // would have compared two error payloads and called them equal -- a green with no meaning.
  assert.equal(now.get("fa_register_tie_view").state, "advisory",
    "the human-context gate genuinely measured (advisory, drawer 3) -- so the thirteen comparisons above were taken under a real posture, not two matching failures");

  // (4) THE FOURTEENTH KEY IS ADDED, never "fourteen equal fourteen" (which would be vacuous).
  assert.ok(now.has(NEW_KEY), "the recut engine measures the new key");
  const prevNew = (await humanQuery(owner,
    `select clara._f_a4_eog_prev($1, $2) as r`, [begun.close_run_id, NEW_KEY])).rows[0].r;
  assert.equal(prevNew.state, "error",
    "the PRE-migration engine could not measure undated_documents at all -- it falls to the no_evaluator_wired arm");
  assert.equal(prevNew.measured.reason, "no_evaluator_wired",
    "and says exactly why: the old dispatch had no arm for this key. This is F3's engine-side reproduction.");
  assert.notEqual(now.get(NEW_KEY).measured_digest, prevNew.measured_digest,
    "so the added key's digest is genuinely new, not inherited");

  // (5) TRANSPARENCY, checked against the LEAF evaluator -- a third independent reading.
  const leaf = await leafDigest(fx.client, fx.fy, "clara._close_gate_uncoded");
  assert.equal(now.get("uncoded_documents").measured_digest, leaf.digest,
    "the digest _evaluate_one_gate recorded equals md5 over what the leaf evaluator itself returns -- the extraction adds no transformation on the way through");
});

// =====================================================================================
// A-4 -- F3 REPRODUCED THEN REPAIRED.
// =====================================================================================
test("f-a4.pr1a.A-4 F3 reproduced then repaired: a live filing with financial_date IS NULL, filed inside the FY and carrying no entry, is invisible to EVERY pre-migration gate (uncoded_documents reads pass) -- and post-migration the NEW undated_documents gate reads unknown with that filing as its own item, while uncoded_documents STILL reads pass", async (t) => {
  if (gate(t)) return;
  const owner = world.users.alice, prep = world.users.bob;
  const fx = await cleanCloseableFY(owner, { tag: "fa4a4", prepSub: prep, startsOn: `${thisYear}-01-01` });
  const firm = await firmOfClient(fx.client);

  // THE DEFECT'S OWN SHAPE: filed, live, no financial_date, no coding entry.
  const undated = await filedDocument(prep, { firm, client: fx.client });   // financialDate defaults to NULL
  const row = (await rootQuery(
    `select d.financial_date, f.retired_at, (f.filed_at at time zone 'Asia/Kuala_Lumpur')::date as filed_on
       from clara.document_filings f join clara.documents d on d.id = f.document_id
      where f.id = $1`, [undated.filingId])).rows[0];
  assert.equal(row.financial_date, null, "mandatory setup: the document carries NO financial date");
  assert.equal(row.retired_at, null, "mandatory setup: the filing is live");
  const endsOn = (await rootQuery("select ends_on from clara.fiscal_years where id=$1", [fx.fy])).rows[0].ends_on;
  // node-postgres materializes a `date` column as a JS Date at LOCAL midnight, so neither
  // Date<=string (NaN, always false) nor String(Date) (weekday-name lexicographic — the shape
  // that failed every Tuesday and Wednesday) compares calendar dates; and toISOString() would
  // shift a day on any runner east of UTC. Local components are how node-pg materialized it.
  const localIsoDate = (d) => d instanceof Date
    ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
    : String(d).slice(0, 10);
  assert.ok(localIsoDate(row.filed_on) <= localIsoDate(endsOn),
    `mandatory setup: the filing date (${localIsoDate(row.filed_on)}) is inside the FY's filed_at bound (ends_on ${localIsoDate(endsOn)})`);

  const begun = await beginClose(owner, { fy: fx.fy });
  const g = await latestGates(begun.close_run_id);

  // (1) THE PRE-MIGRATION VERDICT, taken from the pre-migration body itself. Every one of the
  // thirteen old gates is asked, and NONE of them mentions this filing anywhere in its
  // payload -- invisibility is proven by looking at all thirteen, never by checking one.
  // Through the SAME human session begin_close used -- see A-3's note: one gate opens
  // `_human_ctx` and a root session would make it read `error`, turning "did not mention the
  // filing" into a vacuous pass on that row.
  let measuredRows = 0;
  for (const key of PRE_KEYS) {
    const prev = (await humanQuery(owner, `select clara._f_a4_eog_prev($1,$2) as r`, [begun.close_run_id, key])).rows[0].r;
    if (prev.state !== "error") measuredRows += 1;
    assert.equal(JSON.stringify(prev.measured ?? {}).includes(undated.filingId), false,
      `${key}: the pre-migration engine's payload must not mention the undated filing -- that invisibility IS F3`);
  }
  assert.equal(measuredRows, PRE_KEYS.length,
    "all thirteen pre-migration gates genuinely EVALUATED -- an `error` row would have hidden the filing for the wrong reason");
  const prevUncoded = (await humanQuery(owner,
    `select clara._f_a4_eog_prev($1,'uncoded_documents') as r`, [begun.close_run_id])).rows[0].r;
  assert.equal(prevUncoded.state, "pass",
    "the dated gate PASSES on a client whose only outstanding document is undated -- a gate that passes because it cannot see is not a gate (law 31)");

  // (2) THE REPAIR: its OWN gate, reading unknown, with the filing as its own item.
  assert.equal(g.get(NEW_KEY).state, "unknown",
    "the new gate reads UNKNOWN -- never `fail`, because the gate genuinely cannot place the document in a year, and never `pass`");
  assert.equal(g.get(NEW_KEY).measured.undated_count, 1);
  assert.deepEqual(g.get(NEW_KEY).measured.undated.map((x) => x.filing_id), [undated.filingId]);
  const items = (await rootQuery(
    "select clara._gate_outstanding_items($1, $2) as items", [NEW_KEY, g.get(NEW_KEY).measured])).rows[0].items;
  assert.deepEqual(items, [undated.filingId],
    "the filing is its OWN item under the new key -- keyed by filing_id exactly as the uncoded branch is");

  // (3) AND THE DATED GATE DID NOT MOVE A WORD.
  assert.equal(g.get("uncoded_documents").state, "pass",
    "uncoded_documents STILL reads pass post-migration -- D-18 did not widen the dated population");
  assert.equal(g.get("uncoded_documents").measured_digest, prevUncoded.measured_digest,
    "and its digest is byte-identical to the pre-migration body's on the same facts");

  // (4) DRAWER 2 MEANS THE CLOSE REFUSES, ATTESTABLY -- unknown is admitted exactly like fail.
  const err = await caught(() => finalizeClose(owner, { fy: fx.fy }));
  assert.ok(err, "finalize must refuse while the undated item carries no attestation");
  assert.equal(err.code, "CLR41", `expected CLR41 (got ${err.code} -- ${err.message})`);
  assert.equal(detailOf(err).reason, "drawer2_unattested");
  assert.equal(detailOf(err).check_key, NEW_KEY);
});

// =====================================================================================
// A-5 -- THE NEW GATE STAYS ATTESTABLE, AND ITS ATTESTATION GOES STALE HONESTLY.
// =====================================================================================
test("f-a4.pr1a.A-5 the new gate is attestable per item: attesting the undated item makes get_close_readiness read attested=true; moving the undated population makes that attestation read stale and finalize_close raise close_attestation_stale", async (t) => {
  if (gate(t)) return;
  const owner = world.users.alice, prep = world.users.bob;
  const fx = await cleanCloseableFY(owner, { tag: "fa4a5", prepSub: prep, startsOn: `${thisYear}-01-01` });
  const firm = await firmOfClient(fx.client);
  const doc1 = await filedDocument(prep, { firm, client: fx.client });

  const begun = await beginClose(owner, { fy: fx.fy });
  const g0 = await latestGates(begun.close_run_id);
  assert.equal(g0.get(NEW_KEY).state, "unknown", "mandatory setup: the gate is outstanding");

  // A BLANKET attestation must refuse -- the gate is itemized, which is the whole point of
  // A1-2. Without the new arm this call would have SUCCEEDED and signed away an unbounded set.
  const blanket = await caught(() => attestClose(owner, {
    closeRun: begun.close_run_id, checkKey: NEW_KEY, reason: "f-a4 a5: blanket attempt", itemKey: null }));
  assert.ok(blanket, "a blanket attestation on an itemized gate must refuse");
  assert.equal(detailOf(blanket).reason, "attest_item_required",
    "the refusal names the itemized shape -- proof the new _gate_outstanding_items arm is what the door reads");

  const att1 = await attestClose(owner, {
    closeRun: begun.close_run_id, checkKey: NEW_KEY,
    reason: "f-a4 a5: this letter carries no date on its face; accepted as an evidence gap", itemKey: doc1.filingId });
  assert.ok(att1.measured_digest, "the attestation binds a real digest");
  assert.equal(att1.item_key, doc1.filingId);

  const readiness = await getCloseReadiness(owner, { client: fx.client, fy: fx.fy });
  const rg = readiness.gates.find((x) => x.check_key === NEW_KEY);
  assert.equal(rg.attested, true, "get_close_readiness reads the undated gate as attested with no change to its own body");

  // MOVE THE POPULATION: a second undated filing, DURING the close window. document_filings is
  // not period-wall covered, which is why this is the estate's standard moved-fact fixture.
  const doc2 = await filedDocument(prep, { firm, client: fx.client });
  const rg2 = (await getCloseReadiness(owner, { client: fx.client, fy: fx.fy })).gates.find((x) => x.check_key === NEW_KEY);
  assert.equal(rg2.attested, true,
    "readiness still reads the RECORDED row (the digest has not been re-measured yet) -- stated so the next assertion is not mistaken for a contradiction");

  const err = await caught(() => finalizeClose(owner, { fy: fx.fy }));
  assert.ok(err, "finalize re-measures in-transaction and must refuse");
  assert.equal(detailOf(err).reason, "close_attestation_stale",
    "the attestation signed a state that has since moved -- the digest-staleness rule needed no change for the new gate");
  assert.equal(detailOf(err).attested_digest, att1.measured_digest);
  assert.notEqual(detailOf(err).fresh_digest, att1.measured_digest);
  assert.deepEqual([...detailOf(err).missing_or_stale_items].sort(), [doc1.filingId, doc2.filingId].sort(),
    "and it names BOTH filings by filing_id -- per-item, through the new arm");

  // RECOVERY: re-attest each item fresh, then the close completes. An evidence gap a
  // professional accepts in writing is exactly what drawer 2 is for (OQ-3).
  await attestClose(owner, { closeRun: begun.close_run_id, checkKey: NEW_KEY, reason: "f-a4 a5: re-accepted, item 1", itemKey: doc1.filingId });
  await attestClose(owner, { closeRun: begun.close_run_id, checkKey: NEW_KEY, reason: "f-a4 a5: accepted, item 2", itemKey: doc2.filingId });
  const closed = await finalizeClose(owner, { fy: fx.fy });
  assert.ok(closed?.receipt_id, "the close completes once every undated item carries a live attestation at the fresh digest");
});

// =====================================================================================
// A-11 -- DIGEST INDEPENDENCE, BOTH WAYS (D-18).
// =====================================================================================
test("f-a4.pr1a.A-11 digest independence: with the dated uncoded_documents gate attested, filing a NEW undated document leaves uncoded_documents' measured_digest byte-identical and its attestation live -- only undated_documents' digest moves", async (t) => {
  if (gate(t)) return;
  const owner = world.users.alice, prep = world.users.bob;
  const fx = await cleanCloseableFY(owner, { tag: "fa4a11", prepSub: prep, startsOn: `${thisYear}-01-01` });
  const firm = await firmOfClient(fx.client);

  // A DATED, uncoded filing -- the population the professional is about to sign for.
  const dated = await filedDocument(prep, { firm, client: fx.client, financialDate: addDaysStr(fx.startsOn, 12) });
  const begun = await beginClose(owner, { fy: fx.fy });
  const g0 = await latestGates(begun.close_run_id);
  assert.equal(g0.get("uncoded_documents").state, "fail", "mandatory setup: the dated gate is outstanding");
  assert.equal(g0.get(NEW_KEY).state, "pass", "mandatory setup: no undated filing exists yet");
  const datedDigest0 = g0.get("uncoded_documents").measured_digest;
  const undatedDigest0 = g0.get(NEW_KEY).measured_digest;

  const att = await attestClose(owner, {
    closeRun: begun.close_run_id, checkKey: "uncoded_documents",
    reason: "f-a4 a11: the dated document is a duplicate of one already coded", itemKey: dated.filingId });
  assert.equal(att.measured_digest, datedDigest0, "the attestation binds the dated gate's digest");

  // THE MOVE: a NEW undated document inside the filed_at bound.
  const undated = await filedDocument(prep, { firm, client: fx.client });

  const datedNow = await freshDigest(fx.client, fx.fy, "uncoded_documents");
  const undatedNow = await freshDigest(fx.client, fx.fy, NEW_KEY);
  assert.equal(datedNow.digest, datedDigest0,
    "the DATED gate's measured_digest is BYTE-IDENTICAL -- a new undated filing cannot churn a signed statement about the dated set (D-18)");
  assert.notEqual(undatedNow.digest, undatedDigest0, "only the UNDATED gate's digest moved");
  assert.equal(undatedNow.state, "unknown");
  assert.deepEqual(undatedNow.measured.undated.map((x) => x.filing_id), [undated.filingId],
    "and it moved because of THAT filing -- the digest change is attributed, never just observed");
  // Independently confirmed against the leaf evaluator -- two readings, neither derived from
  // the other, because "the digest did not move" is the claim D-18 exists to make.
  const leaf = await leafDigest(fx.client, fx.fy, "clara._close_gate_uncoded");
  assert.equal(leaf.digest, datedDigest0, "and the leaf evaluator agrees the dated payload is unchanged");

  const rg = (await getCloseReadiness(owner, { client: fx.client, fy: fx.fy })).gates.find((x) => x.check_key === "uncoded_documents");
  assert.equal(rg.attested, true, "the dated attestation is STILL LIVE -- nobody has to re-sign it");

  // AND THE CLOSE REFUSES ONLY ON THE NEW GATE -- the dated one is settled.
  const err = await caught(() => finalizeClose(owner, { fy: fx.fy }));
  assert.ok(err, "finalize refuses while the undated item is unattested");
  assert.equal(detailOf(err).check_key, NEW_KEY,
    "and it names the UNDATED gate, not the dated one the professional already signed");
});

test("f-a4.pr1a.A-11b the twin: a document filed AFTER fy.ends_on moves NEITHER digest -- the filed_at bound is what stops cross-year re-attestation churn", async (t) => {
  if (gate(t)) return;
  const owner = world.users.alice, prep = world.users.bob;
  // A year that has ALREADY ENDED on the DB's own clock, so a filing made now is necessarily
  // filed after ends_on. Derived from clara._book_today(), never from a hardcoded year.
  const fx = await cleanCloseableFY(owner, { tag: "fa4a11b", prepSub: prep, startsOn: `${lastYear}-01-01` });
  const firm = await firmOfClient(fx.client);
  const endsOn = String((await rootQuery("select ends_on::text as e from clara.fiscal_years where id=$1", [fx.fy])).rows[0].e);
  const today = String(await bookToday()).slice(0, 10);
  assert.ok(endsOn < today, `mandatory setup: the fixture year (${endsOn}) ended before today (${today})`);

  const begun = await beginClose(owner, { fy: fx.fy });
  const g0 = await latestGates(begun.close_run_id);
  const datedDigest0 = g0.get("uncoded_documents").measured_digest;
  const undatedDigest0 = g0.get(NEW_KEY).measured_digest;
  assert.equal(g0.get(NEW_KEY).state, "pass", "mandatory setup: nothing outstanding on the new gate");

  const out = await filedDocument(prep, { firm, client: fx.client });   // undated, filed TODAY
  const filedOn = String((await rootQuery(
    "select (filed_at at time zone 'Asia/Kuala_Lumpur')::date::text as d from clara.document_filings where id=$1",
    [out.filingId])).rows[0].d);
  assert.ok(filedOn > endsOn, `mandatory setup: the filing (${filedOn}) is outside the bound (${endsOn})`);

  assert.equal((await freshDigest(fx.client, fx.fy, NEW_KEY)).digest, undatedDigest0,
    "the UNDATED gate's digest does not move -- a letter filed next year for a year nobody is closing cannot churn this year's digest");
  assert.equal((await freshDigest(fx.client, fx.fy, "uncoded_documents")).digest, datedDigest0,
    "and the dated gate's digest does not move either");

  // The residual is RECORDED, not hidden: the document is genuinely outside the population,
  // and OQ-8 was ruled OFF-DIGEST (R-L13) -- it is reported as a plan-level count, never as a
  // digest input. This cell pins that ruling behaviourally.
  const measured = (await freshDigest(fx.client, fx.fy, NEW_KEY)).measured;
  assert.equal(measured.undated_count, 0, "the out-of-bound filing is not in the payload");
  assert.equal(JSON.stringify(measured).includes(out.filingId), false, "and therefore not in the digest");
});

// =====================================================================================
// THE DRY-RUN CORE -- readiness measured without arming the wall (design SS3.5).
// =====================================================================================
test("f-a4.pr1a.dry-run clara._close_dry_run_core measures all fourteen gates on an OPEN year, records nothing, locks nothing, leaves fiscal_years.status untouched -- and reports the two in-body drawer-1 checks as not_measurable_before_finalize instead of the literal pass a recorded run stores", async (t) => {
  if (gate(t)) return;
  const owner = world.users.alice, prep = world.users.bob;
  const fx = await cleanCloseableFY(owner, { tag: "fa4dry", prepSub: prep, startsOn: `${thisYear}-01-01` });

  const before = (await rootQuery(
    `select count(*)::int as n from clara.close_gate_results r
       join clara.close_runs cr on cr.id = r.close_run_id where cr.fiscal_year_id = $1`, [fx.fy])).rows[0].n;
  const runsBefore = (await rootQuery("select count(*)::int as n from clara.close_runs where fiscal_year_id=$1", [fx.fy])).rows[0].n;

  const dry = (await rootQuery("select clara._close_dry_run_core($1,$2) as r", [fx.client, fx.fy])).rows[0].r;
  assert.equal(dry.dry_run, true);
  const qd6 = await hasQd6Wall();
  assert.equal(dry.checks.length, qd6 ? 15 : 14, "the dry run measures the whole catalog, applies_when included");
  const byKey = new Map(dry.checks.map((c) => [c.check_key, c]));
  assert.deepEqual([...byKey.keys()].sort(), [...PRE_KEYS, NEW_KEY, ...(qd6 ? [QD6_GATE_KEY] : [])].sort());

  // NOTHING WAS ARMED AND NOTHING WAS RECORDED.
  assert.equal(await fyStatus(fx.fy), "open", "fiscal_years.status is untouched -- no CLR19 was armed");
  assert.equal((await rootQuery("select count(*)::int as n from clara.close_runs where fiscal_year_id=$1", [fx.fy])).rows[0].n,
    runsBefore, "no close run was created");
  assert.equal((await rootQuery(
    `select count(*)::int as n from clara.close_gate_results r
       join clara.close_runs cr on cr.id = r.close_run_id where cr.fiscal_year_id = $1`, [fx.fy])).rows[0].n,
    before, "no gate result row was inserted");
  // The wall is genuinely NOT armed: an ordinary approved entry inside the FY still succeeds.
  const okEntry = await plainEntry(prep, {
    client: fx.client, debit: BANK1, credit: REVN, cents: 1000,
    postingDate: addDaysStr(fx.startsOn, 120), memo: "f-a4 dry-run: the wall is not armed" });
  assert.ok(okEntry, "an FY-dated entry still posts after a dry run -- measurement did not freeze the year");

  // THE HONEST LIMIT (risk R-6): the two checks computed inside finalize_close.
  for (const k of ["pl_retained_earnings_roll", "opening_continuity_tie"]) {
    assert.equal(byKey.get(k).state, "not_measurable_before_finalize",
      `${k} is computed in finalize_close, so a dry run reports it unmeasurable -- reporting the literal 'pass' would be the vacuous-green class this item exists to fix`);
    assert.equal(byKey.get(k).measured.state, "not_measurable_before_finalize", "the payload says the same thing the row does");
    assert.ok(byKey.get(k).measured.note, "and the live body's own note is preserved rather than discarded");
  }
  // A RECORDED run still stores the literal pass for those two -- that is what the shipped
  // digests were computed over, and the dry run's override must not have leaked into it.
  const begun = await beginClose(owner, { fy: fx.fy });
  const g = await latestGates(begun.close_run_id);
  for (const k of ["pl_retained_earnings_roll", "opening_continuity_tie"]) {
    assert.equal(g.get(k).state, "pass", `${k} is still recorded as 'pass' by _evaluate_one_gate -- the override lives only in the dry-run core`);
  }

  // ONE MEASUREMENT BODY, TWO ENTRANCES (TA-P11): for every gate the dry run did not override,
  // its digest equals the digest the recorded run stored on the same facts.
  //
  // EXCEPT ONE, AND THE EXCEPTION IS A MEASURED FINDING RATHER THAN A TOLERANCE. `fa_register_
  // tie_view`'s evaluator, clara.fa_register_tie, opens `_human_ctx(viewer)` as its FIRST act
  // (the only one of the fourteen that does -- measured, see the cell below). A dry run
  // reached from any session WITHOUT an authenticated human -- this rig's root session today,
  // and PR-1c's `wake_dry_run_close_readiness` wrapper tomorrow -- therefore records `error`
  // for it. It is EXCLUDED by name and then asserted positively below; a wildcard tolerance
  // would let a second gate drift in silently.
  const HUMAN_CTX_GATE = "fa_register_tie_view";
  const drift = [];
  for (const k of PRE_KEYS.concat(NEW_KEY)) {
    if (k === "pl_retained_earnings_roll" || k === "opening_continuity_tie" || k === HUMAN_CTX_GATE) continue;
    if (byKey.get(k).measured_digest !== g.get(k).measured_digest) {
      drift.push(`${k}: dry=${byKey.get(k).measured_digest} recorded=${g.get(k).measured_digest}`);
    }
  }
  assert.deepEqual(drift, [],
    "the dry run and the recorded run agree gate for gate -- a separately-written preview evaluator would be a second reading of one measurement (D-03)");
  // The excluded one, stated: what it reads, why, and that it cannot block anything.
  assert.equal(byKey.get(HUMAN_CTX_GATE).state, "error",
    "off a human session the fa_register_tie_view gate reads ERROR, never a fabricated pass");
  assert.equal(byKey.get(HUMAN_CTX_GATE).measured.sqlstate, "CLR04");
  assert.equal(byKey.get(HUMAN_CTX_GATE).measured.message, "no authenticated actor");
  assert.equal(g.get(HUMAN_CTX_GATE).drawer, 3,
    "and it is DRAWER 3 -- advisory. An error here refuses nothing: drawer 3 carries no admission power and design §3.2's rung B3 tests only the measurable drawer-1 set");
});

test("f-a4.pr1a.human-ctx-census EXACTLY ONE gate evaluator in the whole catalog opens a human context, and it is the drawer-3 advisory one -- the closed-world read that makes the dry run's single divergence a named fact rather than a tolerance", async (t) => {
  if (gate(t)) return;
  // A CLOSED-WORLD CENSUS, read off the catalog: every evaluator the dispatch can reach is
  // asked whether its body opens `_human_ctx`. If a future gate joins that set, THIS cell
  // fails and the dry run's exclusion list has to be re-derived deliberately -- extend, never
  // weaken. The list of evaluators is taken from the catalog, so a fifteenth row is included
  // automatically rather than being silently outside the census.
  // NOTE the shape: `evaluator_fn` is a free-text documentation column, and two rows hold a
  // LABEL rather than a function name ("finalize_close (in-body)"). Feeding those to
  // to_regprocedure raises a syntax error rather than returning NULL, so the resolution is
  // done by proname against pg_proc -- signature-agnostic, and it cannot raise on a label.
  const qd6 = await hasQd6Wall();
  const catalog = (await rootQuery(
    "select check_key, drawer, evaluator_fn from clara.close_gate_checks order by check_key")).rows;
  assert.equal(catalog.length, qd6 ? 15 : 14, "the census covers the whole catalog");
  const bodies = new Map((await rootQuery(
    `select p.proname, bool_or(position('_human_ctx' in p.prosrc) > 0) as opens
       from pg_proc p where p.pronamespace = 'clara'::regnamespace group by p.proname`
  )).rows.map((r) => [r.proname, r.opens]));
  const rows = catalog.map((r) => ({
    ...r,
    resolved: r.evaluator_fn.startsWith("clara.") && bodies.has(r.evaluator_fn.slice(6)),
    opens_human_ctx: r.evaluator_fn.startsWith("clara.") && bodies.get(r.evaluator_fn.slice(6)) === true,
  }));
  assert.equal(rows.filter((r) => r.resolved).length, qd6 ? 13 : 12,
    "every catalog row but the two in-body labels names a real evaluator function -- twelve of fourteen, thirteen of fifteen once Q-D6's wall lands");
  const needsHuman = rows.filter((r) => r.opens_human_ctx).map((r) => r.check_key);
  assert.deepEqual(needsHuman, ["fa_register_tie_view"],
    "exactly one gate evaluator opens a human context. If this list grew, a dry run from the wake lane would start reading `error` on a gate the ladder DOES weigh, and design §3.5's honest-limit list would need re-cutting");
  assert.equal(rows.find((r) => r.check_key === "fa_register_tie_view").drawer, 3,
    "and it lives in drawer 3, where an error is advisory and blocks nothing");
  // The two in-body checks resolve to no function at all -- their evaluator_fn is a label
  // ("finalize_close (in-body)"), which is exactly why the dry run overrides them.
  assert.deepEqual(rows.filter((r) => !r.resolved).map((r) => r.check_key).sort(),
    ["opening_continuity_tie", "pl_retained_earnings_roll"],
    "and the only two rows naming no real function are the two computed inside finalize_close");
});

test("f-a4.pr1a.fail-closed the measurement layer fails CLOSED on the missing and the mismatched: a fiscal year that does not exist makes the undated gate read unknown (never pass), and the dry-run core refuses a client/fiscal-year pair that does not belong together", async (t) => {
  if (gate(t)) return;
  const owner = world.users.alice, prep = world.users.bob;
  const a = await cleanCloseableFY(owner, { tag: "fa4fc1", prepSub: prep, startsOn: `${thisYear}-01-01` });
  const b = await cleanCloseableFY(owner, { tag: "fa4fc2", prepSub: prep, startsOn: `${thisYear}-01-01` });

  // (1) A fiscal year that does not exist. Without the guard the bound `filed_on <= NULL` is
  // NULL for every candidate, the population is empty and the gate would answer PASS.
  const ghost = (await rootQuery("select gen_random_uuid() as u")).rows[0].u;
  const g = (await rootQuery("select clara._close_gate_undated($1,$2) as r", [a.client, ghost])).rows[0].r;
  assert.equal(g.state, "unknown", "a non-existent fiscal year yields UNKNOWN, never pass");
  assert.equal(g.reason, "fiscal_year_not_found", "and says exactly why");
  assert.equal(g.undated_count, 0);

  // (2) A mismatched (client, fiscal year) pair. The dry-run core takes the two as independent
  // arguments from a caller that has not yet been through Tier A, so it carries the rung.
  const err = await caught(() => rootQuery("select clara._close_dry_run_core($1,$2) as r", [a.client, b.fy]));
  assert.ok(err, "a mismatched pair must refuse rather than measure one client's books against another's year end");
  assert.equal(err.code, "CLR11", `expected CLR11 (got ${err.code} -- ${err.message})`);
  assert.equal(detailOf(err).reason, "fiscal_year_client_mismatch");
  const err2 = await caught(() => rootQuery("select clara._close_dry_run_core($1,$2) as r", [a.client, ghost]));
  assert.ok(err2, "and so must a fiscal year that does not exist");
  assert.equal(detailOf(err2).reason, "fiscal_year_not_in_firm");

  // (3) THE POSTURE of every body this PR ships: ungranted. A definer body reachable by an app
  // role would be a hole PR-1a has no business opening; grants ride their consumer's PR.
  const acl = (await rootQuery(`
    select p.oid::regprocedure::text as sig, coalesce(array_to_string(p.proacl,' '),'') as acl
      from pg_proc p
     where p.oid in ('clara._close_gate_undated(uuid,uuid)'::regprocedure,
                     'clara._measure_one_gate(text,uuid,uuid)'::regprocedure,
                     'clara._close_dry_run_core(uuid,uuid)'::regprocedure)
     order by 1`)).rows;
  assert.equal(acl.length, 3, "all three new bodies exist");
  for (const r of acl) {
    assert.ok(r.acl === "" || r.acl === "clara_fn_owner=X/clara_fn_owner",
      `${r.sig} carries an EXECUTE grant beyond its owner (${r.acl})`);
  }
});
