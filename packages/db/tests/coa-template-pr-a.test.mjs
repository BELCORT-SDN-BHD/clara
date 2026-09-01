// 裁-21 PR-a -- the firm-level standard chart of accounts, the TEMPLATE half.
//
// Design of record: docs/plan/active/coa-template-design.md (D-1, D-2, D-13) ·
// docs/plan/active/coa-template-annexes.md Annex C (the battery), Annex F (the DDL) ·
// docs/plan/active/coa-template-gate-record.md (CLOSED, all twelve RULED 裁-23).
// Migration: packages/db/migrations/0150_coa_template_pr_a.sql (the number claimed at merge prep).
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
import { COA_TEMPLATE_PR_A_SIGS, coaTemplateSigFailures } from "./rig-meta.mjs";
import {
  forkTemplate, upsertFamily, removeFamily, upsertTemplateAccount, removeTemplateAccount,
  publishTemplate, retireTemplate, listTemplates, getTemplate,
  humanFamilyCodes, humanAccountCodes,
  platformTemplate, rawTemplate, snapshotTemplate, templateCounts,
  withRolledBackTx, raisedCode, refusalReason,
  waitBlockedByOrThrow, openHumanTxn, openHumanAutocommit, releaseSession,
  templateMap, mergedResearch,
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

test("C2 · the seed's structural invariants -- 42 families / 142 accounts, by inclusion, by code form", async (t) => {
  if (unready(t)) return;
  const counts = await templateCounts(platform.id);
  assert.equal(counts.families, 42, "40 merged research + 1 provisional equity + 1 review-added taxation");
  assert.equal(counts.accounts, 142);

  const byIncl = await rootQuery(
    "select inclusion, count(*)::int n from clara.coa_template_families where template_id=$1 group by 1 order by 1",
    [platform.id],
  );
  assert.deepEqual(
    Object.fromEntries(byIncl.rows.map((r) => [r.inclusion, r.n])),
    { by_industry: 6, core: 20, opt_in: 16 },
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
      // The EQUITY sections...
      equity_company: ["sdn_bhd", "bhd"],
      equity_cooperative: ["cooperative"],
      equity_other: ["other"],
      equity_partnership: ["partnership", "llp"],
      equity_society: ["society"],
      equity_sole_prop: ["sole_prop"],
      // ...and the two families that are entity-keyed WITHOUT being equity sections. They are
      // listed here on purpose: the coverage rule in J2 has to exclude them by PROPERTY, and a
      // map that hid them would make that exclusion look like an accident.
      director_and_related_party_balances: ["sdn_bhd", "bhd"],
      private_and_proprietor_expenses: ["sole_prop", "partnership"],
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

  // The boundary: PR-a mints no tax_* relation. Proved by ABSENCE only until F-T3 PR-1 lands --
  // that file mints the tax-law relations BY DESIGN (0152_f_t3_pr_1_tax_platform), so this floor
  // is trued IN THE SAME PR per .claude/rules/db-tests.md's succession pattern: branch on the
  // migration STEM witness, and on the post-arm assert the tax_* set is EXACTLY F-T3's own five
  // (any other tax_* relation is still a PR-a boundary breach). The FK assertion below is the half
  // of the boundary that survives either way: coa_template_accounts never grows a foreign key
  // into a tax table.
  const taxRel = await rootQuery(
    `select coalesce(string_agg(c.relname, ', ' order by c.relname), '<none>') bad from pg_class c
       join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='clara' and c.relkind in ('r','v','m') and c.relname like 'tax\\_%'`,
  );
  const ft3 = await rootQuery(
    "select 1 from clara.schema_migrations where version ~ '_f_t3_pr_1_tax_platform$'",
  );
  if (ft3.rows.length === 0) {
    assert.equal(taxRel.rows[0].bad, "<none>", "PR-a must mint no tax_* relation");
  } else {
    assert.equal(
      taxRel.rows[0].bad,
      "tax_add_back_class_map, tax_authorities, tax_rate_bands, tax_thresholds, tax_treatment_codes",
      "with F-T3 PR-1 applied the tax_* relations must be EXACTLY its five -- PR-a still mints none",
    );
  }
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
    assert.equal(fam.length, 42, `${who} cannot read the platform starter's families`);
    const acc = await humanAccountCodes(sub, platform.id);
    assert.equal(acc.length, 142, `${who} cannot read the platform starter's accounts`);
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
  assert.equal((await humanFamilyCodes(world.users.alice, publishedFork)).length, 42);
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
  assert.equal(out.families, 42);
  assert.equal(out.accounts, 142);
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
  assert.equal(out.families, 42);
  assert.equal(out.accounts, 142);
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
  assert.equal(doc.families.length, 42);
  assert.equal(doc.accounts.length, 142);
  assert.equal(doc.content_sha256, platform.content_sha256.toString("hex"));
  const listed = (await listTemplates(world.users.alice)).find((r) => r.template_id === platform.id);
  assert.equal(listed.families, 42);
  assert.equal(listed.accounts, 142);
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
  const left = await rootQuery(
    "select count(*)::int n from clara.coa_template_adoptions where client_id = $1",
    [world.clients.A1],
  );
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

// =============================================================================================
// J -- THE REVIEW FOLD (Codex law-28 pass + the native pass, 2026-08-29). Every cell here was
// RED before its fix and is GREEN after; the ones that are two-session prove the interleave
// with waitBlockedByOrThrow rather than a sleep (db-tests.md).
// =============================================================================================

test("J1 · HIGH-1 the publish/edit RACE, EDITOR FIRST: publish blocks, then hashes the editor's row", async (t) => {
  if (unready(t)) return;
  const f = await forkTemplate(world.users.alice, {
    source: platform.id, key: nextKey("j1a"), title: "J1a", basis: "b", opKey: opk("fork"),
  });
  let t1 = null, t2 = null;
  try {
    // T1 -- an editor, INSIDE an open transaction: _coa_template_for_edit takes the header
    // FOR UPDATE, then the child insert lands. Uncommitted.
    t1 = await openHumanTxn(world.users.alice);
    await t1.client.query(
      `select clara.upsert_coa_template_family(p_template => $1::uuid, p_family_key => 'race_late',
         p_label => 'Race Late', p_inclusion => 'opt_in', p_basis => 'firm practice',
         p_sort_ordinal => 950, p_msic_sections => '{}'::text[], p_msic_divisions => '{}'::text[],
         p_msic_edition => null, p_trade_natures => '{}'::text[], p_entity_types => '{}'::text[],
         p_op_key => $2::text)`,
      [f.template_id, opk("j1a_fam")],
    );
    await t1.client.query(
      `select clara.upsert_coa_template_account(p_template => $1::uuid, p_family_key => 'race_late',
         p_account_code => '7500', p_name => 'Race Late Account', p_account_type => 'expense',
         p_account_class => null, p_special_acc_type => null, p_sort_ordinal => 10,
         p_tax_sensitive => false, p_add_back_class => null, p_statutory => null,
         p_op_key => $2::text)`,
      [f.template_id, opk("j1a_acc")],
    );

    // T2 -- a publisher on ANOTHER connection, fired inside T1's open window.
    t2 = await openHumanAutocommit(world.users.alice);
    const pub = t2.client
      .query("select clara.publish_coa_template(p_template => $1::uuid, p_op_key => $2::text) as r",
        [f.template_id, opk("j1a_pub")])
      .then((r) => ({ ok: true, r }), (e) => ({ ok: false, e }));

    // THE INTERLEAVE, PROVEN: without the FOR UPDATE this publish sails past and stamps a hash
    // over content the editor is still adding.
    await waitBlockedByOrThrow(t2.pid, t1.pid);
    await t1.client.query("commit");
    const out = await pub;
    assert.equal(out.ok, true, `publish must succeed once the editor commits: ${out.e?.message}`);

    // The published content INCLUDES the editor's row, and the stored hash reproduces from the
    // rows as they now stand -- the invariant the race broke.
    const row = await rawTemplate(f.template_id);
    assert.equal(row.state, "published");
    const check = await rootQuery(
      `select clara._coa_template_content_sha256($1) = content_sha256 as ok,
              (select count(*)::int from clara.coa_template_accounts
                where template_id = $1 and account_code = '7500') as late
         from clara.coa_templates where id = $1`,
      [f.template_id],
    );
    assert.equal(check.rows[0].ok, true, "the stored content_sha256 does not reproduce from the published rows");
    assert.equal(check.rows[0].late, 1, "the editor's row is missing from the template it was published into");
  } finally {
    await releaseSession(t1);
    await releaseSession(t2);
  }
});

test("J1b · HIGH-1 the RACE, PUBLISHER FIRST: the editor blocks, then refuses by name", async (t) => {
  if (unready(t)) return;
  const f = await forkTemplate(world.users.alice, {
    source: platform.id, key: nextKey("j1b"), title: "J1b", basis: "b", opKey: opk("fork"),
  });
  let t1 = null, t2 = null;
  try {
    t1 = await openHumanTxn(world.users.alice);
    await t1.client.query(
      "select clara.publish_coa_template(p_template => $1::uuid, p_op_key => $2::text)",
      [f.template_id, opk("j1b_pub")],
    );
    t2 = await openHumanAutocommit(world.users.alice);
    const edit = t2.client
      .query(
        `select clara.upsert_coa_template_family(p_template => $1::uuid, p_family_key => 'race_hollow',
           p_label => 'Race Hollow', p_inclusion => 'opt_in', p_basis => 'firm practice',
           p_sort_ordinal => 951, p_msic_sections => '{}'::text[], p_msic_divisions => '{}'::text[],
           p_msic_edition => null, p_trade_natures => '{}'::text[], p_entity_types => '{}'::text[],
           p_op_key => $2::text)`,
        [f.template_id, opk("j1b_fam")],
      )
      .then(() => ({ ok: true }), (e) => ({ ok: false, e }));

    await waitBlockedByOrThrow(t2.pid, t1.pid);
    await t1.client.query("commit");
    const out = await edit;

    // THE DEFECT THIS CELL EXISTS FOR: unlocked, this editor committed a zero-account family
    // into an ALREADY PUBLISHED template -- defeating publish's own empty_family rung and
    // leaving rows that no longer hash to the stored content_sha256.
    assert.equal(out.ok, false, "an editor must NOT be able to write into a template that was published under it");
    assert.equal(out.e.code, CLR.badRequest);
    assert.equal(JSON.parse(out.e.detail).reason, "template_not_draft");
    const check = await rootQuery(
      `select clara._coa_template_content_sha256($1) = content_sha256 as ok,
              (select count(*)::int from clara.coa_template_families
                where template_id = $1 and family_key = 'race_hollow') as hollow
         from clara.coa_templates where id = $1`,
      [f.template_id],
    );
    assert.equal(check.rows[0].hollow, 0, "a zero-account family landed in a PUBLISHED template");
    assert.equal(check.rows[0].ok, true, "the published template's rows no longer reproduce its own hash");
  } finally {
    await releaseSession(t1);
    await releaseSession(t2);
  }
});

test("J2 · HIGH-2 EVERY live entity_type value has exactly one equity family (coverage, not containment)", async (t) => {
  if (unready(t)) return;
  const cov = await rootQuery(
    `select v.value as ev,
            (select count(*)::int from clara.coa_template_families f
              where f.template_id = $1 and f.entity_types @> array[v.value]
                and exists (select 1 from clara.coa_template_accounts a
                             where a.template_id = $1 and a.family_key = f.family_key
                               and a.account_type = 'equity')) as n
       from clara.client_fact_keys k, lateral jsonb_array_elements_text(k.allowed_values) as v(value)
      where k.fact_key = 'entity_type' order by v.value`,
    [platform.id],
  );
  assert.equal(cov.rows.length, 8, "the live ENTITY_TYPES_V2 vocabulary should carry eight values");
  const bad = cov.rows.filter((r) => r.n !== 1).map((r) => `${r.ev}=${r.n}`);
  assert.deepEqual(bad, [], "an entity_type the product ADMITS has no equity family (or has two)");

  // The ONE remaining provisional variant says so IN THE ROW -- a reader of the DATA, not just
  // of the migration, has to be able to see that an owner review is owed. society and
  // cooperative are no longer provisional: the addendum researched both, so this lane's earlier
  // equity_society_cooperative placeholder is SUPERSEDED and must be gone.
  const prov = await rootQuery(
    "select family_key, basis from clara.coa_template_families where template_id=$1 and basis like '%provisional%' order by family_key",
    [platform.id],
  );
  assert.deepEqual(prov.rows.map((r) => r.family_key), ["equity_other"],
    "exactly one family should still be provisional -- society and cooperative are researched now");
  // D-13 item 1's escape hatch, IN AS MANY WORDS: this is the only family that can cite no
  // instrument, so "firm practice" is what its basis must say -- not a bare "not researched",
  // which names neither an authority nor the convention standing in for one.
  assert.match(prov.rows[0].basis, /^firm practice - provisional, owner review owed\./,
    "the one instrument-less family must take D-13's stated escape hatch, not invent a third shape");
  const superseded = await rootQuery(
    "select count(*)::int n from clara.coa_template_families where template_id=$1 and family_key='equity_society_cooperative'",
    [platform.id],
  );
  assert.equal(superseded.rows[0].n, 0, "the superseded placeholder is still shipped");

  // THE SOCIETY LABEL COLLISION, recorded as PR-b's job (conductor ruling): a society gets BOTH
  // the core 3900 Retained Earnings and its own 3040 Accumulated Fund. PR-a ships both exactly
  // as the research does; this cell pins that state so PR-b's relabel has something to change,
  // and so nobody "fixes" it here by keying the core family.
  const collision = await rootQuery(
    `select (select inclusion from clara.coa_template_families where template_id=$1 and family_key='equity_common') as re_family,
            (select entity_types from clara.coa_template_families where template_id=$1 and family_key='equity_common') as re_keys,
            (select count(*)::int from clara.coa_template_accounts where template_id=$1 and account_code in ('3900','3040')) as both`,
    [platform.id],
  );
  assert.equal(collision.rows[0].re_family, "core", "equity_common must stay core -- it applies to every client");
  assert.deepEqual(collision.rows[0].re_keys, [], "a core family may never carry entity_type trim keys");
  assert.equal(collision.rows[0].both, 2, "a society must receive BOTH 3900 and 3040 -- PR-b relabels at apply time");
});

test("J2m · MUTANT M12: widening the LIVE entity_type enum makes the coverage cell go RED", async (t) => {
  if (unready(t)) return;
  await withRolledBackTx(async (c) => {
    const uncovered = async () => {
      const r = await c.query(
        `select count(*)::int as n from (
           select v.value as ev,
                  (select count(*)::int from clara.coa_template_families f
                    where f.template_id = $1 and f.entity_types @> array[v.value]
                      and exists (select 1 from clara.coa_template_accounts a
                                   where a.template_id = $1 and a.family_key = f.family_key
                                     and a.account_type = 'equity')) as n
             from clara.client_fact_keys k, lateral jsonb_array_elements_text(k.allowed_values) as v(value)
            where k.fact_key = 'entity_type') z where z.n <> 1`,
        [platform.id],
      );
      return r.rows[0].n;
    };
    assert.equal(await uncovered(), 0, "control: coverage is already broken before the mutation");
    // client_fact_keys is append-only, so the trigger comes off as scaffolding; both die with
    // the rollback. MUTATING THE GUARD'S INPUT is the point: a ninth entity type must red this.
    await c.query("drop trigger t_client_fact_keys_append_only on clara.client_fact_keys");
    await c.query(
      `update clara.client_fact_keys set allowed_values = allowed_values || '["trust"]'::jsonb
        where fact_key = 'entity_type'`,
    );
    assert.equal(await uncovered(), 1,
      "MUTANT: a ninth entity_type with no equity family must be REPORTED -- otherwise the cell proves containment, not coverage");
  });
  const back = await rootQuery(
    "select jsonb_array_length(allowed_values) n from clara.client_fact_keys where fact_key='entity_type'",
  );
  assert.equal(back.rows[0].n, 8, "the mutant leaked out of its transaction");
});

test("J3 · HIGH-3 no durable basis/hint field carries a numeral-bearing tax assertion (constraint 2)", async (t) => {
  if (unready(t)) return;
  const offenders = await rootQuery(
    `select where_, txt from (
       select 'coa_templates.basis' as where_, basis as txt from clara.coa_templates where id = $1
       union all select 'family ' || family_key, basis from clara.coa_template_families where template_id = $1
       union all select 'account ' || account_code, name from clara.coa_template_accounts where template_id = $1
       union all select 'account ' || account_code || '.add_back_class', add_back_class
                   from clara.coa_template_accounts where template_id = $1 and add_back_class is not null
       union all select 'account ' || account_code || '.statutory', statutory
                   from clara.coa_template_accounts where template_id = $1 and statutory is not null
     ) t
      where t.txt like '%\\%%' or t.txt ~* '\\m(rm|myr)\\s?[0-9]' or t.txt ~ '[0-9]{1,3}(,[0-9]{3})+'`,
    [platform.id],
  );
  assert.deepEqual(offenders.rows.map((r) => `${r.where_}: ${r.txt}`), [],
    "a rate, a ceiling or a cap in a durable basis row is a model-authored number with no effective-dated authority");
  // POSITIVE CONTROL (review law 2): the census must still be reading fields that DO carry
  // citations, or an empty result proves nothing.
  const cited = await rootQuery(
    "select count(*)::int n from clara.coa_template_families where template_id=$1 and basis ~ '(ITA 1967|MPERS|PR [0-9]+/[0-9]{4})'",
    [platform.id],
  );
  assert.ok(cited.rows[0].n >= 20, `only ${cited.rows[0].n} basis rows carry a citation -- the census is reading the wrong field`);
  // And the citations SURVIVED the strip: the four rows the fold rewrote still name their
  // instrument. Stripping a numeral must not strip the authority with it.
  const kept = await rootQuery(
    `select family_key, basis from clara.coa_template_families
      where template_id=$1 and family_key in
        ('entertainment','donations_approved','motor_running_costs','club_subscriptions_and_entrance_fees')
      order by family_key`,
    [platform.id],
  );
  assert.equal(kept.rows.length, 4);
  for (const r of kept.rows) assert.match(r.basis, /ITA 1967 s\.|ITA 1967 Schedule/, `${r.family_key} lost its citation`);
});

test("J3m · MUTANT: the numeral census can say NO -- a planted rate is caught", async (t) => {
  if (unready(t)) return;
  await withRolledBackTx(async (c) => {
    const offenders = async () => {
      const r = await c.query(
        `select count(*)::int n from clara.coa_template_families
          where template_id = $1 and (basis like '%\\%%' or basis ~* '\\m(rm|myr)\\s?[0-9]'
             or basis ~ '[0-9]{1,3}(,[0-9]{3})+')`,
        [draft],
      );
      return r.rows[0].n;
    };
    assert.equal(await offenders(), 0, "control: the draft already carries a numeral-bearing basis");
    await c.query(
      `update clara.coa_template_families set basis = basis || ' (50% restriction; cap RM50,000)'
        where template_id = $1 and family_key = 'entertainment'`,
      [draft],
    );
    assert.equal(await offenders(), 1,
      "MUTANT: a planted rate and a planted ringgit cap must both be caught -- a census that cannot fire is not a census");
  });
});

test("J4 · MED-1 the shipped rows reproduce BOTH COMMITTED dossiers, merged, field by field", async (t) => {
  if (unready(t)) return;
  const { families: mf, accounts: ma, noops, base, add } = mergedResearch();
  const j = { families: [...mf.values()], accounts: [...ma.values()] };
  const map = await templateMap(platform.id);
  // The merge itself, pinned: the addendum is additive and its ONE account overlap is its own
  // declared no-op. A silent re-ship that CHANGED a field would be a content change wearing an
  // additive label.
  assert.equal(base.families.length, 31);
  assert.equal(base.accounts.length, 100);
  assert.equal(add.families.length, 16);
  assert.equal(add.accounts.length, 41);
  assert.deepEqual(noops, ["6460"], "the addendum's only account overlap must be its declared no-op");
  const reship = add.accounts.find((a) => a.account_code === "6460");
  const original = base.accounts.find((a) => a.account_code === "6460");
  for (const k of ["name", "account_type", "account_class", "special_acc_type", "family_key",
    "sort_ordinal", "tax_sensitive", "add_back_class", "statutory"]) {
    assert.equal(reship[k] ?? null, original[k] ?? null, `6460.${k} changed under a "no-op" re-ship`);
  }
  assert.equal(mf.size, 40, "the two dossiers merge to 40 families");
  assert.equal(ma.size, 140, "the two dossiers merge to 140 accounts");
  // Q8's reclassification, read off the MERGED expectation rather than asserted from prose.
  const reclassified = ["entertainment", "donations_approved", "donations_unapproved",
    "fines_and_penalties", "depreciation_and_amortisation", "doubtful_debts_and_provisions"];
  for (const k of reclassified) {
    assert.equal(base.families.find((f) => f.family_key === k).inclusion, "opt_in", `${k} was opt_in before`);
    assert.equal(mf.get(k).inclusion, "core", `${k} must be core after the addendum`);
    assert.deepEqual(map.families[k].entity_types, [], `${k} is core and must therefore be unkeyed`);
  }
  for (const k of ["leave_passage", "motor_running_costs", "club_subscriptions_and_entrance_fees"]) {
    assert.equal(mf.get(k).inclusion, "opt_in", `${k} stays opt_in per the addendum's own SS2`);
  }
  assert.deepEqual(mf.get("private_and_proprietor_expenses").entity_types, ["sole_prop", "partnership"]);
  // The four basis rows the constraint-2 fold rewrote: compared by RULE, not by equality, and
  // named here so the divergence is deliberate and visible rather than a silent exemption.
  const STRIPPED = new Set([
    "entertainment", "donations_approved", "motor_running_costs", "club_subscriptions_and_entrance_fees",
  ]);
  const PROVISIONAL = new Set(["equity_other", "taxation"]);

  for (const f of j.families) {
    const row = map.families[f.family_key];
    assert.ok(row, `family ${f.family_key} is in the dossier and not in the DB`);
    assert.equal(row.label, f.label, `${f.family_key}.label`);
    assert.equal(row.inclusion, f.inclusion, `${f.family_key}.inclusion`);
    assert.equal(row.sort_ordinal, f.sort_ordinal, `${f.family_key}.sort_ordinal`);
    assert.deepEqual(row.msic_sections, f.msic_sections, `${f.family_key}.msic_sections`);
    assert.deepEqual(row.msic_divisions, f.msic_divisions, `${f.family_key}.msic_divisions`);
    assert.deepEqual(row.trade_natures, f.trade_natures, `${f.family_key}.trade_natures`);
    assert.deepEqual(row.entity_types, f.entity_types, `${f.family_key}.entity_types`);
    // Q12's stamp is DERIVED, not carried by the dossier: present exactly where a code is.
    const keyed = f.msic_sections.length > 0 || f.msic_divisions.length > 0;
    assert.equal(row.msic_edition, keyed ? "MSIC 2008" : null, `${f.family_key}.msic_edition`);
    if (STRIPPED.has(f.family_key)) {
      assert.notEqual(row.basis, f.basis, `${f.family_key}: the fold was supposed to rewrite this basis`);
      assert.ok(/%|RM ?[0-9]/.test(f.basis), `${f.family_key}: the dossier's own basis should be the numeral-bearing one`);
      assert.ok(!/%|RM ?[0-9]/.test(row.basis), `${f.family_key}: the shipped basis still carries a numeral`);
    } else {
      assert.equal(row.basis, f.basis, `${f.family_key}.basis`);
    }
  }
  for (const a of j.accounts) {
    const row = map.accounts[a.account_code];
    assert.ok(row, `account ${a.account_code} is in the dossier and not in the DB`);
    assert.equal(row.family_key, a.family_key, `${a.account_code}.family_key`);
    assert.equal(row.name, a.name, `${a.account_code}.name`);
    assert.equal(row.account_type, a.account_type, `${a.account_code}.account_type`);
    assert.equal(row.account_class, a.account_class, `${a.account_code}.account_class`);
    assert.equal(row.special_acc_type, a.special_acc_type, `${a.account_code}.special_acc_type`);
    assert.equal(row.sort_ordinal, a.sort_ordinal, `${a.account_code}.sort_ordinal`);
    assert.equal(row.tax_sensitive, Boolean(a.tax_sensitive), `${a.account_code}.tax_sensitive`);
    assert.equal(row.add_back_class, a.add_back_class ?? null, `${a.account_code}.add_back_class`);
    assert.equal(row.statutory, a.statutory ?? null, `${a.account_code}.statutory`);
  }
  // The other direction: the ONLY rows the DB carries beyond the dossier are the ruled-in
  // provisional variants. A silent extra family is exactly what a count check would miss.
  const extraFam = Object.keys(map.families).filter((k) => !j.families.some((f) => f.family_key === k));
  assert.deepEqual(extraFam.sort(), [...PROVISIONAL].sort(), "unexplained extra families in the shipped seed");
  const extraAcc = Object.keys(map.accounts).filter((k) => !j.accounts.some((a) => a.account_code === k));
  assert.deepEqual(extraAcc.sort(), ["3050", "6900"], "unexplained extra accounts in the shipped seed");
  // The two non-dossier rows are pinned by FIELD, not only by key (independent review LOW nit,
  // merge prep 2026-08-30): retyping 6900 from expense to income -- a P&L face item (MPERS 5.5)
  // -- would otherwise pass every count and key check above.
  assert.deepEqual(
    [map.accounts["6900"].account_type, map.accounts["6900"].family_key, map.families["taxation"].inclusion],
    ["expense", "taxation", "core"],
    "6900 Income Tax Expense must stay an expense in the core taxation family",
  );
  assert.deepEqual(
    [map.accounts["3050"].account_type, map.accounts["3050"].family_key, map.families["equity_other"].inclusion],
    ["equity", "equity_other", "opt_in"],
    "3050 must stay an equity account in the opt-in provisional equity_other family",
  );
});

test("J4b · CONSTRAINT 2 over the merged set: the addendum introduced no numeral into a column", async (t) => {
  if (unready(t)) return;
  const { families: mf, accounts: ma } = mergedResearch();
  const NUM = (s) => typeof s === "string" && (/%/.test(s) || /\b(RM|MYR)\s?[0-9]/i.test(s) || /[0-9]{1,3}(,[0-9]{3})+/.test(s));
  // The DOSSIERS may carry numerals in prose the migration then strips -- what must be true is
  // that every numeral-bearing field is one of the four this lane strips BY NAME. A fifth would
  // ship a rate into a durable column, which is exactly the finding this cell descends from.
  const numeric = [...mf.values()].filter((f) => NUM(f.basis)).map((f) => f.family_key).sort();
  assert.deepEqual(numeric,
    ["club_subscriptions_and_entrance_fees", "donations_approved", "entertainment", "motor_running_costs"],
    "a dossier family basis carries a numeral that this lane does not strip by name");
  for (const a of ma.values()) {
    assert.equal(NUM(a.name), false, `account ${a.account_code}: a numeral in the shipped NAME column`);
    assert.equal(NUM(a.add_back_class) || NUM(a.statutory), false, `account ${a.account_code}: a numeral in a hint column`);
  }
});

test("J5 · MED-2 an adoption cannot name a false version, or another firm's private template", async (t) => {
  if (unready(t)) return;
  const ins = (c, template, version, firm) =>
    c.query(
      `insert into clara.coa_template_adoptions(firm_id, client_id, template_id, template_version,
         state, families, adopted_by, adopted_at)
       values ($1, $2, $3, $4, 'adopted', array['revenue']::text[], $5, now())`,
      [firm, world.clients.A1, template, version, world.users.alice],
    );
  await withRolledBackTx(async (c) => {
    // (a) the lawful shape -- the positive control the two refusals below are measured against.
    await ins(c, platform.id, 1, world.firms.A);
    await c.query("rollback"); await c.query("begin");
    // (b) a version the template never had.
    assert.equal(await raisedCode(() => ins(c, platform.id, 99, world.firms.A)), PG.foreignKeyViolation,
      "an adoption naming version 99 of a template that only has version 1 must be refused by the COMPOSITE fk");
    await c.query("rollback"); await c.query("begin");
    // (c) firm A adopting firm B's PRIVATE template -- the FKs are all satisfied; only the
    //     congruence trigger stands between this and a cross-tenant reference in a durable row.
    const err = await refusalReason(() => ins(c, publishedFork, 1, world.firms.B));
    assert.equal(err, "template_not_in_firm",
      "a firm may adopt only the platform template or one of its own");
  });
});

test("J6 · the four adoption biconditionals: every illegal shape refuses, every lawful one admits", async (t) => {
  if (unready(t)) return;
  const cases = [
    // [label, extra columns, extra values, state override, must-refuse]
    ["an agent proposal with a basis but NO receipt", "proposed_by, proposed_at, basis",
      `$5::uuid, now(), '{}'::jsonb`, "proposed", true],
    ["an agent proposal with a receipt but NO basis", "proposed_by, proposed_at, receipt_id",
      `$5::uuid, now(), null`, "proposed", true],
    ["a DECLINED row naming an adopter", "adopted_by", `$5::uuid`, "declined", true],
    ["an adopter with no adopted_at", "adopted_by", `$5::uuid`, "adopted", true],
    ["[lawful] a human-direct adoption", "adopted_by, adopted_at", `$5::uuid, now()`, "adopted", false],
    ["[lawful] a plain declined row", "", "", "declined", false],
  ];
  await withRolledBackTx(async (c) => {
    for (const [label, cols, vals, state, mustRefuse] of cases) {
      await c.query("savepoint s");
      const sql =
        `insert into clara.coa_template_adoptions(firm_id, client_id, template_id, template_version,
           state, families${cols ? ", " + cols : ""})
         values ($1, $2, $3, 1, $4, array['revenue']::text[]${vals ? ", " + vals : ""})`;
      const params = vals.includes("$5")
        ? [world.firms.A, world.clients.A1, platform.id, state, world.users.alice]
        : [world.firms.A, world.clients.A1, platform.id, state];
      const code = await raisedCode(() => c.query(sql, params));
      if (mustRefuse) {
        assert.equal(code, PG.checkViolation, `${label}: must be REFUSED by a biconditional`);
      } else {
        assert.equal(code, null, `${label}: must still be admitted -- a wall that refuses everything proves nothing`);
      }
      await c.query("rollback to savepoint s");
    }
  });
});

test("J7 · MED-3 law 3: the doors are pinned by EXACT SIGNATURE, not by proname", async (t) => {
  if (unready(t)) return;
  assert.equal(COA_TEMPLATE_PR_A_SIGS.length, 14);
  assert.deepEqual(await coaTemplateSigFailures(), [],
    "every door and internal must resolve at its exact signature, with no second overload");
});

test("J7m · MUTANT M13: a mutated FOREIGN body makes the D1 whole-catalog differential FAIL", async (t) => {
  if (unready(t)) return;
  const snap = async (c) =>
    (await c.query(
      `select coalesce(md5(string_agg(encode(sha256(convert_to(p.prosrc,'UTF8')),'hex'), '' order by p.oid)), '') as h
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'clara'`,
    )).rows[0].h;
  await withRolledBackTx(async (c) => {
    const before = await snap(c);
    assert.notEqual(before, "", "control: the catalog snapshot is empty -- the instrument reads nothing");
    // A FOREIGN body -- nothing this PR authored. The migration's S8 differential compares
    // exactly this per-function prosrc sha; if a mutated foreign body does not move the
    // aggregate, the D1-EMPTY proof is measuring nothing.
    await c.query(
      "create or replace function clara.role_rank(p_role text) returns int language sql immutable as $$ select case p_role when 'viewer' then 0 when 'bookkeeper' then 1 when 'admin' then 2 when 'owner' then 3 else null end /* M13 */ $$",
    );
    assert.notEqual(await snap(c), before,
      "MUTANT: a changed FOREIGN function body must move the differential -- otherwise D1-EMPTY is a vacuous claim");
  });
  const restored = await rootQuery(
    "select position('M13' in prosrc) as m from pg_proc where oid = 'clara.role_rank(text)'::regprocedure",
  );
  assert.equal(Number(restored.rows[0].m), 0, "the mutant leaked out of its transaction");
});

test("J7m2 · MUTANT M14: a dropped signature plus a same-named WRONG overload makes the roster FAIL", async (t) => {
  if (unready(t)) return;
  // The roster logic, run on the MUTATED connection -- rig-meta's own helper uses its own
  // pooled client and could never see an uncommitted DDL change.
  const sigFailuresOn = async (c) => {
    const live = await c.query(
      "select s as sig, to_regprocedure(s) is not null as ok from unnest($1::text[]) s",
      [COA_TEMPLATE_PR_A_SIGS],
    );
    const missing = live.rows.filter((r) => !r.ok).map((r) => r.sig);
    const dupes = await c.query(
      `select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname='clara' and p.proname = any($1::text[])
        group by p.proname having count(*) > 1`,
      [COA_TEMPLATE_PR_A_SIGS.map((s) => s.replace(/^clara\./, "").replace(/\(.*$/, ""))],
    );
    return { missing, dupes: dupes.rows.map((r) => r.proname) };
  };
  await withRolledBackTx(async (c) => {
    const control = await sigFailuresOn(c);
    assert.deepEqual(control, { missing: [], dupes: [] }, "control: the roster is already broken before the mutation");
    // The law-3 shape exactly: the NAME survives, the callable identity does not.
    await c.query("drop function clara.get_coa_template(uuid)");
    await c.query("create function clara.get_coa_template(p_template text) returns jsonb language sql stable as $$ select '{}'::jsonb $$");
    const mutated = await sigFailuresOn(c);
    assert.deepEqual(mutated.missing, ["clara.get_coa_template(uuid)"],
      "MUTANT: the exact-signature roster must report the recut door -- a proname census would not");
    // And the proof that a proname census would NOT have caught it: the name is still there.
    const byName = await c.query(
      "select count(*)::int n from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='clara' and p.proname='get_coa_template'",
    );
    assert.equal(byName.rows[0].n, 1, "the proname is still present -- which is precisely why proname is not identity");
  });
  assert.deepEqual(await coaTemplateSigFailures(), [], "the mutant leaked out of its transaction");
});

test("J8 · LOW the fork allocator serialises: T2 blocks, then gets the NEXT version, never a 23505", async (t) => {
  if (unready(t)) return;
  const key = nextKey("j8");
  let t1 = null, t2 = null;
  try {
    t1 = await openHumanTxn(world.users.alice);
    const first = await t1.client.query(
      `select clara.fork_coa_template(p_source => $1::uuid, p_template_key => $2::text,
         p_title => 'J8 one', p_framework_hint => 'MPERS', p_basis => 'b', p_op_key => $3::text) as r`,
      [platform.id, key, opk("j8a")],
    );
    assert.equal(first.rows[0].r.version, 1);

    t2 = await openHumanAutocommit(world.users.alice);
    const second = t2.client
      .query(
        `select clara.fork_coa_template(p_source => $1::uuid, p_template_key => $2::text,
           p_title => 'J8 two', p_framework_hint => 'MPERS', p_basis => 'b', p_op_key => $3::text) as r`,
        [platform.id, key, opk("j8b")],
      )
      .then((r) => ({ ok: true, r }), (e) => ({ ok: false, e }));

    // Without pg_advisory_xact_lock both sessions read max(version)=0 and one loses to
    // uq_coa_templates_firm_version with a bare 23505 naming nothing.
    await waitBlockedByOrThrow(t2.pid, t1.pid);
    await t1.client.query("commit");
    const out = await second;
    assert.equal(out.ok, true, `the second fork must SUCCEED, not collide: ${out.e?.code} ${out.e?.message}`);
    assert.equal(out.r.rows[0].r.version, 2, "the second fork must receive the NEXT version");
  } finally {
    await releaseSession(t1);
    await releaseSession(t2);
  }
});
