// Release ceremony — Phase B read-only reads. Runs as the CHILD of scripts/ops/dsn-pipe.mjs
// (which sets DATABASE_URL + PG* in this process's env) or with PG* set directly for a rig.
// Prints facts only. Never prints the DSN, the password or any secret.
//   node reads.mjs            -> the reads
//   node reads.mjs --preimages <dir>  -> also writes pg_get_functiondef of the recut bodies to <dir>
import { makeClient } from "file:///C:/Users/zhant/Desktop/clara-rebuild/packages/db/lib/pg.mjs";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const args = process.argv.slice(2);
const preDir = args.includes("--preimages") ? args[args.indexOf("--preimages") + 1] : null;

// Expected pre-release body shas = the prestate pins of the migrations that recut them.
const PINS = [
  ["clara.save_my_preferences", "3b927762708fc174ac68321b4b32bbf1e4cc37773be4a57fb61e4250598f8399", "0189"],
  ["clara.persist_document_extraction", "8ba95a5210ad839d510729baebff3863862b6073691bf6efaaa7f6e38b8e2354", "0191"],
  ["clara._record_journal_entry_core", "71825bb8d6baf51c6092ddb22d3536a5aaf8d502e775eef0eb3ca59338d2a994", "0194"],
  ["clara.admit_journal_work", "15535149bae5f6a8e50b577928270d638075c87cd8e3560cdd4c4c5ab5d1d0ac", "0194"],
  ["clara._close_gate_closing_stock", "b5daab9ea4bca292f0ac47c06b595557487691b6e78fb35914fff3dd365861c3", "0194"],
  ["clara._tf_accounting_work_immutable", "2c4e2c9f158163058298afc4f1923ef3592938a65a231024584df65e5d8e0054", "0194"],
  ["clara.consume_egress_dispatch(uuid,uuid,uuid,text,bigint,text,text)", "f461ceb0d8e7f59e5a9753170c5fb17831ff6e3dbb3f57906e14653044592ba3", "0195 (unmoved, 7-arg)"],
];
// 0195 pins five 0123 bodies (order in the file unknown here): the set must be matched by these five.
const PIN_SET_0195 = new Set([
  "bc270350435aa78fd194a4985feca93f18af06f00a1ccb10bbf2e80f74074479",
  "653a9d35072989da1ea3641c41e9f3ee32f28bff9175440d619af5bc0df89e83",
  "071c2e4338465cfd1a72450f242a9169278ef95817f16b530e278335f3d2d65b",
  "c3054920ee409b4ebdb31071ad4593173dd0b3b5aa73c5a231e28ad220a8bd32",
  "d41c649b23d1e624cb77a6981e4d1e29e14ee7a800d27ed2f3a4cf002276a500",
]);
const SET_0195_NAMES = [
  "clara.prepare_egress_dispatch",
  "clara.grant_client_egress_purpose",
  "clara.activate_client_egress_purpose",
  "clara.deactivate_client_egress_purpose",
  "clara.revoke_client_egress_purpose",
];
const EXPECTED_0187_CHECKSUM = "5fc28e38283088dddef0150384e9a18949301c9bf0ee89cf52957a2f9c5abd46";

const c = makeClient();
await c.connect();
const q = async (sql, params = []) => (await c.query(sql, params)).rows;
const one = async (sql, params = []) => (await q(sql, params))[0];
const fmt = (rows) => rows.map((r) => Object.values(r).join(" | ")).join("\n  ") || "  (none)";

console.log("== server ==");
console.log(await one("select inet_server_addr()::text as addr, inet_server_port() as port, current_database() as db, current_user as usr, version() as ver"));

console.log("== ledger ==");
console.log(await one("select count(*)::int as applied, max(version) as frontier from clara.schema_migrations"));
const r187 = await one("select version, checksum from clara.schema_migrations where version = '0187_legal_v1_beta_publication'");
console.log("0187 checksum:", r187 ? r187.checksum : "(absent)", r187 && r187.checksum === EXPECTED_0187_CHECKSUM ? "MATCH" : "MISMATCH — STOP");

console.log("== recut-body pins (hosted body sha must equal the migration's prestate pin) ==");
const shaRows = await q(`select n.nspname||'.'||p.proname as name, p.oid::regprocedure::text as sig,
    encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') as sha
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'clara' and p.proname = any($1)`,
  [[...PINS.map((p) => p[0].replace(/\(.*\)$/, "").split(".")[1]), ...SET_0195_NAMES.map((n) => n.split(".")[1])]]);
const byName = {};
for (const r of shaRows) (byName[r.name] ||= []).push(r);
for (const [name, pin, mig] of PINS) {
  const bare = name.replace(/\(.*\)$/, "");
  let rows = byName[bare] || [];
  if (name.includes("(")) rows = rows.filter((r) => r.sig === name);
  if (!rows.length) { console.log(`  ${name}: ABSENT — STOP`); continue; }
  for (const r of rows) console.log(`  ${r.sig}: ${r.sha === pin ? "MATCH" : "MISMATCH — STOP"} (${mig}) ${r.sha === pin ? "" : "hosted=" + r.sha}`);
}
let setHits = 0;
for (const name of SET_0195_NAMES) {
  const rows = byName[name] || [];
  if (!rows.length) { console.log(`  ${name}: ABSENT — STOP`); continue; }
  for (const r of rows) { const hit = PIN_SET_0195.has(r.sha); if (hit) setHits++; console.log(`  ${r.sig}: ${hit ? "in 0195 pin set" : "other overload (not pinned) — informational"} sha=${r.sha}`); }
}
console.log(`  0195 pin set matched: ${setHits}/5`);

console.log("== data prestates (expect 0 / 5 / 0 / 0) ==");
console.log(await one(`select
  (select count(*)::int from clara.user_preferences where interface ? 'workViews') as workviews_rows,
  (select count(*)::int from clara.client_fact_keys) as legacy_fact_keys,
  (select count(*)::int from clara.client_egress_purpose_consents where purpose='accounting_work') as aw_consents,
  (select count(*)::int from clara.egress_dispatch_authorizations
     where not ((purpose <> 'wiki_synthesis' or document_sha256 is null)
            and (purpose <> 'statement_extraction' or document_sha256 is not null)
            and (purpose <> 'witness_extraction' or document_sha256 is not null)
            and (purpose <> 'bank_matching' or document_sha256 is null))) as doc_sha_violations`));

console.log("== quiescence census ==");
console.log("agent_tasks non-terminal by kind/status:\n  " + fmt(await q(`select kind, status, count(*)::int from clara.agent_tasks where status not in ('completed','failed','cancelled','refused','expired','done') group by 1,2 order by 1,2`)));
console.log("agent_tasks unbound (workflow_run_id null) by kind/status:\n  " + fmt(await q(`select kind, status, count(*)::int from clara.agent_tasks where workflow_run_id is null and status in ('queued','running','held','awaiting_input','stopping') group by 1,2 order by 1,2`)));
console.log("agent_interruptions by status:\n  " + fmt(await q(`select status, count(*)::int from clara.agent_interruptions group by 1 order by 1`)));
console.log("accounting_work non-terminal by status:\n  " + fmt(await q(`select status, count(*)::int from clara.accounting_work where status not in ('completed','refused','failed','cancelled','expired') group by 1 order by 1`)));
try {
  console.log("workflow_runs by status:\n  " + fmt(await q(`select status, count(*)::int from workflow.workflow_runs group by 1 order by 1`)));
  console.log("workflow_runs non-terminal names:\n  " + fmt(await q(`select name, status, count(*)::int from workflow.workflow_runs where status not in ('completed','failed','cancelled') group by 1,2 order by 1,2`)));
} catch (e) { console.log("workflow.workflow_runs: " + (e.code || e.message)); }
try { console.log("wake_engine_sources:\n  " + fmt(await q(`select source_key, task_kind, enabled from clara.wake_engine_sources order by 1`))); } catch (e) { console.log("wake_engine_sources: " + (e.code || e.message)); }

console.log("== preflight grant probe (this login must SELECT each) ==");
for (const rel of ["workflow.workflow_runs", "workflow.workflow_steps", "clara.agent_tasks", "clara.wake_engine_sources", "clara.schema_migrations", "clara.accounting_work", "clara.agent_interruptions"]) {
  try { const r = await one(`select count(*)::int as n from ${rel}`); console.log(`  ${rel}: ok (${r.n})`); }
  catch (e) { console.log(`  ${rel}: DENIED/ERROR ${e.code || ""} ${e.message}`); }
}

if (preDir) {
  mkdirSync(preDir, { recursive: true });
  const names = [...PINS.map((p) => p[0].replace(/\(.*\)$/, "").split(".")[1]), ...SET_0195_NAMES.map((n) => n.split(".")[1])];
  const defs = await q(`select p.oid::regprocedure::text as sig, p.proname, pg_get_functiondef(p.oid) as def,
      encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') as sha
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname='clara' and p.proname = any($1)`, [names]);
  const index = [];
  for (const d of defs) {
    const file = d.proname + ".sql";
    writeFileSync(join(preDir, file), d.def + "\n");
    index.push(`${d.sha}  ${d.sig}  -> ${file}`);
  }
  writeFileSync(join(preDir, "SHAS.txt"), index.join("\n") + "\n");
  console.log(`== pre-images written: ${defs.length} bodies -> ${preDir} ==`);
}
await c.end();
