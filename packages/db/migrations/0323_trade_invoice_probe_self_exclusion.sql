-- 0323_trade_invoice_probe_self_exclusion.sql — #1135 (cut-phase fix round, ADV-C1-01 / ADV-C1-03)
--
-- =====================================================================================
-- WHAT THIS FILE IS FOR, IN ONE PARAGRAPH.
--
-- A RECORDING MUST NOT BE ITS OWN LOOK-ALIKE. #1007 (0275) gave the trade-invoice lane a probe
-- that warns before a recording: which invoices this client already holds, from the same party,
-- carrying the same document number or the same total on the same date. `chatTurn_v22` calls that
-- probe BEFORE it calls the admission door. The admission door is idempotent on its intent key, so
-- a retried tool call is meant to answer the SAME invoice again — but the probe runs first, sees
-- the invoice the earlier attempt under THAT SAME KEY already admitted, and asks the person
-- whether to record a duplicate of their own recording.
--
-- MEASURED ON `clara_l01` BEFORE THIS FILE (cut-phase adversarial round, ADV-C1-01), as
-- `clara_runtime`, in one rolled-back transaction: PROBE#1 match_count 0 -> ADMIT#1 admits invoice
-- X -> ADMIT#2 under the SAME intent key answers X with `replayed` true (the door's own
-- idempotency is intact) -> PROBE#2 match_count 1, and the single match IS X.
-- `clara._trade_invoice_duplicate_matches` filters on client, kind, counterparty family, a
-- non-terminal Work status and an unreversed entry, and has no exclusion for the caller's own
-- recording, because until this cut nothing called it twice under one key.
--
-- WHAT THIS FILE CHANGES, AND WHAT IT DELIBERATELY DOES NOT.
--
--   · IT ADDS A SIBLING, NEVER AN EDIT. `clara._trade_invoice_probe_core(uuid,text,jsonb)` and
--     `clara.probe_trade_invoice_duplicates_for(uuid,uuid,text,jsonb)` are BYTE-UNTOUCHED, and
--     §TAIL pins both. `chatTurn_v21` still ships and its parked runs still call the
--     four-argument door; a body a parked run reaches is never recut under it. The new arguments
--     carry NO DEFAULT, so a four-argument call resolves to the old door with no ambiguity — the
--     same widening shape 0321 used one migration earlier for `clara._fact_value_changed`.
--
--   · IT CHANGES NO MATCHING RULE. The two signals, the counterparty family, the terminal-status
--     set and the reversed-entry exclusion are 0275's, reached by delegation rather than
--     restated: the new core CALLS the old one and then narrows what it answers. There is exactly
--     one matcher in this estate and this file does not become a second.
--
--   · IT DOES NOT TOUCH THE ACKNOWLEDGEMENT DOOR, and that is a decision rather than an omission.
--     ADV-C1-03 (a retry minting a SECOND `clara.trade_invoice_duplicate_acks` row whose `shown[]`
--     names the invoice that acknowledgement authorises) is a CONSEQUENCE of the self-match: with
--     the recording's own invoice excluded, a retried identical call is shown the same earlier
--     invoices, hashes the same `ack_digest`, and `on conflict … do nothing` answers the first
--     row. Making the door idempotent on (firm, client, intent_key) ALONE would instead break a
--     ruling the estate already measured and proved — 0275's own fix round (ADV-1007-1) rules
--     that a SECOND acknowledgement under one key for DIFFERENT figures is a second record BY
--     DESIGN, because a browser form keeps one intent key per draft and
--     `clara.get_trade_invoice_duplicate_ack` resolves which one a Work rode by digest.
--     `packages/db/tests/trade-invoice-duplicate-probe.test.mjs`'s `p1007.ack.rode_this_recording`
--     is that cell, and it stays green.
--
--   · IT OPENS NO NEW REACH. One new EXECUTE, to `clara_runtime`, on the five-argument probe twin;
--     the new core is ungranted like the one it delegates to; no human door moves.
--
-- WHY THE KEY AND NOT THE WORK ID. The tool does not know its own work id until the admission
-- answers, and the probe runs first; the intent key is the one identifier the tool holds BEFORE
-- either call, and it is exactly the identifier the admission door is idempotent on. Excluding by
-- key therefore excludes precisely the recording in hand and nothing else: another draft, another
-- turn and another person all carry another key. `clara.accounting_work.intent_key` is where the
-- admission stores it (measured live on `clara_l01`).
--
-- MIGRATION NUMBER. `CUT-PLAN.md` §5 R7: "the overflow block for the cut phase starts at 0323."
-- Lane C2's `0322` is reserved and expected unused; this is the first overflow number and the
-- only migration this fix round writes.
--
-- HARMLESS WITHOUT THE RUNTIME. The old doors keep answering exactly what they answered, so an
-- image deployed before this file behaves as it does today; the five-argument twin is reached
-- only by `chatTurn_v22`. The reverse is NOT true: deploy this file before the image.
-- =====================================================================================

-- =====================================================================================
-- §0 — PRESTATE. Every claim this file makes about what it is editing, measured BEFORE it edits.
-- =====================================================================================
do $r1135_pre$
declare
  v_sha text; v_i int; v_mode text; v_n int;
  -- THE 0275 COHORT THIS FILE EXTENDS, pinned at what is LIVE on `clara_l01` at frontier 0321 —
  -- after #985 (no migration), #1000 (0320) and #1030 (0321), the three tickets before this fix
  -- round in lane C1. Measured on this rig now, never copied from 0275's own header. Nothing in
  -- this list is RECUT: they are pinned because this file delegates to them, and because §TAIL
  -- proves afterwards that it left every one of them alone.
  v_pins text[][] := array[
    ['clara._trade_invoice_probe_core(uuid,text,jsonb)',
     '74215b42802317f0aa8c2dc1dea48488a562bc8ee17f1df53a41c8b2b6a7cf56'],
    ['clara.probe_trade_invoice_duplicates_for(uuid,uuid,text,jsonb)',
     'd94bbbfde7905d5e76c98a1a680a5cb45f56ec5ece9893b3002cadd2847d75f0'],
    ['clara.probe_trade_invoice_duplicates(uuid,text,jsonb)',
     'fd7a0f37e793496db0d3a76fcd393be61e6559b81a5a98fc38795d1afccfcb64'],
    ['clara._trade_invoice_duplicate_matches(uuid,text,uuid,text,date,bigint)',
     '99bf25f4b9cf50389b2e7a51b798db6ea25ef157dec65ca4e5897ae2e5543541'],
    ['clara._trade_invoice_actor_firm(uuid,uuid)',
     '2c863ef26b2ebf7e1ad2ab41759467b7440dbc427035b03409b8078590ad47bd'],
    ['clara._trade_invoice_resolve_party(uuid,text,jsonb)',
     'cf9460134236788238181f5b8921aff0434bf279d41755d0d914451ee7353ed8'],
    ['clara._trade_invoice_reference_key(text)',
     'b3a277f4e40303476c9315175ad879353b90737250eeb25c8b00da0d28faad2b'],
    ['clara.record_trade_invoice_duplicate_ack(uuid,uuid,text,text,jsonb,jsonb)',
     '2144be53c2de62f2096982ed698469b69d78e08f3f661308161e0d755de752b7'],
    ['clara.get_trade_invoice_duplicate_ack(uuid)',
     '1068254d3353ed4266beb555e55d98d7954fe4b06382ef7e787596dbd10be4ba'],
    ['clara.admit_trade_invoice_work(uuid,uuid,text,text,jsonb,jsonb,text,jsonb,text)',
     'c1693503fa0221de53af2e1ddfe716c2baa9c3e3d82c14e02007a04c45d70f5c']
  ];
begin
  -- (0.1) THE PREMISE: 0275's cohort must be here. A forward reference would otherwise resolve at
  -- first CALL rather than at apply, which is the failure mode this estate refuses by name.
  if to_regprocedure('clara._trade_invoice_probe_core(uuid,text,jsonb)') is null
     or to_regprocedure('clara.probe_trade_invoice_duplicates_for(uuid,uuid,text,jsonb)') is null
     or to_regprocedure('clara._trade_invoice_duplicate_matches(uuid,text,uuid,text,date,bigint)') is null then
    raise exception '#1135 prestate: 0275_trade_invoice_duplicate_probe.sql is not applied — apply it first'
      using errcode = 'CLR10';
  end if;

  -- (0.2) THE NEIGHBOURS, UNCONDITIONALLY. Every one must be byte-identical to what this file
  -- measured, on a first apply AND on a redo: this file recuts NONE of them, so unlike a
  -- recutting migration it has no "my own body is already live" branch to tolerate.
  for v_i in 1 .. array_length(v_pins, 1) loop
    if to_regprocedure(v_pins[v_i][1]) is null then
      raise exception '#1135 prestate: pinned neighbour % is ABSENT', v_pins[v_i][1]
        using errcode = 'CLR10';
    end if;
    select encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') into v_sha
      from pg_proc p where p.oid = v_pins[v_i][1]::regprocedure;
    if v_sha <> v_pins[v_i][2] then
      raise exception '#1135 prestate: pinned neighbour % has MOVED (live % expected %)',
        v_pins[v_i][1], v_sha, v_pins[v_i][2] using errcode = 'CLR10';
    end if;
  end loop;

  -- (0.3) PARTIAL BIRTH. On a first apply neither sibling exists; on a redo both do. Anything
  -- between is a half-applied file and says so by name.
  select count(*)::int into v_i from (values
      ('clara._trade_invoice_probe_core(uuid,text,jsonb,text)'),
      ('clara.probe_trade_invoice_duplicates_for(uuid,uuid,text,jsonb,text)')) t(sig)
   where to_regprocedure(t.sig) is not null;
  if v_i = 0 then v_mode := 'FIRST APPLY';
  elsif v_i = 2 then v_mode := 'REDO';
  else
    raise exception '#1135 prestate: partial birth — % of this file''s 2 new functions exist', v_i
      using errcode = 'CLR10';
  end if;

  -- (0.4) THE DATA-DEPENDENT BRANCH, ENTERED RATHER THAN ASSUMED (wave-3 addendum). The narrowing
  -- below only does anything where a trade invoice sits under a Work carrying an intent key, and a
  -- rig that has never recorded one would exercise the empty arm only. A NOTICE, never a refusal:
  -- hosted carries such rows, a freshly seeded rig may not, and neither state is wrong.
  select count(*)::int into v_n from clara.trade_invoices ti
    join clara.accounting_work w on w.id = ti.work_id
   where w.intent_key is not null;
  raise notice '#1135 prestate: clean — mode %, 0275 cohort present, 10 neighbour bodies byte-identical, % recorded trade invoice(s) under a keyed Work on this rig',
    v_mode, v_n;
end
$r1135_pre$;

set role clara_fn_owner;

-- =====================================================================================
-- §A — THE NARROWING CORE. A SIBLING of 0275's shared probe body, never an edit to it.
-- =====================================================================================

-- WHAT IT ADDS TO THE THREE-ARGUMENT CORE, AND NOTHING ELSE: the recording in hand is not one of
-- its own look-alikes. The matching rule is 0275's, reached by CALLING it — this body decides
-- nothing about which invoices resemble which, it only removes the caller's own from the answer
-- and restates `match_count` over what is left.
--
-- A NULL or blank key narrows NOTHING, so a caller that has no key gets exactly the
-- three-argument answer rather than a quietly different one.
create or replace function clara._trade_invoice_probe_core(p_client uuid, p_kind text,
    p_particulars jsonb, p_exclude_intent_key text) returns jsonb
  language plpgsql stable security definer set search_path = clara, pg_temp as $$
declare
  v_probe jsonb; v_key text; v_own uuid[]; v_kept jsonb;
begin
  -- 0275's body, unchanged and undivided: kind, resolved party, the two signals, the matches, and
  -- every refusal it raises on the way (an unresolvable party included) reaches the caller here.
  v_probe := clara._trade_invoice_probe_core(p_client, p_kind, p_particulars);
  v_key := nullif(btrim(coalesce(p_exclude_intent_key, '')), '');
  if v_key is null then return v_probe; end if;

  -- THE CALLER'S OWN RECORDING, BY THE ONE IDENTIFIER IT HOLDS BEFORE THE ADMISSION ANSWERS.
  -- Client-pinned as well as key-pinned: an intent key is minted per task and per tool and is not
  -- a tenancy boundary, so it is never trusted to be one.
  select array_agg(ti.id) into v_own
    from clara.trade_invoices ti
    join clara.accounting_work w on w.id = ti.work_id
   where ti.client_id = p_client and w.client_id = p_client and w.intent_key = v_key;
  if v_own is null or array_length(v_own, 1) is null then return v_probe; end if;

  select coalesce(jsonb_agg(e.m order by e.ord), '[]'::jsonb) into v_kept
    from jsonb_array_elements(coalesce(v_probe->'matches', '[]'::jsonb)) with ordinality as e(m, ord)
   where not ((e.m->>'invoice_id')::uuid = any(v_own));

  return jsonb_set(
    jsonb_set(v_probe, '{matches}', v_kept),
    '{match_count}', to_jsonb(jsonb_array_length(v_kept)));
end $$;
revoke all on function clara._trade_invoice_probe_core(uuid,text,jsonb,text) from public;
comment on function clara._trade_invoice_probe_core(uuid,text,jsonb,text) is
  '#1135 (ADV-C1-01): 0275''s shared probe body, narrowed by ONE rule -- an invoice recorded under '
  'the caller''s OWN intent key is not one of its look-alikes, so a retried recording cannot ask '
  'whether to duplicate itself. It calls the three-argument core rather than restating any part '
  'of the matching rule, and a null or blank key narrows nothing. Ungranted, like the body it '
  'delegates to: the probe doors are where authority is established.';

-- =====================================================================================
-- §B — THE RUNTIME PROBE TWIN THAT CARRIES A KEY. 0275's four-argument door is untouched.
-- =====================================================================================

-- The authority preamble is `clara._trade_invoice_actor_firm(p_client, p_author)`, exactly as the
-- four-argument twin establishes it and exactly as `clara.admit_trade_invoice_work` does — so the
-- probe is still never reachable where the recording it precedes is not.
create or replace function clara.probe_trade_invoice_duplicates_for(p_client uuid, p_author uuid,
    p_kind text, p_particulars jsonb, p_intent_key text) returns jsonb
  language plpgsql stable security definer set search_path = clara, pg_temp as $$
begin
  perform clara._trade_invoice_actor_firm(p_client, p_author);
  return clara._trade_invoice_probe_core(p_client, p_kind, p_particulars, p_intent_key);
end $$;
revoke all on function clara.probe_trade_invoice_duplicates_for(uuid,uuid,text,jsonb,text) from public;
grant execute on function clara.probe_trade_invoice_duplicates_for(uuid,uuid,text,jsonb,text) to clara_runtime;
comment on function clara.probe_trade_invoice_duplicates_for(uuid,uuid,text,jsonb,text) is
  '#1135 (ADV-C1-01): the actor-explicit duplicate probe, carrying the intent key the admission '
  'door is idempotent on, so a recording is never shown as its own look-alike. A SIBLING of the '
  'four-argument twin, which chatTurn_v21''s parked runs still call and which is byte-untouched. '
  'Writes nothing, takes no row lock, refuses no duplicate: it warns.';

reset role;

-- =====================================================================================
-- §TAIL — what must be true AFTER this file, measured rather than asserted by having applied.
-- =====================================================================================
do $r1135_tail$
declare
  v_sha text; v_n int; v_i int; v_key text; v_client uuid;
  v_pins text[][] := array[
    ['clara._trade_invoice_probe_core(uuid,text,jsonb)',
     '74215b42802317f0aa8c2dc1dea48488a562bc8ee17f1df53a41c8b2b6a7cf56'],
    ['clara.probe_trade_invoice_duplicates_for(uuid,uuid,text,jsonb)',
     'd94bbbfde7905d5e76c98a1a680a5cb45f56ec5ece9893b3002cadd2847d75f0'],
    ['clara.probe_trade_invoice_duplicates(uuid,text,jsonb)',
     'fd7a0f37e793496db0d3a76fcd393be61e6559b81a5a98fc38795d1afccfcb64'],
    ['clara._trade_invoice_duplicate_matches(uuid,text,uuid,text,date,bigint)',
     '99bf25f4b9cf50389b2e7a51b798db6ea25ef157dec65ca4e5897ae2e5543541'],
    ['clara.record_trade_invoice_duplicate_ack(uuid,uuid,text,text,jsonb,jsonb)',
     '2144be53c2de62f2096982ed698469b69d78e08f3f661308161e0d755de752b7']
  ];
begin
  -- (T1) NOTHING THIS FILE DELEGATES TO WAS RECUT. The widening is a sibling, and this is the cell
  -- that says so rather than the comment that assumes it. chatTurn_v21's parked runs reach the
  -- four-argument door and the three-argument core; a byte moved in either is a body changed under
  -- a run in flight.
  for v_i in 1 .. array_length(v_pins, 1) loop
    select encode(sha256(convert_to(p.prosrc, 'UTF8')), 'hex') into v_sha
      from pg_proc p where p.oid = v_pins[v_i][1]::regprocedure;
    if v_sha <> v_pins[v_i][2] then
      raise exception '#1135 §TAIL: % was RECUT — it must not be (live % expected %)',
        v_pins[v_i][1], v_sha, v_pins[v_i][2] using errcode = 'CLR10';
    end if;
  end loop;

  -- (T2) BOTH SIBLINGS EXIST, and the four-argument call still resolves — with no default on the
  -- new argument there is exactly one candidate for each arity and never an ambiguity.
  if to_regprocedure('clara._trade_invoice_probe_core(uuid,text,jsonb,text)') is null
     or to_regprocedure('clara.probe_trade_invoice_duplicates_for(uuid,uuid,text,jsonb,text)') is null then
    raise exception '#1135 §TAIL: a sibling is missing' using errcode = 'CLR10';
  end if;
  select count(*)::int into v_n from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'clara' and p.proname = 'probe_trade_invoice_duplicates_for';
  if v_n <> 2 then
    raise exception '#1135 §TAIL: % overloads of probe_trade_invoice_duplicates_for, expected 2', v_n
      using errcode = 'CLR10';
  end if;
  select count(*)::int into v_n from pg_proc p
   where p.oid in ('clara._trade_invoice_probe_core(uuid,text,jsonb,text)'::regprocedure,
                   'clara.probe_trade_invoice_duplicates_for(uuid,uuid,text,jsonb,text)'::regprocedure)
     and p.pronargdefaults > 0;
  if v_n <> 0 then
    raise exception '#1135 §TAIL: a new sibling carries a DEFAULT — a four-argument call would then be ambiguous'
      using errcode = 'CLR10';
  end if;

  -- (T3) THE ACL DELTA, COMPLETE: ONE new EXECUTE, to clara_runtime, on the new door; the new core
  -- is ungranted like the body it delegates to.
  select count(*)::int into v_n from (
    select unnest(coalesce(p.proacl, '{}'::aclitem[])) as a from pg_proc p
     where p.oid = 'clara.probe_trade_invoice_duplicates_for(uuid,uuid,text,jsonb,text)'::regprocedure) t
   where a::text like 'clara_runtime=%';
  if v_n <> 1 then
    raise exception '#1135 §TAIL: the new probe twin does not carry the clara_runtime EXECUTE'
      using errcode = 'CLR10';
  end if;
  select count(*)::int into v_n from (
    select unnest(coalesce(p.proacl, '{}'::aclitem[])) as a from pg_proc p
     where p.oid = 'clara.probe_trade_invoice_duplicates_for(uuid,uuid,text,jsonb,text)'::regprocedure) t
   where a::text not like 'clara_fn_owner=%' and a::text not like 'clara_runtime=%';
  if v_n <> 0 then
    raise exception '#1135 §TAIL: % grant(s) beyond clara_runtime on the new probe twin', v_n
      using errcode = 'CLR10';
  end if;
  select count(*)::int into v_n from (
    select unnest(coalesce(p.proacl, '{}'::aclitem[])) as a from pg_proc p
     where p.oid = 'clara._trade_invoice_probe_core(uuid,text,jsonb,text)'::regprocedure) t
   where a::text not like 'clara_fn_owner=%';
  if v_n <> 0 then
    raise exception '#1135 §TAIL: the narrowing core carries % non-owner grant(s) — it is ungranted by design', v_n
      using errcode = 'CLR10';
  end if;

  -- (T4) THE RULE ITSELF, DRIVEN AGAINST A REAL RECORDING rather than asserted. Where this rig
  -- holds a trade invoice under a keyed, still-postable Work, the probe that carries that key must
  -- not return it while the probe that does not must. Where it holds none, the arm is skipped by
  -- NOTICE: the data-dependent-branch rule cuts both ways and a tail may not invent rows to drive
  -- itself.
  select w.intent_key, ti.client_id into v_key, v_client
    from clara.trade_invoices ti
    join clara.accounting_work w on w.id = ti.work_id
   where w.intent_key is not null
     and w.status not in ('refused','failed','cancelled','expired')
     and nullif(btrim(coalesce(ti.reference,'')),'') is not null
     and not exists (select 1 from clara.trade_invoice_status st
                      join clara.journal_entries je on je.id = st.entry_id
                     where st.invoice_id = ti.id and je.reversed_by is not null)
   order by ti.created_at desc limit 1;
  if v_key is null then
    raise notice '#1135 §TAIL: no recorded trade invoice under a keyed, still-postable Work on this rig — the driven arm is skipped, and T1 to T3 stand alone';
  else
    declare
      v_part jsonb; v_kind text; v_inv uuid; v_with jsonb; v_without jsonb;
    begin
      select ti.id, ti.kind,
             jsonb_build_object('counterparty', jsonb_build_object('id', ti.counterparty_id),
               'reference', ti.reference, 'document_date', to_char(ti.document_date,'YYYY-MM-DD'),
               'total_cents', ti.total_cents)
        into v_inv, v_kind, v_part
        from clara.trade_invoices ti
        join clara.accounting_work w on w.id = ti.work_id
       where w.intent_key = v_key and ti.client_id = v_client
       order by ti.created_at desc limit 1;
      v_without := clara._trade_invoice_probe_core(v_client, v_kind, v_part);
      v_with := clara._trade_invoice_probe_core(v_client, v_kind, v_part, v_key);
      -- THE VACUITY CONTROL FIRST: an unnarrowed probe that did not match the very invoice its own
      -- particulars were copied from would make every assertion below true for the wrong reason.
      if not ((v_without->'matches') @> jsonb_build_array(jsonb_build_object('invoice_id', v_inv))) then
        raise exception '#1135 §TAIL: the unnarrowed core did not match the invoice it was built from — the driven arm proves nothing'
          using errcode = 'CLR10';
      end if;
      if (v_with->'matches') @> jsonb_build_array(jsonb_build_object('invoice_id', v_inv)) then
        raise exception '#1135 §TAIL: the narrowed core still returns the caller''s OWN recording'
          using errcode = 'CLR10';
      end if;
      if (v_with->>'match_count')::int <> jsonb_array_length(v_with->'matches') then
        raise exception '#1135 §TAIL: match_count was not restated over what survived the narrowing'
          using errcode = 'CLR10';
      end if;
      -- …and a key that names no recording narrows NOTHING, so the narrowing cannot be a blanket.
      if clara._trade_invoice_probe_core(v_client, v_kind, v_part, 'a-key-nobody-recorded-under')
         is distinct from v_without then
        raise exception '#1135 §TAIL: an unknown key changed the answer' using errcode = 'CLR10';
      end if;
      if clara._trade_invoice_probe_core(v_client, v_kind, v_part, null) is distinct from v_without
         or clara._trade_invoice_probe_core(v_client, v_kind, v_part, '   ') is distinct from v_without then
        raise exception '#1135 §TAIL: a null or blank key did not answer the three-argument answer'
          using errcode = 'CLR10';
      end if;
      raise notice '#1135 §TAIL: driven — the unnarrowed core returns invoice %, the narrowed one does not', v_inv;
    end;
  end if;

  -- (T5) THIS FILE WRITES NO ROW AT APPLY. It is two read bodies: it acknowledges nothing,
  -- records nothing and moves no Work.
  raise notice '#1135 §TAIL: clean — two siblings born, five delegated bodies byte-identical, one new clara_runtime EXECUTE and nothing else';
end
$r1135_tail$;
