// THE WORK EXECUTION TRACE WRITER, and the HARDENED redaction in front of it (#631 AC3/AC4).
//
// TWO LAYERS, AND THE FIRST ONE IS THE REAL CONTROL.
//
//   1. STRUCTURE. `clara.work_execution_traces` (migration 0195) HAS NO PAYLOAD COLUMN. Not a
//      redacted one, not a truncated one, not an `attributes` bag. A relation with nowhere to put
//      a payload cannot leak one however this module is called, which is the only version of
//      "sensitive fields do not reach the trace" that survives a future careless caller. Contrast
//      `clara.trace_spans` (0006), which has an `attributes` jsonb and a best-effort `redact()` in
//      front of it — and whose own header calls that hygiene rather than a guarantee (S4-ND8).
//
//   2. HYGIENE. What this module still sends is a DIGEST of the input and a small closed-key
//      object of observed revisions. `traceDigest` hashes the REDACTED form, so a digest can never
//      be inverted against a known secret, and `redactDeep` below is the hardened successor to
//      `lib/tracing.mjs`'s `redact`: the same cycle-guarded, array-aware walk with a wider key
//      denylist, SIX Malaysian-shaped PII patterns, and a depth cap that emits `[truncated]`
//      instead of recursing. It is still BEST-EFFORT and this comment says so; layer 1 is what
//      makes the claim structural.
//
// IT NEVER DECIDES ANYTHING. A trace is a diagnostic. `recordTrace` THROWS on a database refusal —
// so `packages/runtime/tests/work-trace-redaction.test.mjs` can see the closed-vocabulary refusal —
// and every CALLER in `claraWork.v3.impl.ts` wraps it, because a Work that failed to post because
// its diagnostic row would not write would be the diagnostic deciding the accounting.
//
// DEADLOCK DISCIPLINE (ARCHITECTURE §6, 0184). Every row except the settle row is written OUTSIDE
// the posting transaction, on the runtime pool, and the writer takes no lock on
// `clara.accounting_work` or `clara.agent_tasks` beyond the FK key-share its own insert needs. The
// lock order accounting_work → agent_tasks → agent_interruptions is untouched.

import { CAPABILITY_REGISTRY_VERSION, capability } from "./capability-registry.mjs";

export { CAPABILITY_REGISTRY_VERSION };

// ---------------------------------------------------------------------------
// 1. THE HARDENED REDACTION.
// ---------------------------------------------------------------------------

/** Attribute KEYS whose values are dropped wholesale (case-insensitive substring). The
 *  `lib/tracing.mjs` denylist, widened by the identity and contact keys a Malaysian bookkeeping
 *  estate actually carries. */
const DENY_KEY_RE =
  /(authorization|password|passphrase|secret|api[-_]?key|access[-_]?token|refresh[-_]?token|bearer|cookie|session[-_]?id|connection[-_]?string|dsn|wake_secret|private[-_]?key|nric|ic[-_]?number|identity[-_]?card|passport|bank[-_]?account|account[-_]?number|iban|swift|card[-_]?number|cvv|email|phone|mobile|msisdn|address)/i;

/** VALUE patterns redacted inline even under an innocuous key. Best-effort, and ordered so the
 *  most specific shapes are consumed before the general digit runs. */
const VALUE_PATTERNS = Object.freeze([
  // JWT-shaped — three base64url segments, or the AI-SDK/vendor `eyJ...` prefix on its own.
  [/\beyJ[A-Za-z0-9._-]{10,}/g, "[redacted:jwt]"],
  [/\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi, "[redacted:bearer]"],
  // Connection strings with credentials.
  [/\b(?:postgres|postgresql|mysql|mongodb(?:\+srv)?|redis|amqp)s?:\/\/[^\s"']*/gi, "[redacted:dsn]"],
  // key=value secrets under any spelling.
  [/\b(password|passphrase|secret|api[-_]?key|access[-_]?token|token)\s*[=:]\s*[^\s"';,&]+/gi, "[redacted:secret]"],
  // Vendor api-key shapes (OpenAI/Anthropic/Google/Stripe families).
  [/\b(?:sk|pk|rk|ak)[-_](?:live|test|proj|ant|or)?[-_]?[A-Za-z0-9]{16,}/g, "[redacted:apikey]"],
  // MALAYSIAN NRIC — YYMMDD-PB-###G. The single most identifying string in this domain.
  [/\b\d{6}-\d{2}-\d{4}\b/g, "[redacted:nric]"],
  // Malaysian mobile / landline, with or without the +60 country code and with any of the
  // separator habits a person actually types (`+60 12-345 6789`, `+60123456789`, `03-7728 1122`).
  [/\+?60[\s-]?\d{1,2}[\s-]?\d{3,4}[\s-]?\d{4}\b/g, "[redacted:phone]"],
  [/\b0\d{1,2}[\s-]?\d{3,4}[\s-]?\d{4}\b/g, "[redacted:phone]"],
  // Email.
  [/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, "[redacted:email]"],
  // Bank account / card runs: 10-19 digits, optionally grouped. AFTER the NRIC and phone patterns
  // so their own separators are not eaten first.
  [/\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{0,7}\b/g, "[redacted:account]"],
  [/\b\d{10,19}\b/g, "[redacted:account]"],
]);

const REDACTED = "[redacted]";
const TRUNCATED = "[truncated]";

/** The depth at which the walk STOPS and emits `[truncated]`. Seven, not eight, because #631's
 *  positive control plants a secret at depth 7 inside arrays of objects and a cap that admitted it
 *  would be a cap that proves nothing. */
export const MAX_DEPTH = 7;

export function redactString(s) {
  let out = String(s);
  for (const [re, mask] of VALUE_PATTERNS) out = out.replace(re, mask);
  return out;
}

/**
 * Deep-copy `value` with sensitive KEYS dropped, sensitive VALUE patterns masked, arrays walked
 * element by element, cycles broken and depth capped. Pure; never throws on cyclic, huge or exotic
 * input.
 *
 * A KEY ON THE DENYLIST IS DROPPED WHOLESALE even when its value is an object or an array: an
 * `identity: { nric: "...", passport: "..." }` bag redacted key by key would still say how many
 * identifiers a person has.
 */
export function redactDeep(value, depth = 0, seen = new WeakSet()) {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return redactString(value);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "bigint") return String(value);
  if (typeof value === "function" || typeof value === "symbol") return REDACTED;
  if (typeof value !== "object") return redactString(String(value));
  if (value instanceof Date) return value.toISOString();
  if (depth >= MAX_DEPTH) return TRUNCATED;
  if (seen.has(value)) return "[circular]";
  seen.add(value);
  if (Array.isArray(value)) return value.map((v) => redactDeep(v, depth + 1, seen));
  const out = {};
  for (const [k, v] of Object.entries(value)) {
    out[k] = DENY_KEY_RE.test(k) ? REDACTED : redactDeep(v, depth + 1, seen);
  }
  return out;
}

/** Key-sorted JSON, so a digest is a fact about the VALUE rather than about key order. */
function canonical(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`).join(",")}}`;
}

/**
 * The `input_digest` a trace row carries: sha256 hex of the canonical JSON of the REDACTED value.
 *
 * REDACTED FIRST, AND THAT ORDER IS THE POINT. A digest of the RAW input is a perfect oracle for
 * anyone holding a candidate secret — hash the guess, compare. Hashing the redacted form means the
 * digest identifies the SHAPE of the step's input and nothing about the person in it.
 */
export async function traceDigest(value) {
  const { createHash } = await import("node:crypto");
  return createHash("sha256").update(canonical(redactDeep(value)), "utf8").digest("hex");
}

// ---------------------------------------------------------------------------
// 2. THE OBSERVED-REVISION VOCABULARY.
// ---------------------------------------------------------------------------

/** The CLOSED key set `clara.record_work_execution_trace` admits. Spelled here so a caller is
 *  refused before a round trip; the DATABASE refuses it again, which is what makes the vocabulary
 *  a wall rather than a convention. */
export const OBSERVED_REVISION_KEYS = Object.freeze([
  "knowledge_version", "books_version", "chart_revision", "basis_digest",
  "source_sha256", "question_version",
]);

/** Keep only the keys the vocabulary carries, and redact the values (they are ids and digests, so
 *  redaction is a no-op in the ordinary case and a wall in the careless one). A caller that wants
 *  the database's refusal — the positive control — passes its object straight to `recordTrace`. */
export function observedRevisions(input) {
  const out = {};
  if (input === null || typeof input !== "object" || Array.isArray(input)) return out;
  for (const key of OBSERVED_REVISION_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(input, key)) continue;
    const v = input[key];
    if (v === null || v === undefined) continue;
    out[key] = typeof v === "string" ? redactString(v) : redactDeep(v);
  }
  return out;
}

// ---------------------------------------------------------------------------
// 3. THE WRITER.
// ---------------------------------------------------------------------------

/** The four phases, in the order one run walks them. */
export const TRACE_PHASES = Object.freeze(["dispatch", "model_call", "tool_call", "settle"]);

/** The five outcomes a step can settle to. */
export const TRACE_OUTCOMES = Object.freeze(["ok", "refused", "failed", "cancelled", "skipped"]);

/**
 * Write ONE execution-trace row through `clara.record_work_execution_trace`.
 *
 * `exec` is any object with `.query(sql, params)` on a **clara_runtime** connection — the runtime
 * pool's `withRuntime` callback argument, or a rig client in a test.
 *
 * THROWS on a database refusal. Every caller in the frozen v3 closure wraps it: a diagnostic that
 * could refuse a posting would be the diagnostic deciding the accounting.
 */
export async function recordTrace(exec, {
  taskId, runId, seq, phase,
  capabilityId = null, registryVersion = CAPABILITY_REGISTRY_VERSION,
  bundleId = null, bundleDigest = null, instructionsId = null, skills = [], toolsId = null,
  modelId = null, purpose = undefined, authorizationId = null,
  inputDigest = null, observed = {},
  startedAt = null, endedAt = null, outcome = "ok", refusal = null, receiptId = null,
}) {
  const cap = capabilityId === null ? null : capability(capabilityId);
  const r = await exec.query(
    `select clara.record_work_execution_trace($1::uuid,$2::text,$3::int,$4::text,
       $5::text,$6::text,$7::text,$8::text,$9::text,$10::jsonb,$11::text,$12::text,$13::text,
       $14::uuid,$15::text,$16::jsonb,$17::timestamptz,$18::timestamptz,$19::text,$20::jsonb,
       $21::uuid) as id`,
    [
      taskId, runId, seq, phase,
      capabilityId, registryVersion,
      bundleId, bundleDigest, instructionsId, JSON.stringify(skills ?? []), toolsId,
      modelId,
      // The purpose defaults to the REGISTRY's answer for this capability, so a caller cannot
      // quietly record a different one. The database overrides it again from the authorization row
      // when one is named.
      purpose === undefined ? (cap?.purpose ?? null) : purpose,
      authorizationId,
      inputDigest, JSON.stringify(observed ?? {}),
      startedAt, endedAt, outcome,
      refusal === null || refusal === undefined ? null : JSON.stringify(redactDeep(refusal)),
      receiptId,
    ],
  );
  return r.rows[0]?.id ?? null;
}

/** A monotone step counter for ONE run. The database's `(work_id, run_id, seq)` unique is what
 *  makes a WDK re-execution replay onto the same row rather than double-tracing, so a counter that
 *  restarts at 1 on a re-executed step is CORRECT: the same step gets the same seq. */
export function newTraceSeq() {
  let n = 0;
  return () => {
    n += 1;
    return n;
  };
}
