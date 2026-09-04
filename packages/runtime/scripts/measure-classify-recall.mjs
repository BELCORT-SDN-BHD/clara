// H-04 — the doc-classifier RECALL harness.
//
// WHY THIS EXISTS, AND WHY IT COMES BEFORE THE PROMPT CHANGE. The launch e2e classified two real
// bank statements as `other` — 0.05 confidence on a 4-page Maybank statement, 0.00 on a 5-page
// Alliance one. The low-confidence hold worked as designed (a human set the kind), but the most
// common document class in the product was unrecognised. Sharpening the prompt without a
// measurement would be a guess: `scripts/measure-invoice-id-capture.mjs` exists because a
// GATE-3 number turned out to be a MEASUREMENT ARTIFACT of an out-of-repo eval driver, and this
// harness is deliberately built in that file's shape so the same mistake is not repeated.
//
// THREE MODES, one of which needs no model and no database:
//
//   fixtures  (default, CI-safe) — run built-in synthetic OCR-layout fixtures through
//             `classifyDocumentText` with `globalThis.__claraModelForTest` armed. It proves the
//             harness's OWN arithmetic — the confusion matrix, the two recall gates — without a
//             provider call, a corpus, or a DB. A cell runs this mode.
//   live      — for each manifest row, read the document's PERSISTED OCR layout text (the same
//             substrate `lib/classify.mjs` feeds the model — NEVER re-OCR, or the measurement
//             measures OCR too) and call the real model.
//   replay    — run a stored set of OCR texts through BOTH the baseline prompt and the current
//             one in ONE pass, so the delta is measured on identical input. This is what makes
//             a prompt change defensible rather than asserted.
//
// THE CORPUS IS OFF-REPO AND STAYS THERE. `docs/plan/completed/corpus-manifest-2026-09-04.md`
// inventories it (folders, counts, the three 资料缺失 marks). Real client payloads never enter
// the repo or CI — the f-a1 precedent is explicit. `--manifest` points at a LOCAL json the
// operator writes; its SHAPE (never its contents) is
// `packages/runtime/tests/fixtures/classify/manifest.example.json`. A missing manifest reports
// "fixture absent" and exits — it never fabricates rows.
//
// PROVENANCE ON EVERY RUN: the model id and a sha256 of the SYSTEM_PROMPT are printed before
// any number. A result can therefore never be attributed to the wrong prompt. THIS MATTERS MORE
// THAN USUAL HERE — see the engine-id note in `lib/classify.mjs`: `CLASSIFY_ENGINE_ID` could NOT
// be bumped to :v2 in the PR that sharpened the prompt, because the DB enqueues classify tasks
// under the v1 literal and `clara.classify_document` settles only on an exact engine match. So
// the DB rows carry no prompt provenance at all, and this harness's printed sha is the only
// attribution a measurement has.
//
// READ-ONLY. The DB connection comes from the environment ONLY (DATABASE_URL /
// WORKFLOW_POSTGRES_URL, else libpq PG*) — never a DSN literal in this file. Nothing here
// writes, settles, or enqueues.

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import pg from "pg";

import { CLASSIFY_KINDS, SYSTEM_PROMPT, classifyDocumentText } from "../lib/classify-llm.mjs";

const DEFAULT_MODEL = process.env.CLARA_CHAT_MODEL || "gpt-5.6-terra";
/** The gate `clara.classify_document` actually applies: below it the kind is NOT set. */
export const CONFIDENCE_GATE = 0.8;

export const promptSha = (text) => createHash("sha256").update(text).digest("hex");

// ---------------------------------------------------------------------------
// Scoring — pure, and the part the fixtures mode exists to prove.
// ---------------------------------------------------------------------------

/**
 * Build a confusion matrix and per-kind recall from labelled verdicts.
 * TWO recall numbers per kind, and the difference between them is the finding:
 *   `recall_at_gate`  — predicted correctly AND confidence >= 0.8. This is the HEADLINE, because
 *                       it is what the DB gate applies: a correct kind at 0.4 sets nothing.
 *   `recall_any`      — predicted correctly at any confidence. A large gap between the two means
 *                       the model KNOWS but is under-confident, which is a calibration fix, not
 *                       a definition fix — a genuinely different repair.
 * @param {Array<{name?:string, expected:string, predicted:string, confidence:number}>} rows
 */
export function score(rows) {
  const kinds = new Set();
  for (const r of rows) {
    kinds.add(r.expected);
    kinds.add(r.predicted);
  }
  const confusion = new Map();
  for (const r of rows) {
    const key = `${r.expected} -> ${r.predicted}`;
    confusion.set(key, (confusion.get(key) ?? 0) + 1);
  }
  const perKind = [];
  for (const kind of [...kinds].sort()) {
    const actual = rows.filter((r) => r.expected === kind);
    if (actual.length === 0) continue;
    const hit = actual.filter((r) => r.predicted === kind);
    const hitAtGate = hit.filter((r) => r.confidence >= CONFIDENCE_GATE);
    perKind.push({
      kind,
      n: actual.length,
      recall_at_gate: hitAtGate.length / actual.length,
      recall_any: hit.length / actual.length,
      misses: actual.filter((r) => r.predicted !== kind).map((r) => `${r.name ?? "?"} -> ${r.predicted}@${r.confidence}`),
      under_gate: hit.filter((r) => r.confidence < CONFIDENCE_GATE).map((r) => `${r.name ?? "?"}@${r.confidence}`),
    });
  }
  const overallAtGate = rows.filter((r) => r.predicted === r.expected && r.confidence >= CONFIDENCE_GATE).length / (rows.length || 1);
  return { n: rows.length, perKind, overall_recall_at_gate: overallAtGate, confusion };
}

export function printReport(label, result) {
  console.log(`\n=== ${label} — n=${result.n}, overall recall at >=${CONFIDENCE_GATE}: ${(result.overall_recall_at_gate * 100).toFixed(1)}%`);
  for (const k of result.perKind) {
    console.log(
      `  ${k.kind.padEnd(20)} n=${String(k.n).padStart(3)}  at-gate ${(k.recall_at_gate * 100).toFixed(1)}%  any ${(k.recall_any * 100).toFixed(1)}%`,
    );
    for (const m of k.misses) console.log(`      MISS  ${m}`);
    for (const u of k.under_gate) console.log(`      UNDER ${u}`);
  }
  // The confusion matrix itself — review-558 NIT: score() built this Map and nothing printed
  // it, so the most useful artifact of a recall run was computed and thrown away. Off-diagonal
  // cells are the finding: they name WHICH kind a miss went to, which is what tells a
  // definition fault (a confusable) apart from a calibration fault (an under-gate hit).
  const off = [...result.confusion.entries()].filter(([k]) => k.split(" -> ")[0] !== k.split(" -> ")[1]);
  console.log(`  confusion (${result.confusion.size} cell(s), ${off.length} off-diagonal):`);
  for (const [pair, n] of [...result.confusion.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`      ${String(n).padStart(3)}  ${pair}${pair.split(" -> ")[0] === pair.split(" -> ")[1] ? "" : "   <-- confusion"}`);
  }
}

// ---------------------------------------------------------------------------
// Fixtures — synthesised OCR SHAPES, never real client bytes.
// ---------------------------------------------------------------------------

/**
 * Built-in fixtures modelled on the SHAPES the corpus manifest names (Maybank, Alliance, HLB
 * statements; management accounts; supplier invoices) and SYNTHESISED — no real client bytes,
 * no real account numbers, no real party names. They exist to prove the harness's arithmetic
 * and to give `replay` something to run with no corpus present.
 */
export function builtinFixtures() {
  return [
    {
      name: "statement/maybank-shape",
      expected: "bank_statement",
      text: [
        "PENYATA AKAUN / STATEMENT OF ACCOUNT",
        "NOMBOR AKAUN 000000000000   TARIKH PENYATA / STATEMENT DATE : 30/06/25",
        "TARIKH  URUSNIAGA            DEBIT     KREDIT     BAKI",
        "02/06   IBG TRANSFER                   1,250.00   48,110.22",
        "07/06   CHEQUE DEPOSIT                 3,000.00   51,110.22",
        "BAKI AKHIR                                        51,110.22",
      ].join("\n"),
    },
    {
      name: "statement/garbled-columns",
      expected: "bank_statement",
      text: [
        "STATEMENT OF ACCOUNT   00000000000000   01 APR 2025 - 30 APR 2025",
        "DATE DESCRIPTION WITHDRAWAL DEPOSIT BALANCE",
        "03 APR  SALARY CR        8 200 00   19 447 63",
        "11 APR  DUITNOW    450 00           18 997 63",
        "1 7 A P R   S E R V I C E   C H G   2 . 0 0   1 8 9 9 5 . 6 3",
      ].join("\n"),
    },
    {
      name: "management-account/bs-shape",
      expected: "management_account",
      text: [
        "MANAGEMENT ACCOUNTS FOR THE YEAR ENDED 31 DECEMBER 2025",
        "STATEMENT OF FINANCIAL POSITION",
        "Property, plant and equipment           412,880",
        "Trade receivables                        96,441",
        "Cash and bank balances                   51,110",
      ].join("\n"),
    },
    {
      name: "invoice/supplier-shape",
      expected: "invoice",
      text: [
        "TAX INVOICE",
        "Invoice No : INV2510/10   Date : 2025-10-13",
        "Bill To: A SDN BHD",
        "1  Consultancy services      3,000.00",
        "Total Due RM 3,000.00",
      ].join("\n"),
    },
    {
      name: "payroll/summary-shape",
      expected: "payroll_summary",
      text: [
        "PAYROLL SUMMARY  OCTOBER 2025",
        "NAME        GROSS     EPF     SOCSO   EIS    PCB     NET",
        "EMPLOYEE A  4,000.00  440.00  19.75   4.00   85.00   3,451.25",
        "EMPLOYEE B  3,200.00  352.00  15.80   3.20   40.00   2,789.00",
      ].join("\n"),
    },
  ];
}

/** A deterministic stand-in model for the fixtures mode — a keyword rule, NOT the real model.
 *  It exists to exercise the SCORING, and the report says so on every fixtures run. The result
 *  shape mirrors tests/classify-unit.test.mjs's own mock (ai@7 reads usage.*.total). */
export function stubModel(rules) {
  return {
    specificationVersion: "v3",
    provider: "clara-harness-stub",
    modelId: "stub",
    supportedUrls: {},
    async doGenerate({ prompt }) {
      // ONLY the USER message. ai@7 hands doGenerate the whole message array, SYSTEM message
      // included — and the system prompt names EPF, SOCSO, TAX INVOICE and every other
      // discriminator, so matching over the whole array made every fixture match the first
      // rule. Measured: it reported payroll_summary for all five. Extract the document text.
      const text = JSON.stringify((Array.isArray(prompt) ? prompt : []).filter((m) => m?.role === "user"));
      return {
        content: [{ type: "text", text: JSON.stringify(rules(text)) }],
        finishReason: { unified: "stop", raw: "stop" },
        usage: { inputTokens: { total: 1 }, outputTokens: { total: 1 } },
        warnings: [],
      };
    },
  };
}

// ---------------------------------------------------------------------------
// The manifest.
// ---------------------------------------------------------------------------

/**
 * Read a labelled manifest. NEVER invents rows: an unreadable or malformed file is reported and
 * the run stops. Shape: `[{ "document_id": "...", "firm_id": "...", "expected_kind": "...",
 * "name": "optional label" }]`.
 */
export function readManifest(path) {
  let raw;
  try {
    raw = readFileSync(path, "utf8");
  } catch (err) {
    return { ok: false, reason: `fixture absent: could not read ${path} (${err.code ?? err.message})` };
  }
  let rows;
  try {
    rows = JSON.parse(raw);
  } catch (err) {
    return { ok: false, reason: `manifest at ${path} is not valid JSON: ${err.message}` };
  }
  if (!Array.isArray(rows) || rows.length === 0) return { ok: false, reason: `manifest at ${path} carries no rows` };
  for (const [i, r] of rows.entries()) {
    if (!r || typeof r.expected_kind !== "string") return { ok: false, reason: `manifest row ${i} has no expected_kind` };
    if (!CLASSIFY_KINDS.includes(r.expected_kind)) {
      return { ok: false, reason: `manifest row ${i} labels '${r.expected_kind}', which is not a CLASSIFY_KINDS member` };
    }
    if (typeof r.document_id !== "string" || typeof r.firm_id !== "string") {
      return { ok: false, reason: `manifest row ${i} needs both document_id and firm_id` };
    }
  }
  return { ok: true, rows };
}

// ---------------------------------------------------------------------------
// Modes.
// ---------------------------------------------------------------------------

async function runFixtures() {
  // MOST SPECIFIC FIRST. The order is load-bearing and the reason is the very confusion this
  // harness measures: "ACCOUNT" and "BALANCE" appear on a management account too, so a
  // bank-statement rule placed first swallows every other kind. The real prompt has the same
  // problem in a harder form, which is what the CRITICAL block in classify-llm.mjs addresses.
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
    return score(rows);
  } finally {
    if (previous === undefined) delete globalThis.__claraModelForTest;
    else globalThis.__claraModelForTest = previous;
  }
}

/** The SAME read lib/classify.mjs feeds the model — imported, never re-implemented. */
async function readTexts(rows) {
  const { readExtractionText } = await import("../lib/classify.mjs");
  const client = new pg.Client(process.env.DATABASE_URL || process.env.WORKFLOW_POSTGRES_URL ? { connectionString: process.env.DATABASE_URL || process.env.WORKFLOW_POSTGRES_URL } : {});
  await client.connect();
  try {
    await client.query("set default_transaction_read_only = on"); // this harness structurally cannot write
    const out = [];
    for (const r of rows) {
      const text = await readExtractionText(client, { documentId: r.document_id, firmId: r.firm_id });
      out.push({ name: r.name ?? r.document_id, expected: r.expected_kind, text });
    }
    return out;
  } finally {
    await client.end().catch(() => {});
  }
}

async function runLive(manifestPath, modelId) {
  const m = readManifest(manifestPath);
  if (!m.ok) {
    console.error(m.reason);
    process.exitCode = 1;
    return null;
  }
  const texts = await readTexts(m.rows);
  const empty = texts.filter((t) => !t.text);
  for (const e of empty) console.error(`  NOTE: ${e.name} has no persisted OCR layout text — counted as a MISS, not skipped`);
  const rows = [];
  for (const t of texts) {
    const v = await classifyDocumentText({ text: t.text, modelId });
    rows.push({ name: t.name, expected: t.expected, predicted: v.kind, confidence: v.confidence });
  }
  return score(rows);
}

async function runReplay(manifestPath, baselinePath, modelId, allowContaminated = false) {
  let baseline;
  try {
    baseline = readFileSync(baselinePath, "utf8");
  } catch (err) {
    console.error(`baseline prompt absent: could not read ${baselinePath} (${err.code ?? err.message}) — a before/after is NOT measurable in this run`);
    process.exitCode = 1;
    return;
  }
  const m = manifestPath ? readManifest(manifestPath) : { ok: false, reason: "no --manifest given" };
  if (!m.ok) {
    // THE FALLBACK IS CONTAMINATED, AND REFUSING IS THE HONEST ANSWER (review-558 MINOR).
    // The built-in fixtures are modelled on the SAME shapes the sharpened prompt now carries as
    // its worked examples — a Maybank-style PENYATA/BAKI header, a garbled-column statement, a
    // balance-sheet management account. Replaying those through baseline-vs-current does not
    // measure a delta: the CURRENT arm wins BY CONSTRUCTION, because it was shown those very
    // shapes. A number produced that way would be a measurement artifact of exactly the kind
    // scripts/measure-invoice-id-capture.mjs exists to prevent. So replay REFUSES rather than
    // printing it, unless the operator opts in explicitly for a smoke test of the plumbing.
    if (!allowContaminated) {
      console.error(`replay: ${m.reason}.`);
      console.error(
        "replay REFUSES the built-in fixtures as a baseline-vs-current input set: they are the same shapes the CURRENT " +
          "prompt carries as few-shots, so the current arm would win by construction and the delta would be an artifact. " +
          "Point --manifest at a real labelled corpus. To smoke-test the plumbing only, pass --allow-contaminated-fixtures " +
          "and treat every number it prints as UNUSABLE for a recall claim.",
      );
      process.exitCode = 1;
      return;
    }
    console.error(
      "replay: CONTAMINATED RUN — the built-in fixtures are the current prompt's own few-shot shapes. The current arm " +
        "wins by construction. These numbers measure the PLUMBING, never recall, and must never be quoted as a delta.",
    );
  }
  const texts = m.ok ? await readTexts(m.rows) : builtinFixtures().map((f) => ({ name: f.name, expected: f.expected, text: f.text }));

  // The baseline is run by TEMPORARILY substituting the prompt through the same call path, so
  // both arms differ in exactly one variable. classifyDocumentText takes its prompt from the
  // module constant, so the baseline arm goes through an explicit override parameter.
  const arms = [
    { label: `baseline (${promptSha(baseline).slice(0, 12)})`, system: baseline },
    { label: `current  (${promptSha(SYSTEM_PROMPT).slice(0, 12)})`, system: SYSTEM_PROMPT },
  ];
  for (const arm of arms) {
    const rows = [];
    for (const t of texts) {
      const v = await classifyDocumentText({ text: t.text, modelId, systemOverride: arm.system });
      rows.push({ name: t.name, expected: t.expected, predicted: v.kind, confidence: v.confidence });
    }
    printReport(arm.label, score(rows));
  }
}

async function main() {
  const args = process.argv.slice(2);
  const mode = args[0] && !args[0].startsWith("--") ? args[0] : "fixtures";
  const flag = (name) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const modelId = flag("--model") ?? DEFAULT_MODEL;

  console.log("clara classify-recall harness");
  console.log(`  mode                 ${mode}`);
  console.log(`  model                ${mode === "fixtures" ? "STUB (no provider call)" : modelId}`);
  console.log(`  system prompt sha256 ${promptSha(SYSTEM_PROMPT)}`);
  console.log(`  confidence gate      >=${CONFIDENCE_GATE} (the gate clara.classify_document applies)`);

  if (mode === "fixtures") {
    printReport("fixtures (STUB model — proves this harness's arithmetic, NOT the real model)", await runFixtures());
    return;
  }
  // live and replay both call the real provider. Refuse HONESTLY rather than letting the SDK
  // throw a stack trace — "no key" is a configuration fact, not a measurement outcome.
  if ((mode === "live" || mode === "replay") && !process.env.OPENAI_API_KEY && !globalThis.__claraModelForTest) {
    console.error(`${mode} mode calls the real model and OPENAI_API_KEY is not set — refusing rather than reporting a number it did not measure`);
    process.exitCode = 1;
    return;
  }
  if (mode === "live") {
    const manifest = flag("--manifest");
    if (!manifest) {
      console.error("live mode needs --manifest <path.json> (shape: tests/fixtures/classify/manifest.example.json)");
      process.exitCode = 1;
      return;
    }
    const r = await runLive(manifest, modelId);
    if (r) printReport(`live (${modelId})`, r);
    return;
  }
  if (mode === "replay") {
    const baseline = flag("--baseline") ?? fileURLToPath(new URL("../tests/fixtures/classify/baseline-prompt-2026-09-04.txt", import.meta.url));
    await runReplay(flag("--manifest"), baseline, modelId, args.includes("--allow-contaminated-fixtures"));
    return;
  }
  console.error(`unknown mode '${mode}' (fixtures | live | replay)`);
  process.exitCode = 1;
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/").split("/").pop())) {
  await main();
}
