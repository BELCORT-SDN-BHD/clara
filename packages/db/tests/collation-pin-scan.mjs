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

// ---------------------------------------------------------------------------------------------
// The text scanner.
//
// A migration's pins live in its anonymous DO blocks (the prestate and the tail). A `create
// function` body is the door's own behaviour and pins nothing at migration time, so the scanner
// reads DO blocks only — a distinction that removes the whole "a read door builds an ordered jsonb
// for its caller" class before any classification happens.
// ---------------------------------------------------------------------------------------------

const DOLLAR_TAG = /^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/;
const AGGREGATE = /\b(string_agg|array_agg|jsonb_agg|json_agg|jsonb_object_agg|xmlagg)\s*\(/gi;
const DIGEST_CALL = /\b(?:sha256|md5|clara\._hash|digest)\s*\(\s*(?:convert_to\s*\(\s*)?$/i;
/** Verdict literals no ordering can produce: the estate's absence sentinel, and the empty string. */
const SENTINEL_LITERAL = /^(?:\(none\)|)$/;
/** A pinned digest, in either width the estate writes (sha256 and md5). */
const HEX_LITERAL = /'[0-9a-f]{64}'|'[0-9a-f]{32}'/i;

/** The end of the statement the offset sits in — the next `;` outside a string literal. */
function statementEnd(text, at) {
  for (let i = at; i < text.length; i++) {
    const c = text[i];
    if (c === "'") {
      i++;
      while (i < text.length) {
        if (text[i] === "'" && text[i + 1] === "'") { i += 2; continue; }
        if (text[i] === "'") break;
        i++;
      }
      continue;
    }
    if (c === ";") return i;
  }
  return text.length;
}

/** Blank every SQL comment, leaving every other byte at its own offset so line numbers survive. */
export function blankSqlComments(source) {
  const out = source.split("");
  const n = source.length;
  const blank = (from, to) => {
    for (let k = from; k < to; k++) if (out[k] !== "\n") out[k] = " ";
  };
  let i = 0;
  while (i < n) {
    const ch = source[i];
    const next = source[i + 1];
    if (ch === "-" && next === "-") {
      let j = i;
      while (j < n && source[j] !== "\n") j++;
      blank(i, j);
      i = j;
      continue;
    }
    if (ch === "/" && next === "*") {
      let depth = 1;
      let j = i + 2;
      while (j < n && depth > 0) {
        if (source[j] === "/" && source[j + 1] === "*") { depth++; j += 2; }
        else if (source[j] === "*" && source[j + 1] === "/") { depth--; j += 2; }
        else j++;
      }
      blank(i, j);
      i = j;
      continue;
    }
    if (ch === "'") {
      i++;
      while (i < n) {
        if (source[i] === "'" && source[i + 1] === "'") { i += 2; continue; }
        if (source[i] === "'") { i++; break; }
        i++;
      }
      continue;
    }
    if (ch === '"') {
      i++;
      while (i < n) { if (source[i] === '"') { i++; break; } i++; }
      continue;
    }
    if (ch === "$") {
      const tag = DOLLAR_TAG.exec(source.slice(i, i + 64));
      if (tag) { i += tag[0].length; continue; }
    }
    i++;
  }
  return out.join("");
}

/** The anonymous DO blocks of a migration, each with the absolute offset of its body. */
function doBlocks(sql) {
  const blocks = [];
  let i = 0;
  while (i < sql.length) {
    const ch = sql[i];
    if (ch === "'") {
      i++;
      while (i < sql.length) {
        if (sql[i] === "'" && sql[i + 1] === "'") { i += 2; continue; }
        if (sql[i] === "'") { i++; break; }
        i++;
      }
      continue;
    }
    if (ch === '"') { i++; while (i < sql.length) { if (sql[i] === '"') { i++; break; } i++; } continue; }
    if (ch === "$") {
      const tag = DOLLAR_TAG.exec(sql.slice(i, i + 64));
      if (tag) {
        const end = sql.indexOf(tag[0], i + tag[0].length);
        const bodyStart = i + tag[0].length;
        const bodyEnd = end === -1 ? sql.length : end;
        if (/\bdo\s*$/i.test(sql.slice(Math.max(0, i - 200), i))) {
          blocks.push({ offset: bodyStart, text: sql.slice(bodyStart, bodyEnd) });
        }
        i = end === -1 ? sql.length : end + tag[0].length;
        continue;
      }
    }
    i++;
  }
  return blocks;
}

/** The balanced argument text of the call whose `(` is at `open`. */
function callArgument(text, open) {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    const c = text[i];
    if (c === "'") {
      i++;
      while (i < text.length) {
        if (text[i] === "'" && text[i + 1] === "'") { i += 2; continue; }
        if (text[i] === "'") break;
        i++;
      }
      continue;
    }
    if (c === "(") depth++;
    else if (c === ")") { depth--; if (depth === 0) return text.slice(open + 1, i); }
  }
  return text.slice(open + 1);
}

/** The aggregate's OWN `order by` — the one at paren depth 0 of its argument, never a nested one. */
function ownOrderBy(argument) {
  let depth = 0;
  let found = -1;
  for (let i = 0; i < argument.length; i++) {
    const c = argument[i];
    if (c === "'") {
      i++;
      while (i < argument.length) {
        if (argument[i] === "'" && argument[i + 1] === "'") { i += 2; continue; }
        if (argument[i] === "'") break;
        i++;
      }
      continue;
    }
    if (c === "(") { depth++; continue; }
    if (c === ")") { depth--; continue; }
    if (depth === 0 && (c === "o" || c === "O") && /^order\s+by\b/i.test(argument.slice(i))) found = i;
  }
  return found === -1 ? null : argument.slice(found).replace(/^order\s+by\b/i, "");
}

/** Split a key list on its top-level commas. */
function splitKeyList(list) {
  const keys = [];
  let depth = 0;
  let current = "";
  for (let i = 0; i < list.length; i++) {
    const c = list[i];
    if (c === "'") {
      current += c;
      i++;
      while (i < list.length) {
        current += list[i];
        if (list[i] === "'" && list[i + 1] === "'") { current += "'"; i += 2; continue; }
        if (list[i] === "'") { i++; break; }
        i++;
      }
      continue;
    }
    if (c === "(") depth++;
    if (c === ")") depth--;
    if (c === "," && depth === 0) { keys.push(current); current = ""; continue; }
    current += c;
  }
  if (current.trim()) keys.push(current);
  return keys.map((k) => k.replace(/\s+/g, " ").trim()).filter(Boolean);
}

/**
 * Why an aggregate's value is a PIN, or null when it is not pinned at all. Three shapes, which is
 * every shape the estate writes: digested where it stands, assigned to a variable that is compared
 * against a literal, or assigned to a variable that is digested.
 *
 * SCOPED TO THE DEF-USE REGION. A prestate reuses `v_bad` or `v_names` a dozen times; the verdict
 * that belongs to THIS aggregate is the one taken before the variable is written again. Searching
 * the whole block instead would hand every census the strictest verdict any of its namesakes ever
 * got — which is how 0150:2058's `is not null` census looked like a content pin.
 */
function pinReason(blockText, at) {
  const before = blockText.slice(Math.max(0, at - 300), at);
  // A digest is only a CROSS-SERVER pin when it is checked against a literal. 0151:323/911 — the
  // correct pattern — measures `md5(string_agg(… order by …))` into a temp table in the prestate
  // and compares the tail's re-measurement against THAT: both sides were taken on the same server
  // under the same collation, so no collation ever crosses a server boundary. A digest whose own
  // statement carries the hex literal is a pin here and now; one that does not falls through to
  // the def-use analysis below, which finds the `v_sha <> '…'` verdict when there is one.
  if (DIGEST_CALL.test(before) && HEX_LITERAL.test(blockText.slice(at, statementEnd(blockText, at)))) {
    return "digested where it stands, against a hex literal";
  }
  const after = blockText.slice(at);
  const into = /\binto\s+(?:strict\s+)?([a-z_][a-z0-9_]*)/i.exec(after.slice(0, 900));
  const assigned = /([a-z_][a-z0-9_]*)\s*:=\s*[^;]{0,300}$/i.exec(before);
  const variable = into ? into[1] : assigned ? assigned[1] : null;
  if (!variable) return null;
  const escaped = variable.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // The region this value lives in: from here to the next write of the same variable.
  const rewritten = new RegExp("(?:\\binto\\s+(?:strict\\s+)?" + escaped + "\\b|\\b" + escaped + "\\s*:=)", "gi");
  rewritten.lastIndex = into ? into.index + into[0].length : 1;
  const nextWrite = rewritten.exec(after);
  const region = after.slice(0, nextWrite ? nextWrite.index : undefined);
  const comparedWithLiteral = new RegExp(
    "\\b" + escaped + "\\b\\s*(?:is\\s+distinct\\s+from|is\\s+not\\s+distinct\\s+from|<>|=|!=)\\s*(?:'([^']*)'|E'|\\|\\|)",
    "i",
  );
  const comparison = comparedWithLiteral.exec(region);
  if (comparison) {
    // THE ABSENCE-COHORT IDIOM, which is not a pin over ordered content. Thirteen migrations
    // (0185:156, 0190:92, 0193:325, 0196:172, 0162:66 …) write
    // `coalesce(string_agg(x, ',' order by x), '(none)')` and take the verdict against the
    // SENTINEL: the aggregate exists to name the members found, the order reaches the error
    // message and nothing else, and no ordering the server can produce equals `(none)`.
    if (comparison[1] !== undefined && SENTINEL_LITERAL.test(comparison[1])) return null;
    return "compared with a literal via " + variable;
  }
  const digested = new RegExp(
    "(?:sha256|md5|clara\\._hash|digest)\\s*\\(\\s*(?:convert_to\\s*\\(\\s*)?" + escaped + "\\b",
    "i",
  );
  if (digested.test(region)) return "digested via " + variable;
  return null;
}

/**
 * Every PINNED ordered aggregate in a migration's DO blocks whose ORDER BY carries at least one key
 * that no collation is guaranteed to leave alone.
 *
 * @param {string} source the migration's text
 * @returns {Array<{ line: number, fn: string, why: string, keys: Array<{key:string,domain:string,free:boolean}> }>}
 */
export function scanSqlText(source) {
  const clean = blankSqlComments(source);
  const findings = [];
  for (const block of doBlocks(clean)) {
    AGGREGATE.lastIndex = 0;
    let match;
    while ((match = AGGREGATE.exec(block.text))) {
      const argument = callArgument(block.text, match.index + match[0].length - 1);
      const orderBy = ownOrderBy(argument);
      if (orderBy === null) continue;
      const keys = splitKeyList(orderBy).map(classifyOrderKey);
      if (!keys.length || keys.every((k) => k.free)) continue;
      const why = pinReason(block.text, match.index);
      if (!why) continue;
      findings.push({
        line: clean.slice(0, block.offset + match.index).split("\n").length,
        fn: match[1].toLowerCase(),
        why,
        keys,
      });
    }
  }
  return findings;
}

/**
 * The same rule for a BATTERY. A test file has no prestate DO block to scope by — its SQL lives in
 * a template literal and the assertion happens in JavaScript, where a text scanner cannot follow —
 * so the rule here is the stricter one: an ordered aggregate over a movable key is a finding, pin
 * or no pin, because a census in a battery exists in order to be asserted.
 *
 * @param {string} source the battery's text
 * @returns {Array<{ line: number, fn: string, why: string, keys: Array<{key:string,domain:string,free:boolean}> }>}
 */
export function scanJsText(source) {
  const findings = [];
  AGGREGATE.lastIndex = 0;
  let match;
  while ((match = AGGREGATE.exec(source))) {
    const argument = callArgument(source, match.index + match[0].length - 1);
    const orderBy = ownOrderBy(argument);
    if (orderBy === null) continue;
    const keys = splitKeyList(orderBy).map(classifyOrderKey);
    if (!keys.length || keys.every((k) => k.free)) continue;
    findings.push({
      line: source.slice(0, match.index).split("\n").length,
      fn: match[1].toLowerCase(),
      why: "a census in a battery is asserted",
      keys,
    });
  }
  return findings;
}
