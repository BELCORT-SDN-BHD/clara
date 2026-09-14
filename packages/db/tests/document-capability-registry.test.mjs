// #624 — THE DOCUMENT CAPABILITY REGISTRY, as data rather than as four opinions scattered
// through function bodies. Migration: 0191_document_capability_registry.sql.
//
// Every cell gates on the LIVE CATALOG, never on a migration number (review law 3; the
// counterparty-alias-kind / web-reads batteries' own shape). A PARTIAL cohort THROWS: a
// half-applied migration is a defect, not a reason to skip.
//
// WHAT THIS BATTERY IS FOR. The ticket's first acceptance criterion is that Clara publishes a
// VERSIONED capability registry separating custody, byte extraction, typed facts and business
// operation for each admitted format/kind, and that a skipped kind can never be presented as
// executable. The registry is only worth anything if it is TOTAL over the live vocabulary and
// if it tells the truth about the lanes that actually exist — so these cells check totality in
// both directions against `documents_document_kind_check`, and check the individual verdicts
// that the honest-defaults argument rests on.
//
// THE OFX ROW IS THE HEADLINE (C-37, "no support promise from a filename alone"). A reader
// exists — `packages/runtime/lib/statement-parse.mjs`'s `parseStatementOfx` — but the format
// carries NO opening balance, `parseStatementOfx` therefore returns `opening_cents: null` by
// construction, and `statement-corroboration.mjs`'s `missingHeaderFields` counts
// `opening_cents` as a required header field, so `corroborateChain` raises `header_unreadable`
// on EVERY OFX statement. `ofx × bank_statement` is therefore NOT typed-facts supported, and
// this battery refuses a registry that says otherwise.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { rootQuery, endPool } from "./rig-fixtures.mjs";

const CLR10 = "CLR10";

/** The twelve canonical formats the runtime's intake admits, and the ONE canonical mime each
 *  spelling canonicalizes to. Transcribed from `packages/runtime/lib/intake.mjs`'s
 *  `MIME_ALIASES` map and `packages/runtime/lib/scan.mjs`'s detector — written out here rather
 *  than imported, because packages/db never imports from packages/runtime. The registry's own
 *  rows are compared against this list, so a format that silently leaves either side is a
 *  finding rather than a quiet pass. */
const FORMATS = Object.freeze({
  pdf: "application/pdf",
  png: "image/png",
  jpeg: "image/jpeg",
  webp: "image/webp",
  tiff: "image/tiff",
  heic: "image/heic",
  xml: "application/xml",
  csv: "text/csv",
  tsv: "text/tab-separated-values",
  ofx: "application/x-ofx",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
});

const LEVELS = Object.freeze(["supported", "stored_only", "unsupported", "planned"]);

let live = false;
let executed = 0;
const EXPECTED_CELLS = 16;

async function cohortApplied() {
  const r = await rootQuery(`select
      to_regclass('clara.document_capabilities')                                is not null as t1,
      to_regclass('clara.document_fact_validations')                            is not null as t2,
      to_regprocedure('clara._document_capability(text,text)')                  is not null as f1,
      to_regprocedure('clara._document_format(text)')                           is not null as f2,
      to_regprocedure('clara._assert_field_path(text)')                         is not null as f3,
      to_regprocedure('clara.get_document_state(uuid,uuid)')                    is not null as f4`);
  const flags = Object.entries(r.rows[0]);
  const present = flags.filter(([, v]) => v).length;
  if (present !== 0 && present !== flags.length) {
    throw new Error(
      `document-capability cohort is PARTIAL: ${flags.map(([k, v]) => `${k}=${v}`).join(" ")}. `
      + "A half-applied migration is a defect; refusing to skip past it.",
    );
  }
  return present === flags.length;
}

before(async () => { live = await cohortApplied(); });
after(async () => {
  if (live) assert.equal(executed, EXPECTED_CELLS, `expected ${EXPECTED_CELLS} cells to run, ${executed} did`);
  await endPool();
});

function gate(t) {
  if (live) return false;
  if (process.env.CLARA_ALLOW_MISSING_DOCUMENT_CAPABILITY === "1") {
    console.warn("SKIP document-capability-registry: the cohort is not applied (explicit pre-integration run).");
    t.skip("document-capability cohort absent -- explicit pre-integration run");
    return true;
  }
  assert.fail(
    "document-capability-registry is required for a focused run: apply "
    + "0191_document_capability_registry.sql (or its numbered suite copy)",
  );
}

const cell = (name, fn) => test(name, async (t) => { if (gate(t)) return; executed += 1; await fn(t); });

async function caught(fn) {
  try { await fn(); return null; } catch (err) { return err; }
}

async function kinds() {
  return (await rootQuery("select unnest(clara._document_kind_roster()) as k order by 1")).rows.map((r) => r.k);
}

async function capability(format, kind) {
  return (await rootQuery("select clara._document_capability($1,$2) as c", [format, kind])).rows[0].c;
}

// ---------------------------------------------------------------------------------------------
// TOTALITY — the registry covers every admitted format × every live kind, and nothing else.
// ---------------------------------------------------------------------------------------------

cell("every live document kind × every canonical intake format has EXACTLY ONE registry row", async () => {
  const roster = await kinds();
  const formats = Object.keys(FORMATS);
  const rows = (await rootQuery(
    "select format, document_kind, count(*)::int as n from clara.document_capabilities group by 1,2")).rows;
  assert.equal(rows.length, roster.length * formats.length,
    `expected ${roster.length} kinds x ${formats.length} formats = ${roster.length * formats.length} rows, found ${rows.length}`);
  for (const r of rows) assert.equal(r.n, 1, `duplicate row for ${r.format} x ${r.document_kind}`);

  const missing = [];
  const have = new Set(rows.map((r) => `${r.format}\u0000${r.document_kind}`));
  for (const f of formats) for (const k of roster) if (!have.has(`${f}\u0000${k}`)) missing.push(`${f}x${k}`);
  assert.deepEqual(missing, [], "the registry is not total over (format, kind)");

  const extra = (await rootQuery(
    "select format, document_kind from clara.document_capabilities where not (document_kind = any (clara._document_kind_roster()))")).rows;
  assert.deepEqual(extra, [], "the registry names a kind the live vocabulary does not admit");
});

cell("every registry row names a canonical intake mime, one mime per format, and the four levels are a closed set", async () => {
  const rows = (await rootQuery(
    "select distinct format, mime_type from clara.document_capabilities order by 1")).rows;
  assert.deepEqual(
    rows.map((r) => [r.format, r.mime_type]),
    Object.entries(FORMATS).sort((a, b) => (a[0] < b[0] ? -1 : 1)),
    "the registry's format -> canonical mime map drifted from the runtime intake allowlist",
  );
  const bad = (await rootQuery(
    `select format, document_kind, custody, byte_extraction, typed_facts, business_operation
       from clara.document_capabilities
      where custody <> all($1::text[]) or byte_extraction <> all($1::text[])
         or typed_facts <> all($1::text[]) or business_operation <> all($1::text[])`, [LEVELS])).rows;
  assert.deepEqual(bad, [], "a level outside the closed four-value set");
});

cell("the registry carries ONE monotone registry_version and a non-blank basis on every row", async () => {
  const r = (await rootQuery(
    `select count(distinct registry_version)::int as versions, min(registry_version)::int as v,
            count(*) filter (where basis is null or btrim(basis) = '')::int as blank
       from clara.document_capabilities`)).rows[0];
  assert.equal(r.versions, 1, "the registry publishes exactly one version at a time");
  assert.ok(r.v >= 1, "registry_version starts at 1");
  assert.equal(r.blank, 0, "every row states its basis");
});

// ---------------------------------------------------------------------------------------------
// THE VERDICTS THAT CARRY THE TICKET'S CLAIMS.
// ---------------------------------------------------------------------------------------------

cell("custody and byte_extraction are FORMAT-invariant: a kind never changes what the intake pass did with the bytes", async () => {
  const rows = (await rootQuery(
    `select format, count(distinct custody)::int as c, count(distinct byte_extraction)::int as b,
            count(distinct engine_byte)::int as e
       from clara.document_capabilities group by 1 order by 1`)).rows;
  for (const r of rows) {
    assert.equal(r.c, 1, `${r.format}: custody varies by kind`);
    assert.equal(r.b, 1, `${r.format}: byte_extraction varies by kind`);
    assert.equal(r.e, 1, `${r.format}: the byte-extraction engine varies by kind`);
  }
});

cell("OFX is STORED-ONLY at intake and its bank_statement pair is NOT typed-facts supported (C-37: no promise from a filename)", async () => {
  const row = (await rootQuery(
    "select * from clara.document_capabilities where format='ofx' and document_kind='bank_statement'")).rows[0];
  assert.ok(row, "the ofx x bank_statement row exists");
  assert.equal(row.custody, "supported", "the bytes are sealed — custody is real");
  assert.equal(row.byte_extraction, "stored_only",
    "intake takes the store-only lane for ofx (packages/runtime/lib/intake-lanes.mjs laneSnapshot)");
  assert.notEqual(row.typed_facts, "supported",
    "ofx statements cannot corroborate: parseStatementOfx leaves opening_cents null and corroborateChain raises header_unreadable");
  assert.match(row.basis, /opening/i, "the basis names the reason rather than asserting a bare verdict");
});

cell("a CSV bank statement IS typed-facts supported and a TSV one is not — the live router admits text/csv and never text/tab-separated-values", async () => {
  const csv = await capability("csv", "bank_statement");
  const tsv = await capability("tsv", "bank_statement");
  assert.equal(csv.typed_facts, "supported", "csv x bank_statement rides the statement_parse lane");
  assert.notEqual(tsv.typed_facts, "supported", "the csv/ofx router arm never names text/tab-separated-values");
});

cell("an invoice-shaped PDF is facts-supported and records the line-item deferral as a named LIMIT, never as silent completeness", async () => {
  const row = (await rootQuery(
    "select * from clara.document_capabilities where format='pdf' and document_kind='invoice'")).rows[0];
  assert.equal(row.typed_facts, "supported");
  assert.equal(row.business_operation, "supported");
  assert.equal(row.engine_id, "llm-openai:gpt-5.6-terra:v2", "the witness pair is the live facts engine for this pair");
  assert.equal(row.limits?.invoice_line_items, "planned",
    "invoice LINE ITEMS are deferred and the registry says so in machine-readable form");
});

cell("a payroll_summary PDF is stored and byte-extracted but NEVER facts- or operation-executable (skipped_kind is not executable)", async () => {
  const c = await capability("pdf", "payroll_summary");
  assert.equal(c.custody, "supported");
  assert.equal(c.byte_extraction, "supported");
  assert.equal(c.typed_facts, "stored_only", "the router's skipped_kind arm terminates this pair");
  assert.notEqual(c.business_operation, "supported",
    "a skipped_kind pair must never present as executable (ticket acceptance 1)");
});

cell("consent_evidence is facts-UNSUPPORTED and operation-UNSUPPORTED on every format (0014/H-53)", async () => {
  const rows = (await rootQuery(
    "select format, typed_facts, business_operation from clara.document_capabilities where document_kind='consent_evidence'")).rows;
  assert.equal(rows.length, Object.keys(FORMATS).length);
  for (const r of rows) {
    assert.equal(r.typed_facts, "unsupported", `${r.format}: consent evidence is structurally exempt from facts extraction`);
    assert.equal(r.business_operation, "unsupported", `${r.format}: consent evidence never carries an entry`);
  }
});

cell("business_operation never claims 'supported' where typed_facts is not supported — Clara cannot drive what it cannot read", async () => {
  const rows = (await rootQuery(
    `select format, document_kind, typed_facts, business_operation
       from clara.document_capabilities
      where business_operation='supported' and typed_facts<>'supported'`)).rows;
  assert.deepEqual(rows, [], "an operation promised over facts that do not exist");
});

// ---------------------------------------------------------------------------------------------
// THE READER — honest defaults for the two unknowns.
// ---------------------------------------------------------------------------------------------

cell("an UNKNOWN (format, kind) pair reads typed_facts='unsupported' — the honest default, never a silent yes", async () => {
  const c = await capability("zzz_not_a_format", "invoice");
  assert.equal(c.known_pair, false);
  assert.equal(c.typed_facts, "unsupported");
  assert.equal(c.business_operation, "unsupported");
  assert.equal(c.custody, "unsupported", "a format the intake never admits has no custody to claim either");
});

cell("a NOT-YET-CLASSIFIED document reads its real custody and byte_extraction but promises NO facts level", async () => {
  const c = await capability("pdf", null);
  assert.equal(c.kind_known, false, "the reader says out loud that the kind is not yet known");
  assert.equal(c.custody, "supported");
  assert.equal(c.byte_extraction, "supported");
  assert.equal(c.typed_facts, "unsupported", "no facts promise can be made before the kind is known");
  assert.equal(c.business_operation, "unsupported");
});

cell("clara._document_format resolves every canonical mime AND the live alias spellings, and refuses everything else", async () => {
  for (const [format, mime] of Object.entries(FORMATS)) {
    const r = (await rootQuery("select clara._document_format($1) as f", [mime])).rows[0].f;
    assert.equal(r, format, `${mime} must resolve to ${format}`);
  }
  for (const [declared, format] of [
    ["text/xml", "xml"], ["application/ofx", "ofx"], ["application/x-qfx", "ofx"],
    ["application/vnd.intu.qfx", "ofx"], ["application/csv", "csv"], ["APPLICATION/PDF", "pdf"],
  ]) {
    const r = (await rootQuery("select clara._document_format($1) as f", [declared])).rows[0].f;
    assert.equal(r, format, `${declared} must resolve to ${format}`);
  }
  for (const junk of ["application/zip", "", null, "text/plain"]) {
    const r = (await rootQuery("select clara._document_format($1) as f", [junk])).rows[0].f;
    assert.equal(r, null, `${junk} must not resolve to a format`);
  }
});

// ---------------------------------------------------------------------------------------------
// THE WALL — the registry is a READ surface, never a writable one.
// ---------------------------------------------------------------------------------------------

cell("the registry is forced-RLS, readable by the app roles and writable by none of them", async () => {
  const r = (await rootQuery(`select
      c.relrowsecurity as enabled, c.relforcerowsecurity as forced,
      (select count(*)::int from pg_policies p where p.schemaname='clara' and p.tablename='document_capabilities') as policies,
      has_table_privilege('clara_authenticated','clara.document_capabilities','SELECT') as auth_read,
      has_table_privilege('clara_authenticated','clara.document_capabilities','INSERT') as auth_insert,
      has_table_privilege('clara_authenticated','clara.document_capabilities','UPDATE') as auth_update,
      has_table_privilege('clara_authenticated','clara.document_capabilities','DELETE') as auth_delete,
      has_table_privilege('clara_agent_ro','clara.document_capabilities','SELECT') as agent_read,
      (select count(*)::int from pg_policies p where p.schemaname='clara'
        and p.tablename='document_capabilities' and 'clara_agent_ro' = any (p.roles)) as agent_policies
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='clara' and c.relname='document_capabilities'`)).rows[0];
  assert.equal(r.enabled, true, "RLS enabled");
  assert.equal(r.forced, true, "RLS forced");
  assert.equal(r.policies, 2, "owner ALL + the HUMAN lane's SELECT, and nothing else");
  assert.equal(r.auth_read, true, "the workbench renders this registry");
  // THE AGENT LANE HOLDS NO TABLE PRIVILEGE, and that is the design rather than an omission --
  // 0165's ruling for its twin (clara.document_kind_codeability: "clara_agent_ro holds NO table
  // privilege and reaches the vocabulary only through clara._is_codeable_kind"), and the law
  // rig-runtime-visibility.test.mjs's §6 agent sweep states for every new table. What the lane
  // holds instead is the next cell's three SECURITY DEFINER doors; a `using (true)` policy for a
  // role that already holds those measures nothing, so the policy must not name it either.
  assert.equal(r.agent_read, false,
    "clara_agent_ro holds SELECT on the registry table — it reads the registry through " +
    "clara._document_capability / clara.get_document_state, never off the table");
  assert.equal(r.agent_policies, 0,
    "a document_capabilities policy still names clara_agent_ro — a policy for a role with no grant measures nothing");
  assert.equal(r.auth_insert, false);
  assert.equal(r.auth_update, false);
  assert.equal(r.auth_delete, false);
});

cell("clara._document_capability is EXECUTE-granted to both application read lanes", async () => {
  const r = (await rootQuery(`select
      has_function_privilege('clara_authenticated','clara._document_capability(text,text)','EXECUTE') as a,
      has_function_privilege('clara_agent_ro','clara._document_capability(text,text)','EXECUTE') as b,
      has_function_privilege('clara_authenticated','clara.get_document_state(uuid,uuid)','EXECUTE') as c,
      has_function_privilege('clara_agent_ro','clara.get_document_state(uuid,uuid)','EXECUTE') as d`)).rows[0];
  assert.equal(r.a, true);
  assert.equal(r.b, true);
  assert.equal(r.c, true);
  assert.equal(r.d, true);
});

// A control so the CLR10 import is not dead weight: the registry's own level CHECK refuses a
// value outside the closed set even through the owner role.
cell("CONTROL: an out-of-set level is refused by the table's own CHECK, not merely by convention", async () => {
  const err = await caught(() => rootQuery(
    `insert into clara.document_capabilities(format,document_kind,mime_type,custody,byte_extraction,
        typed_facts,business_operation,engine_id,engine_byte,registry_version,basis)
     values ('zzz','invoice','application/zzz','supported','supported','maybe','supported',null,null,1,'probe')`));
  assert.ok(err, "an out-of-set level was accepted");
  assert.equal(err.code, "23514", `expected a CHECK violation, got ${err.code} (${CLR10} is the migration's own code)`);
});
