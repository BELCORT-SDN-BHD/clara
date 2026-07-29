-- 0033_autodraft_model_default.sql — ledger #44 (GitHub #42): the first production
-- one-click autodraft run (task 65f293ba-ab00-4136-95da-8ffbd42e14fd, workflow run
-- wrun_01KYP1D0V61F9XS1Y4Z66GX10Z, 2026-07-29) died in its model step with
-- `AI_APICallError: The requested model 'openai/gpt-5-mini' does not exist.` — decoded
-- byte-for-byte off the live workflow.workflow_stream_chunks table (the run/step tables
-- themselves carry NULL error/payload on this deployment; the stream was the only place
-- the real vendor rejection survived).
--
-- THE DEFECT. clara.request_autodraft (the one-click admission entry, never recut since
-- 0011) falls back to the LITERAL 'openai/gpt-5-mini' whenever the
-- `clara.autodraft_model` session GUC is unset:
--   coalesce(nullif(current_setting('clara.autodraft_model',true),''),'openai/gpt-5-mini')
-- No application code anywhere in this repo ever sets that GUC (grepped clean), so this
-- fallback fires on EVERY one-click admission, unconditionally. Confirmed against the
-- failed task directly: clara.agent_tasks.model_snapshot = 'openai/gpt-5-mini',
-- clara.autodraft_attempts.origin = 'one_click'.
--
-- 'openai/gpt-5-mini' is a Vercel-AI-Gateway-shaped "provider/model" id. This runtime has
-- no @ai-sdk/gateway — packages/runtime/workflows/autoDraft.vN.infra.ts's resolveModel()
-- feeds the model_snapshot straight into @ai-sdk/openai's default `openai(modelId)`
-- provider, which expects a BARE OpenAI model id and talks to OpenAI's API directly. The
-- SWEEP admission path (packages/runtime/lib/autodraft.mjs) has never had this problem —
-- it defaults to the bare id 'gpt-5.6-terra' (process.env.CLARA_CHAT_MODEL, same default
-- as .env.example) — which is exactly why sweep-originated autodrafts have always worked
-- while one-click has never once succeeded past its own admission until this run finally
-- got there (every earlier one-click attempt was refused upstream of the model step).
--
-- THE FIX. One literal. request_autodraft's fallback becomes 'gpt-5.6-terra' — the SAME
-- bare-id default the sweep path already uses, so both admission origins agree. Nothing
-- else in this function changes: same guard order, same audit call, same return shape.
-- The corresponding runtime honesty fix (the model step must surface the stream's ACTUAL
-- error instead of ai@7's generic NoOutputGeneratedError fallback, regardless of model id)
-- ships alongside this migration as autoDraft v3->v4 (packages/runtime/workflows/
-- autoDraft.v4.impl.ts's own header carries the full rationale).
--
-- D1 WRITE-QUIESCE (R-round F3, packages/db/README.md:95-113). clara.request_autodraft is
-- a LIVE audited writer — every one-click call reaches admit_autodraft_task and, on a
-- ready lane, INSERTs a real clara.agent_tasks row. This migration replaces its body, so
-- the repo-mandated D1 obligation applies: PostgreSQL runs each in-flight PL/pgSQL
-- execution to completion on the body it STARTED with, so a one-click call that begins
-- BEFORE this migration commits and finishes AFTER would still admit a task carrying the
-- OLD, broken 'openai/gpt-5-mini' snapshot — the exact defect this migration exists to
-- close, re-admitted through the deploy window itself. The deploy ceremony quiesces
-- one-click writes (stop accepting new request_autodraft RPCs, let in-flight ones drain,
-- apply, resume) for the same reason 0031 quiesced admit_autodraft_task/_coding_lane_core
-- — this is an independent window, not covered by any prior migration's quiesce.

set role clara_fn_owner;

create or replace function clara.request_autodraft(p_filing uuid) returns jsonb
  language plpgsql security definer set search_path=clara,pg_temp as $$
declare c record; f record; v_result jsonb;
begin
  c:=clara._human_ctx(clara.role_rank('bookkeeper'));
  if p_filing is null then raise exception 'filing is required' using errcode='CLR10'; end if;
  select * into f from clara.document_filings where id=p_filing and firm_id=c.firm
    and retired_at is null;
  if not found then raise exception 'active filing not found' using errcode='CLR11'; end if;
  v_result:=clara.admit_autodraft_task(p_filing,'one_click',null,
    coalesce(nullif(current_setting('clara.autodraft_model',true),''),'gpt-5.6-terra'),40000);
  perform clara._audit(c.firm,c.actor,null,null,'request_autodraft',null,
    jsonb_build_object('filing',p_filing,'outcome',v_result->>'outcome'));
  return v_result;
end $$;

reset role;

-- ---------------------------------------------------------------------------
-- Migration-tail assertion: the deployed source carries the corrected default and
-- NEVER the broken gateway-shaped id again, byte-provable against pg_proc directly
-- (not just "this migration file looks right" — the DB's own catalog is asked).
-- ---------------------------------------------------------------------------
do $$
declare v_src text;
begin
  select pg_get_functiondef('clara.request_autodraft(uuid)'::regprocedure) into v_src;
  if v_src is null then
    raise exception '0033 tail: clara.request_autodraft(uuid) not found' using errcode='CLR10';
  end if;
  if position('openai/gpt-5-mini' in v_src) > 0 then
    raise exception '0033 tail: the broken gateway-shaped default id is still present in clara.request_autodraft' using errcode='CLR10';
  end if;
  if position('''gpt-5.6-terra''' in v_src) = 0 then
    raise exception '0033 tail: the corrected bare-id default is missing from clara.request_autodraft' using errcode='CLR10';
  end if;
  raise notice '0033 tail: clara.request_autodraft''s one-click default now agrees with the sweep path (gpt-5.6-terra)';
end $$;
