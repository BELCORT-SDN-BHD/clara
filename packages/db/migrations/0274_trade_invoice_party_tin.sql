-- 0274_trade_invoice_party_tin — #982 (lane 02, riders wave 3): A TRADE-INVOICE COUNTERPARTY IS
-- RESOLVED BY ITS TIN, AT THE SAME TIER AS ITS NORMALISED REGISTRATION NUMBER.
-- =====================================================================================
-- Spec of record: issue #982's Agent Brief and the owner's ruling comment of 2026-09-20 on the
-- same issue. Domain words: CONTEXT.md — "Counterparty identity", and this file's new one,
-- "Identifier conflict".
--
-- THE RULING, IN ONE SENTENCE. "TIN becomes a real resolution key for a trade-invoice
-- counterparty, at the same tier as the normalised registration number, and when a TIN and a
-- registration number point at two different live counterparties Clara stops and lets the person
-- choose." The reason was checked before the mechanism: LHDN MyInvois requires the buyer TIN and
-- BRN and validates both from 2026-08-01, so a document whose clearest printed identifier is a
-- TIN is an ordinary case, not an edge one.
--
-- WHAT WAS TRUE BEFORE THIS FILE, measured rather than asserted (see the prestate). 0225's
-- `clara._trade_invoice_resolve_party` resolves by counterparty id, then by normalised
-- registration number, then by normalised name or live alias. `tin` is parsed, counts toward the
-- door's "at least one identifier is present" check and is echoed back in the refusal, but it is
-- never a match key — 0225's own header says so and files the question as a follow-up. So a
-- payload whose only identifier is a TIN left as `party_unresolved` even when exactly one live
-- counterparty of that client held it.
--
-- THIS FILE RECUTS EXACTLY ONE BODY and creates one index. No table, column, trigger, policy or
-- grant moves; no other function is created or recut. The recut keeps the body's owner
-- (`clara_fn_owner`), `security definer`, `set search_path = clara, pg_temp`, `stable` volatility
-- and its owner-only ACL — 0225's tail asserts this body is ungranted to every application role
-- and that assertion still holds after this file (re-asserted in the tail below).
--
-- WHY THE TIN IS NORMALISED THE WAY THE REGISTRATION NUMBER IS. The estate has exactly ONE
-- identifier normalisation — `lower(regexp_replace(v, '[^a-zA-Z0-9]', '', 'g'))` — and it is
-- byte-identical in `clara.create_counterparty` (0021:99-101), in
-- `clara.set_counterparty_identifiers` (0215:965-967, whose own comment records the requirement)
-- and in the resolver's registration arm. A TIN is printed with spaces and dashes exactly as a
-- registration number is, and the ruling puts it at the same TIER, so it is read through the same
-- normalisation. The asymmetry this leaves is named honestly rather than hidden: there is no
-- `tin_normalized` COLUMN (only `clara.counterparties.tin`, stored `btrim`ed), so this arm
-- normalises both sides at read time and the index below is the expression index that makes that
-- an index scan rather than a sweep of every firm's parties. 0215's cross-client identity WATCH
-- (0215:1157-1164) compares `o.tin = cp.tin` raw and is NOT changed by this file: it answers a
-- different question (is this identifier visible on another client's books) and moving it would
-- change what that watch reports.
--
-- SCOPE, VERBATIM FROM THE TICKET. Out of scope: what counts as a valid TIN format (nothing here
-- validates one); cross-client TIN lookups (every arm stays inside one client's counterparties);
-- any other admission door's party resolution; and the registration arm's behaviour when several
-- live counterparties share one normalised registration number — which
-- `uq_counterparties_client_registration` makes unreachable anyway and the prestate pins.
--
-- REDO-SAFE (#957). The one function statement is `create or replace function`, the index is
-- `create index if not exists`, and the prestate accepts EITHER the pinned pre-image OR a body
-- already carrying this file's `#982` marker (a `CLARA_MIGRATION_REDO=0274_trade_invoice_party_tin`
-- re-run over this file's own effects).
-- =====================================================================================

do $t982_pre$
declare
  v_sig text := 'clara._trade_invoice_resolve_party(uuid,text,jsonb)';
  v_src text;
  v_sha text;
  v_n int;
begin
  -- 0.1 · THE LANE THIS FILE STANDS ON. 0225 must be applied: this file recuts one of its bodies
  -- and the door that calls it must be the one 0225 shipped.
  if to_regprocedure(v_sig) is null then
    raise exception '#982 prestate: % is absent -- migration 0225 must be applied first', v_sig
      using errcode='CLR10';
  end if;
  select count(*)::int into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'clara' and p.proname = '_trade_invoice_resolve_party';
  if v_n <> 1 then
    raise exception '#982 prestate: clara._trade_invoice_resolve_party has % bodies (expected exactly 1)', v_n
      using errcode='CLR10';
  end if;

  -- 0.2 · THE PRE-IMAGE PIN ON THE ONE BODY THIS FILE RECUTS, measured on this rig now. The
  -- marker branch is the supported #957 redo (see the header); it is NOT a drift exemption.
  select p.prosrc into v_src from pg_proc p where p.oid = v_sig::regprocedure;
  v_sha := encode(sha256(convert_to(v_src,'UTF8')),'hex');
  if v_sha is distinct from '4967217e8d413f3f58d935aea966764a91c42afc2c15342e8bfcfe2a23a7a0a8' then
    if position('#982' in v_src) > 0 then
      raise notice '#982 prestate: clara._trade_invoice_resolve_party already carries this file''s marker -- this is a REDO (#957) over this file''s own effects, which create-or-replace makes safe.';
    else
      raise exception '#982 prestate: % has DRIFTED from its pinned pre-image (measured %, expected 4967217e8d413f3f58d935aea966764a91c42afc2c15342e8bfcfe2a23a7a0a8) and does not carry this file''s marker -- re-derive this file against the LIVE body before applying',
        v_sig, v_sha using errcode='CLR10';
    end if;
  end if;

  -- 0.3 · THE BODY'S POSTURE, which the recut must carry over unchanged: owned by
  -- clara_fn_owner, SECURITY DEFINER, search_path-pinned, `stable`, and granted to NOBODY.
  select count(*)::int into v_n from pg_proc p
   where p.oid = v_sig::regprocedure and p.proowner = 'clara_fn_owner'::regrole
     and p.prosecdef and p.provolatile = 's'
     and p.proconfig @> array['search_path=clara, pg_temp'];
  if v_n <> 1 then
    raise exception '#982 prestate: %''s posture is not the 0225 shape (owner / security definer / search_path / stable)', v_sig
      using errcode='CLR10';
  end if;
  if has_function_privilege('clara_authenticated', v_sig, 'EXECUTE')
     or has_function_privilege('clara_runtime', v_sig, 'EXECUTE')
     or has_function_privilege('clara_agent_ro', v_sig, 'EXECUTE') then
    raise exception '#982 prestate: % is granted to an application role -- 0225 shipped it ungranted', v_sig
      using errcode='CLR10';
  end if;

  -- 0.4 · THE FOUR NEIGHBOURS THIS FILE RELIES ON AND MUST NOT TOUCH, pinned by sha256(prosrc):
  --   · the ONE caller (it calls the resolver twice, step 5 and step 7 under the rung);
  --   · the canonicalisation the id arm reads;
  --   · the two identifier WRITERS whose normalisation this file mirrors byte for byte.
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha from pg_proc p
   where p.oid = 'clara.admit_trade_invoice_work(uuid,uuid,text,text,jsonb,jsonb,text,jsonb,text)'::regprocedure;
  if v_sha is distinct from 'c1693503fa0221de53af2e1ddfe716c2baa9c3e3d82c14e02007a04c45d70f5c' then
    raise exception '#982 prestate: clara.admit_trade_invoice_work has DRIFTED (measured %) -- it is the only caller of the body this file recuts and this file must not touch it', v_sha
      using errcode='CLR10';
  end if;
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha from pg_proc p
   where p.oid = 'clara._canonical_counterparty(uuid,uuid)'::regprocedure;
  if v_sha is distinct from 'bbbe4a5e9ba57da93f162c74777b5c780a98b64445054291426593b47b3852b4' then
    raise exception '#982 prestate: clara._canonical_counterparty has DRIFTED (measured %) -- the id arm this file carries over verbatim reads it', v_sha
      using errcode='CLR10';
  end if;
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha from pg_proc p
   where p.oid = 'clara.create_counterparty(uuid,text,text,text,text,text)'::regprocedure;
  if v_sha is distinct from '797f4675e1a4cab726be138ce3932940e4ec17e6c46cfabce5f6feadaff2dc5d' then
    raise exception '#982 prestate: clara.create_counterparty has DRIFTED (measured %) -- this file mirrors its identifier normalisation and cannot vouch for a body it does not recognise', v_sha
      using errcode='CLR10';
  end if;
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha from pg_proc p
   where p.oid = 'clara.set_counterparty_identifiers(uuid,uuid,text,text,text)'::regprocedure;
  if v_sha is distinct from '451a03bf2d4b43adea4a3ececb321b5cb2f0a912a6c8e67a779f1b29b441c51f' then
    raise exception '#982 prestate: clara.set_counterparty_identifiers has DRIFTED (measured %) -- it is the other writer of clara.counterparties.tin and the second copy of the normalisation this file mirrors', v_sha
      using errcode='CLR10';
  end if;

  -- 0.5 · THE STRUCTURAL PREMISES. `tin` is a column of clara.counterparties, and the registration
  -- arm can match AT MOST ONE live row because the estate holds a partial unique on
  -- (client_id, kind, registration_normalized). #982's "several live parties share one normalised
  -- registration number" carve-out is unreachable while that index stands, and this file's
  -- conflict arm is written on that premise.
  if not exists (select 1 from information_schema.columns
                  where table_schema='clara' and table_name='counterparties' and column_name='tin') then
    raise exception '#982 prestate: clara.counterparties has no tin column' using errcode='CLR10';
  end if;
  if not exists (select 1 from pg_indexes
                  where schemaname='clara' and tablename='counterparties'
                    and indexname='uq_counterparties_client_registration') then
    raise exception '#982 prestate: uq_counterparties_client_registration is absent -- the registration arm''s at-most-one-live-match premise is not the one this file was written against'
      using errcode='CLR10';
  end if;

  raise notice '#982 prestate: clean -- 0225 is applied, clara._trade_invoice_resolve_party exists exactly once at its pinned pre-image (or already carries this file''s marker, a supported #957 redo) with its owner/definer/search_path/stable posture and no application-role grant, the four neighbour bodies are at their pinned shas, and clara.counterparties carries tin plus the registration partial unique this file''s conflict arm assumes.';
end
$t982_pre$;

-- =====================================================================================
-- THE CHANGE.
-- =====================================================================================
set role clara_fn_owner;

-- THE INDEX THAT MAKES THE NEW ARM AN INDEX SCAN. The arm filters
-- (client_id, kind, normalised tin) over live, unmerged rows, and `clara.counterparties` is
-- estate-wide: without this the resolver would sweep every firm's parties, TWICE per admission
-- (0225 step 5 and step 7 both call it). Both expressions are IMMUTABLE, which is what makes them
-- indexable at all.
create index if not exists ix_counterparties_client_kind_tin_normalized
  on clara.counterparties (client_id, kind, (lower(regexp_replace(tin, '[^a-zA-Z0-9]', '', 'g'))))
  where tin is not null and merged_into is null and retired_at is null;

-- ---------------------------------------------------------------------------------
-- THE RECUT RESOLVER. Sections (a) NAMED BY ID and the name/alias candidate set are 0225's own,
-- carried over VERBATIM; what is new is the joint identifier tier between them (#982).
-- ---------------------------------------------------------------------------------
create or replace function clara._trade_invoice_resolve_party(p_client uuid, p_kind text, p_particulars jsonb)
  returns jsonb language plpgsql stable security definer set search_path = clara, pg_temp as $$
declare
  v_want text; v_id uuid; v_canon uuid; v_row record; v_name text; v_name_n text;
  v_reg text; v_reg_n text; v_tin text; v_tin_n text; v_n int; v_candidates jsonb;
  v_reg_row record; v_reg_hit boolean := false;
  v_tin_row record; v_tin_hits int := 0;
begin
  v_want := case p_kind when 'sales_invoice' then 'customer' else 'vendor' end;
  v_id := nullif(btrim(coalesce(p_particulars->'counterparty'->>'id','')),'')::uuid;

  -- (a) NAMED BY ID. The canonical survivor is what a merge left behind; reading the stored id raw
  -- would bind history to a party that no longer speaks for itself (0149's rule).
  if v_id is not null then
    v_canon := clara._canonical_counterparty(p_client, v_id);
    select cp.* into v_row from clara.counterparties cp
     where cp.id = v_canon and cp.client_id = p_client
       and cp.merged_into is null and cp.retired_at is null;
    if not found then
      raise exception 'that counterparty is not a live party of this client' using errcode='CLR10',
        detail=jsonb_build_object('reason','party_unresolved','counterparty_id',v_id)::text;
    end if;
    if v_row.kind <> v_want then
      raise exception 'a % is recorded against a %, and this party is a %', p_kind, v_want, v_row.kind
        using errcode='CLR10',
          detail=jsonb_build_object('reason','wrong_control_domain','counterparty_id',v_row.id,
            'counterparty_kind',v_row.kind,'expected_counterparty_kind',v_want,
            'kind',p_kind)::text;
    end if;
    return jsonb_build_object('counterparty_id', v_row.id, 'counterparty_kind', v_row.kind,
      'name', v_row.name, 'payment_terms_days', v_row.payment_terms_days);
  end if;

  -- (b) NAMED BY IDENTITY. #982 (owner's ruling 2026-09-20): the registration number and the TIN
  -- are ONE TIER, read before the name, each arm needing a single live match of the wanted kind.
  -- The normalised name and its live aliases -- 0215's own surface, read, never written -- are
  -- the tier after it, unchanged.
  v_name := nullif(btrim(coalesce(p_particulars->'counterparty'->>'name','')),'');
  v_reg  := nullif(btrim(coalesce(p_particulars->'counterparty'->>'registration_no','')),'');
  v_tin  := nullif(btrim(coalesce(p_particulars->'counterparty'->>'tin','')),'');
  if v_name is null and v_reg is null and v_tin is null then
    raise exception 'a trade invoice names its counterparty' using errcode='CLR10',
      detail='{"reason":"party_unresolved","constraint":"required"}';
  end if;
  v_name_n := lower(regexp_replace(coalesce(v_name,''),'[^a-zA-Z0-9]','','g'));
  v_reg_n  := case when v_reg is null then null
                   else lower(regexp_replace(v_reg,'[^a-zA-Z0-9]','','g')) end;
  -- THE SAME NORMALISATION, on the same identifier tier (see this file's header). A TIN that
  -- normalises away entirely is not an identifier and must not match every party whose TIN also
  -- normalises to nothing, so it is folded to NULL here rather than compared.
  v_tin_n  := nullif(case when v_tin is null then null
                          else lower(regexp_replace(v_tin,'[^a-zA-Z0-9]','','g')) end, '');

  -- (b1) THE REGISTRATION ARM. At most ONE live row can answer, because
  -- uq_counterparties_client_registration is unique on (client_id, kind, registration_normalized)
  -- -- the premise the prestate pins.
  if v_reg_n is not null then
    select cp.* into v_reg_row from clara.counterparties cp
     where cp.client_id = p_client and cp.kind = v_want
       and cp.registration_normalized = v_reg_n
       and cp.merged_into is null and cp.retired_at is null
     order by cp.id limit 1;
    v_reg_hit := found;
  end if;

  -- (b2) THE TIN ARM. Nothing constrains a TIN to one party, so this arm COUNTS first and reads
  -- the row only when exactly one live party of the wanted kind answers.
  if v_tin_n is not null then
    select count(*)::int into v_tin_hits from clara.counterparties cp
     where cp.client_id = p_client and cp.kind = v_want
       and cp.merged_into is null and cp.retired_at is null
       and cp.tin is not null
       and lower(regexp_replace(cp.tin,'[^a-zA-Z0-9]','','g')) = v_tin_n;
    if v_tin_hits = 1 then
      select cp.* into v_tin_row from clara.counterparties cp
       where cp.client_id = p_client and cp.kind = v_want
         and cp.merged_into is null and cp.retired_at is null
         and cp.tin is not null
         and lower(regexp_replace(cp.tin,'[^a-zA-Z0-9]','','g')) = v_tin_n;
    end if;
  end if;

  if v_reg_hit then
    return jsonb_build_object('counterparty_id', v_reg_row.id, 'counterparty_kind', v_reg_row.kind,
      'name', v_reg_row.name, 'payment_terms_days', v_reg_row.payment_terms_days);
  end if;
  if v_tin_hits = 1 then
    return jsonb_build_object('counterparty_id', v_tin_row.id, 'counterparty_kind', v_tin_row.kind,
      'name', v_tin_row.name, 'payment_terms_days', v_tin_row.payment_terms_days);
  end if;

  -- THE CANDIDATE SET, by normalised name OR a live alias. `distinct` because a party can carry
  -- several aliases that all normalise to the submitted name.
  select count(distinct cp.id)::int into v_n
    from clara.counterparties cp
    left join clara.counterparty_aliases al
      on al.counterparty_id = cp.id and al.retired_at is null
     and al.alias_normalized = v_name_n
   where cp.client_id = p_client and cp.kind = v_want
     and cp.merged_into is null and cp.retired_at is null
     and v_name_n <> '' and (cp.name_normalized = v_name_n or al.id is not null);
  if v_n = 0 then
    raise exception 'no % of this client answers to %', v_want, coalesce(v_name, v_reg, v_tin)
      using errcode='CLR10',
        detail=jsonb_build_object('reason','party_unresolved','name',v_name,
          'registration_no',v_reg,'expected_counterparty_kind',v_want)::text;
  end if;
  if v_n > 1 then
    -- CARRIED VERBATIM (D12a), so the person picks from what the books actually hold rather than
    -- from a summary somebody wrote.
    select jsonb_agg(jsonb_build_object('counterparty_id', c.id, 'name', c.name,
             'registration_no', c.registration_no, 'tin', c.tin) order by c.name, c.id)
      into v_candidates
      from (select distinct cp.id, cp.name, cp.registration_no, cp.tin
              from clara.counterparties cp
              left join clara.counterparty_aliases al
                on al.counterparty_id = cp.id and al.retired_at is null
               and al.alias_normalized = v_name_n
             where cp.client_id = p_client and cp.kind = v_want
               and cp.merged_into is null and cp.retired_at is null
               and (cp.name_normalized = v_name_n or al.id is not null)) c;
    raise exception '% %s of this client answer to %; say which one', v_n, v_want, v_name
      using errcode='CLR10',
        detail=jsonb_build_object('reason','party_ambiguous','name',v_name,
          'expected_counterparty_kind',v_want,'candidates',v_candidates)::text;
  end if;
  select distinct on (cp.id) cp.* into v_row
    from clara.counterparties cp
    left join clara.counterparty_aliases al
      on al.counterparty_id = cp.id and al.retired_at is null
     and al.alias_normalized = v_name_n
   where cp.client_id = p_client and cp.kind = v_want
     and cp.merged_into is null and cp.retired_at is null
     and (cp.name_normalized = v_name_n or al.id is not null);
  return jsonb_build_object('counterparty_id', v_row.id, 'counterparty_kind', v_row.kind,
    'name', v_row.name, 'payment_terms_days', v_row.payment_terms_days);
end $$;
revoke all on function clara._trade_invoice_resolve_party(uuid,text,jsonb) from public;

reset role;

-- =====================================================================================
-- TAIL. Re-reads the live catalog rather than trusting the statements above ran as written.
-- =====================================================================================
do $t982_tail$
declare
  v_sig text := 'clara._trade_invoice_resolve_party(uuid,text,jsonb)';
  v_src text;
  v_sha text;
  v_n int;
begin
  select count(*)::int into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'clara' and p.proname = '_trade_invoice_resolve_party';
  if v_n <> 1 then
    raise exception '#982 tail: clara._trade_invoice_resolve_party has % bodies after the recut (expected exactly 1)', v_n
      using errcode='CLR10';
  end if;

  -- (T.1) THE POSTURE SURVIVED THE RECUT: same owner, still SECURITY DEFINER, still
  -- search_path-pinned, still `stable`, and still granted to NO application role.
  select count(*)::int into v_n from pg_proc p
   where p.oid = v_sig::regprocedure and p.proowner = 'clara_fn_owner'::regrole
     and p.prosecdef and p.provolatile = 's'
     and p.proconfig @> array['search_path=clara, pg_temp'];
  if v_n <> 1 then
    raise exception '#982 tail: the recut body lost its owner / security definer / search_path / stable posture'
      using errcode='CLR10';
  end if;
  if has_function_privilege('clara_authenticated', v_sig, 'EXECUTE')
     or has_function_privilege('clara_runtime', v_sig, 'EXECUTE')
     or has_function_privilege('clara_agent_ro', v_sig, 'EXECUTE') then
    raise exception '#982 tail: the recut body is granted to an application role -- it is an internal'
      using errcode='CLR10';
  end if;

  -- (T.2) THE BODY IS THIS FILE'S. The marker is what a later file's prestate reads to tell a
  -- #982 body from 0225's.
  select p.prosrc into v_src from pg_proc p where p.oid = v_sig::regprocedure;
  if position('#982' in v_src) = 0 then
    raise exception '#982 tail: the live body carries no #982 marker -- the recut did not take'
      using errcode='CLR10';
  end if;

  -- (T.3) THE CALLER DID NOT MOVE. This file recuts the resolver and nothing else on the lane.
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha from pg_proc p
   where p.oid = 'clara.admit_trade_invoice_work(uuid,uuid,text,text,jsonb,jsonb,text,jsonb,text)'::regprocedure;
  if v_sha is distinct from 'c1693503fa0221de53af2e1ddfe716c2baa9c3e3d82c14e02007a04c45d70f5c' then
    raise exception '#982 tail: clara.admit_trade_invoice_work MOVED while this file applied (got %) -- it must not have', v_sha
      using errcode='CLR10';
  end if;

  -- (T.4) THE INDEX EXISTS, and it is the partial expression index the arm was written for.
  if not exists (select 1 from pg_indexes
                  where schemaname='clara' and tablename='counterparties'
                    and indexname='ix_counterparties_client_kind_tin_normalized') then
    raise exception '#982 tail: ix_counterparties_client_kind_tin_normalized is absent'
      using errcode='CLR10';
  end if;

  raise notice '#982 tail OK: clara._trade_invoice_resolve_party exists exactly once, carries this file''s marker, kept 0225''s owner/definer/search_path/stable posture and its owner-only ACL; clara.admit_trade_invoice_work is byte-identical to its pinned pre-image; the TIN expression index stands.';
end
$t982_tail$;
