// Wave-B battery — Block O lifecycle (O1 status swap · O3 birth · O4 commit/
// cancel · O5 plan object · O6 origin swap · O7 create_firm receipt wrap).
// CONTRACT-BLIND: cut from the 0017 pin set alone; FAILS (never skips) below
// 0017. Serial discipline: node --test --test-concurrency=1.
// [AMB-11] the commit "opening position" attestations (first_year_zero_opening /
// carry_down_deferred) have no pinned mechanism — encoded as plan items with
// those item_keys (deferred/resolved states). Adjudication requested.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  CLR, CLR26, PG, ROLES, rootQuery, humanQuery, roleQuery, opk,
  assertRaises, assertRaisesOneOf, endPool, printLaneNotes,
  fail0017, wbEnsureReady, fnExists,
  beginOnboarding, commitOnboarding, cancelOnboarding, updatePlan, resolvePlanItem,
  planRow, planItemRows, planRevisionRows, clientRow, admissionRow, eventsOf,
  seedAdmission, insertUser, draftEntryV3, approveEntry, freshResolution,
  buildWaveBWorld, onboardingClient, planRevision, WB_COA,
} from "./wb-fixtures.mjs";
import { truncateGuardError } from "../rig-txn.mjs";

let live = false;
let w = null;

before(async () => {
  live = await wbEnsureReady();
  if (live) w = await buildWaveBWorld();
});
after(async () => { printLaneNotes("wb-o-lifecycle"); await endPool(); });

test("META: 0017 applied — O-block marker objects present", async () => {
  fail0017(live);
  const mig = await rootQuery("select version from clara.schema_migrations where version ~ '^0017_'");
  assert.equal(mig.rows.length, 1, `exactly one applied 0017_* migration (got ${mig.rows.map((x) => x.version).join(",")})`);
  for (const fn of ["begin_client_onboarding", "commit_client_onboarding", "cancel_client_onboarding", "update_onboarding_plan", "resolve_onboarding_plan_item"]) {
    assert.ok(await fnExists(fn), `clara.${fn} exists`);
  }
});

test("O1: clients_status_check_0017 is NAMED and admits 'onboarding'; a bogus status still 23514s", async () => {
  fail0017(live);
  const def = (await rootQuery(
    "select pg_get_constraintdef(c.oid) as d from pg_constraint c join pg_class t on t.oid=c.conrelid join pg_namespace n on n.oid=t.relnamespace where n.nspname='clara' and t.relname='clients' and c.conname='clients_status_check_0017'",
  )).rows[0]?.d;
  assert.ok(def, "clients_status_check_0017 exists (the find-by-definition swap re-added NAMED)");
  for (const v of ["active", "archived", "onboarding"]) assert.ok(def.includes(`'${v}'`), `constraintdef admits '${v}'`);
  await assertRaises(PG.checkViolation, () => rootQuery(
    "insert into clara.clients(firm_id, name, status) values ($1, $2, 'bogus')",
    [w.firms.A, `wb_bogus_${opk("x")}`]), "status 'bogus'");
});

test("O3: begin_client_onboarding births client(status=onboarding) + plan in ONE txn; event emitted", async () => {
  fail0017(live);
  const { client, plan } = await onboardingClient(w.users.hana);
  const c = await clientRow(client);
  assert.equal(c.status, "onboarding", "client born with status='onboarding'");
  const p = await planRow(plan);
  assert.equal(p.scope_kind, "client", "plan scope_kind='client'");
  assert.equal(p.client_id, client, "plan bound to the client");
  assert.equal(p.state, "open", "plan state='open'");
  assert.ok(p.revision_token, "plan carries a revision_token");
  const evs = await eventsOf(w.firms.A, "client.onboarding_started", client);
  assert.equal(evs.length, 1, "client.onboarding_started emitted once");
});

test("O3: the admin+ floor — a bookkeeper cannot begin onboarding (CLR04)", async () => {
  fail0017(live);
  await assertRaises(CLR.authz, () => beginOnboarding(w.users.bob, { name: `wb_floor_${opk("x")}` }), "bookkeeper birth");
});

test("O3: null op_key refused (G4); duplicate firm name maps to the create_client refusal", async () => {
  fail0017(live);
  await assertRaises(CLR.badRequest, () => humanQuery(w.users.hana,
    "select clara.begin_client_onboarding(p_name => $1, p_op_key => null) as r", [`wb_nok_${opk("x")}`]), "null op_key");
  const name = `wb_dup_${opk("x")}`;
  await onboardingClient(w.users.hana, name);
  await assertRaisesOneOf([CLR.badRequest, PG.uniqueViolation],
    () => beginOnboarding(w.users.hana, { name }), "duplicate name (uq_clients_firm_name mapped)");
});

test("O3: same-op_key retry replays the receipt byte-identically (one client born)", async () => {
  fail0017(live);
  const name = `wb_replay_${opk("x")}`;
  const key = opk("onbr");
  const r1 = await beginOnboarding(w.users.hana, { name, opKey: key });
  const r2 = await beginOnboarding(w.users.hana, { name, opKey: key });
  assert.equal(JSON.stringify(r1), JSON.stringify(r2), "receipt replayed byte-identically");
  const n = await rootQuery("select count(*)::int as n from clara.clients where firm_id=$1 and lower(name)=lower($2)", [w.firms.A, name]);
  assert.equal(n.rows[0].n, 1, "exactly one client row");
});

test("O4: commit refuses an unresolved required_for_commit must-ask (must-asks block ONLY the commit)", async () => {
  fail0017(live);
  const { client, plan, revision } = await onboardingClient(w.users.hana);
  await updatePlan({
    plan, expectedRevision: revision, answeredBy: w.users.bob,
    items: [{ item_kind: "must_ask", item_key: "financial_year_end", question: "FYE?", required_for_commit: true }],
  });
  await assertRaises(CLR.badRequest, async () => commitOnboarding(w.users.alice, {
    client, plan, expectedPlanRevision: await planRevision(plan),
  }), "commit with pending must-ask");
});

test("O4: commit refuses a STALE plan revision (CAS) [AMB-9: encoded CLR06]", async () => {
  fail0017(live);
  const { client, plan, revision } = await onboardingClient(w.users.hana);
  await updatePlan({ plan, expectedRevision: revision, answeredBy: w.users.bob, items: [] });
  // ADJUDICATED AMB-9: the plan-CAS class is exactly CLR06.
  await assertRaises(CLR.revision, async () => commitOnboarding(w.users.alice, {
    client, plan, expectedPlanRevision: revision, // rotated by the update above
  }), "stale plan revision");
});

test("O4: commit refuses with NO opening position (no registry, no attestation, no deferral)", async () => {
  fail0017(live);
  const { client, plan } = await onboardingClient(w.users.hana);
  await assertRaises(CLR.badRequest, async () => commitOnboarding(w.users.alice, {
    client, plan, expectedPlanRevision: await planRevision(plan),
  }), "commit without an opening position");
});

test("O4: commit via the carry_down_deferred item flips onboarding→active EXACTLY here; re-commit refuses [AMB-11]", async () => {
  fail0017(live);
  const { client, plan, revision } = await onboardingClient(w.users.hana);
  await updatePlan({
    plan, expectedRevision: revision, answeredBy: w.users.bob,
    items: [{ item_kind: "todo", item_key: "carry_down_deferred", state: "deferred" }],
  });
  const r = await commitOnboarding(w.users.alice, { client, plan, expectedPlanRevision: await planRevision(plan) });
  assert.ok(r, "commit returns a receipt");
  assert.equal((await clientRow(client)).status, "active", "client flipped to active");
  assert.equal((await planRow(plan)).state, "committed", "plan committed");
  assert.equal((await eventsOf(w.firms.A, "client.activated", client)).length, 1, "client.activated emitted once");
  await assertRaises(CLR.badRequest, async () => commitOnboarding(w.users.alice, {
    client, plan, expectedPlanRevision: await planRevision(plan), opKey: opk("re"),
  }), "commit on an already-active client");
});

test("O4: commit is human-lane ONLY — runtime holds no EXECUTE (42501)", async () => {
  fail0017(live);
  const { client, plan } = await onboardingClient(w.users.hana);
  await assertRaises(PG.insufficientPrivilege, async () => roleQuery(ROLES.runtime,
    "select clara.commit_client_onboarding(p_client => $1, p_plan => $2, p_expected_plan_revision => $3, p_op_key => $4) as r",
    [client, plan, await planRevision(plan), opk("rt")]), "runtime commit");
});

test("O4: cancel is server-cancel — plan cancelled, client archived, every row left in place", async () => {
  fail0017(live);
  const { client, plan } = await onboardingClient(w.users.hana);
  await cancelOnboarding(w.users.hana, { client, plan, reason: "wrong entity" });
  assert.equal((await planRow(plan)).state, "cancelled", "plan cancelled");
  const c = await clientRow(client);
  assert.equal(c.status, "archived", "client archived (never was operational)");
  assert.ok(c.id, "reverse-not-delete: the client row remains");
});

test("O5: plan CAS — a stale expectedRevision is a typed refusal; the token rotates per write [AMB-9]", async () => {
  fail0017(live);
  const { plan, revision } = await onboardingClient(w.users.hana);
  await updatePlan({ plan, expectedRevision: revision, answeredBy: w.users.bob,
    items: [{ item_kind: "capture", item_key: "bank_list", question: "banks?" }] });
  const p = await planRow(plan);
  assert.notEqual(p.revision_token, revision, "revision_token rotated by the write");
  assert.ok(p.revision_n >= 2, "revision_n incremented");
  // ADJUDICATED AMB-9: the plan-CAS class is exactly CLR06.
  await assertRaises(CLR.revision, () => updatePlan({
    plan, expectedRevision: revision, answeredBy: w.users.bob, items: [],
  }), "stale plan write (the >=48h-park gate)");
});

test("O5: p_answered_by is validated — viewer refused, cross-firm refused, bookkeeper ok", async () => {
  fail0017(live);
  const { plan } = await onboardingClient(w.users.hana);
  await assertRaises(CLR.authz, () => (async () => updatePlan({
    plan, expectedRevision: await planRevision(plan), answeredBy: w.users.carol,
    items: [{ item_kind: "capture", item_key: "x1" }],
  }))(), "viewer attribution");
  await assertRaisesOneOf([CLR.authz, CLR.notFound], () => (async () => updatePlan({
    plan, expectedRevision: await planRevision(plan), answeredBy: w.users.dave,
    items: [{ item_kind: "capture", item_key: "x2" }],
  }))(), "cross-firm attribution");
  const r = await updatePlan({
    plan, expectedRevision: await planRevision(plan), answeredBy: w.users.bob,
    items: [{ item_kind: "capture", item_key: "x3" }],
  });
  assert.ok(r, "bookkeeper attribution accepted");
  const items = await planItemRows(plan);
  assert.ok(items.some((i) => i.item_key === "x3"), "item landed");
});

test("O5: onboarding_plan_revisions is append-only and captures a post-image per write", async () => {
  fail0017(live);
  const { plan, revision } = await onboardingClient(w.users.hana);
  const before0 = (await planRevisionRows(plan)).length;
  await updatePlan({ plan, expectedRevision: revision, answeredBy: w.users.bob,
    items: [{ item_kind: "todo", item_key: "psr_fixture" }] });
  const revs = await planRevisionRows(plan);
  assert.equal(revs.length, before0 + 1, "one revision appended per plan write");
  assert.ok(revs[revs.length - 1].snapshot, "revision carries the post-image snapshot");
  const target = revs[revs.length - 1];
  const upd = await rootQuery("update clara.onboarding_plan_revisions set revision_n = revision_n where id=$1", [target.id]).then(() => null, (e) => e);
  assert.ok(upd, "UPDATE on a plan revision is refused (append-only trigger)");
  assert.equal(upd.code, CLR.immutable, `append-only guard is CLR08 (got ${upd?.code})`);
  const terr = await truncateGuardError("truncate clara.onboarding_plan_revisions cascade");
  assert.ok(terr, "TRUNCATE refused");
  assert.equal(terr.code, CLR.immutable, "TRUNCATE guard is CLR08");
});

test("O5: resolve_onboarding_plan_item — bookkeeper resolves; viewer floored (CLR04)", async () => {
  fail0017(live);
  const { plan, revision } = await onboardingClient(w.users.hana);
  await updatePlan({ plan, expectedRevision: revision, answeredBy: w.users.bob,
    items: [{ item_kind: "must_ask", item_key: "fye", question: "FYE?", required_for_commit: true }] });
  await assertRaises(CLR.authz, () => resolvePlanItem(w.users.carol, { plan, itemKey: "fye" }), "viewer resolve");
  await resolvePlanItem(w.users.bob, { plan, itemKey: "fye", resolution: "31 Dec" });
  const item = (await planItemRows(plan)).find((i) => i.item_key === "fye");
  assert.equal(item.state, "resolved", "item resolved via the workbench verb");
});

test("O6: origin CHECK admits RESERVED 'onboarding'; _open_question_core stays UNWIDENED (CLR10)", async () => {
  fail0017(live);
  const def = (await rootQuery(
    "select pg_get_constraintdef(c.oid) as d from pg_constraint c join pg_class t on t.oid=c.conrelid join pg_namespace n on n.oid=t.relnamespace where n.nspname='clara' and t.relname='open_questions' and c.conname='open_questions_origin_check_0017'",
  )).rows[0]?.d;
  assert.ok(def, "open_questions_origin_check_0017 exists (dropped BY NAME, re-added)");
  assert.ok(def.includes("'onboarding'"), "the CHECK admits 'onboarding'");
  await assertRaises(CLR.badRequest, () => rootQuery(
    `select clara._open_question_core(p_actor => $1, p_firm => $2, p_obo => null,
       p_wake_kind => null, p_opener_kind => 'human', p_client => $3,
       p_scope_kind => 'client', p_scope_id => $3, p_question => 'core probe?',
       p_origin => 'onboarding')`,
    [w.users.alice, w.firms.A, w.clients.A1]), "the core's inline whitelist is NOT widened");
});

test("O6/FORK-2: an 'onboarding'-origin question, if written, BLOCKS coding (NOT in the rule_proposal exclusion)", async () => {
  fail0017(live);
  const qid = (await rootQuery(
    `insert into clara.open_questions(firm_id, client_id, scope_kind, scope_id, origin,
       question_text, status, opener_kind, opened_by)
     values ($1, $2, 'client', $2, 'onboarding', 'wb reserved-origin probe?', 'open', 'human', $3)
     returning id`,
    [w.firms.A, w.clients.A1, w.users.alice])).rows[0].id;
  try {
    // O6 leaves _open_question_blocks and the carried approval boundary
    // unchanged: drafts remain dry-run state; coding authority is refused.
    const d = await draftEntryV3(w.users.alice, {
      client: w.clients.A1, resolution: freshResolution(w.users.alice, w.clients.A1),
      lines: [
        { account_code: WB_COA.cash, debit_cents: 700, credit_cents: 0 },
        { account_code: WB_COA.sales, debit_cents: 0, credit_cents: 700 },
      ],
      opKey: opk("blk"),
    });
    await assertRaises(CLR26, () => approveEntry(w.users.bob, {
      entry: d.entry_id, expectedRevision: d.revision_token, opKey: opk("blka"),
    }), "approve under an open onboarding-origin question");
  } finally {
    await rootQuery(
      "update clara.open_questions set status='dismissed', resolved_by=$2, resolved_at=now(), resolution_text='wb probe done' where id=$1",
      [qid, w.users.alice]);
  }
});

test("O7: create_firm token-receipt wrap — same-op retry replays byte-identically; mismatch stays CLR04", async () => {
  fail0017(live);
  const sub = await insertUser(w.prefix, "o7owner");
  const token = await seedAdmission("wb O7 wrap");
  const key = opk("firmwrap");
  const name = `${w.prefix}_o7firm`;
  const call = (k) => humanQuery(sub,
    "select clara.create_firm(p_name => $1, p_admission_token => $2, p_op_key => $3) as r",
    [name, token, k]);
  const r1 = (await call(key)).rows[0].r;
  const r2 = (await call(key)).rows[0].r;
  assert.equal(JSON.stringify(r1), JSON.stringify(r2), "the durable commit step replays byte-identically");
  const firms = await rootQuery("select count(*)::int as n from clara.firms where name=$1", [name]);
  assert.equal(firms.rows[0].n, 1, "the token never double-consumes (one firm)");
  const adm = await admissionRow(token);
  assert.equal(adm.consumed_op_key, key, "consumed_op_key stamped on the token row");
  assert.equal(JSON.stringify(adm.consumed_result), JSON.stringify(r1), "consumed_result carries the exact receipt");
  const err = await assertRaises(CLR.authz, () => call(opk("firmwrap2")), "different op_key on a consumed token");
  assert.match(err.message, /invalid or consumed admission token/, "CLR04 text unchanged");
});
