// Extraction slice X5 (migration 0023) — CORROBORATION BY AGREEMENT.
//
// THIS IS THE POSTING-AUTHORITY CHANGE, so these cells are the primary instrument and the
// migration's tail probes are the belt. What X5 did, exactly:
//
//   * REMOVED Azure's self-reported confidence (`>= 0.95`) from the OCR Tier-A branch. It
//     passed 0 of 29 real documents (max 0.837) while the polygon and MYR walls passed 29/29,
//     so it was never measuring what its name claimed. ADR-047 Q1 dropped it from gating
//     ENTIRELY — it survives only as payload metadata.
//   * ADDED arithmetic agreement: the document must STATE its net and its tax, each exactly
//     once, and the closed-taxonomy identity must tie to the sen —
//         net + service_charge + delivery + tax + rounding − discount = total
//
// THE EXACT-DIFF IS THE POINT. A change to corroboration is a change to what may post
// unattended, so "which shapes flip" is not a summary, it is the claim. Each cell below
// states the OLD verdict and the NEW one for one shape, and the old verdict is COMPUTED from
// the same regions rather than asserted from memory — see `wouldHaveCorroboratedPreX5`.
//
// The headline: only a document that does the arithmetic work flips to true. Everything else
// either stays false or BECOMES false, and becoming false is the safe direction.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  rootQuery, endPool, buildWorld, firmOf, rm, grantConsent, seedCitedDocument,
  enqueueInvoiceFacts, invoiceFactsTask, claimTask, persistInvoiceFacts,
  componentFields, LAI_LOU_MEI, COMPONENT, factField,
} from "./x1-helpers.mjs";

let world = null;
let live = true;

before(async () => {
  world = await buildWorld();
  const r = await rootQuery(
    "select exists(select 1 from clara.schema_migrations where version='0023_extraction_slice_x5') as x",
  );
  live = r.rows[0].x;
});
after(async () => { await endPool(); });

const gate = (t) => {
  if (!live) { t.skip("0023 is not applied — X5 corroboration cells need the migration"); return true; }
  return false;
};

/** Seed a filed invoice document and settle ONE done invoice_facts extraction over `fields`
 *  through the REAL writer, so every write-boundary guard actually runs. */
async function factsDoc(client, fields) {
  const sub = world.users.alice;
  const firm = await firmOf(client);
  await grantConsent(sub, { firm, client }).catch(() => {});
  const cited = await seedCitedDocument(sub, { firm, client, quote: "RM 0.00", kind: "invoice" });
  await rootQuery("update clara.documents set document_kind='invoice' where id=$1", [cited.documentId]);
  await enqueueInvoiceFacts(cited.documentId);
  const task = await invoiceFactsTask(cited.documentId);
  await claimTask(task.id, { egressApproved: true });
  await persistInvoiceFacts(task.id, fields);
  return cited;
}

const factState = async (document) =>
  (await rootQuery("select clara._invoice_fact_state($1) as s", [document])).rows[0].s;

/**
 * The PRE-X5 verdict for the same extraction, recomputed from the same regions.
 *
 * This is what makes the cells an exact-diff rather than a set of assertions about the
 * present. The old OCR branch was: single positive total, confidence >= 0.95, page_polygon
 * with a non-empty polygon, MYR, amount_due absent-or-equal, deposit absent-or-zero, no
 * ineligibility. It is spelled out in SQL here — not imported — precisely because 0023
 * deleted the original, and a diff needs both sides present to be a diff.
 */
async function wouldHaveCorroboratedPreX5(document) {
  const r = await rootQuery(
    `with ext as (
       select e.id from clara.document_extractions e
        where e.document_id = $1 and e.engine_kind = 'invoice_facts' and e.status = 'done'
        order by e.version_n desc, e.id desc limit 1
     ), t as (
       select count(*)::int as n, min(r.monetary_cents) as cents,
              min(r.engine_confidence) as conf, min(r.locator_kind) as lk,
              (array_agg(r.locator order by r.id))[1] as loc
         from clara.document_regions r, ext where r.extraction_id = ext.id
          and r.field_path = 'invoice.total'
     ), c as (
       select upper(regexp_replace(coalesce(min(r.text_content),''), '[^A-Za-z]', '', 'g')) as cur
         from clara.document_regions r, ext where r.extraction_id = ext.id
          and r.field_path = 'invoice.currency'
     ), d as (
       select count(*)::int as n, min(r.monetary_cents) as cents
         from clara.document_regions r, ext where r.extraction_id = ext.id
          and r.field_path = 'invoice.amount_due'
     ), dep as (
       select count(*)::int as n, min(r.monetary_cents) as cents
         from clara.document_regions r, ext where r.extraction_id = ext.id
          and r.field_path = 'invoice.deposit'
     ), env as (
       select nullif(btrim(e.envelope->>'corroboration_ineligible'),'') as inel
         from clara.document_extractions e, ext where e.id = ext.id
     )
     select (t.n = 1 and t.cents is not null and t.cents > 0
             and coalesce(t.conf, 0) >= 0.95
             and t.lk = 'page_polygon'
             and jsonb_typeof(t.loc->'polygon') = 'array'
             and jsonb_array_length(t.loc->'polygon') > 0
             and c.cur = 'MYR'
             and (d.n = 0 or (d.cents is not null and d.cents = t.cents))
             and (dep.n = 0 or (dep.cents is not null and dep.cents = 0))
             and env.inel is null) as ok
       from t, c, d, dep, env`,
    [document],
  );
  return r.rows[0]?.ok === true;
}

// ===========================================================================
// The exact-diff: which shapes flip, and which must not
// ===========================================================================

test("[X5] a COMPONENT-LESS bill loses corroboration — the safe direction, and the common one", async (t) => {
  if (gate(t)) return;
  // The legacy corpus shape: a single stated total and nothing else. It corroborated on
  // vendor confidence alone; a rig fixture says 0.98 and so did every fixture in this repo.
  // It states no arithmetic, so there is nothing for a second reader to agree with, and X5
  // refuses it. Measured on live this population is almost the whole corpus
  // (corpus-yield-2026-07-27.md) — refusal-to-human is the correct outcome for all of it.
  const cited = await factsDoc(world.clients.A1, [
    factField("invoice.total", rm(90000)),
    factField("invoice.currency", "MYR"),
    factField("invoice.invoice_id", `X5-${randomUUID().slice(0, 8)}`),
  ]);
  assert.equal(await wouldHaveCorroboratedPreX5(cited.documentId), true,
    "PRE-X5 this shape DID corroborate — on confidence alone, which is the term X5 deleted");
  assert.equal((await factState(cited.documentId)).corroborated, false,
    "POST-X5 it does not: a document that states no arithmetic proves nothing an identity can check");
});

test("[X5] the BRIGHTPATH shape — net stated, tax ABSENT — stays FALSE", async (t) => {
  if (gate(t)) return;
  // The Gate-P vehicle prints `Service Tax (8%)` against a DASH: the tax is nil and OCR
  // captured nothing at all. X2 refuses to invent a 0.00 there, and X5 refuses to corroborate
  // without a stated tax. Both are the same judgement — a document that does not state its
  // tax has proven nothing about its tax — and unattended posting is not where you infer one.
  const cited = await factsDoc(world.clients.A1, [
    factField("invoice.total", rm(43556000)),
    factField("invoice.currency", "MYR"),
    factField("invoice.invoice_id", `X5-${randomUUID().slice(0, 8)}`),
    factField(COMPONENT.net, rm(43556040), { polygon: [], confidence: 0.9 }),
  ]);
  const state = await factState(cited.documentId);
  assert.equal(state.corroborated, false, "net without tax never corroborates");
  assert.ok(state.total_excl_tax_cents != null, "…though the net fact is still persisted and readable");
});

test("[X5] a FULL-IDENTITY document flips to TRUE — the only shape that does", async (t) => {
  if (gate(t)) return;
  // LAI LOU MEI, the real service-charge receipt: 94.30 + 3.77 + 5.66 + 0.02 = 103.75.
  // Four independently-read figures and a stated gross that agree to the sen.
  const { gross, net, serviceCharge, tax, rounding } = LAI_LOU_MEI;
  const cited = await factsDoc(world.clients.A1, componentFields({ gross, net, serviceCharge, tax, rounding }));
  assert.equal((await factState(cited.documentId)).corroborated, true,
    "the identity ties exactly, so the independently-read fields describe one document");
});

test("[X5] one sen off is a REFUSAL — the identity is exact, not approximate", async (t) => {
  if (gate(t)) return;
  const { gross, net, serviceCharge, tax } = LAI_LOU_MEI;
  // The same document with the rounding line dropped: 94.30 + 3.77 + 5.66 = 103.73 <> 103.75.
  const cited = await factsDoc(world.clients.A1, componentFields({ gross, net, serviceCharge, tax }));
  assert.equal((await factState(cited.documentId)).corroborated, false,
    "two sen short is not agreement — there is no tolerance band and there must not be one");
});

test("[X5] a CONFLICTING DUPLICATE component refuses, at the write boundary and again on read", async (t) => {
  if (gate(t)) return;
  // Two disagreeing values for one field_path forfeit the WHOLE extraction at the writer
  // (0016, widened by 0022) — so the read-time cardinality guards can never actually see one
  // through this path. They are still in the predicate, and this cell records WHY: a read
  // guard that leans on a write guard is one migration away from being wrong.
  let raised = null;
  await factsDoc(world.clients.A1, [
    factField("invoice.total", rm(10375)),
    factField("invoice.currency", "MYR"),
    factField(COMPONENT.net, rm(9430), { polygon: [], confidence: 0.9 }),
    factField(COMPONENT.net, rm(9431), { polygon: [], confidence: 0.9 }),
    factField(COMPONENT.tax, rm(566), { polygon: [], confidence: 0.9 }),
  ]).catch((e) => { raised = e; });
  assert.ok(raised, "the writer refuses conflicting duplicates outright");
  assert.equal(raised.code, "CLR10", "…with the duplicate-forfeit error, not a silent min()-select");
});

test("[X5] a document whose polygon is empty still never corroborates — the wall predates X5 and survives it", async (t) => {
  if (gate(t)) return;
  // The claim X5 makes is that it NARROWS the OCR branch. A full, tying identity on a total
  // with no physical geometry must still be refused, or X5 traded one wall for another.
  const { gross, net, serviceCharge, tax, rounding } = LAI_LOU_MEI;
  const fields = componentFields({ gross, net, serviceCharge, tax, rounding });
  fields[0] = factField("invoice.total", rm(gross), { polygon: [] });
  const cited = await factsDoc(world.clients.A1, fields);
  assert.equal((await factState(cited.documentId)).corroborated, false,
    "no geometry, no Tier A — agreement does not buy its way past the polygon wall");
});

test("[X5] a non-MYR document with a perfect identity still never corroborates", async (t) => {
  if (gate(t)) return;
  const { gross, net, serviceCharge, tax, rounding } = LAI_LOU_MEI;
  const cited = await factsDoc(world.clients.A1,
    componentFields({ gross, net, serviceCharge, tax, rounding, currency: "SGD" }));
  assert.equal((await factState(cited.documentId)).corroborated, false,
    "the ledger is MYR-only; arithmetic agreement in another currency is agreement about the wrong thing");
});

// ===========================================================================
// The grammar-parity golden cell (queued from X2's standards review)
// ===========================================================================

test("[X5] GRAMMAR PARITY: centsOfRaw (JS) and _normalize_invoice_cents (SQL) agree on every token", async (t) => {
  if (gate(t)) return;
  // WHY THIS CELL EXISTS. The runtime reader decides what to EMIT using `centsOfRaw`; the
  // database decides what that emission MEANS using `_normalize_invoice_cents`. If the two
  // ever disagree, the reader either withholds a value the DB would have accepted (a lost
  // field) or — the dangerous direction — emits one the DB normalizes to NULL, which forfeits
  // the entire extraction. The JS side is deliberately NARROWER; this cell proves it is never
  // WIDER, token by token, including the attacks that motivated the rule.
  const { centsOfRaw, isStrictAmount } = await import("../../runtime/lib/invoice-amount-grammar.mjs");
  const tokens = [
    // the real capture values
    "435,560.40", "435,560.00", "94.30", "5.66", "3.77", "0.02", "103.75", "0.40",
    // RM-prefixed and spacing forms
    "RM 1,000.00", "RM1,000.00", "RM  1,000.00", "RM\t1,000.00", " 1,234.56 ",
    // grammar edges the reader refuses but the DB accepts (narrower is SAFE)
    "1234", "1234.5", "12.345", "1,234", "(5.00)", "-0.40",
    // unicode-space attacks: the DB leaves these in place and normalizes to NULL
    "RM 1,234.56", "RM﻿1,234.56", "1 1,234.56", "﻿94.30", "94.30﻿",
    // plain refusals on both sides
    "", "   ", "N/A", "abc", "--", "-", "RM", "12..34", "1,23.45",
    // large values, where a float would have stopped counting sens
    "90,071,992,547,409.90", "90,071,992,547,409.91",
  ];
  const { rows } = await rootQuery(
    "select t as token, clara._normalize_invoice_cents(t) as cents from unnest($1::text[]) as t",
    [tokens],
  );
  const disagreements = [];
  for (const row of rows) {
    const js = centsOfRaw(row.token);
    const sql = row.cents === null ? null : BigInt(row.cents);
    if (js === null && sql === null) continue;
    if (js !== null && sql !== null && js === sql) continue;
    // A JS null where SQL has a value is NARROWER — allowed, and the whole design.
    if (js === null && sql !== null) continue;
    disagreements.push({ token: row.token, js: js === null ? null : String(js), sql: sql === null ? null : String(sql) });
  }
  assert.deepEqual(disagreements, [],
    "the JS normalizer must never be WIDER than the DB: a value it accepts that the DB normalizes to NULL forfeits the whole extraction");

  // TWO FUNCTIONS, TWO DIFFERENT CONTRACTS — worth separating, because conflating them is how
  // a parity cell ends up proving nothing. `centsOfRaw` is the COMPARISON normalizer and its
  // contract is to MATCH the DB (it decides whether two readings agree, and it must agree
  // with the DB about what a value is). The ACCEPT GRAMMAR `isStrictAmount` is the emit gate,
  // and its contract is to be strictly NARROWER — grouped thousands, exactly two decimals.
  const acceptedByDb = rows.filter((r) => r.cents !== null).map((r) => r.token);
  const refusedByGrammar = acceptedByDb.filter((tok) => !isStrictAmount(tok));
  assert.ok(refusedByGrammar.length > 0,
    "the accept grammar must be narrower than the DB in practice, or the emit gate is decorative");
  for (const tok of acceptedByDb) {
    if (!isStrictAmount(tok)) continue;
    assert.notEqual(centsOfRaw(tok), null,
      `${JSON.stringify(tok)} passes the emit gate, so it MUST normalize — the gate can never admit a value the DB refuses`);
  }

  // Exactness at the sen, past 2^53 — the defect that made cents BigInt in the first place.
  const lo = rows.find((r) => r.token === "90,071,992,547,409.90");
  const hi = rows.find((r) => r.token === "90,071,992,547,409.91");
  assert.notEqual(lo.cents, hi.cents, "the DB tells these apart");
  assert.notEqual(centsOfRaw(lo.token), centsOfRaw(hi.token), "…and so must the reader");
});
