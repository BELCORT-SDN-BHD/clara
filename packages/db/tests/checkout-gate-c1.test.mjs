// FS-4 checkout gate, PR C-1. Design of record:
// docs/plan/active/checkout-gate-design{,-part2,-part3}.md.
//
// C-1 is the durable DPA/intent foundation only: dpa_documents (including the
// beta placeholder row), dpa_signatures, checkout_intents with its dpa_version
// pin, and uq_frr_id_applicant. The sign/checkout/claim doors land later.
// Every cell gates on the LIVE catalog, never on the migration number.

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { endPool, insertUser, rootQuery, seedAdmission } from "./rig-fixtures.mjs";
import { truncateGuardError, withTxn } from "./rig-txn.mjs";

const BETA_VERSION = "clara-beta-2026-08-a";
const BETA_BODY = "This is Clara's beta data-processing agreement, pending review by the owner's lawyer before launch.";
const BETA_SOURCE = "docs/ops/legal/clara-beta-dpa.md";
const TABLES = ["dpa_documents", "dpa_signatures", "registration_rate_events", "checkout_intents"];
const EXPECTED_CELLS = 11;

let live = false;
let executed = 0;
let myAdmissionFixture = null;

async function cohortApplied() {
  const rows = await rootQuery(
    `select x.name, to_regclass('clara.' || x.name) is not null as present
       from unnest($1::text[]) x(name) order by x.name`,
    [TABLES],
  );
  const present = rows.rows.filter((row) => row.present).map((row) => row.name);
  if (present.length !== 0 && present.length !== TABLES.length) {
    throw new Error(`checkout C-1 cohort is PARTIAL: ${present.join(", ")}`);
  }
  if (present.length === 0) return false;
  // Once the four tables exist, every other cohort property belongs to a named cell below.
  // Keeping those reads out of this gate is load-bearing for mutant discrimination: dropping
  // uq_frr_id_applicant must redden c1.9, not fail anonymously in this before hook.
  return true;
}

before(async () => {
  live = await cohortApplied();
  if (live) {
    // c1.10/W-E3 (reshaped 2026-09-01, #482-review CI run 33489361117): a bare `count(*)` with
    // no predicate over clara.firm_admissions is unsound whenever db-estate runs packages
    // concurrently against the shared container -- this is the #482 lesson's family, second
    // member. db-estate's `pnpm -r` test step runs apps/web, apps/dashboard, packages/runtime
    // and packages/db CONCURRENTLY against ONE shared postgres service container (proven live:
    // the CI transcript interleaves `packages/db test:` and `packages/runtime test:` stdout
    // millisecond-by-millisecond), and several of those OTHER suites legitimately mint and/or
    // consume their OWN firm_admissions rows via this same rig-fixtures.seedAdmission helper
    // during this file's run -- a lawful population change this file has no business asserting
    // against. Scoping to "the exact row set observed here" is STILL unsound (that set can
    // include a FOREIGN row a concurrent suite legitimately consumes mid-battery, via
    // create_firm, between this hook and c1.10), so this cell owns a single, uniquely-tagged
    // admission row that nothing else in the estate can address or touch, and c1.10 proves only
    // THAT row -- plus the catalog-level DDL/index/trigger shape, which no concurrent suite's
    // DML can move -- stays byte-unchanged and unconsumed.
    const note = `c1.10_w-e3_${randomUUID()}`;
    await seedAdmission(note);
    const row = (await rootQuery(
      `select id,token_hash,note,created_at,consumed_at,consumed_op_key,consumed_result
         from clara.firm_admissions where note=$1`,
      [note],
    )).rows[0];
    myAdmissionFixture = { note, row };
  }
});
after(async () => { await endPool(); });

function gate(t) {
  if (live) return false;
  if (process.env.CLARA_ALLOW_MISSING_CHECKOUT_GATE_C1 === "1") {
    console.warn("SKIP checkout-gate-c1: the C-1 cohort is not applied (explicit unnumbered/pre-integration run).");
    t.skip("checkout-gate C-1 cohort absent -- explicit pre-integration run");
    return true;
  }
  assert.fail(
    "checkout-gate C-1 is required for a focused run: apply 0158_checkout_gate_c1_dpa.sql (or a numbered suite copy of it)",
  );
}

function cell(name, fn) {
  test(name, async (t) => {
    if (gate(t)) return;
    executed += 1;
    await fn(t);
  });
}

async function expectCode(code, action, label) {
  let caught = null;
  try {
    await action();
  } catch (error) {
    caught = error;
  }
  assert.ok(caught, `${label}: expected ${code}, but the write succeeded`);
  assert.equal(caught.code, code, `${label}: expected ${code}, got ${caught.code}: ${caught.message}`);
  return caught;
}

async function insertRegistration(applicant, tag = "c1") {
  const row = await rootQuery(
    `insert into clara.firm_registration_requests(applicant, firm_name, note, op_key)
     values ($1,$2,$3,$4) returning id`,
    [applicant, `${tag}_${randomUUID().slice(0, 8)}`, "checkout C-1 rig", `${tag}_${randomUUID()}`],
  );
  return row.rows[0].id;
}

async function insertIntent({ registration, applicant, dpaVersion = BETA_VERSION, price = "beta_trial" }) {
  const row = await rootQuery(
    `insert into clara.checkout_intents(registration_id,applicant,price_local_key,dpa_version)
     values ($1,$2,$3,$4) returning id`,
    [registration, applicant, price, dpaVersion],
  );
  return row.rows[0].id;
}

cell("c1.1 catalog -- the four tables have the exact C-1 column shapes", async () => {
  const expected = new Map([
    ["checkout_intents", "id,registration_id,applicant,price_local_key,dpa_version,session_id,opened_at"],
    ["dpa_documents", "version,body,body_sha256,source_path,effective_from,effective_to,created_at"],
    ["dpa_signatures", "id,user_id,dpa_version,signed_at,body_sha256"],
    ["registration_rate_events", "id,applicant,origin_digest,observed_at"],
  ]);
  const rows = await rootQuery(
    `select c.relname, string_agg(a.attname, ',' order by a.attnum) as columns
       from pg_class c join pg_namespace n on n.oid=c.relnamespace
       join pg_attribute a on a.attrelid=c.oid and a.attnum>0 and not a.attisdropped
      where n.nspname='clara' and c.relname = any($1::text[]) and c.relkind='r'
      group by c.relname order by c.relname`,
    [TABLES],
  );
  assert.equal(rows.rowCount, 4, "all four C-1 relations were positively read");
  for (const row of rows.rows) assert.equal(row.columns, expected.get(row.relname), row.relname);
});

cell("c1.2 beta seed -- exact body, source and DB-recomputed sha are current", async () => {
  const row = await rootQuery(
    `select version,body,source_path,effective_to,octet_length(body_sha256) as sha_bytes,
            body_sha256 = sha256(convert_to(body,'UTF8')) as sha_matches
       from clara.dpa_documents order by created_at,version`,
  );
  assert.equal(row.rowCount, 1, "C-1 ships exactly one beta document row");
  assert.deepEqual(
    row.rows[0],
    {
      version: BETA_VERSION,
      body: BETA_BODY,
      source_path: BETA_SOURCE,
      effective_to: null,
      sha_bytes: 32,
      sha_matches: true,
    },
  );
});

cell("c1.3 W-I2 foundation -- document and signature hashes are structurally bound to exact text", async () => {
  await withTxn(async (client) => {
    await expectCode(
      "23514",
      () => client.query(
        `insert into clara.dpa_documents(version,body,body_sha256,source_path,effective_from,effective_to)
         values ($1,'body A',sha256(convert_to('body B','UTF8')),$2,now(),now()+interval '1 day')`,
        [`bad_${randomUUID()}`, BETA_SOURCE],
      ),
      "a mismatched document hash",
    );
  }, { commit: false });

  const user = await insertUser("fs4c1", "hash");
  await withTxn(async (client) => {
    await expectCode(
      "23503",
      () => client.query(
        `insert into clara.dpa_signatures(user_id,dpa_version,body_sha256)
         values ($1,$2,sha256(convert_to('not the beta body','UTF8')))`,
        [user, BETA_VERSION],
      ),
      "a signature naming the wrong body hash",
    );
  }, { commit: false });

  const ok = await rootQuery(
    `insert into clara.dpa_signatures(user_id,dpa_version,body_sha256)
     select $1,version,body_sha256 from clara.dpa_documents where version=$2 returning id`,
    [user, BETA_VERSION],
  );
  assert.ok(ok.rows[0].id, "the matching body hash is admitted");
});

cell("c1.4 document lifecycle -- ordinary edits/deletes refuse; version-bump supersession works and preserves bytes", async () => {
  await withTxn(async (client) => {
    await expectCode(
      "CLR10",
      () => client.query(
        `update clara.dpa_documents
            set body='mutant', body_sha256=sha256(convert_to('mutant','UTF8'))
          where version=$1`,
        [BETA_VERSION],
      ),
      "an ordinary body rewrite",
    );
  }, { commit: false });
  await withTxn(async (client) => {
    await expectCode(
      "CLR08",
      () => client.query("delete from clara.dpa_documents where version=$1", [BETA_VERSION]),
      "a DPA document delete",
    );
  }, { commit: false });

  await withTxn(async (client) => {
    const before = (await client.query(
      "select body,body_sha256 from clara.dpa_documents where version=$1", [BETA_VERSION],
    )).rows[0];
    await client.query("update clara.dpa_documents set effective_to=now() where version=$1", [BETA_VERSION]);
    const successor = `successor ${randomUUID()}`;
    await client.query(
      `insert into clara.dpa_documents(version,body,body_sha256,source_path,effective_from)
       values ($1,$2,sha256(convert_to($2,'UTF8')),$3,now())`,
      [successor, "successor body", BETA_SOURCE],
    );
    const old = (await client.query(
      "select body,body_sha256,effective_to is not null as closed from clara.dpa_documents where version=$1",
      [BETA_VERSION],
    )).rows[0];
    assert.equal(old.body, before.body, "the predecessor body is byte-unmoved");
    assert.deepEqual(old.body_sha256, before.body_sha256, "the predecessor hash is byte-unmoved");
    assert.equal(old.closed, true, "the predecessor closes by effective_to only");
    assert.equal((await client.query(
      "select count(*)::int as n from clara.dpa_documents where effective_to is null",
    )).rows[0].n, 1, "the version bump leaves exactly one current document");
  }, { commit: false });
});

cell("c1.5 current-version wall -- a second open-ended DPA row is refused", async () => {
  await withTxn(async (client) => {
    await expectCode(
      "23505",
      () => client.query(
        `insert into clara.dpa_documents(version,body,body_sha256,source_path,effective_from)
         values ($1,$2,sha256(convert_to($2,'UTF8')),$3,now())`,
        [`second_${randomUUID()}`, "second current body", BETA_SOURCE],
      ),
      "a second current DPA",
    );
  }, { commit: false });
});

cell("c1.6 signatures -- evidence is append-only, single per user/version, and cannot truncate", async () => {
  const user = await insertUser("fs4c1", "signature");
  const row = await rootQuery(
    `insert into clara.dpa_signatures(user_id,dpa_version,body_sha256)
     select $1,version,body_sha256 from clara.dpa_documents where version=$2 returning id`,
    [user, BETA_VERSION],
  );
  const signature = row.rows[0].id;
  await withTxn(async (client) => {
    await expectCode("CLR08", () => client.query(
      "update clara.dpa_signatures set signed_at=now()+interval '1 second' where id=$1", [signature],
    ), "a signature update");
  }, { commit: false });
  await withTxn(async (client) => {
    await expectCode("CLR08", () => client.query(
      "delete from clara.dpa_signatures where id=$1", [signature],
    ), "a signature delete");
  }, { commit: false });
  await withTxn(async (client) => {
    await expectCode("23505", () => client.query(
      `insert into clara.dpa_signatures(user_id,dpa_version,body_sha256)
       select $1,version,body_sha256 from clara.dpa_documents where version=$2`,
      [user, BETA_VERSION],
    ), "a duplicate user/version signature");
  }, { commit: false });
  const trunc = await truncateGuardError("truncate clara.dpa_signatures");
  assert.equal(trunc?.code, "CLR08", `the signature TRUNCATE guard answers CLR08 (got ${trunc?.code})`);
  // F6 (opus review on #493): once C-3 exists, this statement names TWO append-only tables, and
  // either one's own trigger could fire first -- CLR08 alone does not prove THIS table's guard is
  // what stopped it. Pin the message to dpa_signatures specifically.
  assert.match(trunc.message, /dpa_signatures cannot be truncated/,
    "the dpa_signatures TRUNCATE guard specifically, not merely SOME CLR08");
});

cell("c1.7a registration rate events -- digests are 32-byte, indexed, append-only evidence", async () => {
  const applicant = await insertUser("fs4c1", "rate");
  await withTxn(async (client) => {
    await expectCode("23514", () => client.query(
      "insert into clara.registration_rate_events(applicant,origin_digest) values ($1,$2)",
      [applicant, Buffer.alloc(31, 1)],
    ), "a non-32-byte origin digest");
  }, { commit: false });

  const event = (await rootQuery(
    "insert into clara.registration_rate_events(applicant,origin_digest) values ($1,$2) returning id",
    [applicant, Buffer.alloc(32, 2)],
  )).rows[0].id;
  await withTxn(async (client) => {
    await expectCode("CLR08", () => client.query(
      "update clara.registration_rate_events set observed_at=now()+interval '1 second' where id=$1",
      [event],
    ), "a registration rate event update");
  }, { commit: false });
  await withTxn(async (client) => {
    await expectCode("CLR08", () => client.query(
      "delete from clara.registration_rate_events where id=$1", [event],
    ), "a registration rate event delete");
  }, { commit: false });
  const trunc = await truncateGuardError("truncate clara.registration_rate_events");
  assert.equal(trunc?.code, "CLR08", `the registration-rate TRUNCATE guard answers CLR08 (got ${trunc?.code})`);

  const index = await rootQuery(
    `select i.indisunique,i.indisvalid,i.indisready,i.indislive,
            array(select a.attname::text from unnest(i.indkey::smallint[]) with ordinality k(attnum,ord)
                  join pg_attribute a on a.attrelid=i.indrelid and a.attnum=k.attnum order by k.ord) as columns
       from pg_index i
      where i.indexrelid='clara.ix_registration_rate_events_origin_observed'::regclass`,
  );
  assert.deepEqual(index.rows, [{
    indisunique: false,
    indisvalid: true,
    indisready: true,
    indislive: true,
    columns: ["origin_digest", "observed_at"],
  }]);
});

cell("c1.7 M8 foundation -- an intent is bound to its applicant and keeps its own DPA version through supersession", async () => {
  const applicantA = await insertUser("fs4c1", "intent_a");
  const applicantB = await insertUser("fs4c1", "intent_b");
  const registration = await insertRegistration(applicantA, "m8");
  const intent = await insertIntent({ registration, applicant: applicantA });

  await withTxn(async (client) => {
    await expectCode(
      "23503",
      () => client.query(
        `insert into clara.checkout_intents(registration_id,applicant,price_local_key,dpa_version)
         values ($1,$2,'beta_trial',$3)`,
        [registration, applicantB, BETA_VERSION],
      ),
      "a registration/applicant mismatch",
    );
  }, { commit: false });

  await withTxn(async (client) => {
    await client.query("update clara.dpa_documents set effective_to=now() where version=$1", [BETA_VERSION]);
    const next = `m8_${randomUUID()}`;
    await client.query(
      `insert into clara.dpa_documents(version,body,body_sha256,source_path,effective_from)
       values ($1,$2,sha256(convert_to($2,'UTF8')),$3,now())`,
      [next, "M8 successor", BETA_SOURCE],
    );
    const pinned = (await client.query(
      "select dpa_version from clara.checkout_intents where id=$1", [intent],
    )).rows[0].dpa_version;
    assert.equal(pinned, BETA_VERSION, "the mid-flow intent stays pinned to the version it opened under");
  }, { commit: false });
});

cell("c1.8 checkout intent lifecycle -- session_id stamps once; every other rewrite/delete/truncate refuses", async () => {
  const applicant = await insertUser("fs4c1", "stamp");
  const registration = await insertRegistration(applicant, "stamp");
  const intent = await insertIntent({ registration, applicant });
  const session = `cs_test_${randomUUID().replaceAll("-", "")}`;
  await rootQuery("update clara.checkout_intents set session_id=$2 where id=$1", [intent, session]);
  assert.equal((await rootQuery(
    "select session_id from clara.checkout_intents where id=$1", [intent],
  )).rows[0].session_id, session);

  const otherApplicant = await insertUser("fs4c1", "stamp_unique");
  const otherRegistration = await insertRegistration(otherApplicant, "stamp_unique");
  await withTxn(async (client) => {
    const other = await client.query(
      `insert into clara.checkout_intents(registration_id,applicant,price_local_key,dpa_version)
       values ($1,$2,'beta_trial',$3) returning id`,
      [otherRegistration, otherApplicant, BETA_VERSION],
    );
    await expectCode("23505", () => client.query(
      "update clara.checkout_intents set session_id=$2 where id=$1", [other.rows[0].id, session],
    ), "a duplicate checkout session stamp");
  }, { commit: false });

  await withTxn(async (client) => {
    await expectCode("CLR10", () => client.query(
      "update clara.checkout_intents set session_id=$2 where id=$1", [intent, `${session}_other`],
    ), "a checkout session re-stamp");
  }, { commit: false });
  await withTxn(async (client) => {
    await expectCode("CLR10", () => client.query(
      "update clara.checkout_intents set price_local_key='mutant' where id=$1", [intent],
    ), "an intent field rewrite");
  }, { commit: false });
  await withTxn(async (client) => {
    await expectCode("CLR08", () => client.query(
      "delete from clara.checkout_intents where id=$1", [intent],
    ), "an intent delete");
  }, { commit: false });
  const trunc = await truncateGuardError("truncate clara.checkout_intents cascade");
  assert.equal(trunc?.code, "CLR08", `the intent TRUNCATE guard answers CLR08 (got ${trunc?.code})`);
});

cell("c1.9 catalog walls -- registration key, forced RLS, owner-only policies and zero app table grants", async () => {
  const key = await rootQuery(
    `select c.convalidated,
            array(select a.attname::text from unnest(c.conkey) with ordinality k(attnum,ord)
                  join pg_attribute a on a.attrelid=c.conrelid and a.attnum=k.attnum order by k.ord) as columns
       from pg_constraint c
      where c.conrelid='clara.firm_registration_requests'::regclass
        and c.conname='uq_frr_id_applicant' and c.contype='u'`,
  );
  assert.equal(key.rowCount, 1, "uq_frr_id_applicant is a real UNIQUE constraint, not a spelling");
  assert.equal(key.rows[0].convalidated, true);
  assert.deepEqual(key.rows[0].columns, ["id", "applicant"]);

  const relations = await rootQuery(
    `select c.relname,c.relrowsecurity,c.relforcerowsecurity,pg_get_userbyid(c.relowner) as owner,
            (select array_agg(p.polname::text order by p.polname) from pg_policy p where p.polrelid=c.oid) as policies
       from pg_class c join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='clara' and c.relname=any($1::text[]) order by c.relname`,
    [TABLES],
  );
  for (const row of relations.rows) {
    assert.equal(row.relrowsecurity, true, `${row.relname}: RLS enabled`);
    assert.equal(row.relforcerowsecurity, true, `${row.relname}: RLS forced`);
    assert.equal(row.owner, "clara_fn_owner", `${row.relname}: owner`);
    assert.deepEqual(row.policies, [`p_${row.relname}_owner`], `${row.relname}: owner policy only`);
  }
  const grants = await rootQuery(
    `select table_name,grantee,privilege_type
       from information_schema.role_table_grants
      where table_schema='clara' and table_name=any($1::text[]) and grantee<>'clara_fn_owner'
      order by table_name,grantee,privilege_type`,
    [TABLES],
  );
  assert.deepEqual(grants.rows, [], "no application role holds a direct C-1 table grant");
});

cell("c1.10 W-E3 -- firm_admissions is byte-shape untouched and create_firm stays at its pinned body", async () => {
  const columns = await rootQuery(
    `select string_agg(attname,',' order by attnum) as names
       from pg_attribute where attrelid='clara.firm_admissions'::regclass
        and attnum>0 and not attisdropped`,
  );
  assert.equal(columns.rows[0].names, "note,consumed_at,created_at,consumed_op_key,consumed_result,id,token_hash");
  const indexes = await rootQuery(
    `select array_agg(indexrelid::regclass::text order by indexrelid::regclass::text) as names
       from pg_index where indrelid='clara.firm_admissions'::regclass`,
  );
  assert.deepEqual(indexes.rows[0].names, ["clara.firm_admissions_pkey", "clara.uq_firm_admissions_token_hash"]);

  // Trigger census (independent review addition, 2026-09-01): cohort-scoping the population
  // proof below opens exactly one path a bare row-set comparison cannot see -- a C-1-installed
  // trigger on firm_admissions inserting rows OUTSIDE this cell's own cohort during the battery
  // window. This is a pure catalog read, concurrency-immune the same way (i)/(ii) are: no
  // concurrent suite's DML can create or drop a trigger.
  const triggers = await rootQuery(
    `select tgname from pg_trigger where tgrelid='clara.firm_admissions'::regclass
        and not tgisinternal order by tgname`,
  );
  assert.deepEqual(triggers.rows.map((r) => r.tgname), [], "firm_admissions carries no trigger, before or after C-1");

  // W-E3 population proof, cohort-scoped (reshaped 2026-09-01 -- see before()'s comment for the
  // full class/rationale: a bare count(*) with no predicate is unsound whenever db-estate runs
  // packages concurrently against the shared container; this is the #482 lesson's family,
  // second member). This proves only OUR OWN, uniquely-tagged fixture row -- nothing else in the
  // estate can name or address it -- is still exactly one row, byte-unchanged, and unconsumed.
  const mine = await rootQuery(
    `select id,token_hash,note,created_at,consumed_at,consumed_op_key,consumed_result
       from clara.firm_admissions where note=$1`,
    [myAdmissionFixture.note],
  );
  assert.equal(mine.rowCount, 1, "exactly one admission row exists for this cell's own fixture cohort");
  assert.deepEqual(
    mine.rows[0],
    myAdmissionFixture.row,
    "this cell's own admission fixture is byte-unchanged since before()",
  );
  assert.equal(mine.rows[0].consumed_at, null, "this cell's own admission fixture was never consumed");

  const body = await rootQuery(
    `select left(encode(sha256(convert_to(prosrc,'UTF8')),'hex'),12) as sha12
       from pg_proc where oid='clara.create_firm(text,uuid,text)'::regprocedure`,
  );
  assert.equal(body.rows[0].sha12, "59fa533d9c03", "create_firm is not re-cut by C-1");
});

test("c1.VACUITY CONTROL -- every declared C-1 cell executed", (t) => {
  if (!live) {
    if (process.env.CLARA_ALLOW_MISSING_CHECKOUT_GATE_C1 === "1") {
      t.skip("checkout-gate C-1 cohort absent -- explicit pre-integration run");
      return;
    }
    assert.fail("checkout-gate C-1 cohort absent");
  }
  assert.equal(executed, EXPECTED_CELLS, `${EXPECTED_CELLS} C-1 cells executed before the control`);
});
