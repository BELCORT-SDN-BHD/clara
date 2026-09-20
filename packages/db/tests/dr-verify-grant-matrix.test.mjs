// #1014/#1029 — dr-verify's §4.6 "relation-grant matrix" (dr-verify-checks.mjs,
// checkGrantsAndRls) compares RAW pg_class.relacl bytes across a dump/restore round
// trip, not EFFECTIVE grants. A relation's relacl is NULL until the FIRST grant/revoke
// statement ever runs against it — at that point Postgres MATERIALISES the owner's
// implicit privileges into an explicit ACL, even when the statement itself is a semantic
// no-op (`revoke all ... from public` on a table PUBLIC never held anything on). pg_dump
// does not emit anything for an ACL that equals the object's default, so the RESTORED
// copy comes back with relacl NULL again — same effective grants, a different catalog
// representation. `cross join lateral aclexplode(c.relacl)` reads that as 8 (a table) or
// 3 (a sequence) phantom source-only rows forever. First hit: migration
// 0235_opening_binding_claim.sql (#1014)'s `revoke all on table
// clara.document_binding_claims from public`, in PR #1029's db-live-gates DR
// full-profile round trip: "[FAIL] 4.6 relation-grant matrix ... source-only 8,
// target-only 0", all eight rows clara_fn_owner's own privileges.
//
// This file drives `checkGrantsAndRls(ctx)` — the one exported function that owns the
// SQL under test — against TWO REAL throwaway databases holding a NULL-vs-materialised
// pair, through the `ctx` contract dr-verify-checks.mjs documents at its own top:
// {src, tgt, AUTHORITATIVE_SCHEMAS, record, bothRows, diffCheck}. `record`/`diffCheck`
// below are this file's own small collectors — dr-verify.mjs's own originals are neither
// exported nor safely importable (it calls its own `main()`, and can `process.exit()`,
// at import time) — built on nothing but the real, exported, reused `multisetDiff`.
//
// Expected row sets are LITERAL arrays, derived empirically against a real PostgreSQL 17
// cluster (see the ticket report), never by re-running the query under test to "compute"
// what it should return.
//
// Each cell gets its OWN schema so one relation-grant-matrix call's row set stays scoped
// to exactly the fixture that cell built — the check has no per-table filter, only a
// per-schema one.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { checkGrantsAndRls } from "../scripts/dr-verify-checks.mjs";
import { multisetDiff } from "../scripts/dr-verify-util.mjs";
import { connectionConfig, disposableDatabaseName } from "./migrate-harness.mjs";

const SRC_DB = disposableDatabaseName("clara_dr_grant_src");
const TGT_DB = disposableDatabaseName("clara_dr_grant_tgt");
const OTHER_ROLE = `dr_grant_other_${randomUUID().slice(0, 8)}`;
const RELNAME = "relation-grant matrix (4 schemas, incl sequences, grantor/grantable)";

// PostgreSQL 17's actual owner default ACL — MEASURED against a live cluster, not
// assumed: `select acldefault('r', <owner-oid>)` -> arwdDxtm (8 table privileges);
// `select acldefault('s', <owner-oid>)` -> rwU (3 sequence privileges), confirmed to
// match exactly what `revoke all ... from public` (a no-op) materialises AND exactly
// what `pg_dump` treats as "no ACL to emit". Two traps a fix must not walk into:
// (1) uppercase `S` is NOT the sequence type char for `acldefault()` — it silently
// resolves to an unrelated object kind (measured: `{owner=U/owner}`, USAGE only) that
// looks plausible but is wrong; the sequence char is lowercase `s`. (2) `v`/`m`
// (view/materialized view) are not valid `acldefault()` type chars at all — measured
// with `pg_dump`, a fresh view/matview/partitioned table's revoke-all-from-public
// round-trips silently exactly like a table's, so they take the same `r` default.
const TABLE_DEFAULT_PRIVS = ["DELETE", "INSERT", "MAINTAIN", "REFERENCES", "SELECT", "TRIGGER", "TRUNCATE", "UPDATE"];
const SEQUENCE_DEFAULT_PRIVS = ["SELECT", "UPDATE", "USAGE"];

let admin, src, tgt;

before(async () => {
  admin = new pg.Client(connectionConfig());
  await admin.connect();
  await admin.query(`create database "${SRC_DB}"`);
  await admin.query(`create database "${TGT_DB}"`);
  await admin.query(`create role "${OTHER_ROLE}"`);
  src = new pg.Client(connectionConfig(SRC_DB));
  tgt = new pg.Client(connectionConfig(TGT_DB));
  await src.connect();
  await tgt.connect();
  // checkGrantsAndRls's OTHER §4.6 probes (constraint/function/trigger/... definitions)
  // are hardcoded to schema `clara` and one casts the literal to `::regnamespace`, which
  // THROWS if the schema is absent rather than returning zero rows. An empty `clara`
  // schema on both sides satisfies that cast and keeps every one of those probes an inert
  // 0-rows-both-sides PASS — this file is only exercising the relation-grant matrix.
  for (const c of [src, tgt]) await c.query("create schema clara");
});

after(async () => {
  if (src) await src.end();
  if (tgt) await tgt.end();
  if (admin) {
    await admin.query(`drop database if exists "${SRC_DB}" with (force)`).catch(() => {});
    await admin.query(`drop database if exists "${TGT_DB}" with (force)`).catch(() => {});
    await admin.query(`drop role if exists "${OTHER_ROLE}"`).catch(() => {});
    await admin.end();
  }
});

/** dr-verify.mjs's own private `bothRows`/`diffCheck` shape, reproduced here (not
 *  imported — see the file header) and scoped to this file's one {src, tgt} pair. The
 *  diffing itself is the real, imported `multisetDiff` — nothing about "are these two
 *  row sets equal" is reimplemented, only the plumbing that runs one SQL string against
 *  both sides and records PASS/FAIL is. */
function buildCtx(schemas) {
  const records = [];
  const calls = new Map();
  async function bothRows(sql, params = []) {
    const [s, t] = await Promise.all([src.query(sql, params), tgt.query(sql, params)]);
    return { s: s.rows, t: t.rows };
  }
  function record(section, name, status, detail = "") {
    records.push({ section, name, status, detail });
  }
  async function diffCheck(section, name, sql, params = []) {
    const { s, t } = await bothRows(sql, params);
    const d = multisetDiff(s, t);
    calls.set(name, { sourceRows: s, targetRows: t, diff: d });
    if (d.equal) record(section, name, "PASS", `${d.n} row(s) identical`);
    else record(section, name, "FAIL", `source-only ${d.onlyA.length}, target-only ${d.onlyB.length} · ${[...d.onlyA, ...d.onlyB].join(" · ")}`);
    return d;
  }
  return { ctx: { src, tgt, AUTHORITATIVE_SCHEMAS: schemas, record, bothRows, diffCheck }, records, calls };
}

const sortRows = (rows) => [...rows].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
const ownerRow = (schema, relname, kind, priv) => ({
  nspname: schema, relname, kind, grantee: "postgres", privilege_type: priv, is_grantable: false, grantor: "postgres",
});
const otherRow = (schema, relname, kind, priv) => ({
  nspname: schema, relname, kind, grantee: OTHER_ROLE, privilege_type: priv, is_grantable: false, grantor: "postgres",
});

async function runMatrix(schema) {
  const { ctx, records, calls } = buildCtx([schema]);
  await checkGrantsAndRls(ctx);
  return { result: records.find((r) => r.name === RELNAME), call: calls.get(RELNAME) };
}

test("dr-verify relation-grant matrix: table default owner ACL, materialised on source only by a no-op revoke, reads as effective-identical", async () => {
  const schema = "dr_check_c1";
  for (const c of [src, tgt]) {
    await c.query(`create schema ${schema}`);
    await c.query(`create table ${schema}.t1(id int)`);
  }
  // PUBLIC never held anything on a fresh table — semantically a no-op — but it
  // materialises source's relacl from NULL to the owner's explicit default.
  await src.query(`revoke all on table ${schema}.t1 from public`);

  const { result, call } = await runMatrix(schema);
  const expected = sortRows(TABLE_DEFAULT_PRIVS.map((p) => ownerRow(schema, "t1", "r", p)));
  assert.deepEqual(sortRows(call.sourceRows), expected, "source: 8 owner privileges, explicit ACL");
  assert.deepEqual(sortRows(call.targetRows), expected, "target: 8 owner privileges, NULL ACL read as the coalesced default");
  assert.equal(result.status, "PASS", `expected PASS (same effective grants), got ${result.status} — ${result.detail}`);
});

test("dr-verify relation-grant matrix: a real extra grant to another role, source-only, still FAILs and names the grant", async () => {
  const schema = "dr_check_c2";
  for (const c of [src, tgt]) {
    await c.query(`create schema ${schema}`);
    await c.query(`create table ${schema}.t1(id int)`);
  }
  await src.query(`revoke all on table ${schema}.t1 from public`);
  await src.query(`grant select on table ${schema}.t1 to "${OTHER_ROLE}"`);

  const { result, call } = await runMatrix(schema);
  const expectedSrc = sortRows([...TABLE_DEFAULT_PRIVS.map((p) => ownerRow(schema, "t1", "r", p)), otherRow(schema, "t1", "r", "SELECT")]);
  const expectedTgt = sortRows(TABLE_DEFAULT_PRIVS.map((p) => ownerRow(schema, "t1", "r", p)));
  assert.deepEqual(sortRows(call.sourceRows), expectedSrc, "source: 8 owner privileges + the extra SELECT grant");
  assert.deepEqual(sortRows(call.targetRows), expectedTgt, "target: 8 owner privileges only");
  assert.equal(call.diff.onlyA.length, 1, "exactly one source-only row — the extra grant, not the owner's 8");
  assert.equal(call.diff.onlyB.length, 0);
  assert.equal(result.status, "FAIL", "a real extra grant must still FAIL");
  assert.match(result.detail, /source-only 1, target-only 0/);
  assert.match(result.detail, new RegExp(OTHER_ROLE));
  assert.match(result.detail, /SELECT/);
});

test("dr-verify relation-grant matrix: an owner privilege genuinely revoked on one side only still FAILs and names it", async () => {
  const schema = "dr_check_c3";
  for (const c of [src, tgt]) {
    await c.query(`create schema ${schema}`);
    await c.query(`create table ${schema}.t1(id int)`);
  }
  await src.query(`revoke all on table ${schema}.t1 from public`);
  await src.query(`revoke delete on table ${schema}.t1 from postgres`); // a REAL reduction, not a no-op

  const { result, call } = await runMatrix(schema);
  const expectedSrc = sortRows(TABLE_DEFAULT_PRIVS.filter((p) => p !== "DELETE").map((p) => ownerRow(schema, "t1", "r", p)));
  const expectedTgt = sortRows(TABLE_DEFAULT_PRIVS.map((p) => ownerRow(schema, "t1", "r", p)));
  assert.deepEqual(sortRows(call.sourceRows), expectedSrc, "source: 7 owner privileges — DELETE genuinely revoked");
  assert.deepEqual(sortRows(call.targetRows), expectedTgt, "target: the full 8, NULL ACL read as the coalesced default");
  assert.equal(call.diff.onlyA.length, 0);
  assert.equal(call.diff.onlyB.length, 1, "exactly one target-only row — the DELETE the source owner no longer holds");
  assert.equal(result.status, "FAIL", "a genuine owner-privilege reduction must still FAIL, never be coalesced away");
  assert.match(result.detail, /source-only 0, target-only 1/);
  assert.match(result.detail, /DELETE/);
});

test("dr-verify relation-grant matrix: sequence default owner ACL, materialised on source only by a no-op revoke, reads as effective-identical", async () => {
  const schema = "dr_check_seq1";
  for (const c of [src, tgt]) {
    await c.query(`create schema ${schema}`);
    await c.query(`create sequence ${schema}.seq1`);
  }
  await src.query(`revoke all on sequence ${schema}.seq1 from public`);

  const { result, call } = await runMatrix(schema);
  const expected = sortRows(SEQUENCE_DEFAULT_PRIVS.map((p) => ownerRow(schema, "seq1", "S", p)));
  assert.deepEqual(sortRows(call.sourceRows), expected, "source: 3 owner privileges (SELECT/UPDATE/USAGE), explicit ACL");
  assert.deepEqual(sortRows(call.targetRows), expected, "target: same 3, NULL ACL read as the coalesced sequence default");
  assert.equal(result.status, "PASS", `expected PASS (same effective grants), got ${result.status} — ${result.detail}`);
});

test("dr-verify relation-grant matrix: a real extra grant on a sequence, source-only, still FAILs and names it", async () => {
  const schema = "dr_check_seq2";
  for (const c of [src, tgt]) {
    await c.query(`create schema ${schema}`);
    await c.query(`create sequence ${schema}.seq1`);
  }
  await src.query(`revoke all on sequence ${schema}.seq1 from public`);
  await src.query(`grant select on sequence ${schema}.seq1 to "${OTHER_ROLE}"`);

  const { result, call } = await runMatrix(schema);
  const expectedSrc = sortRows([...SEQUENCE_DEFAULT_PRIVS.map((p) => ownerRow(schema, "seq1", "S", p)), otherRow(schema, "seq1", "S", "SELECT")]);
  const expectedTgt = sortRows(SEQUENCE_DEFAULT_PRIVS.map((p) => ownerRow(schema, "seq1", "S", p)));
  assert.deepEqual(sortRows(call.sourceRows), expectedSrc);
  assert.deepEqual(sortRows(call.targetRows), expectedTgt);
  assert.equal(call.diff.onlyA.length, 1);
  assert.equal(call.diff.onlyB.length, 0);
  assert.equal(result.status, "FAIL", "a real extra grant on a sequence must still FAIL");
  assert.match(result.detail, /source-only 1, target-only 0/);
  assert.match(result.detail, new RegExp(OTHER_ROLE));
});

test("dr-verify relation-grant matrix: an owner privilege genuinely revoked on a sequence, one side only, still FAILs and names it", async () => {
  const schema = "dr_check_seq3";
  for (const c of [src, tgt]) {
    await c.query(`create schema ${schema}`);
    await c.query(`create sequence ${schema}.seq1`);
  }
  await src.query(`revoke all on sequence ${schema}.seq1 from public`);
  await src.query(`revoke usage on sequence ${schema}.seq1 from postgres`); // a REAL reduction

  const { result, call } = await runMatrix(schema);
  const expectedSrc = sortRows(SEQUENCE_DEFAULT_PRIVS.filter((p) => p !== "USAGE").map((p) => ownerRow(schema, "seq1", "S", p)));
  const expectedTgt = sortRows(SEQUENCE_DEFAULT_PRIVS.map((p) => ownerRow(schema, "seq1", "S", p)));
  assert.deepEqual(sortRows(call.sourceRows), expectedSrc, "source: SELECT/UPDATE only — USAGE genuinely revoked");
  assert.deepEqual(sortRows(call.targetRows), expectedTgt);
  assert.equal(call.diff.onlyA.length, 0);
  assert.equal(call.diff.onlyB.length, 1, "exactly one target-only row — the USAGE the source owner no longer holds");
  assert.equal(result.status, "FAIL", "a genuine owner-privilege reduction on a sequence must still FAIL");
  assert.match(result.detail, /source-only 0, target-only 1/);
  assert.match(result.detail, /USAGE/);
});
