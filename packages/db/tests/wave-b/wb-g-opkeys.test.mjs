// Wave-B battery — [R2-F8] the G4 op-key hash law, PER WRITER, with the writer
// set DERIVED from the catalog (every 0017-family fn whose body invokes
// _reserve_op) — a fixture or an AUDITED EXEMPTION per writer, never a hand
// list. A writer that skips reservation, or a new writer without coverage,
// turns this file red. CONTRACT-BLIND (SQL unread; prosrc is catalog data).

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  CLR, rootQuery, humanQuery, opk,
  assertRaises, endPool, printLaneNotes,
  fail0017, wbEnsureReady, WB_FN_FAMILY_RE, WB_COA,
  buildWaveBWorld, onboardingClient, seedOpeningCoa, planRevision,
  beginOnboarding, createOpeningSeed, recordOpeningTarget, draftOpeningItem,
  publishWikiPage, setWikiHold, clearWikiHold, retireWikiPage, recordWikiIngest, markStale,
  createSeedingBatch, tickProposal, declineProposal, completeSeedingBatch, cancelSeedingBatch,
  updatePlan, resolvePlanItem, commitOnboarding, cancelOnboarding,
  filedDocument, setDocumentKind, keyedRes, recordOpeningKeyedResolution, proposalRows, pageRow,
} from "./wb-fixtures.mjs";

let live = false;
let w = null;

/** AUDITED EXEMPTIONS — each names WHERE its hash/replay discipline is proven
 *  behaviorally instead (the memo's alternative to a fixture). */
const EXEMPT = {
  approve_opening_seed: "K5 ceremony — byte-replay + registry_not_open + race proven in wb-k-approval",
  approve_opening_correction: "K6 ceremony — proven in wb-k-supersede-fa + wb-r1 [R1-F12]",
  supersede_opening_item: "K6 pair-drafter — replacement-shape + re-supersede refusals in wb-k-supersede-fa/wb-r1",
  reopen_opening_seed: "B-12 verb — evented flip + K1-unique retention proven in wb-k-supersede-fa",
  cancel_opening_seed: "AMB-6 verb — cancel-frees-slot + replay lane proven in wb-k-registry",
  seed_fixed_asset: "FA writer — refusal ladder + one-call atomicity proven in wb-k-supersede-fa/wb-r1",
  record_opening_targets_parsed: "relay-idiom writer — seq-embedded exactly-once (wb-w-pack W4) + fact binding (wb-r2 [R2-F1])",
  resolve_lint_finding: "fixture cost: needs a broken-tie finding per probe; conclusion/floor/replay discipline in wb-l-lint — flagged for round 3 if demanded",
  create_firm: "the documented O7 exception — the receipt lives on the token row; byte-replay proven in wb-o-lifecycle",
  run_client_lint: "L3 law: op_key validated + audited, NOT op_receipts-reserved (never raises)",
  run_lint_all: "L3 wrapper — same never-raise receipt law",
};

before(async () => {
  live = await wbEnsureReady();
  if (live) w = await buildWaveBWorld();
});
after(async () => { printLaneNotes("wb-g-opkeys"); await endPool(); });

test("META: 0017 applied", async () => {
  fail0017(live);
  assert.ok(w, "world built");
});

test("G4/[R2-F8]: EVERY catalog writer invoking _reserve_op has a mutation fixture or an audited exemption — and each fixture refuses", async () => {
  fail0017(live);
  // ---- the DERIVED writer set — [R3 repair, memo 6b]: derived from GRANTS +
  // name shape, INDEPENDENT of _reserve_op presence, so a writer that DROPS
  // its reservation FAILS the law below instead of vanishing from coverage.
  const writers = (await rootQuery(
    `select distinct p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='clara' and p.proname ~ $1
        and p.proname !~ '^(get_|list_|trial_balance)'
        and exists (select 1 from aclexplode(coalesce(p.proacl,'{}'::aclitem[])) a
                     join pg_roles g on g.oid=a.grantee
                    where g.rolname in ('clara_authenticated','clara_runtime')
                      and a.privilege_type='EXECUTE') order by 1`,
    [WB_FN_FAMILY_RE])).rows.map((x) => x.proname);
  assert.ok(writers.length >= 15, `the grant-derived writer inventory populated (got ${writers.length})`);
  const reserving = new Set((await rootQuery(
    `select distinct p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='clara' and p.proname ~ $1 and p.prosrc like '%\\_reserve\\_op%'`,
    [WB_FN_FAMILY_RE])).rows.map((x) => x.proname));
  /** Writers lawfully OUTSIDE the _reserve_op discipline (each cites its law). */
  const RESERVE_LAW_EXEMPT = new Set([
    "run_client_lint", "run_lint_all", // L3: op_key validated + audited, NOT op_receipts-reserved
  ]);
  const droppedReservation = writers.filter((fn) => !RESERVE_LAW_EXEMPT.has(fn) && !reserving.has(fn));
  assert.equal(droppedReservation.length, 0,
    `granted writers whose bodies no longer invoke _reserve_op (the vanishing-coverage hazard): ${droppedReservation.join(",")}`);
  const derived = writers;
  // ---- fixtures ------------------------------------------------------------
  const oSeed = await onboardingClient(w.users.hana);
  await seedOpeningCoa(w.users.alice, oSeed.client);
  const g4seedR = await createOpeningSeed(w.users.bob, { client: oSeed.client, plan: oSeed.plan });
  const g4seed = g4seedR.seed_id ?? g4seedR.id; // NO tie document — the keyed lane is lawful here
  // [AMB-0018-1] the keyed draft_opening_item fixture rides a SEED-BOUND resolution (WB-R24(i)).
  const g4res = await keyedRes(w.users.bob, { client: oSeed.client, seed: g4seed });
  // [AMB-0018-5] a DEDICATED keyed seed for the new record_opening_keyed_resolution
  // writer fixture (kept off g4seed so its mint never supersedes g4res).
  const oOkr = await onboardingClient(w.users.hana);
  const okrSeedR = await createOpeningSeed(w.users.bob, { client: oOkr.client, plan: oOkr.plan });
  const okrSeed = okrSeedR.seed_id ?? okrSeedR.id;
  const oFresh = await onboardingClient(w.users.hana);
  const oPlan = await onboardingClient(w.users.hana);
  await updatePlan({ plan: oPlan.plan, expectedRevision: oPlan.revision, answeredBy: w.users.bob,
    items: [{ item_kind: "capture", item_key: "g4item", question: "g4?" }] });
  const planRev = await planRevision(oPlan.plan);
  const glBatch = async () => {
    const o = await onboardingClient(w.users.hana);
    const d = await filedDocument(w.users.alice, { firm: w.firms.A, client: o.client, kind: null });
    await setDocumentKind(w.users.alice, { document: d.documentId, kind: "prior_gl", reason: "g4" });
    const b = await createSeedingBatch({ client: o.client, document: d.documentId, proposals: [
      { proposal_kind: "wiki_fact", proposal_key: "wf:a", payload: { slug: "profile", fact: "a" }, evidence: {} },
      { proposal_kind: "wiki_fact", proposal_key: "wf:b", payload: { slug: "profile", fact: "b" }, evidence: {} },
      { proposal_kind: "wiki_fact", proposal_key: "wf:c", payload: { slug: "profile", fact: "c" }, evidence: {} },
      { proposal_kind: "wiki_fact", proposal_key: "wf:d", payload: { slug: "profile", fact: "d" }, evidence: {} },
    ], opKey: opk("gb") });
    return { client: o.client, doc: d, batch: b.batch_id ?? b.id };
  };
  const b1 = await glBatch(); // tick/decline pairs + complete
  // [0020 A6] record_wiki_source_ingest REFUSES a non-null p_note, so the note can no longer be
  // the field this law moves. The op hash covers (client, document, note); the DOCUMENT moves
  // instead — two verified, actively-filed sources on the same client.
  const g4ingA = await filedDocument(w.users.alice, { firm: w.firms.A, client: b1.client, kind: "invoice" });
  const g4ingB = await filedDocument(w.users.alice, { firm: w.firms.A, client: b1.client, kind: "invoice" });
  const b2 = await glBatch(); // complete pair
  const b3 = await glBatch(); // cancel pair
  const b4 = await glBatch(); // cancel pair
  const p1 = await proposalRows(b1.batch);
  // R2 reconcile: a DEDICATED, correctly-paired source with NO open batch — the
  // earlier row borrowed b1's doc under oSeed.client, and the CLR02 it drew was
  // CORRECT impl behavior (cross-client source), not a hash failure. Fixture
  // defect acknowledged; the dispute resolved in the impl's favor.
  const gsrcClient = (await onboardingClient(w.users.hana)).client;
  const gsrcDoc = await filedDocument(w.users.alice, { firm: w.firms.A, client: gsrcClient, kind: null });
  await setDocumentKind(w.users.alice, { document: gsrcDoc.documentId, kind: "prior_gl", reason: "g4src" });
  for (const slug of ["g4r1", "g4r2"]) {
    await publishWikiPage({ client: w.clients.A1, firm: w.firms.A, slug, title: slug, content: `# ${slug}` });
  }
  // [0019 §3] the stale writer's G4 pair: TWO actively-filed A1 documents, so the
  // mutated field is a real semantic arg (p_document) rather than p_reason —
  // which is a single-valued validated set (§3) and would refuse on its own
  // merits before ever reaching the _reserve_op hash comparison.
  const g4staleA = await filedDocument(w.users.alice, { firm: w.firms.A, client: w.clients.A1, kind: "invoice" });
  const g4staleB = await filedDocument(w.users.alice, { firm: w.firms.A, client: w.clients.A1, kind: "invoice" });
  await setWikiHold({ client: w.clients.A2, reason: "g4 pair" });
  const commitReady = async () => {
    const o = await onboardingClient(w.users.hana);
    await updatePlan({ plan: o.plan, expectedRevision: o.revision, answeredBy: w.users.bob,
      items: [{ item_kind: "todo", item_key: "carry_down_deferred", state: "deferred" }] });
    return { ...o, rev: await planRevision(o.plan) };
  };
  const cm1 = await commitReady(); const cm2 = await commitReady();
  const cx1 = await onboardingClient(w.users.hana); const cx2 = await onboardingClient(w.users.hana);
  // [R3-F2/F5] pre-0017-shaped ACTIVE planless clients for the bootstrap pair.
  const preA = (await rootQuery("insert into clara.clients(firm_id, name, status) values ($1,$2,'active') returning id",
    [w.firms.A, `g4pre_a_${opk("x")}`])).rows[0].id;
  const preB = (await rootQuery("insert into clara.clients(firm_id, name, status) values ($1,$2,'active') returning id",
    [w.firms.A, `g4pre_b_${opk("x")}`])).rows[0].id;
  // ---- the per-writer mutation table (same op_key, ONE semantic field moved)
  const table = {
    begin_client_onboarding: (k, v) => beginOnboarding(w.users.hana, { name: `wb_g4_${v}_${k.slice(-6)}`, opKey: k }),
    create_opening_seed: (k, v) => createOpeningSeed(w.users.bob, {
      client: oFresh.client, plan: oFresh.plan, asOf: v === "a" ? "2026-01-01" : "2026-02-01", opKey: k }),
    record_opening_target: (k, v) => recordOpeningTarget(w.users.bob, { seed: g4seed, line: {
      line_key: "g4", account_code: WB_COA.cash, source_label: "g4",
      debit_cents: v === "a" ? 100 : 200, credit_cents: 0,
      provenance_kind: "keyed", entered_by: w.users.bob }, opKey: k }),
    draft_opening_item: (k, v) => draftOpeningItem(w.users.bob, {
      client: oSeed.client, seed: g4seed, resolution: g4res,
      item: { item_kind: "gl_balance", item_key: `g4:${v}` },
      lines: [{ account_code: WB_COA.cash, debit_cents: 500, credit_cents: 0 }], opKey: k }),
    // [AMB-0018-5] the subject-bound keyed-resolution mint — hash covers the
    // evidence, so a same-key mutated payload refuses CLR10 at _reserve_op.
    record_opening_keyed_resolution: (k, v) => recordOpeningKeyedResolution(w.users.bob, {
      client: oOkr.client, seed: okrSeed, evidence: { g4: v }, opKey: k }),
    publish_wiki_page_version: (k, v) => publishWikiPage({
      client: w.clients.A1, firm: w.firms.A, slug: "g4hash", title: "G4", content: `# g4 ${v}`, opKey: k }),
    set_wiki_synthesis_hold: (k, v) => setWikiHold({ client: w.clients.A1, reason: `g4 ${v}`, opKey: k }),
    clear_wiki_synthesis_hold: (k, v) => clearWikiHold({ client: v === "a" ? w.clients.A1 : w.clients.A2, opKey: k }),
    retire_wiki_page: async (k, v) => retireWikiPage(w.users.bob, {
      page: (await pageRow(w.clients.A1, v === "a" ? "g4r1" : "g4r2")).id, reason: "g4", opKey: k }),
    record_wiki_source_ingest: (k, v) => recordWikiIngest({ client: b1.client, document: (v === "a" ? g4ingA : g4ingB).documentId, opKey: k }),
    mark_wiki_citations_stale: (k, v) => markStale({
      client: w.clients.A1, document: (v === "a" ? g4staleA : g4staleB).documentId, opKey: k }),
    create_seeding_batch: (k, v) => createSeedingBatch({
      client: gsrcClient, document: gsrcDoc.documentId,
      proposals: [{ proposal_kind: "wiki_fact", proposal_key: "wf:g4", payload: { slug: "profile", fact: v }, evidence: {} }],
      opKey: k }),
    tick_seeding_proposal: (k, v) => tickProposal(w.users.hana, { proposal: p1[v === "a" ? 0 : 1].id, opKey: k }),
    decline_seeding_proposal: (k, v) => declineProposal(w.users.hana, { proposal: p1[v === "a" ? 2 : 3].id, opKey: k }),
    complete_seeding_batch: (k, v) => completeSeedingBatch(w.users.hana, { batch: v === "a" ? b1.batch : b2.batch, opKey: k }),
    cancel_seeding_batch: (k, v) => cancelSeedingBatch(w.users.hana, { batch: v === "a" ? b3.batch : b4.batch, opKey: k }),
    update_onboarding_plan: (k, v) => updatePlan({ plan: oPlan.plan, expectedRevision: planRev,
      items: [{ item_kind: "todo", item_key: `g4_${v}` }], answeredBy: w.users.bob, opKey: k }),
    resolve_onboarding_plan_item: (k, v) => resolvePlanItem(w.users.bob, {
      plan: oPlan.plan, itemKey: "g4item", resolution: `g4 ${v}`, opKey: k }),
    commit_client_onboarding: (k, v) => commitOnboarding(w.users.alice, {
      client: (v === "a" ? cm1 : cm2).client, plan: (v === "a" ? cm1 : cm2).plan,
      expectedPlanRevision: (v === "a" ? cm1 : cm2).rev, opKey: k }),
    cancel_client_onboarding: (k, v) => cancelOnboarding(w.users.hana, {
      client: (v === "a" ? cx1 : cx2).client, plan: (v === "a" ? cx1 : cx2).plan, reason: "g4", opKey: k }),
    create_client: (k, v) => humanQuery(w.users.alice,
      "select clara.create_client(p_name => $1, p_op_key => $2) as r", [`g4cc_${v}_${k.slice(-6)}`, k]),
    bootstrap_client_plan: (k, v) => humanQuery(w.users.hana,
      "select clara.bootstrap_client_plan(p_client => $1, p_op_key => $2) as r", [v === "a" ? preA : preB, k]),
  };
  // ---- coverage over the GRANT-DERIVED inventory (end-to-end independent of
  // _reserve_op presence — a writer deleting its reservation FAILS the law
  // assert above and can never vanish from this coverage set) ----------------
  const uncovered = derived.filter((fn) => !(fn in table) && !(fn in EXEMPT));
  assert.equal(uncovered.length, 0,
    `granted writers with NEITHER a fixture NOR an audited exemption: ${uncovered.join(",")}`);
  const stale = Object.keys(table).filter((fn) => !derived.includes(fn));
  assert.equal(stale.length, 0, `table fixtures for fns outside the granted inventory: ${stale.join(",")}`);
  // ---- the law, per writer: same key + mutated payload REFUSES CLR10 --------
  for (const [name, call] of Object.entries(table)) {
    const key = opk("g4h");
    await call(key, "a");
    await assertRaises(CLR.badRequest, () => call(key, "b"),
      `${name}: same op_key + mutated payload must refuse (the _reserve_op hash law)`);
  }
});
