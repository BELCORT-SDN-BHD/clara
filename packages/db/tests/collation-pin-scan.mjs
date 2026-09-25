// #1047 — the collation-pin scanner: the shared instrument behind `collation-pin-scan.test.mjs`.
//
// THE RULE IT ENFORCES (`packages/db/README.md`, "Collation and pinned order"): a value that is
// PINNED — compared against a literal, or digested and compared against a digest literal — and
// that was produced by an aggregate ORDERED BY a text expression must spell `collate "C"` on that
// ORDER BY. Without it the pin records the server's `lc_collate` rather than the data: under
// glibc's `en_US.UTF-8` punctuation carries no primary weight and case is not a primary weight
// either, so `taxation` sorts before `tax_liabilities` and `clara_x` before `PUBLIC`, while under
// `C` both sort the other way round.
//
// THE TYPE ARGUMENT, which decides most sites without any measurement: an ORDER BY over a catalog
// `name` column cannot move, because the `name` type's own collation IS `C` (0149:858-861 says so
// in its own words, and `collation-pin-portability.test.mjs` re-measures it on the live server).
// A cast to `text`, an `information_schema.character_data` column such as `privilege_type`, and an
// ordinary `text` data column all sort under the DATABASE collation and are therefore movable.
//
// WHAT THIS FILE IS NOT. It is a text scanner, so it reads what a reviewer reads and nothing more:
// it cannot resolve an alias (`order by x`) to the expression behind it, and it says so by
// classifying such a key `unresolved` — which is treated as movable, never as safe.

/** `collate "C"` (or bare `collate C`) written onto a key. `C.utf8`/`C.UTF-8` are NOT accepted:
 *  they are libc locales whose name merely starts with C, not the built-in code-point collation. */
const COLLATE_C = /collate\s+(?:"C"|C(?![\w."-]))/i;

/** Catalog and information_schema identifier columns. Every one of these is of type `name`
 *  (information_schema's `sql_identifier` IS `name` in PostgreSQL 12 and later), and `name`'s type
 *  collation is `C`, so the ordering is by code point on every server. */
const CATALOG_NAME =
  /^(?:[a-z_][a-z0-9_]*\.)?(?:proname|relname|conname|tgname|polname|policyname|rolname|attname|nspname|typname|enumlabel|grantee|grantor|table_name|column_name|constraint_name|trigger_name|routine_name|schema_name|specific_name|index_name|sequence_name|udt_name|table_schema)$/i;

/** Keys whose ordering is numeric, an ordinality, or an oid — no collation involved. */
const INTEGER_KEY =
  /^(?:\d+|(?:[a-z_][a-z0-9_]*\.)?(?:ord|o|n|i|k|seq|idx|rn|oid|ordinal|ordinality|sort_order|sort_ordinal|ordinal_position|attnum|pronargs|enumsortorder|line_no|level|depth|objsubid|indexrelid))$/i;

/** uuid / integer surrogate keys: `id`, `x_id`. A uuid ORDERS as a uuid, not as text. */
const IDENTIFIER_KEY = /^(?:[a-z_][a-z0-9_]*\.)?(?:id|[a-z0-9_]+_id)$/i;

/** timestamp / date columns. */
const TIMESTAMP_KEY = /^(?:[a-z_][a-z0-9_]*\.)?[a-z0-9_]+_(?:at|on|date)$/i;

/** `information_schema.character_data` — a domain over `character varying`, NOT over `name`. */
const PRIVILEGE_KEY = /^(?:[a-z_][a-z0-9_]*\.)?privilege_type$/i;

/**
 * Classify one ORDER BY key expression.
 *
 * @param {string} raw the key as written, e.g. `p.oid::regprocedure::text desc`
 * @returns {{ key: string, domain: string, free: boolean }} `free` means no collation can move it
 */
export function classifyOrderKey(raw) {
  const key = String(raw)
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\s+(?:asc|desc)\b/i, "")
    .replace(/\s+nulls\s+(?:first|last)$/i, "")
    .trim();
  if (COLLATE_C.test(key)) return { key, domain: "collated", free: true };
  if (INTEGER_KEY.test(key)) return { key, domain: "integer", free: true };
  if (IDENTIFIER_KEY.test(key)) return { key, domain: "identifier", free: true };
  if (TIMESTAMP_KEY.test(key)) return { key, domain: "timestamp", free: true };
  if (CATALOG_NAME.test(key)) return { key, domain: "catalog_name", free: true };
  if (/::regprocedure::text$/i.test(key)) return { key, domain: "regprocedure_text", free: false };
  if (/::regrole::text$/i.test(key)) return { key, domain: "regrole_text", free: false };
  if (/::regclass::text$/i.test(key)) return { key, domain: "regclass_text", free: false };
  if (PRIVILEGE_KEY.test(key)) return { key, domain: "privilege_type", free: false };
  return { key, domain: "unresolved", free: false };
}
