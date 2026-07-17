-- 0004_governed_fns — Slice-2 governed DB core, part 3 of 3: the audited writers
-- (the ONLY sanctioned way to mutate the books), the assert/classify helpers, the
-- read functions, and the PUBLIC lockdown + EXECUTE grant matrix.
--
-- LANE SPLIT (design v2 §A / F3, empirically forced): a SECURITY DEFINER function
-- cannot see which role SET ROLE'd into it (current_user is the owner). So each
-- mutating operation has TWO entry points sharing one ungranted _core:
--   * the human entry (bare name) — granted to clara_authenticated ONLY; trusts
--     request.jwt.claims; firm = the sub's LIVE ACTIVE membership (live revocation).
--   * the wake entry (wake_* prefix) — granted to the wake role(s) ONLY; trusts
--     the wake credential; actor is ALWAYS the global agent user (never on_behalf_of).
-- There is NO approve/reverse wake entry — the agent can never sign (structural).
--
-- SIGNATURES conform to scratchpad/slice2-interface.md (the rig calls by NAMED
-- args). Where the interface lists a required p_op_key AFTER a defaulted param
-- (illegal in PG — a non-default cannot follow a default), p_op_key is defined
-- DEFAULT NULL in that exact position and the writer RAISEs CLR10 when it is null
-- (preserving "op_key required" semantics with a legal, name-exact signature).
--
-- GUARD-FIRST ORDER in every writer: authz -> firm-resolve -> reserve/dedupe ->
-- target-in-firm (CLR11) -> invariant guards -> work + audit. audit_log records
-- committed SUCCESSES only (a RAISE aborts the txn incl. the receipt — v2 §G).
-- State-changing writers return a jsonb receipt (stored in op_receipts so a retry
-- replays it byte-identically). Error codes per the 0002 header.

set role clara_fn_owner;

-- =====================================================================
-- A. INTERNAL HELPERS (ungranted — callable only inside definer writers).
-- =====================================================================

create function clara._hash(p jsonb) returns bytea
  language sql immutable as $$ select sha256(convert_to(p::text, 'UTF8')) $$;

create function clara._audit(p_firm uuid, p_actor uuid, p_obo uuid, p_wake_kind text,
    p_fn text, p_entry uuid, p_args jsonb) returns void
  language plpgsql security definer set search_path = clara, pg_temp as $$
begin
  insert into clara.audit_log(firm_id, actor, on_behalf_of, via_wake_kind, fn, entry_id, args, outcome)
  values (p_firm, p_actor, p_obo, p_wake_kind, p_fn, p_entry, p_args, 'ok');
end $$;

-- Reserve-before-effect (v2 §F/F11). Returns NULL to mean "proceed" (fresh
-- reservation); a non-null jsonb to mean "this is a retry — replay this result".
-- op_key reuse with different args -> CLR10.
create function clara._reserve_op(p_firm uuid, p_fn text, p_op_key text, p_req_hash bytea)
  returns jsonb language plpgsql security definer set search_path = clara, pg_temp as $$
declare v_hash bytea; v_result jsonb;
begin
  insert into clara.op_receipts(firm_id, fn, op_key, request_hash)
    values (p_firm, p_fn, p_op_key, p_req_hash)
    on conflict (firm_id, fn, op_key) do nothing;
  if found then return null; end if;
  select request_hash, result into v_hash, v_result
    from clara.op_receipts where firm_id = p_firm and fn = p_fn and op_key = p_op_key;
  if v_hash is distinct from p_req_hash then
    raise exception 'op_key reused with different args' using errcode = 'CLR10';
  end if;
  return coalesce(v_result, jsonb_build_object('pending', true));
end $$;

create function clara._finish_op(p_firm uuid, p_fn text, p_op_key text, p_result jsonb)
  returns jsonb language plpgsql security definer set search_path = clara, pg_temp as $$
begin
  update clara.op_receipts set result = p_result
    where firm_id = p_firm and fn = p_fn and op_key = p_op_key;
  return p_result;
end $$;

-- Amount-derived high-stakes is the structural, non-bypassable criterion (v2 §E/
-- F6): entry total >= firms.high_stakes_amount_cents, OR any risk flag set true.
create function clara.is_high_stakes(p_entry uuid) returns boolean
  language sql stable security definer set search_path = clara, pg_temp as $$
  select je.is_opening_balance or je.is_year_end or je.tax_affecting
      or coalesce((select sum(debit_cents) from clara.journal_lines where entry_id = je.id), 0)
         >= f.high_stakes_amount_cents
  from clara.journal_entries je join clara.firms f on f.id = je.firm_id
  where je.id = p_entry;
$$;

create function clara.eligible_checker_count(p_firm uuid) returns int
  language sql stable security definer set search_path = clara, pg_temp as $$
  select count(*)::int from clara.firm_memberships m join clara.users u on u.id = m.user_id
  where m.firm_id = p_firm and m.status = 'active'
    and clara.role_rank(m.role) >= clara.role_rank('bookkeeper') and u.is_agent = false;
$$;

-- Client attribution (invariant 1, CLR01). Only a human/rule resolution at >=0.95,
-- for THIS client, not superseded, satisfies the gate (v2 §D: an 'agent' proposal
-- never self-authorizes). With a document, the resolution must be ABOUT it.
create function clara.assert_client_resolved(p_client uuid, p_resolution uuid, p_document uuid)
  returns void language plpgsql security definer set search_path = clara, pg_temp as $$
begin
  perform 1 from clara.client_resolutions r
   where r.id = p_resolution and r.client_id = p_client
     and r.method in ('human','rule') and r.confidence >= 0.95 and r.superseded_at is null
     and (p_document is null or (r.subject_kind = 'document' and r.subject_id = p_document));
  if not found then
    raise exception 'client attribution not established' using errcode = 'CLR01';
  end if;
end $$;

-- Provenance (invariant 2, CLR02). Exact document + sha + client (v2 §F16).
create function clara.assert_provenance(p_document uuid, p_sha256 text, p_client uuid)
  returns void language plpgsql security definer set search_path = clara, pg_temp as $$
begin
  perform 1 from clara.documents d
   where d.id = p_document and d.sha256 = p_sha256 and d.client_id = p_client;
  if not found then
    raise exception 'provenance not established' using errcode = 'CLR02';
  end if;
end $$;

create function clara.assert_wake_allowed(p_wake_kind text, p_fn text)
  returns void language plpgsql security definer set search_path = clara, pg_temp as $$
begin
  perform 1 from clara.wake_fn_allowlist where wake_kind = p_wake_kind and function_name = p_fn;
  if not found then
    raise exception 'wake kind % may not call %', p_wake_kind, p_fn using errcode = 'CLR03';
  end if;
end $$;

-- =====================================================================
-- B. DUAL-LANE CORES (ungranted). Take an already-resolved (actor, firm).
-- =====================================================================

create function clara._draft_entry_core(p_actor uuid, p_firm uuid, p_obo uuid, p_wake_kind text,
    p_is_human boolean, p_client uuid, p_resolution uuid, p_posting_date date, p_memo text,
    p_lines jsonb, p_document uuid, p_sha256 text, p_flags jsonb, p_op_key text)
  returns jsonb language plpgsql security definer set search_path = clara, pg_temp as $$
declare
  v_dedupe jsonb; v_client_firm uuid; v_origin text; v_entry uuid; v_token uuid;
  v_dr bigint; v_cr bigint; v_n int; v_residual bigint; v_round text;
  v_round_dr bigint := 0; v_round_cr bigint := 0; v_receipt jsonb;
begin
  if p_op_key is null or btrim(p_op_key) = '' then raise exception 'op_key is required' using errcode = 'CLR10'; end if;
  v_dedupe := clara._reserve_op(p_firm, 'draft_entry', p_op_key,
    clara._hash(jsonb_build_object('c', p_client, 'r', p_resolution, 'd', p_posting_date,
      'm', p_memo, 'l', p_lines, 'doc', p_document, 'sha', p_sha256, 'f', p_flags)));
  if v_dedupe is not null then return v_dedupe; end if;

  select firm_id into v_client_firm from clara.clients where id = p_client;
  if v_client_firm is null or v_client_firm <> p_firm then
    raise exception 'client not in your firm' using errcode = 'CLR11';
  end if;

  perform clara.assert_client_resolved(p_client, p_resolution, p_document);

  if (p_document is null) <> (p_sha256 is null) then
    raise exception 'document and sha256 must be both set or both null' using errcode = 'CLR10';
  end if;
  if p_document is not null then perform clara.assert_provenance(p_document, p_sha256, p_client); end if;

  v_origin := case when p_document is not null then 'document'
                   when p_is_human then 'manual' else 'agent' end;
  if p_document is null and (p_memo is null or btrim(p_memo) = '') then
    raise exception 'a non-document entry requires a memo (its basis)' using errcode = 'CLR10';
  end if;

  begin
    select coalesce(sum((e.elem->>'debit_cents')::bigint), 0),
           coalesce(sum((e.elem->>'credit_cents')::bigint), 0), count(*)
      into v_dr, v_cr, v_n from jsonb_array_elements(p_lines) as e(elem);
  exception when others then
    raise exception 'malformed line amounts (cents must be integers)' using errcode = 'CLR10';
  end;
  if v_n < 2 then raise exception 'an entry needs at least two lines' using errcode = 'CLR10'; end if;
  if exists (
    select 1 from jsonb_array_elements(p_lines) as e(elem)
    where not exists (select 1 from clara.coa_accounts a
      where a.client_id = p_client and a.account_code = (e.elem->>'account_code') and a.is_active)
  ) then raise exception 'line codes to a non-existent account' using errcode = 'CLR10'; end if;

  -- Rounding law (PRD invariant 7): 0 fine; 1..5c auto-append a visible rounding
  -- leg so the entry ties EXACTLY; >5c is a real imbalance (CLR07).
  v_residual := abs(v_dr - v_cr);
  if v_residual > 5 then raise exception 'entry is unbalanced by %c', v_residual using errcode = 'CLR07'; end if;
  if v_residual between 1 and 5 then
    select account_code into v_round from clara.coa_accounts
      where client_id = p_client and special_acc_type = 'rounding' and is_active;
    if v_round is null then raise exception 'rounding_account_missing' using errcode = 'CLR10'; end if;
    if v_dr > v_cr then v_round_cr := v_residual; else v_round_dr := v_residual; end if;
  end if;

  insert into clara.journal_entries(client_id, status, posting_date, memo, origin,
      document_id, source_doc_sha256, resolution_id, is_opening_balance, is_year_end,
      tax_affecting, maker_actor, last_human_editor)
  values (p_client, 'draft', p_posting_date, p_memo, v_origin, p_document, p_sha256, p_resolution,
      false,  -- is_opening_balance never trusted from a generic draft (v2 §E)
      coalesce((p_flags->>'is_year_end')::boolean, false),
      coalesce((p_flags->>'tax_affecting')::boolean, false),
      p_actor, case when p_is_human then p_actor end)
  returning id into v_entry;

  insert into clara.journal_lines(entry_id, line_no, account_code, debit_cents, credit_cents, description)
  select v_entry, e.idx, (e.elem->>'account_code'),
         coalesce((e.elem->>'debit_cents')::bigint, 0), coalesce((e.elem->>'credit_cents')::bigint, 0),
         (e.elem->>'description')
  from jsonb_array_elements(p_lines) with ordinality as e(elem, idx);

  if v_round is not null then
    insert into clara.journal_lines(entry_id, line_no, account_code, debit_cents, credit_cents, description)
    values (v_entry, v_n + 1, v_round, v_round_dr, v_round_cr, 'auto rounding');
  end if;

  perform clara._assert_balanced(v_entry);          -- synchronous CLR07 to caller
  select revision_token into v_token from clara.journal_entries where id = v_entry;
  perform clara._audit(p_firm, p_actor, p_obo, p_wake_kind, 'draft_entry', v_entry,
    jsonb_build_object('client', p_client, 'op_key', p_op_key));
  v_receipt := jsonb_build_object('entry_id', v_entry, 'revision_token', v_token, 'status', 'draft');
  return clara._finish_op(p_firm, 'draft_entry', p_op_key, v_receipt);
end $$;

create function clara._record_client_resolution_core(p_actor uuid, p_firm uuid, p_obo uuid,
    p_wake_kind text, p_method text, p_client uuid, p_subject_kind text, p_subject uuid,
    p_confidence numeric, p_evidence jsonb, p_op_key text)
  returns jsonb language plpgsql security definer set search_path = clara, pg_temp as $$
declare v_dedupe jsonb; v_client_firm uuid; v_id uuid;
begin
  if p_op_key is null or btrim(p_op_key) = '' then raise exception 'op_key is required' using errcode = 'CLR10'; end if;
  v_dedupe := clara._reserve_op(p_firm, 'record_client_resolution', p_op_key,
    clara._hash(jsonb_build_object('c', p_client, 'sk', p_subject_kind, 's', p_subject,
      'conf', p_confidence, 'm', p_method, 'e', p_evidence)));
  if v_dedupe is not null then return v_dedupe; end if;

  select firm_id into v_client_firm from clara.clients where id = p_client;
  if v_client_firm is null or v_client_firm <> p_firm then
    raise exception 'client not in your firm' using errcode = 'CLR11';
  end if;
  if p_subject_kind not in ('document','chat_task','manual') then
    raise exception 'bad subject_kind' using errcode = 'CLR10';
  end if;

  insert into clara.client_resolutions(client_id, subject_kind, subject_id, confidence, method, evidence, resolved_by)
  values (p_client, p_subject_kind, p_subject, p_confidence, p_method, coalesce(p_evidence, '{}'::jsonb), p_actor)
  returning id into v_id;
  perform clara._audit(p_firm, p_actor, p_obo, p_wake_kind, 'record_client_resolution', null,
    jsonb_build_object('client', p_client, 'method', p_method, 'op_key', p_op_key));
  return clara._finish_op(p_firm, 'record_client_resolution', p_op_key, jsonb_build_object('resolution_id', v_id));
end $$;

create function clara._ingest_document_core(p_actor uuid, p_firm uuid, p_obo uuid, p_wake_kind text,
    p_client uuid, p_sha256 text, p_filename text, p_mime text, p_bytes bigint,
    p_storage_path text, p_op_key text)
  returns jsonb language plpgsql security definer set search_path = clara, pg_temp as $$
declare v_dedupe jsonb; v_client_firm uuid; v_id uuid;
begin
  if p_op_key is null or btrim(p_op_key) = '' then raise exception 'op_key is required' using errcode = 'CLR10'; end if;
  v_dedupe := clara._reserve_op(p_firm, 'ingest_document', p_op_key,
    clara._hash(jsonb_build_object('c', p_client, 'sha', p_sha256, 'fn', p_filename,
      'mt', p_mime, 'b', p_bytes, 'sp', p_storage_path)));
  if v_dedupe is not null then return v_dedupe; end if;

  if p_client is not null then
    select firm_id into v_client_firm from clara.clients where id = p_client;
    if v_client_firm is null or v_client_firm <> p_firm then
      raise exception 'client not in your firm' using errcode = 'CLR11';
    end if;
  end if;
  if exists (select 1 from clara.documents where firm_id = p_firm and sha256 = p_sha256) then
    raise exception 'document already ingested for this firm' using errcode = 'CLR10';
  end if;

  insert into clara.documents(firm_id, client_id, sha256, original_filename, mime_type, byte_size, storage_path, uploaded_by)
  values (p_firm, p_client, p_sha256, p_filename, p_mime, p_bytes, p_storage_path, p_actor)
  returning id into v_id;
  perform clara._audit(p_firm, p_actor, p_obo, p_wake_kind, 'ingest_document', null,
    jsonb_build_object('client', p_client, 'sha', p_sha256, 'op_key', p_op_key));
  return clara._finish_op(p_firm, 'ingest_document', p_op_key, jsonb_build_object('document_id', v_id));
end $$;

create function clara._record_notification_core(p_actor uuid, p_firm uuid, p_obo uuid,
    p_wake_kind text, p_client uuid, p_kind text, p_payload jsonb, p_op_key text)
  returns jsonb language plpgsql security definer set search_path = clara, pg_temp as $$
declare v_dedupe jsonb; v_client_firm uuid; v_id uuid;
begin
  if p_op_key is null or btrim(p_op_key) = '' then raise exception 'op_key is required' using errcode = 'CLR10'; end if;
  v_dedupe := clara._reserve_op(p_firm, 'record_notification', p_op_key,
    clara._hash(jsonb_build_object('k', p_kind, 'p', p_payload, 'c', p_client)));
  if v_dedupe is not null then return v_dedupe; end if;

  if p_client is not null then
    select firm_id into v_client_firm from clara.clients where id = p_client;
    if v_client_firm is null or v_client_firm <> p_firm then
      raise exception 'client not in your firm' using errcode = 'CLR11';
    end if;
  end if;

  insert into clara.notifications(firm_id, client_id, kind, payload, created_by)
  values (p_firm, p_client, p_kind, coalesce(p_payload, '{}'::jsonb), p_actor)
  returning id into v_id;
  perform clara._audit(p_firm, p_actor, p_obo, p_wake_kind, 'record_notification', null,
    jsonb_build_object('kind', p_kind, 'op_key', p_op_key));
  return clara._finish_op(p_firm, 'record_notification', p_op_key, jsonb_build_object('notification_id', v_id));
end $$;

-- Shared human-lane identity guard. Returns the jwt actor + firm; RAISE CLR04 on
-- no actor / no active membership / below the required rank.
create function clara._human_ctx(p_min_rank int, out actor uuid, out firm uuid)
  language plpgsql stable security definer set search_path = clara, pg_temp as $$
begin
  actor := clara.jwt_sub();
  if actor is null then raise exception 'no authenticated actor' using errcode = 'CLR04'; end if;
  firm := clara.jwt_firm();
  if firm is null then raise exception 'actor has no active membership' using errcode = 'CLR04'; end if;
  if coalesce(clara.actor_role_rank(), -1) < p_min_rank then
    raise exception 'insufficient role' using errcode = 'CLR04';
  end if;
end $$;

-- =====================================================================
-- C. HUMAN ENTRY POINTS (granted to clara_authenticated).
-- =====================================================================

-- create_firm accepts p_op_key for signature stability; its idempotency is the
-- single-use admission token (a retry finds the token consumed -> CLR04), so it
-- does not use op_receipts (documented — like mint/revoke).
create function clara.create_firm(p_name text, p_admission_token uuid, p_op_key text) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare v_actor uuid; v_firm uuid;
begin
  v_actor := clara.jwt_sub();
  if v_actor is null then raise exception 'no authenticated actor' using errcode = 'CLR04'; end if;
  if not exists (select 1 from clara.users where id = v_actor) then
    raise exception 'unknown actor' using errcode = 'CLR04';
  end if;
  if exists (select 1 from clara.users where id = v_actor and is_agent) then
    raise exception 'the agent identity cannot own a firm' using errcode = 'CLR04';   -- HIGH 11
  end if;
  update clara.firm_admissions set consumed_at = now()
    where token = p_admission_token and consumed_at is null;
  if not found then raise exception 'invalid or consumed admission token' using errcode = 'CLR04'; end if;
  if exists (select 1 from clara.firm_memberships where user_id = v_actor and status = 'active') then
    raise exception 'actor already belongs to a firm' using errcode = 'CLR10';
  end if;
  insert into clara.firms(name) values (p_name) returning id into v_firm;
  insert into clara.firm_memberships(firm_id, user_id, role) values (v_firm, v_actor, 'owner');
  perform clara._audit(v_firm, v_actor, null, null, 'create_firm', null,
    jsonb_build_object('name', p_name, 'op_key', p_op_key));
  return jsonb_build_object('firm_id', v_firm);
end $$;

create function clara.create_client(p_name text, p_op_key text) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare c record; v_dedupe jsonb; v_id uuid;
begin
  c := clara._human_ctx(clara.role_rank('admin'));   -- create_client is admin+ (v2 §F/F23)
  if p_op_key is null or btrim(p_op_key) = '' then raise exception 'op_key is required' using errcode = 'CLR10'; end if;
  v_dedupe := clara._reserve_op(c.firm, 'create_client', p_op_key, clara._hash(jsonb_build_object('n', p_name)));
  if v_dedupe is not null then return v_dedupe; end if;
  begin
    -- Pass the validated firm explicitly (v2 §0 hardening) — the stamp trigger
    -- coalesces to it rather than re-deriving from ambient session GUCs.
    insert into clara.clients(firm_id, name) values (c.firm, p_name) returning id into v_id;
  exception when unique_violation then
    raise exception 'a client with that name already exists' using errcode = 'CLR10';
  end;
  perform clara._audit(c.firm, c.actor, null, null, 'create_client', null, jsonb_build_object('name', p_name));
  return clara._finish_op(c.firm, 'create_client', p_op_key, jsonb_build_object('client_id', v_id));
end $$;

-- upsert_account: p_op_key MANDATORY and RESERVED UNCONDITIONALLY (MEDIUM 15 — v2
-- requires an op key for every state-changing writer, upsert_account included; the
-- old null-skips-the-receipt path let a lost-response retry overwrite an intervening
-- rename/type change and produced duplicate audit receipts). The signature keeps the
-- `default null` position for name-stability but the writer RAISEs CLR10 on null.
create function clara.upsert_account(p_client uuid, p_code text, p_name text, p_type text,
    p_special_acc_type text default null, p_op_key text default null) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare c record; v_dedupe jsonb; v_client_firm uuid; v_existing text;
begin
  c := clara._human_ctx(clara.role_rank('bookkeeper'));
  if p_op_key is null or btrim(p_op_key) = '' then raise exception 'op_key is required' using errcode = 'CLR10'; end if;
  v_dedupe := clara._reserve_op(c.firm, 'upsert_account', p_op_key,
    clara._hash(jsonb_build_object('c', p_client, 'code', p_code, 'n', p_name, 't', p_type, 's', p_special_acc_type)));
  if v_dedupe is not null then return v_dedupe; end if;
  select firm_id into v_client_firm from clara.clients where id = p_client;
  if v_client_firm is null or v_client_firm <> c.firm then
    raise exception 'client not in your firm' using errcode = 'CLR11';
  end if;
  select account_type into v_existing from clara.coa_accounts where client_id = p_client and account_code = p_code;
  if v_existing is not null and v_existing <> p_type
     and exists (select 1 from clara.journal_lines where client_id = p_client and account_code = p_code) then
    raise exception 'cannot change the type of an account that has lines' using errcode = 'CLR10';
  end if;
  begin
    insert into clara.coa_accounts(client_id, account_code, name, account_type, special_acc_type)
    values (p_client, p_code, p_name, p_type, p_special_acc_type)
    on conflict (client_id, account_code)
      do update set name = excluded.name, account_type = excluded.account_type,
                    special_acc_type = excluded.special_acc_type, is_active = true;
  exception when unique_violation then
    raise exception 'a rounding account already exists for this client' using errcode = 'CLR10';
  end;
  perform clara._audit(c.firm, c.actor, null, null, 'upsert_account', null,
    jsonb_build_object('client', p_client, 'code', p_code));
  return clara._finish_op(c.firm, 'upsert_account', p_op_key, jsonb_build_object('client_id', p_client, 'account_code', p_code));
end $$;

create function clara.add_member(p_firm uuid, p_user uuid, p_role text, p_op_key text) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare c record; v_dedupe jsonb; v_id uuid;
begin
  c := clara._human_ctx(clara.role_rank('admin'));
  if p_firm is distinct from c.firm then raise exception 'not your firm' using errcode = 'CLR11'; end if;
  if p_op_key is null or btrim(p_op_key) = '' then raise exception 'op_key is required' using errcode = 'CLR10'; end if;
  v_dedupe := clara._reserve_op(c.firm, 'add_member', p_op_key,
    clara._hash(jsonb_build_object('u', p_user, 'r', p_role)));
  if v_dedupe is not null then return v_dedupe; end if;
  perform 1 from clara.firms where id = c.firm for update;                 -- serialize per-firm (v2 §F/F18)
  if clara.role_rank(p_role) is null then raise exception 'bad role' using errcode = 'CLR10'; end if;
  if not exists (select 1 from clara.users where id = p_user) then
    raise exception 'unknown user' using errcode = 'CLR10';
  end if;
  -- The global agent identity can NEVER be a firm member (HIGH 11): otherwise it
  -- could be made an owner and satisfy guard_last_owner, locking every human out.
  if exists (select 1 from clara.users where id = p_user and is_agent) then
    raise exception 'the agent identity cannot be a firm member' using errcode = 'CLR10';
  end if;
  if exists (select 1 from clara.firm_memberships where user_id = p_user and status = 'active') then
    raise exception 'user already belongs to a firm' using errcode = 'CLR10';
  end if;
  insert into clara.firm_memberships(firm_id, user_id, role) values (c.firm, p_user, p_role) returning id into v_id;
  perform clara._audit(c.firm, c.actor, null, null, 'add_member', null, jsonb_build_object('user', p_user, 'role', p_role));
  return clara._finish_op(c.firm, 'add_member', p_op_key, jsonb_build_object('membership_id', v_id));
end $$;

create function clara.set_member_role(p_membership uuid, p_role text, p_op_key text) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare c record; v_dedupe jsonb; m record;
begin
  c := clara._human_ctx(clara.role_rank('admin'));
  if p_op_key is null or btrim(p_op_key) = '' then raise exception 'op_key is required' using errcode = 'CLR10'; end if;
  v_dedupe := clara._reserve_op(c.firm, 'set_member_role', p_op_key,
    clara._hash(jsonb_build_object('mem', p_membership, 'r', p_role)));
  if v_dedupe is not null then return v_dedupe; end if;
  perform 1 from clara.firms where id = c.firm for update;
  if clara.role_rank(p_role) is null then raise exception 'bad role' using errcode = 'CLR10'; end if;
  select * into m from clara.firm_memberships where id = p_membership;
  if not found or m.firm_id <> c.firm then raise exception 'membership not in your firm' using errcode = 'CLR11'; end if;
  -- Only an ACTIVE membership can be re-roled (HIGH 4: operating on a removed
  -- historical membership must not run — otherwise an admin could trip a
  -- credential revocation off a stale cross-firm membership).
  if m.status <> 'active' then raise exception 'membership is not active' using errcode = 'CLR11'; end if;
  update clara.firm_memberships set role = p_role where id = p_membership;  -- guard_last_owner backstops CLR09
  if clara.role_rank(p_role) < clara.role_rank('bookkeeper') then
    -- Revoke ONLY this firm's credentials for the user (HIGH 4: firm_id = c.firm —
    -- never another firm's on-behalf-of credential). Live revalidation in
    -- wake_context() is the backstop for a credential minted after this scan.
    update clara.wake_credentials set revoked_at = statement_timestamp()
      where on_behalf_of = m.user_id and firm_id = c.firm and revoked_at is null;
  end if;
  perform clara._audit(c.firm, c.actor, null, null, 'set_member_role', null, jsonb_build_object('membership', p_membership, 'role', p_role));
  return clara._finish_op(c.firm, 'set_member_role', p_op_key, jsonb_build_object('membership_id', p_membership, 'role', p_role));
end $$;

create function clara.remove_member(p_membership uuid, p_op_key text) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare c record; v_dedupe jsonb; m record;
begin
  c := clara._human_ctx(clara.role_rank('admin'));
  if p_op_key is null or btrim(p_op_key) = '' then raise exception 'op_key is required' using errcode = 'CLR10'; end if;
  v_dedupe := clara._reserve_op(c.firm, 'remove_member', p_op_key, clara._hash(jsonb_build_object('mem', p_membership)));
  if v_dedupe is not null then return v_dedupe; end if;
  perform 1 from clara.firms where id = c.firm for update;
  select * into m from clara.firm_memberships where id = p_membership;
  if not found or m.firm_id <> c.firm then raise exception 'membership not in your firm' using errcode = 'CLR11'; end if;
  -- Only an ACTIVE membership can be removed (HIGH 4: a removed historical
  -- membership must not re-fire a credential revocation on a later admin action).
  if m.status <> 'active' then raise exception 'membership is not active' using errcode = 'CLR11'; end if;
  update clara.firm_memberships set status = 'removed', removed_at = now()
    where id = p_membership and status = 'active';                         -- guard_last_owner backstops CLR09
  -- Revoke ONLY this firm's credentials for the user (HIGH 4: firm_id = c.firm).
  update clara.wake_credentials set revoked_at = statement_timestamp()
    where on_behalf_of = m.user_id and firm_id = c.firm and revoked_at is null;
  perform clara._audit(c.firm, c.actor, null, null, 'remove_member', null, jsonb_build_object('membership', p_membership));
  return clara._finish_op(c.firm, 'remove_member', p_op_key, jsonb_build_object('membership_id', p_membership, 'status', 'removed'));
end $$;

create function clara.ingest_document(p_client uuid, p_sha256 text, p_filename text, p_mime text,
    p_bytes bigint, p_storage_path text, p_op_key text) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare c record;
begin
  c := clara._human_ctx(clara.role_rank('bookkeeper'));
  return clara._ingest_document_core(c.actor, c.firm, null, null, p_client, p_sha256, p_filename, p_mime, p_bytes, p_storage_path, p_op_key);
end $$;

-- HUMAN entry stamps method='human' regardless of p_method (advisory — v2 §D).
create function clara.record_client_resolution(p_client uuid, p_subject_kind text, p_subject uuid,
    p_confidence numeric, p_method text, p_evidence jsonb, p_op_key text) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare c record;
begin
  c := clara._human_ctx(clara.role_rank('bookkeeper'));
  return clara._record_client_resolution_core(c.actor, c.firm, null, null, 'human', p_client, p_subject_kind, p_subject, p_confidence, p_evidence, p_op_key);
end $$;

create function clara.draft_entry(p_client uuid, p_resolution uuid, p_posting_date date, p_memo text,
    p_lines jsonb, p_document uuid default null, p_sha256 text default null,
    p_flags jsonb default '{}', p_op_key text default null) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare c record;
begin
  c := clara._human_ctx(clara.role_rank('bookkeeper'));
  return clara._draft_entry_core(c.actor, c.firm, null, null, true, p_client, p_resolution, p_posting_date, p_memo, p_lines, p_document, p_sha256, p_flags, p_op_key);
end $$;

create function clara.record_notification(p_kind text, p_payload jsonb, p_client uuid default null,
    p_op_key text default null) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare c record;
begin
  c := clara._human_ctx(clara.role_rank('bookkeeper'));
  return clara._record_notification_core(c.actor, c.firm, null, null, p_client, p_kind, p_payload, p_op_key);
end $$;

-- approve_entry / reverse_entry — HUMAN bookkeeper+ ONLY. No wake variant exists.
create function clara.approve_entry(p_entry uuid, p_expected_revision uuid,
    p_attestation text default null, p_op_key text default null) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare c record; v_dedupe jsonb; e record; v_attest text;
begin
  c := clara._human_ctx(clara.role_rank('bookkeeper'));
  if p_op_key is null or btrim(p_op_key) = '' then raise exception 'op_key is required' using errcode = 'CLR10'; end if;
  v_dedupe := clara._reserve_op(c.firm, 'approve_entry', p_op_key,
    clara._hash(jsonb_build_object('e', p_entry, 'rev', p_expected_revision, 'att', p_attestation)));
  if v_dedupe is not null then return v_dedupe; end if;
  select * into e from clara.journal_entries where id = p_entry for update;
  if not found or e.firm_id <> c.firm then raise exception 'entry not in your firm' using errcode = 'CLR11'; end if;
  if e.status <> 'draft' then raise exception 'entry is not a draft' using errcode = 'CLR10'; end if;
  if e.revision_token <> p_expected_revision then raise exception 'stale revision token' using errcode = 'CLR06'; end if;
  -- A governed CLR10 (not a raw 23505 from uq_je_one_approved_reversal) when another
  -- draft mirror of the same original was already approved (v2 §E/F14 allows multiple
  -- abandoned draft mirrors; only one may become the APPROVED reversal).
  if e.reversal_of is not null and exists (
    select 1 from clara.journal_entries r
    where r.reversal_of = e.reversal_of and r.status = 'approved' and r.id <> p_entry) then
    raise exception 'the original was already reversed by an approved reversal' using errcode = 'CLR10';
  end if;
  if clara.is_high_stakes(p_entry) and e.last_human_editor is not null and e.last_human_editor = c.actor then
    if clara.eligible_checker_count(c.firm) >= 2 then
      raise exception 'high-stakes entry needs a distinct checker' using errcode = 'CLR05';
    elsif p_attestation is null or btrim(p_attestation) = '' then
      raise exception 'solo high-stakes approval requires an attestation' using errcode = 'CLR05';
    else v_attest := p_attestation; end if;
  end if;
  update clara.journal_entries set status = 'approved', checker_actor = c.actor,
    approved_at = now(), self_approval_attestation = v_attest, updated_at = now() where id = p_entry;
  if e.reversal_of is not null then                                        -- linkage on approval (v2 §E/F14)
    perform 1 from clara.journal_entries where id = e.reversal_of for update;
    update clara.journal_entries set reversed_by = p_entry,
      reversal_reason = coalesce(e.reversal_reason, 'reversal'), updated_at = now()
      where id = e.reversal_of and reversed_by is null;
  end if;
  perform clara._audit(c.firm, c.actor, null, null, 'approve_entry', p_entry, jsonb_build_object('op_key', p_op_key));
  return clara._finish_op(c.firm, 'approve_entry', p_op_key, jsonb_build_object('entry_id', p_entry, 'status', 'approved'));
end $$;

create function clara.reverse_entry(p_entry uuid, p_reason text, p_op_key text) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare c record; v_dedupe jsonb; o record; v_mirror uuid; v_status text;
begin
  c := clara._human_ctx(clara.role_rank('bookkeeper'));
  if p_op_key is null or btrim(p_op_key) = '' then raise exception 'op_key is required' using errcode = 'CLR10'; end if;
  v_dedupe := clara._reserve_op(c.firm, 'reverse_entry', p_op_key,
    clara._hash(jsonb_build_object('e', p_entry, 'reason', p_reason)));
  if v_dedupe is not null then return v_dedupe; end if;
  select * into o from clara.journal_entries where id = p_entry for update;
  if not found or o.firm_id <> c.firm then raise exception 'entry not in your firm' using errcode = 'CLR11'; end if;
  if o.status <> 'approved' then raise exception 'only an approved entry can be reversed' using errcode = 'CLR10'; end if;
  if o.reversal_of is not null then raise exception 'cannot reverse a reversal' using errcode = 'CLR10'; end if;
  if o.reversed_by is not null then raise exception 'entry already reversed' using errcode = 'CLR10'; end if;
  if p_reason is null or btrim(p_reason) = '' then raise exception 'a reversal reason is required' using errcode = 'CLR10'; end if;

  insert into clara.journal_entries(client_id, status, posting_date, memo, origin, resolution_id,
      is_opening_balance, is_year_end, tax_affecting, maker_actor, last_human_editor, reversal_of, reversal_reason)
  values (o.client_id, 'draft', current_date, 'Reversal: ' || p_reason, 'reversal', o.resolution_id,
      o.is_opening_balance, o.is_year_end, o.tax_affecting, c.actor, c.actor, p_entry, p_reason)
  returning id into v_mirror;
  insert into clara.journal_lines(entry_id, line_no, account_code, debit_cents, credit_cents, description)
  select v_mirror, line_no, account_code, credit_cents, debit_cents, description
  from clara.journal_lines where entry_id = p_entry;
  perform clara._assert_balanced(v_mirror);

  if clara.is_high_stakes(v_mirror) then
    v_status := 'draft';                                                   -- needs a distinct approver
  else
    update clara.journal_entries set status = 'approved', checker_actor = c.actor,
      approved_at = now(), updated_at = now() where id = v_mirror;
    update clara.journal_entries set reversed_by = v_mirror, reversal_reason = p_reason, updated_at = now()
      where id = p_entry;
    v_status := 'approved';
  end if;
  perform clara._audit(c.firm, c.actor, null, null, 'reverse_entry', v_mirror, jsonb_build_object('original', p_entry, 'op_key', p_op_key));
  return clara._finish_op(c.firm, 'reverse_entry', p_op_key, jsonb_build_object('reversal_id', v_mirror, 'status', v_status));
end $$;

-- =====================================================================
-- D. WAKE ENTRY POINTS (granted to the wake role(s) ONLY). Actor is ALWAYS the
--    global agent user; on_behalf_of is an audit annotation only (v2 §C).
--
--    SCOPE BOUNDARIES (documented, NOT overclaimed):
--    * HIGH 12: wake client-scoped writes (wake_ingest_document / wake_record_
--      notification) are gated to the credential's firm but NOT to an audited client
--      RESOLUTION — an interactive wake may attach a doc/notification to any
--      SAME-FIRM client, and the wake-supplied sha256 is an unverified anchor. The
--      BOOKS stay protected: a draft citing that doc re-validates via
--      assert_client_resolved (needs a human/rule resolution ≥0.95) + assert_provenance
--      at post time. The unassigned lane + sha↔bytes verification are Slice 5.
--    * MEDIUM 18: wake_draft_entry accepts caller-supplied balanced amounts; SQL
--      proves balance/account/document identity but not that the numbers were DERIVED
--      from the source (no OCR until Slice 5). The narrowed law: an agent draft
--      becomes authoritative ONLY after exact-revision human approval (maker/checker +
--      revision token) — the agent never SIGNS, and never posts a figure unreviewed.
-- =====================================================================
create function clara.wake_draft_entry(p_client uuid, p_resolution uuid, p_posting_date date, p_memo text,
    p_lines jsonb, p_document uuid default null, p_sha256 text default null,
    p_flags jsonb default '{}', p_op_key text default null) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare w record;
begin
  select * into w from clara.wake_context();
  if w.credential_id is null then raise exception 'no valid wake credential' using errcode = 'CLR03'; end if;
  perform clara.assert_wake_allowed(w.wake_kind, 'wake_draft_entry');
  return clara._draft_entry_core(clara.agent_user_id(), w.firm_id, w.on_behalf_of, w.wake_kind, false,
    p_client, p_resolution, p_posting_date, p_memo, p_lines, p_document, p_sha256, p_flags, p_op_key);
end $$;

create function clara.wake_record_client_resolution(p_client uuid, p_subject_kind text, p_subject uuid,
    p_confidence numeric, p_method text, p_evidence jsonb, p_op_key text) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare w record;
begin
  select * into w from clara.wake_context();
  if w.credential_id is null then raise exception 'no valid wake credential' using errcode = 'CLR03'; end if;
  perform clara.assert_wake_allowed(w.wake_kind, 'wake_record_client_resolution');
  return clara._record_client_resolution_core(clara.agent_user_id(), w.firm_id, w.on_behalf_of, w.wake_kind,
    'agent', p_client, p_subject_kind, p_subject, p_confidence, p_evidence, p_op_key);
end $$;

create function clara.wake_ingest_document(p_client uuid, p_sha256 text, p_filename text, p_mime text,
    p_bytes bigint, p_storage_path text, p_op_key text) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare w record;
begin
  select * into w from clara.wake_context();
  if w.credential_id is null then raise exception 'no valid wake credential' using errcode = 'CLR03'; end if;
  perform clara.assert_wake_allowed(w.wake_kind, 'wake_ingest_document');
  return clara._ingest_document_core(clara.agent_user_id(), w.firm_id, w.on_behalf_of, w.wake_kind,
    p_client, p_sha256, p_filename, p_mime, p_bytes, p_storage_path, p_op_key);
end $$;

create function clara.wake_record_notification(p_kind text, p_payload jsonb, p_client uuid default null,
    p_op_key text default null) returns jsonb
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare w record; v_is_replay boolean;
begin
  -- Resolve the credential IGNORING consumed_at (see _wake_cred_full): a single-use
  -- proactive credential that already recorded its one notification must still be able
  -- to REPLAY that receipt for an idempotent op_key retry after a lost response — while
  -- a genuinely FRESH op on a consumed credential is rejected (single-use, v2 §C/F8).
  select * into w from clara._wake_cred_full();
  if w.credential_id is null then raise exception 'no valid wake credential' using errcode = 'CLR03'; end if;
  perform clara.assert_wake_allowed(w.wake_kind, 'wake_record_notification');
  v_is_replay := p_op_key is not null and exists (
    select 1 from clara.op_receipts where firm_id = w.firm_id and fn = 'record_notification' and op_key = p_op_key);
  -- CONSUME FIRST for a FRESH proactive op (HIGH 2): an atomic conditional UPDATE
  -- takes the row lock, so two concurrent txns cannot both write a notification —
  -- the loser's `where consumed_at is null` matches 0 rows after the winner commits,
  -- raises CLR03, and rolls back its whole txn (notification + audit + receipt).
  -- This MUST precede the core so the effect never outlives a lost single-use race.
  -- A REPLAY must NOT consume — it just replays the stored receipt below.
  if not v_is_replay and w.wake_kind = 'proactive' then
    update clara.wake_credentials set consumed_at = statement_timestamp()
      where id = w.credential_id and consumed_at is null;
    if not found then raise exception 'proactive credential already used' using errcode = 'CLR03'; end if;
  end if;
  -- The core replays (with its request-hash check → CLR10 on a mismatch) or does the work.
  return clara._record_notification_core(clara.agent_user_id(), w.firm_id, w.on_behalf_of, w.wake_kind,
    p_client, p_kind, p_payload, p_op_key);
end $$;

-- =====================================================================
-- E. RUNTIME CREDENTIAL MINT/REVOKE (clara_runtime only; no op_key — v2 §C).
-- =====================================================================
create function clara.mint_wake_credential(p_wake_kind text, p_firm uuid,
    p_on_behalf_of uuid default null, p_ttl interval default '15 minutes')
  returns table(credential_id uuid, secret text)
  language plpgsql security definer set search_path = clara, pg_temp as $$
declare v_secret text; v_id uuid;
begin
  if p_wake_kind not in ('interactive','proactive') then raise exception 'bad wake_kind' using errcode = 'CLR10'; end if;
  if not exists (select 1 from clara.firms where id = p_firm) then raise exception 'unknown firm' using errcode = 'CLR10'; end if;
  if p_on_behalf_of is not null and not exists (
      select 1 from clara.firm_memberships where user_id = p_on_behalf_of and firm_id = p_firm
        and status = 'active' and clara.role_rank(role) >= clara.role_rank('bookkeeper'))
  then raise exception 'on_behalf_of must be an active bookkeeper+ of the firm' using errcode = 'CLR10'; end if;
  v_secret := gen_random_uuid()::text || gen_random_uuid()::text;
  insert into clara.wake_credentials(wake_kind, firm_id, on_behalf_of, secret_hash, expires_at)
  values (p_wake_kind, p_firm, p_on_behalf_of, sha256(convert_to(v_secret, 'UTF8')), statement_timestamp() + p_ttl)
  returning id into v_id;
  return query select v_id, v_secret;
end $$;

create function clara.revoke_wake_credential(p_credential uuid) returns void
  language plpgsql security definer set search_path = clara, pg_temp as $$
begin
  update clara.wake_credentials set revoked_at = statement_timestamp() where id = p_credential and revoked_at is null;
end $$;

-- =====================================================================
-- F. READ FUNCTIONS (SECURITY INVOKER — RLS scopes to the caller's firm).
--    "The DB owns every number": trial_balance sums in SQL, not the app.
-- =====================================================================
create function clara.get_journal_entry(p_entry uuid) returns jsonb
  language sql stable security invoker set search_path = clara, pg_temp as $$
  select jsonb_build_object('entry', to_jsonb(je),
    'lines', coalesce((select jsonb_agg(to_jsonb(jl) order by jl.line_no)
                       from clara.journal_lines jl where jl.entry_id = je.id), '[]'::jsonb))
  from clara.journal_entries je where je.id = p_entry;
$$;

create function clara.list_journal_entries(p_client uuid, p_limit int default 50) returns setof jsonb
  language sql stable security invoker set search_path = clara, pg_temp as $$
  select to_jsonb(je) from clara.journal_entries je where je.client_id = p_client
  order by je.posting_date desc, je.created_at desc limit greatest(p_limit, 0);
$$;

create function clara.trial_balance(p_client uuid)
  returns table(account_code text, name text, debit_cents bigint, credit_cents bigint)
  language sql stable security invoker set search_path = clara, pg_temp as $$
  select a.account_code, a.name,
    coalesce(sum(jl.debit_cents) filter (where je.status = 'approved'), 0)::bigint,
    coalesce(sum(jl.credit_cents) filter (where je.status = 'approved'), 0)::bigint
  from clara.coa_accounts a
  left join clara.journal_lines jl on jl.client_id = a.client_id and jl.account_code = a.account_code
  left join clara.journal_entries je on je.id = jl.entry_id
  where a.client_id = p_client
  group by a.account_code, a.name order by a.account_code;
$$;

-- =====================================================================
-- G. PUBLIC LOCKDOWN + EXECUTE GRANT MATRIX (design §5, v2 §B). Empirically:
--    the explicit REVOKE-from-PUBLIC is load-bearing (the ADP alone does NOT stop
--    an unprivileged role); an RLS policy also requires the QUERYING role to hold
--    EXECUTE on any function it references — so the policy-referenced resolvers
--    (jwt_sub/jwt_firm/wake_firm/shares_my_firm_*/actor_role_rank) are granted here.
--    The genuinely internal helpers (assert_*, _*_core, wake_context, is_high_stakes,
--    eligible_checker_count, _reserve_op, ...) stay ungranted (rig T17).
-- =====================================================================
alter default privileges for role clara_fn_owner in schema clara revoke execute on functions from public;
revoke execute on all functions in schema clara from public;

-- policy-referenced resolvers + convenience accessors. role_rank(text) is a pure
-- IMMUTABLE rank map with no data access — the audit_log RLS policy calls it
-- directly (COALESCE(actor_role_rank(),-1) >= role_rank('bookkeeper')), so the app
-- role evaluating that policy needs EXECUTE on it, else a raw audit_log SELECT
-- fails with "permission denied for function role_rank".
grant execute on function clara.jwt_sub(), clara.jwt_firm(), clara.actor_role_rank(),
  clara.role_rank(text), clara.shares_my_firm_human(uuid) to clara_authenticated;
grant execute on function clara.wake_firm(), clara.shares_my_firm_wake(uuid) to clara_agent_ro;
grant execute on function clara.current_actor_id(), clara.actor_firm_id() to
  clara_authenticated, clara_agent_ro, clara_wake_interactive, clara_wake_proactive, clara_runtime;

-- human writers
grant execute on function
  clara.create_firm(text, uuid, text),
  clara.create_client(text, text),
  clara.upsert_account(uuid, text, text, text, text, text),
  clara.add_member(uuid, uuid, text, text),
  clara.set_member_role(uuid, text, text),
  clara.remove_member(uuid, text),
  clara.ingest_document(uuid, text, text, text, bigint, text, text),
  clara.record_client_resolution(uuid, text, uuid, numeric, text, jsonb, text),
  clara.draft_entry(uuid, uuid, date, text, jsonb, uuid, text, jsonb, text),
  clara.approve_entry(uuid, uuid, text, text),
  clara.reverse_entry(uuid, text, text),
  clara.record_notification(text, jsonb, uuid, text)
  to clara_authenticated;

-- wake writers
grant execute on function
  clara.wake_draft_entry(uuid, uuid, date, text, jsonb, uuid, text, jsonb, text),
  clara.wake_record_client_resolution(uuid, text, uuid, numeric, text, jsonb, text),
  clara.wake_ingest_document(uuid, text, text, text, bigint, text, text),
  clara.wake_record_notification(text, jsonb, uuid, text)
  to clara_wake_interactive;
grant execute on function clara.wake_record_notification(text, jsonb, uuid, text) to clara_wake_proactive;

-- runtime
grant execute on function clara.mint_wake_credential(text, uuid, uuid, interval),
  clara.revoke_wake_credential(uuid) to clara_runtime;

-- reads
grant execute on function clara.get_journal_entry(uuid), clara.list_journal_entries(uuid, int),
  clara.trial_balance(uuid) to clara_authenticated, clara_agent_ro;

reset role;
