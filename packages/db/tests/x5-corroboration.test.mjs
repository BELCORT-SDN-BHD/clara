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
  mintLegacyInvoiceFactsTask, invoiceFactsTask, claimTask, persistInvoiceFacts, failInvoiceFacts,
  componentFields, LAI_LOU_MEI, COMPONENT, factField, agreedEnvelope,
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
async function factsDoc(client, fields, { envelope = agreedEnvelope() } = {}) {
  const sub = world.users.alice;
  const firm = await firmOf(client);
  await grantConsent(sub, { firm, client }).catch(() => {});
  const cited = await seedCitedDocument(sub, { firm, client, quote: "RM 0.00", kind: "invoice" });
  await rootQuery("update clara.documents set document_kind='invoice' where id=$1", [cited.documentId]);
  // F-A1 PR-3 CUTOVER: the router's invoice-kind arm now mints llm_witness, never
  // invoice_facts (no dual-run, D9) -- this fixture only needs a task ON the
  // invoice_facts lane to exercise ITS downstream machinery, so it mints directly.
  await mintLegacyInvoiceFactsTask(cited.documentId);
  const task = await invoiceFactsTask(cited.documentId);
  await claimTask(task.id, { egressApproved: true });
  try {
    await persistInvoiceFacts(task.id, fields, { envelope });
  } catch (e) {
    // A refused persist leaves the task RUNNING, and the firm's ocr concurrency cap (default
    // 2) then refuses the next claim — so a cell that proves a write-boundary refusal would
    // silently starve every cell after it. Release it exactly as the runtime's own failure
    // path does, then re-raise so the caller still sees the refusal it was testing.
    await failInvoiceFacts(task.id, "corrupt").catch(() => {});
    throw e;
  }
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

// ===========================================================================
// The K-round regressions. Findings 1 and 3 were false-corroboration paths that
// ended in a posted entry, so these are the cells that matter most in this file.
// ===========================================================================

test("[K1] TYPED-ONLY net/tax never corroborate — self-consistency is not agreement", async (t) => {
  if (gate(t)) return;
  // THE EXECUTED COUNTEREXAMPLE. A real purchase of net 94 / tax 6 / total 100, whose typed
  // components come back TRANSPOSED to net 6 / tax 94 because Azure was unsure. No layout
  // lines exist, so the deterministic reader contributes nothing at all. The identity still
  // ties — 6 + 94 = 100 — and the supplier floor then binds an SST leg to the FALSE tax,
  // posting Dr expense 6 / Dr SST 94 against a bill that is 94 of expense and 6 of tax.
  // The 0.95 wall used to refuse this; removing it without requiring agreement removed the
  // refusal with it.
  const cited = await factsDoc(world.clients.A1, [
    factField("invoice.total", rm(10000), { confidence: 0.5 }),
    factField("invoice.currency", "MYR"),
    factField(COMPONENT.net, rm(600), { confidence: 0.5 }),
    factField(COMPONENT.tax, rm(9400), { confidence: 0.5 }),
  ], { envelope: {} }); // no reader receipt at all — exactly what a typed-only extraction leaves
  assert.equal((await factState(cited.documentId)).corroborated, false,
    "one reader is not two, however neatly its arithmetic adds up");
});

test("[K1] READER-ONLY is equally not agreement", async (t) => {
  if (gate(t)) return;
  // The mirror case, asserted so the rule reads as "two sources agreed" rather than
  // "the typed fields were absent". A reader emission Azure never typed is still one reader.
  const cited = await factsDoc(world.clients.A1, componentFields({ gross: 10000, net: 9400, tax: 600 }), {
    envelope: { totals_reader: { fields: {
      "invoice.total_excl_tax": { outcome: "matched" },
      "invoice.tax_total": { outcome: "matched" },
    } } },
  });
  assert.equal((await factState(cited.documentId)).corroborated, false,
    "`matched` is the reader alone; only `typed_collapsed` records two sources agreeing");
});

test("[K1] agreement is required PER FIELD — one agreed, one not, is not enough", async (t) => {
  if (gate(t)) return;
  for (const missing of ["invoice.total_excl_tax", "invoice.tax_total"]) {
    const fields = {
      "invoice.total_excl_tax": { outcome: "typed_collapsed" },
      "invoice.tax_total": { outcome: "typed_collapsed" },
    };
    fields[missing] = { outcome: "matched" };
    const cited = await factsDoc(world.clients.A1, componentFields({ gross: 10000, net: 9400, tax: 600 }),
      { envelope: { totals_reader: { fields } } });
    assert.equal((await factState(cited.documentId)).corroborated, false,
      `${missing} was read by one source only — the identity cannot be anchored on it`);
  }
});

test("[K2] a NEGATIVE typed net or tax is refused at the write boundary", async (t) => {
  if (gate(t)) return;
  // net -100 with tax 200 against a total of 100 satisfies the identity exactly. The reader's
  // own sign handling never sees typed fields, so the refusal has to live at the boundary
  // every producer passes through.
  for (const [bad, good] of [[COMPONENT.net, COMPONENT.tax], [COMPONENT.tax, COMPONENT.net]]) {
    let raised = null;
    await factsDoc(world.clients.A1, [
      factField("invoice.total", rm(10000)),
      factField("invoice.currency", "MYR"),
      factField(bad, "RM -100.00"),
      factField(good, rm(20000)),
    ]).catch((e) => { raised = e; });
    assert.ok(raised, `a negative ${bad} must not persist`);
    assert.equal(raised.code, "CLR10", "…refused at the write boundary, not merely disbelieved later");
  }
});

test("[K4] a rounding adjustment larger than 99 sen never corroborates", async (t) => {
  if (gate(t)) return;
  // subtotal 200, zero tax, rounding -100 against a typed total of 100 certifies
  // `200 - 100 = 100`, and the entry posts with NO rounding leg because the supplier floor
  // validates the journal rather than the extracted figure. Whatever that line is, it is not
  // rounding — the bound is what the word means.
  const cited = await factsDoc(world.clients.A1, [
    factField("invoice.total", rm(10000)),
    factField("invoice.currency", "MYR"),
    factField(COMPONENT.net, rm(20000)),
    factField(COMPONENT.tax, rm(0)),
    factField(COMPONENT.rounding, "RM -100.00"),
  ]);
  assert.equal((await factState(cited.documentId)).corroborated, false,
    "a ringgit of rounding is not rounding, and cannot be used to balance a wrong gross");

  const ok = await factsDoc(world.clients.A1,
    componentFields({ gross: 10375, net: 9430, serviceCharge: 377, tax: 566, rounding: 2 }));
  assert.equal((await factState(ok.documentId)).corroborated, true, "2 sen of rounding is rounding");
});

test("[K5] the LIVE CORPUS SHAPES, as a cell: NONE flips, and none is lost", async (t) => {
  if (gate(t)) return;
  // The exact-diff result belongs in the suite rather than in a report nobody re-runs — but
  // it has to be the REAL result, which means modelling the REAL envelopes. The first version
  // of this cell handed every shape the default `agreedEnvelope()` and asserted the one flip
  // the pre-K1 predicate produced. That made the suite green while claiming an outcome that
  // can no longer occur, which is worse than no cell at all: it would have defended the
  // obsolete behaviour against the correct one.
  //
  // Measured on live (read-only, 29 OCR extractions): 0 corroborated before, 0 after. The
  // document that flipped under the pre-K1 predicate — `5174df8a` — carries NO reader receipt
  // for either field: its net and tax came from Azure's typed fields alone and the layout
  // reader read nothing on it. That is exactly the typed-only shape K1 refuses, so its flip
  // was the false-corroboration path, not a yield loss.
  const shapes = [
    {
      name: "5174df8a-class — net + explicit zero tax, identity ties, but TYPED-ONLY",
      gross: 300000, net: 300000, tax: 0,
      envelope: {}, // the live envelope: no totals_reader receipt at all
    },
    {
      name: "509e788d-class — the vehicle: net AGREED, tax a printed dash",
      gross: 43556000, net: 43556040, tax: null,
      envelope: { totals_reader: { fields: {
        "invoice.total_excl_tax": { outcome: "typed_collapsed", value_raw: "435,560.40", typed_value_raw: "435,560.40" },
        "invoice.tax_total": { outcome: "absent" },
      } } },
    },
    {
      name: "d3732397-class — net stated, no tax",
      gross: 4500000, net: 4500000, tax: null,
      envelope: {},
    },
  ];
  let flips = 0;
  for (const shape of shapes) {
    const fields = [
      factField("invoice.total", rm(shape.gross), { confidence: 0.83 }),
      factField("invoice.currency", "MYR"),
      factField(COMPONENT.net, rm(shape.net), { confidence: 0.83 }),
    ];
    if (shape.tax !== null) fields.push(factField(COMPONENT.tax, rm(shape.tax), { confidence: 0.83 }));
    const cited = await factsDoc(world.clients.A1, fields, { envelope: shape.envelope });
    const got = (await factState(cited.documentId)).corroborated;
    assert.equal(got, false, `${shape.name} must NOT corroborate (got ${got})`);
    if (got) flips += 1;
    assert.equal(await wouldHaveCorroboratedPreX5(cited.documentId), false,
      `${shape.name} did not corroborate pre-X5 either (confidence 0.83 < 0.95) — nothing is LOST`);
  }
  assert.equal(flips, 0,
    "X5 opens nothing on the CURRENT corpus — it opens a lane future two-reader documents can walk through");
});

test("[K5] the positive flip is CONFIDENCE-INDEPENDENT — a retained 0.95 term turns this red", async (t) => {
  if (gate(t)) return;
  // Every figure here carries 0.83, just under the live maximum of 0.837 and well under the
  // 0.95 the old branch demanded. If an implementation kept the confidence term alongside the
  // identity, this document could not corroborate and the cell fails — which is the whole
  // point: the earlier fixture default of 0.98 satisfied BOTH walls and could not tell them
  // apart.
  const { gross, net, serviceCharge, tax, rounding } = LAI_LOU_MEI;
  const low = componentFields({ gross, net, serviceCharge, tax, rounding })
    .map((f) => ({ ...f, confidence: 0.83 }));
  const cited = await factsDoc(world.clients.A1, low);
  assert.equal((await factState(cited.documentId)).corroborated, true,
    "agreement alone carries this document — no figure on it would pass a 0.95 confidence wall");
  assert.equal(await wouldHaveCorroboratedPreX5(cited.documentId), false,
    "…and it provably would NOT have corroborated before X5");
});
