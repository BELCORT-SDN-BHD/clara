// Wave-A2.1 rig — credit-side sightings + the sales autopost lift (pin doc P2;
// contract §3.1/§3.2/§3.3 controls 1/5/6). CONTRACT-BLIND: pins only — never
// 0016 source. The load-bearing invariants:
//
//   SIDE: rule_sightings gains side ('debit'|'credit') NOT NULL, backfilled then
//     DEFAULT-dropped; uniqueness widened to include side. An approved entry's
//     income-class CREDIT legs record credit sightings (H2 carve-out + reversal
//     guard verbatim); the 3-sighting vendor_account auto-proposal stays
//     debit-scoped.
//   FLOORS are DIRECTION-AWARE: the sales floor counts ONLY side='credit'
//     sightings; a below-floor pool refuses (CLR27). The 0015 CLR27
//     sales_autopost_deferred raise is REMOVED — a structured sales rule now
//     admits and signs.
//   EVIDENCE CLASS: coding_rules.evidence_class CHECK ('structured','ocr_sales');
//     a sales autopost row MUST carry one; purchase rows stay NULL (CHECK).
//   OCR ADMISSION (§3.3 control 6): evidence_class='ocr_sales' needs ≥6 qualifying
//     human-approved credit sightings across ≥6 DISTINCT documents spanning ≥60
//     days — each leg of the floor refuses independently.
//
// Serial discipline: --test-concurrency=1.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  rootQuery, endPool, printLaneNotes, noteLane, printSkipCount,
  buildWorld, firmOf, opk,
  a21EnsureReady, skip16, metaProbe0016, SUSPENDED_STATUS, seedCorroboratingInvoiceFacts,
  proposeAutopostRule, signAutopostRule, ruleRowById,
  upsertPayableAccount, upsertAccountClassed, seedCitedDocument, freshResolution,
  draftEntryV3, approveEntry, stampCodingKind, billLines, ev, FIELD, counterpartyRows, codingRuleRows, sightingRows,
  checkDefs, uniqueIndexDefs, reasonOf,
  AP, EXP,
} from "./a21-helpers.mjs";

const REC = "300-A00"; // receivable control
const REV = "500-R01"; // income (the sales rule account)

let has16 = false;
let world = null;

function skipHere(t) { return skip16(t, has16, "0016 not applied — credit-sighting/sales-lift battery dormant"); }

/** A customer counterparty born through an approved sales entry (Dr REC / Cr REV).
 *  NOTE: the birth approval itself records ONE credit sighting — floor cells count
 *  from 1, not 0. Returns { cp, firstEntry }. */
async function makeCustomer(sub, { client, name, date = undefined }) {
  const firm = await firmOf(client);
  const cited = await seedCitedDocument(sub, { firm, client, quote: "RM 900.00" });
  // 0046: the BIRTH entry is floor evidence too — it needs the same corroboration and the
  // same coding kind as every top-up sighting, or the pool is one short of what the cell means.
  await seedCorroboratingInvoiceFacts(cited, { sub, firm, client, cents: 90000 });
  const d = await draftEntryV3(sub, {
    client, resolution: await freshResolution(sub, client, { subjectKind: "document", subjectId: cited.documentId }),
    document: cited.documentId, sha256: cited.sha256,
    lines: [
      { account_code: REC, debit_cents: 90000, credit_cents: 0, description: "sales-ar" },
      { account_code: REV, debit_cents: 0, credit_cents: 90000, description: "sales-rev" },
    ],
    vendor: { new: { name }, kind: "customer" },
    evidence: [ev(cited.regionId, cited.quote, FIELD.total)], opKey: opk("cust"),
    // The OCR span floor measures POSTING_DATE (adjudication) — span-sensitive
    // cells must control the birth date too, not just the top-up sightings.
    ...(date ? { postingDate: date } : {}),
  });
  await stampCodingKind(d.entry_id);
  await approveEntry(sub, { entry: d.entry_id, expectedRevision: d.revision_token, opKey: opk("custa") });
  const norm = name.toLowerCase().replace(/[^a-z0-9]/g, "");
  const cp = (await counterpartyRows(client)).find((c) => (c.name_normalized ?? "") === norm)?.id ?? null;
  return { cp, firstEntry: d.entry_id };
}

/** One approved sales entry for an EXISTING customer, citing its own fresh doc.
 *  `date` controls the posting date (the OCR floor's ≥60-day span). Returns
 *  { entryId, documentId }. `reuseDoc` cites a caller-provided doc instead. */
async function salesSighting(sub, { client, cp, date = "2026-06-10", cents = 90000, reuseDoc = null }) {
  const firm = await firmOf(client);
  const cited = reuseDoc ?? await seedCitedDocument(sub, { firm, client, quote: "RM 900.00" });
  // 0046: the floor now also needs `corroborated >= 6` (a reused doc keeps its one facts lane).
  if (!reuseDoc) await seedCorroboratingInvoiceFacts(cited, { sub, firm, client, cents: 90000 });
  const d = await draftEntryV3(sub, {
    client, resolution: await freshResolution(sub, client, { subjectKind: "document", subjectId: cited.documentId }),
    document: cited.documentId, sha256: cited.sha256,
    lines: [
      { account_code: REC, debit_cents: cents, credit_cents: 0, description: "sales-ar" },
      { account_code: REV, debit_cents: 0, credit_cents: cents, description: "sales-rev" },
    ],
    // INTEGRATION (CLASS T): the as-built 0015 counterparty resolution defaults
    // the existing_id lane to kind='vendor' — an existing CUSTOMER must state
    // its kind or the lookup refuses CLR23 (pre-0016 live behavior, un-pinned).
    vendor: { existing_id: cp, kind: "customer" },
    evidence: [ev(cited.regionId, cited.quote, FIELD.total)],
    postingDate: date, opKey: opk("ss"),
  });
  // 0046 (7A-R4): the OCR-sales floor now counts only entries coded `sales_invoice`.
  // Nothing in the human lane can set a coding kind (neither clara.draft_entry nor
  // clara.revise_entry takes one), so the rig stamps the draft — see stampCodingKind's
  // header for why that is the sanctioned transition and not a back door.
  await stampCodingKind(d.entry_id);
  await approveEntry(sub, { entry: d.entry_id, expectedRevision: d.revision_token, opKey: opk("ssa") });
  return { entryId: d.entry_id, documentId: cited.documentId, cited };
}

before(async () => {
  const ready = await a21EnsureReady();
  has16 = ready.base && ready.has16;
  if (has16) {
    world = await buildWorld();
    for (const c of [world.clients.A1, world.clients.A2]) {
      await upsertPayableAccount(world.users.alice, { client: c, code: AP, name: "Trade Creditors", opKey: opk("ap") }).catch(() => {});
      await upsertAccountClassed(world.users.alice, { client: c, code: EXP, name: "Prof Fees", type: "expense", opKey: opk("exp") }).catch(() => {});
      await upsertAccountClassed(world.users.alice, { client: c, code: REC, name: "Trade Debtors", type: "asset", accountClass: "receivable", opKey: opk("rec") }).catch((e) => noteLane(`rec acct ${e.code}`));
      await upsertAccountClassed(world.users.alice, { client: c, code: REV, name: "Service Revenue", type: "income", opKey: opk("rev") }).catch((e) => noteLane(`rev acct ${e.code}`));
    }
  } else noteLane("0016 absent — a21-sightings-lift suite dormant");
});
after(async () => { printLaneNotes("a21-sightings-lift"); printSkipCount("a21-sightings-lift"); await endPool(); });

test("META a21-sightings-lift: migration 0016 present + the side/evidence_class markers exist", async (t) => {
  await metaProbe0016(t, has16, {
    label: "credit-sighting/sales-lift",
    columns: [["rule_sightings", "side"], ["coding_rules", "evidence_class"]],
  });
});

// ===========================================================================
// Structural — the side column, widened uniqueness, evidence_class CHECKs.
// ===========================================================================

test("P2 rule_sightings.side: NOT NULL, CHECK (debit|credit), DEFAULT DROPPED post-backfill; uniqueness widened to include side", async (t) => {
  if (skipHere(t)) return;
  const col = (await rootQuery(
    "select is_nullable, column_default from information_schema.columns where table_schema='clara' and table_name='rule_sightings' and column_name='side'",
  )).rows[0];
  assert.ok(col, "rule_sightings.side exists");
  assert.equal(col.is_nullable, "NO", "side is NOT NULL");
  assert.equal(col.column_default, null, "the backfill DEFAULT 'debit' is DROPPED (new writes must state their side)");
  const defs = await checkDefs("rule_sightings");
  assert.ok(defs.includes("'debit'") && defs.includes("'credit'"), `side CHECK admits debit+credit (got: ${defs.slice(0, 200)})`);
  const uq = await uniqueIndexDefs("rule_sightings");
  const widened = uq.find((d) => /side/.test(d) && /entry_id/.test(d) && /account_code/.test(d) && /counterparty_id/.test(d) && /client_id/.test(d));
  assert.ok(widened, `sighting uniqueness is (client, counterparty, account_code, entry, SIDE) (got: ${uq.join(" ~~ ").slice(0, 300)})`);
  // Every pre-existing (backfilled) sighting is 'debit' or 'credit' — no third state.
  const bad = (await rootQuery("select count(*)::int as n from clara.rule_sightings where side not in ('debit','credit')")).rows[0].n;
  assert.equal(bad, 0, "no sighting row escapes the side vocabulary");
});

test("P2 coding_rules.evidence_class: CHECK ('structured','ocr_sales'); a sales autopost row MUST carry one; a purchase row MUST stay NULL", async (t) => {
  if (skipHere(t)) return;
  const defs = await checkDefs("coding_rules");
  assert.ok(defs.includes("'structured'") && defs.includes("'ocr_sales'"), "evidence_class CHECK admits structured + ocr_sales");
  assert.ok(defs.includes(`'${SUSPENDED_STATUS}'`), `status CHECK admits '${SUSPENDED_STATUS}' (the repeated-skip ladder's landing state)`);
  // Behavioral CHECK cells via raw inserts (as root — below the writer layer).
  const { users, clients } = world;
  const firm = await firmOf(clients.A2);
  const { cp } = await makeCustomer(users.alice, { client: clients.A2, name: `CHKCO ${randomUUID().slice(0, 6)}` });
  assert.ok(cp, "the CHECK-cell customer exists (mandatory setup)");
  const rawRule = (direction, evidenceClass) => rootQuery(
    `insert into clara.coding_rules(firm_id,client_id,rule_type,counterparty_id,account_code,status,pinned,origin,content_hash,created_by,
        amount_cap_cents,frequency_window,window_max_posts,expires_at,direction,evidence_class)
     values($1,$2,'autopost',$3,$4,'proposed',false,'authored',encode(sha256(convert_to($5,'UTF8')),'hex'),$6,
        100000,'monthly',3,now()+interval '12 months',$7,$8) returning id`,
    [firm, clients.A2, cp, direction === "sales" ? REV : EXP, `chk-${randomUUID()}`, users.alice, direction, evidenceClass],
  );
  await assert.rejects(() => rawRule("sales", null), (e) => e.code === "23514",
    "a sales autopost row WITHOUT an evidence_class violates the CHECK (23514)");
  await assert.rejects(() => rawRule("purchase", "structured"), (e) => e.code === "23514",
    "a purchase autopost row WITH an evidence_class violates the CHECK (purchase rows stay NULL)");
  const ok = await rawRule("sales", "structured");
  assert.ok(ok.rows[0].id, "a sales autopost row WITH evidence_class satisfies the CHECK");
});

// ===========================================================================
// Recording — credit sightings on approved income credit legs; scoping.
// ===========================================================================

test("P2 an approved sales entry records a CREDIT sighting (side='credit', the income account); bills keep recording side='debit'", async (t) => {
  if (skipHere(t)) return;
  const { users, clients } = world;
  const { cp, firstEntry } = await makeCustomer(users.alice, { client: clients.A1, name: `CREDITCO ${randomUUID().slice(0, 6)}` });
  assert.ok(cp, "the customer counterparty was born through the audited path (mandatory setup)");
  const rows = (await sightingRows(clients.A1)).filter((s) => s.counterparty_id === cp);
  const credit = rows.find((s) => s.side === "credit" && s.entry_id === firstEntry);
  assert.ok(credit, `the approved sales entry recorded a credit sighting (rows: ${JSON.stringify(rows.map((r) => [r.side, r.account_code])).slice(0, 200)})`);
  assert.equal(credit.account_code, REV, "the credit sighting keys on the INCOME account of the credit leg");
  // INTEGRATION (CLASS T, ratified as-built): the 0015 debit pool is preserved
  // VERBATIM by the pin (additive credit recorder; H2 carve-out + reversal guard
  // verbatim) — it records side='debit' for ANY debit leg with an active account,
  // so a sales entry's AR control debit ALSO records a sighting. The pins never
  // scope the debit recorder; asserting zero contradicted the preserved baseline.
  // Flagged for the adversarial pass: customers accrue debit sightings on the
  // receivable control account (see the vendor_account-breeding test below).
  const debits = rows.filter((s) => s.side === "debit");
  assert.ok(debits.every((s) => s.account_code === REC), `a pure sales entry's debit sightings key ONLY on the AR control leg (0015-verbatim pool; got ${JSON.stringify(debits.map((d) => d.account_code))})`);
  // The purchase side still records debit sightings (regression).
  const firm = await firmOf(clients.A1);
  const cited = await seedCitedDocument(users.alice, { firm, client: clients.A1, quote: "RM 500.00" });
  const d = await draftEntryV3(users.alice, {
    client: clients.A1, resolution: await freshResolution(users.alice, clients.A1, { subjectKind: "document", subjectId: cited.documentId }),
    document: cited.documentId, sha256: cited.sha256, lines: billLines(EXP, AP, 50000),
    vendor: { new: { name: `DEBITCO ${randomUUID().slice(0, 6)}`, registration_no: "201801040001" } },
    evidence: [ev(cited.regionId, cited.quote, FIELD.total)], opKey: opk("bill"),
  });
  await approveEntry(users.alice, { entry: d.entry_id, expectedRevision: d.revision_token, opKey: opk("billa") });
  const deb = (await sightingRows(clients.A1)).find((s) => s.entry_id === d.entry_id);
  assert.ok(deb, "the approved supplier bill recorded a sighting");
  assert.equal(deb.side, "debit", "the bill sighting is side='debit'");
});

test("P2 the 3-sighting vendor_account auto-proposal stays DEBIT-scoped — 3 credit sightings breed NO vendor_account rule", async (t) => {
  if (skipHere(t)) return;
  const { users, clients } = world;
  const { cp } = await makeCustomer(users.alice, { client: clients.A2, name: `NOAUTO ${randomUUID().slice(0, 6)}` });
  assert.ok(cp, "customer exists (mandatory setup)");
  await salesSighting(users.alice, { client: clients.A2, cp, date: "2026-05-01" });
  await salesSighting(users.alice, { client: clients.A2, cp, date: "2026-05-02" });
  // ADV-2 (round 1): the auto-proposal pool now admits only canonical VENDOR
  // counterparties onto NON-CONTROL accounts — a customer breeds NOTHING, on
  // any side (the round-0 tolerance for AR-control breeding is repealed).
  const auto = (await codingRuleRows(clients.A2)).filter((r) => r.counterparty_id === cp && r.rule_type === "vendor_account");
  assert.equal(auto.length, 0, "≥3 CREDIT sightings never auto-propose a vendor_account rule (customer + control-class pools are gated out)");
});

// ===========================================================================
// The lift — direction-aware floors; the deferral raise removed.
// ===========================================================================

test("§3.2 the STRUCTURED sales lift: below the credit floor REFUSES (CLR27); at ≥3 credit sightings it proposes + signs LIVE (the 0015 deferral raise is GONE)", async (t) => {
  if (skipHere(t)) return;
  const { users, clients } = world;
  const { cp } = await makeCustomer(users.alice, { client: clients.A1, name: `SALESLIFT ${randomUUID().slice(0, 6)}` });
  assert.ok(cp, "customer exists (mandatory setup)");
  // 1 credit sighting (the birth) < the floor.
  const below = await proposeAutopostRule(users.alice, { client: clients.A1, cp, accountCode: REV, direction: "sales", evidenceClass: "structured" });
  assert.ok(below.error, "a sales proposal below the credit-sighting floor is REFUSED");
  assert.equal(below.error.code, "CLR27", `the floor refusal is CLR27 (got ${below.error.code})`);
  assert.notEqual(reasonOf(below.error), "sales_autopost_deferred", "the refusal is the FLOOR, not the removed 0015 deferral");
  // Top up to ≥3 credit sightings → the lift admits + the admin signs.
  await salesSighting(users.alice, { client: clients.A1, cp, date: "2026-05-05" });
  await salesSighting(users.alice, { client: clients.A1, cp, date: "2026-06-05" });
  const okP = await proposeAutopostRule(users.alice, { client: clients.A1, cp, accountCode: REV, direction: "sales", evidenceClass: "structured" });
  assert.ok(!okP.error, `a structured sales proposal with ≥3 credit sightings is ADMITTED (got ${okP.error?.code}/${okP.error ? reasonOf(okP.error) : ""}) — the sales_autopost_deferred raise is removed`);
  assert.ok(okP.id, "the proposal returns/lands a rule row");
  await signAutopostRule(users.alice, { rule: okP.id });
  const row = await ruleRowById(okP.id);
  assert.equal(row?.status, "live", "the signed structured sales rule is LIVE");
  assert.equal(row?.direction, "sales", "direction='sales' is admitted end-to-end");
  assert.equal(row?.evidence_class, "structured", "the evidence class is bound into the signed rule");
});

test("§3.1 the floors are DIRECTION-AWARE: a purchase floor is not satisfied by credit sightings, a sales floor not by debit sightings", async (t) => {
  if (skipHere(t)) return;
  const { users, clients } = world;
  // Customer with 3+ CREDIT sightings but zero debit — the PURCHASE floor refuses.
  const { cp } = await makeCustomer(users.alice, { client: clients.A2, name: `XPOOL ${randomUUID().slice(0, 6)}` });
  assert.ok(cp, "customer exists (mandatory setup)");
  await salesSighting(users.alice, { client: clients.A2, cp, date: "2026-04-01" });
  await salesSighting(users.alice, { client: clients.A2, cp, date: "2026-04-02" });
  const credits = (await sightingRows(clients.A2)).filter((s) => s.counterparty_id === cp && s.side === "credit").length;
  assert.ok(credits >= 3, `the customer holds ≥3 CREDIT sightings (${credits}) — mandatory setup`);
  const purchase = await proposeAutopostRule(users.alice, { client: clients.A2, cp, accountCode: EXP, direction: "purchase" });
  assert.ok(purchase.error, "a PURCHASE proposal against a credit-only pool is REFUSED (the debit pool is empty — credit sightings never satisfy it)");
  // And the mirror: a vendor with debit-only sightings cannot satisfy a sales floor.
  const firm = await firmOf(clients.A2);
  const cited = await seedCitedDocument(users.alice, { firm, client: clients.A2, quote: "RM 500.00" });
  const d = await draftEntryV3(users.alice, {
    client: clients.A2, resolution: await freshResolution(users.alice, clients.A2, { subjectKind: "document", subjectId: cited.documentId }),
    document: cited.documentId, sha256: cited.sha256, lines: billLines(EXP, AP, 50000),
    vendor: { new: { name: `XVEND ${randomUUID().slice(0, 6)}`, registration_no: "201801040002" } },
    evidence: [ev(cited.regionId, cited.quote, FIELD.total)], opKey: opk("xv"),
  });
  await approveEntry(users.alice, { entry: d.entry_id, expectedRevision: d.revision_token, opKey: opk("xva") });
  const vcp = (await sightingRows(clients.A2)).find((s) => s.entry_id === d.entry_id)?.counterparty_id;
  assert.ok(vcp, "the vendor holds a debit sighting (mandatory setup)");
  const sales = await proposeAutopostRule(users.alice, { client: clients.A2, cp: vcp, accountCode: REV, direction: "sales", evidenceClass: "structured" });
  assert.ok(sales.error, "a SALES proposal against a debit-only pool is REFUSED (debit sightings never satisfy the credit floor)");
});

// ===========================================================================
// The OCR admission floor (§3.3 control 6) — each leg refuses independently.
// ===========================================================================

test("§3.3 OCR admission: 6 credit sightings inside <60 days REFUSE; widening the span past 60 days admits + signs", async (t) => {
  if (skipHere(t)) return;
  const { users, clients } = world;
  // INTEGRATION (CLASS T): the span is measured on POSTING_DATE (adjudication) —
  // pin the birth INSIDE the tight window (the draft default 2026-03-15 would
  // silently widen the span past 60 days and admit the "tight" cell).
  const { cp } = await makeCustomer(users.alice, { client: clients.A1, name: `OCRSPAN ${randomUUID().slice(0, 6)}`, date: "2026-05-05" });
  assert.ok(cp, "customer exists (mandatory setup)");
  // Birth (2026-05-05) + 5 more, all 2026-05-01..2026-06-10 → 6 sightings, 6 docs, span < 60 days.
  for (const date of ["2026-05-01", "2026-05-10", "2026-05-20", "2026-06-01", "2026-06-10"]) {
    await salesSighting(users.alice, { client: clients.A1, cp, date });
  }
  const tight = await proposeAutopostRule(users.alice, { client: clients.A1, cp, accountCode: REV, direction: "sales", evidenceClass: "ocr_sales" });
  assert.ok(tight.error, "an ocr_sales proposal whose sightings span <60 days is REFUSED (control 6 — a meaningful time span)");
  assert.equal(tight.error.code, "CLR27", `the OCR floor refusal is CLR27 (got ${tight.error.code})`);
  // Widen the span (two more sightings back in Jan/Feb) → ≥6 docs, ≥60-day span.
  await salesSighting(users.alice, { client: clients.A1, cp, date: "2026-01-15" });
  await salesSighting(users.alice, { client: clients.A1, cp, date: "2026-02-15" });
  const wide = await proposeAutopostRule(users.alice, { client: clients.A1, cp, accountCode: REV, direction: "sales", evidenceClass: "ocr_sales" });
  assert.ok(!wide.error, `an ocr_sales proposal with ≥6 distinct-document credit sightings spanning ≥60 days is ADMITTED (got ${wide.error?.code}/${wide.error ? reasonOf(wide.error) : ""})`);
  await signAutopostRule(users.alice, { rule: wide.id });
  const row = await ruleRowById(wide.id);
  assert.equal(row?.status, "live", "the signed ocr_sales rule is LIVE");
  assert.equal(row?.evidence_class, "ocr_sales", "the OCR evidence class is bound into the signed rule");
});

test("§3.3 OCR admission: 6 sightings across only 5 DISTINCT documents REFUSE; a 6th distinct document admits", async (t) => {
  if (skipHere(t)) return;
  const { users, clients } = world;
  const { cp } = await makeCustomer(users.alice, { client: clients.A2, name: `OCRDOCS ${randomUUID().slice(0, 6)}` });
  assert.ok(cp, "customer exists (mandatory setup)");
  // Birth doc (1). Three more distinct docs across the span (2,3,4)…
  const s2 = await salesSighting(users.alice, { client: clients.A2, cp, date: "2026-01-20" });
  await salesSighting(users.alice, { client: clients.A2, cp, date: "2026-03-01" });
  await salesSighting(users.alice, { client: clients.A2, cp, date: "2026-04-20" });
  // …then a FIFTH doc cited by TWO entries (sightings 5+6 share a document).
  const s5 = await salesSighting(users.alice, { client: clients.A2, cp, date: "2026-05-15" });
  let shared = null;
  try {
    shared = await salesSighting(users.alice, { client: clients.A2, cp, date: "2026-05-25", reuseDoc: s5.cited });
  } catch (e) {
    noteLane(`a second entry citing the same document refused ${e.code} — the 6-of-5-docs cell degrades to 5-sightings-5-docs (still below the floor)`);
  }
  const sightings = (await sightingRows(clients.A2)).filter((s) => s.counterparty_id === cp && s.side === "credit").length;
  assert.ok(sightings >= 5, `the pool holds ${sightings} credit sightings (mandatory setup)`);
  const dup = await proposeAutopostRule(users.alice, { client: clients.A2, cp, accountCode: REV, direction: "sales", evidenceClass: "ocr_sales" });
  assert.ok(dup.error, `${sightings} sightings across ≤5 DISTINCT documents are REFUSED (control 6 — distinct document_ids, not raw sighting count)`);
  // A genuinely distinct sixth document admits.
  await salesSighting(users.alice, { client: clients.A2, cp, date: "2026-06-15" });
  const ok = await proposeAutopostRule(users.alice, { client: clients.A2, cp, accountCode: REV, direction: "sales", evidenceClass: "ocr_sales" });
  assert.ok(!ok.error, `with ≥6 distinct documents the ocr_sales proposal is ADMITTED (got ${ok.error?.code}/${ok.error ? reasonOf(ok.error) : ""})`);
  void s2; void shared;
});

test("WA21-R10 bounds parity: an over-high-stakes cap is treated IDENTICALLY for structured and ocr_sales (no silent OCR loosening)", async (t) => {
  if (skipHere(t)) return;
  const { users, clients } = world;
  const { cp } = await makeCustomer(users.alice, { client: clients.A1, name: `BOUNDPAR ${randomUUID().slice(0, 6)}` });
  assert.ok(cp, "customer exists (mandatory setup)");
  for (const date of ["2026-01-05", "2026-02-05", "2026-03-05", "2026-04-05", "2026-05-05", "2026-06-05"]) {
    await salesSighting(users.alice, { client: clients.A1, cp, date });
  }
  const capTooBig = 5_000_000_00; // RM5m — far past the firm high-stakes ceiling
  const structured = await proposeAutopostRule(users.alice, { client: clients.A1, cp, accountCode: REV, direction: "sales", evidenceClass: "structured", cap: capTooBig });
  const ocr = await proposeAutopostRule(users.alice, { client: clients.A1, cp, accountCode: REV, direction: "sales", evidenceClass: "ocr_sales", cap: capTooBig });
  const cls = (r) => (r.error ? `refused:${r.error.code}` : "admitted");
  assert.equal(cls(ocr), cls(structured), `the OCR class carries the SAME bound outcome as structured for an over-cap proposal (structured=${cls(structured)}, ocr=${cls(ocr)}) — WA21-R10 owner override, no tighter and no looser`);
});
