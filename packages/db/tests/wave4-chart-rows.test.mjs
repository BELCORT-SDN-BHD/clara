// Battery for migration 0295_wave4_chart_rows.sql -- the wave-4 PRE-STEP that adds the four
// standard-chart rows the deferred-revenue (#941), accrued-income (#942), payroll-posting (#946)
// and tenancy-rent (#949) lanes share: `2030 Deferred Revenue`, `1180 Accrued Income`,
// `2040 Salaries Payable`, `2050 Rent Payable`. Read 0295's own header for the full citation of
// the owner rulings (2026-09-20) this file discharges and for the measured proof (a rolled-back
// probe against the live database, not asserted from memory) that a published template's rows
// are frozen -- clara.coa_template_accounts is FROZEN once its parent coa_templates row is
// 'published' (t_coa_template_accounts_freeze / clara._tf_coa_template_child_freeze,
// 0150:604-663), which is why 0295 mints a NEW template version (my_sme_starter v2) rather than
// editing v1 in place: v1 stays published and untouched, forever.
//
// FOUR SEAMS, named up front (WORK-ORDER rule 4 -- the seams are the public interfaces the brief
// names, and no test sits anywhere else):
//   S1. THE TEMPLATE READ. The four rows are ABSENT from v1 (0150's own frozen seed, forever)
//       and PRESENT on v2 (0295's own row), by code, name, type, family and every flag column --
//       a direct read of clara.coa_template_accounts, the same RLS-gated relation
//       clara.get_coa_template and clara.list_coa_templates already read from.
//   S2. AN EXISTING CLIENT'S CHART IS NOT TOUCHED. clara.apply_coa_template COPIES rows out of
//       whichever template_id the caller names (0156's own "copy-not-reference" header) into
//       clara.coa_accounts, once, at apply time; no door in the estate re-syncs an already-
//       planted chart against a template afterward ("publish template row to existing clients"
//       is not a mechanism this estate has -- MEASURED: `grep -rn "publish.*existing client\|sync.*coa_accounts.*template\|backfill.*coa_accounts" packages/db packages/runtime apps/web`
//       finds nothing, and none of the four rulings asks for one, so none is invented here). A
//       client whose chart was built from v1 -- the only template that existed before this
//       migration -- keeps exactly that chart; this cell drives clara.apply_coa_template against
//       v1 for real and reads the planted chart back to prove it.
//   S3. A NEW CLIENT GETS THE FOUR ROWS. Born through the REAL doors (clara.create_client, the
//       onboarding plan's commit -- coa-template-pr-b-helpers.mjs's newInterviewClient, no
//       surgery), then clara.apply_coa_template against the estate's CURRENT published template
//       (the highest-version published my_sme_starter row -- the same
//       `... order by version desc limit 1` convention dba-coding-lane-classification.test.mjs
//       already uses for "whichever one is live"): the planted chart carries all four rows with
//       the right types, and none is a control account.
//   S4. NO CODE COLLIDES ACROSS EVERY TEMPLATE THE ESTATE SHIPS. Each of the four new codes
//       appears EXACTLY ONCE across the whole of clara.coa_template_accounts, scoped to
//       scope='platform' templates (the shipped estate; a firm's own fork is that firm's
//       business, never this migration's).
//
// Every positive read carries its own vacuity control (WORK-ORDER rule 4 / addendum): the
// subject is broken once, inside a transaction opened and rolled back by withRolledBackTx
// (coa-template-pr-a-helpers.mjs), the SAME assertion is shown to fail for the right reason, and
// the rollback restores the database byte for byte -- never asserted, always driven.
//
// Serial discipline: --test-concurrency=1 (shared rig convention).

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { rootQuery, ensureReady, buildWorld, endPool } from "./rig-fixtures.mjs";
import { withRolledBackTx } from "./coa-template-pr-a-helpers.mjs";
import {
  applyTemplate,
  newInterviewClient,
  clientChartMap,
  asHumanOn,
} from "./coa-template-pr-b-helpers.mjs";

const NEW_CODES = ["1180", "2030", "2040", "2050"];
const EXPECTED = {
  "1180": { name: "Accrued Income", type: "asset", family: "trade_receivables", ordinal: 45 },
  "2030": { name: "Deferred Revenue", type: "liability", family: "trade_payables", ordinal: 40 },
  "2040": { name: "Salaries Payable", type: "liability", family: "trade_payables", ordinal: 50 },
  "2050": { name: "Rent Payable", type: "liability", family: "trade_payables", ordinal: 60 },
};

let world;
let ready = false;
let v1 = null;
/** The CURRENT published my_sme_starter row -- highest published version, dba-coding-lane-
 *  classification.test.mjs's own convention for "whichever one is live". */
let current = null;

before(async () => {
  ready = await ensureReady();
  if (!ready) return;
  const rows = (
    await rootQuery(
      "select id, version, state from clara.coa_templates where scope='platform' and template_key='my_sme_starter' order by version",
    )
  ).rows;
  v1 = rows.find((r) => r.version === 1) ?? null;
  const published = rows.filter((r) => r.state === "published").sort((a, b) => b.version - a.version);
  current = published[0] ?? null;
  if (!v1 || !current || current.version < 2) {
    if (process.env.CLARA_ALLOW_MISSING_WAVE4_CHART_ROWS !== "1") {
      throw new Error(
        "wave4-chart-rows premise missing (my_sme_starter v1 and/or a published v2+) -- this is a " +
          "FOCUSED run and must fail loudly, not skip. Preload " +
          "./tests/wave4-chart-rows-preintegration-gate.mjs for an estate sweep against a chain " +
          "that predates 0295.",
      );
    }
    ready = false;
    return;
  }
  world = await buildWorld();
});

after(async () => {
  await endPool();
});

function unready(t) {
  if (!ready) {
    t.skip("rig not ready: ensureReady() found no draft_entry, or 0295 is not applied");
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// S1 -- the template read
// ---------------------------------------------------------------------------

test("S1 · the four rows are absent from v1 (0150's own frozen seed) and present on v2, by code, name, type, family and flag", async (t) => {
  if (unready(t)) return;

  const onV1 = (
    await rootQuery(
      "select account_code from clara.coa_template_accounts where template_id=$1 and account_code = any($2)",
      [v1.id, NEW_CODES],
    )
  ).rows;
  assert.deepEqual(onV1, [], "v1 must never carry any of the four new codes -- it is 0150's own frozen seed, and 0295's own tail proves it stays that way");

  const onV2 = (
    await rootQuery(
      `select account_code, name, account_type, family_key, sort_ordinal, account_class,
              special_acc_type, tax_sensitive, add_back_class, statutory
         from clara.coa_template_accounts where template_id=$1 and account_code = any($2)
        order by account_code`,
      [current.id, NEW_CODES],
    )
  ).rows;
  assert.equal(onV2.length, 4, "all four new rows must be on the current published template");
  for (const row of onV2) {
    const want = EXPECTED[row.account_code];
    assert.equal(row.name, want.name, `${row.account_code} name`);
    assert.equal(row.account_type, want.type, `${row.account_code} type`);
    assert.equal(row.family_key, want.family, `${row.account_code} family`);
    assert.equal(row.sort_ordinal, want.ordinal, `${row.account_code} sort_ordinal`);
    assert.equal(row.account_class, null, `${row.account_code} must not be a control account`);
    assert.equal(row.special_acc_type, null, `${row.account_code} carries no special marker`);
    assert.equal(row.tax_sensitive, false, `${row.account_code} is not tax-sensitive`);
    assert.equal(row.add_back_class, null, `${row.account_code} carries no add-back class`);
    assert.equal(row.statutory, null, `${row.account_code} carries no statutory tag`);
  }

  // VACUITY CONTROL: delete 2030 off the current template (trigger disabled for exactly this
  // statement, inside a transaction withRolledBackTx guarantees is rolled back) and show the
  // SAME read now finds three, not four -- proving the assertion above is sensitive to the data
  // it claims to check, not vacuously true.
  await withRolledBackTx(async (c) => {
    await c.query("alter table clara.coa_template_accounts disable trigger t_coa_template_accounts_freeze");
    await c.query("delete from clara.coa_template_accounts where template_id=$1 and account_code='2030'", [current.id]);
    const broken = await c.query(
      "select account_code from clara.coa_template_accounts where template_id=$1 and account_code = any($2)",
      [current.id, NEW_CODES],
    );
    assert.equal(broken.rows.length, 3, "MUTANT: with 2030 deleted the read must find three, not four");
  });
});

// ---------------------------------------------------------------------------
// S2 -- an existing client's chart is not touched
// ---------------------------------------------------------------------------

test("S2 · an existing client's chart, built from v1, carries none of the four new rows -- apply_coa_template copies, it never re-syncs", async (t) => {
  if (unready(t)) return;
  const admin = world.users.alice;
  const firm = world.firms.A;

  // A client born and adopting v1 TODAY stands in for one born before 0295 ever existed:
  // v1 is 0150's frozen artifact, unmoved by 0295 (S1 above, and 0295's own tail), so applying
  // it now plants exactly the chart it would have planted before this migration landed.
  const client = await newInterviewClient(admin, firm, { tag: "s2" });
  const receipt = await applyTemplate(admin, { client, template: v1.id, families: null, opKey: `w4-s2-${client}` });
  assert.ok(receipt.accounts > 0, "mandatory setup: the chart was actually planted");

  const chart = await clientChartMap(client);
  for (const code of NEW_CODES) {
    assert.equal(chart[code], undefined, `an existing (v1) client must not carry ${code} -- it is not on v1 at all`);
  }
  assert.equal(chart["2010"]?.name, "Other Payables", "mandatory setup: v1's own rows still plant normally");

  // No "publish template row to existing clients" mechanism exists in this estate (grepped: no
  // hit for a backfill/sync door over coa_accounts against a template), and none of #941/#942/
  // #946/#949's rulings asks for one -- so an existing client's chart staying exactly as it was
  // adopted is the estate's actual, unmodified behaviour, not a gap this ticket leaves open.

  // VACUITY CONTROL: plant one of the new codes onto this SAME client's chart by hand (never
  // through a door -- pure fixture surgery, inside a rolled-back transaction) and show the read
  // above would have caught it.
  await withRolledBackTx(async (c) => {
    await c.query(
      `insert into clara.coa_accounts(client_id, firm_id, account_code, name, account_type, is_active, is_bank_account)
       values ($1, $2, '2030', 'sneak', 'liability', true, false)`,
      [client, firm],
    );
    const broken = await c.query("select account_code from clara.coa_accounts where client_id=$1 and account_code='2030'", [client]);
    assert.equal(broken.rows.length, 1, "MUTANT: with 2030 planted by hand the read must find it");
  });
});

// ---------------------------------------------------------------------------
// S3 -- a new client gets the four rows
// ---------------------------------------------------------------------------

test("S3 · a new client, born through the real doors and applying the CURRENT template, gets all four rows with the right types", async (t) => {
  if (unready(t)) return;
  const admin = world.users.alice;
  const firm = world.firms.A;

  const client = await newInterviewClient(admin, firm, { tag: "s3" });
  const receipt = await applyTemplate(admin, { client, template: current.id, families: null, opKey: `w4-s3-${client}` });
  // p_families=null asks the DB for its own deterministic plan, which is CORE families only
  // absent any matching client axis (0156's own family-plan door) -- trade_receivables and
  // trade_payables are both core (0150's seed), so the four new rows ride the default plan too.
  // MEASURED on this rig: v2's core slice is 78 accounts (74 from v1 + the 4 new ones).
  assert.ok(receipt.accounts >= 78, `mandatory setup: the current template's core chart was planted (got ${receipt.accounts})`);

  const chart = await clientChartMap(client);
  for (const code of NEW_CODES) {
    const want = EXPECTED[code];
    const got = chart[code];
    assert.ok(got, `the new client must carry ${code} (${want.name})`);
    assert.equal(got.name, want.name, `${code} name`);
    assert.equal(got.type, want.type, `${code} type`);
    assert.equal(got.class, null, `${code} must not be planted as a control account`);
    assert.equal(got.active, true, `${code} must be planted active`);
  }

  // VACUITY CONTROL: delete this client's own 2040 row (fixture surgery, rolled back) and show
  // the SAME per-code assertion loop would have failed.
  await withRolledBackTx(async (c) => {
    await c.query("delete from clara.coa_accounts where client_id=$1 and account_code='2040'", [client]);
    const broken = await c.query("select 1 from clara.coa_accounts where client_id=$1 and account_code='2040'", [client]);
    assert.equal(broken.rows.length, 0, "MUTANT: with 2040 deleted the client must no longer carry it");
  });
});

// ---------------------------------------------------------------------------
// S4 -- no code collision across every template the estate ships
// ---------------------------------------------------------------------------

test("S4 · none of the four new codes collides across every platform template clara.coa_template_accounts carries", async (t) => {
  if (unready(t)) return;
  const rows = (
    await rootQuery(
      `select a.account_code, count(*)::int n
         from clara.coa_template_accounts a
         join clara.coa_templates t on t.id = a.template_id
        where t.scope = 'platform' and a.account_code = any($1)
        group by a.account_code`,
      [NEW_CODES],
    )
  ).rows;
  const byCode = Object.fromEntries(rows.map((r) => [r.account_code, r.n]));
  for (const code of NEW_CODES) {
    assert.equal(byCode[code], 1, `${code} must appear exactly once across every shipped platform template (found ${byCode[code] ?? 0})`);
  }

  // VACUITY CONTROL: mint a second platform template carrying a colliding 2030 (trigger
  // disabled only for this probe row's own template, never for v1 or the current template;
  // rolled back) and show the SAME collision read would flag it.
  await withRolledBackTx(async (c) => {
    const probe = await c.query(
      `insert into clara.coa_templates(scope, firm_id, template_key, version, title, framework_hint, basis, state, published_at, content_sha256)
       values ('platform', null, 'w4_probe', 1, 'probe', 'MPERS', 'probe', 'published', now(), sha256(''::bytea))
       returning id`,
    );
    const probeId = probe.rows[0].id;
    await c.query("alter table clara.coa_template_families disable trigger t_coa_template_families_freeze");
    await c.query(
      "insert into clara.coa_template_families(template_id, family_key, label, inclusion, basis, sort_ordinal) values ($1,'probe','probe','opt_in','probe',1)",
      [probeId],
    );
    await c.query("alter table clara.coa_template_accounts disable trigger t_coa_template_accounts_freeze");
    await c.query(
      "insert into clara.coa_template_accounts(template_id, family_key, account_code, name, account_type, sort_ordinal) values ($1,'probe','2030','collider','liability',1)",
      [probeId],
    );
    const broken = await c.query(
      `select count(*)::int n from clara.coa_template_accounts a join clara.coa_templates t on t.id=a.template_id
        where t.scope='platform' and a.account_code='2030'`,
    );
    assert.equal(broken.rows[0].n, 2, "MUTANT: with a second platform template's 2030 planted the collision read must find two");
  });
});

// ---------------------------------------------------------------------------
// S5 -- the society entity overrides ride the new version
// ---------------------------------------------------------------------------

test("S5 · a SOCIETY client applying the CURRENT template gets 3900 relabelled `Accumulated Fund` and NO 3040 -- 0156's entity overrides ride the new version", async (t) => {
  if (unready(t)) return;

  // THE CENSUS FIRST, row for row. clara.coa_template_entity_overrides is keyed BY template_id
  // (0156:401), so a new template version starts with NONE of them unless they are carried
  // forward deliberately. v2 must carry exactly what v1 carries -- same entity_type, code,
  // override_name, suppress and basis -- or the society chart silently regresses to the
  // two-accounts-one-name defect 0156's own seed block exists to discharge.
  const census = async (templateId) =>
    (
      await rootQuery(
        `select entity_type, account_code, coalesce(override_name, '<null>') as override_name,
                suppress, basis
           from clara.coa_template_entity_overrides where template_id = $1
          order by entity_type, account_code`,
        [templateId],
      )
    ).rows;
  const onV1 = await census(v1.id);
  assert.equal(onV1.length, 2, "mandatory setup: v1 carries 0156's own two reviewed society rows");
  assert.deepEqual(await census(current.id), onV1,
    "the current template's override census must equal v1's, row for row");

  // ...AND THE BEHAVIOUR, DRIVEN. A society client born through the real doors, applying the
  // current template through clara.apply_coa_template -- the mirror of coa-template-pr-b.test.mjs
  // §5.1 on the version this migration mints.
  const soc = await newInterviewClient(world.users.alice, world.firms.A, {
    tag: "s5soc", answers: { entity_type: "society" },
  });
  const res = await applyTemplate(world.users.alice, {
    client: soc, template: current.id, families: null, opKey: `w4-s5-${soc}`,
  });
  assert.ok(res.families.includes("equity_society"), "mandatory setup: the society-keyed equity family was proposed");
  const map = await clientChartMap(soc);
  assert.equal(map["3900"]?.name, "Accumulated Fund", "3900 must be relabelled for a society");
  assert.equal(map["3900"]?.special, "retained_earnings", "and the marker the estate requires is intact");
  assert.equal(map["3040"], undefined, "3040 must be SUPPRESSED -- one concept, one account");

  // VACUITY CONTROL: delete the CURRENT template's own society/3900 relabel (inside a rolled-back
  // transaction) and show a society client applying it then gets the mislabelled name back.
  const soc2 = await newInterviewClient(world.users.alice, world.firms.A, {
    tag: "s5mut", answers: { entity_type: "society" },
  });
  const mutated = await withRolledBackTx(async (c) => {
    await c.query("set local role clara_fn_owner");
    await c.query(
      "delete from clara.coa_template_entity_overrides where template_id = $1 and entity_type = 'society' and account_code = '3900'",
      [current.id],
    );
    await c.query("reset role");
    await asHumanOn(c, world.users.alice, "select clara.apply_coa_template($1,$2,null::text[],$3)",
      [soc2, current.id, `w4-s5m-${soc2}`]);
    const r = await c.query("select name from clara.coa_accounts where client_id = $1 and account_code = '3900'", [soc2]);
    return r.rows[0]?.name;
  });
  assert.equal(mutated, "Retained Earnings",
    "MUTANT: delete the current template's relabel row and the society gets the mislabelled name back");
  assert.deepEqual(await census(current.id), onV1, "the shipping override rows survived the mutant");
});
