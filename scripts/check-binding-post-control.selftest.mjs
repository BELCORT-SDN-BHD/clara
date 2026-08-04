#!/usr/bin/env node
// In-memory self-test for the persistent vendor-binding post-control checker.
// The computed-target fixture uses the real CoR idiom: a regprocedure signature
// is held in a variable, fed to pg_get_functiondef, rewritten, then executed.

import { checkBindingPostControlSources } from "./check-binding-post-control.mjs";

const currentExecutor = {
  file: "0029_vendor_binding_executor.sql",
  sql: `
create or replace function clara.execute_rule_post(
  p_entry uuid,
  p_op_key text
) returns jsonb language plpgsql as $function$
declare
  b record;
  v_binding_live boolean;
  v_result jsonb;
begin
  v_binding_live:=b.status='live' and b.expires_at>now();
  if not v_binding_live then
    return jsonb_build_object('status','skipped');
  end if;
  v_result:=clara._approve_entry_core(
    '{}'::jsonb,p_entry,null,null,p_op_key);
  return v_result;
end
$function$;
`,
};

const computedExecutorRecut = {
  file: "0030_computed_executor_recut.sql",
  sql: `
do $cor$
declare
  v_sig text := 'clara.execute_rule_post(uuid,text)';
  v_def text;
  v_next text;
begin
  select pg_get_functiondef(v_sig::regprocedure) into v_def;
  v_next:=replace(v_def,'begin','begin perform 1;');
  execute v_next;
end
$cor$;
`,
};

const unresolvedRecut = {
  file: "0030_unresolved_recut.sql",
  sql: `
do $cor$
declare
  v_sig text;
  v_def text;
begin
  v_sig:='clara.'||'some_function(uuid)';
  select pg_get_functiondef(v_sig::regprocedure) into v_def;
  execute v_def;
end
$cor$;
`,
};

const unrelatedLiteralRecut = {
  file: "0030_unrelated_literal_recut.sql",
  sql: `
do $cor$
declare
  v_sig regprocedure :=
    'clara.some_function(uuid)'::regprocedure;
  v_def text;
begin
  select pg_get_functiondef(v_sig) into v_def;
  execute v_def;
end
$cor$;
`,
};

// R-round (R2): a decoy literal assignment to an UNRELATED function, followed
// by a COMPUTED reassignment of the SAME variable, is what a target actually
// aimed at execute_rule_post would look like if it wanted to hide from a
// literal-only scanner. Before the fix, assignedRegprocedureIdentity only
// matched literal-shaped assignments, so it never even SAW the second
// (computed) assignment -- it reported the decoy's identity as "the" target
// and the checker certified it as unrelated. After the fix, the LATEST
// assignment in program order decides the outcome regardless of shape; since
// that latest assignment here is computed, the target is unresolved and must
// fail loud, exactly like the genuinely-unparseable case above.
const reassignedTargetRecut = {
  file: "0030_reassigned_target_recut.sql",
  sql: `
do $cor$
declare
  v_sig regprocedure := 'clara.some_harmless_function(uuid)'::regprocedure;
  v_def text;
begin
  v_sig := clara._compute_real_target();
  select pg_get_functiondef(v_sig) into v_def;
  execute v_def;
end
$cor$;
`,
};

// ---------------------------------------------------------------------------
// THE CENSUS-READ EXEMPTION (0042 `$s5_24$`). A `pg_get_functiondef` call is exempt ONLY
// when its enclosing statement matches the census GRAMMAR exactly — `select count(*) …
// into <one scalar> … where <predicate carrying the call>` — and the bound name goes
// nowhere near an `execute`. The fixtures below pin the exemption from both sides: it
// fires on the real census shape, and it is refused for every other shape, including the
// five evasions a cross-model merge gate landed on the earlier value-flow analysis.
// ---------------------------------------------------------------------------

// (a) THE REAL SHAPE — one attributed splice (read → rewrite → execute) PLUS a consumer
// census in the SAME block. The splice must still be bound; the census must be exempt.
// The comment before the census deliberately carries an APOSTROPHE and the word `execute`:
// `maskComments` skips dollar-quoted regions, so a `do` block arrives at the analysis with
// its comments RAW, and an unmasked apostrophe opens a phantom literal that swallows the
// census statement. This fixture fails loudly if the block is ever analysed unmasked.
const censusReadInPatchingBlock = {
  file: "0031_census_read.sql",
  sql: `
do $cor$
declare
  v_sig text := 'clara.some_function(uuid)';
  v_def text; v_n int;
begin
  select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.oid = v_sig::regprocedure;
  v_def := replace(v_def, 'current_date', 'clara._book_today()');
  execute v_def;
  -- ITS ONE CONSUMER STILL REACHES IT. pg_get_functiondef's own header line would
  -- self-match, so the census excludes the target itself before it can execute anything.
  select count(*)::int into v_n from pg_proc p
    where p.pronamespace = 'clara'::regnamespace
      and p.proname <> 'some_function'
      and (coalesce(p.prosrc, '') || coalesce(pg_get_functiondef(p.oid), '')) like '%clara.some_function(%';
  if v_n <> 1 then
    raise exception 'consumer census: % callers', v_n;
  end if;
end
$cor$;
`,
};

// (b) An unattributable read bound into a variable that IS executed — the patch site the
// gate exists for. The census analysis must not touch it.
const unattributedReadThatExecutes = {
  file: "0031_unattributed_execute.sql",
  sql: `
do $cor$
declare
  v_def text;
begin
  select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.proname = 'mystery';
  execute v_def;
end
$cor$;
`,
};

// (c) MIXED, AND THE EXEMPTION IS PER VALUE FLOW. The second read is written in census
// shape — an aggregate over the whole clara namespace — but its variable is fed to
// `execute` later in the SAME block. One flow into DDL revokes it; the block still fails.
const censusShapeThatReachesExecute = {
  file: "0031_census_shape_executes.sql",
  sql: `
do $cor$
declare
  v_sig text := 'clara.some_function(uuid)';
  v_def text; v_probe text;
begin
  select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.oid = v_sig::regprocedure;
  select string_agg(coalesce(pg_get_functiondef(p.oid), ''), ';') into v_probe from pg_proc p
    where p.pronamespace = 'clara'::regnamespace;
  execute v_probe;
end
$cor$;
`,
};

// (d) NO BINDING AT ALL — a loop over a query has no named target this analysis can prove
// anything about, so it is an unattributed patch site, not a census read.
const unboundReadInLoop = {
  file: "0031_unbound_loop.sql",
  sql: `
do $cor$
declare
  v_def text;
begin
  for v_def in select pg_get_functiondef(p.oid) from pg_proc p
    where p.pronamespace = 'clara'::regnamespace loop
    execute v_def;
  end loop;
end
$cor$;
`,
};

// ---------------------------------------------------------------------------
// THE FIVE EVASION PROBES [merge-gate MB1, 2026-08-04], reproduced VERBATIM from the
// gate's own fixtures. Every one of them was granted an exemption by the value-flow
// analysis this grammar replaced; every one of them must now FAIL CLOSED. They are kept
// as fixtures rather than prose because the next rewrite of this analysis has to pass
// them too.
// ---------------------------------------------------------------------------

// (1) `=` instead of `:=` — a perfectly legal plpgsql assignment the binding closure did
// not recognise, so `v_def` never appeared to reach the `execute`.
const evasionEqualsAlias = {
  file: "0031_evasion_equals_alias.sql",
  sql: `
do $cor$
declare v_def text; v_cmd text;
begin
  select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.oid = clara._choose_target_oid();
  v_cmd = replace(v_def, 'safe', 'malicious');
  execute v_cmd;
end
$cor$;
`,
};

// (2) a SUBSCRIPTED target — same idea, one array element away from being seen.
const evasionArrayAlias = {
  file: "0031_evasion_array_alias.sql",
  sql: `
do $cor$
declare v_def text; v_cmd text[];
begin
  select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.oid = clara._choose_target_oid();
  v_cmd[1] := replace(v_def, 'safe', 'malicious');
  execute v_cmd[1];
end
$cor$;
`,
};

// (3) EXECUTE … INTO — the `into` made the whole statement look like a BINDING, so the
// analysis treated the DDL execution itself as the safe consumer.
const evasionExecuteInto = {
  file: "0031_evasion_execute_into.sql",
  sql: `
do $cor$
declare v_dummy text;
begin
  execute format('select pg_temp.run_ddl(%L)', replace(pg_get_functiondef(clara._choose_target_oid()), 'safe', 'malicious')) into v_dummy;
end
$cor$;
`,
};

// (4) EXECUTE … USING — `readExecuteExpr` stops at `using`, so the value actually handed
// to the dynamic statement was in no execute expression at all. The grammar's belt (f)
// uses whole STATEMENTS that mention `execute`, which is what closes this one.
const evasionExecuteUsing = {
  file: "0031_evasion_execute_using.sql",
  sql: `
do $cor$
declare v_def text; v_dummy text;
begin
  select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.oid = clara._choose_target_oid();
  execute 'select pg_temp.run_ddl($1)' into v_dummy using v_def;
end
$cor$;
`,
};

// (5) a PHANTOM binding — the text `into v_safe` inside a string literal, which the old
// `into`-anywhere regex read as a real binding to a name nothing executes.
const evasionFakeBindingLiteral = {
  file: "0031_evasion_fake_binding_literal.sql",
  sql: `
do $cor$
begin
  perform pg_temp.run_ddl(replace(pg_get_functiondef(clara._choose_target_oid()), 'safe', 'malicious')), 'into v_safe';
  execute 'select 1';
end
$cor$;
`,
};

// THE POSITIVE SHAPE, copied from 0042's `$s5_24$` (the block the allowlist names): a real
// splice — read, prestate-check, rewrite, execute — followed by the consumer census whose
// predicate carries the second `pg_get_functiondef`. The splice stays ATTRIBUTED (through
// `p.oid = v_sig::regprocedure`); only the census is exempt, and it is bound to `v_n`.
const s5_24Shape = {
  file: "0042_wave_d_b0_shared_authorities.sql",
  sql: `
do $s5_24$
declare
  v_sig text := 'clara._document_retention_date(uuid)';
  v_def text; v_frm text; v_cnt int; v_n int;
begin
  select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.oid = v_sig::regprocedure;
  v_frm := $f$date_trunc('year', current_date)$f$;
  v_cnt := (length(v_def) - length(replace(v_def, v_frm, ''))) / length(v_frm);
  if v_cnt <> 1 then
    raise exception '0042 S5.24 prestate: the year-truncation appears % time(s)', v_cnt using errcode = 'CLR10';
  end if;
  v_def := replace(v_def, v_frm, $t$date_trunc('year', clara._book_today())$t$);
  execute v_def;
  -- ITS ONE CONSUMER STILL REACHES IT. pg_get_functiondef's own header line would
  -- self-match, so the census excludes the target itself before it can execute anything.
  select count(*)::int into v_n from pg_proc p
    where p.pronamespace = 'clara'::regnamespace
      and p.proname <> '_document_retention_date'
      and (coalesce(p.prosrc, '') || coalesce(pg_get_functiondef(p.oid), '')) like '%clara._document_retention_date(%';
  if v_n <> 1 then
    raise exception '0042 S5.24 postcheck: called from % body/bodies', v_n using errcode = 'CLR10';
  end if;
end $s5_24$;
`,
};

// A SECOND census, in a different migration and a different block — perfectly lawful under
// the grammar, and therefore exactly what the tree-wide allowlist exists to catch.
const secondCensusElsewhere = {
  file: "0043_second_census.sql",
  sql: `
do $cor$
declare v_sig text := 'clara.some_function(uuid)';
  v_def text; v_m int;
begin
  select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.oid = v_sig::regprocedure;
  execute v_def;
  select count(*)::int into v_m from pg_proc p
    where p.pronamespace = 'clara'::regnamespace
      and (coalesce(p.prosrc, '') || coalesce(pg_get_functiondef(p.oid), '')) like '%clara.some_other(%';
  if v_m <> 1 then
    raise exception 'census: % callers', v_m;
  end if;
end
$cor$;
`,
};

const NO_EXEMPTIONS = [];
const CENSUS_FIXTURE_ALLOWLIST = [
  { migration: "0031_census_read", block: "$cor$", variable: "v_n" },
];
const S5_24_ALLOWLIST = [
  { migration: "0042_wave_d_b0_shared_authorities", block: "$s5_24$", variable: "v_n" },
];

let failures = 0;
function testCase(name, fn) {
  try {
    fn();
    console.log("  PASS  " + name);
  } catch (err) {
    failures += 1;
    console.error("  FAIL  " + name);
    console.error("        " + String(err.message));
  }
}

testCase("literal-valued variable target resolves to execute_rule_post and is rejected", () => {
  const result = checkBindingPostControlSources([
    currentExecutor,
    computedExecutorRecut,
  ], { allowlist: NO_EXEMPTIONS });
  if (result.ok) throw new Error("computed execute_rule_post recut passed");
  if (!result.message.includes("target clara.execute_rule_post(uuid,text)")) {
    throw new Error(`wrong failure: ${result.message}`);
  }
});

testCase("genuinely unparseable post-0029 target fails loud", () => {
  const result = checkBindingPostControlSources([
    currentExecutor,
    unresolvedRecut,
  ], { allowlist: NO_EXEMPTIONS });
  if (result.ok) throw new Error("unresolved CoR target passed");
  if (!result.message.includes("unresolved target identity")) {
    throw new Error(`wrong failure: ${result.message}`);
  }
});

testCase("a resolved dynamic recut of another function does not impersonate the executor", () => {
  const result = checkBindingPostControlSources([
    currentExecutor,
    unrelatedLiteralRecut,
  ], { allowlist: NO_EXEMPTIONS });
  if (!result.ok) throw new Error(result.message);
});

testCase("R2: a decoy literal followed by a computed reassignment of the SAME variable is unresolved, never the decoy", () => {
  const result = checkBindingPostControlSources([
    currentExecutor,
    reassignedTargetRecut,
  ], { allowlist: NO_EXEMPTIONS });
  if (result.ok) throw new Error("reassigned (decoy-then-computed) target passed as unrelated");
  if (!result.message.includes("unresolved target identity")) {
    throw new Error(`wrong failure: ${result.message}`);
  }
});

testCase("census exemption (a): a consumer census beside an attributed splice passes, and is PRINTED", () => {
  const result = checkBindingPostControlSources([
    currentExecutor,
    censusReadInPatchingBlock,
  ], { allowlist: CENSUS_FIXTURE_ALLOWLIST });
  if (!result.ok) throw new Error(result.message);
  if ((result.exemptions ?? []).length !== 1) {
    throw new Error(`expected exactly 1 printed exemption, got ${(result.exemptions ?? []).length}`);
  }
  if (!result.exemptions[0].text.includes("bound to v_n")
    || !result.exemptions[0].text.includes("census grammar")) {
    throw new Error(`exemption not audited legibly: ${result.exemptions[0].text}`);
  }
  if (!result.message.includes("1 census-read exemption(s) granted")) {
    throw new Error("the OK message does not disclose the exemption");
  }
});

testCase("census exemption (b): an unattributable read whose value IS executed still fails", () => {
  const result = checkBindingPostControlSources([
    currentExecutor,
    unattributedReadThatExecutes,
  ], { allowlist: NO_EXEMPTIONS });
  if (result.ok) throw new Error("an unattributed patch site was exempted");
  if (!result.message.includes("unresolved target identity")) {
    throw new Error(`wrong failure: ${result.message}`);
  }
});

testCase("census exemption (c): census SHAPE whose variable reaches an execute in the same block still fails", () => {
  const result = checkBindingPostControlSources([
    currentExecutor,
    censusShapeThatReachesExecute,
  ], { allowlist: NO_EXEMPTIONS });
  if (result.ok) throw new Error("a value that reaches EXECUTE was exempted as a census read");
  if (!result.message.includes("unresolved target identity")) {
    throw new Error(`wrong failure: ${result.message}`);
  }
});

testCase("census exemption (d): a read with NO named binding (loop/record target) still fails", () => {
  const result = checkBindingPostControlSources([
    currentExecutor,
    unboundReadInLoop,
  ], { allowlist: NO_EXEMPTIONS });
  if (result.ok) throw new Error("an unbound read was exempted");
  if (!result.message.includes("unresolved target identity")) {
    throw new Error(`wrong failure: ${result.message}`);
  }
});

// --- MB1: the five evasion probes, each of which the value-flow analysis exempted --------

for (const [probe, fixture] of [
  ["(1) `v_cmd = replace(v_def,…)` then `execute v_cmd` — an `=` assignment alias", evasionEqualsAlias],
  ["(2) `v_cmd[1] := …` then `execute v_cmd[1]` — a subscripted alias", evasionArrayAlias],
  ["(3) `execute format(…pg_get_functiondef…) into v_dummy` — EXECUTE read as a binding", evasionExecuteInto],
  ["(4) `execute '…$1…' into v_dummy using v_def` — the value arrives via USING", evasionExecuteUsing],
  ["(5) a string literal containing `into v_safe` — a phantom binding", evasionFakeBindingLiteral],
]) {
  testCase(`MB1 evasion probe ${probe} FAILS CLOSED`, () => {
    const result = checkBindingPostControlSources([currentExecutor, fixture], {
      allowlist: NO_EXEMPTIONS,
    });
    if (result.ok) {
      throw new Error(
        `the probe was CERTIFIED — exemptions: ${JSON.stringify((result.exemptions ?? []).map((e) => e.text))}`,
      );
    }
    if (!result.message.includes("unresolved target identity")) {
      throw new Error(`wrong failure: ${result.message}`);
    }
    if ((result.exemptions ?? []).length !== 0) {
      throw new Error(`the probe was granted ${(result.exemptions ?? []).length} exemption(s)`);
    }
  });
}

testCase("MB1 positive: the real 0042 `$s5_24$` shape is exempt — census only, splice still attributed", () => {
  const result = checkBindingPostControlSources([currentExecutor, s5_24Shape], {
    allowlist: S5_24_ALLOWLIST,
  });
  if (!result.ok) throw new Error(result.message);
  if ((result.exemptions ?? []).length !== 1) {
    throw new Error(`expected exactly 1 exemption (the census), got ${(result.exemptions ?? []).length}`);
  }
  const [e] = result.exemptions;
  if (e.block !== "$s5_24$" || e.variable !== "v_n") {
    throw new Error(`wrong exemption: ${JSON.stringify(e)}`);
  }
});

// --- MB2: the tree-wide exemption set must EQUAL the allowlist ---------------------------

testCase("MB2: a SECOND census elsewhere in the tree fails the gate and is named", () => {
  const result = checkBindingPostControlSources(
    [currentExecutor, s5_24Shape, secondCensusElsewhere],
    { allowlist: S5_24_ALLOWLIST },
  );
  if (result.ok) throw new Error("an un-allowlisted census exemption was certified");
  if (!result.message.includes("does not match the allowlist")) {
    throw new Error(`wrong failure: ${result.message}`);
  }
  if (!result.message.includes("0043_second_census.sql")
    || !result.message.includes("bound to v_m")) {
    throw new Error(`the unexpected exemption is not NAMED: ${result.message}`);
  }
});

testCase("MB2: an allowlist entry whose census is GONE fails too — the match is exact both ways", () => {
  const result = checkBindingPostControlSources([currentExecutor, unrelatedLiteralRecut], {
    allowlist: S5_24_ALLOWLIST,
  });
  if (result.ok) throw new Error("a stale allowlist entry was tolerated");
  if (!result.message.includes("ALLOWLISTED but NOT GRANTED")) {
    throw new Error(`wrong failure: ${result.message}`);
  }
});

console.log(
  failures === 0
    ? "\nbinding-post-control selftest: OK"
    : `\nbinding-post-control selftest: FAIL — ${failures} case(s)`,
);
process.exit(failures === 0 ? 0 : 1);
