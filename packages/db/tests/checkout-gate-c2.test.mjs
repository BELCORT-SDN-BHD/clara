// FS-4 checkout gate, PR C-2. Design of record:
// docs/plan/active/checkout-gate-design{,-part2,-part3}.md.
//
// C-2 owns only the redacted Stripe projection, problem queue, object map, two webhook
// doors, and two operator problem doors. C-3's payment table is intentionally absent, so
// this battery proves every negative path that resolves before the forward reference and
// names the payment-dependent limbs as deferred in the migration header.

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  CLR,
  PG,
  addMember,
  assertRaises,
  createFirm,
  endPool,
  humanQuery,
  insertUser,
  opk,
  roleQuery,
  rootQuery,
  seedAdmission,
} from "./rig-fixtures.mjs";
import { clearOperator, markOperator } from "./p4t2-fixtures.mjs";
import { truncateGuardError, withTxn } from "./rig-txn.mjs";

const TABLES = ["stripe_events", "stripe_event_problems", "stripe_object_map"];
const EXPECTED_CELLS = 17;
const BETA_VERSION = "clara-beta-2026-08-a";

let live = false;
let executed = 0;

async function cohortApplied() {
  const rows = await rootQuery(
    `select x.name, to_regclass('clara.' || x.name) is not null as present
       from unnest($1::text[]) x(name) order by x.name`,
    [TABLES],
  );
  const present = rows.rows.filter((row) => row.present).map((row) => row.name);
  if (present.length !== 0 && present.length !== TABLES.length) {
    throw new Error(`checkout C-2 cohort is PARTIAL: ${present.join(", ")}`);
  }
  if (present.length === 0) return false;
  // Once the three C-2 tables exist, every function, ACL, trigger and key belongs to a named
  // cell below. Keeping those reads out of this gate preserves mutant discrimination.
  return true;
}

before(async () => { live = await cohortApplied(); });
after(async () => {
  if (live) await clearOperator();
  await endPool();
});

function gate(t) {
  if (live) return false;
  if (process.env.CLARA_ALLOW_MISSING_CHECKOUT_GATE_C2 === "1") {
    console.warn("SKIP checkout-gate-c2: the C-2 cohort is not applied (explicit unnumbered/pre-integration run).");
    t.skip("checkout-gate C-2 cohort absent -- explicit pre-integration run");
    return true;
  }
  assert.fail(
    "checkout-gate C-2 is required for a focused run: apply a numbered suite copy of UNNUMBERED_checkout_gate_c2_stripe_events.sql",
  );
}

function cell(name, fn) {
  test(name, async (t) => {
    if (gate(t)) return;
    executed += 1;
    await fn(t);
  });
}

async function recordEvent(eventId, type, projection) {
  const row = await roleQuery(
    "clara_stripe_webhook",
    "select clara.record_stripe_event(p_event_id=>$1,p_type=>$2,p_projection=>$3::jsonb) as result",
    [eventId, type, JSON.stringify(projection)],
  );
  return row.rows[0].result;
}

function stripeEventId(tag = "c2") {
  const suffix = `${tag}${randomUUID().replaceAll("-", "")}`.replaceAll(/[^A-Za-z0-9]/g, "");
  return `evt_${suffix}`;
}

async function insertRegistration(applicant, tag = "c2") {
  const row = await rootQuery(
    `insert into clara.firm_registration_requests(applicant,firm_name,note,op_key)
     values ($1,$2,$3,$4) returning id`,
    [applicant, `${tag}_${randomUUID().slice(0, 8)}`, "checkout C-2 rig", `${tag}_${randomUUID()}`],
  );
  return row.rows[0].id;
}

async function insertIntent({ registration, applicant, session }) {
  const row = await rootQuery(
    `insert into clara.checkout_intents(registration_id,applicant,price_local_key,dpa_version)
     values ($1,$2,'beta_trial',$3) returning id`,
    [registration, applicant, BETA_VERSION],
  );
  await rootQuery("update clara.checkout_intents set session_id=$2 where id=$1", [row.rows[0].id, session]);
  return row.rows[0].id;
}

async function createProblem(tag = "problem") {
  const eventId = stripeEventId(tag);
  await recordEvent(eventId, "unit.problem", { livemode: false });
  const row = await rootQuery(
    `insert into clara.stripe_event_problems(event_id,problem,detail)
     values ($1,'intent_not_found',$2::jsonb) returning id`,
    [eventId, JSON.stringify({ tag })],
  );
  return { eventId, problemId: row.rows[0].id };
}

cell("c2.1 catalog -- the three tables have the exact C-2 typed column shapes and defaults", async () => {
  const expected = new Map([
    ["stripe_event_problems", "id:uuid:true,event_id:text:true,problem:text:true,detail:jsonb:true,noticed_at:timestamp with time zone:true,resolved_at:timestamp with time zone:false,resolved_by:uuid:false,resolution:text:false"],
    ["stripe_events", "event_id:text:true,type:text:true,livemode:boolean:true,session_id:text:false,intent_id:uuid:false,registration_id:uuid:false,applicant:uuid:false,amount_total:bigint:false,currency:text:false,payment_status:text:false,mode:text:false,session_status:text:false,customer_id:text:false,subscription_id:text:false,projection:jsonb:true,received_at:timestamp with time zone:true"],
    ["stripe_object_map", "object_kind:text:true,local_key:text:true,stripe_id:text:true,synced_at:timestamp with time zone:true"],
  ]);
  const rows = await rootQuery(
    `select c.relname,
            string_agg(a.attname||':'||format_type(a.atttypid,a.atttypmod)||':'||a.attnotnull,
                       ',' order by a.attnum) as columns
       from pg_class c join pg_namespace n on n.oid=c.relnamespace
       join pg_attribute a on a.attrelid=c.oid and a.attnum>0 and not a.attisdropped
      where n.nspname='clara' and c.relname=any($1::text[]) and c.relkind='r'
      group by c.relname order by c.relname`,
    [TABLES],
  );
  assert.equal(rows.rowCount, 3, "all three C-2 relations were positively read");
  for (const row of rows.rows) assert.equal(row.columns, expected.get(row.relname), row.relname);

  const defaults = await rootQuery(
    `select c.relname,a.attname,pg_get_expr(d.adbin,d.adrelid) as expression
       from pg_class c join pg_namespace n on n.oid=c.relnamespace
       join pg_attribute a on a.attrelid=c.oid
       join pg_attrdef d on d.adrelid=c.oid and d.adnum=a.attnum
      where n.nspname='clara' and c.relname=any($1::text[])
      order by c.relname,a.attname`,
    [TABLES],
  );
  assert.deepEqual(defaults.rows, [
    { relname: "stripe_event_problems", attname: "detail", expression: "'{}'::jsonb" },
    { relname: "stripe_event_problems", attname: "id", expression: "gen_random_uuid()" },
    { relname: "stripe_event_problems", attname: "noticed_at", expression: "now()" },
    { relname: "stripe_events", attname: "projection", expression: "'{}'::jsonb" },
    { relname: "stripe_events", attname: "received_at", expression: "now()" },
    { relname: "stripe_object_map", attname: "synced_at", expression: "now()" },
  ]);
});

cell("c2.2 catalog walls -- exact PK/UNIQUE keys, forced RLS, owner-only policies, and zero app grants", async () => {
  const relations = await rootQuery(
    `select c.relname,c.relrowsecurity,c.relforcerowsecurity,pg_get_userbyid(c.relowner) as owner,
            (select jsonb_agg(jsonb_build_object(
               'name',p.polname,'cmd',p.polcmd,'roles',
               (select array_agg(r.rolname order by r.rolname) from unnest(p.polroles) x(oid)
                 join pg_roles r on r.oid=x.oid),
               'using',pg_get_expr(p.polqual,p.polrelid),
               'check',pg_get_expr(p.polwithcheck,p.polrelid)) order by p.polname)
               from pg_policy p where p.polrelid=c.oid) as policies
       from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='clara' and c.relname=any($1::text[]) order by c.relname`,
    [TABLES],
  );
  for (const row of relations.rows) {
    assert.equal(row.relrowsecurity, true, `${row.relname}: RLS enabled`);
    assert.equal(row.relforcerowsecurity, true, `${row.relname}: RLS forced`);
    assert.equal(row.owner, "clara_fn_owner", `${row.relname}: owner`);
    assert.deepEqual(row.policies, [{
      name: `p_${row.relname}_owner`, cmd: "*", roles: ["clara_fn_owner"], using: "true", check: "true",
    }], `${row.relname}: one exact owner policy`);
  }

  const grants = await rootQuery(
    `select c.relname as table_name,coalesce(r.rolname,'PUBLIC') as grantee,a.privilege_type
       from pg_class c join pg_namespace n on n.oid=c.relnamespace
       cross join lateral aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a
       left join pg_roles r on r.oid=a.grantee
      where n.nspname='clara' and c.relname=any($1::text[]) and a.grantee<>c.relowner
      order by c.relname,grantee,a.privilege_type`,
    [TABLES],
  );
  assert.deepEqual(grants.rows, [], "no application role holds a direct C-2 table grant");

  const keys = await rootQuery(
    `select c.conrelid::regclass::text as relation,c.contype,
            array(select a.attname::text from unnest(c.conkey) with ordinality k(attnum,ord)
                  join pg_attribute a on a.attrelid=c.conrelid and a.attnum=k.attnum order by k.ord) as columns
       from pg_constraint c
      where c.conrelid in ('clara.stripe_events'::regclass,'clara.stripe_event_problems'::regclass,
                           'clara.stripe_object_map'::regclass)
        and c.contype in ('p','u') order by c.conrelid::regclass::text,c.contype,c.conname`,
  );
  assert.deepEqual(keys.rows, [
    { relation: "clara.stripe_event_problems", contype: "p", columns: ["id"] },
    { relation: "clara.stripe_events", contype: "p", columns: ["event_id"] },
    { relation: "clara.stripe_object_map", contype: "p", columns: ["object_kind", "local_key"] },
    { relation: "clara.stripe_object_map", contype: "u", columns: ["stripe_id"] },
  ]);
});

cell("c2.3 ck_stripe_events_no_pii -- every named top-level denied key is rejected by the recorder", async () => {
  for (const key of [
    "customer_details", "customer_email", "billing_details", "shipping_details", "payment_method_details",
  ]) {
    await assertRaises(
      PG.checkViolation,
      () => recordEvent(stripeEventId(`pii${key}`), "unit.pii", { livemode: false, [key]: { value: "denied" } }),
      `top-level ${key}`,
    );
  }
  const eventId = stripeEventId("piicontrol");
  assert.deepEqual(await recordEvent(eventId, "unit.pii_control", { livemode: false }), {
    event_id: eventId, recorded: true,
  }, "a projection with no denied top-level key is accepted normally");
});

cell("c2.4 stripe_events immutability -- update/delete and truncate all refuse CLR08", async () => {
  const guards = await rootQuery(
    `select tgname,tgenabled from pg_trigger
      where tgrelid='clara.stripe_events'::regclass and not tgisinternal order by tgname`,
  );
  assert.deepEqual(guards.rows, [
    { tgname: "t_stripe_events_append_only", tgenabled: "O" },
    { tgname: "t_stripe_events_no_truncate", tgenabled: "O" },
  ], "both independent guards are present and enabled");
  const eventId = stripeEventId("immutable");
  await recordEvent(eventId, "unit.immutable", { livemode: false });
  await withTxn(async (client) => {
    await assertRaises(CLR.immutable, () => client.query(
      "update clara.stripe_events set type='mutant' where event_id=$1", [eventId],
    ), "stripe event update");
  }, { commit: false });
  await withTxn(async (client) => {
    await assertRaises(CLR.immutable, () => client.query(
      "delete from clara.stripe_events where event_id=$1", [eventId],
    ), "stripe event delete");
  }, { commit: false });
  const trunc = await truncateGuardError("truncate clara.stripe_events cascade");
  assert.equal(trunc?.code, CLR.immutable, `stripe_events TRUNCATE guard answers CLR08 (got ${trunc?.code})`);
});

cell("c2.5 W-B -- replay stores one event and returns recorded:false on the second call", async () => {
  await assertRaises(CLR.badRequest, () => recordEvent("", "unit.replay", { livemode: false }), "blank event id");
  await assertRaises(CLR.badRequest, () => recordEvent("evt_blanktype", "", { livemode: false }), "blank type");
  await assertRaises(CLR.badRequest, () => recordEvent("evt_badprojection", "unit.replay", []), "array projection");

  const eventId = stripeEventId("replay");
  const first = await recordEvent(eventId, "unit.replay", { livemode: false, session_id: "cs_replay" });
  const second = await recordEvent(eventId, "unit.replay", { livemode: false, session_id: "cs_replay" });
  assert.deepEqual(first, { event_id: eventId, recorded: true });
  assert.deepEqual(second, { event_id: eventId, recorded: false }, "the replay return value is load-bearing");
  const count = await rootQuery("select count(*)::int as n from clara.stripe_events where event_id=$1", [eventId]);
  assert.equal(count.rows[0].n, 1, "replay leaves exactly one projected event row");
});

cell("c2.6 stripe_event_problems -- one complete resolution stamp only; all other edits/deletes/truncate refuse", async () => {
  const guards = await rootQuery(
    `select tgname,tgenabled from pg_trigger
      where tgrelid='clara.stripe_event_problems'::regclass and not tgisinternal order by tgname`,
  );
  assert.deepEqual(guards.rows, [
    { tgname: "t_stripe_event_problems_append_only", tgenabled: "O" },
    { tgname: "t_stripe_event_problems_no_truncate", tgenabled: "O" },
    { tgname: "t_stripe_event_problems_resolve_once", tgenabled: "O" },
  ], "resolution, delete, and truncate guards are independently enabled");
  const actor = await insertUser("fs4c2", "resolve_trigger");
  const first = await createProblem("resolve_once");
  await rootQuery(
    `update clara.stripe_event_problems
        set resolved_at=now(),resolved_by=$2,resolution='reviewed'
      where id=$1`,
    [first.problemId, actor],
  );
  const stamped = await rootQuery(
    "select resolved_at is not null as at,resolved_by,resolution from clara.stripe_event_problems where id=$1",
    [first.problemId],
  );
  assert.deepEqual(stamped.rows[0], { at: true, resolved_by: actor, resolution: "reviewed" });

  const second = await createProblem("immutable_fields");
  await withTxn(async (client) => {
    await assertRaises(CLR.immutable, () => client.query(
      "update clara.stripe_event_problems set resolved_at=now() where id=$1", [second.problemId],
    ), "partial resolution stamp");
  }, { commit: false });
  await withTxn(async (client) => {
    await assertRaises(CLR.immutable, () => client.query(
      "update clara.stripe_event_problems set detail='{}'::jsonb where id=$1", [second.problemId],
    ), "ordinary problem edit");
  }, { commit: false });
  await withTxn(async (client) => {
    await assertRaises(CLR.immutable, () => client.query(
      `update clara.stripe_event_problems
          set resolved_at=now(),resolved_by=$2,resolution='second stamp' where id=$1`,
      [first.problemId, actor],
    ), "problem re-resolution");
  }, { commit: false });
  await withTxn(async (client) => {
    await assertRaises(CLR.immutable, () => client.query(
      "delete from clara.stripe_event_problems where id=$1", [second.problemId],
    ), "problem delete");
  }, { commit: false });
  const trunc = await truncateGuardError("truncate clara.stripe_event_problems");
  assert.equal(trunc?.code, CLR.immutable, `problem TRUNCATE guard answers CLR08 (got ${trunc?.code})`);
});

cell("c2.7 stripe_object_map -- composite local key and Stripe id are independently unique", async () => {
  const local = `price_${randomUUID()}`;
  const stripe = `price_${randomUUID().replaceAll("-", "")}`;
  await rootQuery(
    "insert into clara.stripe_object_map(object_kind,local_key,stripe_id) values ('price',$1,$2)",
    [local, stripe],
  );
  await withTxn(async (client) => {
    await assertRaises(PG.uniqueViolation, () => client.query(
      "insert into clara.stripe_object_map(object_kind,local_key,stripe_id) values ('price',$1,$2)",
      [local, `${stripe}_other`],
    ), "duplicate object_kind/local_key");
  }, { commit: false });
  await withTxn(async (client) => {
    await assertRaises(PG.uniqueViolation, () => client.query(
      "insert into clara.stripe_object_map(object_kind,local_key,stripe_id) values ('product',$1,$2)",
      [`${local}_other`, stripe],
    ), "duplicate stripe_id");
  }, { commit: false });
});

cell("c2.8 W-O -- webhook role has exactly two executable routines, zero relation privileges, and no BYPASSRLS ancestry", async () => {
  for (const role of ["clara_stripe_webhook", "clara_stripe_webhook_login"]) {
    const routines = await rootQuery(
      `select array_agg(p.oid::regprocedure::text order by p.oid::regprocedure::text) as names
         from pg_proc p join pg_namespace n on n.oid=p.pronamespace
        where n.nspname='clara' and has_function_privilege($1,p.oid,'EXECUTE')`,
      [role],
    );
    assert.deepEqual(routines.rows[0].names, [
      "clara.apply_stripe_events(integer)",
      "clara.record_stripe_event(text,text,jsonb)",
    ], `${role} effective routine grants are an exact set equality`);

    const direct = await rootQuery(
      `select routine_name,privilege_type from information_schema.role_routine_grants
        where specific_schema='clara' and grantee=$1
        order by routine_name,privilege_type`,
      [role],
    );
    assert.deepEqual(direct.rows, role === "clara_stripe_webhook" ? [
      { routine_name: "apply_stripe_events", privilege_type: "EXECUTE" },
      { routine_name: "record_stripe_event", privilege_type: "EXECUTE" },
    ] : [], `${role} has no unexpected direct routine grant`);

    const tables = await rootQuery(
      `select c.oid::regclass::text as relation
         from pg_class c join pg_namespace n on n.oid=c.relnamespace
        where n.nspname='clara' and c.relkind in ('r','p','v','m','f')
          and (has_table_privilege($1,c.oid,'SELECT')
            or has_table_privilege($1,c.oid,'INSERT')
            or has_table_privilege($1,c.oid,'UPDATE')
            or has_table_privilege($1,c.oid,'DELETE')
            or has_table_privilege($1,c.oid,'TRUNCATE')
            or has_table_privilege($1,c.oid,'REFERENCES')
            or has_table_privilege($1,c.oid,'TRIGGER'))`,
      [role],
    );
    assert.deepEqual(tables.rows, [], `${role} has zero effective clara relation privileges`);
  }

  const dangerous = await rootQuery(
    `with recursive closure(oid,path) as (
       select oid,array[oid] from pg_roles
        where rolname in ('clara_stripe_webhook','clara_stripe_webhook_login')
       union all
       select m.roleid,c.path||m.roleid from closure c join pg_auth_members m on m.member=c.oid
        where not m.roleid=any(c.path)
     )
     select r.rolname from closure c join pg_roles r on r.oid=c.oid
      where r.rolbypassrls or r.rolsuper or r.rolcanlogin or r.rolcreaterole
         or r.rolcreatedb or r.rolreplication order by r.rolname`,
  );
  assert.deepEqual(dangerous.rows, [],
    "neither webhook role reaches LOGIN, cluster creation, replication, superuser, or BYPASSRLS");

  const eventId = stripeEventId("wo");
  assert.deepEqual(await recordEvent(eventId, "unit.w_o", { livemode: false }), {
    event_id: eventId, recorded: true,
  });
  const swept = await roleQuery("clara_stripe_webhook", "select clara.apply_stripe_events(1) as result");
  assert.deepEqual(swept.rows[0].result, { examined: 0, applied: 0, problems: 0 });
});

cell("c2.9 W-M -- unresolvable metadata writes one named problem and applies nothing", async () => {
  const eventId = stripeEventId("wm");
  await recordEvent(eventId, "checkout.session.completed", {
    livemode: false,
    session_id: `cs_wm_${randomUUID()}`,
    intent_id: randomUUID(),
    registration_id: randomUUID(),
    applicant: randomUUID(),
    payment_status: "paid",
    mode: "payment",
    session_status: "complete",
  });
  const result = await roleQuery("clara_stripe_webhook", "select clara.apply_stripe_events(100) as result");
  assert.deepEqual(result.rows[0].result, { examined: 1, applied: 0, problems: 1 });
  const problem = await rootQuery(
    "select id,problem,detail->>'intent_id' as intent_id from clara.stripe_event_problems where event_id=$1",
    [eventId],
  );
  assert.equal(problem.rowCount, 1);
  assert.equal(problem.rows[0].problem, "intent_not_found");
  assert.ok(problem.rows[0].intent_id, "the named problem carries the failed intent key");

  const skipped = await roleQuery("clara_stripe_webhook", "select clara.apply_stripe_events(100) as result");
  assert.deepEqual(skipped.rows[0].result, { examined: 0, applied: 0, problems: 0 }, "an unresolved problem excludes the event");

  const resolver = await insertUser("fs4c2", "wm_resolver");
  await rootQuery(
    `update clara.stripe_event_problems
        set resolved_at=now(),resolved_by=$2,resolution='intent lookup retried'
      where id=$1`,
    [problem.rows[0].id, resolver],
  );
  const retried = await roleQuery("clara_stripe_webhook", "select clara.apply_stripe_events(100) as result");
  assert.deepEqual(retried.rows[0].result, { examined: 1, applied: 0, problems: 1 },
    "a resolved problem unblocks the event for the next sweep");
  const retryProblems = await rootQuery(
    `select count(*)::int as total,
            count(*) filter (where resolved_at is not null)::int as resolved,
            count(*) filter (where resolved_at is null)::int as unresolved
       from clara.stripe_event_problems where event_id=$1`,
    [eventId],
  );
  assert.deepEqual(retryProblems.rows[0], { total: 2, resolved: 1, unresolved: 1 },
    "the retry leaves the resolved original and one new unresolved problem");
});

cell("c2.10 W-N -- intent/session disagreement writes intent_mismatch and applies nothing", async () => {
  const applicant = await insertUser("fs4c2", "wn_applicant");
  const registration = await insertRegistration(applicant, "wn");
  const realSession = `cs_wn_real_${randomUUID()}`;
  const intent = await insertIntent({ registration, applicant, session: realSession });
  const eventId = stripeEventId("wn");
  await recordEvent(eventId, "checkout.session.completed", {
    livemode: false,
    session_id: `${realSession}_forged`,
    intent_id: intent,
    registration_id: registration,
    applicant,
    payment_status: "paid",
    mode: "payment",
    session_status: "complete",
  });
  const result = await roleQuery("clara_stripe_webhook", "select clara.apply_stripe_events(100) as result");
  assert.deepEqual(result.rows[0].result, { examined: 1, applied: 0, problems: 1 });
  const problem = await rootQuery(
    `select problem,detail->>'session_id_matches' as session_matches
       from clara.stripe_event_problems where event_id=$1`,
    [eventId],
  );
  assert.deepEqual(problem.rows, [{ problem: "intent_mismatch", session_matches: "false" }]);
});

cell("c2.11 operator problems -- owner+operator wall, list filter, one resolution, idempotent replay, and re-resolution refusal", async () => {
  const operatorOwner = await insertUser("fs4c2", "operator_owner");
  const operatorToken = await seedAdmission(`fs4c2-operator-${randomUUID()}`);
  const operatorFirm = await createFirm(operatorOwner, {
    name: `FS4C2 Operator ${randomUUID()}`, token: operatorToken, opKey: opk("c2opfirm"),
  });
  await markOperator(operatorFirm);
  const bookkeeper = await insertUser("fs4c2", "operator_bookkeeper");
  await addMember(operatorOwner, {
    firm: operatorFirm, user: bookkeeper, role: "bookkeeper", opKey: opk("c2opbookkeeper"),
  });

  const nonOperatorOwner = await insertUser("fs4c2", "nonoperator_owner");
  const nonOperatorToken = await seedAdmission(`fs4c2-nonoperator-${randomUUID()}`);
  await createFirm(nonOperatorOwner, {
    name: `FS4C2 Non Operator ${randomUUID()}`, token: nonOperatorToken, opKey: opk("c2nonopfirm"),
  });

  const target = await createProblem("operator_surface");
  await assertRaises(CLR.authz, () => humanQuery(
    bookkeeper, "select * from clara.list_stripe_event_problems()",
  ), "non-owner list");
  await assertRaises(CLR.authz, () => humanQuery(
    nonOperatorOwner, "select * from clara.list_stripe_event_problems()",
  ), "non-operator owner list");
  await assertRaises(CLR.authz, () => humanQuery(
    bookkeeper,
    "select clara.resolve_stripe_event_problem(p_problem=>$1,p_resolution=>$2,p_op_key=>$3)",
    [target.problemId, "not allowed", opk("c2bookkeeperresolve")],
  ), "non-owner resolve");
  await assertRaises(CLR.authz, () => humanQuery(
    nonOperatorOwner,
    "select clara.resolve_stripe_event_problem(p_problem=>$1,p_resolution=>$2,p_op_key=>$3)",
    [target.problemId, "not allowed", opk("c2nonopresolve")],
  ), "non-operator owner resolve");

  const open = await humanQuery(
    operatorOwner,
    "select id,event_id,resolved_at from clara.list_stripe_event_problems() where id=$1",
    [target.problemId],
  );
  assert.deepEqual(open.rows, [{ id: target.problemId, event_id: target.eventId, resolved_at: null }]);

  const resolveKey = opk("c2resolve");
  const first = await humanQuery(
    operatorOwner,
    "select clara.resolve_stripe_event_problem(p_problem=>$1,p_resolution=>$2,p_op_key=>$3) as result",
    [target.problemId, "metadata corrected", resolveKey],
  );
  assert.deepEqual(first.rows[0].result, {
    problem_id: target.problemId, event_id: target.eventId, resolved: true,
  });
  const stamp = await rootQuery(
    "select resolved_at,resolved_by,resolution from clara.stripe_event_problems where id=$1",
    [target.problemId],
  );
  assert.ok(stamp.rows[0].resolved_at);
  assert.equal(stamp.rows[0].resolved_by, operatorOwner);
  assert.equal(stamp.rows[0].resolution, "metadata corrected");

  const replay = await humanQuery(
    operatorOwner,
    "select clara.resolve_stripe_event_problem(p_problem=>$1,p_resolution=>$2,p_op_key=>$3) as result",
    [target.problemId, "metadata corrected", resolveKey],
  );
  assert.deepEqual(replay.rows[0].result, first.rows[0].result, "same op_key is an idempotent no-op replay");
  const stampAfterReplay = await rootQuery(
    "select resolved_at,resolved_by,resolution from clara.stripe_event_problems where id=$1",
    [target.problemId],
  );
  assert.deepEqual(stampAfterReplay.rows[0], stamp.rows[0], "idempotent replay does not re-stamp");

  await assertRaises(CLR.lastOwner, () => humanQuery(
    operatorOwner,
    "select clara.resolve_stripe_event_problem(p_problem=>$1,p_resolution=>$2,p_op_key=>$3)",
    [target.problemId, "second resolution", opk("c2reresolve")],
  ), "a different operation cannot resolve the same row twice");

  const hidden = await humanQuery(
    operatorOwner,
    "select id from clara.list_stripe_event_problems() where id=$1",
    [target.problemId],
  );
  assert.equal(hidden.rowCount, 0, "default list excludes resolved rows");
  const included = await humanQuery(
    operatorOwner,
    "select id,resolution from clara.list_stripe_event_problems(true) where id=$1",
    [target.problemId],
  );
  assert.deepEqual(included.rows, [{ id: target.problemId, resolution: "metadata corrected" }]);
});

cell("c2.12 settled-payment gate -- unsettled refuses before metadata; settled reaches metadata wall", async () => {
  const unsettledEvent = stripeEventId("unsettled");
  await recordEvent(unsettledEvent, "checkout.session.completed", {
    livemode: false,
    session_id: `cs_unsettled_${randomUUID()}`,
    intent_id: randomUUID(),
    registration_id: randomUUID(),
    applicant: randomUUID(),
    payment_status: "unpaid",
    mode: "payment",
    session_status: "open",
  });
  const unsettled = await roleQuery("clara_stripe_webhook", "select clara.apply_stripe_events(100) as result");
  assert.deepEqual(unsettled.rows[0].result, { examined: 1, applied: 0, problems: 1 });
  const unsettledProblem = await rootQuery(
    "select problem from clara.stripe_event_problems where event_id=$1", [unsettledEvent],
  );
  assert.deepEqual(unsettledProblem.rows, [{ problem: "payment_not_settled" }]);

  const missingEvent = stripeEventId("settledmissing");
  await recordEvent(missingEvent, "checkout.session.completed", {
    livemode: false,
    session_id: `cs_settled_missing_${randomUUID()}`,
    intent_id: randomUUID(),
    payment_status: "paid",
    mode: "payment",
    session_status: "complete",
  });
  const missing = await roleQuery("clara_stripe_webhook", "select clara.apply_stripe_events(100) as result");
  assert.deepEqual(missing.rows[0].result, { examined: 1, applied: 0, problems: 1 });
  const missingProblem = await rootQuery(
    "select problem from clara.stripe_event_problems where event_id=$1", [missingEvent],
  );
  assert.deepEqual(missingProblem.rows, [{ problem: "metadata_missing" }]);

  const nullSettlementEvent = stripeEventId("nullsettlement");
  await recordEvent(nullSettlementEvent, "checkout.session.completed", { livemode: false });
  const nullSettlement = await roleQuery(
    "clara_stripe_webhook", "select clara.apply_stripe_events(100) as result",
  );
  assert.deepEqual(nullSettlement.rows[0].result, { examined: 1, applied: 0, problems: 1 });
  const nullSettlementProblem = await rootQuery(
    "select problem from clara.stripe_event_problems where event_id=$1", [nullSettlementEvent],
  );
  assert.deepEqual(nullSettlementProblem.rows, [{ problem: "payment_not_settled" }],
    "omitted settlement fields become SQL NULL and fail closed at step 1");
});

cell("c2.13 consumed rows are excluded before LIMIT and cannot starve a fresh event", async () => {
  const appliedEvents = [stripeEventId("starvea"), stripeEventId("starveb")];
  const freshEvent = stripeEventId("starvez");
  const projection = () => ({
    livemode: false,
    session_id: `cs_starve_${randomUUID()}`,
    intent_id: randomUUID(),
    registration_id: randomUUID(),
    applicant: randomUUID(),
    payment_status: "paid",
    mode: "payment",
    session_status: "complete",
  });
  for (const eventId of appliedEvents) {
    await recordEvent(eventId, "checkout.session.completed", projection());
  }
  await recordEvent(freshEvent, "checkout.session.completed", projection());

  const ordered = await rootQuery(
    `select event_id from clara.stripe_events
      where event_id=any($1::text[]) order by received_at,event_id`,
    [[...appliedEvents, freshEvent]],
  );
  assert.deepEqual(ordered.rows.map((row) => row.event_id), [...appliedEvents, freshEvent],
    "the fresh event is behind a LIMIT-sized consumed prefix");

  await rootQuery("create table clara.firm_registration_payments(stripe_event_id text primary key)");
  try {
    await rootQuery("alter table clara.firm_registration_payments owner to clara_fn_owner");
    await rootQuery(
      "insert into clara.firm_registration_payments(stripe_event_id) select unnest($1::text[])",
      [appliedEvents],
    );
    const result = await roleQuery(
      "clara_stripe_webhook", "select clara.apply_stripe_events(2) as result",
    );
    assert.deepEqual(result.rows[0].result, { examined: 1, applied: 0, problems: 1 },
      "consumed rows do not occupy the LIMIT window");
    const problem = await rootQuery(
      "select problem from clara.stripe_event_problems where event_id=$1", [freshEvent],
    );
    assert.deepEqual(problem.rows, [{ problem: "intent_not_found" }]);
  } finally {
    await rootQuery("drop table if exists clara.firm_registration_payments");
  }
});

cell("c2.14 open problem uniqueness -- one event/reason has at most one unresolved row", async () => {
  const eventId = stripeEventId("openunique");
  await recordEvent(eventId, "unit.open_unique", { livemode: false });
  await rootQuery(
    `insert into clara.stripe_event_problems(event_id,problem,detail)
     values ($1,'intent_not_found','{}'::jsonb)`,
    [eventId],
  );
  await assertRaises(PG.uniqueViolation, () => rootQuery(
    `insert into clara.stripe_event_problems(event_id,problem,detail)
     values ($1,'intent_not_found','{}'::jsonb)`,
    [eventId],
  ), "a second open row for the same event/reason");
  const count = await rootQuery(
    `select count(*)::int as n from clara.stripe_event_problems
      where event_id=$1 and problem='intent_not_found' and resolved_at is null`,
    [eventId],
  );
  assert.equal(count.rows[0].n, 1);
});

cell("c2.15 event-id shape mistake-net rejects non-Stripe ids and accepts a normal id", async () => {
  await assertRaises(PG.checkViolation, () => recordEvent(
    `not_evt_${randomUUID()}`, "unit.event_shape", { livemode: false },
  ), "non-Stripe event id");
  const eventId = stripeEventId("shapecontrol");
  assert.deepEqual(await recordEvent(eventId, "unit.event_shape", { livemode: false }), {
    event_id: eventId, recorded: true,
  });
});

cell("c2.16 settlement-status mistake-net bounds untrusted text and admits normal values", async () => {
  await assertRaises(PG.checkViolation, () => recordEvent(
    stripeEventId("oversizedstatus"), "unit.status_shape",
    { livemode: false, payment_status: "x".repeat(65) },
  ), "oversized payment status");
  const eventId = stripeEventId("statuscontrol");
  assert.deepEqual(await recordEvent(eventId, "unit.status_shape", {
    livemode: false,
    payment_status: "paid",
    mode: "payment",
    session_status: "complete",
  }), { event_id: eventId, recorded: true });
  const stored = await rootQuery(
    "select payment_status,mode,session_status from clara.stripe_events where event_id=$1", [eventId],
  );
  assert.deepEqual(stored.rows, [{ payment_status: "paid", mode: "payment", session_status: "complete" }]);
});

cell("c2.17 malformed projected UUID refuses by field name without echoing the input", async () => {
  const hostile = "captured-person@example.com";
  const error = await assertRaises(CLR.badRequest, () => recordEvent(
    stripeEventId("baduuid"), "unit.uuid_shape", { livemode: false, intent_id: hostile },
  ), "malformed intent uuid");
  assert.match(error.message, /intent_id/);
  assert.equal(error.message.includes(hostile), false, "the typed refusal never echoes the bad value");
});

test("c2.VACUITY CONTROL -- every declared C-2 cell executed", (t) => {
  if (!live) {
    if (process.env.CLARA_ALLOW_MISSING_CHECKOUT_GATE_C2 === "1") {
      t.skip("checkout-gate C-2 cohort absent -- explicit pre-integration run");
      return;
    }
    assert.fail("checkout-gate C-2 cohort absent");
  }
  assert.equal(executed, EXPECTED_CELLS, `${EXPECTED_CELLS} C-2 cells executed before the control`);
});
