// #1092 [0346] — THE RUNTIME READ CREDENTIAL REACHES A RETIRED DEFAULT DEPRECIATION POLICY, SO
// THE FIXED-ASSET PARTICULARS PROPOSAL'S `retired_account_policy` GROUND CAN FIRE.
//
// SEAMS THIS BATTERY DRIVES (written down before the first test, per work order rule 4 — the list
// is reproduced verbatim in this ticket's report):
//   1. the WALL on clara.fa_account_depreciation_policies — what the runtime read credential
//      (clara_agent_ro, minted through clara.mint_wake_credential exactly as `readScoped` mints
//      it) may and may not do with that relation, driven through the credential itself;
//   2. the GROUND READ — `FA_RETIRED_ACCOUNT_POLICY_SQL`, exported from the non-frozen
//      packages/runtime/lib/fa-particulars-proposal.ts so the statement has ONE home, run under
//      that credential;
//   3. `mapRetiredAccountPolicyRow` — the raw row -> FaProposalRetiredPolicy mapping (its pure
//      cells live beside the rest of the module's pure cells, in
//      packages/runtime/tests/fa-particulars-proposal-unit.test.mjs);
//   4. `deriveFaParticularsProposal` — ALREADY built, ranked and tested by #933 and NOT changed
//      here; used as the assembly seam AC3 names.
//
// EVERY WRITE UNDER TEST RUNS THROUGH A PERSONA (DECISIONS §1.10): the policies are set and
// retired through `clara.set_fa_depreciation_policy` / `clara.retire_fa_depreciation_policy` as a
// real bookkeeper. `rootQuery` appears only as a READBACK, and the wake-scoped agent read appears
// only as a READ.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  gate1092, p932Client, setFaPolicy, retireFaPolicy, policyRows,
  rootQuery, endPool, printLaneNotes, printSkipCount, x41EnsureReady, skip41,
  faWorld, mintWake, wakeQuery, assertRaises, ROLES, PG, COST,
} from "./fa-retired-policy-agent-read-fixtures.mjs";

let live = false;
let w = null;

before(async () => {
  live = await x41EnsureReady();
  if (live) w = await faWorld();
});

after(async () => {
  printLaneNotes("fa-retired-policy-agent-read");
  printSkipCount("fa-retired-policy-agent-read");
  await endPool();
});

/** Rig readiness first (the x41 world), then 0346's own frontier. */
const shut = async (t) => (skip41(t, live, "the #1092 retired-policy agent-read battery") ? true : await gate1092(t));

// ===========================================================================================
// fp.wall — AC1. WHAT THE RUNTIME READ CREDENTIAL MAY AND MAY NOT DO WITH THE RELATION.
// ===========================================================================================

test("fp.wall AC1 — clara_agent_ro reads its OWN firm's depreciation policies under a real wake credential, reads another firm's not at all, and holds no write privilege of any kind", async (t) => {
  if (await shut(t)) return;

  // (a) THE CATALOG POSTURE. SELECT and only SELECT — asserted for every DML verb by name, so a
  // future migration that granted one of them fails HERE rather than in production.
  const acl = await rootQuery(
    `select has_table_privilege('clara_agent_ro','clara.fa_account_depreciation_policies','SELECT') as sel,
            has_table_privilege('clara_agent_ro','clara.fa_account_depreciation_policies','INSERT') as ins,
            has_table_privilege('clara_agent_ro','clara.fa_account_depreciation_policies','UPDATE') as upd,
            has_table_privilege('clara_agent_ro','clara.fa_account_depreciation_policies','DELETE') as del,
            has_table_privilege('clara_agent_ro','clara.fa_account_depreciation_policies','TRUNCATE') as trunc`);
  assert.deepEqual(acl.rows[0], { sel: true, ins: false, upd: false, del: false, trunc: false },
    "the runtime read credential holds SELECT and nothing else on the policy relation");

  // (b) THE POLICY ITSELF is a READ policy for clara_agent_ro, scoped by the wake credential's own
  // firm — the SAME shape p_fixed_assets_agent gives the register these rows are a default FOR.
  const pol = await rootQuery(
    `select p.polcmd, pg_get_expr(p.polqual, p.polrelid) as qual,
            (select array_agg(r.rolname::text order by r.rolname) from pg_roles r where r.oid = any(p.polroles)) as roles
       from pg_policy p
      where p.polrelid = 'clara.fa_account_depreciation_policies'::regclass and p.polname = 'p_fadp_agent'`);
  assert.equal(pol.rowCount, 1, "p_fadp_agent exists");
  assert.equal(pol.rows[0].polcmd, "r", "it is a SELECT policy");
  assert.deepEqual(pol.rows[0].roles, ["clara_agent_ro"], "it names the runtime read role alone");
  assert.equal(pol.rows[0].qual, "(firm_id = clara.wake_firm())",
    "tenancy and nothing else — byte for byte the estate's own agent-read predicate");

  // (c) DRIVEN. A real client of firm A, a real policy set and then retired through the two human
  // doors, read back under a real wake credential presented as clara_agent_ro.
  const client = await p932Client("wall");
  await setFaPolicy(w.users.bob, { client, method: "straight_line", usefulLifeMonths: 120 });
  await retireFaPolicy(w.users.bob, { client, reason: "the rig retires it so the agent has something retired to read" });
  const written = await policyRows(client);
  assert.equal(written.length, 1, "one policy row exists on the account");
  assert.equal(written[0].active, false, "and it is retired");

  const cred = await mintWake({ kind: "interactive", firm: w.firms.A });
  const mine = await wakeQuery(ROLES.agentRo, cred.secret,
    `select version, active, method, useful_life_months
       from clara.fa_account_depreciation_policies
      where client_id = $1::uuid and asset_account_code = $2 order by version`, [client, COST]);
  assert.equal(mine.rowCount, 1, "the runtime read credential can see the row at all");
  assert.deepEqual(
    { version: mine.rows[0].version, active: mine.rows[0].active,
      method: mine.rows[0].method, life: mine.rows[0].useful_life_months },
    { version: 1, active: false, method: "straight_line", life: 120 },
    "and it carries exactly what the person signed, from an independent expected literal");

  // (d) FIRM-WALLED. A credential minted for ANOTHER firm reads nothing for this client, because
  // clara.wake_firm() binds firm_id and this relation has no client-only escape hatch.
  const foreign = await mintWake({ kind: "interactive", firm: w.firms.B });
  const theirs = await wakeQuery(ROLES.agentRo, foreign.secret,
    "select id from clara.fa_account_depreciation_policies where client_id = $1::uuid", [client]);
  assert.equal(theirs.rowCount, 0, "another firm's wake credential reads nothing for this client");

  // (e) NO WRITE, BELT AND GRANT. The wall is the GRANT, so the read_only belt is unbuckled first
  // (rig-isolation T3's own technique) and the refusal must still be 42501.
  await assertRaises(PG.insufficientPrivilege, () => wakeQuery(ROLES.agentRo, cred.secret,
    "set default_transaction_read_only = off", []).then(() => wakeQuery(ROLES.agentRo, cred.secret,
    "update clara.fa_account_depreciation_policies set method = 'none' where client_id = $1::uuid", [client])),
  "clara_agent_ro UPDATE on clara.fa_account_depreciation_policies");
  await assertRaises(PG.insufficientPrivilege, () => wakeQuery(ROLES.agentRo, cred.secret,
    "delete from clara.fa_account_depreciation_policies where client_id = $1::uuid", [client]),
  "clara_agent_ro DELETE on clara.fa_account_depreciation_policies");
});
