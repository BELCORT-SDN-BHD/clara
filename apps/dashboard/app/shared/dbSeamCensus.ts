// THE DB↔SURFACE SEAM CENSUS — the mechanical build-time gate (round-5 fix lane,
// 2026-08-03). PURE: no network, no DB, no React. The rig probe that drives it
// lives in dbSeamCensus.test.ts; the declared ledger in dbSeamCensus.bindings.ts.
//
// THE INVARIANT IT ENFORCES
//   Every jsonb key that crosses the DB→dashboard seam is accounted for in BOTH
//   directions: a mapper may read only keys the SHIPPED function actually emits,
//   and every key the shipped function emits is either consumed by a surface or
//   recorded, by name, as unconsumed.
//
// WHY IT EXISTS. Four live instances of one mechanism were measured on this
// branch: a dashboard lane wrote against a key or a door it ASSUMED, flagged it
// for someone else to land, and nobody landed it. The worst of them —
// /assets' `disposal_draft_entry_id` — was a 72-line panel gated on a key NO
// function in the schema emitted, so it could never render, while its ELSE branch
// offered a form whose only possible outcome was a governed refusal. Reviewers had
// read that file at least three times. A reviewer cannot hold 772 keys in their
// head; a census can.
//
// WHY IT MEASURES pg_get_functiondef AND NOT THE .sql FILES. Migration 0042 recuts
// live bodies by fetching pg_get_functiondef, string-splicing and EXECUTing the
// result — `_fa_asset_json`'s split-month advisory is added exactly that way. No
// static reader of packages/db/migrations/*.sql can see the shipped body. The only
// instrument that can is the catalog of a migrated database, which is the same
// instrument production uses. (The repo's queueKindCatalog.test.tsx rig probe is
// the precedent this follows: shell to psql, read the catalog, diff against TS.)
//
// WHAT IT CANNOT SEE — stated here, not discovered later:
//   * A read whose envelope is built by `to_jsonb(row)` / `row_to_json` / a
//     computed key expression. Its key set is not in the function text, so
//     direction 1 cannot be proven for it. Such reads are DECLARED opaque with a
//     reason, and the declared set must EQUAL the measured set — a new opaque read
//     fails the census instead of quietly joining the blind spot.
//     NOT every `to_jsonb` — see `declaredScalarLocals` below. `to_jsonb(v_from)`
//     on a variable the body DECLARES as `date` is a scalar coercion in a VALUE
//     position: it introduces no keys at all, so it cannot hide an envelope. Round 6
//     measured that narrowing on clara.staff_advance_statement, whose only
//     `to_jsonb` is exactly that — the census was declaring a blind spot over a read
//     it could fully prove, which is the same class of untruth as an undeclared one.
//   * Key TYPES and NULLABILITY. `cost_cents` present-but-null still passes.
//   * Whether a consumed key is RENDERED. A mapper that reads a key into a field
//     no component displays counts as consumed here.
//   * Nested key GROUPING. Both sides are compared as flat unions per read, so a
//     key emitted on rows[] and read on the envelope is not distinguished.
//   * Runtime/agent-lane consumers (packages/runtime). This censuses the dashboard.
//   * A consumer reached by anything other than a NAME the closure can read. The
//     consumer closure follows identifiers; a mapper dispatched through an object
//     map, a computed property or a variable holding the function is invisible to
//     it. That residue is what `unfollowedEnvelopeBinders` bounds rather than
//     assumes: it fails on any envelope-binding body a closure REFERENCES by name
//     and did not follow, so the /to[A-Z]/ naming convention the closure walks on is
//     an ENFORCED premise rather than an undeclared narrowing. Round 6 measured that
//     narrowing missing from this very list; measured at zero unfollowed today.

/** The plpgsql SOURCE PRIMITIVES live in ./dbSeamCensusSql — this module crossed the
 *  500-line cap in round 6 and the three text-only readers were the natural seam. They
 *  are RE-EXPORTED so every importer (and every self-test) keeps one import site. */
import { maskSqlComments, splitTopLevelArgs, declaredScalarLocals, maskTsComments, invocableShape } from "./dbSeamCensusSql";

export { maskSqlComments, splitTopLevelArgs, declaredScalarLocals, maskTsComments, invocableShape };


export type ProjectionScan = {
  /** Keys emitted in an ENVELOPE position (everything that is not a refusal detail). */
  keys: Set<string>;
  /** jsonb_build_object key positions that are not plain string literals. Their
   *  presence makes the body OPAQUE — direction 1 is unprovable for it. */
  computedKeyExprs: string[];
  /** `to_jsonb(...)`/`row_to_json(...)`/`to_json(...)` projections: a whole row
   *  shape the function text does not name. Also opaque. */
  rowProjections: string[];
  /** The same three functions applied to a DECLARED SCALAR — `to_jsonb(v_from)` on a
   *  `date`. A jsonb scalar has no keys, so it cannot hide an envelope and does NOT
   *  make the body opaque. Reported rather than dropped: a reader must be able to
   *  see why a body with a `to_jsonb` in it was still proven. */
  scalarCoercions: string[];
  /** How many jsonb_build_object sites were read (envelope + refusal). Zero on a
   *  body that projects some other way — the anti-vacuous tripwire. */
  buildObjectSites: number;
  /** Sites skipped because they build a `raise ... detail =` refusal payload.
   *  Refusal keys never reach a mapper, so counting them would make direction 2
   *  fail on every governed refusal in the codebase. */
  refusalSites: number;
};

const DETAIL_ASSIGN = /(?:^|[^a-z_])detail\s*(?::?=)\s*$/i;

/** Read every jsonb_build_object projection out of ONE function body. */
export function scanProjections(rawSrc: string): ProjectionScan {
  const src = maskSqlComments(rawSrc);
  const scalars = declaredScalarLocals(rawSrc);
  const keys = new Set<string>();
  const computedKeyExprs: string[] = [];
  const rowProjections: string[] = [];
  const scalarCoercions: string[] = [];
  let buildObjectSites = 0;
  let refusalSites = 0;

  const re = /jsonb_build_object\s*\(/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    buildObjectSites++;
    // A refusal payload (`raise ... using ... detail = jsonb_build_object(...)`)
    // is not part of any envelope. Detected by the assignment immediately before.
    if (DETAIL_ASSIGN.test(src.slice(Math.max(0, m.index - 40), m.index))) {
      refusalSites++;
      continue;
    }
    const { args } = splitTopLevelArgs(src.slice(m.index + m[0].length));
    if (args.length === 1 && (args[0] ?? "").trim() === "") continue; // jsonb_build_object()
    if (args.length % 2 !== 0) {
      computedKeyExprs.push(`odd-arity(${args.length}) near offset ${m.index}`);
      continue;
    }
    for (let k = 0; k < args.length; k += 2) {
      const a = (args[k] ?? "").trim();
      const lit = /^'((?:[^']|'')*)'(\s*::\s*text)?$/.exec(a);
      if (lit) keys.add((lit[1] ?? "").replace(/''/g, "'"));
      else computedKeyExprs.push(a.replace(/\s+/g, " ").slice(0, 80));
    }
  }

  // A row projection is opaque because its KEY SET is not in the function text. That
  // is only true when it projects something WITH keys. `to_jsonb(v_from)` on a
  // declared `date` is a scalar coercion in a VALUE position — it yields a jsonb
  // string, contributes no key, and cannot hide an envelope. FAIL CLOSED: only a
  // single BARE IDENTIFIER the body declares at a recognised scalar type is exempt;
  // an expression, a table alias, a composite, a `record`, an argument (prosrc does
  // not carry parameter types) or anything unparsed keeps its opacity.
  const rowRe = /\b(to_jsonb|row_to_json|to_json)\s*\(/gi;
  while ((m = rowRe.exec(src)) !== null) {
    const fn = (m[1] ?? "").toLowerCase();
    const { args } = splitTopLevelArgs(src.slice(m.index + m[0].length));
    const arg = (args[0] ?? "").trim();
    if (args.length === 1 && /^[A-Za-z_][\w$]*$/.test(arg) && scalars.has(arg)) {
      scalarCoercions.push(`${fn}(${arg})`);
      continue;
    }
    rowProjections.push(fn);
  }

  return { keys, computedKeyExprs, rowProjections, scalarCoercions, buildObjectSites, refusalSites };
}

export type CatalogFn = { ident: string; name: string; returns: string; src: string };

export type EmittedClosure = {
  keys: Set<string>;
  visited: string[];
  computedKeyExprs: string[];
  rowProjections: string[];
  scalarCoercions: string[];
  buildObjectSites: number;
};

/** A PURE DELEGATE: a body that emits no projection of its own and whose answer is a
 *  single nested clara.* call. Such a body contributes nothing to the closure — it is a
 *  floor or an admission in front of someone else's answer — so walking THROUGH it must
 *  not cost a hop.
 *
 *  WHY THIS EXISTS (F-A4 PR-1c review, FIX-2). The depth budget is a proxy for "how far
 *  from the read does a key still belong to the read", and it was calibrated against
 *  chains of bodies that each actually project something. The moment a body is extracted
 *  into `public verb -> core` — which is what the estate does whenever a human floor has
 *  to be lifted off an answer so the agent lane can reach it — the SAME chain grows a hop
 *  that carries no keys, and a real projection at the far end silently leaves the measured
 *  closure. Nothing about the seam changed; only the number of stack frames did. Counting
 *  a keyless delegate as a hop measures our refactoring, not the seam.
 *
 *  Deliberately narrow: zero emitted keys AND zero build-object sites AND exactly one
 *  `return`, which is a delegating call. A body with a second return, or with any
 *  projection of its own, is a real link in the chain and still costs its hop. */
export function isPureDelegate(src: string, scan: ProjectionScan): boolean {
  if (scan.keys.size > 0 || scan.buildObjectSites > 0) return false;
  const masked = maskSqlComments(src);
  const returns = masked.match(/\breturn\b/gi) ?? [];
  const delegating = masked.match(/\breturn\s+clara\.[a-z0-9_]+\s*\(/gi) ?? [];
  return returns.length === 1 && delegating.length === 1;
}

/** The emitted-key CLOSURE of one read: its own projections plus those of every
 *  clara.* jsonb-returning helper it calls, to `maxDepth` hops — where a PURE DELEGATE
 *  (see above) is transparent rather than depth-consuming. The closure is
 *  what makes `_fa_asset_json`'s keys count as `list_fixed_assets`' keys without
 *  anyone declaring that relationship — the exact composition the four measured
 *  defects lived inside. */
export function emittedClosure(
  root: string,
  catalog: Map<string, CatalogFn[]>,
  maxDepth = 2,
): EmittedClosure {
  const seen = new Set<string>();
  const keys = new Set<string>();
  const visited: string[] = [];
  const computedKeyExprs: string[] = [];
  const rowProjections: string[] = [];
  const scalarCoercions: string[] = [];
  let buildObjectSites = 0;

  const walk = (name: string, depth: number): void => {
    if (depth > maxDepth || seen.has(name)) return;
    seen.add(name);
    for (const def of catalog.get(name) ?? []) {
      if (!/json/i.test(def.returns)) continue;
      visited.push(def.ident);
      const scan = scanProjections(def.src);
      for (const k of scan.keys) keys.add(k);
      buildObjectSites += scan.buildObjectSites;
      computedKeyExprs.push(...scan.computedKeyExprs.map((e) => `${def.ident}: ${e}`));
      rowProjections.push(...scan.rowProjections.map((e) => `${def.ident}: ${e}`));
      scalarCoercions.push(...scan.scalarCoercions.map((e) => `${def.ident}: ${e}`));
      const callRe = /\bclara\.(_?[a-z0-9_]+)\s*\(/gi;
      let c: RegExpExecArray | null;
      const masked = maskSqlComments(def.src);
      // A keyless single-return delegate is TRANSPARENT: recurse at the same depth, so an
      // extraction that lifts a human floor off an answer cannot push a real projection out
      // of the measured closure (FIX-2).
      const nextDepth = isPureDelegate(def.src, scan) ? depth : depth + 1;
      while ((c = callRe.exec(masked)) !== null) {
        const callee = c[1] ?? "";
        if ((catalog.get(callee) ?? []).some((d) => /json/i.test(d.returns))) walk(callee, nextDepth);
      }
    }
  };
  walk(root, 0);
  return { keys, visited, computedKeyExprs, rowProjections, scalarCoercions, buildObjectSites };
}

export type MapperScan = { keys: Set<string>; aliases: string[]; sawRecIdiom: boolean };

/** Read the jsonb key set a dashboard model/api module CONSUMES.
 *
 *  The house idiom, identical in agingModel/assetsModel/advancesModel/reconModel:
 *      const o = rec(raw);          // or  (raw ?? {}) as Record<string, unknown>
 *      ... s(o.account_code) ...
 *      const fy = rec(o.fy_end);    // a nested envelope object
 *      ... numOrNull(fy.month) ...
 *  plus the shape probes `hasArray(raw, "rows")` and `"asset" in o`.
 *
 *  Anti-vacuous: `sawRecIdiom` reports whether the module actually binds an
 *  envelope alias at all. A module that does not is NOT proven empty — the caller
 *  must fail rather than record a zero. */
export function scanMapperKeys(tsSource: string): MapperScan {
  const aliases = new Set<string>(["o"]);
  // Every spelling of "bind the raw envelope to a local" that this codebase uses:
  //   const o = rec(raw);
  //   const o = (out ?? {}) as Record<string, unknown>;
  //   const r = raw as Record<string, unknown>;
  //   const entry = (r.entry ?? {}) as Record<string, unknown>;
  //   const o = jsonObj(raw);          (reviewTypes.ts's spelling of the same idiom)
  const aliasRe = /\bconst\s+([A-Za-z_$][\w$]*)\s*(?::[^=]*)?=\s*[^;]*?(?:\brec\s*\(|\bjsonObj\s*\(|as\s+Record\s*<)/g;
  let m: RegExpExecArray | null;
  let bound = 0;
  while ((m = aliasRe.exec(tsSource)) !== null) {
    if (m[1]) { aliases.add(m[1]); bound++; }
  }
  // NOT "did the text contain rec(raw)" — "did this consumer chain bind an envelope
  // alias at all". A chain that binds none has an UNPROVEN consumed set, and the
  // census must fail rather than record a confident zero.
  const sawRecIdiom = bound > 0;

  const keys = new Set<string>();
  for (const alias of aliases) {
    // `(?!\s*\()` excludes METHOD calls. An envelope key is data, never invoked, so
    // `someSet.has(x)` on a same-named local must not be scored as a DB key — it
    // produced a phantom `get_document_extract.has` before this guard existed.
    const re = new RegExp(`\\b${alias.replace(/\$/g, "\\$")}\\.([A-Za-z_$][\\w$]*)\\b(?!\\s*\\()`, "g");
    while ((m = re.exec(tsSource)) !== null) if (m[1]) keys.add(m[1]);
  }
  // Shape probes and bracket access carry their key as a string literal.
  const litRe = /\b(?:hasArray|hasKey)\s*\(\s*\w+\s*,\s*"([a-z0-9_]+)"|"([a-z0-9_]+)"\s+in\s+\w+|\bo\[\s*"([a-z0-9_]+)"\s*\]/g;
  while ((m = litRe.exec(tsSource)) !== null) {
    const k = m[1] ?? m[2] ?? m[3];
    if (k) keys.add(k);
  }

  return { keys, aliases: [...aliases], sawRecIdiom };
}

/** Every top-level `function NAME(...) { ... }` body in a TS/TSX module, keyed by
 *  name. Brace-matched, not regex-terminated, so a nested block cannot truncate a
 *  body. Used to bound the consumed-key scan to the mappers a given read actually
 *  goes through — a module-wide scan would union six unrelated envelopes and make
 *  direction 1 meaningless (measured: 1,611 phantom keys before this bound). */
/** The `{` that opens a function BODY, starting from its parameter-list paren.
 *  Load-bearing: `indexOf("{")` lands inside the RETURN TYPE on every wrapper
 *  written `): Promise<{ entry_id: string | null }>` or `): { args: string[] }`,
 *  so the "body" became the type literal and the rpc call inside it vanished from
 *  the census — measured on reconApi.acceptBankRuleSuggestion. A brace is the body
 *  only at angle-depth 0 and when it does not directly follow a type position. */
function findBodyBrace(src: string, fromParen: number): number {
  let angle = 0;
  let brace = 0;
  for (let i = fromParen; i < src.length; i++) {
    const ch = src[i];
    if (ch === "<") angle++;
    else if (ch === ">") { if (angle > 0) angle--; }
    else if (ch === "}") { if (brace > 0) brace--; }
    else if (ch === "{") {
      if (angle > 0 || brace > 0) { brace++; continue; }
      let j = i - 1;
      while (j >= 0 && /\s/.test(src[j] ?? "")) j--;
      const prev = src[j] ?? "";
      if (prev === ":" || prev === "|" || prev === "&" || prev === "," || prev === "(") { brace++; continue; }
      return i;
    }
  }
  return -1;
}

export function extractFunctionBodies(tsSource: string): Map<string, string> {
  const out = new Map<string, string>();
  const re = /(?:^|\n)\s*(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*[<(]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(tsSource)) !== null) {
    const open = findBodyBrace(tsSource, m.index + m[0].length - 1);
    if (open < 0) continue;
    let depth = 0;
    let i = open;
    for (; i < tsSource.length; i++) {
      const ch = tsSource[i];
      if (ch === "{") depth++;
      else if (ch === "}") { depth--; if (depth === 0) { i++; break; } }
    }
    if (m[1]) out.set(m[1], tsSource.slice(open, i));
  }
  return out;
}

/** The transitive set of mapper bodies one read's response passes through:
 *  the wire wrapper, every `to*` it calls, and every `to*` those call. */
export function mapperClosure(
  rootBody: string,
  bodies: Map<string, string>,
  maxDepth = 4,
): { bodies: string[]; names: string[] } {
  const seen = new Set<string>();
  const picked: string[] = [rootBody];
  const names: string[] = [];
  const visit = (body: string, depth: number): void => {
    if (depth > maxDepth) return;
    // NO trailing `\(` — the house idiom passes mappers BY REFERENCE
    // (`(o.assets as unknown[]).map(toAssetRow)`). Requiring a call paren made the
    // closure stop at the envelope mapper and miss every ROW mapper beneath it,
    // which is exactly where /assets' phantom key lived.
    const re = /\b(to[A-Z][A-Za-z0-9_$]*)\b/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(body)) !== null) {
      const name = m[1];
      if (!name || seen.has(name)) continue;
      seen.add(name);
      const b = bodies.get(name);
      if (!b) continue;
      names.push(name);
      picked.push(b);
      visit(b, depth + 1);
    }
  };
  visit(rootBody, 0);
  return { bodies: picked, names };
}

/** Does this function body BIND a raw jsonb envelope? The same idiom
 *  `scanMapperKeys` scores, asked as a yes/no about an arbitrary body. */
export function bindsEnvelope(body: string): boolean {
  return scanMapperKeys(body).sawRecIdiom;
}

/** Every envelope-binding body a consumer closure REFERENCES BY NAME but did NOT
 *  follow.
 *
 *  WHY THIS EXISTS. `mapperClosure` walks names matching /to[A-Z]/, which is a
 *  CONVENTION, not a law — a mapper called `hydrateAsset` or `parseRow` would be
 *  invisible in BOTH directions at once: its consumed keys would go unrecorded
 *  (making every key it reads look unconsumed) and any phantom it reads would go
 *  unseen. Round 6 measured that narrowing missing from this module's own "WHAT IT
 *  CANNOT SEE" list — an undeclared blind spot inside a gate whose entire job is
 *  declared completeness.
 *
 *  The remedy is not to widen the walk (following every identifier would drag in
 *  unrelated envelopes and make direction 1 meaningless — the 1,611-phantom-key
 *  regression that bounded the scan in the first place). It is to make the
 *  convention ENFORCED: if a body in the closure names a function that binds an
 *  envelope and the closure did not visit it, that is a real hole and it fails.
 *  Measured at ZERO across every read on this branch, so the convention holds today
 *  and the census is not merely declaring the gap.
 *
 *  It also catches the DEPTH limit, not only the naming one: a `toX` beyond
 *  maxDepth is referenced-but-unfollowed too. */
export function unfollowedEnvelopeBinders(
  closureBodies: string[],
  bodies: Map<string, string>,
  followed: Set<string>,
): string[] {
  const out = new Set<string>();
  for (const body of closureBodies) {
    const idRe = /\b([A-Za-z_$][\w$]*)\b/g;
    let m: RegExpExecArray | null;
    while ((m = idRe.exec(body)) !== null) {
      const name = m[1];
      if (!name || followed.has(name) || out.has(name)) continue;
      const b = bodies.get(name);
      // `b === body` is self-reference (a recursive mapper, or the root naming
      // itself); it is already in the closure by construction.
      if (!b || b === body) continue;
      if (bindsEnvelope(b)) out.add(name);
    }
  }
  return [...out].sort();
}

// ---------------------------------------------------------------------------
// [round-7 F-F3] DIRECTION 3 (partial) — is the read ever asked for AT ALL?
//
// The stated blind spot above ("Whether a consumed key is RENDERED... counts
// as consumed here") is honest about what this census cannot prove: a mapper
// that reads a key into a typed field is "consumed" here whether or not any
// component ever displays that field. Round 7 measured a WORSE case living
// one layer beneath that honest gap: `fa_register_tie`'s wire wrapper
// (assetsApi.ts's `faRegisterTie`) was never even CALLED by any `.tsx`
// component — its only caller in the whole dashboard was its own wire-level
// unit test — while the UNCONSUMED_BASELINE ledger comment beside it implied
// the opposite: that a "tie strip" rendered most of the read and was only
// missing nine named columns. There is no tie strip. Nothing about this read
// reaches a screen.
//
// Full render-tracing (does a component actually PAINT field X) is not
// honestly reachable by this census's text-scan architecture — JSX can pass a
// value through props, context, a child component in another file, or a
// formatter, and a sound tracer would have to be a type-aware compiler pass.
// What IS honestly reachable, and catches exactly the fa_register_tie shape,
// is a coarser and STRONGER fact: whether the read's wire wrapper is invoked
// by name from ANY component source at all. A `false` here means nothing
// about the read was ever even ASKED FOR by a screen — which subsumes "not
// rendered" (you cannot render what you never fetched). A `true` proves much
// less (the fetched value could still be stored and displayed nowhere), so
// this stays a PARTIAL Direction 3: it converts one FALSE positive (the old
// bindings.ts comment) into an honestly-measured, ratcheted fact, without
// pretending to close the wider render-tracing gap.
// ---------------------------------------------------------------------------

/** Every function NAME in `bodies` whose body calls `rpc("rpcName"` — i.e.
 *  every wire wrapper for one RPC. Mirrors the `wrapperBodies` idiom
 *  (dbSeamCensus.test.ts) but returns the NAME, not the body: Direction 3
 *  needs to search for that name as a CALL token in component source, not
 *  re-scan the wrapper's own text. */
export function wrapperNamesForRpc(rpcName: string, bodies: Map<string, string>): string[] {
  const probe = new RegExp(`rpc\\(\\s*\\n?\\s*"${rpcName}"`);
  const out: string[] = [];
  for (const [name, body] of bodies) if (probe.test(body)) out.push(name);
  return out;
}

/** [round-8 F1] Cache of `maskTsComments` by source text — this check runs once per
 *  (read × wrapper) pair over the SAME `tsxSources` array, so masking every file
 *  fresh on every call would redo identical work O(reads) times. Content-keyed and
 *  side-effect-free: a pure memo, not shared mutable state across an unrelated run. */
const MASKED_TS_CACHE = new Map<string, string>();
function maskedTsCached(src: string): string {
  let m = MASKED_TS_CACHE.get(src);
  if (m === undefined) { m = maskTsComments(src); MASKED_TS_CACHE.set(src, m); }
  return m;
}

/** Is `name` ever CALLED — directly or one hop through a locally-bound reference —
 *  inside any of `tsxSources`? See `invocableShape` above for exactly what shape
 *  counts and why a comment/import/string no longer does (round-8 F1). */
export function calledFromAnyComponent(name: string, tsxSources: Iterable<string>): boolean {
  for (const src of tsxSources) if (invocableShape(name, maskedTsCached(src))) return true;
  return false;
}

export type PhantomUse = "branching" | "fallback";

/** How does the dashboard USE a key the DB never emits?
 *
 *  `fallback`  — every occurrence sits in a `??`/`||` coalescing chain that also
 *                names a key the DB DOES emit. The surface degrades to the real
 *                key; nothing is dead. (The house "assumed shape, read both
 *                spellings" idiom: `s(o.original_filename) ?? s(o.filename)`.)
 *  `branching` — at least one occurrence is the SOLE source of a value or of a
 *                render condition. This is the defect shape: /assets gated a
 *                72-line panel on `live.disposal_draft_entry_id ? … : …`, a key
 *                no function emits, so the panel could never render and the ELSE
 *                arm offered a form whose only outcome was a refusal.
 *
 *  Only `branching` is a census FAILURE. Distinguishing them is what makes the
 *  direction-1 gate zero-waiver without drowning in the defensive-read idiom. */
export function classifyPhantomUse(sources: string[], key: string, emitted: Set<string>): PhantomUse {
  const occ = new RegExp(`\\b[A-Za-z_$][\\w$]*\\.${key}\\b`, "g");
  for (const src of sources) {
    let m: RegExpExecArray | null;
    while ((m = occ.exec(src)) !== null) {
      const window = src.slice(Math.max(0, m.index - 140), m.index + key.length + 140);
      const coalesced =
        new RegExp(`\\.${key}\\b\\s*\\)?\\s*(\\?\\?|\\|\\|)`).test(window) ||
        new RegExp(`(\\?\\?|\\|\\|)\\s*[\\w$]*\\(?\\s*[A-Za-z_$][\\w$]*\\.${key}\\b`).test(window);
      if (!coalesced) return "branching";
      // A coalesce is only a real fallback if a SIBLING alternative is a key the
      // DB actually emits — two phantoms coalescing are still two phantoms.
      const sib = /\b[A-Za-z_$][\w$]*\.([A-Za-z_$][\w$]*)/g;
      let s2: RegExpExecArray | null;
      let sawReal = false;
      while ((s2 = sib.exec(window)) !== null) {
        const other = s2[1];
        if (other && other !== key && emitted.has(other)) sawReal = true;
      }
      if (!sawReal) return "branching";
    }
  }
  return "fallback";
}

/** Two-direction diff for one read. */
export function diffSeam(
  emitted: Set<string>,
  consumed: Set<string>,
): { phantom: string[]; unconsumed: string[] } {
  return {
    phantom: [...consumed].filter((k) => !emitted.has(k)).sort(),
    unconsumed: [...emitted].filter((k) => !consumed.has(k)).sort(),
  };
}
