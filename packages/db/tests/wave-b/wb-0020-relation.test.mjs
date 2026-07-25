// Wave-B battery — migration 0020 §1: THE TYPED-CONSENT RELATION IS SEPARATE.
// The whole authorization story rests on typed consent NOT living in
// clara.client_egress_consents (whose live invoice-facts gate is purpose-BLIND —
// verified at source, 0015:3361-3366). This file proves the new relation's shape,
// its mandatory-real-evidence gate (§1.3), its insert-once/revoke-once
// immutability (§1.2), its at-most-one-live-per-(client,purpose) index, and the
// load-bearing NEGATIVE: the legacy table gained nothing. CONTRACT-BLIND; FAILS
// below 0020.
//
// AMBIGUITIES this lane records (full list in wb-0020-helpers.mjs):
//   [A20-1] Foreign-firm EVIDENCE code. §9.1 "foreign-firm evidence document →
//           CLR28"; §7.1 "client/document-not-in-firm is CLR11". Both cannot be
//           literally true for a foreign-firm evidence doc. Asserted CLR28|CLR11
//           for THAT input only; strict CLR28 for null / wrong-kind / unverified
//           (in-firm, merely ineligible — §1.3 and §9.1 agree there).
//   [A20-2] An OFF-ENUM purpose string on grant_client_egress_purpose. §7.1 makes
//           argument validation CLR10; §9.1's "the purpose CHECK rejects an
//           off-enum purpose string" reads as a raw 23514. Asserted CLR10|23514.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  ROLES, CLR, PG, rootQuery, opk, assertRaises, assertRaisesOneOf, endPool,
  printLaneNotes, noteLane, detailReason, checkDefs, uniqueIndexDefs, rlsFlags,
  fail0020, wbEnsureReady20,
  buildWaveBWorld, filedDocument,
  WIKI_PURPOSE, TYPED_CONSENT_TABLE, TYPED_ACTIVATION_TABLE, DISPATCH_AUTH_TABLE,
  LEGACY_CONSENT_TABLE, NEW_RELATIONS,
  grantPurpose, consentEvidenceDoc, livePurposeConsent, purposeConsentRows,
  policyRoles, anyTableGrant, triggerNames, countRows, unverifyDocumentBytes,
} from "./wb-0020-helpers.mjs";

let live = false;
let w = null;

before(async () => {
  live = await wbEnsureReady20();
  if (live) w = await buildWaveBWorld();
});
after(async () => { printLaneNotes("wb-0020-relation"); await endPool(); });

test("META: 0020 applied — the three typed relations exist and are firm-scoped", async () => {
  fail0020(live);
  for (const rel of NEW_RELATIONS) {
    const r = await rootQuery(
      "select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='clara' and c.relname=$1 and c.relkind='r'",
      [rel]);
    assert.equal(r.rows.length, 1, `clara.${rel} exists`);
    const cols = await rootQuery(
      "select 1 from information_schema.columns where table_schema='clara' and table_name=$1 and column_name='firm_id'", [rel]);
    assert.equal(cols.rows.length, 1, `clara.${rel} carries firm_id (firm-scoped)`);
  }
});

test("[0020 §1.1/§1.2 — THE separate-relation negative]: the LEGACY clara.client_egress_consents is UNTOUCHED — no purpose column, no new column at all, and its one-live index keeps its original (client_id) where revoked_at is null definition", async () => {
  fail0020(live);
  // If a typed purpose had landed on the legacy table, a wiki grant would ALSO
  // satisfy the purpose-blind invoice-facts predicate. This is the structural
  // proof that it did not.
  const legacyCols = (await rootQuery(
    `select column_name from information_schema.columns
       where table_schema='clara' and table_name=$1 order by column_name`,
    [LEGACY_CONSENT_TABLE])).rows.map((x) => x.column_name);
  assert.deepEqual(legacyCols, [
    "client_id", "evidence_document_id", "firm_id", "granted_at", "granted_by",
    "id", "revoke_reason", "revoked_at", "revoked_by", "scope_note",
  ], "the legacy consent table carries EXACTLY its 0011/0012 columns — 0020 added none");
  assert.ok(!legacyCols.includes("purpose"), "…and specifically NO purpose column");

  const idx = (await rootQuery(
    `select pg_get_indexdef(ix.indexrelid) as def from pg_index ix
       join pg_class t on t.oid=ix.indrelid join pg_namespace n on n.oid=t.relnamespace
       join pg_class i on i.oid=ix.indexrelid
      where n.nspname='clara' and t.relname=$1 and i.relname='uq_client_egress_consents_one_live'`,
    [LEGACY_CONSENT_TABLE])).rows[0]?.def ?? "";
  assert.ok(/unique index/i.test(idx), "uq_client_egress_consents_one_live still exists");
  assert.ok(/\(client_id\)/.test(idx),
    `…keyed on (client_id) ALONE — no purpose, no NULLS NOT DISTINCT (got ${idx})`);
  assert.ok(/where\s*\(?revoked_at is null\)?/i.test(idx), `…partial on revoked_at is null (got ${idx})`);
});

test("[0020 §1.2]: clara.client_egress_purpose_consents — purpose NON-NULL and closed to wiki_synthesis, evidence NON-NULL, scope_note non-blank, the 0011 paired revocation CHECK", async () => {
  fail0020(live);
  const purposeCol = await rootQuery(
    "select is_nullable from information_schema.columns where table_schema='clara' and table_name=$1 and column_name='purpose'",
    [TYPED_CONSENT_TABLE]);
  assert.equal(purposeCol.rows[0]?.is_nullable, "NO", "purpose is NOT NULL");
  const evCol = await rootQuery(
    "select is_nullable from information_schema.columns where table_schema='clara' and table_name=$1 and column_name='evidence_document_id'",
    [TYPED_CONSENT_TABLE]);
  assert.equal(evCol.rows[0]?.is_nullable, "NO",
    "evidence_document_id is NOT NULL (§1.3 — mandatory; the 0012 owner-declaration path is NOT available for typed consent)");

  const defs = await checkDefs(TYPED_CONSENT_TABLE);
  assert.ok(/purpose/.test(defs) && /'wiki_synthesis'/.test(defs),
    `the purpose CHECK is closed to wiki_synthesis (got ${defs})`);
  assert.ok(/scope_note/.test(defs) && /btrim/i.test(defs),
    `scope_note carries the 0011 non-blank CHECK (got ${defs})`);
  assert.ok(/revoked_at/.test(defs) && /revoked_by/.test(defs) && /revoke_reason/.test(defs),
    "the paired revocation CHECK names all three revoke columns");
});

test("[0020 §1.2]: the three uniqueness surfaces — (id,firm,client), (id,firm,client,purpose) and the PARTIAL one-live-per-(client,purpose)", async () => {
  fail0020(live);
  const defs = (await uniqueIndexDefs(TYPED_CONSENT_TABLE)).join("\n");
  assert.ok(/\(id, ?firm_id, ?client_id\)/.test(defs), `unique(id,firm_id,client_id) present (got:\n${defs})`);
  assert.ok(/\(id, ?firm_id, ?client_id, ?purpose\)/.test(defs),
    "unique(id,firm_id,client_id,purpose) present — §2's activation composite FK target, which is what structurally forces activation.purpose = consent.purpose");
  assert.ok(/\(client_id, ?purpose\)[\s\S]*?where[\s\S]*?revoked_at is null/i.test(defs),
    `partial unique on (client_id,purpose) where revoked_at is null (got:\n${defs})`);
  // §1.2 pins "No NULLS NOT DISTINCT is needed anywhere: purpose is non-null by CHECK."
  assert.ok(!/nulls not distinct/i.test(defs),
    `no NULLS NOT DISTINCT anywhere on the typed relation (got:\n${defs})`);
});

test("[0020 §1.2/§2.2/§3.2]: FORCE ROW LEVEL SECURITY, a SINGLE clara_fn_owner policy, and ZERO table grants to any app role on all three relations — the DEFINER fns are the only surface", async () => {
  fail0020(live);
  for (const rel of NEW_RELATIONS) {
    const flags = await rlsFlags(rel);
    assert.equal(flags?.rls, true, `${rel} has RLS enabled`);
    assert.equal(flags?.force, true, `${rel} has FORCE RLS`);
    assert.deepEqual(await policyRoles(rel), [ROLES.fnOwner],
      `${rel} has exactly one policy audience: clara_fn_owner`);
    for (const role of [ROLES.runtime, ROLES.authenticated, ROLES.agentRo,
      ROLES.wakeInteractive, ROLES.wakeProactive]) {
      assert.equal(await anyTableGrant(role, rel), false,
        `${role} holds NO table privilege of ANY kind on clara.${rel}`);
    }
    // §8 also asserts no table grant on the LEGACY consent relation nor on filings.
    const names = await triggerNames(rel);
    assert.ok(names.length >= 2,
      `${rel} carries the immutability AND no-truncate triggers (got ${names.join(",") || "none"})`);
  }
  for (const rel of [LEGACY_CONSENT_TABLE, "document_filings"]) {
    assert.equal(await anyTableGrant(ROLES.runtime, rel), false,
      `clara_runtime holds NO table privilege on clara.${rel} (§5.1: the DEFINER resolver is the entire surface)`);
  }
});

test("[0020 §1.3]: a typed grant REQUIRES a real, verified, same-firm consent_evidence document — null / wrong-kind / bytes-unverified all refuse CLR28", async () => {
  fail0020(live);
  const { users, firms, clients } = w;
  // (1) null evidence → CLR28. The 0012 owner-declaration path does NOT exist here.
  await assertRaises("CLR28",
    () => grantPurpose(users.alice, { client: clients.A1, evidenceDocument: null, opKey: opk("nullev") }),
    "typed grant with null evidence");
  // (2) a non-consent_evidence document (a plain filed invoice) → CLR28. Note the
  //     typed path does NOT stamp the kind the way legacy grant_client_egress does
  //     (0014); §1.3 requires the kind to ALREADY be consent_evidence.
  const plain = await filedDocument(users.alice, { firm: firms.A, client: clients.A1, kind: "invoice" });
  await assertRaises("CLR28",
    () => grantPurpose(users.alice, { client: clients.A1, evidenceDocument: plain.documentId, opKey: opk("wrongkind") }),
    "typed grant with a non-consent_evidence document");
  // (3) a consent_evidence document whose bytes are NOT verified → CLR28. Mint a
  //     verified one, then root-null bytes_verified_at (no writer produces an
  //     unverified doc post-0007; a targeted fixture surgery, noted).
  const ev = await consentEvidenceDoc(firms.A);
  await unverifyDocumentBytes(ev.documentId);
  await assertRaises("CLR28",
    () => grantPurpose(users.alice, { client: clients.A1, evidenceDocument: ev.documentId, opKey: opk("unverif") }),
    "typed grant with a bytes-unverified consent_evidence document");
  assert.equal(await countRows(TYPED_CONSENT_TABLE, "where client_id=$1", [clients.A1]), 0,
    "none of the three refused grants left a row behind");
});

test("[0020 §1.3 / A20-1]: foreign-firm evidence is refused — §9.1 says CLR28, §7.1 says CLR11; asserted CLR28|CLR11 and RECORDED", async () => {
  fail0020(live);
  const { users, firms, clients } = w;
  const foreign = await consentEvidenceDoc(firms.B);
  const err = await assertRaisesOneOf(["CLR28", "CLR11"],
    () => grantPurpose(users.alice, { client: clients.A1, evidenceDocument: foreign.documentId, opKey: opk("foreignev") }),
    "typed grant with a foreign-firm consent_evidence document");
  noteLane(`[A20-1] foreign-firm evidence refused ${err.code} (reason=${detailReason(err)}) — §9.1 pins CLR28, §7.1 pins CLR11 for document-not-in-firm; the contract is internally inconsistent here`);
});

test("[0020 §1.2 / A20-2]: an OFF-ENUM purpose is refused — §7.1 implies CLR10, §9.1 implies the raw CHECK (23514); asserted CLR10|23514 and RECORDED", async () => {
  fail0020(live);
  const { users, firms, clients } = w;
  const ev = await consentEvidenceDoc(firms.A);
  const err = await assertRaisesOneOf(["CLR10", PG.checkViolation],
    () => grantPurpose(users.alice, {
      client: clients.A1, purpose: "treatment_synthesis",
      evidenceDocument: ev.documentId, opKey: opk("offenum"),
    }),
    "typed grant with an off-enum purpose");
  noteLane(`[A20-2] off-enum purpose refused ${err.code} — §7.1 makes argument validation CLR10, §9.1's "the purpose CHECK rejects" reads as 23514; the contract does not pin which`);
  assert.equal(await countRows(TYPED_CONSENT_TABLE, "where client_id=$1", [clients.A1]), 0,
    "the off-enum grant left no row");
});

test("[0020 §1.2 / §9.1]: INSERT-once, one-live-per-(client,purpose) — a second live typed consent refuses CLR28 duplicate_live", async () => {
  fail0020(live);
  const { users, firms, clients } = w;
  const ev1 = await consentEvidenceDoc(firms.A);
  await grantPurpose(users.alice, { client: clients.A2, evidenceDocument: ev1.documentId, scopeNote: "first", opKey: opk("dup1") });
  const c1 = await livePurposeConsent(clients.A2);
  assert.ok(c1?.id, "first typed consent is live");
  assert.equal(c1.purpose, WIKI_PURPOSE, "…carrying the typed purpose");
  assert.equal(c1.evidence_document_id, ev1.documentId, "…bound to the cited evidence document");
  const ev2 = await consentEvidenceDoc(firms.A);
  const err = await assertRaises("CLR28",
    () => grantPurpose(users.alice, { client: clients.A2, evidenceDocument: ev2.documentId, scopeNote: "second", opKey: opk("dup2") }),
    "a second LIVE typed consent for the same (client,purpose)");
  assert.equal(detailReason(err), "duplicate_live", "the refusal reason is duplicate_live");
  assert.equal((await purposeConsentRows(clients.A2)).filter((r) => r.revoked_at == null).length, 1,
    "still exactly ONE live typed consent (the second insert never landed)");
});

test("[0020 §1.2]: the immutability trigger — DELETE → CLR08; UPDATE outside {revoked_by,revoked_at,revoke_reason} → CLR08; TRUNCATE refused", async () => {
  fail0020(live);
  const { users, firms, clients } = w;
  // A1 carries no live typed consent yet in this file (every §1.3/A20-2 grant
  // refused), so a fresh grant here lands cleanly and gives an INSERT-once row.
  const ev = await consentEvidenceDoc(firms.A);
  await grantPurpose(users.alice, { client: clients.A1, evidenceDocument: ev.documentId, opKey: opk("immut") });
  const c = await livePurposeConsent(clients.A1);
  assert.ok(c?.id, "a typed consent row exists to probe");
  // Root DML trips the BEFORE trigger (fires for superuser; RLS bypass is irrelevant).
  await assertRaises(CLR.immutable, () => rootQuery(`delete from clara.${TYPED_CONSENT_TABLE} where id=$1`, [c.id]),
    "DELETE of a typed consent");
  await assertRaises(CLR.immutable,
    () => rootQuery(`update clara.${TYPED_CONSENT_TABLE} set scope_note='mutated' where id=$1`, [c.id]),
    "UPDATE of a non-revocation column");
  await assertRaises(CLR.immutable,
    () => rootQuery(`update clara.${TYPED_CONSENT_TABLE} set client_id=$2 where id=$1`, [c.id, clients.A2]),
    "UPDATE of the client_id (attribution) column");
  await assertRaises(CLR.immutable,
    () => rootQuery(`update clara.${TYPED_CONSENT_TABLE} set purpose='treatment_synthesis' where id=$1`, [c.id]),
    "UPDATE of the purpose column — a typed consent can never be re-purposed in place");
  // TRUNCATE: the no-truncate TRIGGER is asserted STRUCTURALLY as well as
  // behaviourally, because a relation referenced by an FK is refused 0A000 by
  // PostgreSQL BEFORE any statement trigger can fire — so the behavioural probe
  // alone would silently stop proving the trigger exists.
  for (const rel of [TYPED_CONSENT_TABLE, TYPED_ACTIVATION_TABLE, DISPATCH_AUTH_TABLE]) {
    const trg = await rootQuery(
      `select t.tgname, t.tgtype from pg_trigger t join pg_class cl on cl.oid=t.tgrelid
         join pg_namespace n on n.oid=cl.relnamespace
        where n.nspname='clara' and cl.relname=$1 and not t.tgisinternal`, [rel]);
    assert.ok(trg.rows.some((x) => (Number(x.tgtype) & 32) !== 0),
      `clara.${rel} carries a TRUNCATE-level trigger (0011:1088-1089 shape)`);
    await assertRaisesOneOf([CLR.immutable, PG.insufficientPrivilege, "0A000"],
      () => rootQuery(`truncate clara.${rel}`), `TRUNCATE of clara.${rel}`);
  }
});

test("[0020 §1.2]: REVOKE-once — a second revocation of the same typed consent is refused", async () => {
  fail0020(live);
  const { users, firms } = w;
  const { createClient, seedOpeningCoa } = await import("./wb-fixtures.mjs");
  const client = await createClient(users.alice, { name: `${w.prefix}_rev1`, opKey: opk("cli") });
  await seedOpeningCoa(users.alice, client);
  const ev = await consentEvidenceDoc(firms.A);
  await grantPurpose(users.alice, { client, evidenceDocument: ev.documentId, opKey: opk("rv1") });
  const c = await livePurposeConsent(client);
  assert.ok(c?.id, "a live typed consent to revoke");
  // Root-level second revocation trips the immutability trigger (§1.2: "a second
  // revocation → CLR08"), independently of the owner RPC's own CLR28 state refusal.
  await rootQuery(
    `update clara.${TYPED_CONSENT_TABLE} set revoked_by=$2, revoked_at=now(), revoke_reason='first'
      where id=$1`, [c.id, users.alice]);
  await assertRaises(CLR.immutable,
    () => rootQuery(
      `update clara.${TYPED_CONSENT_TABLE} set revoked_by=$2, revoked_at=now(), revoke_reason='second'
        where id=$1`, [c.id, users.alice]),
    "a SECOND revocation of an already-revoked typed consent");
});
