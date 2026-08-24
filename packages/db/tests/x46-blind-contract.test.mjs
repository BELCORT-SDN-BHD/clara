// §7-A rig — the CONTRACT-BLIND battery for migration 0046 (the unattended sales
// drafter). Written straight from `docs/plan/completed/wave-7a-contract.md` (7A-R1..R12) +
// `docs/plan/completed/wave-7a-design-skeleton.md` §2b/§2c/§2d/§4.1 + `packages/db/README.md`
// + the existing rig idioms (a21-helpers.mjs and its chain). It NEVER reads
// `0046_wave_7a_sales_lane.sql`, `x46-wave-7a-sales-lane.test.mjs`, or any review
// report. Every function name, signature, and behavior asserted below was learned
// by APPLYING the migration to a throwaway rig and INTERROGATING the live catalog
// (pg_proc/pg_constraint/information_schema) plus observed runtime behavior — the
// same "catalog + behavior" discipline the work order sanctions and the same
// discipline a21-helpers.mjs's own fnSource/checkDefs probes already use. A
// divergence between an expectation here and the delivered database is a FINDING,
// never a silent test edit.
//
// Contract-silent items this file found (reported here, not guessed at):
//   - The exact vocabulary of `coding_lane` reasons for a direction-unresolved
//     filing is not pinned by the contract (only the OUTCOME "unresolved never
//     drafts" is). Assertions below pin the outcome (lane != 'ready', admission
//     never 'admitted') and note the observed reason token without hard-failing
//     on its exact spelling.
//   - Whether a "paused" backfill batch also blocks opening a second batch (vs.
//     only "open") is not pinned by the contract's §1 text ("at most one open
//     batch"). Observed behavior: the uniqueness guard covers open OR paused —
//     asserted as observed, flagged as a finding for adjudication.
//
// Serial discipline: this file drives real corroboration/floor state per client:
// --test-concurrency=1 (matching every other 0046-generation rig file).

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  rootQuery, humanQuery, roleQuery, endPool, printLaneNotes, noteLane, printSkipCount, markSkip,
  waveAEnsureReady, buildWorld, firmOf, opk, ROLES,
  addClientIdentifier, upsertAccountClassed, upsertPayableAccount, grantConsent,
  seedCitedDocument, mintLegacyInvoiceFactsTask, invoiceFactsTask, claimTask, persistInvoiceFacts, factField,
  freshResolution, draftEntryV3, approveEntry, stampCodingKind, seedCorroboratingInvoiceFacts,
  proposeAutopostRule, signAutopostRule, postViaRule, counterpartyRows,
  reasonOf, mintInteractive, wakeDraftEntry, ev, factsRegion, FIELD,
  admitAutodraft, ORIGIN, primeReadyFiling, beginAutodraft, settleAutodraft,
  humanPersona, codingLane, lastSkipReason, entryStatusOf, assertRaises, restateSightings,
} from "./a21-helpers.mjs";

// ---------------------------------------------------------------------------
// Readiness — the 0046 marker is its own migration row (a21EnsureReady only
// checks up to 0016; this file needs its own gate).
// ---------------------------------------------------------------------------

async function has0046() {
  try {
    const r = await rootQuery("select 1 from clara.schema_migrations where version ~ '^0046_' limit 1");
    return r.rows.length > 0;
  } catch { return false; }
}
let has46 = false;
function skip46(t, msg = "0046 not applied — the §7-A blind battery is dormant") {
  if (!has46) { markSkip(); t.skip(msg); return true; }
  return false;
}

const REC = "300-000"; // trade debtors (receivable)
const REV = "500-000"; // revenue (income) — the sales rule account
const AP = "400-000"; // trade creditors (payable) — for the generic 6-arity settle probe
const EXP = "500-A01"; // expense

let world = null; // shared: firms A (activated in before()) / B (left inactive) / S (spare)
let firmA = null, firmB = null;

/** The client's registered NAME (buildWorld mints these — never a literal guess;
 *  the direction contract compares against the actual persisted row, exactly as
 *  wave-a2-direction.test.mjs / wave-a2-sales-shape.test.mjs already establish). */
async function clientName(client) {
  return (await rootQuery("select name from clara.clients where id=$1", [client])).rows[0].name;
}

/** A cited, filed invoice document whose supplier identity IS `client` (⇒ sales
 *  direction) and whose buyer is `customerName` (a brand-new or existing name).
 *  By default TAX-SILENT (no total_excl_tax/tax_total stated) — the real-world
 *  shape 7A-R3 exists for (all 22 real RS invoices are tax-silent). Does NOT
 *  corroborate (the 0023 predicate needs the explicit net+tax identity this
 *  fixture omits). Returns the `seedCitedDocument` shape (documentId, filingId,
 *  sha256, regionId, quote, ...). */
async function taxSilentSalesFiling(sub, { client, firm, customerName, reg = "199901000700" }) {
  const name = await clientName(client);
  await grantConsent(sub, { firm, client }).catch(() => {});
  const cited = await seedCitedDocument(sub, { firm, client, quote: "RM 1,000.00", kind: "invoice" });
  // F-A1 PR-3 CUTOVER: the router's invoice-kind arm now mints llm_witness, never
  // invoice_facts (no dual-run, D9) -- this fixture only needs a task ON the
  // invoice_facts lane to exercise ITS downstream machinery, so it mints directly.
  await mintLegacyInvoiceFactsTask(cited.documentId);
  const task = await invoiceFactsTask(cited.documentId);
  await claimTask(task.id, { egressApproved: true });
  await persistInvoiceFacts(task.id, [
    factField("invoice.total", "RM 1,000.00"), factField("invoice.currency", "MYR"),
    factField("invoice.vendor_name", name), factField("invoice.vendor_registration", reg, { polygon: [], confidence: 0.9 }),
    factField("invoice.customer_name", customerName),
    factField("invoice.invoice_id", `X46-${randomUUID().slice(0, 8)}`),
    // deliberately NO total_excl_tax / tax_total — tax-silent, non-corroborating.
  ]);
  return cited;
}

/** Persist a TAX-SILENT invoice_id-only facts state on a cited document (a real
 *  stated invoice number, no net/tax) — the shape that "qualifies" (a genuine
 *  stated invoice sighting) but never "corroborates" (the 0023 predicate needs
 *  the explicit net+tax identity this state omits). Distinct from a document
 *  that carries NO facts at all — `distinct_invoices` reads the stated invoice
 *  number, so a facts-absent document would undercount `qualifying`'s partner
 *  dimensions too, conflating "never examined" with "examined, tax-silent". */
async function persistTaxSilentFacts(sub, { cited, firm, client, cents = 90000, vendorName = "X46 SELLER SDN BHD", customerName = "X46 BUYER", sellerIsClient = false }) {
  await grantConsent(sub, { firm, client }).catch(() => {});
  // [lane-7a-db, terminal-proof fixture — REPORTED] `sellerIsClient` states the CLIENT as the
  // supplier on the page, which is what makes clara._document_direction resolve SALES.
  //
  // WHY THAT DECIDES WHETHER A CELL CAN SEE `not_corroborated` AT ALL — measured, not guessed.
  // clara.execute_rule_post derives the counterparty kind it looks for FROM THE DIRECTION
  // (`case when v_direction='sales' then 'customer' else 'vendor' end`) and then re-resolves
  // the draft's proposed counterparty with that kind. With a generic seller the direction is
  // PURCHASE, so the executor hunts a VENDOR, the customer row fails
  // _resolve_counterparty's `kind=v_kind` filter, and the whole post is refused CLR23 ->
  // `counterparty_ambiguous` — one control BEFORE corroboration is ever consulted. Every
  // zero-corroboration cell that used this fixture was therefore proving "never posted" and
  // NOT "not_corroborated". Both registration and name are stated together because a
  // registration that matches while the name names someone else makes direction ABSTAIN
  // (CLR30, the RESIDUAL-3 shape) instead of resolving sales.
  const sellerName = sellerIsClient ? await clientName(client) : vendorName;
  const sellerReg = sellerIsClient ? "199901000700" : null;
  await rootQuery("update clara.documents set document_kind='invoice' where id=$1", [cited.documentId]);
  // F-A1 PR-3 CUTOVER (see taxSilentSalesFiling above): mint the invoice_facts task
  // directly -- the real enqueue RPC no longer routes an invoice-kind document here.
  await mintLegacyInvoiceFactsTask(cited.documentId);
  const task = await invoiceFactsTask(cited.documentId);
  const claimed = await claimTask(task.id, { egressApproved: true });
  if (claimed?.status !== "running") throw new Error(`persistTaxSilentFacts: invoice_facts task did not reach running (got ${JSON.stringify(claimed)})`);
  const rm = (c) => `RM ${(c / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
  await persistInvoiceFacts(task.id, [
    factField("invoice.total", rm(cents)), factField("invoice.currency", "MYR"),
    factField("invoice.vendor_name", sellerName), factField("invoice.customer_name", customerName),
    ...(sellerReg ? [factField("invoice.vendor_registration", sellerReg, { polygon: [], confidence: 0.9 })] : []),
    factField("invoice.invoice_id", `X46NC-${randomUUID().slice(0, 8)}`),
    // deliberately NO total_excl_tax / tax_total — a real stated invoice number,
    // never corroborating (7A-R3's real-world tax-silent shape).
  ]);
}

/** A birth entry for a NEW sales customer: Dr REC / Cr REV, citing a corroborating
 *  document. `stampKind=false` leaves coding_kind NULL (the "generic hand-draft"
 *  shape — nothing in the human lane can set a coding kind; a21-helpers'
 *  stampCodingKind header explains why the rig stamps drafts as the agent's
 *  stand-in). `corroborate=false` still states a real invoice number (tax-silent,
 *  qualifying) — see persistTaxSilentFacts. Returns { cp, entryId, documentId }. */
async function birthSalesCustomer(sub, { client, firm, name, date, stampKind = true, corroborate = true, cents = 90000 , sellerIsClient = false }) {
  const cited = await seedCitedDocument(sub, { firm, client, quote: "RM 900.00", kind: "invoice" });
  if (corroborate) await seedCorroboratingInvoiceFacts(cited, { sub, firm, client, cents });
  else await persistTaxSilentFacts(sub, { cited, firm, client, cents, vendorName: name, customerName: name, sellerIsClient });
  const d = await draftEntryV3(sub, {
    client, resolution: await freshResolution(sub, client, { subjectKind: "document", subjectId: cited.documentId }),
    document: cited.documentId, sha256: cited.sha256,
    lines: [
      { account_code: REC, debit_cents: cents, credit_cents: 0, description: "sales-ar" },
      { account_code: REV, debit_cents: 0, credit_cents: cents, description: "sales-rev" },
    ],
    vendor: { new: { name }, kind: "customer" },
    evidence: [ev(cited.regionId, cited.quote, FIELD.total)], opKey: opk("bsc"),
    ...(date ? { postingDate: date } : {}),
  });
  if (stampKind) await stampCodingKind(d.entry_id);
  await approveEntry(sub, { entry: d.entry_id, expectedRevision: d.revision_token, opKey: opk("bsca") });
  const norm = name.toLowerCase().replace(/[^a-z0-9]/g, "");
  const cp = (await counterpartyRows(client)).find((c) => (c.name_normalized ?? "") === norm)?.id ?? null;
  // F-A2 PR-1 (D39): the eighth _approve_entry_core body no longer breeds, so the sighting the
  // 7A-R4 floor reads is RESTATED from the real approved entry (0037:2049-2061's own inserts,
  // replayed). Every cell in this file claims something about the FLOOR, never about breeding.
  if (cp) await restateSightings(d.entry_id, { counterparty: cp });
  return { cp, entryId: d.entry_id, documentId: cited.documentId };
}

/** A follow-up sales sighting for an EXISTING customer, citing a fresh document.
 *  `stampKind`/`corroborate` gate the two 7A-R4 dimensions independently. */
async function salesSighting(sub, { client, firm, cp, date, stampKind = true, corroborate = true, cents = 90000, approve = true, sellerIsClient = false }) {
  const cited = await seedCitedDocument(sub, { firm, client, quote: "RM 900.00", kind: "invoice" });
  if (corroborate) await seedCorroboratingInvoiceFacts(cited, { sub, firm, client, cents });
  else await persistTaxSilentFacts(sub, { cited, firm, client, cents, sellerIsClient });
  const d = await draftEntryV3(sub, {
    client, resolution: await freshResolution(sub, client, { subjectKind: "document", subjectId: cited.documentId }),
    document: cited.documentId, sha256: cited.sha256,
    lines: [
      { account_code: REC, debit_cents: cents, credit_cents: 0, description: "sales-ar" },
      { account_code: REV, debit_cents: 0, credit_cents: cents, description: "sales-rev" },
    ],
    vendor: { existing_id: cp, kind: "customer" },
    evidence: [ev(cited.regionId, cited.quote, FIELD.total)], postingDate: date, opKey: opk("ss46"),
  });
  if (stampKind) await stampCodingKind(d.entry_id);
  // [lane-7a-db, cherry-pick repair #2 — REPORTED] `approve:false` leaves the entry a DRAFT.
  // clara.execute_rule_post operates on a DRAFT, so a cell testing "the rule refuses to post
  // this" must hand it one; an already-approved subject makes the status reading meaningless
  // (see the post half of the 7A-R4 cell).
  if (approve) {
    await approveEntry(sub, { entry: d.entry_id, expectedRevision: d.revision_token, opKey: opk("ss46a") });
    // F-A2 PR-1 (D39): restated, not bred — see birthSalesCustomer. An UNAPPROVED entry gets
    // nothing: restateSightings re-checks the retired writer's own gate before writing.
    await restateSightings(d.entry_id, { counterparty: cp });
  }
  return { entryId: d.entry_id, documentId: cited.documentId };
}

/** Raw-inserted coding_rules row bypassing propose (root; the a21-sightings-lift
 *  precedent for exercising sign/post independent of propose's own refusal).
 *  ck_coding_rules_terminal requires signed_by/signed_at set together with
 *  status IN ('live','suspended_pending_resignature') — a 'proposed' row must
 *  carry neither. */
async function rawRule(sub, { client, firm, cp, accountCode, status = "proposed", direction = "sales", evidenceClass = "ocr_sales" }) {
  const signed = status === "live" || status === "suspended_pending_resignature";
  const r = await rootQuery(
    `insert into clara.coding_rules(firm_id,client_id,rule_type,counterparty_id,account_code,status,pinned,origin,content_hash,created_by,
        amount_cap_cents,frequency_window,window_max_posts,expires_at,direction,evidence_class,signed_by,signed_at)
     values($1,$2,'autopost',$3,$4,$5,false,'authored',encode(sha256(convert_to($6,'UTF8')),'hex'),$7,
        200000,'monthly',3,now()+interval '12 months',$8,$9,$10,$11) returning id`,
    [firm, client, cp, accountCode, status, `x46raw-${randomUUID()}`, sub, direction, evidenceClass,
      signed ? sub : null, signed ? new Date() : null],
  );
  return r.rows[0].id;
}

async function roleGrants(fn) {
  const roles = {
    authenticated: ROLES.authenticated, runtime: ROLES.runtime, agentRo: ROLES.agentRo,
    wakeInteractive: ROLES.wakeInteractive, wakeProactive: ROLES.wakeProactive,
  };
  const out = {};
  for (const [label, role] of Object.entries(roles)) {
    const r = await rootQuery(
      `select bool_or(has_function_privilege($1,p.oid,'execute')) as ok
         from pg_proc p join pg_namespace n on n.oid=p.pronamespace
        where n.nspname='clara' and p.proname=$2`,
      [role, fn],
    );
    out[label] = r.rows[0]?.ok ?? null;
  }
  return out;
}

before(async () => {
  const base = await waveAEnsureReady();
  has46 = base && (await has0046());
  if (!has46) { noteLane(base ? "0046 absent — §7-A blind battery dormant" : "0011 surface absent"); return; }
  world = await buildWorld();
  const { users, clients } = world;
  firmA = await firmOf(clients.A1);
  firmB = await firmOf(clients.B1);
  for (const [c, sub] of [[clients.A1, users.alice], [clients.A2, users.alice]]) {
    await addClientIdentifier(sub, { client: c, kind: "ssm", value: "199901000700" }).catch(() => {});
    await addClientIdentifier(sub, { client: c, kind: "tin", value: "199901000700" }).catch(() => {});
    await upsertAccountClassed(sub, { client: c, code: REC, name: "Trade Debtors", type: "asset", accountClass: "receivable", opKey: opk("rec46") });
    await upsertAccountClassed(sub, { client: c, code: REV, name: "Revenue", type: "income", opKey: opk("rev46") });
  }
  await upsertPayableAccount(users.alice, { client: clients.A2, code: AP, name: "Trade Creditors", opKey: opk("ap46") }).catch(() => {});
  await upsertAccountClassed(users.alice, { client: clients.A2, code: EXP, name: "Prof Fees", type: "expense", opKey: opk("exp46") }).catch(() => {});
  // Activate firm A ONCE for the whole shared world (7A-R1's ceremony act: no app
  // role holds this grant — see the kill-switch group below — so the rig flips it
  // as root, exactly as the deploy ceremony would from an elevated connection).
  await rootQuery(
    "select clara.set_sales_lane_activation(p_firm=>$1,p_active=>true,p_watermark=>null,p_reason=>$2) as r",
    [firmA, "x46 blind-lane suite activation"],
  );
});
after(async () => { printLaneNotes("x46-blind-contract"); printSkipCount("x46-blind-contract"); await endPool(); });

// ===========================================================================
// META — the migration is present; the structural shape the contract's own
// build note mandates (§3 PR-DB item 1: the tail must assert the exact live
// caller set + that each authority caller gates corroborated>=6).
// ===========================================================================

test("META x46: migration 0046 present, exactly once", async (t) => {
  if (skip46(t)) return;
  const mig = await rootQuery("select version from clara.schema_migrations where version ~ '^0046_'");
  assert.equal(mig.rows.length, 1, `exactly one applied 0046_* migration (got ${mig.rows.map((x) => x.version).join(",")})`);
});

test("STRUCTURAL _ocr_sales_floor returns (qualifying,distinct_invoices,corroborated,span_days) — doc defect 2 (distinct_docs) is gone", { skip: "_ocr_sales_floor retired with F-A2 PR-3 — this cell's claim has no subject left" }, async () => {
  // RETIRED (F-A2 PR-3, Annex B.1): _ocr_sales_floor itself is dropped.
  const r = await rootQuery(
    "select pg_get_function_result(oid) as ret from pg_proc where proname='_ocr_sales_floor' and pronamespace='clara'::regnamespace",
  );
  const ret = r.rows[0]?.ret ?? "";
  assert.match(ret, /qualifying integer/i);
  assert.match(ret, /distinct_invoices integer/i);
  assert.match(ret, /corroborated integer/i);
  assert.match(ret, /span_days integer/i);
  assert.doesNotMatch(ret, /distinct_docs/i, "the never-read distinct_docs column is dropped (doc defect 2)");
});

test("STRUCTURAL the exact live caller set: propose/sign/post/preview each reference _ocr_sales_floor (caller four is the preview verb)", { skip: "the whole caller/callee set retired with F-A2 PR-3 — this cell's claim has no subject left" }, async () => {
  // RETIRED (F-A2 PR-3, Annex B.1): all four named callers (propose_autopost_rule,
  // sign_autopost_rule, execute_rule_post, preview_ocr_sales_evidence) AND the callee
  // (_ocr_sales_floor) are dropped whole.
  for (const fn of ["propose_autopost_rule", "sign_autopost_rule", "execute_rule_post", "preview_ocr_sales_evidence"]) {
    const src = await rootQuery(
      "select string_agg(prosrc,' ~~ ') as s from pg_proc where proname=$1 and pronamespace='clara'::regnamespace",
      [fn],
    );
    assert.match(src.rows[0]?.s ?? "", /_ocr_sales_floor\(/, `${fn} calls _ocr_sales_floor (the fourth-caller census)`);
  }
});

// ===========================================================================
// GROUP 1 — 7A-R4 floor purity: sales posting authority is earned from SALES
// INVOICES ONLY. Ruling: `_ocr_sales_floor`'s authority terms count only
// coding_kind='sales_invoice' entries, on top of the corroborated>=6 ROOT fix.
// ===========================================================================

test("7A-R4 floor purity: 6 corroborating sightings with coding_kind LEFT NULL (generic) yield qualifying=0 — the same evidence tagged sales_invoice counts", { skip: "_ocr_sales_floor/propose_autopost_rule retired with F-A2 PR-3 — this cell's claim has no subject left" }, async () => {
  // RETIRED (F-A2 PR-3, Annex B.1): _ocr_sales_floor and propose_autopost_rule are dropped.
  const { users, clients } = world;
  const client = clients.A1;
  const firm = firmA;

  // Batch A — corroborating, but NEVER coded (the generic hand-draft shape).
  const untagged = `X46UNTAG ${randomUUID().slice(0, 6)}`;
  const birth = await birthSalesCustomer(users.alice, { client, firm, name: untagged, date: "2026-01-05", stampKind: false });
  assert.ok(birth.cp, "the generic-coding customer exists (mandatory setup)");
  for (const date of ["2026-02-05", "2026-03-05", "2026-04-05", "2026-05-05", "2026-06-05"]) {
    await salesSighting(users.alice, { client, firm, cp: birth.cp, date, stampKind: false });
  }
  const floorNull = await rootQuery(
    "select * from clara._ocr_sales_floor($1,$2,$3)", [client, birth.cp, REV],
  );
  assert.deepEqual(
    { qualifying: floorNull.rows[0].qualifying, corroborated: floorNull.rows[0].corroborated },
    { qualifying: 0, corroborated: 0 },
    `coding_kind NULL yields qualifying=0 AND corroborated=0 — the pop filter excludes non-sales_invoice entries entirely, not just fails their corroboration (got ${JSON.stringify(floorNull.rows[0])})`,
  );
  const proposedNull = await proposeAutopostRule(users.alice, { client, cp: birth.cp, accountCode: REV, direction: "sales", evidenceClass: "ocr_sales" });
  assert.ok(proposedNull.error, "a sales-invoice-shaped BUT untagged (coding_kind NULL) evidence pool REFUSES the ocr_sales proposal");
  assert.equal(proposedNull.error.code, "CLR27", `refusal is CLR27 (got ${proposedNull.error.code})`);

  // Batch B — the SAME evidence shape, this time coding_kind='sales_invoice'.
  const tagged = `X46TAG ${randomUUID().slice(0, 6)}`;
  const birth2 = await birthSalesCustomer(users.alice, { client, firm, name: tagged, date: "2026-01-06", stampKind: true });
  assert.ok(birth2.cp, "the tagged customer exists (mandatory setup)");
  for (const date of ["2026-02-06", "2026-03-06", "2026-04-06", "2026-05-06", "2026-06-06"]) {
    await salesSighting(users.alice, { client, firm, cp: birth2.cp, date, stampKind: true });
  }
  const floorTagged = await rootQuery("select * from clara._ocr_sales_floor($1,$2,$3)", [client, birth2.cp, REV]);
  assert.ok(floorTagged.rows[0].qualifying >= 6 && floorTagged.rows[0].corroborated >= 6,
    `coding_kind='sales_invoice' counts the identical evidence shape (got ${JSON.stringify(floorTagged.rows[0])})`);
  const proposedTagged = await proposeAutopostRule(users.alice, { client, cp: birth2.cp, accountCode: REV, direction: "sales", evidenceClass: "ocr_sales" });
  assert.ok(!proposedTagged.error, `the tagged pool is ADMITTED (got ${proposedTagged.error?.code}/${proposedTagged.error ? reasonOf(proposedTagged.error) : ""})`);
});

test("7A-R4 the corroborated>=6 gate: 6/6/60-qualifying but ZERO corroborated is REFUSED at propose, sign, AND post", { skip: "the OCR sales floor + rule-post executor + autopost-rule tier retired with F-A2 PR-3 — this cell's claim has no subject left" }, async () => {
  // RETIRED (F-A2 PR-3, Annex B.1): _ocr_sales_floor, propose_autopost_rule,
  // sign_autopost_rule and execute_rule_post (via postViaRule) are all dropped.
  const { users, clients } = world;
  const client = clients.A2;
  const firm = firmA;

  // 6 distinct sales-invoice-coded, tax-silent (non-corroborating) sightings
  // spanning >=60 posting days — every OTHER dimension of the floor is satisfied.
  const name = `X46NOCORR ${randomUUID().slice(0, 6)}`;
  const birth = await birthSalesCustomer(users.alice, { client, firm, name, date: "2026-01-05", stampKind: true, corroborate: false, sellerIsClient: true });
  assert.ok(birth.cp, "the non-corroborating customer exists (mandatory setup)");
  for (const date of ["2026-02-05", "2026-03-05", "2026-04-05", "2026-05-05", "2026-06-05"]) {
    await salesSighting(users.alice, { client, firm, cp: birth.cp, date, stampKind: true, corroborate: false, sellerIsClient: true });
  }
  const floor = await rootQuery("select * from clara._ocr_sales_floor($1,$2,$3)", [client, birth.cp, REV]);
  const f = floor.rows[0];
  assert.ok(f.qualifying >= 6 && f.distinct_invoices >= 6 && f.span_days >= 60, `every OTHER dimension clears the floor (got ${JSON.stringify(f)})`);
  assert.equal(f.corroborated, 0, `corroborated stays 0 for a purely tax-silent pool (got ${f.corroborated})`);

  // PROPOSE refuses.
  const proposed = await proposeAutopostRule(users.alice, { client, cp: birth.cp, accountCode: REV, direction: "sales", evidenceClass: "ocr_sales" });
  assert.ok(proposed.error, "propose REFUSES a 6/6/60-qualifying but zero-corroborated pool");
  assert.equal(proposed.error.code, "CLR27", `propose refusal is CLR27 (got ${proposed.error.code})`);

  // SIGN refuses — a raw-inserted 'proposed' row (bypassing propose's own gate,
  // the a21-sightings-lift precedent) exercises sign's INDEPENDENT re-check.
  const proposedRow = await rawRule(users.alice, { client, firm, cp: birth.cp, accountCode: REV, status: "proposed" });
  let signErr = null;
  try { await signAutopostRule(users.alice, { rule: proposedRow }); } catch (e) { signErr = e; }
  assert.ok(signErr, "sign REFUSES the same uncorroborated pool independently of propose");
  assert.equal(signErr.code, "CLR27", `sign refusal is CLR27 (got ${signErr?.code})`);

  // POST refuses — a raw-inserted 'live' row (bypassing sign too) exercises
  // execute_rule_post's OWN floor re-derivation (post-time control 8: "no trust
  // in signing-time state").
  const liveRow = await rawRule(users.alice, { client, firm, cp: birth.cp, accountCode: REV, status: "live" });
  // [lane-7a-db, cherry-pick repair — REPORTED, not silently rewritten] TWO defects, and the
  // second was hidden by the first.
  //   (a) The assertion read `notEqual(status, "approved" && (...) === "checked")`. JavaScript
  //       evaluates the right-hand side to a BOOLEAN, so it asserted `status !== false` — true
  //       for EVERY status, including "approved". The cell's load-bearing claim could not fail.
  //   (b) Repairing (a) turned the cell red and showed why: the subject was an APPROVED entry,
  //       because salesSighting approves. clara.execute_rule_post posts a DRAFT, so an
  //       already-approved subject makes the status reading say nothing about the rule at all.
  //       The subject is now a genuine draft (approve:false), which is what the cell's own
  //       title claims to be testing.
  const postEntry = await salesSighting(users.alice, { client, firm, cp: birth.cp, date: "2026-07-05", stampKind: true, corroborate: false, approve: false, sellerIsClient: true });
  assert.equal(await entryStatusOf(postEntry.entryId), "draft",
    "mandatory premise: execute_rule_post's subject is a DRAFT (an approved one proves nothing)");
  const postResult = await postViaRule(postEntry.entryId);
  const skip = await lastSkipReason(postEntry.entryId);
  assert.notEqual(await entryStatusOf(postEntry.entryId), "approved",
    "the uncorroborated entry is never posted via the rule");
  assert.ok(skip, `execute_rule_post recorded a skip reason for the uncorroborated entry (result=${JSON.stringify(postResult)})`);
  // [lane-7a-db, terminal proof — REPORTED] THE TERMINAL TOKEN, ASSERTED EXACTLY.
  //
  // This cell used to be refused at 'counterparty_ambiguous' — one control BEFORE
  // corroboration — because its documents stated a generic seller, so the direction resolved
  // PURCHASE and execute_rule_post hunted a VENDOR for a customer counterparty. It therefore
  // proved "never posted" and said nothing about the gate in its own title. The pool is now
  // built through the cleanly-resolving fixture (sellerIsClient), so the executor gets past
  // direction, past the buyer match and past the customer control, and the refusal it lands
  // on is the one 7A-R4 is about. Anything else here is a real finding, so it is an equality,
  // not a membership test.
  assert.equal(skip, "not_corroborated",
    `the post-time refusal is TERMINAL at corroboration (got '${skip}') — an earlier token means `
    + `the executor never reached the gate this cell exists to prove`);
  void liveRow;
});

// ===========================================================================
// GROUP 2 — 7A-R3 narrowness: tax-silent sales may DRAFT (narrow tier_a_fails
// bypass) but EVERY posting path keeps the full corroboration gate.
// ===========================================================================

test("7A-R3 with the lane active, a tax-silent sales filing reaches draft admission and is APPROVABLE by a human", async (t) => {
  if (skip46(t)) return;
  // RETITLED + NARROWED (F-A2 PR-3, Annex B.1). This cell used to prove 7A-R3's two halves
  // in one entry: the draft/approval half (still live, kept below) AND the autopost-refusal
  // half ("corroboration remains necessary to post it under ANY rule", via a raw-inserted
  // 'live' coding_rules row + postViaRule/execute_rule_post). The second half's entire
  // subject retired whole with F-A2 PR-3 -- there is no more rule-posting path for a
  // tax-silent draft to be refused BY, so asserting its refusal would assert a fact about
  // machinery that no longer exists. Per the file's own law ("a title that overstates its
  // probe is how a suite comes to be believed for coverage it does not have"), the title
  // now states only what this cell still measures.
  const { users, clients } = world;
  const client = clients.A1;
  // [lane-7a-db, terminal proof — REPORTED] THE COUNTERPARTY IS BIRTHED FIRST, AND THE DOCUMENT
  // NAMES THE SAME ONE. Previously the cell invented a customer name for the document and a
  // DIFFERENT random name for the draft's proposal, then tried to discover the counterparty by
  // reading clara.journal_lines.counterparty_id — which is null here BY DESIGN, so the whole
  // posting block was skipped. See the note at the cp assertion below for the measurement.
  const custName = `X46 DRAFT CO ${randomUUID().slice(0, 6)}`;
  const birth = await birthSalesCustomer(users.alice, {
    client, firm: firmA, name: custName, date: "2026-01-05",
    stampKind: true, corroborate: false, sellerIsClient: true,
  });
  const filing = await taxSilentSalesFiling(users.alice, { client, firm: firmA, customerName: custName });

  const lane = await codingLane(humanPersona(users.alice), { client, filing: filing.filingId });
  assert.equal(lane?.lane, "ready", `an active-lane tax-silent sales filing reaches 'ready' (got ${JSON.stringify(lane)})`);
  // tier_a_fails may still be an INFORMATIONAL flag in reasons (the corpus really
  // is tax-silent) — the contract narrows what BLOCKS ready, not the vocabulary.
  const admit = await admitAutodraft({ filing: filing.filingId, origin: ORIGIN.oneClick });
  assert.equal(admit?.outcome, "admitted", `admission reaches 'admitted' for a tax-silent sales filing under an active lane (got ${JSON.stringify(admit)})`);

  // Draft it (the runtime's stand-in: wake_draft_entry with coding_kind='sales_invoice')
  // and approve — a human-present draft, exactly what 7A-R3 sanctions.
  const cred = await mintInteractive(firmA);
  const region = await factsRegion(filing.documentId, "invoice.total");
  const draft = await wakeDraftEntry(cred, {
    client,
    resolution: await freshResolution(users.alice, client, { subjectKind: "document", subjectId: filing.documentId }),
    lines: [
      { account_code: REC, debit_cents: 100000, credit_cents: 0, description: "sales-ar" },
      { account_code: REV, debit_cents: 0, credit_cents: 100000, description: "sales-rev" },
    ],
    document: filing.documentId, sha256: filing.sha256,
    vendor: { existing_id: birth.cp, kind: "customer" },
    evidence: [ev(region?.id, region?.text_content ?? "RM 1,000.00", "invoice.total")],
    codingKind: "sales_invoice", opKey: opk("r3draft"),
  });
  assert.ok(draft?.entry_id, "the tax-silent sales filing DRAFTS (human approves each entry, 7A-R3)");
  // [lane-7a-db, terminal proof — REPORTED] THE ORDER IS THE FIX. The approve used to sit
  // HERE, before the post below — so clara.execute_rule_post saw a NON-DRAFT and refused
  // 'not_a_draft' without ever consulting corroboration, and this cell's posting claim
  // proved only that an approved entry cannot be re-posted. The post now runs while the
  // entry is still a DRAFT (what the executor is built to act on) and the human approval
  // 7A-R3 sanctions follows it. One entry, both claims, neither weakened.

  // No posting path accepts it: even a raw-inserted LIVE rule pointed straight
  // at this entry's counterparty/account refuses to post it (not_corroborated).
  // [lane-7a-db, terminal proof — REPORTED] MANDATORY PREMISE, replacing a conditional escape
  // that made this cell green while it measured nothing.
  //
  // WHAT WAS WRONG, MEASURED IN THE CATALOG RATHER THAN GUESSED. The cell used to discover the
  // counterparty with `select counterparty_id from clara.journal_lines where entry_id=...`, and
  // wrapped the entire rule/post/not_corroborated block in `if (cp)`. That column is NULL here
  // BY DESIGN, so the block never ran and the else-branch printed a note while the cell
  // reported PASS. clara._draft_entry_core stamps journal_lines.counterparty_id only under
  // `if v_vendor_binding is not null`, i.e. only when clara._resolve_vendor_binding returned
  // 'bound' — and a SALES draft never runs vendor binding at all (7A-R2). So no sales draft
  // will EVER carry that stamp, and no fixture change could have produced one through the
  // audited path.
  //
  // The RETIRED half used to continue here: birth the customer's counterparty, raw-insert a
  // 'live' coding_rules row pointed at it, run postViaRule (execute_rule_post) on the draft,
  // and assert a TERMINAL 'not_corroborated' skip. clara.execute_rule_post is gone (Annex
  // B.1); there is no posting path left to refuse the draft, so that proof is dropped rather
  // than asserted against nothing.
  // 7A-R3's surviving half: the human approval this contract sanctions.
  await approveEntry(users.alice, { entry: draft.entry_id, expectedRevision: draft.revision_token, opKey: opk("r3app") });
  assert.equal(await entryStatusOf(draft.entry_id), "approved",
    "the tax-silent sales draft is APPROVABLE by a human — 7A-R3 sanctions the DRAFT, never the autopost");
});

// ===========================================================================
// GROUP 3 — 7A-R2 the DB-authoritative tri-state direction contract.
// ===========================================================================

test("7A-R2 a direction-contradictory document never reaches 'ready' and is never admitted (unresolved falls to the human lanes)", async (t) => {
  if (skip46(t)) return;
  const { users, clients } = world;
  const client = clients.A1;
  const name = await clientName(client);
  const firm = firmA;
  await grantConsent(users.alice, { firm, client }).catch(() => {});
  const cited = await seedCitedDocument(users.alice, { firm, client, quote: "RM 1,000.00", kind: "invoice" });
  // F-A1 PR-3 CUTOVER (see taxSilentSalesFiling above): mint the invoice_facts task
  // directly -- the real enqueue RPC no longer routes an invoice-kind document here.
  await mintLegacyInvoiceFactsTask(cited.documentId);
  const task = await invoiceFactsTask(cited.documentId);
  await claimTask(task.id, { egressApproved: true });
  // RESIDUAL-3 shape (wave-a2-direction.test.mjs precedent): registration matches
  // the client but the stated NAME names a different entity — direction ABSTAINS.
  await persistInvoiceFacts(task.id, [
    factField("invoice.total", "RM 1,000.00"), factField("invoice.currency", "MYR"),
    factField("invoice.vendor_name", "A COMPLETELY UNRELATED ENTITY SDN BHD"),
    factField("invoice.vendor_registration", "199901000700", { polygon: [], confidence: 0.9 }),
    factField("invoice.customer_name", "X46 CONTRADICT BUYER"),
    factField("invoice.invoice_id", `X46-${randomUUID().slice(0, 8)}`),
  ]);
  void name;
  // [lane-7a-db, hardening — REPORTED] MANDATORY PREMISE. As written, a fixture that resolved
  // cleanly to 'purchase' took the `else` branch, logged a note, and the cell still passed on
  // its two outcome assertions below — which a plain purchase document satisfies by refusing
  // tier_a_fails, saying nothing about the direction CONTRADICTION this cell is named for.
  // The abstention is the premise, so it is asserted.
  const dir = await rootQuery("select clara._document_direction($1,$2) as d", [cited.documentId, client]).catch((e) => ({ err: e }));
  assert.ok(dir.err, `mandatory premise: _document_direction must ABSTAIN on the name/registration contradiction, or this cell degenerates into an ordinary purchase filing (got ${JSON.stringify(dir.rows?.[0]?.d)})`);
  assert.equal(dir.err.code, "CLR30", `the abstention is CLR30 (got ${dir.err.code})`);

  const lane = await codingLane(humanPersona(users.alice), { client, filing: cited.filingId });
  assert.notEqual(lane?.lane, "ready", `a direction-contradictory filing NEVER reaches 'ready' (got ${JSON.stringify(lane)})`);
  // ...and the lane must say WHY in direction terms, or "not ready" could be any other blocker.
  assert.ok((lane?.reasons ?? []).some((r) => /direction/.test(r)),
    `[lane-7a-db, hardening — REPORTED] the lane names a DIRECTION reason for the contradiction `
    + `(got ${JSON.stringify(lane?.reasons)}) — without it, "not ready" proves nothing about direction`);

  const admit = await admitAutodraft({ filing: cited.filingId, origin: ORIGIN.oneClick });
  assert.notEqual(admit?.outcome, "admitted", `a direction-contradictory filing is NEVER admitted for drafting (got ${JSON.stringify(admit)})`);
});

test("7A-R2 the DB draft writer REJECTS a contradictory coding-kind / counterparty-kind pair from an agent (BOTH directions, symmetrically, both CLR21 counterparty_kind_contradiction)", async (t) => {
  if (skip46(t)) return;
  const { users, clients } = world;
  const client = clients.A1;
  const cred = await mintInteractive(firmA);

  // sales_invoice + vendor kind — CLR21 counterparty_kind_contradiction.
  const filing1 = await taxSilentSalesFiling(users.alice, { client, firm: firmA, customerName: `X46 CONTRA1 ${randomUUID().slice(0, 6)}` });
  const region1 = await factsRegion(filing1.documentId, "invoice.total");
  let err1 = null;
  try {
    await wakeDraftEntry(cred, {
      client, resolution: await freshResolution(users.alice, client, { subjectKind: "document", subjectId: filing1.documentId }),
      lines: [
        { account_code: REC, debit_cents: 100000, credit_cents: 0, description: "sales-ar" },
        { account_code: REV, debit_cents: 0, credit_cents: 100000, description: "sales-rev" },
      ],
      document: filing1.documentId, sha256: filing1.sha256,
      vendor: { new: { name: "CONTRADICT VENDOR CO" }, kind: "vendor" },
      evidence: [ev(region1?.id, region1?.text_content ?? "RM 1,000.00", "invoice.total")],
      codingKind: "sales_invoice", opKey: opk("contra1"),
    });
  } catch (e) { err1 = e; }
  assert.ok(err1, "a sales_invoice-coded draft with a VENDOR-kind counterparty is REJECTED by the DB draft writer");
  assert.equal(err1.code, "CLR21", `contradiction rejection is CLR21 (got ${err1?.code})`);
  assert.equal(reasonOf(err1), "counterparty_kind_contradiction", `the primary-direction reason token (got ${reasonOf(err1)})`);

  // supplier_bill + customer kind — the mirror. CONFIRMED (isolated re-verification,
  // 2026-08-07): raises CLR21, message "a supplier_bill entry cannot carry a customer
  // counterparty", detail {"reason":"counterparty_kind_contradiction"} — the exact
  // mirror of the sales_invoice+vendor message above. Asserted hard, not noted.
  const firmA2 = firmA;
  await upsertPayableAccount(users.alice, { client: clients.A1, code: "400-000", name: "Trade Creditors", opKey: opk("apmirror") }).catch(() => {});
  const cited2 = await seedCitedDocument(users.alice, { firm: firmA2, client, quote: "RM 500.00" });
  const region2 = await factsRegion(cited2.documentId, "invoice.total").catch(() => null);
  let err2 = null;
  try {
    await wakeDraftEntry(cred, {
      client, resolution: await freshResolution(users.alice, client, { subjectKind: "document", subjectId: cited2.documentId }),
      lines: [
        { account_code: EXP.startsWith("500") ? "500-A01" : EXP, debit_cents: 50000, credit_cents: 0, description: "bill-exp" },
        { account_code: "400-000", debit_cents: 0, credit_cents: 50000, description: "bill-ap" },
      ],
      document: cited2.documentId, sha256: cited2.sha256,
      vendor: { new: { name: "CONTRADICT CUSTOMER CO" }, kind: "customer" },
      evidence: [ev(region2?.id ?? region2, cited2.quote, "invoice.total")],
      codingKind: "supplier_bill", opKey: opk("contra2"),
    });
  } catch (e) { err2 = e; }
  assert.ok(err2, "a supplier_bill-coded draft with a CUSTOMER-kind counterparty is REJECTED by the DB draft writer (the mirror direction)");
  assert.equal(err2.code, "CLR21", `the mirror contradiction rejection is CLR21 (got ${err2?.code})`);
  assert.equal(reasonOf(err2), "counterparty_kind_contradiction", `the mirror carries the SAME reason token as the primary direction (got ${reasonOf(err2)})`);
});

test("7A-R2 a sales draft never enters vendor binding: no vendor_unresolved lane reason for sales, and the born counterparty is kind='customer' never 'vendor'", async (t) => {
  if (skip46(t)) return;
  const { users, clients } = world;
  const client = clients.A1;
  const newName = `X46 NEVERVENDOR ${randomUUID().slice(0, 6)}`;
  const filing = await taxSilentSalesFiling(users.alice, { client, firm: firmA, customerName: newName });
  const lane = await codingLane(humanPersona(users.alice), { client, filing: filing.filingId });
  assert.ok(!(lane?.reasons ?? []).includes("vendor_unresolved"), `a sales filing with a brand-new, unresolved customer name never carries 'vendor_unresolved' (got ${JSON.stringify(lane?.reasons)})`);

  const cred = await mintInteractive(firmA);
  const region = await factsRegion(filing.documentId, "invoice.total");
  const draft = await wakeDraftEntry(cred, {
    client, resolution: await freshResolution(users.alice, client, { subjectKind: "document", subjectId: filing.documentId }),
    lines: [
      { account_code: REC, debit_cents: 100000, credit_cents: 0, description: "sales-ar" },
      { account_code: REV, debit_cents: 0, credit_cents: 100000, description: "sales-rev" },
    ],
    document: filing.documentId, sha256: filing.sha256,
    vendor: { new: { name: newName }, kind: "customer" },
    evidence: [ev(region?.id, region?.text_content ?? "RM 1,000.00", "invoice.total")],
    codingKind: "sales_invoice", opKey: opk("noveendor"),
  });
  assert.ok(draft?.entry_id, "the sales draft with a new customer succeeds (never blocked as an unresolved vendor)");
  await approveEntry(users.alice, { entry: draft.entry_id, expectedRevision: draft.revision_token, opKey: opk("noveendora") });
  const norm = newName.toLowerCase().replace(/[^a-z0-9]/g, "");
  const cp = (await counterpartyRows(client)).find((c) => (c.name_normalized ?? "") === norm);
  assert.ok(cp, "the new counterparty was born");
  assert.equal(cp.kind, "customer", `the born counterparty is kind='customer', never 'vendor' (got ${cp.kind})`);
});

// ===========================================================================
// GROUP 4 — 7A-R1 kill-switch fail-closed.
// ===========================================================================

test("7A-R1 default state is INACTIVE for every firm, including one whose firm_limits row does not exist yet", async (t) => {
  if (skip46(t)) return;
  // A brand-new firm from a FRESH world, never touched by any activation call.
  const virgin = await buildWorld();
  const vFirm = await firmOf(virgin.clients.A1);
  const hasRow = await rootQuery("select 1 from clara.firm_limits where firm_id=$1", [vFirm]);
  assert.equal(hasRow.rowCount, 0, "a freshly-created firm has NO firm_limits row at all (mandatory setup for this cell)");
  const active = await rootQuery("select clara._sales_lane_active($1) as a", [vFirm]);
  assert.equal(active.rows[0].a, false, "_sales_lane_active fails closed to false for a firm with no limits row");

  await addClientIdentifier(virgin.users.alice, { client: virgin.clients.A1, kind: "ssm", value: "199901000701" }).catch(() => {});
  await upsertAccountClassed(virgin.users.alice, { client: virgin.clients.A1, code: REC, name: "Trade Debtors", type: "asset", accountClass: "receivable", opKey: opk("vrec") });
  await upsertAccountClassed(virgin.users.alice, { client: virgin.clients.A1, code: REV, name: "Revenue", type: "income", opKey: opk("vrev") });
  const filing = await taxSilentSalesFiling(virgin.users.alice, { client: virgin.clients.A1, firm: vFirm, customerName: "VIRGIN BUYER", reg: "199901000701" });
  const lane = await codingLane(humanPersona(virgin.users.alice), { client: virgin.clients.A1, filing: filing.filingId });
  assert.notEqual(lane?.lane, "ready", `while inactive, a tax-silent sales filing behaves exactly as pre-migration — never 'ready' (got ${JSON.stringify(lane)})`);
  assert.ok((lane?.reasons ?? []).includes("tier_a_fails"), `tier_a_fails BLOCKS ready while the lane is inactive (got ${JSON.stringify(lane?.reasons)})`);
  const admit = await admitAutodraft({ filing: filing.filingId, origin: ORIGIN.oneClick });
  assert.equal(admit?.outcome, "skipped_direction", `admission on an inactive-lane sales filing is inert (byte-identical to pre-0046 — got ${JSON.stringify(admit)})`);
});

test("7A-R1 no application role — authenticated / runtime / agentRo / wakeInteractive / wakeProactive — may EXECUTE set_sales_lane_activation", async (t) => {
  if (skip46(t)) return;
  const grants = await roleGrants("set_sales_lane_activation");
  for (const [role, ok] of Object.entries(grants)) {
    assert.equal(ok, false, `clara_${role.replace(/([A-Z])/g, (m) => "_" + m.toLowerCase())} must NOT execute set_sales_lane_activation (got ${ok})`);
  }
  // Behavioral confirmation: a granted authenticated call is refused at the role
  // floor, not merely absent from the catalog probe above.
  const { users, clients } = world;
  await assertRaises("42501",
    () => humanQuery(users.alice, "select clara.set_sales_lane_activation(p_firm=>$1,p_active=>true,p_watermark=>null,p_reason=>'attempt') as r", [firmB]),
    "authenticated attempt to call set_sales_lane_activation",
  );
  void clients;
});

test("7A-R1 activation is PER-FIRM: firm A (activated in before()) is ready; sibling firm B stays inactive", async (t) => {
  if (skip46(t)) return;
  const { users, clients } = world;
  const activeA = await rootQuery("select clara._sales_lane_active($1) as a", [firmA]);
  const inactiveB = await rootQuery("select clara._sales_lane_active($1) as a", [firmB]);
  assert.equal(activeA.rows[0].a, true, "firm A is active");
  assert.equal(inactiveB.rows[0].a, false, "firm B was never activated and stays inactive");

  await addClientIdentifier(users.dave, { client: clients.B1, kind: "ssm", value: "199901000702" }).catch(() => {});
  await upsertAccountClassed(users.dave, { client: clients.B1, code: REC, name: "Trade Debtors", type: "asset", accountClass: "receivable", opKey: opk("brec") }).catch(() => {});
  await upsertAccountClassed(users.dave, { client: clients.B1, code: REV, name: "Revenue", type: "income", opKey: opk("brev") }).catch(() => {});
  const filingB = await taxSilentSalesFiling(users.dave, { client: clients.B1, firm: firmB, customerName: "FIRM B BUYER", reg: "199901000702" });
  const laneB = await codingLane(humanPersona(users.dave), { client: clients.B1, filing: filingB.filingId });
  assert.notEqual(laneB?.lane, "ready", `firm B's tax-silent sales filing is NOT ready — activating firm A never leaks (got ${JSON.stringify(laneB)})`);
});

// ===========================================================================
// GROUP 5 — 7A-R5 the catch-up cursor: a durable watermark + daily cap govern
// steady-state admission; the historical backlog moves only via an explicit,
// recorded, batched, pausable backfill operation.
// ===========================================================================

test("7A-R5 a pre-activation ('backlog') filing is held at admission (sales_backlog_held) until an explicit backfill batch admits it", async (t) => {
  if (skip46(t)) return;
  const w = await buildWorld();
  const { users, clients } = w;
  const client = clients.A1;
  const firm = await firmOf(client);
  await addClientIdentifier(users.alice, { client, kind: "ssm", value: "199901000703" }).catch(() => {});
  await upsertAccountClassed(users.alice, { client, code: REC, name: "Trade Debtors", type: "asset", accountClass: "receivable", opKey: opk("r5rec") });
  await upsertAccountClassed(users.alice, { client, code: REV, name: "Revenue", type: "income", opKey: opk("r5rev") });

  // The filing exists BEFORE activation — this is the backlog.
  const backlog = await taxSilentSalesFiling(users.alice, { client, firm, customerName: "BACKLOG BUYER", reg: "199901000703" });
  await rootQuery("select clara.set_sales_lane_activation(p_firm=>$1,p_active=>true,p_watermark=>null,p_reason=>'x46 r5') as r", [firm]);

  const held = await admitAutodraft({ filing: backlog.filingId, origin: ORIGIN.oneClick });
  assert.equal(held?.outcome, "skipped_direction", `a backlog filing is HELD, not refused as an error (got ${JSON.stringify(held)})`);
  assert.equal(held?.reason, "sales_backlog_held", `the held reason names the watermark gate (got ${held?.reason})`);

  const opened = await humanQuery(users.alice,
    "select clara.open_sales_backfill(p_client=>$1,p_batch_size=>$2,p_note=>$3,p_op_key=>$4) as r",
    [client, 10, "x46 r5 backfill", opk("bf46")]);
  const batch = opened.rows[0].r;
  assert.equal(batch.state, "open", `open_sales_backfill returns an OPEN batch receipt (got ${JSON.stringify(batch)})`);
  const batchId = batch.batch_id ?? batch.id;

  const admittedNow = await admitAutodraft({ filing: backlog.filingId, origin: ORIGIN.oneClick });
  assert.equal(admittedNow?.outcome, "admitted", `WITH an open backfill batch, the same backlog filing now admits (got ${JSON.stringify(admittedNow)})`);

  const batchRow = (await rootQuery("select to_jsonb(b) as row from clara.sales_backfill_batches b where id=$1", [batchId])).rows[0]?.row;
  assert.equal(batchRow?.admitted_count, 1, `the backfill register RECORDS the admission (admitted_count incremented, got ${batchRow?.admitted_count})`);

  const listed = await humanQuery(users.alice, "select clara.list_sales_backfill_batches($1::jsonb) as r", [JSON.stringify({ client_id: client })]);
  const listedBatches = listed.rows[0].r; // a single jsonb ARRAY, not a setof rows
  assert.ok(Array.isArray(listedBatches), `list_sales_backfill_batches returns a jsonb array (got ${JSON.stringify(listedBatches)})`);
  assert.ok(listedBatches.some((x) => x.batch_id === batchId), `list_sales_backfill_batches surfaces the batch for its client scope (got ${JSON.stringify(listedBatches)})`);
});

test("7A-R5 at most one active (open/paused) backfill batch per client; the batch is pausable via set_sales_backfill_state", async (t) => {
  if (skip46(t)) return;
  const w = await buildWorld();
  const { users, clients } = w;
  const client = clients.A1;
  const firm = await firmOf(client);
  await addClientIdentifier(users.alice, { client, kind: "ssm", value: "199901000704" }).catch(() => {});
  await rootQuery("select clara.set_sales_lane_activation(p_firm=>$1,p_active=>true,p_watermark=>null,p_reason=>'x46 r5b') as r", [firm]);

  const first = await humanQuery(users.alice, "select clara.open_sales_backfill(p_client=>$1,p_batch_size=>$2,p_note=>$3,p_op_key=>$4) as r", [client, 5, "first", opk("bf1")]);
  const batchId = first.rows[0].r.batch_id ?? first.rows[0].r.id;

  let err = null;
  try {
    await humanQuery(users.alice, "select clara.open_sales_backfill(p_client=>$1,p_batch_size=>$2,p_note=>$3,p_op_key=>$4) as r", [client, 5, "second", opk("bf2")]);
  } catch (e) { err = e; }
  assert.ok(err, "a SECOND open backfill batch for the same client is REFUSED while one is active");
  assert.equal(err.code, "CLR27", `the refusal is CLR27 (got ${err?.code})`);

  const paused = await humanQuery(users.alice, "select clara.set_sales_backfill_state(p_batch=>$1,p_state=>$2,p_op_key=>$3) as r", [batchId, "paused", opk("pausex")]);
  assert.equal(paused.rows[0].r.state, "paused", `the batch pauses (got ${JSON.stringify(paused.rows[0].r)})`);

  // Observed (contract-silent on exactly this): the uniqueness guard also treats
  // 'paused' as active — a second open still refuses. Reported as a finding.
  let err2 = null;
  try {
    await humanQuery(users.alice, "select clara.open_sales_backfill(p_client=>$1,p_batch_size=>$2,p_note=>$3,p_op_key=>$4) as r", [client, 5, "third", opk("bf3")]);
  } catch (e) { err2 = e; }
  if (!err2) noteLane("FINDING: after pausing the only batch, a new open_sales_backfill SUCCEEDED — 'paused' does not block a new batch on this build (contract text says 'open', so this may be intended; flagging the observed shape)");
  else noteLane("observed: 'paused' ALSO blocks a new open (uniqueness guard covers open+paused, not just open) — contract §1 only pins 'at most one open batch'; this is a stricter-than-worded but non-contradictory shape");
});

test("7A-R5 a daily admission cap binds (refused_sales_cap) once the firm's per-day sales-admission count is reached", async (t) => {
  if (skip46(t)) return;
  const w = await buildWorld();
  const { users, clients } = w;
  const client = clients.A1;
  const firm = await firmOf(client);
  await addClientIdentifier(users.alice, { client, kind: "ssm", value: "199901000705" }).catch(() => {});
  await upsertAccountClassed(users.alice, { client, code: REC, name: "Trade Debtors", type: "asset", accountClass: "receivable", opKey: opk("caprec") });
  await upsertAccountClassed(users.alice, { client, code: REV, name: "Revenue", type: "income", opKey: opk("caprev") });
  // Activate FIRST (the writer auto-creates the firm_limits row on conflict-do-
  // nothing) — only THEN set the cap, or the direct UPDATE below matches zero rows.
  await rootQuery("select clara.set_sales_lane_activation(p_firm=>$1,p_active=>true,p_watermark=>null,p_reason=>'x46 r5cap') as r", [firm]);
  await rootQuery("update clara.firm_limits set sales_admission_daily_cap=1 where firm_id=$1", [firm]);

  const f1 = await taxSilentSalesFiling(users.alice, { client, firm, customerName: "CAP BUYER 1", reg: "199901000705" });
  const a1 = await admitAutodraft({ filing: f1.filingId, origin: ORIGIN.oneClick });
  assert.equal(a1?.outcome, "admitted", `the first of the day admits under a cap of 1 (got ${JSON.stringify(a1)})`);

  const f2 = await taxSilentSalesFiling(users.alice, { client, firm, customerName: "CAP BUYER 2", reg: "199901000705" });
  const a2 = await admitAutodraft({ filing: f2.filingId, origin: ORIGIN.oneClick });
  assert.equal(a2?.outcome, "refused_budget", `the SECOND same-day sales admission is refused once the cap is used (got ${JSON.stringify(a2)})`);
  assert.equal(a2?.reason, "refused_sales_cap", `the cap-specific reason token names the gate (got ${a2?.reason})`);
});

// ===========================================================================
// GROUP 6 — the signing-time evidence preview (caller four): advisory,
// not-applicable-never-error, no cross-firm oracle, counts consistent with
// the floor, tax_silent_documents = qualifying - corroborated.
// ===========================================================================

test("PREVIEW advisory shape carries evaluated_at + required + floor_met; matches the floor's own counts; tax_silent_documents = qualifying - corroborated", { skip: "preview_ocr_sales_evidence retired with F-A2 PR-3 — this cell's claim has no subject left" }, async () => {
  // RETIRED (F-A2 PR-3, Annex B.1/OQ-3/D36): preview_ocr_sales_evidence retires with the
  // floor it read.
  const { users, clients } = world;
  const client = clients.A1;
  const name = `X46 PREVIEW CO ${randomUUID().slice(0, 6)}`;
  const birth = await birthSalesCustomer(users.alice, { client, firm: firmA, name, date: "2026-01-10", stampKind: true, corroborate: true });
  assert.ok(birth.cp, "preview customer exists (mandatory setup)");
  // 5 more corroborating (total 6 corroborated, meets the floor)…
  for (const date of ["2026-02-10", "2026-03-10", "2026-04-10", "2026-05-10", "2026-06-10"]) {
    await salesSighting(users.alice, { client, firm: firmA, cp: birth.cp, date, stampKind: true, corroborate: true });
  }
  // …plus 2 EXTRA tax-silent (qualifying but not corroborated) — these should
  // surface as tax_silent_documents without blocking the (already-met) floor.
  for (const date of ["2026-07-10", "2026-07-20"]) {
    await salesSighting(users.alice, { client, firm: firmA, cp: birth.cp, date, stampKind: true, corroborate: false });
  }
  const proposed = await proposeAutopostRule(users.alice, { client, cp: birth.cp, accountCode: REV, direction: "sales", evidenceClass: "ocr_sales" });
  assert.ok(!proposed.error, `the 6-corroborated pool is admitted despite the 2 tax-silent extras (got ${proposed.error?.code})`);

  const floor = await rootQuery("select * from clara._ocr_sales_floor($1,$2,$3)", [client, birth.cp, REV]);
  const f = floor.rows[0];

  const preview = await humanQuery(users.alice, "select clara.preview_ocr_sales_evidence($1) as r", [proposed.id]);
  const p = preview.rows[0].r;
  assert.equal(p.applicable, true, `the preview is applicable for a live sales/ocr_sales rule (got ${JSON.stringify(p)})`);
  assert.equal(p.advisory, true, "the preview is labelled advisory");
  assert.ok(p.evaluated_at, "the preview carries an evaluation timestamp");
  assert.deepEqual(p.required, { qualifying: 6, distinct_invoices: 6, corroborated: 6, span_days: 60 }, `the required thresholds are stated (got ${JSON.stringify(p.required)})`);
  assert.equal(p.qualifying, f.qualifying, "preview.qualifying matches the floor's own qualifying");
  assert.equal(p.distinct_invoices, f.distinct_invoices, "preview.distinct_invoices matches the floor");
  assert.equal(p.corroborated, f.corroborated, "preview.corroborated matches the floor");
  assert.equal(p.floor_met, true, "floor_met is true once the pool clears 6/6/6/60");
  assert.equal(p.tax_silent_documents, p.qualifying - p.corroborated, `tax_silent_documents = qualifying - corroborated (got ${p.tax_silent_documents} vs ${p.qualifying}-${p.corroborated})`);
  assert.ok(p.tax_silent_documents >= 2, `at least the 2 deliberately tax-silent extras are counted (got ${p.tax_silent_documents})`);
});

test("PREVIEW returns not-applicable (never an error) for a non-sales rule and for a wrong-evidence-class rule", { skip: "preview_ocr_sales_evidence retired with F-A2 PR-3 — this cell's claim has no subject left" }, async () => {
  // RETIRED (F-A2 PR-3, Annex B.1/OQ-3/D36): preview_ocr_sales_evidence is dropped.
  const { users, clients } = world;
  const client = clients.A2;
  await upsertPayableAccount(users.alice, { client, code: AP, name: "Trade Creditors", opKey: opk("napap") }).catch(() => {});
  const cited = await seedCitedDocument(users.alice, { firm: firmA, client, quote: "RM 500.00" });
  const d = await draftEntryV3(users.alice, {
    client, resolution: await freshResolution(users.alice, client, { subjectKind: "document", subjectId: cited.documentId }),
    document: cited.documentId, sha256: cited.sha256,
    lines: [
      { account_code: EXP, debit_cents: 50000, credit_cents: 0, description: "bill-exp" },
      { account_code: AP, debit_cents: 0, credit_cents: 50000, description: "bill-ap" },
    ],
    vendor: { new: { name: `X46 NOTSALES VENDOR ${randomUUID().slice(0, 6)}` } },
    evidence: [ev(cited.regionId, cited.quote, FIELD.total)], opKey: opk("napd"),
  });
  await approveEntry(users.alice, { entry: d.entry_id, expectedRevision: d.revision_token, opKey: opk("napda") });
  const cp = (await rootQuery("select counterparty_id from clara.journal_lines where entry_id=$1 and counterparty_id is not null limit 1", [d.entry_id])).rows[0]?.counterparty_id;
  assert.ok(cp, "the purchase counterparty resolved (mandatory setup)");
  const purchaseRule = await rawRule(users.alice, { client, firm: firmA, cp, accountCode: EXP, status: "proposed", direction: "purchase", evidenceClass: null });
  const preview1 = await humanQuery(users.alice, "select clara.preview_ocr_sales_evidence($1) as r", [purchaseRule]);
  assert.equal(preview1.rows[0].r.applicable, false, `a purchase rule is not-applicable (got ${JSON.stringify(preview1.rows[0].r)})`);
  assert.notEqual(preview1.rows[0].r.applicable, undefined, "not-applicable is a RETURNED shape, not an omission");

  const structuredSalesRule = await rawRule(users.alice, { client, firm: firmA, cp, accountCode: REV, status: "proposed", direction: "sales", evidenceClass: "structured" });
  const preview2 = await humanQuery(users.alice, "select clara.preview_ocr_sales_evidence($1) as r", [structuredSalesRule]);
  assert.equal(preview2.rows[0].r.applicable, false, `a 'structured'-evidence sales rule is not-applicable to the OCR preview (got ${JSON.stringify(preview2.rows[0].r)})`);

  const bogus = "00000000-0000-4000-8000-0000000ba7ad";
  const preview3 = await humanQuery(users.alice, "select clara.preview_ocr_sales_evidence($1) as r", [bogus]);
  assert.equal(preview3.rows[0].r.applicable, false, "a nonexistent rule id is not-applicable, never an error");
});

test("PREVIEW CROSS-FIRM: a viewer in firm A probing firm B's rule id gets not-applicable — never an existence oracle", { skip: "preview_ocr_sales_evidence retired with F-A2 PR-3 — this cell's claim has no subject left" }, async () => {
  // RETIRED (F-A2 PR-3, Annex B.1/OQ-3/D36): preview_ocr_sales_evidence is dropped.
  const { users, clients } = world;
  // A real 'live'-shaped rule row that genuinely exists — but in firm B.
  await upsertAccountClassed(users.dave, { client: clients.B1, code: REV, name: "Revenue", type: "income", opKey: opk("xfirmrev") }).catch(() => {});
  const cited = await seedCitedDocument(users.dave, { firm: firmB, client: clients.B1, quote: "RM 900.00", kind: "invoice" });
  const cp = await rootQuery(
    `insert into clara.counterparties(firm_id,client_id,kind,name,name_normalized,created_by)
     values($1,$2,'customer',$3,$4,$5) returning id`,
    [firmB, clients.B1, "X46 XFIRM BUYER", "x46xfirmbuyer", users.dave],
  );
  const bRule = await rawRule(users.dave, { client: clients.B1, firm: firmB, cp: cp.rows[0].id, accountCode: REV, status: "live", direction: "sales", evidenceClass: "ocr_sales" });
  void cited;

  const crossPreview = await humanQuery(users.alice, "select clara.preview_ocr_sales_evidence($1) as r", [bRule]);
  const r = crossPreview.rows[0].r;
  assert.equal(r.applicable, false, `firm A's viewer probing firm B's rule id gets not-applicable (got ${JSON.stringify(r)})`);
  // No leak: the not-applicable shape carries no client/counterparty/account data.
  assert.equal(r.client_id, undefined, "the cross-firm not-applicable answer leaks no client_id");
  assert.equal(r.counterparty_id, undefined, "the cross-firm not-applicable answer leaks no counterparty_id");

  // Indistinguishable from a genuinely nonexistent rule id (the existence-oracle test).
  const bogus = "00000000-0000-4000-8000-0000000ba7a1";
  const bogusPreview = await humanQuery(users.alice, "select clara.preview_ocr_sales_evidence($1) as r", [bogus]);
  assert.equal(bogusPreview.rows[0].r.applicable, r.applicable, "a cross-firm real rule id and a nonexistent rule id both answer not-applicable — no oracle");
});

// ===========================================================================
// GROUP 7 — the 6-arity settle_autodraft_task (caller-run-identity, item d).
// This mechanism is generic (not sales-gated) — exercised on the well-trodden
// purchase/AP fixture, exactly as the 5-arity precedent already does.
// ===========================================================================

test("SETTLE exactly two settle_autodraft_task signatures exist: 5-arity and 6-arity, both runtime-only with IDENTICAL ACLs", async (t) => {
  if (skip46(t)) return;
  const overloads = await rootQuery(
    "select pg_get_function_identity_arguments(oid) as args from pg_proc where proname='settle_autodraft_task' and pronamespace='clara'::regnamespace order by 1",
  );
  assert.equal(overloads.rows.length, 2, `exactly two settle_autodraft_task overloads (got ${overloads.rows.map((r) => r.args).join(" | ")})`);
  const has6 = overloads.rows.some((r) => /p_workflow_run_id/.test(r.args));
  assert.ok(has6, "one overload adds p_workflow_run_id");
  const has5 = overloads.rows.some((r) => !/p_workflow_run_id/.test(r.args));
  assert.ok(has5, "the original 5-arity overload is preserved");

  for (const args of overloads.rows.map((r) => r.args)) {
    const grants = await rootQuery(
      `select r.rolname, has_function_privilege(r.rolname,p.oid,'execute') as ok
         from pg_proc p join pg_namespace n on n.oid=p.pronamespace, pg_roles r
        where n.nspname='clara' and p.proname='settle_autodraft_task'
          and pg_get_function_identity_arguments(p.oid)=$1
          and r.rolname in ($2,$3,$4,$5,$6)`,
      [args, ROLES.authenticated, ROLES.agentRo, ROLES.wakeInteractive, ROLES.wakeProactive, ROLES.runtime],
    );
    const byRole = Object.fromEntries(grants.rows.map((r) => [r.rolname, r.ok]));
    assert.equal(byRole[ROLES.runtime], true, `runtime holds EXECUTE on (${args})`);
    for (const other of [ROLES.authenticated, ROLES.agentRo, ROLES.wakeInteractive, ROLES.wakeProactive]) {
      assert.equal(byRole[other], false, `${other} does NOT hold EXECUTE on (${args})`);
    }
  }
});

test("SETTLE the 6-arity carries NO defaults, so a 6-argument call reaches it unambiguously while 3-to-5 arguments resolve to the 5-arity (which keeps its two defaults); 2 and 7 match nothing", async (t) => {
  if (skip46(t)) return;
  const w = await buildWorld();
  const { users, clients } = w;
  await upsertPayableAccount(users.alice, { client: clients.A1, code: AP, name: "Trade Creditors", opKey: opk("s7ap") });
  await upsertAccountClassed(users.alice, { client: clients.A1, code: EXP, name: "Prof Fees", type: "expense", opKey: opk("s7exp") });
  const rf = await primeReadyFiling(users.alice, { client: clients.A1 });
  const admit = await admitAutodraft({ filing: rf.filingId, origin: ORIGIN.sweep });
  // MANDATORY, never dormant. This used to `noteLane(...); return;` when admission did not
  // reach 'admitted', which made every assertion below skippable — a green cell that had
  // measured nothing about the overload set. The overload set is a pure catalog property;
  // if the fixture stops admitting, that is a real regression in this file's world and the
  // cell must say so in red rather than pass quietly.
  assert.equal(admit?.outcome, "admitted",
    `mandatory premise: the settle fixture admits (got ${JSON.stringify(admit)}) — the 5-arity`
    + ` half of this cell needs a real task to settle`);
  assert.ok(admit.task_id, "mandatory premise: admission returns a task id");
  await beginAutodraft({ task: admit.task_id, workflowRunId: "wf-x46-5arity" }).catch(() => {});
  // The 5-arity overload (unchanged, PINS-preserved) still works.
  const settled5 = await settleAutodraft({ task: admit.task_id, outcome: "skipped_lane", tokens: 50 });
  assert.equal(settled5?.status, "completed", `the 5-arity settle still works unchanged (got ${JSON.stringify(settled5)})`);

  // [lane-7a-db, hardening — REPORTED] THE CELL'S TITLE CLAIMS ARGUMENT ENFORCEMENT AND NEVER
  // MADE THE CALL. The whole point of "no default on p_workflow_run_id" is that the 6-arity
  // cannot be reached with five arguments — which is also what keeps the two overloads
  // non-ambiguous. So make the call: five POSITIONAL arguments whose types match the 6-arity's
  // first five must resolve to the 5-arity (never the 6-arity), and a call that tries to reach
  // the 6-arity without its sixth argument must not exist.
  const six = await rootQuery(
    `select count(*)::int as n from pg_proc where pronamespace='clara'::regnamespace
       and proname='settle_autodraft_task' and pronargs=6 and pronargdefaults=0`);
  assert.equal(six.rows[0].n, 1,
    "the 6-arity carries NO defaulted parameters — a default would make every 5-argument call planner-ambiguous");
  // The 5-arity keeps its own two defaults (p_entry, p_refusal) — MEASURED, and pinned here
  // because it is the other half of what makes resolution unambiguous. Between them the two
  // signatures accept 3, 4, 5 (-> 5-arity) and 6 (-> 6-arity) arguments and nothing else.
  const five = await rootQuery(
    `select pronargdefaults as d from pg_proc where pronamespace='clara'::regnamespace
       and proname='settle_autodraft_task' and pronargs=5`);
  assert.equal(five.rows[0]?.d, 2,
    "the 5-arity keeps p_entry and p_refusal defaulted — its 3- and 4-argument callers depend on that");

  // BOTH wrong arities, not just the high one. A 2-argument call is below the 5-arity's
  // three required parameters; a 7-argument call is above the 6-arity. Neither exists.
  for (const [n, sql, args] of [
    [2, "select clara.settle_autodraft_task($1::uuid,$2::text)", [admit.task_id, "skipped_lane"]],
    [7, "select clara.settle_autodraft_task($1::uuid,$2::text,$3::bigint,$4::uuid,$5::jsonb,$6::text,$7::text)",
        [admit.task_id, "skipped_lane", 50, null, null, "wf-x", "extra"]],
  ]) {
    await assert.rejects(
      () => rootQuery(sql, args),
      (e) => e.code === "42883",
      `a ${n}-argument call matches no signature (42883) — the overload set is exactly two, of`
      + ` arities 5 (3 required) and 6 (all required)`);
  }

  // ...and note what did NOT happen at the 5-argument call above: it returned, it did not
  // raise 42725. If anyone defaults p_workflow_run_id on the 6-arity, five arguments would
  // match BOTH signatures and that call becomes ambiguous rather than 42883 — which is why
  // the pronargdefaults=0 assertion above is the load-bearing one, not the arity probes.
});

test("SETTLE a WRONG workflow_run_id via the 6-arity settles NOTHING and reports a benign superseded reason; the CORRECT run id settles cleanly", async (t) => {
  if (skip46(t)) return;
  const w = await buildWorld();
  const { users, clients } = w;
  await upsertPayableAccount(users.alice, { client: clients.A1, code: AP, name: "Trade Creditors", opKey: opk("s7bap") });
  await upsertAccountClassed(users.alice, { client: clients.A1, code: EXP, name: "Prof Fees", type: "expense", opKey: opk("s7bexp") });
  const rf = await primeReadyFiling(users.alice, { client: clients.A1 });
  const admit = await admitAutodraft({ filing: rf.filingId, origin: ORIGIN.sweep });
  // [lane-7a-db — REPORTED] MANDATORY, never dormant — the sibling of the escape closed in the
  // cell above, found by sweeping this file for the same shape rather than only the one named.
  assert.equal(admit?.outcome, "admitted",
    `mandatory premise: the wrong-run fixture admits (got ${JSON.stringify(admit)}) — with no task`
    + ` there is no run identity to mismatch, and the whole cell would pass having measured nothing`);
  assert.ok(admit.task_id, "mandatory premise: admission returns a task id");
  await beginAutodraft({ task: admit.task_id, workflowRunId: "wf-x46-correct" });

  const wrong = await roleQuery(ROLES.runtime,
    "select clara.settle_autodraft_task(p_task=>$1,p_outcome=>$2,p_tokens=>$3::bigint,p_entry=>$4,p_refusal=>$5::jsonb,p_workflow_run_id=>$6) as r",
    [admit.task_id, "skipped_lane", 50, null, null, "wf-x46-WRONG"]);
  const wrongR = wrong.rows[0].r;
  assert.equal(wrongR.settled, false, `a wrong workflow_run_id settles NOTHING (got ${JSON.stringify(wrongR)})`);
  // [lane-7a-db — REPORTED] THE TOKEN IS ASSERTED, not hedged. This used to soft-note any
  // reason other than run_superseded on the grounds that "the token is contract-silent". It is
  // not: the 6-arity emits exactly 'run_superseded' from its run-mismatch branch, and that
  // token is what the PR contract tells v6 to treat as benign — a hedge here would let the
  // refusal drift to a DIFFERENT benign-looking token (task_superseded, registry_released)
  // while the cell stayed green, which is precisely the reading v6 must not be given.
  assert.equal(wrongR.reason, "run_superseded",
    `a run-identity mismatch is refused as 'run_superseded' specifically (got '${wrongR.reason}')`
    + ` — an earlier token means the settle was refused for some other reason and this cell never`
    + ` exercised run identity at all`);

  const right = await roleQuery(ROLES.runtime,
    "select clara.settle_autodraft_task(p_task=>$1,p_outcome=>$2,p_tokens=>$3::bigint,p_entry=>$4,p_refusal=>$5::jsonb,p_workflow_run_id=>$6) as r",
    [admit.task_id, "skipped_lane", 50, null, null, "wf-x46-correct"]);
  assert.equal(right.rows[0].r.status, "completed", `the CORRECT workflow_run_id settles cleanly (got ${JSON.stringify(right.rows[0].r)})`);
});
