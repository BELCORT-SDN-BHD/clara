// #1047 — THE COLLATION-PIN GUARD. A pin taken over row content that is ORDERED BY a text
// expression records the server's `lc_collate`, not the data: 0295's first cut pinned a digest
// whose row order flipped between the rig's `C.UTF-8` and CI's `en_US.UTF-8`, and stopped the
// chain on CI (run 35954298990). The house rule the 0295 fix wrote down
// (`packages/db/README.md`, "Collation and pinned order") is enforced here.
//
// NO DATABASE. Deliberately, and for the same reason `preintegration-gate-chain.test.mjs` needs
// none: this guard must run on every leg, including the pre-migration chains where the batteries
// it protects are skipping, and its subject is source text rather than a schema.
//
// THE INSTRUMENT IS SHARED, NOT COPIED: the scanner lives in `collation-pin-scan.mjs` and is
// imported both by the positive controls below and by the corpus assertion, so a control can
// never pass against a re-typed copy of the rule.
//
// The LIVE half of #1047 — that the orderings the estate already pins cannot flip between two
// collations — is `collation-pin-portability.test.mjs`, which needs a database.

import { test } from "node:test";
import assert from "node:assert/strict";

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  RECORDED_SITES,
  classifyOrderKey,
  describeCollationFindings,
  scanJsText,
  scanSqlText,
} from "./collation-pin-scan.mjs";

test("collation-pin · an ORDER BY key is classified by the TYPE that decides whether a collation can move it", () => {
  // The type argument, not a guess: `pg_proc.proname` is of type `name`, whose type collation is
  // `C` (PostgreSQL's own catalog; re-measured live in collation-pin-portability.test.mjs), so a
  // census ordered by it sorts by code point on every server. 0149:858-861 states the same fact
  // in its own words — "pg_proc.proname is type `name` (C collation) while a text array sorts
  // under the database collation" — which is where this classification comes from.
  assert.equal(classifyOrderKey("p.proname").free, true, "a catalog `name` column cannot carry a collation difference");
  assert.equal(classifyOrderKey("conname").free, true);
  assert.equal(classifyOrderKey("grantee").free, true, "information_schema.sql_identifier IS `name`");

  // A cast to text drops that collation and takes the database's default.
  assert.equal(classifyOrderKey("p.oid::regprocedure::text").free, false, "a ::text cast sorts under the database collation");
  assert.equal(classifyOrderKey("privilege_type").free, false, "information_schema.character_data is varchar, not name");

  // An explicit `collate \"C\"` is the fix the house rule asks for, on any key.
  assert.equal(classifyOrderKey('f.family_key collate "C"').free, true);

  // Ordering that is not text at all is free by construction.
  assert.equal(classifyOrderKey("sort_order").free, true);
  assert.equal(classifyOrderKey("1").free, true);
});

// The fixtures below are the shapes the estate actually writes, reduced to the smallest text that
// still carries the defect: a prestate DO block that aggregates a census and compares it with a
// literal. `collate "C"` is the only difference between the refused one and the accepted one.
const PINNED_CENSUS = `
do $pre$
declare v_txt text;
begin
  select string_agg(x.slug, ',' order by x.slug) into v_txt from clara.consents x;
  if v_txt is distinct from 'alpha,beta' then
    raise exception 'prestate: the consent slug census drifted -- got %', v_txt using errcode = 'CLR10';
  end if;
end $pre$;
`;

test("collation-pin · a census pinned against a literal and ordered by a text key is REFUSED; the same census with collate \"C\" is not", () => {
  const findings = scanSqlText(PINNED_CENSUS);
  assert.equal(findings.length, 1, "the pinned, uncollated census must be found exactly once");
  assert.equal(findings[0].keys[0].key, "x.slug");
  assert.equal(findings[0].keys[0].free, false);
  assert.match(findings[0].why, /literal/, "the finding must say WHY the value is a pin, not merely that it is ordered");

  // Byte for byte the same block with the house fix applied.
  const fixed = PINNED_CENSUS.replace("order by x.slug", 'order by x.slug collate "C"');
  assert.notEqual(fixed, PINNED_CENSUS, "positive control: the fix must actually change the fixture");
  assert.deepEqual(scanSqlText(fixed), [], "a collated census is not a finding");
});

test("collation-pin · an ordered read that is NOT pinned is not a finding, and neither is one inside a function body", () => {
  // A read door builds an ordered jsonb for its caller. Nothing is compared with a literal, so no
  // literal can record a collation: this is the class the scanner must NOT cry about.
  const readDoor = `
do $pre$
declare v_out jsonb;
begin
  select jsonb_agg(c.name order by c.name) into v_out from clara.clients c;
  return;
end $pre$;
`;
  assert.deepEqual(scanSqlText(readDoor), [], "an ordered aggregate that is never pinned is not a finding");

  // The same text INSIDE a function body is the body's own behaviour, not a migration-time pin.
  const body = PINNED_CENSUS.replace("do $pre$", "create or replace function clara._x() returns void language plpgsql as $pre$");
  assert.deepEqual(scanSqlText(body), [], "a function body is not a prestate pin");
});

test("collation-pin · in a TEST file every ordered census counts, because a test's census exists to be asserted", () => {
  // A battery has no prestate DO block to scope by: its SQL sits in a template literal and the
  // comparison happens in JavaScript, out of the scanner's reach. So the rule for a test file is
  // the stricter one — an ordered aggregate over a movable key is a finding, pin or no pin.
  const cell = [
    'const privs = (await rootQuery(',
    "  `select coalesce(string_agg(privilege_type, ',' order by privilege_type), '') as p",
    "     from information_schema.role_table_grants where table_name = 'firm_invites'`)).rows[0].p;",
    'assert.equal(privs, "SELECT");',
  ].join("\n");
  const findings = scanJsText(cell);
  assert.equal(findings.length, 1, "the uncollated census in the battery's own SQL must be found");
  assert.equal(findings[0].keys[0].key, "privilege_type");

  const fixed = cell.replace("order by privilege_type", 'order by privilege_type collate "C"');
  assert.notEqual(fixed, cell, "positive control: the fix must actually change the fixture");
  assert.deepEqual(scanJsText(fixed), [], "a collated census in a battery is not a finding either");
});

test("collation-pin · an ABSENCE cohort compared only with the '(none)' sentinel is not a content pin", () => {
  // The idiom thirteen migrations write (0185:156, 0190:92, 0193:325, 0196:172, 0162:66 and the
  // rest, all byte-for-byte this shape): the aggregate exists to say WHICH members were found, and
  // the verdict is taken against a sentinel that no ordering can produce. The order reaches the
  // error message and nothing else, so no literal records a collation.
  const cohort = `
do $pre$
declare v_names text;
begin
  select coalesce(string_agg(x, ',' order by x), '(none)') into v_names
    from unnest(array['legal_documents','legal_acceptances']) x
   where to_regclass('clara.' || x) is not null;
  if v_names <> '(none)' then
    raise exception 'prestate: the cohort must be wholly absent; found %', v_names using errcode = 'CLR10';
  end if;
end $pre$;
`;
  assert.deepEqual(scanSqlText(cohort), [], "a sentinel verdict is not a pin over ordered content");

  // The SAME block with a content verdict is a pin again — the distinction is the literal, and
  // this control proves the scanner reads it rather than waving the whole shape through.
  const contentVerdict = cohort.replace("v_names <> '(none)'", "v_names <> 'legal_acceptances,legal_documents'");
  assert.notEqual(contentVerdict, cohort, "positive control: the verdict must actually have changed");
  assert.equal(scanSqlText(contentVerdict).length, 1, "a verdict taken against ordered content IS a pin");
});

test("collation-pin · the verdict that counts is the one taken on THIS value, not a later reuse of the same variable", () => {
  // A prestate reuses `v_bad` a dozen times. 0150:2058 aggregates the non-core add-back families
  // into `v_bad` and asks only whether it IS NULL; three hundred lines later another census
  // compares a different `v_bad` with a content literal. Scoping the verdict to the statement's
  // own def-use region is what keeps the first from inheriting the second's pin — and a null
  // verdict records no ordering at all, because null is not a value any ordering can produce.
  const reused = `
do $tail$
declare v_bad text;
begin
  select string_agg(f.family_key, ', ' order by f.family_key) into v_bad
    from clara.coa_template_families f where f.inclusion <> 'core';
  if v_bad is not null then
    raise exception 'tail: these families are not core: %', v_bad using errcode = 'CLR10';
  end if;

  select string_agg(c.relname, ',' order by c.relname) into v_bad from pg_class c;
  if v_bad is distinct from 'clients,firms' then
    raise exception 'tail: the relation census moved -- got %', v_bad using errcode = 'CLR10';
  end if;
end $tail$;
`;
  assert.deepEqual(scanSqlText(reused), [], "a null verdict is not a pin, and the later reuse must not reach back");

  // Positive control: give the FIRST census a content verdict of its own and it is a pin again.
  const pinned = reused.replace("if v_bad is not null then", "if v_bad is distinct from 'donations_approved, entertainment' then");
  assert.notEqual(pinned, reused, "positive control: the first verdict must actually have changed");
  const findings = scanSqlText(pinned);
  assert.equal(findings.length, 1, "exactly the census whose own verdict is a content literal");
  assert.equal(findings[0].keys[0].key, "f.family_key");
});

test("collation-pin · a digest checked against a value the SAME transaction measured is not a cross-server pin", () => {
  // 0151:323/911 is the correct pattern and must not be cried about: the prestate measures
  // `md5(string_agg(p.oid::regprocedure::text, ',' order by …))` into a temp table and the tail
  // compares against THAT, so both sides were taken on the same server under the same collation.
  // Only a digest checked against a LITERAL carries a collation across servers — which is the
  // defect 0295 shipped and this guard exists to stop.
  const selfConsistent = `
do $pre$
begin
  create temporary table t_pre (k text primary key, v text) on commit drop;
  insert into t_pre(k, v) values
    ('sig_ck', (select md5(string_agg(p.oid::regprocedure::text, ',' order by p.oid::regprocedure::text))
                  from pg_proc p where p.pronamespace = 'clara'::regnamespace));
end $pre$;
`;
  assert.deepEqual(scanSqlText(selfConsistent), [], "a digest carried in a temp table is measured, not pinned");

  const againstLiteral = `
do $pre$
declare v_sha text;
begin
  select encode(sha256(convert_to(string_agg(p.oid::regprocedure::text, ',' order by p.oid::regprocedure::text), 'UTF8')), 'hex')
    into v_sha from pg_proc p where p.pronamespace = 'clara'::regnamespace;
  if v_sha <> 'd02a786a685d484989a85e2e6a3f239ccdb5cbb8957143ede21f2fd8b12f67df' then
    raise exception 'prestate: the signature digest moved -- got %', v_sha using errcode = 'CLR10';
  end if;
end $pre$;
`;
  const findings = scanSqlText(againstLiteral);
  assert.equal(findings.length, 1, "a digest checked against a hex literal IS a pin");
  assert.equal(findings[0].keys[0].domain, "regprocedure_text");
});

test("collation-pin · a battery writes its SQL with escaped quotes, and a key keeps its own parentheses", () => {
  // firm-portfolio-pack:605 holds its SQL in a double-quoted JavaScript string, so the fix reads
  // `collate \"C\"` in the source. A scanner that does not see through the escape would keep
  // reporting a site that has already been fixed.
  const escaped = 'const bad = await rootQuery("select string_agg(t, \',\' order by privilege_type collate \\"C\\") as bad from x");';
  assert.deepEqual(scanJsText(escaped), [], 'collate \\"C\\" in a JavaScript string is collate "C"');

  // And a key that is a function call is reported whole — `coalesce(rr.rolname, 'PUBLIC')`, not a
  // truncation of it — because the record is read by people who then have to resolve the key.
  const call = `select coalesce(string_agg(x, ',' order by coalesce(rr.name, 'PUBLIC')), '') as v from t`;
  const findings = scanJsText(call);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].keys[0].key, "coalesce(rr.name, 'PUBLIC')");
});

// ---------------------------------------------------------------------------------------------
// The corpus. This is the guard proper: the estate's own migrations and batteries, read with the
// same instrument the fixtures above drive.
// ---------------------------------------------------------------------------------------------

const DB_DIR = fileURLToPath(new URL("..", import.meta.url));

/** Every pinned text-ordered site in the estate, as {path, keys}, one row per file. */
function scanCorpus() {
  const rows = new Map();
  const add = (path, keys) => {
    if (!rows.has(path)) rows.set(path, { path, keys: [] });
    rows.get(path).keys.push(...keys);
  };
  for (const file of readdirSync(join(DB_DIR, "migrations")).sort()) {
    if (!file.endsWith(".sql")) continue;
    const found = scanSqlText(readFileSync(join(DB_DIR, "migrations", file), "utf8"));
    for (const site of found) add(`migrations/${file}`, site.keys.filter((k) => !k.free).map((k) => k.key));
  }
  for (const file of readdirSync(join(DB_DIR, "tests")).sort()) {
    // This battery's own fixtures are deliberate violations; scanning them would record the
    // examples as estate sites.
    if (!/\.(mjs|js)$/.test(file) || file.startsWith("collation-pin-")) continue;
    const found = scanJsText(readFileSync(join(DB_DIR, "tests", file), "utf8"));
    for (const site of found) add(`tests/${file}`, site.keys.filter((k) => !k.free).map((k) => k.key));
  }
  return [...rows.values()];
}

test("collation-pin · every pin over text-ordered row content in the estate is the RECORD, and a new one is refused", () => {
  const observed = scanCorpus();
  assert.equal(describeCollationFindings(observed), "", describeCollationFindings(observed));
});

test("collation-pin · the corpus is non-empty on both sides, so a green above cannot be vacuous", () => {
  const observed = scanCorpus();
  const keysFound = observed.reduce((n, r) => n + r.keys.length, 0);
  const keysRecorded = RECORDED_SITES.reduce((n, r) => n + r.keys.length, 0);
  // The numbers #1047 worked: 66 keys over 37 files (28 keys in 16 applied migrations, 38 in 21
  // batteries). A corpus that scanned nothing, or a record that recorded nothing, would let the
  // assertion above pass while proving nothing at all.
  assert.ok(keysFound >= 40, `the scanner still reads the estate's censuses (found ${keysFound} movable keys)`);
  assert.ok(keysRecorded >= 40, `the record is still populated (${keysRecorded} keys)`);
  assert.ok(
    observed.some((r) => r.path.startsWith("migrations/")) && observed.some((r) => r.path.startsWith("tests/")),
    "both halves of the corpus are read",
  );
});

test("collation-pin · POSITIVE CONTROL: a new uncollated pin is NAMED, and the refusal says what to write", () => {
  const observed = scanCorpus();
  const planted = [...observed, { path: "migrations/9999_a_future_file.sql", keys: ["p.oid::regprocedure::text"] }];
  const message = describeCollationFindings(planted);
  assert.match(message, /NEW {2}migrations\/9999_a_future_file\.sql/, "the new site is named");
  assert.match(message, /collate "C"/, "...and the refusal says what to write");
  assert.match(message, /35954298990/, "...and points at the run that paid for the rule");
});

test("collation-pin · POSITIVE CONTROL: a site that changes its keys is NAMED as moved, not silently accepted", () => {
  const first = RECORDED_SITES.find((r) => r.path.startsWith("migrations/"));
  const mutated = [{ path: first.path, keys: [...first.keys, "some_new_text_column"] }];
  const message = describeCollationFindings(mutated, [first]);
  assert.match(message, /MOVED/);
  assert.match(message, /some_new_text_column/);
});
