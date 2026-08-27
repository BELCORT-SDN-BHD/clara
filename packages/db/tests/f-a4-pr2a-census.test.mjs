// F-A4 PR-2a -- Annex A, the EXTRACTION + CENSUS group: the extraction moved text not behaviour
// (W1-W4), the evaluator freeze (W11, W12), residual 1's mirrored floor (W21), the strengthened
// census walls (W25-W27), the park's flip (W29), constraint 15 (W30) and F4's month key (W32).
//
// Most of these read the LIVE CATALOG. Every one of them is paired with something that can fail:
// a census that cannot go red is a list, not a wall.

import test, { before } from "node:test";
import assert from "node:assert/strict";
import { noteLane } from "./rig-runtime-helpers.mjs";
import { humanQuery } from "./rig-helpers.mjs";
import { withTxn } from "./rig-txn.mjs";
import {
  ensurePrepay, prepayGate, prepaidScene, rootQuery, caught, uniq,
} from "./f-a4-pr2a-fixtures.mjs";

let skipped = 0;
const markSkip = () => { skipped += 1; };
before(async () => { await ensurePrepay(noteLane); });

const CORE = "clara._propose_adjustment_template_core(jsonb,uuid,text,text,date,date,boolean,jsonb,text,text,uuid,jsonb)";
const DOOR = "clara.propose_adjustment_template(uuid,text,text,date,date,boolean,jsonb,text,text,uuid,jsonb)";

const prosrc = async (sig) => (await rootQuery(
  "select prosrc from pg_proc where oid = to_regprocedure($1)", [sig])).rows[0]?.prosrc ?? null;

// ---------------------------------------------------------------------------------------------
// W1-W4 -- the extraction.
// ---------------------------------------------------------------------------------------------
test("fa4p2a.W1 the extraction MOVED TEXT, not behaviour: the core carries the body, the door is a thin delegate", async (t) => {
  if (prepayGate(t, markSkip)) return;
  const core = await prosrc(CORE);
  const door = await prosrc(DOOR);
  assert.ok(core && door, "the extraction's two halves do not both resolve");

  // The DOOR is now a delegate: it opens the floor and calls the core, and carries no DML of its own.
  assert.match(door, /_human_ctx/, "the door no longer opens the human floor");
  assert.match(door, /_propose_adjustment_template_core/, "the door does not delegate to the core");
  assert.doesNotMatch(door, /insert into clara\.adjustment_templates/i,
    "the door still writes -- the body did not move, it was copied");
  assert.ok(door.length < 1200, `the door is ${door.length} bytes; a thin delegate it is not`);

  // The CORE carries the substantive body, and it reads its ctx rather than opening a floor -- the
  // 0124 substitution shape. Distinctive markers from the shipped body are asserted individually so
  // a failure names WHICH part of the move went missing.
  assert.doesNotMatch(core, /_human_ctx/,
    "the core still opens the human floor -- a core is ungranted and takes its caller's ctx");
  for (const marker of ["_reserve_op", "_adj_template_hash", "insert into clara.adjustment_templates",
                        "_finish_op", "_audit", "lineage_root_id"]) {
    assert.ok(core.includes(marker), `the core lost "${marker}" in the move`);
  }
  assert.ok(core.length > 20000, `the core is only ${core.length} bytes -- the body did not move`);
  noteLane(`W1: door ${door.length} bytes, core ${core.length} bytes`);
});

test("fa4p2a.W2 the human door's FLOOR survives the extraction", async (t) => {
  if (prepayGate(t, markSkip)) return;
  const sc = await prepaidScene("w2");
  const viewer = await rootQuery(
    `select u.id from clara.users u join clara.firm_memberships m on m.user_id = u.id
      where m.firm_id = $1 and m.status='active'
        and clara.role_rank(m.role) < clara.role_rank('bookkeeper') limit 1`, [sc.firm]);
  const lines = [
    { account_code: sc.target, debit_cents: 100, credit_cents: 0, description: "d" },
    { account_code: sc.prepaid, debit_cents: 0, credit_cents: 100, description: "c" }];
  // THE CONTROL IS REQUIRED, NOT OPTIONAL (Codex C6). W2's whole claim is that the FLOOR survived
  // the extraction, and only the below-floor arm can show that -- the bookkeeper arm below would
  // pass just as happily with no floor at all. Noting the fixture's absence let the cell go green
  // having proven nothing, so it fails instead.
  assert.ok(viewer.rows.length > 0,
    "no below-floor member in this world: W2 cannot show the floor survived without one, so it fails rather than notes. buildWorld mints one; if it stopped, fix the fixture.");
  const e = await caught(() => humanQuery(viewer.rows[0].id,
    `select clara.propose_adjustment_template($1::uuid,$2,'monthly',date '2025-02-01',
       date '2025-02-28',false,$3::jsonb,'m',$4) as r`,
    [sc.client, `w2-${uniq()}`, JSON.stringify(lines), `w2-${uniq()}`]));
  assert.ok(e, "a BELOW-FLOOR viewer proposed a template -- the floor did not survive the move");
  // POSITIVE CONTROL: a bookkeeper+ still succeeds. A floor that refuses everyone is not a floor.
  const ok = await humanQuery(sc.alice,
    `select clara.propose_adjustment_template($1::uuid,$2,'monthly',date '2025-02-01',
       date '2025-02-28',false,$3::jsonb,'m',$4) as r`,
    [sc.client, `w2ok-${uniq()}`, JSON.stringify(lines), `w2ok-${uniq()}`]);
  assert.ok(ok.rows[0].r?.template_id, "the bookkeeper path is broken");
});

test("fa4p2a.W3/W4 the core is UNGRANTED, and the door's ACL / ownership / search_path triple is unmoved", async (t) => {
  if (prepayGate(t, markSkip)) return;
  const acl = await rootQuery(
    `select p.oid::regprocedure::text as sig,
            coalesce(array_to_string(p.proacl::text[], '|'), '(default)') as acl,
            p.prosecdef, coalesce(array_to_string(p.proconfig, ','), '(none)') as cfg,
            pg_get_userbyid(p.proowner) as owner
       from pg_proc p where p.oid in (to_regprocedure($1), to_regprocedure($2))`, [CORE, DOOR]);
  const byName = Object.fromEntries(acl.rows.map((r) => [r.sig.startsWith("clara._propose") ? "core" : "door", r]));

  // W3 -- the core holds EXECUTE for its owner and NOBODY else.
  assert.doesNotMatch(byName.core.acl, /clara_authenticated|clara_wake_|clara_runtime/,
    "the extracted core holds an application grant");
  assert.notEqual(byName.core.acl, "(default)",
    "the core is at DEFAULT acl, which for a function means PUBLIC EXECUTE");

  // W4 -- the door keeps exactly the ACL it was harvested with, and its triple is unmoved.
  assert.match(byName.door.acl, /clara_authenticated=X/, "the door lost its human grant");
  assert.doesNotMatch(byName.door.acl, /clara_wake_|clara_runtime/, "the door gained a machine grant");
  for (const half of ["core", "door"]) {
    assert.equal(byName[half].prosecdef, true, `${half} is not SECURITY DEFINER`);
    assert.equal(byName[half].cfg, "search_path=clara, pg_temp", `${half}'s search_path is not pinned`);
    assert.equal(byName[half].owner, "clara_fn_owner",
      `${half} is owned by ${byName[half].owner} -- a definer body owned by anyone else runs with the wrong privileges`);
  }

  // MUTANT: granting the core in a rolled-back transaction makes the W3 census red, so the census
  // is reading the live ACL and not a memory of it.
  await withTxn(async (c) => {
    await c.query(`grant execute on function ${CORE} to clara_authenticated`);
    const r = await c.query(
      `select coalesce(array_to_string(p.proacl::text[], '|'), '(default)') as acl
         from pg_proc p where p.oid = to_regprocedure($1)`, [CORE]);
    assert.match(r.rows[0].acl, /clara_authenticated/,
      "the grant did not take -- the mutant cannot discriminate and W3's green is meaningless");
  }, { commit: false });
});

// ---------------------------------------------------------------------------------------------
// W11 / W12 -- the evaluator's freeze.
// ---------------------------------------------------------------------------------------------
test("fa4p2a.W11 the closure is SINGLE-MEMBER, and the prosrc half ships with its ceiling stated", async (t) => {
  if (prepayGate(t, markSkip)) return;
  // THE STRUCTURAL HALF, which is the one that binds.
  const n = await rootQuery(
    `select count(*)::int as n from clara.evaluator_version_members m
       join clara.evaluator_versions ev on ev.id = m.evaluator_version_id
      where ev.evaluator_name = 'prepayment_schedule' and ev.version = 1`);
  assert.equal(n.rows[0].n, 1,
    "an N-member registration freezes N bodies estate-wide -- the closure must be exactly one");

  // THE SPELLING HALF, with its ceiling named in the cell as Annex A requires: a scan for a CALL
  // SHAPE, because a bare 'clara.' also matches the qualified TABLE names the body reads.
  const src = await prosrc("clara.prepayment_schedule_v1(uuid,uuid)");
  // COMMENTS ARE MASKED FIRST. The body's own prose names the door a refusal points at, and an
  // unmasked scan read that mention as a CALL -- the instrument reporting a dependency that does
  // not exist. Masking narrows the ceiling; it does not remove it, which is why the structural
  // one-member count above remains the claim that binds (law 3).
  const masked = src.replace(/--[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
  const calls = [...masked.matchAll(/clara\.([a-z0-9_]+)\s*\(/gi)].map((m) => m[1]);
  assert.deepEqual(calls, [],
    `the evaluator calls ${calls.join(", ")} -- each would join its frozen closure and become unrecuttable`);
  noteLane("W11: the prosrc half is a spelling instrument (comment-masked call-shape scan); the one-member count is the binding claim");
});

test("fa4p2a.W12 the freeze BINDS: the estate-wide verifier reproduces every registered closure", async (t) => {
  if (prepayGate(t, markSkip)) return;
  const r = await rootQuery("select clara.verify_evaluator_freeze() as v");
  assert.equal(r.rows[0].v.ok, true,
    `the freeze verifier is red with PR-2a applied: ${JSON.stringify(r.rows[0].v).slice(0, 300)}`);
  assert.ok(r.rows[0].v.verified_registered >= 8,
    "the new closure is not among the verified registrations");

  // MUTANT: replace the evaluator in a rolled-back transaction and the verifier must go red.
  // IT SIGNALS BY RAISING, not by returning ok:false -- measured, not assumed. My first cut
  // asserted on a returned flag, so the raise propagated out of withTxn and the CELL failed for
  // the right reason wearing the wrong clothes: the freeze was working and the instrument was
  // asking it the wrong question.
  const e = await caught(() => withTxn(async (c) => {
    await c.query(`create or replace function clara.prepayment_schedule_v1(p_client uuid, p_source_entry uuid)
                     returns jsonb language plpgsql stable security definer
                     set search_path = clara, pg_temp as $m$ begin return '{}'::jsonb; end $m$`);
    await c.query("select clara.verify_evaluator_freeze() as v");
  }, { commit: false }));
  assert.ok(e, "the evaluator was replaced and the freeze verifier stayed GREEN -- the freeze is not binding");
  assert.match(String(e.message), /freeze mismatch|prepayment_schedule/,
    `the verifier refused for some other reason: ${e.code} ${e.message}`);

  // AND THE ESTATE IS INTACT AFTERWARDS: proven by a read, not assumed from the rollback.
  const back = await rootQuery("select clara.verify_evaluator_freeze() as v");
  assert.equal(back.rows[0].v.ok, true, "the mutant left the evaluator replaced on the rig");
});

// ---------------------------------------------------------------------------------------------
// W21 / W25-W27 / W29 / W30 -- residual 1 and the strengthened census walls.
// ---------------------------------------------------------------------------------------------
test("fa4p2a.W21 (residual 1) a below-floor viewer reads ZERO from close_proposals AND close_prep_holds", async (t) => {
  if (prepayGate(t, markSkip)) return;
  for (const rel of ["close_proposals", "close_prep_holds"]) {
    const pol = await rootQuery(
      `select pg_get_expr(p.polqual, p.polrelid) as q, p.polcmd::text as cmd
         from pg_policy p join pg_class c on c.oid = p.polrelid
        where c.relname = $1 and p.polname like '%_human'`, [rel]);
    assert.equal(pol.rows.length, 1, `${rel} has ${pol.rows.length} human policies`);
    assert.match(pol.rows[0].q, /jwt_firm/, `${rel}'s human policy lost its firm predicate`);
    assert.match(pol.rows[0].q, /actor_role_rank/,
      `${rel}'s human policy carries NO rank conjunct -- a firm viewer reads a model's rationale`);
    assert.match(pol.rows[0].q, /bookkeeper/, `${rel}'s rank floor is not the bookkeeper floor`);
    assert.equal(pol.rows[0].cmd, "r", `${rel}'s human policy is not SELECT-only`);
  }
});

test("fa4p2a.W25/W26/W27 the census walls read IDENTITY, not names or counts", async (t) => {
  if (prepayGate(t, markSkip)) return;
  // W25 -- the index is pinned by relation, key columns and predicate text. A same-named index on
  // another table over other columns would satisfy a relname-only probe.
  const idx = await rootQuery(
    `select i.indrelid::regclass::text as rel, i.indisunique as uniq,
            pg_get_expr(i.indpred, i.indrelid) as pred,
            (select array_agg(a.attname::text order by a.attnum) from pg_attribute a
              where a.attrelid = i.indrelid and a.attnum = any (i.indkey::smallint[])) as cols
       from pg_index i join pg_class ic on ic.oid = i.indexrelid
      where ic.relname = 'uq_document_service_period_live'`);
  assert.equal(idx.rows.length, 1);
  assert.equal(idx.rows[0].rel, "clara.document_service_periods");
  assert.equal(idx.rows[0].uniq, true);
  assert.deepEqual(idx.rows[0].cols, ["document_id"]);
  assert.equal(idx.rows[0].pred, "(superseded_at IS NULL)");

  // W26 -- the policy census reads polcmd / polroles / polqual, not a count.
  const pols = await rootQuery(
    `select p.polname, p.polcmd::text as cmd,
            (select array_agg(r.rolname::text order by r.rolname) from pg_roles r
              where r.oid = any (p.polroles)) as roles
       from pg_policy p join pg_class c on c.oid = p.polrelid
      where c.relname = 'document_service_periods' order by p.polname`);
  assert.equal(pols.rows.length, 2, "the carrier must carry exactly the owner+human pair");
  const owner = pols.rows.find((r) => r.polname === "p_dsp_owner");
  const human = pols.rows.find((r) => r.polname === "p_dsp_human");
  assert.deepEqual(owner.roles, ["clara_fn_owner"]);
  assert.deepEqual(human.roles, ["clara_authenticated"]);
  assert.equal(human.cmd, "r");

  // W27 -- _tf_close_proposal_drafted_unique is IN the ungranted set (residual 4's migration half).
  const ung = await rootQuery(
    `select coalesce(array_to_string(p.proacl::text[], '|'), '(default)') as acl
       from pg_proc p where p.oid = to_regprocedure('clara._tf_close_proposal_drafted_unique()')`);
  assert.ok(ung.rows.length === 1, "the trigger function residual 4 names does not resolve");
  assert.doesNotMatch(ung.rows[0].acl, /clara_authenticated|clara_wake_|clara_runtime/,
    "a trigger function holds an application grant");
});

test("fa4p2a.W29 THE PARK FLIPS -- both objects resolve at EXACT signatures and the allowlist is thirteen", async (t) => {
  if (prepayGate(t, markSkip)) return;
  // 0138's T.9 proved these ABSENT by a positive read; the fold-seam law says a gate pinning a
  // defect must flip when the defect is fixed. This is that gate, inverted.
  const r = await rootQuery(
    `select (to_regprocedure('clara.wake_establish_prepayment_schedule(uuid,uuid,text,text,text,jsonb,text)') is not null) as wrapper,
            (to_regprocedure('clara.prepayment_schedule_v1(uuid,uuid)') is not null) as evaluator,
            (select count(*)::int from clara.wake_fn_allowlist where wake_kind='close_prep') as rows,
            (select count(*)::int from clara.wake_fn_allowlist
              where wake_kind='close_prep' and to_regproc('clara.'||function_name) is null) as dead`);
  const x = r.rows[0];
  assert.equal(x.wrapper, true, "wrapper 12 does not resolve at its exact signature");
  assert.equal(x.evaluator, true, "the evaluator does not resolve at its exact signature");
  assert.equal(x.rows, 13, `the close_prep allowlist has ${x.rows} rows, not thirteen`);
  assert.equal(x.dead, 0, "an allowlist row names a function that does not exist");

  // A REAL MUTANT, no exception (Annex A, F7): delete the thirteenth row in a rolled-back
  // transaction and the count half must red. A flipped gate that cannot fail is the same false
  // green its parked ancestor was written to avoid.
  await withTxn(async (c) => {
    await c.query("delete from clara.wake_fn_allowlist where wake_kind='close_prep' and function_name=$1",
      ["wake_establish_prepayment_schedule"]);
    const after = await c.query(
      "select count(*)::int as n from clara.wake_fn_allowlist where wake_kind='close_prep'");
    assert.equal(after.rows[0].n, 12, "the allowlist row could not be removed -- the mutant proves nothing");
  }, { commit: false });
});

test("fa4p2a.W30 (constraint 15) nothing PR-2a created lives outside clara, and the frozen schemas are REPORTED not asserted", async (t) => {
  if (prepayGate(t, markSkip)) return;
  const r = await rootQuery(
    `select (select count(*)::int from pg_proc p join pg_namespace n on n.oid=p.pronamespace
              where n.nspname in ('workflow','graphile_worker','spike')
                and (p.proname like 'wake!_%' escape '!' or p.proname like '!_adj!_%' escape '!'
                     or p.proname like 'prepayment!_%' escape '!')) as strays,
            (select count(*)::int from pg_class c join pg_namespace n on n.oid=c.relnamespace
              where n.nspname in ('workflow','graphile_worker','spike')) as frozen_pop,
            (select n.nspname from pg_class c join pg_namespace n on n.oid=c.relnamespace
              where c.oid = to_regclass('clara.document_service_periods')) as carrier_schema`);
  assert.equal(r.rows[0].strays, 0, "a PR-2a function landed in a frozen schema");
  assert.equal(r.rows[0].carrier_schema, "clara");
  noteLane(`W30: the frozen schemas hold ${r.rows[0].frozen_pop} relation(s) -- REPORTED, not asserted at zero (on live that is the Slice-0 parked run)`);

  // MUTANT: a same-named dummy in `spike` must make the stray census red, proving it looks in
  // those schemas at all.
  await withTxn(async (c) => {
    await c.query("create schema if not exists spike");
    await c.query(`create function spike._adj_mutant_probe() returns int language sql as $m$ select 1 $m$`);
    const after = await c.query(
      `select count(*)::int as n from pg_proc p join pg_namespace n on n.oid=p.pronamespace
        where n.nspname='spike' and p.proname like '!_adj!_%' escape '!'`);
    assert.equal(after.rows[0].n, 1, "the census does not look in spike at all");
  }, { commit: false });
});

test("fa4p2a.armed-skip the focused run records ZERO skips", async () => {
  assert.equal(skipped, 0, `${skipped} cell(s) skipped -- a focused PR-2a run must fail rather than skip`);
});
