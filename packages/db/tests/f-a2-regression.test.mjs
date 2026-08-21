// F-A2 openers ①② — THE REGRESSION HALF: the freeze, the repoint, the transition population,
// the engine-literal contract, and the corpus obligation.
//
// The arm's own conjunct cells live in f-a2-nil-tax-arm.test.mjs. THIS file carries the claims
// that are NEGATIVE — that nothing else moved — plus the two cross-side contracts the DB half
// cannot close alone (the runtime's engine snapshot, and the real-corpus replay).

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  rootQuery, endPool, buildWorld, firmOf, grantConsent, seedCitedDocument,
  witnessShape, landWitnessPair, evaluatePair, extractedDoc, legacyPick,
  factState, factStateText, factStateAtText,
  a2Ready, withWitnessV2, evaluatePairV2, textCoverage, visionCoverage, documentSha,
  answersOk, mintEngineId, SST, V1_PROSRC_SHA, WITNESS_ENGINE_ID_V1, WITNESS_ENGINE_ID_V2,
} from "./f-a2-fixtures.mjs";

let world = null;
let live = false;

before(async () => {
  world = await buildWorld();
  live = await a2Ready();
});
after(async () => { await endPool(); });

const gate = (t) => {
  if (!live) { t.skip("F-A2 window not applied"); return true; }
  return false;
};

const NIL = { "invoice.total": 106000, "invoice.currency": "MYR", "invoice.type_code": "01" };
const has = (s, k) => Object.prototype.hasOwnProperty.call(s, k);
const sstSilent = { text: { state: "not_printed" }, vision: { state: "not_printed" } };

/** A filed invoice document carrying ONE witness pair, with the v2 additions applied exactly as
 *  the caller asks and NOTHING defaulted — so a "v1-era row" cell really builds a v1-era row. */
async function pairDoc({ fields = NIL, v2 = null } = {}) {
  const c = world.clients.A1;
  const firm = await firmOf(c);
  await grantConsent(world.users.alice, { firm, client: c }).catch(() => {});
  const cited = await seedCitedDocument(world.users.alice, { firm, client: c, kind: "invoice" });
  const sha = await documentSha(cited.documentId);
  let shape = witnessShape({ fields });
  if (v2) {
    shape = withWitnessV2(shape, {
      coverage: {
        text: v2.coverage?.text,
        vision: v2.coverage?.vision === "auto"
          ? visionCoverage({ inputSha256: sha }) : v2.coverage?.vision,
      },
      sst: v2.sst ?? {},
    });
  }
  const pair = await landWitnessPair(cited.documentId, shape);
  return { cited, pair, shape, sha };
}
const v2Verdict = async ({ cited, pair }) => evaluatePairV2(cited.documentId, pair.textId, pair.visionId);

// ===========================================================================
// CELL 6 — the freeze HELD. Not assumed: measured against the sha 0092 committed.
// ===========================================================================

test("f-a2.v1-untouched the FROZEN v1 predicate is byte-identical, still registered, and still refuses the shape v2 corroborates", async (t) => {
  if (gate(t)) return;
  const r = await rootQuery(`
    select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') as sha
      from pg_proc p where p.oid='clara.evaluate_witness_fact_state_v1(uuid,uuid,uuid)'::regprocedure`);
  assert.equal(r.rows.length, 1, "v1 still exists in the catalog — a frozen evaluator is never removed");
  assert.equal(r.rows[0].sha, V1_PROSRC_SHA,
    "v1's body is byte-identical to the one 0092 committed — the freeze is what makes a _v2 necessary");

  const reg = await rootQuery(`
    select version, entrypoint_signature, deployed from clara.evaluator_versions
     where evaluator_name='evaluate_witness_fact_state' order by version`);
  assert.deepEqual(reg.rows.map((x) => x.version), [1, 2], "the registry carries BOTH versions, appended");
  assert.equal(reg.rows[0].entrypoint_signature, "clara.evaluate_witness_fact_state_v1(uuid,uuid,uuid)");
  assert.equal(reg.rows[1].entrypoint_signature, "clara.evaluate_witness_fact_state_v2(uuid,uuid,uuid)");
  // BORN UNDEPLOYED is asserted where it is UNIMPEACHABLE — inside the migration's own tail, in
  // the same transaction as the insert (part 2 §D4). It cannot be re-asserted absolutely here:
  // the shared package sweep runs delta's and epsilon's one-way ceremonies, whose flip is a
  // blanket `where not deployed`, so by the time this file runs the whole roster may legitimately
  // be deployed. What IS order-independent is that v2 never got AHEAD of v1 — the only lawful way
  // for it to be deployed is the same blanket ceremony that deployed its predecessor.
  assert.equal(reg.rows[1].deployed, reg.rows[0].deployed,
    "v2's deploy state never runs ahead of v1's — a migration that deployed itself would show here as v2 true / v1 false");

  // …and calling v1 DIRECTLY on an all-locks-pass pair still returns the nil-tax law's refusal.
  const d = await pairDoc({ v2: { coverage: { text: textCoverage(), vision: "auto" }, sst: sstSilent } });
  assert.equal((await evaluatePair(d.cited.documentId, d.pair.textId, d.pair.visionId)).corroborated, false,
    "v1 refuses the arm's own positive fixture — it has no arm to fire");
  assert.equal((await v2Verdict(d)).corroborated, true, "…and v2 corroborates the identical pair");
});

test("f-a2.freeze-green verify_evaluator_freeze() passes with two witness versions and eight member rows, and the manifest gained the v2 entry as an APPEND", async (t) => {
  if (gate(t)) return;
  await rootQuery("select clara.verify_evaluator_freeze()");
  const m = await rootQuery(`
    select count(*)::int as n from clara.evaluator_version_members mm
      join clara.evaluator_versions v on v.id = mm.evaluator_version_id
     where v.evaluator_name='evaluate_witness_fact_state'`);
  assert.equal(m.rows[0].n, 8, "two versions x four closure members");
  const sigs = await rootQuery(`
    select mm.ordinal, mm.member_signature from clara.evaluator_version_members mm
      join clara.evaluator_versions v on v.id = mm.evaluator_version_id
     where v.evaluator_name='evaluate_witness_fact_state' and v.version = 2 order by mm.ordinal`);
  assert.deepEqual(sigs.rows.map((x) => x.member_signature), [
    "clara.evaluate_witness_fact_state_v2(uuid,uuid,uuid)",
    "clara._fact_hash(uuid,uuid,text,text,bigint)",
    "clara._normalize_invoice_cents(text)",
    "clara.evaluate_witness_identity_v1(uuid,uuid,boolean)",
  ], "the v2 closure is the SAME four members with the v2 entrypoint at ordinal 0");

  // The SOURCE half of the freeze family. check-frozen-evaluators.mjs rejects a rehash of a
  // deployed entry vs origin/main, so the only lawful shape here is an APPEND: v1's recorded
  // hash untouched, a new entry for v2.
  const manifest = JSON.parse(readFileSync(
    fileURLToPath(new URL("../../../frozen-evaluators.json", import.meta.url)), "utf8"));
  const v1 = manifest.evaluators["clara.evaluate_witness_fact_state_v1"];
  const v2 = manifest.evaluators["clara.evaluate_witness_fact_state_v2"];
  assert.ok(v1, "v1's manifest entry survives — append-only means an entry is never removed");
  assert.equal(v1.deployed, true, "…and its deploy lock is monotonic");
  assert.ok(v2, "the v2 entry was appended to the manifest");
  // TRUED 2026-08-21: this assertion used to read `notEqual(v2.deployed, true)` — "UNDEPLOYED
  // until the ceremony runs --lock-deployed". That ceremony HAS run (the combined Window A+B,
  // `docs/plan/completed/f-a2-window-ab-ceremony-asrun.md`; live 97/`0102`, evaluator flip
  // 4/4->5/5, `--lock-deployed` at its close), so the pin inverted — a dated tripwire asserting
  // a pre-ceremony fact as though it were permanent. The cell stays load-bearing in the NEW
  // direction: the deploy lock is MONOTONIC, so a regression to false is now the alarm, exactly
  // as it already is for v1 two lines above. (The runtime tree learned this same lesson earlier
  // and hardened `version-cutover-e2e.mjs` by declining to pin a ceremony-dependent flag at all;
  // here the flag is no longer ceremony-dependent — the ceremony is done — so it is pinned true.)
  assert.equal(v2.deployed, true,
    "…and v2's deploy lock is monotonic too, granted at the 2026-08-21 Window A+B ceremony");
  assert.ok(/f_a2_nil_tax_arm_part2/.test(v2.migration),
    "…and it points at the migration that defines it (the battery gates on the STABLE SUFFIX, never the number)");
});

// ===========================================================================
// CELL 7 — legacy continuity. The expensive half: the repoint must not move ANY existing
// document's answer.
// ===========================================================================

test("f-a2.legacy-continuity a legacy invoice_facts document's answer is unmoved by the repoint, byte-for-byte, and carries no witness-regime key", async (t) => {
  if (gate(t)) return;
  const doc = await extractedDoc(world.users.alice, { client: world.clients.A1, cents: 500000 });
  const pick = await legacyPick(doc.documentId);
  assert.ok(pick, "the legacy generation resolves");
  const viaResolver = await factStateText(doc.documentId);
  const viaPinned = await factStateAtText(doc.documentId, pick);
  assert.equal(viaResolver, viaPinned,
    "the dispatcher's legacy path returns the pinned overload's BYTES (the 0023:357 exact-diff idiom)");
  const s = JSON.parse(viaResolver);
  assert.equal(s.total_cents, 500000);
  assert.equal(has(s, "regime"), false, "a legacy envelope carries NO witness-regime key (N5)");
  assert.equal(has(s, "tax_basis"), false,
    "…and can never carry the F-A2 stamp: the legacy branches are byte-untouched and cannot emit it");

  const bare = await seedCitedDocument(world.users.alice,
    { firm: await firmOf(world.clients.A1), client: world.clients.A1, kind: "invoice" });
  assert.equal(await factStateText(bare.documentId), "{}",
    "a document with neither regime still returns the empty object — the live contract, unmoved");
});

test("f-a2.resolver-repoint the 1-arg cross-regime dispatcher reaches v2 — the repoint is one line in one body and every caller inherits it", async (t) => {
  if (gate(t)) return;
  const src = (await rootQuery(
    "select prosrc from pg_proc where oid='clara._invoice_fact_state_at(uuid,uuid)'::regprocedure")).rows[0].prosrc;
  assert.ok(src.includes("clara.evaluate_witness_fact_state_v2("), "the resolver names v2");
  assert.ok(!src.includes("evaluate_witness_fact_state_v1"),
    "…and no longer names v1 — a repoint that left the old dispatch reachable would be no repoint");

  // Behaviourally, through the door production uses: the arm's stamp arrives at a consumer that
  // only ever calls the 1-arg resolver.
  const d = await pairDoc({ v2: { coverage: { text: textCoverage(), vision: "auto" }, sst: sstSilent } });
  const viaDispatcher = await factState(d.cited.documentId);
  assert.equal(viaDispatcher.corroborated, true);
  assert.equal(viaDispatcher.tax_basis, "presumed_non_registrant",
    "the stamp reaches the cross-regime dispatcher without any caller being repointed");
});

// ===========================================================================
// CELL 9 — the transition population. Every witness pair persisted by witnessFacts.v1 fails TWO
// locks independently, and the cell proves BOTH by repairing them one at a time.
// ===========================================================================

test("f-a2.witness-v1-envelope-still-persists a v1-era envelope still passes the write boundary, and its pair fails lock 1 AND lock 3 independently", async (t) => {
  if (gate(t)) return;
  const era1 = await pairDoc();                       // no coverage receipt, no SST answer
  assert.equal(await answersOk(era1.shape.textEnvelope, "text"), true,
    "a v1-era envelope still persists cleanly through the widened validator — the rollback-safe property");
  assert.equal(await answersOk(era1.shape.visionEnvelope, "vision"), true);

  const before = await v2Verdict(era1);
  assert.equal(before.corroborated, false, "…and evaluated under v2 it refuses");
  assert.equal(has(before, "tax_basis"), false);

  // THE INDEPENDENCE PROOF. There is no per-lock reason field on the envelope — the stamp is the
  // arm's only output — so "the refusal names both failing locks" is proven by REPAIRING ONE AT
  // A TIME and showing that neither repair alone is enough.
  const coverageOnly = await pairDoc({
    v2: { coverage: { text: textCoverage(), vision: "auto" } },     // lock 1 repaired, lock 3 not
  });
  assert.equal((await v2Verdict(coverageOnly)).corroborated, false,
    "a coverage receipt alone does not corroborate — lock 3 has no SST answer to read (SQL NULL)");

  const sstOnly = await pairDoc({ v2: { sst: sstSilent } });         // lock 3's answer, no receipt
  assert.equal((await v2Verdict(sstOnly)).corroborated, false,
    "an SST answer alone does not corroborate — lock 1 has no receipt, and lock 3's R6 term has no downgrade list to read");

  const both = await pairDoc({
    v2: { coverage: { text: textCoverage(), vision: "auto" }, sst: sstSilent },
  });
  assert.equal((await v2Verdict(both)).corroborated, true,
    "only a read that carries BOTH the receipt and the answer corroborates — a v1-era row can never be backfilled into one");
});

// ===========================================================================
// THE ENGINE LITERAL CONTRACT (opener ②, spec §7f). Both DB doors, read independently.
// ===========================================================================

const RUNTIME_V1_SERVICES = new URL("../../runtime/workflows/witnessFacts.v1.services.mjs", import.meta.url);
const RUNTIME_V2_SERVICES = new URL("../../runtime/workflows/witnessFacts.v2.services.mjs", import.meta.url);

/** The engineId a services module derives, read from its SOURCE — never imported, so the test
 *  measures the committed default rather than whatever the environment happens to set. */
function derivedEngineId(url) {
  const src = readFileSync(fileURLToPath(url), "utf8");
  const model = /WITNESS_MODEL_ID = process\.env\.CLARA_WITNESS_MODEL_ID \|\| "([^"]+)"/.exec(src);
  const version = /WITNESS_ENGINE_VERSION = "([^"]+)"/.exec(src);
  if (!model || !version) return null;
  return `llm-openai:${model[1]}:${version[1]}`;
}

test("f-a2.engine-literal both DB mint doors carry the SAME :v2 engine literal, read independently from their own catalog bodies", async (t) => {
  if (gate(t)) return;
  const router = await mintEngineId("router");
  const reext = await mintEngineId("reextraction");
  assert.equal(router, reext,
    "a re-extraction and a first extraction must buy the IDENTICAL product — the two doors agree");
  assert.equal(router, WITNESS_ENGINE_ID_V2, "…and the identity is the F-A2 locked literal");

  // The OLD literal is gone from both bodies, so no path can still mint a :v1 task.
  for (const sig of ["clara._enqueue_invoice_facts_core(uuid)", "clara.request_reextraction(uuid,text,text)"]) {
    const src = (await rootQuery("select prosrc from pg_proc where oid=$1::regprocedure", [sig])).rows[0].prosrc;
    assert.ok(!src.includes(WITNESS_ENGINE_ID_V1), `${sig} no longer carries the :v1 literal`);
  }

  // THE STRAGGLER-PROVENANCE ASSERTION (opener ② §7b): witnessFacts.v1's own services module is
  // UNTOUCHED. A bump that edited it in place would rewrite the identity of every already-
  // persisted v1 pair's engine, which is the whole reason the bump ships as a new module.
  assert.ok(existsSync(fileURLToPath(RUNTIME_V1_SERVICES)),
    "witnessFacts.v1.services.mjs still exists — a frozen closure member is never removed");
  assert.equal(derivedEngineId(RUNTIME_V1_SERVICES), WITNESS_ENGINE_ID_V1,
    "…and still derives :v1, byte-untouched by this bump");
});

test("f-a2.engine-literal-wire the runtime's witnessFacts.v2 engine snapshot string-equals the DB literal — both sides read independently", async (t) => {
  if (gate(t)) return;
  const dbLiteral = await mintEngineId("router");
  if (!existsSync(fileURLToPath(RUNTIME_V2_SERVICES))) {
    // NOT A SILENT SKIP. The runtime half of this window is a SEPARATE PR on the same branch
    // train; until it lands there is no second side to read, and inventing one would be the
    // false-green shape. The skip names the missing artifact, the obligation and the owner.
    t.diagnostic("F-A2 OPEN WIRE — packages/runtime/workflows/witnessFacts.v2.services.mjs does NOT exist yet.");
    t.diagnostic(`F-A2 OPEN WIRE — the DB half locks the engine identity to ${dbLiteral}; the runtime PR's`);
    t.diagnostic("F-A2 OPEN WIRE — WITNESS_ENGINE_SNAPSHOT.engineId MUST string-equal it, or the router will mint");
    t.diagnostic("F-A2 OPEN WIRE — tasks the worker settles under a different engine identity. This cell turns");
    t.diagnostic("F-A2 OPEN WIRE — into a HARD equality assertion the moment that file appears — it is not");
    t.diagnostic("F-A2 OPEN WIRE — conditional on anything an author can set.");
    t.skip("AWAITING RUNTIME PR — witnessFacts.v2.services.mjs is not in the tree; the DB side of the contract is asserted by f-a2.engine-literal");
    return;
  }
  const runtime = derivedEngineId(RUNTIME_V2_SERVICES);
  assert.ok(runtime,
    "witnessFacts.v2.services.mjs exists but its WITNESS_MODEL_ID / WITNESS_ENGINE_VERSION are unreadable — DRIFT, not dormancy");
  assert.equal(runtime, dbLiteral,
    "the migration's hardcoded literal must string-equal the runtime's derived default");
});

// ===========================================================================
// CELL 10 — the corpus-derived expectation. The report's own A2 obligation
// (f-a1-corpus-measurement.md:71-72): "every complete single-page gross-printed invoice
// corroborates". A synthetic fixture cannot discharge it — that is the whole point.
// ===========================================================================

const CORPUS_FIXTURE = process.env.CLARA_F_A2_CORPUS_FIXTURE ?? "";

test("f-a2.corpus-shape ▣ a REAL document from the measured 33, replayed with a v2-shaped envelope, CORROBORATES", async (t) => {
  if (gate(t)) return;
  // AWAITING-LIVE-FIXTURE. The repo contains NO real corpus document's OCR — every invoice-shaped
  // fixture in this tree is synthetic and self-documented as such, and the corpus report
  // publishes headline numbers only, no per-document text. Committing a client's OCR to satisfy
  // a test would be the wrong fix. So the cell reads its fixture from a path the operator
  // supplies out-of-tree, and:
  //   - the variable UNSET  -> skip, loudly, naming the obligation (below);
  //   - the variable SET but the file missing or malformed -> HARD FAILURE, never a skip. A gate
  //     that degraded to a skip when pointed at a broken fixture would be the false green this
  //     whole cell exists to avoid.
  if (!CORPUS_FIXTURE) {
    t.diagnostic("F-A2 CORPUS OBLIGATION — this cell is a SKELETON. It has never run against a real document.");
    t.diagnostic("F-A2 CORPUS OBLIGATION — the repo holds no real corpus OCR (checked: every invoice fixture in");
    t.diagnostic("F-A2 CORPUS OBLIGATION — packages/db/tests and packages/runtime/tests is synthetic, and");
    t.diagnostic("F-A2 CORPUS OBLIGATION — docs/plan/completed/f-a1-corpus-measurement.md publishes only aggregates).");
    t.diagnostic("F-A2 CORPUS OBLIGATION — DISCHARGE IT WITH THE CEREMONY'S OWN RE-MEASURE, not with this cell:");
    t.diagnostic("F-A2 CORPUS OBLIGATION —   1. ceremony completes (DB first, runtime image second);");
    t.diagnostic("F-A2 CORPUS OBLIGATION —   2. RE-EXTRACT the 33 through clara.request_reextraction — a v1-era");
    t.diagnostic("F-A2 CORPUS OBLIGATION —      pair can NEVER corroborate through the arm (it fails locks 1 and 3);");
    t.diagnostic("F-A2 CORPUS OBLIGATION —   3. THEN measure, and publish THREE numbers: corroborated with the arm");
    t.diagnostic("F-A2 CORPUS OBLIGATION —      firing, corroborated without it, and still refusing with the failing");
    t.diagnostic("F-A2 CORPUS OBLIGATION —      lock NAMED per document.");
    t.diagnostic("F-A2 CORPUS OBLIGATION — To run this cell locally against one real document, export");
    t.diagnostic("F-A2 CORPUS OBLIGATION — CLARA_F_A2_CORPUS_FIXTURE=<path to a JSON file, shape documented below>.");
    t.skip("AWAITING-LIVE-FIXTURE — no real corpus document's OCR is available to this rig; see the diagnostics above");
    return;
  }
  // THE FIXTURE SHAPE, so an operator can build one from a real document without reading this
  // file's internals:
  //   { "total_cents": <int>, "currency_raw": "RM", "type_code_raw": "01",
  //     "regions": [ { "field_path": "...", "text_content": "...", "monetary_cents": <int|null>,
  //                    "locator": { "page": 1, "polygon": [ ... ] } }, … ],
  //     "regions_total": <int>, "pages": [1] }
  assert.ok(existsSync(CORPUS_FIXTURE),
    `CLARA_F_A2_CORPUS_FIXTURE is set to ${CORPUS_FIXTURE} but no such file exists — a pointed-at fixture that is missing is a FAILURE, never a skip`);
  const fx = JSON.parse(readFileSync(CORPUS_FIXTURE, "utf8"));
  for (const k of ["total_cents", "currency_raw", "type_code_raw", "regions", "regions_total"]) {
    assert.ok(Object.prototype.hasOwnProperty.call(fx, k),
      `the corpus fixture is missing "${k}" — a malformed fixture is a FAILURE, never a skip`);
  }
  assert.equal(fx.type_code_raw, "01", "the corpus cell is about INVOICES; a CN/DN is corroboration-ineligible by design");

  const c = world.clients.A1;
  const firm = await firmOf(c);
  await grantConsent(world.users.alice, { firm, client: c }).catch(() => {});
  const cited = await seedCitedDocument(world.users.alice, { firm, client: c, kind: "invoice" });
  const sha = await documentSha(cited.documentId);
  const base = witnessShape({
    fields: { "invoice.total": fx.total_cents, "invoice.currency": fx.currency_raw,
      "invoice.type_code": fx.type_code_raw },
    extraRegions: fx.regions.filter((r) => r.field_path !== "invoice.total"),
  });
  const shape = withWitnessV2(base, {
    coverage: {
      text: textCoverage({ regionsTotal: fx.regions_total, pages: fx.pages ?? [1] }),
      vision: visionCoverage({ inputSha256: sha }),
    },
    sst: sstSilent,
  });
  const pair = await landWitnessPair(cited.documentId, shape);
  const s = await evaluatePairV2(cited.documentId, pair.textId, pair.visionId);
  assert.equal(s.corroborated, true,
    "a real complete single-page gross-printed tax-silent invoice corroborates under the arm — the report's own stated expectation");
  assert.equal(s.tax_basis, "presumed_non_registrant");
  assert.equal(s.total_cents, fx.total_cents);
});

// ===========================================================================
// The vocabulary widening, read at the surface a reviewer checks: the answer roster.
// ===========================================================================

test("f-a2.answers-vocabulary the write boundary admits invoice.sst_registration beside the eleven and the two, and nothing else", async (t) => {
  if (gate(t)) return;
  const base = withWitnessV2(witnessShape({ fields: NIL }), {
    coverage: { text: textCoverage(), vision: visionCoverage({ inputSha256: "0".repeat(64) }) },
    sst: sstSilent,
  });
  assert.equal(await answersOk(base.textEnvelope, "text"), true, "the v2-shaped envelope is admitted");

  const withValue = structuredClone(base.textEnvelope);
  withValue.witness.answers[SST] = { state: "value", raw: "SST Reg. No. W10-1808-32000123" };
  assert.equal(await answersOk(withValue, "text"), true, "…in either state");

  const unknown = structuredClone(base.textEnvelope);
  unknown.witness.answers["invoice.sst_registration_no"] = { state: "not_printed" };
  assert.equal(await answersOk(unknown, "text"), false,
    "a near-miss spelling is still a refusal — a vocabulary that admits anything admits a typo");

  const beltDropped = structuredClone(base.textEnvelope);
  delete beltDropped.witness.answers["invoice.currency"];
  assert.equal(await answersOk(beltDropped, "text"), false,
    "the eleven belt answers are still REQUIRED — the widening added a name, it did not re-scope one");

  const sstDropped = structuredClone(base.textEnvelope);
  delete sstDropped.witness.answers[SST];
  assert.equal(await answersOk(sstDropped, "text"), true,
    "…while the new field stays OPTIONAL, which is what makes a runtime rollback degrade to v1 behaviour instead of wedging the lane");
});

test("f-a2.sst-is-answer-only the writer's CITATION vocabulary does NOT admit invoice.sst_registration — a binding constraint on the runtime half", async (t) => {
  if (gate(t)) return;
  // THE WIRE CONSTRAINT, ASSERTED RATHER THAN ASSUMED. clara.persist_witness_facts validates
  // citations against its OWN allowlist (the eleven belt paths plus SEVEN optional reference
  // paths) — a list this window deliberately does NOT widen. So a v2 read that CITES an SST
  // registration forfeits the WHOLE call with CLR10. That is correct and intended: lock 3 reads
  // the answer's STATE and never its rendering, so a citation would buy geometry nothing uses
  // while costing a change of record on a live writer. Recorded here so the runtime half reads
  // it as a contract rather than discovering it as an outage.
  const src = (await rootQuery(
    "select prosrc from pg_proc where oid='clara.persist_witness_facts(uuid,jsonb,jsonb,int)'::regprocedure")).rows[0].prosrc;
  assert.ok(src.includes("v_optional text[] := array['invoice.invoice_id','invoice.invoice_date',"),
    "the writer's optional CITATION roster is still the 0095 list");
  assert.ok(!src.includes("v_optional text[] := array['invoice.sst_registration'")
    && !/v_optional[\s\S]{0,400}invoice\.sst_registration/.test(src),
    "…and invoice.sst_registration is NOT in it: the field is ASKED AND ANSWERED, never cited");
});
