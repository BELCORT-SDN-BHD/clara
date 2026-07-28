// Wave-A2.1 rig — migration-0016 shared helper CORE (NOT a test file: the name
// does not end in `.test.mjs`, so `node --test` ignores it). Written by the
// CONTRACT-BLIND test lane straight from `docs/plan/wave-a2.1-migration-0016-design.md`
// (the pin doc) + `docs/plan/wave-a2.1-contract.md` §2/§3/§9 + migrations 0001–0015
// + the existing rig harness. It NEVER reads 0016 SQL (which does not exist in this
// lane's tree). The battery encodes the SPEC; a divergence between an expectation
// here and observed 0016 behavior is a FINDING for orchestrator adjudication,
// never a silent test edit.
//
// READINESS (the work order's requireMigration('0016') discipline): every 0016-
// dependent test gates on clara.schema_migrations carrying a '0016_%' row. At 15
// migrations the whole battery SKIPS loudly (no false greens, no crashes); each
// file keeps ONE meta-test that flips the suite on at integration.

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  ROLES, rootQuery, roleQuery, humanQuery, opk, markSkip,
  waveAEnsureReady, createClient, upsertAccountClassed, draftEntryV3, approveEntry,
  freshResolution, fnExists, hasColumn, resolveFn, callFnAdaptive, humanPersona,
  codingRuleRows, withSessionAuth,
} from "./wave-a-fixtures.mjs";

export * from "./wave-a-fixtures.mjs";

// ---------------------------------------------------------------------------
// Pinned vocabulary (pin doc P1/P2/P4; contract §2). These are the LAW — a
// divergence at integration is a finding, not a constant to edit.
// ---------------------------------------------------------------------------

/** RM 500,000 in cents — the STA 2018 First Schedule threshold (seeded). */
export const THRESHOLD_CENTS = 50_000_000;

/** The six new compliance tables (pin P1). */
export const A21_TABLES = [
  "sst_threshold_schedule",
  "client_turnover_accounts",
  "sst_future_attestations",
  "compliance_watches",
  "compliance_watch_events",
  "compliance_eval_runs",
];

export const WATCH_STATES = ["monitored", "early_warning", "crossed", "overdue", "resolved"];
export const WATCH_EVENT_KINDS = ["created", "tier_change", "acknowledged", "snoozed", "re_armed", "resolved", "evaluation"];
export const FM_STATUSES = ["not_assessed", "attested_below", "attested_above", "expired"];
export const RESOLVED_CONCLUSIONS = ["registration_recorded", "not_liable_documented"];
export const TRI_STATE = ["included", "excluded", "unknown_or_mixed"];

/** Named executor skip reasons (pin P2(e)/P4; contract §3.2/§3.3/§4). */
export const OCR_SKIP = {
  polarity: "polarity_unverified",
  direction: "direction_unproven",
  anchor: "anchor_missing",
  customer: "customer_unresolved",
  cn: "cn_not_autopostable",
  purchaseSst: "purchase_sst_not_autopostable",
  // 0023 (X5): corroboration now requires the document to STATE net and tax, so shapes that
  // used to reach the anchor block are refused one gate earlier, here.
  notCorroborated: "not_corroborated",
};

/** The suspended status the repeated-skip ladder flips a rule into (pin P2(e)). */
export const SUSPENDED_STATUS = "suspended_pending_resignature";

/** The new human/runtime compliance fns (pin P1) — P6 grant asserts iterate these. */
export const COMPLIANCE_FNS = [
  "evaluate_sst_watch",
  "evaluate_sst_watches_all",
  "set_turnover_classification",
  "record_future_attestation",
  "ack_compliance_watch",
  "snooze_compliance_watch",
  "resolve_compliance_watch",
];
/** Every fn 0016 introduces that the AGENT role must hold ZERO EXECUTE on (P6). */
export const A21_NEW_FNS = [...COMPLIANCE_FNS, "classify_document", "set_document_kind", "reconcile_autopost_rules"];

/** New event types 0016 registers (pin P5). */
export const A21_EVENT_TYPES = ["compliance.watch_transition", "document.classified"];

// ---------------------------------------------------------------------------
// Readiness — requireMigration('0016') per the work order: the gate is the
// clara.schema_migrations row, never the migration file on disk.
// ---------------------------------------------------------------------------

export async function a21Has0016() {
  try {
    const r = await rootQuery("select version from clara.schema_migrations where version ~ '^0016_'");
    return r.rows.length > 0;
  } catch {
    return false; // schema_migrations absent — certainly not at 0016
  }
}

/** Best-effort migrate (idempotent; tolerant of a dirty tree) then the 0016 gate. */
export async function a21EnsureReady() {
  const base = await waveAEnsureReady();
  const has16 = base ? await a21Has0016() : false;
  return { base, has16 };
}

/** Standard per-test skip gate — loud + counted (the fail-pre half of the proof). */
export function skip16(t, has16, msg = "0016 not applied (clara.schema_migrations has no '0016_%' row) — Wave-A2.1 cell dormant") {
  if (!has16) {
    markSkip();
    t.skip(msg);
    return true;
  }
  return false;
}

/** The per-file META test body: when 0016 is absent → an EXPLICIT skip; when
 *  present → assert the migration row + this file's marker objects, so a partial
 *  apply can never green the suite silently. Returns true when the suite is live. */
export async function metaProbe0016(t, has16, { label, tables = [], fns = [], columns = [] }) {
  if (!has16) {
    markSkip();
    t.skip(`0016 NOT applied — the ${label} battery is DORMANT (flips on when migration 0016 integrates)`);
    return false;
  }
  const mig = await rootQuery("select version from clara.schema_migrations where version ~ '^0016_'");
  assert.equal(mig.rows.length, 1, `exactly one applied 0016_* migration (got ${mig.rows.map((x) => x.version).join(",")})`);
  for (const tbl of tables) {
    const r = await rootQuery(
      "select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='clara' and c.relname=$1 and c.relkind='r'",
      [tbl],
    );
    assert.ok(r.rows.length, `clara.${tbl} exists (0016 marker for ${label})`);
  }
  for (const fn of fns) assert.ok(await fnExists(fn), `clara.${fn} exists (0016 marker for ${label})`);
  for (const [tbl, col] of columns) assert.ok(await hasColumn(tbl, col), `clara.${tbl}.${col} exists (0016 marker for ${label})`);
  return true;
}

// ---------------------------------------------------------------------------
// Pinned 0016 fn wrappers — NAMED args verbatim from the pin doc. A 42883 /
// param-name divergence at 0016 is a FINDING surfaced by the calling test.
// ---------------------------------------------------------------------------

/** evaluate_sst_watch(p_client, p_op_key) — SECURITY DEFINER, runtime-only. */
export async function evaluateSstWatch(client, opKey = null) {
  const r = await roleQuery(
    ROLES.runtime,
    "select clara.evaluate_sst_watch(p_client => $1, p_op_key => $2) as r",
    [client, opKey ?? opk("evalw")],
  );
  return r.rows[0].r;
}

/** evaluate_sst_watches_all(p_op_key) — the daily-sweep wrapper (one receipt). */
export async function evaluateAllWatches(opKey = null) {
  const r = await roleQuery(
    ROLES.runtime,
    "select clara.evaluate_sst_watches_all(p_op_key => $1) as r",
    [opKey ?? opk("evala")],
  );
  return r.rows[0].r;
}

export async function setTurnoverClassification(sub, {
  client, accountCode, classification, serviceGroup = null,
  reason = "rig turnover classification", evidence = "rig evidence note",
  effectiveFrom = "2018-09-01", opKey = null,
}) {
  const r = await humanQuery(
    sub,
    "select clara.set_turnover_classification(p_client => $1, p_account_code => $2, p_classification => $3, p_service_group => $4, p_reason => $5, p_evidence => $6, p_effective_from => $7::date, p_op_key => $8) as r",
    [client, accountCode, classification, serviceGroup, reason, evidence, effectiveFrom, opKey ?? opk("cls")],
  );
  return r.rows[0].r;
}

export async function recordFutureAttestation(sub, {
  client, serviceGroup = "G", expectedCents, horizonStart = "2026-08-01",
  evidence = "rig signed mandate review", expiresAt, opKey = null,
}) {
  const r = await humanQuery(
    sub,
    "select clara.record_future_attestation(p_client => $1, p_service_group => $2, p_expected_cents => $3::bigint, p_horizon_start => $4::date, p_evidence => $5, p_expires_at => $6::date, p_op_key => $7) as r",
    [client, serviceGroup, expectedCents, horizonStart, evidence, expiresAt, opKey ?? opk("att")],
  );
  return r.rows[0].r;
}

export async function ackWatch(sub, { watch, rationale = "rig acknowledged — advisory noted", opKey = null }) {
  const r = await humanQuery(
    sub,
    "select clara.ack_compliance_watch(p_watch => $1, p_rationale => $2, p_op_key => $3) as r",
    [watch, rationale, opKey ?? opk("ack")],
  );
  return r.rows[0].r;
}

export async function snoozeWatch(sub, { watch, until, rationale = "rig snooze — awaiting client call", opKey = null }) {
  const r = await humanQuery(
    sub,
    "select clara.snooze_compliance_watch(p_watch => $1, p_until => $2::timestamptz, p_rationale => $3, p_op_key => $4) as r",
    [watch, until, rationale, opKey ?? opk("snz")],
  );
  return r.rows[0].r;
}

export async function resolveWatch(sub, { watch, conclusion, evidence = "rig resolution evidence", opKey = null }) {
  const r = await humanQuery(
    sub,
    "select clara.resolve_compliance_watch(p_watch => $1, p_conclusion => $2, p_evidence => $3, p_op_key => $4) as r",
    [watch, conclusion, evidence, opKey ?? opk("res")],
  );
  return r.rows[0].r;
}

/** classify_document(p_document, p_kind, p_confidence, p_engine_id, p_op_key, p_task, p_run) —
 *  runtime. 0024 round 3 (P1/P2) removed the SQL-side default on p_task/p_run — this JS
 *  wrapper always supplies BOTH positions explicitly (even when the value itself is `null`),
 *  so a caller through this helper never triggers the arity break (42883); that break is
 *  exercised directly (a raw 5-arg query) by the cell proving P1. `task`/`run` default to
 *  `null` here for the SAME reason the old comment described: a cell proving the p_task=NULL
 *  no-task ceremony path passes `task: null` EXPLICITLY; a cell not naming `task` at all gets
 *  the same null via the default — indistinguishable at the SQL boundary. `run` has no
 *  meaning when `task` is null (P1's ceremony branch never reads it) and MUST match the
 *  claim's own workflow_run_id when `task` is set (P2) — callers proving the task-bound path
 *  pass both together via `runningClassifyTask`. */
// Q1 (round 4): p_claim_secret is ALSO required (no SQL-side default, same P1 discipline) —
// this wrapper always supplies it (even as `null`) so a plain call through this helper never
// triggers the arity break; that break is exercised directly (a raw 7-arg query) by its own
// cell. `secret` MUST be the value the caller's own claim received (workflow_run_id alone is
// no longer sufficient — Q1) for a task-bound settle to succeed; it is meaningless (and
// unchecked) when `task` is null.
export async function classifyDocument({ document, kind, confidence = 0.95, engineId = "clara-classify-llm:v1", opKey = null, task = null, run = null, secret = null }) {
  const r = await roleQuery(
    ROLES.runtime,
    "select clara.classify_document(p_document => $1, p_kind => $2, p_confidence => $3::numeric, p_engine_id => $4, p_op_key => $5, p_task => $6, p_run => $7, p_claim_secret => $8) as r",
    [document, kind, confidence, engineId, opKey ?? opk("clsdoc"), task, run, secret],
  );
  return r.rows[0].r;
}

/** set_document_kind(p_document, p_kind, p_reason, p_op_key) — human override (bookkeeper+). */
export async function setDocumentKind(sub, { document, kind, reason = "rig kind correction", opKey = null }) {
  const r = await humanQuery(
    sub,
    "select clara.set_document_kind(p_document => $1, p_kind => $2, p_reason => $3, p_op_key => $4) as r",
    [document, kind, reason, opKey ?? opk("setkind")],
  );
  return r.rows[0].r;
}

// ---------------------------------------------------------------------------
// Root readbacks (superuser bypasses RLS — fixtures/asserts only, never the lane).
// ---------------------------------------------------------------------------

export async function watchRows(client) {
  const r = await rootQuery("select to_jsonb(w) as row from clara.compliance_watches w where w.client_id=$1 order by w.created_at, w.id", [client]);
  return r.rows.map((x) => x.row);
}

/** The one OPEN (state <> resolved) episode for (client, group) — pin P1's partial unique. */
export async function openWatchRow(client, group = "G") {
  const r = await rootQuery(
    "select to_jsonb(w) as row from clara.compliance_watches w where w.client_id=$1 and w.service_group=$2 and w.state <> 'resolved' order by w.created_at desc limit 1",
    [client, group],
  );
  return r.rows[0]?.row ?? null;
}

export async function watchEventRows(watch) {
  const r = await rootQuery("select to_jsonb(e) as row from clara.compliance_watch_events e where e.watch_id=$1 order by e.created_at, e.id", [watch]);
  return r.rows.map((x) => x.row);
}

export async function watchEventCount(watch, kind) {
  const r = await rootQuery("select count(*)::int as n from clara.compliance_watch_events where watch_id=$1 and event_kind=$2", [watch, kind]);
  return r.rows[0].n;
}

export async function evalRunCount() {
  const r = await rootQuery("select count(*)::int as n from clara.compliance_eval_runs");
  return r.rows[0].n;
}

export async function latestEvalRun() {
  const r = await rootQuery("select to_jsonb(x) as row from clara.compliance_eval_runs x order by x.started_at desc nulls last, x.id desc limit 1");
  return r.rows[0]?.row ?? null;
}

export async function docKind(document) {
  const r = await rootQuery("select document_kind from clara.documents where id=$1", [document]);
  return r.rows[0]?.document_kind ?? null;
}

/** All processing-task rows for a document (any lane), newest first. */
export async function docTasks(document) {
  const r = await rootQuery("select to_jsonb(t) as row from clara.document_processing_tasks t where t.document_id=$1 order by t.created_at desc, t.id desc", [document]);
  return r.rows.map((x) => x.row);
}

export async function lastSkipReason(entry) {
  const r = await rootQuery("select reason from clara.rule_post_skips where entry_id=$1 order by created_at desc limit 1", [entry]);
  return r.rows[0]?.reason ?? null;
}

export async function entryStatusOf(entry) {
  const r = await rootQuery("select status from clara.journal_entries where id=$1", [entry]);
  return r.rows[0]?.status ?? null;
}

export async function ruleRowById(id) {
  const r = await rootQuery("select to_jsonb(x) as row from clara.coding_rules x where x.id=$1", [id]);
  return r.rows[0]?.row ?? null;
}

/** Notification rows whose serialized form contains `fragment` (tolerant search —
 *  the notification kind vocabulary is contract-silent; presence is the pin). */
export async function notificationsMatching(fragment) {
  const r = await rootQuery("select to_jsonb(n) as row from clara.notifications n order by n.created_at desc limit 500");
  return r.rows.map((x) => x.row).filter((row) => JSON.stringify(row).includes(fragment));
}

// ---------------------------------------------------------------------------
// Watch fixtures — synthetic clients whose turnover arithmetic is fully pinned.
// Deterministic amounts; the debit side always lands on an EXPLICITLY-EXCLUDED
// cash account so the evaluator's account universe (income-only vs all-accounts,
// an open interpretation) cannot change any asserted figure.
// ---------------------------------------------------------------------------

export const CASH = "1000"; // asset, classified 'excluded'
export const INC = "4000"; // income, classified 'included' (group G by default)
export const INC2 = "4100"; // income, left UNCLASSIFIED (tri-state default cell)
export const INC_I = "4200"; // income, classified 'included' group I

/** A fresh firm-A client with cash + income accounts and pinned classifications. */
export async function freshWatchClient(sub, {
  name = null, groups = { [INC]: "G" }, unclassified = [], excludeCash = true,
} = {}) {
  const client = await createClient(sub, { name: name ?? `a21w_${Date.now().toString(36)}_${randomUUID().slice(0, 6)}`, opKey: opk("cli") });
  await upsertAccountClassed(sub, { client, code: CASH, name: "Cash", type: "asset", opKey: opk("acc") });
  for (const [code, group] of Object.entries(groups)) {
    await upsertAccountClassed(sub, { client, code, name: `Income ${code}`, type: "income", opKey: opk("acc") });
    await setTurnoverClassification(sub, { client, accountCode: code, classification: "included", serviceGroup: group });
  }
  for (const code of unclassified) {
    await upsertAccountClassed(sub, { client, code, name: `Income ${code}`, type: "income", opKey: opk("acc") });
  }
  if (excludeCash) {
    // Watch-lowering ('excluded') floors at admin+ (WA21-R5) — `sub` must be owner/admin.
    await setTurnoverClassification(sub, { client, accountCode: CASH, classification: "excluded", reason: "asset control — never turnover" });
  }
  return client;
}

/** Approve a turnover entry: Dr `debit`(cash) / Cr `account`(income) = cents on
 *  `date`. Maker and checker distinct so high-stakes amounts clear maker-checker
 *  without attestation; flags pass through (is_year_end / closing_transfer, P7). */
export async function approvedTurnoverEntry({
  maker, checker, client, cents, date, account = INC, debit = CASH,
  flags = null, attestation = null, memo = "rig turnover",
}) {
  const d = await draftEntryV3(maker, {
    client,
    resolution: await freshResolution(maker, client),
    lines: [
      { account_code: debit, debit_cents: cents, credit_cents: 0, description: "turnover-dr" },
      { account_code: account, debit_cents: 0, credit_cents: cents, description: "turnover-cr" },
    ],
    flags, memo, postingDate: date, opKey: opk("to"),
  });
  const approveArgs = { entry: d.entry_id, expectedRevision: d.revision_token, opKey: opk("toa") };
  if (attestation) approveArgs.attestation = attestation;
  await approveEntry(checker, approveArgs);
  return d.entry_id;
}

/** ADV-R2 (R1#5 strict): the OCR floor demands >=6 DISTINCT STATED invoice
 *  numbers — sighting fixtures seed a minimal done invoice_facts extraction
 *  stating one (raw, the D-P4 idiom; the doc keeps exactly ONE done lane). */
export async function seedStatedInvoiceFacts(cited, { firm, invoiceId = null } = {}) {
  const id = invoiceId ?? `RIG-${randomUUID().slice(0, 10)}`;
  const ext = randomUUID();
  await rootQuery(
    `insert into clara.document_processing_tasks(firm_id,document_id,engine_id,engine_config,version_n,lane,status,workflow_run_id,started_at,finished_at)
     values($1,$2,'clara-fixture:v1','{}'::jsonb,1,'invoice_facts','done','rig-stated-id',now(),now())`,
    [firm, cited.documentId],
  );
  await rootQuery(
    `insert into clara.document_extractions(id,firm_id,document_id,engine_id,engine_kind,version_n,status,page_count)
     values($1,$2,$3,'clara-fixture:v1','invoice_facts',1,'done',1)`,
    [ext, firm, cited.documentId],
  );
  await rootQuery(
    `insert into clara.document_regions(firm_id,extraction_id,locator_kind,locator,field_path,text_content,engine_confidence)
     values($1,$2,'page_polygon','{"page":1,"polygon":[0,0,1,1]}'::jsonb,'invoice.invoice_id',$3,1.0)`,
    [firm, ext, id],
  );
  return id;
}

// ---------------------------------------------------------------------------
// Autopost plumbing shared across the P2/P4 files (the proven Wave-A2 idioms).
// ---------------------------------------------------------------------------

/** Propose an autopost rule via the as-built jsonb-proposal writer. Returns
 *  {id} or {error} — refusal cells inspect .error, happy cells .id. */
export async function proposeAutopostRule(sub, {
  client, cp, accountCode, cap = 200000, windowMax = 3, direction = "purchase",
  evidenceClass = undefined, expiresAt = undefined, supersedes = undefined,
  opKey = undefined, /* ADV-R3#5: replay cells pin the op_key */ }) {
  const proposeFn = await resolveFn(["propose_autopost_rule"], { label: "autopost proposer" });
  if (!proposeFn) return { error: Object.assign(new Error("propose_autopost_rule absent"), { code: "42883" }) };
  const proposal = {
    client_id: client, counterparty_id: cp, account_code: accountCode,
    amount_cap: (cap / 100).toFixed(2), frequency_window: "monthly",
    window_max_posts: windowMax, direction,
  };
  if (evidenceClass !== undefined) proposal.evidence_class = evidenceClass;
  if (expiresAt !== undefined) proposal.expires_at = expiresAt;
  if (supersedes !== undefined) proposal.supersedes_rule_id = supersedes;
  try {
    const r = await callFnAdaptive(proposeFn, { proposal, op_key: opKey ?? opk("prop") }, { persona: humanPersona(sub), label: proposeFn });
    // ADV-R2#4: a bounds refusal is a TYPED AUDITED RETURN — surface it error-shaped.
    if (r && typeof r === "object" && r.status === "refused") {
      return { error: Object.assign(new Error(`refused: ${r.reason}`), {
        code: "CLR27", detail: JSON.stringify({ reason: r.reason }), refusedReturn: true,
      }) };
    }
    let id = r?.rule_id ?? r?.id ?? (typeof r === "string" ? r : null);
    if (!id) {
      const rows = (await codingRuleRows(client)).filter((x) => x.rule_type === "autopost");
      id = rows[rows.length - 1]?.id ?? null;
    }
    return { id };
  } catch (e) {
    return { error: e };
  }
}

export async function signAutopostRule(sub, { rule }) {
  const signFn = await resolveFn(["sign_autopost_rule"], { label: "autopost signer" });
  if (!signFn) throw Object.assign(new Error("sign_autopost_rule absent"), { code: "42883" });
  return callFnAdaptive(signFn, { rule, op_key: opk("sign") }, { persona: humanPersona(sub), label: signFn });
}

/** Post a draft via the runtime-login shell (the ONLY grantee of execute_rule_post). */
export async function postViaRule(entry, { opKey = null } = {}) {
  return withSessionAuth("clara_runtime_login", async (c) => {
    const r = await c.query("select clara.execute_rule_post(p_entry => $1, p_op_key => $2) as r", [entry, opKey ?? `rulepost:${entry}:${randomUUID().slice(0, 8)}`]);
    return r.rows[0].r;
  });
}

// ---------------------------------------------------------------------------
// Small structural probes shared by the files.
// ---------------------------------------------------------------------------

/** string_agg of a table's CHECK constraint defs (structural vocabulary asserts). */
export async function checkDefs(table) {
  const r = await rootQuery(
    `select string_agg(pg_get_constraintdef(c.oid),' ~~ ') as d from pg_constraint c
       join pg_class t on t.oid=c.conrelid join pg_namespace n on n.oid=t.relnamespace
      where n.nspname='clara' and t.relname=$1 and c.contype='c'`,
    [table],
  );
  return r.rows[0].d ?? "";
}

/** All unique-index defs of a table. */
export async function uniqueIndexDefs(table) {
  const r = await rootQuery(
    `select pg_get_indexdef(ix.indexrelid) as def from pg_index ix
       join pg_class t on t.oid=ix.indrelid join pg_namespace n on n.oid=t.relnamespace
      where n.nspname='clara' and t.relname=$1 and ix.indisunique`,
    [table],
  );
  return r.rows.map((x) => x.def);
}

/** rls/force flags for a clara table. */
export async function rlsFlags(table) {
  const r = await rootQuery(
    "select c.relrowsecurity as rls, c.relforcerowsecurity as force from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='clara' and c.relname=$1 and c.relkind='r'",
    [table],
  );
  return r.rows[0] ?? null;
}

/** Whether `role` may EXECUTE any overload of clara.<fn> (oid-based, arity-proof). */
export async function roleCanExecute(role, fn) {
  const r = await rootQuery(
    `select bool_or(pg_catalog.has_function_privilege($1, p.oid, 'execute')) as ok
       from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='clara' and p.proname=$2`,
    [role, fn],
  );
  return r.rows[0]?.ok ?? null; // null = fn absent
}

/** prosrc of every clara overload of `fn`, concatenated. */
export async function fnSource(fn) {
  const r = await rootQuery(
    "select string_agg(p.prosrc, ' ~~ ') as src from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='clara' and p.proname=$1",
    [fn],
  );
  return r.rows[0].src ?? "";
}

/** Deep-collect every object in a jsonb payload carrying row_kind === kind. */
export function collectRowKind(payload, kind) {
  const hits = [];
  const walk = (node) => {
    if (node == null || typeof node !== "object") return;
    if (Array.isArray(node)) { node.forEach(walk); return; }
    if (node.row_kind === kind) hits.push(node);
    Object.values(node).forEach(walk);
  };
  walk(payload);
  return hits;
}

export const rm = (cents) => `RM ${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
