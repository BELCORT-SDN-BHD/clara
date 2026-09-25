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

import { classifyOrderKey } from "./collation-pin-scan.mjs";

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
