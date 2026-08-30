import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

import { lexSql, viewDefinitionOffsets } from "../test/sqlOracle";

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "packages", "db", "migrations");
const MIGRATION_FILES = readdirSync(MIGRATIONS_DIR).filter((file) => file.endsWith(".sql")).sort();
const migration = (name: string): string => readFileSync(join(MIGRATIONS_DIR, name), "utf8");

describe("the SQL lexer is controlled before the migration census trusts it", () => {
  it("a commented-out CREATE VIEW is not a definition", () => {
    const sql = "-- create view clara.decoy as select 1;\n/* create view clara.decoy as select 2; */\ncreate view clara.real as select 3;";
    const { statements } = lexSql(sql);
    assert.doesNotMatch(statements, /create\s+view\s+clara\.decoy/i);
    assert.match(statements, /create\s+view\s+clara\.real/i);
  });

  it("a quoted CREATE VIEW inside an invoked DO body remains data", () => {
    const sql = "do $$ begin raise notice 'create view clara.decoy as select 1'; end $$;\ncreate view clara.real as select 1;";
    const { statements } = lexSql(sql);
    assert.doesNotMatch(statements, /create\s+view\s+clara\.decoy/i);
    assert.match(statements, /create\s+view\s+clara\.real/i);
  });

  it("comments inside an invoked DO body are stripped while live values remain", () => {
    const sql = "do $$ begin\n  -- ('decoy', 9, 'a,b')\n  perform ('real', 2, 'a,b');\nend $$;";
    const { withoutComments } = lexSql(sql);
    assert.ok(!withoutComments.includes("decoy"));
    assert.ok(withoutComments.includes("'real'"));
  });

  it("a `--` inside a string is not a comment", () => {
    assert.ok(lexSql("select 'p4t1 tail: OK -- everything live', 1;").withoutComments.includes("everything live"));
  });

  it("an ESCAPE string does not expose DDL inside it or swallow the next statement", () => {
    const hidden = "select E'\\'; create view clara.probe as select 1; ';";
    assert.doesNotMatch(lexSql(hidden).statements, /create\s+view\s+clara\.probe/i);
    const following = "select E'a\\'b';\ncreate view clara.probe as select 1;";
    assert.match(lexSql(following).statements, /create\s+view\s+clara\.probe/i);
  });

  it("the real 0111 escape string keeps both views aligned", () => {
    const views = lexSql(migration("0111_f_a5_reporting_agency_pr1.sql"));
    assert.equal(views.withoutComments.length, views.statements.length);
    assert.ok(views.withoutComments.length > 1000);
  });

  it("nested dollar data inside a DO body is not executable evidence", () => {
    const contract = "do $$ begin\n perform $q$ ('caller_context', 6, 'DECOY') $q$;\nend $$;";
    assert.ok(!lexSql(contract).withoutComments.includes("DECOY"));
    const ddl = "do $$ begin\n perform $q$ create view clara.probe as select 1; $q$;\nend $$;";
    assert.doesNotMatch(lexSql(ddl).statements, /create\s+view\s+clara\.probe/i);
  });

  it("PIN SQL-1: ordinary dollar data and an uninvoked function body are masked", () => {
    const ordinary = "select $$ create view clara.probe as select 1; $$;";
    const functionBody = "create function clara.f() returns void language plpgsql as $fn$ begin create view clara.probe as select 1; end $fn$;";
    assert.doesNotMatch(lexSql(ordinary).statements, /create\s+view\s+clara\.probe/i);
    assert.doesNotMatch(lexSql(functionBody).statements, /create\s+view\s+clara\.probe/i);
  });

  it("PIN SQL-2: direct and nested invoked DO bodies expose their live DDL", () => {
    const direct = "do $$ begin create or replace view clara.probe as select 1; end $$;";
    const nested = "do $outer$ begin do $inner$ begin create view clara.probe as select 1; end $inner$; end $outer$;";
    assert.match(lexSql(direct).statements, /create\s+or\s+replace\s+view\s+clara\.probe/i);
    assert.match(lexSql(nested).statements, /create\s+view\s+clara\.probe/i);
  });

  it("PIN SQL-3: an identifier-embedded $tag$ is not a delimiter", () => {
    const sql = "select x$tag$;\ncreate view clara.probe as select 1;\nselect y$tag$;";
    assert.match(lexSql(sql).statements, /create\s+view\s+clara\.probe/i);
  });

  it("PIN SQL-4: accented, CJK, and astral tags are recognised", () => {
    for (const tag of ["é", "界", "𐐀"]) {
      const data = `select $${tag}$ create view clara.probe as select 1; $${tag}$;`;
      assert.doesNotMatch(lexSql(data).statements, /create\s+view\s+clara\.probe/i, `${tag}: ordinary data surfaced`);
      const invoked = `do $${tag}$ begin create view clara.probe as select 1; end $${tag}$;`;
      assert.match(lexSql(invoked).statements, /create\s+view\s+clara\.probe/i, `${tag}: DO body stayed masked`);
    }
  });

  it("PIN SQL-5: astral comments and payloads preserve UTF-16 offsets", () => {
    for (const sql of [
      "-- 𐐀 comment\ncreate view clara.probe as select 1;",
      "select $界$𐐀 payload$界$;\ncreate view clara.probe as select 1;",
    ]) {
      const views = lexSql(sql);
      assert.equal(views.withoutComments.length, sql.length);
      assert.equal(views.statements.length, sql.length);
      assert.equal(views.statements.indexOf("create view"), sql.indexOf("create view"));
    }
  });

  it("unterminated strings and dollar tags keep the fail-closed offset contract", () => {
    const quote = "select '";
    assert.equal(lexSql(quote).withoutComments.length, quote.length);
    assert.equal(lexSql(quote).statements.length, quote.length);

    const parameter = "select $1$::text;\ncreate view clara.probe as select 1;";
    assert.match(lexSql(parameter).statements, /create\s+view\s+clara\.probe/i);
    const tag = "do $body$ begin end;\ncreate view clara.probe as select 1;";
    assert.match(lexSql(tag).statements, /create\s+view\s+clara\.probe/i);
    assert.equal(lexSql(tag).statements.length, tag.length);
  });

  it("spaced and quoted qualifiers identify the same relation", () => {
    for (const spelling of ['clara . probe', 'clara."probe"', '"clara"."probe"', "clara.probe"]) {
      assert.equal(viewDefinitionOffsets(`create or replace view ${spelling} as select 1;`, "probe").length, 1, spelling);
    }
    assert.equal(viewDefinitionOffsets("create view clara.probe_other as select 1;", "probe").length, 0);
  });

  it("PIN SQL-6: ordinary plus RECURSIVE definitions are two occurrences", () => {
    const sql = `create view clara.probe as select 1;
      create or replace recursive view clara.probe as select 2;`;
    assert.equal(viewDefinitionOffsets(sql, "probe").length, 2);
  });

  it("PIN SQL-7: invoked local function exposes DDL; uninvoked control remains masked", () => {
    const invoked = `create or replace function clara.install_probe() returns void language plpgsql as $fn$
      begin create view clara.probe as select 1; end $fn$;
      select clara.install_probe();`;
    const performed = `create or replace function clara.install_probe() returns void language plpgsql as $fn$
      begin create view clara.probe as select 1; end $fn$;
      do $$ begin perform clara.install_probe(); end $$;`;
    const uninvoked = `create function clara.install_probe() returns void language plpgsql as $fn$
      begin create view clara.probe as select 1; end $fn$;`;
    assert.equal(viewDefinitionOffsets(invoked, "probe").length, 1);
    assert.equal(viewDefinitionOffsets(performed, "probe").length, 1);
    assert.equal(viewDefinitionOffsets(uninvoked, "probe").length, 0);

  });

  it("PIN SQL-7b: CALL exposes an invoked local procedure's DDL", () => {
    const called = `create or replace procedure clara.install_probe() language plpgsql as $fn$
      begin create view clara.probe as select 1; end $fn$;
      call clara.install_probe();`;
    assert.equal(viewDefinitionOffsets(called, "probe").length, 1);
  });

  it("PIN SQL-8: quoted DO body is executable; ordinary quoted value is data", () => {
    const plain = "do 'begin create view clara.probe as select 1; end';";
    const escaped = "do E'begin create view clara.probe as select 1; end';";
    const data = "select 'create view clara.probe as select 1;';";
    assert.equal(viewDefinitionOffsets(plain, "probe").length, 1);
    assert.equal(viewDefinitionOffsets(escaped, "probe").length, 1);
    assert.equal(viewDefinitionOffsets(data, "probe").length, 0);
  });

  it("PIN SQL-9: EXECUTE literal exposes DDL; PERFORM literal remains data", () => {
    const dollar = "do $$ begin execute $ddl$create view clara.probe as select 1;$ddl$; end $$;";
    const quoted = "do $$ begin execute 'create view clara.probe as select 1;'; end $$;";
    const data = "do $$ begin perform $ddl$create view clara.probe as select 1;$ddl$; end $$;";
    assert.equal(viewDefinitionOffsets(dollar, "probe").length, 1);
    assert.equal(viewDefinitionOffsets(quoted, "probe").length, 1);
    assert.equal(viewDefinitionOffsets(data, "probe").length, 0);
  });

  it("PIN SQL-9a: every unresolved dynamic EXECUTE throws, even when the census found zero", () => {
    assert.throws(
      () => viewDefinitionOffsets("do $$ begin execute format('create view clara.%I as select 1', name); end $$;", "probe"),
      /unmodelled: unresolved dynamic SQL/,
    );
    assert.throws(
      () => viewDefinitionOffsets("do $$ begin execute v_sql; end $$;", "probe"),
      /unmodelled: unresolved dynamic SQL/,
      "a zero-result census silently accepted unresolved dynamic SQL",
    );
    assert.throws(
      () => viewDefinitionOffsets(
        "do $$ begin execute v_sql; end $$; create view clara.probe as select 1;",
        "probe",
      ),
      /unmodelled: unresolved dynamic SQL/,
      "a nonzero-result census silently accepted unresolved dynamic SQL",
    );
  });

  it("PIN SQL-9c: PostgreSQL E-string escapes never erase executable DDL", () => {
    const inputs = [
      String.raw`do $$ begin execute E'create\x20view clara.probe as select 1;'; end $$;`,
      String.raw`do $$ begin execute E'create\040view clara.probe as select 1;'; end $$;`,
      String.raw`do $$ begin execute E'create\U00000020view clara.probe as select 1;'; end $$;`,
      String.raw`do $$ begin execute E'create\\x20view clara.probe as select 1;'; end $$;`,
      String.raw`do $$ begin execute E'create\qview clara.probe as select 1;'; end $$;`,
    ];
    const outcomes = inputs.map((sql): number | "unresolved" => {
      try {
        return viewDefinitionOffsets(sql, "probe").length;
      } catch (error) {
        assert.match(error instanceof Error ? error.message : String(error), /unmodelled: unresolved dynamic SQL/);
        return "unresolved";
      }
    });
    assert.deepEqual(outcomes, [1, 1, 1, 0, "unresolved"], "hex, octal, Unicode, literal backslash, unresolved escape");
  });

  it("PIN SQL-9b: a pure literal concatenation folds; a mixed expression throws", () => {
    const concatenated = "do $$ begin execute 'create view clara.' || 'probe as select 1;'; end $$;";
    assert.equal(viewDefinitionOffsets(concatenated, "probe").length, 1);
    assert.throws(
      () => viewDefinitionOffsets("do $$ begin execute $q$create view clara.$q$ || format('%I as select 1', name); end $$;", "probe"),
      /unmodelled: unresolved dynamic SQL/,
    );
  });

  it("quoted identifier text and identifier continuations are exact, not regex boundaries", () => {
    assert.equal(viewDefinitionOffsets('select "create view clara.probe";', "probe").length, 0);
    assert.equal(viewDefinitionOffsets('create view clara."probe-extra" as select 1;', "probe").length, 0);
    assert.equal(viewDefinitionOffsets("create view clara.probeé as select 1;", "probe").length, 0);
  });

  it("every real migration view is length-preserving", () => {
    for (const file of ["0002_foundation.sql", "0141_p4_tranche1_invite_rbac.sql"]) {
      const raw = migration(file);
      const views = lexSql(raw);
      assert.equal(views.withoutComments.length, raw.length, `${file}: comments view changed length`);
      assert.equal(views.statements.length, raw.length, `${file}: statement view changed length`);
    }
  });

  it("VACUITY CONTROL: the migration corpus was actually read", () => {
    assert.ok(MIGRATION_FILES.length > 100, `only ${MIGRATION_FILES.length} migrations found`);
  });
});
