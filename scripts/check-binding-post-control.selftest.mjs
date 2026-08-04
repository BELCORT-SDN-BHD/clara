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
// THE CENSUS-READ EXEMPTION (0042 `$s5_24$`). A `pg_get_functiondef` call whose value
// PROVABLY cannot reach an `execute` is not a patch site and needs no signature binding.
// The four fixtures below pin the exemption from both sides: it fires on the real census
// shape, and it is revoked the moment the value can reach DDL or is not bound at all.
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
  ]);
  if (result.ok) throw new Error("computed execute_rule_post recut passed");
  if (!result.message.includes("target clara.execute_rule_post(uuid,text)")) {
    throw new Error(`wrong failure: ${result.message}`);
  }
});

testCase("genuinely unparseable post-0029 target fails loud", () => {
  const result = checkBindingPostControlSources([
    currentExecutor,
    unresolvedRecut,
  ]);
  if (result.ok) throw new Error("unresolved CoR target passed");
  if (!result.message.includes("unresolved target identity")) {
    throw new Error(`wrong failure: ${result.message}`);
  }
});

testCase("a resolved dynamic recut of another function does not impersonate the executor", () => {
  const result = checkBindingPostControlSources([
    currentExecutor,
    unrelatedLiteralRecut,
  ]);
  if (!result.ok) throw new Error(result.message);
});

testCase("R2: a decoy literal followed by a computed reassignment of the SAME variable is unresolved, never the decoy", () => {
  const result = checkBindingPostControlSources([
    currentExecutor,
    reassignedTargetRecut,
  ]);
  if (result.ok) throw new Error("reassigned (decoy-then-computed) target passed as unrelated");
  if (!result.message.includes("unresolved target identity")) {
    throw new Error(`wrong failure: ${result.message}`);
  }
});

testCase("census exemption (a): a consumer census beside an attributed splice passes, and is PRINTED", () => {
  const result = checkBindingPostControlSources([
    currentExecutor,
    censusReadInPatchingBlock,
  ]);
  if (!result.ok) throw new Error(result.message);
  if ((result.exemptions ?? []).length !== 1) {
    throw new Error(`expected exactly 1 printed exemption, got ${(result.exemptions ?? []).length}`);
  }
  if (!result.exemptions[0].includes("bound to v_n")
    || !result.exemptions[0].includes("non-execute-reaching")) {
    throw new Error(`exemption not audited legibly: ${result.exemptions[0]}`);
  }
  if (!result.message.includes("1 census-read exemption(s) granted")) {
    throw new Error("the OK message does not disclose the exemption");
  }
});

testCase("census exemption (b): an unattributable read whose value IS executed still fails", () => {
  const result = checkBindingPostControlSources([
    currentExecutor,
    unattributedReadThatExecutes,
  ]);
  if (result.ok) throw new Error("an unattributed patch site was exempted");
  if (!result.message.includes("unresolved target identity")) {
    throw new Error(`wrong failure: ${result.message}`);
  }
});

testCase("census exemption (c): census SHAPE whose variable reaches an execute in the same block still fails", () => {
  const result = checkBindingPostControlSources([
    currentExecutor,
    censusShapeThatReachesExecute,
  ]);
  if (result.ok) throw new Error("a value that reaches EXECUTE was exempted as a census read");
  if (!result.message.includes("unresolved target identity")) {
    throw new Error(`wrong failure: ${result.message}`);
  }
});

testCase("census exemption (d): a read with NO named binding (loop/record target) still fails", () => {
  const result = checkBindingPostControlSources([
    currentExecutor,
    unboundReadInLoop,
  ]);
  if (result.ok) throw new Error("an unbound read was exempted");
  if (!result.message.includes("unresolved target identity")) {
    throw new Error(`wrong failure: ${result.message}`);
  }
});

console.log(
  failures === 0
    ? "\nbinding-post-control selftest: OK"
    : `\nbinding-post-control selftest: FAIL — ${failures} case(s)`,
);
process.exit(failures === 0 ? 0 : 1);
