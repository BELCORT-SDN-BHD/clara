// Slice-6 counterparty identity law (0009-GATED). Exercises _resolve_counterparty
// THROUGH the public human write surface (draft_entry → approve_entry → revise_entry):
// registration-dominant reuse, registration conflict (CLR23), registered-name-without-
// registration ambiguity refusal (CLR23), name-match-among-unregistered reuse, birth, and
// fingerprint congruence at approve after a landscape change with revise as the convergent
// act. Companion §2 (identity law C-5/NEW-3), contract §5; INTERFACE-PINS §5(D).
//
// Self-contained on relay-fixtures (the runtime test pool). Counterparties/resolutions are
// seeded as superuser test metadata (they have no public INSERT writer other than the very
// birth-on-approve path under test); every draft/approve/revise goes through the audited
// 0009 writers. SKIPS until 0009 is applied (probe: counterparties + revise_entry).

import { test } from "node:test";
import assert from "node:assert/strict";
import { after } from "node:test";
import { setTimeout as sleep } from "node:timers/promises";
import { rootQuery, humanQuery, opk, buildFirm, endPool, getPool } from "./relay-fixtures.mjs";

after(async () => {
  await endPool();
});

async function s6Ready() {
  const r = await rootQuery(
    `select (select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
               where n.nspname='clara' and c.relname='counterparties' limit 1) as tbl,
            (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
               where n.nspname='clara' and p.proname='revise_entry' limit 1) as fn`,
  );
  return r.rows[0].tbl != null && r.rows[0].fn != null;
}
const skip = (await s6Ready()) ? false : "Slice-6 (0009) coding-floor surface absent — migrate 0009 first";

const normalize = (s) => (s == null ? null : String(s).toLowerCase().replace(/[^a-z0-9]/g, ""));

// A client resolution the draft binds to. assert_client_resolved for a non-document draft
// only needs a live human/rule resolution (confidence >= 0.95) for the client.
async function seedResolution(firm, client) {
  const r = await rootQuery(
    `insert into clara.client_resolutions(firm_id,client_id,subject_kind,subject_id,confidence,method,evidence,resolved_by)
       values($1,$2,'document',gen_random_uuid(),1.0,'human','{}'::jsonb,null) returning id`,
    [firm, client],
  );
  return r.rows[0].id;
}

async function seedCounterparty(firm, client, createdBy, { name, reg = null }) {
  const r = await rootQuery(
    `insert into clara.counterparties(firm_id,client_id,kind,name,name_normalized,registration_no,registration_normalized,created_by)
       values($1,$2,'vendor',$3,$4,$5,$6,$7) returning id`,
    [firm, client, name, normalize(name), reg, normalize(reg), createdBy],
  );
  return r.rows[0].id;
}

async function upsertAcct(owner, client, code, name, type, cls = null) {
  if (cls == null) {
    await humanQuery(owner, "select clara.upsert_account(p_client=>$1,p_code=>$2,p_name=>$3,p_type=>$4,p_op_key=>$5) as r",
      [client, code, name, type, opk("acct")]);
  } else {
    await humanQuery(owner, "select clara.upsert_account(p_client=>$1,p_code=>$2,p_name=>$3,p_type=>$4,p_account_class=>$5,p_op_key=>$6) as r",
      [client, code, name, type, cls, opk("acct")]);
  }
}

/** A firm+client with a resolution, a payable control account, and an expense account. */
async function setup() {
  const { owner, firm, client } = await buildFirm("ident");
  const resolution = await seedResolution(firm, client);
  await upsertAcct(owner, client, "5000", "Office Expense", "expense");
  await upsertAcct(owner, client, "2000", "Trade Creditors", "liability", "payable");
  return { owner, firm, client, resolution };
}

async function draftBill(owner, { client, resolution, amount = 10000, vendor }) {
  const lines = [
    { account_code: "5000", debit_cents: amount, credit_cents: 0, description: "exp" },
    { account_code: "2000", debit_cents: 0, credit_cents: amount, description: "ap" },
  ];
  const r = await humanQuery(
    owner,
    `select clara.draft_entry(p_client=>$1,p_resolution=>$2,p_posting_date=>$3::date,p_memo=>$4,
       p_lines=>$5::jsonb,p_op_key=>$6,p_proposed_counterparty=>$7::jsonb) as r`,
    [client, resolution, "2026-03-15", "identity rig", JSON.stringify(lines), opk("draft"), JSON.stringify(vendor)],
  );
  return r.rows[0].r;
}

async function approve(owner, entry, token) {
  const r = await humanQuery(
    owner,
    "select clara.approve_entry(p_entry=>$1,p_expected_revision=>$2,p_attestation=>$3,p_op_key=>$4) as r",
    [entry, token, "identity rig attest", opk("appr")],
  );
  return r.rows[0].r;
}

async function revise(owner, entry, token, vendor) {
  const lines = [
    { account_code: "5000", debit_cents: 10000, credit_cents: 0, description: "exp" },
    { account_code: "2000", debit_cents: 0, credit_cents: 10000, description: "ap" },
  ];
  const r = await humanQuery(
    owner,
    `select clara.revise_entry(p_entry=>$1,p_lines=>$2::jsonb,p_proposed_counterparty=>$3::jsonb,
       p_evidence=>null,p_expected_revision=>$4,p_op_key=>$5) as r`,
    [entry, JSON.stringify(lines), JSON.stringify(vendor), token, opk("rev")],
  );
  return r.rows[0].r;
}

const cpRows = async (client) =>
  (await rootQuery("select id,name,name_normalized,registration_normalized from clara.counterparties where client_id=$1 order by created_at", [client])).rows;
const payableCounterparty = async (entry) =>
  (await rootQuery(
    `select l.counterparty_id from clara.journal_lines l join clara.coa_accounts a
       on a.client_id=l.client_id and a.account_code=l.account_code
      where l.entry_id=$1 and a.account_class='payable'`,
    [entry],
  )).rows[0]?.counterparty_id ?? null;

test("birth: approve of a new-vendor draft creates the counterparty and stamps the payable line", { skip }, async () => {
  const { owner, client, resolution } = await setup();
  const d = await draftBill(owner, { client, resolution, vendor: { new: { name: "Acme Supplies Sdn Bhd" } } });
  await approve(owner, d.entry_id, d.revision_token);

  const rows = await cpRows(client);
  assert.equal(rows.length, 1, "exactly one counterparty born");
  assert.equal(rows[0].name_normalized, "acmesuppliessdnbhd");
  assert.equal(await payableCounterparty(d.entry_id), rows[0].id, "the payable line is stamped with the born vendor");
});

test("registration-dominant reuse: a registration match reuses the existing counterparty (no birth)", { skip }, async () => {
  const { owner, firm, client, resolution } = await setup();
  const existing = await seedCounterparty(firm, client, owner, { name: "Beta Trading", reg: "R-1" });
  const d = await draftBill(owner, { client, resolution, vendor: { new: { name: "Beta Holdings", registration_no: "r1" } } });
  await approve(owner, d.entry_id, d.revision_token);

  assert.equal((await cpRows(client)).length, 1, "no new counterparty — registration matched");
  assert.equal(await payableCounterparty(d.entry_id), existing, "the line reused the registration-matched vendor");
});

test("registration conflict: same name, different registration ⇒ CLR23 at propose time", { skip }, async () => {
  const { owner, firm, client, resolution } = await setup();
  await seedCounterparty(firm, client, owner, { name: "Gamma", reg: "R-2" });
  // The fingerprint is resolved at draft time, so the conflict is caught fail-fast — no
  // draft is born beside a differently-registered name twin.
  await assert.rejects(
    () => draftBill(owner, { client, resolution, vendor: { new: { name: "Gamma", registration_no: "R-3" } } }),
    (e) => e.code === "CLR23",
    "registration conflict refuses at propose time",
  );
  assert.equal((await cpRows(client)).length, 1, "no new counterparty born by the refused draft");
});

test("ambiguity: proposing a name with no registration that matches a REGISTERED vendor ⇒ CLR23", { skip }, async () => {
  const { owner, firm, client, resolution } = await setup();
  await seedCounterparty(firm, client, owner, { name: "Delta", reg: "R-4" });
  await assert.rejects(
    () => draftBill(owner, { client, resolution, vendor: { new: { name: "Delta" } } }),
    (e) => e.code === "CLR23",
    "ambiguity refuses at propose time",
  );
});

test("name-match reuse: an unregistered name match reuses the existing counterparty", { skip }, async () => {
  const { owner, firm, client, resolution } = await setup();
  const existing = await seedCounterparty(firm, client, owner, { name: "Epsilon", reg: null });
  const d = await draftBill(owner, { client, resolution, vendor: { new: { name: "epsilon" } } });
  await approve(owner, d.entry_id, d.revision_token);

  assert.equal((await cpRows(client)).length, 1, "no new counterparty — name matched");
  assert.equal(await payableCounterparty(d.entry_id), existing, "the line reused the name-matched vendor");
});

test("fingerprint congruence: a landscape change refuses at approve; revise is the convergent act", { skip }, async () => {
  const { owner, firm, client, resolution } = await setup();
  // Draft proposes a brand-new vendor "Zeta" → persisted fingerprint decision='birth'.
  const d = await draftBill(owner, { client, resolution, vendor: { new: { name: "Zeta" } } });
  // Landscape change BEFORE approve: a REGISTERED Zeta now exists → re-resolve at approve no
  // longer decides 'birth' (it is now an ambiguity), so approve refuses CLR23.
  await seedCounterparty(firm, client, owner, { name: "Zeta", reg: "R-9" });
  await assert.rejects(() => approve(owner, d.entry_id, d.revision_token), (e) => e.code === "CLR23", "changed landscape refuses");

  // The convergent act: revise with the registration → re-resolves to the registered Zeta,
  // persists the fresh fingerprint, rotates the token; approve then succeeds by reuse.
  const rev = await revise(owner, d.entry_id, d.revision_token, { new: { name: "Zeta", registration_no: "R-9" } });
  const newToken = rev.revision_token ?? rev.new_revision_token ?? rev.token;
  await approve(owner, d.entry_id, newToken);

  const registered = (await cpRows(client)).find((r) => r.registration_normalized === "r9");
  assert.equal(await payableCounterparty(d.entry_id), registered.id, "approved against the registration-matched vendor after revise");
});

/** A raw bookkeeper-lane connection with manual txn control (for the birth race). */
async function humanClient(sub) {
  const c = await getPool().connect();
  await c.query("set role clara_authenticated");
  await c.query("select set_config('request.jwt.claims',$1,false)", [JSON.stringify({ sub, role: "authenticated" })]);
  return c;
}
const approveSql =
  "select clara.approve_entry(p_entry=>$1,p_expected_revision=>$2,p_attestation=>$3,p_op_key=>$4)";

test("two-session birth race: the losing session refuses CLR23 (unique_violation re-resolve)", { skip }, async () => {
  const { owner, client, resolution } = await setup();
  const vendor = { new: { name: "Racer Sdn Bhd" } };
  // Two independent drafts propose the SAME new vendor — both resolve decision='birth'
  // (nothing is born until approve), so both carry a birth fingerprint.
  const dA = await draftBill(owner, { client, resolution, vendor });
  const dB = await draftBill(owner, { client, resolution, vendor });

  const A = await humanClient(owner);
  const B = await humanClient(owner);
  try {
    await A.query("begin");
    await A.query(approveSql, [dA.entry_id, dA.revision_token, "attest", opk("apA")]); // births vendor (uncommitted)
    await B.query("begin");
    const bProm = B.query(approveSql, [dB.entry_id, dB.revision_token, "attest", opk("apB")]); // blocks on the unique
    let settled = false;
    bProm.then(() => (settled = true), () => (settled = true));
    await sleep(300);
    assert.equal(settled, false, "the second approval is blocked on the uncommitted unique key");
    await A.query("commit"); // A wins the birth
    await assert.rejects(() => bProm, (e) => e.code === "CLR23", "the losing session refuses CLR23 after the re-resolve");
    await B.query("rollback");
  } finally {
    await A.query("rollback").catch(() => {});
    await B.query("rollback").catch(() => {});
    A.release();
    B.release();
  }
  assert.equal((await cpRows(client)).length, 1, "exactly one vendor born despite the race");
});
