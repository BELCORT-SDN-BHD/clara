// Wave E lane EPSILON -- shared fixtures. NOT a test file (the name does not end in
// `.test.mjs`, so `node --test` ignores it); the epsilon-*.test.mjs files import it.
//
// CONTRACT-BLIND on the epsilon migrations: every assertion in the phases reads returned JSON,
// live catalog rows and live ACLs. Nothing asserts a migration's own text.
//
// PRESENCE GATE (the delta idiom, delta-context-pack-residual.test.mjs:23): with
// CLARA_ALLOW_MISSING_WAVE_E_EPSILON=1 an un-migrated database SKIPS loudly; with the variable
// unset it FAILS. A pre-epsilon run therefore stays honest instead of quietly green.

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  rootQuery, humanQuery, roleQuery, withActor, ROLES, PG, opk,
  buildWorld, endPool, insertUser, addMember,
  freshActiveClient, setupCloseCoa, plainEntry, bookToday,
  mintMonthSnapshot, reportingPeriodRows,
  createStandardSets, proposeMetricDefinition, approveMetricDefinition, mintMetricInput,
  supersedeMetricDefinition, measure, metricAst, caught, errorDetail, reasonOf, cellRow,
  pastMonthStart, evaluateMetricHuman, firmIdOf,
  BANK1, REVN, EXPN,
} from "./delta-fixtures.mjs";

export {
  assert, randomUUID, rootQuery, humanQuery, roleQuery, withActor, ROLES, PG, opk,
  buildWorld, endPool, insertUser, addMember, freshActiveClient, setupCloseCoa, plainEntry,
  bookToday, mintMonthSnapshot, reportingPeriodRows, createStandardSets,
  proposeMetricDefinition, approveMetricDefinition, mintMetricInput, supersedeMetricDefinition,
  measure, metricAst, caught, errorDetail, reasonOf, cellRow, pastMonthStart,
  evaluateMetricHuman, firmIdOf, BANK1, REVN, EXPN,
};

// The exact public interface. A renamed argument or a stale overload is a readiness failure,
// never a fixture the test quietly adapts to.
export const EPSILON_RELATIONS = Object.freeze([
  "statutory_profiles", "statutory_profile_versions", "statutory_sections", "statutory_slots",
  "statutory_wording", "house_styles", "house_style_versions", "report_templates",
  "report_template_versions", "report_specs", "report_spec_versions", "report_runs",
  "claim_policy_versions", "claim_phrase_lexicon", "protected_placeholders",
  "report_claim_assessments", "chart_templates", "chart_template_versions",
  "report_datasets", "report_dataset_points", "report_artifacts",
]);

export const EPSILON_ENTRYPOINTS = Object.freeze([
  ["publish_house_style_version", "clara.publish_house_style_version(text,text,jsonb,jsonb,date,text)"],
  ["publish_report_template_version", "clara.publish_report_template_version(text,text,text,text,uuid,uuid,jsonb,date,text)"],
  ["publish_chart_template_version", "clara.publish_chart_template_version(text,text,jsonb,date,text)"],
  ["draft_report_spec", "clara.draft_report_spec(uuid,text,text,uuid,text,jsonb,jsonb,jsonb,text)"],
  ["open_report_run", "clara.open_report_run(uuid,uuid,uuid,uuid,text)"],
  ["assess_report_claim", "clara.assess_report_claim(uuid)"],
  ["seal_report_dataset", "clara.seal_report_dataset(uuid,uuid[],text)"],
  ["seal_report_artifact", "clara.seal_report_artifact(uuid,text,text,text,bigint,jsonb,uuid,text)"],
  ["approve_report_for_issue", "clara.approve_report_for_issue(uuid,text,text,text,text)"],
  ["verify_report_artifact", "clara.verify_report_artifact(uuid)"],
]);

export const MPERS_SECTIONS = Object.freeze([
  "statement_of_financial_position", "statement_of_comprehensive_income",
  "statement_of_changes_in_equity", "statement_of_cash_flows", "notes",
]);

let _ready = null;
export async function epsilonReadiness() {
  if (_ready) return _ready;
  const missingRelations = [];
  for (const relation of EPSILON_RELATIONS) {
    if (!(await rootQuery("select to_regclass($1) is not null ok", [`clara.${relation}`])).rows[0].ok) {
      missingRelations.push(relation);
    }
  }
  const missingEntrypoints = [];
  for (const [name, signature] of EPSILON_ENTRYPOINTS) {
    if (!(await rootQuery("select to_regprocedure($1) is not null ok", [signature])).rows[0].ok) {
      missingEntrypoints.push(name);
    }
  }
  _ready = { ready: missingRelations.length === 0 && missingEntrypoints.length === 0,
    missingRelations, missingEntrypoints };
  return _ready;
}

/** Presence gate. Returns true when the caller should stop. */
export async function skipUnlessEpsilon(t) {
  const readiness = await epsilonReadiness();
  if (readiness.ready) return false;
  if (process.env.CLARA_ALLOW_MISSING_WAVE_E_EPSILON === "1") {
    t.skip(`Wave E lane epsilon not applied -- explicit pre-integration run (missing: ${
      [...readiness.missingRelations, ...readiness.missingEntrypoints].join(", ")})`);
    return true;
  }
  assert.fail(`Wave E lane epsilon is required for this suite: ${JSON.stringify(readiness)}`);
  return true;
}

export async function call(sub, fn, args, casts = {}) {
  const params = args.map(([name], i) => `${name} => $${i + 1}${casts[name] ? `::${casts[name]}` : ""}`);
  const r = await humanQuery(sub, `select clara.${fn}(${params.join(", ")}) as r`, args.map(([, v]) => v));
  return r.rows[0].r;
}

export const sha64 = (seed) =>
  [...`${seed}`].reduce((h, ch) => (h * 33 + ch.charCodeAt(0)) >>> 0, 5381)
    .toString(16).padStart(8, "0").repeat(8).slice(0, 64);

// ---------------------------------------------------------------------------
// AST builders
// ---------------------------------------------------------------------------

export const placeholderCell = (key) => ({
  node: "cell", column_span: 1, binds: key, content: { node: "placeholder", key },
});

export const metricCell = (definitionKey) => ({
  node: "cell", column_span: 1, content: { node: "metric_ref", definition_key: definitionKey },
});

export function layoutSection(sectionKey, blocks = null) {
  return {
    section_key: sectionKey,
    blocks: blocks ?? [
      { node: "heading", level: 1, content: { node: "wording_ref", wording_key: `${sectionKey}.title` } },
      { node: "statement_table", columns: 2,
        rows: [{ node: "row", ordinal: 0, cells: [placeholderCell("entity_legal_name"), metricCell("revenue_total")] }] },
    ],
  };
}

export const layoutAst = (sectionKeys, override = null) => ({
  ast: "clara.layout/v1",
  sections: (override ?? sectionKeys.map((k) => layoutSection(k))),
});

export const chartSpec = ({ definitionVersionId, seriesKey = "revenue", axisPolicy = "include_zero",
  thresholds = [], extra = null }) => ({
  ast: "clara.chart/v1", chart_kind: "line", axis_policy: axisPolicy,
  series: [{ series_key: seriesKey, definition_version_id: definitionVersionId }],
  thresholds, data_table: true, ...(extra ?? {}),
});

// ---------------------------------------------------------------------------
// Verb wrappers -- named arguments only, so a renamed parameter is a real finding.
// ---------------------------------------------------------------------------

export const publishHouseStyle = (sub, { styleKey, title = styleKey, styleSpec = { font: "clara-sans" },
  assets = { logo: sha64("logo") }, effectiveFrom = "2016-01-01", opKey = null }) =>
  call(sub, "publish_house_style_version", [
    ["p_style_key", styleKey], ["p_title", title], ["p_style_spec", JSON.stringify(styleSpec)],
    ["p_asset_manifest", JSON.stringify(assets)], ["p_effective_from", effectiveFrom],
    ["p_op_key", opKey ?? opk("eps-style")],
  ], { p_style_spec: "jsonb", p_asset_manifest: "jsonb", p_effective_from: "date" });

export const publishTemplate = (sub, { templateKey, title = templateKey, reportClass,
  claimCapability, profileVersionId = null, houseStyleVersionId, layout,
  effectiveFrom = "2016-01-01", opKey = null }) =>
  call(sub, "publish_report_template_version", [
    ["p_template_key", templateKey], ["p_title", title], ["p_report_class", reportClass],
    ["p_claim_capability", claimCapability], ["p_statutory_profile_version_id", profileVersionId],
    ["p_house_style_version_id", houseStyleVersionId], ["p_layout_ast", JSON.stringify(layout)],
    ["p_effective_from", effectiveFrom], ["p_op_key", opKey ?? opk("eps-template")],
  ], { p_layout_ast: "jsonb", p_effective_from: "date" });

export const publishChart = (sub, { chartKey, title = chartKey, spec,
  effectiveFrom = "2016-01-01", opKey = null }) =>
  call(sub, "publish_chart_template_version", [
    ["p_chart_key", chartKey], ["p_title", title], ["p_chart_spec_ast", JSON.stringify(spec)],
    ["p_effective_from", effectiveFrom], ["p_op_key", opKey ?? opk("eps-chart")],
  ], { p_chart_spec_ast: "jsonb", p_effective_from: "date" });

export const draftSpec = (sub, { client, specKey, title = specKey, templateVersionId,
  locale = "en", parameters = { currency: "MYR" }, overrides = {}, layout, opKey = null }) =>
  call(sub, "draft_report_spec", [
    ["p_client", client], ["p_spec_key", specKey], ["p_title", title],
    ["p_report_template_version_id", templateVersionId], ["p_locale", locale],
    ["p_parameters", JSON.stringify(parameters)], ["p_overrides", JSON.stringify(overrides)],
    ["p_layout_ast", JSON.stringify(layout)], ["p_op_key", opKey ?? opk("eps-spec")],
  ], { p_parameters: "jsonb", p_overrides: "jsonb", p_layout_ast: "jsonb" });

export const openRun = (sub, { client, specVersionId, snapshotId, periodId, opKey = null }) =>
  call(sub, "open_report_run", [
    ["p_client", client], ["p_report_spec_version_id", specVersionId],
    ["p_books_snapshot_id", snapshotId], ["p_reporting_period_id", periodId],
    ["p_op_key", opKey ?? opk("eps-run")],
  ]);

export const sealDataset = (sub, { runId, charts = [], opKey = null }) =>
  call(sub, "seal_report_dataset", [
    ["p_report_run_id", runId], ["p_chart_template_version_ids", charts],
    ["p_op_key", opKey ?? opk("eps-dataset")],
  ], { p_chart_template_version_ids: "uuid[]" });

export const assessClaim = (sub, runId) =>
  call(sub, "assess_report_claim", [["p_report_run_id", runId]]);

export const sealArtifact = (sub, { runId, kind, sha256, byteSize = 4096, manifest,
  keyExtension = "pdf", prior = null, opKey = null }) =>
  call(sub, "seal_report_artifact", [
    ["p_report_run_id", runId], ["p_kind", kind], ["p_key_extension", keyExtension],
    ["p_sha256", sha256], ["p_byte_size", byteSize], ["p_manifest", JSON.stringify(manifest)],
    ["p_prior_artifact_id", prior], ["p_op_key", opKey ?? opk("eps-artifact")],
  ], { p_byte_size: "bigint", p_manifest: "jsonb" });

export const approveIssue = (sub, { runId, expectedSha256, reason = "epsilon battery issue",
  selfAttestation = null, opKey = null }) =>
  call(sub, "approve_report_for_issue", [
    ["p_report_run_id", runId], ["p_expected_artifact_sha256", expectedSha256],
    ["p_reason", reason], ["p_self_attestation", selfAttestation], ["p_op_key", opKey ?? opk("eps-issue")],
  ]);

export const verifyArtifact = (sub, artifactId) =>
  call(sub, "verify_report_artifact", [["p_artifact", artifactId]]);

// ---------------------------------------------------------------------------
// The manifest builder. render_manifest_sha256 is computed BY POSTGRES over the manifest minus
// that key -- reproducing clara._hash's canonical jsonb text in JavaScript would be a second
// implementation of the thing under test.
// ---------------------------------------------------------------------------

export async function buildManifest({ runId, kind, sha256, presignSha256 = null, omit = [],
  overrides = {} }) {
  const run = (await rootQuery(
    `select r.report_spec_version_id, r.books_snapshot_id, s.locale,
            (select id from clara.report_datasets where report_run_id=r.id and chart_spec_version_id is null) dataset_id,
            (select encode(dataset_sha256,'hex') from clara.report_datasets
              where report_run_id=r.id and chart_spec_version_id is null) dataset_sha256,
            (select id from clara.report_claim_assessments where report_run_id=r.id) claim_id,
            (select status from clara.report_claim_assessments where report_run_id=r.id) claim_status,
            (select uncertified from clara.report_claim_assessments where report_run_id=r.id) uncertified
       from clara.report_runs r join clara.report_spec_versions s on s.id=r.report_spec_version_id
      where r.id=$1`, [runId])).rows[0];
  assert.ok(run, `run ${runId} exists`);
  const base = {
    report_spec_version_id: run.report_spec_version_id,
    report_parameters: { currency: "MYR" },
    statutory_profile_version_id: null,
    statutory_profile_sha256: sha64("profile"),
    statutory_wording_sha256: sha64("wording"),
    house_style_version_id: null,
    house_style_sha256: sha64("style"),
    chart_spec_version_ids: [],
    chart_spec_sha256: sha64("chart"),
    books_snapshot_id: run.books_snapshot_id,
    books_event_sequence: "1:1:",
    dataset_id: run.dataset_id,
    dataset_sha256: run.dataset_sha256,
    applicability_receipts: { checked: true },
    claim_assessment: { id: run.claim_id, status: run.claim_status,
      claim_removed: run.claim_status === "stripped" },
    evaluator_versions: ["evaluate_metric@1"],
    definition_hashes: { revenue_total: sha64("def") },
    assembler_version: "clara-assembler@1.0.0",
    renderer_image_digest: `sha256:${sha64("image")}`,
    renderer_source_commit: sha64("commit").slice(0, 40),
    node_version: "v22.11.0", os_version: "debian-12", architecture: "x86_64",
    font_engine_version: "harfbuzz-8.3.0",
    asset_hashes: { logo: sha64("logo") },
    locale: run.locale, timezone: "Asia/Kuala_Lumpur",
    document_metadata: { title: "Financial statements" },
    extracted_text_sha256: sha64("text"),
    extraction_tool: "pdftotext@24.02.0",
    uncertified: run.uncertified,
    ...overrides,
  };
  if (kind === "pre_sign" || kind === "signed_original") {
    base.pre_sign_pdf_sha256 = presignSha256 ?? sha256;
  }
  if (kind === "signed_original") {
    base.signed_original_pdf_sha256 = sha256;
    base.signature_evidence = { signer: "owner", method: "wet-ink-scan" };
  }
  for (const key of omit) delete base[key];
  if (omit.includes("render_manifest_sha256")) return base;
  const digest = (await rootQuery("select encode(clara._hash($1::jsonb),'hex') h",
    [JSON.stringify(base)])).rows[0].h;
  return { ...base, render_manifest_sha256: digest };
}
