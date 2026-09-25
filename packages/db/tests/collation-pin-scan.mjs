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

/** Keys whose ordering is numeric, an ordinality, or an oid — no collation involved.
 *
 *  #1047 FIX ROUND (ADV-L07-05): the bare single letters `o`, `n`, `i` and `k` used to sit in this
 *  list and were therefore declared FREE. They are not integers in this estate, they are FROM-item
 *  aliases — `0132:1545` writes `array_agg(k order by k) … from jsonb_object_keys(…) k`, where `k`
 *  is TEXT — and a one-letter alias is exactly the case the module header promises to classify
 *  `unresolved`, which is movable. Only names that cannot be a bare alias stay. */
const INTEGER_KEY =
  /^(?:\d+|(?:[a-z_][a-z0-9_]*\.)?(?:ord|seq|idx|rn|oid|ordinal|ordinality|sort_order|sort_ordinal|ordinal_position|attnum|pronargs|enumsortorder|line_no|level|depth|objsubid|indexrelid))$/i;

/** Surrogate keys that order by a TYPE, never by a collation.
 *
 *  #1047 FIX ROUND (ADV-L07-05): the generic `%_id` SPELLING used to sit here, and a spelling is
 *  not proof of a uuid. Measured on the lane catalog: `clara` carries about forty TEXT `%_id`
 *  columns — `stripe_session_id`, `stripe_event_id`, `run_id`, `trace_id`, `span_id`, `event_id`,
 *  `receipt_id`, `logical_op_id`, `engine_id`, `bundle_id` … — every one of which sorts under the
 *  database collation. The free set is now the CLOSED list below: `id`, the estate's own
 *  primary-key spelling (231 `uuid`, 6 `bigint`, 2 `boolean` columns and no text at all), plus the
 *  two ordered surrogates the corpus actually pins, both `uuid`. `collation-pin-portability.mjs`'s
 *  live cell re-measures that no member of this list is a text column on the running server, so
 *  the list is checked rather than asserted; every other `%_id` falls through to `unresolved`,
 *  which is movable. */
export const IDENTIFIER_KEY_NAMES = ["id", "account_id", "account_set_version_id", "constant_version_id"];
const IDENTIFIER_KEY = new RegExp(`^(?:[a-z_][a-z0-9_]*\\.)?(?:${IDENTIFIER_KEY_NAMES.join("|")})$`, "i");

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
  // A `name` CAST TO TEXT keeps collation C — `pg_collation_for(proname::text)` answers `"C"`, and
  // the portability battery measures exactly that. 0127:376/387/390 order
  // `information_schema.role_routine_grants.grantee::text`, whose underlying type is `sql_identifier`
  // = `name`. The `::regrole::text` and `::regprocedure::text` shapes below are NOT this: the reg*
  // cast drops the collation on the way through, which is why they stay movable.
  if (CATALOG_NAME.test(key.replace(/::text$/i, ""))) return { key, domain: "catalog_name_text", free: true };
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
      // Break ON the closing quote and let the loop's own `i++` step past it: advancing here as
      // well swallowed the next character, which ate the `)` of `coalesce(x, 'PUBLIC')` and left
      // the recorded key truncated and its parenthesis depth wrong.
      while (i < list.length) {
        current += list[i];
        if (list[i] === "'" && list[i + 1] === "'") { current += "'"; i += 2; continue; }
        if (list[i] === "'") break;
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

/** The quoted members of the ARRAY constructor that starts at `from` in `text`, in written order.
 *  `null` when the constructor holds anything that is not a plain single-quoted literal (a column
 *  reference, a cast of a sub-expression, a nested constructor): such a verdict is not a value set
 *  this file can prove by itself, and saying so is better than half-reading it. */
function arrayMembers(text, from) {
  const open = text.indexOf("[", from);
  if (open === -1) return null;
  let depth = 0;
  let body = null;
  for (let i = open; i < text.length; i++) {
    const ch = text[i];
    if (ch === "'") {
      i++;
      while (i < text.length) {
        if (text[i] === "'" && text[i + 1] === "'") { i += 2; continue; }
        if (text[i] === "'") break;
        i++;
      }
      continue;
    }
    if (ch === "[") depth++;
    else if (ch === "]") { depth--; if (depth === 0) { body = text.slice(open + 1, i); break; } }
  }
  if (body === null) return null;
  const members = [];
  for (const piece of splitKeyList(body)) {
    const m = /^'((?:[^']|'')*)'(?:::[a-z_][a-z0-9_ ]*(?:\[\])?)?$/i.exec(piece.trim());
    if (!m) return null;
    members.push(m[1].replace(/''/g, "'"));
  }
  return members.length ? members : null;
}

/**
 * Why an aggregate's value is a PIN, or null when it is not pinned at all. Three shapes, which is
 * every shape the estate writes: digested where it stands, assigned to a variable that is compared
 * against a literal, or assigned to a variable that is digested.
 *
 * Returns `{ why, members }`, where `members` is the ARRAY verdict's own literal members when the
 * verdict is an array constructor of quoted literals and `null` otherwise. `members` is what
 * `collation-pin-portability.test.mjs` re-orders under two collations, so a site whose subject no
 * longer exists at the head of the chain (0038's four document CHECK censuses were renamed by a
 * later migration) is still proved from the file's own text rather than from a hand-copied list.
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
    return { why: "digested where it stands, against a hex literal", members: null };
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
  // #1047 FIX ROUND (ADV-L07-03): an ARRAY CONSTRUCTOR is as much a verdict literal as a quoted
  // string. `array_agg(k order by k) into v_keys` followed by
  // `if v_keys is distinct from array['as_of','locale','policy_key','reason']` (0132:1545/1549)
  // pins the ORDER as hard as any `string_agg(…) <> 'a,b'` does — the array is ordered, so a
  // collation that moves two members past each other fails the comparison. The first cut of this
  // scanner only recognised a right-hand side that began with a quote, an `E'` or a `||`, so the
  // estate's array-verdict idiom (0220:960/965, 0132:1545/1549, and every sibling) was invisible
  // and the record below claimed a completeness it did not have.
  const comparedWithLiteral = new RegExp(
    "\\b" + escaped + "\\b\\s*(?:is\\s+distinct\\s+from|is\\s+not\\s+distinct\\s+from|<>|=|!=)\\s*(?:'([^']*)'|E'|\\|\\||array\\s*\\[)",
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
    const isArray = /array\s*\[$/i.test(comparison[0]);
    return {
      why: (isArray ? "compared with an array literal via " : "compared with a literal via ") + variable,
      members: isArray ? arrayMembers(region, comparison.index + comparison[0].length - 1) : null,
    };
  }
  const digested = new RegExp(
    "(?:sha256|md5|clara\\._hash|digest)\\s*\\(\\s*(?:convert_to\\s*\\(\\s*)?" + escaped + "\\b",
    "i",
  );
  if (digested.test(region)) return { why: "digested via " + variable, members: null };
  return null;
}

/**
 * Every PINNED ordered aggregate in a migration's DO blocks whose ORDER BY carries at least one key
 * that no collation is guaranteed to leave alone.
 *
 * @param {string} source the migration's text
 * @returns {Array<{ line: number, fn: string, why: string, members: string[]|null, keys: Array<{key:string,domain:string,free:boolean}> }>}
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
      const pin = pinReason(block.text, match.index);
      if (!pin) continue;
      findings.push({
        line: clean.slice(0, block.offset + match.index).split("\n").length,
        fn: match[1].toLowerCase(),
        why: pin.why,
        members: pin.members,
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
  // A battery holds its SQL in a JavaScript string, so `collate "C"` reaches the file as
  // `collate \"C\"` whenever the string is double-quoted (firm-portfolio-pack:605). Read the
  // escape as the character it stands for, or an already-fixed site keeps being reported.
  // Unescaping removes no newline, so a line number taken on the unescaped text is the file's own.
  const text = source.replace(/\\"/g, '"');
  AGGREGATE.lastIndex = 0;
  let match;
  while ((match = AGGREGATE.exec(text))) {
    const argument = callArgument(text, match.index + match[0].length - 1);
    const orderBy = ownOrderBy(argument);
    if (orderBy === null) continue;
    const keys = splitKeyList(orderBy).map(classifyOrderKey);
    if (!keys.length || keys.every((k) => k.free)) continue;
    findings.push({
      line: text.slice(0, match.index).split("\n").length,
      fn: match[1].toLowerCase(),
      why: "a census in a battery is asserted",
      members: null,
      keys,
    });
  }
  return findings;
}

// ---------------------------------------------------------------------------------------------
// THE RECORD (#1047's acceptance criterion 1).
//
// Every pinned, text-ordered site the scanner finds in `packages/db/migrations` and
// `packages/db/tests` as of #1047, with the reason each one cannot flip. Applied migrations are
// never edited, so for each of them the entry IS the proof; the live half of the proof —
// re-measured on whatever server the suite runs on — is `collation-pin-portability.test.mjs`.
//
// A site leaves this record by being fixed (`collate "C"` on the ORDER BY). A NEW site must be
// fixed rather than added: the corpus cell in `collation-pin-scan.test.mjs` refuses it by name,
// and an entry here is only right for a site in an APPLIED migration, which cannot be edited.
//
// The key is recorded, not the line: a battery's lines move under every lane that touches it,
// while its censuses do not.
// ---------------------------------------------------------------------------------------------

/** @type {Array<{ path: string, keys: string[], why: string }>} */
export const RECORDED_SITES = [
  // --- migrations: 61 keys over 34 applied files ------------------------------------------------
  { path: "migrations/0020_typed_consent.sql", keys: ["x.pin"],
    why: "the key is `p.proname || '=' || <acl text>`, and an expression that carries a catalog `name` inherits its C collation (measured with pg_collation_for)" },
  { path: "migrations/0037_wave_c_a_subledger.sql", keys: ["m[1]"],
    why: "the five quoted tokens of ck_je_coding_kind, read out of the live constraint definition; the verdict is an array literal whose own order the array-verdict cell proves stable" },
  { path: "migrations/0038_wave_c_b_bank.sql", keys: ["x.pin", "m[1]", "m[1]", "m[1]", "m[1]", "m[1]", "m[1]"],
    why: "0020:2304's census re-pinned verbatim (same `name`-derived key), plus six token censuses over a CHECK definition or a purpose guard; every one takes an array-literal verdict the array-verdict cell proves stable" },
  { path: "migrations/0041_wave_d_a_fa_register.sql", keys: ["d.fn"],
    why: "the reachability CTE seeds `unnest(v_seed) collate \"C\"`, and the verdict names one function" },
  { path: "migrations/0057_wave_e_registry_snapshots.sql", keys: ["m[1]"],
    why: "the distinct status literals of one body; the verdict is the single token `approved`, which no ordering can reach differently" },
  { path: "migrations/0078_wave_e_eta_wake_wrappers_part2.sql", keys: ["g"],
    why: "`g` is `case when a.grantee = 0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end` — pg_get_userbyid returns `name`, so the CASE derives C (measured) — and the verdict names one grantee" },
  { path: "migrations/0084_wave_e_eta_approval_obo.sql", keys: ["g", "g"],
    why: "the same `case … pg_get_userbyid` grantee alias, C-derived, with a one-member verdict at each site" },
  { path: "migrations/0086_b3_reopen_ends_on_part2.sql", keys: ["g"],
    why: "the same `case … pg_get_userbyid` grantee alias, C-derived, one-member verdict" },
  { path: "migrations/0103_f_a7_pi_additive.sql", keys: ["item"],
    why: "the seven `f_aN` shim names of clara.agent_receipt_source_census(); proved in collation-pin-portability" },
  { path: "migrations/0106_f_a2_posting_core.sql", keys: ["g"],
    why: "`case when grantee = 0 then 'PUBLIC' else pg_get_userbyid(grantee) end` — pg_get_userbyid returns `name`, so the CASE inherits C" },
  { path: "migrations/0107_f_a2_posting_grants.sql", keys: ["g"],
    why: "the same `case … pg_get_userbyid` grantee alias, C-derived, one-member verdict" },
  { path: "migrations/0116_f_a5_reporting_agency_pr2e_grants.sql", keys: ["g"],
    why: "the same `case … pg_get_userbyid` grantee alias, C-derived, one-member verdict" },
  { path: "migrations/0129_f_a3_pr3_retirement_parity_doors.sql", keys: ["fn_name", "fn_name"],
    why: "clara.wake_fn_allowlist.fn_name is ordinary text and DOES move, but each of the two EXCEPT censuses takes a ONE-MEMBER verdict, and one member has no ordering; the live roster is re-measured per wake_kind in collation-pin-portability" },
  { path: "migrations/0132_f_a5b_pr1_sandbox_export.sql", keys: ["k", "k"],
    why: "`k` is jsonb_object_keys' TEXT alias, movable by type; both verdicts are the same four refusal-payload keys, proved stable by the array-verdict cell" },
  { path: "migrations/0139_statutory_deadlines.sql", keys: ["x"],
    why: "`x` re-sorts the file's own expected constraint-name array for the comparison against a conname census; the live constraint names of clara.statutory_deadlines are re-measured in collation-pin-portability and the literal's order is proved by the array-verdict cell" },
  { path: "migrations/0150_coa_template_pr_a.sql",
    keys: ["account_code", "add_back_class", "f.family_key", "g.grantee::regrole::text", "g.grantee::regrole::text", "g.privilege_type", "special_acc_type", "t.inclusion"],
    why: "the seeded chart vocabularies and the template grant matrix; each value set is proved in collation-pin-portability" },
  { path: "migrations/0152_f_t3_pr_1_tax_platform.sql", keys: ["p.oid::regprocedure::text"],
    why: "the set is the functions this file added, and the verdict is ONE signature — with a second member the verdict fails whatever the order" },
  { path: "migrations/0160_checkout_gate_c2_stripe_events.sql",
    keys: ["coalesce(r.rolname,'PUBLIC')", "coalesce(r.rolname,'PUBLIC')", "p.oid::regprocedure::text"],
    why: "pg_roles.rolname is `name`, so the coalesce keeps C; the regprocedure census takes a two-member verdict proved stable by the array-verdict cell, and the regprocedure cohort is re-measured live" },
  { path: "migrations/0162_fs7_e2_artifact_download_door.sql", keys: ["coalesce(rr.rolname,'PUBLIC')"],
    why: "pg_roles.rolname is `name`; coalescing it with a literal keeps C" },
  { path: "migrations/0163_checkout_gate_c3_folded_door.sql",
    keys: ["coalesce(r.rolname,'PUBLIC')", "coalesce(r.rolname,'PUBLIC')", "coalesce(r.rolname,'PUBLIC')", "p.oid::regprocedure::text"],
    why: "the same `coalesce(rolname,'PUBLIC')` C-derived key three times, and one regprocedure census with a two-member verdict the array-verdict cell proves stable" },
  { path: "migrations/0178_accounting_work_journal_successor.sql", keys: ["g", "g"],
    why: "the same `case … pg_get_userbyid` grantee alias, C-derived, one-member verdict at each site" },
  { path: "migrations/0190_document_byte_door_v2.sql", keys: ["coalesce(rr.rolname, 'PUBLIC')"],
    why: "pg_roles.rolname is `name`; coalescing it with a literal keeps C" },
  { path: "migrations/0195_work_egress_purpose_and_execution_trace.sql", keys: ["t.m[1]"],
    why: "the grandfathered bundle ids read out of the recut core's own body; the verdict is {clara-work/v1, clara-work/v2}, two members that differ only in their last character, proved stable live and by the array-verdict cell" },
  { path: "migrations/0204_record_journal_entry_core_reversal_liveness.sql", keys: ["t.m[1]"],
    why: "0195:2544's census re-pinned verbatim — the same two clara-work bundle ids" },
  { path: "migrations/0215_counterparty_identity_provenance.sql", keys: ["privilege_type"],
    why: "the SQL privilege names, every one `^[A-Z]+$`; proved in collation-pin-portability" },
  { path: "migrations/0218_firm_setup.sql", keys: ["item_key"],
    why: "the three firm-defaultable setup keys; proved in collation-pin-portability" },
  { path: "migrations/0219_client_onboarding_facts.sql", keys: ["a::text", "a::text", "a::text"],
    why: "the aclitem text of one function each — two entries, `clara_authenticated` before `clara_fn_owner` under both collations; proved in collation-pin-portability" },
  { path: "migrations/0220_firm_knowledge_defaults.sql", keys: ["k.knowledge_key"],
    why: "clara.knowledge_keys.knowledge_key is ordinary text and movable by type; the admitted verdict is four keys that differ in their first letter, proved stable by the array-verdict cell and re-measured against the live 14-key roster in collation-pin-portability" },
  { path: "migrations/0227_depreciation_history.sql", keys: ["x.n"],
    why: "`n` is `p.proname` aliased inside the sub-select, so the ORDER BY is over a catalog `name` and carries C; the three-member verdict is proved stable as well" },
  { path: "migrations/0241_knowledge_scope_default_drop.sql", keys: ["scope_default"],
    why: "clara.knowledge_keys.scope_default was ordinary text (this file drops it), but the prestate's verdict is the single value `client`, and one member has no ordering" },
  { path: "migrations/0269_invite_issuer_lapsed_status.sql", keys: ["privilege_type", "privilege_type"],
    why: "the SQL privilege names; proved in collation-pin-portability" },
  { path: "migrations/0270_firm_document_limits_writer.sql", keys: ["privilege_type", "privilege_type"],
    why: "the SQL privilege names; proved in collation-pin-portability" },
  { path: "migrations/0290_document_regions_field_path_check.sql", keys: ["grantee::regrole::text"],
    why: "a regrole cast to text takes the database collation, but the INSERT-grantee verdict on clara.document_regions is one role; the whole role_table_grants cohort is re-measured per table in collation-pin-portability" },
  { path: "migrations/0295_wave4_chart_rows.sql", keys: ["special_acc_type", "version"],
    why: "the five special markers (proved in collation-pin-portability); `version` is clara.coa_templates.version, an integer" },

  // --- batteries: 38 keys over 22 files ---------------------------------------------------------
  // A battery is EDITABLE, so a key here is a site this ticket deliberately did not touch: the six
  // census files the sweep plan gave this lane are fixed in place, and the rest belong to lanes
  // that own those files. Every key below draws on a value set the portability battery proves, or
  // on a `name`-derived expression, or is quoted source text rather than a census.
  { path: "tests/checkout-convergence.test.mjs", keys: ["g.grantee::regrole::text"], why: "the grantees of one relation; regrole text, proved in collation-pin-portability" },
  { path: "tests/checkout-gate-c1.test.mjs", keys: ["indexrelid::regclass::text"], why: "the index names of one relation, all sharing their relation's prefix" },
  { path: "tests/checkout-gate-c2.test.mjs", keys: ["p.oid::regprocedure::text"], why: "the signatures of one named door; regprocedure text, proved in collation-pin-portability" },
  { path: "tests/checkout-gate-c3.test.mjs", keys: ["coalesce(r.rolname,'PUBLIC')"], why: "rolname is `name`; the coalesce keeps C" },
  { path: "tests/checkout-gate-c6.test.mjs", keys: ["g.grantee::regrole::text"], why: "the grantees of one relation; regrole text" },
  { path: "tests/client-work-pack.test.mjs", keys: ["privilege_type"], why: "the SQL privilege names" },
  { path: "tests/coa-template-pr-a.test.mjs",
    keys: ["account_code", "account_code", "account_code", "f.family_key", "family_key", "g.grantee::regrole::text", "g.grantee::regrole::text", "g.privilege_type"],
    why: "the chart vocabularies and the template grant matrix; the family_key censuses take a `<none>` verdict, so their order reaches the message only" },
  { path: "tests/coa-template-pr-b.test.mjs", keys: ["x", "x"],
    why: "NOT a census: a byte-for-byte quotation of clara.apply_coa_template's live body for the §9.4 mutant substitution — collating it would break `src.includes(fixed)`" },
  { path: "tests/counterparty-alias-kind.test.mjs", keys: ["role"], why: "the alias-role vocabulary of one relation" },
  { path: "tests/dba-close-gate-codeability.test.mjs", keys: ["kind", "kind"], why: "a closed row-kind vocabulary" },
  { path: "tests/dba-coding-lane-classification.test.mjs", keys: ["r ->> 'filing_id'"], why: "uuid text, whose dashes fall at the same offset in every value" },
  { path: "tests/delta-algebra-phase.mjs", keys: ["o"],
    why: "`o` is the WITH ORDINALITY column of `unnest($1::bytea[]) with ordinality q(h,o)` — a bigint, so nothing collates; the alias only LOOKS movable because a text scanner cannot resolve it" },
  { path: "tests/f-a2-generic.test.mjs", keys: ["kind", "kind", "kind", "kind", "r.field_path"], why: "a closed row-kind vocabulary, and the field-path grammar 0290 pins" },
  { path: "tests/f-a5-reporting-agency-pr2-census.test.mjs", keys: ["case when a.grantee = 0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end"], why: "pg_get_userbyid returns `name`, so the CASE inherits C" },
  { path: "tests/f-a5b-card1-seam-stage-b.test.mjs", keys: ["e.version"], why: "an evaluator version string of digits and dots" },
  { path: "tests/f-t1-sst-reference.test.mjs", keys: ["pg_get_userbyid(rr)::text"],
    why: "the cast keeps the `name` collation (measured); and the roster is used as a SET, never pinned as an ordered literal" },
  { path: "tests/invite-preview-public.test.mjs", keys: ["t.name"], why: "the caller's own text[] roster, taken against the `(none)` sentinel" },
  { path: "tests/masb-wording-seed-battery.test.mjs", keys: ["phrase_key"], why: "the seeded wording keys of one locale" },
  { path: "tests/prepayment-wake-reroute.test.mjs", keys: ["wake_kind"], why: "clara.wake_fn_allowlist.wake_kind for one function — a one-member verdict" },
  { path: "tests/rig-docs-download-door.test.mjs", keys: ["coalesce(rr.rolname,'PUBLIC')", "coalesce(rr.rolname,'PUBLIC')"], why: "rolname is `name`; the coalesce keeps C" },
  { path: "tests/wave-a-upgrade.test.mjs", keys: ["a.grantee::regrole::text||a.privilege_type"], why: "the grantees of one relation; regrole text" },
  { path: "tests/work-journal-post.test.mjs", keys: ["a.privilege_type", "g", "g"], why: "the SQL privilege names, and pg_get_userbyid's `name`" },
];

/**
 * Compare what the corpus holds now against the record, and say what changed in the words the
 * author needs: what to write, and why the estate cares.
 *
 * @param {Array<{path:string, keys:string[]}>} observed
 * @param {Array<{path:string, keys:string[]}>} recorded
 * @returns {string} empty when the corpus matches the record
 */
export function describeCollationFindings(observed, recorded = RECORDED_SITES) {
  const key = (rows) => new Map(rows.map((r) => [r.path, [...r.keys].sort().join(" | ")]));
  const now = key(observed);
  const then = key(recorded);
  const lines = [];
  for (const [path, keys] of [...now.entries()].sort()) {
    if (!then.has(path)) lines.push(`NEW  ${path}\n       ${keys}`);
    else if (then.get(path) !== keys) lines.push(`MOVED ${path}\n       recorded: ${then.get(path)}\n       found:    ${keys}`);
  }
  for (const [path] of [...then.entries()].sort()) {
    if (!now.has(path)) lines.push(`GONE ${path} — its census was fixed or removed; drop the entry from RECORDED_SITES`);
  }
  if (!lines.length) return "";
  return (
    "collation-pin: a pin taken over TEXT-ORDERED row content changed.\n" +
    "A digest or a literal compared against an aggregate that is ORDER BY a text expression records\n" +
    'the server\'s lc_collate, not the data: write `collate "C"` on that ORDER BY. Under en_US.UTF-8\n' +
    "punctuation carries no primary weight and case is not primary either, so `taxation` sorts before\n" +
    "`tax_liabilities` and `clara_x` before `PUBLIC`, the other way round from `C` — which is how 0295's\n" +
    "first cut stopped the chain on CI (run 35954298990). See packages/db/README.md, " +
    '"Collation and pinned order".\n\n' +
    lines.join("\n")
  );
}
