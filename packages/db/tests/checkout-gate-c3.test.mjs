// FS-4 checkout gate, PR C-3. Design of record:
// docs/plan/active/checkout-gate-design{,-part2,-part3}.md.
// Every cell is independently gated so the pre-0161 integration run skips loudly rather than
// calling an absent cohort green. The numbered authoring suite exercises every cell.

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import {
  AGENT_USER_ID,
  CLR,
  PG,
  ROLES,
  assertRaises,
  endPool,
  humanQuery,
  insertUser,
  opk,
  roleQuery,
  rootQuery,
  withActor,
} from "./rig-fixtures.mjs";
import { clearOperator, markOperator } from "./p4t2-fixtures.mjs";
import { truncateGuardError, withTxn } from "./rig-txn.mjs";
import { twoSessions, waitBlockedByOrThrow } from "./binding-proposal-pr-1-helpers.mjs";

const TABLES = ["billing_plans", "firm_registration_payments", "confirmation_attempts"];
const EXPECTED_CELLS = 68; // +8 fold cells: c3.23a-d, c3.30f and c3.52a/b/c
// BLOCKER 2 (opus cross-family leg on #493): open_checkout_intent's body is frozen from here,
// same idiom as create_firm's W-E3 pin (59fa533d9c03) elsewhere in this same migration. Computed
// from the plan-current reuse body on this round's throwaway rig; update deliberately on real edits.
const OPEN_CHECKOUT_INTENT_PROSRC_SHA12 = "4b89b80d4710";

let live = false;
let executed = 0;
let admissionBaseline = null;
let operatorOwner = null;

async function cohortApplied() {
  const rows = await rootQuery(
    `select x.name,to_regclass('clara.'||x.name) is not null as present
       from unnest($1::text[]) x(name) order by x.name`,
    [TABLES],
  );
  const present = rows.rows.filter((r) => r.present).map((r) => r.name);
  if (present.length !== 0 && present.length !== TABLES.length) {
    throw new Error(`checkout C-3 cohort is PARTIAL: ${present.join(", ")}`);
  }
  return present.length === TABLES.length;
}

async function admissionShape() {
  const shape = await rootQuery(
    `select
       (select string_agg(attname,',' order by attnum) from pg_attribute
         where attrelid='clara.firm_admissions'::regclass and attnum>0 and not attisdropped) as columns,
       (select coalesce(jsonb_agg(pg_get_indexdef(indexrelid) order by indexrelid),'[]'::jsonb)
          from pg_index where indrelid='clara.firm_admissions'::regclass) as indexes,
       (select count(*)::int from clara.firm_admissions) as rows`,
  );
  return shape.rows[0];
}

async function monotonicSnapshot() {
  const counts = await rootQuery(
    `select 'billing_plans' as table_name,count(*)::int as n from clara.billing_plans
     union all select 'checkout_intents',count(*)::int from clara.checkout_intents
     union all select 'confirmation_attempts',count(*)::int from clara.confirmation_attempts
     union all select 'dpa_signatures',count(*)::int from clara.dpa_signatures
     union all select 'firm_registration_payments',count(*)::int from clara.firm_registration_payments
     union all select 'stripe_events',count(*)::int from clara.stripe_events
     order by table_name`,
  );
  const fingerprints = await rootQuery(
    `select 'checkout_intents' as table_name,id::text as id,
            md5((to_jsonb(t)-'session_id')::text) as hash from clara.checkout_intents t
     union all
     select 'firm_registration_payments',id::text,
            md5((to_jsonb(t)-'consumed_at'-'consumed_firm_id'-'consumed_dpa_signature')::text)
       from clara.firm_registration_payments t
     union all
     select 'stripe_events',event_id,md5(to_jsonb(t)::text) from clara.stripe_events t
     union all
     select 'dpa_signatures',id::text,md5(to_jsonb(t)::text) from clara.dpa_signatures t
     union all
     select 'billing_plans',id::text,md5(to_jsonb(t)::text) from clara.billing_plans t
     union all
     select 'confirmation_attempts',id::text,
            md5((to_jsonb(t)-'outcome'-'settled_at')::text) from clara.confirmation_attempts t
     order by table_name,id`,
  );
  return { counts: new Map(counts.rows.map((r) => [r.table_name, Number(r.n)])), fingerprints: fingerprints.rows };
}

async function assertMonotonic(beforeSnapshot, label) {
  const afterSnapshot = await monotonicSnapshot();
  for (const [table, beforeCount] of beforeSnapshot.counts) {
    assert.ok(afterSnapshot.counts.get(table) >= beforeCount, `${label}: ${table} row count decreased`);
  }
  const afterMap = new Map(afterSnapshot.fingerprints.map((r) => [`${r.table_name}:${r.id}`, r.hash]));
  for (const row of beforeSnapshot.fingerprints) {
    assert.equal(afterMap.get(`${row.table_name}:${row.id}`), row.hash,
      `${label}: ${row.table_name}/${row.id} disappeared or an immutable field changed`);
  }
}

before(async () => {
  live = await cohortApplied();
  if (live) admissionBaseline = await admissionShape();
});
after(async () => {
  if (live) await clearOperator();
  await endPool();
});

function gate(t) {
  if (live) return false;
  if (process.env.CLARA_ALLOW_MISSING_CHECKOUT_GATE_C3 === "1") {
    console.warn("SKIP checkout-gate-c3: the 0161 C-3 cohort is not applied (explicit pre-integration run).");
    t.skip("checkout-gate C-3 cohort absent -- explicit pre-0161 run");
    return true;
  }
  assert.fail(
    "checkout-gate C-3 is required for a focused run: apply 0161_checkout_gate_c3_folded_door.sql",
  );
}

function cell(name, fn) {
  test(name, async (t) => {
    if (gate(t)) return;
    executed += 1;
    const beforeSnapshot = await monotonicSnapshot();
    await fn(t);
    await assertMonotonic(beforeSnapshot, name);
  });
}

function digest(label) {
  return createHash("sha256").update(`${label}:${randomUUID()}`, "utf8").digest();
}
function stripeEventId(tag = "c3") {
  return `evt_${tag}_${randomUUID().replaceAll("-", "")}`;
}
function stripeSessionId(tag = "c3") {
  return `cs_${tag}_${randomUUID().replaceAll("-", "")}`;
}

async function authenticatedQuery(sub, email, sql, params = []) {
  return withActor({ role: ROLES.authenticated, jwtSub: sub, transaction: true }, async (c) => {
    await c.query("select set_config('request.jwt.claims',$1,true)", [
      JSON.stringify({ sub, role: "authenticated", email }),
    ]);
    return c.query(sql, params);
  });
}

async function expectRefusal(code, fn, message, label) {
  const error = await assertRaises(code, fn, label);
  if (message) assert.match(error.message, message, label);
  return error;
}

async function beginRoleTxn(client, role, claims = null) {
  await client.query(`set role ${role}`);
  await client.query("begin");
  if (claims) {
    await client.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify(claims)]);
  }
  return Number((await client.query("select pg_backend_pid() as pid")).rows[0].pid);
}

async function currentDpa() {
  const row = await rootQuery(
    "select version,body_sha256 from clara.dpa_documents where effective_to is null",
  );
  assert.equal(row.rowCount, 1, "fixture requires exactly one current DPA");
  return row.rows[0];
}

async function signDpa(user, email = `${randomUUID()}@rig.test`, opKey = opk("c3sign")) {
  const dpa = await currentDpa();
  const row = await authenticatedQuery(
    user, email,
    "select clara.sign_dpa(p_version=>$1,p_body_sha256=>$2,p_op_key=>$3) as result",
    [dpa.version, dpa.body_sha256, opKey],
  );
  return { ...dpa, result: row.rows[0].result, email };
}

async function insertRegistration(applicant, tag = "c3") {
  const row = await rootQuery(
    `insert into clara.firm_registration_requests(applicant,firm_name,note,op_key)
     values ($1,$2,'checkout C-3 rig',$3) returning id,firm_name`,
    [applicant, `${tag}_${randomUUID().slice(0, 8)}`, opk(tag)],
  );
  return row.rows[0];
}

async function ensurePriceMap() {
  const plan = await rootQuery("select local_key from clara.billing_plans where is_current");
  assert.equal(plan.rowCount, 1);
  const localKey = plan.rows[0].local_key;
  await rootQuery(
    `insert into clara.stripe_object_map(object_kind,local_key,stripe_id)
     values ('price',$1,$2) on conflict (object_kind,local_key) do nothing`,
    [localKey, `price_${randomUUID().replaceAll("-", "")}`],
  );
  const mapped = await rootQuery(
    "select stripe_id from clara.stripe_object_map where object_kind='price' and local_key=$1",
    [localKey],
  );
  return { localKey, stripeId: mapped.rows[0].stripe_id };
}

async function openIntent(user, registration, origin = digest("open"), email = `${randomUUID()}@rig.test`) {
  await signDpa(user, email);
  await ensurePriceMap();
  const row = await authenticatedQuery(
    user, email,
    "select clara.open_checkout_intent(p_registration=>$1,p_origin_digest=>$2,p_op_key=>$3) as result",
    [registration, origin, opk("c3open")],
  );
  return { ...row.rows[0].result, origin, email };
}

async function recordSession(user, intent, session, email = `${randomUUID()}@rig.test`) {
  const row = await authenticatedQuery(
    user, email,
    "select clara.record_checkout_session(p_intent=>$1,p_session_id=>$2,p_op_key=>$3) as result",
    [intent, session, opk("c3session")],
  );
  return row.rows[0].result;
}

async function recordStripeEvent(eventId, projection, type = "checkout.session.completed") {
  const row = await roleQuery(
    "clara_stripe_webhook",
    "select clara.record_stripe_event(p_event_id=>$1,p_type=>$2,p_projection=>$3::jsonb) as result",
    [eventId, type, JSON.stringify(projection)],
  );
  return row.rows[0].result;
}

async function directIntent({ registration, applicant, dpaVersion = null, session = null, id = null }) {
  const version = dpaVersion ?? (await currentDpa()).version;
  const row = await rootQuery(
    `insert into clara.checkout_intents(id,registration_id,applicant,price_local_key,dpa_version)
     values (coalesce($1,gen_random_uuid()),$2,$3,'clara-beta-2026',$4) returning id`,
    [id, registration, applicant, version],
  );
  if (session) await rootQuery("update clara.checkout_intents set session_id=$2 where id=$1", [row.rows[0].id, session]);
  return row.rows[0].id;
}

async function buildPaidChain({ user = null, tag = "paid", dpaVersion = null, sign = true } = {}) {
  const applicant = user ?? await insertUser("c3", tag);
  const storedEmail = await rootQuery("select lower(email) as email from clara.users where id=$1", [applicant]);
  assert.equal(storedEmail.rowCount, 1, "paid-chain actor must have one stored identity email");
  const email = storedEmail.rows[0].email;
  let signature = null;
  if (sign) signature = await signDpa(applicant, email);
  const req = await insertRegistration(applicant, tag);
  const session = stripeSessionId(tag);
  const intent = await directIntent({ registration: req.id, applicant, dpaVersion, session });
  const event = stripeEventId(tag);
  await recordStripeEvent(event, {
    livemode: false, session_id: session, intent_id: intent,
    registration_id: req.id, applicant, amount_total: 0, currency: "myr",
    payment_status: "paid", mode: "payment", session_status: "complete",
  });
  const payment = await rootQuery(
    `insert into clara.firm_registration_payments(
       registration_id,applicant,stripe_event_id,stripe_session_id,stripe_customer_id)
     values ($1,$2,$3,$4,$5) returning id`,
    [req.id, applicant, event, session, `cus_${randomUUID().replaceAll("-", "")}`],
  );
  return {
    user: applicant, email, registration: req.id, firmName: req.firm_name,
    intent, session, event, payment: payment.rows[0].id, signature,
  };
}

async function claim(chain, opKey = opk("c3claim")) {
  const row = await authenticatedQuery(
    chain.user, chain.email,
    "select clara.claim_paid_firm(p_registration=>$1,p_op_key=>$2) as result",
    [chain.registration, opKey],
  );
  return row.rows[0].result;
}

async function createNoncurrentDpa(tag = "old") {
  const version = `c3-${tag}-${randomUUID()}`;
  const body = `C-3 ${tag} DPA ${randomUUID()}`;
  const row = await rootQuery(
    `insert into clara.dpa_documents(
       version,body,body_sha256,source_path,effective_from,effective_to)
     values ($1,$2,sha256(convert_to($2,'UTF8')),$3,now()-interval '2 days',now()-interval '1 day')
     returning version,body_sha256`,
    [version, body, `docs/ops/legal/${version}.md`],
  );
  return row.rows[0];
}

async function ensureOperator() {
  if (operatorOwner) return operatorOwner;
  operatorOwner = await insertUser("c3", "operator");
  const firm = await createExistingFirm(operatorOwner, "operator");
  await markOperator(firm);
  return operatorOwner;
}

async function createExistingFirm(user, tag) {
  const firm = await rootQuery(
    "insert into clara.firms(name) values ($1) returning id", [`c3_${tag}_${randomUUID()}`],
  );
  await rootQuery(
    "insert into clara.firm_memberships(firm_id,user_id,role) values ($1,$2,'owner')",
    [firm.rows[0].id, user],
  );
  return firm.rows[0].id;
}

// ------------------------------------------------------------------------------------------------
// Catalog, table mutation walls, billing declaration and role confinement.
// ------------------------------------------------------------------------------------------------
cell("c3.1 catalog -- exact C-3 tables, two payment uniques, seed, RLS and grants", async () => {
  const staleDpa = await createNoncurrentDpa("read-door-filter");
  const properties = await rootQuery(
    `select c.relname,c.relrowsecurity,c.relforcerowsecurity,pg_get_userbyid(c.relowner) as owner,
            (select count(*)::int from pg_policy p where p.polrelid=c.oid) as policies,
            (select count(*)::int from information_schema.role_table_grants g
              where g.table_schema='clara' and g.table_name=c.relname and g.grantee<>'clara_fn_owner') as app_grants
       from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='clara' and c.relname=any($1::text[]) order by c.relname`,
    [TABLES],
  );
  assert.equal(properties.rowCount, 3);
  for (const row of properties.rows) {
    assert.deepEqual(
      { rls: row.relrowsecurity, force: row.relforcerowsecurity, owner: row.owner,
        policies: row.policies, appGrants: row.app_grants },
      { rls: true, force: true, owner: "clara_fn_owner", policies: 1, appGrants: 0 }, row.relname,
    );
  }
  const keys = await rootQuery(
    `select c.conname from pg_constraint c
      where c.conrelid='clara.firm_registration_payments'::regclass and c.contype in ('p','u')
     union all
     select ci.relname from pg_index i join pg_class ci on ci.oid=i.indexrelid
      where i.indrelid='clara.firm_registration_payments'::regclass
        and i.indisunique and not exists (select 1 from pg_constraint c where c.conindid=i.indexrelid)
     order by 1`,
  );
  assert.deepEqual(keys.rows.map((r) => r.conname), [
    "firm_registration_payments_pkey",
    "firm_registration_payments_stripe_event_id_key",
    "uq_frp_registration",
  ]);
  const seed = await rootQuery(
    `select local_key,name,amount_cents::int,currency,amounts_ruled,is_current
       from clara.billing_plans`,
  );
  assert.deepEqual(seed.rows, [{
    local_key: "clara-beta-2026", name: "Clara Beta", amount_cents: 0,
    currency: "MYR", amounts_ruled: false, is_current: true,
  }]);
  const dpaDoor = await rootQuery(
    `select p.prosecdef,p.provolatile,p.proretset,pg_get_userbyid(p.proowner) as owner,
            p.proconfig,
            (array_agg(coalesce(r.rolname,'PUBLIC') order by coalesce(r.rolname,'PUBLIC'))
              filter (where a.privilege_type='EXECUTE'))::text[] as execute_acl
       from pg_proc p
       cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
       left join pg_roles r on r.oid=a.grantee
      where p.oid='clara.get_current_dpa_document()'::regprocedure
      group by p.oid`,
  );
  assert.deepEqual(dpaDoor.rows, [{
    prosecdef: true,
    provolatile: "s",
    proretset: true,
    owner: "clara_fn_owner",
    proconfig: ["search_path=clara, pg_temp"],
    execute_acl: ["clara_authenticated", "clara_fn_owner"],
  }], "the DPA read door is stable, definer-owned and executable by authenticated callers only");
  const directDpaGrants = await rootQuery(
    `select count(*)::int as n from information_schema.role_table_grants
      where table_schema='clara' and table_name='dpa_documents'
        and grantee<>'clara_fn_owner'`,
  );
  assert.equal(directDpaGrants.rows[0].n, 0,
    "C-1's owner-only dpa_documents base-table grant posture remains exact");
  await expectRefusal(PG.insufficientPrivilege, () => roleQuery(
    ROLES.authenticated,
    "select version,body,body_sha256,effective_from from clara.dpa_documents",
  ), /permission denied/, "authenticated caller has no direct DPA table read");
  const currentDpa = await rootQuery(
    `select version,body,body_sha256,effective_from as published_at
       from clara.dpa_documents where effective_to is null`,
  );
  const visibleDpa = await roleQuery(
    ROLES.authenticated,
    "select version,body,body_sha256,published_at from clara.get_current_dpa_document()",
  );
  assert.equal(visibleDpa.rowCount, 1);
  assert.deepEqual(visibleDpa.rows, currentDpa.rows,
    "authenticated applicants read exactly the current body, sha and publication timestamp");
  assert.equal(visibleDpa.rows[0].version, currentDpa.rows[0].version,
    "the read door returns the current DPA version after a superseded row exists");
  assert.notEqual(visibleDpa.rows[0].version, staleDpa.version,
    "the superseded DPA version is not returned by the read door");
  assert.deepEqual(
    visibleDpa.rows[0].body_sha256,
    createHash("sha256").update(visibleDpa.rows[0].body, "utf8").digest(),
    "the returned body_sha256 matches sha256(body)",
  );
  // The exact execute_acl above positively excludes PUBLIC (the anonymous posture). This
  // execution proves a second, named application role is refused rather than trusting absence.
  await expectRefusal(PG.insufficientPrivilege, () => roleQuery(
    ROLES.agentRo,
    "select * from clara.get_current_dpa_document()",
  ), /permission denied/, "non-authenticated application role cannot read the DPA door");
  const bypass = await rootQuery(
    "select rolname from pg_roles where rolbypassrls and rolname like 'clara%'",
  );
  assert.deepEqual(bypass.rows, []);
  for (const role of ["clara_auth_wall", "clara_auth_wall_login"]) {
    const fns = await rootQuery(
      `select p.oid::regprocedure::text as sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace
        where n.nspname='clara' and has_function_privilege($1,p.oid,'execute') order by sig`, [role],
    );
    assert.deepEqual(fns.rows.map((r) => r.sig), [
      "clara.claim_confirmation_attempt(bytea,bytea)",
      "clara.settle_confirmation_attempt(uuid,text)",
    ]);
  }
});

cell("c3.2 mutation walls -- payment/OTP immutable fields, delete and truncate refuse", async () => {
  const chain = await buildPaidChain({ tag: "mutation" });
  await expectRefusal(CLR.badRequest, () => rootQuery(
    "update clara.firm_registration_payments set stripe_session_id=$2 where id=$1",
    [chain.payment, stripeSessionId("mutant")],
  ), /only the first complete consumption stamp/, "payment immutable-field update");
  await expectRefusal(CLR.immutable, () => rootQuery(
    "delete from clara.firm_registration_payments where id=$1", [chain.payment],
  ), null, "payment delete");
  const truncate = await truncateGuardError("truncate clara.confirmation_attempts");
  assert.equal(truncate?.code, CLR.immutable);
});

// ------------------------------------------------------------------------------------------------
// sign_dpa -- every entrance wall and race-safe structural replay.
// ------------------------------------------------------------------------------------------------
cell("c3.3 sign W1 -- no authenticated actor", async () => {
  const dpa = await currentDpa();
  await expectRefusal(CLR.authz, () => roleQuery(
    ROLES.authenticated, "select clara.sign_dpa($1,$2,$3)", [dpa.version, dpa.body_sha256, opk()],
  ), /no authenticated actor/, "sign no-auth");
});

cell("c3.4 sign W2 -- unknown actor", async () => {
  const dpa = await currentDpa();
  await expectRefusal(CLR.authz, () => humanQuery(
    randomUUID(), "select clara.sign_dpa($1,$2,$3)", [dpa.version, dpa.body_sha256, opk()],
  ), /unknown actor/, "sign unknown actor");
});

cell("c3.5 sign W3 -- agent cannot sign", async () => {
  const dpa = await currentDpa();
  await expectRefusal(CLR.authz, () => humanQuery(
    AGENT_USER_ID, "select clara.sign_dpa($1,$2,$3)", [dpa.version, dpa.body_sha256, opk()],
  ), /agent identity cannot sign/, "sign agent");
});

cell("c3.6 sign W4 -- op_key is required", async () => {
  const user = await insertUser("c3", "sign_op");
  const dpa = await currentDpa();
  await expectRefusal(CLR.badRequest, () => humanQuery(
    user, "select clara.sign_dpa($1,$2,$3)", [dpa.version, dpa.body_sha256, " "],
  ), /op_key is required/, "sign op key");
});

cell("c3.7 sign W5 -- unknown DPA version", async () => {
  const user = await insertUser("c3", "sign_unknown_version");
  await expectRefusal(CLR.badRequest, () => humanQuery(
    user, "select clara.sign_dpa($1,$2,$3)", [`missing-${randomUUID()}`, digest("body"), opk()],
  ), /unknown dpa version/, "sign unknown version");
});

cell("c3.8 sign W6 -- non-current DPA refuses", async () => {
  const user = await insertUser("c3", "sign_old");
  const old = await createNoncurrentDpa("sign-old");
  await expectRefusal(CLR.lastOwner, () => humanQuery(
    user, "select clara.sign_dpa($1,$2,$3)", [old.version, old.body_sha256, opk()],
  ), /not current/, "sign non-current");
});

cell("c3.9 sign W7 -- body digest mismatch", async () => {
  const user = await insertUser("c3", "sign_sha");
  const dpa = await currentDpa();
  await expectRefusal(CLR.badRequest, () => humanQuery(
    user, "select clara.sign_dpa($1,$2,$3)", [dpa.version, digest("wrong"), opk()],
  ), /signed text does not match/, "sign SHA mismatch");
});

cell("c3.10 sign replay -- same user/version is one evidence row", async () => {
  const user = await insertUser("c3", "sign_replay");
  const first = await signDpa(user);
  const second = await signDpa(user);
  assert.equal(second.result.signature_id, first.result.signature_id);
  assert.equal(second.result.signed_at, first.result.signed_at);
  assert.equal(second.result.replay, true);
  const count = await rootQuery(
    "select count(*)::int as n from clara.dpa_signatures where user_id=$1 and dpa_version=$2",
    [user, first.version],
  );
  assert.equal(count.rows[0].n, 1);
});

// ------------------------------------------------------------------------------------------------
// open_checkout_intent -- X1-X10, both W-J polarities, digest bytes and mapped-price success.
// ------------------------------------------------------------------------------------------------
cell("c3.11 open X1 -- no authenticated actor", async () => {
  await expectRefusal(CLR.authz, () => roleQuery(
    ROLES.authenticated, "select clara.open_checkout_intent($1,$2,$3)",
    [randomUUID(), digest("x1"), opk()],
  ), /no authenticated actor/, "open no-auth");
});

cell("c3.12 open X2 -- unknown actor", async () => {
  await expectRefusal(CLR.authz, () => humanQuery(
    randomUUID(), "select clara.open_checkout_intent($1,$2,$3)",
    [randomUUID(), digest("x2"), opk()],
  ), /unknown actor/, "open unknown actor");
});

cell("c3.13 open X3 -- agent refuses", async () => {
  await expectRefusal(CLR.authz, () => humanQuery(
    AGENT_USER_ID, "select clara.open_checkout_intent($1,$2,$3)",
    [randomUUID(), digest("x3"), opk()],
  ), /agent identity cannot claim a firm/, "open agent");
});

cell("c3.14 open X4 -- op_key is required", async () => {
  const user = await insertUser("c3", "open_op");
  await expectRefusal(CLR.badRequest, () => humanQuery(
    user, "select clara.open_checkout_intent($1,$2,$3)",
    [randomUUID(), digest("x4"), ""],
  ), /op_key is required/, "open op key");
});

cell("c3.15 open X5 -- unknown registration", async () => {
  const user = await insertUser("c3", "open_unknown");
  await expectRefusal(CLR.badRequest, () => humanQuery(
    user, "select clara.open_checkout_intent($1,$2,$3)",
    [randomUUID(), digest("x5"), opk()],
  ), /unknown registration request/, "open unknown registration");
});

cell("c3.16 open X6/cross-tenant -- an existing firm's owner cannot open another request", async () => {
  const applicant = await insertUser("c3", "open_owner_a");
  const attacker = await insertUser("c3", "open_owner_b");
  await createExistingFirm(attacker, "open_cross");
  const req = await insertRegistration(applicant, "open_cross");
  await expectRefusal(CLR.authz, () => humanQuery(
    attacker, "select clara.open_checkout_intent($1,$2,$3)", [req.id, digest("x6"), opk()],
  ), /not your registration request/, "open cross-owner");
});

cell("c3.17 open still-open wall -- terminal registration refuses", async () => {
  const user = await insertUser("c3", "open_terminal");
  const req = await insertRegistration(user, "open_terminal");
  await rootQuery(
    "update clara.firm_registration_requests set status='rejected',decided_at=now(),reason='rig' where id=$1",
    [req.id],
  );
  await expectRefusal(CLR.lastOwner, () => humanQuery(
    user, "select clara.open_checkout_intent($1,$2,$3)", [req.id, digest("terminal"), opk()],
  ), /no longer open \(status: rejected\)/, "open terminal");
});

cell("c3.18 open X7 -- current DPA signature required", async () => {
  const user = await insertUser("c3", "open_unsigned");
  const req = await insertRegistration(user, "open_unsigned");
  await expectRefusal(CLR.lastOwner, () => humanQuery(
    user, "select clara.open_checkout_intent($1,$2,$3)", [req.id, digest("x7"), opk()],
  ), /data processing agreement is not signed/, "open unsigned");
});

cell("c3.19 open X8 -- real 32-byte digest admits; 16-byte digest refuses", async () => {
  const user = await insertUser("c3", "open_digest");
  const req = await insertRegistration(user, "open_digest");
  await signDpa(user);
  assert.equal(digest("positive").byteLength, 32);
  await expectRefusal(CLR.badRequest, () => humanQuery(
    user, "select clara.open_checkout_intent($1,$2,$3)", [req.id, Buffer.alloc(16, 7), opk()],
  ), /origin digest is required/, "open short digest");
});

cell("c3.20 open X9/W-J -- other applicant refuses, same applicant retries, concurrent callers serialize", async () => {
  const a = await insertUser("c3", "rate_a");
  const b = await insertUser("c3", "rate_b");
  const ra = await insertRegistration(a, "rate_a");
  const rb = await insertRegistration(b, "rate_b");
  const origin = digest("shared-rate");
  await openIntent(a, ra.id, origin);
  await signDpa(b);
  await expectRefusal(CLR.lastOwner, () => humanQuery(
    b, "select clara.open_checkout_intent($1,$2,$3)", [rb.id, origin, opk()],
  ), /too many firm registrations from this location today/, "different applicant rate wall");
  const retry = await authenticatedQuery(
    a, `${randomUUID()}@rig.test`,
    "select clara.open_checkout_intent($1,$2,$3) as result", [ra.id, origin, opk()],
  );
  assert.ok(retry.rows[0].result.intent_id, "same applicant's retry is not self-rate-limited");

  const concurrentA = await insertUser("c3", "rate_concurrent_a");
  const concurrentB = await insertUser("c3", "rate_concurrent_b");
  const concurrentReqA = await insertRegistration(concurrentA, "rate_concurrent_a");
  const concurrentReqB = await insertRegistration(concurrentB, "rate_concurrent_b");
  const concurrentOrigin = digest("shared-rate-concurrent");
  const emailA = `${randomUUID()}@rig.test`;
  const emailB = `${randomUUID()}@rig.test`;
  await signDpa(concurrentA, emailA);
  await signDpa(concurrentB, emailB);
  await ensurePriceMap();
  await twoSessions(async (winner, loser) => {
    const winnerPid = await beginRoleTxn(winner, ROLES.authenticated, {
      sub: concurrentA, role: "authenticated", email: emailA,
    });
    const loserPid = await beginRoleTxn(loser, ROLES.authenticated, {
      sub: concurrentB, role: "authenticated", email: emailB,
    });
    const won = await winner.query(
      "select clara.open_checkout_intent($1,$2,$3) as result",
      [concurrentReqA.id, concurrentOrigin, opk()],
    );
    assert.ok(won.rows[0].result.intent_id);
    const losingCall = loser.query(
      "select clara.open_checkout_intent($1,$2,$3)",
      [concurrentReqB.id, concurrentOrigin, opk()],
    ).then(() => ({ error: null })).catch((error) => ({ error }));
    await waitBlockedByOrThrow(loserPid, winnerPid);
    await winner.query("commit");
    const lost = await losingCall;
    assert.equal(lost.error?.code, CLR.lastOwner);
    assert.match(lost.error?.message ?? "", /too many firm registrations from this location today/);
    await loser.query("rollback");
  });
  const concurrentRows = await rootQuery(
    `select applicant from clara.registration_rate_events where origin_digest=$1 order by applicant`,
    [concurrentOrigin],
  );
  assert.deepEqual(concurrentRows.rows, [{ applicant: concurrentA }],
    "the committed winner is the only applicant admitted for the digest");
  const losingIntents = await rootQuery(
    "select count(*)::int as n from clara.checkout_intents where registration_id=$1",
    [concurrentReqB.id],
  );
  assert.equal(losingIntents.rows[0].n, 0);
});

cell("c3.21 open X10 -- an unconsumed paid registration refuses a second checkout", async () => {
  const chain = await buildPaidChain({ tag: "x10" });
  await expectRefusal(CLR.lastOwner, () => authenticatedQuery(
    chain.user, chain.email, "select clara.open_checkout_intent($1,$2,$3)",
    [chain.registration, digest("x10"), opk()],
  ), /registration is already paid/, "open paid registration");
});

cell("c3.22 open price-map wall -- missing Stripe price is a typed fail-closed refusal", async () => {
  const user = await insertUser("c3", "open_nomap");
  const req = await insertRegistration(user, "open_nomap");
  await signDpa(user);
  await withTxn(async (c) => {
    await c.query("savepoint no_map");
    await c.query("update clara.billing_plans set is_current=false where is_current");
    await c.query(
      `insert into clara.billing_plans(local_key,name,amount_cents,currency,amounts_ruled,is_current)
       values ($1,'C-3 unmapped plan',0,'MYR',false,true)`,
      [`c3-unmapped-${randomUUID()}`],
    );
    await c.query(`set role ${ROLES.authenticated}`);
    await c.query("select set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub: user, email: "nomap@rig.test" })]);
    await expectRefusal(CLR.badRequest, () => c.query(
      "select clara.open_checkout_intent($1,$2,$3)", [req.id, digest("nomap"), opk()],
    ), /no stripe price is mapped/, "missing price map");
    await c.query("rollback to savepoint no_map");
  });
});

cell("c3.23 open happy path -- DB-selected plan and mapped Stripe price are returned", async () => {
  const user = await insertUser("c3", "open_happy");
  const req = await insertRegistration(user, "open_happy");
  const map = await ensurePriceMap();
  const opened = await openIntent(user, req.id, digest("happy"));
  assert.equal(opened.price_local_key, map.localKey);
  assert.equal(opened.stripe_price_id, map.stripeId);
  assert.ok(opened.intent_id);
  const stored = await rootQuery(
    "select applicant,registration_id,price_local_key,dpa_version from clara.checkout_intents where id=$1",
    [opened.intent_id],
  );
  assert.equal(stored.rows[0].applicant, user);
  assert.equal(stored.rows[0].registration_id, req.id);
});

cell("c3.23a open idempotency -- same op_key reuses one unstamped intent and one rate event", async () => {
  const user = await insertUser("c3", "open_idempotent");
  const email = (await rootQuery("select email from clara.users where id=$1", [user])).rows[0].email;
  const req = await insertRegistration(user, "open_idempotent");
  const origin = digest("open-idempotent");
  const opKey = opk("open-idempotent");
  await signDpa(user, email);
  await ensurePriceMap();
  const first = (await authenticatedQuery(
    user, email,
    "select clara.open_checkout_intent($1,$2,$3) as result", [req.id, origin, opKey],
  )).rows[0].result;
  const second = (await authenticatedQuery(
    user, email,
    "select clara.open_checkout_intent($1,$2,$3) as result", [req.id, origin, opKey],
  )).rows[0].result;
  assert.deepEqual(second, first, "an unstamped intent is returned byte-for-byte on retry");
  const counts = await rootQuery(
    `select
       (select count(*)::int from clara.checkout_intents where registration_id=$1) as intents,
       (select count(*)::int from clara.registration_rate_events
         where applicant=$2 and origin_digest=$3) as rate_events`,
    [req.id, user, origin],
  );
  assert.deepEqual(counts.rows[0], { intents: 1, rate_events: 1 });
});

// POSITIVE CONTROL (same class as c3.30b): every pre-fold call already minted a new intent, so
// c3.23a (+ c3.53) discriminates A-M1 while this cell proves reuse stops after a session stamp.
cell("c3.23b positive control -- a stamped intent is consumed and a later call opens a fresh one", async () => {
  const user = await insertUser("c3", "open_after_stamp");
  const email = (await rootQuery("select email from clara.users where id=$1", [user])).rows[0].email;
  const req = await insertRegistration(user, "open_after_stamp");
  const origin = digest("open-after-stamp");
  const opKey = opk("open-after-stamp");
  await signDpa(user, email);
  await ensurePriceMap();
  const first = (await authenticatedQuery(
    user, email,
    "select clara.open_checkout_intent($1,$2,$3) as result", [req.id, origin, opKey],
  )).rows[0].result;
  await recordSession(user, first.intent_id, stripeSessionId("open-after-stamp"), email);
  const second = (await authenticatedQuery(
    user, email,
    "select clara.open_checkout_intent($1,$2,$3) as result", [req.id, origin, opKey],
  )).rows[0].result;
  assert.notEqual(second.intent_id, first.intent_id,
    "a session-stamped intent is consumed and cannot satisfy a later open");
  const counts = await rootQuery(
    `select
       (select count(*)::int from clara.checkout_intents where registration_id=$1) as intents,
       (select count(*)::int from clara.registration_rate_events
         where applicant=$2 and origin_digest=$3) as rate_events`,
    [req.id, user, origin],
  );
  assert.deepEqual(counts.rows[0], { intents: 2, rate_events: 2 });
});

// RED-before for the two cells below is the FOLD-2 body, NOT the pre-fold body. Measured: against
// `8d3902ae`'s open_checkout_intent -- which had no reuse path and minted a fresh current-plan
// intent every call -- c3.23c and c3.23d both PASS (61 pass / 8 fail of 69, the same eight cells
// the pre-fold control reds). Their discriminator is `5c7986ac`'s reuse body (prosrc sha12
// aa227c22bb7f), which reused an unstamped intent AS-IS: installed as the only mutant it reds
// exactly c3.23c, c3.23d and c3.53 (66 pass / 3 fail of 69). Named rather than implied, the class
// the round-2 review taught on c3.23b/c3.30b.
cell("c3.23c plan rotation -- a stale unstamped intent is untouched and a current-plan intent is minted", async () => {
  const user = await insertUser("c3", "open_after_rotation");
  const email = (await rootQuery("select email from clara.users where id=$1", [user])).rows[0].email;
  const req = await insertRegistration(user, "open_after_rotation");
  const origin = digest("open-after-rotation");
  const opKey = opk("open-after-rotation");
  await signDpa(user, email);
  await ensurePriceMap();
  const first = (await authenticatedQuery(
    user, email,
    "select clara.open_checkout_intent($1,$2,$3) as result", [req.id, origin, opKey],
  )).rows[0].result;

  await withTxn(async (c) => {
    await c.query("savepoint rotated_plan");
    await c.query("update clara.billing_plans set is_current=false where is_current");
    const newLocalKey = `c3-rotated-${randomUUID()}`;
    const newStripeId = `price_${randomUUID().replaceAll("-", "")}`;
    await c.query(
      `insert into clara.billing_plans(local_key,name,amount_cents,currency,amounts_ruled,is_current)
       values ($1,'C-3 rotated plan',0,'MYR',false,true)`,
      [newLocalKey],
    );
    await c.query(
      `insert into clara.stripe_object_map(object_kind,local_key,stripe_id)
       values ('price',$1,$2)`,
      [newLocalKey, newStripeId],
    );
    await c.query(`set role ${ROLES.authenticated}`);
    await c.query("select set_config('request.jwt.claims',$1,true)", [
      JSON.stringify({ sub: user, role: "authenticated", email }),
    ]);
    const second = (await c.query(
      "select clara.open_checkout_intent($1,$2,$3) as result", [req.id, origin, opKey],
    )).rows[0].result;
    assert.notEqual(second.intent_id, first.intent_id,
      "an intent from a superseded plan is not reusable");
    assert.equal(second.price_local_key, newLocalKey);
    assert.equal(second.stripe_price_id, newStripeId);

    await c.query("reset role");
    const state = await c.query(
      `select id,price_local_key,session_id from clara.checkout_intents
        where registration_id=$1 order by opened_at,id`,
      [req.id],
    );
    assert.equal(state.rowCount, 2);
    assert.deepEqual(state.rows.find((row) => row.id === first.intent_id), {
      id: first.intent_id, price_local_key: first.price_local_key, session_id: null,
    }, "the superseded-plan intent remains unstamped and byte-shape untouched");
    assert.deepEqual(state.rows.find((row) => row.id === second.intent_id), {
      id: second.intent_id, price_local_key: newLocalKey, session_id: null,
    });
    const events = await c.query(
      `select count(*)::int as n from clara.registration_rate_events
        where applicant=$1 and origin_digest=$2`,
      [user, origin],
    );
    assert.equal(events.rows[0].n, 2, "the fresh current-plan intent follows the first-call path");
    await c.query("rollback to savepoint rotated_plan");
  });
});

cell("c3.23d missing current plan -- a stale unstamped intent cannot bypass the typed refusal", async () => {
  const user = await insertUser("c3", "open_without_current_plan");
  const email = (await rootQuery("select email from clara.users where id=$1", [user])).rows[0].email;
  const req = await insertRegistration(user, "open_without_current_plan");
  const origin = digest("open-without-current-plan");
  const opKey = opk("open-without-current-plan");
  await signDpa(user, email);
  await ensurePriceMap();
  const first = (await authenticatedQuery(
    user, email,
    "select clara.open_checkout_intent($1,$2,$3) as result", [req.id, origin, opKey],
  )).rows[0].result;

  await withTxn(async (c) => {
    await c.query("savepoint no_current_plan");
    await c.query("update clara.billing_plans set is_current=false where is_current");
    await c.query(`set role ${ROLES.authenticated}`);
    await c.query("select set_config('request.jwt.claims',$1,true)", [
      JSON.stringify({ sub: user, role: "authenticated", email }),
    ]);
    await c.query("savepoint refused_open");
    await expectRefusal(CLR.badRequest, () => c.query(
      "select clara.open_checkout_intent($1,$2,$3)", [req.id, origin, opKey],
    ), /no current billing plan is configured/, "stale intent with no current plan");
    await c.query("rollback to savepoint refused_open");
    await c.query("reset role");

    const state = await c.query(
      `select id,price_local_key,session_id from clara.checkout_intents where registration_id=$1`,
      [req.id],
    );
    assert.deepEqual(state.rows, [{
      id: first.intent_id, price_local_key: first.price_local_key, session_id: null,
    }], "the stale intent remains the only carrier and stays unstamped after refusal");
    const events = await c.query(
      `select count(*)::int as n from clara.registration_rate_events
        where applicant=$1 and origin_digest=$2`,
      [user, origin],
    );
    assert.equal(events.rows[0].n, 1, "the refusal never appends a second rate event");
    await c.query("rollback to savepoint no_current_plan");
  });
});

// ------------------------------------------------------------------------------------------------
// record_checkout_session -- entrance walls and the W-S anti-bricking polarity.
// ------------------------------------------------------------------------------------------------
cell("c3.24 session entrance -- no auth/unknown/agent/op_key/unknown intent refuse in order", async () => {
  const noAuth = () => roleQuery(ROLES.authenticated,
    "select clara.record_checkout_session($1,$2,$3)", [randomUUID(), stripeSessionId(), opk()]);
  await expectRefusal(CLR.authz, noAuth, /no authenticated actor/, "session no-auth");
  await expectRefusal(CLR.authz, () => humanQuery(
    randomUUID(), "select clara.record_checkout_session($1,$2,$3)",
    [randomUUID(), stripeSessionId(), opk()],
  ), /unknown actor/, "session unknown actor");
  await expectRefusal(CLR.authz, () => humanQuery(
    AGENT_USER_ID, "select clara.record_checkout_session($1,$2,$3)",
    [randomUUID(), stripeSessionId(), opk()],
  ), /agent identity cannot record/, "session agent");
  const user = await insertUser("c3", "session_walls");
  await expectRefusal(CLR.badRequest, () => humanQuery(
    user, "select clara.record_checkout_session($1,$2,$3)", [randomUUID(), stripeSessionId(), ""],
  ), /op_key is required/, "session op key");
  await expectRefusal(CLR.badRequest, () => humanQuery(
    user, "select clara.record_checkout_session($1,$2,$3)", [randomUUID(), stripeSessionId(), opk()],
  ), /unknown checkout intent/, "session unknown intent");
});

cell("c3.25 session W-S/cross-tenant -- attacker refuses and owner can still stamp", async () => {
  const owner = await insertUser("c3", "session_owner");
  const attacker = await insertUser("c3", "session_attacker");
  await createExistingFirm(attacker, "session_cross");
  const req = await insertRegistration(owner, "session_owner");
  const intent = await directIntent({ registration: req.id, applicant: owner });
  const session = stripeSessionId("ws");
  await expectRefusal(CLR.authz, () => humanQuery(
    attacker, "select clara.record_checkout_session($1,$2,$3)", [intent, stripeSessionId("attack"), opk()],
  ), /not your checkout intent/, "session ownership");
  assert.deepEqual(await recordSession(owner, intent, session), { intent_id: intent, recorded: true });
});

cell("c3.26 session replay/collision -- same value replays; different or cross-intent value is a typed refusal", async () => {
  const owner = await insertUser("c3", "session_replay");
  const req = await insertRegistration(owner, "session_replay");
  const intent = await directIntent({ registration: req.id, applicant: owner });
  const session = stripeSessionId("same");
  await recordSession(owner, intent, session);
  assert.deepEqual(await recordSession(owner, intent, session), {
    intent_id: intent, recorded: true, replay: true,
  });
  await expectRefusal(CLR.lastOwner, () => humanQuery(
    owner, "select clara.record_checkout_session($1,$2,$3)",
    [intent, stripeSessionId("different"), opk()],
  ), /checkout session already recorded/, "session different restamp");

  const concurrentOwner = await insertUser("c3", "session_concurrent_same");
  const concurrentReq = await insertRegistration(concurrentOwner, "session_concurrent_same");
  const concurrentIntent = await directIntent({ registration: concurrentReq.id, applicant: concurrentOwner });
  const concurrentSession = stripeSessionId("concurrent_same");
  const concurrentEmail = `${randomUUID()}@rig.test`;
  await twoSessions(async (winner, loser) => {
    const winnerPid = await beginRoleTxn(winner, ROLES.authenticated, {
      sub: concurrentOwner, role: "authenticated", email: concurrentEmail,
    });
    const loserPid = await beginRoleTxn(loser, ROLES.authenticated, {
      sub: concurrentOwner, role: "authenticated", email: concurrentEmail,
    });
    const won = await winner.query(
      "select clara.record_checkout_session($1,$2,$3) as result",
      [concurrentIntent, concurrentSession, opk()],
    );
    assert.deepEqual(won.rows[0].result, { intent_id: concurrentIntent, recorded: true });
    const losingCall = loser.query(
      "select clara.record_checkout_session($1,$2,$3) as result",
      [concurrentIntent, concurrentSession, opk()],
    );
    await waitBlockedByOrThrow(loserPid, winnerPid);
    await winner.query("commit");
    const lost = await losingCall;
    assert.deepEqual(lost.rows[0].result, {
      intent_id: concurrentIntent, recorded: true, replay: true,
    });
    await loser.query("commit");
  });

  const differentOwner = await insertUser("c3", "session_concurrent_different");
  const differentReq = await insertRegistration(differentOwner, "session_concurrent_different");
  const differentIntent = await directIntent({ registration: differentReq.id, applicant: differentOwner });
  const winnerSession = stripeSessionId("concurrent_winner");
  const differentEmail = `${randomUUID()}@rig.test`;
  await twoSessions(async (winner, loser) => {
    const winnerPid = await beginRoleTxn(winner, ROLES.authenticated, {
      sub: differentOwner, role: "authenticated", email: differentEmail,
    });
    const loserPid = await beginRoleTxn(loser, ROLES.authenticated, {
      sub: differentOwner, role: "authenticated", email: differentEmail,
    });
    await winner.query(
      "select clara.record_checkout_session($1,$2,$3)",
      [differentIntent, winnerSession, opk()],
    );
    const losingCall = loser.query(
      "select clara.record_checkout_session($1,$2,$3)",
      [differentIntent, stripeSessionId("concurrent_loser"), opk()],
    ).then(() => ({ error: null })).catch((error) => ({ error }));
    await waitBlockedByOrThrow(loserPid, winnerPid);
    await winner.query("commit");
    const lost = await losingCall;
    assert.equal(lost.error?.code, CLR.lastOwner);
    assert.match(lost.error?.message ?? "", /checkout session already recorded/);
    await loser.query("rollback");
  });

  const collisionOwner = await insertUser("c3", "session_collision");
  const collisionReq = await insertRegistration(collisionOwner, "session_collision");
  const firstIntent = await directIntent({ registration: collisionReq.id, applicant: collisionOwner });
  const secondIntent = await directIntent({ registration: collisionReq.id, applicant: collisionOwner });
  const reusedSession = stripeSessionId("collision");
  await recordSession(collisionOwner, firstIntent, reusedSession);
  await expectRefusal(CLR.lastOwner, () => recordSession(
    collisionOwner, secondIntent, reusedSession,
  ), /checkout session already recorded/, "a session id already stamped on another intent is typed");
});

// ------------------------------------------------------------------------------------------------
// Confirmation wall -- claim-before-evaluate, independent digest limbs, fail-closed unsettled rows.
// ------------------------------------------------------------------------------------------------
async function claimConfirmation(emailDigest, originDigest) {
  const row = await roleQuery(
    "clara_auth_wall",
    "select clara.claim_confirmation_attempt(p_email_digest=>$1,p_origin_digest=>$2) as result",
    [emailDigest, originDigest],
  );
  return row.rows[0].result;
}
async function settleConfirmation(attempt, outcome) {
  const row = await roleQuery(
    "clara_auth_wall",
    "select clara.settle_confirmation_attempt(p_attempt=>$1,p_outcome=>$2) as result",
    [attempt, outcome],
  );
  return row.rows[0].result;
}

cell("c3.27 confirmation digest wall -- both inputs are real 32-byte SHA-256 values", async () => {
  const email = digest("email");
  const origin = digest("origin");
  assert.equal(email.byteLength, 32);
  assert.equal(origin.byteLength, 32);
  const accepted = await claimConfirmation(email, origin);
  assert.equal(accepted.allowed, true);
  assert.equal(accepted.scope, null, "the allowed path names no scope -- #488 seam ruling");
  assert.equal(accepted.retry_after_seconds, null, "the allowed path names no wait -- #488 seam ruling");
  await expectRefusal(CLR.badRequest, () => claimConfirmation(Buffer.alloc(16), origin),
    /a digest is required/, "short email digest");
  await expectRefusal(CLR.badRequest, () => claimConfirmation(email, Buffer.alloc(16)),
    /a digest is required/, "short origin digest");
});

cell("c3.28 W-H3 -- sixth rejected attempt is persisted but not allowed", async () => {
  const email = digest("h3-email");
  const origin = digest("h3-origin");
  for (let i = 0; i < 5; i += 1) {
    const attempt = await claimConfirmation(email, origin);
    assert.equal(attempt.allowed, true, `attempt ${i + 1} remains inside the window`);
    // F5 (opus review on #493): "remaining" is attempts remaining AFTER this one -- prior count
    // is i (0..4), so remaining must count down 4,3,2,1,0 across the five allowed attempts, never
    // showing "1" on the attempt that was in fact the last one this caller had.
    assert.equal(attempt.remaining, 4 - i, `attempt ${i + 1} (prior=${i}) must report ${4 - i} remaining`);
    await settleConfirmation(attempt.attempt_id, "rejected");
  }
  const sixth = await claimConfirmation(email, origin);
  assert.equal(sixth.allowed, false);
  assert.equal(sixth.remaining, 0);
  assert.equal(sixth.scope, "email", "#488 seam ruling: the refused arm names the email/C1 wall");
  assert.ok(Number.isInteger(sixth.retry_after_seconds)
    && sixth.retry_after_seconds > 0 && sixth.retry_after_seconds <= 900,
    `retry_after_seconds must be a positive integer within the 900s/15min window (got ${sixth.retry_after_seconds})`);
  const persisted = await rootQuery(
    "select outcome from clara.confirmation_attempts where id=$1", [sixth.attempt_id],
  );
  assert.deepEqual(persisted.rows, [{ outcome: null }], "the refused sixth attempt was inserted first");

  const concurrentEmail = digest("h3-concurrent-email");
  for (let i = 0; i < 4; i += 1) {
    const prior = await claimConfirmation(concurrentEmail, digest(`h3-concurrent-origin-${i}`));
    await settleConfirmation(prior.attempt_id, "rejected");
  }
  await twoSessions(async (winner, loser) => {
    const winnerPid = await beginRoleTxn(winner, "clara_auth_wall");
    const loserPid = await beginRoleTxn(loser, "clara_auth_wall");
    const won = await winner.query(
      "select clara.claim_confirmation_attempt($1,$2) as result",
      [concurrentEmail, digest("h3-concurrent-winner")],
    );
    assert.equal(won.rows[0].result.allowed, true);
    const losingCall = loser.query(
      "select clara.claim_confirmation_attempt($1,$2) as result",
      [concurrentEmail, digest("h3-concurrent-loser")],
    );
    await waitBlockedByOrThrow(loserPid, winnerPid);
    await winner.query("commit");
    const lost = await losingCall;
    assert.equal(lost.rows[0].result.allowed, false,
      "the serialized email limb sees the winner as the fifth prior attempt");
    assert.equal(lost.rows[0].result.scope, "email", "#488 seam ruling on the concurrent loser too");
    assert.ok(Number.isInteger(lost.rows[0].result.retry_after_seconds)
      && lost.rows[0].result.retry_after_seconds > 0 && lost.rows[0].result.retry_after_seconds <= 900);
    await loser.query("commit");
  });
});

cell("c3.29 W-H4 -- six addresses at one origin trip the independent origin limb", async () => {
  const origin = digest("h4-origin");
  for (let i = 0; i < 5; i += 1) {
    const attempt = await claimConfirmation(digest(`h4-email-${i}`), origin);
    assert.equal(attempt.allowed, true);
    await settleConfirmation(attempt.attempt_id, "rejected");
  }
  const sixthEmail = digest("h4-email-6");
  const sixth = await claimConfirmation(sixthEmail, origin);
  assert.equal(sixth.allowed, false, "origin C2 refuses although this email has no prior guess");
  assert.equal(sixth.scope, "origin", "#488 seam ruling: a fresh email digest cannot fire the email limb");
  assert.ok(Number.isInteger(sixth.retry_after_seconds)
    && sixth.retry_after_seconds > 0 && sixth.retry_after_seconds <= 900,
    `retry_after_seconds must be a positive integer within the 900s/15min window (got ${sixth.retry_after_seconds})`);
  const ownCount = await rootQuery(
    "select count(*)::int as n from clara.confirmation_attempts where email_digest=$1", [sixthEmail],
  );
  assert.equal(ownCount.rows[0].n, 1);

  const concurrentOrigin = digest("h4-concurrent-origin");
  for (let i = 0; i < 4; i += 1) {
    const prior = await claimConfirmation(digest(`h4-concurrent-prior-${i}`), concurrentOrigin);
    await settleConfirmation(prior.attempt_id, "rejected");
  }
  await twoSessions(async (winner, loser) => {
    const winnerPid = await beginRoleTxn(winner, "clara_auth_wall");
    const loserPid = await beginRoleTxn(loser, "clara_auth_wall");
    const won = await winner.query(
      "select clara.claim_confirmation_attempt($1,$2) as result",
      [digest("h4-concurrent-winner"), concurrentOrigin],
    );
    assert.equal(won.rows[0].result.allowed, true);
    const losingCall = loser.query(
      "select clara.claim_confirmation_attempt($1,$2) as result",
      [digest("h4-concurrent-loser"), concurrentOrigin],
    );
    await waitBlockedByOrThrow(loserPid, winnerPid);
    await winner.query("commit");
    const lost = await losingCall;
    assert.equal(lost.rows[0].result.allowed, false,
      "the serialized origin limb sees the winner although the email digest is new");
    assert.equal(lost.rows[0].result.scope, "origin", "#488 seam ruling on the concurrent loser too");
    assert.ok(Number.isInteger(lost.rows[0].result.retry_after_seconds)
      && lost.rows[0].result.retry_after_seconds > 0 && lost.rows[0].result.retry_after_seconds <= 900);
    await loser.query("commit");
  });
});

cell("c3.30 W-H5 -- an unsettled attempt counts fail-closed against the next window", async () => {
  const email = digest("h5-email");
  const origin = digest("h5-origin");
  for (let i = 0; i < 4; i += 1) {
    const attempt = await claimConfirmation(email, origin);
    await settleConfirmation(attempt.attempt_id, "rejected");
  }
  const unsettled = await claimConfirmation(email, origin);
  assert.equal(unsettled.allowed, true);
  const sixth = await claimConfirmation(email, origin);
  assert.equal(sixth.allowed, false, "four rejected + one still-unsettled consume all five prior slots");
  assert.equal(sixth.scope, "email", "#488 seam ruling: same-pair digests take the email/C1 precedence");
  assert.ok(Number.isInteger(sixth.retry_after_seconds)
    && sixth.retry_after_seconds > 0 && sixth.retry_after_seconds <= 900);
  const row = await rootQuery(
    "select outcome,settled_at from clara.confirmation_attempts where id=$1", [unsettled.attempt_id],
  );
  assert.deepEqual(row.rows, [{ outcome: null, settled_at: null }]);
});

// F1 (opus review on #493, BLOCKER): c3.28/c3.29 asserted only that retry_after_seconds falls in
// (0, 900] -- exactly the range that let the original off-by-one offset (N-5, targeting the
// OLDEST prior) survive the whole battery, because a wrong-but-plausible value is still inside
// that range. This cell pins the DB-COMPUTED value against independently-derived, injected
// attempted_at rows, discriminating the fixed offset (N-4, the SECOND-oldest of five identical
// N=5 priors) from the pre-fix one by construction (five DISTINCT backdated timestamps, so the
// two candidate targets have different, checkable expiries). THIS IS THE DISCRIMINATING CELL for
// the offset half of F1 -- c3.30b below is a positive control, not a discriminator (see its own
// header note).
// NOTE-3 (opus review on 99e7573e, MEASURED ~0.2%/run spurious mismatch): `expected` is computed
// IN SQL, mirroring the door's own ceiling+rounding expression against the SAME persisted
// attempted_at values the door read, rather than through a JS `Date` (millisecond-truncated,
// while the door computes at microsecond precision) -- eliminating the cross-precision boundary
// entirely while keeping the cell's discriminating power (the target row is still the
// explicitly-selected, hardcoded 2nd-oldest; a reverted offset would select a different row and
// this comparison would redden).
cell("c3.30a W-H3 exact value -- retry_after_seconds matches the DB-computed formula, not merely a range", async () => {
  const email = digest("value-email");
  const origin = digest("value-origin");
  const minutesAgo = [14, 13, 12, 11, 10]; // oldest first; five DISTINCT timestamps
  for (const mins of minutesAgo) {
    await rootQuery(
      `insert into clara.confirmation_attempts(email_digest,origin_digest,attempted_at)
       values ($1,$2,now()-interval '1 minute'*$3::int)`,
      [email, origin, mins],
    );
  }
  const sixth = await claimConfirmation(email, origin);
  assert.equal(sixth.allowed, false);
  assert.equal(sixth.scope, "email");
  const ordered = await rootQuery(
    `select id,attempted_at from clara.confirmation_attempts
      where email_digest=$1 and id<>$2 order by attempted_at asc`,
    [email, sixth.attempt_id],
  );
  assert.equal(ordered.rowCount, 5);
  const oldest = ordered.rows[0];
  const target = ordered.rows[1]; // N=5 -> offset N-4=1 -> the SECOND-oldest
  assert.notEqual(new Date(oldest.attempted_at).getTime(), new Date(target.attempted_at).getTime(),
    "the fixture's five backdated rows must be distinct for this cell to discriminate the offset fix");
  const expectedRow = await rootQuery(
    `select least(900,greatest(0,ceil(extract(epoch from
         ((a2.attempted_at+interval '15 minutes')-a6.attempted_at)))))::int as expected
       from clara.confirmation_attempts a2, clara.confirmation_attempts a6
      where a2.id=$1 and a6.id=$2`,
    [target.id, sixth.attempt_id],
  );
  assert.equal(sixth.retry_after_seconds, expectedRow.rows[0].expected,
    `retry_after_seconds must equal the DB-computed formula exactly (expected ${expectedRow.rows[0].expected}, got ${sixth.retry_after_seconds})`);
});

// F1 (opus review on #493, BLOCKER): the review traced the concrete failure loop under the old
// offset -- a compliant caller who waits exactly the advertised time is STILL refused, forever,
// because the wait was computed against the wrong (too-early-expiring) row. This cell proves the
// loop actually closes: backdate five rows to just under the window's edge so the real advertised
// wait is a few seconds (achievable in a test), wait that long for real, and confirm the retry is
// genuinely ALLOWED -- not merely that a number was returned.
// IMPORTANT, per the opus review's own clarification (folded in so nobody later prunes c3.30a
// believing this cell already covers its ground): this is a POSITIVE loop-closure CONTROL, not a
// discriminator. The PRE-FIX body also eventually passes this cell -- the bug was an undercounted
// ADVERTISED wait, never a wait that fails to end at all. c3.30a above is the cell that actually
// discriminates the fixed offset from the bug.
// NEW-2 (opus review on 99e7573e, MEASURED load-dependent flake): the original fixture (five
// SEQUENTIAL inserts backdated 14m58s, a 2-second total margin) reds under real host load once
// setup exceeds ~2.5s wall-time (measured table: 0-2s PASS, 2.5s+ RED) -- six round trips cannot
// be assumed to fit a 2-second budget on this estate's own hardware (the 0xC0000142 host-
// exhaustion night is exactly this class). Fixed: ONE insert statement off a single now() (two
// round trips total before the wait, not six) and the backdate eased to 14m55s (~5s of margin) --
// kept as small as the margin allows, so the added real wait stays bounded (~6s) rather than
// padded defensively.
// ADD-2 (opus review on #493, folded so nobody later "fixes" this cell by weakening the
// mechanism): the reviewer tried, and MEASURED, a zero-sleep alternative -- shift the fixture
// rows BACK by retry_after instead of sleeping, provably equivalent since the window is purely
// relative to attempted_at. It is REFUSED by the shipped `_tf_confirmation_attempt_settle_stamp`
// trigger ("confirmation_attempts permits only the first complete settlement stamp") -- rows are
// append-only except the one settle transition, and `attempted_at` is not it. The only way to get
// a zero-sleep version would be disabling that trigger for the test, which hard constraint 14
// forbids (the product's own append-only mechanism is never weakened for testing convenience).
// The real setTimeout below is therefore FORCED by that trigger, not a lazy shortcut.
cell("c3.30b W-H3 the loop actually closes -- waiting the advertised time yields a real ALLOW", async () => {
  const email = digest("loop-email");
  const origin = digest("loop-origin");
  await rootQuery(
    `insert into clara.confirmation_attempts(email_digest,origin_digest,attempted_at)
     select $1,$2,now()-interval '14 minutes 55 seconds' from generate_series(1,5)`,
    [email, origin],
  );
  const sixth = await claimConfirmation(email, origin);
  assert.equal(sixth.allowed, false);
  assert.ok(Number.isInteger(sixth.retry_after_seconds)
    && sixth.retry_after_seconds > 0 && sixth.retry_after_seconds <= 10,
    `fixture expects a short, test-waitable advertised wait (got ${sixth.retry_after_seconds}s)`);
  // "also fold" (opus review on #493): sleeping retry_after+1 masks a 1-second UNDER-
  // advertisement mutant (an off-by-one that shaved a second off the formula would still pass,
  // since the extra second of slack absorbs it). Sleep EXACTLY the advertised wait -- any real
  // execution overhead between reading retry_after and this timer starting only ADDS margin
  // relative to v_attempted_at, it never subtracts, so this is not a flakiness trade.
  await new Promise((resolve) => { setTimeout(resolve, sixth.retry_after_seconds * 1000); });
  const seventh = await claimConfirmation(email, origin);
  assert.equal(seventh.allowed, true,
    "waiting exactly the advertised time must unblock a genuinely compliant retry -- the F1 close, executed for real");
});

// BLOCKER 1 (opus cross-family leg on #493, final run before 裁-111 suspended that leg): the row
// this call just inserted counts toward BOTH limbs' future windows, so the advertised wait must
// be the MAX of each limb's own independently-computed wait, not merely the limb that fired
// today. c3.30a/c3.30b both use ONE fixed email+origin pair (their two limbs are always tied or
// trivially one-sided), so neither could have caught this -- both cells below use INDEPENDENT,
// interleaved schedules (distinct emails sharing the caller's origin; distinct origins sharing
// the caller's email) and assert the exact computed value, pure injection, no sleep.
// The two BLOCKER-1 cells derive their expected waits from the DB (hard constraint 2 -- the model
// supplies no numeral), and these two statements are that derivation. Each rebuilds the population
// the door counted, using the SAME three predicates the door's own counting query uses -- the
// claim row excluded, the EXCLUSIVE 15-minute far edge anchored on the claim row's own
// `attempted_at` (never on a second `now()`), and the accepted-outcome exclusion -- and then takes
// the same `offset count-4` member (expressed as `rn = n-3`, one-based). Deriving from a DIFFERENT
// population than the door is what let the old shape disagree with it under host delay. `$1` is
// the email digest, `$2` the origin digest, `$3` the claim's attempt id.
const LIMB_WAIT = `least(900,greatest(0,ceil(extract(epoch from
  ((p.attempted_at+interval '15 minutes')-p.claimed_at)))))::int`;
const limbCte = (column) => `
  select a.attempted_at, s.attempted_at as claimed_at,
         row_number() over (order by a.attempted_at asc) as rn,
         count(*) over () as n
    from clara.confirmation_attempts a, claimed s
   where a.id<>$3 and a.${column}
     and a.attempted_at>s.attempted_at-interval '15 minutes'
     and a.outcome is distinct from 'accepted'`;
const windowedLimbSql = `
with claimed as (select attempted_at from clara.confirmation_attempts where id=$3),
     e as (${limbCte("email_digest=$1")}),
     o as (${limbCte("origin_digest=$2")})
select (select coalesce(max(n),0) from e)::int as email_count,
       (select coalesce(max(n),0) from o)::int as origin_count,
       (select ${LIMB_WAIT} from e p where p.rn=p.n-3) as email_wait,
       (select ${LIMB_WAIT} from o p where p.rn=p.n-3) as origin_wait`;
// The sparse cell needs the figure the UNGUARDED formula would have manufactured, which is the
// same population at `offset 0` (`rn=1`) rather than at `count-4` -- deliberately not the door's
// offset, because the point of the cell is that the guard refuses to compute it at all.
const windowedSparseLimbSql = `
with claimed as (select attempted_at from clara.confirmation_attempts where id=$3),
     e as (${limbCte("email_digest=$1")}),
     o as (${limbCte("origin_digest=$2")})
select (select coalesce(max(n),0) from e)::int as email_count,
       (select coalesce(max(n),0) from o)::int as origin_count,
       (select ${LIMB_WAIT} from e p where p.rn=p.n-3) as email_wait,
       (select ${LIMB_WAIT} from o p where p.rn=1) as naive_origin_wait`;

// TIME-PINNED (round-3 fold on #493, after a measured flake). Both cells below run their priors
// AND the door's own insert inside ONE transaction, so `now()` is the transaction timestamp and is
// byte-identical for every backdated prior and for the row the door appends. That is what makes
// "899 seconds old" mean 899 seconds to the door, no matter how slow the host is. The previous
// shape inserted nine priors in nine separate round-trips, each with its own `now()`, leaving the
// oldest prior under one second of margin against the EXCLUSIVE far edge: under load it aged out,
// the count fell from 5 to 4, and the door correctly returned `allowed:true` -- a red that was the
// fixture's fault, not the door's (measured once in six focused runs). The window is NOT widened
// and no slack is added; the clock is pinned instead, so the cell measures the predicate.
// The expected-value queries below now filter by the SAME window and the SAME accepted-exclusion
// the door applies, and take the same `count-4` offset, so the two derivations cannot disagree.
cell("c3.30c BLOCKER-1 dense -- both limbs contribute; the advertised wait is the MAX, scope names the slower one", async () => {
  await withTxn(async (c) => {
    const email = digest("blocker1-email");
    const origin = digest("blocker1-origin");
    // Five EMAIL priors (this caller's real email, five unrelated/independent origins) -- N=5>=4,
    // contributes. A near-boundary spread, so the 2nd-oldest (F1's own offset) expires a few
    // seconds after the claim. One statement, one `now()`.
    const emailSecs = [899, 898, 897, 896, 895];
    await c.query(
      `insert into clara.confirmation_attempts(email_digest,origin_digest,attempted_at)
       select $1,p.origin,now()-make_interval(secs=>p.secs)
         from unnest($2::bytea[],$3::int[]) as p(origin,secs)`,
      [email, emailSecs.map((s) => digest(`blocker1-unrelated-origin-${s}`)), emailSecs],
    );
    // Four ORIGIN priors (this caller's real origin, four unrelated/independent emails) -- N=4,
    // exactly at the guard boundary, contributes. Backdated LESS far back than the email group, so
    // its oldest-of-4 (offset 0) expires LATER -- the limb that will still be blocking.
    const originSecs = [890, 889, 888, 887];
    await c.query(
      `insert into clara.confirmation_attempts(email_digest,origin_digest,attempted_at)
       select p.email,$1,now()-make_interval(secs=>p.secs)
         from unnest($2::bytea[],$3::int[]) as p(email,secs)`,
      [origin, originSecs.map((s) => digest(`blocker1-unrelated-email-${s}`)), originSecs],
    );
    await c.query("set role clara_auth_wall");
    const sixth = (await c.query(
      "select clara.claim_confirmation_attempt($1,$2) as result", [email, origin],
    )).rows[0].result;
    await c.query("reset role");
    assert.equal(sixth.allowed, false);
    const expected = await c.query(windowedLimbSql, [email, origin, sixth.attempt_id]);
    const {
      email_count: emailCount, origin_count: originCount,
      email_wait: emailWait, origin_wait: originWait,
    } = expected.rows[0];
    // Fixture guards on the POPULATION the door actually counted -- these are what turn a drifted
    // or aged-out fixture into a named failure instead of a confusing value mismatch.
    assert.deepEqual({ emailCount, originCount }, { emailCount: 5, originCount: 4 },
      "the door must have counted exactly the nine pinned priors, five on email and four on origin");
    assert.ok(originWait > emailWait,
      `fixture must make origin the slower limb for this cell to discriminate the single-limb bug (email=${emailWait}, origin=${originWait})`);
    assert.equal(sixth.retry_after_seconds, Math.max(emailWait, originWait),
      `retry_after_seconds must be the MAX of both limbs (email=${emailWait}, origin=${originWait}, got ${sixth.retry_after_seconds})`);
    assert.equal(sixth.scope, "origin",
      "scope must name the SLOWER limb -- the one the caller must actually outlast -- even though email fired today");
  }, { commit: false });
});

cell("c3.30d BLOCKER-1 sparse-limb guard -- a limb below N=4 contributes nothing, never a manufactured wait", async () => {
  await withTxn(async (c) => {
    const email = digest("blocker1-sparse-email");
    const origin = digest("blocker1-sparse-origin");
    // Five EMAIL priors as above -- N=5, contributes, and is the ONLY real constraint here.
    const emailSecs = [899, 898, 897, 896, 895];
    await c.query(
      `insert into clara.confirmation_attempts(email_digest,origin_digest,attempted_at)
       select $1,p.origin,now()-make_interval(secs=>p.secs)
         from unnest($2::bytea[],$3::int[]) as p(origin,secs)`,
      [email, emailSecs.map((s) => digest(`blocker1-sparse-unrelated-origin-${s}`)), emailSecs],
    );
    // ONE origin prior only -- N=1<4. Backdated far enough (5 minutes) that the UNGUARDED formula
    // (offset=greatest(1-4,0)=0, picking this single row as if it were a real target) would
    // manufacture a ~10-minute wait; the guard must report this limb as contributing NOTHING.
    await c.query(
      `insert into clara.confirmation_attempts(email_digest,origin_digest,attempted_at)
       values ($1,$2,now()-interval '5 minutes')`,
      [digest("blocker1-sparse-unrelated-email"), origin],
    );
    await c.query("set role clara_auth_wall");
    const sixth = (await c.query(
      "select clara.claim_confirmation_attempt($1,$2) as result", [email, origin],
    )).rows[0].result;
    await c.query("reset role");
    assert.equal(sixth.allowed, false);
    const rows = await c.query(windowedSparseLimbSql, [email, origin, sixth.attempt_id]);
    const {
      email_count: emailCount, origin_count: originCount,
      email_wait: emailWait, naive_origin_wait: naiveOriginWait,
    } = rows.rows[0];
    assert.deepEqual({ emailCount, originCount }, { emailCount: 5, originCount: 1 },
      "the door must have counted exactly the six pinned priors, five on email and one on origin");
    assert.ok(naiveOriginWait > emailWait,
      `fixture must make the UNGUARDED origin figure larger than email for this cell to discriminate the guard (email=${emailWait}, naive origin=${naiveOriginWait})`);
    assert.equal(sixth.retry_after_seconds, emailWait,
      `a sparse limb (N<4) must contribute nothing -- retry_after_seconds must equal email's own wait alone, not the manufactured naive origin figure ${naiveOriginWait} (got ${sixth.retry_after_seconds})`);
    assert.equal(sixth.scope, "email",
      "scope must name email -- origin's single prior never binds anything");
  }, { commit: false });
});

// ADD-1 (opus review on #493): c3.30a's fixture yields ~120s, nowhere near the 900-second
// contract ceiling. Same transaction, same statement-level now() for five fresh priors and the
// claim itself: the true duration is EXACTLY 900.0 and ceil(900.0)=900. A separate retry whose
// priors are exactly 900 seconds old proves the exclusive far edge directly: equality is expired.
cell("c3.30e exact 900-second boundary -- the far-edge tie is expired and the fresh tie advertises 900", async () => {
  await withTxn(async (c) => {
    const email = digest("exclusive-edge-email");
    const origin = digest("exclusive-edge-origin");
    await c.query(
      `insert into clara.confirmation_attempts(email_digest,origin_digest,attempted_at)
       select $1,$2,now()-interval '15 minutes' from generate_series(1,5)`,
      [email, origin],
    );
    await c.query(`set role clara_auth_wall`);
    const retryAt900 = await c.query(
      "select clara.claim_confirmation_attempt($1,$2) as result", [email, origin],
    );
    assert.equal(retryAt900.rows[0].result.allowed, true,
      "at the exact +900 second tie, the prior rows are expired by the exclusive far edge");
  }, { commit: false });
  await withTxn(async (c) => {
    const email = digest("clamp-email");
    const origin = digest("clamp-origin");
    await c.query(
      `insert into clara.confirmation_attempts(email_digest,origin_digest)
       select $1,$2 from generate_series(1,5)`,
      [email, origin],
    );
    await c.query(`set role clara_auth_wall`);
    const sixth = await c.query(
      "select clara.claim_confirmation_attempt($1,$2) as result", [email, origin],
    );
    assert.equal(sixth.rows[0].result.allowed, false);
    assert.equal(sixth.rows[0].result.retry_after_seconds, 900,
      `an exact-microsecond fresh tie must advertise 900 (got ${sixth.rows[0].result.retry_after_seconds})`);
  }, { commit: false });
  await withTxn(async (c) => {
    const email2 = digest("clamp-email2");
    const origin2 = digest("clamp-origin2");
    // Five priors sharing the caller's ORIGIN with unrelated emails -- N=5>=4 for origin,
    // contributes; email2 has ZERO priors (N=0<4, contributes nothing) -- forces scope=origin so
    // this same-transaction tie is proven on the ORIGIN branch of the clamp too, not only email's.
    for (let i = 0; i < 5; i += 1) {
      await c.query(
        `insert into clara.confirmation_attempts(email_digest,origin_digest) values ($1,$2)`,
        [digest(`clamp-unrelated-email-${i}`), origin2],
      );
    }
    await c.query(`set role clara_auth_wall`);
    const sixth = await c.query(
      "select clara.claim_confirmation_attempt($1,$2) as result", [email2, origin2],
    );
    assert.equal(sixth.rows[0].result.allowed, false);
    assert.equal(sixth.rows[0].result.scope, "origin");
    assert.equal(sixth.rows[0].result.retry_after_seconds, 900,
      `the origin scope's exact-microsecond fresh tie must also advertise 900 (got ${sixth.rows[0].result.retry_after_seconds})`);
  }, { commit: false });
});

cell("c3.30f accepted outcomes -- five accepted priors consume none of the counting window", async () => {
  const email = digest("accepted-email");
  const origin = digest("accepted-origin");
  for (let i = 0; i < 5; i += 1) {
    const attempt = await claimConfirmation(email, origin);
    assert.equal(attempt.allowed, true);
    await settleConfirmation(attempt.attempt_id, "accepted");
  }
  const next = await claimConfirmation(email, origin);
  assert.equal(next.allowed, true, "accepted outcomes are excluded from both count limbs");
  assert.equal(next.remaining, 4, "only the newly appended unsettled attempt spends the budget");
});

cell("c3.31 settle wall -- outcome is typed and a completed attempt cannot re-settle", async () => {
  const attempt = await claimConfirmation(digest("settle-email"), digest("settle-origin"));
  await expectRefusal(CLR.badRequest, () => settleConfirmation(attempt.attempt_id, "maybe"),
    /outcome must be accepted or rejected/, "invalid settle outcome");
  assert.deepEqual(await settleConfirmation(attempt.attempt_id, "accepted"), {
    attempt_id: attempt.attempt_id, outcome: "accepted",
  });
  await expectRefusal(CLR.lastOwner, () => settleConfirmation(attempt.attempt_id, "rejected"),
    /already settled/, "confirmation re-settle");
});

// ------------------------------------------------------------------------------------------------
// claim_paid_firm -- the folded money -> firm transaction and all discriminating panels.
// ------------------------------------------------------------------------------------------------
cell("c3.32 claim W1 -- no authenticated actor", async () => {
  await expectRefusal(CLR.authz, () => roleQuery(
    ROLES.authenticated, "select clara.claim_paid_firm($1,$2)", [randomUUID(), opk()],
  ), /no authenticated actor/, "claim no-auth");
});

cell("c3.33 claim W2 -- unknown actor", async () => {
  await expectRefusal(CLR.authz, () => authenticatedQuery(
    randomUUID(), "unknown@rig.test", "select clara.claim_paid_firm($1,$2)", [randomUUID(), opk()],
  ), /unknown actor/, "claim unknown actor");
});

cell("c3.34 claim W3 -- agent identity refuses", async () => {
  await expectRefusal(CLR.authz, () => authenticatedQuery(
    AGENT_USER_ID, "agent@rig.test", "select clara.claim_paid_firm($1,$2)", [randomUUID(), opk()],
  ), /agent identity cannot claim a firm/, "claim agent");
});

cell("c3.35 claim W4 -- op_key is required", async () => {
  const user = await insertUser("c3", "claim_op");
  await expectRefusal(CLR.badRequest, () => authenticatedQuery(
    user, "claim-op@rig.test", "select clara.claim_paid_firm($1,$2)", [randomUUID(), " "],
  ), /op_key is required/, "claim op key");
});

cell("c3.36 claim W5 -- unknown registration", async () => {
  const user = await insertUser("c3", "claim_unknown");
  await expectRefusal(CLR.badRequest, () => authenticatedQuery(
    user, "claim-unknown@rig.test", "select clara.claim_paid_firm($1,$2)", [randomUUID(), opk()],
  ), /unknown registration request/, "claim unknown registration");
});

cell("c3.37 claim W6 -- another applicant's registration is not mine", async () => {
  const owner = await insertUser("c3", "claim_owner");
  const attacker = await insertUser("c3", "claim_attacker");
  const req = await insertRegistration(owner, "claim_owner");
  await expectRefusal(CLR.authz, () => authenticatedQuery(
    attacker, "claim-attacker@rig.test", "select clara.claim_paid_firm($1,$2)", [req.id, opk()],
  ), /not your registration request/, "claim ownership");
});

cell("c3.38 claim W10 -- JWT email is required and bound to the actor's stored email", async () => {
  const chain = await buildPaidChain({ tag: "claim_email" });
  await expectRefusal(CLR.authz, () => humanQuery(
    chain.user, "select clara.claim_paid_firm($1,$2)", [chain.registration, opk()],
  ), /verified email claim is required/, "claim missing email");
  await expectRefusal(CLR.authz, () => authenticatedQuery(
    chain.user, `foreign-${randomUUID()}@rig.test`,
    "select clara.claim_paid_firm($1,$2)", [chain.registration, opk()],
  ), /verified email claim is required/, "claim foreign email");
  assert.ok((await claim(chain)).firm_id, "the actor's own normalized stored email is admitted");
});

cell("c3.39 claim W7 -- a rejected registration is terminal", async () => {
  const chain = await buildPaidChain({ tag: "w7_rejected" });
  await rootQuery(
    "update clara.firm_registration_requests set status='rejected',decided_at=now(),reason='rig' where id=$1",
    [chain.registration],
  );
  await expectRefusal(CLR.lastOwner, () => claim(chain),
    /no longer open \(status: rejected\)/, "claim rejected registration");
});

cell("c3.40 claim sequential replay -- one firm, membership and event pair; firm.created is seq 1", async () => {
  const chain = await buildPaidChain({ tag: "replay" });
  const first = await claim(chain);
  const second = await claim(chain);
  assert.deepEqual(
    { firm_id: second.firm_id, plan_id: second.plan_id, registration_id: second.registration_id }, first,
  );
  assert.equal(second.replay, true);
  const state = await rootQuery(
    `select
       (select count(*)::int from clara.firms where id=$1) as firms,
       (select count(*)::int from clara.firm_memberships where firm_id=$1 and user_id=$2) as memberships,
       (select count(*)::int from clara.domain_events where firm_id=$1) as events`,
    [first.firm_id, chain.user],
  );
  assert.deepEqual(state.rows[0], { firms: 1, memberships: 1, events: 2 });
  const events = await rootQuery(
    "select seq::int,event_type from clara.domain_events where firm_id=$1 order by seq", [first.firm_id],
  );
  assert.deepEqual(events.rows, [
    { seq: 1, event_type: "firm.created" },
    { seq: 2, event_type: "firm_registration.paid" },
  ]);
  const req = await rootQuery(
    "select status,firm_id,decided_by from clara.firm_registration_requests where id=$1", [chain.registration],
  );
  assert.deepEqual(req.rows[0], { status: "approved", firm_id: first.firm_id, decided_by: null });
});

cell("c3.41 claim W8 -- signature at a different version cannot satisfy the pinned intent", async () => {
  const old = await createNoncurrentDpa("w8-pinned");
  const chain = await buildPaidChain({ tag: "w8", dpaVersion: old.version, sign: false });
  await signDpa(chain.user, chain.email); // a real signature, but at the current (different) version
  await expectRefusal(CLR.lastOwner, () => claim(chain),
    /data processing agreement is not signed/, "claim wrong DPA version");
});

cell("c3.42 W-I3 -- superseding after checkout does not move the intent's DPA pin", async () => {
  const chain = await buildPaidChain({ tag: "wi3" });
  await withTxn(async (c) => {
    const prior = await c.query("select version from clara.dpa_documents where effective_to is null");
    await c.query("update clara.dpa_documents set effective_to=now() where version=$1", [prior.rows[0].version]);
    const version = `c3-wi3-new-${randomUUID()}`;
    const body = `C-3 W-I3 newer text ${randomUUID()}`;
    await c.query(
      `insert into clara.dpa_documents(version,body,body_sha256,source_path,effective_from)
       values ($1,$2,sha256(convert_to($2,'UTF8')),$3,now())`,
      [version, body, `docs/ops/legal/${version}.md`],
    );
    await c.query(`set role ${ROLES.authenticated}`);
    await c.query("select set_config('request.jwt.claims',$1,true)", [
      JSON.stringify({ sub: chain.user, email: chain.email }),
    ]);
    const result = await c.query("select clara.claim_paid_firm($1,$2) as result", [chain.registration, opk()]);
    assert.ok(result.rows[0].result.firm_id, "claim follows the paid intent's old signed version");
  }, { commit: false });
});

cell("c3.43 claim W9a -- no payment row refuses", async () => {
  const user = await insertUser("c3", "w9_none");
  const email = (await rootQuery(
    "select lower(email) as email from clara.users where id=$1", [user],
  )).rows[0].email;
  await signDpa(user, email);
  const req = await insertRegistration(user, "w9_none");
  const session = stripeSessionId("w9none");
  await directIntent({ registration: req.id, applicant: user, session });
  await expectRefusal(CLR.lastOwner, () => authenticatedQuery(
    user, email, "select clara.claim_paid_firm($1,$2)", [req.id, opk()],
  ), /no completed payment for this registration/, "claim without payment");
});

cell("c3.44 claim W9b -- an already-consumed payment cannot be reused", async () => {
  const chain = await buildPaidChain({ tag: "w9_consumed" });
  const dummyFirm = await rootQuery(
    "insert into clara.firms(name) values ($1) returning id", [`c3_w9_dummy_${randomUUID()}`],
  );
  await rootQuery(
    `update clara.firm_registration_payments
        set consumed_at=now(),consumed_firm_id=$2,consumed_dpa_signature=$3 where id=$1`,
    [chain.payment, dummyFirm.rows[0].id, chain.signature.result.signature_id],
  );
  await expectRefusal(CLR.lastOwner, () => claim(chain),
    /no completed payment for this registration/, "claim consumed payment");
});

cell("c3.45 W-D/cross-caller -- payment and registration remain untouched after ownership refusal", async () => {
  const chain = await buildPaidChain({ tag: "wd" });
  const attacker = await insertUser("c3", "wd_attacker");
  await createExistingFirm(attacker, "wd_cross");
  await expectRefusal(CLR.authz, () => authenticatedQuery(
    attacker, "wd-attacker@rig.test", "select clara.claim_paid_firm($1,$2)",
    [chain.registration, opk()],
  ), /not your registration request/, "W-D cross-caller");
  const untouched = await rootQuery(
    `select r.firm_id,p.consumed_at,p.consumed_firm_id
       from clara.firm_registration_requests r
       join clara.firm_registration_payments p on p.registration_id=r.id where r.id=$1`,
    [chain.registration],
  );
  assert.deepEqual(untouched.rows, [{ firm_id: null, consumed_at: null, consumed_firm_id: null }]);
});

cell("c3.46 W-P atomicity -- downstream event failure rolls core/membership/closure/consumption back", async () => {
  const chain = await buildPaidChain({ tag: "atomicity" });
  await withTxn(async (c) => {
    await c.query(`create function pg_temp.c3_fail_paid_event() returns trigger language plpgsql as
      $fail$ begin
        if new.event_type='firm_registration.paid' then raise exception 'C3 forced mid-door failure'; end if;
        return new;
      end $fail$`);
    await c.query(`create trigger c3_force_paid_event_failure before insert on clara.domain_events
      for each row execute function pg_temp.c3_fail_paid_event()`);
    await c.query("savepoint claim_abort");
    await c.query(`set role ${ROLES.authenticated}`);
    await c.query("select set_config('request.jwt.claims',$1,true)", [
      JSON.stringify({ sub: chain.user, email: chain.email }),
    ]);
    let error = null;
    try {
      await c.query("select clara.claim_paid_firm($1,$2)", [chain.registration, opk()]);
    } catch (e) { error = e; }
    assert.match(error?.message ?? "", /C3 forced mid-door failure/);
    await c.query("rollback to savepoint claim_abort");
    await c.query("reset role");
    const state = await c.query(
      `select
        (select count(*)::int from clara.firms where name=$2) as firms,
        (select count(*)::int from clara.firm_memberships where user_id=$3) as memberships,
        (select status from clara.firm_registration_requests where id=$1) as status,
        (select firm_id from clara.firm_registration_requests where id=$1) as firm_id,
        (select consumed_at from clara.firm_registration_payments where id=$4) as consumed_at`,
      [chain.registration, chain.firmName, chain.user, chain.payment],
    );
    assert.deepEqual(state.rows[0], {
      firms: 0, memberships: 0, status: "open", firm_id: null, consumed_at: null,
    });
    await c.query("drop trigger c3_force_paid_event_failure on clara.domain_events");
  });
  const retry = await claim(chain);
  assert.ok(retry.firm_id, "the whole folded door succeeds after the forced abort is removed");
});

cell("c3.47 W-K -- concurrent loser observably blocks, then raises exact W7 CLR09", async () => {
  const chain = await buildPaidChain({ tag: "wk" });
  await twoSessions(async (winner, loser) => {
    for (const c of [winner, loser]) {
      await c.query(`set role ${ROLES.authenticated}`);
      await c.query("begin");
      await c.query("select set_config('request.jwt.claims',$1,true)", [
        JSON.stringify({ sub: chain.user, email: chain.email }),
      ]);
    }
    const winnerPid = Number((await winner.query("select pg_backend_pid() as pid")).rows[0].pid);
    const loserPid = Number((await loser.query("select pg_backend_pid() as pid")).rows[0].pid);
    const won = await winner.query("select clara.claim_paid_firm($1,$2) as result", [chain.registration, opk()]);
    assert.ok(won.rows[0].result.firm_id);
    const losingCall = loser.query("select clara.claim_paid_firm($1,$2)", [chain.registration, opk()])
      .then(() => ({ error: null })).catch((error) => ({ error }));
    await waitBlockedByOrThrow(loserPid, winnerPid);
    await winner.query("commit");
    const lost = await losingCall;
    assert.equal(lost.error?.code, CLR.lastOwner);
    assert.match(lost.error?.message ?? "", /this registration is no longer open \(status: approved\)/);
    await loser.query("rollback");
    await loser.query("reset role");
    const reread = await loser.query(
      "select firm_id from clara.firm_registration_requests where id=$1", [chain.registration],
    );
    assert.ok(reread.rows[0].firm_id, "the loser's own connection sees the committed firm_id after unblocking");
  });
});

cell("c3.48 W-L two-mutant panel -- index is the real two-firms wall", async () => {
  const member = await insertUser("c3", "wl_member");
  await createExistingFirm(member, "wl_existing");
  const chain = await buildPaidChain({ user: member, tag: "wl_second" });
  await withTxn(async (c) => {
    const body = (await c.query(
      "select prosrc from pg_proc where oid='clara._create_firm_core(uuid,text)'::regprocedure",
    )).rows[0].prosrc;
    const needle = `  if exists (select 1 from clara.firm_memberships where user_id = p_actor and status = 'active') then
    raise exception 'actor already belongs to a firm' using errcode = 'CLR10';
  end if;
`;
    assert.ok(body.includes(needle), "W-L mutant anchor must match the live exists pre-check exactly");
    const mutant = body.replace(needle, "");
    const installMutant = () => c.query(`create or replace function clara._create_firm_core(
      p_actor uuid,p_name text) returns jsonb language plpgsql security definer
      set search_path=clara,pg_temp as $mut$${mutant}$mut$`);

    // m1: pre-check gone AND backing index gone -> the forbidden second firm is observably created.
    await c.query("savepoint m1");
    await installMutant();
    await c.query("drop index clara.uq_membership_active_user");
    await c.query(`set role ${ROLES.authenticated}`);
    await c.query("select set_config('request.jwt.claims',$1,true)", [
      JSON.stringify({ sub: member, email: chain.email }),
    ]);
    const m1 = await c.query("select clara.claim_paid_firm($1,$2) as result", [chain.registration, opk()]);
    assert.ok(m1.rows[0].result.firm_id, "m1 reproduces the second-firm defect (the wall test would go RED)");
    await c.query("reset role");
    const memberships = await c.query(
      "select count(*)::int as n from clara.firm_memberships where user_id=$1 and status='active'", [member],
    );
    assert.equal(memberships.rows[0].n, 2);
    await c.query("rollback to savepoint m1");

    // m2: pre-check alone is gone; uq_membership_active_user fires and the catch translates CLR10.
    await c.query("savepoint m2");
    await installMutant();
    await c.query(`set role ${ROLES.authenticated}`);
    await c.query("select set_config('request.jwt.claims',$1,true)", [
      JSON.stringify({ sub: member, email: chain.email }),
    ]);
    const m2 = await expectRefusal(CLR.badRequest, () => c.query(
      "select clara.claim_paid_firm($1,$2)", [chain.registration, opk()],
    ), /actor already belongs to a firm/, "W-L m2 index catch");
    assert.equal(m2.code, CLR.badRequest);
    await c.query("rollback to savepoint m2");
    await c.query("reset role");
  });
  await expectRefusal(CLR.badRequest, () => claim(chain),
    /actor already belongs to a firm/, "W-L unmutated existing-member control");
  const fresh = await buildPaidChain({ tag: "wl_fresh" });
  assert.ok((await claim(fresh)).firm_id, "W-L unmutated no-membership control succeeds");
});

cell("c3.49 W-O -- Stripe webhook role cannot call the folded claim door", async () => {
  await expectRefusal(PG.insufficientPrivilege, () => roleQuery(
    "clara_stripe_webhook", "select clara.claim_paid_firm($1,$2)", [randomUUID(), opk()],
  ), /permission denied/, "webhook claim blast radius");
});

cell("c3.50 W-B/W-O2 -- forged valid webhook event positively creates a payment row", async () => {
  const user = await insertUser("c3", "wo2");
  const req = await insertRegistration(user, "wo2");
  const opened = await openIntent(user, req.id, digest("wo2"));
  const session = stripeSessionId("wo2");
  await recordSession(user, opened.intent_id, session, opened.email);
  const event = stripeEventId("wo2");
  await recordStripeEvent(event, {
    livemode: false, session_id: session, intent_id: opened.intent_id,
    registration_id: req.id, applicant: user, amount_total: 0, currency: "myr",
    payment_status: "paid", mode: "payment", session_status: "complete",
  });
  await roleQuery("clara_stripe_webhook", "select clara.apply_stripe_events(1000)");
  const payment = await rootQuery(
    "select registration_id,applicant,stripe_session_id from clara.firm_registration_payments where stripe_event_id=$1",
    [event],
  );
  assert.deepEqual(payment.rows, [{ registration_id: req.id, applicant: user, stripe_session_id: session }]);
});

cell("c3.51 W-T/BLOCKER-4 -- duplicate payment is poisoned per row; unrelated event still applies", async () => {
  const a = await insertUser("c3", "wt_a");
  const ra = await insertRegistration(a, "wt_a");
  const ia1 = await directIntent({ registration: ra.id, applicant: a, session: stripeSessionId("wta1") });
  const s1 = (await rootQuery("select session_id from clara.checkout_intents where id=$1", [ia1])).rows[0].session_id;
  const ia2 = await directIntent({ registration: ra.id, applicant: a, session: stripeSessionId("wta2") });
  const s2 = (await rootQuery("select session_id from clara.checkout_intents where id=$1", [ia2])).rows[0].session_id;
  const b = await insertUser("c3", "wt_b");
  const rb = await insertRegistration(b, "wt_b");
  const ib = await directIntent({ registration: rb.id, applicant: b, session: stripeSessionId("wtb") });
  const sb = (await rootQuery("select session_id from clara.checkout_intents where id=$1", [ib])).rows[0].session_id;
  const events = [stripeEventId("wt_a"), stripeEventId("wt_b"), stripeEventId("wt_z")];
  for (const [event, registration, applicant, intent, session] of [
    [events[0], ra.id, a, ia1, s1], [events[1], ra.id, a, ia2, s2], [events[2], rb.id, b, ib, sb],
  ]) {
    await recordStripeEvent(event, {
      livemode: false, session_id: session, intent_id: intent,
      registration_id: registration, applicant, payment_status: "paid",
      mode: "payment", session_status: "complete",
    });
  }
  await roleQuery("clara_stripe_webhook", "select clara.apply_stripe_events(1000)");
  const first = await rootQuery(
    "select stripe_event_id from clara.firm_registration_payments where registration_id=$1", [ra.id],
  );
  assert.deepEqual(first.rows, [{ stripe_event_id: events[0] }], "the first payment is untouched and unique");
  const poison = await rootQuery(
    "select problem,detail->>'constraint' as constraint_name from clara.stripe_event_problems where event_id=$1",
    [events[1]],
  );
  assert.deepEqual(poison.rows, [{ problem: "duplicate_payment", constraint_name: "uq_frp_registration" }]);
  const unrelated = await rootQuery(
    "select count(*)::int as n from clara.firm_registration_payments where stripe_event_id=$1", [events[2]],
  );
  assert.equal(unrelated.rows[0].n, 1, "the poison pill did not abort the unrelated event in the sweep");
});

cell("c3.52 W-M2 positive -- resolved intent-not-found event produces a real payment next sweep", async () => {
  const user = await insertUser("c3", "wm2");
  const req = await insertRegistration(user, "wm2");
  const intent = randomUUID();
  const session = stripeSessionId("wm2");
  const event = stripeEventId("wm2");
  await recordStripeEvent(event, {
    livemode: false, session_id: session, intent_id: intent,
    registration_id: req.id, applicant: user, payment_status: "paid",
    mode: "payment", session_status: "complete",
  });
  await roleQuery("clara_stripe_webhook", "select clara.apply_stripe_events(1000)");
  const problem = await rootQuery(
    "select id from clara.stripe_event_problems where event_id=$1 and problem='intent_not_found' and resolved_at is null",
    [event],
  );
  assert.equal(problem.rowCount, 1);
  await directIntent({ registration: req.id, applicant: user, session, id: intent });
  const operator = await ensureOperator();
  await humanQuery(
    operator,
    "select clara.resolve_stripe_event_problem(p_problem=>$1,p_resolution=>$2,p_op_key=>$3)",
    [problem.rows[0].id, "intent prerequisite now exists", opk()],
  );
  await roleQuery("clara_stripe_webhook", "select clara.apply_stripe_events(1000)");
  const applied = await rootQuery(
    "select registration_id from clara.firm_registration_payments where stripe_event_id=$1", [event],
  );
  assert.deepEqual(applied.rows, [{ registration_id: req.id }]);
});

cell("c3.52a unconsumed-payment read -- the operator owner sees the complete support row", async () => {
  const chain = await buildPaidChain({ tag: "unconsumed_visible" });
  const operator = await ensureOperator();
  const visible = await humanQuery(
    operator,
    `select registration_id,applicant,stripe_session_id,recorded_at
       from clara.list_unconsumed_registration_payments()
      where registration_id=$1`,
    [chain.registration],
  );
  assert.equal(visible.rowCount, 1);
  assert.deepEqual(
    {
      registration_id: visible.rows[0].registration_id,
      applicant: visible.rows[0].applicant,
      stripe_session_id: visible.rows[0].stripe_session_id,
    },
    { registration_id: chain.registration, applicant: chain.user, stripe_session_id: chain.session },
  );
  assert.ok(visible.rows[0].recorded_at instanceof Date,
    "the operator row carries the DB-owned payment recording timestamp");
});

cell("c3.52b unconsumed-payment read -- a non-operator firm owner is refused", async () => {
  const owner = await insertUser("c3", "unconsumed_nonoperator");
  await createExistingFirm(owner, "unconsumed_nonoperator");
  await expectRefusal(CLR.authz, () => humanQuery(
    owner, "select * from clara.list_unconsumed_registration_payments()",
  ), /insufficient role/, "non-operator owner cannot read registration payments");
});

cell("c3.52c unconsumed-payment read -- an operator-firm bookkeeper is refused", async () => {
  const operator = await ensureOperator();
  const operatorFirm = await rootQuery(
    `select firm_id from clara.firm_memberships
      where user_id=$1 and status='active' and role='owner'`,
    [operator],
  );
  assert.equal(operatorFirm.rowCount, 1);
  const bookkeeper = await insertUser("c3", "unconsumed_bookkeeper");
  await rootQuery(
    "insert into clara.firm_memberships(firm_id,user_id,role) values ($1,$2,'bookkeeper')",
    [operatorFirm.rows[0].firm_id, bookkeeper],
  );
  await expectRefusal(CLR.authz, () => humanQuery(
    bookkeeper, "select * from clara.list_unconsumed_registration_payments()",
  ), /insufficient role/, "operator bookkeeper cannot read registration payments");
});

// BLOCKER 2 (opus cross-family leg on #493, final run before 裁-111 suspended that leg): a
// text-level census, however carefully comment-stripped, is the WRONG tool for an anti-regression
// job on a money surface -- three bypasses were built and RUN against a scratch PG confirming
// each defeats it: (a) CASE -- an unquoted `Firm_Registration_Payments` executes correctly
// (Postgres folds unquoted identifiers to lowercase) but never matches a case-sensitive
// `position()`; (b) COMMENT-MARKER STRING-LITERAL POISONING -- `t := '--'; select ... from
// cb.firm_registration_payments ...` on one line: the stripper has no string-literal awareness,
// eats from the `--` inside the STRING to end-of-line, and deletes a real reference along with
// it; (c) fully dynamic SQL / quoted or Unicode-escape identifiers -- constructed at runtime,
// invisible to ANY static instrument, lexer included. A dynamic-SQL-construct refusal (EXECUTE/
// format(/quote_ident() closes NONE of these three -- none of the three bypasses contains those
// words at all.
// RULED: the right question for open_checkout_intent specifically is "was this body altered",
// which a prosrc SHA answers completely (case tricks, comment poisoning, Unicode escapes, and
// anything not yet invented all change the hash) -- the SAME idiom this migration already uses
// twice for create_firm's W-E3 pin (0161_checkout_gate_c3_folded_door.sql, the prestate/tail
// pair pinning it to sha12 59fa533d9c03). Pinning accepts the same cost the estate already pays
// there: every legitimate future edit to this body must update the pinned hash, deliberately --
// correct for a body that should be frozen from here.
// The set-equality census below is KEPT, lower-cased (closing bypass (a) only), for the WEAKER,
// still-useful question it CAN honestly answer: "did some NEW function start touching the money
// store" -- a real signal worth having, but not an anti-regression guard for THIS body, and not
// a defense against (b) or (c). Named, not implied covered (R15's fail-loud-or-list-it rule).
cell("c3.53 folded set equality -- exactly five money-store bodies; open_checkout_intent's body is SHA-pinned", async () => {
  const pinned = await rootQuery(
    `select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') as sha
       from pg_proc p where p.oid='clara.open_checkout_intent(uuid,bytea,text)'::regprocedure`,
  );
  assert.equal(pinned.rows[0].sha.slice(0, 12), OPEN_CHECKOUT_INTENT_PROSRC_SHA12,
    "open_checkout_intent's body moved -- case tricks, comment poisoning, Unicode-escape "
    + "identifiers, and any future evasion class all change this hash; if this edit is a real, "
    + "reviewed change to the door, update OPEN_CHECKOUT_INTENT_PROSRC_SHA12 deliberately");
  const refs = await rootQuery(
    `with stripped as (
       select p.proname,
              lower(regexp_replace(regexp_replace(p.prosrc, '/\\*[\\s\\S]*?\\*/', '', 'g'), '--[^\\n]*', '', 'g')) as code
         from pg_proc p join pg_namespace n on n.oid=p.pronamespace
        where n.nspname='clara'
     )
     select distinct proname from stripped
      where position('stripe_events' in code)>0 or position('firm_registration_payments' in code)>0
      order by proname`,
  );
  assert.deepEqual(refs.rows.map((r) => r.proname), [
    "apply_stripe_events", "claim_paid_firm", "list_unconsumed_registration_payments",
    "open_checkout_intent", "record_stripe_event",
  ], "this text census only answers whether a NEW function started mentioning the money tables "
    + "-- it is not the anti-regression guard for open_checkout_intent (the SHA pin above is)");
  const retired = await rootQuery(
    `select count(*)::int as n from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='clara' and p.proname='reconcile_paid_registrations'`,
  );
  assert.equal(retired.rows[0].n, 0);
});

cell("c3.54 W-E3 -- firm_admissions columns, indexes and rows remain byte-shape identical", async () => {
  assert.deepEqual(await admissionShape(), admissionBaseline);
});

cell("c3.55 event taxonomy and final structural census -- one paired type, no BYPASSRLS", async () => {
  const event = await rootQuery(
    `select
       (select count(*)::int from clara.event_types where name='firm_registration.paid') as types,
       (select count(*)::int from clara.trigger_taxonomy t join clara.taxonomy_active a on a.version=t.version
         where t.event_type='firm_registration.paid' and t.decision='context_update') as taxonomy`,
  );
  assert.deepEqual(event.rows[0], { types: 1, taxonomy: 1 });
  const bypass = await rootQuery(
    "select rolname from pg_roles where rolbypassrls and rolname like 'clara%'",
  );
  assert.deepEqual(bypass.rows, []);
  const relations = await rootQuery(
    `select c.relname,c.relrowsecurity,c.relforcerowsecurity,
            (select count(*)::int from information_schema.role_table_grants g
              where g.table_schema='clara' and g.table_name=c.relname and g.grantee<>'clara_fn_owner') as app_grants
       from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='clara' and c.relname=any($1::text[]) order by c.relname`, [TABLES],
  );
  assert.equal(relations.rowCount, 3);
  for (const row of relations.rows) {
    assert.equal(row.relrowsecurity, true);
    assert.equal(row.relforcerowsecurity, true);
    assert.equal(row.app_grants, 0);
  }
});

test("c3.VACUITY CONTROL -- every declared C-3 cell executed", (t) => {
  if (!live) {
    if (process.env.CLARA_ALLOW_MISSING_CHECKOUT_GATE_C3 === "1") {
      t.skip("checkout-gate C-3 cohort absent -- explicit pre-integration run");
      return;
    }
    assert.fail("checkout-gate C-3 cohort absent");
  }
  assert.equal(executed, EXPECTED_CELLS, `${EXPECTED_CELLS} C-3 cells executed before the control`);
});
