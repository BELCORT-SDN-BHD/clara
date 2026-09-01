import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { makePool } from "../lib/pg.mjs";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

function roleLadder() {
  const source = readFileSync(join(REPO_ROOT, "apps", "web", "lib", "members", "reads.ts"), "utf8");
  const declaration = /export const ROLE_LADDER = \[([^\]]+)\] as const;/.exec(source)?.[1];
  assert.ok(declaration, "ROLE_LADDER declaration was not found");
  return [...declaration.matchAll(/"([a-z]+)"/g)].map((match) => match[1]);
}

test("P4-4 role_rank(text) exists and maps the four ROLE_LADDER entries exactly", async () => {
  const expectedRoles = roleLadder();
  assert.equal(expectedRoles.length, 4, "the live UI ladder no longer has four roles");
  const pool = makePool();
  try {
    const result = await pool.query(
      `select to_regprocedure('clara.role_rank(text)') is not null as present,
              array_agg(role order by ord) as roles,
              array_agg(clara.role_rank(role) order by ord) as ranks
         from unnest($1::text[]) with ordinality as ladder(role, ord)`,
      [expectedRoles],
    );
    assert.equal(result.rows[0]?.present, true, "the exact clara.role_rank(text) signature is absent");
    assert.deepEqual(result.rows[0]?.roles, expectedRoles);
    assert.deepEqual(result.rows[0]?.ranks, expectedRoles.map((_, rank) => rank));
  } finally {
    await pool.end();
  }
});

test("P4-4 role_rank has exactly one catalog row, whose identity argument types are text", async () => {
  const pool = makePool();
  try {
    const result = await pool.query(
      `select count(*)::int as overload_count,
              array_agg(pg_catalog.oidvectortypes(p.proargtypes) order by p.oid) as identity_argument_types
         from pg_catalog.pg_proc p
         join pg_catalog.pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'clara'
          and p.proname = 'role_rank'`,
    );
    assert.equal(result.rows[0]?.overload_count, 1, "clara.role_rank must have exactly one overload");
    assert.deepEqual(result.rows[0]?.identity_argument_types, ["text"]);
  } finally {
    await pool.end();
  }
});
