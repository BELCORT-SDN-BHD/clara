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

console.log(
  failures === 0
    ? "\nbinding-post-control selftest: OK"
    : `\nbinding-post-control selftest: FAIL — ${failures} case(s)`,
);
process.exit(failures === 0 ? 0 : 1);
