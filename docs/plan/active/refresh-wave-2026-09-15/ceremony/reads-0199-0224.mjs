// Release ceremony 0199–0224 (riders batch PR #838 + wave 2026-09-15 PR #860) — step 3 read-only
// reads. Runs as the CHILD of scripts/ops/dsn-pipe.mjs (DATABASE_URL + PG* in this process's env)
// or with PG* set for a rig. Prints facts only; never the DSN, never a secret. Modelled on
// ../../refresh-wave-2026-09-14/ceremony/reads-0196-0198.mjs.
// NOTE: imports packages/db/lib/pg.mjs by an absolute file:// URL — this machine only.
//   node reads-0199-0224.mjs [--prod]            -> the reads (--prod: STOP unless the server is the hosted pooler estate)
//   node reads-0199-0224.mjs --census [--prod]   -> ONLY the quiescence + chatTurn_v1 census (re-read after the stop, and before deploy)
//   node reads-0199-0224.mjs --pre-images <dir>  -> also write pg_get_functiondef of every body either batch recuts into <dir>
import { makeClient } from "file:///C:/Users/zhant/Desktop/clara-rebuild/packages/db/lib/pg.mjs";
import { createHash } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const args = process.argv.slice(2);
const PROD = args.includes("--prod");
const onlyCensus = args.includes("--census");
const preDir = args.includes("--pre-images") ? args[args.indexOf("--pre-images") + 1] : null;
const MIGRATIONS_DIR = "C:/Users/zhant/Desktop/clara-rebuild/packages/db/migrations";
const TERMINAL = "('completed','failed','cancelled')";

// The FIRST prestate pin the chain checks for each body hosted still holds at its 0198-era text.
// Verbatim from the migrated files (0199:149, 0200:191, 0200:197, 0201:183, 0204:123). Later pins in
// the chain (0212's adjustment bodies, the wave's four re-issued pins) point at bodies an EARLIER
// file in the same run recuts, so they are expected ABSENT on hosted today and the rehearsal (T = 6 s,
// 26 applied · 219 total) is their witness.
const FIRST_PINS = [
  ["clara.cancel_accounting_work(uuid,uuid,text)", "bfd9f7bef776466b0a793f14faa4c95d4180ea425bc5a433fe50bb5dc73d4799", "0199 pin"],
  ["clara.answer_work_question(uuid,integer,jsonb,text)", "c8fa8eb0c38381cdcd22901abc6851ed9845531bf68cf20b81612c5082d365f7", "0200 pin"],
  ["clara._tf_accounting_work_immutable()", "7a68e97cf22053ea429a930deb7ff418fe7fb673397920b5a56c3f3520ba7f5d", "0200 pin"],
  ["clara.persist_document_extraction(uuid,uuid,jsonb,text)", "0230031fe7d3f18332310fc19f39936b1408cb89ba597f77ce576017fea35905", "0201 pin (signature guessed; falls back to proname match)"],
  ["clara._record_journal_entry_core(uuid,uuid,text,uuid,uuid,text,jsonb,text,text,text)", "f9c4f5258fdd45c115871c67bfb3af9b91a587ff9f723d340b583e052defa4fb", "0204 pin (the posting core at its 0195 text)"],
];
// Every body either batch recuts (runbook 3d) — pre-images for the rollback record.
const RECUT_NAMES = [
  "cancel_accounting_work", "_tf_accounting_work_immutable", "answer_work_question", "persist_document_extraction", "persist_invoice_facts",
  "list_activity", "list_accounting_work", "get_accounting_work_row", "_record_journal_entry_core", "resolve_stripe_event_problem",
  "get_context_pack", "_close_gate_closing_stock", "_bank_registry_ledger_state", "_work_trace_revisions_ok", "_work_trace_text_ok",
  "_adjustment_basis_canonical", "_assert_adjustment_basis", "_assert_adjustment_relationships", "_tf_source_binding_wall",
  "add_counterparty_alias", "rename_counterparty", "set_counterparty_identifiers", "_fa_asset_json", "get_fixed_asset", "set_document_kind",
  "create_accounting_plan", "_assert_plan_schedule", "_plan_occurrence_basis", "_plan_admit_occurrence", "preview_accounting_plan",
];
// Tables that gain a trigger or a body recut in this run — the pg_locks read right before migrate.
const LOCK_TABLES = ["clara.journal_entries", "clara.knowledge_records", "clara.document_filings", "clara.document_capabilities", "clara.accounting_work", "clara.documents", "clara.counterparties", "clara.counterparty_aliases", "clara.accounting_plans"];
// THE migration checksum recipe, mirrored from packages/db/scripts/migrate.mjs (sha256 over CRLF→LF text).
const migrationChecksum = (text) => createHash("sha256").update(text.replace(/\r\n/g, "\n"), "utf8").digest("hex");

const c = makeClient();
await c.connect();
const q = async (sql, params = []) => (await c.query(sql, params)).rows;
const one = async (sql, params = []) => (await q(sql, params))[0];
const fmt = (rows) => rows.map((r) => Object.values(r).join(" | ")).join("\n  ") || "  (none)";
let stops = 0;
const check = (label, ok, detail = "") => { console.log(`  ${ok ? "ok  " : "STOP"} ${label}${detail ? " — " + detail : ""}`); if (!ok) stops++; };

const ident = await one("select current_user as usr, current_database() as db, inet_server_addr()::text as addr, inet_server_port() as port, left(version(),28) as ver, clock_timestamp() as db_clock");
console.log("== server (BINDING IDENTITY — a 127.0.0.1 / clara_198 / clara_int line is a RIG, not production) ==");
console.log(ident);
if (PROD) check("--prod: hosted estate (db=postgres, port 5432, not loopback)", ident.db === "postgres" && ident.port === 5432 && !String(ident.addr).startsWith("127."), `${ident.db}@${ident.addr}:${ident.port}`);

async function census() {
  console.log("== chatTurn_v1 HARD-STOP census (runbook 0a/3c: #810 DELETED the body; a non-terminal run would be permanently unservable) ==");
  console.log("  distinct workflow_runs.name values on the live catalog:\n  " + fmt(await q(`select name, count(*)::int as runs, count(*) filter (where status not in ${TERMINAL})::int as non_terminal from workflow.workflow_runs group by 1 order by 1`).catch((e) => [{ err: e.code || e.message }])));
  const ct = await one(`select count(*)::int as n, coalesce(array_agg(id::text), '{}') as ids from workflow.workflow_runs where name in ('chatTurn_v1','chatTurn') and status not in ${TERMINAL}`).catch((e) => ({ n: -1, ids: [e.code || e.message] }));
  check("zero non-terminal chatTurn_v1 / chatTurn runs", ct.n === 0, `${ct.n} ${JSON.stringify(ct.ids).slice(0, 300)}`);
  console.log("== quiescence census ==");
  console.log("agent_tasks non-terminal by kind/status:\n  " + fmt(await q(`select kind, status, count(*)::int from clara.agent_tasks where status not in ('completed','failed','cancelled','refused','expired','done') group by 1,2 order by 1,2`)));
  console.log("agent_tasks unbound (workflow_run_id null) by kind/status (#820's ten orphan held wake tasks are known noise — confirm it is still ten):\n  " + fmt(await q(`select kind, status, count(*)::int from clara.agent_tasks where workflow_run_id is null and status in ('queued','running','held','awaiting_input','stopping') group by 1,2 order by 1,2`)));
  console.log("agent_interruptions pending by chat_lane:\n  " + fmt(await q(`select (work_id is null) as chat_lane, count(*)::int, min(expires_at) as oldest_deadline from clara.agent_interruptions where status = 'pending' group by 1 order by 1`)));
  console.log("accounting_work non-terminal by status:\n  " + fmt(await q(`select status, count(*)::int from clara.accounting_work where status not in ('completed','refused','failed','cancelled','expired') group by 1 order by 1`)));
  console.log("workflow_runs by status:\n  " + fmt(await q(`select status, count(*)::int from workflow.workflow_runs group by 1 order by 1`).catch((e) => [{ err: e.code || e.message }])));
  console.log("workflow_runs non-terminal by name/status:\n  " + fmt(await q(`select name, status, count(*)::int from workflow.workflow_runs where status not in ${TERMINAL} group by 1,2 order by 1,2`).catch((e) => [{ err: e.code || e.message }])));
  try { console.log("wake_engine_sources:\n  " + fmt(await q(`select source_key, task_kind, enabled from clara.wake_engine_sources order by 1`))); } catch (e) { console.log("wake_engine_sources: " + (e.code || e.message)); }
  console.log("backends by role (web writers show as clara_authenticated; the runtime as its own login):\n  " + fmt(await q(`select usename, application_name, state, count(*)::int from pg_stat_activity where datname = current_database() and pid <> pg_backend_pid() group by 1,2,3 order by 1,2,3`)));
  console.log("locks on the tables this run recuts a body on or adds a trigger to (READ RIGHT BEFORE MIGRATE — migrate.mjs sets NO lock_timeout, a ROW EXCLUSIVE holder here blocks CREATE TRIGGER indefinitely; cancel the blocker, never the migration):\n  " + fmt(await q(`select l.relation::regclass::text as rel, l.mode, a.usename, a.state, a.pid, left(a.query, 60) as query from pg_locks l join pg_stat_activity a on a.pid = l.pid where l.relation::regclass::text = any($1::text[]) and a.pid <> pg_backend_pid()`, [LOCK_TABLES])));
  console.log("advisory lock F10 (migrate.mjs takes it UNBOUNDED; a holder here means the migrate step would hang silently):\n  " + fmt(await q(`select a.pid, a.usename, a.state, a.backend_start from pg_locks l join pg_stat_activity a on a.pid = l.pid where l.locktype = 'advisory' and l.classid = 439041101 and l.objid = 794746`)));
}

if (onlyCensus) {
  console.log("ledger:", await one("select count(*)::int as applied, max(version) as frontier from clara.schema_migrations"));
  await census();
  console.log(`== verdict: ${stops === 0 ? "CLEAN" : stops + " STOP item(s)"} ==`);
  await c.end(); process.exit(stops ? 2 : 0);
}

console.log("== 3a ledger (expect 193 / 0198_chat_clarify_expiry) ==");
const led = await one("select count(*)::int as applied, max(version) as frontier from clara.schema_migrations");
console.log(led);
check("frontier is 0198 with 193 applied", led.applied === 193 && led.frontier === "0198_chat_clarify_expiry");
check("0199–0224 not yet in the ledger", (await q("select version from clara.schema_migrations where version >= '0199'")).length === 0);

console.log("== 3a drift gate: EVERY applied row's checksum must equal its file on disk (migrate.mjs aborts the whole run on any one mismatch) ==");
const onDisk = new Map(readdirSync(MIGRATIONS_DIR).filter((f) => /^\d{4}_.*\.sql$/.test(f)).map((f) => [f.replace(/\.sql$/, ""), migrationChecksum(readFileSync(join(MIGRATIONS_DIR, f), "utf8"))]));
const applied = await q("select version, checksum from clara.schema_migrations order by version");
const drift = applied.filter((r) => onDisk.get(r.version) !== r.checksum).map((r) => r.version + (onDisk.has(r.version) ? " (MODIFIED)" : " (MISSING ON DISK)"));
check(`${applied.length} applied rows all match their files`, drift.length === 0, drift.join(","));
const r198 = applied.find((r) => r.version === "0198_chat_clarify_expiry");
check("0198 (the frontier row) checksum equals its file", r198 && onDisk.get("0198_chat_clarify_expiry") === r198.checksum);
const pending = [...onDisk.keys()].filter((v) => !applied.some((r) => r.version === v)).sort();
check("exactly 26 files 0199…0224 on disk beyond the ledger", pending.length === 26 && pending[0].startsWith("0199_") && pending[25].startsWith("0224_"), pending.length + " pending: " + pending.map((p) => p.slice(0, 4)).join(","));
check("219 files on disk in total", onDisk.size === 219, String(onDisk.size));

console.log("== first prestate pins (hosted sha must equal the pin the chain checks FIRST for that body) ==");
for (const [sig, sha, why] of FIRST_PINS) {
  let r = await one("select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') as sha from pg_proc p where p.oid = $1::regprocedure", [sig]).catch(() => null);
  if (!r) {
    const name = sig.split("(")[0].split(".")[1];
    const rows = await q("select p.oid::regprocedure::text as sig, encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') as sha from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='clara' and p.proname=$1", [name]);
    r = rows.find((x) => x.sha === sha) || rows[0] || null;
    if (r) console.log(`    (resolved by name: ${rows.map((x) => x.sig).join(" ; ")})`);
  }
  check(`${sig.split("(")[0]} ${why}`, r && r.sha === sha, r ? (r.sha === sha ? "" : "hosted=" + r.sha) : "ABSENT");
}

console.log("== 3d pre-images: every body either batch recuts (overloads listed; sha256(prosrc)) ==");
const bodies = await q(`select p.proname, p.oid::regprocedure::text as sig, encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') as sha, pg_get_functiondef(p.oid) as def from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'clara' and p.proname = any($1::text[]) order by 1, 2`, [RECUT_NAMES]);
const present = new Set(bodies.map((b) => b.proname));
for (const b of bodies) console.log(`  ${b.sig}  ${b.sha}`);
const absent = RECUT_NAMES.filter((n) => !present.has(n));
console.log("  absent on hosted (expected for bodies the chain CREATES rather than recuts — judge by the file): " + (absent.join(", ") || "(none)"));
if (preDir) {
  mkdirSync(preDir, { recursive: true });
  const index = [];
  for (const b of bodies) {
    const file = `${b.proname}__${createHash("sha256").update(b.sig).digest("hex").slice(0, 8)}.sql`;
    writeFileSync(join(preDir, file), `-- pre-image captured ${ident.db_clock.toISOString ? ident.db_clock.toISOString() : ident.db_clock} (DB clock) from ${ident.db}@${ident.addr}:${ident.port}\n-- ${b.sig}\n-- sha256(prosrc) = ${b.sha}\n${b.def}\n`);
    index.push(`${b.sha}  ${file}  ${b.sig}`);
  }
  writeFileSync(join(preDir, "INDEX.txt"), index.join("\n") + "\n");
  console.log(`  wrote ${bodies.length} pre-image(s) + INDEX.txt to ${preDir}`);
}

console.log("== 0215's destructive signature change: add_counterparty_alias overloads on hosted ==");
console.log("  " + fmt(await q("select p.oid::regprocedure::text as sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='clara' and p.proname='add_counterparty_alias' order by 1")));

await census();
console.log(`== verdict: ${stops === 0 ? "CLEAN — proceed to the backup" : stops + " STOP item(s) — do NOT migrate"} ==`);
await c.end();
process.exit(stops === 0 ? 0 : 2);
