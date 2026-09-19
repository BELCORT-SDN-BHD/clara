// Release ceremony 0225–0233 (wave 2026-09-18) — step 3 read-only reads.
// Runs as the CHILD of scripts/ops/dsn-pipe.mjs (DATABASE_URL + PG* in this process's env) or
// with PG* set for a rig. Prints facts only; never the DSN, never a secret. Modelled on
// ../../refresh-wave-2026-09-15/ceremony/reads-0199-0224.mjs.
//
// EVERY STATEMENT IS A SELECT INSIDE ONE `begin transaction read only`. No DDL, no DML, no
// `set role`, no advisory lock, no `pg_stat_force_next_flush`. The transaction mode is the belt:
// a stray write would raise 25006 rather than land.
//
// NOTE: imports packages/db/lib/pg.mjs by an absolute file:// URL — this machine only.
//
//   node reads-0225-0233.mjs --print-pins                -> OFFLINE. Parse the pins out of the
//                                                           migration files and print them. No DB.
//   node reads-0225-0233.mjs [--prod]                    -> the reads (--prod: STOP unless the
//                                                           server is the hosted pooler estate)
//   node reads-0225-0233.mjs --census [--prod]           -> ONLY the quiescence census (re-read
//                                                           after the machine stop, and again
//                                                           before the deploy)
//   node reads-0225-0233.mjs --post [--prod]             -> ONLY the five post-release reads
//                                                           (run again after the migrate step;
//                                                           the same SQL, so pre/post compare)
//   node reads-0225-0233.mjs --pre-images <dir>          -> also write pg_get_functiondef of every
//                                                           body this wave recuts into <dir>
//
// THE PINS ARE PARSED FROM THE MIGRATION FILE TEXT, NEVER TRANSCRIBED. A pin re-issued in a file
// after this script was written is picked up automatically; a pin this script could not parse is
// reported as a PARSE GAP and counts as a STOP, because an unchecked pin is an unchecked pin.
import { makeClient } from "file:///C:/Users/zhant/Desktop/clara-rebuild/packages/db/lib/pg.mjs";
import { createHash } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const args = process.argv.slice(2);
const PROD = args.includes("--prod");
const onlyCensus = args.includes("--census");
const onlyPost = args.includes("--post");
const printPins = args.includes("--print-pins");
const preDir = args.includes("--pre-images") ? args[args.indexOf("--pre-images") + 1] : null;

const REPO = "C:/Users/zhant/Desktop/clara-rebuild";
const MIGRATIONS_DIR = `${REPO}/packages/db/migrations`;
const WAVE = ["0225", "0226", "0227", "0228", "0229", "0230", "0231", "0232", "0233"];
const TERMINAL = "('completed','failed','cancelled')";

// THE migration checksum recipe, mirrored from packages/db/scripts/migrate.mjs (sha256 over
// CRLF→LF text). The runner aborts the WHOLE run on any applied row whose file has moved.
const migrationChecksum = (text) => createHash("sha256").update(text.replace(/\r\n/g, "\n"), "utf8").digest("hex");

// =====================================================================================
// THE PARSER. Prestate pins only: everything BEFORE a file's first DDL statement.
// =====================================================================================
const DDL_RE =
  /^[ \t]*(?:set\s+role\b|create\s+(?:or\s+replace\s+)?(?:constraint\s+)?(?:function|table|trigger|index|unique\s+index|view|materialized\s+view|type|policy|schema|sequence)\b|alter\s+table\b|drop\s+function\b|update\s+clara\.|insert\s+into\s+clara\.|grant\s+|revoke\s+)/im;
const SIG_RE = /'(clara\.[a-z_0-9]+\([^')]*\))'/g;
const SHA_RE = /'([0-9a-f]{64})'/g;
const VAR_SHA_RE = /^[ \t]*(v_[a-z_0-9]+)[ \t]+constant[ \t]+text[ \t]*:=[ \t]*'([0-9a-f]{64})'/gim;
// How far after a signature literal a pin's sha may sit. Measured against all nine files: the
// widest real gap is 0231's `p.oid = '<sig>'::regprocedure;\n  if v_sha <> v_pin_queue then`.
const PIN_WINDOW = 400;

function prestateOf(text) {
  const m = DDL_RE.exec(text);
  return m ? text.slice(0, m.index) : text;
}

/** Parse (signature, expected sha) pairs out of ONE migration's prestate region. */
function parsePins(version, text) {
  const pre = prestateOf(text);
  const vars = new Map();
  for (const m of pre.matchAll(VAR_SHA_RE)) vars.set(m[1], m[2]);

  const sigs = [...pre.matchAll(SIG_RE)].map((m) => ({ sig: m[1], at: m.index, end: m.index + m[0].length }));
  const shas = [...pre.matchAll(SHA_RE)].map((m) => ({ sha: m[1], at: m.index }));
  const varRefs = [];
  if (vars.size) {
    const varRe = new RegExp(`\\b(${[...vars.keys()].join("|")})\\b`, "g");
    for (const m of pre.matchAll(varRe)) varRefs.push({ sha: vars.get(m[1]), at: m.index, via: m[1] });
  }

  const pins = [];
  for (let i = 0; i < sigs.length; i++) {
    const s = sigs[i];
    const nextSigAt = i + 1 < sigs.length ? sigs[i + 1].at : Infinity;
    const limit = Math.min(s.end + PIN_WINDOW, nextSigAt);
    const cands = [...shas, ...varRefs].filter((x) => x.at >= s.end && x.at < limit).sort((a, b) => a.at - b.at);
    if (cands.length) pins.push({ version, sig: s.sig, sha: cands[0].sha, via: cands[0].via || "literal" });
  }
  // Dedupe (a pin written twice in one prestate) and surface a genuine conflict rather than
  // silently taking the first: two shas for one signature means the parse is wrong.
  const bySig = new Map();
  const conflicts = [];
  for (const p of pins) {
    const prev = bySig.get(p.sig);
    if (prev && prev.sha !== p.sha) conflicts.push(`${p.sig}: ${prev.sha.slice(0, 8)}… vs ${p.sha.slice(0, 8)}…`);
    else bySig.set(p.sig, p);
  }
  // A 64-hex literal in the prestate that NO signature claimed is a parse gap.
  const claimed = new Set([...bySig.values()].map((p) => p.sha));
  const orphanShas = shas.filter((x) => !claimed.has(x.sha)).map((x) => x.sha);
  return { pins: [...bySig.values()], conflicts, orphanShas };
}

/** 0226's thirteen CoR-re-patched `_agent_*_core` bodies: the anchor each must carry EXACTLY once
 *  before the file will patch it. Parsed from 0226's own `v_sigs` array and its `v_target :=` line,
 *  so this census cannot drift from the file either. */
function parseBankCoreAnchors(text) {
  const t = /v_target\s*:=\s*'([^']*)'\s*\|\|\s*v_client_var\s*\|\|\s*'([^']*)'/.exec(text);
  const block = /v_sigs\s+text\[\]\s*:=\s*array\[([\s\S]*?)\];/.exec(text);
  if (!t || !block) return { rows: [], prefix: null, suffix: null };
  const rows = [...block[1].matchAll(/'(clara\.[a-z_0-9]+\([^')]*\))\|([a-z_0-9]+)'/g)].map((m) => ({
    sig: m[1],
    clientVar: m[2],
    anchor: t[1] + m[2] + t[2],
  }));
  return { rows, prefix: t[1], suffix: t[2] };
}

const FILES = new Map();
for (const f of readdirSync(MIGRATIONS_DIR).filter((n) => /^\d{4}_.*\.sql$/.test(n))) {
  FILES.set(f.replace(/\.sql$/, ""), readFileSync(join(MIGRATIONS_DIR, f), "utf8"));
}
const waveFiles = WAVE.map((v) => {
  const name = [...FILES.keys()].find((k) => k.startsWith(v + "_"));
  if (!name) throw new Error(`migration ${v} not found on disk`);
  return { version: v, name, text: FILES.get(name) };
});

const PINS = [];
const PARSE_GAPS = [];
for (const f of waveFiles) {
  const { pins, conflicts, orphanShas } = parsePins(f.version, f.text);
  PINS.push(...pins);
  for (const c of conflicts) PARSE_GAPS.push(`${f.name}: two shas for one signature — ${c}`);
  for (const s of orphanShas) PARSE_GAPS.push(`${f.name}: prestate sha ${s.slice(0, 12)}… claimed by no signature`);
}
const BANK = parseBankCoreAnchors(waveFiles.find((f) => f.version === "0226").text);

// Every body this wave RECUTS — the pre-images for the rollback record. Derived from the pin set
// (the recut targets are pinned) plus the two 0226 names the file drops/recreates.
const RECUT_NAMES = [
  // 0225 (three, DECISIONS §6.2.1)
  "_record_journal_entry_core", "_subledger_classify_entry", "_tf_subledger_item_belt",
  // 0226 (five recut + the thirteen re-patched cores + the two new reads' subjects)
  "list_bank_match_candidates", "_agent_get_bank_pack_core", "_match_bank_line_core",
  "_agent_verify_inputs_digest", "_agent_bank_receipt", "_wdb_line_booking_block", "match_bank_line",
  ...BANK.rows.map((r) => r.sig.split("(")[0].split(".")[1]),
  // 0227 (ten)
  "_fa_oldest_unmet_period", "_fa_run_period_core", "_fa_asset_json", "revise_fixed_asset_particulars",
  "sign_depreciation_authority", "_fa_validate_particulars", "complete_fixed_asset_particulars",
  "_fa_complete_particulars_core", "_tf_fa_authority_transition", "retire_depreciation_authority",
  // 0233 (one)
  "get_llm_usage_summary",
];

if (printPins) {
  console.log(`== pins parsed from ${waveFiles.length} migration file(s) — OFFLINE, no database ==`);
  for (const f of waveFiles) {
    const mine = PINS.filter((p) => p.version === f.version);
    console.log(`\n-- ${f.name} — ${mine.length} pin(s)`);
    for (const p of mine) console.log(`   ${p.sha}  ${p.sig}${p.via === "literal" ? "" : "  (via " + p.via + ")"}`);
  }
  console.log(`\n== 0226's thirteen CoR anchors ==`);
  console.log(`   prefix ${JSON.stringify(BANK.prefix)}  suffix ${JSON.stringify(BANK.suffix)}`);
  for (const r of BANK.rows) console.log(`   ${r.clientVar.padEnd(9)} ${r.sig}`);
  console.log(`\n== totals ==\n   pins ${PINS.length} · bank anchors ${BANK.rows.length} · recut names ${new Set(RECUT_NAMES).size}`);
  if (PARSE_GAPS.length) { console.log("\n== PARSE GAPS =="); for (const g of PARSE_GAPS) console.log("   " + g); }
  process.exit(PARSE_GAPS.length ? 2 : 0);
}

// =====================================================================================
// THE READS.
// =====================================================================================
const c = makeClient();
await c.connect();
await c.query("begin transaction read only");
// Each read runs under its own SAVEPOINT: a soft failure (a relation this estate does not carry,
// e.g. workflow.workflow_runs on a rig with no World) is rolled back to the savepoint instead of
// aborting the whole read-only transaction (25P02 on every later statement — measured on the
// 2026-09-19 rig dry run). SAVEPOINT is lawful inside `begin transaction read only`; it writes nothing.
const q = async (sql, params = []) => {
  await c.query("savepoint rq");
  try {
    const r = await c.query(sql, params);
    await c.query("release savepoint rq");
    return r.rows;
  } catch (e) {
    await c.query("rollback to savepoint rq");
    throw e;
  }
};
const one = async (sql, params = []) => (await q(sql, params))[0];
const fmt = (rows) => rows.map((r) => Object.values(r).map((v) => (v === null ? "null" : String(v))).join(" | ")).join("\n  ") || "  (none)";
let stops = 0;
const check = (label, ok, detail = "") => {
  console.log(`  ${ok ? "ok  " : "STOP"} ${label}${detail ? " — " + detail : ""}`);
  if (!ok) stops++;
};
const note = (label, detail) => console.log(`  --  ${label}${detail === undefined ? "" : " — " + detail}`);

const ident = await one(
  "select current_user as usr, current_database() as db, inet_server_addr()::text as addr, inet_server_port() as port, left(version(),28) as ver, clock_timestamp() as db_clock, (select count(*)::int from pg_roles where rolname like 'clara%') as clara_roles",
);
console.log("== server (BINDING IDENTITY — a 127.0.0.1 / clara_int / clara_rt line is a RIG, not production) ==");
console.log(ident);
if (PROD) {
  check(
    "--prod: hosted estate (db=postgres, port 5432, not loopback)",
    ident.db === "postgres" && ident.port === 5432 && !String(ident.addr).startsWith("127."),
    `${ident.db}@${ident.addr}:${ident.port}`,
  );
}
console.log(`  clara% role count: ${ident.clara_roles} (the integration chain measured 18 on a virgin cluster)`);

// -------------------------------------------------------------------------------------
async function census() {
  console.log("== quiescence census ==");
  console.log("agent_tasks non-terminal by kind/status:\n  " + fmt(await q(
    `select kind, status, count(*)::int from clara.agent_tasks
      where status not in ('completed','failed','cancelled','refused','expired','done') group by 1,2 order by 1,2`)));
  console.log("agent_tasks unbound (workflow_run_id null) and LIVE — the preflight's second census; `held` counts:\n  " + fmt(await q(
    `select kind, status, count(*)::int from clara.agent_tasks
      where workflow_run_id is null and status in ('queued','running','held','awaiting_input','stopping') group by 1,2 order by 1,2`)));
  console.log("document_processing_tasks by lane/status (the OTHER table the preflight censuses):\n  " + fmt(await q(
    `select lane, status, count(*)::int from clara.document_processing_tasks group by 1,2 order by 1,2`)
    .catch((e) => [{ err: e.code || e.message }])));
  console.log("agent_interruptions pending by chat_lane:\n  " + fmt(await q(
    `select (work_id is null) as chat_lane, count(*)::int, min(expires_at) as oldest_deadline
       from clara.agent_interruptions where status = 'pending' group by 1 order by 1`)));
  console.log("accounting_work non-terminal by status:\n  " + fmt(await q(
    `select status, count(*)::int from clara.accounting_work
      where status not in ('completed','refused','failed','cancelled','expired') group by 1 order by 1`)));
  console.log("workflow_runs by status:\n  " + fmt(await q(
    `select status, count(*)::int from workflow.workflow_runs group by 1 order by 1`).catch((e) => [{ err: e.code || e.message }])));
  console.log("STRANDED-BODY CENSUS INPUT — non-terminal workflow_runs by name/status (every name here must be in\n  the TARGET image's workflowBodies; this image carries 55):\n  " + fmt(await q(
    `select name, status, count(*)::int from workflow.workflow_runs
      where status not in ${TERMINAL} group by 1,2 order by 1,2`).catch((e) => [{ err: e.code || e.message }])));
  try { console.log("wake_engine_sources:\n  " + fmt(await q(`select source_key, task_kind, enabled from clara.wake_engine_sources order by 1`))); }
  catch (e) { console.log("wake_engine_sources: " + (e.code || e.message)); }
  console.log("backends by role (web writers show as clara_authenticated; the runtime as its own login):\n  " + fmt(await q(
    `select usename, application_name, state, count(*)::int from pg_stat_activity
      where datname = current_database() and pid <> pg_backend_pid() group by 1,2,3 order by 1,2,3`)));
  // The tables 0225/0227/0228/0229 take a conflicting lock on, plus the recut families' tables.
  const LOCK_TABLES = [
    "clara.journal_entries", "clara.journal_lines", "clara.operation_receipts", "clara.open_items",
    "clara.accounting_work", "clara.document_intakes", "clara.document_capabilities",
    "clara.fixed_assets", "clara.fa_depreciation_authorities", "clara.bank_agent_receipts",
    "clara.bank_statement_lines", "clara.knowledge_records",
  ];
  console.log("locks on the tables this run adds a trigger to / alters / updates (READ RIGHT BEFORE MIGRATE —\n  migrate.mjs sets NO lock_timeout and NONE of the nine files sets one either, so a ROW EXCLUSIVE holder\n  here blocks CREATE TRIGGER / ALTER TABLE indefinitely; cancel the blocker with pg_cancel_backend,\n  NEVER the migration):\n  " + fmt(await q(
    `select l.relation::regclass::text as rel, l.mode, a.usename, a.state, a.pid, left(a.query, 60) as query
       from pg_locks l join pg_stat_activity a on a.pid = l.pid
      where l.relation::regclass::text = any($1::text[]) and a.pid <> pg_backend_pid()`, [LOCK_TABLES])));
  console.log("advisory lock F10 (migrate.mjs takes 0x1a2b3c4d/0x00c1a7a UNBOUNDED; a holder here means the\n  migrate step would hang silently):\n  " + fmt(await q(
    `select a.pid, a.usename, a.state, a.backend_start from pg_locks l join pg_stat_activity a on a.pid = l.pid
      where l.locktype = 'advisory' and l.classid = 439041101 and l.objid = 794746`)));
}

// -------------------------------------------------------------------------------------
// The five post-release reads this wave owes, read as "pre" values. Run this same block again
// after the migrate step (`--post`) so the two readings sit side by side in the as-run table.
async function postReads() {
  console.log("== the reads this wave owes, as PRE values (re-run with --post after the migrate step) ==");

  console.log("\n-- (1) #660 · approved entries the unmarked-closing-transfer detector will report");
  console.log("   0232's own predicate, estate-wide (the door scopes it to one client and one period;\n   the KNOWN COVERAGE LIMIT in packages/db/README.md says this hosted count is a release-time read):");
  console.log("   " + fmt(await q(
    `select count(*)::int as unmarked_entries, count(distinct e.client_id)::int as clients
       from clara.journal_entries e
      where e.status = 'approved' and e.closing_transfer = false
        and (e.close_receipt_id is not null
             or exists (select 1 from clara.journal_entries o where o.id = e.reversal_of and o.close_receipt_id is not null))`)
    .catch((e) => [{ err: e.code || e.message }])));
  console.log("   for context — approved year-end entries by closing_transfer:\n   " + fmt(await q(
    `select is_year_end, closing_transfer, count(*)::int from clara.journal_entries
      where status = 'approved' group by 1,2 order by 1,2`).catch((e) => [{ err: e.code || e.message }])));

  console.log("\n-- (2) #651 · the rows 0227's authority_from backfill will stamp, and the CHECK that could refuse");
  console.log("   " + fmt(await q(
    `select count(*)::int as authorities,
            count(*) filter (where signed_at is not null)::int as will_be_stamped,
            count(*) filter (where status in ('live','retired') and signed_at is null)::int as ck_window_violations
       from clara.fa_depreciation_authorities`).catch((e) => [{ err: e.code || e.message }])));
  console.log("   by status:\n   " + fmt(await q(
    `select status, count(*)::int, count(*) filter (where signed_at is null)::int as unsigned
       from clara.fa_depreciation_authorities group by 1 order by 1`).catch((e) => [{ err: e.code || e.message }])));
  console.log("   THE ONE ROW SHAPE THAT ABORTS 0227: status in (live,retired) with signed_at null — the backfill\n   skips it and ck_fa_authorities_window then refuses. Must be ZERO before the window opens.");
  console.log("   0227's DECISIONS §6.1 hazard, measured here rather than assumed — rows whose MYT and UTC month\n   differ (its rig measured zero):\n   " + fmt(await q(
    `select count(*)::int as myt_vs_utc_month_differs from clara.fa_depreciation_authorities
      where signed_at is not null
        and date_trunc('month', (signed_at at time zone 'Asia/Kuala_Lumpur')::date)
            <> date_trunc('month', (signed_at at time zone 'UTC')::date)`).catch((e) => [{ err: e.code || e.message }])));

  console.log("\n-- (3) #660 D1 · does any client have a PUBLISHED cash account set?");
  const csRel = await one(`select to_regclass('clara.cash_account_set_versions')::text as rel`);
  if (!csRel.rel) {
    console.log("   clara.cash_account_set_versions ABSENT — expected BEFORE 0232; the read is meaningful only after it.");
  } else {
    console.log("   " + fmt(await q(
      `select count(*)::int as versions, count(distinct client_id)::int as clients_with_a_set,
              count(*) filter (where state = 'published')::int as current_versions /* 0232 has no is_current column: the open version is state=published (as-run fix 2026-09-19) */
         from clara.cash_account_set_versions`).catch((e) => [{ err: e.code || e.message }])));
  }

  console.log("\n-- (4) 0228 · clara.document_capabilities registry_version (must read 1 everywhere BEFORE, 2 AFTER)");
  console.log("   " + fmt(await q(
    `select count(*)::int as rows, count(distinct registry_version)::int as distinct_versions,
            min(registry_version) as min_v, max(registry_version) as max_v
       from clara.document_capabilities`).catch((e) => [{ err: e.code || e.message }])));
  console.log("   0228's own prestate refuses unless rows = 240 and distinct_versions = 1.");

  console.log("\n-- (5) #847 · clara.work_execution_traces run-id census (claraWork_v5 now DROPS a whole trace row\n   whose run id 0210's grammar would refuse, so the hosted shape decides whether that ever fires)");
  console.log("   " + fmt(await q(
    `select count(*)::int as rows, count(distinct run_id)::int as distinct_run_ids,
            count(*) filter (where run_id ~ '^wrun_[0-9ABCDEFGHJKMNPQRSTVWXYZ]{26}$')::int as wdk_ulid_shape,
            count(*) filter (where run_id !~ '^wrun_[0-9ABCDEFGHJKMNPQRSTVWXYZ]{26}$' and run_id ~ '[0-9]{13,}')::int as would_be_refused,
            max(length(run_id))::int as max_len
       from clara.work_execution_traces`).catch((e) => [{ err: e.code || e.message }])));
  console.log("   registry_version values already stored (v5 stamps clara-capability-registry/v2):\n   " + fmt(await q(
    `select registry_version, count(*)::int from clara.work_execution_traces group by 1 order by 1`)
    .catch((e) => [{ err: e.code || e.message }])));

  console.log("\n-- (6) 0233 · clara.get_llm_usage_summary — the material for the OWNER QUESTION about out-of-repo callers");
  console.log("   0233's header measured ZERO callers in apps/web and packages/runtime. The estate cannot see a\n   PostgREST caller, so what is readable is the door's reachability and its in-catalog callers.");
  console.log("   in-catalog callers:\n   " + fmt(await q(
    `select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'clara' and p.proname <> 'get_llm_usage_summary'
        and position('get_llm_usage_summary' in p.prosrc) > 0 order by 1`).catch((e) => [{ err: e.code || e.message }])));
  console.log("   who holds EXECUTE today (a body floor does not change this ACL — 0233's tail asserts it is\n   byte-identical to the pre-image):\n   " + fmt(await q(
    `select a.grantee::regrole::text as grantee, a.privilege_type
       from pg_proc p, aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
      where p.oid = to_regprocedure('clara.get_llm_usage_summary(uuid,date,uuid)') order by 1`)
    .catch((e) => [{ err: e.code || e.message }])));
  console.log("   whether anything has CALLED it on this estate (only meaningful if track_functions is on):\n   " + fmt(await q(
    `select (select setting from pg_settings where name = 'track_functions') as track_functions,
            coalesce((select calls from pg_stat_user_functions s
                       where s.funcid = to_regprocedure('clara.get_llm_usage_summary(uuid,date,uuid)')), 0) as calls`)
    .catch((e) => [{ err: e.code || e.message }])));
}

// -------------------------------------------------------------------------------------
if (onlyCensus) {
  console.log("ledger:", await one("select count(*)::int as applied, max(version) as frontier from clara.schema_migrations"));
  await census();
  console.log(`== verdict: ${stops === 0 ? "CLEAN" : stops + " STOP item(s)"} ==`);
  await c.query("commit"); await c.end(); process.exit(stops ? 2 : 0);
}
if (onlyPost) {
  console.log("ledger:", await one("select count(*)::int as applied, max(version) as frontier from clara.schema_migrations"));
  await postReads();
  await c.query("commit"); await c.end(); process.exit(0);
}

// =====================================================================================
console.log("== 3a ledger (expect 219 / 0224_preview_invite) ==");
const led = await one("select count(*)::int as applied, max(version) as frontier from clara.schema_migrations");
console.log(led);
check("frontier is 0224 with 219 applied", led.applied === 219 && led.frontier === "0224_preview_invite");
check("0225–0233 not yet in the ledger", (await q("select version from clara.schema_migrations where version >= '0225'")).length === 0);

console.log("== 3a the LAST FIVE ledger rows, with their checksums against the files on disk ==");
const lastFive = await q("select version, checksum, applied_at from clara.schema_migrations order by version desc limit 5");
for (const r of lastFive) {
  const onDisk = FILES.has(r.version) ? migrationChecksum(FILES.get(r.version)) : null;
  check(`${r.version} ${String(r.applied_at)}`, onDisk === r.checksum, onDisk === null ? "MISSING ON DISK" : onDisk === r.checksum ? r.checksum.slice(0, 12) + "…" : `ledger ${r.checksum.slice(0, 12)}… vs file ${onDisk.slice(0, 12)}…`);
}

console.log("== 3a drift gate: EVERY applied row's checksum must equal its file (migrate.mjs aborts the whole run on one mismatch) ==");
const applied = await q("select version, checksum from clara.schema_migrations order by version");
const drift = applied
  .filter((r) => (FILES.has(r.version) ? migrationChecksum(FILES.get(r.version)) : null) !== r.checksum)
  .map((r) => r.version + (FILES.has(r.version) ? " (MODIFIED)" : " (MISSING ON DISK)"));
check(`${applied.length} applied rows all match their files`, drift.length === 0, drift.join(","));
const pending = [...FILES.keys()].filter((v) => !applied.some((r) => r.version === v)).sort();
check(
  "exactly 9 files 0225…0233 on disk beyond the ledger",
  pending.length === 9 && pending[0].startsWith("0225_") && pending[8].startsWith("0233_"),
  pending.length + " pending: " + pending.map((p) => p.slice(0, 4)).join(","),
);
check("228 files on disk in total", FILES.size === 228, String(FILES.size));

console.log(`== 3b PRESTATE PINS — every function this wave's nine migrations pin, sha256(prosrc) on hosted beside\n   the pin PARSED FROM THE FILE TEXT. A DRIFT is hosted drift: STOP. One transaction per migration, so a\n   refusal leaves NO partial state — but it leaves the chain stopped at that file. ${PINS.length} pin(s) ==`);
if (PARSE_GAPS.length) {
  for (const g of PARSE_GAPS) check("parse gap", false, g);
}
let matched = 0, drifted = 0, absent = 0;
for (const p of PINS) {
  let row = null;
  try {
    row = await one(
      `select p.oid::regprocedure::text as sig, encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') as sha
         from pg_proc p where p.oid = to_regprocedure($1)`, [p.sig]);
  } catch (e) { row = { sig: p.sig, sha: null, err: e.code || e.message }; }
  const verdict = !row || row.sha === null ? "ABSENT" : row.sha === p.sha ? "MATCH" : "DRIFT";
  if (verdict === "MATCH") matched++; else if (verdict === "DRIFT") drifted++; else absent++;
  console.log(`  ${verdict.padEnd(6)} ${p.version} ${p.sig}`);
  if (verdict !== "MATCH") console.log(`         expected ${p.sha}\n         hosted   ${row && row.sha ? row.sha : "(no such function)"}`);
}
check(`all ${PINS.length} prestate pins MATCH`, drifted === 0 && absent === 0, `${matched} match · ${drifted} DRIFT · ${absent} ABSENT`);

console.log(`== 3b(ii) 0226's thirteen CoR anchors — each core must carry the 0129 call site EXACTLY once, or 0226\n   refuses by name ("the core has DIVERGED from 0129's shape; STOP and report rather than patching") ==`);
let anchorBad = 0;
for (const r of BANK.rows) {
  const row = await one(`select p.prosrc from pg_proc p where p.oid = to_regprocedure($1)`, [r.sig]).catch(() => null);
  const n = row && row.prosrc ? row.prosrc.split(r.anchor).length - 1 : -1;
  if (n !== 1) anchorBad++;
  console.log(`  ${(n === 1 ? "ok  " : "STOP").padEnd(6)} ${r.sig} — anchor count ${n < 0 ? "(function absent)" : n}`);
}
check("all 13 bank cores carry the anchor exactly once", anchorBad === 0, `${anchorBad} bad`);

console.log("== 3c FILE-DECLARED PRESTATE FACTS that are about hosted DATA or hosted CATALOG SHAPE, not about a pin ==");
const FACTS = [
  ["0225 the subledger hook's callers are exactly the SIX 0216 measured",
   `select coalesce(array_agg(p.proname order by p.proname), '{}')::text as v from pg_proc p join pg_namespace n on n.oid=p.pronamespace
     where n.nspname='clara' and position('clara._subledger_on_approve(' in p.prosrc) > 0 and p.proname <> '_subledger_on_approve'`,
   "{_approve_entry_core,_approve_opening_entry,approve_wrong_client_correction,finalize_close,reopen_fiscal_year,reverse_entry}"],
  ["0225 the clara.open_items writer set is exactly {_subledger_on_approve}",
   `select coalesce(array_agg(p.proname order by p.proname), '{}')::text as v from pg_proc p join pg_namespace n on n.oid=p.pronamespace
     where n.nspname='clara' and position('insert into clara.open_items(' in p.prosrc) > 0`,
   "{_subledger_on_approve}"],
  ["0225 t_je_subledger_belt is present and DEFERRABLE INITIALLY DEFERRED",
   `select count(*)::text as v from pg_trigger where tgrelid='clara.journal_entries'::regclass and tgname='t_je_subledger_belt' and tgdeferrable and tginitdeferred`, "1"],
  ["0225 clara.trade_invoices does not exist yet",
   `select coalesce(to_regclass('clara.trade_invoices')::text,'(absent)') as v`, "(absent)"],
  ["0227 _fa_run_period_core has exactly 3 callers",
   `select count(*)::text as v from pg_proc p join pg_namespace n on n.oid=p.pronamespace
     where n.nspname='clara' and p.proname <> '_fa_run_period_core' and p.prosrc like '%clara._fa_run_period_core(%'`, "3"],
  ["0227 the close_prep wake source is still disabled",
   `select coalesce((select enabled from clara.wake_engine_sources where source_key='close_prep')::text,'(no row)') as v`, "false"],
  ["0227 both 0042 splices are live (the re-run gate is inside both spliced bodies)",
   `select (position('clara._wdb_rerun_breach(' in pg_get_functiondef('clara._fa_oldest_unmet_period(uuid)'::regprocedure)) > 0
        and position('clara._wdb_rerun_breach(' in pg_get_functiondef('clara._fa_run_period_core(uuid,date,date,text,uuid,uuid,text)'::regprocedure)) > 0)::text as v`, "true"],
  ["0228 the capability registry holds 240 rows",
   `select count(*)::text as v from clara.document_capabilities`, "240"],
  ["0228 the registry publishes exactly ONE registry_version",
   `select count(distinct registry_version)::text as v from clara.document_capabilities`, "1"],
  ["0229 uq_accounting_work_id_firm_client exists (the member child's tenant-carrying citation)",
   `select count(*)::text as v from pg_constraint where conrelid='clara.accounting_work'::regclass and conname='uq_accounting_work_id_firm_client'`, "1"],
  ["0230 ZERO non-runtime roles hold EXECUTE on clara.get_knowledge_pack (#783 must not have been re-litigated)",
   `select count(*)::text as v from (select unnest(array['clara_authenticated','clara_agent_ro','clara_wake_interactive','clara_wake_proactive','clara_wake_bank','clara_wake_filing']) as r) g
     where has_function_privilege(g.r, 'clara.get_knowledge_pack(uuid,text,uuid)', 'EXECUTE')`, "0"],
  ["0231 neither name it installs is taken",
   `select count(*)::text as v from pg_proc p join pg_namespace ns on ns.oid=p.pronamespace
     where ns.nspname='clara' and p.proname in ('get_firm_portfolio_pack','get_compliance_watch_disposition')`, "0"],
  ["0232 clara.journal_entries.close_receipt_id exists (0056 applied — the detector's probe)",
   `select count(*)::text as v from information_schema.columns where table_schema='clara' and table_name='journal_entries' and column_name='close_receipt_id'`, "1"],
  ["0232 clara.book_today() is not taken and clara._book_today() is CLOSED to clara_authenticated",
   `select (to_regprocedure('clara.book_today()') is null
        and not has_function_privilege('clara_authenticated','clara._book_today()','EXECUTE'))::text as v`, "true"],
  ["0233 firm_document_limits still carries 0007's clara_authenticated SELECT",
   `select count(*)::text as v from information_schema.role_table_grants
     where table_schema='clara' and table_name='firm_document_limits' and grantee='clara_authenticated' and privilege_type='SELECT'`, "1"],
  ["0233 the three new doors do not exist yet",
   `select (to_regprocedure('clara.get_firm_legal_standing()') is null
        and to_regprocedure('clara.get_firm_commercial_state()') is null
        and to_regprocedure('clara.get_firm_ai_usage(date)') is null)::text as v`, "true"],
];
for (const [label, sql, expect] of FACTS) {
  let got;
  try { got = String((await one(sql)).v); } catch (e) { got = "ERR " + (e.code || e.message); }
  check(label, got === expect, got === expect ? "" : `got ${got}, expected ${expect}`);
}

console.log("== 3d pre-images: every body this wave recuts (overloads listed; sha256(prosrc)) ==");
const bodies = await q(
  `select p.proname, p.oid::regprocedure::text as sig, encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') as sha, pg_get_functiondef(p.oid) as def
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'clara' and p.proname = any($1::text[]) order by 1, 2`, [[...new Set(RECUT_NAMES)]]);
for (const b of bodies) console.log(`  ${b.sig}  ${b.sha}`);
const present = new Set(bodies.map((b) => b.proname));
const missing = [...new Set(RECUT_NAMES)].filter((n) => !present.has(n));
console.log("  absent on hosted: " + (missing.join(", ") || "(none)"));
if (preDir) {
  mkdirSync(preDir, { recursive: true });
  const index = [];
  for (const b of bodies) {
    const file = `${b.proname}__${createHash("sha256").update(b.sig).digest("hex").slice(0, 8)}.sql`;
    writeFileSync(join(preDir, file),
      `-- pre-image captured ${b.def ? ident.db_clock.toISOString?.() ?? ident.db_clock : ""} (DB clock) from ${ident.db}@${ident.addr}:${ident.port}\n-- ${b.sig}\n-- sha256(prosrc) = ${b.sha}\n${b.def}\n`);
    index.push(`${b.sha}  ${file}  ${b.sig}`);
  }
  writeFileSync(join(preDir, "INDEX.txt"), index.join("\n") + "\n");
  console.log(`  wrote ${bodies.length} pre-image(s) + INDEX.txt to ${preDir}`);
}

console.log("== 3e 0226's one destructive signature change: _agent_verify_inputs_digest overloads on hosted ==");
console.log("  " + fmt(await q(
  `select p.oid::regprocedure::text as sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='clara' and p.proname='_agent_verify_inputs_digest' order by 1`)));
note("0226 DROPs the (uuid,text,text) form and creates (uuid,text,uuid); exactly one row is expected here, at the text form");

await postReads();
console.log("");
await census();
console.log(`== verdict: ${stops === 0 ? "CLEAN — proceed to the backup" : stops + " STOP item(s) — do NOT migrate"} ==`);
await c.query("commit");
await c.end();
process.exit(stops === 0 ? 0 : 2);
