import { after, before, test } from "node:test"; import assert from "node:assert/strict"; import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os"; import { join } from "node:path";
import pg from "pg"; import { migrate } from "../scripts/migrate.mjs";
import { connectionConfig, withDatabaseEnv } from "./migrate-harness.mjs";
import { TRANSACTION_TIMEOUT_MIN_SERVER_VERSION_NUM } from "../scripts/migration-atomicity.mjs";
let serverVersionNum;
const DBNAME = `clara_freeze_${Date.now().toString(36)}_${randomUUID().slice(0, 6)}`;
const WRAPPER_OWNER = `clara_wrapper_${randomUUID().replaceAll("-", "").slice(0, 12)}`;
const MIGRATIONS_DIR = mkdtempSync(join(tmpdir(), "clara-freeze-runner-"));
const silent = () => {}; let admin, db, pendingPath; function stage(file, sql) {
  if (pendingPath) unlinkSync(pendingPath);
  pendingPath = join(MIGRATIONS_DIR, file);
  writeFileSync(pendingPath, sql, "utf8");
}
async function apply(file, sql) {
  stage(file, sql);
  const result = await withDatabaseEnv(DBNAME, () => migrate({ dir: MIGRATIONS_DIR, log: silent }));
  pendingPath = undefined;
  return result;
}
async function ledgerHas(version) {
  return (
    await db.query("select exists(select 1 from clara.schema_migrations where version=$1) present", [version])
  ).rows[0].present;
}
async function reject(file, sql, expected) {
  stage(file, sql);
  await assert.rejects(withDatabaseEnv(DBNAME, () => migrate({ dir: MIGRATIONS_DIR, log: silent })), expected);
  assert.equal(await ledgerHas(file.replace(/\.sql$/, "")), false, `${file} must not be recorded`);
}
before(async () => {
  assert.match(DBNAME, /^[a-z0-9_]+$/);
  admin = new pg.Client(connectionConfig());
  await admin.connect();
  await admin.query(`create role ${WRAPPER_OWNER} noinherit`);
  await admin.query(`create database "${DBNAME}"`);
  db = new pg.Client(connectionConfig(DBNAME));
  await db.connect();
  serverVersionNum = Number((await db.query("show server_version_num")).rows[0].server_version_num);
});
after(async () => {
  const cleanup = [];
  if (db) await db.end().catch((error) => cleanup.push(error));
  if (admin) {
    for (const sql of [`drop database if exists "${DBNAME}" with (force)`, `drop role if exists ${WRAPPER_OWNER}`])
      await admin.query(sql).catch((error) => cleanup.push(error));
    await admin.end().catch((error) => cleanup.push(error));
  }
  rmSync(MIGRATIONS_DIR, { recursive: true, force: true });
  assert.deepEqual(cleanup, []);
});
// The cleanup-diagnostics cells (failure, deadline overrun, hard close, original-error
// preservation) need no database and live in migrate-runner-unit.test.mjs.
test("migration runner keeps transaction and deterministic freeze authority", async () => {
  await apply("0001_pre_delta.sql", `create table clara.pre_delta(marker text primary key); do $$begin create role clara_fn_owner noinherit; exception when duplicate_object then null; end$$;`);
  await reject(
    "0002_transaction_escape.sql",
    `create table clara.transaction_escape(marker text); COMMIT; BEGIN; ROLLBACK;`,
    /forbidden transaction control \(COMMIT, BEGIN, ROLLBACK\)/,
  );
  assert.equal((await db.query("select to_regclass('clara.transaction_escape') is null absent")).rows[0].absent, true);
  for (const [name, sql, control] of [
    ["commit_chain", "commit and chain;", "COMMIT AND CHAIN"],
    ["commit_no_chain", "commit and no chain;", "COMMIT AND NO CHAIN"],
    ["end_chain", "end and chain;", "END AND CHAIN"],
    ["rollback_chain", "rollback and chain;", "ROLLBACK AND CHAIN"],
    ["rollback_to", "rollback to savepoint s;", "ROLLBACK TO SAVEPOINT"],
    ["release_savepoint", "release savepoint s;", "RELEASE SAVEPOINT"],
    ["prepare_transaction", "prepare transaction 'clara_fixture';", "PREPARE TRANSACTION"],
    ["commit_prepared", "commit prepared 'clara_fixture';", "COMMIT PREPARED"],
    ["rollback_prepared", "rollback prepared 'clara_fixture';", "ROLLBACK PREPARED"],
    ["bare_end", "end;", "END"], ["abort", "abort;", "ABORT"],
    ["start_transaction", "start transaction;", "START TRANSACTION"],
    ["savepoint", "savepoint s;", "SAVEPOINT"], ["bare_release", "release s;", "RELEASE"],
    ["set_transaction", "set transaction read only;", "SET TRANSACTION"],
    ["set_local_transaction", "set local transaction read only;", "SET LOCAL TRANSACTION"],
    ["set_session_transaction", "set session characteristics as transaction read only;", "SET SESSION CHARACTERISTICS AS TRANSACTION"],
  ]) {
    await reject(`0002_${name}.sql`, sql, new RegExp(`forbidden transaction control \\(${control}\\)`));
  }
  await reject(
    "0002_bare_cr_escape.sql",
    "-- comment ends at bare CR\rCOMMIT; create table clara.bare_cr_escape(x int);",
    /forbidden transaction control \(COMMIT\)/,
  );
  assert.equal((await db.query("select to_regclass('clara.bare_cr_escape') is null absent")).rows[0].absent, true);
  await reject(
    "0002_unicode_identifier_escape.sql",
    "select 1 as é$tag$; COMMIT; create table clara.unicode_identifier_escape(x int);",
    /forbidden transaction control \(COMMIT\)/,
  );
  assert.equal(
    (await db.query("select to_regclass('clara.unicode_identifier_escape') is null absent")).rows[0].absent,
    true,
  );
  await reject(
    "0002_dynamic_transaction_escape.sql",
    `
      create table clara.dynamic_transaction_escape(marker text);
      do $body$ begin execute 'COMMIT'; end $body$;
    `,
    /invalid transaction termination|transaction control statements are not allowed within a function|cannot commit while a subtransaction is active|EXECUTE of transaction commands is not implemented/,
  );
  assert.equal(
    (await db.query("select to_regclass('clara.dynamic_transaction_escape') is null absent")).rows[0].absent,
    true,
  );
  await reject(
    "0002_call_transaction_escape.sql",
    `
      create procedure clara._transaction_escape_proc() language plpgsql as
        $body$ begin commit; end $body$;
      call clara._transaction_escape_proc();
    `,
    /invalid transaction termination|transaction control statements are not allowed within a function|cannot commit while a subtransaction is active|EXECUTE of transaction commands is not implemented/,
  );
  assert.equal(
    (await db.query("select to_regprocedure('clara._transaction_escape_proc()') is null absent")).rows[0].absent,
    true,
  );
  await apply(
    "0002_lexical_safe.sql",
    `
      -- COMMIT; BEGIN; ROLLBACK;
      create table clara.lexical_safe(marker text primary key);
      insert into clara.lexical_safe values ('COMMIT; ROLLBACK;');
      select $$ BEGIN; COMMIT; ROLLBACK; $$;
      do $body$ begin perform 'START TRANSACTION; COMMIT'; end $body$;
      /* outer COMMIT; /* nested ROLLBACK; */ BEGIN; */
    `,
  );
  writeFileSync(join(MIGRATIONS_DIR, "0003_strings_off.sql"), "set standard_conforming_strings=off;", "utf8");
  pendingPath = join(MIGRATIONS_DIR, "0004_backslash_escape.sql");
  writeFileSync(
    pendingPath,
    String.raw`select 'a\''; COMMIT; select '\''; create table clara.backslash_escape(x int);`,
    "utf8",
  );
  await assert.rejects(
    withDatabaseEnv(DBNAME, () => migrate({ dir: MIGRATIONS_DIR, log: silent })),
    /migration 0004_backslash_escape failed and was rolled back: syntax error/,
    "the next migration must parse with standard strings pinned on, not escape the transaction",
  );
  assert.equal(await ledgerHas("0003_strings_off"), true);
  assert.equal(await ledgerHas("0004_backslash_escape"), false);
  assert.equal((await db.query("select to_regclass('clara.backslash_escape') is null absent")).rows[0].absent, true);
  await apply(
    "0004_evaluator_split_birth.sql",
    `
      create table clara.evaluator_versions(
        id bigint generated always as identity primary key, name text not null, version int not null,
        body_sha256 text not null, migration_version text not null, deployed boolean not null default false,
        unique(name,version));
      create table clara.evaluator_version_members(
        evaluator_version_id bigint not null references clara.evaluator_versions(id), ordinal int not null,
        member_signature text not null, body_sha256 text not null,
        primary key(evaluator_version_id,member_signature), unique(evaluator_version_id,ordinal));
    `,
  );
  assert.equal((await db.query(
    "select to_regprocedure('clara.verify_evaluator_freeze()') is null absent")).rows[0].absent, true);
  await reject(
    "0005_missing_evaluator_verifier.sql",
    `
      create function clara.evaluate_metric_v1() returns int language sql immutable as $$select 1$$;
      insert into clara.evaluator_versions(name,version,body_sha256,migration_version,deployed)
      values('evaluate_metric_v1',1,md5(pg_get_functiondef('clara.evaluate_metric_v1()'::regprocedure)),'fixture',true);
    `,
    /evaluator freeze verifier is absent .* deployed rows/,
  );
  assert.equal((await db.query("select to_regprocedure('clara.evaluate_metric_v1()') is null absent")).rows[0].absent, true);
  await apply(
    "0005_install_evaluator_freeze.sql",
    `
      create function clara.evaluate_metric_v1() returns int language sql security definer set search_path=pg_catalog as $$select 1$$;
      create function clara.evaluate_metric_v2() returns int language sql immutable as $$select 2$$;
      create function clara._deny_evaluator_registry_change() returns trigger language plpgsql as $$
        begin raise exception 'evaluator registry immutable'; end $$;
      create trigger evaluator_registry_immutable before update or delete on clara.evaluator_versions
        for each row execute function clara._deny_evaluator_registry_change();
      with v as (
        insert into clara.evaluator_versions(name,version,body_sha256,migration_version,deployed) values
          ('evaluate_metric_v1',1,md5(pg_get_functiondef('clara.evaluate_metric_v1()'::regprocedure)),'fixture',false),
          ('evaluate_metric_v2',2,'deliberately-wrong-undeployed-hash','fixture',false)
        returning id,name)
      insert into clara.evaluator_version_members(evaluator_version_id,ordinal,member_signature,body_sha256)
        select id,0,'clara.'||name||'()',md5(pg_get_functiondef(to_regprocedure('clara.'||name||'()'))) from v;
      create function clara.verify_evaluator_freeze() returns jsonb language plpgsql stable as $$
      declare bad text;
      begin
        select e.name into bad from clara.evaluator_versions e
        join clara.evaluator_version_members m on m.evaluator_version_id=e.id
        where e.deployed and m.body_sha256 is distinct from md5(pg_get_functiondef(to_regprocedure(m.member_signature))) limit 1;
        if bad is not null then raise exception 'evaluator freeze mismatch: %',bad; end if;
        return jsonb_build_object('verified_deployed',(select count(*) from clara.evaluator_versions where deployed));
      end $$;
    `,
  );
  assert.equal(
    (await db.query(`select body_sha256<>md5(pg_get_functiondef('clara.evaluate_metric_v2()'::regprocedure)) mismatch
      from clara.evaluator_versions where version=2`)).rows[0].mismatch,
    true,
    "the live verifier must ignore an intentionally mismatched undeployed evaluator",
  );
  await apply(
    "0006_deploy_evaluator.sql",
    `
      create function clara._deploy_evaluator_once() returns trigger language plpgsql as $$
        begin if old.deployed or not new.deployed then raise exception 'invalid deploy'; end if; return new; end $$;
      drop trigger evaluator_registry_immutable on clara.evaluator_versions;
      create trigger evaluator_deploy_once before update on clara.evaluator_versions
        for each row execute function clara._deploy_evaluator_once();
      update clara.evaluator_versions set deployed=true where version=1;
    `,
  );
  assert.deepEqual((await db.query("select version,deployed from clara.evaluator_versions order by version")).rows,
    [{ version: 1, deployed: true }, { version: 2, deployed: false }]);
  await apply(
    "0007_recut_undeployed.sql",
    `create or replace function clara.evaluate_metric_v2() returns int language sql immutable as $$select 22$$;`,
  );
  assert.equal((await db.query("select clara.evaluate_metric_v2() value")).rows[0].value, 22);
  await reject(
    "0008_recut_deployed.sql",
    `create table clara.recut_marker(x int); create or replace function clara.evaluate_metric_v1()
       returns int language sql security definer set search_path=pg_catalog as $$select 11$$;`,
    /evaluator protected freeze evidence changed|evaluator freeze mismatch/,
  );
  assert.equal((await db.query("select clara.evaluate_metric_v1() value")).rows[0].value, 1);
  assert.equal((await db.query("select to_regclass('clara.recut_marker') is null absent")).rows[0].absent, true);
  const verifierBefore = (
    await db.query("select pg_get_functiondef('clara.verify_evaluator_freeze()'::regprocedure) definition")
  ).rows[0].definition;
  await reject(
    "0008_replace_member_identity.sql",
    `
      create or replace function clara.evaluate_metric_v1() returns int language sql security definer
        set search_path=pg_catalog as $$select 1$$;
      revoke all on function clara.evaluate_metric_v1() from public;
    `,
    /evaluator protected freeze evidence changed during the migration/,
  );
  assert.equal(
    (await db.query("select proacl::text acl from pg_proc where oid='clara.evaluate_metric_v1()'::regprocedure"))
      .rows[0].acl,
    null,
    "member ACL changes must roll back to PostgreSQL's default PUBLIC execute",
  );
  await reject(
    "0008_replace_verifier.sql",
    `create or replace function clara.verify_evaluator_freeze() returns jsonb language sql stable as
       $$select '{"ok":true}'::jsonb$$;`,
    /evaluator freeze verifier .* changed during the migration/,
  );
  assert.equal(
    (await db.query("select pg_get_functiondef('clara.verify_evaluator_freeze()'::regprocedure) definition")).rows[0]
      .definition,
    verifierBefore,
  );
  await reject(
    "0008_spoof_catalog.sql",
    `
      create schema freeze_spoof;
      create function freeze_spoof.pg_get_functiondef(oid) returns text language sql immutable as
        $$select pg_catalog.pg_get_functiondef($1)$$;
      set local search_path=freeze_spoof,pg_catalog;
      create or replace function clara.verify_evaluator_freeze() returns jsonb language sql stable as
        $$select '{"ok":true}'::jsonb$$;
      create or replace function clara.evaluate_metric_v1() returns int language sql security definer
        set search_path=pg_catalog as $$select 11$$;
    `,
    /evaluator freeze verifier .* changed during the migration|evaluator protected freeze evidence changed/,
  );
  assert.equal((await db.query("select to_regnamespace('freeze_spoof') is null absent")).rows[0].absent, true);
  assert.equal((await db.query("select clara.evaluate_metric_v1() value")).rows[0].value, 1);
  await reject(
    "0008_unlogged_members.sql",
    `alter table clara.evaluator_version_members set unlogged;`,
    /evaluator freeze registry hardening changed during the migration/,
  );
  assert.equal(
    (await db.query("select relpersistence from pg_class where oid='clara.evaluator_version_members'::regclass"))
      .rows[0].relpersistence,
    "p",
  );
  await reject(
    "0008_rebaseline_evaluator.sql",
    `
      alter table clara.evaluator_versions disable trigger evaluator_deploy_once;
      create or replace function clara.evaluate_metric_v1() returns int language sql security definer set search_path=pg_catalog as $$select 11$$;
      update clara.evaluator_versions set body_sha256=md5(pg_get_functiondef('clara.evaluate_metric_v1()'::regprocedure))
        where version=1;
      update clara.evaluator_version_members set body_sha256=md5(pg_get_functiondef('clara.evaluate_metric_v1()'::regprocedure))
        where member_signature='clara.evaluate_metric_v1()';
      alter table clara.evaluator_versions enable trigger evaluator_deploy_once;
    `,
    /evaluator protected freeze evidence changed during the migration/,
  );
  assert.equal((await db.query("select clara.evaluate_metric_v1() value")).rows[0].value, 1);
  await reject(
    "0008_replace_guard.sql",
    `drop trigger evaluator_deploy_once on clara.evaluator_versions;
     create trigger evaluator_deploy_once before update on clara.evaluator_versions
       for each row execute function clara._deploy_evaluator_once();`,
    /evaluator freeze registry hardening changed during the migration/,
  );
  await apply(
    "0008_producer_split_birth.sql",
    `
      create table clara.metric_input_producer_versions(
        id bigint generated always as identity primary key, producer_name text not null, version int not null,
        body_sha256 text not null, unique(producer_name,version));
      create table clara.metric_input_producer_version_members(
        producer_version_id bigint not null references clara.metric_input_producer_versions(id), ordinal int not null,
        member_signature text not null, body_sha256 text not null,
        primary key(producer_version_id,member_signature), unique(producer_version_id,ordinal));
    `,
  );
  await reject(
    "0009_missing_producer_verifier.sql",
    `insert into clara.metric_input_producer_versions(producer_name,version,body_sha256)
       values('metric_input_snapshot',1,'missing-verifier');`,
    /metric input producer freeze verifier is absent .* version rows/,
  );
  await apply(
    "0009_install_producer_freeze.sql",
    `
      create function clara.metric_input_dataset_v1() returns int language sql stable as $$select 1$$;
      create function clara.metric_input_dataset_v2() returns int language sql stable as $$select 2$$;
      with v as (
        insert into clara.metric_input_producer_versions(producer_name,version,body_sha256) values
          ('metric_input_snapshot',1,md5(pg_get_functiondef('clara.metric_input_dataset_v1()'::regprocedure))),
          ('metric_input_snapshot',2,md5(pg_get_functiondef('clara.metric_input_dataset_v2()'::regprocedure))) returning id,version)
      insert into clara.metric_input_producer_version_members(producer_version_id,ordinal,member_signature,body_sha256)
        select id,0,format('clara.metric_input_dataset_v%s()',version),
          md5(pg_get_functiondef(to_regprocedure(format('clara.metric_input_dataset_v%s()',version)))) from v;
      create function clara.verify_metric_input_producer_freeze() returns jsonb language plpgsql stable as $$
      declare bad int;
      begin
        select v.version into bad from clara.metric_input_producer_versions v
        join clara.metric_input_producer_version_members m on m.producer_version_id=v.id
        where m.body_sha256 is distinct from md5(pg_get_functiondef(to_regprocedure(m.member_signature))) limit 1;
        if bad is not null then raise exception 'metric input producer freeze mismatch: %',bad; end if;
        return jsonb_build_object('verified_producers',(select count(*) from clara.metric_input_producer_versions));
      end $$;
    `,
  );
  assert.deepEqual((await db.query("select version from clara.metric_input_producer_versions order by version")).rows,
    [{ version: 1 }, { version: 2 }]);
  // A member that outlives its version is invisible to every registry-driven evidence read
  // (they join FROM the registry), and suppressing the FK's internal triggers leaves no mark
  // on the hardening snapshot either — so referential integrity is checked on its own.
  await reject(
    "0010_orphaned_member.sql",
    `alter table clara.metric_input_producer_version_members disable trigger all;
     insert into clara.metric_input_producer_version_members(producer_version_id,ordinal,member_signature,body_sha256)
       values(999999,7,'clara.orphaned_member()','orphan-sha');
     alter table clara.metric_input_producer_version_members enable trigger all;`,
    /freeze members clara\.metric_input_producer_version_members hold 1 row\(s\) referencing no clara\.metric_input_producer_versions row \(1 introduced by this migration\)/,
  );
  assert.equal((await db.query(`select count(*)::int n from clara.metric_input_producer_version_members m
    where not exists(select 1 from clara.metric_input_producer_versions v where v.id=m.producer_version_id)`)).rows[0].n,
    0, "the refused orphan must not survive the rollback");
  await reject(
    "0010_rebaseline_historical_producer.sql",
    `
      create or replace function clara.metric_input_dataset_v1() returns int language sql stable as $$select 11$$;
      update clara.metric_input_producer_versions
        set body_sha256=md5(pg_get_functiondef('clara.metric_input_dataset_v1()'::regprocedure)) where version=1;
      update clara.metric_input_producer_version_members
        set body_sha256=md5(pg_get_functiondef('clara.metric_input_dataset_v1()'::regprocedure))
        where member_signature='clara.metric_input_dataset_v1()';
    `,
    /metric input producer protected freeze evidence changed during the migration/,
  );
  assert.equal((await db.query("select clara.metric_input_dataset_v1() value")).rows[0].value, 1);
  await reject(
    "0010_drop_producer_freeze.sql",
    `drop function clara.verify_metric_input_producer_freeze();
     drop table clara.metric_input_producer_version_members;
     drop table clara.metric_input_producer_versions;`,
    /metric input producer freeze registry .* disappeared or was replaced/,
  );
  assert.equal((await db.query(
    "select to_regprocedure('clara.verify_metric_input_producer_freeze()') is not null present")).rows[0].present, true);
  await reject("0010_volatile_verifier.sql", `create or replace function clara.verify_metric_input_producer_freeze() returns jsonb language plpgsql volatile as $$begin delete from clara.schema_migrations; return '{}'::jsonb; end$$;`, /freeze verifier .* changed during the migration|VOLATILE/);
  await db.query(`create function clara._verifier_write() returns void language plpgsql volatile as $$begin insert into clara.lexical_safe values('verifier-side-effect'); end$$; create or replace function clara.verify_metric_input_producer_freeze() returns jsonb language plpgsql stable as $$begin perform clara._verifier_write(); return '{}'::jsonb; end$$;`);
  await reject(
    "0010_direct_do_commit.sql",
    `do $body$ begin commit; end $body$;`,
    /invalid transaction termination|transaction control statements are not allowed within a function|cannot commit while a subtransaction is active/,
  );
  const currentRole = (await db.query("select current_user::text role")).rows[0].role;
  await db.query(`create table clara.same_xid_witness(body_xid pg_catalog.xid8,ledger_xid pg_catalog.xid8);
    create function clara._witness_xid() returns trigger language plpgsql as $$begin
      update clara.same_xid_witness set ledger_xid=pg_catalog.pg_current_xact_id() where ledger_xid is null; return new; end$$;
    create trigger _same_xid after insert on clara.schema_migrations for each row execute function clara._witness_xid()`);
  await apply("0010_benign_call.sql", `-- ABORT; START TRANSACTION; SAVEPOINT decoy;
    create procedure clara._benign_call() language sql as $$insert into clara.same_xid_witness(body_xid)
      values(pg_catalog.pg_current_xact_id())$$; call clara._benign_call(); select 'ROLLBACK TO; RELEASE;'::text;
    select $$ SET TRANSACTION; COMMIT; $$::text; set role ${currentRole}; reset role;`);
  assert.equal((await db.query("select body_xid=ledger_xid same from clara.same_xid_witness")).rows[0].same, true);
  await apply("0011_stable_verifier_probe.sql", "select 1;"); assert.equal((await db.query("select count(*)::int n from clara.lexical_safe where marker='verifier-side-effect'")).rows[0].n, 0);
  await reject(
    "0012_late_timeout.sql",
    `select 1; set local statement_timeout = '1s';`,
    /first executable statement/,
  );
  await reject(
    "0012_duplicate_timeout.sql",
    `set local statement_timeout = '1s'; set local statement_timeout to '2s';`,
    /more than one statement_timeout directive/,
  );
  await reject(
    "0012_unsupported_timeout.sql",
    `set statement_timeout = '1s';`,
    /must be SET LOCAL statement_timeout/,
  );
  await reject(
    "0012_timeout_fires.sql",
    `set local statement_timeout = '25ms'; select pg_catalog.pg_sleep(0.2);`,
    (error) => error.cause?.code === "57014",
  );
  for (const [name, poison] of [
    ["acl", "revoke all on function pg_temp.__clara_execute_migration(pg_catalog.text,pg_catalog.xid8) from public;"],
    ["owner", `alter function pg_temp.__clara_execute_migration(pg_catalog.text,pg_catalog.xid8) owner to ${WRAPPER_OWNER};`],
    ["replace", `create or replace function pg_temp.__clara_execute_migration(
      p_sql pg_catalog.text,p_expected_xid pg_catalog.xid8)
      returns pg_catalog.xid8 language sql as $$select p_expected_xid$$;`],
    ["drop", "drop function pg_temp.__clara_execute_migration(pg_catalog.text,pg_catalog.xid8);"],
  ]) await reject(`0012_wrapper_${name}.sql`, poison, /execution wrapper|cannot drop function|cache lookup failed/);
  for (const [name,attack] of [["delete","delete from clara.schema_migrations;"],["update","update clara.schema_migrations set checksum=repeat('0',64);"],["truncate","truncate clara.schema_migrations;"],["forge","insert into clara.schema_migrations(version,checksum) values('9999_forged',repeat('f',64));"]]) await reject(`0012_ledger_${name}.sql`,attack,/changed a prior schema_migrations receipt/);
  await reject("0028_wrong_name.sql", "grant select on clara.schema_migrations to clara_fn_owner;", /identity or hardening changed/);
  await apply("0028_vendor_identity_binding.sql", "grant select on clara.schema_migrations to clara_fn_owner;");
  for (const [name,sql] of [["public_update","grant update on clara.schema_migrations to public;"],["grant_option","grant select on clara.schema_migrations to clara_fn_owner with grant option;"],["revoke","revoke select on clara.schema_migrations from clara_fn_owner;"]]) await reject(`0029_ledger_acl_${name}.sql`,sql,/identity or hardening changed/);
  await reject("0030_add_ledger_rule.sql", `create rule schema_migrations_delete_noop as on delete to clara.schema_migrations do instead nothing;`, /migration ledger identity or hardening changed/);
  await reject(
    "0031_replace_ledger.sql",
    `drop table clara.schema_migrations;
     create table clara.schema_migrations(version pg_catalog.text primary key,checksum pg_catalog.text not null);`,
    /migration ledger identity or hardening changed/,
  );
  await reject(
    "0032_deferred_receipt_delete.sql",
    `create function clara._delete_deferred_receipt() returns trigger language plpgsql as $$
       begin delete from clara.schema_migrations where version=new.version; return new; end $$;
     create constraint trigger delete_deferred_receipt after insert on clara.schema_migrations
       deferrable initially deferred for each row execute function clara._delete_deferred_receipt();`,
    /migration ledger identity or hardening changed|did not retain an exact independent receipt/,
  );
  await reject(
    "0033_control_spoof.sql",
    `create schema control_spoof;
     create function control_spoof.current_setting(pg_catalog.text) returns pg_catalog.text language sql as $$select 'origin'$$;
     create function control_spoof.set_config(pg_catalog.text,pg_catalog.text,pg_catalog.bool) returns pg_catalog.text language sql as $$select $2$$;
     create function control_spoof.pg_current_xact_id() returns pg_catalog.xid8 language sql as $$select pg_catalog.pg_current_xact_id()$$;
     set search_path=control_spoof,pg_catalog; set session_replication_role=replica;
     update clara.evaluator_versions set body_sha256='spoofed' where version=1;`,
    /replication state|protected freeze evidence|freeze mismatch/,
  );
  assert.equal((await db.query("select to_regnamespace('control_spoof') is null absent")).rows[0].absent, true);
  const hasTransactionTimeout = serverVersionNum >= TRANSACTION_TIMEOUT_MIN_SERVER_VERSION_NUM;
  await apply(
    "0034_session_guc_poison.sql",
    `set DateStyle='SQL, DMY'; set TimeZone='Asia/Kuala_Lumpur'; set bytea_output='escape';
     set IntervalStyle='sql_standard'; set extra_float_digits=0; set standard_conforming_strings=off;
     set quote_all_identifiers=on; set client_encoding='LATIN1';
     set search_path=public,pg_catalog; set session_replication_role=origin; set default_transaction_read_only=on;
     set default_transaction_isolation='serializable'; set default_transaction_deferrable=on; set lock_timeout='9s';
     ${hasTransactionTimeout ? "set transaction_timeout='7s';" : ""}`,
  );
  await apply(
    "0035_canonical_semantics.sql",
    `create table clara.canonical_semantics(
       d pg_catalog.date, ts pg_catalog.timestamptz, b pg_catalog.bytea, i pg_catalog.interval,
       f pg_catalog.float8, s pg_catalog.text, xid pg_catalog.xid8);
     insert into clara.canonical_semantics values(
       '2026-08-13','2026-08-13 01:02:03+00','\\x4142','1 day 02:03:04',1.25,'a\\b',pg_catalog.pg_current_xact_id());`,
  );
  await db.query("set TimeZone='UTC'; set DateStyle='ISO, YMD'; set bytea_output='hex'; set IntervalStyle='postgres'; set extra_float_digits=3; set standard_conforming_strings=on");
  assert.deepEqual(
    (await db.query(`select d::text d,ts::text ts,b::text b,i::text i,f::text f,s,
      xid::text=(select pg_current_xact_id()::text) same_xid from clara.canonical_semantics`)).rows[0],
    { d: "2026-08-13", ts: "2026-08-13 01:02:03+00", b: "\\x4142", i: "1 day 02:03:04", f: "1.25", s: "a\\b", same_xid: false },
  );
  // Reads transaction_timeout back on a fresh session after 0034 poisoned it: '0' where
  // the parameter exists, absent below 17 — proving the version gate held and the runner
  // never asked an older server for a parameter it does not have.
  await apply("0036_transaction_timeout_witness.sql",
    `create table clara.transaction_timeout_witness(marker pg_catalog.text primary key);
     insert into clara.transaction_timeout_witness
       values(coalesce(pg_catalog.current_setting('transaction_timeout',true),'(absent)'));`);
  assert.equal((await db.query("select marker from clara.transaction_timeout_witness")).rows[0].marker,
    hasTransactionTimeout ? "0" : "(absent)");
});
