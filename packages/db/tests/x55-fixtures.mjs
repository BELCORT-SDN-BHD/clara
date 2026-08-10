// 0055 (Wave E lane alpha, E-R12 trio) rig -- fixture helpers (NOT a test file:
// the name does not end in `.test.mjs`, so `node --test` ignores it). Split out
// of x55-client-facts-trio.test.mjs to keep both files under the repo's 500-line
// gate. Subledger fixture shapes (allocateReceipt/allocatePayment/apply
// OpenItems/openArItem/openApItem/birthCounterparty/approvedGeneric/
// controlGlAsOf) are REBUILT LOCALLY, verbatim from the pinned interfaces proven
// live in x37-wave-c-a-subledger.test.mjs and x40-wave-c-c-tieout.test.mjs (those
// helpers are file-local there, not exported -- the same "rebuilt here verbatim"
// discipline x40's own header names). The onboarding-plan lifecycle and
// get_context_pack reads reuse wave-b/wb-fixtures.mjs directly.

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  rootQuery, humanQuery, opk,
  createClient, upsertAccountClassed, upsertPayableAccount,
  draftEntryV3, approveEntry, freshResolution, counterpartyRows,
} from "./wave-a-fixtures.mjs";
import * as wb from "./wave-b/wb-fixtures.mjs";

// ---------------------------------------------------------------------------
// Readiness -- LIVE CATALOG only, never the migration file.
// ---------------------------------------------------------------------------

export async function has0055() {
  const t = await rootQuery(
    "select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='clara' and c.relname='client_facts'",
  );
  if (t.rows.length === 0) return false;
  const g = await rootQuery(
    `select position('apply_before_item_date' in coalesce(nullif(p.prosrc,''), pg_get_functiondef(p.oid))) as at
       from pg_proc p where p.pronamespace='clara'::regnamespace and p.proname='apply_open_items'`,
  );
  return Number(g.rows[0]?.at ?? 0) > 0;
}

// ---------------------------------------------------------------------------
// Suite-scoped COA ("-C55", grepped clean against every other battery).
// ---------------------------------------------------------------------------

export const AR1 = "374-C55"; // receivable control
export const AP1 = "474-C55"; // payable control
export const BANK = "170-C55"; // bank (asset, NO account_class) -- the settlement's non-control leg
export const REVN = "684-C55"; // revenue (income)
export const EXPN = "574-C55"; // expense

export async function setupCoa(sub, client) {
  await upsertAccountClassed(sub, { client, code: AR1, name: "Trade Debtors (x55)", type: "asset", accountClass: "receivable", opKey: opk("x55-ar") });
  await upsertPayableAccount(sub, { client, code: AP1, name: "Trade Creditors (x55)", opKey: opk("x55-ap") });
  await upsertAccountClassed(sub, { client, code: BANK, name: "Bank (x55)", type: "asset", opKey: opk("x55-bank") });
  await upsertAccountClassed(sub, { client, code: REVN, name: "Revenue (x55)", type: "income", opKey: opk("x55-rev") });
  await upsertAccountClassed(sub, { client, code: EXPN, name: "Expense (x55)", type: "expense", opKey: opk("x55-exp") });
}

// ---------------------------------------------------------------------------
// Subledger fixtures.
// ---------------------------------------------------------------------------

export const manualRes = (sub, client) => freshResolution(sub, client, { subjectKind: "manual", subjectId: null });

export async function caught(fn) {
  try { await fn(); return null; } catch (e) { return e; }
}

export async function birthCounterparty(sub, { client, name, kind = "customer" }) {
  const proposal = { new: { name } };
  if (kind === "customer") proposal.kind = "customer";
  const d = await draftEntryV3(sub, {
    client, resolution: manualRes(sub, client), memo: `x55 birth ${name}`,
    lines: [
      { account_code: EXPN, debit_cents: 100, credit_cents: 0, description: "birth-dr" },
      { account_code: REVN, debit_cents: 0, credit_cents: 100, description: "birth-cr" },
    ],
    vendor: proposal, opKey: opk("x55-birth"),
  });
  await approveEntry(sub, { entry: d.entry_id, expectedRevision: d.revision_token, opKey: opk("x55-birtha") });
  const want = name.toLowerCase().replace(/[^a-z0-9]/g, "");
  const cp = (await counterpartyRows(client)).find((c) => (c.name_normalized ?? "") === want);
  assert.ok(cp?.id, `the ${kind} counterparty ${name} was born (mandatory setup)`);
  return cp.id;
}

export async function approvedGeneric(sub, { client, cp, cpKind = "customer", debit, credit, cents, memo = "x55 generic", postingDate = "2026-06-01" }) {
  const proposal = { existing_id: cp };
  if (cpKind !== "vendor") proposal.kind = cpKind;
  const d = await draftEntryV3(sub, {
    client, resolution: manualRes(sub, client), memo, postingDate,
    lines: [
      { account_code: debit, debit_cents: cents, credit_cents: 0, description: "dr" },
      { account_code: credit, debit_cents: 0, credit_cents: cents, description: "cr" },
    ],
    vendor: proposal, opKey: opk("x55-gen"),
  });
  await approveEntry(sub, { entry: d.entry_id, expectedRevision: d.revision_token, opKey: opk("x55-gena") });
  return d.entry_id;
}

export async function itemsOf(entry) {
  const r = await rootQuery(
    "select to_jsonb(i) as row from clara.open_items i where i.entry_id=$1 order by i.domain, i.item_kind, i.id",
    [entry],
  );
  return r.rows.map((x) => x.row);
}

export async function outstandingOf(item) {
  const r = await rootQuery(
    `select (i.amount_cents + coalesce(
        (select sum(a.amount_cents) from clara.open_item_allocations a where a.item_id=i.id),0))::bigint as n
       from clara.open_items i where i.id=$1`,
    [item],
  );
  return Number(r.rows[0].n);
}

export async function openArItem(sub, { client, cp, cents, postingDate = "2026-06-01" }) {
  const entry = await approvedGeneric(sub, { client, cp, cpKind: "customer", debit: AR1, credit: REVN, cents, postingDate, memo: "x55 ar item" });
  const items = await itemsOf(entry);
  assert.equal(items.length, 1, "an AR control entry mints exactly ONE item");
  assert.equal(items[0].domain, "ar");
  return { entry, item: items[0].id };
}

export async function openApItem(sub, { client, cp, cents, postingDate = "2026-06-01" }) {
  const entry = await approvedGeneric(sub, { client, cp, cpKind: "vendor", debit: EXPN, credit: AP1, cents, postingDate, memo: "x55 ap item" });
  const items = await itemsOf(entry);
  assert.equal(items.length, 1, "an AP control entry mints exactly ONE item");
  assert.equal(items[0].domain, "ap");
  return { entry, item: items[0].id };
}

export async function allocateReceipt(sub, { client, counterparty, postingDate, memo = "x55 receipt", bankAccount = BANK, amountCents, allocations = [], controlAccount = AR1, opKey = null }) {
  const r = await humanQuery(
    sub,
    `select clara.allocate_receipt(p_client => $1, p_counterparty => $2, p_posting_date => $3::date,
       p_memo => $4, p_bank_account => $5, p_amount_cents => $6::bigint, p_allocations => $7::jsonb,
       p_op_key => $8, p_control_account => $9) as result`,
    [client, counterparty, postingDate, memo, bankAccount, amountCents, JSON.stringify(allocations), opKey ?? opk("x55-rcpt"), controlAccount],
  );
  return r.rows[0].result;
}

export async function allocatePayment(sub, { client, counterparty, postingDate, memo = "x55 payment", bankAccount = BANK, amountCents, allocations = [], controlAccount = AP1, opKey = null }) {
  const r = await humanQuery(
    sub,
    `select clara.allocate_payment(p_client => $1, p_counterparty => $2, p_posting_date => $3::date,
       p_memo => $4, p_bank_account => $5, p_amount_cents => $6::bigint, p_allocations => $7::jsonb,
       p_op_key => $8, p_control_account => $9) as result`,
    [client, counterparty, postingDate, memo, bankAccount, amountCents, JSON.stringify(allocations), opKey ?? opk("x55-pay"), controlAccount],
  );
  return r.rows[0].result;
}

export async function applyOpenItems(sub, { client, applications, reason = "x55 apply", opKey = null }) {
  const r = await humanQuery(
    sub,
    `select clara.apply_open_items(p_client => $1, p_applications => $2::jsonb, p_reason => $3, p_op_key => $4) as result`,
    [client, JSON.stringify(applications), reason, opKey ?? opk("x55-apply")],
  );
  return r.rows[0].result;
}

export const groupOf = (receipt) => receipt?.group_id ?? receipt?.application_group ?? receipt?.group ?? null;

export async function controlGlAsOf(client, domain, asOf) {
  const cls = domain === "ar" ? "receivable" : "payable";
  const net = domain === "ar" ? "l.debit_cents - l.credit_cents" : "l.credit_cents - l.debit_cents";
  const r = await rootQuery(
    `select coalesce(sum(${net}),0)::bigint as n
       from clara.journal_lines l
       join clara.coa_accounts a on a.client_id=l.client_id and a.account_code=l.account_code
       join clara.journal_entries e on e.id=l.entry_id
      where l.client_id=$1 and a.account_class=$2 and e.status='approved' and e.posting_date<=$3::date`,
    [client, cls, asOf],
  );
  return Number(r.rows[0].n);
}

export async function arTotalsAt(sub, client, asOf) {
  const r = await humanQuery(sub, "select clara.ar_aging(p_client => $1, p_as_of => $2::date) as r", [client, asOf]);
  return r.rows[0].r;
}

export async function bookToday() {
  const r = await rootQuery("select clara._book_today()::text as d");
  return r.rows[0].d;
}

export function addDaysStr(dateStr, days) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// client_facts fixtures.
// ---------------------------------------------------------------------------

export async function recordClientFact(sub, { client, factKey, factValue, basis, basisKind, sourceDocument = null, opKey = null }) {
  const r = await humanQuery(
    sub,
    `select clara.record_client_fact(p_client => $1, p_fact_key => $2, p_fact_value => $3::jsonb,
       p_basis => $4, p_basis_kind => $5, p_source_document_id => $6, p_op_key => $7) as r`,
    [client, factKey, JSON.stringify(factValue), basis, basisKind, sourceDocument, opKey ?? opk("x55-fact")],
  );
  return r.rows[0].r;
}

export async function freshActiveClient(sub, tag) {
  return createClient(sub, { name: `x55_${tag}_${randomUUID().slice(0, 8)}`, opKey: opk(`x55-cli-${tag}`) });
}

/** Birth an onboarding client, answer entity_type through the INTERVIEW plan item
 *  (not the door), and commit -- the working wb-o-lifecycle O4 shape: open with
 *  an ADMIN (contributor), answer with a BOOKKEEPER (contributor), commit with the
 *  OWNER (never touched the plan, so eligible as the non-contributor checker). */
export async function committedClientWithEntityType(w, { entityType, name }) {
  const { client, plan, revision } = await wb.onboardingClient(w.users.hana, name);
  await wb.updatePlan({
    plan, expectedRevision: revision, answeredBy: w.users.bob,
    items: [
      { item_kind: "must_ask", item_key: "entity_type", question: "entity type?", state: "answered", answer: entityType },
      { item_kind: "todo", item_key: "carry_down_deferred", state: "deferred" },
    ],
  });
  const rev2 = await wb.planRevision(plan);
  await wb.commitOnboarding(w.users.alice, { client, plan, expectedPlanRevision: rev2 });
  return client;
}
