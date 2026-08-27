// The statutory-deadlines DDL train -- clara.statutory_deadlines, F-A4's ONE developer-seeded,
// versioned, effective-dated table for statutory due dates (R-L22; digest laws 80/81), and
// the table F-T2's payroll deadline calendar is blocked on (PR-1 seeds nine rows there, not
// this file). PROGRESS.md's F-A4 row still labels this "PR-1c" -- STALE: the actual F-A4/PR-1c
// (0138, #368) shipped the close agent limb. This is its own lane; see the migration's own
// header for the full provenance. Migration:
// packages/db/migrations/UNNUMBERED_statutory_deadlines.sql (numbered at merge).
//
// THIS FILE: sections A (closed-world census -- columns/constraints/triggers/index/RLS shape,
// re-derived independently of the migration's own tail), B (the ACL census, with a positive
// control) and E (immutability -- supersede-only, append-only, no-truncate). The CHECK-wall
// battery + the partial unique index live in the sibling statutory-deadlines-checks.test.mjs
// (same fixtures module, split only to stay under the file-size gate).

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { rootQuery, roleQuery, endPool, assertRaises, ROLES } from "./rig-fixtures.mjs";
import { tableApplied, inRolledBackTx, insertRow, reachCensus } from "./statutory-deadlines-fixtures.mjs";

let live = false;
before(async () => { live = await tableApplied(); });
after(async () => { await endPool(); });

const gate = (t) => {
  if (!live) { t.skip("clara.statutory_deadlines not applied -- migration not yet on this rig"); return true; }
  return false;
};

// ---------------------------------------------------------------------------------------
// A · closed-world census. This deliberately duplicates the migration's own S2 tail: the tail
// proves the migration built the shape on ITS OWN rig; this proves the shape SURVIVES on a rig
// that then ran every other later-numbered migration in the estate, independently re-derived.
// ---------------------------------------------------------------------------------------

test("sd-A1 · closed-world column census, in ordinal order", async (t) => {
  if (gate(t)) return;
  const r = await rootQuery(
    `select attname from pg_attribute where attrelid = 'clara.statutory_deadlines'::regclass
       and attnum > 0 and not attisdropped order by attnum`);
  assert.deepEqual(r.rows.map((x) => x.attname), [
    "id", "domain", "obligation_code", "authority", "cadence", "due_rule_kind", "due_day",
    "due_month", "wording", "instrument", "holiday_rule", "working_day_basis", "conflict",
    "source_url", "source_note", "source_accessed_on", "evidence_grade", "cite_role",
    "notice_lead_days", "effective_from", "effective_to", "superseded_by", "superseded_at",
    "recorded_by", "basis", "basis_kind", "recorded_at",
  ], "exactly the Annex A.1 column set, nothing more, nothing fewer, in order");
});

test("sd-A2 · constraint-name census, pinned by conname -- never counted", async (t) => {
  if (gate(t)) return;
  const r = await rootQuery(
    `select conname from pg_constraint where conrelid = 'clara.statutory_deadlines'::regclass order by conname`);
  assert.deepEqual(r.rows.map((x) => x.conname).sort(), [
    "ck_statutory_deadlines_basis_kind", "ck_statutory_deadlines_cadence",
    "ck_statutory_deadlines_cite_role", "ck_statutory_deadlines_domain",
    "ck_statutory_deadlines_due_day_range", "ck_statutory_deadlines_due_month_range",
    "ck_statutory_deadlines_due_params", "ck_statutory_deadlines_due_rule_kind",
    "ck_statutory_deadlines_effective_range", "ck_statutory_deadlines_evidence_grade",
    "ck_statutory_deadlines_holiday_rule", "ck_statutory_deadlines_supersession_paired",
    "statutory_deadlines_authority_check", "statutory_deadlines_basis_check",
    "statutory_deadlines_instrument_check", "statutory_deadlines_notice_lead_days_check",
    "statutory_deadlines_obligation_code_check", "statutory_deadlines_pkey",
    "statutory_deadlines_recorded_by_check", "statutory_deadlines_source_note_check",
    "statutory_deadlines_source_url_check", "statutory_deadlines_superseded_by_fkey",
    "statutory_deadlines_wording_check", "statutory_deadlines_working_day_basis_check",
  ].sort(), "exactly 24 named constraints -- 12 explicit ck_*, 10 auto column checks, the pkey, the self-fkey");
});

test("sd-A3 · trigger census, pinned by name", async (t) => {
  if (gate(t)) return;
  const r = await rootQuery(
    `select tgname from pg_trigger where tgrelid = 'clara.statutory_deadlines'::regclass
       and not tgisinternal order by tgname`);
  assert.deepEqual(r.rows.map((x) => x.tgname), [
    "t_statutory_deadlines_no_delete", "t_statutory_deadlines_no_truncate",
    "t_statutory_deadlines_supersede_only",
  ], "exactly three triggers, nothing more");
});

test("sd-A4 · the partial unique live-row index carries the exact predicate and key", async (t) => {
  if (gate(t)) return;
  const r = await rootQuery(
    `select indexdef from pg_indexes where schemaname = 'clara'
       and tablename = 'statutory_deadlines' and indexname = 'uq_statutory_deadlines_live'`);
  assert.equal(r.rowCount, 1);
  assert.match(r.rows[0].indexdef,
    /UNIQUE INDEX uq_statutory_deadlines_live ON clara\.statutory_deadlines USING btree \(domain, obligation_code, effective_from\) WHERE \(superseded_at IS NULL\)/);
});

test("sd-A5 · RLS forced + enabled, exactly one unconditional owner-only policy", async (t) => {
  if (gate(t)) return;
  const rls = await rootQuery(
    `select relrowsecurity, relforcerowsecurity, pg_get_userbyid(relowner) as owner
       from pg_class where oid = 'clara.statutory_deadlines'::regclass`);
  assert.equal(rls.rows[0].relrowsecurity, true);
  assert.equal(rls.rows[0].relforcerowsecurity, true);
  assert.equal(rls.rows[0].owner, "clara_fn_owner");

  const pol = await rootQuery(
    `select policyname, roles::text[] as roles, qual, with_check from pg_policies
       where schemaname = 'clara' and tablename = 'statutory_deadlines'`);
  assert.equal(pol.rowCount, 1, "exactly one policy");
  assert.equal(pol.rows[0].policyname, "p_statutory_deadlines_owner");
  assert.deepEqual(pol.rows[0].roles, ["clara_fn_owner"]);
  assert.equal(pol.rows[0].qual, "true");
  assert.equal(pol.rows[0].with_check, "true");
});

test("sd-A6 · the supersede-only trigger function is SECURITY DEFINER, owned by "
  + "clara_fn_owner, and PUBLIC cannot EXECUTE it", async (t) => {
    if (gate(t)) return;
    const fn = await rootQuery(
      `select p.prosecdef, pg_get_userbyid(p.proowner) as owner
         from pg_proc p where p.oid = 'clara._tf_statutory_deadlines_supersede_only()'::regprocedure`);
    assert.equal(fn.rowCount, 1);
    assert.equal(fn.rows[0].prosecdef, true);
    assert.equal(fn.rows[0].owner, "clara_fn_owner");
    const exec = await rootQuery(
      `select has_function_privilege('public', 'clara._tf_statutory_deadlines_supersede_only()', 'execute') as ok`);
    assert.equal(exec.rows[0].ok, false, "PUBLIC holds no EXECUTE on the trigger function");
  });

// ---------------------------------------------------------------------------------------
// B · THE ACL CENSUS -- no app role reaches the base table on any DML verb, with a positive
// control proving the census instrument can say YES, not just that it happened to say NO.
// ---------------------------------------------------------------------------------------

test("sd-B1 · THE ACL CENSUS -- zero app-role reach on any DML verb, and the census FLIPS "
  + "when one is granted (the instrument can say YES)", async (t) => {
    if (gate(t)) return;
    assert.deepEqual(await reachCensus(), [],
      "no clara_authenticated/agent/wake/runtime role holds select/insert/update/delete");

    await inRolledBackTx(async (client) => {
      await client.query(`grant select on clara.statutory_deadlines to ${ROLES.authenticated}`);
      const r = await client.query(
        "select has_table_privilege($1, 'clara.statutory_deadlines', 'select') as ok",
        [ROLES.authenticated]);
      assert.equal(r.rows[0].ok, true, "has_table_privilege DOES flip true under an injected grant");
    });
    assert.deepEqual(await reachCensus(), [], "the injected grant did not survive the cell");
  });

test("sd-B2 · even WITH a stray grant, FORCE RLS admits zero rows to clara_authenticated "
  + "(the owner policy names clara_fn_owner only)", async (t) => {
    if (gate(t)) return;
    await insertRow();
    await inRolledBackTx(async (client) => {
      await client.query(`grant select on clara.statutory_deadlines to ${ROLES.authenticated}`);
      await client.query(`set role ${ROLES.authenticated}`);
      const rows = await client.query("select * from clara.statutory_deadlines");
      assert.equal(rows.rowCount, 0,
        "FORCE RLS with only the clara_fn_owner policy admits ZERO rows even once granted");
    });
  });

// ---------------------------------------------------------------------------------------
// E · IMMUTABILITY -- the supersede-only trigger, append-only, no-truncate.
// ---------------------------------------------------------------------------------------

test("sd-E1 · any non-supersede column update is refused CLR10", async (t) => {
  if (gate(t)) return;
  const row = await insertRow();
  const id = row.rows[0].id;
  await assertRaises("CLR10",
    () => roleQuery(ROLES.fnOwner,
      "update clara.statutory_deadlines set wording = 'a different sentence' where id = $1", [id]),
    "updating wording outside a supersession stamp");
  await assertRaises("CLR10",
    () => roleQuery(ROLES.fnOwner,
      "update clara.statutory_deadlines set notice_lead_days = 99 where id = $1", [id]),
    "updating notice_lead_days outside a supersession stamp");
});

test("sd-E2 · a PARTIAL supersession stamp (only one of the pair) is refused", async (t) => {
  if (gate(t)) return;
  const row = await insertRow();
  const id = row.rows[0].id;
  await assert.rejects(
    () => roleQuery(ROLES.fnOwner,
      "update clara.statutory_deadlines set superseded_at = now() where id = $1", [id]),
  );
});

test("sd-E3 · THE ONE LAWFUL UPDATE: a full, paired supersession stamp succeeds", async (t) => {
  if (gate(t)) return;
  const pred = await insertRow();
  const predId = pred.rows[0].id;
  const succ = await insertRow();
  const succId = succ.rows[0].id;
  const upd = await roleQuery(ROLES.fnOwner,
    "update clara.statutory_deadlines set superseded_by = $1, superseded_at = now() "
    + "where id = $2 returning superseded_by, superseded_at", [succId, predId]);
  assert.equal(upd.rowCount, 1);
  assert.equal(upd.rows[0].superseded_by, succId);
  assert.ok(upd.rows[0].superseded_at);
});

test("sd-E4 · a row ALREADY superseded is immutable outright -- even a second, "
  + "otherwise-legitimate-shaped supersession stamp is refused CLR10", async (t) => {
    if (gate(t)) return;
    const pred = await insertRow();
    const predId = pred.rows[0].id;
    const succ1 = await insertRow();
    const succ2 = await insertRow();
    await roleQuery(ROLES.fnOwner,
      "update clara.statutory_deadlines set superseded_by = $1, superseded_at = now() where id = $2",
      [succ1.rows[0].id, predId]);
    await assertRaises("CLR10",
      () => roleQuery(ROLES.fnOwner,
        "update clara.statutory_deadlines set superseded_by = $1, superseded_at = now() where id = $2",
        [succ2.rows[0].id, predId]),
      "re-superseding an already-superseded row");
  });

test("sd-E5 · DELETE is refused CLR08 (append-only)", async (t) => {
  if (gate(t)) return;
  const row = await insertRow();
  const id = row.rows[0].id;
  await assertRaises("CLR08",
    () => roleQuery(ROLES.fnOwner, "delete from clara.statutory_deadlines where id = $1", [id]),
    "deleting a live row");
});

test("sd-E6 · TRUNCATE is refused CLR08 (no-truncate)", async (t) => {
  if (gate(t)) return;
  await assertRaises("CLR08",
    () => roleQuery(ROLES.fnOwner, "truncate clara.statutory_deadlines"),
    "truncating the table");
});
