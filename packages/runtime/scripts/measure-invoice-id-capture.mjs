// Re-measure harness for the WA §11 invoice_id facts-capture fix.
//
// WHY THIS EXISTS. The GATE-3 eval reported `captured_invoice_id` null on 14/17
// bills. Investigation (REPORT-E) showed that number was a MEASUREMENT ARTIFACT of
// the (out-of-repo) eval driver: the mapper had actually persisted a non-empty
// `invoice.invoice_id` region for the majority of bills, and clara._invoice_fact_state
// reads those correctly. The genuine residual is the handful of bills where Azure's
// typed `InvoiceId` field came back with a region but no value (or no field), which
// the mapper now recovers from keyValuePairs / OCR content. This harness measures the
// RIGHT thing so the ≥16/17 gate can never be fooled by a driver artifact again.
//
// TWO MODES (both read-only; connection strictly from the environment):
//   fixtures  (default) — run raw prebuilt-invoice payloads through the CURRENT mapper
//               and report the capture rate, split into the typed-only rate (what the
//               old mapper would have captured) vs the with-fallback rate (now). Uses
//               built-in corpus-shaped fixtures; feed real captured payloads with
//               `--payloads <file.json>` (a JSON array of raw analyze payloads).
//   live      — read persisted state: for the latest invoice_facts extraction per
//               document, mirror _invoice_fact_state's invoice_id read (nullif(btrim(
//               min(text_content))) over field_path='invoice.invoice_id') and report
//               `with_id / processed`. This equals what the duplicate-bill gate sees.
//
//   totals    (X2) — run the DETERMINISTIC TOTALS READER over raw payloads and print, per
//               document, what it emitted and what it refused. This is the only honest way
//               to validate the reader against REAL captures: those payloads carry live
//               client data and can never enter the repo or CI, so the in-repo tests use
//               geometry-faithful synthetic fixtures and this mode is run locally against
//               the real files. Reads nothing but the file you point it at.
//
// USAGE:
//   node scripts/measure-invoice-id-capture.mjs                 # fixtures (built-in)
//   node scripts/measure-invoice-id-capture.mjs fixtures --payloads ./raw.json
//   node scripts/measure-invoice-id-capture.mjs totals --payloads ./raw.json
//   node scripts/measure-invoice-id-capture.mjs live            # env DB, read-only
//
// The DB connection is resolved ONLY from the environment (DATABASE_URL /
// WORKFLOW_POSTGRES_URL, else libpq PG* vars) — never a DSN literal in this file.

import { readFileSync } from "node:fs";
import pg from "pg";
import { normalizeAzureInvoice } from "../workflows/invoiceFacts.v1.azure.mjs";
import { TOTALS_FIELD_PATHS } from "../lib/invoice-totals-reader.mjs";

// --- shared helper: does a normalized payload yield a non-empty invoice.invoice_id? --
function capturedId(payload) {
  const out = normalizeAzureInvoice(payload);
  const f = out.fields.find((x) => x.field_path === "invoice.invoice_id");
  return f && String(f.value_raw ?? "").trim() ? f.value_raw : null;
}

// Did the TYPED InvoiceId field alone carry a value? (models the pre-fix mapper.)
function typedId(payload) {
  const doc = (payload?.analyzeResult?.documents || payload?.documents || [])[0];
  const f = doc?.fields?.InvoiceId;
  const v = String(f?.content ?? f?.valueString ?? "").trim();
  return v || null;
}

// --- built-in corpus-shaped fixtures (the real raw payloads were never persisted) ----
// Models the RPR-corpus populations AND the labeled-vs-unlabeled split that decides
// whether the free content-scan recovers a number or only the BILLABLE keyValuePairs
// add-on would. Every empty/absent-typed fixture carries a realistic `content` (Azure
// always returns it) so the content-scan column is honest; the two "+KV" fixtures also
// carry keyValuePairs so the "with-KV-if-present" column shows what a future
// owner-enabled feature would additionally recover.
function builtinFixtures() {
  const total = { content: "5,000.00", valueCurrency: { currencyCode: "MYR" }, boundingRegions: [{ pageNumber: 1, polygon: [0, 0, 1, 1] }], confidence: 0.98 };
  const wrap = (fields, extra = {}) => ({ status: "succeeded", analyzeResult: { documents: [{ fields }], pages: [{ pageNumber: 1 }], ...extra } });
  const emptyId = { content: "", boundingRegions: [{ pageNumber: 1, polygon: [0.1, 0.1, 0.2, 0.2] }], confidence: 0.4 };
  return [
    // typed InvoiceId present + non-empty — every column captures.
    { name: "typed-present/BUSYSTREET", payload: wrap({ InvoiceTotal: total, InvoiceId: { content: "IV-2512-001", boundingRegions: [{ pageNumber: 1, polygon: [0.1, 0.1, 0.2, 0.2] }], confidence: 0.96 } }) },
    { name: "typed-present/PKLG-2507-003", payload: wrap({ InvoiceTotal: total, InvoiceId: { content: "PKLG-2507-003", boundingRegions: [{ pageNumber: 1, polygon: [0.1, 0.1, 0.2, 0.2] }], confidence: 0.95 } }) },
    // typed ABSENT, but the number is LABELLED in content — content-scan recovers.
    { name: "typed-absent/content-labelled/INV2510-10", payload: wrap({ InvoiceTotal: total }, { content: "ROME PUBLIC ADVISORY SDN BHD\nInvoice No : INV2510/10\nDate : 2025-10-13\n" }) },
    { name: "typed-absent/content-labelled/202509230", payload: wrap({ InvoiceTotal: total }, { content: "KOK LIONG ACCOUNTANCY\nInvoice No.\n202509230\n" }) },
    // typed EMPTY, number LABELLED in content AND present as a KV pair — recovered by
    // BOTH content-scan (free) and KV (billable). Content-scan alone still gets it.
    { name: "typed-empty/content-labelled+KV/BINV202510-018", payload: wrap({ InvoiceTotal: total, InvoiceId: emptyId }, { content: "BRIGHTPATH CONSULTANCY SDN BHD\nInvoice No: BINV202510-018\nTotal RM 435,560.00\n", keyValuePairs: [{ key: { content: "Invoice No." }, value: { content: "BINV202510-018", boundingRegions: [{ pageNumber: 1, polygon: [0.3, 0.3, 0.4, 0.4] }] }, confidence: 0.86 }] }) },
    // typed EMPTY, number UNLABELLED in content (bare header) but present as a KV pair —
    // ONLY the billable KV add-on recovers it; content-scan alone MISSES it. This is the
    // capture the dropped `&features=keyValuePairs` line gives up until an owner enables it.
    { name: "typed-empty/content-UNlabelled+KV/PKLG-2508-001", payload: wrap({ InvoiceTotal: total, InvoiceId: emptyId }, { content: "PKL GROUP SDN BHD\nPKLG-2508-001\nCommission for Emerald 9 Residence\nTotal RM 206,946.31\n", keyValuePairs: [{ key: { content: "No. Invois" }, value: { content: "PKLG-2508-001" }, confidence: 0.8 }] }) },
    // genuinely no invoice number anywhere — every column (correctly) misses.
    { name: "no-id-anywhere/receipt", payload: wrap({ InvoiceTotal: total }, { content: "Cash sale receipt. Thank you.\n" }) },
  ];
}

// Strip keyValuePairs to measure what the free content-scan recovers ALONE (the shipped
// default, since the request no longer asks for the billable KV feature).
function withoutKeyValuePairs(payload) {
  const clone = JSON.parse(JSON.stringify(payload));
  if (clone?.analyzeResult) delete clone.analyzeResult.keyValuePairs;
  delete clone.keyValuePairs;
  return clone;
}

function runFixtures(argv) {
  const payloadArg = argv[argv.indexOf("--payloads") + 1];
  let fixtures;
  if (argv.includes("--payloads") && payloadArg) {
    const raw = JSON.parse(readFileSync(payloadArg, "utf8"));
    const arr = Array.isArray(raw) ? raw : [raw];
    fixtures = arr.map((p, i) => ({ name: p.file || p.name || `payload[${i}]`, payload: p.payload || p }));
    console.log(`Loaded ${fixtures.length} payload(s) from ${payloadArg}\n`);
  } else {
    fixtures = builtinFixtures();
    console.log(`Using ${fixtures.length} built-in corpus-shaped fixtures (pass --payloads <file.json> for real captures)\n`);
  }
  let typed = 0;
  let contentOnly = 0; // SHIPPED default: content-scan recovery, no billable KV feature
  let withKv = 0; // what enabling the billable keyValuePairs add-on would additionally get
  for (const { name, payload } of fixtures) {
    const t = typedId(payload);
    const co = capturedId(withoutKeyValuePairs(payload)); // content-scan alone (shipped)
    const kv = capturedId(payload); // KV consumed if present (owner-flippable upside)
    if (t) typed += 1;
    if (co) contentOnly += 1;
    if (kv) withKv += 1;
    const tag = !t && co ? "  <- content-scan (free)" : !t && kv ? "  <- KV-ONLY (needs billable feature)" : !kv ? "  (no id)" : "";
    console.log(`  ${(co || kv || "-").padEnd(18)} typed=${(t || "-").padEnd(16)} ${name}${tag}`);
  }
  const n = fixtures.length;
  console.log(`\ntyped-only (pre-fix)          : ${typed}/${n}`);
  console.log(`content-scan alone (SHIPPED)  : ${contentOnly}/${n}`);
  console.log(`+ keyValuePairs (billable)    : ${withKv}/${n}   delta = ${withKv - contentOnly} (only the UNLABELLED-in-content shape)`);
  console.log("\nNote: fixtures prove the MECHANISM + the content-scan/KV split. The shipped");
  console.log("default recovers every LABELLED number for free; only a number printed with no");
  console.log("recognizable label needs the billable KV add-on. The real per-doc rate is a");
  console.log("POST-DEPLOY gate — re-extract with this mapper, then run `live` mode.");
}

// --- X2: what the totals reader made of each payload ----------------------------------
// Prints the emitted regions and the refusal counters exactly as they will ride the
// extraction envelope, so a real capture can be checked line by line against the printed
// face of the document before anything is deployed.
function runTotals(argv) {
  const payloadArg = argv[argv.indexOf("--payloads") + 1];
  if (!argv.includes("--payloads") || !payloadArg) {
    console.error("totals mode needs real payloads: --payloads <file.json> (a raw analyze payload, or an array of them)");
    process.exit(2);
  }
  const raw = JSON.parse(readFileSync(payloadArg, "utf8"));
  const arr = Array.isArray(raw) ? raw : [raw];
  const fixtures = arr.map((p, i) => ({ name: p.file || p.name || `payload[${i}]`, payload: p.payload || p }));
  console.log(`Totals reader over ${fixtures.length} payload(s) from ${payloadArg}\n`);
  for (const { name, payload } of fixtures) {
    const out = normalizeAzureInvoice(payload);
    const receipt = out.envelope.totals_reader ?? {};
    const pages = payload?.analyzeResult?.pages ?? payload?.pages ?? [];
    const lineCount = pages.reduce((n, p) => n + (Array.isArray(p.lines) ? p.lines.length : 0), 0);
    console.log(`== ${name}  (${pages.length} page(s), ${lineCount} line(s), ${out.normalizationVersion})`);
    for (const path of TOTALS_FIELD_PATHS) {
      const emitted = out.fields.find((f) => f.field_path === path);
      const detail = receipt.fields?.[path];
      if (!emitted && !detail) continue;
      const label = detail?.labels?.join(" | ") ?? "";
      console.log(
        `   ${path.padEnd(24)} ${(emitted?.value_raw ?? "-").padStart(12)}  ` +
        `[${detail?.outcome ?? "typed-only"}${detail?.reason ? ":" + detail.reason : ""}${detail?.sign ? ", " + detail.sign : ""}]  ${label}`,
      );
    }
    const typedTotal = out.fields.find((f) => f.field_path === "invoice.total");
    console.log(`   ${"(invoice.total, typed)".padEnd(24)} ${(typedTotal?.value_raw ?? "-").padStart(12)}`);
    console.log(
      `   counters: matched=${receipt.matched} absent=${receipt.absent} ambiguous=${receipt.ambiguous} ` +
      `unparseable=${receipt.unparseable} sign_unknown=${receipt.sign_unknown} ` +
      `tax_summary_suppressed=${receipt.tax_summary_suppressed}`,
    );
    console.log(
      `             typed_collapsed=${receipt.typed_collapsed} typed_disagreement=${receipt.typed_disagreement} ` +
      `typed_recovered=${receipt.typed_recovered} typed_vs_dash=${receipt.typed_vs_dash} ` +
      `emitted=${receipt.emitted} sst_rate=${receipt.sst_rate ?? "-"} units=[${(receipt.units ?? []).join(",")}]` +
      `${receipt.reason ? " reason=" + receipt.reason : ""}\n`,
    );
  }
  console.log("Check every emitted figure against the printed face of the document. A refusal is a");
  console.log("correct outcome; a WRONG figure is not, and no counter can tell you which you have.");
}

async function runLive() {
  const url = process.env.DATABASE_URL || process.env.WORKFLOW_POSTGRES_URL;
  const client = new pg.Client(url ? { connectionString: url } : {});
  await client.connect();
  try {
    await client.query("set default_transaction_read_only = on");
    await client.query("set statement_timeout = '30s'");
    const sql = `
      with fx as (
        select distinct on (e.document_id) e.id as extraction_id, e.document_id
        from clara.document_extractions e
        where e.engine_kind = 'invoice_facts' and e.status = 'done'
        order by e.document_id, e.version_n desc, e.id desc
      ), scored as (
        select fx.document_id,
          exists(select 1 from clara.document_regions r
                 where r.extraction_id = fx.extraction_id and r.field_path = 'invoice.total') as has_total,
          (select nullif(btrim(min(r.text_content)),'') from clara.document_regions r
           where r.extraction_id = fx.extraction_id and r.field_path = 'invoice.invoice_id') as invoice_id
        from fx
      )
      select
        count(*) filter (where has_total) as processed,
        count(*) filter (where has_total and invoice_id is not null) as with_id
      from scored;`;
    const { rows } = await client.query(sql);
    const processed = Number(rows[0]?.processed ?? 0);
    const withId = Number(rows[0]?.with_id ?? 0);
    const rate = processed ? ((100 * withId) / processed).toFixed(1) : "n/a";
    console.log("invoice_id capture on the LIVE persisted corpus");
    console.log("(latest invoice_facts extraction per document; mirrors _invoice_fact_state):\n");
    console.log(`  processed bills (have invoice.total) : ${processed}`);
    console.log(`  with a non-empty invoice.invoice_id  : ${withId}`);
    console.log(`  capture rate                         : ${withId}/${processed}  (${rate}%)`);
  } finally {
    await client.end();
  }
}

const mode = (process.argv[2] || "fixtures").toLowerCase();
if (mode === "live") {
  runLive().catch((e) => {
    console.error("live measurement failed:", e?.message ?? e);
    process.exit(1);
  });
} else if (mode === "fixtures") {
  runFixtures(process.argv.slice(2));
} else if (mode === "totals") {
  runTotals(process.argv.slice(2));
} else {
  console.error(`unknown mode '${mode}'. usage: measure-invoice-id-capture.mjs [fixtures|totals|live] [--payloads <file.json>]`);
  process.exit(2);
}
