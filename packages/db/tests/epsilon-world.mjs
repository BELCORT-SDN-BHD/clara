// Wave E lane EPSILON -- the world builder. NOT a test file.
//
// Builds a complete reporting chain THROUGH the audited verbs (dog-fooding): a client with
// books, a month period, a pinned metric-input snapshot, an approved metric definition, a house
// style, a template, a spec, a run, evaluated cells and -- optionally -- a sealed dataset.
//
// The one thing it does NOT do through a verb is seed clara.statutory_wording: layer 2 is
// migration-only by design (no writer exists anywhere in the estate, which the migration tail
// asserts). Where a phase needs VERIFIED wording it inserts under clara_fn_owner against a
// rig-only profile, simulating the migration that owner task #43 will eventually land -- and
// never against the shipped mpers_company profile, whose zero-wording posture the battery
// re-reads at start AND at end.

import {
  assert, randomUUID, rootQuery, withActor, ROLES, opk, insertUser, addMember,
  freshActiveClient, setupCloseCoa, plainEntry, createStandardSets, mintMonthSnapshot,
  reportingPeriodRows, mintMetricInput, proposeMetricDefinition, approveMetricDefinition,
  measure, metricAst, pastMonthStart, evaluateMetricHuman,
  publishHouseStyle, publishTemplate, draftSpec, openRun, sealDataset,
  layoutAst, MPERS_SECTIONS, BANK1, REVN,
} from "./epsilon-fixtures.mjs";

/**
 * A SECOND admin in firm A, memoised on the world.
 *
 * Delta floors BOTH propose_metric_definition and approve_metric_definition at admin+, and PRD
 * SS2 maker/checker requires them to be different humans wherever the firm has two eligible ones
 * -- which firm A does. So the pair is: this admin proposes, the owner approves. A bookkeeper
 * cannot stand in for the proposer (insufficient role) and the owner cannot stand in for both
 * (no distinct approver); the fixture needs exactly this third identity.
 */
export async function ensureEpsilonAdmin(world) {
  if (world.users.epsilonAdmin) return world.users.epsilonAdmin;
  const admin = await insertUser(world.prefix, `eps_admin_${randomUUID().slice(0, 6)}`);
  await addMember(world.users.alice, {
    firm: world.firms.A, user: admin, role: "admin", opKey: opk("eps-admin"),
  });
  world.users.epsilonAdmin = admin;
  return admin;
}

export async function profileVersion(profileKey, revision = 1) {
  const row = (await rootQuery(
    "select id from clara.statutory_profile_versions where profile_key=$1 and revision=$2",
    [profileKey, revision])).rows[0];
  assert.ok(row, `shipped profile ${profileKey} revision ${revision} exists`);
  return row.id;
}

/**
 * The rig-only verified-wording profile. Structure is inserted here rather than shipped,
 * because a migration that shipped a second profile just for tests would be product surface.
 */
export async function seedRigProfile(tag) {
  const key = `epsilon_rig_${tag}_${randomUUID().slice(0, 8)}`;
  return withActor({ role: ROLES.fnOwner, transaction: true }, async (db) => {
    await db.query(
      `insert into clara.statutory_profiles(profile_key,title,authority,claim_capability,source_note)
       values($1,'Epsilon rig profile','rig','claims_compliance','rig-only: exercises the verified-wording path')`,
      [key]);
    const version = (await db.query(
      `insert into clara.statutory_profile_versions(profile_key,revision,
         applies_to_periods_beginning_from,content_sha256,source_note)
       values($1,1,'2016-01-01',clara._hash(jsonb_build_object('rig',$1::text)),'rig-only') returning id`,
      [key])).rows[0].id;
    for (const [i, section] of MPERS_SECTIONS.entries()) {
      await db.query(
        `insert into clara.statutory_sections(profile_version_id,section_key,ordinal,title_wording_key,required)
         values($1,$2,$3,$4,true)`, [version, section, i, `${section}.title`]);
      await db.query(
        `insert into clara.statutory_slots(profile_version_id,section_key,slot_key,ordinal,wording_key,slot_kind,required)
         values($1,$2,'heading',0,$3,'heading',true)`, [version, section, `${section}.title`]);
    }
    return { profileKey: key, profileVersionId: version };
  });
}

/** Land VERIFIED wording for every required slot of a rig profile (the #43 simulation). */
export async function seedVerifiedWording({ profileKey, locale = "en", verifier }) {
  return withActor({ role: ROLES.fnOwner, transaction: true }, async (db) => {
    await db.query(
      `insert into clara.statutory_wording(profile_key, wording_key, locale,
         applies_to_periods_beginning_from, wording_text, source_manifest, source_sha256,
         verification_state, verified_by, verified_at, source_note)
       select distinct v.profile_key, s.wording_key, $2::text, date '2016-01-01',
         'RIG WORDING -- ' || s.wording_key,
         jsonb_build_object('source', 'rig'), repeat('a', 64), 'verified', $3::uuid, now(),
         'rig-only verified wording; never MASB text'
         from clara.statutory_slots s
         join clara.statutory_profile_versions v on v.id = s.profile_version_id
        where v.profile_key = $1`,
      [profileKey, locale, verifier]);
  });
}

/**
 * Takes the WORLD, not a single actor, because firm A holds two eligible humans and delta's
 * approve_metric_definition enforces PRD SS2 maker/checker: the metric is proposed by the
 * bookkeeper and approved by the owner. Passing one actor for both was the fixture defect this
 * signature exists to prevent.
 *
 * @param {object} o
 * @param {"management"|"statutory"} o.reportClass
 * @param {string[]|null} o.sections  layout sections; defaults to the profile's required set
 * @param {boolean} o.seal            seal the dataset (default true)
 * @param {boolean} o.approveDefinition  approve the metric definition (false leaves it draft)
 */
export async function buildEpsilonWorld(world, {
  tag, reportClass = "management", locale = "en", profileVersionId = null,
  sections = null, specSections = null, seal = true, approveDefinition = true,
  charts = [], monthsBack = 3,
} = {}) {
  const owner = world.users.alice;              // firm owner: approves the definition, publishes the style
  const preparer = await ensureEpsilonAdmin(world); // admin: proposes it (approver != proposer)
  const client = await freshActiveClient(owner, `eps-${tag}`);
  await setupCloseCoa(owner, client);
  await createStandardSets(owner, client);
  const monthStart = await pastMonthStart(monthsBack);
  const entry = await plainEntry(owner, {
    client, debit: BANK1, credit: REVN, cents: 100_000,
    postingDate: `${monthStart.slice(0, 8)}10`, memo: `epsilon ${tag}`,
  });
  const gamma = await mintMonthSnapshot(owner, { client, monthStart, opKey: opk("eps-month") });
  const period = (await reportingPeriodRows(client, "month")).find((row) => row.id === gamma.reporting_period_id);
  assert.ok(period, "the minted month resolves to a live reporting-period row");
  const { snapshotId } = await mintMetricInput(owner, { client, periodIds: [period.id] });

  const definitionKey = `revenue_total_${randomUUID().slice(0, 8)}`;
  const definitionVersionId = await proposeMetricDefinition(preparer, {
    client, key: definitionKey, unit: "money",
    ast: metricAst({ root: measure({ set: "revenue" }), unit: "money" }),
  });
  if (approveDefinition) await approveMetricDefinition(owner, definitionVersionId);

  const style = await publishHouseStyle(owner, { styleKey: `eps-style-${tag}-${randomUUID().slice(0, 6)}` });
  const layout = layoutAst(sections ?? (reportClass === "statutory" ? MPERS_SECTIONS : ["management_summary"]));
  const template = await publishTemplate(owner, {
    templateKey: `eps-tpl-${tag}-${randomUUID().slice(0, 6)}`, reportClass,
    claimCapability: reportClass === "statutory" ? "claims_compliance" : "no_claim",
    profileVersionId, houseStyleVersionId: style.house_style_version_id, layout,
  });
  // The spec layout may legitimately DEPART from the template's -- that is the "custom cut" of
  // matrix D6, and the whole reason `stripped` exists as a state.
  const specLayout = specSections ? layoutAst(specSections) : layout;
  const spec = await draftSpec(owner, {
    client, specKey: `eps-spec-${tag}-${randomUUID().slice(0, 6)}`,
    templateVersionId: template.report_template_version_id, locale, layout: specLayout,
  });
  const run = await openRun(owner, {
    client, specVersionId: spec.report_spec_version_id, snapshotId, periodId: period.id,
  });
  const cell = await evaluateMetricHuman(owner, {
    client, definitionVersion: definitionVersionId, periodIds: [period.id],
    snapshotId, runId: run.report_run_id,
  });
  const sealed = seal ? await sealDataset(owner, { runId: run.report_run_id, charts }) : null;
  return {
    client, entry, monthStart, period, snapshotId, definitionKey, definitionVersionId,
    style, template, spec, run, runId: run.report_run_id, cell, sealed, layout, specLayout,
  };
}

/** The run's artifacts, newest last. */
export async function artifactRows(runId) {
  return (await rootQuery(
    "select * from clara.report_artifacts where report_run_id=$1 order by sealed_at, id", [runId])).rows;
}

export async function assessmentRow(runId) {
  return (await rootQuery(
    "select * from clara.report_claim_assessments where report_run_id=$1", [runId])).rows[0] ?? null;
}

export async function datasetRows(runId) {
  return (await rootQuery(
    "select * from clara.report_datasets where report_run_id=$1 order by chart_spec_version_id nulls first, id",
    [runId])).rows;
}
