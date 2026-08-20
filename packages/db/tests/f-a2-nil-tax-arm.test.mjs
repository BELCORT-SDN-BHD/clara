// F-A2 opener ① — clara.evaluate_witness_fact_state_v2: THE THREE-LOCKS NIL-TAX ARM.
//
// Owner ruling of record (docs/plan/completed/f-a1-corpus-measurement.md:64-68): a document that
// prints NO TAX corroborates as tax = 0 ONLY when (page coverage complete) AND (both channels
// answer `not_printed`) AND (no SST registration number printed), stamped "document tax-silent,
// presumed non-registrant".
//
// THE ACCEPTANCE CRITERION FOR THE WHOLE OPENER IS ONE CELL OF A TABLE (spec §4.3): across every
// shape v1 and v2 both see, there is EXACTLY ONE where they differ — a complete, gross-printed,
// tax-silent invoice with no SST registration, which v1 refuses and v2 corroborates. So this
// battery is written as an EXACT DIFF around one all-locks-pass base: each negative cell breaks
// exactly ONE thing and asserts the verdict flips, and each such cell re-asserts its own
// corroborating twin — a cell that merely showed "false" without its twin would prove nothing
// about whether the term it names is the term doing the work.
//
// ON CONTRACT-BLINDNESS, STATED HONESTLY. Annex C marks the outcome cells ▣ (contract-blind).
// This lane authored BOTH the v2 body and these cells, so the blindness here is PROCEDURAL, not
// structural: every ▣ cell's expected outcome is transcribed from the opener ① spec's §4.1
// derivation, §4.3 fail-closed table and §8 battery sketch, never derived by reading the
// installed body. TRUE mutual blindness on this arm is the reviewer's and the runtime PR's to
// supply — the runtime half emits the coverage receipt this file writes by hand, and a
// divergence between the two is a real finding on one side or the other.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  rootQuery, endPool, buildWorld, firmOf, grantConsent, seedCitedDocument,
  witnessShape, landWitnessPair, evaluatePair, box,
  a2Ready, withWitnessV2, evaluatePairV2, textCoverage, visionCoverage, documentSha,
  answersOk, SST,
} from "./f-a2-fixtures.mjs";

let world = null;
let live = false;

before(async () => {
  world = await buildWorld();
  live = await a2Ready();   // THROWS on a half-applied window; false only when genuinely absent
});
after(async () => { await endPool(); });

const gate = (t) => {
  if (!live) { t.skip("F-A2 window not applied — clara.evaluate_witness_fact_state_v2 absent"); return true; }
  return false;
};

// THE CORPUS SHAPE THE RULING TARGETS: a Malaysian non-SST service invoice printing ONE gross
// line and nothing else. Every other belt field is `not_printed` — which is an ANSWER, not
// silence: `witnessShape` completes the roster unless a cell deliberately drops a key.
// `RM`, not `MYR`, per spec cell 4: a real Malaysian invoice prints "RM 1,060.00" and never a
// standalone MYR token, and the two-channel MYR evidence rule reduces both spellings alike — so
// the fixture renders what the document actually prints.
const NIL = { "invoice.total": 106000, "invoice.currency": "RM", "invoice.type_code": "01" };
// The same document, but the net line IS printed — sub-case (a), where the six-term identity
// stays a REAL arithmetic check rather than a construction.
const NIL_NET = { ...NIL, "invoice.total_excl_tax": 106000 };
// A tax-PRINTED invoice: the shape v1 already corroborates, carried as the arm's control.
const TAX_PRINTED = {
  "invoice.total": 106000, "invoice.total_excl_tax": 100000, "invoice.tax_total": 6000,
  "invoice.currency": "MYR", "invoice.type_code": "01",
};

const sstSilent = { text: { state: "not_printed" }, vision: { state: "not_printed" } };

/**
 * Seed a filed invoice document and land ONE witness pair over `fields`, with the v2 additions
 * applied on top. `v2` is passed straight through to `withWitnessV2`, so a cell breaks exactly
 * one term by naming it and nothing else.
 */
async function armDoc({ fields = NIL, shapeArgs = {}, v2 = {}, client = null } = {}) {
  const c = client ?? world.clients.A1;
  const firm = await firmOf(c);
  await grantConsent(world.users.alice, { firm, client: c }).catch(() => {});
  const cited = await seedCitedDocument(world.users.alice, { firm, client: c, kind: "invoice" });
  const sha = await documentSha(cited.documentId);
  const base = witnessShape({ fields, ...shapeArgs });
  const shape = withWitnessV2(base, {
    coverage: {
      text: v2.coverage?.text === undefined ? textCoverage() : v2.coverage.text,
      // A vision receipt may be given as a FUNCTION of the document's own digest. The receipt
      // has to be built BEFORE the pair lands: 0017's supersede trigger admits exactly one
      // supersede per extraction, so rewriting an envelope after the fact raises CLR08 — the
      // rig telling us, correctly, that a witness row is not a scratchpad.
      vision: v2.coverage?.vision === undefined
        ? visionCoverage({ inputSha256: sha })
        : (typeof v2.coverage.vision === "function" ? v2.coverage.vision(sha) : v2.coverage.vision),
    },
    sst: { text: sstSilent.text, vision: sstSilent.vision, ...(v2.sst ?? {}) },
  });
  const pair = await landWitnessPair(cited.documentId, shape);
  return { cited, pair, shape, sha };
}

const verdict = async ({ cited, pair }) => evaluatePairV2(cited.documentId, pair.textId, pair.visionId);
const has = (s, k) => Object.prototype.hasOwnProperty.call(s, k);

// ===========================================================================
// CELL 4 — the positive. Every lock passes; this is the one cell of §4.3's table where v2
// differs from v1, and every negative cell below is this shape with one thing broken.
// ===========================================================================

test("f-a2.all-three-pass ▣ a complete, single-page, gross-printed, tax-silent invoice with no SST registration CORROBORATES", async (t) => {
  if (gate(t)) return;
  const d = await armDoc();
  const s = await verdict(d);
  assert.equal(s.corroborated, true, "all three locks hold and the derivation is reachable");
  assert.equal(s.total_cents, 106000, "the gross is the witnessed, region-verified number");
  // `RM`, not `MYR`: the envelope's currency key is the ALPHABETIC REDUCTION of what the
  // document printed, not a normalization to an ISO code — 0092:502-506 is explicit that a bare
  // "RM" is a Malaysian reading and not a foreign one. Switching the fixture to the rendering a
  // real invoice carries moved this key with it, which is the emitted value being honest about
  // its source rather than a regression.
  assert.equal(s.currency, "RM");
  assert.equal(s.explicit_non_myr, false, "…and a bare RM is never read as a foreign currency");
  assert.equal(s.type_code, "01");
  assert.equal(s.regime, "witness");
  // …and v1, on the IDENTICAL pair, still refuses. This pairing IS the acceptance criterion:
  // the frozen predicate's answer is unchanged and the successor's is the ruled change.
  const v1 = await evaluatePair(d.cited.documentId, d.pair.textId, d.pair.visionId);
  assert.equal(v1.corroborated, false,
    "the FROZEN v1 predicate still refuses the same pair — the nil-tax law without the arm");
  assert.equal(has(v1, "tax_basis"), false, "and v1 can never emit the stamp");
});

// ===========================================================================
// CELL 5 — the receipt stamp and the emission policy, made a measured fact.
// ===========================================================================

test("f-a2.receipt-stamp the arm stamps tax_basis with the owner's ruled words, and the derived amounts stay ABSENT from the envelope", async (t) => {
  if (gate(t)) return;
  const s = await verdict(await armDoc());
  assert.equal(s.corroborated, true);
  assert.equal(s.tax_basis, "presumed_non_registrant", "the machine-readable token consumers branch on");
  assert.equal(s.tax_basis_note, "document tax-silent, presumed non-registrant",
    "the owner's ruled sentence, stored once rather than re-composed at three surfaces");
  // THE EMISSION POLICY (spec §6). The arm DERIVED both numbers; neither is emitted. This is
  // what keeps the ocr_sales unattended-post anchor shut and the supplier-bill tax-leg belt on
  // its no-raise arm — two live consumers that re-derive corroboration off exactly these keys.
  assert.equal(has(s, "tax_total_cents"), false,
    "the DERIVED zero tax is NOT emitted under the witnessed key");
  assert.equal(has(s, "total_excl_tax_cents"), false,
    "…nor is the DERIVED net, on a document that printed no net line");

  // The converse, on a tax-PRINTED corroborating twin: no stamp, both witnessed keys present.
  const printed = await verdict(await armDoc({ fields: TAX_PRINTED }));
  assert.equal(printed.corroborated, true, "the tax-printed control still corroborates");
  assert.equal(has(printed, "tax_basis"), false, "the arm did not fire, so nothing is stamped");
  assert.equal(printed.tax_total_cents, 6000, "a WITNESSED tax is emitted, exactly as v1 emits it");
  assert.equal(printed.total_excl_tax_cents, 100000);

  // And the nuance a reader must not have to derive: in sub-case (a) the net line IS witnessed,
  // so `total_excl_tax_cents` is emitted while `tax_total_cents` — the derived one — is not.
  // The emission rule is "witnessed values only", not "silence under the arm".
  const subA = await verdict(await armDoc({ fields: NIL_NET }));
  assert.equal(subA.corroborated, true);
  assert.equal(subA.tax_basis, "presumed_non_registrant");
  assert.equal(subA.total_excl_tax_cents, 106000, "the PRINTED net is emitted; it was read, not derived");
  assert.equal(has(subA, "tax_total_cents"), false, "the DERIVED tax still is not");
});

// ===========================================================================
// CELL 1 — LOCK 1 (page coverage complete), proven load-bearing on its own.
// ===========================================================================

test("f-a2.lock1-truncated ▣ a truncated text read refuses, and so does every other broken coverage receipt — raise-proof throughout", async (t) => {
  if (gate(t)) return;
  const sha = (await armDoc()).sha;  // any valid digest shape; each variant re-seeds its own doc

  const refuses = async (label, v2) => {
    const s = await verdict(await armDoc({ v2 }));
    assert.equal(s.corroborated, false, `${label}: lock 1 must fail`);
    assert.equal(has(s, "tax_basis"), false, `${label}: nothing is stamped when the arm does not fire`);
    return s;
  };

  await refuses("the text channel read a TRUNCATED prefix",
    { coverage: { text: textCoverage({ truncated: true }) } });
  await refuses("the vision channel reports truncation",
    { coverage: { vision: visionCoverage({ inputSha256: sha, truncated: true }) } });
  await refuses("the coverage receipt is ABSENT entirely (the v1-era row shape)",
    { coverage: { text: null } });
  await refuses("the vision receipt is ABSENT",
    { coverage: { vision: null } });
  await refuses("fewer regions were SHOWN than existed",
    { coverage: { text: textCoverage({ regionsTotal: 9, regionsShown: 4 }) } });
  await refuses("regions_total is ZERO — a read that saw nothing is not a complete read",
    { coverage: { text: textCoverage({ regionsTotal: 0 }) } });
  await refuses("the vision input digest is missing",
    { coverage: { vision: { truncated: false, downgraded_fields: [] } } });
  await refuses("the vision input digest is not a 64-hex sha",
    { coverage: { vision: visionCoverage({ inputSha256: "not-a-digest", truncated: false }) } });

  // THE RAISE-PROOF READS. A hard cast inside a STABLE predicate ~28 live call sites reach would
  // detonate every later read of the document rather than refuse it. Each of these is a
  // deliberately mistyped receipt: the assertion is that the call RETURNS a refusal at all.
  await refuses("`truncated` is the STRING \"false\", not the JSON boolean",
    { coverage: { text: { ...textCoverage(), truncated: "false" } } });
  await refuses("`truncated` is json null",
    { coverage: { text: { ...textCoverage(), truncated: null } } });
  await refuses("`regions_total` is a STRING",
    { coverage: { text: { ...textCoverage(), regions_total: "7", regions_shown: "7" } } });
  await refuses("`regions_total` is an absurd magnitude that would overflow an int cast",
    { coverage: { text: { ...textCoverage(), regions_total: 9e30, regions_shown: 9e30 } } });
  await refuses("the coverage receipt is an ARRAY, not an object",
    { coverage: { text: ["truncated", false] } });
  await refuses("the coverage receipt is a bare string",
    { coverage: { text: "complete" } });

  // The twin: the identical document with an intact receipt corroborates, so the term doing the
  // work above is lock 1 and not some other belt that happened to be failing too.
  assert.equal((await verdict(await armDoc())).corroborated, true,
    "the same document with a complete coverage receipt corroborates");
});

// ===========================================================================
// CELL 2 — LOCK 2 (both channels answer not_printed for tax).
// ===========================================================================

test("f-a2.lock2-one-channel-speaks ▣ a tax the channels disagree about refuses, and a tax BOTH channels print takes the arm off without refusing the document", async (t) => {
  if (gate(t)) return;

  // (a) One channel speaks. This is ALSO a cross-channel disagreement, so on its own it does not
  //     isolate lock 2 — which is exactly why (b) exists.
  const split = await verdict(await armDoc({
    shapeArgs: { visionOverride: { "invoice.tax_total": 0 } },
  }));
  assert.equal(split.corroborated, false, "text says not_printed, vision says RM 0.00 — no corroboration");
  assert.equal(has(split, "tax_basis"), false);

  // (b) THE ISOLATING VARIANT. Both channels PRINT a zero tax and cite it, on a document that
  //     also prints its net line. Agreement holds, every belt holds, the arithmetic ties — so
  //     the ONLY thing lock 2 changes is whether the ARM fires. It must not: a printed zero is a
  //     READING, and the presumption is for documents that are SILENT.
  const printedZero = await verdict(await armDoc({
    fields: { ...NIL_NET, "invoice.tax_total": 0 },
  }));
  assert.equal(printedZero.corroborated, true,
    "a document that PRINTS 0.00 tax corroborates on its own printed arithmetic, exactly as v1 reads it");
  assert.equal(has(printedZero, "tax_basis"), false,
    "…and is NOT stamped as a presumption: lock 2 held the arm off, nothing else did");
  assert.equal(printedZero.tax_total_cents, 0, "the witnessed zero IS emitted — it was read, not presumed");

  // (c) The write-boundary door: a MISSING tax answer never reaches the predicate at all. Read
  //     through the validator the writer itself calls, not a re-implementation of it.
  const base = withWitnessV2(witnessShape({ fields: NIL }), {
    coverage: { text: textCoverage(), vision: visionCoverage({ inputSha256: "0".repeat(64) }) },
    sst: sstSilent,
  });
  const dropped = structuredClone(base.textEnvelope);
  delete dropped.witness.answers["invoice.tax_total"];
  assert.equal(await answersOk(dropped, "text"), false,
    "a witness envelope missing the tax_total belt answer is refused at the write boundary (CLR10), which is the correct door");
  assert.equal(await answersOk(base.textEnvelope, "text"), true,
    "…and the complete v2-shaped envelope passes it");
});

// ===========================================================================
// CELL 3 — LOCK 3 (no SST registration number printed, either party).
// ===========================================================================

test("f-a2.lock3-sst-printed ▣ a printed SST registration refuses; a COMPANY registration number does not — spelling is not identity", async (t) => {
  if (gate(t)) return;

  // (a) Both channels read a printed SST number. THE STRING IS THE CORPUS'S OWN, IN ITS OWN
  //     CONTEXT (spec §2.5.5), not a synthetic one — and carrying it here is the point rather
  //     than a nicety. "Nombor Pendaftaran ST" is the GST-era Malay label that BOTH spelling
  //     regexes missed: a prompt tuned on "SST Registration No." / "SST Reg. No." / "No.
  //     Pendaftaran SST" does not see it, the model answers `not_printed`, and lock 3 hands the
  //     non-registrant presumption to a document that prints a registration number. Putting the
  //     real label in a battery cell is what puts it in front of the prompt author.
  const CORPUS_SST = "Nombor Pendaftaran ST W10-1808-31022372";
  const printed = await verdict(await armDoc({
    v2: { sst: { text: { state: "value", raw: CORPUS_SST },
                 vision: { state: "value", raw: CORPUS_SST } } },
  }));
  assert.equal(printed.corroborated, false, "an SST-registered issuer gets no non-registrant presumption");
  assert.equal(has(printed, "tax_basis"), false);

  // …and one channel alone is enough to hold the lock shut: the lock is a two-channel conjunction.
  const one = await verdict(await armDoc({
    v2: { sst: { vision: { state: "value", raw: CORPUS_SST } } },
  }));
  assert.equal(one.corroborated, false, "one channel reading an SST number is enough to refuse");

  // (b) The SST answer is ABSENT from both channels — the v1-era shape. Silence about a question
  //     nobody asked is not a negative reading (review law 2).
  const absent = await verdict(await armDoc({ v2: { sst: { text: null, vision: null } } }));
  assert.equal(absent.corroborated, false, "no SST answer at all fails the lock on SQL NULL");
  assert.equal(has(absent, "tax_basis"), false);

  // (c) THE CELL THAT PROVES THE LOCK READS ITS OWN QUESTION. The document prints a COMPANY
  //     registration number, cited as invoice.vendor_registration, while both channels answer
  //     the SST question `not_printed`. An SSM/BRN company number is NOT an SST registration
  //     number; reading one as a proxy for the other would read a projection of the thing.
  const company = await armDoc({
    shapeArgs: {
      extraRegions: [{
        field_path: "invoice.vendor_registration", text_content: "Company No. 202301012345 (1234567-A)",
        locator_kind: "page_polygon", locator: box(0, 30, 30, 34),
      }],
    },
  });
  const s = await verdict(company);
  assert.equal(s.corroborated, true,
    "a printed COMPANY registration number does not disqualify the presumption — lock 3 asks the SST question and only that");
  assert.equal(s.tax_basis, "presumed_non_registrant");
});

// ===========================================================================
// CELL 9b — R6: an honest silence and a DOWNGRADED claim are byte-identical in the answers.
// The receipt is the only thing that tells them apart, so the receipt is what the lock reads.
// ===========================================================================

test("f-a2.lock3-downgraded-not-honest ▣ a downgraded SST claim refuses even though its persisted ANSWER is byte-identical to an honest silence", async (t) => {
  if (gate(t)) return;

  const honest = await armDoc();
  const downgradedText = await armDoc({
    v2: { coverage: { text: textCoverage({ downgraded: [SST] }) } },
  });

  // THE HAZARD, MEASURED FIRST. If the persisted answers differed, this cell would be proving
  // something easier than the real thing.
  const answersOfText = async (id) => (await rootQuery(
    "select envelope->'witness'->'answers' as a from clara.document_extractions where id=$1", [id])).rows[0].a;
  assert.deepEqual(await answersOfText(honest.pair.textId), await answersOfText(downgradedText.pair.textId),
    "the honest and the downgraded reads persist BYTE-IDENTICAL answer maps — the normalizer cannot tell them apart");

  const h = await verdict(honest);
  assert.equal(h.corroborated, true, "an honest silence with a clean receipt lets the arm fire");
  assert.equal(h.tax_basis, "presumed_non_registrant");

  // The VISION-side twin. Its receipt is built from the document's OWN digest before the pair
  // lands, so the ONLY thing wrong with the read is the downgrade.
  const dvOwn = await armDoc({
    v2: { coverage: { vision: (sha) => visionCoverage({ inputSha256: sha, downgraded: [SST] }) } },
  });

  for (const [label, d] of [
    ["the TEXT channel downgraded its SST claim", downgradedText],
    ["the VISION channel downgraded its SST claim", dvOwn],
  ]) {
    const s = await verdict(d);
    assert.equal(s.corroborated, false, `${label}: the arm must refuse — the silence is derived, not read`);
    assert.equal(has(s, "tax_basis"), false, `${label}: nothing is stamped`);
  }
  // A NAMED RESIDUAL, asserted rather than left implicit (spec §2 Lock 1). The predicate reads
  // the vision digest for SHAPE only — 64 lowercase hex — and does NOT cross-check it against
  // this document's own sha256, because the WRITER already refuses any persist whose vision
  // input pin is not that value (0095:405-407); the receipt exists to make that wall READABLE,
  // not to re-litigate it. So a hand-written receipt carrying another document's digest passes
  // lock 1, and that is the specified behaviour rather than a gap this cell found. A fixture
  // reaches this state only by bypassing the writer, which is what these fixtures do.
  const foreignDigest = await armDoc({
    v2: { coverage: { vision: visionCoverage({ inputSha256: "b".repeat(64) }) } },
  });
  assert.equal((await verdict(foreignDigest)).corroborated, true,
    "lock 1 reads the vision digest's SHAPE, not its identity — the writer owns the identity wall");

  // The receipt must be an array this read actually SAW. Absent, null, a string, or an object
  // all fail — absence of a receipt is the lock failing, never the lock passing.
  for (const [label, dg] of [
    ["downgraded_fields ABSENT from an otherwise complete receipt", undefined],
    ["downgraded_fields is json null", null],
    ["downgraded_fields is a bare string", SST],
    ["downgraded_fields is an object", { [SST]: true }],
  ]) {
    const cov = textCoverage();
    if (dg === undefined) delete cov.downgraded_fields; else cov.downgraded_fields = dg;
    const s = await verdict(await armDoc({ v2: { coverage: { text: cov } } }));
    assert.equal(s.corroborated, false, `${label}: lock 3 fails closed`);
  }

  // A downgrade of some OTHER field does not touch lock 3 — the term is field-scoped, not a
  // blanket "any downgrade condemns the read" (which would refuse a tax-printed document over
  // an unrelated fumble).
  const other = await verdict(await armDoc({
    v2: { coverage: { text: textCoverage({ downgraded: ["invoice.invoice_id"] }) } },
  }));
  assert.equal(other.corroborated, true,
    "a downgrade of an unrelated field leaves lock 3 alone — the term names the field it guards");
});

// ===========================================================================
// CELL 11 — the derivation boundary. Sub-case (b) is where the arm is weakest, so this is where
// the strict form (OQ-4, adopted) has to be proven rather than assumed.
// ===========================================================================

test("f-a2.component-printed-no-net ▣ the arm WITHDRAWS when net is unprinted and another component IS printed; with net printed it corroborates and the identity is a real check", async (t) => {
  if (gate(t)) return;

  // A service charge is printed, the net line is not. Deriving net around a printed component
  // would be the evaluator inventing document structure to buy a corroboration.
  const withheld = await verdict(await armDoc({
    fields: { ...NIL, "invoice.service_charge": 10000 },
  }));
  assert.equal(withheld.corroborated, false, "an unreachable derivation withdraws the arm");
  assert.equal(has(withheld, "tax_basis"), false, "a withdrawn arm stamps nothing");

  // Its twin: the same document with the net line ALSO printed. 96000 + 10000 + 0 = 106000.
  const twin = await verdict(await armDoc({
    fields: { ...NIL, "invoice.total_excl_tax": 96000, "invoice.service_charge": 10000 },
  }));
  assert.equal(twin.corroborated, true, "sub-case (a): the arm fires on a document whose net IS printed");
  assert.equal(twin.tax_basis, "presumed_non_registrant");

  // …and the identity in sub-case (a) is a REAL check, proven by perturbing the printed net by
  // one sen and confirming the refusal.
  const bent = await verdict(await armDoc({
    fields: { ...NIL, "invoice.total_excl_tax": 96001, "invoice.service_charge": 10000 },
  }));
  assert.equal(bent.corroborated, false,
    "one sen off the printed net breaks the six-term identity — the arithmetic term is live in sub-case (a)");

  // Every other printed component takes the same withdrawal, one at a time.
  for (const [field, cents] of [
    ["invoice.discount", 5000], ["invoice.delivery", 3000], ["invoice.rounding", 2],
  ]) {
    const s = await verdict(await armDoc({ fields: { ...NIL, [field]: cents } }));
    assert.equal(s.corroborated, false, `${field} printed with no net line: the arm withdraws`);
  }
});

// ===========================================================================
// ADVERSARIAL — the forge shapes the F-A1 battery already carries, re-run WITH the arm engaged.
// A new arm is exactly where an old counterexample gets a second life.
// ===========================================================================

test("f-a2.adversarial the executed rounding forge, the negative-discount forge and an absurd magnitude all still refuse with the arm engaged", async (t) => {
  if (gate(t)) return;

  // THE EXECUTED FORGE (0092:470-473): subtotal 200, zero tax, a parsed `Rounding -100.00` and a
  // stated total of 100 — the six-term identity TIES at 200 - 100 = 100. Under the arm the tax
  // term is the derived zero, so the identity ties just as neatly; the bounded-rounding belt is
  // what refuses, and it is unchanged.
  const forge = await verdict(await armDoc({
    fields: { "invoice.total": 10000, "invoice.total_excl_tax": 20000, "invoice.rounding": -10000,
      "invoice.currency": "MYR", "invoice.type_code": "01" },
  }));
  assert.equal(forge.corroborated, false,
    "a rounding of RM -100.00 exceeds what the word can mean (99 sen), arm or no arm");
  assert.equal(has(forge, "tax_basis"), false);

  // THE SIGN BELT (0092:467-469): the identity SUBTRACTS the discount, so a negative one turns
  // that subtraction into an addition and forges a larger gross that ties exactly.
  const negDisc = await verdict(await armDoc({
    fields: { "invoice.total": 106000, "invoice.total_excl_tax": 96000, "invoice.discount": -10000,
      "invoice.currency": "MYR", "invoice.type_code": "01" },
  }));
  assert.equal(negDisc.corroborated, false, "a negative discount still refuses under the arm");

  // M6, THE MAGNITUDE PRE-GUARD: an absurd rendering must fall to NOT CORROBORATED, never raise
  // out of a STABLE read. The assertion is that the call RETURNS at all.
  const huge = await verdict(await armDoc({
    shapeArgs: { rawOverride: { "invoice.total": `RM ${"9".repeat(30)}.00` } },
  }));
  assert.equal(huge.corroborated, false, "a 30-digit rendering is unreadable, not an exception");
  assert.equal(has(huge, "tax_basis"), false);

  // The unchanged belts stay unchanged under the arm: a CREDIT NOTE is still corroboration-
  // ineligible, an explicit foreign currency still refuses, and an ineligibility stamp on either
  // row still kills the whole read before any lock is consulted.
  const cn = await verdict(await armDoc({ fields: { ...NIL, "invoice.type_code": "02" } }));
  assert.equal(cn.corroborated, false, "type_code 02 is corroboration-ineligible, arm or no arm (M12)");
  const usd = await verdict(await armDoc({ fields: { ...NIL, "invoice.currency": "USD" } }));
  assert.equal(usd.corroborated, false, "an explicit foreign currency refuses");
  assert.equal(usd.explicit_non_myr, true);
  const inel = await verdict(await armDoc({ shapeArgs: { ineligible: "witness_read_degraded" } }));
  assert.equal(inel.corroborated, false, "an ineligibility stamp kills the read before the locks matter");
  assert.equal(has(inel, "tax_basis"), false);
  const contested = await verdict(await armDoc({ shapeArgs: { contest: true } }));
  assert.equal(contested.corroborated, true,
    "a contest marker withdraws IDENTITY, never the amount verdict (N5) — carried from v1 unchanged");
});
