import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { after, before, beforeEach, describe, it } from "node:test";

import {
  CALLER_CONTEXT_SELECT,
  FIRM_ROLES,
  loadCallerContext,
} from "../lib/firm/caller-context";
import {
  REGISTRATION_REQUESTS_SELECT,
  loadRegistrationRequestsForApplicant,
} from "../lib/registration/reads";
import { loadOwnRegistrationRequests } from "../lib/registration/server-reads";
import { stripComments } from "../test/sourceOracle";
import { lexSql } from "../test/sqlOracle";
import type { SessionTokenAccessor } from "@/lib/session";
import type { ServerSession } from "../lib/supabase/server-session";

/**
 * THE DB-FACING PINS for P4-2 — the projections are the DB's own words, the
 * rung-0 live-body census is mechanised, and what reaches the wire is asserted on
 * the URL rather than read off the source.
 *
 * EVERY SQL READ GOES THROUGH A LEXER, NEVER A RAW REGEX (Codex review of #451,
 * LOW-5). The previous version matched against raw file text, so a commented-out
 * contract tuple or a commented `CREATE OR REPLACE VIEW` counted as evidence —
 * and `declaredContract` took the FIRST match, which a decoy placed above the real
 * one would win. Definitions are now sought only in statement-level SQL (strings
 * and dollar-quoted bodies blanked), contracts only in comment-free SQL, and both
 * must match EXACTLY ONCE.
 */

const WEB_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const MIGRATIONS_DIR = join(WEB_ROOT, "..", "..", "packages", "db", "migrations");

// ---------------------------------------------------------------------------
// THE ISOMORPHIC WALL — a client-importable module may not reach next/headers
// ---------------------------------------------------------------------------

/** Resolve a relative or `@/`-aliased specifier to a file under apps/web, or null
 *  for a bare package specifier (which this walk does not follow). */
function resolveLocal(fromFile: string, spec: string): string | null {
  const base = spec.startsWith("@/")
    ? join(WEB_ROOT, spec.slice(2))
    : spec.startsWith(".")
      ? join(dirname(join(WEB_ROOT, fromFile)), spec)
      : null;
  if (base === null) return null;
  for (const ext of [".ts", ".tsx", "/index.ts", "/index.tsx"]) {
    const candidate = `${base}${ext}`;
    if (existsSync(candidate)) return candidate.slice(WEB_ROOT.length + 1).split(sep).join("/");
  }
  return null;
}

/** Every specifier a module imports — VALUE imports only. `import type` is erased
 *  at compile time and drags nothing into a bundle, which is exactly why a
 *  type-only edge must not be followed here. */
function valueImports(webRelative: string): string[] {
  const code = stripComments(readFileSync(join(WEB_ROOT, webRelative), "utf8"));
  const out: string[] = [];
  for (const m of code.matchAll(/import\s+([\s\S]*?)from\s*["']([^"']+)["']/g)) {
    if (/^\s*type\s/.test(m[1] as string)) continue;
    out.push(m[2] as string);
  }
  for (const m of code.matchAll(/import\s*["']([^"']+)["']/g)) out.push(m[1] as string);
  return out;
}

/** The transitive value-import closure, plus every bare specifier reached. */
function importClosure(entry: string): { files: Set<string>; bare: Set<string> } {
  const files = new Set<string>();
  const bare = new Set<string>();
  const queue = [entry];
  while (queue.length > 0) {
    const current = queue.pop() as string;
    if (files.has(current)) continue;
    files.add(current);
    for (const spec of valueImports(current)) {
      const local = resolveLocal(current, spec);
      if (local === null) bare.add(spec);
      else queue.push(local);
    }
  }
  return { files, bare };
}

describe("client-importable modules never drag next/headers into the bundle", () => {
  // P4-5 found this the hard way: value-importing anything from
  // lib/registration/reads.ts pulled server-session.ts → supabase/server.ts →
  // next/headers, so a client component that imported one constant broke. The
  // server-only half moved to lib/registration/server-reads.ts; this walk is what
  // keeps the split honest instead of trusting a comment.
  const ISOMORPHIC = ["lib/registration/reads.ts", "lib/firm/caller-context.ts", "lib/read.ts"];

  for (const entry of ISOMORPHIC) {
    it(`${entry} reaches no server-only module`, () => {
      const { files, bare } = importClosure(entry);
      assert.ok(!bare.has("next/headers"), `${entry} transitively value-imports next/headers`);
      assert.ok(
        !files.has("lib/supabase/server.ts"),
        `${entry} reaches lib/supabase/server.ts, which imports next/headers`,
      );
      assert.ok(
        !files.has("lib/supabase/server-session.ts"),
        `${entry} reaches lib/supabase/server-session.ts, which reaches next/headers`,
      );
    });
  }

  it("VACUITY CONTROL: the walk DOES find next/headers where it really is", () => {
    const { files, bare } = importClosure("lib/registration/server-reads.ts");
    assert.ok(files.has("lib/supabase/server-session.ts"), "the walk cannot see a one-hop edge");
    assert.ok(
      bare.has("next/headers"),
      "the walk cannot see next/headers even on the module that genuinely imports it — every assertion above would be vacuous",
    );
  });

  it("VACUITY CONTROL: a type-only edge is NOT followed", () => {
    // `import type` is erased, so following it would red modules that are
    // perfectly safe — lib/read.ts type-imports @/lib/session, which is
    // browser-only, and that edge costs a bundle nothing.
    const code = 'import type { X } from "@/lib/supabase/server";\nimport { y } from "./read";';
    const specs = (() => {
      const out: string[] = [];
      for (const m of stripComments(code).matchAll(/import\s+([\s\S]*?)from\s*["']([^"']+)["']/g)) {
        if (/^\s*type\s/.test(m[1] as string)) continue;
        out.push(m[2] as string);
      }
      return out;
    })();
    assert.deepEqual(specs, ["./read"], "a type-only import was followed as a value edge");
  });
});

const MIGRATION_FILES = readdirSync(MIGRATIONS_DIR)
  .filter((f) => f.endsWith(".sql"))
  .sort();

const migration = (name: string): string => readFileSync(join(MIGRATIONS_DIR, name), "utf8");

/**
 * Every real, statement-level `create [or replace] view clara.<name>` OCCURRENCE
 * in the corpus, with its file and byte offset.
 *
 * OCCURRENCES, NOT FILENAMES, AND A FRESH REGEX PER FILE (#451 Codex round 2,
 * item 3 — a bug in this gate, not in the code it guards). The previous version
 * built ONE global regex and called `.test()` on each file in a `filter`. A global
 * regex carries `lastIndex` across calls, so `.test()` resumed mid-way through the
 * next file and could miss a definition near its start; and returning filenames
 * collapsed two definitions in ONE file into a single entry. Either way the census
 * could report "exactly one" while the corpus held two — the precise failure this
 * cell exists to catch. Ironic and instructive: a stateful module-level regex is
 * the same hazard the cache-safety cell now bans by name.
 */
function viewDefinitions(view: string): { file: string; offset: number }[] {
  const out: { file: string; offset: number }[] = [];
  for (const file of MIGRATION_FILES) {
    // THE SCHEMA QUALIFIER IS SQL, NOT A FIXED STRING (#451 round-3, LOW-1).
    // PostgreSQL accepts `clara . caller_context` and `clara."caller_context"` as
    // the very same relation, and `clara\.${view}` saw neither — a second live
    // body written in either spelling would have passed a census whose whole claim
    // is "exactly one, estate-wide". `\b` sits INSIDE the optional closing quote
    // so it still anchors on the identifier's last character in both spellings.
    const re = new RegExp(
      `create\\s+(or\\s+replace\\s+)?view\\s+"?clara"?\\s*\\.\\s*"?${view}\\b"?`,
      "gi",
    );
    for (const m of lexSql(migration(file)).statements.matchAll(re)) {
      out.push({ file, offset: m.index ?? -1 });
    }
  }
  return out;
}

/** The one live body, asserted to be exactly one OCCURRENCE estate-wide. */
function theOnlyDefinition(view: string, expectedFile: string): void {
  const defs = viewDefinitions(view);
  assert.deepEqual(
    defs.map((d) => `${d.file}@${d.offset}`),
    defs.length === 1 && defs[0]?.file === expectedFile
      ? [`${expectedFile}@${defs[0].offset}`]
      : [`${expectedFile}@<exactly one>`],
    `clara.${view} must have exactly ONE statement-level definition, in ${expectedFile} — re-run the rung-0 census`,
  );
}

/** The `('<relation>', <n>, '<cols>')` column contract a migration registers in its
 *  own tail census. Comment-free, and required to appear EXACTLY ONCE. */
function declaredContract(sql: string, relation: string): { count: number; columns: string } {
  const re = new RegExp(`\\(\\s*'${relation}'\\s*,\\s*(\\d+)\\s*,\\s*'([^']+)'\\s*\\)`, "g");
  const hits = [...lexSql(sql).withoutComments.matchAll(re)];
  assert.equal(hits.length, 1, `expected exactly ONE active column contract for '${relation}', found ${hits.length}`);
  const [, count, columns] = hits[0] as RegExpMatchArray;
  assert.ok(typeof count === "string" && typeof columns === "string", "contract matched without both groups");
  return { count: Number(count), columns };
}

describe("LOW-5 — the SQL lexer, controlled before it is trusted", () => {
  it("a commented-out CREATE VIEW is not a definition", () => {
    const sql = "-- create view clara.decoy as select 1;\n/* create view clara.decoy as select 2; */\ncreate view clara.real as select 3;";
    const { statements } = lexSql(sql);
    assert.ok(!/create\s+view\s+clara\.decoy/i.test(statements), "a commented DDL counted");
    assert.ok(/create\s+view\s+clara\.real/i.test(statements), "the real DDL was eaten");
  });

  it("a CREATE VIEW inside a dollar-quoted body is text, not a definition", () => {
    const sql = "do $$ begin raise notice 'create view clara.decoy as select 1'; end $$;\ncreate view clara.real as select 1;";
    const { statements } = lexSql(sql);
    assert.ok(!/create\s+view\s+clara\.decoy/i.test(statements));
    assert.ok(/create\s+view\s+clara\.real/i.test(statements));
  });

  it("comments INSIDE a dollar-quoted body are still stripped", () => {
    // The contracts live inside `do $$ … $$`, so a decoy tuple one level down is
    // exactly where it would hide.
    const sql = "do $$ begin\n  -- ('decoy', 9, 'a,b')\n  perform ('real', 2, 'a,b');\nend $$;";
    const { withoutComments } = lexSql(sql);
    assert.ok(!withoutComments.includes("decoy"), "a comment inside a do-block survived");
    assert.ok(withoutComments.includes("'real'"), "the live tuple was eaten");
  });

  it("a `--` inside a string is not a comment", () => {
    const { withoutComments } = lexSql("select 'p4t1 tail: OK -- everything live', 1;");
    assert.ok(withoutComments.includes("everything live"), "a string's contents were eaten as a comment");
  });

  it("an ESCAPE string `E'…\\'…'` does not end early — a DDL inside one stays masked", () => {
    // PostgreSQL's E'' form escapes with a BACKSLASH, and the corpus really
    // contains this syntax (0111_f_a5_reporting_agency_pr1.sql:606). Treating
    // `\'` as the closing quote desynchronises everything after it.
    //
    // THE FIXTURE IS CHOSEN TO DISCRIMINATE, which an earlier version was not: the
    // whole `; create view … ;` sits INSIDE one escape string, so correct lexing
    // masks it and a lexer that ends the string at `\'` exposes it at statement
    // level. An earlier fixture put the DDL after the string and let a `--`
    // comment eat the evidence in both cases — a cell that passed either way.
    const sql = "select E'\\'; create view clara.probe as select 1; ';";
    const { statements } = lexSql(sql);
    assert.ok(
      !/create\s+view\s+clara\.probe/i.test(statements),
      "a CREATE VIEW inside an escape string surfaced as a real definition — the lexer lost sync on \\'",
    );
  });

  it("an escape string does not swallow the statement that follows it", () => {
    const sql = "select E'a\\'b';\ncreate view clara.probe as select 1;";
    assert.ok(
      /create\s+view\s+clara\.probe/i.test(lexSql(sql).statements),
      "the DDL after an escape string was swallowed",
    );
  });

  it("the REAL corpus parses: 0111's escape string does not desynchronise it", () => {
    const { withoutComments, statements } = lexSql(migration("0111_f_a5_reporting_agency_pr1.sql"));
    assert.equal(withoutComments.length, statements.length);
    assert.ok(withoutComments.length > 1000, "the file did not lex at all");
  });

  it("a contract decoy NESTED in an inner dollar string does not count", () => {
    // The outer `do $$ … $$` is a body and is lexed; an inner `$q$ … $q$` inside it
    // is a LITERAL and is masked. Retaining it let a contract-shaped decoy satisfy
    // declaredContract() (#451 Codex round 2, item 4).
    const sql = "do $$ begin\n  perform $q$ ('caller_context', 6, 'DECOY') $q$;\nend $$;";
    const { withoutComments } = lexSql(sql);
    assert.ok(!withoutComments.includes("DECOY"), "a nested dollar-string payload survived as evidence");
  });

  it("a DDL decoy nested in an inner dollar string does not count either", () => {
    const sql = "do $$ begin\n  perform $q$ create view clara.probe as select 1; $q$;\nend $$;";
    assert.ok(!/create\s+view\s+clara\.probe/i.test(lexSql(sql).statements));
  });

  it("MED-3 — a BARE DDL inside a top-level do block IS a definition", () => {
    // The three cells above prove what stays MASKED. This one proves the lexer
    // did not buy that by blinding itself: `do $$ begin create or replace view
    // …; end $$;` is executable SQL that really defines the view, and blanking
    // the whole body hid a live body from the one-definition census (#451
    // round-3, MED-3). The discrimination is by KIND, not by depth alone — the
    // quoted decoy and the nested payload above still do not count.
    const sql = "do $$ begin\n  create or replace view clara.probe as select 1;\nend $$;";
    assert.ok(
      /create\s+or\s+replace\s+view\s+clara\.probe/i.test(lexSql(sql).statements),
      "a real CREATE VIEW inside a do block is invisible to the census",
    );
  });

  it("LOW-2 — an unterminated string keeps both views the same length", () => {
    // `statements` re-emitted a closing quote the input never had, so it came out
    // ONE BYTE LONGER than `withoutComments` — and every offset-based read in
    // these pins is built on the two views addressing the same bytes.
    const sql = "select '";
    const { withoutComments, statements } = lexSql(sql);
    assert.equal(withoutComments.length, sql.length);
    assert.equal(statements.length, sql.length);
  });

  it("LOW-3 — `$1$` is a parameter, not a dollar tag", () => {
    // `$1$` has no closing tag, so reading it as one masked the rest of the FILE.
    const sql = "select $1$::text;\ncreate view clara.probe as select 1;";
    const { statements, withoutComments } = lexSql(sql);
    assert.ok(/create\s+view\s+clara\.probe/i.test(statements), "everything after `$1$` was masked away");
    assert.equal(withoutComments.length, sql.length);
  });

  it("LOW-3 — an UNTERMINATED dollar tag does not mask to EOF", () => {
    // The fail-OPEN direction: one malformed tag silently erasing every statement
    // after it is exactly how a live body would leave a census clean.
    const sql = "do $body$ begin end;\ncreate view clara.probe as select 1;";
    const { statements } = lexSql(sql);
    assert.ok(
      /create\s+view\s+clara\.probe/i.test(statements),
      "an unterminated $body$ swallowed the statements that follow it",
    );
    assert.equal(statements.length, sql.length);
  });

  it("LOW-1 — a spaced or quoted schema qualifier is the SAME relation", () => {
    // `clara . probe` and `clara."probe"` are both `clara.probe` to PostgreSQL;
    // a census that reads only `clara\.probe` would call a second live body zero.
    for (const spelling of ['clara . probe', 'clara."probe"', '"clara"."probe"', "clara.probe"]) {
      const defs = [
        ...lexSql(`create or replace view ${spelling} as select 1;`).statements.matchAll(
          /create\s+(or\s+replace\s+)?view\s+"?clara"?\s*\.\s*"?probe\b"?/gi,
        ),
      ];
      assert.equal(defs.length, 1, `${spelling} was not seen as a definition of clara.probe`);
    }
    const near = [
      ...lexSql("create view clara.probe_other as select 1;").statements.matchAll(
        /create\s+(or\s+replace\s+)?view\s+"?clara"?\s*\.\s*"?probe\b"?/gi,
      ),
    ];
    assert.equal(near.length, 0, "clara.probe_other matched the pin for clara.probe");
  });

  it("every view is LENGTH-PRESERVING — the property the CHECK cell relies on", () => {
    for (const file of ["0002_foundation.sql", "0141_p4_tranche1_invite_rbac.sql"]) {
      const raw = migration(file);
      const { withoutComments, statements } = lexSql(raw);
      assert.equal(withoutComments.length, raw.length, `${file}: withoutComments changed length`);
      assert.equal(statements.length, raw.length, `${file}: statements changed length`);
    }
  });

  it("VACUITY CONTROL: the migration corpus was actually read", () => {
    assert.ok(MIGRATION_FILES.length > 100, `only ${MIGRATION_FILES.length} migrations found`);
  });
});

describe("the projections are the DB's own declared column contracts", () => {
  it("clara.caller_context has ONE live body — 0141:544, nothing superseding it", () => {
    theOnlyDefinition("caller_context", "0141_p4_tranche1_invite_rbac.sql");
  });

  it("caller_context's 6-column contract matches CALLER_CONTEXT_SELECT byte for byte", () => {
    const declared = declaredContract(migration("0141_p4_tranche1_invite_rbac.sql"), "caller_context");
    assert.equal(declared.count, 6);
    assert.equal(declared.columns, CALLER_CONTEXT_SELECT);
    assert.equal(CALLER_CONTEXT_SELECT.split(",").length, declared.count);
  });

  it("clara.firm_registration_requests_visible has ONE live body — 0145:911", () => {
    theOnlyDefinition(
      "firm_registration_requests_visible",
      "0145_p4_tranche2_registration_operator_alias.sql",
    );
  });

  it("VACUITY CONTROL: the census counts OCCURRENCES, not files", () => {
    // Two definitions in ONE input must count as two. The previous version
    // returned FILENAMES from a `filter`, so a file defining the view twice
    // reported "exactly one" — the precise failure the census exists to catch.
    const count = (sql: string) => {
      const re = new RegExp("create\\s+(or\\s+replace\\s+)?view\\s+clara\\.probe\\b", "gi");
      return [...lexSql(sql).statements.matchAll(re)].length;
    };
    assert.equal(
      count("create view clara.probe as select 1;\ncreate or replace view clara.probe as select 2;"),
      2,
      "two definitions in one file collapsed into one",
    );
    assert.equal(count("create view clara.probe as select 1;"), 1);
    assert.equal(count("select 1;"), 0);
  });

  it("VACUITY CONTROL: the OLD `.test()` technique really did skip — matchAll does not", () => {
    // Honest record of why the technique changed, and a live demonstration that
    // the hazard is real rather than a story. A global regex reused across
    // `.test()` calls carries `lastIndex` and resumes mid-way through the NEXT
    // input, so a definition near its start is missed. `matchAll` is immune
    // because it iterates over an internal clone — which is also why simply
    // sharing the regex object is no longer a bug, and why the mutant that only
    // shares it stays green.
    const inputs = ["-- pad --\ncreate view clara.probe as select 1;", "create view clara.probe as select 2;"];
    const shared = /create\s+view\s+clara\.probe\b/gi;
    const stateful = inputs.filter((s) => shared.test(s));
    assert.equal(stateful.length, 1, "the stateful hazard has stopped reproducing — re-examine this control");

    const sound = inputs.filter((s) => [...s.matchAll(/create\s+view\s+clara\.probe\b/gi)].length > 0);
    assert.equal(sound.length, 2, "matchAll must see both");
  });

  it("the registration view's 10-column contract matches REGISTRATION_REQUESTS_SELECT", () => {
    const declared = declaredContract(
      migration("0145_p4_tranche2_registration_operator_alias.sql"),
      "firm_registration_requests_visible",
    );
    assert.equal(declared.count, 10);
    assert.equal(declared.columns, REGISTRATION_REQUESTS_SELECT);
    assert.equal(REGISTRATION_REQUESTS_SELECT.split(",").length, declared.count);
  });

  it("a module that NAMES its pinning test must name one that really pins it", () => {
    // The nit this closes: both pin headers cited `tests/require-firm-scope.test.ts`
    // and stayed that way after the pins moved here — a citation nobody could
    // follow, found by a human reviewer rather than a gate. Prose is not usually
    // checkable, but a cited FILE plus the SYMBOL it claims to pin is.
    const CITATIONS: ReadonlyArray<{ module: string; symbol: string }> = [
      { module: "lib/firm/caller-context.ts", symbol: "CALLER_CONTEXT_SELECT" },
      { module: "lib/registration/reads.ts", symbol: "REGISTRATION_REQUESTS_SELECT" },
    ];
    for (const { module, symbol } of CITATIONS) {
      const src = readFileSync(join(WEB_ROOT, module), "utf8");
      const cited = [...src.matchAll(/`(tests\/[\w.-]+\.test\.tsx?)`/g)].map((m) => m[1] as string);
      assert.ok(cited.length > 0, `${module} names no pinning test at all`);
      for (const file of new Set(cited)) {
        const abs = join(WEB_ROOT, file);
        assert.ok(existsSync(abs), `${module} cites ${file}, which does not exist`);
        assert.ok(
          readFileSync(abs, "utf8").includes(symbol),
          `${module} cites ${file}, but that file does not mention ${symbol} — the citation points at the wrong test`,
        );
      }
    }
  });

  it("VACUITY CONTROL: the contract parser fails loudly on a relation it cannot find", () => {
    assert.throws(
      () => declaredContract(migration("0141_p4_tranche1_invite_rbac.sql"), "no_such_relation"),
      /exactly ONE active column contract/,
    );
  });

  it("MEDIUM-2: FIRM_ROLES is the CHECK constraint's own vocabulary (0002:215)", () => {
    // The validator refuses a role off this ladder, so the list must be the DB's,
    // not a hand-written lookalike.
    //
    // TWO VIEWS, ONE OFFSET (#451 Codex round 2, item 4). The CHECK has to be
    // found at STATEMENT level — a decoy inside a comment, a string or a
    // dollar-quoted body must not count — but the role NAMES live in string
    // literals, which the statement view masks. Because the lexer's masking is
    // length-preserving, the match found in `statements` addresses the same bytes
    // in `withoutComments`: locate it in the view that proves it is real, read it
    // from the view that still carries its values.
    const { withoutComments, statements } = lexSql(migration("0002_foundation.sql"));
    assert.equal(withoutComments.length, statements.length, "the lexer's views fell out of alignment");

    const re = /role\s+text\s+not null\s+check\s*\(\s*role\s+in\s*\(([^)]*)\)/i;
    const atStatementLevel = re.exec(statements);
    assert.ok(
      atStatementLevel,
      "0002 no longer declares firm_memberships.role's CHECK at statement level where this gate can read it",
    );
    const start = atStatementLevel.index;
    const values = withoutComments.slice(start, start + atStatementLevel[0].length);
    const declared = [...values.matchAll(/'([^']+)'/g)].map((x) => x[1]).sort();
    assert.deepEqual(
      declared,
      [...FIRM_ROLES].sort(),
      "the DB's role ladder and lib/firm/caller-context.ts's FIRM_ROLES have drifted — every member holding the new role would be denied",
    );
  });
});

const APPLICANT = "44444444-4444-4444-8444-444444444444";
const testSession: SessionTokenAccessor = { getAccessToken: async () => "test-token" };
const SESSION: ServerSession = { accessToken: "test-token", subject: APPLICANT };

describe("what the two reads actually put on the wire", () => {
  const realFetch = globalThis.fetch;
  const hadUrl = Object.hasOwn(process.env, "NEXT_PUBLIC_SUPABASE_URL");
  const prevUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  let calls: string[] = [];

  before(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://rig.supabase.test";
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      calls.push(typeof input === "string" ? input : String(input));
      return new Response("[]", { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof fetch;
  });

  after(() => {
    globalThis.fetch = realFetch;
    if (hadUrl) process.env.NEXT_PUBLIC_SUPABASE_URL = prevUrl;
    else delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  });

  beforeEach(() => {
    calls = [];
  });

  function onlyCall(): string {
    assert.equal(calls.length, 1, `expected exactly one request, saw ${calls.length}`);
    const [first] = calls;
    assert.ok(typeof first === "string", "no request URL was captured");
    return first;
  }

  it("loadCallerContext sends the pinned select and bounds the read at 2 rows", async () => {
    await loadCallerContext(testSession);
    const url = new URL(onlyCall());
    assert.equal(url.pathname, "/rest/v1/caller_context");
    assert.equal(url.searchParams.get("select"), CALLER_CONTEXT_SELECT);
    assert.equal(
      url.searchParams.get("limit"),
      "2",
      "without a 2-row bound a >1 result is truncated to one and the ambiguous branch can never fire",
    );
  });

  it("the applicant read is SELF-scoped ON THE WIRE, not just in the view", async () => {
    await loadRegistrationRequestsForApplicant(testSession, APPLICANT);
    const url = new URL(onlyCall());
    assert.equal(url.pathname, "/rest/v1/firm_registration_requests_visible");
    assert.equal(
      url.searchParams.get("applicant"),
      `eq.${APPLICANT}`,
      "an unfiltered read hands an operator-firm owner the WHOLE estate's queue",
    );
    assert.equal(url.searchParams.get("select"), REGISTRATION_REQUESTS_SELECT);
    assert.equal(url.searchParams.get("order"), "created_at.desc");
  });

  it("LOW-4: an unverifiable caller is its OWN branch — and issues no request", async () => {
    const result = await loadOwnRegistrationRequests({ resolveSession: async () => null });
    assert.equal(result.ok, false);
    assert.equal((result as { reason: string }).reason, "no_session");
    assert.equal(
      calls.length,
      0,
      "a read went out with no identity — and a returned emptiness would also be true of an unfiltered read that came back empty",
    );
  });

  it("LOW-4: a verified caller with zero rows is a SUCCESSFUL empty result", async () => {
    const result = await loadOwnRegistrationRequests({ resolveSession: async () => SESSION });
    assert.equal(result.ok, true);
    assert.deepEqual((result as { rows: readonly unknown[] }).rows, []);
    assert.equal(
      (result as { subject: string }).subject,
      SESSION.subject,
      "the mapper cannot bind hydrated rows unless the verified subject survives the read seam",
    );
    assert.equal(new URL(onlyCall()).searchParams.get("applicant"), `eq.${APPLICANT}`);
  });

  it("RED-before: collapsing both into [] makes the two indistinguishable", async () => {
    const collapsed = async (session: ServerSession | null) => (session === null ? [] : []);
    assert.deepEqual(await collapsed(null), await collapsed(SESSION));
    const a = await loadOwnRegistrationRequests({ resolveSession: async () => null });
    const b = await loadOwnRegistrationRequests({ resolveSession: async () => SESSION });
    assert.notDeepEqual(a, b, "the two answers must not be the same value");
  });
});
