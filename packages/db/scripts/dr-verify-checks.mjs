// dr-verify-checks — the §4 verification-battery probes. Each takes a `ctx` built by
// dr-verify.mjs: { src, tgt, STRICT, AUTHORITATIVE_SCHEMAS, MIGRATIONS_DIR, record,
// bothRows, diffCheck }. Split out of dr-verify.mjs for the file-size cap.

import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  ident, multisetDiff, tableExists, tablesOf, schemaPresent, SCHEMA_ALLOWLIST, PLATFORM_SCHEMAS,
} from "./dr-verify-util.mjs";

// On-disk migration manifest as Map<version, sha256> — computed EXACTLY the way
// migrate.mjs records checksums (CRLF→LF normalization, then sha256 hex), so the
// completeness floor can require exact (version, checksum) equality and a forged
// name-only ledger FAILs.
function onDiskManifest(dir) {
  const m = new Map();
  for (const f of readdirSync(dir).filter((x) => /^\d{4}_.*\.sql$/.test(x))) {
    const checksum = createHash("sha256").update(readFileSync(join(dir, f), "utf8").replace(/\r\n/g, "\n"), "utf8").digest("hex");
    m.set(f.replace(/\.sql$/, ""), checksum);
  }
  return m;
}

// ---------------------------------------------------------------------------
// §4.1 Schema presence + migration-journal parity + COMPLETENESS FLOOR (HIGH-3b).
// ---------------------------------------------------------------------------
export async function checkSchemasAndJournals(ctx) {
  const { src, tgt, AUTHORITATIVE_SCHEMAS, MIGRATIONS_DIR, record, bothRows, diffCheck } = ctx;
  const { s, t } = await bothRows(
    "select nspname from pg_namespace where nspname not like 'pg\\_%' and nspname<>'information_schema' order by 1",
  );
  const sset = new Set(s.map((r) => r.nspname));
  const tset = new Set(t.map((r) => r.nspname));

  for (const sc of AUTHORITATIVE_SCHEMAS) {
    const onS = sset.has(sc);
    const onT = tset.has(sc);
    record("4.1", `schema-present:${sc}`, onS && onT ? "PASS" : "FAIL", onS && onT ? "" : `source=${onS} target=${onT}`);
  }
  // auth/storage: present-on-source ⇒ required-on-target; absent-on-both ⇒ SKIP (NATIVE SPEC).
  for (const sc of ["auth", "storage"]) {
    const onS = sset.has(sc);
    const onT = tset.has(sc);
    if (!onS && !onT) record("4.1", `platform-schema:${sc}`, "SKIP", "absent on both");
    else if (onS && !onT) record("4.1", `platform-schema:${sc}`, "FAIL", "present on source but MISSING on target");
    else record("4.1", `platform-schema:${sc}`, "PASS", onT && !onS ? "present on target (target-provisioned)" : "present on both");
  }
  // Asymmetric non-authoritative schemas: {spike} + platform → INFO; any other → FAIL (NIT-1).
  const asym = [...new Set([...[...sset].filter((x) => !tset.has(x)), ...[...tset].filter((x) => !sset.has(x))])]
    .filter((x) => !AUTHORITATIVE_SCHEMAS.includes(x) && x !== "auth" && x !== "storage");
  for (const sc of asym) {
    const side = sset.has(sc) ? "source-only" : "target-only";
    if (SCHEMA_ALLOWLIST.has(sc)) record("4.1", `schema-asym:${sc}`, "INFO", `${side} (allowlisted)`);
    else if (PLATFORM_SCHEMAS.has(sc)) record("4.1", `schema-asym:${sc}`, "INFO", `${side} (platform-managed)`);
    else record("4.1", `schema-asym:${sc}`, "FAIL", `${side} — non-allowlisted user schema; is it a durable schema missing from AUTHORITATIVE_SCHEMAS?`);
  }

  // COMPLETENESS FLOOR (HIGH-3b, deepened per re-verify): clara.schema_migrations must be
  // NON-EMPTY and equal the repo's on-disk manifest by (version, CHECKSUM) — not name
  // alone — on BOTH sides. A forged/name-only ledger (right filenames, wrong or blank
  // sha256) FAILs. Checksums are computed exactly as migrate.mjs records them.
  const disk = onDiskManifest(MIGRATIONS_DIR);
  for (const [lbl, c] of [["source", src], ["target", tgt]]) {
    const rows = (await c.query("select version, checksum from clara.schema_migrations")).rows;
    if (rows.length === 0) {
      record("4.1", `completeness floor: ${lbl} clara.schema_migrations non-empty`, "FAIL", "0 rows — an empty/half-built database");
      continue;
    }
    const dbMap = new Map(rows.map((r) => [r.version, r.checksum]));
    const problems = [];
    for (const [v, cs] of disk) {
      if (!dbMap.has(v)) problems.push(`missing ${v}`);
      else if (dbMap.get(v) !== cs) problems.push(`checksum-drift ${v}`);
    }
    for (const v of dbMap.keys()) if (!disk.has(v)) problems.push(`extra ${v}`);
    if (problems.length === 0) {
      record("4.1", `completeness floor: ${lbl} == on-disk manifest (version+sha256)`, "PASS", `${rows.length} migrations, checksums match`);
    } else {
      record("4.1", `completeness floor: ${lbl} == on-disk manifest (version+sha256)`, "FAIL", `${problems.slice(0, 6).join("; ")} (verify from the MATCHING repo checkout)`);
    }
  }

  await diffCheck("4.1", "clara.schema_migrations(version,checksum)", "select version, checksum from clara.schema_migrations order by 1");
  await engineJournal(ctx, "workflow_drizzle.workflow_migrations parity", "workflow_drizzle", "workflow_migrations", "select hash from workflow_drizzle.workflow_migrations order by 1");
  await engineJournal(ctx, "graphile_worker.migrations parity", "graphile_worker", "migrations", "select id, breaking from graphile_worker.migrations order by 1");
}

async function engineJournal(ctx, name, schema, table, sql) {
  const { src, tgt, record, diffCheck } = ctx;
  const [se, te] = await Promise.all([tableExists(src, schema, table), tableExists(tgt, schema, table)]);
  if (!se && !te) {
    record("4.1", name, "SKIP", `${schema}.${table} absent on both`);
    return;
  }
  if (se !== te) {
    record("4.1", name, "FAIL", `present source=${se} target=${te}`);
    return;
  }
  // Present ⇒ must be NON-EMPTY (HIGH-3b: an authoritative engine journal that restored
  // empty is a half-built world, not a faithful restore).
  const [cs, ct] = await Promise.all([src.query(`select count(*)::int n from ${schema}.${table}`), tgt.query(`select count(*)::int n from ${schema}.${table}`)]);
  if (cs.rows[0].n === 0 || ct.rows[0].n === 0) {
    record("4.1", name, "FAIL", `present but EMPTY (source=${cs.rows[0].n} target=${ct.rows[0].n})`);
    return;
  }
  await diffCheck("4.1", name, sql);
}

// ---------------------------------------------------------------------------
// §4.2 row-count parity + §4.3 content-checksum parity (all four schemas).
// ---------------------------------------------------------------------------
export async function checkTables(ctx) {
  const { src, tgt, AUTHORITATIVE_SCHEMAS, record } = ctx;
  for (const sc of AUTHORITATIVE_SCHEMAS) {
    const [ps, pt] = await Promise.all([schemaPresent(src, sc), schemaPresent(tgt, sc)]);
    if (!ps || !pt) continue; // schema-presence FAIL already recorded in §4.1
    const [sT, tT] = await Promise.all([tablesOf(src, sc), tablesOf(tgt, sc)]);
    const setS = new Set(sT);
    const setT = new Set(tT);
    const union = [...new Set([...sT, ...tT])].sort();
    for (const tbl of union) {
      if (!setS.has(tbl) || !setT.has(tbl)) {
        record("4.2", `${sc}.${tbl} rowcount`, "FAIL", `table present source=${setS.has(tbl)} target=${setT.has(tbl)}`);
        continue;
      }
      const rel = `${ident(sc)}.${ident(tbl)}`;
      const cq = `select count(*)::bigint n from ${rel}`;
      const [cs, ct] = await Promise.all([src.query(cq), tgt.query(cq)]);
      const eq = cs.rows[0].n === ct.rows[0].n;
      record("4.2", `${sc}.${tbl} rowcount`, eq ? "PASS" : "FAIL", eq ? `${cs.rows[0].n}` : `source=${cs.rows[0].n} target=${ct.rows[0].n}`);

      const mq = `select md5(coalesce(string_agg(h,'' order by h),'')) m from (select md5(row(t.*)::text) h from ${rel} t) s`;
      const [ms, mt] = await Promise.all([src.query(mq), tgt.query(mq)]);
      const meq = ms.rows[0].m === mt.rows[0].m;
      record("4.3", `${sc}.${tbl} content-md5`, meq ? "PASS" : "FAIL", meq ? ms.rows[0].m : `source=${ms.rows[0].m} target=${mt.rows[0].m}`);
    }
  }
}

// ---------------------------------------------------------------------------
// §4.4 role attributes · §4.5 memberships
// ---------------------------------------------------------------------------
export async function checkRoles(ctx) {
  await ctx.diffCheck(
    "4.4",
    "clara_% role attributes (incl rolconfig)",
    "select rolname, rolsuper, rolinherit, rolcreatedb, rolcreaterole, rolcanlogin, rolbypassrls, rolreplication, rolconnlimit, coalesce(array_to_string(rolconfig, ','), '') as rolconfig from pg_roles where rolname like 'clara\\_%' order by 1",
  );
  await ctx.diffCheck(
    "4.5",
    "clara_% memberships (inherit/set/admin options)",
    "select member.rolname as member, parent.rolname as parent, am.inherit_option, am.set_option, am.admin_option from pg_auth_members am join pg_roles member on member.oid=am.member join pg_roles parent on parent.oid=am.roleid where member.rolname like 'clara\\_%' or parent.rolname like 'clara\\_%' order by 1,2",
  );
}

// ---------------------------------------------------------------------------
// §4.6 ownership + GRANT-matrix + RLS + policies + executable DDL (HIGH-4).
// Grant matrices are read from the CATALOG (aclexplode of relacl/proacl/nspacl/attacl),
// projecting grantee, privilege_type, is_grantable AND grantor — superuser-complete and
// captures PUBLIC (the information_schema role_*_grants views under-report).
// ---------------------------------------------------------------------------
export async function checkGrantsAndRls(ctx) {
  const { src, tgt, AUTHORITATIVE_SCHEMAS, record, diffCheck } = ctx;
  const relOwnSql =
    "select c.relkind::text kind, c.relname, pg_get_userbyid(c.relowner) owner from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='clara' and c.relkind in ('r','v','m','S','p') order by 2,1";
  await diffCheck("4.6", "clara relation ownership parity", relOwnSql);
  // Explicit --no-owner escalation guard (Lane A G2): a relation owned by clara_fn_owner
  // on the SOURCE must stay clara_fn_owner on the TARGET. (Not "every clara relation is
  // clara_fn_owner" — the deploy runner legitimately owns clara.schema_migrations +
  // clara.slice1_smoke[_id_seq], created before the migrations SET ROLE clara_fn_owner.)
  {
    const [so, to] = await Promise.all([src.query(relOwnSql), tgt.query(relOwnSql)]);
    const tMap = new Map(to.rows.map((r) => [`${r.kind}:${r.relname}`, r.owner]));
    const owned = so.rows.filter((r) => r.owner === "clara_fn_owner");
    const escalated = owned.filter((r) => tMap.get(`${r.kind}:${r.relname}`) !== "clara_fn_owner");
    record(
      "4.6",
      "no --no-owner escalation (clara_fn_owner relations preserved on target)",
      escalated.length === 0 ? "PASS" : "FAIL",
      escalated.length === 0 ? `${owned.length} clara_fn_owner relation(s) preserved` : `${escalated.length} escalated: ${escalated.slice(0, 5).map((r) => `${r.relname}->${tMap.get(`${r.kind}:${r.relname}`) || "MISSING"}`).join(", ")}`,
    );
  }

  await diffCheck(
    "4.6",
    "clara function ownership parity",
    "select p.proname, pg_get_function_identity_arguments(p.oid) args, pg_get_userbyid(p.proowner) owner from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='clara' order by 1,2",
  );
  const badFn = (
    await tgt.query(
      "select count(*)::int bad from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='clara' and pg_get_userbyid(p.proowner)<>'clara_fn_owner'",
    )
  ).rows[0].bad;
  record("4.6", "target clara functions all owned by clara_fn_owner", badFn === 0 ? "PASS" : "FAIL", badFn === 0 ? "" : `${badFn} function(s) NOT owned by clara_fn_owner — a SECURITY DEFINER escalation`);

  // Relation ACLs incl SEQUENCES ('S') + is_grantable + grantor (HIGH-4).
  await diffCheck(
    "4.6",
    "relation-grant matrix (4 schemas, incl sequences, grantor/grantable)",
    "select n.nspname, c.relname, c.relkind::text kind, coalesce(gr.rolname,'PUBLIC') grantee, a.privilege_type, a.is_grantable, coalesce(g.rolname,'') grantor from pg_class c join pg_namespace n on n.oid=c.relnamespace cross join lateral aclexplode(c.relacl) a left join pg_roles gr on gr.oid=a.grantee left join pg_roles g on g.oid=a.grantor where n.nspname = any($1) and c.relkind in ('r','v','m','p','S') order by 1,2,4,5",
    [AUTHORITATIVE_SCHEMAS],
  );
  // Column-level ACLs (HIGH-4): 0006 grants column UPDATE on wake_intents.status/consumed_by.
  await diffCheck(
    "4.6",
    "column-grant matrix (4 schemas, grantor/grantable)",
    "select n.nspname, c.relname, a.attname, coalesce(gr.rolname,'PUBLIC') grantee, x.privilege_type, x.is_grantable, coalesce(g.rolname,'') grantor from pg_attribute a join pg_class c on c.oid=a.attrelid join pg_namespace n on n.oid=c.relnamespace cross join lateral aclexplode(a.attacl) x left join pg_roles gr on gr.oid=x.grantee left join pg_roles g on g.oid=x.grantor where n.nspname = any($1) and a.attacl is not null order by 1,2,3,4,5",
    [AUTHORITATIVE_SCHEMAS],
  );
  await diffCheck(
    "4.6",
    "routine-grant matrix (clara, grantor/grantable)",
    "select p.proname, pg_get_function_identity_arguments(p.oid) args, coalesce(gr.rolname,'PUBLIC') grantee, a.privilege_type, a.is_grantable, coalesce(g.rolname,'') grantor from pg_proc p join pg_namespace n on n.oid=p.pronamespace cross join lateral aclexplode(p.proacl) a left join pg_roles gr on gr.oid=a.grantee left join pg_roles g on g.oid=a.grantor where n.nspname='clara' order by 1,2,3,4",
  );

  // Schema ACLs — NORMALIZED (MEDIUM-3): exclude owner-self entries (pg_dump collapses
  // `owner=UC/owner` to NULL), compare only NON-owner grants + owner identity + effective
  // owner privileges.
  await diffCheck(
    "4.6",
    "schema-ACL matrix (4 schemas, NON-owner grants, grantor/grantable)",
    "select n.nspname, coalesce(gr.rolname,'PUBLIC') grantee, a.privilege_type, a.is_grantable, coalesce(g.rolname,'') grantor from pg_namespace n cross join lateral aclexplode(n.nspacl) a left join pg_roles gr on gr.oid=a.grantee left join pg_roles g on g.oid=a.grantor where n.nspname = any($1) and a.grantee <> n.nspowner order by 1,2,3,4",
    [AUTHORITATIVE_SCHEMAS],
  );
  await diffCheck(
    "4.6",
    "schema owner identity + effective owner privileges (4 schemas)",
    "select nspname, pg_get_userbyid(nspowner) owner, has_schema_privilege(nspowner::regrole::text, nspname, 'USAGE') u, has_schema_privilege(nspowner::regrole::text, nspname, 'CREATE') c from pg_namespace where nspname = any($1) order by 1",
    [AUTHORITATIVE_SCHEMAS],
  );

  await diffCheck(
    "4.6",
    "default-privileges (ALTER DEFAULT PRIVILEGES) parity (grantor/grantable)",
    "select pg_get_userbyid(d.defaclrole) role, d.defaclnamespace::regnamespace::text ns, d.defaclobjtype::text objtype, coalesce(gr.rolname,'PUBLIC') grantee, a.privilege_type, a.is_grantable, coalesce(g.rolname,'') grantor from pg_default_acl d cross join lateral aclexplode(d.defaclacl) a left join pg_roles gr on gr.oid=a.grantee left join pg_roles g on g.oid=a.grantor order by 1,2,3,4,5",
  );
  await diffCheck(
    "4.6",
    "RLS flags (relrowsecurity/relforcerowsecurity, clara)",
    "select c.relname, c.relrowsecurity, c.relforcerowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='clara' and c.relkind='r' order by 1",
  );
  await diffCheck(
    "4.6",
    "RLS policies (clara pg_policies full diff)",
    "select schemaname, tablename, policyname, array_to_string(roles,',') roles, cmd, coalesce(qual,'') qual, coalesce(with_check,'') with_check from pg_policies where schemaname='clara' order by 2,3",
  );

  // Executable DDL parity (HIGH-4): a target can replace a SECURITY DEFINER writer body
  // while keeping its signature/owner/ACL — the old battery could not notice. Compare
  // canonical definitions + security metadata.
  await diffCheck(
    "4.6",
    "function definitions + security metadata (clara)",
    "select p.proname, pg_get_function_identity_arguments(p.oid) args, p.prosecdef, p.provolatile::text, p.proleakproof, coalesce(array_to_string(p.proconfig,','),'') proconfig, md5(pg_get_functiondef(p.oid)) def from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='clara' and p.prokind in ('f','p','w') order by 1,2",
  );
  await diffCheck(
    "4.6",
    "trigger definitions (clara)",
    "select c.relname tbl, tg.tgname, md5(pg_get_triggerdef(tg.oid)) def from pg_trigger tg join pg_class c on c.oid=tg.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='clara' and not tg.tgisinternal order by 1,2",
  );
  await diffCheck(
    "4.6",
    "constraint definitions (clara)",
    "select conrelid::regclass::text rel, conname, md5(pg_get_constraintdef(oid)) def from pg_constraint where connamespace='clara'::regnamespace order by 1,2",
  );
  await diffCheck(
    "4.6",
    "index definitions (clara)",
    "select c.relname idx, md5(pg_get_indexdef(i.indexrelid)) def from pg_index i join pg_class c on c.oid=i.indexrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='clara' order by 1",
  );
  await diffCheck(
    "4.6",
    "view/matview definitions (clara)",
    "select c.relname v, md5(pg_get_viewdef(c.oid)) def from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='clara' and c.relkind in ('v','m') order by 1",
  );

  // Type parity (HIGH-4 re-verify): enum label lists (ordered), domain base+constraints,
  // standalone composite attribute lists — a reordered enum or drifted domain would
  // otherwise be invisible. Definition md5'd (label/attr lists can be long); kind kept raw.
  // Standalone composites only (typrelid.relkind='c'); table rowtypes ride table-def parity.
  await diffCheck(
    "4.6",
    "type definitions (4 schemas: enum/domain/composite)",
    `select n.nspname, t.typname, t.typtype::text kind, md5(
        case t.typtype
          when 'e' then coalesce((select string_agg(e.enumlabel, ',' order by e.enumsortorder) from pg_enum e where e.enumtypid=t.oid),'')
          when 'd' then format_type(t.typbasetype, t.typtypmod) || ' | ' || coalesce((select string_agg(pg_get_constraintdef(dc.oid), '; ' order by dc.conname) from pg_constraint dc where dc.contypid=t.oid),'')
          when 'c' then coalesce((select string_agg(a.attname||' '||format_type(a.atttypid,a.atttypmod), ', ' order by a.attnum) from pg_attribute a where a.attrelid=t.typrelid and a.attnum>0 and not a.attisdropped),'')
          else ''
        end) def
      from pg_type t join pg_namespace n on n.oid=t.typnamespace
      where n.nspname = any($1) and t.typtype in ('e','d','c')
        and (t.typtype<>'c' or exists (select 1 from pg_class rc where rc.oid=t.typrelid and rc.relkind='c'))
      order by 1,2`,
    [AUTHORITATIVE_SCHEMAS],
  );
}

// ---------------------------------------------------------------------------
// §4.7 behavioural confinement smoke (TARGET) — with boundary-specific catalog asserts
// so a 42501 from a DIFFERENT cause (e.g. missing schema USAGE) is not a false PASS (MEDIUM-2).
// ---------------------------------------------------------------------------
export async function checkConfinementSmoke(ctx) {
  const { tgt, record } = ctx;
  // Boundary asserts are crash-safe: a missing role/function on a half-built target is
  // a recorded FAIL, not an uncaught throw that aborts the battery before the summary.
  try {
    const usage = (await tgt.query("select has_schema_privilege('clara_agent_ro','clara','USAGE') u")).rows[0].u;
    record("4.7", "clara_agent_ro HAS clara schema USAGE (target)", usage ? "PASS" : "FAIL", usage ? "" : "read lane is over-confined — a 42501 below would NOT prove the writer wall");
  } catch (e) {
    record("4.7", "clara_agent_ro HAS clara schema USAGE (target)", "FAIL", `could not evaluate: ${e.message}`);
  }
  try {
    const exec = (await tgt.query("select has_function_privilege('clara_agent_ro','clara.approve_entry(uuid,uuid,text,text)','EXECUTE') e")).rows[0].e;
    record("4.7", "clara_agent_ro LACKS approve_entry EXECUTE (target)", exec === false ? "PASS" : "FAIL", exec === false ? "" : "read lane holds EXECUTE on a writer — write wall BREACHED");
  } catch (e) {
    record("4.7", "clara_agent_ro LACKS approve_entry EXECUTE (target)", "FAIL", `could not evaluate (writer absent?): ${e.message}`);
  }

  const name = "clara_agent_ro cannot EXECUTE approve_entry (behavioural, target)";
  try {
    await tgt.query("set role clara_agent_ro");
    let code = "SUCCESS";
    let msg = "";
    try {
      await tgt.query("select clara.approve_entry($1::uuid,$2::uuid,$3::text,$4::text)", [
        "00000000-0000-0000-0000-000000000000",
        "00000000-0000-0000-0000-000000000000",
        "dr-verify-smoke",
        "dr-verify-smoke",
      ]);
    } catch (e) {
      code = e.code || "ERR";
      msg = (e.message || "").split("\n")[0];
    }
    // Accept 42501 only when the message names the FUNCTION approve_entry (never
    // localized), not the schema-USAGE 42501 ("permission denied for schema clara").
    // The 4.7a/4.7b catalog asserts above independently pin the boundary, so this stays
    // locale-robust (it keys on the function name, not the word "function").
    const ok = code === "42501" && /approve_entry/i.test(msg);
    if (ok) record("4.7", name, "PASS", `42501: ${msg}`);
    else record("4.7", name, "FAIL", `expected 42501 naming function approve_entry, got ${code}${msg ? " (" + msg + ")" : ""}`);
  } catch (e) {
    record("4.7", name, "FAIL", `could not set role clara_agent_ro on target: ${e.message}`);
  } finally {
    try {
      await tgt.query("reset role");
    } catch {
      /* session ends anyway */
    }
  }
}

// ---------------------------------------------------------------------------
// §4.9 parked-canary parity + engine-side resumability (MEDIUM-5).
// ---------------------------------------------------------------------------
export async function checkCanary(ctx) {
  const { tgt, STRICT, record, bothRows } = ctx;
  const req = STRICT; // in live-drill mode the canary is REQUIRED (SKIP -> FAIL)

  // 4.9a interruption daba7f2e — count + status parity; STRICT asserts it is still 'pending'.
  const iSql = "select status, count(*)::int n from clara.agent_interruptions where id::text like 'daba7f2e%' group by status order by 1";
  const iRows = await bothRows(iSql);
  const iSN = iRows.s.reduce((a, r) => a + r.n, 0);
  const iTN = iRows.t.reduce((a, r) => a + r.n, 0);
  if (iSN === 0 && iTN === 0) {
    record("4.9", "canary interruption daba7f2e", req ? "FAIL" : "SKIP", req ? "REQUIRED in STRICT but absent on both" : "absent on both");
  } else {
    const d = multisetDiff(iRows.s, iRows.t);
    record("4.9", "canary interruption daba7f2e (status parity)", d.equal ? "PASS" : "FAIL", d.equal ? `present both (${iSN}) status=${iRows.s.map((r) => r.status + ":" + r.n).join(",")}` : `source=${JSON.stringify(iRows.s)} target=${JSON.stringify(iRows.t)}`);
    if (STRICT) {
      const parked = iRows.t.length === 1 && iRows.t[0].status === "pending";
      record("4.9", "canary interruption is parked (status=pending, target)", parked ? "PASS" : "FAIL", parked ? "" : `target status=${iRows.t.map((r) => r.status).join(",") || "absent"} (expected pending)`);
    }
  }

  // 4.9b task 032767e6 — count + status parity + engine-side resumability.
  const tSql = "select status, workflow_run_id, count(*)::int n from clara.agent_tasks where id::text like '032767e6%' group by status, workflow_run_id order by 1";
  const tRows = await bothRows(tSql);
  const tSN = tRows.s.reduce((a, r) => a + r.n, 0);
  const tTN = tRows.t.reduce((a, r) => a + r.n, 0);
  if (tSN === 0 && tTN === 0) {
    record("4.9", "canary task 032767e6", req ? "FAIL" : "SKIP", req ? "REQUIRED in STRICT but absent on both" : "absent on both");
  } else {
    const d = multisetDiff(tRows.s, tRows.t);
    record("4.9", "canary task 032767e6 (status parity)", d.equal ? "PASS" : "FAIL", d.equal ? `present both (${tSN})` : `source=${JSON.stringify(tRows.s)} target=${JSON.stringify(tRows.t)}`);
    const runId = tRows.t.find((r) => r.workflow_run_id)?.workflow_run_id;
    if (runId) {
      const present = (await tgt.query("select 1 from workflow.workflow_runs where id=$1", [runId])).rowCount > 0;
      record("4.9", "canary task's workflow run present (target)", present ? "PASS" : "FAIL", present ? `run ${runId}` : `workflow.workflow_runs missing run ${runId} — not resumable`);
    } else if (STRICT) {
      record("4.9", "canary task has a workflow_run_id (target)", "FAIL", "no workflow_run_id — cannot map to a durable run");
    }
    if (STRICT) {
      const resumable = tRows.t.every((r) => ["queued", "running", "awaiting_input", "cancel_requested"].includes(r.status));
      record("4.9", "canary task is resumable (non-terminal status, target)", resumable ? "PASS" : "FAIL", resumable ? "" : `target status=${tRows.t.map((r) => r.status).join(",")} (expected a non-terminal/resumable state)`);
    }
  }

  // 4.9d graphile-orphan check — DOCUMENTED SKIP: the WDK/graphile job payload that links a
  // job to a workflow run is opaque application JSON, so a robust "job references a missing
  // run" query is not derivable from the schema alone.
  record("4.9", "graphile_worker orphan-job check", "SKIP", "job->run linkage is opaque application JSON; not robustly derivable from the schema (documented residual — DR-full-drill.md §5)");
}

// ---------------------------------------------------------------------------
// §4.8 AP-gate — value-exact. Net = credit - debit (HIGH-6), via clara.trial_balance.
// ---------------------------------------------------------------------------
export async function checkApGate(ctx) {
  const { src, tgt, STRICT, record } = ctx;
  const ilike = process.env.CLARA_DR_AP_CLIENT_NAME_ILIKE;
  const expectRaw = process.env.CLARA_DR_EXPECT_AP_CENTS;
  if (!ilike || !expectRaw) {
    record("4.8", "AP-gate trial-balance parity (net credit-debit)", STRICT ? "FAIL" : "SKIP", STRICT ? "REQUIRED in STRICT — set CLARA_DR_AP_CLIENT_NAME_ILIKE + CLARA_DR_EXPECT_AP_CENTS" : "set CLARA_DR_AP_CLIENT_NAME_ILIKE + CLARA_DR_EXPECT_AP_CENTS to enable");
    return;
  }
  const expect = BigInt(expectRaw);
  const acct = process.env.CLARA_DR_AP_ACCOUNT_CODE || "400-000";
  const cl = await src.query("select id, name from clara.clients where name ilike $1 order by 1", [ilike]);
  if (cl.rowCount !== 1) {
    record("4.8", "AP-gate trial-balance parity (net credit-debit)", "FAIL", `client name ilike '${ilike}' matched ${cl.rowCount} row(s) on source (need exactly 1)`);
    return;
  }
  const clientId = cl.rows[0].id;
  const clt = await tgt.query("select id from clara.clients where name ilike $1", [ilike]);
  const sameId = clt.rowCount === 1 && clt.rows[0].id === clientId;
  const tbSql = "select debit_cents, credit_cents from clara.trial_balance($1) where account_code=$2";
  const [sr, tr] = await Promise.all([src.query(tbSql, [clientId, acct]), tgt.query(tbSql, [clientId, acct])]);
  if (sr.rowCount !== 1 || tr.rowCount !== 1) {
    record("4.8", "AP-gate trial-balance parity (net credit-debit)", "FAIL", `account ${acct} not found for the client (source rows=${sr.rowCount}, target rows=${tr.rowCount})`);
    return;
  }
  const net = (row) => BigInt(row.credit_cents) - BigInt(row.debit_cents);
  const sv = net(sr.rows[0]);
  const tv = net(tr.rows[0]);
  const detail = `account ${acct} net(credit-debit): source=${sv} target=${tv} expect=${expect} (src d/c=${sr.rows[0].debit_cents}/${sr.rows[0].credit_cents}, tgt d/c=${tr.rows[0].debit_cents}/${tr.rows[0].credit_cents})`;
  const ok = sameId && sv === expect && tv === expect;
  record("4.8", "AP-gate trial-balance parity (net credit-debit)", ok ? "PASS" : "FAIL", ok ? detail : detail + (sameId ? "" : " [client id differs source/target]"));
}

// ---------------------------------------------------------------------------
// §4.10 document storage-path integrity (DB-side; NATIVE SPEC). For clara.documents rows
// with a storage_path, the path's <sha256> segment must equal the sha256 column.
// ---------------------------------------------------------------------------
export async function checkDocuments(ctx) {
  const { src, tgt, record } = ctx;
  if (!(await tableExists(src, "clara", "documents")) || !(await tableExists(tgt, "clara", "documents"))) {
    record("4.10", "documents storage-path sha256 integrity", "SKIP", "clara.documents absent");
    return;
  }
  const countSql = "select count(*)::int n from clara.documents where storage_path is not null";
  const badSql = "select count(*)::int bad from clara.documents where storage_path is not null and substring(storage_path from 'docs/([0-9a-f]{64})') is distinct from sha256";
  const [sN, tN, sBad, tBad] = await Promise.all([
    src.query(countSql), tgt.query(countSql), src.query(badSql), tgt.query(badSql),
  ]);
  if (sN.rows[0].n === 0 && tN.rows[0].n === 0) {
    record("4.10", "documents storage-path sha256 integrity", "SKIP", "no documents with a storage_path on either side");
    return;
  }
  const ok = sBad.rows[0].bad === 0 && tBad.rows[0].bad === 0;
  record("4.10", "documents storage-path sha256 integrity", ok ? "PASS" : "FAIL", ok ? `source ${sN.rows[0].n} docs, target ${tN.rows[0].n} docs — all path<sha256> == sha256 column` : `path/sha256 mismatches: source=${sBad.rows[0].bad} target=${tBad.rows[0].bad}`);
}
