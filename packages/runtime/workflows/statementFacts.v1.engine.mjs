// READER-2 for the bank-statement lane — the Azure Document Intelligence prebuilt
// BANK STATEMENT adapter (Wave C-b design §4.3). INFRASTRUCTURE, not part of the frozen
// statementFacts_v1 closure: it is assembled in `statementFacts.v1.services.mjs` and
// injected via globalThis by the supervisor, exactly as `invoiceFacts.v1.azure.mjs` is for
// the invoice lane (the AB-16 precedent), so vendor/model/deadline tuning is never a
// workflow-version change.
//
// SEAM SHAPE, deliberately identical to `invoiceFacts.v1.azure.mjs`: one absolute deadline
// covering submission, every 429 wait and all polling (a Retry-After can never extend the
// operation past it); a `DocumentEngineError` with the same code vocabulary the frozen
// behaviours already classify as transient-vs-terminal; a RELAY_TEST_MODE injection point
// so no test ever reaches the network; and a normalization version hashed together with the
// raw response so a re-extraction is a genuinely new fact set, never a silent supersede.
//
// WHAT THIS READER MUST PRODUCE, and why it reads the response twice. Corroboration (§4.3)
// requires the FULL load-bearing header — institution, account number, currency, period
// bounds, statement date, printed opening/closing AND the printed TOTAL DEBIT / TOTAL
// CREDIT — plus the per-line numeric skeleton. The prebuilt bank-statement model types most
// of that but has NO field for the printed debit/credit totals, and a Malaysian statement
// prints them on every page. So the normalizer does what the invoice lane already does with
// `invoice-totals-reader.mjs`: after the typed pass, it runs the SHARED label-anchored read
// (`readHeaderFromTextLines`) over THIS RESPONSE'S OWN `pages[].lines[]` and fills what the
// typed fields did not carry. The typed field WINS wherever both spoke — the label scan is
// a completion, never an override.
//
// INDEPENDENCE, stated precisely. Reader-1 reads the layout extraction committed at intake
// (Azure prebuilt-LAYOUT, a different model, a different run, already stored as rows a
// reviewer can re-derive from). Reader-2 reads a FRESH prebuilt-bankStatement response over
// the original bytes. They share a label vocabulary — the printed words on the page — and
// no figure. That is what makes "the readers agreed" mean something.
//
// AVAILABILITY IS A BUILD-TIME VERIFY (design §5). `prebuilt-bankStatement.us` is a
// regional model and may not be enabled on the deployment's Azure resource. When the model
// is absent the adapter raises `engine_unavailable` and the NAMED FALLBACK below — an
// LLM-structured read — is the documented replacement. THE FALLBACK IS A STUB IN THIS
// WAVE: it refuses loudly rather than pretending to read, because a half-built model read
// that returned a plausible header would corroborate against reader-1 for the wrong reason.

import { createReadStream } from "node:fs";
import { createHash } from "node:crypto";

import { readHeaderFromTextLines } from "../lib/statement-layout-reader.mjs";
import { applySign, parseMoneyCents, parseStatementDate, normalizeAccountNumber, matchInstitution } from "../lib/statement-grammar.mjs";

const API_VERSION = "2024-11-30";
/** Overridable so a deployment whose resource carries a different bank-statement model id
 *  (or a region-specific one) can point at it without a code change — the availability
 *  verify in the deploy runbook is what proves the configured id actually resolves. */
const MODEL = process.env.AZURE_DI_BANK_STATEMENT_MODEL || "prebuilt-bankStatement.us";

/** The pinned engine snapshot id for the statement_facts lane (design §4.3 / §5). */
export const AZURE_BANK_STATEMENT_ENGINE_SNAPSHOT = Object.freeze({
  engineId: `azure-di:${MODEL}:${API_VERSION}`,
  engineConfig: { provider: "azure-document-intelligence", model: MODEL, api_version: API_VERSION, region: "southeast-asia" },
  versionN: 1,
});

/** The deterministic normalization-policy version, hashed with the raw engine response.
 *  v1 (Wave C-b): typed prebuilt-bankStatement fields + the shared label-anchored header
 *  completion for the printed TOTAL DEBIT / TOTAL CREDIT the typed schema has no slot for. */
export const NORMALIZATION_VERSION = "clara-statement-norm:v1";

export class DocumentEngineError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "DocumentEngineError";
    this.code = code;
  }
}

const remaining = (deadline) => Math.max(0, deadline - Date.now());

function delay(ms, signal) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    const abort = () => {
      clearTimeout(timer);
      reject(signal.reason || new Error("aborted"));
    };
    if (signal.aborted) abort();
    else signal.addEventListener("abort", abort, { once: true });
  });
}

function retryDelay(response, fallback = 1000) {
  const raw = response.headers.get("retry-after");
  if (!raw) return fallback;
  const seconds = Number(raw);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(raw);
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : fallback;
}

async function fetchWithin(fetchImpl, url, init, deadline, signal) {
  if (remaining(deadline) <= 0) throw new DocumentEngineError("timeout", "Azure DI total deadline exceeded");
  return fetchImpl(url, { ...init, signal });
}

/** The real Azure prebuilt bank-statement call — returns the full raw payload. */
export async function analyzeBankStatementReal({ filePath, mime, totalDeadlineMs = 180_000, fetchImpl = fetch }) {
  const endpoint = process.env.AZURE_DI_ENDPOINT?.replace(/\/+$/, "");
  const key = process.env.AZURE_DI_KEY;
  if (!endpoint || !key) throw new DocumentEngineError("engine_error", "Azure DI configuration is missing");
  const deadline = Date.now() + totalDeadlineMs;
  const controller = new AbortController();
  const hardTimer = setTimeout(() => controller.abort(new Error("Azure DI total deadline exceeded")), totalDeadlineMs);
  const analyzeUrl = `${endpoint}/documentintelligence/documentModels/${MODEL}:analyze?api-version=${API_VERSION}`;
  try {
    let response;
    while (true) {
      response = await fetchWithin(
        fetchImpl,
        analyzeUrl,
        { method: "POST", headers: { "ocp-apim-subscription-key": key, "content-type": mime }, body: createReadStream(filePath), duplex: "half" },
        deadline,
        controller.signal,
      );
      if (response.status !== 429) break;
      const wait = retryDelay(response);
      if (wait >= remaining(deadline)) throw new DocumentEngineError("timeout", "Azure DI 429 exceeded the total deadline");
      await delay(wait, controller.signal);
    }
    // A 404 here is the model-availability signal, NOT a bad document: the resource does
    // not carry `MODEL`. It gets its own code so the named fallback can be reached without
    // mistaking an unbuilt deployment for an unreadable statement.
    if (response.status === 404) {
      throw new DocumentEngineError("engine_unavailable", `Azure DI model ${MODEL} is not available on this resource`);
    }
    if (response.status !== 202) {
      throw new DocumentEngineError(response.status >= 500 ? "engine_error" : "bad_type", `Azure DI submission failed (${response.status})`);
    }
    const operation = response.headers.get("operation-location");
    if (!operation) throw new DocumentEngineError("engine_error", "Azure DI response omitted operation-location");
    while (true) {
      if (remaining(deadline) <= 0) throw new DocumentEngineError("timeout", "Azure DI total deadline exceeded");
      const poll = await fetchWithin(fetchImpl, operation, { headers: { "ocp-apim-subscription-key": key } }, deadline, controller.signal);
      if (poll.status === 429) {
        const wait = retryDelay(poll);
        if (wait >= remaining(deadline)) throw new DocumentEngineError("timeout", "Azure DI poll 429 exceeded the total deadline");
        await delay(wait, controller.signal);
        continue;
      }
      if (!poll.ok) throw new DocumentEngineError("engine_error", `Azure DI poll failed (${poll.status})`);
      const payload = await poll.json();
      const status = String(payload.status || "").toLowerCase();
      if (status === "succeeded") return payload;
      if (status === "failed" || status === "canceled") throw new DocumentEngineError("engine_error", `Azure DI operation ${status}`);
      const wait = Math.min(1000, remaining(deadline));
      if (wait <= 0) throw new DocumentEngineError("timeout", "Azure DI total deadline exceeded");
      await delay(wait, controller.signal);
    }
  } catch (err) {
    if (err instanceof DocumentEngineError) throw err;
    if (controller.signal.aborted) throw new DocumentEngineError("timeout", "Azure DI total deadline exceeded");
    throw new DocumentEngineError("engine_error", String(err?.message || err));
  } finally {
    clearTimeout(hardTimer);
  }
}

// --- normalization ----------------------------------------------------------------------

/** A typed field's value, whatever slot the schema used for it. Never coerces across
 *  kinds: a currency field asked for as a string returns null rather than a stringified
 *  object, because a stringified object would silently "agree" with nothing. */
function fieldString(field) {
  if (!field) return null;
  const v = field.valueString ?? field.content ?? null;
  return v == null ? null : String(v).trim() || null;
}

function fieldDate(field, period) {
  if (!field) return null;
  const raw = field.valueDate ?? field.content ?? null;
  if (raw == null) return null;
  const s = String(raw).trim();
  // Azure emits ISO for valueDate; a content fallback is whatever the page printed.
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return parseStatementDate(s, period ?? {});
}

/** A typed currency/number field → signed cents under the design's sign law, or null. */
function fieldCents(field) {
  if (!field) return null;
  const amount = field.valueCurrency?.amount ?? field.valueNumber ?? null;
  if (amount != null && Number.isFinite(Number(amount))) {
    const cents = Math.round(Number(amount) * 100);
    return Number.isSafeInteger(cents) ? cents : null;
  }
  const money = parseMoneyCents(field.content ?? "");
  return money ? (applySign(money) ?? money.cents) : null;
}

function fieldCurrencyCode(field) {
  const code = field?.valueCurrency?.currencyCode;
  return code ? String(code).toUpperCase() : null;
}

/** The response's own printed lines, in reading order — the substrate for the shared
 *  label-anchored header completion. Same shape `readHeaderFromTextLines` expects. */
export function responseTextLines(result) {
  const pages = Array.isArray(result?.pages) ? result.pages : [];
  const out = [];
  for (const page of pages) {
    for (const line of page.lines ?? []) {
      const polygon = Array.isArray(line.polygon) ? line.polygon : line.boundingRegions?.[0]?.polygon ?? [];
      out.push({
        text: String(line.content ?? ""),
        page: Number(page.pageNumber || 1),
        y: Number(polygon?.[1]) || 0,
        x: Number(polygon?.[0]) || 0,
      });
    }
  }
  return out.sort((a, b) => a.page - b.page || a.y - b.y || a.x - b.x);
}

/**
 * Raw Azure prebuilt bank-statement payload → the SAME `{header, lines, receipt}` shape
 * reader-1 produces, plus the vendor provenance the persist payload carries.
 *
 * Transaction sign law: the typed schema splits DEPOSIT and WITHDRAWAL into two fields, so
 * the side is stated rather than inferred — a deposit is `+` (into the account) and a
 * withdrawal is `−`. A row carrying both, or neither, is UNREADABLE and is counted in the
 * receipt rather than guessed: it will not corroborate against reader-1's count, which is
 * exactly the outcome an ambiguous row deserves.
 */
export function normalizeAzureBankStatement(payload) {
  const result = payload?.analyzeResult || payload || {};
  const doc = Array.isArray(result.documents) ? result.documents[0] : null;
  const fields = doc?.fields ?? {};
  const receipt = { reader: "azure_bank_statement", typed: !!doc, rows_seen: 0, rows_skipped: 0, completed_from_labels: [] };

  const periodStart = fieldDate(fields.StatementStartDate);
  const periodEnd = fieldDate(fields.StatementEndDate);
  const period = { start: periodStart, end: periodEnd };

  const printedAccount = fieldString(fields.AccountNumber);
  const bankName = fieldString(fields.BankName);
  const institution = bankName ? matchInstitution(bankName) : null;

  const typedHeader = {
    institution_code: institution?.code ?? null,
    institution_name: institution?.name ?? bankName,
    account_number: printedAccount,
    account_number_normalized: normalizeAccountNumber(printedAccount),
    currency: fieldCurrencyCode(fields.EndingBalance) ?? fieldCurrencyCode(fields.BeginningBalance),
    period_start: periodStart,
    period_end: periodEnd,
    statement_date: fieldDate(fields.StatementDate, period) ?? periodEnd,
    opening_cents: fieldCents(fields.BeginningBalance),
    closing_cents: fieldCents(fields.EndingBalance),
    // The typed schema has NO printed-totals slot; the label completion below supplies them.
    total_debit_cents: null,
    total_credit_cents: null,
  };

  // THE COMPLETION PASS. The typed field wins wherever it spoke; the label scan over this
  // response's own lines fills the rest. Every field it supplies is named in the receipt,
  // so a reviewer can always tell which half of reader-2 produced a given number.
  const scanned = readHeaderFromTextLines(responseTextLines(result));
  const header = { ...typedHeader };
  for (const [key, value] of Object.entries(scanned)) {
    if ((header[key] === null || header[key] === undefined) && value !== null && value !== undefined) {
      header[key] = value;
      receipt.completed_from_labels.push(key);
    }
  }

  const lines = [];
  for (const item of fields.Transactions?.valueArray ?? []) {
    receipt.rows_seen += 1;
    const t = item?.valueObject ?? {};
    const entryDate = fieldDate(t.Date, { start: header.period_start, end: header.period_end });
    const deposit = fieldCents(t.DepositAmount);
    const withdrawal = fieldCents(t.WithdrawalAmount);
    const hasDeposit = Number.isSafeInteger(deposit) && deposit !== 0;
    const hasWithdrawal = Number.isSafeInteger(withdrawal) && withdrawal !== 0;
    if (!entryDate || hasDeposit === hasWithdrawal) {
      receipt.rows_skipped += 1;
      continue;
    }
    lines.push({
      line_no: lines.length + 1,
      entry_date: entryDate,
      value_date: null,
      description: fieldString(t.Description),
      amount_cents: hasDeposit ? Math.abs(deposit) : -Math.abs(withdrawal),
      running_balance_cents: fieldCents(t.Balance),
    });
  }
  header.line_count = lines.length;

  const rawSha256 = createHash("sha256")
    .update(JSON.stringify(payload ?? {}) + "|" + NORMALIZATION_VERSION, "utf8")
    .digest("hex");
  const pagesUsed = Array.isArray(result.pages) ? result.pages.length : doc ? 1 : 0;
  return {
    header,
    lines,
    receipt,
    rawSha256,
    normalizationVersion: NORMALIZATION_VERSION,
    pagesUsed: pagesUsed || 1,
    engineId: AZURE_BANK_STATEMENT_ENGINE_SNAPSHOT.engineId,
    envelope: {
      schema_version: 1,
      engine: { id: AZURE_BANK_STATEMENT_ENGINE_SNAPSHOT.engineId, kind: "statement_facts", version_n: 1 },
      normalization_version: NORMALIZATION_VERSION,
      reader_receipt: receipt,
    },
  };
}

/**
 * THE NAMED FALLBACK — an LLM-STRUCTURED bank-statement read. **STUB IN WAVE C-b.**
 *
 * It exists as a declared seam, not as a working reader, and it refuses loudly. That is a
 * deliberate choice, not an omission: reader-2's ONLY job is to be an INDEPENDENT witness,
 * and a fallback that returned a partially-guessed header would corroborate against
 * reader-1 for the wrong reason and mint a `bank_statements` row on a read nobody made.
 * When the prebuilt model is unavailable the honest remedies are the ones the design names:
 * enable the model on the Azure resource, or key the statement by hand through
 * `enter_bank_statement` (design §4.3), whose actor becomes the recorded corroborator.
 *
 * Implementing this is a NAMED follow-on: it needs its own governed-egress purpose review,
 * its own prompt/schema pinning, and its own corroboration evidence before it may ever
 * stand in for a second reader.
 */
export async function llmStructuredBankStatementRead() {
  throw new DocumentEngineError(
    "engine_unavailable",
    "the LLM-structured bank-statement fallback is a declared seam and is NOT implemented in Wave C-b; "
      + "enable the prebuilt bank-statement model, or key the statement through enter_bank_statement",
  );
}

/** The injected service entry point. Test mode uses an injected adapter (no network). */
export async function analyzeBankStatement(filePath, mime, task) {
  if (process.env.RELAY_TEST_MODE === "1") {
    const adapter = globalThis.__claraAzureStatementForTest;
    if (!adapter) throw new DocumentEngineError("engine_error", "test Azure bank-statement adapter is not injected");
    return normalizeAzureBankStatement(await adapter({ filePath, mime, task }));
  }
  try {
    return normalizeAzureBankStatement(await analyzeBankStatementReal({ filePath, mime }));
  } catch (err) {
    if (err?.code !== "engine_unavailable") throw err;
    // The named fallback. It currently refuses — see its own header for why that refusal is
    // the correct behaviour rather than a gap.
    return llmStructuredBankStatementRead({ filePath, mime, task });
  }
}
