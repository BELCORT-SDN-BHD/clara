// F-T1 (the SST engine) PR-1 — the two SST reference tables.
// Design of record: docs/plan/active/sst-engine-design.md S1-S4 + -design-part2.md S8's PR-1
// row + -annexes.md Annex A.1/A.1a + -annexes-2.md Annex C-4/C-5 + -gate-record-part2.md OQ-14.
//
// STEM-GATED (db-tests.md, wave-f-lane-brief.md): keys on the file STEM, never a number —
// this file's migration ships UNNUMBERED and is renumbered by the conductor at merge.
//
// SCOPE: clara.sst_rate_schedule (greenfield, six cited seed rows) + the clara.sst_threshold_
// schedule ALTER (Annex A.1's ordered specification) + the reachable-closure write assertion,
// armed for both tables. No evaluator, no writer verb — those are later F-T1 PRs / F-A8's own.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  rootQuery, roleQuery, endPool, ROLES, CLR, assertRaisesOneOf,
} from "./rig-helpers.mjs";
import { checkDefs, uniqueIndexDefs, rlsFlags, roleCanExecute } from "./a21-helpers.mjs";
import { noteLane, printLaneNotes } from "./rig-runtime-helpers.mjs";
import { markSkip, printSkipCount } from "./wave-a-helpers.mjs";

const LABEL = "F-T1 PR-1 sst reference tables";

let hasFT1PR1 = false;

async function detect() {
  const r = await rootQuery("select version from clara.schema_migrations where version ~ '_f_t1_sst_reference_tables$'");
  return r.rows.length > 0;
}

function skipHere(t) {
  if (!hasFT1PR1) {
    markSkip();
    t.skip("F-T1 PR-1 not applied (clara.schema_migrations has no '*_f_t1_sst_reference_tables' row) — battery dormant");
    return true;
  }
  return false;
}

before(async () => {
  hasFT1PR1 = await detect();
});

after(async () => {
  printLaneNotes(LABEL);
  printSkipCount(LABEL);
  await endPool();
});

// ---------------------------------------------------------------------------
// clara.sst_rate_schedule — shape, RLS, immutability.
// ---------------------------------------------------------------------------

test("sst_rate_schedule: RLS enabled + forced, zero direct app-role write grants", async (t) => {
  if (skipHere(t)) return;
  const f = await rlsFlags("sst_rate_schedule");
  assert.ok(f, "clara.sst_rate_schedule exists");
  assert.ok(f.rls && f.force, "clara.sst_rate_schedule is RLS + FORCE RLS");
  const g = await rootQuery(
    `select count(*)::int as n from pg_class c join pg_namespace n on n.oid=c.relnamespace
       cross join lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
       join pg_roles r on r.oid=a.grantee
      where n.nspname='clara' and c.relname='sst_rate_schedule' and r.rolname like 'clara_%'
        and r.rolname <> 'clara_fn_owner'
        and a.privilege_type in ('INSERT','UPDATE','DELETE','TRUNCATE')`,
  );
  assert.equal(g.rows[0].n, 0, "no lane role can write sst_rate_schedule directly — zero direct app-role grants (Annex A.1)");
});

test("sst_rate_schedule: three rate FORMS, exactly-one-of-rate_bp/rate_amount_sen, and the effective-order/supersession/governed-origin CHECKs are live", async (t) => {
  if (skipHere(t)) return;
  const defs = await checkDefs("sst_rate_schedule");
  for (const frag of [
    "rate_kind = ANY (ARRAY['ad_valorem'::text, 'per_unit'::text, 'per_measure'::text])",
    "tax_type = ANY (ARRAY['sales'::text, 'service'::text])",
    "(rate_kind = 'ad_valorem'::text) = (rate_bp IS NOT NULL)",
    "(rate_kind = ANY (ARRAY['per_unit'::text, 'per_measure'::text])) = (rate_amount_sen IS NOT NULL)",
    "(rate_kind = ANY (ARRAY['per_unit'::text, 'per_measure'::text])) = (unit_code IS NOT NULL)",
    "(effective_to IS NULL) OR (effective_to > effective_from)",
    "(superseded_by IS NULL) = (superseded_at IS NULL)",
  ]) {
    assert.ok(defs.includes(frag), `sst_rate_schedule CHECK vocabulary carries: ${frag} (got: ${defs.slice(0, 400)})`);
  }
  const uq = await uniqueIndexDefs("sst_rate_schedule");
  assert.ok(
    uq.some((d) => /tax_type/.test(d) && /scope_key/.test(d) && /effective_from/.test(d) && /WHERE \(superseded_by IS NULL\)/.test(d)),
    `sst_rate_schedule carries a partial UNIQUE(tax_type, scope_key, effective_from) WHERE superseded_by IS NULL (got: ${uq.join(" ~~ ")})`,
  );
});

test("sst_rate_schedule: seed is exactly six rows, all migration-seeded (superseded_by and recorded_by both NULL), each source_note non-blank", async (t) => {
  if (skipHere(t)) return;
  const rows = (await rootQuery(
    "select tax_type, scope_key, rate_kind, rate_bp, rate_amount_sen, unit_code, effective_from::text as ef, effective_to, superseded_by, recorded_by, source_note from clara.sst_rate_schedule order by tax_type, scope_key",
  )).rows;
  assert.equal(rows.length, 6, `sst_rate_schedule carries exactly 6 seed rows (got ${rows.length})`);
  for (const r of rows) {
    assert.equal(r.superseded_by, null, `${r.tax_type}/${r.scope_key} is not superseded`);
    assert.equal(r.recorded_by, null, `${r.tax_type}/${r.scope_key} is migration-seeded, not governed-recorded`);
    assert.ok((r.source_note ?? "").length > 20, `${r.tax_type}/${r.scope_key} cites a real source_note`);
    // exactly one of rate_bp / rate_amount_sen populated, matching rate_kind.
    const bp = r.rate_bp !== null;
    const amt = r.rate_amount_sen !== null;
    assert.notEqual(bp, amt, `${r.tax_type}/${r.scope_key}: exactly one of rate_bp/rate_amount_sen is set`);
  }

  const byKey = Object.fromEntries(rows.map((r) => [`${r.tax_type}/${r.scope_key}`, r]));
  assert.equal(Number(byKey["sales/general"].rate_bp), 1000, "sales/general is 10% (S-1)");
  assert.equal(Number(byKey["sales/first_schedule"].rate_bp), 500, "sales/first_schedule is 5% (S-1)");
  assert.equal(Number(byKey["service/general"].rate_bp), 800, "service/general is 8% (V-1)");
  assert.equal(Number(byKey["service/first_schedule_6pct"].rate_bp), 600, "service/first_schedule_6pct is 6% (V-2)");
  assert.equal(Number(byKey["service/credit_charge_card"].rate_amount_sen), 2500, "credit/charge card is RM25.00 in sen (V-1)");
  assert.equal(byKey["service/credit_charge_card"].unit_code, "card", "credit/charge card unit_code is 'card'");

  // The V-3 flagship: rental/leasing is its OWN scope from 2026-01-01, at 6%, distinct from the
  // general 8% bucket that covered it before item 14 existed — proving the table is effective-
  // dated and can carry a rate whose gazette (P.U.(A) 125/2026, 13 Mar 2026) post-dates the
  // period it governs (deemed effective 2026-01-01).
  const rental = byKey["service/rental_leasing"];
  assert.equal(rental.ef, "2026-01-01", "rental_leasing's own scope starts exactly 2026-01-01 (V-3's deemed-effective date)");
  assert.equal(Number(rental.rate_bp), 600, "rental_leasing is 6% once its own First-Schedule item exists (V-3)");
});

test("sst_rate_schedule: immutable + supersede — DELETE, TRUNCATE and an out-of-shape UPDATE all refuse (as clara_fn_owner, the only role with any grant at all)", async (t) => {
  if (skipHere(t)) return;
  // A DEDICATED throwaway fixture row (never one of the six real seed rows) — the supersession
  // half of this cell permanently mutates whatever row it targets (the trigger refuses a SECOND
  // update to an already-superseded row by design), so a real seed row must never be the target:
  // the six-row/none-superseded shape is a standing invariant other cells in this file assert.
  await roleQuery(
    ROLES.fnOwner,
    `insert into clara.sst_rate_schedule (tax_type, scope_key, rate_kind, rate_bp, effective_from, source_note)
       values ('sales', '_ft1_test_immutability_probe', 'ad_valorem', 1, current_date, 'throwaway immutability-probe fixture, never a real rate'),
              ('sales', '_ft1_test_immutability_probe_successor', 'ad_valorem', 2, current_date, 'throwaway successor fixture, never a real rate')`,
  );
  const row = (await rootQuery(
    "select id from clara.sst_rate_schedule where tax_type='sales' and scope_key='_ft1_test_immutability_probe'",
  )).rows[0];
  const successor = (await rootQuery(
    "select id from clara.sst_rate_schedule where tax_type='sales' and scope_key='_ft1_test_immutability_probe_successor'",
  )).rows[0];
  assert.ok(row && successor, "throwaway fixture rows present");

  await assertRaisesOneOf([CLR.immutable], () => roleQuery(ROLES.fnOwner, "delete from clara.sst_rate_schedule where id=$1", [row.id]), "DELETE on sst_rate_schedule");
  await assertRaisesOneOf([CLR.immutable], () => roleQuery(ROLES.fnOwner, "truncate clara.sst_rate_schedule"), "TRUNCATE on sst_rate_schedule");
  await assertRaisesOneOf([CLR.badRequest], () => roleQuery(ROLES.fnOwner, "update clara.sst_rate_schedule set rate_bp = rate_bp + 1 where id=$1", [row.id]), "an UPDATE that is not the supersession stamp");

  // The ONE lawful UPDATE — the supersession stamp, paired — is admitted, pointing at a REAL
  // row (the FK on superseded_by demands one; a fabricated uuid correctly refuses at 23503).
  await roleQuery(
    ROLES.fnOwner,
    "update clara.sst_rate_schedule set superseded_by=$2, superseded_at=now() where id=$1",
    [row.id, successor.id],
  );
  const after1 = (await rootQuery("select superseded_by from clara.sst_rate_schedule where id=$1", [row.id])).rows[0];
  assert.equal(after1.superseded_by, successor.id, "the supersession stamp is admitted");
  await assertRaisesOneOf([CLR.badRequest], () => roleQuery(ROLES.fnOwner, "update clara.sst_rate_schedule set superseded_at=now() where id=$1", [row.id]), "a second update to an already-superseded row");
  noteLane("sst_rate_schedule immutability cell left its OWN throwaway probe row (_ft1_test_immutability_probe) permanently superseded, by design — the six real seed rows are untouched by this cell.");
});

// ---------------------------------------------------------------------------
// clara.sst_threshold_schedule — the Annex A.1 ordered ALTER, backward-compatible.
// ---------------------------------------------------------------------------

test("sst_threshold_schedule: the ordered ALTER landed — id+unique, paired supersession, governed-origin conjunct, relaxed NIL-capable CHECK, per-item PK", async (t) => {
  if (skipHere(t)) return;
  const defs = await checkDefs("sst_threshold_schedule");
  assert.ok(defs.includes("threshold_cents >= 0"), `threshold_cents CHECK relaxed to >= 0 (V-6 NIL-threshold defect) (got: ${defs})`);
  assert.ok(defs.includes("(superseded_by IS NULL) = (superseded_at IS NULL)"), "paired supersession CHECK present");
  assert.ok(
    defs.includes("(recorded_by IS NULL) OR ((btrim(COALESCE(basis, ''::text)) <> ''::text) AND (basis_kind IS NOT NULL))"),
    `governed-origin conjunct present (got: ${defs})`,
  );

  const pk = (await rootQuery(
    "select pg_get_constraintdef(oid) as d from pg_constraint where conrelid='clara.sst_threshold_schedule'::regclass and contype='p'",
  )).rows[0].d;
  assert.equal(pk, "PRIMARY KEY (service_group, item_no, effective_from)", "PK widened to include item_no (V-6 per-item defect)");

  const uq = (await rootQuery(
    "select pg_get_constraintdef(oid) as d from pg_constraint where conrelid='clara.sst_threshold_schedule'::regclass and conname='uq_sst_threshold_schedule_id'",
  )).rows[0]?.d;
  assert.equal(uq, "UNIQUE (id)", "id carries its own UNIQUE constraint, ordered before the self-referencing FK (Annex A.1 step 1)");
});

test("sst_threshold_schedule: both G/I seed rows survive the ALTER byte-for-byte on every pre-existing column (a21-watch.test.mjs P1's premise)", async (t) => {
  if (skipHere(t)) return;
  for (const g of ["G", "I"]) {
    const row = (await rootQuery(
      "select threshold_cents::bigint as c, effective_to, source_note, item_no, id, superseded_by, recorded_by from clara.sst_threshold_schedule where service_group=$1 and effective_from=date '2018-09-01'",
      [g],
    )).rows[0];
    assert.ok(row, `group ${g}'s seed row still resolves at its original key`);
    assert.equal(Number(row.c), 50_000_000, `group ${g} threshold is unchanged at RM500k in cents`);
    assert.equal(row.effective_to, null, `group ${g} is still open-ended (the a21-watch standing pin)`);
    assert.ok((row.source_note ?? "").length > 0, `group ${g} still cites its source`);
    assert.equal(row.item_no, "*", `group ${g}'s new item_no defaulted to '*' (group-wide)`);
    assert.ok(row.id, `group ${g} was backfilled a surrogate id`);
    assert.equal(row.superseded_by, null, `group ${g} is not superseded by this ALTER`);
    assert.equal(row.recorded_by, null, `group ${g} stays migration-seeded (governed-origin conjunct exempts a NULL recorder)`);
  }
});

// ---------------------------------------------------------------------------
// The reachable-closure write assertion — proving the scan CAN refuse, not merely that it
// currently passes vacuously (internet-lane-annexes.md C.5e's adversarial-twin discipline,
// re-derived independently here in JS rather than trusting the migration's own DO block).
// ---------------------------------------------------------------------------

const CLOSURE_ROLES = [
  "clara_authenticated", "clara_agent_ro", "clara_agent_read_login",
  "clara_runtime", "clara_runtime_login", "clara_wake_interactive", "clara_wake_proactive",
  "clara_wake_write_login",
];

async function reachableClosureWriters(target) {
  const pattern = `(insert\\s+into|update|delete\\s+from)\\s+(clara\\.)?${target}\\M`;
  const roots = (await rootQuery(
    `select coalesce(array_agg(distinct p.proname), '{}') as fns
       from pg_proc p join pg_namespace n on n.oid=p.pronamespace
       cross join lateral aclexplode(coalesce(p.proacl,'{}'::aclitem[])) a
       join pg_roles r on r.oid=a.grantee
      where n.nspname='clara' and a.privilege_type='EXECUTE' and r.rolname = any($1)`,
    [CLOSURE_ROLES],
  )).rows[0].fns;
  let frontier = roots;
  let reached = [];
  for (let i = 0; i < 25 && frontier.length > 0; i += 1) {
    reached = [...new Set([...reached, ...frontier])];
    const next = (await rootQuery(
      `select coalesce(array_agg(distinct callee), '{}') as fns from (
          select (regexp_matches(p.prosrc, 'clara\\.([a-z_][a-z0-9_]*)\\s*\\(', 'g'))[1] as callee
            from pg_proc p join pg_namespace n on n.oid=p.pronamespace
           where n.nspname='clara' and p.proname = any($1)
        ) x
       where callee <> all($2)
         and exists (select 1 from pg_proc p2 join pg_namespace n2 on n2.oid=p2.pronamespace
                      where n2.nspname='clara' and p2.proname = x.callee)`,
      [frontier, reached],
    )).rows[0].fns;
    frontier = next;
  }
  const offenders = (await rootQuery(
    `select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='clara' and p.proname = any($1) and p.prosrc ~* $2`,
    [reached, pattern],
  )).rows.map((r) => r.proname);
  return offenders;
}

test("reachable closure: currently ZERO writers reach sst_threshold_schedule or sst_rate_schedule (no governed door exists yet)", async (t) => {
  if (skipHere(t)) return;
  assert.deepEqual(await reachableClosureWriters("sst_threshold_schedule"), [], "no reachable writer for sst_threshold_schedule");
  assert.deepEqual(await reachableClosureWriters("sst_rate_schedule"), [], "no reachable writer for sst_rate_schedule");
});

test("reachable closure ADVERSARIAL TWIN: an ungranted core writing sst_rate_schedule, reachable only through a granted wrapper, IS caught by the SAME scan", async (t) => {
  if (skipHere(t)) return;
  await rootQuery("set role clara_fn_owner");
  try {
    // The ungranted core: writes the table directly, EXECUTE not granted to any lane role —
    // exactly the class F-A8's gate found blind to the granted-fn-prosrc-only scan (GM-1/C.5e).
    await rootQuery(`
      create function clara._ft1_test_adversarial_core() returns void
        language plpgsql security definer set search_path to 'clara','pg_temp' as $fn$
      begin
        insert into clara.sst_rate_schedule (tax_type, scope_key, rate_kind, rate_bp, effective_from, source_note)
          values ('sales', '_ft1_adversarial_probe', 'ad_valorem', 1, current_date, 'adversarial twin — never a real rate');
      end $fn$;
    `);
    await rootQuery("revoke all on function clara._ft1_test_adversarial_core() from public");
    // The granted wrapper: EXECUTE granted to a lane role, calling the ungranted core by its
    // clara.-qualified name — the estate's own proven internal-call convention (0044:1652/1927).
    await rootQuery(`
      create function clara._ft1_test_adversarial_wrapper() returns void
        language plpgsql security definer set search_path to 'clara','pg_temp' as $fn$
      begin
        perform clara._ft1_test_adversarial_core();
      end $fn$;
    `);
    await rootQuery("grant execute on function clara._ft1_test_adversarial_wrapper() to clara_wake_proactive");

    const found = await reachableClosureWriters("sst_rate_schedule");
    assert.ok(
      found.includes("_ft1_test_adversarial_core"),
      `the reachable-closure scan catches the ungranted core through the granted wrapper (found: ${found.join(", ") || "(none)"})`,
    );
  } finally {
    await rootQuery("drop function if exists clara._ft1_test_adversarial_wrapper()");
    await rootQuery("drop function if exists clara._ft1_test_adversarial_core()");
    await rootQuery("reset role");
  }
});

test("PUBLIC has no EXECUTE on the new trigger function; clara_fn_owner owns it (DEFINER hygiene)", async (t) => {
  if (skipHere(t)) return;
  const pub = await roleCanExecute("public", "_tf_sst_rate_schedule_supersede_only");
  assert.notEqual(pub, true, "PUBLIC does not hold EXECUTE on the new supersede-only trigger function");
  const owner = (await rootQuery(
    "select pg_get_userbyid(proowner) as o from pg_proc where proname='_tf_sst_rate_schedule_supersede_only' and pronamespace='clara'::regnamespace",
  )).rows[0]?.o;
  assert.equal(owner, "clara_fn_owner", "the new trigger function is clara_fn_owner-owned (DEFINER-writer idiom)");
});
