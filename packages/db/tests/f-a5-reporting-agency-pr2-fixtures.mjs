// F-A5 PR-2 -- shared fixtures for the granted-surface battery. NOT a test file (the name does
// not end in `.test.mjs`); the f-a5-reporting-agency-pr2-*.test.mjs files import it.
//
// Design of record: docs/plan/active/reporting-agency-design.md (v2) SS3.1, SS4-SS5 PR-2; annexes
// reporting-agency-annexes-1-mechanics.md (A.1, A.2, A.3, C) and
// reporting-agency-annexes-2-record.md (D, E).

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  rootQuery, roleQuery, wakeQuery, ROLES, opk, endPool,
} from "./rig-helpers.mjs";
import { buildWorld } from "./rig-fixtures.mjs";
import { buildEpsilonWorld, ensureEpsilonAdmin } from "./epsilon-world.mjs";
import { caught, errorDetail, reasonOf as epsilonReasonOf } from "./epsilon-fixtures.mjs";

/** The agent principal, pinned rather than read from clara.agent_user_id() (PR-1's own idiom):
 *  an expectation derived from the same function under test proves nothing (0002_foundation.sql). */
export const AGENT_USER_ID = "00000000-0000-4000-8000-000000c1a7a0";

/** The seventeen wrapper names annex A.1 enumerates, held as a NAME LIST (F5-D30's lesson: a
 *  census written against a count cannot find an omission). */
export const PR2_WRAPPERS = Object.freeze([
  "wake_open_report_run", "wake_evaluate_report_pack", "wake_seal_report_dataset",
  "wake_assess_report_claim", "wake_seal_report_artifact", "wake_requeue_render_job",
  "wake_approve_metric_definition", "wake_supersede_metric_definition", "wake_reject_metric_definition",
  "wake_create_account_set", "wake_mint_metric_input_snapshot",
  "wake_publish_chart_template_version", "wake_publish_report_template_version",
  "wake_report_run_state", "wake_report_claim_state", "wake_report_artifact_index",
  "wake_metric_definition_index",
]);

/** Every wrapper's exact regprocedure signature, for posture/grant probes. */
export const PR2_WRAPPER_SIGS = Object.freeze({
  wake_open_report_run: "clara.wake_open_report_run(uuid,uuid,uuid,uuid,text,jsonb,text)",
  wake_evaluate_report_pack: "clara.wake_evaluate_report_pack(uuid,uuid[],uuid[],uuid,text,jsonb,text)",
  wake_seal_report_dataset: "clara.wake_seal_report_dataset(uuid,uuid[],text,text,jsonb)",
  wake_assess_report_claim: "clara.wake_assess_report_claim(uuid,text,text,jsonb)",
  wake_seal_report_artifact: "clara.wake_seal_report_artifact(uuid,text,text,text,bigint,jsonb,uuid,text,jsonb,text)",
  wake_requeue_render_job: "clara.wake_requeue_render_job(uuid,text,boolean,text,jsonb,text)",
  wake_approve_metric_definition: "clara.wake_approve_metric_definition(uuid,bytea,text,text,text,jsonb,text)",
  wake_supersede_metric_definition: "clara.wake_supersede_metric_definition(uuid,uuid,text,text,jsonb,text)",
  wake_reject_metric_definition: "clara.wake_reject_metric_definition(uuid,text,text,jsonb,text)",
  wake_create_account_set: "clara.wake_create_account_set(uuid,text,text,jsonb,boolean,date,text,jsonb,text)",
  wake_mint_metric_input_snapshot: "clara.wake_mint_metric_input_snapshot(uuid,uuid[],text,jsonb,text)",
  wake_publish_chart_template_version: "clara.wake_publish_chart_template_version(text,text,jsonb,date,text,jsonb,text)",
  wake_publish_report_template_version: "clara.wake_publish_report_template_version(text,text,text,text,uuid,uuid,jsonb,date,text,jsonb,text)",
  wake_report_run_state: "clara.wake_report_run_state(uuid,text,jsonb,text)",
  wake_report_claim_state: "clara.wake_report_claim_state(uuid,text,jsonb,text)",
  wake_report_artifact_index: "clara.wake_report_artifact_index(uuid,text,jsonb,text)",
  wake_metric_definition_index: "clara.wake_metric_definition_index(text,jsonb,text)",
});

/** The nine NEW cores PR-2 mints (PR-1's own eight -- 6 extracted + evaluate_fs_pack_agent_v1 +
 *  _agent_approve_metric_definition_core -- are PR-1's battery's business, not re-asserted here). */
export const PR2_NEW_CORES = Object.freeze([
  "clara._agent_reject_metric_definition_core(uuid,uuid,uuid,text,uuid,text,text,jsonb)",
  "clara._agent_supersede_metric_definition_core(uuid,uuid,uuid,text,uuid,uuid,text,text,jsonb)",
  "clara._agent_mint_metric_input_snapshot_core(uuid,uuid,uuid,text,uuid,uuid[],text,jsonb)",
  "clara._agent_create_account_set_core(uuid,uuid,uuid,text,uuid,text,text,jsonb,boolean,date,text,jsonb)",
  "clara._requeue_render_job_core(uuid,uuid,uuid,text,uuid,text,boolean,jsonb,text)",
  "clara._report_run_state_core(uuid,uuid,uuid,text,uuid,jsonb,text)",
  "clara._report_claim_state_core(uuid,uuid,uuid,text,uuid,jsonb,text)",
  "clara._report_artifact_index_core(uuid,uuid,uuid,text,uuid,jsonb,text)",
  "clara._metric_definition_index_core(uuid,uuid,uuid,text,jsonb,text)",
]);

export const NO_REACH_ROLES = Object.freeze([
  "clara_authenticated", "clara_agent_ro", "clara_runtime", "clara_runtime_login",
  "clara_wake_interactive", "clara_wake_proactive", "clara_agent_read_login", "clara_wake_write_login",
]);

/** THE CAPABILITY GATE. Half-applied is drift, not dormancy (PR-1's own idiom, applied to PR-2's
 *  own five files: pr2a/b mint the nine new cores, pr2c/d mint the seventeen wrappers, pr2e grants
 *  and allowlists them). All present or none; a partial state is loud, never silently skipped. */
let _ready = null;
export async function pr2Ready() {
  if (_ready !== null) return _ready;
  const wrapperCount = (await rootQuery(
    "select count(*)::int n from unnest($1::text[]) s where to_regprocedure(s) is not null",
    [Object.values(PR2_WRAPPER_SIGS)])).rows[0].n;
  const coreCount = (await rootQuery(
    "select count(*)::int n from unnest($1::text[]) s where to_regprocedure(s) is not null",
    [PR2_NEW_CORES])).rows[0].n;
  const allowlistCount = (await rootQuery(
    "select count(*)::int n from clara.wake_fn_allowlist where function_name = any($1::text[]) and wake_kind = 'interactive'",
    [PR2_WRAPPERS])).rows[0].n;
  const halves = [wrapperCount === PR2_WRAPPERS.length, coreCount === PR2_NEW_CORES.length,
    allowlistCount === PR2_WRAPPERS.length];
  if (halves.every((h) => !h)) { _ready = false; return false; }
  if (!halves.every((h) => h)) {
    throw new Error(`F-A5 PR-2 DRIFT: a half-applied migration set -- wrappers=${wrapperCount}/${PR2_WRAPPERS.length} `
      + `cores=${coreCount}/${PR2_NEW_CORES.length} allowlist=${allowlistCount}/${PR2_WRAPPERS.length}. Apply pr2a..pr2e as a whole.`);
  }
  _ready = true;
  return true;
}

/** Named, counted skip -- never a silent return (authoring law). */
export function skipHere(t, why) { t.skip(`F-A5 PR-2 not applied: ${why}`); return true; }

/** mint_wake_credential(p_wake_kind, p_firm, p_on_behalf_of, p_ttl, p_client) -- the 5-arg mint. */
export async function mintWake({ kind = "interactive", firm, onBehalfOf = null, ttl = "15 minutes", client = null }) {
  const r = await roleQuery(ROLES.runtime,
    "select * from clara.mint_wake_credential(p_wake_kind => $1, p_firm => $2, p_on_behalf_of => $3, p_ttl => $4::interval, p_client => $5)",
    [kind, firm, onBehalfOf, ttl, client]);
  const row = r.rows[0] ?? {};
  return { credentialId: row.credential_id ?? null, secret: row.secret };
}

/** A well-formed p_model jsonb, and a plain rationale -- the two params every PR-2 wrapper checks
 *  for completeness before doing any work. */
export const wakeModel = (over = {}) => ({ model: "claude-opus-5", model_version: "2026-08", ...over });
export const RATIONALE = "f-a5 pr2 battery";

/** Call a granted wake wrapper by name, under an 'interactive' credential OBO the given user (or
 *  undirected when omitted). Named arguments only -- a renamed parameter is a real finding. */
export function callWrapper(secret, fnName, args, casts = {}) {
  const params = args.map(([name], i) => `${name} => $${i + 1}${casts[name] ? `::${casts[name]}` : ""}`);
  return wakeQuery(ROLES.wakeInteractive, secret,
    `select clara.${fnName}(${params.join(", ")}) as r`, args.map(([, v]) => v))
    .then((r) => r.rows[0].r);
}

/** A world with a sealed epsilon report chain, PLUS a minted interactive wake credential OBO the
 *  world's owner -- the shared fixture every chain/cores test starts from. */
export async function buildPr2World(tag) {
  const world = await buildWorld();
  const eps = await buildEpsilonWorld(world, { tag, seal: false, approveDefinition: true });
  const cred = await mintWake({ kind: "interactive", firm: world.firms.A, onBehalfOf: world.users.alice });
  return { world, eps, cred };
}

/** A second, UNDIRECTED interactive credential (p_obo null) -- the self-run shape. */
export async function mintUndirectedWake(firm) {
  return mintWake({ kind: "interactive", firm, onBehalfOf: null });
}

export const reasonOf = epsilonReasonOf;

export { assert, randomUUID, rootQuery, roleQuery, wakeQuery, ROLES, opk, endPool, ensureEpsilonAdmin, caught, errorDetail };
