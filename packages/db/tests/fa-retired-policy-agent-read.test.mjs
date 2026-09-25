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
import { register } from "tsx/esm/api";
import assert from "node:assert/strict";
import {
  gate1092, p932Client, setFaPolicy, retireFaPolicy, policyRows,
  rootQuery, endPool, printLaneNotes, printSkipCount, x41EnsureReady, skip41,
  faWorld, faRow, buyAsset, completeSL, mon, dayIn,
  mintWake, wakeQuery, assertRaises, ROLES, PG, COST,
} from "./fa-retired-policy-agent-read-fixtures.mjs";

register();
const proposalLib = await import("../../runtime/lib/fa-particulars-proposal.ts");

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

// ===========================================================================================
// fp.read — AC2, THE GROUND READ ITSELF. `FA_RETIRED_ACCOUNT_POLICY_SQL` is the statement the
// successor's input-loading step runs; this cell runs THAT string (imported, never a copy of it)
// under the real clara_agent_ro wake credential.
// ===========================================================================================

test("fp.read AC2 — the ground read returns the account's NEWEST retired policy, and returns NOTHING while a live version supersedes it", async (t) => {
  if (await shut(t)) return;
  const SQL = proposalLib.FA_RETIRED_ACCOUNT_POLICY_SQL;
  const cred = await mintWake({ kind: "interactive", firm: w.firms.A });
  const read = (client) => wakeQuery(ROLES.agentRo, cred.secret, SQL, [client, COST]);

  // (a) THE ORDINARY CASE. One policy, set and then retired: the account reverts to "no policy",
  // the birth trigger parks the question, and THIS is the ground the question's proposal wants.
  const plain = await p932Client("read_plain");
  await setFaPolicy(w.users.bob, { client: plain, method: "straight_line", usefulLifeMonths: 96 });
  await retireFaPolicy(w.users.bob, { client: plain, reason: "the account stops being depreciated this way" });
  const one = await read(plain);
  assert.equal(one.rowCount, 1, "the retired policy is readable under the runtime read credential");
  assert.deepEqual(
    proposalLib.mapRetiredAccountPolicyRow(one.rows[0]),
    { assetAccount: COST, version: 1, method: "straight_line", usefulLifeMonths: 96, rateBps: null },
    "mapped, it carries EXACTLY what the person signed — from an independent expected literal");

  // (b) SEVERAL RETIRED VERSIONS: the NEWEST is the one a person last signed, and the read takes
  // it. (Set -> retire -> set -> retire leaves versions 1 and 2, both retired.)
  const twice = await p932Client("read_twice");
  await setFaPolicy(w.users.bob, { client: twice, method: "straight_line", usefulLifeMonths: 36 });
  await retireFaPolicy(w.users.bob, { client: twice, reason: "first try" });
  await setFaPolicy(w.users.bob, { client: twice, method: "reducing_balance", usefulLifeMonths: 60, rateBps: 2000 });
  await retireFaPolicy(w.users.bob, { client: twice, reason: "second try" });
  const versions = (await policyRows(twice)).map((r) => [r.version, r.active]);
  assert.deepEqual(versions, [[2, false], [1, false]], "two retired versions, none live");
  assert.deepEqual(
    proposalLib.mapRetiredAccountPolicyRow((await read(twice)).rows[0]),
    { assetAccount: COST, version: 2, method: "reducing_balance", usefulLifeMonths: 60, rateBps: 2000 },
    "version 2, the last thing a person signed — never the older version 1");

  // (c) THE HONESTY GUARD. `clara.set_fa_depreciation_policy` is version-forward: setting again
  // retires version 1 and inserts a LIVE version 2. A register row that was already pending when
  // version 2 landed still opens a question, and proposing from the SUPERSEDED version 1 would put
  // a judgement the person has since replaced onto a form, under a sentence claiming they signed
  // it. The read supplies nothing at all here.
  const superseded = await p932Client("read_superseded");
  await setFaPolicy(w.users.bob, { client: superseded, method: "straight_line", usefulLifeMonths: 48 });
  await setFaPolicy(w.users.bob, { client: superseded, method: "straight_line", usefulLifeMonths: 120 });
  const both = (await policyRows(superseded)).map((r) => [r.version, r.active]);
  assert.deepEqual(both, [[2, true], [1, false]], "version 1 retired underneath a LIVE version 2");
  assert.equal((await read(superseded)).rowCount, 0,
    "the retired version 1 grounds nothing while a live version 2 speaks for the account");
  assert.equal(proposalLib.mapRetiredAccountPolicyRow((await read(superseded)).rows[0]), null,
    "and the mapper turns that empty result into no ground, not into a half-filled one");

  // (d) VACUITY CONTROL for (c): the SAME statement with its supersession guard stripped DOES
  // return the superseded version 1. The guard, not luck, is what suppresses it — and the stripped
  // statement is built from the real one by deleting exactly that clause, so this control cannot
  // drift away from the subject.
  const stripped = SQL.replace(/\s+and not exists \([^;]*?q\.active\)/, "");
  assert.notEqual(stripped, SQL, "the guard clause was actually found and removed");
  const unguarded = await wakeQuery(ROLES.agentRo, cred.secret, stripped, [superseded, COST]);
  assert.equal(unguarded.rowCount, 1, "without the guard the superseded version 1 comes back");
  assert.equal(unguarded.rows[0].version, 1);

  // (e) AN ACCOUNT THAT NEVER HAD A POLICY grounds nothing, and says so as an empty result rather
  // than as an error.
  const never = await p932Client("read_never");
  assert.equal((await read(never)).rowCount, 0);
});

// ===========================================================================================
// fp.ground — AC3, END TO END. Real doors -> a real register -> the real read under the real
// credential -> the real mapper -> the real deriver. `deriveFaParticularsProposal` is IMPORTED
// rather than restated: this cell is precisely about proving the NEW code (the grant, the read,
// the mapper) assembles with the ALREADY proven ranking, so importing the deriver trivializes
// nothing.
// ===========================================================================================

test("fp.ground AC3 — an account whose only policy is RETIRED grounds the pending row's proposal on it, outranking the account's own disagreeing completed sibling", async (t) => {
  if (await shut(t)) return;
  const client = await p932Client("ground");

  // (1) THE SIBLING, born before any policy existed and completed BY HAND at straight line over 24
  // months. Were the retired policy absent this is what would ground the proposal — so the two
  // grounds below are in real tension, and the outcome is not vacuously true.
  const first = await buyAsset({ client, cents: 500_000, postingDate: dayIn(mon(-4), 8) });
  await completeSL(client, first.asset.id, { life: 24, start: dayIn(mon(-4), 8), description: "Lathe" });

  // (2) THE POLICY a person of the firm signed for THIS account, and then retired.
  await setFaPolicy(w.users.bob, {
    client, method: "reducing_balance", usefulLifeMonths: 60, rateBps: 2500,
    reason: "the controller's standing basis for plant on this account",
  });
  await retireFaPolicy(w.users.bob, { client, reason: "we stopped defaulting new plant, each is judged on its own" });

  // (3) THE PENDING ROW the question opens for: no live policy, so the birth trigger parks it.
  const second = await buyAsset({ client, cents: 800_000, postingDate: dayIn(mon(-1), 3) });
  const pending = await faRow(second.asset.id);
  assert.equal(pending.depreciation_method, null, "the new acquisition is born PENDING — a question opens");
  assert.equal(pending.depreciation_policy_id, null, "…and is born from no policy, because none is live");

  // (4) THE READ, under the runtime read credential, exactly as the successor step will run it.
  const cred = await mintWake({ kind: "interactive", firm: w.firms.A });
  const rows = await wakeQuery(ROLES.agentRo, cred.secret,
    proposalLib.FA_RETIRED_ACCOUNT_POLICY_SQL, [client, COST]);
  const retiredPolicy = proposalLib.mapRetiredAccountPolicyRow(rows.rows[0]);
  assert.deepEqual(retiredPolicy,
    { assetAccount: COST, version: 1, method: "reducing_balance", usefulLifeMonths: 60, rateBps: 2500 },
    "the ground carries exactly what the person signed");

  // (5) THE INPUTS, read off the REAL register rows (the facts v4's own register read gathers),
  // never invented here.
  const reg = await rootQuery(
    `select id, coalesce(description,'') as description, cost_cents,
            (accum_depr_account_code is null) as non_depreciable, asset_account_code,
            acquired_date::text as acquired_date, depreciation_method, useful_life_months,
            depreciation_rate_bps, depreciation_start_date is not null as started
       from clara.fixed_assets where client_id = $1 and superseded_at is null order by created_at`,
    [client]);
  assert.equal(reg.rowCount, 2, "two register rows: the completed sibling and the pending one");
  const [sibRow, pendRow] = reg.rows;
  const asset = {
    assetId: pendRow.id, description: pendRow.description, costCents: Number(pendRow.cost_cents),
    nonDepreciable: pendRow.non_depreciable, particularsComplete: false,
    assetAccount: pendRow.asset_account_code, acquiredDate: pendRow.acquired_date,
  };
  const siblings = [{
    assetAccount: sibRow.asset_account_code, particularsComplete: true,
    method: sibRow.depreciation_method, usefulLifeMonths: sibRow.useful_life_months,
    rateBps: sibRow.depreciation_rate_bps,
  }];
  assert.deepEqual(
    { m: siblings[0].method, l: siblings[0].usefulLifeMonths }, { m: "straight_line", l: 24 },
    "the sibling really does disagree with the retired policy");

  // (6) THE PROPOSAL.
  const proposal = proposalLib.deriveFaParticularsProposal({ asset, siblings, retiredPolicy });
  assert.ok(proposal, "a pending row on a policy-less account earns a proposal");
  assert.deepEqual(proposal.basis, ["retired_account_policy", "acquisition_date", "firm_default_residual"],
    "the retired policy grounds it, and account_siblings is not even named");
  assert.equal(proposal.method, "reducing_balance");
  assert.equal(proposal.useful_life_months, 60, "the policy's own 60 months, not the sibling's 24");
  assert.equal(proposal.rate_bps, 2500);
  assert.equal(proposal.start_date, dayIn(mon(-1), 3), "the in-service date is the acquisition's own posting date");
  assert.match(proposal.reason, /has no live default policy, but the one a person of this firm signed for it \(version 1\) and later retired/,
    "the reason names the ground AND its version, and says it was retired");

  // (7) THE CONTROL: the SAME asset and sibling with the ground withheld fall to account_siblings
  // at 24 months — so (6) is a real reversal, not two independently-true proposals.
  const withoutGround = proposalLib.deriveFaParticularsProposal({ asset, siblings });
  assert.deepEqual(withoutGround.basis, ["account_siblings", "acquisition_date", "firm_default_residual"]);
  assert.equal(withoutGround.useful_life_months, 24);
});
