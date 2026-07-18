// The trace store writer (Slice 4, contract §3.7 / §0.8). Spans are upserted into
// clara.trace_spans keyed by (trace_id, span_id); the firm and task identity are
// DERIVED IN THE DB from the task row (a span-id collision can never cross firms,
// S4-D9). Grants are runtime-only (human AND agent_ro denied — rig-asserted).
//
// There is NO vendor / OTLP export code path AT ALL (vendor export OFF by
// ABSENCE, ruling 8). Access-control + the 90-day audited prune are the privacy
// control; the redaction denylist below is BEST-EFFORT hygiene, not a guarantee
// (S4-ND8) — it scrubs the obviously-sensitive before a span is persisted so a
// stray credential in an attribute bag does not land in durable storage.

// Attribute KEYS whose values are dropped wholesale (case-insensitive substring).
const DENY_KEY_RE = /(authorization|password|secret|api[-_]?key|access[-_]?token|bearer|cookie|connection[-_]?string|dsn|wake_secret)/i;

// VALUE patterns redacted inline even under an innocuous key (best-effort).
const VALUE_PATTERNS = [
  /Bearer\s+[A-Za-z0-9._\-]+/gi, // bearer tokens
  /eyJ[A-Za-z0-9._\-]{10,}/g, // JWT-shaped
  /\b(?:postgres|postgresql|mysql|mongodb(?:\+srv)?):\/\/[^\s"']*/gi, // connection strings w/ creds
  /(password|secret|api[-_]?key|token)\s*[=:]\s*[^\s"';,&]+/gi, // key=value secrets
];

const REDACTED = "[redacted]";
const MAX_DEPTH = 8;

/**
 * Deep-copy `value` with sensitive keys dropped and sensitive value patterns
 * masked. Pure; never throws on cyclic/large input (bounded depth, cycle guard).
 * @param {unknown} value
 * @returns {unknown}
 */
export function redact(value, _depth = 0, _seen = new WeakSet()) {
  if (value == null) return value;
  if (typeof value === "string") return redactString(value);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (_depth >= MAX_DEPTH) return "[truncated]";
  if (typeof value === "object") {
    if (_seen.has(value)) return "[circular]";
    _seen.add(value);
    if (Array.isArray(value)) return value.map((v) => redact(v, _depth + 1, _seen));
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = DENY_KEY_RE.test(k) ? REDACTED : redact(v, _depth + 1, _seen);
    }
    return out;
  }
  return String(value);
}

function redactString(s) {
  let out = s;
  for (const re of VALUE_PATTERNS) out = out.replace(re, REDACTED);
  return out;
}

/**
 * Upsert one span DIRECTLY into clara.trace_spans (0006 grants clara_runtime
 * insert/update; the BEFORE trigger derives firm_id from the task and pins the
 * task immutable — a span-id collision can never cross firms, S4-D9). The upsert
 * key is (trace_id, span_id). `attributes` is redacted (best-effort) first.
 * @param {import("pg").ClientBase} client  a clara_runtime connection
 * @param {{traceId: string, spanId: string, taskId: string, name?: string,
 *          parentSpanId?: string|null, startedAt?: Date|string,
 *          endedAt?: Date|string|null, attributes?: unknown}} span
 */
export async function recordSpan(client, span) {
  const attrs = span.attributes === undefined ? {} : redact(span.attributes);
  await client.query(
    `insert into clara.trace_spans (trace_id, span_id, task_id, parent_span_id, name, started_at, ended_at, attributes)
       values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
     on conflict (trace_id, span_id) do update
       set name = excluded.name, ended_at = excluded.ended_at, attributes = excluded.attributes`,
    [
      span.traceId,
      span.spanId,
      span.taskId,
      span.parentSpanId ?? null,
      span.name ?? null,
      span.startedAt ?? new Date(),
      span.endedAt ?? null,
      JSON.stringify(attrs),
    ],
  );
}
