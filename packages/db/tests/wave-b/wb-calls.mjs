// Wave-B rig — Block-K/S/L fn wrappers + root readbacks (NOT a test file).
// Contract-blind: pinned NAMED args from the 0017 design set; never reads the
// migration. Re-exports wb-helpers so a test file imports ONE leaf.
// [AMB-n] markers refer to the ambiguity ledger in wb-helpers.mjs.

import { randomUUID } from "node:crypto";
import {
  ROLES, rootQuery, roleQuery, humanQuery, opk, jtxt, shaHex, publishWikiPage,
} from "./wb-helpers.mjs";

export * from "./wb-helpers.mjs";

// ---------------------------------------------------------------------------
// Observed-blocking wait helper (mirrors rig-runtime-race.mjs's waitBlockedBy
// convention: pg_blocking_pids resolves the tuple/lock chain; wait_event_type
// ='Lock' proves a genuine wait, not a scheduling artifact). Lives here
// (not wb-fixtures.mjs) to stay under the repo's 500-line-per-module lint
// convention. Unlike the silent-false rig helper, this one FAILS LOUDLY on
// timeout — a race driver that never proves the block proves nothing about
// the interleaving it claims to test.
// ---------------------------------------------------------------------------

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Poll (bounded, default ~5s / 25ms) until backend `pid` is observably
 *  WAITING (wait_event_type='Lock') on a lock held by `blockerPid`. Throws
 *  on timeout instead of returning false — callers want the race PROVEN, not
 *  merely attempted. */
export async function waitBlockedByOrThrow(pid, blockerPid, {
  timeoutMs = 5000, intervalMs = 25, what = "the row lock",
} = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const r = await rootQuery(
      "select wait_event_type as wet, pg_blocking_pids(pid) as blockers from pg_stat_activity where pid = $1",
      [pid],
    );
    const row = r.rows[0];
    if (row && row.wet === "Lock" && (row.blockers || []).map(Number).includes(Number(blockerPid))) return true;
    await sleep(intervalMs);
  }
  throw new Error(
    `waitBlockedByOrThrow: backend ${pid} never observably blocked on ${what} (held by ${blockerPid}) within ${timeoutMs}ms`);
}

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

/** [AMB-8] — one-call FA seeding. [0018 §2] gains the OPTIONAL p_resolution
 *  named arg: OMITTED (the default, `resolution` key absent/undefined) binds the
 *  4-arg call verbatim — the exact byte-shape the five pinned FA tests already
 *  pass, so they stay green against the 5-arg-with-default signature; SUPPLIED
 *  (a uuid, or an explicit null — the contract treats null ≡ omitted) adds
 *  p_resolution to the call. Awaits a promise resolution the same way the K
 *  drafters do. */
export async function seedFixedAsset(sub, { client, seed, asset, resolution = undefined, opKey = null }) {
  const specs = ["p_client => $1", "p_seed => $2", "p_asset => $3::jsonb"];
  const vals = [client, seed, jtxt(asset)];
  if (resolution !== undefined) { specs.push(`p_resolution => $${vals.length + 1}`); vals.push(await resolution); }
  specs.push(`p_op_key => $${vals.length + 1}`); vals.push(opKey ?? opk("fa"));
  const r = await humanQuery(sub, `select clara.seed_fixed_asset(${specs.join(", ")}) as r`, vals);
  return r.rows[0].r;
}

/** [0018 §1] The subject-bound keyed-resolution mint verb. Human lane, bookkeeper+
 *  floor; the fn pins confidence 1.0 + subject_kind='manual'/subject_id=p_seed +
 *  bound_scope_kind='opening_seed'/bound_scope_id=p_seed internally — there is NO
 *  caller confidence/subject arg (a categorical human confirmation). Returns the
 *  receipt jsonb; callers read .resolution_id.
 *  [R1-0018-2] `evidence: null` (explicit) sends a genuine SQL-NULL p_evidence —
 *  distinct from `jtxt(null)` (the string "null", i.e. the JSON null literal,
 *  which is a non-object and would wrongly refuse evidence_not_object). Every
 *  other value (the {} default, an object, or a non-object probe payload) still
 *  goes through jtxt() unchanged. */
export async function recordOpeningKeyedResolution(sub, { client, seed, evidence = {}, opKey = null }) {
  const r = await humanQuery(sub,
    "select clara.record_opening_keyed_resolution(p_client => $1, p_seed => $2, p_evidence => $3::jsonb, p_op_key => $4) as r",
    [client, seed, evidence === null ? null : jtxt(evidence), opKey ?? opk("okr")]);
  return r.rows[0].r;
}

// [AMB-0018-1] The keyed opening lane (draft_opening_item / seed_fixed_asset with
// p_document NULL) is now SEED-BOUND (WB-R24(i)): its resolution must be minted by
// record_opening_keyed_resolution for that exact seed. This helper mints one bound
// resolution per KEYED seed and reuses it across every keyed draft on that seed
// (seed-grain binding is by design — one live binding serves the whole set). It
// returns a promise resolving to the resolution_id, which the drafter wrappers
// already `await`, so a keyed-lane `freshResolution(sub, client)` call site becomes
// a drop-in `keyedRes(sub, { client, seed })` with no shape change. NOT for tied
// seeds (record_opening_keyed_resolution refuses those) or the document lane.
const _keyedResBySeed = new Map(); // seed -> Promise<resolution_id>
export function keyedRes(sub, { client, seed }) {
  if (!_keyedResBySeed.has(seed)) {
    _keyedResBySeed.set(seed, recordOpeningKeyedResolution(sub, { client, seed })
      .then((m) => m.resolution_id ?? m.id));
  }
  return _keyedResBySeed.get(seed);
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

// --- [0019] provenance-relation readbacks (the stale-marker surface) --------
/** Citation rows of ONE version (immutable, versioned provenance). */
export const citationRows = (version) =>
  rowsOf("select to_jsonb(c) as row from clara.wiki_page_citations c where c.version_id=$1 order by c.created_at, c.id", [version]);
/** Every citation row of a PAGE across all versions (current + superseded) —
 *  the scope-precision cells need the superseded rows too. */
export const pageCitationRows = (page) =>
  rowsOf(`select to_jsonb(c) as row from clara.wiki_page_citations c
            join clara.wiki_page_versions v on v.id=c.version_id
           where v.page_id=$1 order by v.version_n, c.id`, [page]);
/** Page-level refs (MUTABLE — deleted and re-created on every republish). */
export const refRows = (page) =>
  rowsOf("select to_jsonb(r) as row from clara.wiki_page_refs r where r.page_id=$1 order by r.created_at, r.id", [page]);
/** audit_log rows for one fn whose args mention `frag` (op_key, usually). */
export const auditRowsFor = async (fn, frag = null) => {
  const rows = await rowsOf(
    "select to_jsonb(a) as row from clara.audit_log a where a.fn=$1 order by a.at, a.id", [fn]);
  return frag == null ? rows : rows.filter((r) => JSON.stringify(r).includes(frag));
};
/** The op_receipts row for (fn, op_key) — null when no reservation survives. */
export const opReceiptRow = (fn, opKey) =>
  row1("select to_jsonb(o) as row from clara.op_receipts o where o.fn=$1 and o.op_key=$2", [fn, opKey]);
/** Every index definition on a clara relation (index-coverage asserts). */
export const indexDefs = async (table) => (await rootQuery(
  `select pg_get_indexdef(ix.indexrelid) as def from pg_index ix
     join pg_class t on t.oid=ix.indrelid join pg_namespace n on n.oid=t.relnamespace
    where n.nspname='clara' and t.relname=$1`, [table])).rows.map((x) => x.def);
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
/** [0018 §1] A client_resolutions row (bound-column / supersede-state asserts). */
export const resolutionRow = (id) =>
  row1("select to_jsonb(r) as row from clara.client_resolutions r where r.id=$1", [id]);

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

// 裁-16b (pre-beta hardening batch): firm_admissions stores token_hash only -- callers still
// pass the plaintext token they were minted; the lookup hashes it before comparing.
export const admissionRow = (token) =>
  row1("select to_jsonb(a) as row from clara.firm_admissions a where a.token_hash=sha256(convert_to($1::text,'UTF8'))", [token]);

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

// ---------------------------------------------------------------------------
// [GATE 5] A firm-A vendor + ONE coding_rules row — the cross-firm
// sign_coding_rule probe target. Any status/type works: the CLR11 firm-check
// in sign_coding_rule (0016:3093) precedes every status/type check, so a
// 'proposed' vendor_account row is a sufficient, minimal target.
// ---------------------------------------------------------------------------

export async function stageFirmAProbeRule(sub, { firm, client, accountCode }) {
  const name = "WB Crossfirm Probe Vendor SDN BHD";
  const cp = (await rootQuery(
    `insert into clara.counterparties(firm_id,client_id,kind,name,name_normalized,created_by)
     values ($1,$2,'vendor',$3,$4,$5) returning id`,
    [firm, client, name, name.toLowerCase().replace(/[^a-z0-9]/g, ""), sub])).rows[0].id;
  const contentHash = shaHex(`crossfirm-probe-rule:${randomUUID()}`);
  const rule = (await rootQuery(
    `insert into clara.coding_rules(firm_id,client_id,rule_type,counterparty_id,account_code,status,pinned,origin,content_hash,created_by)
     values ($1,$2,'vendor_account',$3,$4,'proposed',false,'authored',$5,$6) returning id`,
    [firm, client, cp, accountCode, contentHash, sub])).rows[0].id;
  return rule;
}

// ---------------------------------------------------------------------------
// [GATE 6] Large-corpus proof fixtures — TRUE default budgets, never
// setBudget. seedWikiCorpus publishes a deterministic, byte-exact ASCII
// corpus; expectedPackWindow replicates the get_context_pack v4 wiki-block
// CTE EXACTLY (0017:5029-5066): priority map, (priority,updated_at desc,slug)
// order, a running-bytes prefix cutoff. Reads the DB-assigned updated_at back
// (root, epoch double — tie-safe past JS Date's millisecond truncation).
// ---------------------------------------------------------------------------

/** Publish `pages` ({slug,page_kind,bytes}) for `client` with deterministic
 *  ASCII content of EXACT byte length ('#'+'x'.repeat(bytes-1)). Counterparty-
 *  kind pages get `counterparty` (the W1 CHECK requires counterparty_id for
 *  page_kind='counterparty'). Returns [{slug,page_kind,bytes,content,updatedAt}]. */
export async function seedWikiCorpus(client, firm, { counterparty, pages }) {
  const model = [];
  for (const p of pages) {
    const content = "#" + "x".repeat(p.bytes - 1);
    const opts = { client, firm, slug: p.slug, pageKind: p.page_kind, title: p.slug, content };
    if (p.page_kind === "counterparty") opts.counterparty = counterparty;
    await publishWikiPage(opts);
    const ts = (await rootQuery(
      "select extract(epoch from updated_at) as ts from clara.wiki_pages where client_id=$1 and slug=$2",
      [client, p.slug])).rows[0].ts;
    model.push({ slug: p.slug, page_kind: p.page_kind, bytes: p.bytes, content, updatedAt: Number(ts) });
  }
  return model;
}

const WIKI_PACK_PRIORITY = {
  profile: 1, period_context: 2, treatment: 3, recurring_pattern: 4, counterparty: 5,
};

/** Replicate the DB's budgeted-window selection over a seedWikiCorpus model.
 *  Returns the ordered included [{slug,content}] — a strict prefix cutoff
 *  (running bytes is monotone), never a partial page. */
export function expectedPackWindow(model, { pageCap, byteCap }) {
  const ranked = model
    .map((p) => ({ ...p, priority: WIKI_PACK_PRIORITY[p.page_kind] ?? 6 }))
    .sort((a, b) => a.priority - b.priority || b.updatedAt - a.updatedAt
      || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
  let running = 0;
  const out = [];
  ranked.forEach((r, i) => {
    running += Buffer.byteLength(r.content, "utf8");
    if (i + 1 <= pageCap && running <= byteCap) out.push({ slug: r.slug, content: r.content });
  });
  return out;
}
