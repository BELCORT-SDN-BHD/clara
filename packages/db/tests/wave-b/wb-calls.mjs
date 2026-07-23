// Wave-B rig — Block-K/S/L fn wrappers + root readbacks (NOT a test file).
// Contract-blind: pinned NAMED args from the 0017 design set; never reads the
// migration. Re-exports wb-helpers so a test file imports ONE leaf.
// [AMB-n] markers refer to the ambiguity ledger in wb-helpers.mjs.

import { ROLES, rootQuery, roleQuery, humanQuery, opk, jtxt } from "./wb-helpers.mjs";

export * from "./wb-helpers.mjs";

// ---------------------------------------------------------------------------
// Block-K wrappers
// ---------------------------------------------------------------------------

export async function createOpeningSeed(sub, {
  client, plan, asOf = "2026-01-01", tieDocument = null, tieSha256 = null, opKey = null,
}) {
  const r = await humanQuery(sub,
    "select clara.create_opening_seed(p_client => $1, p_plan => $2, p_as_of => $3::date, p_tie_document => $4, p_tie_sha256 => $5, p_op_key => $6) as r",
    [client, plan, asOf, tieDocument, tieSha256, opKey ?? opk("seed")]);
  return r.rows[0].r;
}

/** [AMB-4]/[AMB-5] — see wb-helpers header for the p_item/p_lines reading. */
export async function draftOpeningItem(sub, {
  client, seed, item, lines = null, resolution, document = null, sha256 = null, opKey = null,
}) {
  const r = await humanQuery(sub,
    `select clara.draft_opening_item(p_client => $1, p_seed => $2, p_item => $3::jsonb,
       p_lines => $4::jsonb, p_resolution => $5, p_document => $6, p_sha256 => $7,
       p_op_key => $8) as r`,
    [client, seed, jtxt(item), lines == null ? null : jtxt(lines), await resolution,
      document, sha256, opKey ?? opk("obi")]);
  return r.rows[0].r;
}

export async function recordOpeningTarget(sub, { seed, line, opKey = null }) {
  const r = await humanQuery(sub,
    "select clara.record_opening_target(p_seed => $1, p_line => $2::jsonb, p_op_key => $3) as r",
    [seed, jtxt(line), opKey ?? opk("tgt")]);
  return r.rows[0].r;
}

export async function recordOpeningTargetsParsed({ seed, lines, document, opKey = null }) {
  const r = await roleQuery(ROLES.runtime,
    "select clara.record_opening_targets_parsed(p_seed => $1, p_lines => $2::jsonb, p_document => $3, p_op_key => $4) as r",
    [seed, jtxt(lines), document, opKey ?? opk("tgtp")]);
  return r.rows[0].r;
}

export async function getOpeningDryrun(sub, { seed }) {
  const r = await humanQuery(sub, "select clara.get_opening_dryrun(p_seed => $1) as r", [seed]);
  return r.rows[0].r;
}

export async function supersedeOpeningItem(sub, { item, replacement = null, opKey = null }) {
  const r = await humanQuery(sub,
    "select clara.supersede_opening_item(p_item => $1, p_replacement => $2::jsonb, p_op_key => $3) as r",
    [item, replacement == null ? null : jtxt(replacement), opKey ?? opk("sup")]);
  return r.rows[0].r;
}

export async function reopenOpeningSeed(sub, { seed, reason = "rig reopen", opKey = null }) {
  const r = await humanQuery(sub,
    "select clara.reopen_opening_seed(p_seed => $1, p_reason => $2, p_op_key => $3) as r",
    [seed, reason, opKey ?? opk("reo")]);
  return r.rows[0].r;
}

/** [AMB-6] — the cancel verb the battery map implies. */
export async function cancelOpeningSeed(sub, { seed, reason = "rig cancel", opKey = null }) {
  const r = await humanQuery(sub,
    "select clara.cancel_opening_seed(p_seed => $1, p_reason => $2, p_op_key => $3) as r",
    [seed, reason, opKey ?? opk("csx")]);
  return r.rows[0].r;
}

/** [AMB-8] — one-call FA seeding. */
export async function seedFixedAsset(sub, { client, seed, asset, opKey = null }) {
  const r = await humanQuery(sub,
    "select clara.seed_fixed_asset(p_client => $1, p_seed => $2, p_asset => $3::jsonb, p_op_key => $4) as r",
    [client, seed, jtxt(asset), opKey ?? opk("fa")]);
  return r.rows[0].r;
}

export async function trialBalanceAsOf(sub, { client, asOf }) {
  const r = await humanQuery(sub,
    "select account_code, name, debit_cents::bigint as debit_cents, credit_cents::bigint as credit_cents from clara.trial_balance_as_of(p_client => $1, p_as_of => $2::date) order by account_code",
    [client, asOf]);
  return r.rows;
}
export async function trialBalance1(sub, { client }) {
  const r = await humanQuery(sub,
    "select account_code, name, debit_cents::bigint as debit_cents, credit_cents::bigint as credit_cents from clara.trial_balance($1) order by account_code",
    [client]);
  return r.rows;
}

// ---------------------------------------------------------------------------
// Block-S wrappers
// ---------------------------------------------------------------------------

/** [AMB-7] — proposals element shape + p_source_kind for the WB-R16 variant. */
export async function createSeedingBatch({ client, document, proposals, sourceKind = null, opKey = null }) {
  const specs = ["p_client => $1", "p_document => $2", "p_proposals => $3::jsonb"];
  const vals = [client, document, jtxt(proposals)];
  if (sourceKind != null) { specs.push(`p_source_kind => $${vals.length + 1}`); vals.push(sourceKind); }
  specs.push(`p_op_key => $${vals.length + 1}`); vals.push(opKey ?? opk("batch"));
  const r = await roleQuery(ROLES.runtime,
    `select clara.create_seeding_batch(${specs.join(", ")}) as r`, vals);
  return r.rows[0].r;
}

export async function tickProposal(sub, { proposal, opKey = null }) {
  const r = await humanQuery(sub,
    "select clara.tick_seeding_proposal(p_proposal => $1, p_op_key => $2) as r",
    [proposal, opKey ?? opk("tick")]);
  return r.rows[0].r;
}
export async function declineProposal(sub, { proposal, reason = "rig decline", opKey = null }) {
  const r = await humanQuery(sub,
    "select clara.decline_seeding_proposal(p_proposal => $1, p_reason => $2, p_op_key => $3) as r",
    [proposal, reason, opKey ?? opk("decl")]);
  return r.rows[0].r;
}
export async function completeSeedingBatch(sub, { batch, opKey = null }) {
  const r = await humanQuery(sub,
    "select clara.complete_seeding_batch(p_batch => $1, p_op_key => $2) as r",
    [batch, opKey ?? opk("done")]);
  return r.rows[0].r;
}
/** [R1-F13] the S-family cancel verb (joins the sweeps + the G4 table). */
export async function cancelSeedingBatch(sub, { batch, reason = "rig cancel", opKey = null }) {
  const r = await humanQuery(sub,
    "select clara.cancel_seeding_batch(p_batch => $1, p_reason => $2, p_op_key => $3) as r",
    [batch, reason, opKey ?? opk("bx")]);
  return r.rows[0].r;
}

// ---------------------------------------------------------------------------
// Block-L wrappers
// ---------------------------------------------------------------------------

export async function runClientLint({ client, opKey = null }) {
  const r = await roleQuery(ROLES.runtime,
    "select clara.run_client_lint(p_client => $1, p_op_key => $2) as r",
    [client, opKey ?? opk("lint")]);
  return r.rows[0].r;
}
export async function runLintAll({ opKey = null } = {}) {
  const r = await roleQuery(ROLES.runtime,
    "select clara.run_lint_all(p_op_key => $1) as r", [opKey ?? opk("linta")]);
  return r.rows[0].r;
}
export async function getLintFinding(sub, { finding }) {
  const r = await humanQuery(sub, "select clara.get_lint_finding(p_finding => $1) as r", [finding]);
  return r.rows[0].r;
}
export async function resolveLintFinding(sub, { finding, conclusion = "corrected", note = "rig note", opKey = null }) {
  const r = await humanQuery(sub,
    "select clara.resolve_lint_finding(p_finding => $1, p_conclusion => $2, p_note => $3, p_op_key => $4) as r",
    [finding, conclusion, note, opKey ?? opk("lres")]);
  return r.rows[0].r;
}

// ---------------------------------------------------------------------------
// Root readbacks (superuser bypasses RLS — fixtures/asserts only, never the lane).
// ---------------------------------------------------------------------------

const row1 = async (sql, params) => (await rootQuery(sql, params)).rows[0]?.row ?? null;
const rowsOf = async (sql, params) => (await rootQuery(sql, params)).rows.map((x) => x.row);

export const pageRow = (client, slug) =>
  row1("select to_jsonb(p) as row from clara.wiki_pages p where p.client_id=$1 and p.slug=$2", [client, slug]);
export const versionRows = (page) =>
  rowsOf("select to_jsonb(v) as row from clara.wiki_page_versions v where v.page_id=$1 order by v.version_n", [page]);
export const wikiLogRows = (client) =>
  rowsOf("select to_jsonb(l) as row from clara.wiki_log l where l.client_id=$1 order by l.created_at, l.id", [client]);
export const holdRow = (client) =>
  row1("select to_jsonb(h) as row from clara.wiki_synthesis_holds h where h.client_id=$1", [client]);
export const budgetVal = async (key) =>
  (await rootQuery("select value_int::bigint as v from clara.wiki_budgets where budget_key=$1", [key])).rows[0]?.v ?? null;
export const setBudget = (key, v) =>
  rootQuery("update clara.wiki_budgets set value_int=$2 where budget_key=$1", [key, v]);

export const planRow = (plan) =>
  row1("select to_jsonb(p) as row from clara.onboarding_plans p where p.id=$1", [plan]);
export const planItemRows = (plan) =>
  rowsOf("select to_jsonb(i) as row from clara.onboarding_plan_items i where i.plan_id=$1 order by i.created_at, i.id", [plan]);
export const planRevisionRows = (plan) =>
  rowsOf("select to_jsonb(r) as row from clara.onboarding_plan_revisions r where r.plan_id=$1 order by r.revision_n", [plan]);
export const clientRow = (client) =>
  row1("select to_jsonb(c) as row from clara.clients c where c.id=$1", [client]);

export const seedRegRow = (seed) =>
  row1("select to_jsonb(s) as row from clara.opening_seed_registry s where s.id=$1", [seed]);
export const openingItemRows = (seed) =>
  rowsOf("select to_jsonb(i) as row from clara.opening_items i where i.seed_id=$1 order by i.created_at, i.id", [seed]);
export const openingApprovalRows = (seed) =>
  rowsOf("select to_jsonb(a) as row from clara.opening_seed_approvals a where a.seed_id=$1 order by a.approved_at, a.id", [seed]);
export const entryRow = (entry) =>
  row1("select to_jsonb(e) as row from clara.journal_entries e where e.id=$1", [entry]);
export const entryLines = (entry) =>
  rowsOf("select to_jsonb(l) as row from clara.journal_lines l where l.entry_id=$1 order by l.line_no", [entry]);
export const faRow = (id) =>
  row1("select to_jsonb(f) as row from clara.fixed_assets f where f.id=$1", [id]);

export const batchRow = (batch) =>
  row1("select to_jsonb(b) as row from clara.seeding_batches b where b.id=$1", [batch]);
export const proposalRows = (batch) =>
  rowsOf("select to_jsonb(p) as row from clara.seeding_proposals p where p.batch_id=$1 order by p.created_at, p.id", [batch]);

export const findingRows = (client) =>
  rowsOf("select to_jsonb(f) as row from clara.lint_findings f where f.client_id=$1 order by f.opened_at, f.id", [client]);
export const openFinding = async (client, kind) =>
  (await findingRows(client)).find((f) => f.finding_kind === kind && f.state === "open") ?? null;
export const findingEventRows = (finding) =>
  rowsOf("select to_jsonb(e) as row from clara.lint_finding_events e where e.finding_id=$1 order by e.created_at, e.id", [finding]);
export const latestLintRun = () =>
  row1("select to_jsonb(r) as row from clara.lint_runs r order by r.started_at desc nulls last, r.id desc limit 1");

export const admissionRow = (token) =>
  row1("select to_jsonb(a) as row from clara.firm_admissions a where a.token=$1", [token]);

/** Domain events of a type for a firm whose serialized row contains `frag`. */
export async function eventsOf(firm, type, frag = null) {
  const rows = await rowsOf(
    "select to_jsonb(d) as row from clara.domain_events d where d.firm_id=$1 and d.event_type=$2 order by d.seq", [firm, type]);
  return frag == null ? rows : rows.filter((r) => JSON.stringify(r).includes(frag));
}

/** Seed the wiki_projection relay checkpoint (the ceremony's cold-start shape). */
export async function seedWikiCheckpoint(firm, lastSeq) {
  await rootQuery(
    `insert into clara.relay_checkpoints(consumer, firm_id, last_seq) values ('wiki_projection', $1, $2)
     on conflict (consumer, firm_id) do update set last_seq = excluded.last_seq`, [firm, lastSeq]);
}
