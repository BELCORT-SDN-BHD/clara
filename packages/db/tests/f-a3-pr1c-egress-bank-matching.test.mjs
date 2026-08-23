// F-A3 (Wave-F Track A) PR-1c -- THE bank_matching EGRESS PURPOSE battery, for
// migrations/UNNUMBERED_f_a3_egress_purpose_bank_matching.sql (number claimed at merge). NOT
// contract-blind: this lane authored the migration, so every cell targets the ACTUAL installed
// behaviour. Design: docs/plan/active/bank-agency-design.md v2 SS3.7 + Annex E
// (bank-agency-annexes-4-surfaces.md).
//
// SCOPE: the three purpose CHECKs + the doc-sha CHECK's fourth conjunct (requiring
// document_sha256 IS NULL for bank_matching -- the wiki_synthesis arm's shape, the OPPOSITE
// polarity from statement_extraction/witness_extraction); the four purpose-bearing verbs'
// widened in-body allowlist; prepare_egress_dispatch's new bank_matching/doc_sha arm. Mirrors
// f-a1-walls.test.mjs's "wall 6" cells (f-a1.h/i/j/k), reversed to bank_matching's NULL-required
// shape. GOVERNED_EGRESS_PURPOSES (packages/runtime/lib/egress.mjs) is F-A3/PR-2's, NOT this
// file's -- not exercised here.
//
// Runs in the default sweep once this migration sits in the real migrations chain (post-merge).

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { ROLES, rootQuery, roleQuery, endPool } from "./rig-helpers.mjs";
import { printLaneNotes } from "./rig-runtime-helpers.mjs";
import { ensureReady } from "./rig-docs-fixtures.mjs";
import { buildWorld } from "./rig-fixtures.mjs";
import { firmOf } from "./s6-helpers.mjs";
import { roleCanExecute } from "./a21-helpers.mjs";
import {
  grantPurpose, activatePurpose, deactivatePurpose, revokePurpose,
  consentEvidenceDoc, livePurposeConsent, livePurposeActivation, holdRow, OWNER_FNS,
} from "./wave-b/wb-0020-helpers.mjs";

const BANK_MATCHING_PURPOSE = "bank_matching";
let ready = false;
let world = null;

/** THE CAPABILITY, read from the catalog -- the instrument production itself uses. A single
 *  unambiguous marker for "has UNNUMBERED_f_a3_egress_purpose_bank_matching.sql landed on this
 *  database": the purpose CHECK admits bank_matching nowhere before this migration. */
async function f_a3_pr1cReady() {
  const r = await rootQuery(
    `select 1 from pg_constraint con
       join pg_class c on c.oid=con.conrelid
       join pg_namespace n on n.oid=c.relnamespace
      where n.nspname='clara' and c.relname='egress_dispatch_authorizations'
        and con.conname='ck_egress_dispatch_authorizations_purpose_f_a1'
        and pg_get_constraintdef(con.oid) like '%bank_matching%'`,
  );
  return r.rowCount > 0;
}

async function prepareDispatchSha({
  firm, client, purpose = BANK_MATCHING_PURPOSE, eventSeq = 1, eventType = "bank.matching.probe",
  documentSha256 = null, role = ROLES.runtime,
}) {
  const r = await roleQuery(role,
    `select clara.prepare_egress_dispatch(p_firm => $1, p_client => $2, p_purpose => $3,
       p_event_seq => $4::bigint, p_event_type => $5, p_document_sha256 => $6) as r`,
    [firm, client, purpose, eventSeq, eventType, documentSha256]);
  return r.rows[0].r;
}

async function assertCheckViolation(fn, label) {
  try {
    await fn();
    assert.fail(`${label}: expected a CHECK violation (23514), nothing raised`);
  } catch (e) {
    assert.equal(e.code, "23514", `${label}: expected CHECK violation 23514, got ${e.code}: ${e.message}`);
  }
}

before(async () => {
  await ensureReady();
  ready = await f_a3_pr1cReady();
  if (!ready) return;
  world = await buildWorld();
});

after(async () => {
  printLaneNotes("f-a3-pr1c-egress-bank-matching");
  await endPool();
});

function mustBeReady() {
  assert.ok(ready, "UNNUMBERED_f_a3_egress_purpose_bank_matching.sql is not applied on this database (the purpose CHECK does not yet admit bank_matching) -- this battery must FAIL, not skip, against a pre-F-A3/PR-1c chain");
}

test("META: the bank_matching egress-purpose migration is applied", async () => {
  mustBeReady();
});

// ===========================================================================
// The three purpose CHECKs + the four verbs' hardcoded allowlist -- both walls, together
// (widening the CHECK alone leaves the purpose refused at every verb; 0090's own finding,
// this file's own header).
// ===========================================================================

test("f-a3-pr1c.a bank_matching is grantable and activatable through the four typed-purpose verbs (the necessary in-body allowlist widening)", async () => {
  mustBeReady();
  const { users, clients } = world;
  const firm = await firmOf(clients.A2);
  const evidence = await consentEvidenceDoc(users.alice, { firm });
  const grant = await grantPurpose(users.alice, { client: clients.A2, purpose: BANK_MATCHING_PURPOSE, evidenceDocument: evidence.documentId });
  assert.equal(grant.status, "live", `bank_matching grant must succeed (got ${JSON.stringify(grant)})`);
  assert.ok(await livePurposeConsent(clients.A2, BANK_MATCHING_PURPOSE), "a live bank_matching consent must read back");

  const activate = await activatePurpose(users.alice, { client: clients.A2, purpose: BANK_MATCHING_PURPOSE, consent: grant.consent_id });
  assert.equal(activate.status, "active", `bank_matching activation must succeed (got ${JSON.stringify(activate)})`);
  assert.ok(await livePurposeActivation(clients.A2, BANK_MATCHING_PURPOSE), "a live bank_matching activation must read back");

  // Differential: the wiki-hold coupling is purpose-discriminated -- a bank_matching
  // grant/activate must NOT touch clara.wiki_synthesis_holds for this client at all.
  assert.equal(await holdRow(clients.A2), null, "granting+activating bank_matching must fire NO wiki_synthesis_holds transition (the coupling stays wiki_synthesis-only)");
});

test("f-a3-pr1c.b typed purpose ABSENT: prepare_egress_dispatch refuses bank_matching uniformly ('unknown') before any consent exists", async () => {
  mustBeReady();
  const { clients } = world;
  const firm = await firmOf(clients.A1);
  const r = await prepareDispatchSha({ firm, client: clients.A1, documentSha256: null });
  assert.deepEqual(r, { verdict: "unknown", authorization_id: null }, `no live (consent,activation) for bank_matching yet -- must refuse uniformly, got ${JSON.stringify(r)}`);
});

test("f-a3-pr1c.c the bank_matching doc_sha arm forces doc_sha NULL at prepare time (the wiki_synthesis arm's shape, OPPOSITE polarity from statement/witness_extraction) and GRANTS once null", async () => {
  mustBeReady();
  const { clients } = world;
  const firm = await firmOf(clients.A2);
  // clients.A2 already carries a live bank_matching consent+activation from f-a3-pr1c.a.
  const nonNull = await prepareDispatchSha({ firm, client: clients.A2, documentSha256: "b".repeat(64), eventSeq: 5, eventType: "bank.matching.probe" });
  assert.deepEqual(nonNull, { verdict: "unknown", authorization_id: null }, `a non-null document_sha256 must refuse for purpose=bank_matching, got ${JSON.stringify(nonNull)}`);

  const granted = await prepareDispatchSha({ firm, client: clients.A2, documentSha256: null, eventSeq: 6, eventType: "bank.matching.probe" });
  assert.equal(granted.verdict, "granted", `a NULL document_sha256 must be admitted for purpose=bank_matching once live, got ${JSON.stringify(granted)}`);
  assert.ok(granted.authorization_id, "…with an authorization id");

  const auth = await rootQuery("select document_sha256 from clara.egress_dispatch_authorizations where id=$1", [granted.authorization_id]);
  assert.equal(auth.rows[0].document_sha256, null, "the minted authorization row itself carries a NULL document_sha256");
});

test("f-a3-pr1c.d the doc_sha CHECK itself refuses a non-null hash for bank_matching (BLIND, direct catalog probe) and accepts null", async () => {
  mustBeReady();
  const { clients } = world;
  const firm = await firmOf(clients.A2);
  await assertCheckViolation(
    () => rootQuery(
      `insert into clara.egress_dispatch_authorizations(firm_id,client_id,purpose,consent_id,activation_id,event_seq,event_type,document_sha256,issued_at,expires_at)
       select $1,$2,'bank_matching',c.id,a.id,100,'probe',$3,now(),now()+interval '60 seconds'
       from clara.client_egress_purpose_consents c join clara.client_egress_purpose_activations a on a.consent_id=c.id
       where c.client_id=$2 and c.purpose='bank_matching' limit 1`,
      [firm, clients.A2, "c".repeat(64)],
    ),
    "a non-null document_sha256 on a bank_matching authorization must violate ck_egress_dispatch_authorizations_doc_sha",
  );
  const ok = await rootQuery(
    `insert into clara.egress_dispatch_authorizations(firm_id,client_id,purpose,consent_id,activation_id,event_seq,event_type,document_sha256,issued_at,expires_at)
     select $1,$2,'bank_matching',c.id,a.id,101,'probe',null,now(),now()+interval '60 seconds'
     from clara.client_egress_purpose_consents c join clara.client_egress_purpose_activations a on a.consent_id=c.id
     where c.client_id=$2 and c.purpose='bank_matching' limit 1 returning id`,
    [firm, clients.A2],
  );
  assert.ok(ok.rows[0].id, "a NULL document_sha256 must be admitted for bank_matching");
});

test("f-a3-pr1c.e deactivate+revoke of a bank_matching purpose refuse the SAME way as every other purpose (op-key/reason validation, owner floor) and never touch the wiki hold", async () => {
  mustBeReady();
  const { users, clients } = world;
  const firm = await firmOf(clients.B1);
  const evidence = await consentEvidenceDoc(users.dave, { firm });
  const grant = await grantPurpose(users.dave, { client: clients.B1, purpose: BANK_MATCHING_PURPOSE, evidenceDocument: evidence.documentId });
  await activatePurpose(users.dave, { client: clients.B1, purpose: BANK_MATCHING_PURPOSE, consent: grant.consent_id });
  assert.ok(await livePurposeActivation(clients.B1, BANK_MATCHING_PURPOSE), "bank_matching is live for B1");

  const deactivated = await deactivatePurpose(users.dave, { client: clients.B1, purpose: BANK_MATCHING_PURPOSE, reason: "rig pause" });
  assert.equal(deactivated.status, "deactivated", `bank_matching deactivation must succeed (got ${JSON.stringify(deactivated)})`);
  assert.equal(await livePurposeActivation(clients.B1, BANK_MATCHING_PURPOSE), null, "no live activation remains");
  assert.equal(await holdRow(clients.B1), null, "deactivating bank_matching must not set the wiki hold (purpose-discriminated)");

  const revoked = await revokePurpose(users.dave, { client: clients.B1, purpose: BANK_MATCHING_PURPOSE, reason: "rig withdrawal" });
  assert.equal(revoked.status, "revoked", `bank_matching revocation must succeed (got ${JSON.stringify(revoked)})`);
  assert.equal(await livePurposeConsent(clients.B1, BANK_MATCHING_PURPOSE), null, "no live consent remains after revoke");
  assert.equal(await holdRow(clients.B1), null, "revoking bank_matching must not set the wiki hold either");
});

test("f-a3-pr1c.f ACL is unmoved: the four owner verbs stay EXECUTE-granted to clara_authenticated ONLY, and prepare_egress_dispatch stays reachable by clara_runtime only -- re-derived independently of the migration's own postcheck", async () => {
  mustBeReady();
  for (const fn of Object.keys(OWNER_FNS)) {
    if (fn === "classify_consent_evidence_document") continue; // untouched by this migration
    assert.equal(await roleCanExecute(ROLES.authenticated, fn), true,
      `${fn} is EXECUTE-granted to clara_authenticated`);
    for (const role of [ROLES.runtime]) {
      assert.equal(await roleCanExecute(role, fn), false,
        `${fn} is NOT reachable by ${role} after the bank_matching widen`);
    }
  }
  assert.equal(await roleCanExecute(ROLES.runtime, "prepare_egress_dispatch"), true,
    "prepare_egress_dispatch stays EXECUTE-granted to clara_runtime after the bank_matching widen");
  assert.equal(await roleCanExecute(ROLES.authenticated, "prepare_egress_dispatch"), false,
    "prepare_egress_dispatch stays UNREACHABLE by clara_authenticated after the bank_matching widen");
});
