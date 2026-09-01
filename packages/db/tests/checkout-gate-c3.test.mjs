// FS-4 checkout gate, PR C-3. Design of record:
// docs/plan/active/checkout-gate-design{,-part2,-part3}.md.
// Every cell is independently gated so the UNNUMBERED pre-integration run skips loudly rather
// than calling an absent cohort green. The numbered authoring suite exercises every cell.

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
const EXPECTED_CELLS = 57; // +2 (c3.30a, c3.30b) from the #493 opus review's F1 fix round

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
    console.warn("SKIP checkout-gate-c3: the C-3 cohort is not applied (explicit unnumbered/pre-integration run).");
    t.skip("checkout-gate C-3 cohort absent -- explicit pre-integration run");
    return true;
  }
  assert.fail(
    "checkout-gate C-3 is required for a focused run: apply a numbered suite copy of UNNUMBERED_checkout_gate_c3_folded_door.sql",
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
  const email = `${tag}_${randomUUID()}@rig.test`;
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

cell("c3.26 session replay -- same value replays, different value refuses", async () => {
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
// IN SQL, mirroring the door's own clamp+rounding expression against the SAME persisted
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
    `select least(900,greatest(0,floor(extract(epoch from
         ((a2.attempted_at+interval '15 minutes')-a6.attempted_at)))+1))::int as expected
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
  await new Promise((resolve) => { setTimeout(resolve, (sixth.retry_after_seconds + 1) * 1000); });
  const seventh = await claimConfirmation(email, origin);
  assert.equal(seventh.allowed, true,
    "waiting exactly the advertised time must unblock a genuinely compliant retry -- the F1 close, executed for real");
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

cell("c3.38 claim W10 -- verified email claim is required before replay/locking", async () => {
  const user = await insertUser("c3", "claim_email");
  const req = await insertRegistration(user, "claim_email");
  await expectRefusal(CLR.authz, () => humanQuery(
    user, "select clara.claim_paid_firm($1,$2)", [req.id, opk()],
  ), /verified email claim is required/, "claim email");
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
  const email = `w9-none-${randomUUID()}@rig.test`;
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

cell("c3.53 folded set equality -- exactly four money-store bodies; reconciler remains unbuilt", async () => {
  // Design part3 §5's non-wall cell 2 was written in the two-door era and pins "three, not
  // five" -- record_stripe_event, apply_stripe_events, claim_paid_firm. X10 (open_checkout_intent
  // refusing "this registration is already paid") is a genuinely new wall that door did not carry
  // under the two-door design, and it needs a real, honest read of firm_registration_payments to
  // enforce it -- there is no other source of that fact. The set is therefore FOUR here, not
  // three, and this cell says so plainly rather than the door's body hiding the reference from
  // this exact census (a prior draft split the literal 'firm_registration_payments' identifier
  // via string concatenation specifically so this count would stay at three -- that is gaming
  // the instrument, not satisfying it, and was reverted). The retirement half below (no
  // reconcile_paid_registrations) still holds unchanged.
  // F3 (opus review on #493): the guard above caught a code-level evasion, but a bare
  // `position(... in p.prosrc)` is itself comment-blind -- the very explanatory comment this
  // cell's own PR left in open_checkout_intent's body (naming "firm_registration_payments" in
  // prose) is enough to satisfy this exact query even if the executable string-split evasion
  // were reintroduced verbatim beside it. Strip comments before matching, the same idiom
  // x42b2-s5c-clock.test.mjs's arm (D) already uses, so only a genuine EXECUTABLE reference
  // counts.
  const refs = await rootQuery(
    `with stripped as (
       select p.proname,
              regexp_replace(regexp_replace(p.prosrc, '/\\*[\\s\\S]*?\\*/', '', 'g'), '--[^\\n]*', '', 'g') as code
         from pg_proc p join pg_namespace n on n.oid=p.pronamespace
        where n.nspname='clara'
     )
     select distinct proname from stripped
      where position('stripe_events' in code)>0 or position('firm_registration_payments' in code)>0
      order by proname`,
  );
  assert.deepEqual(refs.rows.map((r) => r.proname), [
    "apply_stripe_events", "claim_paid_firm", "open_checkout_intent", "record_stripe_event",
  ]);
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
