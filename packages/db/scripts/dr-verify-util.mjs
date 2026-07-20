// dr-verify-util — pure helpers + constants for the DR verification battery.
// Split out of dr-verify.mjs to keep each module under the repo's file-size cap.

// Schemas allowed to be ASYMMETRIC (present on one side only) without FAILing.
// {spike} is the only intentionally-excluded USER schema (Slice-0 cruft). Platform
// schemas are Supabase/system-managed and legitimately differ between a live source and
// a fresh target, so they are INFO — any OTHER asymmetric user schema FAILs (Codex
// NIT-1): it is almost certainly a durable schema missing from AUTHORITATIVE_SCHEMAS.
export const SCHEMA_ALLOWLIST = new Set(["spike"]);
export const PLATFORM_SCHEMAS = new Set([
  "public", "auth", "storage", "extensions", "net", "vault", "cron", "realtime",
  "graphql", "graphql_public", "supabase_functions", "supabase_migrations", "pgsodium",
  "pgsodium_masks", "_analytics", "_realtime", "pgbouncer", "tiger", "tiger_data",
  "topology", "pgtle",
]);

/** host:port/db label from a DSN — NEVER the user/password (mirrors lib/pg.mjs). */
export function labelFor(url) {
  try {
    const u = new URL(url);
    const db = decodeURIComponent((u.pathname || "").replace(/^\//, "")) || "postgres";
    return `${(u.hostname || "").toLowerCase()}:${u.port || "5432"}/${db}`;
  } catch {
    return "(unparseable URL)";
  }
}

/** Quote a catalog identifier for interpolation into a dynamic query. */
export function ident(name) {
  return '"' + String(name).replace(/"/g, '""') + '"';
}

// A recursive, stable serializer (Codex HIGH-4): sorts nested object keys, preserves
// arrays, nesting, null, and bigint — the old JSON.stringify(obj, keys) replacer dropped
// NESTED keys, so a value drift inside a jsonb column went unseen.
export function stableStr(v) {
  if (v === null || v === undefined) return "null";
  if (typeof v === "bigint") return "B" + v.toString();
  if (Array.isArray(v)) return "[" + v.map(stableStr).join(",") + "]";
  if (typeof v === "object") {
    return "{" + Object.keys(v).sort().map((k) => JSON.stringify(k) + ":" + stableStr(v[k])).join(",") + "}";
  }
  return JSON.stringify(v);
}

// MULTISET diff (Codex HIGH-4): keep duplicate counts — the old Set() dropped multiplicity,
// so a duplicated grant/policy row could hide a missing one.
export function multisetDiff(aRows, bRows) {
  const count = (rows) => {
    const m = new Map();
    for (const r of rows) {
      const k = stableStr(r);
      m.set(k, (m.get(k) || 0) + 1);
    }
    return m;
  };
  const ca = count(aRows);
  const cb = count(bRows);
  const onlyA = [];
  const onlyB = [];
  for (const [k, n] of ca) {
    const m = cb.get(k) || 0;
    if (n > m) onlyA.push(n - m > 1 ? `${k} (x${n - m})` : k);
  }
  for (const [k, n] of cb) {
    const m = ca.get(k) || 0;
    if (n > m) onlyB.push(n - m > 1 ? `${k} (x${n - m})` : k);
  }
  return { onlyA, onlyB, equal: onlyA.length === 0 && onlyB.length === 0, n: aRows.length };
}

export async function tableExists(client, schema, table) {
  const r = await client.query(
    "select 1 from information_schema.tables where table_schema=$1 and table_name=$2",
    [schema, table],
  );
  return r.rowCount > 0;
}
export async function tablesOf(client, schema) {
  const r = await client.query(
    "select table_name from information_schema.tables where table_schema=$1 and table_type='BASE TABLE' order by 1",
    [schema],
  );
  return r.rows.map((x) => x.table_name);
}
export async function schemaPresent(client, schema) {
  const r = await client.query("select 1 from pg_namespace where nspname=$1", [schema]);
  return r.rowCount > 0;
}
