// THE SEAM CENSUS'S plpgsql SOURCE PRIMITIVES — split out of dbSeamCensus.ts in
// round 6 when that module crossed the 500-line cap. PURE, no imports: these three
// answer questions about SQL TEXT only, and dbSeamCensus.ts re-exports them so every
// existing importer is unaffected.
//
// They are the census's fail-closed layer. Each one is the reason a measured "zero"
// can be trusted: masking keeps an apostrophe in prose from swallowing every
// projection after it, the arg splitter keeps a nested call from truncating an
// argument list, and the scalar-declaration reader is what lets the census tell a
// `to_jsonb(v_from)` DATE COERCION apart from a `to_jsonb(row)` envelope — the one
// distinction that decides whether a read is provable at all.
//
// [round-8 F1] `maskTsComments` below is a FOURTH primitive, TS/TSX-flavored rather
// than plpgsql — it lands here rather than push dbSeamCensus.ts over the 500-line
// cap again, and because it is the exact same "text-only reader" shape as the three
// above, just over a different grammar's quoting rules.

/** A SQL source with `--` line comments and `/* *\/` blocks blanked out, string
 *  and dollar-quoted literals preserved. Load-bearing: an apostrophe inside a
 *  prose comment ("the account's history") otherwise opens a phantom string
 *  literal and every projection after it silently vanishes from the census —
 *  measured on clara.list_bank_rules, which read as ZERO emitted keys before this
 *  existed. A census that silently sees nothing is worse than no census. */
export function maskSqlComments(sql: string): string {
  let out = "";
  let i = 0;
  while (i < sql.length) {
    const two = sql.slice(i, i + 2);
    if (two === "--") {
      const nl = sql.indexOf("\n", i);
      const end = nl < 0 ? sql.length : nl;
      out += " ".repeat(end - i);
      i = end;
      continue;
    }
    if (two === "/*") {
      let depth = 1;
      let j = i + 2;
      while (j < sql.length && depth > 0) {
        if (sql.slice(j, j + 2) === "/*") { depth++; j += 2; continue; }
        if (sql.slice(j, j + 2) === "*/") { depth--; j += 2; continue; }
        j++;
      }
      out += " ".repeat(j - i);
      i = j;
      continue;
    }
    if (sql[i] === "'") {
      let j = i + 1;
      while (j < sql.length) {
        if (sql[j] === "'" && sql[j + 1] === "'") { j += 2; continue; }
        if (sql[j] === "'") { j++; break; }
        j++;
      }
      out += sql.slice(i, j);
      i = j;
      continue;
    }
    if (sql[i] === "$") {
      const m = /^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/.exec(sql.slice(i));
      if (m) {
        const tag = m[0];
        const end = sql.indexOf(tag, i + tag.length);
        const j = end < 0 ? sql.length : end + tag.length;
        out += sql.slice(i, j);
        i = j;
        continue;
      }
    }
    out += sql[i];
    i++;
  }
  return out;
}

/** Split the argument list that STARTS at `s[0]` (just past an opening paren) on
 *  top-level commas, stopping at the matching close paren. Quote- and
 *  dollar-quote-aware. */
export function splitTopLevelArgs(s: string): { args: string[]; end: number } {
  const args: string[] = [];
  let depth = 0;
  let start = 0;
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    if (ch === "'") {
      i++;
      while (i < s.length) {
        if (s[i] === "'" && s[i + 1] === "'") { i += 2; continue; }
        if (s[i] === "'") { i++; break; }
        i++;
      }
      continue;
    }
    if (ch === "$") {
      const m = /^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/.exec(s.slice(i));
      if (m) {
        const tag = m[0];
        const end = s.indexOf(tag, i + tag.length);
        i = end < 0 ? s.length : end + tag.length;
        continue;
      }
    }
    if (ch === "(" || ch === "[") depth++;
    else if (ch === ")" || ch === "]") {
      if (depth === 0) break;
      depth--;
    } else if (ch === "," && depth === 0) {
      args.push(s.slice(start, i));
      start = i + 1;
    }
    i++;
  }
  args.push(s.slice(start, i));
  return { args, end: i };
}

/** PostgreSQL types whose `to_jsonb()` is a jsonb SCALAR — a string, a number or a
 *  boolean, with NO keys. Deliberately a tight allowlist and NOT a denylist: the
 *  question this answers ("can this projection hide an envelope?") must fail CLOSED,
 *  so anything unrecognised — `record`, `jsonb`, a composite, a `%rowtype`, an array,
 *  a domain, a table alias — keeps its opacity. */
const SCALAR_PG_TYPES = new Set([
  "date", "time", "timetz", "time with time zone", "time without time zone",
  "timestamp", "timestamptz", "timestamp with time zone", "timestamp without time zone",
  "interval", "int", "int2", "int4", "int8", "integer", "smallint", "bigint",
  "numeric", "decimal", "real", "double precision", "float", "float4", "float8",
  "money", "text", "varchar", "character varying", "char", "character", "bpchar",
  "boolean", "bool", "uuid", "bytea", "name", "oid", "citext",
]);

/** The names a plpgsql body DECLARES at a scalar type.
 *
 *  Read from every `declare … begin` region (nested blocks included), on masked
 *  source so a prose comment cannot invent a declaration. Multi-declaration lines
 *  are the house idiom — `c record; v_from date; v_rows jsonb;` — so the region is
 *  split on `;`, not on newlines. A declaration with an initialiser
 *  (`v_x int := 0`) keeps its type; a type this module does not recognise is simply
 *  not returned, which leaves the projection opaque. */
export function declaredScalarLocals(rawSrc: string): Set<string> {
  const src = maskSqlComments(rawSrc);
  const out = new Set<string>();
  const declRe = /\bdeclare\b/gi;
  let d: RegExpExecArray | null;
  while ((d = declRe.exec(src)) !== null) {
    const rest = src.slice(d.index + d[0].length);
    const stop = /\bbegin\b/i.exec(rest);
    const region = stop ? rest.slice(0, stop.index) : rest;
    for (const raw of region.split(";")) {
      const decl = raw.trim();
      if (!decl) continue;
      const m = /^([A-Za-z_][\w$]*)\s+(?:constant\s+)?([^:=]*?)(?:\s*(?::=|=|\bdefault\b)[\s\S]*)?$/i.exec(decl);
      const name = m?.[1];
      const rawType = m?.[2];
      if (!name || !rawType) continue;
      const type = rawType.trim().replace(/\(.*\)$/, "").trim().replace(/\s+/g, " ").toLowerCase();
      if (SCALAR_PG_TYPES.has(type)) out.add(name);
    }
  }
  return out;
}

/** A TS/TSX source with `//` line comments, `/* *\/` block comments, and string /
 *  template-literal TEXT blanked out (quote delimiters kept, contents spaced) —
 *  `maskSqlComments`' twin for a different grammar, built for round-8 [F1]:
 *  `calledFromAnyComponent` used to test a BARE identifier against raw source, so a
 *  `// TODO: call X` comment, an unused `import { X }`, or a string literal spelling
 *  X's name all read as "wired" — the exact vacuous-pass class this census exists to
 *  close (dbSeamCensus.ts's own header, "WHY IT EXISTS"). JS quoting differs from
 *  SQL's: a JS string escapes its closing quote with a trailing backslash (SQL
 *  doubles the quote instead), and a template literal's `${...}` body is CODE, not
 *  text — masking it too would hide a genuine `name(` call written inside an
 *  interpolation, so only the FIXED text spans between interpolations are blanked,
 *  never the `${...}` bodies themselves. (A template literal nested inside another
 *  template literal's `${...}` is not depth-tracked beyond brace-counting — the same
 *  kind of stated, narrow blind spot as this file's other primitives, not silently
 *  assumed away.) */
export function maskTsComments(src: string): string {
  let out = "";
  let i = 0;
  while (i < src.length) {
    const two = src.slice(i, i + 2);
    if (two === "//") {
      const nl = src.indexOf("\n", i);
      const end = nl < 0 ? src.length : nl;
      out += " ".repeat(end - i);
      i = end;
      continue;
    }
    if (two === "/*") {
      const end = src.indexOf("*/", i + 2);
      const j = end < 0 ? src.length : end + 2;
      out += " ".repeat(j - i);
      i = j;
      continue;
    }
    if (src[i] === "'" || src[i] === '"') {
      const quote = src[i];
      out += quote;
      let j = i + 1;
      while (j < src.length) {
        if (src[j] === "\\") { out += "  "; j += 2; continue; }
        if (src[j] === quote) { out += quote; j++; break; }
        out += " ";
        j++;
      }
      i = j;
      continue;
    }
    if (src[i] === "`") {
      out += "`";
      let j = i + 1;
      while (j < src.length) {
        if (src[j] === "\\") { out += "  "; j += 2; continue; }
        if (src[j] === "`") { out += "`"; j++; break; }
        if (src[j] === "$" && src[j + 1] === "{") {
          let depth = 1;
          out += "${";
          j += 2;
          while (j < src.length && depth > 0) {
            const c = src[j];
            if (c === "{") depth++;
            else if (c === "}") depth--;
            out += depth > 0 ? c : "}";
            j++;
          }
          continue;
        }
        out += " ";
        j++;
      }
      i = j;
      continue;
    }
    out += src[i];
    i++;
  }
  return out;
}

/** [round-8 F1] Does `name` occur, in COMPILED code only, in a shape that is itself
 *  INVOCABLE: `name(` directly, or bound to a local that is later called
 *  (`const fn = domain === "ar" ? arAging : apAging; await fn(t, c);` — the
 *  AgingWorkbench shape `dbSeamCensus.ts`'s `calledFromAnyComponent` was originally
 *  built to catch, still honoured here). Caller passes ALREADY-`maskTsComments`d
 *  text, so a comment, a string literal, or (harmlessly, since it lacks a call
 *  shape either way) an unused import can no longer satisfy it — round 8 measured
 *  the OLD bare-word-boundary check passing on all three, reproducing the exact
 *  vacuous-pass class the census exists to close (dbSeamCensus.ts's own header,
 *  "WHY IT EXISTS"). A call inside an unreachable branch (`if (false) { name(...) }`)
 *  still counts: this signal has only ever proven "referenced in an invocable
 *  shape", never "definitely reached at runtime" (a `true` here still does not
 *  prove RENDERING either) — telling a dead branch from a live one needs real
 *  control-flow analysis, out of scope for a text scan exactly like the
 *  render-tracing gap dbSeamCensus.ts already declares it cannot close. */
export function invocableShape(name: string, masked: string): boolean {
  if (new RegExp(`\\b${name}\\b\\s*\\(`).test(masked)) return true;
  const bindRe = new RegExp(
    `\\b(?:const|let|var)\\s+([A-Za-z_$][\\w$]*)\\s*(?::[^=]*)?=\\s*[^;]*\\b${name}\\b[^;]*;`, "g",
  );
  let m: RegExpExecArray | null;
  while ((m = bindRe.exec(masked)) !== null) {
    const local = m[1];
    if (local && new RegExp(`\\b${local}\\b\\s*\\(`).test(masked)) return true;
  }
  return false;
}
