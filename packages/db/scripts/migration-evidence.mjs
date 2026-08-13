// Catalog EVIDENCE readers for the migration runner's post-body verification.
//
// The runner compares what the catalog actually holds before and after a migration
// body, so every reader here answers with a fully-materialised identity string rather
// than a boolean: a boolean records a judgement, a serialised identity records what a
// read SAW, and only the latter can be diffed against a later read.
//
// Every reference is pg_catalog-qualified and every comparison uses
// OPERATOR(pg_catalog....) — a migration body that puts a spoofed schema on the
// search_path must not be able to answer these questions on the catalog's behalf.
//
// `rearm` is the caller's statement_timeout re-arm, invoked before each statement so a
// file-owned timeout still bounds the verification work (see migration-atomicity.mjs).

export async function readRelationHardening(client, relation, rearm = async () => {}) {
  await rearm(); return (
    await client.query(
      `with r as (select pg_catalog.to_regclass($1)::pg_catalog.oid as relid)
       select (case when relid is null then null else pg_catalog.jsonb_build_object(
         'class', (select pg_catalog.jsonb_build_object(
           'oid', c.oid::pg_catalog.text, 'kind', c.relkind, 'persistence', c.relpersistence,
           'owner', c.relowner::pg_catalog.text, 'acl', coalesce(c.relacl::pg_catalog.text, ''::pg_catalog.text),
           'rowsecurity', c.relrowsecurity, 'forcerowsecurity', c.relforcerowsecurity,
           'replident', c.relreplident, 'hasrules', c.relhasrules,
           'options', coalesce(c.reloptions::pg_catalog.text, ''::pg_catalog.text)
         ) from pg_catalog.pg_class c where c.oid OPERATOR(pg_catalog.=) relid),
         'columns', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
           'num', a.attnum, 'name', a.attname, 'type', pg_catalog.format_type(a.atttypid, a.atttypmod),
           'notnull', a.attnotnull, 'identity', a.attidentity, 'generated', a.attgenerated,
           'acl', coalesce(a.attacl::pg_catalog.text,''::pg_catalog.text),
           'collation', a.attcollation::pg_catalog.text,
           'default', pg_catalog.pg_get_expr(d.adbin, d.adrelid)
         ) order by a.attnum)
           from pg_catalog.pg_attribute a left join pg_catalog.pg_attrdef d
             on d.adrelid OPERATOR(pg_catalog.=) a.attrelid and d.adnum OPERATOR(pg_catalog.=) a.attnum
          where a.attrelid OPERATOR(pg_catalog.=) relid and a.attnum OPERATOR(pg_catalog.>) 0
            and not a.attisdropped), '[]'::pg_catalog.jsonb),
         'constraints', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
           'oid', x.oid::pg_catalog.text, 'name', x.conname, 'type', x.contype,
           'deferrable', x.condeferrable, 'deferred', x.condeferred,
           'validated', x.convalidated, 'definition', pg_catalog.pg_get_constraintdef(x.oid, true)
         ) order by x.conname, x.oid)
           from pg_catalog.pg_constraint x where x.conrelid OPERATOR(pg_catalog.=) relid), '[]'::pg_catalog.jsonb),
         'indexes', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
           'oid', ix.indexrelid::pg_catalog.text, 'valid', ix.indisvalid, 'ready', ix.indisready,
           'unique', ix.indisunique, 'primary', ix.indisprimary,
           'definition', pg_catalog.pg_get_indexdef(ix.indexrelid)
         ) order by ix.indexrelid)
           from pg_catalog.pg_index ix where ix.indrelid OPERATOR(pg_catalog.=) relid), '[]'::pg_catalog.jsonb),
         'triggers', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
           'oid', t.oid::pg_catalog.text, 'name', t.tgname, 'enabled', t.tgenabled,
           'definition', pg_catalog.pg_get_triggerdef(t.oid, true), 'function_oid', t.tgfoid::pg_catalog.text,
           'function_identity', (select pg_catalog.jsonb_build_object(
             'owner',p.proowner::pg_catalog.text,'acl',coalesce(p.proacl::pg_catalog.text,''::pg_catalog.text),
             'definition',pg_catalog.pg_get_functiondef(p.oid))
             from pg_catalog.pg_proc p where p.oid OPERATOR(pg_catalog.=) t.tgfoid)
         ) order by t.tgname, t.oid)
           from pg_catalog.pg_trigger t where t.tgrelid OPERATOR(pg_catalog.=) relid
             and not t.tgisinternal), '[]'::pg_catalog.jsonb),
         'rules', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
           'oid', r.oid::pg_catalog.text, 'name', r.rulename, 'event', r.ev_type,
           'enabled', r.ev_enabled, 'instead', r.is_instead,
           'definition', pg_catalog.pg_get_ruledef(r.oid, true)
         ) order by r.rulename, r.oid)
           from pg_catalog.pg_rewrite r where r.ev_class OPERATOR(pg_catalog.=) relid), '[]'::pg_catalog.jsonb),
         'policies', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
           'oid', p.oid::pg_catalog.text, 'name', p.polname, 'command', p.polcmd,
           'permissive', p.polpermissive, 'roles', p.polroles::pg_catalog.text,
           'using', pg_catalog.pg_get_expr(p.polqual, p.polrelid),
           'check', pg_catalog.pg_get_expr(p.polwithcheck, p.polrelid)
         ) order by p.polname, p.oid)
           from pg_catalog.pg_policy p where p.polrelid OPERATOR(pg_catalog.=) relid), '[]'::pg_catalog.jsonb)
       ) end)::pg_catalog.text as identity from r`,
      [relation],
    )
  ).rows[0].identity;
}

export async function readLedgerIdentity(client, rearm = async () => {}) {
  const hardening = JSON.parse(await readRelationHardening(client, "clara.schema_migrations", rearm)); await rearm();
  const identity = (
    await client.query(
      `select pg_catalog.jsonb_build_object(
         'allowed_grantee',(select r.oid::pg_catalog.text from pg_catalog.pg_roles r
           where r.rolname OPERATOR(pg_catalog.=) 'clara_fn_owner'),
         'expected_grantor',(select r.oid::pg_catalog.text from pg_catalog.pg_roles r
           where r.rolname OPERATOR(pg_catalog.=) current_user),
         'acl',coalesce((select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(a) order by
           a.grantor,a.grantee,a.privilege_type,a.is_grantable)
           from pg_catalog.pg_class c cross join lateral pg_catalog.aclexplode(
             coalesce(c.relacl,pg_catalog.acldefault('r',c.relowner))) a
          where c.oid OPERATOR(pg_catalog.=) 'clara.schema_migrations'::pg_catalog.regclass),
          '[]'::pg_catalog.jsonb))::pg_catalog.text as identity`,
    )
  ).rows[0].identity;
  hardening.class.acl = JSON.parse(identity);
  return hardening;
}

export function ledgerIdentityAllowed(version, before, after) {
  const priorAcl = before.class.acl;
  const currentAcl = after.class.acl;
  const priorShape = { ...before, class: { ...before.class, acl: null } };
  const currentShape = { ...after, class: { ...after.class, acl: null } };
  if (JSON.stringify(priorShape) !== JSON.stringify(currentShape)) return false;
  if (JSON.stringify(priorAcl.acl) === JSON.stringify(currentAcl.acl)) return true;
  if (version !== "0028_vendor_identity_binding" || !priorAcl.allowed_grantee ||
      priorAcl.allowed_grantee !== currentAcl.allowed_grantee ||
      priorAcl.expected_grantor !== currentAcl.expected_grantor || currentAcl.acl.length !== priorAcl.acl.length + 1) return false;
  const additions = currentAcl.acl.filter((entry) => !priorAcl.acl.some((prior) => JSON.stringify(prior) === JSON.stringify(entry)));
  return additions.length === 1 && additions[0].grantee === priorAcl.allowed_grantee &&
    additions[0].grantor === priorAcl.expected_grantor && additions[0].privilege_type === "SELECT" && !additions[0].is_grantable;
}

export async function readLedgerReceipts(client, rearm = async () => {}) {
  await rearm(); return (
    await client.query(
      `select pg_catalog.jsonb_agg(pg_catalog.to_jsonb(m) order by m.version)::pg_catalog.text as receipts
         from clara.schema_migrations m`,
    )
  ).rows[0].receipts;
}
