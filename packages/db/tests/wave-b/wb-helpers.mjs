// Wave-B rig — migration-0017 shared helper CORE (NOT a test file). Written by
// the CONTRACT-BLIND test lane straight from the three-part pin set
// `docs/plan/wave-b-migration-0017-design.md` (+ -part2/-part3) — the 0017 SQL
// is NEVER read (ADR-029 discipline). A divergence between an expectation here
// and observed 0017 behavior is a FINDING for orchestrator adjudication, never
// a silent test edit. Module layout (repo 500-line lint): wb-helpers (constants
// + readiness + W/O wrappers) → wb-calls (K/S/L wrappers + readbacks) →
// wb-fixtures (world + drivers). Test files import ONE leaf.
//
// READINESS (work-order override of the a21 skip idiom): this battery must
// FAIL — not skip — against a 16-migration DB. fail0017() throws loudly when
// the clara.schema_migrations '0017_%' row is absent.
//
// PIN AMBIGUITIES this lane encodes (each marked [AMB-n] at its use site; the
// lane report lists them all — adjudication requests, not decisions):
//   AMB-1  the v7 pack purpose literal (W6: "pin at build") — WB_V7_PURPOSE,
//          env-overridable for the adjudicated value.
//   AMB-2  the clara.pack_consumer marker value (FORK-6 "a v25-only marker") —
//          WB_PACK_CONSUMER, env-overridable.
//   AMB-3  approve_opening_seed p_entry_revisions jsonb shape — encoded as an
//          OBJECT MAP {"<entry_id>": "<revision_token>"}.
//   AMB-4  draft_opening_item p_item payload keys + line authoring — encoded:
//          gl_balance passes its GL leg(s) in p_lines (OBE contra fn-added);
//          ar/ap/equity_net/obe_plug pass p_lines NULL with the amount in
//          p_item.amount_cents (fn resolves control/RE/OBE by marker).
//   AMB-5  equity_net sign — encoded balance-sheet sign: positive amount_cents
//          = Cr (natural equity), NEGATIVE = Dr (accumulated losses; BEE).
//   AMB-6  the K1 cancel verb name (battery map: "cancelled seed frees the
//          slot"; no pin names the fn) — encoded cancel_opening_seed.
//   AMB-7  create_seeding_batch proposal element shape — encoded
//          {proposal_kind, proposal_key, payload, evidence}; the
//          management_account variant's "explicit arg" — encoded p_source_kind.
//   AMB-8  seed_fixed_asset semantics — encoded ONE call creates the register
//          row AND its OB entry AND the opening_items row (acquisition_entry_id
//          NOT NULL forces same-txn); p_asset keys = the as-built 0003 column
//          names + item_key.
//   AMB-9  plan-CAS errcode for update_onboarding_plan / commit (K14 pins
//          CLR30 'stale_plan' for the SEED family only) — encoded CLR06 for
//          the plan writers (the existing revision class).
//   AMB-10 run_client_lint with a null op_key: L3 "never raises" vs G4 "CLR10
//          on null" — encoded NEVER RAISES (returns a non-ok status).

import { createHash } from "node:crypto";
import { ROLES, rootQuery, roleQuery, humanQuery, opk, getPool } from "../a21-helpers.mjs";

export * from "../a21-helpers.mjs";

// ---------------------------------------------------------------------------
// Pinned vocabulary (design parts 1–3). LAW — divergence = finding.
// ---------------------------------------------------------------------------

/** ADJUDICATED AMB-17 (0017-ambiguity-adjudications.md; reconcile audit
 *  2026-07-23): the impl lane's verified next-free numbering WINS — CLR30 was
 *  occupied in the prestate, so the four provisional families shift together.
 *  The exported names keep the design doc's PROVISIONAL labels; their VALUES
 *  are the binding as-built codes. */
export const CLR30 = "CLR31"; // opening-seed family (design-doc label CLR30)
export const CLR31 = "CLR32"; // wiki family (design-doc label CLR31)
export const CLR32 = "CLR33"; // lint family (design-doc label CLR32)
export const CLR33 = "CLR34"; // seeding family (design-doc label CLR33)

/** [AMB-1]/[AMB-2] — see header. */
export const WB_V7_PURPOSE = process.env.CLARA_WB_V7_PURPOSE ?? "wiki_coding";
export const WB_PACK_CONSUMER = process.env.CLARA_WB_PACK_CONSUMER ?? "v25";

/** W1/P2 — the six ratified page kinds, in pack relevance-rank order (W6). */
export const PAGE_KINDS = ["profile", "period_context", "treatment",
  "recurring_pattern", "counterparty", "open_question"];

/** W7 — the four WB-R8 seeded budget rows, exact. */
export const WB_BUDGET_SEEDS = {
  max_pages_per_client: 40, max_page_bytes: 8192,
  pack_max_pages: 6, pack_max_bytes: 12288,
};

/** New firm-scoped tables 0017 adds (full RLS posture asserted per table). */
export const WB_NEW_TABLES = [
  "wiki_pages", "wiki_page_versions", "wiki_page_citations", "wiki_page_refs",
  "wiki_log", "wiki_synthesis_holds",
  "onboarding_plans", "onboarding_plan_items", "onboarding_plan_revisions",
  "opening_seed_registry", "opening_items", "opening_tb_targets",
  "opening_seed_approvals", "seeding_batches", "seeding_proposals",
  "lint_findings", "lint_finding_events",
];
/** Global/system tables (no firm column pinned): wiki_budgets, lint_runs. */
export const WB_SYSTEM_TABLES = ["wiki_budgets", "lint_runs"];

/** G1 — event types + pinned taxonomy decisions (all client-scoped).
 *
 *  [0019 amendment 4] This roster is UNCHANGED by migration 0019 and that is a
 *  LOAD-BEARING negative: `wiki.citations_staled` is DROPPED, so the stale-mark
 *  writer appends NO event at all. A client-scoped wiki event would move the firm
 *  event head and reach `assert_books_current` (0007:2665-2681) and the
 *  correction books-version check (0009:2449-2450) — handing a projection-derived
 *  event an indirect veto over authority. `wb-0019-tail` asserts the absence. */
export const WB_EVENT_TYPES = {
  "wiki.page_published": "ignore",
  "wiki.page_retired": "ignore",
  "wiki.source_ingested": "ignore",
  "lint.finding_transition": "notification",
  "client.onboarding_started": "ignore",
  "client.activated": "ignore",
  "onboarding.plan_committed": "ignore",
  "onboarding.plan_bootstrapped": "ignore", // [R3-F2] the B-12 bootstrap verb

  "opening_seed.batch_approved": "ignore",
  "opening_seed.reopened": "ignore",
  "opening_item.superseded": "ignore",
  "seeding.batch_created": "ignore",
  "seeding.proposal_decided": "ignore",
  "seeding.batch_completed": "ignore",
};

/** G2 — the ACL tuple matrix: fn → app roles that MUST hold EXECUTE (every
 *  other app role must NOT). Tokens resolve through ROLES at assert time. */
export const WB_ACL = {
  publish_wiki_page_version: ["runtime"],
  record_wiki_source_ingest: ["runtime"],
  set_wiki_synthesis_hold: ["runtime"],
  clear_wiki_synthesis_hold: ["runtime"],
  // [0019 §3] the stale-mark writer — runtime ONLY, mirroring the
  // set_wiki_synthesis_hold grant block. Never authenticated / agent_ro / wake.
  mark_wiki_citations_stale: ["runtime"],
  create_seeding_batch: ["runtime"],
  record_opening_targets_parsed: ["runtime"],
  update_onboarding_plan: ["runtime"],
  run_client_lint: ["runtime"],
  run_lint_all: ["runtime"],
  retire_wiki_page: ["authenticated"],
  get_wiki_page: ["authenticated", "runtime"],
  list_wiki_pages: ["authenticated", "runtime"],
  begin_client_onboarding: ["authenticated"],
  commit_client_onboarding: ["authenticated"],
  cancel_client_onboarding: ["authenticated"],
  resolve_onboarding_plan_item: ["authenticated"],
  create_opening_seed: ["authenticated"],
  draft_opening_item: ["authenticated"],
  record_opening_target: ["authenticated"],
  record_opening_keyed_resolution: ["authenticated"], // [AMB-0018-5] the 0018 seed-bound keyed mint
  seed_fixed_asset: ["authenticated"], // [AMB-0018-5] now the 5-arg (p_resolution default null)
  approve_opening_seed: ["authenticated"],
  supersede_opening_item: ["authenticated"],
  approve_opening_correction: ["authenticated"],
  reopen_opening_seed: ["authenticated"],
  tick_seeding_proposal: ["authenticated"],
  decline_seeding_proposal: ["authenticated"],
  complete_seeding_batch: ["authenticated"],
  // [R1-F13] the two cancel verbs join every sweep (memo finding 13a).
  cancel_opening_seed: ["authenticated"],
  cancel_seeding_batch: ["authenticated"],
  // [R3-F2/F5] the CoR'd legacy creator + the B-12 plan-bootstrap verb.
  create_client: ["authenticated"],
  bootstrap_client_plan: ["authenticated"],
  get_opening_dryrun: ["authenticated"],
  get_lint_finding: ["authenticated"],
  resolve_lint_finding: ["authenticated"],
  trial_balance_as_of: ["authenticated", "runtime"],
  _client_operational: [],
  _assert_client_operational: [],
  _assert_opening_tie: [],
  _assert_fa_baseline: [],
  _approve_opening_entry: [],
};
export const WB_ALL_FNS = Object.keys(WB_ACL);

/** [R1-F13] The 0017 fn-name grammar (every pinned family). The sweeps run over
 *  the UNION of the pinned matrix and this live-catalog inventory, so an
 *  unpinned sibling (e.g. a cancel verb) can never silently escape them. */
export const WB_FN_FAMILY_RE =
  // [0019 amendment 8] `mark_wiki` joins the grammar: without it the new stale
  // writer escapes wbFnInventory() entirely and therefore every catalog-derived
  // sweep (G2 unpinned-grant, G2 agent-zero, G3 wake allowlist, G5(h) PUBLIC,
  // and the wb-g-opkeys writer inventory).
  "^(publish_wiki|record_wiki|retire_wiki|get_wiki|list_wiki|set_wiki|clear_wiki|mark_wiki" +
  "|begin_client_onboarding|commit_client_onboarding|cancel_client_onboarding" +
  "|update_onboarding|resolve_onboarding|create_opening|draft_opening|record_opening" +
  "|get_opening|approve_opening|supersede_opening|reopen_opening|cancel_opening" +
  "|seed_fixed_asset|trial_balance_as_of|create_seeding|tick_seeding|decline_seeding" +
  "|complete_seeding|cancel_seeding|run_client_lint|run_lint_all|get_lint|resolve_lint" +
  "|bootstrap_client_plan|create_client$" + // [R3-F2/F5] CoR'd creator + bootstrap
  "|_client_operational|_assert_client_operational|_assert_opening|_assert_fa" +
  "|_approve_opening|_opening_seed)";

/** Live-catalog inventory of 0017-family fns (names only). */
export async function wbFnInventory() {
  const r = await rootQuery(
    "select distinct p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='clara' and p.proname ~ $1",
    [WB_FN_FAMILY_RE]);
  return r.rows.map((x) => x.proname);
}

/** W10 — the WB-R6 named authority list whose prosrc must NEVER reference
 *  wiki tables (plus every K/S writer, appended per the pin).
 *
 *  [0019 amendment 8] `retire_document_filing` + `approve_wrong_client_correction`
 *  JOIN the list — the two filing-transition verbs 0017 hung the R2-F2 veto on,
 *  and the very functions whose wiki-freedom 0019 exists to prove.
 *  CAVEAT recorded by this lane: adding them to a list that is scanned with
 *  WIKI_TABLE_RE alone proves LESS than amendment 8 implies. The 0017 veto never
 *  put a wiki TABLE token in either body — it put a call to
 *  `_assert_filing_wiki_unreferenced`, and the helper held the reads (0017:1824,
 *  1860). A relation-token scan was blind to it pre-0019 and is blind to any
 *  future helper-shaped leak. The CALL-EDGE half of the §9 closed-set scan
 *  (wb-0019-tail) is what actually closes this; the roster addition is necessary
 *  but not sufficient. */
export const WB_AUTHORITY_FNS = [
  "retire_document_filing", "approve_wrong_client_correction",
  "_approve_entry_core", "_draft_entry_core", "draft_entry", "wake_draft_entry",
  "approve_entry", "execute_rule_post", "propose_coding_rule", "sign_coding_rule",
  "propose_autopost_rule", "sign_autopost_rule", "reconcile_autopost_rules",
  "_assert_supplier_bill_shape", "is_high_stakes", "assert_client_resolved",
  "assert_books_current", "assert_provenance", "_open_question_blocks",
  "evaluate_sst_watch", "coding_lane",
  "create_opening_seed", "draft_opening_item", "record_opening_target",
  "record_opening_targets_parsed", "approve_opening_seed", "_approve_opening_entry",
  "supersede_opening_item", "approve_opening_correction", "reopen_opening_seed",
  "seed_fixed_asset", "_assert_opening_tie", "_assert_fa_baseline",
  "create_seeding_batch", "tick_seeding_proposal", "decline_seeding_proposal",
  "complete_seeding_batch",
];

/** G5(d) — the wiki-family whitelist: the ONLY fns whose prosrc may reference
 *  wiki tables. [0019 amendment 7/8] gains the new stale writer and the
 *  UNGRANTED publication core (which reads wiki_budgets at 0017:2016-2019 and
 *  writes every wiki relation — 0017's *granted*-function scan never saw it, but
 *  0019's inverse all-definers scan does, so it must be whitelisted). */
export const WB_WIKI_WHITELIST = [
  "publish_wiki_page_version", "_publish_wiki_page_version_core",
  "record_wiki_source_ingest", "retire_wiki_page",
  "get_wiki_page", "list_wiki_pages", "set_wiki_synthesis_hold",
  "clear_wiki_synthesis_hold", "get_context_pack", "run_client_lint",
  "run_lint_all", "mark_wiki_citations_stale",
];

/** The seven wiki relations (0017:5961-5963 — the word-bounded family the
 *  dependency scans use, qualified or search_path-relative). */
export const WB_WIKI_RELATIONS = [
  "wiki_pages", "wiki_page_versions", "wiki_page_citations", "wiki_page_refs",
  "wiki_log", "wiki_budgets", "wiki_synthesis_holds",
];
export const WIKI_TABLE_RE = new RegExp(`\\b(${WB_WIKI_RELATIONS.join("|")})\\b`);

/** [0019 §9 amendment 7] The clean-end-state whitelist by EXACT regprocedure
 *  identity (NOT by proname — a future overload of a whitelisted name must not
 *  be silently covered). Verbatim from the contract's §9 block. */
export const WB_0019_WHITELIST_SIGS = [
  "clara.publish_wiki_page_version(uuid,text,text,text,uuid,text,text,text,jsonb,jsonb,text,text,bigint,text)",
  "clara._publish_wiki_page_version_core(uuid,uuid,text,text,text,uuid,text,text,text,jsonb,jsonb,text,text,bigint,uuid,text,text)",
  "clara.record_wiki_source_ingest(uuid,uuid,text,text)",
  "clara.retire_wiki_page(uuid,text,text)",
  "clara.set_wiki_synthesis_hold(uuid,text,text)",
  "clara.clear_wiki_synthesis_hold(uuid,text)",
  "clara.get_wiki_page(uuid,text)",
  "clara.list_wiki_pages(uuid)",
  "clara.get_context_pack(uuid,text)",
  "clara.run_client_lint(uuid,text)",
  "clara.run_lint_all(text)",
  "clara.mark_wiki_citations_stale(uuid,uuid,text,text)",
];

/** [0019 §2/§3] The single allowed `stale_reason` value (the column CHECK's set
 *  and the writer's validated set are the SAME set — §3). */
export const WB_STALE_REASON = "source_filing_retired";
/** [0019 §2] Both relations gain the SAME additive pair (0018:36-44 pattern). */
export const WB_STALE_COLS = ["stale_at", "stale_reason"];
export const WB_STALE_RELATIONS = ["wiki_page_citations", "wiki_page_refs"];
/** [0019 §6] The lint finding class + its exact dedupe grain. */
export const WB_STALE_FINDING = "stale_citation";
export const staleCiteKey = (page, doc) => `stalecite:${page}:${doc}`;
/** [0019 §4] The consumer lane's pinned seq-embedded op-key idiom (same shape as
 *  the existing `wikihold:<client>:<seq>` / `wikiproj:<client>:<seq>`). */
export const staleOpKey = (client, seq) => `wikistale:${client}:${seq}`;
/** [0019 §11] The ceremony catch-up op key — the run key is MANDATORY (a fixed
 *  per-pair key replays the original receipt forever, 0004:43-60). */
export const staleCatchupOpKey = (runKey, client, doc) =>
  `wikistale-catchup:${runKey}:${client}:${doc}`;

/** W6/G5(b) — v3 pack top-level keys that MUST carry into v4 (0016 as-built). */
export const PACK_V3_KEYS = [
  "pack_schema_version", "purpose", "generated_at", "books_version",
  "client", "firm", "coa", "sst_registration_watch",
];

// ---------------------------------------------------------------------------
// Readiness — FAIL (never skip) below 0017 (the work order's discipline).
// ---------------------------------------------------------------------------

export async function has0017() {
  try {
    const r = await rootQuery("select version from clara.schema_migrations where version ~ '^0017_'");
    return r.rows.length > 0;
  } catch { return false; }
}

/** Best-effort migrate (idempotent) then the 0017 gate. */
export async function wbEnsureReady() {
  try {
    const { ensureReady } = await import("../rig-docs-fixtures.mjs");
    await ensureReady();
  } catch { /* dirty tree — probe the live catalog as-is */ }
  return has0017();
}

/** The per-cell gate: at 16 migrations every cell FAILS loudly (the pins are
 *  not built yet — a red battery is the CORRECT pre-integration state). */
export function fail0017(live) {
  if (!live) {
    throw new Error(
      "0017 NOT applied (clara.schema_migrations has no '0017_%' row) — the Wave-B pins are not built; this battery is REQUIRED to fail against the 16-migration prestate (work-order discipline)",
    );
  }
}

// ---------------------------------------------------------------------------
// 0018 readiness (the Gate-K/accounting-domain wave, WB-R24(i)) — the SAME
// FAIL-never-skip discipline as fail0017, one migration up. The 0018 blind
// battery (wb-0018-*.test.mjs) is REQUIRED to fail RED against the 17-migration
// prestate: its pins (subject-bound keyed resolutions, seed_fixed_asset
// p_resolution, dual-lane K5/K6 guards, typed commit reasons) are not built yet.
// ---------------------------------------------------------------------------

export async function has0018() {
  try {
    const r = await rootQuery("select version from clara.schema_migrations where version ~ '^0018_'");
    return r.rows.length > 0;
  } catch { return false; }
}

/** Best-effort migrate (idempotent) then the 0018 gate. Mirrors wbEnsureReady. */
export async function wbEnsureReady18() {
  try {
    const { ensureReady } = await import("../rig-docs-fixtures.mjs");
    await ensureReady();
  } catch { /* dirty tree — probe the live catalog as-is */ }
  return has0018();
}

/** The per-cell 0018 gate: at 17 migrations every 0018 cell FAILS loudly (the
 *  pins are not built yet — a red battery is the CORRECT pre-integration state). */
export function fail0018(live) {
  if (!live) {
    throw new Error(
      "0018 NOT applied (clara.schema_migrations has no '0018_%' row) — the Gate-K/accounting-domain pins (WB-R24(i)) are not built; this battery is REQUIRED to fail against the 17-migration prestate (work-order discipline)",
    );
  }
}

// ---------------------------------------------------------------------------
// 0019 readiness (the wiki AUTHORITY BOUNDARY, WB-R21 · WB-R24(ii)) — the SAME
// FAIL-never-skip discipline as fail0017/fail0018, one migration up. The 0019
// blind battery (wb-0019-*.test.mjs, plus the gated 0019 cells inside
// wb-w-wiki / wb-w-pack / wb-l-lint) is REQUIRED to fail RED against the
// 18-migration prestate: its pins (the veto REMOVED with the client-row
// serializer preserved, the citation/ref stale marker, mark_wiki_citations_stale,
// the CLR32 monotonic guard, the stale_citation lint class, the has_stale_sources
// read surfaces) are not built yet. Amendment 8 makes this gate GATING: without
// it a new cell can silently pass against 0018 and the blind lane proves nothing.
// ---------------------------------------------------------------------------

export async function has0019() {
  try {
    const r = await rootQuery("select version from clara.schema_migrations where version ~ '^0019_'");
    return r.rows.length > 0;
  } catch { return false; }
}

/** Best-effort migrate (idempotent) then the 0019 gate. Mirrors wbEnsureReady. */
export async function wbEnsureReady19() {
  try {
    const { ensureReady } = await import("../rig-docs-fixtures.mjs");
    await ensureReady();
  } catch { /* dirty tree — probe the live catalog as-is */ }
  return has0019();
}

/** The per-cell 0019 gate: at 18 migrations every 0019 cell FAILS loudly. */
export function fail0019(live) {
  if (!live) {
    throw new Error(
      "0019 NOT applied (clara.schema_migrations has no '0019_%' row) — the wiki authority-boundary pins (WB-R21/WB-R24(ii): veto removal + stale marker + mark_wiki_citations_stale + the CLR32 monotonic guard + stale_citation + has_stale_sources) are not built; this battery is REQUIRED to fail against the 18-migration prestate (work-order discipline)",
    );
  }
}

// ---------------------------------------------------------------------------
// Small utilities
// ---------------------------------------------------------------------------

export const shaHex = (s) => createHash("sha256").update(s, "utf8").digest("hex");
export const jtxt = (v) => JSON.stringify(v);

/** Parse the {"reason": ...} DETAIL of a Clara refusal (tolerant). */
export function detailReason(err) {
  try { return JSON.parse(err.detail ?? "{}").reason ?? null; } catch { return null; }
}

/** The wiki storage key family (W5) for a firm/client/content. */
export function wikiKey(firm, client, sha256) {
  return `firms/${firm}/wiki/${client}/${sha256}.md`;
}

// ---------------------------------------------------------------------------
// Block-W wrappers (pinned NAMED args; 42883/name divergence = finding).
// ---------------------------------------------------------------------------

/** publish_wiki_page_version — GRANT clara_runtime ONLY (W3). */
export async function publishWikiPage({
  client, firm, slug, pageKind = "profile", title = "Rig page",
  counterparty = null, content = "# rig\ncontent", sha256 = null, storageKey = null,
  citations = null, refs = [], synthesis = "deterministic", engineId = null,
  projectedFromSeq = null, opKey = null, role = ROLES.runtime,
}) {
  const digest = sha256 ?? shaHex(content);
  const key = storageKey ?? wikiKey(firm, client, digest);
  const cites = citations ?? [{ source_kind: "human_note", detail: { note: "rig citation" } }];
  const r = await roleQuery(role,
    `select clara.publish_wiki_page_version(p_client => $1, p_slug => $2, p_page_kind => $3,
       p_title => $4, p_counterparty => $5, p_content => $6, p_content_sha256 => $7,
       p_storage_key => $8, p_citations => $9::jsonb, p_refs => $10::jsonb,
       p_synthesis => $11, p_engine_id => $12, p_projected_from_seq => $13::bigint,
       p_op_key => $14) as r`,
    [client, slug, pageKind, title, counterparty, content, digest, key,
      jtxt(cites), jtxt(refs), synthesis, engineId, projectedFromSeq, opKey ?? opk("wpub")]);
  return r.rows[0].r;
}

export async function recordWikiIngest({ client, document, note = "rig ingest", opKey = null }) {
  const r = await roleQuery(ROLES.runtime,
    "select clara.record_wiki_source_ingest(p_client => $1, p_document => $2, p_note => $3, p_op_key => $4) as r",
    [client, document, note, opKey ?? opk("wing")]);
  return r.rows[0].r;
}

export async function retireWikiPage(sub, { page, reason = "rig retire", opKey = null }) {
  const r = await humanQuery(sub,
    "select clara.retire_wiki_page(p_page => $1, p_reason => $2, p_op_key => $3) as r",
    [page, reason, opKey ?? opk("wret")]);
  return r.rows[0].r;
}

export async function getWikiPage(sub, { client, slug }) {
  const r = await humanQuery(sub, "select clara.get_wiki_page(p_client => $1, p_slug => $2) as r", [client, slug]);
  return r.rows[0].r;
}
export async function listWikiPages(sub, { client }) {
  const r = await humanQuery(sub, "select clara.list_wiki_pages(p_client => $1) as r", [client]);
  return r.rows[0].r;
}

export async function setWikiHold({ client, reason = "rig hold", opKey = null }) {
  const r = await roleQuery(ROLES.runtime,
    "select clara.set_wiki_synthesis_hold(p_client => $1, p_reason => $2, p_op_key => $3) as r",
    [client, reason, opKey ?? opk("whold")]);
  return r.rows[0].r;
}
export async function clearWikiHold({ client, opKey = null }) {
  const r = await roleQuery(ROLES.runtime,
    "select clara.clear_wiki_synthesis_hold(p_client => $1, p_op_key => $2) as r",
    [client, opKey ?? opk("wrel")]);
  return r.rows[0].r;
}

/** [0019 §3] mark_wiki_citations_stale(p_client,p_document,p_reason,p_op_key) —
 *  SECURITY DEFINER, GRANT clara_runtime ONLY. Returns the closed receipt
 *  {document_id, reason, citations_marked, refs_marked, status} with
 *  status ∈ {'marked','noop'} ('noop' IFF citations_marked+refs_marked=0).
 *  `role` is overridable so the ACL cells can drive the refused lanes. */
export async function markStale({
  client, document, reason = WB_STALE_REASON, opKey = null, role = ROLES.runtime,
}) {
  const r = await roleQuery(role,
    `select clara.mark_wiki_citations_stale(p_client => $1, p_document => $2,
       p_reason => $3, p_op_key => $4) as r`,
    [client, document, reason, opKey ?? opk("wstale")]);
  return r.rows[0].r;
}

/** get_context_pack — human lane (jwt). */
export async function packHuman(sub, { client, purpose = "chat" }) {
  const r = await humanQuery(sub,
    "select clara.get_context_pack(p_client => $1, p_purpose => $2) as r", [client, purpose]);
  return r.rows[0].r;
}

/** get_context_pack — wake lane, optionally with the FORK-6 consumer-marker GUC
 *  set txn-locally (only v25 server-side tool code can set it in prod; the rig
 *  is the structural probe). */
export async function packWake(cred, { client, purpose, consumerGuc = null, role = ROLES.agentRo }) {
  const c = await getPool().connect();
  try {
    await c.query(`set role ${role}`);
    await c.query("begin");
    await c.query("select set_config('clara.wake_secret', $1, true)", [cred.secret]);
    if (consumerGuc != null) {
      await c.query("select set_config('clara.pack_consumer', $1, true)", [consumerGuc]);
    }
    const r = await c.query("select clara.get_context_pack(p_client => $1, p_purpose => $2) as r", [client, purpose]);
    await c.query("commit");
    return r.rows[0].r;
  } catch (e) {
    await c.query("rollback").catch(() => {});
    throw e;
  } finally {
    await c.query("reset role").catch(() => {});
    await c.query("reset all").catch(() => {});
    c.release();
  }
}

// ---------------------------------------------------------------------------
// Block-O wrappers
// ---------------------------------------------------------------------------

export async function beginOnboarding(sub, { name, opKey = null }) {
  const r = await humanQuery(sub,
    "select clara.begin_client_onboarding(p_name => $1, p_op_key => $2) as r",
    [name, opKey ?? opk("onb")]);
  return r.rows[0].r; // {client_id, plan_id}
}

/** [R1-F11] p_attestation added for the Gate-O solo-firm commit path (omitted
 *  unless passed, so the call binds by name on either arity). */
export async function commitOnboarding(sub, { client, plan, expectedPlanRevision, attestation = null, opKey = null }) {
  const specs = ["p_client => $1", "p_plan => $2", "p_expected_plan_revision => $3"];
  const vals = [client, plan, expectedPlanRevision];
  if (attestation != null) { specs.push(`p_attestation => $${vals.length + 1}`); vals.push(attestation); }
  specs.push(`p_op_key => $${vals.length + 1}`); vals.push(opKey ?? opk("onbc"));
  const r = await humanQuery(sub, `select clara.commit_client_onboarding(${specs.join(", ")}) as r`, vals);
  return r.rows[0].r;
}

export async function cancelOnboarding(sub, { client, plan, reason = "rig cancel", opKey = null }) {
  const r = await humanQuery(sub,
    "select clara.cancel_client_onboarding(p_client => $1, p_plan => $2, p_reason => $3, p_op_key => $4) as r",
    [client, plan, reason, opKey ?? opk("onbx")]);
  return r.rows[0].r;
}

/** update_onboarding_plan — GRANT clara_runtime ONLY (O5). */
export async function updatePlan({ plan, expectedRevision, items, answeredBy, opKey = null }) {
  const r = await roleQuery(ROLES.runtime,
    "select clara.update_onboarding_plan(p_plan => $1, p_expected_revision => $2, p_items => $3::jsonb, p_answered_by => $4, p_op_key => $5) as r",
    [plan, expectedRevision, jtxt(items), answeredBy, opKey ?? opk("plan")]);
  return r.rows[0].r;
}

export async function resolvePlanItem(sub, { plan, itemKey, resolution = "rig resolved", opKey = null }) {
  const r = await humanQuery(sub,
    "select clara.resolve_onboarding_plan_item(p_plan => $1, p_item_key => $2, p_resolution => $3, p_op_key => $4) as r",
    [plan, itemKey, resolution, opKey ?? opk("item")]);
  return r.rows[0].r;
}
