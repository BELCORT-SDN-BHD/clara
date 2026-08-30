// Gate G1 — THE CALL-SITE GATES: every DB call this PR ships, checked against the LIVE catalog,
// plus the pack attempt key that no DB call can check for us.
//
// Split out of g1-wake-gates.test.mjs when 裁-44 R3 widened the corpus past that file s 500-line
// budget. These are the MECHANICAL gates: they read the shipping SOURCE and the shipping CATALOG,
// never a comment and never a copy.

import { test } from "node:test";
import assert from "node:assert/strict";
import * as rig from "./rig.mjs";
import { skip, skip0138 } from "./g1-wake-bodies.fixtures.mjs";

const { register } = await import("tsx/esm/api");
register();

test("G1B-I3 EVERY DB call matches its function's LIVE declared arity AND argument names, in order", { skip: skip0138 }, async () => {
  // THE HIGHEST-VALUE MECHANICAL CHECK IN THIS FILE. Sixteen hand-written parameter lists across
  // two frozen tool sets, every one of them a chance to drop or transpose an argument — and an
  // arity slip is not a crash a reviewer would see: it is a wrong write, or a refusal blamed on
  // the wrong thing. Typecheck cannot see inside a SQL string, and no behavioural cell reaches
  // most of these verbs (they need real books to act on).
  //
  // THE INSTRUMENT IS THE CATALOG, NOT THE MIGRATION SOURCE (review law 3: the migration text is
  // a projection of the function; pg_proc IS the function). A verb whose name resolves to more
  // than one overload fails here too — an ambiguous call is not a checked call.
  //
  // WHAT THIS GATE CAN AND CANNOT SEE, said plainly so it is never mistaken for a shape review.
  // It now covers TWO classes: arity (the outer envelope) and ORDER — the latter only because
  // every call is written in named notation, which is what makes a transposition expressible as a
  // wrong NAME rather than an invisible wrong position.
  //
  // IT STILL CANNOT SEE a wrong jsonb SUB-SHAPE inside a correctly-named argument, which is where
  // every shape defect this PR found actually lived: a uuid array where objects were needed, an
  // object where a non-empty array was needed, a model identity with the wrong two keys. Perfect
  // arity, perfect names, wrong contents. Only a call that reaches the verb catches that class —
  // cell G1B-E2a is that instrument, and it is why it exists.
  const { readFileSync } = await import("node:fs");
  const { fileURLToPath } = await import("node:url");
  const dir = fileURLToPath(new URL("../workflows/", import.meta.url));
  // 裁-44 R2 / FOLD-14(b) — THE INFRA FILES JOIN THE CORPUS. The two _settle_wake_task calls were
  // the only G1 DB calls still written positionally, and their p_outcome/p_error_code pair is
  // adjacent same-typed text drawn from two small closed rosters: a transposition is admitted by
  // the driver and lands as a CHECK violation naming the wrong column, or — on the pair that
  // satisfies both — is written silently the other way round. Sixteen calls became EIGHTEEN.
  // 裁-44 R3 / FOLD-19 — THE CORPUS WAS AN ALLOWLIST, AND AN ALLOWLIST IS AN ABSENCE. Round two
  // set it to five files and called the answer "18 calls"; the closure actually makes TWENTY, and
  // the two it was not looking at were the fifteen-argument `record_agent_usage_event` writes —
  // the most transposition-prone calls in the whole lane, with five adjacent uuids and three
  // adjacent integers. The roster is now DERIVED from the directory (every `.v1*.ts` member of
  // either closure) rather than typed out, so a new closure member joins the gate by existing.
  const { readdirSync: rd } = await import("node:fs");
  const files = rd(dir).filter((f) => /^(bankAgent|closePrep)\.v1.*\.ts$/.test(f)).sort();
  assert.ok(files.length >= 14, `the corpus must be the whole closure, saw ${files.length} files`);

  const calls = [];
  for (const f of files) {
    const src = readFileSync(dir + f, "utf8");
    // The argument span is matched with a BALANCED-PAREN walk rather than [^)]*, which would stop
    // at the first close-paren and silently TRUNCATE a call containing a nested one (a future
    // `coalesce($1,$2)`) — under-counting its placeholders while still satisfying the count pin.
    for (const m of src.matchAll(/select\s+clara\.(\w+)\(/g)) {
      let depth = 1;
      let i = m.index + m[0].length;
      for (; i < src.length && depth > 0; i++) {
        if (src[i] === "(") depth++;
        else if (src[i] === ")") depth--;
      }
      assert.equal(depth, 0, `unbalanced parentheses in a clara.${m[1]} call in ${f}`);
      const span = src.slice(m.index + m[0].length, i - 1);
      const placeholders = new Set([...span.matchAll(/\$(\d+)/g)].map((x) => Number(x[1])));
      const names = [...span.matchAll(/(\w+)\s*=>/g)].map((x) => x[1]);
      calls.push({ file: f, name: m[1], span, max: Math.max(...placeholders), distinct: placeholders.size, names });
    }
  }
  // 4 bank verbs + 12 close wrappers + the 2 settlement calls = 18. Pinned as a COUNT so a future
  // call that silently stops matching the regex (a reformat, a renamed alias) is caught here
  // rather than skipped in silence.
  // 4 bank verbs + 12 close wrappers + 2 settlements + 2 usage writes = 20.
  assert.equal(calls.length, 20, `expected 20 DB calls across the two closures, saw ${calls.length}`);
  assert.equal(
    calls.filter((c) => c.name === "_settle_wake_task").length,
    2,
    "BOTH settlement call sites are in the corpus — one per lane (裁-44 R2 / FOLD-14b)",
  );
  assert.equal(
    calls.filter((c) => c.name === "record_agent_usage_event").length,
    2,
    "and BOTH metering writes — the two the five-file allowlist could not see (裁-44 R3 / FOLD-19)",
  );

  for (const c of calls) {
    const r = await rig.rootQuery(
      `select pg_get_function_identity_arguments(p.oid) as ident, p.pronargs
         from pg_proc p where p.pronamespace='clara'::regnamespace and p.proname=$1`,
      [c.name],
    );
    assert.equal(r.rows.length, 1, `clara.${c.name} (${c.file}) must resolve to EXACTLY one catalog entry, saw ${r.rows.length}`);
    const declared = Number(r.rows[0].pronargs);
    assert.equal(c.max, declared, `clara.${c.name} (${c.file}): highest placeholder $${c.max} but the verb declares ${declared} args — [${r.rows[0].ident}]`);
    assert.equal(c.distinct, declared, `clara.${c.name} (${c.file}): ${c.distinct} distinct placeholders but the verb declares ${declared} — a repeated or skipped $n`);

    // AND NOW THE ORDER GATE, which is what named notation buys and arity alone never could.
    // Every argument must be written `p_name => $n`, and the names must be the catalog's own, IN
    // ORDER. That closes the four transposition cases the database cannot see for itself — the
    // adjacent free-form prose pairs (p_narrative/p_rationale, p_reason/p_rationale,
    // p_label/p_rationale, and the bank rationale/op_key tail) whose swap SUCCEEDS and writes each
    // value into the other's column with no error anywhere.
    const catalogNames = r.rows[0].ident.split(",").map((s) => s.trim().split(/\s+/)[0]);
    assert.equal(
      c.names.length,
      declared,
      `clara.${c.name} (${c.file}): must use NAMED argument notation for every argument (p_x => $n) — saw ${c.names.length} of ${declared}. Positional notation lets two same-typed arguments be silently transposed.`,
    );
    assert.deepEqual(
      c.names,
      catalogNames,
      `clara.${c.name} (${c.file}): argument names must match the catalog IN ORDER.\n  call:    ${c.names.join(", ")}\n  catalog: ${catalogNames.join(", ")}`,
    );
  }
});

test("G1B-I12 裁-44 R3 / FOLD-19 — reconciler-wake.mjs's OWN settlement calls are named too, and checked against the catalog", { skip }, async () => {
  // A LIB FILE, NOT A FROZEN CLOSURE MEMBER — but this PR edits it (FOLD-6 and FOLD-13 both land
  // here), and it makes FOUR positional `_settle_wake_task` calls whose p_outcome/p_error_code
  // pair is the same adjacent same-typed text the closure's two were fixed for. A transposition
  // here settles a task with the outcome and the error code swapped, from the belt whose entire
  // job is repairing tasks nobody else settled.
  const { readFileSync } = await import("node:fs");
  const { fileURLToPath } = await import("node:url");
  const src = readFileSync(fileURLToPath(new URL("../lib/reconciler-wake.mjs", import.meta.url)), "utf8");

  const calls = [...src.matchAll(/select\s+clara\.(\w+)\(([^)]*)\)/g)].map((m) => ({ name: m[1], span: m[2] }));
  const settles = calls.filter((c) => c.name === "_settle_wake_task");
  assert.equal(settles.length, 4, `expected 4 settlement calls in the belt, saw ${settles.length}`);

  const r = await rig.rootQuery(
    `select pg_get_function_identity_arguments(p.oid) as ident, p.pronargs
       from pg_proc p where p.pronamespace='clara'::regnamespace and p.proname='_settle_wake_task'`,
  );
  assert.equal(r.rows.length, 1, "clara._settle_wake_task must resolve to exactly one catalog entry");
  const catalogNames = r.rows[0].ident.split(",").map((s) => s.trim().split(/\s+/)[0]);
  for (const [i, c] of settles.entries()) {
    const names = [...c.span.matchAll(/(\w+)\s*=>/g)].map((x) => x[1]);
    assert.deepEqual(names, catalogNames, `belt settle #${i + 1} must name every argument, in the catalog's own order — saw [${names.join(", ")}]`);
  }

  // AND NO POSITIONAL SURVIVOR. Asserted by ABSENCE of the old shape as well as presence of the
  // new one, because four named calls plus one positional would still pass the loop above if the
  // positional one stopped matching the regex for any reason.
  assert.doesNotMatch(src, /_settle_wake_task\(\$1\s*,/, "no positional settlement call may remain in this belt");

  // THE FIFTH SITE, OUTSIDE THE BELT. reconciler.mjs's cancel branch settles wake/close_prep rows
  // through the same verb (its own comment says the arm exists for Gate G1). It is not part of
  // either frozen closure and this PR does not otherwise touch that file — but a gate that has to
  // be weakened to accommodate one known survivor is not a gate, so it is named and checked here
  // rather than excused. The whole-tree sweep below is what makes that claim total.
  const generic = readFileSync(fileURLToPath(new URL("../lib/reconciler.mjs", import.meta.url)), "utf8");
  // 裁-44 R4 (LOW) — the seventh site goes through the SAME catalog loop as the other four, not a
  // bare name match: a call naming only p_task would have passed the old assertion.
  const genericCalls = [...generic.matchAll(/select\s+clara\.(\w+)\(([^)]*)\)/g)]
    .filter((m) => m[1] === "_settle_wake_task")
    .map((m) => [...m[2].matchAll(/(\w+)\s*=>/g)].map((x) => x[1]));
  assert.equal(genericCalls.length, 1, `expected exactly one G1 settle in reconciler.mjs, saw ${genericCalls.length}`);
  assert.deepEqual(genericCalls[0], catalogNames, "and its FULL argument vector matches the catalog, in order");
  assert.doesNotMatch(generic, /_settle_wake_task\(\$1\s*,/, "with no positional survivor");
});

test("G1B-I11 裁-44 R2 / FOLD-14(a) — the pack attempt key FAILS CLOSED; there is no clock fallback left to collide", { skip }, async () => {
  // THE DEFECT: stepAttemptKey fell back to `Date.now()` when the WDK's step metadata was
  // unavailable. That is not GUARANTEED unique — two attempts inside one millisecond mint ONE
  // key, which is exactly the collision FOLD-8 exists to prevent, now arriving silently instead
  // of loudly. A key this function cannot vouch for is worse than no run at all.
  const bank = await import("../workflows/bankAgent.v1.impl.ts");

  // (1) NO STEP CONTEXT AND NOTHING INJECTED — which is where a direct-drive cell runs, and where
  // the old code quietly minted a clock token. It must throw.
  assert.throws(
    () => bank.stepAttemptKey(),
    /no step context .* and none was injected/,
    "outside a step, with no injected key, the only honest answer is to refuse",
  );

  // (2) AN EXPLICITLY INJECTED KEY is the tests' own door and still works — this is what every
  // direct-drive cell in this battery uses, so the fail-closed branch above cannot be satisfied
  // by simply never calling the function.
  assert.equal(bank.stepAttemptKey("step-xyz#3"), "step-xyz#3");
  assert.throws(() => bank.stepAttemptKey(""), /no step context/, "a blank injected key is not a key");

  // (3) THE ABSENCE OF ANY CLOCK PATH, read off the shipping source rather than inferred from the
  // two behaviours above — a fallback reachable on some third branch would still be a fallback.
  const { readFileSync } = await import("node:fs");
  const { fileURLToPath } = await import("node:url");
  const src = readFileSync(fileURLToPath(new URL("../workflows/bankAgent.v1.impl.ts", import.meta.url)), "utf8");
  const body = src.slice(src.indexOf("export function stepAttemptKey"));
  const fn = body.slice(0, body.indexOf("\n}\n") + 3);
  assert.doesNotMatch(fn, /Date\.now|Math\.random|performance\.now/, "no clock, no randomness — the key is an identity or it is nothing");
  assert.equal((fn.match(/throw new Error/g) ?? []).length, 2, "both unusable-metadata branches throw");
});
