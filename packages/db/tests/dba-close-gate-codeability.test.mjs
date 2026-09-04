// DB-A -- THE CODEABILITY VOCABULARY AND THE TWO DOCUMENT CLOSE GATES (H-12), plus the bank
// gate's enrolment population (H-55). Battery for the DB-A migration set (numbered at merge):
// dba1 (clara.document_kind_codeability + clara._is_codeable_kind), dba2
// (_close_gate_uncoded / _close_gate_undated) and dba3 (_close_gate_bank_items +
// _bank_enrolled_fy_months).
//
// THE GATE BELOW READS THE CATALOG, never a filename and never a schema_migrations row, so a
// renumber can never move what this battery asserts.
//
// EVERY POSITIVE CELL HAS ITS MUST-NOT-GO-GREEN CONTROL. An exclusion is trivially satisfied
// by excluding everything -- a gate that always passes is the defect, not the fix -- so each
// "this vanished" assertion is paired with a "this REMAINED" one on the same fixture, in the
// same read.
//
// NEVER LIVE: this file drives writes and runs only against a disposable rig.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  rootQuery, endPool, printLaneNotes, noteLane, printSkipCount, markSkip,
  waveAEnsureReady, filedDocument,
} from "./wave-a-fixtures.mjs";
import * as wb from "./wave-b/wb-fixtures.mjs";
import { has0056, caught, cleanCloseableFY, beginClose, attestClose } from "./x56-fixtures.mjs";

let ready = false, world = null;

/** Present iff the DB-A codeability set is applied. Read from the CATALOG (law 3: the
 *  migration's NAME is a projection of the change, the objects are the change). */
async function hasDbaCodeability() {
  const r = await rootQuery(
    `select (to_regclass('clara.document_kind_codeability') is not null) as t,
            (to_regprocedure('clara._is_codeable_kind(text)') is not null) as f,
            (to_regprocedure('clara._bank_enrolled_fy_months(uuid,date,date)') is not null) as e`);
  return r.rows[0].t && r.rows[0].f && r.rows[0].e;
}

before(async () => {
  const base = await waveAEnsureReady();
  if (!base) { noteLane("0011 surface absent — DB-A codeability battery dormant"); return; }
  if (!(await has0056())) { noteLane("0056 not applied — close model absent"); return; }
  if (!(await hasDbaCodeability())) { noteLane("DB-A codeability set not applied — battery dormant"); return; }
  ready = true;
  world = await wb.buildWaveBWorld();
});
after(async () => {
  printLaneNotes("dba-close-gate-codeability");
  printSkipCount("dba-close-gate-codeability");
  await endPool();
});

function gate(t) {
  if (!ready) { markSkip(); t.skip("DB-A codeability surface absent"); return true; }
  return false;
}

const firmOfClient = async (client) =>
  (await rootQuery("select firm_id from clara.clients where id=$1", [client])).rows[0].firm_id;
const uncodedGate = async (client, fy) =>
  (await rootQuery("select clara._close_gate_uncoded($1,$2) as r", [client, fy])).rows[0].r;
const undatedGate = async (client, fy) =>
  (await rootQuery("select clara._close_gate_undated($1,$2) as r", [client, fy])).rows[0].r;
const bankGate = async (client, fy) =>
  (await rootQuery("select clara._close_gate_bank_items($1,$2) as r", [client, fy])).rows[0].r;
const fyBounds = async (fy) =>
  (await rootQuery("select starts_on::text s, ends_on::text e from clara.fiscal_years where id=$1", [fy])).rows[0];

// =====================================================================================
// DBA-1 -- THE VOCABULARY IS TOTAL, AND THE DRIFT GUARD IS DERIVED.
// =====================================================================================

test("dba.1a the codeability roster is TOTAL over documents_document_kind_check, in both directions — derived from the CHECK, never typed", async (t) => {
  if (gate(t)) return;
  const r = await rootQuery(
    `with roster as (select unnest(clara._document_kind_roster()) as kind),
          seeded as (select kind from clara.document_kind_codeability)
     select (select count(*)::int from roster) as n_roster,
            (select count(*)::int from seeded) as n_seeded,
            (select coalesce(array_agg(kind order by kind), '{}') from roster
              where kind not in (select kind from seeded)) as missing,
            (select coalesce(array_agg(kind order by kind), '{}') from seeded
              where kind not in (select kind from roster)) as extra`);
  const row = r.rows[0];
  assert.ok(row.n_roster > 0,
    "mandatory setup: the derived roster is non-empty — an empty roster would make the totality assertion vacuous");
  assert.deepEqual(row.missing, [],
    "every kind documents_document_kind_check admits is named in clara.document_kind_codeability");
  assert.deepEqual(row.extra, [],
    "and the table names no kind the vocabulary does not admit");
  assert.equal(row.n_seeded, row.n_roster, "so the two rosters are the same set, not merely overlapping");
});

test("dba.1b the predicate fails toward VISIBLE on both unknowns: a NULL kind and a kind the table does not name both read codeable", async (t) => {
  if (gate(t)) return;
  const r = await rootQuery(
    `select clara._is_codeable_kind(null) as null_kind,
            clara._is_codeable_kind('zzz_future_kind_' || gen_random_uuid()::text) as unseen,
            clara._is_codeable_kind('invoice') as invoice,
            clara._is_codeable_kind('bank_statement') as statement,
            clara._is_codeable_kind('consent_evidence') as consent`);
  const row = r.rows[0];
  assert.equal(row.null_kind, true,
    "an UNCLASSIFIED document is still work — somebody must say what it is, so it must stay visible");
  assert.equal(row.unseen, true,
    "a twenty-first kind nobody has ruled on yet is work UNTIL somebody rules — the closed-enumeration mistake, refused");
  assert.equal(row.invoice, true, "an invoice owes an entry");
  assert.equal(row.statement, false, "a bank statement never carries a journal entry on the document itself");
  assert.equal(row.consent, false, "and consent evidence is structurally exempt from facts extraction");
});

test("dba.1b2 裁-191: tax_correspondence and agreement_contract are BOTH codeable, and the split is 12 / 8", async (t) => {
  if (gate(t)) return;
  const r = await rootQuery(
    `select clara._is_codeable_kind('tax_correspondence') as tax,
            clara._is_codeable_kind('agreement_contract') as contract,
            (select count(*) filter (where codeable)::int from clara.document_kind_codeability) as yes,
            (select count(*) filter (where not codeable)::int from clara.document_kind_codeability) as no,
            (select basis from clara.document_kind_codeability where kind='tax_correspondence') as tax_basis,
            (select basis from clara.document_kind_codeability where kind='agreement_contract') as contract_basis`);
  const row = r.rows[0];
  assert.equal(row.tax, true,
    "a Notice of Assessment creates a bookable liability — 裁-191 ruled this kind codeable, 宁可误报、不可漏报");
  assert.equal(row.contract, true,
    "a hire-purchase or finance lease creates a liability and an asset at inception — 裁-191 ruled this kind codeable too");
  assert.equal(row.yes, 12, "twelve kinds owe an entry");
  assert.equal(row.no, 8, "and eight never do");
  // The BASIS is what makes a future flip an informed change rather than a guess, so it is
  // pinned to the ruling rather than left to drift into a one-word note.
  assert.match(row.tax_basis, /Notice of Assessment/, "the basis names why, in the owner's own terms");
  assert.match(row.contract_basis, /hire-purchase|finance lease/, "same for the contract row");
});

test("dba.1c the vocabulary is DATA the owner can change without a migration, and no app role can change it", async (t) => {
  if (gate(t)) return;
  const acl = await rootQuery(
    `select has_table_privilege('clara_authenticated','clara.document_kind_codeability','SELECT') as sel,
            has_table_privilege('clara_authenticated','clara.document_kind_codeability','UPDATE') as upd,
            has_table_privilege('clara_authenticated','clara.document_kind_codeability','INSERT') as ins,
            has_table_privilege('clara_authenticated','clara.document_kind_codeability','DELETE') as del,
            has_table_privilege('clara_agent_ro','clara.document_kind_codeability','SELECT') as agent_sel,
            (select relforcerowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace
              where n.nspname='clara' and c.relname='document_kind_codeability') as forced,
            (select count(*)::int from pg_policies
              where schemaname='clara' and tablename='document_kind_codeability') as policies`);
  const row = acl.rows[0];
  assert.equal(row.sel, true, "a professional can READ why their document is or is not in the lane");
  assert.equal(row.upd, false, "and cannot rewrite the accounting judgement from the browser");
  assert.equal(row.ins, false, "nor insert a kind");
  assert.equal(row.del, false, "nor delete one");
  assert.equal(row.agent_sel, false,
    "the agent lane holds NO direct table privilege — it reaches the vocabulary only through the DEFINER predicate");
  assert.equal(row.forced, true, "forced RLS, so even the owner reads through a policy");
  assert.equal(row.policies, 2, "exactly two policies: the owner's ALL and clara_authenticated's SELECT");

  // THE OWNER'S CHANGE IS A ROW, NOT A MIGRATION — proven by making one and reading the
  // predicate flip, then putting it back. This is the whole justification for the table.
  await rootQuery("update clara.document_kind_codeability set codeable=true where kind='bank_statement'");
  const flipped = (await rootQuery("select clara._is_codeable_kind('bank_statement') as r")).rows[0].r;
  await rootQuery("update clara.document_kind_codeability set codeable=false where kind='bank_statement'");
  const restored = (await rootQuery("select clara._is_codeable_kind('bank_statement') as r")).rows[0].r;
  assert.equal(flipped, true, "flipping the ROW flips the predicate — no migration, no deploy");
  assert.equal(restored, false, "and the seeded judgement is back");
});

// =====================================================================================
// DBA-2 (H-12) -- THE TWO DOCUMENT GATES.
// =====================================================================================

test("dba.2a H-12: a filed BANK STATEMENT dated inside the FY with no entry no longer fails uncoded_documents — and an INVOICE in the identical shape still does", async (t) => {
  if (gate(t)) return;
  const owner = world.users.alice, prep = world.users.bob;
  const fx = await cleanCloseableFY(owner, { tag: "dba2a", prepSub: prep });
  const firm = await firmOfClient(fx.client);
  const b = await fyBounds(fx.fy);

  const before0 = await uncodedGate(fx.client, fx.fy);
  assert.equal(before0.state, "pass", "mandatory setup: the fixture year starts with nothing uncoded");

  // ingest_bank_statement stamps financial_date = period_end unconditionally (0038:1846), so
  // an in-year statement is exactly this shape.
  const stmt = await filedDocument(prep, { firm, client: fx.client, kind: "bank_statement", financialDate: b.e });
  const afterStmt = await uncodedGate(fx.client, fx.fy);
  assert.equal(afterStmt.state, "pass",
    "the filed statement is NOT an uncoded document — before this change it failed the gate permanently for the year");
  assert.equal(afterStmt.uncoded_count, 0, "and contributes nothing to the population");
  assert.equal(afterStmt.population_basis, "codeable_kinds_v1",
    "the payload names the basis, so an attestation signed before this change is provably a different claim");

  // MUST-NOT-GO-GREEN: the same shape with a codeable kind.
  const inv = await filedDocument(prep, { firm, client: fx.client, kind: "invoice", financialDate: b.e });
  const afterInv = await uncodedGate(fx.client, fx.fy);
  assert.equal(afterInv.state, "fail",
    "an INVOICE filed in the year with no entry STILL fails — the exclusion is not a blanket");
  assert.deepEqual(afterInv.uncoded.map((x) => x.filing_id), [inv.filingId],
    "and the gate names THAT filing, not the statement — the change is attributed, never just observed");
  assert.ok(!afterInv.uncoded.some((x) => x.document_id === stmt.documentId),
    "the statement is absent from the itemised population");
});

test("dba.2b H-12 sibling: an UNDATED consent_evidence filing leaves undated_documents, an UNCLASSIFIED one stays", async (t) => {
  if (gate(t)) return;
  const owner = world.users.alice, prep = world.users.bob;
  const fx = await cleanCloseableFY(owner, { tag: "dba2b", prepSub: prep });
  const firm = await firmOfClient(fx.client);

  assert.equal((await undatedGate(fx.client, fx.fy)).state, "pass",
    "mandatory setup: the fixture year starts with nothing undated");

  await filedDocument(prep, { firm, client: fx.client, kind: "consent_evidence" }); // financialDate null
  const afterConsent = await undatedGate(fx.client, fx.fy);
  assert.equal(afterConsent.state, "pass",
    "consent evidence can never carry an entry (0014 exempts it; set_document_kind refuses the kind), so it is not outstanding work");
  assert.equal(afterConsent.undated_count, 0);

  // MUST-NOT-GO-GREEN: a NULL kind is admitted, because an unclassified document IS work.
  const unk = await filedDocument(prep, { firm, client: fx.client });
  const afterUnk = await undatedGate(fx.client, fx.fy);
  assert.equal(afterUnk.state, "unknown",
    "an UNCLASSIFIED undated filing still reads unknown — a NULL kind must never be hidden");
  assert.deepEqual(afterUnk.undated.map((x) => x.filing_id), [unk.filingId],
    "and it is that filing the gate names");
  assert.equal(afterUnk.population_basis, "codeable_kinds_v1");
});

test("dba.2c the two gates share ONE definition: flipping the codeability row moves BOTH populations together", async (t) => {
  if (gate(t)) return;
  const owner = world.users.alice, prep = world.users.bob;
  const fx = await cleanCloseableFY(owner, { tag: "dba2c", prepSub: prep });
  const firm = await firmOfClient(fx.client);
  const b = await fyBounds(fx.fy);
  await filedDocument(prep, { firm, client: fx.client, kind: "ssm_company_doc", financialDate: b.s });
  await filedDocument(prep, { firm, client: fx.client, kind: "ssm_company_doc" });

  assert.equal((await uncodedGate(fx.client, fx.fy)).state, "pass", "dated: excluded");
  assert.equal((await undatedGate(fx.client, fx.fy)).state, "pass", "undated: excluded");

  await rootQuery("update clara.document_kind_codeability set codeable=true where kind='ssm_company_doc'");
  try {
    assert.equal((await uncodedGate(fx.client, fx.fy)).state, "fail",
      "one row flipped, and the DATED gate now counts it");
    assert.equal((await undatedGate(fx.client, fx.fy)).state, "unknown",
      "and the UNDATED gate moved with it — a divergence between the two would be a hole, not a difference");
  } finally {
    await rootQuery("update clara.document_kind_codeability set codeable=false where kind='ssm_company_doc'");
  }
  assert.equal((await uncodedGate(fx.client, fx.fy)).state, "pass", "and both are back after the row is restored");
  assert.equal((await undatedGate(fx.client, fx.fy)).state, "pass");
});

// =====================================================================================
// DBA-3 (H-55) -- THE BANK GATE'S ENROLMENT POPULATION.
// =====================================================================================

test("dba.3a H-55: an ENROLLED bank account with zero statements reads UNKNOWN and names the account — it read pass before", async (t) => {
  if (gate(t)) return;
  const owner = world.users.alice, prep = world.users.bob;
  const fx = await cleanCloseableFY(owner, { tag: "dba3a", prepSub: prep });
  const firm = await firmOfClient(fx.client);
  const b = await fyBounds(fx.fy);

  // THE HONEST EMPTY WORLD FIRST, and it must not have moved: cleanCloseableFY declares
  // banking_arrangement='no_accounts', so a genuinely bank-less client passes.
  const empty = await bankGate(fx.client, fx.fy);
  assert.equal(empty.state, "pass",
    "mandatory setup: a DECLARED bank-less client still passes — nothing to reconcile is not the same as nothing measured");
  assert.equal(empty.not_measurable, false, "and nothing is unmeasurable on it");
  assert.equal(empty.accounts_basis, "enrolled_bank_accounts_v1",
    "the payload names its account basis, so a digest taken before this change is distinguishable from one after");

  // ENROL ONE ACCOUNT, INGEST NOTHING. Registered on the first day of the year.
  await rootQuery(
    `insert into clara.coa_accounts(client_id, firm_id, account_code, name, account_type, is_active, is_bank_account)
       values ($1,$2,'980-DBA3','DB-A rig bank','asset', true, true)`, [fx.client, firm]);
  await rootQuery(
    `insert into clara.bank_institutions(code, name) select 'DBARIGBANK','DB-A rig institution'
      where not exists (select 1 from clara.bank_institutions where code='DBARIGBANK')`);
  const acct = (await rootQuery(
    `insert into clara.bank_accounts(firm_id, client_id, bank_code, bank_name_display, account_number,
        account_number_normalized, coa_account_code, created_by, created_at)
       values ($1,$2,'DBARIGBANK','DB-A rig institution','70001234','70001234','980-DBA3',$3,
               ($4::date)::timestamptz) returning id`,
    [firm, fx.client, owner, b.s])).rows[0].id;

  const g = await bankGate(fx.client, fx.fy);
  assert.equal(g.state, "unknown",
    "an enrolled account with no statements at all is not a measurement of unreconciled items — it is the evidence being absent");
  assert.equal(g.not_measurable, true, "and the gate says so explicitly");
  assert.deepEqual(g.no_statements.map((x) => x.bank_account_id), [acct],
    "naming the account it cannot measure, so the professional knows which one to chase");
  assert.deepEqual(g.statement_gaps, [],
    "and it does NOT dress an unanswerable question up as twelve month-gap findings");
  assert.equal(g.no_registered_account, false,
    "0121's arm 4 is a DIFFERENT question and still answers no — the registry itself is fine, it just has not been fed");
});

test("dba.3a2 ARM 0: a fiscal year that does not exist reads UNKNOWN and asserts nothing it did not measure", async (t) => {
  if (gate(t)) return;
  const owner = world.users.alice, prep = world.users.bob;
  const fx = await cleanCloseableFY(owner, { tag: "dba3a2", prepSub: prep });
  // A real client, a fiscal-year id that names no row. Without ARM 0 every population below
  // is empty and the gate answers `pass` about a year it could not find.
  const g = await bankGate(fx.client, "00000000-0000-0000-0000-000000000000");
  assert.equal(g.state, "unknown", "the gate does not pass on a year it cannot see");
  assert.equal(g.reason, "fiscal_year_not_found", "and says exactly why");
  assert.equal(g.not_measurable, true);
  assert.equal(g.registry_state, null, "the registry was never consulted, so no verdict is reported");
  assert.equal(g.no_registered_account, null,
    "and no_registered_account is NULL, not false — `false` would assert the registry is fine, which this arm never measured");
});

test("dba.3b the enrolled window is per account: a January registration owes 12 months, a July one owes 6", async (t) => {
  if (gate(t)) return;
  const owner = world.users.alice, prep = world.users.bob;
  const fx = await cleanCloseableFY(owner, { tag: "dba3b", prepSub: prep });
  const firm = await firmOfClient(fx.client);
  const b = await fyBounds(fx.fy);
  const july = `${b.s.slice(0, 4)}-07-10`;

  await rootQuery(
    `insert into clara.bank_institutions(code, name) select 'DBARIGBANK','DB-A rig institution'
      where not exists (select 1 from clara.bank_institutions where code='DBARIGBANK')`);
  for (const [code, num, when] of [["981-DBA3", "70002001", b.s], ["982-DBA3", "70002002", july]]) {
    await rootQuery(
      `insert into clara.coa_accounts(client_id, firm_id, account_code, name, account_type, is_active, is_bank_account)
         values ($1,$2,$3,'DB-A rig bank','asset', true, true)`, [fx.client, firm, code]);
    await rootQuery(
      `insert into clara.bank_accounts(firm_id, client_id, bank_code, bank_name_display, account_number,
          account_number_normalized, coa_account_code, created_by, created_at)
         values ($1,$2,'DBARIGBANK','DB-A rig institution',$3,$3,$4,$5,($6::date)::timestamptz)`,
      [firm, fx.client, num, code, owner, when]);
  }
  const r = await rootQuery(
    `select ba.coa_account_code as code, count(m.*)::int as months
       from clara.bank_accounts ba
       left join clara._bank_enrolled_fy_months($1,$2::date,$3::date) m on m.bank_account_id = ba.id
      where ba.client_id = $1 group by 1 order by 1`,
    [fx.client, b.s, b.e]);
  const byCode = Object.fromEntries(r.rows.map((x) => [x.code, x.months]));
  assert.equal(byCode["981-DBA3"], 12, "an account registered on day one of the year owes every month of it");
  assert.equal(byCode["982-DBA3"], 6,
    "an account registered in July owes July to December — a universe that ignored the registration date would false-FAIL every mid-year account");
});

test("dba.3d the unmeasurable account is an OUTSTANDING ITEM a professional can name — and drawer 1 independently refuses the same shape, so this was a dead end rather than an unsafe seal", async (t) => {
  if (gate(t)) return;
  const owner = world.users.alice, prep = world.users.bob;
  const fx = await cleanCloseableFY(owner, { tag: "dba3d", prepSub: prep });
  const firm = await firmOfClient(fx.client);
  const b = await fyBounds(fx.fy);
  const yr = b.s.slice(0, 4);

  // TWO enrolled accounts. Account A is covered January-November, so it carries exactly ONE
  // enumerated finding (December's gap). Account B holds no statement at all, so it is the
  // UNMEASURABLE population dba3 added and dba8 makes outstanding.
  await rootQuery(
    `insert into clara.bank_institutions(code, name) select 'DBARIGBANK','DB-A rig institution'
      where not exists (select 1 from clara.bank_institutions where code='DBARIGBANK')`);
  const acct = {};
  for (const [tag, code, num] of [["A", "990-DBAD", "70009001"], ["B", "991-DBAD", "70009002"]]) {
    await rootQuery(
      `insert into clara.coa_accounts(client_id, firm_id, account_code, name, account_type, is_active, is_bank_account)
         values ($1,$2,$3,'DB-A rig bank','asset', true, true)`, [fx.client, firm, code]);
    acct[tag] = (await rootQuery(
      `insert into clara.bank_accounts(firm_id, client_id, bank_code, bank_name_display, account_number,
          account_number_normalized, coa_account_code, created_by, created_at)
         values ($1,$2,'DBARIGBANK','DB-A rig institution',$3,$3,$4,$5,($6::date)::timestamptz) returning id`,
      [firm, fx.client, num, code, owner, b.s])).rows[0].id;
  }
  for (let m = 1; m <= 11; m++) {
    const mm = String(m).padStart(2, "0");
    const last = new Date(Number(yr), m, 0).getDate();
    const doc = await filedDocument(prep, { firm, client: fx.client, kind: "bank_statement", financialDate: `${yr}-${mm}-${last}` });
    await rootQuery(
      `insert into clara.bank_statements(firm_id, client_id, bank_account_id, document_id, source_doc_sha256,
          filing_id, facts_hash, period_start, period_end, statement_date, opening_cents, closing_cents,
          line_count, ingest_mode)
         values ($1,$2,$3,$4,$5,$6,'\\x00'::bytea,($7)::date,($8)::date,($8)::date,0,0,0,'structured')`,
      [firm, fx.client, acct.A, doc.documentId, doc.sha256, doc.filingId, `${yr}-${mm}-01`, `${yr}-${mm}-${last}`]);
  }

  const g = await bankGate(fx.client, fx.fy);
  assert.equal(g.state, "fail", "mandatory setup: a measured gap outranks, so the gate reads fail");
  assert.deepEqual(g.statement_gaps.map((x) => x.month), [`${yr}-12`],
    "exactly ONE enumerated finding — account A's December");
  assert.deepEqual(g.no_statements.map((x) => x.bank_account_id), [acct.B],
    "and account B is the unmeasurable population");

  // (1) THE ITEM LIST is what every drawer-2 consumer reads. Before dba8 it named the gap
  // ALONE, so account B was in NO consumer's list and could not be attested by name.
  const items = (await rootQuery(
    "select clara._gate_outstanding_items('open_bank_recon_items', $1::jsonb) as r", [JSON.stringify(g)])).rows[0].r;
  assert.ok(items.includes(`${acct.B}:no_statements`),
    "the unmeasurable account is an OUTSTANDING ITEM — the gate now carries its own population into the one list its consumers read");
  assert.ok(items.includes(`${acct.A}:${yr}-12`), "beside the gap, whose key shape is unchanged");
  assert.equal(items.length, 2, "two outstanding items, and the two key shapes do not collide");

  // (2) THE PROFESSIONAL CAN NAME IT, through the real door. attest_close_exception derives
  // its accepted key domain from that same list (0120:979-994), so this is the user-facing
  // half of the repair: before dba8 this exact call refused `attest_item_unknown`.
  const begun = await beginClose(owner, { fy: fx.fy });
  const att = await attestClose(owner, {
    closeRun: begun.close_run_id, checkKey: "open_bank_recon_items",
    reason: "dba3d: account B holds no statement for the year, accepted and recorded",
    itemKey: `${acct.B}:no_statements`,
  });
  assert.ok(att, "the account is attestable BY NAME");
  const stored = await rootQuery(
    `select item_key from clara.close_attestations
      where close_run_id=$1 and check_key='open_bank_recon_items' and superseded_at is null`,
    [begun.close_run_id]);
  assert.deepEqual(stored.rows.map((x) => x.item_key), [`${acct.B}:no_statements`],
    "and the attestation is recorded against that item, never as a blanket");

  // (3) MUST-NOT-GO-GREEN: a key this gate does NOT name is still refused, so (2) proves an
  // enumeration and not a widening of what may be attested.
  const bad = await caught(() => attestClose(owner, {
    closeRun: begun.close_run_id, checkKey: "open_bank_recon_items",
    reason: "dba3d: an account that is not outstanding", itemKey: `${acct.A}:no_statements`,
  }));
  assert.ok(bad, "an account that is NOT in the unmeasurable population cannot be attested");
  assert.equal(JSON.parse(bad.detail ?? "{}").reason, "attest_item_unknown",
    "and it is refused as attest_item_unknown, by the door's own typed reason");

  // (4) THE HONEST BOUND ON THE CLAIM. This shape was never an unsafe SEAL: the DRAWER-1
  // bank_recon_identity gate enumerates from the same registry and answers `unknown` /
  // no_statements_loaded for a statement-less account, and a drawer-1 unknown refuses
  // absolutely with no attestation path. Measured here so nobody reads (1)-(3) as "the close
  // was sealing" — and asserted, so if that neighbour ever stops refusing, this cell says so.
  const identity = (await rootQuery(
    "select clara.bank_recon_close_state($1,$2) as r", [fx.client, fx.fy])).rows[0].r;
  assert.equal(identity.state, "unknown",
    "drawer-1 bank_recon_identity independently refuses this shape today");
  const bRow = (identity.accounts ?? []).find((x) => x.bank_account_id === acct.B);
  assert.equal(bRow?.strict?.reason, "no_statements_loaded",
    "naming the same account for the same reason — which is why the drawer-2 enumeration had to be fixed rather than leaned on");
});

test("dba.3c the gap arm still measures: an account WITH statements reports its missing months as a FAIL, not an unknown", async (t) => {
  if (gate(t)) return;
  const owner = world.users.alice, prep = world.users.bob;
  const fx = await cleanCloseableFY(owner, { tag: "dba3c", prepSub: prep });
  const firm = await firmOfClient(fx.client);
  const b = await fyBounds(fx.fy);
  const yr = b.s.slice(0, 4);

  await rootQuery(
    `insert into clara.coa_accounts(client_id, firm_id, account_code, name, account_type, is_active, is_bank_account)
       values ($1,$2,'983-DBA3','DB-A rig bank','asset', true, true)`, [fx.client, firm]);
  await rootQuery(
    `insert into clara.bank_institutions(code, name) select 'DBARIGBANK','DB-A rig institution'
      where not exists (select 1 from clara.bank_institutions where code='DBARIGBANK')`);
  const acct = (await rootQuery(
    `insert into clara.bank_accounts(firm_id, client_id, bank_code, bank_name_display, account_number,
        account_number_normalized, coa_account_code, created_by, created_at)
       values ($1,$2,'DBARIGBANK','DB-A rig institution','70003001','70003001','983-DBA3',$3,
               ($4::date)::timestamptz) returning id`,
    [firm, fx.client, owner, b.s])).rows[0].id;

  // ONE month of statement. The account is now measurable, and eleven months are missing.
  const doc = await filedDocument(prep, { firm, client: fx.client, kind: "bank_statement", financialDate: `${yr}-01-31` });
  await rootQuery(
    `insert into clara.bank_statements(firm_id, client_id, bank_account_id, document_id, source_doc_sha256,
        filing_id, facts_hash, period_start, period_end, statement_date, opening_cents, closing_cents,
        line_count, ingest_mode)
       values ($1,$2,$3,$4,$5,$6,'\\x00'::bytea,($7||'-01-01')::date,($7||'-01-31')::date,
               ($7||'-01-31')::date,0,0,0,'structured')`,
    [firm, fx.client, acct, doc.documentId, doc.sha256, doc.filingId, yr]);

  const g = await bankGate(fx.client, fx.fy);
  assert.equal(g.state, "fail",
    "an account that HAS statements and is missing months is a MEASURED finding, not an unmeasurable one");
  assert.deepEqual(g.no_statements, [],
    "and it is no longer in the unmeasurable population — one statement is enough to make it measurable");
  assert.equal(g.not_measurable, false);
  assert.equal(g.statement_gaps.length, 11,
    "eleven months of the twelve are missing, and the gate itemises them");
  assert.ok(g.statement_gaps.every((x) => x.bank_account_id === acct),
    "every gap is attributed to the account that owes it");
  assert.equal(g.unmatched_lines_basis, "exceptions_gaps_registry_and_enrolment_v1c",
    "the basis literal moved, so a measured_digest from before this change cannot be mistaken for one after");
});
