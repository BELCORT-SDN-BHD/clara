// Slice-5 rig — document-pipeline shared helper CORE (NOT a test file: the name
// does not end in `.test.mjs`, so `node --test` ignores it). Written by the
// CONTRACT-BLIND test lane straight from docs/plan/completed/slice5-document-pipeline-contract.md
// (v1.2) + docs/plan/completed/slice5-migration-0007-design.md (§3.x) + migrations
// 0001–0006 + the existing rig harness — NEVER from reading 0007. The point is
// mutual blindness: these tests encode the CONTRACT; a divergence from the built
// migration is the lane's product (signal), not a bug in the tests.
//
// Module layout (mirrors Slice 2/3/4 — one concern per file, all re-exported so a
// test file imports ONE leaf module):
//   rig-docs-helpers.mjs  — constants, readiness, snapshot/discovery, code sets (this)
//   rig-docs-fixtures.mjs — fixture creators + fn wrappers (re-exports this)
//   rig-docs-race.mjs     — two-session forced-schedule drivers (the X7 law)
//   rig-docs-meta.mjs     — catalog audits (grants / overloads / RLS / runtime-login)
//
// NAMING POLICY (inherited): where the contract NAMES a thing (fn params, status
// enum values, error codes, table/column names) the rig uses that literal name —
// a 42883 / missing column / wrong SQLSTATE is a real FINDING, not a rig bug.
// Where the contract is SILENT (many S5 writer names + column names are), the
// helpers are ADAPTIVE: they read pg_proc / information_schema at run time, map
// the contract's semantic fields onto whatever exists, and fail LOUDLY (or record
// a LANE_NOTE) — never silently skip. Inspecting the LIVE catalog is allowed;
// reading 0007's source is not.
//
// CODE POLICY (a load-bearing S5 finding — see the report): the ENTIRE Slice-5
// design names exactly ONE SQLSTATE — CLR02 for the filing/provenance/citability
// gate (companion §3.1). Every other failure mode (correction refusal, stale
// plan, CAS mismatch, closed-period block, terminal-intake immutability,
// reservation limit) is contract-SILENT on its code. This lane therefore asserts
// CLR02 EXACTLY where stated and uses assertRaisesOneOf over the plausible
// existing-code set elsewhere — and records every such choice as an interface
// expectation. It NEVER invents a CLR15+ (the contract defines none).

import {
  CLR,
  CLR13,
  CLR14,
  rootQuery,
} from "./rig-runtime-fixtures.mjs";

export * from "./rig-runtime-fixtures.mjs";

// ---------------------------------------------------------------------------
// §3 status / enum catalogs (contract-named — a mismatch is a finding).
// ---------------------------------------------------------------------------

/** §3.0 documents.extraction_status CHECK (derived by writers only — E-5). */
export const EXTRACTION_STATUSES = [
  "pending", "running", "done", "failed",
  "skipped_structured_done", "stored_unparsed", "held_egress",
];

/** §3.0 documents.retention_state CHECK. */
export const RETENTION_STATES = ["unanchored", "anchored"];

/** §3.2 document_intakes.status state machine. */
export const INTAKE_STATUSES = [
  "uploading", "received", "verifying",
  "verified", "duplicate", "failed", "finalized", "adopted",
];
/** §3.2 the immutable terminal set. */
export const INTAKE_TERMINAL = ["finalized", "adopted", "failed"];
/** §3.2 document_intakes.failure_code CHECK allowlist. */
export const INTAKE_FAILURE_CODES = [
  "too_large", "bad_type", "limit", "checksum_mismatch", "storage_error",
  "expired", "malware_detected", "quarantined", "internal",
];

/** §3.9 document_processing_tasks.status. */
export const PROC_TASK_STATUSES = ["queued", "held_egress", "running", "done", "failed"];
/** §3.9 processing-task lane. */
export const PROC_TASK_LANES = ["ocr", "structured_parse", "none"];

/** §3.3 extraction engine_kind + region locator_kind. */
export const ENGINE_KINDS = ["ocr", "structured_parse"];
export const LOCATOR_KINDS = ["page_polygon", "sheet_cell_range", "row_col", "paragraph_run"];

/** §3.4 attribution enums. */
export const IDENTIFIER_KINDS = ["tin", "ssm", "bank_account"];
export const CANDIDATE_RULE_KINDS = ["name_exact", "alias_exact"];
export const CANDIDATE_DISPOSITIONS = ["open", "confirmed", "dismissed"];

/** §3.6 reservation state machine. */
export const RESERVATION_STATES = ["reserved", "resized", "settled", "refunded"];

/** §3.5 correction status + item action. */
export const CORRECTION_STATUSES = ["proposed", "approved", "completed", "rejected", "stale"];
export const CORRECTION_ITEM_ACTIONS = ["reverse", "already_reversed", "withdraw_draft"];

/** §3.5 the NEW journal status (draft→withdrawn only). */
export const STATUS_WITHDRAWN = "withdrawn";

/** §3.1 the legacy-backfill filing basis (resolution_id NULL). */
export const FILING_BASIS_LEGACY = "legacy-0007";

/** §4.6 the egress gate flag + its parked task/extraction status. */
export const EGRESS_FLAG = "CLARA_DOC_EGRESS_APPROVED";
export const HELD_EGRESS = "held_egress";

/** §3.11 residual-sweep reason (taxonomy-v2 cutover). */
export const CUTOVER_REASON = "taxonomy-v2-cutover";

// ---------------------------------------------------------------------------
// Event types — the five NEW document event types (§3.1 / §3.3 / §3.5 / §3.7)
// on top of the pre-existing document.ingested. The taxonomy-v2 routing the
// contract states (§3.7).
// ---------------------------------------------------------------------------

export const DOC_EVT = {
  ingested: "document.ingested",       // pre-existing (0005) — routing flips to 'ignore' in v2
  filed: "document.filed",
  filingRetired: "document.filing_retired",
  extractionCompleted: "document.extraction_completed",
  extractionFailed: "document.extraction_failed",
  correctionApplied: "document.correction_applied",
};

/** The event types 0007 must ADD (document.ingested already exists in 0005). */
export const NEW_EVENT_TYPES = [
  DOC_EVT.filed, DOC_EVT.filingRetired, DOC_EVT.extractionCompleted,
  DOC_EVT.extractionFailed, DOC_EVT.correctionApplied,
];

/** §3.7 taxonomy-v2 routing for the document family (contract-stated). Non-document
 *  types keep their v1 decision; the taxonomy-v2 full-coverage test asserts the
 *  active version maps EVERY type, and these six the way §3.7 states. */
export const DOC_TAXONOMY_V2 = {
  [DOC_EVT.ingested]: "ignore",
  [DOC_EVT.filed]: "context_update",
  [DOC_EVT.filingRetired]: "context_update",
  [DOC_EVT.correctionApplied]: "context_update",
  [DOC_EVT.extractionCompleted]: "ignore",   // "ignore for the router" (§3.7); the matcher subscribes separately
  [DOC_EVT.extractionFailed]: "ignore",
};

// ---------------------------------------------------------------------------
// New §3 tables (for the FORCE-RLS + cross-firm isolation + grant sweeps).
// ---------------------------------------------------------------------------

export const EXPECTED_NEW_TABLES = [
  "document_filings",                 // §3.1
  "document_intakes",                 // §3.2
  "document_extractions", "document_regions", // §3.3
  "client_identifiers", "client_aliases",     // §3.4
  "attribution_attempts", "attribution_candidates", "attribution_candidate_regions", // §3.4
  "filing_corrections", "filing_correction_items", // §3.5
  "firm_document_limits", "document_ingest_reservations", // §3.6
  "document_processing_tasks",        // §3.9
];

/** The tables the contract says carry NO base grant to humans — a masked definer
 *  view is the only human surface (§3.2 / §3.9 / §3.6 / §3.10). Cross-firm probes
 *  on these go via the view, not the base table. */
export const NO_HUMAN_BASE_GRANT = new Set([
  "document_intakes", "document_processing_tasks", "document_ingest_reservations",
]);

// FROZEN pre-0007 snapshot (Slices 1–4 base tables + the two RLS-exempt). Ground-
// truth from `clara_blind_test` at 0006 (40 tables). Deliberately NOT derived from
// rig-meta's GOVERNED_TABLES (that list grows each slice — diffing it would filter
// real new tables out of the discovery sweep; brief §3).
export const PRE_0007_TABLES = new Set([
  "agent_interruptions", "agent_tasks", "audit_log", "chat_messages", "chat_sessions",
  "client_resolutions", "clients", "coa_accounts", "documents", "domain_events",
  "event_types", "firm_admissions", "firm_event_seq", "firm_limits", "firm_memberships",
  "firm_usage_daily", "firms", "fixed_assets", "freeform_read_log", "journal_entries",
  "journal_lines", "notifications", "op_receipts", "relay_checkpoints", "relay_dead_letters",
  "runtime_heartbeats", "schema_migrations", "slice1_smoke", "task_checkpoints", "task_usage",
  "taxonomy_active", "taxonomy_versions", "trace_prune_log", "trace_spans", "trigger_taxonomy",
  "users", "wake_credentials", "wake_fn_allowlist", "wake_intents", "wakes_outbox",
]);

/** Every clara base table NOT in the pre-0007 snapshot — the discovery mechanism a
 *  new-migration lane uses to find as-built tables it did not expect by name. */
export async function observedNewDocTables() {
  const r = await rootQuery(
    "select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'clara' and c.relkind = 'r' order by c.relname",
  );
  return r.rows.map((x) => x.relname).filter((t) => !PRE_0007_TABLES.has(t));
}

// ---------------------------------------------------------------------------
// Contract-silent error-code sets. CLR02 is the ONLY code the S5 design states
// (companion §3.1). Everything else is the plausible existing-code set for the
// documented SEMANTIC failure — each is an INTERFACE EXPECTATION recorded in the
// report; assertRaisesOneOf keeps the lane honest without inventing a code.
// ---------------------------------------------------------------------------

/** §3.1 filing derivation absence/ambiguity + citability law — CLR02, STATED. */
export const CITE_CODE = CLR.provenance;                       // CLR02

/** §3.1 retire_document_filing REFUSES while live entries/drafts cite it. */
export const RETIRE_BLOCKED_CODES = [CLR13, CLR.badRequest, CLR.immutable];
/** §3.5 stale plan reject (plan_hash / books_version drift). */
export const STALE_PLAN_CODES = [CLR.stale, CLR.revision, CLR13];
/** §3.1 retire / §3.5 approve expected_revision CAS mismatch. */
export const CAS_MISMATCH_CODES = [CLR.revision, CLR13];
/** §3.5 closed-period HARD-BLOCK at approve (v1). */
export const CLOSED_PERIOD_CODES = [CLR13, CLR.badRequest];
/** §3.2 terminal-intake immutability (finalized/adopted/failed frozen). */
export const INTAKE_TERMINAL_CODES = [CLR13, CLR.immutable, CLR.badRequest];
/** §3.6 metering reservation limit (docs/day, pages/day). */
// Integration reconciliation (REPORT-50 as-built S5 code map): CLR18 = reservation /
// daily-limit / OCR-concurrency refusal. CLR14 kept for the pre-S5 limit family.
export const LIMIT_CODES = [CLR14, "CLR18"];
/** §3.0.6 both retired ingest writers raise a deterministic CLR error. */
export const RETIRED_WRITER_CODES = [CLR.badRequest, CLR13, CLR.authz, CLR.immutable];

// ---------------------------------------------------------------------------
// Readiness — the Slice-5 surface must be present (0007 applied), else SKIP. The
// marker is contract-NAMED: the document_filings table (§3.1) + file_document fn
// (§3.1). Follows the ensureReady/runtimeReady/eventsReady pattern exactly — never
// reads the migration file.
// ---------------------------------------------------------------------------

export async function docsReady() {
  const r = await rootQuery(
    `select
       (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'clara' and c.relname = 'document_filings' limit 1) as tbl,
       (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'clara' and p.proname = 'file_document' limit 1) as fn`,
  );
  return r.rows[0].tbl != null && r.rows[0].fn != null;
}

// ---------------------------------------------------------------------------
// Function-name + signature resolution for contract-SILENT surfaces. Many S5
// writer names (identifier/alias/reservation/retention/legacy-upgrade writers)
// are not stated by the contract; these helpers resolve the as-built name from a
// candidate list and expose the fn's real param names, so a fixture can build a
// named call adaptively and RECORD which name/params it resolved (a finding).
// ---------------------------------------------------------------------------

const _fnCache = new Map();

/** All clara procs matching a name (proargnames per overload); [] if absent. */
export async function docFnArgs(name) {
  if (_fnCache.has(name)) return _fnCache.get(name);
  const r = await rootQuery(
    `select p.proargnames,
            (select array_agg(format_type(t.typ, null) order by t.ord)
               from unnest(p.proargtypes) with ordinality as t(typ, ord)) as argtypes
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'clara' and p.proname = $1`,
    [name],
  );
  const out = r.rows.map((x) => ({ names: x.proargnames ?? [], types: x.argtypes ?? [] }));
  _fnCache.set(name, out);
  return out;
}

/** Does clara.<name> exist at all (any overload)? */
export async function docFnExists(name) {
  return (await docFnArgs(name)).length > 0;
}

/** Resolve the first candidate fn name that EXISTS in clara; record which one (or
 *  that none do — a finding when required). Cached per candidate list. */
export async function resolveFn(candidates, { required = false, label } = {}) {
  const key = `resolve:${candidates.join("|")}`;
  if (_fnCache.has(key)) return _fnCache.get(key);
  let found = null;
  for (const c of candidates) {
    if (await docFnExists(c)) { found = c; break; }
  }
  const { noteLane } = await import("./rig-runtime-fixtures.mjs");
  if (found) {
    if (found !== candidates[0]) noteLane(`${label ?? "fn"}: contract-silent name resolved to clara.${found} (not the first-guess ${candidates[0]}) — interface expectation`);
  } else if (required) {
    throw new Error(`${label ?? "fn"}: NONE of the candidate names exist in clara: ${candidates.join(", ")} — the contract does not name this writer (finding)`);
  } else {
    noteLane(`${label ?? "fn"}: none of ${candidates.join(", ")} present — treated as not-built`);
  }
  _fnCache.set(key, found);
  return found;
}
