// 裁-21 PR-b -- the firm-level standard chart of accounts, the APPLY half.
//
// Design of record: docs/plan/active/coa-template-design.md (D-3, D-4, D-8, D-10, D-11, D-12) ·
// docs/plan/active/coa-template-annexes.md Annex C (the battery), Annex D (the frontend homes),
// Annex E (the non-goals) · docs/plan/active/coa-template-gate-record.md (CLOSED, RULED 裁-23).
// Migration: packages/db/migrations/UNNUMBERED_coa_pr_b_apply_template.sql.
//
// JUDGEMENT LOGIC under review law 1: apply_coa_template's nine-rung ladder (rung 5 above all --
// it is 裁-23 Q4's ruling made mechanical), add_coa_template_family's two collision refusals,
// clara._coa_family_plan's fail-closed conjunction, and clara.coa_chart_state's six-state
// classifier. Every one is exercised THROUGH THE REAL DOOR and pinned by its typed CLR code AND
// its `detail.reason` name -- never by a substring match on source text (review law 3), never by
// an absence (review law 2).
//
// THE APPLIED SET IS COMPARED BY QUERY, NEVER BY LITERAL. `expectedChartMap` derives what should
// land from the live template rows and the live entity overrides. A hand-typed 76-code roster
// would re-encode the migration's own opinion and would stay green against a template that had
// silently changed underneath it.
//
// =============================================================================================
// THE MUTANT PANEL -- thirteen walls, each broken inside a rolled-back transaction so the shipping
// schema is never left mutated. A cell that cannot be made to fail is not a proof.
//
//  #  | wall                                  | mutation                                | what goes RED
// ----|---------------------------------------|-----------------------------------------|-------------------------------------------
//  M1 | rung 5 (chart_not_empty)              | replace the body without the rung       | a non-empty chart is ACCEPTED
//  M2 | rung 8 (core_family_dropped)          | replace the body without the rung       | a core family is dropped without refusal
//  M3 | the entity override ROW               | delete the society/3900 relabel          | the society chart plants "Retained Earnings"
//  M4 | the entity override SUPPRESSION       | delete the society/3040 suppression      | the society chart plants 3040 as well
//  M5 | the plan's AND across axes            | replace the conjunction with an OR      | an unmatched msic family is proposed anyway
//  M6 | the ACL (no agent path to the apply)  | GRANT the door to clara_wake_interactive| the wake role gets past 42501
//  M7 | coa_chart_state's legacy vocabulary   | drop 'lhdn_mpers_standard' from the read| a legacy-answer client reads `undecided`
//  M8 | the effective-name indirection        | make the name read ignore entity_type   | the society's own drift read cries `renamed`
//  M9 | section-only human opt-in              | restore the section trim-key disjunct   | a no-MSIC client auto-keeps the family
// M10 | NULL family input                      | remove the named guard + NULL filter    | malformed input misses `family_key_null`
// M11 | plan/list request identity             | restore the NULL/[] hash collision      | an explicit empty list replays a plan success
// M12 | refusal ledger instrument              | write all five ledgers, then fake refusal| the clean-refusal assertion itself goes RED
// M13 | manual + built chart precedence        | restore the old CASE arm order          | the ruled off-standard client reads declined
//
// M3/M4 are the law-2 pair on this file's one scope judgement: they prove the society relabel and
// the suppression are produced by the SEEDED ROWS and not by anything hard-coded in a body.
// M8 is the instrument-agreement cell: it proves the drift read and the apply share one spelling
// of "what is this account called", so a relabelled chart can never report itself drifted.
// =============================================================================================
//
// Serial discipline: --test-concurrency=1 (shared rig convention).

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { CLR, PG, opk, rootQuery, ensureReady, buildWorld, endPool, humanQuery, roleQuery, ROLES } from "./rig-fixtures.mjs";
import { COA_TEMPLATE_PR_B_SIGS, coaTemplatePrbSigFailures } from "./rig-meta.mjs";
import {
  applyTemplate, addFamily, familyPlan, chartState, adoptionRead, drift, firmDrift,
  newInterviewClient, recordFact, forceAdoptionRow, forceProposedRow, forgeAdoptedFamilies,
  platformStarter, clientChartMap, expectedChartMap, coreFamilies, accountCount,
  eventCount, auditCount, rawAdoption,
  refusalLedgerCounts, withRolledBackTx, asHumanOn, raisedCode,
} from "./coa-template-pr-b-helpers.mjs";
import {
  forkTemplate, upsertFamily, upsertTemplateAccount, publishTemplate,
  waitBlockedByOrThrow, openHumanTxn, openHumanAutocommit, releaseSession,
} from "./coa-template-pr-a-helpers.mjs";

const APPLY_DOOR = "clara.apply_coa_template(uuid,uuid,text[],text)";
const PR_B_MIGRATION = "UNNUMBERED_coa_pr_b_apply_template.sql";

let world;
let ready = false;
let starter = null;
let core = [];

before(async () => {
  ready = await ensureReady();
  if (!ready) return;
  const catalog = await rootQuery(
    `select
       to_regprocedure('clara.apply_coa_template(uuid,uuid,text[],text)')      is not null as apply,
       to_regprocedure('clara.add_coa_template_family(uuid,uuid,text,text)')   is not null as addf,
       to_regprocedure('clara.coa_chart_state(uuid)')                          is not null as state,
       to_regprocedure('clara.coa_template_drift(uuid)')                       is not null as drift,
       to_regclass('clara.coa_template_entity_overrides')                      is not null as ovr`);
  const row = catalog.rows[0];
  if (!row.apply || !row.addf || !row.state || !row.drift || !row.ovr) {
    if (process.env.CLARA_ALLOW_MISSING_COA_TEMPLATE_PR_B !== "1") {
      throw new Error(
        `coa-template-pr-b premise ${PR_B_MIGRATION} is not applied ` +
          `(apply=${row.apply}, addf=${row.addf}, state=${row.state}, ` +
          `drift=${row.drift}, overrides=${row.ovr}) and CLARA_ALLOW_MISSING_COA_TEMPLATE_PR_B is unset -- ` +
          "this is a FOCUSED run and must fail loudly, not skip. Preload " +
          "./tests/coa-template-pr-b-preintegration-gate.mjs for an estate sweep against a pre-PR-b chain.",
      );
    }
    ready = false;
    return;
  }
  world = await buildWorld();
  starter = await platformStarter();
  if (!starter) throw new Error("coa-template-pr-b: the platform starter my_sme_starter v1 is absent");
  core = await coreFamilies(starter.id);
  if (core.length === 0) throw new Error("coa-template-pr-b: the starter carries no core families");
});

after(async () => { await endPool(); });

function unready(t) {
  if (!ready) {
    t.skip(`rig not ready: ensureReady() found no draft_entry, or ${PR_B_MIGRATION} is not applied ` +
      "(PR-b doors / override table absent)");
    return true;
  }
  return false;
}

async function expectCleanRefusal(client, invoke, reason, message, code = null) {
  const before = await refusalLedgerCounts(client);
  let error = null;
  try {
    await invoke();
  } catch (caught) {
    error = caught;
  }
  assert.ok(error, `${message}: the call unexpectedly succeeded`);
  let actual = `(no detail) ${error?.code ?? ""} ${error?.message ?? ""}`;
  if (error?.detail) {
    try { actual = JSON.parse(error.detail).reason ?? `(no reason key) ${error.detail}`; }
    catch { actual = `(unparseable detail) ${error.detail}`; }
  }
  assert.equal(actual, reason, message);
  if (code !== null) assert.equal(error.code, code, `${message}: SQLSTATE`);
  const after = await refusalLedgerCounts(client);
  assert.deepEqual(after, before,
    `${reason}: refusal changed accounts/adoptions/op_receipts/audit_log/domain_events`);
  return error;
}

async function buildSectionPlanTemplate(tag) {
  const fork = await forkTemplate(world.users.alice, {
    source: starter.id,
    key: `rig_prb_sections_${tag}_${Date.now().toString(36)}`,
    title: `PR-b sections ${tag}`,
    basis: "rig section-only policy fixture",
    opKey: opk(`fork_${tag}`),
  });
  const freeCodes = (await rootQuery(
    `select g::text as code
       from generate_series(7000, 8999) g
      where not exists (select 1 from clara.coa_template_accounts a
                         where a.template_id = $1 and a.account_code = g::text)
      order by g limit 2`,
    [fork.template_id],
  )).rows.map((r) => r.code);
  assert.equal(freeCodes.length, 2, "section fixture found two unused four-digit account codes");

  await upsertFamily(world.users.alice, {
    template: fork.template_id, familyKey: "rig_section_only", label: "Section-only",
    inclusion: "opt_in", basis: "rig section C", sortOrdinal: 960,
    msicSections: ["C"], msicDivisions: [], msicEdition: "MSIC 2008",
    opKey: opk(`section_${tag}`),
  });
  await upsertTemplateAccount(world.users.alice, {
    template: fork.template_id, familyKey: "rig_section_only", code: freeCodes[0],
    name: "Section-only expense", type: "expense", sortOrdinal: 10,
    opKey: opk(`section_acc_${tag}`),
  });
  await upsertFamily(world.users.alice, {
    template: fork.template_id, familyKey: "rig_division_only", label: "Division-only",
    inclusion: "opt_in", basis: "rig division 62", sortOrdinal: 961,
    msicSections: [], msicDivisions: ["62"], msicEdition: "MSIC 2008",
    opKey: opk(`division_${tag}`),
  });
  await upsertTemplateAccount(world.users.alice, {
    template: fork.template_id, familyKey: "rig_division_only", code: freeCodes[1],
    name: "Division-only expense", type: "expense", sortOrdinal: 10,
    opKey: opk(`division_acc_${tag}`),
  });
  await publishTemplate(world.users.alice, { template: fork.template_id, opKey: opk(`publish_${tag}`) });
  return fork.template_id;
}

// ===========================================================================
// §1 -- THE APPLY: what lands, and that it is exactly what the template says.
// ===========================================================================

test("§1.1 apply onto an EMPTY chart plants exactly the kept families' accounts (a MAP, not a count)", async (t) => {
  if (unready(t)) return;
  const client = await newInterviewClient(world.users.alice, world.firms.A, {
    tag: "sdn", answers: { entity_type: "sdn_bhd", coa_seed_decision: { seed: "firm_template" } },
  });
  const res = await applyTemplate(world.users.bob, { client, template: starter.id, opKey: opk("ap") });

  assert.equal(res.families_source, "plan", "a NULL p_families asks the database for its own plan");
  // AN INDEPENDENT INSTRUMENT, not the door's own answer: the family set is compared against the
  // plan READ, computed separately from the client's facts. Deriving the expectation from
  // `res.families` alone would be self-referential -- a door that applied the wrong families and
  // then reported them would pass.
  const planned = await familyPlan(world.users.bob, client, starter.id);
  assert.deepEqual([...res.families].sort(), [...planned.keep].sort(),
    "the door applied exactly the families the plan read proposes");
  const want = await expectedChartMap(starter.id, res.families, "sdn_bhd");
  const got = await clientChartMap(client);
  assert.deepEqual(got, want, "the planted chart is the template's own rows for the kept families");
  assert.ok(Object.keys(want).length > 0, "the expectation itself is non-vacuous");
  assert.equal(res.accounts, Object.keys(want).length, "the receipt's account count agrees with the table");

  // Q10 -- the equity section swapped by entity type, both directions.
  assert.ok(res.families.includes("equity_company"), "a Sdn Bhd is proposed equity_company");
  for (const f of ["equity_sole_prop", "equity_partnership", "equity_society", "equity_cooperative"]) {
    assert.ok(!res.families.includes(f), `a Sdn Bhd is NOT proposed ${f}`);
  }
  // Every core family is present -- read live, never a literal.
  for (const f of core) assert.ok(res.families.includes(f), `core family ${f} is in every apply`);
});

test("§1.2 every applied row is is_active + NOT is_bank_account (Annex C cell 17), and the marker survives", async (t) => {
  if (unready(t)) return;
  const client = await newInterviewClient(world.users.alice, world.firms.A, {
    tag: "flags", answers: { entity_type: "sdn_bhd" } });
  await applyTemplate(world.users.bob, { client, template: starter.id, opKey: opk("ap") });
  const map = await clientChartMap(client);
  const codes = Object.keys(map);
  assert.ok(codes.length > 40, "the fixture chart is big enough for this to mean something");
  for (const code of codes) {
    assert.equal(map[code].bank, false, `${code} lands is_bank_account = false`);
    assert.equal(map[code].active, true, `${code} lands active`);
  }
  const markers = codes.filter((c) => map[c].special !== null);
  assert.deepEqual(markers.sort(), ["2150", "3900", "9900", "9910", "9920"],
    "the five special markers land once each, carrying their markers through the core");
});

test("§1.3 the core's own side-effects survive the loop: one _audit row + one account.upserted event per account, and exactly ONE account.chart_applied", async (t) => {
  if (unready(t)) return;
  const client = await newInterviewClient(world.users.alice, world.firms.A, {
    tag: "events", answers: { entity_type: "sole_prop" } });
  const beforeUpsert = await eventCount(world.firms.A, "account.upserted");
  const beforeChart = await eventCount(world.firms.A, "account.chart_applied");
  const beforeAudit = await auditCount(world.firms.A, "upsert_account");
  const beforeApplyAudit = await auditCount(world.firms.A, "apply_coa_template");

  const res = await applyTemplate(world.users.bob, { client, template: starter.id, opKey: opk("ap") });

  assert.equal(await eventCount(world.firms.A, "account.upserted") - beforeUpsert, res.accounts,
    "one account.upserted per planted account -- the core's event, unsuppressed");
  assert.equal(await auditCount(world.firms.A, "upsert_account") - beforeAudit, res.accounts,
    "one _audit row per planted account -- the core's audit, unsuppressed");
  assert.equal(await eventCount(world.firms.A, "account.chart_applied") - beforeChart, 1,
    "exactly ONE chart-level event for the whole apply");
  assert.equal(await auditCount(world.firms.A, "apply_coa_template") - beforeApplyAudit, 1,
    "exactly ONE apply audit row");
});

// ===========================================================================
// §2 -- THE LADDER. Every rung a named refusal, and every refusal with its twin.
// ===========================================================================

test("§2.1 rung 5: apply onto a NON-empty chart refuses chart_not_empty -- WITH the inverted twin", async (t) => {
  if (unready(t)) return;
  // The twin FIRST, so a broken door cannot pass the refusal cell by being broken.
  const fresh = await newInterviewClient(world.users.alice, world.firms.A, { tag: "twin", answers: { entity_type: "sdn_bhd" } });
  const ok = await applyTemplate(world.users.bob, { client: fresh, template: starter.id, opKey: opk("ap") });
  assert.ok(ok.accounts > 0, "TWIN: the same call on an empty chart SUCCEEDS -- the refusal below is a wall, not a broken door");

  // world.clients.A1 already carries a chart (buildWorld's buildCoa).
  assert.ok(await accountCount(world.clients.A1) > 0, "premise: A1 already has accounts");
  await expectCleanRefusal(
    world.clients.A1,
    () => applyTemplate(world.users.bob, { client: world.clients.A1, template: starter.id, opKey: opk("ap") }),
    "chart_not_empty", "裁-23 Q4: BELCORT's chart wins, and two charts on one client are refused",
    CLR.badRequest,
  );

  // A SECOND apply on the client that just succeeded refuses the same way, under a DIFFERENT
  // op key: idempotence is the op-key path, never a silent no-op (Annex C cell 3).
  await expectCleanRefusal(
    fresh,
    () => applyTemplate(world.users.bob, { client: fresh, template: starter.id, opKey: opk("different") }),
    "chart_not_empty", "a different batch key on the same client refuses at rung 5",
  );
});

test("§2.2 idempotence is the OP-KEY path: a replay returns the stored result and plants nothing new", async (t) => {
  if (unready(t)) return;
  const client = await newInterviewClient(world.users.alice, world.firms.A, { tag: "idem", answers: { entity_type: "sdn_bhd" } });
  const key = opk("idem");
  const first = await applyTemplate(world.users.bob, { client, template: starter.id, opKey: key });
  const n1 = await accountCount(client);
  const second = await applyTemplate(world.users.bob, { client, template: starter.id, opKey: key });
  const n2 = await accountCount(client);

  assert.equal(n2, n1, "the replay plants NOTHING new -- measured on the table, not on the return value");
  assert.deepEqual(second, first, "the replay returns the STORED result byte-for-byte");
  assert.equal((await rawAdoption(client)).length, 1, "and no second adoption row");
});

test("§2.3 rung 6: a client that already adopted refuses already_adopted (constructed by fixture surgery, since rung 5 fires first)", async (t) => {
  if (unready(t)) return;
  const client = await newInterviewClient(world.users.alice, world.firms.A, { tag: "adopted", answers: { entity_type: "sdn_bhd" } });
  await forceAdoptionRow(world.firms.A, client, starter.id, starter.version, core, world.users.alice);
  assert.equal(await accountCount(client), 0, "premise: the chart is still EMPTY, so rung 5 cannot be what refuses");
  await expectCleanRefusal(
    client,
    () => applyTemplate(world.users.bob, { client, template: starter.id, opKey: opk("ap") }),
    "already_adopted", "rung 6 is reached and named",
  );
});

test("§2.4 NULL family keys refuse by name; rung 7 + rung 8 name the offender", async (t) => {
  if (unready(t)) return;
  const client = await newInterviewClient(world.users.alice, world.firms.A, { tag: "rungs", answers: { entity_type: "sdn_bhd" } });
  await expectCleanRefusal(
    client,
    () => applyTemplate(world.users.bob, { client, template: starter.id, families: [null], opKey: opk("null-only") }),
    "family_key_null", "ARRAY[NULL] is malformed and never a zero-account adoption",
  );
  await expectCleanRefusal(
    client,
    () => applyTemplate(world.users.bob, {
      client, template: starter.id, families: [...core, null], opKey: opk("null-mixed"),
    }),
    "family_key_null", "a NULL hidden beside a valid family set is still malformed",
  );
  const unknown = await expectCleanRefusal(
    client,
    () => applyTemplate(world.users.bob, {
      client, template: starter.id, families: [...core, "no_such_family"], opKey: opk("ap"),
    }),
    "unknown_family", "rung 7",
  );
  assert.match(unknown.message, /no_such_family/, "rung 7 NAMES the offender in its message");

  const oneCoreDropped = core.filter((f) => f !== core[0]);
  const dropped = await expectCleanRefusal(
    client,
    () => applyTemplate(world.users.bob, {
      client, template: starter.id, families: oneCoreDropped, opKey: opk("ap3"),
    }),
    "core_family_dropped", "rung 8: `core` is never trimmable",
  );
  assert.match(dropped.message, new RegExp(core[0]), "rung 8 NAMES the dropped core family");
  // Rung 6b -- an EMPTY set is refused by NAME rather than by ck_coa_adoption_families' bare
  // 23514. On the platform starter rung 8 would also catch it (it carries core families), so the
  // cell pins the REASON: `families_required` is the one that must answer, and it must answer
  // first.
  await expectCleanRefusal(
    client,
    () => applyTemplate(world.users.bob, { client, template: starter.id, families: [], opKey: opk("ap5") }),
    "families_required", "rung 6b: an empty family set is a named refusal, never a CHECK violation",
  );
  assert.equal(await accountCount(client), 0, "no refusal planted anything");

  const twin = await newInterviewClient(world.users.alice, world.firms.A, {
    tag: "rungs_twin", answers: { entity_type: "sdn_bhd" },
  });
  const valid = await applyTemplate(world.users.bob, {
    client: twin, template: starter.id, families: core, opKey: opk("valid-twin"),
  });
  assert.ok(valid.accounts > 0, "TWIN: the same caller-supplied shape without NULL succeeds");
});

test("§2.4b adoption families structurally reject NULL even if a future door misses it", async (t) => {
  if (unready(t)) return;
  const client = await newInterviewClient(world.users.alice, world.firms.A, {
    tag: "null_check", answers: { entity_type: "sdn_bhd" },
  });
  const insertBad = (c) => c.query(
    `insert into clara.coa_template_adoptions
       (firm_id, client_id, template_id, template_version, state, families, adopted_by, adopted_at)
     values ($1, $2, $3, $4, 'adopted', array[null]::text[], $5, now())`,
    [world.firms.A, client, starter.id, starter.version, world.users.alice],
  );
  await withRolledBackTx(async (c) => {
    assert.equal(await raisedCode(() => insertBad(c)), PG.checkViolation,
      "control: the structural no-NULL CHECK refuses a malformed adoption");
    await c.query("rollback");
    await c.query("begin");
    await c.query("alter table clara.coa_template_adoptions drop constraint ck_coa_adoption_families_no_null");
    assert.equal(await raisedCode(() => insertBad(c)), null,
      "MUTANT: without the CHECK, ARRAY[NULL] is accepted -- the wall is load-bearing");
  });
  assert.equal((await rawAdoption(client)).length, 0, "the structural mutant left no adoption behind");
});

test("§2.5 rung 3/4: another firm's client refuses CLR11, and a DRAFT template refuses template_not_published", async (t) => {
  if (unready(t)) return;
  const clientB = await newInterviewClient(world.users.dave, world.firms.B, { tag: "b", answers: { entity_type: "sdn_bhd" } });
  // Firm A's bookkeeper cannot reach firm B's client. Both the class AND the reason.
  await expectCleanRefusal(
    clientB,
    () => applyTemplate(world.users.bob, { client: clientB, template: starter.id, opKey: opk("x") }),
    "client_not_in_firm", "cross-firm apply is CLR11 and named", CLR.notFound,
  );
  assert.equal(await accountCount(clientB), 0, "nothing landed on the other firm's client");

  // TWIN: firm B's OWN bookkeeper-or-better succeeds on the same client -- so the refusal above is
  // tenancy, not a broken fixture.
  const ok = await applyTemplate(world.users.dave, { client: clientB, template: starter.id, opKey: opk("bok") });
  assert.ok(ok.accounts > 0, "TWIN: firm B applies the PLATFORM template to its own client");

  // A firm-scoped DRAFT of firm A cannot be applied.
  const fork = (await humanQuery(world.users.alice,
    "select clara.fork_coa_template(p_source => $1, p_template_key => $2, p_title => $3, p_framework_hint => 'MPERS', p_basis => 'rig', p_op_key => $4) as r",
    [starter.id, `rig_prb_draft_${Date.now().toString(36)}`, "PR-b draft", opk("fork")])).rows[0].r;
  const client = await newInterviewClient(world.users.alice, world.firms.A, { tag: "draft", answers: { entity_type: "sdn_bhd" } });
  await expectCleanRefusal(
    client,
    () => applyTemplate(world.users.bob, { client, template: fork.template_id, opKey: opk("d") }),
    "template_not_published", "rung 4 refuses a draft",
  );
  // ...and firm B cannot even SEE firm A's firm-scoped template: the same call from firm B is a
  // not-found, never a not-published (no cross-firm existence oracle).
  await expectCleanRefusal(
    clientB,
    () => applyTemplate(world.users.dave, { client: clientB, template: fork.template_id, opKey: opk("d2") }),
    "template_not_found", "another firm's template is INVISIBLE, not merely unpublished",
  );
});

test("§2.6 op_key is required, and a reused key with different args RAISES rather than replaying", async (t) => {
  if (unready(t)) return;
  const client = await newInterviewClient(world.users.alice, world.firms.A, { tag: "opk", answers: { entity_type: "sdn_bhd" } });
  await expectCleanRefusal(
    client,
    () => applyTemplate(world.users.bob, { client, template: starter.id, opKey: "  " }),
    "op_key_required", "rung 1",
  );
  const key = opk("reuse");
  await applyTemplate(world.users.bob, { client, template: starter.id, families: core, opKey: key });
  assert.equal(
    await raisedCode(() => applyTemplate(world.users.bob, { client, template: starter.id, families: core.slice(0, 3), opKey: key })),
    CLR.badRequest, "the same key with a DIFFERENT family set is refused by _reserve_op, not silently replayed");
});

test("§2.7 the family list is order-insensitive: the same SET in a different order is the SAME request", async (t) => {
  if (unready(t)) return;
  const client = await newInterviewClient(world.users.alice, world.firms.A, { tag: "order", answers: { entity_type: "sdn_bhd" } });
  const key = opk("order");
  const first = await applyTemplate(world.users.bob, { client, template: starter.id, families: core, opKey: key });
  const shuffled = [...core].reverse();
  const replay = await applyTemplate(world.users.bob, { client, template: starter.id, families: shuffled, opKey: key });
  assert.deepEqual(replay, first, "the request hash covers the SORTED list, so a re-ordered replay is a replay");
});

test("§2.8 NULL-plan and caller [] are distinct idempotency requests", async (t) => {
  if (unready(t)) return;
  const client = await newInterviewClient(world.users.alice, world.firms.A, {
    tag: "hash_mode", answers: { entity_type: "sdn_bhd" },
  });
  const key = opk("hash-mode");
  const first = await applyTemplate(world.users.bob, {
    client, template: starter.id, families: null, opKey: key,
  });
  const before = await refusalLedgerCounts(client);
  assert.equal(
    await raisedCode(() => applyTemplate(world.users.bob, {
      client, template: starter.id, families: [], opKey: key,
    })),
    CLR.badRequest,
    "the same key cannot replay a plan-derived success for an explicit empty caller list",
  );
  assert.deepEqual(await refusalLedgerCounts(client), before,
    "the op-key-reuse refusal changed one of the five ledgers");
  assert.ok(first.accounts > 0, "premise: the NULL-plan request succeeded before the reuse attempt");
});

test("§2.9 concurrent apply loser gets chart_adoption_race, never a bare 23505", async (t) => {
  if (unready(t)) return;
  const client = await newInterviewClient(world.users.alice, world.firms.A, {
    tag: "apply_race", answers: { entity_type: "sdn_bhd" },
  });
  const key1 = opk("race-a");
  const key2 = opk("race-b");
  const beforeApplyReceipts = (await rootQuery(
    "select count(*)::int as n from clara.op_receipts where fn = 'apply_coa_template' and op_key = any($1::text[])",
    [[key1, key2]],
  )).rows[0].n;
  const beforeApplyAudit = await auditCount(world.firms.A, "apply_coa_template");
  const beforeChartEvents = await eventCount(world.firms.A, "account.chart_applied");
  let t1 = null;
  let t2 = null;
  try {
    t1 = await openHumanTxn(world.users.bob);
    const first = (await t1.client.query(
      "select clara.apply_coa_template($1,$2,null::text[],$3) as r",
      [client, starter.id, key1],
    )).rows[0].r;
    t2 = await openHumanAutocommit(world.users.bob);
    const loser = t2.client.query(
      "select clara.apply_coa_template($1,$2,null::text[],$3) as r",
      [client, starter.id, key2],
    ).then((r) => ({ ok: true, r }), (e) => ({ ok: false, e }));

    await waitBlockedByOrThrow(t2.pid, t1.pid);
    await t1.client.query("commit");
    const out = await loser;
    assert.equal(out.ok, false, "the concurrency loser unexpectedly succeeded");
    assert.equal(out.e.code, CLR.badRequest, "the loser is translated to CLR10, not bare 23505");
    assert.equal(JSON.parse(out.e.detail).reason, "chart_adoption_race",
      "the concurrency loser names the serialisation race");

    assert.equal(await accountCount(client), first.accounts, "only the winner's exact chart remains");
    assert.equal((await rawAdoption(client)).length, 1, "exactly one adoption remains");
    const afterApplyReceipts = (await rootQuery(
      "select count(*)::int as n from clara.op_receipts where fn = 'apply_coa_template' and op_key = any($1::text[])",
      [[key1, key2]],
    )).rows[0].n;
    assert.equal(afterApplyReceipts - beforeApplyReceipts, 1, "exactly one outer apply receipt remains");
    assert.equal(await auditCount(world.firms.A, "apply_coa_template") - beforeApplyAudit, 1,
      "exactly one apply audit remains");
    assert.equal(await eventCount(world.firms.A, "account.chart_applied") - beforeChartEvents, 1,
      "exactly one chart-level event remains");
  } finally {
    await releaseSession(t1);
    await releaseSession(t2);
  }
});

test("§2.9b concurrent apply on an EXISTING PROPOSED row: the loser gets chart_adoption_race too, never a silent overwrite", async (t) => {
  if (unready(t)) return;
  // The proposed-row TWIN of §2.9: two callers race the UPDATE branch (rung 6's "a 'proposed' row
  // is the thing being applied"), not the INSERT branch. Without a state-conditional WHERE on that
  // UPDATE, the second writer would block on the row lock, then -- once the WHERE clause is keyed
  // only on id -- silently re-write the winner's already-adopted row instead of being refused.
  const client = await newInterviewClient(world.users.alice, world.firms.A, {
    tag: "apply_race_prop", answers: { entity_type: "sdn_bhd" },
  });
  const proposalId = await forceProposedRow(world.firms.A, client, starter.id, starter.version, core);
  const key1 = opk("race-prop-a");
  const key2 = opk("race-prop-b");
  const beforeApplyReceipts = (await rootQuery(
    "select count(*)::int as n from clara.op_receipts where fn = 'apply_coa_template' and op_key = any($1::text[])",
    [[key1, key2]],
  )).rows[0].n;
  const beforeApplyAudit = await auditCount(world.firms.A, "apply_coa_template");
  const beforeChartEvents = await eventCount(world.firms.A, "account.chart_applied");
  let t1 = null;
  let t2 = null;
  try {
    t1 = await openHumanTxn(world.users.bob);
    const first = (await t1.client.query(
      "select clara.apply_coa_template($1,$2,null::text[],$3) as r",
      [client, starter.id, key1],
    )).rows[0].r;
    t2 = await openHumanAutocommit(world.users.bob);
    const loser = t2.client.query(
      "select clara.apply_coa_template($1,$2,null::text[],$3) as r",
      [client, starter.id, key2],
    ).then((r) => ({ ok: true, r }), (e) => ({ ok: false, e }));

    await waitBlockedByOrThrow(t2.pid, t1.pid);
    await t1.client.query("commit");
    const out = await loser;
    assert.equal(out.ok, false, "the concurrency loser unexpectedly succeeded on the proposed-row path");
    assert.equal(out.e.code, CLR.badRequest, "the loser is translated to CLR10, not a silent overwrite");
    assert.equal(JSON.parse(out.e.detail).reason, "chart_adoption_race",
      "the proposed-row loser names the SAME serialisation race as the insert-branch twin");

    assert.equal(await accountCount(client), first.accounts, "only the winner's exact chart remains");
    const rows = await rawAdoption(client);
    assert.equal(rows.length, 1, "exactly one adoption remains -- the proposed row MOVED, never duplicated");
    assert.equal(rows[0].id, proposalId, "the surviving row is the SAME id the proposal started as -- moved, not replaced");
    assert.equal(rows[0].state, "adopted", "the surviving row is now adopted");
    assert.equal(rows[0].adopted_by, world.users.bob, "the winner's actor stamped adopted_by, not the loser's");
    const afterApplyReceipts = (await rootQuery(
      "select count(*)::int as n from clara.op_receipts where fn = 'apply_coa_template' and op_key = any($1::text[])",
      [[key1, key2]],
    )).rows[0].n;
    assert.equal(afterApplyReceipts - beforeApplyReceipts, 1, "exactly one outer apply receipt remains");
    assert.equal(await auditCount(world.firms.A, "apply_coa_template") - beforeApplyAudit, 1,
      "exactly one apply audit remains");
    assert.equal(await eventCount(world.firms.A, "account.chart_applied") - beforeChartEvents, 1,
      "exactly one chart-level event remains");
  } finally {
    await releaseSession(t1);
    await releaseSession(t2);
  }
});

// ===========================================================================
// §3 -- ANNEX E's FIRST NON-GOAL: no agent path to the BULK apply.
// ===========================================================================

test("§3.0 the EXACT-SIGNATURE roster resolves, and no proname carries a second overload", async (t) => {
  if (unready(t)) return;
  assert.deepEqual(await coaTemplatePrbSigFailures(), [],
    "law 3: every door resolves at its EXACT argument list, and no overload shadows one");
  // Non-vacuity: the roster itself must be the one this file is about.
  assert.ok(COA_TEMPLATE_PR_B_SIGS.includes(APPLY_DOOR), "the roster carries the apply door itself");
  assert.equal(COA_TEMPLATE_PR_B_SIGS.length, 12, "7 doors + 4 invoker helpers + 1 writing internal");
});

test("§3.1 no wake / agent / runtime / freeform role can EXECUTE the apply -- by census AND by probe", async (t) => {
  if (unready(t)) return;
  const roles = (await rootQuery(
    "select rolname from pg_roles where rolname like 'clara\\_%' and rolname not in ('clara_fn_owner','clara_authenticated') order by 1")).rows.map((r) => r.rolname);
  assert.ok(roles.length >= 6, "the roster is non-empty -- an empty roster would make this vacuous");
  for (const role of roles) {
    const priv = (await rootQuery("select has_function_privilege($1, $2::regprocedure, 'EXECUTE') as p", [role, APPLY_DOOR])).rows[0].p;
    assert.equal(priv, false, `${role} has no EXECUTE on the apply door`);
  }
  // The BEHAVIOURAL half: a real call under a real wake role raises. An ACL census alone would be
  // an absence; this is the read that SAW the refusal.
  const client = await newInterviewClient(world.users.alice, world.firms.A, { tag: "wake", answers: { entity_type: "sdn_bhd" } });
  const code = await raisedCode(() => roleQuery(ROLES.wakeInteractive,
    "select clara.apply_coa_template($1, $2, null::text[], $3)", [client, starter.id, opk("w")]));
  assert.equal(code, PG.insufficientPrivilege, "a wake role is refused by the ACL before any body runs");
  assert.equal(await accountCount(client), 0, "and nothing landed");
});

test("§3.2 M6 MUTANT: granting the door to a wake role opens the path -- and _human_ctx is the SECOND wall", async (t) => {
  if (unready(t)) return;
  const client = await newInterviewClient(world.users.alice, world.firms.A, { tag: "m6", answers: { entity_type: "sdn_bhd" } });
  const out = await withRolledBackTx(async (c) => {
    await c.query(`grant execute on function ${APPLY_DOOR} to ${ROLES.wakeInteractive}`);
    await c.query(`set local role ${ROLES.wakeInteractive}`);
    try {
      await c.query("select clara.apply_coa_template($1, $2, null::text[], $3)", [client, starter.id, opk("m6")]);
      return null;
    } catch (e) { return e.code; }
    // BEST-EFFORT: the probe above is EXPECTED to raise, which aborts the transaction, and a bare
    // `reset role` here would throw 25P02 over the SQLSTATE this cell exists to read.
    finally { try { await c.query("reset role"); } catch { /* already aborted */ } }
  });
  assert.notEqual(out, PG.insufficientPrivilege, "M6: with the grant in place the ACL is no longer what refuses -- the mutant BITES");
  assert.equal(out, CLR.authz, "and the SECOND wall is _human_ctx's CLR04: a wake session has no authenticated actor");
  // The mutation is rolled back: the shipping ACL is unchanged.
  assert.equal((await rootQuery("select has_function_privilege($1, $2::regprocedure, 'EXECUTE') as p",
    [ROLES.wakeInteractive, APPLY_DOOR])).rows[0].p, false, "the grant did not survive the rollback");
});

// ===========================================================================
// §4 -- THE DETERMINISTIC PLAN (裁-23 Q6/Q10), and its fail-closed conjunction.
// ===========================================================================

test("§4.1 no axis at all -> axis `core_only`, keep is EXACTLY the live core set, every axis named absent", async (t) => {
  if (unready(t)) return;
  const client = await newInterviewClient(world.users.alice, world.firms.A, { tag: "bare" });
  const plan = await familyPlan(world.users.bob, client, starter.id);
  assert.equal(plan.axis, "core_only", "Q6's ruled interim state");
  assert.deepEqual([...plan.keep].sort(), [...core].sort(), "keep is exactly the `core` families, read live");
  assert.deepEqual([...plan.absent_axes].sort(), ["entity_type", "msic", "trade_nature"],
    "each absent axis is NAMED -- absence is not evidence, and it is not silence either");
  assert.deepEqual(plan.axes, { entity_type: null, trade_nature: null, msic: null }, "and no axis was invented");
});

test("§4.2 trade_nature DISCRIMINATES: goods_trading keeps inventory_and_cogs, services drops it", async (t) => {
  if (unready(t)) return;
  const goods = await newInterviewClient(world.users.alice, world.firms.A, { tag: "goods" });
  await recordFact(world.users.alice, { client: goods, key: "trade_nature", value: "goods_trading" });
  const pGoods = await familyPlan(world.users.bob, goods, starter.id);
  assert.ok(pGoods.keep.includes("inventory_and_cogs"), "a goods trader is proposed inventory and cost of sales");

  const services = await newInterviewClient(world.users.alice, world.firms.A, { tag: "svc" });
  await recordFact(world.users.alice, { client: services, key: "trade_nature", value: "services" });
  const pSvc = await familyPlan(world.users.bob, services, starter.id);
  assert.ok(!pSvc.keep.includes("inventory_and_cogs"), "a services client is NOT -- the single highest-yield trim");
  assert.ok(pSvc.keep.includes("cash_and_bank"), "and the core is untouched by the trim");
  assert.ok(!pSvc.absent_axes.includes("trade_nature"), "a planted fact is not reported absent");
});

test("§4.3 the LIVE FACT wins over the committed interview answer, and the answer is the FALLBACK (0055's own idiom)", async (t) => {
  if (unready(t)) return;
  // Fallback: an interview answer with no fact.
  const viaAnswer = await newInterviewClient(world.users.alice, world.firms.A, {
    tag: "fallback", answers: { entity_type: "partnership" } });
  const p1 = await familyPlan(world.users.bob, viaAnswer, starter.id);
  assert.equal(p1.axes.entity_type, "partnership", "the committed interview answer is read when no fact exists");
  assert.ok(p1.keep.includes("equity_partnership"), "and it drives the equity swap");

  // Precedence: a LATER fact supersedes the answer.
  await recordFact(world.users.alice, { client: viaAnswer, key: "entity_type", value: "sdn_bhd" });
  const p2 = await familyPlan(world.users.bob, viaAnswer, starter.id);
  assert.equal(p2.axes.entity_type, "sdn_bhd", "the captured fact WINS over the interview answer");
  assert.ok(p2.keep.includes("equity_company") && !p2.keep.includes("equity_partnership"),
    "and the equity swap follows the fact");
});

test("§4.4 msic keys on the DIVISION, and an unmatched division drops the family", async (t) => {
  if (unready(t)) return;
  const build = await newInterviewClient(world.users.alice, world.firms.A, { tag: "msicf" });
  await recordFact(world.users.alice, { client: build, key: "msic", value: "41001" });
  const p = await familyPlan(world.users.bob, build, starter.id);
  assert.equal(p.msic_division, "41", "the five-digit code is keyed at the division");
  assert.ok(p.keep.includes("construction_contracts"), "division 41 selects the construction family");
  assert.ok(!p.keep.includes("property_rental"), "and NOT the property family, whose divisions do not match");

  const other = await newInterviewClient(world.users.alice, world.firms.A, { tag: "msico" });
  await recordFact(world.users.alice, { client: other, key: "msic", value: "99999" });
  const p2 = await familyPlan(world.users.bob, other, starter.id);
  assert.equal(p2.msic_division, "99", "an unknown division is still read as a division");
  for (const f of ["construction_contracts", "property_rental", "manufacturing", "fnb_hospitality", "professional_services"]) {
    assert.ok(!p2.keep.includes(f), `no MSIC-keyed family (${f}) is proposed on an unmatched division`);
  }
});

test("§4.5 the conjunction is FAIL-CLOSED: a family declaring two axes needs BOTH, and an unkeyed opt_in is never proposed", async (t) => {
  if (unready(t)) return;
  // `manufacturing` declares trade_natures {goods_trading, mixed} AND divisions 10..33.
  const half = await newInterviewClient(world.users.alice, world.firms.A, { tag: "half" });
  await recordFact(world.users.alice, { client: half, key: "trade_nature", value: "goods_trading" });
  const p = await familyPlan(world.users.bob, half, starter.id);
  assert.ok(!p.keep.includes("manufacturing"),
    "one satisfied axis is not enough -- the msic axis is absent, so the family is dropped");
  assert.ok(p.absent_axes.includes("msic"), "and the absent axis is named");

  await recordFact(world.users.alice, { client: half, key: "msic", value: "10101" });
  const p2 = await familyPlan(world.users.bob, half, starter.id);
  assert.ok(p2.keep.includes("manufacturing"), "with BOTH axes satisfied the family is proposed -- the cell discriminates");

  // An opt_in family with NO trim keys is human-only, on every plan.
  for (const f of ["motor_vehicles", "foreign_currency", "land_and_buildings", "provisions"]) {
    assert.ok(!p2.keep.includes(f), `${f} declares no key and is never auto-proposed`);
    assert.ok(p2.drop.includes(f), "...and it is reported as dropped, not omitted from the answer");
  }

  // A section letter is metadata until the ruled future section MAPPING exists. It is not an
  // operable trim key, so a sections-only family remains human opt-in for every client.
  const sectionTemplate = await buildSectionPlanTemplate("shipping");
  const noMsic = await newInterviewClient(world.users.alice, world.firms.A, { tag: "section_none" });
  const noMsicPlan = await familyPlan(world.users.bob, noMsic, sectionTemplate);
  assert.ok(!noMsicPlan.keep.includes("rig_section_only"),
    "a sections-only family is not auto-kept when MSIC is absent");

  const mismatch = await newInterviewClient(world.users.alice, world.firms.A, { tag: "section_mismatch" });
  await recordFact(world.users.alice, { client: mismatch, key: "msic", value: "99999" });
  const mismatchPlan = await familyPlan(world.users.bob, mismatch, sectionTemplate);
  assert.ok(!mismatchPlan.keep.includes("rig_section_only"),
    "a sections-only family is not auto-kept on an unrelated division");

  const match = await newInterviewClient(world.users.alice, world.firms.A, { tag: "division_match" });
  await recordFact(world.users.alice, { client: match, key: "msic", value: "62010" });
  const matchPlan = await familyPlan(world.users.bob, match, sectionTemplate);
  assert.ok(matchPlan.keep.includes("rig_division_only"),
    "TWIN: an operable division key is kept for a positively matching client");
  assert.ok(!matchPlan.keep.includes("rig_section_only"),
    "even a client with MSIC does not make section metadata an implicit mapping");
});

test("§4.6 M5 MUTANT: turning the plan's AND into an OR proposes a family no axis matched", async (t) => {
  if (unready(t)) return;
  const half = await newInterviewClient(world.users.alice, world.firms.A, { tag: "m5" });
  await recordFact(world.users.alice, { client: half, key: "trade_nature", value: "goods_trading" });
  const src = (await rootQuery(
    "select prosrc from pg_proc where oid = 'clara._coa_family_plan(uuid,uuid)'::regprocedure")).rows[0].prosrc;
  const needle = "and (ff.msic_divisions = '{}' or (v_div is not null and v_div = any (ff.msic_divisions)))";
  assert.ok(src.includes(needle), "the mutation target is present in the LIVE body (law 3: mutate the real thing)");

  const kept = await withRolledBackTx(async (c) => {
    await c.query("set local role clara_fn_owner");
    await c.query(`create or replace function clara._coa_family_plan(p_client uuid, p_template uuid) returns jsonb
      language plpgsql stable security invoker set search_path = clara, pg_temp as $mut$${src.replace(needle, "and (true)")}$mut$`);
    await c.query("reset role");
    const r = await asHumanOn(c, world.users.bob, "select clara.coa_template_family_plan($1,$2) as p", [half, starter.id]);
    return r.rows[0].p.keep;
  });
  assert.ok(kept.includes("manufacturing"),
    "M5: with the msic conjunct removed, `manufacturing` is proposed on a client with no msic at all -- the mutant BITES");
  const after = await familyPlan(world.users.bob, half, starter.id);
  assert.ok(!after.keep.includes("manufacturing"), "and the shipping body is unchanged after the rollback");
});

test("§4.7 section-key MUTANT: treating metadata as an operable key auto-keeps the family", async (t) => {
  if (unready(t)) return;
  const template = await buildSectionPlanTemplate("mutant");
  const client = await newInterviewClient(world.users.alice, world.firms.A, { tag: "section_mutant" });
  const src = (await rootQuery(
    "select prosrc from pg_proc where oid = 'clara._coa_family_plan(uuid,uuid)'::regprocedure"
  )).rows[0].prosrc;
  const fixed = "(ff.entity_types <> '{}' or ff.trade_natures <> '{}'\n                    or ff.msic_divisions <> '{}')";
  const old = "(ff.entity_types <> '{}' or ff.trade_natures <> '{}'\n                    or ff.msic_sections <> '{}' or ff.msic_divisions <> '{}')";
  assert.ok(src.includes(fixed), "the shipping body carries the fail-closed trim-key disjunct");
  const kept = await withRolledBackTx(async (c) => {
    await c.query("set local role clara_fn_owner");
    await c.query(`create or replace function clara._coa_family_plan(p_client uuid, p_template uuid) returns jsonb
      language plpgsql stable security invoker set search_path = clara, pg_temp as $mut$${src.replace(fixed, old)}$mut$`);
    await c.query("reset role");
    const r = await asHumanOn(c, world.users.bob,
      "select clara.coa_template_family_plan($1,$2) as p", [client, template]);
    return r.rows[0].p.keep;
  });
  assert.ok(kept.includes("rig_section_only"),
    "MUTANT: restoring msic_sections to the trim-key disjunct auto-keeps it -- the mutant BITES");
  assert.ok(!(await familyPlan(world.users.bob, client, template)).keep.includes("rig_section_only"),
    "the shipping plan is restored after rollback");
});

// ===========================================================================
// §5 -- THE ENTITY OVERRIDE: 0150's written obligation, discharged and drift-guarded.
// ===========================================================================

test("§5.1 a SOCIETY gets 3900 relabelled `Accumulated Fund` (marker intact) and NO 3040 -- with the sdn_bhd twin", async (t) => {
  if (unready(t)) return;
  const soc = await newInterviewClient(world.users.alice, world.firms.A, { tag: "soc", answers: { entity_type: "society" } });
  const res = await applyTemplate(world.users.bob, { client: soc, template: starter.id, opKey: opk("soc") });
  assert.ok(res.families.includes("equity_society"), "premise: the society-keyed equity family was proposed");
  const map = await clientChartMap(soc);
  assert.equal(map["3900"].name, "Accumulated Fund", "the relabel landed");
  assert.equal(map["3900"].special, "retained_earnings", "and the marker the estate requires is intact");
  assert.equal(map["3040"], undefined, "3040 was SUPPRESSED -- one concept, one account");
  assert.ok(map["4500"] && map["4510"], "the rest of the society family still landed");

  // THE TWIN. A Sdn Bhd opting INTO equity_society explicitly gets 3040 and keeps "Retained
  // Earnings" -- so the override is entity-keyed behaviour, not an unconditional rewrite.
  const co = await newInterviewClient(world.users.alice, world.firms.A, { tag: "cosoc", answers: { entity_type: "sdn_bhd" } });
  await applyTemplate(world.users.bob, { client: co, template: starter.id, families: [...core, "equity_society"], opKey: opk("co") });
  const coMap = await clientChartMap(co);
  assert.equal(coMap["3900"].name, "Retained Earnings", "a company keeps the template's own name");
  assert.ok(coMap["3040"], "and 3040 is planted for it");
});

test("§5.2 M3 + M4 MUTANTS: the relabel and the suppression are produced by the SEEDED ROWS", async (t) => {
  if (unready(t)) return;
  // Fixtures are built OUTSIDE the mutant transaction (the helpers use the pool); only the APPLY
  // runs inside, on the connection the mutation is visible to.
  const soc1 = await newInterviewClient(world.users.alice, world.firms.A, { tag: "m3", answers: { entity_type: "society" } });
  const m3 = await withRolledBackTx(async (c) => {
    await c.query("set local role clara_fn_owner");
    await c.query("delete from clara.coa_template_entity_overrides where entity_type = 'society' and account_code = '3900'");
    await c.query("reset role");
    await asHumanOn(c, world.users.bob, "select clara.apply_coa_template($1,$2,null::text[],$3)", [soc1, starter.id, opk("m3")]);
    const r = await c.query("select name from clara.coa_accounts where client_id = $1 and account_code = '3900'", [soc1]);
    return r.rows[0]?.name;
  });
  assert.equal(m3, "Retained Earnings",
    "M3: delete the relabel row and the society gets the mislabelled name back -- the mutant BITES");

  const soc2 = await newInterviewClient(world.users.alice, world.firms.A, { tag: "m4", answers: { entity_type: "society" } });
  const m4 = await withRolledBackTx(async (c) => {
    await c.query("set local role clara_fn_owner");
    await c.query("delete from clara.coa_template_entity_overrides where entity_type = 'society' and account_code = '3040'");
    await c.query("reset role");
    await asHumanOn(c, world.users.bob, "select clara.apply_coa_template($1,$2,null::text[],$3)", [soc2, starter.id, opk("m4")]);
    const r = await c.query("select count(*)::int as n from clara.coa_accounts where client_id = $1 and account_code = '3040'", [soc2]);
    return r.rows[0].n;
  });
  assert.equal(m4, 1, "M4: delete the suppression row and 3040 is planted alongside -- the mutant BITES");

  // Both rows are back after the rollbacks.
  assert.equal((await rootQuery("select count(*)::int as n from clara.coa_template_entity_overrides")).rows[0].n, 2,
    "the shipping override rows survived both mutants");
});

test("§5.3 M8 MUTANT: the drift read shares ONE spelling of the effective name -- break it and the society reports itself renamed", async (t) => {
  if (unready(t)) return;
  const soc = await newInterviewClient(world.users.alice, world.firms.A, { tag: "m8", answers: { entity_type: "society" } });
  await applyTemplate(world.users.bob, { client: soc, template: starter.id, opKey: opk("m8") });
  assert.deepEqual(await drift(world.users.bob, soc), [],
    "the freshly-applied society chart reports ZERO drift -- the instrument agrees with the writer");

  const rows = await withRolledBackTx(async (c) => {
    await c.query("set local role clara_fn_owner");
    await c.query(`create or replace function clara._coa_effective_account_name(p_template uuid, p_code text,
        p_template_name text, p_entity_type text) returns text
      language sql stable security invoker set search_path = clara, pg_temp as $mut$ select p_template_name; $mut$`);
    await c.query("reset role");
    const r = await asHumanOn(c, world.users.bob, "select * from clara.coa_template_drift($1)", [soc]);
    return r.rows;
  });
  const classes = rows.map((r) => r.drift_class);
  assert.ok(classes.includes("renamed"),
    "M8: with the indirection removed the relabelled 3900 reads `renamed` -- the mutant BITES");
  assert.ok(classes.includes("missing"),
    "...and the suppressed 3040 reads `missing`, which is the same defect seen from the other side");
  assert.deepEqual(await drift(world.users.bob, soc), [], "and the shipping read is clean again after the rollback");
});

// ===========================================================================
// §6 -- add_coa_template_family (design D-4).
// ===========================================================================

test("§6.1 the additive door plants one family and appends it to the adoption", async (t) => {
  if (unready(t)) return;
  const client = await newInterviewClient(world.users.alice, world.firms.A, { tag: "addf", answers: { entity_type: "sdn_bhd" } });
  const applied = await applyTemplate(world.users.bob, { client, template: starter.id, opKey: opk("ap") });
  assert.ok(!applied.families.includes("motor_vehicles"), "premise: the unkeyed opt_in family was not applied");
  const before = await accountCount(client);

  const res = await addFamily(world.users.bob, { client, template: starter.id, family: "motor_vehicles", opKey: opk("add") });
  assert.ok(res.accounts > 0, "the family's accounts landed");
  assert.equal(await accountCount(client) - before, res.accounts, "and the table agrees with the receipt");
  const ad = await adoptionRead(world.users.bob, client);
  assert.ok(ad.families.includes("motor_vehicles"), "the adoption row now carries the family -- attribution is not lost");
});

test("§6.2 concurrent family additions compose on the locked adoption row", async (t) => {
  if (unready(t)) return;
  const client = await newInterviewClient(world.users.alice, world.firms.A, {
    tag: "add_race", answers: { entity_type: "sdn_bhd" },
  });
  const applied = await applyTemplate(world.users.bob, {
    client, template: starter.id, opKey: opk("add-race-apply"),
  });
  const familyA = "motor_vehicles";
  const familyB = "club_subscriptions_and_entrance_fees"; // carries review witness account 6480
  assert.ok(!applied.families.includes(familyA) && !applied.families.includes(familyB),
    "premise: both opt-in families start outside the adoption");

  let t1 = null;
  let t2 = null;
  try {
    t1 = await openHumanTxn(world.users.bob);
    const first = (await t1.client.query(
      "select clara.add_coa_template_family($1,$2,$3,$4) as r",
      [client, starter.id, familyA, opk("add-race-a")],
    )).rows[0].r;
    t2 = await openHumanAutocommit(world.users.bob);
    const secondCall = t2.client.query(
      "select clara.add_coa_template_family($1,$2,$3,$4) as r",
      [client, starter.id, familyB, opk("add-race-b")],
    );

    await waitBlockedByOrThrow(t2.pid, t1.pid);
    await t1.client.query("commit");
    const second = (await secondCall).rows[0].r;
    assert.ok(first.accounts > 0 && second.accounts > 0, "both additive calls committed accounts");

    const ad = await adoptionRead(world.users.bob, client);
    assert.ok(ad.families.includes(familyA),
      "the first writer's family survives the blocked writer's later update");
    assert.ok(ad.families.includes(familyB),
      "the blocked writer's family is appended too -- no attribution is lost");
  } finally {
    await releaseSession(t1);
    await releaseSession(t2);
  }
});

test("§6.3 the additive door's named refusals", async (t) => {
  if (unready(t)) return;
  const virgin = await newInterviewClient(world.users.alice, world.firms.A, { tag: "add2", answers: { entity_type: "sdn_bhd" } });
  await expectCleanRefusal(
    virgin,
    () => addFamily(world.users.bob, {
      client: virgin, template: starter.id, family: "motor_vehicles", opKey: opk("a"),
    }),
    "not_adopted", "a client with no adoption is refused",
  );

  await applyTemplate(world.users.bob, { client: virgin, template: starter.id, opKey: opk("ap") });
  await expectCleanRefusal(
    virgin,
    () => addFamily(world.users.bob, {
      client: virgin, template: starter.id, family: "no_such", opKey: opk("b"),
    }),
    "unknown_family", "an unknown family is refused",
  );
  await expectCleanRefusal(
    virgin,
    () => addFamily(world.users.bob, {
      client: virgin, template: starter.id, family: "cash_and_bank", opKey: opk("c"),
    }),
    "family_already_applied", "a family already on the adoption is refused",
  );

  // code_already_present: plant one of the family's codes by hand first, at the SAME shape.
  const other = await newInterviewClient(world.users.alice, world.firms.A, { tag: "add3", answers: { entity_type: "sdn_bhd" } });
  await applyTemplate(world.users.bob, { client: other, template: starter.id, opKey: opk("ap2") });
  const mv = (await rootQuery(
    "select account_code, name, account_type, account_class from clara.coa_template_accounts where template_id = $1 and family_key = 'motor_vehicles' order by account_code limit 1",
    [starter.id])).rows[0];
  await humanQuery(world.users.bob,
    "select clara.upsert_account(p_client => $1, p_code => $2, p_name => $3, p_type => $4, p_special_acc_type => null, p_account_class => $5, p_op_key => $6)",
    [other, mv.account_code, mv.name, mv.account_type, mv.account_class, opk("hand")]);
  await expectCleanRefusal(
    other,
    () => addFamily(world.users.bob, {
      client: other, template: starter.id, family: "motor_vehicles", opKey: opk("d"),
    }),
    "code_already_present", "an additive door does not silently upsert over a live account",
  );

  // code_conflict: the same code at a DIFFERENT type.
  const third = await newInterviewClient(world.users.alice, world.firms.A, { tag: "add4", answers: { entity_type: "sdn_bhd" } });
  await applyTemplate(world.users.bob, { client: third, template: starter.id, opKey: opk("ap3") });
  const wrongType = mv.account_type === "asset" ? "expense" : "asset";
  await humanQuery(world.users.bob,
    "select clara.upsert_account(p_client => $1, p_code => $2, p_name => $3, p_type => $4, p_special_acc_type => null, p_account_class => null, p_op_key => $5)",
    [third, mv.account_code, "rig hand-made", wrongType, opk("hand2")]);
  await expectCleanRefusal(
    third,
    () => addFamily(world.users.bob, {
      client: third, template: starter.id, family: "motor_vehicles", opKey: opk("e"),
    }),
    "code_conflict", "a type/class collision is named BEFORE the loop starts",
  );
});

// ===========================================================================
// §7 -- coa_chart_state: the first consumer coa_seed_decision has ever had.
// ===========================================================================

test("§7.1 the five states, each CONSTRUCTED, plus the legacy answer value accepted on read", async (t) => {
  if (unready(t)) return;
  const undecided = await newInterviewClient(world.users.alice, world.firms.A, { tag: "s0" });
  assert.equal((await chartState(world.users.bob, undecided)).state, "undecided", "no decision, no adoption, empty chart");

  const pending = await newInterviewClient(world.users.alice, world.firms.A, {
    tag: "s1", answers: { coa_seed_decision: { seed: "firm_template" } } });
  const st = await chartState(world.users.bob, pending);
  assert.equal(st.state, "pending", "the decision asks for the firm template and the chart is still empty");
  assert.equal(st.seed_decision, "firm_template", "and the shipped item is read BY NAME");
  assert.equal(st.seed_wants_template, true);

  // The LEGACY value the shipped v2/v3 interview writes today.
  const legacy = await newInterviewClient(world.users.alice, world.firms.A, {
    tag: "s1b", answers: { coa_seed_decision: { seed: "lhdn_mpers_standard" } } });
  assert.equal((await chartState(world.users.bob, legacy)).state, "pending",
    "D-13 item 4: the legacy value stays ACCEPTED on read, so pre-PR-c clients do not read `undecided`");

  await applyTemplate(world.users.bob, { client: pending, template: starter.id, opKey: opk("s") });
  const after = await chartState(world.users.bob, pending);
  assert.equal(after.state, "adopted", "after the apply");
  assert.ok(after.accounts > 0 && Array.isArray(after.families), "and it carries the counts a banner renders");

  const declined = await newInterviewClient(world.users.alice, world.firms.A, {
    tag: "s2", answers: { coa_seed_decision: { seed: "manual" } } });
  assert.equal((await chartState(world.users.bob, declined)).state, "declined", "Q4's escape hatch, on the record");

  // off_standard: a chart built by hand, no adoption. buildWorld's A2 is exactly that shape.
  assert.ok(await accountCount(world.clients.A2) > 0, "premise: A2 has a hand-built chart");
  assert.equal((await chartState(world.users.bob, world.clients.A2)).state, "off_standard",
    "Q4: the client is LISTED off-standard, which is honest rather than hidden");
});

test("§7.2 manual + hand-built chart is off_standard; the old arm order hides it as declined", async (t) => {
  if (unready(t)) return;
  // 裁-23 Q4: docs/plan/active/coa-template-gate-record.md:183-186 keeps this exact population
  // visible as off-standard: the client answered no/manual and then built the chart their way.
  const client = await newInterviewClient(world.users.alice, world.firms.A, {
    tag: "manual_built", answers: { coa_seed_decision: { seed: "manual" } },
  });
  await humanQuery(world.users.bob,
    "select clara.upsert_account(p_client => $1, p_code => '8876', p_name => 'Hand-built chart', p_type => 'expense', p_special_acc_type => null, p_account_class => null, p_op_key => $2)",
    [client, opk("manual-built")]);
  assert.ok(await accountCount(client) > 0, "premise: the manual-decision client built a chart");
  assert.equal((await chartState(world.users.bob, client)).state, "off_standard",
    "the overlap population follows the positive chart predicate before the manual-only fallback");

  const src = (await rootQuery(
    "select prosrc from pg_proc where oid = 'clara.coa_chart_state(uuid)'::regprocedure")).rows[0].prosrc;
  const ruledOrder = /when ch\.accounts > 0 then 'off_standard'\s+when dec\.seed = 'manual' then 'declined'/;
  const oldOrder = `when dec.seed = 'manual' then 'declined'
      when ch.accounts > 0 then 'off_standard'`;
  assert.match(src, ruledOrder, "the LIVE body puts the positive chart read before manual");
  const mutated = await withRolledBackTx(async (c) => {
    await c.query("set local role clara_fn_owner");
    await c.query(`create or replace function clara.coa_chart_state(p_client uuid) returns jsonb
      language sql stable set search_path = clara, pg_temp as $mut$${src.replace(ruledOrder, oldOrder)}$mut$`);
    await c.query("reset role");
    const r = await asHumanOn(c, world.users.bob, "select clara.coa_chart_state($1) as s", [client]);
    return r.rows[0].s.state;
  });
  assert.equal(mutated, "declined",
    "M13: restoring the old arm order hides the ruled off-standard client -- the mutant BITES");
  assert.equal((await chartState(world.users.bob, client)).state, "off_standard",
    "the shipping read is restored after the mutant rollback");
});

test("§7.3 M7 MUTANT: dropping the legacy value from the read makes a legacy client read `undecided`", async (t) => {
  if (unready(t)) return;
  const legacy = await newInterviewClient(world.users.alice, world.firms.A, {
    tag: "m7", answers: { coa_seed_decision: { seed: "lhdn_mpers_standard" } } });
  const src = (await rootQuery(
    "select prosrc from pg_proc where oid = 'clara.coa_chart_state(uuid)'::regprocedure")).rows[0].prosrc;
  assert.ok(src.includes("'lhdn_mpers_standard'"), "the legacy value is in the LIVE body");
  const mutated = await withRolledBackTx(async (c) => {
    await c.query("set local role clara_fn_owner");
    await c.query(`create or replace function clara.coa_chart_state(p_client uuid) returns jsonb
      language sql stable set search_path = clara, pg_temp as $mut$${src.replaceAll("'lhdn_mpers_standard'", "'__never__'")}$mut$`);
    await c.query("reset role");
    const r = await asHumanOn(c, world.users.bob, "select clara.coa_chart_state($1) as s", [legacy]);
    return r.rows[0].s.state;
  });
  assert.equal(mutated, "undecided", "M7: the legacy acceptance is real behaviour, not a comment -- the mutant BITES");
  assert.equal((await chartState(world.users.bob, legacy)).state, "pending", "and the shipping read is intact");
});

// ===========================================================================
// §8 -- THE DRIFT READ (design D-11): five classes, each with a twin.
// ===========================================================================

test("§8.1 never_adopted, off_template, renamed, retyped and missing all classify", async (t) => {
  if (unready(t)) return;
  const virgin = await newInterviewClient(world.users.alice, world.firms.A, { tag: "d0" });
  assert.deepEqual((await drift(world.users.bob, virgin)).map((r) => r.drift_class), ["never_adopted"],
    "a client with no adoption is off-standard entirely");

  const client = await newInterviewClient(world.users.alice, world.firms.A, { tag: "d1", answers: { entity_type: "sdn_bhd" } });
  await applyTemplate(world.users.bob, { client, template: starter.id, opKey: opk("d") });
  assert.deepEqual(await drift(world.users.bob, client), [], "a freshly applied chart has ZERO drift");

  // off_template: a code the template version does not carry at all.
  await humanQuery(world.users.bob,
    "select clara.upsert_account(p_client => $1, p_code => '8888', p_name => 'Rig Special', p_type => 'expense', p_special_acc_type => null, p_account_class => null, p_op_key => $2)",
    [client, opk("off")]);
  // renamed: same code, different name.
  await humanQuery(world.users.bob,
    "select clara.upsert_account(p_client => $1, p_code => '1000', p_name => 'Renamed By Hand', p_type => 'asset', p_special_acc_type => null, p_account_class => null, p_op_key => $2)",
    [client, opk("ren")]);
  const rows = await drift(world.users.bob, client);
  const byClass = (k) => rows.filter((r) => r.drift_class === k);
  assert.deepEqual(byClass("off_template").map((r) => r.account_code), ["8888"], "off_template names the code");
  assert.deepEqual(byClass("renamed").map((r) => r.account_code), ["1000"], "renamed names the code");
  const ren = byClass("renamed")[0];
  assert.equal(ren.client_name, "Renamed By Hand");
  assert.ok(ren.template_name && ren.template_name !== ren.client_name, "and it shows BOTH names, so a human can judge");

  // retyped AND renamed on one code, as two independent rows.
  const retypeTarget = (await rootQuery(
    `select a.account_code from clara.coa_template_accounts a
      where a.template_id = $1 and a.account_type = 'expense' and a.special_acc_type is null
        and a.family_key = any ($2::text[])
      order by a.account_code limit 1`, [starter.id, core])).rows[0].account_code;
  await rootQuery("update clara.coa_accounts set account_type = 'asset', name = 'Retyped By Hand' where client_id = $1 and account_code = $2",
    [client, retypeTarget]);
  const rows2 = await drift(world.users.bob, client);
  const both = rows2.filter((r) => r.account_code === retypeTarget).map((r) => r.drift_class).sort();
  assert.deepEqual(both, ["renamed", "retyped"],
    "renamed and retyped are INDEPENDENT rows -- an account that is both says both");
  const rt = rows2.find((r) => r.account_code === retypeTarget && r.drift_class === "retyped");
  assert.equal(rt.client_account_type, "asset");
  assert.equal(rt.template_account_type, "expense", "and the serious class shows both types");

  // missing: an ADOPTED family whose accounts were never planted (fixture surgery on the adoption).
  const ad = (await rawAdoption(client))[0];
  const unplanted = "motor_vehicles";
  await forgeAdoptedFamilies(ad.id, [...ad.families, unplanted]);
  const rows3 = await drift(world.users.bob, client);
  const missing = rows3.filter((r) => r.drift_class === "missing");
  assert.ok(missing.length > 0, "an adopted family with no planted accounts reads `missing`");
  assert.ok(missing.every((r) => r.family_key === unplanted), "and every missing row names the family it came from");
});

test("§8.2 the drift read is RLS-scoped: firm B sees nothing of firm A's client, and firm A sees its own", async (t) => {
  if (unready(t)) return;
  const client = await newInterviewClient(world.users.alice, world.firms.A, { tag: "rls", answers: { entity_type: "sdn_bhd" } });
  await applyTemplate(world.users.bob, { client, template: starter.id, opKey: opk("r") });
  await humanQuery(world.users.bob,
    "select clara.upsert_account(p_client => $1, p_code => '8877', p_name => 'A only', p_type => 'expense', p_special_acc_type => null, p_account_class => null, p_op_key => $2)",
    [client, opk("o")]);

  // POSITIVE first: firm A's own bookkeeper DOES see the drift row. A zero-rows cell alone cannot
  // tell "isolated" from "broken".
  assert.ok((await drift(world.users.bob, client)).some((r) => r.account_code === "8877"),
    "POSITIVE: firm A sees its own client's drift");
  assert.deepEqual(await drift(world.users.dave, client), [],
    "firm B is returned ZERO rows for firm A's client -- not even never_adopted");
  assert.equal(await adoptionRead(world.users.dave, client), null, "and no adoption record");
  assert.equal((await chartState(world.users.dave, client)), null, "and no chart state");

  const bRows = await firmDrift(world.users.dave);
  assert.ok(!bRows.some((r) => r.client_id === client), "and the firm roll-up does not carry it either");
  const aRows = await firmDrift(world.users.alice);
  const mine = aRows.find((r) => r.client_id === client);
  assert.ok(mine, "POSITIVE: firm A's roll-up carries the client");
  assert.equal(mine.off_template, 1, "with the per-class count the /admin list renders");
  assert.equal(mine.adoption_state, "adopted");
});

// ===========================================================================
// §9 -- THE NEW RELATION'S POSTURE, and the two rung mutants.
// ===========================================================================

test("§9.1 coa_template_entity_overrides: forced RLS, two policies, zero write reach, platform-visible to every firm", async (t) => {
  if (unready(t)) return;
  const rel = (await rootQuery(
    `select c.relrowsecurity, c.relforcerowsecurity, pg_get_userbyid(c.relowner) as owner,
            (select count(*)::int from pg_policies p where p.schemaname='clara' and p.tablename='coa_template_entity_overrides') as policies
       from pg_class c where c.oid = 'clara.coa_template_entity_overrides'::regclass`)).rows[0];
  assert.equal(rel.relrowsecurity, true);
  assert.equal(rel.relforcerowsecurity, true, "forced, so the owner is bound too");
  assert.equal(rel.owner, "clara_fn_owner");
  assert.equal(rel.policies, 2, "owner ALL + the parent-derived human SELECT, and nothing else");

  const roles = (await rootQuery(
    "select rolname from pg_roles where rolname like 'clara\\_%' and rolname <> 'clara_fn_owner' order by 1")).rows.map((r) => r.rolname);
  for (const role of roles) {
    for (const priv of ["INSERT", "UPDATE", "DELETE", "TRUNCATE"]) {
      assert.equal(
        (await rootQuery("select has_table_privilege($1, 'clara.coa_template_entity_overrides', $2) as p", [role, priv])).rows[0].p,
        false, `${role} cannot ${priv} the override table -- it is migration-seeded DATA`);
    }
  }
  // POSITIVE visibility: the platform rows ARE returned to a bookkeeper of ANOTHER firm, because
  // the platform starter is everyone's. A leak-only cell cannot distinguish isolated from broken.
  const seenByB = await humanQuery(world.users.dave,
    "select count(*)::int as n from clara.coa_template_entity_overrides where template_id = $1", [starter.id]);
  assert.equal(seenByB.rows[0].n, 2, "POSITIVE: firm B is returned the platform template's override rows");
});

test("§9.2 M1 + M2 MUTANTS: rung 5 and rung 8 are the walls", async (t) => {
  if (unready(t)) return;
  const src = (await rootQuery("select prosrc from pg_proc where oid = $1::regprocedure", [APPLY_DOOR])).rows[0].prosrc;
  const rung5 = "if exists (select 1 from clara.coa_accounts a where a.client_id = p_client) then";
  const rung8 = "raise exception 'these families apply to every client and cannot be dropped: %', v_bad";
  assert.ok(src.includes(rung5) && src.includes(rung8), "both mutation targets are in the LIVE body");

  const replaceApply = async (c, body) => {
    await c.query("set local role clara_fn_owner");
    await c.query(`create or replace function clara.apply_coa_template(p_client uuid, p_template uuid, p_families text[], p_op_key text) returns jsonb
      language plpgsql security definer set search_path = clara, pg_temp as $mut$${body}$mut$`);
    await c.query("reset role");
  };

  // M1 -- rung 5 removed: a client with a live chart takes the standard on top.
  // The fixture carries ONE hand-made ordinary account, deliberately not a special marker: with
  // rung 5 disarmed the loop must reach the END, and a colliding `rounding` marker would make the
  // core's own uq_coa_special raise instead -- a mutant that dies on a DIFFERENT wall measures
  // that wall, not this one.
  const dirty = await newInterviewClient(world.users.alice, world.firms.A, { tag: "m1", answers: { entity_type: "sdn_bhd" } });
  await humanQuery(world.users.bob,
    "select clara.upsert_account(p_client => $1, p_code => '8811', p_name => 'Hand made', p_type => 'expense', p_special_acc_type => null, p_account_class => null, p_op_key => $2)",
    [dirty, opk("hand")]);
  assert.equal(await accountCount(dirty), 1, "premise: exactly one pre-existing account, and it carries no marker");
  await expectCleanRefusal(
    dirty,
    () => applyTemplate(world.users.bob, { client: dirty, template: starter.id, opKey: opk("m1a") }),
    "chart_not_empty", "the shipping door refuses BEFORE the mutation",
  );

  const m1 = await withRolledBackTx(async (c) => {
    await replaceApply(c, src.replace(rung5, "if false then"));
    return await raisedCode(() => asHumanOn(c, world.users.bob,
      "select clara.apply_coa_template($1,$2,null::text[],$3)", [dirty, starter.id, opk("m1")]));
  });
  assert.equal(m1, null, "M1: without rung 5 a client with a live chart takes the standard on top -- the mutant BITES");
  await expectCleanRefusal(
    dirty,
    () => applyTemplate(world.users.bob, { client: dirty, template: starter.id, opKey: opk("m1b") }),
    "chart_not_empty", "and the shipping door still refuses after the rollback",
  );
  assert.equal(await accountCount(dirty), 1, "the mutant's apply was rolled back -- nothing survived");

  // M2 -- rung 8 removed: a core family can be dropped.
  const client = await newInterviewClient(world.users.alice, world.firms.A, { tag: "m2", answers: { entity_type: "sdn_bhd" } });
  const m2 = await withRolledBackTx(async (c) => {
    await replaceApply(c, src.replace(rung8, "raise notice 'mutant: rung 8 disarmed %', v_bad"));
    return await raisedCode(() => asHumanOn(c, world.users.bob,
      "select clara.apply_coa_template($1,$2,$3::text[],$4)", [client, starter.id, core.slice(1), opk("m2")]));
  });
  assert.equal(m2, null, "M2: without rung 8 the `core` promise is not a promise -- the mutant BITES");
  await expectCleanRefusal(
    client,
    () => applyTemplate(world.users.bob, {
      client, template: starter.id, families: core.slice(1), opKey: opk("m2b"),
    }),
    "core_family_dropped", "and the shipping door still refuses after the rollback",
  );
});

test("§9.3 NULL-family MUTANT: removing the named guard and NULL filter reds §2.4", async (t) => {
  if (unready(t)) return;
  const client = await newInterviewClient(world.users.alice, world.firms.A, {
    tag: "null_mutant", answers: { entity_type: "sdn_bhd" },
  });
  const src = (await rootQuery("select prosrc from pg_proc where oid = $1::regprocedure", [APPLY_DOOR])).rows[0].prosrc;
  const guard = "if p_families is not null and array_position(p_families, null) is not null then";
  const filter = "array_agg(distinct x) filter (where x is not null)";
  assert.ok(src.includes(guard) && src.includes(filter),
    "the LIVE body carries both halves of the NULL-family defense");
  const mutantReason = await withRolledBackTx(async (c) => {
    const body = src.replace(guard, "if false then").replace(filter, "array_agg(distinct x)");
    await c.query("set local role clara_fn_owner");
    await c.query(`create or replace function clara.apply_coa_template(p_client uuid, p_template uuid,
        p_families text[], p_op_key text) returns jsonb
      language plpgsql security definer set search_path = clara, pg_temp as $mut$${body}$mut$`);
    await c.query("reset role");
    try {
      await asHumanOn(c, world.users.bob,
        "select clara.apply_coa_template($1,$2,$3::text[],$4)",
        [client, starter.id, [null], opk("null-mutant")]);
      return null;
    } catch (e) {
      try { return JSON.parse(e.detail).reason ?? `(no reason) ${e.detail}`; }
      catch { return `(unparseable) ${e.detail ?? e.message}`; }
    }
  });
  assert.notEqual(mutantReason, "family_key_null",
    "MUTANT: §2.4 would red because the malformed list no longer gets its named refusal");
  await expectCleanRefusal(
    client,
    () => applyTemplate(world.users.bob, { client, template: starter.id, families: [null], opKey: opk("null-live") }),
    "family_key_null", "the shipping NULL-family wall is restored after rollback",
  );
});

test("§9.4 request-hash MUTANT: restoring NULL/[] collision replays the wrong success", async (t) => {
  if (unready(t)) return;
  const client = await newInterviewClient(world.users.alice, world.firms.A, {
    tag: "hash_mutant", answers: { entity_type: "sdn_bhd" },
  });
  const src = (await rootQuery("select prosrc from pg_proc where oid = $1::regprocedure", [APPLY_DOOR])).rows[0].prosrc;
  const fixed = `case when p_families is null then '"plan"'::jsonb
                else coalesce((select jsonb_agg(distinct x order by x)
                                 from unnest(p_families) x), '[]'::jsonb) end`;
  const old = `case when p_families is null then null
                else (select jsonb_agg(x order by x) from unnest(p_families) x) end`;
  assert.ok(src.includes(fixed), "the LIVE body hashes caller mode distinctly from plan mode");
  const replayed = await withRolledBackTx(async (c) => {
    await c.query("set local role clara_fn_owner");
    await c.query(`create or replace function clara.apply_coa_template(p_client uuid, p_template uuid,
        p_families text[], p_op_key text) returns jsonb
      language plpgsql security definer set search_path = clara, pg_temp as $mut$${src.replace(fixed, old)}$mut$`);
    await c.query("reset role");
    const key = opk("hash-mutant");
    const first = await asHumanOn(c, world.users.bob,
      "select clara.apply_coa_template($1,$2,null::text[],$3) as r", [client, starter.id, key]);
    const second = await asHumanOn(c, world.users.bob,
      "select clara.apply_coa_template($1,$2,'{}'::text[],$3) as r", [client, starter.id, key]);
    return { first: first.rows[0].r, second: second.rows[0].r };
  });
  assert.deepEqual(replayed.second, replayed.first,
    "MUTANT: the explicit empty caller list replays the plan success -- §2.8 would red");
  assert.equal((await rawAdoption(client)).length, 0, "the request-hash mutant was rolled back");
});

test("§9.5 refusal-ledger MUTANT: a post-write fake refusal is caught by all-five-ledger accounting", async (t) => {
  if (unready(t)) return;
  const client = await newInterviewClient(world.users.alice, world.firms.A, {
    tag: "ledger_mutant", answers: { entity_type: "sdn_bhd" },
  });
  await assert.rejects(
    () => expectCleanRefusal(
      client,
      async () => {
        await applyTemplate(world.users.bob, {
          client, template: starter.id, opKey: opk("ledger-mutant"),
        });
        const fake = new Error("mutant: caller receives a refusal after durable writes");
        fake.code = CLR.badRequest;
        fake.detail = JSON.stringify({ reason: "synthetic_post_write_refusal" });
        throw fake;
      },
      "synthetic_post_write_refusal",
      "the mutant must not pass as a clean refusal",
    ),
    /refusal changed accounts\/adoptions\/op_receipts\/audit_log\/domain_events/,
    "M12: any durable write makes the five-ledger clean-refusal assertion itself go RED",
  );
});
