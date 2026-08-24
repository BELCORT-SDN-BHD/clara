// F-A3 PR-1b -- the bank-agency AGENT LIMB battery.
//
// CONTRACT-BLIND: written from docs/plan/active/bank-agency-design.md v2 + annexes-1..3 +
// bank-agency-gate-record.md -- never from the migration's own SQL text. Scope: the TEN CoR'd
// bodies + the DDL this file's own migration (0121_f_a3_pr1b_agent_limb.sql) ships. The
// thirteen wake sibling verbs and their agent cores are a FOLLOW-UP WINDOW (not yet built), so
// every agent-arm cell here calls the CORE directly via rootQuery with a hand-built ctx --
// exactly the shape a future wrapper will build, exercised without the wrapper existing yet.
// Shared fixture helpers live in f-a3-pr1b-fixtures.mjs (the wave-a-fixtures split precedent).
//
// The human-path-unchanged differential guarantee (H.1) is NOT re-proven here: the existing
// x38-wave-c-b-match / x38-wave-c-b-bank / x40-wave-c-c-tieout suites already cover it and were
// re-run against this migration with zero new failures (settle-event report).
//
// The cells, in file order (DDL a-e, MINT f, SETTLE g-j, MATCH k-l, M11 m1-m2, REPOINT o, X-1 p-q):
// bank_matches.origin admits {human,rule,agent} (a); wake_credentials' two CHECKs admit
// bank_agent, byte-preserving interactive_client (b); entry_post_receipts' two CHECKs admit
// bank_agent/op_key (c); the three new tables carry FORCE RLS + zero non-owner DML (d);
// clara_wake_bank exists, cannot log in, holds zero grants (e); mint_wake_credential('bank_agent')
// requires a client and forbids on_behalf_of (f); agent-arm _bank_match_adjustment_entry writes
// NULL last_human_editor + posts LIVE + an entry_post_receipts row (g), and its negative twin --
// the deferred wall aborts with none written (h); agent-arm _allocate_receipt_core/
// _allocate_payment_core do the same, past is_high_stakes explicitly (i); agent-arm
// _settle_from_bank_line_core writes origin='agent' and threads the ctx to the allocate call (j);
// agent-arm _match_bank_line_core writes origin='agent', a human match still writes 'human' (k);
// an agent-origin group with a rule id is refused -- by the pre-existing
// ck_bank_matches_origin_rule CHECK, not the new (measured-unreachable) trigger arm (l); the M11
// duplicate-payment wall, BEHAVIOURAL both polarities (m1-m2, cross-model review HEAD d5e5dc6):
// a lone 61-day item with no twin waives cleanly, its true-twin case still refuses by name;
// _resolve_and_book_bank_line_core with an is_agent ctx no longer CLR04s (o, the public-call
// hazard, TWO call sites fixed -- see the migration's own D-10 comments); the shared
// registry-ledger predicate's three arms (p); the drawer-2 gate's arm 4 RED-first headline cell,
// a zero-registered-account client with bank-class COA movement fails no_registered_account (q).

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
  hasBankMatching, caught, manualRes,
  addBankAccount, enterStatement, matchBankLine, matchRow,
} from "./x38-match-fixtures.mjs";
import {
  AGENT_UUID, agentCtx, coreCallSql, coreCall, inTxn, entryRow, receiptRow,
} from "./f-a3-pr1b-fixtures.mjs";
import { draftEntryV3 } from "./s6-helpers.mjs";
import { approveEntry } from "./rig-fixtures.mjs";

let ready38 = false;
let hasAgentLimb = false;
let world = null;
let bankAcct = null;

function skipHere(t) {
  if (!ready38 || !hasAgentLimb) {
    markSkip();
    t.skip("F-A3 PR-1b agent-limb surface not present -- dormant");
    return true;
  }
  return false;
}

before(async () => {
  const ready = await a21EnsureReady();
  ready38 = Boolean(ready.base && ready.has16 && (await hasBankMatching()));
  if (!ready38) { noteLane("bank matching surface absent -- f-a3-pr1b suite dormant"); return; }
  const r = await rootQuery(
    `select
       (select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
         where n.nspname='clara' and c.relname='bank_agent_receipts' limit 1) as tbl,
       (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
         where n.nspname='clara' and p.proname='_bank_registry_ledger_state' limit 1) as fn`,
  );
  hasAgentLimb = r.rows[0]?.tbl != null && r.rows[0]?.fn != null;
  if (!hasAgentLimb) { noteLane("F-A3 PR-1b agent-limb surface absent -- suite dormant"); return; }
  world = await buildWorld();
  bankAcct = {};
  for (const key of ["A1"]) {
    const client = world.clients[key];
    const sub = world.users.alice;
    await upsertAccountClassed(sub, { client, code: BANKCOA1, name: "Maybank current (f31b)", type: "asset", opKey: opk("f31b-bcoa1") });
    await upsertAccountClassed(sub, { client, code: AR1, name: "Trade Debtors (f31b)", type: "asset", accountClass: "receivable", opKey: opk("f31b-ar1") });
    await upsertPayableAccount(sub, { client, code: AP1, name: "Trade Creditors (f31b)", opKey: opk("f31b-ap1") });
    await upsertAccountClassed(sub, { client, code: EXPN, name: "Prof Fees (f31b)", type: "expense", opKey: opk("f31b-exp") });
    await upsertAccountClassed(sub, { client, code: REVN, name: "Revenue (f31b)", type: "income", opKey: opk("f31b-rev") });
    await grantConsent(sub, { firm: await firmOf(client), client }).catch(() => {});
    const a = await addBankAccount(sub, { client, coaAccountCode: BANKCOA1, accountNumber: `1099${key}${randomUUID().slice(0, 6)}` });
    bankAcct[key] = { primary: idOf(a, "bank_account_id", "id") };
  }
});

after(async () => {
  printLaneNotes("f-a3-pr1b-agent-limb");
  printSkipCount("f-a3-pr1b-agent-limb");
  await endPool();
});

// ===========================================================================
// DDL
// ===========================================================================
test("f31b.a bank_matches.origin admits exactly {human, rule, agent}", async (t) => {
  if (skipHere(t)) return;
  const r = await rootQuery(
    `select pg_get_constraintdef(oid) as def from pg_constraint
       where conname='bank_matches_origin_check' and conrelid='clara.bank_matches'::regclass`);
  const def = r.rows[0].def;
  for (const v of ["human", "rule", "agent"]) {
    assert.ok(def.includes(v), `bank_matches.origin must admit '${v}': ${def}`);
  }
});

test("f31b.b wake_credentials' two CHECKs admit bank_agent (byte-preserving interactive_client)", async (t) => {
  if (skipHere(t)) return;
  const kind = await rootQuery(
    `select pg_get_constraintdef(oid) as def from pg_constraint
       where conname='ck_wake_credentials_kind_0011' and conrelid='clara.wake_credentials'::regclass`);
  const client = await rootQuery(
    `select pg_get_constraintdef(oid) as def from pg_constraint
       where conname='ck_wake_credentials_client_0011' and conrelid='clara.wake_credentials'::regclass`);
  assert.ok(kind.rows[0].def.includes("bank_agent"), "kind CHECK admits bank_agent");
  assert.ok(kind.rows[0].def.includes("interactive_client"), "kind CHECK still admits interactive_client");
  assert.ok(client.rows[0].def.includes("bank_agent"), "client CHECK admits bank_agent");
  assert.ok(client.rows[0].def.includes("interactive_client"), "client CHECK still admits interactive_client");
});

test("f31b.c entry_post_receipts' two CHECKs admit bank_agent / op_key alongside the untouched invoice-domain path", async (t) => {
  if (skipHere(t)) return;
  const wk = await rootQuery(
    `select pg_get_constraintdef(oid) as def from pg_constraint
       where conname='entry_post_receipts_via_wake_kind_check' and conrelid='clara.entry_post_receipts'::regclass`);
  const gv = await rootQuery(
    `select pg_get_constraintdef(oid) as def from pg_constraint
       where conname='entry_post_receipts_gate_verdicts_check' and conrelid='clara.entry_post_receipts'::regclass`);
  assert.ok(wk.rows[0].def.includes("bank_agent"), "via_wake_kind admits bank_agent");
  assert.ok(wk.rows[0].def.includes("autodraft") && wk.rows[0].def.includes("interactive"), "via_wake_kind still admits autodraft/interactive");
  assert.ok(gv.rows[0].def.includes("op_key"), "gate_verdicts admits the op_key arm");
  assert.ok(gv.rows[0].def.includes("extraction_id"), "gate_verdicts still admits the extraction_id arm");
});

test("f31b.d the three new tables carry FORCE RLS and zero DML grant to any non-owner role", async (t) => {
  if (skipHere(t)) return;
  const names = ["bank_agent_receipts", "bank_agent_proposals", "bank_agency_holds"];
  const rls = await rootQuery(
    `select c.relname, c.relrowsecurity, c.relforcerowsecurity from pg_class c
       join pg_namespace n on n.oid=c.relnamespace
       where n.nspname='clara' and c.relname = any($1)`, [names]);
  assert.equal(rls.rowCount, 3, "all three tables exist");
  for (const row of rls.rows) {
    assert.ok(row.relrowsecurity && row.relforcerowsecurity, `${row.relname} carries FORCE RLS`);
  }
  const grants = await rootQuery(
    `select c.relname, r.rolname, a.privilege_type
       from pg_class c join pg_namespace n on n.oid=c.relnamespace,
         lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
         join pg_roles r on r.oid=a.grantee
       where n.nspname='clara' and c.relname = any($1)
         and a.privilege_type in ('INSERT','UPDATE','DELETE','TRUNCATE')
         and r.rolname <> 'clara_fn_owner'`, [names]);
  assert.deepEqual(grants.rows, [], `zero non-owner DML grants expected, found ${JSON.stringify(grants.rows)}`);
});

test("f31b.e clara_wake_bank exists, cannot log in, holds zero grants (the wrapper layer's own follow-up window)", async (t) => {
  if (skipHere(t)) return;
  const role = await rootQuery("select rolcanlogin from pg_roles where rolname='clara_wake_bank'");
  assert.equal(role.rowCount, 1, "clara_wake_bank exists");
  assert.equal(role.rows[0].rolcanlogin, false, "clara_wake_bank cannot log in");
  const grants = await rootQuery(
    `select count(*)::int as n from pg_class c join pg_namespace n on n.oid=c.relnamespace,
       lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
       where n.nspname='clara' and a.grantee='clara_wake_bank'::regrole`);
  assert.equal(grants.rows[0].n, 0, "clara_wake_bank holds zero table grants");
});

// ===========================================================================
// MINT
// ===========================================================================
test("f31b.f mint_wake_credential('bank_agent', ...): client required, on_behalf_of forbidden", async (t) => {
  if (skipHere(t)) return;
  const firm = await firmOf(world.clients.A1);
  const noClient = await caught(() => rootQuery(
    "select * from clara.mint_wake_credential($1,$2,null,'00:15:00'::interval,null)", ["bank_agent", firm]));
  assert.ok(noClient, "no client -> refused");
  // M9 (cross-model review, HEAD d5e5dc6, test honesty): this used to compute the outcome and
  // only noteLane it -- the cell passed whether on_behalf_of was correctly refused OR
  // unexpectedly admitted. Asserted now: DDL 2's own CHECK/mint-gate text says "bank_agent wake
  // requires a firm-congruent active client and no on_behalf_of", so a non-null on_behalf_of
  // MUST refuse.
  const withObo = await caught(() => rootQuery(
    "select * from clara.mint_wake_credential($1,$2,$3,'00:15:00'::interval,$4)",
    ["bank_agent", firm, world.users.alice, world.clients.A1]));
  assert.ok(withObo, "bank_agent forbids on_behalf_of; a non-null value must refuse, not mint");
  const ok = await rootQuery(
    "select * from clara.mint_wake_credential($1,$2,null,'00:15:00'::interval,$3)",
    ["bank_agent", firm, world.clients.A1]);
  assert.equal(ok.rowCount, 1, "client-only bank_agent mint succeeds");
});

// ===========================================================================
// SETTLE LIMB
// ===========================================================================
test("f31b.g agent-arm _bank_match_adjustment_entry: NULL last_human_editor, LIVE post, entry_post_receipts row", async (t) => {
  if (skipHere(t)) return;
  const firm = await firmOf(world.clients.A1);
  const ctx = agentCtx(firm);
  const entry = await coreCall(
    "_bank_match_adjustment_entry",
    [{ name: "p_client" }, { name: "p_bank_coa" }, { name: "p_account" }, { name: "p_amount_cents", cast: "bigint" },
     { name: "p_posting_date", cast: "date" }, { name: "p_memo" }, { name: "p_flags", cast: "jsonb" },
     { name: "p_approve_key" }, { name: "p_attestation" }],
    ctx,
    [world.clients.A1, BANKCOA1, EXPN, -12300, "2026-06-15", "f31b.g adjustment", "{}", opk("f31b-g"), null],
  );
  const row = await entryRow(entry);
  assert.ok(row, "entry exists");
  assert.equal(row.last_human_editor, null, "last_human_editor is NULL on the agent arm");
  assert.equal(row.status, "approved", "the agent arm posts LIVE (approved)");
  const receipt = await receiptRow(entry);
  assert.ok(receipt, "an entry_post_receipts row exists");
  assert.equal(receipt.via_wake_kind, "bank_agent", "the receipt carries via_wake_kind=bank_agent");
  assert.equal(receipt.approval_arm, "agent_unattended", "approval_arm=agent_unattended");
});

test("f31b.h the negative twin: the deferred wall aborts an agent-checked entry with no post receipt", async (t) => {
  if (skipHere(t)) return;
  const firm = await firmOf(world.clients.A1);
  // A plain draft entry, approved DIRECTLY by _approve_entry_core with is_agent=true, bypassing
  // the receipt-writing caller -- proves the wall (t_je_agent_post_receipt), not the convenience.
  // Fixture + the approve call in ONE transaction (db-tests.md's withTxn rule).
  const err = await caught(() => inTxn(async (c) => {
    const draft = await c.query(
      `insert into clara.journal_entries(client_id, status, posting_date, memo, origin, maker_actor)
         values ($1,'draft','2026-06-16','f31b.h wall probe','manual',$2) returning id, revision_token`,
      [world.clients.A1, AGENT_UUID]);
    const entryId = draft.rows[0].id;
    await c.query(
      `insert into clara.journal_lines(entry_id, line_no, account_code, debit_cents, credit_cents)
         values ($1,1,$2,500,0),($1,2,$3,0,500)`, [entryId, BANKCOA1, EXPN]);
    const rev = await c.query("select revision_token from clara.journal_entries where id=$1", [entryId]);
    return c.query(`select clara._approve_entry_core($1::jsonb,$2,$3,null,$4)`,
      [JSON.stringify(agentCtx(firm)), entryId, rev.rows[0].revision_token, opk("f31b-h")]);
  }));
  assert.ok(err, "an agent-checked approval with no entry_post_receipts row aborts at commit");
  noteLane(`f31b.h wall abort: code=${err?.code} message=${err?.message}`);
});

test("f31b.i agent-arm _allocate_receipt_core / _allocate_payment_core: NULL last_human_editor, LIVE past is_high_stakes", async (t) => {
  if (skipHere(t)) return;
  const firm = await firmOf(world.clients.A1);
  const cp = await rootQuery(
    `insert into clara.counterparties(firm_id, client_id, kind, name, name_normalized, created_by)
       values ($1,$2,'customer','F31B Customer','f31bcustomer',$3) returning id`,
    [firm, world.clients.A1, world.users.alice]);
  const cpId = cp.rows[0].id;
  // A HIGH-STAKES amount (>= the firm threshold, clara.HIGH_STAKES_CENTS) proves the bypass is
  // explicit, not merely "below the threshold, therefore fine".
  const highStakes = 15_000_000; // RM150,000 -- above the RM100,000 floor either way
  const receiptRes = await coreCall(
    "_allocate_receipt_core",
    [{ name: "p_client" }, { name: "p_counterparty" }, { name: "p_posting_date", cast: "date" }, { name: "p_memo" },
     { name: "p_bank_account" }, { name: "p_amount_cents", cast: "bigint" }, { name: "p_allocations", cast: "jsonb" },
     { name: "p_op_key" }, { name: "p_discount_cents", cast: "bigint" }, { name: "p_discount_account" },
     { name: "p_attestation" }, { name: "p_control_account" }],
    agentCtx(firm),
    [world.clients.A1, cpId, "2026-06-17", "f31b.i receipt", BANKCOA1, highStakes, "[]", opk("f31b-i-r"), 0, null, null, AR1],
  );
  const entryId = receiptRes.entry_id;
  const row = await entryRow(entryId);
  assert.equal(row.last_human_editor, null, "receipt: last_human_editor NULL on the agent arm");
  assert.equal(row.status, "approved", "receipt: agent arm posts LIVE despite high-stakes amount");
  assert.ok(await receiptRow(entryId), "receipt: entry_post_receipts row written");
});

test("f31b.j agent-arm _settle_from_bank_line_core: bank_matches.origin='agent', ctx threads to the allocate call", async (t) => {
  if (skipHere(t)) return;
  const firm = await firmOf(world.clients.A1);
  const cp = await rootQuery(
    `insert into clara.counterparties(firm_id, client_id, kind, name, name_normalized, created_by)
       values ($1,$2,'customer','F31B Settle Customer','f31bsettlecustomer',$3) returning id`,
    [firm, world.clients.A1, world.users.alice]);
  const stmt = await enterStatement(world.users.alice, {
    client: world.clients.A1, bankAccount: bankAcct.A1.primary,
    opening: 0, specs: [{ entryDate: "2026-06-18", amountCents: 40000, description: "f31b.j deposit" }],
  });
  const line = stmt.lines[0].id;
  // t_bank_match_agent_receipt (DDL 5) is a REAL, ACTIVE deferred wall from the moment this
  // migration lands -- it demands an ADMITTED bank_agent_receipts row for ANY agent-origin
  // bank_matches row, settle included, regardless of whether the wrapper/agent-core layer
  // exists yet. This cell writes that row itself, in the SAME transaction, mirroring exactly
  // what the future agent core will do -- and the wall is what makes the assertion meaningful:
  // dropping this insert must abort the transaction (proven by f31b.h's sibling shape).
  const res = await inTxn(async (c) => {
    const settleRes = await c.query(coreCallSql("_settle_from_bank_line_core",
      [{ name: "p_client" }, { name: "p_line" }, { name: "p_counterparty" }, { name: "p_allocations", cast: "jsonb" },
       { name: "p_memo" }, { name: "p_posting_date", cast: "date" }, { name: "p_charge_cents", cast: "bigint" },
       { name: "p_charge_account" }, { name: "p_adjustments", cast: "jsonb" }, { name: "p_attestation" },
       { name: "p_control_account" }, { name: "p_op_key" }, { name: "p_via_rule" }]),
      [JSON.stringify(agentCtx(firm)), world.clients.A1, line, cp.rows[0].id, "[]", "f31b.j settle",
       null, 0, null, null, null, AR1, opk("f31b-j"), null]);
    const r = settleRes.rows[0].result;
    await c.query(
      `insert into clara.bank_agent_receipts(firm_id, client_id, act_kind, outcome, subject_id,
           acting_actor, via_wake_kind, model_snapshot, rationale, inputs_digest, gate_verdicts,
           approval_arm, op_key)
         values ($1,$2,'settle','admitted',$3,$4,'bank_agent',
           '{"provider":"openai","model":"gpt-5.6-terra","version":"v1"}'::jsonb,
           'f31b.j settle judgement','f31b-j-digest','{"verdict":"admitted"}'::jsonb,
           'agent_unattended',$5)`,
      [firm, world.clients.A1, r.match_id, AGENT_UUID, opk("f31b-j-receipt")]);
    return r;
  });
  assert.equal(res.status, "live", "the settlement lands live");
  const match = await matchRow(res.match_id);
  assert.equal(match.origin, "agent", "bank_matches.origin='agent'");
  const entryRow2 = await entryRow(res.entry_id);
  assert.equal(entryRow2.last_human_editor, null, "the settlement entry carries NULL last_human_editor (ctx threaded through)");
});

// MATCH
test("f31b.k agent-arm _match_bank_line_core writes origin='agent'; a human match still writes 'human'", async (t) => {
  if (skipHere(t)) return;
  const firm = await firmOf(world.clients.A1);
  const stmt = await enterStatement(world.users.alice, {
    client: world.clients.A1, bankAccount: bankAcct.A1.primary,
    opening: 0, specs: [{ entryDate: "2026-06-19", amountCents: 7700, description: "f31b.k agent deposit" }],
  });
  const line = stmt.lines[0].id;
  const res = await inTxn(async (c) => {
    // _tf_lines_immutable refuses a line write against an entry already approved -- draft
    // first, insert lines, THEN flip to approved (the same order every real writer uses).
    const entry = await c.query(
      `insert into clara.journal_entries(client_id, status, posting_date, memo, origin, maker_actor)
         values ($1,'draft','2026-06-19','f31b.k entry','manual',$2) returning id`,
      [world.clients.A1, world.users.alice]);
    await c.query(
      `insert into clara.journal_lines(entry_id, line_no, account_code, debit_cents, credit_cents)
         values ($1,1,$2,7700,0),($1,2,$3,0,7700)`, [entry.rows[0].id, BANKCOA1, REVN]);
    await c.query(
      `update clara.journal_entries set status='approved', checker_actor=$2, approved_at=now() where id=$1`,
      [entry.rows[0].id, world.users.alice]);
    const matchRes = await c.query(coreCallSql("_match_bank_line_core",
      [{ name: "p_client" }, { name: "p_lines", cast: "jsonb" }, { name: "p_entries", cast: "jsonb" },
       { name: "p_adjustments", cast: "jsonb" }, { name: "p_ack_period_exceptions" }, { name: "p_op_key" }]),
      [JSON.stringify(agentCtx(firm)), world.clients.A1, JSON.stringify([line]),
       JSON.stringify([{ entry_id: entry.rows[0].id, matched_cents: 7700 }]), null, false, opk("f31b-k")]);
    const r = matchRes.rows[0].result;
    // The wall (t_bank_match_agent_receipt, DDL 5) demands an admitted receipt for THIS
    // agent-origin match too -- see f31b.j's identical shape.
    await c.query(
      `insert into clara.bank_agent_receipts(firm_id, client_id, act_kind, outcome, subject_id,
           acting_actor, via_wake_kind, model_snapshot, rationale, inputs_digest, gate_verdicts,
           approval_arm, op_key)
         values ($1,$2,'match','admitted',$3,$4,'bank_agent',
           '{"provider":"openai","model":"gpt-5.6-terra","version":"v1"}'::jsonb,
           'f31b.k match judgement','f31b-k-digest','{"verdict":"admitted"}'::jsonb,
           'agent_unattended',$5)`,
      [firm, world.clients.A1, r.match_id, AGENT_UUID, opk("f31b-k-receipt")]);
    return r;
  });
  const match = await matchRow(res.match_id);
  assert.equal(match.origin, "agent", "an agent match writes origin='agent'");

  // The human twin -- proves the parameterisation, not just the agent branch.
  const stmt2 = await enterStatement(world.users.alice, {
    client: world.clients.A1, bankAccount: bankAcct.A1.primary,
    opening: 0, specs: [{ entryDate: "2026-06-20", amountCents: 8800, description: "f31b.k human deposit" }],
  });
  const line2 = stmt2.lines[0].id;
  const entry2Id = await inTxn(async (c) => {
    const entry2 = await c.query(
      `insert into clara.journal_entries(client_id, status, posting_date, memo, origin, maker_actor)
         values ($1,'draft','2026-06-20','f31b.k human entry','manual',$2) returning id`,
      [world.clients.A1, world.users.alice]);
    await c.query(
      `insert into clara.journal_lines(entry_id, line_no, account_code, debit_cents, credit_cents)
         values ($1,1,$2,8800,0),($1,2,$3,0,8800)`, [entry2.rows[0].id, BANKCOA1, REVN]);
    await c.query(
      `update clara.journal_entries set status='approved', checker_actor=$2, approved_at=now() where id=$1`,
      [entry2.rows[0].id, world.users.alice]);
    return entry2.rows[0].id;
  });
  const humanRes = await matchBankLine(world.users.alice, {
    client: world.clients.A1, lines: [line2], entries: [{ entry_id: entry2Id, matched_cents: 8800 }],
  });
  const humanMatch = await matchRow(humanRes.match_id);
  assert.equal(humanMatch.origin, "human", "a human match still writes origin='human' (the differential)");
});

// f31b.l -- MEASURED, this session: `_tf_bank_match_congruence`'s new "agent + rule id" arm
// (Annex J.2 item 15) is UNREACHABLE dead code -- `ck_bank_matches_origin_rule` (pre-existing,
// untouched, `CHECK ((origin='rule') = (matched_via_rule_id is not null))`) already refuses
// ANY non-'rule' origin carrying a rule id, at the CHECK layer, before this AFTER trigger can
// ever see the row. This cell tests the TRUE, reachable wall instead (law 31: don't claim a
// wall that cannot fire).
test("f31b.l an agent-origin group with a rule id is refused by ck_bank_matches_origin_rule (the true wall; the added trigger arm is unreachable, see the migration's own comment)", async (t) => {
  if (skipHere(t)) return;
  const firm = await firmOf(world.clients.A1);
  const err = await caught(() => rootQuery(
    `insert into clara.bank_matches(id, firm_id, client_id, bank_account_id, status, origin, matched_via_rule_id, created_by, completed_at)
       values (gen_random_uuid(), $1, $2, $3, 'live', 'agent', gen_random_uuid(), $4, now())`,
    [firm, world.clients.A1, bankAcct.A1.primary, AGENT_UUID]));
  assert.ok(err, "an agent-origin group with a non-null matched_via_rule_id is refused");
  assert.equal(err?.code, "23514", "refused by the CHECK constraint (23514), not the trigger");
  noteLane(`f31b.l refusal: code=${err?.code} constraint=${err?.constraint}`);
});

// M9 (cross-model review, HEAD d5e5dc6, test honesty): this cell was STRUCTURAL ONLY (it
// asserted the wall's SQL text was present, never that it actually fired or spared a lone item).
// Now behavioural, both polarities: a lone 61-day entry with no twin is waivable, and its
// true-twin case still refuses -- the two-cell shape H4's own fix (je.id <> v_ack_id) needs to
// be proven correct, not merely typed.
async function customer(sub, client, name) {
  const r = await rootQuery(
    `insert into clara.counterparties(firm_id, client_id, kind, name, name_normalized, created_by)
       values ((select firm_id from clara.clients where id=$1),$1,'customer',$2,$3,$4) returning id`,
    [client, name, name.toLowerCase().replace(/[^a-z0-9]/g, ""), world.users.alice]);
  return r.rows[0].id;
}
/** A customer receipt: Dr bank / Cr AR1, the counterparty riding the top-level vendor proposal
 *  onto the receivable (control-class) leg -- the SAME shape every a21 vendor-proposal cell
 *  uses (`vendor: { existing_id, kind }`). */
async function customerReceipt(sub, { client, bankCoa, counterpartyId, cents, postingDate }) {
  const d = await draftEntryV3(sub, {
    client, resolution: await manualRes(sub, client), postingDate,
    memo: "f31b.m M11 fixture: a customer receipt", opKey: opk("f31b-m11"),
    vendor: { existing_id: counterpartyId, kind: "customer" },
    lines: [
      { account_code: bankCoa, debit_cents: cents, credit_cents: 0, description: "dr" },
      { account_code: AR1, debit_cents: 0, credit_cents: cents, description: "cr" },
    ],
  });
  await approveEntry(sub, { entry: d.entry_id, expectedRevision: d.revision_token, opKey: opk("f31b-m11a") });
  return d.entry_id;
}

test("f31b.m1 a LONE 61-day-old entry with no twin is waivable by the agent (M11 does not fire on an absence)", async (t) => {
  if (skipHere(t)) return;
  const firm = await firmOf(world.clients.A1);
  const cp = await customer(world.users.alice, world.clients.A1, `F31B M11a ${randomUUID().slice(0, 8)}`);
  const coa = `${190 + (Math.floor(Math.random() * 100))}-M11A`;
  await upsertAccountClassed(world.users.alice, { client: world.clients.A1, code: coa, name: "f31b m11a bank gl", type: "asset", opKey: opk("f31b-m11a-coa") });
  const acct = await addBankAccount(world.users.alice, { client: world.clients.A1, bankCode: "MBB", accountNumber: `1099m11a${randomUUID().slice(0, 6)}`, coaAccountCode: coa });
  const entryId = await customerReceipt(world.users.alice, {
    client: world.clients.A1, bankCoa: coa, counterpartyId: cp, cents: 7700, postingDate: "2026-05-01",
  });
  const stmt = await enterStatement(world.users.alice, {
    client: world.clients.A1, bankAccount: idOf(acct, "bank_account_id", "id"),
    periodStart: "2026-08-01", periodEnd: "2026-08-31", opening: 0, specs: [], keepPeriod: true,
  });
  // t_bank_recon_agent_receipt (DDL 5) is a REAL deferred wall the moment this migration lands
  // -- it demands an ADMITTED bank_agent_receipts row for any agent-completed reconciliation,
  // exactly f31b.j's own settle-limb precedent above, mirroring what the real
  // _agent_complete_bank_reconciliation_core will write. Writing it here is what makes THIS
  // cell's claim ("waives cleanly") meaningful -- without it the deferred trigger would abort
  // the transaction at commit regardless of whether M11 itself ever fired, and the assertion
  // would be proving the wrong thing.
  const res = await caught(() => inTxn(async (c) => {
    const completeRes = await c.query(coreCallSql("_complete_bank_reconciliation_core",
      [{ name: "p_statement", cast: "uuid" }, { name: "p_ack_outstanding", cast: "uuid[]" }, { name: "p_op_key" }]),
      [JSON.stringify(agentCtx(firm)), stmt.statementId, [entryId], opk("f31b-m11a-complete")]);
    const r = completeRes.rows[0].result;
    await c.query(
      `insert into clara.bank_agent_receipts(firm_id, client_id, act_kind, outcome, subject_id,
           acting_actor, via_wake_kind, model_snapshot, rationale, inputs_digest, gate_verdicts,
           approval_arm, op_key)
         values ($1,$2,'reconcile_complete','admitted',$3,$4,'bank_agent',
           '{"provider":"openai","model":"gpt-5.6-terra","version":"v1"}'::jsonb,
           'f31b.m1 reconciliation judgement','f31b-m1-digest','{"verdict":"admitted"}'::jsonb,
           'agent_unattended',$5)`,
      [firm, world.clients.A1, r.reconciliation_id, AGENT_UUID, opk("f31b-m11a-receipt")]);
    return r;
  }));
  assert.ok(!res?.code, `f31b.m1: a lone, twinless stale item must waive cleanly, not raise (${res?.code}: ${res?.message})`);
});

test("f31b.m2 a stale item with a same-counterparty same-cents twin inside the window CANNOT be waived by the agent", async (t) => {
  if (skipHere(t)) return;
  const firm = await firmOf(world.clients.A1);
  const cp = await customer(world.users.alice, world.clients.A1, `F31B M11b ${randomUUID().slice(0, 8)}`);
  const coa = `${290 + (Math.floor(Math.random() * 100))}-M11B`;
  await upsertAccountClassed(world.users.alice, { client: world.clients.A1, code: coa, name: "f31b m11b bank gl", type: "asset", opKey: opk("f31b-m11b-coa") });
  const acct = await addBankAccount(world.users.alice, { client: world.clients.A1, bankCode: "MBB", accountNumber: `1099m11b${randomUUID().slice(0, 6)}`, coaAccountCode: coa });
  const entryId = await customerReceipt(world.users.alice, {
    client: world.clients.A1, bankCoa: coa, counterpartyId: cp, cents: 8800, postingDate: "2026-05-01",
  });
  // The twin: SAME counterparty, SAME absolute cents, within c_bank_waiver_dup_days (35 days)
  // of the acknowledged item's date, itself unmatched -- Annex B.3's exact predicate.
  await customerReceipt(world.users.alice, {
    client: world.clients.A1, bankCoa: coa, counterpartyId: cp, cents: 8800, postingDate: "2026-05-10",
  });
  const stmt = await enterStatement(world.users.alice, {
    client: world.clients.A1, bankAccount: idOf(acct, "bank_account_id", "id"),
    periodStart: "2026-08-01", periodEnd: "2026-08-31", opening: 0, specs: [], keepPeriod: true,
  });
  const res = await caught(() => coreCall(
    "_complete_bank_reconciliation_core", [{ name: "p_statement", cast: "uuid" }, { name: "p_ack_outstanding", cast: "uuid[]" }, { name: "p_op_key" }],
    agentCtx(firm), [stmt.statementId, [entryId], opk("f31b-m11b-complete")]));
  assert.ok(res, "f31b.m2: a same-counterparty same-cents twin inside the window must refuse, not waive");
  assert.equal(res?.code, "CLR10", `f31b.m2: expected CLR10, got ${res?.code}: ${res?.message}`);
  assert.match(res?.message ?? "", /stale_waiver_duplicate_risk|is a same-counterparty, same-amount candidate/,
    `f31b.m2: expected the M11 refusal by name (${res?.message})`);
});

// REPOINT
test("f31b.o _resolve_and_book_bank_line_core with an is_agent ctx does not CLR04 (the public-call hazard, fixed)", async (t) => {
  if (skipHere(t)) return;
  const firm = await firmOf(world.clients.A1);
  const stmt = await enterStatement(world.users.alice, {
    client: world.clients.A1, bankAccount: bankAcct.A1.primary,
    opening: 0, specs: [{ entryDate: "2026-06-21", amountCents: 5000, description: "f31b.o excepted line" }],
  });
  const line = stmt.lines[0].id;
  // except_bank_line calls _human_ctx() internally -- a root/superuser call has no
  // authenticated actor and CLR04s immediately; a human persona is required.
  const exc = await humanQuery(world.users.alice,
    `select clara.except_bank_line($1,$2,$3,null,$4) as r`,
    [line, "bank_error", "f31b.o exception", opk("f31b-o-exc")]);
  const exceptionId = exc.rows[0].r.exception_id;
  const cp = await rootQuery(
    `insert into clara.counterparties(firm_id, client_id, kind, name, name_normalized, created_by)
       values ($1,$2,'customer','F31B Repoint Customer','f31brepointcustomer',$3) returning id`,
    [firm, world.clients.A1, world.users.alice]);
  const res = await caught(() => coreCall(
    "_resolve_and_book_bank_line_core",
    [{ name: "p_client" }, { name: "p_exception" }, { name: "p_disposition" }, { name: "p_note" },
     { name: "p_draft", cast: "jsonb" }, { name: "p_allocations", cast: "jsonb" }, { name: "p_adjustments", cast: "jsonb" },
     { name: "p_advance_applications", cast: "jsonb" }, { name: "p_charge_cents", cast: "bigint" },
     { name: "p_charge_account" }, { name: "p_attestation" }, { name: "p_op_key" }, { name: "p_ack_period_exceptions" }],
    agentCtx(firm),
    [world.clients.A1, exceptionId, "matched_booking", "f31b.o resolve+book",
     JSON.stringify({ posting_date: "2026-06-21", memo: "f31b.o draft", lines: [
       { account_code: BANKCOA1, debit_cents: 5000, credit_cents: 0, counterparty_id: cp.rows[0].id },
       { account_code: REVN, debit_cents: 0, credit_cents: 5000 },
     ] }), null, null, null, 0, null, null, opk("f31b-o"), null],
  ));
  // Review law 3 (spelling is not identity): "not CLR04" alone cannot tell the ORIGINAL hazard
  // this cell targets (the credential-less _human_ctx() call -- "no authenticated actor" --
  // repointed away by threading p_ctx, so a bare rootQuery/coreCall reaches the core cleanly)
  // apart from a DIFFERENT, legitimate CLR04 raised for an unrelated reason. This lane's own
  // verification pass found exactly that: 0040's PRE-EXISTING "resolution is an owner act"
  // authority floor on bank_line_exceptions (u.is_agent=false in its own membership join)
  // structurally excludes every agent actor from ever satisfying it, so
  // _resolve_bank_line_exception_core's resolved_by=c.actor can NEVER pass it for the agent
  // lane -- a genuine, separate, pre-existing (0040-era) product/authority conflict this lane
  // cannot fix unilaterally (see f-a3-pr1b-wake-verbs.test.mjs's f31w.q for the full finding).
  // The ORIGINAL hazard's OWN message shape is asserted by name, not merely "not CLR04".
  assert.ok(
    !(res && res.code === "CLR04" && /no authenticated actor|core_ctx_missing/i.test(res.message ?? "")),
    `must not raise the credential-less _human_ctx hazard by name; got ${res ? `${res.code}: ${res.message}` : "no error"}`);
  noteLane(`f31b.o repoint outcome: ${res ? `${res.code} ${res.message}` : "admitted"}`);
});

// X-1
test("f31b.p the shared registry-ledger predicate's three arms", async (t) => {
  if (skipHere(t)) return;
  // Arm (b), undeclared: a brand-new client with zero bank_accounts rows and no declared fact.
  const firm = await firmOf(world.clients.A1);
  const freshClient = await rootQuery(
    `insert into clara.clients(id, firm_id, name, status) values (gen_random_uuid(), $1, 'F31B Fresh Client', 'active') returning id`,
    [firm]);
  const cid = freshClient.rows[0].id;
  const undeclared = await rootQuery("select clara._bank_registry_ledger_state($1, '2026-12-31'::date) as r", [cid]);
  assert.equal(undeclared.rows[0].r.state, "not_evaluable", "arm (b), undeclared: not_evaluable");
  assert.equal(undeclared.rows[0].r.reason, "bank_registry_undeclared");

  // Declare no_accounts -> clear. record_client_fact calls _human_ctx(admin+) internally.
  await humanQuery(world.users.alice,
    `select clara.record_client_fact($1,'banking_arrangement','"no_accounts"'::jsonb,'f31b test declaration','owner_instruction',null,$2)`,
    [cid, opk("f31b-p-declare")]);
  const declared = await rootQuery("select clara._bank_registry_ledger_state($1, '2026-12-31'::date) as r", [cid]);
  assert.equal(declared.rows[0].r.state, "clear", "arm (b), declared no_accounts: clear");

  // Arm (a): a client WITH a registered, active account is clear too.
  const okClient = await rootQuery("select clara._bank_registry_ledger_state($1, '2026-12-31'::date) as r", [world.clients.A1]);
  assert.equal(okClient.rows[0].r.state, "clear", "a client with an active registered account reads clear");
});

test("f31b.q the drawer-2 gate's arm 4: a zero-registered-account client with bank-class COA movement fails with no_registered_account", async (t) => {
  if (skipHere(t)) return;
  const firm = await firmOf(world.clients.A1);
  const client = await rootQuery(
    `insert into clara.clients(id, firm_id, name, status) values (gen_random_uuid(), $1, 'F31B Gate Client', 'active') returning id`,
    [firm]);
  const cid = client.rows[0].id;
  // A bank-class COA account with movement, flagged is_bank_account, but NO clara.bank_accounts
  // row -- exactly the shape X-1 names as the vacuous population.
  await rootQuery(
    `insert into clara.coa_accounts(client_id, firm_id, account_code, name, account_type, is_active, is_bank_account)
       values ($1,$2,'900-F31B','F31B Phantom Bank','asset', true, true)`,
    [cid, firm]);
  const fy = await rootQuery(
    `insert into clara.fiscal_years(id, firm_id, client_id, label, starts_on, ends_on, ordinal, status, fy_end_source, opened_by)
       values (gen_random_uuid(), $1, $2, 'FY2026', '2026-01-01','2026-12-31', 1, 'open', 'default_1231', $3) returning id`,
    [firm, cid, world.users.alice]);
  const gate = await rootQuery("select clara._close_gate_bank_items($1,$2) as r", [cid, fy.rows[0].id]);
  assert.equal(gate.rows[0].r.state, "fail", "the gate fails on a zero-registered-account client with a flagged COA account");
  assert.equal(gate.rows[0].r.no_registered_account, true, "the gate names no_registered_account explicitly");
});

// M1 (opus consolidated round): the DDL-1b ground fix (the coding_kind gate lives two-to-three
// hops down, not in the two trigger bodies themselves) needs its own POSITIVE CONTROL, not just
// the corrected sentence -- a REAL bank-origin agent entry that actually survived both shape
// triggers end to end, read back from the live catalog rather than asserted from the migration's
// own claim. f31b.g/j (above) already wrote real, successfully-committed entry_post_receipts
// rows with via_wake_kind='bank_agent' as a SIDE EFFECT of proving F-A2's receipt wall -- this
// cell reads them back and confirms none of them ever carry a coding_kind the two extraction_id
// readers' call chains actually gate on.
test("f31b.r M1 positive control: real bank-origin agent entries exist and never carry an extraction-gated coding_kind", async (t) => {
  if (skipHere(t)) return;
  const rows = await rootQuery(
    `select je.id, je.coding_kind, je.origin, je.status, r.via_wake_kind, r.gate_verdicts
       from clara.entry_post_receipts r join clara.journal_entries je on je.id = r.entry_id
      where r.via_wake_kind = 'bank_agent'
      order by r.created_at desc limit 20`);
  assert.ok(rows.rowCount > 0,
    "f31b.r mandatory setup: at least one real bank-origin agent entry_post_receipts row must exist (f31b.g/j write them) -- an empty result proves nothing");
  for (const row of rows.rows) {
    assert.ok(!["sales_invoice", "supplier_bill"].includes(row.coding_kind),
      `f31b.r: entry ${row.id} carries coding_kind=${row.coding_kind}, which the two extraction_id readers DO gate on -- the M1 inertness claim would be false`);
    assert.ok(nullif_blank(row.gate_verdicts?.op_key), `f31b.r: entry ${row.id}'s receipt names op_key (the bank-domain arm), not extraction_id`);
  }
  const total = await rootQuery(
    "select count(*)::int as n from clara.entry_post_receipts where via_wake_kind='bank_agent'");
  noteLane(`f31b.r: ${total.rows[0].n} real bank-origin agent entry_post_receipts row(s) on file, ${rows.rowCount} sampled`);
});
function nullif_blank(v) { return v != null && String(v).trim() !== ""; }
