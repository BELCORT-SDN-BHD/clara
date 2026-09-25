// Drop the clara schema object by object (one statement per object, autocommit), because a single
// DROP SCHEMA ... CASCADE exceeds the managed server's lock table. Prints counts only.
import pg from "pg";
const c = new pg.Client({ connectionString: process.env.DATABASE_URL }); await c.connect();
const count = async (sql) => (await c.query(sql)).rows[0].n;
const say = (...a) => console.log(...a);
say("before: tables", await count("select count(*)::int n from pg_tables where schemaname='clara'"), "views", await count("select count(*)::int n from pg_views where schemaname='clara'"), "functions", await count("select count(*)::int n from pg_proc p join pg_namespace s on s.oid=p.pronamespace where s.nspname='clara'"));
let dropped = 0, failed = 0;
for (const kind of ["m", "v"]) { // matviews, views first
  const r = await c.query("select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='clara' and c.relkind=$1", [kind]);
  for (const x of r.rows) { try { await c.query(`drop ${kind === "m" ? "materialized view" : "view"} if exists clara."${x.relname}" cascade`); dropped++; } catch (e) { failed++; say("view drop failed", x.relname, e.code); } }
}
for (let round = 0; round < 50; round++) {
  const r = await c.query("select tablename from pg_tables where schemaname='clara' order by tablename");
  if (!r.rows.length) break;
  for (const x of r.rows) { try { await c.query(`drop table if exists clara."${x.tablename}" cascade`); dropped++; } catch (e) { failed++; if (failed < 5) say("table drop failed", x.tablename, e.code, e.message.slice(0, 80)); } }
}
say("after tables: tables left", await count("select count(*)::int n from pg_tables where schemaname='clara'"), "dropped so far", dropped, "failed", failed);
for (let round = 0; round < 5; round++) {
  const r = await c.query("select p.oid::regprocedure::text sig, p.prokind k from pg_proc p join pg_namespace s on s.oid=p.pronamespace where s.nspname='clara'");
  if (!r.rows.length) break;
  for (const x of r.rows) { try { await c.query(`drop ${x.k === "p" ? "procedure" : x.k === "a" ? "aggregate" : "function"} if exists ${x.sig} cascade`); dropped++; } catch (e) { failed++; if (failed < 8) say("function drop failed", x.sig.slice(0, 60), e.code); } }
}
say("after functions: functions left", await count("select count(*)::int n from pg_proc p join pg_namespace s on s.oid=p.pronamespace where s.nspname='clara'"));
say("remaining objects in clara (types, sequences, domains):", await count("select count(*)::int n from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='clara'") , "+", await count("select count(*)::int n from pg_type t join pg_namespace n on n.oid=t.typnamespace where n.nspname='clara' and t.typtype in ('e','d','c') and not exists (select 1 from pg_class c where c.reltype=t.oid)"));
try { await c.query("drop schema clara cascade"); say("schema clara dropped"); } catch (e) { say("final drop schema failed", e.code, e.message.slice(0, 120)); }
say("clara present:", await count("select count(*)::int n from pg_namespace where nspname='clara'"), "| dropped", dropped, "failed", failed);
await c.end();
