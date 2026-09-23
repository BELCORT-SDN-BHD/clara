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
-- FOR #1007 THIS FILE IS PURELY ADDITIVE. It creates one table, four ungranted internals, two
-- probe reads (the human one and its actor-explicit runtime twin), one writer and one read of what
-- it wrote. It recuts NOTHING of 0225's: `clara.admit_trade_invoice_work`'s replay semantics, its
-- refusal ladder and the posting core are untouched, and the tail re-reads the door to prove this
-- file moved it not at all. The ONE body it does recut is 0274's party resolver, for #982's fix
-- round and for the reason stated below. A UNIQUE CONSTRAINT ON `reference` WOULD BE WRONG AND IS
-- NOT ADDED: the column is nullable and suppliers legitimately reuse numbers (0225 section A says
-- so).
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
-- THIS FILE ALSO CARRIES THE FIX ROUND'S ONE RECUT OF 0274'S BODY (#982R2, section 10), AND THE
-- REASON IS MECHANICAL. The supported re-apply path for an unmerged migration
-- (`CLARA_MIGRATION_REDO`, "Redo (#957)" in packages/db/README.md) takes the HIGHEST APPLIED
-- VERSION ONLY, so that nothing built on top of a file is silently invalidated — and 0275 sits on
-- top of 0274 on every lane database. Editing 0274 in place would mean the hand procedure #957
-- exists to abolish. 0272 states the same reason for not editing 0244. So the ONE body #982's
-- review round asked to change is recut here, by the only file on this lane that can still be
-- re-applied, and 0274 stays byte-frozen with its ledger row intact. The recut keeps 0274's
-- `#982` marker (0274's own tail reads it) and adds `#982R2`, which is what this file's prestate
-- reads to tell a redo from a first apply.
--
-- REDO-SAFE (#957). Every statement is `create table if not exists` / `create or replace function`
-- / `create index if not exists`, or is guarded by a catalog probe, and the prestate accepts a
-- chain on which this file's own objects already exist (a
-- `CLARA_MIGRATION_REDO=0275_trade_invoice_duplicate_probe` re-run over its own effects).
-- =====================================================================================

do $t1007_pre$
declare
  v_sha text;
  v_src text;
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
  -- TWO-VALUED BY CONSTRUCTION, and both values measured: 0274's post-image on a first apply,
  -- and this file's own recut (section 10, marker `#982R2`) on a redo. The marker branch is the
  -- supported #957 redo, never a drift exemption -- anything else still raises.
  select p.prosrc into v_src from pg_proc p
   where p.oid = 'clara._trade_invoice_resolve_party(uuid,text,jsonb)'::regprocedure;
  v_sha := encode(sha256(convert_to(v_src,'UTF8')),'hex');
  if v_sha is distinct from 'be2df90e5899a1692682d843e6967be828952b3e42f3b09fe317437677db7cf8' then
    if position('#982R2' in v_src) > 0 then
      raise notice '#1007 prestate: clara._trade_invoice_resolve_party already carries this file''s own #982R2 recut -- this is a REDO (#957) over this file''s own effects, which create-or-replace makes safe.';
    else
      raise exception '#1007 prestate: clara._trade_invoice_resolve_party has DRIFTED (measured %, expected be2df90e5899a1692682d843e6967be828952b3e42f3b09fe317437677db7cf8 -- 0274''s post-image) -- the probe resolves its party through it and cannot vouch for a body it does not recognise', v_sha
        using errcode='CLR10';
    end if;
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
--
-- "ONE COUNTERPARTY" MEANS THE MERGED FAMILY, NOT ONE ROW (fix round, ADV-1007-2). Merging a
-- duplicate vendor record is an ordinary bookkeeping act with a shipped door, and
-- `clara.merge_counterparties` (0011) rewrites no history: it stamps `merged_into` on the absorbed
-- row and leaves every `clara.trade_invoices.counterparty_id` exactly as it was recorded. The
-- resolver, meanwhile, canonicalises what the caller submitted (0149's rule), so `p_counterparty`
-- is always the SURVIVOR. The first cut compared that survivor against the STORED id and was
-- therefore blind across a merge: driven on the lane database, a bill recorded against the
-- absorbed party stopped warning the moment the merge landed, and the same bill number was then
-- recorded a second time with no warning at all — the doubled payable this file exists to prevent.
-- So the filter walks the merge tree DOWN from the survivor (`ix_counterparties_merged_into`
-- indexes exactly that edge) and compares against the family, which is one row in every case where
-- nothing was ever merged. It is `p_counterparty` PLUS what was merged into it: a caller that
-- hands in a non-canonical id still gets its own sub-family, never somebody else's.
-- ---------------------------------------------------------------------------------
create or replace function clara._trade_invoice_duplicate_matches(p_client uuid, p_kind text,
    p_counterparty uuid, p_reference text, p_document_date date, p_total_cents bigint)
  returns jsonb language sql stable security definer set search_path = clara, pg_temp as $$
  with recursive family as (
    select p_counterparty as id
    union
    select cp.id
      from clara.counterparties cp
      join family f on cp.merged_into = f.id
     where cp.client_id = p_client
  ),
  candidate as (
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
       and ti.counterparty_id in (select f.id from family f)
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
  'of THIS client, THIS kind and THIS counterparty (including every party merged into it) look '
  'like the one about to be recorded, on '
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
declare c record; v_firm uuid; v_client_status text;
begin
  c := clara._human_ctx(clara.role_rank('bookkeeper'));
  select cl.firm_id, cl.status into v_firm, v_client_status from clara.clients cl
   where cl.id = p_client and cl.firm_id = c.firm;
  if v_firm is null then
    raise exception 'client not found in your firm' using errcode='CLR11',
      detail='{"reason":"client_not_found"}';
  end if;
  -- THE RECORDING STEP'S OWN LAST ARM (fix round, ADV-1007-3). The first cut stopped at "this
  -- client is in my firm", so on an ARCHIVED client the form warned about a recording the
  -- admission then refused, and the two entrances disagreed about the same question -- measured
  -- on the lane database, where the twin raised `client_inactive` and this door answered
  -- normally. The token and the sentence are `clara.admit_trade_invoice_work`'s own, through
  -- `clara._trade_invoice_actor_firm`, which is the whole point: a probe is the step BEFORE a
  -- recording, and it may not be reachable where the recording is not.
  if v_client_status <> 'active' then
    raise exception 'client is not active -- no new accounting work' using errcode='CLR10',
      detail='{"reason":"client_inactive"}';
  end if;
  return clara._trade_invoice_probe_core(p_client, p_kind, p_particulars);
end $$;
revoke all on function clara.probe_trade_invoice_duplicates(uuid,text,jsonb) from public;
grant execute on function clara.probe_trade_invoice_duplicates(uuid,text,jsonb) to clara_authenticated;
comment on function clara.probe_trade_invoice_duplicates(uuid,text,jsonb) is
  '#1007: which already-recorded invoices of this client look like the one about to be recorded. '
  'Bookkeeper floor, firm AND actor from the session; writes nothing and takes no row lock. It '
  'warns -- it never refuses on a duplicate, though it does answer the recording step''s own '
  'authority refusals, client_inactive included, so the form and the chat lane never disagree.';


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
  if nullif(btrim(coalesce(p_particulars->>'document_date','')),'') is null
     or nullif(btrim(coalesce(p_particulars->>'total_cents','')),'') is null then
    raise exception 'an acknowledgement records the document date and total it was shown against'
      using errcode='CLR10', detail='{"reason":"invalid_particulars","constraint":"document_date_and_total"}';
  end if;
  -- THE TWO SHAPES THE COLUMN CHECKS WOULD OTHERWISE ANSWER FOR (fix round, ADV-1007-4), restated
  -- here with `clara._assert_trade_invoice_basis`'s OWN tokens and sentences, word for word. This
  -- writer restates every other guard by name, and it is the door the successor contract hands the
  -- chat lane -- and the route calls it BEFORE the admission, so an untyped raise here reaches a
  -- caller in place of the door's own refusal. Measured on the lane database: a zero total left as
  -- a bare `23514 ... trade_invoice_duplicate_acks_total_cents_check`, and an unreadable document
  -- date as `22007`. The CHECK constraints stay: they are the belt, not the message.
  begin
    v_document_date := (p_particulars->>'document_date')::date;
  exception when others then
    raise exception 'a trade invoice carries the date the document itself states'
      using errcode='CLR10',
        detail='{"reason":"invalid_due_date","field":"document_date","constraint":"date"}';
  end;
  begin
    v_total := (p_particulars->>'total_cents')::numeric::bigint;
  exception when others then
    raise exception 'a trade invoice states its total in whole sen' using errcode='CLR10',
      detail='{"reason":"invalid_total","field":"total_cents","constraint":"integer"}';
  end;
  if (p_particulars->>'total_cents')::numeric <> v_total then
    raise exception 'a trade invoice states its total in whole sen, not a fraction of one'
      using errcode='CLR10',
        detail='{"reason":"invalid_total","field":"total_cents","constraint":"integer"}';
  end if;
  if v_total <= 0 then
    raise exception 'a trade invoice states a positive total; a credit is not a negative invoice'
      using errcode='CLR10',
        detail=jsonb_build_object('reason','invalid_total','field','total_cents',
          'total_cents',v_total,'constraint','positive')::text;
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
--
-- IT READS THE ACKNOWLEDGEMENT THIS RECORDING RODE, NOT MERELY ONE THAT SHARES ITS INTENT KEY.
-- The first cut of this body joined on (firm, client, intent_key) alone and took the newest row,
-- which was wrong in the one direction that matters. The writer is idempotent on
-- (firm, client, intent_key, ack_digest) and therefore APPENDS a second row for a second act under
-- one key -- deliberately -- and the route writes an acknowledgement BEFORE an admission that may
-- then refuse. Driven on the lane database (`p1007.ack.rode_this_recording`): after a recording of
-- RM 1,060.00, an edited resubmit under the same key acknowledged RM 9,999.00 and named THIS
-- Work's own invoice as the earlier document; the admission refused with `intent_payload_conflict`
-- and the reviewer's read then answered the acknowledgement that belonged to nothing.
--
-- SO THE JOIN IS NARROWED BY WHAT THE WORK ACTUALLY RECORDED, through its own trade-invoice row:
--   · the SAME kind, counterparty, document date and total in sen, and the same document number
--     under this lane's ONE normalisation (a number retyped `ack 0001` against a recorded
--     `ACK-0001` is the same number, which is exactly what the acknowledgement's own digest says);
--   · and written BEFORE the Work was admitted, because an acknowledgement a recording could not
--     have ridden is not the record of that recording's choice.
-- Between two acknowledgements the admission COULD have ridden (the same figures, a different set
-- of earlier invoices shown), the LAST one before the admission is the one it rode.
--
-- A Work with no trade-invoice row of its own -- another lane's Work that happens to carry the
-- same intent key -- now answers NULL rather than a trade-invoice acknowledgement, because the
-- join has nothing to stand on.
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
    join clara.trade_invoices ti on ti.work_id = w.id
    join clara.trade_invoice_duplicate_acks a
      on a.firm_id = w.firm_id and a.client_id = w.client_id and a.intent_key = w.intent_key
     and a.kind = ti.kind
     and a.counterparty_id = ti.counterparty_id
     and a.document_date = ti.document_date
     and a.total_cents = ti.total_cents
     and clara._trade_invoice_reference_key(a.reference)
         is not distinct from clara._trade_invoice_reference_key(ti.reference)
     and a.acknowledged_at <= w.created_at
    left join clara.users u on u.id = a.acknowledged_by
   where w.id = p_work and w.firm_id = c.firm
   -- THE LAST ACKNOWLEDGEMENT THE ADMISSION COULD HAVE RIDDEN, then a CONTENT tie-break rather
   -- than a random primary key: two acknowledgements can share `acknowledged_at` to the
   -- microsecond (measured: two real connections did), and a reviewer's read must not answer
   -- differently from one call to the next.
   order by a.acknowledged_at desc, a.ack_digest desc, a.id desc
   limit 1;
  return v_out;
end $$;
revoke all on function clara.get_trade_invoice_duplicate_ack(uuid) from public;
grant execute on function clara.get_trade_invoice_duplicate_ack(uuid) to clara_authenticated;
comment on function clara.get_trade_invoice_duplicate_ack(uuid) is
  '#1007: the acknowledgement this Work was admitted under -- who was warned, when, and which '
  'earlier invoices they were shown -- or NULL when nobody was warned. Viewer floor, firm-scoped. '
  'Reached through the Work AND through what that Work actually recorded (same kind, counterparty, '
  'normalised document number, document date and total, acknowledged before the admission), so a '
  'later choice under the same intent key -- one whose admission refused -- is never read in its '
  'place.';

-- ---------------------------------------------------------------------------------
-- (10) #982's FIX ROUND: THE ONE RECUT OF 0274'S PARTY RESOLVER (#982R2).
--
-- WHY IT IS HERE AND NOT IN 0274: see this file's header. `CLARA_MIGRATION_REDO` re-applies the
-- HIGHEST applied version only, and 0275 sits above 0274 on every lane database, so 0274 is
-- byte-frozen and this file is the one that can still be re-applied.
--
-- WHAT CHANGES, and nothing else does. Sections (a) NAMED BY ID, (b1) the registration arm, (b2)
-- the TIN count, (b3) the identifier conflict, the one-TIN-hit resolution, the name/alias
-- candidate set, `party_unresolved` and the NAME branch's `party_ambiguous` are 0274's and 0225's,
-- carried over BYTE FOR BYTE -- the name branch in particular keeps 0225's detail shape exactly,
-- which is #982's own AC4. The single changed arm is `v_tin_hits > 1`, and its reason is written
-- at the arm.
--
-- THE POSTURE IS 0225'S, unchanged and re-asserted in the tail: owned by `clara_fn_owner`,
-- SECURITY DEFINER, `set search_path = clara, pg_temp`, `stable`, and granted to NOBODY.
-- ---------------------------------------------------------------------------------
create or replace function clara._trade_invoice_resolve_party(p_client uuid, p_kind text, p_particulars jsonb)
  returns jsonb language plpgsql stable security definer set search_path = clara, pg_temp as $$
declare
  v_want text; v_id uuid; v_canon uuid; v_row record; v_name text; v_name_n text;
  v_reg text; v_reg_n text; v_tin text; v_tin_n text; v_n int; v_candidates jsonb;
  v_reg_row record; v_reg_hit boolean := false;
  v_tin_row record; v_tin_hits int := 0;
  -- #982R2 (fix round, ADV-982-1): the parties the NAME reaches, read before the TIN arm may
  -- refuse, so a shared TIN never answers with a list the document's own name is missing from.
  v_name_ids uuid[];
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

  -- (b3) THE IDENTIFIER CONFLICT (#982 AC3, owner's ruling 2026-09-20: "when a TIN and a
  -- registration number point at two different live counterparties Clara stops and lets the
  -- person choose"). The test is on the REGISTRATION-matched row itself: if it carries the
  -- submitted TIN, the two identifiers agree on it and it is the only row satisfying BOTH, so it
  -- resolves even when other live parties happen to share that TIN. If it does not, and some
  -- OTHER live party does, the document's two identifiers disagree and no preference between
  -- them is Clara's to take.
  --
  -- A TIN that matched NOTHING is not a conflict: the registration number is then the only
  -- identifier that reached anybody, and 0225's outcome for that submission is unchanged (AC4).
  --
  -- THE TEST IS NESTED, NOT CONJOINED, on purpose: PostgreSQL does not promise to short-circuit
  -- `and`, and reading `v_reg_row.tin` when the registration arm never assigned it raises 55000
  -- ("record is not assigned yet") on every submission that carries no registration number.
  -- Measured, not feared: the conjoined first cut turned p982.tin.resolves red that way.
  if v_reg_hit and v_tin_n is not null and v_tin_hits > 0 then
   if lower(regexp_replace(coalesce(v_reg_row.tin,''),'[^a-zA-Z0-9]','','g')) is distinct from v_tin_n then
    v_candidates := jsonb_build_array(jsonb_build_object(
      'counterparty_id', v_reg_row.id, 'name', v_reg_row.name,
      'registration_no', v_reg_row.registration_no, 'tin', v_reg_row.tin,
      'matched_on', 'registration'));
    select v_candidates || coalesce(jsonb_agg(jsonb_build_object(
             'counterparty_id', cp.id, 'name', cp.name, 'registration_no', cp.registration_no,
             'tin', cp.tin, 'matched_on', 'tin') order by cp.name, cp.id), '[]'::jsonb)
      into v_candidates
      from clara.counterparties cp
     where cp.client_id = p_client and cp.kind = v_want
       and cp.merged_into is null and cp.retired_at is null
       and cp.tin is not null
       and lower(regexp_replace(cp.tin,'[^a-zA-Z0-9]','','g')) = v_tin_n;
    raise exception 'the registration number (%) and the tax identification number (%) on this document name different live %s of this client; say which one',
      v_reg, v_tin, v_want
      using errcode='CLR10',
        detail=jsonb_build_object('reason','party_identifier_conflict','registration_no',v_reg,
          'tin',v_tin,'expected_counterparty_kind',v_want,'candidates',v_candidates)::text;
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
  if v_tin_hits > 1 then
    -- #982 AC2, as recut by the fix round (#982R2, ADV-982-1). Nothing constrains a TIN to one
    -- party, so a TIN several live parties hold is a data-entry fact a PERSON settles. What the
    -- first cut got wrong is what it settled it WITH: it refused on the TIN alone, before the name
    -- tier was ever consulted, so a document naming "Gamma Works" and carrying a TIN two OTHER
    -- vendors share was answered with a chooser offering those two and not Gamma Works -- a list
    -- naming two parties the document never mentions and omitting the one it does, for a
    -- submission that resolved cleanly before 0274. Measured on the lane database, not feared.
    --
    -- AN IDENTIFIER THAT ANSWERS WITH SEVERAL PARTIES HAS NOT IDENTIFIED ANYBODY, so it does not
    -- outrank the name printed beside it -- the estate's identifier-over-name tier law is about an
    -- identifier that ANSWERED. The name tier is therefore read here, and:
    --   - if it answers with exactly ONE party AND that party is one of the TIN's, the two
    --     identifiers AGREE on it and the document resolves -- the same rule (b3) applies to a
    --     registration-matched row that carries the submitted TIN;
    --   - otherwise Clara stops, and the chooser carries BOTH the parties the TIN reached and the
    --     parties the name reached, each saying WHICH identifier reached it. Never a silent pick:
    --     the owner's ruling of 2026-09-20 is that Clara never prefers an identifier silently.
    if v_name_n <> '' then
      select array_agg(distinct cp.id) into v_name_ids
        from clara.counterparties cp
        left join clara.counterparty_aliases al
          on al.counterparty_id = cp.id and al.retired_at is null
         and al.alias_normalized = v_name_n
       where cp.client_id = p_client and cp.kind = v_want
         and cp.merged_into is null and cp.retired_at is null
         and (cp.name_normalized = v_name_n or al.id is not null);
    end if;
    if array_length(v_name_ids, 1) = 1
       and exists (select 1 from clara.counterparties cp
                    where cp.id = v_name_ids[1] and cp.client_id = p_client and cp.kind = v_want
                      and cp.merged_into is null and cp.retired_at is null
                      and cp.tin is not null
                      and lower(regexp_replace(cp.tin,'[^a-zA-Z0-9]','','g')) = v_tin_n) then
      select cp.* into v_row from clara.counterparties cp where cp.id = v_name_ids[1];
      return jsonb_build_object('counterparty_id', v_row.id, 'counterparty_kind', v_row.kind,
        'name', v_row.name, 'payment_terms_days', v_row.payment_terms_days);
    end if;
    -- THE UNION, in the SAME candidate shape every other refusal on this lane carries, so a
    -- reader renders one candidate one way.
    select jsonb_agg(jsonb_build_object('counterparty_id', c.id, 'name', c.name,
             'registration_no', c.registration_no, 'tin', c.tin, 'matched_on', c.matched_on)
             order by c.name, c.id)
      into v_candidates
      from (select cp.id, cp.name, cp.registration_no, cp.tin,
                   case when cp.id = any(coalesce(v_name_ids, '{}'::uuid[]))
                        then 'tin_and_name' else 'tin' end as matched_on
              from clara.counterparties cp
             where cp.client_id = p_client and cp.kind = v_want
               and cp.merged_into is null and cp.retired_at is null
               and cp.tin is not null
               and lower(regexp_replace(cp.tin,'[^a-zA-Z0-9]','','g')) = v_tin_n
            union all
            select cp.id, cp.name, cp.registration_no, cp.tin, 'name'
              from clara.counterparties cp
             where cp.id = any(coalesce(v_name_ids, '{}'::uuid[]))
               and not (cp.tin is not null
                        and lower(regexp_replace(cp.tin,'[^a-zA-Z0-9]','','g')) = v_tin_n)) c;
    raise exception 'the tax identification number % is held by more than one live % of this client; say which one this document is about',
      v_tin, v_want
      using errcode='CLR10',
        detail=jsonb_build_object('reason','party_ambiguous','tin',v_tin,'matched_on','tin',
          'name',v_name,'expected_counterparty_kind',v_want,'candidates',v_candidates)::text;
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
do $t1007_tail$
declare v_sha text; v_src text; v_sig text; v_n int;
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

  -- (T.3) 0225'S ADMISSION DOOR DID NOT MOVE. Nothing here touches it, and the pin proves it.
  select encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') into v_sha from pg_proc p
   where p.oid = 'clara.admit_trade_invoice_work(uuid,uuid,text,text,jsonb,jsonb,text,jsonb,text)'::regprocedure;
  if v_sha is distinct from 'c1693503fa0221de53af2e1ddfe716c2baa9c3e3d82c14e02007a04c45d70f5c' then
    raise exception '#1007 tail: clara.admit_trade_invoice_work MOVED while this file applied (got %) -- it must not have', v_sha
      using errcode='CLR10';
  end if;
  -- (T.4) THE ONE BODY THIS FILE RECUTS IS THIS FILE'S, AND KEPT 0225's POSTURE. It exists
  -- exactly once, carries BOTH markers -- 0274's `#982` (0274's own tail reads it) and this
  -- file's `#982R2` -- and is still an ungranted internal.
  select count(*)::int into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'clara' and p.proname = '_trade_invoice_resolve_party';
  if v_n <> 1 then
    raise exception '#1007 tail: clara._trade_invoice_resolve_party has % bodies after the recut (expected exactly 1)', v_n
      using errcode='CLR10';
  end if;
  select p.prosrc into v_src from pg_proc p
   where p.oid = 'clara._trade_invoice_resolve_party(uuid,text,jsonb)'::regprocedure;
  if position('#982' in v_src) = 0 or position('#982R2' in v_src) = 0 then
    raise exception '#1007 tail: the live party resolver carries no #982/#982R2 marker -- the fix-round recut did not take'
      using errcode='CLR10';
  end if;
  select count(*)::int into v_n from pg_proc p
   where p.oid = 'clara._trade_invoice_resolve_party(uuid,text,jsonb)'::regprocedure
     and p.proowner = 'clara_fn_owner'::regrole
     and p.prosecdef and p.provolatile = 's'
     and p.proconfig @> array['search_path=clara, pg_temp'];
  if v_n <> 1 then
    raise exception '#1007 tail: the recut party resolver lost its owner / security definer / search_path / stable posture'
      using errcode='CLR10';
  end if;
  if has_function_privilege('clara_authenticated', 'clara._trade_invoice_resolve_party(uuid,text,jsonb)', 'EXECUTE')
     or has_function_privilege('clara_runtime', 'clara._trade_invoice_resolve_party(uuid,text,jsonb)', 'EXECUTE')
     or has_function_privilege('clara_agent_ro', 'clara._trade_invoice_resolve_party(uuid,text,jsonb)', 'EXECUTE') then
    raise exception '#1007 tail: the recut party resolver is granted to an application role -- it is an internal'
      using errcode='CLR10';
  end if;

  raise notice '#1007 tail OK: the two probe doors, the acknowledgement writer and its read stand on four ungranted internals; the session-scoped probe and the acknowledgement read are clara_authenticated''s alone, the actor-explicit twin and the writer are clara_runtime''s alone, the acknowledgements are append-only with SELECT and no DML for the browser lane, 0225''s admission door is byte-identical to its pinned pre-image, and 0274''s party resolver carries this file''s own #982R2 recut with 0225''s posture and no application-role grant.';
end
$t1007_tail$;
