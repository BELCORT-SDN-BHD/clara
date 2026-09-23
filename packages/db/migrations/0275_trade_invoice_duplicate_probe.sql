-- 0275_trade_invoice_duplicate_probe — #1007 (lane 02, riders wave 3): BEFORE A TRADE INVOICE IS
-- RECORDED, ANSWER "WHICH RECORDED INVOICES LOOK LIKE THIS ONE?" — AND NEVER REFUSE ON THE ANSWER.
-- =====================================================================================
-- Spec of record: issue #1007's Agent Brief and the owner's ruling it quotes (2026-09-20): check
-- at the RECORDING step, WARN and let the person decide, NEVER refuse; and do not look at the
-- document number alone — also look at the amount and the counterparty.
-- Domain words: CONTEXT.md — "Trade invoice", "Counterparty identity", and this file's new one,
-- "Probable duplicate".
--
-- WHAT WAS TRUE BEFORE THIS FILE, measured rather than asserted. On the trade-invoice lane
-- "duplicate" meant a replayed INTENT and nothing else: `uq_accounting_work_intent` converges a
-- repeated (firm, client, intent_key) onto ONE Work, and `p655.duplicate.same_reference_is_NOT_probed`
-- in `packages/db/tests/trade-invoice.test.mjs` recorded ONE supplier bill number under TWO intent
-- keys and asserted TWO invoices and a DOUBLED payable. Nothing in the door, the birth trigger or
-- the belts ever looked at (client_id, counterparty_id, reference). That cell is rewritten by this
-- PR to prove the new behaviour rather than the residual.
--
-- THIS FILE IS PURELY ADDITIVE. It creates three ungranted internals and ONE probe read for the
-- signed-in bookkeeper the web form runs as.
-- IT RECUTS NOTHING: `clara.admit_trade_invoice_work`'s replay semantics, its refusal ladder and
-- the posting core are untouched, and the tail re-reads both the door and the party resolver to
-- prove this file moved neither. A UNIQUE CONSTRAINT ON `reference` WOULD BE WRONG AND IS NOT
-- ADDED: the column is nullable and suppliers legitimately reuse numbers (0225 section A says so).
--
-- THE TWO SIGNALS, AND WHY THERE ARE TWO RATHER THAN ONE CONJUNCTION.
--   1 · SAME DOCUMENT NUMBER — same counterparty AND the same reference after normalisation.
--       Skipped entirely when the new document states no reference.
--   2 · SAME MONEY ON THE SAME DAY — same counterparty, same total in sen AND the same document
--       date. This is the signal for a missing or mistyped number.
-- Amount alone, or counterparty alone, is NEVER a match: a monthly rent bill legitimately repeats
-- its amount. Real practice close to this case, and the reason the two are INDEPENDENT: QuickBooks
-- Online warns on vendor + bill number and still lets the person save, while SAP's standard check
-- requires vendor, currency, company code, gross amount, reference and invoice date to ALL match —
-- which is known to let a duplicate through whenever the reference was typed differently. Two
-- independent signals, joined by OR, is the shape that catches both mistakes.
--
-- WHY THE REFERENCE IS NORMALISED THE WAY IT IS. The estate has exactly ONE identifier
-- normalisation — `lower(regexp_replace(v, '[^a-zA-Z0-9]', '', 'g'))` — byte-identical in
-- `clara.create_counterparty` (0021:99-101), `clara.set_counterparty_identifiers` (0215:965-967)
-- and, since 0274, the trade-invoice party resolver's registration and TIN arms. A document number
-- is printed with dashes, spaces and mixed case exactly as a registration number is, so `INV-001`,
-- `inv 001` and `INV001` are ONE number here too. A reference that normalises away entirely is not
-- a number and is folded to NULL rather than matched, or every unnumbered bill would match every
-- other one.
--
-- WHICH EARLIER INVOICES COUNT. Only ones that are, or still may become, a posting:
--   · the Work is not TERMINAL-WITHOUT-POSTING. The brief names refused / failed / cancelled;
--     this file uses the estate's OWN closed terminal set for "this Work will never post",
--     `('refused','failed','cancelled','expired')` — the four 0178:635 and 0184:502 already treat
--     as one class. `expired` is the fourth member of the class the brief described in prose, not
--     a widening of it: an expired Work has no more chance of posting than a cancelled one, and
--     leaving it in would warn about a bill nobody can record.
--   · the posted entry, if there is one, has not been REVERSED. `clara.journal_entries.reversed_by`
--     is stamped by the reversal's approval path (0009:1676-1680) and is the one column that says
--     so; an unwound bill is not on the books, so a second recording of it is not a duplicate.
-- Everything else counts, INCLUDING an invoice whose Work is still queued or running: it is about
-- to post, and a second recording would double the payable exactly as a posted one would.
--
-- THE PROBE WRITES NOTHING AND LOCKS NOTHING. Every body here is `stable`, so PostgreSQL refuses
-- any write inside it, and the matcher takes no `for update` / `for share`. `p1007.probe.is_a_read`
-- proves both from the outside.
--
-- SCOPE, VERBATIM FROM THE TICKET. Out of scope: refusing, blocking or auto-merging a suspected
-- duplicate; fuzzy matching on counterparty names or merging counterparty records; matching across
-- kinds, across clients, or against documents that were uploaded but never recorded;
-- settlement-time checks (#662) and credit notes; editing 0225, 0274, any frozen workflow body or
-- the blueprints.
--
-- REDO-SAFE (#957). Every statement is `create or replace function` or a `revoke`/`grant` on one,
-- and the prestate accepts a chain on which this file's own objects already exist (a
-- chain on which this file's own objects already exist (a
-- `CLARA_MIGRATION_REDO=0275_trade_invoice_duplicate_probe` re-run over its own effects).
-- =====================================================================================

do $t1007_pre$
declare
  v_sha text;
  v_n int;
  v_def text;
begin
  -- 0.1 · THE LANE THIS FILE STANDS ON. 0225 must be applied: every object here reads
  -- clara.trade_invoices, and the probe resolves its party through the resolver 0225 shipped.
  if to_regclass('clara.trade_invoices') is null
     or to_regclass('clara.trade_invoice_status') is null then
    raise exception '#1007 prestate: clara.trade_invoices (0225) is absent -- migration 0225 must be applied first'
      using errcode='CLR10';
  end if;
  if to_regprocedure('clara._trade_invoice_resolve_party(uuid,text,jsonb)') is null
     or to_regprocedure('clara.admit_trade_invoice_work(uuid,uuid,text,text,jsonb,jsonb,text,jsonb,text)') is null then
    raise exception '#1007 prestate: the 0225 trade-invoice doors are absent' using errcode='CLR10';
  end if;

  -- 0.2 · THE TWO NEIGHBOUR BODIES THIS FILE RELIES ON AND MUST NOT TOUCH, pinned by
  -- sha256(prosrc) and MEASURED on this rig now — i.e. AFTER #982's recut, which is live on this
  -- lane. The party resolver is the one the probe calls, so the probe can only ever report
  -- matches for the party the ADMISSION would resolve; the admission door is re-read in the tail
  -- to prove this file left it exactly as it found it.
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha from pg_proc p
   where p.oid = 'clara._trade_invoice_resolve_party(uuid,text,jsonb)'::regprocedure;
  if v_sha is distinct from 'be2df90e5899a1692682d843e6967be828952b3e42f3b09fe317437677db7cf8' then
    raise exception '#1007 prestate: clara._trade_invoice_resolve_party has DRIFTED (measured %, expected be2df90e5899a1692682d843e6967be828952b3e42f3b09fe317437677db7cf8 -- 0274''s post-image) -- the probe resolves its party through it and cannot vouch for a body it does not recognise', v_sha
      using errcode='CLR10';
  end if;
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha from pg_proc p
   where p.oid = 'clara.admit_trade_invoice_work(uuid,uuid,text,text,jsonb,jsonb,text,jsonb,text)'::regprocedure;
  if v_sha is distinct from 'c1693503fa0221de53af2e1ddfe716c2baa9c3e3d82c14e02007a04c45d70f5c' then
    raise exception '#1007 prestate: clara.admit_trade_invoice_work has DRIFTED (measured %) -- this file copies its authority preamble arm for arm and must not touch it', v_sha
      using errcode='CLR10';
  end if;

  -- 0.3 · THE STRUCTURAL PREMISES the two signals and the liveness filter are written against:
  --   · the five columns the matcher compares;
  --   · the Work status vocabulary, whose FOUR terminal-without-posting members this file names;
  --   · clara.journal_entries.reversed_by, the one column that says an entry was unwound.
  select count(*)::int into v_n from information_schema.columns
   where table_schema='clara' and table_name='trade_invoices'
     and column_name in ('kind','counterparty_id','reference','document_date','total_cents');
  if v_n <> 5 then
    raise exception '#1007 prestate: clara.trade_invoices does not carry the five columns the probe compares (found %)', v_n
      using errcode='CLR10';
  end if;
  select pg_get_constraintdef(oid) into v_def from pg_constraint
   where conrelid = 'clara.accounting_work'::regclass and conname = 'accounting_work_status_check';
  if v_def is null or position('''refused''' in v_def) = 0 or position('''failed''' in v_def) = 0
     or position('''cancelled''' in v_def) = 0 or position('''expired''' in v_def) = 0 then
    raise exception '#1007 prestate: clara.accounting_work''s status vocabulary is not the one this file filters on (got %)', coalesce(v_def,'(absent)')
      using errcode='CLR10';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema='clara' and table_name='journal_entries'
                    and column_name='reversed_by') then
    raise exception '#1007 prestate: clara.journal_entries has no reversed_by column -- the reversal filter has nothing to read'
      using errcode='CLR10';
  end if;

  -- 0.4 · THE NEGATIVE PREMISE THIS FILE'S WHOLE ARGUMENT RESTS ON: nothing already constrains a
  -- trade invoice's reference, so a probe is the ONLY thing that can warn about a reused one.
  if exists (select 1 from pg_indexes
              where schemaname='clara' and tablename='trade_invoices'
                and indexdef ilike '%unique%' and indexdef ilike '%reference%') then
    raise exception '#1007 prestate: a unique index already constrains clara.trade_invoices.reference -- this file was written for a lane where a reference is free to repeat'
      using errcode='CLR10';
  end if;

  if to_regprocedure('clara.probe_trade_invoice_duplicates(uuid,text,jsonb)') is not null then
    raise notice '#1007 prestate: this file''s own objects are already present -- this is a REDO (#957) over its own effects, which create-or-replace makes safe.';
  end if;
  raise notice '#1007 prestate: clean -- 0225 and 0274 are applied, the party resolver and the admission door are at their pinned shas, clara.trade_invoices carries the five compared columns, the Work status vocabulary names all four terminal-without-posting states, clara.journal_entries carries reversed_by, and no unique index constrains a trade invoice reference.';
end
$t1007_pre$;

-- =====================================================================================
-- THE CHANGE.
-- =====================================================================================
set role clara_fn_owner;

-- ---------------------------------------------------------------------------------
-- (1) THE ONE DOCUMENT-NUMBER NORMALISATION. IMMUTABLE, so it is indexable and so both signals,
-- the acknowledgement's fingerprint and any later reader share ONE answer to "are these two
-- document numbers the same number". Byte-identical to the estate's single identifier
-- normalisation (see the header).
-- ---------------------------------------------------------------------------------
create or replace function clara._trade_invoice_reference_key(p_reference text) returns text
  language sql immutable set search_path = clara, pg_temp as $$
  select nullif(lower(regexp_replace(coalesce(p_reference, ''), '[^a-zA-Z0-9]', '', 'g')), '');
$$;
revoke all on function clara._trade_invoice_reference_key(text) from public;
comment on function clara._trade_invoice_reference_key(text) is
  '#1007: the ONE normalisation of a trade-invoice document number -- case, spaces and punctuation '
  'ignored, so INV-001, inv 001 and INV001 are one number. NULL when the reference states no '
  'number at all, which is what keeps an unnumbered bill from matching every other unnumbered '
  'bill. Ungranted to every application role.';

-- ---------------------------------------------------------------------------------
-- (2) THE ONE MATCHER. Ungranted; both probe doors delegate to it, so the form and the chat lane
-- can never be shown different answers. It takes an ALREADY-RESOLVED counterparty, because the
-- party is the door's answer and re-deriving it here would be a second resolution law.
--
-- IT READS ONE COUNTERPARTY'S INVOICES OF ONE CLIENT, which `ix_trade_invoices_counterparty`
-- (0225:365-366, on (counterparty_id, document_date desc)) already reduces to an index scan — so
-- neither signal needs an index of its own and none is added.
-- ---------------------------------------------------------------------------------
create or replace function clara._trade_invoice_duplicate_matches(p_client uuid, p_kind text,
    p_counterparty uuid, p_reference text, p_document_date date, p_total_cents bigint)
  returns jsonb language sql stable security definer set search_path = clara, pg_temp as $$
  with candidate as (
    select ti.id, ti.work_id, ti.reference, ti.document_date, ti.total_cents, ti.created_at,
           ti.recorded_by,
           coalesce(st.state, 'admitted') as state,
           st.entry_id,
           -- SIGNAL 1 · the same document number, normalised. Skipped when the NEW document states
           -- no number (the probe's own argument is NULL) or the stored one states none.
           (clara._trade_invoice_reference_key(p_reference) is not null
            and clara._trade_invoice_reference_key(ti.reference)
                = clara._trade_invoice_reference_key(p_reference)) as hit_reference,
           -- SIGNAL 2 · the same money on the same day. The signal for a missing or mistyped
           -- number, and the reason amount ALONE is never enough.
           (p_document_date is not null and p_total_cents is not null
            and ti.document_date = p_document_date
            and ti.total_cents = p_total_cents) as hit_money
      from clara.trade_invoices ti
      join clara.accounting_work w on w.id = ti.work_id
      left join clara.trade_invoice_status st
        on st.invoice_id = ti.id and st.state = 'posted'
     where ti.client_id = p_client
       and ti.kind = p_kind
       and ti.counterparty_id = p_counterparty
       -- THE WORK STILL MAY POST. The estate's own closed terminal-without-posting set.
       and w.status not in ('refused','failed','cancelled','expired')
       -- …AND ITS ENTRY, IF IT HAS ONE, WAS NOT UNWOUND.
       and not exists (select 1 from clara.journal_entries je
                        where je.id = st.entry_id and je.reversed_by is not null)
  )
  select coalesce(jsonb_agg(jsonb_build_object(
             'invoice_id', c.id,
             'work_id', c.work_id,
             'signals', (case when c.hit_reference then jsonb_build_array('same_reference')
                              else '[]'::jsonb end)
                        || (case when c.hit_money then jsonb_build_array('same_total_and_date')
                                 else '[]'::jsonb end),
             'reference', c.reference,
             'document_date', to_char(c.document_date, 'YYYY-MM-DD'),
             'total_cents', c.total_cents,
             'state', c.state,
             'entry_id', c.entry_id,
             'recorded_by', c.recorded_by,
             'created_at', c.created_at)
           order by c.document_date desc, c.created_at desc, c.id), '[]'::jsonb)
    from candidate c
   where c.hit_reference or c.hit_money;
$$;
revoke all on function clara._trade_invoice_duplicate_matches(uuid,text,uuid,text,date,bigint) from public;
comment on function clara._trade_invoice_duplicate_matches(uuid,text,uuid,text,date,bigint) is
  '#1007: the ONE duplicate matcher for the trade-invoice lane -- which already-recorded invoices '
  'of THIS client, THIS kind and THIS counterparty look like the one about to be recorded, on '
  'either of two independent signals (same normalised document number; same total on the same '
  'document date). Never matches on amount alone or counterparty alone. Skips an invoice whose '
  'Work is refused/failed/cancelled/expired and one whose posted entry was reversed. Ungranted to '
  'every application role: both probe doors delegate here so they can never disagree.';

-- ---------------------------------------------------------------------------------
-- (3) THE SHARED PROBE BODY. Ungranted; the two doors differ ONLY in how they establish authority.
-- ---------------------------------------------------------------------------------
create or replace function clara._trade_invoice_probe_core(p_client uuid, p_kind text,
    p_particulars jsonb) returns jsonb
  language plpgsql stable security definer set search_path = clara, pg_temp as $$
declare
  v_kind text; v_party jsonb; v_cp uuid; v_reference text; v_document_date date;
  v_total bigint; v_matches jsonb;
begin
  if p_particulars is null or jsonb_typeof(p_particulars) <> 'object' then
    raise exception 'a trade-invoice probe needs the particulars it is about' using errcode='CLR10',
      detail='{"reason":"invalid_particulars"}';
  end if;
  v_kind := btrim(coalesce(p_kind, ''));
  if v_kind not in ('sales_invoice','supplier_bill') then
    raise exception '% is not a trade-invoice kind', coalesce(nullif(v_kind,''),'(none)')
      using errcode='CLR10', detail='{"reason":"invalid_kind"}';
  end if;

  -- THE PARTY IS THE DOOR'S OWN ANSWER. 0274's resolver, called exactly as
  -- clara.admit_trade_invoice_work calls it, so the probe can never report matches for a party
  -- the admission would resolve differently. It RAISES on an unresolvable party, with the door's
  -- own tokens: you cannot ask whether this vendor's bill is already recorded without knowing
  -- which vendor.
  v_party := clara._trade_invoice_resolve_party(p_client, v_kind, p_particulars);
  v_cp := (v_party->>'counterparty_id')::uuid;

  v_reference := nullif(btrim(coalesce(p_particulars->>'reference','')),'');
  v_document_date := nullif(btrim(coalesce(p_particulars->>'document_date','')),'')::date;
  v_total := nullif(btrim(coalesce(p_particulars->>'total_cents','')),'')::numeric::bigint;

  v_matches := clara._trade_invoice_duplicate_matches(p_client, v_kind, v_cp, v_reference,
    v_document_date, v_total);
  return jsonb_build_object(
    'client_id', p_client,
    'kind', v_kind,
    'counterparty_id', v_cp,
    'counterparty_name', v_party->>'name',
    'reference', v_reference,
    'reference_key', clara._trade_invoice_reference_key(v_reference),
    'document_date', to_char(v_document_date,'YYYY-MM-DD'),
    'total_cents', v_total,
    'match_count', jsonb_array_length(v_matches),
    'matches', v_matches);
end $$;
revoke all on function clara._trade_invoice_probe_core(uuid,text,jsonb) from public;
comment on function clara._trade_invoice_probe_core(uuid,text,jsonb) is
  '#1007: the shared body of the two probe doors -- kind, resolved party, the two signals and the '
  'matches. Ungranted: the doors differ only in how they establish authority, never in what they '
  'answer.';

-- ---------------------------------------------------------------------------------
-- (4) THE HUMAN PROBE. Firm AND actor from the SESSION (0219:343-347), bookkeeper floor -- the
-- floor of the recording step it precedes, so the answer is never given to somebody who could not
-- act on it. It RAISES NOTHING on a duplicate: the owner ruled warn, never refuse.
-- ---------------------------------------------------------------------------------
create or replace function clara.probe_trade_invoice_duplicates(p_client uuid, p_kind text,
    p_particulars jsonb) returns jsonb
  language plpgsql stable security definer set search_path = clara, pg_temp as $$
declare c record; v_firm uuid;
begin
  c := clara._human_ctx(clara.role_rank('bookkeeper'));
  select cl.firm_id into v_firm from clara.clients cl
   where cl.id = p_client and cl.firm_id = c.firm;
  if v_firm is null then
    raise exception 'client not found in your firm' using errcode='CLR11',
      detail='{"reason":"client_not_found"}';
  end if;
  return clara._trade_invoice_probe_core(p_client, p_kind, p_particulars);
end $$;
revoke all on function clara.probe_trade_invoice_duplicates(uuid,text,jsonb) from public;
grant execute on function clara.probe_trade_invoice_duplicates(uuid,text,jsonb) to clara_authenticated;
comment on function clara.probe_trade_invoice_duplicates(uuid,text,jsonb) is
  '#1007: which already-recorded invoices of this client look like the one about to be recorded. '
  'Bookkeeper floor, firm AND actor from the session; writes nothing and takes no row lock. It '
  'warns -- it never refuses on a duplicate. The web form calls this one.';


reset role;

-- =====================================================================================
-- TAIL. Re-reads the live catalog rather than trusting the statements above ran as written.
-- =====================================================================================
do $t1007_tail$
declare v_sha text; v_sig text; v_n int;
begin
  -- (T.1) THE FOUR BODIES EXIST, each exactly once.
  select count(*)::int into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'clara' and p.proname in ('_trade_invoice_reference_key',
     '_trade_invoice_duplicate_matches', '_trade_invoice_probe_core',
     'probe_trade_invoice_duplicates');
  if v_n <> 4 then
    raise exception '#1007 tail: expected exactly 4 new bodies, found %', v_n using errcode='CLR10';
  end if;

  -- (T.2) THE GRANTS. The human probe is clara_authenticated's; the three internals are nobody's.
  if not has_function_privilege('clara_authenticated',
        'clara.probe_trade_invoice_duplicates(uuid,text,jsonb)', 'EXECUTE') then
    raise exception '#1007 tail: clara.probe_trade_invoice_duplicates is not granted to clara_authenticated'
      using errcode='CLR10';
  end if;
  if has_function_privilege('clara_runtime', 'clara.probe_trade_invoice_duplicates(uuid,text,jsonb)', 'EXECUTE')
     or has_function_privilege('clara_agent_ro', 'clara.probe_trade_invoice_duplicates(uuid,text,jsonb)', 'EXECUTE') then
    raise exception '#1007 tail: the SESSION-scoped probe is granted to a machine lane -- clara._human_ctx cannot answer for one (see the header), so the grant would be a wider boundary for nothing'
      using errcode='CLR10';
  end if;
  foreach v_sig in array array['clara._trade_invoice_reference_key(text)',
      'clara._trade_invoice_duplicate_matches(uuid,text,uuid,text,date,bigint)',
      'clara._trade_invoice_probe_core(uuid,text,jsonb)'] loop
    if has_function_privilege('clara_authenticated', v_sig, 'EXECUTE')
       or has_function_privilege('clara_runtime', v_sig, 'EXECUTE')
       or has_function_privilege('clara_agent_ro', v_sig, 'EXECUTE') then
      raise exception '#1007 tail: % is granted to an application role -- it is an internal', v_sig
        using errcode='CLR10';
    end if;
  end loop;

  -- (T.3) THE 0225/0274 BODIES DID NOT MOVE. This file is additive and the pins prove it.
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha from pg_proc p
   where p.oid = 'clara.admit_trade_invoice_work(uuid,uuid,text,text,jsonb,jsonb,text,jsonb,text)'::regprocedure;
  if v_sha is distinct from 'c1693503fa0221de53af2e1ddfe716c2baa9c3e3d82c14e02007a04c45d70f5c' then
    raise exception '#1007 tail: clara.admit_trade_invoice_work MOVED while this file applied (got %) -- it must not have', v_sha
      using errcode='CLR10';
  end if;
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha from pg_proc p
   where p.oid = 'clara._trade_invoice_resolve_party(uuid,text,jsonb)'::regprocedure;
  if v_sha is distinct from 'be2df90e5899a1692682d843e6967be828952b3e42f3b09fe317437677db7cf8' then
    raise exception '#1007 tail: clara._trade_invoice_resolve_party MOVED while this file applied (got %)', v_sha
      using errcode='CLR10';
  end if;

  raise notice '#1007 tail OK: the duplicate probe and its internals stand, the human probe is clara_authenticated''s alone, the internals are ungranted, and 0225''s admission door and 0274''s party resolver are byte-identical to their pinned pre-images.';
end
$t1007_tail$;
