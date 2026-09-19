// Release ceremony for 0234 (#1008) — read-only reads. Child of scripts/ops/dsn-pipe.mjs (DATABASE_URL
// in env) or PG* for a rig. EVERY statement is a SELECT inside one `begin transaction read only`,
// each under its own SAVEPOINT (a soft failure never poisons the rest). Prints facts only, never the
// DSN, never an e-mail address.
//
//   node reads-0234.mjs [--prod]          pre-window reads: ledger, drift gate, the six pins, the
//                                         operator-firm precondition, the flip count, the census
//   node reads-0234.mjs --post [--prod]   after the migrate step: ledger 229, the mode, the flip count
import { makeClient } from "file:///C:/Users/zhant/Desktop/clara-rebuild/packages/db/lib/pg.mjs";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";

const args = process.argv.slice(2);
const PROD = args.includes("--prod");
const POST = args.includes("--post");
const MIGRATIONS_DIR = process.env.CLARA_MIGRATIONS_DIR || "C:/Users/zhant/Desktop/clara-rebuild/packages/db/migrations";
const checksum = (text) => createHash("sha256").update(text.replace(/\r\n/g, "\n"), "utf8").digest("hex");

// The six prestate pins, PARSED from 0234's own text (never transcribed): a signature literal
// followed by a 64-hex literal inside the prestate region.
const text0234 = readFileSync(`${MIGRATIONS_DIR}/0234_legal_enforcement_mode.sql`, "utf8");
const PIN_SIGS = [
  "clara._accounting_work_egress_live(uuid,uuid)",
  "clara.prepare_egress_dispatch(uuid,uuid,text,bigint,text,text)",
  "clara.restore_client_egress_purpose(uuid,text,text)",
  "clara.get_firm_legal_standing()",
  "clara.consume_egress_dispatch(uuid,uuid,uuid,text,bigint,text,text)",
  "clara.set_admission_capacity(integer,text,text)",
];
const hexes = new Set([...text0234.matchAll(/'([0-9a-f]{64})'/g)].map((m) => m[1]));

const c = makeClient();
await c.connect();
await c.query("begin transaction read only");
const q = async (sql, params = []) => {
  await c.query("savepoint rq");
  try { const r = await c.query(sql, params); await c.query("release savepoint rq"); return r.rows; }
  catch (e) { await c.query("rollback to savepoint rq"); throw e; }
};
let stops = 0;
const check = (label, ok, detail = "") => { console.log(`  ${ok ? "ok  " : "STOP"} ${label}${detail ? " — " + detail : ""}`); if (!ok) stops++; };
const fmt = (rows) => rows.map((r) => Object.values(r).map((v) => (v === null ? "null" : String(v))).join(" | ")).join("\n  ") || "(none)";

const ident = (await q("select current_database() as db, inet_server_port() as port, inet_server_addr()::text as addr, left(version(),24) as ver, clock_timestamp() as db_clock"))[0];
console.log("== server ==", ident);
if (PROD) check("--prod: hosted estate (db=postgres, port 5432, not loopback)", ident.db === "postgres" && ident.port === 5432 && !String(ident.addr).startsWith("127."));

const led = (await q("select count(*)::int as applied, max(version) as frontier from clara.schema_migrations"))[0];
console.log("== ledger ==", led);
if (!POST) {
  check("frontier is 0233 with 228 applied", led.applied === 228 && led.frontier === "0233_firm_commercial_settings");
  const rows = await q("select version, checksum from clara.schema_migrations order by version");
  const files = new Map(readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).map((f) => [f.replace(/\.sql$/, ""), f]));
  let drift = 0;
  for (const r of rows) { const f = files.get(r.version); if (!f || checksum(readFileSync(`${MIGRATIONS_DIR}/${f}`, "utf8")) !== r.checksum) { drift++; console.log("   DRIFT " + r.version); } }
  check(`drift gate: all ${rows.length} applied rows match their files`, drift === 0);
  const pending = [...files.keys()].filter((v) => !rows.some((r) => r.version === v)).sort();
  check("exactly one pending file, 0234", pending.length === 1 && pending[0] === "0234_legal_enforcement_mode", pending.join(","));

  console.log("== the six prestate pins (hosted sha must be a literal 0234 carries) ==");
  const pins = await q(
    `select p.oid::regprocedure::text as sig, encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') as sha
       from pg_proc p where p.oid = any ($1::regprocedure[]) order by 1`, [PIN_SIGS]);
  check("all six signatures resolve", pins.length === 6, String(pins.length));
  for (const p of pins) check(p.sig, hexes.has(p.sha), p.sha.slice(0, 16) + "…");
  check("0234's names are all absent",
    (await q("select to_regclass('clara.legal_enforcement')::text as r, to_regprocedure('clara._legal_enforcement_mode()')::text as f"))[0].r === null);

  console.log("== rollback precondition: an operator firm with an active owner (count only) ==");
  const op = (await q(`select count(distinct f.id)::int as operator_firms, count(*)::int as active_owners
                         from clara.firms f join clara.firm_memberships m on m.firm_id=f.id and m.status='active' and m.role='owner'
                        where f.is_operator`))[0];
  console.log("  ", op);
  check("at least one operator firm with an active owner exists (the door-based rollback is reachable)", op.operator_firms >= 1 && op.active_owners >= 1);
} else {
  check("frontier is 0234 with 229 applied", led.applied === 229 && led.frontier === "0234_legal_enforcement_mode");
  console.log("== the mode ==\n  " + fmt(await q("select mode, updated_at from clara.legal_enforcement")));
}

console.log("== the flip count (0195's rule vs 0234's beta rule, re-derived from base relations) ==");
console.log("  " + fmt(await q(`
with published as (
  select max(version) filter (where kind='terms') as terms_version, max(version) filter (where kind='dpa') as dpa_version
    from clara.legal_documents where status='published'),
firm_basis as (
  select f.id,
    (select count(*) from clara.clients c where c.firm_id=f.id and c.status='active')::int as active_clients,
    ((select terms_version from published) is not null and (select dpa_version from published) is not null and exists (
       select 1 from clara.firm_memberships m
         join clara.legal_acceptances ta on ta.user_id=m.user_id and ta.kind='terms' and ta.version=(select terms_version from published)
         join clara.legal_acceptances da on da.user_id=m.user_id and da.kind='dpa' and da.version=(select dpa_version from published)
        where m.firm_id=f.id and m.status='active' and m.role='owner')) as enforce_live,
    exists (select 1 from clara.firm_memberships m where m.firm_id=f.id and m.status='active' and m.role='owner'
              and exists (select 1 from clara.legal_acceptances a where a.user_id=m.user_id)) as prompt_live
    from clara.firms f)
select count(*) filter (where not enforce_live and prompt_live)::int as firms_that_flip_to_live,
       count(*) filter (where not enforce_live and not prompt_live)::int as firms_still_not_live,
       count(*) filter (where enforce_live)::int as firms_already_live,
       coalesce(sum(active_clients) filter (where not enforce_live and prompt_live),0)::int as active_clients_that_flip,
       (select terms_version from published) as published_terms, (select dpa_version from published) as published_dpa
  from firm_basis`)));

console.log("== quiescence census ==");
console.log("  non-terminal workflow_runs: " + fmt(await q("select name, status, count(*)::int from workflow.workflow_runs where status not in ('completed','failed','cancelled') group by 1,2 order by 1,2").catch((e) => [{ err: e.code || e.message }])));
console.log("  agent_tasks non-terminal: " + fmt(await q("select kind, status, count(*)::int from clara.agent_tasks where status not in ('completed','failed','cancelled','refused','expired','done') group by 1,2 order by 1,2")));
console.log("  accounting_work non-terminal: " + fmt(await q("select status, count(*)::int from clara.accounting_work where status not in ('completed','refused','failed','cancelled','expired') group by 1 order by 1")));
console.log("  runtime sessions: " + fmt(await q("select usename, count(*)::int from pg_stat_activity where datname=current_database() and usename like 'clara_runtime%' group by 1")));
console.log("  F10 advisory holder: " + fmt(await q("select a.pid, a.usename from pg_locks l join pg_stat_activity a on a.pid=l.pid where l.locktype='advisory' and l.classid=439041101 and l.objid=794746")));

await c.query("rollback");
await c.end();
console.log(stops === 0 ? "== verdict: CLEAN ==" : `== verdict: ${stops} STOP(s) ==`);
process.exit(stops === 0 ? 0 : 1);
