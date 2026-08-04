// THE DB↔SURFACE SEAM CENSUS — the gate. Two layers, the queueKindCatalog.test.tsx
// precedent:
//   1. DB-free self-tests of the extractors + a COVERAGE assertion that always runs.
//   2. A rig-backed census that diffs every read the dashboard maps against the
//      SHIPPED catalog, in both directions. Self-skips without CLARA_RIG_DB=1.
//
// It cannot pass vacuously:
//   * every RPC the dashboard calls must be CLASSIFIED from the live catalog
//     (p_op_key ⇒ action, else read) — an unknown name fails;
//   * every read must yield a non-empty emitted set or be a DECLARED opaque read,
//     and the declared opaque set must EQUAL the measured one;
//   * every read's consumer chain must be non-empty and must bind the envelope
//     idiom — a mapper the closure cannot find fails rather than scoring zero;
//   * the extractor self-tests below fail if masking/parsing regresses to the
//     silently-sees-nothing state that made list_bank_rules read as 0 keys.

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  maskSqlComments, scanProjections, scanMapperKeys, extractFunctionBodies,
  mapperClosure, emittedClosure, diffSeam, classifyPhantomUse,
  declaredScalarLocals, unfollowedEnvelopeBinders, wrapperNamesForRpc, calledFromAnyComponent,
  type CatalogFn,
} from "./dbSeamCensus";
import {
  OPAQUE_READS, UNMAPPED_READS, PHANTOM_BRANCHING_ALLOW, UNCONSUMED_BASELINE, RENDER_DEAD,
} from "./dbSeamCensus.bindings";

const APP_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");

// --- DB-free: the extractors cannot silently see nothing -------------------------

test("maskSqlComments blanks prose comments without eating the SQL after them", () => {
  const sql = "-- the account's history\nselect jsonb_build_object('a', 1);";
  const masked = maskSqlComments(sql);
  assert.ok(!masked.includes("history"), "the comment body must be blanked");
  assert.ok(masked.includes("jsonb_build_object('a', 1)"), "the statement after it must survive");
  // THE REGRESSION THIS EXISTS FOR: an apostrophe in prose used to open a phantom
  // string literal, so every projection after it vanished from the census.
  assert.deepEqual([...scanProjections(sql).keys], ["a"]);
});

test("scanProjections reads literal keys, refuses to count refusal payloads, and reports opacity", () => {
  const s = scanProjections(`
    v := jsonb_build_object('client_id', p_client, 'rows', v_rows);
    raise exception 'no' using errcode = 'CLR39',
      detail = jsonb_build_object('reason', 'nope', 'axis', 'lifecycle')::text;
    v2 := jsonb_build_object(k, 1);
    v3 := to_jsonb(f);`);
  assert.deepEqual([...s.keys].sort(), ["client_id", "rows"]);
  assert.equal(s.refusalSites, 1, "a `detail = jsonb_build_object(...)` payload is not an envelope");
  assert.equal(s.computedKeyExprs.length, 1, "a non-literal key position must be reported, never dropped");
  assert.deepEqual(s.rowProjections, ["to_jsonb"]);
});

test("a to_jsonb on a DECLARED SCALAR is a coercion, not an opaque envelope — and everything else still is", () => {
  // The measured shape: clara.staff_advance_statement's only `to_jsonb` is
  // `to_jsonb(v_from)` on a local declared `date`, inside a VALUE position of the
  // envelope's own jsonb_build_object. A jsonb scalar has no keys, so the read is
  // fully provable; the census used to declare it a blind spot.
  const proven = scanProjections(`
declare
  c record; v_from date; v_to date; v_rows jsonb;
begin
  return jsonb_build_object('client_id', p_client,
    'from', case when v_from = '-infinity'::date then null else to_jsonb(v_from) end,
    'to', v_to, 'rows', v_rows);
end`);
  assert.deepEqual(proven.rowProjections, [], "a scalar coercion must not make the body opaque");
  assert.deepEqual(proven.scalarCoercions, ["to_jsonb(v_from)"], "…and must be reported, never silently dropped");
  assert.deepEqual([...proven.keys].sort(), ["client_id", "from", "rows", "to"]);

  // FAIL CLOSED on every other shape. `r` is a record, `v_rows` is jsonb, `f` is a
  // table alias the declare block never names, and `x || y` is an expression.
  for (const src of [
    "declare r record; begin v := to_jsonb(r); end",
    "declare v_rows jsonb; begin v := to_jsonb(v_rows); end",
    "begin v := to_jsonb(f); end",
    "declare v_a text; v_b text; begin v := to_jsonb(v_a || v_b); end",
    "declare v_x clara.fixed_assets%rowtype; begin v := row_to_json(v_x); end",
  ]) {
    assert.equal(scanProjections(src).rowProjections.length, 1, `must stay opaque: ${src}`);
  }
});

test("[round-9 fix wave, lane N2; r9 finding 4] to_jsonb on a QUALIFIED RECORD FIELD (the real clara._wdb_rerun_breach shape) stays opaque, and OPAQUE_READS.adjustment_run_due exists because of exactly this", () => {
  // THE DEFECT, REPRODUCED. Round-8's M1 fix spliced `'colliding_elements',
  // to_jsonb(e.collision)` into _wdb_rerun_breach three times (0042:1001,1006,1020
  // in the shipped migration) — `e` is a `for e in select ...` loop record and
  // `.collision` is a text[] COLUMN of that query, never itself a bare declared
  // identifier. declaredScalarLocals only ever recognises a bare name the
  // `declare` block types at a scalar — `e.collision` fails that test on shape
  // alone (the dot), so this stays a rowProjection and the closure that reaches
  // it (adjustment_run_due, at exactly the census's own depth-2 limit) goes
  // opaque. This cell pins that classification directly, so a future change to
  // scanProjections/declaredScalarLocals that silently started treating a
  // qualified field access as provable would be caught here BEFORE it silently
  // shrank OPAQUE_READS.adjustment_run_due out from under the ledger.
  const s = scanProjections(`
declare
  e record; v_first_standing jsonb;
begin
  for e in select je.id, s.collision from clara.journal_entries je
    cross join lateral (select clara._wdb_shape_overlap(x, y) as collision) s
  loop
    v_first_standing := jsonb_build_object('axis', 'pair_half_uncorrected',
      'entry_id', e.id, 'colliding_elements', to_jsonb(e.collision));
  end loop;
end`);
  assert.deepEqual(s.rowProjections, ["to_jsonb"], "e.collision is a qualified field, not a bare scalar local — it must stay opaque");
  assert.ok(s.keys.has("colliding_elements"), "the literal key IS in the text even though its value cannot be proven keyless");
});

test("[round-9 fix wave, lane N2; r9 finding 4, WDB-R4] Direction 1 still catches a manufactured branching phantom key on a read this opacity class does not touch — the loss OPAQUE_READS.adjustment_run_due accepts is scoped, not a regression of the mechanism", () => {
  // WHAT round-9 FOUND: declaring adjustment_run_due opaque (the fix above) turns
  // OFF Direction-1 (branching-phantom-key) protection for its WHOLE envelope —
  // stated in the ledger's own comment, not hidden. This cell answers the
  // question that leaves open: is the CENSUS ITSELF still able to catch a
  // branching phantom key at all, on a read this specific opacity class never
  // reaches? Built exactly the way the rig test at the bottom of this file
  // does it (emittedClosure -> diffSeam -> classifyPhantomUse), DB-free, on a
  // decoy catalog rather than the live one — the same shape a fresh regression
  // in scanProjections/diffSeam would have to survive undetected.
  const catalog = new Map<string, CatalogFn[]>([
    ["decoy_read", [{
      ident: "decoy_read(uuid)", name: "decoy_read", returns: "jsonb",
      src: `begin return jsonb_build_object('client_id', p_client, 'real_key', v_x); end`,
    }]],
  ]);
  const emitted = emittedClosure("decoy_read", catalog, 2);
  const opaque = emitted.computedKeyExprs.length > 0 || emitted.rowProjections.length > 0 || emitted.keys.size === 0;
  assert.equal(opaque, false, "the decoy carries no unresolved projection — it must NOT be opaque, or this cell proves nothing");

  // A surface that BRANCHES on a key the decoy never emits — the exact shape
  // classifyPhantomUse calls "branching" (no emitted fallback beside it).
  const seamBodies = [`{ live.phantom_key ? <Guard/> : <Form/> } const real = s(o.real_key);`];
  const { phantom } = diffSeam(emitted.keys, new Set(["real_key", "phantom_key"]));
  assert.deepEqual(phantom, ["phantom_key"], "diffSeam must still find the key the surface reads but the DB never emits");
  assert.equal(
    classifyPhantomUse(seamBodies, "phantom_key", emitted.keys), "branching",
    "Direction 1 must still classify an un-emitted, non-fallback key as a BRANCHING phantom — the census's core catch is unregressed by the scoped adjustment_run_due loss",
  );
});

test("declaredScalarLocals reads the multi-declaration house idiom and refuses what it cannot type", () => {
  const s = declaredScalarLocals(`
declare
  -- v_lie date;   (a comment must not declare anything)
  c record; v_from date; v_n int := 0; v_name text; v_rows jsonb;
  v_amt numeric(12,2); v_at timestamp with time zone; v_rt clara.clients%rowtype;
begin`);
  for (const k of ["v_from", "v_n", "v_name", "v_amt", "v_at"]) {
    assert.ok(s.has(k), `${k} is a scalar and must be recognised`);
  }
  for (const k of ["c", "v_rows", "v_rt", "v_lie"]) {
    assert.ok(!s.has(k), `${k} must NOT be treated as a scalar`);
  }
});

test("unfollowedEnvelopeBinders fails on a mapper the closure cannot reach by its name", () => {
  // The narrowing this bounds: `mapperClosure` walks /to[A-Z]/, so a mapper named
  // anything else is invisible in BOTH directions at once.
  const src = `
    function toRead(raw: unknown) { const o = rec(raw); return (o.rows as unknown[]).map(hydrateRow); }
    function hydrateRow(raw: unknown) { const o = rec(raw); return { id: s(o.secret_key) }; }
    function toRow(raw: unknown) { const o = rec(raw); return { id: s(o.ok_key) }; }`;
  const bodies = extractFunctionBodies(src);
  const root = bodies.get("toRead")!;
  const closure = mapperClosure(root, bodies);
  assert.deepEqual(
    unfollowedEnvelopeBinders(closure.bodies, bodies, new Set(closure.names)),
    ["hydrateRow"],
    "a non-toX mapper referenced by the closure must be reported, not silently skipped",
  );
  // …and a properly named one is NOT reported (the gate must not fire on the convention).
  const ok = extractFunctionBodies(`
    function toRead(raw: unknown) { const o = rec(raw); return (o.rows as unknown[]).map(toRow); }
    function toRow(raw: unknown) { const o = rec(raw); return { id: s(o.ok_key) }; }`);
  const c2 = mapperClosure(ok.get("toRead")!, ok);
  assert.deepEqual(unfollowedEnvelopeBinders(c2.bodies, ok, new Set(c2.names)), []);
});

test("[F-F3] wrapperNamesForRpc finds every wrapper by NAME (not body), and calledFromAnyComponent tells a direct call from a dispatched-by-local one", () => {
  const bodies = extractFunctionBodies(`
    export async function faRegisterTie(token, clientId, asOf) {
      const out = await rpc("fa_register_tie", { p_client: clientId, p_as_of: asOf }, token);
      return toFaRegisterTieRead(out);
    }
    export async function arAging(token, clientId) {
      const out = await rpc("ar_aging", { p_client: clientId }, token);
      return out;
    }`);
  assert.deepEqual(wrapperNamesForRpc("fa_register_tie", bodies), ["faRegisterTie"]);
  assert.deepEqual(wrapperNamesForRpc("no_such_rpc", bodies), []);

  // The dead shape: nothing in the component text even NAMES the wrapper.
  assert.equal(calledFromAnyComponent("faRegisterTie", ["export function Panel() { return <div/>; }"]), false);
  // The direct-call shape.
  assert.equal(calledFromAnyComponent("faRegisterTie", ["const read = await faRegisterTie(t, c, d);"]), true);
  // [the AgingWorkbench shape] dispatched through a LOCAL, never spelled with a
  // following paren — this is why the detector is a bare reference, not `name(`.
  assert.equal(
    calledFromAnyComponent("arAging", ['const fn = domain === "ar" ? arAging : apAging; await fn(t, c);']),
    true,
  );
  // A near-miss identifier must not satisfy a word-boundaried match.
  assert.equal(calledFromAnyComponent("arAging", ["const x = xArAgingSuffix();"]), false);
});

test("[round-8 F1] calledFromAnyComponent requires a CALL SHAPE, not a bare textual mention — a comment, an unused import, and a string literal naming the wrapper must NOT count as wired", () => {
  // (a) a comment mentioning the wrapper by name — prose, not code.
  assert.equal(
    calledFromAnyComponent(
      "faRegisterTie",
      ["// TODO: call faRegisterTie(t, c, d) once the tie strip exists\nexport function Panel() { return <div/>; }"],
    ),
    false,
    "a comment is prose, not code — it must never satisfy the wired check",
  );
  // (b) an unused import — the name is NAMED but never invoked anywhere in the file.
  assert.equal(
    calledFromAnyComponent(
      "faRegisterTie",
      ['import { faRegisterTie } from "../shared/assetsApi";\nexport function Panel() { return <div/>; }'],
    ),
    false,
    "importing a name is not calling it",
  );
  // (c) a string literal naming the wrapper — text inside quotes, not an identifier.
  assert.equal(
    calledFromAnyComponent(
      "faRegisterTie",
      ['export function Panel() { const label = "call faRegisterTie now"; return <div>{label}</div>; }'],
    ),
    false,
    "a string literal mentioning the name is text, not a reference",
  );
  // (d) a dead branch — the name DOES occur in a genuine call shape, just inside code that
  // can never execute. ADJUDICATED TRUE (this round's call, stated rather than silent): the
  // check has only ever proven "referenced in an invocable shape", never "definitely reached
  // at runtime" — telling a dead branch from a live one needs real control-flow analysis,
  // out of scope for a text scan exactly like the render-tracing gap this module already
  // declares it cannot close. Unlike (a)-(c), which manufactured "wired" out of text that
  // never runs AT ALL, a laxer verdict here only shrinks false "dead" results — it cannot
  // manufacture a wired one out of nothing.
  assert.equal(
    calledFromAnyComponent("faRegisterTie", ["export function Panel() { if (false) { faRegisterTie(t, c, d); } return <div/>; }"]),
    true,
    "a genuine call shape still counts even inside unreachable code — reachability is out of scope, stated here rather than silently narrowed",
  );
});

test("scanMapperKeys reads the house envelope idiom, including nested aliases and shape probes", () => {
  const src = `
    export function toX(raw: unknown) {
      const o = rec(raw);
      const fy = rec(o.fy_end);
      return { a: s(o.account_code), m: numOrNull(fy.month), ok: hasArray(raw, "rows"), z: "asset" in o };
    }`;
  const scan = scanMapperKeys(src);
  assert.equal(scan.sawRecIdiom, true);
  for (const k of ["fy_end", "account_code", "month", "rows", "asset"]) {
    assert.ok(scan.keys.has(k), `the mapper reads ${k} and the census must see it`);
  }
});

test("mapperClosure follows mappers passed BY REFERENCE, not only called ones", () => {
  const src = `
    function toRead(raw: unknown) { const o = rec(raw); return (o.assets as unknown[]).map(toRow); }
    function toRow(raw: unknown) { const o = rec(raw); return { id: s(o.disposal_draft_entry_id) }; }`;
  const bodies = extractFunctionBodies(src);
  const closure = mapperClosure(bodies.get("toRead")!, bodies);
  assert.ok(closure.names.includes("toRow"), "`.map(toRow)` is how every row mapper is reached");
  const keys = new Set<string>();
  for (const b of closure.bodies) for (const k of scanMapperKeys(b).keys) keys.add(k);
  assert.ok(keys.has("disposal_draft_entry_id"), "a ROW-level key must reach the census");
});

test("classifyPhantomUse separates a dead branch from a defensive fallback", () => {
  const emitted = new Set(["original_filename", "run_id"]);
  assert.equal(
    classifyPhantomUse([`filename: s(o.original_filename) ?? s(o.filename),`], "filename", emitted),
    "fallback",
  );
  // The defect shape: the sole source of a value, with no emitted alternative.
  assert.equal(
    classifyPhantomUse([`disposal_draft_entry_id: s(o.disposal_draft_entry_id),`], "disposal_draft_entry_id", emitted),
    "branching",
  );
  assert.equal(
    classifyPhantomUse([`{live.disposal_draft_entry_id ? <Guard/> : <Form/>}`], "disposal_draft_entry_id", emitted),
    "branching",
  );
});

// --- the app scan (DB-free) ------------------------------------------------------

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules") continue;
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) out.push(p);
  }
  return out;
}

const SOURCES = new Map(walk(APP_DIR).map((f) => [f.split("\\").join("/"), readFileSync(f, "utf8")]));

function rpcNames(): string[] {
  const names = new Set<string>();
  for (const [, src] of SOURCES) {
    const re = /\brpc\(\s*\n?\s*"([a-z0-9_]+)"/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(src)) !== null) if (m[1]) names.add(m[1]);
  }
  return [...names].sort();
}

const ALL_BODIES = new Map<string, string>();
for (const [, src] of SOURCES) for (const [n, b] of extractFunctionBodies(src)) if (!ALL_BODIES.has(n)) ALL_BODIES.set(n, b);

function wrapperBodies(rpcName: string): string[] {
  const out: string[] = [];
  const probe = new RegExp(`rpc\\(\\s*\\n?\\s*"${rpcName}"`);
  for (const [, src] of SOURCES) for (const [, body] of extractFunctionBodies(src)) if (probe.test(body)) out.push(body);
  return out;
}

test("the dashboard's RPC call sites are all reachable by the census scanner", () => {
  const names = rpcNames();
  assert.ok(names.length > 100, `expected the dashboard to call >100 RPCs, scanned ${names.length} — the scanner regressed`);
  for (const n of names) {
    assert.ok(wrapperBodies(n).length > 0, `no wrapper function body found for rpc("${n}") — the census could not bind it`);
  }
});

test("every declared ledger entry names an RPC the dashboard actually calls", () => {
  const names = new Set(rpcNames());
  for (const key of [
    ...Object.keys(OPAQUE_READS), ...Object.keys(UNMAPPED_READS),
    ...Object.keys(PHANTOM_BRANCHING_ALLOW), ...Object.keys(UNCONSUMED_BASELINE), ...RENDER_DEAD,
  ]) {
    assert.ok(names.has(key), `ledger names "${key}" but no dashboard code calls it — stale entry, delete it`);
  }
});

// --- [round-7 F-F3] DIRECTION 3 (partial): is the read ever asked for at all? ---
//
// DB-free (unlike the rig-backed census below): this needs no live catalog because
// it never asks what a function EMITS, only whether the dashboard's OWN wrapper for
// it is ever CALLED from a component. See dbSeamCensus.ts's section comment above
// `wrapperNamesForRpc` for exactly what a true/false here proves — this is a
// coarser, sound signal than "rendered", not a replacement for it.

const TSX_SOURCES = [...SOURCES].filter(([f]) => f.endsWith(".tsx")).map(([, src]) => src);

test("[F-F3] every READ whose wire wrapper is called from NO `.tsx` component is named, by name, in RENDER_DEAD — a NEW zero-component read must not join it silently", () => {
  const names = rpcNames();
  const deadNow: string[] = [];
  for (const rpcName of names) {
    const wrappers = wrapperNamesForRpc(rpcName, ALL_BODIES);
    assert.ok(wrappers.length > 0, `${rpcName}: no wrapper function found by name — the census's own scanner regressed`);
    // Scoped to READS: a dead ACTION (a write button nothing calls) is a
    // different defect — an unreachable affordance — and belongs to the
    // ordinary review lens, not this seam gate (see the ledger comment).
    const isAction = wrappers.some((w) => /p_op_key/.test(ALL_BODIES.get(w) ?? ""));
    if (isAction) continue;
    if (!wrappers.some((w) => calledFromAnyComponent(w, TSX_SOURCES))) deadNow.push(rpcName);
  }
  assert.deepEqual(
    deadNow.sort(), [...RENDER_DEAD].sort(),
    "RENDER_DEAD no longer matches the reads whose wrapper is called from NO component. A NEW entry is a\n" +
    "read the DB fully ships and the dashboard fully maps that reaches not one screen (round 7 finding 1's own\n" +
    "shape — a promised UI with no door); a REMOVED entry means a surface finally asks for it. Update the\n" +
    "ledger deliberately, never silently.",
  );
});

// --- rig-backed census ------------------------------------------------------------

const RIG = process.env.CLARA_RIG_DB === "1";

/** CLARA_PSQL_BIN, else whatever `psql` PATH resolves to — and nothing else.
 *  NO MACHINE-SPECIFIC BRANCH [merge-gate SF5]: this used to prefer one developer's
 *  absolute Windows install path, which made the rig-backed census silently behave
 *  differently on that machine than anywhere else. CI has psql on PATH; a local Windows
 *  run sets CLARA_PSQL_BIN (or puts psql on PATH) like every other environment. */
function psqlBin(): string {
  return process.env.CLARA_PSQL_BIN || "psql";
}

const US = "\u0001";
const RS = "\u0002";

function loadCatalog(): { catalog: Map<string, CatalogFn[]>; isAction: Map<string, boolean> } {
  const out = execFileSync(
    psqlBin(),
    ["-X", "--no-psqlrc", "-tAF", US, "-v", "ON_ERROR_STOP=1", "-c",
      `select p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')', p.proname,
              pg_get_function_result(p.oid), coalesce(array_to_string(p.proargnames,','),''),
              replace(p.prosrc, E'\\n', '${RS}')
         from pg_proc p where p.pronamespace='clara'::regnamespace and p.prokind='f'`],
    {
      env: {
        ...process.env,
        PGHOST: process.env.PGHOST || "localhost", PGPORT: process.env.PGPORT || "55443",
        PGUSER: process.env.PGUSER || "postgres", PGDATABASE: process.env.PGDATABASE || "clara_ci",
      },
      encoding: "utf8", maxBuffer: 256 * 1024 * 1024,
    },
  ).split("\r\n").join("\n");

  const catalog = new Map<string, CatalogFn[]>();
  const isAction = new Map<string, boolean>();
  for (const line of out.split("\n")) {
    if (!line) continue;
    const [ident, name, returns, argnames, src] = line.split(US);
    if (!ident || !name || !returns) continue;
    if (!catalog.has(name)) catalog.set(name, []);
    catalog.get(name)!.push({ ident, name, returns, src: (src ?? "").split(RS).join("\n") });
    if ((argnames ?? "").split(",").includes("p_op_key")) isAction.set(name, true);
    else if (!isAction.has(name)) isAction.set(name, false);
  }
  return { catalog, isAction };
}

test("[rig] every jsonb key crossing the DB→dashboard seam is accounted for, both directions", () => {
  if (!RIG) return; // self-skip: no migrated rig configured (CLARA_RIG_DB!=1)
  const { catalog, isAction } = loadCatalog();
  assert.ok(catalog.size > 100, "the catalog read came back nearly empty — the probe would pass vacuously");

  const names = rpcNames();
  const unknown = names.filter((n) => !catalog.has(n));
  assert.deepEqual(unknown, [], `the dashboard calls RPCs that do not exist in the shipped catalog: ${unknown.join(", ")}`);

  const reads = names.filter((n) => !isAction.get(n)).sort();
  assert.ok(reads.length > 20, `only ${reads.length} reads classified — the p_op_key discriminator regressed`);

  const measuredOpaque: string[] = [];
  const measuredUnmapped: string[] = [];
  const phantomFailures: string[] = [];
  const staleAllow: string[] = [];
  const unfollowedMappers: string[] = [];
  const unconsumedNow: Record<string, string> = {};

  for (const rpcName of reads) {
    const emitted = emittedClosure(rpcName, catalog, 2);
    const opaque =
      emitted.computedKeyExprs.length > 0 || emitted.rowProjections.length > 0 || emitted.keys.size === 0;

    const consumed = new Set<string>();
    const seamBodies: string[] = [];
    const followed = new Set<string>();
    let boundIdiom = false;
    for (const w of wrapperBodies(rpcName)) {
      const closure = mapperClosure(w, ALL_BODIES);
      seamBodies.push(...closure.bodies);
      for (const n of closure.names) followed.add(n);
      for (const body of closure.bodies) {
        const scan = scanMapperKeys(body);
        for (const k of scan.keys) consumed.add(k);
        boundIdiom ||= scan.sawRecIdiom;
      }
    }
    assert.ok(seamBodies.length > 0, `${rpcName}: no consumer body found — the census would score it empty`);
    // THE CLOSURE HAS NO NAME-SHAPED BLIND SPOT. Collected per read and asserted once
    // below so the failure names every read at once rather than the first.
    for (const n of unfollowedEnvelopeBinders(seamBodies, ALL_BODIES, followed)) {
      unfollowedMappers.push(`${rpcName} → ${n}`);
    }
    if (!boundIdiom) {
      // No mapper at all — a bare `as` cast. Nothing to diff in either direction;
      // it must be DECLARED, and the declared set is re-asserted below.
      measuredUnmapped.push(rpcName);
      continue;
    }
    // Recorded only for MAPPED reads: a read with no mapper belongs to exactly one
    // ledger, so a reader can never wonder which blind spot it is in.
    if (opaque) measuredOpaque.push(rpcName);

    const { phantom, unconsumed } = diffSeam(emitted.keys, consumed);

    // DIRECTION 1 — zero tolerance for a BRANCHING phantom.
    if (!opaque) {
      const allow = PHANTOM_BRANCHING_ALLOW[rpcName] ?? {};
      const branching = phantom.filter((k) => classifyPhantomUse(seamBodies, k, emitted.keys) === "branching");
      for (const k of branching) {
        if (!allow[k]) {
          phantomFailures.push(
            `${rpcName}.${k} — the surface BRANCHES on a key clara.${rpcName} does not emit; it can never be true`,
          );
        }
      }
      for (const k of Object.keys(allow)) {
        if (!branching.includes(k)) staleAllow.push(`${rpcName}.${k}`);
      }
    }

    if (unconsumed.length > 0) unconsumedNow[rpcName] = unconsumed.join(" ");
  }

  assert.deepEqual(
    phantomFailures, [],
    `DIRECTION 1 — a dashboard surface reads a key the SHIPPED DB function never emits:\n  ${phantomFailures.join("\n  ")}`,
  );
  assert.deepEqual(
    staleAllow, [],
    `stale PHANTOM_BRANCHING_ALLOW entries (no longer measured — delete them):\n  ${staleAllow.join("\n  ")}`,
  );
  assert.deepEqual(
    unfollowedMappers, [],
    "the consumer closure walks mappers named /to[A-Z]/. These bodies BIND a raw jsonb\n"
    + "envelope, are named by a closure the census walked, and were NOT followed — so their\n"
    + "consumed keys go unrecorded (every key they read looks unconsumed) AND any phantom they\n"
    + "read goes unseen. Rename the mapper to `toX`, or the census is lying about its coverage:\n"
    + `  ${unfollowedMappers.join("\n  ")}`,
  );
  assert.deepEqual(
    measuredUnmapped.sort(), Object.keys(UNMAPPED_READS).sort(),
    "the UNMAPPED_READS ledger no longer matches the reads that reach a surface through a bare `as` cast — a cast asserts a shape nothing checks, so a new one must be declared, never silently added",
  );
  assert.deepEqual(
    measuredOpaque.sort(), Object.keys(OPAQUE_READS).sort(),
    "the OPAQUE_READS ledger no longer matches the measured blind spot — a read the census cannot prove must be declared, with a reason, never silently joined to it",
  );

  // DIRECTION 2 — the ratchet.
  const drift: string[] = [];
  for (const rpcName of Object.keys(unconsumedNow).sort()) {
    if (UNCONSUMED_BASELINE[rpcName] !== unconsumedNow[rpcName]) {
      drift.push(`  ${JSON.stringify(rpcName)}: ${JSON.stringify(unconsumedNow[rpcName])},`);
    }
  }
  for (const rpcName of Object.keys(UNCONSUMED_BASELINE)) {
    if (!unconsumedNow[rpcName]) drift.push(`  ${JSON.stringify(rpcName)}: DELETE (every key is now consumed),`);
  }
  assert.deepEqual(
    drift, [],
    `DIRECTION 2 — the set of DB-emitted-but-unconsumed keys changed. A NEW key here is a fact the DB\n` +
    `publishes that no surface renders (the WDB-G14 shape). A REMOVED one means a surface caught up.\n` +
    `Either way the ledger must be updated deliberately. Replacement lines:\n${drift.join("\n")}`,
  );
});
