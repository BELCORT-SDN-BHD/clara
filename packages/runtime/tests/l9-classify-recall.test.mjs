// H-04 — the classifier recall harness, the sharpened bank_statement definition, and the
// ENGINE-ID FINDING that blocked the provenance bump. PURE UNIT: no model, no DB.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { CLASSIFY_KINDS, DB_REFUSED_KINDS, SYSTEM_PROMPT, classifyDocumentText } from "../lib/classify-llm.mjs";
import { CLASSIFY_ENGINE_ID } from "../lib/classify.mjs";
import { CONFIDENCE_GATE, builtinFixtures, promptSha, readManifest, score, stubModel } from "../scripts/measure-classify-recall.mjs";

const RUNTIME_ROOT = fileURLToPath(new URL("..", import.meta.url));
const REPO_ROOT = fileURLToPath(new URL("../../..", import.meta.url));
const FIXTURES = join(RUNTIME_ROOT, "tests", "fixtures", "classify");

/** The prompt is a wrapped array joined with newlines, so a sentence that reads as one phrase
 *  is split across lines and indented. Pin PHRASES, not line breaks — an assertion that
 *  depends on where a line happens to wrap reds on a re-wrap that changes nothing. */
const flat = (s) => s.replace(/\s+/g, " ");

// ---------------------------------------------------------------------------
// 1. The prompt's own shape — the definition can never fall out of sync with the enum.
// ---------------------------------------------------------------------------

test("H-04: EVERY CLASSIFY_KINDS member has a definition line in the prompt", () => {
  // The 17 definitions are hand-kept beside the enum: a kind added to the enum with no
  // definition is SILENT — the model may return it and has been told nothing about it.
  const missing = CLASSIFY_KINDS.filter((k) => !SYSTEM_PROMPT.includes(`- ${k}:`));
  assert.deepEqual(missing, [], `kinds with no definition line: ${missing.join(", ")}`);
});

test("H-04: DB_REFUSED_KINDS and CLASSIFY_KINDS are disjoint (the poison-loop guard)", () => {
  // classify_document raises CLR28 for consent_evidence unconditionally, and classify has no DB
  // terminal-fail writer — so a refused kind the classifier can return loops on the
  // stranded-requeue path forever, ~144 model calls a day per poisoned document.
  const overlap = CLASSIFY_KINDS.filter((k) => DB_REFUSED_KINDS.includes(k));
  assert.deepEqual(overlap, [], `a refused kind is offerable: ${overlap.join(", ")}`);
  assert.ok(DB_REFUSED_KINDS.length > 0, "vacuity control: the refused set is non-empty");
});

test("H-04: bank_statement carries a CRITICAL discriminator block and the two exclusions", () => {
  const block = SYSTEM_PROMPT.slice(SYSTEM_PROMPT.indexOf("- bank_statement:"), SYSTEM_PROMPT.indexOf("- payment_voucher:"));
  assert.ok(block.length > 0, "mandatory setup: the bank_statement definition was located");
  assert.match(block, /CRITICAL:/, "sharpened the way payroll_summary was, which is the one kind that was tuned");
  assert.match(block, /NEVER a management_account/, "the confusable it was measured against");
  assert.match(block, /NEVER an opening_balance_doc/, "and the second confusable");
  // The OCR-survivable discriminators, which are the actual repair.
  for (const signal of ["ACCOUNT NUMBER", "BALANCE", "PENYATA AKAUN", "NOMBOR AKAUN", "Maybank", "Alliance"]) {
    assert.ok(block.includes(signal), `the discriminator '${signal}' must be named`);
  }
  // The launch-night failure shape: a Maybank header prints a statement DATE and no period.
  assert.match(flat(block), /Missing period bounds are NOT a reason to answer 'other'/);
});

test("H-04: the calibration paragraph no longer pushes a NOISY page toward 'other'", () => {
  // The measured failure: 'other'@0.05 and 'other'@0.00 on two real statements. The old text
  // said "classify from what is legible and lower your confidence accordingly", and 'other' is
  // defined as "or you genuinely cannot tell" — so the model was doing what it was told.
  assert.match(flat(SYSTEM_PROMPT), /NOISE IS NOT UNCERTAINTY/);
  assert.match(flat(SYSTEM_PROMPT), /Answer 'other' only when the LEGIBLE content fits no kind above/);
  const baseline = readFileSync(join(FIXTURES, "baseline-prompt-2026-09-04.txt"), "utf8");
  assert.ok(
    baseline.includes("lower your confidence accordingly") && !SYSTEM_PROMPT.includes("lower your confidence accordingly"),
    "the baseline's own sentence — the one that invited 'other' — is gone from the current prompt",
  );
});

test("H-04: the prompt carries worked examples, including a GARBLED statement", () => {
  assert.ok(SYSTEM_PROMPT.includes("<example>"), "few-shots exist");
  assert.match(SYSTEM_PROMPT, /columns garbled, several rows unreadable/, "one example IS the failure shape");
  // Synthesised, never real client bytes: the corpus is off-repo by necessity.
  assert.ok(!/\b\d{10,16}\b/.test(SYSTEM_PROMPT.replace(/514487003061|12345678901234/g, "")), "no unexplained long digit runs");
});

// ---------------------------------------------------------------------------
// 2. THE ENGINE-ID FINDING — why the provenance bump is NOT in this PR.
// ---------------------------------------------------------------------------

test("H-04 BLOCKER: CLASSIFY_ENGINE_ID stays v1, because the DB enqueues and settles on that literal", () => {
  // The order asked for a bump to clara-classify-llm:v2. It CANNOT ship from a runtime-only
  // lane, and this cell is the evidence rather than a claim:
  //
  //   * clara.enqueue_document_processing sets `v_engine:='clara-classify-llm:v1'` in its own
  //     body (0016, re-cut at 0025/0026/0038/0090/0102/0123 — the live body is 0123's).
  //   * clara.classify_document settles the running task ONLY
  //     `where document_id=... and lane='classify' and status='running' and engine_id=p_engine_id`.
  //
  // So a runtime that verdicts under :v2 matches NO task, settles NOTHING, and — because
  // classify has no DB terminal-fail writer — leaves every task 'running' for the
  // stranded-requeue path to re-drive forever. That is the ~144-calls/day poison loop, on every
  // document. The bump needs a migration that re-cuts the enqueue arm; it is a DB lane's work.
  assert.equal(CLASSIFY_ENGINE_ID, "clara-classify-llm:v1");

  const migrations = join(REPO_ROOT, "packages", "db", "migrations");
  const enqueue = readFileSync(join(migrations, "0123_f_a7_gamma_egress.sql"), "utf8");
  assert.ok(
    enqueue.includes("v_lane:='classify'; v_engine:='clara-classify-llm:v1';"),
    "the LIVE enqueue body still hard-codes the v1 literal — bumping the runtime alone strands every task",
  );
  const settle = readFileSync(join(migrations, "0016_a21_compliance_watch.sql"), "utf8");
  assert.match(
    settle,
    /where document_id=p_document and lane='classify' and status='running'\s*\n\s*and engine_id=p_engine_id/,
    "and the settle is bound to an EXACT engine match",
  );
  // 0102 byte-pins the literal inside the function source, so the DB side is not a free edit either.
  const pin = readFileSync(join(migrations, "0102_f_a2_statement_activation.sql"), "utf8");
  assert.ok(pin.includes("v_lane:='classify'; v_engine:='clara-classify-llm:v1';"), "0102 pins the literal in the shipped body");
});

test("H-04: the harness's printed prompt sha is the ONLY provenance a measurement has", () => {
  // Because the engine id could not move, document_extractions rows carry no prompt identity at
  // all: an old and a new verdict are indistinguishable in the table. The harness stamps a sha
  // on every run so a MEASUREMENT can still be attributed, and that is the mitigation on file.
  const harness = readFileSync(join(RUNTIME_ROOT, "scripts", "measure-classify-recall.mjs"), "utf8");
  assert.match(harness, /system prompt sha256 \$\{promptSha\(SYSTEM_PROMPT\)\}/, "printed before any number");
  assert.equal(promptSha("").length, 64);
  assert.notEqual(promptSha(SYSTEM_PROMPT), promptSha(readFileSync(join(FIXTURES, "baseline-prompt-2026-09-04.txt"), "utf8")));
});

// ---------------------------------------------------------------------------
// 3. The harness's own arithmetic and its refusals.
// ---------------------------------------------------------------------------

test("H-04: score() separates recall AT THE GATE from recall at any confidence", () => {
  const rows = [
    { name: "a", expected: "bank_statement", predicted: "bank_statement", confidence: 0.95 },
    { name: "b", expected: "bank_statement", predicted: "bank_statement", confidence: 0.4 },
    { name: "c", expected: "bank_statement", predicted: "other", confidence: 0.05 },
    { name: "d", expected: "invoice", predicted: "invoice", confidence: 0.9 },
  ];
  const r = score(rows);
  const bank = r.perKind.find((k) => k.kind === "bank_statement");
  assert.equal(bank.n, 3);
  assert.equal(bank.recall_at_gate, 1 / 3, "only the >=0.8 hit counts at the gate — that is what the DB applies");
  assert.equal(bank.recall_any, 2 / 3, "the under-gate hit still counts as 'the model knew'");
  assert.deepEqual(bank.misses, ["c -> other@0.05"]);
  assert.deepEqual(bank.under_gate, ["b@0.4"]);
  assert.equal(r.overall_recall_at_gate, 2 / 4);
  assert.equal(CONFIDENCE_GATE, 0.8, "the gate is the one clara.classify_document applies");
});

test("H-04: the fixtures mode classifies all five built-in shapes through the REAL call path", async () => {
  // The CI-safe cell: the harness's arithmetic proven with no provider, no corpus and no DB —
  // and driven through classifyDocumentText itself, so a change to that function's plumbing is
  // covered, not just the scorer.
  const rules = (text) => {
    if (/EPF|SOCSO/i.test(text)) return { kind: "payroll_summary", confidence: 0.9, rationale: "stub" };
    if (/TAX INVOICE/i.test(text)) return { kind: "invoice", confidence: 0.9, rationale: "stub" };
    if (/STATEMENT OF FINANCIAL POSITION|MANAGEMENT ACCOUNTS/i.test(text)) return { kind: "management_account", confidence: 0.9, rationale: "stub" };
    if (/BAKI|BALANCE/i.test(text) && /AKAUN|ACCOUNT/i.test(text)) return { kind: "bank_statement", confidence: 0.92, rationale: "stub" };
    return { kind: "other", confidence: 0.05, rationale: "stub" };
  };
  const previous = globalThis.__claraModelForTest;
  globalThis.__claraModelForTest = stubModel(rules);
  try {
    const rows = [];
    for (const f of builtinFixtures()) {
      const v = await classifyDocumentText({ text: f.text, modelId: "stub" });
      rows.push({ name: f.name, expected: f.expected, predicted: v.kind, confidence: v.confidence });
    }
    const r = score(rows);
    assert.equal(r.n, 5);
    assert.equal(r.overall_recall_at_gate, 1, `every fixture must classify: ${JSON.stringify(r.perKind)}`);
    // The MUST-NOT-RED control for the stub's own hazard: the stub must read the USER message,
    // not the system prompt (which names EPF, SOCSO and TAX INVOICE and once matched everything).
    assert.equal(r.perKind.find((k) => k.kind === "bank_statement").n, 2, "both statement shapes are labelled bank_statement");
  } finally {
    if (previous === undefined) delete globalThis.__claraModelForTest;
    else globalThis.__claraModelForTest = previous;
  }
});

test("H-04: systemOverride swaps the prompt and NOTHING in production passes it", async () => {
  let sawSystem = null;
  const previous = globalThis.__claraModelForTest;
  globalThis.__claraModelForTest = stubModel(() => ({ kind: "other", confidence: 0.1, rationale: "x" }));
  // Capture the system message through the model's own prompt argument.
  const capture = stubModel(() => ({ kind: "other", confidence: 0.1, rationale: "x" }));
  const inner = capture.doGenerate.bind(capture);
  capture.doGenerate = async (opts) => {
    sawSystem = (opts.prompt ?? []).filter((m) => m?.role === "system").map((m) => m.content).join("");
    return inner(opts);
  };
  globalThis.__claraModelForTest = capture;
  try {
    await classifyDocumentText({ text: "x", modelId: "stub" });
    assert.ok(sawSystem.includes("NOISE IS NOT UNCERTAINTY"), "the default is the module prompt");
    await classifyDocumentText({ text: "x", modelId: "stub", systemOverride: "BASELINE MARKER" });
    assert.equal(sawSystem, "BASELINE MARKER", "an override replaces it wholesale — that is what makes replay a fair comparison");
    // An empty override must NOT blank the prompt.
    await classifyDocumentText({ text: "x", modelId: "stub", systemOverride: "" });
    assert.ok(sawSystem.includes("NOISE IS NOT UNCERTAINTY"), "an empty override falls back, never sends an empty system prompt");
  } finally {
    if (previous === undefined) delete globalThis.__claraModelForTest;
    else globalThis.__claraModelForTest = previous;
  }
  // The production caller passes {text, modelId} only.
  const classify = readFileSync(join(RUNTIME_ROOT, "lib", "classify.mjs"), "utf8");
  assert.ok(!classify.includes("systemOverride"), "no production call site passes the measurement seam");
  assert.match(classify, /await classify\(\{ text, modelId \}\)/, "the production call is exactly {text, modelId}");
});

test("H-04: readManifest REFUSES rather than inventing rows", () => {
  const absent = readManifest(join(FIXTURES, "does-not-exist.json"));
  assert.equal(absent.ok, false);
  assert.match(absent.reason, /^fixture absent:/, "an absent corpus is reported honestly, never fabricated");

  const example = readManifest(join(FIXTURES, "manifest.example.json"));
  assert.equal(example.ok, true, `the shipped example must be a VALID manifest: ${example.reason ?? ""}`);
  assert.ok(example.rows.length >= 5);
  for (const row of example.rows) {
    assert.ok(CLASSIFY_KINDS.includes(row.expected_kind));
    // Placeholder ids only — this directory records a SHAPE, never a corpus.
    assert.equal(row.document_id, "00000000-0000-0000-0000-000000000000");
  }
});

test("H-04: the example manifest names the off-repo corpus doc rather than copying it", () => {
  const readme = readFileSync(join(FIXTURES, "README.md"), "utf8");
  assert.match(readme, /docs\/plan\/completed\/corpus-manifest-2026-09-04\.md/, "the inventory is NAMED, not duplicated");
  assert.match(readme, /never enter the repo or CI/, "and the reason is stated");
  assert.match(readme, /The recall floor for "done" is the owner's to set/, "the harness reports; it does not decide the bar");
});
