// P4 tranche-1 -- ask 1: clara.claim_identity / clara._claim_identity_core. The door that closes
// the §3 identity gap: a completed Supabase session with no clara.users row must be able to mint
// one, keyed on jwt_sub(), email read ONLY from the JWT claim.

import test from "node:test";
import assert from "node:assert/strict";
import { AGENT_USER_ID, CLR, PG, assertRaises, opk, rootQuery, roleQuery, humanQuery } from "./rig-helpers.mjs";
import { claimIdentity, freshPersona } from "./p4t1-fixtures.mjs";

test("p4t1.identity: an unauthenticated call (no jwt_sub) refuses CLR04", async () => {
  await assertRaises(
    CLR.authz,
    () => roleQuery("clara_authenticated", "select clara.claim_identity(p_display_name => $1, p_op_key => $2)", ["X", opk("noauth")]),
    "claim_identity with no jwt_sub",
  );
});

test("p4t1.identity: a blank op_key refuses CLR10", async () => {
  const p = freshPersona("blankop");
  await assertRaises(CLR.badRequest, () => claimIdentity(p.sub, p.email, { displayName: "A B", opKey: "" }), "claim_identity blank op_key");
});

test("p4t1.identity: a blank display name refuses CLR10", async () => {
  const p = freshPersona("blankname");
  await assertRaises(CLR.badRequest, () => claimIdentity(p.sub, p.email, { displayName: "   ", opKey: opk("blankname") }), "claim_identity blank name");
});

test("p4t1.identity: the fixed agent identity cannot claim a session (CLR04)", async () => {
  await assertRaises(
    CLR.authz,
    () => claimIdentity(AGENT_USER_ID, "agent@rig.test", { displayName: "Agent Imposter", opKey: opk("agentclaim") }),
    "claim_identity as the agent id",
  );
});

test("p4t1.identity: a fresh persona mints exactly one clara.users row, id=sub, email from the JWT claim (never an argument)", async () => {
  const p = freshPersona("mint");
  const result = await claimIdentity(p.sub, p.email, { displayName: "Priya Applicant", opKey: opk("mint") });
  assert.equal(result.user_id, p.sub);
  assert.equal(result.display_name, "Priya Applicant");

  const row = await rootQuery("select id, display_name, email, is_agent from clara.users where id = $1", [p.sub]);
  assert.equal(row.rows.length, 1, "expected exactly one clara.users row");
  assert.equal(row.rows[0].display_name, "Priya Applicant");
  assert.equal(row.rows[0].email, p.email, "email must come from the JWT claim, not be guessable/blank");
  assert.equal(row.rows[0].is_agent, false);
});

test("p4t1.identity: re-calling with the SAME email is idempotent and refreshes display_name", async () => {
  const p = freshPersona("idem");
  await claimIdentity(p.sub, p.email, { displayName: "First Name", opKey: opk("idem1") });
  await claimIdentity(p.sub, p.email, { displayName: "Second Name", opKey: opk("idem2") });
  const row = await rootQuery("select display_name, email from clara.users where id = $1", [p.sub]);
  assert.equal(row.rows.length, 1, "re-claiming must not create a second row");
  assert.equal(row.rows[0].display_name, "Second Name");
  assert.equal(row.rows[0].email, p.email);
});

test("p4t1.identity: re-calling with a DIFFERENT email refuses CLR10 (the row is not silently reassigned)", async () => {
  const p = freshPersona("mismatch");
  await claimIdentity(p.sub, p.email, { displayName: "Original", opKey: opk("mismatch1") });
  await assertRaises(
    CLR.badRequest,
    () => claimIdentity(p.sub, "someone-else@rig.test", { displayName: "Original", opKey: opk("mismatch2") }),
    "claim_identity email-mismatch re-claim",
  );
  const row = await rootQuery("select email from clara.users where id = $1", [p.sub]);
  assert.equal(row.rows[0].email, p.email, "the original email must survive the refused re-claim");
});

test("p4t1.identity: [F2] a JWT with no email claim refuses CLR04 -- it must never fail open into a NULL-email, permanently-wedged row", async () => {
  const p = freshPersona("noemail");
  // humanQuery (rig-helpers) sets request.jwt.claims to exactly {sub, role} -- no email key at
  // all, the real shape of a session whose provider never populated the claim.
  await assertRaises(
    CLR.authz,
    () => humanQuery(p.sub, "select clara.claim_identity(p_display_name => $1, p_op_key => $2)", ["No Email", opk("noemail")]),
    "claim_identity with a JWT carrying no email claim",
  );
  const row = await rootQuery("select 1 from clara.users where id = $1", [p.sub]);
  assert.equal(row.rows.length, 0, "a refused claim must not leave a NULL-email row behind");
});

test("p4t1.identity: [F3] the stored email is lowercase regardless of the JWT claim's casing", async () => {
  const p = freshPersona("mixedcase");
  const mixed = `Mixed.Case.${p.sub.slice(0, 8)}@Rig.Test`;
  await claimIdentity(p.sub, mixed, { displayName: "Case Test", opKey: opk("mixedcase") });
  const row = await rootQuery("select email from clara.users where id = $1", [p.sub]);
  assert.equal(row.rows[0].email, mixed.toLowerCase(), "clara.users.email must be lowercase no matter how the JWT spelled it");
});

test("p4t1.identity: [N1] a LEGACY mixed-case stored email still matches on re-claim -- the comparison is case-insensitive, not just the write side", async () => {
  const p = freshPersona("legacycase");
  const legacyMixed = `Legacy.${p.sub.slice(0, 8)}@Rig.Test`;
  // Simulate a row written before F3 normalized storage: insert directly as root with the
  // RAW-CASE email, bypassing claim_identity (and its lower()) entirely.
  await rootQuery("insert into clara.users (id, display_name, email, is_agent) values ($1, $2, $3, false)", [
    p.sub,
    "Legacy Name",
    legacyMixed,
  ]);
  // Re-claim through the real door with the JWT's own (always-lowercased) email -- must succeed
  // and refresh display_name, not refuse "identity already claimed with a different email".
  const result = await claimIdentity(p.sub, legacyMixed.toLowerCase(), {
    displayName: "Legacy Name Refreshed",
    opKey: opk("legacycase"),
  });
  assert.equal(result.user_id, p.sub);
  const row = await rootQuery("select display_name, email from clara.users where id = $1", [p.sub]);
  assert.equal(row.rows[0].display_name, "Legacy Name Refreshed", "the re-claim must succeed and refresh display_name, not refuse");
  assert.equal(row.rows[0].email, legacyMixed, "the STORED legacy row's email is untouched by a matching re-claim -- only display_name updates");
});

test("p4t1.identity: an email already claimed by a DIFFERENT identity refuses cleanly (unique_violation -> CLR10, not a raw 23505)", async () => {
  const shared = `p4t1_shared_${Date.now()}@rig.test`;
  const p1 = freshPersona("shareA");
  const p2 = freshPersona("shareB");
  await claimIdentity(p1.sub, shared, { displayName: "Holder", opKey: opk("shareA") });
  await assertRaises(
    CLR.badRequest,
    () => claimIdentity(p2.sub, shared, { displayName: "Claimant", opKey: opk("shareB") }),
    "claim_identity cross-identity email collision",
  );
});

test("p4t1.identity: PUBLIC and the agent-read role hold no EXECUTE on claim_identity or its core", async () => {
  await assertRaises(
    PG.insufficientPrivilege,
    () => roleQuery("clara_agent_ro", "select clara.claim_identity(p_display_name => $1, p_op_key => $2)", ["X", opk("agentro")]),
    "clara_agent_ro calling claim_identity",
  );
  const r = await rootQuery(
    "select has_function_privilege('public', 'clara.claim_identity(text,text)'::regprocedure, 'execute') as ok",
  );
  assert.equal(r.rows[0].ok, false);
  const core = await rootQuery(
    "select has_function_privilege('clara_authenticated', 'clara._claim_identity_core(uuid,text,text)'::regprocedure, 'execute') as ok",
  );
  assert.equal(core.rows[0].ok, false, "_claim_identity_core must stay ungranted even to clara_authenticated");
});
