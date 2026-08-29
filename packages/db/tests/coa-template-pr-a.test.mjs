// 裁-21 PR-a -- the firm-level standard chart of accounts, the TEMPLATE half.
//
// Design of record: docs/plan/active/coa-template-design.md (D-1, D-2, D-13) ·
// docs/plan/active/coa-template-annexes.md Annex C (the battery), Annex F (the DDL) ·
// docs/plan/active/coa-template-gate-record.md (CLOSED, all twelve RULED 裁-23).
// Migration: packages/db/migrations/UNNUMBERED_coa_template_pr_a.sql (number claimed at merge).
//
// JUDGEMENT LOGIC under review law 1: clara._coa_template_for_edit's three-rung refusal ladder,
// every editor door's shape guards, publish_coa_template's emptiness rungs, and the
// client_fact_keys-resolved trade_nature / entity_type vocabularies. Every one of them is
// exercised THROUGH THE REAL DOOR and pinned by its typed CLR code AND its `detail.reason`
// name -- never by a substring match on source text (review law 3), never by an absence
// (review law 2).
//
// =============================================================================================
// THE MUTANT PANEL -- eleven walls, each DELETED inside a rolled-back transaction so the shipping
// schema is never left mutated. A cell that cannot be made to fail is not a proof.
//
//  #  | wall                              | mutation                                   | what goes RED
// ----|-----------------------------------|--------------------------------------------|---------------------------------------------
//  M1 | uq_coa_tmpl_special               | drop index                                 | the door stops refusing duplicate_special_acc_type
//  M2 | ck_coa_tmpl_code (the mirror)     | drop constraint                            | the mirror-equality census (Annex C cell 15)
//  M3 | ck_coa_family_core_unkeyed        | drop constraint                            | a core family with trim keys is accepted
//  M4 | t_coa_template_accounts_freeze    | drop trigger                               | a PUBLISHED template accepts a new account row
//  M5 | t_coa_templates_freeze            | drop trigger                               | a PUBLISHED template's title becomes editable
//  M6 | p_coa_templates_human             | relax the predicate to `using (true)`      | firm B starts seeing firm A's firm-scoped template
//  M7 | ck_coa_templates_scope_firm       | drop constraint                            | a platform-scoped row may carry a firm_id
//  M8 | uq_coa_adoption_live              | drop index                                 | one client accepts two 'adopted' adoptions
//  M9 | ck_coa_templates_authorship       | drop constraint                            | a platform template may name a human author
// M10 | the LIVE client_fact_keys lookup  | WIDEN the trade_nature vocabulary row      | a previously-refused trade_nature starts being accepted
// M11 | ck_coa_tmpl_add_back_class        | drop constraint                            | an unlisted add-back leaf is accepted at the table
//
// M10 is the law-3 cell: it mutates the guard's INPUT rather than the guard, proving the door
// resolves against the live catalog and not against a list it carries in its own body. A
// hard-coded list could never start ADMITTING a value the catalog just gained.
// =============================================================================================
//
// Serial discipline: --test-concurrency=1 (shared rig convention).

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { CLR, PG, assertRaises, opk, rootQuery, ensureReady, buildWorld, endPool } from "./rig-fixtures.mjs";
import {
  forkTemplate, upsertFamily, removeFamily, upsertTemplateAccount, removeTemplateAccount,
  publishTemplate, retireTemplate, listTemplates, getTemplate,
  humanFamilyCodes, humanAccountCodes,
  platformTemplate, rawTemplate, snapshotTemplate, templateCounts,
  withRolledBackTx, raisedCode, refusalReason,
} from "./coa-template-pr-a-helpers.mjs";

/** The account door's exact signature -- pinned once, used by the ACL census and the mutants. */
const ACCOUNT_DOOR = "clara.upsert_coa_template_account(uuid,text,text,text,text,text,text,integer,boolean,text,text,text)";

let world;
let ready = false;
let platform = null;
/** A DRAFT fork of the platform starter, kept for the cells that need editable content. */
let draft = null;
/** A PUBLISHED fork, kept for the immutability and copy-not-reference cells. */
let publishedFork = null;
let keyN = 0;
const nextKey = (tag) => `rig_${tag}_${(keyN++).toString(36)}_${randomUUID().slice(0, 6).replace(/-/g, "")}`.toLowerCase();

before(async () => {
  ready = await ensureReady();
  if (!ready) return;
  const catalog = await rootQuery(
    `select
       to_regclass('clara.coa_templates')            is not null as t1,
       to_regclass('clara.coa_template_families')    is not null as t2,
       to_regclass('clara.coa_template_accounts')    is not null as t3,
       to_regclass('clara.coa_template_adoptions')   is not null as t4,
       to_regprocedure('clara.fork_coa_template(uuid,text,text,text,text,text)')   is not null as fork,
       to_regprocedure('clara.publish_coa_template(uuid,text)')                    is not null as pub`,
  );
  const row = catalog.rows[0];
  if (!row.t1 || !row.t2 || !row.t3 || !row.t4 || !row.fork || !row.pub) {
    if (process.env.CLARA_ALLOW_MISSING_COA_TEMPLATE_PR_A !== "1") {
      throw new Error(
        `coa-template-pr-a premise missing (t1=${row.t1}, t2=${row.t2}, t3=${row.t3}, t4=${row.t4}, ` +
          `fork=${row.fork}, pub=${row.pub}) and CLARA_ALLOW_MISSING_COA_TEMPLATE_PR_A is unset -- ` +
          "this is a FOCUSED run and must fail loudly, not skip. Preload " +
          "./tests/coa-template-pr-a-preintegration-gate.mjs for an estate sweep against a pre-PR-a chain.",
      );
    }
    ready = false;
    return;
  }
  world = await buildWorld();
  platform = await platformTemplate();

  const d = await forkTemplate(world.users.alice, {
    source: platform.id, key: nextKey("draft"), title: "Firm A working draft",
    basis: "forked from the platform starter", opKey: opk("fork"),
  });
  draft = d.template_id;

  const p = await forkTemplate(world.users.alice, {
    source: platform.id, key: nextKey("pub"), title: "Firm A published standard",
    basis: "forked from the platform starter", opKey: opk("fork"),
  });
  await publishTemplate(world.users.alice, { template: p.template_id, opKey: opk("pub") });
  publishedFork = p.template_id;
});

after(async () => {
  await endPool();
});

function unready(t) {
  if (!ready) {
    t.skip("rig not ready: ensureReady() found no draft_entry, or PR-a's own catalog gate found the four relations / the doors absent");
    return true;
  }
  return false;
}

/** Assert a refusal by BOTH its typed SQLSTATE and its `detail.reason` name. */
async function assertRefusal(code, reason, fn, label) {
  const name = await refusalReason(fn);
  assert.equal(name, reason, `${label}: expected detail.reason=${reason}, got ${name}`);
  await assertRaises(code, fn, label);
}

// =============================================================================================
// A -- STRUCTURE: the four relations, forced RLS, the policy pair, the ACL closed world
// =============================================================================================

test("A1 · the four relations carry forced RLS and exactly their policy pair", async (t) => {
  if (unready(t)) return;
  for (const rel of ["coa_templates", "coa_template_families", "coa_template_accounts", "coa_template_adoptions"]) {
    const r = await rootQuery(
      `select c.relrowsecurity, c.relforcerowsecurity, pg_get_userbyid(c.relowner) as owner,
              (select count(*)::int from pg_policies p where p.schemaname='clara' and p.tablename=$1) as policies
         from pg_class c where c.oid = ('clara.' || $1)::regclass`,
      [rel],
    );
    assert.equal(r.rows[0].relrowsecurity, true, `${rel}: RLS not enabled`);
    assert.equal(r.rows[0].relforcerowsecurity, true, `${rel}: RLS not FORCED`);
    assert.equal(r.rows[0].owner, "clara_fn_owner", `${rel}: wrong owner`);
    assert.equal(r.rows[0].policies, 2, `${rel}: expected exactly the owner policy + the scoped human read`);
  }
});

test("A2 · the header read policy names scope EXPLICITLY -- never `firm_id IS NULL` (R-L26)", async (t) => {
  if (unready(t)) return;
  const r = await rootQuery(
    "select qual from pg_policies where schemaname='clara' and tablename='coa_templates' and policyname='p_coa_templates_human'",
  );
  const qual = r.rows[0].qual;
  assert.match(qual, /scope = 'platform'::text/, "the platform arm is not an explicit scope test");
  assert.match(qual, /firm_id = clara\.jwt_firm\(\)/, "the firm arm is missing");
  assert.equal(/firm_id IS NULL/.test(qual), false, "the policy infers platform from a NULL -- it fails OPEN");
});

test("A3 · the ACL closed world: clara_authenticated holds SELECT and no agent/wake/runtime role reaches the tables", async (t) => {
  if (unready(t)) return;
  for (const rel of ["coa_templates", "coa_template_families", "coa_template_accounts", "coa_template_adoptions"]) {
    const r = await rootQuery(
      `select coalesce(string_agg(g.grantee::regrole::text || ':' || g.privilege_type, ', '
                order by g.grantee::regrole::text, g.privilege_type), '<none>') as acl
         from pg_class c, aclexplode(c.relacl) g
        where c.oid = ('clara.' || $1)::regclass and g.grantee::regrole::text <> 'clara_fn_owner'`,
      [rel],
    );
    assert.equal(r.rows[0].acl, "clara_authenticated:SELECT", `${rel}: unexpected non-owner reach`);
    const bad = await rootQuery(
      `select coalesce(string_agg(x.role, ', '), '<none>') as bad from (values
         ('clara_agent_ro'),('clara_freeform_ro'),('clara_runtime'),('clara_wake_interactive'),
         ('clara_wake_bank'),('clara_wake_proactive'),('clara_wake_filing')) x(role)
        where has_table_privilege(x.role, 'clara.' || $1, 'select')`,
      [rel],
    );
    assert.equal(bad.rows[0].bad, "<none>", `${rel}: an agent/wake/runtime role can read it`);
  }
});

test("A4 · the nine doors reach clara_authenticated only; the four internals reach no app role at all", async (t) => {
  if (unready(t)) return;
  const doors = [
    "clara.fork_coa_template(uuid,text,text,text,text,text)",
    "clara.upsert_coa_template_family(uuid,text,text,text,text,integer,text[],text[],text,text[],text[],text)",
    "clara.remove_coa_template_family(uuid,text,text)",
    ACCOUNT_DOOR,
    "clara.remove_coa_template_account(uuid,text,text)",
    "clara.publish_coa_template(uuid,text)",
    "clara.retire_coa_template(uuid,text)",
    "clara.list_coa_templates()",
    "clara.get_coa_template(uuid)",
  ];
  for (const sig of doors) {
    const r = await rootQuery(
      `select coalesce((select string_agg(g.grantee::regrole::text, ',' order by g.grantee::regrole::text)
                          from pg_proc p, aclexplode(p.proacl) g
                         where p.oid = to_regprocedure($1) and g.privilege_type = 'EXECUTE'), '<none>') as acl,
              has_function_privilege('public', $1, 'execute') as pub`,
      [sig],
    );
    assert.equal(r.rows[0].acl, "clara_authenticated,clara_fn_owner", `${sig}: unexpected EXECUTE matrix`);
    assert.equal(r.rows[0].pub, false, `${sig}: PUBLIC can execute it`);
  }
  for (const sig of [
    "clara._coa_template_content_sha256(uuid)",
    "clara._coa_template_for_edit(uuid,uuid)",
    "clara._tf_coa_template_freeze()",
    "clara._tf_coa_template_child_freeze()",
  ]) {
    const r = await rootQuery(
      `select coalesce((select string_agg(x.role, ', ') from (values
           ('clara_authenticated'),('clara_agent_ro'),('clara_freeform_ro'),('clara_runtime'),
           ('clara_wake_interactive'),('clara_wake_bank'),('clara_wake_proactive'),('clara_wake_filing'),
           ('public')) x(role) where has_function_privilege(x.role, $1, 'execute')), '<none>') as bad`,
      [sig],
    );
    assert.equal(r.rows[0].bad, "<none>", `${sig}: an app role can execute an internal`);
  }
});

// =============================================================================================
// B -- THE MIRRORED PREDICATES (Annex C cell 15, widened from one predicate to seven)
// =============================================================================================

/** Live coa_accounts predicate vs the template's mirror, both via pg_get_constraintdef. */
const MIRRORS = [
  ["ck_coa_account_code_0009", "ck_coa_tmpl_code"],
  ["coa_accounts_account_type_check", "ck_coa_tmpl_type"],
  ["ck_coa_account_class", "ck_coa_tmpl_class"],
  ["coa_accounts_special_acc_type_check", "ck_coa_tmpl_special"],
  ["ck_coa_obe_equity", "ck_coa_tmpl_obe"],
  ["ck_coa_retained_earnings_equity", "ck_coa_tmpl_re"],
  ["ck_coa_sst_purchase_cost_expense", "ck_coa_tmpl_sst"],
];

async function mirrorPair(client, live, mirror) {
  const q = `select
      (select pg_get_constraintdef(con.oid) from pg_constraint con
        where con.conrelid = 'clara.coa_accounts'::regclass and con.conname = $1) as live,
      (select pg_get_constraintdef(con.oid) from pg_constraint con
        where con.conrelid = 'clara.coa_template_accounts'::regclass and con.conname = $2) as mirror`;
  const r = client ? await client.query(q, [live, mirror]) : await rootQuery(q, [live, mirror]);
  return r.rows[0];
}

test("B1 · all seven mirrored predicates are byte-equal to coa_accounts' own", async (t) => {
  if (unready(t)) return;
  for (const [live, mirror] of MIRRORS) {
    const p = await mirrorPair(null, live, mirror);
    assert.notEqual(p.live, null, `${live}: absent from coa_accounts`);
    assert.notEqual(p.mirror, null, `${mirror}: absent from coa_template_accounts`);
    assert.equal(p.mirror, p.live, `${mirror} does not reproduce ${live} byte-for-byte`);
  }
  // The one this cell exists for, spelled out: the account-code form itself.
  const code = await mirrorPair(null, "ck_coa_account_code_0009", "ck_coa_tmpl_code");
  assert.match(code.live, /\^\[0-9\]\{4,8\}\$\|\^\[0-9\]\{3\}-\[0-9A-Z\]\{2,4\}\$/);
});

// =============================================================================================
// C -- THE PLATFORM STARTER SEED
// =============================================================================================

test("C1 · the platform starter is PUBLISHED, migration-authored, and content-hashed", async (t) => {
  if (unready(t)) return;
  assert.notEqual(platform, null, "the platform starter is absent");
  assert.equal(platform.scope, "platform");
  assert.equal(platform.firm_id, null);
  assert.equal(platform.version, 1);
  assert.equal(platform.state, "published");
  assert.equal(platform.framework_hint, "MPERS");
  assert.equal(platform.created_by, null, "a migration-authored template must name no human author");
  assert.equal(platform.published_by, null, "a migration-authored template must name no human publisher");
  assert.notEqual(platform.published_at, null);
  assert.notEqual(platform.content_sha256, null);
  const rehash = await rootQuery(
    "select clara._coa_template_content_sha256($1) = content_sha256 as ok from clara.coa_templates where id = $1",
    [platform.id],
  );
  assert.equal(rehash.rows[0].ok, true, "the stored content hash does not reproduce from the seeded rows");
});

test("C2 · the seed's structural invariants -- 31 families / 100 accounts, by inclusion, by code form", async (t) => {
  if (unready(t)) return;
  const counts = await templateCounts(platform.id);
  assert.equal(counts.families, 31);
  assert.equal(counts.accounts, 100);

  const byIncl = await rootQuery(
    "select inclusion, count(*)::int n from clara.coa_template_families where template_id=$1 group by 1 order by 1",
    [platform.id],
  );
  assert.deepEqual(
    Object.fromEntries(byIncl.rows.map((r) => [r.inclusion, r.n])),
    { by_industry: 6, core: 10, opt_in: 15 },
  );

  // A MAP, not a count (the roster-maps-not-counts lesson): every special marker and its code.
  const specials = await rootQuery(
    "select special_acc_type, account_code, account_type from clara.coa_template_accounts where template_id=$1 and special_acc_type is not null order by 1",
    [platform.id],
  );
  assert.deepEqual(
    Object.fromEntries(specials.rows.map((r) => [r.special_acc_type, `${r.account_code}/${r.account_type}`])),
    {
      opening_balance_equity: "9900/equity",
      retained_earnings: "3900/equity",
      rounding: "9910/expense",
      sst_output: "2150/liability",
      sst_purchase_cost: "9920/expense",
    },
  );

  // Q2: the PLAIN 4-digit branch of ck_coa_account_code_0009, never the NNN-XXXX branch.
  const badCodes = await rootQuery(
    "select coalesce(string_agg(account_code, ', ' order by account_code), '<none>') bad from clara.coa_template_accounts where template_id=$1 and account_code !~ '^[0-9]{4}$'",
    [platform.id],
  );
  assert.equal(badCodes.rows[0].bad, "<none>");

  // ck_coa_family_core_unkeyed, measured on the seeded rows rather than trusted from the CHECK.
  const keyedCore = await rootQuery(
    `select coalesce(string_agg(family_key, ', ' order by family_key), '<none>') bad
       from clara.coa_template_families where template_id=$1 and inclusion='core'
        and (msic_sections<>'{}' or msic_divisions<>'{}' or trade_natures<>'{}' or entity_types<>'{}')`,
    [platform.id],
  );
  assert.equal(keyedCore.rows[0].bad, "<none>");

  // Every family carries a basis (D-13 item 1) and at least one account.
  const thin = await rootQuery(
    `select coalesce(string_agg(f.family_key, ', ' order by f.family_key), '<none>') bad
       from clara.coa_template_families f where f.template_id=$1
        and (btrim(f.basis)='' or not exists (select 1 from clara.coa_template_accounts a
              where a.template_id=$1 and a.family_key=f.family_key))`,
    [platform.id],
  );
  assert.equal(thin.rows[0].bad, "<none>");
});

test("C3 · Q10 the equity swap, Q12 the MSIC 2008 edition stamp, Q11 the statutory names", async (t) => {
  if (unready(t)) return;
  const equity = await rootQuery(
    "select family_key, entity_types from clara.coa_template_families where template_id=$1 and entity_types<>'{}' order by family_key",
    [platform.id],
  );
  assert.deepEqual(
    Object.fromEntries(equity.rows.map((r) => [r.family_key, r.entity_types])),
    {
      equity_company: ["sdn_bhd", "bhd"],
      equity_partnership: ["partnership", "llp"],
      equity_sole_prop: ["sole_prop"],
    },
  );
  // equity_common (Retained Earnings) is CORE and applies in every case.
  const common = await rootQuery(
    "select inclusion, entity_types from clara.coa_template_families where template_id=$1 and family_key='equity_common'",
    [platform.id],
  );
  assert.equal(common.rows[0].inclusion, "core");
  assert.deepEqual(common.rows[0].entity_types, []);

  const msic = await rootQuery(
    `select family_key, msic_edition from clara.coa_template_families
      where template_id=$1 and (msic_sections<>'{}' or msic_divisions<>'{}') order by family_key`,
    [platform.id],
  );
  assert.equal(msic.rows.length, 5, "expected exactly five MSIC-keyed families");
  for (const r of msic.rows) assert.equal(r.msic_edition, "MSIC 2008", `${r.family_key} is not edition-stamped`);
  const stray = await rootQuery(
    `select coalesce(string_agg(family_key, ', '), '<none>') bad from clara.coa_template_families
      where template_id=$1 and msic_edition is not null and msic_sections='{}' and msic_divisions='{}'`,
    [platform.id],
  );
  assert.equal(stray.rows[0].bad, "<none>", "a family carries an edition stamp with no code to stamp");

  const statutory = await rootQuery(
    "select account_code, name from clara.coa_template_accounts where template_id=$1 and family_key='statutory_payables' order by account_code",
    [platform.id],
  );
  assert.deepEqual(
    statutory.rows.map((r) => `${r.account_code} ${r.name}`),
    [
      "2100 EPF (KWSP) Payable",
      "2110 SOCSO (PERKESO) Payable",
      "2120 EIS (SIP) Payable",
      "2130 PCB (MTD) Payable",
      "2140 HRDF (HRD Corp) Levy Payable",
      "2150 SST Output Tax Payable",
    ],
  );
});

test("C4 · Q8 the ten LHDN add-back classes are each their OWN family", async (t) => {
  if (unready(t)) return;
  const expected = [
    "club_subscriptions_and_entrance_fees", "depreciation_and_amortisation", "donations_approved",
    "donations_unapproved", "doubtful_debts_and_provisions", "entertainment", "fines_and_penalties",
    "leave_passage", "motor_running_costs", "private_and_proprietor_expenses",
  ];
  const r = await rootQuery(
    "select family_key, basis from clara.coa_template_families where template_id=$1 and family_key = any($2::text[]) order by family_key",
    [platform.id, expected],
  );
  assert.deepEqual(r.rows.map((x) => x.family_key), expected, "an add-back class is missing its own family");
  for (const row of r.rows) {
    assert.match(row.basis, /ITA 1967|PR \d/, `${row.family_key}: the tax family carries no statutory citation`);
  }
  // D-14's eight are a FLOOR, not the answer: the research added two more.
  const floor = [
    "entertainment", "donations_approved", "donations_unapproved", "fines_and_penalties",
    "depreciation_and_amortisation", "leave_passage", "private_and_proprietor_expenses", "motor_running_costs",
  ];
  for (const f of floor) assert.ok(expected.includes(f), `D-14 floor family ${f} is absent`);
});

test("C5 · the annotation HINTS: twelve add-back leaves verbatim, eleven statutory tags, and NO tax authority", async (t) => {
  if (unready(t)) return;
  const leaves = await rootQuery(
    "select account_code, add_back_class from clara.coa_template_accounts where template_id=$1 and add_back_class is not null order by account_code",
    [platform.id],
  );
  assert.deepEqual(
    Object.fromEntries(leaves.rows.map((r) => [r.account_code, r.add_back_class])),
    {
      6400: "entertainment",
      6410: "donations_approved",
      6420: "donations_unapproved",
      6430: "fines_and_penalties",
      6440: "depreciation_and_amortisation",
      6450: "leave_passage",
      6460: "private_and_proprietor_expenses",
      6470: "motor_running_costs",
      6480: "club_subscriptions_and_entrance_fees",
      6490: "doubtful_debts_specific",
      6491: "doubtful_debts_general",
      6492: "unapproved_provident_fund",
    },
    "the twelve add-back leaves must be VERBATIM as the research spells them -- F-T3 owns the ADDBACK_* mapping",
  );
  const stat = await rootQuery(
    "select account_code, statutory from clara.coa_template_accounts where template_id=$1 and statutory is not null order by account_code",
    [platform.id],
  );
  assert.deepEqual(
    Object.fromEntries(stat.rows.map((r) => [r.account_code, r.statutory])),
    {
      2100: "epf", 2110: "socso", 2120: "eis", 2130: "pcb_mtd", 2140: "hrdf", 2150: "sst_output",
      6010: "epf", 6020: "socso", 6030: "eis", 6040: "hrdf", 9920: "sst_input",
    },
  );
  const mismatch = await rootQuery(
    "select coalesce(string_agg(account_code, ', ' order by account_code), '<none>') bad from clara.coa_template_accounts where template_id=$1 and tax_sensitive <> (add_back_class is not null)",
    [platform.id],
  );
  assert.equal(mismatch.rows[0].bad, "<none>");

  // The boundary, proved by ABSENCE measured directly: no tax_* relation exists in clara, and
  // coa_template_accounts carries exactly one foreign key -- its own family.
  const taxRel = await rootQuery(
    `select coalesce(string_agg(c.relname, ', '), '<none>') bad from pg_class c
       join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='clara' and c.relkind in ('r','v','m') and c.relname like 'tax\\_%'`,
  );
  assert.equal(taxRel.rows[0].bad, "<none>", "PR-a must mint no tax_* relation");
  const fks = await rootQuery(
    `select coalesce(string_agg(con.conname || '->' || con.confrelid::regclass::text, ', ' order by con.conname), '<none>') fks
       from pg_constraint con where con.conrelid='clara.coa_template_accounts'::regclass and con.contype='f'`,
  );
  assert.equal(fks.rows[0].fks, "fk_coa_tmpl_account_family->clara.coa_template_families");

  // The column comments say what the columns are, so a later reader cannot mistake a hint for a
  // treatment. Read from the catalog, not from the migration text.
  const comments = await rootQuery(
    `select a.attname, col_description(a.attrelid, a.attnum) as c
       from pg_attribute a where a.attrelid='clara.coa_template_accounts'::regclass
        and a.attname in ('tax_sensitive','add_back_class','statutory') order by a.attname`,
  );
  assert.equal(comments.rows.length, 3);
  for (const row of comments.rows) {
    assert.match(row.c ?? "", /HINT/i, `${row.attname}: the column comment does not say it is a hint`);
    assert.match(row.c ?? "", /NOT a treatment/i, `${row.attname}: the column comment does not disclaim a treatment`);
  }
});

// =============================================================================================
// D -- VISIBILITY. Both directions, because a leak-only cell cannot tell "isolated" from "broken".
// =============================================================================================

test("D1 · POSITIVE: a bookkeeper of firm A and an owner of firm B are BOTH returned the platform starter", async (t) => {
  if (unready(t)) return;
  for (const [who, sub] of [["firm-A bookkeeper", world.users.bob], ["firm-B owner", world.users.dave]]) {
    const rows = await listTemplates(sub);
    const ids = rows.map((r) => r.template_id);
    assert.ok(ids.includes(platform.id), `${who} cannot see the platform starter`);
    const fam = await humanFamilyCodes(sub, platform.id);
    assert.equal(fam.length, 31, `${who} cannot read the platform starter's families`);
    const acc = await humanAccountCodes(sub, platform.id);
    assert.equal(acc.length, 100, `${who} cannot read the platform starter's accounts`);
    const doc = await getTemplate(sub, platform.id);
    assert.equal(doc.template_id, platform.id, `${who} cannot get_coa_template the platform starter`);
  }
});

test("D2 · NEGATIVE: firm B sees none of firm A's firm-scoped template, header or content", async (t) => {
  if (unready(t)) return;
  const aliceIds = (await listTemplates(world.users.alice)).map((r) => r.template_id);
  assert.ok(aliceIds.includes(publishedFork), "firm A cannot see its OWN template -- the read is broken, not isolated");
  const daveIds = (await listTemplates(world.users.dave)).map((r) => r.template_id);
  assert.equal(daveIds.includes(publishedFork), false, "firm B can see firm A's template");
  assert.deepEqual(await humanFamilyCodes(world.users.dave, publishedFork), [], "firm B can read firm A's families");
  assert.deepEqual(await humanAccountCodes(world.users.dave, publishedFork), [], "firm B can read firm A's accounts");
  assert.equal(await getTemplate(world.users.dave, publishedFork), null, "get_coa_template leaks across firms");
  // And firm A really can read its own content -- the positive control for the two [] above.
  assert.equal((await humanFamilyCodes(world.users.alice, publishedFork)).length, 31);
});

// =============================================================================================
// E -- fork_coa_template
// =============================================================================================

test("E1 · fork happy path: a published source is COPIED into a new firm draft at version 1", async (t) => {
  if (unready(t)) return;
  const key = nextKey("e1");
  const out = await forkTemplate(world.users.alice, {
    source: platform.id, key, title: "E1", basis: "e1 basis", opKey: opk("fork"),
  });
  assert.equal(out.state, "draft");
  assert.equal(out.version, 1);
  assert.equal(out.families, 31);
  assert.equal(out.accounts, 100);
  const row = await rawTemplate(out.template_id);
  assert.equal(row.scope, "firm");
  assert.equal(row.firm_id, world.firms.A);
  assert.equal(row.forked_from, platform.id);
  assert.equal(row.created_by, world.users.alice);
  assert.equal(row.content_sha256, null, "a draft must carry no content hash");

  // A second fork of the SAME key lands at version 2 -- versions exist so a firm knows what it applied.
  const out2 = await forkTemplate(world.users.alice, {
    source: platform.id, key, title: "E1 again", basis: "e1 basis", opKey: opk("fork"),
  });
  assert.equal(out2.version, 2);
});

test("E2 · fork with a NULL source starts an EMPTY firm draft", async (t) => {
  if (unready(t)) return;
  const out = await forkTemplate(world.users.alice, {
    source: null, key: nextKey("e2"), title: "E2 blank", basis: "authored from scratch", opKey: opk("fork"),
  });
  assert.equal(out.families, 0);
  assert.equal(out.accounts, 0);
  assert.equal((await rawTemplate(out.template_id)).forked_from, null);
});

test("E3 · fork refusals, each by typed code AND name", async (t) => {
  if (unready(t)) return;
  const ok = { source: platform.id, key: nextKey("e3"), title: "x", basis: "b" };
  await assertRaises(CLR.authz, () => forkTemplate(world.users.bob, { ...ok, opKey: opk("f") }),
    "a bookkeeper forks");
  await assertRaises(CLR.authz, () => forkTemplate(world.users.carol, { ...ok, opKey: opk("f") }),
    "a viewer forks");
  await assertRefusal(CLR.badRequest, "op_key_required",
    () => forkTemplate(world.users.alice, { ...ok, opKey: "  " }), "blank op_key");
  await assertRefusal(CLR.badRequest, "bad_template_key",
    () => forkTemplate(world.users.alice, { ...ok, key: "Not A Key", opKey: opk("f") }), "bad template_key");
  await assertRefusal(CLR.badRequest, "title_required",
    () => forkTemplate(world.users.alice, { ...ok, title: "   ", opKey: opk("f") }), "blank title");
  await assertRefusal(CLR.badRequest, "bad_framework_hint",
    () => forkTemplate(world.users.alice, { ...ok, framework: "IFRS", opKey: opk("f") }), "bad framework_hint");
  await assertRefusal(CLR.badRequest, "basis_required",
    () => forkTemplate(world.users.alice, { ...ok, basis: " ", opKey: opk("f") }), "blank basis");
  await assertRefusal(CLR.notFound, "template_not_found",
    () => forkTemplate(world.users.alice, { ...ok, source: randomUUID(), opKey: opk("f") }), "unknown source");
  // NO cross-firm existence oracle: firm B forking firm A's template gets the SAME refusal as
  // for a template that does not exist at all.
  await assertRefusal(CLR.notFound, "template_not_found",
    () => forkTemplate(world.users.dave, { ...ok, source: publishedFork, key: nextKey("e3b"), opKey: opk("f") }),
    "cross-firm source");
  await assertRefusal(CLR.badRequest, "source_not_published",
    () => forkTemplate(world.users.alice, { ...ok, source: draft, key: nextKey("e3c"), opKey: opk("f") }),
    "forking a draft");
});

test("E4 · a replay under the SAME op_key returns the stored result and forks nothing new", async (t) => {
  if (unready(t)) return;
  const key = nextKey("e4");
  const opKey = opk("e4");
  const first = await forkTemplate(world.users.alice, {
    source: platform.id, key, title: "E4", basis: "b", opKey,
  });
  const before = await rootQuery("select count(*)::int n from clara.coa_templates");
  const replay = await forkTemplate(world.users.alice, {
    source: platform.id, key, title: "E4", basis: "b", opKey,
  });
  const after = await rootQuery("select count(*)::int n from clara.coa_templates");
  assert.equal(replay.template_id, first.template_id, "the replay did not return the stored result");
  assert.equal(after.rows[0].n, before.rows[0].n, "the replay planted a second template");
  // The same op_key with DIFFERENT args is a CLR10, not a silent second fork.
  await assertRaises(CLR.badRequest, () => forkTemplate(world.users.alice, {
    source: platform.id, key, title: "E4 DIFFERENT", basis: "b", opKey,
  }), "op_key reused with different args");
});

// =============================================================================================
// F -- the four editor doors
// =============================================================================================

test("F1 · upsert_coa_template_family: insert then update, on a draft", async (t) => {
  if (unready(t)) return;
  await upsertFamily(world.users.alice, {
    template: draft, familyKey: "rig_extra", label: "Rig Extra", inclusion: "opt_in",
    basis: "firm practice", sortOrdinal: 900, opKey: opk("fam"),
  });
  let row = await rootQuery(
    "select label, inclusion, sort_ordinal from clara.coa_template_families where template_id=$1 and family_key='rig_extra'",
    [draft],
  );
  assert.equal(row.rows[0].label, "Rig Extra");
  await upsertFamily(world.users.alice, {
    template: draft, familyKey: "rig_extra", label: "Rig Extra v2", inclusion: "by_industry",
    basis: "firm practice", sortOrdinal: 901, msicSections: ["G"], msicEdition: "MSIC 2008",
    tradeNatures: ["goods_trading"], opKey: opk("fam"),
  });
  row = await rootQuery(
    "select label, inclusion, sort_ordinal, msic_sections, msic_edition, trade_natures from clara.coa_template_families where template_id=$1 and family_key='rig_extra'",
    [draft],
  );
  assert.equal(row.rows[0].label, "Rig Extra v2");
  assert.equal(row.rows[0].inclusion, "by_industry");
  assert.deepEqual(row.rows[0].msic_sections, ["G"]);
  assert.equal(row.rows[0].msic_edition, "MSIC 2008");
  assert.deepEqual(row.rows[0].trade_natures, ["goods_trading"]);
});

test("F2 · upsert_coa_template_family refusals, each by typed code AND name", async (t) => {
  if (unready(t)) return;
  const base = {
    template: draft, familyKey: "rig_probe", label: "L", inclusion: "opt_in", basis: "firm practice",
  };
  await assertRaises(CLR.authz, () => upsertFamily(world.users.bob, { ...base, opKey: opk("f") }), "bookkeeper edits");
  await assertRefusal(CLR.badRequest, "op_key_required",
    () => upsertFamily(world.users.alice, { ...base, opKey: null }), "null op_key");
  await assertRefusal(CLR.notFound, "template_not_found",
    () => upsertFamily(world.users.alice, { ...base, template: randomUUID(), opKey: opk("f") }), "unknown template");
  await assertRefusal(CLR.notFound, "template_not_found",
    () => upsertFamily(world.users.dave, { ...base, opKey: opk("f") }), "another firm's template");
  await assertRefusal(CLR.badRequest, "platform_template_not_editable",
    () => upsertFamily(world.users.alice, { ...base, template: platform.id, opKey: opk("f") }), "the platform starter");
  await assertRefusal(CLR.badRequest, "template_not_draft",
    () => upsertFamily(world.users.alice, { ...base, template: publishedFork, opKey: opk("f") }), "a published template");
  await assertRefusal(CLR.badRequest, "bad_family_key",
    () => upsertFamily(world.users.alice, { ...base, familyKey: "Bad Key", opKey: opk("f") }), "bad family_key");
  await assertRefusal(CLR.badRequest, "label_required",
    () => upsertFamily(world.users.alice, { ...base, label: " ", opKey: opk("f") }), "blank label");
  await assertRefusal(CLR.badRequest, "bad_inclusion",
    () => upsertFamily(world.users.alice, { ...base, inclusion: "sometimes", opKey: opk("f") }), "bad inclusion");
  await assertRefusal(CLR.badRequest, "basis_required",
    () => upsertFamily(world.users.alice, { ...base, basis: "  ", opKey: opk("f") }), "blank basis");
  await assertRefusal(CLR.badRequest, "sort_ordinal_required",
    () => upsertFamily(world.users.alice, { ...base, sortOrdinal: null, opKey: opk("f") }), "null sort_ordinal");
  await assertRefusal(CLR.badRequest, "core_family_keyed",
    () => upsertFamily(world.users.alice, { ...base, inclusion: "core", tradeNatures: ["services"], opKey: opk("f") }),
    "a core family with trim keys");
  await assertRefusal(CLR.badRequest, "bad_msic_section",
    () => upsertFamily(world.users.alice, { ...base, msicSections: ["ZZ"], msicEdition: "MSIC 2008", opKey: opk("f") }),
    "bad msic section");
  await assertRefusal(CLR.badRequest, "bad_msic_division",
    () => upsertFamily(world.users.alice, { ...base, msicDivisions: ["6810"], msicEdition: "MSIC 2008", opKey: opk("f") }),
    "a 5-digit-ish MSIC leaf where a division belongs");
  await assertRefusal(CLR.badRequest, "bad_msic_edition",
    () => upsertFamily(world.users.alice, { ...base, msicSections: ["C"], msicEdition: "MSIC 1999", opKey: opk("f") }),
    "bad msic edition");
  await assertRefusal(CLR.badRequest, "msic_edition_unpaired",
    () => upsertFamily(world.users.alice, { ...base, msicSections: ["C"], msicEdition: null, opKey: opk("f") }),
    "an MSIC key with no edition stamp");
  await assertRefusal(CLR.badRequest, "msic_edition_unpaired",
    () => upsertFamily(world.users.alice, { ...base, msicEdition: "MSIC 2008", opKey: opk("f") }),
    "an edition stamp with no MSIC key");
  await assertRefusal(CLR.badRequest, "unknown_trade_nature",
    () => upsertFamily(world.users.alice, { ...base, tradeNatures: ["barter"], opKey: opk("f") }), "unknown trade_nature");
  await assertRefusal(CLR.badRequest, "unknown_entity_type",
    () => upsertFamily(world.users.alice, { ...base, entityTypes: ["plc"], opKey: opk("f") }), "unknown entity_type");
});

test("F3 · remove_coa_template_family takes its accounts with it, and names an unknown family", async (t) => {
  if (unready(t)) return;
  const before = await templateCounts(draft);
  const out = await removeFamily(world.users.alice, { template: draft, familyKey: "fnb_hospitality", opKey: opk("rm") });
  assert.equal(out.accounts_removed, 4, "fnb_hospitality carries four accounts on the starter");
  const after = await templateCounts(draft);
  assert.equal(after.families, before.families - 1);
  assert.equal(after.accounts, before.accounts - 4);
  await assertRefusal(CLR.badRequest, "unknown_family",
    () => removeFamily(world.users.alice, { template: draft, familyKey: "no_such_family", opKey: opk("rm") }),
    "removing a family that is not there");
  await assertRaises(CLR.authz, () => removeFamily(world.users.bob, { template: draft, familyKey: "revenue", opKey: opk("rm") }),
    "a bookkeeper removes a family");
});

test("F4 · upsert_coa_template_account: happy path and every named refusal", async (t) => {
  if (unready(t)) return;
  await upsertTemplateAccount(world.users.alice, {
    template: draft, familyKey: "rig_extra", code: "7000", name: "Rig Account", type: "expense",
    sortOrdinal: 10, opKey: opk("acc"),
  });
  const row = await rootQuery(
    "select name, account_type from clara.coa_template_accounts where template_id=$1 and account_code='7000'",
    [draft],
  );
  assert.equal(row.rows[0].name, "Rig Account");

  const base = { template: draft, familyKey: "rig_extra", code: "7001", name: "N", type: "expense" };
  await assertRaises(CLR.authz, () => upsertTemplateAccount(world.users.bob, { ...base, opKey: opk("a") }), "bookkeeper");
  await assertRefusal(CLR.badRequest, "op_key_required",
    () => upsertTemplateAccount(world.users.alice, { ...base, opKey: "" }), "blank op_key");
  await assertRefusal(CLR.badRequest, "unknown_family",
    () => upsertTemplateAccount(world.users.alice, { ...base, familyKey: "nope", opKey: opk("a") }), "unknown family");
  await assertRefusal(CLR.badRequest, "bad_account_code",
    () => upsertTemplateAccount(world.users.alice, { ...base, code: "70", opKey: opk("a") }), "bad account_code");
  await assertRefusal(CLR.badRequest, "name_required",
    () => upsertTemplateAccount(world.users.alice, { ...base, name: " ", opKey: opk("a") }), "blank name");
  await assertRefusal(CLR.badRequest, "bad_account_type",
    () => upsertTemplateAccount(world.users.alice, { ...base, type: "contra", opKey: opk("a") }), "bad account_type");
  await assertRefusal(CLR.badRequest, "bad_account_class",
    () => upsertTemplateAccount(world.users.alice, { ...base, accountClass: "control", opKey: opk("a") }), "bad account_class");
  await assertRefusal(CLR.badRequest, "bad_special_acc_type",
    () => upsertTemplateAccount(world.users.alice, { ...base, special: "vat_output", opKey: opk("a") }), "bad special_acc_type");
  await assertRefusal(CLR.badRequest, "special_acc_type_type_mismatch",
    () => upsertTemplateAccount(world.users.alice, { ...base, special: "retained_earnings", type: "expense", opKey: opk("a") }),
    "retained_earnings on a non-equity account");
  await assertRefusal(CLR.badRequest, "sort_ordinal_required",
    () => upsertTemplateAccount(world.users.alice, { ...base, sortOrdinal: null, opKey: opk("a") }), "null sort_ordinal");
  await assertRefusal(CLR.badRequest, "platform_template_not_editable",
    () => upsertTemplateAccount(world.users.alice, { ...base, template: platform.id, opKey: opk("a") }), "the platform starter");
  await assertRefusal(CLR.notFound, "template_not_found",
    () => upsertTemplateAccount(world.users.dave, { ...base, opKey: opk("a") }), "another firm's template");
  // The annotation hints' own refusals (conductor ruling 2026-08-29).
  await assertRefusal(CLR.badRequest, "bad_add_back_class",
    () => upsertTemplateAccount(world.users.alice, { ...base, taxSensitive: true, addBackClass: "ADDBACK_ENTERTAINMENT", opKey: opk("a") }),
    "an F-T3 ADDBACK_* code where a research leaf belongs");
  await assertRefusal(CLR.badRequest, "add_back_class_not_tax_sensitive",
    () => upsertTemplateAccount(world.users.alice, { ...base, taxSensitive: false, addBackClass: "entertainment", opKey: opk("a") }),
    "an add-back class on a non-tax-sensitive account");
  await assertRefusal(CLR.badRequest, "bad_statutory_tag",
    () => upsertTemplateAccount(world.users.alice, { ...base, statutory: "EPF Payable", opKey: opk("a") }),
    "a non-snake statutory tag");
  // Positive control: each of the twelve researched leaves IS admitted through the door.
  const leaves = [
    "entertainment", "donations_approved", "donations_unapproved", "fines_and_penalties",
    "depreciation_and_amortisation", "leave_passage", "private_and_proprietor_expenses",
    "motor_running_costs", "club_subscriptions_and_entrance_fees", "doubtful_debts_specific",
    "doubtful_debts_general", "unapproved_provident_fund",
  ];
  for (const [i, leaf] of leaves.entries()) {
    await upsertTemplateAccount(world.users.alice, {
      template: draft, familyKey: "rig_extra", code: String(7100 + i), name: `Leaf ${leaf}`,
      type: "expense", taxSensitive: true, addBackClass: leaf, sortOrdinal: 100 + i, opKey: opk("a"),
    });
  }
  // Scoped to THIS cell's own 71xx codes: the draft is a fork of the starter, so it already
  // carries the twelve seeded 64xx annotations and a bare add_back_class count would be 24.
  const planted = await rootQuery(
    `select coalesce(string_agg(add_back_class, ',' order by account_code), '<none>') planted
       from clara.coa_template_accounts
      where template_id = $1 and account_code between '7100' and '7111'`,
    [draft],
  );
  assert.equal(planted.rows[0].planted, leaves.join(","),
    "not every researched leaf is admitted by the door, or they landed out of order");
  for (const [i] of leaves.entries()) {
    await removeTemplateAccount(world.users.alice, { template: draft, code: String(7100 + i), opKey: opk("a") });
  }
});

test("F5 · the uq_coa_special MIRROR refuses a second marker AT AUTHORING (Annex C cell 4)", async (t) => {
  if (unready(t)) return;
  // The starter already carries 9910 as `rounding`. A second rounding account on the same
  // template is refused HERE, so uq_coa_special can never fire mid-loop at apply.
  await assertRefusal(CLR.badRequest, "duplicate_special_acc_type",
    () => upsertTemplateAccount(world.users.alice, {
      template: draft, familyKey: "system_roles", code: "9911", name: "Rounding 2",
      type: "expense", special: "rounding", sortOrdinal: 40, opKey: opk("a"),
    }),
    "a second rounding marker");
  // Positive control: the SAME call with no marker is accepted, so the refusal above discriminates.
  await upsertTemplateAccount(world.users.alice, {
    template: draft, familyKey: "system_roles", code: "9911", name: "Rounding 2 (unmarked)",
    type: "expense", sortOrdinal: 40, opKey: opk("a"),
  });
  await removeTemplateAccount(world.users.alice, { template: draft, code: "9911", opKey: opk("a") });
});

test("F6 · remove_coa_template_account: happy path and the unknown-code refusal", async (t) => {
  if (unready(t)) return;
  const before = await templateCounts(draft);
  await removeTemplateAccount(world.users.alice, { template: draft, code: "7000", opKey: opk("rm") });
  const after = await templateCounts(draft);
  assert.equal(after.accounts, before.accounts - 1);
  await assertRefusal(CLR.badRequest, "unknown_account_code",
    () => removeTemplateAccount(world.users.alice, { template: draft, code: "7000", opKey: opk("rm") }),
    "removing an account twice");
  await assertRaises(CLR.authz,
    () => removeTemplateAccount(world.users.bob, { template: draft, code: "1000", opKey: opk("rm") }),
    "a bookkeeper removes an account");
});

// =============================================================================================
// G -- publish / retire
// =============================================================================================

test("G1 · publish stamps the publisher, the time and the content hash", async (t) => {
  if (unready(t)) return;
  const f = await forkTemplate(world.users.alice, {
    source: platform.id, key: nextKey("g1"), title: "G1", basis: "b", opKey: opk("fork"),
  });
  const out = await publishTemplate(world.users.alice, { template: f.template_id, opKey: opk("pub") });
  assert.equal(out.state, "published");
  assert.equal(out.families, 31);
  assert.equal(out.accounts, 100);
  const row = await rawTemplate(f.template_id);
  assert.equal(row.state, "published");
  assert.equal(row.published_by, world.users.alice);
  assert.notEqual(row.published_at, null);
  assert.equal(row.content_sha256.toString("hex"), out.content_sha256);
  // Two publishes of IDENTICAL content are visibly identical (design D-2).
  assert.equal(out.content_sha256, platform.content_sha256.toString("hex"),
    "an unedited fork of the starter must hash to the starter's own content");
});

test("G2 · publish refusals, each by typed code AND name", async (t) => {
  if (unready(t)) return;
  const empty = await forkTemplate(world.users.alice, {
    source: null, key: nextKey("g2e"), title: "G2 empty", basis: "b", opKey: opk("fork"),
  });
  await assertRefusal(CLR.badRequest, "template_empty",
    () => publishTemplate(world.users.alice, { template: empty.template_id, opKey: opk("p") }), "an empty draft");

  // A family with no accounts is a trim unit that plants nothing. The rungs are ORDERED --
  // template_empty first, empty_family second -- so this cell has to get past the first one to
  // reach the second: one populated family plus one hollow one.
  await upsertFamily(world.users.alice, {
    template: empty.template_id, familyKey: "solid", label: "Solid", inclusion: "opt_in",
    basis: "firm practice", opKey: opk("fam"),
  });
  await upsertTemplateAccount(world.users.alice, {
    template: empty.template_id, familyKey: "solid", code: "8000", name: "Solid account",
    type: "expense", opKey: opk("acc"),
  });
  await upsertFamily(world.users.alice, {
    template: empty.template_id, familyKey: "hollow", label: "Hollow", inclusion: "opt_in",
    basis: "firm practice", sortOrdinal: 20, opKey: opk("fam"),
  });
  await assertRefusal(CLR.badRequest, "empty_family",
    () => publishTemplate(world.users.alice, { template: empty.template_id, opKey: opk("p") }), "a family with no accounts");
  // Positive control: give the hollow family one account and the SAME call now succeeds.
  await upsertTemplateAccount(world.users.alice, {
    template: empty.template_id, familyKey: "hollow", code: "8001", name: "Hollow account",
    type: "expense", opKey: opk("acc"),
  });
  const ok = await publishTemplate(world.users.alice, { template: empty.template_id, opKey: opk("p") });
  assert.equal(ok.state, "published");

  await assertRefusal(CLR.badRequest, "template_not_draft",
    () => publishTemplate(world.users.alice, { template: empty.template_id, opKey: opk("p") }), "publishing twice");
  await assertRefusal(CLR.badRequest, "platform_template_not_editable",
    () => publishTemplate(world.users.alice, { template: platform.id, opKey: opk("p") }), "publishing the platform starter");
  await assertRefusal(CLR.notFound, "template_not_found",
    () => publishTemplate(world.users.dave, { template: draft, opKey: opk("p") }), "publishing another firm's draft");
  await assertRaises(CLR.authz, () => publishTemplate(world.users.bob, { template: draft, opKey: opk("p") }),
    "a bookkeeper publishes");
  await assertRefusal(CLR.badRequest, "op_key_required",
    () => publishTemplate(world.users.alice, { template: draft, opKey: null }), "null op_key");
});

test("G3 · retire is a STATE, and refuses everything that is not a published template of mine", async (t) => {
  if (unready(t)) return;
  const f = await forkTemplate(world.users.alice, {
    source: platform.id, key: nextKey("g3"), title: "G3", basis: "b", opKey: opk("fork"),
  });
  await assertRefusal(CLR.badRequest, "template_not_published",
    () => retireTemplate(world.users.alice, { template: f.template_id, opKey: opk("r") }), "retiring a draft");
  await publishTemplate(world.users.alice, { template: f.template_id, opKey: opk("pub") });
  const out = await retireTemplate(world.users.alice, { template: f.template_id, opKey: opk("r") });
  assert.equal(out.state, "retired");
  const row = await rawTemplate(f.template_id);
  assert.equal(row.state, "retired");
  assert.notEqual(row.retired_at, null);
  assert.notEqual(row.content_sha256, null, "retiring must not discard the content hash");
  await assertRefusal(CLR.badRequest, "template_not_published",
    () => retireTemplate(world.users.alice, { template: f.template_id, opKey: opk("r") }), "retiring twice");
  await assertRefusal(CLR.badRequest, "platform_template_not_editable",
    () => retireTemplate(world.users.alice, { template: platform.id, opKey: opk("r") }), "retiring the platform starter");
  await assertRefusal(CLR.notFound, "template_not_found",
    () => retireTemplate(world.users.dave, { template: publishedFork, opKey: opk("r") }), "retiring another firm's template");
  await assertRaises(CLR.authz, () => retireTemplate(world.users.bob, { template: publishedFork, opKey: opk("r") }),
    "a bookkeeper retires");
});

// =============================================================================================
// H -- IMMUTABILITY BY VERSION, and copy-not-reference
// =============================================================================================

test("H1 · a published template's header, families and accounts are immutable (CLR08), and nothing is deletable", async (t) => {
  if (unready(t)) return;
  await assertRaises(CLR.immutable,
    () => rootQuery("update clara.coa_templates set title = 'mutated' where id = $1", [publishedFork]),
    "editing a published header");
  await assertRaises(CLR.immutable,
    () => rootQuery("delete from clara.coa_templates where id = $1", [publishedFork]),
    "deleting a template");
  await assertRaises(CLR.immutable,
    () => rootQuery("update clara.coa_template_families set label = 'mutated' where template_id = $1 and family_key = 'revenue'", [publishedFork]),
    "editing a published family");
  await assertRaises(CLR.immutable,
    () => rootQuery("delete from clara.coa_template_accounts where template_id = $1 and account_code = '1000'", [publishedFork]),
    "deleting a published account");
  await assertRaises(CLR.immutable,
    () => rootQuery(
      `insert into clara.coa_template_accounts(template_id, family_key, account_code, name, account_type, sort_ordinal)
       values ($1, 'revenue', '4999', 'Sneak', 'income', 99)`, [publishedFork]),
    "inserting into a published template");
  // Positive control: the SAME shapes are accepted on a DRAFT, so the refusals above are the
  // freeze and not a broken table.
  await rootQuery("update clara.coa_template_families set label = label where template_id = $1 and family_key = 'revenue'", [draft]);
});

test("H2 · copy-not-reference: editing a NEW version leaves the earlier version byte-unchanged", async (t) => {
  if (unready(t)) return;
  const beforeFork = await snapshotTemplate(publishedFork);
  const beforePlatform = await snapshotTemplate(platform.id);

  const v2 = await forkTemplate(world.users.alice, {
    source: publishedFork, key: nextKey("h2"), title: "H2 v2", basis: "b", opKey: opk("fork"),
  });
  await removeFamily(world.users.alice, { template: v2.template_id, familyKey: "manufacturing", opKey: opk("rm") });
  await upsertFamily(world.users.alice, {
    template: v2.template_id, familyKey: "h2_new", label: "H2 New", inclusion: "opt_in",
    basis: "firm practice", sortOrdinal: 999, opKey: opk("fam"),
  });
  await upsertTemplateAccount(world.users.alice, {
    template: v2.template_id, familyKey: "h2_new", code: "8100", name: "H2 account", type: "expense", opKey: opk("acc"),
  });
  await publishTemplate(world.users.alice, { template: v2.template_id, opKey: opk("pub") });

  assert.equal(await snapshotTemplate(publishedFork), beforeFork,
    "editing a fork mutated the template it was forked FROM -- the apply's copy semantics are broken");
  assert.equal(await snapshotTemplate(platform.id), beforePlatform,
    "editing a firm template mutated the PLATFORM starter");

  const shas = await rootQuery(
    "select encode(content_sha256,'hex') h from clara.coa_templates where id = any($1::uuid[]) order by id",
    [[publishedFork, v2.template_id]],
  );
  assert.notEqual(shas.rows[0].h, shas.rows[1].h, "two templates with different content hash the same");
});

test("H3 · get_coa_template returns the whole document, and list_coa_templates counts its rows", async (t) => {
  if (unready(t)) return;
  const doc = await getTemplate(world.users.alice, platform.id);
  assert.equal(doc.scope, "platform");
  assert.equal(doc.state, "published");
  assert.equal(doc.families.length, 31);
  assert.equal(doc.accounts.length, 100);
  assert.equal(doc.content_sha256, platform.content_sha256.toString("hex"));
  const listed = (await listTemplates(world.users.alice)).find((r) => r.template_id === platform.id);
  assert.equal(listed.families, 31);
  assert.equal(listed.accounts, 100);
});

// =============================================================================================
// I -- THE MUTANT PANEL. Every wall deleted inside a rolled-back transaction.
// =============================================================================================

test("I-M1 · uq_coa_tmpl_special: dropping it stops the door refusing duplicate_special_acc_type", async (t) => {
  if (unready(t)) return;
  await withRolledBackTx(async (c) => {
    const asAlice = async () => {
      await c.query("set local role clara_authenticated");
      await c.query("select set_config('request.jwt.claims', $1, true)", [
        JSON.stringify({ sub: world.users.alice, role: "authenticated" }),
      ]);
    };
    const call = (opKey) =>
      c.query(
        `select clara.upsert_coa_template_account(p_template => $1::uuid, p_family_key => 'system_roles',
           p_account_code => '9931', p_name => 'Rounding dup', p_account_type => 'expense',
           p_account_class => null, p_special_acc_type => 'rounding', p_sort_ordinal => 77,
           p_tax_sensitive => false, p_add_back_class => null, p_statutory => null,
           p_op_key => $2::text)`,
        [draft, opKey],
      );
    await asAlice();
    assert.equal(await refusalReason(() => call(opk("m1a"))), "duplicate_special_acc_type",
      "control: the wall is not refusing before the mutation");
    // The control refusal ABORTED this transaction, so the mutation needs a fresh one (the
    // rollback also drops SET LOCAL ROLE, which is why asAlice() runs again below).
    await c.query("rollback");
    await c.query("begin");
    await c.query("drop index clara.uq_coa_tmpl_special");
    await asAlice();
    assert.equal(await raisedCode(() => call(opk("m1b"))), null,
      "MUTANT: with uq_coa_tmpl_special dropped the duplicate marker must be ACCEPTED -- if it still refuses, the cell is not testing that index");
  });
  // The rollback restored it: the control refusal works again outside the transaction.
  assert.equal(
    await refusalReason(() => upsertTemplateAccount(world.users.alice, {
      template: draft, familyKey: "system_roles", code: "9932", name: "Rounding dup 2",
      type: "expense", special: "rounding", sortOrdinal: 78, opKey: opk("m1c"),
    })),
    "duplicate_special_acc_type",
    "the mutant leaked out of its transaction",
  );
});

test("I-M2 · ck_coa_tmpl_code: dropping it makes the mirror-equality census (cell 15) FAIL", async (t) => {
  if (unready(t)) return;
  await withRolledBackTx(async (c) => {
    let p = await mirrorPair(c, "ck_coa_account_code_0009", "ck_coa_tmpl_code");
    assert.equal(p.mirror, p.live, "control: the mirror is already broken before the mutation");
    await c.query("alter table clara.coa_template_accounts drop constraint ck_coa_tmpl_code");
    p = await mirrorPair(c, "ck_coa_account_code_0009", "ck_coa_tmpl_code");
    assert.equal(p.mirror, null, "MUTANT: the mirror must be gone");
    assert.notEqual(p.mirror, p.live, "MUTANT: the census must now report inequality -- a pin that cannot fail is not a pin");
  });
  const restored = await mirrorPair(null, "ck_coa_account_code_0009", "ck_coa_tmpl_code");
  assert.equal(restored.mirror, restored.live, "the mutant leaked out of its transaction");
});

test("I-M3 · ck_coa_family_core_unkeyed: dropping it lets a core family carry trim keys", async (t) => {
  if (unready(t)) return;
  const bad = (c) =>
    c.query(
      `insert into clara.coa_template_families(template_id, family_key, label, inclusion, basis, sort_ordinal, trade_natures)
       values ($1, 'm3_core', 'M3', 'core', 'firm practice', 990, array['services']::text[])`,
      [draft],
    );
  await withRolledBackTx(async (c) => {
    assert.equal(await raisedCode(() => bad(c)), PG.checkViolation, "control: the CHECK is not refusing");
    await c.query("rollback");
    await c.query("begin");
    await c.query("alter table clara.coa_template_families drop constraint ck_coa_family_core_unkeyed");
    assert.equal(await raisedCode(() => bad(c)), null, "MUTANT: with the CHECK dropped the row must be ACCEPTED");
  });
});

test("I-M4 · t_coa_template_accounts_freeze: dropping it lets a PUBLISHED template gain an account", async (t) => {
  if (unready(t)) return;
  const sneak = (c) =>
    c.query(
      `insert into clara.coa_template_accounts(template_id, family_key, account_code, name, account_type, sort_ordinal)
       values ($1, 'revenue', '4998', 'M4 sneak', 'income', 98)`,
      [publishedFork],
    );
  await withRolledBackTx(async (c) => {
    assert.equal(await raisedCode(() => sneak(c)), CLR.immutable, "control: the freeze is not refusing");
    await c.query("rollback");
    await c.query("begin");
    await c.query("drop trigger t_coa_template_accounts_freeze on clara.coa_template_accounts");
    assert.equal(await raisedCode(() => sneak(c)), null, "MUTANT: with the trigger dropped the insert must be ACCEPTED");
  });
});

test("I-M5 · t_coa_templates_freeze: dropping it lets a PUBLISHED header be edited", async (t) => {
  if (unready(t)) return;
  const edit = (c) => c.query("update clara.coa_templates set title = 'M5 mutated' where id = $1", [publishedFork]);
  await withRolledBackTx(async (c) => {
    assert.equal(await raisedCode(() => edit(c)), CLR.immutable, "control: the freeze is not refusing");
    await c.query("rollback");
    await c.query("begin");
    await c.query("drop trigger t_coa_templates_freeze on clara.coa_templates");
    assert.equal(await raisedCode(() => edit(c)), null, "MUTANT: with the trigger dropped the update must be ACCEPTED");
  });
});

test("I-M6 · p_coa_templates_human: relaxing it opens firm A's template to firm B", async (t) => {
  if (unready(t)) return;
  await withRolledBackTx(async (c) => {
    const seenByDave = async () => {
      await c.query("set local role clara_authenticated");
      await c.query("select set_config('request.jwt.claims', $1, true)", [
        JSON.stringify({ sub: world.users.dave, role: "authenticated" }),
      ]);
      const r = await c.query("select count(*)::int n from clara.coa_templates where id = $1", [publishedFork]);
      await c.query("reset role");
      return r.rows[0].n;
    };
    assert.equal(await seenByDave(), 0, "control: firm B already sees firm A's template");
    await c.query("alter policy p_coa_templates_human on clara.coa_templates using (true)");
    assert.equal(await seenByDave(), 1, "MUTANT: with the predicate relaxed firm B must see it -- otherwise the cell proves nothing");
  });
  // Outside the transaction the wall is back.
  assert.equal((await listTemplates(world.users.dave)).some((r) => r.template_id === publishedFork), false);
});

test("I-M7 · ck_coa_templates_scope_firm: dropping it lets a platform row carry a firm_id", async (t) => {
  if (unready(t)) return;
  const bad = (c) =>
    c.query(
      `insert into clara.coa_templates(scope, firm_id, template_key, version, title, framework_hint, basis, state)
       values ('platform', $1, 'm7_bad', 1, 'M7', 'MPERS', 'b', 'draft')`,
      [world.firms.A],
    );
  await withRolledBackTx(async (c) => {
    assert.equal(await raisedCode(() => bad(c)), PG.checkViolation, "control: the paired CHECK is not refusing");
    await c.query("rollback");
    await c.query("begin");
    await c.query("alter table clara.coa_templates drop constraint ck_coa_templates_scope_firm");
    assert.equal(await raisedCode(() => bad(c)), null, "MUTANT: with the CHECK dropped the row must be ACCEPTED");
  });
});

test("I-M8 · uq_coa_adoption_live: dropping it lets one client carry two adopted adoptions", async (t) => {
  if (unready(t)) return;
  const adopt = (c) =>
    c.query(
      `insert into clara.coa_template_adoptions(firm_id, client_id, template_id, template_version,
         state, families, adopted_by, adopted_at)
       values ($1, $2, $3, 1, 'adopted', array['revenue']::text[], $4, now())`,
      [world.firms.A, world.clients.A1, platform.id, world.users.alice],
    );
  await withRolledBackTx(async (c) => {
    await adopt(c); // the first is lawful
    assert.equal(await raisedCode(() => adopt(c)), PG.uniqueViolation, "control: the partial unique is not refusing");
    await c.query("rollback");
    await c.query("begin");
    await c.query("drop index clara.uq_coa_adoption_live");
    await adopt(c);
    assert.equal(await raisedCode(() => adopt(c)), null, "MUTANT: with the index dropped the second adoption must be ACCEPTED");
  });
  const left = await rootQuery("select count(*)::int n from clara.coa_template_adoptions");
  assert.equal(left.rows[0].n, 0, "the mutant left adoption rows behind");
});

test("I-M9 · ck_coa_templates_authorship: dropping it lets a platform template name a human author", async (t) => {
  if (unready(t)) return;
  const bad = (c) =>
    c.query(
      `insert into clara.coa_templates(scope, firm_id, template_key, version, title, framework_hint, basis, state, created_by)
       values ('platform', null, 'm9_bad', 1, 'M9', 'MPERS', 'b', 'draft', $1)`,
      [world.users.alice],
    );
  await withRolledBackTx(async (c) => {
    assert.equal(await raisedCode(() => bad(c)), PG.checkViolation, "control: the Q1/Q3 authorship wall is not refusing");
    await c.query("rollback");
    await c.query("begin");
    await c.query("alter table clara.coa_templates drop constraint ck_coa_templates_authorship");
    assert.equal(await raisedCode(() => bad(c)), null, "MUTANT: with the CHECK dropped the row must be ACCEPTED");
  });
});

test("I-M10 · the vocabulary really is the LIVE client_fact_keys row, not a list in the door's body", async (t) => {
  if (unready(t)) return;
  await withRolledBackTx(async (c) => {
    const asAlice = async () => {
      await c.query("set local role clara_authenticated");
      await c.query("select set_config('request.jwt.claims', $1, true)", [
        JSON.stringify({ sub: world.users.alice, role: "authenticated" }),
      ]);
    };
    const call = (opKey) =>
      c.query(
        `select clara.upsert_coa_template_family(p_template => $1::uuid, p_family_key => 'm10_probe',
           p_label => 'M10', p_inclusion => 'opt_in', p_basis => 'firm practice', p_sort_ordinal => 995,
           p_msic_sections => '{}'::text[], p_msic_divisions => '{}'::text[], p_msic_edition => null,
           p_trade_natures => array['barter']::text[], p_entity_types => '{}'::text[],
           p_op_key => $2::text)`,
        [draft, opKey],
      );
    await asAlice();
    assert.equal(await refusalReason(() => call(opk("m10a"))), "unknown_trade_nature",
      "control: 'barter' must be refused while the live vocabulary does not carry it");
    await c.query("rollback");
    await c.query("begin");
    await c.query("reset role");
    // MUTATE THE GUARD'S INPUT, not the guard (review law 3 -- spelling is not identity: prove
    // the door reads the catalog it CLAIMS to read). clara.client_fact_keys is append-only, so
    // the trigger comes off first as scaffolding; both changes die with the rollback.
    await c.query("drop trigger t_client_fact_keys_append_only on clara.client_fact_keys");
    await c.query(
      `update clara.client_fact_keys set allowed_values = allowed_values || '["barter"]'::jsonb
        where fact_key = 'trade_nature'`,
    );
    await asAlice();
    assert.equal(await raisedCode(() => call(opk("m10b"))), null,
      "MUTANT: once the LIVE vocabulary admits 'barter' the door must accept it -- if it still refuses, it is reading a hard-coded list, not the catalog");
  });
  const back = await rootQuery(
    "select jsonb_array_length(allowed_values) n from clara.client_fact_keys where fact_key='trade_nature'",
  );
  assert.equal(back.rows[0].n, 3, "the mutant leaked out of its transaction");
});

test("I-M11 · ck_coa_tmpl_add_back_class: dropping it lets an unlisted add-back leaf into the table", async (t) => {
  if (unready(t)) return;
  const bad = (c) =>
    c.query(
      `insert into clara.coa_template_accounts(template_id, family_key, account_code, name,
         account_type, sort_ordinal, tax_sensitive, add_back_class)
       values ($1, 'rig_extra', '7999', 'M11', 'expense', 999, true, 'ADDBACK_ENTERTAINMENT')`,
      [draft],
    );
  await withRolledBackTx(async (c) => {
    assert.equal(await raisedCode(() => bad(c)), PG.checkViolation,
      "control: the extend-only closed set is not refusing an unlisted leaf");
    await c.query("rollback");
    await c.query("begin");
    await c.query("alter table clara.coa_template_accounts drop constraint ck_coa_tmpl_add_back_class");
    assert.equal(await raisedCode(() => bad(c)), null, "MUTANT: with the CHECK dropped the unlisted leaf must be ACCEPTED");
  });
  // And the CHECK's positive direction, outside the mutant: a listed leaf goes in.
  await withRolledBackTx(async (c) => {
    const okRow = await c.query(
      `insert into clara.coa_template_accounts(template_id, family_key, account_code, name,
         account_type, sort_ordinal, tax_sensitive, add_back_class)
       values ($1, 'rig_extra', '7998', 'M11 ok', 'expense', 998, true, 'entertainment') returning 1 as ok`,
      [draft],
    );
    assert.equal(okRow.rows[0].ok, 1, "a LISTED leaf must be admitted -- a set that admits nothing is not extend-only");
  });
});
