// F-A3 PR-1b -- the thirteen WAKE SIBLING VERBS battery (the granted-wrapper layer §K/§L build).
//
// CONTRACT-BLIND: written from docs/plan/active/bank-agency-design.md v2 + annexes-1..3 (Annex
// A.1 signatures, Annex B the full ladder, Annex H the battery), never from the migration's own
// SQL text. Companion to f-a3-pr1b-agent-limb.test.mjs (the ten CoR'd bodies + seven DDL groups,
// called by hand-built ctx); THIS file calls the real wake_* wrappers through a REAL minted
// credential (wakeQuery, rig-helpers.mjs's own Slice-2 impersonation primitive), so a wrapper
// argument-name mismatch or a missing grant is a finding here, not smoothed over by a direct
// core call.
//
// Cells, in file order: Tier-A (H.2) a-g -- no credential, wrong-kind credential, blank shape,
// cross-firm client, the hold, the ACL cell (a non-bank wake role cannot execute a bank wrapper --
// material M4, genuinely differentiated: a live 42501, not app logic), replay idempotency;
// Tier-B (H.3) h-n -- M14 (unmatch), M15 (void_bank_statement), M3/M4/M4-negative/M5/M6 (the four
// genuinely novel rungs, no precedent anywhere in the estate -- see the migration's own §K.5
// header for the documented minimal-implementation disclosure); H.7 catalog o.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  rootQuery, humanQuery, opk,
  endPool, printLaneNotes, printSkipCount, noteLane, markSkip,
  a21EnsureReady, buildWorld, firmOf,
  upsertAccountClassed, upsertPayableAccount, grantConsent,
  idOf,
} from "./a21-helpers.mjs";
import {
  BANKCOA1, AR1, AP1, EXPN, REVN,
  hasBankMatching, caught,
  addBankAccount, enterStatement, matchBankLine,
} from "./x38-match-fixtures.mjs";
import { wakeQuery, roleQuery, ROLES } from "./rig-helpers.mjs";
import { WAKE_ROLE, RATIONALE, MODEL, mintCred, callWrapper, approvedEntry, realDigest } from "./f-a3-pr1b-wake-fixtures.mjs";

let ready38 = false;
let hasWakeVerbs = false;
let hasPurpose = false;
let world = null;
let bankAcct = null;

function skipHere(t) {
  if (!ready38 || !hasWakeVerbs) {
    markSkip();
    t.skip("F-A3 PR-1b wake-verb wrapper surface not present -- dormant");
    return true;
  }
  return false;
}

/** MANDATORY PRE-PR GATE (carried in every settle-event since it was found): PR-1c is what
 *  widens client_egress_purpose_consents/_activations' `purpose` CHECK (and CoRs the four purpose
 *  verbs) to admit 'bank_matching' -- today's CHECK admits only {wiki_synthesis,
 *  statement_extraction, witness_extraction}. Until PR-1c lands, _agent_bank_tier_a's own
 *  purpose_unconsented rung refuses EVERY bank_agent call before it can reach any Tier-B logic,
 *  so every cell below that needs a real consent+activation SKIPS here, named and counted --
 *  never a fabricated stand-in for PR-1c's real shape, mirroring the wake_credentials
 *  close_prep gate's exact discipline. Re-run this file once PR-1c is merged: hasPurpose flips
 *  true and every skipPurpose() cell un-skips with no code change. */
function skipPurpose(t) {
  if (skipHere(t)) return true;
  if (!hasPurpose) {
    markSkip();
    t.skip("PRE-PR GATE: PR-1c has not widened the egress-purpose CHECK/verbs to admit 'bank_matching' yet -- every bank_agent call refuses purpose_unconsented before reaching Tier-B; named, counted skip (mirrors the close_prep gate)");
    return true;
  }
  return false;
}

before(async () => {
  const ready = await a21EnsureReady();
  ready38 = Boolean(ready.base && ready.has16 && (await hasBankMatching()));
  if (!ready38) { noteLane("bank matching surface absent -- f-a3-pr1b wake-verbs suite dormant"); return; }
  const r = await rootQuery(
    `select (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
       where n.nspname='clara' and p.proname='wake_unmatch_bank_match' limit 1) as fn,
     (select 1 from pg_roles where rolname='clara_wake_bank_login') as login`);
  hasWakeVerbs = r.rows[0]?.fn != null && r.rows[0]?.login != null;
  if (!hasWakeVerbs) { noteLane("F-A3 PR-1b wake-verb wrapper surface absent -- suite dormant"); return; }
  world = await buildWorld();
  bankAcct = {};
  for (const key of ["A1"]) {
    const client = world.clients[key];
    const sub = world.users.alice;
    await upsertAccountClassed(sub, { client, code: BANKCOA1, name: "Maybank current (f31w)", type: "asset", opKey: opk("f31w-bcoa1") });
    await upsertAccountClassed(sub, { client, code: AR1, name: "Trade Debtors (f31w)", type: "asset", accountClass: "receivable", opKey: opk("f31w-ar1") });
    await upsertPayableAccount(sub, { client, code: AP1, name: "Trade Creditors (f31w)", opKey: opk("f31w-ap1") });
    await upsertAccountClassed(sub, { client, code: EXPN, name: "Prof Fees (f31w)", type: "expense", opKey: opk("f31w-exp") });
    await upsertAccountClassed(sub, { client, code: REVN, name: "Revenue (f31w)", type: "income", opKey: opk("f31w-rev") });
    await grantConsent(sub, { firm: await firmOf(client), client }).catch(() => {});
    const a = await addBankAccount(sub, { client, coaAccountCode: BANKCOA1, accountNumber: `1099${key}${randomUUID().slice(0, 6)}` });
    bankAcct[key] = { primary: idOf(a, "bank_account_id", "id") };
  }
  // hasPurpose: does the LIVE CHECK admit 'bank_matching' yet (PR-1c)? If so, grant+activate it
  // for A1 via a raw INSERT -- deliberately NOT through clara.grant_client_egress_purpose/
  // activate_client_egress_purpose, which each carry their OWN in-body enum raise (`unknown
  // egress purpose`) independent of the table CHECK and are PR-1c's own CoR, not this file's to
  // pre-empt; a raw insert (the same test-fixture-shortcut precedent as f31b.l's direct
  // bank_matches row) reaches only the TABLE the widened CHECK governs.
  const purposeCheck = await rootQuery(
    `select pg_get_constraintdef(oid) as def from pg_constraint
       where conrelid='clara.client_egress_purpose_consents'::regclass and contype='c'
         and pg_get_constraintdef(oid) like '%purpose = ANY%'`);
  hasPurpose = Boolean(purposeCheck.rows[0]?.def?.includes("bank_matching"));
  if (hasPurpose) {
    const firm = await firmOf(world.clients.A1);
    const { consentEvidenceDoc } = await import("./wave-b/wb-0020-helpers.mjs");
    const evidence = await consentEvidenceDoc(world.users.alice, { firm });
    const consent = await rootQuery(
      `insert into clara.client_egress_purpose_consents(firm_id, client_id, purpose, scope_note, evidence_document_id, granted_by)
         values ($1,$2,'bank_matching','f31w test consent',$3,$4) returning id`,
      [firm, world.clients.A1, evidence.documentId, world.users.alice]);
    await rootQuery(
      `insert into clara.client_egress_purpose_activations(firm_id, client_id, purpose, consent_id, activated_by)
         values ($1,$2,'bank_matching',$3,$4)`,
      [firm, world.clients.A1, consent.rows[0].id, world.users.alice]);
  } else {
    noteLane("PRE-PR GATE: 'bank_matching' is not yet an admitted egress purpose (PR-1c) -- purpose-dependent cells will skip, named and counted");
  }
});

after(async () => {
  printLaneNotes("f-a3-pr1b-wake-verbs");
  printSkipCount("f-a3-pr1b-wake-verbs");
  await endPool();
});

// ===========================================================================
// Tier A (H.2)
// ===========================================================================
test("f31w.a no credential -> CLR03", async (t) => {
  if (skipHere(t)) return;
  const err = await caught(() => roleQuery(WAKE_ROLE,
    callWrapper("wake_unmatch_bank_match", [
      { name: "p_client", cast: "uuid" }, { name: "p_match", cast: "uuid" }, { name: "p_reason" },
      { name: "p_rationale" }, { name: "p_model", cast: "jsonb" }, { name: "p_inputs_digest" }, { name: "p_op_key" }]),
    [world.clients.A1, randomUUID(), "r", RATIONALE, JSON.stringify(MODEL), "d", opk("f31w-a")]));
  assert.ok(err, "no credential is refused");
  assert.equal(err?.code, "CLR03", `expected CLR03, got ${err?.code}: ${err?.message}`);
});

test("f31w.b a credential of a kind without the allowlist row -> CLR03", async (t) => {
  if (skipHere(t)) return;
  const firm = await firmOf(world.clients.A1);
  const cred = await mintCred("interactive_client", firm, world.clients.A1);
  const err = await caught(() => wakeQuery(WAKE_ROLE, cred.secret,
    callWrapper("wake_unmatch_bank_match", [
      { name: "p_client", cast: "uuid" }, { name: "p_match", cast: "uuid" }, { name: "p_reason" },
      { name: "p_rationale" }, { name: "p_model", cast: "jsonb" }, { name: "p_inputs_digest" }, { name: "p_op_key" }]),
    [world.clients.A1, randomUUID(), "r", RATIONALE, JSON.stringify(MODEL), "d", opk("f31w-b")]));
  assert.ok(err, "interactive_client cannot call a bank wrapper");
  assert.equal(err?.code, "CLR03", `expected CLR03, got ${err?.code}: ${err?.message}`);
});

test("f31w.c blank op_key / rationale / model -> typed CLR10", async (t) => {
  if (skipHere(t)) return;
  const firm = await firmOf(world.clients.A1);
  const cred = await mintCred("bank_agent", firm, world.clients.A1);
  const specs = [
    { name: "p_client", cast: "uuid" }, { name: "p_match", cast: "uuid" }, { name: "p_reason" },
    { name: "p_rationale" }, { name: "p_model", cast: "jsonb" }, { name: "p_inputs_digest" }, { name: "p_op_key" }];
  const noOpKey = await caught(() => wakeQuery(WAKE_ROLE, cred.secret, callWrapper("wake_unmatch_bank_match", specs),
    [world.clients.A1, randomUUID(), "r", RATIONALE, JSON.stringify(MODEL), "d", ""]));
  assert.equal(noOpKey?.code, "CLR10", "blank op_key -> CLR10");
  const noRationale = await caught(() => wakeQuery(WAKE_ROLE, cred.secret, callWrapper("wake_unmatch_bank_match", specs),
    [world.clients.A1, randomUUID(), "r", "", JSON.stringify(MODEL), "d", opk("f31w-c2")]));
  assert.equal(noRationale?.code, "CLR10", "blank rationale -> CLR10");
});

test("f31w.d cross-firm client -> CLR11", async (t) => {
  if (skipHere(t)) return;
  const firm = await firmOf(world.clients.A1);
  const cred = await mintCred("bank_agent", firm, world.clients.A1);
  const foreignClient = await rootQuery(
    `insert into clara.clients(id, firm_id, name, status) values (gen_random_uuid(),
       (select id from clara.firms where id <> $1 limit 1), 'F31W Foreign', 'active') returning id, firm_id`,
    [firm]).catch(() => null);
  if (!foreignClient?.rows?.length) { noteLane("f31w.d: no second firm on this rig -- structural skip"); return; }
  const err = await caught(() => wakeQuery(WAKE_ROLE, cred.secret,
    callWrapper("wake_unmatch_bank_match", [
      { name: "p_client", cast: "uuid" }, { name: "p_match", cast: "uuid" }, { name: "p_reason" },
      { name: "p_rationale" }, { name: "p_model", cast: "jsonb" }, { name: "p_inputs_digest" }, { name: "p_op_key" }]),
    [foreignClient.rows[0].id, randomUUID(), "r", RATIONALE, JSON.stringify(MODEL), "d", opk("f31w-d")]));
  assert.ok(err, "a credential pinned to A1 refuses a foreign client");
  assert.equal(err?.code, "CLR11", `expected CLR11, got ${err?.code}: ${err?.message}`);
});

test("f31w.e the hold: set_bank_agency_hold(on=true) then a bank wrapper refuses bank_agency_held", async (t) => {
  if (skipPurpose(t)) return;
  const firm = await firmOf(world.clients.A1);
  await humanQuery(world.users.alice,
    "select clara.set_bank_agency_hold($1,true,'f31w.e testing the brake',$2)",
    [world.clients.A1, opk("f31w-e-hold-on")]);
  const cred = await mintCred("bank_agent", firm, world.clients.A1);
  const err = await caught(() => wakeQuery(WAKE_ROLE, cred.secret,
    callWrapper("wake_unmatch_bank_match", [
      { name: "p_client", cast: "uuid" }, { name: "p_match", cast: "uuid" }, { name: "p_reason" },
      { name: "p_rationale" }, { name: "p_model", cast: "jsonb" }, { name: "p_inputs_digest" }, { name: "p_op_key" }]),
    [world.clients.A1, randomUUID(), "r", RATIONALE, JSON.stringify(MODEL), "d", opk("f31w-e")]));
  assert.ok(err, "the held lane refuses");
  noteLane(`f31w.e held refusal: ${err?.code} ${err?.message}`);
  await humanQuery(world.users.alice,
    "select clara.set_bank_agency_hold($1,false,'f31w.e releasing the brake',$2)",
    [world.clients.A1, opk("f31w-e-hold-off")]);
});

test("f31w.f the ACL cell (material M4): clara_wake_interactive cannot EXECUTE a bank wrapper at all", async (t) => {
  if (skipHere(t)) return;
  const err = await caught(() => roleQuery(ROLES.wakeInteractive,
    callWrapper("wake_unmatch_bank_match", [
      { name: "p_client", cast: "uuid" }, { name: "p_match", cast: "uuid" }, { name: "p_reason" },
      { name: "p_rationale" }, { name: "p_model", cast: "jsonb" }, { name: "p_inputs_digest" }, { name: "p_op_key" }]),
    [world.clients.A1, randomUUID(), "r", RATIONALE, JSON.stringify(MODEL), "d", opk("f31w-f")]));
  assert.ok(err, "clara_wake_interactive cannot execute a bank wrapper");
  assert.equal(err?.code, "42501", `expected 42501 insufficient_privilege, got ${err?.code}: ${err?.message}`);
});

test("f31w.g replay: the same op_key returns the stored receipt byte-identically", async (t) => {
  if (skipPurpose(t)) return;
  // A genuinely ADMITTED first call is required -- a refused-with-no-typed-reason call never
  // reaches _reserve_op's dedupe write at all (the whole attempt rolls back), so the SAME raise
  // fires twice rather than a replayed receipt. A clean statement voiding is the cheapest
  // guaranteed-admitted bank_agent act available.
  const firm = await firmOf(world.clients.A1);
  const stmt = await enterStatement(world.users.alice, {
    client: world.clients.A1, bankAccount: bankAcct.A1.primary,
    opening: 0, specs: [{ entryDate: "2026-07-20", amountCents: 100, description: "f31w.g clean" }],
  });
  const cred = await mintCred("bank_agent", firm, world.clients.A1);
  const digest = await realDigest(cred.secret, world.clients.A1, bankAcct.A1.primary, opk("f31w-g-pack"));
  const key = opk("f31w-g-replay");
  const specs = [
    { name: "p_client", cast: "uuid" }, { name: "p_statement", cast: "uuid" }, { name: "p_reason" },
    { name: "p_rationale" }, { name: "p_model", cast: "jsonb" }, { name: "p_inputs_digest" }, { name: "p_op_key" }];
  const vals = [world.clients.A1, stmt.statementId, "f31w.g void", RATIONALE, JSON.stringify(MODEL), digest, key];
  const first = await wakeQuery(WAKE_ROLE, cred.secret, callWrapper("wake_void_bank_statement", specs), vals);
  assert.notEqual(first.rows[0].r.status, "refused", `the first call must be admitted: ${JSON.stringify(first.rows[0].r)}`);
  const second = await wakeQuery(WAKE_ROLE, cred.secret, callWrapper("wake_void_bank_statement", specs), vals);
  assert.deepEqual(second.rows[0].r, first.rows[0].r, "the replayed op_key returns byte-identical stored receipt");
});

// ===========================================================================
// Tier B (H.3) -- M14, M15, and the four genuinely novel rungs
// ===========================================================================
test("f31w.h M14: an unmatch that a LATER complete reconciliation depends on refuses", async (t) => {
  if (skipPurpose(t)) return;
  const firm = await firmOf(world.clients.A1);
  const stmt = await enterStatement(world.users.alice, {
    client: world.clients.A1, bankAccount: bankAcct.A1.primary,
    opening: 0, specs: [{ entryDate: "2026-07-01", amountCents: 6600, description: "f31w.h deposit" }],
  });
  const line = stmt.lines[0].id;
  const entryId = await approvedEntry({
    client: world.clients.A1, actor: world.users.alice, postingDate: "2026-07-01",
    memo: "f31w.h entry", bankCoa: BANKCOA1, otherCoa: REVN, cents: 6600,
  });
  const match = await matchBankLine(world.users.alice, {
    client: world.clients.A1, lines: [line], entries: [{ entry_id: entryId, matched_cents: 6600 }],
  });
  // A synthetic LATER complete reconciliation on the SAME bank account (direct insert, root --
  // mirrors f31b.l's precedent of fabricating one FACT to test a wall in isolation). UNLIKE
  // f31b.l's target, `_tf_bank_recon_belt` re-derives and byte-compares the WHOLE canonical
  // snapshot at INSERT (belt clause 7) -- rig-replay-caught by this file's own battery, f31w.h --
  // so the row must carry clara._bank_recon_terms' OWN output verbatim, never hand-picked values.
  // laterStmt carries ZERO lines and opens at exactly `stmt`'s own closing (6600) -- a no-movement
  // statement that introduces nothing new to reconcile, so gl'/outstanding/excepted all land at
  // the SAME totals the already-matched 6600 already ties to (chainLines: 0 specs -> closing ==
  // opening, satisfying bank_statements' own `line_count=0 OR opening=closing` CHECK).
  const laterStmt = await enterStatement(world.users.alice, {
    client: world.clients.A1, bankAccount: bankAcct.A1.primary,
    opening: 6600, specs: [],
  });
  await rootQuery(
    `with cutoff as (select now() as ts), terms as (
       select clara._bank_recon_terms($4, cutoff.ts) as t from cutoff
     )
     insert into clara.bank_reconciliations(firm_id, client_id, bank_account_id, statement_id,
         coa_account_code, period_start, period_end, status,
         opening_cents, opening_anchor_cents, gl_balance_cents, closing_cents,
         outstanding_cents, excepted_cents, completed_by, completed_at, snapshot)
     select $1,$2,$3,$4,$5, st.period_start, st.period_end, 'complete',
       st.opening_cents, (terms.t->>'opening_anchor_cents')::bigint,
       (terms.t->>'gl_prime_cents')::bigint, st.closing_cents,
       (terms.t->>'outstanding_cents')::bigint, (terms.t->>'excepted_cents')::bigint,
       $6, cutoff.ts, (terms.t->'snapshot')
     from terms, cutoff, clara.bank_statements st where st.id = $4`,
    [firm, world.clients.A1, bankAcct.A1.primary, laterStmt.statementId, BANKCOA1, world.users.alice]);
  const cred = await mintCred("bank_agent", firm, world.clients.A1);
  const digestH = await realDigest(cred.secret, world.clients.A1, bankAcct.A1.primary, opk("f31w-h-pack"));
  const r = await wakeQuery(WAKE_ROLE, cred.secret,
    callWrapper("wake_unmatch_bank_match", [
      { name: "p_client", cast: "uuid" }, { name: "p_match", cast: "uuid" }, { name: "p_reason" },
      { name: "p_rationale" }, { name: "p_model", cast: "jsonb" }, { name: "p_inputs_digest" }, { name: "p_op_key" }]),
    [world.clients.A1, match.match_id, "f31w.h unmatch", RATIONALE, JSON.stringify(MODEL), digestH, opk("f31w-h")]);
  const res = r.rows[0].r;
  assert.equal(res.status, "refused", "M14 refuses the unmatch");
  assert.equal(res.reason, "later_reconciliation_depends", "the receipt names later_reconciliation_depends");
});

test("f31w.i M15: voiding a statement carrying a live match refuses; a clean statement she did not file voids", async (t) => {
  if (skipPurpose(t)) return;
  const firm = await firmOf(world.clients.A1);
  const stmt = await enterStatement(world.users.alice, {
    client: world.clients.A1, bankAccount: bankAcct.A1.primary,
    opening: 0, specs: [{ entryDate: "2026-07-05", amountCents: 4400, description: "f31w.i deposit" }],
  });
  const line = stmt.lines[0].id;
  const entryId = await approvedEntry({
    client: world.clients.A1, actor: world.users.alice, postingDate: "2026-07-05",
    memo: "f31w.i entry", bankCoa: BANKCOA1, otherCoa: REVN, cents: 4400,
  });
  await matchBankLine(world.users.alice, {
    client: world.clients.A1, lines: [line], entries: [{ entry_id: entryId, matched_cents: 4400 }],
  });
  const cred = await mintCred("bank_agent", firm, world.clients.A1);
  const digestI = await realDigest(cred.secret, world.clients.A1, bankAcct.A1.primary, opk("f31w-i-pack"));
  const specs = [
    { name: "p_client", cast: "uuid" }, { name: "p_statement", cast: "uuid" }, { name: "p_reason" },
    { name: "p_rationale" }, { name: "p_model", cast: "jsonb" }, { name: "p_inputs_digest" }, { name: "p_op_key" }];
  const r1 = await wakeQuery(WAKE_ROLE, cred.secret, callWrapper("wake_void_bank_statement", specs),
    [world.clients.A1, stmt.statementId, "f31w.i void", RATIONALE, JSON.stringify(MODEL), digestI, opk("f31w-i1")]);
  assert.equal(r1.rows[0].r.status, "refused", "M15 refuses voiding a statement with a live match");
  assert.equal(r1.rows[0].r.reason, "statement_has_live_matches");
  // The negative twin -- a clean statement (no match at all) voids, even one she did not file
  // (M15's own "never who acted" shape, §3.2's non-goal).
  const cleanStmt = await enterStatement(world.users.alice, {
    client: world.clients.A1, bankAccount: bankAcct.A1.primary,
    opening: 0, specs: [{ entryDate: "2026-07-06", amountCents: 100, description: "f31w.i clean" }],
  });
  const r2 = await wakeQuery(WAKE_ROLE, cred.secret, callWrapper("wake_void_bank_statement", specs),
    [world.clients.A1, cleanStmt.statementId, "f31w.i clean void", RATIONALE, JSON.stringify(MODEL), digestI, opk("f31w-i2")]);
  assert.notEqual(r2.rows[0].r.status, "refused", `a clean statement voids: ${JSON.stringify(r2.rows[0].r)}`);
});

test("f31w.j M3 (NEW): a second candidate entry tying the SAME amount refuses same_amount_ambiguous", async (t) => {
  if (skipPurpose(t)) return;
  const firm = await firmOf(world.clients.A1);
  const stmt = await enterStatement(world.users.alice, {
    client: world.clients.A1, bankAccount: bankAcct.A1.primary,
    opening: 0, specs: [{ entryDate: "2026-07-10", amountCents: 9900, description: "f31w.j deposit" }],
  });
  const line = stmt.lines[0].id;
  const chosenId = await approvedEntry({
    client: world.clients.A1, actor: world.users.alice, postingDate: "2026-07-10",
    memo: "f31w.j chosen", bankCoa: BANKCOA1, otherCoa: REVN, cents: 9900,
  });
  await approvedEntry({
    client: world.clients.A1, actor: world.users.alice, postingDate: "2026-07-10",
    memo: "f31w.j rival", bankCoa: BANKCOA1, otherCoa: REVN, cents: 9900,
  });
  const cred = await mintCred("bank_agent", firm, world.clients.A1);
  const digestJ = await realDigest(cred.secret, world.clients.A1, bankAcct.A1.primary, opk("f31w-j-pack"));
  const r = await wakeQuery(WAKE_ROLE, cred.secret,
    callWrapper("wake_match_bank_line", [
      { name: "p_client", cast: "uuid" }, { name: "p_lines", cast: "jsonb" }, { name: "p_entries", cast: "jsonb" },
      { name: "p_adjustments", cast: "jsonb" }, { name: "p_ack_period_exceptions" },
      { name: "p_rationale" }, { name: "p_model", cast: "jsonb" }, { name: "p_inputs_digest" }, { name: "p_op_key" }]),
    [world.clients.A1, JSON.stringify([line]), JSON.stringify([{ entry_id: chosenId, matched_cents: 9900 }]),
     null, false, RATIONALE, JSON.stringify(MODEL), digestJ, opk("f31w-j")]);
  const res = r.rows[0].r;
  assert.equal(res.status, "refused", "M3 refuses when a second candidate ties equally");
  assert.equal(res.rung_vector?.same_amount_ambiguous, "fail", "the vector names same_amount_ambiguous");
});

test("f31w.k/l M4 (NEW): a printed identifier for a DIFFERENT counterparty refuses; no identifier at all is not_evaluable", async (t) => {
  if (skipPurpose(t)) return;
  const firm = await firmOf(world.clients.A1);
  const chosenCp = await rootQuery(
    `insert into clara.counterparties(firm_id, client_id, kind, name, name_normalized, created_by)
       values ($1,$2,'customer','F31W Chosen Payer','f31wchosenpayer',$3) returning id`,
    [firm, world.clients.A1, world.users.alice]);
  await rootQuery(
    `insert into clara.counterparties(firm_id, client_id, kind, name, name_normalized, tin, created_by)
       values ($1,$2,'customer','F31W Other Payer','f31wotherpayer','201599887766',$3)`,
    [firm, world.clients.A1, world.users.alice]);
  const stmt = await enterStatement(world.users.alice, {
    client: world.clients.A1, bankAccount: bankAcct.A1.primary,
    opening: 0, specs: [{ entryDate: "2026-07-12", amountCents: 5500, description: "REF TIN 201599887766" }],
  });
  const cred = await mintCred("bank_agent", firm, world.clients.A1);
  const digestKL = await realDigest(cred.secret, world.clients.A1, bankAcct.A1.primary, opk("f31w-kl-pack"));
  const specs = [
    { name: "p_client", cast: "uuid" }, { name: "p_line", cast: "uuid" }, { name: "p_counterparty", cast: "uuid" },
    { name: "p_allocations", cast: "jsonb" }, { name: "p_memo" }, { name: "p_posting_date", cast: "date" },
    { name: "p_charge_cents", cast: "bigint" }, { name: "p_charge_account" }, { name: "p_adjustments", cast: "jsonb" },
    { name: "p_control_account" }, { name: "p_rationale" }, { name: "p_model", cast: "jsonb" },
    { name: "p_inputs_digest" }, { name: "p_op_key" }];
  const r1 = await wakeQuery(WAKE_ROLE, cred.secret, callWrapper("wake_settle_from_bank_line", specs),
    [world.clients.A1, stmt.lines[0].id, chosenCp.rows[0].id, JSON.stringify([{ open_item: randomUUID(), cents: 5500 }]),
     "f31w.k memo", null, 0, null, null, AR1, RATIONALE, JSON.stringify(MODEL), digestKL, opk("f31w-k")]);
  assert.equal(r1.rows[0].r.status, "refused", "M4 refuses a contradicting printed identifier");
  assert.equal(r1.rows[0].r.rung_vector?.payer_identifier_contradiction, "fail");

  const stmt2 = await enterStatement(world.users.alice, {
    client: world.clients.A1, bankAccount: bankAcct.A1.primary,
    opening: 0, specs: [{ entryDate: "2026-07-13", amountCents: 3300, description: "SALARY TRANSFER" }],
  });
  const r2 = await wakeQuery(WAKE_ROLE, cred.secret, callWrapper("wake_settle_from_bank_line", specs),
    [world.clients.A1, stmt2.lines[0].id, chosenCp.rows[0].id, JSON.stringify([{ open_item: randomUUID(), cents: 3300 }]),
     "f31w.l memo", null, 0, null, null, AR1, RATIONALE, JSON.stringify(MODEL), digestKL, opk("f31w-l")]);
  assert.equal(r2.rows[0].r.status, "refused", "with no identifier at all the vector is still non-empty");
  assert.equal(r2.rows[0].r.rung_vector?.payer_identifier_contradiction, "not_evaluable", "ARM-0: not_evaluable, never pass");
});

test("f31w.m M5 (NEW): a name-family collision (two ROME-like counterparties) refuses counterparty_collision", async (t) => {
  if (skipPurpose(t)) return;
  const firm = await firmOf(world.clients.A1);
  const cpA = await rootQuery(
    `insert into clara.counterparties(firm_id, client_id, kind, name, name_normalized, created_by)
       values ($1,$2,'customer','ROME PROPERTIES SDN BHD','romepropertiessdnbhd',$3) returning id`,
    [firm, world.clients.A1, world.users.alice]);
  await rootQuery(
    `insert into clara.counterparties(firm_id, client_id, kind, name, name_normalized, created_by)
       values ($1,$2,'customer','ROME SECRETARY SDN BHD','romesecretarysdnbhd',$3)`,
    [firm, world.clients.A1, world.users.alice]);
  const stmt = await enterStatement(world.users.alice, {
    client: world.clients.A1, bankAccount: bankAcct.A1.primary,
    opening: 0, specs: [{ entryDate: "2026-07-14", amountCents: 2200, description: "TRF ROME PAYMENT" }],
  });
  const cred = await mintCred("bank_agent", firm, world.clients.A1);
  const digestM = await realDigest(cred.secret, world.clients.A1, bankAcct.A1.primary, opk("f31w-m-pack"));
  const r = await wakeQuery(WAKE_ROLE, cred.secret,
    callWrapper("wake_settle_from_bank_line", [
      { name: "p_client", cast: "uuid" }, { name: "p_line", cast: "uuid" }, { name: "p_counterparty", cast: "uuid" },
      { name: "p_allocations", cast: "jsonb" }, { name: "p_memo" }, { name: "p_posting_date", cast: "date" },
      { name: "p_charge_cents", cast: "bigint" }, { name: "p_charge_account" }, { name: "p_adjustments", cast: "jsonb" },
      { name: "p_control_account" }, { name: "p_rationale" }, { name: "p_model", cast: "jsonb" },
      { name: "p_inputs_digest" }, { name: "p_op_key" }]),
    [world.clients.A1, stmt.lines[0].id, cpA.rows[0].id, JSON.stringify([{ open_item: randomUUID(), cents: 2200 }]),
     "f31w.m memo", null, 0, null, null, AR1, RATIONALE, JSON.stringify(MODEL), digestM, opk("f31w-m")]);
  assert.equal(r.rows[0].r.status, "refused", "M5 refuses on a name-family collision");
  assert.equal(r.rows[0].r.rung_vector?.counterparty_collision, "fail");
});

test("f31w.n M6 (NEW): an AR inflow with NO open item absorbing it refuses unexplained_inflow", async (t) => {
  if (skipPurpose(t)) return;
  const firm = await firmOf(world.clients.A1);
  const cp = await rootQuery(
    `insert into clara.counterparties(firm_id, client_id, kind, name, name_normalized, created_by)
       values ($1,$2,'customer','F31W M6 Customer','f31wm6customer',$3) returning id`,
    [firm, world.clients.A1, world.users.alice]);
  const stmt = await enterStatement(world.users.alice, {
    client: world.clients.A1, bankAccount: bankAcct.A1.primary,
    opening: 0, specs: [{ entryDate: "2026-07-16", amountCents: 6600, description: "UNKNOWN INFLOW" }],
  });
  const cred = await mintCred("bank_agent", firm, world.clients.A1);
  const digestN = await realDigest(cred.secret, world.clients.A1, bankAcct.A1.primary, opk("f31w-n-pack"));
  const r = await wakeQuery(WAKE_ROLE, cred.secret,
    callWrapper("wake_settle_from_bank_line", [
      { name: "p_client", cast: "uuid" }, { name: "p_line", cast: "uuid" }, { name: "p_counterparty", cast: "uuid" },
      { name: "p_allocations", cast: "jsonb" }, { name: "p_memo" }, { name: "p_posting_date", cast: "date" },
      { name: "p_charge_cents", cast: "bigint" }, { name: "p_charge_account" }, { name: "p_adjustments", cast: "jsonb" },
      { name: "p_control_account" }, { name: "p_rationale" }, { name: "p_model", cast: "jsonb" },
      { name: "p_inputs_digest" }, { name: "p_op_key" }]),
    // p_allocations = [] -- no open item absorbs the inflow.
    [world.clients.A1, stmt.lines[0].id, cp.rows[0].id, "[]",
     "f31w.n memo", null, 0, null, null, AR1, RATIONALE, JSON.stringify(MODEL), digestN, opk("f31w-n")]);
  assert.equal(r.rows[0].r.status, "refused", "M6 refuses an unabsorbed AR inflow");
  assert.equal(r.rows[0].r.rung_vector?.unexplained_inflow, "fail");
});

// H3 (cross-model review, HEAD d5e5dc6): M5 was a bare candidate-count check -- a SOLE candidate
// passed regardless of WHICH counterparty it named, so a sole match on the WRONG counterparty
// silently passed. The recut requires the candidate set to be EXACTLY {the selected
// counterparty}, stop-words the corporate suffixes (the SAME list clara._binding_f1_floor_holds
// carries), and makes the zero-candidate arm explicit (not_evaluable, never a silent pass).
// These three cells share the settle-leg shape f31w.m/f31w.n already use (a fake open_item id --
// the rung is computed and returned in rung_vector before any allocation is actually walked).
const SETTLE_SPECS = [
  { name: "p_client", cast: "uuid" }, { name: "p_line", cast: "uuid" }, { name: "p_counterparty", cast: "uuid" },
  { name: "p_allocations", cast: "jsonb" }, { name: "p_memo" }, { name: "p_posting_date", cast: "date" },
  { name: "p_charge_cents", cast: "bigint" }, { name: "p_charge_account" }, { name: "p_adjustments", cast: "jsonb" },
  { name: "p_control_account" }, { name: "p_rationale" }, { name: "p_model", cast: "jsonb" },
  { name: "p_inputs_digest" }, { name: "p_op_key" }];

test("f31w.r H3(a): a SOLE candidate that is NOT the selected counterparty refuses (the wrong-candidate hit)", async (t) => {
  if (skipPurpose(t)) return;
  const firm = await firmOf(world.clients.A1);
  // WRONGCO itself is never referenced by id below -- it only needs to EXIST so the description's
  // "WRONGCO" word resolves to a real candidate.
  await rootQuery(
    `insert into clara.counterparties(firm_id, client_id, kind, name, name_normalized, created_by)
       values ($1,$2,'customer','WRONGCO ENTERPRISES SDN BHD','wrongcoenterprisessdnbhd',$3) returning id`,
    [firm, world.clients.A1, world.users.alice]);
  const selected = await rootQuery(
    `insert into clara.counterparties(firm_id, client_id, kind, name, name_normalized, created_by)
       values ($1,$2,'customer','F31W R Selected Customer','f31wrselectedcustomer',$3) returning id`,
    [firm, world.clients.A1, world.users.alice]);
  const stmt = await enterStatement(world.users.alice, {
    client: world.clients.A1, bankAccount: bankAcct.A1.primary,
    opening: 0, specs: [{ entryDate: "2026-07-18", amountCents: 3300, description: "TRF WRONGCO PAYMENT" }],
  });
  const cred = await mintCred("bank_agent", firm, world.clients.A1);
  const digestR = await realDigest(cred.secret, world.clients.A1, bankAcct.A1.primary, opk("f31w-r-pack"));
  const r = await wakeQuery(WAKE_ROLE, cred.secret, callWrapper("wake_settle_from_bank_line", SETTLE_SPECS),
    [world.clients.A1, stmt.lines[0].id, selected.rows[0].id, JSON.stringify([{ open_item: randomUUID(), cents: 3300 }]),
      "f31w.r memo", null, 0, null, null, AR1, RATIONALE, JSON.stringify(MODEL), digestR, opk("f31w-r")]);
  assert.equal(r.rows[0].r.status, "refused", "the description names WRONGCO by word, but the SELECTED counterparty is someone else");
  assert.equal(r.rows[0].r.rung_vector?.counterparty_collision, "fail",
    "a sole candidate that isn't the selected counterparty is a wrong-candidate hit, not an absence of collision");
});

test("f31w.s H3(b): two Sdn Bhd counterparties -- ACME passes once SDN/BHD are stop-worded, not treated as distinguishing", async (t) => {
  if (skipPurpose(t)) return;
  const firm = await firmOf(world.clients.A1);
  const acme = await rootQuery(
    `insert into clara.counterparties(firm_id, client_id, kind, name, name_normalized, created_by)
       values ($1,$2,'customer','ACME SDN BHD','acmesdnbhd',$3) returning id`,
    [firm, world.clients.A1, world.users.alice]);
  await rootQuery(
    `insert into clara.counterparties(firm_id, client_id, kind, name, name_normalized, created_by)
       values ($1,$2,'customer','GLOBAL SDN BHD','globalsdnbhd',$3)`,
    [firm, world.clients.A1, world.users.alice]);
  const stmt = await enterStatement(world.users.alice, {
    client: world.clients.A1, bankAccount: bankAcct.A1.primary,
    opening: 0, specs: [{ entryDate: "2026-07-19", amountCents: 4400, description: "PYMT ACME SDN BHD" }],
  });
  const cred = await mintCred("bank_agent", firm, world.clients.A1);
  const digestS = await realDigest(cred.secret, world.clients.A1, bankAcct.A1.primary, opk("f31w-s-pack"));
  const r = await wakeQuery(WAKE_ROLE, cred.secret, callWrapper("wake_settle_from_bank_line", SETTLE_SPECS),
    [world.clients.A1, stmt.lines[0].id, acme.rows[0].id, JSON.stringify([{ open_item: randomUUID(), cents: 4400 }]),
      "f31w.s memo", null, 0, null, null, AR1, RATIONALE, JSON.stringify(MODEL), digestS, opk("f31w-s")]);
  // "SDN"/"BHD" are shared by BOTH counterparties' names -- pre-recut they made this a false
  // two-way collision. Stop-worded, only "ACME" is a distinguishing word, and it names one
  // counterparty alone -- the candidate set is exactly {the selected counterparty}.
  assert.equal(r.rows[0].r.rung_vector?.counterparty_collision, "pass",
    `M5 must pass: SDN/BHD are common corporate suffixes, not a genuine name-family collision (${JSON.stringify(r.rows[0].r.rung_vector)})`);
});

test("f31w.t H3(c): a description naming no counterparty at all is not_evaluable, never a silent pass", async (t) => {
  if (skipPurpose(t)) return;
  const firm = await firmOf(world.clients.A1);
  const cp = await rootQuery(
    `insert into clara.counterparties(firm_id, client_id, kind, name, name_normalized, created_by)
       values ($1,$2,'customer','F31W T Unrelated Client','f31wtunrelatedclient',$3) returning id`,
    [firm, world.clients.A1, world.users.alice]);
  const stmt = await enterStatement(world.users.alice, {
    client: world.clients.A1, bankAccount: bankAcct.A1.primary,
    opening: 0, specs: [{ entryDate: "2026-07-20", amountCents: 5500, description: "INTERBANK TRANSFER" }],
  });
  const cred = await mintCred("bank_agent", firm, world.clients.A1);
  const digestT = await realDigest(cred.secret, world.clients.A1, bankAcct.A1.primary, opk("f31w-t-pack"));
  const r = await wakeQuery(WAKE_ROLE, cred.secret, callWrapper("wake_settle_from_bank_line", SETTLE_SPECS),
    [world.clients.A1, stmt.lines[0].id, cp.rows[0].id, JSON.stringify([{ open_item: randomUUID(), cents: 5500 }]),
      "f31w.t memo", null, 0, null, null, AR1, RATIONALE, JSON.stringify(MODEL), digestT, opk("f31w-t")]);
  assert.equal(r.rows[0].r.rung_vector?.counterparty_collision, "not_evaluable",
    `a description that names no counterparty at all is ARM-0, not a pass (${JSON.stringify(r.rows[0].r.rung_vector)})`);
});

// H1 (opus consolidated round): a LITERALLY EMPTY description is a distinct case from "content
// that names nothing" (f31w.t, above) -- both must land not_evaluable, but the pre-recut code
// took a DIFFERENT path to a silent 'pass' for an empty string specifically (regexp_split_to_table
// on '' still returns one row, filtered out by the length>=3 floor, leaving the OLD flat
// count-based check's `else PASS` branch with nothing to compare -- ARM-0's exact silent-pass
// shape). Both polarities: empty string and NULL.
test("f31w.u H1: a description that is genuinely EMPTY (or NULL) is not_evaluable, never a silent pass", async (t) => {
  if (skipPurpose(t)) return;
  const firm = await firmOf(world.clients.A1);
  const cp = await rootQuery(
    `insert into clara.counterparties(firm_id, client_id, kind, name, name_normalized, created_by)
       values ($1,$2,'customer','F31W U Empty-Descr Client','f31wuemptydescrclient',$3) returning id`,
    [firm, world.clients.A1, world.users.alice]);
  const cred = await mintCred("bank_agent", firm, world.clients.A1);
  const digestU = await realDigest(cred.secret, world.clients.A1, bankAcct.A1.primary, opk("f31w-u-pack"));
  for (const [label, descr] of [["empty string", ""], ["NULL", null]]) {
    const stmt = await enterStatement(world.users.alice, {
      client: world.clients.A1, bankAccount: bankAcct.A1.primary,
      opening: 0, specs: [{ entryDate: "2026-07-21", amountCents: 6600, description: descr }],
    });
    const r = await wakeQuery(WAKE_ROLE, cred.secret, callWrapper("wake_settle_from_bank_line", SETTLE_SPECS),
      [world.clients.A1, stmt.lines[0].id, cp.rows[0].id, JSON.stringify([{ open_item: randomUUID(), cents: 6600 }]),
        `f31w.u ${label}`, null, 0, null, null, AR1, RATIONALE, JSON.stringify(MODEL), digestU, opk(`f31w-u-${label.replace(/\s/g, "")}`)]);
    assert.equal(r.rows[0].r.rung_vector?.counterparty_collision, "not_evaluable",
      `f31w.u (${label} description): must be not_evaluable, never a silent pass (${JSON.stringify(r.rows[0].r.rung_vector)})`);
  }
});

// H3 (opus consolidated round, adapted from the reviewer's own probe5.mjs): every ONE of the
// 13 wake_* bank wrappers, smoked through a REAL minted bank_agent credential -- looking for
// STRUCTURAL deadness (CLR04 "no authenticated actor"/credential hazards, 42883 undefined
// function, 42501 insufficient privilege, 23505 an unhandled unique violation, 42703 undefined
// column) as opposed to a clean, typed business refusal (CLR10/CLR11 -- "not found"-class, since
// every subject below is a fresh random id this client never created). B1's own end-to-end
// wake_get_bank_pack cell (this file's own realDigest calls already exercise it 12 times over,
// but never asserted its OWN shape directly) is folded in here as verb #1, using the real
// account this file's world already built.
test("f31w.v H3: all 13 wake_* bank wrappers reach a typed business refusal, never structural deadness", async (t) => {
  if (skipPurpose(t)) return;
  const firm = await firmOf(world.clients.A1);
  const cred = await mintCred("bank_agent", firm, world.clients.A1);
  const M = JSON.stringify(MODEL);
  const NX = () => randomUUID();
  const K = (n) => opk(`f31w-v-${n}`);
  const STRUCTURAL_DEADNESS = new Set(["CLR04", "42883", "42501", "23505", "42703", "undefined_function", "insufficient_privilege", "unique_violation", "undefined_column"]);

  const calls = [
    ["wake_get_bank_pack", "p_client => $1, p_bank_account => $2, p_rationale => $3, p_model => $4::jsonb, p_op_key => $5",
      () => [world.clients.A1, bankAcct.A1.primary, RATIONALE, M, K(1)]],
    ["wake_match_bank_line", "p_client => $1, p_lines => $2::jsonb, p_entries => $3::jsonb, p_adjustments => $4::jsonb, p_ack_period_exceptions => false, p_rationale => $5, p_model => $6::jsonb, p_inputs_digest => $7, p_op_key => $8",
      () => [world.clients.A1, "[]", "[]", "[]", RATIONALE, M, "d", K(2)]],
    ["wake_settle_from_bank_line", "p_client => $1, p_line => $2, p_counterparty => $3, p_allocations => $4::jsonb, p_memo => $5, p_posting_date => current_date, p_charge_cents => 0, p_charge_account => null, p_adjustments => '[]'::jsonb, p_control_account => null, p_rationale => $6, p_model => $7::jsonb, p_inputs_digest => $8, p_op_key => $9",
      () => [world.clients.A1, NX(), NX(), "[]", RATIONALE, M, "d", K(3)]],
    ["wake_unmatch_bank_match", "p_client => $1, p_match => $2, p_reason => $3, p_rationale => $4, p_model => $5::jsonb, p_inputs_digest => $6, p_op_key => $7",
      () => [world.clients.A1, NX(), "smoke", RATIONALE, M, "d", K(4)]],
    ["wake_complete_bank_reconciliation", "p_statement => $1, p_ack_outstanding => null, p_rationale => $2, p_model => $3::jsonb, p_inputs_digest => $4, p_op_key => $5",
      () => [NX(), RATIONALE, M, "d", K(5)]],
    ["wake_void_bank_reconciliation", "p_recon => $1, p_reason => $2, p_rationale => $3, p_model => $4::jsonb, p_inputs_digest => $5, p_op_key => $6",
      () => [NX(), "smoke", RATIONALE, M, "d", K(6)]],
    ["wake_resolve_bank_line_exception", "p_exception => $1, p_disposition => $2, p_note => $3, p_counterpart_line => null, p_rationale => $4, p_model => $5::jsonb, p_inputs_digest => $6, p_op_key => $7",
      () => [NX(), "not_ours", "n", RATIONALE, M, "d", K(7)]],
    ["wake_resolve_and_book_bank_line", "p_client => $1, p_exception => $2, p_disposition => $3, p_note => $4, p_draft => null, p_allocations => null, p_adjustments => null, p_advance_applications => null, p_charge_cents => 0, p_charge_account => null, p_rationale => $5, p_model => $6::jsonb, p_inputs_digest => $7, p_op_key => $8, p_ack_period_exceptions => false",
      () => [world.clients.A1, NX(), "matched_booking", "n", RATIONALE, M, "d", K(8)]],
    ["wake_propose_bank_line_exception", "p_line => $1, p_kind => $2, p_reason => $3, p_evidence_document => null, p_rationale => $4, p_model => $5::jsonb, p_inputs_digest => $6, p_op_key => $7",
      () => [NX(), "not_ours", "smoke", RATIONALE, M, "d", K(9)]],
    ["wake_propose_identifier_promotion", "p_client => $1, p_counterparty => $2, p_identifier_kind => $3, p_identifier_value => $4, p_times_seen => 3, p_rationale => $5, p_model => $6::jsonb, p_inputs_digest => $7, p_op_key => $8",
      () => [world.clients.A1, NX(), "tin", "X123", RATIONALE, M, "d", K(10)]],
    ["wake_add_bank_account", "p_client => $1, p_coa_account_code => $2, p_proposal_id => $3, p_bank_code => $4, p_account_number => $5, p_bank_name_display => $6, p_rationale => $7, p_model => $8::jsonb, p_inputs_digest => $9, p_op_key => $10",
      () => [world.clients.A1, "999999", NX(), "MBB", "1234567890", "Maybank", RATIONALE, M, "d", K(11)]],
    ["wake_upsert_account", "p_client => $1, p_code => $2, p_name => $3, p_type => $4, p_special_acc_type => null, p_account_class => null, p_rationale => $5, p_model => $6::jsonb, p_inputs_digest => $7, p_op_key => $8",
      () => [world.clients.A1, "888888", "H3 smoke acct", "expense", RATIONALE, M, "d", K(12)]],
    ["wake_void_bank_statement", "p_client => $1, p_statement => $2, p_reason => $3, p_rationale => $4, p_model => $5::jsonb, p_inputs_digest => $6, p_op_key => $7",
      () => [world.clients.A1, NX(), "smoke", RATIONALE, M, "d", K(13)]],
  ];
  assert.equal(calls.length, 13, "f31w.v mandatory setup: this cell must name all 13 verbs, not a subset");

  for (const [name, argspec, mk] of calls) {
    const sql = `select clara.${name}(${argspec}) as r`;
    const err = await caught(() => wakeQuery(WAKE_ROLE, cred.secret, sql, mk()));
    if (err) {
      assert.ok(!STRUCTURAL_DEADNESS.has(err.code),
        `f31w.v ${name}: structural deadness, not a business refusal -- ${err.code}: ${err.message}`);
    }
    // A caught error is a typed refusal (fine); no error at all is an admission (also fine --
    // wake_upsert_account/wake_add_bank_account/wake_get_bank_pack can legitimately succeed on
    // a fresh subject). Either shape passes; only structural deadness fails.
  }
});

// B2 (opus consolidated round): the four genuinely-repeatable act kinds -- proven, per team-lead's
// own named list, on wake_upsert_account -- must each tolerate a SECOND admitted act on the SAME
// subject (a real repeat visit, a fresh op_key each time), not raise a bare 23505.
test("f31w.w B2: account_upsert, identifier_promotion_propose, exception_propose and pack_read all tolerate a genuine repeat admitted act", async (t) => {
  if (skipPurpose(t)) return;
  const firm = await firmOf(world.clients.A1);
  const cred = await mintCred("bank_agent", firm, world.clients.A1);
  const M = JSON.stringify(MODEL);
  const digestW = await realDigest(cred.secret, world.clients.A1, bankAcct.A1.primary, opk("f31w-w-pack0"));

  // account_upsert: subject_id is a deterministic md5(client, code) -- SAME code, two edits.
  for (const [n, name] of [[1, "B2 acct v1"], [2, "B2 acct v2"]]) {
    const r = await wakeQuery(WAKE_ROLE, cred.secret, callWrapper("wake_upsert_account", [
      { name: "p_client", cast: "uuid" }, { name: "p_code" }, { name: "p_name" }, { name: "p_type" },
      { name: "p_special_acc_type" }, { name: "p_account_class" }, { name: "p_rationale" },
      { name: "p_model", cast: "jsonb" }, { name: "p_inputs_digest" }, { name: "p_op_key" }]),
      [world.clients.A1, "777-WWW", name, "expense", null, null, RATIONALE, M, digestW, opk(`f31w-w-acct-${n}`)]);
    assert.ok(r.rows[0].r, `f31w.w account_upsert #${n} must not raise`);
  }

  // identifier_promotion_propose: subject_id = p_counterparty -- SAME counterparty, two proposals.
  const cp = await rootQuery(
    `insert into clara.counterparties(firm_id, client_id, kind, name, name_normalized, created_by)
       values ($1,$2,'customer','F31W W Repeat Customer','f31wwrepeatcustomer',$3) returning id`,
    [firm, world.clients.A1, world.users.alice]);
  for (const n of [1, 2]) {
    const r = await wakeQuery(WAKE_ROLE, cred.secret, callWrapper("wake_propose_identifier_promotion", [
      { name: "p_client", cast: "uuid" }, { name: "p_counterparty", cast: "uuid" }, { name: "p_identifier_kind" },
      { name: "p_identifier_value" }, { name: "p_times_seen" }, { name: "p_rationale" },
      { name: "p_model", cast: "jsonb" }, { name: "p_inputs_digest" }, { name: "p_op_key" }]),
      [world.clients.A1, cp.rows[0].id, "tin", `TIN${n}`, 3, RATIONALE, M, digestW, opk(`f31w-w-idprom-${n}`)]);
    assert.ok(r.rows[0].r, `f31w.w identifier_promotion_propose #${n} must not raise`);
  }

  // exception_propose: subject_id = p_line -- SAME line, two proposals (e.g. a declined first
  // proposal, re-proposed).
  const stmt = await enterStatement(world.users.alice, {
    client: world.clients.A1, bankAccount: bankAcct.A1.primary,
    opening: 0, specs: [{ entryDate: "2026-07-22", amountCents: 7700, description: "f31w.w repeat exception line" }],
  });
  for (const n of [1, 2]) {
    const r = await wakeQuery(WAKE_ROLE, cred.secret, callWrapper("wake_propose_bank_line_exception", [
      { name: "p_line", cast: "uuid" }, { name: "p_kind" }, { name: "p_reason" }, { name: "p_evidence_document" },
      { name: "p_rationale" }, { name: "p_model", cast: "jsonb" }, { name: "p_inputs_digest" }, { name: "p_op_key" }]),
      [stmt.lines[0].id, "bank_error", `f31w.w proposal ${n}`, null, RATIONALE, M, digestW, opk(`f31w-w-except-${n}`)]);
    assert.ok(r.rows[0].r, `f31w.w exception_propose #${n} must not raise`);
  }

  // pack_read: subject_id = p_bank_account -- SAME account, two reads (already proven implicitly
  // by every realDigest() call above across this file; this is the DIRECT, dedicated proof).
  for (const n of [1, 2]) {
    const r = await wakeQuery(WAKE_ROLE, cred.secret, callWrapper("wake_get_bank_pack", [
      { name: "p_client", cast: "uuid" }, { name: "p_bank_account", cast: "uuid" },
      { name: "p_rationale" }, { name: "p_model", cast: "jsonb" }, { name: "p_op_key" }]),
      [world.clients.A1, bankAcct.A1.primary, RATIONALE, M, opk(`f31w-w-pack-${n}`)]);
    assert.ok(r.rows[0].r?.digest, `f31w.w pack_read #${n} must not raise and must return a digest`);
  }
});

// ===========================================================================
// H.7 catalog
// ===========================================================================
test("f31w.o clara_wake_bank holds EXACTLY the 13-verb allowlist for bank_agent (closed-world)", async (t) => {
  if (skipHere(t)) return;
  const rows = await rootQuery(
    "select function_name from clara.wake_fn_allowlist where wake_kind='bank_agent' order by 1");
  assert.equal(rows.rowCount, 13, `expected 13 allowlist rows, found ${rows.rowCount}`);
  const names = rows.rows.map((r) => r.function_name);
  for (const n of [
    "wake_match_bank_line", "wake_unmatch_bank_match", "wake_settle_from_bank_line",
    "wake_complete_bank_reconciliation", "wake_void_bank_reconciliation",
    "wake_resolve_bank_line_exception", "wake_resolve_and_book_bank_line",
    "wake_propose_bank_line_exception", "wake_propose_identifier_promotion",
    "wake_add_bank_account", "wake_upsert_account", "wake_void_bank_statement",
    "wake_get_bank_pack",
  ]) {
    assert.ok(names.includes(n), `allowlist is missing ${n}`);
  }
});

// THE WALL, FORCED (conductor's ruling): B.4 is a closed list -- a typed reason it does NOT
// enumerate must re-raise (return NULL) out of the converter, not silently become a receipt.
// _agent_bank_tier_c_reason is ungranted; called directly via rootQuery (superuser bypasses ACL).
test("f31w.p the Tier-C wall: an unlisted-but-typed reason re-raises out of the converter", async (t) => {
  if (skipHere(t)) return;
  const listed = await rootQuery(
    "select clara._agent_bank_tier_c_reason($1,$2,$3) as r",
    ["x", "CLR10", '{"reason":"already_matched"}']);
  assert.equal(listed.rows[0].r, "already_matched", "a B.4-listed pair converts");
  // settlement_amount_invalid is a REAL, typed, live raise (_settle_from_bank_line_core's own
  // body) that B.4 never enumerates -- the wall's own proof case.
  const unlisted = await rootQuery(
    "select clara._agent_bank_tier_c_reason($1,$2,$3) as r",
    ["x", "CLR10", '{"reason":"settlement_amount_invalid"}']);
  assert.equal(unlisted.rows[0].r, null, "an unlisted-but-typed reason returns NULL (the caller re-raises)");
  const wrongCode = await rootQuery(
    "select clara._agent_bank_tier_c_reason($1,$2,$3) as r",
    ["x", "CLR11", '{"reason":"already_matched"}']);
  assert.equal(wrongCode.rows[0].r, null, "a listed reason under the WRONG errcode still re-raises (pairs, not bare reasons)");
  // Tier-C, reconciliation round (measurement beats prose -- migration §K's own Tier-C header):
  // the ELEVEN measured recon_ literals are an EXACT-STRING closed list, not a `like 'recon\_%'`
  // prefix match -- an invented, unlisted recon_-prefixed reason must re-raise exactly like any
  // other unlisted reason, proving the wildcard is really gone and not merely narrowed to a
  // smaller wildcard.
  const listedRecon = await rootQuery(
    "select clara._agent_bank_tier_c_reason($1,$2,$3) as r",
    ["x", "CLR10", '{"reason":"recon_difference_nonzero"}']);
  assert.equal(listedRecon.rows[0].r, "recon_difference_nonzero", "a real, listed recon_ literal still converts");
  const listedReconAlreadyComplete = await rootQuery(
    "select clara._agent_bank_tier_c_reason($1,$2,$3) as r",
    ["x", "CLR10", '{"reason":"recon_already_complete"}']);
  assert.equal(listedReconAlreadyComplete.rows[0].r, "recon_already_complete",
    "recon_already_complete converts -- one of the two literals the consolidated round's interim nine had dropped, restored by live measurement");
  const listedReconTermsUnderivable = await rootQuery(
    "select clara._agent_bank_tier_c_reason($1,$2,$3) as r",
    ["x", "CLR10", '{"reason":"recon_terms_underivable"}']);
  assert.equal(listedReconTermsUnderivable.rows[0].r, "recon_terms_underivable",
    "recon_terms_underivable converts -- the other literal the interim nine had dropped, restored by live measurement");
  const unlistedRecon = await rootQuery(
    "select clara._agent_bank_tier_c_reason($1,$2,$3) as r",
    ["x", "CLR10", '{"reason":"recon_x_new"}']);
  assert.equal(unlistedRecon.rows[0].r, null,
    "an INVENTED recon_-prefixed reason (recon_x_new), never one of the eleven, re-raises -- the prefix match is gone, not just narrowed");
});

// C1 (cross-model review, HEAD d5e5dc6, CRITICAL): _resolve_and_book_bank_line_core creates an
// agent-origin bank_matches row on its DRAFT leg, and the deferred wall t_bank_match_agent_receipt
// demands exactly one ADMITTED match/settle-keyed bank_agent_receipts row for it before commit.
// Every earlier cell in this file only checked the RETURNED status, never whether the call
// actually SURVIVED COMMIT -- a deferred-trigger rollback is invisible to a cell that stops
// looking the moment await resolves cleanly. This one asserts the positive, independent, POST-
// COMMIT read (review laws 2/3): if the wall still finds nothing, THIS AWAIT ITSELF THROWS CLR08,
// failing the cell loudly rather than quietly returning a refusal shape.
//
// VERIFICATION FOUND TWO MORE, IN SEQUENCE, ONLY BY ACTUALLY LETTING THIS CALL REACH COMMIT:
// (1) FIXED, this lane's own pass: the draft leg's _approve_entry_core call was preheld
//     (receipt_preheld=true) but nothing wrote the promised F-A2 entry_post_receipts row, so
//     t_je_agent_post_receipt (a DIFFERENT deferred wall, unrelated to C1's own bank-domain one)
//     aborted every successful draft-leg resolve-and-book too. Fixed alongside C1 in the
//     migration (the same _approve_entry_core call site, the SAME class of promise-broken bug).
// (2) FIXED, by owner ruling (ADR-0074/law 78, Track-A sitting): 0040's OWN pre-existing
//     t_bank_settled_authority_belt RESOLUTION floor on clara.bank_line_exceptions ("bank line
//     exception % was not resolved by a firm principal; resolution is an owner act", 0040:2664)
//     joined clara.firm_memberships WITH `u.is_agent = false` -- structurally, an agent actor
//     could never satisfy this floor, no matter what ctx was threaded through, which meant
//     wake_resolve_bank_line_exception and this composite's own exception-resolution step could
//     never actually commit an exception into 'resolved' status for the agent lane -- a genuine
//     (0040-era, pre-Charter) product/authority-model conflict with F-A3's own design (which
//     built BOTH verbs assuming the agent COULD resolve). Reported as its own finding and left
//     RED on purpose pending a ruling, separate from the reviewed nine. The owner has since ruled:
//     the ratified F-A3 scope (PROGRESS.md's F-A3 row) places "resolve exception incl. write-off"
//     in the agent's OPEN register; law 71's reservation keeps only the MINTING act
//     (except_bank_line, the red pen) human. The migration's D-11 CoR
//     (clara._tf_bank_settled_authority_belt) widens the RESOLUTION floor ONLY -- an agent
//     resolver additionally clears it when `resolved_by = clara.agent_user_id()` AND a same-
//     subject ADMITTED `exception_resolve` receipt already exists in the same transaction; the
//     MINTING floor (the `created_by` check, a screen above) is untouched, byte-identical to
//     0040 -- see f31w.x, the twin cell right below, which proves an agent still cannot mint.
test("f31w.q C1: resolve_and_book's draft leg genuinely COMMITS -- the deferred wall does not roll back a valid resolution", async (t) => {
  if (skipPurpose(t)) return;
  const firm = await firmOf(world.clients.A1);
  const amount = 4400;
  const stmt = await enterStatement(world.users.alice, {
    client: world.clients.A1, bankAccount: bankAcct.A1.primary,
    opening: 0, specs: [{ entryDate: "2026-07-20", amountCents: amount, description: "f31w.q genuine bank error" }],
  });
  const exReceipt = await humanQuery(world.users.alice,
    "select clara.except_bank_line(p_line => $1, p_kind => $2, p_reason => $3, p_op_key => $4) as r",
    [stmt.lines[0].id, "bank_error", "f31w.q setup: a genuine bank posting error", opk("f31w-q-except")]);
  const exId = idOf(exReceipt.rows[0].r, "exception_id", "id");
  assert.ok(exId, "f31w.q mandatory setup: the exception was really opened");

  const cred = await mintCred("bank_agent", firm, world.clients.A1);
  const draft = {
    posting_date: stmt.periodEnd, memo: "f31w.q resolve-and-book",
    lines: [
      { account_code: BANKCOA1, debit_cents: amount, credit_cents: 0, description: "into the bank" },
      { account_code: REVN, debit_cents: 0, credit_cents: amount, description: "sundry income" },
    ],
  };
  const opKey = opk("f31w-q");
  const digestQ = await realDigest(cred.secret, world.clients.A1, bankAcct.A1.primary, opk("f31w-q-pack"));
  const r = await wakeQuery(WAKE_ROLE, cred.secret,
    callWrapper("wake_resolve_and_book_bank_line", [
      { name: "p_client", cast: "uuid" }, { name: "p_exception", cast: "uuid" }, { name: "p_disposition" },
      { name: "p_note" }, { name: "p_draft", cast: "jsonb" }, { name: "p_allocations", cast: "jsonb" },
      { name: "p_adjustments", cast: "jsonb" }, { name: "p_advance_applications", cast: "jsonb" },
      { name: "p_charge_cents", cast: "bigint" }, { name: "p_charge_account" },
      { name: "p_rationale" }, { name: "p_model", cast: "jsonb" }, { name: "p_inputs_digest" }, { name: "p_op_key" },
      { name: "p_ack_period_exceptions" }]),
    [world.clients.A1, exId, "matched_booking", "f31w.q resolution note", JSON.stringify(draft),
      null, null, null, 0, null, RATIONALE, JSON.stringify(MODEL), digestQ, opKey, false]);
  const res = r.rows[0].r;
  assert.equal(res?.branch, "live", `f31w.q: a small, non-high-stakes draft settles live, not pending/refused (${JSON.stringify(res)})`);
  const matchId = res?.match_id;
  assert.ok(matchId, "f31w.q: the composite's own return names the match it created");

  // THE COMMIT PROOF: a FRESH read, after the RPC's own (single-statement) transaction has
  // already committed, of the exact rows the deferred wall required to exist at that commit.
  const match = await rootQuery(
    "select origin, resolution_exception_id from clara.bank_matches where id=$1", [matchId]);
  assert.equal(match.rows[0]?.origin, "agent", "f31w.q: the match genuinely persisted with origin=agent");
  assert.equal(match.rows[0]?.resolution_exception_id, exId, "f31w.q: ...and carries the exception it resolved");
  const matchReceipt = await rootQuery(
    "select act_kind, outcome, subject_id from clara.bank_agent_receipts where op_key=$1", [`${opKey}:match`]);
  assert.equal(matchReceipt.rows[0]?.act_kind, "match", "f31w.q: the match-keyed receipt the deferred wall required really exists");
  assert.equal(matchReceipt.rows[0]?.outcome, "admitted");
  assert.equal(matchReceipt.rows[0]?.subject_id, matchId, "f31w.q: ...keyed to the match, not the exception");
  const exceptionReceipt = await rootQuery(
    "select act_kind, outcome, subject_id from clara.bank_agent_receipts where op_key=$1", [opKey]);
  assert.equal(exceptionReceipt.rows[0]?.act_kind, "exception_resolve", "f31w.q: the composite's own audit receipt also persisted, keyed to the exception");
  assert.equal(exceptionReceipt.rows[0]?.subject_id, exId);
});

// ADR-0074/law 78's TWIN, promised in f31w.q's own header: the D-11 CoR widens the RESOLUTION
// floor ONLY. The MINTING floor -- a separate `x.created_by` check, a screen above the resolution
// check in the SAME trigger body -- is byte-unmoved from 0040, and no wake verb in this file even
// attempts an agent-authored INSERT on clara.bank_line_exceptions (there is no
// _agent_mint_bank_line_exception_core; the only agent-callable exception verb is resolve). This
// cell proves the backstop is STRUCTURAL, not merely "nothing happens to call it": a DIRECT write
// (rootQuery, bypassing the verb layer entirely, exactly the shape law 71's minting reservation
// must hold against) with an agent actor id in created_by still hits the belt and still refuses,
// with the SAME message and reason 0040 always raised.
test("f31w.x ADR-0074 twin: an agent actor still cannot MINT a bank line exception -- only resolution widened", async (t) => {
  if (skipPurpose(t)) return;
  const amount = 1900;
  const stmt = await enterStatement(world.users.alice, {
    client: world.clients.A1, bankAccount: bankAcct.A1.primary,
    opening: 0, specs: [{ entryDate: "2026-07-21", amountCents: amount, description: "f31w.x mint-attempt line" }],
  });
  const firm = await firmOf(world.clients.A1);
  const err = await caught(() => rootQuery(
    `insert into clara.bank_line_exceptions(firm_id, client_id, line_id, kind, reason, created_by)
     values ($1, $2, $3, 'bank_error', 'f31w.x an agent attempting to mint', clara.agent_user_id())`,
    [firm, world.clients.A1, stmt.lines[0].id]));
  assert.ok(err, "an agent-authored INSERT into bank_line_exceptions still refuses -- minting stays human-only");
  assert.equal(err?.code, "CLR04", `expected CLR04 (the owner floor), got ${err?.code}: ${err?.message}`);
  assert.match(err?.message ?? "", /exception door is an owner act/,
    "the SAME minting-floor message 0040 always raised -- this screen was never touched by ADR-0074/law 78");
  const notMinted = await rootQuery(
    "select 1 from clara.bank_line_exceptions where line_id=$1", [stmt.lines[0].id]);
  assert.equal(notMinted.rowCount, 0, "the refused INSERT left no row behind -- the deferred trigger's rollback is real, not cosmetic");
});
