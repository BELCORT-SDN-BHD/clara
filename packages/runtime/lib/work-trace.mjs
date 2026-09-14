// THE WORK EXECUTION TRACE WRITER, and the HARDENED redaction in front of it (#631 AC3/AC4).
//
// THREE LAYERS, AND THIS MODULE IS ONLY THE THIRD.
//
//   1. STRUCTURE. `clara.work_execution_traces` (migration 0195) has NO FREE PAYLOAD COLUMN — no
//      payload, input, output, `attributes`, content, prompt, messages, basis or transcript
//      column. A relation with nowhere to put a transcript cannot leak one however this module is
//      called.
//
//   2. CONSTRAINT, IN THE DATABASE. Structure alone was not the claim the first cut made, and the
//      adversarial review proved it: `refusal` and `skills` were free jsonb, an
//      `observed_revisions` VALUE was free text and seven id/text columns were unconstrained, so
//      ONE ordinary call stored an NRIC, a bank run, an email, a phone, a JWT, a `Bearer` header
//      and a `postgres://` DSN verbatim. 0195 SECTION 7B now gives every remaining column a
//      grammar — a lowercase token for the ids, a bounded vendor token for the model, an array of
//      ≤ 32 ids for `skills`, a digest-or-token for each observed revision, and a CLOSED five-key
//      shape for `refusal` whose free-text halves are capped and refused outright when they carry
//      a secret-shaped literal. `clara.record_work_execution_trace` raises CLR10 `invalid_trace`
//      naming the field; the CHECK constraints refuse it again whatever the writer does.
//
//   3. HYGIENE, HERE. This module REDACTS EVERY VALUE IT SENDS before the call — the ids, the
//      model, the skills, the observed revisions and the refusal, not only the refusal as the
//      first cut did — so the ordinary path is redacted rather than refused, and a diagnostic
//      survives instead of vanishing. `traceDigest` hashes the REDACTED form, so a digest can
//      never be inverted against a known secret, and `redactDeep` below is the hardened successor
//      to `lib/tracing.mjs`'s `redact`: the same cycle-guarded, array-aware walk with a wider key
//      denylist, SIX Malaysian-shaped PII patterns, and a depth cap that emits `[truncated]`
//      instead of recursing. Layer 3 is BEST-EFFORT and this comment says so; layers 1 and 2 are
//      what make the claim hold when a future caller is careless.
//
// Contrast `clara.trace_spans` (0006), which has an `attributes` jsonb and a best-effort
// `redact()` in front of it — and whose own header calls that hygiene rather than a guarantee
// (S4-ND8). Layer 2 is the difference.
//
// THIS FILE IS HASH-LOCKED. It is reached from the FROZEN `claraWork_v3` body by dynamic
// `import(...)`, which `scripts/check-frozen-workflows.mjs`'s import-closure scan matches, so it
// is registered in `frozen-workflows.json`. After #637's `--lock-deployed` ceremony a change here
// ships as a NEW frozen version (`claraWork_v4`) or in non-frozen infrastructure, never as an
// edit — which is exactly why layer 2 lives in the database, where a later migration can tighten
// it without a runtime cutover. Recorded in docs/ARCHITECTURE.md §10 and in 0195's header.
//
// IT NEVER DECIDES ANYTHING. A trace is a diagnostic. `recordTrace` THROWS on a database refusal —
// so `packages/runtime/tests/work-trace-redaction.test.mjs` can see the closed-vocabulary refusal —
// and every CALLER in `claraWork.v3.impl.ts` wraps it, because a Work that failed to post because
// its diagnostic row would not write would be the diagnostic deciding the accounting.
//
// DEADLOCK DISCIPLINE (ARCHITECTURE §6, 0184). Every row except the settle row is written OUTSIDE
// the posting transaction, on the runtime pool; the SETTLE row is written INSIDE the settle
// transaction, in a SAVEPOINT, so a refused diagnostic can never roll back a settle. The insert
// takes NO lock on `clara.accounting_work`: 0195's relation carries no foreign key to it, because
// an FK takes `FOR KEY SHARE` against the posting core's `FOR UPDATE` and the review measured a
// trace insert waiting 4001 ms behind a posting lock and then dying silently. The lock order
// accounting_work → agent_tasks → agent_interruptions is untouched.

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

// ---------------------------------------------------------------------------
// 1b. THE FIELD GRAMMARS, mirrored from migration 0195 SECTION 7B.
//
// The DATABASE is the wall: `clara.record_work_execution_trace` raises CLR10 `invalid_trace` and
// the relation's CHECK constraints refuse the row again. These mirrors exist so the ORDINARY path
// never meets that wall — a value this module cannot conform is DROPPED (the column goes null)
// rather than sent, because a trace row missing one id is a usable diagnostic and a refused row is
// none at all. Keep them in step with 0195 SECTION 7B; the tail census asserts the SQL half by
// value, and `tests/work-trace-redaction.test.mjs` asserts this half against the same literals.
// ---------------------------------------------------------------------------

const ID_RE = /^[a-z0-9][a-z0-9_./-]{0,127}$/;
const MODEL_RE = /^[A-Za-z0-9][A-Za-z0-9_.:/@-]{0,127}$/;
const RUN_RE = /^[A-Za-z0-9][A-Za-z0-9_.:/-]{0,200}$/;
const TOKEN_RE = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,63}$/;
const REV_RE = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/;
const DIGEST_RE = /^[0-9a-f]{64}$/;
const LONG_DIGITS = /[0-9]{8,}/;
const FREE_MAX = 500;

/** The secret shapes 0195's `clara._work_trace_secret_shaped` refuses, spelled the same way. */
const SECRET_SHAPED = [
  /[0-9]{6}-[0-9]{2}-[0-9]{4}/,
  /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/,
  /eyJ[A-Za-z0-9._-]{10,}/,
  /\bbearer\s/i,
  /(postgres|postgresql|mysql|mongodb|redis|amqp)s?:\/\//i,
  /\b(sk|pk|rk|ak)[-_](live|test|proj|ant|or)?[-_]?[A-Za-z0-9]{16,}/i,
  /\b(password|passphrase|secret|api[-_]?key|access[-_]?token|token)\s*[=:]/i,
];

const secretShaped = (s) => SECRET_SHAPED.some((re) => re.test(s));

function conform(value, re, { digits = true } = {}) {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  if (s === "") return null;
  if (!re.test(s)) return null;
  if (digits && LONG_DIGITS.test(s)) return null;
  if (secretShaped(s)) return null;
  return s;
}

/** A capability / registry / bundle / instructions / tools / skill id, or null. */
export const traceIdOf = (v) => conform(v, ID_RE);
/** A vendor model id, or null. */
export const traceModelOf = (v) => conform(v, MODEL_RE);
/** A short code / reason token, or null. */
export const traceTokenOf = (v) => conform(v, TOKEN_RE);
/** A workflow run id, or null. NOT applied to the value this module SENDS — see `recordTrace`
 *  — but exported so a caller (and the battery) can ask what the database asks. */
export const traceRunOf = (v) => conform(v, RUN_RE, { digits: false });
/** An observed-revision VALUE: a sha256 digest, a finite number, a short token, or null. */
export function traceRevisionOf(v) {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  if (DIGEST_RE.test(s)) return s;
  return conform(s, REV_RE);
}

/**
 * A bounded, redacted, control-character-free diagnostic string — the only free text this module
 * sends. `redactString` first (so a known shape becomes a MASK rather than a refusal), then the
 * residual long digit runs that `redactString`'s bounded patterns do not reach, then the cap.
 */
export function boundedText(value, max = FREE_MAX) {
  let out = redactString(String(value ?? ""));
  // Control characters, without a control-character regex (eslint no-control-regex): a refusal
  // message carrying a newline would be refused by 0195's `free` grammar and the row dropped.
  out = Array.from(out)
    .map((ch) => { const cp = ch.codePointAt(0); return cp < 0x20 || cp === 0x7f ? " " : ch; })
    .join("");
  out = out.replace(/[0-9]{10,}/g, "[redacted:digits]");
  out = out.replace(/\s+/g, " ").trim();
  if (out.length > max) out = `${out.slice(0, max - 1)}…`;
  return secretShaped(out) ? REDACTED : out;
}

/** The CLOSED key set `clara.work_execution_traces.refusal` admits. The estate's own refusal
 *  payloads (`workErrorPayload`, `egressRefusalPayload`, `budgetExhaustedPayload`) are exactly
 *  these five keys, which is why the closed set is five and not three. */
export const REFUSAL_KEYS = Object.freeze(["code", "reason", "message", "detail", "recoverable"]);

/**
 * Conform any refusal-shaped value to the closed shape. An unknown key is DROPPED rather than
 * carried: a `{transcript: …}` bag under a refusal is exactly the payload slot layer 1 removed.
 */
export function normaliseRefusal(input) {
  if (input === null || input === undefined) return null;
  if (typeof input !== "object" || Array.isArray(input)) return { message: boundedText(input) };
  const out = {};
  for (const key of REFUSAL_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(input, key)) continue;
    const v = input[key];
    if (v === null || v === undefined) continue;
    if (key === "recoverable") { out.recoverable = v === true; continue; }
    if (key === "code" || key === "reason") {
      const token = traceTokenOf(v);
      if (token !== null) out[key] = token;
      continue;
    }
    out[key] = boundedText(typeof v === "string" ? v : JSON.stringify(redactDeep(v)));
  }
  return out;
}

/** At most 32 skill IDS. Anything that is not one is dropped. */
export function normaliseSkills(input) {
  if (!Array.isArray(input)) return [];
  const out = [];
  for (const item of input) {
    const id = traceIdOf(item);
    if (id !== null) out.push(id);
    if (out.length === 32) break;
  }
  return out;
}

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

/** Keep only the keys the vocabulary carries, and conform each VALUE to the revision grammar — a
 *  digest, a number or a short token. The first cut only redacted the value, which left an
 *  observed revision as a free-text slot the database would still store (measured by the review);
 *  a value that is not a revision is now DROPPED. A caller that wants the database's refusal —
 *  the positive control — passes its object straight to `recordTrace`. */
export function observedRevisions(input) {
  const out = {};
  if (input === null || typeof input !== "object" || Array.isArray(input)) return out;
  for (const key of OBSERVED_REVISION_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(input, key)) continue;
    const v = traceRevisionOf(input[key]);
    if (v === null) continue;
    out[key] = v;
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
  // EVERY VALUE THIS CALL SENDS IS CONFORMED FIRST — not only the refusal, as the first cut did.
  // `runId` is the exception and deliberately so: it is the WDK's own run identifier and it is
  // half of the `(work_id, run_id, seq)` replay identity, so a mangled one would double-trace a
  // re-executed step. It is machine-generated, never derived from client content, and 0195's `run`
  // grammar refuses a malformed one at the door.
  const safeSkills = normaliseSkills(skills);
  const safeObserved = observedRevisions(observed ?? {});
  const safeRefusal = normaliseRefusal(refusal);
  const r = await exec.query(
    `select clara.record_work_execution_trace($1::uuid,$2::text,$3::int,$4::text,
       $5::text,$6::text,$7::text,$8::text,$9::text,$10::jsonb,$11::text,$12::text,$13::text,
       $14::uuid,$15::text,$16::jsonb,$17::timestamptz,$18::timestamptz,$19::text,$20::jsonb,
       $21::uuid) as id`,
    [
      taskId, runId, seq, phase,
      traceIdOf(capabilityId), traceIdOf(registryVersion),
      traceIdOf(bundleId), bundleDigest, traceIdOf(instructionsId), JSON.stringify(safeSkills),
      traceIdOf(toolsId),
      traceModelOf(modelId),
      // The purpose defaults to the REGISTRY's answer for this capability, so a caller cannot
      // quietly record a different one. The database overrides it again from the authorization row
      // when one is named.
      traceTokenOf(purpose === undefined ? (cap?.purpose ?? null) : purpose),
      authorizationId,
      inputDigest, JSON.stringify(safeObserved),
      startedAt, endedAt, outcome,
      safeRefusal === null ? null : JSON.stringify(safeRefusal),
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
