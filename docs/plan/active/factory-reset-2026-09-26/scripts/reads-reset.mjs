// Factory-reset preflight: counts only, read-only, never a DSN or a personal value.
import pg from "pg";
const c = new pg.Client({ connectionString: process.env.DATABASE_URL});
await c.connect();
await c.query("begin transaction read only");
const one = async (label, sql) => { try { const r = await c.query(sql); console.log(label.padEnd(44), Object.values(r.rows[0]).join("  ")); } catch (e) { console.log(label.padEnd(44), "ERR", e.code, e.message.slice(0, 80)); await c.query("rollback to savepoint s").catch(() => {}); } };
await c.query("savepoint s");
await one("server", "select current_database() db, inet_server_port() port, current_user usr, version() v");
await one("ledger", "select count(*)::int n, max(version) head from clara.schema_migrations");
await one("auth.users", "select count(*)::int n from auth.users");
await one("auth.users delete privilege (postgres)", "select has_table_privilege('postgres','auth.users','DELETE') d, has_table_privilege('postgres','auth.identities','DELETE') i, has_table_privilege('postgres','auth.sessions','DELETE') s");
await one("clara.firms / operator", "select count(*)::int n, count(*) filter (where is_operator)::int operators from clara.firms");
await one("clara.firm_members", "select count(*)::int n from clara.firm_members");
await one("clara.clients", "select count(*)::int n from clara.clients");
await one("clara.documents", "select count(*)::int n from clara.documents");
await one("clara.journal_entries", "select count(*)::int n from clara.journal_entries");
await one("clara.accounting_work", "select count(*)::int n from clara.accounting_work");
await one("clara.firm_admissions (unconsumed)", "select count(*)::int n, count(*) filter (where consumed_at is null)::int open from clara.firm_admissions");
await one("clara.legal_documents (seeded)", "select count(*)::int n, string_agg(distinct kind || ' v' || version::text, ', ' order by kind || ' v' || version::text) v from clara.legal_documents");
await one("storage.buckets", "select string_agg(id || ':' || (select count(*) from storage.objects o where o.bucket_id = b.id)::text, ', ') b from storage.buckets b");
await one("storage.objects total", "select count(*)::int n from storage.objects");
await one("workflow.workflow_runs", "select count(*)::int n, count(*) filter (where status not in ('completed','failed','cancelled'))::int live from workflow.workflow_runs");
await one("graphile_worker jobs", "select count(*)::int n from graphile_worker.jobs");
await one("schemas", "select string_agg(nspname, ', ' order by nspname) s from pg_namespace where nspname in ('clara','graphile_worker','workflow','workflow_drizzle','spike','auth','storage')");
await one("clara% roles", "select count(*)::int n, string_agg(rolname, ' ' order by rolname) r from pg_roles where rolname like 'clara%'");
await one("cross-schema dependents of clara (pg_depend)", `select count(*)::int n, string_agg(distinct dep, ' | ') d from (
  select distinct case when c.relkind in ('v','m') then 'view ' || n.nspname || '.' || c.relname else 'rel ' || n.nspname || '.' || c.relname end dep
  from pg_depend d join pg_class c on c.oid = d.objid join pg_namespace n on n.oid = c.relnamespace
  join pg_class rc on rc.oid = d.refobjid join pg_namespace rn on rn.oid = rc.relnamespace
  where rn.nspname = 'clara' and n.nspname <> 'clara' and d.deptype = 'n'
  union all
  select distinct 'constraint ' || n.nspname || '.' || c.relname || '.' || con.conname
  from pg_constraint con join pg_class c on c.oid = con.conrelid join pg_namespace n on n.oid = c.relnamespace
  join pg_class rc on rc.oid = con.confrelid join pg_namespace rn on rn.oid = rc.relnamespace
  where rn.nspname = 'clara' and n.nspname <> 'clara'
  union all
  select distinct 'policy ' || p.schemaname || '.' || p.tablename || '.' || p.policyname
  from pg_policies p where p.schemaname <> 'clara' and (p.qual like '%clara.%' or p.with_check like '%clara.%')
) x`);
await one("storage.objects policies", "select count(*)::int n, string_agg(policyname, ', ') p from pg_policies where schemaname = 'storage' and tablename = 'objects'");
await c.query("rollback");
await c.end();
