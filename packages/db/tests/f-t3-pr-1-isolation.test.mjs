// F-T3 PR-1 -- the ISOLATION proof. Sibling of f-t3-pr-1.test.mjs and f-t3-pr-1-walls.test.mjs
// (same fixtures module; split only to stay under the file-size gate).
// Migration: packages/db/migrations/UNNUMBERED_f_t3_pr_1_tax_platform.sql (numbered at MERGE).

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { rootQuery, endPool, ROLES } from "./rig-fixtures.mjs";
import { RELATIONS, tableApplied, inRolledBackTx, reachCensus } from "./f-t3-pr-1-fixtures.mjs";

let live = false;
before(async () => { live = await tableApplied(); });
after(async () => { await endPool(); });

/** Two-armed gate -- see f-t3-pr-1.test.mjs for the full rationale. A package-wide sweep skips
 *  LOUDLY; a focused run with the variable UNSET FAILS rather than greening by skipping. */
const gate = (t) => {
  if (live) return false;
  if (process.env.CLARA_ALLOW_MISSING_FT3_TAX_PLATFORM === "1") {
    console.warn("SKIP f-t3-pr-1-isolation: the migration is not applied to this database (explicit pre-integration run).");
    t.skip("F-T3 PR-1 tax platform relations not applied -- explicit pre-integration run");
    return true;
  }
  assert.fail("the F-T3 PR-1 tax platform relations are required for a focused or post-migration run: apply the migration, or set CLARA_ALLOW_MISSING_FT3_TAX_PLATFORM=1 for the package-wide pre-integration sweep");
};
// THE ACL CENSUS AND THE TWO-FIRM ISOLATION PROOF. These six carry no firm dimension by
// design, so "cross-tenant" means something sharper than a scoped read: NO tenant-facing role
// reaches them AT ALL, and forced RLS admits zero rows to any firm's session even with a stray
// grant. Both arms carry a positive control — a census that has only said NO proves nothing.
// ---------------------------------------------------------------------------------------

test("ft3-B1 · THE TRUE CLOSED WORLD -- relacl IS NULL on all six (no grantee at all: the one "
  + "predicate a role this file never named cannot slip past), the six-role roster diagnosis is "
  + "clean, and the instrument DOES flip under an injected grant", async (t) => {
    if (gate(t)) return;
    for (const rel of RELATIONS) {
      const acl = await rootQuery(
        `select relacl from pg_class where oid = ('clara.' || $1)::regclass`, [rel]);
      assert.equal(acl.rows[0].relacl, null, `${rel}: no ACL entry exists at all`);
    }
    assert.deepEqual(await reachCensus(), [],
      "roster diagnosis: no authenticated/agent/wake/runtime/freeform role holds any DML privilege");

    await inRolledBackTx(async (client) => {
      await client.query(`grant select on clara.tax_treatment_codes to ${ROLES.authenticated}`);
      const r = await client.query(
        "select relacl from pg_class where oid = 'clara.tax_treatment_codes'::regclass");
      assert.notEqual(r.rows[0].relacl, null, "relacl DOES flip non-null under an injected grant");
      const r2 = await client.query(
        "select has_table_privilege($1, 'clara.tax_treatment_codes', 'select') as ok",
        [ROLES.authenticated]);
      assert.equal(r2.rows[0].ok, true, "has_table_privilege DOES flip true");
    });
    const after = await rootQuery(
      "select relacl from pg_class where oid = 'clara.tax_treatment_codes'::regclass");
    assert.equal(after.rows[0].relacl, null, "the injected grant did not survive the cell");
    assert.deepEqual(await reachCensus(), [], "the roster is clean again");
  });

test("ft3-B2 · TWO FIRMS, six relations: even WITH a stray SELECT grant, forced RLS admits "
  + "ZERO rows to either firm's clara_authenticated session -- and the same session DOES see "
  + "rows from a table it is genuinely entitled to (the positive control)", async (t) => {
    if (gate(t)) return;
    const firms = await rootQuery("select id from clara.firms order by created_at limit 2");
    assert.ok(firms.rowCount >= 2,
      "this cell needs two seeded firms: it proves the wall holds for BOTH, not just for one");

    for (const firm of firms.rows) {
      await inRolledBackTx(async (client) => {
        for (const rel of RELATIONS) {
          await client.query(`grant select on clara.${rel} to ${ROLES.authenticated}`);
        }
        await client.query("select set_config('request.jwt.claims', $1, true)",
          [JSON.stringify({ sub: `x_ft3_probe_${firm.id}`, role: "authenticated" })]);
        await client.query(`set role ${ROLES.authenticated}`);

        for (const rel of RELATIONS) {
          const rows = await client.query(`select * from clara.${rel}`);
          assert.equal(rows.rowCount, 0,
            `${rel}: FORCE RLS with only the clara_fn_owner policy admits ZERO rows to firm ${firm.id}, even once granted`);
        }
        // Positive control: the SAME impersonated session, in the SAME transaction, reads a
        // table clara_authenticated is genuinely granted. A zero that is really "this role
        // can read nothing anywhere" would prove nothing about these six.
        const control = await client.query("select count(*)::int n from clara.client_fact_keys");
        assert.ok(control.rows[0].n > 0,
          "the impersonated session CAN read clara.client_fact_keys -- so the six zeros above are the RLS wall, not a dead session");
      });
    }
  });
