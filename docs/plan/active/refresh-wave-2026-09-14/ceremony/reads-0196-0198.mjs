// Release ceremony 0196–0198 (#692 #718 #720) — Phase B read-only reads. Runs as the CHILD of
// scripts/ops/dsn-pipe.mjs (DATABASE_URL + PG* in this process's env) or with PG* set for a rig.
// Prints facts only; never the DSN, never a secret. Modelled on ./reads.mjs (the 0188–0195 ceremony).
// NOTE: imports packages/db/lib/pg.mjs by an absolute file:// URL — this machine only.
//   node reads-0196-0198.mjs [--prod]         -> the reads (--prod: STOP unless the server is the hosted pooler estate)
//   node reads-0196-0198.mjs --r              -> only the 0198 §R "before" reading (all three columns; run right before migrate)
//   node reads-0196-0198.mjs --applied-at     -> the ledger row of 0198 with its applied_at (the §R cutoff instant, DB clock)
//   node reads-0196-0198.mjs --after <ts>     -> the 0198 §R "after" readings against that cutoff
import { makeClient } from "file:///C:/Users/zhant/Desktop/clara-rebuild/packages/db/lib/pg.mjs";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const args = process.argv.slice(2);
const PROD = args.includes("--prod");
const onlyR = args.includes("--r");
const onlyApplied = args.includes("--applied-at");
const afterAt = args.includes("--after") ? args[args.indexOf("--after") + 1] : null;
const MIGRATIONS_DIR = "C:/Users/zhant/Desktop/clara-rebuild/packages/db/migrations";

// Reference values: the migrations' own pinned literals (0196 c_0007_sha; 0197's pinned 0182 probe) and,
// for the bodies the files check by ARMS rather than by sha, the wave-3 rig (clara_w3, frontier 0195, 2026-09-15).
const BODIES = [
  ["clara._tf_firm_document_limits_upsert()", "718eaecd379088396fb7c46783380a81b49404e4793054069d2e9338a27b79be", "0196 pin (0007 body) — RECUT by 0196"],
  ["clara._document_posting_entry(uuid,uuid)", "8ba5e67f7bc92a809e5fbea04b635331c764a48263c1fef4e06f8efe67ebcfd0", "0197 pin (0182 probe) — read, not recut"],
  ["clara.expire_due_interruptions(integer,uuid)", "a0f2fdb8f342594f0ce517b05fb62aa4b066a30341ffbf1eeb515a17c134aae8", "0180 body — RECUT by 0198 (rig reference, not a file pin)"],
  ["clara._draft_entry_core(uuid,uuid,uuid,text,boolean,uuid,uuid,date,text,jsonb,uuid,text,jsonb,text,bigint,jsonb,jsonb,jsonb,text)", "0e4cc4265c83f498bb2aa16b8de708fbcd52c608204158c29b446fd881cbd767", "0197 reads (no lookback) — rig reference"],
  ["clara._approve_entry_core(jsonb,uuid,uuid,text,text)", "d5ab4afc85f79c2676e047ae1f2a5c622cac81f9877a502ae521531b11a3c637", "0197 reads (no lookback) — rig reference"],
  ["clara._approve_opening_entry(uuid,uuid,uuid,text,integer)", "314aae614a21a9e28c55e6f9f7e57f53ef746b327d166bc541493df290bd2bd7", "0197 carve-out premise — rig reference"],
];
const EXPECTED_0187_CHECKSUM = "5fc28e38283088dddef0150384e9a18949301c9bf0ee89cf52957a2f9c5abd46";
// THE migration checksum recipe, mirrored from packages/db/scripts/migrate.mjs (sha256 over CRLF→LF text).
const migrationChecksum = (text) => createHash("sha256").update(text.replace(/\r\n/g, "\n"), "utf8").digest("hex");

const c = makeClient();
await c.connect();
const q = async (sql, params = []) => (await c.query(sql, params)).rows;
const one = async (sql, params = []) => (await q(sql, params))[0];
const fmt = (rows) => rows.map((r) => Object.values(r).join(" | ")).join("\n  ") || "  (none)";
let stops = 0;
const check = (label, ok, detail = "") => { console.log(`  ${ok ? "ok  " : "STOP"} ${label}${detail ? " — " + detail : ""}`); if (!ok) stops++; };

// §R queries, VERBATIM from 0198_chat_clarify_expiry.sql §R (lines 248-252, 261-265, 270-276).
const R_BEFORE = `select count(*)::int as chat_clarifies_past_due,
         min(expires_at) as oldest_deadline,
         count(distinct firm_id)::int as firms_touched
    from clara.agent_interruptions
   where status = 'pending' and work_id is null and expires_at < clock_timestamp()`;
const R_AFTER_AUDIT = `select count(*)::int as chat_rows_expired_by_the_first_sweep
    from clara.audit_log
   where fn = 'expire_due_interruptions'
     and args->>'work' is null
     and at >= $1::timestamptz`;
const R_764 = `select count(*)::int as chat_rows_delivered_onto_a_still_parked_turn
    from clara.agent_interruptions i
    join clara.agent_tasks t on t.id = i.task_id
   where i.work_id is null
     and i.status = 'expired'
     and i.delivery_state = 'delivered'
     and t.status = 'awaiting_input'`;

const ident = await one("select current_user as usr, current_database() as db, inet_server_addr()::text as addr, inet_server_port() as port, left(version(),28) as ver, clock_timestamp() as db_clock");
console.log("== server (BINDING IDENTITY — a 127.0.0.1 / clara_195 / clara_w3 line is a RIG, not production) ==");
console.log(ident);
if (PROD) check("--prod: hosted estate (db=postgres, port 5432, not loopback)", ident.db === "postgres" && ident.port === 5432 && !String(ident.addr).startsWith("127."), `${ident.db}@${ident.addr}:${ident.port}`);

if (onlyR) {
  console.log("== 0198 §R BEFORE (autocommit; clock_timestamp() cutoff, exactly as the sweep) ==");
  console.log(await one(R_BEFORE));
  console.log("work questions past due (informational):", await one(`select count(*)::int as work_questions_past_due from clara.agent_interruptions where status = 'pending' and work_id is not null and expires_at < clock_timestamp()`));
  console.log("ledger:", await one("select count(*)::int as applied, max(version) as frontier from clara.schema_migrations"));
  await c.end(); process.exit(stops ? 2 : 0);
}
if (onlyApplied) {
  console.log("== ledger rows 0196–0198 with applied_at (DB clock; 0198's applied_at is the §R cutoff) ==");
  console.log("  " + fmt(await q("select version, applied_at from clara.schema_migrations where version >= '0196' order by version")));
  console.log("ledger:", await one("select count(*)::int as applied, max(version) as frontier from clara.schema_migrations"));
  await c.end(); process.exit(stops ? 2 : 0);
}
if (afterAt) {
  console.log(`== 0198 §R AFTER the first sweep (cutoff ${afterAt}, read as ${ident.usr}) ==`);
  console.log(await one(R_AFTER_AUDIT, [afterAt]));
  console.log("audit rows of the verb since the cutoff (any lane):", await one(`select count(*)::int as n, min(at) as first_at from clara.audit_log where fn = 'expire_due_interruptions' and at >= $1::timestamptz`, [afterAt]));
  console.log("#764:", await one(R_764));
  console.log("remaining past-due chat clarifies:", await one(`select count(*)::int as n from clara.agent_interruptions where status = 'pending' and work_id is null and expires_at < clock_timestamp()`));
  console.log("NOTE: with a zero backlog the sweep leaves NO trace (audit rows are per swept row; NOTIFY and the log line only on non-empty sweeps) — zeros here witness nothing about the loop; the positive witness that 0198 is live is its own `#720 tail: OK` notice.");
  await c.end(); process.exit(stops ? 2 : 0);
}

console.log("== ledger (expect 190 / 0195) ==");
const led = await one("select count(*)::int as applied, max(version) as frontier from clara.schema_migrations");
console.log(led);
check("frontier is 0195 with 190 applied", led.applied === 190 && led.frontier === "0195_work_egress_purpose_and_execution_trace");
const r187 = await one("select checksum from clara.schema_migrations where version = '0187_legal_v1_beta_publication'");
check("0187 checksum unchanged (carried-forward spot check)", r187 && r187.checksum === EXPECTED_0187_CHECKSUM);
check("0196–0198 not yet in the ledger", (await q("select version from clara.schema_migrations where version >= '0196'")).length === 0);

console.log("== drift gate: EVERY applied row's checksum must equal its file on disk (migrate.mjs aborts the whole run on any one mismatch) ==");
const onDisk = new Map(readdirSync(MIGRATIONS_DIR).filter((f) => /^\d{4}_.*\.sql$/.test(f)).map((f) => [f.replace(/\.sql$/, ""), migrationChecksum(readFileSync(join(MIGRATIONS_DIR, f), "utf8"))]));
const applied = await q("select version, checksum from clara.schema_migrations order by version");
const drift = applied.filter((r) => onDisk.get(r.version) !== r.checksum).map((r) => r.version + (onDisk.has(r.version) ? " (MODIFIED)" : " (MISSING ON DISK)"));
check(`${applied.length} applied rows all match their files`, drift.length === 0, drift.join(","));
check("exactly 0196, 0197, 0198 are on disk beyond the ledger", [...onDisk.keys()].filter((v) => !applied.some((r) => r.version === v)).join(",") === "0196_firm_document_limits_preserving,0197_coding_lane_evidence_link,0198_chat_clarify_expiry");

console.log("== bodies (hosted sha must equal the reference) ==");
for (const [sig, sha, why] of BODIES) {
  const r = await one("select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') as sha from pg_proc p where p.oid = $1::regprocedure", [sig]).catch(() => null);
  check(`${sig.split("(")[0]} ${why}`, r && r.sha === sha, r ? (r.sha === sha ? "" : "hosted=" + r.sha) : "ABSENT");
}

console.log("== 0196 prestate mirror ==");
const cols = await q("select column_name, is_nullable, column_default from information_schema.columns where table_schema='clara' and table_name='firm_document_limits' order by ordinal_position");
console.log("  columns: " + cols.map((x) => `${x.column_name}:${x.is_nullable}:${x.column_default ?? "-"}`).join(" | "));
check("7 columns", cols.length === 7, String(cols.length));
const want = { docs_per_day: ["NO", "100"], pages_per_day: ["NO", "1000"], ocr_concurrency: ["NO", "2"], llm_witness_concurrency: ["YES", "2"] };
for (const [k, [nul, def]] of Object.entries(want)) { const x = cols.find((y) => y.column_name === k); check(`${k} nullability ${nul} default ${def}`, x && x.is_nullable === nul && x.column_default === def, x ? `${x.is_nullable}/${x.column_default}` : "absent"); }
const trg = await one("select coalesce(string_agg(t.tgname, ',' order by t.tgname), '(none)') as names from pg_trigger t where t.tgrelid = 'clara.firm_document_limits'::regclass and not t.tgisinternal");
check("the 0007 four triggers", trg.names === "t_firm_document_limits_firm_immutable,t_firm_document_limits_no_truncate,t_firm_document_limits_stamp,t_firm_document_limits_upsert", trg.names);
const tup = await one("select count(*)::int as n from pg_trigger t where t.tgrelid = 'clara.firm_document_limits'::regclass and t.tgname = 't_firm_document_limits_upsert' and not t.tgisinternal and t.tgfoid = 'clara._tf_firm_document_limits_upsert()'::regprocedure and t.tgtype = 7 and t.tgenabled = 'O'");
check("t_firm_document_limits_upsert is an ENABLED BEFORE INSERT FOR EACH ROW trigger on that function", tup.n === 1);
const acl = await one("select p.proacl::text as proacl, (select c.relacl::text from pg_class c where c.oid = 'clara.firm_document_limits'::regclass) as relacl, p.prosecdef, p.provolatile, (select rolname from pg_roles where oid = p.proowner) as owner from pg_proc p where p.oid = 'clara._tf_firm_document_limits_upsert()'::regprocedure");
check("proacl pinned", acl.proacl === "{clara_fn_owner=X/clara_fn_owner}", acl.proacl);
check("relacl pinned", acl.relacl === "{clara_fn_owner=arwdDxtm/clara_fn_owner,clara_authenticated=r/clara_fn_owner}", acl.relacl);
check("owner clara_fn_owner, SECURITY DEFINER, VOLATILE", acl.owner === "clara_fn_owner" && acl.prosecdef && acl.provolatile === "v");
check("exactly 1 overload", (await one("select count(*)::int as n from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='clara' and p.proname='_tf_firm_document_limits_upsert'")).n === 1);
const cw = await one("select case when to_regclass('clara.control_witnesses') is null then -1 else (select count(*)::int from clara.control_witnesses) end as n");
check("clara.control_witnesses is EMPTY table-wide (covers expire_due_interruptions, which 0198 never checks, and the 0196 trigger body)", cw.n <= 0, cw.n === -1 ? "table absent" : String(cw.n));
check("census control body resolves", (await one("select to_regprocedure('clara._record_journal_entry_core(uuid,uuid,text,uuid,uuid,text,jsonb,text,text,text)') is not null as ok")).ok);
console.log("  firm_document_limits rows: " + (await one("select count(*)::int as n from clara.firm_document_limits")).n);

console.log("== 0197 prestate mirror ==");
check("entry_evidence_links + uq_entry_evidence_links_document present", (await one("select to_regclass('clara.entry_evidence_links') is not null and to_regclass('clara.uq_entry_evidence_links_document') is not null as ok")).ok);
const dc = await one("select position('entry_evidence_links' in p.prosrc) > 0 as lookback, position('double_coded' in p.prosrc) > 0 as clr21 from pg_proc p where p.oid='clara._draft_entry_core(uuid,uuid,uuid,text,boolean,uuid,uuid,date,text,jsonb,uuid,text,jsonb,text,bigint,jsonb,jsonb,jsonb,text)'::regprocedure");
check("_draft_entry_core: no lookback, CLR21 arm present", dc && !dc.lookback && dc.clr21);
const ac = await one("select position('entry_evidence_links' in p.prosrc) > 0 as lookback from pg_proc p where p.oid='clara._approve_entry_core(jsonb,uuid,uuid,text,text)'::regprocedure");
check("_approve_entry_core: no lookback", ac && !ac.lookback);
check("no #718 wall function exists yet", (await one("select to_regprocedure('clara._lock_document_binding(uuid)') is null and to_regprocedure('clara._tf_source_binding_wall()') is null and to_regprocedure('clara._tf_evidence_link_binding_wall()') is null as ok")).ok);
check("no #718 trigger exists yet", (await one("select count(*)::int as n from pg_trigger where tgname in ('t_source_binding_wall_ins','t_source_binding_wall_upd','t_entry_evidence_links_binding_wall') and not tgisinternal")).n === 0);
check("_approve_opening_entry keys on is_opening_balance", (await one("select position('is_opening_balance' in p.prosrc) > 0 as ok from pg_proc p where p.oid='clara._approve_opening_entry(uuid,uuid,uuid,text,integer)'::regprocedure")).ok);
check("journal_entries.is_opening_balance NOT NULL", (await one("select count(*)::int as n from information_schema.columns where table_schema='clara' and table_name='journal_entries' and column_name='is_opening_balance' and is_nullable='NO'")).n === 1);
check("t_je_immutable + t_period_wall BEFORE ROW on journal_entries", (await one("select count(*)::int as n from pg_trigger where tgrelid='clara.journal_entries'::regclass and not tgisinternal and (tgtype & 2) <> 0 and (tgtype & 1) <> 0 and tgname in ('t_je_immutable','t_period_wall')")).n === 2);
console.log("  #718 legacy double claims (PR #822's probe, verbatim): " + (await q(`select d.id as document_id, count(*) as live_posted_entries
    from clara.documents d
    join lateral (
      select je.id from clara.journal_entries je
       where je.document_id = d.id and je.status = 'approved'
         and je.reversal_of is null and je.is_opening_balance = false
      union
      select l.entry_id from clara.entry_evidence_links l
       where l.document_id = d.id and l.released_at is null
    ) e on true
   group by d.id having count(*) > 1`)).length + " row(s); denominators: " + Object.values(await one("select (select count(*)::int from clara.documents) as documents, (select count(*)::int from clara.journal_entries where status='approved' and document_id is not null) as approved_entries_with_document, (select count(*)::int from clara.entry_evidence_links where released_at is null) as live_evidence_links")).join(" / "));

console.log("== 0198 prestate mirror ==");
const ed = await q("select p.oid::regprocedure::text as sig, position('work_id' in p.prosrc) > 0 as scoped, position('clock_timestamp' in p.prosrc) > 0 as own_clock, position('skip locked' in lower(p.prosrc)) > 0 as skip_locked, position('audit' in lower(p.prosrc)) > 0 as audit, position('pg_notify(''clara_runtime_ctl''' in p.prosrc) > 0 as notify from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='clara' and p.proname='expire_due_interruptions'");
console.log("  " + fmt(ed));
check("exactly one expire_due_interruptions body, still work_id-scoped, with 0180's arms", ed.length === 1 && ed[0].scoped && ed[0].own_clock && ed[0].skip_locked && ed[0].audit && ed[0].notify);
check("_tf_interruption_update still allows pending->expired", (await one("select position('expired' in p.prosrc) > 0 as ok from pg_proc p where p.oid='clara._tf_interruption_update()'::regprocedure").catch(() => ({ ok: false }))).ok);
console.log("  §R BEFORE (informational here; the binding reading is --r right before migrate) — all three columns:");
console.log("  " + JSON.stringify(await one(R_BEFORE)));
console.log("  agent_interruptions by status / chat_lane:\n  " + fmt(await q("select status, (work_id is null) as chat_lane, count(*)::int from clara.agent_interruptions group by 1,2 order by 1,2")));
console.log("== §R AFTER read-access probe (same login; a policy-scoped zero must be distinguishable from a true zero) ==");
const al = await one("select current_user as usr, count(*)::int as audit_rows, count(*) filter (where fn = 'expire_due_interruptions')::int as expiry_rows, count(distinct firm_id)::int as firms from clara.audit_log");
console.log("  " + JSON.stringify(al));
check("audit_log readable across firms by this login", al.audit_rows > 0 && al.firms > 1, `${al.audit_rows} rows / ${al.firms} firms as ${al.usr}`);
check("#764 join readable", (await one("select count(*)::int as n from clara.agent_interruptions i join clara.agent_tasks t on t.id = i.task_id where false").catch(() => null)) !== null);

console.log("== quiescence census ==");
console.log("agent_tasks non-terminal by kind/status:\n  " + fmt(await q(`select kind, status, count(*)::int from clara.agent_tasks where status not in ('completed','failed','cancelled','refused','expired','done') group by 1,2 order by 1,2`)));
console.log("accounting_work non-terminal by status:\n  " + fmt(await q(`select status, count(*)::int from clara.accounting_work where status not in ('completed','refused','failed','cancelled','expired') group by 1 order by 1`)));
console.log("workflow_runs non-terminal:\n  " + fmt(await q(`select name, status, count(*)::int from workflow.workflow_runs where status not in ('completed','failed','cancelled') group by 1,2 order by 1,2`).catch((e) => [{ err: e.code || e.message }])));
console.log("backends by role (web writers show as clara_authenticated):\n  " + fmt(await q(`select usename, state, count(*)::int from pg_stat_activity where datname = current_database() and pid <> pg_backend_pid() group by 1,2 order by 1,2`)));
console.log("locks on the tables 0196/0197 take (READ THIS RIGHT BEFORE MIGRATE — a clara_authenticated ROW EXCLUSIVE here is a web writer, and 0197 will time out at 5 s behind it):\n  " + fmt(await q(`select l.relation::regclass::text as rel, l.mode, a.usename, a.state, a.pid from pg_locks l join pg_stat_activity a on a.pid = l.pid where l.relation in ('clara.firm_document_limits'::regclass,'clara.journal_entries'::regclass,'clara.entry_evidence_links'::regclass) and a.pid <> pg_backend_pid()`)));
console.log("advisory lock F10 (migrate.mjs takes it UNBOUNDED; a holder here means step 3 would hang silently):\n  " + fmt(await q(`select a.pid, a.usename, a.state, a.backend_start from pg_locks l join pg_stat_activity a on a.pid = l.pid where l.locktype = 'advisory' and l.classid = 439041101 and l.objid = 794746`)));

console.log(`== verdict: ${stops === 0 ? "CLEAN — proceed" : stops + " STOP item(s) — do NOT migrate"} ==`);
await c.end();
process.exit(stops === 0 ? 0 : 2);
