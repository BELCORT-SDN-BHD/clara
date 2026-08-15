// Wave E lane eta, the B4 follow-up — maker/checker measured against the DIRECTING human.
// A module, not a test file: tests/eta-contract.test.mjs imports it.
//
// THE DEFECT THIS CLOSES, and the two it refuses to open. Lane eta lets the agent save a metric
// definition draft, recorded with proposed_by = clara.agent_user_id(). delta's approval verb refuses
// when the SOLE eligible human is not the proposer, so a one-owner firm could never approve an
// agent-authored draft: fail-closed, but unusable for exactly the firms most likely to want it.
//
// The obvious repair — "an agent proposer is never a conflict" — opens a worse hole: a human directs
// the agent to draft, then approves it, in a MULTI-admin firm where the distinct-checker rule is
// supposed to bite hardest. proposal_evidence.on_behalf_of records who directed the wake, so that
// human is the effective MAKER and maker/checker is measured against them.
//
// AND TWO EDGES THE FIRST CUT OF THAT RULE STILL GOT WRONG, both covered below:
//   * a NULL maker made every arm's predicate NULL, so NO arm fired and the draft approved with
//     neither a checker nor an attestation — three-valued logic turning a permissive branch into no
//     branch at all;
//   * the maker's STANDING was never re-read, so a director who had left the firm still counted.
// ARM 0 answers both by ADOPTION: approvable, but only by a human who attests to taking it on.
//
// WHAT THE RUNTIME ACTUALLY DOES, so these cells are not read as the common path: the wake lane
// mints on_behalf_of = the initiating human. A solo owner who asks the agent to draft therefore
// lands on the SELF-APPROVAL arm and attests — the same act delta already required. The orphan cells
// are the edge (a null-obo mint, still exported), not the everyday shape.
//
// FIRM ISOLATION IS DELIBERATE. These cells control the eligible-human COUNT, a whole-firm property,
// so they build their own firm; adding an admin to a shared one would silently move the arm every
// other cell lands on. The eligible=1 cells run BEFORE the second admin is added — load-bearing.

import {
  assert, randomUUID, rootQuery, withActor, ROLES, opk,
  measure, metricAst, caught, errorDetail, approveMetricDefinition,
  freshActiveClient, setupCloseCoa, createStandardSets,
} from "./epsilon-fixtures.mjs";
import { mintWake, insertUser, seedAdmission, createFirm, addMember, removeMember, membershipId } from "./rig-fixtures.mjs";

const AGENT_USER_ID = "00000000-0000-4000-8000-000000c1a7a0";
const SAVE_DRAFT_SQL = `select clara.wake_save_metric_definition_draft($1::uuid, $2::text, $3::text,
  $4::text, $5::text, $6::smallint, $7::jsonb, $8::boolean, $9::date, $10::date, $11::text) as r`;
const APPLIES_FROM = "2026-01-01";

const evidenceOf = async (version) => (await rootQuery(
  "select state, approval_evidence, self_approval_attestation from clara.metric_definition_versions where id=$1",
  [version])).rows[0];

export async function registerApprovalOboPhase(t) {
  const tag = randomUUID().slice(0, 6);
  const solo = await insertUser("b4", `solo_${tag}`);
  const token = await seedAdmission();
  const firm = await createFirm(solo, { name: `b4_firm_${tag}`, token, opKey: opk("b4-firm") });
  // A full client: clara.approve_metric_definition validates the account-set binding for every
  // measure leaf BEFORE it reaches the eligibility arms, so a bare client would refuse on
  // scope_mismatch and these cells would never test what they claim.
  const client = await freshActiveClient(solo, `b4-${tag}`);
  await setupCloseCoa(solo, client);
  await createStandardSets(solo, client);
  const ast = metricAst({ root: measure({ set: "revenue" }), unit: "money" });

  async function agentDraft(obo) {
    const cred = await mintWake({ kind: "interactive", firm, onBehalfOf: obo });
    const receipt = await withActor(
      { role: ROLES.wakeInteractive, wakeSecret: cred.secret, transaction: true },
      (c) => c.query(SAVE_DRAFT_SQL, [
        client, `b4_${randomUUID().slice(0, 8)}`, "b4 draft", ast.unit, ast.temporality,
        ast.result_scale, JSON.stringify(ast), false, APPLIES_FROM, null, `b4-save-${randomUUID()}`,
      ]).then((r) => r.rows[0]?.r ?? null),
    );
    assert.ok(receipt?.definition_version_id, `the agent saved a draft (${JSON.stringify(receipt)})`);
    const row = (await rootQuery(
      "select proposed_by, proposal_evidence from clara.metric_definition_versions where id=$1",
      [receipt.definition_version_id])).rows[0];
    assert.equal(row.proposed_by, AGENT_USER_ID, "the draft really is agent-proposed");
    assert.equal(row.proposal_evidence?.on_behalf_of ?? null, obo, "and records who directed it");
    return receipt.definition_version_id;
  }

  const eligibleCount = async () => (await rootQuery(
    `select count(*)::int n from clara.firm_memberships m join clara.users u on u.id=m.user_id
      where m.firm_id=$1 and m.status='active' and m.role in ('admin','owner') and not u.is_agent`,
    [firm])).rows[0].n;

  // ---- ARM 0: the orphan draft ------------------------------------------------------------
  await t.test("a draft nobody directed is NOT approvable unattested, and IS by adoption", async () => {
    assert.equal(await eligibleCount(), 1, "the fixture firm has exactly one eligible human");
    const version = await agentDraft(null);

    // THE FAIL-OPEN REGRESSION CELL. With v_maker NULL every arm's predicate was NULL, so no arm
    // fired at all and this approved unattested — at eligible=1 a direct reversal of delta.
    const bare = await caught(() => approveMetricDefinition(solo, version, { attestation: "" }));
    assert.equal(bare?.code, "CLR05", `unattested orphan approval refused (${bare?.code} ${bare?.message})`);
    assert.equal(errorDetail(bare).reason, "self_approval_attestation_missing",
      "and on delta's existing attestation token — no new refusal vocabulary");

    const ok = await approveMetricDefinition(solo, version, { attestation: "b4 adoption of an undirected draft" });
    assert.equal(ok?.state, "firm_approved", "adoption opens the door the deadlock closed");
    const row = await evidenceOf(version);
    assert.equal(row.approval_evidence?.approval_arm, "adoption", "the evidence names which arm ran");
    assert.equal(row.approval_evidence?.effective_maker, null, "there was no directing human");
    assert.equal(row.approval_evidence?.maker_active_at_approval, false, "and none standing");
    assert.ok(row.self_approval_attestation, "the adoption attestation is stored");
  });

  // ---- ARM 0: the DEPARTED director --------------------------------------------------------
  await t.test("a director who has left the firm is no longer accountable: adoption or nothing", async () => {
    const leaver = await insertUser("b4", `leaver_${tag}`);
    await addMember(solo, { firm, user: leaver, role: "bookkeeper", opKey: opk("b4-leave") });
    const version = await agentDraft(leaver);           // directed while they were a member
    await removeMember(solo, { membership: await membershipId(firm, leaver), opKey: opk("b4-rm") });
    assert.equal(await eligibleCount(), 1, "removing a bookkeeper does not move the eligible count");

    // mint_wake_credential validated this director at MINT time; the draft outlived that. Standing
    // is therefore re-read at APPROVAL, which is the whole point of the second edge.
    const bare = await caught(() => approveMetricDefinition(solo, version, { attestation: "  " }));
    assert.equal(bare?.code, "CLR05", `departed-director draft refused unattested (${bare?.code})`);
    assert.equal(errorDetail(bare).reason, "self_approval_attestation_missing");

    const ok = await approveMetricDefinition(solo, version, { attestation: "b4 adoption after the director left" });
    assert.equal(ok?.state, "firm_approved");
    const row = await evidenceOf(version);
    assert.equal(row.approval_evidence?.approval_arm, "adoption");
    assert.equal(row.approval_evidence?.effective_maker, leaver, "the departed director is still named");
    assert.equal(row.approval_evidence?.maker_active_at_approval, false, "and recorded as no longer standing");
  });

  // ---- a STANDING director who is not the approver: a genuine check -------------------------
  await t.test("a draft directed by another ACTIVE member is a genuine independent check", async () => {
    assert.equal(await eligibleCount(), 1, "still exactly one eligible approver");
    // A BOOKKEEPER: the only shape the estate permits (mint_wake_credential refuses a non-member),
    // and it keeps the eligible count at one since only admin/owner are counted.
    const other = await insertUser("b4", `other_${tag}`);
    await addMember(solo, { firm, user: other, role: "bookkeeper", opKey: opk("b4-bk") });
    const version = await agentDraft(other);
    const ok = await approveMetricDefinition(solo, version, { attestation: "" });
    assert.equal(ok?.state, "firm_approved", "no attestation needed — the approver directed nothing");
    const row = await evidenceOf(version);
    assert.equal(row.approval_evidence?.approval_arm, "independent_check");
    assert.equal(row.approval_evidence?.self_approved, false);
    assert.equal(row.approval_evidence?.effective_maker, other, "the directing human is the maker");
    assert.equal(row.approval_evidence?.maker_active_at_approval, true, "and is still standing");
    assert.equal(row.self_approval_attestation, null, "nothing is stored where nothing was required");
  });

  // ---- ARM 3: self-approval by proxy --------------------------------------------------------
  await t.test("a draft the approver DIRECTED is a self-approval and still costs an attestation", async () => {
    const version = await agentDraft(solo);
    const blank = await caught(() => approveMetricDefinition(solo, version, { attestation: "   " }));
    assert.equal(blank?.code, "CLR05", `refused without attestation (${blank?.code} ${blank?.message})`);
    assert.equal(errorDetail(blank).reason, "self_approval_attestation_missing",
      "on the ATTESTATION arm, not the proposer-mismatch arm — the agent did not launder the authorship");
    const ok = await approveMetricDefinition(solo, version, { attestation: "b4 proxy self-approval" });
    assert.equal(ok?.state, "firm_approved");
    const row = await evidenceOf(version);
    assert.equal(row.approval_evidence?.approval_arm, "self_approval");
    assert.equal(row.approval_evidence?.self_approved, true, "recorded AS a self-approval, because it is one");
    assert.equal(row.approval_evidence?.effective_maker, solo, "the maker is the director, not the agent");
    assert.ok(row.self_approval_attestation);
  });

  // ---- ARM 2: delta's human arm, untouched --------------------------------------------------
  await t.test("delta's human arms are untouched, and ignore an on_behalf_of field entirely", async () => {
    const stranger = await insertUser("b4", `stranger_${tag}`);
    const plain = await seedHumanDraft(firm, client, stranger, ast, null);
    const mismatch = await caught(() => approveMetricDefinition(solo, plain, { attestation: "x" }));
    assert.equal(errorDetail(mismatch).reason, "sole_eligible_proposer_mismatch",
      "a HUMAN proposer who is not the approver is refused exactly as before");

    // AND the maker rule reads on_behalf_of ONLY for agent proposals. A human-proposed draft that
    // happens to carry the field must be judged on its PROPOSER — otherwise the field would be a
    // way to launder human authorship through evidence nobody validated.
    const decoyed = await seedHumanDraft(firm, client, stranger, ast, solo);
    const still = await caught(() => approveMetricDefinition(solo, decoyed, { attestation: "x" }));
    assert.equal(errorDetail(still).reason, "sole_eligible_proposer_mismatch",
      "an on_behalf_of field on a HUMAN draft changes nothing — v_maker is the proposer");
  });

  // ---- the NULL-proposer shape: an ORPHAN, adoption-only ------------------------------------
  await t.test("a draft with NO PROPOSER is an orphan: adoption or nothing", async () => {
    // clara.metric_definition_versions.proposed_by is `uuid references clara.users(id)` with NO
    // NOT NULL, so this row is representable even though no audited door mints one: propose_ sets
    // the human actor and the wake core sets clara.agent_user_id(), both non-null. The hardening
    // under test is `v_agent := proposed_by IS NOT DISTINCT FROM agent_user_id()` — with plain `=`
    // a NULL proposer makes v_agent NULL, which propagates into v_orphan and re-opens exactly the
    // three-valued collapse ARM 0 exists to close. This cell asserts the route is DECIDED.
    const version = await seedHumanDraft(firm, client, null, ast, null);

    // "Independent check" presupposes somebody to be independent OF, and there is nobody. delta was
    // already stricter here: its eligible=1 arm read `proposed_by<>actor OR blank attestation`,
    // which with a NULL proposer is `NULL OR true` -> TRUE -> refused. Approving this unattested
    // would have been a silent LOOSENING of delta introduced behind a null-hardening token.
    const bare = await caught(() => approveMetricDefinition(solo, version, { attestation: "" }));
    assert.equal(bare?.code, "CLR05", `a maker-less draft is refused unattested (${bare?.code} ${bare?.message})`);
    assert.equal(errorDetail(bare).reason, "self_approval_attestation_missing");

    const ok = await approveMetricDefinition(solo, version, { attestation: "b4 adoption of a maker-less draft" });
    assert.equal(ok?.state, "firm_approved", "and is adoptable, like every other orphan shape");
    const row = await evidenceOf(version);
    assert.equal(row.approval_evidence?.approval_arm, "adoption");
    assert.equal(row.approval_evidence?.effective_maker, null, "there is no maker to name");
    assert.equal(row.approval_evidence?.maker_active_at_approval, false, "a null maker stands for nobody");
    assert.ok(row.self_approval_attestation, "the adoption attestation is stored");
  });

  // ---- ARM 1: the proxy hole, with a second admin -------------------------------------------
  await t.test("with a second admin, a draft the approver directed is refused distinct_checker", async () => {
    const second = await insertUser("b4", `admin_${tag}`);
    await addMember(solo, { firm, user: second, role: "admin", opKey: opk("b4-mem") });
    assert.equal(await eligibleCount(), 2, "the firm now has two eligible humans");

    const version = await agentDraft(solo);
    const refusal = await caught(() => approveMetricDefinition(solo, version, { attestation: "x" }));
    assert.equal(errorDetail(refusal).reason, "distinct_checker",
      "directing the agent then approving is self-approval by proxy — the hole the naive fix leaves open");

    const ok = await approveMetricDefinition(second, version, { attestation: "" });
    assert.equal(ok?.state, "firm_approved", "a genuine second human can still approve it");
    assert.equal((await evidenceOf(version)).approval_evidence?.approval_arm, "independent_check");
  });
}

/** A HUMAN-proposed draft inserted directly: propose_metric_definition floors at admin+, and these
 *  cells need a proposer who is deliberately NOT an eligible approver. `obo` optionally plants an
 *  on_behalf_of field on a human proposal, which the maker rule must ignore. */
async function seedHumanDraft(firm, client, proposer, ast, obo) {
  const catalog = (await rootQuery(
    `select (select id from clara.edge_policy_sets where policy_set_key=$1 and firm_id is null order by version desc limit 1) as edge_id,
            (select id from clara.averaging_policy_versions where policy_key='avg_month_end_v1' and firm_id is null and implemented order by version desc limit 1) as average_id`,
    [ast.edge_policy_set])).rows[0];
  const definition = (await rootQuery(
    "insert into clara.metric_definitions(firm_id,definition_key,title,created_by) values ($1,$2,$2,$3) returning id",
    [firm, `b4_human_${randomUUID().slice(0, 8)}`, proposer])).rows[0].id;
  return (await rootQuery(
    `insert into clara.metric_definition_versions(firm_id,definition_id,revision,ast,normalized_ast,
       formula_sha256,unit_key,temporality_key,result_scale,edge_policy_set_id,averaging_policy_id,
       allow_negative,state,applies_from,proposed_by,proposal_evidence,approval_evidence)
     values ($1,$2,1,$3::jsonb,clara._normalize_metric_node_v1($3::jsonb->'root'),
       clara._hash($3::jsonb),$4,$5,$6,$7,$8,false,'draft',$9::date,$10,
       jsonb_build_object('kind','human_proposal','version',1,'client_id',$11::uuid)
         || case when $12::uuid is null then '{}'::jsonb else jsonb_build_object('on_behalf_of',$12::uuid) end,
       '{"kind":"not_applicable","version":1,"reason":"not_approved"}')
     returning id`,
    [firm, definition, JSON.stringify(ast), ast.unit === "currency" ? "money" : ast.unit,
      ast.temporality, ast.result_scale, catalog.edge_id, catalog.average_id, APPLIES_FROM,
      proposer, client, obo])).rows[0].id;
}
