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
-- THIS FILE IS PURELY ADDITIVE. It creates one table, four ungranted internals, two probe reads
-- (the human one and its actor-explicit runtime twin), one writer and one read of what it wrote.
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
-- TWO DOORS FOR ONE ANSWER, AND WHY THE SECOND IS NOT A SECOND AUTHORITY MODEL. The human door
-- takes its firm and actor FROM THE SESSION — 0219:343-347's rule, verbatim: "a SECURITY DEFINER
-- function with a caller-supplied tenant parameter is the cross-tenant-oracle shape". The chat
-- lane cannot use it, and that is MEASURED rather than assumed: `packages/runtime/lib/pools.mjs`
-- (setupSql) issues only `set role clara_runtime` plus two timeouts, and `lib/authz.mjs`'s
-- `authenticate()` resolves the principal in JS WITHOUT setting `request.jwt.claims`, so
-- `clara._human_ctx` raises CLR04 on every clara_runtime connection. The twin is therefore
-- actor-explicit in the shape this lane already has one — `clara.create_accrual_adjustment_for`
-- (0222) is the house precedent — and it carries `clara.admit_trade_invoice_work`'s OWN authority
-- preamble, arm for arm and token for token, so the two can never disagree and neither is an
-- existence oracle. BOTH delegate to ONE ungranted matcher, so the form and the chat lane can
-- never be shown different answers.
--
-- THE "RECORDED ANYWAY" RECORD IS WRITTEN BEFORE THE ADMISSION IT AUTHORISES, and the ordering is
-- the point rather than an accident. `withRuntime` is AUTOCOMMIT (pools.mjs; intakeRoutes.ts:102
-- states it), so the route's two calls are two transactions whichever way round they go. Writing
-- the acknowledgement FIRST makes the only possible inconsistency "a choice that led nowhere" — an
-- acknowledgement whose admission then refused, which no read ever surfaces because
-- `clara.get_trade_invoice_duplicate_ack` reaches it through an admitted Work. The other order
-- would make it "a knowing second recording that looks like an accident", which is precisely the
-- distinction the ticket exists to preserve.
--
-- SCOPE, VERBATIM FROM THE TICKET. Out of scope: refusing, blocking or auto-merging a suspected
-- duplicate; fuzzy matching on counterparty names or merging counterparty records; matching across
-- kinds, across clients, or against documents that were uploaded but never recorded;
-- settlement-time checks (#662) and credit notes; editing 0225, 0274, any frozen workflow body or
-- the blueprints.
--
-- REDO-SAFE (#957). Every statement is `create table if not exists` / `create or replace function`
-- / `create index if not exists`, or is guarded by a catalog probe, and the prestate accepts a
-- chain on which this file's own objects already exist (a
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
    raise notice '#1007 prestate: this file''s own objects are already present -- this is a REDO (#957) over its own effects, which create-or-replace and the if-not-exists guards make safe.';
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


-- ---------------------------------------------------------------------------------
-- (5) THE ACTOR-EXPLICIT AUTHORITY PREAMBLE, shared by the runtime twin and the acknowledgement
-- writer. It is `clara.admit_trade_invoice_work` step 2, ARM FOR ARM AND TOKEN FOR TOKEN
-- (0225:1110-1147), including the no-existence-oracle rule: an unknown client and a real client of
-- another firm leave with the SAME sentence. One copy, so the three doors can never disagree about
-- who may ask.
-- ---------------------------------------------------------------------------------
create or replace function clara._trade_invoice_actor_firm(p_client uuid, p_author uuid)
  returns uuid language plpgsql stable security definer set search_path = clara, pg_temp as $$
declare v_firm uuid; v_client_status text; v_role text; v_member_status text;
begin
  select c.firm_id, c.status into v_firm, v_client_status from clara.clients c where c.id = p_client;
  if v_firm is null then
    raise exception 'client not found in your firm' using errcode='CLR11',
      detail='{"reason":"client_not_found"}';
  end if;
  select m.role, m.status into v_role, v_member_status from clara.firm_memberships m
   where m.user_id = p_author and m.firm_id = v_firm
   order by (m.status = 'active') desc, m.created_at desc limit 1;
  if v_role is null then
    raise exception 'client not found in your firm' using errcode='CLR11',
      detail='{"reason":"client_not_found"}';
  end if;
  if v_member_status <> 'active' then
    raise exception 'the author is not an active member of this firm' using errcode='CLR04',
      detail='{"reason":"actor_not_active"}';
  end if;
  if clara.role_rank(v_role) < clara.role_rank('bookkeeper') then
    raise exception 'recording a trade invoice requires a bookkeeper or above'
      using errcode='CLR04', detail='{"reason":"insufficient_role"}';
  end if;
  if v_client_status <> 'active' then
    raise exception 'client is not active -- no new accounting work' using errcode='CLR10',
      detail='{"reason":"client_inactive"}';
  end if;
  return v_firm;
end $$;
revoke all on function clara._trade_invoice_actor_firm(uuid,uuid) from public;
comment on function clara._trade_invoice_actor_firm(uuid,uuid) is
  '#1007: clara.admit_trade_invoice_work''s own authority preamble, arm for arm and token for '
  'token, as the ONE copy the runtime twin of the probe and the acknowledgement writer share. '
  'Returns the client''s firm; raises the door''s own CLR11/CLR04/CLR10 otherwise, with no '
  'existence oracle. Ungranted to every application role.';

-- ---------------------------------------------------------------------------------
-- (6) THE RUNTIME TWIN OF THE PROBE. Actor-explicit, clara_runtime ONLY -- the lane
-- clara.admit_trade_invoice_work sits in, acting OBO a named human. Same matcher, same answer.
-- ---------------------------------------------------------------------------------
create or replace function clara.probe_trade_invoice_duplicates_for(p_client uuid, p_author uuid,
    p_kind text, p_particulars jsonb) returns jsonb
  language plpgsql stable security definer set search_path = clara, pg_temp as $$
begin
  perform clara._trade_invoice_actor_firm(p_client, p_author);
  return clara._trade_invoice_probe_core(p_client, p_kind, p_particulars);
end $$;
revoke all on function clara.probe_trade_invoice_duplicates_for(uuid,uuid,text,jsonb) from public;
grant execute on function clara.probe_trade_invoice_duplicates_for(uuid,uuid,text,jsonb) to clara_runtime;
comment on function clara.probe_trade_invoice_duplicates_for(uuid,uuid,text,jsonb) is
  '#1007: the runtime twin of clara.probe_trade_invoice_duplicates, acting OBO the named '
  'p_author -- clara_runtime ONLY. It exists because a clara_runtime connection carries no JWT '
  'claims (packages/runtime/lib/pools.mjs), so clara._human_ctx cannot answer for it. Same '
  'ungranted matcher, so the chat lane and the form are never shown different answers.';

-- ---------------------------------------------------------------------------------
-- (7) THE "RECORDED ANYWAY" RECORD. Append-only, beside the invoice rather than inside it: the
-- invoice row is 0225's, admits ZERO updates, and is written by a door this file does not touch.
--
-- THE IDENTITY IS THE INTENT KEY, not the invoice id, and that is what makes the ordering in the
-- header possible: the acknowledgement is written BEFORE the admission it authorises, so at write
-- time no invoice exists yet. `clara.accounting_work`'s own uq_accounting_work_intent makes
-- (firm, client, intent_key) the identity of ONE recording attempt, so the join from a Work back
-- to its acknowledgement is exact.
--
-- AND THE ROW IS RE-READ, NEVER ECHOED. `shown` stores what THIS DATABASE holds about each
-- acknowledged invoice, not what the caller claimed about it, so a reviewer is reading the books
-- rather than a browser's memory of them.
-- ---------------------------------------------------------------------------------
create table if not exists clara.trade_invoice_duplicate_acks (
  id               uuid        primary key default gen_random_uuid(),
  firm_id          uuid        not null references clara.firms(id),
  client_id        uuid        not null,
  intent_key       text        not null check (intent_key !~ '^\s*$'),
  kind             text        not null check (kind in ('sales_invoice','supplier_bill')),
  counterparty_id  uuid        not null,
  reference        text        check (reference is null or btrim(reference) <> ''),
  document_date    date        not null,
  total_cents      bigint      not null check (total_cents > 0),
  -- WHAT THE PERSON WAS SHOWN, re-read from clara.trade_invoices at acknowledgement time.
  shown            jsonb       not null check (jsonb_typeof(shown) = 'array'
                                 and jsonb_array_length(shown) > 0),
  -- THE IDENTITY OF ONE ACKNOWLEDGING ACT: this attempt's particulars plus the sorted ids that
  -- were shown. A lost-response retry re-sends the identical act and converges; a person who
  -- changed the figures after a refusal and was shown a DIFFERENT set appends a truer second row,
  -- instead of leaving the first one standing as a record of a choice they did not make.
  ack_digest       text        not null check (ack_digest ~ '^[0-9a-f]{64}$'),
  acknowledged_by  uuid        not null references clara.users(id),
  acknowledged_at  timestamptz not null default now(),
  constraint fk_ti_dup_acks_client foreign key (client_id, firm_id)
    references clara.clients(id, firm_id),
  constraint fk_ti_dup_acks_counterparty foreign key (counterparty_id, firm_id, client_id)
    references clara.counterparties(id, firm_id, client_id),
  constraint uq_ti_dup_acks unique (firm_id, client_id, intent_key, ack_digest)
);
comment on table clara.trade_invoice_duplicate_acks is
  '#1007: ONE record of a person who was warned that a trade invoice looked like one already '
  'recorded and chose to record it anyway -- who, when, and which earlier invoices were shown, '
  're-read from the books rather than echoed from the browser. Keyed on the recording attempt''s '
  'intent key, because it is written BEFORE the admission it authorises. Append-only; no '
  'application role holds DML.';

create index if not exists ix_ti_dup_acks_intent
  on clara.trade_invoice_duplicate_acks(firm_id, client_id, intent_key, acknowledged_at desc);

alter table clara.trade_invoice_duplicate_acks enable row level security;
alter table clara.trade_invoice_duplicate_acks force row level security;
drop policy if exists p_ti_dup_acks_owner on clara.trade_invoice_duplicate_acks;
create policy p_ti_dup_acks_owner on clara.trade_invoice_duplicate_acks
  for all to clara_fn_owner using (true) with check (true);
drop policy if exists p_ti_dup_acks_read on clara.trade_invoice_duplicate_acks;
create policy p_ti_dup_acks_read on clara.trade_invoice_duplicate_acks
  for select to clara_authenticated using (firm_id = clara.jwt_firm());
grant select on clara.trade_invoice_duplicate_acks to clara_authenticated;

drop trigger if exists t_ti_dup_acks_append_only on clara.trade_invoice_duplicate_acks;
create trigger t_ti_dup_acks_append_only
  before update or delete on clara.trade_invoice_duplicate_acks
  for each row execute function clara._tf_append_only();
drop trigger if exists t_ti_dup_acks_no_truncate on clara.trade_invoice_duplicate_acks;
create trigger t_ti_dup_acks_no_truncate before truncate
  on clara.trade_invoice_duplicate_acks for each statement execute function clara._tf_no_truncate();

-- ---------------------------------------------------------------------------------
-- (8) THE WRITER. A runtime act OBO a named human -- clara.admit_trade_invoice_work's own
-- authority model, because it authorises that door's own act and a second model would be a second
-- answer to "who chose this". It writes ONE row and nothing else; it admits nothing, enqueues
-- nothing and refuses no duplicate.
-- ---------------------------------------------------------------------------------
create or replace function clara.record_trade_invoice_duplicate_ack(p_client uuid, p_author uuid,
    p_intent_key text, p_kind text, p_particulars jsonb, p_shown jsonb) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare
  v_firm uuid; v_kind text; v_party jsonb; v_cp uuid; v_reference text;
  v_document_date date; v_total bigint; v_ids uuid[]; v_shown jsonb; v_digest text;
  v_ack uuid; v_replayed boolean := false; v_bad text; v_n int;
begin
  if p_intent_key is null or p_intent_key ~ '^\s*$' then
    raise exception 'an acknowledgement rides the intent key of the recording it authorises'
      using errcode='CLR10', detail='{"reason":"invalid_intent_key","constraint":"nonempty"}';
  end if;
  v_firm := clara._trade_invoice_actor_firm(p_client, p_author);
  if p_particulars is null or jsonb_typeof(p_particulars) <> 'object' then
    raise exception 'an acknowledgement needs the particulars it is about' using errcode='CLR10',
      detail='{"reason":"invalid_particulars"}';
  end if;
  v_kind := btrim(coalesce(p_kind, ''));
  if v_kind not in ('sales_invoice','supplier_bill') then
    raise exception '% is not a trade-invoice kind', coalesce(nullif(v_kind,''),'(none)')
      using errcode='CLR10', detail='{"reason":"invalid_kind"}';
  end if;

  -- THE PARTY IS THE SAME ANSWER THE ADMISSION WILL GET, through the same resolver.
  v_party := clara._trade_invoice_resolve_party(p_client, v_kind, p_particulars);
  v_cp := (v_party->>'counterparty_id')::uuid;
  v_reference := nullif(btrim(coalesce(p_particulars->>'reference','')),'');
  v_document_date := nullif(btrim(coalesce(p_particulars->>'document_date','')),'')::date;
  v_total := nullif(btrim(coalesce(p_particulars->>'total_cents','')),'')::numeric::bigint;
  if v_document_date is null or v_total is null then
    raise exception 'an acknowledgement records the document date and total it was shown against'
      using errcode='CLR10', detail='{"reason":"invalid_particulars","constraint":"document_date_and_total"}';
  end if;

  -- WHAT WAS SHOWN. An empty acknowledgement is not an acknowledgement, and an id this client's
  -- books do not hold is a caller mistake rather than something to store.
  if p_shown is null or jsonb_typeof(p_shown) <> 'array' or jsonb_array_length(p_shown) = 0 then
    raise exception 'an acknowledgement names the earlier invoices the person was shown'
      using errcode='CLR10', detail='{"reason":"nothing_acknowledged"}';
  end if;
  begin
    select array_agg(distinct s.value::uuid order by s.value::uuid) into v_ids
      from jsonb_array_elements_text(p_shown) s(value);
  exception when invalid_text_representation then
    raise exception 'an acknowledgement names earlier invoices by their own ids'
      using errcode='CLR10', detail='{"reason":"unknown_acknowledged_invoice"}';
  end;
  select count(*)::int into v_n from clara.trade_invoices ti
   where ti.id = any(v_ids) and ti.client_id = p_client and ti.kind = v_kind;
  if v_n <> array_length(v_ids, 1) then
    select (select string_agg(x::text, ',') from unnest(v_ids) x
             where not exists (select 1 from clara.trade_invoices ti
                                where ti.id = x and ti.client_id = p_client and ti.kind = v_kind))
      into v_bad;
    raise exception 'one of the acknowledged invoices (%) is not a % of this client', v_bad, v_kind
      using errcode='CLR10',
        detail=jsonb_build_object('reason','unknown_acknowledged_invoice','invoice_ids',v_bad)::text;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'invoice_id', ti.id, 'work_id', ti.work_id, 'reference', ti.reference,
           'document_date', to_char(ti.document_date,'YYYY-MM-DD'),
           'total_cents', ti.total_cents, 'recorded_by', ti.recorded_by)
         order by ti.document_date desc, ti.created_at desc, ti.id), '[]'::jsonb)
    into v_shown
    from clara.trade_invoices ti where ti.id = any(v_ids);

  v_digest := encode(clara._hash(jsonb_build_object(
    'kind', v_kind, 'counterparty_id', v_cp,
    'reference_key', clara._trade_invoice_reference_key(v_reference),
    'document_date', to_char(v_document_date,'YYYY-MM-DD'), 'total_cents', v_total,
    'shown', (select jsonb_agg(to_jsonb(x::text) order by x) from unnest(v_ids) x))), 'hex');

  insert into clara.trade_invoice_duplicate_acks(firm_id, client_id, intent_key, kind,
      counterparty_id, reference, document_date, total_cents, shown, ack_digest, acknowledged_by)
    values (v_firm, p_client, p_intent_key, v_kind, v_cp, v_reference, v_document_date, v_total,
      v_shown, v_digest, p_author)
    on conflict (firm_id, client_id, intent_key, ack_digest) do nothing
    returning id into v_ack;
  if v_ack is null then
    v_replayed := true;
    select a.id into v_ack from clara.trade_invoice_duplicate_acks a
     where a.firm_id = v_firm and a.client_id = p_client and a.intent_key = p_intent_key
       and a.ack_digest = v_digest;
  end if;

  perform clara._audit(v_firm, p_author, null, null, 'record_trade_invoice_duplicate_ack', null,
    jsonb_build_object('client', p_client, 'intent_key', p_intent_key, 'kind', v_kind,
      'counterparty_id', v_cp, 'shown', jsonb_array_length(v_shown), 'replayed', v_replayed));

  return jsonb_build_object('ack_id', v_ack, 'replayed', v_replayed,
    'intent_key', p_intent_key, 'counterparty_id', v_cp,
    'shown_count', jsonb_array_length(v_shown));
end $$;
revoke all on function clara.record_trade_invoice_duplicate_ack(uuid,uuid,text,text,jsonb,jsonb) from public;
grant execute on function clara.record_trade_invoice_duplicate_ack(uuid,uuid,text,text,jsonb,jsonb) to clara_runtime;
comment on function clara.record_trade_invoice_duplicate_ack(uuid,uuid,text,text,jsonb,jsonb) is
  '#1007: record that the named author was warned this trade invoice looked like one already '
  'recorded and chose to record it anyway. clara_runtime ONLY, OBO p_author -- the lane '
  'clara.admit_trade_invoice_work sits in. Called BEFORE that door, under the SAME intent key. '
  'Idempotent on (firm, client, intent_key, the act''s own digest). It admits nothing and refuses '
  'no duplicate.';

-- ---------------------------------------------------------------------------------
-- (9) WHAT A REVIEWER READS AFTERWARDS. Viewer floor, firm-scoped, keyed by the Work -- the
-- surface that lets somebody tell a knowing second recording from an accident. clara_authenticated
-- ONLY: the machine lane has nothing to do with it and cannot satisfy clara._human_ctx anyway.
-- ---------------------------------------------------------------------------------
create or replace function clara.get_trade_invoice_duplicate_ack(p_work uuid) returns jsonb
  language plpgsql stable security definer set search_path = clara, pg_temp as $$
declare c record; v_out jsonb;
begin
  c := clara._human_ctx(clara.role_rank('viewer'));
  select jsonb_build_object(
      'ack_id', a.id,
      'work_id', w.id,
      'intent_key', a.intent_key,
      'kind', a.kind,
      'counterparty_id', a.counterparty_id,
      'reference', a.reference,
      'document_date', to_char(a.document_date,'YYYY-MM-DD'),
      'total_cents', a.total_cents,
      'acknowledged_by', a.acknowledged_by,
      'acknowledged_by_name', u.display_name,
      'acknowledged_at', a.acknowledged_at,
      'shown', a.shown)
    into v_out
    from clara.accounting_work w
    join clara.trade_invoice_duplicate_acks a
      on a.firm_id = w.firm_id and a.client_id = w.client_id and a.intent_key = w.intent_key
    left join clara.users u on u.id = a.acknowledged_by
   where w.id = p_work and w.firm_id = c.firm
   order by a.acknowledged_at desc, a.id desc
   limit 1;
  return v_out;
end $$;
revoke all on function clara.get_trade_invoice_duplicate_ack(uuid) from public;
grant execute on function clara.get_trade_invoice_duplicate_ack(uuid) to clara_authenticated;
comment on function clara.get_trade_invoice_duplicate_ack(uuid) is
  '#1007: the acknowledgement this Work was admitted under -- who was warned, when, and which '
  'earlier invoices they were shown -- or NULL when nobody was warned. Viewer floor, firm-scoped. '
  'Reached through the Work, so an acknowledgement whose admission then refused is never surfaced '
  'as a recording that happened.';

reset role;

-- =====================================================================================
-- TAIL. Re-reads the live catalog rather than trusting the statements above ran as written.
-- =====================================================================================
do $t1007_tail$
declare v_sha text; v_sig text; v_n int;
begin
  -- (T.1) THE EIGHT BODIES EXIST, each exactly once.
  select count(*)::int into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'clara' and p.proname in ('_trade_invoice_reference_key',
     '_trade_invoice_duplicate_matches', '_trade_invoice_probe_core',
     '_trade_invoice_actor_firm', 'probe_trade_invoice_duplicates',
     'probe_trade_invoice_duplicates_for', 'record_trade_invoice_duplicate_ack',
     'get_trade_invoice_duplicate_ack');
  if v_n <> 8 then
    raise exception '#1007 tail: expected exactly 8 new bodies, found %', v_n using errcode='CLR10';
  end if;

  -- (T.1b) THE ACKNOWLEDGEMENT TABLE IS APPEND-ONLY AND ROW-SECURED, re-read from the catalog
  -- rather than trusted to the statements above: RLS enabled AND forced (so even the owner is
  -- filtered), the two belts installed, and clara_authenticated holding SELECT and nothing else.
  -- A DML grant here would let a browser session write its own acknowledgement.
  if to_regclass('clara.trade_invoice_duplicate_acks') is null then
    raise exception '#1007 tail: clara.trade_invoice_duplicate_acks is absent' using errcode='CLR10';
  end if;
  if not exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
                  where n.nspname='clara' and c.relname='trade_invoice_duplicate_acks'
                    and c.relrowsecurity and c.relforcerowsecurity) then
    raise exception '#1007 tail: row level security on clara.trade_invoice_duplicate_acks is not enabled AND forced'
      using errcode='CLR10';
  end if;
  select count(*)::int into v_n from pg_trigger
   where tgrelid = 'clara.trade_invoice_duplicate_acks'::regclass and not tgisinternal;
  if v_n <> 2 then
    raise exception '#1007 tail: expected the append-only and no-truncate belts on clara.trade_invoice_duplicate_acks, found % trigger(s)', v_n
      using errcode='CLR10';
  end if;
  if not has_table_privilege('clara_authenticated', 'clara.trade_invoice_duplicate_acks', 'SELECT')
     or has_table_privilege('clara_authenticated', 'clara.trade_invoice_duplicate_acks', 'INSERT')
     or has_table_privilege('clara_authenticated', 'clara.trade_invoice_duplicate_acks', 'UPDATE')
     or has_table_privilege('clara_authenticated', 'clara.trade_invoice_duplicate_acks', 'DELETE') then
    raise exception '#1007 tail: clara_authenticated must hold SELECT on the acknowledgements and no DML -- the choice is written by the runtime door alone'
      using errcode='CLR10';
  end if;

  -- (T.2) THE GRANTS. The session-scoped probe is clara_authenticated's, the actor-explicit twin
  -- is clara_runtime's, and the four internals are nobody's.
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
  -- THE TWIN IS THE MACHINE LANE'S ALONE, and for the mirror-image reason: a caller-supplied
  -- actor on a session-authenticated role is the cross-tenant-oracle shape 0219:343-347 names.
  if not has_function_privilege('clara_runtime',
        'clara.probe_trade_invoice_duplicates_for(uuid,uuid,text,jsonb)', 'EXECUTE') then
    raise exception '#1007 tail: the runtime twin is not granted to clara_runtime -- the chat lane could not ask'
      using errcode='CLR10';
  end if;
  if has_function_privilege('clara_authenticated',
        'clara.probe_trade_invoice_duplicates_for(uuid,uuid,text,jsonb)', 'EXECUTE')
     or has_function_privilege('clara_agent_ro',
        'clara.probe_trade_invoice_duplicates_for(uuid,uuid,text,jsonb)', 'EXECUTE') then
    raise exception '#1007 tail: the ACTOR-EXPLICIT twin is granted to a session-authenticated or agent role -- a caller-supplied actor there is the cross-tenant-oracle shape'
      using errcode='CLR10';
  end if;
  -- THE WRITER IS THE MACHINE LANE'S ALONE (it authorises clara.admit_trade_invoice_work's own
  -- act, so it carries that door's authority model), and the read of it is the human lane's alone.
  if not has_function_privilege('clara_runtime',
        'clara.record_trade_invoice_duplicate_ack(uuid,uuid,text,text,jsonb,jsonb)', 'EXECUTE')
     or has_function_privilege('clara_authenticated',
        'clara.record_trade_invoice_duplicate_ack(uuid,uuid,text,text,jsonb,jsonb)', 'EXECUTE')
     or has_function_privilege('clara_agent_ro',
        'clara.record_trade_invoice_duplicate_ack(uuid,uuid,text,text,jsonb,jsonb)', 'EXECUTE') then
    raise exception '#1007 tail: the acknowledgement writer must be clara_runtime''s alone'
      using errcode='CLR10';
  end if;
  if not has_function_privilege('clara_authenticated',
        'clara.get_trade_invoice_duplicate_ack(uuid)', 'EXECUTE')
     or has_function_privilege('clara_runtime', 'clara.get_trade_invoice_duplicate_ack(uuid)', 'EXECUTE')
     or has_function_privilege('clara_agent_ro', 'clara.get_trade_invoice_duplicate_ack(uuid)', 'EXECUTE') then
    raise exception '#1007 tail: the acknowledgement read must be clara_authenticated''s alone -- it is _human_ctx-gated and a machine lane could not satisfy it anyway'
      using errcode='CLR10';
  end if;
  foreach v_sig in array array['clara._trade_invoice_reference_key(text)',
      'clara._trade_invoice_duplicate_matches(uuid,text,uuid,text,date,bigint)',
      'clara._trade_invoice_probe_core(uuid,text,jsonb)',
      'clara._trade_invoice_actor_firm(uuid,uuid)'] loop
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

  raise notice '#1007 tail OK: the two probe doors, the acknowledgement writer and its read stand on four ungranted internals; the session-scoped probe and the acknowledgement read are clara_authenticated''s alone, the actor-explicit twin and the writer are clara_runtime''s alone, the acknowledgements are append-only with SELECT and no DML for the browser lane, and 0225''s admission door and 0274''s party resolver are byte-identical to their pinned pre-images.';
end
$t1007_tail$;
