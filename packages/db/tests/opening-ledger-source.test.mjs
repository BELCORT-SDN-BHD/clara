// #656 — 导入并核对有来源的期初总账: THE OPENING GENERAL LEDGER GETS A SOURCE.
// Migration 0228_opening_ledger_source.sql · gate tests/opening-ledger-source-preintegration-gate.mjs
// · env var CLARA_ALLOW_MISSING_OPENING_LEDGER_SOURCE.
//
// WHAT THIS BATTERY IS FOR. Wave B built the whole opening lane — the registry, the targets
// table with its provenance CHECK, the parsed writer and its three fact assertions, the tie
// gates, the approval ceremony — and then nothing ever produced the evidence the
// document-primary half consumes. #656 wires `packages/runtime/lib/opening-tb-cells.mjs` in line
// at the OCR pass and gives the browser the entrance. These cells hold the DATABASE half of that
// claim: that the parsed writer is the ONLY road in for a tied seed, that every figure is
// re-derived from stored evidence rather than trusted, that a stale extraction is refused, and
// that the registry now says so out loud.
//
// EVERY ASSERTION UNDER TEST DRIVES A REAL LEAST-PRIVILEGED PERSONA through `humanQuery`
// (`set role clara_authenticated` + a real `request.jwt.claims`) or `roleQuery(ROLES.runtime)`.
// `rootQuery` appears ONLY for arranging fixtures and for reading facts a masked door
// deliberately never returns (row counts, catalog ACLs, the raw registry table) — each such use
// is labelled where it happens.
//
// EVERY `opening_tb.line` REGION FIXTURE IS CREATED THROUGH `clara.persist_document_extraction`
// (#857's rule, adopted here ahead of that ticket). A raw INSERT would let a cell prove the
// database accepts evidence the real producer could never have written: the writer's own
// chain-of-responsibility (`_derive_opening_region_fact` → the monetary corroboration →
// `ck_document_regions_opening_fact_0017`) is part of what is under test, not scaffolding
// around it.

import test, { before, after } from "node:test";
import assert from "node:assert/strict";

import {
  CLR, PG, ROLES, assertRaises, opk, rootQuery, humanQuery, roleQuery, ensureReady, endPool,
} from "./rig-fixtures.mjs";
import {
  buildWaveBWorld, onboardingClient, seedOpeningCoa, openingDoc, planRevision,
  createOpeningSeed, recordOpeningTarget, recordOpeningTargetsParsed, getOpeningDryrun,
  cancelOpeningSeed, draftOpeningItem, approveOpeningSeed, revMapOf, tbRegionText,
  freshResolution, keyedRes, WB_COA, BEE,
} from "./wave-b/wb-fixtures.mjs";

const MIGRATION = "0228_opening_ledger_source.sql";
/** The variable the gate module sets, written out in full. The pairing between a gate and its
 *  battery in this estate is BY THIS STRING, never by a shared file-name stem: measured, at
 *  least seven of the forty gate modules do not transform their own stem
 *  (`client-onboarding-identity-*` → `CLARA_ALLOW_MISSING_CLIENT_ONBOARDING_FACTS`,
 *  `fixed-asset-acquisition-*` → `…_FA_ACQUISITION`, `rs-guard-*` read by
 *  `name-only-guard.test.mjs`, and `document-capability-*` read by three batteries carrying
 *  three different stems). Deriving it from a file name is not a safe rule here. */
const GATE_ENV = "CLARA_ALLOW_MISSING_OPENING_LEDGER_SOURCE";
/** 0228's premise probe is NOT a `to_regprocedure` check — the file installs no function. It is
 *  the republication itself: 0228 raised the registry to version 2.
 *
 *  A FLOOR, NOT AN EQUALITY (ADV-03, riders wave 3 review round 1). The original probe demanded
 *  EXACTLY 2, and the registry has since been republished by later migrations — 0245 (#782) raised
 *  every one of the 240 rows to 3, and `document-capability-registry.test.mjs` pins that 3. On any
 *  database at 0245 or later this file's premise therefore read "0228 is not applied" and ALL
 *  TWELVE of its cells skipped: measured on clara_l06 under the full gate chain, 12 tests / 0 pass
 *  / 12 skipped. The battery went dark on the day a NEIGHBOURING migration republished the
 *  registry, which is precisely the shape a premise probe must not have. What 0228 actually
 *  guarantees is that the registry stands at ITS publication OR A LATER ONE, published as a single
 *  version across the whole table (0207's monotonic wall makes "or later" the only direction), and
 *  that is what this floor says. The precedent for re-basing a registry-version constant in ONE
 *  place with the reason beside it is `document-capability-registry.test.mjs`'s own note. */
const PUBLISHED_REGISTRY_VERSION = 2;

let ready = false;

before(async () => {
  ready = await ensureReady();
  if (!ready) return;
  // rootQuery: the registry table carries no app-role write and this is a premise probe, not an
  // assertion under test.
  const seen = (await rootQuery(
    "select min(registry_version)::int as v, count(distinct registry_version)::int as n from clara.document_capabilities")).rows[0];
  if (!(seen?.v >= PUBLISHED_REGISTRY_VERSION) || seen?.n !== 1) {
    if (process.env[GATE_ENV] !== "1") {
      throw new Error(
        `opening-ledger-source premise ${MIGRATION} is not applied (clara.document_capabilities publishes `
        + `version ${seen?.v} across ${seen?.n} distinct value(s), expected >= ${PUBLISHED_REGISTRY_VERSION} across 1) `
        + `and ${GATE_ENV} is unset -- this is a FOCUSED run and must fail loudly, not skip. Preload `
        + "./tests/opening-ledger-source-preintegration-gate.mjs for an estate sweep against a pre-0228 chain.",
      );
    }
    ready = false;
  }
});

after(async () => { await endPool(); });

function unready(t) {
  if (!ready) {
    t.skip(`rig not ready: ensureReady() found no draft_entry, or ${MIGRATION} is not applied`);
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------------------------
// Fixtures.
// ---------------------------------------------------------------------------------------------

let W = null;
/** The wave-B world, built once: firm A carries alice (bookkeeper), grace (bookkeeper #2),
 *  hana (admin) and bob (viewer), which is what the persona cells need. */
async function world() {
  if (!W) W = await buildWaveBWorld();
  return W;
}

/** A fresh onboarding client with an opening-capable chart, a filed opening_balance_doc and an
 *  OPEN, TIED seed. Everything below is built through audited writers. */
async function tiedScene(tag, { asOf = "2026-01-01" } = {}) {
  const w = await world();
  const { client, plan } = await onboardingClient(w.users.alice, `p656_${tag}_${opk("c")}`);
  await seedOpeningCoa(w.users.alice, client);
  const doc = await openingDoc(w.users.alice, { firm: w.firms.A, client });
  const receipt = await createOpeningSeed(w.users.alice, {
    client, plan, asOf, tieDocument: doc.documentId, tieSha256: doc.sha256,
  });
  return { w, firm: w.firms.A, client, plan, doc, asOf, seed: receipt.seed_id ?? receipt.id };
}

/** A `running` OCR task on `document`, the shape `clara.persist_document_extraction` settles.
 *  The binding CHECK wants a workflow_run_id and a started_at; 0038's settle path wants a
 *  reservation. rootQuery: this is the runtime's own plumbing, arranged as a fixture. */
async function runningOcrTask(firm, document, engineId) {
  const id = (await rootQuery(
    `insert into clara.document_processing_tasks(firm_id,document_id,engine_id,engine_config,
        version_n,lane,status,workflow_run_id,started_at)
     values ($1,$2,$3,'{}'::jsonb,
       (select coalesce(max(version_n),0)+1 from clara.document_processing_tasks
          where document_id=$2 and lane='ocr'),
       'ocr','running',$4,now()) returning id`,
    [firm, document, engineId, `p656-${opk("run")}`])).rows[0].id;
  await rootQuery(
    `insert into clara.processing_call_reservations(firm_id, task_id, state, pages_reserved)
     values ($1,$2,'reserved',1) on conflict do nothing`, [firm, id]);
  return id;
}

/** ONE producer run: persist `lines` as `opening_tb.line` regions through the real writer, in
 *  exactly the element shape `packages/runtime/lib/opening-tb-cells.mjs`'s `toRegion` emits —
 *
 *  THIS IS A MIRROR, AND THE MIRROR IS PINNED (#656 fix-round, adversarial A8). packages/db has
 *  no dependency on packages/runtime, so the element below is hand-built rather than produced —
 *  which means a `toRegion` drift would leave every `p656.tie.*` cell green while production
 *  broke. The drift is made loud next door instead: `packages/runtime/tests/opening-tb-produce
 *  .test.mjs`'s last cell states this exact key set and value grammar, and the World leg
 *  (`packages/runtime/tests/opening-ledger-source-e2e.mjs`) drives the REAL producer's bytes into
 *  the REAL writer end to end. If that pin reds, this literal is stale and must move with it.
 *
 *  `field_path: 'opening_tb.line'`, the canonical text, and `monetary_cents` as a DECIMAL STRING
 *  the database casts and corroborates against the text independently.
 *  Returns `{ extractionId, refs }` where `refs[line_key]` is the `{extraction_id, region_id}`
 *  an opening target must cite. */
async function produceTbRegions({ firm, doc, lines, engineId = null }) {
  // `ck_processing_task_lane_engine_f_a1_stmt` admits an `ocr` task's engine only when it reads
  // `azure-%` or `clara-fixture:%`. A rig run is not Azure, so it takes the estate's own fixture
  // escape hatch — the same one `document-regions-unique-field-path.test.mjs` uses.
  const engine = engineId ?? `clara-fixture:p656-producer-${opk("e")}`;
  const task = await runningOcrTask(firm, doc.documentId, engine);
  const regions = lines.map((l) => ({
    locator_kind: "page_polygon",
    locator: { page_number: 1, polygon: [0.45, 1.43, 0.95, 1.43, 0.95, 1.53, 0.45, 1.53] },
    field_path: "opening_tb.line",
    text_content: tbRegionText(l),
    engine_confidence: null,
    monetary_raw: ((l.debit_cents || l.credit_cents) / 100).toFixed(2),
    monetary_cents: String(l.debit_cents || l.credit_cents),
  }));
  await roleQuery(ROLES.runtime,
    "select clara.persist_document_extraction($1,'done',1,'{}'::jsonb,$2::jsonb,null,null,$3) as r",
    [task, JSON.stringify(regions), opk("p656-pde")]);
  const extractionId = (await rootQuery(
    "select id from clara.document_extractions where document_id=$1 and engine_id=$2 and engine_kind='ocr'",
    [doc.documentId, engine])).rows[0].id;
  const rows = (await rootQuery(
    `select id, text_content from clara.document_regions
      where extraction_id=$1 and field_path='opening_tb.line' order by created_at, id`, [extractionId])).rows;
  const refs = {};
  for (const l of lines) {
    const want = tbRegionText(l);
    const hit = rows.find((r) => r.text_content === want);
    assert.ok(hit, `the producer run did not persist a region for ${l.line_key} (${want})`);
    refs[l.line_key] = { extraction_id: extractionId, region_id: hit.id };
  }
  return { extractionId, refs };
}

/** The BEE trial balance, as the printed source states it. */
const BEE_LINES = [
  { line_key: "cash", account_code: WB_COA.cash, source_label: "Cash and bank", debit_cents: BEE.cashDr, credit_cents: 0 },
  { line_key: "re", account_code: WB_COA.re, source_label: "Retained earnings", debit_cents: BEE.reDr, credit_cents: 0 },
  { line_key: "sharecap", account_code: WB_COA.shareCap, source_label: "Share capital", debit_cents: 0, credit_cents: BEE.shareCr },
];

/** `lines` with their `extraction_ref`s bound — the payload the runtime writer takes. */
const withRefs = (lines, refs) => lines.map((l) => ({ ...l, extraction_ref: refs[l.line_key] }));

const claraReason = (err) => { try { return JSON.parse(err.detail ?? "{}").reason ?? null; } catch { return null; } };

const targetRows = (seed) => rootQuery(
  `select line_key, account_code, debit_cents, credit_cents, provenance_kind, document_id,
          source_sha256, extraction_ref, entered_by
     from clara.opening_tb_targets where seed_id=$1 order by line_key`, [seed]).then((r) => r.rows);

// ---------------------------------------------------------------------------------------------
// 1-2 — THE REGISTRY. AC1's census lands here, and it lands as a machine-readable row a
//       professional reads on `components/documents/capability-tiers.tsx`.
// ---------------------------------------------------------------------------------------------

test("p656.registry.prior_gl_operation: the corrected rows read back at 0228's publication or a later one with the capability they can actually deliver, and the missing browser entrance is NAMED", async (t) => {
  if (unready(t)) return;
  // rootQuery: `clara.document_capabilities` carries NO app-role write and the agent lane reads
  // it only through a DEFINER door; the table itself is a fixture-level read here. The
  // least-privileged read of the same fact is cell p656.registry.no_app_write below.
  const rows = (await rootQuery(
    `select format, document_kind, typed_facts, business_operation, registry_version, basis, limits
       from clara.document_capabilities
      where document_kind in ('prior_gl','opening_balance_doc') order by document_kind, format`)).rows;
  assert.equal(rows.length, 24, "twelve formats x two kinds");

  // opening_balance_doc — the six azure-di formats the in-line producer actually reads. This is
  // the row that must never ship ahead of its wiring (0191:217-218).
  const obd = rows.filter((r) => r.document_kind === "opening_balance_doc");
  const obdSupported = obd.filter((r) => r.business_operation === "supported");
  assert.deepEqual(obdSupported.map((r) => r.format).sort(),
    ["heic", "jpeg", "pdf", "png", "tiff", "webp"],
    "exactly the formats normalizeAzureLayout hands the producer may claim the operation");
  for (const r of obdSupported) {
    assert.equal(r.typed_facts, "supported", `${r.format}: the producer materialises opening_tb.line evidence`);
    assert.match(r.basis, /opening_tb\.line/, "the basis names the evidence the claim rests on");
    assert.match(r.basis, /record_opening_targets_parsed/, "…and the governed door that consumes it");
    assert.doesNotMatch(r.basis, /derives no typed facts/,
      "the old facts-router sentence cannot stand beside a supported typed_facts level");
  }

  // prior_gl — the operation is REAL and older than this ticket, and the gap is the ENTRANCE.
  const pg = rows.filter((r) => r.document_kind === "prior_gl");
  const named = pg.filter((r) => r.limits?.browser_entrance !== undefined);
  assert.deepEqual(named.map((r) => r.format).sort(),
    ["heic", "jpeg", "pdf", "png", "tiff", "webp", "xlsx"],
    "exactly the formats seeding-parse.mjs has a reader for carry the named gap");
  for (const r of named) {
    assert.equal(r.limits.browser_entrance, "absent",
      "`absent` is the word the face renders — never `unavailable`, which is not in this estate's vocabulary");
    assert.match(r.basis, /create_seeding_batch/, "the basis names the operation that exists today");
    assert.match(r.basis, /\/api\/seeding\/prepare/, "…and the entrance nobody has built");
    assert.doesNotMatch(r.basis, /Clara derives nothing to drive it/,
      "that sentence was the lie: a filed prior GL drives create_seeding_batch today");
  }

  // THE LEVEL IS HELD, AND HELD BY LAW RATHER THAN BY PREFERENCE. #656's brief rules prior_gl to
  // `supported`; the registry's own cell (document-capability-registry.test.mjs:278-284) and this
  // column's contract (0191:229-230) both reserve that level for a pair Clara can carry TYPED
  // FACTS into, and `prior_gl.line` has never been produced. This cell pins the measurement that
  // held it, so the residual cannot be quietly resolved by a later republication.
  const crossed = (await rootQuery(
    `select format, document_kind from clara.document_capabilities
      where business_operation='supported' and typed_facts<>'supported'`)).rows;
  assert.deepEqual(crossed, [], "no business operation may be promised over facts that do not exist");

  // The whole registry publishes exactly ONE version at a time, and it stands at 0228's
  // publication or a later one — never below it (0207's monotonic wall, exercised just below).
  const v = (await rootQuery(
    `select count(*)::int as n, count(distinct registry_version)::int as versions,
            min(registry_version)::int as v from clara.document_capabilities`)).rows[0];
  assert.equal(v.n, 240, "0228 inserts and deletes nothing");
  assert.equal(v.versions, 1, "the registry publishes exactly one version at a time");
  assert.ok(v.v >= PUBLISHED_REGISTRY_VERSION,
    `the registry stands at ${v.v}, below 0228's own publication ${PUBLISHED_REGISTRY_VERSION}`);

  // A DOWNGRADE is still refused by 0207's wall — the republication rode the wall, it did not
  // step around it (#846: UPDATE that raises, never DELETE-then-INSERT).
  const err = await (async () => {
    try {
      await rootQuery(
        "update clara.document_capabilities set registry_version=1 where format='pdf' and document_kind='opening_balance_doc'");
      return null;
    } catch (e) { return e; }
  })();
  assert.ok(err, "a backwards registry_version was accepted");
  assert.equal(err.code, "CLR08", `expected the immutability-family code, got ${err.code}`);
  assert.equal(claraReason(err), "registry_version_monotone");
});

test("p656.registry.no_app_write: the republication granted nothing -- SELECT for the human lane alone, and the agent still reads the registry only through the DEFINER door", async (t) => {
  if (unready(t)) return;
  const w = await world();

  // The least-privileged human CAN read the registry (that is what the face renders from).
  const seen = await humanQuery(w.users.alice,
    "select business_operation, limits from clara.document_capabilities where format='pdf' and document_kind='opening_balance_doc'");
  assert.equal(seen.rows[0].business_operation, "supported",
    "a bookkeeper reads the corrected verdict through clara_authenticated's own SELECT");

  // …and cannot write it, in any direction. This is the cell that catches a republication
  // written with a convenience grant.
  for (const [label, sql] of [
    ["UPDATE", "update clara.document_capabilities set registry_version=9 where format='pdf' and document_kind='invoice'"],
    ["DELETE", "delete from clara.document_capabilities where format='pdf' and document_kind='invoice'"],
    ["INSERT", "insert into clara.document_capabilities(format,document_kind,mime_type,custody,byte_extraction,typed_facts,business_operation,registry_version,basis) values ('zzz','invoice','application/zzz','supported','supported','supported','supported',2,'probe')"],
  ]) {
    await assertRaises(PG.insufficientPrivilege, () => humanQuery(w.users.alice, sql),
      `clara_authenticated must hold no ${label} on the capability registry`);
  }

  // The runtime and the agent read lanes hold NOTHING on the table at all.
  for (const role of [ROLES.runtime, ROLES.agentRo]) {
    await assertRaises(PG.insufficientPrivilege,
      () => roleQuery(role, "select 1 from clara.document_capabilities limit 1"),
      `${role} must reach the vocabulary only through clara._document_capability`);
  }

  // rootQuery: a catalog ACL is a fact no door returns.
  const acl = (await rootQuery(
    `select has_function_privilege('clara_agent_ro','clara._document_capability(text,text)','EXECUTE') as agent,
            has_function_privilege('clara_authenticated','clara._document_capability(text,text)','EXECUTE') as human`)).rows[0];
  assert.equal(acl.agent, true, "the agent lane's only road to the registry must still be open");
  assert.equal(acl.human, true);
});

// ---------------------------------------------------------------------------------------------
// 3-6 — THE TIE. Why the producer is the only road in, and why the database still proves every
//       figure itself.
// ---------------------------------------------------------------------------------------------

test("p656.tie.parsed_writer_only: on a TIED seed the human target door refuses, and the parsed writer is runtime-only", async (t) => {
  if (unready(t)) return;
  const sc = await tiedScene("writeronly");

  // The human keyed door is walled the moment a seed carries a tie document: a keyed figure on a
  // document-sourced basis would be a number nobody can trace to the page it came from.
  const err = await assertRaises(CLR.badRequest === "CLR10" ? "CLR31" : "CLR31",
    () => recordOpeningTarget(sc.w.users.alice, {
      seed: sc.seed,
      line: { line_key: "cash", account_code: WB_COA.cash, source_label: "Cash and bank", debit_cents: 1000, credit_cents: 0 },
    }),
    "record_opening_target on a tied seed");
  assert.equal(claraReason(err), "parsed_target_writer_required",
    "the refusal must NAME the writer that is required, so the surface can say which road to take");

  // …and the road it names is closed to the browser: the parsed writer is clara_runtime's alone.
  await assertRaises(PG.insufficientPrivilege, () => humanQuery(sc.w.users.alice,
    "select clara.record_opening_targets_parsed($1,'[]'::jsonb,$2,$3)", [sc.seed, sc.doc.documentId, opk("p656-denied")]),
    "record_opening_targets_parsed as clara_authenticated");

  // The runtime lane holds it, and a real producer run goes through.
  const { refs } = await produceTbRegions({ firm: sc.firm, doc: sc.doc, lines: BEE_LINES });
  const r = await recordOpeningTargetsParsed({
    seed: sc.seed, document: sc.doc.documentId, lines: withRefs(BEE_LINES, refs),
  });
  assert.equal(Number(r.targets_recorded ?? 0), BEE_LINES.length);

  const rows = await targetRows(sc.seed);
  assert.equal(rows.length, 3);
  for (const row of rows) {
    assert.equal(row.provenance_kind, "document", "a parsed target is document-sourced by construction");
    assert.equal(row.document_id, sc.doc.documentId);
    assert.equal(row.source_sha256, sc.doc.sha256, "the target carries the bytes it was read from");
    assert.ok(row.extraction_ref?.region_id, "…and the exact region a human can open");
    assert.equal(row.entered_by, null, "ck_opening_tb_targets_provenance: a document row carries no keyer");
  }
});

test("p656.tie.fact_must_match: an account, a cents figure or a side that disagrees with the stored region is refused BY FIELD, and records nothing", async (t) => {
  if (unready(t)) return;
  const sc = await tiedScene("factmatch");
  const { refs } = await produceTbRegions({ firm: sc.firm, doc: sc.doc, lines: BEE_LINES });

  const cases = [
    ["opening_target_account_mismatch", (l) => ({ ...l, account_code: WB_COA.sales })],
    ["opening_target_cents_mismatch", (l) => ({ ...l, debit_cents: l.debit_cents + 1 })],
    ["opening_target_sign_mismatch", (l) => ({ ...l, debit_cents: 0, credit_cents: l.debit_cents })],
  ];
  for (const [reason, mutate] of cases) {
    const lines = withRefs(BEE_LINES, refs).map((l) => (l.line_key === "cash" ? mutate(l) : l));
    const err = await assertRaises(CLR.badRequest === "CLR10" ? "CLR31" : "CLR31",
      () => recordOpeningTargetsParsed({ seed: sc.seed, document: sc.doc.documentId, lines, opKey: opk(`p656-${reason}`) }),
      `a ${reason} payload`);
    assert.equal(claraReason(err), reason,
      "the refusal names the FIELD that disagreed — a caller must not have to diff the numbers itself");
    // ASSERT BY COUNTING ROWS, never by matching a message: the claim is that nothing landed.
    assert.equal((await targetRows(sc.seed)).length, 0,
      `${reason}: a refused parse must record no target at all (all-or-nothing, F-H5)`);
  }

  // The honest payload still goes through afterwards — the refusals above left no debris.
  await recordOpeningTargetsParsed({
    seed: sc.seed, document: sc.doc.documentId, lines: withRefs(BEE_LINES, refs), opKey: opk("p656-clean"),
  });
  assert.equal((await targetRows(sc.seed)).length, 3);
});

test("p656.tie.stale_extraction: a target citing a superseded or non-authoritative run is refused, and a RE-RUN of the producer makes the same cite good again", async (t) => {
  if (unready(t)) return;
  const sc = await tiedScene("stale");
  const first = await produceTbRegions({ firm: sc.firm, doc: sc.doc, lines: BEE_LINES });

  // A SECOND producer run on the same document. The 0017 authority trigger hands the pointer to
  // the newest done extraction — so the FIRST run's regions are now neither authoritative nor
  // current, and a target still citing them must not be recorded.
  const second = await produceTbRegions({ firm: sc.firm, doc: sc.doc, lines: BEE_LINES });
  assert.notEqual(second.extractionId, first.extractionId);

  const err = await assertRaises("CLR31", () => recordOpeningTargetsParsed({
    seed: sc.seed, document: sc.doc.documentId, lines: withRefs(BEE_LINES, first.refs), opKey: opk("p656-stale"),
  }), "a target citing the superseded first run");
  // WHICH WALL, EXACTLY (#656 fix-round, adversarial A7). The disjunction this cell used to carry
  // recorded neither. MEASURED on the rig: the second producer run sets `superseded_by` on the
  // first, and `_assert_opening_extraction_ref` checks `status<>'done' or superseded_by is not
  // null` BEFORE it compares the document's authoritative pointer — so a re-read always refuses
  // `extraction_not_accepted`. `stale_extraction_version` is the OTHER wall: a run that is itself
  // current and unsuperseded while `documents.authoritative_extraction_id` names another. Two
  // different mechanisms; a cell that accepted either would pass if a future change swapped them.
  assert.equal(claraReason(err), "extraction_not_accepted",
    `the supersession wall fires first (0017 _assert_opening_extraction_ref), got ${claraReason(err)}`);
  assert.equal((await targetRows(sc.seed)).length, 0, "nothing is recorded against a stale citation");

  // The NEWEST run's regions are accepted — which is the fact that makes re-running the producer
  // the recovery path rather than a dead end. THIS is the cell that proves the producer and the
  // database agree about which extraction wins (#656 Risk 2 / p656.m2).
  const ok = await recordOpeningTargetsParsed({
    seed: sc.seed, document: sc.doc.documentId, lines: withRefs(BEE_LINES, second.refs), opKey: opk("p656-fresh"),
  });
  assert.equal(Number(ok.targets_recorded ?? 0), 3);
  // rootQuery: the authoritative pointer is documents-table plumbing no door returns.
  const pointer = (await rootQuery(
    "select authoritative_extraction_id from clara.documents where id=$1", [sc.doc.documentId])).rows[0];
  assert.equal(pointer.authoritative_extraction_id, second.extractionId,
    "the newest done extraction is the authoritative one, kind-blind (0017:1506-1546)");
});

test("p656.tie.approve_rebinds: approve_opening_seed re-runs the fact assertion over every target, so evidence mutated after the parse refuses the approval", async (t) => {
  if (unready(t)) return;
  const sc = await tiedScene("rebind");
  const { refs } = await produceTbRegions({ firm: sc.firm, doc: sc.doc, lines: BEE_LINES });
  await recordOpeningTargetsParsed({ seed: sc.seed, document: sc.doc.documentId, lines: withRefs(BEE_LINES, refs) });

  const res = () => freshResolution(sc.w.users.alice, sc.client, { subjectKind: "document", subjectId: sc.doc.documentId });
  const drafts = [
    await draftOpeningItem(sc.w.users.alice, {
      client: sc.client, seed: sc.seed, resolution: res(), document: sc.doc.documentId, sha256: sc.doc.sha256,
      item: { item_kind: "gl_balance", item_key: "gl:cash" },
      lines: [{ account_code: WB_COA.cash, debit_cents: BEE.cashDr, credit_cents: 0 }],
    }),
    await draftOpeningItem(sc.w.users.alice, {
      client: sc.client, seed: sc.seed, resolution: res(), document: sc.doc.documentId, sha256: sc.doc.sha256,
      item: { item_kind: "equity_net", item_key: "eq:net", amount_cents: -BEE.reDr },
    }),
    await draftOpeningItem(sc.w.users.alice, {
      client: sc.client, seed: sc.seed, resolution: res(), document: sc.doc.documentId, sha256: sc.doc.sha256,
      item: { item_kind: "gl_balance", item_key: "gl:sharecap" },
      lines: [{ account_code: WB_COA.shareCap, debit_cents: 0, credit_cents: BEE.shareCr }],
    }),
  ];

  // MOVE THE EVIDENCE OUT FROM UNDER THE TARGETS, through an audited path and not a raw write:
  // `clara.document_regions` is append-only (`t_document_regions_append_only`), so nothing in this
  // estate can edit a region after the fact — measured, when this cell's first draft tried. What
  // DOES happen in production is the ordinary thing: the document is read again. A second producer
  // run supersedes the first extraction and takes the authoritative pointer
  // (`_tf_set_authoritative_extraction_0017`, kind-blind), so every target recorded against the
  // first run now cites a run that is no longer authoritative.
  await produceTbRegions({ firm: sc.firm, doc: sc.doc, lines: BEE_LINES });

  const rev = await planRevision(sc.plan);
  const err = await assertRaises("CLR31", () => approveOpeningSeed(sc.w.users.hana, {
    seed: sc.seed, planRevision: rev, tieSha256: sc.doc.sha256, entryRevisions: revMapOf(drafts),
  }), "approve over evidence a later run superseded");
  // The same wall, one layer later (A7): the approval re-runs `_assert_opening_target_fact` over
  // EVERY target (0017:3884-3891), so the superseded citation refuses AT APPROVAL and not only at
  // parse time — and it refuses with the supersession token, exactly as at parse time.
  assert.equal(claraReason(err), "extraction_not_accepted",
    `a superseded citation refuses at approval too, got ${claraReason(err)}`);

  // Assert nothing was approved by COUNTING rows.
  const state = (await rootQuery(
    `select (select state from clara.opening_seed_registry where id=$1) as state,
            (select count(*)::int from clara.journal_entries where client_id=$2 and status='approved') as approved,
            (select count(*)::int from clara.opening_seed_approvals where seed_id=$1) as approvals`,
    [sc.seed, sc.client])).rows[0];
  assert.equal(state.state, "open", "a refused approval leaves the basis open");
  assert.equal(state.approved, 0);
  assert.equal(state.approvals, 0);
});

// ---------------------------------------------------------------------------------------------
// 7-8 — THE TIE GATES. UNKNOWN is never PASS, and each arm keeps its own token.
// ---------------------------------------------------------------------------------------------

test("p656.tie.unmapped_blocks: on a DOCUMENT-sourced basis an unmapped line cannot be RECORDED at all -- the null-account `unmapped` state belongs to the keyed lane alone", async (t) => {
  if (unready(t)) return;
  const sc = await tiedScene("unmapped");

  // THE MEASURED SHAPE OF "UNMAPPED" ON THE DOCUMENT LANE, and it is not what the keyed lane's
  // nullable `account_code` suggests. TWO walls stand between a printed line and a target row:
  //   · `_assert_opening_target_fact` refuses unless the target's account is EXACTLY the account
  //     the stored region states -- so a parsed target can never carry a NULL account; and
  //   · `fk_opening_tb_targets_account (client_id, account_code) -> clara.coa_accounts` refuses
  //     unless that account already exists in THIS client's chart.
  // Together they mean a document-sourced target is always both source-exact and chart-present,
  // and the intermediate state the keyed lane has -- "recorded, not yet mapped" -- is structurally
  // unreachable here. That is a product fact, not a test detail: the first real trial balance a
  // firm hands over will name accounts its chart has not got, and the whole document is refused.
  const UNKNOWN = "777-XYZ";
  const lines = BEE_LINES.map((l) => (l.line_key === "re"
    ? { ...l, account_code: UNKNOWN, source_label: "Retained earnings" } : l));
  const { refs } = await produceTbRegions({ firm: sc.firm, doc: sc.doc, lines });

  const fk = await assertRaises(PG.foreignKeyViolation, () => recordOpeningTargetsParsed({
    seed: sc.seed, document: sc.doc.documentId, lines: withRefs(lines, refs), opKey: opk("p656-unknownacct"),
  }), "a parsed target naming an account the chart does not carry");
  assert.equal(fk.constraint, "fk_opening_tb_targets_account",
    "the refusal is the chart foreign key, and it arrives UNTYPED -- no CLR code, no detail.reason");
  assert.equal((await targetRows(sc.seed)).length, 0,
    "all-or-nothing: one unknown account forfeits the whole document, exactly like an unreadable row");

  // A NULL account is refused too, by the fact assertion rather than the key -- so neither road
  // reaches the keyed lane's `unmapped` state.
  const nulled = withRefs(BEE_LINES, refs).map((l) => (l.line_key === "cash" ? { ...l, account_code: null } : l));
  const refusal = await assertRaises("CLR31", () => recordOpeningTargetsParsed({
    seed: sc.seed, document: sc.doc.documentId, lines: nulled, opKey: opk("p656-nullacct"),
  }), "a parsed target with no account at all");
  assert.equal(claraReason(refusal), "opening_target_account_mismatch");

  // THE KEYED HALF, on its own untied basis: there a null account IS allowed, the dry-run NAMES
  // it, and `_assert_opening_tie`'s second arm refuses the approval. This is the only lane on
  // which `unmapped_labels` is ever non-empty, which is what the face must be built against --
  // a surface that read an empty `unmapped_labels` on a DOCUMENT basis as "everything is mapped"
  // would paint exactly C-25's quiet pass.
  const w = sc.w;
  const keyed = await onboardingClient(w.users.alice, `p656_keyed_${opk("c")}`);
  await seedOpeningCoa(w.users.alice, keyed.client);
  const keyedReceipt = await createOpeningSeed(w.users.alice, {
    client: keyed.client, plan: keyed.plan, asOf: sc.asOf, tieDocument: null, tieSha256: null,
  });
  const keyedSeed = keyedReceipt.seed_id ?? keyedReceipt.id;
  await recordOpeningTarget(w.users.alice, {
    seed: keyedSeed,
    line: { line_key: "re", account_code: null, source_label: "Retained earnings", debit_cents: BEE.reDr, credit_cents: 0 },
  });
  const keyedDryrun = await getOpeningDryrun(w.users.alice, { seed: keyedSeed });
  assert.equal(keyedDryrun.unmapped_labels.length, 1,
    "a KEYED target may be recorded before its account is chosen, and the dry-run names it");
  assert.equal(keyedDryrun.unmapped_labels[0].source_label, "Retained earnings",
    "...by the label the source printed, not by an account we do not have");

  // ONE drafted item, so the approval gets PAST the entry-count guard 0018 SS3b spliced in front
  // of the tie assertion (with none, it refuses `revision_mismatch` and proves nothing about the
  // tie -- measured, on this cell's first run).
  // The keyed lane is SEED-BOUND: its attribution comes from `record_opening_keyed_resolution`
  // for this exact basis, and a keyed draft may NOT cite a document ("keyed opening fallback
  // cannot mix document provenance" -- measured, when this cell first tried a filed one). That
  // is the same all-or-nothing honesty the document lane has, from the other side.
  const keyedDraft = await draftOpeningItem(w.users.alice, {
    client: keyed.client, seed: keyedSeed,
    resolution: keyedRes(w.users.alice, { client: keyed.client, seed: keyedSeed }),
    item: { item_kind: "gl_balance", item_key: "gl:cash" },
    lines: [{ account_code: WB_COA.cash, debit_cents: BEE.cashDr, credit_cents: 0 }],
  });
  const rev = await planRevision(keyed.plan);
  const err = await assertRaises("CLR31", () => approveOpeningSeed(w.users.hana, {
    seed: keyedSeed, planRevision: rev, tieSha256: null, entryRevisions: revMapOf([keyedDraft]),
  }), "approve a basis carrying an unmapped line");
  assert.equal(claraReason(err), "tie_mismatch",
    "an unmapped line is a tie failure, and the face must name the same token the database does");
});

test("p656.tie.obe_not_nil: a basis that TIES but leaves opening-balance-equity nonzero refuses with its OWN token, never tie_mismatch", async (t) => {
  if (unready(t)) return;
  // REBUILT (#656 fix-round, adversarial A2). The first cut of this cell drafted ONE item against
  // a three-line target set, so `_assert_opening_tie`'s DELTA arm fired first and the cell
  // asserted `tie_mismatch` under a name promising `obe_not_nil` — a cell whose title asserted the
  // negation of its assertion, and the token it claimed to own went unexercised in this battery.
  //
  // THE FIXTURE THAT ACTUALLY REACHES THE OBE ARM. `_assert_opening_tie` refuses `tie_mismatch`
  // when a target is unmatched by a drafted item, and `_opening_seed_deltas` EXCLUDES the
  // opening-balance-equity account from that comparison. So a basis whose every non-OBE account
  // matches its target exactly passes the delta arm — and if the document's own two figures do
  // not balance each other, the drafted entries' plug lands on OBE and the SECOND arm fires. That
  // is the real-world shape: a printed source whose columns do not sum, faithfully transcribed.
  const sc = await tiedScene("obe");
  const SHORT_LINES = [
    { line_key: "cash", account_code: WB_COA.cash, source_label: "Cash and bank", debit_cents: BEE.cashDr, credit_cents: 0 },
    // The retained-earnings line of the BEE trial balance is NOT among the targets: the two
    // figures that are do not sum, which is what puts a residue on opening-balance-equity.
    { line_key: "sharecap", account_code: WB_COA.shareCap, source_label: "Share capital", debit_cents: 0, credit_cents: BEE.shareCr },
  ];
  const { refs } = await produceTbRegions({ firm: sc.firm, doc: sc.doc, lines: SHORT_LINES });
  await recordOpeningTargetsParsed({ seed: sc.seed, document: sc.doc.documentId, lines: withRefs(SHORT_LINES, refs) });

  const res = () => freshResolution(sc.w.users.alice, sc.client, { subjectKind: "document", subjectId: sc.doc.documentId });
  const drafts = [
    await draftOpeningItem(sc.w.users.alice, {
      client: sc.client, seed: sc.seed, resolution: res(), document: sc.doc.documentId, sha256: sc.doc.sha256,
      item: { item_kind: "gl_balance", item_key: "gl:cash" },
      lines: [{ account_code: WB_COA.cash, debit_cents: BEE.cashDr, credit_cents: 0 }],
    }),
    await draftOpeningItem(sc.w.users.alice, {
      client: sc.client, seed: sc.seed, resolution: res(), document: sc.doc.documentId, sha256: sc.doc.sha256,
      item: { item_kind: "gl_balance", item_key: "gl:sharecap" },
      lines: [{ account_code: WB_COA.shareCap, debit_cents: 0, credit_cents: BEE.shareCr }],
    }),
  ];

  // EVERY TARGET IS MATCHED — the delta arm has nothing to refuse.
  const dryrun = await getOpeningDryrun(sc.w.users.alice, { seed: sc.seed });
  for (const d of dryrun.deltas ?? []) {
    assert.equal(Number(d.delta_debit), 0, `${d.account_code} differs from its target`);
    assert.equal(Number(d.delta_credit), 0, `${d.account_code} differs from its target`);
  }
  assert.equal(Number(dryrun.obe_net_cents), BEE.shareCr - BEE.cashDr,
    "the residue lands on opening-balance-equity, cent for cent — the DB's own signed difference "
    + "is what the face renders, never client arithmetic");

  const rev = await planRevision(sc.plan);
  const err = await assertRaises("CLR31", () => approveOpeningSeed(sc.w.users.hana, {
    seed: sc.seed, planRevision: rev, tieSha256: sc.doc.sha256, entryRevisions: revMapOf(drafts),
  }), "approve a basis that ties but leaves OBE nonzero");
  // C-25's own lesson: the face once painted a quiet pass and named the WRONG token for this arm.
  // The two arms are DIFFERENT facts and a professional must be told which one stopped them.
  assert.equal(claraReason(err), "obe_not_nil",
    `the OBE arm owns its own token (0017 _assert_opening_tie), got ${claraReason(err)}`);

  // Nothing was approved, and the basis stays open.
  const state = (await rootQuery(
    `select (select state from clara.opening_seed_registry where id=$1) as state,
            (select count(*)::int from clara.opening_seed_approvals where seed_id=$1) as approvals`,
    [sc.seed])).rows[0];
  assert.equal(state.state, "open");
  assert.equal(state.approvals, 0);
});

// ---------------------------------------------------------------------------------------------
// 9-11 — ONE BASIS PER CLIENT, REPLAY, AND THE FLOORS.
// ---------------------------------------------------------------------------------------------

test("p656.seed.duplicate_and_cancelled: a second live basis is refused, and cancelling an EMPTY one frees the slot", async (t) => {
  if (unready(t)) return;
  const sc = await tiedScene("dup");
  const doc2 = await openingDoc(sc.w.users.alice, { firm: sc.firm, client: sc.client });

  const err = await assertRaises("CLR31", () => createOpeningSeed(sc.w.users.alice, {
    client: sc.client, plan: sc.plan, asOf: sc.asOf, tieDocument: doc2.documentId, tieSha256: doc2.sha256,
  }), "a second live opening basis");
  assert.equal(claraReason(err), "duplicate_seed",
    "uq_opening_seed_registry_once: one live basis per client, and the refusal says which rule it is");

  // Cancelling an EMPTY basis frees the slot — the cancelled-recovery path a human needs after
  // tying the wrong document.
  await cancelOpeningSeed(sc.w.users.hana, { seed: sc.seed, reason: "#656 rig: wrong tie document" });
  const again = await createOpeningSeed(sc.w.users.alice, {
    client: sc.client, plan: sc.plan, asOf: sc.asOf, tieDocument: doc2.documentId, tieSha256: doc2.sha256,
  });
  assert.ok(again.seed_id ?? again.id, "a cancelled basis releases the partial unique slot");

  // rootQuery: a row count is a fact the door never returns.
  const n = (await rootQuery(
    "select count(*)::int as n from clara.opening_seed_registry where client_id=$1 and state<>'cancelled'",
    [sc.client])).rows[0].n;
  assert.equal(n, 1, "exactly one live basis stands");
});

test("p656.seed.replay: the parse op key replays byte-identically and records no second target", async (t) => {
  if (unready(t)) return;
  const sc = await tiedScene("replay");
  const { refs } = await produceTbRegions({ firm: sc.firm, doc: sc.doc, lines: BEE_LINES });
  const lines = withRefs(BEE_LINES, refs);
  // The STABLE key the route mints: `openingparse:<seed>:<document>` (opening-parse.mjs:97-99).
  // A retried POST must not double the basis.
  const key = `openingparse:${sc.seed}:${sc.doc.documentId}`;
  const first = await recordOpeningTargetsParsed({ seed: sc.seed, document: sc.doc.documentId, lines, opKey: key });
  const second = await recordOpeningTargetsParsed({ seed: sc.seed, document: sc.doc.documentId, lines, opKey: key });
  assert.deepEqual(second, first, "a replay returns the ORIGINAL receipt, byte-identically");
  assert.equal((await targetRows(sc.seed)).length, 3, "…and writes no second set of targets");
});

test("p656.roles.viewer_denied: a viewer cannot create, parse or approve, and a foreign firm's basis is indistinguishable from a missing one", async (t) => {
  if (unready(t)) return;
  const sc = await tiedScene("floors");
  const w = sc.w;

  // The viewer floor. `carol` is firm A's VIEWER in the base world -- `bob` is bookkeeper #2,
  // measured after this cell's first draft used bob and the create SUCCEEDED. The CREATE probe runs against a
  // client with NO live basis, so the refusal under test is unambiguously the role floor and not
  // `uq_opening_seed_registry_once`'s duplicate_seed — a guard-ordering trap this cell walked into
  // on its first run and which would have made a CLR31 read as proof of a CLR04.
  const fresh = await onboardingClient(w.users.alice, `p656_floor_${opk("c")}`);
  await seedOpeningCoa(w.users.alice, fresh.client);
  const freshDoc = await openingDoc(w.users.alice, { firm: sc.firm, client: fresh.client });
  await assertRaises(CLR.authz, () => createOpeningSeed(w.users.carol, {
    client: fresh.client, plan: fresh.plan, asOf: sc.asOf,
    tieDocument: freshDoc.documentId, tieSha256: freshDoc.sha256,
  }), "create_opening_seed as a viewer");
  const rev = await planRevision(sc.plan);
  await assertRaises(CLR.authz, () => approveOpeningSeed(w.users.carol, {
    seed: sc.seed, planRevision: rev, tieSha256: sc.doc.sha256, entryRevisions: {},
  }), "approve_opening_seed as a viewer");

  // NO EXISTENCE ORACLE. Firm B's dave asking about firm A's basis, and anyone asking about an
  // invented uuid, must be refused the SAME WAY — a different code or reason would leak that a
  // basis exists for a client he cannot see.
  const foreign = await assertRaises("CLR11",
    () => getOpeningDryrun(w.users.dave, { seed: sc.seed }), "a foreign firm's basis");
  const missing = await assertRaises("CLR11",
    () => getOpeningDryrun(w.users.dave, { seed: "00000000-0000-4000-8000-000000000000" }), "an invented basis");
  assert.equal(foreign.code, missing.code);
  assert.equal(claraReason(foreign), claraReason(missing),
    "the two refusals must be byte-identical in the fields a caller can read");
});

// ---------------------------------------------------------------------------------------------
// 12 — THE PERIOD WALL. The pin for p656.m3, which is the measurement that decided 0228 would
//      recut nothing.
// ---------------------------------------------------------------------------------------------

test("p656.period.closed_fy: an opening basis dated into a CLOSED fiscal year is refused at the DRAFT, by the lines wall, naming the fiscal year", async (t) => {
  if (unready(t)) return;
  const sc = await tiedScene("closedfy");
  const { refs } = await produceTbRegions({ firm: sc.firm, doc: sc.doc, lines: BEE_LINES });
  await recordOpeningTargetsParsed({ seed: sc.seed, document: sc.doc.documentId, lines: withRefs(BEE_LINES, refs) });

  // rootQuery: no audited writer in scope here opens a fiscal year, and the wave-b fixtures build
  // none at all — which is precisely why this lane had never met the wall before #656.
  await rootQuery(
    `insert into clara.fiscal_years(firm_id,client_id,label,starts_on,ends_on,ordinal,status,fy_end_source,opened_by)
     values ($1,$2,'FY2026','2026-01-01','2026-12-31',1,'closed','asserted',$3)`,
    [sc.firm, sc.client, sc.w.users.alice]);

  const res = () => freshResolution(sc.w.users.alice, sc.client, { subjectKind: "document", subjectId: sc.doc.documentId });
  const err = await assertRaises("CLR19", () => draftOpeningItem(sc.w.users.alice, {
    client: sc.client, seed: sc.seed, resolution: res(), document: sc.doc.documentId, sha256: sc.doc.sha256,
    item: { item_kind: "gl_balance", item_key: "gl:cash" },
    lines: [{ account_code: WB_COA.cash, debit_cents: BEE.cashDr, credit_cents: 0 }],
  }), "drafting an opening item into a closed fiscal year");

  // MEASURED, not read: the wall that fires is `clara._tf_period_wall_lines()` on
  // `clara.journal_lines`, at the DRAFT — not `t_period_wall` at the approval, and not a guard
  // inside `approve_opening_seed`, which has none of its own. That measurement is what made
  // 0228's conditional narrow recut unnecessary; this cell is its pin.
  assert.equal(claraReason(err), "write_into_closed_period");
  assert.match(err.message, /closed fiscal year FY2026/,
    "the refusal names the FISCAL YEAR — and, as a named residual, never the opening basis");
  assert.match(err.message, /lines may not change/,
    "…and it is the LINES wall, which is why the approval is never the first refusal");

  // Nothing was drafted. Counting rows, never matching a message.
  const n = (await rootQuery(
    "select count(*)::int as n from clara.journal_entries where client_id=$1", [sc.client])).rows[0].n;
  assert.equal(n, 0, "a refused draft leaves no entry behind");
});
