-- UNNUMBERED_f_a1_identity_helper.sql — F-A1 PR-1, part 0 of 3: THE IDENTITY VERDICT LEAF.
-- =====================================================================================
-- APPLY ORDER (alphabetical, and that is deliberate — nothing else keys on it):
--   0. UNNUMBERED_f_a1_identity_helper.sql   (this file) clara._witness_identity_v1
--   1. UNNUMBERED_f_a1_predicate.sql         clara.evaluate_witness_fact_state_v1 + the freeze
--   2. UNNUMBERED_f_a1_predicate_part2.sql   the two dispatch recuts + the caller census
-- Numbers are claimed at MERGE time (hard constraint 10). The three-file split exists for the
-- repo's 500-line cap; the seam was chosen at the one place the predicate has a genuinely
-- separable question — "which counterparty block does this registration belong to" — rather
-- than at an arbitrary line. THIS LEAF IS A FROZEN CLOSURE MEMBER of
-- clara.evaluate_witness_fact_state_v1 (registered as ordinal 3 in part 1's
-- clara.evaluator_versions row), so it carries the same immutability cost as the entrypoint: a
-- behavioural change is a `_v2` re-mint with a new registry row, never a CoR of this body.
--
-- WHAT IT DECIDES (design §3.3, D12): whether a vendor_registration / customer_registration the
-- TEXT witness cited may be trusted as a COUNTERPARTY identity. It returns verdicts only; it
-- never touches the amount verdict — `corroborated` stays an AMOUNT verdict with no identity
-- term (N5), today's posture unchanged.
--
-- PAIRWISE AGREEMENT ALONE IS REFUSED AS THE WALL: two same-provider reads fail correlatedly on
-- exactly the layouts that mislead. The defense stays GEOMETRIC and server-side — a registration
-- corroborates only when its cited region is STRICTLY CLOSER (2D box distance over the PINNED
-- OCR polygons the witness fact regions carry, §3.4) to the vendor-name region than to the
-- customer-name region, and symmetrically for customer_registration. TIE REFUSES. MISSING
-- ANCHOR REFUSES. This succeeds invoice-vendor-identity.mjs:22-55, 218-236.
--
-- PLUS THE ONE GENUINELY INDEPENDENT DB-OWNED TERM THE RETIREMENT LEAVES STANDING — the
-- SELF-REFERENTIAL WITHDRAWAL (PR-0 B3 AS AMENDED). A side whose registration normalizes to the
-- FILING CLIENT's own client_identifiers value (kind tin/ssm) is the client's own block, not a
-- counterparty, so that side is WITHDRAWN from counterparty corroboration. NOT AN ERROR: the
-- region facts persist (C4) and 0022:1309-1341's direction evidence keeps reading them —
-- 0022:1326-1342's `v_hard_ok` treats vendor_reg == client as POSITIVE sales-direction evidence,
-- and reading it as a refusal inverts its polarity. POLARITY-FREE BY CONSTRUCTION: no
-- document_kind and no direction input, so no circularity with 0022:1307's derived polarity.
-- Both sides matching withdraws BOTH and flags contest.
--
-- NAMED HONEST WEAKNESS (design §3.3, §8): the anchor DESIGNATION — which block is the vendor's
-- — is witness-supplied where Azure's typed field supplied it independently. On the
-- MISLABELLED-BLOCK shape (a witness citing the buyer's name as vendor_name AND the adjacent
-- buyer registration as vendor_registration) the distance test CONFIRMS the wrong pairing; only
-- the self-referential withdrawal catches it, and the battery gates on that. D12's pre-committed
-- fallback stands: if the wrong-party cells fail on the measured corpus, identity fields are
-- demoted to non-corroboration-bearing and that ships without a new design round.
set local statement_timeout = '5min';

do $fa1_helper_pre$
begin
  if to_regprocedure('clara._witness_identity_v1(uuid,uuid,boolean)') is not null then
    raise exception 'F-A1 identity helper: clara._witness_identity_v1 already exists — already applied'
      using errcode='CLR10';
  end if;
  -- The two relations this leaf reads must be the ones it was authored against.
  -- WHERE THE FILING CLIENT ACTUALLY LIVES, measured rather than assumed: `documents.client_id`
  -- existed at 0003:67 and is GONE at the frontier — Slice-5 moved client attribution onto
  -- clara.document_filings (0007:63-96, the live-filing partial indexes), and every live reader
  -- goes through `document_filings ... where retired_at is null` (0011:1633, 0049:458-459,
  -- 0040:3298). The design says "the FILING CLIENT's own client_identifiers" without naming the
  -- join; this is the join it names, and the prestate refuses if it ever moves again, because a
  -- silently unevaluable withdrawal is exactly the derived absence law 27(2) forbids.
  if not exists (select 1 from information_schema.columns
                  where table_schema='clara' and table_name='document_filings' and column_name='client_id')
     or not exists (select 1 from information_schema.columns
                  where table_schema='clara' and table_name='document_filings' and column_name='retired_at')
     or not exists (select 1 from information_schema.columns
                  where table_schema='clara' and table_name='client_identifiers' and column_name='value_normalized') then
    raise exception 'F-A1 identity helper: clara.document_filings(client_id, retired_at) / clara.client_identifiers.value_normalized absent — the self-referential withdrawal cannot be evaluated'
      using errcode='CLR10';
  end if;
end
$fa1_helper_pre$;

set role clara_fn_owner;

create function clara._witness_identity_v1(p_document uuid, p_text_x uuid, p_contest boolean)
  returns jsonb
  language plpgsql stable security definer set search_path = clara, pg_temp as $ident$
declare
  v_box jsonb; v_client uuid; v_vreg text; v_creg text; v_vreg_n int; v_creg_n int;
  v_vreg_self boolean := false; v_creg_self boolean := false;
  v_d_vv numeric; v_d_vc numeric; v_d_cc numeric; v_d_cv numeric;
  v_vv text; v_cv text; v_flag boolean := false; v_out jsonb; v_clients int;
begin
  -- THE FILING CLIENT (clara.document_filings, live filings only — 0011:1633 / 0049:458-459's
  -- idiom). AMBIGUITY FAILS CLOSED: two live filings naming different clients means this leaf
  -- cannot say whose block the registration is, so it leaves v_client NULL and every verdict
  -- below refuses. Picking one would be a guess wearing a verdict's clothes.
  -- array_agg, not min(): PostgreSQL has no min() for uuid, and the rig said so before any human
  -- read the line. The DISTINCT count is what decides; the value is only read when it is 1.
  select count(distinct f.client_id)::int, (array_agg(distinct f.client_id))[1]
    into v_clients, v_client
    from clara.document_filings f where f.document_id = p_document and f.retired_at is null;
  if coalesce(v_clients, 0) <> 1 then v_client := null; end if;
  select count(*) filter (where r.field_path='invoice.vendor_registration')::int,
         count(*) filter (where r.field_path='invoice.customer_registration')::int,
         -- 0022:1309-1311's normalization VERBATIM (lower, alphanumerics only), compared against
         -- client_identifiers.value_normalized exactly as 0022:1326-1338 compares it.
         nullif(lower(regexp_replace(coalesce(min(r.text_content) filter (where r.field_path='invoice.vendor_registration'),''), '[^a-zA-Z0-9]', '', 'g')),''),
         nullif(lower(regexp_replace(coalesce(min(r.text_content) filter (where r.field_path='invoice.customer_registration'),''), '[^a-zA-Z0-9]', '', 'g')),'')
    into v_vreg_n, v_creg_n, v_vreg, v_creg
    from clara.document_regions r where r.extraction_id = p_text_x;
  if v_client is not null then
    v_vreg_self := v_vreg is not null and exists(select 1 from clara.client_identifiers ci
      where ci.client_id = v_client and ci.kind in ('tin','ssm') and ci.value_normalized = v_vreg);
    v_creg_self := v_creg is not null and exists(select 1 from clara.client_identifiers ci
      where ci.client_id = v_client and ci.kind in ('tin','ssm') and ci.value_normalized = v_creg);
  end if;

  -- The four identity blocks' bounding boxes. A field with more than one region, spanning more
  -- than one page, or with fewer than two usable points falls OUT here and therefore refuses
  -- below — missing anchor refuses. Non-numeric polygon entries are filtered rather than cast,
  -- so a malformed locator degrades to "not comparable" instead of raising.
  select coalesce(jsonb_object_agg(b.fp, b.box), '{}'::jsonb) into v_box
    from (select r.field_path as fp,
                 jsonb_build_object(
                   'pmin', min((r.locator->>'page')::int), 'pmax', max((r.locator->>'page')::int),
                   'x0', min(p.x), 'x1', max(p.x), 'y0', min(p.y), 'y1', max(p.y),
                   'nreg', count(distinct r.id)::int, 'npts', count(*)::int) as box
            from clara.document_regions r
            cross join lateral (select case when jsonb_typeof(r.locator->'polygon') = 'array'
                                            then jsonb_array_length(r.locator->'polygon')
                                            else 0 end as len) l
            cross join lateral (
              select (r.locator->'polygon'->>(2*g.i))::numeric as x,
                     (r.locator->'polygon'->>(2*g.i+1))::numeric as y
                from generate_series(0, (l.len / 2) - 1) as g(i)
               where (r.locator->'polygon'->>(2*g.i)) ~ '^-?[0-9]+([.][0-9]+)?$'
                 and (r.locator->'polygon'->>(2*g.i+1)) ~ '^-?[0-9]+([.][0-9]+)?$') p
           where r.extraction_id = p_text_x
             and r.field_path in ('invoice.vendor_name','invoice.customer_name',
                                  'invoice.vendor_registration','invoice.customer_registration')
             and (r.locator->>'page') ~ '^[0-9]+$'
           group by r.field_path) b;

  -- SQUARED 2D box distance, EXACT in numeric — no sqrt, because the comparison is monotone in
  -- the square and a float would rest a TIE-BREAKING accounting decision on rounding error. A
  -- null distance means "not comparable" (missing block, duplicate region, multi-page block, or
  -- the two blocks on different pages) and every consumer of it below refuses.
  select max(d.d2) filter (where d.k='v_v'), max(d.d2) filter (where d.k='v_c'),
         max(d.d2) filter (where d.k='c_c'), max(d.d2) filter (where d.k='c_v')
    into v_d_vv, v_d_vc, v_d_cc, v_d_cv
    from (select t.k,
                 case when coalesce((t.a->>'nreg')::int,0) <> 1 or coalesce((t.b->>'nreg')::int,0) <> 1
                        or (t.a->>'pmin') <> (t.a->>'pmax') or (t.b->>'pmin') <> (t.b->>'pmax')
                        or (t.a->>'pmin') <> (t.b->>'pmin')
                        or coalesce((t.a->>'npts')::int,0) < 2 or coalesce((t.b->>'npts')::int,0) < 2
                      then null
                      else power(greatest(0::numeric,
                             greatest((t.a->>'x0')::numeric - (t.b->>'x1')::numeric,
                                      (t.b->>'x0')::numeric - (t.a->>'x1')::numeric)), 2)
                         + power(greatest(0::numeric,
                             greatest((t.a->>'y0')::numeric - (t.b->>'y1')::numeric,
                                      (t.b->>'y0')::numeric - (t.a->>'y1')::numeric)), 2) end as d2
            from (values
              ('v_v', v_box->'invoice.vendor_registration',   v_box->'invoice.vendor_name'),
              ('v_c', v_box->'invoice.vendor_registration',   v_box->'invoice.customer_name'),
              ('c_c', v_box->'invoice.customer_registration', v_box->'invoice.customer_name'),
              ('c_v', v_box->'invoice.customer_registration', v_box->'invoice.vendor_name')
            ) as t(k, a, b)) d;

  if coalesce(p_contest, false) then    -- CONTEST-WITHDRAWS (invoice-vendor-identity.mjs:458-472)
    v_vv := case when v_vreg_n = 0 then null else 'withdrawn_contest' end;
    v_cv := case when v_creg_n = 0 then null else 'withdrawn_contest' end;
    v_flag := true;
  elsif v_vreg_self and v_creg_self then  -- both sides matching withdraws BOTH + flags contest (B3)
    v_vv := 'withdrawn_self_referential'; v_cv := 'withdrawn_self_referential'; v_flag := true;
  else
    v_vv := case
      when v_vreg_n = 0 then null
      when v_vreg_self then 'withdrawn_self_referential'
      when v_client is null or v_vreg_n <> 1 then 'not_corroborated'
      when v_d_vv is null or v_d_vc is null then 'not_corroborated'
      when v_d_vv < v_d_vc then 'corroborated' else 'not_corroborated' end;
    v_cv := case
      when v_creg_n = 0 then null
      when v_creg_self then 'withdrawn_self_referential'
      when v_client is null or v_creg_n <> 1 then 'not_corroborated'
      when v_d_cc is null or v_d_cv is null then 'not_corroborated'
      when v_d_cc < v_d_cv then 'corroborated' else 'not_corroborated' end;
  end if;
  -- Keys are appended only when the witness actually cited that side, so a document on which no
  -- registration was read carries no verdict rather than a manufactured one.
  v_out := jsonb_build_object('identity_contest', v_flag);
  if v_vv is not null then v_out := v_out || jsonb_build_object('vendor_registration_verdict', v_vv); end if;
  if v_cv is not null then v_out := v_out || jsonb_build_object('customer_registration_verdict', v_cv); end if;
  return v_out;
end $ident$;
revoke all on function clara._witness_identity_v1(uuid,uuid,boolean) from public;

reset role;

do $fa1_helper_tail$
begin
  if not exists (select 1 from pg_proc p
                  where p.oid='clara._witness_identity_v1(uuid,uuid,boolean)'::regprocedure
                    and p.prosecdef and p.proconfig @> array['search_path=clara, pg_temp']
                    and pg_get_userbyid(p.proowner) = 'clara_fn_owner') then
    raise exception 'F-A1 identity helper tail: not a search_path-pinned SECURITY DEFINER owned by clara_fn_owner'
      using errcode='CLR10';
  end if;
  if exists (select 1 from pg_proc f
             cross join lateral aclexplode(coalesce(f.proacl, acldefault('f', f.proowner))) a
              where f.oid='clara._witness_identity_v1(uuid,uuid,boolean)'::regprocedure
                and a.grantee = 0 and a.privilege_type = 'EXECUTE') then
    raise exception 'F-A1 identity helper tail: PUBLIC executes the identity leaf' using errcode='CLR10';
  end if;
  -- POLARITY-FREE BY CONSTRUCTION, asserted against the COMMITTED body rather than intent: this
  -- leaf must not read document_kind or any direction signal, or B3's circularity returns.
  if (select p.prosrc from pg_proc p where p.oid='clara._witness_identity_v1(uuid,uuid,boolean)'::regprocedure)
       ~* 'document_kind|direction|polarity|coding_kind' then
    raise exception 'F-A1 identity helper tail: the identity leaf reads a POLARITY signal — B3''s circularity with 0022:1307 has returned'
      using errcode='CLR10';
  end if;
  raise notice 'F-A1 identity helper: OK — clara._witness_identity_v1 created (definer, search_path pinned, no PUBLIC execute, polarity-free)';
end
$fa1_helper_tail$;
