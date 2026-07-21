// Wave-A rig — read-fn wrappers + root readbacks (NOT a test file). Re-exports
// wave-a-helpers so the chain stays single-import. Contract-blind: every new 0011
// read fn is called by its PINNED name (INTERFACE-PINS §2/§5a) with named args —
// a 42883 / column divergence at 0011 is a FINDING (surfaced by the calling test),
// never a rig bug. When 0011 is absent the test that would call these is already
// SKIPPED by skipUnready(), so a named call never fires against a missing fn.

import {
  ROLES, human, wakeActor, roleActor, rootActor, runAs, humanQuery, rootQuery, roleQuery,
} from "./wave-a-helpers.mjs";
export * from "./wave-a-helpers.mjs";

// ---------------------------------------------------------------------------
// Persona builders for the lane-fn matrix (PINS §1 / companion §3). The agent
// lane sets the wake GUC txn-local (wakeActor → asWake transaction:true).
// ---------------------------------------------------------------------------

export const humanPersona = (sub) => human(sub);
export const agentPersona = (secret) => wakeActor(ROLES.agentRo, secret);
export const rawRole = (role) => roleActor(role);
export const rootPersona = rootActor;

// ---------------------------------------------------------------------------
// coding_lane / list_coding_lanes — DEFINER table-returning reads (companion §3).
// coding_lane returns ONE row (lane, reasons text[]); list_coding_lanes a setof.
// ---------------------------------------------------------------------------

/** coding_lane(p_client, p_filing) → {lane, reasons}. Under any persona. On the
 *  agent lane a cross-client / cross-firm call must return the SINGLE not-found
 *  shape (null lane / empty), never raise an oracle. */
export async function codingLane(persona, { client, filing }) {
  const r = await runAs(persona, "select lane, reasons from clara.coding_lane(p_client => $1, p_filing => $2)", [client, filing]);
  return r.rows[0] ?? null; // no row = the single not-found shape
}

/** list_coding_lanes(p_client) → [{filing_id, lane, reasons}]. */
export async function listCodingLanes(persona, { client }) {
  const r = await runAs(persona, "select filing_id, lane, reasons from clara.list_coding_lanes(p_client => $1)", [client]);
  return r.rows;
}

// ---------------------------------------------------------------------------
// Queue + card-hydration reads (PINS §2/§5a; human lane / definer).
// ---------------------------------------------------------------------------

/** list_review_queue(p_scope, p_cursor, p_limit) → jsonb (single snapshot). */
export async function listReviewQueue(persona, { scope = {}, cursor = null, limit = 50 } = {}) {
  const r = await runAs(persona,
    "select clara.list_review_queue(p_scope => $1::jsonb, p_cursor => $2::jsonb, p_limit => $3) as r",
    [JSON.stringify(scope ?? {}), cursor == null ? null : JSON.stringify(cursor), limit]);
  return r.rows[0].r;
}

export async function getSweepRun(sub, { run }) {
  const r = await humanQuery(sub, "select clara.get_sweep_run(p_run => $1) as r", [run]);
  return r.rows[0].r;
}
export async function getOpenQuestion(sub, { question }) {
  const r = await humanQuery(sub, "select clara.get_open_question(p_question => $1) as r", [question]);
  return r.rows[0].r;
}
export async function getCodingRule(sub, { rule }) {
  const r = await humanQuery(sub, "select clara.get_coding_rule(p_rule => $1) as r", [rule]);
  return r.rows[0].r;
}

// ---------------------------------------------------------------------------
// Diff reads (PINS §5a; authenticated + agent_ro client-pinned).
// ---------------------------------------------------------------------------

export async function getEntryDiff(persona, { entry, client }) {
  const r = await runAs(persona, "select clara.get_entry_diff(p_entry => $1, p_client => $2) as r", [entry, client]);
  return r.rows[0].r;
}
export async function getDocEntryDiff(persona, { entry, client }) {
  const r = await runAs(persona, "select clara.get_doc_entry_diff(p_entry => $1, p_client => $2) as r", [entry, client]);
  return r.rows[0].r;
}

/** get_document_for_human_read(p_document, p_user) — runtime lane (PIN-DELTA-4). */
export async function getDocumentForHumanRead({ document, user }) {
  const r = await roleQuery(ROLES.runtime, "select clara.get_document_for_human_read(p_document => $1, p_user => $2) as r", [document, user]);
  return r.rows[0].r;
}

// ---------------------------------------------------------------------------
// Root readbacks for the new tables (superuser bypasses RLS, sees every firm).
// ---------------------------------------------------------------------------

const rows = async (sql, params) => (await rootQuery(sql, params)).rows.map((x) => x.row);

export async function aliasRows(client) {
  return rows("select to_jsonb(a) as row from clara.counterparty_aliases a where a.client_id=$1 order by a.created_at, a.id", [client]);
}
export async function attemptRow(filing) {
  const r = await rootQuery("select to_jsonb(a) as row from clara.autodraft_attempts a where a.filing_id=$1", [filing]);
  return r.rows[0]?.row ?? null;
}
export async function sweepRunRow(run) {
  const r = await rootQuery("select to_jsonb(s) as row from clara.sweep_runs s where s.id=$1", [run]);
  return r.rows[0]?.row ?? null;
}
export async function sweepItemRows(run) {
  return rows("select to_jsonb(i) as row from clara.sweep_run_items i where i.run_id=$1 order by i.filing_id", [run]);
}
export async function codingRuleRows(client) {
  return rows("select to_jsonb(r) as row from clara.coding_rules r where r.client_id=$1 order by r.created_at, r.id", [client]);
}
export async function sightingRows(client) {
  return rows("select to_jsonb(s) as row from clara.rule_sightings s where s.client_id=$1 order by s.account_code, s.entry_id", [client]);
}
export async function ruleDecisionRows(entry) {
  return rows("select to_jsonb(d) as row from clara.rule_decisions d where d.entry_id=$1 order by d.created_at", [entry]);
}
export async function questionRows(client) {
  return rows("select to_jsonb(q) as row from clara.open_questions q where q.client_id=$1 order by q.opened_at, q.id", [client]);
}
export async function revisionRows(entry) {
  return rows("select to_jsonb(v) as row from clara.journal_entry_revisions v where v.entry_id=$1 order by v.revision_no", [entry]);
}
export async function consentRows(client) {
  return rows("select to_jsonb(c) as row from clara.client_egress_consents c where c.client_id=$1 order by c.granted_at, c.id", [client]);
}
/** The live consent row for a client (partial-unique: one live per client), or null. */
export async function liveConsent(client) {
  const r = await rootQuery("select to_jsonb(c) as row from clara.client_egress_consents c where c.client_id=$1 and c.revoked_at is null", [client]);
  return r.rows[0]?.row ?? null;
}
export async function counterpartyRow(id) {
  const r = await rootQuery("select to_jsonb(c) as row from clara.counterparties c where c.id=$1", [id]);
  return r.rows[0]?.row ?? null;
}
/** Approved-unreversed count of an entry's status (root). */
export async function entryStatus(entry) {
  const r = await rootQuery("select status from clara.journal_entries where id=$1", [entry]);
  return r.rows[0]?.status ?? null;
}
/** Count clara rows matching a predicate (root). */
export async function countWhere(table, whereSql, params) {
  const r = await rootQuery(`select count(*)::int as n from clara.${table} where ${whereSql}`, params);
  return r.rows[0].n;
}
