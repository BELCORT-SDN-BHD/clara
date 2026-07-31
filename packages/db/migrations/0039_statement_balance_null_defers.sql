-- ============================================================================
-- 0039 — the statement line-skeleton compare adopts the null-defers-to-chain law
-- (Wave C-b acceptance, 2026-07-31; the runtime half landed as PR #160).
--
-- WHAT THE FIRST REAL ACTIVE MONTH PROVED (probed live): Azure's per-account typed
-- transactions carry NO per-row Balance field at all — a SCHEMA absence, not a failed
-- read of the printed page. `_persist_statement_core` compared the two line skeletons by
-- WHOLE-JSONB equality, so reader-2's null running balances made every real active month
-- refuse `readers_disagree` even when dates, amounts, header and chain all agreed.
--
-- THE LAW (identical to the runtime corroborator's, statement-corroboration.mjs):
--   entry_date and amount_cents are compared STRICTLY, bilaterally, always — they have no
--   independent re-derivation. running_balance_cents disagrees only when BOTH readers
--   carry a number and the numbers differ; a ONE-SIDED null defers that row's balance
--   witness to the CHAIN IDENTITY (WC-R7's own logic — the chain is a reader), which this
--   same core walks over the agreed read a few statements later, and which refuses
--   `chain_broken` for any balance that does not follow from opening + amounts.
--
-- Mechanism: a prosrc SPLICE of the one compare block (the CoR patch idiom; prestate
-- exactly-once probe + postcheck; statically-attributable regprocedure target for the
-- binding-post-control gate).
-- ============================================================================

set role clara_fn_owner;

do $m39$
declare
  v_sig text := 'clara._persist_statement_core(uuid,uuid,uuid,jsonb,text,uuid,uuid,uuid,text,text)';
  v_def text; v_frm text; v_to text; v_cnt int;
begin
  select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.oid = v_sig::regprocedure;
  if v_def is null then
    raise exception '0039 prestate: clara._persist_statement_core is GONE' using errcode='CLR10';
  end if;

  v_frm := $f$    select jsonb_agg(x.elem - 'description' - 'value_date' order by (x.elem->>'line_no')::int)
      into v_skel1 from jsonb_array_elements(v_l1) as x(elem);
    select jsonb_agg(x.elem - 'description' - 'value_date' order by (x.elem->>'line_no')::int)
      into v_skel2 from jsonb_array_elements(v_l2) as x(elem);
    if coalesce(v_skel1,'[]'::jsonb) is distinct from coalesce(v_skel2,'[]'::jsonb) then
      raise exception 'the two readers disagree about the statement line skeleton (% vs % line(s); entry dates, amounts or running balances differ)',
        jsonb_array_length(v_l1), jsonb_array_length(v_l2)
        using errcode='CLR10',detail='{"reason":"readers_disagree"}';
    end if;$f$;

  v_cnt := (length(v_def) - length(replace(v_def, v_frm, ''))) / length(v_frm);
  if v_cnt <> 1 then
    raise exception '0039 prestate: the line-skeleton compare block appears % times (expected exactly once) -- the body drifted; re-derive this splice', v_cnt
      using errcode='CLR10';
  end if;

  v_to := $t$    -- 0039: the null-defers-to-chain law (the runtime corroborator's twin). Dates and
    -- amounts stay strictly bilateral; a running balance disagrees only when BOTH readers
    -- carry a number and the numbers differ -- a one-sided null (a reader whose SOURCE has
    -- no per-row balance slot, the probed Azure per-account schema) defers that row's
    -- balance witness to the chain walk below, which refuses chain_broken for any balance
    -- that does not follow from opening + amounts.
    if jsonb_array_length(coalesce(v_l1,'[]'::jsonb)) <> jsonb_array_length(coalesce(v_l2,'[]'::jsonb)) then
      raise exception 'the two readers disagree about the statement line skeleton (% vs % line(s); entry dates, amounts or running balances differ)',
        jsonb_array_length(v_l1), jsonb_array_length(v_l2)
        using errcode='CLR10',detail='{"reason":"readers_disagree"}';
    end if;
    if exists (
      select 1
        from jsonb_array_elements(coalesce(v_l1,'[]'::jsonb)) with ordinality as sk1(elem, i)
        join jsonb_array_elements(coalesce(v_l2,'[]'::jsonb)) with ordinality as sk2(elem, i) using (i)
       where sk1.elem->>'entry_date'   is distinct from sk2.elem->>'entry_date'
          or sk1.elem->>'amount_cents' is distinct from sk2.elem->>'amount_cents'
          or (jsonb_typeof(sk1.elem->'running_balance_cents') = 'number'
              and jsonb_typeof(sk2.elem->'running_balance_cents') = 'number'
              and sk1.elem->>'running_balance_cents' is distinct from sk2.elem->>'running_balance_cents')) then
      raise exception 'the two readers disagree about the statement line skeleton (% vs % line(s); entry dates, amounts or running balances differ)',
        jsonb_array_length(v_l1), jsonb_array_length(v_l2)
        using errcode='CLR10',detail='{"reason":"readers_disagree"}';
    end if;$t$;

  v_def := replace(v_def, v_frm, v_to);
  execute v_def;

  select pg_get_functiondef(p.oid) into v_def from pg_proc p where p.oid = v_sig::regprocedure;
  if position('null-defers-to-chain' in v_def) = 0
     or position('with ordinality' in v_def) = 0 then
    raise exception '0039 postcheck: the spliced compare did not land' using errcode='CLR10';
  end if;
  if (select p.proowner::regrole::text from pg_proc p where p.oid = v_sig::regprocedure) <> 'clara_fn_owner' then
    raise exception '0039 postcheck: the core changed owner' using errcode='CLR10';
  end if;
end $m39$;

reset role;
