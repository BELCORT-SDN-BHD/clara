// TEXT-LEVEL refusals read straight off a migration file, before a single statement runs.
//
// These are the EARLY, review-friendly wall: a reader can see why a file was rejected
// without reproducing a database. They are deliberately not the ONLY wall — the lexer
// collapses a dollar-quoted block to its TAG, so anything a body constructs dynamically
// is invisible here and is caught server-side by the execution wrapper instead
// (migration-atomicity.mjs). Each refusal below names its own residual.

const TRANSACTION_CONTROL = [
  ["SET", "SESSION", "CHARACTERISTICS", "AS", "TRANSACTION"],
  ["ROLLBACK", "TO", "SAVEPOINT"], ["ROLLBACK", "AND", "NO", "CHAIN"],
  ["COMMIT", "AND", "NO", "CHAIN"], ["END", "AND", "NO", "CHAIN"],
  ["ROLLBACK", "PREPARED"], ["ROLLBACK", "AND", "CHAIN"],
  ["COMMIT", "PREPARED"], ["COMMIT", "AND", "CHAIN"],
  ["END", "AND", "CHAIN"], ["RELEASE", "SAVEPOINT"],
  ["SET", "SESSION", "TRANSACTION"], ["SET", "LOCAL", "TRANSACTION"],
  ["PREPARE", "TRANSACTION"], ["START", "TRANSACTION"], ["ROLLBACK", "TO"],
  ["SET", "TRANSACTION"], ["BEGIN"], ["COMMIT"], ["END"], ["ROLLBACK"],
  ["ABORT"], ["SAVEPOINT"], ["RELEASE"],
];

function lexStatements(sql) {
  const statements = [];
  let tokens = [];
  let i = 0;
  const finish = () => {
    if (tokens.length) statements.push(tokens);
    tokens = [];
  };

  while (i < sql.length) {
    const ch = sql[i];
    const next = sql[i + 1];
    if (/\s/u.test(ch)) {
      i++;
      continue;
    }
    if (ch === "-" && next === "-") {
      i += 2;
      while (i < sql.length && sql[i] !== "\n" && sql[i] !== "\r") i++;
      continue;
    }
    if (ch === "/" && next === "*") {
      let depth = 1;
      i += 2;
      while (i < sql.length && depth > 0) {
        if (sql[i] === "/" && sql[i + 1] === "*") {
          depth++;
          i += 2;
        } else if (sql[i] === "*" && sql[i + 1] === "/") {
          depth--;
          i += 2;
        } else i++;
      }
      if (depth > 0) throw new Error("migration SQL has an unterminated block comment");
      continue;
    }
    if (ch === "$") {
      const prior = i > 0 ? sql[i - 1] : "";
      const continuesIdentifier = prior && /[\p{L}\p{N}_$]/u.test(prior);
      const tag = continuesIdentifier ? null : /^(?:\$[A-Za-z_][A-Za-z0-9_]*\$|\$\$)/u.exec(sql.slice(i))?.[0];
      if (tag) {
        const close = sql.indexOf(tag, i + tag.length);
        if (close < 0) throw new Error(`migration SQL has an unterminated dollar quote ${tag}`);
        tokens.push({ type: "dollar", value: tag });
        i = close + tag.length;
        continue;
      }
    }
    if (ch === "'") {
      const escape =
        (i > 0 && /[eE]/u.test(sql[i - 1]) && (i < 2 || !/[A-Za-z0-9_$]/u.test(sql[i - 2]))) ||
        (i > 1 && /[uU]/u.test(sql[i - 2]) && sql[i - 1] === "&" && (i < 3 || !/[A-Za-z0-9_$]/u.test(sql[i - 3])));
      i++;
      let value = "";
      let closed = false;
      while (i < sql.length) {
        if (escape && sql[i] === "\\") {
          value += sql.slice(i, i + 2);
          i += 2;
        } else if (sql[i] === "'" && sql[i + 1] === "'") {
          value += "'";
          i += 2;
        } else if (sql[i] === "'") {
          i++;
          closed = true;
          break;
        } else value += sql[i++];
      }
      if (!closed) throw new Error("migration SQL has an unterminated string literal");
      tokens.push({ type: "string", value });
      continue;
    }
    if (ch === '"') {
      i++;
      let value = "";
      let closed = false;
      while (i < sql.length) {
        if (sql[i] === '"' && sql[i + 1] === '"') {
          value += '"';
          i += 2;
        } else if (sql[i] === '"') {
          i++;
          closed = true;
          break;
        } else value += sql[i++];
      }
      if (!closed) throw new Error("migration SQL has an unterminated quoted identifier");
      tokens.push({ type: "identifier", value });
      continue;
    }
    if (ch === ";") {
      finish();
      i++;
      continue;
    }
    if (/[A-Za-z_]/u.test(ch)) {
      let end = i + 1;
      while (end < sql.length && /[A-Za-z0-9_$]/u.test(sql[end])) end++;
      tokens.push({ type: "word", value: sql.slice(i, end).toUpperCase() });
      i = end;
      continue;
    }
    tokens.push({ type: "symbol", value: ch });
    i++;
  }
  finish();
  return statements;
}

function transactionControlIn(statements) {
  const findings = [];
  for (const statement of statements) {
    const words = statement.filter((token) => token.type === "word").map((token) => token.value);
    const control = TRANSACTION_CONTROL.find((candidate) => candidate.every((word, index) => words[index] === word));
    if (control) findings.push(control.join(" "));
  }
  return findings;
}

export function assertNoTransactionControl(sql, version) {
  const controls = transactionControlIn(lexStatements(sql));
  if (controls.length) {
    throw new Error(
      `migration ${version} contains forbidden transaction control (${[...new Set(controls)].join(", ")}) — the runner owns BEGIN/ROLLBACK/COMMIT so its post-body verifiers remain atomic`,
    );
  }
}

/**
 * Refuse any migration whose text touches check_function_bodies.
 *
 * Disabling function-body validation is owner-authorized ONLY. Tolerating an in-body
 * toggle and restoring it afterwards is not containment — the body's functions were
 * already created under the disabled validation and COMMIT that way, so the restore
 * only launders the bypass. There is deliberately no allowlist and no environment
 * override: an authorized future use edits this runner, under review, which is the point.
 *
 * Matched across word, quoted-identifier AND string tokens, so the `SET`, `set_config()`
 * and `ALTER ... SET` spellings are all caught; lexStatements has already stripped
 * comments and resolved quoting, so a commented-out or string-literal decoy reads
 * correctly rather than by naive substring.
 *
 * KNOWN RESIDUAL, measured on 17.10: lexStatements collapses a dollar-quoted block to
 * its TAG, so a body that toggles the GUC dynamically inside `do $$ ... $$` is invisible
 * HERE. That case is caught server-side instead — the execution wrapper refuses a body
 * that exits with validation still disabled (which is exactly what the probe produced).
 * A body that toggles off, creates, and toggles back on within one dollar-quoted block
 * evades both layers and is recorded as a named residual, not silently implied to be covered.
 */
export function assertNoCheckFunctionBodyOverride(sql, version) {
  const touched = lexStatements(sql).some((tokens) =>
    tokens.some((token) =>
      (token.type === "word" || token.type === "identifier" || token.type === "string") &&
      token.value.toUpperCase() === "CHECK_FUNCTION_BODIES"));
  if (touched) {
    throw new Error(
      `migration ${version} touches check_function_bodies — disabling function-body validation requires explicit owner authorization and is never available to a migration body (the runner would otherwise commit functions that were never validated). Refusing.`,
    );
  }
}

export function migrationStatementTimeout(sql) {
  const statements = lexStatements(sql);
  const directives = statements.flatMap((tokens, index) => {
    const first = tokens[0];
    if (first?.type !== "word" || first.value !== "SET") return [];
    const setting = tokens.slice(1, 4).find(
      (token) => (token.type === "word" || token.type === "identifier") && token.value.toUpperCase() === "STATEMENT_TIMEOUT",
    );
    return setting ? [{ index, tokens }] : [];
  });
  if (!directives.length) return null;
  if (directives.length !== 1) {
    throw new Error("migration SQL contains more than one statement_timeout directive");
  }
  const [{ index, tokens }] = directives;
  if (index !== 0) {
    throw new Error("migration SET LOCAL statement_timeout must be the first executable statement");
  }
  const valid =
    tokens.length === 5 &&
    tokens[0].type === "word" && tokens[0].value === "SET" &&
    tokens[1].type === "word" && tokens[1].value === "LOCAL" &&
    tokens[2].type === "word" && tokens[2].value === "STATEMENT_TIMEOUT" &&
    ((tokens[3].type === "symbol" && tokens[3].value === "=") ||
      (tokens[3].type === "word" && tokens[3].value === "TO")) &&
    tokens[4].type === "string";
  if (!valid) {
    throw new Error("migration statement_timeout directive must be SET LOCAL statement_timeout =|TO followed by exactly one quoted literal");
  }
  return tokens[4].value;
}
